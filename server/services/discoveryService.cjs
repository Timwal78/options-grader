// ═══════════════════════════════════════════════════════════════════════════════
// SQUEEZE OS: DISCOVERY ENGINE — 100% FETCH / ZERO DEMO
// ═══════════════════════════════════════════════════════════════════════════════
const { fetchOptionsChain } = require('./optionsData.cjs');
const { gradeOptionsChain } = require('./grader.cjs');

let hotSetups = [];

/**
 * The Market Explorer
 * Uses Yahoo Finance (Free/Real-time) to identify market movers.
 * Compliant with Manifesto Rule: 100% FETCH
 */
async function refreshDiscovery() {
  console.log(`[DISCOVERY] Siphoning market movers from Yahoo Finance...`);
  // Ensure we don't duplicate setups in a single session
  const seenToday = new Set();
  try {
    const mod = await import('yahoo-finance2');
    const yf = new mod.default(); // Accurate instantiation for v3 module
    
    // Siphon Most Actives, Gainers, and Losers via the consolidated screener API
    // Each call wrapped individually so one failure doesn't kill the engine
    let mostActive = { quotes: [] }, gainers = { quotes: [] }, losers = { quotes: [] };
    try { mostActive = await yf.screener({ scrIds: 'most_actives', count: 25 }); } catch (e) { console.warn('[DISCOVERY] most_actives screener failed:', e.message); }
    try { gainers = await yf.screener({ scrIds: 'day_gainers', count: 25 }); } catch (e) { console.warn('[DISCOVERY] day_gainers screener failed:', e.message); }
    try { losers = await yf.screener({ scrIds: 'day_losers', count: 25 }); } catch (e) { console.warn('[DISCOVERY] day_losers screener failed:', e.message); }

    const allMovers = [
      ...(mostActive.quotes || []),
      ...(gainers.quotes || []),
      ...(losers.quotes || [])
    ];

    if (allMovers.length === 0) {
      console.warn('[DISCOVERY] No movers returned from any screener. Market may be closed.');
      return;
    }

    // Build a lookup for real percent change from screener data
    const changeMap = {};
    for (const m of allMovers) {
      if (m.symbol && m.regularMarketChangePercent !== undefined) {
        changeMap[m.symbol] = m.regularMarketChangePercent;
      }
    }

    const uniqueTickers = [...new Set(allMovers.map(m => m.symbol))];

    // Prioritize Affordable under $500 (widened from $100 to include major tech)
    const priorityTickers = allMovers.filter(m => m.regularMarketPrice < 500)
                                    .map(m => m.symbol)
                                    .concat(uniqueTickers)
                                    .slice(0, 100);

    const newSetups = [];
    const megaCaps = ['SPY', 'AAPL', 'MSFT', 'NVDA', 'TSLA', 'GOOGL', 'AMZN', 'META', 'QQQ'];
    let megaCapCount = 0;

    console.log(`[DISCOVERY] Siphoning ${priorityTickers.length} movers for setups...`);

    for (const symbol of [...new Set(priorityTickers)]) {
      try {
        const isMegaCap = megaCaps.includes(symbol);
        if (isMegaCap && megaCapCount >= 3) continue;
        if (isMegaCap) megaCapCount++;

        const chain = await fetchOptionsChain(symbol, { polygonKey: process.env.POLYGON_API_KEY }); // Force Polygon for Discovery
        if (!chain || !chain.contracts) continue;

        const graded = gradeOptionsChain(chain.contracts, chain.underlyingPrice, chain.historicalIV);
        const setups = (graded || []).filter(c => c.totalScore >= 60);

        
        if (setups.length > 0) {
           console.log(`[DISCOVERY] Found setups for ${symbol}. Top Grade: ${setups[0].grade}`);
        }

        setups.forEach(s => {
          const freshSetup = {
            ticker: symbol,
            price: chain.underlyingPrice,
            change: changeMap[symbol] || 0,
            contract: s.contractSymbol,
            strike: s.strike,
            side: s.type.toUpperCase(),
            expiration: s.expiration,
            score: s.totalScore,
            grade: s.grade,
            vol: s.volume,
            oi: s.openInterest,
            source: chain.source || 'Yahoo Finance',
            timestamp: new Date().toISOString()
          };

          // Incremental Push to the Tape
          const key = `${freshSetup.ticker}-${freshSetup.side}`;
          const existingIdx = hotSetups.findIndex(x => `${x.ticker}-${x.side}` === key);
          
          if (existingIdx !== -1) {
            hotSetups[existingIdx] = freshSetup; // Update existing
          } else {
            hotSetups.unshift(freshSetup); // Add new to front
          }
        });

        // Keep a rolling buffer of 100 setups max
        if (hotSetups.length > 100) hotSetups = hotSetups.slice(0, 100);

        await new Promise(r => setTimeout(r, 100)); 
      } catch (e) { /* skip failed ticker silently */ }
    }
    console.log(`[DISCOVERY] Discovery cycle finished. Buffer size: ${hotSetups.length}`);
  } catch (err) {
    console.error('[DISCOVERY] Engine error:', err.message);
  }
}

function getHotSetups() {
  return hotSetups;
}

function startDiscoveryEngine(intervalMs = 60000) {
  console.log('[DISCOVERY] Engine started. Cycle interval:', intervalMs / 1000, 's');
  refreshDiscovery();
  setInterval(refreshDiscovery, intervalMs);
}

module.exports = { refreshDiscovery, getHotSetups, startDiscoveryEngine };