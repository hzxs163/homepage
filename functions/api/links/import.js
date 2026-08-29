// ============================================================
//  POST /api/links/import - 批量导入链接
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
                icon_url: item.icon_url || '',
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

        // 批量插入
        const BATCH_SIZE = 100;
        let successCount = 0;
        const errors = [];

        for (let i = 0; i < validItems.length; i += BATCH_SIZE) {
            const batch = validItems.slice(i, i + BATCH_SIZE);

            const placeholders = batch.map(() => '(?, ?, ?, ?, ?, ?, ?)').join(', ');
            const sql = `
                INSERT INTO links (user_id, title, url, icon, icon_url, tags, sort_order)
                VALUES ${placeholders}
            `;

            const params = [];
            for (const item of batch) {
                params.push(
                    item.user_id,
                    item.title,
                    item.url,
                    item.icon,
                    item.icon_url,
                    item.tags,
                    item.sort_order
                );
            }

            try {
                await env.DB.prepare(sql).bind(...params).run();
                successCount += batch.length;
            } catch (e) {
                // 降级为逐条插入
                for (const item of batch) {
                    try {
                        await env.DB.prepare(
                            `INSERT INTO links (user_id, title, url, icon, icon_url, tags, sort_order)
                             VALUES (?, ?, ?, ?, ?, ?, ?)`
                        ).bind(
                            item.user_id,
                            item.title,
                            item.url,
                            item.icon,
                            item.icon_url,
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
