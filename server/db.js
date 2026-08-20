/**
 * db.js — Simple JSON file persistence layer
 * 
 * In production this would be replaced with PostgreSQL/Redis.
 * For this sprint prototype, JSON files give us persistence
 * without requiring native binary modules.
 */

const fs   = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');

function filePath(name) {
  return path.join(DATA_DIR, `${name}.json`);
}

function read(name) {
  try {
    const raw = fs.readFileSync(filePath(name), 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function write(name, data) {
  fs.writeFileSync(filePath(name), JSON.stringify(data, null, 2), 'utf8');
}

// ── Inventory Cache ──────────────────────────────────────────────────────────
// { productId: { productId, name, stock, lastSyncedAt, source } }

function getInventory() {
  return read('inventory') || {};
}

function setInventory(cache) {
  write('inventory', cache);
}

function upsertProduct(product) {
  const cache = getInventory();
  cache[product.productId] = {
    ...cache[product.productId],
    ...product,
    lastSyncedAt: new Date().toISOString(),
  };
  setInventory(cache);
  return cache[product.productId];
}

function getProduct(productId) {
  const cache = getInventory();
  return cache[productId] || null;
}

// ── Event Log ────────────────────────────────────────────────────────────────
// Array of { id, type, payload, timestamp, status, error? }

function getLogs() {
  return read('logs') || [];
}

function appendLog(entry) {
  const logs = getLogs();
  logs.unshift({ ...entry, timestamp: new Date().toISOString() });
  // Keep latest 500 entries
  write('logs', logs.slice(0, 500));
}

// ── Processed Event IDs (dedup) ──────────────────────────────────────────────
function getProcessedEvents() {
  return read('processed_events') || {};
}

function markEventProcessed(eventId) {
  const events = getProcessedEvents();
  events[eventId] = new Date().toISOString();
  write('processed_events', events);
}

function isEventProcessed(eventId) {
  const events = getProcessedEvents();
  return !!events[eventId];
}

// ── Journal Entries ──────────────────────────────────────────────────────────
function getJournal() {
  return read('journal') || [];
}

function saveJournal(entries) {
  write('journal', entries);
}

// ── Scope Delta ──────────────────────────────────────────────────────────────
function getScopeDelta() {
  return read('scope_delta') || getDefaultScopeDelta();
}

function saveScopeDelta(data) {
  write('scope_delta', data);
}

// ── Adaptability Index ───────────────────────────────────────────────────────
function getAdaptability() {
  return read('adaptability') || getDefaultAdaptability();
}

function saveAdaptability(data) {
  write('adaptability', data);
}

// ── Regression Checklist ─────────────────────────────────────────────────────
function getChecklist() {
  return read('checklist') || getDefaultChecklist();
}

function saveChecklist(items) {
  write('checklist', items);
}

// ── System Config (current phase) ────────────────────────────────────────────
function getConfig() {
  return read('config') || { phase: 'day3', pollingEnabled: true, webhookEnabled: false };
}

function saveConfig(cfg) {
  write('config', cfg);
}

// ── Default seed data ────────────────────────────────────────────────────────
function getDefaultScopeDelta() {
  return {
    originalScope: '',
    newScope: '',
    droppedItems: '',
    modifiedItems: '',
    addedItems: '',
    reprioritizedBacklog: '',
    technicalImpact: '',
    architecturalImpact: '',
    testingImpact: '',
    timeImpact: '',
    tradeoffs: '',
    regressionNotes: '',
    deprecatedItems: '',
    table: [
      { category: 'Polling', original: 'Poll every 5 min', afterPivot: 'Removed', impact: 'Major architectural change' },
      { category: 'Inventory updates', original: 'Scheduled pull', afterPivot: 'Webhook push', impact: 'New event-driven flow' },
      { category: 'Message Queue', original: 'Optional/learning', afterPivot: 'Core processing path', impact: 'Increased importance' },
      { category: 'Cache', original: 'Keep', afterPivot: 'Keep', impact: 'Minimal change' },
      { category: 'Query API', original: 'Keep', afterPivot: 'Keep', impact: 'Must remain compatible' },
    ]
  };
}

function getDefaultChecklist() {
  return [
    { id: 'wh1',  label: 'Webhook successfully receives inventory event', checked: false },
    { id: 'wh2',  label: 'Invalid webhook payload rejected (400 response)', checked: false },
    { id: 'wh3',  label: 'Duplicate event (same eventId) is ignored', checked: false },
    { id: 'wh4',  label: 'Valid event reaches message queue', checked: false },
    { id: 'wh5',  label: 'Worker processes event from queue', checked: false },
    { id: 'wh6',  label: 'Inventory cache updates correctly after event', checked: false },
    { id: 'wh7',  label: 'Query API returns updated inventory', checked: false },
    { id: 'wh8',  label: 'Out-of-stock product returns inStock: false', checked: false },
    { id: 'wh9',  label: 'Existing query functionality still works', checked: false },
    { id: 'wh10', label: 'Polling is no longer active', checked: false },
    { id: 'wh11', label: 'Deprecated polling code is clearly marked', checked: false },
    { id: 'wh12', label: 'Final architecture matches new specification', checked: false },
  ];
}

function getDefaultAdaptability() {
  return {
    composure: { score: null, comment: '' },
    communication: { score: null, comment: '' },
    flexibility: { score: null, comment: '' },
    contribution: { score: null, comment: '' },
    problemSolving: { score: null, comment: '' },
    reprioritize: { score: null, comment: '' },
    reliability: { score: null, comment: '' },
    helpfulness: { score: null, comment: '' },
    workAgain: { score: null, comment: '' },
    generalNotes: '',
  };
}

// ── Seed inventory ───────────────────────────────────────────────────────────
function seedIfEmpty() {
  const cache = getInventory();
  if (Object.keys(cache).length === 0) {
    const seed = [
      { productId: 'SKU-001', name: 'Wireless Bluetooth Headphones', stock: 24 },
      { productId: 'SKU-002', name: 'USB-C Charging Cable (2m)',      stock: 0  },
      { productId: 'SKU-003', name: 'Portable Power Bank 20000mAh',   stock: 17 },
      { productId: 'SKU-004', name: 'Laptop Stand — Aluminium',        stock: 8  },
      { productId: 'SKU-005', name: 'Mechanical Keyboard — TKL',       stock: 3  },
      { productId: 'SKU-006', name: 'Ergonomic Mouse — Wireless',      stock: 0  },
    ];
    seed.forEach(p => upsertProduct({ ...p, source: 'seed' }));
    appendLog({ id: 'boot', type: 'SYSTEM', payload: { msg: 'Inventory seeded with 6 products' }, status: 'ok' });
  }

  if (!read('config')) {
    saveConfig({ phase: 'day3', pollingEnabled: true, webhookEnabled: false });
  }
}

module.exports = {
  getInventory, setInventory, upsertProduct, getProduct,
  getLogs, appendLog,
  getProcessedEvents, markEventProcessed, isEventProcessed,
  getJournal, saveJournal,
  getScopeDelta, saveScopeDelta,
  getAdaptability, saveAdaptability,
  getChecklist, saveChecklist,
  getConfig, saveConfig,
  seedIfEmpty,
};
