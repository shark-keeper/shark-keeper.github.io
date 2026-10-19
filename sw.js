/* 상어집사 서비스 워커
   - 게임 화면(HTML)과 같은 사이트 파일은 "네트워크 우선": 온라인이면 항상 최신 배포본을 받고,
     오프라인일 때만 마지막으로 받아 둔 사본을 쓴다. 밸런스 값을 고쳐 push하면 바로 반영된다.
   - 도트 글꼴(fonts/)은 사이트 파일이라 미리 받아 둔다. (예전 Google Fonts 캐시 처리는 남겨 둠)
   - 캐시 구조를 바꿀 때만 VERSION을 올린다(평소 배포에는 손대지 않아도 된다). */
const VERSION = 'v1';
const CORE = `bk-core-${VERSION}`;
const FONTS = `bk-fonts-${VERSION}`;
const PRECACHE = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-48.png',
  './fonts/Galmuri11.woff2',
  './fonts/Galmuri11-Bold.woff2',
  './fonts/Galmuri14.woff2'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CORE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('bk-') && k !== CORE && k !== FONTS).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function networkFirst(req) {
  const cache = await caches.open(CORE);
  try {
    const res = await fetch(req, { cache: 'no-cache' });
    if (res.ok) cache.put(req.mode === 'navigate' ? './index.html' : req, res.clone());
    return res;
  } catch (err) {
    const hit = req.mode === 'navigate'
      ? (await cache.match('./index.html')) || (await cache.match('./'))
      : await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    throw err;
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(FONTS);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
  return res;
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) { e.respondWith(networkFirst(req)); return; }
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') { e.respondWith(cacheFirst(req)); }
});
