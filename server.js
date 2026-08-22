import('./server-built.js').catch((err) => {
  console.error('[SNNS] Failed to start backend:', err);
  process.exit(1);
});