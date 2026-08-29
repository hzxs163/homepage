// ============================================================
//  Pages Functions 中间件
//  作用：验证 JWT token，将 userId 注入到 context.data 中
//  所有 /api/* 请求都会经过这里（除了 /api/auth/login）
// ============================================================

// 从 Authorization header 解析 token
function getTokenFromRequest(request) {
    const auth = request.headers.get('Authorization');
    if (auth && auth.startsWith('Bearer ')) {
        return auth.substring(7);
    }
    return null;
}

// 验证 token
function verifyToken(token) {
    try {
        const payload = JSON.parse(atob(token));
        if (payload.exp && payload.exp < Date.now()) {
            return null;
        }
        return payload;
    } catch {
        return null;
    }
}

export async function onRequest(context) {
    const { request, env, next } = context;
    const url = new URL(request.url);

    // ============================================================
    //  登录接口不需要验证 token
    // ============================================================
    if (url.pathname === '/api/auth/login') {
        return next();
    }

    // ============================================================
    //  验证 token
    // ============================================================
    const token = getTokenFromRequest(request);
    if (!token) {
        return new Response(JSON.stringify({ error: '请先登录' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    const payload = verifyToken(token);
    if (!payload) {
        return new Response(JSON.stringify({ error: 'token 无效或已过期' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    // 将 userId 注入到 context.data，供后续处理函数使用
    context.data.userId = payload.userId;
    context.data.user = payload;

    // 继续执行后续的路由处理
    return next();
}
