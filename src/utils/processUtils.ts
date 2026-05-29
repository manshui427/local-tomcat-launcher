import { spawn, exec } from 'child_process';
import * as vscode from 'vscode';

/**
 * 进程管理工具 - 启动和终止Java/Tomcat进程
 */
export class ProcessUtils {
  static async killProcessTree(pid: number): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      exec(`taskkill /F /T /PID ${pid}`, { timeout: 10000 }, (error: Error | null) => {
        resolve(!error);
      });
    });
  }

  static async killProcess(pid: number): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      exec(`taskkill /F /PID ${pid}`, { timeout: 5000 }, (error: Error | null) => {
        resolve(!error);
      });
    });
  }

  static async getChildPids(parentPid: number): Promise<number[]> {
    return new Promise<number[]>((resolve) => {
      exec(`wmic process where (ParentProcessId=${parentPid}) get ProcessId /format:list`, { timeout: 5000 }, (error: Error | null, stdout: string | Buffer) => {
        if (error || !stdout) {
          resolve([]);
          return;
        }
        const pids: number[] = [];
        const lines = stdout.toString().split('\n');
        for (const line of lines) {
          const match = line.match(/ProcessId=(\d+)/);
          if (match) {
            pids.push(parseInt(match[1], 10));
          }
        }
        resolve(pids);
      });
    });
  }

  static async isProcessRunning(pid: number): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      exec(`tasklist /FI "PID eq ${pid}" /NH`, { timeout: 5000 }, (error: Error | null, stdout: string | Buffer) => {
        if (error || !stdout) {
          resolve(false);
          return;
        }
        resolve(stdout.toString().includes(pid.toString()));
      });
    });
  }

  static spawnCommand(
    command: string,
    args: string[],
    options: { cwd?: string; env?: Record<string, string>; shell?: boolean },
    outputChannel?: vscode.OutputChannel
  ): { process: ReturnType<typeof spawn>; promise: Promise<number> } {
    const proc = spawn(command, args, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      shell: options.shell ?? true,
      windowsHide: true,
    });

    if (outputChannel) {
      proc.stdout?.on('data', (data: Buffer) => {
        outputChannel.append(data.toString());
      });
      proc.stderr?.on('data', (data: Buffer) => {
        outputChannel.append(data.toString());
      });
    }

    const promise = new Promise<number>((resolve, reject) => {
      proc.on('close', (code: number | null) => {
        resolve(code ?? 0);
      });
      proc.on('error', (err: Error) => {
        reject(err);
      });
    });

    return { process: proc, promise };
  }
}