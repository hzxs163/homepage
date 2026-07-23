// ============================================================
//  Service Worker - PWA 离线缓存
// ============================================================

const CACHE_NAME = 'my-nav-v1';
const STATIC_CACHE = 'my-nav-static-v1';

// 需要缓存的资源
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/api.js',
  '/auth.js',
  '/admin.js',
  '/manifest.json',
  'https://cdn.jsdelivr.net/npm/sortablejs@1.15.0/Sortable.min.js'
];

// 安装：缓存静态资源
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => {
        console.log('PWA: 缓存静态资源');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => self.skipWaiting())
  );
});

// 激活：清理旧缓存
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

// 拦截请求：缓存优先策略
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // 跳过非 GET 请求
  if (event.request.method !== 'GET') return;

  // 跳过 CDN 资源（让浏览器自己处理）
  if (url.hostname.includes('cdn.jsdelivr.net')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // 跳过 API 请求（保持实时性）
  if (url.pathname.includes('/api/')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // 跳过 Cloudflare Workers 的请求
  if (url.hostname.includes('workers.dev')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // 静态资源：缓存优先
  if (url.pathname.match(/\.(css|js|json|png|jpg|jpeg|svg|gif|ico)$/)) {
    event.respondWith(
      caches.match(event.request)
        .then(cached => {
          if (cached) {
            // 后台更新
            fetch(event.request).then(response => {
              caches.open(STATIC_CACHE).then(cache => {
                cache.put(event.request, response);
              });
            }).catch(() => {});
            return cached;
          }
          return fetch(event.request).then(response => {
            return caches.open(STATIC_CACHE).then(cache => {
              cache.put(event.request, response.clone());
              return response;
            });
          });
        })
        .catch(() => {
          return caches.match('/index.html');
        })
    );
    return;
  }

  // HTML 页面：网络优先，失败回退到缓存
  event.respondWith(
    fetch(event.request)
      .then(response => {
        // 缓存最新版本
        const responseClone = response.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, responseClone);
        });
        return response;
      })
      .catch(() => {
        return caches.match(event.request)
          .then(cached => {
            if (cached) return cached;
            return caches.match('/index.html');
          });
      })
  );
});