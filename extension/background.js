// 右键收藏到导航站（MV3 服务工作者）
const DEFAULT_BASE = 'https://homepage-a8a.pages.dev';
const ROOT_ID = 'save-to-nav';
const NO_TAG_ID = 'save-to-nav:notag';
const TAG_ID_PREFIX = 'save-to-nav:tag:';
const TAG_REFRESH_MINUTES = 30;

function baseUrl() {
  return chrome.storage.local.get('navBase').then(v => (v.navBase || DEFAULT_BASE).replace(/\/+$/, ''));
}

function getToken() {
  return chrome.storage.local.get('navToken').then(v => v.navToken || '');
}

async function api(path, options = {}) {
  const base = await baseUrl();
  const token = await getToken();
  const headers = Object.assign({ 'Content-Type': 'application/json' }, options.headers || {});
  if (token) headers.Authorization = 'Bearer ' + token;
  const res = await fetch(base + path, Object.assign({}, options, { headers }));
  let body = null;
  try {
    body = await res.json();
  } catch (e) {
    body = null;
  }
  return { ok: res.ok, status: res.status, body };
}

function flash(icon, title) {
  chrome.action.setBadgeBackgroundColor({ color: icon === '✓' ? '#00b866' : '#dc2626' });
  chrome.action.setBadgeText({ text: icon });
  chrome.action.setTitle({ title: title || '收藏到我的导航' });
  setTimeout(() => chrome.action.setBadgeText({ text: '' }), 2200);
}

function remember(result) {
  chrome.storage.local.set({ navLastResult: Object.assign({ at: Date.now() }, result) });
}

// 与导航站自己的"添加网址"保持一致：图标走服务端 favicon 代理，内网地址不代理
function faviconFor(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '').replace(/:\d+$/, '');
    if (!host || host.startsWith('192.168.') || host.startsWith('10.') || host.startsWith('127.0.0.') || host === 'localhost') return '';
    return '/api/favicon?domain=' + encodeURIComponent(host);
  } catch (e) {
    return '';
  }
}

function pickTarget(info, tab) {
  const link = info.linkUrl || '';
  const image = info.srcUrl || '';
  const page = (tab && tab.url) || info.pageUrl || '';
  const url = link || image || page;

  // 太短的链接文字通常是"更多/登录/go"这类导航词，拿它当标题不如用页面标题
  const linkText = (info.linkText || '').trim();
  const title = (link && linkText.length >= 3 && linkText.length <= 100)
    ? linkText
    : ((tab && tab.title) || url);

  return { url, title: String(title || url || '').slice(0, 200) };
}

function isSaveable(url) {
  return /^https?:\/\//i.test(String(url || ''));
}

async function doSave(info, tab) {
  const { url, title } = pickTarget(info, tab);
  if (!isSaveable(url)) {
    flash('!', '这个地址不是 http(s) 网页，收藏不了');
    remember({ ok: false, error: '只能收藏 http/https 地址', url });
    return;
  }

  const token = await getToken();
  if (!token) {
    flash('!', '还没登录：点扩展图标登录一次即可');
    remember({ ok: false, error: '未登录', url });
    return;
  }

  const tag = info.menuItemId.startsWith(TAG_ID_PREFIX)
    ? decodeURIComponent(info.menuItemId.slice(TAG_ID_PREFIX.length))
    : '';

  const payload = { title, url, icon: '', icon_url: faviconFor(url), tags: tag ? [tag] : [] };
  let res;
  try {
    res = await api('/api/links', { method: 'POST', body: JSON.stringify(payload) });
  } catch (e) {
    // 断网/DNS 挂了也要让用户看见，不然点了没反应最难查
    flash('!', '连不上导航站，检查网络或站点地址');
    remember({ ok: false, error: '网络不通：' + e.message, url, title });
    return;
  }

  if (res.status === 401) {
    flash('!', '登录已过期，点扩展图标重新登录');
    remember({ ok: false, error: '登录已过期', url });
    return;
  }
  if (!res.ok) {
    const msg = (res.body && res.body.error) || ('HTTP ' + res.status);
    flash('!', '收藏失败：' + msg);
    remember({ ok: false, error: msg, url, title });
    return;
  }

  flash('✓', '已收藏：' + title);
  remember({ ok: true, error: '', url, title, tag });
  // 新标签可能带出新的标签名，顺手把子菜单刷新一次
  refreshTags();
}

function menuItem(title, id, parentId, contexts) {
  const item = { title, id, contexts };
  if (parentId) item.parentId = parentId;
  return item;
}

async function renderMenus(tags) {
  const hasToken = !!(await getToken());
  const contexts = ['page', 'link', 'image'];
  chrome.contextMenus.removeAll(() => {
    if (!hasToken) {
      chrome.contextMenus.create(menuItem('⭐ 收藏到我的导航（先点扩展图标登录）', 'nav:need-login'));
      return;
    }
    chrome.contextMenus.create(menuItem('⭐ 收藏到我的导航', ROOT_ID, null, contexts));
    chrome.contextMenus.create(menuItem('直接收藏（不带标签）', NO_TAG_ID, ROOT_ID, contexts));
    (tags || []).slice(0, 40).forEach(tag => {
      chrome.contextMenus.create(menuItem('保存到「' + tag + '」', TAG_ID_PREFIX + encodeURIComponent(tag), ROOT_ID, contexts));
    });
  });
}

let cachedTags = [];

async function refreshTags() {
  const token = await getToken();
  if (!token) {
    cachedTags = [];
    renderMenus([]);
    return;
  }
  try {
    const res = await api('/api/tags');
    cachedTags = res.ok && Array.isArray(res.body) ? res.body : cachedTags;
  } catch (e) {
    // 拉不到标签就沿用上一次缓存的菜单，别把菜单清空
  }
  renderMenus(cachedTags);
}

chrome.runtime.onInstalled.addListener(() => {
  refreshTags();
  chrome.alarms.create('nav-refresh-tags', { periodInMinutes: TAG_REFRESH_MINUTES });
});

chrome.runtime.onStartup.addListener(() => {
  refreshTags();
  chrome.alarms.create('nav-refresh-tags', { periodInMinutes: TAG_REFRESH_MINUTES });
});

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === 'nav-refresh-tags') refreshTags();
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  const id = String(info.menuItemId || '');
  if (id === ROOT_ID || id === NO_TAG_ID || id.startsWith(TAG_ID_PREFIX)) doSave(info, tab);
});

// 登录状态一变（popup 里登录/退出），立刻重画菜单
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && Object.prototype.hasOwnProperty.call(changes, 'navToken')) refreshTags();
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'nav-refresh-tags') refreshTags();
  sendResponse({ ok: true });
});
