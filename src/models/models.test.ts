import { describe, expect, it } from 'vitest';
import { round2 } from '../components/shared';
import { computeBuy, DEFAULT_BUY_FORM, fixedInterestTotal, stateSubsidyAmount, type BuyForm } from './buyModel';
import { autoResidualPctAt, computeOwn, DEFAULT_OWN_FORM, ownCostCumulative, type OwnForm } from './ownCostModel';
import { computeSell, DEFAULT_SELL_FORM, salePeriodText, type SellForm } from './sellModel';

// 模型测试用「无贴息」干净基线，避免 UI 默认政策贴息污染各口径断言；
// 需要贴息的用例显式传 stateInterestSubsidy 覆盖
const buy = (p: Partial<BuyForm>): BuyForm => ({ ...DEFAULT_BUY_FORM, stateInterestSubsidy: '', ...p });
const own = (p: Partial<OwnForm>): OwnForm => ({ ...DEFAULT_OWN_FORM, ...p });
const sell = (p: Partial<SellForm>): SellForm => ({ ...DEFAULT_SELL_FORM, ...p });

describe('购车测算', () => {
  it('全款默认口径', () => {
    const c = computeBuy(DEFAULT_BUY_FORM);
    expect(c.dealPrice).toBe(135000);
    expect(c.taxBase).toBe(135000);
    expect(c.purchaseTax).toBe(11946.9);
    expect(c.total).toBe(151941.9);
    expect(c.fullTotal).toBe(151941.9);
  });

  it('2026 新能源默认减半：插混含车船税、纯电免车船税', () => {
    const phev = computeBuy(buy({ vehicleType: 'phev', taxRateMode: 'half', vehicleVesselTax: '420' }));
    const bev = computeBuy(buy({ vehicleType: 'nev', taxRateMode: 'half', vehicleVesselTax: '0' }));
    expect(phev.purchaseTax).toBe(5973.45);
    expect(phev.vessel).toBe(420);
    expect(phev.total).toBe(145968.45);
    expect(bev.purchaseTax).toBe(5973.45);
    expect(bev.vessel).toBe(0);
    expect(bev.total).toBe(145548.45);
  });

  it('计税口径可与成交价分离', () => {
    const dealerOff = computeBuy(buy({ taxDealer: false }));
    expect(dealerOff.dealPrice).toBe(135000);
    expect(dealerOff.taxBase).toBe(140000);
    expect(dealerOff.total).toBe(152384.38);

    const rebateOff = computeBuy(
      buy({ paymentMode: 'finance', loanRebate: '5000', taxRebate: false }),
    );
    expect(rebateOff.dealPrice).toBe(130000);
    expect(rebateOff.taxBase).toBe(135000);
    expect(rebateOff.down + rebateOff.principal).toBe(130000);
  });

  it('其他优惠直接抵扣落地总价，不影响成交价与计税基数', () => {
    const c = computeBuy(buy({ otherDiscount: '3000' }));
    expect(c.otherDiscount).toBe(3000);
    expect(c.dealPrice).toBe(135000);
    expect(c.taxBase).toBe(135000);
    expect(c.total).toBe(148941.9);
  });

  it('等额本息/免息/提前结清', () => {
    const finance = computeBuy(
      buy({ paymentMode: 'finance', downPaymentPct: '30', months: 36, annualRatePct: '3.25' }),
    );
    expect(finance.monthly).toBe(2758.6);
    expect(finance.interest).toBe(4809.6);
    expect(finance.down + finance.principal).toBe(finance.dealPrice);
    expect(finance.total).toBe(156751.5);
    const free = computeBuy(
      buy({ paymentMode: 'finance', months: 60, freeMonths: 24, annualRatePct: '3.25' }),
    );
    expect(free.interest).toBe(2828.4);

    const early = computeBuy(
      buy({ paymentMode: 'finance', months: 36, earlyRepayMonth: 12, earlyRepayFee: '800', annualRatePct: '3.25' }),
    );
    expect(early.settleAmount).toBe(64016.64);
    expect(early.interest).toBe(2619.84);
    expect(early.total).toBe(155361.74);
  });

  it('固定利息按费用均摊：月供 =（本金+利息）÷期数，提前结清按已计息期计提', () => {
    // 用户场景：本金 10 万，年利息 2500，60 期，第 24 期结清 → 利息 = 2500 × 2 年 = 5000
    const c = computeBuy(
      buy({
        paymentMode: 'mortgage',
        loanAmount: '100000',
        months: 60,
        interestMode: 'fixedFee',
        fixedInterest: '2500',
        fixedInterestUnit: 'yearly',
        earlyRepayMonth: 24,
      }),
    );
    expect(c.principal).toBe(100000);
    // 全期利息 12500，月供 = 112500 / 60 = 1875
    expect(c.monthly).toBe(1875);
    // 第 24 期结清：已过 24 个计息月 = 2 年，计提利息 = 2500 × 2 = 5000
    expect(c.interest).toBe(5000);
    // 结清余额 = 100000 + 5000 − 1875 × 24 = 60000
    expect(c.settleAmount).toBe(60000);
    expect(c.totalRepay).toBe(105000);
    // 不提前：利息恰为全期 12500
    const full = computeBuy(
      buy({ paymentMode: 'mortgage', loanAmount: '100000', months: 60, interestMode: 'fixedFee', fixedInterest: '2500', fixedInterestUnit: 'yearly' }),
    );
    expect(full.interest).toBe(12500);
    expect(full.totalRepay).toBe(112500);
    // 免息 12 期：全期费用折算 = 2500 × 48/12 = 10000，
    // 月供 = (100000 + 10000)/60 = 1833.33；第 24 期结清已过 12 个计息月，计提 2500
    const withFree = computeBuy(
      buy({ paymentMode: 'mortgage', loanAmount: '100000', months: 60, freeMonths: 12, interestMode: 'fixedFee', fixedInterest: '2500', fixedInterestUnit: 'yearly', earlyRepayMonth: 24 }),
    );
    expect(withFree.monthly).toBe(1833.33);
    expect(withFree.interest).toBe(2500);
  });

  it('固定利息按月/年报价折算为全期总利息，三种单位口径一致', () => {
    // 36 期无免息：月 100 → 总共 3600；年 1200 → 总共 3600，月供一致
    const monthly = computeBuy(
      buy({ paymentMode: 'finance', downPaymentPct: '30', months: 36, interestMode: 'fixedFee', fixedInterest: '100', fixedInterestUnit: 'monthly' }),
    );
    const yearly = computeBuy(
      buy({ paymentMode: 'finance', downPaymentPct: '30', months: 36, interestMode: 'fixedFee', fixedInterest: '1200', fixedInterestUnit: 'yearly' }),
    );
    const total = computeBuy(
      buy({ paymentMode: 'finance', downPaymentPct: '30', months: 36, interestMode: 'fixedFee', fixedInterest: '3600', fixedInterestUnit: 'total' }),
    );
    expect(monthly.interest).toBe(3600);
    expect(yearly.interest).toBe(3600);
    expect(total.interest).toBe(3600);
    expect(monthly.monthly).toBe(yearly.monthly);
    expect(monthly.monthly).toBe(total.monthly);

    // 免息 12 期：计息期数 24，月 100 → 2400（免息期不计息），月供 =(本金+2400)/36
    const freeMonthly = computeBuy(
      buy({ paymentMode: 'finance', downPaymentPct: '30', months: 36, freeMonths: 12, interestMode: 'fixedFee', fixedInterest: '100', fixedInterestUnit: 'monthly' }),
    );
    expect(freeMonthly.interest).toBe(2400);
    expect(fixedInterestTotal(100, 'monthly', 36, 12)).toBe(2400);
  });

  it('财政贴息默认选中 1% 政策口径', () => {
    const policy = stateSubsidyAmount(DEFAULT_BUY_FORM.months).amount;
    expect(policy).toBe(1500); // 默认 36 期 = 3 年
    expect(DEFAULT_BUY_FORM.stateInterestSubsidy).toBe(String(policy));
    // 切到贷款后默认值即按政策抵扣落地总价；全款不计贴息
    const finance = computeBuy({ ...DEFAULT_BUY_FORM, paymentMode: 'finance' });
    const noSubsidy = computeBuy({
      ...DEFAULT_BUY_FORM,
      paymentMode: 'finance',
      stateInterestSubsidy: '',
    });
    expect(finance.stateSubsidy).toBe(policy);
    expect(finance.total).toBe(noSubsidy.total - policy);
    expect(computeBuy(DEFAULT_BUY_FORM).stateSubsidy).toBe(0);
  });

  it('财政贴息独立抵扣落地总价，利息总额保持实际利息不扣减', () => {
    const base = computeBuy(
      buy({ paymentMode: 'finance', downPaymentPct: '30', months: 36, annualRatePct: '3.25' }),
    );
    const subsidized = computeBuy(
      buy({
        paymentMode: 'finance',
        downPaymentPct: '30',
        months: 36,
        annualRatePct: '3.25',
        stateInterestSubsidy: '400',
      }),
    );
    expect(subsidized.monthly).toBe(base.monthly);
    expect(subsidized.stateSubsidy).toBe(400);
    // 利息总额不扣减贴息，保持结清前实际利息
    expect(subsidized.interest).toBe(base.interest);
    // 贴息直接冲减落地总价
    expect(subsidized.total).toBe(base.total - 400);

    // 财金〔2025〕80号：贴息基数上限 5 万 × 年贴息 1% × 贷款年限，累计封顶 3000 元
    // 即便贷款远超 5 万，也只按 5 万基数计
    expect(stateSubsidyAmount(36).amount).toBe(1500);
    expect(stateSubsidyAmount(60).amount).toBe(2500);
    expect(stateSubsidyAmount(6).amount).toBe(250);
    // 超长期封顶 3000（10 年时理论上 5000，被 3000 封顶）
    expect(stateSubsidyAmount(120).amount).toBe(3000);

    // 提前结清时贴息不超过实际利息（界面层负责按实际还款期数折算输入值）
    const earlyLow = computeBuy(
      buy({
        paymentMode: 'finance',
        downPaymentPct: '30',
        months: 36,
        earlyRepayMonth: 1,
        earlyRepayFee: '0',
        stateInterestSubsidy: '138.89',
      }),
    );
    expect(earlyLow.stateSubsidy).toBe(138.89);
    // 利息总额 = 结清前实际利息 255.94，不扣贴息
    expect(earlyLow.interest).toBe(255.94);
    // 落地总价中贴息抵扣：贴息 400 > 第 1 期实际利息 255.94，被利息封顶 → total 差 255.94
    const with400 = computeBuy(
      buy({ paymentMode: 'finance', downPaymentPct: '30', months: 36, earlyRepayMonth: 1, earlyRepayFee: '0', stateInterestSubsidy: '400' }),
    );
    const without400 = computeBuy(
      buy({ paymentMode: 'finance', downPaymentPct: '30', months: 36, earlyRepayMonth: 1, earlyRepayFee: '0' }),
    );
    expect(with400.stateSubsidy).toBe(255.94);
    expect(with400.total).toBeCloseTo(without400.total - 255.94, 2);

    // 输入超过实际利息时贴息按利息封顶，利息总额仍不扣减
    const overCap = computeBuy(
      buy({
        paymentMode: 'finance',
        downPaymentPct: '30',
        months: 36,
        earlyRepayMonth: 1,
        earlyRepayFee: '0',
        stateInterestSubsidy: '5000',
      }),
    );
    expect(overCap.stateSubsidy).toBeCloseTo(overCap.totalRepay - overCap.principal, 2);
    expect(overCap.interest).toBeCloseTo(overCap.totalRepay - overCap.principal, 2);
  });

  it('还款方式：等额本金首期最高逐月递减，总利息少于等额本息', () => {
    const c = computeBuy(
      buy({ paymentMode: 'finance', downPaymentPct: '30', months: 36, annualRatePct: '3.25', repayMode: 'equalPrincipal' }),
    );
    // 本金 = 135000 × 70% = 94500；每月本金 2625 + 首期利息 255.94，末期利息仅 7.11
    expect(c.monthly).toBe(2880.94);
    expect(c.lastMonthly).toBe(2632.11);
    expect(c.interest).toBe(4734.84);
    // 第 12 期结清：剩余本金 = 63000，已计提利息 2602.03
    const early = computeBuy(
      buy({ paymentMode: 'finance', downPaymentPct: '30', months: 36, annualRatePct: '3.25', repayMode: 'equalPrincipal', earlyRepayMonth: 12 }),
    );
    expect(early.settleAmount).toBe(63000);
    expect(early.interest).toBe(2602.03);
  });

  it('还款方式：先息后本每期付息、到期一次还本', () => {
    const c = computeBuy(
      buy({ paymentMode: 'finance', downPaymentPct: '30', months: 36, annualRatePct: '3.25', repayMode: 'bullet' }),
    );
    expect(c.monthly).toBe(255.94);
    expect(c.interest).toBe(9213.75);
    expect(c.settleAmount).toBe(0);
    // 第 12 期结清：余额即全部本金，利息 = 12 期
    const early = computeBuy(
      buy({ paymentMode: 'finance', downPaymentPct: '30', months: 36, annualRatePct: '3.25', repayMode: 'bullet', earlyRepayMonth: 12 }),
    );
    expect(early.settleAmount).toBe(94500);
    expect(early.interest).toBe(3071.25);
    // 免息期：先息后本免息期内利息为 0
    const withFree = computeBuy(
      buy({ paymentMode: 'finance', downPaymentPct: '30', months: 36, annualRatePct: '3.25', repayMode: 'bullet', freeMonths: 12 }),
    );
    expect(withFree.interest).toBe(6142.5);
  });

  it('还款方式对固定利息模式无影响（一口价均摊，月供不变）', () => {
    const fee = computeBuy(
      buy({ paymentMode: 'mortgage', loanAmount: '100000', months: 60, interestMode: 'fixedFee', fixedInterest: '2500', fixedInterestUnit: 'yearly', repayMode: 'annuity' }),
    );
    const feeEp = computeBuy(
      buy({ paymentMode: 'mortgage', loanAmount: '100000', months: 60, interestMode: 'fixedFee', fixedInterest: '2500', fixedInterestUnit: 'yearly', repayMode: 'equalPrincipal' }),
    );
    const feeBullet = computeBuy(
      buy({ paymentMode: 'mortgage', loanAmount: '100000', months: 60, interestMode: 'fixedFee', fixedInterest: '2500', fixedInterestUnit: 'yearly', repayMode: 'bullet' }),
    );
    expect(feeEp.monthly).toBe(fee.monthly);
    expect(feeBullet.monthly).toBe(fee.monthly);
    expect(feeBullet.interest).toBe(fee.interest);
  });

  it('购置税计税价格 = 开票价 ÷ 1.13', () => {
    const c = computeBuy(DEFAULT_BUY_FORM);
    expect(c.purchaseTaxBase).toBe(119469.03);
    expect(round2(c.purchaseTaxBase * 1.13)).toBe(c.taxBase);
  });

  it('贴息后实付利息与融资成本口径一致', () => {
    const c = computeBuy(
      buy({
        paymentMode: 'finance',
        downPaymentPct: '30',
        months: 36,
        annualRatePct: '3.25',
        stateInterestSubsidy: '400',
      }),
    );
    expect(c.interestNet).toBe(round2(c.interest - c.stateSubsidy));
    expect(c.financeCost).toBe(round2(c.interest + c.earlyFee - c.stateSubsidy));
    // 全款不产生融资成本
    expect(computeBuy(DEFAULT_BUY_FORM).financeCost).toBe(0);
  });

  it('旧车 / 首购方式互斥：报废、置换、首购每年限享其一', () => {
    const both = buy({ tradeInSubsidy: '8000', scrapSubsidy: '12000', firstBuySubsidy: '5000' });
    // 未选择方式时，三项都不计入
    expect(computeBuy({ ...both, oldCarMode: 'none' }).subsNonLoan).toBe(0);
    // 只计所选那一项
    const trade = computeBuy({ ...both, oldCarMode: 'tradeIn' });
    expect(trade.tradeIn).toBe(8000);
    expect(trade.scrap).toBe(0);
    expect(trade.firstBuy).toBe(0);
    const scrap = computeBuy({ ...both, oldCarMode: 'scrap' });
    expect(scrap.tradeIn).toBe(0);
    expect(scrap.scrap).toBe(12000);
    expect(scrap.firstBuy).toBe(0);
    const first = computeBuy({ ...both, oldCarMode: 'firstBuy' });
    expect(first.tradeIn).toBe(0);
    expect(first.scrap).toBe(0);
    expect(first.firstBuy).toBe(5000);
  });
});

describe('用车成本', () => {
  it('默认 3 年分项与年均口径', () => {
    const c = computeOwn(own({ holdYears: '3' }));
    expect(c.total).toBe(64257.5);
    expect(c.monthlyAvg).toBe(1784.93);
    expect(c.perKm).toBe(1.43);
    const rowSum = c.rows.reduce((a, r) => a + r.total, 0);
    expect(Math.abs(rowSum - c.total)).toBeLessThan(0.06);
  });

  it('累计口径在整数年与逐年重算一致', () => {
    const whole = computeOwn(own({ holdYears: '3' })).total;
    expect(ownCostCumulative(DEFAULT_OWN_FORM, 3).total).toBe(whole);
    const half = ownCostCumulative(DEFAULT_OWN_FORM, 2.5).total;
    expect(half).toBeGreaterThan(computeOwn(own({ holdYears: '2' })).total);
    expect(half).toBeLessThan(whole);
  });
});

describe('卖车损益', () => {
  it('默认 3 年末卖出口径', () => {
    const c = computeSell(DEFAULT_SELL_FORM, DEFAULT_BUY_FORM, computeBuy(DEFAULT_BUY_FORM), DEFAULT_OWN_FORM);
    expect(c.salePrice).toBe(78300);
    expect(c.netProceeds).toBe(77900);
    expect(c.fullNet).toBe(138299.4);
    expect(c.yearlyAvg).toBe(46099.8);
    expect(c.perDay).toBe(126.3);
    expect(c.perKm).toBe(3.07);
  });

  it('残值率按车龄插值，月中不再跳档', () => {
    const fuel = computeBuy(DEFAULT_BUY_FORM);
    const may = computeSell(sell({ sellYear: '3', sellMonth: '5' }), DEFAULT_BUY_FORM, fuel, DEFAULT_OWN_FORM);
    const june = computeSell(sell({ sellYear: '3', sellMonth: '6' }), DEFAULT_BUY_FORM, fuel, DEFAULT_OWN_FORM);
    expect(may.residualRatePct).toBe(64.96);
    expect(june.residualRatePct).toBe(64);
    expect(may.salePrice - june.salePrice).toBeLessThan(2000);
    expect(may.salePrice - june.salePrice).toBeGreaterThan(0);
    expect(autoResidualPctAt('gas', 2.5)).toBe(64);
    expect(salePeriodText(3, 6)).toBe('第 3 年第 6 月，累计 2 年 6 个月');
  });

  it('残值率空字符串回落到自动曲线', () => {
    const c = computeSell(
      sell({ residualRatePct: '' }),
      DEFAULT_BUY_FORM,
      computeBuy(DEFAULT_BUY_FORM),
      DEFAULT_OWN_FORM,
    );
    expect(c.residualRatePct).toBe(58);
    expect(c.salePrice).toBe(78300);
  });

  it('未设提前还款计划时不产生隐藏结清手续费', () => {
    const form = buy({
      paymentMode: 'finance',
      months: 36,
      annualRatePct: '3.25',
      earlyRepayMonth: 0,
      earlyRepayFee: '800',
    });
    const c = computeBuy(form);
    const s = computeSell(sell({ sellYear: '2', sellMonth: '12' }), form, c, DEFAULT_OWN_FORM);
    expect(c.earlyFee).toBe(0);
    expect(s.loan.settleFee).toBe(0);
  });

  it('退保只计商业险，可退保基数可调整', () => {
    const c = computeSell(
      sell({ sellYear: '3', sellMonth: '6' }),
      DEFAULT_BUY_FORM,
      computeBuy(DEFAULT_BUY_FORM),
      DEFAULT_OWN_FORM,
    );
    expect(c.refund).toBe(1163.75);
  });

  it('手动卖价高于成交价时锚定年行与当前卖价一致', () => {
    const c = computeSell(
      sell({ residualMode: 'manual', manualSalePrice: '150000' }),
      DEFAULT_BUY_FORM,
      computeBuy(DEFAULT_BUY_FORM),
      DEFAULT_OWN_FORM,
    );
    expect(c.salePrice).toBe(150000);
    expect(c.rows[2].salePrice).toBe(150000);
  });

  it('手动卖价倒推早年不产生虚假增值：首年不优于次年', () => {
    // 回归：手动卖价按保值率曲线倒推更早年份时，曾把首年卖价放大到高于成交价，
    // 造出「首年卖出反而盈利、比次年还便宜」的假象
    const form = buy({
      paymentMode: 'finance',
      months: 24,
      downPaymentPct: '20',
      annualRatePct: '3.25',
      vehicleType: 'phev',
      taxRateMode: 'half',
      vehicleVesselTax: '480',
    });
    const calc = computeBuy(form);
    const c = computeSell(
      sell({ residualMode: 'manual', manualSalePrice: '120000' }),
      form,
      calc,
      own({ annualMileage: '30000', insuranceBase: '2000', refundBase: '1600', energyType: 'phev' }),
    );
    // 早年卖价不得超过 max(残值基数, 手动卖价)，杜绝「旧车比新车贵」的虚假增值
    const cap = Math.max(c.residualBaseVal, 120000);
    expect(c.rows[0].salePrice).toBeLessThanOrEqual(cap);
    expect(c.rows[1].salePrice).toBeLessThanOrEqual(cap);
    // 锚定年行仍等于手动卖价
    expect(c.rows[2].salePrice).toBe(120000);
    // 首年卖车不应是盈利，且年均成本不应优于次年
    expect(c.rows[0].fullNet).toBeGreaterThan(0);
    expect(c.rows[0].yearlyAvg).toBeGreaterThan(c.rows[1].yearlyAvg);
  });

  it('手动卖价高于成交价时早年也不超过手动价（收藏车不倒推增值）', () => {
    const c = computeSell(
      sell({ residualMode: 'manual', manualSalePrice: '150000' }),
      DEFAULT_BUY_FORM,
      computeBuy(DEFAULT_BUY_FORM),
      DEFAULT_OWN_FORM,
    );
    expect(c.rows[0].salePrice).toBeLessThanOrEqual(150000);
    expect(c.rows[1].salePrice).toBeLessThanOrEqual(150000);
  });

  it('贷款按卖出月截断，现金流恒等', () => {
    const form = buy({ paymentMode: 'finance', months: 60, annualRatePct: '3.25' });
    const calc = computeBuy(form);
    for (const y of [1, 2, 3]) {
      const c = computeSell(sell({ sellYear: String(y), sellMonth: '12' }), form, calc, DEFAULT_OWN_FORM);
      const cash = c.loan.buyTotal + c.ownTotal - c.netProceeds - c.refund;
      expect(Math.abs(c.fullNet - cash)).toBeLessThan(0.02);
    }
  });
});
