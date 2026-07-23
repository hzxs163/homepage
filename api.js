// ============================================================
//  API 层 - 连接 Cloudflare Workers 后端
// ============================================================

const API_BASE = 'https://navapi.wkm.kdns.fr/api';

// ============================================================
//  核心请求函数
// ============================================================

function getToken() {
    return localStorage.getItem('token');
}

async function apiCall(method, endpoint, data = null) {
    const url = API_BASE + endpoint;
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
            // Token 过期，清除登录状态
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
        const result = await apiCall('POST', '/auth/login', { username, password });
        return result;
    },

    // -------- 链接 --------
    async getLinks() {
        const result = await apiCall('GET', '/links');
        return result;
    },

    async addLink(data) {
        const result = await apiCall('POST', '/links', data);
        return result;
    },

    async updateLink(id, data) {
        const result = await apiCall('PUT', '/links/' + id, data);
        return result;
    },

    async deleteLink(id) {
        const result = await apiCall('DELETE', '/links/' + id);
        return result;
    },

    async updateSort(id, sortOrder) {
        const result = await apiCall('PUT', '/links/' + id + '/sort', { sort_order: sortOrder });
        return result;
    },

    async recordClick(id) {
        try {
            await apiCall('POST', '/links/' + id + '/click');
        } catch (e) {
            // 点击记录失败不影响主流程
            console.log('点击记录失败:', e);
        }
    },

    async exportLinks() {
        const result = await apiCall('GET', '/links/export');
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
        const result = await apiCall('POST', '/links/import', data);
        return result;
    },

    // -------- 标签 --------
    async getTags() {
        const result = await apiCall('GET', '/tags');
        return result;
    },

    async saveTagOrder(tags) {
        const result = await apiCall('POST', '/tags/order', { tags });
        return result;
    },

    // -------- 管理员 --------
    async getUsers() {
        const result = await apiCall('GET', '/admin/users');
        return result;
    },

    async createUser(username, password) {
        const result = await apiCall('POST', '/admin/users', { username, password });
        return result;
    },

    async resetPassword(username, newPassword) {
        const result = await apiCall('PUT', '/admin/users/' + username + '/reset', { password: newPassword });
        return result;
    },

    async deleteUser(username) {
        const result = await apiCall('DELETE', '/admin/users/' + username);
        return result;
    }
};
