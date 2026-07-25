// ============================================================
//  认证管理
// ============================================================

// 备用 showToast（在 app.js 加载前使用）
if (typeof showToast === 'undefined') {
    window.showToast = function(msg) {
        alert(msg);
    };
}

// 备用 API（在 api.js 加载前使用）
if (typeof API === 'undefined') {
    window.API = {
        async login(username, password) {
            // 简单的本地登录模拟
            const users = JSON.parse(localStorage.getItem('_users') || '[]');
            let user = users.find(u => u.username === username);
            if (!user) {
                // 自动注册
                const newUser = { username, password, role: 'user' };
                users.push(newUser);
                localStorage.setItem('_users', JSON.stringify(users));
                return { token: 'mock-token-' + Date.now(), user: { username, role: 'user' } };
            }
            if (user.password !== password) {
                throw new Error('密码错误');
            }
            return { token: 'mock-token-' + Date.now(), user: { username: user.username, role: user.role } };
        }
    };
}

let authUser = null;

// 登录
async function doLogin() {
    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value.trim();
    const errorEl = document.getElementById('loginError');
    const btn = document.getElementById('loginBtn');

    if (!username || !password) {
        errorEl.textContent = '请输入用户名和密码';
        return;
    }

    btn.disabled = true;
    errorEl.textContent = '';
    btn.textContent = '登录中...';

    try {
        const result = await API.login(username, password);
        localStorage.setItem('token', result.token);
        localStorage.setItem('user', JSON.stringify(result.user));
        authUser = result.user;
        window.showToast('登录成功！');
        enterMainPage();
    } catch (err) {
        errorEl.textContent = err.message;
    } finally {
        btn.disabled = false;
        btn.textContent = '登 录';
    }
}

// 退出
function doLogout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    authUser = null;
    const loginPage = document.getElementById('loginPage');
    const mainPage = document.getElementById('mainPage');
    if (loginPage) loginPage.style.display = 'flex';
    if (mainPage) mainPage.style.display = 'none';
    showToast('已退出');
}

// 进入主页面
function enterMainPage() {
    const loginPage = document.getElementById('loginPage');
    const mainPage = document.getElementById('mainPage');
    if (loginPage) loginPage.style.display = 'none';
    if (mainPage) mainPage.style.display = 'block';
    
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    authUser = user;
    
    const usernameEl = document.getElementById('displayUsername');
    const roleEl = document.getElementById('displayRole');
    const adminBtn = document.getElementById('adminBtn');
    
    if (usernameEl) usernameEl.textContent = user.username || '用户';
    if (roleEl) roleEl.textContent = user.role === 'admin' ? '管理员' : '普通';
    if (adminBtn && user.role === 'admin') {
        adminBtn.style.display = 'flex';
    }
    
    // 初始化应用
    if (typeof initApp === 'function') {
        initApp();
    }
}

// 获取当前登录用户
function getAuthUser() {
    if (!authUser) {
        const saved = localStorage.getItem('user');
        if (saved) authUser = JSON.parse(saved);
    }
    return authUser;
}

// 检查是否已登录
function isLoggedIn() {
    return !!localStorage.getItem('token');
}