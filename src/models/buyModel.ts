import { clamp, fmtCNY, num, round2 } from '../components/shared';

export const BUY_FORM_KEY = 'carpay:buy-form:v1';

export type VehicleType = 'fuel' | 'phev' | 'nev';
export type PolicyVehicleType = 'fuel' | 'nev';
export type PaymentMode = 'full' | 'finance' | 'mortgage';
export type TaxRateMode = 'full' | 'half' | 'exempt';

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
  // 计税口径（开票价）：选装是否计入、官方/门店优惠与金融返点是否冲减开票价
  taxOptions: boolean;
  taxOfficial: boolean;
  taxDealer: boolean;
  taxRebate: boolean;
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

export interface BuyCalc {
  dealPrice: number;
  dealPriceFull: number;
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

export function computeBuy(f: BuyForm): BuyCalc {
  const isLoan = f.paymentMode !== 'full';
  const msrp = num(f.msrp);
  const options = num(f.optionsFee);
  const official = num(f.officialDiscount);
  const dealer = num(f.dealerDiscount);
  const rebate = isLoan ? num(f.loanRebate) : 0;
  // 成交价：实际车价（指导价 + 选装 − 官方/门店优惠 − 金融返点），用于首付、月供与残值
  const grossPrice = msrp + options - official - dealer;
  const dealPrice = Math.max(0, grossPrice - rebate);
  const dealPriceFull = Math.max(0, grossPrice);
  // 计税基数（开票价）：单独按用户选择的计税口径计算，用于购置税与补贴，可与成交价不同
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
  const rate = Math.max(0, num(f.annualRatePct));
  const months = f.months;
  const freeMonths = clamp(f.freeMonths, 0, months);
  const earlySettleMonth = clamp(f.earlyRepayMonth, 0, months);
  const earlyRepay = isLoan && earlySettleMonth > 0 && earlySettleMonth < months;
  const earlyFee = earlyRepay ? num(f.earlyRepayFee) : 0;
  const fixedMode = f.paymentMode === 'mortgage';
  const fixedLoan = fixedMode ? clamp(num(f.loanAmount), 0, dealPrice) : 0;
  const down = round2(fixedMode ? dealPrice - fixedLoan : dealPrice * (pct / 100));
  const principal = round2(fixedMode ? fixedLoan : Math.max(0, dealPrice - down));
  const monthly = round2(annuityMonthly(principal, rate, months, freeMonths));
  const settleAmount = earlyRepay ? remainingPrincipalAt(principal, monthly, rate, freeMonths, earlySettleMonth) : 0;
  const paidMonths = earlyRepay ? earlySettleMonth : months;
  const totalRepay = round2(monthly * paidMonths + settleAmount);
  const interest = round2(Math.max(0, totalRepay - principal));
  const total = round2(
    (isLoan ? baseTotal + interest + earlyFee : baseTotal) - subsNonLoan,
  );

  return {
    dealPrice,
    dealPriceFull,
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

export function buildBuyDetailText(f: BuyForm, c: BuyCalc): string {
  const money = (n: number) => fmtCNY(n);
  // 计税口径：哪些项目进入开票价（用于购置税与补贴），与成交价口径分开说明
  const taxScope = [
    '厂商指导裸车原价',
    ...(f.taxOptions ? ['+ 选装包'] : ['（选装包不计入开票价）']),
    ...(f.taxOfficial ? ['− 官方优惠'] : ['（官方优惠不冲减开票价）']),
    ...(f.taxDealer ? ['− 门店优惠'] : ['（门店优惠不冲减开票价）']),
    ...(c.isLoan ? (f.taxRebate ? ['− 金融返点'] : ['（金融返点不冲减开票价）']) : []),
  ].join(' ');
  const lines: string[] = [
    'CarPay · 购车落地测算明细',
    `车型：${f.modelName.trim() || '未命名车辆'}（${VEHICLE_LABEL[f.vehicleType]}｜${c.isLoan ? (f.paymentMode === 'finance' ? '首付分期' : '额度贷款') : '全款'}）`,
    '',
    '【车价构成】',
    `厂商指导裸车原价：${money(num(f.msrp))}`,
    `选装包：${fmtCNY(num(f.optionsFee), true)}`,
    `官方优惠：−${money(num(f.officialDiscount))}`,
    `门店优惠：−${money(num(f.dealerDiscount))}`,
    ...(c.isLoan ? [`金融返点：−${money(c.rebate)}（冲减成交价）`] : []),
    `成交价（实际车价）：${money(c.dealPrice)}`,
    `计税基数（开票价）：${money(c.taxBase)}`,
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
    lines.push('口径：成交价 + 购置税 + 保险 + 杂费 − 补贴');
  }
  lines.push(
    '',
    `生成时间：${new Date().toLocaleString('zh-CN', { hour12: false })}`,
    '金额均为估算，不构成购车或金融建议；实际费用以经销商、税务与保险公司报价为准。',
  );
  return lines.join('\n');
}
