// ============================================================
//  api.js - 后端接口封装
// ============================================================
const TOKEN_KEY = 'token';
const USER_KEY = 'user';
const TAG_GRANT_KEY = 'tagGrant';

function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function getTagGrant() {
  return sessionStorage.getItem(TAG_GRANT_KEY) || '';
}

function setTagGrant(grant) {
  if (grant) sessionStorage.setItem(TAG_GRANT_KEY, grant);
  else sessionStorage.removeItem(TAG_GRANT_KEY);
}

function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  sessionStorage.removeItem(TAG_GRANT_KEY);
  sessionStorage.removeItem('unlockedTags');
}

// 这些接口的 401 表示"本次提交的口令不对"，不是"会话失效"，不能触发全局登出
const AUTH_ATTEMPT_PATHS = ['/api/auth/login', '/api/tag-passwords/unlock'];

async function apiCall(method, path, body = null, options = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = 'Bearer ' + token;
  const grant = getTagGrant();
  if (grant) headers['X-Tag-Grant'] = grant;
  if (options.ifNoneMatch) headers['If-None-Match'] = options.ifNoneMatch;

  const init = { method, headers };
  if (body) init.body = JSON.stringify(body);

  const response = await fetch(path, init);

  // 304 没有响应体，不能走 json()
  if (response.status === 304) {
    return { notModified: true, etag: response.headers.get('ETag') };
  }

  const data = await response.json();

  if (!response.ok) {
    const isAuthAttempt = AUTH_ATTEMPT_PATHS.some(p => path.indexOf(p) === 0);
    if (response.status === 401 && !isAuthAttempt) {
      clearSession();
      window.location.reload();
      throw new Error('登录已过期，请重新登录');
    }
    throw new Error(data.error || '请求失败');
  }

  // 本页面写过的东西会让服务端版本号自增，标记一下，别让轮询把它当成"别处的改动"再刷一遍
  if (method !== 'GET' && typeof markSelfWrite === 'function') markSelfWrite();

  if (options.withMeta) {
    return {
      notModified: false,
      data,
      etag: response.headers.get('ETag'),
      total: Number(response.headers.get('X-Links-Total')) || null,
    };
  }
  return data;
}

const API = {
  clearSession,
  getTagGrant,
  setTagGrant,
  login: async (username, password) => await apiCall('POST', '/api/auth/login', { username, password }),

  getLinks: async (sort = 'sort_order', order = 'ASC', etag = null, limit = null, offset = 0) => {
    let path = `/api/links?sort=${sort}&order=${order}`;
    if (limit !== null) path += `&limit=${limit}&offset=${offset}`;
    return await apiCall('GET', path, null, { withMeta: true, ifNoneMatch: etag });
  },
  addLink: async (link) => await apiCall('POST', '/api/links', link),
  // 只回列表版本号，用来发现"别处新增/改过收藏"；不碰 links 表
  getLinksEpoch: async () => await apiCall('GET', '/api/links/epoch'),  updateLink: async (id, link) => await apiCall('PUT', '/api/links/' + id, link),
  deleteLink: async (id) => await apiCall('DELETE', '/api/links/' + id),
  updateSort: async (id, sort_order) => await apiCall('PUT', `/api/links/${id}/sort`, { sort_order }),
  // 仅在"空隙用尽、需要整体重排"时使用；常规拖动走 updateSort 单条
  setSortBatch: async (items) => await apiCall('PUT', '/api/links/sort/batch', { items }),

  async recordClick(id) {
    try {
      await apiCall('POST', `/api/links/${id}/click`);
    } catch (e) {
      console.log('点击记录失败:', e);
    }
  },

  exportLinks: async () => await apiCall('GET', '/api/links/export'),
  getIcon: async (id) => await apiCall('GET', `/api/links/${id}/icon`),
  saveIcon: async (id, icon_url) => await apiCall('POST', `/api/links/${id}/icon`, { icon_url }),

  async importLinks(items) {
    if (!Array.isArray(items) || items.length === 0) throw new Error('数据格式错误，需要非空数组');
    if (items.length > 3000) throw new Error('单次导入不能超过3000条');
    return await apiCall('POST', '/api/links/import', items);
  },

  getTags: async () => await apiCall('GET', '/api/tags'),
  saveTagOrder: async (tags) => await apiCall('POST', '/api/tags/order', { tags }),

  // 标签密码：浏览器只上报明文，由服务端加盐哈希；返回结果不再包含任何哈希
  getTagPasswords: async () => await apiCall('GET', '/api/tag-passwords'),
  setTagPassword: async (tag, password) => await apiCall('POST', '/api/tag-passwords', { tag, password }),
  deleteTagPassword: async (tag) => await apiCall('DELETE', '/api/tag-passwords/' + encodeURIComponent(tag)),
  unlockTag: async (tag, password) => await apiCall('POST', '/api/tag-passwords/unlock', { tag, password }),

  getUsers: async () => await apiCall('GET', '/api/admin/users'),
  createUser: async (username, password) => await apiCall('POST', '/api/admin/users', { username, password }),
  resetPassword: async (username, password) => await apiCall('PUT', `/api/admin/users/${username}/reset`, { password }),
  deleteUser: async (username) => await apiCall('DELETE', '/api/admin/users/' + username),
};
