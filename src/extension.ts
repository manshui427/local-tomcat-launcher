import * as vscode from 'vscode';
import { TomcatStatus, COMMAND_START, COMMAND_STOP } from './constants';
import { StatusBarManager } from './ui/statusBar';
import { OutputChannelManager } from './ui/outputChannel';
import { TomcatService } from './services/tomcatService';
import { registerCommands } from './commands/registerCommands';
import { HotReloadService } from './services/hotReloadService';

let statusBarManager: StatusBarManager;
let outputChannelManager: OutputChannelManager;
let tomcatService: TomcatService;
let hotReloadService: HotReloadService;

/**
 * 插件激活入口 - 等待redhat.java激活后再注册所有功能
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
  if (!await checkActivationConditions()) {
    return;
  }

  outputChannelManager = new OutputChannelManager();
  statusBarManager = new StatusBarManager();
  tomcatService = new TomcatService(context, outputChannelManager, statusBarManager);
  hotReloadService = new HotReloadService(tomcatService, outputChannelManager);

  registerCommands(context, tomcatService, outputChannelManager);
  // 注册文件监听，Tomcat未运行时也会同步文件到Maven输出目录
  hotReloadService.registerFileWatcher();
  statusBarManager.updateStatus(TomcatStatus.IDLE);

  // 设置context key，使标题栏按钮始终可见（不依赖文件类型）
  vscode.commands.executeCommand('setContext', 'localTomcatLauncherActive', true);

  context.subscriptions.push(statusBarManager);
  context.subscriptions.push(outputChannelManager);
  context.subscriptions.push(hotReloadService);
}

/**
 * 插件销毁入口
 */
export function deactivate(): void {
  if (tomcatService) {
    tomcatService.cleanup();
  }
  if (hotReloadService) {
    hotReloadService.dispose();
  }
}

/**
 * 检查激活条件：Windows环境、redhat.java激活且版本>=1.51.0、有workspace
 */
async function checkActivationConditions(): Promise<boolean> {
  if (process.platform !== 'win32') {
    vscode.window.showWarningMessage('local-tomcat-launcher: 仅支持Windows环境');
    return false;
  }
  const redhatExtension = vscode.extensions.getExtension('redhat.java');
  if (!redhatExtension) {
    vscode.window.showWarningMessage('local-tomcat-launcher: 需要安装redhat.java插件');
    return false;
  }
  // 等待redhat.java激活完成后再继续
  if (!redhatExtension.isActive) {
    await redhatExtension.activate();
  }
  const version: string = redhatExtension.packageJSON.version;
  if (version < '1.51.0') {
    vscode.window.showWarningMessage(`local-tomcat-launcher: redhat.java版本需>=1.51.0，当前${version}`);
    return false;
  }
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    return false;
  }
  return true;
}