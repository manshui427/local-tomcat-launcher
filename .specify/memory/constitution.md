<!--
  同步影响报告 (Sync Impact Report)
  版本变更: (初始) → 1.0.0
  修改的原则: 无 (首次制定)
  新增章节: Core Principles (5项), 技术栈约束, 开发流程, Governance
  删除章节: 无
  模板更新状态:
    - .specify/templates/plan-template.md: ✅ 无需更新 (宪法检查引用已适配)
    - .specify/templates/spec-template.md: ✅ 无需更新 (需求结构已适配)
    - .specify/templates/tasks-template.md: ✅ 无需更新 (任务结构已适配)
    - .specify/templates/checklist-template.md: ✅ 无需更新
    - .specify/templates/constitution-template.md: ✅ 无需更新 (模板本身不变)
  遗留 TODO: 无
-->

# local-tomcat-launcher Constitution

## Core Principles

### I. 官方推荐优先

所有代码 MUST 优先使用 VSCode Extension API 官方推荐的写法和模式。

- 使用官方 API 定义的方式注册命令、视图和配置
- 使用官方推荐的目录结构和模块组织方式
- 参考官方示例代码和最佳实践文档实现功能

**理由**: 官方推荐的写法保证与 VSCode 平台的兼容性和长期可维护性，
避免因使用非标准方式导致的版本升级兼容问题。

### II. 清晰注释

所有代码和文档 MUST 包含清晰的中文注释。

- 每个函数/类 MUST 有描述其用途的中文注释
- 复杂逻辑 MUST 有行内中文注释说明意图
- 配置项 MUST 有中文说明文档
- 公共接口 MUST 有中文 JSDoc 注释

**理由**: 中文注释确保团队成员能快速理解代码意图，
降低沟通成本和代码阅读门槛。

### III. 最佳实践

代码 MUST 符合 TypeScript 和 VSCode 插件开发的主流最佳实践。

- 严格类型检查，禁止使用 `any`（除必要的第三方库交互）
- 遵循 TypeScript 官方编码规范
- 遵循 VSCode 插件开发的生命周期管理最佳实践
- 正确处理异步操作和错误场景

**理由**: 遵循最佳实践减少常见错误，
提升代码质量和插件运行稳定性。

### IV. 简洁设计

MUST 禁止过度抽象，遵循 YAGNI (You Aren't Gonna Need It) 原则。

- 不创建仅为了"将来可能需要"的抽象层
- 优先使用直接、简单的实现方式
- 每个模块 MUST 只有一个明确的核心职责
- 当简单方案足以满足需求时，MUST 不引入复杂设计模式

**理由**: 过度抽象增加理解成本和维护负担，
简单直接的设计更易于理解和修改。

### V. 可维护代码

MUST 禁止一次性生成不可维护的"面条代码"。

- 每个模块 MUST 职责清晰，边界明确
- 函数 MUST 单一职责，长度控制在合理范围
- 代码 MUST 分层组织：命令层 → 服务层 → 工具层
- 模块间 MUST 通过明确接口通信，禁止隐式耦合

**理由**: 可维护性是长期项目成功的关键，
面条代码会导致修改困难、回归风险高。

## 技术栈约束

- **语言**: TypeScript (strict mode)
- **框架**: VSCode Extension API
- **运行环境**: Node.js (通过系统环境变量获取路径)
- **构建工具**: vsce (VSCode Extension 打包工具)
- **目标平台**: VSCode 桌面版 (Windows / macOS / Linux)
- **核心功能**: 通过配置文件操作本机 Tomcat 启动、停止、重启

## 开发流程

- 允许在工作空间内自动编译打包，并根据编译返回内容进一步调整优化代码
- 每次代码变更 MUST 验证编译结果，确保无类型错误和构建失败
- 插件功能开发 MUST 按 VSCode 官方推荐的调试方式进行本地测试
- 配置文件格式 MUST 提供校验机制，确保用户输入合法

## Governance

宪法高于所有其他开发实践和决策。

- 修改宪法 MUST 提供文档记录、变更理由和迁移计划
- 所有代码审查 MUST 验证与宪法原则的合规性
- 违反宪法原则的复杂度 MUST 在实现计划中明确论证理由
- 宪法版本遵循语义化版本规则:
  MAJOR(不兼容的治理变更) / MINOR(新增原则或扩展指导) /
  PATCH(措辞修正、格式调整)

**Version**: 1.0.0 | **Ratified**: 2026-05-29 | **Last Amended**: 2026-05-29