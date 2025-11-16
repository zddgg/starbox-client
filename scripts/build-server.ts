import { exec } from 'child_process'
import * as path from 'path'
import * as fs from 'fs'
import { promisify } from 'util'

const execAsync = promisify(exec)

// 获取平台信息
const platform = process.platform

/**
 * 构建Python后端服务
 * @param showConsole 是否显示控制台窗口（仅Windows）
 * @returns {Promise<string>} 打包后的可执行文件路径
 */
export async function buildPythonServer(showConsole: boolean = false): Promise<string> {
  console.log('开始构建Python后端服务...')

  // 服务端脚本路径
  const serverDir = path.join(__dirname, '../src/server')
  const buildScriptPath = path.join(serverDir, 'scripts/build.py')

  try {
    // 确保Python脚本存在
    if (!fs.existsSync(buildScriptPath)) {
      throw new Error(`构建脚本不存在: ${buildScriptPath}`)
    }

    // 执行Python打包脚本
    console.log(`执行脚本: ${buildScriptPath}`)

    // 切换到server目录执行打包
    process.chdir(serverDir)

    // 根据不同平台执行不同的命令
    let buildCommand: string
    const consoleFlag = showConsole ? ' --console' : ''

    if (platform === 'win32') {
      buildCommand = `python scripts/build.py${consoleFlag}`
    } else if (platform === 'darwin' || platform === 'linux') {
      buildCommand = `python3 scripts/build.py${consoleFlag}`
    } else {
      throw new Error(`不支持的平台: ${platform}`)
    }

    console.log(`执行命令: ${buildCommand}`)
    const { stdout, stderr } = await execAsync(buildCommand)

    if (stdout) console.log(stdout)
    if (stderr) console.error(stderr)

    // 获取打包后的可执行文件
    const distDir = path.join(serverDir, 'dist')
    const exeName = platform === 'win32' ? 'starbox-server.exe' : 'starbox-server'
    const exePath = path.join(distDir, exeName)

    if (!fs.existsSync(exePath)) {
      throw new Error(`打包后的可执行文件不存在: ${exePath}`)
    }

    // 创建存放后端服务的目录
    const resourcesDir = path.join(__dirname, '../resources/server')
    if (!fs.existsSync(resourcesDir)) {
      fs.mkdirSync(resourcesDir, { recursive: true })
    }

    // 复制可执行文件到resources目录
    const targetPath = path.join(resourcesDir, exeName)
    fs.copyFileSync(exePath, targetPath)

    console.log(`后端服务已打包并复制到: ${targetPath}`)
    return targetPath
  } catch (error) {
    console.error(
      `构建Python后端服务失败: ${error instanceof Error ? error.message : String(error)}`
    )
    process.exit(1)
  }
}

// 如果直接执行此脚本，则运行构建
if (require.main === module) {
  // 解析命令行参数
  const showConsole = process.argv.includes('--console')
  
  buildPythonServer(showConsole).catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
