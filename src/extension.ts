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
  hotReloadService = new HotReloadService(outputChannelManager);

  registerCommands(context, tomcatService, outputChannelManager);
  configManager.registerConfigWatcher();
  hotReloadService.registerFileWatcher();
  statusBarManager.updateStatus(TomcatStatus.IDLE);

  context.subscriptions.push(statusBarManager);
  context.subscriptions.push(outputChannelManager);
  context.subscriptions.push(hotReloadService);
  context.subscriptions.push(configManager);

  // 后台等待 JDT LS 注册 java.workspace.compile 命令后，执行一次增量编译预热。
  // 命令在 redhat.java 进入 Standard 模式后才动态注册，不能同步调用。
  warmUpCompile();
}

/**
 * 后台轮询等待 java.workspace.compile 命令就绪，就绪后执行一次预热编译。
 * - 预热编译让 JDT LS 建立构建状态，后续增量编译才能正常工作（否则首次必然回退为全量）。
 * - 预热后的 classMtimeSnapshot 由 HotReloadService 在内部管理。
 */
function warmUpCompile(): void {
  const MAX_WAIT_MS = 60000;  // 最多等 60 秒
  const POLL_INTERVAL_MS = 500;
  const start = Date.now();

  const poll = setInterval(async () => {
    const cmds = await vscode.commands.getCommands(true);
    if (cmds.includes('java.workspace.compile')) {
      clearInterval(poll);
      try {
        await vscode.commands.executeCommand('java.workspace.compile', false);
      } catch {
        // 预热编译失败不影响后续功能，静默忽略
      }
      return;
    }
    if (Date.now() - start > MAX_WAIT_MS) {
      clearInterval(poll);
    }
  }, POLL_INTERVAL_MS);
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