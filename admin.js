// ============================================================
//  管理员功能
// ============================================================

// 打开管理员面板
function openAdminPanel() {
    document.getElementById('adminModal').classList.add('show');
    adminLoadUsers();
}

// 关闭管理员面板
function closeAdminPanel() {
    document.getElementById('adminModal').classList.remove('show');
}

// 加载用户列表
async function adminLoadUsers() {
    try {
        const users = await API.getUsers();
        const el = document.getElementById('adminUserList');
        el.innerHTML = '';
        users.forEach(u => {
            const div = document.createElement('div');
            div.className = 'admin-user-item';
            div.innerHTML = `
                <div class="info">
                    <span class="name">${u.username}</span>
                    <span class="role">${u.role === 'admin' ? '管理员' : '普通'}</span>
                    <span style="font-size:12px;color:#6b7280;">${u.created_at || ''}</span>
                </div>
                <div class="actions">
                    <button class="reset-btn" onclick="adminResetPass('${u.username}')">重置密码</button>
                    ${u.role !== 'admin' ? `<button class="del-btn" onclick="adminDeleteUser('${u.username}')">删除</button>` : ''}
                </div>
            `;
            el.appendChild(div);
        });
        document.getElementById('adminMsg').textContent = '';
    } catch (err) {
        document.getElementById('adminMsg').textContent = '加载用户失败：' + err.message;
    }
}

// 创建用户
async function adminCreateUser() {
    const username = document.getElementById('adminNewUser').value.trim();
    const password = document.getElementById('adminNewPass').value.trim();
    if (!username || !password) {
        showToast('请填写完整');
        return;
    }
    try {
        await API.createUser(username, password);
        showToast('用户创建成功');
        document.getElementById('adminNewUser').value = '';
        document.getElementById('adminNewPass').value = '';
        adminLoadUsers();
    } catch (err) {
        showToast(err.message);
    }
}

// 重置密码
async function adminResetPass(username) {
    const pass = prompt(`重置 ${username} 的密码，输入新密码：`);
    if (!pass) return;
    try {
        await API.resetPassword(username, pass);
        showToast('密码已重置');
    } catch (err) {
        showToast(err.message);
    }
}

// 删除用户
async function adminDeleteUser(username) {
    if (!confirm(`确定删除用户 ${username} 吗？`)) return;
    try {
        await API.deleteUser(username);
        showToast('用户已删除');
        adminLoadUsers();
    } catch (err) {
        showToast(err.message);
    }
}