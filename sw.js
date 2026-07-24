// ============================================================
//  Service Worker - PWA 离线缓存
// ============================================================

const CACHE_NAME = 'my-nav-v2';
const STATIC_CACHE = 'my-nav-static-v2';

// 需要缓存的资源（去掉可能不存在的 manifest.json）
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/api.js',
  '/auth.js',
  '/admin.js',
  '/worker.js',        // 🔥 新增：测速 Worker
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
      // 🔥 新增：如果某个资源加载失败，不阻塞安装
      .catch(err => {
        console.warn('PWA: 部分资源缓存失败，继续安装', err);
        return self.skipWaiting();
      })
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

  // 🔥 CDN 资源：优先缓存（不需要每次都重新下载）
  if (url.hostname.includes('cdn.jsdelivr.net')) {
    event.respondWith(
      caches.match(event.request)
        .then(cached => {
          if (cached) return cached;
          return fetch(event.request).then(response => {
            return caches.open(STATIC_CACHE).then(cache => {
              cache.put(event.request, response.clone());
              return response;
            });
          });
        })
    );
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

  // 静态资源：缓存优先，后台更新
  if (url.pathname.match(/\.(css|js|json|png|jpg|jpeg|svg|gif|ico)$/)) {
    event.respondWith(
      caches.match(event.request)
        .then(cached => {
          if (cached) {
            // 后台更新
            fetch(event.request).then(response => {
              if (response && response.status === 200) {
                caches.open(STATIC_CACHE).then(cache => {
                  cache.put(event.request, response);
                });
              }
            }).catch(() => {});
            return cached;
          }
          return fetch(event.request).then(response => {
            if (response && response.status === 200) {
              return caches.open(STATIC_CACHE).then(cache => {
                cache.put(event.request, response.clone());
                return response;
              });
            }
            return response;
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
        if (response && response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseClone);
          });
        }
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
