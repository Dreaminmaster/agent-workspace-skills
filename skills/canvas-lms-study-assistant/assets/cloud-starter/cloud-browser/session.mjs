// Credential-free state and rate-limit policy, shared with focused tests.
export function sessionStatus(state, diagnostic = {}) {
  return {status: state ? (state.verified_at ? 'authenticated' : 'saved_unverified') : 'requires_login', credentials_saved: !!state, expires_at: state?.expires_at || null, last_verified_at: state?.verified_at || diagnostic.last_verified_at || null, authentication_state: state ? 'canvas_session_saved; validity can change at school' : diagnostic.reason==='canvas_session_saved'?'record_missing_after_save':diagnostic.reason || 'session_missing', verification: 'last_successful_navigation; not a live authentication guarantee'};
}
export function retryDeadline(header, now, daily = false) {
  const seconds = Number(header);
  const requested = header && Number.isFinite(seconds) ? now + seconds * 1000 : Date.parse(header);
  return Math.max(daily ? (Math.floor(now / 86400000) + 1) * 86400000 : now + 20000, Number.isFinite(requested) && Number.isFinite(new Date(requested).getTime()) ? requested : now + 20000);
}
