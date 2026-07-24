// ============================================================
//  Cloudflare Worker - 导航后端 API-1
//  数据库: Cloudflare D1
// ============================================================

// -------- 跨域配置 --------
const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// -------- 工具函数 --------
function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            'Content-Type': 'application/json',
            ...CORS_HEADERS
        }
    });
}

function errorResponse(message, status = 400) {
    return jsonResponse({ error: message }, status);
}

// -------- JWT 工具 --------
function generateToken(user) {
    const payload = {
        userId: user.id,
        username: user.username,
        role: user.role,
        exp: Date.now() + 7 * 24 * 60 * 60 * 1000
    };
    return btoa(JSON.stringify(payload));
}

function verifyToken(token) {
    try {
        const payload = JSON.parse(atob(token));
        if (payload.exp < Date.now()) {
            return null;
        }
        return payload;
    } catch {
        return null;
    }
}

function getTokenFromRequest(request) {
    const auth = request.headers.get('Authorization');
    if (auth && auth.startsWith('Bearer ')) {
        return auth.substring(7);
    }
    return null;
}

// -------- 密码工具（简化版） --------
function hashPassword(password) {
    return password;
}

function verifyPassword(password, hash) {
    return password === hash;
}

// ============================================================
//  主路由
// ============================================================

export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        const path = url.pathname;
        const method = request.method;

        // 处理 OPTIONS 预检请求
        if (method === 'OPTIONS') {
            return new Response(null, { headers: CORS_HEADERS });
        }

        // ============================================================
        //  认证相关（无需登录）
        // ============================================================

        // 登录
        if (path === '/api/auth/login' && method === 'POST') {
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
                    ).bind(username, hashPassword(password), 'user').run();

                    const newUser = {
                        id: result.meta.last_row_id,
                        username,
                        role: 'user'
                    };
                    const token = generateToken(newUser);
                    return jsonResponse({ token, user: newUser });
                }

                if (!verifyPassword(password, user.password)) {
                    return errorResponse('密码错误', 401);
                }

                const userInfo = {
                    id: user.id,
                    username: user.username,
                    role: user.role
                };
                const token = generateToken(userInfo);
                return jsonResponse({ token, user: userInfo });
            } catch (e) {
                return errorResponse('登录失败: ' + e.message, 500);
            }
        }

        // 验证 token
        if (path === '/api/auth/verify' && method === 'GET') {
            const token = getTokenFromRequest(request);
            if (!token) {
                return errorResponse('未提供 token', 401);
            }
            const payload = verifyToken(token);
            if (!payload) {
                return errorResponse('token 无效或已过期', 401);
            }
            return jsonResponse({ valid: true, user: payload });
        }

        // ============================================================
        //  需要认证的接口
        // ============================================================

        const token = getTokenFromRequest(request);
        const payload = verifyToken(token);
        if (!payload) {
            return errorResponse('请先登录', 401);
        }

        const userId = payload.userId;

        // ============================================================
        //  链接管理
        // ============================================================

        // 1. 获取所有链接
        if (path === '/api/links' && method === 'GET') {
            const links = await env.DB.prepare(
                'SELECT * FROM links WHERE user_id = ? ORDER BY sort_order ASC'
            ).bind(userId).all();
            return jsonResponse(links.results);
        }

        // 2. 添加链接
        if (path === '/api/links' && method === 'POST') {
            try {
                const { title, url, icon, tags, sort_order } = await request.json();
                if (!title || !url) {
                    return errorResponse('标题和 URL 不能为空');
                }
                const tagsStr = tags ? JSON.stringify(tags) : '[]';
                const result = await env.DB.prepare(
                    'INSERT INTO links (user_id, title, url, icon, tags, sort_order) VALUES (?, ?, ?, ?, ?, ?)'
                ).bind(userId, title, url, icon || '', tagsStr, sort_order || 0).run();

                const newLink = await env.DB.prepare(
                    'SELECT * FROM links WHERE id = ?'
                ).bind(result.meta.last_row_id).first();
                return jsonResponse(newLink, 201);
            } catch (e) {
                return errorResponse('添加失败: ' + e.message, 500);
            }
        }

        // 3. 更新排序（必须放在更新链接之前）
        if (path.startsWith('/api/links/') && path.endsWith('/sort') && method === 'PUT') {
            try {
                const id = parseInt(path.split('/')[3]);
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

        // 4. 更新链接
        if (path.startsWith('/api/links/') && method === 'PUT') {
            try {
                const id = parseInt(path.split('/')[3]);
                const { title, url, icon, tags, sort_order } = await request.json();

                const existing = await env.DB.prepare(
                    'SELECT * FROM links WHERE id = ? AND user_id = ?'
                ).bind(id, userId).first();
                if (!existing) {
                    return errorResponse('链接不存在', 404);
                }

                const tagsStr = tags ? JSON.stringify(tags) : '[]';
                await env.DB.prepare(
                    'UPDATE links SET title = ?, url = ?, icon = ?, tags = ?, sort_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?'
                ).bind(title, url, icon || '', tagsStr, sort_order || 0, id, userId).run();

                return jsonResponse({ success: true });
            } catch (e) {
                return errorResponse('更新失败: ' + e.message, 500);
            }
        }

        // 5. 删除链接
        if (path.startsWith('/api/links/') && method === 'DELETE') {
            try {
                const id = parseInt(path.split('/')[3]);
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

        // 6. 记录点击
        if (path.startsWith('/api/links/') && path.endsWith('/click') && method === 'POST') {
            try {
                const id = parseInt(path.split('/')[3]);
                await env.DB.prepare(
                    'UPDATE links SET click_count = click_count + 1 WHERE id = ? AND user_id = ?'
                ).bind(id, userId).run();
                return jsonResponse({ success: true });
            } catch (e) {
                return jsonResponse({ success: false });
            }
        }

        // 7. 导出链接
        if (path === '/api/links/export' && method === 'GET') {
            const links = await env.DB.prepare(
                'SELECT title, url, icon, tags, sort_order FROM links WHERE user_id = ? ORDER BY sort_order ASC'
            ).bind(userId).all();
            const data = links.results.map(item => ({
                ...item,
                tags: item.tags ? JSON.parse(item.tags) : []
            }));
            return jsonResponse(data);
        }
        // 8. 获取图标
if (path.startsWith('/api/links/') && path.endsWith('/icon') && method === 'GET') {
    try {
        const id = parseInt(path.split('/')[3]);
        const link = await env.DB.prepare(
            'SELECT icon_url FROM links WHERE id = ? AND user_id = ?'
        ).bind(id, userId).first();
        return jsonResponse({ icon_url: link?.icon_url || null });
    } catch (e) {
        return errorResponse('获取图标失败: ' + e.message, 500);
    }
}

// 9. 保存图标
if (path.startsWith('/api/links/') && path.endsWith('/icon') && method === 'POST') {
    try {
        const id = parseInt(path.split('/')[3]);
        const { icon_url } = await request.json();
        if (!icon_url) {
            return errorResponse('icon_url 不能为空', 400);
        }
        await env.DB.prepare(
            'UPDATE links SET icon_url = ? WHERE id = ? AND user_id = ?'
        ).bind(icon_url, id, userId).run();
        return jsonResponse({ success: true });
    } catch (e) {
        return errorResponse('保存图标失败: ' + e.message, 500);
    }
}

        // ============================================================
        //  批量导入链接（批量插入优化版）
        // ============================================================

        if (path === '/api/links/import' && method === 'POST') {
            try {
                const data = await request.json();

                if (!Array.isArray(data) || data.length === 0) {
                    return errorResponse('数据格式错误，需要非空数组', 400);
                }

                if (data.length > 3000) {
                    return errorResponse('单次导入不能超过3000条', 400);
                }

                // 获取当前用户已有的 URL（用于去重）
                const existing = await env.DB.prepare(
                    'SELECT url FROM links WHERE user_id = ?'
                ).bind(userId).all();
                const existingUrls = new Set(existing.results.map(r => r.url));

                // 准备有效数据
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
                        tags: tagsStr,
                        sort_order: item.sort || 0
                    });
                    existingUrls.add(item.url);
                }

                if (validItems.length === 0) {
                    return jsonResponse({
                        success: true,
                        total: data.length,
                        successCount: 0,
                        skipCount: skipCount,
                        errorCount: 0,
                        message: '没有新数据需要导入'
                    });
                }

                // ========== 批量插入（核心优化） ==========
                const BATCH_SIZE = 100;
                let successCount = 0;
                const errors = [];

                for (let i = 0; i < validItems.length; i += BATCH_SIZE) {
                    const batch = validItems.slice(i, i + BATCH_SIZE);
                    
                    // 构建批量插入 SQL
                    const placeholders = batch.map(() => '(?, ?, ?, ?, ?, ?)').join(', ');
                    const sql = `
                        INSERT INTO links (user_id, title, url, icon, tags, sort_order)
                        VALUES ${placeholders}
                    `;

                    const params = [];
                    for (const item of batch) {
                        params.push(
                            item.user_id,
                            item.title,
                            item.url,
                            item.icon,
                            item.tags,
                            item.sort_order
                        );
                    }

                    try {
                        await env.DB.prepare(sql).bind(...params).run();
                        successCount += batch.length;
                    } catch (e) {
                        // 如果批量插入失败，降级为逐条插入
                        for (const item of batch) {
                            try {
                                await env.DB.prepare(
                                    'INSERT INTO links (user_id, title, url, icon, tags, sort_order) VALUES (?, ?, ?, ?, ?, ?)'
                                ).bind(
                                    item.user_id,
                                    item.title,
                                    item.url,
                                    item.icon,
                                    item.tags,
                                    item.sort_order
                                ).run();
                                successCount++;
                            } catch (err) {
                                errors.push(item.url + ': ' + err.message);
                            }
                        }
                    }
                }

                return jsonResponse({
                    success: true,
                    total: data.length,
                    successCount: successCount,
                    skipCount: skipCount,
                    errorCount: errors.length,
                    errors: errors.slice(0, 10)
                });
            } catch (e) {
                return errorResponse('批量导入失败: ' + e.message, 500);
            }
        }

        // ============================================================
        //  标签
        // ============================================================

        // 获取所有标签
        if (path === '/api/tags' && method === 'GET') {
            const links = await env.DB.prepare(
                'SELECT tags FROM links WHERE user_id = ?'
            ).bind(userId).all();

            const tagCount = {};
            links.results.forEach(item => {
                if (item.tags) {
                    try {
                        const tags = JSON.parse(item.tags);
                        tags.forEach(tag => {
                            tagCount[tag] = (tagCount[tag] || 0) + 1;
                        });
                    } catch (e) {}
                }
            });

            const sortedTags = Object.keys(tagCount).sort((a, b) => tagCount[b] - tagCount[a]);
            return jsonResponse(sortedTags);
        }

        // 保存标签排序
        if (path === '/api/tags/order' && method === 'POST') {
            try {
                const { tags } = await request.json();
                return jsonResponse({ success: true });
            } catch (e) {
                return errorResponse('保存失败: ' + e.message, 500);
            }
        }

        // ============================================================
        //  管理员接口
        // ============================================================

        if (payload.role !== 'admin') {
            return errorResponse('需要管理员权限', 403);
        }

        // 获取所有用户
        if (path === '/api/admin/users' && method === 'GET') {
            const users = await env.DB.prepare(
                'SELECT id, username, role, created_at FROM users'
            ).all();
            return jsonResponse(users.results);
        }

        // 创建用户
        if (path === '/api/admin/users' && method === 'POST') {
            try {
                const { username, password } = await request.json();
                if (!username || !password) {
                    return errorResponse('用户名和密码不能为空');
                }

                const existing = await env.DB.prepare(
                    'SELECT * FROM users WHERE username = ?'
                ).bind(username).first();
                if (existing) {
                    return errorResponse('用户已存在', 409);
                }

                await env.DB.prepare(
                    'INSERT INTO users (username, password, role) VALUES (?, ?, ?)'
                ).bind(username, hashPassword(password), 'user').run();

                return jsonResponse({ success: true });
            } catch (e) {
                return errorResponse('创建失败: ' + e.message, 500);
            }
        }

        // 重置密码
        if (path.startsWith('/api/admin/users/') && path.endsWith('/reset') && method === 'PUT') {
            try {
                const username = path.split('/')[4];
                const { password } = await request.json();
                if (!password) {
                    return errorResponse('新密码不能为空');
                }

                const user = await env.DB.prepare(
                    'SELECT * FROM users WHERE username = ?'
                ).bind(username).first();
                if (!user) {
                    return errorResponse('用户不存在', 404);
                }

                await env.DB.prepare(
                    'UPDATE users SET password = ? WHERE username = ?'
                ).bind(hashPassword(password), username).run();

                return jsonResponse({ success: true });
            } catch (e) {
                return errorResponse('重置失败: ' + e.message, 500);
            }
        }

        // 删除用户
        if (path.startsWith('/api/admin/users/') && method === 'DELETE') {
            try {
                const username = path.split('/')[4];
                if (username === 'admin') {
                    return errorResponse('不能删除管理员', 403);
                }

                const user = await env.DB.prepare(
                    'SELECT * FROM users WHERE username = ?'
                ).bind(username).first();
                if (!user) {
                    return errorResponse('用户不存在', 404);
                }

                await env.DB.prepare(
                    'DELETE FROM users WHERE username = ?'
                ).bind(username).run();

                await env.DB.prepare(
                    'DELETE FROM links WHERE user_id = ?'
                ).bind(user.id).run();

                return jsonResponse({ success: true });
            } catch (e) {
                return errorResponse('删除失败: ' + e.message, 500);
            }
        }

        // ============================================================
        //  404
        // ============================================================

        return errorResponse('接口不存在', 404);
    }
};
