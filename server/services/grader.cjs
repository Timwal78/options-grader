// ═══════════════════════════════════════════════════════════════════════════════
// My Options Grader — Grading Engine
// by ScriptMasterLabs™
// 6-Factor scoring algorithm for options contracts
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Grade a single options contract on 6 factors (0-100 each)
 * Returns weighted score + letter grade
 */
function gradeContract(contract, underlyingPrice, historicalIV) {
  const scores = {
    greeks: scoreGreeks(contract),
    riskReward: scoreRiskReward(contract, underlyingPrice),
    ivPercentile: scoreIV(contract, historicalIV),
    probability: scoreProbability(contract, underlyingPrice),
    liquidity: scoreLiquidity(contract),
    technical: 65 // default neutral — upgraded with AI BYOK
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
function scoreGreeks(c) {
  let score = 50;
  const absDelta = Math.abs(c.delta || 0);
  const theta = c.theta || 0;
  const gamma = c.gamma || 0;
  const vega = c.vega || 0;

  // Delta sweet spot: 0.30-0.50 for directional, 0.15-0.30 for income
  if (absDelta >= 0.25 && absDelta <= 0.55) score += 20;
  else if (absDelta >= 0.15 && absDelta <= 0.70) score += 10;
  else if (absDelta > 0.85 || absDelta < 0.05) score -= 15;

  // Theta: positive = good for sellers, manageable decay for buyers
  if (c.type === 'put' || c.type === 'call') {
    // For buyers: theta shouldn't be too destructive relative to premium
    const thetaRatio = Math.abs(theta) / (c.lastPrice || 1);
    if (thetaRatio < 0.02) score += 15; // less than 2% daily decay
    else if (thetaRatio < 0.05) score += 5;
    else score -= 10;
  }

  // Gamma: moderate gamma is good (option sensitivity to underlying moves)
  if (gamma > 0.01 && gamma < 0.10) score += 10;
  else if (gamma >= 0.10) score += 5; // high gamma = volatile but opportunity

  // Vega: awareness of vol sensitivity
  if (Math.abs(vega) > 0 && Math.abs(vega) < 0.5) score += 5;

  return Math.min(100, Math.max(0, score));
}

// ─── FACTOR 2: RISK / REWARD (20%) ──────────────────────────────────────────
function scoreRiskReward(c, underlyingPrice) {
  let score = 50;
  const premium = c.lastPrice || c.ask || 0;
  if (premium <= 0) return 30;

  const strike = c.strike || 0;
  const isCall = (c.type || '').toLowerCase() === 'call';

  // Max loss for buyer = premium paid
  const maxLoss = premium;

  // Estimate potential gain (simplified)
  let potentialGain;
  if (isCall) {
    // For calls: (underlying * 1.1 - strike) - premium (10% move scenario)
    potentialGain = Math.max(0, (underlyingPrice * 1.10 - strike)) - premium;
  } else {
    // For puts: (strike - underlying * 0.90) - premium (10% drop scenario)
    potentialGain = Math.max(0, (strike - underlyingPrice * 0.90)) - premium;
  }

  if (potentialGain <= 0) {
    score -= 20; // potential loss even with favorable move
  } else {
    const ratio = potentialGain / maxLoss;
    if (ratio >= 3) score += 35; // 3:1 or better
    else if (ratio >= 2) score += 25;
    else if (ratio >= 1.5) score += 15;
    else if (ratio >= 1) score += 5;
    else score -= 10;
  }

  // Penalize very expensive contracts (high premium relative to underlying)
  const premiumRatio = premium / underlyingPrice;
  if (premiumRatio > 0.15) score -= 15; // premium > 15% of stock price
  else if (premiumRatio < 0.03) score += 10; // cheap relative to underlying

  return Math.min(100, Math.max(0, score));
}

// ─── FACTOR 3: IV PERCENTILE (15%) ──────────────────────────────────────────
function scoreIV(c, historicalIV) {
  let score = 50;
  const iv = c.impliedVolatility || 0;
  const hist = historicalIV || iv; // fallback to current if no historical

  if (iv <= 0 || hist <= 0) return 50; // can't evaluate

  const ivPercentile = (iv / hist) * 50; // rough percentile estimate

  // For buyers: lower IV = cheaper options = better
  // For sellers: higher IV = more premium = better
  // We grade from a buyer perspective (most retail)
  if (ivPercentile < 30) score += 30; // IV is low — options are cheap
  else if (ivPercentile < 50) score += 15;
  else if (ivPercentile < 70) score += 0; // neutral
  else if (ivPercentile < 85) score -= 10; // getting expensive
  else score -= 25; // IV is elevated — risky to buy

  // Store the percentile for display
  c.ivPercentile = Math.round(ivPercentile);

  return Math.min(100, Math.max(0, score));
}

// ─── FACTOR 4: PROBABILITY OF PROFIT (20%) ──────────────────────────────────
function scoreProbability(c, underlyingPrice) {
  let score = 50;
  const strike = c.strike || 0;
  const premium = c.lastPrice || c.ask || 0;
  const isCall = (c.type || '').toLowerCase() === 'call';
  const dte = c.dte || 30;

  // Calculate breakeven
  const breakeven = isCall ? strike + premium : strike - premium;

  // Distance from current price to breakeven (as %)
  const distance = Math.abs(breakeven - underlyingPrice) / underlyingPrice;

  // Is the contract ITM, ATM, or OTM?
  const isITM = isCall ? underlyingPrice > strike : underlyingPrice < strike;
  const moneyness = Math.abs(underlyingPrice - strike) / underlyingPrice;

  if (isITM) {
    score += 15; // already in the money
    if (moneyness < 0.05) score += 10; // near ATM — liquid
  } else {
    if (moneyness < 0.03) score += 15; // near ATM
    else if (moneyness < 0.07) score += 5; // slightly OTM
    else if (moneyness < 0.15) score -= 5; // moderate OTM
    else score -= 20; // far OTM — lottery ticket
  }

  // Reasonable DTE (not too short, not too long)
  if (dte >= 14 && dte <= 60) score += 15; // sweet spot
  else if (dte >= 7 && dte <= 90) score += 5;
  else if (dte < 7) score -= 15; // too close to expiry
  else if (dte > 180) score -= 5; // too far out (costly)

  return Math.min(100, Math.max(0, score));
}

// ─── FACTOR 5: LIQUIDITY (15%) ──────────────────────────────────────────────
function scoreLiquidity(c) {
  let score = 30;
  const bid = c.bid || 0;
  const ask = c.ask || 0;
  const volume = c.volume || 0;
  const openInterest = c.openInterest || 0;

  // Bid-Ask spread
  if (bid > 0 && ask > 0) {
    const spread = (ask - bid) / ask;
    if (spread < 0.03) score += 35; // tight spread — very liquid
    else if (spread < 0.08) score += 25;
    else if (spread < 0.15) score += 10;
    else if (spread > 0.30) score -= 15; // wide spread — illiquid
  }

  // Volume
  if (volume > 1000) score += 15;
  else if (volume > 100) score += 10;
  else if (volume > 10) score += 5;
  else score -= 10;

  // Open interest
  if (openInterest > 5000) score += 15;
  else if (openInterest > 500) score += 10;
  else if (openInterest > 50) score += 5;
  else score -= 10;

  return Math.min(100, Math.max(0, score));
}

// ─── GRADE FULL OPTIONS CHAIN ────────────────────────────────────────────────
function gradeOptionsChain(chain, underlyingPrice, historicalIV) {
  const graded = chain.map(contract =>
    gradeContract(contract, underlyingPrice, historicalIV)
  );

  // Sort by total score descending
  graded.sort((a, b) => b.totalScore - a.totalScore);

  return graded;
}

module.exports = { gradeContract, gradeOptionsChain, getLetterGrade, getGradeColor };
