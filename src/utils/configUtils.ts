import * as vscode from 'vscode';
import { TomcatConfig, ValidationResult, CONFIG_PREFIX, DEFAULT_PORT, DEFAULT_DEBUG_PORT, DEFAULT_CONTEXT_PATH, DEFAULT_VM_OPTIONS } from '../constants';
import * as fs from 'fs';
import * as path from 'path';

/**
 * 配置读取和校验工具
 */
export class ConfigUtils {
  /**
   * 读取workspace的Tomcat配置，合并默认值
   */
  static getTomcatConfig(_workspacePath: string): TomcatConfig {
    const config = vscode.workspace.getConfiguration(CONFIG_PREFIX);
    return {
      home: config.get<string>('home', ''),
      port: config.get<number>('port', DEFAULT_PORT),
      debugPort: config.get<number>('debugPort', DEFAULT_DEBUG_PORT),
      contextPath: config.get<string>('contextPath', DEFAULT_CONTEXT_PATH),
      vmOptions: config.get<string>('vmOptions', DEFAULT_VM_OPTIONS),
    };
  }

  /**
   * 校验配置合法性
   */
  static validateConfig(config: TomcatConfig): ValidationResult {
    const errors: string[] = [];
    if (config.port < 1 || config.port > 65535) {
      errors.push(`发布端口${config.port}不在有效范围(1-65535)内`);
    }
    if (config.debugPort < 1 || config.debugPort > 65535) {
      errors.push(`Debug端口${config.debugPort}不在有效范围(1-65535)内`);
    }
    if (config.port === config.debugPort) {
      errors.push('发布端口和Debug端口不能相同');
    }
    if (!config.contextPath || config.contextPath.trim() === '') {
      errors.push('contextPath不能为空');
    }
    if (config.contextPath.includes('/') || config.contextPath.includes('\\')) {
      errors.push('contextPath不能包含路径分隔符');
    }
    if (config.home) {
      if (!fs.existsSync(config.home)) {
        errors.push(`指定的Tomcat路径不存在: ${config.home}`);
      } else if (!fs.existsSync(path.join(config.home, 'bin', 'catalina.bat'))) {
        errors.push(`指定路径不是有效的Tomcat目录: ${config.home}`);
      }
    }
    return { valid: errors.length === 0, errors };
  }

  static isMavenProject(workspacePath: string): boolean {
    return fs.existsSync(path.join(workspacePath, 'pom.xml'));
  }

  static isSingleModuleProject(workspacePath: string): boolean {
    const pomPath = path.join(workspacePath, 'pom.xml');
    if (!fs.existsSync(pomPath)) {
      return false;
    }
    const pomContent = fs.readFileSync(pomPath, 'utf-8');
    return !pomContent.includes('<modules>') && !pomContent.includes('<module>');
  }
}