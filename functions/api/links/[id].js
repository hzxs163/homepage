// ============================================================
//  /api/links/:id
//  PUT    - 更新链接
//  DELETE - 删除链接
//  以及子路由：/sort, /click, /icon
// ============================================================

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
//  PUT /api/links/:id/sort - 更新排序
// ============================================================
async function handlePutSort(request, env, userId, id) {
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
//  POST /api/links/:id/click - 记录点击
// ============================================================
async function handlePostClick(request, env, userId, id) {
    try {
        await env.DB.prepare(
            'UPDATE links SET click_count = click_count + 1 WHERE id = ? AND user_id = ?'
        ).bind(id, userId).run();
        return jsonResponse({ success: true });
    } catch (e) {
        return jsonResponse({ success: false });
    }
}

// ============================================================
//  GET /api/links/:id/icon - 获取图标
// ============================================================
async function handleGetIcon(request, env, userId, id) {
    try {
        const link = await env.DB.prepare(
            'SELECT icon_url FROM links WHERE id = ? AND user_id = ?'
        ).bind(id, userId).first();
        return jsonResponse({ icon_url: link?.icon_url || null });
    } catch (e) {
        return errorResponse('获取图标失败: ' + e.message, 500);
    }
}

// ============================================================
//  POST /api/links/:id/icon - 保存图标
// ============================================================
async function handlePostIcon(request, env, userId, id) {
    try {
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
//  主入口
// ============================================================
export async function onRequest(context) {
    const { request, env } = context;
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;
    const userId = context.data.userId;

    // 提取 id
    const parts = path.split('/');
    const id = parseInt(parts[3]);

    if (isNaN(id)) {
        return errorResponse('无效的 ID', 400);
    }

    // 🔥 关键：用 path.includes 匹配子路由，放在最前面
    if (path.includes('/sort') && method === 'PUT') {
        return handlePutSort(request, env, userId, id);
    }

    if (path.includes('/click') && method === 'POST') {
        return handlePostClick(request, env, userId, id);
    }

    if (path.includes('/icon') && method === 'GET') {
        return handleGetIcon(request, env, userId, id);
    }

    if (path.includes('/icon') && method === 'POST') {
        return handlePostIcon(request, env, userId, id);
    }

    // 无子路由：/api/links/:id
    if (method === 'PUT') {
        return handlePutLink(request, env, userId, id);
    }

    if (method === 'DELETE') {
        return handleDeleteLink(request, env, userId, id);
    }

    return errorResponse('Method not allowed', 405);
}
