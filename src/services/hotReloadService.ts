import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { TomcatInstance, TomcatStatus, HotLoadStrategy, JAVA_EXTENSIONS, JSP_EXTENSIONS, CONFIG_EXTENSIONS, POM_FILENAME, JAVA_WORKSPACE_COMPILE_COMMAND, HOT_RELOAD_MONITORED_PATHS, HOT_RELOAD_ROOT_FILES } from '../constants';
import { TomcatService } from './tomcatService';
import { MavenService } from './mavenService';
import { FileUtils } from '../utils/fileUtils';
import { OutputChannelManager } from '../ui/outputChannel';

export class HotReloadService implements vscode.Disposable {
  private tomcatService: TomcatService;
  private outputChannel: OutputChannelManager;
  private fileWatcher: vscode.Disposable | null = null;
  private mavenService: MavenService;

  constructor(tomcatService: TomcatService, outputChannel: OutputChannelManager) {
    this.tomcatService = tomcatService;
    this.outputChannel = outputChannel;
    this.mavenService = new MavenService(outputChannel);
  }

  registerFileWatcher(): vscode.Disposable {
    this.fileWatcher = vscode.workspace.onDidSaveTextDocument((document: vscode.TextDocument) => {
      this.handleFileSave(document);
    });
    return this.fileWatcher;
  }

  private async handleFileSave(document: vscode.TextDocument): Promise<void> {
    const instance = this.tomcatService.getInstance();
    const filePath = document.uri.fsPath;

    // 确定目标目录：运行中同步到deployDir，未运行时同步到Maven输出目录
    let deployDir: string | null = null;
    let workspacePath: string | null = null;

    if (instance) {
      workspacePath = instance.workspacePath;
      deployDir = instance.deployDir;
    } else {
      // Tomcat从未启动过，手动查找Maven输出目录
      const folders = vscode.workspace.workspaceFolders;
      if (folders && folders.length > 0) {
        workspacePath = folders[0].uri.fsPath;
        if (filePath.startsWith(workspacePath)) {
          deployDir = this.mavenService.findExplodedWarPath(workspacePath);
        }
      }
    }

    if (!workspacePath || !filePath.startsWith(workspacePath)) {
      return;
    }

    // 热更新路径范围过滤：只监听src/main/java、src/main/resources、src/main/webapp和根目录pom.xml
    const relativePath = path.relative(workspacePath, filePath);
    const normalizedRelativePath = relativePath.replace(/\\/g, '/');
    const isMonitoredPath = HOT_RELOAD_MONITORED_PATHS.some(p => normalizedRelativePath.startsWith(p + '/'));
    const isRootFile = HOT_RELOAD_ROOT_FILES.some(f => normalizedRelativePath === f);
    if (!isMonitoredPath && !isRootFile) {
      return;
    }

    const strategy = this.identifyFileType(filePath);

    // 无部署目录时：Java做增量编译，非Java跳过
    if (!deployDir) {
      if (strategy === HotLoadStrategy.HOT_SWAP) {
        this.outputChannel.appendLine('[同步] Tomcat未启动，仅执行增量编译');
        await this.doIncrementalCompile();
      }
      return;
    }

    const running = instance?.status === TomcatStatus.RUNNING;
    const prefix = running ? '[热加载]' : '[同步]';
    this.outputChannel.appendLine(`${prefix} 文件保存: ${path.basename(filePath)} → 策略: ${strategy}`);

    switch (strategy) {
      case HotLoadStrategy.HOT_SWAP:
        await this.onJavaFileSaved(filePath, workspacePath, deployDir);
        break;
      case HotLoadStrategy.DIRECT_SYNC:
        await this.onResourceFileSaved(filePath, workspacePath, deployDir);
        break;
      case HotLoadStrategy.DEPENDENCY_UPDATE:
        if (running) { await this.onPomFileSaved(workspacePath, deployDir); }
        break;
    }
  }

  private identifyFileType(filePath: string): HotLoadStrategy {
    const ext = path.extname(filePath).toLowerCase();
    const fileName = path.basename(filePath);
    if (JAVA_EXTENSIONS.includes(ext)) return HotLoadStrategy.HOT_SWAP;
    if (fileName === POM_FILENAME) return HotLoadStrategy.DEPENDENCY_UPDATE;
    return HotLoadStrategy.DIRECT_SYNC;
  }

  /** Java增量编译 + class同步到deployDir */
  private async onJavaFileSaved(javaFilePath: string, workspacePath: string, deployDir: string): Promise<void> {
    try {
      await this.doIncrementalCompile();

      // 找到class文件 → deployDir/WEB-INF/classes
      const srcJavaDir = path.join(workspacePath, 'src', 'main', 'java');
      const targetClassesDir = path.join(workspacePath, 'target', 'classes');
      const classRelativePath = path.relative(srcJavaDir, javaFilePath).replace(/\.java$/, '.class');
      const classFilePath = path.join(targetClassesDir, classRelativePath);

      if (fs.existsSync(classFilePath)) {
        const destPath = path.join(deployDir, 'WEB-INF', 'classes', classRelativePath);
        const destDir = path.dirname(destPath);
        if (!fs.existsSync(destDir)) { fs.mkdirSync(destDir, { recursive: true }); }
        fs.copyFileSync(classFilePath, destPath);
        this.outputChannel.appendLine(`class已同步: ${classRelativePath}`);
      }
    } catch (error: unknown) {
      this.outputChannel.appendLine(`增量编译失败: ${error}`);
    }
  }

  /** 资源文件直接复制 */
  private async onResourceFileSaved(filePath: string, workspacePath: string, deployDir: string): Promise<void> {
    try {
      const relativePath = path.relative(workspacePath, filePath);
      let targetRelativePath: string;
      if (relativePath.startsWith('src\\main\\webapp') || relativePath.startsWith('src/main/webapp')) {
        targetRelativePath = relativePath.replace(/src[/\\]main[/\\]webapp[/\\]?/, '');
      } else if (relativePath.startsWith('src\\main\\resources') || relativePath.startsWith('src/main/resources')) {
        targetRelativePath = path.join('WEB-INF', 'classes', relativePath.replace(/src[/\\]main[/\\]resources[/\\]?/, ''));
      } else {
        targetRelativePath = relativePath;
      }
      const targetPath = path.join(deployDir, targetRelativePath);
      const targetDir = path.dirname(targetPath);
      if (!fs.existsSync(targetDir)) { fs.mkdirSync(targetDir, { recursive: true }); }
      fs.copyFileSync(filePath, targetPath);
      this.outputChannel.appendLine(`资源已同步: ${path.basename(filePath)}`);
    } catch (error: unknown) {
      this.outputChannel.appendLine(`资源同步失败: ${error}`);
    }
  }

  /** pom.xml变更：全量Maven编译 + 更新jar */
  private async onPomFileSaved(workspacePath: string, deployDir: string): Promise<void> {
    try {
      this.outputChannel.appendLine('pom.xml变更，重新编译...');
      const result = await this.mavenService.compile(workspacePath);
      if (result.success && result.deployPath) {
        const libSrc = path.join(result.deployPath, 'WEB-INF', 'lib');
        const libDst = path.join(deployDir, 'WEB-INF', 'lib');
        if (fs.existsSync(libSrc)) {
          if (!fs.existsSync(libDst)) { fs.mkdirSync(libDst, { recursive: true }); }
          FileUtils.cleanDir(libDst);
          await FileUtils.copyDir(libSrc, libDst);
          this.outputChannel.appendLine('依赖jar包已更新');
        }
      }
    } catch (error: unknown) {
      this.outputChannel.appendLine(`pom.xml处理失败: ${error}`);
    }
  }

  /** 执行redhat.java增量编译 */
  private async doIncrementalCompile(): Promise<void> {
    await vscode.commands.executeCommand(JAVA_WORKSPACE_COMPILE_COMMAND, true);
  }

  dispose(): void {
    if (this.fileWatcher) { this.fileWatcher.dispose(); this.fileWatcher = null; }
  }
}