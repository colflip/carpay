import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { AnimatePresence, motion, useSpring, useTransform } from 'framer-motion';
import {
  ArrowRightLeft,
  BadgePercent,
  Banknote,
  Car,
  Check,
  Copy,
  CreditCard,
  Download,
  Fuel,
  Gauge,
  Github,
  Image as ImageIcon,
  Info,
  Landmark,
  Moon,
  ReceiptText,
  RotateCcw,
  ShieldCheck,
  Sun,
  Wallet,
  Zap,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

// 部署前替换为实际仓库地址
const GITHUB_URL = 'https://github.com/colflip/carpay';
const FORM_KEY = 'carpay:buy-form:v1';
const THEME_KEY = 'carpay:theme';

type VehicleType = 'fuel' | 'nev';
type PaymentMode = 'full' | 'finance' | 'mortgage';
type TaxRateMode = 'full' | 'half' | 'exempt';
type TabKey = 'buy' | 'own' | 'sell';

type MoneyKey =
  | 'msrp'
  | 'optionsFee'
  | 'officialDiscount'
  | 'dealerDiscount'
  | 'loanRebate'
  | 'tradeInSubsidy'
  | 'scrapSubsidy'
  | 'firstBuySubsidy'
  | 'purchaseTaxManual'
  | 'vehicleVesselTax'
  | 'compulsoryInsurance'
  | 'commercialInsurance'
  | 'plateFee'
  | 'serviceFee'
  | 'loanAmount'
  | 'earlyRepayFee';

interface BuyForm {
  modelName: string;
  vehicleType: VehicleType;
  taxRateMode: TaxRateMode;
  msrp: string;
  optionsFee: string;
  officialDiscount: string;
  dealerDiscount: string;
  loanRebate: string;
  tradeInSubsidy: string;
  scrapSubsidy: string;
  firstBuySubsidy: string;
  purchaseTaxManual: string | null;
  vehicleVesselTax: string;
  compulsoryInsurance: string;
  commercialInsurance: string;
  plateFee: string;
  serviceFee: string;
  paymentMode: PaymentMode;
  downPaymentPct: string;
  loanAmount: string;
  freeMonths: number;
  earlyRepayMonth: number;
  earlyRepayFee: string;
  annualRatePct: string;
  months: number;
}

interface Calc {
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

const MONTH_OPTIONS = [12, 24, 36, 48, 60];
const FREE_MONTH_OPTIONS = [0, 12, 24, 36];
const EARLY_MONTH_OPTIONS = [0, 12, 24, 36];

const DEFAULT_FORM: BuyForm = {
  modelName: '',
  vehicleType: 'fuel',
  taxRateMode: 'full',
  msrp: '150000',
  optionsFee: '0',
  officialDiscount: '10000',
  dealerDiscount: '5000',
  loanRebate: '0',
  tradeInSubsidy: '0',
  scrapSubsidy: '0',
  firstBuySubsidy: '0',
  purchaseTaxManual: null,
  vehicleVesselTax: '420',
  compulsoryInsurance: '950',
  commercialInsurance: '3500',
  plateFee: '125',
  serviceFee: '0',
  paymentMode: 'full',
  downPaymentPct: '30',
  loanAmount: '',
  freeMonths: 0,
  earlyRepayMonth: 0,
  earlyRepayFee: '0',
  annualRatePct: '3',
  months: 36,
};

const num = (s: string): number => {
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : 0;
};

const clamp = (n: number, min: number, max: number): number => Math.min(max, Math.max(min, n));

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

const fmtCNY = (n: number, withSign = false): string => {
  const sign = n < 0 ? '-' : withSign ? '+' : '';
  const s = Math.abs(n).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${sign}¥${s}`;
};

const deductCNY = (n: number): string => fmtCNY(-n);

const CN_DIGITS = ['零', '壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖'];
const CN_GROUP = ['', '万', '亿'];

function upperFourDigits(g: number): string {
  const units = ['', '拾', '佰', '仟'];
  const digits = [g % 10, Math.floor(g / 10) % 10, Math.floor(g / 100) % 10, Math.floor(g / 1000)];
  let s = '';
  for (let i = 3; i >= 0; i--) {
    const d = digits[i];
    if (d === 0) {
      if (s !== '' && !s.endsWith('零')) s += '零';
    } else {
      s += CN_DIGITS[d] + units[i];
    }
  }
  return s.replace(/零+$/, '');
}

function upperInt(n: number): string {
  const groups: number[] = [];
  let x = n;
  while (x > 0) {
    groups.push(x % 10000);
    x = Math.floor(x / 10000);
  }
  let out = '';
  for (let i = groups.length - 1; i >= 0; i--) {
    const g = groups[i];
    if (g === 0) continue;
    out += upperFourDigits(g) + CN_GROUP[i];
    const next = groups.slice(0, i).find((v) => v > 0);
    if (next !== undefined && next < 1000) out += '零';
  }
  return out;
}

function toCNUpper(amount: number): string {
  if (!Number.isFinite(amount) || amount <= 0) return '';
  const cents = Math.round(amount * 100);
  const int = Math.floor(cents / 100);
  if (int > 1e12) return '';
  const jiao = Math.floor((cents % 100) / 10);
  const fen = cents % 10;
  let s = int > 0 ? upperInt(int) + '元' : '';
  if (jiao === 0 && fen === 0) {
    s += '整';
  } else {
    if (jiao > 0) s += CN_DIGITS[jiao] + '角';
    else if (int > 0) s += '零';
    if (fen > 0) s += CN_DIGITS[fen] + '分';
  }
  return s;
}

const sanitizeMoney = (v: string): string => {
  let t = v.replace(/[^0-9.]/g, '');
  const i = t.indexOf('.');
  if (i >= 0) t = t.slice(0, i + 1) + t.slice(i + 1).replace(/\./g, '').slice(0, 2);
  return t;
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

function computeBuy(f: BuyForm): Calc {
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
  const insuranceTotal = compulsory + commercial;
  const feesTotal = plate + service;
  const subsNonLoan = tradeIn + scrap + firstBuy;
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
  const r = rate / 100 / 12;
  let settleAmount = 0;
  if (earlyRepay) {
    if (earlySettleMonth <= freeMonths || r <= 0) {
      settleAmount = round2(Math.max(0, principal - monthly * earlySettleMonth));
    } else {
      // 结清前利息按免息口径累计：免息期末余额按剩余期数摊还至第 E 期
      const bn = Math.max(0, principal - monthly * freeMonths);
      const fp = Math.pow(1 + r, earlySettleMonth - freeMonths);
      settleAmount = round2(Math.max(0, bn * fp - (monthly * (fp - 1)) / r));
    }
  }
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

function loadForm(): BuyForm {
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
      scrapSubsidy: s('scrapSubsidy') ?? d.scrapSubsidy,
      firstBuySubsidy: s('firstBuySubsidy') ?? d.firstBuySubsidy,
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

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}

function buildDetailText(f: BuyForm, c: Calc): string {
  const money = (n: number) => fmtCNY(n);
  const lines: string[] = [
    'CarPay · 购车落地测算明细',
    `车型：${f.modelName.trim() || '未命名车辆'}（${f.vehicleType === 'fuel' ? '燃油车' : '新能源车'}｜${c.isLoan ? (f.paymentMode === 'finance' ? '首付比例分期' : '固定额度贷款') : '全款'}）`,
    '',
    '【车价构成】',
    `厂商指导裸车原价：${money(num(f.msrp))}`,
    `选装包：${fmtCNY(num(f.optionsFee), true)}`,
    `官方优惠：-${money(num(f.officialDiscount))}`,
    `门店优惠：-${money(num(f.dealerDiscount))}`,
    ...(c.isLoan ? [`金融返点：-${money(c.rebate)}（冲减开票价与计税基数）`] : []),
    `计税基数（开票价）：${money(c.taxBase)}`,
    '',
    '【税费】',
    `购置税：${money(c.purchaseTax)}（${f.taxRateMode === 'full' ? '全额 10%' : f.taxRateMode === 'half' ? '减半 5%，减税上限 1.5 万' : '免征'}${f.purchaseTaxManual !== null ? '，手动修改' : '，自动计算'}）`,
    `车船税：${money(c.vessel)}（随交强险代收${f.vehicleType === 'nev' ? '，纯电动默认 0' : ''}）`,
    '',
    '【保险】',
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
      `【${f.paymentMode === 'finance' ? '首付比例分期' : '固定额度贷款'}方案（等额本息）】`,
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
  lines.push(
    '【补贴抵扣（不计税）】',
    `置换补贴：-${money(c.tradeIn)}`,
    `报废补贴：-${money(c.scrap)}`,
    `首购补贴：-${money(c.firstBuy)}`,
    '',
    '──────────────',
    `落地总价：${money(c.total)}`,
  );
  if (c.isLoan) {
    lines.push(`口径：首付 + 月供 × ${c.months} 期 + 购置税 + 保险 + 杂费 - 补贴（返点已冲减车价，全款口径 ${money(c.fullTotal)}）`);
  } else {
    lines.push('口径：计税基数 + 购置税 + 保险 + 杂费 - 补贴');
  }
  lines.push(
    '',
    `生成时间：${new Date().toLocaleString('zh-CN', { hour12: false })}`,
    '由 CarPay 纯前端离线计算生成，仅供参考。',
  );
  return lines.join('\n');
}

const inputBaseCls =
  'h-10 w-full rounded-xl border border-zinc-200 bg-white text-base tabular-nums outline-none transition-colors placeholder:text-zinc-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15 disabled:cursor-not-allowed disabled:opacity-45 dark:border-zinc-800 dark:bg-zinc-950/40 dark:placeholder:text-zinc-600 dark:focus:border-emerald-400';

function Tip({ text }: { text: string }) {
  return (
    <span
      tabIndex={0}
      role="note"
      aria-label={text}
      className="group/tip relative inline-flex shrink-0 cursor-help"
    >
      <Info
        size={13}
        strokeWidth={2}
        aria-hidden
        className="text-zinc-300 transition-colors group-hover/tip:text-zinc-500 dark:text-zinc-600 dark:group-hover/tip:text-zinc-400"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute bottom-full left-0 z-50 mb-2 w-72 rounded-xl bg-zinc-900 px-3.5 py-2.5 text-left text-[15px] font-normal leading-relaxed text-zinc-100 opacity-0 shadow-xl shadow-zinc-900/10 transition-opacity duration-150 group-hover/tip:opacity-100 group-focus/tip:opacity-100 after:absolute after:left-3 after:top-full after:-mt-1 after:h-2 after:w-2 after:rotate-45 after:bg-zinc-900 dark:bg-zinc-100 dark:text-zinc-900 dark:after:bg-zinc-100"
      >
        {text}
      </span>
    </span>
  );
}

function NumInput({
  id,
  value,
  onChange,
  onBlur,
  prefix = '¥',
  suffix,
  disabled,
  widthClass = 'sm:w-44',
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  prefix?: string | null;
  suffix?: string;
  disabled?: boolean;
  widthClass?: string;
}) {
  return (
    <div className={`w-full ${widthClass}`}>
      <div className="relative">
        {prefix && (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-zinc-400 dark:text-zinc-500">
            {prefix}
          </span>
        )}
        <input
          id={id}
          type="text"
          inputMode="decimal"
          disabled={disabled}
          value={value}
          placeholder="0"
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          className={`${inputBaseCls} text-right ${prefix ? 'pl-7' : 'pl-3'} ${suffix ? 'pr-8' : 'pr-3'}`}
        />
        {suffix && (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-400 dark:text-zinc-500">
            {suffix}
          </span>
        )}
      </div>
      {prefix === '¥' && num(value) > 0 && (
        <div className="mt-1 text-right text-[11px] leading-snug text-zinc-400 dark:text-zinc-500">
          {toCNUpper(num(value))}
        </div>
      )}
    </div>
  );
}

function FieldRow({
  label,
  htmlFor,
  tip,
  badge,
  muted,
  children,
}: {
  label: string;
  htmlFor: string;
  tip: string;
  badge?: ReactNode;
  muted?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <div className="flex min-w-0 items-center gap-1.5">
        <label
          htmlFor={htmlFor}
          className={`text-base ${muted ? 'text-zinc-400 dark:text-zinc-500' : 'text-zinc-700 dark:text-zinc-300'}`}
        >
          {label}
        </label>
        <Tip text={tip} />
        {badge}
      </div>
      {children}
    </div>
  );
}

function FormSection({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="px-4 py-3.5 sm:px-5">
      <div className="mb-1 flex items-center gap-2 text-zinc-500 dark:text-zinc-400">
        <Icon size={14} strokeWidth={2} aria-hidden />
        <h3 className="text-[13px] font-medium">{title}</h3>
      </div>
      <div className="divide-y divide-zinc-100 dark:divide-zinc-800/70">{children}</div>
    </section>
  );
}

function Segmented<T extends string>({
  value,
  onChange,
  options,
  groupId,
  ariaLabel,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; icon?: LucideIcon }[];
  groupId: string;
  ariaLabel: string;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="flex w-full flex-col gap-0.5 rounded-xl border border-zinc-200 bg-zinc-100/60 p-0.5 dark:border-zinc-800 dark:bg-zinc-900/80 sm:inline-flex sm:w-auto sm:flex-row"
    >
      {options.map((o) => {
        const active = o.value === value;
        const Icon = o.icon;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o.value)}
            className={`relative flex h-9 w-full items-center justify-center gap-1.5 rounded-[10px] px-4 text-base transition-colors sm:w-auto sm:px-5 ${
              active
                ? 'text-zinc-900 dark:text-zinc-50'
                : 'text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200'
            }`}
          >
            {active && (
              <motion.span
                layoutId={groupId}
                className="absolute inset-0 rounded-[10px] bg-white shadow-sm dark:bg-zinc-800"
                transition={{ type: 'spring', stiffness: 420, damping: 34 }}
              />
            )}
            <span className="relative flex items-center gap-1.5">
              {Icon && <Icon size={14} strokeWidth={2} aria-hidden />}
              {o.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function SummaryRow({
  label,
  tip,
  value,
  tone = 'base',
  badge,
}: {
  label: string;
  tip?: string;
  value: string;
  tone?: 'base' | 'minus' | 'plus' | 'strong' | 'muted';
  badge?: ReactNode;
}) {
  const toneCls = {
    base: 'text-zinc-700 dark:text-zinc-300',
    minus: 'text-emerald-600 dark:text-emerald-400',
    plus: 'text-zinc-500 dark:text-zinc-400',
    strong: 'font-medium text-zinc-900 dark:text-zinc-50',
    muted: 'text-zinc-400 dark:text-zinc-600',
  }[tone];
  return (
    <div className="flex items-baseline justify-between gap-4 text-[15px]">
      <span className="flex min-w-0 items-center gap-1.5 text-zinc-500 dark:text-zinc-400">
        <span className="truncate">{label}</span>
        {tip && <Tip text={tip} />}
        {badge}
      </span>
      <span className={`shrink-0 tabular-nums ${toneCls}`}>{value}</span>
    </div>
  );
}

function SummaryGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="py-2.5">
      <div className="text-[13px] font-medium text-zinc-400 dark:text-zinc-500">{title}</div>
      <div className="mt-1.5 space-y-1">{children}</div>
    </div>
  );
}

function AnimatedAmount({ value }: { value: number }) {
  const mv = useSpring(value, { stiffness: 150, damping: 24 });
  useEffect(() => {
    mv.set(value);
  }, [value, mv]);
  const text = useTransform(mv, (v) => {
    const s = Math.abs(v).toLocaleString('zh-CN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return (v < 0 ? '-' : '') + s;
  });
  return (
    <span className="tabular-nums">
      <span className="text-[0.62em] font-medium opacity-60">¥</span>{' '}
      <motion.span>{text}</motion.span>
    </span>
  );
}

function CompositionBar({ parts }: { parts: { label: string; value: number; cls: string }[] }) {
  const shown = parts.filter((p) => p.value > 0);
  const sum = shown.reduce((a, p) => a + p.value, 0);
  if (sum <= 0) return null;
  return (
    <div className="mt-3">
      <div className="flex h-2 w-full gap-px overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
        {shown.map((p) => (
          <div
            key={p.label}
            className={p.cls}
            style={{ width: `${(p.value / sum) * 100}%` }}
            title={`${p.label} ${fmtCNY(p.value)}`}
          />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {shown.map((p) => (
          <span
            key={p.label}
            className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400"
          >
            <span className={`h-1.5 w-1.5 rounded-full ${p.cls}`} aria-hidden />
            {p.label}
            <span className="tabular-nums text-zinc-600 dark:text-zinc-300">{fmtCNY(p.value)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function ModulePlaceholder({
  icon: Icon,
  title,
  desc,
  items,
}: {
  icon: LucideIcon;
  title: string;
  desc: string;
  items: string[];
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-300 bg-white/60 px-6 py-12 text-center sm:py-16 dark:border-zinc-700 dark:bg-zinc-900/40">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
        <Icon size={22} strokeWidth={2} aria-hidden />
      </div>
      <h3 className="mt-4 flex items-center gap-2 text-base font-semibold">
        {title}
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-400/10 dark:text-amber-400">
          开发中
        </span>
      </h3>
      <p className="mt-1.5 max-w-sm text-[15px] leading-relaxed text-zinc-500 dark:text-zinc-400">{desc}</p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {items.map((i) => (
          <span
            key={i}
            className="rounded-lg border border-zinc-200 px-2.5 py-1 text-[13px] text-zinc-500 dark:border-zinc-800 dark:text-zinc-400"
          >
            {i}
          </span>
        ))}
      </div>
    </div>
  );
}

const TABS: { key: TabKey; label: string }[] = [
  { key: 'buy', label: '购车测算' },
  { key: 'own', label: '用车成本' },
  { key: 'sell', label: '卖车损益' },
];

const TAX_MODES: { value: TaxRateMode; label: string }[] = [
  { value: 'full', label: '全额' },
  { value: 'half', label: '减半' },
  { value: 'exempt', label: '免征' },
];

export default function CarPayCalculator() {
  const [tab, setTab] = useState<TabKey>('buy');
  const [dark, setDark] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(THEME_KEY);
      if (saved === 'dark') return true;
      if (saved === 'light') return false;
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    } catch {
      return false;
    }
  });
  const [form, setForm] = useState<BuyForm>(loadForm);
  const [copied, setCopied] = useState(false);
  const [exportingImg, setExportingImg] = useState(false);
  const copyTimer = useRef<number | undefined>(undefined);
  const summaryRef = useRef<HTMLDivElement>(null);

  const patch = useCallback((p: Partial<BuyForm>) => setForm((f) => ({ ...f, ...p })), []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    try {
      localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light');
    } catch {
      /* 隐私模式等场景下写入失败可忽略 */
    }
  }, [dark]);

  useEffect(() => {
    try {
      localStorage.setItem(FORM_KEY, JSON.stringify(form));
    } catch {
      /* 同上 */
    }
  }, [form]);

  useEffect(() => () => window.clearTimeout(copyTimer.current), []);

  const calc = useMemo(() => computeBuy(form), [form]);

  const setMoney = useCallback(
    (key: MoneyKey, raw: string) => patch({ [key]: sanitizeMoney(raw) } as Partial<BuyForm>),
    [patch],
  );

  const setVehicleType = useCallback(
    (vehicleType: VehicleType) =>
      patch({
        vehicleType,
        purchaseTaxManual: null,
        taxRateMode: vehicleType === 'fuel' ? 'full' : 'exempt',
        vehicleVesselTax: vehicleType === 'fuel' ? '420' : '0',
      }),
    [patch],
  );

  const handleCopy = async () => {
    const ok = await copyText(buildDetailText(form, calc));
    if (ok) {
      setCopied(true);
      window.clearTimeout(copyTimer.current);
      copyTimer.current = window.setTimeout(() => setCopied(false), 2000);
    }
  };

  const exportBaseName = () =>
    (form.modelName.trim() || '未命名车辆').replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 30);

  const handleExport = () => {
    const text = buildDetailText(form, calc);
    const blob = new Blob(['\ufeff' + text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `CarPay-${exportBaseName()}-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportImage = async () => {
    const el = summaryRef.current;
    if (!el || exportingImg) return;
    setExportingImg(true);
    try {
      const { toPng } = await import('html-to-image');
      const dataUrl = await toPng(el, {
        pixelRatio: 2,
        backgroundColor: dark ? '#18181b' : '#ffffff',
      });
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `CarPay-${exportBaseName()}-${new Date().toISOString().slice(0, 10)}.png`;
      a.click();
    } catch {
      /* 截图失败时静默退出，可改用导出 txt */
    } finally {
      setExportingImg(false);
    }
  };

  const loanLabel = form.paymentMode === 'finance' ? '首付比例分期' : '固定额度贷款';

  const taxManualBadge =
    form.purchaseTaxManual !== null ? (
      <span className="rounded-full border border-zinc-200 px-1.5 py-px text-[10px] leading-4 text-zinc-400 dark:border-zinc-700 dark:text-zinc-500">
        手动
      </span>
    ) : null;

  const taxRateChips = (
    <div className="inline-flex items-center gap-0.5 rounded-lg border border-zinc-200 bg-zinc-100/60 p-0.5 dark:border-zinc-800 dark:bg-zinc-900/80">
      {TAX_MODES.map((m) => {
        const active = form.taxRateMode === m.value;
        return (
          <button
            key={m.value}
            type="button"
            aria-pressed={active}
            onClick={() => patch({ taxRateMode: m.value, purchaseTaxManual: null })}
            className={`h-7 rounded-md px-2.5 text-xs transition-colors ${
              active
                ? 'bg-white font-medium text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-50'
                : 'text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200'
            }`}
          >
            {m.label}
          </button>
        );
      })}
    </div>
  );

  const barParts = [
    { label: '车价', value: calc.taxBase, cls: 'bg-zinc-800 dark:bg-zinc-300' },
    { label: '税费', value: calc.purchaseTax + calc.vessel, cls: 'bg-amber-500' },
    { label: '保险', value: calc.insuranceTotal, cls: 'bg-sky-500' },
    { label: '杂费', value: calc.feesTotal, cls: 'bg-zinc-400 dark:bg-zinc-600' },
    ...(calc.isLoan && calc.interest > 0
      ? [{ label: '利息支出', value: calc.interest, cls: 'bg-rose-400' }]
      : []),
    ...(calc.earlyRepay && calc.earlyFee > 0
      ? [{ label: '提前还款手续费', value: calc.earlyFee, cls: 'bg-rose-400' }]
      : []),
  ];

  return (
    <div className="min-h-screen overflow-x-clip">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <header className="flex items-center justify-between gap-4 pb-1.5 pt-5">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900">
              <Car size={18} strokeWidth={2} aria-hidden />
            </div>
            <div className="min-w-0">
              <div className="text-base font-semibold leading-none tracking-tight">CarPay</div>
              <div className="mt-1 truncate text-xs text-zinc-500 dark:text-zinc-400">
                车辆全周期成本计算器
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noreferrer"
              aria-label="GitHub 仓库"
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-200 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
            >
              <Github size={16} strokeWidth={2} aria-hidden />
            </a>
            <button
              type="button"
              aria-label={dark ? '切换到浅色模式' : '切换到深色模式'}
              onClick={() => setDark((d) => !d)}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-200 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
            >
              {dark ? <Sun size={16} strokeWidth={2} aria-hidden /> : <Moon size={16} strokeWidth={2} aria-hidden />}
            </button>
          </div>
        </header>

        <nav className="mt-3 overflow-x-auto border-b border-zinc-200 dark:border-zinc-800" aria-label="功能模块">
          <div className="flex min-w-max gap-6">
            {TABS.map((t) => {
              const active = t.key === tab;
              return (
                <button
                  key={t.key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setTab(t.key)}
                  className={`relative flex items-center gap-1.5 pb-2.5 pt-1.5 text-base transition-colors ${
                    active
                      ? 'font-medium text-zinc-900 dark:text-zinc-50'
                      : 'text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200'
                  }`}
                >
                  {t.label}
                  {t.key !== 'buy' && (
                    <span className="rounded-full bg-amber-100 px-1.5 py-px text-[10px] font-medium text-amber-700 dark:bg-amber-400/10 dark:text-amber-400">
                      开发中
                    </span>
                  )}
                  {active && (
                    <motion.span
                      layoutId="carpay-tab-underline"
                      className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-zinc-900 dark:bg-zinc-100"
                      transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </nav>

        <main className="mt-4 lg:mt-5">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={tab}
              role="tabpanel"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
            >
              {tab === 'buy' ? (
                <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_400px] xl:grid-cols-[minmax(0,1fr)_420px]">
                  <form className="rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                    <div className="divide-y divide-zinc-100 dark:divide-zinc-800/70">
                      <FormSection icon={Car} title="车辆信息">
                        <FieldRow
                          label="车辆型号名称"
                          htmlFor="modelName"
                          tip="仅作为备注在汇总卡片与导出明细中回显，不参与任何金额计算。"
                        >
                          <div className="w-full sm:w-52">
                            <input
                              id="modelName"
                              type="text"
                              maxLength={30}
                              value={form.modelName}
                              placeholder="如：比亚迪汉 EV"
                              onChange={(e) => patch({ modelName: e.target.value })}
                              className={`${inputBaseCls} px-3 text-right sm:text-left`}
                            />
                          </div>
                        </FieldRow>
                        <FieldRow
                          label="车辆类型"
                          htmlFor="vehicleType"
                          tip="决定购置税默认档位：燃油车默认全额 10%，新能源车默认免征（0 元）；新能源 2026 至 2027 年为减半征收，可在下方购置税处切换档位。"
                        >
                          <Segmented
                            groupId="carpay-vehicle"
                            ariaLabel="车辆类型"
                            value={form.vehicleType}
                            onChange={setVehicleType}
                            options={[
                              { value: 'fuel', label: '燃油', icon: Fuel },
                              { value: 'nev', label: '新能源', icon: Zap },
                            ]}
                          />
                        </FieldRow>
                      </FormSection>

                      <FormSection icon={Banknote} title="车价构成">
                        <FieldRow
                          label="厂商指导裸车原价"
                          htmlFor="msrp"
                          tip="官方指导价中的裸车部分，不含选装、税费与保险。"
                        >
                          <NumInput
                            id="msrp"
                            value={form.msrp}
                            onChange={(v) => setMoney('msrp', v)}
                          />
                        </FieldRow>
                        <FieldRow
                          label="选装包"
                          htmlFor="optionsFee"
                          tip="选装配置合计金额，计入开票价，参与购置税计税。"
                        >
                          <NumInput
                            id="optionsFee"
                            value={form.optionsFee}
                            onChange={(v) => setMoney('optionsFee', v)}
                          />
                        </FieldRow>
                        <FieldRow
                          label="官方优惠"
                          htmlFor="officialDiscount"
                          tip="厂家直降、官方限时优惠等，直接冲减计税基数。"
                        >
                          <NumInput
                            id="officialDiscount"
                            value={form.officialDiscount}
                            onChange={(v) => setMoney('officialDiscount', v)}
                          />
                        </FieldRow>
                        <FieldRow
                          label="门店优惠"
                          htmlFor="dealerDiscount"
                          tip="经销商让利、谈下的现金优惠，同样冲减计税基数。"
                        >
                          <NumInput
                            id="dealerDiscount"
                            value={form.dealerDiscount}
                            onChange={(v) => setMoney('dealerDiscount', v)}
                          />
                        </FieldRow>
                        <FieldRow
                          label="金融返点"
                          htmlFor="loanRebate"
                          muted={!calc.isLoan}
                          tip="通过金融分期或按揭渠道贷款获得的返点，冲减开票价与计税基数，并同额降低首付与月供基数；全款购车不适用。"
                        >
                          <NumInput
                            id="loanRebate"
                            value={form.loanRebate}
                            disabled={!calc.isLoan}
                            onChange={(v) => setMoney('loanRebate', v)}
                          />
                        </FieldRow>
                        <div className="flex items-center justify-between rounded-xl bg-zinc-100/80 px-3 py-2 dark:bg-zinc-800/50">
                          <span className="flex items-center gap-1.5 text-[13px] text-zinc-500 dark:text-zinc-400">
                            计税基数（开票价）
                            <Tip text="计税基数 = 裸车原价 + 选装包 - 官方优惠 - 门店优惠 - 金融返点（贷款时冲减），作为购置税的计税依据与首付、月供的基数；开票价明显低于税务局最低计税价时将按最低计税价核定，低开发票有风险。" />
                          </span>
                          <span className="text-[15px] font-medium tabular-nums text-zinc-900 dark:text-zinc-50">
                            {fmtCNY(calc.taxBase)}
                          </span>
                        </div>
                      </FormSection>

                      <FormSection icon={BadgePercent} title="补贴（抵扣总价，不计税）">
                        <FieldRow
                          label="置换补贴"
                          htmlFor="tradeInSubsidy"
                          tip="旧车置换获得的车价抵扣，直接抵扣落地总价，不参与购置税计税。"
                        >
                          <NumInput
                            id="tradeInSubsidy"
                            value={form.tradeInSubsidy}
                            onChange={(v) => setMoney('tradeInSubsidy', v)}
                          />
                        </FieldRow>
                        <FieldRow
                          label="报废补贴"
                          htmlFor="scrapSubsidy"
                          tip="旧车报废更新补贴（国家/地方以旧换新政策），抵扣总价，不计税。"
                        >
                          <NumInput
                            id="scrapSubsidy"
                            value={form.scrapSubsidy}
                            onChange={(v) => setMoney('scrapSubsidy', v)}
                          />
                        </FieldRow>
                        <FieldRow
                          label="首购补贴"
                          htmlFor="firstBuySubsidy"
                          tip="名下无车首购激励补贴，抵扣总价，不计税。"
                        >
                          <NumInput
                            id="firstBuySubsidy"
                            value={form.firstBuySubsidy}
                            onChange={(v) => setMoney('firstBuySubsidy', v)}
                          />
                        </FieldRow>
                      </FormSection>

                      <FormSection icon={ReceiptText} title="购置税与保险">
                        <FieldRow
                          label="购置税"
                          htmlFor="purchaseTax"
                          badge={
                            <>
                              {taxRateChips}
                              {taxManualBadge}
                            </>
                          }
                          tip="档位税率：全额 10%、减半 5%、免征 0，自动按 计税基数 ÷ 1.13 × 税率 计算；减半档已按新能源 2026 至 2027 年政策自动套用每辆 1.5 万减税上限；换电车型按不含电池价格计税；可手动修改，改回自动点右侧按钮。"
                        >
                          <div className="flex items-center gap-2">
                            <NumInput
                              id="purchaseTax"
                              widthClass="sm:w-36"
                              value={form.purchaseTaxManual ?? String(calc.taxAuto)}
                              onChange={(v) => setMoney('purchaseTaxManual', v)}
                            />
                            {form.purchaseTaxManual !== null && (
                              <button
                                type="button"
                                aria-label="恢复自动计算购置税"
                                title="恢复自动计算"
                                onClick={() => patch({ purchaseTaxManual: null })}
                                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-zinc-200 text-zinc-400 transition-colors hover:border-emerald-400 hover:text-emerald-600 dark:border-zinc-800 dark:hover:border-emerald-500/60 dark:hover:text-emerald-400"
                              >
                                <RotateCcw size={13} strokeWidth={2} aria-hidden />
                              </button>
                            )}
                          </div>
                        </FieldRow>
                        <FieldRow
                          label="车船税"
                          htmlFor="vehicleVesselTax"
                          tip="随交强险由保险公司代收，按排量分档、各省标准不同：1.0L 以下约 60-360 元/年、1.0-1.6L 约 300-540、1.6-2.0L 约 420、2.0-2.5L 约 720、2.5-3.0L 约 1800；纯电动乘用车不征收（默认 0），插混按排量计。按实际代收金额修改。"
                        >
                          <NumInput
                            id="vehicleVesselTax"
                            value={form.vehicleVesselTax}
                            onChange={(v) => setMoney('vehicleVesselTax', v)}
                          />
                        </FieldRow>
                        <FieldRow
                          label="交强险"
                          htmlFor="compulsoryInsurance"
                          tip="交强险首年 950 元为家用 6 座以下常见报价（6 座及以上 1100），仅含首年，按实际保单修改。"
                        >
                          <NumInput
                            id="compulsoryInsurance"
                            value={form.compulsoryInsurance}
                            onChange={(v) => setMoney('compulsoryInsurance', v)}
                          />
                        </FieldRow>
                        <FieldRow
                          label="商业险"
                          htmlFor="commercialInsurance"
                          tip="车损险、第三者责任险等商业险首年估算值，仅含首年保费，按保险公司报价单修改。"
                        >
                          <NumInput
                            id="commercialInsurance"
                            value={form.commercialInsurance}
                            onChange={(v) => setMoney('commercialInsurance', v)}
                          />
                        </FieldRow>
                      </FormSection>

                      <FormSection icon={Wallet} title="其他杂费">
                        <FieldRow
                          label="上牌费"
                          htmlFor="plateFee"
                          tip="车管所工本费：号牌 100 + 行驶证 10 + 登记证书 10 + 临牌 5 约 125 元，自办另加拓印拍照约 50-100；4S 代办一般收 500-2000 元；沪牌等竞价/摇号指标成本另计。"
                        >
                          <NumInput
                            id="plateFee"
                            value={form.plateFee}
                            onChange={(v) => setMoney('plateFee', v)}
                          />
                        </FieldRow>
                        <FieldRow
                          label="服务费"
                          htmlFor="serviceFee"
                          tip="出库费、PDI 检测、金融服务手续费、GPS 费（行情 800-2000，多可协商取消）、抵押登记工本费等经销商服务性收费；续保押金可退，不计入成本；无则填 0。"
                        >
                          <NumInput
                            id="serviceFee"
                            value={form.serviceFee}
                            onChange={(v) => setMoney('serviceFee', v)}
                          />
                        </FieldRow>
                      </FormSection>

                      <FormSection icon={CreditCard} title="付款方式">
                        <div className="py-2">
                          <div className="mb-2 flex items-center gap-1.5">
                            <span className="text-base text-zinc-700 dark:text-zinc-300">付款方式</span>
                            <Tip text="全款：一次性付清车价。首付比例分期：按首付比例贷款，厂家或金融机构分期，常见贴息活动。固定额度贷款：直接输入固定贷款额度，银行车贷抵押，期限更长。两种贷款均按等额本息测算月供，金融返点填在上方车价构成中。" />
                          </div>
                          <Segmented
                            groupId="carpay-payment"
                            ariaLabel="付款方式"
                            value={form.paymentMode}
                            onChange={(paymentMode) => patch({ paymentMode })}
                            options={[
                              { value: 'full', label: '全款', icon: Banknote },
                              { value: 'finance', label: '首付比例分期', icon: CreditCard },
                              { value: 'mortgage', label: '固定额度贷款', icon: Landmark },
                            ]}
                          />
                        </div>

                        <AnimatePresence mode="wait" initial={false}>
                          {calc.isLoan && (
                            <motion.div
                              key="loan-fields"
                              initial={{ opacity: 0, y: 6 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -6 }}
                              transition={{ duration: 0.18, ease: 'easeOut' }}
                              className="divide-y divide-zinc-100 dark:divide-zinc-800/70"
                            >
                              {form.paymentMode === 'finance' && (
                                <div className="py-2">
                                  <div className="flex items-center justify-between gap-6">
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-base text-zinc-700 dark:text-zinc-300">首付比例</span>
                                      <Tip text="首付占裸车成交价（计税基数）的比例，剩余部分为贷款本金。" />
                                    </div>
                                    <NumInput
                                      id="downPct"
                                      prefix={null}
                                      suffix="%"
                                      widthClass="sm:w-28"
                                      value={form.downPaymentPct}
                                      onChange={(v) => patch({ downPaymentPct: sanitizeMoney(v) })}
                                      onBlur={() =>
                                        patch({
                                          downPaymentPct: String(
                                            clamp(Math.round(num(form.downPaymentPct) * 10) / 10, 0, 100),
                                          ),
                                        })
                                      }
                                    />
                                  </div>
                                  <input
                                    type="range"
                                    min={0}
                                    max={100}
                                    step={1}
                                    aria-label="首付比例滑块"
                                    value={String(calc.pct)}
                                    onChange={(e) => patch({ downPaymentPct: e.target.value })}
                                    className="mt-2 w-full accent-emerald-600"
                                  />
                                </div>
                              )}
                              {form.paymentMode === 'mortgage' && (
                                <FieldRow
                                  label="贷款额度"
                                  htmlFor="loanAmount"
                                  tip="直接输入固定贷款额度（贷款本金），不超出计税基数；首付 = 计税基数 - 贷款额。"
                                >
                                  <NumInput
                                    id="loanAmount"
                                    value={form.loanAmount}
                                    onChange={(v) => setMoney('loanAmount', v)}
                                  />
                                </FieldRow>
                              )}

                              <div className="py-2">
                                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-zinc-100/80 px-3 py-1.5 text-[13px] tabular-nums text-zinc-500 dark:bg-zinc-800/50 dark:text-zinc-400">
                                  <span>首付 {fmtCNY(calc.down)}</span>
                                  <span>贷款本金 {fmtCNY(calc.principal)}</span>
                                  <span>月供 {fmtCNY(calc.monthly)}</span>
                                  {calc.freeMonths > 0 && <span>前 {calc.freeMonths} 期免息</span>}
                                  {calc.earlyRepay && (
                                    <span>
                                      第 {calc.earlySettleMonth} 期后结清 {fmtCNY(calc.settleAmount)}
                                    </span>
                                  )}
                                </div>
                              </div>

                              <FieldRow
                                label="年利率"
                                htmlFor="annualRatePct"
                                tip="贷款年化利率（单利）。0 表示全额贴息，此时月供为本金均摊。"
                              >
                                <NumInput
                                  id="annualRatePct"
                                  prefix={null}
                                  suffix="%"
                                  widthClass="sm:w-28"
                                  value={form.annualRatePct}
                                  onChange={(v) => patch({ annualRatePct: sanitizeMoney(v) })}
                                  onBlur={() =>
                                    patch({ annualRatePct: String(Math.max(0, num(form.annualRatePct))) })
                                  }
                                />
                              </FieldRow>

                              <div className="flex items-center justify-between gap-6 py-2">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-base text-zinc-700 dark:text-zinc-300">期数</span>
                                  <Tip text="贷款总期数（月）。月供按等额本息计算：本金 × 月利率 × (1+月利率)^期数 ÷ ((1+月利率)^期数 - 1)。" />
                                </div>
                                <div className="flex flex-wrap justify-end gap-1.5" role="group" aria-label="贷款期数选项">
                                  {MONTH_OPTIONS.map((m) => {
                                    const active = form.months === m;
                                    return (
                                      <button
                                        key={m}
                                        type="button"
                                        aria-pressed={active}
                                        onClick={() =>
                                          patch({
                                            months: m,
                                            ...(form.earlyRepayMonth >= m ? { earlyRepayMonth: 0 } : {}),
                                          })
                                        }
                                        className={`h-9 min-w-[3.4rem] rounded-xl border text-[15px] tabular-nums transition-colors ${
                                          active
                                            ? 'border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900'
                                            : 'border-zinc-200 text-zinc-600 hover:border-zinc-400 dark:border-zinc-800 dark:text-zinc-300 dark:hover:border-zinc-600'
                                        }`}
                                      >
                                        {m}期
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>

                              <div className="flex items-center justify-between gap-6 py-2">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-base text-zinc-700 dark:text-zinc-300">免息期数</span>
                                  <Tip text="前 N 期免息（贴息方案）：月供全程等额，前 N 期不计息，剩余期数按年利率计息；如「5年2年免息」即期数 60、免息 24，「3年2年免息」即期数 36、免息 24。免息期数超出期数时按全期免息计算。" />
                                </div>
                                <div className="flex flex-wrap justify-end gap-1.5" role="group" aria-label="免息期数选项">
                                  {FREE_MONTH_OPTIONS.map((m) => {
                                    const active = form.freeMonths === m;
                                    return (
                                      <button
                                        key={m}
                                        type="button"
                                        aria-pressed={active}
                                        onClick={() => patch({ freeMonths: m })}
                                        className={`h-9 min-w-[3.4rem] rounded-xl border text-[15px] tabular-nums transition-colors ${
                                          active
                                            ? 'border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900'
                                            : 'border-zinc-200 text-zinc-600 hover:border-zinc-400 dark:border-zinc-800 dark:text-zinc-300 dark:hover:border-zinc-600'
                                        }`}
                                      >
                                        {m === 0 ? '不免息' : `${m}期`}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>

                              <div className="flex items-center justify-between gap-6 py-2">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-base text-zinc-700 dark:text-zinc-300">提前还款</span>
                                  <Tip text="到第 N 期时一次性结清剩余本金并支付手续费，结束贷款；结清前的利息按免息期数口径计算（免息期内不计息，之后按年利率计息）。如选 24 期即 2 年到期后还款结清。须小于总期数。" />
                                </div>
                                <div className="flex flex-wrap justify-end gap-1.5" role="group" aria-label="提前还款时点选项">
                                  {EARLY_MONTH_OPTIONS.map((m) => {
                                    const active = form.earlyRepayMonth === m;
                                    return (
                                      <button
                                        key={m}
                                        type="button"
                                        aria-pressed={active}
                                        disabled={m > 0 && m >= form.months}
                                        onClick={() => patch({ earlyRepayMonth: m })}
                                        className={`h-9 min-w-[3.4rem] rounded-xl border text-[15px] tabular-nums transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                                          active
                                            ? 'border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900'
                                            : 'border-zinc-200 text-zinc-600 hover:border-zinc-400 dark:border-zinc-800 dark:text-zinc-300 dark:hover:border-zinc-600'
                                        }`}
                                      >
                                        {m === 0 ? '不提前' : `${m}期`}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                              {form.earlyRepayMonth > 0 && calc.earlyRepay && (
                                <FieldRow
                                  label="提前还款手续费"
                                  htmlFor="earlyRepayFee"
                                  tip="提前结清时贷款机构收取的费用，常见为剩余本金的一定比例（如 2%-5%）或固定金额。"
                                >
                                  <NumInput
                                    id="earlyRepayFee"
                                    value={form.earlyRepayFee}
                                    onChange={(v) => setMoney('earlyRepayFee', v)}
                                  />
                                </FieldRow>
                              )}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </FormSection>
                    </div>
                  </form>

                  <aside className="self-start lg:sticky lg:top-5">
                    <div ref={summaryRef} className="rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                      <div className="px-4 pb-3 pt-4 sm:px-5">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-2">
                            <Car size={15} strokeWidth={2} aria-hidden className="shrink-0 text-zinc-400" />
                            <span className="truncate text-[15px] font-medium">
                              {form.modelName.trim() || '未命名车辆'}
                            </span>
                          </div>
                          <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-zinc-200 px-2 py-0.5 text-xs text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                            {form.vehicleType === 'fuel' ? (
                              <Fuel size={11} strokeWidth={2} aria-hidden />
                            ) : (
                              <Zap size={11} strokeWidth={2} aria-hidden />
                            )}
                            {form.vehicleType === 'fuel' ? '燃油' : '新能源'}
                          </span>
                        </div>
                        <CompositionBar parts={barParts} />
                      </div>

                      <div className="divide-y divide-zinc-100 border-t border-zinc-100 px-4 sm:px-5 dark:divide-zinc-800/70 dark:border-zinc-800/70">
                        <SummaryGroup title="车价">
                          <SummaryRow label="裸车原价" tip="厂商指导裸车原价，不含选装与税费。" value={fmtCNY(num(form.msrp))} />
                          <SummaryRow label="选装包" tip="计入开票价，参与计税。" value={fmtCNY(num(form.optionsFee), true)} tone="plus" />
                          <SummaryRow label="官方优惠" tip="厂家直降，冲减计税基数。" value={deductCNY(num(form.officialDiscount))} tone="minus" />
                          <SummaryRow label="门店优惠" tip="经销商让利，冲减计税基数。" value={deductCNY(num(form.dealerDiscount))} tone="minus" />
                          {calc.isLoan && (
                            <SummaryRow
                              label="金融返点"
                              tip="冲减开票价与计税基数。"
                              value={deductCNY(calc.rebate)}
                              tone={calc.rebate > 0 ? 'minus' : 'muted'}
                            />
                          )}
                          <div className="mt-1 flex items-baseline justify-between gap-4 border-t border-dashed border-zinc-200 pt-2 text-[15px] dark:border-zinc-700/70">
                            <span className="flex items-center gap-1.5 text-zinc-600 dark:text-zinc-300">
                              计税基数（开票价）
                              <Tip text="购置税以此为基数：按档位税率 基数 ÷ 1.13 × 税率；已扣减金融返点。" />
                            </span>
                            <span className="font-medium tabular-nums text-zinc-900 dark:text-zinc-50">
                              {fmtCNY(calc.taxBase)}
                            </span>
                          </div>
                        </SummaryGroup>

                        <SummaryGroup title="税费与保险">
                          <SummaryRow
                            label="购置税"
                            badge={taxManualBadge}
                            tip="按当前档位（全额 10% / 减半 5% / 免征）自动估算，减半已含 1.5 万减税上限，支持手动修改。"
                            value={fmtCNY(calc.purchaseTax)}
                          />
                          <SummaryRow
                            label="车船税"
                            tip="随交强险代收，按排量分档、各省不同；纯电动不征。"
                            value={fmtCNY(calc.vessel)}
                          />
                          <SummaryRow label="交强险" tip="交强险首年常见 950 元，可修改。" value={fmtCNY(calc.compulsory)} />
                          <SummaryRow label="商业险" tip="车损、三者等商业险估算值，可修改。" value={fmtCNY(calc.commercial)} />
                        </SummaryGroup>

                        <SummaryGroup title="其他杂费">
                          <SummaryRow label="上牌费" tip="车管所上牌及工本费用。" value={fmtCNY(calc.plate)} />
                          <SummaryRow label="服务费" tip="出库、PDI、金融手续费等。" value={fmtCNY(calc.service)} />
                        </SummaryGroup>

                        {calc.isLoan && (
                          <SummaryGroup title={`${loanLabel}方案（等额本息）`}>
                            <SummaryRow
                              label={form.paymentMode === 'finance' ? `首付（${calc.pct}%）` : '首付（车价 - 贷款额）'}
                              tip={
                                form.paymentMode === 'finance'
                                  ? '首付 = 计税基数 × 首付比例。'
                                  : '首付 = 计税基数 - 固定贷款额。'
                              }
                              value={fmtCNY(calc.down)}
                            />
                            <SummaryRow
                              label="贷款本金"
                              tip={form.paymentMode === 'finance' ? '贷款本金 = 计税基数 - 首付。' : '固定贷款额，不超出计税基数。'}
                              value={fmtCNY(calc.principal)}
                            />
                            {calc.freeMonths > 0 && (
                              <SummaryRow
                                label="免息期数"
                                tip={
                                  calc.earlyRepay
                                    ? '前 N 期不计息（贴息）。'
                                    : '前 N 期不计息（贴息），剩余期数按年利率计息，月供全程等额。'
                                }
                                value={`前 ${calc.freeMonths} 期`}
                              />
                            )}
                            <SummaryRow
                              label={`月供 × ${calc.earlyRepay ? calc.earlySettleMonth : calc.months}期`}
                              tip={
                                calc.freeMonths > 0
                                  ? `等额本息月供，前 ${calc.freeMonths} 期免息，剩余期数按年利率计息。`
                                  : '等额本息月供，利率 0 时为本金均摊。'
                              }
                              value={fmtCNY(calc.monthly)}
                              tone="strong"
                            />
                            {calc.earlyRepay && (
                              <SummaryRow
                                label={`第 ${calc.earlySettleMonth} 期后一次性结清`}
                                tip="到第 N 期时结清剩余本金，贷款终止；结清前利息按免息期数口径计算。"
                                value={fmtCNY(calc.settleAmount)}
                                tone="strong"
                              />
                            )}
                            <SummaryRow
                              label="还款总额"
                              tip={calc.earlyRepay ? '月供 × 免息期数 + 结清余额。' : '月供 × 期数。'}
                              value={fmtCNY(calc.totalRepay)}
                            />
                            {calc.earlyRepay && (
                              <SummaryRow
                                label="提前还款手续费"
                                tip="提前结清费用，计入落地总价。"
                                value={fmtCNY(calc.earlyFee, true)}
                                tone="plus"
                              />
                            )}
                            <SummaryRow
                              label="利息总额"
                              tip={
                                calc.earlyRepay
                                  ? '结清前实际产生的利息（按免息期数口径计算）。'
                                  : '还款总额 - 贷款本金，计入落地总价。'
                              }
                              value={fmtCNY(calc.interest)}
                              tone="strong"
                            />
                          </SummaryGroup>
                        )}

                        <SummaryGroup title="补贴抵扣（不计税）">
                          <SummaryRow
                            label="置换补贴"
                            tip="直接抵扣落地总价。"
                            value={deductCNY(calc.tradeIn)}
                            tone={calc.tradeIn > 0 ? 'minus' : 'muted'}
                          />
                          <SummaryRow
                            label="报废补贴"
                            tip="直接抵扣落地总价。"
                            value={deductCNY(calc.scrap)}
                            tone={calc.scrap > 0 ? 'minus' : 'muted'}
                          />
                          <SummaryRow
                            label="首购补贴"
                            tip="直接抵扣落地总价。"
                            value={deductCNY(calc.firstBuy)}
                            tone={calc.firstBuy > 0 ? 'minus' : 'muted'}
                          />
                        </SummaryGroup>
                      </div>

                      <div className="px-4 pb-4 pt-3 sm:px-5">
                        <div className="rounded-2xl bg-zinc-900 p-3.5 text-white sm:p-4 dark:bg-zinc-100 dark:text-zinc-900">
                          <div className="text-[13px] text-zinc-400 dark:text-zinc-500">
                            {calc.isLoan ? `${loanLabel}落地总价（全周期支出）` : '全款落地总价'}
                          </div>
                          <div className="mt-1 text-[30px] font-semibold leading-tight tracking-tight">
                            <AnimatedAmount value={calc.total} />
                          </div>
                          {calc.total > 0 && (
                            <div className="mt-1 text-xs leading-relaxed text-zinc-400 dark:text-zinc-500">
                              {toCNUpper(calc.total)}
                            </div>
                          )}
                        </div>
                        <div className="mt-2 space-y-0.5 text-left text-xs leading-relaxed tabular-nums text-zinc-500 dark:text-zinc-400">
                          {calc.isLoan && calc.interest > 0 && <div>含利息支出 {fmtCNY(calc.interest)}</div>}
                          <div>
                            {calc.isLoan
                              ? `首付 ${fmtCNY(calc.down)} + 月供 ${fmtCNY(calc.monthly)} × ${calc.earlyRepay ? calc.earlySettleMonth : calc.months} 期 + 结清/税险杂 - 补贴（返点已冲减车价）`
                              : `车价 ${fmtCNY(calc.taxBase)} + 税 ${fmtCNY(calc.purchaseTax + calc.vessel)} + 险 ${fmtCNY(calc.insuranceTotal)} + 杂 ${fmtCNY(calc.feesTotal)} - 补贴`}
                          </div>
                          {calc.isLoan && (
                            <div>
                              较全款购车{calc.total - calc.fullTotal >= 0 ? '多付' : '少付'}{' '}
                              {fmtCNY(Math.abs(calc.total - calc.fullTotal))}（全款口径 {fmtCNY(calc.fullTotal)}）
                            </div>
                          )}
                        </div>
                        <p className="mt-2.5 text-center text-[11px] leading-relaxed text-zinc-400 dark:text-zinc-500">
                          本测算为纯前端离线估算，仅供参考，不构成购车或金融建议；最终费用以经销商、税务及保险公司实际报价为准。
                        </p>
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                          <button
                            type="button"
                            onClick={() => setForm(DEFAULT_FORM)}
                            className="flex h-10 items-center justify-center gap-1.5 rounded-xl border border-zinc-200 text-sm text-zinc-600 transition-colors hover:border-zinc-300 hover:bg-zinc-50 sm:text-[15px] dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-800/60"
                          >
                            <RotateCcw size={14} strokeWidth={2} aria-hidden />
                            重置
                          </button>
                          <button
                            type="button"
                            onClick={handleCopy}
                            className="flex h-10 items-center justify-center gap-1.5 rounded-xl bg-zinc-900 text-sm font-medium text-white transition-colors hover:bg-zinc-700 sm:text-[15px] dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
                          >
                            {copied ? (
                              <>
                                <Check size={14} strokeWidth={2} aria-hidden className="text-emerald-500 dark:text-emerald-600" />
                                已复制
                              </>
                            ) : (
                              <>
                                <Copy size={14} strokeWidth={2} aria-hidden />
                                复制明细
                              </>
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={handleExport}
                            className="flex h-10 items-center justify-center gap-1.5 rounded-xl border border-zinc-200 text-sm text-zinc-600 transition-colors hover:border-zinc-300 hover:bg-zinc-50 sm:text-[15px] dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-800/60"
                          >
                            <Download size={14} strokeWidth={2} aria-hidden />
                            导出 txt
                          </button>
                          <button
                            type="button"
                            onClick={handleExportImage}
                            disabled={exportingImg}
                            className="flex h-10 items-center justify-center gap-1.5 rounded-xl border border-zinc-200 text-sm text-zinc-600 transition-colors hover:border-zinc-300 hover:bg-zinc-50 disabled:opacity-50 sm:text-[15px] dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-800/60"
                          >
                            <ImageIcon size={14} strokeWidth={2} aria-hidden />
                            {exportingImg ? '生成中' : '导出图片'}
                          </button>
                        </div>
                  </aside>
                </div>
              ) : tab === 'own' ? (
                <ModulePlaceholder
                  icon={Gauge}
                  title="用车成本"
                  desc="覆盖能耗、保养、保险续保与折旧摊销，测算持有期内的真实用车成本，正在开发中。"
                  items={['能源费用', '保养维修', '保险续保', '轮胎易损', '折旧摊销']}
                />
              ) : (
                <ModulePlaceholder
                  icon={ArrowRightLeft}
                  title="卖车损益"
                  desc="评估残值、结清贷款、核算过户与置换差价，算清卖车这一笔的损益，正在开发中。"
                  items={['残值估算', '贷款提前结清', '过户费用', '置换差价', '损益合计']}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </main>

        <footer className="mt-8 flex flex-col items-center gap-1.5 pb-6 text-center">
          <p className="flex flex-wrap items-center justify-center gap-1.5 text-xs text-zinc-400 dark:text-zinc-500">
            <ShieldCheck size={13} strokeWidth={2} aria-hidden />
            纯前端离线计算 · 表单数据仅保存在本地浏览器（localStorage），不上传任何服务器
          </p>
          <p className="text-xs text-zinc-300 dark:text-zinc-600">
            CarPay v0.1.0 · 预留「用车成本」「卖车损益」模块扩展
          </p>
        </footer>
      </div>
    </div>
  );
}
