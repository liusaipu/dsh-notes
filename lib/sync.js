/**
 * Mailbox transport for the memo page.
 *
 * The mailbox folder is an append-only log. Each local revision is appended
 * once; every machine reads the whole folder (incrementally by UID) and folds
 * revisions with (updatedAt, device) last-write-wins. No server, account
 * database or relay is involved: the user's own IMAP mailbox is the shared
 * storage, and IMAP credentials double as the account verification.
 */
import { randomBytes } from 'node:crypto'
import { ImapClient, ImapError } from './imap.js'
import { buildNoteMessage, buildVerifyMessage, parseMemoMessage } from './mime.js'
import { revision } from './store.js'

export const PASSWORD_REF = 'DSH_FLOMO_IMAP_PASSWORD'
export const DEFAULT_FOLDER = 'DSH Notes'
export const MAX_FETCH_PER_RUN = 300
export const MAX_PUSH_PER_RUN = 40

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const FOLDER_PATTERN = /^[\x20-\x7E]{1,80}$/

export class SyncEngine {
  constructor({ store, images, credentials, log = () => {} }) {
    this.store = store
    this.images = images
    this.credentials = credentials
    this.log = log
    this.running = null
    this.timer = null
    this.debounce = null
    this.stopped = false
    this.debug = Boolean(process.env.DSH_FLOMO_DEBUG)
  }

  start() {
    this.stopped = false
    if (!this.timer) {
      this.timer = setInterval(() => {
        void this.run('interval')
      }, 120000)
      if (typeof this.timer.unref === 'function') this.timer.unref()
    }
    void this.run('startup')
  }

  stop() {
    this.stopped = true
    if (this.timer) clearInterval(this.timer)
    if (this.debounce) clearTimeout(this.debounce)
    this.timer = null
    this.debounce = null
  }

  /** Coalesce several edits into one mailbox round trip. */
  schedule(delay = 3500) {
    if (this.stopped) return
    if (this.debounce) clearTimeout(this.debounce)
    this.debounce = setTimeout(() => {
      this.debounce = null
      void this.run('local-change')
    }, delay)
    if (typeof this.debounce.unref === 'function') this.debounce.unref()
  }

  async run(reason = 'manual') {
    if (this.stopped) return { ok: false, error: 'stopped' }
    if (this.running) return { ok: false, alreadyRunning: true }
    const task = this.sync(reason)
      .then((result) => ({ ok: true, ...result }))
      .catch((error) => {
        this.log(`sync failed (${reason}): ${error && error.message ? error.message : error}`)
        return { ok: false, error: friendlyError(error) }
      })
      .finally(() => {
        this.running = null
      })
    this.running = task
    return task
  }

  async verifyAccount(input) {
    const account = normalizeAccount(input)
    const password = String(input && input.password ? input.password : '')
    if (!password) throw new SyncError('AUTH_INPUT', '请输入邮箱应用专用密码')
    await this.store.load()
    const client = new ImapClient({
      host: account.host,
      port: account.port,
      secure: account.secure,
      timeout: 30000,
      debug: this.debug,
    })
    const code = randomBytes(16).toString('hex')
    let appendedUid = null
    try {
      await client.connect()
      await client.login(account.email, password)
      await client.ensureMailbox(account.folder)
      await client.select(account.folder)
      const raw = buildVerifyMessage({
        email: account.email,
        code,
        deviceId: this.store.state.deviceId,
      })
      const appended = await client.append(account.folder, raw)
      appendedUid = appended.uid
      let messages = []
      if (appendedUid) messages = await client.fetchMessages([appendedUid])
      if (messages.length === 0) {
        const uids = await client.searchUidsSince(0)
        messages = await client.fetchMessages(uids.slice(-10))
      }
      const matched = messages.some((message) => {
        const payload = parseMemoMessage(message.raw)
        return payload && payload.kind === 'verify' && payload.code === code
      })
      if (!matched) {
        throw new SyncError('VERIFY_FAILED', '邮箱写入成功，但未能读回验证邮件，请稍后重试')
      }
      await client.deleteUid(appendedUid)
    } finally {
      await client.logout()
    }

    await this._setPassword(password)
    await this.store.setAccount({
      email: account.email,
      host: account.host,
      port: account.port,
      secure: account.secure,
      folder: account.folder,
      connectedAt: Date.now(),
    })
    this.schedule(200)
    return {
      email: account.email,
      host: account.host,
      port: account.port,
      secure: account.secure,
      folder: account.folder,
    }
  }

  async disconnect() {
    try {
      await this.credentials.unset(PASSWORD_REF)
    } catch {
      /* the record may already be gone */
    }
    await this.store.clearAccount()
  }

  async sync(reason = 'manual') {
    await this.store.load()
    const cursor = await this.store.cursor()
    if (!cursor.account) return { skipped: true }
    if (this.stopped) return { skipped: true }

    const password = await this._readPassword()
    if (!password) {
      await this.store.finishSync({ error: '邮箱密码未保存，请重新连接邮箱' })
      throw new SyncError('AUTH_MISSING', '邮箱密码未保存，请重新连接邮箱')
    }

    await this.store.beginSync()
    const client = new ImapClient({
      host: cursor.account.host,
      port: cursor.account.port,
      secure: cursor.account.secure,
      timeout: 30000,
      debug: this.debug,
    })
    let lastUid = cursor.lastUid
    let uidValidity = cursor.uidValidity
    try {
      await client.connect()
      await client.login(cursor.account.email, password)
      await client.ensureMailbox(cursor.account.folder)
      const selected = await client.select(cursor.account.folder)
      if (selected.uidValidity && uidValidity && selected.uidValidity !== uidValidity) {
        lastUid = 0
      }
      if (selected.uidValidity) uidValidity = selected.uidValidity

      const found = await client.searchUidsSince(lastUid)
      const toFetch = found.slice(0, MAX_FETCH_PER_RUN)
      let fetchedMax = lastUid
      if (toFetch.length > 0) {
        for (let index = 0; index < toFetch.length; index += 40) {
          const batch = toFetch.slice(index, index + 40)
          const messages = await client.fetchMessages(batch)
          const records = []
          for (const message of messages) {
            const payload = parseMemoMessage(message.raw)
            if (!payload || payload.kind !== 'note') continue
            if (this.images && Array.isArray(payload.images) && payload.images.length > 0) {
              await this.images.unpack(payload.images)
            }
            records.push(payload)
          }
          await this.store.applyRemoteRecords(records, {
            uidValidity,
            lastUid: batch[batch.length - 1],
          })
          fetchedMax = Math.max(fetchedMax, batch[batch.length - 1])
        }
      } else if (uidValidity) {
        await this.store.applyRemoteRecords([], { uidValidity, lastUid })
      }

      const pending = await this.store.pendingNotes(MAX_PUSH_PER_RUN)
      let pushedImages = 0
      for (const note of pending) {
        const pushedRev = revision(note.updatedAt, note.revBy)
        const images = this.images && !note.deleted ? await this.images.pack(note.text) : []
        const raw = buildNoteMessage({
          note,
          email: cursor.account.email,
          deviceId: this.store.state.deviceId,
          images,
        })
        await client.append(cursor.account.folder, raw)
        await this.store.markSynced(note.id, pushedRev)
        pushedImages += images.length
      }

      // Never advance the cursor past the highest UID we searched. A remote
      // append can land between our SEARCH and our own APPEND; refetching our
      // own message next time is harmless, skipping that remote one is not.
      await this.store.finishSync({
        uidValidity,
        lastUid: fetchedMax,
        lastSyncAt: Date.now(),
      })
      if (toFetch.length > 0 || pending.length > 0) {
        this.log(
          `sync ok (${reason}): fetched=${toFetch.length} pushed=${pending.length}` +
            (pushedImages > 0 ? ` images=${pushedImages}` : ''),
        )
      }
      return { fetched: toFetch.length, pushed: pending.length }
    } catch (error) {
      await this.store.finishSync({ error: friendlyError(error) })
      throw error
    } finally {
      await this.store.endSync()
      await client.logout()
    }
  }

  async _readPassword() {
    try {
      const resolved = await this.credentials.resolve(PASSWORD_REF)
      return resolved && resolved.value ? resolved.value : ''
    } catch {
      return ''
    }
  }

  async _setPassword(password) {
    await this.credentials.set(PASSWORD_REF, password)
  }
}

export class SyncError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'SyncError'
    this.code = code
  }
}

export function normalizeAccount(input) {
  const email = String((input && input.email) || '').trim().toLowerCase()
  if (!EMAIL_PATTERN.test(email)) throw new SyncError('EMAIL_INVALID', '请输入有效的邮箱地址')
  const folder = String((input && input.folder) || DEFAULT_FOLDER).trim() || DEFAULT_FOLDER
  if (!FOLDER_PATTERN.test(folder)) {
    throw new SyncError('FOLDER_INVALID', '邮箱文件夹名只能包含英文字母、数字、空格和常见符号')
  }
  const hostInput = String((input && input.host) || '').trim()
  const host = hostInput
    ? hostInput.replace(/^imaps?:\/\//i, '').replace(/\/.*$/, '').replace(/:\d+$/, '')
    : guessHost(email)
  if (!/^[a-z0-9.-]+$/i.test(host)) throw new SyncError('HOST_INVALID', '邮件服务器地址格式不正确')
  const port = Number(input && input.port) || 993
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new SyncError('PORT_INVALID', '邮件服务器端口不正确')
  }
  return {
    email,
    host,
    port,
    secure: !(input && input.secure === false),
    folder,
  }
}

export function guessHost(email) {
  const domain = String(email).split('@').pop().toLowerCase()
  if (domain === 'gmail.com' || domain === 'googlemail.com') return 'imap.gmail.com'
  if (domain === 'icloud.com' || domain === 'me.com' || domain === 'mac.com') return 'imap.mail.me.com'
  if (domain === 'qq.com' || domain === 'foxmail.com' || domain === 'vip.qq.com') return 'imap.qq.com'
  if (domain === '163.com' || domain === '126.com' || domain === 'yeah.net') return 'imap.163.com'
  if (domain === 'sina.com' || domain === 'vip.sina.com') return 'imap.sina.com'
  if (domain === '139.com') return 'imap.139.com'
  if (domain === 'aliyun.com') return 'imap.aliyun.com'
  if (domain === 'outlook.com' || domain === 'hotmail.com' || domain === 'live.com') {
    return 'outlook.office365.com'
  }
  return `imap.${domain}`
}

export function friendlyError(error) {
  if (!error) return '未知错误'
  if (error instanceof ImapError) return error.message || '邮件连接失败'
  if (error instanceof SyncError) return error.message
  if (error && error.code === 'ENOTFOUND') return '找不到邮件服务器'
  return error.message || String(error)
}
