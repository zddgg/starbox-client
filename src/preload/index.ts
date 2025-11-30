import { contextBridge, ipcRenderer, shell, webUtils } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import fs from 'fs'
import os from 'os'
import path from 'path'
import yaml from 'yaml'
import fse from 'fs-extra'
import log from 'electron-log'

// 定义允许的IPC通道类型
type ValidSendChannel =
  | 'ping'
  | 'get-backend-port'
  | 'is-backend-ready'
  | 'agreement-accepted'
  | 'agreement-declined'
  | 'force-show-agreement'
type ValidReceiveChannel = 'agreement-accepted-confirmed' | 'force-show-agreement' | 'loading-progress'
type ValidInvokeChannel =
  | 'get-backend-port'
  | 'is-backend-ready'
  | 'select-file'
  | 'select-files'
  | 'select-folder'
  | 'select-folders'
  | 'save-file'
  | 'show-item-in-folder'

// 文件对话框选项类型
interface FileDialogOptions {
  title?: string
  defaultPath?: string
  filters?: Array<{
    name: string
    extensions: string[]
  }>
  properties?: string[]
}

// 自定义API通过contextBridge暴露给渲染进程
const api = {
  // 发送消息到主进程
  send: (channel: string, data?: unknown) => {
    // 白名单通道
    const validChannels: ValidSendChannel[] = [
      'ping',
      'get-backend-port',
      'is-backend-ready',
      'agreement-accepted',
      'agreement-declined',
      'force-show-agreement'
    ]
    if (validChannels.includes(channel as ValidSendChannel)) {
      ipcRenderer.send(channel, data)
    }
  },
  // 从主进程接收消息
  on: (channel: string, callback: (...args: unknown[]) => void) => {
    // 白名单通道
    const validChannels: ValidReceiveChannel[] = [
      'agreement-accepted-confirmed',
      'force-show-agreement',
      'loading-progress'
    ]
    if (validChannels.includes(channel as ValidReceiveChannel)) {
      // 监听事件
      ipcRenderer.on(channel, (_event, ...args) => callback(...args))
    }
  },
  // 发送同步消息并等待返回结果
  invoke: (channel: string, data?: unknown) => {
    const validChannels: ValidInvokeChannel[] = [
      'get-backend-port',
      'is-backend-ready',
      'select-file',
      'select-files',
      'select-folder',
      'select-folders',
      'save-file',
      'show-item-in-folder'
    ]
    if (validChannels.includes(channel as ValidInvokeChannel)) {
      return ipcRenderer.invoke(channel, data)
    }

    return Promise.reject(new Error(`Invalid channel: ${channel}`))
  },
  // 监听后端服务启动完成
  onBackendReady: (callback: () => void) => {
    ipcRenderer.on('backend-ready', callback)
  },
}

// 添加与后端服务通信相关的API
const electronAPI2 = {
  ...electronAPI,
  // 获取后端服务端口
  getBackendPort: async (): Promise<number | null> => {
    return ipcRenderer.invoke('get-backend-port')
  },
  // 检查后端服务是否准备好
  isBackendReady: async (): Promise<boolean> => {
    return ipcRenderer.invoke('is-backend-ready')
  },
  // 等待后端服务准备好
  waitForBackend: async (timeout = 30000): Promise<boolean> => {
    const startTime = Date.now()

    // 轮询检查后端是否准备好
    while (Date.now() - startTime < timeout) {
      try {
        const isReady = await ipcRenderer.invoke('is-backend-ready')
        if (isReady) {
          return true
        }
        // 等待100毫秒再次检查
        await new Promise((resolve) => setTimeout(resolve, 100))
      } catch (error) {
        console.error('Error checking backend status:', error)
        // 等待500毫秒再次尝试
        await new Promise((resolve) => setTimeout(resolve, 500))
      }
    }

    // 超时返回false
    return false
  },
  // 文件系统操作API
  fileSystem: {
    // 选择单个文件
    selectFile: async (options?: FileDialogOptions): Promise<string | null> => {
      return ipcRenderer.invoke('select-file', options)
    },

    // 选择多个文件
    selectFiles: async (options?: FileDialogOptions): Promise<string[] | null> => {
      return ipcRenderer.invoke('select-files', options)
    },

    // 选择单个文件夹
    selectFolder: async (options?: FileDialogOptions): Promise<string | null> => {
      return ipcRenderer.invoke('select-folder', options)
    },

    // 选择多个文件夹
    selectFolders: async (options?: FileDialogOptions): Promise<string[] | null> => {
      return ipcRenderer.invoke('select-folders', options)
    },

    // 保存文件
    saveFile: async (options?: FileDialogOptions): Promise<string | null> => {
      return ipcRenderer.invoke('save-file', options)
    },

    // 在文件管理器中显示文件（通过主进程实现，避免 macOS 上的挂起问题）
    showItemInFolder: async (path: string): Promise<{ success: boolean; error: string | null }> => {
      if (!path) {
        console.error('路径为空，无法打开文件位置')
        return { success: false, error: '文件路径为空' }
      }

      try {
        console.log(`请求主进程打开文件位置: ${path}`)
        return await ipcRenderer.invoke('show-item-in-folder', path)
      } catch (error) {
        console.error(`打开文件位置失败: ${error}`)
        return {
          success: false,
          error: error instanceof Error ? error.message : '未知错误'
        }
      }
    }
  },

  // Shell API
  shell: {
    // 打开外部 URL
    openExternal: (url: string): Promise<void> => {
      try {
        return shell.openExternal(url)
      } catch (error) {
        console.error(`打开外部链接失败: ${error}`)
        return Promise.reject(error)
      }
    }
  },

  // 添加新的方法用于获取文件路径
  getPathForFile: (file: File): string => {
    try {
      return webUtils.getPathForFile(file)
    } catch (error) {
      console.error('获取文件路径失败:', error)
      return ''
    }
  },

  // 在 electronAPI2 上添加 getDataBaseDir 方法
  getDataBaseDir: () => {
    try {
      const home = os.homedir()
      const configPath = path.join(home, '.starbox', 'config.yaml')
      const defaultBasePath = path.join(home, 'starbox')
      let basePath = defaultBasePath
      if (fs.existsSync(configPath)) {
        const content = fs.readFileSync(configPath, 'utf8')
        const config = yaml.parse(content)
        const customBasePath = config.DATA_BASE_DIR || defaultBasePath
        if (fs.existsSync(customBasePath)) {
          basePath = customBasePath
        }
      }
      return basePath
    } catch {
      return '读取失败'
    }
  },
  // 新增：写入 config.yaml
  setDataBaseDir: (dir: string): string | null => {
    try {
      const home = os.homedir()
      const configPath = path.join(home, '.starbox', 'config.yaml')
      let config = {}
      if (fs.existsSync(configPath)) {
        const content = fs.readFileSync(configPath, 'utf8')
        config = yaml.parse(content) || {}
      }
      // 拼接 starbox 子目录
      const finalDir = path.join(dir, 'starbox')

      // 获取旧的数据目录
      const oldBasePath = config['DATA_BASE_DIR'] || path.join(home, 'starbox')
      // 复制数据到新目录
      if (fs.existsSync(oldBasePath) && oldBasePath !== finalDir) {
        try {
          fse.copySync(oldBasePath, finalDir, { overwrite: true })
        } catch {
          // 复制失败也继续写入新路径
        }
      }

      config['DATA_BASE_DIR'] = finalDir
      fs.mkdirSync(path.dirname(configPath), { recursive: true })
      fs.writeFileSync(configPath, yaml.stringify(config), 'utf8')

      // 通知主进程重启后端服务
      ipcRenderer.invoke('restart-app')

      return finalDir
    } catch {
      return null
    }
  },
  checkForUpdate: () => ipcRenderer.invoke('check-for-update'),
  quitAndInstall: () => ipcRenderer.invoke('quit-and-install'),
  onUpdateAvailable: (callback: (info: unknown) => void) => ipcRenderer.on('update-available', (_event, info) => callback(info)),
  onUpdateNotAvailable: (callback: () => void) => ipcRenderer.on('update-not-available', callback),
  onDownloadProgress: (callback: (progress: unknown) => void) => ipcRenderer.on('download-progress', (_event, progress) => callback(progress)),
  onUpdateDownloaded: (callback: () => void) => ipcRenderer.on('update-downloaded', callback),
  onDownloadStarted: (callback: () => void) => ipcRenderer.on('update-download-started', callback),
  onDownloadError: (callback: (error: unknown) => void) => ipcRenderer.on('update-download-error', (_event, error) => callback(error)),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  onWindowFocus: (callback: () => void) => ipcRenderer.on('window-focused', () => callback()),
  restartBackendServer: () => ipcRenderer.invoke('restart-backend-server'),

  // 添加日志API
  log: {
    info: (...args: unknown[]) => {
      log.info(...args)
      console.info(...args) // 保留控制台输出
    },
    warn: (...args: unknown[]) => {
      log.warn(...args)
      console.warn(...args)
    },
    error: (...args: unknown[]) => {
      log.error(...args)
      console.error(...args)
    },
    debug: (...args: unknown[]) => {
      log.debug(...args)
      console.debug(...args)
    },
    verbose: (...args: unknown[]) => {
      log.verbose(...args)
      console.log(...args)
    },
    getLogFilePath: () => {
      return log.transports.file.getFile().path
    }
  },
}

// 使用contextBridge暴露Electron API和自定义API给渲染进程
// 此处应用了沙箱和上下文隔离
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI2)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore - 在上下文隔离禁用时需要定义window.electron
  window.electron = electronAPI2
  // @ts-ignore - 在上下文隔离禁用时需要定义window.api
  window.api = api
}
