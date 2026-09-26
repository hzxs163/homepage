// ============================================================
//  Service Worker - PWA 离线缓存
//  v4: 静态资源网络优先（更新即生效），离线回退缓存
// ============================================================

const CACHE_NAME = 'my-nav-v4';
const STATIC_CACHE = 'my-nav-static-v4';
const STATIC_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 天

// 需要预缓存的核心资源
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/api.js',
  '/auth.js',
  '/admin.js',
  '/manifest.json',
  '/favicon.svg'
];

// 安装：预缓存核心资源
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// 激活：清理旧版本缓存
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
          .filter(name => name !== STATIC_CACHE && name !== CACHE_NAME)
          .map(name => caches.delete(name))
      );
    })
    .then(() => self.clients.claim())
  );
});

// 判断是否为静态资源
function isStaticAsset(url) {
  return url.pathname.match(/\.(css|js|json|png|jpg|jpeg|svg|gif|ico|webp|woff2?)$/);
}

// 拦截请求
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // 只处理 GET
  if (event.request.method !== 'GET') return;

  // API 请求：直接走网络，不缓存
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // 静态资源：网络优先（更新后立即生效），失败回退缓存
  if (isStaticAsset(url)) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(STATIC_CACHE).then(cache => {
              cache.put(event.request, clone);
            });
          }
          return response;
        })
        .catch(() => {
          return caches.match(event.request)
            .then(cached => cached || caches.match('/index.html'));
        })
    );
    return;
  }

  // HTML 页面：网络优先，失败回退缓存
  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, clone);
          });
        }
        return response;
      })
      .catch(() => {
        return caches.match(event.request)
          .then(cached => cached || caches.match('/index.html'));
      })
  );
});
