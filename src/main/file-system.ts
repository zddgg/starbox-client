import { dialog, BrowserWindow, shell } from 'electron'
import { app } from 'electron'
import path from 'path'

/**
 * 选择单个文件
 *
 * @param {Electron.BrowserWindow} window - 当前窗口实例
 * @param {object} options - 选项配置
 * @returns {Promise<string|null>} 选中的文件路径，如果用户取消则返回null
 */
export async function selectFile(
  window: BrowserWindow,
  options: {
    title?: string
    defaultPath?: string
    filters?: Electron.FileFilter[]
    properties?: Array<
      | 'openFile'
      | 'multiSelections'
      | 'showHiddenFiles'
      | 'createDirectory'
      | 'promptToCreate'
      | 'noResolveAliases'
      | 'treatPackageAsDirectory'
      | 'dontAddToRecent'
    >
  } = {}
): Promise<{ filePath: string; fileName: string } | null> {
  // 设置默认选项
  const defaultOptions = {
    title: '选择文件',
    properties: ['openFile'] as const,
    filters: [{ name: '所有文件', extensions: ['*'] }]
  }

  // 合并选项
  const dialogOptions = {
    ...defaultOptions,
    ...options,
    properties: [...(options.properties || defaultOptions.properties)]
  }

  try {
    const { canceled, filePaths } = await dialog.showOpenDialog(window, dialogOptions)

    if (canceled || filePaths.length === 0) {
      return null
    }

    // 返回选中的文件路径
    const filePath = filePaths[0]
    const fileName = path.basename(filePath)

    return {
      filePath: filePath,
      fileName: fileName
    }
  } catch (error) {
    console.error('选择文件时出错:', error)
    return null
  }
}

/**
 * 选择多个文件
 *
 * @param {Electron.BrowserWindow} window - 当前窗口实例
 * @param {object} options - 选项配置
 * @returns {Promise<string[]|null>} 选中的文件路径数组，如果用户取消则返回null
 */
export async function selectFiles(
  window: BrowserWindow,
  options: {
    title?: string
    defaultPath?: string
    filters?: Electron.FileFilter[]
    properties?: Array<
      | 'openFile'
      | 'multiSelections'
      | 'showHiddenFiles'
      | 'createDirectory'
      | 'promptToCreate'
      | 'noResolveAliases'
      | 'treatPackageAsDirectory'
      | 'dontAddToRecent'
    >
  } = {}
): Promise<{ filePath: string; fileName: string }[] | null> {
  // 设置默认选项
  const defaultOptions = {
    title: '选择文件',
    properties: ['openFile', 'multiSelections'] as const,
    filters: [{ name: '所有文件', extensions: ['*'] }]
  }

  // 合并选项
  const dialogOptions = {
    ...defaultOptions,
    ...options,
    properties: [...(options.properties || defaultOptions.properties)]
  }

  // 确保多选属性
  if (!dialogOptions.properties.includes('multiSelections')) {
    dialogOptions.properties.push('multiSelections')
  }

  try {
    const { canceled, filePaths } = await dialog.showOpenDialog(window, dialogOptions)

    if (canceled || filePaths.length === 0) {
      return null
    }

    // 返回选中的文件路径数组
    return filePaths.map((filePath) => {
      const fileName = path.basename(filePath)
      return {
        filePath: filePath,
        fileName: fileName,
      }
    })
  } catch (error) {
    console.error('选择多个文件时出错:', error)
    return null
  }
}

/**
 * 选择文件夹
 *
 * @param {Electron.BrowserWindow} window - 当前窗口实例
 * @param {object} options - 选项配置
 * @returns {Promise<string|null>} 选中的文件夹路径，如果用户取消则返回null
 */
export async function selectFolder(
  window: BrowserWindow,
  options: {
    title?: string
    defaultPath?: string
    properties?: Array<
      | 'openDirectory'
      | 'multiSelections'
      | 'showHiddenFiles'
      | 'createDirectory'
      | 'promptToCreate'
      | 'noResolveAliases'
      | 'treatPackageAsDirectory'
      | 'dontAddToRecent'
    >
  } = {}
): Promise<string | null> {
  // 设置默认选项
  const defaultOptions = {
    title: '选择文件夹',
    properties: ['openDirectory'] as const
  }

  // 合并选项
  const dialogOptions = {
    ...defaultOptions,
    ...options,
    properties: [...(options.properties || defaultOptions.properties)]
  }

  try {
    const { canceled, filePaths } = await dialog.showOpenDialog(window, dialogOptions)

    if (canceled || filePaths.length === 0) {
      return null
    }

    // 返回选中的文件夹路径
    return filePaths[0]
  } catch (error) {
    console.error('选择文件夹时出错:', error)
    return null
  }
}

/**
 * 选择多个文件夹
 *
 * @param {Electron.BrowserWindow} window - 当前窗口实例
 * @param {object} options - 选项配置
 * @returns {Promise<string[]|null>} 选中的文件夹路径数组，如果用户取消则返回null
 */
export async function selectFolders(
  window: BrowserWindow,
  options: {
    title?: string
    defaultPath?: string
    properties?: Array<
      | 'openDirectory'
      | 'multiSelections'
      | 'showHiddenFiles'
      | 'createDirectory'
      | 'promptToCreate'
      | 'noResolveAliases'
      | 'treatPackageAsDirectory'
      | 'dontAddToRecent'
    >
  } = {}
): Promise<string[] | null> {
  // 设置默认选项
  const defaultOptions = {
    title: '选择文件夹',
    properties: ['openDirectory', 'multiSelections'] as const
  }

  // 合并选项
  const dialogOptions = {
    ...defaultOptions,
    ...options,
    properties: [...(options.properties || defaultOptions.properties)]
  }

  // 确保多选属性
  if (!dialogOptions.properties.includes('multiSelections')) {
    dialogOptions.properties.push('multiSelections')
  }

  try {
    const { canceled, filePaths } = await dialog.showOpenDialog(window, dialogOptions)

    if (canceled || filePaths.length === 0) {
      return null
    }

    // 返回选中的文件夹路径数组
    return filePaths
  } catch (error) {
    console.error('选择多个文件夹时出错:', error)
    return null
  }
}

/**
 * 保存文件对话框
 *
 * @param {Electron.BrowserWindow} window - 当前窗口实例
 * @param {object} options - 选项配置
 * @returns {Promise<string|null>} 保存文件的路径，如果用户取消则返回null
 */
export async function saveFile(
  window: BrowserWindow,
  options: {
    title?: string
    defaultPath?: string
    filters?: Electron.FileFilter[]
    properties?: Array<
      | 'showHiddenFiles'
      | 'createDirectory'
      | 'treatPackageAsDirectory'
      | 'showOverwriteConfirmation'
      | 'dontAddToRecent'
    >
  } = {}
): Promise<string | null> {
  // 设置默认选项
  const defaultOptions = {
    title: '保存文件',
    filters: [{ name: '所有文件', extensions: ['*'] }]
  }

  // 合并选项
  const dialogOptions = {
    ...defaultOptions,
    ...options
  }

  try {
    const { canceled, filePath } = await dialog.showSaveDialog(window, dialogOptions)

    if (canceled || !filePath) {
      return null
    }

    // 返回保存文件的路径
    return filePath
  } catch (error) {
    console.error('保存文件时出错:', error)
    return null
  }
}

/**
 * 在文件管理器中显示文件位置
 *
 * 注意：该方法应在主进程中调用，避免在渲染进程中直接使用shell.showItemInFolder
 * 这是因为在某些平台(特别是macOS)上，从渲染进程调用此方法可能会导致Finder挂起
 *
 * @param {string} filePath - 文件的完整路径
 * @returns {Promise<boolean>} 操作是否成功
 */
export async function showItemInFolder(filePath: string): Promise<boolean> {
  if (!filePath) {
    console.error('showItemInFolder: 文件路径为空')
    return false
  }

  try {
    console.log(`主进程: 尝试在文件管理器中显示文件: ${filePath}`)

    // 处理路径格式
    let processedPath = filePath

    // 在macOS上处理特殊路径格式
    if (process.platform === 'darwin') {
      if (filePath.startsWith('~')) {
        const homePath = app.getPath('home')
        processedPath = filePath.replace('~', homePath)
      }
    }

    // 在主进程中调用shell.showItemInFolder
    shell.showItemInFolder(processedPath)
    console.log(`主进程: 已调用showItemInFolder: ${processedPath}`)
    return true
  } catch (error) {
    console.error(`主进程: 在文件管理器中显示文件失败:`, error)
    return false
  }
}
