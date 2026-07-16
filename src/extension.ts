import * as vscode from 'vscode';
import { registerCommands } from './commands/registerCommands';
import { TomcatStatus } from './constants';
import { HotReloadService } from './services/hotReloadService';
import { TomcatService } from './services/tomcatService';
import { OutputChannelManager } from './ui/outputChannel';
import { StatusBarManager } from './ui/statusBar';
import { ConfigManager } from './services/configService';

let statusBarManager: StatusBarManager;
let outputChannelManager: OutputChannelManager;
let tomcatService: TomcatService;
let hotReloadService: HotReloadService;
let configManager: ConfigManager;

/**
 * 插件激活入口 - 等待redhat.java激活后再注册所有功能
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
  if (!await checkActivationConditions()) {
    return;
  }

  outputChannelManager = new OutputChannelManager();
  configManager = new ConfigManager(context);
  statusBarManager = new StatusBarManager();
  tomcatService = new TomcatService(context, outputChannelManager, statusBarManager,configManager);
  hotReloadService = new HotReloadService(tomcatService, outputChannelManager);

  registerCommands(context, tomcatService, outputChannelManager);
  configManager.registerConfigWatcher();
  hotReloadService.registerFileWatcher();
  statusBarManager.updateStatus(TomcatStatus.IDLE);

  context.subscriptions.push(statusBarManager);
  context.subscriptions.push(outputChannelManager);
  context.subscriptions.push(hotReloadService);
  context.subscriptions.push(configManager);
}

/**
 * 插件销毁入口
 */
export function deactivate(): void {
  if (tomcatService) {
    tomcatService.stop();
  }
  if (hotReloadService) {
    hotReloadService.dispose();
  }
  if (configManager) {
    configManager.dispose();
  }
}

/**
 * 检查激活条件：Windows环境、redhat.java 激活
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
  if (!redhatExtension.isActive) {
    await redhatExtension.activate();
  }
  return true;
}