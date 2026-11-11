# 来源编号与建议栏跟随

Type: task
Status: resolved
Blocked by: None

## Answer

帖子标题前增加两位顺序编号徽标，适配浅色和深色主题。research-result-column 使用 sticky、20px 顶部留白与视口高度限制，长建议和折叠内容可在栏内滚动；1100px 以下单栏布局取消固定及高度限制。

验证：类型检查、Chrome 构建、scripts/ui-layout-browser.mjs 均通过。使用 12 条模拟来源验证顺序编号、页面滚动 900px 后建议栏仍可见、长内容滚动及底部操作可访问、窄窗口无横向溢出，并检查浅色与深色截图。未调用真实检索或 AI。

## Comments

仅修改 C 盘项目，未同步 F 盘，未推送 GitHub。
