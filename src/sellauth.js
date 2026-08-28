// src/sellauth.js
//
// Thin wrapper around the SellAuth REST API.
// Docs: https://developers.sellauth.com
//
// This module never logs the API key, and every function returns
// { ok, data, error } so callers can handle failures gracefully instead
// of throwing and crashing the bot.

const fetch = require('node-fetch');
const { config } = require('./config');
const { logger } = require('./utils/logger');

const BASE_URL = 'https://api.sellauth.com/v1';

let productCache = { fetchedAt: 0, products: [] };
const CACHE_TTL_MS = 60 * 1000; // 60s local cache to avoid hammering the API

async function sellauthRequest(pathname, options = {}) {
  if (!config.sellauthApiKey || !config.sellauthShopId) {
    return { ok: false, data: null, error: 'SellAuth is not configured (missing API key or shop ID).' };
  }

  const url = `${BASE_URL}${pathname}`;
  try {
    const res = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${config.sellauthApiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(options.headers || {}),
      },
    });

    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }

    if (!res.ok) {
      return {
        ok: false,
        data: json,
        error: `SellAuth API returned ${res.status}${json && json.message ? `: ${json.message}` : ''}`,
      };
    }

    return { ok: true, data: json, error: null };
  } catch (err) {
    logger.error('SellAuth request failed', err);
    return { ok: false, data: null, error: 'Could not reach SellAuth (network error).' };
  }
}

/** Fetch all products for the configured shop. Uses a short local cache. */
async function fetchProducts({ force = false } = {}) {
  const now = Date.now();
  if (!force && productCache.products.length && now - productCache.fetchedAt < CACHE_TTL_MS) {
    return { ok: true, data: productCache.products, error: null };
  }

  const result = await sellauthRequest(`/shops/${config.sellauthShopId}/products`);
  if (!result.ok) {
    // Fall back to stale cache rather than a hard failure, if we have one.
    if (productCache.products.length) {
      logger.warn('SellAuth product fetch failed, serving cached products', result.error);
      return { ok: true, data: productCache.products, error: null, stale: true };
    }
    return result;
  }

  const products = Array.isArray(result.data) ? result.data : result.data?.data || [];
  productCache = { fetchedAt: now, products };
  return { ok: true, data: products, error: null };
}

function getCachedProducts() {
  return productCache.products;
}

async function fetchProductById(productId) {
  const { ok, data, error } = await fetchProducts();
  if (!ok) return { ok, data: null, error };
  const product = data.find((p) => String(p.id) === String(productId));
  if (!product) return { ok: false, data: null, error: 'Product not found.' };
  return { ok: true, data: product, error: null };
}

/** Create a SellAuth checkout/invoice for USD payment. */
async function createCheckout({ productId, variantId, quantity, email }) {
  const body = {
    cart: [
      {
        productId: Number(productId),
        variantId: variantId ? Number(variantId) : undefined,
        quantity: Number(quantity) || 1,
      },
    ],
    // SellAuth allows guest checkout email; use a placeholder if none supplied.
    email: email || 'orders@plutostokz.local',
    gateway: 'stripe',
  };

  const result = await sellauthRequest(`/shops/${config.sellauthShopId}/checkout`, {
    method: 'POST',
    body: JSON.stringify(body),
  });

  if (!result.ok) return result;

  const invoiceId = result.data?.invoiceId || result.data?.id || null;
  const invoiceUrl = result.data?.url || result.data?.checkoutUrl || null;

  if (!invoiceUrl) {
    return { ok: false, data: result.data, error: 'SellAuth did not return a checkout URL.' };
  }

  return { ok: true, data: { invoiceId, invoiceUrl }, error: null };
}

/** Check the status of an invoice (used for USD orders). */
async function getInvoiceStatus(invoiceId) {
  const result = await sellauthRequest(`/shops/${config.sellauthShopId}/invoices/${invoiceId}`);
  return result;
}

/** Append additional stock/deliverables to a variant, where supported. */
async function addStock({ productId, variantId, deliverables }) {
  const result = await sellauthRequest(
    `/shops/${config.sellauthShopId}/products/${productId}/variants/${variantId}/deliverables`,
    {
      method: 'POST',
      body: JSON.stringify({ deliverables }),
    }
  );
  return result;
}

module.exports = {
  fetchProducts,
  getCachedProducts,
  fetchProductById,
  createCheckout,
  getInvoiceStatus,
  addStock,
};
