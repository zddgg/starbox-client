# GitHub Actions Workflow 说明

本项目配置了自动化的 GitHub Actions 工作流，用于构建和发布多平台的 Electron 应用。

## 工作流文件

### 1. `build.yml` - 主构建和发布流程

**触发条件：**
- 推送到 `main` 或 `master` 分支
- 创建以 `v` 开头的标签（如 `v1.0.0`）
- 手动触发（workflow_dispatch）

**构建平台：**
- **macOS** (macos-latest)
  - 输出：`.dmg`, `.zip`, `.app`
- **Linux** (ubuntu-latest)
  - 输出：`.AppImage`, `.deb`, `.snap`
- **Windows** (windows-latest)
  - 输出：`.exe` (NSIS 安装包)

**构建步骤：**
1. 检出代码（包括子模块）
2. 设置 Node.js 20 和 pnpm 8
3. 设置 Python 3.11 环境
4. 安装 Python 依赖（从 `src/server/requirements.txt`）
5. 安装 Node.js 依赖
6. 构建 Python 后端服务（使用 PyInstaller）
7. 构建 Electron 前端
8. 复制 loading.html 文件
9. 打包应用程序
10. 上传构建产物

**发布流程：**
- 当推送标签（如 `v1.2.3`）时，自动创建 GitHub Release
- 将所有平台的构建产物附加到 Release

### 2. `pr-check.yml` - Pull Request 检查

**触发条件：**
- 创建或更新 Pull Request

**检查内容：**
- 代码格式检查（ESLint）
- TypeScript 类型检查
- 构建测试

## 使用方法

### 发布新版本

1. **更新版本号**
   ```bash
   # 在 package.json 中更新 version 字段
   # 例如：从 1.2.2 改为 1.2.3
   ```

2. **提交更改**
   ```bash
   git add package.json
   git commit -m "chore: bump version to 1.2.3"
   git push origin main
   ```

3. **创建标签并推送**
   ```bash
   git tag v1.2.3
   git push origin v1.2.3
   ```

4. **自动构建**
   - GitHub Actions 会自动开始构建所有平台
   - 构建完成后自动创建 Release
   - 所有平台的安装包会附加到 Release

### 手动触发构建

1. 访问 GitHub 仓库的 Actions 页面
2. 选择 "Build and Release" workflow
3. 点击 "Run workflow" 按钮
4. 选择分支并运行

### 查看构建产物

- **开发构建**：在 Actions 页面的 workflow 运行记录中下载 Artifacts
- **正式发布**：在 Releases 页面下载对应版本的安装包

## 环境变量和密钥

### 必需的 Secrets

- `GITHUB_TOKEN`：GitHub 自动提供，用于创建 Release

### 可选配置

如果需要代码签名或公证：

**macOS:**
```yaml
env:
  CSC_LINK: ${{ secrets.MAC_CERT_P12_BASE64 }}
  CSC_KEY_PASSWORD: ${{ secrets.MAC_CERT_PASSWORD }}
  APPLE_ID: ${{ secrets.APPLE_ID }}
  APPLE_APP_SPECIFIC_PASSWORD: ${{ secrets.APPLE_APP_PASSWORD }}
```

**Windows:**
```yaml
env:
  CSC_LINK: ${{ secrets.WIN_CERT_P12_BASE64 }}
  CSC_KEY_PASSWORD: ${{ secrets.WIN_CERT_PASSWORD }}
```

## 构建缓存

工作流使用以下缓存策略来加速构建：

- **pnpm store**：缓存 Node.js 依赖
- **pip cache**：缓存 Python 依赖

## 故障排查

### Python 构建失败

确保 `src/server/requirements.txt` 中的所有依赖都可以在 CI 环境中安装。某些依赖可能需要系统级库。

### Electron 打包失败

检查 `electron-builder.yml` 配置是否正确，特别是：
- `extraResources` 路径
- `asarUnpack` 配置
- 平台特定的配置

### 产物上传失败

确保 `dist` 目录中的文件路径与 workflow 中的 `path` 配置匹配。

## 本地测试

在推送到 GitHub 之前，可以本地测试构建：

```bash
# 构建 Python 后端
pnpm run build:server

# 构建前端
pnpm run build

# 打包应用（根据当前平台）
pnpm run build:app

# 或指定平台
pnpm run build:app:win
pnpm run build:app:mac
pnpm run build:app:linux
```

## 注意事项

1. **跨平台构建限制**：
   - macOS 应用只能在 macOS 上构建（需要 Xcode）
   - Windows 应用可以在任何平台构建
   - Linux 应用可以在 Linux 或 macOS 上构建

2. **构建时间**：
   - 完整的多平台构建通常需要 15-30 分钟
   - 可以通过缓存优化构建时间

3. **存储空间**：
   - Artifacts 默认保留 7 天
   - Release 产物永久保留

4. **Python 版本**：
   - 当前使用 Python 3.11
   - 如需更改，修改 workflow 中的 `python-version`
