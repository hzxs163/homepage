// ============================================================
//  API 层 - 本地模拟模式
//  所有数据存在 localStorage，模拟后端行为
// ============================================================

// 当前用户
let currentUser = null;

// 获取当前用户
function getCurrentUser() {
    if (!currentUser) {
        const saved = localStorage.getItem('user');
        if (saved) currentUser = JSON.parse(saved);
    }
    return currentUser;
}

// 获取所有链接（按用户隔离）
function getLinks() {
    const user = getCurrentUser();
    if (!user) return [];
    const key = `links_${user.username}`;
    try {
        const data = localStorage.getItem(key);
        return data ? JSON.parse(data) : [];
    } catch { return []; }
}

// 保存链接
function saveLinks(links) {
    const user = getCurrentUser();
    if (!user) return;
    localStorage.setItem(`links_${user.username}`, JSON.stringify(links));
}

// 获取所有用户列表
function getUsers() {
    try {
        const data = localStorage.getItem('_users');
        return data ? JSON.parse(data) : [];
    } catch { return []; }
}

// 保存用户列表
function saveUsers(users) {
    localStorage.setItem('_users', JSON.stringify(users));
}

// 初始化默认用户
function initDefaultUsers() {
    let users = getUsers();
    if (users.length === 0) {
        users = [
            { username: 'admin', password: 'admin123', role: 'admin' },
            { username: 'user1', password: '123456', role: 'user' }
        ];
        saveUsers(users);
    }
    return users;
}

// ============================================================
//  对外 API 接口（模拟后端）
// ============================================================

const API = {

    // -------- 认证 --------
    async login(username, password) {
        const users = getUsers();
        const user = users.find(u => u.username === username);
        if (!user) {
            // 自动注册：不存在则创建普通用户
            const newUser = { username, password, role: 'user' };
            users.push(newUser);
            saveUsers(users);
            return { token: 'mock-token-' + Date.now(), user: { username, role: 'user' } };
        }
        if (user.password !== password) {
            throw new Error('密码错误');
        }
        return { token: 'mock-token-' + Date.now(), user: { username: user.username, role: user.role } };
    },

    // -------- 链接 --------
    async getLinks() {
        const links = getLinks();
        return links.map((item, index) => ({
            id: item.id || index + 1,
            title: item.name,
            url: item.url,
            icon: item.icon || '',
            tags: item.tags || [],
            sort_order: item.sort || 0,
            click_count: item.click_count || 0,
            created_at: item.created_at || new Date().toISOString()
        }));
    },

    async addLink(data) {
        const links = getLinks();
        const newLink = {
            id: Date.now(),
            name: data.title,
            url: data.url,
            icon: data.icon || '',
            tags: data.tags || [],
            sort: data.sort_order || 0,
            click_count: 0,
            created_at: new Date().toISOString()
        };
        links.push(newLink);
        saveLinks(links);
        return { success: true, id: newLink.id };
    },

    async updateLink(id, data) {
        const links = getLinks();
        const idx = links.findIndex(item => item.id === id);
        if (idx === -1) throw new Error('链接不存在');
        links[idx].name = data.title;
        links[idx].url = data.url;
        links[idx].icon = data.icon || '';
        links[idx].tags = data.tags || [];
        links[idx].sort = data.sort_order || 0;
        saveLinks(links);
        return { success: true };
    },

    async deleteLink(id) {
        let links = getLinks();
        links = links.filter(item => item.id !== id);
        saveLinks(links);
        return { success: true };
    },

    async updateSort(id, sortOrder) {
        const links = getLinks();
        const idx = links.findIndex(item => item.id === id);
        if (idx === -1) throw new Error('链接不存在');
        links[idx].sort = sortOrder;
        saveLinks(links);
        return { success: true };
    },

    async recordClick(id) {
        const links = getLinks();
        const idx = links.findIndex(item => item.id === id);
        if (idx === -1) return;
        links[idx].click_count = (links[idx].click_count || 0) + 1;
        saveLinks(links);
    },

    async exportLinks() {
        const links = getLinks();
        return links.map(item => ({
            name: item.name,
            url: item.url,
            icon: item.icon || '',
            tags: item.tags || [],
            sort: item.sort || 0
        }));
    },

    // -------- 管理员 --------
    async getUsers() {
        const users = getUsers();
        return users.map(u => ({
            username: u.username,
            role: u.role,
            created_at: u.created_at || '2024-01-01'
        }));
    },

    async createUser(username, password) {
        const users = getUsers();
        if (users.find(u => u.username === username)) {
            throw new Error('用户已存在');
        }
        users.push({ username, password, role: 'user', created_at: new Date().toISOString() });
        saveUsers(users);
        return { success: true };
    },

    async resetPassword(username, newPassword) {
        const users = getUsers();
        const user = users.find(u => u.username === username);
        if (!user) throw new Error('用户不存在');
        user.password = newPassword;
        saveUsers(users);
        return { success: true };
    },

    async deleteUser(username) {
        const users = getUsers();
        const user = users.find(u => u.username === username);
        if (!user) throw new Error('用户不存在');
        if (user.role === 'admin') throw new Error('不能删除管理员');
        const filtered = users.filter(u => u.username !== username);
        saveUsers(filtered);
        return { success: true };
    }
};

// 初始化默认用户
initDefaultUsers();