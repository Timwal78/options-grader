// ═══════════════════════════════════════════════════════════════════════════════
// My Options Grader — Grading Engine v2.5 (High-Fidelity)
// by ScriptMasterLabs™
// 6-Factor scoring algorithm — Institutional-grade, Formula-driven
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Standard normal CDF approximation (Abramowitz & Stegun)
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
 * Helper to interpolate values. Handles both ascending and descending input ranges.
 */
function interpolate(val, inMin, inMax, outMin, outMax) {
  if (inMin < inMax) {
    if (val <= inMin) return outMin;
    if (val >= inMax) return outMax;
  } else {
    // Descending range (e.g., spread 0.20 -> 0.01)
    if (val >= inMin) return outMin;
    if (val <= inMax) return outMax;
  }
  return outMin + (outMax - outMin) * (val - inMin) / (inMax - inMin);
}

/**
 * Grade a single options contract on 6 factors (0-100 each)
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
    riskReward: parseFloat(process.env.WEIGHT_RISK_REWARD || '0.25'),
    ivPercentile: parseFloat(process.env.WEIGHT_IV || '0.10'),
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
  if (score >= 90) return 'A+';
  if (score >= 85) return 'A';
  if (score >= 80) return 'B+';
  if (score >= 72) return 'B';
  if (score >= 62) return 'C+';
  if (score >= 50) return 'C';
  if (score >= 35) return 'D';
  return 'F';
}

function getGradeColor(score) {
  if (score >= 80) return '#00E676';
  if (score >= 62) return '#FFD740';
  if (score >= 50) return '#FF9100';
  return '#FF4444';
}

// ─── FACTOR 1: GREEKS (20%) ─────────────────────────────────────────
function scoreGreeks(c) {
  let score = 0;
  const absDelta = Math.abs(c.delta || 0);
  const theta = c.theta || 0;
  const premium = c.lastPrice || c.ask;
  const dte = c.dte;

  if (!dte || !premium || premium <= 0) return 0;

  // Delta: continuous (Target 0.40)
  const deltaDist = Math.abs(absDelta - 0.40);
  score += interpolate(deltaDist, 0.40, 0.0, 0, 40);

  // Theta Decay: Lower is better
  const dailyTheta = Math.abs(theta) / premium;
  score += interpolate(dailyTheta, 0.05, 0.005, 0, 30);

  // Vol Stability
  const iv = c.impliedVolatility || 0;
  score += interpolate(iv, 1.0, 0.20, 5, 30);

  return Math.round(score);
}

// ─── FACTOR 2: RISK / REWARD (25%) ──────────────────────────────────────────
function scoreRiskReward(c, underlyingPrice) {
  const premium = c.lastPrice || c.ask;
  const iv = c.impliedVolatility;
  const dte = c.dte;
  const strike = c.strike;
  if (!premium || !underlyingPrice || !iv || !dte || !strike) return 0;

  const isCall = (c.type || '').toLowerCase() === 'call';
  const expectedMove = underlyingPrice * iv * Math.sqrt(dte / 365) * 1.5;
  const targetPrice = isCall ? underlyingPrice + expectedMove : underlyingPrice - expectedMove;
  
  const potentialGain = isCall ? Math.max(0, targetPrice - strike) - premium : Math.max(0, strike - targetPrice) - premium;
  const ratio = Math.max(0, potentialGain / premium);

  return Math.round(interpolate(ratio, 0.5, 3.5, 10, 100));
}

// ─── FACTOR 3: IV PERCENTILE (10%) ──────────────────────────────────────────
function scoreIV(c, historicalIV, chainStats) {
  const iv = c.impliedVolatility || 0;
  if (iv <= 0) return 0;
  
  let ivRank = 50;
  if (chainStats && chainStats.ivSorted && chainStats.ivSorted.length > 0) {
    const sorted = chainStats.ivSorted;
    let below = 0;
    for (const chainIV of sorted) if (chainIV < iv) below++;
    ivRank = (below / sorted.length) * 100;
  }
  
  return Math.round(interpolate(ivRank, 100, 0, 0, 100));
}

// ─── FACTOR 4: PROBABILITY (10%) ──────────────────────────────────
function scoreProbability(c, underlyingPrice) {
  const strike = c.strike;
  const premium = c.lastPrice || c.ask;
  const iv = c.impliedVolatility;
  const dte = c.dte;
  if (!underlyingPrice || !strike || !iv || !dte || !premium) return 0;

  const isCall = (c.type || '').toLowerCase() === 'call';
  const breakeven = isCall ? strike + premium : strike - premium;
  const T = dte / 365;
  const d2 = (Math.log(underlyingPrice / breakeven) - 0.5 * iv * iv * T) / (iv * Math.sqrt(T));
  const probProfit = isCall ? normCDF(d2) : normCDF(-d2);

  let score = interpolate(probProfit, 0.10, 0.60, 0, 65);
  score += interpolate(dte, 3, 21, 5, 35) * (dte > 60 ? interpolate(dte, 60, 180, 1.0, 0.2) : 1.0);

  return Math.round(Math.min(100, Math.max(0, score)));
}

// ─── FACTOR 5: LIQUIDITY (15%) ──────────────────────────────────────────────
function scoreLiquidity(c) {
  const bid = c.bid || 0;
  const ask = c.ask || 0;
  const volume = c.volume || 0;
  
  if (bid <= 0 || ask <= 0) return 0;
  const spread = (ask - bid) / ask;

  let score = 0;
  score += interpolate(spread, 0.15, 0.01, 0, 60);
  score += interpolate(volume, 10, 5000, 0, 40);

  return Math.round(score);
}

// ─── FACTOR 6: TECHNICAL (20%) ───────────────────────────────────
function scoreTechnical(c, underlyingPrice) {
  const change = c.underlyingChange || 0;
  const isCall = (c.type || '').toLowerCase() === 'call';
  const strike = c.strike || 0;

  if (isCall && strike <= underlyingPrice) return 0;
  if (!isCall && strike >= underlyingPrice) return 0;

  const distPct = Math.abs(strike - underlyingPrice) / underlyingPrice;
  const setupBase = interpolate(distPct, 0.12, 0.005, 10, 60);

  const momentumMult = isCall ? interpolate(change, -0.5, 2.5, 0.3, 1.0) : interpolate(change, 0.5, -2.5, 0.3, 1.0);

  return Math.round(setupBase + (40 * momentumMult));
}

function gradeOptionsChain(chain, underlyingPrice, historicalIV) {
  const allIVs = chain.map(c => c.impliedVolatility || 0).filter(v => v > 0).sort((a, b) => a - b);
  const chainStats = { ivSorted: allIVs };
  const graded = chain.map(contract => gradeContract(contract, underlyingPrice, historicalIV, chainStats));
  graded.sort((a, b) => b.totalScore - a.totalScore);
  return graded;
}

module.exports = { gradeContract, gradeOptionsChain, getLetterGrade, getGradeColor };
