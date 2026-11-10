import { useState } from 'react'
import { invoke } from '@tauri-apps/api/core'

const DEFAULT_FOLDER = 'DSH Notes Spike'

function guessHost(email) {
  const domain = String(email || '').split('@').pop().toLowerCase()
  if (!domain.includes('.')) return ''
  if (domain === 'gmail.com' || domain === 'googlemail.com') return 'imap.gmail.com'
  if (domain === 'icloud.com' || domain === 'me.com' || domain === 'mac.com') return 'imap.mail.me.com'
  if (domain === 'qq.com' || domain === 'foxmail.com' || domain === 'vip.qq.com') return 'imap.qq.com'
  if (domain === '163.com' || domain === '126.com' || domain === 'yeah.net') return 'imap.163.com'
  if (domain === 'outlook.com' || domain === 'hotmail.com' || domain === 'live.com') return 'outlook.office365.com'
  return `imap.${domain}`
}

export default function App() {
  const [form, setForm] = useState({
    email: '',
    password: '',
    host: '',
    port: '993',
    folder: DEFAULT_FOLDER,
  })
  const [hostTouched, setHostTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)

  function update(key, value) {
    setForm((current) => ({ ...current, [key]: value }))
    if (key === 'host') setHostTouched(true)
  }

  function updateEmail(value) {
    setForm((current) => ({
      ...current,
      email: value,
      host: hostTouched ? current.host : guessHost(value),
    }))
  }

  async function submit(event) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    setResult(null)
    try {
      const request = {
        email: form.email.trim(),
        password: form.password,
        host: form.host.trim() || guessHost(form.email),
        port: Number(form.port) || 993,
        folder: form.folder.trim() || DEFAULT_FOLDER,
      }
      if (!request.email || !request.password) throw new Error('请填写邮箱和应用专用密码')
      if (!request.host) throw new Error('请填写 IMAP 服务器')
      const data = await invoke('imap_probe', { request })
      setResult(data)
    } catch (reason) {
      setError(String(reason && reason.message ? reason.message : reason))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="app">
      <header className="head">
        <div className="brand">
          <span className="mark" aria-hidden="true">
            <span>Q</span>
          </span>
          <div>
            <h1>Quick Memo</h1>
            <p>桌面版 · Tauri + Rust 技术验证</p>
          </div>
        </div>
        <span className="version">v0.1.0</span>
      </header>

      <main className="main">
        <section className="card intro">
          <div className="badge">SPIKE</div>
          <h2>先验证 IMAP 往返</h2>
          <p>
            这个版本只验证 Rust 侧的邮箱连接、建文件夹、写入一封带图片的测试笔记、读回并解析。
            测试使用独立文件夹 <code>{form.folder || DEFAULT_FOLDER}</code>，不会碰你的 <code>DSH Notes</code>。
          </p>
          <p className="muted">
            每次点按钮会向测试文件夹追加一封测试邮件。建议使用邮箱的「应用专用密码 / 授权码」，不要用登录密码。
          </p>
        </section>

        <form className="card form" onSubmit={submit}>
          <label>
            <span>邮箱地址</span>
            <input
              type="email"
              value={form.email}
              placeholder="you@example.com"
              autoComplete="username"
              spellCheck={false}
              onChange={(event) => updateEmail(event.target.value)}
            />
          </label>

          <label>
            <span>应用专用密码 / 授权码</span>
            <input
              type="password"
              value={form.password}
              placeholder="不会保存"
              autoComplete="current-password"
              onChange={(event) => update('password', event.target.value)}
            />
          </label>

          <div className="grid">
            <label>
              <span>IMAP 服务器</span>
              <input
                type="text"
                value={form.host}
                placeholder="留空自动识别"
                spellCheck={false}
                onChange={(event) => update('host', event.target.value)}
              />
            </label>
            <label>
              <span>端口</span>
              <input
                type="number"
                value={form.port}
                min="1"
                max="65535"
                onChange={(event) => update('port', event.target.value)}
              />
            </label>
          </div>

          <label>
            <span>测试文件夹</span>
            <input
              type="text"
              value={form.folder}
              spellCheck={false}
              onChange={(event) => update('folder', event.target.value)}
            />
          </label>

          <button className="primary" type="submit" disabled={busy}>
            {busy ? '连接并往返中…' : '测试连接并往返一封笔记'}
          </button>

          {error ? (
            <div className="error" role="alert">
              <strong>失败</strong>
              <span>{error}</span>
            </div>
          ) : null}
        </form>

        {result ? (
          <section className="card result">
            <div className="result-head">
              <h2>往返成功</h2>
              <span className="ok">OK</span>
            </div>
            <dl>
              <div><dt>邮箱服务器</dt><dd>{result.host}:{result.port}</dd></div>
              <div><dt>文件夹</dt><dd>{result.folder}</dd></div>
              <div><dt>新建文件夹</dt><dd>{result.created ? '是' : '否（已存在）'}</dd></div>
              <div><dt>写入 UID</dt><dd>{result.uid ?? '未知'}</dd></div>
              <div><dt>邮件字节</dt><dd>{result.message_bytes}</dd></div>
              <div><dt>图片字节</dt><dd>{result.image_bytes}</dd></div>
              <div><dt>邮箱目录数</dt><dd>{result.mailboxes.length}</dd></div>
            </dl>
            <div className="note">
              <span>读回的笔记</span>
              <pre>{result.note_text}</pre>
            </div>
            <details>
              <summary>邮箱文件夹</summary>
              <ul>
                {result.mailboxes.map((name) => (
                  <li key={name}>{name}</li>
                ))}
              </ul>
            </details>
          </section>
        ) : null}
      </main>

      <footer className="foot">
        <span>Quick Memo 0.1.0</span>
        <span>Windows / macOS · 实验版本</span>
      </footer>
    </div>
  )
}
