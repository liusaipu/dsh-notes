/**
 * The wire format used inside the sync mailbox.
 *
 * One note revision is one small plain-text mail message. The JSON payload in
 * the body makes every message self-contained, so a reader never has to
 * reconstruct a thread or understand MIME multipart structure. Headers stay
 * ASCII and exist mostly so the folder is readable by a human.
 */

const PROTOCOL = '1'
const MAX_PREVIEW = 72

export function buildNoteMessage({ note, email, deviceId, images = [] }) {
  const id = safeToken(note.id, 80) || 'note'
  const revBy = safeToken(note.revBy || deviceId, 80) || 'unknown'
  const payload = {
    v: 1,
    kind: 'note',
    id,
    text: note.text,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
    revBy,
    deleted: note.deleted === true,
  }
  if (Array.isArray(images) && images.length > 0) payload.images = images
  const subject = `[DSH Memo] ${preview(note.text)}`.trim()
  return compose({
    email,
    subject,
    kind: 'note',
    noteId: id,
    updatedAt: note.updatedAt,
    deviceId: revBy,
    deleted: payload.deleted,
    payload,
  })
}

export function buildVerifyMessage({ email, code, deviceId }) {
  const safeDevice = safeToken(deviceId, 80) || 'unknown'
  return compose({
    email,
    subject: '[DSH Memo] mailbox verification',
    kind: 'verify',
    noteId: '',
    updatedAt: Date.now(),
    deviceId: safeDevice,
    deleted: false,
    payload: {
      v: 1,
      kind: 'verify',
      code,
      email,
      deviceId: safeDevice,
      at: Date.now(),
    },
  })
}

/**
 * Decode a raw message produced by this plugin. Foreign mail in the folder is
 * ignored instead of failing the whole sync.
 */
export function parseMemoMessage(raw) {
  if (typeof raw !== 'string' || raw.length === 0) return null
  const split = raw.indexOf('\r\n\r\n')
  const headerText = split >= 0 ? raw.slice(0, split) : raw.split('\n\n')[0]
  const bodyText = split >= 0 ? raw.slice(split + 4) : raw.split('\n\n').slice(1).join('\n\n')
  const headers = parseHeaders(headerText)
  const marker = headers['x-dsh-memo'] || headers['x-dsh-kind']
  if (!marker) return null
  const decoded = decodeBody(bodyText.trim(), headers['content-transfer-encoding'])
  let payload
  try {
    payload = JSON.parse(decoded)
  } catch {
    return null
  }
  if (!payload || typeof payload !== 'object' || payload.v !== 1) return null
  return payload
}

function compose({ email, subject, kind, noteId, updatedAt, deviceId, deleted, payload }) {
  const body = wrapBase64(Buffer.from(JSON.stringify(payload), 'utf8').toString('base64'))
  const headers = [
    'From: "DSH Memo" <dsh-memo@localhost>',
    `To: <${sanitizeAddress(email)}>`,
    `Subject: ${encodeHeader(subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${noteId || 'verify'}.${updatedAt}.${deviceId}@dsh-memo.local>`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    'Auto-Submitted: auto-generated',
    'X-DSH-Memo: 1',
    `X-DSH-Kind: ${kind}`,
    `X-DSH-Note-Id: ${noteId || 'none'}`,
    `X-DSH-Note-Updated: ${updatedAt}`,
    `X-DSH-Note-Device: ${deviceId}`,
    `X-DSH-Note-Deleted: ${deleted ? '1' : '0'}`,
  ]
  return `${headers.join('\r\n')}\r\n\r\n${body}\r\n`
}

function parseHeaders(text) {
  const headers = {}
  const unfolded = String(text).replace(/\r?\n[ \t]+/g, ' ')
  for (const line of unfolded.split(/\r?\n/)) {
    const index = line.indexOf(':')
    if (index <= 0) continue
    const name = line.slice(0, index).trim().toLowerCase()
    if (!name || headers[name] !== undefined) continue
    headers[name] = line.slice(index + 1).trim()
  }
  return headers
}

function decodeBody(body, encoding) {
  const type = String(encoding || '').toLowerCase().trim()
  if (type === 'base64') {
    try {
      return Buffer.from(body.replace(/\s+/g, ''), 'base64').toString('utf8')
    } catch {
      return ''
    }
  }
  if (type === 'quoted-printable') return decodeQuotedPrintable(body)
  return body
}

function decodeQuotedPrintable(text) {
  return text
    .replace(/=\r?\n/g, '')
    .replace(/=([0-9A-F]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
}

function wrapBase64(value) {
  return value.replace(/.{1,76}/g, (line) => `${line}\r\n`)
}

function preview(text) {
  const single = String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!single) return 'empty note'
  const cut = single.length > MAX_PREVIEW ? `${single.slice(0, MAX_PREVIEW)}…` : single
  return /[^\x20-\x7E]/.test(cut) ? 'note update' : cut
}

function encodeHeader(value) {
  const text = String(value || '')
  if (!/[^\x20-\x7E]/.test(text)) return text
  return `=?UTF-8?B?${Buffer.from(text, 'utf8').toString('base64')}?=`
}

function safeToken(value, max) {
  return String(value == null ? '' : value)
    .replace(/[^A-Za-z0-9._-]/g, '')
    .slice(0, max)
}

function sanitizeAddress(value) {
  return String(value || '').replace(/[\r\n<>]/g, '').trim() || 'unknown@localhost'
}
