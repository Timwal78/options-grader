/**
 * FORENSIC DIAGNOSTIC v3.0: Institutional Signal Integrity Audit
 * 
 * Target: Ensure "Elite" signals reach 90+ (A+) and "Noisy" signals
 * are severely penalized (Score < 60) via High-IV penalty.
 */
const { gradeContract } = require('./grader.cjs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

console.log('═══════════════════════════════════════════════════════════');
console.log('  FORENSIC SCORING AUDIT — SML Options Grader Hardened');
console.log('═══════════════════════════════════════════════════════════\n');

const price = 150.00;
const histIV = 0.30;

// Mock chain stats to test IV Percentile (Factor 3)
const chainStats = {
  ivSorted: [0.15, 0.18, 0.20, 0.22, 0.25, 0.30, 0.35, 0.40, 0.50, 0.60]
};

const perfectCall = {
  contractSymbol: 'SML_HIGH_CONVICTION_CALL', type: 'call',
  strike: 155.00, lastPrice: 3.00, bid: 2.95, ask: 3.05,
  volume: 1800, openInterest: 15000,
  impliedVolatility: 0.21, // Low IV relative to chain
  delta: 0.40, gamma: 0.03, theta: -0.02,
  dte: 30, underlyingChange: 3.5, inTheMoney: false
};

const noisyCall = {
  contractSymbol: 'NOISY_RETAIL_LOTTO', type: 'call',
  strike: 175.00, lastPrice: 0.50, bid: 0.45, ask: 0.55,
  volume: 50, openInterest: 200,
  impliedVolatility: 0.85, // Extremely high IV penalty
  delta: 0.15, theta: -0.10,
  dte: 7, underlyingChange: 1.2, inTheMoney: false
};

function diagnose(label, contract) {
  const result = gradeContract(contract, price, histIV, chainStats);
  console.log(`── ${label} ──`);
  console.log(`  Contract:    ${result.contractSymbol}`);
  console.log(`  Greeks:      ${result.scores.greeks}`);
  console.log(`  Risk/Reward: ${result.scores.riskReward}`);
  console.log(`  IV Pctile:   ${result.scores.ivPercentile}`);
  console.log(`  Probability: ${result.scores.probability}`);
  console.log(`  Liquidity:   ${result.scores.liquidity}`);
  console.log(`  Technical:   ${result.scores.technical}`);
  console.log(`  ─────────────────────────────`);
  console.log(`  TOTAL:       ${result.totalScore}  (${result.grade})`);
  
  const w = {
    greeks: parseFloat(process.env.WEIGHT_GREEKS || '0.20'),
    riskReward: parseFloat(process.env.WEIGHT_RISK_REWARD || '0.20'),
    ivPercentile: parseFloat(process.env.WEIGHT_IV || '0.15'),
    probability: parseFloat(process.env.WEIGHT_PROBABILITY || '0.20'),
    liquidity: parseFloat(process.env.WEIGHT_LIQUIDITY || '0.15'),
    technical: parseFloat(process.env.WEIGHT_TECHNICAL || '0.10')
  };

  let weightedSum = 0;
  for (const [k, v] of Object.entries(result.scores)) {
    const contribution = v * w[k];
    weightedSum += contribution;
    console.log(`    ${k.padEnd(12)}: ${String(v).padStart(3)} x ${w[k].toFixed(2)} = ${contribution.toFixed(1)}`);
  }
  console.log(`  Weighted Sum (raw): ${weightedSum.toFixed(1)}`);
  console.log('');
}

diagnose('ELITE SETUP (A+ EXPECTED)', perfectCall);
diagnose('NOISY SETUP (D/F EXPECTED)', noisyCall);

console.log('═══════════════════════════════════════════════════════════');
console.log('  AUDIT RESULTS');
console.log('═══════════════════════════════════════════════════════════');
console.log('Institutional Goal: Filter noise, amplify signal.');
console.log('Verifying No-Fake policy and institutional scaling.');
