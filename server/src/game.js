/* =========================================================
   상어집사 게임 엔진 (서버 권위)
   index.html의 정산·행동 로직을 화면 코드 없이 옮긴 것.
   - 시간(t)은 밀리초 타임스탬프로 바깥에서 넣어 준다 (서버는 Date.now()).
   - 확률 판정은 rnd()로 한다 (서버는 crypto 난수, 테스트는 고정값).
   - 화면 효과(말풍선·알림·애니메이션)는 결과 객체로 돌려주고, 그리는 건 클라이언트가 한다.
   밸런스 값을 바꾸면 index.html의 DEFAULTS와 함께 맞춘다(화면을 서버 값으로 전환하기 전까지).
   ========================================================= */
export const CFG = Object.freeze({
  startLen: 30, maxDailyGrowth: 3, sizeDamp: 250, noGrowthBelowSatiety: 10,
  decayPerH: { satiety: 4.2, exercise: 3.4, affection: 3.0 },
  // 몸집 단계(stages)별 배부름 감소 배율: 클수록 빨리 배고파진다
  satietyStageMul: [1, 1.15, 1.3, 1.45],
  poopEveryH: 1.5, poopMax: 5, poopAffDecay: 0.6, poopGrowthPenaltyPct: 8,
  poopSickMul: 2,
  poopSatietyCost: 2,   // 똥이 1개 생길 때마다 배부름 감소(소화)
  poopGainMul: 0.5,
  illness: { name: '병', poopAt: 4, petsToCure: 5, cureAffection: 30, deathH: 18, extendHPerProg: 2,
    hungerBelow: 10, hungerH: 3, cureSatiety: 30 },
  starveDeathH: 24, allZeroDeathH: 8, stepMin: 10, maxSettleDays: 14,
  actions: {
    feed:  { cdMin: 0,  gain: 10 },
    swim:  { cdMin: 45, cdStepMin: 1, cdFloorMin: 5, gain: 10, satietyCost: 5 },
    pet:   { cdMin: 3,  gain: 10, perHourCap: 6 },
    clean: { cdMin: 0,  affPerPoop: 5 }
  },
  effectDurMin: 5,
  effects: {
    feed: { name: '배탈',   chance: 8,  satiety: 15, exercise: 0,  affection: 5,  keepGain: false },
    swim: { name: '타박상', chance: 10, satiety: 0,  exercise: 15, affection: 5,  keepGain: false },
    pet:  { name: '손물림', chance: 6,  satiety: 0,  exercise: 0,  affection: 20, keepGain: false }
  },
  food: { max: 10, regenMin: 10 },
  // 광고 보상: 먹이 adFood개를 더해 준다(최대치를 넘어 쌓임). 먹이가 food.max개 미만일 때만 볼 수 있고,
  // 마지막 광고 후 adCdMin분 쿨타임(먹이가 많아 못 보는 동안에도 쿨타임은 흐른다)
  adFood: 10, adCdMin: 60,
  stages: [ [0,'아기'], [100,'성장기'], [200,'대형'], [300,'거대'] ]
});

export const ACTIONS = ['feed', 'swim', 'pet', 'clean'];
const STAT_NAME = { satiety: '배부름', exercise: '운동', affection: '애정' };
const EFFECT_UI = {
  feed: { icon: '🤢', msgs: ['꾸르륵… 배탈이 났어요', '먹자마자 배가 아파요…'] },
  swim: { icon: '🩹', msgs: ['쿵! 바위에 부딪혀 타박상을 입었어요', '아야, 지느러미를 부딪혔어요'] },
  pet:  { icon: '🦷', msgs: ['앗, 손을 덥석 물었어요! 미안해요…', '깜짝 놀라서 깨물어 버렸어요'] }
};

export const clamp = (v, a = 0, b = 100) => Math.max(a, Math.min(b, v));
const fmtProg = v => (Math.round(v * 10) / 10).toString();

export function stageOf(len) { let i = 0; CFG.stages.forEach((s, k) => { if (len >= s[0]) i = k; }); return i; }
export function efficiency(sh) {
  const st = [sh.satiety, sh.exercise, sh.affection];
  const avg = (st[0] + st[1] + st[2]) / 3, mn = Math.min(...st);
  if (sh.satiety < CFG.noGrowthBelowSatiety) return 0;
  const e = (0.2 + 0.8 * avg / 100) * (0.5 + 0.5 * mn / 100);
  return e * Math.max(0, 1 - CFG.poopGrowthPenaltyPct / 100 * sh.poop);
}
export const growthPerDay = sh => CFG.maxDailyGrowth * efficiency(sh) / (1 + Math.max(0, sh.len - CFG.startLen) / CFG.sizeDamp);
export const daysAlive = (sh, t) => Math.floor(((sh.alive ? t : sh.diedAt) - sh.born) / 864e5);

export function newShark(name, t) {
  return { name, born: t, lastSim: t, lastCare: t, alive: true, len: CFG.startLen, satiety: 80, exercise: 60, affection: 70,
    poop: 0, poopT: 0, food: CFG.food.max, foodT: t, starveH: 0, zeroH: 0, cd: {}, pets: [], ail: {}, ill: null,
    lowSatH: 0, swimN: 0, rankOff: false };
}

/* 정산: 마지막 정산 시각부터 t까지 10분 단위로 시뮬레이션 (결정적 — 난수 없음) */
export function settle(sh, t) {
  if (!sh || !sh.alive) return sh;
  regenFood(sh, t);
  const step = CFG.stepMin * 6e4;
  let from = Math.max(sh.lastSim, t - CFG.maxSettleDays * 864e5);
  while (from + step <= t && sh.alive) { tick(sh, CFG.stepMin / 60, from + step); from += step; }
  const rest = (t - from) / 36e5; if (rest > 0 && sh.alive) tick(sh, rest, t);
  for (const a in (sh.ail || {})) if (sh.ail[a].until <= t) delete sh.ail[a];
  sh.lastSim = Math.max(sh.lastSim, t);
  return sh;
}

/* 먹이 충전: foodT = 다음 1개를 충전하기 시작한 시각. 가득 차 있으면 충전 시계는 멈춰 있다 */
export function regenFood(sh, t) {
  const F = CFG.food, iv = F.regenMin * 6e4;
  if (sh.food == null) { sh.food = F.max; sh.foodT = t; }
  if (sh.food >= F.max) { sh.foodT = t; return; }   // 최대치 이상(광고로 쌓인 먹이)이면 충전만 멈춘다 — 깎지 않음
  const n = Math.floor((t - sh.foodT) / iv);
  if (n > 0) { sh.food = Math.min(F.max, sh.food + n); sh.foodT = sh.food >= F.max ? t : sh.foodT + n * iv; }
}
export const foodLeft = (sh, t) => sh.food >= CFG.food.max ? 0 : Math.max(0, sh.foodT + CFG.food.regenMin * 6e4 - t);

export function tick(sh, h, at) {
  const d = CFG.decayPerH, satMul = (CFG.satietyStageMul || [])[stageOf(sh.len)] ?? 1;
  sh.len += growthPerDay(sh) / 24 * h;
  sh.satiety = clamp(sh.satiety - d.satiety * satMul * h);
  sh.exercise = clamp(sh.exercise - d.exercise * h);
  sh.affection = clamp(sh.affection - (d.affection + CFG.poopAffDecay * sh.poop) * h);
  const segFrom = at - h * 36e5;
  let sickH = 0;
  for (const a in (sh.ail || {})) {
    const A = sh.ail[a], o = Math.min(at, A.until) - Math.max(segFrom, A.from);
    if (o > 0) { for (const k in A.rate) sh[k] = clamp(sh[k] - A.rate[k] * o); if (a === 'feed') sickH = o / 36e5; }
  }
  sh.poopT += h + sickH * (CFG.poopSickMul - 1);
  while (sh.poopT >= CFG.poopEveryH) {
    sh.poopT -= CFG.poopEveryH;
    if (sh.poop < CFG.poopMax && sh.satiety > 5) { sh.poop++; sh.satiety = clamp(sh.satiety - (CFG.poopSatietyCost || 0)); if (sh.poop >= CFG.illness.poopAt && !sh.ill) startIll(sh, at, 'poop'); }
  }
  sh.lowSatH = sh.satiety < CFG.illness.hungerBelow ? (sh.lowSatH || 0) + h : 0;
  if (sh.lowSatH >= CFG.illness.hungerH && !sh.ill) startIll(sh, at, 'hunger');
  sh.starveH = sh.satiety <= 0 ? sh.starveH + h : Math.max(0, sh.starveH - h * 2);
  sh.zeroH = (sh.satiety <= 0 && sh.exercise <= 0 && sh.affection <= 0) ? sh.zeroH + h : 0;
  if (sh.starveH >= CFG.starveDeathH) die(sh, at, '배고픔을 너무 오래 참았어요');
  else if (sh.zeroH >= CFG.allZeroDeathH) die(sh, at, '오랫동안 아무도 돌봐주지 않았어요');
  else if (sh.ill) {
    if (!sh.ill.deadline) sh.ill.deadline = sh.ill.since + CFG.illness.deathH * 36e5;
    if (at >= sh.ill.deadline) die(sh, sh.ill.deadline, `${CFG.illness.name}을 이겨내지 못했어요`);
  }
}
export function startIll(sh, at, cause) { sh.ill = { since: at, prog: 0, seen: false, cause, deadline: at + CFG.illness.deathH * 36e5 }; }
const illHunger = sh => !!(sh.ill && sh.ill.cause === 'hunger');
function cureIfReady(sh, res) {
  const I = CFG.illness; if (!sh.ill || sh.ill.prog < I.petsToCure) return false;
  if (illHunger(sh) && sh.satiety < I.cureSatiety) return false;
  sh.ill = null; sh.affection = clamp(sh.affection + I.cureAffection);
  res.toasts.push(`${I.name}이 나았어요! 애정 +${I.cureAffection}`); res.cured = true; return true;
}
function die(sh, at, reason) { sh.alive = false; sh.diedAt = at; sh.reason = reason; }

/* 쿨타임 길이(ms). 수영은 지금까지 수영한 횟수(swimN)에 따라 짧아진다 */
export function cdMs(sh, a) {
  const A = CFG.actions[a];
  if (a === 'swim') { const n = sh.swimN || 0; return Math.max(A.cdFloorMin, A.cdMin - Math.max(0, n - 1) * A.cdStepMin) * 6e4; }
  return A.cdMin * 6e4;
}
export const cdLeft = (sh, a, t) => Math.max(0, (sh.cd[a] || 0) + cdMs(sh, a) - t);

/* 상태 이상 시작. 이미 같은 상태면 남은 감소치에 새 감소치를 더하고 시간을 다시 effectDurMin분으로 */
function startAil(sh, a, E, t) {
  const dur = CFG.effectDurMin * 6e4; sh.ail = sh.ail || {};
  const cur = sh.ail[a], rate = {}, drops = [];
  ['satiety', 'exercise', 'affection'].forEach(k => {
    const v = +E[k] || 0; let rem = v;
    if (cur && cur.until > t) rem += (cur.rate[k] || 0) * (cur.until - t);
    if (rem > 0) rate[k] = rem / dur;
    if (v > 0) drops.push(`${STAT_NAME[k]} -${v}`);
  });
  sh.ail[a] = { from: t, until: t + dur, rate };
  return drops;
}

/* 행동. 먼저 settle(sh,t)를 해 둔 상태여야 한다.
   결과: { ok, error?, msg, fx, cls, toasts[], effect? } — ok는 행동이 실제로 적용됐는지(청소 포함) */
export function act(sh, a, t, rnd = Math.random) {
  const pick = arr => arr[Math.floor(rnd() * arr.length)];
  const res = { ok: false, msg: '', fx: '', cls: '', toasts: [] };
  if (!ACTIONS.includes(a)) { res.error = 'bad_action'; return res; }
  if (!sh.alive) { res.error = 'dead'; return res; }
  const left = cdLeft(sh, a, t);
  if (left > 0) { res.error = 'cooldown'; res.cdLeftMs = left; return res; }
  const A = CFG.actions[a], E = CFG.effects[a];
  let ok = false;
  if (a === 'feed') {
    if (sh.food <= 0) res.msg = '먹이가 다 떨어졌어요. 충전을 기다려 주세요';
    else if (sh.satiety >= 95) res.msg = '배불러서 더 못 먹어요';
    else { ok = true; sh.food--; res.fx2 = 'pellets'; }
  } else if (a === 'swim') {
    if (sh.satiety < A.satietyCost + 2) res.msg = '배고파서 헤엄칠 힘이 없어요';
    else ok = true;
  } else if (a === 'pet') {
    sh.pets = (sh.pets || []).filter(x => t - x < 36e5);
    if (sh.pets.length >= A.perHourCap) res.msg = '지금은 조금 쉬고 싶어요';
    else ok = true;
  } else if (a === 'clean') {
    if (sh.poop === 0) res.msg = '깨끗해요!';
    else { sh.affection = clamp(sh.affection + A.affPerPoop * sh.poop); res.msg = `${sh.poop}개 치웠어요. 상쾌해요!`; sh.poop = 0; res.fx = '✨'; sh.lastCare = t; res.ok = true; }
  }
  if (ok) {
    res.ok = true;
    const bad = E && E.chance > 0 && rnd() * 100 < E.chance;
    sh.cd[a] = t; sh.lastCare = t;
    if (a === 'swim') sh.swimN = (sh.swimN || 0) + 1;
    if (!bad || E.keepGain) {
      const m = sh.poop > 0 ? CFG.poopGainMul : 1;
      if (a === 'feed') { sh.satiety = clamp(sh.satiety + A.gain * m); res.msg = pick(['냠냠! 맛있어요', '오물오물…', '최고의 정어리!']); res.fx = '🐟'; res.cls = 'chomp'; }
      if (a === 'swim') { sh.exercise = clamp(sh.exercise + A.gain * m); sh.satiety = clamp(sh.satiety - A.satietyCost); res.msg = pick(['슝— 한 바퀴!', '지느러미 운동 완료', '더 빨라진 것 같아요']); res.fx = '💨'; res.cls = 'dash'; }
      if (a === 'pet' && !sh.ill) { const n = sh.pets.length; sh.affection = clamp(sh.affection + A.gain * Math.pow(0.7, n) * m); res.msg = n < 2 ? pick(['헤헤, 간지러워요', '좋아요!', '더 쓰다듬어 줘요']) : '고마워요 (조금 덜 신나요)'; res.fx = '💗'; res.cls = 'wiggle'; }
      if (m < 1) res.msg = pick(['똥 냄새 때문에 집중이 안 돼요…', '먼저 청소해 주면 좋겠어요', '으… 주변이 더러워서 반만 신나요']);
      if (a === 'pet' && sh.ill) {
        const I = CFG.illness, add = Math.max(0, Math.min(m, I.petsToCure - sh.ill.prog)); res.cls = 'wiggle';
        sh.ill.prog += add;
        sh.ill.deadline = (sh.ill.deadline || sh.ill.since + I.deathH * 36e5) + add * I.extendHPerProg * 36e5;
        if (cureIfReady(sh, res)) { res.msg = '다 나았어요! 정말 고마워요'; res.fx = '💖'; }
        else if (sh.ill.prog >= I.petsToCure) { res.msg = `쓰다듬기는 충분해요! 배부름 ${I.cureSatiety} 이상 먹으면 나을 것 같아요 (지금 ${Math.round(sh.satiety)})`; res.fx = '🩺'; }
        else { res.msg = (m < 1 ? `똥 때문에 반만 나았어요… (${fmtProg(sh.ill.prog)}/${I.petsToCure})` : `끙… 조금 나아졌어요 (${fmtProg(sh.ill.prog)}/${I.petsToCure})`) + ` · 버틸 시간 +${fmtProg(add * I.extendHPerProg)}시간`; res.fx = '🩺'; }
      }
      if (a === 'feed' && illHunger(sh)) {
        if (cureIfReady(sh, res)) { res.msg = '배도 부르고 다 나았어요! 고마워요'; res.fx = '💖'; }
        else if (sh.satiety < CFG.illness.cureSatiety) res.msg = `조금 기운이 나요… (배부름 ${Math.round(sh.satiety)}/${CFG.illness.cureSatiety})`;
      }
    }
    if (a === 'pet') sh.pets.push(t);
    if (bad) {
      const drops = startAil(sh, a, E, t);
      res.msg = pick(EFFECT_UI[a].msgs); res.fx = EFFECT_UI[a].icon; res.cls = 'hurt';
      res.effect = { action: a, name: E.name, drops };
      res.toasts.push(`${E.name}! ${CFG.effectDurMin}분 동안 ${drops.join(' · ') || '스탯 변화 없음'}`);
      if (a === 'pet') res.fx2 = 'blood';
    }
  }
  return res;
}

/* 광고 보상: 먹이를 최대치까지 채운다 */
export function adRefill(sh, t) { sh.food += CFG.adFood; if (sh.food >= CFG.food.max) sh.foodT = t; }
