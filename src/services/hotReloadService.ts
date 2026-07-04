import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { TomcatStatus, JAVA_WORKSPACE_COMPILE_COMMAND } from '../constants';
import { TomcatService } from './tomcatService';
import { MavenService } from './mavenService';
import { FileUtils } from '../utils/fileUtils';
import { OutputChannelManager } from '../ui/outputChannel';

type FileAction = 'create' | 'change' | 'delete';

export class HotReloadService implements vscode.Disposable {
  private tomcatService: TomcatService;
  private outputChannel: OutputChannelManager;
  private mavenService: MavenService;
  private watchers: vscode.FileSystemWatcher[] = [];

  /** src/main 防抖：java/resources/webapp 共享 1s */
  private srcDebounceTimer: NodeJS.Timeout | null = null;
  private srcPendingChanges: Map<string, FileAction> = new Map();
  private readonly SRC_DEBOUNCE_DELAY = 1000;

  /** pom.xml 防抖：5s */
  private pomDebounceTimer: NodeJS.Timeout | null = null;
  private pomPending: boolean = false;
  private readonly POM_DEBOUNCE_DELAY = 5000;

  constructor(tomcatService: TomcatService, outputChannel: OutputChannelManager) {
    this.tomcatService = tomcatService;
    this.outputChannel = outputChannel;
    this.mavenService = new MavenService(outputChannel);
  }

  /**
   * 注册三个 FileSystemWatcher：
   * 1. src/main/**  — resources/webapp 同步到 deployDir，java 仅触发 JDT 增量编译
   * 2. target/classes/** — 同步到 deployDir/WEB-INF/classes/（无防抖）
   * 3. pom.xml — 重新编译并更新 deployDir/WEB-INF/lib/
   */
  registerFileWatcher(): void {
    const workspacePath = this.getWorkspacePath();
    if (!workspacePath) {
      this.outputChannel.appendLine('[监听] 未找到 workspace，跳过文件监听注册');
      return;
    }

    const folder = vscode.workspace.workspaceFolders![0];

    // ── Watcher 1: src/main/** ──
    const srcMainWatcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(folder, 'src/main/**')
    );
    this.watchers.push(srcMainWatcher);
    srcMainWatcher.onDidCreate(uri => this.queueSrcMainChange(uri.fsPath, 'create'));
    srcMainWatcher.onDidChange(uri => this.queueSrcMainChange(uri.fsPath, 'change'));
    srcMainWatcher.onDidDelete(uri => this.queueSrcMainChange(uri.fsPath, 'delete'));

    // ── Watcher 2: target/classes/** （无防抖）──
    const classesWatcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(folder, 'target/classes/**')
    );
    this.watchers.push(classesWatcher);
    classesWatcher.onDidCreate(uri => this.onClassesFileEvent(uri.fsPath, 'create'));
    classesWatcher.onDidChange(uri => this.onClassesFileEvent(uri.fsPath, 'change'));
    classesWatcher.onDidDelete(uri => this.onClassesFileEvent(uri.fsPath, 'delete'));

    // ── Watcher 3: pom.xml ──
    const pomWatcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(folder, 'pom.xml')
    );
    this.watchers.push(pomWatcher);
    pomWatcher.onDidCreate(() => this.queuePomChange());
    pomWatcher.onDidChange(() => this.queuePomChange());

    this.outputChannel.appendLine('[监听] 文件监听已启动: src/main/**, target/classes/**, pom.xml');
  }

  /* ════════════════════════════════════════════════════
   *  src/main/** 处理（1s 防抖 + 去重）
   * ════════════════════════════════════════════════════ */

  /** 将文件变更加入待处理队列，重置防抖计时器 */
  private queueSrcMainChange(filePath: string, action: FileAction): void {
    // 去重：同一文件多次变更，保留最新 action
    this.srcPendingChanges.set(filePath, action);

    if (this.srcDebounceTimer) {
      clearTimeout(this.srcDebounceTimer);
    }
    this.srcDebounceTimer = setTimeout(() => {
      this.srcDebounceTimer = null;
      this.processSrcMainChanges().catch(err => {
        this.outputChannel.appendLine(`[监听] 处理 src/main 变更失败: ${err}`);
      });
    }, this.SRC_DEBOUNCE_DELAY);
  }

  /** 批量处理 src/main 下的文件变更 */
  private async processSrcMainChanges(): Promise<void> {
    if (this.srcPendingChanges.size === 0) return;

    const changes = new Map(this.srcPendingChanges);
    this.srcPendingChanges.clear();

    const workspacePath = this.getWorkspacePath();
    if (!workspacePath) return;

    const deployDir = this.getDeployDir(workspacePath);

    // 按类型分组
    const javaFiles: string[] = [];
    const resourceChanges: { filePath: string; action: FileAction }[] = [];

    for (const [filePath, action] of changes) {
      const rel = path.relative(workspacePath, filePath).replace(/\\/g, '/');

      if (rel.startsWith('src/main/java/')) {
        javaFiles.push(filePath);
      } else if (rel.startsWith('src/main/resources/') || rel.startsWith('src/main/webapp/')) {
        resourceChanges.push({ filePath, action });
      }
      // 其他路径忽略
    }

    // ── Java 文件：仅调用 JDT 增量编译，不同步 ──
    if (javaFiles.length > 0) {
      const instance = this.tomcatService.getInstance();
      const running = instance?.status === TomcatStatus.RUNNING;
      const prefix = running ? '[热加载]' : '[同步]';
      this.outputChannel.appendLine(`${prefix} Java 文件变更（${javaFiles.length} 个），执行增量编译...`);
      try {
        await this.doIncrementalCompile();
        this.outputChannel.appendLine(`${prefix} 增量编译完成`);
      } catch (error: unknown) {
        this.outputChannel.appendLine(`增量编译失败: ${error}`);
      }
      // 注意：编译产生的 .class 文件由 target/classes 监听器负责同步
    }

    // ── Resources / Webapp 文件：同步到 deployDir ──
    if (resourceChanges.length > 0 && deployDir) {
      for (const { filePath, action } of resourceChanges) {
        if (action === 'delete') {
          this.deleteFromDeploy(filePath, workspacePath, deployDir);
        } else {
          this.syncResourceToDeploy(filePath, workspacePath, deployDir);
        }
      }
    } else if (resourceChanges.length > 0 && !deployDir) {
      this.outputChannel.appendLine('[同步] 部署目录不存在，跳过资源文件同步');
    }
  }

  /* ════════════════════════════════════════════════════
   *  target/classes/** 处理（无防抖，立即同步）
   * ════════════════════════════════════════════════════ */

  /** target/classes 下的文件变更，立即同步到 deployDir/WEB-INF/classes/ */
  private onClassesFileEvent(filePath: string, action: FileAction): void {
    const workspacePath = this.getWorkspacePath();
    if (!workspacePath) return;

    const deployDir = this.getDeployDir(workspacePath);
    if (!deployDir) return;

    const targetClassesDir = path.join(workspacePath, 'target', 'classes');
    const relativePath = path.relative(targetClassesDir, filePath);

    // 确保路径在 target/classes 下
    if (relativePath.startsWith('..')) return;

    const destPath = path.join(deployDir, 'WEB-INF', 'classes', relativePath);

    if (action === 'delete') {
      // 删除 deployDir 中对应的文件或文件夹
      try {
        fs.rmSync(destPath, { recursive: true, force: true });
        this.outputChannel.appendLine(`[同步] 已删除: WEB-INF/classes/${relativePath.replace(/\\/g, '/')}`);
      } catch {
        // 目标可能不存在，忽略
      }
    } else {
      // create / change：复制文件
      if (!fs.existsSync(filePath)) return;

      const stat = fs.statSync(filePath);
      if (stat.isDirectory()) {
        // 目录：确保目标目录存在
        if (!fs.existsSync(destPath)) {
          fs.mkdirSync(destPath, { recursive: true });
        }
      } else {
        // 文件：复制
        const destDir = path.dirname(destPath);
        if (!fs.existsSync(destDir)) {
          fs.mkdirSync(destDir, { recursive: true });
        }
        fs.copyFileSync(filePath, destPath);
        this.outputChannel.appendLine(`[同步] class 已同步: WEB-INF/classes/${relativePath.replace(/\\/g, '/')}`);
      }
    }
  }

  /* ════════════════════════════════════════════════════
   *  pom.xml 处理（5s 防抖 + 去重）
   * ════════════════════════════════════════════════════ */

  /** 将 pom.xml 变更加入队列，重置 5s 防抖计时器 */
  private queuePomChange(): void {
    // 去重：无论触发多少次，5s 内只处理一次
    this.pomPending = true;

    if (this.pomDebounceTimer) {
      clearTimeout(this.pomDebounceTimer);
    }
    this.pomDebounceTimer = setTimeout(() => {
      this.pomDebounceTimer = null;
      this.processPomChange().catch(err => {
        this.outputChannel.appendLine(`[监听] 处理 pom.xml 变更失败: ${err}`);
      });
    }, this.POM_DEBOUNCE_DELAY);
  }

  /** pom.xml 变更后重新编译并更新 deployDir/WEB-INF/lib/ */
  private async processPomChange(): Promise<void> {
    if (!this.pomPending) return;
    this.pomPending = false;

    const workspacePath = this.getWorkspacePath();
    if (!workspacePath) return;

    const instance = this.tomcatService.getInstance();
    const running = instance?.status === TomcatStatus.RUNNING;
    const deployDir = this.getDeployDir(workspacePath);

    if (!deployDir) {
      this.outputChannel.appendLine('[同步] pom.xml 变更，但部署目录不存在，跳过');
      return;
    }

    if (!running) {
      this.outputChannel.appendLine('[同步] pom.xml 变更，Tomcat 未运行，跳过依赖更新');
      return;
    }

    const prefix = running ? '[热加载]' : '[同步]';
    this.outputChannel.appendLine(`${prefix} pom.xml 变更，重新编译并更新依赖...`);

    try {
      const result = await this.mavenService.compile(workspacePath);
      if (result.success && result.deployPath) {
        const libSrc = path.join(result.deployPath, 'WEB-INF', 'lib');
        const libDst = path.join(deployDir, 'WEB-INF', 'lib');

        // 如果源和目标是同一路径，Maven 编译已经更新了 lib，无需再复制
        if (path.resolve(libSrc).toLowerCase() === path.resolve(libDst).toLowerCase()) {
          this.outputChannel.appendLine('依赖 jar 包已由 Maven 编译更新');
        } else if (fs.existsSync(libSrc)) {
          if (!fs.existsSync(libDst)) {
            fs.mkdirSync(libDst, { recursive: true });
          }
          FileUtils.cleanDir(libDst);
          await FileUtils.copyDir(libSrc, libDst);
          this.outputChannel.appendLine('依赖 jar 包已更新');
        }
      } else {
        this.outputChannel.appendLine('pom.xml 重新编译失败');
      }
    } catch (error: unknown) {
      this.outputChannel.appendLine(`pom.xml 处理失败: ${error}`);
    }
  }

  /* ════════════════════════════════════════════════════
   *  辅助方法
   * ════════════════════════════════════════════════════ */

  private getWorkspacePath(): string | null {
    const folders = vscode.workspace.workspaceFolders;
    return folders && folders.length > 0 ? folders[0].uri.fsPath : null;
  }

  /** 获取部署目录：优先从 Tomcat 实例获取，否则查找 Maven 输出目录 */
  private getDeployDir(workspacePath: string): string | null {
    const instance = this.tomcatService.getInstance();
    if (instance) {
      return instance.deployDir;
    }
    // Tomcat 未启动时，尝试查找已存在的 Maven 输出目录
    const found = this.mavenService.findExplodedWarPath(workspacePath);
    return found || null;
  }

  /** 将资源/webapp 文件同步到 deployDir 对应位置 */
  private syncResourceToDeploy(filePath: string, workspacePath: string, deployDir: string): void {
    try {
      if (!fs.existsSync(filePath)) return;

      const stat = fs.statSync(filePath);
      if (stat.isDirectory()) {
        // 目录：确保 deployDir 中对应目录存在
        const targetRel = this.mapSrcToDeployRelative(filePath, workspacePath);
        if (targetRel) {
          const targetPath = path.join(deployDir, targetRel);
          if (!fs.existsSync(targetPath)) {
            fs.mkdirSync(targetPath, { recursive: true });
          }
        }
        return;
      }

      const targetRel = this.mapSrcToDeployRelative(filePath, workspacePath);
      if (!targetRel) return;

      const targetPath = path.join(deployDir, targetRel);
      const targetDir = path.dirname(targetPath);
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }
      fs.copyFileSync(filePath, targetPath);
      this.outputChannel.appendLine(`[同步] 资源已同步: ${targetRel.replace(/\\/g, '/')}`);
    } catch (error: unknown) {
      this.outputChannel.appendLine(`资源同步失败: ${error}`);
    }
  }

  /** 删除 deployDir 中对应的文件或文件夹 */
  private deleteFromDeploy(filePath: string, workspacePath: string, deployDir: string): void {
    try {
      const targetRel = this.mapSrcToDeployRelative(filePath, workspacePath);
      if (!targetRel) return;

      const targetPath = path.join(deployDir, targetRel);
      if (fs.existsSync(targetPath)) {
        // 使用 rmSync recursive 删除文件或文件夹
        fs.rmSync(targetPath, { recursive: true, force: true });
        this.outputChannel.appendLine(`[同步] 已删除: ${targetRel.replace(/\\/g, '/')}`);
      }
    } catch (error: unknown) {
      this.outputChannel.appendLine(`删除同步失败: ${error}`);
    }
  }

  /**
   * 将 src 路径映射到 deployDir 中的相对路径
   * - src/main/webapp/**  → <rel>
   * - src/main/resources/** → WEB-INF/classes/<rel>
   * - src/main/java/**     → WEB-INF/classes/<rel>（理论上不会走到这里，java 不同步）
   */
  private mapSrcToDeployRelative(filePath: string, workspacePath: string): string | null {
    const rel = path.relative(workspacePath, filePath);

    if (rel.match(/src[/\\]main[/\\]webapp[/\\]?/)) {
      return rel.replace(/src[/\\]main[/\\]webapp[/\\]?/, '');
    }

    if (rel.match(/src[/\\]main[/\\]resources[/\\]?/)) {
      const resourceRel = rel.replace(/src[/\\]main[/\\]resources[/\\]?/, '');
      return path.join('WEB-INF', 'classes', resourceRel);
    }

    // 其他路径不处理
    return null;
  }

  /** 执行 redhat.java 增量编译 */
  private async doIncrementalCompile(): Promise<void> {
    await vscode.commands.executeCommand(JAVA_WORKSPACE_COMPILE_COMMAND, false);
  }

  dispose(): void {
    // 清理防抖计时器
    if (this.srcDebounceTimer) {
      clearTimeout(this.srcDebounceTimer);
      this.srcDebounceTimer = null;
    }
    if (this.pomDebounceTimer) {
      clearTimeout(this.pomDebounceTimer);
      this.pomDebounceTimer = null;
    }
    this.srcPendingChanges.clear();
    this.pomPending = false;

    // 清理文件监听器
    for (const w of this.watchers) {
      w.dispose();
    }
    this.watchers = [];
  }
}
