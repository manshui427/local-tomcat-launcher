# Service Interface Contract: local-tomcat-launcher

服务层接口契约，定义各Service模块的公共接口和调用约定。
遵循宪法V原则：模块间通过明确接口通信，禁止隐式耦合。

## TomcatService

Tomcat生命周期管理服务。

### start(workspacePath: string): Promise<TomcatInstance>

启动Tomcat实例。

- **Precondition**: status === IDLE, 端口未被占用
- **Process**: 配置CATALINA_BASE → spawn catalina.bat run → 追踪PID → pipe日志到输出通道
- **Postcondition**: status === RUNNING, 日志持续输出到channel
- **Error**: 端口占用 → 提示用户; 启动失败 → status=ERROR

### stop(instance: TomcatInstance): Promise<void>

停止Tomcat实例。

- **Precondition**: status === RUNNING 或 STARTING
- **Process**: 获取进程树PID → taskkill /F /T /PID → 清理PID引用
- **Postcondition**: status === IDLE, 端口释放
- **Error**: 进程已不存在 → 正常处理(设置IDLE)

### refresh(instance: TomcatInstance): Promise<TomcatInstance>

刷新部署（清除+重新编译+重启）。

- **Precondition**: 任意状态
- **Process**: 清除deployDir → kill端口占用进程 → Maven编译 → 启动Tomcat
- **Postcondition**: status === RUNNING, 新的部署内容

### getStatus(workspacePath: string): TomcatStatus

获取当前Tomcat状态。

- **Return**: IDLE | COMPILING | STARTING | RUNNING | ERROR

## MavenService

Maven编译服务。

### compile(workspacePath: string, outputChannel: OutputChannel): Promise<CompileResult>

执行Maven编译(war:exploded)。

- **Precondition**: workspacePath下存在pom.xml
- **Process**: spawn mvn compile war:exploded → pipe输出到channel
- **Return**: { success: boolean, deployPath: string, output: string }
- **Error**: mvn命令不存在 → 提示"Maven未安装"; 编译失败 → success=false

### CompileResult

```typescript
interface CompileResult {
  success: boolean;       // 编译是否成功
  deployPath: string;     // Exploded WAR产出路径
  output: string;         // 编译输出日志
  duration: number;       // 编译耗时(ms)
}
```

## DeployService

部署目录管理服务。

### initDeployDir(contextPath: string, globalStoragePath: string): Promise<string>

初始化Exploded WAR部署目录。

- **Process**: 创建 globalStorage/{contextPath}/ 目录结构
- **Return**: 部署目录绝对路径

### cleanDeployDir(deployDir: string): Promise<void>

清除部署目录下所有内容。

- **Process**: 递归删除部署目录内容，保留目录本身

### syncFromCompile(sourcePath: string, deployDir: string): Promise<void>

将Maven编译产物同步到部署目录。

- **Process**: 复制sourcePath内容到deployDir（覆盖模式）

### syncSingleFile(sourceFilePath: string, deployDir: string, workspacePath: string): Promise<void>

将单个修改文件同步到部署目录。

- **Process**: 计算相对路径 → 复制到部署目录对应位置

## HotReloadService

热加载服务。

### registerFileWatcher(workspacePath: string, instance: TomcatInstance): Disposable

注册文件保存监听器。

- **Process**: onDidSaveTextDocument → 识别文件类型 → 执行对应策略
- **Return**: Disposable (可随deactivate清理)
- **Precondition**: instance.status === RUNNING

### onJavaFileSaved(javaFilePath: string, instance: TomcatInstance): Promise<void>

Java文件保存处理。

- **Process**: 触发redhat.java增量编译 → 等待编译完成 → 复制class到WEB-INF/classes
- **Error**: 编译失败 → 输出通道提示，不中断Tomcat

### onResourceFileSaved(filePath: string, instance: TomcatInstance): Promise<void>

JSP/配置文件保存处理。

- **Process**: 直接复制文件到部署目录对应位置

### onPomFileSaved(workspacePath: string, instance: TomcatInstance): Promise<void>

pom.xml保存处理。

- **Process**: Maven编译更新依赖 → 同步WEB-INF/lib下的jar包变更

## ConfigUtils

配置读取和校验工具。

### getTomcatConfig(workspacePath: string): TomcatConfig

读取workspace的Tomcat配置。

- **Return**: 合并默认值后的完整配置对象

### validateConfig(config: TomcatConfig): ValidationResult

校验配置合法性。

```typescript
interface ValidationResult {
  valid: boolean;
  errors: string[];   // 校验错误列表
}
```

- **Rules**: port 1-65535, debugPort 1-65535, contextPath非空无路径分隔符,
  home若非空需为存在的有效Tomcat目录

## PortUtils

端口检测工具。

### isPortInUse(port: number): Promise<PortInfo>

检测端口是否被占用。

```typescript
interface PortInfo {
  inUse: boolean;
  pid: number | null;  // 占用进程PID
  processName: string | null;
}
```

### killPortProcess(port: number): Promise<void>

终止占用指定端口的进程。

- **Process**: 获取PID → taskkill /F /PID