# Canvas Cloud 前端模块智能体规则

## 项目概览

本目录保存嵌入 Pinned New API Web 外壳的 Canvas 自有页面。

## 工作入口与验证

- 表单行为和无障碍标签变化时，新增或更新聚焦的 React Testing Library 回归测试。
- Canvas UI 迭代时机和冻结候选 Docker 门禁遵循上级 Web 规则，不单独重复其阶段。
- 布局验证按实施指南选择范围并复用有效证据，在适用阶段检查溢出、操作可达和响应式。

## 硬约束

- 简短业务表单在宽屏将字段与主要操作放在同一响应式网格，不为操作另设造成大面积空白的全宽行。
- 业务表单列宽按内容和使用频率分配：描述可伸缩，有界数字保持窄宽，主要操作按内容定宽；不把全部字段等宽拉满视口。
- 宽屏主要操作与输入控件行对齐，不与帮助文字对齐；窄屏先让字段换行，避免横向溢出，仅在视口确有需要时让操作全宽。
- 表格、历史和选择列表遵循 Cloud 数据表规范，不套用上述业务表单列宽。
- 复用现有 `Card`、`Input`、`Label`、`Button` 和设计令牌；标签及 `aria-describedby` 关联按共通 UI 指南执行。

## 专题文档

- [Web 级 AGENTS.md](../../../AGENTS.md)：修改本模块前必读，按其路由加载规范并使用唯一验证入口。
- [共通 UI 指南](../../../../../docs/agent-guides/ui-form-consistency.md)：UI、表单、校验或多语言变更前完整阅读。
- [Cloud 数据表规范](../../../../../docs/agent-guides/canvas-cloud-table-design.md)：表格、历史或选择列表变更前读取。
- [实施指南](../../../../../docs/agent-guides/implementation-and-verification.md#风险相称验证与证据复用)：验证前读取对应证据规则。
