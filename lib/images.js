/**
 * Local image store for memo attachments.
 *
 * Images are immutable files addressed by an id. Notes reference them with
 * `dsh-image:<id>` inside Markdown; only the note text is stored in state.json.
 * The same store is used by the upload route, the image route, and the mailbox
 * sync (which embeds referenced images as base64 in the note revision).
 */
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import path from 'node:path'

export const MAX_IMAGE_BYTES = 1.5 * 1024 * 1024
export const MAX_IMAGES_PER_NOTE = 6
export const MAX_IMAGE_TOTAL_BYTES = 6 * 1024 * 1024

const ID_PATTERN = /^[A-Za-z0-9_-]{8,80}$/
const REF_PATTERN = /dsh-image:([A-Za-z0-9_-]{8,80})/g
const MIME_EXTENSION = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
}
const EXTENSION_MIME = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
}

export class ImageStore {
  constructor({ dir, maxBytes = MAX_IMAGE_BYTES }) {
    this.dir = dir
    this.maxBytes = maxBytes
  }

  async saveFromBase64({ id, mime, data }) {
    const buffer = decodeBase64(data)
    if (!buffer || buffer.length === 0) throw new ImageError('IMAGE_EMPTY', '图片内容为空')
    return this.saveBuffer({ id, mime, buffer })
  }

  async saveBuffer({ id, mime, buffer }) {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
      throw new ImageError('IMAGE_EMPTY', '图片内容为空')
    }
    if (buffer.length > this.maxBytes) {
      throw new ImageError('IMAGE_TOO_LARGE', '图片过大，请压缩后重试')
    }
    const detected = sniffMime(buffer)
    if (!detected || !MIME_EXTENSION[detected]) {
      throw new ImageError('IMAGE_TYPE', '仅支持 PNG、JPEG、WebP 或 GIF 图片')
    }
    const safeId = id ? String(id) : randomUUID()
    if (!ID_PATTERN.test(safeId)) throw new ImageError('IMAGE_ID', '图片 id 不合法')
    const extension = MIME_EXTENSION[detected]
    const file = path.join(this.dir, `${safeId}.${extension}`)
    await mkdir(this.dir, { recursive: true, mode: 0o700 })
    try {
      await writeFile(file, buffer, { flag: 'wx', mode: 0o600 })
    } catch (error) {
      if (!error || error.code !== 'EEXIST') throw error
    }
    try {
      await chmod(file, 0o600)
    } catch {
      /* best effort on non-POSIX filesystems */
    }
    return { id: safeId, mime: detected, size: buffer.length, url: `/flomo/api/image/${safeId}` }
  }

  async read(id) {
    const safeId = String(id || '')
    if (!ID_PATTERN.test(safeId)) return null
    for (const [extension, mime] of Object.entries(EXTENSION_MIME)) {
      try {
        const buffer = await readFile(path.join(this.dir, `${safeId}.${extension}`))
        return { buffer, mime, id: safeId }
      } catch (error) {
        if (!error || error.code !== 'ENOENT') throw error
      }
    }
    return null
  }

  /** Collect the images referenced by a note text for a mailbox revision. */
  async pack(text) {
    const ids = []
    const seen = new Set()
    for (const match of String(text || '').matchAll(REF_PATTERN)) {
      const id = match[1]
      if (!seen.has(id)) {
        seen.add(id)
        ids.push(id)
      }
      if (ids.length >= MAX_IMAGES_PER_NOTE) break
    }
    const images = []
    let total = 0
    for (const id of ids) {
      const found = await this.read(id).catch(() => null)
      if (!found || found.buffer.length > this.maxBytes) continue
      if (total + found.buffer.length > MAX_IMAGE_TOTAL_BYTES) break
      total += found.buffer.length
      images.push({ id, mime: found.mime, data: found.buffer.toString('base64') })
    }
    return images
  }

  /** Persist images carried by a remote note revision. */
  async unpack(images) {
    if (!Array.isArray(images)) return 0
    let saved = 0
    let total = 0
    for (const image of images.slice(0, MAX_IMAGES_PER_NOTE)) {
      if (!image || typeof image !== 'object') continue
      if (typeof image.id !== 'string' || !ID_PATTERN.test(image.id)) continue
      if (typeof image.data !== 'string' || !image.data) continue
      let buffer
      try {
        buffer = decodeBase64(image.data)
      } catch {
        continue
      }
      if (!buffer || buffer.length === 0 || buffer.length > this.maxBytes) continue
      if (total + buffer.length > MAX_IMAGE_TOTAL_BYTES) break
      const mime = sniffMime(buffer)
      if (!mime) continue
      total += buffer.length
      try {
        await this.saveBuffer({ id: image.id, mime, buffer })
        saved += 1
      } catch {
        /* one malformed attachment must not fail the whole revision */
      }
    }
    return saved
  }
}

export class ImageError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'ImageError'
    this.code = code
  }
}

export function imageReference(id) {
  return `dsh-image:${id}`
}

function decodeBase64(value) {
  const text = String(value || '')
  const comma = text.indexOf(',')
  const payload = text.startsWith('data:') && comma >= 0 ? text.slice(comma + 1) : text
  if (!payload || payload.length > Math.ceil((MAX_IMAGE_BYTES * 4) / 3) + 16) {
    throw new ImageError('IMAGE_TOO_LARGE', '图片过大，请压缩后重试')
  }
  return Buffer.from(payload.replace(/\s+/g, ''), 'base64')
}

function sniffMime(buffer) {
  if (!buffer || buffer.length < 12) return null
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return 'image/png'
  }
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg'
  if (buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') {
    return 'image/webp'
  }
  const head = buffer.subarray(0, 6).toString('ascii')
  if (head === 'GIF87a' || head === 'GIF89a') return 'image/gif'
  return null
}
