import { clamp, fmtCNY, num, round2 } from './shared';

export const FORM_KEY = 'carpay:buy-form:v1';

export type VehicleType = 'fuel' | 'nev';
export type PaymentMode = 'full' | 'finance' | 'mortgage';
export type TaxRateMode = 'full' | 'half' | 'exempt';

export interface BuyForm {
  modelName: string;
  vehicleType: VehicleType;
  taxRateMode: TaxRateMode;
  msrp: string;
  optionsFee: string;
  officialDiscount: string;
  dealerDiscount: string;
  loanRebate: string;
  tradeInSubsidy: string;
  tradeInMode: 'manual' | 'policy';
  scrapSubsidy: string;
  scrapMode: 'manual' | 'policy';
  firstBuySubsidy: string;
  firstBuyMode: 'manual' | 'policy';
  insuranceSubsidy: string;
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
  annualRatePct: string;
  months: number;
}

export interface Calc {
  taxBase: number;
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
  monthly: number;
  totalRepay: number;
  interest: number;
  fullTotal: number;
  total: number;
}

export const MONTH_OPTIONS = [12, 24, 36, 48, 60];
export const FREE_MONTH_OPTIONS = [0, 12, 24, 36];
export const EARLY_MONTH_OPTIONS = [0, 12, 24, 36];

// 2026 汽车以旧换新：国家统一按比例 + 封顶（发改环资〔2025〕1745号 / 商办消费函〔2025〕467号）
// 比例基数为新车销售价格（价税合计），即计税基数（开票价）；购置税另按 开票价 ÷ 1.13 计税
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
  const rule = POLICY_2026[kind][vehicleType];
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
  return Math.round(FIRST_BUY_2026[vehicleType].rate * 100);
}

export function firstBuyAmount(vehicleType: VehicleType, taxBase: number): number {
  const rule = FIRST_BUY_2026[vehicleType];
  return Math.min(round2(taxBase * rule.rate), rule.cap);
}

export const DEFAULT_FORM: BuyForm = {
  modelName: '',
  vehicleType: 'fuel',
  taxRateMode: 'full',
  msrp: '150000',
  optionsFee: '0',
  officialDiscount: '10000',
  dealerDiscount: '5000',
  loanRebate: '0',
  tradeInSubsidy: '',
  tradeInMode: 'manual',
  scrapSubsidy: '',
  scrapMode: 'manual',
  firstBuySubsidy: '',
  firstBuyMode: 'manual',
  insuranceSubsidy: '',
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
  annualRatePct: '3.25',
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
// 与「提前还款」口径共用同一公式，卖车损益模块按卖出月截断贷款时也用它
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

export function computeBuy(f: BuyForm): Calc {
  const isLoan = f.paymentMode !== 'full';
  const rebate = isLoan ? num(f.loanRebate) : 0;
  const grossPrice =
    num(f.msrp) + num(f.optionsFee) - num(f.officialDiscount) - num(f.dealerDiscount);
  const taxBase = Math.max(0, grossPrice - rebate);
  const taxBaseFull = Math.max(0, grossPrice);
  // 减半档按新能源 2026-2027 政策：每辆减税额上限 1.5 万
  const applyTaxCap = (gross: number): number =>
    f.taxRateMode === 'exempt' ? 0 : f.taxRateMode === 'half' ? round2(Math.max(gross * 0.5, gross - 15000)) : gross;
  const taxAuto = applyTaxCap(round2((taxBase / 1.13) * 0.1));
  const taxAutoFull = applyTaxCap(round2((taxBaseFull / 1.13) * 0.1));
  const purchaseTax = f.purchaseTaxManual !== null ? num(f.purchaseTaxManual) : taxAuto;
  const vessel = num(f.vehicleVesselTax);
  const compulsory = num(f.compulsoryInsurance);
  const commercial = num(f.commercialInsurance);
  const plate = num(f.plateFee);
  const service = num(f.serviceFee);
  const tradeIn = num(f.tradeInSubsidy);
  const scrap = num(f.scrapSubsidy);
  const firstBuy = num(f.firstBuySubsidy);
  const insuranceSubsidy = num(f.insuranceSubsidy);
  const insuranceTotal = compulsory + commercial;
  const feesTotal = plate + service;
  const subsNonLoan = tradeIn + scrap + firstBuy + insuranceSubsidy;
  const baseTotal = taxBase + purchaseTax + vessel + insuranceTotal + feesTotal;
  const fullTotal = round2(
    taxBaseFull +
      (f.purchaseTaxManual !== null ? num(f.purchaseTaxManual) : taxAutoFull) +
      vessel +
      insuranceTotal +
      feesTotal -
      subsNonLoan,
  );

  const pct = clamp(num(f.downPaymentPct), 0, 100);
  const rate = Math.max(0, num(f.annualRatePct));
  const months = f.months;
  const freeMonths = clamp(f.freeMonths, 0, months);
  const earlySettleMonth = clamp(f.earlyRepayMonth, 0, months);
  const earlyRepay = isLoan && earlySettleMonth > 0 && earlySettleMonth < months;
  const earlyFee = earlyRepay ? num(f.earlyRepayFee) : 0;
  const fixedMode = f.paymentMode === 'mortgage';
  const fixedLoan = fixedMode ? clamp(num(f.loanAmount), 0, taxBase) : 0;
  const down = round2(fixedMode ? taxBase - fixedLoan : taxBase * (pct / 100));
  const principal = round2(fixedMode ? fixedLoan : Math.max(0, taxBase - down));
  const monthly = round2(annuityMonthly(principal, rate, months, freeMonths));
  const settleAmount = earlyRepay ? remainingPrincipalAt(principal, monthly, rate, freeMonths, earlySettleMonth) : 0;
  const paidMonths = earlyRepay ? earlySettleMonth : months;
  const totalRepay = round2(monthly * paidMonths + settleAmount);
  const interest = round2(Math.max(0, totalRepay - principal));
  const total = round2(
    (isLoan ? baseTotal + interest + earlyFee : baseTotal) - subsNonLoan,
  );

  return {
    taxBase,
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
    monthly,
    totalRepay,
    interest,
    fullTotal,
    total,
  };
}

export function loadBuyForm(): BuyForm {
  const d = DEFAULT_FORM;
  try {
    const raw = localStorage.getItem(FORM_KEY);
    if (!raw) return d;
    const p = JSON.parse(raw) as Record<string, unknown>;
    const s = (k: keyof BuyForm): string | null => (typeof p[k] === 'string' ? (p[k] as string) : null);
    const months =
      typeof p.months === 'number' && MONTH_OPTIONS.includes(p.months) ? p.months : d.months;
    return {
      modelName: s('modelName') ?? d.modelName,
      vehicleType: p.vehicleType === 'nev' ? 'nev' : 'fuel',
      taxRateMode:
        p.taxRateMode === 'full' || p.taxRateMode === 'half' || p.taxRateMode === 'exempt'
          ? p.taxRateMode
          : p.vehicleType === 'nev'
            ? 'exempt'
            : 'full',
      msrp: s('msrp') ?? d.msrp,
      optionsFee: s('optionsFee') ?? d.optionsFee,
      officialDiscount: s('officialDiscount') ?? d.officialDiscount,
      dealerDiscount: s('dealerDiscount') ?? d.dealerDiscount,
      loanRebate:
        (typeof p.loanRebate === 'string' ? p.loanRebate : null) ??
        (typeof p.loanSubsidy === 'string' ? p.loanSubsidy : null) ??
        d.loanRebate,
      tradeInSubsidy: s('tradeInSubsidy') ?? d.tradeInSubsidy,
      tradeInMode: p.tradeInMode === 'policy' ? 'policy' : 'manual',
      scrapSubsidy: s('scrapSubsidy') ?? d.scrapSubsidy,
      scrapMode: p.scrapMode === 'policy' ? 'policy' : 'manual',
      firstBuySubsidy: s('firstBuySubsidy') ?? d.firstBuySubsidy,
      firstBuyMode: p.firstBuyMode === 'policy' ? 'policy' : 'manual',
      insuranceSubsidy: s('insuranceSubsidy') ?? d.insuranceSubsidy,
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
      annualRatePct: s('annualRatePct') ?? d.annualRatePct,
      months,
    };
  } catch {
    return d;
  }
}

export function buildDetailText(f: BuyForm, c: Calc): string {
  const money = (n: number) => fmtCNY(n);
  const lines: string[] = [
    'CarPay · 购车落地测算明细',
    `车型：${f.modelName.trim() || '未命名车辆'}（${f.vehicleType === 'fuel' ? '燃油车' : '新能源车'}｜${c.isLoan ? (f.paymentMode === 'finance' ? '首付分期' : '额度贷款') : '全款'}）`,
    '',
    '【车价构成】',
    `厂商指导裸车原价：${money(num(f.msrp))}`,
    `选装包：${fmtCNY(num(f.optionsFee), true)}`,
    `官方优惠：−${money(num(f.officialDiscount))}`,
    `门店优惠：−${money(num(f.dealerDiscount))}`,
    ...(c.isLoan ? [`金融返点：−${money(c.rebate)}（冲减开票价与计税基数）`] : []),
    `计税基数（开票价）：${money(c.taxBase)}`,
    '',
    '【税费与保险】',
    `购置税：${money(c.purchaseTax)}（${f.taxRateMode === 'full' ? '全额 10%' : f.taxRateMode === 'half' ? '减半 5%，减税上限 1.5 万元' : '免征'}${f.purchaseTaxManual !== null ? '，手动改写' : '，自动计算'}）`,
    `车船税：${money(c.vessel)}（随交强险代收${f.vehicleType === 'nev' ? '，纯电动免征' : ''}）`,
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
      `【${f.paymentMode === 'finance' ? '首付分期' : '额度贷款'}方案（等额本息）】`,
      f.paymentMode === 'mortgage'
        ? `固定贷款额：${money(c.principal)}（首付 ${money(c.down)}）`
        : `首付比例：${c.pct}%（首付 ${money(c.down)}）`,
      `贷款本金：${money(c.principal)}`,
      `年利率：${f.annualRatePct}%｜期数：${c.months} 期${c.freeMonths > 0 ? `｜免息：前 ${c.freeMonths} 期` : ''}`,
      ...(c.earlyRepay
        ? [
            `月供：${money(c.monthly)} × ${c.earlySettleMonth} 期（还款总额 ${money(c.totalRepay)}）`,
            `第 ${c.earlySettleMonth} 期一次性结清：${money(c.settleAmount)}（贷款终止）`,
            `提前还款手续费：${fmtCNY(c.earlyFee, true)}`,
          ]
        : [`月供：${money(c.monthly)} × ${c.months} 期（还款总额 ${money(c.totalRepay)}）`]),
      `利息总额：${money(c.interest)}`,
      '',
    );
  }
  const tradeInNote =
    f.tradeInMode === 'policy'
      ? `（按 2026 年政策计算，开票价 × ${Math.round(POLICY_2026.tradeIn[f.vehicleType].rate * 100)}%，封顶 ${(POLICY_2026.tradeIn[f.vehicleType].cap / 10000).toFixed(1).replace('.0', '')} 万元）`
      : '';
  const scrapNote =
    f.scrapMode === 'policy'
      ? `（按 2026 年政策计算，开票价 × ${Math.round(POLICY_2026.scrap[f.vehicleType].rate * 100)}%，封顶 ${(POLICY_2026.scrap[f.vehicleType].cap / 10000).toFixed(1).replace('.0', '')} 万元）`
      : '';
  lines.push(
    '【补贴抵扣（不计税）】',
    `置换补贴：−${money(c.tradeIn)}${tradeInNote}`,
    `报废补贴：−${money(c.scrap)}${scrapNote}`,
    `首购补贴：−${money(c.firstBuy)}`,
    `保险补贴：−${money(c.insuranceSubsidy)}`,
    '',
    '──────────────',
    `落地总价：${money(c.total)}`,
  );
  if (c.isLoan) {
    const paidMonths = c.earlyRepay ? c.earlySettleMonth : c.months;
    lines.push(
      `口径：首付 + 月供 × ${paidMonths} 期 + 结清 + 购置税 + 保险 + 杂费 − 补贴（金融返点已冲减车价，全款口径 ${money(c.fullTotal)}）`,
    );
  } else {
    lines.push('口径：计税基数 + 购置税 + 保险 + 杂费 − 补贴');
  }
  lines.push(
    '',
    `生成时间：${new Date().toLocaleString('zh-CN', { hour12: false })}`,
    '金额均为估算，不构成购车或金融建议；实际费用以经销商、税务与保险公司报价为准。',
  );
  return lines.join('\n');
}
