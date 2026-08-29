// ============================================================
//  POST /api/auth/login
//  用户登录（首次登录自动注册）
// ============================================================

// 密码工具（简化版）
function hashPassword(password) {
    return password;
}

function verifyPassword(password, hash) {
    return password === hash;
}

// JWT 工具
function generateToken(user) {
    const payload = {
        userId: user.id,
        username: user.username,
        role: user.role,
        exp: Date.now() + 7 * 24 * 60 * 60 * 1000
    };
    return btoa(JSON.stringify(payload));
}

export async function onRequest(context) {
    const { request, env } = context;

    try {
        const { username, password } = await request.json();

        if (!username || !password) {
            return new Response(JSON.stringify({ error: '用户名和密码不能为空' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // 查询用户
        const user = await env.DB.prepare(
            'SELECT * FROM users WHERE username = ?'
        ).bind(username).first();

        if (!user) {
            // 自动注册
            const result = await env.DB.prepare(
                'INSERT INTO users (username, password, role) VALUES (?, ?, ?)'
            ).bind(username, hashPassword(password), 'user').run();

            const newUser = {
                id: result.meta.last_row_id,
                username,
                role: 'user'
            };
            const token = generateToken(newUser);
            return new Response(JSON.stringify({ token, user: newUser }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // 验证密码
        if (!verifyPassword(password, user.password)) {
            return new Response(JSON.stringify({ error: '密码错误' }), {
                status: 401,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const userInfo = {
            id: user.id,
            username: user.username,
            role: user.role
        };
        const token = generateToken(userInfo);

        return new Response(JSON.stringify({ token, user: userInfo }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (e) {
        return new Response(JSON.stringify({ error: '登录失败: ' + e.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
