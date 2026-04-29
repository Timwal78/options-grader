// ═══════════════════════════════════════════════════════════════════════════════
// The Options Edge™ — API Server v5.0
// by ScriptMasterLabs™
// SqueezeOS Pro-Model Dynamic Discovery
// ═══════════════════════════════════════════════════════════════════════════════

const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { fetchOptionsChain } = require('./services/optionsData.cjs');
const { gradeOptionsChain } = require('./services/grader.cjs');
const { generateThesis } = require('./services/aiService.cjs');
const { startDiscoveryEngine, getHotSetups, getConvictionPlays } = require('./services/discoveryService.cjs');
const { getAuthUrl, exchangeCode, loadTokens } = require('./services/schwabService.cjs');
const { createCheckoutSession, handleWebhook, getTier } = require('./services/stripe.cjs');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Initialize Tokens for the session (SqueezeOS: Persistent Handshake)
// NOTE: Token loading is non-blocking — server starts regardless of Schwab auth state.
(async () => {
  try {
    await loadTokens();
  } catch (e) {
    console.warn('[SERVER] Schwab token load failed (non-fatal):', e.message);
    console.warn('[SERVER] Options grading via Polygon/Yahoo will still work.');
  }
  try {
    // Start the Manifest-Compliant Discovery Engine (100% FETCH)
    startDiscoveryEngine();
  } catch (e) {
    console.warn('[SERVER] Discovery engine start failed (non-fatal):', e.message);
  }
})();

// Server always starts — token failures are non-fatal, not startup blockers
app.listen(PORT, () => {
  console.log(`\n═══════════════════════════════════════════════`);
  console.log(`  The Options Edge™ — ScriptMasterLabs™`);
  console.log(`  Server running on port ${PORT}`);
  console.log(`  Mode: SqueezeOS Pro-Model Dynamic Discovery`);
  console.log(`  Priority: SCHWAB → POLYGON → YAHOO`);
  console.log(`  BYOK: Tradier, Polygon, OpenAI supported`);
  console.log(`═══════════════════════════════════════════════\n`);
});

app.get('/api/auth/schwab/url', (req, res) => {
  try {
    res.json({ url: getAuthUrl() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/auth/schwab/callback', async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) throw new Error('Authorization code is missing');
    const tokens = await exchangeCode(code);
    res.json({ success: true, message: 'Institutional Session Authorized!', tokens });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── ENDPOINTS ───────────────────────────────────────────────────────────────

/**
 * Live Setup Stream
 * Fetches the current vetted setups found by the Discovery Engine.
 */
app.get('/api/flow', (req, res) => {
  try {
    const setups = getHotSetups();
    res.json({ setups });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Conviction Plays — AMC, GME, IWM 0DTE
 * The ONLY allowed watchlist items. Full strike/date/action.
 */
app.get('/api/conviction', (req, res) => {
  try {
    const plays = getConvictionPlays();
    res.json({ plays });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Serve static frontend in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '..', 'dist')));
}

// ─── RATE LIMITING (simple in-memory) ────────────────────────────────────────
const scanCounts = {};
function rateLimiter(tier) {
  return (req, res, next) => {
    const ip = req.ip || 'unknown';
    const today = new Date().toDateString();
    const key = `${ip}-${today}`;
    if (!scanCounts[key]) scanCounts[key] = 0;

    const limits = { free: 2, starter: 5, pro: 999, elite: 999 };
    const limit = limits[tier] || limits.free;

    if (scanCounts[key] >= limit) {
      return res.status(429).json({
        error: 'Daily scan limit reached',
        limit,
        tier,
        upgrade: 'Upgrade your plan for more scans → www.scriptmasterlabs.com'
      });
    }
    scanCounts[key]++;
    next();
  };
}

// ─── SCAN ENDPOINT ───────────────────────────────────────────────────────────
app.post('/api/scan', async (req, res) => {
  try {
    let { ticker, tier = 'elite', byokConfig = {}, userId } = req.body;
    
    // Server-side tier verification if userId is present (Enforced in Production)
    if (userId && process.env.NODE_ENV === 'production') {
      tier = getTier(userId);
    }

    if (!ticker || typeof ticker !== 'string') {
      return res.status(400).json({ error: 'Ticker symbol required' });
    }

    const cleanTicker = ticker.toUpperCase().trim().replace(/[^A-Z]/g, '');
    if (cleanTicker.length < 1 || cleanTicker.length > 5) {
      return res.status(400).json({ error: 'Invalid ticker symbol' });
    }

    console.log(`[SCAN] ${cleanTicker} | tier: ${tier} | source: ${byokConfig.tradierKey ? 'Tradier' : byokConfig.polygonKey ? 'Polygon' : 'Yahoo'}`);

    // Fetch options chain
    const chainData = await fetchOptionsChain(cleanTicker, byokConfig);

    if (!chainData.contracts || chainData.contracts.length === 0) {
      return res.status(404).json({ error: `No options found for ${cleanTicker}. Make sure it's an optionable stock.` });
    }

    // Grade all contracts
    const graded = gradeOptionsChain(
      chainData.contracts,
      chainData.underlyingPrice,
      chainData.historicalIV
    );

    // Apply tier limits
    const resultLimits = { free: 5, starter: 10, pro: graded.length, elite: graded.length };
    const maxResults = resultLimits[tier] || resultLimits.free;

    // Response
    res.json({
      ticker: chainData.ticker,
      underlyingPrice: chainData.underlyingPrice,
      source: chainData.source,
      timestamp: chainData.timestamp,
      totalContracts: graded.length,
      expirationDates: chainData.expirationDates,
      results: graded.slice(0, maxResults),
      tier,
      limited: graded.length > maxResults,
      hiddenCount: Math.max(0, graded.length - maxResults),
      brand: {
        name: 'The Options Edge™',
        by: 'ScriptMasterLabs™',
        url: 'www.scriptmasterlabs.com'
      }
    });

  } catch (error) {
    console.error(`[ERROR] Scan failed:`, error.message);
    res.status(500).json({ error: error.message });
  }
});

// ─── AI THESIS ENDPOINT ──────────────────────────────────────────────────────
app.post('/api/thesis', async (req, res) => {
  try {
    const { contract, underlyingPrice } = req.body;
    // Uses the server-side ANTHROPIC_API_KEY by default
    const thesis = await generateThesis(contract, underlyingPrice);
    res.json({ thesis });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── STRIPE ENDPOINTS ────────────────────────────────────────────────────────
app.post('/api/stripe/create-checkout-session', async (req, res) => {
  try {
    const { userId, tier } = req.body;
    if (!userId || !tier) throw new Error('User ID and Tier required');
    const session = await createCheckoutSession(userId, tier);
    res.json({ url: session.url });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Important: Stripe webhooks need raw body for signature verification
app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  try {
    const result = await handleWebhook(sig, req.body);
    res.json(result);
  } catch (err) {
    res.status(400).send(`Webhook Error: ${err.message}`);
  }
});

// ─── HEALTH CHECK ────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'The Options Edge™', brand: 'ScriptMasterLabs™', version: '5.0.0' });
});

// ─── BYOK KEY VALIDATION ────────────────────────────────────────────────────
app.post('/api/validate-key', async (req, res) => {
  const { provider, key } = req.body;
  try {
    if (provider === 'tradier') {
      const data = await fetchOptionsChain('AAPL', { tradierKey: key });
      res.json({ valid: true, provider, message: `Connected! Found ${data.contracts.length} contracts.` });
    } else if (provider === 'polygon') {
      const data = await fetchOptionsChain('AAPL', { polygonKey: key });
      res.json({ valid: true, provider, message: `Connected! Found ${data.contracts.length} contracts.` });
    } else if (provider === 'alpaca') {
      const { fetchAlpaca } = require('./services/optionsData.cjs');
      // For Alpaca, key is an object: { keyId, secret }
      const byokConfig = key && key.keyId ? { alpacaKey: key.keyId, alpacaSecret: key.secret } : {};
      const data = await fetchAlpaca('AAPL', byokConfig);
      res.json({ valid: true, provider, message: `Connected! Found ${data.contracts.length} contracts.` });
    } else {
      res.json({ valid: false, message: 'Unknown provider' });
    }
  } catch (e) {
    res.json({ valid: false, provider, message: e.message });
  }
});

// ─── CATCHALL (SPA) ──────────────────────────────────────────────────────────
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(__dirname, '..', 'dist', 'index.html'));
  });
}


module.exports = app;
