export const CANVAS = 'https://canvas.sydney.edu.au';
export const LOGIN_DOMAINS = ['canvas.sydney.edu.au', 'sso.sydney.edu.au', 'sso.canvaslms.com', '*.oktacdn.com'];
export const STATIC_DOMAINS = ['du11hjcvx0uqb.cloudfront.net', 'd1embgbpmfo5b.cloudfront.net', 'instructure-uploads-apse2.s3.ap-southeast-2.amazonaws.com', 'instructure-uploads-apse2.s3.ap-southeast-2.amazonaws.com'];
export const READ_DOMAINS = ['canvas.sydney.edu.au', '*.instructure.com', '*.inscloudgate.net', '*.canvas-user-content.com', ...STATIC_DOMAINS];
const numeric = n => {
  if (!Number.isSafeInteger(n) || n < 1) throw new Error('invalid_target');
  return String(n);
};
export function targetURL(target) {
  if(target.kind==='courses') return CANVAS+'/courses';
  const course = numeric(target.course_id), base = `${CANVAS}/courses/${course}`;
  switch (target.kind) {
    case 'group_pages': return `${CANVAS}/groups/${numeric(target.group_id)}/pages`;
    case 'group_page': {
      if(typeof target.page!=='string'||!/^[a-zA-Z0-9_-]{1,200}$/.test(target.page))throw new Error('invalid_target');
      return `${CANVAS}/groups/${numeric(target.group_id)}/pages/${target.page}`;
    }
    case 'page': {
      if (typeof target.page !== 'string' || !/^[a-zA-Z0-9_-]{1,200}$/.test(target.page)) throw new Error('invalid_target');
      return `${base}/pages/${target.page}` + (target.module_item_id ? `?module_item_id=${numeric(target.module_item_id)}` : '');
    }
    case 'pages': return `${base}/pages`;
    case 'module': numeric(target.module_id); return `${base}/modules`;
    case 'modules': return `${base}/modules`;
    case 'files': return `${base}/files`;
    case 'file': return `${base}/files/${numeric(target.file_id)}`;
    case 'assignment': throw new Error('unsupported_readonly_target');
    case 'grades': return `${base}/grades`;
    // Modules are kept on the API path: viewing some module items records completion.
    // Inbox is kept on the API path: opening a conversation can mark it read.
    // LTI launches can submit signed forms and record progress; do not launch them blindly.
    default: throw new Error('unsupported_readonly_target');
  }
}
export function permittedReadRequest(url, method) {
  if (!['GET', 'HEAD'].includes(method)) return false;
  let parsed;
  try { parsed = new URL(url); } catch { return false; }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || (parsed.port && parsed.port !== '443')) return false;
  let pathname;try{pathname=decodeURIComponent(parsed.pathname);}catch{return false;}
  if (parsed.hostname === 'canvas.sydney.edu.au') {
    if (/^\/api\/v1\/courses\/\d+\/quizzes(?:\/\d+)?$/.test(pathname)) return true;
    if (/^\/courses\/\d+\/discussion_topics(?:\/|$)/.test(pathname)) return false;
    if (/^\/courses\/\d+\/assignments(?:\/|$)/.test(pathname)) return false;
    if (/^\/courses\/\d+\/modules\/items\//.test(pathname)) return false;
    if (/\/(?:logout|conversations|quizzes|external_tools|collaborations|conferences|mark_as_done|mark_read)(?:\/|$)/.test(pathname)) return false;
    if (/\/(?:users\/[^/]+\/(?:profile|settings)|accounts\/)/.test(pathname) && !pathname.startsWith('/api/v1/')) return false;
    return true;
  }
  if (STATIC_DOMAINS.includes(parsed.hostname)) return true;
  return /\.(?:instructure\.com|inscloudgate\.net|canvas-user-content\.com)$/.test(parsed.hostname);
}

export const base64 = bytes => {
  let text = '';
  for (let i = 0; i < bytes.length; i += 16384) text += String.fromCharCode(...bytes.subarray(i, i + 16384));
  return btoa(text);
};
export async function seal(value, keyText, purpose) {
  const keyBytes = Uint8Array.from(atob(keyText), c => c.charCodeAt(0));
  if (keyBytes.length !== 32) throw new Error('invalid_encryption_key');
  const key = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(purpose) }, key, new TextEncoder().encode(JSON.stringify(value))));
  return { iv: base64(iv), ciphertext: base64(ciphertext) };
}
export async function unseal(value, keyText, purpose) {
  const bytes = str => Uint8Array.from(atob(str), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('raw', bytes(keyText), 'AES-GCM', false, ['decrypt']);
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes(value.iv), additionalData: new TextEncoder().encode(purpose) }, key, bytes(value.ciphertext));
  return JSON.parse(new TextDecoder().decode(plaintext));
}

// Normal school SSO cookies only; never broad *.sydney.edu.au state or MFA keys/localStorage.
export function scopedSSOCookies(cookies, now=Date.now()) {
  return cookies.filter(c=>['sso.sydney.edu.au','sso.canvaslms.com'].includes(c.domain.replace(/^\./,'')) && (c.expires<=0 || c.expires*1000>now));
}
