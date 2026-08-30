// ============================================================
//  /api/tags/order
//  GET  - 获取当前用户的标签排序
//  POST - 保存标签排序
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
//  GET /api/tags/order - 获取标签排序
// ============================================================
async function handleGetTagOrder(env, userId) {
    try {
        const result = await env.DB.prepare(
            'SELECT tag_order FROM tag_orders WHERE user_id = ?'
        ).bind(userId).first();

        if (!result) {
            // 没有保存过排序，返回空数组
            return jsonResponse([]);
        }

        // tag_order 存储的是 JSON 字符串，直接解析返回
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

        // 使用 INSERT ... ON CONFLICT 语法
        // 如果已存在则更新，不存在则插入
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
//  主入口
// ============================================================
export async function onRequest(context) {
    const { request, env } = context;
    const method = request.method;
    const userId = context.data.userId;

    if (method === 'GET') {
        return handleGetTagOrder(env, userId);
    }

    if (method === 'POST') {
        return handlePostTagOrder(request, env, userId);
    }

    return errorResponse('Method not allowed', 405);
}
