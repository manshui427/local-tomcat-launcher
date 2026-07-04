import * as vscode from 'vscode';
import { COMMAND_START, COMMAND_STOP, COMMAND_RESTART } from '../constants';
import { TomcatService } from '../services/tomcatService';
import { OutputChannelManager } from '../ui/outputChannel';

/**
 * 注册所有命令到VSCode
 * 三个按钮（启动/停止/重启）均加入防护，防止连续点击导致并发问题。
 * @param context 插件上下文
 * @param tomcatService Tomcat服务实例
 * @param outputChannelManager 输出通道管理器，用于点击按钮时立即显示输出面板
 */
export function registerCommands(
  context: vscode.ExtensionContext,
  tomcatService: TomcatService,
  outputChannelManager: OutputChannelManager
): void {
  // 按钮防护标志：任意一个操作正在执行时，阻止其他操作
  let isProcessing = false;

  /**
   * 包装命令处理函数，加入防连续点击防护。
   * 如果上一个操作尚未完成，后续点击将被忽略。
   */
  function withGuard(fn: () => Promise<void>, errorPrefix: string): () => Promise<void> {
    return async () => {
      if (isProcessing) {
        return;
      }
      isProcessing = true;
      try {
        await fn();
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : '未知错误';
        vscode.window.showErrorMessage(`${errorPrefix}: ${msg}`);
      } finally {
        isProcessing = false;
      }
    };
  }

  context.subscriptions.push(
    vscode.commands.registerCommand(
      COMMAND_START,
      withGuard(async () => {
        outputChannelManager.show(true);
        await tomcatService.start();
      }, 'Tomcat启动失败')
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      COMMAND_STOP,
      withGuard(async () => {
        outputChannelManager.show(true);
        await tomcatService.stop();
      }, 'Tomcat停止失败')
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      COMMAND_RESTART,
      withGuard(async () => {
        outputChannelManager.show(true);
        await tomcatService.restart();
      }, 'Tomcat重启失败')
    )
  );
}
