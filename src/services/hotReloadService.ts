import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { OutputChannelManager } from '../ui/outputChannel';
import { TomcatService } from './tomcatService';
import { CommonUtils } from '../utils/commonUtils';

type FileAction = 'create' | 'change' | 'delete';

export class HotReloadService implements vscode.Disposable {
  private tomcatService: TomcatService;
  private outputChannel: OutputChannelManager;
  private watchers: vscode.FileSystemWatcher[] = [];

  /** src/main 防抖：java/resources/webapp 共享 1s */
  private srcDebounceTimer: NodeJS.Timeout | null = null;
  private srcPendingChanges: Map<string, FileAction> = new Map();
  private readonly SRC_DEBOUNCE_DELAY = 1000;

  /** pom.xml 防抖：5s */
  private pomDebounceTimer: NodeJS.Timeout | null = null;
  private readonly POM_DEBOUNCE_DELAY = 5000;

  constructor(tomcatService: TomcatService, outputChannel: OutputChannelManager) {
    this.tomcatService = tomcatService;
    this.outputChannel = outputChannel;
  }

  /**
   * 注册两个 FileSystemWatcher：
   * 1. src/main/**  — resources/webapp 同步到 deployDir，java 仅触发 JDT 增量编译
   * 3. pom.xml — 重新编译并更新 deployDir/WEB-INF/lib/
   */
  registerFileWatcher(): void {
    const folder = CommonUtils.getWorkSpace();

    // ── Watcher 1: src/main/** ──
    const srcMainWatcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(folder, 'src/main/**')
    );
    this.watchers.push(srcMainWatcher);
    srcMainWatcher.onDidCreate(uri => this.queueSrcMainChange(uri.fsPath, 'create'));
    srcMainWatcher.onDidChange(uri => this.queueSrcMainChange(uri.fsPath, 'change'));
    srcMainWatcher.onDidDelete(uri => this.queueSrcMainChange(uri.fsPath, 'delete'));


    // ── Watcher 2: pom.xml ──
    const pomWatcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(folder, 'pom.xml')
    );
    this.watchers.push(pomWatcher);
    pomWatcher.onDidChange(() => this.queuePomChange());

  }


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

    // 按类型分组
    const javaFiles: string[] = [];           // .java 新增 / 修改
    const javaDeleted: string[] = [];         // .java 删除（需清理对应 .class）
    const resourceChanges: { filePath: string; action: FileAction }[] = [];

    for (const [filePath, action] of changes) {
      const rel = path.relative(CommonUtils.getWorkSpace(), filePath).replace(/\\/g, '/');

      if (rel.endsWith('.java')) {
        if (action === 'delete') {
          javaDeleted.push(filePath);
        } else {
          javaFiles.push(filePath);
        }
      } else if (rel.startsWith('src/main/resources/') || rel.startsWith('src/main/webapp/')) {
        resourceChanges.push({ filePath, action });
      }
    }

    // 仅当涉及 java 编译产物或资源同步时才解析一次部署目录
    let deployDir: string | null = null;
    if (javaFiles.length > 0 || javaDeleted.length > 0 || resourceChanges.length > 0) {
      deployDir = await this.getDeployDir();
      if (!deployDir) {
        this.outputChannel.appendLine('[热加载] 无法确定部署目录（target/{finalName}），跳过同步');
      }
    }

    // ── Java 文件：JDT 增量编译，并把变更的 .class 同步到 deployDir/WEB-INF/classes ──
    if (javaFiles.length > 0 || javaDeleted.length > 0) {
      try {
        const changedClasses = await this.doIncrementalCompile();
        this.outputChannel.appendLine(`增量编译完成，本次变更 .class 文件: ${changedClasses.length} 个`);
        if (deployDir) {
          for (const c of changedClasses) {
            this.syncClassToDeploy(c, deployDir);
          }
        } else {
          for (const c of changedClasses) {
            this.outputChannel.appendLine(`  [热加载] 编译产物: ${c}`);
          }
        }
      } catch (error: unknown) {
        this.outputChannel.appendLine(`增量编译失败: ${error}`);
      }
      // 删除的 .java 源：清理对应 .class（含内部类），避免残留旧类被 Tomcat 加载
      if (deployDir) {
        for (const f of javaDeleted) {
          this.deleteClassFromDeploy(f, deployDir);
        }
      }
    }

    // ── Resources / Webapp 文件：同步到 deployDir ──
    if (resourceChanges.length > 0 && deployDir) {
      for (const { filePath, action } of resourceChanges) {
        if (action === 'delete') {
          await this.deleteFromDeploy(filePath, deployDir);
        } else {
          await this.syncResourceToDeploy(filePath, deployDir);
        }
      }
    }
  }

  /** 将 pom.xml 变更加入队列，重置 5s 防抖计时器 */
  private queuePomChange(): void {
    // 去重：无论触发多少次，5s 内只处理一次
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


    try {
      await CommonUtils.runMavenJar();
    } catch (error: unknown) {
      this.outputChannel.appendLine(`pom.xml 处理失败: ${error}`);
    }
  }

  /** 执行 redhat.java 增量编译，并返回本次新生成 / 变更的 .class 文件（绝对路径）
   * - 编译前记 cutoff = Date.now()
   * - 编译后只扫一次输出目录（target/classes），挑 mtimeMs >= cutoff 的 .class
   * - 调用方可据此把这些 .class 热部署到 deployDir/WEB-INF/classes
   */
  private async doIncrementalCompile(): Promise<string[]> {
    const cutoff = Date.now();
    await vscode.commands.executeCommand("java.workspace.compile", false);

    // JDT / Maven 默认编译输出目录
    const outDir = path.join(CommonUtils.getWorkSpace(), 'target', 'classes');
    const changed: string[] = [];
    this.collectChangedClasses(outDir, cutoff, changed);
    return changed;
  }

  /** 递归遍历 dir，收集 mtimeMs >= cutoff 的 .class 文件（绝对路径）写入 out */
  private collectChangedClasses(dir: string, cutoff: number, out: string[]): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return; // 目录不存在（尚未编译过）则跳过
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        this.collectChangedClasses(full, cutoff, out);
      } else if (e.isFile() && e.name.endsWith('.class')) {
        try {
          if (fs.statSync(full).mtimeMs >= cutoff) {
            out.push(full);
          }
        } catch {
          // 忽略无法 stat 的文件
        }
      }
    }
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

    // 清理文件监听器
    for (const w of this.watchers) {
      w.dispose();
    }
    this.watchers = [];
  }

  /**
   * 删除部署目录中与被删源文件对应的文件。
   * 映射规则（相对工作区）：
   *   src/main/resources/X -> deployDir/WEB-INF/classes/X
   *   src/main/webapp/X    -> deployDir/X
   */
  private async deleteFromDeploy(filePath: string, deployDir: string): Promise<void> {
    const target = this.mapToDeployPath(filePath, deployDir);
    if (!target) { return; }
    try {
      if (fs.existsSync(target)) {
        fs.rmSync(target, { recursive: true, force: true });
        this.outputChannel.appendLine(`[热加载] 已删除: ${target}`);
      }
    } catch (e) {
      this.outputChannel.appendLine(`[热加载] 删除失败: ${target} -> ${e}`);
    }
  }

  /**
   * 将源文件同步（复制）到部署目录对应位置。
   * 映射规则同上；若源为目录则递归拷贝整棵子树。
   */
  private async syncResourceToDeploy(filePath: string, deployDir: string): Promise<void> {
    const target = this.mapToDeployPath(filePath, deployDir);
    if (!target) { return; }
    try {
      const stat = fs.statSync(filePath);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      if (stat.isDirectory()) {
        fs.cpSync(filePath, target, { recursive: true });
      } else {
        fs.copyFileSync(filePath, target);
      }
      this.outputChannel.appendLine(`[热加载] 已同步: ${filePath} -> ${target}`);
    } catch (e) {
      this.outputChannel.appendLine(`[热加载] 同步失败: ${filePath} -> ${e}`);
    }
  }

  /**
   * 将一个 .class 编译产物（位于 target/classes 下）按包结构同步到部署目录
   * 的 WEB-INF/classes 中，使其被 Tomcat 实际加载。
   * 例：target/classes/com/foo/A.class -> deployDir/WEB-INF/classes/com/foo/A.class
   */
  private syncClassToDeploy(classFile: string, deployDir: string): void {
    const classesRoot = path.join(CommonUtils.getWorkSpace(), 'target', 'classes');
    const rel = path.relative(classesRoot, classFile).replace(/\\/g, '/');
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      this.outputChannel.appendLine(`[热加载] 跳过非输出目录文件: ${classFile}`);
      return;
    }
    const target = path.join(deployDir, 'WEB-INF', 'classes', rel);
    try {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(classFile, target);
      this.outputChannel.appendLine(`[热加载] 已同步类: ${classFile} -> ${target}`);
    } catch (e) {
      this.outputChannel.appendLine(`[热加载] 同步类失败: ${classFile} -> ${e}`);
    }
  }

  /**
   * 删除一个被移除的 .java 源对应的已部署 .class（含内部类 Foo$*.class），
   * 避免删除源后残留旧类字节码继续被 Tomcat 加载。
   * 同时清理 target/classes 与 deployDir/WEB-INF/classes 两处。
   * 仅处理 src/main/java 下的源（其它目录的产物不部署）。
   */
  private deleteClassFromDeploy(javaFile: string, deployDir: string): void {
    const ws = CommonUtils.getWorkSpace();
    const rel = path.relative(ws, javaFile).replace(/\\/g, '/');
    const prefix = 'src/main/java/';
    if (!rel.startsWith(prefix) || !rel.endsWith('.java')) { return; }
    // com/foo/Bar（去掉 src/main/java/ 前缀与 .java 后缀）
    const classRelBase = rel.slice(prefix.length, -'.java'.length);
    const wsClasses = path.join(ws, 'target', 'classes');
    const deployClasses = path.join(deployDir, 'WEB-INF', 'classes');
    for (const root of [wsClasses, deployClasses]) {
      const dir = path.join(root, path.dirname(classRelBase));
      const baseName = path.basename(classRelBase); // 如 Bar
      let entries: string[];
      try {
        entries = fs.readdirSync(dir);
      } catch {
        continue; // 目录不存在则跳过
      }
      for (const name of entries) {
        // 匹配 Bar.class 以及内部类 Bar$1.class、Bar$Inner.class
        if (name === `${baseName}.class` || name.startsWith(`${baseName}$`)) {
          const full = path.join(dir, name);
          try {
            fs.rmSync(full, { force: true });
            this.outputChannel.appendLine(`[热加载] 已删除类: ${full}`);
          } catch (e) {
            this.outputChannel.appendLine(`[热加载] 删除类失败: ${full} -> ${e}`);
          }
        }
      }
    }
  }

  /** 将 src/main 下的源文件路径映射到部署目录中的目标路径；无法识别则返回 null */
  private mapToDeployPath(filePath: string, deployDir: string): string | null {
    const ws = CommonUtils.getWorkSpace();
    const rel = path.relative(ws, filePath).replace(/\\/g, '/');
    if (rel.startsWith('src/main/resources/')) {
      return path.join(deployDir, 'WEB-INF', 'classes', rel.slice('src/main/resources/'.length));
    }
    if (rel.startsWith('src/main/webapp/')) {
      return path.join(deployDir, rel.slice('src/main/webapp/'.length));
    }
    return null;
  }

  /** 计算部署目录：工作区下的 target/{finalName}（与 writeContextXml 的 docBase 一致，即 Tomcat 实际服务目录） */
  private async getDeployDir(): Promise<string | null> {
    try {
      const finalName = await CommonUtils.getMavenFinalName();
      if (!finalName) { return null; }
      return path.join(CommonUtils.getWorkSpace(), 'target', finalName);
    } catch (e) {
      this.outputChannel.appendLine(`[热加载] 获取部署目录失败: ${e}`);
      return null;
    }
  }
}
