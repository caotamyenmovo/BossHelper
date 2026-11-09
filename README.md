> [!CAUTION]
> 本项目仅供学习交流，禁止用于商业用途
>
> 使用该脚本有一定风险(如黑号,封号,权重降低等)，本项目不承担任何责任

| Chrome                                                                                                                                                                                             | Crx搜搜                                                                                                                                           | Edge                                                                                                                                                                                                                                                                                                                           | FireFox                                                                                                                                   | Github                                                                                                                                |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| [![Chrome Web Store](https://img.shields.io/chrome-web-store/v/ogkmgjbagackkdlcibcailacnncgonbn?label=Chrome插件商店)](https://chrome.google.com/webstore/detail/ogkmgjbagackkdlcibcailacnncgonbn) | [![Crx 搜搜](https://img.shields.io/badge/Crx搜索-v%3F.%3F.%3F-EF7C3D)](https://www.crxsoso.com/webstore/detail/ogkmgjbagackkdlcibcailacnncgonbn) | [![Edge Web Store](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fmicrosoftedge.microsoft.com%2Faddons%2Fgetproductdetailsbycrxid%2Fjcllnbjfeamhihjpfjlclhdnjmggbgal&query=version&prefix=v&label=Edge插件商店&color=EF7C3D)](https://microsoftedge.microsoft.com/addons/detail/jcllnbjfeamhihjpfjlclhdnjmggbgal) | [![Firefox](https://img.shields.io/amo/v/boss-helper?label=Mozilla插件商店)](https://addons.mozilla.org/zh-TW/firefox/addon/boss-helper/) | [![GitHub Release](https://img.shields.io/github/v/release/Ocyss/boss-helper)](https://github.com/Ocyss/boss-helper/releases/latest/) |

> **国内**: 如果无法访问 `Chrome插件商店` , 请使用 `Crx搜搜` 或 `Edge插件商店` 安装

## 项目介绍

Boss直聘助手, 皆在减少投递简历的麻烦, 和提高投递简历的效率, 技术栈使用WXT + Vue3 + NuxtUI@4 + TailwindCSS@4, 开源在 Github

> 本项目处于积极维护状态, 一直很忙所以拖了比较久才开源，抱歉了~

## 本地求职工作台改造说明

本地版本在原有 Boss 直聘助手上增加了求职工作台，入口位于扩展选项页。工作台包含简历档案、求职经验整理、文字模拟面试和面试记录。原有 Boss 投递、筛选和模型管理功能仍保留。

简历可以从 PDF、DOCX、TXT 文件导入，也可以打开 Boss 个人简历页读取页面当前可见的文字。导入内容会先显示在工作台供检查和编辑，确认后保存到浏览器扩展本地存储。DOC、扫描版 PDF 等无法提取文字的文件需要先转换为可读取格式。Boss 页面需要登录，页面结构变化或权限限制可能导致读取失败；遇到这种情况可登录后重试，或改用文件导入。导入简历不会自动发送给 AI，用户点击识别或分析后才会发送。

简历建议的主要流程是：选择简历 → 填写目标岗位 → 点击“小红书网页检索”或“检索公开内容” → 在感兴趣的帖子下手动点击“读取正文和评论” → 点击“根据检索内容和简历生成修改意见”。搜索只显示帖子卡片，不会自动打开帖子或读取评论。手动读取时会滚动评论区并按需展开回复，将本次已加载评论按页面显示点赞数排序，取前 5 条，显示作者、内容、点赞数和读取范围；不足 5 条则按实际数量展示。遇到登录或验证需在网站页面完成，无法读取的帖子会说明原因，已读取内容会保留。已读帖子可单独重新读取。

AI 会同时收到目标岗位、当前简历、帖子正文/摘要和这些高赞评论，按简历原文、问题、来源依据、建议改写及待补充信息给出意见，区分帖子作者和评论者的观点。仅有标题时不会调用 AI。评论排行仅限本次已加载且点赞数可读的评论，不保证覆盖全帖；原文链接保留供核查。“仅分析简历”在页面底部的可选项中。

生成建议时会实时显示文字，可以停止并保留部分结果。模型配置中的超时用于限制连续无新内容的等待时间；收到正文、思考内容或非流式响应片段时会继续等待，同时保留独立的总时长上限。发生超时会标注结果可能不完整，不会自动重试产生重复请求。

模拟面试可从简历目标岗位选择岗位，也可补充公司和职位描述。开始后 AI 每轮提出一个问题，当前题目、未提交的回答草稿和问答会保存在扩展本地存储，刷新后可从面试记录继续练习；结束后生成逐题反馈、整体亮点、待改进点、示范回答和行动清单。每次面试保留开始时的简历快照，之后修改或删除简历不会改变这次面试的依据。切换或退出面试会隔离旧请求，保存失败保留输入并提示重试。历史面试可以重新查看或删除。

本轮整体优化还包括：显示当前简历和未保存状态；AI 使用当前可见草稿；保存期间继续输入不会被旧保存结果覆盖；切换简历清理旧分析和建议；扩展后台统一处理保存，两个设置页同时操作时保留不同记录，同一记录的旧版本保存会提示冲突。分析和有来源的修改建议会保存为“建议记录”，包含简历快照、岗位、模型名称、来源和生成结果，可查看、标记已处理或删除；中断的结果会标明不完整。小红书读取前检查网站授权，并区分权限、页面连接、超时和访问限制等情况，保留已读取来源。

简历分析、求职建议和面试均复用扩展“AI 模型配置”里的现有模型，不新增单独的 AI 配置；请先配置并检查可用模型。只有点击相应的识别、分析、建议生成或面试操作时，相关文本才会发送给所选模型服务。简历、建议记录及面试数据保存在扩展本地存储，可分别删除。

启用本轮改动：在 Chrome 打开 `chrome://extensions`，找到从本项目加载的 BossHelper，点击重新加载，然后重新打开扩展设置页。加载目录应为本项目的 `.output/chrome-mv3`；若尚未加载，打开开发者模式后用“加载已解压的扩展程序”选择该目录。已打开的 Boss 和小红书标签页也需刷新，使页面脚本更新。小红书提示缺少权限时，在扩展详情的网站访问权限中允许访问小红书后刷新重试。

2026-11-09 验证：`npm run check`、`npm run build:chrome`、`bun test ./scripts/`（116 项全部通过），以及 `node scripts/career-workbench-browser.mjs`、`node scripts/resume-import-browser.mjs`、`node scripts/public-research-browser.mjs`、`node scripts/career-completion-browser.mjs` 全部通过。未安装 Bun 时可用 `npx --yes bun test ./scripts/`。TypeScript 固定为 5.9.3，恢复了 `vue-tsc` 类型检查。浏览器测试使用隔离的 Chrome、模拟 Boss/小红书页面和本地 AI 中转，不访问真实账号资料；Boss 登录态下的真实页面和本机小红书读取仍需在实际账号环境验证。构建仍有原有样式、依赖输出格式及体积警告，不阻止生产包生成。本版本保留现有正式界面，不包含正在制作的 UI 改版样稿。

重新拉取后先运行 `git submodule update --init --recursive`，再安装依赖。主仓库保存了 devlog-ui 的 Vite 环境类型补丁；安装依赖、类型检查和各浏览器构建前会幂等应用，子模块仍跟随原有上游提交。

## 相关链接

唯一交流群:
微信麻烦, 飞书人数限制, 所以只开tg一个~

https://t.me/ocyss_boss_helper

<img alt="交流群" src="./docs/img/tg.png" height="200" />

Github开源地址: <https://github.com/ocyss/boss-helper>

飞书反馈问卷(匿名): <https://gai06vrtbc0.feishu.cn/share/base/form/shrcnmEq2fxH9hM44hqEnoeaj8g>

飞书问卷结果: <https://gai06vrtbc0.feishu.cn/share/base/view/shrcnrg8D0cbLQc89d7Jj7AZgMc>

greasyfork地址(0.2旧版本): <https://greasyfork.org/zh-CN/scripts/491340>

## 项目预览

[![卡片状态](docs/img/shot_2024-04-14_23-08-03.png)](docs/img/shot_2024-04-14_23-08-03.png)
[![账户配置](docs/img/shot_2024-04-14_23-09-05.png)](docs/img/shot_2024-04-14_23-09-05.png)
[![统计界面](docs/img/shot_2024-04-02_22-25-25.png)](docs/img/shot_2024-04-02_22-25-25.png)
[![配置界面](docs/img/shot_2024-04-02_22-26-54.png)](docs/img/shot_2024-04-02_22-26-54.png)
[![日志界面](docs/img/shot_2024-04-02_22-32-25.png)](docs/img/shot_2024-04-02_22-32-25.png)

## TODO

- [x] 优化UI去除广告
- [x] 批量投递简历
- 高级筛选
  - [x] 薪资,公司名,工作名,人数,内容简单筛选
  - 公司地址相关
    > 使用高德api，需要自行申请，或者使用关键字筛选, 暂时只有驾车和步行
    - [x] 驾车/步行距离
    - [x] 驾车/步行时间
  - [ ] 公司风险评控
  - [x] AI筛选
- 自动打招呼
  - [x] 模板语言
  - [x] 支持chatGPT
- AI赋能
  - [x] 多模型管理
- 额外功能(有时间会写)
  - [x] 自适应UI适配手机
  - [ ] 黑名单
  - [x] 多账号管理 (废弃, 改为多配置切换)
  - [ ] 聊天阻止发送已读
  - [ ] boss消息弹窗

## 类似项目

- <https://github.com/Frrrrrrrrank/auto_job__find__chatgpt__rpa>
- <https://github.com/noBaldAaa/find-job>

## 最后

嗯...

## Star 趋势

<a href="https://star-history.dera.page/#ocyss/boss-helper&Date">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://star-history.dera.page/svg?repos=ocyss/boss-helper&type=Date&theme=dark" />
   <source media="(prefers-color-scheme: light)" srcset="https://star-history.dera.page/svg?repos=ocyss/boss-helper&type=Date" />
   <img alt="Star History Chart" src="https://star-history.dera.page/svg?repos=ocyss/boss-helper&type=Date" />
 </picture>
</a>
