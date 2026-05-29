import * as vscode from 'vscode';
import { COMMAND_START, COMMAND_STOP, COMMAND_RESTART } from '../constants';
import { StatusBarManager } from './statusBar';

/**
 * 标题栏按钮注册 - 命令已在package.json中声明为editor/title菜单
 */

/**
 * 检查标题栏按钮是否应在当前上下文中显示
 */
export function shouldShowTitleBarButtons(): boolean {
  const activeEditor = vscode.window.activeTextEditor;
  if (!activeEditor) {
    return false;
  }
  const fileName = activeEditor.document.fileName;
  const ext = fileName.substring(fileName.lastIndexOf('.'));
  return ext === '.java' || ext === '.jsp' || fileName.endsWith('pom.xml');
}