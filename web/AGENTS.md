# Pinned New API Web 智能体规则

## 项目概览

React／TypeScript 前端，使用 Rsbuild、Base UI、Tailwind CSS 和 Bun；承载 New API 页面及独立的 Canvas Cloud 模块。

## 工作入口与验证

<a id="canvas-ui-iteration-exception"></a>

### Canvas UI 迭代例外

大型 Canvas UI 任务按[根 AGENTS 的迭代边界](../../AGENTS.md#canvas-ui-迭代边界)执行：用户明确说 `complete` 前不运行完整 Canvas 测试、生产构建、全量类型检查或综合 Docker 门禁，只运行最小受影响检查。纯视觉结果由用户在热更新页面确认；高风险业务／接口检查不得延后。浏览器验证范围和证据复用按[实施指南](../../docs/agent-guides/implementation-and-verification.md#风险相称验证与证据复用)执行。

<a id="frozen-candidate-gate"></a>

### 冻结候选版本检查

普通受影响 Web 候选版本，从 `web/` 目录运行一次以下唯一综合入口：

```bash
bash scripts/run-docker-affected-gate.sh --test <test-file> [--test <test-file>...] --file <source-file> [--file <source-file>...]
```

- 每个测试／源码路径分别带 `--test`／`--file`，使用相对 `web/` 的现存文件路径，且不能以 `-` 开头。
- 使用固定摘要的 Bun 基础镜像，按 `package.json`、`bun.lock` 和 `Dockerfile.verify` 匹配依赖镜像；不依赖宿主机 Bun，不创建持久化依赖卷。
- 单个隔离容器依次运行聚焦 Vitest、全量类型检查、受影响静态检查、格式检查和生产构建。格式检查以 `--check` 操作临时副本，不回写工作树文件。

## 硬约束

- 复用现有外壳组件、设计令牌、路由、多语言和包脚本；新增依赖或复制组件／模式前先检查现有实现。
- 同一候选版本不重复冻结候选门禁已经覆盖的阶段。
- 成功、失败或中断均清理，并确认本次容器／卷零残留；不得复用人工 UAT 的 Compose 资源、容器、网络、数据库或卷。
- 仅专项检查或诊断使用 `bash scripts/run-docker-gate.sh <command> [args...]` 或 `docker:gate`。

## 专题文档

只读取 [Web 详细指南](../docs/agent-guides/web.md) 的相关章节：

- 用户可见文案、语言地区数据或国际化常量：**3.1 国际化**。
- TypeScript、组件结构、性能、Zustand、React Query／Axios、表单、路由、错误、样式、文件、无障碍或安全：对应的 **3.2–3.13** 节。
- 测试、测试位置、交互／无障碍覆盖或验证：**3.14 测试**。
- 依赖或构建／发布行为：**3.15–3.16** 节。

修改 Canvas Cloud UI、表单、校验、多语言或表格时，还须完整阅读[共通 UI 指南](../../docs/agent-guides/ui-form-consistency.md)；表格、历史或选择列表另读[Cloud 数据表规范](../../docs/agent-guides/canvas-cloud-table-design.md)及其引用的通用规范。Cloud API 是业务校验真源，本 UI 镜像可在本地判断的规则。修改 Canvas Cloud 模块前，必读 [`src/features/canvas-cloud/AGENTS.md`](src/features/canvas-cloud/AGENTS.md)的布局及验证补充。
