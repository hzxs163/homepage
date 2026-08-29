// ============================================================
//  GET /api/links/export - 导出所有链接
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
    const userId = context.data.userId;

    try {
        const links = await env.DB.prepare(
            `SELECT id, title, url, icon, icon_url, tags, sort_order
             FROM links WHERE user_id = ? ORDER BY sort_order ASC`
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
