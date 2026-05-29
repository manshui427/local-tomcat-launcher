import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import { TomcatConfig, TomcatInstance, TomcatStatus, BUNDLED_TOMCAT_DIR } from '../constants';
import { ConfigUtils } from '../utils/configUtils';
import { FileUtils } from '../utils/fileUtils';
import { PortUtils } from '../utils/portUtils';
import { ProcessUtils } from '../utils/processUtils';
import { OutputChannelManager } from '../ui/outputChannel';
import { StatusBarManager } from '../ui/statusBar';
import { MavenService } from './mavenService';

export class TomcatService {
  private context: vscode.ExtensionContext;
  private outputChannel: OutputChannelManager;
  private statusBar: StatusBarManager;
  private mavenService: MavenService;
  private instance: TomcatInstance | null = null;
  private tomcatProcess: ReturnType<typeof spawn> | null = null;
  private logWatchers: fs.FSWatcher[] = [];

  constructor(context: vscode.ExtensionContext, outputChannel: OutputChannelManager, statusBar: StatusBarManager) {
    this.context = context;
    this.outputChannel = outputChannel;
    this.statusBar = statusBar;
    this.mavenService = new MavenService(outputChannel);
  }

  async start(forceRelease: boolean = false, forceRecompile: boolean = false): Promise<TomcatInstance> {
    const workspacePath = this.getWorkspacePath();
    if (!workspacePath) { throw new Error('未找到有效的workspace'); }
    if (this.instance && this.instance.status === TomcatStatus.RUNNING) {
      this.outputChannel.appendLine('Tomcat已在运行，先停止后再启动');
      await this.stop();
      // stop后端口可能未立即释放，后续用forceRelease模式
      forceRelease = true;
    }

    this.statusBar.updateStatus(TomcatStatus.COMPILING);
    this.outputChannel.appendLine('=== 启动Tomcat ===');

    const config = ConfigUtils.getTomcatConfig(workspacePath);
    const v = ConfigUtils.validateConfig(config);
    if (!v.valid) {
      this.statusBar.updateStatus(TomcatStatus.ERROR);
      vscode.window.showErrorMessage(`配置校验失败: ${v.errors.join('; ')}`);
      throw new Error('配置校验失败');
    }

    // 端口检测
    const portInUse = await PortUtils.isPortInUse(config.port);
    if (portInUse.inUse) {
      if (forceRelease) { await PortUtils.killPortProcess(config.port); await this.waitForPortFree(config.port); }
      else { this.statusBar.updateStatus(TomcatStatus.ERROR); throw new Error(`端口${config.port}被占用`); }
    }
    const dbgInUse = await PortUtils.isPortInUse(config.debugPort);
    if (dbgInUse.inUse) {
      if (forceRelease) { await PortUtils.killPortProcess(config.debugPort); await this.waitForPortFree(config.debugPort); }
      else { this.statusBar.updateStatus(TomcatStatus.ERROR); throw new Error(`Debug端口${config.debugPort}被占用`); }
    }

    // CATALINA_HOME (Tomcat安装路径)
    const tomcatHome = await this.resolveTomcatHome(config.home);
    // CATALINA_BASE (插件存储路径/{contextPath})
    const catalinaBase = this.setupCatalinaBase(tomcatHome, config);

    // 查找Maven输出目录
    this.outputChannel.appendLine('=== 准备部署文件 ===');
    let docBase = '';
    const targetDir = path.join(workspacePath, 'target');
    // 重启时强制重编译：删除target目录
    if (forceRecompile && fs.existsSync(targetDir)) {
      this.outputChannel.appendLine('=== 重启：清除target目录，重新编译 ===');
      fs.rmSync(targetDir, { recursive: true, force: true });
    }
    if (fs.existsSync(targetDir)) {
      docBase = this.mavenService.findExplodedWarPath(workspacePath);
    }
    if (!docBase) {
      this.outputChannel.appendLine('=== 开始Maven全量编译 ===');
      const compileResult = await this.mavenService.compile(workspacePath);
      if (!compileResult.success || !compileResult.deployPath) {
        this.statusBar.updateStatus(TomcatStatus.ERROR);
        throw new Error('Maven编译失败');
      }
      docBase = compileResult.deployPath;
    }
    // 创建context.xml让Tomcat识别docBase
    this.writeContextXml(catalinaBase, config.contextPath, docBase);

    this.instance = {
      workspacePath, processId: null, childProcessId: null,
      status: TomcatStatus.STARTING, port: config.port, debugPort: config.debugPort,
      contextPath: config.contextPath, tomcatHome, catalinaBase,
      vmOptions: config.vmOptions, deployDir: docBase,
      compileOutputDir: docBase, startTime: null,
    };

    this.statusBar.updateStatus(TomcatStatus.STARTING);
    this.outputChannel.appendLine('=== 开始启动Tomcat ===');
    await this.startTomcatProcess(catalinaBase, tomcatHome, config);
    this.watchTomcatLogs(catalinaBase);

    this.instance.status = TomcatStatus.RUNNING;
    this.instance.startTime = new Date();
    this.statusBar.updateStatus(TomcatStatus.RUNNING);
    return this.instance;
  }

  async stop(): Promise<void> {
    if (!this.instance || this.instance.status === TomcatStatus.IDLE) {
      vscode.window.showWarningMessage('Tomcat未在运行'); return;
    }
    this.outputChannel.appendLine('=== 停止Tomcat ===');
    if (this.instance.childProcessId) { await ProcessUtils.killProcessTree(this.instance.childProcessId); }
    if (this.instance.processId && this.instance.processId !== this.instance.childProcessId) {
      await ProcessUtils.killProcess(this.instance.processId);
    }
    if (this.tomcatProcess) { this.tomcatProcess.kill(); this.tomcatProcess = null; }
    this.clearLogWatchers();
    this.instance.processId = null; this.instance.childProcessId = null; this.instance.startTime = null;
    this.instance.status = TomcatStatus.IDLE;
    this.statusBar.updateStatus(TomcatStatus.IDLE);
    this.outputChannel.appendLine('=== Tomcat已停止 ===');
  }

  async restart(): Promise<TomcatInstance> {
    this.outputChannel.appendLine('=== 重启Tomcat ===');
    const port = this.instance?.port ?? 0;
    const dbgPort = this.instance?.debugPort ?? 0;
    const base = this.instance?.catalinaBase ?? '';
    const cpid = this.instance?.childProcessId ?? null;
    const ppid = this.instance?.processId ?? null;

    if (cpid) { await ProcessUtils.killProcessTree(cpid); }
    if (ppid && ppid !== cpid) { await ProcessUtils.killProcess(ppid); }
    if (this.tomcatProcess) { this.tomcatProcess.kill(); this.tomcatProcess = null; }
    this.clearLogWatchers();
    if (port) { await PortUtils.killPortProcess(port); await this.waitForPortFree(port); }
    if (dbgPort) { await PortUtils.killPortProcess(dbgPort); await this.waitForPortFree(dbgPort); }
    if (base && fs.existsSync(base)) { FileUtils.cleanDir(base); }
    this.instance = null;
    this.statusBar.updateStatus(TomcatStatus.IDLE);
    return this.start(true, true);
  }

  getStatus(): TomcatStatus { return this.instance?.status ?? TomcatStatus.IDLE; }
  getInstance(): TomcatInstance | null { return this.instance; }

  cleanup(): void {
    this.clearLogWatchers();
    if (this.tomcatProcess) { this.tomcatProcess.kill(); this.tomcatProcess = null; }
  }

  /* ========== private helpers ========== */

  /** 初始化CATALINA_BASE：{pluginStorage}/{contextPath}/，从tomcatHome拷贝conf并修改端口 */
  private setupCatalinaBase(tomcatHome: string, config: TomcatConfig): string {
    const storagePath = this.context.globalStoragePath;
    if (!fs.existsSync(storagePath)) { fs.mkdirSync(storagePath, { recursive: true }); }

    const catalinaBase = path.join(storagePath, config.contextPath);
    for (const d of ['conf', 'logs', 'temp', 'work']) {
      const dp = path.join(catalinaBase, d);
      if (!fs.existsSync(dp)) { fs.mkdirSync(dp, { recursive: true }); }
    }
    // Catalina/localhost目录
    const localhostDir = path.join(catalinaBase, 'conf', 'Catalina', 'localhost');
    if (!fs.existsSync(localhostDir)) { fs.mkdirSync(localhostDir, { recursive: true }); }

    // 拷贝conf文件（每次启动都覆盖，确保配置干净）
    const srcConf = path.join(tomcatHome, 'conf');
    const tgtConf = path.join(catalinaBase, 'conf');
    if (fs.existsSync(srcConf)) {
      for (const e of fs.readdirSync(srcConf, { withFileTypes: true })) {
        if (e.isFile()) {
          const s = path.join(srcConf, e.name), d = path.join(tgtConf, e.name);
          fs.copyFileSync(s, d);
        }
      }
    }

    // 修改server.xml端口
    this.modifyServerXml(tgtConf, config);
    this.outputChannel.appendLine(`[CATALINA_BASE] ${catalinaBase}`);
    return catalinaBase;
  }

  /** 修改server.xml：替换HTTP端口和shutdown端口 */
  private modifyServerXml(confDir: string, config: TomcatConfig): void {
    const fp = path.join(confDir, 'server.xml');
    if (!fs.existsSync(fp)) return;
    let c = fs.readFileSync(fp, 'utf-8');
    // HTTP Connector，匹配任意当前端口值（port属性可能不在第一位）
    c = c.replace(/(<Connector\s[^>]*?)(port="\d+")/, `$1port="${config.port}"`);
    // Shutdown端口
    c = c.replace(/(<Server\s[^>]*?)(port="\d+")/, '$1port="8006"');
    fs.writeFileSync(fp, c, 'utf-8');
  }

  /** 写入conf/Catalina/localhost/{contextPath}.xml → docBase指向Maven编译输出 */
  private writeContextXml(catalinaBase: string, contextPath: string, docBase: string): void {
    const dir = path.join(catalinaBase, 'conf', 'Catalina', 'localhost');
    if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true }); }
    const xml = `<?xml version="1.0" encoding="UTF-8"?><Context docBase="${docBase}" reloadable="false" crossContext="true"/>`;
    fs.writeFileSync(path.join(dir, `${contextPath}.xml`), xml, 'utf-8');
    this.outputChannel.appendLine(`[context.xml] ${contextPath}.xml → docBase=${docBase}`);
  }

  private async resolveTomcatHome(configuredHome: string): Promise<string> {
    if (configuredHome) return configuredHome;
    const gs = this.context.globalStoragePath;
    if (!fs.existsSync(gs)) { fs.mkdirSync(gs, { recursive: true }); }
    if (!FileUtils.isBundledTomcatCopied(gs)) {
      this.outputChannel.appendLine('首次使用，复制内置Tomcat9...');
      return await FileUtils.copyBundledTomcat(this.context.extensionPath, gs);
    }
    return path.join(gs, BUNDLED_TOMCAT_DIR);
  }

  private async startTomcatProcess(catalinaBase: string, tomcatHome: string, config: TomcatConfig): Promise<void> {
    const env: Record<string, string> = {
      CATALINA_HOME: tomcatHome, CATALINA_BASE: catalinaBase,
      JPDA_ADDRESS: `${config.debugPort}`, JPDA_TRANSPORT: 'dt_socket',
    };
    if (config.vmOptions) { env.JAVA_OPTS = config.vmOptions; }
    this.outputChannel.show(true);
    const ch = this.outputChannel.getChannel();
    const proc = spawn('cmd', ['/c', 'catalina.bat', 'jpda', 'run'], {
      cwd: path.join(tomcatHome, 'bin'), env: { ...process.env, ...env }, shell: true, windowsHide: true,
    });
    proc.stdout?.on('data', (d: Buffer) => ch.append(d.toString()));
    proc.stderr?.on('data', (d: Buffer) => ch.append(d.toString()));
    proc.on('close', (code: number | null) => {
      if (this.instance) { this.instance.status = (code !== 0 && code !== null) ? TomcatStatus.ERROR : TomcatStatus.IDLE; this.statusBar.updateStatus(this.instance.status); }
    });
    proc.on('error', () => { if (this.instance) { this.instance.status = TomcatStatus.ERROR; this.statusBar.updateStatus(TomcatStatus.ERROR); } });
    this.tomcatProcess = proc;
    this.instance!.processId = proc.pid ?? null;
    await this.waitForTomcatStart(config.port);
  }

  private async waitForTomcatStart(port: number): Promise<void> {
    let w = 0;
    while (w < 30000) {
      const info = await PortUtils.isPortInUse(port);
      if (info.inUse) { this.instance!.childProcessId = info.pid; return; }
      await new Promise<void>(r => setTimeout(r, 1000)); w += 1000;
    }
    throw new Error('Tomcat启动超时');
  }

  private async waitForPortFree(port: number): Promise<void> {
    let w = 0;
    while (w < 5000) {
      const info = await PortUtils.isPortInUse(port);
      if (!info.inUse) return;
      if (info.pid) { await ProcessUtils.killProcessTree(info.pid); }
      await new Promise<void>(r => setTimeout(r, 500)); w += 500;
    }
  }

  private watchTomcatLogs(base: string): void {
    this.clearLogWatchers();
    const ld = path.join(base, 'logs');
    if (!fs.existsSync(ld)) fs.mkdirSync(ld, { recursive: true });
    const d = this.getLogDate();
    this.watchLogFile(path.join(ld, `catalina.${d}.log`));
    this.watchLogFile(path.join(ld, `localhost.${d}.log`));
  }

  private watchLogFile(fp: string): void {
    if (!fs.existsSync(fp)) return;
    try {
      const w = fs.watch(fp, () => {
        try {
          const lines = fs.readFileSync(fp, 'utf-8').split('\n').slice(-5);
          for (const l of lines) { if (l.trim()) this.outputChannel.appendLine(`[log] ${l}`); }
        } catch { /* 文件正在写入 */ }
      });
      this.logWatchers.push(w);
    } catch { /* 忽略 */ }
  }

  private clearLogWatchers(): void { for (const w of this.logWatchers) w.close(); this.logWatchers = []; }
  private getLogDate(): string { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
  private getWorkspacePath(): string | null { const f = vscode.workspace.workspaceFolders; return f && f.length > 0 ? f[0].uri.fsPath : null; }
}