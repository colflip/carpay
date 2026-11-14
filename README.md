# CarPay

[![version](https://img.shields.io/badge/version-0.3.0-blue.svg?style=flat-square)](https://github.com/colflip/carpay) [![license](https://img.shields.io/badge/license-MIT-green.svg?style=flat-square)](./LICENSE)

一款**用车全周期成本计算器**，以「购车落地 → 用车持有 → 卖车损益」三段贯通的口径算清一台车的真实总账。纯前端离线运行，数据仅保存在浏览器本地，不上传任何服务器。

**购车**以成交价与开票价双口径拆分车价构成，按 2026-2027 政策自动套用购置税三档与置换 / 报废 / 首购 / 保险四类补贴，支持全款、首付分期与定额贷款；**用车**按持有 1-10 年测算能源、保险 NCD、车船税、保养与杂项，输出月均 / 年均 / 每公里与逐年明细；**卖车**支持卖出年月双粒度、三种残值模式与里程修正，产出到手价、最优卖出年与全周期净支出。三段共用一套防双算口径，折旧作为机会成本单独呈现。

在线体验：<https://colflip.github.io/carpay/>

本项目基于 [MIT](./LICENSE) 开源。
