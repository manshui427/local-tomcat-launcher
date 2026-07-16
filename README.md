# Local Tomcat Launcher

在 VSCode 中一键启动 / 停止 / 重启 / 刷新本机 Tomcat，内置 Tomcat 9，支持 JPDA 远程调试、Maven 构建与文件级热加载。

## 功能特性

- 一键启动 — 内置 Tomcat 9，无需额外安装 Tomcat 即可运行
- 即时停止 — 按 CATALINA_BASE 精准定位并强制终止本实例进程树
- 重启 — 停止后重新启动（加载已经更改的类）
- 刷新 — 停止 + 执行 Maven 打包（`mvn package`）+ 启动，等同于"重新部署"
- JPDA 调试 — 以 `jpda run` 模式启动，开放 Debug 端口供 redhat.java 调试器附加
- 热加载 — 监听 `src/main/**` 与 `pom.xml`，自动增量编译并同步到部署目录，无需重启
- 资源同步 — `resources` / `webapp` 文件变更后自动同步到部署目录
- 日志输出 — Tomcat 启动 / 运行 / 停止日志（stdout / stderr）实时输出到 VSCode 输出通道
- JDK 自动识别 — 自动使用 redhat.java 配置的 JDK 版本启动 Tomcat
- 灵活配置 — 支持自定义端口、contextPath、VM 参数、指定外部 Tomcat

## 建议

### 关闭 `java.autobuild`，使用插件自带的增量编译

插件通过 `java.workspace.compile` 自行触发 JDT 增量编译并同步 `.class` 到部署目录。建议将 VSCode 设置中的 `java.autobuild.enabled` 关闭，避免双重编译造成冲突或延迟。

## 前置条件

| 条件 | 说明 |
|------|------|
| **VSCode** | >= 1.85.0 |
| **redhat.java** | 扩展依赖（自动安装），提供 JDK 识别与 `java.workspace.compile` 增量编译 |
| **操作系统** | 仅支持 Windows |
| **项目类型** | 单模块 Maven Web 项目（含 `pom.xml`，标准目录布局 `src/main/java`、`src/main/resources`、`src/main/webapp`） |
| **Maven** | 已安装，命令行可访问 `mvn` |
| **JDK** | 已安装，并被 redhat.java 识别 |

## 快速开始

1. 在 VSCode 中打开一个 Maven Web 项目（包含 `pom.xml`）。
2. 编辑器右上角出现四个紧密排列的按钮：启动（▶）、停止（■）、重启（↻）、刷新（⟳）。
3. 首次使用前，请确保项目已构建（即 `target/{finalName}` 目录存在）。可点击 **刷新** 按钮，它会自动执行 `mvn package` 后再启动；或自行在终端执行 `mvn package`。
4. 点击 **启动**，输出通道立即弹出，等待部署完成（状态栏变为「运行中」）。
5. 浏览器访问 `http://localhost:{port}/{contextPath}` 查看项目，例如 `http://localhost:8080/dev`。
6. 修改 `src/main/java`、`src/main/resources`、`src/main/webapp` 下的文件并保存后，变更会自动热加载（无需重启）。

## 配置项

在 VSCode 设置中搜索 `support.tomcat`：

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `support.tomcat.home` | string | `""` | Tomcat 安装路径。留空则使用插件内置的 `resources/tomcat9` |
| `support.tomcat.port` | number | `8080` | HTTP 发布端口 |
| `support.tomcat.debugPort` | number | `5005` | Debug 端口（JPDA / JDWP） |
| `support.tomcat.contextPath` | string | `"dev"` | 部署名称 / 上下文路径 |
| `support.tomcat.vmOptions` | string | `""` | Tomcat 启动时的 VM 参数（注入到 `JAVA_OPTS`） |

> 所有配置项为工作区级别（`scope: workspace`），修改后立即对下一次启动生效。

## 使用指南

### 启动（Start）

点击启动按钮时，插件会依次执行：

1. 防连点保护（3 秒）与状态检查（运行中 / 启动中则提示并返回）。
2. 端口检测：检查 HTTP 端口与 Debug 端口是否被占用，占用则报错并停止。
3. 准备 CATALINA_BASE：在插件存储目录（`storageUri/tomcat`）下重建隔离目录（`conf`、`logs`、`temp`、`work`），并复制内置 / 外部 Tomcat 的 `conf` 配置；改写 `server.xml` 的 HTTP 连接器端口与 `shutdown` 端口（设为 `-1`），改写 `logging.properties` 让 `localhost` 日志同时输出到控制台。
4. 写入部署描述符 `conf/Catalina/localhost/{contextPath}.xml`，`docBase` 指向 `target/{finalName}`（该 `finalName` 通过 `mvn help:evaluate` 取得），`reloadable="false"`。
5. 注入环境变量（合并进程环境后启动）：
   - `CATALINA_HOME` — Tomcat 安装目录
   - `CATALINA_BASE` — 隔离实例目录
   - `JPDA_ADDRESS` / `JPDA_TRANSPORT` — Debug 端口与 `dt_socket`
   - `JRE_HOME` — 自动识别的 JDK 路径（见下文「JDK 版本」）
6. 通过 PowerShell 调用 `catalina.bat jpda run` 启动，日志实时输出到通道。

**启动成功判定**：必须等到「本 webapp 真正完成部署」——Tomcat 日志中出现部署完成行（包含 `{contextPath}.xml` 描述符文件名且带有耗时关键字，如「毫秒」/`milliseconds`/`ms`）。连接器端口监听仅作为「服务器已就绪」的门槛，不再单独作为成功信号，因此不会过早报成功。默认超时 180 秒，超时则判定失败并清理进程。

> 注意：启动流程**不会**自动执行 Maven 构建。请确保在启动前 `target/{finalName}` 已存在（使用「刷新」按钮或先 `mvn package`）。

### JDK 版本

Tomcat 启动时自动使用 redhat.java 扩展识别的 JDK，查找优先级：

1. `java.configuration.runtimes` 中 `default: true` 的路径
2. `java.configuration.runtimes` 中第一个有 `path` 的运行时
3. `java.jdt.ls.java.home`
4. 系统环境变量 `JAVA_HOME`
5. 系统环境变量 `JRE_HOME`

若均不可用，输出警告并回退到系统默认 `JRE_HOME` / `JAVA_HOME`。

### 停止（Stop）

点击停止按钮（仅运行中 / 启动中允许）：

1. 标记「本次启动为主动取消」，避免启动过程中的进程退出被误报为「启动失败」。
2. 通过 WMI 查询 `Win32_Process`（`name LIKE 'java%' AND commandLine LIKE '%CATALINA_BASE%'`，路径中的反斜杠已做 WQL 转义）定位本实例的 java 进程，`Stop-Process -Force` 结束。
3. 状态栏回到「已停止」。

### 重启（Restart）

点击重启按钮：若当前运行中 / 启动中，先执行停止，再执行启动。重启会重建 CATALINA_BASE 配置，但不会重新执行 Maven 打包（若需重新打包请使用「刷新」）。

### 刷新（Refresh）

点击刷新按钮：若当前运行中 / 启动中，先执行停止，随后执行 `mvn package -DskipTests -T 1C` 重新打包，再执行启动。等价于「重新构建并部署」。

### 热加载（Hot Reload）

插件注册两个 `FileSystemWatcher` 监听文件变更，经防抖后自动处理，无需重启 Tomcat。

**监听器一：`src/main/**`（防抖 1 秒）**

按类型分组处理：

| 文件路径 | 处理方式 |
|---------|----------|
| `src/main/java/**/*.java`（新增 / 修改） | 调用 `java.workspace.compile` 增量编译；以 `Date.now()` 为 cutoff 扫描 `target/classes`，仅挑选本次新生成 / 变更的 `.class`（`mtimeMs >= cutoff`）同步到 `deployDir/WEB-INF/classes`（按包结构一一对应） |
| `src/main/java/**/*.java`（删除） | 触发增量编译后，清理 `target/classes` 与 `deployDir/WEB-INF/classes` 中对应的 `.class`（含内部类 `Foo$*.class`），避免删除源后残留旧类被 Tomcat 加载 |
| `src/main/resources/**/*` | 同步到 `deployDir/WEB-INF/classes/`（相对 `src/main/resources` 的路径） |
| `src/main/webapp/**/*` | 同步到 `deployDir/` 根（相对 `src/main/webapp` 的路径） |

文件 / 文件夹删除时，部署目录中对应的文件或文件夹会被同步删除。

**监听器二：`pom.xml`（防抖 5 秒）**

`pom.xml` 变更后执行 `mvn dependency:copy-dependencies -DcleanOutputDirectory=true -DoutputDirectory=target/{finalName}/WEB-INF/lib`，将工程依赖复制到部署目录的 `WEB-INF/lib`（复制前会清空旧依赖目录）。

**防抖与去重机制**

- `src/main` 变更：1 秒内多次变更批量处理，同一文件仅保留最新操作（create / change / delete）。
- `pom.xml` 变更：5 秒内多次变更只处理一次。
- 部署目录 `target/{finalName}` 仅在确有变更时解析一次（通过 `mvn help:evaluate` 取 finalName），减少额外 Maven 调用。

> `src/test/`、`target/classes` 之外的目录变更不会直接触发热加载同步；Java 类的最终生效同时依赖 JPDA HotSwap（方法体修改）与 `.class` 文件同步到部署目录。

### 部署目录说明

部署目录为工作区下的 `target/{finalName}`，与 `writeContextXml` 写入的 `docBase` 一致，即 Tomcat 实际服务的目录：

- `target/{finalName}/WEB-INF/classes` — 编译产物与 `resources` 同步目标
- `target/{finalName}/WEB-INF/lib` — 依赖（`pom.xml` 变更后复制）
- `target/{finalName}/...` — `webapp` 资源同步目标

> `finalName` 通过 `mvn help:evaluate -Dexpression=project.build.finalName` 取得；它必须与 `docBase` 一致，否则热加载会同步到错误目录。

## 输出通道

插件创建名为 **`Tomcat`** 的输出通道，实时显示：

- Tomcat 启动 / 运行 / 停止日志（stdout / stderr）
- 部署完成与超时诊断信息
- 热加载操作日志（`[热加载]` 前缀，如「已同步」「已删除类」）
- JDK 路径回退警告

## 调试（JPDA）

Tomcat 以 `jpda run` 启动，开放 `support.tomcat.debugPort`（默认 5005，JDWP，`dt_socket`）。在 VSCode 中创建 Remote JVM Debug 配置指向该端口，即可断点调试；方法体内的修改可通过 HotSwap 直接生效，无需重启。

## 常见问题

**Q: 插件不出现按钮？**
A: 检查是否满足激活条件：Windows 环境、已安装 redhat.java、当前工作区包含 `pom.xml`、为单模块 Maven Web 项目。

**Q: 端口被占用？**
A: 更改 `support.tomcat.port` 或 `support.tomcat.debugPort` 配置项，或点击重启 / 停止释放端口后重试。

**Q: 启动后访问报 404？**
A: 多半是 `target/{finalName}` 不存在或内容过旧。请先 `mvn package`（或点击「刷新」按钮），再启动。

**Q: HotSwap 不生效？**
A: 仅方法体修改支持 HotSwap；新增 / 删除方法、字段等结构性变更需点击「刷新」重新构建并部署。

**Q: 能否使用外部 Tomcat？**
A: 配置 `support.tomcat.home` 指向已安装的 Tomcat 目录即可（留空使用内置 Tomcat 9）。

**Q: Tomcat 用的 JDK 不对？**
A: 插件读取 `java.configuration.runtimes` 中 `default: true` 的 JDK 路径。在 VSCode 设置中配置该项即可指定 JDK 版本。

**Q: 删除某个 Java 类后 Tomcat 仍报错找不到？**
A: 热加载已处理删除场景：删除 `.java` 源后会清理 `target/classes` 与部署目录 `WEB-INF/classes` 中对应的 `.class`（含内部类）。若仍残留，可点击「刷新」彻底重新部署。

## 许可证

MIT
