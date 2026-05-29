# Local Tomcat Launcher

通过配置文件实现 Maven Java 项目在本机 Tomcat 上的快速启动、停止、重启，支持热加载。

## 功能特性

- 🚀 **一键启动** — 内置 Tomcat 9，无需额外安装 Tomcat
- 🛑 **即时停止** — 强制终止进程，立即释放端口
- 🔄 **重启部署** — 清除旧配置 + 释放端口 + 重新 Maven 编译 + 启动
- 🔥 **热加载** — 修改 Java 文件后自动增量编译 + HotSwap，无需重启
- 📂 **资源同步** — JSP、配置文件保存后自动同步到部署目录
- 📊 **日志输出** — Tomcat 日志实时输出到 VSCode 输出通道
- ⚙️ **灵活配置** — 支持自定义端口、contextPath、VM 参数、指定外部 Tomcat

## 前置条件

| 条件 | 说明 |
|------|------|
| **VSCode** | >= 1.85.0 |
| **redhat.java** | >= 1.51.0（VSCode 扩展市场安装） |
| **操作系统** | 仅支持 Windows |
| **项目类型** | 单模块 Maven WAR 项目 |
| **Maven** | 已安装，命令行可访问 `mvn` |

## 快速开始

1. 在 VSCode 中打开一个 Maven Web 项目（包含 pom.xml）
2. 编辑器右上角出现三个按钮：▶ 启动、■ 停止、↻ 重启
3. 点击 **▶ 启动**，等待编译和启动完成
4. 浏览器访问 `http://localhost:8080/dev` 查看项目
5. 修改 Java/JSP 文件保存后，变更自动同步到部署目录

## 配置项

在 VSCode 设置中搜索 `support.tomcat`：

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `support.tomcat.home` | string | `""` | Tomcat 安装路径（空则使用内置 Tomcat 9） |
| `support.tomcat.port` | number | `8080` | HTTP 发布端口 |
| `support.tomcat.debugPort` | number | `5005` | Debug 端口（JPDA） |
| `support.tomcat.contextPath` | string | `"dev"` | 部署名称 / contextPath |
| `support.tomcat.vmOptions` | string | `""` | Tomcat 启动 VM 参数 |

## 使用指南

### 启动

首次点击启动时，插件会自动：
1. 从内置资源复制 Tomcat 9 到插件存储目录
2. 执行 `mvn compile war:exploded` 编译项目
3. 以 JPDA debug 模式启动 Tomcat（支持 HotSwap）
4. 将项目部署为 Exploded WAR

再次启动时，如果已有编译输出则直接启动（跳过 Maven 编译）。

### 停止

点击停止按钮，插件调用 `taskkill /F /T /PID` 强制终止 Tomcat 进程树。

### 重启

点击重启按钮，插件会：
1. 强制终止 Tomcat 进程
2. 释放 HTTP 和 Debug 端口
3. 清空 CATALINA_BASE 配置目录和 Maven target 目录
4. 重新执行 Maven 全量编译
5. 启动 Tomcat

### 热加载

Tomcat 运行期间，保存文件时自动触发：

| 文件类型 | 处理方式 |
|---------|----------|
| `.java` | redhat.java 增量编译 → class 文件复制到 `WEB-INF/classes` → JVM HotSwap |
| `.jsp` / 静态资源 | 直接复制到部署目录 |
| `pom.xml` | Maven 重新编译 → 更新 `WEB-INF/lib` |

## 项目结构

```text
src/
├── commands/       # 命令层（启动/停止/重启）
├── services/       # 服务层（Tomcat/Maven/部署/热加载）
├── utils/          # 工具层（进程/文件/端口/配置）
├── ui/             # UI层（状态栏/输出通道/按钮）
└── extension.ts    # 插件入口
resources/
└── tomcat9/        # 内置 Tomcat 9 运行时
```

## 输出通道

插件创建名为 `tomcat` 的输出通道，实时显示：
- Maven 编译日志
- Tomcat 启动日志（catalina/stdout）
- localhost 访问日志
- 热加载操作日志

## 常见问题

**Q: 插件不出现按钮？**  
A: 检查是否满足激活条件：Windows 环境、redhat.java >= 1.51.0、项目包含 pom.xml。

**Q: 端口被占用？**  
A: 更改 `support.tomcat.port` 配置项，或点击重启按钮自动释放端口。

**Q: HotSwap 不生效？**  
A: 仅方法体修改支持 HotSwap，新增方法/字段等结构性变更需点击重启。

**Q: 能否使用外部 Tomcat？**  
A: 配置 `support.tomcat.home` 指向已安装的 Tomcat 目录即可。

## 许可证

MIT