# CarPay

[![React](https://img.shields.io/badge/React-18-61dafb?logo=react&logoColor=white)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Vite](https://img.shields.io/badge/Vite-5-646cff?logo=vite&logoColor=white)](https://vitejs.dev)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3-06b6d4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)

用车全周期成本计算：购车落地 → 用车持有 → 卖车残值，三段贯通算清一台车的真实总账。纯前端离线运行，数据仅保存在浏览器 localStorage，不上传任何服务器。

在线使用：<https://colflip.github.io/carpay/>

## 功能

- **购车测算**：车价构成（裸车原价 / 选装包 / 官方优惠 / 门店优惠 / 金融返点）、置换 / 报废 / 首购 / 保险补贴，计税基数实时联动
- **购置税三档位**：全额 10% / 减半 5%（自动套用每辆 1.5 万减税上限，2026-2027 新能源政策）/ 免征；自动按 计税基数 ÷ 1.13 × 税率 计算，支持手动覆盖与一键恢复
- **税费保险杂费**：车船税（按排量档提示，纯电默认 0）、交强险、商业险、上牌费、服务费均可修改；所有金额输入框实时显示中文大写防量级输错
- **三种付款方式**：全款 / 首付分期 / 额度贷款；等额本息月供；支持前 N 期免息贴息方案（如「5年2年免息」= 期数 60 + 免息 24）与到期一次性结清的提前还款（结清前利息按免息口径累计，另计手续费）
- **汇总卡片**：车型回显、支出构成条形图、分层明细、落地总价 + 大写金额、较全款多付 / 少付对比、免责声明
- **用车成本**：持有 1-10 年测算——能源三态（汽油 / 插混按纯电里程占比加权 / 纯电综合电价）、保险续保 NCD 逐年递减（0.85 / 0.70 / 0.50，含「第 3 年出险 1 次」情景与固定原价模式）、车船税、保养按里程折算次数（小保养 + 大保养加价）、易损件周期更换（轮胎 / 刹车片按公里，电瓶 / 雨刮 / 年检按年）、停车洗车路桥月费；城市档位一键套用停车与洗车默认值
- **用车成本产出**：月均主数字 + 年均 / 每公里 / 持有期合计、构成占比条形图、逐年成本明细表、油 / 插混 / 电同参数对比、可开关的折旧参考行（流通协会保值率曲线，衔接卖车损益口径）、全周期净支出 = 落地总价 + 用车成本 − 预估残值
- **卖车损益**：卖出年份 + 月份粒度（能源杂项按月折算）——残值双口径（保值率曲线 × 成交价/指导价，或直接填二手车平台手动卖价）、里程修正（偏离年均 2 万 km 按每万 km 1.5 个百分点调整，上限 ±10%）、贷款按卖出月截断（月供计至卖出月、结清余额从卖款内扣、利息止于卖出月）、过户/整备/平台费用、在保保费按剩余月份退保回收
- **卖车损益产出**：到手价 + 全周期净支出主数字 + 年均持有成本 / 每公里成本、年均成本走势迷你图、逐年净支出表（1-10 年年末口径 + 最优卖出年高亮）、个人直卖 / 4S 置换 / 车商收车三渠道到手价区间、全周期油电对比（落地价按 2026 政策区分税档）、卖车流程清单（违章 ETC / 解押 / 退保 / 开票 / 置换补贴资格）
- **导出**：复制明细文本 / 导出 txt / 导出与分享品牌海报 PNG（含 CarPay 页眉、来源页脚：生成时间、站点二维码，微信等聊天工具可直接发图）；明暗主题；表单与主题 localStorage 持久化

## 计算口径

- 计税基数 = 裸车原价 + 选装包 − 官方优惠 − 门店优惠 − 金融返点（贷款时冲减开票价，并同额降低首付与月供基数）
- 补贴直接抵扣总价，不参与计税；贷款落地总价 = 首付 + 月供 × 实际期数 + 结清款 + 税险杂 − 补贴
- 用车成本与购车口径衔接：首年保险与车船税已计入购车落地总价，用车成本仅计第 2 年起的续保（按 NCD 折扣）与车船税，不重复计算；折旧视为机会成本不计入现金支出，仅在折旧参考行展示
- 卖车损益防双算：全周期净支出 = 落地总价（按卖出月截断贷款）+ 用车成本（按卖出时点截断）− 卖车到手价（卖价 − 贷款结清余额 − 结清手续费 − 卖出费用）− 保险退保回收；置换/报废/首购/保险补贴已在购车页抵扣，卖车侧不重复计算；结清余额从卖车款中扣除而非计入支出侧

## 项目结构

```tree
carpay
├─ index.html                    # favicon 与主题预置脚本
├─ src
│  ├─ main.tsx / App.tsx
│  ├─ index.css                  # Tailwind 基础样式
│  └─ components
│     ├─ CarPayCalculator.tsx    # 主壳：导航、购车测算 UI 与导出
│     ├─ buyModel.ts             # 购车测算类型、默认值与计算
│     ├─ ownCostModel.ts         # 用车成本类型、默认值、NCD/保养/易损/残值计算与明细文本
│     ├─ OwnCostPanel.tsx        # 用车成本面板 UI
│     ├─ sellModel.ts            # 卖车损益：贷款截断、残值三模式、逐年净支出、渠道与油电对比
│     ├─ SellPanel.tsx           # 卖车损益面板 UI
│     ├─ sharePoster.ts          # 导出/分享品牌海报（卡片克隆 + 来源页脚 + 站点二维码）
│     └─ shared.tsx              # 共享 UI 原语（LabelInput/Tip/ToggleGroup 等）与工具函数
├─ .github/workflows/deploy.yml  # push main 自动构建发布 GitHub Pages
└─ vite.config.ts                # base './'，支持子路径部署
```

## 技术栈

| 模块     | 技术                                                        |
| -------- | ----------------------------------------------------------- |
| 框架     | React 18 + TypeScript（strict，tsc --noEmit 门禁）          |
| 构建     | Vite 5                                                      |
| 样式     | Tailwind CSS 3（class 暗色模式）+ lucide-react 图标         |
| 动效     | Framer Motion（Tab 指示器 / 面板过渡 / 金额 spring 数字）   |
| 导出图片 | html-to-image + qrcode（均按需动态分包，不增大首屏）         |
| 持久化   | localStorage（`carpay:buy-form:v1` / `carpay:own-form:v1` / `carpay:sell-form:v1` / `carpay:theme`） |
| 部署     | GitHub Actions → GitHub Pages                               |

## 开发

```bash
npm install
npm run dev       # 本地开发
npm run build     # 类型检查 + 构建
npm run preview   # 本地预览构建产物
```

## License

[MIT](./LICENSE) © colflip
