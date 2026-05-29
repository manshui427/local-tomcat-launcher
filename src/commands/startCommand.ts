import * as vscode from 'vscode';
import { TomcatService } from '../services/tomcatService';

/**
 * 启动命令 - 调用TomcatService.start启动Tomcat
 */
export async function startCommand(tomcatService: TomcatService): Promise<void> {
  try {
    await tomcatService.start();
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : '启动失败';
    vscode.window.showErrorMessage(`Tomcat启动失败: ${msg}`);
  }
}