// Durable diagnostic metadata only: never cookies, ciphertext, passwords or course bodies.
export async function recordLifecycle(storage, event, details = {}) {
  const allowed = ['expires_at', 'cookie_count', 'previously_saved', 'last_verified_at'];
  const entry = { at: new Date().toISOString(), event,
    ...Object.fromEntries(allowed.filter(k => details[k] !== undefined).map(k => [k, details[k]])) };
  const events = await storage.get('session_lifecycle') || [];
  await storage.put('session_lifecycle', [...events, entry].slice(-30));
  return entry;
}
export async function lifecycleDiagnostic(storage) {
  const events = await storage.get('session_lifecycle') || [];
  return { scope: 'Session metadata retained independently of high-volume course-index audit; no retrospective reconstruction.',
    last_event: events.at(-1) || null, events };
}
