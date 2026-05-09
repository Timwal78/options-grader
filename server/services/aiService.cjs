// ═══════════════════════════════════════════════════════════════════════════════
// AI Trade Thesis Service
// by ScriptMasterLabs™
// Translates complex greeks and scores into institutional-grade trade thesis
// ═══════════════════════════════════════════════════════════════════════════════

const { Anthropic } = require('@anthropic-ai/sdk');
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

/**
 * Generate a trade thesis for a specific contract using Claude-3
 * @param {Object} contract - The graded contract object
 * @param {number} underlyingPrice - Current stock price
 */
// Circuit breaker — flips to false after first credit exhaustion error
let _aiEnabled = true;

/**
 * Generate a trade thesis for a specific contract using Claude
 * Self-disables if Anthropic credits are exhausted to avoid cycle spam.
 */
async function generateThesis(contract, underlyingPrice) {
  // Circuit breaker: stop hammering after credits run out
  if (!_aiEnabled || !process.env.ANTHROPIC_API_KEY) {
    return _rulesThesis(contract, underlyingPrice);
  }

  const prompt = `
    You are a senior institutional derivatives trader at ScriptMasterLabs™.
    Analyze the following options contract and provide a concise, high-conviction "Trade Thesis" (exactly 1 formatted paragraph, max 80 words).
    
    TICKER: ${contract.contractSymbol}
    TYPE: ${contract.type.toUpperCase()}
    STRIKE: $${contract.strike}
    UNDERLYING PRICE: $${underlyingPrice}
    EXPIRATION: ${contract.expiration} (DTE: ${contract.dte} days)
    
    GREEKS: Delta: ${contract.delta} | Theta: ${contract.theta} | IV: ${(contract.impliedVolatility * 100).toFixed(1)}%
    GRADER RESULTS: Grade: ${contract.grade} | Total Score: ${contract.score || contract.totalScore}/100
    
    Synthesize the risk/reward and provide the strategic rationale. 
    Focus on the "why now" and the Greeks interaction.
    Output only the thesis text, no intro/outro.
  `;

  try {
    const message = await anthropic.messages.create({
      model: process.env.CLAUDE_MODEL || "claude-3-haiku-20240307",
      max_tokens: 200,
      messages: [{ role: "user", content: prompt }],
    });
    return message.content[0].text.trim();
  } catch (error) {
    // Detect credit exhaustion — disable for the session
    if (error.message?.includes('credit balance') || error.status === 402) {
      _aiEnabled = false;
      console.warn('[AI Thesis] Credits exhausted — switching to rules-based thesis. Re-enable by adding Anthropic credits.');
    }
    return _rulesThesis(contract, underlyingPrice);
  }
}

/**
 * Rules-based thesis fallback — zero API cost, always available.
 */
function _rulesThesis(contract, underlyingPrice) {
  const side = (contract.type || '').toUpperCase();
  const dte  = contract.dte || 0;
  const grade = contract.grade || 'N/A';
  const iv   = ((contract.impliedVolatility || 0) * 100).toFixed(0);
  const delta = Math.abs(contract.delta || 0).toFixed(2);
  const moneyness = contract.strike > underlyingPrice ? 'OTM' : 'ITM';
  const timeTag = dte <= 2 ? '0DTE scalp' : dte <= 7 ? 'weekly play' : 'swing trade';
  return `Grade ${grade} ${side} ${moneyness} — ${timeTag}. Delta ${delta}, IV ${iv}%, DTE ${dte}. ` +
         `${side === 'CALL' ? 'Bullish momentum structure' : 'Bearish pressure confirmed'}. ` +
         `Score-driven entry; manage at 50% gain or 30% loss.`;
}


module.exports = { generateThesis };
