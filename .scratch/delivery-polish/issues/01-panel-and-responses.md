# 投递面板优化与 Responses 流兼容
Type: task
Status: resolved
Blocked by: None

用户截图：岗位卡片横向溢出、标签拥挤；AI 的 response.created 通知触发全屏校验错误。延续雾蓝灰风格，使用自适应岗位网格、精简标签并保留展开入口，控制和过滤集中。通过真实模型工厂及 SDK 重放截图响应，修复兼容问题并将技术详情折叠展示。仅 C 盘，不推送。

## Answer

截图响应复现：初始测试 1 pass / 2 fail，缺少 created_at 和 model 的开始通知触发同一校验错误；完整元数据对照通过。共享 Responses transport 只省略缺失元数据的 created/in_progress 通知，不补造服务端信息、不吞正文错误或 response.failed。工作台与面试使用可折叠技术详情。

岗位改为自动换行网格，标签去重可展开，学历经验单列，加入详情入口及顶部卡片／表格切换、跟随与过滤。保留现有操作绑定。类型检查、Chrome 构建、28 项相关测试通过；浏览器验证 15 岗位、1440/700/390 窗口、浅深色、过滤、表格、暂停继续和本地 Responses 中转兼容／错误显示。

## Retrospective

原流式测试覆盖 Chat Completions 和终止标记，未经过真实模型工厂验证 Responses 生命周期事件。新增 responses-compat.test.ts 覆盖这个边界，浏览器流程增加真实扩展到本地 Responses 中转的链路。布局测试从 2 个短岗位扩展到 15 个多标签岗位并断言横向溢出，可检测本次截图问题；控制台错误也纳入失败条件。
