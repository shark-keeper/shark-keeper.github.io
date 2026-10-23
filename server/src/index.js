/* =========================================================
   상어집사 API 서버 (Cloudflare Workers + D1)
   서버 권위 모델: 클라이언트는 "무엇을 했는지"만 보내고, 정산·확률 판정·사망·랭킹은 여기서 정한다.
   API 목록은 CLAUDE.md의 "API 서버" 절 참고.
   ========================================================= */
import { CFG, ACTIONS, newShark, settle, act, adRefill, daysAlive, cdLeft, foodLeft, stageOf, growthPerDay } from './game.js';
import { ensureSchema } from './schema.js';
import { verifyAdmobSsv } from './admob.js';

const ALLOWED_ORIGINS = ['https://shark-keeper.github.io'];
const DEV_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;   // 로컬 개발용
const SAVE_EVERY_MS = 30 * 6e4;      // 조회만 할 때는 30분에 한 번만 DB에 저장 (정산은 결정적이라 다시 계산해도 같다)
const LAUNCH = Date.UTC(2026, 9, 1); // 가져오기 때 이보다 오래된 출생 시각은 인정하지 않는다
const RANK_LIMIT = 50;

class HttpError extends Error {
  constructor(status, code, msg) { super(msg || code); this.status = status; this.code = code; }
}

/* ---------- 공통 ---------- */
function cors(req) {
  const origin = req.headers.get('Origin');
  const ok = origin && (ALLOWED_ORIGINS.includes(origin) || DEV_ORIGIN.test(origin));
  return {
    'Access-Control-Allow-Origin': ok ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}
const json = (req, data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...cors(req) } });

async function readBody(req) {
  const txt = await req.text();
  if (txt.length > 50000) throw new HttpError(413, 'too_large');
  if (!txt) return {};
  try { const v = JSON.parse(txt); return v && typeof v === 'object' ? v : {}; } catch (e) { throw new HttpError(400, 'bad_json'); }
}
const rnd = () => crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;
const b64url = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
async function sha256(s) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('');
}
const kstDay = t => new Date(t + 9 * 36e5).toISOString().slice(0, 10);   // 광고 횟수는 한국 날짜 기준
function reqIdOf(b) {
  if (b.reqId == null) return null;
  if (typeof b.reqId !== 'string' || !/^[A-Za-z0-9_-]{8,64}$/.test(b.reqId)) throw new HttpError(400, 'bad_req_id');
  return b.reqId;
}
async function replayOf(env, p, reqId) {
  if (!reqId) return null;
  const prev = await env.DB.prepare('SELECT response FROM requests WHERE player_id = ? AND req_id = ?').bind(p.id, reqId).first('response');
  return prev ? { ...JSON.parse(prev), replay: true } : null;
}

/* ---------- 인증 (기기별 게스트 토큰) ---------- */
async function auth(req, env, optional = false) {
  const m = /^Bearer (sk_[A-Za-z0-9_-]{30,80})$/.exec(req.headers.get('Authorization') || '');
  if (!m) { if (optional) return null; throw new HttpError(401, 'no_token'); }
  const p = await env.DB.prepare('SELECT * FROM players WHERE token_hash = ?').bind(await sha256(m[1])).first();
  if (!p) { if (optional) return null; throw new HttpError(401, 'bad_token'); }
  return p;
}

/* ---------- 상어 읽기/쓰기 ---------- */
async function loadAlive(env, playerId) {
  const r = await env.DB.prepare('SELECT id, version, updated_at, state FROM sharks WHERE player_id = ? AND alive = 1').bind(playerId).first();
  return r ? { id: r.id, version: r.version, updatedAt: r.updated_at, sh: JSON.parse(r.state) } : null;
}
function saveStmt(env, row, t) {
  const sh = row.sh;
  return env.DB.prepare(`UPDATE sharks SET state = ?, alive = ?, len = ?, died_at = ?, reason = ?, rank_off = ?, version = version + 1, updated_at = ?
    WHERE id = ? AND version = ?`)
    .bind(JSON.stringify(sh), sh.alive ? 1 : 0, sh.len, sh.diedAt ?? null, sh.reason ?? null, sh.rankOff ? 1 : 0, t, row.id, row.version);
}
const bestStmt = (env, playerId, sh, t) =>
  env.DB.prepare('UPDATE players SET best_len = ?, best_name = ?, best_days = ? WHERE id = ? AND best_len < ?')
    .bind(sh.len, sh.name, daysAlive(sh, t), playerId, sh.len);

function sharkView(row, t) {
  if (!row) return null;
  const sh = row.sh, cd = {};
  for (const a of ACTIONS) cd[a] = sh.alive ? cdLeft(sh, a, t) : 0;
  return { id: row.id, ...sh, stage: stageOf(sh.len), days: daysAlive(sh, t), growthPerDay: sh.alive ? growthPerDay(sh) : 0,
    cdLeftMs: cd, foodLeftMs: sh.alive ? foodLeft(sh, t) : 0 };
}
// 광고 상태: 쿨타임 남은 시간 + 오늘 본 횟수(통계용)
function adsView(p, t) {
  const cd = CFG.adCdMin * 6e4;
  return { last: p.ad_last || 0, cdMin: CFG.adCdMin, food: CFG.adFood, leftMs: Math.max(0, (p.ad_last || 0) + cd - t), today: p.ad_day === kstDay(t) ? p.ad_used : 0 };
}
function playerView(p, t) {
  return { id: p.id, best: { len: p.best_len, name: p.best_name, days: p.best_days }, ads: adsView(p, t) };
}
async function graves(env, playerId) {
  const { results } = await env.DB.prepare(`SELECT name, len, born, died_at, reason FROM sharks WHERE player_id = ? AND alive = 0
    ORDER BY died_at DESC LIMIT 20`).bind(playerId).all();
  return results.map(r => ({ name: r.name, len: r.len, days: Math.floor((r.died_at - r.born) / 864e5), reason: r.reason, diedAt: r.died_at }));
}

/* 상태를 바꾸는 요청 공통 처리
   - reqId가 같은 요청은 처음 응답을 그대로 돌려준다(중복 요청 방지)
   - 상어 행(version)이 그사이 바뀌었으면 다시 읽어서 최대 5번까지 재시도
   fn(row, t) → { body, write: 저장할지, extra: 함께 실행할 SQL[] } */
async function mutate(env, p, reqId, fn) {
  let prev = await replayOf(env, p, reqId); if (prev) return prev;
  for (let i = 0; i < 5; i++) {
    if (i) await new Promise(r => setTimeout(r, 15 + Math.random() * 40 * i));   // 충돌하면 잠깐 쉬었다가 다시 읽기
    const t = Date.now();
    const row = await loadAlive(env, p.id);
    const out = await fn(row, t);
    if (!out.write) return out.body;
    const stmts = [saveStmt(env, row, t)];
    // 상어 저장이 실제로 됐을 때만(changes()=1) 요청 기록을 남긴다 — 한 batch는 하나의 트랜잭션
    if (reqId) stmts.push(env.DB.prepare('INSERT OR IGNORE INTO requests (player_id, req_id, created_at, response) SELECT ?, ?, ?, ? WHERE changes() = 1')
      .bind(p.id, reqId, t, JSON.stringify(out.body)));
    stmts.push(bestStmt(env, p.id, row.sh, t), ...(out.extra || []));
    const rs = await env.DB.batch(stmts);
    if (rs[0].meta.changes === 1) return out.body;
    prev = await replayOf(env, p, reqId); if (prev) return prev;
  }
  throw new HttpError(409, 'busy', '잠시 후 다시 시도해 주세요');
}

/* ---------- 이름 검사 ---------- */
function cleanName(v) {
  if (typeof v !== 'string') throw new HttpError(400, 'bad_name', '이름은 1~10자로 지어 주세요');
  const s = v.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/g, '').trim();
  const n = [...s].length;
  if (n < 1 || n > 10) throw new HttpError(400, 'bad_name', '이름은 1~10자로 지어 주세요');
  return s;
}
async function insertShark(env, p, sh, t, reqId, makeBody) {
  const id = crypto.randomUUID();
  const row = { id, version: 0, updatedAt: t, sh };
  const body = makeBody(row);
  const stmts = [env.DB.prepare(`INSERT INTO sharks (id, player_id, name, alive, len, born, died_at, reason, rank_off, state, version, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`)
    .bind(id, p.id, sh.name, sh.alive ? 1 : 0, sh.len, sh.born, sh.diedAt ?? null, sh.reason ?? null, sh.rankOff ? 1 : 0, JSON.stringify(sh), t),
    bestStmt(env, p.id, sh, t)];
  if (reqId) stmts.push(env.DB.prepare('INSERT OR IGNORE INTO requests (player_id, req_id, created_at, response) VALUES (?, ?, ?, ?)')
    .bind(p.id, reqId, t, JSON.stringify(body)));
  try { await env.DB.batch(stmts); }
  catch (e) {
    const m = String(e && e.message);
    if (m.includes('sharks.name')) throw new HttpError(409, 'name_taken', '이미 바다에 같은 이름의 상어가 있어요');
    if (m.includes('sharks.player_id')) throw new HttpError(409, 'has_shark', '이미 키우는 상어가 있어요');
    throw e;
  }
  return body;
}

/* ---------- 브라우저(localStorage)에 있던 상어 가져오기: 믿을 수 없는 값이라 범위를 잘라서 받는다 ---------- */
function sanitizeImport(src, offsetMs, t) {
  const num = (v, a, b, d) => { v = +v; return Number.isFinite(v) ? Math.max(a, Math.min(b, v)) : d; };
  const off = num(offsetMs, 0, 365 * 864e5, 0);          // 테스트용 "시간 빨리 감기"로 미래로 간 시각을 되돌린다
  const tm = (v, d) => num(+v - off, LAUNCH, t, d);
  const born = tm(src.born, t);
  const days = (t - born) / 864e5;
  const sh = newShark(cleanName(src.name), t);
  sh.born = born;
  sh.lastSim = Math.max(born, tm(src.lastSim, t));
  sh.lastCare = tm(src.lastCare, sh.lastSim);
  sh.len = num(src.len, CFG.startLen, CFG.startLen + CFG.maxDailyGrowth * days + 0.01, CFG.startLen);
  for (const k of ['satiety', 'exercise', 'affection']) sh[k] = num(src[k], 0, 100, sh[k]);
  sh.poop = Math.round(num(src.poop, 0, CFG.poopMax, 0));
  sh.poopT = num(src.poopT, 0, CFG.poopEveryH, 0);
  sh.food = Math.round(num(src.food, 0, CFG.food.max + CFG.adFood - 1, CFG.food.max));   // 광고로 쌓인 먹이까지
  sh.foodT = tm(src.foodT, sh.lastSim);
  sh.starveH = num(src.starveH, 0, CFG.starveDeathH, 0);
  sh.zeroH = num(src.zeroH, 0, CFG.allZeroDeathH, 0);
  sh.lowSatH = num(src.lowSatH, 0, 1000, 0);
  sh.swimN = Math.round(num(src.swimN, 0, 1e6, 0));
  for (const a of ACTIONS) if (src.cd && src.cd[a] != null) sh.cd[a] = tm(src.cd[a], 0);
  sh.pets = Array.isArray(src.pets) ? src.pets.slice(-CFG.actions.pet.perHourCap).map(x => tm(x, 0)) : [];
  if (src.ill && typeof src.ill === 'object') {
    const since = tm(src.ill.since, sh.lastSim);
    sh.ill = { since, prog: num(src.ill.prog, 0, CFG.illness.petsToCure, 0), seen: !!src.ill.seen,
      cause: src.ill.cause === 'hunger' ? 'hunger' : 'poop',
      deadline: num(+src.ill.deadline - off, since, since + 60 * 36e5, since + CFG.illness.deathH * 36e5) };
  }
  // 상태 이상(배탈 등)은 5분짜리라 가져오지 않는다
  return sh;
}

/* ---------- 라우트 ---------- */
/* 광고 보상 지급 공통: 먹이 adFood개 추가(최대치를 넘어 쌓임). 먹이가 food.max개 미만일 때만, 마지막 광고 후 adCdMin분 쿨타임.
   reqKey가 같으면 한 번만 처리(앱 reqId 또는 'ssv_'+AdMob transaction_id) */
function grantAd(env, p, reqKey) {
  return mutate(env, p, reqKey, async (row, t) => {
    if (!row) throw new HttpError(404, 'no_shark', '키우는 상어가 없어요');
    settle(row.sh, t);
    if (!row.sh.alive) return { write: true, body: { ok: false, error: 'dead', now: t, shark: sharkView(row, t) } };
    const fresh = await env.DB.prepare('SELECT ad_day, ad_used, ad_last FROM players WHERE id = ?').bind(p.id).first();
    const day = kstDay(t), used = fresh.ad_day === day ? fresh.ad_used : 0;
    const ads = adsView(fresh, t);
    if (ads.leftMs > 0) return { write: false, body: { ok: false, error: 'ad_cooldown', msg: '다음 광고까지 조금 더 기다려 주세요', cdLeftMs: ads.leftMs, now: t, ads, shark: sharkView(row, t) } };
    if (row.sh.food >= CFG.food.max) return { write: false, body: { ok: false, error: 'food_full', msg: `먹이가 ${CFG.food.max}개보다 적을 때 볼 수 있어요`, now: t, ads, shark: sharkView(row, t) } };
    adRefill(row.sh, t);
    return { write: true,
      extra: [env.DB.prepare('UPDATE players SET ad_day = ?, ad_used = ?, ad_last = ? WHERE id = ?').bind(day, used + 1, t, p.id)],
      body: { ok: true, msg: `먹이 ${CFG.adFood}개 충전!`, fx: '🐟', now: t, ads: adsView({ ad_last: t, ad_day: day, ad_used: used + 1 }, t), shark: sharkView(row, t) } };
  });
}

async function handle(req, env) {
  const url = new URL(req.url);
  const route = `${req.method} ${url.pathname.replace(/\/+$/, '') || '/'}`;

  if (route === 'GET /' || route === 'GET /health') {
    let db = false;
    try { db = (await env.DB.prepare('SELECT 1 AS ok').first('ok')) === 1; } catch (e) { db = false; }
    return { ok: true, service: 'shark-keeper-api', db, time: Date.now() };
  }
  if (route === 'GET /api/config') return { ok: true, config: CFG, adsMode: env.ADS_MODE || 'test' };

  await ensureSchema(env);

  // 게스트 플레이어 만들기 → 토큰은 이때 한 번만 내려준다 (클라이언트가 보관)
  if (route === 'POST /api/guest') {
    const token = 'sk_' + b64url(crypto.getRandomValues(new Uint8Array(32)));
    const id = crypto.randomUUID();
    await env.DB.prepare('INSERT INTO players (id, token_hash, created_at) VALUES (?, ?, ?)').bind(id, await sha256(token), Date.now()).run();
    return { ok: true, token, playerId: id };
  }

  // 내 정보: 플레이어 + 지금 상어(정산된 상태) + 떠난 상어 기록
  if (route === 'GET /api/me') {
    const p = await auth(req, env);
    const t = Date.now();
    const row = await loadAlive(env, p.id);
    let me = p;
    if (row) {
      settle(row.sh, t);
      if (!row.sh.alive || t - row.updatedAt >= SAVE_EVERY_MS) {
        await env.DB.batch([saveStmt(env, row, t), bestStmt(env, p.id, row.sh, t)]).catch(() => {});
      }
      if (row.sh.len > p.best_len) me = { ...p, best_len: row.sh.len, best_name: row.sh.name, best_days: daysAlive(row.sh, t) };
    }
    return { ok: true, now: t, player: playerView(me, t), shark: sharkView(row, t), graves: await graves(env, p.id) };
  }

  // 새 상어 입양 { name, reqId? }
  if (route === 'POST /api/shark') {
    const p = await auth(req, env); const b = await readBody(req); const reqId = reqIdOf(b);
    const prev = await replayOf(env, p, reqId); if (prev) return prev;
    const name = cleanName(b.name);
    const cur = await loadAlive(env, p.id);
    if (cur) {
      const t = Date.now();
      settle(cur.sh, t);
      if (cur.sh.alive) throw new HttpError(409, 'has_shark', '이미 키우는 상어가 있어요');
      await env.DB.batch([saveStmt(env, cur, t), bestStmt(env, p.id, cur.sh, t)]);   // 방금 떠난 상어를 기록으로 옮김
    }
    const t = Date.now();
    return insertShark(env, p, newShark(name, t), t, reqId, row => ({ ok: true, now: t, msg: `안녕! 나는 ${name}이에요`, shark: sharkView(row, t) }));
  }

  // 돌봄 행동 { action: feed|swim|pet|clean, reqId? }
  if (route === 'POST /api/shark/action') {
    const p = await auth(req, env); const b = await readBody(req); const reqId = reqIdOf(b);
    if (!ACTIONS.includes(b.action)) throw new HttpError(400, 'bad_action');
    return mutate(env, p, reqId, (row, t) => {
      if (!row) throw new HttpError(404, 'no_shark', '키우는 상어가 없어요');
      settle(row.sh, t);
      if (!row.sh.alive) return { write: true, body: { ok: false, error: 'dead', now: t, shark: sharkView(row, t) } };
      const r = act(row.sh, b.action, t, rnd);
      return { write: r.ok, body: { ...r, now: t, shark: sharkView(row, t) } };
    });
  }

  // 광고 보상(앱이 직접 알림): 먹이 가득 충전 { reqId? }
  // ※ 광고 시청을 서버가 확인하지 못하는 경로. ADS_MODE가 'ssv'면 막고, AdMob 서버 검증(/api/admob/ssv)으로만 지급한다.
  //   ADS_MODE 'test'(기본): 테스트 광고 ID·웹 목업용으로 허용 — 테스트 광고 단위는 SSV 콜백을 보내지 않기 때문.
  if (route === 'POST /api/shark/ad') {
    const p = await auth(req, env); const b = await readBody(req); const reqId = reqIdOf(b);
    if ((env.ADS_MODE || 'test') === 'ssv') throw new HttpError(403, 'ad_unverified', '광고 보상은 광고 서버 확인 후 지급돼요');
    return grantAd(env, p, reqId);
  }

  // AdMob 보상형 광고 서버 측 검증(SSV) 콜백 — AdMob 서버가 호출한다(브라우저·앱이 아님)
  // user_id = 플레이어 ID, transaction_id로 중복 지급을 막는다. 처리 결과와 상관없이 서명이 맞으면 200을 돌려준다
  // (200이 아니면 구글이 최대 5번 다시 보낸다).
  if (route === 'GET /api/admob/ssv') {
    const q = url.search;
    // 기록용: 서명은 앞부분만, 사용자 ID는 일부만 남긴다
    const brief = q.replace(/(signature=)([^&]{12})[^&]*/, '$1$2…').replace(/(user_id=)([^&]{8})[^&]*/, '$1$2…').slice(0, 400);
    const log = (result, detail = '') => env.DB.prepare('INSERT INTO ssv_log (at, result, detail) VALUES (?, ?, ?)')
      .bind(Date.now(), result, String(detail).slice(0, 600)).run().catch(() => {});
    const hasUser = /[?&]user_id=[^&]+/.test(q);
    let v;
    try { v = await verifyAdmobSsv(q); }
    catch (e) {
      console.error('ssv verify error', String(e && e.stack || e), brief);
      await log('error', String(e && e.message || e) + ' | ' + brief);
      if (!hasUser) return { ok: false, error: 'verify_error' };   // 콘솔의 "URL 확인" 같은 시험 요청: 200으로 답한다
      throw e;                                                      // 실제 보상 콜백: 500 → 구글이 다시 보낸다
    }
    if (!v.ok) {
      // 서명이 틀리거나 없으면 아무것도 지급하지 않는다. 다시 보내도 결과가 같으니 200으로 답한다.
      console.warn('ssv rejected', v.reason, brief);
      await log('rejected:' + v.reason, brief);
      return { ok: false, error: 'ssv_' + v.reason };
    }
    const { user_id: uid, transaction_id: tx } = v.params;
    if (!uid || !tx) { await log('ok:no_user', brief); return { ok: false, error: 'no_user' }; }   // 콘솔의 "URL 확인" 시험 요청 등
    const p = await env.DB.prepare('SELECT * FROM players WHERE id = ?').bind(uid).first();
    if (!p) { await log('ok:no_player', brief); return { ok: false, error: 'no_player' }; }
    try {
      const r = await grantAd(env, p, 'ssv_' + tx.slice(0, 56));
      await log(r.ok ? 'ok:granted' : 'ok:' + (r.error || 'not_granted'), brief);
      return { ok: r.ok, error: r.error };
    } catch (e) {
      if (e instanceof HttpError && e.status < 500) { await log('ok:' + e.code, brief); return { ok: false, error: e.code }; }   // 상어 없음 등: 다시 보내도 소용없음
      throw e;
    }
  }

  // SSV 콜백 최근 기록(설정 확인용) — 서명 앞부분·사용자 ID 일부만 보인다
  if (route === 'GET /api/admob/ssv-log') {
    const { results } = await env.DB.prepare('SELECT at, result, detail FROM ssv_log ORDER BY id DESC LIMIT 10').all();
    return { ok: true, rows: results.map(r => ({ at: new Date(r.at + 9 * 36e5).toISOString().replace('T', ' ').slice(0, 19) + ' KST', result: r.result, detail: r.detail })) };
  }

  // 랭킹 ?type=alive(지금 살아 있는 상어) | all(플레이어별 역대 최고) — 토큰이 있으면 내 순위도 함께
  if (route === 'GET /api/rank') {
    const type = url.searchParams.get('type') === 'all' ? 'all' : 'alive';
    const p = await auth(req, env, true);
    const t = Date.now();
    let rows, me = null;
    if (type === 'alive') {
      const { results } = await env.DB.prepare(`SELECT id, player_id, name, len, born FROM sharks WHERE alive = 1 AND rank_off = 0
        ORDER BY len DESC LIMIT ?`).bind(RANK_LIMIT).all();
      rows = results.map(r => ({ id: r.id, name: r.name, len: r.len, days: Math.floor((t - r.born) / 864e5), me: !!p && r.player_id === p.id }));
      if (p) {
        const row = await loadAlive(env, p.id);
        if (row) {
          settle(row.sh, t);
          const i = rows.findIndex(r => r.me);
          if (row.sh.alive && !row.sh.rankOff) {
            me = { id: row.id, name: row.sh.name, len: row.sh.len, days: daysAlive(row.sh, t), me: true };
            if (i >= 0) rows[i] = me;
          } else if (i >= 0) rows.splice(i, 1);
        }
      }
    } else {
      const { results } = await env.DB.prepare(`SELECT id, best_name, best_len, best_days FROM players WHERE best_len > 0
        ORDER BY best_len DESC LIMIT ?`).bind(RANK_LIMIT).all();
      rows = results.map(r => ({ id: r.id, name: r.best_name, len: r.best_len, days: r.best_days, me: !!p && r.id === p.id }));
      if (p && p.best_len > 0) me = { id: p.id, name: p.best_name, len: p.best_len, days: p.best_days, me: true };
    }
    rows.sort((a, b) => b.len - a.len);
    let prevK = null, pos = 0;
    rows.forEach((r, i) => { const k = r.len.toFixed(1); if (k !== prevK) { pos = i + 1; prevK = k; } r.pos = pos; });
    if (me) {
      const inList = rows.find(r => r.me);
      if (inList) me.pos = inList.pos;
      else {
        const cut = Math.round(me.len * 10) / 10 + 0.05;   // 소수 첫째 자리까지 같은 길이는 같은 순위
        const q = type === 'alive'
          ? env.DB.prepare('SELECT COUNT(*) AS n FROM sharks WHERE alive = 1 AND rank_off = 0 AND len >= ?')
          : env.DB.prepare('SELECT COUNT(*) AS n FROM players WHERE best_len >= ?');
        me.pos = (await q.bind(cut).first('n')) + 1;
      }
    }
    return { ok: true, now: t, type, rows, me };
  }

  // 브라우저에 있던 상어를 서버로 옮기기 (서버에 상어 기록이 하나도 없을 때 한 번만) { shark, offsetMs?, reqId? }
  if (route === 'POST /api/import') {
    const p = await auth(req, env); const b = await readBody(req); const reqId = reqIdOf(b);
    const prev = await replayOf(env, p, reqId); if (prev) return prev;
    const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM sharks WHERE player_id = ?').bind(p.id).first('n');
    if (n > 0) throw new HttpError(409, 'already_imported', '이미 서버에 상어 기록이 있어요');
    const src = b.shark;
    if (!src || typeof src !== 'object' || src.alive !== true) throw new HttpError(400, 'nothing_to_import', '옮길 상어가 없어요');
    const t = Date.now();
    const sh = sanitizeImport(src, b.offsetMs, t);
    settle(sh, t);
    if (!sh.alive) throw new HttpError(400, 'nothing_to_import', '옮기는 사이 상어가 떠났어요');
    return insertShark(env, p, sh, t, reqId, row => ({ ok: true, now: t, imported: true, shark: sharkView(row, t) }));
  }

  throw new HttpError(404, 'not_found');
}

/* 정기 정산 (1시간마다): 한동안 접속하지 않은 상어도 랭킹 길이·사망이 반영되도록 */
export async function settleStale(env) {
  await ensureSchema(env);
  const t = Date.now();
  const { results } = await env.DB.prepare(`SELECT id, player_id, version, updated_at, state FROM sharks
    WHERE alive = 1 AND updated_at < ? ORDER BY updated_at LIMIT 150`).bind(t - 50 * 6e4).all();
  const stmts = [];
  for (const r of results) {
    const row = { id: r.id, version: r.version, updatedAt: r.updated_at, sh: JSON.parse(r.state) };
    settle(row.sh, t);
    stmts.push(saveStmt(env, row, t), bestStmt(env, r.player_id, row.sh, t));
  }
  stmts.push(env.DB.prepare('DELETE FROM requests WHERE created_at < ?').bind(t - 2 * 864e5));
  stmts.push(env.DB.prepare('DELETE FROM ssv_log WHERE at < ?').bind(t - 7 * 864e5));
  await env.DB.batch(stmts);
  return results.length;
}

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req) });
    try {
      return json(req, await handle(req, env));
    } catch (e) {
      if (e instanceof HttpError) return json(req, { ok: false, error: e.code, msg: e.message }, e.status);
      console.error(e);
      return json(req, { ok: false, error: 'server_error', msg: '서버에 문제가 생겼어요' }, 500);
    }
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(settleStale(env).then(n => console.log(`settled ${n} sharks`)));
  },
};
