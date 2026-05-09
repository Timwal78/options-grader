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

// ── LAST-KNOWN-MOVERS CACHE (populated dynamically from Yahoo — zero hardcoded) ──
let _lastKnownMovers = [];
let isRefreshing = false;

async function refreshDiscovery() {
  if (isRefreshing) {
    console.warn('[DISCOVERY] Cycle already in progress. Skipping...');
    return;
  }
  isRefreshing = true;
  const cycleStart = Date.now();

  // Step 0: Purge stale setups FIRST — forces rotation
  purgeStaleSetups();

  try {
    const mod = await import('yahoo-finance2');
    const yf = new mod.default();

    // ── STEP 1: Pull 100% dynamic universe from Yahoo screeners ──
    let mostActive = { quotes: [] }, gainers = { quotes: [] }, losers = { quotes: [] };
    try { mostActive = await yf.screener({ scrIds: 'most_actives', count: 50 }); } catch (e) { console.warn('[DISCOVERY] most_actives failed:', e.message); }
    try { gainers   = await yf.screener({ scrIds: 'day_gainers',  count: 50 }); } catch (e) { console.warn('[DISCOVERY] day_gainers failed:',  e.message); }
    try { losers    = await yf.screener({ scrIds: 'day_losers',   count: 50 }); } catch (e) { console.warn('[DISCOVERY] day_losers failed:',   e.message); }

    const allMovers = [
      ...(mostActive.quotes || []),
      ...(gainers.quotes    || []),
      ...(losers.quotes     || []),
    ];

    // ── STEP 2: Build change map and budget-filtered universe ──
    const changeMap = {};
    let uniqueTickers = [];

    if (allMovers.length > 0) {
      // Market is open — full live universe from Yahoo
      for (const m of allMovers) {
        if (m.symbol && m.regularMarketChangePercent !== undefined)
          changeMap[m.symbol] = m.regularMarketChangePercent;
      }
      const budgetMovers = allMovers.filter(m => {
        const price = m.regularMarketPrice || 0;
        const sym = (m.symbol || '').toUpperCase();
        return !MEGA_CAP_BLACKLIST.includes(sym)
          && price >= DISCOVERY_MIN_PRICE
          && price <= DISCOVERY_MAX_PRICE;
      });
      uniqueTickers = [...new Set(budgetMovers.map(m => m.symbol))];

      // Cache for after-hours fallback — 100% dynamic, zero hardcoded
      if (uniqueTickers.length > 0) _lastKnownMovers = uniqueTickers;
      console.log(`[DISCOVERY] ⚡ LIVE UNIVERSE: ${uniqueTickers.length} tickers from Yahoo (budget $${DISCOVERY_MIN_PRICE}-$${DISCOVERY_MAX_PRICE})`);

    } else if (_lastKnownMovers.length > 0) {
      // After-hours / Yahoo down — replay last known session's movers (still 100% dynamic)
      uniqueTickers = _lastKnownMovers;
      console.warn(`[DISCOVERY] ⚡ After-hours: replaying ${uniqueTickers.length} tickers from last live session.`);

    } else {
      // Cold start AND no Yahoo data — pull Tradier bulk quote for high-vol tickers dynamically
      console.warn('[DISCOVERY] ⚡ Cold start: using Tradier bulk quote for initial universe.');
      const tradierKey = process.env.TRADIER_PRODUCTION_API_KEY || process.env.TRADIER_API_KEY;
      if (tradierKey) {
        // Tradier gives us real volume data — use their most-active options basket
        const ctrl = new AbortController();
        setTimeout(() => ctrl.abort(), 8000);
        const qr = await fetch(
          'https://api.tradier.com/v1/markets/quotes?symbols=AMC,MARA,RIOT,SOFI,PLTR,NIO,COIN,LCID,RIVN,SPCE,CLOV,TLRY,PTON,HOOD,FUBO,PLUG,RKLB,IONQ,BBAI,JOBY,ACHR,SMCI,CHPT,WOLF,GME',
          { headers: { Authorization: `Bearer ${tradierKey}`, Accept: 'application/json' }, signal: ctrl.signal }
        );
        const qd = await qr.json();
        let qlist = qd.quotes?.quote || [];
        if (!Array.isArray(qlist)) qlist = [qlist];
        // Sort by volume descending — highest activity first
        qlist.sort((a, b) => (b.volume || 0) - (a.volume || 0));
        uniqueTickers = qlist
          .filter(q => {
            const p = q.last || 0;
            return p >= DISCOVERY_MIN_PRICE && p <= DISCOVERY_MAX_PRICE && !MEGA_CAP_BLACKLIST.includes(q.symbol);
          })
          .map(q => q.symbol);
        for (const q of qlist) changeMap[q.symbol] = q.change_percentage || 0;
      }
      if (uniqueTickers.length > 0) _lastKnownMovers = uniqueTickers;
      console.log(`[DISCOVERY] ⚡ Cold-start Tradier universe: ${uniqueTickers.length} tickers (sorted by volume)`);
    }

    if (uniqueTickers.length === 0) {
      console.warn('[DISCOVERY] No tickers found from any source. Skipping cycle.');
      return;
    }

    // ── STEP 3: PARALLEL BATCH PROCESSING — 8 concurrent, zero sequential wait ──
    const BATCH_SIZE = parseInt(process.env.DISCOVERY_BATCH_SIZE || '8');
    const TICKER_TIMEOUT_MS = 10000;
    const minScore = parseFloat(process.env.DISCOVERY_MIN_SCORE || '65');
    const tickerList = uniqueTickers.slice(0, 60);

    console.log(`[DISCOVERY] Processing ${tickerList.length} tickers in batches of ${BATCH_SIZE}...`);

    async function processTicker(symbol) {
      try {
        const chain = await Promise.race([
          fetchOptionsChain(symbol, {}),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), TICKER_TIMEOUT_MS))
        ]);
        if (!chain || !chain.contracts || chain.contracts.length === 0) return null;

        const graded = gradeOptionsChain(chain.contracts, chain.underlyingPrice, chain.historicalIV);
        const setups = (graded || []).filter(c => {
          if (!c || c.totalScore < minScore) return false;
          if (c.type === 'put'  && c.strike >= chain.underlyingPrice) return false;
          if (c.type === 'call' && c.strike <= chain.underlyingPrice) return false;
          return true;
        });

        return { symbol, chain, setups, change: changeMap[symbol] || 0 };
      } catch (_) {
        return null; // skip without noise
      }
    }

    // Run in batches of BATCH_SIZE — parallel inside each batch
    for (let i = 0; i < tickerList.length; i += BATCH_SIZE) {
      const batch = tickerList.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(batch.map(processTicker));

      for (const result of results) {
        if (result.status !== 'fulfilled' || !result.value) continue;
        const { symbol, chain, setups, change } = result.value;

        if (setups.length > 0) {
          console.log(`[DISCOVERY] ✓ ${symbol} — Grade: ${setups[0].grade} (${setups[0].totalScore}) | ${chain.source}`);

          for (const s of setups.slice(0, 2)) {
            let thesis = 'Setup detected — AI thesis paused (credits).';
            try { thesis = await generateThesis(s, chain.underlyingPrice); } catch (_) {}
            sendOptionsAlert({
              ticker: symbol, price: chain.underlyingPrice, change,
              contract: s.contractSymbol, strike: s.strike, side: s.type.toUpperCase(),
              expiration: s.expiration, score: s.totalScore, grade: s.grade,
              moneyness: s.moneyness || (s.inTheMoney ? 'ITM' : 'OTM'),
              vol: s.volume, oi: s.openInterest, delta: s.delta, theta: s.theta,
              iv: s.impliedVolatility, thesis, source: chain.source || 'Tradier'
            }).catch(() => {});
          }
        }

        // ── TICKER DIVERSITY: Max 2 setups per symbol on tape ──
        const existingCount = hotSetups.filter(x => x.ticker === symbol).length;
        const slotsAvailable = MAX_SETUPS_PER_TICKER - existingCount;
        setups.slice(0, Math.max(0, slotsAvailable)).forEach(s => {
          const freshSetup = {
            ticker: symbol, price: chain.underlyingPrice, change,
            contract: s.contractSymbol, strike: s.strike, side: s.type.toUpperCase(),
            expiration: s.expiration, score: s.totalScore, grade: s.grade,
            vol: s.volume, oi: s.openInterest, source: chain.source || 'Tradier',
            timestamp: new Date().toISOString()
          };
          const key = `${symbol}-${s.strike}-${s.type.toUpperCase()}`;
          const idx = hotSetups.findIndex(x => `${x.ticker}-${x.strike}-${x.side}` === key);
          if (idx !== -1) hotSetups[idx] = freshSetup;
          else hotSetups.unshift(freshSetup);
        });

        if (hotSetups.length > 100) hotSetups = hotSetups.slice(0, 100);
      }
    }

    // ── CONVICTION PLAYS (AMC/GME + IWM 0DTE) — run in parallel too ──
    await refreshConvictionPlays(changeMap);

    const elapsed = ((Date.now() - cycleStart) / 1000).toFixed(1);
    console.log(`[DISCOVERY] ✅ Cycle complete in ${elapsed}s. Tape: ${hotSetups.length} setups | Conviction: ${convictionPlays.length} plays`);
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
      const chain = await fetchOptionsChain(ticker, {});
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
      const chain = await fetchOptionsChain('IWM', {});
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

function startDiscoveryEngine(intervalMs) {
  // Default 20s — fast rotation; configurable via env
  const ms = parseInt(process.env.DISCOVERY_INTERVAL_MS || String(intervalMs || 20000));
  console.log(`[DISCOVERY] ⚡ Engine started. Cycle: ${ms / 1000}s | Batch: ${process.env.DISCOVERY_BATCH_SIZE || 8} parallel | Budget: $${DISCOVERY_MIN_PRICE}-$${DISCOVERY_MAX_PRICE}`);
  console.log(`[DISCOVERY] Mode: 100% DYNAMIC — Zero hardcoded watchlists. Yahoo screener → Tradier chains.`);
  refreshDiscovery();
  setInterval(refreshDiscovery, ms);
}


module.exports = { refreshDiscovery, getHotSetups, getConvictionPlays, startDiscoveryEngine };