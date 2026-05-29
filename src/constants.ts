/**
 * 常量定义 - 插件命令ID、配置键名、默认值等
 */

// 命令ID
export const COMMAND_START = 'local-tomcat-launcher.start';
export const COMMAND_STOP = 'local-tomcat-launcher.stop';
export const COMMAND_RESTART = 'local-tomcat-launcher.restart';

// 配置键名前缀
export const CONFIG_PREFIX = 'support.tomcat';
export const CONFIG_HOME = `${CONFIG_PREFIX}.home`;
export const CONFIG_PORT = `${CONFIG_PREFIX}.port`;
export const CONFIG_DEBUG_PORT = `${CONFIG_PREFIX}.debugPort`;
export const CONFIG_CONTEXT_PATH = `${CONFIG_PREFIX}.contextPath`;
export const CONFIG_VM_OPTIONS = `${CONFIG_PREFIX}.vmOptions`;

// 配置默认值
export const DEFAULT_PORT = 8080;
export const DEFAULT_DEBUG_PORT = 5005;
export const DEFAULT_CONTEXT_PATH = 'dev';
export const DEFAULT_VM_OPTIONS = '';

// 输出通道名称
export const OUTPUT_CHANNEL_NAME = 'tomcat';

// redhat.java插件ID和最低版本
export const REDHAT_JAVA_EXTENSION_ID = 'redhat.java';
export const REDHAT_JAVA_MIN_VERSION = '1.51.0';

// 内置Tomcat9资源目录名
export const BUNDLED_TOMCAT_DIR = 'tomcat9';

// redhat.java增量编译命令
export const JAVA_WORKSPACE_COMPILE_COMMAND = 'java.workspace.compile';

// 文件扩展名分类
export const JAVA_EXTENSIONS = ['.java'];
export const JSP_EXTENSIONS = ['.jsp'];
export const CONFIG_EXTENSIONS = ['.xml', '.properties', '.yml', '.yaml'];
export const POM_FILENAME = 'pom.xml';

// 状态栏显示文字
export const STATUS_TEXT: Record<TomcatStatus, string> = {
  IDLE: '$(circle-slash) 已停止',
  COMPILING: '$(sync~spin) 编译中...',
  STARTING: '$(loading~spin) 启动中...',
  RUNNING: '$(circle-check) 运行中',
  ERROR: '$(error) 错误',
};

// 状态栏颜色
export const STATUS_COLOR: Record<TomcatStatus, string> = {
  IDLE: '#888888',
  COMPILING: '#FFCC00',
  STARTING: '#FFCC00',
  RUNNING: '#4CAF50',
  ERROR: '#F44336',
};

// 状态栏Tooltip
export const STATUS_TOOLTIP: Record<TomcatStatus, string> = {
  IDLE: 'Tomcat未启动 - 点击启动',
  COMPILING: '正在Maven编译项目',
  STARTING: '正在启动Tomcat',
  RUNNING: 'Tomcat运行中 - 点击停止',
  ERROR: 'Tomcat启动/编译失败 - 查看输出',
};

// 启动超时时间(ms)
export const START_TIMEOUT = 30000;

/**
 * Tomcat运行状态枚举
 */
export enum TomcatStatus {
  IDLE = 'IDLE',
  COMPILING = 'COMPILING',
  STARTING = 'STARTING',
  RUNNING = 'RUNNING',
  ERROR = 'ERROR',
}

/**
 * 热加载策略枚举
 */
export enum HotLoadStrategy {
  HOT_SWAP = 'HOT_SWAP',
  DIRECT_SYNC = 'DIRECT_SYNC',
  DEPENDENCY_UPDATE = 'DEPENDENCY_UPDATE',
  NONE = 'NONE',
}

/**
 * Tomcat配置接口
 */
export interface TomcatConfig {
  home: string;
  port: number;
  debugPort: number;
  contextPath: string;
  vmOptions: string;
}

/**
 * Tomcat实例接口
 */
export interface TomcatInstance {
  workspacePath: string;
  processId: number | null;
  childProcessId: number | null;
  status: TomcatStatus;
  port: number;
  debugPort: number;
  contextPath: string;
  tomcatHome: string;
  /** CATALINA_BASE目录，位于插件存储路径下以contextPath命名 */
  catalinaBase: string;
  vmOptions: string;
  /** docBase部署目录，Maven编译产物写入此处 */
  deployDir: string;
  /** Maven编译输出目录（target/xxx） */
  compileOutputDir: string;
  startTime: Date | null;
}

/**
 * Maven编译结果接口
 */
export interface CompileResult {
  success: boolean;
  deployPath: string;
  output: string;
  duration: number;
}

/**
 * 端口信息接口
 */
export interface PortInfo {
  inUse: boolean;
  pid: number | null;
  processName: string | null;
}

/**
 * 配置校验结果接口
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}