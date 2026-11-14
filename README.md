# 随手记 · Quick Memo

一个 flomo 风格的 DSH Desktop 插件：左侧栏入口、随手记录、标签、搜索、**Markdown 渲染**和**图片插入**，支持**多笔记本**，并可通过**自己的邮箱**在多台 DSH Desktop 之间同步。

![icon](./icon.svg)

仓库：<https://github.com/liusaipu/dsh-quicknotes>

本仓库包含两个可独立使用的产品：

- **DSH 插件**：`dsh-quicknotes`，功能完整，包含搜索、图片、提醒和多笔记本；
- **Quick Memo 桌面客户端**：Tauri 2 + Rust 原生应用，**0.3.0 已发布**，支持 macOS / Windows，本地优先，并可通过邮箱与插件同步。  
  下载：[Quick Memo Desktop v0.3.0](https://github.com/liusaipu/dsh-quicknotes/releases/tag/desktop-v0.3.0) · [Release Notes](desktop/RELEASE_NOTES_0.3.0.md)

> 插件包名：**`dsh-quicknotes`**（从 1.3.0 起），GitHub 仓库也从 `dsh-notes` 改名为 `dsh-quicknotes`（从 1.3.1 起）。旧的包名 `dsh-notes` 已停用；现有本地笔记和邮箱连接不会因为改名丢失。

## 设计：为什么用邮箱同步

不依赖任何中转服务器，也不需要 DSH 账号提供云存储：

1. 每台电脑先写入本地 `$DSH_HOME/storages/flomo/notebooks/<笔记本 id>/state.json`，离线也能记。
2. 每条笔记的每个修订版本被追加成一封小邮件，放进邮箱里的专用文件夹（默认 `DSH Notes`）。
3. 另一台电脑用**同一个邮箱**连接后，按 UID 增量读取该文件夹，把邮件里的修订合并进本地。
4. 合并规则是 `(updatedAt, deviceId)` 的 last-write-wins，删除用墓碑标记；两端最终收敛到同一份记录。

### “验证邮箱”如何实现

连接时，插件会：

1. 用 IMAP 登录邮箱；
2. 在目标文件夹中创建（或复用）`DSH Notes`；
3. **写入一封带随机校验码的验证邮件，再立即从文件夹读回并校验**；
4. 读回成功后删除验证邮件，并把账号信息保存到本地。

写入 + 读回成功，就同时证明了 IMAP 账号、文件夹读写权限和网络连通性；不需要再发一封验证码邮件，也不需要 SMTP。

### 邮件里存了什么

每封邮件是一个独立、可读的修订快照：

```
X-DSH-Memo: 1
X-DSH-Kind: note
X-DSH-Note-Id: <uuid>
X-DSH-Note-Updated: <毫秒时间戳>
X-DSH-Note-Device: <设备 id>
X-DSH-Note-Deleted: 0|1
Content-Transfer-Encoding: base64

<base64 的 JSON：id / text / createdAt / updatedAt / revBy / deleted>
```

因此任意一封邮件都能独立解读，不依赖同一线程的其他邮件；同步失败或重装后重新扫描文件夹即可恢复。

## 多笔记本

顶部的 tab 栏可以在多个笔记本之间切换。每个笔记本有独立的：

- 显示名称（可随时重命名，名字只保存在本机，不同步到其他设备）；
- 本地 `state.json` 和 `images/` 目录；
- 邮箱账号、同步文件夹和 UID 游标；
- 搜索、标签筛选和草稿。

**一个邮箱只能绑定一个笔记本**。连接邮箱时，Host 会按邮箱地址（不区分大小写）检查其他笔记本；如果已被占用，会返回 `MAILBOX_CONFLICT`，并提示占用它的笔记本名称。即使两个笔记本使用同一个邮箱的不同文件夹，也会被拒绝，避免串数据。

常用操作：

- `+` 新建笔记本，默认名类似「笔记本 2」；
- 双击当前 tab 重命名；
- tab 右侧的 `⋯` 可以重命名、连接邮箱或删除；
- 删除只清理本机目录和凭据，邮箱里的同步邮件不会删除；如果另一台设备还连着同一个邮箱，笔记可能会再次同步回来；
- 至少保留一个笔记本，最多 20 个。

数据布局：

```text
$DSH_HOME/storages/flomo/
├── notebooks.json
└── notebooks/
    ├── default/          # 旧版单笔记本迁移后固定使用 default
    │   ├── state.json
    │   └── images/
    └── 7f3ac1d9/
        ├── state.json
        └── images/
```

旧版只有一份 `state.json` 的情况下，首次加载会自动迁移到 `notebooks/default/`，名称默认为「我的笔记」，并沿用原来的密码凭据引用，**不需要重新输入应用专用密码**。迁移先复制、最后原子提交 `notebooks.json`，失败时旧数据保持原样。

图片路径现在是 `/flomo/api/image/<笔记本 id>/<图片 id>`；旧的无笔记本路径仍会回退到当前笔记本，兼容旧缓存。

## 提醒（`!!`）

在输入框里只输入 `!!`，会展开日期/时间/说明选择器；设置后会在草稿第一行写入：

```text
!!2026-11-13 09:00 交周报
把上周的测试数据补进表格。
```

保存成普通笔记即可。到达目标时间前 15 分钟，页面顶部会出现提醒横幅，可以「推迟 10 分钟」或「知道了」。

- 只支持未来某个时间点的一次性提醒，不做每天/每周重复；
- 只在 DSH Desktop 打开时有效，关闭 DSH 不会在后台响；下次打开会补报为「已过期」；
- 提醒就是笔记正文，跟着笔记同步；删除/修改那一行就等于取消/改时间；
- 已读/推迟状态只存在本机 `localStorage`，两台设备各自提醒；
- 系统通知取决于浏览器 `Notification` 权限，没授权时仍显示横幅。

## 使用

1. 打开左侧栏的「随手记」。
2. 在顶部输入框写内容，`⌘/Ctrl + Enter` 或点「记下来」。
3. 点击标题栏的齿轮，填写邮箱并连接：
   - **Gmail**：需开启两步验证并生成「应用专用密码」。
   - **iCloud**：在 Apple ID 中生成 App 专用密码，服务器 `imap.mail.me.com`。
   - **QQ 邮箱 / 163 / 126**：在邮箱设置中开启 IMAP 并使用「授权码」。
   - **Outlook / Microsoft 365**：目前微软限制密码方式登录 IMAP，暂不支持。
4. 在第二台 DSH Desktop 上连接同一邮箱和同一文件夹，点击「立即同步」或等待自动同步。

高级设置里可以修改 IMAP 服务器、端口和同步文件夹名。服务器地址留空时会按邮箱域名自动识别。


## 桌面版（Quick Memo 0.3.0）

`desktop/` 是 Quick Memo 桌面客户端（Tauri 2 + Rust），和 DSH 插件共用同一套邮箱协议，但独立运行。

**0.3.0 已发布：** <https://github.com/liusaipu/dsh-quicknotes/releases/tag/desktop-v0.3.0>  
完整说明：[Release Notes](desktop/RELEASE_NOTES_0.3.0.md)

- 本地笔记、Markdown 渲染、编辑/删除；
- 多笔记本：tab 切换、新建、双击重命名、删除，最多 20 个；
- 标签：`#标签` 提示、顶部筛选、每条笔记的标签 chip；
- 每个笔记本独立邮箱；一个邮箱只能绑定一个笔记本；
- 和插件相同的 IMAP 同步协议，支持文本、删除墓碑和图片 payload；
- macOS 钥匙串 / Windows Credential Manager 保存密码；
- 手动同步、待同步数、上次同步时间/错误提示；
- 浅色/深色跟随系统。

**下载**：

- macOS arm64：[`Quick.Memo_0.3.0_aarch64.dmg`](https://github.com/liusaipu/dsh-quicknotes/releases/download/desktop-v0.3.0/Quick.Memo_0.3.0_aarch64.dmg)（未签名）
- Windows x64：[`quick-memo-windows-portable.zip`](https://github.com/liusaipu/dsh-quicknotes/releases/download/desktop-v0.3.0/quick-memo-windows-portable.zip)（免安装，推荐先试）或 [NSIS 安装器](https://github.com/liusaipu/dsh-quicknotes/releases/download/desktop-v0.3.0/Quick.Memo_0.3.0_x64-setup.exe) / [MSI](https://github.com/liusaipu/dsh-quicknotes/releases/download/desktop-v0.3.0/Quick.Memo_0.3.0_x64_en-US.msi)

**验证**：Rust 7 个单元测试、真实 Ethereal 邮箱双 Store 同步、macOS 实机启动/旧数据迁移、Windows CI 启动冒烟均通过；Windows 完整 UI 交互、凭据管理器和 IMAP 仍未在 Windows 实机人工验证。包未签名，正式分发前需签名/公证。

构建：

```bash
cd desktop && npm install
PATH="$HOME/.cargo/bin:$PATH" npm run tauri build
```

产物在 `desktop/src-tauri/target/release/bundle/`；CI 在 `.github/workflows/desktop.yml`。详见 [desktop/README.md](desktop/README.md)。

## 关于

标题栏的 **i** 图标会打开「关于」：显示插件名称、包名、版本、开发者、更新日期、许可证，以及 GitHub 仓库和发布记录链接。版本与更新日期来自 `package.json`，不需要在界面里手动维护。

## 安装到另一台 DSH Desktop


这台机器上的安装是 profile 里的本地链接，不会自动出现在另一台机器。可以选下面任一种方式（要求 DSH Desktop ≥ 0.2.1-rc.5，对应 `package.json` 的 `engines.dsh`）：

### 0. 从 GitHub Release 安装（推荐给其他人）

公开 Release：<https://github.com/liusaipu/dsh-quicknotes/releases/tag/v1.3.2>

- 直接下载 [dsh-quicknotes-1.3.2.tgz](https://github.com/liusaipu/dsh-quicknotes/releases/download/v1.3.2/dsh-quicknotes-1.3.2.tgz)，然后 **Plugins → Add plugin → Install a third-party plugin** 填它的绝对路径；
- 或者把 Release 资源 URL 直接粘贴到同一个输入框：

```text
https://github.com/liusaipu/dsh-quicknotes/releases/download/v1.3.2/dsh-quicknotes-1.3.2.tgz
```

安装器支持 tarball URL 或本地 tarball 路径，不需要 npm 账号或 GitHub 账号。若网络访问 GitHub 受限，先下载 tarball 再传过去。

### 1. 拷贝安装包（最快，不需要 Git）

```bash
npm pack
# 得到 dsh-quicknotes-1.3.2.tgz
```

把 tarball 用 AirDrop、网盘或 U 盘复制到另一台机器，然后：

**Plugins → Add plugin → Install a third-party plugin → 填 tarball 的绝对路径 → Install**。

### 2. 从 Git 仓库安装（可分享，不需要市场）

把本目录推到一个 Git 仓库（仓库名 `dsh-quicknotes`）：

```bash
cd dsh-quicknotes
git init -b main
git add .
git commit -m "dsh-quicknotes 1.3.2"
git remote add origin https://github.com/liusaipu/dsh-quicknotes.git
git push -u origin main
```

在另一台机器上，**Plugins → Add plugin → Install a third-party plugin** 填入：

```
git+https://github.com/liusaipu/dsh-quicknotes.git#<40 位 commit SHA>
```

如果插件在仓库子目录，追加 `&path:/<子目录>`。commit SHA 可以用 `git rev-parse HEAD` 取得；固定 commit 比 `main` 更可复现。

### 3. 进入公开市场

DSH 本身没有内置的官方市场；“发现（Discover）”读取的是你添加的插件市场索引 URL。目前较常用的社区市场之一是 dsh.so（第三方社区项目）：

1. 先在 **Plugins → More → Experimental plugins** 打开 **Custom plugin markets**；此后 Plugins 会出现 **Discover** 标签。
2. 在 Discover 的 **Index sources** 里添加 `https://cdn.dsh.so/market/index.json`，即可浏览、安装该索引里的插件。
3. 要让本插件进入这个索引：把上面的 Git 仓库公开，给仓库加上 GitHub topic `dsh-plugin`，然后到 [dsh.so 提交插件](https://www.dsh.so/zh/submit/) 粘贴仓库地址。它会自动拉取源码、检查 `dsh` 字段 / README / SPDX license / 安全扫描，生成市场条目并提交审核。审核合并后，另一台机器刷新索引就能看到并安装。
4. dsh.so 是第三方社区项目，不是 DeepSeek 官方市场；新插件通常先以 **Declared（声明兼容）** 收录，独立测试通过后才会标为 Verified。

> **2026-11-11 检查结果**：本插件以前确实被 dsh.so 收录过，展示名为 `@liusaipu/dsh-notes`（artifact slug `dsh-notes-7`，版本停在 `v1.1.0`）。但裸名 `dsh-notes` 已被多个其他仓库占用（`dsh-notes`、`dsh-notes-2` … `dsh-notes-8`），所以 dsh.so 给它加了 `-7` 后缀，裸名搜索很难找到。
>
> 从 1.3.0 起包名改为 **`dsh-quicknotes`**；1.3.1 起 GitHub 仓库也改名为 `dsh-quicknotes`。准备用这个唯一名字提交新的 dsh.so 条目；旧的 `@liusaipu/dsh-notes` 条目不再更新，请安装新的 `dsh-quicknotes`。

> 当前通过 Git / dsh.so 安装，不需要 npm。包名已经改为 `dsh-quicknotes`；注意 `dsh-notes`、`dsh-quick-notes`、`dsh-quicknote` 都已被其他项目使用，不要再使用这些名字投稿。

### 4. 自建一个市场索引（完全可控）

不想等审核，或想给自己的团队用，可以生成一份 format 1 索引：

```bash
node scripts/make-market-index.mjs \
  --repo https://github.com/liusaipu/dsh-quicknotes \
  --commit "$(git rev-parse HEAD)"
# 生成 market/index.json；把它提交并托管到 HTTPS（GitHub Pages / raw.githubusercontent.com 等）
```

然后在另一台机器的 Discover 里添加该 JSON 的 URL。生成器会打印对应的安装 spec；`--path` 用于仓库子目录，`--npm` 用于已发布到 npm 的版本。索引格式说明见 [dsh-plugin-market-index](https://github.com/deepseek-ai/deepseek-harness/tree/master/packages/util/plugin-market-index)。

## Markdown 与图片

笔记正文按 Markdown 渲染，支持：

- 标题（`#` 到 `######`）、段落、粗体、斜体、删除线、行内代码
- 有序/无序列表、任务列表（`- [ ]` / `- [x]`）、引用、代码块、分割线
- 链接、表格（GFM 风格）、图片
- `#标签` 仍然可以点击筛选

插入图片有三种方式：

1. **粘贴**：在输入框或编辑框里直接 `⌘/Ctrl + V` 粘贴剪贴板图片；
2. **选择文件**：点输入框工具栏的图片按钮，可多选；
3. **拖拽**：把图片拖到输入框或编辑框里。

图片在发送到 Host 前会在浏览器里尽量压缩为 WebP（大图最长边 1600px，目标 < 900KB；小图可能保留原格式），保存到 `$DSH_HOME/storages/flomo/notebooks/<笔记本 id>/images/`，笔记里使用 `![图片](dsh-image:<id>)` 引用。图片会随笔记修订一起写进邮箱邮件，因此另一台连接同一邮箱后也能看到。

限制：单张图片最大 1.5MB（解码后），单条笔记最多 6 张；不支持 SVG 直接上传（会转成 WebP）。图片会重复出现在每次修订邮件里，编辑带大图的笔记会增加邮箱占用。用 Markdown 直接写远程 `http(s)` 图片时只会由当前设备加载，不会写入邮箱；需要跨设备请用「插入图片」上传本地文件。

## 存储与安全

- 本地状态文件：`$DSH_HOME/storages/flomo/notebooks/<笔记本 id>/state.json`，权限 `0600`；图片在对应的 `images/` 目录，同样只在本机落盘。
- IMAP 密码：写入 DSH 的 Credential 服务（`DSH_FLOMO_IMAP_PASSWORD`），不会返回给页面，也不会写进笔记文件。
- 笔记正文和图片会进入你的邮箱；请使用可随时撤销的应用专用密码，不要使用主密码。
- 同步是追加式的，每修改一次会产生一封邮件。对个人笔记规模没有问题；邮箱容量和文件夹清理由你控制。
- **不要手动删除或移动同步文件夹里的邮件**：它们是其他电脑恢复笔记的来源。若要停用同步，请用插件里的「断开连接」，本地笔记会保留。

## 兼容与迁移

- 只面向 DSH Desktop 的 Web UI；不依赖移动端或独立网页。
- 首次启动时，如果存在旧插件 `notes-wall` 的 `storages/notes-wall.json`，会导入其中的笔记。
- 旧插件的数据文件不会被修改或删除。

## 开发与验证

- 零运行时依赖；IMAP 客户端在 `lib/imap.js` 中手写实现（TLS、LOGIN、LIST/CREATE/SELECT、UID SEARCH/FETCH、APPEND、LOGOUT）。
- 已在真实的 Ethereal IMAP 服务器上验证：连接、建文件夹、写入并读回验证邮件、两台设备双向同步、编辑传播、删除墓碑传播、重复同步幂等。
- 单元测试覆盖 MIME 编解码、邮箱地址/文件夹校验、last-write-wins 合并、持久化和旧数据导入。
