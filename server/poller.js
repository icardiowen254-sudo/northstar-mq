/**
 * poller.js — Polling-based Inventory Sync Service
 *
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  DEPRECATED — Day 5 Refactor                                ║
 * ║  This polling architecture was replaced by webhook-driven   ║
 * ║  event processing as of Day 4 pivot.                        ║
 * ║                                                             ║
 * ║  Status: DISABLED by default in Day 5 mode.                 ║
 * ║  Kept for reference and regression comparison only.         ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * Original architecture (Day 3):
 *   Warehouse API → Poll every 5 min → Inventory Cache → Query API → Support Tool
 */

const db        = require('./db');
const warehouse = require('./warehouse');

const POLL_INTERVAL_MS  = 5 * 60 * 1000;  // 5 minutes (production)
const DEMO_INTERVAL_MS  = 30 * 1000;       // 30 seconds (demo mode)

let _pollTimer     = null;
let _lastPollAt    = null;
let _lastPollStatus = null;
let _pollCount     = 0;
let _demoMode      = false;

/**
 * runOnce()
 * Execute a single poll cycle.
 * Fetches from warehouse, updates cache, logs result.
 */
async function runOnce() {
  const cfg = db.getConfig();

  // Hard stop if polling is disabled (Day 5 mode)
  if (!cfg.pollingEnabled) {
    db.appendLog({
      id:      `poll-blocked-${Date.now()}`,
      type:    'POLL_BLOCKED',
      payload: { reason: 'Polling is disabled in current configuration (Day 5 — webhook mode)' },
      status:  'warn',
    });
    return { ok: false, reason: 'Polling disabled' };
  }

  _pollCount++;
  const pollId = `poll-${_pollCount}-${Date.now()}`;

  db.appendLog({
    id:      pollId,
    type:    'POLL_START',
    payload: { pollNumber: _pollCount, mode: _demoMode ? 'demo' : 'production' },
    status:  'ok',
  });

  try {
    const products = await warehouse.fetchInventory();

    products.forEach(p => {
      db.upsertProduct({ ...p, source: 'polling' });
    });

    _lastPollAt     = new Date().toISOString();
    _lastPollStatus = 'success';

    db.appendLog({
      id:      pollId,
      type:    'POLL_SUCCESS',
      payload: { productsUpdated: products.length, pollNumber: _pollCount },
      status:  'ok',
    });

    return { ok: true, updated: products.length };

  } catch (err) {
    _lastPollStatus = 'error';

    db.appendLog({
      id:      pollId,
      type:    'POLL_ERROR',
      payload: { error: err.message, pollNumber: _pollCount },
      status:  'error',
    });

    return { ok: false, error: err.message };
  }
}

/**
 * start(demoMode)
 * Starts the polling loop.
 * demoMode = true → polls every 30s instead of 5 min.
 */
function start(demoMode = false) {
  const cfg = db.getConfig();
  if (!cfg.pollingEnabled) {
    return { ok: false, reason: 'Polling disabled in config' };
  }

  if (_pollTimer) stop();

  _demoMode = demoMode;
  const interval = demoMode ? DEMO_INTERVAL_MS : POLL_INTERVAL_MS;

  // Run immediately, then on schedule
  runOnce();
  _pollTimer = setInterval(runOnce, interval);

  db.appendLog({
    id:      `poll-start-${Date.now()}`,
    type:    'POLL_STARTED',
    payload: { intervalMs: interval, demoMode },
    status:  'ok',
  });

  return { ok: true, intervalMs: interval, demoMode };
}

/**
 * stop()
 * Stops the polling loop.
 */
function stop() {
  if (_pollTimer) {
    clearInterval(_pollTimer);
    _pollTimer = null;
  }
  db.appendLog({
    id:      `poll-stop-${Date.now()}`,
    type:    'POLL_STOPPED',
    payload: {},
    status:  'warn',
  });
}

function isRunning()       { return _pollTimer !== null; }
function getLastPollAt()   { return _lastPollAt; }
function getLastStatus()   { return _lastPollStatus; }
function getPollCount()    { return _pollCount; }

module.exports = {
  runOnce,
  start,
  stop,
  isRunning,
  getLastPollAt,
  getLastStatus,
  getPollCount,
};
