// 首屏前置脚本：必须在 body 解析前同步执行，避免主题闪白
// 独立成文件是为了让 CSP 可以去掉 script-src 'unsafe-inline'
try {
  if (localStorage.getItem('darkTheme') === 'true') document.body.classList.add('dark');
} catch (e) {}

// 清理旧的第三方图标缓存（favicon.im 等），统一走 /api/favicon 代理
try {
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith('icon_')) {
      const value = localStorage.getItem(key) || '';
      if (value.indexOf('/api/favicon') !== 0) localStorage.removeItem(key);
    }
  }
} catch (e) {}
