/**
 * routes.js — Express API Routes
 *
 * Endpoints:
 *
 * INVENTORY
 *   GET  /api/inventory              → all products
 *   GET  /api/inventory/:productId   → single product (Query API)
 *
 * POLLING (Day 3 — deprecated Day 5)
 *   POST /api/polling/start          → start poller
 *   POST /api/polling/stop           → stop poller
 *   POST /api/polling/run-once       → single poll
 *   POST /api/polling/simulate-fail  → next poll will fail
 *   GET  /api/polling/status         → poller state
 *
 * WEBHOOKS (Day 4/5)
 *   POST /webhooks/inventory         → receive inventory event
 *   GET  /api/webhooks/events        → event log
 *
 * QUEUE
 *   GET  /api/queue/stats            → queue metrics
 *   GET  /api/queue/contents         → queue contents
 *   GET  /api/queue/dlq              → dead-letter queue
 *   POST /api/queue/dlq/clear        → clear DLQ
 *
 * SYSTEM
 *   GET  /api/system/status          → full system status
 *   GET  /api/system/logs            → activity logs
 *   POST /api/system/config          → update phase/config
 *   GET  /api/system/config          → current config
 *
 * LEARNING JOURNAL
 *   GET  /api/journal                → all entries
 *   POST /api/journal                → create entry
 *   PUT  /api/journal/:id            → update entry
 *   DELETE /api/journal/:id          → delete entry
 *
 * SCOPE DELTA
 *   GET  /api/scope-delta            → get document
 *   PUT  /api/scope-delta            → save document
 *
 * CHECKLIST
 *   GET  /api/checklist              → get items
 *   PUT  /api/checklist              → save items
 *
 * ADAPTABILITY INDEX
 *   GET  /api/adaptability           → get form
 *   PUT  /api/adaptability           → save form
 *
 * WAREHOUSE SIMULATOR
 *   GET  /api/warehouse/snapshot     → current warehouse state
 *   POST /api/warehouse/update       → manually set stock
 *   POST /api/warehouse/send-webhook → simulate webhook from warehouse
 */

const express  = require('express');
const { v4: uuid } = require('uuid');

const db        = require('./db');
const queue     = require('./queue');
const poller    = require('./poller');
const warehouse = require('./warehouse');

const router = express.Router();

// ── INVENTORY ────────────────────────────────────────────────────────────────

router.get('/inventory', (req, res) => {
  const cache = db.getInventory();
  const products = Object.values(cache).map(p => ({
    ...p,
    inStock: p.stock > 0,
  }));
  res.json({ ok: true, count: products.length, products });
});

/**
 * GET /api/inventory/:productId
 * The Query API — used by the Support Tool.
 * Must continue working in both Day 3 and Day 5 modes.
 */
router.get('/inventory/:productId', (req, res) => {
  const product = db.getProduct(req.params.productId);
  if (!product) {
    return res.status(404).json({
      ok: false,
      error: `Product ${req.params.productId} not found`,
    });
  }
  res.json({
    ok:         true,
    productId:  product.productId,
    name:       product.name,
    inStock:    product.stock > 0,
    quantity:   product.stock,
    lastSyncedAt: product.lastSyncedAt,
    source:     product.source,
  });
});

// ── POLLING (DEPRECATED after Day 4) ─────────────────────────────────────────

router.get('/polling/status', (req, res) => {
  const cfg = db.getConfig();
  res.json({
    ok:          true,
    running:     poller.isRunning(),
    enabled:     cfg.pollingEnabled,
    lastPollAt:  poller.getLastPollAt(),
    lastStatus:  poller.getLastStatus(),
    pollCount:   poller.getPollCount(),
    deprecated:  cfg.phase === 'day5',
  });
});

router.post('/polling/start', (req, res) => {
  const cfg = db.getConfig();
  if (!cfg.pollingEnabled) {
    return res.status(403).json({
      ok: false,
      error: 'Polling is disabled in Day 5 mode. This architecture has been replaced by webhooks.',
    });
  }
  const result = poller.start(req.body.demoMode ?? true);
  res.json({ ok: true, ...result });
});

router.post('/polling/stop', (req, res) => {
  poller.stop();
  res.json({ ok: true, message: 'Poller stopped' });
});

router.post('/polling/run-once', async (req, res) => {
  const cfg = db.getConfig();
  if (!cfg.pollingEnabled) {
    return res.status(403).json({
      ok: false,
      error: 'Polling is disabled in Day 5 mode.',
    });
  }
  const result = await poller.runOnce();
  res.json({ ok: true, ...result });
});

router.post('/polling/simulate-fail', (req, res) => {
  warehouse.triggerFailure();
  res.json({ ok: true, message: 'Next warehouse fetch will fail (simulated)' });
});

// ── WEBHOOKS ──────────────────────────────────────────────────────────────────

/**
 * POST /webhooks/inventory
 *
 * Receives inventory change events from the warehouse.
 * Day 4/5 architecture replaces polling with this endpoint.
 *
 * Expected payload:
 * {
 *   "eventId":   "evt-001",
 *   "productId": "SKU-001",
 *   "stock":     18,
 *   "timestamp": "2026-08-19T10:00:00Z"
 * }
 */
router.post('/inventory', (req, res) => {
  const cfg = db.getConfig();

  // In Day 3 mode, webhooks are not the primary path (but we still accept for demo)
  const body = req.body;

  // ── Validation ──────────────────────────────────────────────────────────────
  const required = ['eventId', 'productId', 'stock'];
  const missing  = required.filter(k => body[k] === undefined || body[k] === null);

  if (missing.length > 0) {
    db.appendLog({
      id:      `wh-reject-${Date.now()}`,
      type:    'WEBHOOK_REJECTED',
      payload: { reason: 'Missing fields', missing, body },
      status:  'error',
    });
    return res.status(400).json({
      ok:      false,
      error:   'Invalid payload',
      missing,
    });
  }

  if (typeof body.stock !== 'number' || body.stock < 0) {
    return res.status(400).json({
      ok:    false,
      error: 'stock must be a non-negative number',
    });
  }

  // ── Deduplication ────────────────────────────────────────────────────────────
  if (db.isEventProcessed(body.eventId)) {
    db.appendLog({
      id:      body.eventId,
      type:    'WEBHOOK_DUPLICATE',
      payload: { eventId: body.eventId, productId: body.productId },
      status:  'warn',
    });
    return res.status(200).json({
      ok:       true,
      message:  'Event already processed (duplicate)',
      eventId:  body.eventId,
      duplicate: true,
    });
  }

  // ── Enqueue ──────────────────────────────────────────────────────────────────
  db.markEventProcessed(body.eventId);

  const message = queue.publish({
    id:      body.eventId,
    type:    'INVENTORY_UPDATE',
    payload: {
      productId: body.productId,
      stock:     body.stock,
      timestamp: body.timestamp || new Date().toISOString(),
      source:    'webhook',
    },
  });

  db.appendLog({
    id:      body.eventId,
    type:    'WEBHOOK_ACCEPTED',
    payload: { productId: body.productId, stock: body.stock },
    status:  'ok',
  });

  res.status(202).json({
    ok:        true,
    message:   'Event accepted and queued for processing',
    eventId:   body.eventId,
    messageId: message.id,
  });
});

router.get('/events', (req, res) => {
  const logs = db.getLogs().filter(l =>
    l.type && l.type.startsWith('WEBHOOK')
  );
  res.json({ ok: true, count: logs.length, events: logs });
});

// ── QUEUE ─────────────────────────────────────────────────────────────────────

router.get('/queue/stats', (req, res) => {
  res.json({ ok: true, stats: queue.getStats() });
});

router.get('/queue/contents', (req, res) => {
  res.json({ ok: true, queue: queue.getQueueContents() });
});

router.get('/queue/dlq', (req, res) => {
  res.json({ ok: true, dlq: queue.getDeadLetters() });
});

router.post('/queue/dlq/clear', (req, res) => {
  const count = queue.clearDeadLetters();
  res.json({ ok: true, cleared: count });
});

// ── SYSTEM ────────────────────────────────────────────────────────────────────

router.get('/system/status', (req, res) => {
  const cfg      = db.getConfig();
  const inventory = db.getInventory();
  const qStats   = queue.getStats();

  const lastSync = Object.values(inventory)
    .map(p => p.lastSyncedAt)
    .filter(Boolean)
    .sort()
    .reverse()[0] || null;

  res.json({
    ok: true,
    phase:          cfg.phase,
    pollingEnabled: cfg.pollingEnabled,
    webhookEnabled: cfg.webhookEnabled,
    pollingRunning: poller.isRunning(),
    lastPollAt:     poller.getLastPollAt(),
    lastPollStatus: poller.getLastStatus(),
    inventoryCount: Object.keys(inventory).length,
    lastSyncAt:     lastSync,
    queue:          qStats,
    warehouseCalls: warehouse.getCallCount(),
  });
});

router.get('/system/logs', (req, res) => {
  const limit = parseInt(req.query.limit) || 100;
  const type  = req.query.type;
  let logs    = db.getLogs();
  if (type) logs = logs.filter(l => l.type === type);
  res.json({ ok: true, count: logs.length, logs: logs.slice(0, limit) });
});

router.get('/system/config', (req, res) => {
  res.json({ ok: true, config: db.getConfig() });
});

router.post('/system/config', (req, res) => {
  const current = db.getConfig();
  const updated = { ...current, ...req.body };

  // Enforce Day 5: if switching to day5, disable polling
  if (updated.phase === 'day5') {
    updated.pollingEnabled = false;
    updated.webhookEnabled = true;
    poller.stop();
    db.appendLog({
      id:      `config-day5-${Date.now()}`,
      type:    'SYSTEM_CONFIG',
      payload: { phase: 'day5', pollingDisabled: true, webhookEnabled: true },
      status:  'warn',
    });
  } else if (updated.phase === 'day3') {
    updated.pollingEnabled = true;
    updated.webhookEnabled = false;
  }

  db.saveConfig(updated);
  res.json({ ok: true, config: updated });
});

// ── JOURNAL ───────────────────────────────────────────────────────────────────

router.get('/journal', (req, res) => {
  res.json({ ok: true, entries: db.getJournal() });
});

router.post('/journal', (req, res) => {
  const entries = db.getJournal();
  const entry = {
    id:        uuid(),
    createdAt: new Date().toISOString(),
    ...req.body,
  };
  entries.push(entry);
  db.saveJournal(entries);
  res.status(201).json({ ok: true, entry });
});

router.put('/journal/:id', (req, res) => {
  const entries = db.getJournal();
  const idx     = entries.findIndex(e => e.id === req.params.id);
  if (idx === -1) return res.status(404).json({ ok: false, error: 'Entry not found' });
  entries[idx] = { ...entries[idx], ...req.body, id: req.params.id };
  db.saveJournal(entries);
  res.json({ ok: true, entry: entries[idx] });
});

router.delete('/journal/:id', (req, res) => {
  let entries = db.getJournal();
  entries     = entries.filter(e => e.id !== req.params.id);
  db.saveJournal(entries);
  res.json({ ok: true });
});

// ── SCOPE DELTA ───────────────────────────────────────────────────────────────

router.get('/scope-delta', (req, res) => {
  res.json({ ok: true, data: db.getScopeDelta() });
});

router.put('/scope-delta', (req, res) => {
  db.saveScopeDelta(req.body);
  res.json({ ok: true });
});

// ── CHECKLIST ─────────────────────────────────────────────────────────────────

router.get('/checklist', (req, res) => {
  res.json({ ok: true, items: db.getChecklist() });
});

router.put('/checklist', (req, res) => {
  db.saveChecklist(req.body.items);
  res.json({ ok: true });
});

// ── ADAPTABILITY ──────────────────────────────────────────────────────────────

router.get('/adaptability', (req, res) => {
  res.json({ ok: true, data: db.getAdaptability() });
});

router.put('/adaptability', (req, res) => {
  db.saveAdaptability(req.body);
  res.json({ ok: true });
});

// ── WAREHOUSE SIMULATOR ───────────────────────────────────────────────────────

router.get('/warehouse/snapshot', (req, res) => {
  res.json({ ok: true, snapshot: warehouse.getWarehouseSnapshot() });
});

router.post('/warehouse/update', (req, res) => {
  const { productId, stock } = req.body;
  if (!productId || stock === undefined) {
    return res.status(400).json({ ok: false, error: 'productId and stock required' });
  }
  const ok = warehouse.updateWarehouseStock(productId, stock);
  if (!ok) return res.status(404).json({ ok: false, error: 'Product not found in warehouse' });
  res.json({ ok: true, message: `Warehouse stock updated: ${productId} → ${stock}` });
});

/**
 * POST /api/warehouse/send-webhook
 * Simulates the warehouse sending a webhook event to our receiver.
 * Used in Day 4/5 demo to show end-to-end webhook flow.
 */
router.post('/warehouse/send-webhook', (req, res) => {
  const { productId, stock } = req.body;
  if (!productId || stock === undefined) {
    return res.status(400).json({ ok: false, error: 'productId and stock required' });
  }

  const eventId = `evt-${Date.now()}`;
  const payload = {
    eventId,
    productId,
    stock,
    timestamp: new Date().toISOString(),
  };

  db.appendLog({
    id:      eventId,
    type:    'WAREHOUSE_WEBHOOK_SENT',
    payload: { productId, stock, eventId },
    status:  'ok',
  });

  // Internally route to webhook handler (same as if warehouse POSTed to us)
  // We simulate this by calling our own logic directly
  const fakeReq = { body: payload };
  const fakeRes = {
    status: (code) => ({ json: (data) => {} }),
    json:   (data) => {},
  };

  // Re-use the webhook processing logic inline
  if (db.isEventProcessed(eventId)) {
    return res.json({ ok: true, duplicate: true });
  }

  db.markEventProcessed(eventId);
  const message = queue.publish({
    id:      eventId,
    type:    'INVENTORY_UPDATE',
    payload: { productId, stock, timestamp: payload.timestamp, source: 'webhook' },
  });

  res.json({ ok: true, eventId, messageId: message.id, payload });
});

module.exports = router;
