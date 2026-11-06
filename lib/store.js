/**
 * Durable, local-first storage for the memo page.
 *
 * The state file is the source of truth on this machine. Every note carries
 * the revision that last wrote it (`revBy`) plus the revision this machine has
 * already pushed to the mailbox (`syncedRev`), which is enough to merge two
 * offline-first writers without a server-side clock:
 *
 *   compare (updatedAt, revBy) — newer wins, identical means already merged.
 */
import { mkdir, readFile, rename, writeFile, chmod } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import path from 'node:path'

export const TEXT_LIMIT = 20000
export const NOTE_LIMIT = 5000
export const STATE_VERSION = 3

const ACTIVE = 0
const MAX_CLOCK = 4102444800000 // 2100-01-01
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/
const FORBIDDEN_IDS = new Set(['__proto__', 'constructor', 'prototype'])

export class MemoStore {
  constructor({ file, legacyFile, now = () => Date.now() }) {
    this.file = file
    this.legacyFile = legacyFile
    this.now = now
    this.state = null
    this.syncing = false
    this.chain = Promise.resolve()
    this.importedLegacy = 0
  }

  async load() {
    await this._enqueue(async () => {
      if (this.state) return
      let parsed = null
      try {
        parsed = JSON.parse(await readFile(this.file, 'utf8'))
      } catch (error) {
        if (!error || error.code !== 'ENOENT') throw error
      }

      if (parsed && typeof parsed === 'object') {
        this.state = normalizeState(parsed, this.now)
        await this._save()
        return
      }

      this.state = createState(this.now)
      this.importedLegacy = await this._importLegacy()
      await this._save()
    })
    return this.state
  }

  async snapshot() {
    await this.load()
    return this._publicState()
  }

  get version() {
    return this.state ? this.state.sequence : 0
  }

  async addNote(text) {
    return this._enqueue(async () => {
      const clean = cleanText(text)
      if (!clean) throw new MemoError('EMPTY', '笔记内容不能为空')
      const stamp = this._stamp()
      const note = {
        id: randomUUID(),
        text: clean,
        createdAt: stamp.updatedAt,
        updatedAt: stamp.updatedAt,
        revBy: this.state.deviceId,
        deleted: false,
        syncedRev: null,
      }
      this.state.notes[note.id] = note
      this._trimNotes()
      this._touch()
      await this._save()
      return publicNote(note)
    })
  }

  async updateNote(id, text) {
    return this._enqueue(async () => {
      const note = this._activeNote(id)
      const clean = cleanText(text)
      if (!clean) throw new MemoError('EMPTY', '笔记内容不能为空')
      if (clean === note.text) return publicNote(note)
      const stamp = this._stamp()
      note.text = clean
      note.updatedAt = stamp.updatedAt
      note.revBy = this.state.deviceId
      this._touch()
      await this._save()
      return publicNote(note)
    })
  }

  async deleteNote(id) {
    return this._enqueue(async () => {
      const note = this._activeNote(id)
      const stamp = this._stamp()
      note.deleted = true
      note.updatedAt = stamp.updatedAt
      note.revBy = this.state.deviceId
      note.text = note.text.slice(0, 2000)
      this._touch()
      await this._save()
      return { id, deleted: true }
    })
  }

  /** A note restored from a newer remote revision. */
  mergeRemote(payload) {
    if (!payload || payload.kind !== 'note') return ACTIVE
    const id = typeof payload.id === 'string' ? payload.id.trim() : ''
    if (!isSafeId(id)) return ACTIVE
    const updatedAt = finiteTime(payload.updatedAt)
    if (!updatedAt) return ACTIVE
    const createdAt = finiteTime(payload.createdAt) || updatedAt
    const revBy = safeLabel(payload.revBy) || 'unknown'
    const text = typeof payload.text === 'string' ? payload.text.slice(0, TEXT_LIMIT) : ''
    const deleted = payload.deleted === true
    const remote = { id, text, createdAt, updatedAt, revBy, deleted, syncedRev: revision(updatedAt, revBy) }
    this.state.lastStamp = Math.max(this.state.lastStamp, updatedAt)
    const current = this.state.notes[id]

    if (!current) {
      this.state.notes[id] = remote
      this._touch()
      return 1
    }
    const order = compareRevisions(remote, current)
    if (order > 0) {
      this.state.notes[id] = remote
      this._touch()
      return 1
    }
    if (order === 0 && current.syncedRev !== remote.syncedRev) {
      current.syncedRev = remote.syncedRev
      this._touch()
      return 1
    }
    return ACTIVE
  }

  async applyRemoteRecords(records, { uidValidity, lastUid }) {
    return this._enqueue(async () => {
      let changed = 0
      for (const payload of records) changed += this.mergeRemote(payload)
      this._advanceCursor(uidValidity, lastUid)
      if (changed > 0) this._trimNotes()
      this._touch()
      await this._save()
      return changed
    })
  }

  async finishSync({ uidValidity, lastUid, lastSyncAt, error = null }) {
    return this._enqueue(async () => {
      this._advanceCursor(uidValidity, lastUid)
      if (!error) this.state.sync.lastSyncAt = lastSyncAt || this.now()
      this.state.sync.lastError = error ? String(error).slice(0, 500) : null
      this._touch()
      await this._save()
    })
  }

  async beginSync() {
    this.syncing = true
    this._touch()
  }

  async endSync() {
    this.syncing = false
    this._touch()
  }

  async setAccount(account) {
    return this._enqueue(async () => {
      const key = accountKey(account)
      const previous = this.state.sync.lastAccountKey
      if (!previous || previous !== key) {
        // A different mailbox (or the first one) means this machine's notes
        // have not been pushed there yet; clear per-mailbox push markers.
        for (const note of Object.values(this.state.notes)) note.syncedRev = null
      }
      this.state.sync.lastAccountKey = key
      this.state.sync.account = account
      this.state.sync.uidValidity = null
      this.state.sync.lastUid = 0
      this.state.sync.lastError = null
      this._touch()
      await this._save()
    })
  }

  async clearAccount() {
    return this._enqueue(async () => {
      this.state.sync.account = null
      this.state.sync.uidValidity = null
      this.state.sync.lastUid = 0
      this.state.sync.lastError = null
      this._touch()
      await this._save()
    })
  }

  async pendingNotes(limit = 50) {
    await this.load()
    const pending = []
    for (const note of Object.values(this.state.notes)) {
      if (note.syncedRev !== revision(note.updatedAt, note.revBy)) pending.push(note)
      if (pending.length >= limit) break
    }
    pending.sort((left, right) => left.updatedAt - right.updatedAt)
    return pending.map((note) => ({ ...note }))
  }

  async pendingCount() {
    await this.load()
    let count = 0
    for (const note of Object.values(this.state.notes)) {
      if (note.syncedRev !== revision(note.updatedAt, note.revBy)) count += 1
    }
    return count
  }

  async markSynced(id, pushedRev) {
    return this._enqueue(async () => {
      const note = this.state.notes[id]
      if (note && revision(note.updatedAt, note.revBy) === pushedRev) note.syncedRev = pushedRev
      this._touch()
      await this._save()
    })
  }

  async cursor() {
    await this.load()
    return {
      uidValidity: this.state.sync.uidValidity,
      lastUid: this.state.sync.lastUid,
      account: this.state.sync.account,
    }
  }

  async setRuntimeError(message) {
    return this._enqueue(async () => {
      this.state.sync.lastError = message ? String(message).slice(0, 500) : null
      this._touch()
      await this._save()
    })
  }

  async _enqueue(operation) {
    const run = this.chain.then(operation, operation)
    this.chain = run.catch(() => undefined)
    return run
  }

  _stamp() {
    const previous = this.state.lastStamp || 0
    const updatedAt = Math.max(this.now(), previous + 1)
    this.state.lastStamp = updatedAt
    return { updatedAt }
  }

  _touch() {
    this.state.sequence += 1
    this.state.updatedAt = this.now()
  }

  _activeNote(id) {
    const note = this.state.notes[id]
    if (!note || note.deleted) throw new MemoError('NOT_FOUND', '这条笔记不存在')
    return note
  }

  _advanceCursor(uidValidity, lastUid) {
    const sync = this.state.sync
    if (uidValidity && sync.uidValidity !== uidValidity) {
      sync.uidValidity = uidValidity
      sync.lastUid = 0
    }
    if (Number.isInteger(lastUid) && lastUid > sync.lastUid) sync.lastUid = lastUid
  }

  _trimNotes() {
    const entries = Object.values(this.state.notes)
    if (entries.length <= NOTE_LIMIT) return
    entries
      .filter((note) => note.deleted)
      .sort((left, right) => left.updatedAt - right.updatedAt)
      .slice(0, entries.length - NOTE_LIMIT)
      .forEach((note) => {
        delete this.state.notes[note.id]
      })
  }

  _publicState() {
    const notes = Object.values(this.state.notes)
      .filter((note) => !note.deleted)
      .sort((left, right) => right.createdAt - left.createdAt || right.updatedAt - left.updatedAt)
      .map(publicNote)
    let pending = 0
    for (const note of Object.values(this.state.notes)) {
      if (note.syncedRev !== revision(note.updatedAt, note.revBy)) pending += 1
    }
    return {
      version: this.state.sequence,
      notes,
      pending,
      syncing: this.syncing,
      account: this.state.sync.account
        ? {
            email: this.state.sync.account.email,
            folder: this.state.sync.account.folder,
            host: this.state.sync.account.host,
            port: this.state.sync.account.port,
            secure: this.state.sync.account.secure,
            connectedAt: this.state.sync.account.connectedAt,
          }
        : null,
      sync: {
        configured: Boolean(this.state.sync.account),
        lastSyncAt: this.state.sync.lastSyncAt,
        lastError: this.state.sync.lastError,
      },
    }
  }

  async _importLegacy() {
    if (!this.legacyFile) return 0
    try {
      const parsed = JSON.parse(await readFile(this.legacyFile, 'utf8'))
      const list = Array.isArray(parsed && parsed.notes) ? parsed.notes : []
      let count = 0
      for (const item of list.slice(0, NOTE_LIMIT)) {
        if (!item || typeof item !== 'object') continue
        const id = typeof item.id === 'string' && isSafeId(item.id) ? item.id : randomUUID()
        const createdAt = finiteTime(item.createdAt) || this.now()
        const updatedAt = finiteTime(item.updatedAt) || createdAt
        const text = typeof item.text === 'string' ? item.text.slice(0, TEXT_LIMIT) : ''
        if (!text.trim()) continue
        this.state.notes[id] = {
          id,
          text,
          createdAt,
          updatedAt,
          revBy: this.state.deviceId,
          deleted: false,
          syncedRev: null,
        }
        this.state.lastStamp = Math.max(this.state.lastStamp, updatedAt)
        count += 1
      }
      return count
    } catch {
      return 0
    }
  }

  async _save() {
    const file = this.file
    const temporary = `${file}.${process.pid}.${this.now()}.tmp`
    const document = JSON.stringify(this.state, null, 2)
    await mkdir(path.dirname(file), { recursive: true, mode: 0o700 })
    await writeFile(temporary, document, { encoding: 'utf8', mode: 0o600 })
    await rename(temporary, file)
    try {
      await chmod(file, 0o600)
    } catch {
      /* best-effort on filesystems without POSIX permissions */
    }
  }
}

export class MemoError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'MemoError'
    this.code = code
  }
}

export function revision(updatedAt, revBy) {
  return `${updatedAt}:${revBy}`
}

export function compareRevisions(left, right) {
  if (left.updatedAt !== right.updatedAt) return left.updatedAt - right.updatedAt
  return String(left.revBy).localeCompare(String(right.revBy))
}

function normalizeState(parsed, now) {
  const state = createState(now)
  state.deviceId = typeof parsed.deviceId === 'string' && ID_PATTERN.test(parsed.deviceId) ? parsed.deviceId : state.deviceId
  state.sequence = Number.isInteger(parsed.sequence) && parsed.sequence > 0 ? parsed.sequence : 0
  state.lastStamp = finiteTime(parsed.lastStamp) || 0
  const sync = parsed.sync && typeof parsed.sync === 'object' ? parsed.sync : {}
  state.sync.account = normalizeAccount(sync.account)
  state.sync.lastAccountKey =
    typeof sync.lastAccountKey === 'string'
      ? sync.lastAccountKey
      : state.sync.account
        ? accountKey(state.sync.account)
        : null
  state.sync.uidValidity = sync.uidValidity ? String(sync.uidValidity) : null
  state.sync.lastUid = Number.isInteger(sync.lastUid) && sync.lastUid > 0 ? sync.lastUid : 0
  state.sync.lastSyncAt = finiteTime(sync.lastSyncAt) || 0
  state.sync.lastError = typeof sync.lastError === 'string' ? sync.lastError.slice(0, 500) : null
  const notes = parsed.notes && typeof parsed.notes === 'object' ? parsed.notes : {}
  for (const note of Object.values(notes)) {
    if (!note || typeof note !== 'object') continue
    const id = typeof note.id === 'string' ? note.id : ''
    if (!isSafeId(id)) continue
    const updatedAt = finiteTime(note.updatedAt)
    if (!updatedAt) continue
    const createdAt = finiteTime(note.createdAt) || updatedAt
    const revBy = safeLabel(note.revBy) || state.deviceId
    state.notes[id] = {
      id,
      text: typeof note.text === 'string' ? note.text.slice(0, TEXT_LIMIT) : '',
      createdAt,
      updatedAt,
      revBy,
      deleted: note.deleted === true,
      syncedRev: typeof note.syncedRev === 'string' ? note.syncedRev : null,
    }
    state.lastStamp = Math.max(state.lastStamp, updatedAt)
  }
  return state
}

function createState(now) {
  return {
    version: STATE_VERSION,
    deviceId: randomUUID(),
    sequence: 0,
    lastStamp: 0,
    updatedAt: now(),
    notes: {},
    sync: {
      account: null,
      lastAccountKey: null,
      uidValidity: null,
      lastUid: 0,
      lastSyncAt: 0,
      lastError: null,
    },
  }
}

function normalizeAccount(account) {
  if (!account || typeof account !== 'object') return null
  if (typeof account.email !== 'string' || !account.email.includes('@')) return null
  return {
    email: account.email.trim().slice(0, 200),
    host: String(account.host || '').trim().slice(0, 200),
    port: Number(account.port) || 993,
    secure: account.secure !== false,
    folder: String(account.folder || 'DSH Notes').trim().slice(0, 100) || 'DSH Notes',
    connectedAt: finiteTime(account.connectedAt) || Date.now(),
  }
}

function accountKey(account) {
  return `${account.email}|${account.folder}`
}

function publicNote(note) {
  return {
    id: note.id,
    text: note.text,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
  }
}

function cleanText(value) {
  return String(value == null ? '' : value)
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim()
    .slice(0, TEXT_LIMIT)
}

function isSafeId(value) {
  return typeof value === 'string' && ID_PATTERN.test(value) && !FORBIDDEN_IDS.has(value)
}

function safeLabel(value) {
  const text = String(value == null ? '' : value).trim()
  if (!text) return ''
  const cleaned = text.replace(/[^A-Za-z0-9._:-]/g, '').slice(0, 80)
  return FORBIDDEN_IDS.has(cleaned) ? '' : cleaned
}

function finiteTime(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && value < MAX_CLOCK
    ? Math.floor(value)
    : 0
}
