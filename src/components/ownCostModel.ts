import { clamp, fmtCNY, num, round2 } from './shared';
import type { BuyForm } from './buyModel';

export const OWN_FORM_KEY = 'carpay:own-form:v1';

export type EnergyType = 'gas' | 'bev' | 'phev';
export type InsuranceTrack = 'ncd' | 'flat';
export type ClaimCase = 'clean' | 'once';
export type CityTier = 'tier1' | 'tier2' | 'tier3';

export interface OwnForm {
  holdYears: string;
  annualMileage: string;
  energyType: EnergyType;
  // 汽油
  fuelPer100: string;
  fuelPrice: string;
  // 纯电
  evPer100: string;
  evPrice: string;
  // 插混（馈电油耗 + 纯电里程占比）
  phevFuelPer100: string;
  phevEvShare: string;
  phevEvPer100: string;
  phevEvPrice: string;
  // 保险续保与车船税
  insuranceBase: string;
  insuranceTrack: InsuranceTrack;
  claimCase: ClaimCase;
  vesselTax: string;
  // 常规保养
  maintIntervalKm: string;
  maintPrice: string;
  majorIntervalKm: string;
  majorExtra: string;
  // 易损件与维修
  tireSetPrice: string;
  tireIntervalKm: string;
  brakePrice: string;
  brakeIntervalKm: string;
  batteryPrice: string;
  batteryIntervalYear: string;
  wiperPrice: string;
  wiperIntervalYear: string;
  otherRepairYear: string;
  inspectionFee: string;
  // 停车与杂项
  cityTier: CityTier;
  parkingMonth: string;
  washPrice: string;
  washTimesMonth: string;
  tollMonth: string;
  otherMonth: string;
  // 折旧参考（默认关闭，残值率 null 表示按曲线自动）
  showDepreciation: boolean;
  residualRatePct: string | null;
}

export interface OwnYearRow {
  year: number;
  energy: number;
  insurance: number;
  vessel: number;
  maint: number;
  wear: number;
  misc: number;
  total: number;
}

export interface WearItem {
  key: string;
  label: string;
  count: number;
  unit: number;
  total: number;
}

export interface OwnCalc {
  years: number;
  annualKm: number;
  totalKm: number;
  energyYear: number;
  energyTotal: number;
  insuranceBase: number;
  insuranceYears: { year: number; factor: number; premium: number }[];
  insuranceTotal: number;
  vesselPerYear: number;
  vesselTotal: number;
  maintSmallCount: number;
  maintSmallTotal: number;
  maintMajorCount: number;
  maintMajorTotal: number;
  maintenanceTotal: number;
  wearItems: WearItem[];
  wearTotal: number;
  miscMonthly: number;
  miscTotal: number;
  miscParts: { key: string; label: string; total: number }[];
  total: number;
  monthlyAvg: number;
  yearlyAvg: number;
  perKm: number;
  rows: OwnYearRow[];
}

export const ENERGY_TYPES: { value: EnergyType; label: string }[] = [
  { value: 'gas', label: '汽油' },
  { value: 'phev', label: '插混' },
  { value: 'bev', label: '纯电' },
];

export const energyLabel = (t: EnergyType): string =>
  t === 'gas' ? '汽油' : t === 'phev' ? '插混' : '纯电';

// 各能源类型的默认能耗/保养参数：切换能源类型时重置相关字段，对比视图也用这套基准
export const ENERGY_PRESETS: Record<EnergyType, Partial<OwnForm>> = {
  gas: {
    fuelPer100: '8',
    fuelPrice: '8.6',
    maintIntervalKm: '10000',
    maintPrice: '500',
    majorIntervalKm: '30000',
    majorExtra: '1000',
    vesselTax: '420',
  },
  phev: {
    phevFuelPer100: '5',
    phevEvShare: '60',
    phevEvPer100: '18',
    phevEvPrice: '0.6',
    maintIntervalKm: '10000',
    maintPrice: '550',
    majorIntervalKm: '30000',
    majorExtra: '1100',
    vesselTax: '420',
  },
  bev: {
    evPer100: '15',
    evPrice: '0.6',
    maintIntervalKm: '15000',
    maintPrice: '300',
    majorIntervalKm: '60000',
    majorExtra: '500',
    vesselTax: '0',
  },
};

export const CITY_PRESETS: Record<CityTier, { label: string; parkingMonth: string; washPrice: string }> = {
  tier1: { label: '一线', parkingMonth: '500', washPrice: '35' },
  tier2: { label: '二三线', parkingMonth: '300', washPrice: '30' },
  tier3: { label: '小城', parkingMonth: '150', washPrice: '25' },
};

// 残值率曲线（index = 持有年数 1-10），参考中国汽车流通协会保值率报告：
// 首年油车约 -18%、新能源约 -25%，其后逐年收窄；超 10 年取末档
const RESIDUAL_CURVES: Record<EnergyType, number[]> = {
  gas: [0.82, 0.7, 0.58, 0.5, 0.44, 0.38, 0.33, 0.29, 0.26, 0.23],
  phev: [0.78, 0.64, 0.52, 0.45, 0.39, 0.34, 0.3, 0.26, 0.23, 0.2],
  bev: [0.75, 0.6, 0.47, 0.4, 0.34, 0.29, 0.25, 0.22, 0.19, 0.17],
};

export function autoResidualPct(energyType: EnergyType, years: number): number {
  const curve = RESIDUAL_CURVES[energyType];
  return round2(curve[clamp(Math.round(years), 1, 10) - 1] * 100);
}

// 无赔款优待（NCD）：连续无出险时第 2 年约 85 折、第 3 年约 7 折、第 4 年起约 5 折；
// 「第 3 年出险 1 次」情景下第 4 年恢复原价，其后重新递减
function ncdFactor(yearIdx: number, track: InsuranceTrack, claim: ClaimCase): number {
  if (track === 'flat') return 1;
  if (claim === 'clean' || yearIdx < 4) {
    return yearIdx === 2 ? 0.85 : yearIdx === 3 ? 0.7 : 0.5;
  }
  if (yearIdx === 4) return 1;
  const reIdx = yearIdx - 3; // 第 5 年起重新递减：5→0.85、6→0.7、7+→0.5
  return reIdx === 2 ? 0.85 : reIdx === 3 ? 0.7 : 0.5;
}

// 里程型项目在第 y 年的发生次数：按累计里程在节点上的增量折算
const kmCountIn = (cumNow: number, cumPrev: number, interval: number): number => {
  if (interval <= 0) return 0;
  return Math.floor(cumNow / interval) - Math.floor(cumPrev / interval);
};

export function computeOwn(f: OwnForm): OwnCalc {
  const years = clamp(Math.round(num(f.holdYears)), 1, 10);
  const annualKm = Math.max(0, num(f.annualMileage));
  const totalKm = annualKm * years;

  const fuelPrice = Math.max(0, num(f.fuelPrice));
  let energyYear: number;
  if (f.energyType === 'gas') {
    energyYear = (annualKm * num(f.fuelPer100)) / 100 * fuelPrice;
  } else if (f.energyType === 'bev') {
    energyYear = (annualKm * num(f.evPer100)) / 100 * Math.max(0, num(f.evPrice));
  } else {
    const share = clamp(num(f.phevEvShare), 0, 100) / 100;
    const evKm = annualKm * share;
    energyYear =
      ((annualKm - evKm) * num(f.phevFuelPer100)) / 100 * fuelPrice +
      (evKm * num(f.phevEvPer100)) / 100 * Math.max(0, num(f.phevEvPrice));
  }
  const energyTotal = energyYear * years;

  // 口径：首年保费与车船税已计入购车落地总价，这里只算第 2 年起的续保与车船税
  const insuranceBase = Math.max(0, num(f.insuranceBase));
  const insuranceYears =
    years >= 2
      ? Array.from({ length: years - 1 }, (_, i) => {
          const year = i + 2;
          const factor = ncdFactor(year, f.insuranceTrack, f.claimCase);
          return { year, factor, premium: round2(insuranceBase * factor) };
        })
      : [];
  const insuranceTotal = round2(insuranceYears.reduce((a, y) => a + y.premium, 0));

  const vesselPerYear = Math.max(0, num(f.vesselTax));
  const vesselTotal = vesselPerYear * Math.max(0, years - 1);

  const maintInterval = Math.max(1, num(f.maintIntervalKm));
  const maintPrice = Math.max(0, num(f.maintPrice));
  const majorInterval = Math.max(1, num(f.majorIntervalKm));
  const majorExtra = Math.max(0, num(f.majorExtra));
  const maintSmallCount = Math.floor(totalKm / maintInterval);
  const maintMajorCount = Math.floor(totalKm / majorInterval);
  const maintSmallTotal = maintSmallCount * maintPrice;
  const maintMajorTotal = maintMajorCount * majorExtra;
  const maintenanceTotal = maintSmallTotal + maintMajorTotal;

  const tireInterval = Math.max(1, num(f.tireIntervalKm));
  const brakeInterval = Math.max(1, num(f.brakeIntervalKm));
  const batteryInterval = Math.max(1, num(f.batteryIntervalYear));
  const wiperInterval = Math.max(1, num(f.wiperIntervalYear));
  const inspectionFee = Math.max(0, num(f.inspectionFee));
  const otherRepairYear = Math.max(0, num(f.otherRepairYear));
  const wearItems: WearItem[] = [
    {
      key: 'tire',
      label: '轮胎',
      count: Math.floor(totalKm / tireInterval),
      unit: Math.max(0, num(f.tireSetPrice)),
      total: 0,
    },
    {
      key: 'brake',
      label: '刹车片',
      count: Math.floor(totalKm / brakeInterval),
      unit: Math.max(0, num(f.brakePrice)),
      total: 0,
    },
    {
      key: 'battery',
      label: '蓄电池',
      count: Math.floor(years / batteryInterval),
      unit: Math.max(0, num(f.batteryPrice)),
      total: 0,
    },
    {
      key: 'wiper',
      label: '雨刮',
      count: Math.floor(years / wiperInterval),
      unit: Math.max(0, num(f.wiperPrice)),
      total: 0,
    },
    {
      key: 'inspection',
      label: '年检',
      count: Math.max(0, years - 6),
      unit: inspectionFee,
      total: 0,
    },
    {
      key: 'other',
      label: '其他维修预留',
      count: years,
      unit: otherRepairYear,
      total: 0,
    },
  ].map((it) => ({ ...it, total: round2(it.count * it.unit) }));
  const wearTotal = round2(wearItems.reduce((a, it) => a + it.total, 0));

  const washTimes = Math.max(0, num(f.washTimesMonth));
  const miscParts = [
    { key: 'parking', label: '停车', total: Math.max(0, num(f.parkingMonth)) * 12 * years },
    { key: 'wash', label: '洗车', total: Math.max(0, num(f.washPrice)) * washTimes * 12 * years },
    { key: 'toll', label: '高速路桥', total: Math.max(0, num(f.tollMonth)) * 12 * years },
    { key: 'other', label: '其他', total: Math.max(0, num(f.otherMonth)) * 12 * years },
  ];
  const miscMonthly = miscParts.reduce((a, p) => a + p.total, 0) / (12 * years || 1);
  const miscTotal = round2(miscParts.reduce((a, p) => a + p.total, 0));

  const rows: OwnYearRow[] = Array.from({ length: years }, (_, i) => {
    const year = i + 1;
    const cumNow = annualKm * year;
    const cumPrev = annualKm * (year - 1);
    const insurance = insuranceYears.find((y) => y.year === year)?.premium ?? 0;
    const vessel = year >= 2 ? vesselPerYear : 0;
    const maint =
      (kmCountIn(cumNow, cumPrev, maintInterval) * maintPrice +
        kmCountIn(cumNow, cumPrev, majorInterval) * majorExtra);
    const wear =
      kmCountIn(cumNow, cumPrev, tireInterval) * wearItems[0].unit +
      kmCountIn(cumNow, cumPrev, brakeInterval) * wearItems[1].unit +
      (Math.floor(year / batteryInterval) - Math.floor((year - 1) / batteryInterval)) *
        wearItems[2].unit +
      (Math.floor(year / wiperInterval) - Math.floor((year - 1) / wiperInterval)) *
        wearItems[3].unit +
      (year >= 7 ? inspectionFee : 0) +
      otherRepairYear;
    const misc = miscMonthly * 12;
    const rowTotal = energyYear + insurance + vessel + maint + round2(wear) + misc;
    return {
      year,
      energy: round2(energyYear),
      insurance,
      vessel,
      maint: round2(maint),
      wear: round2(wear),
      misc: round2(misc),
      total: round2(rowTotal),
    };
  });

  const total = round2(energyTotal + insuranceTotal + vesselTotal + maintenanceTotal + wearTotal + miscTotal);
  const months = 12 * years;

  return {
    years,
    annualKm,
    totalKm,
    energyYear: round2(energyYear),
    energyTotal: round2(energyTotal),
    insuranceBase,
    insuranceYears,
    insuranceTotal,
    vesselPerYear,
    vesselTotal,
    maintSmallCount,
    maintSmallTotal: round2(maintSmallTotal),
    maintMajorCount,
    maintMajorTotal: round2(maintMajorTotal),
    maintenanceTotal: round2(maintenanceTotal),
    wearItems,
    wearTotal,
    miscMonthly: round2(miscMonthly),
    miscTotal,
    miscParts: miscParts.map((p) => ({ ...p, total: round2(p.total) })),
    total,
    monthlyAvg: round2(total / months),
    yearlyAvg: round2(total / years),
    perKm: totalKm > 0 ? round2(total / totalKm) : 0,
    rows,
  };
}

// 累计用车成本（支持卖出月份粒度）：yearFrac = 持有年数，可为小数（2.5 = 第 3 年年中卖出）。
// 口径：保险与车船税按保单年整年计（卖出年保费已缴，退保回收由卖车模块按 lastPremium 另算），
// 能源/杂项/其他维修按月折算，保养与易损件按累计里程节点计次；整年时与 computeOwn(holdYears) 完全一致
export function ownCostCumulative(f: OwnForm, yearFrac: number): { total: number; lastPremium: number } {
  const yf = clamp(yearFrac, 0, 10);
  if (yf <= 0) return { total: 0, lastPremium: 0 };
  const fullYears = Math.floor(yf + 1e-9);
  const frac = yf - fullYears;
  const insuranceBase = Math.max(0, num(f.insuranceBase));
  // 卖出时在保的保单年：整年卖出即第 fullYears 年保单，年中卖出即下一年保单；首年保费已计入购车落地价
  const activeYear = fullYears + (frac > 0 ? 1 : 0);
  const lastPremium = round2(
    insuranceBase * (activeYear <= 1 ? 1 : ncdFactor(activeYear, f.insuranceTrack, f.claimCase)),
  );
  const full = fullYears > 0 ? computeOwn({ ...f, holdYears: String(fullYears) }).total : 0;
  if (frac <= 0) return { total: round2(full), lastPremium };

  const annualKm = Math.max(0, num(f.annualMileage));
  const year = fullYears + 1;
  const cumPrev = annualKm * fullYears;
  const cumNow = annualKm * yf;
  const row = computeOwn({ ...f, holdYears: String(clamp(year, 1, 10)) }).rows[year - 1];
  const maint =
    kmCountIn(cumNow, cumPrev, Math.max(1, num(f.maintIntervalKm))) * Math.max(0, num(f.maintPrice)) +
    kmCountIn(cumNow, cumPrev, Math.max(1, num(f.majorIntervalKm))) * Math.max(0, num(f.majorExtra));
  const batteryDiv = Math.max(1, num(f.batteryIntervalYear));
  const wiperDiv = Math.max(1, num(f.wiperIntervalYear));
  const wear =
    kmCountIn(cumNow, cumPrev, Math.max(1, num(f.tireIntervalKm))) * Math.max(0, num(f.tireSetPrice)) +
    kmCountIn(cumNow, cumPrev, Math.max(1, num(f.brakeIntervalKm))) * Math.max(0, num(f.brakePrice)) +
    (Math.floor(yf / batteryDiv) - Math.floor(fullYears / batteryDiv)) * Math.max(0, num(f.batteryPrice)) +
    (Math.floor(yf / wiperDiv) - Math.floor(fullYears / wiperDiv)) * Math.max(0, num(f.wiperPrice)) +
    (year >= 7 ? Math.max(0, num(f.inspectionFee)) : 0);
  const partial =
    row.energy * frac + // 能源按月折算
    row.insurance + // 卖出年保费已整年缴纳，退保回收单列
    row.vessel +
    round2(maint) +
    round2(wear) +
    row.misc * frac + // 停车/洗车/路桥按月折算
    Math.max(0, num(f.otherRepairYear)) * frac; // 其他维修预留按月折算
  return { total: round2(full + partial), lastPremium };
}

export interface CompareItem {
  key: EnergyType;
  label: string;
  monthlyAvg: number;
  yearlyAvg: number;
  perKm: number;
  total: number;
}

// 油/插混/电对比：能耗与保养用各类型默认值，其余（年限、里程、保险、杂项等）跟随用户输入
export function compareOwn(f: OwnForm): CompareItem[] {
  return ENERGY_TYPES.map(({ value, label }) => {
    const variant = { ...f, ...ENERGY_PRESETS[value], energyType: value } as OwnForm;
    const c = computeOwn(variant);
    return { key: value, label, monthlyAvg: c.monthlyAvg, yearlyAvg: c.yearlyAvg, perKm: c.perKm, total: c.total };
  });
}

export const DEFAULT_OWN_FORM: OwnForm = {
  holdYears: '3',
  annualMileage: '15000',
  energyType: 'gas',
  fuelPer100: '8',
  fuelPrice: '8.6',
  evPer100: '15',
  evPrice: '0.6',
  phevFuelPer100: '5',
  phevEvShare: '60',
  phevEvPer100: '18',
  phevEvPrice: '0.6',
  insuranceBase: '4450',
  insuranceTrack: 'ncd',
  claimCase: 'clean',
  vesselTax: '420',
  maintIntervalKm: '10000',
  maintPrice: '500',
  majorIntervalKm: '30000',
  majorExtra: '1000',
  tireSetPrice: '2000',
  tireIntervalKm: '60000',
  brakePrice: '800',
  brakeIntervalKm: '50000',
  batteryPrice: '600',
  batteryIntervalYear: '3',
  wiperPrice: '100',
  wiperIntervalYear: '1',
  otherRepairYear: '500',
  inspectionFee: '300',
  cityTier: 'tier2',
  parkingMonth: '300',
  washPrice: '30',
  washTimesMonth: '2',
  tollMonth: '200',
  otherMonth: '0',
  showDepreciation: false,
  residualRatePct: null,
};

// 首次进入且无本地存档时，默认值跟随购车测算的车辆类型、保费与车船税
export function loadOwnForm(buy: BuyForm): OwnForm {
  const d: OwnForm = {
    ...DEFAULT_OWN_FORM,
    energyType: buy.vehicleType === 'fuel' ? 'gas' : 'bev',
    ...ENERGY_PRESETS[buy.vehicleType === 'fuel' ? 'gas' : 'bev'],
    insuranceBase: String(
      Math.round((num(buy.compulsoryInsurance) + num(buy.commercialInsurance)) * 100) / 100,
    ),
    vesselTax: buy.vehicleVesselTax,
  };
  try {
    const raw = localStorage.getItem(OWN_FORM_KEY);
    if (!raw) return d;
    const p = JSON.parse(raw) as Record<string, unknown>;
    const s = (k: keyof OwnForm): string | null => (typeof p[k] === 'string' ? (p[k] as string) : null);
    return {
      ...d,
      holdYears: s('holdYears') ?? d.holdYears,
      annualMileage: s('annualMileage') ?? d.annualMileage,
      energyType:
        p.energyType === 'gas' || p.energyType === 'phev' || p.energyType === 'bev'
          ? p.energyType
          : d.energyType,
      fuelPer100: s('fuelPer100') ?? d.fuelPer100,
      fuelPrice: s('fuelPrice') ?? d.fuelPrice,
      evPer100: s('evPer100') ?? d.evPer100,
      evPrice: s('evPrice') ?? d.evPrice,
      phevFuelPer100: s('phevFuelPer100') ?? d.phevFuelPer100,
      phevEvShare: s('phevEvShare') ?? d.phevEvShare,
      phevEvPer100: s('phevEvPer100') ?? d.phevEvPer100,
      phevEvPrice: s('phevEvPrice') ?? d.phevEvPrice,
      insuranceBase: s('insuranceBase') ?? d.insuranceBase,
      insuranceTrack: p.insuranceTrack === 'flat' ? 'flat' : 'ncd',
      claimCase: p.claimCase === 'once' ? 'once' : 'clean',
      vesselTax: s('vesselTax') ?? d.vesselTax,
      maintIntervalKm: s('maintIntervalKm') ?? d.maintIntervalKm,
      maintPrice: s('maintPrice') ?? d.maintPrice,
      majorIntervalKm: s('majorIntervalKm') ?? d.majorIntervalKm,
      majorExtra: s('majorExtra') ?? d.majorExtra,
      tireSetPrice: s('tireSetPrice') ?? d.tireSetPrice,
      tireIntervalKm: s('tireIntervalKm') ?? d.tireIntervalKm,
      brakePrice: s('brakePrice') ?? d.brakePrice,
      brakeIntervalKm: s('brakeIntervalKm') ?? d.brakeIntervalKm,
      batteryPrice: s('batteryPrice') ?? d.batteryPrice,
      batteryIntervalYear: s('batteryIntervalYear') ?? d.batteryIntervalYear,
      wiperPrice: s('wiperPrice') ?? d.wiperPrice,
      wiperIntervalYear: s('wiperIntervalYear') ?? d.wiperIntervalYear,
      otherRepairYear: s('otherRepairYear') ?? d.otherRepairYear,
      inspectionFee: s('inspectionFee') ?? d.inspectionFee,
      cityTier:
        p.cityTier === 'tier1' || p.cityTier === 'tier2' || p.cityTier === 'tier3'
          ? p.cityTier
          : d.cityTier,
      parkingMonth: s('parkingMonth') ?? d.parkingMonth,
      washPrice: s('washPrice') ?? d.washPrice,
      washTimesMonth: s('washTimesMonth') ?? d.washTimesMonth,
      tollMonth: s('tollMonth') ?? d.tollMonth,
      otherMonth: s('otherMonth') ?? d.otherMonth,
      showDepreciation: typeof p.showDepreciation === 'boolean' ? p.showDepreciation : d.showDepreciation,
      residualRatePct:
        p.residualRatePct === undefined
          ? d.residualRatePct
          : typeof p.residualRatePct === 'string'
            ? p.residualRatePct
            : null,
    };
  } catch {
    return d;
  }
}

export interface OwnTextCtx {
  vehicleName: string;
  buyTotal: number;
  buyTaxBase: number;
  residual: {
    ratePct: number;
    residual: number;
    depreciation: number;
    yearlyDepreciation: number;
    fullNet: number;
  } | null;
}

export function buildOwnDetailText(f: OwnForm, c: OwnCalc, ctx: OwnTextCtx): string {
  const money = (n: number) => fmtCNY(n);
  const pct = (n: number) => `${round2(n)}%`;
  const lines: string[] = [
    'CarPay · 用车成本测算明细',
    `车辆：${ctx.vehicleName}（${energyLabel(f.energyType)}｜持有 ${c.years} 年·年行驶 ${c.annualKm.toLocaleString('zh-CN')} km）`,
    '',
    '【口径】首年保险与车船税已计入购车落地总价，本明细仅计第 2 年起的续保与车船税；折旧为机会成本，不计入现金支出。',
    '',
    '【能源】',
    f.energyType === 'gas'
      ? `油耗 ${f.fuelPer100} L/100km × 油价 ${f.fuelPrice} 元/L：${money(c.energyYear)}/年`
      : f.energyType === 'bev'
        ? `电耗 ${f.evPer100} kWh/100km × 电价 ${f.evPrice} 元/度：${money(c.energyYear)}/年`
        : `馈电油耗 ${f.phevFuelPer100} L/100km + 纯电占比 ${f.phevEvShare}%（${f.phevEvPer100} kWh/100km × ${f.phevEvPrice} 元/度）：${money(c.energyYear)}/年`,
    `持有期能源费：${money(c.energyTotal)}（${c.totalKm.toLocaleString('zh-CN')} km）`,
    '',
    '【保险续保（第 2 年起）】',
    ...c.insuranceYears.map((y) => `第 ${y.year} 年：${money(y.premium)}（NCD 系数 ${y.factor}）`),
    `续保合计：${money(c.insuranceTotal)}`,
    '',
    '【车船税（第 2 年起）】',
    `${money(c.vesselPerYear)}/年 × ${Math.max(0, c.years - 1)} 年 = ${money(c.vesselTotal)}`,
    '',
    '【常规保养】',
    `小保养：${c.maintSmallCount} 次 × ${money(c.maintSmallTotal / (c.maintSmallCount || 1))} = ${money(c.maintSmallTotal)}`,
    `大保养：${c.maintMajorCount} 次 × ${money(c.maintMajorTotal / (c.maintMajorCount || 1))} = ${money(c.maintMajorTotal)}`,
    `保养合计：${money(c.maintenanceTotal)}`,
    '',
    '【易损件与维修】',
    ...c.wearItems.map((it) => `${it.label}：${it.count} 次 × ${money(it.unit)} = ${money(it.total)}`),
    `易损合计：${money(c.wearTotal)}`,
    '',
    '【停车与杂项】',
    ...c.miscParts.map((p) => `${p.label}：${money(p.total)}`),
    `杂项合计：${money(c.miscTotal)}（约 ${money(c.miscMonthly)}/月）`,
    '',
    '──────────────',
    `持有期总成本：${money(c.total)}`,
    `月均：${money(c.monthlyAvg)}｜年均：${money(c.yearlyAvg)}｜每公里：${money(c.perKm)}`,
  ];
  if (ctx.residual) {
    lines.push(
      '',
      '【折旧参考（机会成本，非现金支出）】',
      `残值率 ${pct(ctx.residual.ratePct)} → 预估残值 ${money(ctx.residual.residual)}`,
      `折旧合计 ${money(ctx.residual.depreciation)}（年均 ${money(ctx.residual.yearlyDepreciation)}）`,
      `全周期净支出 = 购车落地 ${money(ctx.buyTotal)} + 用车 ${money(c.total)} - 残值 ${money(ctx.residual.residual)} = ${money(ctx.residual.fullNet)}`,
    );
  }
  lines.push(
    '',
    `生成时间：${new Date().toLocaleString('zh-CN', { hour12: false })}`,
    '由 CarPay 纯前端离线计算生成，仅供参考。',
  );
  return lines.join('\n');
}

export const OWN_SOURCES: { label: string; url: string }[] = [
  { label: '车险 NCD 系数规则', url: 'https://www.pingan.com/official/strategyDetail/27985424' },
  { label: '保养周期参考', url: 'https://zhuanlan.zhihu.com/p/502488045' },
  { label: '今日油价·小熊油耗', url: 'https://www.xiaoxiongyouhao.com/fprice' },
  { label: '2026 充电成本与定价', url: 'https://auto.sina.cn/2026-09-28/detail-initkpex8528436.d.html' },
  { label: '流通协会保值率报告', url: 'https://www.cadcc.com.cn/article/3591.html' },
  { label: '车船税分档标准', url: 'https://shanghai.chinatax.gov.cn/zcfw/zcjd/202607/t480874.html' },
];
