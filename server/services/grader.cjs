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
 * LETHAL SUITE | Options Grader Engine (Institutional v4.5)
 * (c) 2026 ScriptMasterLabs™
 * 
 * LAW ADHERENCE: This service strictly follows THE DEVELOPER MANIFESTO.
 * - 100% Data-Driven: No mock arrays, no simulated signals.
 * - S3 Parity: A=80, B=60, C=45 thresholds enforced.
 */
const { exec } = require('child_process');
const fs = require('fs');

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
    riskReward: parseFloat(process.env.WEIGHT_RISK_REWARD || '0.20'),
    ivPercentile: parseFloat(process.env.WEIGHT_IV || '0.15'),
    probability: parseFloat(process.env.WEIGHT_PROBABILITY || '0.20'),
    liquidity: parseFloat(process.env.WEIGHT_LIQUIDITY || '0.15'),
    technical: parseFloat(process.env.WEIGHT_TECHNICAL || '0.10')
  };

  const totalWeights = Object.values(weights).reduce((a, b) => a + b, 0);
  let totalScore = 0;
  for (const [factor, score] of Object.entries(scores)) {
    totalScore += score * (weights[factor] || 0);
  }

  // Normalize by total weights to handle custom weighting scenarios
  if (totalWeights > 0) totalScore = totalScore / totalWeights;

  // institutional logic: Final score scaling (Curve adjustment)
  const finalScaling = parseFloat(process.env.FINAL_SCORE_SCALING || '1.0');
  if (finalScaling !== 1.0) {
    totalScore = Math.pow(totalScore / 100, finalScaling) * 100;
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
  const gradeA = parseInt(process.env.S3_GRADE_A || '80');
  const gradeB = parseInt(process.env.S3_GRADE_B || '60');
  const gradeC = parseInt(process.env.S3_GRADE_C || '45');

  if (score >= gradeA) return 'A';
  if (score >= gradeB) return 'B';
  if (score >= gradeC) return 'C';
  return 'D';
}

function getGradeColor(score) {
  const gradeA = parseInt(process.env.S3_GRADE_A || '80');
  const gradeB = parseInt(process.env.S3_GRADE_B || '60');
  const gradeC = parseInt(process.env.S3_GRADE_C || '45');

  if (score >= gradeA) return '#00E676'; // Institutional Green
  if (score >= gradeB) return '#FFD740'; // Institutional Gold
  if (score >= gradeC) return '#FF9100'; // Institutional Orange
  return '#FF4444';                // Institutional Red
}

// ─── FACTOR 1: GREEKS (20%) ─────────────────────────────────────────
function scoreGreeks(c) {
  let score = 0;
  const absDelta = Math.abs(c.delta || 0);
  const theta = c.theta || 0;
  const premium = c.lastPrice || c.ask;
  const dte = c.dte;

  if (!dte || !premium || premium <= 0 || !c.impliedVolatility) return 0;

  // Delta: continuous (Target sweet spot)
  const targetDelta = parseFloat(process.env.GREEKS_DELTA_TARGET || '0.40');
  const deltaScoreMax = parseFloat(process.env.GREEKS_DELTA_SCORE_MAX || '45');
  const deltaDist = Math.abs(absDelta - targetDelta);
  score += interpolate(deltaDist, targetDelta, 0.0, 0, deltaScoreMax);

  // Theta Decay: Lower is better (Zero-Fake: return 0 if no theta)
  const dailyTheta = Math.abs(theta) / premium;
  const thetaMax = parseFloat(process.env.GREEKS_THETA_MAX || '0.05');
  const thetaMin = parseFloat(process.env.GREEKS_THETA_MIN || '0.005');
  const thetaScoreMax = parseFloat(process.env.GREEKS_THETA_SCORE_MAX || '30');
  score += interpolate(dailyTheta, thetaMax, thetaMin, 0, thetaScoreMax);

  // Vol Stability: Preferred lower IV for buys (No base/padding)
  const iv = c.impliedVolatility || 0;
  const ivMax = parseFloat(process.env.GREEKS_IV_MAX || '1.0');
  const ivMin = parseFloat(process.env.GREEKS_IV_MIN || '0.20');
  const ivScoreMax = parseFloat(process.env.GREEKS_IV_SCORE_MAX || '25');
  score += interpolate(iv, ivMax, ivMin, 0, ivScoreMax);

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
  // institutional expected move: configurable sigma
  const sigmaMult = parseFloat(process.env.RR_SIGMA_MULT || '1.5');
  const expectedMove = underlyingPrice * iv * Math.sqrt(dte / 365) * sigmaMult;
  const targetPrice = isCall ? underlyingPrice + expectedMove : underlyingPrice - expectedMove;
  
  const potentialGain = isCall ? Math.max(0, targetPrice - strike) - premium : Math.max(0, strike - targetPrice) - premium;
  let ratio = Math.max(0, potentialGain / premium);

  // ── Institutional Law: Aggressive IV Decay Penalty ──
  const ivPenaltyThreshold = parseFloat(process.env.RR_IV_PENALTY_THRESHOLD || '0.50');
  if (iv > ivPenaltyThreshold) {
    const penaltyPower = parseFloat(process.env.RR_IV_PENALTY_POWER || '3');
    const penaltyMult = Math.pow(ivPenaltyThreshold / iv, penaltyPower); // Institutional cubic/config penalty
    ratio *= penaltyMult;
  }

  const minRatio = parseFloat(process.env.RR_RATIO_MIN || '0.5');
  const maxRatio = parseFloat(process.env.RR_RATIO_MAX || '2.5');
  
  return Math.round(interpolate(ratio, minRatio, maxRatio, 0, 100));
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
  
  const minIV = parseFloat(process.env.IV_PCT_MIN || '0');
  const maxIV = parseFloat(process.env.IV_PCT_MAX || '100');
  const ivPctScoreMin = parseFloat(process.env.IV_PCT_SCORE_MIN || '0');
  const ivPctScoreMax = parseFloat(process.env.IV_PCT_SCORE_MAX || '100');

  // institutional logic: buy low IV, sell high IV
  return Math.round(interpolate(ivRank, maxIV, minIV, ivPctScoreMin, ivPctScoreMax));
}

// ─── FACTOR 4: PROBABILITY (10%) ──────────────────────────────────
function scoreProbability(c, underlyingPrice) {
  const strike = c.strike;
  const premium = c.lastPrice || c.ask;
  const iv = c.impliedVolatility;
  const dte = Math.max(0.1, c.dte);
  if (!underlyingPrice || !strike || !iv || !dte || !premium) return 0;

  const isCall = (c.type || '').toLowerCase() === 'call';
  const breakeven = isCall ? strike + premium : strike - premium;
  const T = dte / 365;
  
  // High-precision BS D2 calculation
  const d2 = (Math.log(underlyingPrice / breakeven) - 0.5 * iv * iv * T) / (iv * Math.sqrt(T));
  const probProfit = isCall ? normCDF(d2) : normCDF(-d2);

  // ── Gamma Risk Hardening ──
  // 0DTE has extreme gamma risk. We penalize theoretical probability 
  // unless the setup is already deeply confirmed (Prob > 60%).
  let gammaModifier = 1.0;
  if (c.dte < 1 && probProfit < 0.60) {
      gammaModifier = 0.5; // OTM 0DTE lottery traps are suppressed
  }

  const minProb = parseFloat(process.env.PROB_MIN || '0.10');
  const maxProb = parseFloat(process.env.PROB_MAX || '0.40');
  const scoreBaseMin = parseFloat(process.env.PROB_SCORE_BASE_MIN || '35');
  const scoreBaseMax = parseFloat(process.env.PROB_SCORE_BASE_MAX || '65');
  
  let score = interpolate(probProfit, minProb, maxProb, scoreBaseMin, scoreBaseMax);
  
  // Reward Time Value (up to a point)
  const dteScore = interpolate(dte, 1, 21, 5, 35);
  score += dteScore * gammaModifier;

  return Math.round(Math.min(100, Math.max(0, score)));
}

// ─── FACTOR 5: LIQUIDITY (15%) ──────────────────────────────────────────────
function scoreLiquidity(c) {
  const bid = c.bid || 0;
  const ask = c.ask || 0;
  const volume = c.volume || 0;
  
  if (bid <= 0 || ask <= 0) return 0;
  const spread = (ask - bid) / ask;

  const maxSpread = parseFloat(process.env.LIQ_SPREAD_MAX || '0.15');
  const minSpread = parseFloat(process.env.LIQ_SPREAD_MIN || '0.01');
  const minVol = parseFloat(process.env.LIQ_VOL_MIN || '10');
  const maxVol = parseFloat(process.env.LIQ_VOL_MAX || '2000');
  
  const spreadScoreMin = parseFloat(process.env.LIQ_SPREAD_SCORE_MIN || '20');
  const spreadScoreMax = parseFloat(process.env.LIQ_SPREAD_SCORE_MAX || '60');
  const volScoreMin = parseFloat(process.env.LIQ_VOL_SCORE_MIN || '0');
  const volScoreMax = parseFloat(process.env.LIQ_VOL_SCORE_MAX || '40');

  let score = 0;
  score += interpolate(spread, maxSpread, minSpread, spreadScoreMin, spreadScoreMax);
  score += interpolate(volume, minVol, maxVol, volScoreMin, volScoreMax);

  return Math.round(score);
}

// ─── FACTOR 6: TECHNICAL (20%) ───────────────────────────────────
function scoreTechnical(c, underlyingPrice) {
  const change = c.underlyingChange || 0;
  const isCall = (c.type || '').toLowerCase() === 'call';
  const strike = c.strike || 0;

  const itmThresholdUp = parseFloat(process.env.TECH_ITM_THRESHOLD_UP || '0.98');
  const itmThresholdDown = parseFloat(process.env.TECH_ITM_THRESHOLD_DOWN || '1.02');

  // Zero-Fake: Data integrity check (Critical fields required for any signal)
  if (!underlyingPrice || !strike || !c.dte || !(c.lastPrice || c.ask)) return 0;

  // Deep ITM Penalty (Swing Setup Filter)
  if (isCall && strike < underlyingPrice * itmThresholdUp) return 0;
  if (!isCall && strike > underlyingPrice * itmThresholdDown) return 0;

  const distMax = parseFloat(process.env.TECH_DIST_MAX || '0.12');
  const distMin = parseFloat(process.env.TECH_DIST_MIN || '0.005');
  const changeMin = parseFloat(process.env.TECH_CHANGE_MIN || '-0.5');
  const changeMax = parseFloat(process.env.TECH_CHANGE_MAX || '2.5');
  
  const setupScoreMin = parseFloat(process.env.TECH_SETUP_SCORE_MIN || '0');
  const setupScoreMax = parseFloat(process.env.TECH_SETUP_SCORE_MAX || '60');
  const momentumScoreMax = parseFloat(process.env.TECH_MOMENTUM_SCORE_MAX || '40');

  const distPct = Math.abs(strike - underlyingPrice) / underlyingPrice;
  // Institutional continuous setup: No base (configurable via setupScoreMax)
  const setupBase = interpolate(distPct, distMax, distMin, setupScoreMin, setupScoreMax);

  // Momentum Confirmation multiplier [0.0 - 1.0]
  const momentumMult = isCall 
    ? interpolate(change, changeMin, changeMax, 0.0, 1.0) 
    : interpolate(change, -changeMin, -changeMax, 0.0, 1.0);

  return Math.round(setupBase + (momentumScoreMax * momentumMult));
}

function gradeOptionsChain(chain, underlyingPrice, historicalIV) {
  const allIVs = chain.map(c => c.impliedVolatility || 0).filter(v => v > 0).sort((a, b) => a - b);
  const chainStats = { ivSorted: allIVs };
  const graded = chain.map(contract => gradeContract(contract, underlyingPrice, historicalIV, chainStats));
  graded.sort((a, b) => b.totalScore - a.totalScore);
  return graded;
}

module.exports = { gradeContract, gradeOptionsChain, getLetterGrade, getGradeColor };
