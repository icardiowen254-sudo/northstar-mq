# Northstar Retail Co. — Inventory Sync Service
## 5-Day Assessed Sprint MVP

A full-stack engineering prototype demonstrating the complete sprint story:
learning message queues → building a polling architecture → surviving a mandatory pivot to webhooks.

---

## Quick Start

```bash
npm install
npm start
# Open http://localhost:3000
```

---

## Project Structure

```
northstar/
├── server/
│   ├── index.js       # Express entry point + queue worker
│   ├── routes.js      # All API endpoints
│   ├── db.js          # JSON file persistence layer
│   ├── queue.js       # Message queue abstraction (swap for RabbitMQ/SQS)
│   ├── warehouse.js   # Simulated warehouse API
│   └── poller.js      # Polling service (DEPRECATED — Day 5)
├── public/
│   ├── index.html     # SPA shell with sidebar navigation
│   ├── css/main.css   # Stylesheet
│   └── js/app.js      # Frontend logic
├── data/              # JSON persistence (auto-created)
└── README.md
```

---

## Sprint Story

| Day | What Happened |
|-----|--------------|
| 1–2 | Learned message queues independently. Built mini-prototype. |
| 3   | Built original polling architecture: Warehouse → Poll → Cache → Query API |
| 4   | **PIVOT**: Client killed polling in 48 hours. Switched to webhooks. |
| 5   | Refactored: polling deprecated, webhook is now core path. |

---

## API Reference

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/inventory` | All products |
| GET | `/api/inventory/:productId` | Query API (used by Support Tool) |
| POST | `/webhooks/inventory` | Receive webhook event (Day 4/5) |
| POST | `/api/polling/start` | Start poller (Day 3 only) |
| POST | `/api/polling/run-once` | Single poll cycle |
| GET | `/api/queue/stats` | Queue metrics |
| GET | `/api/system/status` | Full system status |
| POST | `/api/system/config` | Switch phase (day3 / day5) |
| GET | `/api/system/logs` | Activity log |

---

## Webhook Payload

```json
POST /webhooks/inventory
{
  "eventId":   "evt-001",
  "productId": "SKU-001",
  "stock":     18,
  "timestamp": "2026-08-19T10:00:00Z"
}
```

- **Validation**: missing fields → 400
- **Deduplication**: same `eventId` → 200 (ignored, logged)
- **Processing**: valid event → queued → worker → cache updated

---

## Navigation

- **Dashboard** — system status, inventory overview, quick actions
- **Inventory** — warehouse simulator, polling controls, live cache
- **API Tester** — test Query API and webhook receiver directly
- **Message Queue** — queue depth, stats, dead-letter queue
- **Architecture** — Day 3 vs Day 5 diagrams
- **System Logs** — real-time event stream
- **Learning Journal** — record your real blockers and discoveries
- **Day 4 Pivot** — pivot documentation, phase toggle
- **Scope Delta** — editable change impact analysis
- **Regression Tests** — post-pivot checklist
- **Adaptability Index** — Assignment 3 self-assessment (confidential)

---

## Queue Abstraction

`server/queue.js` implements a clean interface:

```js
queue.publish(message)       // Add to BACK (FIFO)
queue.consume(handler)       // Register worker
queue.retry(message)         // Re-queue with counter
queue.deadLetter(msg, err)   // Move to DLQ
queue.getStats()             // Metrics
```

To swap in RabbitMQ, Redis Streams, or AWS SQS — replace only the internals of `queue.js`. The worker in `index.js` and all routes stay unchanged.

---

## Notes

- Storage: JSON files in `/data/` — no database installation required
- Queue: in-memory — does not survive server restarts (by design for prototype)
- Poller: disabled automatically when phase is set to `day5`
- All editable forms (Journal, Scope Delta, Checklist, Adaptability) persist to disk
