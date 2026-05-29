# Quickstart: local-tomcat-launcher

## 前置条件

1. **VSCode** 已安装
2. **redhat.java** 插件已安装且版本 >= 1.51.0
   (在VSCode扩展市场搜索"Language Support for Java(TM) by Red Hat"安装)
3. **Maven** 已安装且 `mvn` 命令可通过系统环境变量访问
   (终端运行 `mvn -version` 验证)
4. **操作系统** 为 Windows
5. 项目为 **单模块Maven WAR项目** (根目录包含pom.xml)

## 安装插件

1. 在VSCode扩展市场搜索 "local-tomcat-launcher"
2. 点击安装
3. 安装完成后重启VSCode(如需)

## 快速启动流程

### Step 1: 打开Maven Java项目

在VSCode中打开一个包含pom.xml的Maven Web项目文件夹。

### Step 2: 配置(可选)

按 `Ctrl+,` 打开设置，搜索 "support.tomcat"，可调整:
- 发布端口(默认8080)
- Debug端口(默认5005)
- 部署名称(默认dev)
- Tomcat路径(默认使用内置Tomcat9)
- VM参数(可选)

### Step 3: 点击启动

在编辑器右上角标题栏点击 ▶(启动)按钮，插件将:
1. 执行Maven编译项目
2. 启动内置Tomcat(以debug模式)
3. 以Exploded WAR格式部署到 `{contextPath}` 目录
4. 输出日志到"tomcat"输出通道

### Step 4: 访问项目

浏览器打开 `http://localhost:{port}/{contextPath}` 即可访问项目。

### Step 5: 开发热加载

修改文件保存后自动生效:
- **Java文件** → 增量编译+Hot Swap(仅方法体修改即时生效)
- **JSP/配置文件** → 直接同步到部署目录
- **pom.xml** → Maven重新编译更新依赖jar包

### Step 6: 停止/刷新

- 点击 ■(停止)按钮 → 强制终止Tomcat进程
- 点击 ↻(刷新)按钮 → 清除部署+重新编译+重启

## 查看日志

点击状态栏的Tomcat状态项，或在输出面板选择"tomcat"通道，
查看Maven编译输出、Tomcat运行日志和localhost日志。

## 常见问题

| 问题 | 解决方案 |
|------|---------|
| 插件不激活 | 检查redhat.java版本、是否为Maven项目、是否为Windows |
| 端口被占用 | 更改配置中的port/debugPort，或关闭占用端口的程序 |
| Maven编译失败 | 查看tomcat输出通道的错误信息，确认pom.xml和依赖正确 |
| 热加载不生效 | 确认Tomcat状态为"运行中"; Java结构性变更需刷新按钮 |
| Debug不连接 | 确认debugPort未被占用; VSCode需安装Java Debug Extension |