/**
 * Notebook registry and one-time migration.
 *
 * A notebook is a local identity (`default` or an 8-character id) plus a
 * display name and the credential reference used by its mailbox. The mailbox
 * itself lives in that notebook's state.json, so every existing single-memo
 * file becomes one notebook unchanged.
 */
import {
  chmod,
  copyFile,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import path from 'node:path'

export const REGISTRY_VERSION = 1
export const MAX_NOTEBOOKS = 20
export const DEFAULT_NOTEBOOK_ID = 'default'
export const DEFAULT_NOTEBOOK_NAME = '我的笔记'
export const LEGACY_PASSWORD_REF = 'DSH_FLOMO_IMAP_PASSWORD'

const ID_PATTERN = /^[a-z0-9]{8}$/
const NAME_LIMIT = 32

export class NotebookError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'NotebookError'
    this.code = code
  }
}

export class NotebookRegistry {
  constructor({ root, now = () => Date.now() }) {
    this.root = root
    this.notebooksDir = path.join(root, 'notebooks')
    this.registryFile = path.join(root, 'notebooks.json')
    this.now = now
    this.registry = null
    this.loading = null
    this.chain = Promise.resolve()
  }

  get activeId() {
    return this.registry ? this.registry.activeId : ''
  }

  async load() {
    if (this.registry) return this.registry
    if (!this.loading) {
      this.loading = this._load().finally(() => {
        this.loading = null
      })
    }
    return this.loading
  }

  async list() {
    await this.load()
    return this.registry.notebooks.map(publicEntry)
  }

  async entry(id) {
    await this.load()
    const found = this.registry.notebooks.find((item) => item.id === id)
    if (!found) throw new NotebookError('NOTEBOOK_NOT_FOUND', '笔记本不存在')
    return {
      ...publicEntry(found),
      dir: path.join(this.notebooksDir, found.id),
    }
  }

  async create(name) {
    const clean = cleanName(name)
    await this.load()
    return this._enqueue(async () => {
      if (this.registry.notebooks.length >= MAX_NOTEBOOKS) {
        throw new NotebookError('NOTEBOOK_LIMIT', `最多只能创建 ${MAX_NOTEBOOKS} 个笔记本`)
      }
      let id = randomId()
      while (this.registry.notebooks.some((item) => item.id === id)) id = randomId()
      const entry = {
        id,
        name: clean,
        createdAt: this.now(),
        passwordRef: passwordRefFor(id),
      }
      const dir = path.join(this.notebooksDir, id)
      await mkdir(dir, { recursive: true, mode: 0o700 })
      this.registry.notebooks.push(entry)
      this.registry.activeId = id
      try {
        await this._save()
      } catch (error) {
        this.registry.notebooks = this.registry.notebooks.filter((item) => item.id !== id)
        this.registry.activeId = this.registry.notebooks[0] ? this.registry.notebooks[0].id : ''
        await rm(dir, { recursive: true, force: true }).catch(() => undefined)
        throw error
      }
      return { ...publicEntry(entry), dir }
    })
  }

  async rename(id, name) {
    const clean = cleanName(name)
    await this.load()
    return this._enqueue(async () => {
      const found = this._find(id)
      found.name = clean
      await this._save()
      return publicEntry(found)
    })
  }

  async remove(id) {
    await this.load()
    return this._enqueue(async () => {
      const found = this._find(id)
      if (this.registry.notebooks.length <= 1) {
        throw new NotebookError('NOTEBOOK_LAST', '至少保留一个笔记本')
      }
      this.registry.notebooks = this.registry.notebooks.filter((item) => item.id !== id)
      if (this.registry.activeId === id) {
        this.registry.activeId = this.registry.notebooks[0].id
      }
      await this._save()
      return { ...publicEntry(found), dir: path.join(this.notebooksDir, found.id) }
    })
  }

  async setActive(id) {
    await this.load()
    return this._enqueue(async () => {
      this._find(id)
      this.registry.activeId = id
      await this._save()
      return id
    })
  }

  async _load() {
    await mkdir(this.root, { recursive: true, mode: 0o700 })
    await mkdir(this.notebooksDir, { recursive: true, mode: 0o700 })

    let parsed = null
    try {
      parsed = JSON.parse(await readFile(this.registryFile, 'utf8'))
    } catch (error) {
      if (!error || error.code !== 'ENOENT') throw error
    }

    if (parsed) {
      this.registry = normalizeRegistry(parsed, this.now)
      await this._ensureDirectories()
      await this._save()
      return this.registry
    }

    if (await exists(path.join(this.root, 'state.json'))) {
      await this._migrateLegacy()
      return this.registry
    }

    this.registry = freshRegistry(this.now)
    await this._ensureDirectories()
    await this._save()
    return this.registry
  }

  async _migrateLegacy() {
    const legacyState = path.join(this.root, 'state.json')
    const legacyImages = path.join(this.root, 'images')
    const stamp = `${process.pid}-${randomBytes(4).toString('hex')}`
    const stage = path.join(this.notebooksDir, `.migrating-${stamp}`)
    const stageBook = path.join(stage, 'default')
    const stageImages = path.join(stageBook, 'images')
    const finalBook = path.join(this.notebooksDir, 'default')

    try {
      await mkdir(stageImages, { recursive: true, mode: 0o700 })
      await copyFile(legacyState, path.join(stageBook, 'state.json'))
      try {
        const files = await readdir(legacyImages, { withFileTypes: true })
        for (const file of files) {
          if (file.isFile()) {
            await copyFile(path.join(legacyImages, file.name), path.join(stageImages, file.name))
          }
        }
      } catch (error) {
        if (!error || error.code !== 'ENOENT') throw error
      }

      const registry = {
        version: REGISTRY_VERSION,
        activeId: DEFAULT_NOTEBOOK_ID,
        notebooks: [
          {
            id: DEFAULT_NOTEBOOK_ID,
            name: DEFAULT_NOTEBOOK_NAME,
            createdAt: this.now(),
            passwordRef: LEGACY_PASSWORD_REF,
          },
        ],
      }
      await writeJson(path.join(stage, 'notebooks.json'), registry)

      // A previous interrupted migration may have left notebooks/default
      // behind. The legacy state is still the source of truth, so replacing
      // that incomplete copy is safe.
      await rm(finalBook, { recursive: true, force: true })
      await rename(stageBook, finalBook)
      // This rename is the commit point: before it, the old single-notebook
      // state is untouched; after it, the registry points at the migrated copy.
      await rename(path.join(stage, 'notebooks.json'), this.registryFile)
      this.registry = registry

      await rm(legacyState, { force: true }).catch(() => undefined)
      await rm(legacyImages, { recursive: true, force: true }).catch(() => undefined)
    } catch (error) {
      // Before the registry commit the legacy files are still intact. Remove
      // this attempt's staging directory and leave the old state for a retry.
      await rm(stage, { recursive: true, force: true }).catch(() => undefined)
      throw error
    } finally {
      await rm(stage, { recursive: true, force: true }).catch(() => undefined)
    }
  }

  async _ensureDirectories() {
    for (const entry of this.registry.notebooks) {
      await mkdir(path.join(this.notebooksDir, entry.id), { recursive: true, mode: 0o700 })
    }
  }

  async _save() {
    await mkdir(this.root, { recursive: true, mode: 0o700 })
    await writeJson(this.registryFile, this.registry)
  }

  _find(id) {
    const found = this.registry.notebooks.find((item) => item.id === id)
    if (!found) throw new NotebookError('NOTEBOOK_NOT_FOUND', '笔记本不存在')
    return found
  }

  async _enqueue(operation) {
    const run = this.chain.then(operation, operation)
    this.chain = run.catch(() => undefined)
    return run
  }
}

function normalizeRegistry(parsed, now) {
  const list = Array.isArray(parsed && parsed.notebooks) ? parsed.notebooks : []
  const seen = new Set()
  const notebooks = []
  for (const item of list) {
    if (!item || typeof item !== 'object') continue
    const id = item.id === DEFAULT_NOTEBOOK_ID ? DEFAULT_NOTEBOOK_ID : String(item.id || '')
    if (!isValidId(id) || seen.has(id)) continue
    seen.add(id)
    notebooks.push({
      id,
      name: safeName(item.name) || DEFAULT_NOTEBOOK_NAME,
      createdAt: finiteTime(item.createdAt) || now(),
      passwordRef: String(item.passwordRef || passwordRefFor(id)).slice(0, 200),
    })
  }
  if (notebooks.length === 0) return freshRegistry(now)
  const requested = typeof parsed.activeId === 'string' ? parsed.activeId : ''
  const activeId = notebooks.some((item) => item.id === requested) ? requested : notebooks[0].id
  return { version: REGISTRY_VERSION, activeId, notebooks }
}

function freshRegistry(now) {
  return {
    version: REGISTRY_VERSION,
    activeId: DEFAULT_NOTEBOOK_ID,
    notebooks: [
      {
        id: DEFAULT_NOTEBOOK_ID,
        name: DEFAULT_NOTEBOOK_NAME,
        createdAt: now(),
        passwordRef: LEGACY_PASSWORD_REF,
      },
    ],
  }
}

function publicEntry(entry) {
  return {
    id: entry.id,
    name: entry.name,
    createdAt: entry.createdAt,
    passwordRef: entry.passwordRef,
  }
}

function passwordRefFor(id) {
  return id === DEFAULT_NOTEBOOK_ID
    ? LEGACY_PASSWORD_REF
    : `DSH_FLOMO_IMAP_PASSWORD_${id.toUpperCase()}`
}

function randomId() {
  return randomBytes(4).toString('hex')
}

function isValidId(id) {
  return id === DEFAULT_NOTEBOOK_ID || ID_PATTERN.test(id)
}

function cleanName(value) {
  const name = String(value == null ? '' : value)
    .replace(/[\r\n\t]+/g, ' ')
    .trim()
  if (!name) throw new NotebookError('NOTEBOOK_NAME', '笔记本名称不能为空')
  if ([...name].length > NAME_LIMIT) {
    throw new NotebookError('NOTEBOOK_NAME', `笔记本名称不能超过 ${NAME_LIMIT} 个字符`)
  }
  if (/[\u0000-\u001f\u007f]/.test(name)) {
    throw new NotebookError('NOTEBOOK_NAME', '笔记本名称包含非法字符')
  }
  return name
}

function safeName(value) {
  try {
    return cleanName(value)
  } catch {
    return ''
  }
}

function finiteTime(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0
}

async function exists(file) {
  try {
    await stat(file)
    return true
  } catch {
    return false
  }
}

async function writeJson(file, value) {
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`
  await writeFile(temporary, JSON.stringify(value, null, 2), { encoding: 'utf8', mode: 0o600 })
  await rename(temporary, file)
  try {
    await chmod(file, 0o600)
  } catch {
    /* best-effort on filesystems without POSIX permissions */
  }
}
