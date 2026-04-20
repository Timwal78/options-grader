const { gradeContract } = require('./grader.cjs');

console.log('--- STARTING FORENSIC TEST: OPTIONS GRADER ---');

const underlyingPrice = 150.00;
const historicalIV = 0.35;

// Mock contracts
const otmPut = {
    contractSymbol: 'TEST_OTM_PUT',
    type: 'put',
    strike: 140.00, // OTM: Strike < Price
    lastPrice: 2.50,
    bid: 2.45,
    ask: 2.55,
    volume: 1500,
    openInterest: 5000,
    impliedVolatility: 0.40,
    delta: -0.30,
    gamma: 0.02,
    theta: -0.05,
    vega: 0.12,
    dte: 14,
    underlyingChange: -2.5, // Bearish momentum
    inTheMoney: false
};

const itmPut = {
    ...otmPut,
    contractSymbol: 'TEST_ITM_PUT',
    strike: 160.00, // ITM: Strike > Price
    inTheMoney: true
};

const fakeContract = {
    contractSymbol: 'FAKE_CONTRACT',
    type: 'put',
    strike: 140.00,
    // NO IV, NO DTE, NO PREMIUM (defaults were used before)
    underlyingChange: -2.5
};

console.log(`[TEST 1] OTM Put (Bearish Setup)`);
const otmResult = gradeContract(otmPut, underlyingPrice, historicalIV);
console.log(`Score: ${otmResult.totalScore}, Grade: ${otmResult.grade}, Status: ${otmResult.moneyness}, Tech Score: ${otmResult.scores.technical}`);

console.log('\n[TEST 2] ITM Put (Should be penalized)');
const itmResult = gradeContract(itmPut, underlyingPrice, historicalIV);
console.log(`Score: ${itmResult.totalScore}, Grade: ${itmResult.grade}, Status: ${itmResult.moneyness}, Tech Score: ${itmResult.scores.technical}`);

console.log('\n[TEST 3] Zero-Fake Verification (Missing IV/DTE)');
const fakeResult = gradeContract(fakeContract, underlyingPrice, historicalIV);
console.log(`Score: ${fakeResult.totalScore}, Tech Score: ${fakeResult.scores.technical}, Risk/Reward: ${fakeResult.scores.riskReward}`);

if (otmResult.scores.technical > itmResult.scores.technical) {
    console.log('\n✅ PASS: OTM Put favored over ITM Put for Bearish Setup.');
} else {
    console.log('\n❌ FAIL: ITM Put not penalized correctly.');
}

if (fakeResult.totalScore === 0 || fakeResult.scores.riskReward === 0) {
    console.log('✅ PASS: Zero-Fake policy enforced (No data = No score).');
} else {
    console.log('❌ FAIL: Zero-Fake policy violation detected.');
}

console.log('\n--- TEST COMPLETE ---');
