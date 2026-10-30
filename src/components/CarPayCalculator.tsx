import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  BadgePercent,
  Banknote,
  Car,
  Check,
  ChevronUp,
  Copy,
  CreditCard,
  Download,
  Fuel,
  Github,
  Image as ImageIcon,
  Landmark,
  Moon,
  ReceiptText,
  RotateCcw,
  Share2,
  ShieldCheck,
  Sun,
  Wallet,
  Zap,
} from 'lucide-react';
import OwnCostPanel from './OwnCostPanel';
import SellPanel from './SellPanel';
import {
  buildDetailText,
  computeBuy,
  DEFAULT_FORM,
  EARLY_MONTH_OPTIONS,
  FORM_KEY,
  FREE_MONTH_OPTIONS,
  loadBuyForm,
  MONTH_OPTIONS,
  type BuyForm,
  type TaxRateMode,
  type VehicleType,
  policySubsidy,
  firstBuyRate,
  firstBuyAmount,
} from './buyModel';
import {
  computeOwn,
  DEFAULT_OWN_FORM,
  loadOwnForm,
  OWN_FORM_KEY,
  OWN_SOURCES,
  type OwnForm,
} from './ownCostModel';
import {
  computeSell,
  DEFAULT_SELL_FORM,
  loadSellForm,
  SELL_FORM_KEY,
  SELL_SOURCES,
  type SellForm,
} from './sellModel';
import { renderPosterPng } from './sharePoster';
import {
  AnimatedAmount,
  clamp,
  CompositionBar,
  copyText,
  dataUrlToPngFile,
  deductCNY,
  fmtCNY,
  FormSection,
  LabelInput,
  num,
  sanitizeMoney,
  Segmented,
  SummaryGroup,
  SummaryRow,
  Tip,
  ToggleGroup,
  toCNUpper,
} from './shared';

// 部署前替换为实际仓库地址
const GITHUB_URL = 'https://github.com/colflip/carpay';
const THEME_KEY = 'carpay:theme';

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
  | 'insuranceSubsidy'
  | 'purchaseTaxManual'
  | 'vehicleVesselTax'
  | 'compulsoryInsurance'
  | 'commercialInsurance'
  | 'plateFee'
  | 'serviceFee'
  | 'loanAmount'
  | 'earlyRepayFee';

function LogoMark({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <rect width="64" height="64" rx="15" className="fill-zinc-900 dark:fill-zinc-100" />
      <text
        x="32"
        y="42"
        textAnchor="middle"
        fontSize="33"
        fontWeight="700"
        fontFamily="system-ui, -apple-system, 'PingFang SC', sans-serif"
        className="fill-white dark:fill-zinc-900"
      >
        ¥
      </text>
      <rect x="17" y="47" width="30" height="4.5" rx="2.25" className="fill-emerald-500" />
    </svg>
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

const POLICY_SOURCES: { label: string; url: string }[] = [
  { label: '车辆购置税法', url: 'https://fgk.chinatax.gov.cn/zcfgk/c100009/c5193038/content.html' },
  { label: '新能源购置税减免公告', url: 'https://fgk.chinatax.gov.cn/zcfgk/c102416/c5207352/content.html' },
  { label: '车船税优惠政策', url: 'https://shanghai.chinatax.gov.cn/zcfw/zcjd/202607/t480874.html' },
  { label: '交强险条例', url: 'https://www.nfra.gov.cn/cbircweb/download/downloadPdf?docId=879939&zcfg=0&itemId=927' },
  { label: '2026 汽车以旧换新细则', url: 'https://www.mofcom.gov.cn/zwgk/zcfb/art/2025/art_2a65998b79af47eaaf2115ef1ce234f9.html' },
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
  const [form, setForm] = useState<BuyForm>(loadBuyForm);
  const [ownForm, setOwnForm] = useState<OwnForm>(() => loadOwnForm(form));
  const [sellForm, setSellForm] = useState<SellForm>(() => loadSellForm(ownForm));
  const [copied, setCopied] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);
  const [exportingImg, setExportingImg] = useState(false);
  const copyTimer = useRef<number | undefined>(undefined);
  const summaryRef = useRef<HTMLDivElement>(null);
  const ownSummaryRef = useRef<HTMLDivElement>(null);
  const sellSummaryRef = useRef<HTMLDivElement>(null);
  const [kbOpen, setKbOpen] = useState(false);

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

  useEffect(() => {
    try {
      localStorage.setItem(OWN_FORM_KEY, JSON.stringify(ownForm));
    } catch {
      /* 同上 */
    }
  }, [ownForm]);

  useEffect(() => {
    try {
      localStorage.setItem(SELL_FORM_KEY, JSON.stringify(sellForm));
    } catch {
      /* 同上 */
    }
  }, [sellForm]);

  useEffect(() => () => window.clearTimeout(copyTimer.current), []);

  // 软键盘弹出时隐藏移动端底部总价条，避免遮挡正在编辑的输入行
  useEffect(() => {
    const isField = (t: EventTarget | null): boolean =>
      t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA');
    const onFocusIn = (e: FocusEvent) => {
      if (isField(e.target)) setKbOpen(true);
    };
    const onFocusOut = (e: FocusEvent) => {
      if (isField(e.target)) setKbOpen(false);
    };
    window.addEventListener('focusin', onFocusIn);
    window.addEventListener('focusout', onFocusOut);
    return () => {
      window.removeEventListener('focusin', onFocusIn);
      window.removeEventListener('focusout', onFocusOut);
    };
  }, []);

  const calc = useMemo(() => computeBuy(form), [form]);

  // 政策模式下补贴额随含税车价与能源类型变化自动重算（写入表单，避免展示值与实际口径脱节）
  useEffect(() => {
    const upd: Partial<BuyForm> = {};
    if (form.tradeInMode === 'policy') {
      const a = String(policySubsidy('tradeIn', form.vehicleType, calc.taxBase).amount);
      if (form.tradeInSubsidy !== a) upd.tradeInSubsidy = a;
    }
    if (form.scrapMode === 'policy') {
      const a = String(policySubsidy('scrap', form.vehicleType, calc.taxBase).amount);
      if (form.scrapSubsidy !== a) upd.scrapSubsidy = a;
    }
    if (form.firstBuyMode === 'policy') {
      const a = String(firstBuyAmount(form.vehicleType, calc.taxBase));
      if (form.firstBuySubsidy !== a) upd.firstBuySubsidy = a;
    }
    // 贷款额度选「全额」时跟随计税基数，车价变化后贷款额同步
    if (form.paymentMode === 'mortgage' && form.loanAmountMode === 'full') {
      const a = String(calc.taxBase);
      if (form.loanAmount !== a) upd.loanAmount = a;
    }
    if (Object.keys(upd).length) patch(upd);
  }, [
    form.tradeInMode,
    form.scrapMode,
    form.firstBuyMode,
    form.vehicleType,
    calc.taxBase,
    form.tradeInSubsidy,
    form.scrapSubsidy,
    form.firstBuySubsidy,
    form.paymentMode,
    form.loanAmountMode,
    form.loanAmount,
    patch,
  ]);
  const ownCalc = useMemo(() => computeOwn(ownForm), [ownForm]);
  const sellCalc = useMemo(() => computeSell(sellForm, form, calc, ownForm), [sellForm, form, calc, ownForm]);

  const patchOwn = useCallback(
    (p: Partial<OwnForm>) => setOwnForm((f) => ({ ...f, ...p })),
    [],
  );
  const resetOwn = useCallback(() => setOwnForm(DEFAULT_OWN_FORM), []);

  const patchSell = useCallback(
    (p: Partial<SellForm>) => setSellForm((f) => ({ ...f, ...p })),
    [],
  );
  const resetSell = useCallback(() => setSellForm(DEFAULT_SELL_FORM), []);

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

  const renderSummaryPng = async (): Promise<string | null> =>
    renderPosterPng(summaryRef.current, { dark, title: '购车落地测算' });

  const handleShare = async () => {
    if (shareBusy) return;
    const text = buildDetailText(form, calc);
    const copyFallback = async () => {
      const ok = await copyText(text);
      if (ok) {
        setShareCopied(true);
        window.clearTimeout(copyTimer.current);
        copyTimer.current = window.setTimeout(() => setShareCopied(false), 2000);
      }
    };
    if (typeof navigator.share !== 'function') {
      await copyFallback();
      return;
    }
    const fileName = `CarPay-${exportBaseName()}-${new Date().toISOString().slice(0, 10)}.png`;
    setShareBusy(true);
    try {
      const probe = new File([new Uint8Array([137])], 'probe.png', { type: 'image/png' });
      if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [probe] })) {
        const dataUrl = await renderSummaryPng();
        if (dataUrl) {
          await navigator.share({ files: [dataUrlToPngFile(dataUrl, fileName)], title: 'CarPay 购车成本测算' });
          return;
        }
      }
      await navigator.share({ title: 'CarPay 购车成本测算', text, url: window.location.href });
      return;
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return; // 用户取消分享
      /* 生成或分享失败继续走降级 */
    } finally {
      setShareBusy(false);
    }
    await copyFallback();
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
    if (!summaryRef.current || exportingImg) return;
    setExportingImg(true);
    try {
      const dataUrl = await renderSummaryPng();
      if (!dataUrl) return;
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

  const loanLabel = form.paymentMode === 'finance' ? '首付分期' : '额度贷款';

  const taxManualBadge =
    form.purchaseTaxManual !== null ? (
      <span className="rounded-full border border-zinc-200 px-1.5 py-px text-[13px] leading-4 text-zinc-400 dark:border-zinc-700 dark:text-zinc-500">
        手动
      </span>
    ) : null;
  const taxRateChips = (
    <ToggleGroup
      groupId="carpay-taxmode"
      ariaLabel="购置税档位"
      value={form.taxRateMode}
      onChange={(taxRateMode) => patch({ taxRateMode, purchaseTaxManual: null })}
      options={TAX_MODES.map((m) => ({ value: m.value, label: m.label }))}
    />
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
        <header className="relative flex items-center justify-between gap-4 border-b border-zinc-200 px-0 pb-3 pt-4 dark:border-zinc-800 sm:px-8">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-5 gap-y-1 sm:flex-nowrap sm:gap-7">
            <div className="flex shrink-0 items-center gap-2.5">
              <LogoMark size={36} />
              <div className="flex min-w-0 items-baseline gap-2">
                <span className="text-base font-semibold leading-none tracking-tight">CarPay</span>
                <span className="hidden truncate text-xs text-zinc-500 md:block dark:text-zinc-400">
                  用车全周期成本计算
                </span>
              </div>
            </div>
            <nav
              className="no-scrollbar order-last w-full min-w-0 overflow-x-auto max-sm:-mx-4 max-sm:px-4 sm:order-none sm:w-auto"
              aria-label="功能模块"
            >
              <div className="flex min-w-max gap-3.5 sm:gap-6">
                {TABS.map((t) => {
                  const active = t.key === tab;
                  return (
                    <button
                      key={t.key}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setTab(t.key)}
                      className={`relative flex items-center gap-1.5 py-2 text-[15px] transition-colors sm:py-1.5 sm:text-base ${
                        active
                          ? 'font-medium text-zinc-900 dark:text-zinc-50'
                          : 'text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200'
                      }`}
                    >
                      {t.label}
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
          </div>
          <div className="flex shrink-0 items-center gap-2 max-sm:absolute max-sm:right-0 max-sm:top-4">
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noreferrer"
              aria-label="GitHub 仓库"
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-200 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100 sm:h-9 sm:w-9"
            >
              <Github size={16} strokeWidth={2} aria-hidden />
            </a>
            <button
              type="button"
              aria-label={dark ? '切换到浅色模式' : '切换到深色模式'}
              onClick={() => setDark((d) => !d)}
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-200 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100 sm:h-9 sm:w-9"
            >
              {dark ? <Sun size={16} strokeWidth={2} aria-hidden /> : <Moon size={16} strokeWidth={2} aria-hidden />}
            </button>
          </div>
        </header>

        <main className="mt-3 lg:mt-4">
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
                <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 lg:grid-cols-[minmax(0,1fr)_400px] xl:grid-cols-[minmax(0,1fr)_420px]">
                  <form className="rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                    <div className="divide-y divide-zinc-100 dark:divide-zinc-800/70">
                      <FormSection
                        icon={Car}
                        title="车辆信息"
                        action={
                          <button
                            type="button"
                            onClick={() => setForm(DEFAULT_FORM)}
                            className="flex h-9 items-center gap-1 rounded-lg px-2 text-[13px] font-medium text-red-600 transition-colors hover:bg-red-50 hover:text-red-700 sm:h-7 sm:px-2 dark:text-red-400 dark:hover:bg-red-500/10 dark:hover:text-red-300"
                          >
                            <RotateCcw size={13} strokeWidth={2} aria-hidden />
                            重置
                          </button>
                        }
                      >
                        <div className="py-1.5">
                          <LabelInput
                            id="modelName"
                            label="车辆型号名称"
                            tip="仅作备注，在汇总卡片与导出明细中回显，不参与金额计算。"
                            prefix={null}
                            maxLength={30}
                            value={form.modelName}
                            placeholder="如：比亚迪汉 EV"
                            bigValue
                            onChange={(v) => patch({ modelName: v })}
                          />
                        </div>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 py-1.5">
                          <div className="flex shrink-0 items-center gap-1.5">
                            <span className="text-sm text-zinc-700 dark:text-zinc-300">车辆类型</span>
                            <Tip text="决定购置税与车船税的默认档位：燃油车全额 10%、车船税 420 元；新能源车默认免征、车船税 0 元。2026–2027 年新能源减半征收，购置税处可切换档位。" />
                          </div>
                          <Segmented
                            className="ml-auto"
                            groupId="carpay-vehicle"
                            ariaLabel="车辆类型"
                            value={form.vehicleType}
                            onChange={setVehicleType}
                            options={[
                              { value: 'fuel', label: '燃油', icon: Fuel },
                              { value: 'nev', label: '新能源', icon: Zap },
                            ]}
                          />
                        </div>
                      </FormSection>

                      <FormSection icon={Banknote} title="车价构成">
                        <div className="py-1.5">
                          <LabelInput
                            id="msrp"
                            label="厂商指导裸车原价"
                            tip="官方指导价中的裸车部分，不含选装、税费与保险。"
                            value={form.msrp}
                            onChange={(v) => setMoney('msrp', v)}
                          />
                        </div>
                        <div className="py-1.5">
                          <LabelInput
                            id="optionsFee"
                            label="选装包"
                            tip="选装配置合计，计入开票价，随车价一并计税。"
                            value={form.optionsFee}
                            onChange={(v) => setMoney('optionsFee', v)}
                          />
                        </div>
                        <div className="py-1.5">
                          <LabelInput
                            id="officialDiscount"
                            label="官方优惠"
                            tip="厂家直降、官方限时优惠，冲减开票价与计税基数。"
                            value={form.officialDiscount}
                            onChange={(v) => setMoney('officialDiscount', v)}
                          />
                        </div>
                        <div className="py-1.5">
                          <LabelInput
                            id="dealerDiscount"
                            label="门店优惠"
                            tip="经销商让利与谈定的现金优惠，冲减开票价与计税基数。"
                            value={form.dealerDiscount}
                            onChange={(v) => setMoney('dealerDiscount', v)}
                          />
                        </div>
                        <div className="py-1.5">
                          <LabelInput
                            id="loanRebate"
                            label="金融返点"
                            tip="贷款渠道返还的佣金，冲减开票价与计税基数，并同额减少首付与贷款本金；全款购车不适用。"
                            muted={!calc.isLoan}
                            disabled={!calc.isLoan}
                            value={form.loanRebate}
                            onChange={(v) => setMoney('loanRebate', v)}
                          />
                        </div>
                        <div className="flex items-center justify-between rounded-xl bg-zinc-100/80 px-3 py-2 dark:bg-zinc-800/50">
                          <span className="flex items-center gap-1.5 text-[13px] text-zinc-500 dark:text-zinc-400">
                            计税基数（开票价）
                            <Tip text="裸车原价 + 选装包 − 官方优惠 − 门店优惠 − 金融返点，是购置税、首付与月供的计算基数；低于税务系统最低计税价时按最低计税价核定，低开发票存在补税风险。" />
                          </span>
                          <span className="text-[15px] font-medium tabular-nums text-zinc-900 dark:text-zinc-50">
                            {fmtCNY(calc.taxBase)}
                          </span>
                        </div>
                      </FormSection>

                      <FormSection icon={ReceiptText} title="税费与保险">
                        <div className="py-1.5">
                          <LabelInput
                            id="purchaseTax"
                            label="购置税"
                            tip="档位税率：全额 10%、减半 5%、免征 0；购置税 = 计税基数 ÷ 1.13 × 税率，减半档已含新能源 2026–2027 年每辆 1.5 万元减税上限，换电车型按不含电池价格计税；可手动改写，改写后框内按钮可恢复自动计算。"
                            badge={taxManualBadge}
                            controls={taxRateChips}
                            after={
                              form.purchaseTaxManual !== null ? (
                                <button
                                  type="button"
                                  aria-label="恢复自动计算购置税"
                                  title="恢复自动计算"
                                  onClick={() => patch({ purchaseTaxManual: null })}
                                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-emerald-600 dark:hover:bg-zinc-800 dark:hover:text-emerald-400 sm:h-7 sm:w-7"
                                >
                                  <RotateCcw size={13} strokeWidth={2} aria-hidden />
                                </button>
                              ) : undefined
                            }
                            value={form.purchaseTaxManual ?? String(calc.taxAuto)}
                            onChange={(v) => setMoney('purchaseTaxManual', v)}
                          />
                        </div>
                        <div className="py-1.5">
                          <LabelInput
                            id="vehicleVesselTax"
                            label="车船税"
                            tip="随交强险由保险公司代收，按排量分档、各省标准不同（年税额）：1.0L 以下 60–360 元，1.0–1.6L 300–540 元，1.6–2.0L 约 420 元，2.0–2.5L 约 720 元，2.5–3.0L 约 1800 元；纯电动乘用车免征，插电混动按排量计征。"
                            value={form.vehicleVesselTax}
                            controls={
                              <ToggleGroup
                                groupId="carpay-vesseltax"
                                ariaLabel="车船税快捷选项"
                                value={num(form.vehicleVesselTax) === 0 ? 'exempt' : form.vehicleVesselTax}
                                onChange={() => setMoney('vehicleVesselTax', '0')}
                                options={[{ value: 'exempt', label: '免征' }]}
                              />
                            }
                            onChange={(v) => setMoney('vehicleVesselTax', v)}
                          />
                        </div>
                        <div className="py-1.5">
                          <LabelInput
                            id="compulsoryInsurance"
                            label="交强险"
                            tip="家用 6 座以下首年 950 元，6 座及以上 1100 元；仅计首年，以实际保单为准。"
                            value={form.compulsoryInsurance}
                            onChange={(v) => setMoney('compulsoryInsurance', v)}
                          />
                        </div>
                        <div className="py-1.5">
                          <LabelInput
                            id="commercialInsurance"
                            label="商业险"
                            tip="车损险、第三者责任险等首年保费，仅计首年，以保险公司报价为准。"
                            value={form.commercialInsurance}
                            onChange={(v) => setMoney('commercialInsurance', v)}
                          />
                        </div>
                      </FormSection>

                      <FormSection icon={Wallet} title="其他杂费">
                        <div className="py-1.5">
                          <LabelInput
                            id="plateFee"
                            label="上牌费"
                            tip="车管所工本费约 125 元（号牌 100、行驶证 10、登记证书 10、临牌 5），自办另加拓印拍照 50–100 元；4S 代办通常 500–2000 元；沪牌等指标竞价成本另计。"
                            value={form.plateFee}
                            onChange={(v) => setMoney('plateFee', v)}
                          />
                        </div>
                        <div className="py-1.5">
                          <LabelInput
                            id="serviceFee"
                            label="服务费"
                            tip="经销商收取的出库费、PDI 检测费、金融手续费、GPS 费（800–2000 元，多可协商免除）与抵押登记费等；续保押金可退，不计入成本。"
                            value={form.serviceFee}
                            onChange={(v) => setMoney('serviceFee', v)}
                          />
                        </div>
                      </FormSection>

                      <FormSection
                        icon={BadgePercent}
                        title="补贴抵扣（不计税）"
                        action={
                          <span className="text-[12px] text-zinc-400 dark:text-zinc-500">
                            报废、置换每年限享其一
                          </span>
                        }
                      >
                        <div className="py-1.5">
                          <LabelInput
                            id="tradeInSubsidy"
                            label="置换补贴"
                            tip="旧车置换作价，直接抵扣落地总价，不计税；右侧比例按 2026 年以旧换新政策、以开票价（价税合计）为基数计算：新能源 8%、燃油 6%，分别封顶 1.5 万元与 1.3 万元。"
                            value={form.tradeInSubsidy}
                            controls={
                              <ToggleGroup
                                groupId="carpay-tradein"
                                ariaLabel="置换补贴快捷选项"
                                value={form.tradeInMode === 'policy' ? 'policy' : form.tradeInSubsidy}
                                onChange={(m) =>
                                  m === 'policy'
                                    ? patch({
                                        tradeInMode: 'policy',
                                        tradeInSubsidy: String(
                                          policySubsidy('tradeIn', form.vehicleType, calc.taxBase).amount,
                                        ),
                                      })
                                    : patch({
                                        tradeInMode: 'manual',
                                        tradeInSubsidy: m === form.tradeInSubsidy ? form.tradeInSubsidy : m,
                                      })
                                }
                                options={[
                                  { value: 'policy', label: `${form.vehicleType === 'nev' ? 8 : 6}%` },
                                ]}
                              />
                            }
                            onChange={(v) => patch({ tradeInMode: 'manual', tradeInSubsidy: sanitizeMoney(v) })}
                          />
                        </div>
                        <div className="py-1.5">
                          <LabelInput
                            id="scrapSubsidy"
                            label="报废补贴"
                            tip="旧车报废更新补贴，直接抵扣落地总价，不计税；右侧比例按 2026 年国家统一标准、以开票价（价税合计）为基数计算：新能源 12% 封顶 2 万元，燃油 10% 封顶 1.5 万元。"
                            value={form.scrapSubsidy}
                            controls={
                              <ToggleGroup
                                groupId="carpay-scrap"
                                ariaLabel="报废补贴快捷选项"
                                value={form.scrapMode === 'policy' ? 'policy' : form.scrapSubsidy}
                                onChange={(m) =>
                                  m === 'policy'
                                    ? patch({
                                        scrapMode: 'policy',
                                        scrapSubsidy: String(
                                          policySubsidy('scrap', form.vehicleType, calc.taxBase).amount,
                                        ),
                                      })
                                    : patch({
                                        scrapMode: 'manual',
                                        scrapSubsidy: m === form.scrapSubsidy ? form.scrapSubsidy : m,
                                      })
                                }
                                options={[
                                  { value: 'policy', label: `${form.vehicleType === 'nev' ? 12 : 10}%` },
                                ]}
                              />
                            }
                            onChange={(v) => patch({ scrapMode: 'manual', scrapSubsidy: sanitizeMoney(v) })}
                          />
                        </div>
                        <div className="py-1.5">
                          <LabelInput
                            id="firstBuySubsidy"
                            label="首购补贴"
                            tip="名下无车首购的购新补贴，直接抵扣落地总价，不计税；无全国统一标准，右侧比例按开票价（价税合计）计算，取地方常见水平：新能源 3% 封顶 7000 元，燃油 2% 封顶 6000 元，以当地政策为准。"
                            value={form.firstBuySubsidy}
                            controls={
                              <ToggleGroup
                                groupId="carpay-firstbuy"
                                ariaLabel="首购补贴快捷选项"
                                value={form.firstBuyMode === 'policy' ? 'policy' : form.firstBuySubsidy}
                                onChange={() =>
                                  patch({
                                    firstBuyMode: 'policy',
                                    firstBuySubsidy: String(firstBuyAmount(form.vehicleType, calc.taxBase)),
                                  })
                                }
                                options={[{ value: 'policy', label: `${firstBuyRate(form.vehicleType)}%` }]}
                              />
                            }
                            onChange={(v) =>
                              patch({ firstBuyMode: 'manual', firstBuySubsidy: sanitizeMoney(v) })
                            }
                          />
                        </div>
                        <div className="py-1.5">
                          <LabelInput
                            id="insuranceSubsidy"
                            label="保险补贴"
                            tip="厂家或经销商赠送首年保险、返还保费等，直接抵扣落地总价，不计税；保险栏仍按保单原价填写，4S 店赠险多在 2000–8000 元。"
                            value={form.insuranceSubsidy}
                            controls={
                              <ToggleGroup
                                groupId="carpay-ins"
                                ariaLabel="保险补贴快捷选项"
                                value={form.insuranceSubsidy}
                                onChange={(m) => setMoney('insuranceSubsidy', m === form.insuranceSubsidy ? form.insuranceSubsidy : m)}
                                options={[
                                  { value: '950', label: '¥950' },
                                  { value: '2000', label: '¥2000' },
                                  { value: '4000', label: '¥4000' },
                                ]}
                              />
                            }
                            onChange={(v) => setMoney('insuranceSubsidy', v)}
                          />
                        </div>
                      </FormSection>

                      <FormSection icon={CreditCard} title="付款方式">
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 py-1.5">
                          <div className="flex shrink-0 items-center gap-1.5">
                            <span className="text-sm text-zinc-700 dark:text-zinc-300">付款方式</span>
                            <Tip text="全款一次付清车价；首付分期按首付比例贷款，多为厂家金融贴息方案；额度贷款直接输入固定贷款额，期限更长。两种贷款均按等额本息测算月供，金融返点在车价构成中填写。" />
                          </div>
                          <Segmented
                            className="ml-auto"
                            groupId="carpay-payment"
                            ariaLabel="付款方式"
                            value={form.paymentMode}
                            onChange={(paymentMode) => patch({ paymentMode })}
                            options={[
                              { value: 'full', label: '全款', icon: Banknote },
                              { value: 'finance', label: '首付分期', icon: CreditCard },
                              { value: 'mortgage', label: '额度贷款', icon: Landmark },
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
                                <div className="py-1.5">
                                  <LabelInput
                                    id="downPct"
                                    label="首付比例"
                                    tip="首付占计税基数的比例，其余部分为贷款本金。"
                                    prefix={null}
                                    suffix="%"
                                    value={form.downPaymentPct}
                                    controls={
                                      <ToggleGroup
                                        groupId="carpay-downpct"
                                        ariaLabel="首付比例快捷选项"
                                        value={form.downPaymentPct}
                                        onChange={(m) => patch({ downPaymentPct: m })}
                                        options={[
                                          { value: '0', label: '0%' },
                                          { value: '5', label: '5%' },
                                          { value: '20', label: '20%' },
                                          { value: '30', label: '30%' },
                                          { value: '40', label: '40%' },
                                          { value: '50', label: '50%' },
                                        ]}
                                      />
                                    }
                                    onChange={(v) => patch({ downPaymentPct: sanitizeMoney(v) })}
                                    onBlur={() =>
                                      patch({
                                        downPaymentPct: String(
                                          clamp(Math.round(num(form.downPaymentPct) * 10) / 10, 0, 100),
                                        ),
                                      })
                                    }
                                  />
                                  <input
                                    type="range"
                                    min={0}
                                    max={100}
                                    step={1}
                                    aria-label="首付比例滑块"
                                    value={String(calc.pct)}
                                    onChange={(e) => patch({ downPaymentPct: e.target.value })}
                                    className="mt-1 h-7 w-full accent-emerald-600"
                                  />
                                </div>
                              )}
                              {form.paymentMode === 'mortgage' && (
                                <div className="py-1.5">
                                  <LabelInput
                                    id="loanAmount"
                                    label="贷款额度"
                                    tip="固定贷款本金，不超过计税基数；首付 = 计税基数 − 贷款额。「全额」按计税基数贷满，首付为 0。"
                                    value={form.loanAmount}
                                    controls={
                                      <ToggleGroup
                                        groupId="carpay-loanamt"
                                        ariaLabel="贷款额度快捷选项"
                                        value={form.loanAmountMode === 'full' ? 'full' : form.loanAmount}
                                        onChange={(m) =>
                                          m === 'full'
                                            ? patch({
                                                loanAmountMode: 'full',
                                                loanAmount: String(calc.taxBase),
                                              })
                                            : patch({ loanAmountMode: 'manual', loanAmount: m })
                                        }
                                        options={[
                                          { value: '50000', label: '5万' },
                                          { value: '80000', label: '8万' },
                                          { value: '100000', label: '10万' },
                                          { value: '150000', label: '15万' },
                                          { value: 'full', label: '全额' },
                                        ]}
                                      />
                                    }
                                    onChange={(v) =>
                                      patch({ loanAmountMode: 'manual', loanAmount: sanitizeMoney(v) })
                                    }
                                  />
                                </div>
                              )}

                              <div className="py-1.5">
                                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-zinc-100/80 px-3 py-1 text-[13px] tabular-nums text-zinc-500 dark:bg-zinc-800/50 dark:text-zinc-400">
                                  <span>首付 {fmtCNY(calc.down)}</span>
                                  <span>贷款本金 {fmtCNY(calc.principal)}</span>
                                  <span>月供 {fmtCNY(calc.monthly)}</span>
                                  <span>利息 {fmtCNY(calc.interest)}</span>
                                  {calc.freeMonths > 0 && <span>前 {calc.freeMonths} 期免息</span>}
                                  {calc.earlyRepay && (
                                    <span>
                                      第 {calc.earlySettleMonth} 期后结清 {fmtCNY(calc.settleAmount)}
                                    </span>
                                  )}
                                </div>
                              </div>

                              <div className="py-1.5">
                                <LabelInput
                                  id="annualRatePct"
                                  label="年利率"
                                  tip="贷款年化利率（单利）；0 表示全额贴息，月供为本金均摊。"
                                  prefix={null}
                                  suffix="%"
                                  value={form.annualRatePct}
                                  onChange={(v) => patch({ annualRatePct: sanitizeMoney(v) })}
                                  onBlur={() =>
                                    patch({ annualRatePct: String(Math.max(0, num(form.annualRatePct))) })
                                  }
                                />
                              </div>

                              <div className="flex flex-wrap items-center justify-between gap-4 py-1.5">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-sm text-zinc-700 dark:text-zinc-300">期数</span>
                                  <Tip text="贷款总期数（月），月供按等额本息计算：本金 × 月利率 × (1 + 月利率)^期数 ÷ ((1 + 月利率)^期数 − 1)。" />
                                </div>
                                <ToggleGroup
                                  groupId="carpay-months"
                                  ariaLabel="贷款期数选项"
                                  value={form.months}
                                  onChange={(m) =>
                                    patch({
                                      months: m,
                                      ...(form.earlyRepayMonth >= m ? { earlyRepayMonth: 0 } : {}),
                                    })
                                  }
                                  options={MONTH_OPTIONS.map((m) => ({ value: m, label: `${m}期` }))}
                                />
                              </div>

                              <div className="flex flex-wrap items-center justify-between gap-4 py-1.5">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-sm text-zinc-700 dark:text-zinc-300">免息期数</span>
                                  <Tip text="前 N 期不计息的贴息方案：月供全程等额，前 N 期只还本金，其余期数按年利率计息；如「5 年 2 年免息」为期数 60、免息 24，免息期数超过总期数时按全期免息计。" />
                                </div>
                                <ToggleGroup
                                  groupId="carpay-free"
                                  ariaLabel="免息期数选项"
                                  value={form.freeMonths}
                                  onChange={(freeMonths) => patch({ freeMonths })}
                                  options={FREE_MONTH_OPTIONS.map((m) => ({
                                    value: m,
                                    label: m === 0 ? '不免息' : `${m}期`,
                                  }))}
                                />
                              </div>

                              <div className="flex flex-wrap items-center justify-between gap-4 py-1.5">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-sm text-zinc-700 dark:text-zinc-300">提前还款</span>
                                  <Tip text="第 N 期期末一次性结清剩余本金并支付手续费，贷款终止；结清前利息按免息期数口径计算，所选期数须小于总期数。" />
                                </div>
                                <ToggleGroup
                                  groupId="carpay-early"
                                  ariaLabel="提前还款时点选项"
                                  value={form.earlyRepayMonth}
                                  onChange={(earlyRepayMonth) => patch({ earlyRepayMonth })}
                                  options={EARLY_MONTH_OPTIONS.map((m) => ({
                                    value: m,
                                    label: m === 0 ? '不提前' : `${m}期`,
                                    disabled: m > 0 && m >= form.months,
                                  }))}
                                />
                              </div>
                              {form.earlyRepayMonth > 0 && calc.earlyRepay && (
                                <div className="py-1.5">
                                  <LabelInput
                                    id="earlyRepayFee"
                                    label="提前还款手续费"
                                    tip="结清时贷款机构收取的费用，常见为剩余本金的 2%–5% 或固定金额。"
                                    value={form.earlyRepayFee}
                                    onChange={(v) => setMoney('earlyRepayFee', v)}
                                  />
                                </div>
                              )}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </FormSection>
                    </div>
                  </form>

                  <aside className="self-start scroll-mt-4 lg:sticky lg:top-5">
                    <div ref={summaryRef} className="rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                      <div className="px-2.5 pb-2.5 pt-3.5">
                        <div className="flex items-center justify-between gap-3 px-5">
                          <div className="flex min-w-0 items-center gap-2">
                            <Car size={15} strokeWidth={2} aria-hidden className="shrink-0 text-zinc-400" />
                            <span className="truncate text-[15px] font-medium">
                              {form.modelName.trim() || '未命名车辆'}
                            </span>
                          </div>
                          <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-zinc-200 px-2 py-0.5 text-[13px] text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
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

                      <div className="divide-y divide-zinc-100 border-t border-zinc-100 px-4 sm:px-9 dark:divide-zinc-800/70 dark:border-zinc-800/70">
                        <SummaryGroup icon={Banknote} title="车价">
                          <SummaryRow label="裸车原价" tip="厂商指导裸车原价，不含选装与税费。" value={fmtCNY(num(form.msrp))} />
                          <SummaryRow label="选装包" tip="计入开票价，随车价计税。" value={fmtCNY(num(form.optionsFee), true)} tone="plus" />
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
                              <Tip text="裸车原价 + 选装包 − 官方优惠 − 门店优惠 − 金融返点，是购置税、首付与月供的计算基数。" />
                            </span>
                            <span className="font-medium tabular-nums text-zinc-900 dark:text-zinc-50">
                              {fmtCNY(calc.taxBase)}
                            </span>
                          </div>
                        </SummaryGroup>

                        <SummaryGroup icon={ReceiptText} title="税费与保险">
                          <SummaryRow
                            label="购置税"
                            badge={taxManualBadge}
                            tip="按当前档位（全额 10% / 减半 5% / 免征 0）自动估算，减半已含 1.5 万元减税上限，可手动改写。"
                            value={fmtCNY(calc.purchaseTax)}
                          />
                          <SummaryRow
                            label="车船税"
                            tip="随交强险代收，按排量分档、各省不同；纯电动免征。"
                            value={fmtCNY(calc.vessel)}
                          />
                          <SummaryRow label="交强险" tip="首年保费，家用 6 座以下常见 950 元。" value={fmtCNY(calc.compulsory)} />
                          <SummaryRow label="商业险" tip="车损、三者等首年保费估算值。" value={fmtCNY(calc.commercial)} />
                        </SummaryGroup>

                        <SummaryGroup icon={Wallet} title="其他杂费">
                          <SummaryRow label="上牌费" tip="车管所上牌及工本费用。" value={fmtCNY(calc.plate)} />
                          <SummaryRow label="服务费" tip="出库、PDI、金融手续费等。" value={fmtCNY(calc.service)} />
                        </SummaryGroup>

                        {calc.isLoan && (
                          <SummaryGroup icon={CreditCard} title={`${loanLabel}方案（等额本息）`}>
                            <SummaryRow
                              label={form.paymentMode === 'finance' ? `首付（${calc.pct}%）` : '首付（计税基数 − 贷款额）'}
                              tip={
                                form.paymentMode === 'finance'
                                  ? '首付 = 计税基数 × 首付比例。'
                                  : '首付 = 计税基数 − 固定贷款额。'
                              }
                              value={fmtCNY(calc.down)}
                            />
                            <SummaryRow
                              label="贷款本金"
                              tip={form.paymentMode === 'finance' ? '贷款本金 = 计税基数 − 首付。' : '固定贷款额，不超过计税基数。'}
                              value={fmtCNY(calc.principal)}
                            />
                            {calc.freeMonths > 0 && (
                              <SummaryRow
                                label="免息期数"
                                tip={
                                  calc.earlyRepay
                                    ? '前 N 期只还本金、不计息。'
                                    : '前 N 期只还本金、不计息，其余期数按年利率计息，月供全程等额。'
                                }
                                value={`前 ${calc.freeMonths} 期`}
                              />
                            )}
                            <SummaryRow
                              label={`月供 × ${calc.earlyRepay ? calc.earlySettleMonth : calc.months} 期`}
                              tip={
                                calc.freeMonths > 0
                                  ? `等额本息月供，前 ${calc.freeMonths} 期免息，其余期数按年利率计息。`
                                  : '等额本息月供，利率为 0 时为本金均摊。'
                              }
                              value={fmtCNY(calc.monthly)}
                              tone="strong"
                            />
                            {calc.earlyRepay && (
                              <SummaryRow
                                label={`第 ${calc.earlySettleMonth} 期后一次性结清`}
                                tip="第 N 期期末结清剩余本金，贷款终止；结清前利息按免息期数口径计算。"
                                value={fmtCNY(calc.settleAmount)}
                                tone="strong"
                              />
                            )}
                            <SummaryRow
                              label="还款总额"
                              tip={
                                calc.earlyRepay
                                  ? `月供 × ${calc.earlySettleMonth} 期 + 结清余额。`
                                  : '月供 × 期数。'
                              }
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
                                  ? '结清前实际产生的利息。'
                                  : '还款总额 − 贷款本金，计入落地总价。'
                              }
                              value={fmtCNY(calc.interest)}
                              tone="strong"
                            />
                          </SummaryGroup>
                        )}

                        <SummaryGroup icon={BadgePercent} title="补贴抵扣（不计税）">
                          <SummaryRow
                            label="置换补贴"
                            tip={
                              form.tradeInMode === 'policy'
                                ? `${policySubsidy('tradeIn', form.vehicleType, calc.taxBase).label}，直接抵扣落地总价。`
                                : '直接抵扣落地总价，不计税。'
                            }
                            badge={form.tradeInMode === 'policy' ? <span className="rounded-full border border-emerald-200 px-1.5 py-px text-[12px] leading-4 text-emerald-600 dark:border-emerald-800 dark:text-emerald-400">2026政策</span> : null}
                            value={deductCNY(calc.tradeIn)}
                            tone={calc.tradeIn > 0 ? 'minus' : 'muted'}
                          />
                          <SummaryRow
                            label="报废补贴"
                            tip={
                              form.scrapMode === 'policy'
                                ? `${policySubsidy('scrap', form.vehicleType, calc.taxBase).label}，直接抵扣落地总价。`
                                : '直接抵扣落地总价，不计税。'
                            }
                            badge={form.scrapMode === 'policy' ? <span className="rounded-full border border-emerald-200 px-1.5 py-px text-[12px] leading-4 text-emerald-600 dark:border-emerald-800 dark:text-emerald-400">2026政策</span> : null}
                            value={deductCNY(calc.scrap)}
                            tone={calc.scrap > 0 ? 'minus' : 'muted'}
                          />
                          <SummaryRow
                            label="首购补贴"
                            tip="直接抵扣落地总价，不计税。"
                            value={deductCNY(calc.firstBuy)}
                            tone={calc.firstBuy > 0 ? 'minus' : 'muted'}
                          />
                          <SummaryRow
                            label="保险补贴"
                            tip="厂家或经销商赠送、返还的首年保费，直接抵扣落地总价，不计税。"
                            value={deductCNY(calc.insuranceSubsidy)}
                            tone={calc.insuranceSubsidy > 0 ? 'minus' : 'muted'}
                          />
                        </SummaryGroup>
                      </div>

                      <div className="px-4 pb-3 pt-2.5 sm:px-5">
                        <div className="rounded-2xl bg-zinc-900 p-3 text-white sm:p-3.5 dark:bg-zinc-100 dark:text-zinc-900">
                          <div className="text-[13px] text-zinc-400 dark:text-zinc-500">
                            {calc.isLoan ? `${loanLabel}落地总价（全周期支出）` : '全款落地总价'}
                          </div>
                          <div className="mt-1 text-base font-semibold leading-tight tracking-tight">
                            <AnimatedAmount value={calc.total} />
                          </div>
                          {calc.total > 0 && (
                            <div className="mt-1 text-sm leading-relaxed text-zinc-400 dark:text-zinc-500">
                              {toCNUpper(calc.total)}
                            </div>
                          )}
                        </div>
                        <div className="mt-2 space-y-0.5 text-left text-[13px] leading-relaxed tabular-nums text-zinc-500 dark:text-zinc-400">
                          {calc.isLoan && calc.interest > 0 && <div>含利息支出 {fmtCNY(calc.interest)}</div>}
                          <div>
                            {calc.isLoan
                              ? `首付 ${fmtCNY(calc.down)} + 月供 ${fmtCNY(calc.monthly)} × ${calc.earlyRepay ? calc.earlySettleMonth : calc.months} 期 + 结清、税费、保险、杂费 − 补贴（金融返点已冲减车价）`
                              : `车价 ${fmtCNY(calc.taxBase)} + 税费 ${fmtCNY(calc.purchaseTax + calc.vessel)} + 保险 ${fmtCNY(calc.insuranceTotal)} + 杂费 ${fmtCNY(calc.feesTotal)} − 补贴`}
                          </div>
                          {calc.isLoan && (
                            <div>
                              较全款购车{calc.total - calc.fullTotal >= 0 ? '多付' : '少付'}{' '}
                              {fmtCNY(Math.abs(calc.total - calc.fullTotal))}（全款口径 {fmtCNY(calc.fullTotal)}）
                            </div>
                          )}
                        </div>
                        <p className="relative mt-2 text-center text-[13px] leading-relaxed text-zinc-400 dark:text-zinc-500">
                          金额均为估算，不构成购车或金融建议；实际费用以经销商、税务与保险公司报价为准。
                        </p>
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                          <button
                            type="button"
                            onClick={handleCopy}
                            className="flex h-11 items-center justify-center gap-1.5 rounded-xl sm:h-10 bg-zinc-900 text-sm font-medium text-white transition-colors hover:bg-zinc-700 sm:text-[15px] dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
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
                            className="flex h-11 items-center justify-center gap-1.5 rounded-xl sm:h-10 border border-zinc-200 text-sm text-zinc-600 transition-colors hover:border-zinc-300 hover:bg-zinc-50 sm:text-[15px] dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-800/60"
                          >
                            <Download size={14} strokeWidth={2} aria-hidden />
                            导出 txt
                          </button>
                          <button
                            type="button"
                            onClick={handleExportImage}
                            disabled={exportingImg}
                            className="flex h-11 items-center justify-center gap-1.5 rounded-xl sm:h-10 border border-zinc-200 text-sm text-zinc-600 transition-colors hover:border-zinc-300 hover:bg-zinc-50 disabled:opacity-50 sm:text-[15px] dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-800/60"
                          >
                            <ImageIcon size={14} strokeWidth={2} aria-hidden />
                            {exportingImg ? '生成中' : '导出图片'}
                          </button>
                          <button
                            type="button"
                            onClick={handleShare}
                            disabled={shareBusy}
                            className="flex h-11 items-center justify-center gap-1.5 rounded-xl sm:h-10 border border-zinc-200 text-sm text-zinc-600 transition-colors hover:border-zinc-300 hover:bg-zinc-50 disabled:opacity-50 sm:text-[15px] dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-800/60"
                          >
                            {shareBusy ? (
                              <>
                                <Share2 size={14} strokeWidth={2} aria-hidden />
                                生成中
                              </>
                            ) : shareCopied ? (
                              <>
                                <Check size={14} strokeWidth={2} aria-hidden className="text-emerald-500 dark:text-emerald-600" />
                                已复制
                              </>
                            ) : (
                              <>
                                <Share2 size={14} strokeWidth={2} aria-hidden />
                                分享
                              </>
                            )}
                          </button>
                        </div>
                  </aside>
                </div>
              ) : tab === 'own' ? (
                <OwnCostPanel
                  form={ownForm}
                  calc={ownCalc}
                  patch={patchOwn}
                  reset={resetOwn}
                  buyForm={form}
                  buyCalc={calc}
                  dark={dark}
                  summaryRef={ownSummaryRef}
                />
              ) : (
                <SellPanel
                  form={sellForm}
                  calc={sellCalc}
                  patch={patchSell}
                  reset={resetSell}
                  buyForm={form}
                  ownForm={ownForm}
                  dark={dark}
                  summaryRef={sellSummaryRef}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </main>

        <section className="mt-6 rounded-2xl border border-zinc-200 bg-white px-4 py-3 sm:px-5 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
            <span className="shrink-0 text-[15px] font-medium text-zinc-700 dark:text-zinc-300">部分计算依据</span>
            {(tab === 'buy' ? POLICY_SOURCES : tab === 'own' ? OWN_SOURCES : SELL_SOURCES).map((s) => (
                <a
                  key={s.label}
                  href={s.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[15px] text-zinc-500 underline decoration-zinc-300 underline-offset-2 transition-colors hover:text-zinc-800 dark:text-zinc-400 dark:decoration-zinc-600 dark:hover:text-zinc-200"
                >
                  {s.label}
                  {s.label}
                </a>
              ))}
          </div>
        </section>

        <footer className="mt-6 flex flex-col items-center gap-1.5 pb-24 text-center lg:pb-5">
          <p className="flex flex-wrap items-center justify-center gap-1.5 text-sm text-zinc-400 dark:text-zinc-500">
            <ShieldCheck size={13} strokeWidth={2} aria-hidden />
            数据仅保存在本地浏览器localStorage，不上传任何服务器
          </p>
          <p className="text-sm text-zinc-300 dark:text-zinc-600">
            CarPay v0.3.0
          </p>
        </footer>
      </div>

      {/* 移动端底部悬浮总价条：调整参数时总价常驻可见，点击滚动到明细卡片 */}
      <div
        className={`fixed inset-x-0 bottom-0 z-40 border-t border-zinc-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur transition-transform duration-200 dark:border-zinc-800 dark:bg-zinc-950/95 lg:hidden ${
          kbOpen ? 'translate-y-full' : 'translate-y-0'
        }`}
      >
        <button
          type="button"
          aria-label={
            tab === 'buy' ? '查看落地总价明细' : tab === 'own' ? '查看月均用车成本明细' : '查看全周期净支出明细'
          }
          onClick={() =>
            (tab === 'buy' ? summaryRef : tab === 'own' ? ownSummaryRef : sellSummaryRef).current?.scrollIntoView({
              behavior: 'smooth',
              block: 'start',
            })
          }
          className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-3 px-4"
        >
          <span className="flex min-w-0 flex-col items-start leading-tight">
            <span className="text-xs text-zinc-400 dark:text-zinc-500">
              {tab === 'buy'
                ? calc.isLoan
                  ? `${loanLabel}落地总价`
                  : '全款落地总价'
                : tab === 'own'
                  ? `月均用车成本（${ownCalc.years} 年）`
                  : `全周期净支出（第 ${sellCalc.sellYear} 年${sellCalc.sellMonth === 12 ? '年末' : ` ${sellCalc.sellMonth} 月`}卖出）`}
            </span>
            <span className="font-semibold text-zinc-900 dark:text-zinc-50">
              <AnimatedAmount
                value={tab === 'buy' ? calc.total : tab === 'own' ? ownCalc.monthlyAvg : sellCalc.fullNet}
              />
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-0.5 text-[13px] text-zinc-400 dark:text-zinc-500">
            查看明细
            <ChevronUp size={14} strokeWidth={2} aria-hidden />
          </span>
        </button>
      </div>
    </div>
  );
}
