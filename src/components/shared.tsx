import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { motion, useSpring, useTransform } from 'framer-motion';
import { Info } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export const num = (s: string): number => {
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : 0;
};

export const clamp = (n: number, min: number, max: number): number => Math.min(max, Math.max(min, n));

export const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

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
    const next = groups.slice(0, i).find((v) => v > 0);
    if (next !== undefined && next < 1000) out += '零';
  }
  return out;
}

export function toCNUpper(amount: number): string {
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

export const sanitizeMoney = (v: string): string => {
  let t = v.replace(/[^0-9.]/g, '');
  const i = t.indexOf('.');
  if (i >= 0) t = t.slice(0, i + 1) + t.slice(i + 1).replace(/\./g, '').slice(0, 2);
  return t;
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
        {controls && (
          <span className="flex min-w-0 items-center sm:-ml-1">{controls}</span>
        )}
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

export function Tip({ text }: { text: string }) {
  const [pos, setPos] = useState<{ h: 'left' | 'right' | 'center'; v: 'above' | 'below' }>({
    h: 'center',
    v: 'above',
  });
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);

  const place = useCallback(() => {
    const el = anchorRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const W = 264;
    const H = 150;
    const spaceRight = window.innerWidth - r.left;
    const spaceLeft = r.right;
    const h = spaceRight >= W + 16 ? 'left' : spaceLeft >= W + 16 ? 'right' : 'center';
    // 顶部空间不足且下方更充裕时翻到下方，避免在视口上缘被裁切
    const v = r.top < H && window.innerHeight - r.bottom > r.top ? 'below' : 'above';
    setPos({ h: h as typeof pos.h, v: v as typeof pos.v });
  }, []);

  const hCls =
    pos.h === 'left'
      ? 'left-0 after:left-3'
      : pos.h === 'right'
        ? 'right-0 after:right-3'
        : 'left-1/2 -translate-x-1/2 after:left-1/2 after:-ml-1';
  const vCls =
    pos.v === 'above'
      ? 'bottom-full mb-2 after:top-full after:-mt-1'
      : 'top-full mt-2 after:bottom-full after:-mb-1';

  return (
    <button
      type="button"
      ref={anchorRef}
      aria-label={`说明：${text}`}
      aria-expanded={open}
      onClick={() => {
        place();
        setOpen((o) => !o);
      }}
      onMouseEnter={place}
      onFocus={place}
      onBlur={() => setOpen(false)}
      onKeyDown={(e) => {
        if (e.key === 'Escape') setOpen(false);
      }}
      className="group/tip relative inline-flex shrink-0 cursor-help appearance-none border-0 bg-transparent p-2 -m-2 leading-none"
    >
      <Info
        size={13}
        strokeWidth={2}
        aria-hidden
        className="text-zinc-300 transition-colors group-hover/tip:text-zinc-500 group-focus/tip:text-zinc-500 dark:text-zinc-600 dark:group-hover/tip:text-zinc-400 dark:group-focus/tip:text-zinc-400"
      />
      <span
        aria-hidden
        className={`pointer-events-none absolute z-50 w-64 max-w-[calc(100vw-1.5rem)] rounded-xl bg-zinc-900 px-3 py-2 text-left text-sm font-normal leading-relaxed text-zinc-100 opacity-0 shadow-xl shadow-zinc-900/10 transition-opacity duration-150 group-hover/tip:opacity-100 group-focus/tip:opacity-100 dark:bg-zinc-100 dark:text-zinc-900 dark:after:bg-zinc-100 after:absolute after:h-2 after:w-2 after:rotate-45 after:bg-zinc-900 ${vCls} ${hCls} ${
          open ? 'opacity-100' : ''
        }`}
      >
        {text}
      </span>
    </button>
  );
}

export function FormSection({
  icon: Icon,
  title,
  action,
  children,
}: {
  icon: LucideIcon;
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="px-4 py-3 sm:px-5">
      <div className="mb-1 flex items-center justify-between gap-2 text-zinc-500 dark:text-zinc-400">
        <div className="flex items-center gap-2">
          <Icon size={14} strokeWidth={2} aria-hidden />
          <h3 className="text-sm font-medium">{title}</h3>
        </div>
        {action}
      </div>
      <div className="divide-y divide-zinc-100 dark:divide-zinc-800/70">{children}</div>
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
      className={`inline-flex flex-wrap items-center justify-end gap-0.5 rounded-lg border border-zinc-200 bg-zinc-100/60 p-0.5 dark:border-zinc-800 dark:bg-zinc-900/80 ${
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
            className={`relative flex h-9 items-center rounded-md px-1.5 text-[13px] tabular-nums transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
              compact ? 'sm:h-[25px]' : 'sm:h-7'
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
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; icon?: LucideIcon }[];
  groupId: string;
  ariaLabel: string;
  className?: string;
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
            className={`relative flex h-10 items-center justify-center rounded-[10px] px-3 text-[13px] transition-colors sm:h-[34px] sm:px-4 sm:text-sm ${
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
              {Icon && <Icon size={14} strokeWidth={2} aria-hidden className="max-sm:hidden" />}
              {o.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function SummaryRow({
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

export function SummaryGroup({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="py-2">
      <div className="flex items-center gap-1.5 text-[13px] font-medium text-zinc-400 dark:text-zinc-500">
        <Icon size={13} strokeWidth={2} aria-hidden />
        {title}
      </div>
      <div className="mt-1 space-y-1">{children}</div>
    </div>
  );
}

export function AnimatedAmount({ value }: { value: number }) {
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
      <span className="text-[13px] font-medium opacity-60">¥</span>{' '}
      <motion.span className="text-[20px]">{text}</motion.span>
    </span>
  );
}

export function CompositionBar({ parts }: { parts: { label: string; value: number; cls: string }[] }) {
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
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 px-2.5">
        {shown.map((p) => (
          <span
            key={p.label}
            className="flex items-center gap-1.5 text-[13px] text-zinc-500 dark:text-zinc-400"
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
