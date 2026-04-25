// ═══════════════════════════════════════════════════════════════════════════════
// THE OPTIONS EDGE™ — DYNAMIC DISCOVERY ENGINE v5.0
// Modeled after SqueezeOS Pro: Constant Rotation / Zero Watchlists
// ═══════════════════════════════════════════════════════════════════════════════
const { fetchOptionsChain } = require('./optionsData.cjs');
const { gradeOptionsChain } = require('./grader.cjs');
const { sendOptionsAlert, sendBatchSummary, isEnabled } = require('./discordAlerts.cjs');
const { generateThesis } = require('./aiService.cjs');

// ── TWO SEPARATE FEEDS ──
let hotSetups = [];       // Dynamic tape — constantly rotating market movers
let convictionPlays = []; // Dedicated channel: AMC, GME, IWM 0DTE only

// ── STALENESS TRACKING ──
const SETUP_TTL_MS = parseInt(process.env.SETUP_TTL_MS || '300000'); // 5 min default
const MAX_SETUPS_PER_TICKER = parseInt(process.env.MAX_SETUPS_PER_TICKER || '2');

// ── CONVICTION EXCEPTIONS (the ONLY allowed "watchlist") ──
const CONVICTION_TICKERS = (process.env.CONVICTION_TICKERS || 'AMC,GME').split(',').map(s => s.trim().toUpperCase());
const IWM_0DTE_ENABLED = (process.env.IWM_0DTE_ENABLED || 'true') === 'true';

// ── PRICE FILTER (Budget-focused — YOUR trading range) ──
const DISCOVERY_MAX_PRICE = parseFloat(process.env.DISCOVERY_MAX_PRICE || '50');
const DISCOVERY_MIN_PRICE = parseFloat(process.env.DISCOVERY_MIN_PRICE || '2');

// ── MEGA-CAP BLACKLIST (These NEVER appear on the discovery tape) ──
const MEGA_CAP_BLACKLIST = (process.env.MEGA_CAP_BLACKLIST || 'SPY,QQQ,IWM,AAPL,MSFT,NVDA,TSLA,GOOGL,AMZN,META,GOOG,BRK.A,BRK.B,JPM,V,UNH,XOM,MA,JNJ,PG,HD,AVGO,COST,LLY,ABBV,MRK,WMT,PEP,KO,NFLX,CRM,ORCL,ADBE,CSCO,INTC,QCOM,TXN').split(',').map(s => s.trim().toUpperCase());

/**
 * Purge stale setups from the tape.
 * Any setup older than SETUP_TTL_MS gets removed — forces constant rotation.
 */
function purgeStaleSetups() {
  const now = Date.now();
  const before = hotSetups.length;
  hotSetups = hotSetups.filter(s => {
    const age = now - new Date(s.timestamp).getTime();
    return age < SETUP_TTL_MS;
  });
  if (hotSetups.length < before) {
    console.log(`[DISCOVERY] Stale purge: removed ${before - hotSetups.length} expired setups. Active: ${hotSetups.length}`);
  }
}

let isRefreshing = false;

/**
 * The Market Explorer — SqueezeOS Pro Model
 * Uses Yahoo Finance to identify market movers dynamically.
 * NO static watchlists. NO mega-cap safety nets.
 * 100% FETCH / Zero Demo.
 */
async function refreshDiscovery() {
  if (isRefreshing) {
    console.warn('[DISCOVERY] Cycle already in progress. Skipping...');
    return;
  }
  isRefreshing = true;

  console.log(`[DISCOVERY] ════════════════════════════════════════════════════`);
  console.log(`[DISCOVERY] Dynamic Discovery Cycle Starting...`);
  console.log(`[DISCOVERY] Budget Range: $${DISCOVERY_MIN_PRICE} - $${DISCOVERY_MAX_PRICE}`);
  console.log(`[DISCOVERY] Conviction Tickers: ${CONVICTION_TICKERS.join(', ')}${IWM_0DTE_ENABLED ? ' + IWM 0DTE' : ''}`);
  console.log(`[DISCOVERY] ════════════════════════════════════════════════════`);

  // Step 0: Purge stale setups FIRST — forces rotation
  purgeStaleSetups();

  try {
    const mod = await import('yahoo-finance2');
    const yf = new mod.default();

    // ── DISCOVERY: Siphon market movers ──
    let mostActive = { quotes: [] }, gainers = { quotes: [] }, losers = { quotes: [] };
    try { mostActive = await yf.screener({ scrIds: 'most_actives', count: 50 }); } catch (e) { console.warn('[DISCOVERY] most_actives failed:', e.message); }
    try { gainers = await yf.screener({ scrIds: 'day_gainers', count: 50 }); } catch (e) { console.warn('[DISCOVERY] day_gainers failed:', e.message); }
    try { losers = await yf.screener({ scrIds: 'day_losers', count: 50 }); } catch (e) { console.warn('[DISCOVERY] day_losers failed:', e.message); }

    const allMovers = [
      ...(mostActive.quotes || []),
      ...(gainers.quotes || []),
      ...(losers.quotes || [])
    ];

    if (allMovers.length === 0) {
      console.warn('[DISCOVERY] No movers returned. Market may be closed.');
      isRefreshing = false;
      return;
    }

    // Build change lookup
    const changeMap = {};
    for (const m of allMovers) {
      if (m.symbol && m.regularMarketChangePercent !== undefined) {
        changeMap[m.symbol] = m.regularMarketChangePercent;
      }
    }

    // ── BUDGET FILTER: Only affordable, tradeable setups ──
    const budgetMovers = allMovers.filter(m => {
      const price = m.regularMarketPrice || 0;
      const sym = (m.symbol || '').toUpperCase();

      // Hard reject mega-caps from the discovery tape
      if (MEGA_CAP_BLACKLIST.includes(sym)) return false;

      // Budget range filter
      return price >= DISCOVERY_MIN_PRICE && price <= DISCOVERY_MAX_PRICE;
    });

    // Deduplicate
    const uniqueTickers = [...new Set(budgetMovers.map(m => m.symbol))];
    console.log(`[DISCOVERY] Budget-filtered movers: ${uniqueTickers.length} tickers (from ${allMovers.length} raw)`);

    // ── PROCESS DISCOVERY TAPE (Dynamic: no watchlists) ──
    const discordEnabled = isEnabled();
    const minScore = parseFloat(process.env.DISCOVERY_MIN_SCORE || '65');

    for (const symbol of uniqueTickers.slice(0, 40)) { // Reduced from 80 to 40 for speed/stability
      try {
        const chain = await fetchOptionsChain(symbol, { polygonKey: process.env.POLYGON_API_KEY });
        if (!chain || !chain.contracts) continue;

        const graded = gradeOptionsChain(chain.contracts, chain.underlyingPrice, chain.historicalIV);
        const setups = (graded || []).filter(c => {
          if (!c) return false;
          if (c.totalScore < minScore) return false;

          // Directional filter
          if (c.type === 'put' && c.strike >= chain.underlyingPrice) return false;
          if (c.type === 'call' && c.strike <= chain.underlyingPrice) return false;

          return true;
        });

        if (setups.length > 0) {
          console.log(`[DISCOVERY] ✓ ${symbol} — Top Grade: ${setups[0].grade} (${setups[0].totalScore})`);

          // Fire Discord alerts for top setups
          for (const s of setups.slice(0, 2)) {
            let thesis = "Analysis pending...";
            try {
              thesis = await generateThesis(s, chain.underlyingPrice);
            } catch (e) { /* skip */ }

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

        // ── TICKER DIVERSITY: Max 2 setups per symbol on tape ──
        const existingCount = hotSetups.filter(x => x.ticker === symbol).length;
        const slotsAvailable = MAX_SETUPS_PER_TICKER - existingCount;

        setups.slice(0, Math.max(0, slotsAvailable)).forEach(s => {
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

          // Update existing or add new
          const key = `${freshSetup.ticker}-${freshSetup.strike}-${freshSetup.side}`;
          const existingIdx = hotSetups.findIndex(x => `${x.ticker}-${x.strike}-${x.side}` === key);

          if (existingIdx !== -1) {
            hotSetups[existingIdx] = freshSetup;
          } else {
            hotSetups.unshift(freshSetup);
          }
        });

        // Cap rolling buffer
        if (hotSetups.length > 100) hotSetups = hotSetups.slice(0, 100);

        await new Promise(r => setTimeout(r, 100));
      } catch (e) { /* skip failed ticker */ }
    }

    // ── PROCESS CONVICTION PLAYS (AMC/GME + IWM 0DTE) ──
    await refreshConvictionPlays(changeMap);

    console.log(`[DISCOVERY] Cycle complete. Tape: ${hotSetups.length} setups | Conviction: ${convictionPlays.length} plays`);
    sendBatchSummary(hotSetups).catch(() => {});

  } catch (err) {
    console.error('[DISCOVERY] Engine error:', err.message);
  } finally {
    isRefreshing = false;
  }
}

/**
 * Conviction Plays — The ONLY exceptions to "no watchlists."
 * AMC, GME: Full scan with buy/sell, strike, date.
 * IWM: 0DTE only (daily expiration).
 */
async function refreshConvictionPlays(changeMap = {}) {
  console.log('[CONVICTION] Scanning exception tickers...');
  const newPlays = [];

  // ── AMC / GME ──
  for (const ticker of CONVICTION_TICKERS) {
    try {
      const chain = await fetchOptionsChain(ticker, { polygonKey: process.env.POLYGON_API_KEY });
      if (!chain || !chain.contracts) continue;

      const graded = gradeOptionsChain(chain.contracts, chain.underlyingPrice, chain.historicalIV);
      const topSetups = (graded || []).filter(c => c && c.totalScore >= 55).slice(0, 3);

      for (const s of topSetups) {
        newPlays.push({
          ticker,
          price: chain.underlyingPrice,
          change: changeMap[ticker] || 0,
          action: s.type.toUpperCase() === 'CALL' ? 'BUY CALL' : 'BUY PUT',
          strike: s.strike,
          expiration: s.expiration,
          dte: s.dte,
          score: s.totalScore,
          grade: s.grade,
          delta: s.delta,
          theta: s.theta,
          iv: s.impliedVolatility,
          vol: s.volume,
          oi: s.openInterest,
          contract: s.contractSymbol,
          source: chain.source || 'Yahoo Finance',
          category: 'CONVICTION',
          timestamp: new Date().toISOString()
        });
      }
    } catch (e) {
      console.warn(`[CONVICTION] ${ticker} scan failed:`, e.message);
    }
  }

  // ── IWM 0DTE ──
  if (IWM_0DTE_ENABLED) {
    try {
      const chain = await fetchOptionsChain('IWM', { polygonKey: process.env.POLYGON_API_KEY });
      if (chain && chain.contracts) {
        // Filter to 0DTE only
        const zeroDte = chain.contracts.filter(c => c.dte === 0 || c.dte === 1);
        if (zeroDte.length > 0) {
          const graded = gradeOptionsChain(zeroDte, chain.underlyingPrice, chain.historicalIV);
          const topSetups = (graded || []).filter(c => c && c.totalScore >= 55).slice(0, 3);

          for (const s of topSetups) {
            newPlays.push({
              ticker: 'IWM',
              price: chain.underlyingPrice,
              change: changeMap['IWM'] || 0,
              action: s.type.toUpperCase() === 'CALL' ? 'BUY CALL (0DTE)' : 'BUY PUT (0DTE)',
              strike: s.strike,
              expiration: s.expiration,
              dte: s.dte,
              score: s.totalScore,
              grade: s.grade,
              delta: s.delta,
              theta: s.theta,
              iv: s.impliedVolatility,
              vol: s.volume,
              oi: s.openInterest,
              contract: s.contractSymbol,
              source: chain.source || 'Yahoo Finance',
              category: '0DTE',
              timestamp: new Date().toISOString()
            });
          }
        }
      }
    } catch (e) {
      console.warn('[CONVICTION] IWM 0DTE scan failed:', e.message);
    }
  }

  convictionPlays = newPlays;
  console.log(`[CONVICTION] ${convictionPlays.length} plays found (${CONVICTION_TICKERS.join('/')}${IWM_0DTE_ENABLED ? ' + IWM 0DTE' : ''})`);
}

function getHotSetups() {
  // Purge stale on every read too — keeps the API response fresh
  purgeStaleSetups();
  return hotSetups;
}

function getConvictionPlays() {
  return convictionPlays;
}

function startDiscoveryEngine(intervalMs = 60000) {
  console.log(`[DISCOVERY] SqueezeOS Pro-Model Engine started. Cycle: ${intervalMs / 1000}s`);
  console.log(`[DISCOVERY] Budget: $${DISCOVERY_MIN_PRICE}-$${DISCOVERY_MAX_PRICE} | Stale TTL: ${SETUP_TTL_MS / 1000}s`);
  console.log(`[DISCOVERY] Mega-cap blacklist: ${MEGA_CAP_BLACKLIST.slice(0, 10).join(', ')}...`);
  refreshDiscovery();
  setInterval(refreshDiscovery, intervalMs);
}


module.exports = { refreshDiscovery, getHotSetups, getConvictionPlays, startDiscoveryEngine };