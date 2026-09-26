// ============================================================
//  functions/[[path]].js - 全局入口（Pages Functions catch-all）
//  /api/* 走 API 逻辑；其余路径全部放行给静态资源（env.ASSETS）
//  安全：HMAC-SHA256 签名 token + PBKDF2 密码哈希
// ============================================================

function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store'
        }
    });
}

function errorResponse(message, status = 400) {
    return jsonResponse({ error: message }, status);
}

function getTokenFromRequest(request) {
    const auth = request.headers.get('Authorization');
    if (auth && auth.startsWith('Bearer ')) return auth.substring(7);
    return null;
}

function isValidHttpUrl(u) {
    if (typeof u !== 'string' || u.length > 2048) return false;
    try {
        const parsed = new URL(u);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
        return false;
    }
}

// ---------- JWT 签名（HMAC-SHA256，base64url 编码） ----------
function b64urlEncode(buf) {
    const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(str) {
    str = str.replace(/-/g, '+').replace(/_/g, '/');
    while (str.length % 4) str += '=';
    const bin = atob(str);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
}

async function getHmacKey(env) {
    const secret = env.JWT_SECRET || 'insecure-default-change-me-via-pages-dashboard';
    return crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign', 'verify']
    );
}

async function signToken(payload, env) {
    const data = new TextEncoder().encode(JSON.stringify(payload));
    const sig = await crypto.subtle.sign('HMAC', await getHmacKey(env), data);
    return b64urlEncode(data) + '.' + b64urlEncode(sig);
}

async function verifyToken(token, env) {
    if (!token || token.indexOf('.') === -1) return null;
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    try {
        const data = b64urlDecode(parts[0]);
        const sig = b64urlDecode(parts[1]);
        const ok = await crypto.subtle.verify('HMAC', await getHmacKey(env), sig, data);
        if (!ok) return null;
        const payload = JSON.parse(new TextDecoder().decode(data));
        if (payload.exp && payload.exp < Date.now()) return null;
        return payload;
    } catch {
        return null;
    }
}

// ---------- 密码哈希（PBKDF2-SHA256，兼容旧明文自动升级） ----------
async function hashPassword(password) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(password),
        { name: 'PBKDF2' },
        false,
        ['deriveBits']
    );
    const bits = await crypto.subtle.deriveBits(
        { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
        keyMaterial,
        256
    );
    return 'pbkdf2$' + b64urlEncode(salt) + '$' + b64urlEncode(bits);
}

async function verifyPassword(password, stored) {
    if (!stored) return false;
    if (stored.startsWith('pbkdf2$')) {
        const parts = stored.split('$');
        if (parts.length !== 3) return false;
        try {
            const salt = b64urlDecode(parts[1]);
            const keyMaterial = await crypto.subtle.importKey(
                'raw',
                new TextEncoder().encode(password),
                { name: 'PBKDF2' },
                false,
                ['deriveBits']
            );
            const bits = await crypto.subtle.deriveBits(
                { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
                keyMaterial,
                256
            );
            return b64urlEncode(bits) === parts[2];
        } catch {
            return false;
        }
    }
    // 旧明文密码（首次登录成功后自动升级为哈希）
    return stored === password;
}

// ============================================================
//  登录接口
// ============================================================
async function handleLogin(request, env) {
    try {
        const { username, password } = await request.json();
        if (!username || !password) return errorResponse('用户名和密码不能为空');

        const user = await env.DB.prepare('SELECT * FROM users WHERE username = ?').bind(username).first();

        // 新用户：注册，存密码哈希
        if (!user) {
            const hash = await hashPassword(password);
            const result = await env.DB.prepare(
                'INSERT INTO users (username, password, role) VALUES (?, ?, ?)'
            ).bind(username, hash, 'user').run();
            const newUser = { id: result.meta.last_row_id, username, role: 'user' };
            const token = await signToken({
                userId: newUser.id,
                username: newUser.username,
                role: newUser.role,
                exp: Date.now() + 7 * 24 * 60 * 60 * 1000
            }, env);
            return jsonResponse({ token, user: newUser });
        }

        // 老用户：验证密码（兼容旧明文，成功后自动升级）
        const ok = await verifyPassword(password, user.password);
        if (!ok) return errorResponse('密码错误', 401);

        // 明文自动升级为 PBKDF2
        if (!user.password.startsWith('pbkdf2$')) {
            const newHash = await hashPassword(password);
            await env.DB.prepare('UPDATE users SET password = ? WHERE id = ?').bind(newHash, user.id).run();
        }

        const userInfo = { id: user.id, username: user.username, role: user.role };
        const token = await signToken({
            userId: userInfo.id,
            username: userInfo.username,
            role: userInfo.role,
            exp: Date.now() + 7 * 24 * 60 * 60 * 1000
        }, env);
        return jsonResponse({ token, user: userInfo });
    } catch (e) {
        console.error('login failed', e);
        return errorResponse('登录失败', 500);
    }
}

// ============================================================
//  业务路由（与之前一致，仅 verifyToken 改 await）
// ============================================================
async function handleSort(request, env, userId, id) {
    try {
        const { sort_order } = await request.json();
        const existing = await env.DB.prepare('SELECT * FROM links WHERE id = ? AND user_id = ?').bind(id, userId).first();
        if (!existing) return errorResponse('链接不存在', 404);
        await env.DB.prepare('UPDATE links SET sort_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?')
            .bind(sort_order, id, userId).run();
        return jsonResponse({ success: true });
    } catch (e) {
        console.error('sort failed', e);
        return errorResponse('更新排序失败', 500);
    }
}

const MAX_LINKS_RETURN = 5000;

async function handleGetLinks(request, env, userId) {
    try {
        const url = new URL(request.url);
        const sortBy = url.searchParams.get('sort') || 'sort_order';
        const order = url.searchParams.get('order') || 'ASC';
        const allowedSortFields = ['sort_order', 'click_count', 'created_at', 'title'];
        const finalSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'sort_order';
        const finalOrder = order.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
        const sql = `SELECT * FROM links WHERE user_id = ? ORDER BY ${finalSortBy} ${finalOrder} LIMIT ${MAX_LINKS_RETURN}`;
        const links = await env.DB.prepare(sql).bind(userId).all();
        return jsonResponse(links.results);
    } catch (e) {
        console.error('getLinks failed', e);
        return errorResponse('获取链接失败', 500);
    }
}

async function handlePostLinks(request, env, userId) {
    try {
        const { title, url, icon, icon_url, tags, sort_order } = await request.json();
        if (!title || !url) return errorResponse('标题和 URL 不能为空');
        if (!isValidHttpUrl(url)) return errorResponse('URL 必须以 http:// 或 https:// 开头');
        const tagsStr = tags ? JSON.stringify(tags) : '[]';
        const result = await env.DB.prepare(
            'INSERT INTO links (user_id, title, url, icon, icon_url, tags, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).bind(userId, title, url, icon || '', icon_url || '', tagsStr, sort_order || 0).run();
        const newLink = await env.DB.prepare('SELECT * FROM links WHERE id = ?').bind(result.meta.last_row_id).first();
        return jsonResponse(newLink, 201);
    } catch (e) {
        console.error('postLink failed', e);
        return errorResponse('添加失败', 500);
    }
}

async function handlePutLink(request, env, userId, id) {
    try {
        const { title, url, icon, icon_url, tags, sort_order } = await request.json();
        if (!isValidHttpUrl(url)) return errorResponse('URL 必须以 http:// 或 https:// 开头');
        const existing = await env.DB.prepare('SELECT * FROM links WHERE id = ? AND user_id = ?').bind(id, userId).first();
        if (!existing) return errorResponse('链接不存在', 404);
        const tagsStr = tags ? JSON.stringify(tags) : '[]';
        await env.DB.prepare(
            `UPDATE links SET title = ?, url = ?, icon = ?, icon_url = ?, tags = ?, sort_order = ?, updated_at = CURRENT_TIMESTAMP
             WHERE id = ? AND user_id = ?`
        ).bind(title, url, icon || '', icon_url || '', tagsStr, sort_order || 0, id, userId).run();
        return jsonResponse({ success: true });
    } catch (e) {
        console.error('putLink failed', e);
        return errorResponse('更新失败', 500);
    }
}

async function handleDeleteLink(request, env, userId, id) {
    try {
        const existing = await env.DB.prepare('SELECT * FROM links WHERE id = ? AND user_id = ?').bind(id, userId).first();
        if (!existing) return errorResponse('链接不存在', 404);
        await env.DB.prepare('DELETE FROM links WHERE id = ? AND user_id = ?').bind(id, userId).run();
        return jsonResponse({ success: true });
    } catch (e) {
        console.error('deleteLink failed', e);
        return errorResponse('删除失败', 500);
    }
}

async function handleExport(request, env, userId) {
    try {
        const links = await env.DB.prepare(
            'SELECT id, title, url, icon, icon_url, tags, sort_order FROM links WHERE user_id = ? ORDER BY sort_order ASC'
        ).bind(userId).all();
        const data = links.results.map(item => ({ ...item, tags: item.tags ? JSON.parse(item.tags) : [] }));
        return jsonResponse(data);
    } catch (e) {
        console.error('export failed', e);
        return errorResponse('导出失败', 500);
    }
}

async function handleImport(request, env, userId) {
    try {
        const data = await request.json();
        if (!Array.isArray(data) || data.length === 0) return errorResponse('数据格式错误，需要非空数组', 400);
        if (data.length > 3000) return errorResponse('单次导入不能超过3000条', 400);

        const existing = await env.DB.prepare('SELECT url FROM links WHERE user_id = ?').bind(userId).all();
        const existingUrls = new Set(existing.results.map(r => r.url));

        const validItems = [];
        let skipCount = 0;
        for (const item of data) {
            if (!item.title || !item.url) continue;
            if (!isValidHttpUrl(item.url)) continue;
            if (existingUrls.has(item.url)) { skipCount++; continue; }
            const tagsStr = Array.isArray(item.tags) ? JSON.stringify(item.tags) : '[]';
            validItems.push({
                user_id: userId, title: item.title, url: item.url,
                icon: item.icon || '', icon_url: item.icon_url || '',
                tags: tagsStr, sort_order: item.sort_order || item.sort || 0
            });
            existingUrls.add(item.url);
        }

        if (validItems.length === 0) {
            return jsonResponse({ success: true, total: data.length, successCount: 0, skipCount, errorCount: 0, message: '没有新数据需要导入' });
        }

        const BATCH_SIZE = 100;
        let successCount = 0;
        const errors = [];
        for (let i = 0; i < validItems.length; i += BATCH_SIZE) {
            const batch = validItems.slice(i, i + BATCH_SIZE);
            const placeholders = batch.map(() => '(?, ?, ?, ?, ?, ?, ?)').join(', ');
            const sql = `INSERT INTO links (user_id, title, url, icon, icon_url, tags, sort_order) VALUES ${placeholders}`;
            const params = [];
            for (const item of batch) params.push(item.user_id, item.title, item.url, item.icon, item.icon_url, item.tags, item.sort_order);
            try {
                await env.DB.prepare(sql).bind(...params).run();
                successCount += batch.length;
            } catch (e) {
                for (const item of batch) {
                    try {
                        await env.DB.prepare('INSERT INTO links (user_id, title, url, icon, icon_url, tags, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)')
                            .bind(item.user_id, item.title, item.url, item.icon, item.icon_url, item.tags, item.sort_order).run();
                        successCount++;
                    } catch (err) {
                        errors.push(item.url);
                    }
                }
            }
        }
        return jsonResponse({ success: true, total: data.length, successCount, skipCount, errorCount: errors.length, errors: errors.slice(0, 10) });
    } catch (e) {
        console.error('import failed', e);
        return errorResponse('批量导入失败', 500);
    }
}

const TAGS_CACHE_TTL = 60;

async function handleGetTags(env, userId, ctx) {
    try {
        const cacheKey = 'https://tag-cache.local/user/' + userId;
        const cache = caches.default;
        const hit = await cache.match(cacheKey);
        if (hit) return hit;

        const links = await env.DB.prepare('SELECT tags FROM links WHERE user_id = ?').bind(userId).all();
        const tagCount = {};
        links.results.forEach(item => {
            if (item.tags) {
                try {
                    JSON.parse(item.tags).forEach(tag => { if (tag) tagCount[tag] = (tagCount[tag] || 0) + 1; });
                } catch (e) {}
            }
        });
        const sortedTags = Object.keys(tagCount).sort((a, b) => tagCount[b] - tagCount[a] || a.localeCompare(b));
        const body = JSON.stringify(sortedTags);
        const resp = new Response(body, {
            headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=' + TAGS_CACHE_TTL }
        });
        ctx.waitUntil(cache.put(cacheKey, resp.clone()));
        return resp;
    } catch (e) {
        console.error('getTags failed', e);
        return errorResponse('获取标签失败', 500);
    }
}

async function handleGetTagOrder(env, userId) {
    try {
        const result = await env.DB.prepare('SELECT tag_order FROM tag_orders WHERE user_id = ?').bind(userId).first();
        if (!result) return jsonResponse([]);
        try { return jsonResponse(JSON.parse(result.tag_order)); } catch { return jsonResponse([]); }
    } catch (e) {
        console.error('getTagOrder failed', e);
        return errorResponse('获取排序失败', 500);
    }
}

async function handlePostTagOrder(request, env, userId) {
    try {
        const { tags } = await request.json();
        if (!Array.isArray(tags)) return errorResponse('tags 必须是数组', 400);
        const tagOrder = JSON.stringify(tags);
        await env.DB.prepare(
            `INSERT INTO tag_orders (user_id, tag_order, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
             ON CONFLICT(user_id) DO UPDATE SET tag_order = ?, updated_at = CURRENT_TIMESTAMP`
        ).bind(userId, tagOrder, tagOrder).run();
        return jsonResponse({ success: true });
    } catch (e) {
        console.error('postTagOrder failed', e);
        return errorResponse('保存排序失败', 500);
    }
}

async function handleGetTagPasswords(env, userId) {
    try {
        const results = await env.DB.prepare('SELECT tag_name, password_hash FROM tag_passwords WHERE user_id = ?').bind(userId).all();
        return jsonResponse(results.results);
    } catch (e) {
        console.error('getTagPasswords failed', e);
        return errorResponse('加载密码失败', 500);
    }
}

async function handlePostTagPasswords(request, env, userId) {
    try {
        const { passwords } = await request.json();
        await env.DB.prepare('DELETE FROM tag_passwords WHERE user_id = ?').bind(userId).run();
        for (const [tagName, hash] of Object.entries(passwords)) {
            if (hash && hash.trim() !== '') {
                await env.DB.prepare('INSERT INTO tag_passwords (tag_name, password_hash, user_id) VALUES (?, ?, ?)')
                    .bind(tagName, hash, userId).run();
            }
        }
        return jsonResponse({ success: true });
    } catch (e) {
        console.error('postTagPasswords failed', e);
        return errorResponse('保存密码失败', 500);
    }
}

async function handleDeleteTagPassword(request, env, userId, tagName) {
    try {
        await env.DB.prepare('DELETE FROM tag_passwords WHERE tag_name = ? AND user_id = ?')
            .bind(decodeURIComponent(tagName), userId).run();
        return jsonResponse({ success: true });
    } catch (e) {
        console.error('deleteTagPassword failed', e);
        return errorResponse('删除密码失败', 500);
    }
}

async function handleAdminUsers(request, env, userId, userRole) {
    if (userRole !== 'admin') return errorResponse('需要管理员权限', 403);
    const method = request.method;
    if (method === 'GET') {
        const users = await env.DB.prepare('SELECT id, username, role, created_at FROM users').all();
        return jsonResponse(users.results);
    }
    if (method === 'POST') {
        try {
            const { username, password } = await request.json();
            if (!username || !password) return errorResponse('用户名和密码不能为空');
            const existing = await env.DB.prepare('SELECT * FROM users WHERE username = ?').bind(username).first();
            if (existing) return errorResponse('用户已存在', 409);
            const hash = await hashPassword(password);
            await env.DB.prepare('INSERT INTO users (username, password, role) VALUES (?, ?, ?)').bind(username, hash, 'user').run();
            return jsonResponse({ success: true });
        } catch (e) {
            console.error('createUser failed', e);
            return errorResponse('创建失败', 500);
        }
    }
    return errorResponse('Method not allowed', 405);
}

// ============================================================
//  favicon 代理（A7，公开路由，不需要 token）
// ============================================================
function isInternalHost(host) {
    host = String(host || '').toLowerCase().replace(/\.$/, '');
    if (!host || host === 'localhost') return true;
    if (/\.(local|internal|lan|test|home\.arpa|invalid)$/.test(host)) return true;
    const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (m) {
        const a = +m[1], b = +m[2];
        if (a === 0 || a === 10 || a === 127) return true;
        if (a === 169 && b === 254) return true;
        if (a === 172 && b >= 16 && b <= 31) return true;
        if (a === 192 && b === 168) return true;
        if (a === 100 && b >= 64 && b <= 127) return true;
        if (a >= 224) return true;
    }
    if (host.includes(':')) {
        const h = host.split('%')[0].replace(/^\[|\]$/g, '');
        if (/^(::1|fe80:|fec0:|fc|fd)/i.test(h)) return true;
    }
    return false;
}

async function handleFavicon(request, env, ctx) {
    const url = new URL(request.url);
    const domain = (url.searchParams.get('domain') || '')
        .trim().toLowerCase().replace(/^www\./, '').replace(/:\d+$/, '');
    if (!domain || isInternalHost(domain)) {
        return new Response('invalid domain', { status: 400 });
    }
    const cacheKey = 'https://favicon-cache.local/' + domain;
    const cache = caches.default;
    const hit = await cache.match(cacheKey);
    if (hit) return hit;
    try {
        const upstream = 'https://www.google.com/s2/favicons?domain=' + encodeURIComponent(domain) + '&sz=64';
        const upstreamResp = await fetch(upstream, {
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NavFavicon/1.0)' },
            cf: { cacheTtl: 2592000, cacheEverything: true }
        });
        const body = await upstreamResp.arrayBuffer();
        const resp = new Response(body, {
            status: upstreamResp.status,
            headers: {
                'Content-Type': upstreamResp.headers.get('Content-Type') || 'image/png',
                'Cache-Control': 'public, max-age=2592000'
            }
        });
        ctx.waitUntil(cache.put(cacheKey, resp.clone()));
        return resp;
    } catch (e) {
        return new Response('upstream error', { status: 502 });
    }
}

// ============================================================
//  边缘测速（A8，需要 token）
// ============================================================
const SPEEDTEST_MAX_URLS = 50;
const SPEEDTEST_CONCURRENCY = 10;
const SPEEDTEST_TIMEOUT_MS = 4000;

async function handleSpeedtest(request) {
    let payload;
    try { payload = await request.json(); }
    catch { return errorResponse('bad request', 400); }
    const urls = [...new Set(
        (Array.isArray(payload.urls) ? payload.urls : [])
            .filter(u => typeof u === 'string' && /^https?:\/\//i.test(u))
    )].slice(0, SPEEDTEST_MAX_URLS);
    const results = new Map();
    let cursor = 0;
    async function worker() {
        while (cursor < urls.length) {
            const target = urls[cursor++];
            const start = Date.now();
            try {
                const ctrl = new AbortController();
                const timer = setTimeout(() => ctrl.abort(), SPEEDTEST_TIMEOUT_MS);
                const resp = await fetch(target, {
                    method: 'GET', redirect: 'follow', signal: ctrl.signal,
                    headers: { 'Range': 'bytes=0-0', 'User-Agent': 'Mozilla/5.0' },
                    cf: { cache: 'no-store' }
                });
                clearTimeout(timer);
                results.set(target, { url: target, ok: resp.ok, status: resp.status, ms: Date.now() - start });
                resp.body?.cancel?.();
            } catch (e) {
                results.set(target, { url: target, ok: false, status: 0, ms: Date.now() - start });
            }
        }
    }
    const workers = Array.from({ length: Math.min(SPEEDTEST_CONCURRENCY, urls.length || 1) }, () => worker());
    await Promise.all(workers);
    return new Response(JSON.stringify({ results: [...results.values()] }), {
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
    });
}

export async function onRequest(context) {
    const { request, env } = context;
    const ctx = context;
    {
        const url = new URL(request.url);
        const path = url.pathname;
        const method = request.method;

        // 非 /api/ 路径 → 放行静态资源
        if (!path.startsWith('/api/')) {
            return env.ASSETS.fetch(request);
        }

        // favicon 代理（公开，不需要 token）
        if (path === '/api/favicon' && method === 'GET') {
            return handleFavicon(request, env, ctx);
        }

        // 登录接口
        if (path === '/api/auth/login' && method === 'POST') {
            return handleLogin(request, env);
        }

        const token = getTokenFromRequest(request);
        if (!token) return errorResponse('请先登录', 401);
        const payload = await verifyToken(token, env);
        if (!payload) return errorResponse('token 无效或已过期', 401);
        const userId = payload.userId;
        const userRole = payload.role;

        // 边缘测速（需要 token）
        if (path === '/api/speedtest' && method === 'POST') {
            return handleSpeedtest(request);
        }

        if (path.match(/^\/api\/links\/\d+\/sort$/) && method === 'PUT') {
            return handleSort(request, env, userId, parseInt(path.split('/')[3]));
        }
        if (path === '/api/links/export' && method === 'GET') return handleExport(request, env, userId);
        if (path === '/api/links/import' && method === 'POST') return handleImport(request, env, userId);
        if (path.match(/^\/api\/links\/\d+$/) && method === 'PUT') return handlePutLink(request, env, userId, parseInt(path.split('/')[3]));
        if (path.match(/^\/api\/links\/\d+$/) && method === 'DELETE') return handleDeleteLink(request, env, userId, parseInt(path.split('/')[3]));
        if (path === '/api/links' && method === 'GET') return handleGetLinks(request, env, userId);
        if (path === '/api/links' && method === 'POST') return handlePostLinks(request, env, userId);
        if (path === '/api/tags' && method === 'GET') return handleGetTags(env, userId, ctx);
        if (path === '/api/tags/order' && method === 'GET') return handleGetTagOrder(env, userId);
        if (path === '/api/tags/order' && method === 'POST') return handlePostTagOrder(request, env, userId);
        if (path === '/api/tag-passwords' && method === 'GET') return handleGetTagPasswords(env, userId);
        if (path === '/api/tag-passwords' && method === 'POST') return handlePostTagPasswords(request, env, userId);
        if (path.match(/^\/api\/tag-passwords\/.+/)) return handleDeleteTagPassword(request, env, userId, path.replace('/api/tag-passwords/', ''));
        if (path.startsWith('/api/admin/users')) return handleAdminUsers(request, env, userId, userRole);

        return errorResponse('接口不存在', 404);
    }
};
