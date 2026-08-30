// ============================================================
//  _worker.js - 完全接管路由
// ============================================================

// -------- 工具函数 --------
function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' }
    });
}

function errorResponse(message, status = 400) {
    return jsonResponse({ error: message }, status);
}

function getTokenFromRequest(request) {
    const auth = request.headers.get('Authorization');
    if (auth && auth.startsWith('Bearer ')) {
        return auth.substring(7);
    }
    return null;
}

function verifyToken(token) {
    try {
        const payload = JSON.parse(atob(token));
        if (payload.exp && payload.exp < Date.now()) {
            return null;
        }
        return payload;
    } catch {
        return null;
    }
}

// ============================================================
//  登录接口
// ============================================================
async function handleLogin(request, env) {
    try {
        const { username, password } = await request.json();
        if (!username || !password) {
            return errorResponse('用户名和密码不能为空');
        }

        const user = await env.DB.prepare(
            'SELECT * FROM users WHERE username = ?'
        ).bind(username).first();

        if (!user) {
            const result = await env.DB.prepare(
                'INSERT INTO users (username, password, role) VALUES (?, ?, ?)'
            ).bind(username, password, 'user').run();
            const newUser = {
                id: result.meta.last_row_id,
                username,
                role: 'user'
            };
            const token = btoa(JSON.stringify({
                userId: newUser.id,
                username: newUser.username,
                role: newUser.role,
                exp: Date.now() + 7 * 24 * 60 * 60 * 1000
            }));
            return jsonResponse({ token, user: newUser });
        }

        if (user.password !== password) {
            return errorResponse('密码错误', 401);
        }

        const userInfo = {
            id: user.id,
            username: user.username,
            role: user.role
        };
        const token = btoa(JSON.stringify({
            userId: userInfo.id,
            username: userInfo.username,
            role: userInfo.role,
            exp: Date.now() + 7 * 24 * 60 * 60 * 1000
        }));
        return jsonResponse({ token, user: userInfo });
    } catch (e) {
        return errorResponse('登录失败: ' + e.message, 500);
    }
}

// ============================================================
//  PUT /api/links/:id/sort - 更新排序
// ============================================================
async function handleSort(request, env, userId, id) {
    try {
        const { sort_order } = await request.json();
        const existing = await env.DB.prepare(
            'SELECT * FROM links WHERE id = ? AND user_id = ?'
        ).bind(id, userId).first();
        if (!existing) {
            return errorResponse('链接不存在', 404);
        }
        await env.DB.prepare(
            'UPDATE links SET sort_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?'
        ).bind(sort_order, id, userId).run();
        return jsonResponse({ success: true });
    } catch (e) {
        return errorResponse('更新排序失败: ' + e.message, 500);
    }
}

// ============================================================
//  GET /api/links - 获取所有链接
// ============================================================
async function handleGetLinks(request, env, userId) {
    const url = new URL(request.url);
    const sortBy = url.searchParams.get('sort') || 'sort_order';
    const order = url.searchParams.get('order') || 'ASC';
    const allowedSortFields = ['sort_order', 'click_count', 'created_at', 'title'];
    const finalSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'sort_order';
    const finalOrder = order.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
    const sql = `SELECT * FROM links WHERE user_id = ? ORDER BY ${finalSortBy} ${finalOrder}`;
    const links = await env.DB.prepare(sql).bind(userId).all();
    return jsonResponse(links.results);
}

// ============================================================
//  POST /api/links - 添加链接
// ============================================================
async function handlePostLinks(request, env, userId) {
    try {
        const { title, url, icon, icon_url, tags, sort_order } = await request.json();
        if (!title || !url) {
            return errorResponse('标题和 URL 不能为空');
        }
        const tagsStr = tags ? JSON.stringify(tags) : '[]';
        const result = await env.DB.prepare(
            'INSERT INTO links (user_id, title, url, icon, icon_url, tags, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).bind(userId, title, url, icon || '', icon_url || '', tagsStr, sort_order || 0).run();
        const newLink = await env.DB.prepare('SELECT * FROM links WHERE id = ?').bind(result.meta.last_row_id).first();
        return jsonResponse(newLink, 201);
    } catch (e) {
        return errorResponse('添加失败: ' + e.message, 500);
    }
}

// ============================================================
//  PUT /api/links/:id - 更新链接
// ============================================================
async function handlePutLink(request, env, userId, id) {
    try {
        const { title, url, icon, icon_url, tags, sort_order } = await request.json();
        const existing = await env.DB.prepare(
            'SELECT * FROM links WHERE id = ? AND user_id = ?'
        ).bind(id, userId).first();
        if (!existing) {
            return errorResponse('链接不存在', 404);
        }
        const tagsStr = tags ? JSON.stringify(tags) : '[]';
        await env.DB.prepare(
            `UPDATE links SET title = ?, url = ?, icon = ?, icon_url = ?, tags = ?, sort_order = ?, updated_at = CURRENT_TIMESTAMP
             WHERE id = ? AND user_id = ?`
        ).bind(title, url, icon || '', icon_url || '', tagsStr, sort_order || 0, id, userId).run();
        return jsonResponse({ success: true });
    } catch (e) {
        return errorResponse('更新失败: ' + e.message, 500);
    }
}

// ============================================================
//  DELETE /api/links/:id - 删除链接
// ============================================================
async function handleDeleteLink(request, env, userId, id) {
    try {
        const existing = await env.DB.prepare(
            'SELECT * FROM links WHERE id = ? AND user_id = ?'
        ).bind(id, userId).first();
        if (!existing) {
            return errorResponse('链接不存在', 404);
        }
        await env.DB.prepare(
            'DELETE FROM links WHERE id = ? AND user_id = ?'
        ).bind(id, userId).run();
        return jsonResponse({ success: true });
    } catch (e) {
        return errorResponse('删除失败: ' + e.message, 500);
    }
}

// ============================================================
//  GET /api/links/export - 导出链接
// ============================================================
async function handleExport(request, env, userId) {
    try {
        const links = await env.DB.prepare(
            'SELECT id, title, url, icon, icon_url, tags, sort_order FROM links WHERE user_id = ? ORDER BY sort_order ASC'
        ).bind(userId).all();
        const data = links.results.map(item => ({
            ...item,
            tags: item.tags ? JSON.parse(item.tags) : []
        }));
        return jsonResponse(data);
    } catch (e) {
        return errorResponse('导出失败: ' + e.message, 500);
    }
}

// ============================================================
//  POST /api/links/import - 批量导入
// ============================================================
async function handleImport(request, env, userId) {
    try {
        const data = await request.json();
        if (!Array.isArray(data) || data.length === 0) {
            return errorResponse('数据格式错误，需要非空数组', 400);
        }
        if (data.length > 3000) {
            return errorResponse('单次导入不能超过3000条', 400);
        }

        const existing = await env.DB.prepare('SELECT url FROM links WHERE user_id = ?').bind(userId).all();
        const existingUrls = new Set(existing.results.map(r => r.url));

        const validItems = [];
        let skipCount = 0;
        for (const item of data) {
            if (!item.title || !item.url) continue;
            if (existingUrls.has(item.url)) {
                skipCount++;
                continue;
            }
            const tagsStr = Array.isArray(item.tags) ? JSON.stringify(item.tags) : '[]';
            validItems.push({
                user_id: userId,
                title: item.title,
                url: item.url,
                icon: item.icon || '',
                icon_url: item.icon_url || '',
                tags: tagsStr,
                sort_order: item.sort || 0
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
            for (const item of batch) {
                params.push(item.user_id, item.title, item.url, item.icon, item.icon_url, item.tags, item.sort_order);
            }
            try {
                await env.DB.prepare(sql).bind(...params).run();
                successCount += batch.length;
            } catch (e) {
                for (const item of batch) {
                    try {
                        await env.DB.prepare(
                            'INSERT INTO links (user_id, title, url, icon, icon_url, tags, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)'
                        ).bind(item.user_id, item.title, item.url, item.icon, item.icon_url, item.tags, item.sort_order).run();
                        successCount++;
                    } catch (err) {
                        errors.push(item.url + ': ' + err.message);
                    }
                }
            }
        }
        return jsonResponse({ success: true, total: data.length, successCount, skipCount, errorCount: errors.length, errors: errors.slice(0, 10) });
    } catch (e) {
        return errorResponse('批量导入失败: ' + e.message, 500);
    }
}

// ============================================================
//  GET /api/tags - 获取所有标签
// ============================================================
async function handleGetTags(env, userId) {
    const links = await env.DB.prepare('SELECT tags FROM links WHERE user_id = ?').bind(userId).all();
    const tagCount = {};
    links.results.forEach(item => {
        if (item.tags) {
            try {
                const tags = JSON.parse(item.tags);
                tags.forEach(tag => {
                    if (tag) tagCount[tag] = (tagCount[tag] || 0) + 1;
                });
            } catch (e) {}
        }
    });
    const sortedTags = Object.keys(tagCount).sort((a, b) => tagCount[b] - tagCount[a] || a.localeCompare(b));
    return jsonResponse(sortedTags);
}

// ============================================================
//  GET /api/tags/order - 获取标签排序
// ============================================================
async function handleGetTagOrder(env, userId) {
    try {
        const result = await env.DB.prepare('SELECT tag_order FROM tag_orders WHERE user_id = ?').bind(userId).first();
        if (!result) return jsonResponse([]);
        try {
            const tags = JSON.parse(result.tag_order);
            return jsonResponse(tags);
        } catch {
            return jsonResponse([]);
        }
    } catch (e) {
        return errorResponse('获取排序失败: ' + e.message, 500);
    }
}

// ============================================================
//  POST /api/tags/order - 保存标签排序
// ============================================================
async function handlePostTagOrder(request, env, userId) {
    try {
        const { tags } = await request.json();
        if (!Array.isArray(tags)) {
            return errorResponse('tags 必须是数组', 400);
        }
        const tagOrder = JSON.stringify(tags);
        await env.DB.prepare(
            `INSERT INTO tag_orders (user_id, tag_order, updated_at)
             VALUES (?, ?, CURRENT_TIMESTAMP)
             ON CONFLICT(user_id) DO UPDATE SET tag_order = ?, updated_at = CURRENT_TIMESTAMP`
        ).bind(userId, tagOrder, tagOrder).run();
        return jsonResponse({ success: true });
    } catch (e) {
        return errorResponse('保存排序失败: ' + e.message, 500);
    }
}

// ============================================================
//  GET /api/tag-passwords - 获取标签密码
// ============================================================
async function handleGetTagPasswords(env, userId) {
    try {
        const results = await env.DB.prepare(
            'SELECT tag_name, password_hash FROM tag_passwords WHERE user_id = ?'
        ).bind(userId).all();
        return jsonResponse(results.results);
    } catch (e) {
        return errorResponse('加载密码失败: ' + e.message, 500);
    }
}

// ============================================================
//  POST /api/tag-passwords - 保存标签密码
// ============================================================
async function handlePostTagPasswords(request, env, userId) {
    try {
        const { passwords } = await request.json();
        await env.DB.prepare('DELETE FROM tag_passwords WHERE user_id = ?').bind(userId).run();
        for (const [tagName, hash] of Object.entries(passwords)) {
            if (hash && hash.trim() !== '') {
                await env.DB.prepare(
                    'INSERT INTO tag_passwords (tag_name, password_hash, user_id) VALUES (?, ?, ?)'
                ).bind(tagName, hash, userId).run();
            }
        }
        return jsonResponse({ success: true });
    } catch (e) {
        return errorResponse('保存密码失败: ' + e.message, 500);
    }
}

// ============================================================
//  DELETE /api/tag-passwords/:tagName - 删除标签密码
// ============================================================
async function handleDeleteTagPassword(request, env, userId, tagName) {
    try {
        await env.DB.prepare(
            'DELETE FROM tag_passwords WHERE tag_name = ? AND user_id = ?'
        ).bind(decodeURIComponent(tagName), userId).run();
        return jsonResponse({ success: true });
    } catch (e) {
        return errorResponse('删除密码失败: ' + e.message, 500);
    }
}

// ============================================================
//  管理员接口
// ============================================================
async function handleAdminUsers(request, env, userId, userRole) {
    if (userRole !== 'admin') {
        return errorResponse('需要管理员权限', 403);
    }
    const url = new URL(request.url);
    const method = request.method;

    if (method === 'GET') {
        const users = await env.DB.prepare('SELECT id, username, role, created_at FROM users').all();
        return jsonResponse(users.results);
    }

    if (method === 'POST') {
        try {
            const { username, password } = await request.json();
            if (!username || !password) {
                return errorResponse('用户名和密码不能为空');
            }
            const existing = await env.DB.prepare('SELECT * FROM users WHERE username = ?').bind(username).first();
            if (existing) {
                return errorResponse('用户已存在', 409);
            }
            await env.DB.prepare('INSERT INTO users (username, password, role) VALUES (?, ?, ?)').bind(username, password, 'user').run();
            return jsonResponse({ success: true });
        } catch (e) {
            return errorResponse('创建失败: ' + e.message, 500);
        }
    }

    return errorResponse('Method not allowed', 405);
}

// ============================================================
//  主入口
// ============================================================
export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        const path = url.pathname;
        const method = request.method;

        // CORS
        if (method === 'OPTIONS') {
            return new Response(null, {
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
                }
            });
        }

        // ============================================================
        //  放行首页和静态资源
        // ============================================================
        if (path === '/' ||
            path === '/index.html' ||
            path.startsWith('/style.css') ||
            path.startsWith('/app.js') ||
            path.startsWith('/auth.js') ||
            path.startsWith('/admin.js') ||
            path.startsWith('/api.js') ||
            path.startsWith('/Sortable.min.js') ||
            path.startsWith('/manifest.json') ||
            path.startsWith('/sw.js') ||
            path.startsWith('/icons/')) {
            return env.ASSETS.fetch(request);
        }

        // ============================================================
        //  登录接口（不需要认证）
        // ============================================================
        if (path === '/api/auth/login' && method === 'POST') {
            return handleLogin(request, env);
        }

        // ============================================================
        //  验证 token
        // ============================================================
        const token = getTokenFromRequest(request);
        if (!token) {
            return errorResponse('请先登录', 401);
        }
        const payload = verifyToken(token);
        if (!payload) {
            return errorResponse('token 无效或已过期', 401);
        }
        const userId = payload.userId;
        const userRole = payload.role;

        // ============================================================
        //  路由匹配
        // ============================================================

        // /api/links/:id/sort (放在最前面)
        if (path.match(/^\/api\/links\/\d+\/sort$/) && method === 'PUT') {
            const id = parseInt(path.split('/')[3]);
            return handleSort(request, env, userId, id);
        }

        // /api/links/export
        if (path === '/api/links/export' && method === 'GET') {
            return handleExport(request, env, userId);
        }

        // /api/links/import
        if (path === '/api/links/import' && method === 'POST') {
            return handleImport(request, env, userId);
        }

        // /api/links/:id (PUT/DELETE)
        if (path.match(/^\/api\/links\/\d+$/) && method === 'PUT') {
            const id = parseInt(path.split('/')[3]);
            return handlePutLink(request, env, userId, id);
        }
        if (path.match(/^\/api\/links\/\d+$/) && method === 'DELETE') {
            const id = parseInt(path.split('/')[3]);
            return handleDeleteLink(request, env, userId, id);
        }

        // /api/links (GET/POST)
        if (path === '/api/links' && method === 'GET') {
            return handleGetLinks(request, env, userId);
        }
        if (path === '/api/links' && method === 'POST') {
            return handlePostLinks(request, env, userId);
        }

        // /api/tags
        if (path === '/api/tags' && method === 'GET') {
            return handleGetTags(env, userId);
        }

        // /api/tags/order
        if (path === '/api/tags/order' && method === 'GET') {
            return handleGetTagOrder(env, userId);
        }
        if (path === '/api/tags/order' && method === 'POST') {
            return handlePostTagOrder(request, env, userId);
        }

        // /api/tag-passwords
        if (path === '/api/tag-passwords' && method === 'GET') {
            return handleGetTagPasswords(env, userId);
        }
        if (path === '/api/tag-passwords' && method === 'POST') {
            return handlePostTagPasswords(request, env, userId);
        }
        if (path.match(/^\/api\/tag-passwords\/.+/)) {
            const tagName = path.replace('/api/tag-passwords/', '');
            return handleDeleteTagPassword(request, env, userId, tagName);
        }

        // /api/admin/users
        if (path.startsWith('/api/admin/users')) {
            return handleAdminUsers(request, env, userId, userRole);
        }

        return errorResponse('接口不存在', 404);
    }
};
