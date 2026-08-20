/**
 * index.js — Northstar Retail Co. Inventory Sync Service
 * Assessed Sprint — 5-Day Engineering MVP
 */

const express = require('express');
const cors    = require('cors');
const path    = require('path');
const db      = require('./db');
const queue   = require('./queue');
const routes  = require('./routes');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// ── API Routes ────────────────────────────────────────────────────────────────
app.use('/api',       routes);
app.use('/webhooks',  routes);  // /webhooks/inventory lives here too

// ── Queue Worker: Inventory Updates ──────────────────────────────────────────
queue.consume(async (message) => {
  if (message.type !== 'INVENTORY_UPDATE') return;

  const { productId, stock, source } = message.payload;

  if (!productId || stock === undefined) {
    throw new Error(`Invalid inventory update payload: ${JSON.stringify(message.payload)}`);
  }

  db.upsertProduct({ productId, stock, source: source || 'queue' });

  db.appendLog({
    id:      message.id,
    type:    'INVENTORY_UPDATED',
    payload: { productId, stock, source },
    status:  'ok',
  });
});

// ── SPA fallback ──────────────────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// ── Boot ──────────────────────────────────────────────────────────────────────
db.seedIfEmpty();

app.listen(PORT, () => {
  console.log(`\n┌─────────────────────────────────────────────────┐`);
  console.log(`│  Northstar Retail Co. — Inventory Sync Service  │`);
  console.log(`│  http://localhost:${PORT}                           │`);
  console.log(`│  5-Day Assessed Sprint MVP                       │`);
  console.log(`└─────────────────────────────────────────────────┘\n`);
});

module.exports = app;
