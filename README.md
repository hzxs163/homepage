# 📚 我的导航 - 个人网址导航系统

<div align="center">

 **一个基于 Cloudflare Pages + Functions + D1 的自托管网址导航系统**

[![Cloudflare](https://img.shields.io/badge/Cloudflare-Pages%20%2B%20Functions%20%2B%20D1-orange.svg)](https://cloudflare.com)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**[在线演示](https://homepage-a8a.pages.dev)** | **[部署文档](#-快速部署)**

</div>

---

## 📖 项目简介

**我的导航** 是一个轻量级、自托管的网址导航系统，专为个人或小团队设计。基于 Cloudflare Pages Functions 作为后端、D1 (SQLite) 作为数据库，零服务器、零成本，数据云端存储、跨设备同步。

### 🎯 特性一览

| 特性 | 说明 |
|------|------|
| 🔐 **多用户支持** | 每个用户独立账号与数据空间，数据按用户隔离 |
| ☁️ **云端存储** | 数据保存在 Cloudflare D1 数据库，换设备不丢失 |
| 📱 **响应式设计** | 完美适配 PC、平板、手机 |
| 🌍 **边缘部署** | 基于 Cloudflare 全球边缘网络，访问快速 |
| 🎨 **暗黑模式** | 一键切换亮/暗主题，状态记忆 |
| 🔍 **智能搜索** | 按名称、URL、标签实时过滤（Ctrl+K 聚焦） |
| 🖼️ **favicon 代理** | 自带图标代理，CDN 缓存 30 天，懒加载并发拉取 |
| 🔒 **标签密码** | 给标签设置密码，私密链接需解锁可见 |
| 🔢 **标签数值排序** | 给标签配置排序数字，顺序固定不再被使用次数打乱 |
| ⚡ **边缘测速** | 由边缘网络测网站可达性与响应时间 |
| 📦 **批量操作** | JSON 一键导入/导出，方便迁移备份 |

---

## 🛠️ 技术架构

```
浏览器 (原生 JS 前端)
   │  HTTPS
   ▼
Cloudflare Pages ── 静态资源 (index.html / app.js / style.css ...)
   │  ├── functions/[[path]].js  ← Pages Functions 统一后端入口
   │  │     ├── /api/*           业务 API（JWT 鉴权）
   │  │     ├── /api/favicon     favicon 代理（CDN 缓存 30 天）
   │  │     ├── /api/speedtest   边缘测速
   │  │     └── 其他路径         env.ASSETS 放行静态资源
   │  └── 非 /api 路径           直接返回静态页面
   ▼
Cloudflare D1 (SQLite)  ← 绑定为 env.DB
```

- **后端**：Cloudflare Pages Functions（无需单独 Worker，随 Pages 一起部署）
- **数据库**：Cloudflare D1 (SQLite)，参数化查询防注入
- **认证**：JWT（HMAC-SHA256 签名，`JWT_SECRET` 签发）+ PBKDF2-SHA256 密码哈希（10 万次迭代）
- **缓存**：浏览器 localStorage 图标缓存 + favicon CDN 缓存 30 天 + PWA Service Worker 离线缓存

---

## 🚀 快速部署

### 项目结构

```
homepage/
├── index.html           # 前端页面
├── app.js               # 主应用逻辑
├── api.js               # API 调用封装
├── auth.js              # 登录/登出
├── admin.js             # 管理员功能
├── style.css            # 样式
├── sw.js                # PWA Service Worker（网络优先，离线回退）
├── _headers             # 安全响应头 + 缓存策略
├── manifest.json        # PWA 清单
├── favicon.svg          # 站点图标
├── Sortable.min.js      # 拖拽排序库
├── icons/               # PWA 图标
└── functions/
    └── [[path]].js      # Pages Functions 后端（全部 API）
```

### 部署步骤

#### 第一步：创建 D1 数据库并建表

1. Cloudflare Dashboard → **D1** → **创建数据库**，命名如 `nav-db`
2. 进入数据库 → **控制台**，执行以下 SQL（完整 schema，含全部 4 张表和索引）：

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

-- 标签排序表（每个用户一份，tag_order 存 JSON 数组 [{n,s}]）
CREATE TABLE IF NOT EXISTS tag_orders (
    user_id INTEGER PRIMARY KEY,
    tag_order TEXT NOT NULL DEFAULT '[]',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 标签密码表
CREATE TABLE IF NOT EXISTS tag_passwords (
    tag_name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    user_id INTEGER NOT NULL,
    PRIMARY KEY (tag_name, user_id)
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_links_user_id ON links(user_id);
CREATE INDEX IF NOT EXISTS idx_links_user_sort ON links(user_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_tp_user ON tag_passwords(user_id);

-- 插入默认管理员（首次登录后请立即修改密码）
INSERT OR IGNORE INTO users (username, password, role) VALUES ('admin', 'admin123', 'admin');
```

> 说明：`users.username` 的 `UNIQUE` 约束自带索引；`tag_orders.user_id` 为主键自带索引，无需额外创建。

#### 第二步：创建 Pages 项目并部署

1. Cloudflare Dashboard → **Workers & Pages** → **创建应用程序** → **Pages** → **连接到 Git**
2. 选择本仓库（`hzxs163/homepage`）
3. 构建设置：
   - 框架预设：**None**
   - 构建命令：**留空**
   - 输出目录：**留空**（项目本身即静态站，Functions 自动生效）
4. 点击 **保存并部署**

#### 第三步：绑定 D1 数据库

1. Pages 项目 → **设置** → **绑定(Bindings)** → **添加** → **D1 数据库**
2. 变量名填 **`DB`**，数据库选择第一步创建的 `nav-db`
3. 保存（绑定后会自动重新部署）

#### 第四步：配置环境变量

Pages 项目 → **设置** → **环境变量** → 添加：

| 变量名 | 必填 | 说明 |
|--------|------|------|
| `DB` | 是 | D1 数据库绑定（见上一步） |
| `JWT_SECRET` | **是** | JWT 签名密钥，任意长随机字符串（如 `openssl rand -hex 32` 生成），用于签发登录 Token。修改后所有已登录用户需重新登录 |

> ⚠️ **`JWT_SECRET` 必须配置**，否则登录接口无法签发 Token。

#### 第五步：访问

部署完成后访问 `https://你的项目名.pages.dev`，使用默认账号登录：

| 账号 | 密码 | 角色 |
|------|------|------|
| `admin` | `admin123` | 管理员 |

**首次登录后请立即修改管理员密码**（管理面板 → 重置密码）。

---

## 📝 使用指南

### 管理员操作

1. **登录**：右上角用户菜单 → 登录
2. **创建用户**：用户菜单 → **管理** → 输入用户名和密码 → 创建
3. **重置密码**：管理面板中对应用户 → 重置密码
4. **删除用户**：管理面板中对应用户 → 删除

### 用户操作

| 操作 | 方法 |
|------|------|
| 添加链接 | 点击 **添加网址**（支持从剪贴板识别网址） |
| 编辑链接 | 桌面：长按卡片 / 右键菜单 → 编辑；手机：长按卡片 |
| 删除链接 | 卡片右键菜单 → 删除 |
| 搜索 | 搜索框输入关键词，或 `Ctrl+K` 聚焦 |
| 标签筛选 | 点击标签栏中的标签；打开页面默认定位指定标签（可在 `app.js` 的 `loadActiveTag` 中修改） |
| 标签排序 | 标签栏 ⚙️ 进入拖拽排序；或 用户菜单 → 标签管理 → 输入数字（越小越靠前），回车自动保存 |
| 标签密码 | 用户菜单 → 标签管理 → 设置/修改/移除标签密码；带锁标签需输入密码解锁 |
| 链接排序 | 点击 🔒 解锁拖拽 → 拖动卡片，自动保存 |
| 导入 / 导出 | 点击 **导入**（选择 JSON）/ **导出**（下载 JSON 备份） |
| 测速 | 点击 **测速**，批量检测所有链接可达性与响应时间 |
| 切换主题 | 点击 🌞/🌙 |

---

## 🔌 API 接口文档

所有 API 均由 `functions/[[path]].js` 处理；除 `/api/favicon` 外均需在请求头携带 `Authorization: Bearer <token>`（登录后获得）。

### 认证

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/auth/login` | POST | 登录，body: `{username, password}`，返回 JWT |

### 链接管理

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/links` | GET | 获取当前用户所有链接（`?sort=sort_order&order=ASC`） |
| `/api/links` | POST | 添加链接 |
| `/api/links/:id` | PUT | 更新链接 |
| `/api/links/:id` | DELETE | 删除链接 |
| `/api/links/:id/sort` | PUT | 更新单个链接排序 |
| `/api/links/export` | GET | 导出当前用户全部链接 |
| `/api/links/import` | POST | 批量导入（按 url 去重） |

### 标签

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/tags` | GET | 获取全部标签（按链接 tag 统计；前端实际用链接列表现算，此接口为备用） |
| `/api/tags/order` | GET | 获取标签排序数组 |
| `/api/tags/order` | POST | 保存标签排序，body: `{tags: [{n:"标签名", s:10}, ...]}` |

### 标签密码

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/tag-passwords` | GET | 获取当前用户全部标签密码哈希 |
| `/api/tag-passwords` | POST | 批量保存标签密码，body: `{passwords: {标签名: sha256哈希}}` |
| `/api/tag-passwords/:name` | DELETE | 删除指定标签密码 |

### 工具接口

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/favicon?domain=xxx` | GET | favicon 代理（**公开，无需登录**）。校验域名防 SSRF，CDN 缓存 30 天，失败返回 502 |
| `/api/speedtest` | POST | 边缘测速，body: `{urls: [url...]}`，并发检测返回 `{ok, ms}` |

### 管理员

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/admin/users` | GET | 用户列表（仅管理员） |
| `/api/admin/users` | POST | 创建用户（仅管理员） |
| `/api/admin/users/:username` | PUT | 重置密码（仅管理员） |
| `/api/admin/users/:username` | DELETE | 删除用户（仅管理员） |

---

## 🔒 安全说明

| 措施 | 说明 |
|------|------|
| JWT 认证 | Token 使用 `JWT_SECRET` 做 HMAC-SHA256 签名，防伪造 |
| 密码哈希 | PBKDF2-SHA256，10 万次迭代；旧明文密码首次登录自动升级为哈希 |
| 数据隔离 | 所有查询强制带 `user_id`，用户只能访问自己的数据 |
| SQL 注入防护 | 全部使用 D1 参数化查询（`prepare` + `bind`） |
| favicon 防 SSRF | `isInternalHost` 过滤内网 IP、localhost、保留网段 |
| 安全响应头 | `_headers` 配置 CSP、X-Frame-Options、nosniff 等 |
| 管理员权限 | 普通用户无法访问 `/api/admin/*` |

---

## ❓ 常见问题

### 1. 登录报错 / 提示"请先登录"？

- 检查 Pages 项目是否已配置 **`JWT_SECRET`** 环境变量
- 检查 D1 绑定变量名是否为 **`DB`**
- 重新登录一次（Token 有效期 7 天）

### 2. 更新代码后页面还是旧版？

**原因**：Service Worker 缓存了旧资源。

**解决**：连续强制刷新两次（间隔几秒），让新版 Service Worker 接管；项目已采用"静态资源网络优先"策略，更新后会立即生效。

### 3. 图标不显示 / 显示首字母？

- 目标站点可能没有 favicon，或 Google favicon 服务取不到 → 自动回退首字母
- favicon 代理有 30 天 CDN 缓存，站点换图标后最长 30 天更新（可清 CDN 缓存或临时改短 `cacheTtl`）
- 失败域名有 1 天负缓存，会自动重试

### 4. 标签顺序为什么会变？

项目使用**排序数值**固定顺序（标签管理 → 输入数字，越小越靠前）。新标签默认排在最后，不会被使用次数打乱。若某标签没有排序数字，会按使用次数排在末尾。

### 5. 如何备份数据？

点击 **导出** 下载 JSON；或在 GitHub 仓库创建 Release 快照（推荐推送前备份）。

### 6. 数据存在哪里？

全部存在 Cloudflare D1（`users` / `links` / `tag_orders` / `tag_passwords` 四张表），与浏览器缓存无关，换设备登录同一账号即同步。

---

## 📄 开源协议

本项目基于 MIT 协议开源。

---

## 🙏 致谢

- [Cloudflare](https://www.cloudflare.com/) - Pages、Functions、D1 边缘服务
- [Sortable.js](https://sortablejs.github.io/Sortable/) - 拖拽排序库

---

<div align="center">

**[⬆ 回到顶部](#-我的导航---个人网址导航系统)**

</div>
