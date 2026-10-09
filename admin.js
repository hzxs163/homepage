// ============================================================
//  admin.js - 用户管理面板
//  全部使用 textContent / addEventListener 构建，用户名等字段
//  不会进入 HTML 或 JS 字符串上下文
// ============================================================
function openAdminPanel() {
  document.getElementById('adminModal').classList.add('show');
  adminLoadUsers();
}

function closeAdminPanel() {
  document.getElementById('adminModal').classList.remove('show');
}

function setAdminMsg(text) {
  const el = document.getElementById('adminMsg');
  if (el) el.textContent = text;
}

function buildUserRow(user) {
  const row = document.createElement('div');
  row.className = 'admin-user-item';

  const info = document.createElement('div');
  info.className = 'info';

  const name = document.createElement('span');
  name.className = 'name';
  name.textContent = user.username || '';

  const role = document.createElement('span');
  role.className = 'role';
  role.textContent = user.role === 'admin' ? '管理员' : '普通';

  const createdAt = document.createElement('span');
  createdAt.style.fontSize = '12px';
  createdAt.style.color = '#6b7280';
  createdAt.textContent = user.created_at || '';

  info.append(name, role, createdAt);

  const actions = document.createElement('div');
  actions.className = 'actions';

  const resetBtn = document.createElement('button');
  resetBtn.className = 'reset-btn';
  resetBtn.textContent = '重置密码';
  resetBtn.addEventListener('click', () => adminResetPass(user.username));
  actions.appendChild(resetBtn);

  if (user.role !== 'admin') {
    const delBtn = document.createElement('button');
    delBtn.className = 'del-btn';
    delBtn.textContent = '删除';
    delBtn.addEventListener('click', () => adminDeleteUser(user.username));
    actions.appendChild(delBtn);
  }

  row.append(info, actions);
  return row;
}

async function adminLoadUsers() {
  const list = document.getElementById('adminUserList');
  try {
    const users = await API.getUsers();
    list.replaceChildren();
    users.forEach(user => list.appendChild(buildUserRow(user)));
    setAdminMsg('');
  } catch (e) {
    list.replaceChildren();
    setAdminMsg('加载用户失败：' + e.message);
  }
}

async function adminCreateUser() {
  const nameEl = document.getElementById('adminNewUser');
  const passEl = document.getElementById('adminNewPass');
  const username = nameEl.value.trim();
  const password = passEl.value.trim();
  if (!username || !password) {
    showToast('请填写完整');
    return;
  }
  try {
    await API.createUser(username, password);
    showToast('用户创建成功');
    nameEl.value = '';
    passEl.value = '';
    adminLoadUsers();
  } catch (e) {
    showToast(e.message);
  }
}

async function adminResetPass(username) {
  const next = prompt(`重置 ${username} 的密码，输入新密码：`);
  if (!next) return;
  try {
    await API.resetPassword(username, next);
    showToast('密码已重置');
  } catch (e) {
    showToast(e.message);
  }
}

async function adminDeleteUser(username) {
  if (!confirm(`确定删除用户 ${username} 吗？`)) return;
  try {
    await API.deleteUser(username);
    showToast('用户已删除');
    adminLoadUsers();
  } catch (e) {
    showToast(e.message);
  }
}
