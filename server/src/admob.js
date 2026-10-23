/* AdMob 보상형 광고 서버 측 검증(SSV)
   광고를 끝까지 본 사용자가 있으면 AdMob 서버가 우리 주소로 GET 요청을 보낸다:
     /api/admob/ssv?ad_network=…&ad_unit=…&custom_data=…&reward_amount=…&reward_item=…
                    &timestamp=…&transaction_id=…&user_id=…&signature=…&key_id=…
   signature 앞까지의 쿼리 문자열(순서·인코딩 그대로)을 구글 공개키(ECDSA P-256, SHA-256)로 검증한다.
   공개키: https://www.gstatic.com/admob/reward/verifier-keys.json (구글이 교체하므로 24시간 이내로만 캐시)
   참고: https://developers.google.com/admob/flutter/ssv */

export const ADMOB_KEYS_URL = 'https://www.gstatic.com/admob/reward/verifier-keys.json';
const KEY_TTL_MS = 12 * 36e5;
let keyCache = { at: 0, keys: null };   // isolate 단위 캐시

const b64ToBytes = s => {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return Uint8Array.from(atob(s), c => c.charCodeAt(0));
};

/* ASN.1 DER 서명(SEQUENCE{INTEGER r, INTEGER s}) → WebCrypto가 받는 r||s(각 32바이트) */
export function derToRaw(der) {
  let i = 0;
  if (der[i++] !== 0x30) throw new Error('bad_der');
  if (der[i] & 0x80) i += (der[i] & 0x7f) + 1; else i++;
  const readInt = () => {
    if (der[i++] !== 0x02) throw new Error('bad_der');
    let len = der[i++];
    let v = der.slice(i, i + len); i += len;
    while (v.length > 32 && v[0] === 0) v = v.slice(1);   // 부호용 0x00 제거
    if (v.length > 32) throw new Error('bad_der');
    const out = new Uint8Array(32); out.set(v, 32 - v.length); return out;
  };
  const r = readInt(), s = readInt();
  const raw = new Uint8Array(64); raw.set(r, 0); raw.set(s, 32); return raw;
}

async function loadKeys(fetchFn, now, force = false) {
  if (!force && keyCache.keys && now - keyCache.at < KEY_TTL_MS) return keyCache.keys;
  const res = await fetchFn(ADMOB_KEYS_URL, { cf: { cacheTtl: 3600 } });
  if (!res.ok) throw new Error('keys_fetch_failed ' + res.status);
  const j = await res.json();
  const keys = new Map();
  for (const k of j.keys || []) {
    const der = b64ToBytes(k.base64 || String(k.pem || '').replace(/-----[^-]+-----|\s/g, ''));
    keys.set(String(k.keyId), await crypto.subtle.importKey('spki', der, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']));
  }
  keyCache = { at: now, keys };
  return keys;
}
export function _resetKeyCache() { keyCache = { at: 0, keys: null }; }

/* rawQuery: '?' 뒤의 원본 쿼리 문자열. 성공하면 { ok:true, params }, 실패하면 { ok:false, reason } */
export async function verifyAdmobSsv(rawQuery, fetchFn = (u, o) => globalThis.fetch(u, o), now = Date.now()) {
  const q = String(rawQuery || '').replace(/^\?/, '');
  const at = q.indexOf('&signature=');
  if (at < 0) return { ok: false, reason: 'no_signature' };
  const message = q.slice(0, at);
  const params = Object.fromEntries(new URLSearchParams(q));
  if (!params.signature || !params.key_id) return { ok: false, reason: 'no_signature' };
  let sig;
  try { sig = derToRaw(b64ToBytes(params.signature)); } catch (e) { return { ok: false, reason: 'bad_signature' }; }
  let keys = await loadKeys(fetchFn, now);
  if (!keys.has(params.key_id)) keys = await loadKeys(fetchFn, now, true);   // 키가 막 교체됐을 수 있다
  const key = keys.get(params.key_id);
  if (!key) return { ok: false, reason: 'unknown_key' };
  const valid = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, sig, new TextEncoder().encode(message));
  return valid ? { ok: true, params } : { ok: false, reason: 'bad_signature' };
}
