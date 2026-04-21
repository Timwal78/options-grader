/**
 * FORENSIC DIAGNOSTIC: Why can't contracts score above C+ (68)?
 * 
 * This test creates "perfect" contracts with ideal values for every factor
 * and traces the exact score from each scoring function.
 */
const { gradeContract } = require('./grader.cjs');

console.log('═══════════════════════════════════════════════════════════');
console.log('  FORENSIC SCORING DIAGNOSTIC — SML Options Grader');
console.log('═══════════════════════════════════════════════════════════\n');

const price = 150.00;
const histIV = 0.30;

// A "PERFECT" OTM Call — everything ideal: sweet-spot delta, low theta,
// good gamma, low IV, high liquidity, bullish momentum, DTE 30d
const perfectCall = {
  contractSymbol: 'PERFECT_CALL', type: 'call',
  strike: 155.00,  // OTM Call (strike > price)
  lastPrice: 3.00, bid: 2.95, ask: 3.05,
  volume: 8000, openInterest: 15000,
  impliedVolatility: 0.22,  // Low IV = cheap
  delta: 0.40, gamma: 0.03, theta: -0.02, vega: 0.08,
  dte: 30, underlyingChange: 3.5,  // Strong bullish momentum
  inTheMoney: false
};

// A "PERFECT" OTM Put — mirror image
const perfectPut = {
  contractSymbol: 'PERFECT_PUT', type: 'put',
  strike: 145.00,  // OTM Put (strike < price)
  lastPrice: 2.50, bid: 2.45, ask: 2.55,
  volume: 6000, openInterest: 12000,
  impliedVolatility: 0.22,
  delta: -0.35, gamma: 0.025, theta: -0.015, vega: 0.07,
  dte: 30, underlyingChange: -3.5,  // Strong bearish momentum
  inTheMoney: false
};

// A mediocre contract — to see if it still lands at 68
const mediocreCall = {
  contractSymbol: 'MEDIOCRE_CALL', type: 'call',
  strike: 155.00, lastPrice: 3.00, bid: 2.50, ask: 3.50,
  volume: 50, openInterest: 200,
  impliedVolatility: 0.55,  // High IV = expensive
  delta: 0.40, gamma: 0.03, theta: -0.08, vega: 0.15,
  dte: 30, underlyingChange: 0.2,  // Flat
  inTheMoney: false
};

function diagnose(label, contract) {
  const result = gradeContract(contract, price, histIV);
  console.log(`── ${label} ──`);
  console.log(`  Greeks:      ${result.scores.greeks}`);
  console.log(`  Risk/Reward: ${result.scores.riskReward}`);
  console.log(`  IV Pctile:   ${result.scores.ivPercentile}`);
  console.log(`  Probability: ${result.scores.probability}`);
  console.log(`  Liquidity:   ${result.scores.liquidity}`);
  console.log(`  Technical:   ${result.scores.technical}`);
  console.log(`  ─────────────────────────────`);
  console.log(`  TOTAL:       ${result.totalScore}  (${result.grade})`);
  
  // Calculate what the weighted sum should be
  const w = { greeks: 0.20, riskReward: 0.20, ivPercentile: 0.15, probability: 0.20, liquidity: 0.15, technical: 0.10 };
  let weightedSum = 0;
  for (const [k, v] of Object.entries(result.scores)) {
    const contribution = v * w[k];
    weightedSum += contribution;
    console.log(`    ${k}: ${v} x ${w[k]} = ${contribution.toFixed(1)}`);
  }
  console.log(`  Weighted Sum (raw): ${weightedSum.toFixed(1)}`);
  console.log('');
}

diagnose('PERFECT OTM CALL (should be A/A+)', perfectCall);
diagnose('PERFECT OTM PUT (should be A/A+)', perfectPut);
diagnose('MEDIOCRE CALL (should be lower)', mediocreCall);

console.log('═══════════════════════════════════════════════════════════');
console.log('  ANALYSIS');
console.log('═══════════════════════════════════════════════════════════');
console.log('If all three contracts score near 68 (C+), the scoring');
console.log('functions have a ceiling problem: each factor starts at');
console.log('50 and can only add ~20-35 points, but is clamped to 100.');
console.log('The WEIGHTED AVERAGE of six factors starting at ~65-75');
console.log('will always land near 68-72 regardless of quality.');
console.log('');
console.log('FIX: Increase bonus magnitudes or shift the baseline.');
