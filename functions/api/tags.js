// ============================================================
//  /api/tags
//  GET  - 获取所有标签及统计
//  POST - 保存标签排序（/api/tags/order）
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
//  GET /api/tags - 获取所有标签
// ============================================================
async function handleGetTags(env, userId) {
    const links = await env.DB.prepare(
        'SELECT tags FROM links WHERE user_id = ?'
    ).bind(userId).all();

    const tagCount = {};
    links.results.forEach(item => {
        if (item.tags) {
            try {
                const tags = JSON.parse(item.tags);
                tags.forEach(tag => {
                    if (tag) {
                        tagCount[tag] = (tagCount[tag] || 0) + 1;
                    }
                });
            } catch (e) {}
        }
    });

    const sortedTags = Object.keys(tagCount).sort((a, b) => tagCount[b] - tagCount[a] || a.localeCompare(b));
    return jsonResponse(sortedTags);
}

// ============================================================
//  POST /api/tags/order - 保存标签排序
// ============================================================
async function handlePostTagOrder(request) {
    try {
        const { tags } = await request.json();
        return jsonResponse({ success: true });
    } catch (e) {
        return errorResponse('保存失败: ' + e.message, 500);
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

    // POST /api/tags/order
    if (path === '/api/tags/order' && method === 'POST') {
        return handlePostTagOrder(request);
    }

    // GET /api/tags
    if (method === 'GET') {
        return handleGetTags(env, userId);
    }

    return errorResponse('Method not allowed', 405);
}
