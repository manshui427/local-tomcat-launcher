/**
 * 常量定义 - 插件命令ID、配置键名、默认值等
 */

// 命令ID
export const COMMAND_START = 'local-tomcat-launcher.start';
export const COMMAND_STOP = 'local-tomcat-launcher.stop';
export const COMMAND_RESTART = 'local-tomcat-launcher.restart';
export const COMMAND_REFRESH = 'local-tomcat-launcher.refresh';

// 配置键名前缀
export const CONFIG_PREFIX = 'support.tomcat';

// 输出通道名称
export const OUTPUT_CHANNEL_NAME = 'Tomcat';

/**
 * 端口信息接口
 */
export interface PortInfo {
  inUse: boolean;
  pid: number | null;
}

// 状态栏显示文字
export const STATUS_TEXT: Record<TomcatStatus, string> = {
  IDLE: '$(circle-slash) 已停止',
  STARTING: '$(loading~spin) 启动中...',
  RUNNING: '$(circle-check) 运行中',
  ERROR: '$(error) 错误',
};

// 状态栏颜色
export const STATUS_COLOR: Record<TomcatStatus, string> = {
  IDLE: '#888888',
  STARTING: '#FFCC00',
  RUNNING: '#4CAF50',
  ERROR: '#F44336',
};

// 状态栏Tooltip
export const STATUS_TOOLTIP: Record<TomcatStatus, string> = {
  IDLE: 'Tomcat未启动',
  STARTING: '正在启动Tomcat',
  RUNNING: 'Tomcat运行中',
  ERROR: 'Tomcat启动失败',
};

/**
 * Tomcat运行状态枚举
 */
export enum TomcatStatus {
  IDLE = 'IDLE',
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
