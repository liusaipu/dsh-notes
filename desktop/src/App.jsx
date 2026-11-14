import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { marked } from 'marked'
import DOMPurify from 'dompurify'

const APP_VERSION = '0.2.0'
const EMPTY_SYNC = { configured: false, lastSyncAt: 0, lastError: null }

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

function relativeTime(value) {
  if (!value) return '从未同步'
  const seconds = Math.max(0, Math.round((Date.now() - value) / 1000))
  if (seconds < 60) return '刚刚'
  if (seconds < 3600) return `${Math.floor(seconds / 60)} 分钟前`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} 小时前`
  return new Date(value).toLocaleString()
}

function markdownToHtml(text) {
  const source = String(text || '').replace(
    /!\[([^\]]*)\]\(dsh-image:[^)]+\)/g,
    (_match, alt) => `*[图片：${alt || '附件'}]*`,
  )
  const html = marked.parse(source, { gfm: true, breaks: true })
  return DOMPurify.sanitize(typeof html === 'string' ? html : String(html))
}

function NoteCard({ note, onEdit, onDelete }) {
  const html = useMemo(() => markdownToHtml(note.text), [note.text])
  return (
    <article className="note">
      <div className="note-body" dangerouslySetInnerHTML={{ __html: html }} />
      <footer className="note-foot">
        <time title={new Date(note.updatedAt).toLocaleString()}>{relativeTime(note.updatedAt)}</time>
        <div className="note-actions">
          <button type="button" className="text-btn" onClick={() => onEdit(note)}>
            编辑
          </button>
          <button type="button" className="text-btn danger" onClick={() => onDelete(note)}>
            删除
          </button>
        </div>
      </footer>
    </article>
  )
}

export default function App() {
  const [snapshot, setSnapshot] = useState(null)
  const [loading, setLoading] = useState(true)
  const [fatal, setFatal] = useState('')
  const [composer, setComposer] = useState('')
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState(null)
  const [editText, setEditText] = useState('')
  const [editSaving, setEditSaving] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [busy, setBusy] = useState('')
  const [notice, setNotice] = useState(null)
  const noticeTimer = useRef(null)
  const composerRef = useRef(null)

  const account = snapshot?.account || null
  const sync = snapshot?.sync || EMPTY_SYNC
  const pending = snapshot?.pending || 0
  const notes = snapshot?.notes || []

  const toast = useCallback((text, kind = 'ok') => {
    if (noticeTimer.current) clearTimeout(noticeTimer.current)
    setNotice({ text, kind })
    noticeTimer.current = setTimeout(() => setNotice(null), 3200)
  }, [])

  const apply = useCallback((data) => {
    if (data && Array.isArray(data.notes)) setSnapshot(data)
  }, [])

  const refresh = useCallback(async () => {
    try {
      const data = await invoke('load_notes')
      apply(data)
      setFatal('')
    } catch (error) {
      setFatal(String(error))
    } finally {
      setLoading(false)
    }
  }, [apply])

  useEffect(() => {
    void refresh()
    return () => {
      if (noticeTimer.current) clearTimeout(noticeTimer.current)
    }
  }, [refresh])

  useEffect(() => {
    if (!settingsOpen) return undefined
    const onKey = (event) => {
      if (event.key === 'Escape') setSettingsOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [settingsOpen])

  async function createNote() {
    const text = composer.trim()
    if (!text || saving) return
    setSaving(true)
    try {
      const data = await invoke('create_note', { text })
      apply(data)
      setComposer('')
      composerRef.current?.focus()
      toast('已记下来')
    } catch (error) {
      toast(String(error), 'error')
    } finally {
      setSaving(false)
    }
  }

  function startEdit(note) {
    setEditing(note)
    setEditText(note.text)
  }

  async function saveEdit() {
    if (!editing || editSaving) return
    const text = editText.trim()
    if (!text) return
    setEditSaving(true)
    try {
      const data = await invoke('update_note', { id: editing.id, text })
      apply(data)
      setEditing(null)
      toast('已更新')
    } catch (error) {
      toast(String(error), 'error')
    } finally {
      setEditSaving(false)
    }
  }

  async function removeNote(note) {
    if (!window.confirm('删除这条笔记？本机会保留删除标记，并在下次同步时通知其他设备。')) return
    try {
      const data = await invoke('delete_note', { id: note.id })
      apply(data)
      toast('已删除')
    } catch (error) {
      toast(String(error), 'error')
    }
  }

  async function syncNow() {
    if (!account || busy) return
    setBusy('sync')
    try {
      const data = await invoke('sync_now')
      apply(data.snapshot)
      toast(`同步完成：收到 ${data.fetched} 条，发送 ${data.pushed} 条`)
    } catch (error) {
      toast(String(error), 'error')
    } finally {
      setBusy('')
    }
  }

  if (loading) {
    return (
      <div className="app center">
        <div className="loading">正在打开 Quick Memo…</div>
      </div>
    )
  }

  return (
    <div className="app">
      <header className="head">
        <div className="brand">
          <span className="mark" aria-hidden="true">Q</span>
          <div>
            <h1>Quick Memo</h1>
            <p>本地笔记本 · 邮箱同步</p>
          </div>
        </div>
        <div className="head-actions">
          <button
            type="button"
            className={`status ${sync.lastError ? 'error' : account ? 'ok' : 'local'}`}
            title={sync.lastError || (account ? `${account.email} · ${account.folder}` : '仅保存在本机')}
            onClick={() => setSettingsOpen(true)}
          >
            <span className="dot" />
            {sync.lastError ? '同步失败' : busy === 'sync' ? '同步中…' : account ? '已连接' : '仅本机'}
          </button>
          <button
            type="button"
            className="icon-btn"
            title="立即同步"
            aria-label="立即同步"
            onClick={() => void syncNow()}
            disabled={!account || Boolean(busy)}
          >
            ↻
          </button>
          <button
            type="button"
            className="icon-btn"
            title="设置"
            aria-label="设置"
            onClick={() => setSettingsOpen(true)}
          >
            ⚙
          </button>
        </div>
      </header>

      {fatal ? <div className="banner error">{fatal}</div> : null}
      {sync.lastError ? <div className="banner error">上次同步失败：{sync.lastError}</div> : null}
      {!account ? (
        <div className="banner local-banner">
          <div>
            <strong>只保存在这台电脑</strong>
            <span>连接邮箱后，笔记会同步到你的邮箱文件夹，并在多台设备间保持一致。</span>
          </div>
          <button type="button" className="small-btn" onClick={() => setSettingsOpen(true)}>
            连接邮箱
          </button>
        </div>
      ) : null}

      <main className="main">
        <section className="composer">
          <textarea
            ref={composerRef}
            value={composer}
            rows={Math.min(8, Math.max(3, composer.split('\n').length))}
            placeholder="现在在想什么？支持 Markdown…"
            aria-label="新笔记"
            spellCheck={false}
            onChange={(event) => setComposer(event.target.value)}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                event.preventDefault()
                void createNote()
              }
            }}
          />
          <div className="composer-bar">
            <span className="hint">⌘/Ctrl + Enter 保存 · Markdown</span>
            <button
              type="button"
              className="primary"
              onClick={() => void createNote()}
              disabled={saving || !composer.trim()}
            >
              {saving ? '保存中…' : '记下来'}
            </button>
          </div>
        </section>

        <div className="list-head">
          <span>{notes.length} 条笔记</span>
          <span>{pending > 0 ? `${pending} 条待同步` : account ? '已同步' : ''}</span>
        </div>

        {notes.length === 0 ? (
          <section className="empty">
            <div className="empty-icon">✎</div>
            <h2>还没有笔记</h2>
            <p>写下一句话，剩下的可以慢一点。</p>
          </section>
        ) : (
          <section className="notes">
            {notes.map((note) => (
              <NoteCard
                key={note.id}
                note={note}
                onEdit={startEdit}
                onDelete={(item) => void removeNote(item)}
              />
            ))}
          </section>
        )}
      </main>

      <footer className="foot">
        <span>Quick Memo {APP_VERSION}</span>
        <span>Windows / macOS</span>
      </footer>

      {notice ? <div className={`toast ${notice.kind}`}>{notice.text}</div> : null}

      {editing ? (
        <div className="modal" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !editSaving) setEditing(null)
        }}>
          <div className="dialog edit-dialog" role="dialog" aria-modal="true" aria-label="编辑笔记">
            <div className="dialog-head">
              <h2>编辑笔记</h2>
              <button type="button" className="icon-btn" onClick={() => setEditing(null)} disabled={editSaving}>×</button>
            </div>
            <textarea
              className="edit-area"
              value={editText}
              rows={Math.min(18, Math.max(6, editText.split('\n').length))}
              autoFocus
              spellCheck={false}
              onChange={(event) => setEditText(event.target.value)}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                  event.preventDefault()
                  void saveEdit()
                }
              }}
            />
            <div className="dialog-actions">
              <button type="button" className="ghost" onClick={() => setEditing(null)} disabled={editSaving}>取消</button>
              <button type="button" className="primary" onClick={() => void saveEdit()} disabled={editSaving || !editText.trim()}>
                {editSaving ? '保存中…' : '保存'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {settingsOpen ? (
        <SettingsDialog
          account={account}
          sync={sync}
          pending={pending}
          busy={busy}
          onClose={() => setSettingsOpen(false)}
          onSaved={(data) => {
            apply(data)
            setSettingsOpen(false)
            toast('邮箱已连接')
          }}
          onSync={syncNow}
          onToast={toast}
        />
      ) : null}
    </div>
  )
}

function SettingsDialog({ account, sync, pending, busy, onClose, onSaved, onSync, onToast }) {
  const [showForm, setShowForm] = useState(!account)
  const [form, setForm] = useState({
    email: account?.email || '',
    password: '',
    host: account?.host || '',
    port: String(account?.port || 993),
    folder: account?.folder || 'DSH Notes',
  })
  const [hostTouched, setHostTouched] = useState(Boolean(account?.host))
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')
  const [disconnectConfirm, setDisconnectConfirm] = useState(false)
  const [syncing, setSyncing] = useState(false)

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

  async function save(event) {
    event.preventDefault()
    if (submitting) return
    setSubmitting(true)
    setFormError('')
    try {
      const data = await invoke('save_account', {
        input: {
          email: form.email.trim(),
          password: form.password,
          host: form.host.trim() || guessHost(form.email),
          port: Number(form.port) || 993,
          folder: form.folder.trim() || 'DSH Notes',
        },
      })
      onSaved(data)
    } catch (error) {
      setFormError(String(error))
    } finally {
      setSubmitting(false)
    }
  }

  async function disconnect() {
    try {
      const data = await invoke('disconnect_account')
      onSaved(data)
      setShowForm(true)
      setForm((current) => ({ ...current, password: '' }))
      onToast('已断开邮箱')
    } catch (error) {
      onToast(String(error), 'error')
    }
  }

  async function syncHere() {
    setSyncing(true)
    try {
      await onSync()
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="modal" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !submitting) onClose()
    }}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label="邮箱设置">
        <div className="dialog-head">
          <div>
            <h2>邮箱同步</h2>
            <p className="dialog-sub">每条笔记修订会写成一封邮件，放进你自己邮箱的同步文件夹。</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} disabled={submitting}>×</button>
        </div>

        {account && !showForm ? (
          <div className="account-card">
            <div className="account-row">
              <span className="account-icon">@</span>
              <div>
                <div className="account-email">{account.email}</div>
                <div className="meta">已连接 · {account.folder}</div>
              </div>
            </div>
            <dl className="kv">
              <dt>服务器</dt><dd>{account.host}:{account.port || 993}</dd>
              <dt>上次同步</dt><dd>{relativeTime(sync.lastSyncAt)}</dd>
              <dt>待同步</dt><dd>{pending}</dd>
            </dl>
            {sync.lastError ? <div className="form-error">{sync.lastError}</div> : null}
            <div className="dialog-actions">
              <button type="button" className="ghost" onClick={() => {
                setShowForm(true)
                setForm((current) => ({ ...current, password: '' }))
              }}>更换邮箱</button>
              {disconnectConfirm ? (
                <button type="button" className="danger" onClick={() => void disconnect()}>确认断开</button>
              ) : (
                <button type="button" className="ghost danger-text" onClick={() => setDisconnectConfirm(true)}>断开</button>
              )}
              <button type="button" className="primary" onClick={() => void syncHere()} disabled={syncing || Boolean(busy)}>
                {syncing || busy === 'sync' ? '同步中…' : '立即同步'}
              </button>
            </div>
          </div>
        ) : (
          <form className="form" onSubmit={save}>
            <label>
              <span>邮箱地址</span>
              <input
                type="email"
                value={form.email}
                autoComplete="username"
                spellCheck={false}
                placeholder="you@example.com"
                onChange={(event) => updateEmail(event.target.value)}
              />
            </label>
            <label>
              <span>应用专用密码 / 授权码</span>
              <input
                type="password"
                value={form.password}
                autoComplete="current-password"
                placeholder="不会显示在界面上"
                onChange={(event) => update('password', event.target.value)}
              />
            </label>
            <div className="grid">
              <label>
                <span>IMAP 服务器</span>
                <input
                  type="text"
                  value={form.host}
                  spellCheck={false}
                  placeholder="留空自动识别"
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
              <span>同步文件夹</span>
              <input
                type="text"
                value={form.folder}
                spellCheck={false}
                onChange={(event) => update('folder', event.target.value)}
              />
            </label>
            <p className="help">
              密码保存在 macOS 钥匙串 / Windows 凭据管理器，不写进笔记文件。QQ、163、Gmail、iCloud 请使用应用专用密码。
            </p>
            {formError ? <div className="form-error">{formError}</div> : null}
            <div className="dialog-actions">
              {account ? <button type="button" className="ghost" onClick={() => setShowForm(false)} disabled={submitting}>取消</button> : null}
              <button type="submit" className="primary" disabled={submitting || !form.email.trim() || !form.password}>
                {submitting ? '连接并验证中…' : '连接并验证'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
