import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowRightLeft,
  Banknote,
  CalendarDays,
  Car,
  Check,
  Copy,
  Download,
  Fuel,
  HandCoins,
  Image as ImageIcon,
  ListChecks,
  PlugZap,
  ReceiptText,
  RotateCcw,
  Share2,
  ShieldCheck,
  Tag,
  TrendingDown,
  Wallet,
  Zap,
} from 'lucide-react';
import type { BuyForm } from './buyModel';
import { autoResidualPct, energyLabel, type OwnForm } from './ownCostModel';
import { buildSellDetailText, type SellCalc, type SellForm } from './sellModel';
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
  round2,
  sanitizeMoney,
  Segmented,
  SummaryGroup,
  SummaryRow,
  Tip,
  ToggleGroup,
} from './shared';
import { renderPosterPng } from './sharePoster';

const SELL_YEAR_OPTIONS = [1, 3, 5, 8];
const SELL_MONTH_OPTIONS = [3, 6, 9, 12];

const CHECKLIST = [
  { title: '处理违章与 ETC', desc: '过户前清零违章，ETC 注销或绑定新车；违章未处理无法过户。' },
  {
    title: '贷款结清与解押',
    desc: '结清出具证明（银行 2 天-2 周、金融公司 3-10 个工作日）→ 取回绿本 → 车管所解押（免费，1-3 个工作日，多地支持 12123 线上办理）。',
  },
  {
    title: '过户前退保',
    desc: '在保商业险按天退（手续费 3%-5%），交强险随车过户或过户前退；过户后原投保人无法再退。',
  },
  {
    title: '交易市场开票过户',
    desc: '二手车交易发票须到正规交易市场开具，个人过户合计约 300-800 元，谨防网购假发票。',
  },
  {
    title: '置换补贴资格',
    desc: '2026 以旧换新：旧车须 2025-01-08 前登记在本人名下、新旧车同一人，旧车过户/报废与新车购置须在政策窗口内，申请截止 2027-01-10。',
  },
];

export default function SellPanel({
  form,
  calc,
  patch,
  reset,
  buyForm,
  ownForm,
  dark,
  summaryRef,
}: {
  form: SellForm;
  calc: SellCalc;
  patch: (p: Partial<SellForm>) => void;
  reset: () => void;
  buyForm: BuyForm;
  ownForm: OwnForm;
  dark: boolean;
  summaryRef: RefObject<HTMLDivElement>;
}) {
  const [copied, setCopied] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);
  const [exportingImg, setExportingImg] = useState(false);
  const copyTimer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(copyTimer.current), []);

  const setMoney = useCallback(
    (key: keyof SellForm, raw: string) => patch({ [key]: sanitizeMoney(raw) } as Partial<SellForm>),
    [patch],
  );

  const anchorYear = clamp(Math.round(calc.yearFrac), 1, 10);
  const sellMonthAbs = (calc.sellYear - 1) * 12 + calc.sellMonth;
  const maxAvg = Math.max(1, ...calc.rows.map((r) => r.yearlyAvg));
  const textCtx = {
    vehicleName: buyForm.modelName.trim() || '未命名车辆',
    energyType: ownForm.energyType,
    annualKm: Math.max(0, num(ownForm.annualMileage)),
  };

  const sellDetailText = () => buildSellDetailText(form, calc, textCtx);

  const handleCopy = async () => {
    const ok = await copyText(sellDetailText());
    if (ok) {
      setCopied(true);
      window.clearTimeout(copyTimer.current);
      copyTimer.current = window.setTimeout(() => setCopied(false), 2000);
    }
  };

  const exportBaseName = () =>
    `卖车损益-${(buyForm.modelName.trim() || '未命名车辆').replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 30)}`;

  const handleExport = () => {
    const blob = new Blob(['\ufeff' + sellDetailText()], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `CarPay-${exportBaseName()}-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleShare = async () => {
    if (shareBusy) return;
    const text = sellDetailText();
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
        const dataUrl = await renderPosterPng(summaryRef.current, { dark, title: '卖车损益测算' });
        if (dataUrl) {
          await navigator.share({ files: [dataUrlToPngFile(dataUrl, fileName)], title: 'CarPay 卖车损益测算' });
          return;
        }
      }
      await navigator.share({ title: 'CarPay 卖车损益测算', text, url: window.location.href });
      return;
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return; // 用户取消分享
      /* 生成或分享失败继续走降级 */
    } finally {
      setShareBusy(false);
    }
    await copyFallback();
  };

  const handleExportImage = async () => {
    if (exportingImg) return;
    setExportingImg(true);
    try {
      const dataUrl = await renderPosterPng(summaryRef.current, { dark, title: '卖车损益测算' });
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

  const barParts = [
    { label: '购车落地', value: calc.loan.buyTotal, cls: 'bg-zinc-800 dark:bg-zinc-300' },
    { label: '用车成本', value: calc.ownTotal, cls: 'bg-sky-500' },
    { label: '卖车费用', value: calc.sellFees, cls: 'bg-amber-500' },
  ];

  const residualBadge =
    form.residualRatePct === null ? (
      <span className="rounded-full border border-zinc-200 px-1.5 py-px text-[13px] leading-4 text-zinc-400 dark:border-zinc-700 dark:text-zinc-500">
        自动
      </span>
    ) : null;

  return (
    <div>
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 lg:grid-cols-[minmax(0,1fr)_400px] xl:grid-cols-[minmax(0,1fr)_420px]">
        <form className="rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800/70">
            <FormSection
              icon={CalendarDays}
              title="卖出计划"
              action={
                <button
                  type="button"
                  onClick={reset}
                  className="flex h-9 items-center gap-1 rounded-lg px-2 text-[13px] font-medium text-red-600 transition-colors hover:bg-red-50 hover:text-red-700 sm:h-7 sm:px-2 dark:text-red-400 dark:hover:bg-red-500/10 dark:hover:text-red-300"
                >
                  <RotateCcw size={13} strokeWidth={2} aria-hidden />
                  重置
                </button>
              }
            >
              <div className="py-1.5">
                <LabelInput
                  id="sell-year"
                  label="卖出年份"
                  tip="计划卖出的年份（1-10 年）。逐年净支出表、最优卖出年与走势图按此联动。"
                  prefix={null}
                  suffix="年"
                  placeholder="3"
                  value={form.sellYear}
                  controls={
                    <ToggleGroup
                      groupId="sell-year"
                      ariaLabel="卖出年份快捷选项"
                      compact
                      value={clamp(Math.round(num(form.sellYear)) || 1, 1, 10)}
                      onChange={(y) => patch({ sellYear: String(y), residualRatePct: null })}
                      options={SELL_YEAR_OPTIONS.map((y) => ({ value: y, label: `${y}年` }))}
                    />
                  }
                  onChange={(v) => patch({ sellYear: sanitizeMoney(v) })}
                  onBlur={() =>
                    patch({
                      sellYear: String(clamp(Math.round(num(form.sellYear)) || 1, 1, 10)),
                      residualRatePct: null,
                    })
                  }
                />
              </div>
              <div className="py-1.5">
                <LabelInput
                  id="sell-month"
                  label="卖出月份"
                  tip="12 月＝按整年卖出（默认）。月份影响：当年能源杂项按月折算、在保保单按剩余月份退保回收、贷款月供计至卖出当月。"
                  prefix={null}
                  suffix="月"
                  placeholder="12"
                  value={form.sellMonth}
                  controls={
                    <ToggleGroup
                      groupId="sell-month"
                      ariaLabel="卖出月份快捷选项"
                      compact
                      value={clamp(Math.round(num(form.sellMonth)) || 12, 1, 12)}
                      onChange={(m) => patch({ sellMonth: String(m), residualRatePct: null })}
                      options={SELL_MONTH_OPTIONS.map((m) => ({ value: m, label: `${m}月` }))}
                    />
                  }
                  onChange={(v) => patch({ sellMonth: sanitizeMoney(v) })}
                  onBlur={() =>
                    patch({
                      sellMonth: String(clamp(Math.round(num(form.sellMonth)) || 12, 1, 12)),
                      residualRatePct: null,
                    })
                  }
                />
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 py-1.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm text-zinc-700 dark:text-zinc-300">残值模式</span>
                  <Tip text="自动估算：按流通协会保值率曲线 × 残值基数估算卖价。手动卖价：直接输入二手车平台（懂车帝/瓜子/车300）同款车报价，更贴合实际行情。" />
                </div>
                <Segmented
                  className="ml-auto"
                  groupId="sell-resmode"
                  ariaLabel="残值模式"
                  value={form.residualMode}
                  onChange={(residualMode) => patch({ residualMode })}
                  options={[
                    { value: 'auto', label: '自动估算', icon: TrendingDown },
                    { value: 'manual', label: '手动卖价', icon: Banknote },
                  ]}
                />
              </div>
              <AnimatePresence mode="wait" initial={false}>
                {form.residualMode === 'auto' ? (
                  <motion.div
                    key="auto"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.18, ease: 'easeOut' }}
                    className="divide-y divide-zinc-100 dark:divide-zinc-800/70"
                  >
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 py-1.5">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm text-zinc-700 dark:text-zinc-300">残值基数</span>
                        <Tip text="成交价＝购车页计税基数（裸车+选装−优惠−返点），与用车面板折旧参考同口径；指导价＝厂商指导裸车原价，贴近二手车平台按指导价折扣报价的习惯。" />
                      </div>
                      <Segmented
                        className="ml-auto"
                        groupId="sell-resbase"
                        ariaLabel="残值基数"
                        value={form.residualBase}
                        onChange={(residualBase) => patch({ residualBase, residualRatePct: null })}
                        options={[
                          { value: 'taxBase', label: '成交价' },
                          { value: 'msrp', label: '指导价' },
                        ]}
                      />
                    </div>
                    <div className="py-1.5">
                      <LabelInput
                        id="sell-rate"
                        label="预估残值率"
                        tip={`按流通协会保值率曲线自动估算：${energyLabel(ownForm.energyType)}车持有 ${anchorYear} 年约 ${autoResidualPct(ownForm.energyType, anchorYear)}%；可按二手车平台行情手动修改，点框内按钮恢复自动。`}
                        prefix={null}
                        suffix="%"
                        badge={residualBadge}
                        value={form.residualRatePct ?? String(autoResidualPct(ownForm.energyType, anchorYear))}
                        onChange={(v) => patch({ residualRatePct: sanitizeMoney(v) })}
                        after={
                          form.residualRatePct !== null ? (
                            <button
                              type="button"
                              aria-label="恢复自动残值率"
                              title="恢复自动"
                              onClick={() => patch({ residualRatePct: null })}
                              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-emerald-600 dark:hover:bg-zinc-800 dark:hover:text-emerald-400 sm:h-7 sm:w-7"
                            >
                              <RotateCcw size={13} strokeWidth={2} aria-hidden />
                            </button>
                          ) : undefined
                        }
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 py-1.5">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm text-zinc-700 dark:text-zinc-300">里程修正</span>
                        <Tip text="以年均 2 万 km 为基准：总里程每偏差 1 万 km 调整残值 1.5 个百分点（低里程溢价、高里程压价），上限 ±10%。年行驶里程在用车成本页修改；极端里程建议改用手动卖价。" />
                      </div>
                      <Segmented
                        className="ml-auto"
                        groupId="sell-mileadj"
                        ariaLabel="里程修正开关"
                        value={form.mileageAdjust ? 'on' : 'off'}
                        onChange={(v) => patch({ mileageAdjust: v === 'on' })}
                        options={[
                          { value: 'off', label: '不修正' },
                          { value: 'on', label: '按里程修正' },
                        ]}
                      />
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    key="manual"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.18, ease: 'easeOut' }}
                    className="divide-y divide-zinc-100 dark:divide-zinc-800/70"
                  >
                    <div className="py-1.5">
                      <LabelInput
                        id="sell-manual-price"
                        label="手动卖价"
                        tip="打开懂车帝/瓜子/车300 等平台，输入车型、上牌时间与里程获取估价或收车报价，填成交价（到手前）。逐年表按保值率曲线比例折算其他年份。"
                        placeholder="0"
                        value={form.manualSalePrice}
                        onChange={(v) => setMoney('manualSalePrice', v)}
                      />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </FormSection>

            <FormSection icon={ReceiptText} title="卖出时费用">
              <div className="py-1.5">
                <LabelInput
                  id="sell-prep"
                  label="整备费"
                  tip="卖车前洗车、打蜡、小整备的花费，行情约 200-1000 元，有助提高成交价；车商收车会自行整备并压价，可填 0。"
                  value={form.prepFee}
                  onChange={(v) => setMoney('prepFee', v)}
                />
              </div>
              <div className="py-1.5">
                <LabelInput
                  id="sell-transfer"
                  label="过户费"
                  tip="个人过户合计约 300-800 元：交易市场开票费 + 车管所工本约 120 + 可选代办；各地按评估价 0.5%-2% 或固定收取。置换/车商渠道常由对方代办，可按实付修改。"
                  value={form.transferFee}
                  onChange={(v) => setMoney('transferFee', v)}
                />
              </div>
              <div className="py-1.5">
                <LabelInput
                  id="sell-platform"
                  label="平台服务费"
                  tip="瓜子等平台宣称卖方免费；部分寄售/严选模式按成交价 2%-4% 收取，按合同价修改，无则填 0。"
                  value={form.platformFee}
                  onChange={(v) => setMoney('platformFee', v)}
                />
              </div>
              <div className="py-1.5">
                <LabelInput
                  id="sell-other-fee"
                  label="其他费用"
                  tip="代办跑腿、异地提档、临时牌证等杂费，无则填 0。"
                  value={form.otherFee}
                  onChange={(v) => setMoney('otherFee', v)}
                />
              </div>
            </FormSection>

            <FormSection icon={ShieldCheck} title="保险与退保">
              <div className="py-1.5">
                <LabelInput
                  id="sell-refund-fee"
                  label="退保手续费率"
                  tip="商业险退保手续费行业普遍为保费的 3%-5%，退费按天折算（此处按月估算）；12 月整年卖出无退保。"
                  prefix={null}
                  suffix="%"
                  value={form.refundFeePct}
                  onChange={(v) => setMoney('refundFeePct', v)}
                />
              </div>
              <div className="mb-1.5 flex items-center justify-between rounded-xl bg-zinc-100/80 px-3 py-2 dark:bg-zinc-800/50">
                <span className="flex items-center gap-1.5 text-[13px] text-zinc-500 dark:text-zinc-400">
                  预计退保回收
                  <Tip text="过户前可退在保商业险（交强险随车过户则不退）：退回 ≈ 在保保费 × 剩余月份占比 × (1 − 手续费率)；实际按天计算、各公司手续费不同。保费基数与 NCD 折扣跟随用车成本页。" />
                </span>
                <span
                  className={`text-[15px] font-medium tabular-nums ${
                    calc.refund > 0 ? 'text-zinc-900 dark:text-zinc-50' : 'text-zinc-400 dark:text-zinc-600'
                  }`}
                >
                  {calc.sellMonth < 12 ? fmtCNY(calc.refund) : '整年卖出 · 无退保'}
                </span>
              </div>
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
                    {buyForm.modelName.trim() || '未命名车辆'}
                  </span>
                </div>
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-zinc-200 px-2 py-0.5 text-[13px] text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                  {ownForm.energyType === 'gas' ? (
                    <Fuel size={11} strokeWidth={2} aria-hidden />
                  ) : ownForm.energyType === 'phev' ? (
                    <PlugZap size={11} strokeWidth={2} aria-hidden />
                  ) : (
                    <Zap size={11} strokeWidth={2} aria-hidden />
                  )}
                  {energyLabel(ownForm.energyType)} · 第 {calc.sellYear} 年{calc.sellMonth === 12 ? '年末' : ` ${calc.sellMonth} 月`}
                </span>
              </div>
              <CompositionBar parts={barParts} />
            </div>

            <div className="divide-y divide-zinc-100 border-t border-zinc-100 px-4 sm:px-9 dark:divide-zinc-800/70 dark:border-zinc-800/70">
              <SummaryGroup icon={HandCoins} title="卖车到手价">
                {calc.manualMissing ? (
                  <SummaryRow
                    label="未填手动卖价"
                    tip="已切换到手动卖价模式，请在上方残值估算区填写二手车平台同款车报价。"
                    value="—"
                    tone="muted"
                  />
                ) : (
                  <SummaryRow
                    label={form.residualMode === 'manual' ? '卖价（手动）' : `卖价（残值率 ${calc.residualRatePct}%）`}
                    tip={
                      form.residualMode === 'manual'
                        ? '以二手车平台同款车报价填写，里程与车况已在报价中体现。'
                        : `${form.residualBase === 'msrp' ? '厂商指导价' : '计税基数（成交价）'} ${fmtCNY(calc.residualBaseVal)} × 残值率，曲线参考流通协会保值率报告${
                            calc.mileageAdj !== 0 ? `，含里程修正 ${calc.mileageAdj > 0 ? '+' : ''}${calc.mileageAdj}%` : ''
                          }。`
                    }
                    value={fmtCNY(calc.salePrice)}
                  />
                )}
                {form.residualMode === 'auto' && form.mileageAdjust && calc.mileageAdj !== 0 && (
                  <SummaryRow
                    label="里程修正"
                    tip="以年均 2 万 km 为基准，总里程每偏差 1 万 km 调整残值 1.5 个百分点，上限 ±10%。"
                    value={fmtCNY(round2((calc.residualBaseVal * calc.mileageAdj) / 100), calc.mileageAdj > 0)}
                    tone="base"
                  />
                )}
                {calc.loan.settleAtSale > 0 && (
                  <SummaryRow
                    label={`贷款结清（第 ${sellMonthAbs} 期）`}
                    tip="卖出时一次性结清的剩余本金，从卖车款中扣除；未还期数的利息不再产生。"
                    value={deductCNY(calc.loan.settleAtSale)}
                    tone="minus"
                  />
                )}
                {calc.loan.settleAtSale > 0 && calc.loan.settleFee > 0 && (
                  <SummaryRow
                    label="提前结清手续费"
                    tip="沿用购车页「提前还款手续费」金额，多数机构满 1 年免收。"
                    value={deductCNY(calc.loan.settleFee)}
                    tone="plus"
                  />
                )}
                <SummaryRow
                  label="卖出费用（整备/过户/平台/其他）"
                  tip="卖前整备、过户费、平台服务费与其他卖车支出合计。"
                  value={calc.sellFees > 0 ? deductCNY(calc.sellFees) : '—'}
                  tone={calc.sellFees > 0 ? 'minus' : 'muted'}
                />
                <SummaryRow
                  label="到手价"
                  tip="卖价 − 贷款结清 − 手续费 − 卖出费用；保险退保回收另列于全周期净支出。"
                  value={fmtCNY(calc.netProceeds)}
                  tone="strong"
                />
              </SummaryGroup>

              <SummaryGroup icon={Wallet} title="全周期净支出">
                <SummaryRow
                  label="购车落地（截至卖出月）"
                  tip={
                    calc.loan.truncated
                      ? `贷款月供只计到第 ${sellMonthAbs} 期，利息止于卖出月；结清余额从卖车款中扣除。`
                      : calc.loan.settledEarly
                        ? '购车页设定的提前结清早于卖出时点，沿用其落地总价（含结清款与手续费）。'
                        : calc.loan.hasLoan
                          ? '贷款已在卖出前自然还清，落地总价为全期口径。'
                          : '全款落地总价，含首年保险与补贴抵扣。'
                  }
                  value={fmtCNY(calc.loan.buyTotal)}
                />
                <SummaryRow
                  label={`用车成本（${calc.sellYear} 年${calc.sellMonth === 12 ? '整年' : ` ${calc.sellMonth} 个月`}）`}
                  tip="复用用车成本口径按卖出时点截断：能源杂项按月折算、保养按里程节点计次、卖出年保费整年计。"
                  value={fmtCNY(calc.ownTotal)}
                />
                <SummaryRow label="卖车到手价" tip="卖出回收，冲减全周期支出。" value={deductCNY(calc.netProceeds)} tone="minus" />
                {calc.refund > 0 && (
                  <SummaryRow
                    label="保险退保回收"
                    tip={`在保保单保费按剩余月份折算退还（手续费率 ${form.refundFeePct}%），须在过户前办理。`}
                    value={deductCNY(calc.refund)}
                    tone="minus"
                  />
                )}
              </SummaryGroup>
            </div>

            <div className="px-4 pb-3 pt-2.5 sm:px-5">
              <div className="px-1">
                <div className="flex items-center gap-1.5 text-[13px] font-medium text-zinc-400 dark:text-zinc-500">
                  <TrendingDown size={13} strokeWidth={2} aria-hidden />
                  年均持有成本走势（第 1-10 年卖出）
                  <Tip text="各年年末整年卖出口径下的年均持有成本：早期折旧摊薄最快，其后用车成本逐年抬升，年均最低点即本口径下的最优卖出年。" />
                </div>
                <div className="mt-2 grid grid-cols-10 gap-1">
                  {calc.rows.map((r) => (
                    <div key={r.year} className="flex min-w-0 flex-col items-center gap-1">
                      <div className="flex h-10 w-full items-end justify-center">
                        <div
                          className={`w-full rounded-sm ${
                            r.best
                              ? 'bg-emerald-500'
                              : r.current
                                ? 'bg-zinc-900 dark:bg-zinc-100'
                                : 'bg-zinc-200 dark:bg-zinc-700'
                          }`}
                          style={{ height: `${Math.max(4, (r.yearlyAvg / maxAvg) * 100)}%` }}
                          title={`第 ${r.year} 年 年均 ${fmtCNY(r.yearlyAvg)}`}
                        />
                      </div>
                      <span className="text-[13px] leading-none tabular-nums text-zinc-400 dark:text-zinc-500">{r.year}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[13px] text-zinc-400 dark:text-zinc-500">
                  <span className="flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
                    最优卖出年（第 {calc.bestYear} 年）
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-zinc-900 dark:bg-zinc-100" aria-hidden />
                    当前卖出年
                  </span>
                </div>
              </div>

              <div className="mt-3 rounded-2xl bg-zinc-900 p-3 text-white sm:p-3.5 dark:bg-zinc-100 dark:text-zinc-900">
                <div className="text-[13px] text-zinc-400 dark:text-zinc-500">
                  全周期净支出（第 {calc.sellYear} 年{calc.sellMonth === 12 ? '年末' : ` ${calc.sellMonth} 月`}卖出）
                </div>
                <div className="mt-1 text-base font-semibold leading-tight tracking-tight">
                  <AnimatedAmount value={calc.fullNet} />
                </div>
                <div className="mt-1.5 flex flex-wrap gap-x-3 text-[13px] leading-relaxed tabular-nums text-zinc-400 dark:text-zinc-500">
                  <span>年均 {fmtCNY(calc.yearlyAvg)}</span>
                  <span>每公里 {fmtCNY(calc.perKm)}</span>
                  <span>到手 {fmtCNY(calc.netProceeds)}</span>
                </div>
              </div>
              <div className="mt-2 space-y-0.5 text-left text-[13px] leading-relaxed tabular-nums text-zinc-500 dark:text-zinc-400">
                <div>
                  落地 {fmtCNY(calc.loan.buyTotal)} + 用车 {fmtCNY(calc.ownTotal)} − 到手 {fmtCNY(calc.netProceeds)}
                  {calc.refund > 0 ? ` − 退保 ${fmtCNY(calc.refund)}` : ''}
                </div>
                <div>置换/报废/首购/保险补贴已在购车页抵扣；贷款结清余额从卖车款中扣除；折旧已通过卖车款变现。</div>
              </div>
              <p className="relative mt-2 text-center text-[13px] leading-relaxed text-zinc-400 dark:text-zinc-500">
                本测算基于保值率曲线与用户输入，仅供参考；实际成交以二手车行情为准。
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

      {/* 逐年净支出：各年年末卖出的到手价与年均成本，最优卖出年一目了然 */}
      <section className="mt-5 rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex flex-wrap items-center gap-2 px-4 py-3 text-zinc-500 dark:text-zinc-400 sm:px-5">
          <CalendarDays size={14} strokeWidth={2} aria-hidden />
          <h3 className="text-sm font-medium">逐年净支出</h3>
          <span className="text-[13px] text-zinc-400 dark:text-zinc-500">第 1-10 年年末整年卖出口径</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-[13px] tabular-nums">
            <thead>
              <tr className="border-t border-zinc-100 text-left text-zinc-400 dark:border-zinc-800/70 dark:text-zinc-500">
                <th className="px-4 py-2 font-normal sm:px-5">年份</th>
                <th className="px-3 py-2 text-right font-normal">预估到手价</th>
                <th className="px-3 py-2 text-right font-normal">全周期净支出</th>
                <th className="px-4 py-2 text-right font-normal sm:px-5">年均持有成本</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/70">
              {calc.rows.map((r) => (
                <tr
                  key={r.year}
                  className={`text-zinc-600 dark:text-zinc-300 ${r.best ? 'bg-emerald-50/60 dark:bg-emerald-400/5' : ''}`}
                >
                  <td className="px-4 py-2 sm:px-5">
                    <span className="inline-flex items-center gap-1.5">
                      第 {r.year} 年
                      {r.best && (
                        <span className="rounded-full bg-emerald-500/15 px-1.5 py-px text-[13px] font-medium text-emerald-700 dark:text-emerald-400">
                          最优
                        </span>
                      )}
                      {r.current && (
                        <span className="rounded-full border border-zinc-200 px-1.5 py-px text-[13px] text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                          当前
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">{fmtCNY(r.netProceeds)}</td>
                  <td className="px-3 py-2 text-right">{fmtCNY(r.fullNet)}</td>
                  <td className="px-4 py-2 text-right font-medium text-zinc-900 dark:text-zinc-50 sm:px-5">{fmtCNY(r.yearlyAvg)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="px-4 py-2.5 text-[13px] leading-relaxed text-zinc-400 dark:text-zinc-500 sm:px-5">
          按各年年末整年卖出估算，当前「第 {calc.sellYear} 年{calc.sellMonth === 12 ? '年末' : ` ${calc.sellMonth} 月`}」月份粒度的结果见上方汇总卡；
          最优卖出年 = 年均持有成本最低的一年，即折旧摊薄与维修抬升的平衡点（实际决策还需考虑车况、新车迭代与用车需求变化）。
        </p>
      </section>

      {/* 渠道对比：以当前卖价为个人直卖基准，按行情区间折算三渠道到手价 */}
      <section className="mt-5 rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex flex-wrap items-center gap-2 px-4 py-3 text-zinc-500 dark:text-zinc-400 sm:px-5">
          <Tag size={14} strokeWidth={2} aria-hidden />
          <h3 className="text-sm font-medium">渠道对比</h3>
          <span className="text-[13px] text-zinc-400 dark:text-zinc-500">
            以当前预估卖价为个人直卖基准 · 未含保险退保回收
          </span>
        </div>
        <div className="grid gap-2 px-4 pb-4 sm:grid-cols-3 sm:px-5">
          {calc.channels.map((ch) => (
            <div key={ch.key} className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
              <div className="flex items-center justify-between">
                <span className="text-[15px] font-medium text-zinc-800 dark:text-zinc-100">{ch.label}</span>
                {ch.key === 'private' && (
                  <span className="rounded-full bg-zinc-500/10 px-1.5 py-px text-[13px] font-medium text-zinc-600 dark:text-zinc-300">
                    基准
                  </span>
                )}
              </div>
              <div className="mt-1.5 text-[15px] font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
                {ch.low === ch.high ? fmtCNY(ch.low) : `${fmtCNY(ch.low)} – ${fmtCNY(ch.high)}`}
              </div>
              <div className="mt-0.5 text-[13px] text-zinc-500 dark:text-zinc-400">到手价估算</div>
              <div className="mt-1 text-[13px] leading-relaxed text-zinc-500 dark:text-zinc-400">{ch.note}</div>
            </div>
          ))}
        </div>
      </section>

      {/* 全周期油电对比：落地价按 2026 政策区分税档，残值用各类型曲线 */}
      <section className="mt-5 rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex flex-wrap items-center gap-2 px-4 py-3 text-zinc-500 dark:text-zinc-400 sm:px-5">
          <ArrowRightLeft size={14} strokeWidth={2} aria-hidden />
          <h3 className="text-sm font-medium">全周期油电对比</h3>
          <span className="text-[13px] text-zinc-400 dark:text-zinc-500">
            落地价按 2026 政策区分税档（燃油全额/插混减半/纯电免征），能耗保养取各类型默认值
          </span>
        </div>
        <div className="grid gap-2 px-4 pb-4 sm:grid-cols-3 sm:px-5">
          {calc.energyCompare.map((e) => {
            const active = e.key === ownForm.energyType;
            return (
              <div
                key={e.key}
                className={`rounded-xl border p-3 ${
                  active
                    ? 'border-emerald-500/70 bg-emerald-50/60 dark:border-emerald-400/50 dark:bg-emerald-400/5'
                    : 'border-zinc-200 dark:border-zinc-800'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[15px] font-medium text-zinc-800 dark:text-zinc-100">{e.label}</span>
                  {active && (
                    <span className="rounded-full bg-emerald-500/15 px-1.5 py-px text-xs font-medium text-emerald-700 dark:text-emerald-400">
                      当前
                    </span>
                  )}
                </div>
                <div className="mt-1.5 text-[15px] font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
                  {fmtCNY(e.yearlyAvg)}
                  <span className="ml-1 text-[13px] font-normal text-zinc-400 dark:text-zinc-500">年均净支出</span>
                </div>
                <div className="mt-0.5 text-[13px] tabular-nums text-zinc-500 dark:text-zinc-400">
                  第 {calc.sellYear} 年卖出｜最优第 {e.bestYear} 年 · 年均 {fmtCNY(e.bestYearlyAvg)}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 卖车流程清单：过户前后的关键动作，纯提示无计算 */}
      <section className="mt-5 rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex flex-wrap items-center gap-2 px-4 py-3 text-zinc-500 dark:text-zinc-400 sm:px-5">
          <ListChecks size={14} strokeWidth={2} aria-hidden />
          <h3 className="text-sm font-medium">卖车流程清单</h3>
          <span className="text-[13px] text-zinc-400 dark:text-zinc-500">过户前后的关键动作与时间参考</span>
        </div>
        <ol className="space-y-2 px-4 pb-4 sm:px-5">
          {CHECKLIST.map((item, i) => (
            <li key={item.title} className="flex gap-2.5 text-[15px] leading-relaxed text-zinc-600 dark:text-zinc-300">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-[13px] font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                {i + 1}
              </span>
              <span>
                <span className="font-medium text-zinc-800 dark:text-zinc-100">{item.title}</span>
                <span className="text-zinc-500 dark:text-zinc-400">　{item.desc}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
