// ============================================================
//  DELETE /api/tag-passwords/:tagName
//  删除单个标签密码
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

export async function onRequest(context) {
    const { request, env } = context;
    const url = new URL(request.url);
    const method = request.method;
    const userId = context.data.userId;

    // 只允许 DELETE
    if (method !== 'DELETE') {
        return errorResponse('Method not allowed', 405);
    }

    try {
        // 从路径中提取标签名
        // /api/tag-passwords/私密 -> 私密
        const tagName = decodeURIComponent(url.pathname.replace('/api/tag-passwords/', ''));

        if (!tagName) {
            return errorResponse('标签名不能为空', 400);
        }

        await env.DB.prepare(
            'DELETE FROM tag_passwords WHERE tag_name = ? AND user_id = ?'
        ).bind(tagName, userId).run();

        return jsonResponse({ success: true });
    } catch (e) {
        return errorResponse('删除密码失败: ' + e.message, 500);
    }
}
