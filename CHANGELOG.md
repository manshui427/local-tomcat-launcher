# 更新日志

## [0.1.1] - 2026-06-09

### 修复

- **输出通道立即弹出** — 点击启动/停止/重启按钮后，输出通道立即显示，不再等待编译完成
- **localhost 日志正确输出** — 通过修改 Tomcat 的 `logging.properties`，让 localhost 日志同时输出到控制台，实时显示应用错误信息
- **热加载范围限定** — 热加载仅监听 `src/main/java`、`src/main/resources`、`src/main/webapp` 和根目录 `pom.xml`，忽略 `src/test`、`target` 等无关路径
- **JRE_HOME 使用 redhat.java 配置的 JDK** — 按 `java.configuration.runtimes`(default=true) → `java.jdt.ls.java.home` → `java.home` → 系统 `JAVA_HOME` 的优先级自动选择 JDK
- **Maven/Tomcat 中文输出乱码** — 设置 `JAVA_TOOL_OPTIONS=-Dfile.encoding=UTF-8`，强制 Java 进程使用 UTF-8 编码
- **标题栏按钮紧密排列** — 三个按钮的 priority 改为 1、1.01、1.02，防止其他扩展按钮插入中间

### 变更

- 移除基于 `FileSystemWatcher` 的日志文件监听方案，改为通过 `logging.properties` 让 localhost 日志直接输出到 stdout
- `registerCommands()` 新增 `outputChannelManager` 参数，在各命令入口调用 `show(true)`
- `ConfigUtils` 新增 `getJavaHome()` 方法，支持多级 JDK 路径回退
- `hotReloadService.handleFileSave()` 新增路径范围过滤
- `tomcatService.startTomcatProcess()` 新增 `JRE_HOME` 和 `JAVA_TOOL_OPTIONS` 环境变量设置

## [0.1.0] - 2026-05-29

### 新增

- 编辑器标题栏启动、停止、重启按钮
- 状态栏实时显示 Tomcat 运行状态
- 内置 Tomcat 9 运行时支持
- 自动检测运行条件（Windows、redhat.java、Maven 项目）
- 可配置端口、contextPath、VM 参数、外部 Tomcat 路径
- Maven war:exploded 全量编译支持
- CATALINA_BASE 隔离部署架构
- conf/Catalina/localhost context.xml 自动配置 docBase
- server.xml 自动修改端口
- JVM JPDA debug 模式启动（支持 HotSwap）
- redhat.java 增量编译集成
- Java 类 HotSwap 热加载
- JSP / 配置 / 静态资源直接同步
- pom.xml 变更后 Maven 重新编译 + jar 包更新
- Tomcat 未运行时文件同步到 Maven 输出目录
- 强制进程终止（taskkill /F /T）
- 端口占用检测与自动释放
- 重启操作清除 CATALINA_BASE 并强制 Maven 重新编译
- tomcat 输出通道实时日志（catalina + localhost）
- 重复启动时先停止再启动

### 已知限制

- 仅支持单模块 Maven WAR 项目
- 仅支持 Windows 环境
- 需 redhat.java >= 1.51.0