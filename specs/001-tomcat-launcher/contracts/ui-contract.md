# UI Contract: local-tomcat-launcher

本插件为VSCode Extension，其"接口"是VSCode UI元素和命令。
以下是用户可交互的所有界面契约定义。

## Commands (命令)

### 启动命令

- **Command ID**: `local-tomcat-launcher.start`
- **Title**: "启动Tomcat"
- **Icon**: play图标 (light: ▶, dark: ▶)
- **Menu Location**: editor/title → group: navigation
- **When Condition**: `resourceExtname == .java || resourceExtname == .jsp || resourceFilename == pom.xml`
- **Behavior**:
  - 若Tomcat未运行 → 执行Maven编译 → 启动Tomcat → 部署项目
  - 若Tomcat已运行 → 提示"Tomcat已在运行"
  - 若编译失败 → 状态栏显示"错误"，输出通道显示错误信息
- **Output**: 更新状态栏为 COMPILING → STARTING → RUNNING

### 停止命令

- **Command ID**: `local-tomcat-launcher.stop`
- **Title**: "停止Tomcat"
- **Icon**: stop图标 (light: ■, dark: ■)
- **Menu Location**: editor/title → group: navigation
- **When Condition**: 同启动命令
- **Behavior**:
  - 若Tomcat运行中 → 强制终止进程(taskkill /F /T /PID)
  - 若Tomcat未运行 → 提示"Tomcat未在运行"
- **Output**: 更新状态栏为 IDLE

### 刷新命令

- **Command ID**: `local-tomcat-launcher.refresh`
- **Title**: "刷新Tomcat"
- **Icon**: refresh图标 (light: ↻, dark: ↻)
- **Menu Location**: editor/title → group: navigation
- **When Condition**: 同启动命令
- **Behavior**:
  - 若Tomcat运行中 → 清除部署目录 → kill端口进程 → 重新编译 → 重启
  - 若Tomcat未运行 → 清除部署目录 → Maven编译 → 启动Tomcat
- **Output**: 更新状态栏为 COMPILING → STARTING → RUNNING

## Status Bar Item (状态栏)

- **Alignment**: Left
- **Priority**: 50 (靠左显示)
- **Command**: 点击时执行 `local-tomcat-launcher.start`(IDLE状态)
  或 `local-tomcat-launcher.stop`(RUNNING状态)

| Status | Text | Tooltip | Color |
|--------|------|---------|-------|
| IDLE | "$(circle-slash) 已停止" | "Tomcat未启动 - 点击启动" | #888888 |
| COMPILING | "$(sync~spin) 编译中..." | "正在Maven编译项目" | #FFCC00 |
| STARTING | "$(loading~spin) 启动中..." | "正在启动Tomcat" | #FFCC00 |
| RUNNING | "$(circle-check) 运行中" | "Tomcat运行中 - 点击停止" | #4CAF50 |
| ERROR | "$(error) 错误" | "Tomcat启动/编译失败 - 查看输出" | #F44336 |

## Output Channel (输出通道)

- **Channel Name**: "tomcat"
- **Content**:
  - Maven编译输出(stdout/stderr)
  - Tomcat进程输出(stdout/stderr)
  - Tomcat catalina日志文件内容(实时追加)
  - Tomcat localhost日志文件内容(实时追加)
  - 热加载操作日志(文件同步/编译触发)
  - 错误和异常信息

## Configuration (配置项)

配置前缀: `support.tomcat`

| Key | Type | Default | Scope | Description |
|-----|------|---------|-------|-------------|
| home | string | "" | workspace | Tomcat安装路径(空则使用内置Tomcat9) |
| port | number | 8080 | workspace | Tomcat HTTP发布端口 |
| debugPort | number | 5005 | workspace | Tomcat Debug端口(JPDA) |
| contextPath | string | "dev" | workspace | Tomcat部署名称(Exploded WAR目录名) |
| vmOptions | string | "" | workspace | Tomcat启动时使用的VM参数(如-Xms512m -Xmx1024m) |

## Extension Activation (激活条件)

**activationEvents**:
- `onLanguage:java`
- `workspaceContains:pom.xml`

**activate函数内检查**:
1. `process.platform === 'win32'` → 否则提示"仅支持Windows"并跳过注册
2. `vscode.extensions.getExtension('redhat.java')` 版本 >= 1.51.0 → 否则提示"需安装redhat.java >= 1.51.0"
3. workspace根目录存在pom.xml → 否则提示"需要Maven项目"
4. 项目为单模块(根目录pom.xml无parent模块引用) → 否则提示"仅支持单模块项目"

**deactivate函数**:
- 终止当前workspace的Tomcat进程(如有)
- 清理文件监听器
- 销毁状态栏和输出通道