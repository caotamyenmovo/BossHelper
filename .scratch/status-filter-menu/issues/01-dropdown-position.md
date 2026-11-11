# 修复状态过滤向上展开

Type: task
Status: resolved
Blocked by: None

## Answer

原因：JobCards.vue 将菜单明确设为 side: top，菜单向上展开并被固定工具栏遮住。改为 bottom、end，关闭垂直翻转，并限制菜单高度为 24rem 与当前可用高度中的较小值。选项列表内部滚动，顶部批量操作区不参与收缩。

浏览器回归脚本 scripts/delivery-layout-browser.mjs 在修改前准确失败：期望 bottom，实际 top。修改后通过普通列表及长列表在 1440、700、390 像素窗口下的方向、边界、滚动和状态选择检查。vue-tsc 与 Chrome 构建通过。

## Comments

2026-11-11：仅修改 C 盘项目，未同步 F 盘副本，未推送远程。
