// ═══════════════════════════════════════════════════════════════════════════════
// AI Trade Thesis Service
// by ScriptMasterLabs™
// Translates complex greeks and scores into institutional-grade trade thesis
// ═══════════════════════════════════════════════════════════════════════════════

const { OpenAI } = require('openai');

/**
 * Generate a trade thesis for a specific contract
 * @param {Object} contract - The graded contract object
 * @param {number} underlyingPrice - Current stock price
 * @param {string} apiKey - OpenAI API key (BYOK)
 */
async function generateThesis(contract, underlyingPrice, apiKey) {
  if (!apiKey) throw new Error('OpenAI API Key is required for Trade Thesis');

  const openai = new OpenAI({ apiKey });

  const prompt = `
    You are an institutional options strategist at a top-tier hedge fund. 
    Analyze the following options contract and provide a concise, high-conviction "Trade Thesis" (max 100 words).
    
    TICKER: ${contract.contractSymbol}
    TYPE: ${contract.type.toUpperCase()}
    STRIKE: $${contract.strike}
    UNDERLYING PRICE: $${underlyingPrice}
    EXPIRATION: ${contract.expiration} (DTE: ${contract.dte} days)
    
    GREEKS:
    - Delta: ${contract.delta}
    - Theta: ${contract.theta}
    - Gamma: ${contract.gamma}
    - Implied Volatility: ${(contract.impliedVolatility * 100).toFixed(1)}%
    
    GRADER RESULTS:
    - Overall Grade: ${contract.grade}
    - Total Score: ${contract.totalScore}/100
    - Risk/Reward Score: ${contract.scores.riskReward}
    - Probability Score: ${contract.scores.probability}
    
    Format your response as a professional bulleted analysis:
    1. Strategic Rationale (Why this contract?)
    2. Greek Dynamics (What are the greeks telling us?)
    3. Management Plan (When to exit or roll?)
    
    Output only the analysis, no fluff.
  `;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini", // Cost-effective and fast for this use case
      messages: [
        { role: "system", content: "You are a senior derivatives trader specializing in institutional-grade options analysis." },
        { role: "user", content: prompt }
      ],
      temperature: 0.7,
      max_tokens: 250
    });

    return response.choices[0].message.content.trim();
  } catch (error) {
    console.error('[AI Thesis Error]', error.message);
    throw new Error(`AI Gateway error: ${error.message}`);
  }
}

module.exports = { generateThesis };
