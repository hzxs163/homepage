-- 迁移 0001：列表缓存版本号表 + 唯一索引改为按用户
-- 在 D1 控制台或用 wrangler 执行；整体可重复运行（幂等）。
-- 建议按顺序逐段执行，先跑第 0 步确认无风险再往下。

-- ---------- 0. 执行前自检（只读）----------
-- 0.1 确认同一用户下没有重复网址（有则先人工清理，否则第 2 步建索引会失败）
SELECT user_id, url, COUNT(*) AS n
FROM links
GROUP BY user_id, url
HAVING n > 1;

-- 0.2 确认当前的全局唯一索引存在（它才是"第二个用户无法收藏同一网址"的根因）
SELECT name, sql FROM sqlite_master WHERE type = 'index' AND name = 'idx_unique_url';

-- ---------- 1. 列表接口边缘缓存所需的版本号 ----------
-- 每次链接写操作自增一行，GET 用它拼缓存键：既保证写完立刻读到新数据，
-- 又让缓存命中时完全不扫描 links 表。缺这张表时代码会自动退回"不缓存"，不会报错。
CREATE TABLE IF NOT EXISTS link_epochs (
    user_id INTEGER PRIMARY KEY,
    epoch INTEGER NOT NULL DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ---------- 2. 唯一约束从"全站唯一"改为"每用户唯一" ----------
DROP INDEX IF EXISTS idx_unique_url;
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_url ON links (user_id, url);

-- ---------- 3. 执行后验证（只读）----------
-- 3.1 索引定义应包含 user_id
SELECT name, sql FROM sqlite_master WHERE type = 'index' AND name = 'idx_unique_url';

-- 3.2 版本号表应存在
SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'link_epochs';
