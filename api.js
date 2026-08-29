// ============================================================
//  API 层 - 连接 Cloudflare Pages Functions 后端
//  使用相对路径，与页面同域
// ============================================================

// ============================================================
//  核心请求函数
// ============================================================

function getToken() {
    return localStorage.getItem('token');
}

async function apiCall(method, endpoint, data = null) {
    const url = endpoint;  // 🔥 直接使用相对路径
    const headers = {
        'Content-Type': 'application/json'
    };

    const token = getToken();
    if (token) {
        headers['Authorization'] = 'Bearer ' + token;
    }

    const options = {
        method: method,
        headers: headers
    };

    if (data) {
        options.body = JSON.stringify(data);
    }

    const response = await fetch(url, options);
    const result = await response.json();

    if (!response.ok) {
        if (response.status === 401) {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            window.location.reload();
            throw new Error('登录已过期，请重新登录');
        }
        throw new Error(result.error || '请求失败');
    }

    return result;
}

// ============================================================
//  对外 API 接口
// ============================================================

const API = {

    // -------- 认证 --------
    async login(username, password) {
        const result = await apiCall('POST', '/api/auth/login', { username, password });
        return result;
    },

    // -------- 链接（支持排序） --------
    async getLinks(sortBy = 'sort_order', order = 'ASC') {
        const result = await apiCall('GET', `/api/links?sort=${sortBy}&order=${order}`);
        return result;
    },

    async addLink(data) {
        const result = await apiCall('POST', '/api/links', data);
        return result;
    },

    async updateLink(id, data) {
        const result = await apiCall('PUT', '/api/links/' + id, data);
        return result;
    },

    async deleteLink(id) {
        const result = await apiCall('DELETE', '/api/links/' + id);
        return result;
    },

    async updateSort(id, sortOrder) {
        const result = await apiCall('PUT', '/api/links/' + id + '/sort', { sort_order: sortOrder });
        return result;
    },

    async recordClick(id) {
        try {
            await apiCall('POST', '/api/links/' + id + '/click');
        } catch (e) {
            console.log('点击记录失败:', e);
        }
    },

    async exportLinks() {
        const result = await apiCall('GET', '/api/links/export');
        return result;
    },

    // -------- 图标 --------
    async getIcon(id) {
        const result = await apiCall('GET', '/api/links/' + id + '/icon');
        return result;
    },

    async saveIcon(id, icon_url) {
        const result = await apiCall('POST', '/api/links/' + id + '/icon', { icon_url });
        return result;
    },

    // -------- 批量导入 --------
    async importLinks(data) {
        if (!Array.isArray(data) || data.length === 0) {
            throw new Error('数据格式错误，需要非空数组');
        }
        if (data.length > 2000) {
            throw new Error('单次导入不能超过2000条');
        }
        const result = await apiCall('POST', '/api/links/import', data);
        return result;
    },

    // -------- 标签 --------
    async getTags() {
        const result = await apiCall('GET', '/api/tags');
        return result;
    },

    async saveTagOrder(tags) {
        const result = await apiCall('POST', '/api/tags/order', { tags });
        return result;
    },

    // -------- 标签密码（D1 存储） --------
    async getTagPasswords() {
        const result = await apiCall('GET', '/api/tag-passwords');
        return result;
    },

    async saveTagPasswords(passwords) {
        const result = await apiCall('POST', '/api/tag-passwords', { passwords });
        return result;
    },

    async deleteTagPassword(tagName) {
        const result = await apiCall('DELETE', '/api/tag-passwords/' + encodeURIComponent(tagName));
        return result;
    },

    // -------- 管理员 --------
    async getUsers() {
        const result = await apiCall('GET', '/api/admin/users');
        return result;
    },

    async createUser(username, password) {
        const result = await apiCall('POST', '/api/admin/users', { username, password });
        return result;
    },

    async resetPassword(username, newPassword) {
        const result = await apiCall('PUT', '/api/admin/users/' + username + '/reset', { password: newPassword });
        return result;
    },

    async deleteUser(username) {
        const result = await apiCall('DELETE', '/api/admin/users/' + username);
        return result;
    }
};
