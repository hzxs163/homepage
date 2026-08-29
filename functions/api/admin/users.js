// ============================================================
//  /api/admin/users
//  GET  - 获取所有用户（管理员）
//  POST - 创建用户（管理员）
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
//  GET /api/admin/users - 获取所有用户
// ============================================================
async function handleGetUsers(env) {
    try {
        const users = await env.DB.prepare(
            'SELECT id, username, role, created_at FROM users'
        ).all();
        return jsonResponse(users.results);
    } catch (e) {
        return errorResponse('加载用户失败: ' + e.message, 500);
    }
}

// ============================================================
//  POST /api/admin/users - 创建用户
// ============================================================
async function handlePostUsers(request, env) {
    try {
        const { username, password } = await request.json();

        if (!username || !password) {
            return errorResponse('用户名和密码不能为空');
        }

        // 检查用户是否已存在
        const existing = await env.DB.prepare(
            'SELECT * FROM users WHERE username = ?'
        ).bind(username).first();

        if (existing) {
            return errorResponse('用户已存在', 409);
        }

        await env.DB.prepare(
            'INSERT INTO users (username, password, role) VALUES (?, ?, ?)'
        ).bind(username, hashPassword(password), 'user').run();

        return jsonResponse({ success: true });
    } catch (e) {
        return errorResponse('创建失败: ' + e.message, 500);
    }
}

// ============================================================
//  主入口
// ============================================================
export async function onRequest(context) {
    const { request, env } = context;
    const method = request.method;
    const user = context.data.user;

    // 检查管理员权限
    if (user.role !== 'admin') {
        return errorResponse('需要管理员权限', 403);
    }

    if (method === 'GET') {
        return handleGetUsers(env);
    }

    if (method === 'POST') {
        return handlePostUsers(request, env);
    }

    return errorResponse('Method not allowed', 405);
}
