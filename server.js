import('./dist/server.cjs').catch((err) => {
  console.error('[SNNS] Failed to start backend:', err);
  process.exit(1);
});