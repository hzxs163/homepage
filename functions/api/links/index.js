// ============================================================
//  /api/links
//  GET  - 获取所有链接（支持排序）
//  POST - 添加链接
// ============================================================

// 工具函数：统一响应格式
function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' }
    });
}

function errorResponse(message, status = 400) {
    return jsonResponse({ error: message }, status);
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
            `INSERT INTO links (user_id, title, url, icon, icon_url, tags, sort_order)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).bind(userId, title, url, icon || '', icon_url || '', tagsStr, sort_order || 0).run();

        const newLink = await env.DB.prepare(
            'SELECT * FROM links WHERE id = ?'
        ).bind(result.meta.last_row_id).first();

        return jsonResponse(newLink, 201);
    } catch (e) {
        return errorResponse('添加失败: ' + e.message, 500);
    }
}

// ============================================================
//  主入口
// ============================================================
export async function onRequest(context) {
    const { request, env } = context;
    const userId = context.data.userId;
    const method = request.method;

    if (method === 'GET') {
        return handleGetLinks(request, env, userId);
    }

    if (method === 'POST') {
        return handlePostLinks(request, env, userId);
    }

    return errorResponse('Method not allowed', 405);
}
