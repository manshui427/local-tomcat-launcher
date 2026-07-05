# 更新日志

## [0.1.3] - 2026-07-04

### 重构

- **热加载架构完全重写** — 用 `FileSystemWatcher` 替换 `onDidSaveTextDocument`，现在能监听所有文件变更（不限于编辑器内保存），包括外部工具修改、文件新建和删除

### 新增

- **三路独立文件监听** — `src/main/**`（resources/webapp 同步 + java 增量编译）、`target/classes/**`（同步到部署目录）、`pom.xml`（更新依赖 jar 包）
- **防抖与去重** — pom.xml 5 秒防抖、java/resources/webapp 1 秒防抖（Map 去重，同一文件多次变更只保留最新操作）、target/classes 无防抖立即同步
- **文件夹删除同步** — 删除 `src/main/resources`、`src/main/webapp` 或 `target/classes` 下的文件夹时，部署目录中对应文件夹同步删除
- **按钮防连点保护** — 启动/停止/重启三个按钮加入 `isProcessing` 防护，执行期间再次点击会被忽略并提示
- **Java 文件变更解耦** — java 文件变更仅触发 JDT 增量编译，不再直接同步 .class 文件，改由 `target/classes` 监听器负责同步，职责分离更清晰

### 变更

- `hotReloadService.ts` 完全重写，新增 `queueSrcMainChange`、`processSrcMainChanges`、`onClassesFileEvent`、`queuePomChange`、`processPomChange`、`syncResourceToDeploy`、`deleteFromDeploy`、`mapSrcToDeployRelative` 等方法
- `registerCommands.ts` 重写，新增 `withGuard` 高阶函数包装三个命令
- `README.md` 移除所有英文翻译，更新热加载章节描述新的监听器架构
- pom.xml 依赖更新时增加源路径与目标路径一致性检查，避免同路径先删后复制的问题

## [0.1.2] - 2026-06-09

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

## [0.1.1] - 2026-05-29

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