# 修复外观设置

Type: task
Status: resolved
Blocked by: None

## Answer

页面级效果迁移至 usePageAppearance，支持开关还原及卸载清理；恢复卡片遮罩和鼠标清晰区域，兼容键盘与触屏；侧栏宽度通过 CSS 变量即时更新并限制窗口宽度；底部间距直接绑定容器；偏移使用独立开关并兼容旧配置；设置页补齐用途、单位、范围及恢复默认。

最终验证：npm run check、npm run build:chrome、BOSS_TEST_APPEARANCE=1 node scripts/delivery-layout-browser.mjs 全部通过。浏览器覆盖标题和图标还原、导航隐藏、卡片模糊、宽度和偏移、表格高度、侧栏开关和位置、保存刷新、旧偏移配置兼容、窄窗口及恢复默认。桌面与窄窗口截图已检查。未执行真实投递或 AI 请求。

仅修改 C 盘项目，未同步 F 盘，未推送远程。

## Comments

2026-11-11：修复前运行 BOSS_TEST_APPEARANCE=1 node scripts/delivery-layout-browser.mjs，关闭动态标题后测试准确失败：实际仍为 0/120 - 在线计算器，期望恢复原页面标题。

原因：旧外观页只在开启图标、标题时写入 DOM，没有关闭还原；卡片重排后缺少遮罩；侧栏宽度依赖查询动态挂载元素；页面级效果依赖设置组件挂载。原生岗位区域的偏移监听还绑定到可能被存储加载替换的旧对象。
