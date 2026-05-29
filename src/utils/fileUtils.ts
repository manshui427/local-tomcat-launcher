import * as fs from 'fs';
import * as path from 'path';
import { DeployService } from '../services/deployService';

/**
 * 文件操作工具 - 目录复制、文件同步、目录清理等
 */
export class FileUtils {
  static async copyDir(source: string, target: string): Promise<void> {
    if (!fs.existsSync(target)) {
      fs.mkdirSync(target, { recursive: true });
    }
    const entries = fs.readdirSync(source, { withFileTypes: true });
    for (const entry of entries) {
      const sourcePath = path.join(source, entry.name);
      const targetPath = path.join(target, entry.name);
      if (entry.isDirectory()) {
        await FileUtils.copyDir(sourcePath, targetPath);
      } else {
        fs.copyFileSync(sourcePath, targetPath);
      }
    }
  }

  static async cleanDir(dirPath: string): Promise<void> {
    if (!fs.existsSync(dirPath)) {
      return;
    }
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        fs.rmSync(fullPath, { recursive: true, force: true });
      } else {
        fs.unlinkSync(fullPath);
      }
    }
  }

  static async syncSingleFile(sourceFilePath: string, deployDir: string, workspacePath: string): Promise<void> {
    const relativePath = path.relative(workspacePath, sourceFilePath);
    let targetRelativePath: string;

    if (relativePath.startsWith('src\\main\\java') || relativePath.startsWith('src/main/java')) {
      const classRelative = relativePath
        .replace(/src[/\\]main[/\\]java[/\\]?/, '')
        .replace(/\.java$/, '.class');
      targetRelativePath = path.join('WEB-INF', 'classes', classRelative);
    } else if (relativePath.startsWith('src\\main\\resources') || relativePath.startsWith('src/main/resources')) {
      const resourceRelative = relativePath.replace(/src[/\\]main[/\\]resources[/\\]?/, '');
      targetRelativePath = path.join('WEB-INF', 'classes', resourceRelative);
    } else if (relativePath.startsWith('src\\main\\webapp') || relativePath.startsWith('src/main/webapp')) {
      targetRelativePath = relativePath.replace(/src[/\\]main[/\\]webapp[/\\]?/, '');
    } else {
      targetRelativePath = relativePath;
    }

    const targetPath = path.join(deployDir, targetRelativePath);
    const targetDir = path.dirname(targetPath);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    fs.copyFileSync(sourceFilePath, targetPath);
  }

  static async syncClassFile(classFilePath: string, deployDir: string, workspacePath: string): Promise<void> {
    const targetClassesDir = path.join(workspacePath, 'target', 'classes');
    const relativePath = path.relative(targetClassesDir, classFilePath);
    const targetPath = path.join(deployDir, 'WEB-INF', 'classes', relativePath);
    const targetDir = path.dirname(targetPath);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    fs.copyFileSync(classFilePath, targetPath);
  }

  static isBundledTomcatCopied(globalStoragePath: string): boolean {
    const tomcatDir = path.join(globalStoragePath, 'tomcat9');
    return fs.existsSync(path.join(tomcatDir, 'bin', 'catalina.bat'));
  }

  static async copyBundledTomcat(extensionPath: string, globalStoragePath: string): Promise<string> {
    const sourceDir = path.join(extensionPath, 'resources', 'tomcat9');
    const targetDir = path.join(globalStoragePath, 'tomcat9');
    if (!fs.existsSync(sourceDir)) {
      throw new Error(`内置Tomcat9资源目录不存在: ${sourceDir}`);
    }
    await FileUtils.copyDir(sourceDir, targetDir);
    return targetDir;
  }
}