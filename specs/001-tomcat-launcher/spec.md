# Feature Specification: local-tomcat-launcher

**Feature Branch**: `001-tomcat-launcher`

**Created**: 2026-05-29

**Status**: Draft

**Input**: User description: "构建一个VSCode插件，通过配置文件操作本机Tomcat进行快速启动/停止/重启，支持Maven项目编译、文件监听热加载、内置Tomcat9"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - 首次启动Tomcat部署项目 (Priority: P1)

用户打开一个Maven Java项目，首次点击启动按钮，插件自动使用Maven编译项目，
启动内置Tomcat，将编译产物部署到Tomcat上，用户可以通过浏览器访问项目。

**Why this priority**: 这是核心功能，没有启动能力其他功能无从谈起。

**Independent Test**: 点击启动按钮后，浏览器访问 `http://localhost:8080/dev`
能看到项目页面，Tomcat日志输出到VSCode输出通道。

**Acceptance Scenarios**:

1. **Given** 用户已打开Maven项目且从未启动过, **When** 点击启动按钮,
   **Then** 插件执行Maven编译，启动Tomcat，部署项目到contextPath路径，
   日志输出到tomcat输出通道，状态栏显示"运行中"
2. **Given** 用户已启动Tomcat, **When** 浏览器访问 `http://localhost:8080/dev`,
   **Then** 能正常访问部署的Java Web项目
3. **Given** 用户配置了自定义端口和debug端口, **When** 点击启动,
   **Then** Tomcat使用自定义端口启动，debug端口可用

---

### User Story 2 - 停止和重启Tomcat (Priority: P2)

用户在开发过程中需要停止Tomcat或刷新部署（重新编译+重启）。

**Why this priority**: 停止和刷新是日常开发高频操作，仅次于启动。

**Independent Test**: 点击停止按钮后Tomcat进程被终止；
点击刷新按钮后旧部署被清除、项目重新编译并重启。

**Acceptance Scenarios**:

1. **Given** Tomcat正在运行, **When** 点击停止按钮,
   **Then** Tomcat进程被强制终止（kill），状态栏显示"已停止"
2. **Given** Tomcat正在运行, **When** 点击刷新按钮,
   **Then** 插件清除contextPath下所有配置，释放端口，
   Maven重新编译项目，Tomcat重启并重新部署，状态栏恢复"运行中"
3. **Given** Tomcat未运行, **When** 点击刷新按钮,
   **Then** 插件执行Maven编译并启动Tomcat，部署项目

---

### User Story 3 - 文件变更热加载 (Priority: P3)

用户在开发过程中修改Java文件、JSP文件或配置文件，保存后插件自动将变更同步到
已部署的Tomcat目录，无需手动重启。

**Why this priority**: 热加载大幅提升开发效率，但依赖前两个故事的稳定运行。

**Independent Test**: 修改一个Java文件保存后，刷新浏览器即可看到变更效果，
无需重启Tomcat。

**Acceptance Scenarios**:

1. **Given** Tomcat正在运行且项目已部署, **When** 用户修改Java文件并保存,
   **Then** 插件触发redhat.java增量编译，将编译后的class文件复制到部署路径，
   Tomcat热加载生效
2. **Given** Tomcat正在运行且项目已部署, **When** 用户修改JSP或配置文件并保存,
   **Then** 插件直接将修改文件同步到部署路径，Tomcat检测到文件变更
3. **Given** Tomcat正在运行且项目已部署, **When** 用户修改pom.xml并保存,
   **Then** 插件更新相关jar包到部署路径，必要时重新编译依赖
4. **Given** Tomcat未运行, **When** 用户保存文件,
   **Then** 插件不执行热加载操作，文件变更在下次启动时生效

---

### Edge Cases

- 如果redhat.java插件未安装或版本低于1.51.0，插件不激活
- 如果项目不是单模块Maven项目，插件不激活
- 如果项目不是Maven项目，插件不激活
- 如果运行环境不是Windows，插件不激活
- 如果Tomcat端口被占用，启动时需提示用户
- 如果debug端口被占用，启动时需提示用户
- 如果Maven编译失败，启动流程中断并输出错误信息
- 如果Tomcat启动失败，输出错误日志到输出通道
- 多个workspace打开时，每个workspace启动独立的Tomcat进程（独立端口），互不干扰
- 内置Tomcat与用户指定的外部Tomcat路径冲突时的处理
- 保存文件时redhat.java增量编译失败的处理

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: 插件 MUST 仅在 redhat.java >= 1.51.0 已安装、当前项目为Maven项目、
  且运行环境为Windows时激活
- **FR-002**: 插件 MUST 在标题栏提供三个按钮：启动、停止、刷新
- **FR-003**: 插件 MUST 在状态栏显示当前Tomcat运行状态
- **FR-004**: 插件 MUST 内置Tomcat9运行时，用户无需额外配置即可使用
- **FR-005**: 插件 MUST 支持以下配置参数：
  - `support.tomcat.home`（可选，默认使用内置Tomcat9）
  - `support.tomcat.port`（默认8080）
  - `support.tomcat.debugPort`（默认5005）
  - `support.tomcat.contextPath`（默认dev）
  - `support.tomcat.vmOptions`（可选，Tomcat启动VM参数）
- **FR-006**: 启动操作 MUST 在首次运行时先执行Maven编译再启动Tomcat部署
- **FR-007**: 启动操作 MUST 将Tomcat日志和localhost日志输出到VSCode的
  "tomcat"输出通道
- **FR-008**: 停止操作 MUST 强制终止Tomcat进程（kill）
- **FR-009**: 刷新操作 MUST 清除contextPath目录下所有内容、释放端口、
  重新Maven编译并重启Tomcat
- **FR-010**: 插件 MUST 监听文件保存事件，根据文件类型执行不同热加载策略：
  Java文件 → 触发增量编译并复制class文件；JSP/配置文件 → 直接同步；
  pom.xml → 更新jar包
- **FR-011**: 插件 MUST 以per-workspace单例模式管理Tomcat实例，
  每个workspace启动独立的Tomcat进程，同一workspace内只允许一个Tomcat实例，
  以contextPath为名称存入插件路径下
- **FR-013**: 项目 MUST 以Exploded WAR（展开目录）格式部署到Tomcat，
  项目以完整目录结构放置在webapps下以contextPath命名的目录中，
  便于直接操作文件实现热加载
- **FR-012**: 插件 MUST 支持JVM Hot Swap级别的Java热替换（仅方法体修改），
  通过debug端口连接JVM实现；结构性变更（新增方法/字段/类）需通过刷新操作处理
- **FR-014**: 插件 MUST 仅支持单模块Maven项目（根目录包含pom.xml的WAR项目），
  多模块项目结构不在支持范围内
- **FR-015**: 插件 MUST 在状态栏实时反映操作进度，编译期间显示"编译中..."，
  启动期间显示"启动中..."，运行中显示"运行中"，停止后显示"已停止"

### Key Entities

- **Tomcat实例**: per-workspace单例管理的Tomcat运行时进程，
  包含端口、debug端口、contextPath配置，
  运行状态（编译中/启动中/运行中/已停止）
- **部署目录**: 以contextPath命名的Exploded WAR目录，存放Maven编译产物的
  完整展开目录结构（WEB-INF/classes、WEB-INF/lib等），位于Tomcat webapps下
- **配置参数集**: 插件的所有可配置项及其默认值集合
- **文件变更事件**: 保存文件时触发的变更类型（Java/JSP/配置/POM）及对应的
  热加载策略

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 用户点击启动按钮后，10秒内Tomcat启动完成且日志开始输出到输出通道
- **SC-002**: 用户通过浏览器访问部署的项目，页面正常加载且功能可用
- **SC-003**: 用户修改Java文件保存后，5秒内变更生效（浏览器刷新可见）
- **SC-004**: 用户修改JSP/配置文件保存后，2秒内文件同步到部署目录
- **SC-005**: 停止操作执行后，Tomcat进程完全终止（不再占用端口）
- **SC-006**: 刷新操作执行后，项目重新部署成功且运行状态恢复正常
- **SC-007**: 插件在不符合激活条件时（缺少依赖、非Maven、非Windows）不干扰
  用户正常使用VSCode

## Clarifications

### Session 2026-05-29

- Q: 项目部署到Tomcat的格式是什么？ → A: Exploded WAR（展开目录格式），项目以完整目录结构直接部署到webapps下以contextPath命名
- Q: IDEA的Tomcat热加载支持哪些级别的变更？ → A: 仅Hot Swap - 只支持方法体修改的热替换（通过JVM debug连接），结构性变更需刷新
- Q: 多模块Maven项目如何处理？ → A: 仅支持单模块项目，只处理根目录包含pom.xml的WAR项目
- Q: 长时间操作期间UI如何反馈进度？ → A: 仅状态栏文字变化，编译显示"编译中..."，启动显示"启动中..."
- Q: Tomcat实例是全局单例还是per-workspace单例？ → A: per-workspace单例，每个workspace独立的Tomcat进程

## Assumptions

- 用户已在VSCode中安装redhat.java插件且版本满足要求
- 用户的项目使用Maven作为构建工具（存在pom.xml）
- 插件仅支持单模块Maven项目，不支持多模块项目结构
- 用户在Windows环境下使用VSCode
- Maven命令行工具已安装且可通过系统环境变量访问
- 内置Tomcat9为标准Apache Tomcat 9发行版，无需额外配置
- Tomcat热加载基于Exploded WAR展开目录方式，Java文件变更通过JVM debug
  连接实现Hot Swap（仅方法体修改）；结构性变更需刷新操作重新部署
- 每个workspace对应一个独立的Tomcat实例（独立进程、独立端口）
- 用户的Java项目为标准的Web应用项目（WAR打包结构），部署时以
  Exploded WAR展开目录格式存放