# 移除版本入口及商店弹窗
Type: task
Status: resolved
Blocked by: None

按用户截图删除 Boss 面板左上版本徽章、更新提示与点击弹出的扩展商店窗口，清理专用组件及其图标依赖。

## Answer

已移除版本徽章、更新提示、弹窗触发逻辑，删除无其他引用的 Version.vue、StoreIcons.tsx 以及生成声明中的引用。保留 BossHelper 名称。npm run check、Chrome 构建及现有投递布局浏览器检查通过；截图确认版本入口消失。浏览器使用模拟岗位，未执行真实投递。
