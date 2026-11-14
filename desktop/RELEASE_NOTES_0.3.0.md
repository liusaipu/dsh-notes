# Quick Memo Desktop 0.3.0

**Windows / macOS 原生桌面客户端 · 本地优先 · 邮箱同步 · 未签名 MVP**

这是 Quick Memo 桌面端的第一个公开版本。它和 DSH 的 `dsh-quicknotes` 插件共用同一套邮箱协议，但不是插件的壳：桌面端是一个独立的 Tauri 2 + Rust 应用，面向想要一个轻量、随手可记的本地笔记本的人。

> 这是预发布（pre-release）版本，安装包未签名、未公证。正式日常使用前请先备份重要笔记，并阅读下面的“已知限制”。

## 亮点

### 本地优先，离线也能记

- 笔记保存在系统应用数据目录，启动不需要登录；
- 写入使用临时文件 + 替换，尽量避免半截文件；
- 文本上限 20,000 字符，删除使用墓碑标记，方便多设备合并。

### 多笔记本

- 顶部 tab 切换，笔记本之间完全独立；
- `+` 新建，双击 tab 或 `⋯ → 重命名` 改名；
- `⋯ → 删除笔记本`，至少保留一个，最多 20 个；
- 每个笔记本有独立的笔记、邮箱、同步文件夹、待同步数和错误状态；
- **一个邮箱只能绑定一个笔记本**，和 DSH 插件一致，避免同一个邮箱把不同笔记本的数据串在一起；
- 删除只清理本机数据，不会删除邮箱里的同步邮件。

### 标签提示与筛选

- 输入框提示 `#标签`，正文里的 `#工作`、`#读书` 会被自动提取；
- 顶部标签栏显示「全部」和每个标签的笔记数；
- 点标签只显示对应笔记，点「全部」恢复；
- 每条笔记下方也有标签 chip，点击即可筛选；
- 支持中文、英文、数字、`-` 和 `_`。

### 和 DSH 插件同步

- 使用同一个 `v:1` 笔记邮件协议，把文本、删除墓碑和图片原始 payload 写进邮箱文件夹；
- 合并规则是 `(updatedAt, revBy)` 的 last-write-wins；
- 默认文件夹 `DSH Notes`，也可以为每个笔记本单独配置；
- 支持 Gmail、iCloud、QQ、163、126 等 IMAP 邮箱的应用专用密码/授权码；
- 密码保存在 macOS 钥匙串 / Windows Credential Manager，不写进笔记文件；
- 手动同步，显示待同步数量、上次同步时间和错误原因。

### 从 0.2.0 升级

0.2.0 的单笔记本 `state.json` 会自动迁移为 `default` 笔记本，名称「我的笔记」，笔记正文保留。迁移后文件版本变为 2；如果迁移失败，原文件不会被覆盖。

## 下载

| 平台 | 文件 | 说明 |
| --- | --- | --- |
| macOS arm64 | `Quick Memo_0.3.0_aarch64.dmg` | Apple Silicon；未签名 |
| Windows x64 | `quick-memo-windows-portable.zip` | **推荐先试用**，解压即用，无需安装 |
| Windows x64 | `Quick Memo_0.3.0_x64-setup.exe` / `.msi` | 安装版；未签名 |
| 校验 | `SHA256SUMS.txt` | 所有发布文件的 SHA-256 |

### macOS

1. 下载 DMG，双击打开；
2. 把 Quick Memo 拖进 Applications（或者直接在 DMG 里运行，不安装）；
3. 首次打开若被 Gatekeeper 拦截，右键 App →「打开」；
4. 当前只提供 arm64，Intel Mac 需要等 x64/universal 构建。

### Windows

1. 下载 `quick-memo-windows-portable.zip` 并解压；
2. 运行 `quick-memo.exe`；Windows 10/11 通常已带 WebView2 Runtime；
3. 如果 SmartScreen 拦截，选择「更多信息 → 仍要运行」；
4. 也可以使用安装器，但安装版和便携版用的是同一份应用代码。

## 第一次使用

1. 打开 App，左侧（桌面端为顶部）是笔记本 tab，当前默认「我的笔记」；
2. 在输入框写内容，`⌘/Ctrl + Enter` 或点「记下来」；
3. 点击右上角设置，连接一个**测试邮箱和测试文件夹**，例如 `Quick Memo Test`；
4. 保存后点「立即同步」，检查待同步数是否归零；
5. 测试完可以断开邮箱，密码会从系统凭据管理器移除。

快速测试标签：写一条带 `#测试` 的笔记，顶部会出现 `#测试` 筛选；新建一个笔记本，确认笔记不会串到另一个 tab。

## 验证范围

- Rust 7 个单元测试：本地笔记、LWW 合并、旧版迁移、多笔记本、邮箱唯一性、MIME 往返；
- 真实 Ethereal 临时邮箱：两个独立本地 Store 通过同一个文件夹完成写入、读取、合并；
- 前端 jsdom UI smoke：Markdown、标签筛选、笔记标签 chip、多笔记本 tab、新建笔记本、设置弹窗；
- macOS 0.3.0 实机启动，旧版单笔记本迁移成功；
- Windows 0.3.0 CI 启动冒烟：启动 `quick-memo.exe`，进程保持运行，`%APPDATA%\com.liusaipu.quickmemo\state.json` 写入，旧版迁移成功；
- CI 矩阵：macOS + Windows 构建、便携 zip、安装器均成功。

**未验证**：Windows 实机上的完整 UI 交互、Windows 凭据管理器、Windows IMAP 同步、安装器的卸载/升级流程，以及 macOS 公证后的 Gatekeeper 行为。CI 的 Windows runner 不是日常桌面环境，不能替代人工点测。

## 已知限制

- 图片可以看到同步 payload 被保留，但桌面端**还不显示、也不支持新增图片**；
- 没有后台定时同步，需要手动点同步；
- 没有 `!!` 提醒、托盘、全局快捷键、开机启动；
- 没有搜索框（标签筛选已支持；搜索仍建议用 DSH 插件）；
- 未签名、未公证；Windows SmartScreen / macOS Gatekeeper 会提示；
- 只提供 macOS arm64 和 Windows x64；没有 Linux、Intel Mac、universal 构建；
- 单窗口；DSH 插件仍是功能更完整的日常入口（多笔记本、搜索、图片、提醒）。

## 数据与隐私

- macOS：`~/Library/Application Support/com.liusaipu.quickmemo/`
- Windows：`%APPDATA%\com.liusaipu.quickmemo\`
- 本地 `state.json` 包含笔记、笔记本注册表和同步状态；`images/` 预留给图片；
- 邮箱密码只在系统凭据管理器，不在 `state.json`；
- 同步邮件直接写入用户自己的邮箱，不经过 Quick Memo 的服务器；
- 删除 App 不会自动删除应用数据或邮箱里的邮件，需要手动清理。

## 反馈

- 源码与问题：<https://github.com/liusaipu/dsh-quicknotes>
- 插件版本：<https://github.com/liusaipu/dsh-quicknotes/releases/tag/v1.3.2>
- 桌面端说明：[desktop/README.md](https://github.com/liusaipu/dsh-quicknotes/blob/main/desktop/README.md)

如果遇到启动失败，请附上平台版本、安装包类型（portable/installer）和 `state.json` 是否存在；不要贴邮箱密码或完整笔记内容。
