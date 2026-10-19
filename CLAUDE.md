# 부캉고치 (가칭 '부캉이 키우기') — 작업 안내

다마고치형 상어 육성 모바일 웹게임. 엔딩 없이 몸길이(cm)로 경쟁한다.

- 배포 주소: https://shark-keeper.github.io/ (예전 `bukanggochi.github.io`는 더 이상 쓰지 않는다 — 서버 CORS도 새 주소만 허용)
- 저장소: `shark-keeper/shark-keeper.github.io` (GitHub Pages, `main` 브랜치 루트)
- 게임 이름 '부캉이'는 상표 검토 전 가칭. 브랜드명은 `DEFAULTS.brandName` 한 곳에서 바꾼다.

## 파일 구조

- `index.html` — 게임 전체 (HTML + CSS + JS 한 파일, 외부 의존성 없음)
- **도트(픽셀) 스타일**(2026-10-18, 컬러 도트로 결정): 그림은 `index.html`의 `/* ===== 도트 그림 시작 … 끝 ===== */` 구간 — `pixelShark(stage,mood,ail)`가 28×20 격자(몸통·머리 타원+꼬리·지느러미 삼각형, 외곽선 자동)에 표정·상태 이상을 픽셀로 덧그리고, `pixelSVG`가 `<rect>` 묶음 SVG로 그린다. `sharkSVG(stage,mood,size,ail)`는 이 구간의 진입점(크기는 28의 배수로 반올림). 똥 `poopSVG`, 행동·탭·묘비 아이콘 `pxIcon(name,size)`(12×12, `PX_ICONS`). 화면은 계단 모서리 테두리(`--pxb`/`--pxb2`, 요소별 `--bc`로 색 변경), 칸 나뉜 스탯 바, `steps()` 애니메이션.
- `fonts/` — 한글 도트 글꼴 Galmuri(OFL 1.1, `fonts/OFL.md` 동봉 필수). KS X 1001 한글 2,350자 + 영문·기호만 남겨 줄인 woff2: `Galmuri14`(본문 14px), `Galmuri11`/`Galmuri11-Bold`(제목·숫자 11/22/33px). 이 밖의 글자는 기본 글꼴로 표시. 서비스 워커가 미리 받아 둔다.
- `manifest.json`, `sw.js`, `icons/` — PWA(홈 화면 설치·오프라인 실행). 서비스 워커는 같은 사이트 파일을 **네트워크 우선**으로 받으므로 `index.html`만 고쳐 push해도 바로 반영된다. 캐시 구조를 바꿀 때만 `sw.js`의 `VERSION`을 올린다.
- 아이콘(`icons/`, `flutter_app/assets/icon/`)은 도트 그림 구간의 `sharkSVG(1,'ok')`(성장기 상어)를 줄무늬 바다 배경에 그려 만든 PNG다(웹 아이콘은 계단 모서리). 상어 디자인을 바꾸면 아이콘도 다시 생성한다.
- 빌드 단계 없음. 파일을 고쳐서 push하면 1~2분 뒤 배포 주소에 반영된다.
- `flutter_app/` — 배포 주소를 WebView로 띄우는 Flutter 래퍼 앱(앱 ID `io.github.sharkkeeper`, Dart 패키지 이름 `sharkkeeper`, 게임 주소는 `flutter_app/lib/config.dart`의 `kGameUrl`/`kGameHost`). `_config.yml`에서 Pages 배포 대상에서 제외. 처음엔 사용자 PC에서 `dart run tool/setup.dart`로 android/ios 폴더를 만든다(이 작업 환경에서는 Flutter SDK·pub.dev 접근 불가라 빌드 불가). 서명 키(`key.properties`, `*.jks`)는 절대 커밋하지 않는다.
- 브랜드명을 바꿀 때는 `DEFAULTS.brandName` 외에 `index.html`의 `<title>`·`apple-mobile-web-app-title`, `manifest.json`의 `name`/`short_name`, `flutter_app/lib/config.dart`의 `kAppTitle`, `flutter_app/tool/setup.dart`의 `kDisplayName`도 함께 바꾼다.

## 작업 방식 (사용자와 합의된 규칙)

- **여러 세션이 동시에 이 저장소를 고친다.** 그래서 어느 세션이든 파일을 고치기 전과 push하기 직전에 항상 최신 `main`을 받는다:
  1. 작업(설정값 수정 포함)을 시작하기 전에 `git fetch origin main && git rebase origin/main`으로 최신 상태를 받고, 그 위에서 고친다. 이 파일(CLAUDE.md)도 바뀌었을 수 있으니 받은 뒤 다시 읽는다.
  2. 커밋 후 push 직전에 다시 `git fetch origin main && git rebase origin/main`을 하고 push한다.
  3. rebase 충돌이 나면 다른 세션의 변경을 지우지 않고 양쪽 의도를 모두 살려 합친다. 판단이 어려우면 사용자에게 묻는다. `git push --force`는 쓰지 않는다.
  4. push가 거절되면(다른 세션이 먼저 push) 2번부터 다시 한다.
- 사용자가 "배탈 확률 12%로"처럼 말하면 **`server/src/game.js`의 `CFG`** 값을 고쳐 커밋하고 `main`에 push한다. Cloudflare가 서버를 다시 배포하면(1~2분) 모든 플레이어 화면에 다음 접속부터 적용된다. 반영 확인은 `https://shark-keeper-api.shark-keeper.workers.dev/api/config`.
- 밸런스 값은 **서버(`server/src/game.js`의 `CFG`) 한 곳에만** 있다. 화면(`index.html`)은 시작할 때 `GET /api/config`로 받아 `CFG`에 넣고(4초 제한), 받은 값을 localStorage `shark-keeper-cfg`에 보관해 서버에 닿지 않으면 그 값으로 실행한다. 보관값도 없으면 "바다에 연결하지 못했어요" 안내(`#ovCfg`, 다시 시도). `index.html`의 `DEFAULTS`에는 화면 전용 값(`brandName`)만, `API_BASE`는 서버 주소. 관리자 탭은 제거했고 브라우저의 옛 설정(`S.cfg`)은 무시하고 지운다.
- UI 문구는 한국어. 모바일 세로 화면 우선, 밝은 바다 블루 톤.
- 커밋 작성자는 `Claude <noreply@anthropic.com>`.
- push 후 https://shark-keeper.github.io/?source=app 을 열어 반영됐는지 확인한다(주소에 `?source=app`이 없으면 웹 차단 화면이 나온다).

## 현재 게임 규칙 (`server/src/game.js`의 `CFG`)

- 시작 30cm, 최상 상태 하루 최대 +3cm, 몸집이 클수록 완만히 감속 (`sizeDamp` 250)
- 성장 효율 = `(0.2 + 0.8*평균/100) * (0.5 + 0.5*최소/100) * (1 - 똥개수*8%)`, 배부름 10 미만이면 성장 정지
- 시간당 감소: 배부름 4.2 / 운동 3.4 / 애정 3.0. 오프라인 시간은 10분 단위 구간 시뮬레이션으로 정산
- 배부름 감소는 몸집 단계별 배율(`satietyStageMul`): 아기 1.0 / 성장기 1.15 / 대형 1.3 / 거대 1.45 (단계는 그 구간 시작 시 몸길이 기준)
- 먹이 충전(`CFG.food`): 최대 10개, 10개 미만이면 10분마다 1개 충전. 먹이 1회에 1개 소모, 쿨타임 없음
- 행동: 먹이(배부름+10, 먹이 1개) / 수영(운동+10, 배부름-5) / 쓰다듬기(애정+10, 연속 시 감쇠, 3분, 시간당 6회) / 청소(똥 1개당 애정+5)
- 수영 쿨타임: 첫 수영 후 45분, 수영할 때마다 1분씩 줄어 최소 5분 (상어별 수영 횟수 `sh.swimN`, 새 상어면 다시 45분부터)
- 똥: 1.5시간마다 생성(상어 나이 기준 타이머, 청소해도 초기화 안 됨), 최대 5개, 생성 시점 배부름 5 이하면 건너뜀. 똥이 1개 생길 때마다 배부름 -2(`poopSatietyCost`, 소화)
- 배탈 중에는 똥 타이머가 2배속(`poopSickMul`) — 배탈 5분이면 타이머 10분 진행
- 병(`CFG.illness`, 상어별 `sh.ill`, `sh.ill.cause`): 두 가지 원인 — ① 똥이 4개째 생기는 순간(`poop`) ② 배부름 10 미만이 연속 3시간(`hunger`, `sh.lowSatH`, 10 이상이 되면 초기화). 이미 아프면 무시. 굶주림 병은 쓰다듬기 진행도 5 **+ 배부름 30 이상**이 모두 충족돼야 완치(먹이로 30을 넘기는 순간에도 완치 확인, 라벨 `굶주림 병`). 진행도가 꽉 찬 뒤 쓰다듬기는 기한을 늘리지 않음. 시간 제한 없이 쓰다듬기 치료 진행도 5가 되면 완치 — 똥이 있으면 1회=0.5. 아픈 동안 쓰다듬기는 애정 0, 완치 시 애정 +30. 손물림이 나면 그 쓰다듬기는 진행도 없음. 발병 후 18시간(`deathH`) 안에 못 고치면 사망("병을 이겨내지 못했어요"), 치료 진행도 0.5마다 사망 시각 +1시간(`extendHPerProg` 2 = 진행도 1당 2시간, `sh.ill.deadline`) — 마지막 청소 후 약 22.5~24시간에 사망하는 구조. 상단 라벨 `🤒 병 1.5/5 · 남은시간`, 쓰다듬기 버튼 `치료 x/5`, 상어는 질끈 감은 눈·체온계·빨간 볼·이마 그늘선(얼굴 우선순위: 손물림 > 병 > 배탈)
- 똥이 1개라도 있으면 먹이·수영·쓰다듬기 회복량 절반(`poopGainMul` 0.5). 수영의 배부름 소모·악효과 감소치는 그대로
- 사망: 배부름 0 누적 24시간, 세 스탯 모두 0 누적 8시간, 또는 병 기한 초과
- 광고 보상(목업): 하루 3회, 먹이를 최대치(10개)까지 채움. 먹이가 가득 차 있으면 광고 버튼 비활성. 성장 배수 없음

### 돌봄 악효과 (`CFG.effects`)

| 행동 | 악효과 | 확률 | 감소치 | keepGain |
|---|---|---|---|---|
| feed | 배탈 | 8% | 배부름 -15, 애정 -5 | false |
| swim | 타박상 | 10% | 운동 -15, 애정 -5 | false |
| pet | 손물림 | 6% | 애정 -20 | false |

`keepGain: false`면 악효과가 날 때 그 행동의 회복은 적용하지 않는다.

악효과는 즉시 깎지 않고 **상태 이상**이 된다 (`CFG.effectDurMin` 5분, 상어별 `sh.ail`):
- 지속 시간 동안 감소치가 일정한 속도로 서서히 빠진다(정산 `tick`에서 구간 겹침만큼). 같은 상태가 다시 걸리면 남은 감소치에 새 감소치를 더해 시간을 다시 5분으로.
- 육성 화면 상단(생존일·순위 칩 아래)에 아이콘 라벨 + 남은 시간(분:초) 표시.
- 상어 모습(`sharkSVG`의 `ail` 인자): 배탈 = 홀쭉한 배·반쯤 감긴 눈·다크서클·창백한 초록빛, 타박상 = 반창고 여러 개·눈가 보라색 멍, 손물림 = 걱정 눈썹·글썽이는 눈·홍조(미안한 표정). 얼굴 우선순위는 손물림 > 배탈 > 시무룩 > 보통이고, 반창고·멍·홀쭉한 배는 겹쳐 그린다.
- 손물림은 물린 순간에만 상어 입가 물에 피가 번지는 이펙트(`bloodFx`).

## 현재 한계

- 저장은 각 브라우저 localStorage(`bukangi-proto-v2`)에만 된다. 서버 없음.
- 랭킹의 다른 상어 20마리는 예시 데이터(`makeRivals`). 플레이어끼리 랭킹은 공유되지 않는다.
- 육성 화면의 "시간 빨리 감기"는 테스트용. 서버가 생기면 제거한다.

## 다음 단계 후보

1. ~~PWA화~~ (완료)
2. 공유 랭킹용 API 서버 — **Cloudflare Workers + D1. ①②③ 완료(아래 "API 서버" 절), 다음은 ④ 화면 전환**. 서버 권위 모델: 클라이언트는 행동만 보내고 정산·확률 판정·사망·랭킹은 서버에서. 계획:
   - 무료 플랜 기준(2026-10 확인): Workers 하루 요청 10만·요청당 CPU 10ms, D1 하루 읽기 500만 행·쓰기 10만 행·저장 5GB. 2026-09부터 D1 한도 초과 시 쿼리 에러(UTC 자정=한국 오전 9시 해제). DAU 약 500~1,000명까지 무료로 예상. PHP 불가라 Laravel 대신 Workers(JS).
   - 순서: ① 사용자가 Cloudflare 계정 생성 + 배포 연결 ② `server/` 폴더에 Workers + D1 프로젝트(스키마, API: 상어 조회·생성/행동/랭킹, `settle`·`tick`·`act` 로직을 서버로 이전, 중복 요청 방지) ③ wrangler 로컬 모드로 테스트 ④ 화면을 API 사용으로 전환(처음엔 기기별 게스트 토큰, 기존 localStorage 상어 서버로 이전) ⑤ 공유 랭킹 연결, `makeRivals`·시간 빨리 감기 제거
   - 배포 연결은 **Cloudflare Workers Builds(GitHub 앱 연동)**로 결정: Cloudflare가 `main` push를 감지해 `server/`를 빌드·배포한다(API 토큰·GitHub Secrets 불필요). Worker 이름은 `shark-keeper-api`이고 `server/wrangler.jsonc`의 `name`과 반드시 같아야 한다. 대시보드 설정: Root directory `server`, Deploy command `npx wrangler deploy`, Build watch paths `server/*`. 서버 CORS 허용 주소는 `server/src/index.js`의 `ALLOWED_ORIGINS`. 토큰·비밀값은 절대 코드에 넣지 않는다(필요하면 `wrangler secret`).
   - **연결 완료(2026-10-15)**: API 주소 `https://shark-keeper-api.shark-keeper.workers.dev` (`/health`가 `{ok:true, db:true}`면 Worker·D1 정상). D1 데이터베이스 `shark-keeper`(ID는 `server/wrangler.jsonc`, 바인딩 `DB`, 테이블은 `server/src/schema.js`가 자동 생성). Cloudflare 빌드가 Cloning 단계에서 실패하면 대개 일시 오류라 대시보드에서 Retry build.
   - `server/`도 `_config.yml`의 Pages 제외 목록에 추가한다.
3. 스토어 앱: **Flutter WebView로 결정**. 래퍼 앱 프로젝트는 `flutter_app/` (iOS는 웹 래퍼 반려 위험 있음)

## API 서버 (`server/`, Cloudflare Workers + D1)

- 주소: `https://shark-keeper-api.shark-keeper.workers.dev` — `main`에 push하면 Cloudflare Workers Builds가 `server/`만 배포(빌드 감시 경로 `server/*`).
- 파일: `src/game.js`(게임 엔진: `CFG`·`settle`·`tick`·`act` — index.html 로직을 화면 코드 없이 옮김, 시간·난수를 인자로 받음), `src/index.js`(라우트·DB), `src/schema.js`(테이블 — 첫 요청 때 자동 생성, 바꿀 땐 `MIGRATIONS`에 단계 추가).
- **밸런스 값은 `src/game.js`의 `CFG` 한 곳**(화면은 `/api/config`로 받아 씀). 다만 화면의 정산·행동 로직(`settle`/`tick`/`act`)은 아직 `index.html`에도 있으니, 규칙(계산 방식)을 바꿀 때는 두 엔진을 함께 고치고 비교 테스트를 돌린다(화면이 서버 API로 전환되면 화면 쪽 로직은 표시용으로만 남는다).
- 서버 엔진과 화면 로직이 같은지는 무작위·장기(5일) 시나리오로 비교 검증함. 엔진을 고치면 같은 비교를 다시 돌린다.
- 인증: `POST /api/guest`가 기기별 게스트 토큰(`sk_...`)을 한 번만 내려주고, 이후 `Authorization: Bearer <토큰>`. DB에는 토큰의 SHA-256만 저장.
- 상태를 바꾸는 요청은 `reqId`(8~64자, 영문·숫자·`_-`)를 함께 보내면 같은 요청이 두 번 와도 한 번만 처리하고 처음 응답을 돌려준다(`replay: true`). 동시 요청은 상어 행의 `version`으로 충돌을 막고 최대 5번 재시도, 그래도 안 되면 409 `busy`.
- 오류 응답: `{ ok:false, error:<코드>, msg:<한국어 문구> }` (401 no_token/bad_token, 400 bad_name/bad_action/bad_req_id, 404 no_shark, 409 has_shark/name_taken/already_imported/busy).

| API | 내용 |
|---|---|
| `GET /health` | 서버·DB 연결 확인 `{ok, db}` |
| `GET /api/config` | 게임 설정값(`CFG`) + `adsMode`(`test`/`ssv`) |
| `POST /api/guest` | 게스트 플레이어 생성 → `{token, playerId}` |
| `GET /api/me` | 내 정보 + 지금 상어(서버 시각으로 정산) + 떠난 상어 기록(최근 20) |
| `POST /api/shark` `{name}` | 입양(이름 1~10자, 살아 있는 상어끼리 이름 중복 불가, 플레이어당 살아 있는 상어 1마리) |
| `POST /api/shark/action` `{action}` | `feed`/`swim`/`pet`/`clean`. 응답: `ok`, `msg`(말풍선), `fx`(이모지), `fx2`(`pellets`/`blood`), `cls`(애니메이션), `toasts[]`, `effect`(악효과), `error`(`cooldown`+`cdLeftMs`, `dead`), `shark` |
| `POST /api/shark/ad` | 광고 보상(앱이 직접 보고): 먹이 가득(한국 날짜 기준 하루 3회). 광고 시청을 서버가 확인 못 하는 경로라 `ADS_MODE`가 `ssv`면 403 `ad_unverified` |
| `GET /api/admob/ssv` | **AdMob 서버가 호출하는** 보상형 광고 서버 측 검증 콜백. 서명(ECDSA P-256, 구글 공개키 `verifier-keys.json`, 12시간 캐시)을 확인하고 `user_id`(=플레이어 ID)에게 지급, `transaction_id`로 중복 방지(`requests`에 `ssv_<tx>`). 서명이 틀리면 403, 맞으면 결과와 상관없이 200(구글 재전송 방지) |
| `GET /api/rank?type=alive\|all` | 살아 있는 상어 / 플레이어별 역대 최고, 상위 50 + 토큰이 있으면 `me`(내 순위) |
| `POST /api/import` `{shark, offsetMs}` | 브라우저(localStorage) 상어를 서버로 한 번 옮김. 값은 범위를 잘라서 받음(길이는 나이 대비 최대 성장량까지, 빨리 감기 시간은 되돌림) |

- `shark` 응답 = 저장 상태 전체 + `id`, `stage`, `days`, `growthPerDay`, `cdLeftMs{행동별}`, `foodLeftMs`. 함께 오는 `now`(서버 시각)로 화면 타이머를 맞춘다.
- 저장: `GET` 조회는 정산 결과를 30분에 한 번만 DB에 쓴다(정산은 결정적이라 다시 계산해도 같음 — 무료 쓰기 한도 절약). 매시 7분 cron이 50분 넘게 갱신 안 된 상어를 정산해 랭킹 길이·사망을 반영하고, 2일 지난 `requests` 기록을 지운다.
- 테이블: `players`(토큰 해시, 역대 최고, 광고 횟수), `sharks`(상태 JSON + 랭킹용 열 `alive`·`len`·`rank_off`, `version`), `requests`(중복 요청 응답 기록).
- 로컬 테스트: `cd server && npm install && npx wrangler dev --local` (로컬 D1 사용). 크론은 `/__scheduled?cron=7+*+*+*+*`(`--test-scheduled`).

## 광고 (AdMob 보상형, 2026-10-19 테스트 ID로 구현)

- 흐름: 화면 [광고 보기] → 앱 안이면 `SharkAds.postMessage({type:'rewarded', reqId, userId})` → Flutter `lib/ads.dart`(`AdsService`)가 보상형 광고 재생(동의 UMP → SDK 초기화 → 광고 1개 미리 로드) → `window.__sharkAdResult({status: earned|dismissed|failed|busy, message, reqId})`. 웹 브라우저(앱 아님)는 3초 목업.
- 지급: 지금 화면은 브라우저 저장소라 `grantAdReward()`가 로컬로 지급. 화면을 서버로 전환(④)할 때 `index.html`의 광고 보상 주석대로 바꾼다 — `ADS_MODE` `test`면 `POST /api/shark/ad`, `ssv`면 `/api/me`를 몇 번 다시 읽어 `player.ads.used` 증가 확인. 광고 요청에 `userId`=플레이어 ID 필수(SSV가 이 값으로 지급).
- 서버 `ADS_MODE`(`server/wrangler.jsonc`의 `vars`): `test`(기본, 앱 보고 인정 — **구글 테스트 광고 단위는 SSV 콜백을 보내지 않음**) / `ssv`(AdMob 서버 검증으로만 지급).
- 테스트 ID(구글 공개): 앱 ID는 `flutter_app/tool/setup.dart`(`kAdmobAppIdAndroid`/`kAdmobAppIdIos`, setup이 AndroidManifest·Info.plist에 넣음), 보상형 광고 단위는 `flutter_app/lib/config.dart`(`kRewardedUnitAndroid`/`kRewardedUnitIos`). 안드로이드 minSdk 23 이상으로 맞춤.
- **실제 광고로 바꿀 때 체크리스트**: ① AdMob 가입·앱 등록·보상형 광고 단위 생성 ② 위 4개 ID 교체 후 `dart run tool/setup.dart` 다시 실행 ③ AdMob 광고 단위의 서버 측 검증 URL에 `https://shark-keeper-api.shark-keeper.workers.dev/api/admob/ssv` 입력 ④ `ADS_MODE`를 `ssv`로 ⑤ 저장소 루트에 `app-ads.txt`(AdMob이 알려 주는 한 줄) 추가 ⑥ 스토어 출시 후 AdMob에서 스토어 연결 → 앱 심사(2~3일).
- **웹 브라우저 플레이는 막는다**(2026-10-19 결정, 광고 수익을 앱으로 모으기 위해): `index.html`의 `IS_APP`(앱 통로 `SharkAds`가 있거나 주소에 `?source=app`)이 아니면 `boot()`가 게임을 시작하지 않고 "앱에서 만나요!" 화면(`#ovWeb`, 스토어 버튼)을 띄운다. 스토어 주소는 `STORE_URLS`(비어 있으면 '준비 중'). 화면 쪽 차단이라 `?source=app`을 직접 붙이면 브라우저에서도 열린다 — 개발·테스트는 이 주소로 한다. 나중에 웹을 다시 열면 H5 Games Ads(신청·승인, 자체 도메인 유리) 검토.

## 보안 원칙

- 공개 저장소이므로 API 키·비밀번호 등 비밀값은 절대 `index.html`에 넣지 않는다.
- 라이선스 파일을 두지 않는다 (모든 권리 보유).
