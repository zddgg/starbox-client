import { app, shell, BrowserWindow, ipcMain, Tray, Menu } from 'electron'
import path, { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import log from 'electron-log'
import {
  selectFile,
  selectFiles,
  selectFolder,
  selectFolders,
  saveFile,
  showItemInFolder
} from './file-system'
import { serverManager } from './service-manager'
import { autoUpdater } from 'electron-updater'
import nativeImage = Electron.nativeImage

// 配置自动更新
autoUpdater.disableDifferentialDownload = true // 禁用差异化下载，避免404错误
autoUpdater.disableWebInstaller = true // 禁用Web安装器，消除警告信息

// 配置日志
log.transports.file.level = 'info'
// 限制单个日志文件大小为10MB
log.transports.file.maxSize = 10 * 1024 * 1024
// 启用日志轮转 (electron-log会自动归档旧日志)
log.info('应用启动')
log.info(`日志文件路径: ${log.transports.file.getFile().path}`)

// 保存原始的控制台方法
const originalConsole = {
  log: console.log,
  error: console.error,
  warn: console.warn,
  info: console.info,
  debug: console.debug
}

// 重定向控制台输出到日志文件
console.log = (...args) => {
  log.info(...args)
  originalConsole.log(...args)
}
console.error = (...args) => {
  log.error(...args)
  originalConsole.error(...args)
}
console.warn = (...args) => {
  log.warn(...args)
  originalConsole.warn(...args)
}
console.info = (...args) => {
  log.info(...args)
  originalConsole.info(...args)
}
console.debug = (...args) => {
  log.debug(...args)
  originalConsole.debug(...args)
}

// 导出log对象供其他模块使用
export { log }

// 添加全局变量来跟踪窗口
let mainWindow: BrowserWindow | null = null
let loadingWindow: BrowserWindow | null = null
let tray: Tray | null = null

const iconPath = path.join(__dirname, '../../resources/icon.png')
const trayIcon = nativeImage.createFromPath(iconPath)

// 添加isQuitting标志
const appState = {
  isQuitting: false,
  isQuittingProcessed: false
}

// 获取单实例锁
const gotTheLock = app.requestSingleInstanceLock()

// 如果获取锁失败，说明已有一个实例在运行，退出当前实例
if (!gotTheLock) {
  log.info('已有一个实例在运行，退出当前实例')
  app.quit()
} else {
  // 监听第二个实例启动的事件
  app.on('second-instance', () => {
    log.info('检测到第二个实例启动，显示已有窗口')
    // 如果存在主窗口，则恢复并聚焦它
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore()
      }
      if (!mainWindow.isVisible()) {
        mainWindow.show()
      }
      mainWindow.focus()
    }
  })
}

/**
 * 创建加载窗口
 */
function createLoadingWindow(): void {
  // 创建一个加载窗口
  loadingWindow = new BrowserWindow({
    width: 1024,
    height: 768,
    show: false,
    frame: false,
    resizable: false,
    center: true,
    transparent: false,
    backgroundColor: '#f5f5f5',
    skipTaskbar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  const loadingHtmlPath = is.dev
    ? join(process.cwd(), 'src/renderer/loading.html')
    : join(__dirname, '../renderer/loading.html')

  loadingWindow.loadFile(loadingHtmlPath)

  // 准备好后显示加载窗口
  loadingWindow.once('ready-to-show', () => {
    loadingWindow?.show()
  })
}

/**
 * 创建系统托盘图标
 */
function createTray(): void {
  tray = new Tray(trayIcon)

  const contextMenu = Menu.buildFromTemplate([
    { label: '显示主界面', click: () => mainWindow?.show() },
    { type: 'separator' },
    {
      label: '退出',
      click: async () => {
        // 使用appState.isQuittingProcessed标记避免重复处理
        if (appState.isQuittingProcessed) {
          return;
        }

        // 标记应用正在退出
        appState.isQuitting = true
        // 标记已处理退出清理
        appState.isQuittingProcessed = true

        log.info('托盘菜单触发退出: 正在关闭应用...')

        if (serverManager.isRunning()) {
          try {
            log.info('托盘菜单退出: 正在关闭后端服务...')
            await serverManager.stop()
          } catch (err) {
            log.error('托盘菜单退出: 关闭服务出错:', err)
            // 尝试强制清理
            await serverManager.cleanupOldProcesses()
          }
        }

        // 确保有足够时间让服务关闭后再退出应用
        setTimeout(() => app.quit(), 300)
      }
    }
  ])

  tray.setToolTip('StarBox')
  tray.setContextMenu(contextMenu)

  // 点击托盘图标显示主窗口
  tray.on('click', () => {
    if (mainWindow) {
      if (!mainWindow.isVisible()) {
        mainWindow.show()
      } else {
        mainWindow.focus()
      }
    }
  })
}

/**
 * 创建主窗口
 */
function createWindow(): void {
  // 创建浏览器窗口
  mainWindow = new BrowserWindow({
    width: 1280, // 初始宽度
    height: 768, // 初始高度
    minWidth: 1024, // 最小宽度
    minHeight: 768, // 最小高度
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      webSecurity: false,
      nodeIntegration: true,
      contextIsolation: false
    }
  })

  // Show developer tools
  if (is.dev) {
    mainWindow.webContents.openDevTools()
  }

  mainWindow.on('ready-to-show', () => {
    // 关闭加载窗口前先检查它是否还存在
    if (loadingWindow) {
      loadingWindow.close()
      loadingWindow = null
    }
    mainWindow?.show()
  })

  // 修改窗口关闭行为，关闭时隐藏到托盘
  mainWindow.on('close', (event) => {
    // 如果不是真正要退出应用，阻止默认行为
    if (!appState.isQuitting) {
      event.preventDefault()
      mainWindow?.hide()
      return false
    }
    return true
  })

  mainWindow.on('focus', () => {
    // 当窗口获得焦点时通知渲染进程
    if (mainWindow) {
      mainWindow.webContents.send('window-focused')
    }
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

/**
 * 检查后端服务是否准备就绪
 */
async function checkBackendReady(maxAttempts = 120, interval = 1000): Promise<boolean> {
  log.info('开始检查后端服务是否准备就绪...')

  // 如果后端服务没有运行，直接返回false
  if (!serverManager.isRunning()) {
    log.info('后端服务未运行')
    return false
  }

  // 尝试检查后端服务是否就绪
  for (let i = 0; i < maxAttempts; i++) {
    try {
      if (i % 10 === 0) {
        log.info(`第${i}次检查后端服务状态...`)
      }

      const isReady = await serverManager.isReady(2000)

      if (isReady) {
        log.info('后端服务已准备就绪')
        return true
      }
    } catch (error) {
      log.error(`检查服务就绪状态出错:`, error)
      // 忽略错误，继续尝试
    }

    // 显示检查进度
    if (loadingWindow && loadingWindow.webContents) {
      try {
        loadingWindow.webContents.send('loading-progress', {
          current: i,
          total: maxAttempts
        })

        if (i % 10 === 0) {
          log.info(`已发送进度更新: ${i}/${maxAttempts}`)
        }
      } catch (error) {
        log.error('发送进度更新失败:', error)
      }
    } else {
      log.info(`无法发送进度更新，loadingWindow不存在或已关闭`)
    }

    // 等待一段时间后再次尝试
    await new Promise((resolve) => setTimeout(resolve, interval))
  }

  log.warn('后端服务未在预期时间内准备就绪')
  return false
}

/**
 * 启动Python后端服务
 */
async function startBackendServer(): Promise<void> {
  try {
    // 启动后端服务
    await serverManager.start()

    // 等待后端服务就绪
    await checkBackendReady()

    // 将后端服务端口暴露给渲染进程
    if (mainWindow) {
      mainWindow.webContents.on('did-finish-load', () => {
        mainWindow?.webContents.send('backend-server-info', {
          port: serverManager.getPort(),
          isRunning: serverManager.isRunning()
        })
      })
    }
  } catch (error) {
    console.error('启动后端服务失败:', error)
  }
}

/**
 * Setup IPC handlers for communication with renderer
 */
function setupIPC(): void {
  // Simple ping-pong handler for testing
  ipcMain.on('ping', () => console.log('pong'))

  // 获取应用版本号
  ipcMain.handle('get-app-version', () => {
    return app.getVersion()
  })

  // 处理文件选择
  ipcMain.handle('select-file', async (_event, options = {}) => {
    if (!mainWindow) return null
    return await selectFile(mainWindow, options)
  })

  // 处理多文件选择
  ipcMain.handle('select-files', async (_event, options = {}) => {
    if (!mainWindow) return null
    return await selectFiles(mainWindow, options)
  })

  // 处理文件夹选择
  ipcMain.handle('select-folder', async (_event, options = {}) => {
    if (!mainWindow) return null
    return await selectFolder(mainWindow, options)
  })

  // 处理多文件夹选择
  ipcMain.handle('select-folders', async (_event, options = {}) => {
    if (!mainWindow) return null
    return await selectFolders(mainWindow, options)
  })

  // 处理文件保存
  ipcMain.handle('save-file', async (_event, options = {}) => {
    if (!mainWindow) return null
    return await saveFile(mainWindow, options)
  })

  // 处理在文件管理器中显示文件（从主进程调用以避免Finder挂起问题）
  ipcMain.handle('show-item-in-folder', async (_event, filePath) => {
    console.log(`主进程收到显示文件请求: ${filePath}`)
    if (!filePath) {
      console.error('显示文件请求失败: 路径为空')
      return { success: false, error: '文件路径为空' }
    }

    try {
      const success = await showItemInFolder(filePath)
      return { success, error: success ? null : '操作失败' }
    } catch (error) {
      console.error('显示文件请求处理错误:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : '未知错误'
      }
    }
  })

  // 添加后端服务相关的IPC处理
  ipcMain.handle('get-backend-info', () => {
    return {
      port: serverManager.getPort(),
      isRunning: serverManager.isRunning()
    }
  })

  // 重启后端服务
  ipcMain.handle('restart-backend-server', async () => {
    try {
      // 先停止再启动
      await serverManager.stop()

      // 稍微等待一下确保进程完全退出
      await new Promise((resolve) => setTimeout(resolve, 1000))

      // 启动服务
      await serverManager.start()

      return {
        success: true,
        port: serverManager.getPort(),
        isRunning: serverManager.isRunning()
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  })

  // 重启APP
  app.whenReady().then(() => {
    // 监听重启事件
    ipcMain.handle('restart-app', async () => {
      try {
        log.info('收到重启应用请求，正在关闭后端服务...')
        
        // 标记应用正在退出
        appState.isQuitting = true
        
        // 先停止后端服务
        if (serverManager.isRunning()) {
          await serverManager.stop()
          // 等待服务完全停止
          await new Promise((resolve) => setTimeout(resolve, 1000))
        }
        
        log.info('后端服务已关闭，准备重启应用...')
        
        // 重启应用（不需要特殊参数，因为正常启动流程会自动初始化）
        app.relaunch()
        app.exit(0)
      } catch (error) {
        log.error('重启应用时出错:', error)
        // 即使出错也尝试重启
        app.relaunch()
        app.exit(0)
      }
    })
  })

  // 自动更新相关
  ipcMain.handle('check-for-update', async () => {
    // 对所有平台都设置autoDownload为false，让用户自行决定是否下载
    autoUpdater.autoDownload = false
    autoUpdater.checkForUpdates()
  })

  // 添加手动下载更新的处理函数
  ipcMain.handle('download-update', async () => {
    try {
      // 不再调用checkForUpdates，而是直接下载最后一次检查到的更新
      if (mainWindow) {
        // 通知渲染进程下载开始
        mainWindow.webContents.send('update-download-started')
      }
      await autoUpdater.downloadUpdate()
      return { success: true }
    } catch (error) {
      if (mainWindow) {
        mainWindow.webContents.send('update-download-error', {
          message: error instanceof Error ? error.message : String(error)
        })
      }
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  })

  ipcMain.handle('quit-and-install', () => {
    autoUpdater.quitAndInstall()
  })
  autoUpdater.on('update-available', (info) => {
    if (mainWindow) mainWindow.webContents.send('update-available', info)
  })
  autoUpdater.on('update-not-available', () => {
    if (mainWindow) mainWindow.webContents.send('update-not-available')
  })
  autoUpdater.on('download-progress', (progressObj) => {
    if (mainWindow) mainWindow.webContents.send('download-progress', progressObj)
  })
  autoUpdater.on('update-downloaded', () => {
    if (mainWindow) mainWindow.webContents.send('update-downloaded')
  })
}

/**
 * 应用初始化函数
 */
async function initApp(): Promise<void> {
  // 先创建加载窗口
  createLoadingWindow()

  // 创建托盘
  createTray()

  // 设置IPC处理程序
  setupIPC()

  // 启动后端服务
  await startBackendServer()

  // 然后创建主窗口
  createWindow()
}

/**
 * 在应用退出时清理资源
 */
app.on('before-quit', async (event) => {
  // 如果已经标记为正在退出，则不重复处理
  if (appState.isQuittingProcessed) {
    return;
  }

  log.info('应用退出，正在关闭后端服务...')

  // 标记应用正在退出
  appState.isQuitting = true
  // 标记已处理退出清理
  appState.isQuittingProcessed = true

  // 确保后端服务正确关闭
  if (serverManager.isRunning()) {
    try {
      // 阻止应用退出，直到后端服务完全关闭
      event.preventDefault()

      // 尝试停止服务
      const stopped = await serverManager.stop()

      if (!stopped) {
        log.warn('无法正常关闭后端服务，可能需要手动清理进程')
      }

      // 退出应用，没有阻止事件
      setTimeout(() => app.quit(), 500)
    } catch (err) {
      log.error('关闭后端服务时出错:', err)
      // 仍然允许应用退出
      setTimeout(() => app.quit(), 500)
    }
  }
})

// 在app准备就绪时运行
app.whenReady().then(async () => {
  log.info('Electron应用已准备就绪')

  // 应用启动时清理可能存在的旧后端进程
  log.info('应用启动时清理可能存在的后端进程')

  // 先通过进程名称清理
  await serverManager.cleanupOldProcesses()

  // 再检查并清理服务端口
  await serverManager.cleanupServicePort()

  // 给清理过程一点时间
  await new Promise((resolve) => setTimeout(resolve, 500))

  // 设置应用菜单和其他配置
  electronApp.setAppUserModelId('com.wsudo.starbox')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // 初始化应用
  await initApp()

  app.on('activate', async function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    log.info('macOS激活应用')
    if (BrowserWindow.getAllWindows().length === 0) {
      await initApp()
    }
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  log.info('所有窗口已关闭')
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
