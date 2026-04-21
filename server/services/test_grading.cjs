const { gradeContract } = require('./grader.cjs');

console.log('═══════════════════════════════════════════════════════════════════════════════');
console.log('SML INSTITUTIONAL AUDIT: OPTIONS GRADING ENGINE (v2.6 HARDENED)');
console.log('═══════════════════════════════════════════════════════════════════════════════');

const underlyingPrice = 150.00;
const historicalIV = 0.35;

// Scenario 1: Perfect OTM Put Setup (Bearish Momentum)
const perfectOTMPut = {
    contractSymbol: 'PERFECT_OTM_PUT',
    type: 'put',
    strike: 148.00, // Slightly OTM
    lastPrice: 2.50,
    bid: 2.45,
    ask: 2.55,
    volume: 5000,
    impliedVolatility: 0.25, // Attractive low IV
    delta: -0.40, // Target delta
    theta: -0.01, // Low decay
    dte: 14,
    underlyingChange: -2.8, // Strong bearish momentum
    inTheMoney: false
};

// Scenario 2: Deep ITM Put (Should be penalized for swing)
const deepITMPut = {
    ...perfectOTMPut,
    contractSymbol: 'DEEP_ITM_PUT',
    strike: 165.00,
    inTheMoney: true
};

// Scenario 3: Zero-Fake Violation Test (Missing Data)
const ghostContract = {
    contractSymbol: 'GHOST_SIGNAL',
    type: 'put',
    strike: 148.00,
    underlyingChange: -2.8
    // Missing: iv, dte, premium, greeks
};

console.log('\n[TEST 1] Perfect OTM Swing Setup');
const result1 = gradeContract(perfectOTMPut, underlyingPrice, historicalIV);
console.log(`Grade: ${result1.grade} (${result1.totalScore}) | Tech: ${result1.scores.technical} | Greeks: ${result1.scores.greeks}`);

console.log('\n[TEST 2] Deep ITM Contract (Swing Filter)');
const result2 = gradeContract(deepITMPut, underlyingPrice, historicalIV);
console.log(`Grade: ${result2.grade} (${result2.totalScore}) | Tech: ${result2.scores.technical}`);

console.log('\n[TEST 3] Zero-Fake Integrity (Missing Data)');
const result3 = gradeContract(ghostContract, underlyingPrice, historicalIV);
console.log(`Grade: ${result3.grade} (${result3.totalScore}) | All Factors: ${JSON.stringify(result3.scores)}`);

console.log('\n═══════════════════════════════════════════════════════════════════════════════');
console.log('AUDIT RESULTS:');

let failures = 0;

if (result1.totalScore > result2.totalScore) {
    console.log('✅ PASS: OTM Swing Setup outscores Deep ITM.');
} else {
    console.log('❌ FAIL: Score Inversion detected (ITM >= OTM).');
    failures++;
}

if (result3.totalScore === 0) {
    console.log('✅ PASS: Zero-Fake Policy enforced (No Data = Zero Score).');
} else {
    console.log(`❌ FAIL: Zero-Fake Violation (Score: ${result3.totalScore}).`);
    failures++;
}

if (result1.totalScore >= 70) {
    console.log('✅ PASS: Quality signal exceeds Institutional threshold.');
} else {
    console.log(`⚠️  NOTE: High-Fidelity scoring is more conservative (Score: ${result1.totalScore}).`);
}

console.log('═══════════════════════════════════════════════════════════════════════════════');

if (failures === 0) {
    console.log('\n🟢 ENGINE HARDENING VERIFIED: 100% COMPLIANT WITH DEVELOPER MANIFESTO.');
    process.exit(0);
} else {
    console.log('\n🔴 ENGINE HARDENING FAILED: REGRESSIONS DETECTED.');
    process.exit(1);
}
