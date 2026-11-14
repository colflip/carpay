import { clamp, fmtCNY, num, round2 } from '../components/shared';
import {
  computeBuy,
  firstBuyAmount,
  fixedInterestTotal,
  policySubsidy,
  settleAtMonth,
  type BuyForm,
  type BuyCalc,
} from './buyModel';
import {
  autoResidualPct,
  autoResidualPctAt,
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
  residualBase: ResidualBase; // 'taxBase' 为兼容旧存档保留，实际取购车成交价（dealPrice）
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
  // 截断口径：首付 + 月供至卖出月（车价与已产生利息）+ 购置税/车船税/首年险/杂费 − 各项补贴；
  // 注意不能加含车价的 baseTotal，否则车价重复计入
  const extras = buyCalc.purchaseTax + buyCalc.vessel + buyCalc.insuranceTotal + buyCalc.feesTotal;
  return {
    hasLoan: true,
    truncated: true,
    settledEarly: false,
    buyTotal: round2(buyCalc.down + buyCalc.monthly * sellMonth + extras - buyCalc.subsNonLoan),
    // 卖车截断的结清余额与购车测算共用 loanSchedule 引擎：
    // 固定利息取表单报价折算的全期费用（而非已被提前结清截断的利息）
    settleAtSale: settleAtMonth(
      buyForm.repayMode,
      buyCalc.principal,
      buyCalc.ratePct,
      buyForm.interestMode === 'fixedFee'
        ? fixedInterestTotal(
            num(buyForm.fixedInterest),
            buyForm.fixedInterestUnit,
            buyCalc.months,
            buyCalc.freeMonths,
          )
        : 0,
      buyCalc.freeMonths,
      buyCalc.months,
      sellMonth,
    ),
    // 结清手续费沿用购车页「提前还款手续费」：只有设定了提前还款计划才计，
    // 否则该输入在界面上不可见，却会在卖车时被悄悄扣除
    settleFee: buyForm.earlyRepayMonth > 0 ? num(buyForm.earlyRepayFee) : 0,
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
  const { total: ownTotal, lastPremium, refundPremium } = ownCostCumulative(p.own, p.yearFrac);
  const loan = loanAtSale(p.buyForm, p.buyCalc, p.sellMonthAbs);
  const netProceeds = round2(p.salePrice - loan.settleAtSale - loan.settleFee - p.fees);
  const refund =
    p.monthInYear < 12
      ? round2(refundPremium * ((12 - p.monthInYear) / 12) * (1 - clamp(p.refundFeePct, 0, 100) / 100))
      : 0;
  const fullNet = round2(loan.buyTotal + ownTotal - netProceeds - refund);
  return { ownTotal, lastPremium, loan, salePrice: p.salePrice, netProceeds, refund, fullNet };
}

// 各年残值率：锚定残值率（曲线或手动覆盖/手动卖价折算）按曲线比例缩放到其他年份
function rateForYear(
  energyType: EnergyType,
  year: number,
  anchorYearFrac: number,
  anchorRatePct: number,
): number {
  return (anchorRatePct * autoResidualPct(energyType, year)) / autoResidualPctAt(energyType, anchorYearFrac);
}

// 卖出时点的周期描述：「第 3 年第 6 月」即累计 2 年 6 个月，避免与「3 年 6 个月」混淆
export function salePeriodText(sellYear: number, sellMonth: number): string {
  const months = (sellYear - 1) * 12 + sellMonth;
  const y = Math.floor(months / 12);
  const m = months % 12;
  const elapsed = m === 0 ? `累计 ${y} 年` : `累计 ${y} 年 ${m} 个月`;
  return sellMonth === 12 ? `第 ${sellYear} 年末，${elapsed}` : `第 ${sellYear} 年第 ${sellMonth} 月，${elapsed}`;
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
  daysHeld: number;
  yearlyAvg: number;
  perDay: number;
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
  const daysHeld = Math.max(1, Math.round(yearFrac * 365));

  // 残值基数双口径：成交价（与用车面板折旧参考一致）或厂商指导价
  const residualBaseVal =
    sf.residualBase === 'msrp' ? Math.max(0, num(buyForm.msrp)) : Math.max(0, buyCalc.dealPrice);

  const feeItems = [
    { key: 'prep', label: '整备', total: round2(Math.max(0, num(sf.prepFee))) },
    { key: 'transfer', label: '过户', total: round2(Math.max(0, num(sf.transferFee))) },
    { key: 'platform', label: '平台服务', total: round2(Math.max(0, num(sf.platformFee))) },
    { key: 'other', label: '其他', total: round2(Math.max(0, num(sf.otherFee))) },
  ];
  const sellFees = round2(feeItems.reduce((a, i) => a + i.total, 0));
  const refundFeePct = clamp(num(sf.refundFeePct), 0, 100);

  const manualPrice = Math.max(0, num(sf.manualSalePrice));
  const manualMissing = sf.residualMode === 'manual' && manualPrice <= 0;
  // 手动覆盖的残值率：空字符串视为未填写（回落到曲线），并夹到 0-100
  const rateOverride =
    sf.residualRatePct !== null && sf.residualRatePct.trim() !== ''
      ? clamp(num(sf.residualRatePct), 0, 100)
      : null;
  // 锚定残值率：手动卖价 ÷ 基数折算，或按车龄插值的曲线值（可被残值率覆盖）
  const anchorRatePct =
    sf.residualMode === 'manual'
      ? residualBaseVal > 0
        ? (manualPrice / residualBaseVal) * 100
        : 0
      : rateOverride !== null
        ? rateOverride
        : autoResidualPctAt(ownForm.energyType, yearFrac);

  // 卖价：手动模式直接取输入价（里程已在报价中体现，不做里程修正）；
  // 自动模式 = 基数 ×（残值率 + 里程修正），残值率最高 100%；
  // 手动模式不设 100% 上限：手动卖价高于成交价时（收藏车、低开票），逐年表须与当前卖价保持一致
  const priceAt = (ratePct: number, yf: number, useAdj: boolean): number => {
    const raw = Math.max(0, ratePct + (useAdj ? mileageAdjPct(annualKm, yf) : 0));
    const capped = sf.residualMode === 'manual' ? raw : Math.min(raw, 100);
    return Math.max(0, round2((residualBaseVal * capped) / 100));
  };

  // 手动模式的逐年缩放上限：用户报价只对锚定年权威，向更早年份按曲线比例外推时
  // 若锚定残值率高于曲线值，比例会把早年卖价放大成「旧车比新车还贵」，
  // 凭空造出首年卖车反而盈利的假象。故缩放后的残值率封顶在 max(100%, 锚定残值率)：
  // 常规车不越过新车价，收藏车（报价高于成交价）仍与当前卖价保持一致。
  // 锚定年之后的年份按曲线递减，缩放值本就 ≤ 锚定值，封顶不会额外生效。
  const manualScaleCapPct = Math.max(100, anchorRatePct);
  const scaleCapped = (ratePct: number): number =>
    sf.residualMode === 'manual' ? Math.min(ratePct, manualScaleCapPct) : ratePct;
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
      salePrice: priceAt(scaleCapped(rateForYear(ownForm.energyType, y, yearFrac, anchorRatePct)), y, sf.mileageAdjust && sf.residualMode === 'auto'),
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

  // 全周期油电对比（各年年末口径）：购车侧按 2026 政策区分购置税与车船税
  // （燃油全额 10%；插混与纯电均减半 5%、减税上限 1.5 万元），
  // 能耗保养取各类型默认值（与用车面板能源对比同口径），
  // 政策补贴按各能源类型重新计算（新能源置换/报废比例高于燃油），
  // 残值：当前能源沿用当前锚定残值率（可含手动卖价），其余能源用各自曲线
  const BUY_BY_ENERGY: Record<EnergyType, Partial<BuyForm>> = {
    gas: { vehicleType: 'fuel', taxRateMode: 'full', purchaseTaxManual: null },
    phev: { vehicleType: 'phev', taxRateMode: 'half', purchaseTaxManual: null },
    bev: { vehicleType: 'nev', taxRateMode: 'half', purchaseTaxManual: null },
  };
  const useMileageAdj = sf.mileageAdjust && sf.residualMode === 'auto';
  const energyCompare = (Object.keys(ENERGY_PRESETS) as EnergyType[]).map((key) => {
    const own = { ...ownForm, ...ENERGY_PRESETS[key], energyType: key } as OwnForm;
    const baseBuy = {
      ...buyForm,
      ...BUY_BY_ENERGY[key],
      vehicleVesselTax: ENERGY_PRESETS[key].vesselTax ?? buyForm.vehicleVesselTax,
    } as BuyForm;
    // 政策补贴随车型变化：按该能源类型重算，避免沿用当前车型的补贴金额
    const prelim = computeBuy(baseBuy);
    const buy = {
      ...baseBuy,
      tradeInSubsidy:
        buyForm.tradeInMode === 'policy'
          ? String(policySubsidy('tradeIn', baseBuy.vehicleType, prelim.taxBase).amount)
          : buyForm.tradeInSubsidy,
      scrapSubsidy:
        buyForm.scrapMode === 'policy'
          ? String(policySubsidy('scrap', baseBuy.vehicleType, prelim.taxBase).amount)
          : buyForm.scrapSubsidy,
      firstBuySubsidy:
        buyForm.firstBuyMode === 'policy'
          ? String(firstBuyAmount(baseBuy.vehicleType, prelim.taxBase))
          : buyForm.firstBuySubsidy,
    } as BuyForm;
    const calc = computeBuy(buy);
    let bestAvg = Infinity;
    let bestY = sellYear;
    let currentAvg = 0;
    for (let y = 1; y <= 10; y++) {
      const rate =
        key === ownForm.energyType
          ? scaleCapped(rateForYear(key, y, yearFrac, anchorRatePct))
          : autoResidualPct(key, y);
      const p = evalPoint({
        own,
        buyForm: buy,
        buyCalc: calc,
        yearFrac: y,
        sellMonthAbs: y * 12,
        monthInYear: 12,
        salePrice: priceAt(rate, y, useMileageAdj),
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
    residualRatePct: round2(anchorRatePct),
    mileageAdj: sf.mileageAdjust && sf.residualMode === 'auto' ? mileageAdjPct(annualKm, yearFrac) : 0,
    salePrice: current.salePrice,
    sellFees,
    feeItems,
    netProceeds: current.netProceeds,
    ownTotal: current.ownTotal,
    refund: current.refund,
    fullNet: current.fullNet,
    daysHeld,
    yearlyAvg: round2(current.fullNet / yearFrac),
    perDay: round2(current.fullNet / daysHeld),
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
          `模式：自动估算（残值基数：${sf.residualBase === 'msrp' ? '厂商指导价' : '成交价'} ${money(c.residualBaseVal)}）`,
          `残值率：${c.residualRatePct}%（流通协会保值率曲线${sf.residualRatePct !== null && sf.residualRatePct.trim() !== '' ? '，手动修改' : ''}）${
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
    `车辆：${ctx.vehicleName}（${energyLabel(ctx.energyType)}｜${salePeriodText(c.sellYear, c.sellMonth)}｜年行驶 ${ctx.annualKm.toLocaleString('zh-CN')} km）`,
    '',
    '【口径】置换/报废/首购/保险补贴已在购车测算页抵扣落地总价，不再重复计算；贷款结清余额从卖车款中扣除；折旧通过卖车款变现，不计现金支出。',
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
      ? `第 ${c.sellMonth} 月卖出：退回在保保单保费 ${money(c.refund)}（手续费率 ${sf.refundFeePct}%，按月估算，实际按天计；交强险随车过户不退）`
      : '按整年卖出，无退保回收（交强险随车过户）',
    '',
    '──────────────',
    `卖车到手价：${money(c.netProceeds)}`,
    `购车落地（截至卖出月）：${money(c.loan.buyTotal)}`,
    `用车成本（${salePeriodText(c.sellYear, c.sellMonth)}）：${money(c.ownTotal)}`,
    ...(c.refund > 0 ? [`保险退保回收：-${money(c.refund)}`] : []),
    `全周期净支出：${money(c.fullNet)}`,
    `年均持有成本：${money(c.yearlyAvg)}｜每天：${money(c.perDay)}｜每公里：${money(c.perKm)}（持有 ${c.daysHeld.toLocaleString('zh-CN')} 天，总里程 ${Math.round(c.totalKm).toLocaleString('zh-CN')} km）`,
    '',
    '【逐年净支出（各年年末卖出口径）】',
    ...c.rows.map(
      (r) =>
        `第 ${r.year} 年：到手 ${money(r.netProceeds)}｜净支出 ${money(r.fullNet)}｜年均 ${money(r.yearlyAvg)}${r.best ? '（最优）' : ''}`,
    ),
    `最优卖出年：第 ${c.bestYear} 年（本模型口径下年均最低点；实际决策还需考虑车况、新车迭代与用车需求变化）`,
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
  { label: '机动车解押登记指引', url: 'http://www.panyu.gov.cn/gzhd/rxfw/zsk/cg/content/post_9162306.html' },
  { label: '2026 汽车以旧换新细则', url: 'https://www.mofcom.gov.cn/zwgk/zcfb/art/2025/art_2a65998b79af47eaaf2115ef1ce234f9.html' },
];
