# 📚 我的导航 - 个人网址导航系统

<div align="center">

🔖 **一个基于 Cloudflare 技术栈、支持多用户的个人网址导航系统**

[![Cloudflare](https://img.shields.io/badge/Cloudflare-Workers%20%2B%20Pages%20%2B%20D1-orange.svg)](https://cloudflare.com)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Made with ❤️](https://img.shields.io/badge/Made%20with-❤-red.svg)](https://github.com/hzxs163/homepage)

**[在线演示](https://homepage-a8a.pages.dev)** | **[部署文档](#-快速部署)**

</div>

---

## 📖 项目简介

**我的导航** 是一个轻量级、自托管的网址导航系统，专为个人或小团队设计。它基于 Cloudflare 的 D1 数据库和 Workers 后端，支持多用户独立管理自己的书签，数据云端存储，跨设备同步。

### 🎯 为什么选择这个导航系统？

| 特性 | 说明 |
|------|------|
| 🔐 **多用户支持** | 每个用户拥有独立的账号和数据空间 |
| ☁️ **云端存储** | 数据保存在 Cloudflare D1 数据库，换设备不丢失 |
| 📱 **响应式设计** | 完美适配 PC、平板、手机 |
| 🚀 **高性能** | 基于 Cloudflare 边缘网络，全球访问快速 |
| 🎨 **暗黑模式** | 自动适应系统主题，保护眼睛 |
| 💰 **零成本** | Cloudflare 免费额度足够个人使用 |
| 📦 **批量操作** | 支持 JSON 导入/导出，方便数据迁移 |
| 🔍 **智能搜索** | 支持按名称、URL、标签搜索 |

---

## ✨ 功能特性

### 🔧 核心功能

| 功能 | 描述 |
|------|------|
| **用户管理** | 管理员统一创建账号，分配角色 |
| **链接管理** | 增删改查网址，自定义标签 |
| **标签系统** | 灵活分类，支持标签筛选 |
| **拖拽排序** | 自由调整链接顺序 |
| **搜索过滤** | 实时搜索，快速定位 |
| **数据导入导出** | JSON 格式批量操作 |
| **链接测速** | 检测网站可用性，显示响应时间 |
| **图标缓存** | 网站 favicon 懒加载，自动缓存 |
| **快捷操作** | Ctrl+K 搜索，ESC 关闭弹窗 |
| **记住状态** | 记住上次选中的标签和滚动位置 |

### 📊 技术亮点

- **前端**：原生 JS + CSS，零依赖，加载快速
- **后端**：Cloudflare Workers，边缘计算
- **数据库**：Cloudflare D1 (SQLite)，轻量高效
- **认证**：JWT Token，安全可靠
- **缓存**：localStorage + D1 双层缓存

---

## 🎨 界面预览

| 桌面端 | 移动端 |
|--------|--------|
| 搜索栏 + 功能按钮 + 用户菜单 | 搜索栏自适应折叠 |
| 标签筛选栏 | 标签自动收起 |
| 卡片网格 (8列) | 卡片网格 (2列) |
| 暗黑/明亮主题切换 | 触控优化，长按菜单 |

---

## 🚀 快速部署

### 项目结构

```
my-nav/
├── index.html          # 前端页面
├── style.css           # 样式文件
├── app.js              # 主应用逻辑
├── api.js              # API 调用封装
├── auth.js             # 认证管理
├── admin.js            # 管理员功能
└── .github/
    └── workflows/
        └── deploy.yml  # 自动部署配置
```

### 部署步骤

#### 第一步：部署后端 Worker

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 进入 **Workers & Pages** → **创建应用程序** → **创建 Worker**
3. 命名为 `nav-api`
4. 点击 **编辑代码**，粘贴 Worker 代码
5. 点击 **保存并部署**

#### 第二步：创建 D1 数据库

1. 在 Cloudflare 控制台进入 **D1** 选项卡
2. 点击 **创建数据库**，命名为 `nav-db`
3. 进入数据库，执行以下 SQL：

```sql
-- 用户表
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT DEFAULT 'user',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 链接表
CREATE TABLE IF NOT EXISTS links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    url TEXT NOT NULL,
    icon TEXT,
    tags TEXT,
    sort_order INTEGER DEFAULT 0,
    click_count INTEGER DEFAULT 0,
    icon_url TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_links_user_id ON links(user_id);
CREATE INDEX IF NOT EXISTS idx_links_user_sort ON links(user_id, sort_order);

-- 插入默认管理员
INSERT OR IGNORE INTO users (username, password, role) VALUES ('admin', 'admin123', 'admin');
```

#### 第三步：绑定数据库到 Worker

1. 进入 Worker `nav-api` → **设置** → **绑定**
2. 点击 **添加** → 选择 **D1 数据库**
3. 变量名填 `DB`，选择 `nav-db`
4. 点击 **保存**

#### 第四步：部署前端 Pages

1. 在 Cloudflare 控制台进入 **Pages** 选项卡
2. 点击 **创建应用程序** → **连接到 Git**
3. 选择你的 GitHub 仓库
4. 构建配置：
   - 构建命令：留空
   - 输出目录：留空
5. 点击 **保存并部署**

#### 第五步：配置环境变量

在 Pages 项目 → **设置** → **环境变量** 中添加：

| 变量名 | 值 | 说明 |
|--------|-----|------|
| `API_URL` | `https://nav-api.你的用户名.workers.dev/api` | 后端 API 地址 |

---

## ⚙️ 配置说明

### 前端配置 (`api.js`)

```javascript
const API_BASE = 'https://nav-api.你的用户名.workers.dev/api';
```

修改为你自己的 Worker 地址。

### 默认账号

| 账号 | 密码 | 角色 |
|------|------|------|
| `admin` | `admin123` | 管理员 |

---

## 📝 使用指南

### 管理员操作

1. **登录**：使用 `admin` / `admin123` 登录
2. **创建用户**：点击右上角用户菜单 → **👥 管理** → 输入用户名和密码 → 点击创建
3. **重置密码**：在管理面板中点击对应用户的 **重置密码**
4. **删除用户**：在管理面板中点击对应用户的 **删除**

### 用户操作

| 操作 | 方法 |
|------|------|
| 添加链接 | 点击 **添加网址** |
| 编辑链接 | PC：长按卡片 / 手机：长按卡片弹出菜单 |
| 删除链接 | 卡片菜单 → 删除 |
| 搜索 | 在搜索框输入关键词 |
| 标签筛选 | 点击标签筛选栏中的标签 |
| 拖拽排序 | 解锁拖拽锁定 (🔒) → 拖动卡片 |
| 导入数据 | 点击 **导入** → 选择 JSON 文件 |
| 导出数据 | 点击 **导出** |
| 测速 | 点击 **测速** |
| 切换主题 | 点击 🌞/🌙 |

---

## 🛣️ API 接口文档

### 认证相关

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/auth/login` | POST | 用户登录 |
| `/api/auth/verify` | GET | 验证 Token |

### 链接管理

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/links` | GET | 获取用户所有链接（支持排序） |
| `/api/links` | POST | 添加链接 |
| `/api/links/:id` | PUT | 更新链接 |
| `/api/links/:id` | DELETE | 删除链接 |
| `/api/links/:id/sort` | PUT | 更新排序 |
| `/api/links/:id/click` | POST | 记录点击 |
| `/api/links/export` | GET | 导出链接 |
| `/api/links/import` | POST | 批量导入 |

### 标签管理

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/tags` | GET | 获取所有标签 |
| `/api/tags/order` | POST | 保存标签排序 |

### 管理员

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/admin/users` | GET | 获取所有用户 |
| `/api/admin/users` | POST | 创建用户 |
| `/api/admin/users/:username/reset` | PUT | 重置密码 |
| `/api/admin/users/:username` | DELETE | 删除用户 |

---

## ❓ 常见问题

### 1. 登录后页面空白？

**原因**：Token 过期或 API 地址配置错误。

**解决**：
1. 检查 `api.js` 中的 `API_BASE` 地址是否正确
2. 清除浏览器缓存和 localStorage
3. 重新登录

### 2. 图标不显示？

**原因**：网站没有 favicon 或跨域限制。

**解决**：
- 这是正常现象，不显示图标的网站会自动显示首字母
- 首次加载会慢一些，滚动时会逐个加载并缓存

### 3. 拖拽排序不生效？

**解决**：点击 🔒 按钮解锁拖拽锁定，然后拖动卡片。

### 4. 如何备份数据？

点击 **导出** 按钮，下载 JSON 文件保存到本地。

### 5. 支持移动端吗？

✅ 完全支持。已针对移动端优化：
- 卡片 2 列显示
- 标签自动收起
- 长按弹出操作菜单
- 搜索框自适应

---

## 🔒 安全说明

| 安全措施 | 说明 |
|---------|------|
| JWT 认证 | Token 有效期 7 天，自动刷新 |
| 密码哈希 | 存储哈希值（生产环境建议 bcrypt） |
| 数据隔离 | 用户只能访问自己的数据 |
| CORS 配置 | 仅允许指定域名访问 |
| 管理员权限 | 普通用户无法访问管理接口 |

---

## 📄 开源协议

本项目基于 MIT 协议开源。

---

## 🙏 致谢

- [Cloudflare](https://www.cloudflare.com/) - 提供 Workers、Pages、D1 等强大服务
- [Sortable.js](https://sortablejs.github.io/Sortable/) - 拖拽排序库

---

<div align="center">

**[⬆ 回到顶部](#-我的导航---个人网址导航系统)**

Made with ❤️

</div>
