// src/store.js
//
// Lightweight JSON-file persistence layer.
//
// IMPORTANT — Render filesystem note:
// Render's free/standard Web Service filesystem is EPHEMERAL. Anything
// written to disk (including everything in ./data) is wiped on every
// deploy and on most restarts/re-scales. This module is written so a
// database can be swapped in later without touching call sites elsewhere
// in the bot: every exported function here is the only thing that talks
// to disk. To move to a real database (Postgres, Redis, etc.), you only
// need to reimplement the functions in this file — nothing else in the
// project reaches into the JSON files directly.
//
// For production use with persistent data, attach a Render Disk to this
// service (mounted at, e.g., /var/data) and point DATA_DIR at it, or swap
// this module for a database client.

const fs = require('fs');
const path = require('path');
const { logger } = require('./utils/logger');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const FILES = {
  orders: path.join(DATA_DIR, 'orders.json'),
  nprPrices: path.join(DATA_DIR, 'npr-prices.json'),
  paymentSettings: path.join(DATA_DIR, 'payment-settings.json'),
  setup: path.join(DATA_DIR, 'setup.json'),
  counters: path.join(DATA_DIR, 'counters.json'),
};

function readJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    const raw = fs.readFileSync(file, 'utf8');
    if (!raw.trim()) return fallback;
    return JSON.parse(raw);
  } catch (err) {
    logger.error(`Failed to read ${path.basename(file)}, using fallback`, err);
    return fallback;
  }
}

function writeJson(file, data) {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (err) {
    logger.error(`Failed to write ${path.basename(file)}`, err);
    return false;
  }
}

// ---------- Orders ----------

function getOrders() {
  return readJson(FILES.orders, {});
}

function saveOrder(order) {
  const orders = getOrders();
  orders[order.orderNumber] = order;
  writeJson(FILES.orders, orders);
  return order;
}

function getOrder(orderNumber) {
  const orders = getOrders();
  return orders[orderNumber] || null;
}

function getOrderByTicketChannelId(channelId) {
  const orders = getOrders();
  return Object.values(orders).find((o) => o.ticketChannelId === channelId) || null;
}

function getRecentOrders(limit = 10) {
  const orders = Object.values(getOrders());
  orders.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return orders.slice(0, limit);
}

function nextOrderNumber(orderPrefix) {
  const counters = readJson(FILES.counters, {});
  const key = 'orderSeq';
  const next = (counters[key] || 0) + 1;
  counters[key] = next;
  writeJson(FILES.counters, counters);
  const padded = String(next).padStart(4, '0');
  return `${orderPrefix}-${padded}`;
}

// ---------- NPR custom prices ----------
// key: `${productId}:${variantId}` -> number (NPR price)

function getNprPrices() {
  return readJson(FILES.nprPrices, {});
}

function setNprPrice(productId, variantId, price) {
  const prices = getNprPrices();
  prices[`${productId}:${variantId}`] = price;
  writeJson(FILES.nprPrices, prices);
  return price;
}

function getNprPrice(productId, variantId) {
  const prices = getNprPrices();
  return prices[`${productId}:${variantId}`] ?? null;
}

// ---------- Payment settings (manual NPR methods) ----------

function getPaymentSettings() {
  return readJson(FILES.paymentSettings, {
    khalti: { enabled: false, number: '', name: '' },
    esewa: { enabled: false, number: '', name: '' },
  });
}

function setPaymentMethod(method, data) {
  const settings = getPaymentSettings();
  settings[method] = { ...settings[method], ...data };
  writeJson(FILES.paymentSettings, settings);
  return settings[method];
}

// ---------- Setup / channel IDs ----------

function getSetup() {
  return readJson(FILES.setup, {});
}

function saveSetup(partial) {
  const setup = getSetup();
  const merged = { ...setup, ...partial };
  writeJson(FILES.setup, merged);
  return merged;
}

module.exports = {
  DATA_DIR,
  getOrders,
  saveOrder,
  getOrder,
  getOrderByTicketChannelId,
  getRecentOrders,
  nextOrderNumber,
  getNprPrices,
  setNprPrice,
  getNprPrice,
  getPaymentSettings,
  setPaymentMethod,
  getSetup,
  saveSetup,
};
