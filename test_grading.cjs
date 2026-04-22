const { gradeContract } = require('./server/services/grader.cjs');

// Zero-Fake Test Case: Realistic AAPL Institutional Setup
const contract = {
  symbol: 'AAPL_051624C190',
  type: 'call',
  strike: 190.00,
  lastPrice: 3.45,
  ask: 3.50,
  bid: 3.40,
  delta: 0.42,
  theta: -0.045,
  gamma: 0.02,
  vega: 0.08,
  impliedVolatility: 0.22,
  dte: 15,
  volume: 4500,
  openInterest: 12000,
  inTheMoney: false
};

const underlyingPrice = 188.50;
const historicalIV = 0.18; // HV for Sigma calculation
const chainStats = {
    ivSorted: [0.15, 0.18, 0.22, 0.25, 0.30],
    ivMedian: 0.22,
    ivCount: 5
};

console.log("─── THE OPTIONS EDGE™ | INSTITUTIONAL AUDIT ───");
const result = gradeContract(contract, underlyingPrice, historicalIV, chainStats);

if (result) {
    console.log("STATUS: CERTIFIED PURE (ZERO-FAKE APPROVED)");
    console.log(`GRADE: ${result.grade} (${result.totalScore}/100)`);
    console.log("FACTORS:", JSON.stringify(result.scores, null, 2));
} else {
    console.log("STATUS: REJECTED (ZERO-FAKE VIOLATION)");
}
