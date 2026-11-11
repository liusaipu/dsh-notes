window.__ModuleLoader__.load({
  id: 'dsh-quicknotes',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useCallback, useEffect, useMemo, useRef, useState } = React

    const API = '/flomo/api'
    const CACHE_PREFIX = 'dsh.flomo-notes.cache.v2.'
    const LEGACY_CACHE_KEY = 'dsh.flomo-notes.cache.v1'
    const ACTIVE_KEY = 'dsh.flomo-notes.active'
    const TAG_MATCH = /#([\p{L}\p{N}_-]{1,32})/gu
    const FALLBACK_ABOUT = {
      name: 'dsh-quicknotes',
      version: '1.3.1',
      developer: 'liusaipu',
      updatedAt: '2026-11-11',
      repository: 'https://github.com/liusaipu/dsh-quicknotes',
      license: 'MIT',
    }

    const EN = {
      label: 'Quick Memo',
      title: 'Quick Memo',
      subtitle: 'Catch what is on your mind. Your notes follow you through your mailbox.',
      'composer.placeholder': 'What is on your mind? Add #tags anywhere.',
      'composer.hint': '#tags · Markdown · paste images',
      'composer.submit': 'Capture',
      'composer.markdownHint': 'Markdown · paste images',
      'image.insert': 'Insert image',
      'image.uploading': 'Uploading image…',
      'image.added': 'Image added',
      'image.failed': 'Image upload failed',
      'image.alt': 'image',
      'md.bold': 'Bold',
      'md.code': 'Code',
      'md.preview': 'Preview',
      'md.edit': 'Edit source',
      'md.boldText': 'bold text',
      'search.placeholder': 'Search notes or #tags',
      'search.clear': 'Clear search',
      'unit.notes': 'notes',
      'unit.pending': 'pending',
      'tag.all': 'All',
      'empty.title': 'Nothing captured yet',
      'empty.body': 'Start with one line. The rest can wait.',
      'empty.action': 'Write the first note',
      'empty.search': 'No note matches this search.',
      'empty.tag': 'No note has this tag yet.',
      'status.local': 'This device only',
      'status.syncing': 'Syncing…',
      'status.synced': 'Synced',
      'status.error': 'Sync failed',
      'status.pending': 'pending',
      'banner.local.title': 'Notes are saved on this computer only',
      'banner.local.body':
        'Connect an email to mirror each note into one folder in your mailbox. Use the same email in another DSH Desktop to keep both in step.',
      'banner.local.action': 'Connect email',
      'banner.offline': 'The local notes service is unreachable. Showing the cached copy.',
      'banner.retry': 'Retry',
      'banner.error': 'Last sync failed:',
      'sync.now': 'Sync now',
      'sync.tooltip': 'Sync with mailbox',
      'settings.title': 'Email sync',
      'settings.close': 'Close',
      'settings.intro':
        'Each note revision becomes a small email message in one mailbox folder. There is no extra server to run.',
      'account.email': 'Email address',
      'account.password': 'App password',
      'account.passwordHint':
        'Not your normal login password. Gmail, iCloud, QQ and 163 require an app-specific password or authorization code.',
      'account.advanced': 'Advanced',
      'account.server': 'IMAP server',
      'account.serverPlaceholder': 'Detected from the email domain',
      'account.port': 'Port',
      'account.folder': 'Sync folder',
      'account.folderHint': 'Created in the mailbox if missing. Default: DSH Notes.',
      'account.connect': 'Connect and verify',
      'account.connecting': 'Connecting…',
      'account.connected': 'Connected',
      'account.disconnect': 'Disconnect',
      'account.disconnectConfirm': 'Confirm disconnect',
      'account.reconnect': 'Change account',
      'account.lastSync': 'Last sync',
      'account.never': 'Not synced yet',
      'account.pending': 'Pending',
      'account.verifyNote':
        'Connecting writes a verification message into this folder and reads it back, proving read and write access. The message is removed afterwards.',
      'account.security':
        'The password is stored in the local DSH credential store, never returned to this page and never written into note files. Prefer an app password you can revoke.',
      'account.outlook':
        'Outlook / Microsoft 365 currently blocks password-based IMAP. Gmail, iCloud, QQ and 163 work with app passwords.',
      'account.success': 'Mailbox connected. Importing existing notes…',
      'about.title': 'About',
      'about.description': 'A flomo-style inbox with Markdown, images, and sync through your own mailbox.',
      'about.version': 'Version',
      'about.developer': 'Developer',
      'about.updated': 'Updated',
      'about.license': 'License',
      'about.repository': 'GitHub repository',
      'about.releases': 'Releases',
      'about.note': 'Notes stay on this computer and sync through your own mailbox. No third-party server is involved.',
      'about.close': 'Close',
      'tabs.new': 'New notebook',
      'tabs.rename': 'Rename notebook',
      'tabs.delete': 'Delete notebook',
      'tabs.connect': 'Connect email',
      'tabs.actions': 'Notebook actions',
      'tabs.namePlaceholder': 'Notebook name',
      'tabs.deleteConfirm':
        'Delete this notebook? Only this computer is cleaned; the sync messages in the mailbox stay. If another device still uses that email, notes may come back.',
      'notebook.defaultName': 'Notebook',
      'notebook.save': 'Save',
      'notebook.cancel': 'Cancel',
      'notebook.created': 'Notebook created',
      'notebook.renamed': 'Notebook renamed',
      'notebook.deleted': 'Notebook deleted',
      'notebook.last': 'Keep at least one notebook',
      'notebook.conflict': 'This email is already used by another notebook.',
      'note.edit': 'Edit note',
      'note.delete': 'Delete note',
      'note.confirm': 'Confirm delete',
      'note.save': 'Save',
      'note.cancel': 'Cancel',
      'note.editHint': '⌘ + Enter to save · Esc to cancel',
      'note.empty': 'A note cannot be empty',
      'toast.saved': 'Saved',
      'toast.deleted': 'Deleted',
      'toast.synced': 'Sync started',
      'toast.connected': 'Email connected',
      'toast.disconnected': 'Disconnected. Notes stay on this computer.',
      'toast.error': 'Something went wrong',
      'error.empty': 'Write something first.',
      'date.today': 'Today',
      'date.yesterday': 'Yesterday',
      'time.justNow': 'just now',
      'time.minutes': '{n} min ago',
      'time.hours': '{n} h ago',
      'time.days': '{n} d ago',
      'time.never': 'Never',
    }

    const ZH = {
      label: '随手记',
      title: '随手记',
      subtitle: '记下此刻的想法，让笔记跟着邮箱走。',
      'composer.placeholder': '此刻想到什么？用 #标签 分类。',
      'composer.hint': '#标签 · Markdown · 可粘贴图片',
      'composer.submit': '记下来',
      'composer.markdownHint': 'Markdown · 可粘贴图片',
      'image.insert': '插入图片',
      'image.uploading': '图片上传中…',
      'image.added': '图片已插入',
      'image.failed': '图片上传失败',
      'image.alt': '图片',
      'md.bold': '加粗',
      'md.code': '代码',
      'md.preview': '预览',
      'md.edit': '编辑源码',
      'md.boldText': '加粗文字',
      'search.placeholder': '搜索笔记或 #标签',
      'search.clear': '清除搜索',
      'unit.notes': '条笔记',
      'unit.pending': '条待同步',
      'tag.all': '全部',
      'empty.title': '还没有记录',
      'empty.body': '先写下一句话，剩下的交给时间。',
      'empty.action': '写第一条',
      'empty.search': '没有找到匹配的记录。',
      'empty.tag': '这个标签下还没有记录。',
      'status.local': '仅本机',
      'status.syncing': '同步中…',
      'status.synced': '已同步',
      'status.error': '同步失败',
      'status.pending': '待同步',
      'banner.local.title': '这些记录目前只保存在这台电脑',
      'banner.local.body':
        '连接一个邮箱后，每条笔记会写入邮箱里的专用文件夹；在其他 DSH Desktop 用同一邮箱连接即可双向同步。',
      'banner.local.action': '连接邮箱',
      'banner.offline': '暂时无法连接本地笔记服务，正在显示缓存内容。',
      'banner.retry': '重试',
      'banner.error': '上次同步失败：',
      'sync.now': '立即同步',
      'sync.tooltip': '与邮箱同步',
      'settings.title': '邮箱同步',
      'settings.close': '关闭',
      'settings.intro': '每条笔记会作为一封小邮件写入邮箱文件夹，不需要额外搭服务器。',
      'account.email': '邮箱地址',
      'account.password': '应用专用密码',
      'account.passwordHint': '不是邮箱登录密码。Gmail、iCloud、QQ、163 需要先在邮箱设置中开启 IMAP 并生成授权码。',
      'account.advanced': '高级设置',
      'account.server': 'IMAP 服务器',
      'account.serverPlaceholder': '留空则按邮箱自动识别',
      'account.port': '端口',
      'account.folder': '同步文件夹',
      'account.folderHint': '不存在时会自动创建，默认「DSH Notes」。',
      'account.connect': '连接并验证',
      'account.connecting': '正在连接邮箱…',
      'account.connected': '已连接',
      'account.disconnect': '断开连接',
      'account.disconnectConfirm': '确认断开',
      'account.reconnect': '更换邮箱',
      'account.lastSync': '上次同步',
      'account.never': '尚未同步',
      'account.pending': '待同步',
      'account.verifyNote': '连接时会向该文件夹写入一封验证邮件并立即读回，确认读写权限后删除。',
      'account.security':
        '密码保存在本机 DSH 凭据库中，不会返回给页面，也不会写入笔记文件。建议使用可随时撤销的应用专用密码。',
      'account.outlook':
        'Outlook / Microsoft 365 目前限制密码方式登录 IMAP，暂不支持；Gmail、iCloud、QQ、163 可使用应用专用密码。',
      'account.success': '邮箱已连接，正在导入已有笔记…',
      'about.title': '关于',
      'about.description': '像 flomo 一样随手记录，支持 Markdown、图片，并通过你自己的邮箱在多台 DSH Desktop 之间同步。',
      'about.version': '版本',
      'about.developer': '开发者',
      'about.updated': '更新日期',
      'about.license': '许可证',
      'about.repository': 'GitHub 仓库',
      'about.releases': '发布记录',
      'about.note': '笔记保存在本机，并通过你自己的邮箱同步；不经过第三方服务器。',
      'about.close': '关闭',
      'tabs.new': '新建笔记本',
      'tabs.rename': '重命名笔记本',
      'tabs.delete': '删除笔记本',
      'tabs.connect': '连接邮箱',
      'tabs.actions': '笔记本操作',
      'tabs.namePlaceholder': '笔记本名称',
      'tabs.deleteConfirm':
        '删除这个笔记本？只清理本机目录，邮箱里的同步邮件不会删除；如果其他设备还连着该邮箱，笔记可能会再次同步回来。',
      'notebook.defaultName': '笔记本',
      'notebook.save': '保存',
      'notebook.cancel': '取消',
      'notebook.created': '笔记本已创建',
      'notebook.renamed': '笔记本已重命名',
      'notebook.deleted': '笔记本已删除',
      'notebook.last': '至少保留一个笔记本',
      'notebook.conflict': '这个邮箱已经被另一个笔记本使用。',
      'note.edit': '编辑笔记',
      'note.delete': '删除笔记',
      'note.confirm': '确认删除',
      'note.save': '保存',
      'note.cancel': '取消',
      'note.editHint': '⌘ + Enter 保存 · Esc 取消',
      'note.empty': '内容不能为空',
      'toast.saved': '已保存',
      'toast.deleted': '已删除',
      'toast.synced': '已开始同步',
      'toast.connected': '邮箱连接成功',
      'toast.disconnected': '已断开邮箱同步，笔记仍保存在本机。',
      'toast.error': '操作失败',
      'error.empty': '先写点什么吧。',
      'date.today': '今天',
      'date.yesterday': '昨天',
      'time.justNow': '刚刚',
      'time.minutes': '{n} 分钟前',
      'time.hours': '{n} 小时前',
      'time.days': '{n} 天前',
      'time.never': '从未',
    }

    let localeService = null
    let t = (key) => key

    function activeLocaleId() {
      try {
        const snapshot = localeService && localeService.getLocale()
        return (snapshot && snapshot.active) || 'en'
      } catch {
        return 'en'
      }
    }

    function useTranslate() {
      const [, bump] = useState(0)
      useEffect(() => {
        if (!localeService || typeof localeService.subscribe !== 'function') return undefined
        return localeService.subscribe(() => bump((value) => value + 1))
      }, [])
      return t
    }

    /* ---------- data helpers ---------- */

    async function fetchState(notebook) {
      const url = notebook ? `${API}?notebook=${encodeURIComponent(notebook)}` : API
      const response = await fetch(url, { method: 'GET', headers: { accept: 'application/json' } })
      const data = await response.json().catch(() => null)
      if (!response.ok || !data || data.ok !== true) {
        const error = new Error((data && data.error) || `HTTP ${response.status}`)
        error.code = data && data.code
        throw error
      }
      return data
    }

    async function callApi(action, payload = {}, notebook = '') {
      const response = await fetch(API, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, ...(notebook ? { notebook } : {}), ...payload }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok || !data || data.ok !== true) {
        const error = new Error((data && data.error) || `HTTP ${response.status}`)
        error.code = data && data.code
        throw error
      }
      return data
    }

    function readCache(notebook) {
      if (!notebook) return null
      try {
        const raw = window.localStorage.getItem(CACHE_PREFIX + notebook)
        if (!raw) return null
        const parsed = JSON.parse(raw)
        if (!parsed || !Array.isArray(parsed.notes)) return null
        return {
          notes: parsed.notes,
          account: parsed.account || null,
          sync: parsed.sync || null,
          about: parsed.about || null,
          version: Number(parsed.version) || 0,
          draft: typeof parsed.draft === 'string' ? parsed.draft : '',
          query: typeof parsed.query === 'string' ? parsed.query : '',
          activeTag: typeof parsed.activeTag === 'string' ? parsed.activeTag : '',
        }
      } catch {
        return null
      }
    }

    function writeCache(notebook, value) {
      if (!notebook) return
      try {
        window.localStorage.setItem(CACHE_PREFIX + notebook, JSON.stringify(value))
      } catch {
        /* cache is a convenience; never break the page over it */
      }
    }

    function readActiveNotebook() {
      try {
        return window.localStorage.getItem(ACTIVE_KEY) || ''
      } catch {
        return ''
      }
    }

    function writeActiveNotebook(notebook) {
      try {
        if (notebook) window.localStorage.setItem(ACTIVE_KEY, notebook)
        else window.localStorage.removeItem(ACTIVE_KEY)
      } catch {
        /* ignore quota / disabled storage */
      }
    }

    function dropLegacyCache() {
      try {
        window.localStorage.removeItem(LEGACY_CACHE_KEY)
      } catch {
        /* ignore */
      }
    }

    function tagsOf(text) {
      const tags = []
      const seen = new Set()
      for (const match of String(text || '').matchAll(TAG_MATCH)) {
        const tag = match[1]
        if (!tag || seen.has(tag)) continue
        seen.add(tag)
        tags.push(tag)
      }
      return tags
    }

    const IMAGE_PATH = '/flomo/api/image/'
    const IMAGE_ID_PATTERN = /^[A-Za-z0-9_-]{8,80}$/
    const INLINE_MARKDOWN =
      /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)|\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)|`([^`\n]+)`|\*\*([^*\n]+)\*\*|__([^_\n]+)__|~~([^~\n]+)~~|\*([^*\n]+)\*|_([^_\n]+)_|(https?:\/\/[^\s<>]+)|(#[^\s#]{1,32})/g

    function imageSource(raw, notebook) {
      const value = String(raw || '').trim()
      if (value.startsWith('dsh-image:')) {
        const id = value.slice('dsh-image:'.length)
        if (!IMAGE_ID_PATTERN.test(id)) return ''
        return notebook
          ? IMAGE_PATH + encodeURIComponent(notebook) + '/' + encodeURIComponent(id)
          : IMAGE_PATH + encodeURIComponent(id)
      }
      if (/^https?:\/\//i.test(value)) return value
      return ''
    }

    function safeHref(raw) {
      const value = String(raw || '').trim()
      if (/^https?:\/\//i.test(value) || /^mailto:/i.test(value)) return value
      return ''
    }

    function renderInline(text, ctx, prefix, depth) {
      if (depth > 4) return [text]
      const nodes = []
      const re = new RegExp(INLINE_MARKDOWN.source, 'g')
      let last = 0
      let match
      let index = 0
      while ((match = re.exec(text))) {
        if (match.index > last) nodes.push(text.slice(last, match.index))
        const key = prefix + '-' + String(index++)
        if (match[1] !== undefined) {
          const alt = match[1] || (ctx && ctx.alt) || 'image'
          const src = imageSource(match[2], ctx && ctx.notebook)
          if (src) {
            nodes.push(
              h('img', {
                key,
                className: 'qm-md-img',
                src,
                alt,
                loading: 'lazy',
                decoding: 'async',
                referrerPolicy: 'no-referrer',
              }),
            )
          } else {
            nodes.push(alt)
          }
        } else if (match[3] !== undefined) {
          const href = safeHref(match[4])
          if (!href) {
            nodes.push(...renderInline(match[3], ctx, key + '-label', depth + 1))
          } else {
            nodes.push(
              h(
                'a',
                {
                  key,
                  className: 'qm-md-link',
                  href,
                  target: '_blank',
                  rel: 'noopener noreferrer',
                },
                ...renderInline(match[3], ctx, key + '-label', depth + 1),
              ),
            )
          }
        } else if (match[5] !== undefined) {
          nodes.push(h('code', { key, className: 'qm-md-inline-code' }, match[5]))
        } else if (match[6] !== undefined || match[7] !== undefined) {
          nodes.push(
            h(
              'strong',
              { key },
              ...renderInline(match[6] !== undefined ? match[6] : match[7], ctx, key + '-strong', depth + 1),
            ),
          )
        } else if (match[8] !== undefined) {
          nodes.push(h('del', { key }, ...renderInline(match[8], ctx, key + '-del', depth + 1)))
        } else if (match[9] !== undefined || match[10] !== undefined) {
          nodes.push(
            h(
              'em',
              { key },
              ...renderInline(match[9] !== undefined ? match[9] : match[10], ctx, key + '-em', depth + 1),
            ),
          )
        } else if (match[11] !== undefined) {
          const href = safeHref(match[11])
          if (href) {
            nodes.push(
              h(
                'a',
                { key, className: 'qm-md-link', href, target: '_blank', rel: 'noopener noreferrer' },
                match[11],
              ),
            )
          } else {
            nodes.push(match[11])
          }
        } else if (match[12] !== undefined) {
          const tag = match[12].slice(1)
          if (ctx && typeof ctx.onTag === 'function') {
            nodes.push(
              h(
                'button',
                {
                  key,
                  type: 'button',
                  className: 'qm-inline-tag',
                  onClick: (event) => {
                    event.stopPropagation()
                    ctx.onTag(tag)
                  },
                },
                match[12],
              ),
            )
          } else {
            nodes.push(match[12])
          }
        }
        last = re.lastIndex
      }
      if (last < text.length) nodes.push(text.slice(last))
      return nodes
    }

    function tableSeparator(line) {
      return /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line)
    }

    function isTableStart(lines, index) {
      return (
        index + 1 < lines.length &&
        /\|/.test(lines[index] || '') &&
        tableSeparator(lines[index + 1] || '')
      )
    }

    function splitTableRow(line) {
      let text = String(line || '').trim()
      if (text.startsWith('|')) text = text.slice(1)
      if (text.endsWith('|')) text = text.slice(0, -1)
      return text.split('|').map((cell) => cell.trim())
    }

    function renderMarkdown(text, ctx) {
      const source = String(text || '').replace(/\r\n?/g, '\n')
      const lines = source.split('\n')
      const blocks = []
      let key = 0
      let i = 0
      const blank = (line) => /^\s*$/.test(line)
      const startsBlock = (line) =>
        /^\s*```/.test(line) ||
        /^#{1,6}\s+/.test(line) ||
        /^\s*>/.test(line) ||
        /^\s*[-*+]\s+/.test(line) ||
        /^\s*\d+[.)]\s+/.test(line) ||
        /^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line)
      const inline = (value, prefix) => renderInline(value, ctx || {}, prefix, 0)

      while (i < lines.length) {
        if (blank(lines[i])) {
          i += 1
          continue
        }
        const line = lines[i]
        if (/^\s*```/.test(line)) {
          const language = line.replace(/^\s*```/, '').trim()
          const code = []
          i += 1
          while (i < lines.length && !/^\s*```/.test(lines[i])) {
            code.push(lines[i])
            i += 1
          }
          if (i < lines.length) i += 1
          blocks.push(
            h(
              'pre',
              { key: 'b' + String(key++), className: 'qm-md-pre' },
              h('code', { className: language ? 'language-' + language : undefined }, code.join('\n')),
            ),
          )
          continue
        }
        const heading = line.match(/^(#{1,6})\s+(.*)$/)
        if (heading) {
          const level = Math.min(heading[1].length + 2, 6)
          const blockKey = 'b' + String(key++)
          blocks.push(
            h(
              'h' + String(level),
              { key: blockKey, className: 'qm-md-heading' },
              ...inline(heading[2], blockKey + '-h'),
            ),
          )
          i += 1
          continue
        }
        if (/^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line)) {
          blocks.push(h('hr', { key: 'b' + String(key++) }))
          i += 1
          continue
        }
        if (/^\s*>/.test(line)) {
          const quote = []
          while (i < lines.length && /^\s*>/.test(lines[i])) {
            quote.push(lines[i].replace(/^\s*>\s?/, ''))
            i += 1
          }
          const blockKey = 'b' + String(key++)
          blocks.push(
            h('blockquote', { key: blockKey }, ...inline(quote.join('\n'), blockKey + '-q')),
          )
          continue
        }
        if (isTableStart(lines, i)) {
          const header = splitTableRow(lines[i])
          i += 2
          const rows = []
          while (i < lines.length && !blank(lines[i]) && /\|/.test(lines[i])) {
            rows.push(splitTableRow(lines[i]))
            i += 1
          }
          const blockKey = 'b' + String(key++)
          const headerRow = h(
            'tr',
            null,
            ...header.map((cell, column) =>
              h(
                'th',
                { key: blockKey + '-th-' + String(column) },
                ...inline(cell, blockKey + '-th-' + String(column)),
              ),
            ),
          )
          const bodyRows = rows.map((row, rowIndex) =>
            h(
              'tr',
              { key: blockKey + '-tr-' + String(rowIndex) },
              ...header.map((_, column) =>
                h(
                  'td',
                  { key: blockKey + '-td-' + String(rowIndex) + '-' + String(column) },
                  ...inline(row[column] || '', blockKey + '-td-' + String(rowIndex) + '-' + String(column)),
                ),
              ),
            ),
          )
          blocks.push(
            h(
              'div',
              { key: blockKey, className: 'qm-md-table-wrap' },
              h(
                'table',
                { className: 'qm-md-table' },
                h('thead', null, headerRow),
                bodyRows.length > 0 ? h('tbody', null, ...bodyRows) : null,
              ),
            ),
          )
          continue
        }
        const unordered = line.match(/^\s*[-*+]\s+(.*)$/)
        if (unordered) {
          const items = []
          while (i < lines.length) {
            const match = lines[i].match(/^\s*[-*+]\s+(.*)$/)
            if (!match) break
            items.push(match[1])
            i += 1
          }
          const blockKey = 'b' + String(key++)
          blocks.push(
            h(
              'ul',
              { key: blockKey },
              ...items.map((item, itemIndex) => {
                const task = item.match(/^\[([ xX])\]\s+(.*)$/)
                if (task) {
                  return h(
                    'li',
                    { key: blockKey + '-li-' + String(itemIndex), className: 'qm-md-task' },
                    h('input', {
                      key: 'check',
                      type: 'checkbox',
                      checked: task[1].toLowerCase() === 'x',
                      disabled: true,
                      readOnly: true,
                    }),
                    ...inline(task[2], blockKey + '-li-' + String(itemIndex)),
                  )
                }
                return h(
                  'li',
                  { key: blockKey + '-li-' + String(itemIndex) },
                  ...inline(item, blockKey + '-li-' + String(itemIndex)),
                )
              }),
            ),
          )
          continue
        }
        const ordered = line.match(/^\s*\d+[.)]\s+(.*)$/)
        if (ordered) {
          const items = []
          while (i < lines.length) {
            const match = lines[i].match(/^\s*\d+[.)]\s+(.*)$/)
            if (!match) break
            items.push(match[1])
            i += 1
          }
          const blockKey = 'b' + String(key++)
          blocks.push(
            h(
              'ol',
              { key: blockKey },
              ...items.map((item, itemIndex) =>
                h(
                  'li',
                  { key: blockKey + '-li-' + String(itemIndex) },
                  ...inline(item, blockKey + '-li-' + String(itemIndex)),
                ),
              ),
            ),
          )
          continue
        }
        const paragraph = []
        while (
          i < lines.length &&
          !blank(lines[i]) &&
          !startsBlock(lines[i]) &&
          !isTableStart(lines, i)
        ) {
          paragraph.push(lines[i])
          i += 1
        }
        if (paragraph.length === 0) {
          paragraph.push(lines[i])
          i += 1
        }
        const blockKey = 'b' + String(key++)
        blocks.push(
          h('p', { key: blockKey }, ...inline(paragraph.join('\n'), blockKey + '-p')),
        )
      }
      return h('div', { className: 'qm-md' }, ...blocks)
    }

    function MarkdownNote({ text, onTag, alt, notebook }) {
      return renderMarkdown(text, { onTag, alt, notebook })
    }

    const IMAGE_MAX_EDGE = 1600
    const IMAGE_TARGET_BYTES = 900 * 1024
    const IMAGE_HARD_BYTES = 1.5 * 1024 * 1024

    function loadImageSource(file) {
      if (typeof createImageBitmap === 'function') {
        return createImageBitmap(file).catch(
          () =>
            new Promise((resolve, reject) => {
              const image = new Image()
              const url = URL.createObjectURL(file)
              image.onload = () => {
                URL.revokeObjectURL(url)
                resolve(image)
              }
              image.onerror = () => {
                URL.revokeObjectURL(url)
                reject(new Error('无法读取图片'))
              }
              image.src = url
            }),
        )
      }
      return new Promise((resolve, reject) => {
        const image = new Image()
        const url = URL.createObjectURL(file)
        image.onload = () => {
          URL.revokeObjectURL(url)
          resolve(image)
        }
        image.onerror = () => {
          URL.revokeObjectURL(url)
          reject(new Error('无法读取图片'))
        }
        image.src = url
      })
    }

    function canvasBlob(canvas, type, quality) {
      return new Promise((resolve) => canvas.toBlob(resolve, type, quality))
    }

    async function prepareImage(file) {
      if (!file || !file.type || !file.type.startsWith('image/')) {
        throw new Error('不是图片文件')
      }
      if (file.type === 'image/gif' && file.size <= IMAGE_HARD_BYTES) return file
      const source = await loadImageSource(file)
      const width = source.width || source.naturalWidth || 0
      const height = source.height || source.naturalHeight || 0
      if (!width || !height) throw new Error('无法读取图片尺寸')
      let best = null
      for (const [edge, quality] of [
        [1600, 0.82],
        [1280, 0.72],
        [1024, 0.62],
      ]) {
        const scale = Math.min(1, edge / Math.max(width, height))
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(width * scale))
        canvas.height = Math.max(1, Math.round(height * scale))
        const context = canvas.getContext('2d')
        if (!context) throw new Error('无法处理图片')
        context.drawImage(source, 0, 0, canvas.width, canvas.height)
        const blob =
          (await canvasBlob(canvas, 'image/webp', quality)) ||
          (await canvasBlob(canvas, 'image/png'))
        if (blob) {
          best = blob
          if (blob.size <= IMAGE_TARGET_BYTES) break
        }
      }
      if (!best || best.size > IMAGE_HARD_BYTES) throw new Error('图片过大，请压缩后重试')
      if (file.size <= best.size && file.size <= IMAGE_HARD_BYTES && file.type !== 'image/svg+xml') {
        return file
      }
      return best
    }

    function readAsDataUrl(blob) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result || ''))
        reader.onerror = () => reject(new Error('无法读取图片'))
        reader.readAsDataURL(blob)
      })
    }

    function insertAtSelection(ref, current, setValue, snippet, block = true) {
      const element = ref && ref.current
      const start =
        element && typeof element.selectionStart === 'number' ? element.selectionStart : current.length
      const end =
        element && typeof element.selectionEnd === 'number' ? element.selectionEnd : current.length
      const before = current.slice(0, start)
      const after = current.slice(end)
      const left = block && before && !before.endsWith('\n') ? '\n' : ''
      const right = block && after && !after.startsWith('\n') ? '\n' : ''
      const insert = left + snippet + right
      const next = before + insert + after
      setValue(next)
      if (element) {
        requestAnimationFrame(() => {
          try {
            element.focus()
            const position = start + insert.length
            element.setSelectionRange(position, position)
          } catch {
            /* focus can fail while the card is closing */
          }
        })
      }
      return next
    }

    function ImageIcon() {
      return h(
        'svg',
        {
          width: 16,
          height: 16,
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.8,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': true,
        },
        h('rect', { x: 3.5, y: 4.5, width: 17, height: 15, rx: 2.2 }),
        h('circle', { cx: 8.3, cy: 9.2, r: 1.6 }),
        h('path', { d: 'm4.5 17 5-5 3.2 3.2 3-2.8 4.3 4.1' }),
      )
    }

    function ImageButton({ onFiles, disabled, title }) {
      const inputRef = useRef(null)
      return h(
        React.Fragment,
        null,
        h(
          'button',
          {
            type: 'button',
            className: 'qm-tool',
            title,
            'aria-label': title,
            disabled,
            onClick: () => {
              if (inputRef.current) inputRef.current.click()
            },
          },
          ImageIcon(),
        ),
        h('input', {
          ref: inputRef,
          type: 'file',
          accept: 'image/png,image/jpeg,image/webp,image/gif',
          multiple: true,
          style: { display: 'none' },
          onChange: (event) => {
            const files = Array.from(event.target.files || [])
            event.target.value = ''
            if (files.length > 0) onFiles(files)
          },
        }),
      )
    }

    function relativeTime(value, tr) {
      const stamp = Number(value) || 0
      if (!stamp) return tr('time.never')
      const diff = Date.now() - stamp
      if (diff < 60000) return tr('time.justNow')
      const minutes = Math.round(diff / 60000)
      if (minutes < 60) return tr('time.minutes').replace('{n}', String(minutes))
      const hours = Math.round(diff / 3600000)
      if (hours < 24) return tr('time.hours').replace('{n}', String(hours))
      const days = Math.round(diff / 86400000)
      if (days < 8) return tr('time.days').replace('{n}', String(days))
      try {
        return new Date(stamp).toLocaleDateString(activeLocaleId())
      } catch {
        return new Date(stamp).toLocaleDateString()
      }
    }

    function clockTime(value) {
      try {
        return new Intl.DateTimeFormat(activeLocaleId(), { hour: '2-digit', minute: '2-digit' }).format(
          new Date(value),
        )
      } catch {
        return new Date(value).toLocaleTimeString()
      }
    }

    function fullTime(value) {
      try {
        return new Date(value).toLocaleString(activeLocaleId())
      } catch {
        return new Date(value).toLocaleString()
      }
    }

    function dayKey(value) {
      const date = new Date(value)
      return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
    }

    function dayLabel(value, tr) {
      const date = new Date(value)
      const now = new Date()
      const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
      const start = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
      const days = Math.round((startToday - start) / 86400000)
      if (days === 0) return tr('date.today')
      if (days === 1) return tr('date.yesterday')
      try {
        return new Intl.DateTimeFormat(activeLocaleId(), {
          month: 'long',
          day: 'numeric',
          weekday: 'short',
        }).format(date)
      } catch {
        return date.toLocaleDateString()
      }
    }

    function rowsFor(text, max) {
      const body = String(text || '')
      const lines = body.split('\n').length
      const wrapped = Math.ceil(body.length / 34)
      return Math.max(2, Math.min(max, Math.max(lines, wrapped)))
    }

    function grouped(notes) {
      const groups = []
      const index = new Map()
      for (const note of notes) {
        const key = dayKey(note.createdAt)
        let group = index.get(key)
        if (!group) {
          group = { key, at: note.createdAt, notes: [] }
          index.set(key, group)
          groups.push(group)
        }
        group.notes.push(note)
      }
      return groups
    }

    /* ---------- artwork ---------- */

    function MemoIcon(props) {
      const size = (props && props.size) || 20
      const active = Boolean(props && props.active)
      return h(
        'svg',
        {
          width: size,
          height: size,
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: active ? 2 : 1.7,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': true,
          style: { display: 'block' },
        },
        h('path', { d: 'M5.5 4.3h8.2L19 9.6v10.1a1.3 1.3 0 0 1-1.3 1.3H5.5a1.3 1.3 0 0 1-1.3-1.3V5.6a1.3 1.3 0 0 1 1.3-1.3Z' }),
        h('path', { d: 'M13.5 4.3v5.4H19' }),
        h('path', { d: 'M7.6 14.4h7.2M7.6 17.6h4.6' }),
        h('path', { d: 'M16.4 13.2c1.5-1.4 2.9-2 4.2-2-.2 1.5-.8 2.8-1.7 3.9-1 1.2-2.2 1.8-3.6 1.8.1-1.3.5-2.5 1.1-3.7Z', fill: 'currentColor', stroke: 'none', opacity: 0.22 }),
      )
    }

    function PlusIcon() {
      return h(
        'svg',
        {
          width: 16,
          height: 16,
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 2,
          strokeLinecap: 'round',
          'aria-hidden': true,
        },
        h('path', { d: 'M12 5v14M5 12h14' }),
      )
    }

    function SearchIcon() {
      return h(
        'svg',
        {
          width: 15,
          height: 15,
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.8,
          strokeLinecap: 'round',
          'aria-hidden': true,
        },
        h('circle', { cx: 11, cy: 11, r: 6.4 }),
        h('path', { d: 'm16 16 4.2 4.2' }),
      )
    }

    function GearIcon() {
      return h(
        'svg',
        {
          width: 17,
          height: 17,
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.7,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': true,
        },
        h('circle', { cx: 12, cy: 12, r: 3.1 }),
        h('path', { d: 'M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 1.56V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 8.9 19.3a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.56-1H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.7 8.9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.56V3a2 2 0 1 1 4 0v.09A1.7 1.7 0 0 0 15.1 4.7a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9c.12.38.53 1 1.56 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1Z' }),
      )
    }

    function InfoIcon() {
      return h(
        'svg',
        {
          width: 17,
          height: 17,
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.8,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': true,
        },
        h('circle', { cx: 12, cy: 12, r: 8.6 }),
        h('path', { d: 'M12 10.8v5.4' }),
        h('path', { d: 'M12 7.6h.01' }),
      )
    }

    function RefreshIcon() {
      return h(
        'svg',
        {
          width: 15,
          height: 15,
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.8,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': true,
        },
        h('path', { d: 'M20 11a8 8 0 1 0-2.3 6.2' }),
        h('path', { d: 'M20 4v7h-7' }),
      )
    }

    function PencilIcon() {
      return h(
        'svg',
        {
          width: 14,
          height: 14,
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.8,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': true,
        },
        h('path', { d: 'm4 20 4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10L4 20Z' }),
        h('path', { d: 'm13.5 7.5 3 3' }),
      )
    }

    function TrashIcon() {
      return h(
        'svg',
        {
          width: 14,
          height: 14,
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.8,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': true,
        },
        h('path', { d: 'M4 7h16' }),
        h('path', { d: 'M9.5 7V5.2A1.2 1.2 0 0 1 10.7 4h2.6a1.2 1.2 0 0 1 1.2 1.2V7' }),
        h('path', { d: 'M6.5 7l.8 12.1A1.9 1.9 0 0 0 9.2 21h5.6a1.9 1.9 0 0 0 1.9-1.9L17.5 7' }),
        h('path', { d: 'M10.5 11v6M13.5 11v6' }),
      )
    }

    function CloseIcon() {
      return h(
        'svg',
        {
          width: 16,
          height: 16,
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.9,
          strokeLinecap: 'round',
          'aria-hidden': true,
        },
        h('path', { d: 'M6 6l12 12M18 6 6 18' }),
      )
    }

    function MailIcon() {
      return h(
        'svg',
        {
          width: 17,
          height: 17,
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.7,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': true,
        },
        h('rect', { x: 3.2, y: 5, width: 17.6, height: 14, rx: 2.4 }),
        h('path', { d: 'm4.5 7 7.5 5.8L19.5 7' }),
      )
    }

    function EmptyArt() {
      return h(
        'svg',
        { width: 120, height: 92, viewBox: '0 0 120 92', 'aria-hidden': true, className: 'qm-empty-art' },
        h('rect', { x: 15, y: 16, width: 58, height: 66, rx: 9, fill: '#f3efe3' }),
        h('path', { d: 'M32 35h24M32 45h18M32 55h22', stroke: '#b7ac8d', strokeWidth: 2.6, strokeLinecap: 'round' }),
        h('rect', { x: 51, y: 21, width: 54, height: 62, rx: 9, fill: '#e9f2e8' }),
        h('path', { d: 'M65 40h26M65 50h20M65 60h23', stroke: '#7ba487', strokeWidth: 2.6, strokeLinecap: 'round' }),
        h('path', { d: 'M84 12c5.8 1.4 9.8 5.3 11.7 11.6-6.6-.6-11.2-4.3-13.7-11.1 1-.4 1.7-.6 2-.5Z', fill: '#5aa377', opacity: 0.9 }),
        h('path', { d: 'M82 17c2.8 2.3 4.8 5 6.1 8.2', stroke: '#eef7ef', strokeWidth: 1.6, strokeLinecap: 'round' }),
      )
    }

    /* ---------- styles ---------- */

    const CSS = `
.qm-page{box-sizing:border-box;height:100%;overflow-y:auto;padding:28px 32px 72px;color:var(--dsw-alias-label-primary);font-size:14px;line-height:1.55;background:transparent}
.qm-shell{max-width:820px;margin:0 auto;display:flex;flex-direction:column;gap:16px}
.qm-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap}
.qm-heading{min-width:0}
.qm-title{margin:0;font-size:22px;font-weight:650;line-height:1.25;letter-spacing:.01em}
.qm-sub{margin:6px 0 0;font-size:13px;color:var(--dsw-alias-label-secondary)}
.qm-head-actions{display:flex;align-items:center;gap:6px;flex-wrap:wrap;justify-content:flex-end}
.qm-tabs-wrap{position:relative;display:flex;align-items:center;gap:6px;min-width:0}
.qm-tabs{display:flex;align-items:center;gap:4px;min-width:0;overflow-x:auto;scrollbar-width:none;padding:1px 0}
.qm-tabs::-webkit-scrollbar{display:none}
.qm-tab{display:inline-flex;align-items:center;gap:6px;height:30px;max-width:190px;padding:0 10px;border-radius:7px;border:1px solid transparent;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12.5px;font-weight:500;white-space:nowrap;cursor:pointer;transition:background .15s,border-color .15s,color .15s}
.qm-tab:hover{background:color-mix(in srgb,var(--dsw-alias-label-primary) 5%,transparent);color:var(--dsw-alias-label-primary)}
.qm-tab[data-active="true"]{background:color-mix(in srgb,var(--dsw-alias-brand-primary) 10%,transparent);border-color:color-mix(in srgb,var(--dsw-alias-brand-primary) 22%,transparent);color:var(--dsw-alias-brand-primary);font-weight:600}
.qm-tab-name{min-width:0;overflow:hidden;text-overflow:ellipsis}
.qm-tab-badge{display:inline-flex;align-items:center;justify-content:center;min-width:16px;height:16px;padding:0 4px;border-radius:999px;background:color-mix(in srgb,var(--dsw-alias-label-primary) 9%,transparent);color:var(--dsw-alias-label-secondary);font-size:9.5px;font-weight:700;line-height:1}
.qm-tab-badge--error{background:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-bg-base)}
.qm-tab-badge--sync{width:7px;min-width:7px;height:7px;padding:0;background:var(--dsw-alias-brand-primary);animation:qm-pulse 1s ease-in-out infinite}
.qm-tab-add,.qm-tab-more{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;flex:none;padding:0;border-radius:7px;border:1px solid transparent;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:18px;line-height:1;cursor:pointer}
.qm-tab-add:hover,.qm-tab-more:hover{background:color-mix(in srgb,var(--dsw-alias-label-primary) 6%,transparent);color:var(--dsw-alias-label-primary)}
.qm-tab-more{font-size:16px}
.qm-tab-menu{position:absolute;top:36px;right:0;z-index:30;display:flex;flex-direction:column;min-width:150px;padding:5px;border-radius:9px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);box-shadow:0 10px 28px rgba(0,0,0,.16)}
.qm-tab-menu-item{display:flex;align-items:center;width:100%;height:30px;padding:0 9px;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:12.5px;text-align:left;cursor:pointer}
.qm-tab-menu-item:hover{background:color-mix(in srgb,var(--dsw-alias-label-primary) 6%,transparent)}
.qm-tab-menu-item--danger{color:var(--dsw-alias-state-error-primary)}
.qm-nb-dialog{width:min(400px,100%)}
.qm-status{display:inline-flex;align-items:center;gap:7px;height:30px;padding:0 10px;border-radius:999px;border:1px solid transparent;background:color-mix(in srgb,var(--dsw-alias-label-primary) 5%,transparent);font:inherit;font-size:12px;color:var(--dsw-alias-label-secondary);white-space:nowrap;cursor:default}
button.qm-status{cursor:pointer}
button.qm-status:hover{border-color:var(--dsw-alias-border-l1)}
.qm-dot{width:6px;height:6px;border-radius:50%;background:currentColor;opacity:.55}
.qm-status[data-state="ok"]{color:var(--dsw-alias-state-success-primary)}
.qm-status[data-state="sync"]{color:var(--dsw-alias-brand-primary)}
.qm-status[data-state="sync"] .qm-dot{animation:qm-pulse 1s ease-in-out infinite}
.qm-status[data-state="error"]{color:var(--dsw-alias-state-error-primary)}
.qm-status[data-state="local"]{color:var(--dsw-alias-label-secondary)}
@keyframes qm-pulse{0%,100%{opacity:.25}50%{opacity:1}}
.qm-icon-btn{display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;padding:0;border-radius:8px;border:1px solid transparent;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;transition:background .15s,border-color .15s,color .15s}
.qm-icon-btn:hover:not(:disabled){background:color-mix(in srgb,var(--dsw-alias-label-primary) 6%,transparent);color:var(--dsw-alias-label-primary)}
.qm-icon-btn:disabled{opacity:.4;cursor:default}
.qm-icon-btn.is-spinning svg{animation:qm-spin 1s linear infinite}
@keyframes qm-spin{to{transform:rotate(360deg)}}
.qm-banner{display:flex;align-items:center;gap:12px;padding:11px 13px;border-radius:10px;border:1px solid color-mix(in srgb,var(--dsw-alias-brand-primary) 24%,transparent);background:color-mix(in srgb,var(--dsw-alias-brand-primary) 7%,transparent);font-size:12.5px;line-height:1.5}
.qm-banner[data-kind="warn"]{border-color:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 28%,transparent);background:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 9%,transparent)}
.qm-banner[data-kind="error"]{border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary) 28%,transparent);background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 8%,transparent)}
.qm-banner-main{flex:1;min-width:0}
.qm-banner-title{font-weight:600;color:var(--dsw-alias-label-primary)}
.qm-banner-body{margin-top:2px;color:var(--dsw-alias-label-secondary)}
.qm-banner .qm-icon{flex:none;color:var(--dsw-alias-brand-primary);margin-top:1px}
.qm-banner[data-kind="error"] .qm-icon{color:var(--dsw-alias-state-error-primary)}
.qm-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:32px;padding:0 12px;border-radius:8px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:12.5px;font-weight:500;cursor:pointer;white-space:nowrap;transition:background .15s,border-color .15s,opacity .15s}
.qm-btn:hover:not(:disabled){background:color-mix(in srgb,var(--dsw-alias-label-primary) 5%,var(--dsw-alias-bg-layer-1))}
.qm-btn:disabled{opacity:.5;cursor:default}
.qm-btn--primary{background:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-bg-base)}
.qm-btn--primary:hover:not(:disabled){background:color-mix(in srgb,var(--dsw-alias-brand-primary) 88%,black);border-color:transparent}
.qm-btn--ghost{border-color:transparent;background:transparent;color:var(--dsw-alias-label-secondary)}
.qm-btn--ghost:hover:not(:disabled){background:color-mix(in srgb,var(--dsw-alias-label-primary) 6%,transparent);color:var(--dsw-alias-label-primary)}
.qm-btn--danger{color:var(--dsw-alias-state-error-primary);border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary) 30%,transparent);background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 8%,transparent)}
.qm-composer{display:flex;flex-direction:column;gap:9px;padding:14px 16px 12px;border-radius:14px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);box-shadow:0 1px 2px rgba(0,0,0,.03);transition:border-color .15s,box-shadow .15s}
.qm-composer:focus-within{border-color:color-mix(in srgb,var(--dsw-alias-brand-primary) 55%,var(--dsw-alias-border-l1));box-shadow:0 0 0 3px color-mix(in srgb,var(--dsw-alias-brand-primary) 12%,transparent)}
.qm-composer-text{box-sizing:border-box;width:100%;min-height:54px;max-height:220px;resize:none;border:0;outline:none;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:14.5px;line-height:1.65;padding:2px 0}
.qm-composer-text::placeholder{color:var(--dsw-alias-label-secondary);opacity:.72}
.qm-composer-bar{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
.qm-hint{font-size:11.5px;color:var(--dsw-alias-label-secondary);opacity:.9}
.qm-composer-left{display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-width:0}
.qm-tools{display:flex;align-items:center;gap:2px}
.qm-tool{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;padding:0;border:1px solid transparent;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;font-weight:650;cursor:pointer;line-height:1}
.qm-tool:hover:not(:disabled){background:color-mix(in srgb,var(--dsw-alias-label-primary) 7%,transparent);color:var(--dsw-alias-label-primary)}
.qm-tool:disabled{opacity:.4;cursor:default}
.qm-tool--text{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
.qm-tool--pill{width:auto;padding:0 8px;border-color:var(--dsw-alias-border-l1);font-family:inherit;font-size:11.5px;font-weight:500}
.qm-tool--pill[aria-pressed="true"]{color:var(--dsw-alias-brand-primary);border-color:color-mix(in srgb,var(--dsw-alias-brand-primary) 30%,transparent);background:color-mix(in srgb,var(--dsw-alias-brand-primary) 9%,transparent)}
.qm-tool-code{font-size:11px;font-weight:inherit}
.qm-toolbar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:2px 0 2px}
.qm-search{position:relative;display:flex;align-items:center;gap:7px;width:230px;max-width:100%;height:32px;padding:0 10px;border-radius:9px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);transition:border-color .15s,box-shadow .15s}
.qm-search:focus-within{border-color:var(--dsw-alias-brand-primary);box-shadow:0 0 0 3px color-mix(in srgb,var(--dsw-alias-brand-primary) 12%,transparent)}
.qm-search input{flex:1;min-width:0;border:0;outline:none;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:12.5px}
.qm-search input::placeholder{color:var(--dsw-alias-label-secondary);opacity:.8}
.qm-search-clear{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;padding:0;border:0;border-radius:5px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer}
.qm-search-clear:hover{background:color-mix(in srgb,var(--dsw-alias-label-primary) 8%,transparent)}
.qm-tags{display:flex;align-items:center;gap:6px;overflow-x:auto;flex:1;min-width:160px;padding-bottom:2px;scrollbar-width:none}
.qm-tags::-webkit-scrollbar{display:none}
.qm-tag{display:inline-flex;align-items:center;height:26px;padding:0 9px;border-radius:999px;border:1px solid transparent;background:color-mix(in srgb,var(--dsw-alias-label-primary) 5%,transparent);color:var(--dsw-alias-label-secondary);font:inherit;font-size:11.5px;cursor:pointer;white-space:nowrap;transition:background .15s,color .15s,border-color .15s}
.qm-tag:hover{color:var(--dsw-alias-label-primary);background:color-mix(in srgb,var(--dsw-alias-label-primary) 8%,transparent)}
.qm-tag[data-active="true"]{color:var(--dsw-alias-brand-primary);border-color:color-mix(in srgb,var(--dsw-alias-brand-primary) 30%,transparent);background:color-mix(in srgb,var(--dsw-alias-brand-primary) 10%,transparent)}
.qm-count{font-size:11.5px;color:var(--dsw-alias-label-secondary);white-space:nowrap;margin-left:auto;font-variant-numeric:tabular-nums}
.qm-timeline{display:flex;flex-direction:column;gap:22px}
.qm-day{display:flex;align-items:center;gap:10px;margin:2px 0 9px}
.qm-day-label{font-size:12px;font-weight:600;letter-spacing:.02em;color:var(--dsw-alias-label-secondary)}
.qm-day-line{height:1px;flex:1;background:var(--dsw-alias-border-l1)}
.qm-day-count{font-size:11px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}
.qm-list{display:flex;flex-direction:column;gap:10px}
.qm-card{position:relative;padding:14px 16px 10px;border-radius:12px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);transition:border-color .15s,box-shadow .15s}
.qm-card:hover{border-color:color-mix(in srgb,var(--dsw-alias-label-primary) 16%,var(--dsw-alias-border-l1));box-shadow:0 2px 10px rgba(0,0,0,.035)}
.qm-card:focus-within{border-color:color-mix(in srgb,var(--dsw-alias-brand-primary) 40%,var(--dsw-alias-border-l1))}
.qm-text{font-size:14.5px;line-height:1.72;white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word;color:var(--dsw-alias-label-primary)}
.qm-md{font-size:14.5px;line-height:1.72;white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word;color:var(--dsw-alias-label-primary)}
.qm-md p{margin:0 0 8px}
.qm-md p:last-child{margin-bottom:0}
.qm-md h3,.qm-md h4,.qm-md h5,.qm-md h6{margin:12px 0 6px;font-weight:650;line-height:1.35;color:var(--dsw-alias-label-primary)}
.qm-md h3{font-size:17px}
.qm-md h4{font-size:15.5px}
.qm-md h5{font-size:14.5px}
.qm-md h6{font-size:14px}
.qm-md h3:first-child,.qm-md h4:first-child,.qm-md h5:first-child,.qm-md h6:first-child{margin-top:0}
.qm-md ul,.qm-md ol{margin:4px 0 9px;padding-left:22px}
.qm-md li{margin:2px 0}
.qm-md li::marker{color:var(--dsw-alias-label-secondary)}
.qm-md blockquote{margin:8px 0;padding:2px 0 2px 12px;border-left:3px solid color-mix(in srgb,var(--dsw-alias-brand-primary) 40%,var(--dsw-alias-border-l1));color:var(--dsw-alias-label-secondary)}
.qm-md hr{border:0;border-top:1px solid var(--dsw-alias-border-l1);margin:12px 0}
.qm-md a.qm-md-link{color:var(--dsw-alias-brand-primary);text-decoration:underline;text-underline-offset:2px;overflow-wrap:anywhere}
.qm-md code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:.88em}
.qm-md .qm-md-inline-code{padding:1px 4px;border-radius:4px;background:color-mix(in srgb,var(--dsw-alias-label-primary) 7%,transparent);overflow-wrap:anywhere}
.qm-md .qm-md-pre{margin:8px 0;padding:10px 12px;border:1px solid var(--dsw-alias-border-l1);border-radius:9px;background:var(--dsw-alias-bg-base);overflow-x:auto;white-space:pre;font-size:12.5px;line-height:1.6}
.qm-md .qm-md-pre code{background:transparent;padding:0}
.qm-md .qm-md-img{display:block;max-width:100%;max-height:480px;margin:8px 0;border-radius:10px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base);object-fit:contain}
.qm-md .qm-md-table-wrap{max-width:100%;overflow-x:auto;margin:8px 0;border:1px solid var(--dsw-alias-border-l1);border-radius:9px}
.qm-md table.qm-md-table{border-collapse:collapse;width:max-content;min-width:100%;white-space:normal;font-size:13px;line-height:1.55}
.qm-md table.qm-md-table th,.qm-md table.qm-md-table td{border:1px solid var(--dsw-alias-border-l1);padding:6px 9px;text-align:left;vertical-align:top}
.qm-md table.qm-md-table th{background:color-mix(in srgb,var(--dsw-alias-label-primary) 5%,transparent);font-weight:600}
.qm-md table.qm-md-table tr:nth-child(even) td{background:color-mix(in srgb,var(--dsw-alias-label-primary) 1.5%,transparent)}
.qm-md .qm-md-task input{margin-right:6px;accent-color:var(--dsw-alias-brand-primary);vertical-align:middle}
.qm-md del{opacity:.7}
.qm-inline-tag{display:inline;margin:0;padding:0 1px;border:0;background:transparent;color:var(--dsw-alias-brand-primary);font:inherit;font-weight:550;cursor:pointer;border-radius:3px}
.qm-inline-tag:hover{background:color-mix(in srgb,var(--dsw-alias-brand-primary) 12%,transparent)}
.qm-card-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:9px;min-height:22px}
.qm-time{font-size:11px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}
.qm-card-actions{display:flex;align-items:center;gap:2px;opacity:0;transition:opacity .12s}
.qm-card:hover .qm-card-actions,.qm-card:focus-within .qm-card-actions{opacity:1}
.qm-mini{display:inline-flex;align-items:center;gap:4px;height:24px;padding:0 6px;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:11.5px;cursor:pointer}
.qm-mini:hover{background:color-mix(in srgb,var(--dsw-alias-label-primary) 7%,transparent);color:var(--dsw-alias-label-primary)}
.qm-mini--danger{color:var(--dsw-alias-state-error-primary)}
.qm-mini--danger:hover{background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 10%,transparent);color:var(--dsw-alias-state-error-primary)}
.qm-edit{display:flex;flex-direction:column;gap:8px}
.qm-edit-text{box-sizing:border-box;width:100%;min-height:70px;max-height:340px;resize:vertical;padding:9px 10px;border-radius:8px;border:1px solid var(--dsw-alias-border-l1);outline:none;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font:inherit;font-size:14px;line-height:1.65}
.qm-edit-text:focus{border-color:var(--dsw-alias-brand-primary);box-shadow:0 0 0 3px color-mix(in srgb,var(--dsw-alias-brand-primary) 12%,transparent)}
.qm-edit-bar{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
.qm-edit-left{display:flex;align-items:center;gap:3px;flex-wrap:wrap;min-width:0}
.qm-edit-right{display:flex;align-items:center;justify-content:flex-end;gap:10px;flex-wrap:wrap;margin-left:auto}
.qm-edit-actions{display:flex;align-items:center;gap:6px}
.qm-edit-preview{margin-top:2px;padding:10px 12px;border:1px solid var(--dsw-alias-border-l1);border-radius:9px;background:var(--dsw-alias-bg-base);max-height:420px;overflow-y:auto}
.qm-edit-error{font-size:11.5px;color:var(--dsw-alias-state-error-primary)}
.qm-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:52px 20px 40px;text-align:center;border:1px dashed var(--dsw-alias-border-l1);border-radius:14px;background:color-mix(in srgb,var(--dsw-alias-label-primary) 1.5%,transparent)}
.qm-empty-art{margin-bottom:2px}
.qm-empty-title{margin:0;font-size:15px;font-weight:600}
.qm-empty-body{margin:0;font-size:12.5px;color:var(--dsw-alias-label-secondary);max-width:360px}
.qm-empty .qm-btn{margin-top:8px}
.qm-quiet{padding:26px 0;text-align:center;color:var(--dsw-alias-label-secondary);font-size:12.5px}
.qm-toast{position:fixed;left:50%;bottom:26px;z-index:60;transform:translateX(-50%);max-width:calc(100vw - 32px);padding:9px 14px;border-radius:9px;background:var(--dsw-alias-bg-overlay);border:1px solid var(--dsw-alias-border-l1);box-shadow:0 8px 30px rgba(0,0,0,.16);color:var(--dsw-alias-label-primary);font-size:12.5px;display:flex;align-items:center;gap:8px;animation:qm-toast-in .18s ease-out}
.qm-toast[data-kind="error"]{border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary) 35%,transparent)}
.qm-toast-dot{width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-state-success-primary)}
.qm-toast[data-kind="error"] .qm-toast-dot{background:var(--dsw-alias-state-error-primary)}
@keyframes qm-toast-in{from{opacity:0;transform:translate(-50%,6px)}to{opacity:1;transform:translate(-50%,0)}}
.qm-modal{position:fixed;inset:0;z-index:50;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(20,22,20,.42);backdrop-filter:blur(2px);animation:qm-fade .14s ease-out}
@keyframes qm-fade{from{opacity:0}to{opacity:1}}
.qm-dialog{box-sizing:border-box;width:min(560px,100%);max-height:min(760px,calc(100vh - 48px));overflow-y:auto;padding:20px 22px 22px;border-radius:14px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-overlay);box-shadow:0 20px 70px rgba(0,0,0,.28);color:var(--dsw-alias-label-primary)}
.qm-dialog-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;margin-bottom:4px}
.qm-dialog-title{margin:0;font-size:16px;font-weight:650}
.qm-dialog-sub{margin:5px 0 0;font-size:12.5px;color:var(--dsw-alias-label-secondary);line-height:1.55}
.qm-dialog-close{flex:none;width:28px;height:28px}
.qm-form{display:flex;flex-direction:column;gap:12px;margin-top:16px}
.qm-field{display:flex;flex-direction:column;gap:6px}
.qm-label{font-size:12px;font-weight:600;color:var(--dsw-alias-label-primary)}
.qm-input{box-sizing:border-box;width:100%;height:36px;padding:0 11px;border-radius:8px;border:1px solid var(--dsw-alias-border-l1);outline:none;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px}
.qm-input:focus{border-color:var(--dsw-alias-brand-primary);box-shadow:0 0 0 3px color-mix(in srgb,var(--dsw-alias-brand-primary) 12%,transparent)}
.qm-help{font-size:11.5px;line-height:1.5;color:var(--dsw-alias-label-secondary)}
.qm-advanced-toggle{display:inline-flex;align-items:center;gap:5px;width:max-content;padding:0;border:0;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:11.5px;cursor:pointer}
.qm-advanced-toggle:hover{color:var(--dsw-alias-label-primary)}
.qm-grid2{display:grid;grid-template-columns:1fr 100px;gap:8px}
.qm-form-actions{display:flex;align-items:center;gap:8px;margin-top:4px;flex-wrap:wrap}
.qm-form-error{margin-top:2px;padding:8px 10px;border-radius:8px;border:1px solid color-mix(in srgb,var(--dsw-alias-state-error-primary) 28%,transparent);background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 8%,transparent);color:var(--dsw-alias-state-error-primary);font-size:12px;line-height:1.5}
.qm-note{padding:10px 12px;border-radius:8px;background:color-mix(in srgb,var(--dsw-alias-label-primary) 4%,transparent);font-size:11.5px;line-height:1.55;color:var(--dsw-alias-label-secondary)}
.qm-account-card{display:flex;flex-direction:column;gap:12px;margin-top:16px;padding:13px 14px;border-radius:10px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1)}
.qm-account-row{display:flex;align-items:center;gap:10px}
.qm-account-icon{display:flex;align-items:center;justify-content:center;width:34px;height:34px;flex:none;border-radius:50%;background:color-mix(in srgb,var(--dsw-alias-brand-primary) 12%,transparent);color:var(--dsw-alias-brand-primary)}
.qm-account-email{font-size:13px;font-weight:600;overflow-wrap:anywhere}
.qm-account-meta{font-size:11.5px;color:var(--dsw-alias-label-secondary)}
.qm-kv{display:grid;grid-template-columns:auto 1fr;gap:5px 14px;font-size:12px}
.qm-kv dt{color:var(--dsw-alias-label-secondary)}
.qm-kv dd{margin:0;overflow-wrap:anywhere}
.qm-account-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.qm-divider{height:1px;background:var(--dsw-alias-border-l1);margin:4px 0}
.qm-sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}
.qm-about{width:min(440px,100%)}
.qm-about-brand{display:flex;align-items:center;gap:12px;margin:16px 0 14px}
.qm-about-mark{display:inline-flex;align-items:center;justify-content:center;width:46px;height:46px;flex:none;border-radius:12px;background:color-mix(in srgb,var(--dsw-alias-brand-primary) 10%,transparent);color:var(--dsw-alias-brand-primary);border:1px solid color-mix(in srgb,var(--dsw-alias-brand-primary) 18%,transparent)}
.qm-about-id{min-width:0}
.qm-about-name{font-size:15px;font-weight:650;line-height:1.35}
.qm-about-package{margin-top:2px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px;color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere}
.qm-about-kv{font-size:12.5px;gap:6px 16px;margin:0}
.qm-about-kv dt{white-space:nowrap}
.qm-about-links{display:flex;align-items:center;gap:16px;flex-wrap:wrap;margin-top:16px}
.qm-about-link{font-size:12px;color:var(--dsw-alias-brand-primary);text-decoration:underline;text-underline-offset:2px}
.qm-about-link:hover{color:color-mix(in srgb,var(--dsw-alias-brand-primary) 80%,var(--dsw-alias-label-primary))}
.qm-about-note{margin:14px 0 0;padding-top:12px;border-top:1px solid var(--dsw-alias-border-l1)}
@media (max-width:720px){
  .qm-page{padding:20px 16px 60px}
  .qm-title{font-size:20px}
  .qm-search{width:100%}
  .qm-card-actions{opacity:1}
}
@media (prefers-reduced-motion:reduce){
  .qm-page *{animation:none!important;transition:none!important}
}
`

    /* ---------- page ---------- */

    function MemoPage() {
      const tr = useTranslate()
      const [initialNotebook] = useState(() => readActiveNotebook())
      const [initial] = useState(() => readCache(initialNotebook))

      const [notebooks, setNotebooks] = useState([])
      const [notebookId, setNotebookId] = useState(initialNotebook || '')
      const [notebook, setNotebook] = useState(initialNotebook ? { id: initialNotebook, name: '' } : null)
      const [notes, setNotes] = useState(initial ? initial.notes : [])
      const [account, setAccount] = useState(initial ? initial.account : null)
      const [sync, setSync] = useState(
        initial && initial.sync
          ? initial.sync
          : { configured: false, syncing: false, lastSyncAt: 0, lastError: null, pending: 0 },
      )
      const [phase, setPhase] = useState(initial && initial.notes.length ? 'ready' : 'loading')
      const [offline, setOffline] = useState(false)
      const [query, setQuery] = useState(initial ? initial.query : '')
      const [activeTag, setActiveTag] = useState(initial ? initial.activeTag : '')
      const [draft, setDraft] = useState(initial ? initial.draft : '')
      const [creating, setCreating] = useState(false)
      const [editingId, setEditingId] = useState(null)
      const [editText, setEditText] = useState('')
      const [editError, setEditError] = useState('')
      const [savingId, setSavingId] = useState(null)
      const [confirmId, setConfirmId] = useState(null)
      const [deletingId, setDeletingId] = useState(null)
      const [settingsOpen, setSettingsOpen] = useState(false)
      const [aboutOpen, setAboutOpen] = useState(false)
      const [notebookMenuOpen, setNotebookMenuOpen] = useState(false)
      const [notebookDialog, setNotebookDialog] = useState(null)
      const [about, setAbout] = useState(
        initial && initial.about ? { ...FALLBACK_ABOUT, ...initial.about } : FALLBACK_ABOUT,
      )
      const [syncingNow, setSyncingNow] = useState(false)
      const [notice, setNotice] = useState(null)
      const [uploading, setUploading] = useState(0)
      const [previewEdit, setPreviewEdit] = useState(false)

      const versionRef = useRef(initial ? initial.version : 0)
      const activeRef = useRef(initialNotebook || '')
      const requestSeq = useRef(0)
      const queryRef = useRef(query)
      const activeTagRef = useRef(activeTag)
      const draftByBook = useRef(new Map())
      const filterByBook = useRef(new Map())
      const notebookMenuRef = useRef(null)
      const aboutRef = useRef(about)
      const busyRef = useRef(0)
      const composerRef = useRef(null)
      const editRef = useRef(null)
      const draftRef = useRef(draft)
      const editTextRef = useRef('')
      const toastTimer = useRef(null)
      const confirmTimer = useRef(null)

      const toast = useCallback((text, kind = 'ok') => {
        if (toastTimer.current) clearTimeout(toastTimer.current)
        setNotice({ text, kind })
        toastTimer.current = setTimeout(() => setNotice(null), kind === 'error' ? 5200 : 2600)
      }, [])

      useEffect(() => {
        draftRef.current = draft
      }, [draft])

      useEffect(() => {
        queryRef.current = query
      }, [query])

      useEffect(() => {
        activeTagRef.current = activeTag
      }, [activeTag])

      useEffect(() => {
        editTextRef.current = editText
      }, [editText])

      useEffect(() => {
        dropLegacyCache()
      }, [])

      useEffect(
        () => () => {
          if (toastTimer.current) clearTimeout(toastTimer.current)
          if (confirmTimer.current) clearTimeout(confirmTimer.current)
        },
        [],
      )

      const applyState = useCallback((data, options = {}) => {
        if (!data || typeof data.version !== 'number') return
        const force = Boolean(options.force)
        const nextId = data.active || (data.notebook && data.notebook.id) || activeRef.current
        if (nextId && activeRef.current && nextId !== activeRef.current && !force) return
        if (nextId && nextId !== activeRef.current) {
          activeRef.current = nextId
          setNotebookId(nextId)
          writeActiveNotebook(nextId)
          versionRef.current = 0
        }
        if (data.version < versionRef.current) return
        versionRef.current = data.version
        const serverNotes = Array.isArray(data.notes) ? data.notes : []
        const nextAccount = data.account || null
        const nextSync = {
          configured: Boolean(nextAccount),
          syncing: Boolean(data.syncing),
          lastSyncAt: (data.sync && data.sync.lastSyncAt) || 0,
          lastError: (data.sync && data.sync.lastError) || null,
          pending: Number(data.pending) || 0,
        }
        const nextAbout = data.about ? { ...FALLBACK_ABOUT, ...data.about } : aboutRef.current
        const summaries = Array.isArray(data.notebooks) ? data.notebooks : []
        const nextNotebook =
          data.notebook || summaries.find((item) => item.id === nextId) || null
        aboutRef.current = nextAbout
        setAbout(nextAbout)
        setNotebooks(summaries)
        if (nextNotebook) setNotebook(nextNotebook)
        setNotes(serverNotes)
        setAccount(nextAccount)
        setSync(nextSync)
        setOffline(false)
        setPhase('ready')
        const activeId = activeRef.current || nextId
        if (activeId) {
          writeCache(activeId, {
            notes: serverNotes,
            account: nextAccount,
            sync: nextSync,
            about: nextAbout,
            version: data.version,
            draft: draftRef.current,
            query: queryRef.current,
            activeTag: activeTagRef.current,
          })
        }
      }, [])

      const api = useCallback(
        (action, payload = {}) => callApi(action, payload, activeRef.current),
        [],
      )

      const refresh = useCallback(
        async (targetId) => {
          const target = targetId || activeRef.current
          const seq = ++requestSeq.current
          try {
            const data = await fetchState(target)
            if (seq !== requestSeq.current) return
            if (target && data.active && data.active !== target) return
            if (busyRef.current > 0) {
              setOffline(false)
              return
            }
            applyState(data)
          } catch (error) {
            if (seq !== requestSeq.current) return
            if (error && error.code === 'NOTEBOOK_NOT_FOUND' && target) {
              activeRef.current = ''
              setNotebookId('')
              writeActiveNotebook('')
              versionRef.current = 0
              setNotebook(null)
              setPhase('loading')
              void refresh('')
              return
            }
            setOffline(true)
            setPhase((current) => (current === 'loading' ? 'offline' : current))
          }
        },
        [applyState],
      )

      const switchNotebook = useCallback(
        (targetId) => {
          const id = String(targetId || '')
          if (!id || id === activeRef.current) return
          if (activeRef.current) {
            draftByBook.current.set(activeRef.current, draftRef.current)
            filterByBook.current.set(activeRef.current, {
              query: queryRef.current,
              activeTag: activeTagRef.current,
            })
            const currentCache = readCache(activeRef.current)
            if (currentCache) {
              writeCache(activeRef.current, {
                ...currentCache,
                draft: draftRef.current,
                query: queryRef.current,
                activeTag: activeTagRef.current,
              })
            }
          }

          activeRef.current = id
          requestSeq.current += 1
          setNotebookId(id)
          writeActiveNotebook(id)
          const summary = notebooks.find((item) => item.id === id)
          setNotebook(summary || { id, name: '' })
          setNotebookMenuOpen(false)
          setEditingId(null)
          setEditText('')
          editTextRef.current = ''
          setEditError('')
          setPreviewEdit(false)
          setConfirmId(null)
          setOffline(false)

          const cached = readCache(id)
          if (cached) {
            versionRef.current = cached.version || 0
            setNotes(cached.notes)
            setAccount(cached.account || null)
            setSync(
              cached.sync || {
                configured: false,
                syncing: false,
                lastSyncAt: 0,
                lastError: null,
                pending: 0,
              },
            )
            setPhase('ready')
            if (cached.about) {
              const nextAbout = { ...FALLBACK_ABOUT, ...cached.about }
              aboutRef.current = nextAbout
              setAbout(nextAbout)
            }
          } else {
            versionRef.current = 0
            setNotes([])
            setAccount(null)
            setSync({
              configured: false,
              syncing: false,
              lastSyncAt: 0,
              lastError: null,
              pending: 0,
            })
            setPhase('loading')
          }

          const filters = filterByBook.current.get(id)
          const nextDraft = draftByBook.current.has(id)
            ? draftByBook.current.get(id)
            : cached
              ? cached.draft
              : ''
          const nextQuery = filters ? filters.query : cached ? cached.query : ''
          const nextTag = filters ? filters.activeTag : cached ? cached.activeTag : ''
          setDraft(nextDraft)
          draftRef.current = nextDraft
          setQuery(nextQuery)
          queryRef.current = nextQuery
          setActiveTag(nextTag)
          activeTagRef.current = nextTag

          void api('setActive', { notebook: id })
            .then((data) => {
              if (activeRef.current === id) applyState(data, { force: true })
            })
            .catch(() => undefined)
          void refresh(id)
        },
        [api, applyState, notebooks, refresh],
      )

      useEffect(() => {
        let cancelled = false
        let timer = null
        const tick = async () => {
          await refresh()
          if (!cancelled) timer = setTimeout(tick, 6000)
        }
        void tick()
        const onVisible = () => {
          if (document.visibilityState === 'visible') void refresh()
        }
        window.addEventListener('focus', onVisible)
        document.addEventListener('visibilitychange', onVisible)
        return () => {
          cancelled = true
          if (timer) clearTimeout(timer)
          window.removeEventListener('focus', onVisible)
          document.removeEventListener('visibilitychange', onVisible)
        }
      }, [refresh])

      useEffect(() => {
        if (confirmId === null) return undefined
        if (confirmTimer.current) clearTimeout(confirmTimer.current)
        confirmTimer.current = setTimeout(() => setConfirmId(null), 4000)
        return () => {
          if (confirmTimer.current) clearTimeout(confirmTimer.current)
        }
      }, [confirmId])

      const allTags = useMemo(() => {
        const counts = new Map()
        for (const note of notes) {
          for (const tag of tagsOf(note.text)) counts.set(tag, (counts.get(tag) || 0) + 1)
        }
        return [...counts.entries()]
          .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
          .slice(0, 14)
      }, [notes])

      const visible = useMemo(() => {
        const needle = query.trim().toLowerCase()
        return notes.filter((note) => {
          if (activeTag && !tagsOf(note.text).includes(activeTag)) return false
          if (needle && !note.text.toLowerCase().includes(needle)) return false
          return true
        })
      }, [notes, query, activeTag])

      const groups = useMemo(() => grouped(visible), [visible])

      const pending = sync.pending || 0
      const statusState = syncingNow || sync.syncing ? 'sync' : sync.lastError ? 'error' : account ? 'ok' : 'local'
      const statusText =
        statusState === 'sync'
          ? tr('status.syncing')
          : statusState === 'error'
            ? tr('status.error')
            : account
              ? pending > 0
                ? `${pending} ${tr('unit.pending')}`
                : tr('status.synced')
              : tr('status.local')

      async function submitDraft() {
        const text = draft.trim()
        if (!text || creating) {
          if (!text) composerRef.current && composerRef.current.focus()
          return
        }
        setCreating(true)
        busyRef.current += 1
        try {
          const data = await api('create', { text })
          applyState(data)
          setDraft('')
          draftRef.current = ''
          toast(tr('toast.saved'))
        } catch (error) {
          toast(error.message || tr('toast.error'), 'error')
        } finally {
          busyRef.current -= 1
          setCreating(false)
        }
      }

      function startEdit(note) {
        setEditingId(note.id)
        setEditText(note.text)
        editTextRef.current = note.text
        setEditError('')
        setPreviewEdit(false)
        setConfirmId(null)
      }

      function cancelEdit() {
        setEditingId(null)
        setEditText('')
        editTextRef.current = ''
        setEditError('')
        setPreviewEdit(false)
      }

      async function saveEdit() {
        if (!editingId || savingId) return
        const text = editText.trim()
        if (!text) {
          setEditError(tr('note.empty'))
          return
        }
        setSavingId(editingId)
        busyRef.current += 1
        try {
          const data = await api('update', { id: editingId, text })
          applyState(data)
          cancelEdit()
          toast(tr('toast.saved'))
        } catch (error) {
          setEditError(error.message || tr('toast.error'))
        } finally {
          busyRef.current -= 1
          setSavingId(null)
        }
      }

      async function deleteNote(id) {
        if (deletingId) return
        setDeletingId(id)
        busyRef.current += 1
        try {
          const data = await api('delete', { id })
          applyState(data)
          setConfirmId(null)
          if (editingId === id) cancelEdit()
          toast(tr('toast.deleted'))
        } catch (error) {
          toast(error.message || tr('toast.error'), 'error')
        } finally {
          busyRef.current -= 1
          setDeletingId(null)
        }
      }

      async function syncNow() {
        if (!account) {
          setSettingsOpen(true)
          return
        }
        if (syncingNow) return
        setSyncingNow(true)
        try {
          const data = await api('sync')
          applyState(data)
          setSync((current) => ({ ...current, syncing: true }))
          toast(tr('toast.synced'))
        } catch (error) {
          toast(error.message || tr('toast.error'), 'error')
        } finally {
          setTimeout(() => setSyncingNow(false), 1200)
        }
      }

      function openNotebookDialog(mode) {
        setNotebookMenuOpen(false)
        if (mode === 'rename' && !notebook) return
        setNotebookDialog({
          mode,
          name:
            mode === 'create'
              ? `${tr('notebook.defaultName')} ${notebooks.length + 1}`
              : notebook.name,
          error: '',
          busy: false,
        })
      }

      async function submitNotebookName(name) {
        if (!notebookDialog || notebookDialog.busy) return
        const mode = notebookDialog.mode
        setNotebookDialog((current) => (current ? { ...current, busy: true, error: '' } : current))
        busyRef.current += 1
        try {
          const data = await api(mode === 'create' ? 'createNotebook' : 'renameNotebook', { name })
          const nextId = data.active || activeRef.current
          if (nextId && nextId !== activeRef.current) {
            const previous = activeRef.current
            if (previous) {
              draftByBook.current.set(previous, draftRef.current)
              filterByBook.current.set(previous, {
                query: queryRef.current,
                activeTag: activeTagRef.current,
              })
            }
            activeRef.current = nextId
            setNotebookId(nextId)
            writeActiveNotebook(nextId)
            versionRef.current = 0
            requestSeq.current += 1
            if (mode === 'create') {
              draftByBook.current.set(nextId, '')
              filterByBook.current.set(nextId, { query: '', activeTag: '' })
              setDraft('')
              draftRef.current = ''
              setQuery('')
              queryRef.current = ''
              setActiveTag('')
              activeTagRef.current = ''
            }
          }
          applyState(data, { force: true })
          setNotebookDialog(null)
          toast(mode === 'create' ? tr('notebook.created') : tr('notebook.renamed'))
        } catch (error) {
          setNotebookDialog((current) =>
            current
              ? { ...current, busy: false, error: error.message || tr('toast.error') }
              : current,
          )
        } finally {
          busyRef.current -= 1
        }
      }

      async function deleteNotebook() {
        if (!notebook || busyRef.current > 0) return
        if (notebooks.length <= 1) {
          setNotebookMenuOpen(false)
          toast(tr('notebook.last'), 'error')
          return
        }
        if (!window.confirm(tr('tabs.deleteConfirm') + '\n\n' + notebook.name)) return
        const removing = notebook.id
        setNotebookMenuOpen(false)
        busyRef.current += 1
        try {
          const data = await api('deleteNotebook', { notebook: removing })
          try {
            window.localStorage.removeItem(CACHE_PREFIX + removing)
          } catch {
            /* cache removal is best-effort */
          }
          draftByBook.current.delete(removing)
          filterByBook.current.delete(removing)
          const nextId = data.active || ''
          const previous = activeRef.current
          if (nextId) {
            if (nextId !== previous) {
              const cached = readCache(nextId)
              const filters = filterByBook.current.get(nextId)
              const nextDraft = draftByBook.current.has(nextId)
                ? draftByBook.current.get(nextId)
                : cached
                  ? cached.draft
                  : ''
              const nextQuery = filters ? filters.query : cached ? cached.query : ''
              const nextTag = filters ? filters.activeTag : cached ? cached.activeTag : ''
              setDraft(nextDraft)
              draftRef.current = nextDraft
              setQuery(nextQuery)
              queryRef.current = nextQuery
              setActiveTag(nextTag)
              activeTagRef.current = nextTag
            }
            activeRef.current = nextId
            setNotebookId(nextId)
            writeActiveNotebook(nextId)
            versionRef.current = 0
            requestSeq.current += 1
          }
          applyState(data, { force: true })
          toast(tr('notebook.deleted'))
        } catch (error) {
          toast(error.message || tr('toast.error'), 'error')
        } finally {
          busyRef.current -= 1
        }
      }

      useEffect(() => {
        if (!notebookMenuOpen) return undefined
        const onDown = (event) => {
          if (notebookMenuRef.current && !notebookMenuRef.current.contains(event.target)) {
            setNotebookMenuOpen(false)
          }
        }
        const onKey = (event) => {
          if (event.key === 'Escape') setNotebookMenuOpen(false)
        }
        document.addEventListener('mousedown', onDown)
        document.addEventListener('keydown', onKey)
        return () => {
          document.removeEventListener('mousedown', onDown)
          document.removeEventListener('keydown', onKey)
        }
      }, [notebookMenuOpen])

      useEffect(() => {
        const onKey = (event) => {
          const tag = event.target && event.target.tagName
          if (tag === 'INPUT' || tag === 'TEXTAREA' || (event.target && event.target.isContentEditable)) return
          if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return
          const index = Number(event.key)
          if (!Number.isInteger(index) || index < 1 || index > 9) return
          const target = notebooks[index - 1]
          if (target) {
            event.preventDefault()
            switchNotebook(target.id)
          }
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
      }, [notebooks, switchNotebook])

      function tagClick(tag) {
        setActiveTag((current) => (current === tag ? '' : tag))
      }

      function insertDraft(snippet, block = true) {
        const next = insertAtSelection(composerRef, draftRef.current, setDraft, snippet, block)
        draftRef.current = next
      }

      function insertEdit(snippet, block = true) {
        const next = insertAtSelection(editRef, editTextRef.current, setEditText, snippet, block)
        editTextRef.current = next
      }

      function handleImagePaste(event, target) {
        const items = event.clipboardData && event.clipboardData.items
        if (!items) return
        const files = []
        for (const item of items) {
          if (item.kind === 'file' && item.type && item.type.startsWith('image/')) {
            const file = item.getAsFile()
            if (file) files.push(file)
          }
        }
        if (files.length === 0) return
        event.preventDefault()
        void addImages(files, target)
      }

      function handleImageDrop(event, target) {
        const transfer = event.dataTransfer
        if (!transfer || !transfer.files || transfer.files.length === 0) return
        const files = Array.from(transfer.files).filter(
          (file) => file.type && file.type.startsWith('image/'),
        )
        if (files.length === 0) return
        event.preventDefault()
        void addImages(files, target)
      }

      function handleImageDragOver(event) {
        if (event.dataTransfer && Array.from(event.dataTransfer.types || []).includes('Files')) {
          event.preventDefault()
        }
      }

      async function addImages(files, target) {
        const list = Array.from(files || [])
          .filter((file) => file && file.type && file.type.startsWith('image/'))
          .slice(0, 6)
        if (list.length === 0) return
        const uploadNotebook = activeRef.current
        setUploading((count) => count + 1)
        try {
          const snippets = []
          for (const file of list) {
            const prepared = await prepareImage(file)
            const dataUrl = await readAsDataUrl(prepared)
            const comma = dataUrl.indexOf(',')
            const data = comma >= 0 ? dataUrl.slice(comma + 1) : ''
            if (!data) throw new Error(tr('image.failed'))
            const result = await callApi(
              'uploadImage',
              {
                data,
                mime: prepared.type || 'image/webp',
                name: file.name || 'image',
              },
              uploadNotebook,
            )
            if (result && result.id) {
              snippets.push('![' + tr('image.alt') + '](dsh-image:' + result.id + ')')
            }
          }
          if (snippets.length === 0) throw new Error(tr('image.failed'))
          if (activeRef.current !== uploadNotebook) {
            throw new Error(tr('image.failed'))
          }
          const snippet = snippets.join('\n')
          if (target === 'edit') insertEdit(snippet)
          else insertDraft(snippet)
          toast(tr('image.added'))
        } catch (error) {
          toast(error && error.message ? error.message : tr('image.failed'), 'error')
        } finally {
          setUploading((count) => Math.max(0, count - 1))
        }
      }

      function applyFormat(target, kind) {
        const element = target === 'edit' ? editRef.current : composerRef.current
        const current = target === 'edit' ? editTextRef.current : draftRef.current
        const start =
          element && typeof element.selectionStart === 'number' ? element.selectionStart : current.length
        const end = element && typeof element.selectionEnd === 'number' ? element.selectionEnd : current.length
        const selected = current.slice(start, end)
        if (kind === 'bold') {
          const inner = selected || tr('md.boldText')
          if (target === 'edit') insertEdit('**' + inner + '**', false)
          else insertDraft('**' + inner + '**', false)
        } else if (kind === 'code') {
          const inner = selected || 'code'
          if (target === 'edit') insertEdit('`' + inner + '`', false)
          else insertDraft('`' + inner + '`', false)
        }
      }

      function card(note) {
        const editing = editingId === note.id
        const confirming = confirmId === note.id
        const saving = savingId === note.id
        const deleting = deletingId === note.id
        if (editing) {
          return h(
            'article',
            { key: note.id, className: 'qm-card' },
            h(
              'div',
              { className: 'qm-edit' },
              h('textarea', {
                ref: editRef,
                className: 'qm-edit-text',
                value: editText,
                rows: rowsFor(editText, 12),
                autoFocus: true,
                spellCheck: false,
                'aria-label': tr('note.edit'),
                onPaste: (event) => handleImagePaste(event, 'edit'),
                onDrop: (event) => handleImageDrop(event, 'edit'),
                onDragOver: handleImageDragOver,
                onChange: (event) => {
                  const value = event.target.value
                  editTextRef.current = value
                  setEditText(value)
                  if (editError) setEditError('')
                },
                onKeyDown: (event) => {
                  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                    event.preventDefault()
                    void saveEdit()
                  } else if (event.key === 'Escape') {
                    event.preventDefault()
                    cancelEdit()
                  }
                },
              }),
              previewEdit
                ? h(
                    'div',
                    { className: 'qm-edit-preview' },
                    h(MarkdownNote, { text: editText, alt: tr('image.alt'), notebook: notebookId }),
                  )
                : null,
              h(
                'div',
                { className: 'qm-edit-bar' },
                h(
                  'div',
                  { className: 'qm-edit-left' },
                  h(ImageButton, {
                    onFiles: (files) => void addImages(files, 'edit'),
                    disabled: saving || uploading > 0,
                    title: tr('image.insert'),
                  }),
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'qm-tool qm-tool--text',
                      title: tr('md.bold'),
                      'aria-label': tr('md.bold'),
                      onClick: () => applyFormat('edit', 'bold'),
                      disabled: saving,
                    },
                    'B',
                  ),
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'qm-tool qm-tool--text',
                      title: tr('md.code'),
                      'aria-label': tr('md.code'),
                      onClick: () => applyFormat('edit', 'code'),
                      disabled: saving,
                    },
                    h('code', { className: 'qm-tool-code' }, '</>'),
                  ),
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'qm-tool qm-tool--pill',
                      title: previewEdit ? tr('md.edit') : tr('md.preview'),
                      'aria-pressed': previewEdit,
                      onClick: () => setPreviewEdit((value) => !value),
                      disabled: saving,
                    },
                    previewEdit ? tr('md.edit') : tr('md.preview'),
                  ),
                  uploading > 0 ? h('span', { className: 'qm-hint' }, tr('image.uploading')) : null,
                ),
                h(
                  'div',
                  { className: 'qm-edit-right' },
                  h(
                    'span',
                    { className: editError ? 'qm-edit-error' : 'qm-hint' },
                    editError || tr('note.editHint'),
                  ),
                  h(
                    'div',
                    { className: 'qm-edit-actions' },
                    h(
                      'button',
                      { type: 'button', className: 'qm-btn qm-btn--ghost', onClick: cancelEdit, disabled: saving },
                      tr('note.cancel'),
                    ),
                    h(
                      'button',
                      {
                        type: 'button',
                        className: 'qm-btn qm-btn--primary',
                        onClick: () => void saveEdit(),
                        disabled: saving || uploading > 0 || !editText.trim(),
                      },
                      saving ? tr('status.syncing') : tr('note.save'),
                    ),
                  ),
                ),
              ),
            ),
          )
        }
        return h(
          'article',
          { key: note.id, className: 'qm-card' },
          h(MarkdownNote, { text: note.text, onTag: tagClick, alt: tr('image.alt'), notebook: notebookId }),
          h(
            'footer',
            { className: 'qm-card-foot' },
            h(
              'time',
              { className: 'qm-time', dateTime: new Date(note.createdAt).toISOString(), title: fullTime(note.createdAt) },
              clockTime(note.createdAt),
            ),
            h(
              'div',
              { className: 'qm-card-actions' },
              h(
                'button',
                {
                  type: 'button',
                  className: 'qm-mini',
                  title: tr('note.edit'),
                  'aria-label': tr('note.edit'),
                  onClick: () => startEdit(note),
                },
                PencilIcon(),
              ),
              confirming
                ? h(
                    'button',
                    {
                      type: 'button',
                      className: 'qm-mini qm-mini--danger',
                      onClick: () => void deleteNote(note.id),
                      disabled: deleting,
                      onBlur: () => setConfirmId(null),
                    },
                    deleting ? tr('status.syncing') : tr('note.confirm'),
                  )
                : h(
                    'button',
                    {
                      type: 'button',
                      className: 'qm-mini',
                      title: tr('note.delete'),
                      'aria-label': tr('note.delete'),
                      onClick: () => setConfirmId(note.id),
                    },
                    TrashIcon(),
                  ),
            ),
          ),
        )
      }

      const showEmpty = phase !== 'loading' && visible.length === 0
      const hasNotes = notes.length > 0

      return h(
        'div',
        { className: 'qm-page' },
        h('style', null, CSS),
        h(
          'div',
          { className: 'qm-shell' },
          h(
            'header',
            { className: 'qm-head' },
            h(
              'div',
              { className: 'qm-heading' },
              h('h1', { className: 'qm-title' }, tr('title')),
              h('p', { className: 'qm-sub' }, tr('subtitle')),
            ),
            h(
              'div',
              { className: 'qm-head-actions' },
              h(
                account ? 'span' : 'button',
                {
                  className: 'qm-status',
                  'data-state': statusState,
                  ...(account
                    ? { title: sync.lastError || relativeTime(sync.lastSyncAt, tr) }
                    : { type: 'button', onClick: () => setSettingsOpen(true) }),
                },
                h('span', { className: 'qm-dot' }),
                statusText,
              ),
              h(
                'button',
                {
                  type: 'button',
                  className: 'qm-icon-btn' + (syncingNow || sync.syncing ? ' is-spinning' : ''),
                  title: tr('sync.tooltip'),
                  'aria-label': tr('sync.tooltip'),
                  onClick: () => void syncNow(),
                  disabled: syncingNow || sync.syncing,
                },
                RefreshIcon(),
              ),
              h(
                'button',
                {
                  type: 'button',
                  className: 'qm-icon-btn',
                  title: tr('about.title'),
                  'aria-label': tr('about.title'),
                  onClick: () => setAboutOpen(true),
                },
                InfoIcon(),
              ),
              h(
                'button',
                {
                  type: 'button',
                  className: 'qm-icon-btn',
                  title: tr('settings.title'),
                  'aria-label': tr('settings.title'),
                  onClick: () => setSettingsOpen(true),
                },
                GearIcon(),
              ),
            ),
          ),
          h(
            'div',
            { className: 'qm-tabs-wrap', ref: notebookMenuRef },
            h(
              'div',
              { className: 'qm-tabs', role: 'tablist', 'aria-label': tr('title') },
              notebooks.map((item) =>
                h(
                  'button',
                  {
                    key: item.id,
                    type: 'button',
                    className: 'qm-tab',
                    'data-active': item.id === notebookId ? 'true' : 'false',
                    role: 'tab',
                    'aria-selected': item.id === notebookId,
                    title: item.name,
                    onClick: () => switchNotebook(item.id),
                    onDoubleClick: () => {
                      if (item.id === notebookId) openNotebookDialog('rename')
                    },
                  },
                  h('span', { className: 'qm-tab-name' }, item.name),
                  item.lastError
                    ? h(
                        'span',
                        {
                          className: 'qm-tab-badge qm-tab-badge--error',
                          title: item.lastError,
                          'aria-label': tr('status.error'),
                        },
                        '!',
                      )
                    : item.syncing
                      ? h('span', {
                          className: 'qm-tab-badge qm-tab-badge--sync',
                          title: tr('status.syncing'),
                          'aria-label': tr('status.syncing'),
                        })
                      : item.pending > 0
                        ? h(
                            'span',
                            {
                              className: 'qm-tab-badge',
                              title: tr('status.pending'),
                              'aria-label': tr('status.pending'),
                            },
                            item.pending > 99 ? '99+' : String(item.pending),
                          )
                        : null,
                ),
              ),
              h(
                'button',
                {
                  type: 'button',
                  className: 'qm-tab-add',
                  title: tr('tabs.new'),
                  'aria-label': tr('tabs.new'),
                  onClick: () => openNotebookDialog('create'),
                },
                '+',
              ),
            ),
            h(
              'button',
              {
                type: 'button',
                className: 'qm-tab-more',
                title: tr('tabs.actions'),
                'aria-label': tr('tabs.actions'),
                onClick: () => setNotebookMenuOpen((value) => !value),
                'aria-expanded': notebookMenuOpen,
              },
              '⋯',
            ),
            notebookMenuOpen
              ? h(
                  'div',
                  { className: 'qm-tab-menu', role: 'menu' },
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'qm-tab-menu-item',
                      role: 'menuitem',
                      onClick: () => openNotebookDialog('rename'),
                    },
                    tr('tabs.rename'),
                  ),
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'qm-tab-menu-item',
                      role: 'menuitem',
                      onClick: () => {
                        setNotebookMenuOpen(false)
                        setSettingsOpen(true)
                      },
                    },
                    tr('tabs.connect'),
                  ),
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'qm-tab-menu-item qm-tab-menu-item--danger',
                      role: 'menuitem',
                      onClick: () => void deleteNotebook(),
                    },
                    tr('tabs.delete'),
                  ),
                )
              : null,
          ),
          offline
            ? h(
                'div',
                { className: 'qm-banner', 'data-kind': 'warn', role: 'status' },
                h('div', { className: 'qm-banner-main' }, h('div', { className: 'qm-banner-body' }, tr('banner.offline'))),
                h('button', { type: 'button', className: 'qm-btn', onClick: () => void refresh() }, tr('banner.retry')),
              )
            : null,
          !account && phase !== 'loading'
            ? h(
                'div',
                { className: 'qm-banner', role: 'status' },
                h('span', { className: 'qm-icon' }, MailIcon()),
                h(
                  'div',
                  { className: 'qm-banner-main' },
                  h('div', { className: 'qm-banner-title' }, tr('banner.local.title')),
                  h('div', { className: 'qm-banner-body' }, tr('banner.local.body')),
                ),
                h(
                  'button',
                  { type: 'button', className: 'qm-btn', onClick: () => setSettingsOpen(true) },
                  tr('banner.local.action'),
                ),
              )
            : null,
          account && sync.lastError && !offline
            ? h(
                'div',
                { className: 'qm-banner', 'data-kind': 'error', role: 'status' },
                h(
                  'div',
                  { className: 'qm-banner-main' },
                  h('div', { className: 'qm-banner-title' }, tr('banner.error')),
                  h('div', { className: 'qm-banner-body' }, sync.lastError),
                ),
                h(
                  'button',
                  { type: 'button', className: 'qm-btn', onClick: () => void syncNow() },
                  tr('banner.retry'),
                ),
              )
            : null,
          h(
            'div',
            { className: 'qm-composer' },
            h('textarea', {
              ref: composerRef,
              className: 'qm-composer-text',
              value: draft,
              rows: rowsFor(draft, 6),
              spellCheck: false,
              placeholder: tr('composer.placeholder'),
              'aria-label': tr('composer.placeholder'),
              onPaste: (event) => handleImagePaste(event, 'draft'),
              onDrop: (event) => handleImageDrop(event, 'draft'),
              onDragOver: handleImageDragOver,
              onChange: (event) => {
                const value = event.target.value
                draftRef.current = value
                setDraft(value)
              },
              onKeyDown: (event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                  event.preventDefault()
                  void submitDraft()
                }
              },
            }),
            h(
              'div',
              { className: 'qm-composer-bar' },
              h(
                'div',
                { className: 'qm-composer-left' },
                h(
                  'div',
                  { className: 'qm-tools' },
                  h(ImageButton, {
                    onFiles: (files) => void addImages(files, 'draft'),
                    disabled: creating || uploading > 0,
                    title: tr('image.insert'),
                  }),
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'qm-tool qm-tool--text',
                      title: tr('md.bold'),
                      'aria-label': tr('md.bold'),
                      onClick: () => applyFormat('draft', 'bold'),
                      disabled: creating,
                    },
                    'B',
                  ),
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'qm-tool qm-tool--text',
                      title: tr('md.code'),
                      'aria-label': tr('md.code'),
                      onClick: () => applyFormat('draft', 'code'),
                      disabled: creating,
                    },
                    h('code', { className: 'qm-tool-code' }, '</>'),
                  ),
                ),
                h(
                  'span',
                  { className: 'qm-hint' },
                  uploading > 0 ? tr('image.uploading') : tr('composer.hint'),
                ),
              ),
              h(
                'button',
                {
                  type: 'button',
                  className: 'qm-btn qm-btn--primary',
                  onClick: () => void submitDraft(),
                  disabled: creating || uploading > 0 || !draft.trim(),
                },
                PlusIcon(),
                creating ? tr('status.syncing') : tr('composer.submit'),
              ),
            ),
          ),
          h(
            'div',
            { className: 'qm-toolbar' },
            h(
              'div',
              { className: 'qm-search' },
              SearchIcon(),
              h('input', {
                type: 'search',
                value: query,
                placeholder: tr('search.placeholder'),
                'aria-label': tr('search.placeholder'),
                onChange: (event) => setQuery(event.target.value),
              }),
              query
                ? h(
                    'button',
                    {
                      type: 'button',
                      className: 'qm-search-clear',
                      title: tr('search.clear'),
                      'aria-label': tr('search.clear'),
                      onClick: () => setQuery(''),
                    },
                    CloseIcon(),
                  )
                : null,
            ),
            allTags.length > 0
              ? h(
                  'div',
                  { className: 'qm-tags' },
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'qm-tag',
                      'data-active': activeTag === '' ? 'true' : 'false',
                      onClick: () => setActiveTag(''),
                    },
                    tr('tag.all'),
                  ),
                  allTags.map(([tag, count]) =>
                    h(
                      'button',
                      {
                        key: tag,
                        type: 'button',
                        className: 'qm-tag',
                        'data-active': activeTag === tag ? 'true' : 'false',
                        onClick: () => tagClick(tag),
                      },
                      `#${tag}`,
                      h('span', { style: { opacity: 0.55, marginLeft: '4px' } }, String(count)),
                    ),
                  ),
                )
              : null,
            h('span', { className: 'qm-count' }, `${visible.length} ${tr('unit.notes')}`),
          ),
          phase === 'loading' && notes.length === 0
            ? h('p', { className: 'qm-quiet' }, tr('status.syncing'))
            : null,
          showEmpty && !hasNotes
            ? h(
                'div',
                { className: 'qm-empty' },
                EmptyArt(),
                h('p', { className: 'qm-empty-title' }, tr('empty.title')),
                h('p', { className: 'qm-empty-body' }, tr('empty.body')),
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'qm-btn',
                    onClick: () => composerRef.current && composerRef.current.focus(),
                  },
                  tr('empty.action'),
                ),
              )
            : null,
          showEmpty && hasNotes
            ? h('p', { className: 'qm-quiet' }, activeTag ? tr('empty.tag') : tr('empty.search'))
            : null,
          groups.length > 0
            ? h(
                'div',
                { className: 'qm-timeline' },
                groups.map((group) =>
                  h(
                    'section',
                    { key: group.key },
                    h(
                      'div',
                      { className: 'qm-day' },
                      h('span', { className: 'qm-day-label' }, dayLabel(group.at, tr)),
                      h('span', { className: 'qm-day-line' }),
                      h('span', { className: 'qm-day-count' }, String(group.notes.length)),
                    ),
                    h('div', { className: 'qm-list' }, group.notes.map(card)),
                  ),
                ),
              )
            : null,
          h('span', { className: 'qm-sr' }, phase),
        ),
        notice
          ? h(
              'div',
              { className: 'qm-toast', 'data-kind': notice.kind, role: 'status', 'aria-live': 'polite' },
              h('span', { className: 'qm-toast-dot' }),
              notice.text,
            )
          : null,
        h(SettingsDialog, {
          open: settingsOpen,
          account,
          sync,
          notebookName: notebook ? notebook.name : '',
          api,
          onClose: () => setSettingsOpen(false),
          onState: applyState,
          toast,
        }),
        h(NotebookNameDialog, {
          open: Boolean(notebookDialog),
          mode: notebookDialog ? notebookDialog.mode : 'create',
          initialName: notebookDialog ? notebookDialog.name : '',
          error: notebookDialog ? notebookDialog.error : '',
          busy: notebookDialog ? notebookDialog.busy : false,
          onClose: () => {
            if (!notebookDialog || !notebookDialog.busy) setNotebookDialog(null)
          },
          onSubmit: (name) => void submitNotebookName(name),
        }),
        h(AboutDialog, {
          open: aboutOpen,
          about,
          onClose: () => setAboutOpen(false),
        }),
      )
    }

    /* ---------- settings ---------- */

    function SettingsDialog({ open, account, sync, notebookName, api, onClose, onState, toast }) {
      const tr = useTranslate()
      const [email, setEmail] = useState('')
      const [password, setPassword] = useState('')
      const [server, setServer] = useState('')
      const [port, setPort] = useState('993')
      const [folder, setFolder] = useState('DSH Notes')
      const [advanced, setAdvanced] = useState(false)
      const [submitting, setSubmitting] = useState(false)
      const [formError, setFormError] = useState('')
      const [showForm, setShowForm] = useState(false)
      const [disconnectConfirm, setDisconnectConfirm] = useState(false)
      const [syncingHere, setSyncingHere] = useState(false)
      const dialogRef = useRef(null)
      const closeRef = useRef(null)
      const previousFocus = useRef(null)

      useEffect(() => {
        if (!open) return undefined
        setEmail(account ? account.email : '')
        setFolder((account && account.folder) || 'DSH Notes')
        setServer('')
        setPort('993')
        setPassword('')
        setAdvanced(false)
        setFormError('')
        setShowForm(!account)
        setDisconnectConfirm(false)
        setSyncingHere(false)
        previousFocus.current = document.activeElement
        const bodyOverflow = document.body.style.overflow
        document.body.style.overflow = 'hidden'
        const timer = setTimeout(() => {
          const field = dialogRef.current && dialogRef.current.querySelector('input')
          if (field && field.offsetParent !== null) field.focus()
          else if (closeRef.current) closeRef.current.focus()
        }, 0)
        const onKey = (event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            onClose()
          }
        }
        document.addEventListener('keydown', onKey)
        return () => {
          clearTimeout(timer)
          document.body.style.overflow = bodyOverflow
          document.removeEventListener('keydown', onKey)
          if (previousFocus.current && previousFocus.current.focus) {
            try {
              previousFocus.current.focus()
            } catch {
              /* the trigger may be gone */
            }
          }
        }
      }, [open])

      function trapTab(event) {
        if (event.key !== 'Tab' || !dialogRef.current) return
        const items = Array.from(
          dialogRef.current.querySelectorAll(
            'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
          ),
        ).filter((item) => item.offsetParent !== null)
        if (items.length === 0) return
        const first = items[0]
        const last = items[items.length - 1]
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first.focus()
        }
      }

      async function submit(event) {
        event.preventDefault()
        if (submitting) return
        if (!email.trim() || !password) {
          setFormError(tr('account.passwordHint'))
          return
        }
        setSubmitting(true)
        setFormError('')
        try {
          const payload = { email: email.trim(), password, folder: folder.trim() || 'DSH Notes' }
          if (advanced && server.trim()) payload.host = server.trim()
          if (advanced && port.trim()) payload.port = Number(port)
          const data = await api('account', payload)
          onState(data)
          setPassword('')
          setShowForm(false)
          toast(tr('toast.connected'))
        } catch (error) {
          setFormError(error.message || tr('toast.error'))
        } finally {
          setSubmitting(false)
        }
      }

      async function disconnect() {
        try {
          const data = await api('disconnect')
          onState(data)
          setDisconnectConfirm(false)
          setShowForm(true)
          setPassword('')
          toast(tr('toast.disconnected'))
        } catch (error) {
          toast(error.message || tr('toast.error'), 'error')
        }
      }

      async function syncHere() {
        setSyncingHere(true)
        try {
          const data = await api('sync')
          onState(data)
          setSyncingHere(false)
          toast(tr('toast.synced'))
        } catch (error) {
          setSyncingHere(false)
          toast(error.message || tr('toast.error'), 'error')
        }
      }

      if (!open) return null

      const connected = Boolean(account)
      const form = showForm || !connected

      return h(
        'div',
        {
          className: 'qm-modal',
          onMouseDown: (event) => {
            if (event.target === event.currentTarget) onClose()
          },
        },
        h(
          'div',
          {
            className: 'qm-dialog',
            role: 'dialog',
            'aria-modal': 'true',
            'aria-labelledby': 'qm-settings-title',
            ref: dialogRef,
            onKeyDown: trapTab,
          },
          h(
            'div',
            { className: 'qm-dialog-head' },
            h(
              'div',
              null,
              h(
                'h2',
                { className: 'qm-dialog-title', id: 'qm-settings-title' },
                `${tr('settings.title')} · ${notebookName || tr('notebook.defaultName')}`,
              ),
              h('p', { className: 'qm-dialog-sub' }, tr('settings.intro')),
            ),
            h(
              'button',
              {
                type: 'button',
                className: 'qm-icon-btn qm-dialog-close',
                title: tr('settings.close'),
                'aria-label': tr('settings.close'),
                onClick: onClose,
                ref: closeRef,
              },
              CloseIcon(),
            ),
          ),
          connected && !form
            ? h(
                'div',
                null,
                h(
                  'div',
                  { className: 'qm-account-card' },
                  h(
                    'div',
                    { className: 'qm-account-row' },
                    h('span', { className: 'qm-account-icon' }, MailIcon()),
                    h(
                      'div',
                      null,
                      h('div', { className: 'qm-account-email' }, account.email),
                      h('div', { className: 'qm-account-meta' }, `${tr('account.connected')} · ${account.folder}`),
                    ),
                  ),
                  h(
                    'dl',
                    { className: 'qm-kv' },
                    h('dt', null, tr('account.server')),
                    h('dd', null, `${account.host}:${account.port || 993}`),
                    h('dt', null, tr('account.folder')),
                    h('dd', null, account.folder),
                    h('dt', null, tr('account.lastSync')),
                    h('dd', null, sync.lastSyncAt ? relativeTime(sync.lastSyncAt, tr) : tr('account.never')),
                    h('dt', null, tr('account.pending')),
                    h('dd', null, String(sync.pending || 0)),
                  ),
                  sync.lastError
                    ? h('div', { className: 'qm-form-error' }, sync.lastError)
                    : null,
                  h(
                    'div',
                    { className: 'qm-account-actions' },
                    h(
                      'button',
                      { type: 'button', className: 'qm-btn', onClick: () => void syncHere(), disabled: syncingHere || sync.syncing },
                      RefreshIcon(),
                      syncingHere || sync.syncing ? tr('status.syncing') : tr('sync.now'),
                    ),
                    h(
                      'button',
                      {
                        type: 'button',
                        className: 'qm-btn qm-btn--ghost',
                        onClick: () => {
                          setShowForm(true)
                          setFormError('')
                        },
                      },
                      tr('account.reconnect'),
                    ),
                    disconnectConfirm
                      ? h(
                          'button',
                          { type: 'button', className: 'qm-btn qm-btn--danger', onClick: () => void disconnect() },
                          tr('account.disconnectConfirm'),
                        )
                      : h(
                          'button',
                          {
                            type: 'button',
                            className: 'qm-btn qm-btn--ghost',
                            onClick: () => setDisconnectConfirm(true),
                            onBlur: () => setDisconnectConfirm(false),
                          },
                          tr('account.disconnect'),
                        ),
                  ),
                ),
                h('p', { className: 'qm-help', style: { marginTop: '12px' } }, tr('account.security')),
              )
            : h(
                'form',
                { className: 'qm-form', onSubmit: submit },
                h(
                  'div',
                  { className: 'qm-field' },
                  h('label', { className: 'qm-label', htmlFor: 'qm-email' }, tr('account.email')),
                  h('input', {
                    id: 'qm-email',
                    className: 'qm-input',
                    type: 'email',
                    value: email,
                    autoComplete: 'username',
                    spellCheck: false,
                    placeholder: 'you@example.com',
                    onChange: (event) => setEmail(event.target.value),
                    disabled: submitting,
                  }),
                ),
                h(
                  'div',
                  { className: 'qm-field' },
                  h('label', { className: 'qm-label', htmlFor: 'qm-password' }, tr('account.password')),
                  h('input', {
                    id: 'qm-password',
                    className: 'qm-input',
                    type: 'password',
                    value: password,
                    autoComplete: 'current-password',
                    placeholder: '••••••••••••',
                    onChange: (event) => setPassword(event.target.value),
                    disabled: submitting,
                  }),
                  h('p', { className: 'qm-help' }, tr('account.passwordHint')),
                ),
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'qm-advanced-toggle',
                    onClick: () => setAdvanced((value) => !value),
                    'aria-expanded': advanced,
                  },
                  advanced ? '▾' : '▸',
                  tr('account.advanced'),
                ),
                advanced
                  ? h(
                      'div',
                      { className: 'qm-field' },
                      h(
                        'div',
                        { className: 'qm-grid2' },
                        h(
                          'div',
                          { className: 'qm-field' },
                          h('label', { className: 'qm-label', htmlFor: 'qm-server' }, tr('account.server')),
                          h('input', {
                            id: 'qm-server',
                            className: 'qm-input',
                            value: server,
                            spellCheck: false,
                            placeholder: tr('account.serverPlaceholder'),
                            onChange: (event) => setServer(event.target.value),
                            disabled: submitting,
                          }),
                        ),
                        h(
                          'div',
                          { className: 'qm-field' },
                          h('label', { className: 'qm-label', htmlFor: 'qm-port' }, tr('account.port')),
                          h('input', {
                            id: 'qm-port',
                            className: 'qm-input',
                            value: port,
                            inputMode: 'numeric',
                            onChange: (event) => setPort(event.target.value.replace(/[^0-9]/g, '')),
                            disabled: submitting,
                          }),
                        ),
                      ),
                      h(
                        'div',
                        { className: 'qm-field', style: { marginTop: '10px' } },
                        h('label', { className: 'qm-label', htmlFor: 'qm-folder' }, tr('account.folder')),
                        h('input', {
                          id: 'qm-folder',
                          className: 'qm-input',
                          value: folder,
                          spellCheck: false,
                          onChange: (event) => setFolder(event.target.value),
                          disabled: submitting,
                        }),
                        h('p', { className: 'qm-help' }, tr('account.folderHint')),
                      ),
                    )
                  : null,
                formError ? h('div', { className: 'qm-form-error', role: 'alert' }, formError) : null,
                h(
                  'div',
                  { className: 'qm-form-actions' },
                  h(
                    'button',
                    { type: 'submit', className: 'qm-btn qm-btn--primary', disabled: submitting },
                    submitting ? tr('account.connecting') : tr('account.connect'),
                  ),
                  connected
                    ? h(
                        'button',
                        {
                          type: 'button',
                          className: 'qm-btn qm-btn--ghost',
                          onClick: () => {
                            setShowForm(false)
                            setFormError('')
                            setPassword('')
                          },
                          disabled: submitting,
                        },
                        tr('note.cancel'),
                      )
                    : null,
                ),
                h('div', { className: 'qm-divider' }),
                h('p', { className: 'qm-help' }, tr('account.verifyNote')),
                h('p', { className: 'qm-help' }, tr('account.security')),
                h('p', { className: 'qm-help' }, tr('account.outlook')),
              ),
        ),
      )
    }

    /* ---------- notebook name dialog ---------- */

    function NotebookNameDialog({ open, mode, initialName, error, busy, onClose, onSubmit }) {
      const tr = useTranslate()
      const [name, setName] = useState(initialName || '')
      const inputRef = useRef(null)
      const dialogRef = useRef(null)
      const previousFocus = useRef(null)

      useEffect(() => {
        if (!open) return undefined
        setName(initialName || '')
        previousFocus.current = document.activeElement
        const bodyOverflow = document.body.style.overflow
        document.body.style.overflow = 'hidden'
        const timer = setTimeout(() => {
          if (inputRef.current) {
            inputRef.current.focus()
            inputRef.current.select()
          }
        }, 0)
        const onKey = (event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            onClose()
          }
        }
        document.addEventListener('keydown', onKey)
        return () => {
          clearTimeout(timer)
          document.body.style.overflow = bodyOverflow
          document.removeEventListener('keydown', onKey)
          if (previousFocus.current && previousFocus.current.focus) {
            try {
              previousFocus.current.focus()
            } catch {
              /* the trigger may be gone */
            }
          }
        }
      }, [open, initialName])

      function trapTab(event) {
        if (event.key !== 'Tab' || !dialogRef.current) return
        const items = Array.from(
          dialogRef.current.querySelectorAll(
            'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
          ),
        ).filter((item) => item.offsetParent !== null)
        if (items.length === 0) return
        const first = items[0]
        const last = items[items.length - 1]
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first.focus()
        }
      }

      if (!open) return null

      return h(
        'div',
        {
          className: 'qm-modal',
          onMouseDown: (event) => {
            if (event.target === event.currentTarget && !busy) onClose()
          },
        },
        h(
          'div',
          {
            className: 'qm-dialog qm-nb-dialog',
            role: 'dialog',
            'aria-modal': 'true',
            'aria-labelledby': 'qm-notebook-title',
            ref: dialogRef,
            onKeyDown: trapTab,
          },
          h(
            'div',
            { className: 'qm-dialog-head' },
            h(
              'div',
              null,
              h(
                'h2',
                { className: 'qm-dialog-title', id: 'qm-notebook-title' },
                mode === 'create' ? tr('tabs.new') : tr('tabs.rename'),
              ),
            ),
            h(
              'button',
              {
                type: 'button',
                className: 'qm-icon-btn qm-dialog-close',
                title: tr('settings.close'),
                'aria-label': tr('settings.close'),
                onClick: onClose,
                disabled: busy,
              },
              CloseIcon(),
            ),
          ),
          h(
            'form',
            { className: 'qm-form', onSubmit: (event) => {
              event.preventDefault()
              const clean = name.trim()
              if (clean && !busy) onSubmit(clean)
            } },
            h(
              'div',
              { className: 'qm-field' },
              h('label', { className: 'qm-label', htmlFor: 'qm-notebook-name' }, tr('tabs.namePlaceholder')),
              h('input', {
                id: 'qm-notebook-name',
                ref: inputRef,
                className: 'qm-input',
                value: name,
                maxLength: 32,
                spellCheck: false,
                disabled: busy,
                placeholder: tr('tabs.namePlaceholder'),
                onChange: (event) => setName(event.target.value),
              }),
            ),
            error ? h('div', { className: 'qm-form-error', role: 'alert' }, error) : null,
            h(
              'div',
              { className: 'qm-form-actions' },
              h(
                'button',
                { type: 'button', className: 'qm-btn qm-btn--ghost', onClick: onClose, disabled: busy },
                tr('notebook.cancel'),
              ),
              h(
                'button',
                { type: 'submit', className: 'qm-btn qm-btn--primary', disabled: busy || !name.trim() },
                busy ? tr('status.syncing') : tr('notebook.save'),
              ),
            ),
          ),
        ),
      )
    }

    /* ---------- about ---------- */

    function AboutDialog({ open, about, onClose }) {
      const tr = useTranslate()
      const dialogRef = useRef(null)
      const closeRef = useRef(null)
      const previousFocus = useRef(null)

      useEffect(() => {
        if (!open) return undefined
        previousFocus.current = document.activeElement
        const bodyOverflow = document.body.style.overflow
        document.body.style.overflow = 'hidden'
        const timer = setTimeout(() => {
          if (closeRef.current) closeRef.current.focus()
        }, 0)
        const onKey = (event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            onClose()
          }
        }
        document.addEventListener('keydown', onKey)
        return () => {
          clearTimeout(timer)
          document.body.style.overflow = bodyOverflow
          document.removeEventListener('keydown', onKey)
          if (previousFocus.current && previousFocus.current.focus) {
            try {
              previousFocus.current.focus()
            } catch {
              /* the trigger may be gone */
            }
          }
        }
      }, [open])

      function trapTab(event) {
        if (event.key !== 'Tab' || !dialogRef.current) return
        const items = Array.from(
          dialogRef.current.querySelectorAll('button:not([disabled]), a[href]'),
        ).filter((item) => item.offsetParent !== null)
        if (items.length === 0) return
        const first = items[0]
        const last = items[items.length - 1]
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first.focus()
        }
      }

      if (!open) return null

      const repository = about.repository || FALLBACK_ABOUT.repository
      const releases = repository.replace(/\/+$/, '') + '/releases'
      return h(
        'div',
        {
          className: 'qm-modal',
          onMouseDown: (event) => {
            if (event.target === event.currentTarget) onClose()
          },
        },
        h(
          'div',
          {
            className: 'qm-dialog qm-about',
            role: 'dialog',
            'aria-modal': 'true',
            'aria-labelledby': 'qm-about-title',
            ref: dialogRef,
            onKeyDown: trapTab,
          },
          h(
            'div',
            { className: 'qm-dialog-head' },
            h(
              'div',
              null,
              h('h2', { className: 'qm-dialog-title', id: 'qm-about-title' }, tr('about.title')),
              h('p', { className: 'qm-dialog-sub' }, tr('about.description')),
            ),
            h(
              'button',
              {
                type: 'button',
                className: 'qm-icon-btn qm-dialog-close',
                title: tr('about.close'),
                'aria-label': tr('about.close'),
                onClick: onClose,
                ref: closeRef,
              },
              CloseIcon(),
            ),
          ),
          h(
            'div',
            { className: 'qm-about-brand' },
            h('span', { className: 'qm-about-mark' }, h(MemoIcon, { size: 28 })),
            h(
              'div',
              { className: 'qm-about-id' },
              h('div', { className: 'qm-about-name' }, tr('title')),
              h('div', { className: 'qm-about-package' }, about.name || FALLBACK_ABOUT.name),
            ),
          ),
          h(
            'dl',
            { className: 'qm-kv qm-about-kv' },
            h('dt', null, tr('about.version')),
            h('dd', null, 'v' + (about.version || FALLBACK_ABOUT.version)),
            h('dt', null, tr('about.developer')),
            h('dd', null, about.developer || FALLBACK_ABOUT.developer),
            h('dt', null, tr('about.updated')),
            h('dd', null, about.updatedAt || FALLBACK_ABOUT.updatedAt),
            h('dt', null, tr('about.license')),
            h('dd', null, about.license || FALLBACK_ABOUT.license),
          ),
          h(
            'div',
            { className: 'qm-about-links' },
            h(
              'a',
              {
                className: 'qm-about-link',
                href: repository,
                target: '_blank',
                rel: 'noopener noreferrer',
              },
              tr('about.repository'),
            ),
            h(
              'a',
              {
                className: 'qm-about-link',
                href: releases,
                target: '_blank',
                rel: 'noopener noreferrer',
              },
              tr('about.releases'),
            ),
          ),
          h('p', { className: 'qm-help qm-about-note' }, tr('about.note')),
        ),
      )
    }

    /* ---------- plugin ---------- */

    function apply(ctx) {
      localeService = ctx.locale
      t = ctx.locale.bind('flomo-notes')

      ctx.effect(() => {
        const stopEn = ctx.locale.register('flomo-notes', 'en', EN)
        const stopZh = ctx.locale.register('flomo-notes', 'zh', ZH)
        return () => {
          stopEn()
          stopZh()
        }
      }, 'flomo-notes:locale')

      ctx.slots.inject('sidebar.panellist', () =>
        ctx.slots.register(
          {
            name: 'sidebar.panellist',
            id: 'flomo-notes',
            order: 30,
            label: () => t('label'),
          },
          MemoIcon,
        ),
      )

      ctx.slots.inject('main', () =>
        ctx.slots.register({ name: 'main', key: 'flomo-notes' }, MemoPage),
      )
    }

    return {
      inject: ['slots', 'locale'],
      apply,
    }
  },
})
