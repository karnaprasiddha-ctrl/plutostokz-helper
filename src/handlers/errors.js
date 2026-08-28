// src/handlers/errors.js
// Process-wide safety net so the bot never crashes on an unhandled
// rejection or synchronous exception. Discord/SellAuth outages, malformed
// API responses, etc. should surface as logs, not process death.

const { logger } = require('../utils/logger');

function registerGlobalErrorHandlers() {
  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled promise rejection', reason instanceof Error ? reason : new Error(String(reason)));
  });

  process.on('uncaughtException', (err) => {
    logger.error('Uncaught exception', err);
  });

  process.on('SIGTERM', () => {
    logger.info('SIGTERM received — shutting down gracefully...');
    process.exit(0);
  });

  process.on('SIGINT', () => {
    logger.info('SIGINT received — shutting down gracefully...');
    process.exit(0);
  });
}

module.exports = { registerGlobalErrorHandlers };
