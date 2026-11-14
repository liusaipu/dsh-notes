# Quick Memo Desktop · Tauri 2 + Rust

这是 `dsh-quicknotes` 项目的桌面客户端，产品名 **Quick Memo**。当前版本 **0.3.0**，是一个可用的本地笔记 MVP，并已接通与 DSH 插件相同的邮箱同步协议。

## 下载 0.3.0（预发布）

发布页：[Quick Memo Desktop v0.3.0（Pre-release）](https://github.com/liusaipu/dsh-quicknotes/releases/tag/desktop-v0.3.0)

| 平台 | 文件 | 说明 |
| --- | --- | --- |
| macOS arm64 | [`Quick.Memo_0.3.0_aarch64.dmg`](https://github.com/liusaipu/dsh-quicknotes/releases/download/desktop-v0.3.0/Quick.Memo_0.3.0_aarch64.dmg) | 未签名；Apple Silicon |
| Windows x64 | [`quick-memo-windows-portable.zip`](https://github.com/liusaipu/dsh-quicknotes/releases/download/desktop-v0.3.0/quick-memo-windows-portable.zip) | 解压即用，无需安装 |
| Windows x64 | [`Quick.Memo_0.3.0_x64-setup.exe`](https://github.com/liusaipu/dsh-quicknotes/releases/download/desktop-v0.3.0/Quick.Memo_0.3.0_x64-setup.exe) / [`MSI`](https://github.com/liusaipu/dsh-quicknotes/releases/download/desktop-v0.3.0/Quick.Memo_0.3.0_x64_en-US.msi) | 安装版；未签名 |
| 校验 | [`SHA256SUMS.txt`](https://github.com/liusaipu/dsh-quicknotes/releases/download/desktop-v0.3.0/SHA256SUMS.txt) | 发布文件 SHA-256 |

完整的更新内容、安装步骤、验证范围和限制见 [RELEASE_NOTES_0.3.0.md](RELEASE_NOTES_0.3.0.md)。不安装测试：macOS 直接打开 DMG 里的 App；Windows 解压 portable zip 后运行 `quick-memo.exe`。

## 当前功能

- 本地笔记增删改，数据落在系统应用数据目录；
- **多笔记本**：标签栏切换、新建、双击重命名、删除；最多 20 个；
- **标签**：`#标签` 自动提取，顶部标签筛选、每条笔记的标签 chip 可点击筛选；
- Markdown 渲染（marked + DOMPurify）；
- 邮箱账号设置：IMAP 服务器、端口、同步文件夹；
- 同步到自己的邮箱文件夹，和 DSH `dsh-quicknotes` 插件共用同一套 `v:1` 邮件协议；
- 账号密码保存在 macOS 钥匙串 / Windows Credential Manager，不写入笔记文件；
- 一个邮箱只能绑定一个笔记本，和 DSH 插件的约束一致；
- 手动同步按钮、待同步数量、上次同步时间/错误提示；
- 浅色/深色跟随系统；
- macOS 与 Windows 共用同一套 Tauri + Rust 代码。

同步协议目前发送/合并**文本、删除墓碑和图片原始 payload**；桌面端还不显示图片、也不支持新增图片，但从其他设备同步来的图片字节会被保留，编辑笔记不会把它们丢掉。后台自动同步、提醒和图片显示还没有接入，DSH 插件里的这些能力仍可继续使用。

## 已验证

- `cargo test`：7 个本地校验测试通过（含多笔记本、旧版单笔记本迁移、邮箱唯一性）；
- **真实 IMAP 往返**（Ethereal 临时邮箱）：两个独立本地 Store 通过同一个邮箱文件夹同步，第一个写入、第二个读回并合并成功；
- 前端 Vite 构建通过；jsdom UI smoke 渲染笔记、Markdown、标签筛选、笔记本切换/新建和设置弹窗通过；
- macOS 0.3.0 实机启动通过；把旧版单笔记本 `state.json` 放进临时 HOME 后启动，自动迁移为 `default` 笔记本，笔记正文保留；
- Windows CI 启动冒烟通过：启动 `quick-memo.exe`，进程保持运行，`%APPDATA%\com.liusaipu.quickmemo\state.json` 成功写入，旧版单笔记本迁移为 `default`，迁移笔记保留；
- macOS arm64 打包通过：
  - `Quick Memo.app`：约 10.8 MiB
  - `Quick Memo_0.3.0_aarch64.dmg`：约 3.2 MiB

## 运行

```bash
cd desktop
npm install
PATH="$HOME/.cargo/bin:$PATH" npm run tauri dev
```

构建 macOS 包：

```bash
PATH="$HOME/.cargo/bin:$PATH" npm run tauri build
```

产物：

```text
src-tauri/target/release/bundle/macos/Quick Memo.app
src-tauri/target/release/bundle/dmg/Quick Memo_0.3.0_aarch64.dmg
```

## Windows

Windows 构建需要 Rust、Node、WebView2（Windows 10/11 通常已安装）和 NSIS/WiX。现在仓库里已加入 `.github/workflows/desktop.yml`，可在 GitHub Actions 的 **Desktop app** workflow 手动运行，或推送 `desktop-v*` tag 触发 macOS/Windows 矩阵构建；产物会上传为 workflow artifact，Windows 还会额外上传免安装的 `quick-memo-windows-portable` zip。

CI 的 `windows-latest` 已运行启动和旧版迁移冒烟测试；完整 UI 交互、凭据管理器、IMAP 同步和安装器流程还没有在 Windows 实机验证。正式分发前还要做 Authenticode 签名和 SmartScreen 验证。

## 数据位置

Tauri 的 app data 目录下：

- macOS：`~/Library/Application Support/com.liusaipu.quickmemo/`
- Windows：`%APPDATA%\com.liusaipu.quickmemo\`

其中 `state.json` 是笔记本注册表、笔记和每个笔记本的同步状态，`images/` 预留给后续图片功能。密码不在这里，而在系统凭据管理器。

## 代码结构

```text
desktop/
  src/                 React UI（Vite）
  src-tauri/src/
    lib.rs             Tauri commands
    store.rs           JSON 本地存储、LWW 合并、删除墓碑
    mime.rs            笔记邮件构建/解析
    sync.rs            IMAP 账号验证与同步
  src-tauri/tauri.conf.json
```

## 已知限制

- 图片暂不显示、不支持新增；从其他设备同步来的图片字节会保留；
- 同步是手动的，没有后台定时器；
- 没有 `!!` 提醒；
- 没有搜索框（标签筛选已支持；全文搜索仍建议用 DSH 插件）；
- 未签名、未公证，公开分发前需 Apple Developer ID + notarization / Windows 代码签名。
