# 更新日志

## [0.1.0] - 2026-05-29

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