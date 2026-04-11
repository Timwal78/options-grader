// ═══════════════════════════════════════════════════════════════════════════════
// Options Data Fetcher — Multi-Source
// Priority: Schwab (BYOK) → Polygon (BYOK or Server Key) → Yahoo (free fallback)
// ═══════════════════════════════════════════════════════════════════════════════

const { loadTokens } = require('./schwabService.cjs');
const fs = require('fs');
const path = require('path');

/**
 * Fetch options chain for a ticker
 * Uses server-side Polygon key by default, BYOK overrides, Yahoo as fallback
 */
async function fetchOptionsChain(ticker, byokConfig = {}) {
  // 1. Schwab (BYOK / Token) — Primary
  if (byokConfig.schwabToken || process.env.SCHWAB_ACCESS_TOKEN || fs.existsSync(path.join(__dirname, '..', '..', 'schwab_tokens.json'))) {
    try {
      const tokens = await loadTokens();
      const token = byokConfig.schwabToken || tokens?.access_token || process.env.SCHWAB_ACCESS_TOKEN;
      if (token) return await fetchSchwab(ticker, token);
    } catch (e) {
      console.warn(`[DATA] Schwab failed for ${ticker}: ${e.message} — trying next source`);
    }
  }

  // 2. Polygon (BYOK or Server Key)
  const polygonKey = byokConfig.polygonKey || process.env.POLYGON_API_KEY;
  if (polygonKey) {
    try {
      return await fetchPolygon(ticker, polygonKey);
    } catch (e) {
      console.warn(`[DATA] Polygon failed for ${ticker}: ${e.message} — trying next source`);
    }
  }

  // 3. Tradier (BYOK)
  if (byokConfig.tradierKey) {
    try {
      return await fetchTradier(ticker, byokConfig.tradierKey);
    } catch (e) {
      console.warn(`[DATA] Tradier failed for ${ticker}: ${e.message} — trying Yahoo`);
    }
  }

  // 4. Free Fallback — Yahoo Finance
  console.log(`[DATA] Loading ${ticker} via Yahoo Finance (Final Fallback)`);
  return fetchYahoo(ticker);
}

// ─── POLYGON.IO (PRIMARY — YOUR KEY) ────────────────────────────────────────
async function fetchPolygon(ticker, apiKey) {
  try {
    // Get underlying price + daily change
    const priceRes = await fetch(`https://api.polygon.io/v2/aggs/ticker/${ticker}/prev?apiKey=${apiKey}`);
    if (!priceRes.ok) throw new Error(`Polygon price request failed (HTTP ${priceRes.status})`);
    const priceData = await safeJson(priceRes);
    const prevBar = priceData.results?.[0] || {};
    const underlyingPrice = prevBar.c || 0;
    const prevClose = prevBar.o || underlyingPrice;
    const underlyingChange = prevClose > 0 ? ((underlyingPrice - prevClose) / prevClose) * 100 : 0;

    // Get options chain snapshot
    const chainRes = await fetch(`https://api.polygon.io/v3/snapshot/options/${ticker}?apiKey=${apiKey}&limit=250&order=desc&sort=volume`);
    if (!chainRes.ok) throw new Error(`Polygon snapshot request failed (HTTP ${chainRes.status})`);
    const chainData = await safeJson(chainRes);

    if (!chainData.results || chainData.results.length === 0) {
      if (chainData.status === 'NOT_AUTHORIZED') {
        throw new Error(`POLYGON ENTITLEMENT ERROR: Your current plan does not include snapshot data for ${ticker}.`);
      }
      throw new Error(`Polygon found no options results for ${ticker}. Check symbol spelling or status.`);
    }

    const contracts = chainData.results.map(opt => ({
      contractSymbol: opt.details?.ticker || '',
      type: (opt.details?.contract_type || 'call').toLowerCase(),
      strike: opt.details?.strike_price || 0,
      expiration: opt.details?.expiration_date || '',
      dte: Math.max(0, Math.ceil((new Date(opt.details?.expiration_date) - new Date()) / 864e5)),
      bid: opt.last_quote?.bid || 0,
      ask: opt.last_quote?.ask || 0,
      lastPrice: opt.last_quote?.midpoint || ((opt.last_quote?.bid || 0) + (opt.last_quote?.ask || 0)) / 2,
      volume: opt.day?.volume || 0,
      openInterest: opt.open_interest || 0,
      impliedVolatility: opt.implied_volatility || 0,
      delta: opt.greeks?.delta || 0,
      gamma: opt.greeks?.gamma || 0,
      theta: opt.greeks?.theta || 0,
      vega: opt.greeks?.vega || 0,
      inTheMoney: opt.details?.contract_type === 'call'
        ? underlyingPrice > (opt.details?.strike_price || 0)
        : underlyingPrice < (opt.details?.strike_price || 0),
      underlyingChange
    }));

    return {
      ticker: ticker.toUpperCase(),
      underlyingPrice,
      underlyingChange,
      historicalIV: estimateHistoricalIV(contracts, underlyingPrice),
      expirationDates: [...new Set(contracts.map(c => c.expiration))].sort(),
      contracts,
      source: apiKey === process.env.POLYGON_API_KEY ? 'Polygon.io (Server Key)' : 'Polygon.io (BYOK)',
      timestamp: new Date().toISOString()
    };
  } catch (e) {
    throw e;
  }
}

// ─── SCHWAB (BYOK — OAuth2) ─────────────────────────────────────────────────
async function safeJson(res) {
  const text = await res.text();
  if (!text || text.trim().length === 0) {
    throw new Error(`Empty response (HTTP ${res.status})`);
  }
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error(`Invalid JSON (HTTP ${res.status}): ${text.substring(0, 200)}`);
  }
}

async function fetchSchwab(ticker, accessToken) {
  try {
    const headers = { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' };

    // Get quote
    const quoteRes = await fetch(`https://api.schwabapi.com/marketdata/v1/quotes?symbols=${ticker}`, { headers });
    if (!quoteRes.ok) throw new Error(`Schwab quote request failed (HTTP ${quoteRes.status})`);
    const quoteData = await safeJson(quoteRes);
    const quote = quoteData[ticker] || {};
    const underlyingPrice = quote.quote?.lastPrice || quote.quote?.mark || 0;
    const prevClose = quote.quote?.closePrice || underlyingPrice;
    const underlyingChange = prevClose > 0 ? ((underlyingPrice - prevClose) / prevClose) * 100 : 0;

    // Get options chain
    const chainRes = await fetch(`https://api.schwabapi.com/marketdata/v1/chains?symbol=${ticker}&contractType=ALL&strikeCount=20&includeUnderlyingQuote=true&strategy=SINGLE`, { headers });
    if (!chainRes.ok) throw new Error(`Schwab chain request failed (HTTP ${chainRes.status})`);
    const chainData = await safeJson(chainRes);

    const contracts = [];

    // Process call map
    const callMap = chainData.callExpDateMap || {};
    for (const [expDate, strikes] of Object.entries(callMap)) {
      for (const [strike, opts] of Object.entries(strikes)) {
        for (const opt of opts) {
          contracts.push(normalizeSchwabContract(opt, 'call', underlyingPrice, underlyingChange));
        }
      }
    }

    // Process put map
    const putMap = chainData.putExpDateMap || {};
    for (const [expDate, strikes] of Object.entries(putMap)) {
      for (const [strike, opts] of Object.entries(strikes)) {
        for (const opt of opts) {
          contracts.push(normalizeSchwabContract(opt, 'put', underlyingPrice, underlyingChange));
        }
      }
    }

    return {
      ticker: ticker.toUpperCase(), underlyingPrice, underlyingChange,
      historicalIV: chainData.volatility || estimateHistoricalIV(contracts, underlyingPrice),
      expirationDates: [...new Set(contracts.map(c => c.expiration))].sort(),
      contracts, source: 'Charles Schwab (BYOK)',
      timestamp: new Date().toISOString()
    };
  } catch (e) {
    throw new Error(`Schwab API Error: ${e.message}`);
  }
}

function normalizeSchwabContract(opt, type, underlyingPrice, underlyingChange = 0) {
  return {
    contractSymbol: opt.symbol || '',
    type,
    strike: opt.strikePrice || 0,
    expiration: opt.expirationDate ? opt.expirationDate.split('T')[0] : '',
    dte: opt.daysToExpiration || 0,
    bid: opt.bid || 0,
    ask: opt.ask || 0,
    lastPrice: opt.last || opt.mark || 0,
    volume: opt.totalVolume || 0,
    openInterest: opt.openInterest || 0,
    impliedVolatility: opt.volatility ? opt.volatility / 100 : 0,
    delta: opt.delta || 0,
    gamma: opt.gamma || 0,
    theta: opt.theta || 0,
    vega: opt.vega || 0,
    inTheMoney: opt.inTheMoney || false,
    underlyingChange
  };
}

// ─── TRADIER (BYOK) ─────────────────────────────────────────────────────────
async function fetchTradier(ticker, apiKey) {
  const base = 'https://api.tradier.com/v1';
  const headers = { 'Authorization': `Bearer ${apiKey}`, 'Accept': 'application/json' };

  try {
    const quoteRes = await fetch(`${base}/markets/quotes?symbols=${ticker}`, { headers });
    const quoteData = await quoteRes.json();
    const underlyingPrice = quoteData.quotes?.quote?.last || 0;

    const expRes = await fetch(`${base}/markets/options/expirations?symbol=${ticker}`, { headers });
    const expData = await expRes.json();
    const expirations = expData.expirations?.date || [];

    const contracts = [];
    for (const exp of expirations.slice(0, 3)) {
      const chainRes = await fetch(`${base}/markets/options/chains?symbol=${ticker}&expiration=${exp}&greeks=true`, { headers });
      const chainData = await chainRes.json();
      const options = chainData.options?.option || [];
      for (const opt of options) {
        contracts.push({
          contractSymbol: opt.symbol || '',
          type: opt.option_type || 'call',
          strike: opt.strike || 0,
          expiration: exp,
          dte: Math.ceil((new Date(exp) - new Date()) / 864e5),
          bid: opt.bid || 0, ask: opt.ask || 0, lastPrice: opt.last || 0,
          volume: opt.volume || 0, openInterest: opt.open_interest || 0,
          impliedVolatility: opt.greeks?.mid_iv || 0,
          delta: opt.greeks?.delta || 0, gamma: opt.greeks?.gamma || 0,
          theta: opt.greeks?.theta || 0, vega: opt.greeks?.vega || 0,
          inTheMoney: opt.option_type === 'call' ? underlyingPrice > opt.strike : underlyingPrice < opt.strike
        });
      }
    }

    return {
      ticker: ticker.toUpperCase(), underlyingPrice,
      historicalIV: estimateHistoricalIV(contracts),
      expirationDates: expirations, contracts,
      source: 'Tradier (BYOK)', timestamp: new Date().toISOString()
    };
  } catch (e) {
    throw new Error(`Tradier API error: ${e.message}`);
  }
}

// ─── YAHOO FINANCE (FREE FALLBACK) ──────────────────────────────────────────
let yahooFinance = null;
async function getYF() {
  if (!yahooFinance) {
    const mod = await import('yahoo-finance2');
    const YahooFinance = mod.default;
    yahooFinance = new YahooFinance();
  }
  return yahooFinance;
}

async function fetchYahoo(ticker) {
  try {
    const yf = await getYF();
    const quote = await yf.quote(ticker);
    const underlyingPrice = quote.regularMarketPrice;
    const prevClose = quote.regularMarketPreviousClose || underlyingPrice;
    const underlyingChange = prevClose > 0 ? ((underlyingPrice - prevClose) / prevClose) * 100 : 0;

    const options = await yf.options(ticker);
    if (!options || !options.options || options.options.length === 0) {
      throw new Error(`No options data found for ${ticker}`);
    }

    const expirationDates = options.expirationDates || [];
    const allContracts = [];

    // Process first expiration
    if (options.options[0]) {
      if (options.options[0].calls) {
        for (const call of options.options[0].calls) {
          allContracts.push(normalizeYahooContract(call, 'call', options.options[0].expirationDate, underlyingPrice, underlyingChange));
        }
      }
      if (options.options[0].puts) {
        for (const put of options.options[0].puts) {
          allContracts.push(normalizeYahooContract(put, 'put', options.options[0].expirationDate, underlyingPrice, underlyingChange));
        }
      }
    }

    // Additional expirations
    for (const expDate of expirationDates.slice(1, 10)) {
      try {
        const expOptions = await yf.options(ticker, { date: expDate });
        if (expOptions?.options?.[0]) {
          const exp = expOptions.options[0];
          if (exp.calls) exp.calls.forEach(c => allContracts.push(normalizeYahooContract(c, 'call', exp.expirationDate, underlyingPrice, underlyingChange)));
          if (exp.puts) exp.puts.forEach(p => allContracts.push(normalizeYahooContract(p, 'put', exp.expirationDate, underlyingPrice, underlyingChange)));
        }
      } catch (e) { /* skip */ }
    }

    return {
      ticker: ticker.toUpperCase(), underlyingPrice, underlyingChange,
      historicalIV: estimateHistoricalIV(allContracts, underlyingPrice),
      expirationDates, contracts: allContracts,
      source: 'Yahoo Finance (Free)', timestamp: new Date().toISOString()
    };
  } catch (error) {
    throw new Error(`Failed to fetch options for ${ticker}: ${error.message}`);
  }
}

function normalizeYahooContract(raw, type, expirationDate, underlyingPrice, underlyingChange = 0) {
  const dte = Math.max(0, Math.ceil((new Date(expirationDate) - new Date()) / 864e5));
  return {
    contractSymbol: raw.contractSymbol || '',
    type, strike: raw.strike || 0, expiration: expirationDate, dte,
    bid: raw.bid || 0, ask: raw.ask || 0, lastPrice: raw.lastPrice || 0,
    volume: raw.volume || 0, openInterest: raw.openInterest || 0,
    impliedVolatility: raw.impliedVolatility || 0,
    delta: estimateDelta(raw, type, underlyingPrice),
    gamma: estimateGamma(raw, underlyingPrice),
    theta: estimateTheta(raw, dte), vega: estimateVega(raw, dte),
    inTheMoney: raw.inTheMoney || false,
    underlyingChange
  };
}

// ─── GREEKS ESTIMATION (when not provided) ───────────────────────────────────
function estimateDelta(raw, type, underlyingPrice) {
  if (raw.delta) return raw.delta;
  const strike = raw.strike || raw.strike_price || underlyingPrice;
  const m = (underlyingPrice - strike) / underlyingPrice;
  if (type === 'call') {
    if (m > 0.1) return 0.85; if (m > 0.05) return 0.70;
    if (m > -0.05) return 0.50; if (m > -0.1) return 0.30; return 0.15;
  } else {
    if (m < -0.1) return -0.85; if (m < -0.05) return -0.70;
    if (m < 0.05) return -0.50; if (m < 0.1) return -0.30; return -0.15;
  }
}

function estimateGamma(raw, underlyingPrice) {
  if (raw.gamma) return raw.gamma;
  const strike = raw.strike || raw.strike_price || underlyingPrice;
  const m = Math.abs(underlyingPrice - strike) / underlyingPrice;
  if (m < 0.03) return 0.05; if (m < 0.08) return 0.03; return 0.01;
}

function estimateTheta(raw, dte) {
  if (raw.theta) return raw.theta;
  const price = raw.lastPrice || raw.ask || 1;
  if (dte <= 0) return 0;
  return -(price / dte) * 0.7;
}

function estimateVega(raw, dte) {
  if (raw.vega) return raw.vega;
  const price = raw.lastPrice || raw.ask || 1;
  return price * 0.01 * Math.sqrt(dte / 30);
}

/**
 * Estimate historical IV using the MEDIAN of near-ATM contracts.
 * ATM contracts are the most representative of IV since they have
 * the highest vega and most trading activity.
 */
function estimateHistoricalIV(contracts, underlyingPrice) {
  if (!contracts || contracts.length === 0) return 0.30;

  // Filter to contracts with valid IV
  let ivCandidates = contracts.filter(c => c.impliedVolatility > 0);
  if (ivCandidates.length === 0) return 0.30;

  // Prefer near-ATM contracts (within 5% of underlying price) for the IV estimate
  if (underlyingPrice > 0) {
    const atmContracts = ivCandidates.filter(c => {
      const moneyness = Math.abs(c.strike - underlyingPrice) / underlyingPrice;
      return moneyness < 0.05;
    });
    if (atmContracts.length >= 3) {
      ivCandidates = atmContracts; // Use ATM subset if we have enough
    }
  }

  // Return MEDIAN instead of mean (resistant to outliers from far OTM/ITM skew)
  const sorted = ivCandidates.map(c => c.impliedVolatility).sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

module.exports = { fetchOptionsChain };
