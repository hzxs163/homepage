// ============================================================
//  _worker.js - 完全接管路由
//  替代 functions/ 目录
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

// -------- JWT 工具 --------
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
//  处理函数
// ============================================================

// PUT /api/links/:id/sort
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
        //  登录接口（不需要认证）
        // ============================================================
        if (path === '/api/auth/login' && method === 'POST') {
            // ... 登录逻辑
        }

        // ============================================================
        //  其他 API 需要认证
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

        // ============================================================
        //  路由匹配
        // ============================================================

        // 🔥 优先匹配 sort
        if (path.match(/^\/api\/links\/\d+\/sort$/) && method === 'PUT') {
            const id = parseInt(path.split('/')[3]);
            return handleSort(request, env, userId, id);
        }

        // 其他路由...
        // GET /api/links
        // POST /api/links
        // PUT /api/links/:id
        // DELETE /api/links/:id
        // ...

        return errorResponse('接口不存在', 404);
    }
};
