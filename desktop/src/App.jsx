import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { marked } from 'marked'
import DOMPurify from 'dompurify'

const APP_VERSION = '0.3.0'
const EMPTY_SYNC = { configured: false, lastSyncAt: 0, lastError: null }
const TAG_RE = /#([\p{L}\p{N}_-]{1,32})/gu

function tagsOf(text) {
  const found = new Set()
  for (const match of String(text || '').matchAll(TAG_RE)) found.add(match[1])
  return [...found]
}

function tagCounts(notes) {
  const counts = new Map()
  for (const note of notes) {
    for (const tag of tagsOf(note.text)) counts.set(tag, (counts.get(tag) || 0) + 1)
  }
  return [...counts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
}

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

function NoteCard({ note, onEdit, onDelete, onTag }) {
  const html = useMemo(() => markdownToHtml(note.text), [note.text])
  const tags = useMemo(() => tagsOf(note.text), [note.text])
  return (
    <article className="note">
      <div className="note-body" dangerouslySetInnerHTML={{ __html: html }} />
      {tags.length > 0 ? (
        <div className="note-tags">
          {tags.map((tag) => (
            <button type="button" className="tag-chip" key={tag} onClick={() => onTag(tag)}>
              #{tag}
            </button>
          ))}
        </div>
      ) : null}
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
  const [activeTag, setActiveTag] = useState(null)
  const [notebookMenu, setNotebookMenu] = useState(false)
  const [notebookDialog, setNotebookDialog] = useState(null)
  const [notebookSaving, setNotebookSaving] = useState(false)
  const noticeTimer = useRef(null)
  const composerRef = useRef(null)
  const notebookMenuRef = useRef(null)

  const account = snapshot?.account || null
  const sync = snapshot?.sync || EMPTY_SYNC
  const pending = snapshot?.pending || 0
  const notes = snapshot?.notes || []
  const notebooks = snapshot?.notebooks || []
  const active = snapshot?.active || ''
  const notebook = snapshot?.notebook || { id: active, name: '我的笔记' }
  const tagEntries = useMemo(() => tagCounts(notes), [notes])
  const filteredNotes = useMemo(
    () => (activeTag ? notes.filter((note) => tagsOf(note.text).includes(activeTag)) : notes),
    [notes, activeTag],
  )

  const toast = useCallback((text, kind = 'ok') => {
    if (noticeTimer.current) clearTimeout(noticeTimer.current)
    setNotice({ text, kind })
    noticeTimer.current = setTimeout(() => setNotice(null), 3400)
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
    if (activeTag && !tagEntries.some(([tag]) => tag === activeTag)) setActiveTag(null)
  }, [activeTag, tagEntries])

  useEffect(() => {
    if (!settingsOpen) return undefined
    const onKey = (event) => {
      if (event.key === 'Escape') setSettingsOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [settingsOpen])

  useEffect(() => {
    if (!notebookMenu) return undefined
    const onDown = (event) => {
      if (!notebookMenuRef.current?.contains(event.target)) setNotebookMenu(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [notebookMenu])

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

  async function switchNotebook(book) {
    if (book.id === active || busy) return
    setBusy('notebook')
    try {
      const data = await invoke('set_active_notebook', { id: book.id })
      apply(data)
      setActiveTag(null)
      setComposer('')
      setEditing(null)
      setNotebookMenu(false)
    } catch (error) {
      toast(String(error), 'error')
    } finally {
      setBusy('')
    }
  }

  function openCreateNotebook() {
    setNotebookMenu(false)
    setNotebookDialog({ mode: 'create', name: `笔记本 ${notebooks.length + 1}`, error: '' })
  }

  function openRenameNotebook(book = notebook) {
    setNotebookMenu(false)
    setNotebookDialog({ mode: 'rename', id: book.id, name: book.name, error: '' })
  }

  async function submitNotebookName() {
    if (!notebookDialog || notebookSaving) return
    const name = notebookDialog.name.trim()
    if (!name) {
      setNotebookDialog((current) => ({ ...current, error: '笔记本名称不能为空' }))
      return
    }
    setNotebookSaving(true)
    try {
      const data = notebookDialog.mode === 'create'
        ? await invoke('create_notebook', { name })
        : await invoke('rename_notebook', { id: notebookDialog.id, name })
      apply(data)
      setNotebookDialog(null)
      setNotebookMenu(false)
      setActiveTag(null)
      setComposer('')
      toast(notebookDialog.mode === 'create' ? '已新建笔记本' : '已重命名')
    } catch (error) {
      setNotebookDialog((current) => ({ ...current, error: String(error) }))
    } finally {
      setNotebookSaving(false)
    }
  }

  async function removeNotebook(book) {
    setNotebookMenu(false)
    if (!window.confirm(`删除「${book.name}」？本机上的笔记和这个笔记本的邮箱配置会被移除；邮箱里的同步邮件不会删除。`)) return
    setBusy('notebook')
    try {
      const data = await invoke('delete_notebook', { id: book.id })
      apply(data)
      setActiveTag(null)
      setComposer('')
      setEditing(null)
      toast('已删除笔记本')
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
            <p>{notebook.name} · {account ? '邮箱同步' : '仅本机'}</p>
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

      <nav className="tabs" aria-label="笔记本">
        <div className="tabs-scroll">
          {notebooks.map((book) => (
            <button
              type="button"
              key={book.id}
              className={`tab ${book.id === active ? 'active' : ''}`}
              title={book.lastError || (book.configured ? `${book.name} · 已连接邮箱` : `${book.name} · 仅本机`)}
              onClick={() => void switchNotebook(book)}
              onDoubleClick={() => openRenameNotebook(book)}
              disabled={Boolean(busy)}
            >
              <span className="tab-name">{book.name}</span>
              {book.lastError ? (
                <span className="tab-dot error" title={book.lastError} />
              ) : book.pending > 0 ? (
                <span className="tab-count">{book.pending}</span>
              ) : null}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="tab-add"
          title="新建笔记本"
          aria-label="新建笔记本"
          onClick={openCreateNotebook}
          disabled={notebooks.length >= 20 || Boolean(busy)}
        >
          +
        </button>
        <div className="tab-tools" ref={notebookMenuRef}>
          <button
            type="button"
            className="icon-btn tab-more"
            title="管理当前笔记本"
            aria-label="管理当前笔记本"
            onClick={() => setNotebookMenu((open) => !open)}
            disabled={Boolean(busy)}
          >
            ⋯
          </button>
          {notebookMenu ? (
            <div className="tab-menu" role="menu">
              <button type="button" role="menuitem" onClick={() => openRenameNotebook(notebook)}>
                重命名
              </button>
              <button
                type="button"
                role="menuitem"
                className="danger-text"
                onClick={() => void removeNotebook(notebook)}
                disabled={notebooks.length <= 1}
              >
                删除笔记本
              </button>
            </div>
          ) : null}
        </div>
      </nav>

      {fatal ? <div className="banner error">{fatal}</div> : null}
      {sync.lastError ? <div className="banner error">上次同步失败：{sync.lastError}</div> : null}
      {!account ? (
        <div className="banner local-banner">
          <div>
            <strong>只保存在这台电脑</strong>
            <span>连接邮箱后，笔记会同步到你邮箱里的文件夹，并在多台设备间保持一致。一个邮箱只能绑定一个笔记本。</span>
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
            placeholder="现在在想什么？用 #标签 归类，支持 Markdown…"
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
            <span className="hint">#标签 · Markdown · ⌘/Ctrl + Enter 保存</span>
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

        <div className="tag-bar" aria-label="标签筛选">
          <button
            type="button"
            className={`tag ${!activeTag ? 'active' : ''}`}
            onClick={() => setActiveTag(null)}
          >
            全部 <span className="tag-count">{notes.length}</span>
          </button>
          {tagEntries.map(([tag, count]) => (
            <button
              type="button"
              key={tag}
              className={`tag ${activeTag === tag ? 'active' : ''}`}
              onClick={() => setActiveTag(tag)}
            >
              #{tag} <span className="tag-count">{count}</span>
            </button>
          ))}
          {tagEntries.length === 0 ? <span className="tag-hint">写 #标签 就能在这里筛选</span> : null}
        </div>

        <div className="list-head">
          <span>{activeTag ? `#${activeTag} · ${filteredNotes.length} 条` : `${notes.length} 条笔记`}</span>
          <span>{pending > 0 ? `${pending} 条待同步` : account ? '已同步' : ''}</span>
        </div>

        {notes.length === 0 ? (
          <section className="empty">
            <div className="empty-icon">✎</div>
            <h2>还没有笔记</h2>
            <p>写下一句话，剩下的可以慢一点。</p>
          </section>
        ) : filteredNotes.length === 0 ? (
          <section className="empty">
            <div className="empty-icon">#</div>
            <h2>这个标签下还没有笔记</h2>
            <button type="button" className="small-btn" onClick={() => setActiveTag(null)}>查看全部</button>
          </section>
        ) : (
          <section className="notes">
            {filteredNotes.map((note) => (
              <NoteCard
                key={note.id}
                note={note}
                onEdit={startEdit}
                onDelete={(item) => void removeNote(item)}
                onTag={(tag) => setActiveTag(tag)}
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
          notebook={notebook}
          account={account}
          sync={sync}
          pending={pending}
          busy={busy}
          onClose={() => setSettingsOpen(false)}
          onSaved={(data, message = '邮箱已连接') => {
            apply(data)
            setSettingsOpen(false)
            toast(message)
          }}
          onSync={syncNow}
          onToast={toast}
        />
      ) : null}

      {notebookDialog ? (
        <div className="modal" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !notebookSaving) setNotebookDialog(null)
        }}>
          <form
            className="dialog small-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={notebookDialog.mode === 'create' ? '新建笔记本' : '重命名笔记本'}
            onSubmit={(event) => {
              event.preventDefault()
              void submitNotebookName()
            }}
          >
            <div className="dialog-head">
              <div>
                <h2>{notebookDialog.mode === 'create' ? '新建笔记本' : '重命名笔记本'}</h2>
                <p className="dialog-sub">笔记本只在本机管理，名称不会上传到邮箱。</p>
              </div>
              <button type="button" className="icon-btn" onClick={() => setNotebookDialog(null)} disabled={notebookSaving}>×</button>
            </div>
            <label className="form-label">
              <span>名称</span>
              <input
                value={notebookDialog.name}
                maxLength={32}
                autoFocus
                onChange={(event) => setNotebookDialog((current) => ({ ...current, name: event.target.value }))}
              />
            </label>
            {notebookDialog.error ? <div className="form-error">{notebookDialog.error}</div> : null}
            <div className="dialog-actions">
              <button type="button" className="ghost" onClick={() => setNotebookDialog(null)} disabled={notebookSaving}>取消</button>
              <button type="submit" className="primary" disabled={notebookSaving || !notebookDialog.name.trim()}>
                {notebookSaving ? '保存中…' : '保存'}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  )
}

function SettingsDialog({ notebook, account, sync, pending, busy, onClose, onSaved, onSync, onToast }) {
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
      onSaved(data, '邮箱已连接')
    } catch (error) {
      setFormError(String(error))
    } finally {
      setSubmitting(false)
    }
  }

  async function disconnect() {
    try {
      const data = await invoke('disconnect_account')
      onSaved(data, '已断开邮箱')
      setShowForm(true)
      setForm((current) => ({ ...current, password: '' }))
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
            <p className="dialog-sub">当前笔记本：{notebook.name}。每条笔记修订会写成一封邮件，放进你自己邮箱的同步文件夹。</p>
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
              密码保存在 macOS 钥匙串 / Windows 凭据管理器，不写进笔记文件。QQ、163、Gmail、iCloud 请使用应用专用密码。一个邮箱只能绑定一个笔记本。
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
