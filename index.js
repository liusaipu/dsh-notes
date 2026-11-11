/**
 * Host half of the Quick Memo bundle.
 *
 * Owns the notebook registry, one local memo file per notebook, the HTTP
 * endpoint the page talks to, and the optional IMAP sync loop for each
 * notebook. Browser code never touches the filesystem or the mailbox password:
 * it posts an action, the Host validates, persists and schedules the mailbox
 * append.
 */
import os from 'node:os'
import path from 'node:path'
import { rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { MemoError, MemoStore } from './lib/store.js'
import { ImageError, ImageStore } from './lib/images.js'
import { NotebookError, NotebookRegistry } from './lib/notebooks.js'
import { SyncEngine, SyncError, friendlyError } from './lib/sync.js'

const ROUTE_PATH = '/flomo/api'
const IMAGE_ROUTE_PATH = '/flomo/api/image'
const MAX_BODY_BYTES = 12 * 1024 * 1024

const requireFromHere = createRequire(import.meta.url)
let manifest = {}
try {
  manifest = requireFromHere('./package.json')
} catch {
  /* keep the fallback About values */
}
const author = manifest.author
const ABOUT = {
  name: manifest.name || 'dsh-quicknotes',
  version: manifest.version || '0.0.0',
  developer: typeof author === 'string' ? author : (author && author.name) || 'liusaipu',
  updatedAt:
    (manifest.dsh && manifest.dsh.about && manifest.dsh.about.updatedAt) || '2026-11-10',
  repository: 'https://github.com/liusaipu/dsh-quicknotes',
  license: manifest.license || 'MIT',
}

export const inject = ['webServer', 'credentials']

export function apply(ctx) {
  const root = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
  const storageRoot = path.join(root, 'storages', 'flomo')
  const registry = new NotebookRegistry({ root: storageRoot })
  const books = new Map()
  const startTimers = new Map()
  let accountSerial = Promise.resolve()
  const legacyFile = path.join(root, 'storages', 'notes-wall.json')

  function logFor(name, message) {
    try {
      console.log(`[flomo:${name}] ${message}`)
    } catch {
      /* logging must never fail the plugin */
    }
  }

  async function bookFor(id) {
    if (books.has(id)) return books.get(id)
    const entry = await registry.entry(id)
    const store = new MemoStore({
      file: path.join(entry.dir, 'state.json'),
      legacyFile: entry.id === 'default' ? legacyFile : undefined,
    })
    const images = new ImageStore({ dir: path.join(entry.dir, 'images') })
    const engine = new SyncEngine({
      store,
      images,
      credentials: ctx.credentials,
      passwordRef: entry.passwordRef,
      log: (message) => logFor(entry.name, message),
    })
    await store.load()
    const book = { entry, store, images, engine }
    books.set(id, book)
    return book
  }

  function startBook(book, delay = 0) {
    if (delay <= 0) {
      book.engine.start()
      return
    }
    const id = book.entry.id
    const timer = setTimeout(() => {
      startTimers.delete(id)
      book.engine.start()
    }, delay)
    if (typeof timer.unref === 'function') timer.unref()
    startTimers.set(id, timer)
  }

  async function summaryFor(entry) {
    try {
      const book = await bookFor(entry.id)
      const state = await book.store.snapshot()
      return {
        id: entry.id,
        name: book.entry.name,
        configured: Boolean(state.account),
        pending: Number(state.pending) || 0,
        syncing: Boolean(state.syncing),
        lastSyncAt: (state.sync && state.sync.lastSyncAt) || 0,
        lastError: (state.sync && state.sync.lastError) || null,
      }
    } catch (error) {
      return {
        id: entry.id,
        name: entry.name,
        configured: false,
        pending: 0,
        syncing: false,
        lastSyncAt: 0,
        lastError: friendlyError(error),
      }
    }
  }

  async function currentState(notebookId) {
    await ready
    const id = String(notebookId || registry.activeId || '')
    const book = await bookFor(id)
    const publicState = await book.store.snapshot()
    const summaries = []
    for (const entry of await registry.list()) summaries.push(await summaryFor(entry))
    return {
      ok: true,
      about: ABOUT,
      active: id,
      notebook: { id, name: book.entry.name },
      notebooks: summaries,
      ...publicState,
    }
  }

  async function assertEmailAvailable(targetId, value) {
    const email = String(value || '').trim().toLowerCase()
    if (!email) return
    for (const entry of await registry.list()) {
      if (entry.id === targetId) continue
      try {
        const other = await bookFor(entry.id)
        const account = other.store.state && other.store.state.sync.account
        if (account && String(account.email || '').trim().toLowerCase() === email) {
          throw new NotebookError(
            'MAILBOX_CONFLICT',
            `该邮箱已绑定「${entry.name}」，一个邮箱只能用于一个笔记本`,
          )
        }
      } catch (error) {
        if (error instanceof NotebookError) throw error
        logFor(entry.name, `could not check mailbox conflict: ${error.message || error}`)
      }
    }
  }

  function serialAccount(operation) {
    const run = accountSerial.then(operation, operation)
    accountSerial = run.catch(() => undefined)
    return run
  }

  function requestedNotebook(req, body) {
    const fromBody =
      body && typeof body.notebook === 'string' && body.notebook.trim() ? body.notebook.trim() : ''
    const fromQuery = new URL(req.url || '/', 'http://localhost').searchParams.get('notebook')
    return fromBody || (fromQuery && fromQuery.trim()) || registry.activeId || ''
  }

  async function initialize() {
    await registry.load()
    const entries = await registry.list()
    for (const entry of entries) {
      try {
        await bookFor(entry.id)
      } catch (error) {
        logFor(entry.name, `failed to load notebook: ${error.message || error}`)
      }
    }
    // Many mail providers, especially QQ and 163, dislike a burst of parallel
    // IMAP sessions. Start one notebook at a time; the UI is usable while the
    // remaining engines come up.
    let index = 0
    for (const entry of entries) {
      const book = books.get(entry.id)
      if (!book) continue
      startBook(book, index * 1500)
      index += 1
    }
  }

  const ready = initialize().catch((error) => {
    console.error(`[flomo] failed to initialize notebooks: ${error && error.message ? error.message : error}`)
    throw error
  })

  async function handle(req, res) {
    try {
      if (!sameOrigin(req, ctx.webServer)) return sendJson(res, 403, { ok: false, error: 'forbidden origin' })
      if (req.method === 'GET') {
        await ready
        return sendJson(res, 200, await currentState(requestedNotebook(req, null)))
      }
      if (req.method !== 'POST') {
        res.setHeader('allow', 'GET, POST')
        return sendJson(res, 405, { ok: false, error: 'method not allowed' })
      }
      let body
      try {
        body = await readJson(req)
      } catch (error) {
        return sendJson(res, 400, { ok: false, error: error.message || 'invalid JSON body' })
      }
      const action = body && typeof body.action === 'string' ? body.action : ''
      await ready

      if (action === 'createNotebook') {
        const entry = await registry.create(body.name)
        const book = await bookFor(entry.id)
        startBook(book)
        return sendJson(res, 200, await currentState(entry.id))
      }

      const target = requestedNotebook(req, body)
      const book = await bookFor(target)

      if (action === 'renameNotebook') {
        const renamed = await registry.rename(target, body.name)
        book.entry.name = renamed.name
        return sendJson(res, 200, await currentState(target))
      }
      if (action === 'deleteNotebook') {
        const entries = await registry.list()
        if (entries.length <= 1) throw new NotebookError('NOTEBOOK_LAST', '至少保留一个笔记本')
        const pendingStart = startTimers.get(target)
        if (pendingStart) {
          clearTimeout(pendingStart)
          startTimers.delete(target)
        }
        book.engine.stop()
        if (book.engine.running) {
          await Promise.race([
            book.engine.running.catch(() => undefined),
            new Promise((resolve) => setTimeout(resolve, 5000)),
          ])
        }
        const removed = await registry.remove(target)
        try {
          await ctx.credentials.unset(removed.passwordRef)
        } catch {
          /* the credential may already be gone */
        }
        books.delete(target)
        if (book.engine.running) {
          logFor(removed.name, 'sync was still running; leaving the directory in place')
        } else {
          await rm(removed.dir, { recursive: true, force: true }).catch((error) => {
            logFor(removed.name, `could not remove notebook directory: ${error.message || error}`)
          })
        }
        return sendJson(res, 200, await currentState(registry.activeId))
      }
      if (action === 'setActive') {
        await registry.setActive(target)
        return sendJson(res, 200, await currentState(target))
      }

      if (action === 'uploadImage') {
        const saved = await book.images.saveFromBase64({
          mime: body.mime,
          data: body.data,
        })
        return sendJson(res, 200, { ok: true, notebook: target, ...saved })
      }
      if (action === 'create') {
        await book.store.addNote(body.text)
        book.engine.schedule()
        return sendJson(res, 200, await currentState(target))
      }
      if (action === 'update') {
        await book.store.updateNote(String(body.id || ''), body.text)
        book.engine.schedule()
        return sendJson(res, 200, await currentState(target))
      }
      if (action === 'delete') {
        await book.store.deleteNote(String(body.id || ''))
        book.engine.schedule()
        return sendJson(res, 200, await currentState(target))
      }
      if (action === 'account') {
        return await serialAccount(async () => {
          await assertEmailAvailable(target, body.email)
          await book.engine.verifyAccount(body)
          return sendJson(res, 200, await currentState(target))
        })
      }
      if (action === 'disconnect') {
        await book.engine.disconnect()
        return sendJson(res, 200, await currentState(target))
      }
      if (action === 'sync') {
        void book.engine.run('manual')
        return sendJson(res, 200, { ...(await currentState(target)), started: true })
      }
      return sendJson(res, 400, { ok: false, error: 'unknown action' })
    } catch (error) {
      const code = error && error.code ? String(error.code) : 'ERROR'
      const status =
        code === 'NOTEBOOK_NOT_FOUND'
          ? 404
          : error instanceof MemoError ||
              error instanceof SyncError ||
              error instanceof ImageError ||
              error instanceof NotebookError
            ? 400
            : 500
      return sendJson(res, status, {
        ok: false,
        code,
        error: friendlyError(error),
      })
    }
  }

  async function handleImage(req, res) {
    try {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.setHeader('allow', 'GET, HEAD')
        return endText(res, 405, 'method not allowed')
      }
      await ready
      const pathname = new URL(req.url || '/', 'http://localhost').pathname
      const rest = pathname.slice(IMAGE_ROUTE_PATH.length).replace(/^\/+/, '')
      let parts
      try {
        parts = rest.split('/').filter(Boolean).map((part) => decodeURIComponent(part))
      } catch {
        return endText(res, 404, 'image not found', { 'cache-control': 'no-store' })
      }
      let notebookId
      let imageId
      if (parts.length === 2) {
        ;[notebookId, imageId] = parts
      } else if (parts.length === 1) {
        // Old links used only the image id. Keep them working against the
        // active notebook while the page migrates to the per-notebook route.
        notebookId = registry.activeId
        imageId = parts[0]
      } else {
        return endText(res, 404, 'image not found', { 'cache-control': 'no-store' })
      }
      const book = await bookFor(notebookId).catch(() => null)
      if (!book) return endText(res, 404, 'image not found', { 'cache-control': 'no-store' })
      const found = await book.images.read(imageId)
      if (!found) return endText(res, 404, 'image not found', { 'cache-control': 'no-store' })
      res.writeHead(200, {
        'content-type': found.mime,
        'content-length': found.buffer.length,
        'cache-control': 'private, max-age=31536000, immutable',
        'x-content-type-options': 'nosniff',
      })
      res.end(req.method === 'HEAD' ? undefined : found.buffer)
    } catch {
      return endText(res, 404, 'image not found', { 'cache-control': 'no-store' })
    }
  }

  ctx.effect(
    () => ctx.webServer.register({ kind: 'exact', path: ROUTE_PATH, handler: handle }),
    'flomo-notes:api',
  )
  ctx.effect(
    () => ctx.webServer.register({ kind: 'prefix', path: IMAGE_ROUTE_PATH, handler: handleImage }),
    'flomo-notes:image',
  )
  ctx.effect(
    () => () => {
      for (const timer of startTimers.values()) clearTimeout(timer)
      startTimers.clear()
      for (const book of books.values()) book.engine.stop()
    },
    'flomo-notes:sync',
  )
}

function sameOrigin(req, webServer) {
  const origin = req.headers.origin
  if (!origin) return true
  let expected
  try {
    expected = new URL(webServer.getOrigin())
  } catch {
    return false
  }
  try {
    const given = new URL(origin)
    if (given.origin === expected.origin) return true
    const loopback = (host) => host === '127.0.0.1' || host === 'localhost' || host === '[::1]'
    return (
      given.protocol === expected.protocol &&
      given.port === expected.port &&
      loopback(given.hostname) &&
      loopback(expected.hostname)
    )
  } catch {
    return false
  }
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        reject(new Error('请求内容过大'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'))
      } catch {
        reject(new Error('请求内容不是有效的 JSON'))
      }
    })
    req.on('error', reject)
  })
}

function sendJson(res, status, value) {
  const body = JSON.stringify(value)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  })
  res.end(body)
}

function endText(res, status, text, headers = {}) {
  res.writeHead(status, {
    'content-type': 'text/plain; charset=utf-8',
    'x-content-type-options': 'nosniff',
    ...headers,
  })
  res.end(text)
}
