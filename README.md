# CarPay

[![version](https://img.shields.io/badge/version-0.3.0-blue.svg?style=flat-square)](https://github.com/colflip/carpay) [![license](https://img.shields.io/badge/license-MIT-green.svg?style=flat-square)](./LICENSE) [![react](https://img.shields.io/badge/react-18-61dafb.svg?style=flat-square)](https://react.dev) [![typescript](https://img.shields.io/badge/typescript-5-3178c6.svg?style=flat-square)](https://www.typescriptlang.org) [![vite](https://img.shields.io/badge/vite-5-646cff.svg?style=flat-square)](https://vitejs.dev)

一款**用车全周期成本计算器**，以「购车落地 → 用车持有 → 卖车损益」三段贯通的口径算清一台车的真实总账。纯前端离线运行，数据仅保存在浏览器 `localStorage`，不上传任何服务器；在线使用：<https://colflip.github.io/carpay/>。

**购车测算**以*成交价*与*计税基数（开票价）*双口径拆分车价构成（裸车原价 / 选装包 / 官方与门店优惠 / 金融返点），购置税按 **全额 10% / 减半 5% / 免征** 三档自动套用 2026-2027 新能源政策（减半含每辆 1.5 万元减税上限），支持手动改写与一键恢复；置换 / 报废 / 首购 / 保险四类补贴按 2026 以旧换新比例联动开票价计算，直接抵扣落地总价；付款覆盖全款、首付分期与额度贷款，等额本息月供支持*前 N 期免息*与*第 N 期提前结清*。

**用车成本**按持有 1-10 年测算：能源三态（汽油 / 插混按纯电里程占比加权 / 纯电）、保险续保 NCD 逐年递减（0.85 / 0.70 / 0.50，含出险情景与固定原价模式）、车船税、按里程折算的保养与易损件更换、停车洗车路桥杂项与城市档位预设；输出月均 / 年均 / 每公里 / 逐年明细与油电对比，折旧作为*机会成本*仅提供可开关的参考行。

**卖车损益**支持卖出年月双粒度：残值三模式（保值率曲线 / 残值率覆盖 / 手动卖价）与里程修正，贷款按卖出月截断、结清余额从卖款内扣，在保商业险按剩余月份退保回收；产出到手价、全周期净支出、逐年净支出表与最优卖出年、三渠道到手价区间、全周期油电对比与卖车流程清单。

三段共用一套**防双算口径**：购车落地总价已含首年保险与车船税，用车侧仅计第 2 年起；补贴只在购车页抵扣一次；贷款月供计至卖出月、结清余额在卖车款内扣除；折旧通过卖车款变现，不计现金支出。明细与导出（复制文本 / txt / 品牌海报 PNG，含站点二维码）均随此口径生成，明暗主题与表单状态本地持久化。

```
carpay/
├── .github/
│   └── workflows/deploy.yml
├── src/
│   ├── components/
│   │   ├── CarPayCalculator.tsx
│   │   ├── OwnCostPanel.tsx
│   │   ├── SellPanel.tsx
│   │   ├── sharePoster.ts
│   │   └── shared.tsx
│   ├── models/
│   │   ├── buyModel.ts
│   │   ├── models.test.ts
│   │   ├── ownCostModel.ts
│   │   └── sellModel.ts
│   ├── App.tsx
│   ├── index.css
│   └── main.tsx
├── .gitignore
├── index.html
├── LICENSE
├── package.json
├── package-lock.json
├── postcss.config.js
├── tailwind.config.js
├── tsconfig.json
└── vite.config.ts
```

## 技术栈

| 模块 | 技术栈 |
| :--- | :--- |
| 框架 | React 18 + TypeScript（strict，`tsc --noEmit` 门禁） |
| 构建 | Vite 5（`base: './'`，支持子路径部署） |
| 样式 | Tailwind CSS 3（class 暗色模式）+ lucide-react |
| 动效 | Framer Motion（Tab 指示器 / 布局滑块 / spring 数字） |
| 导出 | html-to-image + qrcode（均动态分包，不增大首屏） |
| 测试 | Vitest（购车 / 用车 / 卖车模型回归） |
| 持久化 | localStorage（`carpay:buy-form:v1` / `carpay:own-form:v1` / `carpay:sell-form:v1` / `carpay:theme`） |
| 部署 | GitHub Actions → GitHub Pages（push main 自动测试、构建、发布） |

本地开发：`npm install && npm run dev`；测试 `npm test`；类型检查 `npm run typecheck`；构建 `npm run build`。

本项目基于 [MIT](./LICENSE) 开源。

---

A full-life-cycle vehicle cost calculator that chains **purchase → ownership → resale** into one account. Pure front-end, fully offline; data stays in browser `localStorage`. Live: <https://colflip.github.io/carpay/>.

Purchase models *deal price* and *tax base (invoiced price)* separately, applies purchase tax in three tiers (10% full / 5% half with the ¥15k-per-vehicle cap for NEVs 2026-2027 / exempt) with manual override, links trade-in / scrappage / first-purchase / insurance subsidies to the 2026 policy rates on the invoiced price, and covers full cash, down-payment installments, and fixed-amount loans with annuity schedules, interest-free periods, and early settlement. Ownership projects 1-10 years across three energy types with NCD renewal discounts (0.85 / 0.70 / 0.50 and claim scenarios), vessel tax, mileage-driven maintenance and wear parts, and parking / washing / toll presets, outputting monthly / yearly / per-km costs, a year-by-year table, and a gas vs. PHEV vs. BEV comparison. Resale adds sell-year-plus-month granularity, three residual modes with mileage adjustment, loan truncation at the sale month, commercial-insurance refunds pro-rated by remaining months, net proceeds, the best year to sell, channel quotes, and a cross-energy comparison.

All three stages share a **no-double-counting** ledger: first-year insurance and vessel tax live in the purchase total, subsidies are deducted only at purchase, loan repayment stops at the sale month, and depreciation is realized through the sale price. Released under [MIT](./LICENSE).
