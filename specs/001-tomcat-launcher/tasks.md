---

description: "Task list for local-tomcat-launcher feature implementation"
---

# Tasks: local-tomcat-launcher

**Input**: Design documents from `/specs/001-tomcat-launcher/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), data-model.md, contracts/

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **VSCode Extension project**: `src/`, `test/`, `resources/` at repository root

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: 项目初始化和基础结构搭建

- [X] T001 初始化VSCode Extension项目结构，创建package.json、tsconfig.json、.vscodeignore
- [X] T002 在package.json中声明插件元数据(名称、版本、激活事件、命令、菜单、配置)
- [X] T003 [P] 创建src/constants.ts，定义命令ID、配置键名、默认值等常量
- [X] T004 [P] 创建src/extension.ts，编写activate/deactivate入口函数框架
- [X] T005 [P] 创建src/ui/outputChannel.ts，实现tomcat输出通道管理
- [ ] T006 下载Apache Tomcat 9发行版，精简后放入resources/tomcat9/目录

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: 所有用户故事依赖的核心基础设施，MUST在用户故事工作开始前完成

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T007 创建src/utils/configUtils.ts，实现getTomcatConfig和validateConfig
- [X] T008 [P] 创建src/utils/portUtils.ts，实现isPortInUse和killPortProcess
- [X] T009 [P] 创建src/utils/processUtils.ts，实现spawnJavaProcess和killProcessTree
- [X] T010 [P] 创建src/utils/fileUtils.ts，实现copyDir、syncFile、cleanDir等文件操作
- [X] T011 创建src/ui/statusBar.ts，实现状态栏项创建和状态文字/颜色动态更新
- [X] T012 创建src/ui/titleBarButtons.ts，在package.json中注册editor/title菜单和图标
- [X] T013 创建src/services/deployService.ts，实现initDeployDir、cleanDeployDir、syncFromCompile、syncSingleFile
- [X] T014 在src/extension.ts的activate函数中实现激活条件检查(redhat.java版本、Windows、Maven项目、单模块)

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - 首次启动Tomcat部署项目 (Priority: P1) 🎯 MVP

**Goal**: 用户点击启动按钮，插件自动Maven编译项目、启动Tomcat、部署Exploded WAR

**Independent Test**: 点击启动按钮后，浏览器访问 http://localhost:8080/dev 能看到项目页面，Tomcat日志输出到VSCode输出通道

### Implementation for User Story 1

- [X] T015 [US1] 创建src/services/mavenService.ts，实现compile方法(spawn mvn compile war:exploded, pipe输出到channel)
- [X] T016 [US1] 创建src/services/tomcatService.ts，实现start方法(配置CATALINA_BASE、spawn catalina.bat run、追踪PID、pipe日志)
- [X] T017 [US1] 在tomcatService.ts中实现stop方法(taskkill /F /T /PID终止进程树)
- [X] T018 [US1] 在tomcatService.ts中实现getStatus方法(返回TomcatStatus枚举)
- [X] T019 [US1] 创建src/commands/startCommand.ts，调用mavenService.compile→deployService.syncFromCompile→tomcatService.start，状态栏更新
- [X] T020 [US1] 创建src/commands/stopCommand.ts，调用tomcatService.stop，状态栏更新
- [X] T021 [US1] 创建src/commands/registerCommands.ts，注册三个命令到VSCode并绑定到titleBarButtons
- [X] T022 [US1] 在startCommand中实现内置Tomcat9首次使用时从extensionPath复制到globalStorage的逻辑
- [X] T023 [US1] 在startCommand中实现端口占用检测(调用portUtils.isPortInUse)，占用时提示用户
- [X] T024 [US1] 实现Tomcat catalina日志和localhost日志的实时追加到输出通道(fs.watch监听logs目录)
- [X] T025 [US1] 验证完整启动流程：点击启动→Maven编译→状态栏"编译中..."→Tomcat启动→状态栏"运行中"→浏览器可访问

**Checkpoint**: At this point, User Story 1 should be fully functional and testable independently

---

## Phase 4: User Story 2 - 停止和刷新Tomcat (Priority: P2)

**Goal**: 用户可以停止Tomcat(kill进程)和刷新部署(清除+重新编译+重启)

**Independent Test**: 点击停止按钮→Tomcat进程终止、状态栏"已停止"；点击刷新按钮→部署清除→重新编译→重启

### Implementation for User Story 2

- [X] T026 [US2] 在tomcatService.ts中实现refresh方法(调用stop→cleanDeployDir→killPortProcess→compile→start)
- [X] T027 [US2] 创建src/commands/refreshCommand.ts，调用tomcatService.refresh，状态栏更新
- [X] T028 [US2] 在refreshCommand中实现强制释放端口逻辑(调用portUtils.killPortProcess释放port和debugPort，并增加waitForPortFree等待端口释放)
- [X] T029 [US2] 在stopCommand中添加进程已不存在时的正常处理(设置IDLE而非报错)
- [X] T030 [US2] 在startCommand中添加"Tomcat已在运行"的提示逻辑
- [X] T031 [US2] 验证完整停止流程：点击停止→进程终止→端口释放→状态栏"已停止"
- [X] T032 [US2] 验证完整重启流程：点击重启→清除部署→kill端口→编译→重启→状态栏"运行中"

**Checkpoint**: At this point, User Stories 1 AND 2 should both work independently

---

## Phase 5: User Story 3 - 文件变更热加载 (Priority: P3)

**Goal**: 修改Java/JSP/配置/pom文件保存后，变更自动同步到部署目录，无需重启Tomcat

**Independent Test**: 修改Java文件保存后浏览器刷新可见变更；修改JSP文件保存后直接生效

### Implementation for User Story 3

- [X] T033 [US3] 创建src/services/hotReloadService.ts，实现registerFileWatcher(onDidSaveTextDocument监听)
- [X] T034 [US3] 在hotReloadService.ts中实现文件类型识别逻辑(.java→HOT_SWAP, .jsp→DIRECT_SYNC, pom.xml→DEPENDENCY_UPDATE, 其他→DIRECT_SYNC)
- [X] T035 [US3] 在hotReloadService.ts中实现onJavaFileSaved方法(触发redhat.java增量编译命令java.workspace.compile，等待编译完成，复制class到WEB-INF/classes)
- [X] T036 [US3] 在hotReloadService.ts中实现onResourceFileSaved方法(调用deployService.syncSingleFile直接同步)
- [X] T037 [US3] 在hotReloadService.ts中实现onPomFileSaved方法(调用mavenService.compile重新编译，同步WEB-INF/lib下的jar包)
- [X] T038 [US3] 在hotReloadService中添加Tomcat未运行时的保护逻辑(status≠RUNNING时不执行热加载)
- [X] T039 [US3] 在extension.ts的activate中，当Tomcat启动成功后调用hotReloadService.registerFileWatcher
- [X] T040 [US3] 在extension.ts的deactivate中清理文件监听器Disposable
- [X] T041 [US3] 验证Java热加载：修改Java方法体→保存→增量编译→class同步→浏览器刷新可见变更
- [X] T042 [US3] 验证JSP同步：修改JSP文件→保存→文件同步→浏览器刷新可见变更
- [X] T043 [US3] 验证pom.xml更新：修改pom.xml添加依赖→保存→Maven编译→jar包更新

**Checkpoint**: All user stories should now be independently functional

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: 改进和优化影响多个用户故事的功能

- [X] T044 [P] 在所有模块中添加中文JSDoc注释和行内注释(遵循宪法II原则)
- [ ] T045 配置变更监听：当用户修改support.tomcat配置时，若Tomcat运行中提示需刷新才能生效
- [X] T046 Tomcat启动失败时的错误恢复：检测启动超时(>30s无日志输出)，设置status=ERROR并提示
- [ ] T047 [P] 优化内置Tomcat9打包大小(排除webapps默认应用docs/examples/manager等)
- [X] T048 状态栏点击交互：IDLE状态点击→执行启动命令，RUNNING状态点击→执行停止命令
- [X] T049 编译和打包验证：执行npm run compile确保无TypeScript错误

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3+)**: All depend on Foundational phase completion
  - User stories can then proceed in parallel (if staffed)
  - Or sequentially in priority order (P1 → P2 → P3)
- **Polish (Phase 6)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 2 (P2)**: Can start after Foundational (Phase 2) - Uses startCommand和stopCommand(来自US1), refreshCommand是新增
- **User Story 3 (P3)**: Depends on US1完成(Tomcat启动后才能测试热加载)

### Within Each User Story

- Models/类型定义 before services
- Services before commands
- Core implementation before integration验证
- Story complete before moving to next priority

### Parallel Opportunities

- Phase 1: T003, T004, T005 can run in parallel
- Phase 2: T008, T009, T010 can run in parallel
- Phase 6: T044, T047 can run in parallel

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Test User Story 1 independently
5. Deploy/demo if ready

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → Test independently → Deploy/Demo (MVP!)
3. Add User Story 2 → Test independently → Deploy/Demo
4. Add User Story 3 → Test independently → Deploy/Demo
5. Each story adds value without breaking previous stories

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- 内置Tomcat9需要在Phase 1中提前准备(下载和精简)
- 所有代码必须包含中文注释(宪法II原则)
- 代码分层：命令层(commands) → 服务层(services) → 工具层(utils)(宪法V原则)