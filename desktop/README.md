# Quick Memo Desktop · Tauri 2 + Rust

这是 `dsh-notes` 项目的桌面版，产品名 **Quick Memo**。当前是 **IMAP 技术验证（spike）**，不是完整笔记应用。

## 当前已验证

- macOS arm64 可编译、打包：
  - `Quick Memo.app`：约 **10.4 MiB**
  - `Quick Memo_0.1.0_aarch64.dmg`：约 **3.1 MiB**
- Rust 侧真实 IMAP 往返（Ethereal 临时邮箱）：
  - TLS 连接、LOGIN
  - LIST / CREATE / SELECT
  - APPEND 一封带 1×1 PNG 图片的笔记邮件
  - UID SEARCH / FETCH / 解析 base64 JSON
  - 读回文本和图片字节（`image_bytes = 68`）
- 前端 Vite 构建、Tauri bundling 通过。
- `cargo test`：
  - 笔记 payload 解析测试
  - 坏 body 拒绝测试
  - `live_imap_roundtrip`（默认 `#[ignore]`，需要环境变量提供临时邮箱）

## 运行

```bash
cd desktop
npm install
npm run tauri dev
```

构建 macOS 包：

```bash
PATH="$HOME/.cargo/bin:$PATH" npm run tauri build
```

产物：

```text
src-tauri/target/release/bundle/macos/Quick Memo.app
src-tauri/target/release/bundle/dmg/Quick Memo_0.1.0_aarch64.dmg
```

Windows 构建尚未在本机验证；CI 上需要 WebView2、NSIS/MSI 和代码签名。

## 界面当前能做什么

- 填邮箱、应用专用密码、IMAP 服务器/端口和测试文件夹；
- 服务器留空时按邮箱域名猜测常见服务商；
- 点「测试连接并往返一封笔记」后运行 Rust `imap_probe`；
- 显示文件夹列表、UID、邮件字节数、图片字节数和读回的笔记文本。

安全约束：

- 测试文件夹默认 `DSH Notes Spike`，Rust 会拒绝写入 `DSH Notes`，避免污染正式笔记；
- 每次测试会向测试文件夹追加一封测试邮件；
- 当前版本不保存密码；完整版会使用 macOS Keychain / Windows Credential Manager；
- 请使用应用专用密码/授权码，不要用邮箱登录密码。

## 真实邮箱测试

正常用界面即可。也可以直接跑 Rust ignored test：

```bash
cd src-tauri
QUICK_MEMO_TEST_EMAIL=... \
QUICK_MEMO_TEST_PASSWORD=... \
QUICK_MEMO_TEST_HOST=imap.ethereal.email \
QUICK_MEMO_TEST_PORT=993 \
QUICK_MEMO_TEST_FOLDER="Quick Memo Spike test" \
PATH="$HOME/.cargo/bin:$PATH" \
cargo test live_imap_roundtrip -- --ignored --nocapture
```

## 下一步（完整 MVP）

1. Rust 笔记模型 + SQLite 本地存储 + 图片目录；
2. 完整 `v:1` 邮件协议（Markdown/图片/删除墓碑/LWW 合并）；
3. 后台同步、休眠唤醒重试、图片回填、logout 超时保护；
4. Quick Memo UI：快速输入、列表、Markdown、图片、标签、搜索；
5. 托盘/菜单栏、全局快捷键、开机启动；
6. macOS Developer ID + notarization；Windows Authenticode + WebView2/NSIS；
7. GitHub Actions matrix、自动更新、Homebrew/winget。

## 结构

```text
desktop/
  src/                 React UI（Vite）
  src-tauri/
    src/lib.rs         Rust IMAP spike + 单元测试
    src/main.rs
    tauri.conf.json
    capabilities/
    icons/
  app-icon.png         图标源文件
```

插件本体仍在仓库根目录；桌面版不进入 `dsh-notes` 插件的 npm tarball。
