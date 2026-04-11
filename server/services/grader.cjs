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
    technical: scoreTechnical(contract)
  };

  const weights = {
    greeks: 0.20,
    riskReward: 0.20,
    ivPercentile: 0.15,
    probability: 0.20,
    liquidity: 0.15,
    technical: 0.10
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
    gradeColor: getGradeColor(totalScore)
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
  let score = 50;
  const absDelta = Math.abs(c.delta || 0);
  const theta = c.theta || 0;
  const gamma = c.gamma || 0;
  const vega = c.vega || 0;
  const dte = c.dte || 30;
  const premium = c.lastPrice || c.ask || 1;

  // ── Delta sweet spot ──
  // 0.30-0.50 ideal for directional plays (most retail use case)
  if (absDelta >= 0.30 && absDelta <= 0.50) score += 20;      // Sweet spot
  else if (absDelta >= 0.20 && absDelta <= 0.60) score += 12;  // Acceptable
  else if (absDelta >= 0.15 && absDelta <= 0.70) score += 5;   // Wide but tradeable
  else if (absDelta > 0.85) score -= 10;                        // Deep ITM — poor leverage
  else if (absDelta < 0.10) score -= 15;                        // Far OTM — lottery ticket

  // ── Theta: scored as % of premium lost per day ──
  // The question is: how much of my investment evaporates daily?
  if (premium > 0) {
    const thetaPctPerDay = Math.abs(theta) / premium * 100;
    if (thetaPctPerDay < 1.0) score += 15;       // < 1% daily decay — very manageable
    else if (thetaPctPerDay < 2.0) score += 8;   // 1-2% — acceptable for swings
    else if (thetaPctPerDay < 5.0) score += 0;   // 2-5% — caution
    else if (thetaPctPerDay < 10.0) score -= 10; // 5-10% — aggressive decay
    else score -= 20;                             // 10%+ — contract is melting
  }

  // ── Gamma: DTE-aware scoring ──
  // High gamma near expiry = knife edge. Contract can double or die in minutes.
  if (dte <= 3) {
    // Very short DTE: high gamma is DANGER, not opportunity
    if (gamma > 0.08) score -= 15;        // Extreme gamma risk
    else if (gamma > 0.04) score -= 5;    // Elevated risk
    else score += 5;                       // Low gamma near expiry = ok (deep ITM)
  } else if (dte <= 14) {
    // Medium DTE: gamma is useful for momentum plays
    if (gamma > 0.01 && gamma < 0.06) score += 10;  // Good sensitivity
    else if (gamma >= 0.06) score += 3;               // High but acceptable with time
  } else {
    // Long DTE: gamma is naturally low, not a differentiator
    if (gamma > 0.005) score += 5;
  }

  // ── Vega: sensitivity to IV changes ──
  // High vega + low IV = good (cheap, benefits from IV expansion)
  // High vega + high IV = risk (IV crush potential)
  const iv = c.impliedVolatility || 0;
  if (vega > 0) {
    if (iv < 0.40 && vega > 0.05) score += 5;       // Cheap + vol-sensitive = upside
    else if (iv > 0.80 && vega > 0.10) score -= 5;  // Expensive + vol-sensitive = crush risk
  }

  return Math.min(100, Math.max(0, score));
}

// ─── FACTOR 2: RISK / REWARD (20%) ──────────────────────────────────────────
// Now uses IV-adjusted expected move instead of flat 10%
function scoreRiskReward(c, underlyingPrice) {
  let score = 50;
  const premium = c.lastPrice || c.ask || 0;
  if (premium <= 0 || underlyingPrice <= 0) return 30;

  const strike = c.strike || 0;
  const isCall = (c.type || '').toLowerCase() === 'call';
  const dte = c.dte || 30;
  const iv = c.impliedVolatility || 0.30; // Default 30% if missing

  // IV-adjusted expected move: price * IV * sqrt(DTE/365)
  // This gives us a statistically-grounded 1-sigma move estimate
  const expectedMove = underlyingPrice * iv * Math.sqrt(dte / 365);
  const expectedMoveUp = underlyingPrice + expectedMove;
  const expectedMoveDown = underlyingPrice - expectedMove;

  // Max loss for buyer = premium paid
  const maxLoss = premium;

  // Potential gain at 1-sigma move
  let potentialGain;
  if (isCall) {
    potentialGain = Math.max(0, expectedMoveUp - strike) - premium;
  } else {
    potentialGain = Math.max(0, strike - expectedMoveDown) - premium;
  }

  if (potentialGain <= 0) {
    // Even a 1-sigma favorable move doesn't make this profitable
    score -= 20;
  } else {
    const ratio = potentialGain / maxLoss;
    if (ratio >= 5) score += 35;       // 5:1+ — exceptional
    else if (ratio >= 3) score += 30;  // 3:1 — strong
    else if (ratio >= 2) score += 22;  // 2:1 — good
    else if (ratio >= 1.5) score += 15;
    else if (ratio >= 1) score += 8;
    else score -= 5;                    // Less than 1:1 — poor risk/reward
  }

  // Penalize very expensive contracts (premium > 10% of stock price = capital-heavy)
  const premiumRatio = premium / underlyingPrice;
  if (premiumRatio > 0.15) score -= 15;
  else if (premiumRatio > 0.10) score -= 8;
  else if (premiumRatio < 0.02) score += 8;  // Cheap and efficient

  // Bonus: already ITM with intrinsic value protection
  if (c.inTheMoney && premiumRatio < 0.08) score += 5;

  return Math.min(100, Math.max(0, score));
}

// ─── FACTOR 3: IV PERCENTILE (15%) ──────────────────────────────────────────
// v2: Real chain-rank percentile. Where does this contract's IV sit
// relative to ALL other contracts in the chain?
function scoreIV(c, historicalIV, chainStats) {
  let score = 50;
  const iv = c.impliedVolatility || 0;
  if (iv <= 0) return 50; // Can't evaluate

  let ivRank = 50; // Default neutral

  if (chainStats && chainStats.ivSorted && chainStats.ivSorted.length > 0) {
    // True percentile: rank within the entire chain's IV distribution
    const sorted = chainStats.ivSorted;
    let below = 0;
    for (const chainIV of sorted) {
      if (chainIV < iv) below++;
    }
    ivRank = (below / sorted.length) * 100;
  } else if (historicalIV > 0) {
    // Fallback: compare to median IV of ATM contracts
    // ivRatio < 1 means cheaper than median, > 1 means more expensive
    const ivRatio = iv / historicalIV;
    ivRank = Math.min(100, ivRatio * 50);
  }

  // Store the real percentile for display
  c.ivPercentile = Math.round(ivRank);

  // Scoring from a BUYER's perspective:
  // Lower IV = cheaper options = better deal (if you're buying)
  if (ivRank < 20) score += 30;       // Bottom quintile — IV is very low, options are cheap
  else if (ivRank < 35) score += 20;  // Below average — good value
  else if (ivRank < 50) score += 10;  // Slightly below median — fair
  else if (ivRank < 65) score += 0;   // Neutral zone
  else if (ivRank < 80) score -= 12;  // Above average — getting expensive
  else score -= 25;                    // Top quintile — IV is elevated, crush risk

  return Math.min(100, Math.max(0, score));
}

// ─── FACTOR 4: PROBABILITY OF PROFIT (20%) ──────────────────────────────────
// v2: Uses simplified Black-Scholes / lognormal approximation
// Estimates the probability that the contract expires with value > premium paid
function scoreProbability(c, underlyingPrice) {
  let score = 50;
  const strike = c.strike || 0;
  const premium = c.lastPrice || c.ask || 0;
  const isCall = (c.type || '').toLowerCase() === 'call';
  const dte = c.dte || 30;
  const iv = c.impliedVolatility || 0.30;

  if (underlyingPrice <= 0 || strike <= 0 || dte <= 0 || iv <= 0) {
    // Can't compute — fall back to moneyness-only scoring
    return scoreMoneynessFallback(c, underlyingPrice);
  }

  // Breakeven for buyer
  const breakeven = isCall ? strike + premium : strike - premium;

  // Log-normal probability that price exceeds breakeven (for calls)
  // or drops below breakeven (for puts) at expiration
  // d2 = (ln(S/K) + (r - 0.5*σ²)*T) / (σ*√T)
  // Using r=0 (risk-free rate negligible for this scoring purpose)
  const T = dte / 365;
  const sigmaRootT = iv * Math.sqrt(T);

  let probProfit;
  if (isCall) {
    // P(S_T > breakeven)
    const d2 = (Math.log(underlyingPrice / breakeven) - 0.5 * iv * iv * T) / sigmaRootT;
    probProfit = normCDF(d2);
  } else {
    // P(S_T < breakeven)
    const d2 = (Math.log(underlyingPrice / breakeven) - 0.5 * iv * iv * T) / sigmaRootT;
    probProfit = normCDF(-d2);
  }

  // Store for display
  c.probOfProfit = Math.round(probProfit * 100);

  // Score based on probability
  if (probProfit >= 0.55) score += 30;       // > 55% chance of profit
  else if (probProfit >= 0.45) score += 20;  // 45-55% — coin flip but acceptable
  else if (probProfit >= 0.35) score += 10;  // 35-45% — below even odds
  else if (probProfit >= 0.25) score -= 5;   // 25-35% — unfavorable
  else if (probProfit >= 0.15) score -= 15;  // 15-25% — long shot
  else score -= 25;                           // < 15% — lottery ticket

  // DTE sweet spot bonus (14-60 days gives time for thesis to play out)
  if (dte >= 14 && dte <= 60) score += 10;
  else if (dte >= 7 && dte <= 90) score += 5;
  else if (dte < 5) score -= 10;   // Very short — theta crushes probability
  else if (dte > 180) score -= 5;  // Very long — capital locked up

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

  const isITM = isCall ? underlyingPrice > strike : underlyingPrice < strike;
  const moneyness = Math.abs(underlyingPrice - strike) / underlyingPrice;

  if (isITM) {
    score += 15;
    if (moneyness < 0.05) score += 10;
  } else {
    if (moneyness < 0.03) score += 15;
    else if (moneyness < 0.07) score += 5;
    else if (moneyness < 0.15) score -= 5;
    else score -= 20;
  }

  if (dte >= 14 && dte <= 60) score += 15;
  else if (dte >= 7 && dte <= 90) score += 5;
  else if (dte < 7) score -= 15;
  else if (dte > 180) score -= 5;

  return Math.min(100, Math.max(0, score));
}

// ─── FACTOR 5: LIQUIDITY (15%) ──────────────────────────────────────────────
function scoreLiquidity(c) {
  let score = 30;
  const bid = c.bid || 0;
  const ask = c.ask || 0;
  const volume = c.volume || 0;
  const openInterest = c.openInterest || 0;

  // Bid-Ask spread (tighter = better fills = lower slippage)
  if (bid > 0 && ask > 0) {
    const spread = (ask - bid) / ask;
    if (spread < 0.03) score += 35;       // Penny-wide — institutional quality
    else if (spread < 0.08) score += 25;  // Tight — good fills
    else if (spread < 0.15) score += 10;  // Acceptable
    else if (spread > 0.30) score -= 15;  // Wide — slippage risk
  }

  // Volume
  if (volume > 5000) score += 20;        // Very active
  else if (volume > 1000) score += 15;
  else if (volume > 100) score += 10;
  else if (volume > 10) score += 5;
  else score -= 10;                       // Ghost contract

  // Open interest
  if (openInterest > 10000) score += 15;  // Deep pool
  else if (openInterest > 5000) score += 12;
  else if (openInterest > 500) score += 8;
  else if (openInterest > 50) score += 3;
  else score -= 10;                        // No market maker interest

  return Math.min(100, Math.max(0, score));
}

// ─── FACTOR 6: TECHNICAL / MOMENTUM (10%) ───────────────────────────────────
// v2: Replaces hardcoded 65 with actual momentum signal from the underlying
function scoreTechnical(c) {
  let score = 50;

  // Use the underlying's daily % change if available
  const change = c.underlyingChange || 0;
  const isCall = (c.type || '').toLowerCase() === 'call';

  // Momentum alignment: is the stock moving in the direction of your bet?
  if (isCall) {
    if (change > 3) score += 25;          // Strong bullish momentum
    else if (change > 1) score += 15;     // Moderate bullish
    else if (change > 0) score += 5;      // Slight bullish
    else if (change < -2) score -= 15;    // Stock falling — fighting the trend
    else if (change < 0) score -= 5;      // Slight headwind
  } else {
    // Puts
    if (change < -3) score += 25;         // Strong bearish momentum
    else if (change < -1) score += 15;    // Moderate bearish
    else if (change < 0) score += 5;      // Slight bearish
    else if (change > 2) score -= 15;     // Stock rising — fighting the trend
    else if (change > 0) score -= 5;      // Slight headwind
  }

  // Bonus: ITM confirmation (price action already supports your thesis)
  if (c.inTheMoney) score += 10;

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
