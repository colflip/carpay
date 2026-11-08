import { describe, expect, it } from 'vitest';
import { computeBuy, DEFAULT_BUY_FORM, type BuyForm } from './buyModel';
import { autoResidualPctAt, computeOwn, DEFAULT_OWN_FORM, ownCostCumulative, type OwnForm } from './ownCostModel';
import { computeSell, DEFAULT_SELL_FORM, salePeriodText, type SellForm } from './sellModel';

const buy = (p: Partial<BuyForm>): BuyForm => ({ ...DEFAULT_BUY_FORM, ...p });
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
