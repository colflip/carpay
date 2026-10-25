import { clamp, fmtCNY, num, round2 } from './shared';
import { computeBuy, remainingPrincipalAt } from './buyModel';
import type { BuyForm, Calc as BuyCalc } from './buyModel';
import {
  autoResidualPct,
  ENERGY_PRESETS,
  energyLabel,
  ownCostCumulative,
  type EnergyType,
  type OwnForm,
} from './ownCostModel';

export const SELL_FORM_KEY = 'carpay:sell-form:v1';

export type ResidualMode = 'auto' | 'manual';
export type ResidualBase = 'taxBase' | 'msrp';

export interface SellForm {
  sellYear: string; // 卖出年份 1-10
  sellMonth: string; // 卖出年内第几月 1-12，12 = 年末整年口径
  residualMode: ResidualMode;
  residualBase: ResidualBase;
  residualRatePct: string | null; // auto 模式手动覆盖残值率（%），null = 按曲线
  manualSalePrice: string; // manual 模式卖价（平台估价/成交价）
  mileageAdjust: boolean; // 里程修正：偏离年均 2 万 km 基准时调整残值
  refundFeePct: string; // 退保手续费率 %
  prepFee: string; // 卖前整备费
  transferFee: string; // 过户费
  platformFee: string; // 平台服务费
  otherFee: string; // 其他卖车费用
}

export const DEFAULT_SELL_FORM: SellForm = {
  sellYear: '3',
  sellMonth: '12',
  residualMode: 'auto',
  residualBase: 'taxBase',
  residualRatePct: null,
  manualSalePrice: '',
  mileageAdjust: false,
  refundFeePct: '5',
  prepFee: '0',
  transferFee: '400',
  platformFee: '0',
  otherFee: '0',
};

// 里程修正基准：以年均 2 万 km 为中性，总偏差每 1 万 km 调整残值 1.5 个百分点（低里程溢价、高里程压价），上限 ±10
const MILEAGE_BASE_KM = 20000;
const MILEAGE_STEP_PCT = 1.5;
const MILEAGE_CAP_PCT = 10;

export function mileageAdjPct(annualKm: number, yearFrac: number): number {
  const devKm = (MILEAGE_BASE_KM - annualKm) * yearFrac;
  return clamp(round2((devKm / 10000) * MILEAGE_STEP_PCT), -MILEAGE_CAP_PCT, MILEAGE_CAP_PCT);
}

// 卖出时点的贷款口径：落地总价按卖出月截断（月供计至卖出月，利息止于卖出月），
// 结清余额从卖车款中扣除而非计入支出侧；购车页提前还款早于卖出时视为已结清（沿用其落地总价与手续费）
export interface LoanAtSale {
  hasLoan: boolean;
  truncated: boolean; // 落地价是否按卖出月截断
  settledEarly: boolean; // 购车页提前还款早于卖出
  buyTotal: number; // 计入全周期的购车落地总价
  settleAtSale: number; // 卖出时一次性结清的剩余本金
  settleFee: number; // 结清手续费（沿用购车页输入）
}

export function loanAtSale(buyForm: BuyForm, buyCalc: BuyCalc, sellMonth: number): LoanAtSale {
  if (!buyCalc.isLoan) {
    return { hasLoan: false, truncated: false, settledEarly: false, buyTotal: buyCalc.total, settleAtSale: 0, settleFee: 0 };
  }
  const earlyMonth = buyCalc.earlyRepay ? buyCalc.earlySettleMonth : 0;
  if ((earlyMonth > 0 && earlyMonth <= sellMonth) || sellMonth >= buyCalc.months) {
    return {
      hasLoan: true,
      truncated: false,
      settledEarly: earlyMonth > 0 && earlyMonth <= sellMonth,
      buyTotal: buyCalc.total,
      settleAtSale: 0,
      settleFee: 0,
    };
  }
  // 截断口径：首付 + 月供至卖出月（车价与已产生利息）+ 购置税/车船税/首年险/杂费 − 补贴；
  // 注意不能加含车价的 baseTotal，否则车价重复计入
  const extras = buyCalc.purchaseTax + buyCalc.vessel + buyCalc.insuranceTotal + buyCalc.feesTotal;
  return {
    hasLoan: true,
    truncated: true,
    settledEarly: false,
    buyTotal: round2(buyCalc.down + buyCalc.monthly * sellMonth + extras - buyCalc.subsNonLoan),
    settleAtSale: remainingPrincipalAt(
      buyCalc.principal,
      buyCalc.monthly,
      num(buyForm.annualRatePct),
      buyCalc.freeMonths,
      sellMonth,
    ),
    settleFee: num(buyForm.earlyRepayFee),
  };
}

interface PointInput {
  own: OwnForm;
  buyForm: BuyForm;
  buyCalc: BuyCalc;
  yearFrac: number;
  sellMonthAbs: number; // 绝对卖出月 = (卖出年-1)×12 + 年内月份
  monthInYear: number; // 年内月份（退保折算用，12 = 整年无退保）
  salePrice: number;
  fees: number;
  refundFeePct: number;
}

interface PointResult {
  ownTotal: number;
  lastPremium: number;
  loan: LoanAtSale;
  salePrice: number;
  netProceeds: number;
  refund: number;
  fullNet: number;
}

function evalPoint(p: PointInput): PointResult {
  const { total: ownTotal, lastPremium } = ownCostCumulative(p.own, p.yearFrac);
  const loan = loanAtSale(p.buyForm, p.buyCalc, p.sellMonthAbs);
  const netProceeds = round2(p.salePrice - loan.settleAtSale - loan.settleFee - p.fees);
  const refund =
    p.monthInYear < 12
      ? round2(lastPremium * ((12 - p.monthInYear) / 12) * (1 - clamp(p.refundFeePct, 0, 100) / 100))
      : 0;
  const fullNet = round2(loan.buyTotal + ownTotal - netProceeds - refund);
  return { ownTotal, lastPremium, loan, salePrice: p.salePrice, netProceeds, refund, fullNet };
}

// 卖出时点车龄对应的曲线年份档（曲线按整年建表，四舍五入取档）
export const curveYear = (yearFrac: number): number => clamp(Math.round(yearFrac), 1, 10);

// 各年残值率：锚定残值率（曲线或手动覆盖/手动卖价折算）按曲线比例缩放到其他年份
function rateForYear(energyType: EnergyType, year: number, anchorYear: number, anchorRatePct: number): number {
  return round2((anchorRatePct * autoResidualPct(energyType, year)) / autoResidualPct(energyType, anchorYear));
}

export interface SellYearRow {
  year: number;
  salePrice: number;
  netProceeds: number;
  fullNet: number;
  yearlyAvg: number;
  best: boolean;
  current: boolean;
}

export interface ChannelQuote {
  key: 'private' | 'trade' | 'dealer';
  label: string;
  low: number;
  high: number;
  note: string;
}

export interface EnergySellItem {
  key: EnergyType;
  label: string;
  yearlyAvg: number; // 当前卖出年（年末口径）年均净支出
  bestYear: number;
  bestYearlyAvg: number;
}

export interface SellCalc {
  sellYear: number;
  sellMonth: number;
  yearFrac: number;
  totalKm: number;
  loan: LoanAtSale;
  residualBaseVal: number;
  residualRatePct: number; // 未含里程修正的残值率（显示用）
  mileageAdj: number; // 里程修正百分点（当前时点，未开启为 0）
  salePrice: number;
  sellFees: number;
  feeItems: { key: string; label: string; total: number }[];
  netProceeds: number;
  ownTotal: number;
  refund: number;
  fullNet: number;
  yearlyAvg: number;
  perKm: number;
  rows: SellYearRow[];
  bestYear: number;
  channels: ChannelQuote[];
  energyCompare: EnergySellItem[];
  manualMissing: boolean;
}

// 渠道成交价区间（个人直卖为基准 100%）：瓜子口径个人直卖比车商收车高约 10%
const CHANNEL_RANGES: Record<ChannelQuote['key'], { label: string; low: number; high: number; note: string }> = {
  private: { label: '个人直卖', low: 100, high: 100, note: '价最高、周期长，需自办过户与退保' },
  trade: { label: '4S 置换', low: 92, high: 100, note: '省心快速，置换补贴记得在购车测算页填写' },
  dealer: { label: '车商收车', low: 88, high: 92, note: '最快当天成交，压价约 8%-12%' },
};

export function computeSell(sf: SellForm, buyForm: BuyForm, buyCalc: BuyCalc, ownForm: OwnForm): SellCalc {
  const sellYear = clamp(Math.round(num(sf.sellYear)) || 1, 1, 10);
  const sellMonth = clamp(Math.round(num(sf.sellMonth)) || 12, 1, 12);
  const yearFrac = round2(sellYear - 1 + sellMonth / 12);
  const sellMonthAbs = (sellYear - 1) * 12 + sellMonth;
  const annualKm = Math.max(0, num(ownForm.annualMileage));
  const totalKm = round2(annualKm * yearFrac);

  // 残值基数双口径：计税基数（成交价，与用车面板折旧参考一致）或厂商指导价
  const residualBaseVal =
    sf.residualBase === 'msrp' ? Math.max(0, num(buyForm.msrp)) : Math.max(0, buyCalc.taxBase);

  const feeItems = [
    { key: 'prep', label: '整备', total: round2(Math.max(0, num(sf.prepFee))) },
    { key: 'transfer', label: '过户', total: round2(Math.max(0, num(sf.transferFee))) },
    { key: 'platform', label: '平台服务', total: round2(Math.max(0, num(sf.platformFee))) },
    { key: 'other', label: '其他', total: round2(Math.max(0, num(sf.otherFee))) },
  ];
  const sellFees = round2(feeItems.reduce((a, i) => a + i.total, 0));
  const refundFeePct = clamp(num(sf.refundFeePct), 0, 100);

  const anchorYear = curveYear(yearFrac);
  const manualPrice = Math.max(0, num(sf.manualSalePrice));
  const manualMissing = sf.residualMode === 'manual' && manualPrice <= 0;
  // 锚定残值率：手动卖价 ÷ 基数折算，或曲线值（可被残值率覆盖）
  const anchorRatePct =
    sf.residualMode === 'manual'
      ? residualBaseVal > 0
        ? round2((manualPrice / residualBaseVal) * 100)
        : 0
      : sf.residualRatePct !== null
        ? clamp(num(sf.residualRatePct), 0, 100)
        : autoResidualPct(ownForm.energyType, anchorYear);

  // 卖价：手动模式直接取输入价（里程已在报价中体现，不做里程修正）；
  // 自动模式 = 基数 ×（残值率 + 里程修正）
  const priceAt = (ratePct: number, yf: number, useAdj: boolean): number =>
    Math.max(
      0,
      round2((residualBaseVal * clamp(ratePct + (useAdj ? mileageAdjPct(annualKm, yf) : 0), 0, 100)) / 100),
    );
  const currentSalePrice = sf.residualMode === 'manual' ? manualPrice : priceAt(anchorRatePct, yearFrac, sf.mileageAdjust);

  const current = evalPoint({
    own: ownForm,
    buyForm,
    buyCalc,
    yearFrac,
    sellMonthAbs,
    monthInYear: sellMonth,
    salePrice: currentSalePrice,
    fees: sellFees,
    refundFeePct,
  });

  // 逐年净支出（各年年末整年卖出口径，1-10 年）：最优卖出年 = 年均持有成本最低
  const rows: SellYearRow[] = [];
  for (let y = 1; y <= 10; y++) {
    const p = evalPoint({
      own: ownForm,
      buyForm,
      buyCalc,
      yearFrac: y,
      sellMonthAbs: y * 12,
      monthInYear: 12,
      salePrice: priceAt(rateForYear(ownForm.energyType, y, anchorYear, anchorRatePct), y, sf.mileageAdjust && sf.residualMode === 'auto'),
      fees: sellFees,
      refundFeePct,
    });
    rows.push({
      year: y,
      salePrice: p.salePrice,
      netProceeds: p.netProceeds,
      fullNet: p.fullNet,
      yearlyAvg: round2(p.fullNet / y),
      best: false,
      current: y === sellYear,
    });
  }
  const bestRow = rows.reduce((a, b) => (b.yearlyAvg < a.yearlyAvg ? b : a), rows[0]);
  bestRow.best = true;

  // 渠道对比：以当前卖价为个人直卖基准，按渠道成交价区间折算到手价（结清与费用不变，未含退保回收）
  const channels: ChannelQuote[] = (Object.keys(CHANNEL_RANGES) as ChannelQuote['key'][]).map((key) => {
    const c = CHANNEL_RANGES[key];
    const toNet = (pct: number) =>
      round2((current.salePrice * pct) / 100 - current.loan.settleAtSale - current.loan.settleFee - sellFees);
    return {
      key,
      label: c.label,
      low: key === 'private' ? current.netProceeds : toNet(c.low),
      high: key === 'private' ? current.netProceeds : toNet(c.high),
      note: c.note,
    };
  });

  // 全周期油电对比（各年年末口径）：购车侧按 2026 政策区分购置税与车船税，
  // 能耗保养取各类型默认值（与用车面板能源对比同口径），残值用各类型曲线
  const BUY_BY_ENERGY: Record<EnergyType, Partial<BuyForm>> = {
    gas: { vehicleType: 'fuel', taxRateMode: 'full', purchaseTaxManual: null },
    phev: { vehicleType: 'nev', taxRateMode: 'half', purchaseTaxManual: null },
    bev: { vehicleType: 'nev', taxRateMode: 'exempt', purchaseTaxManual: null },
  };
  const energyCompare = (Object.keys(ENERGY_PRESETS) as EnergyType[]).map((key) => {
    const own = { ...ownForm, ...ENERGY_PRESETS[key], energyType: key } as OwnForm;
    const buy = {
      ...buyForm,
      ...BUY_BY_ENERGY[key],
      vehicleVesselTax: ENERGY_PRESETS[key].vesselTax ?? buyForm.vehicleVesselTax,
    } as BuyForm;
    const calc = computeBuy(buy);
    let bestAvg = Infinity;
    let bestY = sellYear;
    let currentAvg = 0;
    for (let y = 1; y <= 10; y++) {
      const p = evalPoint({
        own,
        buyForm: buy,
        buyCalc: calc,
        yearFrac: y,
        sellMonthAbs: y * 12,
        monthInYear: 12,
        salePrice: priceAt(autoResidualPct(key, y), y, sf.mileageAdjust),
        fees: sellFees,
        refundFeePct,
      });
      const avg = p.fullNet / y;
      if (y === sellYear) currentAvg = round2(avg);
      if (avg < bestAvg) {
        bestAvg = avg;
        bestY = y;
      }
    }
    return { key, label: energyLabel(key), yearlyAvg: currentAvg, bestYear: bestY, bestYearlyAvg: round2(bestAvg) };
  });

  return {
    sellYear,
    sellMonth,
    yearFrac,
    totalKm,
    loan: current.loan,
    residualBaseVal,
    residualRatePct: anchorRatePct,
    mileageAdj: sf.mileageAdjust && sf.residualMode === 'auto' ? mileageAdjPct(annualKm, yearFrac) : 0,
    salePrice: current.salePrice,
    sellFees,
    feeItems,
    netProceeds: current.netProceeds,
    ownTotal: current.ownTotal,
    refund: current.refund,
    fullNet: current.fullNet,
    yearlyAvg: round2(current.fullNet / yearFrac),
    perKm: totalKm > 0 ? round2(current.fullNet / totalKm) : 0,
    rows,
    bestYear: bestRow.year,
    channels,
    energyCompare,
    manualMissing,
  };
}

export interface SellTextCtx {
  vehicleName: string;
  energyType: EnergyType;
  annualKm: number;
}

export function buildSellDetailText(sf: SellForm, c: SellCalc, ctx: SellTextCtx): string {
  const money = (n: number) => fmtCNY(n);
  const sellModeLines =
    sf.residualMode === 'manual'
      ? [
          `模式：手动卖价 ${money(c.salePrice)}（以二手车平台同款车报价为准）`,
          ...(c.manualMissing ? ['注意：未填写手动卖价，按 0 元估算'] : []),
        ]
      : [
          `模式：自动估算（残值基数：${sf.residualBase === 'msrp' ? '厂商指导价' : '计税基数（成交价）'} ${money(c.residualBaseVal)}）`,
          `残值率：${c.residualRatePct}%（流通协会保值率曲线${sf.residualRatePct !== null ? '，手动修改' : ''}）${
            c.mileageAdj !== 0 ? `｜里程修正 ${c.mileageAdj > 0 ? '+' : ''}${c.mileageAdj}%` : ''
          }`,
          `预估卖价：${money(c.salePrice)}`,
        ];
  const loanLines = c.loan.truncated
    ? [
        `贷款月供计至第 ${(c.sellYear - 1) * 12 + c.sellMonth} 期（利息止于卖出月）`,
        `卖出时结清剩余本金 ${money(c.loan.settleAtSale)}${c.loan.settleFee > 0 ? `，手续费 ${money(c.loan.settleFee)}` : ''}（从卖车款中扣除）`,
      ]
    : [
        c.loan.settledEarly
          ? '贷款已在购车页设定提前结清（早于卖出时点），落地总价已含结清款与手续费'
          : c.loan.hasLoan
            ? '贷款已在卖出前自然还清，落地总价为全期口径'
            : '全款购车，无贷款结清',
      ];
  const lines: string[] = [
    'CarPay · 卖车损益测算明细',
    `车辆：${ctx.vehicleName}（${energyLabel(ctx.energyType)}｜第 ${c.sellYear} 年第 ${c.sellMonth} 月卖出｜年行驶 ${ctx.annualKm.toLocaleString('zh-CN')} km）`,
    '',
    '【口径】置换/报废/首购补贴已在购车测算页抵扣落地总价，不再重复计算；贷款结清余额从卖车款中扣除；折旧通过卖车款变现，不计现金支出。',
    '',
    '【残值】',
    ...sellModeLines,
    '',
    '【贷款】',
    ...loanLines,
    '',
    '【卖车费用】',
    ...c.feeItems.map((i) => `${i.label}：${money(i.total)}`),
    `费用合计：${money(c.sellFees)}`,
    '',
    '【保险退保】',
    c.sellMonth < 12
      ? `第 ${c.sellMonth} 月卖出：退回在保保单保费 ${money(c.refund)}（手续费率 ${sf.refundFeePct}%，按月估算，实际按天计）`
      : '按整年卖出，无退保回收（交强险随车过户）',
    '',
    '──────────────',
    `卖车到手价：${money(c.netProceeds)}`,
    `购车落地（截至卖出月）：${money(c.loan.buyTotal)}`,
    `用车成本（${c.sellYear} 年 ${c.sellMonth} 个月）：${money(c.ownTotal)}`,
    ...(c.refund > 0 ? [`保险退保回收：-${money(c.refund)}`] : []),
    `全周期净支出：${money(c.fullNet)}`,
    `年均持有成本：${money(c.yearlyAvg)}｜每公里：${money(c.perKm)}（总里程 ${Math.round(c.totalKm).toLocaleString('zh-CN')} km）`,
    '',
    '【逐年净支出（各年年末卖出口径）】',
    ...c.rows.map(
      (r) =>
        `第 ${r.year} 年：到手 ${money(r.netProceeds)}｜净支出 ${money(r.fullNet)}｜年均 ${money(r.yearlyAvg)}${r.best ? '（最优）' : ''}`,
    ),
    `最优卖出年：第 ${c.bestYear} 年`,
    '',
    `生成时间：${new Date().toLocaleString('zh-CN', { hour12: false })}`,
    '由 CarPay 纯前端离线计算生成，仅供参考；实际成交以二手车行情为准。',
  ];
  return lines.join('\n');
}

// 首次进入且无本地存档时，卖出年份默认跟随用车面板的持有年限
export function loadSellForm(own: OwnForm): SellForm {
  const d: SellForm = { ...DEFAULT_SELL_FORM, sellYear: own.holdYears };
  try {
    const raw = localStorage.getItem(SELL_FORM_KEY);
    if (!raw) return d;
    const p = JSON.parse(raw) as Record<string, unknown>;
    const s = (k: keyof SellForm): string | null => (typeof p[k] === 'string' ? (p[k] as string) : null);
    return {
      sellYear: s('sellYear') ?? d.sellYear,
      sellMonth: s('sellMonth') ?? d.sellMonth,
      residualMode: p.residualMode === 'manual' ? 'manual' : 'auto',
      residualBase: p.residualBase === 'msrp' ? 'msrp' : 'taxBase',
      residualRatePct:
        p.residualRatePct === undefined
          ? d.residualRatePct
          : typeof p.residualRatePct === 'string'
            ? p.residualRatePct
            : null,
      manualSalePrice: s('manualSalePrice') ?? d.manualSalePrice,
      mileageAdjust: p.mileageAdjust === true,
      refundFeePct: s('refundFeePct') ?? d.refundFeePct,
      prepFee: s('prepFee') ?? d.prepFee,
      transferFee: s('transferFee') ?? d.transferFee,
      platformFee: s('platformFee') ?? d.platformFee,
      otherFee: s('otherFee') ?? d.otherFee,
    };
  } catch {
    return d;
  }
}

export const SELL_SOURCES: { label: string; url: string }[] = [
  { label: '流通协会保值率报告', url: 'https://www.cadcc.com.cn/article/3591.html' },
  { label: '2026 保值率月度解读', url: 'https://zhuanlan.zhihu.com/p/2048447542606745965' },
  { label: '二手车过户费用明细', url: 'https://kuku.baidu.com/landing/tscp_doc/5e29fa409951dcab08e20c0d42a63fb5' },
  { label: '车险退保规则（2026）', url: 'https://auto.sina.cn/2026-10-03/detail-initwkuv5364108.d.html' },
  { label: '机动车解押登记指引', url: 'http://www.panyu.gov.cn/gzhd/rxfw//zsk/cg/content/post_9162306.html' },
  { label: '2026 汽车以旧换新细则', url: 'https://www.mofcom.gov.cn/zwgk/zcfb/art/2025/art_2a65998b79af47eaaf2115ef1ce234f9.html' },
];
