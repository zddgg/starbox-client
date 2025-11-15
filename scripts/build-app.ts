import { exec } from 'child_process'
import { promisify } from 'util'
import { buildPythonServer } from './build-server'
import * as fs from 'fs'
import * as path from 'path'

const execAsync = promisify(exec)

/**
 * 执行命令并打印输出
 * @param command 要执行的命令
 * @param description 描述信息
 */
async function runCommand(command: string, description: string): Promise<void> {
  console.log(`\n${description}...`)
  console.log(`执行命令: ${command}`)

  try {
    const { stdout, stderr } = await execAsync(command)
    if (stdout) console.log(stdout)
    if (stderr) console.error(stderr)
  } catch (error) {
    console.error(`执行命令失败: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  }
}

/**
 * 复制loading.html文件到dist/renderer目录
 */
function copyLoadingHtml(): void {
  try {
    const sourcePath = path.resolve(__dirname, '../src/renderer/loading.html')
    const targetDir = path.resolve(__dirname, '../out/renderer')
    const targetPath = path.resolve(targetDir, 'loading.html')

    // 确保目标目录存在
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true })
    }

    // 复制文件
    fs.copyFileSync(sourcePath, targetPath)
    console.log(`\n✅ 成功复制loading.html到 ${targetPath}`)
  } catch (error) {
    console.error(`复制loading.html失败: ${error instanceof Error ? error.message : String(error)}`)
    throw error
  }
}

/**
 * 构建完整应用程序（包括Python后端和Electron）
 * @param platform 目标平台: 'win' | 'mac' | 'linux' | undefined
 */
async function buildApp(platform?: string): Promise<void> {
  const originalDir = process.cwd() // 保存原始工作目录

  try {
    // 步骤1: 构建Python后端服务
    console.log('\n=== 步骤1: 构建Python后端服务 ===')
    await buildPythonServer()

    // 步骤2: 构建Electron应用
    console.log('\n=== 步骤2: 构建Electron应用 ===')

    // 先运行TypeScript检查和构建
    process.chdir(originalDir)
    await runCommand('electron-vite build', '构建Electron应用')

    // 步骤2.1: 复制loading.html到dist/renderer目录
    console.log('\n=== 步骤2.1: 复制loading.html文件 ===')
    copyLoadingHtml()

    // 步骤3: 使用electron-builder打包
    console.log('\n=== 步骤3: 打包应用 ===')

    process.chdir(originalDir)
    let buildCommand: string

    if (platform) {
      // 如果指定了平台，使用对应的打包命令
      switch (platform.toLowerCase()) {
        case 'win':
          buildCommand = 'electron-builder --win'
          break
        case 'mac':
          buildCommand = 'electron-builder --mac'
          break
        case 'linux':
          buildCommand = 'electron-builder --linux'
          break
        default:
          throw new Error(`不支持的平台: ${platform}`)
      }
    } else {
      // 如果没有指定平台，根据当前系统打包
      if (process.platform === 'win32') {
        buildCommand = 'electron-builder --win'
      } else if (process.platform === 'darwin') {
        buildCommand = 'electron-builder --mac'
      } else if (process.platform === 'linux') {
        buildCommand = 'electron-builder --linux'
      } else {
        throw new Error(`不支持的平台: ${process.platform}`)
      }
    }

    await runCommand(buildCommand, '打包应用程序')
    console.log('\n✅ 构建和打包过程完成!')
  } catch (error) {
    console.error(`构建过程中发生错误: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  }
}

// 如果直接执行此脚本
if (require.main === module) {
  // 获取命令行参数，如果有的话
  let platform = process.argv[2] // 可能是 'win', 'mac', 'linux' 或 undefined

  if (!platform) {
    platform = process.platform
    if (platform === 'win32') {
      platform = 'win'
    } else if (platform === 'darwin') {
      platform = 'mac'
    } else if (platform === 'linux') {
      platform = 'linux'
    }
  }

  console.log(`开始构建应用程序，目标平台: ${platform}`)

  if (!platform || !['win', 'mac', 'linux'].includes(platform)) {
    console.error('无效的平台参数')
    process.exit(1)
  }

  buildApp(platform).catch((error) => {
    console.error(error)
    process.exit(1)
  })
}

export { buildApp }
