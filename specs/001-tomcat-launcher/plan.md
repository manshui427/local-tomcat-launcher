# Implementation Plan: local-tomcat-launcher

**Branch**: `001-tomcat-launcher` | **Date**: 2026-05-29 | **Spec**: specs/001-tomcat-launcher/spec.md

**Input**: Feature specification from `/specs/001-tomcat-launcher/spec.md`

## Summary

构建VSCode插件local-tomcat-launcher，通过配置文件实现Maven Java项目在本机Tomcat上的
快速启动/停止/刷新操作。内置Tomcat9运行时，以Exploded WAR格式部署单模块WAR项目，
支持JVM Hot Swap级别的Java热替换、JSP/配置文件直接同步、pom.xml依赖更新。
per-workspace单例Tomcat实例管理，标题栏按钮操作，状态栏进度反馈。

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode)

**Primary Dependencies**: VSCode Extension API (vscode模块),
@vscode/vsce (打包工具), Apache Tomcat 9 (内置运行时)

**Storage**: 文件系统 - Exploded WAR目录结构、Tomcat配置目录、
插件全局存储目录（contextPath为名的部署目录）

**Testing**: @vscode/test-electron (VSCode官方插件测试框架)

**Target Platform**: Windows (VSCode桌面版)

**Project Type**: VSCode Extension (桌面插件)

**Performance Goals**: Tomcat启动≤10s, Java热加载≤5s,
JSP/配置同步≤2s

**Constraints**: 仅Windows环境激活; 依赖redhat.java >= 1.51.0;
仅单模块Maven WAR项目; per-workspace单例Tomcat进程

**Scale/Scope**: 单开发者单workspace场景, 单Tomcat实例

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Gate | Status |
|-----------|------|--------|
| I. 官方推荐优先 | 使用VSCode官方API注册命令/配置/状态栏/输出通道 | ✅ PASS |
| II. 清晰注释 | 所有代码和文档包含中文注释 | ✅ PASS |
| III. 最佳实践 | TypeScript strict, 异步正确处理, 无any | ✅ PASS |
| IV. 简洁设计 | 三层架构(命令→服务→工具), 无过度抽象 | ✅ PASS |
| V. 可维护代码 | 模块职责清晰, 分层组织, 明确接口 | ✅ PASS |

## Project Structure

### Documentation (this feature)

```text
specs/001-tomcat-launcher/
├── plan.md              # 本文件
├── research.md          # Phase 0 技术调研
├── data-model.md        # Phase 1 数据模型
├── quickstart.md        # Phase 1 快速入门
├── contracts/           # Phase 1 接口契约
└── tasks.md             # Phase 2 任务列表(由/speckit.tasks生成)
```

### Source Code (repository root)

```text
src/
├── commands/              # 命令层 - VSCode命令注册和处理
│   ├── startCommand.ts    # 启动命令
│   ├── stopCommand.ts     # 停止命令
│   ├── refreshCommand.ts  # 刷新命令
│   └── registerCommands.ts # 命令注册入口
├── services/              # 服务层 - 核心业务逻辑
│   ├── tomcatService.ts   # Tomcat生命周期管理(启动/停止/状态)
│   ├── mavenService.ts    # Maven编译服务
│   ├── deployService.ts   # 部署管理(Exploded WAR目录操作)
│   └── hotReloadService.ts # 热加载服务(文件监听+同步策略)
├── utils/                 # 工具层 - 底层辅助功能
│   ├── processUtils.ts    # 进程管理(启动/kill Java进程)
│   ├── fileUtils.ts       # 文件操作(复制/同步/清理)
│   ├── portUtils.ts       # 端口检测和释放
│   └── configUtils.ts     # 配置读取和校验
├── ui/                    # UI层 - 界面元素
│   ├── statusBar.ts       # 状态栏管理
│   ├── titleBarButtons.ts # 标题栏按钮注册
│   └── outputChannel.ts   # 输出通道(tomcat日志)
├── constants.ts           # 常量定义(命令ID、配置键名等)
└── extension.ts           # 插件入口(激活/销毁)

resources/
└── tomcat9/               # 内置Tomcat9运行时

test/
├── suite/
│   ├── services/          # 服务层单元测试
│   ├── utils/             # 工具层单元测试
│   └── integration/       # 集成测试

package.json               # 插件清单(命令、配置、激活条件)
tsconfig.json              # TypeScript配置(strict mode)
.vscodeignore              # 打包排除列表
```

**Structure Decision**: 采用VSCode Extension标准目录结构，按宪法V原则
分层组织：命令层(commands) → 服务层(services) → 工具层(utils)。
UI层(ui)作为命令层和服务层的桥梁，负责界面元素管理。
内置Tomcat9放置在resources目录中随插件打包。

## Complexity Tracking

无宪法违反需论证。所有设计决策遵循5项原则。