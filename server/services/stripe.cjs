// ═══════════════════════════════════════════════════════════════════════════════
// Stripe Service — Subscription Engine
// by ScriptMasterLabs™
// ═══════════════════════════════════════════════════════════════════════════════

let stripe;
if (process.env.STRIPE_SECRET_KEY) {
  stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
} else {
  console.warn('[STRIPE] No STRIPE_SECRET_KEY found. Payments disabled.');
}
const fs = require('fs');
const path = require('path');

const SUBS_FILE = path.join(__dirname, '..', 'data', 'subscriptions.json');

// Ensure data dir exists
if (!fs.existsSync(path.dirname(SUBS_FILE))) {
  fs.mkdirSync(path.dirname(SUBS_FILE), { recursive: true });
}

// Admin whitelist — owner gets elite for life, no Stripe needed
const ADMIN_IDS = new Set([
  'admin',
  'scriptmasterlabs',
  'timwal78',
  'owner',
]);

/**
 * Get subscription tier for a user (or IP fallback)
 * Admin IDs always return 'elite' — owner never gets charged.
 */
function getTier(userId) {
  try {
    // Admin override — owner is always elite
    if (userId && ADMIN_IDS.has(userId.toLowerCase())) return 'elite';

    if (!fs.existsSync(SUBS_FILE)) return 'free';
    const subs = JSON.parse(fs.readFileSync(SUBS_FILE));
    return subs[userId] || 'free';
  } catch (e) {
    return 'free';
  }
}

/**
 * Create a Stripe Checkout Session
 */
async function createCheckoutSession(userId, tier) {
  if (!stripe) throw new Error('Stripe is not configured on this server.');
  const priceIds = {
    starter: process.env.PRICE_STARTER_ID || 'price_123_starter',
    pro: process.env.PRICE_PRO_ID || 'price_123_pro',
    elite: process.env.PRICE_ELITE_ID || 'price_123_elite'
  };

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: [{ price: priceIds[tier], quantity: 1 }],
    mode: 'subscription',
    success_url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/?session_id={CHECKOUT_SESSION_ID}&tier=${tier}`,
    cancel_url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/pricing`,
    metadata: { userId, tier }
  });

  return session;
}

/**
 * Handle Stripe Webhooks
 */
async function handleWebhook(sig, body) {
  if (!stripe) throw new Error('Stripe is not configured on this server.');
  let event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    throw new Error(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const { userId, tier } = session.metadata;

    // Save to local JSON "database"
    const subs = fs.existsSync(SUBS_FILE) ? JSON.parse(fs.readFileSync(SUBS_FILE)) : {};
    subs[userId] = tier;
    fs.writeFileSync(SUBS_FILE, JSON.stringify(subs, null, 2));
    
    console.log(`[STRIPE] Subscription activated: ${userId} → ${tier}`);
  }

  return { received: true };
}

module.exports = { getTier, createCheckoutSession, handleWebhook };
