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

// 缺失或过短的密钥一律拒绝签发/校验，避免仓库里的兜底常量被当作真实密钥使用
function getJwtSecret(env) {
    const secret = env.JWT_SECRET;
    return typeof secret === 'string' && secret.length >= 32 ? secret : null;
}

async function getHmacKey(env) {
    const secret = getJwtSecret(env);
    if (!secret) throw new Error('JWT_SECRET 未配置或长度不足 32 字符');
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
    if (!getJwtSecret(env)) return null;
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

// ---------- 标签密码（服务端加盐哈希 + 短期解锁凭证） ----------
const GRANT_HEADER = 'X-Tag-Grant';
// 凭证外泄后的可用窗口。前端闲置 5 分钟就会自动收回，所以这里不需要长
const GRANT_TTL_MS = 30 * 60 * 1000;

function parseTags(raw) {
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.filter(t => typeof t === 'string' && t) : [];
    } catch {
        return [];
    }
}

async function sha256Hex(text) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// 校验浏览器旧版本提交的无盐 SHA-256，通过后由调用方升级为服务端加盐哈希
async function verifyTagPassword(password, stored) {
    if (!stored) return { ok: false, needsUpgrade: false };
    if (stored.startsWith('pbkdf2$')) {
        const parts = stored.split('$');
        if (parts.length !== 3) return { ok: false, needsUpgrade: false };
        try {
            const salt = b64urlDecode(parts[1]);
            const keyMaterial = await crypto.subtle.importKey(
                'raw', new TextEncoder().encode(password), { name: 'PBKDF2' }, false, ['deriveBits']
            );
            const bits = await crypto.subtle.deriveBits(
                { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, keyMaterial, 256
            );
            return { ok: b64urlEncode(bits) === parts[2], needsUpgrade: false };
        } catch {
            return { ok: false, needsUpgrade: false };
        }
    }
    if (/^[0-9a-f]{64}$/i.test(stored)) {
        const ok = (await sha256Hex(password)) === stored;
        return { ok, needsUpgrade: ok };
    }
    return { ok: false, needsUpgrade: false };
}

async function getLockedTagNames(env, userId) {
    const rows = await env.DB.prepare('SELECT tag_name FROM tag_passwords WHERE user_id = ?').bind(userId).all();
    return rows.results.map(r => r.tag_name);
}

async function signGrant(userId, tags, env) {
    return signToken({
        kind: 'tag-grant',
        userId,
        tags,
        exp: Date.now() + GRANT_TTL_MS
    }, env);
}

async function readTagGrant(request, env, userId) {
    const raw = request.headers.get(GRANT_HEADER);
    if (!raw) return new Set();
    const payload = await verifyToken(raw, env);
    if (!payload || payload.kind !== 'tag-grant' || payload.userId !== userId) return new Set();
    return new Set(Array.isArray(payload.tags) ? payload.tags : []);
}

// ============================================================
//  登录接口
// ============================================================
const LOGIN_MAX_FAILURES = 8;
const LOGIN_WINDOW_MS = 10 * 60 * 1000;
const LOGIN_TRACKER_MAX = 5000;

// 计数保存在 isolate 内存中，只能抑制单实例上的暴力尝试，不是分布式限流。
// 需要更强保证时应接入 Turnstile。
const loginFailures = new Map();

function clientIp(request) {
    return (request.cf && request.cf.clientIp) || request.headers.get('CF-Connecting-IP') || 'unknown';
}

function loginThrottleKey(request, username) {
    return clientIp(request) + '|' + username.toLowerCase();
}

function isLoginThrottled(key, now) {
    const entry = loginFailures.get(key);
    if (!entry) return false;
    if (now - entry.firstAt > LOGIN_WINDOW_MS) {
        loginFailures.delete(key);
        return false;
    }
    return entry.count >= LOGIN_MAX_FAILURES;
}

function recordLoginFailure(key, now) {
    if (loginFailures.size > LOGIN_TRACKER_MAX) {
        for (const [k, v] of loginFailures) {
            if (now - v.firstAt > LOGIN_WINDOW_MS) loginFailures.delete(k);
        }
    }
    const entry = loginFailures.get(key);
    if (entry && now - entry.firstAt <= LOGIN_WINDOW_MS) entry.count++;
    else loginFailures.set(key, { firstAt: now, count: 1 });
}

async function handleLogin(request, env) {
    let body;
    try {
        body = await request.json();
    } catch {
        return errorResponse('请求体必须是合法 JSON', 400);
    }
    const username = typeof body.username === 'string' ? body.username.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    if (!username || !password) return errorResponse('用户名和密码不能为空', 400);

    const now = Date.now();
    const key = loginThrottleKey(request, username);
    if (isLoginThrottled(key, now)) return errorResponse('尝试次数过多，请稍后再试', 429);

    try {
        // 账号只能由管理员在后台创建，未知用户名不再自动注册
        const user = await env.DB.prepare('SELECT * FROM users WHERE username = ?').bind(username).first();
        if (!user) {
            recordLoginFailure(key, Date.now());
            return errorResponse('用户名或密码错误', 401);
        }

        const ok = await verifyPassword(password, user.password);
        if (!ok) {
            recordLoginFailure(key, Date.now());
            return errorResponse('用户名或密码错误', 401);
        }
        loginFailures.delete(key);

        // 明文自动升级为 PBKDF2
        if (!user.password.startsWith('pbkdf2$')) {
            const newHash = await hashPassword(password);
            await env.DB.prepare('UPDATE users SET password = ? WHERE id = ?').bind(newHash, user.id).run();
        }

        if (!getJwtSecret(env)) return errorResponse('服务器未配置 JWT_SECRET', 500);

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
        await touchLinksEpoch(env, userId);
        return jsonResponse({ success: true });
    } catch (e) {
        console.error('sort failed', e);
        return errorResponse('更新排序失败', 500);
    }
}

// 全量重排兜底：一个事务里写完，替代"逐条 await 发 N 个请求"
const SORT_BATCH_MAX = 2000;

async function handleSortBatch(request, env, userId) {
    let body;
    try {
        body = await request.json();
    } catch {
        return errorResponse('请求体必须是合法 JSON', 400);
    }
    const items = Array.isArray(body.items) ? body.items : null;
    if (!items) return errorResponse('items 必须是数组', 400);
    if (items.length > SORT_BATCH_MAX) return errorResponse('单次最多更新 ' + SORT_BATCH_MAX + ' 条排序', 400);

    const statements = [];
    for (const item of items) {
        const id = Number(item && item.id);
        const sortOrder = Number(item && item.sort_order);
        if (!Number.isInteger(id) || id <= 0 || !Number.isFinite(sortOrder)) continue;
        statements.push(
            env.DB.prepare('UPDATE links SET sort_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?')
                .bind(sortOrder, id, userId)
        );
    }
    if (statements.length === 0) return jsonResponse({ success: true, updated: 0 });

    try {
        const results = await env.DB.batch(statements);
        const updated = results.reduce((sum, r) => sum + (r && r.meta ? r.meta.changes : 0), 0);
        await touchLinksEpoch(env, userId);
        return jsonResponse({ success: true, updated });
    } catch (e) {
        console.error('sortBatch failed', e);
        return errorResponse('批量更新排序失败', 500);
    }
}

const MAX_LINKS_RETURN = 5000;
const LINKS_DEFAULT_LIMIT = 500;
const LINKS_MAX_LIMIT = 1000;
const IMPORT_MAX = 3000;
const IMPORT_CHUNK = 500;

// Cloudflare 边缘会把 ETag 改写成弱校验器（W/"..."），浏览器原样回传；
// 逐字符全等比较会永远失配，必须按 HTTP 语义剥离 W/ 并支持逗号列表与 *
function etagMatches(header, etag) {
    if (!header) return false;
    const strip = v => String(v).trim().replace(/^W\//i, '');
    const target = strip(etag);
    if (header.trim() === '*') return true;
    return header.split(',').some(value => strip(value) === target);
}

// 卡片只需要这些列；created_at / updated_at 不再随列表下发
const LINK_LIST_COLUMNS = 'id, title, url, icon, icon_url, tags, sort_order, click_count';

// 读 1568 行代价高（约 300ms），而它只被本人写操作改变。
// 用一行 epoch 参与缓存键，写操作自增即可精确失效。
// 读不到（迁移未执行）就退回"不缓存"；自增失败也只记日志——绝不能因为缓存优化而让写操作失败。
async function readLinksEpoch(env, userId) {
    try {
        const row = await env.DB.prepare('SELECT epoch FROM link_epochs WHERE user_id = ?').bind(userId).first();
        return row ? Number(row.epoch) || 0 : 0;
    } catch (e) {
        console.error('link_epochs 不可用，列表缓存已跳过', e);
        return null;
    }
}

async function touchLinksEpoch(env, userId) {
    try {
        await env.DB.prepare(
            'INSERT INTO link_epochs (user_id, epoch) VALUES (?, 1) ON CONFLICT(user_id) DO UPDATE SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP'
        ).bind(userId).run();
    } catch (e) {
        console.error('link_epochs 自增失败，列表缓存将在 TTL 后自行恢复', e);
    }
}

function shortFingerprint(value) {
    // 只用于拼缓存键，不需要密码学强度
    let h = 5381;
    const s = String(value);
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
    return h.toString(36);
}

async function handleGetLinks(request, env, ctx, userId) {
    try {
        const url = new URL(request.url);
        const sortBy = url.searchParams.get('sort') || 'sort_order';
        const order = url.searchParams.get('order') || 'ASC';
        const allowedSortFields = ['sort_order', 'click_count', 'created_at', 'title'];
        const finalSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'sort_order';
        const finalOrder = order.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

        // 可见集合由"哪些标签被锁 + 本次解锁了哪些"共同决定，两者都要进缓存键
        const lockedTags = await getLockedTagNames(env, userId);
        const unlocked = lockedTags.length > 0 ? await readTagGrant(request, env, userId) : new Set();
        const epoch = await readLinksEpoch(env, userId);
        const cacheKey = 'https://links-cache.local/v1/' + userId + '/' + finalSortBy + '/' + finalOrder + '/'
            + (epoch === null ? 'nocache' : epoch) + '/'
            + shortFingerprint([...lockedTags].sort().join('|') + '=>' + [...unlocked].sort().join('|'));
        const cache = epoch === null ? null : caches.default;
        let cached = null;
        let cacheState = 'off';
        if (cache) {
            try {
                cached = await cache.match(cacheKey);
                cacheState = cached ? 'hit' : 'miss';
            } catch (e) {
                console.error('links cache match 失败', e);
                cacheState = 'err';
            }
        }

        let body, etag;
        if (cached) {
            body = await cached.text();
            etag = cached.headers.get('ETag');
        } else {
            const sql = `SELECT ${LINK_LIST_COLUMNS} FROM links WHERE user_id = ? ORDER BY ${finalSortBy} ${finalOrder} LIMIT ${MAX_LINKS_RETURN}`;
            const links = await env.DB.prepare(sql).bind(userId).all();
            const visible = links.results.filter(row => {
                if (lockedTags.length === 0) return true;
                return !parseTags(row.tags).some(tag => lockedTags.includes(tag) && !unlocked.has(tag));
            });
            // 标签由服务端解析成数组，浏览器不必再逐条 JSON.parse
            body = JSON.stringify(visible.map(row => ({ ...row, tags: parseTags(row.tags) })));
            etag = '"sha256-' + (await sha256Hex(body)).slice(0, 32) + '"';
            if (cache) {
                ctx.waitUntil(cache.put(cacheKey, new Response(body, {
                    headers: { ETag: etag, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=60' },
                })).catch(e => console.error('links cache put 失败', e)));
            }
        }

        const outHeaders = { ETag: etag, 'X-Links-Cache': cacheState };

        // 整份列表只缓存一份，分页只是它的切片：ETag 始终代表全量，
        // 因此客户端拿"全量 ETag"复验命中 304 时，等价于"整份都没变"，可继续用本地完整快照
        if (etagMatches(request.headers.get('If-None-Match'), etag)) {
            return new Response(null, { status: 304, headers: { ...outHeaders, 'Cache-Control': 'private, no-store' } });
        }

        let payloadBody = body;
        if (url.searchParams.get('limit') !== null || url.searchParams.get('offset') !== null) {
            const limit = Math.max(1, Math.min(Number(url.searchParams.get('limit')) || LINKS_DEFAULT_LIMIT, LINKS_MAX_LIMIT));
            const offset = Math.max(0, Number(url.searchParams.get('offset')) || 0);
            let rows;
            try {
                rows = JSON.parse(body);
            } catch {
                rows = [];
            }
            payloadBody = JSON.stringify(rows.slice(offset, offset + limit));
            outHeaders['X-Links-Total'] = String(rows.length);
            outHeaders['X-Links-Offset'] = String(offset);
            outHeaders['X-Links-Limit'] = String(limit);
        }

        return new Response(payloadBody, {
            status: 200,
            headers: { ...outHeaders, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store' },
        });
    } catch (e) {
        console.error('getLinks failed', e);
        return errorResponse('获取链接失败', 500);
    }
}

// 给前端轮询"有没有新收藏"用：只回版本号，不碰 links 表
async function handleLinksEpoch(env, userId) {
    const epoch = await readLinksEpoch(env, userId);
    return new Response(JSON.stringify({ epoch }), {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' }
    });
}

async function handlePostLinks(request, env, userId) {
    let body;
    try {
        body = await request.json();
    } catch {
        return errorResponse('请求体必须是合法 JSON', 400);
    }
    const { title, url, icon, icon_url, tags, sort_order } = body || {};
    if (!title || !url) return errorResponse('标题和 URL 不能为空', 400);
    if (!isValidHttpUrl(url)) return errorResponse('URL 必须以 http:// 或 https:// 开头', 400);
    try {
        const tagsStr = tags ? JSON.stringify(tags) : '[]';
        // 用 INSERT OR IGNORE 而不是 ON CONFLICT(user_id,url)：前者只要求"存在唯一约束"，
        // 不依赖具体列组合，因此"索引迁移还没执行"时也不会报错（届时行为等同旧的全局唯一）
        const result = await env.DB.prepare(
            'INSERT OR IGNORE INTO links (user_id, title, url, icon, icon_url, tags, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).bind(userId, title, url, icon || '', icon_url || '', tagsStr, sort_order || 0).run();
        if (!result.meta || result.meta.changes === 0) {
            return errorResponse('你已收藏过该网址，或该网址已被其他用户占用', 409);
        }
        await touchLinksEpoch(env, userId);
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
        await touchLinksEpoch(env, userId);
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
        await touchLinksEpoch(env, userId);
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
    let data;
    try {
        data = await request.json();
    } catch {
        return errorResponse('请求体必须是合法 JSON', 400);
    }
    if (!Array.isArray(data) || data.length === 0) return errorResponse('数据格式错误，需要非空数组', 400);
    if (data.length > IMPORT_MAX) return errorResponse('单次导入不能超过' + IMPORT_MAX + '条', 400);

    const seenInBatch = new Set();
    const validItems = [];
    let invalidCount = 0;
    for (const item of data) {
        const title = typeof item.title === 'string' ? item.title : (typeof item.name === 'string' ? item.name : '');
        const linkUrl = typeof item.url === 'string' ? item.url : '';
        if (!title || !linkUrl || !isValidHttpUrl(linkUrl) || seenInBatch.has(linkUrl)) {
            invalidCount++;
            continue;
        }
        seenInBatch.add(linkUrl);
        validItems.push({
            title, url: linkUrl,
            icon: typeof item.icon === 'string' ? item.icon : '',
            icon_url: typeof item.icon_url === 'string' ? item.icon_url : '',
            tags: JSON.stringify(Array.isArray(item.tags) ? item.tags : []),
            sort_order: Number(item.sort_order || item.sort || 0) || 0,
        });
    }
    if (validItems.length === 0) {
        return jsonResponse({ success: true, total: data.length, successCount: 0, skipCount: 0, invalidCount });
    }

    // 去重交给唯一索引：不再每个批次都 SELECT 一遍全表
    try {
        let successCount = 0;
        for (let i = 0; i < validItems.length; i += IMPORT_CHUNK) {
            const chunk = validItems.slice(i, i + IMPORT_CHUNK);
            const placeholders = chunk.map(() => '(?, ?, ?, ?, ?, ?, ?)').join(', ');
            const params = [];
            for (const item of chunk) params.push(userId, item.title, item.url, item.icon, item.icon_url, item.tags, item.sort_order);
            const result = await env.DB
                .prepare(`INSERT OR IGNORE INTO links (user_id, title, url, icon, icon_url, tags, sort_order)
                          VALUES ${placeholders}`)
                .bind(...params).run();
            successCount += (result.meta && typeof result.meta.changes === 'number') ? result.meta.changes : chunk.length;
        }
        await touchLinksEpoch(env, userId);
        const skipCount = validItems.length - successCount;
        return jsonResponse({ success: true, total: data.length, successCount, skipCount, invalidCount });
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
        // 只告知哪些标签上了锁，不下发任何可用于离线爆破的哈希
        const results = await env.DB.prepare('SELECT tag_name FROM tag_passwords WHERE user_id = ?').bind(userId).all();
        return jsonResponse(results.results.map(r => ({ tag_name: r.tag_name, locked: true })));
    } catch (e) {
        console.error('getTagPasswords failed', e);
        return errorResponse('加载密码失败', 500);
    }
}

async function handleSetTagPassword(request, env, userId) {
    let body;
    try {
        body = await request.json();
    } catch {
        return errorResponse('请求体必须是合法 JSON', 400);
    }
    const tagName = typeof body.tag === 'string' ? body.tag.trim() : '';
    const password = typeof body.password === 'string' ? body.password.trim() : '';
    if (!tagName || tagName.length > 100) return errorResponse('标签名不合法', 400);

    try {
        if (password === '') {
            await env.DB.prepare('DELETE FROM tag_passwords WHERE tag_name = ? AND user_id = ?')
                .bind(tagName, userId).run();
            return jsonResponse({ success: true, cleared: true });
        }
        if (password.length < 4) return errorResponse('密码至少 4 位', 400);
        const hash = await hashPassword(password);
        // 单个标签单独更新，避免"覆盖式全量保存"误删其它标签的密码
        await env.DB.prepare(
            `INSERT INTO tag_passwords (tag_name, password_hash, user_id) VALUES (?, ?, ?)
             ON CONFLICT(tag_name, user_id) DO UPDATE SET password_hash = excluded.password_hash`
        ).bind(tagName, hash, userId).run();
        return jsonResponse({ success: true });
    } catch (e) {
        console.error('setTagPassword failed', e);
        return errorResponse('保存密码失败', 500);
    }
}

async function handleUnlockTag(request, env, userId) {
    let body;
    try {
        body = await request.json();
    } catch {
        return errorResponse('请求体必须是合法 JSON', 400);
    }
    const tag = typeof body.tag === 'string' ? body.tag : '';
    const password = typeof body.password === 'string' ? body.password : '';
    if (!tag || !password) return errorResponse('标签和密码不能为空', 400);

    try {
        const row = await env.DB
            .prepare('SELECT password_hash FROM tag_passwords WHERE tag_name = ? AND user_id = ?')
            .bind(tag, userId).first();
        if (!row) return errorResponse('该标签未设置密码', 404);

        const { ok, needsUpgrade } = await verifyTagPassword(password, row.password_hash);
        if (!ok) return errorResponse('密码错误', 401);

        if (needsUpgrade) {
            await env.DB.prepare('UPDATE tag_passwords SET password_hash = ? WHERE tag_name = ? AND user_id = ?')
                .bind(await hashPassword(password), tag, userId).run();
        }

        const alreadyUnlocked = await readTagGrant(request, env, userId);
        const lockedTags = await getLockedTagNames(env, userId);
        const tags = [...new Set(lockedTags.filter(t => t === tag || alreadyUnlocked.has(t)))];
        const grant = await signGrant(userId, tags, env);
        return jsonResponse({ grant, tags });
    } catch (e) {
        console.error('unlockTag failed', e);
        return errorResponse('解锁失败', 500);
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

        if (path === '/api/links/sort/batch' && method === 'PUT') return handleSortBatch(request, env, userId);
        if (path.match(/^\/api\/links\/\d+\/sort$/) && method === 'PUT') {
            return handleSort(request, env, userId, parseInt(path.split('/')[3]));
        }
        if (path === '/api/links/export' && method === 'GET') return handleExport(request, env, userId);
        if (path === '/api/links/epoch' && method === 'GET') return handleLinksEpoch(env, userId);
        if (path === '/api/links/import' && method === 'POST') return handleImport(request, env, userId);
        if (path.match(/^\/api\/links\/\d+$/) && method === 'PUT') return handlePutLink(request, env, userId, parseInt(path.split('/')[3]));
        if (path.match(/^\/api\/links\/\d+$/) && method === 'DELETE') return handleDeleteLink(request, env, userId, parseInt(path.split('/')[3]));
        if (path === '/api/links' && method === 'GET') return handleGetLinks(request, env, ctx, userId);
        if (path === '/api/links' && method === 'POST') return handlePostLinks(request, env, userId);
        if (path === '/api/tags' && method === 'GET') return handleGetTags(env, userId, ctx);
        if (path === '/api/tags/order' && method === 'GET') return handleGetTagOrder(env, userId);
        if (path === '/api/tags/order' && method === 'POST') return handlePostTagOrder(request, env, userId);
        if (path === '/api/tag-passwords' && method === 'GET') return handleGetTagPasswords(env, userId);
        if (path === '/api/tag-passwords' && method === 'POST') return handleSetTagPassword(request, env, userId);
        if (path === '/api/tag-passwords/unlock' && method === 'POST') return handleUnlockTag(request, env, userId);
        if (path.match(/^\/api\/tag-passwords\/.+/) && method === 'DELETE') return handleDeleteTagPassword(request, env, userId, path.replace('/api/tag-passwords/', ''));
        if (path.startsWith('/api/admin/users')) return handleAdminUsers(request, env, userId, userRole);

        return errorResponse('接口不存在', 404);
    }
};
