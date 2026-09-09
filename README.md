# 电商业务插件

为支持 Agent Skills 的 AI 环境提供任务说明、必要执行资源与真实示例。每个目录是独立 Package，目前以 Skill 为主要组成。

## 插件目录

| 插件 | 说明 |
| --- | --- |
| 单品价值链测算 | [unit-economics](skills/unit-economics/SKILL.md) |
| 活动合作利润测算 | [live-taoke](skills/live-taoke/SKILL.md) |
| 大促优惠测算 | [promotion-calculator](skills/promotion-calculator/SKILL.md) |
| 万相台阶段对比分析 | [universalbp-analysis](skills/universalbp-analysis/SKILL.md) |
| 图片与文案基础检查 | [extreme-word-checker](skills/extreme-word-checker/SKILL.md) |
| 投放出价上限测算 | [ad-roi-calculator](skills/ad-roi-calculator/SKILL.md) |
| 运费险成本对比 | [return-freight-calculator](skills/return-freight-calculator/SKILL.md) |
| 店铺经营日报 | [store-daily-report](skills/store-daily-report/SKILL.md) |

## 使用

先读取对应目录的 SKILL.md，检查运行依赖。按 manifest.json 获取完整文件，保留相对目录结构；将目录放入目标 AI 官方支持的 Skill 搜索位置，再按该环境要求刷新并检查是否发现。已有同名 Skill 时先检查差异。

需要支持文件读取和命令执行的 AI。店铺经营日报使用 Python 3.10+，Excel 需要 openpyxl，自动 PDF 可选 Chrome/Chromium + pypdf，无需数据库。其余脚本包需要 Node.js 22.18+；万相台处理 Excel 额外需要 xlsx；图片检查需要目标 AI 的视觉/OCR 能力。具体边界以各 Skill 为准。各 AI 的安装与自动发现仍待逐项验证。

安装后提出业务任务并提供自己的资料；示例文件用于演示，不作为缺失业务数据的默认值。

本仓库只包含分发所需的说明、执行资源和示例。
