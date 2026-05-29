import * as vscode from 'vscode';
import { TomcatService } from '../services/tomcatService';

/**
 * 重启命令 - 清除现有配置和端口占用，重新编译并启动Tomcat
 */
export async function restartCommand(tomcatService: TomcatService): Promise<void> {
  try {
    await tomcatService.restart();
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : '重启失败';
    vscode.window.showErrorMessage(`Tomcat重启失败: ${msg}`);
  }
}