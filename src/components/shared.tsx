import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { motion, useSpring, useTransform } from 'framer-motion';
import { ChevronRight, Info } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

// 站点与仓库地址：页头 GitHub 图标、导出海报的二维码与仓库水印共用
export const SITE_URL = 'https://colflip.github.io/carpay/';
export const SITE_LINK = 'https://colflip.github.io/carpay';
export const GITHUB_URL = 'https://github.com/colflip/carpay';

export const num = (s: string): number => {
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : 0;
};

export const clamp = (n: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, n));

export const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

// 百分数格式化：保留 2-3 位小数（去掉末尾 0），如 3.25%、3.250%、0.5%
export const fmtPct = (n: number): string => {
  const s = n.toFixed(3).replace(/\.?0+$/, '');
  return `${s}%`;
};

export const fmtCNY = (n: number, withSign = false): string => {
  const sign = n < 0 ? '-' : withSign ? '+' : '';
  const s = Math.abs(n).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${sign}¥${s}`;
};

export const deductCNY = (n: number): string => fmtCNY(-n);

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
    // 向下一个非零组看：若中间隔着整组零（如 1 亿 + 0 万 + 1 千），
    // 或下一组不足千位（如 100 万 + 500），都需要补一个「零」
    let j = i - 1;
    while (j >= 0 && groups[j] === 0) j -= 1;
    if (j >= 0 && (i - j > 1 || groups[j] < 1000)) out += '零';
  }
  return out;
}

export function toCNUpper(amount: number): string {
  if (!Number.isFinite(amount) || amount <= 0) return '';
  const cents = Math.round(amount * 100);
  const int = Math.floor(cents / 100);
  if (int >= 1e12) return '';
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

export const sanitizeMoney = (v: string): string => {
  let t = v.replace(/[^0-9.]/g, '');
  const i = t.indexOf('.');
  if (i >= 0)
    t =
      t.slice(0, i + 1) +
      t
        .slice(i + 1)
        .replace(/\./g, '')
        .slice(0, 2);
  return t;
};

// 导出文件名用本地日期，避免 UTC+8 凌晨被 toISOString 记成前一天
export const localDateStamp = (): string => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

export const dataUrlToPngFile = (dataUrl: string, name: string): File => {
  const [head, b64] = dataUrl.split(',');
  const mime = /:(.*?);/.exec(head)?.[1] ?? 'image/png';
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return new File([bytes], name, { type: mime });
};

export async function copyText(text: string): Promise<boolean> {
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

export function LabelInput({
  id,
  label,
  tip,
  value,
  onChange,
  onBlur,
  prefix = '¥',
  suffix,
  disabled,
  muted,
  badge,
  controls,
  after,
  maxLength,
  placeholder = '0',
  bigValue,
}: {
  id: string;
  label: string;
  tip?: string;
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  prefix?: string | null;
  suffix?: string;
  disabled?: boolean;
  muted?: boolean;
  badge?: ReactNode;
  controls?: ReactNode;
  after?: ReactNode;
  maxLength?: number;
  placeholder?: string;
  bigValue?: boolean;
}) {
  const upper = prefix === '¥' && num(value) > 0 ? toCNUpper(num(value)) : '';
  const measureRef = useRef<HTMLSpanElement>(null);
  const [inputW, setInputW] = useState(48);
  useLayoutEffect(() => {
    const m = measureRef.current;
    if (!m) return;
    m.textContent = value || placeholder;
    setInputW(m.offsetWidth + 2);
  }, [value, placeholder]);
  // 移动端输入字号不小于 16px，避免 iOS Safari 聚焦时整页缩放
  const valueFontCls = bigValue ? 'text-base' : 'text-base sm:text-[15px]';
  return (
    <div className="w-full">
      <span
        ref={measureRef}
        aria-hidden
        className={`absolute invisible whitespace-nowrap font-sans ${valueFontCls} tabular-nums`}
      />
      <div
        className={`flex min-h-10 items-center gap-x-1.5 rounded-xl border border-zinc-200 bg-white pl-3 pr-2.5 transition-colors focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-500/15 dark:border-zinc-800 dark:bg-zinc-950/40 dark:focus-within:border-emerald-400 ${
          controls ? 'flex-wrap gap-y-1' : ''
        } ${disabled ? 'opacity-45' : ''}`}
      >
        <span
          className={`flex min-w-0 items-center gap-1 text-[15px] ${
            muted ? 'text-zinc-400 dark:text-zinc-500' : 'text-zinc-500 dark:text-zinc-400'
          }`}
        >
          <span className="min-w-0 truncate">{label}</span>
          {tip && <Tip text={tip} />}
          {badge && <span className="shrink-0">{badge}</span>}
        </span>
        {controls && <span className="flex min-w-0 items-center sm:-ml-1">{controls}</span>}
        <div className="ml-auto flex min-w-0 items-center gap-1.5">
          {upper && (
            <span className="hidden min-w-0 truncate text-right text-sm leading-none text-zinc-400 sm:inline dark:text-zinc-500">
              {upper}
            </span>
          )}
          {prefix && (
            <span className="shrink-0 text-sm text-zinc-400 dark:text-zinc-500">{prefix}</span>
          )}
          <input
            id={id}
            type="text"
            inputMode="decimal"
            aria-label={label}
            disabled={disabled}
            value={value}
            placeholder={placeholder}
            maxLength={maxLength}
            onChange={(e) => onChange(e.target.value)}
            onBlur={onBlur}
            style={{ width: `${inputW}px` }}
            className={`h-8 min-w-0 shrink bg-transparent ${valueFontCls} tabular-nums text-right outline-none placeholder:text-zinc-300 dark:placeholder:text-zinc-600 ${
              disabled ? 'cursor-not-allowed' : ''
            }`}
          />
          {suffix && (
            <span className="shrink-0 text-[13px] text-zinc-400 dark:text-zinc-500">{suffix}</span>
          )}
          {after}
        </div>
      </div>
    </div>
  );
}

// 说明气泡渲染到 body：汇总卡明细区是内部滚动容器，普通绝对定位会被 overflow 裁切
export function Tip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{
    left: number;
    top: number;
    width: number;
    arrowLeft: number;
    above: boolean;
  } | null>(null);
  const anchorRef = useRef<HTMLButtonElement>(null);

  const place = useCallback(() => {
    const el = anchorRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const width = Math.min(272, window.innerWidth - 24);
    const left = clamp(r.left + r.width / 2 - width / 2, 12, window.innerWidth - width - 12);
    // 上方空间不足且下方更充裕时翻到下方，避免在视口上缘被裁切
    const above = r.top >= 150 || r.top > window.innerHeight - r.bottom;
    setPos({
      left,
      top: above ? r.top - 8 : r.bottom + 8,
      width,
      arrowLeft: clamp(r.left + r.width / 2 - left, 14, width - 14),
      above,
    });
  }, []);

  // 打开期间跟随滚动/缩放重新定位（捕获阶段可覆盖明细区内部滚动）
  useEffect(() => {
    if (!open) return;
    const onMove = () => place();
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    return () => {
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
    };
  }, [open, place]);

  const show = () => {
    place();
    setOpen(true);
  };

  return (
    <>
      <button
        type="button"
        ref={anchorRef}
        aria-label={`说明：${text}`}
        aria-expanded={open}
        onClick={(e) => {
          e.preventDefault();
          show();
        }}
        onMouseEnter={show}
        onMouseLeave={() => setOpen(false)}
        onFocus={show}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false);
        }}
        className="relative inline-flex shrink-0 cursor-help appearance-none border-0 bg-transparent p-2 -m-2 leading-none"
      >
        <Info
          size={13}
          strokeWidth={2}
          aria-hidden
          className="text-zinc-300 transition-colors hover:text-zinc-500 dark:text-zinc-600 dark:hover:text-zinc-400"
        />
      </button>
      {open && pos
        ? createPortal(
            <div
              role="tooltip"
              style={{
                position: 'fixed',
                left: pos.left,
                top: pos.top,
                width: pos.width,
                transform: pos.above ? 'translateY(-100%)' : undefined,
              }}
              className="pointer-events-none z-[60] rounded-xl bg-zinc-900 px-3 py-2 text-left text-[13px] font-normal leading-relaxed text-zinc-100 shadow-xl shadow-zinc-900/20 dark:bg-zinc-100 dark:text-zinc-900"
            >
              {text}
              <span
                aria-hidden
                className="absolute h-2 w-2 rotate-45 bg-zinc-900 dark:bg-zinc-100"
                style={{
                  left: pos.arrowLeft - 4,
                  bottom: pos.above ? -4 : undefined,
                  top: pos.above ? undefined : -4,
                }}
              />
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

export function Disclosure({
  title,
  hint,
  defaultOpen = false,
  children,
}: {
  title: string;
  hint?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="py-1.5">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 rounded-lg py-1 text-left text-sm text-zinc-700 transition-colors hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100"
      >
        <span className="flex min-w-0 items-center gap-1">
          <ChevronRight
            size={13}
            strokeWidth={2}
            aria-hidden
            className={`shrink-0 transition-transform ${open ? 'rotate-90' : ''}`}
          />
          <span className="truncate">{title}</span>
          {hint && <span className="truncate text-zinc-400 dark:text-zinc-500">{hint}</span>}
        </span>
        <span className="shrink-0 text-zinc-400 dark:text-zinc-500">{open ? '收起' : '展开'}</span>
      </button>
      {open && <div className="panel-enter">{children}</div>}
    </div>
  );
}

export function FormSection({
  icon: Icon,
  title,
  titleTip,
  action,
  children,
}: {
  icon: LucideIcon;
  title: string;
  titleTip?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="px-4 py-3 sm:px-5">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-zinc-500 dark:text-zinc-400">
        <div className="flex items-center gap-2">
          <Icon size={14} strokeWidth={2} aria-hidden />
          <h3 className="text-sm font-medium">{title}</h3>
          {titleTip}
        </div>
        {action}
      </div>
      <div>{children}</div>
    </section>
  );
}

export function ToggleGroup<T extends string | number>({
  value,
  onChange,
  options,
  groupId,
  ariaLabel,
  compact,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; disabled?: boolean }[];
  groupId: string;
  ariaLabel: string;
  compact?: boolean;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={`inline-flex flex-wrap items-center justify-end gap-0.5 rounded-lg border border-zinc-200 bg-zinc-100/60 px-0.5 py-[1.5px] dark:border-zinc-800 dark:bg-zinc-900/80 ${
        compact ? 'sm:py-[1.5px]' : ''
      }`}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            disabled={o.disabled}
            onClick={() => onChange(o.value)}
            className={`relative flex h-[30px] items-center rounded-md px-1.5 text-[13px] tabular-nums transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
              compact ? 'sm:h-[25px]' : 'sm:h-[25px]'
            } sm:px-2.5 sm:text-sm ${
              active
                ? 'font-medium text-zinc-900 dark:text-zinc-50'
                : 'text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200'
            }`}
          >
            {active && (
              <motion.span
                layoutId={groupId}
                className="absolute inset-0 rounded-md bg-white shadow-sm dark:bg-zinc-800"
                transition={{ type: 'spring', stiffness: 420, damping: 34 }}
              />
            )}
            <span className="relative">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  groupId,
  ariaLabel,
  className,
  compact,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; icon?: LucideIcon }[];
  groupId: string;
  ariaLabel: string;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={`inline-flex flex-row items-stretch gap-0.5 rounded-xl border border-zinc-200 bg-zinc-100/60 p-0.5 dark:border-zinc-800 dark:bg-zinc-900/80 ${className ?? ''}`}
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
            className={`relative flex items-center justify-center rounded-[10px] px-3 text-[13px] transition-colors sm:text-sm ${
              compact ? 'h-[30px] sm:h-[30px] sm:px-3.5' : 'h-10 sm:h-[34px] sm:px-4'
            } ${
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
            <span className="relative flex items-center gap-1.5 text-[15px]">
              {Icon && <Icon size={14} strokeWidth={2} aria-hidden className="max-sm:hidden" />}
              {o.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function ChipGroup<T extends string>({
  values,
  onToggle,
  options,
  ariaLabel,
}: {
  values: T[];
  onToggle: (v: T) => void;
  options: { value: T; label: string; disabled?: boolean }[];
  ariaLabel: string;
}) {
  return (
    <div role="group" aria-label={ariaLabel} className="flex flex-wrap items-center gap-2">
      {options.map((o) => {
        const active = values.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            disabled={o.disabled}
            onClick={() => onToggle(o.value)}
            className={`flex h-8 items-center rounded-full border px-3.5 text-[13px] transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
              active
                ? 'border-emerald-400 bg-emerald-50 font-medium text-emerald-600 dark:border-emerald-400/50 dark:bg-emerald-400/10 dark:text-emerald-300'
                : 'border-zinc-200 bg-white text-zinc-500 hover:border-zinc-300 hover:text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-400 dark:hover:text-zinc-200'
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'emerald' | 'amber';
}) {
  const cls = {
    neutral: 'border-zinc-200 text-zinc-500 dark:border-zinc-700 dark:text-zinc-400',
    emerald: 'border-emerald-200 text-emerald-600 dark:border-emerald-800 dark:text-emerald-400',
    amber: 'border-amber-200 text-amber-600 dark:border-amber-800 dark:text-amber-400',
  }[tone];
  return (
    <span className={`shrink-0 rounded-full border px-1.5 py-px text-[13px] leading-4 ${cls}`}>
      {children}
    </span>
  );
}

export function SummaryRow({
  label,
  tip,
  value,
  tone = 'base',
  badge,
  divider,
  emphasis,
}: {
  label: string;
  tip?: string;
  value: string;
  tone?: 'base' | 'minus' | 'plus' | 'strong' | 'muted';
  badge?: ReactNode;
  divider?: boolean;
  emphasis?: boolean;
}) {
  const toneCls = {
    base: 'text-zinc-700 dark:text-zinc-300',
    minus: 'text-emerald-600 dark:text-emerald-400',
    plus: 'text-zinc-500 dark:text-zinc-400',
    strong: 'font-medium text-zinc-900 dark:text-zinc-50',
    muted: 'text-zinc-500 dark:text-zinc-500',
  }[tone];
  return (
    <div
      className={`flex items-baseline justify-between gap-4 ${
        emphasis ? 'text-[15px]' : 'text-[14px]'
      } ${
        divider ? 'mt-1.5 border-t border-dashed border-zinc-200 pt-2 dark:border-zinc-700/60' : ''
      }`}
    >
      <span className="flex min-w-0 items-center gap-1.5 text-zinc-500 dark:text-zinc-400">
        <span className="truncate">{label}</span>
        {tip && <Tip text={tip} />}
        {badge}
      </span>
      <span className={`shrink-0 tabular-nums ${toneCls}`}>{value}</span>
    </div>
  );
}

export function SummaryGroup({
  icon: Icon,
  title,
  meta,
  children,
  className = '',
  headerClassName = 'px-4',
}: {
  icon: LucideIcon;
  title: string;
  meta?: ReactNode;
  children: ReactNode;
  className?: string;
  headerClassName?: string;
}) {
  return (
    <div className={`py-3 px-4 ${className}`}>
      <div className={`flex items-center justify-between gap-3 ${headerClassName}`}>
        <div className="flex min-w-0 items-center gap-1.5 text-[14px] font-semibold tracking-[0.02em] text-zinc-700 dark:text-zinc-200">
          <Icon
            size={20}
            strokeWidth={1.75}
            aria-hidden
            className="shrink-0 text-zinc-400 dark:text-zinc-500"
          />
          <span className="truncate">{title}</span>
        </div>
        {meta && (
          <span className="min-w-0 truncate text-right text-[13px] text-zinc-500 dark:text-zinc-400">
            {meta}
          </span>
        )}
      </div>
      <div className="mt-1.5 space-y-1">{children}</div>
    </div>
  );
}

export function AnimatedAmount({ value, size = 'md' }: { value: number; size?: 'md' | 'lg' }) {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduce(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);
  const mv = useSpring(value, { stiffness: 150, damping: 24 });
  useEffect(() => {
    mv.set(value);
  }, [value, mv]);
  const fmt = (v: number) =>
    (v < 0 ? '-' : '') +
    Math.abs(v).toLocaleString('zh-CN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  const text = useTransform(mv, fmt);
  const numCls =
    size === 'lg' ? 'text-[25px] font-semibold leading-none tracking-tight' : 'text-[20px]';
  const symCls =
    size === 'lg' ? 'text-[15px] font-medium opacity-60' : 'text-[13px] font-medium opacity-60';
  return (
    <span className="inline-flex items-baseline gap-1 tabular-nums">
      <span className={symCls}>¥</span>
      {reduce ? (
        <span className={numCls}>{fmt(value)}</span>
      ) : (
        <motion.span className={numCls}>{text}</motion.span>
      )}
    </span>
  );
}

export function CompositionBar({
  parts,
  note,
}: {
  parts: { label: string; value: number; cls: string }[];
  note?: string;
}) {
  const shown = parts.filter((p) => p.value > 0.005);
  const sum = shown.reduce((a, p) => a + p.value, 0);
  if (sum <= 0) return null;
  return (
    <div className="mt-3">
      <div className="flex h-2 w-full gap-px overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
        {shown.map((p) => (
          <div
            key={p.label}
            className={`${p.cls} transition-[width] duration-300 ease-out`}
            style={{ width: `${(p.value / sum) * 100}%`, minWidth: 3 }}
            title={`${p.label} ${fmtCNY(p.value)}`}
          />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3.5 gap-y-1 px-1">
        {shown.map((p) => (
          <span
            key={p.label}
            className="flex items-center gap-1.5 text-[13px] text-zinc-500 dark:text-zinc-400"
          >
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${p.cls}`} aria-hidden />
            {p.label}
            <span className="tabular-nums text-zinc-600 dark:text-zinc-300">{fmtCNY(p.value)}</span>
          </span>
        ))}
      </div>
      {note && (
        <div className="mt-1 text-[13px] leading-relaxed text-zinc-500 dark:text-zinc-400">
          {note}
        </div>
      )}
    </div>
  );
}
