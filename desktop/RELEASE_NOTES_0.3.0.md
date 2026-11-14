# Quick Memo 0.3.0 + DSH 插件 1.3.2

Windows / macOS 桌面端，和稳定版 DSH 插件一起发布。

## 下载

| 文件 | 用途 |
| --- | --- |
| [`Quick.Memo_0.3.0_aarch64.dmg`](https://github.com/liusaipu/dsh-quicknotes/releases/download/desktop-v0.3.0/Quick.Memo_0.3.0_aarch64.dmg) | macOS arm64，未签名 |
| [`quick-memo-windows-portable.zip`](https://github.com/liusaipu/dsh-quicknotes/releases/download/desktop-v0.3.0/quick-memo-windows-portable.zip) | Windows x64，解压即用 |
| [`Quick.Memo_0.3.0_x64-setup.exe`](https://github.com/liusaipu/dsh-quicknotes/releases/download/desktop-v0.3.0/Quick.Memo_0.3.0_x64-setup.exe) / [`.msi`](https://github.com/liusaipu/dsh-quicknotes/releases/download/desktop-v0.3.0/Quick.Memo_0.3.0_x64_en-US.msi) | Windows 安装版 |
| [`dsh-quicknotes-1.3.2.tgz`](https://github.com/liusaipu/dsh-quicknotes/releases/download/desktop-v0.3.0/dsh-quicknotes-1.3.2.tgz) | DSH 插件稳定版 |
| [`SHA256SUMS.txt`](https://github.com/liusaipu/dsh-quicknotes/releases/download/desktop-v0.3.0/SHA256SUMS.txt) | 校验 |

## 更新内容

- 多笔记本：tab 切换/新建/重命名/删除，每个笔记本独立笔记和邮箱；
- 标签：`#标签` 提示、顶部筛选、每条笔记的标签 chip；
- 本地笔记、Markdown、编辑/删除；
- 与 DSH 插件共用 IMAP 同步协议，支持文本、删除墓碑和图片 payload；
- 0.2.0 单笔记本数据自动迁移为 `default` 笔记本；
- macOS / Windows 原生 Tauri 2 客户端。

## 验证

7 个 Rust 单测、真实 Ethereal 双 Store 同步、macOS 实机启动/迁移、Windows CI 启动/迁移均通过。Windows 完整 UI 交互和 IMAP 仍需在实机验证。

## 注意

这是 **Pre-release**：桌面安装包未签名、未公证。桌面端暂不显示/新增图片，也没有自动同步、提醒和搜索；这些请继续使用 DSH 插件。完整说明见 [desktop/README.md](https://github.com/liusaipu/dsh-quicknotes/blob/main/desktop/README.md)，插件安装见 [v1.3.2](https://github.com/liusaipu/dsh-quicknotes/releases/tag/v1.3.2)。
