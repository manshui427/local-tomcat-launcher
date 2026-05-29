import * as vscode from 'vscode';
import { TomcatService } from '../services/tomcatService';

/**
 * 停止命令 - 调用TomcatService.stop强制终止Tomcat进程
 */
export async function stopCommand(tomcatService: TomcatService): Promise<void> {
  try {
    await tomcatService.stop();
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : '停止失败';
    vscode.window.showErrorMessage(`Tomcat停止失败: ${msg}`);
  }
}