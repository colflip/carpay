import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowRightLeft,
  CalendarDays,
  Car,
  Check,
  CircleDot,
  Copy,
  Download,
  Fuel,
  Image as ImageIcon,
  MapPin,
  PlugZap,
  RotateCcw,
  Settings2,
  Share2,
  ShieldCheck,
  TrendingDown,
  Wrench,
  Zap,
} from 'lucide-react';
import type { BuyForm, Calc } from './buyModel';
import {
  autoResidualPct,
  buildOwnDetailText,
  CITY_PRESETS,
  compareOwn,
  ENERGY_PRESETS,
  energyLabel,
  type CityTier,
  type EnergyType,
  type OwnCalc,
  type OwnForm,
} from './ownCostModel';
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
} from './shared';
import { renderPosterPng } from './sharePoster';

const HOLD_YEAR_OPTIONS = [1, 3, 5, 8];
const ENERGY_CLS: Record<EnergyType, string> = {
  gas: 'bg-emerald-500',
  phev: 'bg-teal-500',
  bev: 'bg-sky-500',
};

function SyncFromBuyButton({ onClick, label = '带入购车' }: { onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-7 shrink-0 items-center gap-1 rounded-md px-1.5 text-[13px] text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-emerald-600 dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-emerald-400"
    >
      <Download size={12} strokeWidth={2} aria-hidden />
      {label}
    </button>
  );
}

export default function OwnCostPanel({
  form,
  calc,
  patch,
  reset,
  buyForm,
  buyCalc,
  dark,
  summaryRef,
}: {
  form: OwnForm;
  calc: OwnCalc;
  patch: (p: Partial<OwnForm>) => void;
  reset: () => void;
  buyForm: BuyForm;
  buyCalc: Calc;
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
    (key: keyof OwnForm, raw: string) => patch({ [key]: sanitizeMoney(raw) } as Partial<OwnForm>),
    [patch],
  );

  const setEnergyType = useCallback(
    (t: EnergyType) =>
      patch({ ...ENERGY_PRESETS[t], energyType: t, residualRatePct: null }),
    [patch],
  );

  const setCityTier = useCallback(
    (t: CityTier) =>
      patch({
        cityTier: t,
        parkingMonth: CITY_PRESETS[t].parkingMonth,
        washPrice: CITY_PRESETS[t].washPrice,
      }),
    [patch],
  );

  const cmp = compareOwn(form);

  const residualRatePct =
    form.residualRatePct !== null ? num(form.residualRatePct) : autoResidualPct(form.energyType, calc.years);
  const residual = Math.max(0, (buyCalc.taxBase * residualRatePct) / 100);
  const depreciation = Math.max(0, buyCalc.taxBase - residual);
  const fullNet = buyCalc.total + calc.total - residual;

  const ownDetailText = () =>
    buildOwnDetailText(form, calc, {
      vehicleName: buyForm.modelName.trim() || '未命名车辆',
      buyTotal: buyCalc.total,
      buyTaxBase: buyCalc.taxBase,
      residual: form.showDepreciation
        ? {
            ratePct: residualRatePct,
            residual,
            depreciation,
            yearlyDepreciation: depreciation / calc.years,
            fullNet,
          }
        : null,
    });

  const handleCopy = async () => {
    const ok = await copyText(ownDetailText());
    if (ok) {
      setCopied(true);
      window.clearTimeout(copyTimer.current);
      copyTimer.current = window.setTimeout(() => setCopied(false), 2000);
    }
  };

  const exportBaseName = () =>
    `用车成本-${(buyForm.modelName.trim() || '未命名车辆').replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 30)}`;

  const handleExport = () => {
    const text = ownDetailText();
    const blob = new Blob(['\ufeff' + text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `CarPay-${exportBaseName()}-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleShare = async () => {
    if (shareBusy) return;
    const text = ownDetailText();
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
        const dataUrl = await renderPosterPng(summaryRef.current, { dark, title: '用车成本测算' });
        if (dataUrl) {
          await navigator.share({ files: [dataUrlToPngFile(dataUrl, fileName)], title: 'CarPay 用车成本测算' });
          return;
        }
      }
      await navigator.share({ title: 'CarPay 用车成本测算', text, url: window.location.href });
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
      const dataUrl = await renderPosterPng(summaryRef.current, { dark, title: '用车成本测算' });
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
    { label: '能源', value: calc.energyTotal, cls: ENERGY_CLS[form.energyType] },
    { label: '保险续保', value: calc.insuranceTotal, cls: 'bg-sky-500' },
    { label: '车船税', value: calc.vesselTotal, cls: 'bg-amber-500' },
    { label: '保养', value: calc.maintenanceTotal, cls: 'bg-violet-500' },
    { label: '易损件', value: calc.wearTotal, cls: 'bg-rose-400' },
    { label: '停车杂项', value: calc.miscTotal, cls: 'bg-zinc-400 dark:bg-zinc-600' },
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
              icon={Settings2}
              title="测算基础"
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
                  id="own-hold-years"
                  label="持有年限"
                  tip="计划持有并测算的年数（1-10 年）。年限影响保险续保次数、易损件更换轮次与折旧参考。"
                  prefix={null}
                  suffix="年"
                  placeholder="3"
                  value={form.holdYears}
                  controls={
                    <ToggleGroup
                      groupId="own-years"
                      ariaLabel="持有年限快捷选项"
                      compact
                      value={clamp(Math.round(num(form.holdYears)), 1, 10)}
                      onChange={(y) => patch({ holdYears: String(y), residualRatePct: null })}
                      options={HOLD_YEAR_OPTIONS.map((y) => ({ value: y, label: `${y}年` }))}
                    />
                  }
                  onChange={(v) => patch({ holdYears: sanitizeMoney(v) })}
                  onBlur={() =>
                    patch({
                      holdYears: String(clamp(Math.round(num(form.holdYears)) || 1, 1, 10)),
                      residualRatePct: null,
                    })
                  }
                />
              </div>
              <div className="py-1.5">
                <LabelInput
                  id="own-mileage"
                  label="年行驶里程"
                  tip="国内私家车年均约 1.2-1.5 万 km，通勤为主约 1 万，跨城多则 2 万+；按你的实际年里程修改。"
                  prefix={null}
                  suffix="km"
                  placeholder="15000"
                  value={form.annualMileage}
                  onChange={(v) => setMoney('annualMileage', v)}
                />
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 py-1.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm text-zinc-700 dark:text-zinc-300">能源类型</span>
                  <Tip text="默认跟随购车测算的车辆类型。切换时会重置能耗、保养与车船税为该类型的常见默认值（可再手动修改）。" />
                </div>
                <Segmented
                  className="ml-auto"
                  groupId="own-energy"
                  ariaLabel="能源类型"
                  value={form.energyType}
                  onChange={setEnergyType}
                  options={[
                    { value: 'gas', label: '汽油', icon: Fuel },
                    { value: 'phev', label: '插混', icon: PlugZap },
                    { value: 'bev', label: '纯电', icon: Zap },
                  ]}
                />
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 py-1.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm text-zinc-700 dark:text-zinc-300">城市档位</span>
                  <Tip text="用于快速套用停车费与洗车价的常见默认值：一线约 500 元/月停车，二三线约 300，小城约 150；切换后仍可手动修改。" />
                </div>
                <Segmented
                  className="ml-auto"
                  groupId="own-city"
                  ariaLabel="城市档位"
                  value={form.cityTier}
                  onChange={setCityTier}
                  options={(Object.keys(CITY_PRESETS) as CityTier[]).map((t) => ({
                    value: t,
                    label: CITY_PRESETS[t].label,
                  }))}
                />
              </div>
            </FormSection>

            <FormSection icon={Fuel} title="能源费用">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={form.energyType}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.18, ease: 'easeOut' }}
                  className="divide-y divide-zinc-100 dark:divide-zinc-800/70"
                >
                  {form.energyType === 'gas' && (
                    <>
                      <div className="py-1.5">
                        <LabelInput
                          id="own-fuel-per100"
                          label="油耗"
                          tip="百公里综合油耗（L/100km）。紧凑型家用车约 6-8，中型 SUV 约 8-11；按仪表或加油记录的平均值填写更准。"
                          prefix={null}
                          suffix="L/100km"
                          placeholder="8"
                          value={form.fuelPer100}
                          onChange={(v) => setMoney('fuelPer100', v)}
                        />
                      </div>
                      <div className="py-1.5">
                        <LabelInput
                          id="own-fuel-price"
                          label="油价"
                          tip="92# 全国均价约 8.6 元/L、95# 约 9.2（小熊油耗 2026-10），各地略有差异，按你常用油号的当地价修改。"
                          prefix={null}
                          suffix="元/L"
                          placeholder="8.6"
                          value={form.fuelPrice}
                          onChange={(v) => setMoney('fuelPrice', v)}
                        />
                      </div>
                    </>
                  )}
                  {form.energyType === 'bev' && (
                    <>
                      <div className="py-1.5">
                        <LabelInput
                          id="own-ev-per100"
                          label="电耗"
                          tip="百公里综合电耗（kWh/100km），主流纯电约 12-17，冬季与高速明显更高；按仪表平均值填写更准。"
                          prefix={null}
                          suffix="kWh/100km"
                          placeholder="15"
                          value={form.evPer100}
                          onChange={(v) => setMoney('evPer100', v)}
                        />
                      </div>
                      <div className="py-1.5">
                        <LabelInput
                          id="own-ev-price"
                          label="综合电价"
                          tip="家充谷电约 0.3-0.5 元/度，公共快充电费+服务费综合约 1.0-1.5 元/度（2026 年 3 月起公共桩改市场化浮动定价）；按家充/公充比例估一个综合价。"
                          prefix={null}
                          suffix="元/度"
                          placeholder="0.6"
                          value={form.evPrice}
                          onChange={(v) => setMoney('evPrice', v)}
                        />
                      </div>
                    </>
                  )}
                  {form.energyType === 'phev' && (
                    <>
                      <div className="py-1.5">
                        <LabelInput
                          id="own-phev-fuel"
                          label="馈电油耗"
                          tip="插混在馈电（电量保持）状态下的百公里油耗，主流插混约 4-6 L/100km。"
                          prefix={null}
                          suffix="L/100km"
                          placeholder="5"
                          value={form.phevFuelPer100}
                          onChange={(v) => setMoney('phevFuelPer100', v)}
                        />
                      </div>
                      <div className="py-1.5">
                        <LabelInput
                          id="own-phev-price"
                          label="油价"
                          tip="插混馈电用油，按常用油号当地价修改；92# 全国均价约 8.6 元/L。"
                          prefix={null}
                          suffix="元/L"
                          placeholder="8.6"
                          value={form.fuelPrice}
                          onChange={(v) => setMoney('fuelPrice', v)}
                        />
                      </div>
                      <div className="py-1.5">
                        <LabelInput
                          id="own-phev-share"
                          label="纯电里程占比"
                          tip="日常能充电（如家充）时插混大部分里程用电，常见 50%-80%；只能公共充电或极少充电则填低值。"
                          prefix={null}
                          suffix="%"
                          placeholder="60"
                          value={form.phevEvShare}
                          onChange={(v) => setMoney('phevEvShare', v)}
                        />
                      </div>
                      <div className="py-1.5">
                        <LabelInput
                          id="own-phev-ev-per100"
                          label="纯电电耗"
                          tip="插混纯电模式百公里电耗，因车重偏高约 15-20 kWh/100km。"
                          prefix={null}
                          suffix="kWh/100km"
                          placeholder="18"
                          value={form.phevEvPer100}
                          onChange={(v) => setMoney('phevEvPer100', v)}
                        />
                      </div>
                      <div className="py-1.5">
                        <LabelInput
                          id="own-phev-ev-price"
                          label="纯电电价"
                          tip="插混电池小、家充即可满足，默认按家充谷电约 0.6 元/度。"
                          prefix={null}
                          suffix="元/度"
                          placeholder="0.6"
                          value={form.phevEvPrice}
                          onChange={(v) => setMoney('phevEvPrice', v)}
                        />
                      </div>
                    </>
                  )}
                </motion.div>
              </AnimatePresence>
            </FormSection>

            <FormSection icon={ShieldCheck} title="保险续保与车船税">
              <div className="py-1.5">
                <LabelInput
                  id="own-insurance-base"
                  label="首年保费基数"
                  tip="口径：首年交强险+商业险已计入「购车测算」的落地总价，这里只作为续保的折扣基数。默认带入购车页的交强+商业合计，按实际保单修改。"
                  value={form.insuranceBase}
                  controls={
                    <SyncFromBuyButton
                      onClick={() =>
                        patch({ insuranceBase: String(buyCalc.compulsory + buyCalc.commercial) })
                      }
                    />
                  }
                  onChange={(v) => setMoney('insuranceBase', v)}
                />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-4 py-1.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm text-zinc-700 dark:text-zinc-300">续保模式</span>
                  <Tip text="无赔款优待（NCD）：连续无出险时保费逐年下折——第 2 年约 85 折、第 3 年约 7 折、第 4 年起约 5 折；出险 1 次次年恢复原价。「固定原价」按每年不降测算，适合营运或出险较多情形。" />
                </div>
                <ToggleGroup
                  groupId="own-ins-track"
                  ariaLabel="续保模式"
                  value={form.insuranceTrack}
                  onChange={(insuranceTrack) => patch({ insuranceTrack })}
                  options={[
                    { value: 'ncd', label: '无出险递减' },
                    { value: 'flat', label: '固定原价' },
                  ]}
                />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-4 py-1.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm text-zinc-700 dark:text-zinc-300">出险情景</span>
                  <Tip text="情景假设：第 3 年出险 1 次，第 4 年保费恢复原价，其后重新逐年递减；持有不超过 3 年时无影响。选择「固定原价」时不适用。" />
                </div>
                <ToggleGroup
                  groupId="own-claim"
                  ariaLabel="出险情景"
                  value={form.claimCase}
                  onChange={(claimCase) => patch({ claimCase })}
                  options={[
                    { value: 'clean', label: '连续无出险' },
                    { value: 'once', label: '第3年出险1次', disabled: form.insuranceTrack === 'flat' },
                  ]}
                />
              </div>
              <div className="py-1.5">
                <LabelInput
                  id="own-vessel"
                  label="车船税"
                  tip="随交强险按年代收：1.0-1.6L 约 300-540 元、1.6-2.0L 约 420、2.0-2.5L 约 720（各省不同）；纯电不征收。首年已计入落地总价，这里从第 2 年起计。"
                  value={form.vesselTax}
                  controls={<SyncFromBuyButton onClick={() => patch({ vesselTax: buyForm.vehicleVesselTax })} />}
                  onChange={(v) => setMoney('vesselTax', v)}
                />
              </div>
            </FormSection>

            <FormSection icon={Wrench} title="常规保养">
              <div className="py-1.5">
                <LabelInput
                  id="own-maint-interval"
                  label="保养间隔"
                  tip="常规小保养（机油+机滤）间隔：矿物油 5000 km、全合成 7500-10000 km，按保养手册修改；纯电以检查为主，间隔更长。"
                  prefix={null}
                  suffix="km"
                  placeholder="10000"
                  value={form.maintIntervalKm}
                  onChange={(v) => setMoney('maintIntervalKm', v)}
                />
              </div>
              <div className="py-1.5">
                <LabelInput
                  id="own-maint-price"
                  label="小保养单价"
                  tip="单次常规保养价格：连锁快修约 300-500 元，4S 店约 500-800 元；纯电常规检查+空调滤约 200-400 元。"
                  value={form.maintPrice}
                  onChange={(v) => setMoney('maintPrice', v)}
                />
              </div>
              <div className="py-1.5">
                <LabelInput
                  id="own-major-interval"
                  label="大保养间隔"
                  tip="大保养（空滤、空调滤、火花塞、油液等）间隔约 3-5 万 km；纯电大保养项目少、间隔更长。"
                  prefix={null}
                  suffix="km"
                  placeholder="30000"
                  value={form.majorIntervalKm}
                  onChange={(v) => setMoney('majorIntervalKm', v)}
                />
              </div>
              <div className="py-1.5">
                <LabelInput
                  id="own-major-extra"
                  label="大保养加价"
                  tip="大保养相对小保养的额外费用，油车约 500-1500 元/次，按保养手册项目估。"
                  value={form.majorExtra}
                  onChange={(v) => setMoney('majorExtra', v)}
                />
              </div>
            </FormSection>

            <FormSection icon={CircleDot} title="易损件与维修">
              <div className="py-1.5">
                <LabelInput
                  id="own-tire-price"
                  label="轮胎一套"
                  tip="一套 4 条含安装动平衡。主流家用车约 400-600 元/条；电车自重大、扭矩高，磨损快约 20% 且常用静音胎更贵。"
                  value={form.tireSetPrice}
                  onChange={(v) => setMoney('tireSetPrice', v)}
                />
              </div>
              <div className="py-1.5">
                <LabelInput
                  id="own-tire-interval"
                  label="轮胎更换间隔"
                  tip="轮胎寿命约 5-8 万公里，也受年限（一般 6 年）与侧面裂纹影响，按实际更换里程修改。"
                  prefix={null}
                  suffix="km"
                  placeholder="60000"
                  value={form.tireIntervalKm}
                  onChange={(v) => setMoney('tireIntervalKm', v)}
                />
              </div>
              <div className="py-1.5">
                <LabelInput
                  id="own-brake-price"
                  label="刹车片一套"
                  tip="一套前后刹车片含工时约 400-1200 元，按实际报价修改。"
                  value={form.brakePrice}
                  onChange={(v) => setMoney('brakePrice', v)}
                />
              </div>
              <div className="py-1.5">
                <LabelInput
                  id="own-brake-interval"
                  label="刹车片更换间隔"
                  tip="刹车片寿命约 3-6 万公里，前轮磨损快于后轮；动能回收强的电车刹车片寿命更长。"
                  prefix={null}
                  suffix="km"
                  placeholder="50000"
                  value={form.brakeIntervalKm}
                  onChange={(v) => setMoney('brakeIntervalKm', v)}
                />
              </div>
              <div className="py-1.5">
                <LabelInput
                  id="own-battery-price"
                  label="蓄电池"
                  tip="12V 启动蓄电池（电车为低压辅电瓶）约 400-800 元，寿命约 2-4 年。动力电池属质保大件，不计入易损件。"
                  value={form.batteryPrice}
                  onChange={(v) => setMoney('batteryPrice', v)}
                />
              </div>
              <div className="py-1.5">
                <LabelInput
                  id="own-battery-interval"
                  label="蓄电池更换间隔"
                  prefix={null}
                  suffix="年"
                  placeholder="3"
                  value={form.batteryIntervalYear}
                  onChange={(v) => setMoney('batteryIntervalYear', v)}
                />
              </div>
              <div className="py-1.5">
                <LabelInput
                  id="own-wiper-price"
                  label="雨刮"
                  tip="一对雨刮片约 60-150 元，建议 6-12 个月更换。"
                  value={form.wiperPrice}
                  onChange={(v) => setMoney('wiperPrice', v)}
                />
              </div>
              <div className="py-1.5">
                <LabelInput
                  id="own-wiper-interval"
                  label="雨刮更换间隔"
                  prefix={null}
                  suffix="年"
                  placeholder="1"
                  value={form.wiperIntervalYear}
                  onChange={(v) => setMoney('wiperIntervalYear', v)}
                />
              </div>
              <div className="py-1.5">
                <LabelInput
                  id="own-inspection"
                  label="年检费"
                  tip="非营运小轿车 6 年内免上线检验（每 2 年领标），第 7 年起每年上线一次，检测费约 200-400 元/次，按当地标准修改。"
                  value={form.inspectionFee}
                  onChange={(v) => setMoney('inspectionFee', v)}
                />
              </div>
              <div className="py-1.5">
                <LabelInput
                  id="own-other-repair"
                  label="其他维修预留"
                  tip="灯泡、保险丝、玻璃水、补胎等零星维修与耗材的年均预留，习惯 4S 维修可适当调高。"
                  suffix="/年"
                  value={form.otherRepairYear}
                  onChange={(v) => setMoney('otherRepairYear', v)}
                />
              </div>
            </FormSection>

            <FormSection icon={MapPin} title="停车与杂项">
              <div className="py-1.5">
                <LabelInput
                  id="own-parking"
                  label="停车月费"
                  tip="小区固定月租+外出临停的月均合计：一线约 500+，二三线约 200-400，小城更低甚至为 0。"
                  suffix="/月"
                  value={form.parkingMonth}
                  onChange={(v) => setMoney('parkingMonth', v)}
                />
              </div>
              <div className="py-1.5">
                <LabelInput
                  id="own-wash-price"
                  label="洗车单价"
                  tip="普通洗车约 25-40 元/次，自助洗车更便宜。"
                  suffix="/次"
                  value={form.washPrice}
                  onChange={(v) => setMoney('washPrice', v)}
                />
              </div>
              <div className="py-1.5">
                <LabelInput
                  id="own-wash-times"
                  label="洗车频次"
                  tip="每月洗车次数，常见 1-4 次。"
                  prefix={null}
                  suffix="次/月"
                  placeholder="2"
                  value={form.washTimesMonth}
                  onChange={(v) => setMoney('washTimesMonth', v)}
                />
              </div>
              <div className="py-1.5">
                <LabelInput
                  id="own-toll"
                  label="高速路桥"
                  tip="高速通行、过桥过路费的月均支出，常跑长途明显更高；调查区间约 300-2000 元/年。"
                  suffix="/月"
                  value={form.tollMonth}
                  onChange={(v) => setMoney('tollMonth', v)}
                />
              </div>
              <div className="py-1.5">
                <LabelInput
                  id="own-other"
                  label="其他杂项"
                  tip="代办年检服务费、ETC 押金之外的支出、违章预算等自由预留，无则填 0。"
                  suffix="/月"
                  value={form.otherMonth}
                  onChange={(v) => setMoney('otherMonth', v)}
                />
              </div>
            </FormSection>

            <FormSection icon={TrendingDown} title="折旧参考（可选）">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 py-1.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm text-zinc-700 dark:text-zinc-300">折旧参考行</span>
                  <Tip text="折旧是机会成本而非现金支出，不计入上方用车成本合计；开启后在汇总卡显示预估残值、折旧摊销与全周期净支出。精确的卖车损益请等「卖车损益」模块。" />
                </div>
                <Segmented
                  className="ml-auto"
                  groupId="own-dep"
                  ariaLabel="折旧参考开关"
                  value={form.showDepreciation ? 'on' : 'off'}
                  onChange={(v) => patch({ showDepreciation: v === 'on' })}
                  options={[
                    { value: 'off', label: '不计入' },
                    { value: 'on', label: '显示参考', icon: TrendingDown },
                  ]}
                />
              </div>
              {form.showDepreciation && (
                <div className="py-1.5">
                  <LabelInput
                    id="own-residual"
                    label="预估残值率"
                    tip={`按流通协会保值率曲线自动估算：${energyLabel(form.energyType)}车持有 ${calc.years} 年约 ${autoResidualPct(form.energyType, calc.years)}%；可按二手车平台同款车行情手动修改，点框内按钮恢复自动。`}
                    prefix={null}
                    suffix="%"
                    badge={residualBadge}
                    value={form.residualRatePct ?? String(autoResidualPct(form.energyType, calc.years))}
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
              )}
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
                  {form.energyType === 'gas' ? (
                    <Fuel size={11} strokeWidth={2} aria-hidden />
                  ) : form.energyType === 'phev' ? (
                    <PlugZap size={11} strokeWidth={2} aria-hidden />
                  ) : (
                    <Zap size={11} strokeWidth={2} aria-hidden />
                  )}
                  {energyLabel(form.energyType)} · {calc.years} 年
                </span>
              </div>
              <CompositionBar parts={barParts} />
            </div>

            <div className="divide-y divide-zinc-100 border-t border-zinc-100 px-4 sm:px-9 dark:divide-zinc-800/70 dark:border-zinc-800/70">
              <SummaryGroup icon={Fuel} title="能源">
                <SummaryRow label="每年能源费" tip="按年里程与能耗参数计算的年度能源支出。" value={fmtCNY(calc.energyYear)} />
                <SummaryRow
                  label={`持有期能源费（${calc.totalKm.toLocaleString('zh-CN')} km）`}
                  tip="持有年限内能源费合计。"
                  value={fmtCNY(calc.energyTotal)}
                  tone="strong"
                />
              </SummaryGroup>

              <SummaryGroup icon={ShieldCheck} title="保险与车船税（第 2 年起）">
                {calc.insuranceYears.length > 0 ? (
                  calc.insuranceYears.map((y) => (
                    <SummaryRow
                      key={y.year}
                      label={`第 ${y.year} 年续保`}
                      tip={`保费基数 × NCD 系数 ${y.factor}；首年保费已计入购车落地总价。`}
                      value={fmtCNY(y.premium)}
                    />
                  ))
                ) : (
                  <SummaryRow label="续保" tip="持有 1 年时无续保支出。" value="—" tone="muted" />
                )}
                <SummaryRow
                  label={`车船税 × ${Math.max(0, calc.years - 1)} 年`}
                  tip="首年已计入购车落地总价，从第 2 年起计。"
                  value={fmtCNY(calc.vesselTotal)}
                />
              </SummaryGroup>

              <SummaryGroup icon={Wrench} title="常规保养">
                <SummaryRow
                  label={`小保养 × ${calc.maintSmallCount} 次`}
                  tip="按持有总里程 ÷ 保养间隔折算次数。"
                  value={fmtCNY(calc.maintSmallTotal)}
                />
                <SummaryRow
                  label={`大保养 × ${calc.maintMajorCount} 次`}
                  tip="按持有总里程 ÷ 大保养间隔折算次数，费用为大保养加价部分。"
                  value={fmtCNY(calc.maintMajorTotal)}
                />
                <SummaryRow label="保养合计" value={fmtCNY(calc.maintenanceTotal)} tone="strong" />
              </SummaryGroup>

              <SummaryGroup icon={CircleDot} title="易损件与维修">
                {calc.wearItems.map((it) => (
                  <SummaryRow
                    key={it.key}
                    label={`${it.label} × ${it.count} 次`}
                    value={it.total > 0 ? fmtCNY(it.total) : '—'}
                    tone={it.total > 0 ? 'base' : 'muted'}
                  />
                ))}
                <SummaryRow label="易损合计" value={fmtCNY(calc.wearTotal)} tone="strong" />
              </SummaryGroup>

              <SummaryGroup icon={MapPin} title="停车与杂项">
                {calc.miscParts.map((p) => (
                  <SummaryRow key={p.key} label={p.label} value={p.total > 0 ? fmtCNY(p.total) : '—'} tone={p.total > 0 ? 'base' : 'muted'} />
                ))}
                <SummaryRow label="杂项合计" tip={`月均杂项约 ${fmtCNY(calc.miscMonthly)}。`} value={fmtCNY(calc.miscTotal)} tone="strong" />
              </SummaryGroup>

              {form.showDepreciation && (
                <SummaryGroup icon={TrendingDown} title="折旧参考（非现金支出）">
                  <SummaryRow
                    label={`预估残值（残值率 ${fmtCNY(residualRatePct).replace('¥', '')}%）`}
                    tip={`按购车成交价 ${fmtCNY(buyCalc.taxBase)} × 残值率估算，参考流通协会保值率曲线，可在上方折旧参考区手动修改。`}
                    value={fmtCNY(residual)}
                    tone="minus"
                  />
                  <SummaryRow
                    label={`折旧摊销（年均 ${fmtCNY(depreciation / calc.years)}）`}
                    tip="折旧 = 购车成交价 - 预估残值，属机会成本，不计入用车现金成本。"
                    value={deductCNY(depreciation)}
                    tone="muted"
                  />
                  <SummaryRow
                    label="全周期净支出"
                    tip={`购车落地 ${fmtCNY(buyCalc.total)} + 用车 ${fmtCNY(calc.total)} - 预估残值 ${fmtCNY(residual)}；持有 ${calc.years} 年后卖车情形下的净支出。`}
                    value={fmtCNY(fullNet)}
                    tone="strong"
                  />
                </SummaryGroup>
              )}
            </div>

            <div className="px-4 pb-3 pt-2.5 sm:px-5">
              <div className="rounded-2xl bg-zinc-900 p-3 text-white sm:p-3.5 dark:bg-zinc-100 dark:text-zinc-900">
                <div className="text-[13px] text-zinc-400 dark:text-zinc-500">
                  月均用车成本（{calc.years} 年持有期）
                </div>
                <div className="mt-1 text-base font-semibold leading-tight tracking-tight">
                  <AnimatedAmount value={calc.monthlyAvg} />
                </div>
                <div className="mt-1.5 flex flex-wrap gap-x-3 text-[13px] leading-relaxed tabular-nums text-zinc-400 dark:text-zinc-500">
                  <span>年均 {fmtCNY(calc.yearlyAvg)}</span>
                  <span>每公里 {fmtCNY(calc.perKm)}</span>
                  <span>合计 {fmtCNY(calc.total)}</span>
                </div>
              </div>
              <div className="mt-2 space-y-0.5 text-left text-[13px] leading-relaxed tabular-nums text-zinc-500 dark:text-zinc-400">
                <div>
                  能源 {fmtCNY(calc.energyTotal)} + 险税 {fmtCNY(calc.insuranceTotal + calc.vesselTotal)} + 保养{' '}
                  {fmtCNY(calc.maintenanceTotal)} + 易损 {fmtCNY(calc.wearTotal)} + 杂项 {fmtCNY(calc.miscTotal)}
                </div>
                <div>首年保险与车船税已计入购车落地总价，不重复计算；折旧不计入现金支出。</div>
              </div>
              <p className="relative mt-2 text-center text-[13px] leading-relaxed text-zinc-400 dark:text-zinc-500">
                本测算基于调查均值与用户输入，仅供参考；实际支出以当地报价为准。
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

      {/* 逐年明细：保险递减与保养/易损按里程取整带来的年度波动一目了然 */}
      <section className="mt-5 rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center gap-2 px-4 py-3 text-zinc-500 dark:text-zinc-400 sm:px-5">
          <CalendarDays size={14} strokeWidth={2} aria-hidden />
          <h3 className="text-sm font-medium">逐年成本明细</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-[13px] tabular-nums">
            <thead>
              <tr className="border-t border-zinc-100 text-left text-zinc-400 dark:border-zinc-800/70 dark:text-zinc-500">
                <th className="px-4 py-2 font-normal sm:px-5">年份</th>
                <th className="px-3 py-2 text-right font-normal">能源</th>
                <th className="px-3 py-2 text-right font-normal">保险续保</th>
                <th className="px-3 py-2 text-right font-normal">车船税</th>
                <th className="px-3 py-2 text-right font-normal">保养</th>
                <th className="px-3 py-2 text-right font-normal">易损</th>
                <th className="px-3 py-2 text-right font-normal">杂项</th>
                <th className="px-4 py-2 text-right font-normal sm:px-5">小计</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/70">
              {calc.rows.map((r) => (
                <tr key={r.year} className="text-zinc-600 dark:text-zinc-300">
                  <td className="px-4 py-2 sm:px-5">第 {r.year} 年</td>
                  <td className="px-3 py-2 text-right">{fmtCNY(r.energy)}</td>
                  <td className="px-3 py-2 text-right">
                    {r.insurance > 0 ? fmtCNY(r.insurance) : <span className="text-zinc-300 dark:text-zinc-600">已入落地价</span>}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {r.vessel > 0 ? fmtCNY(r.vessel) : <span className="text-zinc-300 dark:text-zinc-600">—</span>}
                  </td>
                  <td className="px-3 py-2 text-right">{fmtCNY(r.maint)}</td>
                  <td className="px-3 py-2 text-right">{fmtCNY(r.wear)}</td>
                  <td className="px-3 py-2 text-right">{fmtCNY(r.misc)}</td>
                  <td className="px-4 py-2 text-right font-medium text-zinc-900 dark:text-zinc-50 sm:px-5">
                    {fmtCNY(r.total)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-zinc-200 text-zinc-700 dark:border-zinc-800 dark:text-zinc-200">
                <td className="px-4 py-2.5 font-medium sm:px-5">合计</td>
                <td className="px-3 py-2.5 text-right">{fmtCNY(calc.energyTotal)}</td>
                <td className="px-3 py-2.5 text-right">{fmtCNY(calc.insuranceTotal)}</td>
                <td className="px-3 py-2.5 text-right">{fmtCNY(calc.vesselTotal)}</td>
                <td className="px-3 py-2.5 text-right">{fmtCNY(calc.maintenanceTotal)}</td>
                <td className="px-3 py-2.5 text-right">{fmtCNY(calc.wearTotal)}</td>
                <td className="px-3 py-2.5 text-right">{fmtCNY(calc.miscTotal)}</td>
                <td className="px-4 py-2.5 text-right font-semibold text-zinc-900 dark:text-zinc-50 sm:px-5">
                  {fmtCNY(calc.total)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {/* 油电对比：同参数下三种能源方案的月均与每公里成本 */}
      <section className="mt-5 rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex flex-wrap items-center gap-2 px-4 py-3 text-zinc-500 dark:text-zinc-400 sm:px-5">
          <ArrowRightLeft size={14} strokeWidth={2} aria-hidden />
          <h3 className="text-sm font-medium">能源方案对比</h3>
          <span className="text-[13px] text-zinc-400 dark:text-zinc-500">
            能耗与保养取各类型默认值，其余跟随上方输入
          </span>
        </div>
        <div className="grid gap-2 px-4 pb-4 sm:grid-cols-3 sm:px-5">
          {cmp.map((c) => {
            const active = c.key === form.energyType;
            return (
              <div
                key={c.key}
                className={`rounded-xl border p-3 ${
                  active
                    ? 'border-emerald-500/70 bg-emerald-50/60 dark:border-emerald-400/50 dark:bg-emerald-400/5'
                    : 'border-zinc-200 dark:border-zinc-800'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[15px] font-medium text-zinc-800 dark:text-zinc-100">{c.label}</span>
                  {active && (
                    <span className="rounded-full bg-emerald-500/15 px-1.5 py-px text-xs font-medium text-emerald-700 dark:text-emerald-400">
                      当前
                    </span>
                  )}
                </div>
                <div className="mt-1.5 text-[15px] font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
                  {fmtCNY(c.monthlyAvg)}
                  <span className="ml-1 text-[13px] font-normal text-zinc-400 dark:text-zinc-500">/月</span>
                </div>
                <div className="mt-0.5 text-[13px] tabular-nums text-zinc-500 dark:text-zinc-400">
                  每公里 {fmtCNY(c.perKm)}｜{calc.years} 年合计 {fmtCNY(c.total)}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
