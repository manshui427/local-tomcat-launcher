import { PortInfo } from '../constants';
import { exec } from 'child_process';

/**
 * 端口检测和释放工具 - Windows平台使用PowerShell命令
 */
export class PortUtils {
  static async isPortInUse(port: number): Promise<PortInfo> {
    return new Promise<PortInfo>((resolve) => {
      const cmd = `powershell -Command "Get-NetTCPConnection -LocalPort ${port} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess"`;
      exec(cmd, { timeout: 5000 }, (error: Error | null, stdout: string | Buffer) => {
        if (error || !stdout) {
          resolve({ inUse: false, pid: null, processName: null });
          return;
        }
        const output = stdout.toString().trim();
        if (output === '') {
          resolve({ inUse: false, pid: null, processName: null });
          return;
        }
        // Select-Object -ExpandProperty 直接返回PID数值，过滤NaN
        const pid = parseInt(output, 10);
        if (isNaN(pid)) {
          resolve({ inUse: false, pid: null, processName: null });
          return;
        }
        resolve({ inUse: true, pid, processName: null });
      });
    });
  }

  static async killPortProcess(port: number): Promise<void> {
    const portInfo = await PortUtils.isPortInUse(port);
    if (!portInfo.inUse || !portInfo.pid || isNaN(portInfo.pid)) {
      return;
    }
    return new Promise<void>((resolve) => {
      exec(`taskkill /F /PID ${portInfo.pid}`, { timeout: 5000 }, () => {
        resolve();
      });
    });
  }

  static async ensurePortFree(port: number): Promise<boolean> {
    const portInfo = await PortUtils.isPortInUse(port);
    if (!portInfo.inUse) {
      return true;
    }
    await PortUtils.killPortProcess(port);
    const recheck = await PortUtils.isPortInUse(port);
    return !recheck.inUse;
  }
}