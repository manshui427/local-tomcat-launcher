import * as vscode from 'vscode';
import { COMMAND_START, COMMAND_STOP, COMMAND_RESTART, COMMAND_REFRESH } from '../constants';
import { TomcatService } from '../services/tomcatService';
import { OutputChannelManager } from '../ui/outputChannel';

/**
 * 注册所有命令到VSCode
 * 四个按钮（启动/停止/重启/刷新）各自独立防护，防止同一按钮连续点击导致并发问题。
 * @param context 插件上下文
 * @param tomcatService Tomcat服务实例
 * @param outputChannelManager 输出通道管理器，用于点击按钮时立即显示输出面板
 */
export function registerCommands(
  context: vscode.ExtensionContext,
  tomcatService: TomcatService,
  outputChannelManager: OutputChannelManager
): void {
  /**
   * 为单个命令创建独立的防连点包装。
   * 四个按钮互不影响。
   */
  function withGuard(fn: () => Promise<void>, actionName: string,guardTime:number): () => Promise<void> {
    let processing = false;
    let lastClickTime = 0;
    return async () => {
      if (processing) {
        if (Date.now() - lastClickTime < guardTime) {
          vscode.window.showInformationMessage(`${actionName}正在执行中，请稍候`);
        }
        return;
      }
      processing = true;
      lastClickTime = Date.now();
      try {
        await fn();
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : '未知错误';
        vscode.window.showErrorMessage(`${actionName}失败: ${msg}`);
      } finally {
        processing = false;
      }
    };
  }

  context.subscriptions.push(
    vscode.commands.registerCommand(
      COMMAND_START,
      withGuard(async () => {
        outputChannelManager.show(true);
        await tomcatService.start();
      }, 'Tomcat启动',3000)
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      COMMAND_STOP,
      withGuard(async () => {
        outputChannelManager.show(true);
        await tomcatService.stop();
      }, 'Tomcat停止',1000)
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      COMMAND_RESTART,
      withGuard(async () => {
        outputChannelManager.show(true);
        await tomcatService.restart();
      }, 'Tomcat重启',2000)
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      COMMAND_REFRESH,
      withGuard(async () => {
        outputChannelManager.show(true);
        await tomcatService.refresh();
      }, 'Tomcat重启',10000)
    )
  );
}
