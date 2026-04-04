// ═══════════════════════════════════════════════════════════════════════════════
// SQUEEZE OS: SCHWAB OAUTH SERVICE (Node.js)
// ═══════════════════════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');

const CLIENT_ID = process.env.SCHWAB_CLIENT_ID;
const CLIENT_SECRET = process.env.SCHWAB_CLIENT_SECRET;
const REDIRECT_URI = process.env.SCHWAB_REDIRECT_URI || 'https://127.0.0.1:8183/';

const TOKEN_FILE = path.join(__dirname, '..', '..', 'schwab_tokens.json');

/**
 * Generate Authorization URL
 */
function getAuthUrl() {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI
  });
  return `https://api.schwabapi.com/v1/oauth/authorize?${params.toString()}`;
}

/**
 * Exchange Authorization Code for Token
 */
async function safeJsonParse(res) {
  const text = await res.text();
  if (!text || text.trim().length === 0) {
    throw new Error(`Empty response from Schwab (HTTP ${res.status})`);
  }
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error(`Invalid JSON from Schwab (HTTP ${res.status}): ${text.substring(0, 200)}`);
  }
}

async function exchangeCode(code) {
  const authHeader = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: decodeURIComponent(code),
    redirect_uri: REDIRECT_URI
  });

  try {
    const res = await fetch('https://api.schwabapi.com/v1/oauth/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${authHeader}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: body.toString()
    });

    const data = await safeJsonParse(res);
    if (!res.ok) throw new Error(data.error_description || data.error || 'Token exchange failed');

    saveTokens(data);
    return data;
  } catch (err) {
    console.error('[SCHWAB OAUTH ERROR]', err.message);
    throw err;
  }
}

/**
 * Refresh Access Token
 */
async function refreshAccessToken(refreshToken) {
  const authHeader = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
  
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken
  });

  try {
    const res = await fetch('https://api.schwabapi.com/v1/oauth/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${authHeader}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: body.toString()
    });

    const data = await safeJsonParse(res);
    if (!res.ok) throw new Error(data.error_description || data.error || 'Token refresh failed');

    saveTokens(data);
    return data;
  } catch (err) {
    console.error('[SCHWAB REFRESH ERROR]', err.message);
    throw err;
  }
}

function saveTokens(data) {
  const tokens = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + (data.expires_in * 1000),
    updated_at: new Date().toISOString()
  };
  fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokens, null, 2));
  
  // Also push to process.env for the current session
  process.env.SCHWAB_ACCESS_TOKEN = tokens.access_token;
}

async function loadTokens() {
  if (fs.existsSync(TOKEN_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'));
      if (!data.access_token) return null;

      // Check if expired (or within 5 min buffer)
      const buffer = 5 * 60 * 1000;
      if (Date.now() > (data.expires_at - buffer)) {
        console.log('[SCHWAB] Access token expired, refreshing...');
        if (data.refresh_token) {
          const freshData = await refreshAccessToken(data.refresh_token);
          return freshData;
        }
      }

      process.env.SCHWAB_ACCESS_TOKEN = data.access_token;
      return data;
    } catch (e) {
      console.error('[SCHWAB] Failed to load tokens:', e.message);
    }
  }
  return null;
}

module.exports = { getAuthUrl, exchangeCode, refreshAccessToken, loadTokens };
