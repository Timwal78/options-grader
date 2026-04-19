// ═══════════════════════════════════════════════════════════════════════════════
// MY OPTIONS GRADER — Discord Alert Service
// ScriptMasterLabs™
// ═══════════════════════════════════════════════════════════════════════════════

const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_OPTIONS || '';
const MIN_GRADE = process.env.DISCORD_ALERT_MIN_GRADE || 'B';

// Grade hierarchy for comparison
const GRADE_ORDER = { 'S': 0, 'A+': 1, 'A': 2, 'B+': 3, 'B': 4, 'C+': 5, 'C': 6, 'D': 7, 'F': 8 };

// Deduplication: track alerts sent in the last hour
const sentAlerts = new Map();
const DEDUP_WINDOW_MS = 60 * 60 * 1000; // 1 hour

// Rate limiting: max 30 alerts per 10 minutes
let alertCount = 0;
let windowStart = Date.now();
const MAX_ALERTS_PER_WINDOW = 30;
const RATE_WINDOW_MS = 10 * 60 * 1000;

function isEnabled() {
  return !!WEBHOOK_URL;
}

function meetsGradeThreshold(grade) {
  const target = GRADE_ORDER[MIN_GRADE];
  const actual = GRADE_ORDER[grade];
  if (target === undefined || actual === undefined) return false;
  return actual <= target;
}

function isDuplicate(key) {
  const lastSent = sentAlerts.get(key);
  if (!lastSent) return false;
  return (Date.now() - lastSent) < DEDUP_WINDOW_MS;
}

function isRateLimited() {
  if (Date.now() - windowStart > RATE_WINDOW_MS) {
    alertCount = 0;
    windowStart = Date.now();
  }
  return alertCount >= MAX_ALERTS_PER_WINDOW;
}

/**
 * Send an options setup alert to Discord
 * @param {Object} setup - Discovery engine setup object
 */
async function sendOptionsAlert(setup) {
  if (!isEnabled()) return;
  if (!meetsGradeThreshold(setup.grade)) return;

  const dedupKey = `${setup.ticker}-${setup.side}-${setup.strike}-${setup.expiration}`;
  if (isDuplicate(dedupKey)) return;
  if (isRateLimited()) return;

  const sideEmoji = setup.side === 'CALL' ? '🟢' : '🔴';
  const gradeEmoji = setup.grade === 'S' ? '💎' : setup.grade.startsWith('A') ? '🔥' : '⚡';
  const changeStr = setup.change >= 0 ? `+${setup.change.toFixed(2)}%` : `${setup.change.toFixed(2)}%`;
  const changeColor = setup.change >= 0 ? 0x22c55e : 0xef4444;

  const embed = {
    embeds: [{
      title: `${gradeEmoji} ${setup.ticker} — Grade ${setup.grade} ${setup.side}`,
      color: changeColor,
      fields: [
        { name: '💰 Price', value: `$${setup.price?.toFixed(2) || 'N/A'}`, inline: true },
        { name: '📊 Change', value: changeStr, inline: true },
        { name: `${sideEmoji} Side`, value: setup.side, inline: true },
        { name: '🎯 Strike', value: `$${setup.strike}`, inline: true },
        { name: '📅 Expiration', value: setup.expiration || 'N/A', inline: true },
        { name: '🏆 Score', value: `${setup.score}/100`, inline: true },
        { name: '📈 Volume', value: `${(setup.vol || 0).toLocaleString()}`, inline: true },
        { name: '📋 Open Interest', value: `${(setup.oi || 0).toLocaleString()}`, inline: true },
        { name: '🔌 Source', value: setup.source || 'Polygon', inline: true },
      ],
      footer: {
        text: 'My Options Grader • ScriptMasterLabs™'
      },
      timestamp: new Date().toISOString()
    }]
  };

  try {
    const res = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(embed)
    });

    if (res.ok) {
      sentAlerts.set(dedupKey, Date.now());
      alertCount++;
      console.log(`[DISCORD] ✅ Options alert sent: ${setup.ticker} ${setup.side} ${setup.grade}`);
    } else if (res.status === 429) {
      console.warn('[DISCORD] ⚠️ Rate limited by Discord. Backing off.');
    } else {
      console.error(`[DISCORD] ❌ Failed (${res.status}): ${await res.text()}`);
    }
  } catch (err) {
    console.error('[DISCORD] ❌ Webhook error:', err.message);
  }
}

/**
 * Send a batch summary of top setups
 * @param {Array} setups - Array of setup objects
 */
async function sendBatchSummary(setups) {
  if (!isEnabled()) return;
  if (!setups || setups.length === 0) return;

  const topSetups = setups
    .filter(s => meetsGradeThreshold(s.grade))
    .slice(0, 10);

  if (topSetups.length === 0) return;

  const lines = topSetups.map((s, i) => {
    const emoji = s.side === 'CALL' ? '🟢' : '🔴';
    return `**${i + 1}.** ${emoji} **${s.ticker}** $${s.strike} ${s.side} — Grade **${s.grade}** (${s.score}/100)`;
  });

  const embed = {
    embeds: [{
      title: `📊 Options Flow — Top ${topSetups.length} Setups`,
      description: lines.join('\n'),
      color: 0x6366f1,
      footer: {
        text: 'My Options Grader • ScriptMasterLabs™'
      },
      timestamp: new Date().toISOString()
    }]
  };

  try {
    const res = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(embed)
    });

    if (res.ok) {
      console.log(`[DISCORD] ✅ Batch summary sent: ${topSetups.length} setups`);
    }
  } catch (err) {
    console.error('[DISCORD] ❌ Batch summary error:', err.message);
  }
}

// Cleanup stale dedup entries every 30 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, ts] of sentAlerts) {
    if (now - ts > DEDUP_WINDOW_MS) sentAlerts.delete(key);
  }
}, 30 * 60 * 1000);

module.exports = { sendOptionsAlert, sendBatchSummary, isEnabled };
