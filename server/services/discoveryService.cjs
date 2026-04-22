// ═══════════════════════════════════════════════════════════════════════════════
// SQUEEZE OS: DISCOVERY ENGINE — 100% FETCH / ZERO DEMO
// ═══════════════════════════════════════════════════════════════════════════════
const { fetchOptionsChain } = require('./optionsData.cjs');
const { gradeOptionsChain } = require('./grader.cjs');
const { sendOptionsAlert, sendBatchSummary, isEnabled } = require('./discordAlerts.cjs');
const { generateThesis } = require('./aiService.cjs');

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
    const maxPrice = parseFloat(process.env.DISCOVERY_MAX_PRICE || '500');
    const priorityTickers = allMovers.filter(m => m.regularMarketPrice < maxPrice)
                                    .map(m => m.symbol)
                                    .concat(uniqueTickers)
                                    .slice(0, 100);

    const newSetups = [];
    const megaCaps = (process.env.DISCOVERY_MEGA_CAPS || 'SPY,AAPL,MSFT,NVDA,TSLA,GOOGL,AMZN,META,QQQ').split(',');
    let megaCapCount = 0;
    const MAX_MEGA_CAPS = parseInt(process.env.DISCOVERY_MAX_MEGA_CAPS || '2');

    // ── IWM 0DTE Priority ──
    const iwmPriority = uniqueTickers.includes('IWM');
    if (iwmPriority) {
       priorityTickers.unshift('IWM'); // Force IWM to start of line
    }

    const discordEnabled = isEnabled();
    console.log(`[DISCOVERY] Siphoning ${priorityTickers.length} movers for setups... | Discord: ${discordEnabled ? 'ON' : 'OFF'}`);

    for (const symbol of [...new Set(priorityTickers)]) {
      try {
        const isMegaCap = megaCaps.includes(symbol);
        
        // ── Rule 3: Benchmark Capping & Filtering ──
        if (isMegaCap) {
           if (megaCapCount >= MAX_MEGA_CAPS) continue;
           // Benchmarks stay for context but are capped at minimal (Law 2)
        }

        const chain = await fetchOptionsChain(symbol, { polygonKey: process.env.POLYGON_API_KEY });
        if (!chain || !chain.contracts) continue;

        const graded = gradeOptionsChain(chain.contracts, chain.underlyingPrice, chain.historicalIV);
        // ── ZERO-FAKE: Only institutional-vetted signals reach the tape or Discord ──
        const minDiscoveryScore = parseFloat(process.env.DISCOVERY_MIN_SCORE || '67');
        const setups = (graded || []).filter(c => {
          if (c.totalScore < minDiscoveryScore) return false;
          
          // Large Cap Grade Filter (Only allow A+ for benchmarks)
          if (isMegaCap && c.totalScore < 90) return false;

          // Directional filter: Puts must be OTM (Strike < Price), Calls must be OTM (Strike > Price)
          if (c.type === 'put'  && c.strike >= chain.underlyingPrice) return false;
          if (c.type === 'call' && c.strike <= chain.underlyingPrice) return false;
          
          // IWM 0DTE Priority: Ensure we keep 0DTE for IWM if it passes score
          if (symbol === 'IWM' && c.dte === 0) return true;
          
          return true;
        });

        if (isMegaCap && setups.length > 0) megaCapCount++;

        
        if (setups.length > 0) {
           console.log(`[DISCOVERY] Found setups for ${symbol}. Top Grade: ${setups[0].grade}`);
           // Fire Discord alerts for qualifying setups
           for (const s of setups.slice(0, 3)) {
             // ── Institutional Logic: Fetch AI Thesis before Alerting ──
             let thesis = "Analysis pending...";
             try {
                thesis = await generateThesis(s, chain.underlyingPrice);
             } catch (e) {
                console.warn(`[AI] Thesis generation failed for ${symbol}:`, e.message);
             }

             const alertPayload = {
               ticker: symbol,
               price: chain.underlyingPrice,
               change: changeMap[symbol] || 0,
               contract: s.contractSymbol,
               strike: s.strike,
               side: s.type.toUpperCase(),
               expiration: s.expiration,
               score: s.totalScore,
               grade: s.grade,
               moneyness: s.moneyness || (s.inTheMoney ? 'ITM' : 'OTM'),
               vol: s.volume,
               oi: s.openInterest,
               delta: s.delta,
               theta: s.theta,
               iv: s.impliedVolatility,
               thesis: thesis,
               source: chain.source || 'Yahoo Finance'
             };
             sendOptionsAlert(alertPayload).catch(() => {});
           }
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
    // Send batch summary to Discord
    sendBatchSummary(hotSetups).catch(() => {});
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