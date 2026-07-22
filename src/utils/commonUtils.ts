import { spawn, exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { PortInfo } from '../constants';

/** 启动过程中被主动 stop 取消时，startTomcat 抛出的哨兵错误信息（供 start() 区分「主动停止」与「意外退出」） */
export const TOMCAT_START_ABORTED = 'TOMCAT_START_ABORTED';

export class CommonUtils {
  /** 标记「启动过程中被主动 stop 取消」；close 处理据此避免把主动停止误报为启动失败 */
  private static _startAborted = false;

  /** 由 stop() 在杀进程前调用：标记当前启动是被主动取消的 */
  static markStartAborted(): void {
    CommonUtils._startAborted = true;
  }

  /** 读取并清除「被主动取消」标记（消费一次）；供 startTomcat 的 close 与 start() 的 resolve 共用 */
  static consumeStartAborted(): boolean {
    const v = CommonUtils._startAborted;
    CommonUtils._startAborted = false;
    return v;
  }

  static async isPortInUse(port: number): Promise<PortInfo> {
    return new Promise<PortInfo>((resolve) => {
      const cmd = `powershell -Command "Get-NetTCPConnection -LocalPort ${port} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess"`;
      exec(cmd, { timeout: 5000 }, (error: Error | null, stdout: string | Buffer) => {
        if (error || !stdout) {
          resolve({ inUse: false, pid: null });
          return;
        }
        const output = stdout.toString().trim();
        if (output === '') {
          resolve({ inUse: false, pid: null });
          return;
        }
        const pid = parseInt(output, 10);
        if (isNaN(pid)) {
          resolve({ inUse: false, pid: null });
          return;
        }
        resolve({ inUse: true, pid });
      });
    });
  }

  static getJavaHome(): string | undefined {
    const javaConfig = vscode.workspace.getConfiguration('java');

    // 1. 优先从 java.configuration.runtimes 中取 default=true 的路径
    const runtimes = javaConfig.get<{ name: string; path: string; default?: boolean }[]>('configuration.runtimes');
    if (runtimes && Array.isArray(runtimes)) {
      const defaultRuntime = runtimes.find(r => r.default === true);
      if (defaultRuntime && defaultRuntime.path && defaultRuntime.path.trim()) {
        return defaultRuntime.path.trim();
      }
      // 没有 default=true 的条目，取第一个有 path 的
      const firstRuntime = runtimes.find(r => r.path && r.path.trim());
      if (firstRuntime) {
        return firstRuntime.path.trim(); 
      }
    }

    // 2. 回退到 java.jdt.ls.java.home
    const jdtHome = javaConfig.get<string>('jdt.ls.java.home');
    if (jdtHome && jdtHome.trim()) {
      return jdtHome.trim();
    }


    // 3. 回退到系统环境变量
    const sysJavaHome = process.env.JAVA_HOME;
    if (sysJavaHome && sysJavaHome.trim()) {
      return sysJavaHome.trim();
    }

    const sysJreHome = process.env.JRE_HOME;
    if (sysJreHome && sysJreHome.trim()) {
      return sysJreHome.trim(); 
    }

    return undefined;
  }

  /**
   * 通过 PowerShell 调用 `mvn dependency:copy-dependencies`，把工程依赖复制到
   * target/{finalName}/WEB-INF/lib 下（-DcleanOutputDirectory=true 会先清空该目录）。
   * - 复用扩展选定的 JDK
   * - mvn 输出实时流到 ch
   * - 类似 runMavenBuild：成功 resolve()，失败 reject(Error)
   */
  static runMavenJar(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const javaHome = CommonUtils.getJavaHome();
      const psEnv: Record<string, string> = { ...(process.env as Record<string, string>) };
      if (javaHome) {
        psEnv.JAVA_HOME = javaHome;
      }

      // 先取 finalName，确定依赖要落到的目录（finalName 下的 WEB-INF/lib）
      CommonUtils.getMavenFinalName()
        .then((finalName) => {
          const outputDir = path.join(CommonUtils.getWorkSpace(), 'target', finalName, 'WEB-INF', 'lib');
          const psCommand = `& mvn dependency:copy-dependencies -DcleanOutputDirectory=true "-DoutputDirectory=${outputDir}"`;
          const proc = spawn('powershell', ['-NoProfile', '-Command', psCommand], {
            cwd: CommonUtils.getWorkSpace(),
            env: psEnv,
            windowsHide: true,
          });

          proc.on('error', (err: Error) => reject(err));
          proc.on('close', (code: number | null) => {
            if (code === 0) {
              resolve();
            } else {
              reject(new Error('Maven 复制依赖失败'));
            }
          });
        })
        .catch((err) => reject(err));
    });
  }

  /**
   * 通过 PowerShell 执行 Maven 构建
   * - mvn 输出实时流到 ch
   */
  static runMavenBuild(ch: vscode.OutputChannel): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      // 复用扩展选定的 JDK
      const javaHome = CommonUtils.getJavaHome();
      const psEnv: Record<string, string> = { ...(process.env as Record<string, string>) };
      if (javaHome) {
        psEnv.JAVA_HOME = javaHome;
      }

      const psCommand = '& mvn package -DskipTests -T 1C';
      const proc = spawn('powershell', ['-NoProfile', '-Command', psCommand], {
        cwd: CommonUtils.getWorkSpace(),
        env: psEnv,
        windowsHide: true,
      });

      proc.stdout?.on('data', (d: Buffer) => ch?.append(d.toString()));
      proc.stderr?.on('data', (d: Buffer) => ch?.append(d.toString()));

      proc.on('error', (err: Error) => reject(err));
      proc.on('close', (code: number | null) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error('Maven 构建失败'));
        }
      });
    });
  }

  /**
   * 通过 PowerShell 调用 `mvn help:evaluate` 获取工程的 finalName。
   * 复用扩展选定的 JDK；projectRoot 缺省时取第一个工作区目录。
   */
  static getMavenFinalName(): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      // 复用扩展选定的 JDK
      const javaHome = CommonUtils.getJavaHome();
      const psEnv: Record<string, string> = { ...(process.env as Record<string, string>) };
      if (javaHome) {
        psEnv.JAVA_HOME = javaHome;
      }

      const cwd = CommonUtils.getWorkSpace();
      const psCommand = "& mvn help:evaluate '-Dexpression=project.build.finalName' -q -DforceStdout";
      const proc = spawn('powershell', ['-NoProfile', '-Command', psCommand], {
        cwd,
        env: psEnv,
        windowsHide: true,
      });

      let stdout = '';
      let stderr = '';
      proc.stdout?.on('data', (d: Buffer) => { stdout += d.toString(); });
      proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });

      proc.on('error', (err: Error) => reject(err));
      proc.on('close', (code: number | null) => {
        if (code !== 0) {
          reject(new Error(`获取 Maven finalName 失败（退出码 ${code}）：${stderr.trim()}`));
          return;
        }
        const finalName = stdout.trim();
        if (!finalName) {
          reject(new Error('获取 Maven finalName 失败：mvn help:evaluate 无输出'));
          return;
        }
        resolve(finalName);
      });
    });
  }

  /**
   * 使用 PowerShell 启动 Tomcat（catalina.bat jpda run）。
   * - 将传入的 env 合并进进程环境后启动
   * - stdout/stderr 实时输出到 ch（输出通道），同时各自累积到独立缓冲区用于部署判定
   * - 启动成功的判定为「本 webapp 已部署完成」：
   *   日志出现部署完成行：包含本上下文描述符文件名（{contextPath}.xml / ROOT.xml）
   *   且带耗时（毫秒 / ms）——可区分「正在部署」与「部署完成」。
   *   注意：catalina/HostConfig 的部署完成日志经 java.util.logging.ConsoleHandler
   *         写 System.err，因此 stdout + stderr 都会判定。
   * - 带超时保护：超过 timeoutMs 仍未完成则判定失败并清理进程，避免永久挂起
   */
  static startTomcat(
    env: Record<string, string>,
    ch: vscode.OutputChannel,
    httpPort: number,
    contextPath: string = '',
    timeoutMs: number = 300000
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const home = env.CATALINA_HOME;
      if (!home) {
        reject(new Error('启动 Tomcat 失败：env 缺少 CATALINA_HOME'));
        return;
      }
      // 每次新启动都先清除「被主动取消」标记，避免上一次 stop 的标记污染本次
      CommonUtils._startAborted = false;
      const binDir = path.join(home, 'bin');

      // 合并环境变量：process.env 在前，传入的 env 覆盖同名项
      const psEnv: Record<string, string> = {
        ...(process.env as Record<string, string>),
        ...env,
      };

      const proc = spawn(
        'powershell',
        ['-NoProfile', '-Command', `& '${binDir}\\catalina.bat' jpda run`],
        { cwd: binDir, env: psEnv, windowsHide: true }
      );

      const ctxBase = CommonUtils.ctxBaseName(contextPath); // 描述符文件名主体，如 pub / ROOT

      let settled = false;
      let timer: ReturnType<typeof setInterval> | undefined;
      let serverUp = false; // 服务器就绪门槛：连接器端口已监听
      const startTime = Date.now();

      const finish = (fn: () => void) => {
        if (settled) return;
        settled = true;
        if (timer) { clearInterval(timer); timer = undefined; }
        fn();
      };

      // 累积 stdout/stderr，用于检测启动完成 / 部署完成日志。
      // catalina/HostConfig 的部署日志经 java.util.logging.ConsoleHandler 输出，
      // 该 Handler 默认写 System.err，因此 stderr 也必须参与检测。
      let stdoutBuf = '';
      let stderrBuf = '';
      const STARTUP_RE = /Server startup in|服务器启动/i;

      // 实时把启动日志输出到通道，同时缓冲用于启动判定
      proc.stdout?.on('data', (d: Buffer) => {
        const s = d.toString();
        ch.append(s);
        stdoutBuf += s;
        if (settled) { return; }
        // 启动完成日志
        if (STARTUP_RE.test(s)) { serverUp = true; }
        // 本 webapp 部署完成日志：带描述符文件名 + 耗时（毫秒/ms）
        if (CommonUtils.isDeployFinished(stdoutBuf, ctxBase)) {
          serverUp = true;
          finish(() => resolve());
        }
      });
      proc.stderr?.on('data', (d: Buffer) => {
        const s = d.toString();
        ch.append(s);
        stderrBuf += s;
        if (settled) { return; }
        // HostConfig 部署日志走 stderr（java.util.logging.ConsoleHandler → System.err）
        if (CommonUtils.isDeployFinished(stderrBuf, ctxBase)) {
          serverUp = true;
          finish(() => resolve());
        }
      });

      // 轮询：仅做超时保护与「服务器就绪」门槛检测；成功判定完全依赖部署完成日志
      timer = setInterval(async () => {
        if (settled) { return; }

        // 超时保护：超过 timeoutMs 仍未完成部署，判定启动失败并清理进程
        if (Date.now() - startTime > timeoutMs) {
          proc.kill();
          void CommonUtils.killProcess(env.CATALINA_BASE);
          finish(() => reject(new Error(
            `Tomcat 启动超时（${timeoutMs}ms 内未完成 webapp 部署）：` +
            `端口 ${httpPort} 监听=${serverUp}，上下文=${ctxBase}`
          )));
          return;
        }

        // 服务器就绪门槛：端口被监听即视为连接器已起（仅用于超时诊断）
        if (!serverUp) {
          try {
            const res = await CommonUtils.isPortInUse(httpPort);
            if (res.inUse) { serverUp = true; }
          } catch {
            // 端口检测异常，继续轮询
          }
        }
      }, 1000);

      proc.on('error', (err) => {
        finish(() => reject(err));
      });
      proc.on('close', (code) => {
        if (settled) { return; }
        // 启动过程中被主动 stop：视为「取消」而非「启动失败」，抛出哨兵错误供 start() 识别
        if (CommonUtils.consumeStartAborted()) {
          finish(() => reject(new Error(TOMCAT_START_ABORTED)));
          return;
        }
        // 否则进程在判定成功前意外退出，视为启动失败
        finish(() => reject(new Error(`Tomcat 进程已退出，退出码 ${code}`)));
      });
  });
  }

  /**
   * 将 contextPath 转换为部署描述符文件名主体。
   * - 空 / "/" 视为根应用，Tomcat 约定为 ROOT
   * - 否则去掉前导斜杠，如 "pub" / "/pub" -> "pub"
   */
  private static ctxBaseName(contextPath: string): string {
    if (!contextPath || contextPath === '/') { return 'ROOT'; }
    return contextPath.replace(/^\/+/, '').replace(/\/+$/, '');
  }

  /**
   * 判定 Tomcat 是否已完成「本 webapp」的部署。
   * 部署完成日志会在**同一行**内带上描述符文件名（如 pub.xml / ROOT.xml）和耗时；
   * 「正在部署」的启动日志只有文件名不含耗时。
   * 必须同一行内同时命中 marker 与耗时 —— 否则跨行分别命中是误判
   * （某行有文件名，另一行碰巧含 ms 如时间戳 / 25ms 等）。
   */
  private static isDeployFinished(buf: string, ctxBase: string): boolean {
    // 转义 . 等正则特殊字符，确保 marker 作为字面量匹配
    const escaped = `${ctxBase}.xml`.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // .*? 默认不跨行（JS 中 . 不匹配 \n），自然限定在同一行内
    const re = new RegExp(`${escaped}.*?(毫秒|milliseconds|\\bms\\b)`, 'i');
    return re.test(buf);
  }

  /**
   * 通过 PowerShell 杀掉所有属于本 Tomcat 实例的 java 进程。
   * 用 CATALINA_BASE 路径（含唯一 workspace 标识）在命令行中定位，避免误杀其它 java 进程。
   * @param catalinaBase 本实例的 CATALINA_BASE 路径（来自启动时的 env）
   */
  static async killProcess(catalinaBase: string): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const marker = CommonUtils.escapeWqlLike(catalinaBase);
      const filter = `name LIKE 'java%' AND commandLine LIKE '%${marker}%'`;
      const psScript = `Get-WmiObject -Class Win32_Process -Filter "${filter}" | % { Stop-Process -Id $_.ProcessId -Force }`;
      const proc = spawn('powershell', ['-NoProfile', '-Command', psScript], { windowsHide: true });
      proc.on('error', () => resolve(false));
      proc.on('close', (code) => resolve(code === 0));
    });
  }

  static getWorkSpace(): string {
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath!;
  }

  /**
   * 转义 WQL LIKE 通配符，避免 CATALINA_BASE 路径中的特殊字符破坏查询。
   * 关键点：WQL 的 LIKE 以反斜杠 \ 作为自身的转义字符，路径里的 \ 必须转义为 \\，
   * 否则整条查询会被判定为「无效查询」（Get-WmiObject 抛异常、killProcess 返回 false、
   * 而 stop() 不看返回值 → 误报「已停止」、Tomcat 实际未被关闭）。
   * 另外 % 与 _ 为通配符，[ 为字符集起始，单引号需双写。
   */
  private static escapeWqlLike(s: string): string {
    return s
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "''")
      .replace(/\[/g, '[[]')
      .replace(/%/g, '[%]')
      .replace(/_/g, '[_]');
  }

}