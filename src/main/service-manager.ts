import { app, BrowserWindow } from 'electron'
import path from 'path'
import { ChildProcess, exec, spawn, SpawnOptions } from 'child_process'
import fs from 'fs'
import http from 'http'
import log from 'electron-log'
import { promisify } from 'util'
import net from 'net'

/**
 * 进程清理结果
 */
interface CleanupResult {
  success: boolean
  message: string
}

/**
 * Python后端服务管理器
 */
class ServerManager {
  private serverProcess: ChildProcess | null = null
  private port: number = 23450 // 默认端口
  private serverReady: boolean = false
  private maxKillAttempts: number = 3
  private execPromise = promisify(exec)

  /**
   * 解码子进程输出 Buffer（统一 UTF-8）
   */
  private decodeOutput(data: Buffer): string {
    // 既然 Python 已强制 UTF-8，Electron 就不需要根据平台切换
    try {
      return data.toString('utf8')
    } catch (error) {
      log.warn(`输出解码失败: ${error}`)
      return data.toString() // 最后兜底
    }
  }

  /**
   * 获取后端服务可执行文件路径
   */
  private getServerPath(): string {
    // 判断当前平台
    const platform = process.platform
    const exeName = platform === 'win32' ? 'starbox-server.exe' : 'starbox-server'

    // 开发环境和生产环境的路径不同
    let serverPath: string

    if (app.isPackaged) {
      // 生产环境 - 使用打包后的路径
      serverPath = path.join(process.resourcesPath, 'server', exeName)
    } else {
      // 开发环境 - 直接使用开发目录中的资源
      serverPath = path.join(app.getAppPath(), 'resources', 'server', exeName)
    }

    // 检查文件是否存在
    if (!fs.existsSync(serverPath)) {
      throw new Error(`后端服务可执行文件不存在: ${serverPath}`)
    }

    return serverPath
  }

  /**
   * 检查端口是否被占用
   */
  private async isPortInUse(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const tester = net
        .createServer()
        .once('error', () => {
          // 端口被占用
          resolve(true)
        })
        .once('listening', () => {
          // 端口未被占用
          tester.close()
          resolve(false)
        })
        .listen(port, '127.0.0.1')
    })
  }

  /**
   * 根据平台执行清理命令
   * @param type 清理类型（'name'：按名称清理, 'port'：按端口清理）
   * @param value 清理的值（进程名或端口号）
   * @returns 清理结果
   */
  private async executeCleanupCommand(
    type: 'name' | 'port',
    value: string | number
  ): Promise<CleanupResult> {
    try {
      let command = ''

      // 根据平台和清理类型构建命令
      if (process.platform === 'win32') {
        // Windows平台
        if (type === 'name') {
          command =
            'tasklist | findstr "starbox-server.exe" > NUL && taskkill /F /IM starbox-server.exe /T || exit /b 0'
        } else {
          const { stdout } = await this.execPromise(
            `netstat -ano | findstr :${value} | findstr LISTENING`
          )
          if (stdout.trim()) {
            const pidMatch = /\s+(\d+)$/.exec(stdout.trim())
            if (pidMatch && pidMatch[1]) {
              command = `taskkill /F /PID ${pidMatch[1]}`
            } else {
              return { success: false, message: '找不到占用端口的PID' }
            }
          } else {
            return { success: false, message: '没有进程占用该端口' }
          }
        }
      } else if (process.platform === 'darwin') {
        // macOS平台
        if (type === 'name') {
          command = 'pgrep -f starbox-server | xargs kill -9 || true'
        } else {
          const { stdout } = await this.execPromise(`lsof -i tcp:${value} | grep LISTEN`)
          if (stdout.trim()) {
            const pidMatch = /^\S+\s+(\d+)/.exec(stdout.trim())
            if (pidMatch && pidMatch[1]) {
              command = `kill -9 ${pidMatch[1]}`
            } else {
              return { success: false, message: '找不到占用端口的PID' }
            }
          } else {
            return { success: false, message: '没有进程占用该端口' }
          }
        }
      } else {
        // Linux平台
        if (type === 'name') {
          command = 'pkill -f starbox-server || true'
        } else {
          const { stdout } = await this.execPromise(`netstat -tuln | grep :${value}`)
          if (stdout.trim()) {
            const { stdout: pidOut } = await this.execPromise(`fuser -n tcp ${value}`)
            if (pidOut.trim()) {
              command = `kill -9 ${pidOut.trim()}`
            } else {
              return { success: false, message: '找不到占用端口的PID' }
            }
          } else {
            return { success: false, message: '没有进程占用该端口' }
          }
        }
      }

      // 如果有命令则执行
      if (command) {
        await this.execPromise(command)

        if (type === 'name') {
          log.info('已通过进程名清理后端服务')
        } else {
          log.info(`已终止占用端口 ${value} 的进程`)
        }

        return { success: true, message: '清理成功' }
      }

      return { success: false, message: '无需清理或没有找到目标进程' }
    } catch (error) {
      const errorMsg = `${type === 'name' ? '按名称' : '按端口'} 清理进程失败: ${error instanceof Error ? error.message : String(error)}`
      log.warn(errorMsg)
      return { success: false, message: errorMsg }
    }
  }

  /**
   * 尝试清理可能占用端口的旧进程（按进程名查找并终止）
   */
  public async cleanupOldProcesses(): Promise<CleanupResult> {
    return await this.executeCleanupCommand('name', 'starbox-server')
  }

  /**
   * 查找并终止占用指定端口的进程
   */
  private async killProcessOnPort(port: number): Promise<boolean> {
    const result = await this.executeCleanupCommand('port', port)
    return result.success
  }

  /**
   * 检查进程是否存在
   * @param pid 进程ID
   * @returns 进程是否存在
   */
  private async isProcessRunning(pid: number): Promise<boolean> {
    if (!pid) return false

    try {
      process.kill(pid, 0) // 发送信号0测试进程是否存在
      return true
    } catch {
      return false
    }
  }

  /**
   * 检查并清理服务端口
   * 在应用启动时调用，确保没有进程占用服务端口
   */
  public async cleanupServicePort(): Promise<void> {
    try {
      log.info(`检查端口 ${this.port} 是否被占用`)
      const portInUse = await this.isPortInUse(this.port)

      if (portInUse) {
        log.warn(`端口 ${this.port} 被占用，尝试终止占用进程`)

        // 首先尝试按端口终止进程
        const killedByPort = await this.killProcessOnPort(this.port)
        if (killedByPort) {
          log.info(`已终止占用端口 ${this.port} 的进程`)
        } else {
          // 如果按端口终止失败，尝试按进程名清理
          log.warn(`无法按端口终止进程，尝试按进程名清理`)
          await this.cleanupOldProcesses()
        }

        // 再次检查端口
        const stillInUse = await this.isPortInUse(this.port)
        if (stillInUse) {
          log.warn(`清理后端口 ${this.port} 仍被占用`)
        } else {
          log.info(`端口 ${this.port} 已释放`)
        }
      } else {
        log.info(`端口 ${this.port} 未被占用`)
      }
    } catch (error) {
      log.error(`清理服务端口时出错: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * 启动后端服务
   * @param port 可选端口号
   */
  public async start(port?: number): Promise<void> {
    if (this.serverProcess) {
      log.info('后端服务已经在运行中')
      return
    }

    if (port) {
      this.port = port
    }

    try {
      await this.prepareForStart()
      await this.spawnServerProcess()
    } catch (error) {
      log.error(`启动后端服务时出错: ${error instanceof Error ? error.message : String(error)}`)
      this.serverReady = false
    }
  }

  /**
   * 启动前的准备工作：检查端口，清理进程
   */
  private async prepareForStart(): Promise<void> {
    // 检查端口是否被占用
    const portInUse = await this.isPortInUse(this.port)
    if (portInUse) {
      log.warn(`端口 ${this.port} 被占用，尝试释放`)

      // 首先尝试按端口终止进程
      const killedByPort = await this.killProcessOnPort(this.port)

      // 如果按端口终止失败，尝试按进程名清理
      if (!killedByPort) {
        await this.cleanupOldProcesses()
      }

      // 再次检查端口
      const stillInUse = await this.isPortInUse(this.port)
      if (stillInUse) {
        // 端口仍然被占用，尝试使用另一个端口
        this.port += 1
        log.warn(`端口仍被占用，切换到端口 ${this.port}`)
      } else {
        log.info(`已释放端口 ${this.port}`)
      }
    }
  }

  /**
   * 启动服务进程
   */
  private async spawnServerProcess(): Promise<void> {
    const serverPath = this.getServerPath()
    log.info(`启动后端服务: ${serverPath}，端口: ${this.port}`)

    // 使用spawn启动后端服务，设置适当的编码
    const spawnOptions: SpawnOptions = {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      env: {
        ...process.env,
        ENV: 'client'  // 设置环境变量ENV=client
      }
    }

    // 如果是Windows平台，设置环境变量以确保Python输出正确编码
    if (process.platform === 'win32') {
      spawnOptions.env = {
        ...spawnOptions.env,
        PYTHONIOENCODING: 'utf-8'  // 强制Python使用UTF-8输出
      }
    }

    this.serverProcess = spawn(
      serverPath,
      ['--port', this.port.toString(), '--env', 'client'],
      spawnOptions
    )

    // 处理后端服务的输出
    this.setupProcessListeners()

    log.info(`后端服务已启动，端口: ${this.port}`)
  }

  /**
   * 设置进程监听器
   */
  private setupProcessListeners(): void {
    if (!this.serverProcess) return

    // 处理标准输出
    this.serverProcess.stdout?.on('data', (data: Buffer) => {
      // 使用正确的编码解析输出
      const output = this.decodeOutput(data)
      log.info(`后端服务输出: ${output}`)

      // 检查启动完成的标志
      if (output.includes('Backend server is ready')) {
        this.serverReady = true
      }
    })

    // 处理标准错误
    this.serverProcess.stderr?.on('data', (data: Buffer) => {
      // 使用正确的编码解析输出
      const output = this.decodeOutput(data)

      // 判断日志级别，INFO和DEBUG日志作为普通信息处理，其他作为错误处理
      if (output.includes(' INFO ') || output.includes('INFO:') || output.includes('DEBUG:')) {
        log.info(`后端服务日志: ${output}`)

        // 检查启动完成的标志
        if (output.includes('Backend server is ready')) {
          this.serverReady = true
          // 通知前端
          const wins = BrowserWindow.getAllWindows()
          if (wins.length > 0) {
            wins[0].webContents.send('backend-ready')
          }
        }
      } else {
        log.error(`后端服务错误: ${output}`)
      }
    })

    // 处理后端服务的退出 - 改进的处理方式
    this.serverProcess.once('exit', (code, signal) => {
      log.info(`后端服务已退出，退出码: ${code}，信号: ${signal}`)

      // 确保清理状态
      this.resetServerState()

      // 如果是异常退出（非信号SIGTERM或SIGKILL），记录警告
      if (code !== 0 && signal !== 'SIGTERM' && signal !== 'SIGKILL') {
        log.warn(`后端服务异常退出，可能需要进一步处理，退出码: ${code}, 信号: ${signal}`)
      }
    })

    // 处理后端服务启动错误
    this.serverProcess.once('error', (error) => {
      log.error(`后端服务启动失败: ${error.message}`)
      this.resetServerState()
    })
  }

  /**
   * 检查后端服务是否准备就绪
   */
  public async isReady(timeout = 1000): Promise<boolean> {
    // 如果已知服务就绪，直接返回true
    if (this.serverReady) {
      return true
    }

    // 如果服务进程不存在，肯定没有就绪
    if (!this.serverProcess) {
      return false
    }

    // 尝试连接服务健康检查端点
    try {
      return await new Promise<boolean>((resolve) => {
        const req = http.get(`http://localhost:${this.port}/health`, (res) => {
          if (res.statusCode === 200) {
            // 收到200响应，服务就绪
            this.serverReady = true
            resolve(true)
          } else {
            resolve(false)
          }
        })

        req.on('error', () => {
          resolve(false)
        })

        req.setTimeout(timeout, () => {
          req.destroy()
          resolve(false)
        })
      })
    } catch {
      return false
    }
  }

  /**
   * 关闭后端服务，并进行多次尝试确保成功
   */
  public async stop(): Promise<boolean> {
    if (!this.serverProcess) {
      return true
    }

    log.info('正在关闭后端服务...')

    // 保存进程ID，因为可能在过程中将serverProcess设为null
    const pid = this.serverProcess.pid

    if (!pid) {
      log.warn('后端服务进程ID不可用')
      this.resetServerState()
      return false
    }

    return await this.attemptToStopProcess(pid)
  }

  /**
   * 多次尝试终止进程
   */
  private async attemptToStopProcess(pid: number): Promise<boolean> {
    for (let attempt = 1; attempt <= this.maxKillAttempts; attempt++) {
      try {
        log.info(`尝试关闭后端服务 (尝试 ${attempt}/${this.maxKillAttempts})`)

        if (process.platform === 'win32') {
          // Windows下需要使用taskkill强制关闭进程
          spawn('taskkill', ['/pid', pid.toString(), '/f', '/t'])
        } else {
          // 在Unix系统上，先尝试使用SIGTERM优雅关闭
          if (attempt === 1 && this.serverProcess) {
            this.serverProcess.kill('SIGTERM')
          } else if (this.serverProcess) {
            // 后续尝试使用SIGKILL强制终止
            this.serverProcess.kill('SIGKILL')
          }
        }

        // 等待一小段时间确认进程是否退出
        await new Promise((resolve) => setTimeout(resolve, 500))

        // 检查进程是否还存在
        const processExists = await this.isProcessRunning(pid)

        if (!processExists) {
          this.resetServerState()
          log.info('后端服务已成功关闭')
          return true
        }
      } catch (error) {
        log.error(
          `关闭后端服务时出错 (尝试 ${attempt}/${this.maxKillAttempts}): ${error instanceof Error ? error.message : String(error)}`
        )
      }
    }

    // 所有尝试都失败了，最后尝试按名称清理进程
    return await this.finalCleanupAttempt()
  }

  /**
   * 最后的清理尝试
   */
  private async finalCleanupAttempt(): Promise<boolean> {
    log.warn('常规方法无法关闭后端服务，尝试清理所有相关进程')
    try {
      const result = await this.cleanupOldProcesses()
      this.resetServerState()

      if (result.success) {
        log.info('已成功清理所有后端服务进程')
      } else {
        log.warn(`清理进程部分失败: ${result.message}`)
      }

      return true
    } catch (error) {
      log.error(
        `无法强制清理后端服务进程: ${error instanceof Error ? error.message : String(error)}`
      )
      this.resetServerState()
      return false
    }
  }

  /**
   * 重置服务状态
   */
  private resetServerState(): void {
    this.serverProcess = null
    this.serverReady = false
  }

  /**
   * 获取后端服务端口
   */
  public getPort(): number {
    return this.port
  }

  /**
   * 检查后端服务是否正在运行
   * 改进版本会验证进程是否真正存在
   */
  public isRunning(): boolean {
    // 首先检查我们是否有进程引用
    if (!this.serverProcess || !this.serverProcess.pid) {
      return false;
    }

    // 对于非Windows平台，我们可以通过信号0进一步验证进程是否存在
    if (process.platform !== 'win32') {
      try {
        process.kill(this.serverProcess.pid, 0);
        return true; // 进程存在
      } catch {
        // 进程不存在，更新状态
        this.resetServerState();
        return false;
      }
    }

    // 对于Windows或其他情况，依赖我们的内部状态
    return true;
  }
}

// 导出单例
export const serverManager = new ServerManager()
