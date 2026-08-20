/**
 * queue.js — Message Queue Abstraction
 *
 * This module provides a clean interface over an in-memory queue.
 * In production, swap the implementation for RabbitMQ, Redis Streams, or AWS SQS
 * by replacing the functions below — the interface stays identical.
 *
 * Interface:
 *   publish(message)          → adds to queue
 *   consume(handler)          → registers a worker handler
 *   retry(message)            → re-queues a failed message
 *   deadLetter(message, err)  → moves to dead-letter queue
 *   getStats()                → returns queue metrics
 *   getDeadLetters()          → returns DLQ contents
 *   clearDeadLetters()        → empties DLQ
 *   getQueueContents()        → inspect queue (not available in real brokers)
 *
 * NOTE: This is an IN-MEMORY prototype.
 * It does NOT survive server restarts.
 * It does NOT scale horizontally.
 * It does NOT provide message durability guarantees.
 * Use this only for learning/demonstration purposes.
 */

const db = require('./db');

// ── In-memory state ──────────────────────────────────────────────────────────
const _queue     = [];  // FIFO — main queue
const _dlq       = [];  // Dead-letter queue
const _handlers  = [];  // Registered worker handlers

let stats = {
  enqueued:   0,
  processed:  0,
  failed:     0,
  retried:    0,
  dlq:        0,
};

let _workerRunning = false;

// ── Core API ─────────────────────────────────────────────────────────────────

/**
 * publish(message)
 * Adds a message to the BACK of the queue (FIFO).
 *
 * @param {Object} message - { id, type, payload, retries?, maxRetries? }
 */
function publish(message) {
  const msg = {
    id:         message.id || require('uuid').v4(),
    type:       message.type,
    payload:    message.payload,
    retries:    message.retries    || 0,
    maxRetries: message.maxRetries || 3,
    enqueuedAt: new Date().toISOString(),
    status:     'pending',
  };

  _queue.push(msg);  // BACK of queue
  stats.enqueued++;

  db.appendLog({
    id:      msg.id,
    type:    `QUEUE_ENQUEUE`,
    payload: { messageType: msg.type, queueDepth: _queue.length },
    status:  'ok',
  });

  // Trigger worker on next tick
  setImmediate(() => _runWorker());

  return msg;
}

/**
 * consume(handler)
 * Registers a worker function to process messages.
 * Handler signature: async (message) => void
 * Handler must throw to signal failure.
 */
function consume(handler) {
  _handlers.push(handler);
}

/**
 * retry(message)
 * Re-queues a failed message. Increments retry counter.
 */
function retry(message) {
  if (message.retries >= message.maxRetries) {
    deadLetter(message, new Error(`Max retries (${message.maxRetries}) exceeded`));
    return;
  }

  const retried = {
    ...message,
    retries:    message.retries + 1,
    status:     'pending',
    retriedAt:  new Date().toISOString(),
  };

  _queue.push(retried);
  stats.retried++;

  db.appendLog({
    id:      retried.id,
    type:    'QUEUE_RETRY',
    payload: { attempt: retried.retries, maxRetries: retried.maxRetries },
    status:  'warn',
  });
}

/**
 * deadLetter(message, error)
 * Moves a permanently failed message to the Dead-Letter Queue.
 */
function deadLetter(message, error) {
  const dlqMsg = {
    ...message,
    status:       'dead',
    deadAt:       new Date().toISOString(),
    errorMessage: error?.message || 'Unknown error',
  };

  _dlq.push(dlqMsg);
  stats.failed++;
  stats.dlq++;

  db.appendLog({
    id:      dlqMsg.id,
    type:    'QUEUE_DEAD_LETTER',
    payload: { error: dlqMsg.errorMessage, retriesExhausted: dlqMsg.retries },
    status:  'error',
  });
}

// ── Internal Worker ───────────────────────────────────────────────────────────

async function _runWorker() {
  if (_workerRunning || _queue.length === 0 || _handlers.length === 0) return;
  _workerRunning = true;

  while (_queue.length > 0) {
    const message = _queue.shift();  // FRONT of queue (FIFO)
    message.status = 'processing';

    db.appendLog({
      id:      message.id,
      type:    'QUEUE_DEQUEUE',
      payload: { messageType: message.type, retry: message.retries },
      status:  'ok',
    });

    try {
      for (const handler of _handlers) {
        await handler(message);
      }
      message.status = 'processed';
      stats.processed++;

      db.appendLog({
        id:      message.id,
        type:    'QUEUE_PROCESSED',
        payload: { messageType: message.type },
        status:  'ok',
      });

    } catch (err) {
      message.status = 'failed';
      stats.failed++;

      db.appendLog({
        id:      message.id,
        type:    'QUEUE_FAIL',
        payload: { error: err.message, retries: message.retries },
        status:  'error',
      });

      retry(message);
    }

    // Small yield between messages
    await new Promise(r => setTimeout(r, 50));
  }

  _workerRunning = false;
}

// ── Accessors ─────────────────────────────────────────────────────────────────

function getStats() {
  return {
    ...stats,
    queueDepth: _queue.length,
    dlqDepth:   _dlq.length,
  };
}

function getQueueContents() {
  return [..._queue];
}

function getDeadLetters() {
  return [..._dlq];
}

function clearDeadLetters() {
  const count = _dlq.length;
  _dlq.length = 0;
  stats.dlq = 0;
  return count;
}

function resetStats() {
  stats = { enqueued: 0, processed: 0, failed: 0, retried: 0, dlq: 0 };
}

module.exports = {
  publish,
  consume,
  retry,
  deadLetter,
  getStats,
  getQueueContents,
  getDeadLetters,
  clearDeadLetters,
  resetStats,
};
