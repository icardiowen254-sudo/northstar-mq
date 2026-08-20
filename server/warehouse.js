/**
 * warehouse.js — Simulated Warehouse API
 *
 * In a real deployment, this would be replaced by HTTP calls to the
 * actual Northstar warehouse system endpoint.
 *
 * This module simulates:
 *  - GET /warehouse/inventory   → returns all products
 *  - Occasional failures (to demonstrate error handling)
 *  - Variable stock levels (to show sync working)
 */

let _failNextCall = false;
let _callCount    = 0;

// Simulated warehouse data — separate from our cache
// so we can show drift and sync
const warehouseData = {
  'SKU-001': { productId: 'SKU-001', name: 'Wireless Bluetooth Headphones', stock: 24 },
  'SKU-002': { productId: 'SKU-002', name: 'USB-C Charging Cable (2m)',      stock: 0  },
  'SKU-003': { productId: 'SKU-003', name: 'Portable Power Bank 20000mAh',   stock: 17 },
  'SKU-004': { productId: 'SKU-004', name: 'Laptop Stand — Aluminium',        stock: 8  },
  'SKU-005': { productId: 'SKU-005', name: 'Mechanical Keyboard — TKL',       stock: 3  },
  'SKU-006': { productId: 'SKU-006', name: 'Ergonomic Mouse — Wireless',      stock: 0  },
};

/**
 * fetchInventory()
 * Simulates an HTTP GET to the warehouse API.
 * Returns array of { productId, name, stock }
 * Throws on failure.
 */
async function fetchInventory() {
  _callCount++;

  // Simulate network latency
  await new Promise(r => setTimeout(r, 200 + Math.random() * 300));

  if (_failNextCall) {
    _failNextCall = false;
    throw new Error('Warehouse API unavailable — connection timeout (simulated)');
  }

  // Randomly fluctuate stock slightly on each poll to show sync working
  const results = Object.values(warehouseData).map(p => ({
    ...p,
    stock: Math.max(0, p.stock + Math.floor((Math.random() - 0.3) * 3)),
  }));

  return results;
}

/**
 * triggerFailure()
 * Causes the next fetchInventory() call to fail.
 * Used by the UI "Simulate Failure" button.
 */
function triggerFailure() {
  _failNextCall = true;
}

/**
 * updateWarehouseStock(productId, stock)
 * Simulates the warehouse updating its own stock.
 * In production this happens in the warehouse system itself —
 * we just observe the changes via polling or webhooks.
 */
function updateWarehouseStock(productId, stock) {
  if (warehouseData[productId]) {
    warehouseData[productId].stock = stock;
    return true;
  }
  return false;
}

function getWarehouseSnapshot() {
  return { ...warehouseData };
}

function getCallCount() {
  return _callCount;
}

module.exports = {
  fetchInventory,
  triggerFailure,
  updateWarehouseStock,
  getWarehouseSnapshot,
  getCallCount,
};
