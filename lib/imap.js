/**
 * A small, dependency-free IMAP4rev1 client.
 *
 * It implements exactly what the memo sync needs: TLS connect, LOGIN,
 * mailbox discovery/creation, SELECT, UID SEARCH, UID FETCH, APPEND and a
 * clean LOGOUT. The response reader understands server literals, which is
 * what makes fetching a raw mail message possible without a MIME library.
 */
import net from 'node:net'
import tls from 'node:tls'

const CRLF = Buffer.from('\r\n')
const LITERAL_MARK = '\u0000'

export class ImapError extends Error {
  constructor(message, options = {}) {
    super(message)
    this.name = 'ImapError'
    this.code = options.code || 'IMAP_ERROR'
    this.detail = options.detail || ''
  }
}

export class ImapClient {
  constructor(options) {
    this.host = String(options.host || '').trim()
    this.port = Number(options.port) || 993
    this.secure = options.secure !== false
    this.timeout = Number(options.timeout) || 25000
    this.debug = Boolean(options.debug)
    this.socket = null
    this.buffer = Buffer.alloc(0)
    this.wake = null
    this.failure = null
    this.closed = false
    this.tagged = 0
    this.capabilities = []
  }

  async connect() {
    if (!this.host) throw new ImapError('缺少邮件服务器地址', { code: 'CONFIG' })
    const connectOptions = { host: this.host, port: this.port }
    const socket = this.secure
      ? tls.connect({ ...connectOptions, servername: this.host })
      : net.connect(connectOptions)
    this.socket = socket

    await new Promise((resolve, reject) => {
      let settled = false
      const finish = (error) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        socket.removeListener(this.secure ? 'secureConnect' : 'connect', onReady)
        socket.removeListener('error', onError)
        socket.removeListener('timeout', onTimeout)
        if (error) reject(error)
        else resolve()
      }
      const onReady = () => finish()
      const onError = (error) => {
        // A failed handshake leaves a destroyed socket behind. Mark the client
        // closed so logout() takes the early return instead of writing into it
        // and waiting forever for a reply that cannot arrive.
        this.closed = true
        finish(mapNetworkError(error, this.secure))
      }
      const onTimeout = () => finish(new ImapError('连接邮件服务器超时', { code: 'TIMEOUT' }))
      const timer = setTimeout(() => {
        socket.destroy()
        finish(new ImapError('连接邮件服务器超时', { code: 'TIMEOUT' }))
      }, this.timeout)
      socket.once(this.secure ? 'secureConnect' : 'connect', onReady)
      socket.once('error', onError)
      socket.once('timeout', onTimeout)
    })

    socket.setTimeout(this.timeout, () => {
      this._fail(new ImapError('邮件服务器响应超时', { code: 'TIMEOUT' }))
    })
    socket.on('data', (chunk) => {
      this.buffer = this.buffer.length === 0 ? chunk : Buffer.concat([this.buffer, chunk])
      this._wake()
    })
    socket.on('error', (error) => this._fail(mapNetworkError(error, this.secure)))
    socket.on('close', () => {
      this.closed = true
      this._wake()
    })

    const greeting = await this._readLine()
    if (!/^\* (OK|PREAUTH)\b/i.test(greeting)) {
      throw new ImapError(`邮件服务器拒绝连接：${short(greeting)}`, { code: 'CONNECT_FAILED' })
    }
    try {
      const response = await this.command('CAPABILITY')
      const line = response.lines.find((value) => /^\* CAPABILITY\b/i.test(value))
      if (line) this.capabilities = line.replace(/^\* CAPABILITY\s*/i, '').trim().split(/\s+/)
    } catch {
      /* CAPABILITY is optional; LOGIN still decides whether the session works. */
    }
  }

  async login(user, password) {
    const response = await this.command(`LOGIN ${quote(user)} ${quote(password)}`)
    if (!this._ok(response)) {
      throw new ImapError(`邮箱登录失败：${responseText(response)}`, {
        code: 'AUTH_FAILED',
        detail: responseText(response),
      })
    }
    // NetEase (163/126) rejects later commands until the client identifies
    // itself; RFC 2971 ID is harmless elsewhere. Servers often advertise new
    // capabilities only after authentication, so refresh and identify here.
    try {
      const capability = await this.command('CAPABILITY')
      const line = capability.lines.find((value) => /^\* CAPABILITY\b/i.test(value))
      if (line) this.capabilities = line.replace(/^\* CAPABILITY\s*/i, '').trim().split(/\s+/)
    } catch {
      /* keep the pre-login capability list */
    }
    try {
      await this.command(
        'ID ("name" "dsh-flomo" "version" "1.0.0" "vendor" "DeepSeek Harness" "support-email" "noreply@localhost")',
      )
    } catch {
      /* identification is best-effort */
    }
  }

  async logout() {
    if (!this.socket || this.closed) return
    const fallback = setTimeout(() => this.close(), 3000)
    if (typeof fallback.unref === 'function') fallback.unref()
    try {
      await this.command('LOGOUT')
    } catch {
      /* the server may close the socket before answering */
    } finally {
      clearTimeout(fallback)
      this.close()
    }
  }

  close() {
    if (!this.socket) return
    try {
      this.socket.destroy()
    } catch {
      /* ignore */
    }
    this.socket = null
    this.closed = true
    // Wake any pending read so it fails with CLOSED instead of hanging.
    this._wake()
  }

  async mailboxExists(name) {
    const response = await this.command(`LIST "" ${quote(name)}`)
    if (!this._ok(response)) {
      throw new ImapError(`无法读取邮箱目录：${responseText(response)}`, {
        code: 'FOLDER_FAILED',
        detail: responseText(response),
      })
    }
    return response.lines.some(
      (line) => /^\* LIST\b/i.test(line) && !/\\Noselect/i.test(line),
    )
  }

  async ensureMailbox(name) {
    if (await this.mailboxExists(name)) return false
    const response = await this.command(`CREATE ${quote(name)}`)
    if (!this._ok(response)) {
      const text = responseText(response)
      if (!/already exists|exist/i.test(text)) {
        throw new ImapError(`无法创建邮箱目录「${name}」：${text}`, {
          code: 'FOLDER_FAILED',
          detail: text,
        })
      }
    }
    return true
  }

  async select(name) {
    const response = await this.command(`SELECT ${quote(name)}`)
    if (!this._ok(response)) {
      throw new ImapError(`无法打开邮箱目录「${name}」：${responseText(response)}`, {
        code: 'FOLDER_FAILED',
        detail: responseText(response),
      })
    }
    let exists = 0
    let uidValidity = null
    for (const line of response.lines) {
      const count = line.match(/^\* (\d+) EXISTS\b/i)
      if (count) exists = Number(count[1])
      const validity = line.match(/\[UIDVALIDITY\s+(\d+)\]/i)
      if (validity) uidValidity = validity[1]
    }
    return { exists, uidValidity }
  }

  async searchUidsSince(lastUid) {
    const response = await this.command(
      lastUid > 0 ? `UID SEARCH UID ${lastUid + 1}:*` : 'UID SEARCH ALL',
    )
    if (!this._ok(response)) {
      throw new ImapError(`无法检索邮箱目录：${responseText(response)}`, {
        code: 'SEARCH_FAILED',
        detail: responseText(response),
      })
    }
    const uids = []
    for (const line of response.lines) {
      if (!/^\* SEARCH\b/i.test(line)) continue
      const body = line.replace(/^\* SEARCH\b/i, '').trim()
      if (!body) continue
      for (const value of body.split(/\s+/)) {
        const uid = Number(value)
        if (Number.isInteger(uid) && uid > 0) uids.push(uid)
      }
    }
    return uids.sort((left, right) => left - right)
  }

  async fetchMessages(uids) {
    if (uids.length === 0) return []
    const response = await this.command(
      `UID FETCH ${uids.join(',')} (UID BODY.PEEK[])`,
    )
    if (!this._ok(response)) {
      throw new ImapError(`读取邮件失败：${responseText(response)}`, {
        code: 'FETCH_FAILED',
        detail: responseText(response),
      })
    }
    const messages = []
    for (const item of response.items) {
      if (!/^\* \d+ FETCH\b/i.test(item.text)) continue
      const uidMatch = item.text.match(/\bUID (\d+)/i)
      const literalMatch = item.text.match(/\u0000(\d+)\u0000/)
      if (!uidMatch || !literalMatch) continue
      const literal = item.literals[Number(literalMatch[1])]
      if (!literal) continue
      messages.push({ uid: Number(uidMatch[1]), raw: literal.toString('utf8') })
    }
    return messages
  }

  async append(name, rawMessage) {
    const literal = Buffer.isBuffer(rawMessage) ? rawMessage : Buffer.from(String(rawMessage), 'utf8')
    const response = await this._commandWithLiteral(`APPEND ${quote(name)} (\\Seen)`, literal)
    if (!this._ok(response)) {
      throw new ImapError(`写入邮件失败：${responseText(response)}`, {
        code: 'APPEND_FAILED',
        detail: responseText(response),
      })
    }
    const appended = response.text.match(/\[APPENDUID\s+(\d+)\s+(\d+)\]/i)
    return {
      uid: appended ? Number(appended[2]) : null,
      uidValidity: appended ? appended[1] : null,
    }
  }

  async deleteUid(uid) {
    if (!uid) return
    try {
      await this.command(`UID STORE ${uid} +FLAGS.SILENT (\\Deleted)`)
      if (this.capabilities.some((item) => item.toUpperCase() === 'UIDPLUS')) {
        await this.command(`UID EXPUNGE ${uid}`)
      }
    } catch {
      /* cleanup of the verification message is best-effort */
    }
  }

  /* ---------- command plumbing ---------- */

  async command(line) {
    const tag = this._nextTag()
    this._write(`${tag} ${line}\r\n`)
    return this._readResponse(tag)
  }

  async _commandWithLiteral(line, literal) {
    const tag = this._nextTag()
    this._write(`${tag} ${line} {${literal.length}}\r\n`)
    while (true) {
      const received = await this._readLine()
      if (received.startsWith('+')) break
      if (received.startsWith(tag)) {
        return { status: 'BAD', text: received, lines: [received], items: [] }
      }
    }
    this._write(literal)
    this._write('\r\n')
    return this._readResponse(tag)
  }

  async _readResponse(tag) {
    const items = []
    while (true) {
      let text = await this._readLine()
      const literals = []
      while (/\{\d+\}$/.test(text)) {
        const size = Number(text.match(/\{(\d+)\}$/)[1])
        const literal = await this._readExact(size)
        literals.push(literal)
        text += `${LITERAL_MARK}${literals.length - 1}${LITERAL_MARK}`
        text += await this._readLine()
      }
      items.push({ text, literals })
      if (text.startsWith(`${tag} `)) {
        const status = text.slice(tag.length + 1).split(/\s+/)[0].toUpperCase()
        return {
          status,
          text,
          lines: items.map((item) => item.text),
          items,
        }
      }
      if (text.startsWith(tag) && text.length === tag.length) {
        return { status: 'BAD', text, lines: [text], items }
      }
    }
  }

  _ok(response) {
    return response.status === 'OK'
  }

  /* ---------- buffered reads ---------- */

  async _readLine() {
    while (true) {
      const index = this.buffer.indexOf(CRLF)
      if (index >= 0) {
        const line = this.buffer.subarray(0, index).toString('utf8')
        this.buffer = this.buffer.subarray(index + CRLF.length)
        if (this.debug) console.error('[imap] <', line)
        return line
      }
      await this._waitForData()
    }
  }

  async _readExact(size) {
    while (this.buffer.length < size) await this._waitForData()
    const bytes = this.buffer.subarray(0, size)
    this.buffer = this.buffer.subarray(size)
    if (this.debug) console.error('[imap] < literal', size)
    return bytes
  }

  async _waitForData() {
    this._throwIfFailed()
    await new Promise((resolve) => {
      this.wake = resolve
    })
    this._throwIfFailed()
    if (this.closed && this.buffer.length === 0) {
      throw new ImapError('邮件服务器关闭了连接', { code: 'CLOSED' })
    }
  }

  _throwIfFailed() {
    if (this.failure) throw this.failure
  }

  _wake() {
    const wake = this.wake
    this.wake = null
    if (wake) wake()
  }

  _fail(error) {
    if (!this.failure) this.failure = error
    try {
      if (this.socket) this.socket.destroy()
    } catch {
      /* already gone */
    }
    this._wake()
  }

  _nextTag() {
    this.tagged += 1
    return `A${this.tagged.toString(36).toUpperCase().padStart(2, '0')}`
  }

  _write(value) {
    if (!this.socket || this.closed) throw new ImapError('邮件连接已关闭', { code: 'CLOSED' })
    if (this.debug) console.error('[imap] >', typeof value === 'string' ? redact(value).trim() : value)
    this.socket.write(value)
  }
}

function redact(value) {
  // Debug logs must never contain the mailbox password.
  return String(value).replace(/(\bLOGIN\s+"(?:[^"\\]|\\.)*"\s+)"(?:[^"\\]|\\.)*"/i, '$1"***"')
}

export function quote(value) {
  const text = String(value)
  if (/[\r\n\0]/.test(text)) throw new ImapError('邮箱参数包含非法字符', { code: 'CONFIG' })
  return `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

function responseText(response) {
  const text = String((response && response.text) || '').replace(/^[A-Z0-9]+\s+/, '')
  return short(text)
}

function short(value) {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  return text.length > 240 ? `${text.slice(0, 240)}…` : text
}

function mapNetworkError(error, secure) {
  if (error instanceof ImapError) return error
  const code = error && error.code
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
    return new ImapError('找不到邮件服务器，请检查服务器地址或网络', { code: 'CONNECT_FAILED' })
  }
  if (code === 'ECONNREFUSED') {
    return new ImapError('邮件服务器拒绝连接，请检查端口与 IMAP 服务', { code: 'CONNECT_FAILED' })
  }
  if (code === 'ETIMEDOUT') {
    return new ImapError('连接邮件服务器超时', { code: 'TIMEOUT' })
  }
  if (code === 'CERT_HAS_EXPIRED' || code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' || code === 'DEPTH_ZERO_SELF_SIGNED_CERT') {
    return new ImapError('邮件服务器证书校验失败', { code: 'TLS_FAILED' })
  }
  if (code === 'EPIPE' || code === 'ECONNRESET') {
    return new ImapError('与邮件服务器的连接中断', { code: 'CLOSED' })
  }
  return new ImapError(
    secure ? `邮件连接失败：${error.message || error}` : `邮件连接失败：${error.message || error}`,
    { code: 'CONNECT_FAILED' },
  )
}
