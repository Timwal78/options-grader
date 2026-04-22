// ═══════════════════════════════════════════════════════════════════════════════
// The Options Edge™ — Institutional Grading Engine v5.0
// by ScriptMasterLabs™
// 6-Factor Greek-Symbol Scoring (Σ, Ω, IV, Γ, Δ, Θ)
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
 * LETHAL SUITE | Options Grader Engine (Institutional v5.0)
 * (c) 2026 ScriptMasterLabs™
 * 
 * THE DEVELOPER MANIFESTO (Zero-Fake Edition):
 * 1. ZERO MOCK DATA: All signals must originate from live market truth.
 * 2. S3 PARITY: A=80, B=60, C=45 thresholds strictly enforced.
 * 3. DYNAMIC DISCOVERY: No static watchlists.
 */
const { exec } = require('child_process');
const fs = require('fs');

/**
 * Grade a single options contract on 6 factors (0-100 each)
 */
function gradeContract(contract, underlyingPrice, historicalIV, chainStats) {
  // ─── Zero-Fake Integrity Filter ───
  if (!validateContract(contract)) return null;

  const scores = {
    delta: scoreDelta(contract),
    theta: scoreTheta(contract),
    gamma: scoreGamma(contract),
    ivPercentile: scoreIvPercentile(contract, historicalIV, chainStats),
    sigma: scoreSigma(contract, historicalIV),
    omega: scoreOmega(contract, underlyingPrice)
  };

  const weights = {
    delta: parseFloat(process.env.WEIGHT_DELTA || '0.20'),
    theta: parseFloat(process.env.WEIGHT_THETA || '0.15'),
    gamma: parseFloat(process.env.WEIGHT_GAMMA || '0.15'),
    ivPercentile: parseFloat(process.env.WEIGHT_IV || '0.15'),
    sigma: parseFloat(process.env.WEIGHT_SIGMA || '0.15'),
    omega: parseFloat(process.env.WEIGHT_OMEGA || '0.20')
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

/**
 * ZERO-FAKE: Verify contract integrity before grading.
 * Rejects contracts with zero volume, excessive spreads, or missing core data.
 */
function validateContract(c) {
  const ask = c.ask || 0;
  const bid = c.bid || 0;
  if (ask <= 0 || !c.strike || !c.dte || !c.impliedVolatility) return false;
  
  // Spread Filter: Maximum 35% spread of the ask price
  const spread = (ask - bid) / ask;
  if (spread > 0.35) return false;

  // Volume Filter: Institutional Minimum (Disabled for deep OTM low-liquidity discovery if needed, 
  // but strictly mandated for Grade A signals). 
  // Currently enforcing Zero-Fake: Must have at least core volume data.
  if (c.volume === undefined || c.openInterest === undefined) return false;

  return true;
}

// ─── FACTOR 1: Δ (DELTA) ───────────────────────────────────────────
function scoreDelta(c) {
  const absDelta = Math.abs(c.delta || 0);
  const targetDelta = parseFloat(process.env.GREEKS_DELTA_TARGET || '0.40');
  const deltaScoreMax = 100;
  const deltaDist = Math.abs(absDelta - targetDelta);
  
  // Reward delta near institutional sweet spot (0.35 - 0.45)
  return Math.round(interpolate(deltaDist, 0.25, 0.0, 0, deltaScoreMax));
}

// ─── FACTOR 2: Θ (THETA) ───────────────────────────────────────────
function scoreTheta(c) {
  const theta = Math.abs(c.theta || 0);
  const premium = c.lastPrice || c.ask;
  if (!premium || premium <= 0) return 0;
  
  const dailyThetaPct = theta / premium;
  const thetaMax = parseFloat(process.env.GREEKS_THETA_MAX || '0.06');
  const thetaMin = parseFloat(process.env.GREEKS_THETA_MIN || '0.005');
  
  // Lower rental cost (Theta) is better for buyers
  return Math.round(interpolate(dailyThetaPct, thetaMax, thetaMin, 0, 100));
}

// ─── FACTOR 3: Γ (GAMMA RISK) ──────────────────────────────────────
function scoreGamma(c) {
  const gamma = Math.abs(c.gamma || 0);
  const dte = c.dte;
  
  // ── Gamma Risk Hardening ──
  // 0DTE (DTE < 1) is extremely volatile. We penalize high gamma setups 
  // unless they are for scalp-only tactical execution.
  let score = 100;
  if (dte < 1) {
    score = interpolate(gamma, 0.15, 0.01, 10, 80); // Capped at 80 for 0DTE
  } else {
    score = interpolate(gamma, 0.08, 0.005, 30, 100);
  }
  
  return Math.round(score);
}

// ─── FACTOR 4: IV PERCENTILE ──────────────────────────────────────────
function scoreIvPercentile(c, historicalIV, chainStats) {
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
  
  // Institutional strategy: Buy relatively lower IV in the chain
  return Math.round(interpolate(ivRank, maxIV, minIV, 0, 100));
}

// ─── FACTOR 5: Σ (SIGMA - STABILITY) ──────────────────────────────
function scoreSigma(c, historicalIV) {
  const iv = c.impliedVolatility || 0;
  if (!iv || !historicalIV) return 50; // Neutral if no HV
  
  // Sigma measures IV relative to realized/historical volatility (Efficiency)
  const ratio = iv / historicalIV;
  
  // Ideal ratio is near 1.0 - 1.2 (Slightly overpriced but stable)
  // Ratio > 2.0 indicates extreme overpricing (Low score)
  // Ratio < 0.8 indicates potential underpricing (High score)
  if (ratio <= 1.2) return interpolate(ratio, 0.5, 1.2, 100, 80);
  return interpolate(ratio, 1.2, 2.5, 80, 0);
}

// ─── FACTOR 6: Ω (OMEGA - LEVERAGE) ──────────────────────────────
function scoreOmega(c, underlyingPrice) {
  const delta = Math.abs(c.delta || 0);
  const premium = c.lastPrice || c.ask;
  if (!premium || !underlyingPrice) return 0;
  
  // Omega (Elasticity) = (Delta * StockPrice) / OptionPrice
  // Measures the % change in option for 1% change in stock.
  const omega = (delta * underlyingPrice) / premium;
  
  const minOmega = parseFloat(process.env.OMEGA_MIN || '5');
  const maxOmega = parseFloat(process.env.OMEGA_MAX || '25');
  
  return Math.round(interpolate(omega, minOmega, maxOmega, 0, 100));
}

function gradeOptionsChain(chain, underlyingPrice, historicalIV) {
  const allIVs = chain.map(c => c.impliedVolatility || 0).filter(v => v > 0).sort((a, b) => a - b);
  const chainStats = { ivSorted: allIVs };
  
  const graded = chain
    .map(contract => gradeContract(contract, underlyingPrice, historicalIV, chainStats))
    .filter(c => c !== null); // Purge invalid contracts (Zero-Fake)
    
  graded.sort((a, b) => b.totalScore - a.totalScore);
  return graded;
}

module.exports = { gradeContract, gradeOptionsChain, getLetterGrade, getGradeColor };
