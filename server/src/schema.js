/* D1 테이블 구조. 첫 요청 때(isolate마다 한 번) 버전을 확인해 없으면 만든다.
   구조를 바꿀 때는 SCHEMA_VERSION을 올리고 MIGRATIONS에 단계를 추가한다(이미 있는 단계는 고치지 않는다). */
const MIGRATIONS = [
  // v1
  [
    `CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL)`,
    // 플레이어(지금은 기기별 게스트). 토큰은 SHA-256 해시만 저장한다.
    `CREATE TABLE IF NOT EXISTS players (
      id TEXT PRIMARY KEY,
      token_hash TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL,
      best_len REAL NOT NULL DEFAULT 0,
      best_name TEXT,
      best_days INTEGER NOT NULL DEFAULT 0,
      ad_day TEXT NOT NULL DEFAULT '',
      ad_used INTEGER NOT NULL DEFAULT 0
    )`,
    `CREATE INDEX IF NOT EXISTS players_best ON players(best_len DESC)`,
    // 상어. 게임 상태 전체는 state(JSON), 랭킹·조회용 값은 열로 따로 둔다. version은 동시 수정 방지용.
    `CREATE TABLE IF NOT EXISTS sharks (
      id TEXT PRIMARY KEY,
      player_id TEXT NOT NULL,
      name TEXT NOT NULL,
      alive INTEGER NOT NULL,
      len REAL NOT NULL,
      born INTEGER NOT NULL,
      died_at INTEGER,
      reason TEXT,
      rank_off INTEGER NOT NULL DEFAULT 0,
      state TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS sharks_player ON sharks(player_id, alive, died_at DESC)`,
    `CREATE INDEX IF NOT EXISTS sharks_rank ON sharks(alive, rank_off, len DESC)`,
    `CREATE INDEX IF NOT EXISTS sharks_stale ON sharks(alive, updated_at)`,
    // 플레이어당 살아 있는 상어는 1마리, 살아 있는 상어끼리 이름은 겹치지 않는다
    `CREATE UNIQUE INDEX IF NOT EXISTS sharks_one_alive ON sharks(player_id) WHERE alive = 1`,
    `CREATE UNIQUE INDEX IF NOT EXISTS sharks_alive_name ON sharks(name) WHERE alive = 1`,
    // 같은 요청이 두 번 와도 한 번만 처리하기 위한 기록 (2일 뒤 정리)
    `CREATE TABLE IF NOT EXISTS requests (
      player_id TEXT NOT NULL,
      req_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      response TEXT NOT NULL,
      PRIMARY KEY (player_id, req_id)
    )`,
    `CREATE INDEX IF NOT EXISTS requests_created ON requests(created_at)`
  ],
  // v2: 광고 쿨타임 — 마지막 광고 보상 시각
  [
    `ALTER TABLE players ADD COLUMN ad_last INTEGER NOT NULL DEFAULT 0`
  ]
];
export const SCHEMA_VERSION = MIGRATIONS.length;

let ready = null;
export function ensureSchema(env) {
  if (!ready) {
    ready = (async () => {
      let cur = 0;
      try { cur = +(await env.DB.prepare(`SELECT v FROM meta WHERE k = 'schema'`).first('v')) || 0; } catch (e) { cur = 0; }
      for (let v = cur; v < MIGRATIONS.length; v++) {
        await env.DB.batch([
          ...MIGRATIONS[v].map(s => env.DB.prepare(s)),
          env.DB.prepare(`INSERT OR REPLACE INTO meta (k, v) VALUES ('schema', ?)`).bind(String(v + 1))
        ]);
      }
    })().catch(e => { ready = null; throw e; });
  }
  return ready;
}
