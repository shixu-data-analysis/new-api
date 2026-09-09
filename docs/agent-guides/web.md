# 前端开发规范

本文按主题提供前端规范；从 web/AGENTS.md 路由到所需章节。下文代码路径与命令均相对 `web/`，实际依赖、配置和脚本为真源。

---

## 一、项目概览

### 技术栈

| 类别       | 技术                                                              |
| ---------- | ----------------------------------------------------------------- |
| 包管理     | Bun                                                               |
| 框架       | React 19、TypeScript                                              |
| 数据与请求 | @tanstack/react-query、axios、Zustand                             |
| 路由       | @tanstack/react-router                                            |
| 表格与列表 | @tanstack/react-table、@tanstack/react-virtual                    |
| 国际化     | i18next、react-i18next、i18next-browser-languagedetector          |
| 日期       | Day.js                                                            |
| UI 与样式  | Base UI、Hugeicons、Tailwind CSS、clsx / class-variance-authority |
| 表单       | React Hook Form、Zod                                              |
| 图表       | @visactor/vchart、@visactor/react-vchart                          |
| 工具       | qrcode.react、oxfmt、oxlint、vitest（可选）                       |

优先选用成熟、维护良好的开源库；仅在现有库无法满足或需特殊适配时自行实现，并评估可维护性与通用性。

---

## 三、开发规范

### 3.1 国际化

- **页面文本**：所有面向用户的文案均需支持 i18n，使用 `useTranslation()` 的 `t()` 进行翻译。
- **使用场景**
  - **React 组件**：必须使用 `const { t } = useTranslation()`，以保证语言切换时组件会重新渲染。
  - **非 React 环境**（工具函数、常量、类方法）：可使用 `import { t } from 'i18next'`；此类用法不会随语言切换自动更新，仅在不依赖响应式更新的场景使用。
  - 即使父组件已使用 `useTranslation()`，子组件仍应自行使用，以保证独立性。
- **专有名词**：品牌、产品、技术术语等可保留英文（如 API、React、TypeScript）；若有约定俗成的译法则使用翻译。
- **翻译键与语言**：使用 `src/i18n/locales/{lang}.json` 的扁平 JSON，以英文原文作为 key；文件覆盖 en、zh、zh-TW、fr、ru、ja、vi。当前 `src/i18n/config.ts` 的 fallback 为 en，运行时中文语言码为 zhCN/zhTW，映射由 `src/i18n/languages.ts` 维护，不自行拼写或直接交给 Intl。日期/数字格式化使用该文件的 `toIntlLocale`；同步工具为 `bun run i18n:sync`。

- **枚举与文案（常量中的 i18n）**
  各 feature 的 `constants.ts` 中常出现「枚举/状态 + 展示文案」或「成功/错误消息」，须统一约定以免遗漏 i18n、用法混乱：
  - **成功/错误/提示类消息**（如 `SUCCESS_MESSAGES`、`ERROR_MESSAGES`）：常量值仅表示 **i18n 键**（与英文 fallback 同字面量）。展示时**必须**通过 `t()` 使用，例如 `toast.success(t(SUCCESS_MESSAGES.API_KEY_CREATED))`、`toast.error(t(ERROR_MESSAGES.UNEXPECTED))`，**禁止**直接 `toast.success(SUCCESS_MESSAGES.xxx)` 当作最终文案。
  - **状态/选项的 label**：在常量中统一用 **labelKey**（字符串，即 i18n 键），组件中通过 `t(config.labelKey)` 渲染；或约定用 `label` 存与 en 一致的 key 字符串，组件用 `t(config.label)`。同一 feature 内只采用一种方式，避免混用。
  - **新增此类常量时**：同步在 `src/i18n/static-keys.ts` 中登记对应 key（若项目用其做提取），或确保文案以 `t('...')` 字面量形式出现以便扫描，避免遗漏翻译。

### 3.2 代码风格与类型

- **表达式**：禁止 2 层及以上嵌套三元表达式；改用 `if-else`、提前返回或抽取函数。单层三元可保留，但需简洁。
- **可读性**：控制函数圈复杂度，复杂逻辑拆成小函数；变量与函数命名需有意义，遵循驼峰等常规约定。
- **TypeScript**：避免 `any`，优先具体类型或 `unknown`；为参数与返回值显式标注类型；仅类型用途的导入使用 `import type { X } from '...'`。
- **类型检查**：通常在完整相关改动批次后执行类型检查（如 `bun run typecheck`），不按每次文件保存执行；Canvas 大型 UI 的例外与最终时机以 [Web 入口](../../web/AGENTS.md#canvas-ui-iteration-exception) 为准。本次改动引入的类型错误须修复；迭代时用最小支持的检查核验接缝，不能为诊断无关错误擅自跑被禁止的全量检查或扩展修复范围。未覆盖的全项目结果和无关诊断明确记录，最终门禁失败不能标记完成。
- **Lint 检查**：每个完整相关改动批次交付前，合并对所涉及文件执行 lint 检查，并修复这些文件中的所有 lint error；不得遗留 error。warning 可按变更范围与风险评估处理。
- **解构**：对象非必要不要进行解构，特别是组件的 props；直接使用 `props.xxx` 更清晰，避免不必要的解构增加代码复杂度。

### 3.3 组件

- 使用函数式组件与 Hooks，单一职责；组件 props 须有明确类型（接口或类型别名）。
- **Props 使用**：组件 props 非必要不要解构，直接使用 `props.xxx` 访问属性，保持代码清晰（详见 [3.2 代码风格与类型](#32-代码风格与类型)）。
- 单文件超过约 200 行时考虑拆分子组件或将逻辑抽到自定义 Hooks；类型定义可与组件同文件或放在同模块的 `types` 中。

### 3.4 性能

- **React**：合理使用 `useMemo`、`useCallback` 减少无效重渲染；避免在渲染路径中创建新对象/数组；必要时使用 `React.memo`。
- **代码分割**：使用 `React.lazy` 与动态 `import` 做按需加载，控制首屏与路由体积。
- **资源**：图片选用合适格式与尺寸，大列表考虑虚拟滚动（如 @tanstack/react-virtual），大量图片考虑懒加载。

### 3.5 状态管理

- 使用 Zustand 的 `create` 定义 store，并为 state 与 actions 定义清晰类型。
- 组件内优先用选择器订阅，避免整 store 订阅导致多余渲染，例如：`const user = useAuthStore((s) => s.auth.user)`。
- 需持久化的状态在 store 内读写 localStorage，并在初始化时恢复。
- Store 按功能放在 `src/stores/`，单文件职责清晰，命名表意明确。

### 3.6 API 请求

- **React Query**：数据获取用 `useQuery`，变更用 `useMutation`；为每个查询配置唯一 `queryKey`（建议数组形式、层级一致）；在 `onSuccess` 中对相关 query 做 `invalidateQueries`，可配合乐观更新。服务端错误统一通过 `handleServerError` 处理（详见 [3.9 错误处理](#39-错误处理)）。
- **Axios**：使用项目统一的 `api` 实例（含 `baseURL`、`headers`、`withCredentials: true`）；GET 默认请求去重，特殊请求可通过配置关闭；认证与通用错误在拦截器中处理。

### 3.7 表单

- Canvas Cloud 表单、字段校验、多语言和数据表一致性同时遵循[工作区表单一致性规则](../../../docs/agent-guides/ui-form-consistency.md)；Cloud API 是业务校验真源，本前端复用 New API 设计系统并镜像可提前判断的规则。
- 使用 React Hook Form + Zod：在功能模块的 `lib/` 下定义 schema，并用 `z.infer` 导出表单类型；`useForm` 配合 `@hookform/resolvers/zod` 做校验。
- 提交逻辑放在 `onSubmit`，展示加载与错误状态；成功后视场景重置表单或关闭弹窗。服务端校验错误映射到对应字段并展示（字段级错误展示方式见 [3.9 错误处理](#39-错误处理)）。

### 3.8 路由

- 使用 TanStack Router，路由文件位于 `src/routes/`，通过 `createFileRoute` 定义；搜索参数用 Zod schema + `validateSearch` 校验。
- 在 `beforeLoad` 中做认证与重定向，避免不必要的请求；嵌套结构用布局路由与 `_authenticated` 等前缀，子路由通过 `<Outlet />` 渲染。
- 导航使用 `useNavigate` 或 `Link`，保持类型安全，避免直接操作 `window.location`。

### 3.9 错误处理

- **服务端错误**：统一使用 `handleServerError`，在 React Query 全局配置与拦截器中接入；按 HTTP 状态码给出合适提示，文案使用 i18n。
- **展示**：使用 `toast.error` 等统一方式；路由级错误由 `errorComponent` 承接，提供友好错误页并记录便于排查的信息。
- **表单**：校验与服务端错误映射到字段后，在字段下方展示；使用 `form.setError` 等与表单库一致的方式。

### 3.10 样式

- 以 Tailwind 工具类为主，动态类名用 `cn()` 合并；非动态场景避免内联样式。
- 响应式采用移动优先与 Tailwind 断点（`sm:`、`md:`、`lg:` 等）；主题与暗色用 CSS 变量与 `dark:`，自定义样式集中在 `src/styles/`，组件内尽量少写自定义 CSS。

### 3.11 文件组织

- **功能模块**：置于 `src/features/<feature>/`，内含 `components/`、`lib/`、`hooks/`，以及按需的 `api.ts`、`types.ts`、`constants.ts`、入口组件等。
- **通用**：通用组件放 `src/components/`，通用工具与类型放 `src/lib/`；组件文件 PascalCase，工具/类型文件 kebab-case 或 `types.ts`，类型使用 PascalCase 命名并 `export type`。

### 3.12 可访问性

- 使用语义化 HTML（如 `header`、`nav`、`main`、`footer`），表单用 `label` 关联输入。
- 保证键盘可操作与焦点顺序合理；必要时使用 ARIA（如 `aria-label`、`aria-expanded`、`aria-hidden`）；装饰性图标加 `aria-hidden="true"`，重要信息提供文本等价。
- 对比度满足 WCAG 2.1 AA（正文至少 4.5:1）。

### 3.13 安全

- 认证与权限在路由与接口层校验；敏感操作增加二次确认等。
- 前后端均做数据校验（如 Zod），不信任仅前端校验；敏感信息不落前端存储，配置用环境变量，禁止硬编码密钥。
- 依赖 React 默认转义，慎用 `dangerouslySetInnerHTML`；跨域与 Cookie 使用 `withCredentials` 并按后端要求处理 CSRF。

### 3.14 测试

- Canvas UI iteration and the sole aggregate Docker gate are defined in [`web/AGENTS.md`](../../web/AGENTS.md); do not duplicate or override them here.
- 工具函数与纯逻辑优先单元测试（Vitest），测试文件 `*.test.ts`；组件用 React Testing Library 测交互与行为，避免测实现细节。
- 新增功能、行为变更及可达回归风险须由有效测试覆盖；优先更新或复用对应已有用例，不为已有充分覆盖机械新增测试。可自动复现的 Bug 保留修复前失败、修复后通过证据。仅文案或纯视觉微调按 Canvas 迭代边界执行，不能用 class 快照代替实际视觉判断。
- 焦点、键盘、选中／禁用、加载／错误或响应式交互变化须保护对应可观察行为。布局、尺寸与滚动调整只针对明确结构／交互风险补最小自动回归；纯视觉仍按工作区规则核验，不强制每次样式微调新建测试。
- 功能模块或组件模块的测试必须放在该模块专属的 `__tests__/` 目录中，例如 `src/components/model-group-selector/__tests__/layout.test.ts`；禁止将新增测试文件与正式代码文件平铺在同一目录。
- 测试文件按被测职责命名，例如 `layout.test.ts`、`selection.test.ts`、`validation.test.ts`；一个测试文件只覆盖一个明确模块或职责，避免形成跨模块的超大测试文件。
- 每个测试用例应只保护一个可描述的行为，名称必须包含触发条件和预期结果；优先使用 Arrange、Act、Assert 的清晰结构，避免在单个用例中混合多个无关断言。
- 测试必须覆盖主要成功路径以及本次变更涉及的关键边界和失败路径，包括空数据、单项和多项数据、超长文本、无效输入、禁用状态、异步失败与降级逻辑；不得为了数量机械枚举不相关输入。
- 布局测试应断言明确且稳定的行为契约，例如固定尺寸、排列方向、溢出策略、滚动目标和降级路径；不要仅断言组件能够渲染，也不要依赖浏览器像素误差、浏览器私有实现或脆弱的完整 class 字符串快照。
- 组件交互测试应从用户视角查询元素并执行点击、输入、键盘和焦点操作，断言可见结果、可访问状态或对外回调；禁止直接断言组件内部 state、私有函数调用次数或无用户意义的 DOM 层级。
- 涉及可访问性的组件必须覆盖可访问名称、键盘可操作性，以及 `aria-expanded`、`aria-selected`、`aria-disabled`、`aria-invalid` 等与视觉状态一致的属性。
- 涉及 i18n 文案的测试优先通过稳定的角色、label 或翻译键语义定位元素，避免将某一种语言的完整展示文案作为与业务无关的脆弱断言；若翻译内容本身是契约，则应明确覆盖语言切换或 fallback 行为。
- 异步测试必须等待明确的界面状态或 Promise 结果，不得使用固定 `sleep`、依赖执行耗时或制造竞态；定时器、网络请求和浏览器 API 仅在必要边界进行可控 mock，并在每个用例后恢复。
- 优先测试真实代码路径；只有外部网络、时间、随机数、存储或浏览器 API 等不可控边界可以 mock。禁止 mock 被测模块自身，也不要通过复制生产逻辑到测试中计算期望结果。
- 测试数据应使用最小且具有业务含义的显式 fixture，测试内部必须独立初始化并清理全局状态、缓存、localStorage、mock 和定时器，确保用例可单独运行且不依赖执行顺序。
- 快照测试仅适用于稳定且人工可审查的结构输出；交互组件、复杂 DOM 和 Tailwind class 列表不得使用大范围快照代替行为断言。
- 关键流程补充集成与 E2E（如 MSW 模拟 API、Playwright/Cypress）；核心功能目标覆盖率 80% 以上，关注业务路径与关键分支。
- 测试必须保护真实用户行为、稳定 API 契约或明确回归路径；禁止为了覆盖率添加 smoke、sleep/timing、随机输入、日志输出或只证明代码运行的测试。
- 新增或大幅重写测试时优先使用 Vitest 与 React Testing Library 的标准断言和查询方式，避免手写通用断言辅助函数；只有表达项目特定业务不变量时才抽取测试 helper。
- 清理测试时先合并重复场景、删除不明不白的实现细节断言；若旧测试间接覆盖了真实契约，需替换为更小、更直接的行为测试。
- 未使用聚合门禁时，提交前必须至少运行受影响测试文件，并根据影响范围执行相关测试集、`bun run typecheck` 和涉及文件的 lint；使用上述聚合门禁时以其一次完整结果为准，不重复执行子命令。不得在未看到最新通过结果的情况下声明测试完成。

### 3.15 依赖管理

- 使用 **Bun**：`bun install`、`bun add <pkg>`、`bun add -d <pkg>`、`bun remove <pkg>`、`bun pm ls`、`bun update` 等。
- 新增依赖前评估维护情况、体积与许可；生产与开发依赖区分清楚，版本用 `^`/`~` 控制，定期更新以获取安全修复。

### 3.16 构建与部署

- 使用 Rsbuild，配置见 `rsbuild.config.ts`；脚本以 `package.json` 为准（如 `bun run dev`、`bun run build`、`bun run typecheck`、`bun run lint`、`bun run format`），包管理见 [3.15 依赖管理](#315-依赖管理)。
- 代码分割与懒加载策略见 [3.4 性能](#34-性能)；资源使用合适格式与压缩，环境变量用 `.env` 且以 `VITE_` 前缀，不在代码中硬编码。
- **发布前**：执行 [Web 唯一门禁](../../web/AGENTS.md#frozen-candidate-gate)，另行检查产物体积与环境变量配置；不重复聚合门禁已覆盖的阶段。

---

## 四、协作与提交

- 提交信息清晰、符合项目约定，描述变更内容与原因，中英文统一即可。
- 变更需经过代码审查，符合本文档规范，并关注质量、性能与安全。
- 重大功能或规范变更时更新相关文档与 `AGENTS.md`。

---
