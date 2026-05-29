# Data Model: local-tomcat-launcher

## Entity Definitions

### TomcatInstance

Tomcat运行时实例，per-workspace单例管理。

| Field | Type | Description | Validation |
|-------|------|-------------|------------|
| workspacePath | string | workspace根目录路径(唯一标识) | 非空，绝对路径 |
| processId | number \| null | Tomcat进程PID | 运行时有值 |
| childProcessId | number \| null | Java子进程PID | 运行时有值 |
| status | TomcatStatus | 当前运行状态 | 见状态转换图 |
| port | number | HTTP发布端口 | 1-65535, 默认8080 |
| debugPort | number | Debug端口 | 1-65535, 默认5005 |
| contextPath | string | 部署名称/路径 | 非空, 默认"dev" |
| tomcatHome | string | Tomcat运行时路径 | 非空绝对路径 |
| vmOptions | string | JVM启动参数 | 可空 |
| deployDir | string | Exploded WAR部署目录路径 | 非空绝对路径 |
| startTime | Date \| null | 启动时间 | 运行时有值 |

### TomcatStatus (枚举)

| Value | Display Text | Color | Description |
|-------|-------------|-------|-------------|
| IDLE | "已停止" | Gray | Tomcat未启动 |
| COMPILING | "编译中..." | Yellow | Maven编译进行中 |
| STARTING | "启动中..." | Yellow | Tomcat正在启动 |
| RUNNING | "运行中" | Green | Tomcat正常运行 |
| ERROR | "错误" | Red | 启动/编译失败 |

### 状态转换图

```text
IDLE ──[启动按钮]──→ COMPILING ──[编译成功]──→ STARTING ──[启动成功]──→ RUNNING
  │                     │                       │                      │
  │                 [编译失败]──→ ERROR          │[启动失败]──→ ERROR     │
  │                     │                       │                      │
  └──[刷新按钮]──→ COMPILING ... (同上流程)        │                  [停止按钮]
  │                                              │                      │
  │                                              └──→ IDLE ──────────────┘
  │
  └──[刷新(RUNNING)]──→ IDLE ──[清理+kill端口]──→ COMPILING ──→ STARTING ──→ RUNNING
```

### TomcatConfig

插件配置参数集，对应VSCode configuration schema。

| Field | Type | Default | Scope | Description |
|-------|------|---------|-------|-------------|
| home | string | "" | workspace | Tomcat路径(空=使用内置) |
| port | number | 8080 | workspace | HTTP发布端口 |
| debugPort | number | 5005 | workspace | Debug端口 |
| contextPath | string | "dev" | workspace | 部署名称 |
| vmOptions | string | "" | workspace | JVM启动参数 |

Validation rules:
- port: MUST 在 1-65535 范围内
- debugPort: MUST 在 1-65535 范围内
- contextPath: MUST 非空，不含路径分隔符
- home: 若非空 MUST 为存在的目录路径，且包含bin/catalina.bat

### DeployDirectory

Exploded WAR部署目录结构。

| Component | Path | Description |
|-----------|------|-------------|
| root | {globalStorage}/{contextPath}/ | 部署根目录 |
| classes | root/WEB-INF/classes/ | Java编译class文件 |
| lib | root/WEB-INF/lib/ | 依赖jar包 |
| webXml | root/WEB-INF/web.xml | Web配置文件 |
| metaInf | root/META-INF/ | 元数据目录 |
| staticResources | root/ | JSP/HTML/CSS等静态资源 |

### FileChangeEvent

文件保存事件分类及对应热加载策略。

| FileType | Extensions | HotLoadStrategy | Action |
|----------|------------|-----------------|--------|
| JAVA | .java | HOT_SWAP | 触发redhat.java增量编译→复制class到WEB-INF/classes |
| JSP | .jsp | DIRECT_SYNC | 直接复制到部署目录根路径 |
| CONFIG | .xml(.非pom), .properties, .yml | DIRECT_SYNC | 直接复制到部署目录对应路径 |
| POM | pom.xml | DEPENDENCY_UPDATE | Maven重新编译→更新WEB-INF/lib下的jar包 |

### HotLoadStrategy (枚举)

| Value | Description |
|-------|-------------|
| HOT_SWAP | JVM Hot Swap: 增量编译+class文件替换, 仅方法体修改 |
| DIRECT_SYNC | 直接文件同步: 复制源文件到部署目录对应位置 |
| DEPENDENCY_UPDATE | 依赖更新: Maven重新编译+jar包更新 |
| NONE | 不执行热加载(Tomcat未运行时) |

## Relationships

```text
TomcatInstance 1:1 ←→ TomcatConfig (每个实例对应一份配置)
TomcatInstance 1:1 ←→ DeployDirectory (每个实例对应一个部署目录)
TomcatInstance 1:* ←→ FileChangeEvent (运行时监听多个文件变更)
DeployDirectory 1:* ←→ FileChangeEvent (变更写入部署目录)
```

## Validation Rules Summary

1. 同一workspace只允许一个TomcatInstance → per-workspace单例
2. 同一workspace的port和debugPort不能相同
3. contextPath不含路径分隔符(/或\)
4. TomcatInstance.status转换必须遵循状态转换图
5. FileChangeEvent只在TomcatStatus=RUNNING时执行热加载
6. 端口占用检测在STARTING状态转换前必须通过