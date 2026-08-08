# Codex Switch

Codex Switch 是一个面向 Windows 的 Codex 中转站配置管理工具。它将中转站地址、多个 API Key、备注、额度状态和 Codex 本地配置切换集中在一个轻量桌面应用中，帮助开发者在不同线路与价格方案之间快速、安全地切换。

## 核心能力

- **配置库**：保存多个官方或中转站配置，自动识别供应商、主机和图标。
- **多 API Key 管理**：同一中转站支持保存多个 API Key，为每个 Key 添加价格、并发、用途等备注，并在卡片内快速展开、切换和应用。
- **安全切换**：切换前自动备份 Codex 配置；API Key 在主进程中加密保存，渲染层只接收脱敏预览。
- **连接测试**：通过中转站模型接口测试连通性，并记录测试状态、耗时和错误信息。
- **额度同步**：支持中转站余额/额度与官方 Codex 使用窗口同步；可连接支持网页登录态的中转站。
- **动态续航**：按经济或质量策略，从可用配置中自动选择更合适的中转站。
- **备份恢复**：查看、恢复和清理历史 Codex 配置备份。
- **本地更新**：支持生成本地更新通道、检查新版本并通过安装器静默更新。

## 界面说明

配置卡片中的 API Key 区域提供两个快捷按钮：

- `+`：打开添加 API Key 弹窗，输入 Key 和备注；
- 下拉按钮：以悬浮菜单显示同一中转站的所有 Key，点击“应用配置”即可切换；
- 每个 Key 显示脱敏预览、备注和当前使用状态。

下拉菜单采用悬浮层设计，不会撑开卡片布局；敏感 Key 不会被写入前端状态或日志。

## 环境要求

- Windows 10/11
- Node.js 20+（建议使用当前 LTS）
- npm 10+
- 已安装 Codex CLI 或 Codex 桌面端（如需实际切换 Codex 配置）

## 开发

```bash
npm install
npm run dev
```

开发模式会启动 Electron 和本地 Vite 渲染服务。若没有可用的 preload API，渲染层会自动使用 mock 数据，便于开发和界面验收。

## 验证与构建

```bash
# 类型检查并构建 Electron 主进程、preload 和 renderer
npm run build

# 运行测试
npm test

# 生成目录版应用
npm run pack

# 生成 NSIS 安装器
npm run dist:installer

# 生成便携版
npm run dist:portable

# 构建并静默更新本机安装
npm run dist:install
```

安装产物默认输出到 `release/`。该目录已加入 `.gitignore`，不会进入 Git 提交。

## 数据与安全

应用数据默认保存在 Windows 用户应用数据目录下的 `Codex Switch` 文件夹中，包含：

- `profiles.json`：配置元数据、Key 脱敏信息和加密后的 Key；
- `backups/`：切换前创建的 Codex 配置备份；
- Codex 本地目录：通常为 `%USERPROFILE%\\.codex`，由应用运行环境决定。

API Key 优先使用 Electron `safeStorage` 加密；在系统不支持时才使用受限的 base64 兼容存储。应用不会在 README、日志、渲染层或 Git 仓库中写入 API Key 明文。提交代码前请确认没有将 `.env`、个人配置、日志或安装产物加入暂存区。

## 项目结构

```text
src/
├─ main/       Electron 主进程、配置读写、备份、更新和 Codex 集成
├─ preload/    安全暴露给 renderer 的 IPC API
├─ renderer/   React 界面、卡片、弹窗和交互逻辑
└─ shared/     主进程与 renderer 共用的 TypeScript 类型
tests/         Codex 状态、重启脚本和 stdio 防护测试
scripts/       本地更新、发布清理和安装前进程管理脚本
```

## 技术栈

- Electron
- React 19
- TypeScript
- Vite / electron-vite
- Lucide Icons 与 Phosphor Icons
- Node.js 内置文件系统、加密和进程能力

## 贡献与提交

提交前请至少执行：

```bash
npm test
npm run build
git diff --check
```

请使用清晰、可回滚的细粒度提交，避免提交密钥、个人配置、构建产物和 `node_modules`。

## 许可

当前仓库未声明开源许可证。除非项目维护者另行授权，请不要将其作为可再分发的软件包使用。
