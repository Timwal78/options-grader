// ═══════════════════════════════════════════════════════════════════════════════
// My Options Grader — Grading Engine v2.0
// by ScriptMasterLabs™
// 6-Factor scoring algorithm — Institutional-grade, IV-aware, probability-driven
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Standard normal CDF approximation (Abramowitz & Stegun)
 * Used for probability-of-profit estimation.
 */
function normCDF(x) {
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
  const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x);
  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x / 2);
  return 0.5 * (1.0 + sign * y);
}

/**
 * Grade a single options contract on 6 factors (0-100 each)
 * Returns weighted score + letter grade
 *
 * @param {object} contract — normalized contract from optionsData
 * @param {number} underlyingPrice — current stock price
 * @param {number} historicalIV — median IV of ATM contracts in the chain
 * @param {object} [chainStats] — optional chain-wide stats for percentile ranking
 */
function gradeContract(contract, underlyingPrice, historicalIV, chainStats) {
  const scores = {
    greeks: scoreGreeks(contract),
    riskReward: scoreRiskReward(contract, underlyingPrice),
    ivPercentile: scoreIV(contract, historicalIV, chainStats),
    probability: scoreProbability(contract, underlyingPrice),
    liquidity: scoreLiquidity(contract),
    technical: scoreTechnical(contract, underlyingPrice)
  };

  const weights = {
    greeks: parseFloat(process.env.WEIGHT_GREEKS || '0.20'),
    riskReward: parseFloat(process.env.WEIGHT_RISK_REWARD || '0.20'),
    ivPercentile: parseFloat(process.env.WEIGHT_IV || '0.15'),
    probability: parseFloat(process.env.WEIGHT_PROBABILITY || '0.10'),
    liquidity: parseFloat(process.env.WEIGHT_LIQUIDITY || '0.15'),
    technical: parseFloat(process.env.WEIGHT_TECHNICAL || '0.20')
  };

  let totalScore = 0;
  for (const [factor, score] of Object.entries(scores)) {
    totalScore += score * (weights[factor] || 0);
  }

  totalScore = Math.round(Math.min(100, Math.max(0, totalScore)));

  return {
    ...contract,
    scores,
    totalScore,
    grade: getLetterGrade(totalScore),
    gradeColor: getGradeColor(totalScore),
    moneyness: contract.inTheMoney ? 'ITM' : 'OTM'
  };
}

function getLetterGrade(score) {
  if (score >= 93) return 'A+';
  if (score >= 87) return 'A';
  if (score >= 83) return 'B+';
  if (score >= 75) return 'B';
  if (score >= 67) return 'C+';
  if (score >= 55) return 'C';
  if (score >= 40) return 'D';
  return 'F';
}

function getGradeColor(score) {
  if (score >= 83) return '#00E676';
  if (score >= 67) return '#FFD740';
  if (score >= 55) return '#FF9100';
  return '#FF4444';
}

// ─── FACTOR 1: GREEKS BALANCE (20%) ─────────────────────────────────────────
// Now DTE-aware: high gamma + low DTE = danger, not opportunity
function scoreGreeks(c) {
  let score = 0;
  const absDelta = Math.abs(c.delta || 0);
  const theta = c.theta || 0;
  const gamma = c.gamma || 0;
  const vega = c.vega || 0;
  const dte = c.dte;
  const premium = c.lastPrice || c.ask;

  if (!dte || !premium) return 0; // Law 1: Zero-Fake

  // ── Delta sweet spot (0-30 pts) ──
  if (absDelta >= 0.30 && absDelta <= 0.50) score += 30;      // Sweet spot
  else if (absDelta >= 0.20 && absDelta <= 0.60) score += 22;  // Good
  else if (absDelta >= 0.15 && absDelta <= 0.70) score += 12;  // Acceptable
  else if (absDelta > 0.85) score += 3;                         // Deep ITM
  else if (absDelta < 0.10) score += 2;                         // Far OTM

  // ── Theta decay rate (0-30 pts) ──
  if (premium > 0) {
    const thetaPctPerDay = Math.abs(theta) / premium * 100;
    if (thetaPctPerDay < 0.5) score += 30;       // Minimal decay
    else if (thetaPctPerDay < 1.0) score += 25;  // Very manageable
    else if (thetaPctPerDay < 2.0) score += 18;  // Acceptable
    else if (thetaPctPerDay < 5.0) score += 10;  // Elevated
    else if (thetaPctPerDay < 10.0) score += 3;  // Aggressive
    // 10%+ = 0 points
  } else {
    return 0;
  }

  // ── Gamma: DTE-aware (0-20 pts) ──
  if (dte <= 3) {
    if (gamma > 0.08) score += 2;
    else if (gamma > 0.04) score += 8;
    else score += 15;
  } else if (dte <= 14) {
    if (gamma > 0.01 && gamma < 0.06) score += 20;
    else if (gamma >= 0.06) score += 12;
    else score += 5;
  } else {
    if (gamma > 0.005) score += 15;
    else score += 8;
  }

  // ── Vega: IV-aware (0-20 pts) ──
  const iv = c.impliedVolatility || 0;
  if (iv < 0.30 && vega > 0.03) score += 20;        // Cheap + vol-sensitive
  else if (iv < 0.40 && vega > 0.05) score += 15;
  else if (iv < 0.60) score += 10;
  else if (iv < 0.80) score += 5;
  else if (iv > 0.80 && vega > 0.10) score += 0;    // IV crush risk

  return Math.min(100, Math.max(0, score));
}

// ─── FACTOR 2: RISK / REWARD (20%) ──────────────────────────────────────────
// Now uses IV-adjusted expected move instead of flat 10%
function scoreRiskReward(c, underlyingPrice) {
  let score = 0;
  const premium = c.lastPrice || c.ask;
  if (!premium || !underlyingPrice || premium <= 0 || underlyingPrice <= 0) return 0;

  const strike = c.strike;
  const isCall = (c.type || '').toLowerCase() === 'call';
  const dte = c.dte;
  const iv = c.impliedVolatility;

  if (!strike || !dte || !iv) return 0;

  // 1.5-sigma expected move (covers ~87% of outcomes — a strong but realistic target)
  const expectedMove = underlyingPrice * iv * Math.sqrt(dte / 365) * 1.5;
  const expectedMoveUp = underlyingPrice + expectedMove;
  const expectedMoveDown = underlyingPrice - expectedMove;
  const maxLoss = premium;

  let potentialGain;
  if (isCall) {
    potentialGain = Math.max(0, expectedMoveUp - strike) - premium;
  } else {
    potentialGain = Math.max(0, strike - expectedMoveDown) - premium;
  }

  // Risk/Reward ratio scoring (0-60 pts)
  if (potentialGain <= 0) {
    const absDelta = Math.abs(c.delta || 0);
    score += absDelta > 0.35 ? 15 : 5;  // Still tradeable vs lottery
  } else {
    const ratio = potentialGain / maxLoss;
    if (ratio >= 5) score += 60;       // 5:1+ — exceptional
    else if (ratio >= 3) score += 50;  // 3:1 — strong
    else if (ratio >= 2) score += 42;  // 2:1 — good
    else if (ratio >= 1.5) score += 35;
    else if (ratio >= 1) score += 28;
    else if (ratio >= 0.5) score += 18;
    else score += 8;
  }

  // Capital efficiency (0-25 pts)
  const premiumRatio = premium / underlyingPrice;
  if (premiumRatio < 0.01) score += 25;       // Ultra-efficient
  else if (premiumRatio < 0.02) score += 22;
  else if (premiumRatio < 0.05) score += 18;
  else if (premiumRatio < 0.10) score += 12;
  else if (premiumRatio < 0.15) score += 5;
  // >15% = 0 pts (capital-heavy)

  // Breakeven proximity (0-15 pts)
  const breakeven = isCall ? strike + premium : strike - premium;
  const beDistance = Math.abs(breakeven - underlyingPrice) / underlyingPrice;
  if (beDistance < 0.02) score += 15;       // Very close to breakeven
  else if (beDistance < 0.05) score += 12;
  else if (beDistance < 0.08) score += 8;
  else if (beDistance < 0.12) score += 4;

  return Math.min(100, Math.max(0, score));
}

// ─── FACTOR 3: IV PERCENTILE (15%) ──────────────────────────────────────────
// v2: Real chain-rank percentile. Where does this contract's IV sit
// relative to ALL other contracts in the chain?
function scoreIV(c, historicalIV, chainStats) {
  let score = 0;
  const iv = c.impliedVolatility;
  if (!iv || iv <= 0) return 0;

  let ivRank = 50;

  if (chainStats && chainStats.ivSorted && chainStats.ivSorted.length > 0) {
    const sorted = chainStats.ivSorted;
    let below = 0;
    for (const chainIV of sorted) {
      if (chainIV < iv) below++;
    }
    ivRank = (below / sorted.length) * 100;
  } else if (historicalIV > 0) {
    const ivRatio = iv / historicalIV;
    ivRank = Math.min(100, ivRatio * 50);
  }

  c.ivPercentile = Math.round(ivRank);

  // Buyer's perspective: lower IV = cheaper = better (0-100 pts)
  if (ivRank < 10) score = 100;       // Extreme value — rock-bottom IV
  else if (ivRank < 20) score = 90;   // Very cheap
  else if (ivRank < 30) score = 78;   // Below average — good value
  else if (ivRank < 40) score = 65;   // Slightly below median
  else if (ivRank < 50) score = 55;   // Fair
  else if (ivRank < 60) score = 45;   // Slightly above median
  else if (ivRank < 70) score = 35;   // Getting expensive
  else if (ivRank < 80) score = 22;   // Expensive
  else if (ivRank < 90) score = 12;   // Very expensive — crush risk
  else score = 5;                      // Extreme — likely post-earnings IV spike

  return Math.min(100, Math.max(0, score));
}

// ─── FACTOR 4: PROBABILITY OF PROFIT (20%) ──────────────────────────────────
// v2: Uses simplified Black-Scholes / lognormal approximation
// Estimates the probability that the contract expires with value > premium paid
function scoreProbability(c, underlyingPrice) {
  let score = 0;
  const strike = c.strike;
  const premium = c.lastPrice || c.ask;
  const isCall = (c.type || '').toLowerCase() === 'call';
  const dte = c.dte;
  const iv = c.impliedVolatility;

  if (!underlyingPrice || !strike || !dte || !iv || !premium) return 0;

  const breakeven = isCall ? strike + premium : strike - premium;
  const T = dte / 365;
  const sigmaRootT = iv * Math.sqrt(T);

  let probProfit;
  if (isCall) {
    const d2 = (Math.log(underlyingPrice / breakeven) - 0.5 * iv * iv * T) / sigmaRootT;
    probProfit = normCDF(d2);
  } else {
    const d2 = (Math.log(underlyingPrice / breakeven) - 0.5 * iv * iv * T) / sigmaRootT;
    probProfit = normCDF(-d2);
  }

  c.probOfProfit = Math.round(probProfit * 100);

  // Probability scoring (0-65 pts) — full range
  if (probProfit >= 0.60) score += 65;       // >60% — strong edge
  else if (probProfit >= 0.55) score += 58;
  else if (probProfit >= 0.50) score += 50;  // Coin flip — fair
  else if (probProfit >= 0.45) score += 42;
  else if (probProfit >= 0.40) score += 35;
  else if (probProfit >= 0.35) score += 28;
  else if (probProfit >= 0.30) score += 20;
  else if (probProfit >= 0.25) score += 12;
  else if (probProfit >= 0.15) score += 5;
  // <15% = 0 pts — lottery ticket

  // DTE sweet spot (0-35 pts)
  if (dte >= 14 && dte <= 45) score += 35;       // Ideal swing window
  else if (dte >= 7 && dte <= 60) score += 28;
  else if (dte >= 5 && dte <= 90) score += 20;
  else if (dte >= 3 && dte <= 120) score += 12;
  else if (dte < 3) score += 2;                  // Expiry danger
  else if (dte > 180) score += 8;                // Capital locked
  else score += 15;                               // 120-180 range

  return Math.min(100, Math.max(0, score));
}

/**
 * Fallback when IV/DTE data is missing — pure moneyness scoring
 */
function scoreMoneynessFallback(c, underlyingPrice) {
  let score = 50;
  const strike = c.strike || 0;
  const isCall = (c.type || '').toLowerCase() === 'call';
  const dte = c.dte || 30;

  const isOTM = isCall ? underlyingPrice < strike : underlyingPrice > strike;
  const moneyness = Math.abs(underlyingPrice - strike) / underlyingPrice;

  // Zero-Fake Policy: Reward OTM setups (price has room to move in the right direction)
  if (isOTM) {
    if (moneyness < 0.03) score += 20; // ATM-adjacent OTM — best setup
    else if (moneyness < 0.07) score += 10;
    else if (moneyness < 0.15) score -= 5;
    else score -= 20; // Far OTM lottery ticket
  } else {
    // ITM fallback — not a setup, penalize
    score -= 15;
  }

  if (dte >= 14 && dte <= 60) score += 15;
  else if (dte >= 7 && dte <= 90) score += 5;
  else if (dte < 7) score -= 15;
  else if (dte > 180) score -= 5;

  return Math.min(100, Math.max(0, score));
}

// ─── FACTOR 5: LIQUIDITY (15%) ──────────────────────────────────────────────
function scoreLiquidity(c) {
  let score = 0;
  const bid = c.bid || 0;
  const ask = c.ask || 0;
  const volume = c.volume || 0;
  const openInterest = c.openInterest || 0;

  // Bid-Ask spread (0-40 pts)
  if (bid > 0 && ask > 0) {
    const spread = (ask - bid) / ask;
    if (spread < 0.02) score += 40;       // Penny-wide — institutional
    else if (spread < 0.05) score += 35;
    else if (spread < 0.08) score += 28;
    else if (spread < 0.15) score += 18;
    else if (spread < 0.25) score += 8;
    // >25% = 0 pts — too wide
  }

  // Volume (0-35 pts)
  if (volume > 10000) score += 35;
  else if (volume > 5000) score += 30;
  else if (volume > 1000) score += 25;
  else if (volume > 500) score += 20;
  else if (volume > 100) score += 15;
  else if (volume > 10) score += 8;
  // <10 = 0 pts — ghost contract

  // Open interest (0-25 pts)
  if (openInterest > 20000) score += 25;
  else if (openInterest > 10000) score += 22;
  else if (openInterest > 5000) score += 18;
  else if (openInterest > 1000) score += 14;
  else if (openInterest > 500) score += 10;
  else if (openInterest > 50) score += 5;
  // <50 = 0 pts — no market maker interest

  return Math.min(100, Math.max(0, score));
}

// ─── FACTOR 6: TECHNICAL / MOMENTUM (10%) ───────────────────────────────────
// v2: Replaces hardcoded 65 with actual momentum signal from the underlying
function scoreTechnical(c, underlyingPrice) {
  let score = 0;
  const change = c.underlyingChange || 0;
  const isCall = (c.type || '').toLowerCase() === 'call';

  // OTM validation (0 or 40 pts) — ITM contracts are NOT setups
  if (isCall) {
    if (c.strike <= underlyingPrice) return 0;  // ITM/ATM Call = not a setup
  } else {
    if (c.strike >= underlyingPrice) return 0;  // ITM/ATM Put = not a setup
  }

  // OTM confirmed — award setup base (40 pts)
  score += 40;

  // Momentum alignment (0-40 pts)
  if (isCall) {
    if (change > 3) score += 40;          // Strong bullish
    else if (change > 2) score += 35;
    else if (change > 1) score += 28;
    else if (change > 0.5) score += 20;
    else if (change > 0) score += 12;
    else if (change > -1) score += 5;     // Slight headwind OK
    // < -1% = 0 pts — fighting the trend
  } else {
    if (change < -3) score += 40;         // Strong bearish
    else if (change < -2) score += 35;
    else if (change < -1) score += 28;
    else if (change < -0.5) score += 20;
    else if (change < 0) score += 12;
    else if (change < 1) score += 5;
  }

  // OTM proximity bonus (0-20 pts) — closer to ATM = higher probability
  const otmPct = Math.abs(c.strike - underlyingPrice) / underlyingPrice;
  if (otmPct < 0.02) score += 20;        // Near ATM — highest prob
  else if (otmPct < 0.05) score += 15;
  else if (otmPct < 0.08) score += 10;
  else if (otmPct < 0.12) score += 5;
  // >12% OTM = 0 bonus

  return Math.min(100, Math.max(0, score));
}

// ─── GRADE FULL OPTIONS CHAIN ────────────────────────────────────────────────
function gradeOptionsChain(chain, underlyingPrice, historicalIV) {
  // Build chain-wide IV stats for true percentile ranking
  const allIVs = chain
    .map(c => c.impliedVolatility || 0)
    .filter(iv => iv > 0)
    .sort((a, b) => a - b);

  const chainStats = {
    ivSorted: allIVs,
    ivMedian: allIVs.length > 0 ? allIVs[Math.floor(allIVs.length / 2)] : historicalIV,
    ivCount: allIVs.length
  };

  const graded = chain.map(contract =>
    gradeContract(contract, underlyingPrice, historicalIV, chainStats)
  );

  // Sort by total score descending
  graded.sort((a, b) => b.totalScore - a.totalScore);

  return graded;
}

module.exports = { gradeContract, gradeOptionsChain, getLetterGrade, getGradeColor };
