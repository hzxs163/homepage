// ============================================================
//  /api/tag-passwords
//  GET  - 获取所有标签密码
//  POST - 批量保存标签密码
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
//  GET /api/tag-passwords - 获取所有标签密码
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
//  POST /api/tag-passwords - 批量保存标签密码
// ============================================================
async function handlePostTagPasswords(request, env, userId) {
    try {
        const { passwords } = await request.json();

        // 先删除该用户的所有标签密码
        await env.DB.prepare(
            'DELETE FROM tag_passwords WHERE user_id = ?'
        ).bind(userId).run();

        // 插入新的密码
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
//  主入口
// ============================================================
export async function onRequest(context) {
    const { request, env } = context;
    const method = request.method;
    const userId = context.data.userId;

    if (method === 'GET') {
        return handleGetTagPasswords(env, userId);
    }

    if (method === 'POST') {
        return handlePostTagPasswords(request, env, userId);
    }

    return errorResponse('Method not allowed', 405);
}
