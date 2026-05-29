import * as vscode from 'vscode';
import { OUTPUT_CHANNEL_NAME } from '../constants';

/**
 * 输出通道管理器 - 管理tomcat日志输出通道
 */
export class OutputChannelManager implements vscode.Disposable {
  private channel: vscode.OutputChannel;

  constructor() {
    this.channel = vscode.window.createOutputChannel(OUTPUT_CHANNEL_NAME);
  }

  /**
   * 追加一行日志到输出通道
   * @param message 日志内容
   */
  appendLine(message: string): void {
    this.channel.appendLine(message);
  }

  /**
   * 追加文本到输出通道（不换行）
   * @param text 文本内容
   */
  append(text: string): void {
    this.channel.append(text);
  }

  /**
   * 显示输出通道面板
   * @param preserveFocus 是否保持焦点在编辑器
   */
  show(preserveFocus?: boolean): void {
    this.channel.show(preserveFocus);
  }

  /**
   * 清空输出通道内容
   */
  clear(): void {
    this.channel.clear();
  }

  /**
   * 销毁输出通道
   */
  dispose(): void {
    this.channel.dispose();
  }

  /**
   * 获取输出通道实例（供直接pipe使用）
   */
  getChannel(): vscode.OutputChannel {
    return this.channel;
  }
}