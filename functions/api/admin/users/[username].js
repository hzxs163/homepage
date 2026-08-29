// ============================================================
//  /api/admin/users/:username
//  DELETE - 删除用户（管理员）
//  /api/admin/users/:username/reset
//  PUT - 重置用户密码（管理员）
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

// 密码工具
function hashPassword(password) {
    return password;
}

// ============================================================
//  DELETE /api/admin/users/:username - 删除用户
// ============================================================
async function handleDeleteUser(env, username) {
    try {
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
//  PUT /api/admin/users/:username/reset - 重置密码
// ============================================================
async function handleResetPassword(request, env, username) {
    try {
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

// ============================================================
//  主入口
// ============================================================
export async function onRequest(context) {
    const { request, env } = context;
    const url = new URL(request.url);
    const method = request.method;
    const user = context.data.user;

    // 检查管理员权限
    if (user.role !== 'admin') {
        return errorResponse('需要管理员权限', 403);
    }

    // 提取路径参数
    const parts = url.pathname.split('/');
    const username = parts[4];
    const action = parts[5];

    if (!username) {
        return errorResponse('用户名不能为空', 400);
    }

    // PUT /api/admin/users/:username/reset
    if (action === 'reset' && method === 'PUT') {
        return handleResetPassword(request, env, username);
    }

    // DELETE /api/admin/users/:username
    if (!action && method === 'DELETE') {
        return handleDeleteUser(env, username);
    }

    return errorResponse('Method not allowed', 405);
}
