# Research: local-tomcat-launcher

## 1. VSCode标题栏按钮(Editor Title Bar)

**Decision**: 使用 `menus.editor/title` 在package.json中注册命令，
配合 `when` 条件控制按钮显示时机。

**Rationale**: 这是VSCode官方推荐的方式，通过package.json的contributes.menus
配置项将命令注册到编辑器标题栏区域。支持icon图标和分组(group)。

**Alternatives considered**:
- 自定义WebView覆盖标题栏 → 非官方方式，破坏UI一致性
- 状态栏按钮替代 → 不符合用户需求(标题栏右上角)

**API参考**: `package.json` → `contributes.menus["editor/title"]`
命令需注册 `icon` (light/dark主题图标)和 `group` (navigation组靠右显示)

## 2. VSCode状态栏(Status Bar)

**Decision**: 使用 `vscode.window.createStatusBarItem()` 创建状态栏项，
通过 `text`/`color` 属性动态更新状态文字和颜色。

**Rationale**: 官方API直接支持，`StatusBarItem` 可设置alignment(Left/Right)、
priority、text、tooltip、color、backgroundColor，完全满足需求。

**Alternatives considered**:
- 底部面板信息 → 位置不对，用户期望状态栏
- 通知弹窗 → 过于打扰，不适合持续状态展示

**API参考**: `vscode.window.createStatusBarItem(alignment, priority)`
状态值映射: 编译中→"编译中..."(黄色), 启动中→"启动中..."(黄色),
运行中→"运行中"(绿色), 已停止→"已停止"(灰色)

## 3. VSCode输出通道(Output Channel)

**Decision**: 使用 `vscode.window.createOutputChannel("tomcat")` 创建
专用输出通道，将Tomcat进程的标准输出/错误流实时追加到通道中。

**Rationale**: 官方API，OutputChannel支持append/appendLine/show方法，
适合持续输出日志。同时监听Tomcat的catalina日志文件和localhost日志文件，
通过fs.watch实时读取追加。

**Alternatives considered**:
- Terminal面板 → 无法控制输出格式，混杂用户命令
- 日志文件直接查看 → 用户需要手动打开文件

**API参考**: `vscode.window.createOutputChannel(name)`
Tomcat日志读取策略: spawn进程时pipe stdout/stderr到channel;
同时用chokidar/fs.watch监听Tomcat logs目录下catalina.*和localhost.*文件

## 4. 文件保存监听(onDidSaveTextDocument)

**Decision**: 使用 `vscode.workspace.onDidSaveTextDocument` 监听保存事件，
通过文件扩展名(.java/.jsp/.xml/.properties等)和文件路径判断变更类型。

**Rationale**: 官方API，TextDocument事件包含uri和languageId，
可直接判断文件类型。对于Java文件检查languageId === 'java';
JSP检查扩展名; pom.xml检查文件名; 配置文件检查扩展名列表。

**Alternatives considered**:
- fs.watch文件系统监听 → 无法区分保存vs其他修改，过于底层
- redhat.java的DI事件 → 不确定是否公开此API

**分类策略**:
- `.java` → 触发redhat.java增量编译(通过命令执行)
- `.jsp/.html/.properties/.xml`(非pom) → 直接文件同步
- `pom.xml` → Maven依赖更新(mvn compile刷新jar)

## 5. 插件激活条件(activationEvents)

**Decision**: 使用 `onLanguage:java` + `workspaceContains:pom.xml` 组合
作为激活事件，在activate函数中额外检查redhat.java版本和Windows平台。

**Rationale**: VSCode的activationEvents不支持"依赖插件版本"条件，
需在activate回调中用 `vscode.extensions.getExtension('redhat.java')`
检查版本。`onLanguage:java`确保Java项目时激活，
`workspaceContains:pom.xml`确保Maven项目。Windows检查通过
`process.platform === 'win32'`判断。

**Alternatives considered**:
- `onCommand:xxx`激活 → 用户需手动触发，不符合"自动检测"需求
- `extensionDependency`声明的activation → 不支持版本号条件

**激活逻辑**:
1. activationEvents触发activate
2. 检查 `vscode.extensions.getExtension('redhat.java')?.packageJSON.version >= 1.51.0`
3. 检查 `process.platform === 'win32'`
4. 检查workspace根目录存在pom.xml且为单模块项目
5. 任一条件不满足 → 显示提示信息，不注册核心功能

## 6. 配置项(configuration)

**Decision**: 在 `package.json` 的 `contributes.configuration` 中声明5个配置项，
使用VSCode官方的configuration schema格式，包含type/default/description。

**Rationale**: 官方方式，用户可在VSCode Settings界面中直接编辑配置，
支持scope区分(workspace/global)。通过
`vscode.workspace.getConfiguration('support.tomcat')`读取。

**配置Schema**:
```json
{
  "support.tomcat.home": { type: "string", default: "", description: "Tomcat路径(空则使用内置)" },
  "support.tomcat.port": { type: "number", default: 8080, description: "发布端口" },
  "support.tomcat.debugPort": { type: "number", default: 5005, description: "Debug端口" },
  "support.tomcat.contextPath": { type: "string", default: "dev", description: "发布名称" },
  "support.tomcat.vmOptions": { type: "string", default: "", description: "VM参数" }
}
```

## 7. Tomcat9进程管理

**Decision**: 使用 `child_process.spawn` 启动Tomcat(调用catalina.bat run)，
使用 `taskkill /F /PID` 强制终止进程。通过进程PID追踪管理生命周期。

**Rationale**: Tomcat在Windows上通过catalina.bat脚本启动，spawn可pipe
stdout/stderr到输出通道。Tomcat启动时会fork一个Java子进程，
需要追踪子进程PID用于kill操作。使用wmic或PowerShell获取子进程树。

**Alternatives considered**:
- catalina.bat stop → 优雅停止但可能超时失败
- 直接kill Java进程 → 需要找到正确的PID

**启动命令**: `spawn('cmd', ['/c', 'catalina.bat', 'run'], { cwd: tomcatHome, env: {...} })`
环境变量需设置: CATALINA_HOME, CATALINA_BASE(指向contextPath目录),
JPDA_ADDRESS(debug端口), JAVA_OPTS(vmOptions+debug参数)

**停止策略**: 获取Tomcat进程树PID → `taskkill /F /T /PID <pid>` 终止进程树

## 8. JVM Hot Swap / Debug连接

**Decision**: Tomcat以debug模式启动(`-agentlib:jdwp=transport=dt_socket...`),
VSCode通过Debug Adapter Protocol连接debug端口，使用redhat.java的
增量编译产出class文件，通过Java Debug Server的Hot Swap功能替换。

**Rationale**: Tomcat debug模式启动后，VSCode的Java Debug Extension
可连接debug端口。redhat.java增量编译后产出class文件，
Java Debug Server在检测到class文件变更时自动执行Hot Swap。
这是IDEA的Hot Swap机制在VSCode中的等效实现。

**Alternatives considered**:
- 手动JDWP连接+手动替换class → 复杂，需实现JDWP协议
- Tomcat Context reload → 不是Hot Swap，是全量重加载
- 仅依赖class文件替换+Tomcat自动检测 → 可能延迟，不保证即时生效

**实现策略**:
1. Tomcat启动时附带 `-agentlib:jdwp=transport=dt_socket,server=y,suspend=n,address=<debugPort>`
2. Java文件保存时 → 触发redhat.java增量编译(通过执行命令`java.workspace.compile`)
3. 编译完成 → 将class文件复制到Exploded WAR的WEB-INF/classes对应目录
4. Java Debug Server检测到class变更 → 执行Hot Swap (需用户启用VSCode Java Debug)

## 9. Exploded WAR部署

**Decision**: 在Tomcat的webapps目录下创建以contextPath命名的目录，
将Maven编译的WAR项目内容解压展开到此目录中。热加载由插件自身的文件监听
和JVM Hot Swap机制处理，不依赖Tomcat的reloadable自动重载。

**Rationale**: Exploded WAR是Tomcat官方支持的部署方式，
webapps下的目录名即为contextPath。不使用reloadable="true"避免Tomcat
自动重新加载Context时清空session等副作用，热加载由插件精确控制。
Maven的 `war:exploded` 目标可直接生成展开目录结构。

**目录结构**:
```
webapps/{contextPath}/
├── META-INF/
├── WEB-INF/
│   ├── classes/          # Java编译的class文件
│   ├── lib/              # 依赖jar包
│   └── web.xml           # Web配置
├── *.jsp                 # JSP页面
└── 其他静态资源
```

**部署流程**: `mvn war:exploded -Dmaven.war.exploded.dir=<deployPath>`
或手动复制target/xxx目录内容到部署目录

## 10. Maven命令行调用

**Decision**: 使用 `child_process.spawn('mvn', [...args])` 调用Maven命令，
pipe stdout/stderr到输出通道，通过exit code判断编译是否成功。

**Rationale**: Maven命令行是标准调用方式，spawn支持实时输出流pipe，
适合长时间编译任务。通过系统环境变量中的Maven路径直接调用，
无需额外查找。

**Alternatives considered**:
- Maven Embedder(Maven内嵌API) → Java库，不适合TS/Node.js环境
- mvnw(Maven Wrapper) → 需要项目自带，不是所有项目都有

**关键命令**:
- 首次编译: `mvn compile war:exploded`
- 依赖更新: `mvn compile` (pom.xml变更后)
- 实时输出: spawn时设置 `{ shell: true }` 确保Windows上cmd执行

## 11. 端口检测和释放

**Decision**: 使用PowerShell命令 `Get-NetTCPConnection -LocalPort <port>`
检测端口占用，用 `taskkill /F /PID <pid>` 终止占用进程。

**Rationale**: Windows上netstat输出格式不友好，PowerShell的
Get-NetTCPConnection直接返回结构化数据。taskkill是Windows原生
进程终止命令，/F强制终止。

**Alternatives considered**:
- netstat -ano → 输出需解析，格式不稳定
- node-netstat npm包 → 第三方依赖，增加包大小
- 端口0绑定测试 → 仅检测占用，无法获取PID

**检测流程**:
1. `spawn('powershell', ['-Command', 'Get-NetTCPConnection -LocalPort <port> | Select-Object -Property OwningProcess'])`
2. 有结果 → 端口被占用，提示用户或kill(刷新操作)
3. 无结果 → 端口可用，继续启动

## 12. 内置Tomcat9打包

**Decision**: 将Apache Tomcat 9完整发行版放置在 `resources/tomcat9/` 目录中，
通过 `.vscodeignore` 排除不必要的文件(LICENSE、NOTICE、webapps默认应用等)
减小包体积。运行时从extension路径复制到globalStorage路径使用。

**Rationale**: VSCode Extension资源可通过 `context.globalStorageUri`
获取持久化存储路径。内置Tomcat需要从extension安装路径复制到
globalStorage路径后才能正常运行(避免只读路径问题)。
首次使用时执行复制，后续使用检测globalStorage路径即可。

**Alternatives considered**:
- 下载Tomcat → 需要网络，增加首次启动延迟
- 使用用户本地Tomcat → 不满足"内置"需求

**优化策略**:
- 排除: webapps/ROOT, webapps/docs, webapps/examples, webapps/manager,
  webapps/host-manager (减少约15MB)
- 保留: bin/, conf/, lib/, temp/, logs/, webapps/(空), WORKERS/LICENSE
- 压缩: 使用VSCE的文件打包机制，resources目录自动包含
- 包大小预估: 约12-15MB (精简后)

**运行时路径管理**:
- 插件安装路径: `context.extensionPath` → `resources/tomcat9/`
- 运行时路径: `context.globalStorageUri.fsPath` → `tomcat9/`
- 部署目录: `globalStorageUri.fsPath` + `/{contextPath}/`
- 首次使用: 检测globalStorage下是否有tomcat9目录，没有则从extensionPath复制