import * as vscode from 'vscode';
import { TomcatStatus, STATUS_TEXT, STATUS_COLOR, STATUS_TOOLTIP, COMMAND_START, COMMAND_STOP } from '../constants';

/**
 * 状态栏管理器 - 管理Tomcat运行状态在VSCode状态栏的显示
 */
export class StatusBarManager implements vscode.Disposable {
  private statusBarItem: vscode.StatusBarItem;
  private currentStatus: TomcatStatus = TomcatStatus.IDLE;

  constructor() {
    this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 50);
    this.updateStatus(TomcatStatus.IDLE);
    this.statusBarItem.show();
  }

  /**
   * 更新状态栏显示的状态
   * @param status Tomcat运行状态
   */
  updateStatus(status: TomcatStatus): void {
    this.currentStatus = status;
    this.statusBarItem.text = STATUS_TEXT[status];
    this.statusBarItem.tooltip = STATUS_TOOLTIP[status];
    this.statusBarItem.color = STATUS_COLOR[status];
    this.statusBarItem.command = this.getCommandForStatus(status);
  }

  /**
   * 根据状态返回对应的点击命令
   * @param status 当前状态
   */
  private getCommandForStatus(status: TomcatStatus): string {
    if (status === TomcatStatus.IDLE || status === TomcatStatus.ERROR) {
      return COMMAND_START;
    }
    if (status === TomcatStatus.RUNNING) {
      return COMMAND_STOP;
    }
    return '';
  }

  getCurrentStatus(): TomcatStatus {
    return this.currentStatus;
  }

  dispose(): void {
    this.statusBarItem.dispose();
  }
}