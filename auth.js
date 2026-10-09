// ============================================================
//  auth.js - 登录 / 登出
// ============================================================
function showLoginPage() {
  const loginPage = document.getElementById('loginPage');
  const mainPage = document.getElementById('mainPage');
  if (loginPage) {
    loginPage.style.display = 'flex';
    loginPage.classList.add('show');
  }
  if (mainPage) mainPage.style.display = 'none';
}

function showMainPage() {
  const loginPage = document.getElementById('loginPage');
  const mainPage = document.getElementById('mainPage');
  if (loginPage) {
    loginPage.style.display = 'none';
    loginPage.classList.remove('show');
  }
  if (mainPage) mainPage.style.display = 'block';
}

async function doLogin() {
  const usernameEl = document.getElementById('loginUsername');
  const passwordEl = document.getElementById('loginPassword');
  const errorEl = document.getElementById('loginError');
  const buttonEl = document.getElementById('loginBtn');
  const username = usernameEl ? usernameEl.value.trim() : '';
  const password = passwordEl ? passwordEl.value.trim() : '';

  if (!username || !password) {
    errorEl.textContent = '请输入用户名和密码';
    return;
  }

  buttonEl.disabled = true;
  errorEl.textContent = '';
  buttonEl.textContent = '登录中...';
  try {
    const result = await API.login(username, password);
    // 换账号前清掉上一个会话的标签授权，避免串号
    API.clearSession();
    localStorage.setItem('token', result.token);
    localStorage.setItem('user', JSON.stringify(result.user));
    showToast('登录成功！');
    enterMainPage();
  } catch (e) {
    errorEl.textContent = e.message;
  } finally {
    buttonEl.disabled = false;
    buttonEl.textContent = '登 录';
  }
}

function doLogout() {
  API.clearSession();
  showLoginPage();
  // 上一个账号的私有数据不应留在浏览器里
  localStorage.removeItem('siteList');
  showToast('已退出');
}

function enterMainPage() {
  showMainPage();
  refreshUserMenu();
  if (typeof initApp === 'function') initApp();
}

function getAuthUser() {
  try {
    return JSON.parse(localStorage.getItem('user') || '{}');
  } catch {
    return {};
  }
}

function isLoggedIn() {
  return !!localStorage.getItem('token');
}
