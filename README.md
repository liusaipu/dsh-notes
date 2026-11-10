# 随手记 · Quick Memo

一个 flomo 风格的 DSH Desktop 插件：左侧栏入口、随手记录、标签、搜索、**Markdown 渲染**和**图片插入**，并可通过**自己的邮箱**在多台 DSH Desktop 之间同步。

![icon](./icon.svg)

仓库：<https://github.com/liusaipu/dsh-notes>

## 设计：为什么用邮箱同步

不依赖任何中转服务器，也不需要 DSH 账号提供云存储：

1. 每台电脑先写入本地 `$DSH_HOME/storages/flomo/state.json`，离线也能记。
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


## 桌面版（实验）

`desktop/` 是 Quick Memo 桌面版的第一个技术验证（Tauri 2 + Rust），当前只跑通 IMAP 登录、创建测试文件夹、写入一封带图片的笔记、读回并解析，还没有完整笔记界面和本地存储。

- 构建：`cd desktop && npm install && PATH="$HOME/.cargo/bin:$PATH" npm run tauri build`
- 产物：`desktop/src-tauri/target/release/bundle/`（macOS `.app` / `.dmg`）
- 说明见 [desktop/README.md](desktop/README.md)

## 关于

标题栏的 **i** 图标会打开「关于」：显示插件名称、包名、版本、开发者、更新日期、许可证，以及 GitHub 仓库和发布记录链接。版本与更新日期来自 `package.json`，不需要在界面里手动维护。

## 安装到另一台 DSH Desktop

这台机器上的安装是 profile 里的本地链接，不会自动出现在另一台机器。可以选下面任一种方式（要求 DSH Desktop ≥ 0.2.1-rc.5，对应 `package.json` 的 `engines.dsh`）：

### 0. 从 GitHub Release 安装（推荐给其他人）

公开 Release：<https://github.com/liusaipu/dsh-notes/releases/tag/v1.1.0>

- 直接下载 [dsh-notes-1.1.0.tgz](https://github.com/liusaipu/dsh-notes/releases/download/v1.1.0/dsh-notes-1.1.0.tgz)，然后 **Plugins → Add plugin → Install a third-party plugin** 填它的绝对路径；
- 或者把 Release 资源 URL 直接粘贴到同一个输入框：

```text
https://github.com/liusaipu/dsh-notes/releases/download/v1.1.0/dsh-notes-1.1.0.tgz
```

安装器支持 tarball URL 或本地 tarball 路径，不需要 npm 账号或 GitHub 账号。若网络访问 GitHub 受限，先下载 tarball 再传过去。

### 1. 拷贝安装包（最快，不需要 Git）

```bash
npm pack
# 得到 dsh-notes-1.1.0.tgz
```

把 tarball 用 AirDrop、网盘或 U 盘复制到另一台机器，然后：

**Plugins → Add plugin → Install a third-party plugin → 填 tarball 的绝对路径 → Install**。

### 2. 从 Git 仓库安装（可分享，不需要市场）

把本目录推到一个 Git 仓库（仓库名 `dsh-notes`）：

```bash
cd dsh-notes
git init -b main
git add .
git commit -m "dsh-notes 1.1.0"
git remote add origin https://github.com/liusaipu/dsh-notes.git
git push -u origin main
```

在另一台机器上，**Plugins → Add plugin → Install a third-party plugin** 填入：

```
git+https://github.com/liusaipu/dsh-notes.git#<40 位 commit SHA>
```

如果插件在仓库子目录，追加 `&path:/<子目录>`。commit SHA 可以用 `git rev-parse HEAD` 取得；固定 commit 比 `main` 更可复现。

### 3. 进入公开市场

DSH 本身没有内置的官方市场；“发现（Discover）”读取的是你添加的插件市场索引 URL。目前较常用的社区市场之一是 dsh.so（第三方社区项目）：

1. 先在 **Plugins → More → Experimental plugins** 打开 **Custom plugin markets**；此后 Plugins 会出现 **Discover** 标签。
2. 在 Discover 的 **Index sources** 里添加 `https://cdn.dsh.so/market/index.json`，即可浏览、安装该索引里的插件。
3. 要让本插件进入这个索引：把上面的 Git 仓库公开，给仓库加上 GitHub topic `dsh-plugin`，然后到 [dsh.so 提交插件](https://www.dsh.so/zh/submit/) 粘贴仓库地址。它会自动拉取源码、检查 `dsh` 字段 / README / SPDX license / 安全扫描，生成市场条目并提交审核。审核合并后，另一台机器刷新索引就能看到并安装。
4. dsh.so 是第三方社区项目，不是 DeepSeek 官方市场；新插件通常先以 **Declared（声明兼容）** 收录，独立测试通过后才会标为 Verified。

> 当前通过 Git / dsh.so 安装，不需要 npm。`dsh-notes` 这个名字在 npm 上已被他人占用；如果以后要发布到 **npm**，请改成 `dsh-flomo-notes` 这类你拥有的名字，并同步修改 `package.json`、`client.js` 的模块 id 和 `cordis.patch.yml` 的行名。自建索引脚本的 `--npm` 模式会拒绝 `dsh-notes`，避免生成指向别人包的条目。

### 4. 自建一个市场索引（完全可控）

不想等审核，或想给自己的团队用，可以生成一份 format 1 索引：

```bash
node scripts/make-market-index.mjs \
  --repo https://github.com/liusaipu/dsh-notes \
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

图片在发送到 Host 前会在浏览器里尽量压缩为 WebP（大图最长边 1600px，目标 < 900KB；小图可能保留原格式），保存到 `$DSH_HOME/storages/flomo/images/`，笔记里使用 `![图片](dsh-image:<id>)` 引用。图片会随笔记修订一起写进邮箱邮件，因此另一台连接同一邮箱后也能看到。

限制：单张图片最大 1.5MB（解码后），单条笔记最多 6 张；不支持 SVG 直接上传（会转成 WebP）。图片会重复出现在每次修订邮件里，编辑带大图的笔记会增加邮箱占用。用 Markdown 直接写远程 `http(s)` 图片时只会由当前设备加载，不会写入邮箱；需要跨设备请用「插入图片」上传本地文件。

## 存储与安全

- 本地状态文件：`$DSH_HOME/storages/flomo/state.json`，权限 `0600`；图片在 `$DSH_HOME/storages/flomo/images/`，同样只在本机落盘。
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
