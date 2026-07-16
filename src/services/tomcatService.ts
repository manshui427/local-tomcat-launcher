import * as vscode from 'vscode';
import * as path from 'path';
import { TomcatStatus } from '../constants';
import { OutputChannelManager } from '../ui/outputChannel';
import { StatusBarManager } from '../ui/statusBar';
import { CommonUtils, TOMCAT_START_ABORTED } from '../utils/commonUtils';
import { ConfigManager } from './configService';

export class TomcatService {
  private context: vscode.ExtensionContext;
  private outputChannel: OutputChannelManager;
  private statusBar: StatusBarManager;
  private configManager: ConfigManager;

  constructor(context: vscode.ExtensionContext, outputChannel: OutputChannelManager, statusBar: StatusBarManager,configManager: ConfigManager) {
    this.context = context;
    this.outputChannel = outputChannel;
    this.statusBar = statusBar;
    this.configManager = configManager;
  }

  async start() {
    if(this.statusBar.getCurrentStatus() == TomcatStatus.STARTING || this.statusBar.getCurrentStatus() == TomcatStatus.RUNNING ){
      vscode.window.showInformationMessage("Tomcat正在运行中...");
      return;
    }
    this.statusBar.updateStatus(TomcatStatus.STARTING);
    this.outputChannel.appendLine('=== 启动Tomcat ===');

    // 端口检测
    const portInUse = await CommonUtils.isPortInUse(this.configManager.getPort());
    if (portInUse.inUse) {
      this.statusBar.updateStatus(TomcatStatus.ERROR);
      this.outputChannel.appendLine('=== Tomcat启动失败,端口' + this.configManager.getPort() + '被占用 ===');
      return;
    }

    const dbgInUse = await CommonUtils.isPortInUse(this.configManager.getDebugPort());
    if (dbgInUse.inUse) {
      this.statusBar.updateStatus(TomcatStatus.ERROR);
      this.outputChannel.appendLine('=== Tomcat启动失败,端口' + this.configManager.getDebugPort() + '被占用 ===');
      return;
    }

    this.configManager.setupCatalinaBase();

    const env: Record<string, string> = {
      CATALINA_HOME: this.configManager.getHome(),
      CATALINA_BASE: path.join(this.context.storageUri!.fsPath,'tomcat'),
      JPDA_ADDRESS: `${this.configManager.getDebugPort()}`,
      JPDA_TRANSPORT: 'dt_socket',
    };
    if (this.configManager.getVmOptions()) {
      env.JAVA_OPTS = this.configManager.getVmOptions();
    }

    const javaHome = CommonUtils.getJavaHome();
    if (javaHome) {
      env.JRE_HOME = javaHome;
    } else {
      this.outputChannel.appendLine('[警告] 未找到Java运行时配置，使用系统默认JRE_HOME/JAVA_HOME');
    }

    try {
      await CommonUtils.startTomcat(env, this.outputChannel.getChannel(), this.configManager.getPort(), this.configManager.getContextPath());
      // 兜底：若启动完成的瞬间恰好被主动 stop（标记仍为真），按取消处理，避免覆盖 IDLE
      if (CommonUtils.consumeStartAborted()) {
        this.outputChannel.appendLine('=== Tomcat 启动已被停止 ===');
        this.statusBar.updateStatus(TomcatStatus.IDLE);
        return;
      }
      this.outputChannel.appendLine('=== Tomcat 启动成功 ===');
      this.statusBar.updateStatus(TomcatStatus.RUNNING);
    } catch (err) {
      // 启动过程中被主动 stop：视为取消，翻 IDLE 而不是 ERROR
      if (err instanceof Error && err.message === TOMCAT_START_ABORTED) {
        this.outputChannel.appendLine('=== Tomcat 启动已被停止 ===');
        this.statusBar.updateStatus(TomcatStatus.IDLE);
      } else {
        this.outputChannel.appendLine(`=== Tomcat 启动失败: ${err} ===`);
        this.statusBar.updateStatus(TomcatStatus.ERROR);
      }
    }
  }

  async stop() {
    if(!(this.statusBar.getCurrentStatus() == TomcatStatus.STARTING || this.statusBar.getCurrentStatus() == TomcatStatus.RUNNING) ){
      vscode.window.showInformationMessage("Tomcat不在运行状态...");
      return;
    }
    this.outputChannel.appendLine('=== 停止Tomcat ===');
    // 标记「启动过程中被主动停止」，让 startTomcat 的 close 处理按取消而非失败处理
    CommonUtils.markStartAborted();
    await CommonUtils.killProcess(path.join(this.context.storageUri!.fsPath,'tomcat'));
    this.statusBar.updateStatus(TomcatStatus.IDLE);
    this.outputChannel.appendLine('=== Tomcat已停止 ===');
  }

  async refresh() {
    if(this.statusBar.getCurrentStatus() == TomcatStatus.RUNNING || this.statusBar.getCurrentStatus() == TomcatStatus.STARTING){
      await this.stop();
    }
    await CommonUtils.runMavenBuild(this.outputChannel.getChannel());
    this.start();
  }

  async restart() {
    if(this.statusBar.getCurrentStatus() == TomcatStatus.RUNNING || this.statusBar.getCurrentStatus() == TomcatStatus.STARTING){
      await this.stop();
    }
    this.start();
  }


}