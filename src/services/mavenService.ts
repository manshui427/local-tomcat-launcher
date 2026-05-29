import * as fs from 'fs';
import * as path from 'path';
import { CompileResult } from '../constants';
import { ProcessUtils } from '../utils/processUtils';
import { OutputChannelManager } from '../ui/outputChannel';

/**
 * Maven编译服务 - 执行Maven编译(war:exploded)并pipe输出到通道
 */
export class MavenService {
  private outputChannel: OutputChannelManager;

  constructor(outputChannel: OutputChannelManager) {
    this.outputChannel = outputChannel;
  }

  async compile(workspacePath: string): Promise<CompileResult> {
    const startTime = Date.now();
    const channel = this.outputChannel.getChannel();

    const { promise } = ProcessUtils.spawnCommand(
      'mvn',
      ['compile', 'war:exploded'],
      { cwd: workspacePath, shell: true },
      channel
    );

    const exitCode = await promise;
    const duration = Date.now() - startTime;
    const deployPath = this.findExplodedWarPath(workspacePath);
    const success = exitCode === 0 && deployPath !== '';

    if (success) {
      this.outputChannel.appendLine(`Maven编译成功，耗时: ${duration}ms`);
    } else {
      this.outputChannel.appendLine(`Maven编译失败，exitCode: ${exitCode}`);
    }

    return { success, deployPath, output: '', duration };
  }

  findExplodedWarPath(workspacePath: string): string {
    const targetDir = path.join(workspacePath, 'target');
    if (!fs.existsSync(targetDir)) {
      return '';
    }
    const entries = fs.readdirSync(targetDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const subDir = path.join(targetDir, entry.name);
        if (fs.existsSync(path.join(subDir, 'WEB-INF'))) {
          return subDir;
        }
      }
    }
    return '';
  }
}