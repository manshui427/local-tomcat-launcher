import * as vscode from 'vscode';
import { COMMAND_START, COMMAND_STOP, COMMAND_RESTART } from '../constants';
import { TomcatService } from '../services/tomcatService';

/**
 * 注册所有命令到VSCode
 * @param context 插件上下文
 * @param tomcatService Tomcat服务实例
 */
export function registerCommands(
  context: vscode.ExtensionContext,
  tomcatService: TomcatService
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(COMMAND_START, async () => {
      try {
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
        await tomcatService.restart();
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : '重启失败';
        vscode.window.showErrorMessage(`Tomcat重启失败: ${msg}`);
      }
    })
  );
}