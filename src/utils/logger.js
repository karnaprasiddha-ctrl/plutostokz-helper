// src/utils/logger.js
// Simple structured console logger. Never pass secrets into this.

const SECRET_PATTERNS = [/discord_token/i, /sellauth_api_key/i, /bearer\s+\S+/i];

function scrub(input) {
  if (typeof input !== 'string') return input;
  let out = input;
  for (const pattern of SECRET_PATTERNS) {
    out = out.replace(pattern, '[redacted]');
  }
  return out;
}

function timestamp() {
  return new Date().toISOString();
}

const logger = {
  info(msg, meta) {
    console.log(`[${timestamp()}] ℹ️  ${scrub(msg)}`, meta ? meta : '');
  },
  success(msg, meta) {
    console.log(`[${timestamp()}] ✅ ${scrub(msg)}`, meta ? meta : '');
  },
  warn(msg, meta) {
    console.warn(`[${timestamp()}] ⚠️  ${scrub(msg)}`, meta ? meta : '');
  },
  error(msg, err) {
    const errMsg = err instanceof Error ? err.stack || err.message : err;
    console.error(`[${timestamp()}] ❌ ${scrub(msg)}`, errMsg ? scrub(String(errMsg)) : '');
  },
};

module.exports = { logger };
