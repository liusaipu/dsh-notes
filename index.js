/**
 * Host half of the Quick Memo bundle.
 *
 * Owns the local memo file, the single HTTP endpoint the page talks to, and
 * the optional IMAP sync loop. Browser code never touches the filesystem or
 * the mailbox password: it posts an action, the Host validates, persists and
 * schedules the mailbox append.
 */
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { MemoError, MemoStore } from './lib/store.js'
import { ImageError, ImageStore } from './lib/images.js'
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
  name: manifest.name || 'dsh-notes',
  version: manifest.version || '0.0.0',
  developer: typeof author === 'string' ? author : (author && author.name) || 'liusaipu',
  updatedAt:
    (manifest.dsh && manifest.dsh.about && manifest.dsh.about.updatedAt) || '2026-11-10',
  repository: 'https://github.com/liusaipu/dsh-notes',
  license: manifest.license || 'MIT',
}

export const inject = ['webServer', 'credentials']

export function apply(ctx) {
  const root = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
  const store = new MemoStore({
    file: path.join(root, 'storages', 'flomo', 'state.json'),
    legacyFile: path.join(root, 'storages', 'notes-wall.json'),
  })
  const images = new ImageStore({
    dir: path.join(root, 'storages', 'flomo', 'images'),
  })
  const engine = new SyncEngine({
    store,
    images,
    credentials: ctx.credentials,
    log: (message) => {
      try {
        console.log(`[flomo] ${message}`)
      } catch {
        /* logging must never fail the plugin */
      }
    },
  })

  const ready = store
    .load()
    .then(() => {
      engine.start()
      if (store.importedLegacy > 0) {
        console.log(`[flomo] imported ${store.importedLegacy} note(s) from the old notes-wall plugin`)
      }
    })
    .catch((error) => {
      console.error(`[flomo] failed to load local notes: ${error && error.message ? error.message : error}`)
    })

  async function currentState() {
    return { ok: true, about: ABOUT, ...(await store.snapshot()) }
  }

  async function handle(req, res) {
    try {
      if (!sameOrigin(req, ctx.webServer)) return sendJson(res, 403, { ok: false, error: 'forbidden origin' })
      if (req.method === 'GET') {
        return sendJson(res, 200, await currentState())
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

      if (action === 'uploadImage') {
        const saved = await images.saveFromBase64({
          mime: body.mime,
          data: body.data,
        })
        return sendJson(res, 200, { ok: true, ...saved })
      }
      if (action === 'create') {
        await store.addNote(body.text)
        engine.schedule()
        return sendJson(res, 200, await currentState())
      }
      if (action === 'update') {
        await store.updateNote(String(body.id || ''), body.text)
        engine.schedule()
        return sendJson(res, 200, await currentState())
      }
      if (action === 'delete') {
        await store.deleteNote(String(body.id || ''))
        engine.schedule()
        return sendJson(res, 200, await currentState())
      }
      if (action === 'account') {
        const account = await engine.verifyAccount(body)
        return sendJson(res, 200, {
          ok: true,
          about: ABOUT,
          account,
          ...(await store.snapshot()),
        })
      }
      if (action === 'disconnect') {
        await engine.disconnect()
        return sendJson(res, 200, await currentState())
      }
      if (action === 'sync') {
        void engine.run('manual')
        return sendJson(res, 200, { ok: true, about: ABOUT, started: true, ...(await store.snapshot()) })
      }
      return sendJson(res, 400, { ok: false, error: 'unknown action' })
    } catch (error) {
      const code = error && error.code ? String(error.code) : 'ERROR'
      const status = error instanceof MemoError || error instanceof SyncError || error instanceof ImageError ? 400 : 500
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
      const pathname = new URL(req.url || '/', 'http://localhost').pathname
      const id = decodeURIComponent(pathname.slice(IMAGE_ROUTE_PATH.length + 1))
      const found = await images.read(id)
      if (!found) return endText(res, 404, 'image not found', { 'cache-control': 'no-store' })
      res.writeHead(200, {
        'content-type': found.mime,
        'content-length': found.buffer.length,
        'cache-control': 'private, max-age=31536000, immutable',
        'x-content-type-options': 'nosniff',
      })
      res.end(req.method === 'HEAD' ? undefined : found.buffer)
    } catch (error) {
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
  ctx.effect(() => () => engine.stop(), 'flomo-notes:sync')
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
