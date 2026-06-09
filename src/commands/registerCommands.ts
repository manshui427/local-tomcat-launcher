import * as vscode from 'vscode';
import { COMMAND_START, COMMAND_STOP, COMMAND_RESTART } from '../constants';
import { TomcatService } from '../services/tomcatService';
import { OutputChannelManager } from '../ui/outputChannel';

/**
 * 注册所有命令到VSCode
 * @param context 插件上下文
 * @param tomcatService Tomcat服务实例
 * @param outputChannelManager 输出通道管理器，用于点击按钮时立即显示输出面板
 */
export function registerCommands(
  context: vscode.ExtensionContext,
  tomcatService: TomcatService,
  outputChannelManager: OutputChannelManager
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(COMMAND_START, async () => {
      try {
        outputChannelManager.show(true);
        await tomcatService.start();
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : '启动失败';
        vscode.window.showErrorMessage(`Tomcat启动失败: ${msg}`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(COMMAND_STOP, async () => {
      try {
        outputChannelManager.show(true);
        await tomcatService.stop();
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : '停止失败';
        vscode.window.showErrorMessage(`Tomcat停止失败: ${msg}`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(COMMAND_RESTART, async () => {
      try {
        outputChannelManager.show(true);
        await tomcatService.restart();
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : '重启失败';
        vscode.window.showErrorMessage(`Tomcat重启失败: ${msg}`);
      }
    })
  );
}