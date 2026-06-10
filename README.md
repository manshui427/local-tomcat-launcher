# Local Tomcat Launcher

Lightweight Tomcat server manager for VSCode — one-click start/stop/restart, built-in Tomcat 9, Maven build, hot-reload, and JPDA remote debug.

VSCode 中快速启动/停止/重启本机 Tomcat，支持 Maven 编译和热加载。

## 功能特性 / Features

- 🚀 **一键启动 / One-click Start** — 内置 Tomcat 9，无需额外安装 Tomcat (Bundled Tomcat 9, no separate install needed)
- 🛑 **即时停止 / Instant Stop** — 强制终止进程，立即释放端口 (Force kill process, immediate port release)
- 🔄 **重启部署 / Restart & Redeploy** — 清除旧配置 + 释放端口 + 重新 Maven 编译 + 启动 (Clean config + release port + Maven rebuild + start)
- 🔥 **热加载 / Hot-Reload** — 修改 Java 文件后自动增量编译 + HotSwap，无需重启 (Auto incremental compile + JVM HotSwap on save)
- 📂 **资源同步 / Resource Sync** — JSP、配置文件保存后自动同步到部署目录 (Auto sync JSP, config files to deploy dir)
- 📊 **日志输出 / Live Logs** — Tomcat 日志（catalina、localhost）实时输出到 VSCode 输出通道 (Real-time catalina & localhost logs in output channel)
- ☕ **JDK 自动识别 / Auto JDK Detection** — 自动使用 redhat.java 配置的 JDK 版本启动 Tomcat (Uses JDK from redhat.java extension config)
- ⚙️ **灵活配置 / Flexible Config** — 支持自定义端口、contextPath、VM 参数、指定外部 Tomcat (Custom port, contextPath, VM options, external Tomcat)

## 前置条件 / Prerequisites

| 条件 | 说明 |
|------|------|
| **VSCode** | >= 1.85.0 |
| **redhat.java** | >= 1.51.0（VSCode 扩展市场安装） |
| **操作系统** | 仅支持 Windows |
| **项目类型** | 单模块 Maven WAR 项目 |
| **Maven** | 已安装，命令行可访问 `mvn` |

## 快速开始 / Quick Start

1. 在 VSCode 中打开一个 Maven Web 项目（包含 `pom.xml`）
2. 编辑器右上角出现三个紧密排列的按钮：▶ 启动、■ 停止、↻ 重启
3. 点击 **▶ 启动**，输出通道立即弹出，等待编译和启动完成
4. 浏览器访问 `http://localhost:8080/dev` 查看项目
5. 修改 `src/main/java`、`src/main/resources`、`src/main/webapp` 下的文件保存后，变更自动热加载

## 配置项 / Configuration

在 VSCode 设置中搜索 `support.tomcat`：

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `support.tomcat.home` | string | `""` | Tomcat 安装路径（空则使用内置 Tomcat 9） |
| `support.tomcat.port` | number | `8080` | HTTP 发布端口 |
| `support.tomcat.debugPort` | number | `5005` | Debug 端口（JPDA） |
| `support.tomcat.contextPath` | string | `"dev"` | 部署名称 / contextPath |
| `support.tomcat.vmOptions` | string | `""` | Tomcat 启动 VM 参数 |

## 使用指南 / Usage

### 启动 / Start

首次点击启动时，插件会自动：

1. 从内置资源复制 Tomcat 9 到插件存储目录
2. 执行 `mvn compile war:exploded` 编译项目
3. 以 JPDA debug 模式启动 Tomcat（支持 HotSwap）
4. 将项目部署为 Exploded WAR

再次启动时，如果已有编译输出则直接启动（跳过 Maven 编译）。

> 点击启动按钮后，输出通道会立即弹出，无需等待编译完成即可看到日志。

### JDK 版本 / JDK Version

Tomcat 启动时自动使用 redhat.java 扩展配置的 JDK，查找优先级：

1. `java.configuration.runtimes` 中 `default: true` 的路径
2. `java.jdt.ls.java.home`
3. `java.home`（已弃用）
4. 系统 `JAVA_HOME` / `JRE_HOME` 环境变量

### 停止 / Stop

点击停止按钮，插件调用 `taskkill /F /T /PID` 强制终止 Tomcat 进程树。

### 重启 / Restart

点击重启按钮，插件会：

1. 强制终止 Tomcat 进程
2. 释放 HTTP 和 Debug 端口
3. 清空 CATALINA_BASE 配置目录和 Maven target 目录
4. 重新执行 Maven 全量编译
5. 启动 Tomcat

### 热加载 / Hot-Reload

Tomcat 运行期间，保存文件时自动触发（仅监听以下路径）：

| 文件路径 | 处理方式 |
|---------|----------|
| `src/main/java/**/*.java` | redhat.java 增量编译 → class 文件复制到 `WEB-INF/classes` → JVM HotSwap |
| `src/main/resources/**/*` | 直接复制到 `WEB-INF/classes` |
| `src/main/webapp/**/*` | 直接复制到部署目录根 |
| `pom.xml` | Maven 重新编译 → 更新 `WEB-INF/lib` |

> `src/test/`、`target/`、`.idea/`、`.vscode/` 等目录下的文件保存不会触发热加载。

## 项目结构

```text
src/
├── commands/           # 命令层（启动/停止/重启）
│   └── registerCommands.ts
├── services/          # 服务层
│   ├── tomcatService.ts    # Tomcat 生命周期管理
│   ├── mavenService.ts     # Maven 编译
│   ├── hotReloadService.ts # 热加载
│   └── deployService.ts    # 部署管理
├── utils/             # 工具层
│   ├── configUtils.ts      # 配置读取（含 JDK 路径解析）
│   ├── fileUtils.ts        # 文件操作
│   ├── portUtils.ts        # 端口检测
│   └── processUtils.ts     # 进程管理
├── ui/                # UI 层
│   ├── outputChannel.ts    # 输出通道
│   ├── statusBar.ts        # 状态栏
│   └── titleBarButtons.ts  # 标题栏按钮
├── constants.ts        # 常量定义
└── extension.ts        # 插件入口
resources/
└── tomcat9/           # 内置 Tomcat 9 运行时
```

## 输出通道 / Output Channel

插件创建名为 `tomcat` 的输出通道，实时显示：

- Maven 编译日志
- Tomcat 启动/运行/停止日志（stdout/stderr）
- localhost 应用错误日志（通过 logging.properties 配置输出到控制台）
- JDK 路径信息（`[JRE_HOME]` 前缀）
- 热加载操作日志

## 常见问题 / FAQ

**Q: 插件不出现按钮？**
A: 检查是否满足激活条件：Windows 环境、redhat.java >= 1.51.0、项目包含 pom.xml。

**Q: 端口被占用？**
A: 更改 `support.tomcat.port` 配置项，或点击重启按钮自动释放端口。

**Q: HotSwap 不生效？**
A: 仅方法体修改支持 HotSwap，新增方法/字段等结构性变更需点击重启。

**Q: 能否使用外部 Tomcat？**
A: 配置 `support.tomcat.home` 指向已安装的 Tomcat 目录即可。

**Q: Tomcat 用的 JDK 不对？**
A: 插件自动读取 `java.configuration.runtimes` 中 `default: true` 的 JDK 路径。在 VSCode 设置中配置 `java.configuration.runtimes` 指定 JDK 版本即可。

**Q: Maven 编译输出乱码？**
A: 插件已设置 `JAVA_TOOL_OPTIONS=-Dfile.encoding=UTF-8`，Maven 和 Tomcat 输出均使用 UTF-8 编码。

## 许可证 / License

MIT

---

**Keywords:** tomcat, tomcat launcher, tomcat server, java web, servlet, jsp, maven, war, hot-reload, hot swap, debug, jpda, local server, deploy, spring, webapp, java development, vscode tomcat