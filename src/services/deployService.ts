import * as fs from 'fs';
import * as path from 'path';
import { TomcatInstance } from '../constants';
import { FileUtils } from '../utils/fileUtils';

/**
 * 部署管理服务 - Exploded WAR目录的初始化、清理、同步操作
 */
export class DeployService {
  static async initDeployDir(contextPath: string, globalStoragePath: string): Promise<string> {
    const deployDir = path.join(globalStoragePath, contextPath);
    if (!fs.existsSync(deployDir)) {
      fs.mkdirSync(deployDir, { recursive: true });
    }
    const webInfDir = path.join(deployDir, 'WEB-INF');
    const classesDir = path.join(webInfDir, 'classes');
    const libDir = path.join(webInfDir, 'lib');
    for (const dir of [classesDir, libDir]) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
    return deployDir;
  }

  static async cleanDeployDir(deployDir: string): Promise<void> {
    await FileUtils.cleanDir(deployDir);
  }

  static async syncFromCompile(sourcePath: string, deployDir: string): Promise<void> {
    await FileUtils.copyDir(sourcePath, deployDir);
  }

  static async syncSingleFile(sourceFilePath: string, deployDir: string, workspacePath: string): Promise<void> {
    await FileUtils.syncSingleFile(sourceFilePath, deployDir, workspacePath);
  }
}