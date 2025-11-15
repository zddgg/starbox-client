# Embedded Python Server 构建说明

## 概述

Embedded 版本是一个独立的 Python 服务器，内嵌了完整的 Web UI，可以不依赖 Electron 客户端独立运行。

## 构建流程

### 自动构建（GitHub Actions）

当推送 tag 时，GitHub Actions 会自动构建两种版本：

1. **Electron 客户端**：完整的桌面应用
2. **Embedded Python 服务器**：独立的服务器程序（包含 Web UI）

### Embedded 构建步骤

1. **构建 Web UI (embedded 模式)**
   ```bash
   cd src/renderer
   pnpm run build:embedded
   ```

2. **复制到服务器静态目录**
   ```bash
   mkdir -p src/server/static
   cp -r src/renderer/dist/* src/server/static/
   ```

3. **构建 Python 服务器**
   ```bash
   pnpm run build:server
   ```

4. **重命名输出文件**（包含版本号）
   - Windows: `starbox-embedded-windows-v{version}.exe`
   - macOS: `starbox-embedded-macos-v{version}`
   - Linux: `starbox-embedded-linux-v{version}`

## 本地构建

### 完整流程

```bash
# 1. 安装依赖
pnpm install

# 2. 构建 embedded web UI
cd src/renderer
pnpm run build:embedded
cd ../..

# 3. 复制到服务器
mkdir -p src/server/static
cp -r src/renderer/dist/* src/server/static/

# 4. 构建 Python 服务器
pnpm run build:server

# 5. 重命名（可选）
cd src/server/dist
VERSION=$(node -p "require('../../package.json').version")
# macOS/Linux
mv starbox-server starbox-embedded-$(uname -s | tr '[:upper:]' '[:lower:]')-v${VERSION}
# Windows (PowerShell)
# $VERSION = (Get-Content ../../package.json | ConvertFrom-Json).version
# mv starbox-server.exe starbox-embedded-windows-v${VERSION}.exe
```

## 使用方法

### 运行 Embedded 完整版

```bash
# macOS/Linux
chmod +x starbox-embedded-*-v*
./starbox-embedded-*-v*

# Windows
starbox-embedded-windows-v*.exe
```

服务器启动后，访问 `http://localhost:8000` 即可使用 Web UI。

## 区别说明

### Electron 客户端 vs Embedded 完整版

| 特性 | Electron 客户端 | Embedded 完整版 |
|------|----------------|-----------------|
| 界面 | 原生桌面应用 | Web 浏览器访问 |
| 安装 | 需要安装 | 单个可执行文件 |
| 资源占用 | 较高（包含 Chromium） | 较低 |
| 适用场景 | 桌面用户 | 服务器部署、轻量使用 |
| Web UI | 内置 | 内置 |
| Python 后端 | 内置 | 内置 |

## 配置差异

### embedded 模式配置

在 `src/renderer` 中，`build:embedded` 使用 `--mode embedded` 构建，可能包含：

- 不同的 API 端点配置
- 不同的路由模式（hash vs history）
- 优化的资源加载策略

确保在 `src/renderer/.env.embedded` 中配置正确的环境变量。

## 故障排查

### Web UI 未正确嵌入

检查 `src/server/static` 目录是否包含构建产物：
```bash
ls -la src/server/static/
```

应该包含：
- `index.html`
- `assets/` 目录
- 其他静态资源

### 服务器启动失败

1. 检查端口是否被占用
2. 检查 Python 依赖是否完整
3. 查看服务器日志

### 构建失败

1. 确保 Node.js 和 Python 环境正确
2. 检查 pnpm 依赖是否安装完整
3. 查看构建日志中的错误信息

## 发布

当推送 tag 时，GitHub Actions 会自动：

1. 构建所有平台的 Electron 桌面客户端
2. 构建所有平台的 Embedded 完整版
3. 创建 GitHub Release
4. 上传所有构建产物

用户可以根据需求下载对应的版本：
- **Electron 客户端**：适合桌面用户，提供原生应用体验
- **Embedded 完整版**：适合服务器部署或轻量使用，单文件即可运行
