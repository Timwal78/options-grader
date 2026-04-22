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
async function generateThesis(contract, underlyingPrice) {
  if (!process.env.ANTHROPIC_API_KEY) {
     return "Intelligence offline. Manual audit required.";
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
    console.error('[AI Thesis Error]', error.message);
    return "AI reasoning unavailable due to connection error.";
  }
}

module.exports = { generateThesis };
