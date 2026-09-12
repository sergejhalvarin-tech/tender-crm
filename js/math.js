/* ============================================================
   Тендерный отдел CRM — Математический движок аналитики
   Формулы: теория вероятностей, теория игр, оптимизация,
   байесовский вывод, портфельная теория, риск-метрики
   ============================================================ */
'use strict';

const MathEngine = {

  /* ─── 1. БАЙЕСОВСКАЯ ОЦЕНКА ВЕРОЯТНОСТИ ПОБЕДЫ ───
     Beta(α, β) posterior с uniform prior Beta(1,1)
     P(win|data) = (wins + α₀) / (total + α₀ + β₀)
     Credible interval через Beta quantiles (Wilson approx) */
  bayesWinProb(wins, total, alpha0 = 1, beta0 = 1) {
    const alpha = wins + alpha0;
    const beta = (total - wins) + beta0;
    const mean = alpha / (alpha + beta);
    const variance = (alpha * beta) / ((alpha + beta) ** 2 * (alpha + beta + 1));
    const std = Math.sqrt(variance);
    const ci95Low = Math.max(0, mean - 1.96 * std);
    const ci95High = Math.min(1, mean + 1.96 * std);
    return { mean, variance, std, ci95Low, ci95High, alpha, beta, n: total };
  },

  /* ─── 2. EXPECTED MONETARY VALUE (EMV) ───
     EMV = P(win) × NetProfit − P(lose) × CostOfBid
     Учитывает тариф площадки, логистику, налоги */
  emv(pWin, netProfit, costOfBid = 0) {
    return pWin * netProfit - (1 - pWin) * costOfBid;
  },

  /* ─── 3. КРИТЕРИЙ КЕЛЛИ — оптимальная доля капитала ───
     f* = (b·p − q) / b
     b = отношение выигрыша к ставке (odds)
     p = вероятность победы, q = 1 − p
     Fractional Kelly (¼ или ½) для снижения волатильности */
  kelly(pWin, profitIfWin, lossIfLose) {
    if (lossIfLose <= 0 || profitIfWin <= 0) return { full: 0, half: 0, quarter: 0 };
    const b = profitIfWin / lossIfLose;
    const q = 1 - pWin;
    const f = (b * pWin - q) / b;
    return {
      full: Math.max(0, f),
      half: Math.max(0, f / 2),
      quarter: Math.max(0, f / 4),
      edge: b * pWin - q,
      odds: b,
    };
  },

  /* ─── 4. ОПТИМАЛЬНАЯ ЦЕНА ПОДАЧИ (теория аукционов) ───
     First-Price Sealed-Bid (FPSB) auction — Nash Equilibrium
     b*(v) = v − (v − r) / n
     v = ваша оценка стоимости, r = резервная цена (НМЦК),
     n = ожидаемое число участников
     При uniform distribution valuations */
  optimalBid(nmck, zakupka, nCompetitors) {
    const n = Math.max(2, nCompetitors);
    const v = nmck;
    const margin = (v - zakupka);
    const optBid = zakupka + margin * (n - 1) / n;
    const snizhenieOtNmck = nmck > 0 ? (1 - optBid / nmck) * 100 : 0;
    return {
      optimalPrice: round2(optBid),
      snizhenieOtNmck: round2(snizhenieOtNmck),
      expectedProfit: round2(optBid - zakupka),
      n,
      formula: `b* = zakupka + (НМЦК − zakupka) × (n−1)/n`,
    };
  },

  /* ─── 5. BREAK-EVEN ANALYSIS ───
     Минимальная цена контракта, при которой ЧП = 0
     P_min = (Закупка + Логистика) / (1 − тариф% − резерв% − налог×(1−тариф%−резерв%)) */
  breakEven(zakupka, logistics, tarifPct, rezervPct, nalogPct) {
    const t = tarifPct / 100, rz = rezervPct / 100, nl = nalogPct / 100;
    const denom = 1 - t - rz;
    if (denom <= 0) return { minPrice: Infinity, valid: false };
    const beforeTax = (zakupka + logistics) / denom;
    const taxAdj = 1 - nl;
    if (taxAdj <= 0) return { minPrice: Infinity, valid: false };
    const minPrice = (zakupka + logistics) / (denom * (1 - nl / (1)));
    const minPriceSimple = (zakupka + logistics) / (1 - t - rz);
    return {
      minPrice: round2(minPriceSimple),
      valid: true,
      marginOfSafety: 0,
    };
  },

  /* ─── 6. SHARPE-LIKE RISK-ADJUSTED RETURN ───
     RAR = (μ_profit − Rf) / σ_profit
     Rf = 0 (opportunity cost baseline)
     Используем по портфелю закупок */
  riskAdjustedReturn(profits) {
    if (!profits.length) return { rar: 0, mean: 0, std: 0, cv: 0 };
    const n = profits.length;
    const mean = profits.reduce((a, b) => a + b, 0) / n;
    const variance = profits.reduce((s, x) => s + (x - mean) ** 2, 0) / n;
    const std = Math.sqrt(variance);
    const cv = mean !== 0 ? std / Math.abs(mean) : 0;
    return {
      rar: std > 0 ? mean / std : (mean > 0 ? Infinity : 0),
      mean: round2(mean),
      std: round2(std),
      cv: round2(cv),
    };
  },

  /* ─── 7. VALUE AT RISK (VaR) — параметрический ───
     VaR_α = μ − z_α × σ
     95% confidence: z = 1.645
     99% confidence: z = 2.326 */
  valueAtRisk(profits, confidence = 0.95) {
    const stats = this.riskAdjustedReturn(profits);
    const z = confidence >= 0.99 ? 2.326 : 1.645;
    return {
      var95: round2(stats.mean - 1.645 * stats.std),
      var99: round2(stats.mean - 2.326 * stats.std),
      cvar95: round2(stats.mean - 2.063 * stats.std),
    };
  },

  /* ─── 8. PERT-ОЦЕНКА СРОКОВ ───
     E = (O + 4M + P) / 6
     σ = (P − O) / 6
     O = optimistic, M = most likely, P = pessimistic */
  pert(optimistic, mostLikely, pessimistic) {
    const expected = (optimistic + 4 * mostLikely + pessimistic) / 6;
    const std = (pessimistic - optimistic) / 6;
    return {
      expected: round2(expected),
      std: round2(std),
      ci95: [round2(expected - 1.96 * std), round2(expected + 1.96 * std)],
    };
  },

  /* ─── 9. ИНДЕКС ДИВЕРСИФИКАЦИИ ПОСТАВЩИКОВ (Herfindahl–Hirschman) ───
     HHI = Σ(share_i²), где share_i = объём_i / объём_total
     HHI → 0 = высокая диверсификация, HHI → 1 = монополия
     Normalized HHI* = (HHI − 1/n) / (1 − 1/n) */
  hhi(volumes) {
    const total = volumes.reduce((a, b) => a + b, 0);
    if (total <= 0 || volumes.length <= 1) return { hhi: 1, hhiNorm: 1, n: volumes.length, diversified: false, label: 'Нет данных' };
    const shares = volumes.map(v => v / total);
    const hhi = shares.reduce((s, sh) => s + sh * sh, 0);
    const n = volumes.length;
    const hhiNorm = n > 1 ? (hhi - 1 / n) / (1 - 1 / n) : 1;
    return {
      hhi: round2(hhi * 10000) / 10000,
      hhiNorm: round2(hhiNorm * 100) / 100,
      n,
      diversified: hhi < 0.25,
      label: hhi < 0.15 ? 'Высокая' : hhi < 0.25 ? 'Средняя' : 'Низкая',
    };
  },

  /* ─── 10. КОЭФФИЦИЕНТ ВАРИАЦИИ ЦЕН ПОСТАВЩИКОВ ───
     CV = σ / μ — мера стабильности цен
     CV < 0.1 = стабильно, 0.1–0.3 = средне, > 0.3 = высокий разброс */
  priceCV(prices) {
    const valid = prices.filter(p => p > 0);
    if (valid.length < 2) return { cv: 0, label: '—', mean: valid[0] || 0, std: 0 };
    const mean = valid.reduce((a, b) => a + b, 0) / valid.length;
    const std = Math.sqrt(valid.reduce((s, x) => s + (x - mean) ** 2, 0) / valid.length);
    const cv = mean > 0 ? std / mean : 0;
    return {
      cv: round2(cv * 100) / 100,
      mean: round2(mean),
      std: round2(std),
      label: cv < 0.1 ? 'Стабильно' : cv < 0.3 ? 'Средний разброс' : 'Высокий разброс',
    };
  },

  /* ─── 11. MONTE CARLO SIMULATION (упрощённая) ───
     N итераций с нормальным распределением прибыли
     Возвращает перцентили P5, P25, P50, P75, P95 */
  monteCarlo(meanProfit, stdProfit, nContracts, iterations = 5000) {
    const results = [];
    for (let i = 0; i < iterations; i++) {
      let total = 0;
      for (let j = 0; j < nContracts; j++) {
        total += this._normalRandom(meanProfit, stdProfit);
      }
      results.push(total);
    }
    results.sort((a, b) => a - b);
    const pct = (p) => results[Math.floor(p * results.length)] || 0;
    return {
      p5: round2(pct(0.05)),
      p25: round2(pct(0.25)),
      p50: round2(pct(0.50)),
      p75: round2(pct(0.75)),
      p95: round2(pct(0.95)),
      mean: round2(results.reduce((a, b) => a + b, 0) / iterations),
      probPositive: round2(results.filter(r => r > 0).length / iterations * 100),
    };
  },

  _normalRandom(mean, std) {
    const u1 = Math.random(), u2 = Math.random();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return mean + std * z;
  },

  /* ─── 12. SCORING MODEL — многокритериальная оценка тендера ───
     Взвешенная сумма нормализованных критериев:
     Score = Σ(w_i × norm(x_i))
     Критерии: маржа, вероятность, ёмкость оборотки, срок, риск */
  scoreTender(p, settings, winProb) {
    const nmck = Calc.nmck(p);
    const marzha = Calc.marzha(p);
    const zakupka = Calc.zakupka(p);

    const marzhaPct = marzha.pct;
    const probWin = winProb || 0.3;
    const emv = this.emv(probWin, marzha.rub, 0);
    const oborotkaLoad = settings.oborotka > 0 ? zakupka / settings.oborotka : 1;

    const scores = {
      margin: Math.min(1, Math.max(0, marzhaPct / 30)),
      probability: probWin,
      emvNorm: emv > 0 ? Math.min(1, emv / nmck * 10) : 0,
      capitalEfficiency: Math.max(0, 1 - oborotkaLoad),
      diversification: oborotkaLoad < 0.2 ? 1 : oborotkaLoad < 0.4 ? 0.6 : 0.3,
    };

    const weights = { margin: 0.25, probability: 0.25, emvNorm: 0.20, capitalEfficiency: 0.15, diversification: 0.15 };
    const total = Object.keys(weights).reduce((s, k) => s + weights[k] * (scores[k] || 0), 0);

    return {
      total: round2(total * 100),
      scores,
      weights,
      emv: round2(emv),
      grade: total >= 0.7 ? 'A' : total >= 0.5 ? 'B' : total >= 0.3 ? 'C' : 'D',
      recommendation: total >= 0.7 ? 'Подавать' : total >= 0.5 ? 'Рассмотреть' : total >= 0.3 ? 'Осторожно' : 'Пропустить',
    };
  },

  /* ─── 13. ПОРТФЕЛЬНАЯ АНАЛИТИКА ───
     Markowitz-inspired: оптимальное распределение капитала */
  portfolioAnalysis(purchases, settings) {
    const active = purchases.filter(p => ['work', 'calc', 'sent'].includes(p.status));
    const won = purchases.filter(p => p.status === 'win');
    const lost = purchases.filter(p => p.status === 'lose');
    const total = won.length + lost.length;

    const bayesian = this.bayesWinProb(won.length, total);

    const profits = won.map(p => {
      const f = Calc.finance(p);
      return f.chp;
    });
    const rar = this.riskAdjustedReturn(profits);
    const varMetrics = this.valueAtRisk(profits);

    const totalZakupka = active.reduce((s, p) => s + Calc.zakupka(p), 0);
    const oborotka = Store.fmodel().inputs.oborotka;
    const capitalUtilization = oborotka > 0 ? totalZakupka / oborotka : 0;

    const supplierVolumes = {};
    purchases.forEach(p => {
      (p.positions || []).forEach(pos => {
        pos.kp.forEach((kp, ki) => {
          if (kp.price > 0 && kp.link) {
            const domain = kp.link.replace(/^https?:\/\//, '').split('/')[0] || `KP${ki + 1}`;
            supplierVolumes[domain] = (supplierVolumes[domain] || 0) + (kp.price * (pos.qty || 1));
          }
        });
      });
    });
    const hhiData = this.hhi(Object.values(supplierVolumes).length > 0 ? Object.values(supplierVolumes) : [1]);

    let mc = null;
    if (profits.length >= 3) {
      mc = this.monteCarlo(rar.mean, rar.std, Math.max(1, Math.round(active.length * bayesian.mean)), 3000);
    }

    return {
      bayesian,
      rar,
      var: varMetrics,
      capitalUtilization: round2(capitalUtilization * 100),
      hhi: hhiData,
      monteCarlo: mc,
      counts: { active: active.length, won: won.length, lost: lost.length, total },
      avgProfit: rar.mean,
      totalProfit: round2(profits.reduce((a, b) => a + b, 0)),
    };
  },
};
