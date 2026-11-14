import { clamp, fmtCNY, num, round2 } from '../components/shared';

export const BUY_FORM_KEY = 'carpay:buy-form:v1';

export type VehicleType = 'fuel' | 'phev' | 'nev';
export type PolicyVehicleType = 'fuel' | 'nev';
export type PaymentMode = 'full' | 'finance' | 'mortgage';
export type TaxRateMode = 'full' | 'half' | 'exempt';
// 旧车 / 首购方式：报废更新、置换更新与首购（购新）补贴每年限享其一
export type OldCarMode = 'none' | 'tradeIn' | 'scrap' | 'firstBuy';
// 计息方式：年利率按利率计息；固定利息为经销商报价的一口价总利息，按期数均摊
export type InterestMode = 'rate' | 'fixedFee';
// 固定利息的报价单位：总共（全期总额）、月（每月利息）、年（每年利息）
export type FixedInterestUnit = 'total' | 'monthly' | 'yearly';
// 还款方式：等额本息（月供固定）、等额本金（月还本金固定、利息逐月递减）、先息后本（按期付息、到期还本）
export type RepayMode = 'annuity' | 'equalPrincipal' | 'bullet';

export const REPAY_LABEL: Record<RepayMode, string> = {
  annuity: '等额本息',
  equalPrincipal: '等额本金',
  bullet: '先息后本',
};

// 付款方式展示名（定额贷款 = 按固定额度贷一笔，首付 = 成交价 − 贷款额）
export const PAYMENT_LABEL: Record<PaymentMode, string> = {
  full: '全款',
  finance: '首付分期',
  mortgage: '定额贷款',
};

// 旧车 / 首购方式展示名
export const OLD_CAR_LABEL: Record<OldCarMode, string> = {
  none: '无',
  tradeIn: '置换',
  scrap: '报废',
  firstBuy: '首购',
};

// 车辆类型展示名与默认档位（2026 政策：新能源乘用车购置税减半征收，减税额上限 1.5 万元/辆）
export const VEHICLE_LABEL: Record<VehicleType, string> = {
  fuel: '燃油车',
  phev: '插混/增程车',
  nev: '纯电车',
};

// 以旧换新与首购补贴的政策口径只有「燃油 / 新能源」两档，插混与纯电同属新能源
export const policyVehicle = (v: VehicleType): PolicyVehicleType => (v === 'fuel' ? 'fuel' : 'nev');

// 新车购置的默认购置税档位：2026-01-01 起新能源减半征收（2024-2025 才是免征）
export const defaultTaxRateMode = (v: VehicleType): TaxRateMode => (v === 'fuel' ? 'full' : 'half');

// 新车购置的默认车船税：纯电免征，燃油与插混按排量计征
export const defaultVesselTax = (v: VehicleType): string => (v === 'nev' ? '0' : '420');

export interface BuyForm {
  modelName: string;
  vehicleType: VehicleType;
  taxRateMode: TaxRateMode;
  msrp: string;
  optionsFee: string;
  officialDiscount: string;
  dealerDiscount: string;
  loanRebate: string;
  // 计税口径（开票价）：选装是否计入、官方/门店优惠与贷款返现是否冲减开票价
  taxOptions: boolean;
  taxOfficial: boolean;
  taxDealer: boolean;
  taxRebate: boolean;
  tradeInSubsidy: string;
  tradeInMode: 'manual' | 'policy';
  scrapSubsidy: string;
  scrapMode: 'manual' | 'policy';
  oldCarMode: OldCarMode;
  firstBuySubsidy: string;
  firstBuyMode: 'manual' | 'policy';
  insuranceSubsidy: string;
  otherDiscount: string;
  purchaseTaxManual: string | null;
  vehicleVesselTax: string;
  compulsoryInsurance: string;
  commercialInsurance: string;
  plateFee: string;
  serviceFee: string;
  paymentMode: PaymentMode;
  downPaymentPct: string;
  loanAmount: string;
  loanAmountMode: 'manual' | 'full';
  freeMonths: number;
  earlyRepayMonth: number;
  earlyRepayFee: string;
  interestMode: InterestMode;
  repayMode: RepayMode;
  annualRatePct: string;
  fixedInterest: string;
  fixedInterestUnit: FixedInterestUnit;
  // 国家财政贴息（财金〔2025〕80号）：结息时直接扣减利息，不影响月供与等效年利率
  stateInterestSubsidy: string;
  months: number;
}

export interface BuyCalc {
  dealPrice: number;
  dealPriceFull: number;
  taxBase: number;
  purchaseTaxBase: number; // 购置税计税价格（不含税）= 开票价（价税合计）÷ 1.13
  taxAuto: number;
  purchaseTax: number;
  vessel: number;
  compulsory: number;
  commercial: number;
  plate: number;
  service: number;
  tradeIn: number;
  scrap: number;
  firstBuy: number;
  insuranceSubsidy: number;
  otherDiscount: number;
  rebate: number;
  insuranceTotal: number;
  feesTotal: number;
  subsNonLoan: number;
  isLoan: boolean;
  pct: number;
  months: number;
  freeMonths: number;
  earlyRepay: boolean;
  earlySettleMonth: number;
  settleAmount: number;
  earlyFee: number;
  down: number;
  principal: number;
  ratePct: number; // 参与计算的年利率：年利率模式为输入值，固定利息模式为折算年化（单利，费用折算）
  repayMode: RepayMode;
  monthly: number; // 首期月供；等额本息/固定利息均摊全程不变，等额本金为首期（逐月递减），先息后本为月息
  lastMonthly: number; // 末期月供（等额本金口径），其余方式与 monthly 相同
  totalRepay: number;
  stateSubsidy: number; // 国家财政贴息，冲减利息总额
  interest: number; // 贴息前的利息总额
  interestNet: number; // 贴息后实付利息 = 利息总额 − 财政贴息
  financeCost: number; // 融资成本 = 利息总额 + 提前还款手续费 − 财政贴息
  fullTotal: number;
  total: number;
}

export const MONTH_OPTIONS = [12, 24, 36, 48, 60];
export const FREE_MONTH_OPTIONS = [0, 12, 24, 36];
export const EARLY_MONTH_OPTIONS = [0, 12, 24, 36];

// 2026 汽车以旧换新：国家统一按比例 + 封顶（发改环资〔2025〕1745号 / 商办消费函〔2025〕467号）
// 比例基数为新车销售价格（价税合计），即开票价；购置税另按 开票价 ÷ 1.13 计税
export const POLICY_2026 = {
  scrap: { nev: { rate: 0.12, cap: 20000 }, fuel: { rate: 0.1, cap: 15000 } },
  tradeIn: { nev: { rate: 0.08, cap: 15000 }, fuel: { rate: 0.06, cap: 13000 } },
} as const;

export type PolicyKind = 'scrap' | 'tradeIn';

// 返回按 2026 政策算出的补贴额与来源标注；开票价（价税合计）即计税基数
export function policySubsidy(
  kind: PolicyKind,
  vehicleType: VehicleType,
  taxBase: number,
): { amount: number; label: string } {
  const rule = POLICY_2026[kind][policyVehicle(vehicleType)];
  const amount = Math.min(round2(taxBase * rule.rate), rule.cap);
  const capText = `封顶 ${(rule.cap / 10000).toFixed(1).replace('.0', '')} 万元`;
  return {
    amount,
    label: `按 2026 年政策计算（开票价 × ${(rule.rate * 100).toFixed(0)}%，${capText}）`,
  };
}

// 首购补贴为地方「购新补贴」，无全国统一比例；按常见区间取代表值：新能源 3% 封顶 7000 元、燃油 2% 封顶 6000 元
export const FIRST_BUY_2026 = {
  nev: { rate: 0.03, cap: 7000 },
  fuel: { rate: 0.02, cap: 6000 },
} as const;

export function firstBuyRate(vehicleType: VehicleType): number {
  return Math.round(FIRST_BUY_2026[policyVehicle(vehicleType)].rate * 100);
}

export function firstBuyAmount(vehicleType: VehicleType, taxBase: number): number {
  const rule = FIRST_BUY_2026[policyVehicle(vehicleType)];
  return Math.min(round2(taxBase * rule.rate), rule.cap);
}

export const DEFAULT_BUY_FORM: BuyForm = {
  modelName: '',
  vehicleType: 'fuel',
  taxRateMode: 'full',
  msrp: '150000',
  optionsFee: '0',
  officialDiscount: '10000',
  dealerDiscount: '5000',
  loanRebate: '0',
  taxOptions: true,
  taxOfficial: true,
  taxDealer: true,
  taxRebate: true,
  tradeInSubsidy: '',
  tradeInMode: 'manual',
  scrapSubsidy: '',
  scrapMode: 'manual',
  oldCarMode: 'none',
  firstBuySubsidy: '',
  firstBuyMode: 'manual',
  insuranceSubsidy: '',
  otherDiscount: '',
  purchaseTaxManual: null,
  vehicleVesselTax: '420',
  compulsoryInsurance: '950',
  commercialInsurance: '3500',
  plateFee: '125',
  serviceFee: '0',
  paymentMode: 'full',
  downPaymentPct: '30',
  loanAmount: '80000',
  loanAmountMode: 'manual',
  freeMonths: 0,
  earlyRepayMonth: 0,
  earlyRepayFee: '0',
  interestMode: 'rate',
  repayMode: 'annuity',
  annualRatePct: '3.25',
  fixedInterest: '',
  fixedInterestUnit: 'total',
  // 默认按财金〔2025〕80号「1%」政策口径：36 期 = 5 万 × 年贴息 1% × 3 年 = 1500 元
  stateInterestSubsidy: '1500',
  months: 36,
};

const annuityMonthly = (
  principal: number,
  annualRatePct: number,
  months: number,
  freeMonths: number,
): number => {
  if (principal <= 0 || months <= 0) return 0;
  const r = annualRatePct / 100 / 12;
  const free = Math.min(freeMonths, months);
  const rest = months - free;
  if (r <= 0 || rest <= 0) return principal / months;
  // 前 N 期免息：月供 = 本金 × k ÷ (1 + N × k)，k 为剩余期数的等额本息期供率
  const f = Math.pow(1 + r, rest);
  const k = (r * f) / (f - 1);
  return (principal * k) / (1 + free * k);
};

// 第 month 期期末一次性结清时的剩余本金：免息期内不产生利息，之后按年利率复利，
// 与「提前还款」口径共用同一公式，卖车损益模块按卖出月截断贷款时也用它（仅等额本息）
export function remainingPrincipalAt(
  principal: number,
  monthly: number,
  annualRatePct: number,
  freeMonths: number,
  month: number,
): number {
  if (principal <= 0 || month <= 0) return 0;
  const r = annualRatePct / 100 / 12;
  const free = Math.min(Math.max(0, freeMonths), month);
  if (month <= free || r <= 0) return round2(Math.max(0, principal - monthly * month));
  // 免息期末余额按剩余期数摊还至第 month 期
  const bn = Math.max(0, principal - monthly * free);
  const fp = Math.pow(1 + r, month - free);
  return round2(Math.max(0, bn * fp - (monthly * (fp - 1)) / r));
}

// 还款方式 × 计息方式的统一还款引擎：月供、第 month 期结清余额、已计提利息的单一来源。
// - 年利率模式：
//   等额本息：月供全程固定，结清余额按摊还表复利；
//   等额本金：每期还固定本金 + 剩余本金当期利息（免息期内利息为 0），首期最高逐月递减；
//   先息后本：每期只还利息，本金到期一次性归还（免息期只免利息、照常月供付息期利息）。
// - 固定利息模式：费用均摊，月供 =（本金 + 全期费用）÷ 期数，与还款方式无关（一口价合同）。
// month 为提前结清期数（0 = 走满期）；返回值 settle 仅在提前结清时有意义
export function loanSchedule(
  repayMode: RepayMode,
  principal: number,
  annualRatePct: number,
  fixedInterest: number,
  months: number,
  freeMonths: number,
  month: number,
): { monthly: number; lastMonthly: number; settle: number; accrued: number } {
  if (principal <= 0 || months <= 0) {
    return { monthly: 0, lastMonthly: 0, settle: 0, accrued: 0 };
  }
  const free = Math.min(Math.max(0, freeMonths), months);
  const paid = month > 0 ? Math.min(month, months) : months;
  const early = month > 0 && month < months;

  // 固定利息（费用均摊）：月供 =（本金 + 全期费用）÷ 期数，每期利息 = 费用 ÷ 计息期数
  if (fixedInterest > 0) {
    const feePerMonth = fixedInterest / Math.max(1, months - free);
    const monthly = round2((principal + fixedInterest) / months);
    const accrued = round2(feePerMonth * Math.max(0, paid - free));
    const settle = round2(Math.max(0, principal + accrued - monthly * paid));
    return { monthly, lastMonthly: monthly, settle: early ? settle : 0, accrued };
  }

  const r = annualRatePct / 100 / 12;
  if (repayMode === 'equalPrincipal') {
    // 等额本金：每期还本金/期数 + 剩余本金当期利息；免息期内利息为 0
    const principalPart = principal / months;
    const monthlyAt = (n: number): number => {
      const idx = Math.min(Math.max(0, n), months); // 第 idx 期（1 基）
      const remainBefore = principal - (idx - 1) * principalPart;
      const interestPart = idx <= free ? 0 : remainBefore * r;
      return round2(principalPart + interestPart);
    };
    const monthly = monthlyAt(1);
    const lastMonthly = monthlyAt(months);
    // 已计提利息 = 第 (free+1) ~ paid 期利息之和
    let accrued = 0;
    for (let i = free + 1; i <= paid; i++) {
      accrued += (principal - (i - 1) * principalPart) * r;
    }
    accrued = round2(accrued);
    const settle = round2(Math.max(0, principal - principalPart * paid));
    return { monthly, lastMonthly, settle: early ? settle : 0, accrued };
  }

  if (repayMode === 'bullet') {
    // 先息后本：每期付息（免息期为 0），到期一次性还本
    const interestMonthly = round2(principal * r);
    const accrued = round2(Math.max(0, paid - free) * principal * r);
    const settle = round2(early ? principal : 0);
    return { monthly: interestMonthly, lastMonthly: round2(principal + interestMonthly), settle, accrued };
  }

  // 等额本息
  const monthly = round2(annuityMonthly(principal, annualRatePct, months, free));
  const settle = remainingPrincipalAt(principal, monthly, annualRatePct, freeMonths, paid);
  const accrued = round2(Math.max(0, monthly * paid + (early ? settle : 0) - principal));
  return { monthly, lastMonthly: monthly, settle: early ? settle : 0, accrued };
}

// 固定利息的报价单位 → 全期总利息：
// 「总共」按全期总额计；「月」按计息期数（总期数 − 免息期数）逐月累加；
// 「年」按计息期数折算成年数后累加。免息期不产生利息，故不计入计息期数
export function fixedInterestTotal(
  amount: number,
  unit: FixedInterestUnit,
  months: number,
  freeMonths: number,
): number {
  const value = Math.max(0, amount);
  if (unit === 'total') return round2(value);
  const chargeMonths = Math.max(0, months - Math.min(Math.max(0, freeMonths), months));
  if (unit === 'monthly') return round2(value * chargeMonths);
  return round2((value * chargeMonths) / 12);
}

// 财政贴息（财金〔2025〕80号，2025-09-01 至 2026-08-31）：
// 家用汽车属单笔 5 万元及以上重点领域，贴息计算以 5 万元为基数上限——
// 即便贷款 20 万、30 万，也只按 5 万元 × 年贴息 1% × 贷款年限计算，累计不超过 3000 元封顶；
// 贴息随每期结息扣减应付利息，不改变月供
export const STATE_SUBSIDY_2025 = {
  base: 50000, // 贴息基数上限（单笔 5 万元以上消费按 5 万元计）
  annualPct: 1, // 年贴息比例：1 个百分点
  maxCap: 3000, // 累计贴息封顶
} as const;

// 按政策计算的贴息额：5 万 × 年贴息 1% × 贷款年数（按月折算），累计不超过 3000 元
export function stateSubsidyAmount(months: number): { amount: number; label: string } {
  const years = months / 12;
  const amount = Math.min(
    round2((STATE_SUBSIDY_2025.base * STATE_SUBSIDY_2025.annualPct) / 100 * years),
    STATE_SUBSIDY_2025.maxCap,
  );
  return {
    amount,
    label: `按财金〔2025〕80号政策：贴息基数 5 万元 × 年贴息 1% × ${years} 年，累计封顶 3000 元`,
  };
}

// 卖车截断时的结清余额：与购车测算共用 loanSchedule 引擎，保证口径一致
export function settleAtMonth(
  repayMode: RepayMode,
  principal: number,
  ratePct: number,
  fixedInterest: number,
  freeMonths: number,
  months: number,
  month: number,
): number {
  return loanSchedule(repayMode, principal, ratePct, fixedInterest, months, freeMonths, month).settle;
}

export function computeBuy(f: BuyForm): BuyCalc {
  const isLoan = f.paymentMode !== 'full';
  const msrp = num(f.msrp);
  const options = num(f.optionsFee);
  const official = num(f.officialDiscount);
  const dealer = num(f.dealerDiscount);
  const rebate = isLoan ? num(f.loanRebate) : 0;
  // 成交价：实际车价（指导价 + 选装 − 官方/门店优惠 − 贷款返现），用于首付、月供与残值
  const grossPrice = msrp + options - official - dealer;
  const dealPrice = Math.max(0, grossPrice - rebate);
  const dealPriceFull = Math.max(0, grossPrice);
  // 开票价：单独按用户选择的计税口径计算，用于购置税与补贴，可与成交价不同
  const taxGross =
    msrp +
    (f.taxOptions ? options : 0) -
    (f.taxOfficial ? official : 0) -
    (f.taxDealer ? dealer : 0);
  const taxBase = Math.max(0, taxGross - (isLoan && f.taxRebate ? rebate : 0));
  const taxBaseFull = Math.max(0, taxGross);
  // 减半档按新能源 2026-2027 政策：每辆减税额上限 1.5 万
  const applyTaxCap = (gross: number): number =>
    f.taxRateMode === 'exempt' ? 0 : f.taxRateMode === 'half' ? round2(Math.max(gross * 0.5, gross - 15000)) : gross;
  const taxAuto = applyTaxCap(round2((taxBase / 1.13) * 0.1));
  const taxAutoFull = applyTaxCap(round2((taxBaseFull / 1.13) * 0.1));
  const purchaseTaxBase = round2(taxBase / 1.13); // 购置税计税价格（不含税）
  const purchaseTax = f.purchaseTaxManual !== null ? num(f.purchaseTaxManual) : taxAuto;
  const vessel = num(f.vehicleVesselTax);
  const compulsory = num(f.compulsoryInsurance);
  const commercial = num(f.commercialInsurance);
  const plate = num(f.plateFee);
  const service = num(f.serviceFee);
  const tradeIn = f.oldCarMode === 'tradeIn' ? num(f.tradeInSubsidy) : 0;
  const scrap = f.oldCarMode === 'scrap' ? num(f.scrapSubsidy) : 0;
  const firstBuy = f.oldCarMode === 'firstBuy' ? num(f.firstBuySubsidy) : 0;
  const insuranceSubsidy = num(f.insuranceSubsidy);
  const otherDiscount = num(f.otherDiscount);
  const insuranceTotal = compulsory + commercial;
  const feesTotal = plate + service;
  const subsNonLoan = tradeIn + scrap + firstBuy + insuranceSubsidy + otherDiscount;
  const baseTotal = dealPrice + purchaseTax + vessel + insuranceTotal + feesTotal;
  const fullTotal = round2(
    dealPriceFull +
      (f.purchaseTaxManual !== null ? num(f.purchaseTaxManual) : taxAutoFull) +
      vessel +
      insuranceTotal +
      feesTotal -
      subsNonLoan,
  );

  const pct = clamp(num(f.downPaymentPct), 0, 100);
  // 固定利息模式：本金需先确定，定额贷款的固定额度即是本金；首付分期则由首付比例先算出本金
  const months = f.months;
  const freeMonths = clamp(f.freeMonths, 0, months);
  const earlySettleMonth = clamp(f.earlyRepayMonth, 0, months);
  const earlyRepay = isLoan && earlySettleMonth > 0 && earlySettleMonth < months;
  const earlyFee = earlyRepay ? num(f.earlyRepayFee) : 0;
  const fixedMode = f.paymentMode === 'mortgage';
  const fixedLoan = fixedMode ? clamp(num(f.loanAmount), 0, dealPrice) : 0;
  const down = round2(fixedMode ? dealPrice - fixedLoan : dealPrice * (pct / 100));
  const principal = round2(fixedMode ? fixedLoan : Math.max(0, dealPrice - down));
  // 还款引擎：还款方式 × 计息方式统一走 loanSchedule（月供/结清/已计提利息的单一来源）
  const fixedFeeTotal =
    f.interestMode === 'fixedFee'
      ? fixedInterestTotal(num(f.fixedInterest), f.fixedInterestUnit, months, freeMonths)
      : 0;
  const rate =
    f.interestMode === 'fixedFee' ? 0 : Math.max(0, num(f.annualRatePct));
  const sched = loanSchedule(
    f.repayMode,
    principal,
    rate,
    fixedFeeTotal,
    months,
    freeMonths,
    earlyRepay ? earlySettleMonth : 0,
  );
  // 固定利息模式展示费用折算的名义年化（单利）；年利率模式为输入利率
  const ratePct =
    f.interestMode === 'fixedFee'
      ? months > 0 && principal > 0
        ? round2(((fixedFeeTotal / principal) / (months / 12)) * 10000) / 100
        : 0
      : rate;
  const monthly = sched.monthly;
  const settleAmount = sched.settle;
  const paidMonths = earlyRepay ? earlySettleMonth : months;
  const totalRepay = round2(monthly * paidMonths + settleAmount);
  // 固定利息模式：利息按报价精确计提，月供舍入残差归入结清余额；年利率模式：利息 = 已计提利息
  const interestBeforeSubsidy = sched.accrued;
  // 财政贴息（贴息基数上限 5 万元，累计封顶 3000 元）：随每期结息扣减、不改变月供。
  // 利息总额保持结清前实际产生的利息不扣减，贴息作为独立抵扣项冲减落地总价
  const stateSubsidy = isLoan ? clamp(num(f.stateInterestSubsidy), 0, 30000) : 0;
  const subsidyApplied = isLoan ? Math.min(stateSubsidy, interestBeforeSubsidy) : 0;
  const interest = round2(Math.max(0, interestBeforeSubsidy));
  // 贴息后实付利息与纯融资成本：融资成本 = 利息 + 提前还款手续费 − 贴息
  const interestNet = round2(Math.max(0, interest - subsidyApplied));
  const financeCost = isLoan ? round2(Math.max(0, interest + earlyFee - subsidyApplied)) : 0;
  const total = round2(
    (isLoan ? baseTotal + interest + earlyFee - subsidyApplied : baseTotal) - subsNonLoan,
  );

  return {
    dealPrice,
    dealPriceFull,
    taxBase,
    purchaseTaxBase,
    taxAuto,
    purchaseTax,
    vessel,
    compulsory,
    commercial,
    plate,
    service,
    tradeIn,
    scrap,
    firstBuy,
    insuranceSubsidy,
    otherDiscount,
    rebate,
    insuranceTotal,
    feesTotal,
    subsNonLoan,
    isLoan,
    pct,
    months,
    freeMonths,
    earlyRepay,
    earlySettleMonth,
    settleAmount,
    earlyFee,
    down,
    principal,
    ratePct,
    repayMode: f.repayMode,
    monthly,
    lastMonthly: sched.lastMonthly,
    totalRepay,
    stateSubsidy: subsidyApplied,
    interest,
    interestNet,
    financeCost,
    fullTotal,
    total,
  };
}

export function loadBuyForm(): BuyForm {
  const d = DEFAULT_BUY_FORM;
  try {
    const raw = localStorage.getItem(BUY_FORM_KEY);
    if (!raw) return d;
    const p = JSON.parse(raw) as Record<string, unknown>;
    const s = (k: keyof BuyForm): string | null => (typeof p[k] === 'string' ? (p[k] as string) : null);
    const months =
      typeof p.months === 'number' && MONTH_OPTIONS.includes(p.months) ? p.months : d.months;
    const vehicleType: VehicleType =
      p.vehicleType === 'phev' || p.vehicleType === 'nev' ? p.vehicleType : 'fuel';
    return {
      modelName: s('modelName') ?? d.modelName,
      vehicleType,
      taxRateMode:
        p.taxRateMode === 'full' || p.taxRateMode === 'half' || p.taxRateMode === 'exempt'
          ? p.taxRateMode
          : defaultTaxRateMode(vehicleType),
      msrp: s('msrp') ?? d.msrp,
      optionsFee: s('optionsFee') ?? d.optionsFee,
      officialDiscount: s('officialDiscount') ?? d.officialDiscount,
      dealerDiscount: s('dealerDiscount') ?? d.dealerDiscount,
      taxOptions: p.taxOptions !== false,
      taxOfficial: p.taxOfficial !== false,
      taxDealer: p.taxDealer !== false,
      taxRebate: p.taxRebate !== false,
      loanRebate:
        (typeof p.loanRebate === 'string' ? p.loanRebate : null) ??
        (typeof p.loanSubsidy === 'string' ? p.loanSubsidy : null) ??
        d.loanRebate,
      tradeInSubsidy: s('tradeInSubsidy') ?? d.tradeInSubsidy,
      tradeInMode: p.tradeInMode === 'policy' ? 'policy' : 'manual',
      scrapSubsidy: s('scrapSubsidy') ?? d.scrapSubsidy,
      scrapMode: p.scrapMode === 'policy' ? 'policy' : 'manual',
      oldCarMode: (() => {
        if (
          p.oldCarMode === 'none' ||
          p.oldCarMode === 'tradeIn' ||
          p.oldCarMode === 'scrap' ||
          p.oldCarMode === 'firstBuy'
        ) {
          return p.oldCarMode;
        }
        // 旧版本没有旧车 / 首购方式字段，按已有金额反推，保证历史数据不丢补贴
        const scrapVal = typeof p.scrapSubsidy === 'string' ? num(p.scrapSubsidy) : 0;
        const tradeVal = typeof p.tradeInSubsidy === 'string' ? num(p.tradeInSubsidy) : 0;
        const firstVal = typeof p.firstBuySubsidy === 'string' ? num(p.firstBuySubsidy) : 0;
        if (scrapVal > 0) return 'scrap';
        if (tradeVal > 0) return 'tradeIn';
        if (firstVal > 0) return 'firstBuy';
        return 'none';
      })(),
      firstBuySubsidy: s('firstBuySubsidy') ?? d.firstBuySubsidy,
      firstBuyMode: p.firstBuyMode === 'policy' ? 'policy' : 'manual',
      insuranceSubsidy: s('insuranceSubsidy') ?? d.insuranceSubsidy,
      otherDiscount: s('otherDiscount') ?? d.otherDiscount,
      purchaseTaxManual:
        p.purchaseTaxManual === undefined
          ? d.purchaseTaxManual
          : typeof p.purchaseTaxManual === 'string'
            ? p.purchaseTaxManual
            : null,
      vehicleVesselTax: s('vehicleVesselTax') ?? d.vehicleVesselTax,
      compulsoryInsurance: s('compulsoryInsurance') ?? d.compulsoryInsurance,
      commercialInsurance: s('commercialInsurance') ?? d.commercialInsurance,
      plateFee: s('plateFee') ?? d.plateFee,
      serviceFee: s('serviceFee') ?? d.serviceFee,
      paymentMode: p.paymentMode === 'finance' || p.paymentMode === 'mortgage' ? p.paymentMode : 'full',
      downPaymentPct: s('downPaymentPct') ?? d.downPaymentPct,
      loanAmount: s('loanAmount') ?? d.loanAmount,
      loanAmountMode: p.loanAmountMode === 'full' ? 'full' : 'manual',
      freeMonths:
        typeof p.freeMonths === 'number' && FREE_MONTH_OPTIONS.includes(p.freeMonths)
          ? p.freeMonths
          : d.freeMonths,
      earlyRepayMonth:
        typeof p.earlyRepayMonth === 'number' && EARLY_MONTH_OPTIONS.includes(p.earlyRepayMonth)
          ? p.earlyRepayMonth
          : 0,
      earlyRepayFee: s('earlyRepayFee') ?? d.earlyRepayFee,
      interestMode: p.interestMode === 'fixedFee' ? 'fixedFee' : 'rate',
      repayMode:
        p.repayMode === 'equalPrincipal' || p.repayMode === 'bullet' ? p.repayMode : 'annuity',
      annualRatePct: s('annualRatePct') ?? d.annualRatePct,
      fixedInterest: s('fixedInterest') ?? d.fixedInterest,
      fixedInterestUnit:
        p.fixedInterestUnit === 'monthly' || p.fixedInterestUnit === 'yearly'
          ? p.fixedInterestUnit
          : 'total',
      stateInterestSubsidy: s('stateInterestSubsidy') ?? d.stateInterestSubsidy,
      months,
    };
  } catch {
    return d;
  }
}

export function buildBuyDetailText(f: BuyForm, c: BuyCalc): string {
  const money = (n: number) => fmtCNY(n);
  // 计税口径：哪些项目进入开票价（用于购置税与补贴），与成交价口径分开说明
  const taxScope = [
    '厂商指导裸车原价',
    ...(f.taxOptions ? ['+ 选装包'] : ['（选装包不计入开票价）']),
    ...(f.taxOfficial ? ['− 官方优惠'] : ['（官方优惠不冲减开票价）']),
    ...(f.taxDealer ? ['− 门店优惠'] : ['（门店优惠不冲减开票价）']),
    ...(c.isLoan ? (f.taxRebate ? ['− 贷款返现'] : ['（贷款返现不冲减开票价）']) : []),
  ].join(' ');
  const lines: string[] = [
    'CarPay · 购车落地测算明细',
    `车型：${f.modelName.trim() || '未命名车辆'}（${VEHICLE_LABEL[f.vehicleType]}｜${PAYMENT_LABEL[f.paymentMode]}）`,
    '',
    '【车价构成】',
    `厂商指导裸车原价：${money(num(f.msrp))}`,
    `选装包：${fmtCNY(num(f.optionsFee), true)}`,
    `官方优惠：−${money(num(f.officialDiscount))}`,
    `门店优惠：−${money(num(f.dealerDiscount))}`,
    ...(c.isLoan ? [`贷款返现：−${money(c.rebate)}（冲减成交价）`] : []),
    `成交价（裸车价）：${money(c.dealPrice)}`,
    `开票价（价税合计）：${money(c.taxBase)}`,
    `购置税计税价格（不含税）：${money(c.purchaseTaxBase)}`,
    `计税口径：${taxScope}`,
    '',
    '【税费与保险】',
    `购置税：${money(c.purchaseTax)}（${f.taxRateMode === 'full' ? '全额 10%' : f.taxRateMode === 'half' ? '减半 5%，减税上限 1.5 万元' : '免征'}${f.purchaseTaxManual !== null ? '，手动改写' : '，自动计算'}）`,
    `车船税：${money(c.vessel)}（随交强险代收${f.vehicleType === 'nev' ? '，纯电动免征' : f.vehicleType === 'phev' ? '，插混按排量计征' : ''}）`,
    `交强险：${money(c.compulsory)}`,
    `商业险：${money(c.commercial)}`,
    '',
    '【其他杂费】',
    `上牌费：${money(c.plate)}`,
    `服务费：${money(c.service)}`,
    '',
  ];
  if (c.isLoan) {
    lines.push(
      `【${PAYMENT_LABEL[f.paymentMode]}方案（${REPAY_LABEL[c.repayMode]}）】`,
      `车价融资拆分：${money(c.dealPrice)} = 首付 ${money(c.down)} + 贷款本金 ${money(c.principal)}`,
      f.paymentMode === 'mortgage'
        ? `固定贷款额：${money(c.principal)}（首付 ${money(c.down)}）`
        : `首付比例：${c.pct}%（首付 ${money(c.down)}）`,
      `贷款本金：${money(c.principal)}`,
      f.interestMode === 'fixedFee'
        ? `固定利息：${money(num(f.fixedInterest))}${
            f.fixedInterestUnit === 'total' ? '' : f.fixedInterestUnit === 'monthly' ? '/月' : '/年'
          }（全期利息 ${money(
            fixedInterestTotal(num(f.fixedInterest), f.fixedInterestUnit, c.months, c.freeMonths),
          )}，折算年化（单利）约 ${c.ratePct.toFixed(3).replace(/\.?0+$/, '')}%）｜还款方式：${REPAY_LABEL[c.repayMode]}｜期数：${c.months} 期${c.freeMonths > 0 ? `｜免息：前 ${c.freeMonths} 期` : ''}`
        : `年利率：${f.annualRatePct}%｜还款方式：${REPAY_LABEL[c.repayMode]}｜期数：${c.months} 期${c.freeMonths > 0 ? `｜免息：前 ${c.freeMonths} 期` : ''}`,
      ...(c.repayMode === 'equalPrincipal'
        ? [
            c.earlyRepay
              ? `月供：首期 ${money(c.monthly)}，逐月递减，共还 ${c.earlySettleMonth} 期（还款总额 ${money(c.totalRepay)}）`
              : `月供：首期 ${money(c.monthly)} 逐月递减至末期 ${money(c.lastMonthly)}（还款总额 ${money(c.totalRepay)}）`,
          ]
        : [
            c.earlyRepay
              ? `月供：${money(c.monthly)} × ${c.earlySettleMonth} 期（还款总额 ${money(c.totalRepay)}）`
              : `月供：${money(c.monthly)} × ${c.months} 期（还款总额 ${money(c.totalRepay)}）`,
          ]),
      ...(c.earlyRepay
        ? [
            `第 ${c.earlySettleMonth} 期一次性结清：${money(c.settleAmount)}（贷款终止）`,
            `提前还款手续费：${fmtCNY(c.earlyFee, true)}`,
          ]
        : []),
      `利息总额（贴息前）：${money(c.interest)}`,
      `贴息后实付利息：${money(c.interestNet)}`,
      `融资成本（利息 + 提前还款手续费 − 财政贴息）：${money(c.financeCost)}`,
      '',
    );
  }
  const tradeInRule = POLICY_2026.tradeIn[policyVehicle(f.vehicleType)];
  const scrapRule = POLICY_2026.scrap[policyVehicle(f.vehicleType)];
  const tradeInNote =
    f.tradeInMode === 'policy'
      ? `（按 2026 年政策计算，开票价 × ${Math.round(tradeInRule.rate * 100)}%，封顶 ${(tradeInRule.cap / 10000).toFixed(1).replace('.0', '')} 万元）`
      : '';
  const scrapNote =
    f.scrapMode === 'policy'
      ? `（按 2026 年政策计算，开票价 × ${Math.round(scrapRule.rate * 100)}%，封顶 ${(scrapRule.cap / 10000).toFixed(1).replace('.0', '')} 万元）`
      : '';
  lines.push(
    '【政策补贴与门店服务（不计税）】',
    `旧车 / 首购：${OLD_CAR_LABEL[f.oldCarMode]}`,
    ...(f.oldCarMode === 'tradeIn' ? [`置换补贴：−${money(c.tradeIn)}${tradeInNote}`] : []),
    ...(f.oldCarMode === 'scrap' ? [`报废补贴：−${money(c.scrap)}${scrapNote}`] : []),
    ...(f.oldCarMode === 'firstBuy' ? [`首购补贴：−${money(c.firstBuy)}`] : []),
    `保险补贴：−${money(c.insuranceSubsidy)}`,
    `其他优惠：−${money(c.otherDiscount)}`,
    ...(c.stateSubsidy > 0
      ? [
          `财政贴息：−${money(c.stateSubsidy)}（随每期结息扣减，不改变月供；直接冲减落地总价${f.stateInterestSubsidy === String(stateSubsidyAmount(c.months).amount) ? `；按 5 万元基数 × 年贴息 1% × ${c.months / 12} 年计` : ''}）`,
        ]
      : []),
    '',
    '──────────────',
    `落地总价：${money(c.total)}`,
  );
  if (c.isLoan) {
    const paidMonths = c.earlyRepay ? c.earlySettleMonth : c.months;
    lines.push(
      `口径：首付 + 月供 × ${paidMonths} 期 + 结清 + 购置税 + 车船税 + 保险 + 杂费 − 补贴及其他优惠`,
      `其中融资成本 ${money(c.financeCost)}（贷款返现已冲减车价，全款口径 ${money(c.fullTotal)}）`,
    );
  } else {
    lines.push('口径：成交价 + 购置税 + 车船税 + 保险 + 杂费 − 补贴及其他优惠');
  }
  lines.push(
    '',
    `生成时间：${new Date().toLocaleString('zh-CN', { hour12: false })}`,
    '金额均为估算，不构成购车或金融建议；实际费用以经销商、税务与保险公司报价为准。',
  );
  return lines.join('\n');
}
