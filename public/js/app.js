/**
 * app.js — Northstar Retail Co. Frontend
 * Communicates with the Express API backend.
 */

const API = '/api';
let currentPhase = 'day3';
let _adaptData = {};
let _journalEntries = [];
let _scopeDelta = {};
let _checklist = [];

// ══════════════════════════════════════════
// SIDEBAR / NAV
// ══════════════════════════════════════════
const PAGE_META = {
  dashboard:    { title: 'Dashboard',          sub: 'Sprint overview and system status' },
  inventory:    { title: 'Inventory',          sub: 'Cache, polling, and warehouse sync' },
  'api-tester': { title: 'API Tester',         sub: 'Test the Query API and webhook receiver' },
  queue:        { title: 'Message Queue',      sub: 'Queue dashboard and dead-letter queue' },
  architecture: { title: 'Architecture',       sub: 'Day 3 vs Day 5 comparison' },
  logs:         { title: 'System Logs',        sub: 'Real-time event stream' },
  journal:      { title: 'Learning Journal',   sub: 'Personal blocker and learning log' },
  pivot:        { title: 'Day 4 — Pivot',      sub: 'Mandatory architecture change' },
  'scope-delta':{ title: 'Scope Delta',        sub: 'What changed and why' },
  regression:   { title: 'Regression Tests',   sub: 'Post-pivot checklist' },
  adaptability: { title: 'Adaptability Index', sub: 'Assignment 3 — self-assessment' },
};

let sidebarCollapsed = false;

function showPage(id, navEl) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const page = document.getElementById('page-' + id);
  if (page) page.classList.add('active');

  if (navEl) {
    navEl.classList.add('active');
  } else {
    const el = document.querySelector(`.nav-item[data-page="${id}"]`);
    if (el) el.classList.add('active');
  }

  const meta = PAGE_META[id] || {};
  document.getElementById('headerTitle').textContent = meta.title || id;
  document.getElementById('headerSub').textContent   = meta.sub   || '';

  if (window.innerWidth <= 700) closeSidebar();

  // Lazy-load page data
  if (id === 'dashboard')    loadDashboard();
  if (id === 'inventory')    loadInventory();
  if (id === 'queue')        loadQueueStats();
  if (id === 'logs')         loadLogs();
  if (id === 'journal')      loadJournal();
  if (id === 'scope-delta')  loadScopeDelta();
  if (id === 'regression')   loadChecklist();
  if (id === 'adaptability') loadAdaptability();
  if (id === 'architecture') renderArchitecturePage();
  if (id === 'pivot')        renderPivotPage();
}

function toggleSidebar() {
  const sb = document.getElementById('sidebar');
  if (window.innerWidth <= 700) {
    sb.classList.toggle('mobile-open');
    document.getElementById('sidebarOverlay').classList.toggle('visible', sb.classList.contains('mobile-open'));
  } else {
    sidebarCollapsed = !sidebarCollapsed;
    sb.classList.toggle('collapsed', sidebarCollapsed);
  }
}

function closeSidebar() {
  document.getElementById('sidebar').classList.remove('mobile-open');
  document.getElementById('sidebarOverlay').classList.remove('visible');
}

// ══════════════════════════════════════════
// API HELPERS
// ══════════════════════════════════════════
async function api(method, path, body) {
  try {
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (body) opts.body = JSON.stringify(body);
    const res  = await fetch(path, opts);
    const data = await res.json();
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    return { ok: false, status: 0, data: { error: err.message } };
  }
}
const GET  = (path)       => api('GET',    path);
const POST = (path, body) => api('POST',   path, body);
const PUT  = (path, body) => api('PUT',    path, body);
const DEL  = (path)       => api('DELETE', path);

// ══════════════════════════════════════════
// PHASE MANAGEMENT
// ══════════════════════════════════════════
async function loadPhase() {
  const r = await GET(`${API}/system/config`);
  if (!r.ok) return;
  currentPhase = r.data.config.phase;
  updatePhaseUI();
}

function updatePhaseUI() {
  const isDay5 = currentPhase === 'day5';
  const banner = document.getElementById('phaseBanner');
  const label  = document.getElementById('phaseLabel');

  label.textContent = isDay5 ? 'DAY 5 — WEBHOOK SPEC' : 'DAY 3 — ORIGINAL SPEC';
  banner.className  = 'phase-banner' + (isDay5 ? ' day5' : '');

  const archBadge = document.getElementById('archBadge');
  if (archBadge) archBadge.textContent = isDay5 ? 'Day 5 — Webhook' : 'Day 3 — Polling';

  const pollingDepBadge = document.getElementById('pollingDeprecatedBadge');
  if (pollingDepBadge) pollingDepBadge.style.display = isDay5 ? '' : 'none';

  const pt3 = document.getElementById('ptDay3');
  const pt5 = document.getElementById('ptDay5');
  if (pt3) pt3.classList.toggle('active', !isDay5);
  if (pt5) pt5.classList.toggle('active', isDay5);

  // Disable polling buttons in Day 5
  const pollerBtns = ['btnStartPoller'];
  pollerBtns.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = isDay5;
  });

  renderQuickActions();
  renderMiniArch();
}

async function setPhase(phase) {
  const r = await POST(`${API}/system/config`, { phase });
  if (!r.ok) { toast('Failed to switch phase', 'error'); return; }
  currentPhase = phase;
  updatePhaseUI();
  toast(`Switched to ${phase === 'day5' ? 'Day 5 — Webhook Mode' : 'Day 3 — Polling Mode'}`);
  loadDashboard();
}

async function switchPhase() {
  await setPhase(currentPhase === 'day5' ? 'day3' : 'day5');
}

// ══════════════════════════════════════════
// DASHBOARD
// ══════════════════════════════════════════
async function loadDashboard() {
  const [sysR, invR, qR] = await Promise.all([
    GET(`${API}/system/status`),
    GET(`${API}/inventory`),
    GET(`${API}/queue/stats`),
  ]);

  if (sysR.ok) {
    const s = sysR.data;
    set('d_inventoryCount', s.inventoryCount ?? 0);
    set('d_queueDepth', s.queue?.queueDepth ?? 0);
    set('lastSyncDisplay', s.lastSyncAt ? timeSince(s.lastSyncAt) : '—');

    // Status dots
    dot('sdInventory', s.inventoryCount > 0 ? 'ok' : 'warn');
    dot('sdQueue', 'ok');

    const pollerOk = s.pollingRunning && currentPhase === 'day3';
    dot('sdPoller', pollerOk ? 'ok' : (currentPhase === 'day5' ? 'error' : 'warn'));
    const sdPollerLabel = document.getElementById('sdPollerLabel');
    if (sdPollerLabel) sdPollerLabel.textContent = currentPhase === 'day5' ? 'Poller Disabled' : (s.pollingRunning ? 'Poller Active' : 'Poller Stopped');

    dot('sdWebhook', currentPhase === 'day5' ? 'ok' : 'warn');
    const sdWebhookLabel = document.getElementById('sdWebhookLabel');
    if (sdWebhookLabel) sdWebhookLabel.textContent = currentPhase === 'day5' ? 'Webhooks Active' : 'Webhooks Ready';
  }

  if (qR.ok) {
    set('d_processed', qR.data.stats?.processed ?? 0);
    set('d_failed', qR.data.stats?.dlq ?? 0);
  }

  if (invR.ok) {
    const tbody = document.getElementById('d_inventoryTable');
    if (tbody) {
      tbody.innerHTML = invR.data.products.map(p => `
        <tr>
          <td class="td-mono">${p.productId}</td>
          <td>${p.name}</td>
          <td class="td-mono">${p.quantity ?? p.stock}</td>
          <td><span class="stock-badge ${p.inStock ? 'stock-in' : 'stock-out'}">${p.inStock ? '✓ In Stock' : '✗ Out of Stock'}</span></td>
          <td class="td-mono" style="font-size:10px;color:var(--text-3)">${p.lastSyncedAt ? fmt(p.lastSyncedAt) : '—'}</td>
          <td><span class="src-badge">${p.source || '—'}</span></td>
        </tr>`).join('') || '<tr><td colspan="6" class="td-empty">No products</td></tr>';
    }
  }

  renderMiniArch();
  renderQuickActions();
}

function renderMiniArch() {
  const el = document.getElementById('archMini');
  if (!el) return;
  if (currentPhase === 'day5') {
    el.innerHTML = buildArch([
      { icon: 'fa-industry', label: 'Warehouse', sub: 'Stock source' },
      { icon: 'fa-webhook', label: 'Webhook', sub: 'POST /webhooks/inventory', cls: 'new' },
      { icon: 'fa-layer-group', label: 'Message Queue', sub: 'FIFO processing', cls: 'primary' },
      { icon: 'fa-database', label: 'Inventory Cache', sub: 'JSON store' },
      { icon: 'fa-circle-nodes', label: 'Query API', sub: 'GET /api/inventory/:id' },
    ]);
  } else {
    el.innerHTML = buildArch([
      { icon: 'fa-industry', label: 'Warehouse API', sub: 'Stock source' },
      { icon: 'fa-clock-rotate-left', label: 'Poller', sub: 'Every 5 minutes', cls: 'primary' },
      { icon: 'fa-database', label: 'Inventory Cache', sub: 'JSON store' },
      { icon: 'fa-circle-nodes', label: 'Query API', sub: 'GET /api/inventory/:id' },
    ]);
  }
}

function renderQuickActions() {
  const el = document.getElementById('quickActions');
  if (!el) return;
  const isDay5 = currentPhase === 'day5';
  el.innerHTML = `
    <div class="quick-action-btn ${isDay5 ? 'disabled' : ''}" onclick="${isDay5 ? '' : 'pollOnce()'}">
      <i class="fa-solid fa-rotate"></i>
      <span>${isDay5 ? 'Polling disabled (Day 5 mode)' : 'Run one poll cycle now'}</span>
    </div>
    <div class="quick-action-btn" onclick="showPage('api-tester',null)">
      <i class="fa-solid fa-terminal"></i>
      <span>Open API Tester — query inventory</span>
    </div>
    <div class="quick-action-btn" onclick="showPage('pivot',null)">
      <i class="fa-solid fa-rotate"></i>
      <span>View Day 4 pivot details</span>
    </div>
    <div class="quick-action-btn" onclick="showPage('regression',null)">
      <i class="fa-solid fa-list-check"></i>
      <span>Run regression checklist</span>
    </div>`;
}

// ══════════════════════════════════════════
// INVENTORY
// ══════════════════════════════════════════
async function loadInventory() {
  const r = await GET(`${API}/inventory`);
  const tbody = document.getElementById('inventoryTable');
  if (!tbody) return;
  if (!r.ok) { tbody.innerHTML = '<tr><td colspan="6" class="td-empty">Failed to load</td></tr>'; return; }

  tbody.innerHTML = r.data.products.map(p => `
    <tr>
      <td class="td-mono">${p.productId}</td>
      <td>${p.name}</td>
      <td class="td-mono" style="font-weight:600">${p.quantity ?? p.stock}</td>
      <td><span class="stock-badge ${p.inStock ? 'stock-in' : 'stock-out'}">${p.inStock ? '✓ In Stock' : '✗ Out of Stock'}</span></td>
      <td class="td-mono" style="font-size:10px;color:var(--text-3)">${p.lastSyncedAt ? fmt(p.lastSyncedAt) : '—'}</td>
      <td><span class="src-badge">${p.source || '—'}</span></td>
    </tr>`).join('') || '<tr><td colspan="6" class="td-empty">No products</td></tr>';

  // Poller status
  const pr = await GET(`${API}/polling/status`);
  if (pr.ok) {
    const pill = document.getElementById('pollerStatusPill');
    if (pill) {
      pill.textContent  = pr.data.running ? 'Running' : (pr.data.enabled ? 'Stopped' : 'Disabled');
      pill.className    = 'status-pill' + (pr.data.running ? ' running' : (!pr.data.enabled ? ' error' : ''));
    }
  }
}

async function startPoller() {
  const r = await POST(`${API}/polling/start`, { demoMode: true });
  if (r.ok) { toast('Poller started — demo mode (30s interval)'); loadInventory(); }
  else toast(r.data.error || 'Failed to start poller', 'error');
}

async function stopPoller() {
  await POST(`${API}/polling/stop`);
  toast('Poller stopped'); loadInventory();
}

async function pollOnce() {
  const r = await POST(`${API}/polling/run-once`);
  if (r.ok) { toast(`Poll complete — ${r.data.updated ?? 0} products updated`); loadInventory(); loadDashboard(); }
  else toast(r.data.error || 'Poll failed', 'error');
}

async function simulatePollFail() {
  await POST(`${API}/polling/simulate-fail`);
  toast('Next poll will fail — run a poll to see error handling', 'warn');
}

async function sendWebhook() {
  const productId = document.getElementById('wh_productId').value;
  const stock     = parseInt(document.getElementById('wh_stock').value);
  const r = await POST(`${API}/warehouse/send-webhook`, { productId, stock });
  const box = document.getElementById('wh_result');
  box.style.display = 'block';
  if (r.ok) {
    box.className = 'result-box ok gap-sm';
    box.textContent = `Webhook sent ✓\nEvent ID: ${r.data.eventId}\nMessage ID: ${r.data.messageId}`;
    toast(`Webhook sent for ${productId} → ${stock} units`);
    setTimeout(loadInventory, 800);
  } else {
    box.className = 'result-box error gap-sm';
    box.textContent = JSON.stringify(r.data, null, 2);
  }
}

async function sendPollUpdate() {
  const productId = document.getElementById('wh_productId').value;
  const stock     = parseInt(document.getElementById('wh_stock').value);
  await POST(`${API}/warehouse/update`, { productId, stock });
  const r2 = await POST(`${API}/polling/run-once`);
  if (r2.ok) { toast(`Poll triggered — ${productId} updated`); loadInventory(); }
  else toast(r2.data.error || 'Poll failed', 'error');
}

// ══════════════════════════════════════════
// API TESTER
// ══════════════════════════════════════════
async function queryInventory() {
  const id = document.getElementById('api_productId').value.trim();
  if (!id) return;
  const r = await GET(`${API}/inventory/${id}`);
  const box = document.getElementById('api_result');
  box.style.display = 'block';
  box.className = r.ok ? 'result-box ok gap-sm' : 'result-box error gap-sm';
  box.textContent = JSON.stringify(r.data, null, 2);
}

function setAndQuery(id) {
  document.getElementById('api_productId').value = id;
  queryInventory();
}

async function sendRawWebhook() {
  let payload;
  try { payload = JSON.parse(document.getElementById('webhook_payload').value); }
  catch { toast('Invalid JSON payload', 'error'); return; }
  const r = await POST('/webhooks/inventory', payload);
  const box = document.getElementById('webhook_result');
  box.style.display = 'block';
  box.className = r.ok ? 'result-box ok gap-sm' : 'result-box error gap-sm';
  box.textContent = JSON.stringify(r.data, null, 2);
}

async function sendBadWebhook() {
  document.getElementById('webhook_payload').value = JSON.stringify({ eventId: 'bad-001', note: 'missing required fields' }, null, 2);
  await sendRawWebhook();
}

function genEventId() {
  try {
    const payload = JSON.parse(document.getElementById('webhook_payload').value);
    payload.eventId = 'evt-' + Date.now();
    document.getElementById('webhook_payload').value = JSON.stringify(payload, null, 2);
  } catch {}
}

// ══════════════════════════════════════════
// QUEUE
// ══════════════════════════════════════════
async function loadQueueStats() {
  const [sR, cR, dR] = await Promise.all([
    GET(`${API}/queue/stats`),
    GET(`${API}/queue/contents`),
    GET(`${API}/queue/dlq`),
  ]);

  if (sR.ok) {
    const s = sR.data.stats;
    set('q_enqueued', s.enqueued ?? 0);
    set('q_processed', s.processed ?? 0);
    set('q_retried', s.retried ?? 0);
    set('q_dlq', s.dlq ?? 0);
  }

  if (cR.ok) {
    const el = document.getElementById('queueContents');
    if (!el) return;
    const msgs = cR.data.queue;
    if (!msgs.length) { el.innerHTML = '<div class="queue-empty-msg">Queue is empty</div>'; }
    else {
      el.innerHTML = msgs.map((m, i) => `
        <div class="queue-msg-card ${i === 0 ? 'front' : ''}">
          <div>
            <div class="queue-msg-id">${m.id}</div>
            <div class="queue-msg-type">${m.type}</div>
          </div>
          <div class="queue-msg-pos">${i === 0 ? 'FRONT' : '#' + (i+1)}</div>
        </div>`).join('');
    }
  }

  if (dR.ok) {
    const el = document.getElementById('dlqContents');
    if (!el) return;
    const dlq = dR.data.dlq;
    if (!dlq.length) { el.innerHTML = '<div class="queue-empty-msg" style="padding:20px 0">Dead-letter queue is empty</div>'; }
    else {
      el.innerHTML = dlq.map(m => `
        <div class="queue-msg-card" style="background:var(--red-light);border-color:#f0b8b3;margin-bottom:8px">
          <div>
            <div class="queue-msg-id" style="color:var(--red)">${m.id}</div>
            <div class="queue-msg-type">${m.errorMessage}</div>
          </div>
          <span style="font-size:10px;color:var(--text-3)">${m.retries} retries</span>
        </div>`).join('');
    }
  }
}

async function clearDLQ() {
  await POST(`${API}/queue/dlq/clear`);
  toast('Dead-letter queue cleared'); loadQueueStats();
}

// ══════════════════════════════════════════
// LOGS
// ══════════════════════════════════════════
async function loadLogs() {
  const type = document.getElementById('logTypeFilter')?.value || '';
  const url  = `${API}/system/logs?limit=120${type ? '&type=' + type : ''}`;
  const r    = await GET(url);
  const el   = document.getElementById('logStream');
  if (!el) return;
  if (!r.ok || !r.data.logs.length) { el.innerHTML = '<div class="queue-empty-msg" style="padding:20px">No logs yet</div>'; return; }

  el.innerHTML = r.data.logs.map(l => {
    const cls = l.status === 'error' ? 'error' : l.status === 'warn' ? 'warn' : 'ok';
    return `<div class="log-entry">
      <span class="log-ts">${l.timestamp ? fmt(l.timestamp) : '—'}</span>
      <span class="log-type ${cls}">${l.type}</span>
      <span class="log-body">${JSON.stringify(l.payload ?? {})}</span>
    </div>`;
  }).join('');
}

// ══════════════════════════════════════════
// ARCHITECTURE PAGE
// ══════════════════════════════════════════
function renderArchitecturePage() {
  const d3 = document.getElementById('archDay3');
  const d5 = document.getElementById('archDay5');

  if (d3) d3.innerHTML = buildArch([
    { icon: 'fa-industry', label: 'Warehouse API', sub: 'External stock source' },
    { icon: 'fa-clock-rotate-left', label: 'Poller', sub: 'Every 5 minutes', cls: 'primary', arrow: '5-min interval' },
    { icon: 'fa-database', label: 'Inventory Cache', sub: 'JSON store' },
    { icon: 'fa-circle-nodes', label: 'Query API', sub: 'GET /api/inventory/:id' },
    { icon: 'fa-headset', label: 'Support Tool', sub: '"Is this in stock?"' },
  ]);

  if (d5) d5.innerHTML = buildArch([
    { icon: 'fa-industry', label: 'Warehouse', sub: 'Stock source' },
    { icon: 'fa-webhook', label: 'Webhook Event', sub: 'POST /webhooks/inventory', cls: 'new', arrow: 'push event' },
    { icon: 'fa-shield-halved', label: 'Webhook Receiver', sub: 'Validate + deduplicate' },
    { icon: 'fa-layer-group', label: 'Message Queue', sub: 'FIFO processing', cls: 'primary', arrow: 'publish' },
    { icon: 'fa-gears', label: 'Inventory Worker', sub: 'Consumes queue' },
    { icon: 'fa-database', label: 'Inventory Cache', sub: 'JSON store' },
    { icon: 'fa-circle-nodes', label: 'Query API', sub: 'GET /api/inventory/:id' },
    { icon: 'fa-headset', label: 'Support Tool', sub: '"Is this in stock?"' },
  ]);
}

// ══════════════════════════════════════════
// PIVOT PAGE
// ══════════════════════════════════════════
function renderPivotPage() {
  const old = document.getElementById('pivotOldArch');
  const nw  = document.getElementById('pivotNewArch');

  if (old) old.innerHTML = buildArch([
    { icon: 'fa-industry', label: 'Warehouse API', sub: '' },
    { icon: 'fa-clock-rotate-left', label: '5-min Polling', sub: 'KILLED', cls: 'deprecated' },
    { icon: 'fa-database', label: 'Inventory Cache', sub: '' },
    { icon: 'fa-circle-nodes', label: 'Query API', sub: '' },
  ]);

  if (nw) nw.innerHTML = buildArch([
    { icon: 'fa-industry', label: 'Warehouse', sub: '' },
    { icon: 'fa-webhook', label: 'Webhook', sub: 'push event', cls: 'new' },
    { icon: 'fa-layer-group', label: 'Message Queue', sub: 'FIFO', cls: 'primary' },
    { icon: 'fa-database', label: 'Inventory Cache', sub: '' },
    { icon: 'fa-circle-nodes', label: 'Query API', sub: '' },
  ]);

  // Highlight active phase toggle
  const pt3 = document.getElementById('ptDay3');
  const pt5 = document.getElementById('ptDay5');
  if (pt3) pt3.classList.toggle('active', currentPhase !== 'day5');
  if (pt5) pt5.classList.toggle('active', currentPhase === 'day5');
}

function buildArch(nodes) {
  return nodes.map((n, i) => `
    <div class="arch-node ${n.cls || ''}">
      <i class="fa-solid ${n.icon}"></i>
      <div class="arch-node-label">${n.label}</div>
      ${n.sub ? `<div class="arch-node-sub">${n.sub}</div>` : ''}
    </div>
    ${i < nodes.length - 1 ? `
      <div class="arch-arrow ${n.cls === 'deprecated' ? 'deprecated' : ''}">
        <i class="fa-solid fa-chevron-down"></i>
      </div>
      ${n.arrow ? `<div class="arch-label">${n.arrow}</div>` : ''}
    ` : ''}
  `).join('');
}

// ══════════════════════════════════════════
// LEARNING JOURNAL
// ══════════════════════════════════════════
async function loadJournal() {
  const r = await GET(`${API}/journal`);
  if (!r.ok) return;
  _journalEntries = r.data.entries;
  renderJournal();
}

function renderJournal() {
  const el = document.getElementById('journalList');
  if (!el) return;
  if (!_journalEntries.length) {
    el.innerHTML = '<div style="color:var(--text-3);font-size:13px;font-style:italic">No journal entries yet. Click "New Journal Entry" to record your first learning experience.</div>';
    return;
  }
  el.innerHTML = _journalEntries.map(e => `
    <div class="journal-card">
      <div class="journal-card-header">
        <div style="display:flex;align-items:center;gap:10px">
          <i class="fa-solid fa-book-open" style="color:var(--accent)"></i>
          <span class="journal-date">${e.datetime ? new Date(e.datetime).toLocaleString() : 'No date'}</span>
          <span class="journal-status js-${(e.status||'learning').replace(/\s/g,'-')}">${e.status || 'learning'}</span>
        </div>
        <div class="btn-group">
          <button class="btn btn-ghost btn-sm" onclick="editJournalEntry('${e.id}')"><i class="fa-solid fa-pen"></i></button>
          <button class="btn btn-ghost btn-sm" style="color:var(--red)" onclick="deleteJournalEntry('${e.id}')"><i class="fa-solid fa-trash"></i></button>
        </div>
      </div>
      <div class="journal-grid">
        ${jf('What I Attempted', e.attempted)}
        ${jf('What I Was Trying to Understand', e.trying)}
        ${jf('Error / Blocker', e.error)}
        ${jf('What I Tried', e.tried)}
        ${jf('What Failed', e.failed)}
        ${jf('What I Learned', e.learned)}
        ${jf('How I Fixed It', e.fixed)}
      </div>
      <div class="journal-time-row">
        <span>Planned: <strong>${e.timePlanned ?? '—'} hrs</strong></span>
        <span>Actual: <strong>${e.timeActual ?? '—'} hrs</strong></span>
      </div>
    </div>`).join('');
}

function jf(label, val) {
  if (!val) return '';
  return `<div class="journal-field">
    <div class="journal-field-label">${label}</div>
    <div class="journal-field-value">${escHtml(val)}</div>
  </div>`;
}

function newJournalEntry() {
  document.getElementById('journalEditorTitle').textContent = 'New Journal Entry';
  document.getElementById('je_id').value = '';
  ['je_attempted','je_trying','je_error','je_tried','je_failed','je_learned','je_fixed'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  document.getElementById('je_datetime').value = new Date().toISOString().slice(0,16);
  document.getElementById('je_status').value = 'in-progress';
  document.getElementById('je_timePlanned').value = '';
  document.getElementById('je_timeActual').value = '';
  document.getElementById('journalEditor').style.display = 'flex';
}

function editJournalEntry(id) {
  const e = _journalEntries.find(x => x.id === id);
  if (!e) return;
  document.getElementById('journalEditorTitle').textContent = 'Edit Journal Entry';
  document.getElementById('je_id').value = e.id;
  document.getElementById('je_datetime').value = e.datetime || '';
  document.getElementById('je_status').value = e.status || 'in-progress';
  document.getElementById('je_timePlanned').value = e.timePlanned || '';
  document.getElementById('je_timeActual').value = e.timeActual || '';
  ['attempted','trying','error','tried','failed','learned','fixed'].forEach(f => {
    const el = document.getElementById('je_' + f); if (el) el.value = e[f] || '';
  });
  document.getElementById('journalEditor').style.display = 'flex';
}

function closeJournalEditor() {
  document.getElementById('journalEditor').style.display = 'none';
}

async function saveJournalEntry() {
  const id   = document.getElementById('je_id').value;
  const body = {
    datetime:    document.getElementById('je_datetime').value,
    status:      document.getElementById('je_status').value,
    timePlanned: document.getElementById('je_timePlanned').value,
    timeActual:  document.getElementById('je_timeActual').value,
    attempted:   document.getElementById('je_attempted').value,
    trying:      document.getElementById('je_trying').value,
    error:       document.getElementById('je_error').value,
    tried:       document.getElementById('je_tried').value,
    failed:      document.getElementById('je_failed').value,
    learned:     document.getElementById('je_learned').value,
    fixed:       document.getElementById('je_fixed').value,
  };
  const r = id ? await api('PUT', `${API}/journal/${id}`, body) : await POST(`${API}/journal`, body);
  if (r.ok) { toast('Journal entry saved'); closeJournalEditor(); loadJournal(); }
  else toast('Save failed', 'error');
}

async function deleteJournalEntry(id) {
  if (!confirm('Delete this journal entry?')) return;
  await DEL(`${API}/journal/${id}`);
  toast('Entry deleted'); loadJournal();
}

// ══════════════════════════════════════════
// SCOPE DELTA
// ══════════════════════════════════════════
async function loadScopeDelta() {
  const r = await GET(`${API}/scope-delta`);
  if (!r.ok) return;
  _scopeDelta = r.data.data;

  const textFields = ['originalScope','newScope','droppedItems','addedItems','technicalImpact','architecturalImpact','timeImpact','tradeoffs','deprecatedItems','regressionNotes'];
  textFields.forEach(f => {
    const el = document.getElementById('sd_' + f);
    if (el) el.value = _scopeDelta[f] || '';
  });

  renderScopeTable();
}

function renderScopeTable() {
  const el = document.getElementById('scopeTable');
  if (!el) return;
  const rows = _scopeDelta.table || [];
  el.innerHTML = rows.map((row, i) => `
    <div class="scope-row-editable">
      <input value="${escHtml(row.category || '')}"   onchange="updateScopeRow(${i},'category',this.value)"   placeholder="Category"/>
      <input value="${escHtml(row.original || '')}"   onchange="updateScopeRow(${i},'original',this.value)"   placeholder="Original"/>
      <input value="${escHtml(row.afterPivot || '')}" onchange="updateScopeRow(${i},'afterPivot',this.value)" placeholder="After Pivot"/>
      <input value="${escHtml(row.impact || '')}"     onchange="updateScopeRow(${i},'impact',this.value)"     placeholder="Impact"/>
      <button class="del-btn" onclick="deleteScopeRow(${i})"><i class="fa-solid fa-xmark"></i></button>
    </div>`).join('');
}

function updateScopeRow(i, field, val) {
  if (!_scopeDelta.table) _scopeDelta.table = [];
  if (!_scopeDelta.table[i]) _scopeDelta.table[i] = {};
  _scopeDelta.table[i][field] = val;
}

function addScopeRow() {
  if (!_scopeDelta.table) _scopeDelta.table = [];
  _scopeDelta.table.push({ category: '', original: '', afterPivot: '', impact: '' });
  renderScopeTable();
}

function deleteScopeRow(i) {
  _scopeDelta.table.splice(i, 1); renderScopeTable();
}

async function saveScopeDelta() {
  const textFields = ['originalScope','newScope','droppedItems','addedItems','technicalImpact','architecturalImpact','timeImpact','tradeoffs','deprecatedItems','regressionNotes'];
  textFields.forEach(f => { _scopeDelta[f] = document.getElementById('sd_' + f)?.value || ''; });
  const r = await PUT(`${API}/scope-delta`, _scopeDelta);
  if (r.ok) toast('Scope Delta saved');
  else toast('Save failed', 'error');
}

// ══════════════════════════════════════════
// REGRESSION CHECKLIST
// ══════════════════════════════════════════
async function loadChecklist() {
  const r = await GET(`${API}/checklist`);
  if (!r.ok) return;
  _checklist = r.data.items;
  renderChecklist();
}

function renderChecklist() {
  const el = document.getElementById('checklistItems');
  if (!el) return;
  el.innerHTML = _checklist.map((item, i) => `
    <div class="checklist-item ${item.checked ? 'checked' : ''}">
      <input type="checkbox" ${item.checked ? 'checked' : ''} onchange="toggleCheck(${i}, this.checked)"/>
      <span>${item.label}</span>
    </div>`).join('');
  updateChecklistProgress();
}

function toggleCheck(i, val) {
  _checklist[i].checked = val;
  renderChecklist();
}

function checkAll()   { _checklist.forEach(i => i.checked = true);  renderChecklist(); }
function uncheckAll() { _checklist.forEach(i => i.checked = false); renderChecklist(); }

function updateChecklistProgress() {
  const done  = _checklist.filter(i => i.checked).length;
  const total = _checklist.length;
  const el    = document.getElementById('checklistProgress');
  if (el) el.textContent = `${done} / ${total} checks passed`;
}

async function saveChecklist() {
  const r = await PUT(`${API}/checklist`, { items: _checklist });
  if (r.ok) toast('Checklist saved');
  else toast('Save failed', 'error');
}

// ══════════════════════════════════════════
// ADAPTABILITY INDEX
// ══════════════════════════════════════════
const ADAPT_FIELDS = [
  { key: 'composure',      label: 'Composure During Pivot',         desc: 'How well did you maintain calm when the client cancelled polling?' },
  { key: 'communication',  label: 'Communication',                  desc: 'Did you clearly communicate blockers, progress, and the pivot plan?' },
  { key: 'flexibility',    label: 'Flexibility',                    desc: 'How quickly did you adapt to the new webhook architecture?' },
  { key: 'contribution',   label: 'Contribution',                   desc: 'How much did you contribute to the overall sprint deliverable?' },
  { key: 'problemSolving', label: 'Problem Solving',                desc: 'How effectively did you work through technical challenges?' },
  { key: 'reprioritize',   label: 'Ability to Reprioritise',        desc: 'Did you adjust your backlog and focus appropriately after the pivot?' },
  { key: 'reliability',    label: 'Reliability',                    desc: 'Did teammates know they could count on you to deliver?' },
  { key: 'helpfulness',    label: 'Willingness to Help Teammates',  desc: 'Did you support others when they were blocked?' },
  { key: 'workAgain',      label: 'Would Teammates Work With You Again?', desc: 'Overall — did you leave a positive impression on the team?' },
];

async function loadAdaptability() {
  const r = await GET(`${API}/adaptability`);
  if (!r.ok) return;
  _adaptData = r.data.data;
  renderAdaptability();
}

function renderAdaptability() {
  const el = document.getElementById('adaptabilityFields');
  if (!el) return;
  el.innerHTML = ADAPT_FIELDS.map(f => {
    const current = _adaptData[f.key] || {};
    const score   = current.score;
    const comment = current.comment || '';
    const scores  = [1,2,3,4,5].map(n => `
      <button class="score-btn ${score === n ? 'selected' : ''}" onclick="setAdaptScore('${f.key}', ${n})">${n}</button>`).join('');
    return `<div class="adapt-field">
      <div class="adapt-label">${f.label}</div>
      <div class="adapt-desc">${f.desc}</div>
      <div class="adapt-score-row">
        <span style="font-size:11px;color:var(--text-3);margin-right:4px">1 (low)</span>
        ${scores}
        <span style="font-size:11px;color:var(--text-3);margin-left:4px">5 (high)</span>
      </div>
      <input class="adapt-comment" type="text" placeholder="Optional comment…" value="${escHtml(comment)}"
        oninput="setAdaptComment('${f.key}', this.value)"/>
    </div>`;
  }).join('');

  const gn = document.getElementById('adapt_generalNotes');
  if (gn) gn.value = _adaptData.generalNotes || '';
}

function setAdaptScore(key, val) {
  if (!_adaptData[key]) _adaptData[key] = {};
  _adaptData[key].score = val;
  renderAdaptability();
}

function setAdaptComment(key, val) {
  if (!_adaptData[key]) _adaptData[key] = {};
  _adaptData[key].comment = val;
}

async function saveAdaptability() {
  _adaptData.generalNotes = document.getElementById('adapt_generalNotes')?.value || '';
  const r = await PUT(`${API}/adaptability`, _adaptData);
  if (r.ok) toast('Adaptability Index saved');
  else toast('Save failed', 'error');
}

// ══════════════════════════════════════════
// UTILITIES
// ══════════════════════════════════════════
function set(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }

function dot(id, status) {
  const el = document.getElementById(id);
  if (!el) return;
  el.className = 'fa-solid fa-circle status-dot ' + status;
}

function fmt(iso) {
  try { return new Date(iso).toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit', second:'2-digit', day:'2-digit', month:'short' }); }
  catch { return iso; }
}

function timeSince(iso) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60)   return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s/60)}m ago`;
  return `${Math.floor(s/3600)}h ago`;
}

function escHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function toast(msg, type = 'info') {
  const icons = { info:'fa-circle-info', error:'fa-circle-xmark', warn:'fa-triangle-exclamation' };
  const colors = { info:'#1c1a17', error:'#c0392b', warn:'#b5690a' };
  const t = document.createElement('div');
  t.className = 'toast';
  t.style.background = colors[type] || colors.info;
  t.innerHTML = `<i class="fa-solid ${icons[type]||icons.info}"></i> ${msg}`;
  document.getElementById('toastContainer').appendChild(t);
  setTimeout(() => { t.style.opacity='0'; t.style.transition='opacity 0.3s'; setTimeout(()=>t.remove(),300); }, 3000);
}

// ══════════════════════════════════════════
// INIT
// ══════════════════════════════════════════
(async () => {
  await loadPhase();
  loadDashboard();
  // Auto-refresh dashboard every 15s
  setInterval(loadDashboard, 15000);
})();
