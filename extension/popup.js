const DEFAULT_BASE = 'https://homepage-a8a.pages.dev';
const $ = id => document.getElementById(id);

function setState(text, ok) {
  const el = $('state');
  el.textContent = text;
  el.classList.toggle('off', !ok);
}

function showLast(result) {
  if (!result || !result.at) {
    $('last').textContent = '';
    return;
  }
  const when = new Date(result.at).toLocaleTimeString();
  $('last').textContent = result.ok
    ? `上次收藏（${when}）：✅ ${result.title || result.url}${result.tag ? ' → ' + result.tag : ''}`
    : `上次收藏（${when}）：❌ ${result.error}`;
}

async function load() {
  const v = await chrome.storage.local.get(['navBase', 'navToken', 'navUser', 'navLastResult']);
  $('navBase').value = v.navBase || DEFAULT_BASE;
  const logged = !!v.navToken;
  $('loginBox').style.display = logged ? 'none' : '';
  $('loggedBox').style.display = logged ? '' : 'none';
  setState(logged ? '已登录：' + (v.navUser || '') : '未登录，右键收藏用不了', logged);
  showLast(v.navLastResult);
}

async function login() {
  const base = ($('navBase').value || DEFAULT_BASE).trim().replace(/\/+$/, '');
  const username = $('username').value.trim();
  const password = $('password').value;
  if (!username || !password) {
    setState('用户名和密码都要填', false);
    return;
  }
  setState('登录中...', true);
  try {
    const res = await fetch(base + '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data || !data.token) {
      setState((data && data.error) || ('登录失败 HTTP ' + res.status), false);
      return;
    }
    await chrome.storage.local.set({ navBase: base, navToken: data.token, navUser: (data.user && data.user.username) || username });
    setState('已登录，右键可以收藏了', true);
    $('password').value = '';
    await load();
  } catch (e) {
    setState('连不上这个地址，检查站点地址或网络', false);
  }
}

async function logout() {
  await chrome.storage.local.remove(['navToken', 'navUser']);
  await load();
}

$('loginBtn').addEventListener('click', login);
$('logoutBtn').addEventListener('click', logout);
$('refreshBtn').addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'nav-refresh-tags' });
  setState('标签菜单已刷新', true);
});
$('password').addEventListener('keydown', e => {
  if (e.key === 'Enter') login();
});

load();
