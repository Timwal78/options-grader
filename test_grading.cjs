const { gradeContract } = require('./server/services/grader.cjs');

const mockContract = {
  symbol: 'AAPL_051624C190',
  type: 'call',
  strike: 190,
  lastPrice: 2.50,
  ask: 2.55,
  bid: 2.45,
  delta: 0.45,
  theta: -0.05,
  gamma: 0.03,
  vega: 0.08,
  impliedVolatility: 0.28,
  dte: 25,
  volume: 1200,
  openInterest: 8000,
  inTheMoney: false
};

const underlyingPrice = 185;
const historicalIV = 0.25;
const chainStats = {
    ivSorted: [0.20, 0.22, 0.25, 0.28, 0.35],
    ivMedian: 0.25,
    ivCount: 5
};

const result = gradeContract(mockContract, underlyingPrice, historicalIV, chainStats);
console.log(JSON.stringify(result, null, 2));
