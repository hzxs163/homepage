// ============================================================
//  主应用逻辑
// ============================================================

// ============================================================
//  目录
// ============================================================
//  1. 全局变量
//  2. 工具函数
//  3. 标签排序存储
//  4. 记住上次选中的标签
//  5. 记住滚动位置
//  6. 骨架屏
//  7. 主题
//  8. 数据加载 - 秒开策略
//  9. 重新绑定标签事件
//  10. 渲染 - 标签相关
//  11. 标签拖拽排序
//  12. 获取筛选列表
//  13. 渲染 - 卡片列表 (增量更新)
//  14. 绑定卡片事件
//  15. 更新单个卡片内容
//  16. 右键菜单
//  17. 搜索
//  18. 拖拽
//  19. 弹窗（添加/编辑）
//  20. 标签相关（含展开/收起）
//  21. 保存 / 删除
//  22. 剪贴板
//  23. 测速
//  24. 导入 / 导出
//  25. 标签栏折叠（移动端）
//  26. 返回顶部
//  27. 键盘快捷键
//  28. 排序切换
//  29. 初始化
//  30. 管理员功能
//  31. 事件绑定
//  32. 用户下拉菜单
//  33. 页面加载后自动登录
//  34. 懒加载图标
//  35. 标签密码管理
// ============================================================

// ============================================================
//  1. 全局变量
// ============================================================

const TOAST_DURATION = 2000;
const REQUEST_TIMEOUT = 3000;
const SCROLL_THRESHOLD = 300;

let siteList = [];
let activeTag = 'all';
let isRendering = false;
let selectedTags = [];
let editingId = null;
let latencyCache = {};
let sortableInstance = null;
let isDragLocked = true;
let isDarkTheme = false;
let isDragging = false;
let isMouseMoving = false;
let longPressTimer = null;
let tagExpandState = {};
let tagSortOrder = [];
let isTagSortMode = false;
let tagSortableInstance = null;
let isLoading = true;

// ============================================================
//  2. 工具函数
// ============================================================

function showToast(text, duration = TOAST_DURATION) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.innerText = text;
    toast.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => toast.classList.remove('show'), duration);
}
window.showToast = showToast;

function isValidUrl(url) {
    if (!url) return false;
    return /^(http|https):\/\/[a-zA-Z0-9.-]+(:\d+)?(\/[^#?]*)*(\?.*)?(#.*)?$/i.test(url);
}

function getFileName() {
    const d = new Date();
    return `站点备份-${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}.json`;
}

function getSiteLogoSync(site) {
    if (!site) {
        return 'https://ui-avatars.com/api/?name=🔗&background=00b866&color=fff&size=48';
    }
    
    const cacheKey = 'icon_' + site.id;
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
        return cached;
    }
    
    // 🔥 使用 favicon.im 获取图标
    try {
        const u = new URL(site.url || '');
        const domain = u.hostname.replace(/^www\./, '');
        if (domain) {
            return `https://favicon.im/${domain}`;
        }
    } catch { }
    
    return null;
}

function isMobileDevice() {
    return /Android|iPhone|iPad|iPod|Windows Phone/i.test(navigator.userAgent);
}

function loadLatencyCache() {
    try {
        const saved = localStorage.getItem('latencyCache');
        if (saved) {
            latencyCache = JSON.parse(saved);
        }
    } catch { latencyCache = {}; }
}

function saveLatencyCache() {
    try {
        localStorage.setItem('latencyCache', JSON.stringify(latencyCache));
    } catch { }
}


// ============================================================
//  3. 标签排序存储
// ============================================================
// ============================================================
//  3. 标签排序存储（D1）
// ============================================================

// 从 D1 加载标签排序
async function loadTagSortOrder() {
    try {
        const response = await fetch('/api/tags/order', {
            headers: {
                'Authorization': 'Bearer ' + localStorage.getItem('token')
            }
        });
        if (!response.ok) {
            throw new Error('加载排序失败');
        }
        const data = await response.json();
        if (Array.isArray(data) && data.length > 0) {
            tagSortOrder = data;
            return true;
        }
        return false;
    } catch (err) {
        console.error('加载标签排序失败:', err);
        return false;
    }
}

// 保存标签排序到 D1
async function saveTagSortOrder() {
    try {
        const response = await fetch('/api/tags/order', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + localStorage.getItem('token')
            },
            body: JSON.stringify({ tags: tagSortOrder })
        });
        if (!response.ok) {
            throw new Error('保存排序失败');
        }
        return true;
    } catch (err) {
        console.error('保存标签排序失败:', err);
        return false;
    }
}


// ============================================================
//  4. 记住上次选中的标签
// ============================================================

function loadActiveTag() {
    const saved = localStorage.getItem('activeTag');
    if (saved && saved !== 'all') {
        const tags = getAllTags();
        if (tags.includes(saved)) {
            activeTag = saved;
            return true;
        }
    }
    activeTag = 'all';
    return false;
}

function saveActiveTag(tag) {
    localStorage.setItem('activeTag', tag);
}

// ============================================================
//  5. 记住滚动位置
// ============================================================

function saveScrollPosition() {
    const mainPage = document.getElementById('mainPage');
    if (mainPage) {
        localStorage.setItem('scrollPosition', String(window.scrollY));
    }
}

function restoreScrollPosition() {
    const saved = localStorage.getItem('scrollPosition');
    if (saved) {
        setTimeout(() => {
            window.scrollTo(0, parseInt(saved));
        }, 100);
    }
}

// ============================================================
//  6. 骨架屏
// ============================================================

function showSkeleton() {
    const wrap = document.getElementById('siteListWrap');
    if (!wrap) return;
    
    if (localStorage.getItem('cardHTML')) {
        return;
    }
    
    if (localStorage.getItem('siteList')) {
        return;
    }
    
    isLoading = true;
    let skeletonHtml = '';
    const count = window.innerWidth > 1200 ? 16 : (window.innerWidth > 768 ? 12 : 8);
    for (let i = 0; i < count; i++) {
        skeletonHtml += `
            <div class="skeleton-item">
                <div class="skeleton-icon"></div>
                <div class="skeleton-line" style="width:60%;"></div>
                <div class="skeleton-line" style="width:80%;"></div>
                <div class="skeleton-line" style="width:40%;"></div>
            </div>
        `;
    }
    wrap.innerHTML = skeletonHtml;
}

function hideSkeleton() {
    isLoading = false;
    const wrap = document.getElementById('siteListWrap');
    if (wrap) {
        if (wrap.querySelector('.skeleton-item')) {
            wrap.innerHTML = '';
        }
    }
}

// ============================================================
//  7. 主题
// ============================================================

function initTheme() {
    isDarkTheme = localStorage.getItem('darkTheme') === 'true';
    document.body.classList.toggle('dark', isDarkTheme);
    const btn = document.getElementById('themeToggleBtn');
    if (btn) btn.innerText = isDarkTheme ? '🌙' : '🌞';
}

function toggleTheme() {
    isDarkTheme = !isDarkTheme;
    document.body.classList.toggle('dark', isDarkTheme);
    localStorage.setItem('darkTheme', isDarkTheme);
    const btn = document.getElementById('themeToggleBtn');
    if (btn) btn.innerText = isDarkTheme ? '🌙' : '🌞';
    showToast(isDarkTheme ? '暗黑模式' : '明亮模式');
}

// ============================================================
//  8. 数据加载 - 秒开策略
// ============================================================

async function loadLinks(sortBy = 'sort_order', order = 'ASC') {
    const statusEl = document.getElementById('syncStatus');
    let hasCache = false;
    const wrap = document.getElementById('siteListWrap');
    const tagsList = document.getElementById('tagsList');
    
    const cardHTML = localStorage.getItem('cardHTML');
    if (cardHTML && wrap) {
        wrap.innerHTML = cardHTML;
        wrap._clickBound = false;
        wrap._contextMenuBound = false;
        restoreScrollPosition();
        if (statusEl) statusEl.textContent = '● 缓存模式 ⚡';
    }
    
    const tagsHTML = localStorage.getItem('tagsHTML');
    if (tagsHTML && tagsList) {
        tagsList.innerHTML = tagsHTML;
        rebindTagEvents();
    }
    
    const cached = localStorage.getItem('siteList');
    if (cached) {
        try {
            const parsed = JSON.parse(cached);
            if (Array.isArray(parsed) && parsed.length > 0) {
                siteList = parsed;
                hasCache = true;
                if (!cardHTML) {
                    hideSkeleton();
                    renderAll();
                    restoreScrollPosition();
                }
                if (statusEl && !cardHTML) statusEl.textContent = '● 缓存模式 ⚡';
            }
        } catch { }
    }
    
    if (!hasCache && !cardHTML) {
        showSkeleton();
        if (statusEl) statusEl.textContent = '● 加载中...';
    } else {
        if (statusEl && !cardHTML) statusEl.textContent = '● 更新中...';
    }
    
    try {
        const data = await API.getLinks(sortBy, order);
        
        if (!Array.isArray(data)) {
            throw new Error('返回的数据不是数组');
        }
        
        // 🔥 修改：读取 icon_url 字段
        siteList = data.map(item => {
            let tags = item.tags || [];
            if (typeof tags === 'string') {
                try { tags = JSON.parse(tags); } catch { tags = []; }
            }
            if (!Array.isArray(tags)) tags = [];
            
            // 🔥 读取 icon_url
            let iconUrl = item.icon_url || '';
            
            // 🔥 自动缓存到 localStorage
            if (iconUrl) {
                const cacheKey = 'icon_' + item.id;
                if (!localStorage.getItem(cacheKey)) {
                    localStorage.setItem(cacheKey, iconUrl);
                }
            }
            
            return {
                id: item.id,
                name: item.title || '未命名',
                url: item.url || '',
                icon: item.icon || '',
                icon_url: iconUrl,  // 🔥 新增
                tags: tags,
                sort: item.sort_order || 0,
                click_count: item.click_count || 0
            };
        });
        
        localStorage.setItem('siteList', JSON.stringify(siteList));
        
        hideSkeleton();
        renderAll();
        restoreScrollPosition();
        
        if (statusEl) statusEl.textContent = '● 云端模式 ✅';
        
    } catch (err) {
        console.error('后台更新失败:', err);
        if (!hasCache && !cardHTML) {
            siteList = [];
            hideSkeleton();
            renderAll();
            showToast('加载数据失败，请刷新重试');
        }
        if (statusEl) statusEl.textContent = hasCache || cardHTML ? '● 缓存模式' : '● 无数据';
    }
}

// ============================================================
//  9. 重新绑定标签事件
// ============================================================

async function rebindTagEvents() {
    const tagsList = document.getElementById('tagsList');
    if (!tagsList) return;
    
    tagsList.querySelectorAll('.tag-item').forEach(item => {
        const newItem = item.cloneNode(true);
        item.parentNode.replaceChild(newItem, item);
        
        newItem.onclick = async function() {
            if (isTagSortMode) return;
            const tagName = this.dataset.tag;
            const passwordHash = await getTagPasswordHash(tagName);
            if (passwordHash && !isTagUnlocked(tagName)) {
                showTagPasswordModal(tagName, passwordHash);
                return;
            }
            document.querySelectorAll('.tag-item').forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            activeTag = tagName;
            saveActiveTag(activeTag);
            renderList();
            if (isMobileDevice()) {
                const wrap = document.getElementById('tagsFilterWrap');
                if (wrap) wrap.classList.remove('expanded');
            }
        };
    });
}


// ============================================================
//  10. 渲染 - 标签相关
// ============================================================
// ============================================================
//  10. 渲染 - 标签相关
// ============================================================

let isRenderingTags = false;

function getAllTags() {
    if (!Array.isArray(siteList)) {
        siteList = [];
        return [];
    }

    const tagCount = {};
    siteList.forEach(site => {
        if (site.tags && Array.isArray(site.tags)) {
            site.tags.forEach(tag => {
                if (tag) tagCount[tag] = (tagCount[tag] || 0) + 1;
            });
        }
    });

    let tags = Object.keys(tagCount);

    if (tagSortOrder.length > 0) {
        const ordered = [];
        const unordered = [];
        const tagSet = new Set(tags);
        tagSortOrder.forEach(t => {
            if (tagSet.has(t)) {
                ordered.push(t);
                tagSet.delete(t);
            }
        });
        const remaining = Array.from(tagSet);
        remaining.sort((a, b) => tagCount[b] - tagCount[a] || a.localeCompare(b));
        tags = ordered.concat(remaining);
    } else {
        tags.sort((a, b) => tagCount[b] - tagCount[a] || a.localeCompare(b));
        tagSortOrder = tags;
        saveTagSortOrder();
    }

    return [...new Set(tags)];
}

async function renderTagsFilter() {
    // 🔥 防重复调用
    if (isRenderingTags) {
        console.log('⏳ 标签正在渲染，跳过重复调用');
        return;
    }
    isRenderingTags = true;

    try {
        const tagsList = document.getElementById('tagsList');
        if (!tagsList) return;

        // 清空
        tagsList.innerHTML = '';
        tagsList.classList.remove('show');

        const allTags = getAllTags();

        const allTag = document.createElement('div');
        allTag.className = `tag-item all ${activeTag === 'all' ? 'active' : ''}`;
        allTag.innerText = '全部';
        allTag.dataset.tag = 'all';
        allTag.onclick = () => {
            document.querySelectorAll('.tag-item').forEach(t => t.classList.remove('active'));
            allTag.classList.add('active');
            activeTag = 'all';
            saveActiveTag('all');
            renderList();
            if (isMobileDevice()) {
                const wrap = document.getElementById('tagsFilterWrap');
                if (wrap) wrap.classList.remove('expanded');
            }
        };
        tagsList.appendChild(allTag);

        const passwords = await loadTagPasswords();

        for (const tag of allTags) {
            const item = document.createElement('div');
            item.className = `tag-item ${activeTag === tag ? 'active' : ''}`;
            const passwordHash = passwords[tag] || null;
            const lockIcon = passwordHash ? '🔒 ' : '';
            item.innerText = lockIcon + tag;
            item.dataset.tag = tag;
            item.dataset.sortable = 'true';
            item.onclick = async function() {
                if (isTagSortMode) return;
                const tagName = this.dataset.tag;
                const passwordHash = await getTagPasswordHash(tagName);
                if (passwordHash && !isTagUnlocked(tagName)) {
                    showTagPasswordModal(tagName, passwordHash);
                    return;
                }
                document.querySelectorAll('.tag-item').forEach(t => t.classList.remove('active'));
                this.classList.add('active');
                activeTag = tagName;
                saveActiveTag(tagName);
                renderList();
                if (isMobileDevice()) {
                    const wrap = document.getElementById('tagsFilterWrap');
                    if (wrap) wrap.classList.remove('expanded');
                }
            };
            tagsList.appendChild(item);
        }

        const sortBtn = document.createElement('div');
        sortBtn.className = 'tag-sort-toggle';
        sortBtn.innerHTML = isTagSortMode ? '✅ 完成' : '⚙️';
        sortBtn.title = isTagSortMode ? '完成排序' : '拖拽调整标签顺序';
        sortBtn.style.cssText = `
            padding: 4px 10px;
            border-radius: 6px;
            background: ${isTagSortMode ? '#10b981' : '#e5e7eb'};
            color: ${isTagSortMode ? '#fff' : '#4b5563'};
            font-size: 13px;
            cursor: pointer;
            transition: all 0.2s;
            user-select: none;
            display: inline-flex;
            align-items: center;
            gap: 4px;
            border: none;
            margin-left: auto;
        `;
        if (document.body.classList.contains('dark')) {
            sortBtn.style.background = isTagSortMode ? '#10b981' : '#404258';
            sortBtn.style.color = isTagSortMode ? '#fff' : '#d1d5db';
        }
        sortBtn.onclick = () => {
            toggleTagSortMode();
        };
        tagsList.appendChild(sortBtn);

        if (isTagSortMode) {
            initTagSortable();
        }

        try {
            localStorage.setItem('tagsHTML', tagsList.innerHTML);
        } catch (e) {}

        // 显示标签
        tagsList.classList.add('show');

    } finally {
        isRenderingTags = false;
    }
}

// ============================================================
//  11. 标签拖拽排序
// ============================================================

function toggleTagSortMode() {
    isTagSortMode = !isTagSortMode;
    if (tagSortableInstance) {
        tagSortableInstance.destroy();
        tagSortableInstance = null;
    }
    if (isTagSortMode) {
        showToast('进入排序模式，拖动标签调整顺序');
    } else {
        const items = document.querySelectorAll('.tag-item:not(.all)');
        tagSortOrder = [];
        items.forEach(el => {
            const tag = el.dataset.tag;
            if (tag && tag !== 'all') {
                tagSortOrder.push(tag);
            }
        });
        // 🔥 改为保存到 D1
        saveTagSortOrder().then(success => {
            if (success) {
                showToast('排序已保存');
            } else {
                showToast('排序保存失败');
            }
        });
    }
    renderTagsFilter();
    renderList();
}

function initTagSortable() {
    if (tagSortableInstance) {
        tagSortableInstance.destroy();
        tagSortableInstance = null;
    }
    const container = document.getElementById('tagsList');
    if (!container) return;

    tagSortableInstance = new Sortable(container, {
        animation: 150,
        ghostClass: 'tag-sort-ghost',
        handle: '.tag-item:not(.all)',
        filter: '.all, .tag-sort-toggle',
        preventOnFilter: false,
        onStart: () => {
            document.querySelectorAll('.tag-item').forEach(el => {
                el.style.cursor = 'grabbing';
            });
        },
        onEnd: () => {
            document.querySelectorAll('.tag-item').forEach(el => {
                el.style.cursor = '';
            });
            const items = container.querySelectorAll('.tag-item:not(.all)');
            tagSortOrder = [];
            items.forEach(el => {
                const tag = el.dataset.tag;
                if (tag && tag !== 'all') {
                    tagSortOrder.push(tag);
                }
            });
            // 🔥 改为保存到 D1
            saveTagSortOrder().then(success => {
                if (success) {
                    showToast('标签顺序已更新');
                } else {
                    showToast('排序保存失败');
                }
            });
        }
    });
}

// ============================================================
//  12. 获取筛选列表
// ============================================================

function getFilteredList() {
    if (!Array.isArray(siteList)) {
        console.error('siteList 不是数组，重新初始化');
        siteList = [];
        return [];
    }

    const searchInput = document.getElementById('searchInput');
    const keyword = searchInput ? searchInput.value.trim().toLowerCase() : '';
    let list = [...siteList];
    
    const passwords = loadTagPasswords();
    const encryptedTags = Object.keys(passwords).filter(t => passwords[t] && passwords[t] !== '');
    if (encryptedTags.length > 0) {
        list = list.filter(site => {
            if (!site.tags || !Array.isArray(site.tags) || site.tags.length === 0) return true;
            const hasEncryptedLocked = site.tags.some(tag => encryptedTags.includes(tag) && !isTagUnlocked(tag));
            return !hasEncryptedLocked;
        });
    }
    
    if (!keyword && activeTag !== 'all') {
        list = list.filter(s => s.tags && Array.isArray(s.tags) && s.tags.includes(activeTag));
    }
    
    if (keyword) {
        list = list.filter(s =>
            (s.name || '').toLowerCase().includes(keyword) ||
            (s.url || '').toLowerCase().includes(keyword) ||
            (s.tags && Array.isArray(s.tags) && s.tags.some(t => (t || '').toLowerCase().includes(keyword)))
        );
    }
    return list;
}

// ============================================================
//  13. 渲染 - 卡片列表 (增量更新)
// ============================================================

function renderList() {
    if (isRendering) return;

    if (!Array.isArray(siteList)) {
        console.error('siteList 不是数组，重新初始化');
        siteList = [];
    }

    isRendering = true;
    if (sortableInstance) {
        sortableInstance.destroy();
        sortableInstance = null;
    }

    const wrap = document.getElementById('siteListWrap');
    if (!wrap) {
        isRendering = false;
        return;
    }

    const filtered = getFilteredList();

    if (!Array.isArray(filtered) || filtered.length === 0) {
        wrap.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:#6b7280;">暂无链接，点击「添加网址」开始收藏</div>';
        isRendering = false;
        return;
    }

    const existingItems = wrap.querySelectorAll('.site-item');
    const existingCount = existingItems.length;
    const newCount = filtered.length;

    if (existingCount === newCount && existingCount > 0) {
        let needRebuild = false;
        existingItems.forEach((el, index) => {
            const id = parseInt(el.dataset.id);
            if (id !== filtered[index].id) {
                needRebuild = true;
            }
        });
        
        if (!needRebuild) {
            existingItems.forEach((el, index) => {
                updateItemContent(el, filtered[index]);
            });
            
            bindCardEvents(wrap);
            
            if (!isDragLocked) {
                setTimeout(() => initSortableDrag(), 50);
            }
            isRendering = false;
            return;
        }
    }

    wrap.innerHTML = '';
    const frag = document.createDocumentFragment();
    const lazyItems = [];

    filtered.forEach((site) => {
        const div = document.createElement('div');
        div.className = `site-item ${isDragLocked ? 'locked' : ''}`;
        if (isDragLocked) div.style.cursor = 'not-allowed';
        div.setAttribute('data-url', site.url || '');
        div.setAttribute('data-id', site.id || '');

        let iconHtml = '';
        if (site.icon && site.icon.length <= 2 && !site.icon.startsWith('http')) {
            iconHtml = `<div class="site-icon" style="background:#00b866;">${site.icon}</div>`;
        } else {
            const cacheKey = 'icon_' + site.id;
            const cached = localStorage.getItem(cacheKey);
            
            if (cached) {
                iconHtml = `<div class="site-icon" style="background:transparent;"><img src="${cached}" alt="${site.name || '链接'}" style="width:100%;height:100%;object-fit:cover;"></div>`;
            } else {
                const letter = (site.name || '链接').charAt(0).toUpperCase();
                iconHtml = `<div class="site-icon" style="background:#00b866;font-size:24px;font-weight:bold;color:#fff;display:flex;align-items:center;justify-content:center;">${letter}</div>`;
                lazyItems.push({ div, site });
            }
        }

        let tagsHtml = '';
        if (site.tags && Array.isArray(site.tags) && site.tags.length) {
            const displayTags = site.tags.slice(0, 3);
            const extraCount = site.tags.length - 3;
            tagsHtml = '<div class="site-tags">' +
                displayTags.map(t => `<span class="site-tag">${t || ''}</span>`).join('') +
                (extraCount > 0 ? `<span class="site-tag" style="background:#e5e7eb;color:#6b7280;">+${extraCount}</span>` : '') +
                '</div>';
        }

        let latencyText = '未测速';
        let latencyClass = '';
        const url = site.url || '';
        const result = latencyCache[url];
        if (result !== undefined) {
            if (result === '超时') {
                latencyText = '超时';
                latencyClass = 'latency-timeout';
            } else if (result === '失效') {
                latencyText = '失效';
                latencyClass = 'latency-timeout';
            } else if (typeof result === 'number' && result > 0) {
                latencyText = result + ' ms';
                latencyClass = 'latency-success';
            } else {
                latencyText = String(result);
                latencyClass = 'latency-timeout';
            }
        }

        const siteName = site.name || '未命名';
        const siteUrl = site.url || '';

        div.innerHTML = iconHtml +
            `<div class="latency-tag ${latencyClass}">${latencyText}</div>
            <div class="site-info">
                <div class="site-name">${siteName}</div>
                <div class="site-url">${siteUrl}</div>
                ${tagsHtml}
            </div>`;

        div.style.cursor = 'pointer';

        div.addEventListener('mousedown', function(e) {
            if (e.button === 0) {
                this.style.transform = 'scale(0.95)';
                this.style.transition = 'transform 0.1s';
            }
        });
        div.addEventListener('mouseup', function(e) {
            if (e.button === 0) {
                this.style.transform = 'scale(1)';
                this.style.transition = 'transform 0.1s';
            }
        });
        div.addEventListener('mouseleave', function() {
            this.style.transform = 'scale(1)';
            this.style.transition = 'transform 0.1s';
        });

        div.title = '点击打开链接';

        div.addEventListener('contextmenu', function(e) {
            e.preventDefault();
            e.stopPropagation();
            showContextMenu(e.clientX, e.clientY, site.id, site.url);
        });

        div.addEventListener('mousedown', () => {
            if (!isMobileDevice()) {
                longPressTimer = setTimeout(() => openEditModal(site.id), 800);
            }
        });
        div.addEventListener('mousemove', () => {
            isMouseMoving = true;
            clearTimeout(longPressTimer);
        });
        div.addEventListener('mouseup', () => clearTimeout(longPressTimer));
        div.addEventListener('mouseleave', () => clearTimeout(longPressTimer));

        div.addEventListener('touchstart', () => {
            const wrap2 = document.getElementById('tagsFilterWrap');
            if (wrap2 && wrap2.classList.contains('expanded')) {
                wrap2.classList.remove('expanded');
            }
        });

        frag.appendChild(div);
    });

    wrap.appendChild(frag);

    try {
        const cardHTML = wrap.innerHTML;
        localStorage.setItem('cardHTML', cardHTML);
        localStorage.setItem('cardHTMLTime', String(Date.now()));
    } catch (e) {}

    bindCardEvents(wrap);

    setTimeout(() => {
        if (!isDragLocked) initSortableDrag();
        isRendering = false;
        
        if (lazyItems.length > 0) {
            startLazyLoad(lazyItems);
        }
    }, 50);
}

// ============================================================
//  14. 绑定卡片事件
// ============================================================
// ============================================================
//  14. 绑定卡片事件（修复版 - 使用事件委托）
// ============================================================

let clickLock = false;
let lastOpenTime = 0;
let lastOpenId = null;
let contextMenuBound = false;

function bindCardEvents(wrap) {
    if (!wrap) return;
    
    // 已经绑定过，直接返回
    if (wrap._clickBound) {
        return;
    }
    
    // 点击打开链接 - 带防抖
    wrap.addEventListener('click', function(e) {
        // 判断是否点击在 .site-item 或其子元素上
        const item = e.target.closest('.site-item');
        if (!item) return;
        
        // 如果点击的是编辑/删除等操作按钮，不触发跳转
        if (e.target.closest('.site-action') || e.target.closest('.edit-btn')) {
            return;
        }
        
        e.stopPropagation();
        
        const url = item.dataset.url;
        const id = item.dataset.id;
        if (!url) return;
        
        const now = Date.now();
        
        // 同一卡片 500ms 内不允许重复点击
        if (id === lastOpenId && (now - lastOpenTime) < 500) {
            return;
        }
        
        // 全局锁
        if (clickLock) {
            return;
        }
        
        clickLock = true;
        lastOpenId = id;
        lastOpenTime = now;
        
        // 延迟一点点打开，让点击反馈更自然
        setTimeout(() => {
            window.open(url, '_blank');
            setTimeout(() => {
                clickLock = false;
            }, 300);
        }, 50);
    });
    wrap._clickBound = true;
    
    // 右键菜单 - 只绑定一次
    if (!wrap._contextMenuBound) {
        wrap.addEventListener('contextmenu', function(e) {
            const div = e.target.closest('.site-item');
            if (div) {
                e.preventDefault();
                e.stopPropagation();
                const id = parseInt(div.dataset.id);
                const url = div.dataset.url;
                showContextMenu(e.clientX, e.clientY, id, url);
            }
        });
        wrap._contextMenuBound = true;
    }
}


// ============================================================
//  15. 更新单个卡片内容
// ============================================================

function updateItemContent(el, site) {
    const latencyTag = el.querySelector('.latency-tag');
    if (latencyTag) {
        const url = site.url || '';
        const result = latencyCache[url];
        if (result !== undefined) {
            if (result === '超时' || result === '失效') {
                latencyTag.textContent = result;
                latencyTag.className = 'latency-tag latency-timeout';
            } else if (typeof result === 'number' && result > 0) {
                latencyTag.textContent = result + ' ms';
                latencyTag.className = 'latency-tag latency-success';
            } else {
                latencyTag.textContent = String(result);
                latencyTag.className = 'latency-tag latency-timeout';
            }
        } else {
            latencyTag.textContent = '未测速';
            latencyTag.className = 'latency-tag';
        }
    }

    const tagsContainer = el.querySelector('.site-tags');
    if (tagsContainer) {
        if (site.tags && Array.isArray(site.tags) && site.tags.length) {
            const displayTags = site.tags.slice(0, 3);
            const extraCount = site.tags.length - 3;
            tagsContainer.innerHTML = displayTags.map(t => `<span class="site-tag">${t || ''}</span>`).join('') +
                (extraCount > 0 ? `<span class="site-tag" style="background:#e5e7eb;color:#6b7280;">+${extraCount}</span>` : '');
        } else {
            tagsContainer.innerHTML = '';
        }
    }

    const nameEl = el.querySelector('.site-name');
    if (nameEl) nameEl.textContent = site.name || '未命名';

    const urlEl = el.querySelector('.site-url');
    if (urlEl) urlEl.textContent = site.url || '';

    el.dataset.url = site.url || '';
    el.dataset.id = site.id || '';
}

function renderAll() {
    renderTagsFilter();
    renderList();
    handleSearchUI();
}

// ============================================================
//  16. 右键菜单
// ============================================================

let contextMenuEl = null;

function showContextMenu(x, y, id, url) {
    if (contextMenuEl) {
        closeContextMenu();
    }

    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.style.cssText = `
        position: fixed;
        left: ${x}px;
        top: ${y}px;
        background: #fff;
        border-radius: 12px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.15);
        padding: 6px 0;
        z-index: 99999;
        min-width: 160px;
        font-size: 14px;
        color: #1f2937;
        border: 1px solid #e8f8f0;
        touch-action: manipulation;
    `;
    if (document.body.classList.contains('dark')) {
        menu.style.background = '#242535';
        menu.style.borderColor = '#404258';
        menu.style.color = '#e5e5e5';
    }

    const rect = menu.getBoundingClientRect();
    if (x + rect.width > window.innerWidth) {
        menu.style.left = (x - rect.width) + 'px';
    }
    if (y + rect.height > window.innerHeight) {
        menu.style.top = (y - rect.height) + 'px';
    }

    const items = [
        { label: '✏️ 编辑', action: () => openEditModal(id) },
        { label: '📋 复制链接', action: () => { navigator.clipboard.writeText(url || '');
                showToast('链接已复制'); } },
        { label: '🗑️ 删除', action: () => { if (confirm('确定删除吗？')) { deleteSiteById(id); } }, danger: true }
    ];

    items.forEach(item => {
        const btn = document.createElement('div');
        btn.textContent = item.label;
        btn.style.cssText = `
            padding: 8px 20px;
            cursor: pointer;
            transition: background 0.15s;
            color: ${item.danger ? '#ef4444' : 'inherit'};
            touch-action: manipulation;
            -webkit-touch-callout: none;
            user-select: none;
        `;
        if (document.body.classList.contains('dark') && item.danger) {
            btn.style.color = '#f87171';
        }
        btn.onmouseover = () => {
            btn.style.background = document.body.classList.contains('dark') ? '#404258' : '#f3f4f6';
        };
        btn.onmouseout = () => {
            btn.style.background = 'transparent';
        };
        btn.onclick = () => {
            item.action();
            closeContextMenu();
        };
        btn.ontouchend = function(e) {
            e.preventDefault();
            item.action();
            closeContextMenu();
        };
        menu.appendChild(btn);
    });

    document.body.appendChild(menu);
    contextMenuEl = menu;
    menu._id = id;

    const scrollHandler = function() {
        closeContextMenu();
    };

    const clickHandler = function(e) {
        if (contextMenuEl && !contextMenuEl.contains(e.target)) {
            closeContextMenu();
        }
    };

    const touchHandler = function(e) {
        if (contextMenuEl && !contextMenuEl.contains(e.target)) {
            closeContextMenu();
        }
    };

    menu._scrollHandler = scrollHandler;
    menu._clickHandler = clickHandler;
    menu._touchHandler = touchHandler;

    setTimeout(() => {
        window.addEventListener('scroll', scrollHandler, { passive: true });
        setTimeout(() => {
            document.addEventListener('click', clickHandler);
            document.addEventListener('touchstart', touchHandler, { passive: true });
        }, 50);
    }, 10);
}

function closeContextMenu() {
    if (contextMenuEl) {
        if (contextMenuEl._scrollHandler) {
            window.removeEventListener('scroll', contextMenuEl._scrollHandler);
        }
        if (contextMenuEl._clickHandler) {
            document.removeEventListener('click', contextMenuEl._clickHandler);
        }
        if (contextMenuEl._touchHandler) {
            document.removeEventListener('touchstart', contextMenuEl._touchHandler);
        }
        contextMenuEl.remove();
        contextMenuEl = null;
    }
}

async function deleteSiteById(id) {
    if (!id) return;
    try {
        await API.deleteLink(id);
        showToast('删除成功');
        await loadLinks();
    } catch (err) {
        showToast(err.message);
    }
}

// ============================================================
//  17. 搜索
// ============================================================

function handleSearch() {
    renderList();
    handleSearchUI();
}

function handleSearchUI() {
    const searchInput = document.getElementById('searchInput');
    const clearBtn = document.getElementById('clearSearchBtn');
    if (!searchInput || !clearBtn) return;
    const val = searchInput.value.trim();
    clearBtn.classList.toggle('hidden', !val);
}

function clearSearch() {
    const searchInput = document.getElementById('searchInput');
    const clearBtn = document.getElementById('clearSearchBtn');
    if (searchInput) searchInput.value = '';
    if (clearBtn) clearBtn.classList.add('hidden');
    renderList();
}

// ============================================================
//  18. 拖拽
// ============================================================

function toggleDragLock() {
    isDragLocked = !isDragLocked;
    const btn = document.getElementById('dragLockBtn');
    if (btn) {
        btn.innerText = isDragLocked ? '🔒' : '🔓';
        btn.classList.toggle('locked', isDragLocked);
    }
    document.querySelectorAll('.site-item').forEach(el => {
        el.classList.toggle('locked', isDragLocked);
        el.style.cursor = isDragLocked ? 'not-allowed' : 'grab';
    });
    if (!isDragLocked) {
        initSortableDrag();
    } else if (sortableInstance) {
        sortableInstance.destroy();
        sortableInstance = null;
    }
    showToast(isDragLocked ? '拖拽已锁定' : '拖拽已解锁');
}

function initSortableDrag() {
    if (isDragLocked || sortableInstance) return;
    const wrap = document.getElementById('siteListWrap');
    if (!wrap) return;
    sortableInstance = new Sortable(wrap, {
        animation: 200,
        ghostClass: 'sortable-ghost',
        dragClass: 'sortable-drag',
        onStart: () => {
            isDragging = true;
            isMouseMoving = false;
        },
        onEnd: async (evt) => {
            isDragging = false;
            isMouseMoving = false;

            const wrap = document.getElementById('siteListWrap');
            if (!wrap) return;

            const items = wrap.querySelectorAll('.site-item');

            const newOrder = [];
            items.forEach(el => {
                const id = parseInt(el.dataset.id);
                const site = siteList.find(s => s.id === id);
                if (site) newOrder.push(site);
            });

            newOrder.forEach((site, index) => {
                site.sort = (index + 1) * 10;
            });

            siteList.sort((a, b) => a.sort - b.sort);

            try {
                for (const site of newOrder) {
                    await API.updateSort(site.id, site.sort);
                }
                showToast('排序已保存');
            } catch (err) {
                showToast('排序保存失败，重新加载数据');
                await loadLinks();
            }
        }
    });
}

// ============================================================
//  19. 弹窗（添加/编辑）
// ============================================================

function openEditModal(id = null) {
    editingId = id;
    const modal = document.getElementById('addModal');
    if (!modal) return;

    tagExpandState[modal.id || 'default'] = false;

    const titleEl = document.getElementById('modalTitle');
    const deleteBtn = document.getElementById('modalDeleteBtn');
    if (titleEl) titleEl.textContent = id ? '编辑网址' : '添加新网址';
    if (deleteBtn) deleteBtn.style.display = id ? 'block' : 'none';

    const nameInput = document.getElementById('modalSiteName');
    const urlInput = document.getElementById('modalSiteUrl');
    const iconInput = document.getElementById('modalSiteIcon');
    const tagsInput = document.getElementById('modalSiteTags');
    const sortInput = document.getElementById('modalSiteSort');

    if (nameInput) nameInput.value = '';
    if (urlInput) urlInput.value = '';
    if (iconInput) iconInput.value = '';
    if (tagsInput) tagsInput.value = '';
    selectedTags = [];
    renderSelectedTags();
    renderExistingTags('');

    if (id) {
        const site = siteList.find(s => s.id === id);
        if (site) {
            if (nameInput) nameInput.value = site.name || '';
            if (urlInput) urlInput.value = site.url || '';
            if (iconInput) iconInput.value = site.icon || '';
            if (tagsInput) tagsInput.value = (site.tags || []).join(',');
            if (sortInput) sortInput.value = site.sort || 0;
            selectedTags = site.tags || [];
            renderSelectedTags();
            renderExistingTags('');
        }
    } else {
        const maxSort = siteList.length ? Math.max(...siteList.map(s => s.sort || 0)) : 0;
        if (sortInput) sortInput.value = maxSort + 10;
        renderExistingTags('');
    }
    modal.classList.add('show');
    if (nameInput) nameInput.focus();
    
    if (isMobileDevice()) {
        setTimeout(() => {
            const activeElement = document.activeElement;
            if (activeElement && activeElement.tagName === 'INPUT') {
                activeElement.scrollIntoView({ block: 'center', behavior: 'smooth' });
            }
        }, 300);
    }
}

function closeModal() {
    const modal = document.getElementById('addModal');
    if (modal) modal.classList.remove('show');
    editingId = null;
}

// ============================================================
//  20. 标签相关（含展开/收起）
// ============================================================

function renderExistingTags(filter = '') {
    const el = document.getElementById('existingTagsList');
    if (!el) return;

    const allTags = getAllTags();

    let filteredTags = filter ? allTags.filter(tag => tag.toLowerCase().includes(filter.toLowerCase())) : allTags;

    const isFiltering = filter.length > 0;
    const MAX_VISIBLE = 14;
    const isExpanded = tagExpandState['default'] || false;

    let displayTags = filteredTags;
    let needToggle = false;

    if (!isFiltering && filteredTags.length > MAX_VISIBLE) {
        needToggle = true;
        if (!isExpanded) {
            displayTags = filteredTags.slice(0, MAX_VISIBLE);
        }
    }

    el.innerHTML = '';

    if (!displayTags.length) {
        el.innerHTML = '<div style="font-size:12px;color:#6b7280;">💡 没有匹配的标签</div>';
        return;
    }

    const flexContainer = document.createElement('div');
    flexContainer.style.cssText = `
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        width: 100%;
        align-items: center;
    `;

    displayTags.forEach(tag => {
        const item = document.createElement('div');
        item.className = 'existing-tag-item';
        item.textContent = tag;
        item.style.cssText = `
            padding: 4px 10px;
            border-radius: 6px;
            background: #f0f3f9;
            color: #4b5563;
            font-size: 13px;
            cursor: pointer;
            transition: all 0.2s;
            white-space: nowrap;
            flex-shrink: 0;
        `;
        if (document.body.classList.contains('dark')) {
            item.style.background = '#404258';
            item.style.color = '#d1d5db';
        }
        item.onmouseover = () => {
            if (!document.body.classList.contains('dark')) {
                item.style.background = '#e8f8f0';
                item.style.color = '#00b866';
            } else {
                item.style.background = '#475569';
                item.style.color = '#10b981';
            }
        };
        item.onmouseout = () => {
            if (!document.body.classList.contains('dark')) {
                item.style.background = '#f0f3f9';
                item.style.color = '#4b5563';
            } else {
                item.style.background = '#404258';
                item.style.color = '#d1d5db';
            }
        };
        item.onclick = () => {
            if (!selectedTags.includes(tag)) {
                selectedTags.push(tag);
                renderSelectedTags();
                syncSelectedTags();
                const tagsInput = document.getElementById('modalSiteTags');
                if (tagsInput) {
                    tagsInput.value = selectedTags.join(',');
                    if (selectedTags.length > 0) {
                        tagsInput.value = selectedTags.join(',') + ',';
                    }
                    tagsInput.dispatchEvent(new Event('input'));
                }
            }
        };
        flexContainer.appendChild(item);
    });

    el.appendChild(flexContainer);

    if (needToggle) {
        const toggleWrapper = document.createElement('div');
        toggleWrapper.style.cssText = 'width:100%;text-align:center;margin-top:8px;';

        const toggleBtn = document.createElement('button');
        toggleBtn.textContent = isExpanded ? '收起 ▲' : `展开更多 (${filteredTags.length - MAX_VISIBLE}个) ▼`;
        toggleBtn.style.cssText = `
            padding: 4px 14px;
            border: 1px solid #e8f8f0;
            border-radius: 6px;
            background: #f9fbfc;
            color: #00b866;
            cursor: pointer;
            font-size: 12px;
            transition: all 0.2s;
        `;
        if (document.body.classList.contains('dark')) {
            toggleBtn.style.cssText += `
                background: #343541;
                border-color: #404258;
                color: #10b981;
            `;
        }
        toggleBtn.onmouseover = () => {
            if (!document.body.classList.contains('dark')) {
                toggleBtn.style.background = '#e8f8f0';
            } else {
                toggleBtn.style.background = '#404258';
            }
        };
        toggleBtn.onmouseout = () => {
            if (!document.body.classList.contains('dark')) {
                toggleBtn.style.background = '#f9fbfc';
            } else {
                toggleBtn.style.background = '#343541';
            }
        };
        toggleBtn.onclick = () => {
            tagExpandState['default'] = !tagExpandState['default'];
            const currentFilter = document.getElementById('modalSiteTags')?.value || '';
            const lastComma = currentFilter.lastIndexOf(',');
            const keyword = lastComma === -1 ? currentFilter.trim() : currentFilter.substring(lastComma + 1).trim();
            renderExistingTags(keyword);
        };
        toggleWrapper.appendChild(toggleBtn);
        el.appendChild(toggleWrapper);
    }
}

function renderSelectedTags() {
    const el = document.getElementById('selectedTagsList');
    if (!el) return;
    el.innerHTML = '';
    if (!selectedTags.length) {
        el.innerHTML = '<div style="font-size:12px;color:#6b7280;">还未选择任何标签</div>';
        return;
    }
    selectedTags.forEach(tag => {
        const item = document.createElement('div');
        item.className = 'selected-tag-item';
        item.innerHTML = `${tag} <span class="selected-tag-close">×</span>`;
        item.querySelector('.selected-tag-close').onclick = () => {
            selectedTags = selectedTags.filter(t => t !== tag);
            renderSelectedTags();
            syncSelectedTags();
            renderExistingTags('');
        };
        el.appendChild(item);
    });
}

function syncSelectedTags() {
    const tagsInput = document.getElementById('modalSiteTags');
    if (tagsInput) {
        tagsInput.value = selectedTags.join(',');
        if (selectedTags.length > 0) {
            tagsInput.value = selectedTags.join(',') + ',';
        }
    }
}

function syncInputToSelectedTags() {
    const tagsInput = document.getElementById('modalSiteTags');
    if (!tagsInput) return;
    const val = tagsInput.value;

    // 分割标签
    const parts = val.split(',').map(s => s.trim()).filter(s => s);
    
    // 🔥 获取最后一个输入的关键词（用于搜索提示）
    const lastComma = val.lastIndexOf(',');
    const keyword = lastComma === -1 ? val.trim() : val.substring(lastComma + 1).trim();

    // 🔥 不自动添加标签，只更新 selectedTags 显示
    // 让用户通过点击已有标签来添加
    selectedTags = parts;

    renderSelectedTags();
    renderExistingTags(keyword);
}

// ============================================================
//  21. 保存 / 删除
// ============================================================
async function saveSite() {
    const nameInput = document.getElementById('modalSiteName');
    const urlInput = document.getElementById('modalSiteUrl');
    const iconInput = document.getElementById('modalSiteIcon');
    const sortInput = document.getElementById('modalSiteSort');

    if (!nameInput || !urlInput) return;

    const name = nameInput.value.trim();
    const url = urlInput.value.trim();
    const icon = iconInput ? iconInput.value.trim() : '';
    const sort = sortInput ? parseInt(sortInput.value.trim()) || 0 : 0;

    if (!name) { showToast('请输入网站名称'); return; }
    if (!isValidUrl(url)) { showToast('请输入有效的网址'); return; }

    // 🔥 提前检查是否已收藏
    if (!editingId) {
        const existing = siteList.find(s => s.url === url);
        if (existing) {
            showToast('您已有该收藏，无须重复收藏！');
            return;
        }
    }

    const tagsInput = document.getElementById('modalSiteTags');
    if (tagsInput) {
        const val = tagsInput.value;
        const parts = val.split(',').map(s => s.trim()).filter(s => s);
        selectedTags = parts.filter((t, i, arr) => t && arr.indexOf(t) === i);
    }

    // 生成 icon_url
    let iconUrl = '';
    try {
        const u = new URL(url);
        let domain = u.hostname.replace(/^www\./, '');
        domain = domain.replace(/:\d+$/, '');
        if (domain && 
            !domain.startsWith('192.168.') && 
            !domain.startsWith('10.') &&
            !domain.startsWith('127.0.0.') &&
            !domain.startsWith('localhost')) {
            iconUrl = `https://favicon.im/${domain}`;
        }
    } catch {}

    const data = {
        title: name,
        url,
        icon,
        icon_url: iconUrl,
        tags: selectedTags,
        sort_order: sort
    };

    try {
        if (editingId) {
            await API.updateLink(editingId, data);
            showToast('修改成功');
        } else {
            await API.addLink(data);
            showToast('添加成功');
        }
        closeModal();
        await loadLinks();
    } catch (err) {
        showToast(err.message);
    }
}


// ============================================================
//  22. 剪贴板
// ============================================================

async function extractFromClipboard() {
    try {
        const text = await navigator.clipboard.readText();
        if (!text) { showToast('剪贴板为空'); return; }
        const urls = text.match(/https?:\/\/[^\s]+/gi) || [];
        // 🔥 改这里：只要以 http:// 或 https:// 开头就算有效
        const valid = urls.find(u => u.startsWith('http://') || u.startsWith('https://'));
        if (!valid) { showToast('未找到有效网址'); return; }
        let name = text.replace(/https?:\/\/[^\s]+/gi, '').trim().replace(/[\n\r]/g, ' ').trim();
        if (!name) {
            try { name = new URL(valid).hostname.split('.')[0]; } catch { name = '未知网站'; }
        }
        const nameInput = document.getElementById('modalSiteName');
        const urlInput = document.getElementById('modalSiteUrl');
        if (nameInput) nameInput.value = name;
        if (urlInput) urlInput.value = valid;
        showToast('已识别并填充');
    } catch {
        showToast('读取剪贴板失败');
    }
}

// ============================================================
//  23. 测速
// ============================================================

async function testLatency(url) {
    const start = performance.now();
    const timeout = 3000;
    
    if (!url || !url.startsWith('http')) {
        latencyCache[url] = '失效';
        saveLatencyCache();
        return '失效';
    }
    
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);
        
        await fetch(url, { 
            method: 'HEAD', 
            mode: 'no-cors', 
            cache: 'no-cache', 
            signal: controller.signal 
        });
        
        clearTimeout(timeoutId);
        const latency = Math.round(performance.now() - start);
        latencyCache[url] = latency;
        saveLatencyCache();
        return latency;
        
    } catch (err) {
        latencyCache[url] = '超时';
        saveLatencyCache();
        return '超时';
    }
}

let worker = null;

async function batchTestLatency() {
    const list = getFilteredList();
    if (!list.length) { showToast('暂无链接'); return; }
    
    const btn = document.getElementById('refreshBtn');
    if (btn) btn.disabled = true;
    
    const allItems = document.querySelectorAll('.site-item');
    
    allItems.forEach((item, index) => {
        if (index < list.length) {
            const tag = item.querySelector('.latency-tag');
            if (tag) {
                tag.textContent = '测速中';
                tag.className = 'latency-tag latency-loading';
            }
        }
    });
    
    showToast('测速中...');
    
    if (worker) {
        worker.terminate();
        worker = null;
    }
    
    try {
        worker = new Worker('worker.js');
    } catch (err) {
        showToast('Worker 创建失败，请刷新重试');
        if (btn) btn.disabled = false;
        return;
    }
    
    worker.addEventListener('message', function(e) {
        const data = e.data;
        
        if (data.type === 'result') {
            const { index, url, latency } = data;
            
            if (latency === '超时' || latency === '失效') {
                latencyCache[url] = latency;
            } else if (typeof latency === 'number' && latency > 0) {
                latencyCache[url] = latency;
            }
            saveLatencyCache();
            
            const items = document.querySelectorAll('.site-item');
            if (items[index]) {
                const tag = items[index].querySelector('.latency-tag');
                if (tag) {
                    if (latency === '超时' || latency === '失效') {
                        tag.textContent = latency;
                        tag.className = 'latency-tag latency-timeout';
                    } else if (typeof latency === 'number' && latency > 0) {
                        tag.textContent = latency + ' ms';
                        tag.className = 'latency-tag latency-success';
                    } else {
                        tag.textContent = '未测速';
                        tag.className = 'latency-tag';
                    }
                }
            }
        }
        
        if (data.type === 'complete') {
            if (btn) btn.disabled = false;
            showToast('测速完成');
            if (worker) {
                worker.terminate();
                worker = null;
            }
        }
        
        if (data.type === 'error') {
            showToast('测速出错：' + data.message);
            if (btn) btn.disabled = false;
            if (worker) {
                worker.terminate();
                worker = null;
            }
        }
    });
    
    const urls = list.map(site => site.url);
    worker.postMessage({ urls });
}

// ============================================================
//  24. 导入 / 导出
// ============================================================

function importJson() {
    const fileInput = document.getElementById('fileInput');
    if (fileInput) fileInput.click();
}

async function handleFileImport(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const data = JSON.parse(e.target.result);
            if (!Array.isArray(data)) { showToast('格式错误：需要数组'); return; }

            const existingUrls = new Set(siteList.map(s => s.url));

            // 🔥 导入时保留 icon_url
            const allImportData = data
                .filter(item => {
                    const name = item.name || item.title;
                    return name && item.url && isValidUrl(item.url);
                })
                .map(item => ({
                    title: item.name || item.title,
                    url: item.url,
                    icon: item.icon || '',
                    icon_url: item.icon_url || '',  // 🔥 新增
                    tags: item.tags || [],
                    sort: item.sort_order || item.sort || 0
                }));

            const importData = allImportData.filter(item => !existingUrls.has(item.url));
            const skippedCount = allImportData.length - importData.length;

            if (importData.length === 0) {
                if (skippedCount > 0) {
                    showToast(`所有 ${skippedCount} 条数据都已存在，无需导入`);
                } else {
                    showToast('没有有效数据可导入');
                }
                await loadLinks();
                return;
            }

            showToast(`共 ${allImportData.length} 条，其中 ${skippedCount} 条已存在，将导入 ${importData.length} 条新数据`);

            const BATCH_SIZE = 20;
            let successCount = 0;
            let skipCount = 0;
            let errorCount = 0;

            for (let i = 0; i < importData.length; i += BATCH_SIZE) {
                const batch = importData.slice(i, i + BATCH_SIZE);
                showToast(`正在导入 ${Math.min(i + BATCH_SIZE, importData.length)}/${importData.length} 条...`);

                try {
                    const result = await API.importLinks(batch);
                    successCount += result.successCount || 0;
                    skipCount += result.skipCount || 0;
                    errorCount += result.errorCount || 0;
                    
                    // 🔥 导入成功后，恢复 icon_url 到 localStorage
                    if (result.items) {
                        result.items.forEach(item => {
                            if (item.icon_url) {
                                localStorage.setItem('icon_' + item.id, item.icon_url);
                            }
                        });
                    }
                } catch (err) {
                    errorCount += batch.length;
                    console.error('批次导入失败:', err);
                }
            }

            let msg = `✅ 导入完成：成功 ${successCount} 条`;
            if (skipCount > 0) {
                msg += `，⏭️ 跳过 ${skipCount} 条（后端去重）`;
            }
            if (errorCount > 0) {
                msg += `，❌ 失败 ${errorCount} 条`;
            }
            msg += `（本次实际新增 ${importData.length} 条）`;
            showToast(msg);
            await loadLinks();

        } catch (err) {
            showToast('❌ 导入失败：' + err.message);
        }
    };
    reader.readAsText(file);
    event.target.value = '';
}

async function exportJson() {
    try {
        const data = await API.exportLinks();
        // 🔥 为每条数据添加 icon_url（从 localStorage 读取）
        const exportData = data.map(item => {
            const iconUrl = localStorage.getItem('icon_' + item.id) || '';
            return {
                ...item,
                icon_url: iconUrl
            };
        });
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = getFileName();
        a.click();
        URL.revokeObjectURL(url);
        showToast('导出成功');
    } catch (err) {
        showToast('导出失败');
    }
}

// ============================================================
//  25. 标签栏折叠（移动端）
// ============================================================

function initTagsFilter() {
    const wrap = document.getElementById('tagsFilterWrap');
    if (!wrap) return;
    const title = wrap.querySelector('.tags-filter-title');
    if (isMobileDevice()) wrap.classList.remove('expanded');
    else wrap.classList.add('expanded');
    if (title) {
        title.onclick = () => wrap.classList.toggle('expanded');
    }
}

// ============================================================
//  26. 返回顶部
// ============================================================

function handleScroll() {
    const btn = document.getElementById('backToTopBtn');
    if (btn) {
        btn.classList.toggle('show', window.scrollY > SCROLL_THRESHOLD);
    }
    if (document.getElementById('mainPage') && document.getElementById('mainPage').style.display !== 'none') {
        clearTimeout(window._scrollSaveTimer);
        window._scrollSaveTimer = setTimeout(saveScrollPosition, 500);
    }
}

function backToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ============================================================
//  27. 键盘快捷键
// ============================================================

function initKeyboardShortcuts() {
    document.addEventListener('keydown', function(e) {
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            const searchInput = document.getElementById('searchInput');
            if (searchInput) {
                searchInput.focus();
                searchInput.select();
            }
        }
        
        if (e.key === 'Escape') {
            const addModal = document.getElementById('addModal');
            if (addModal && addModal.classList.contains('show')) {
                closeModal();
            }
            const adminModal = document.getElementById('adminModal');
            if (adminModal && adminModal.classList.contains('show')) {
                closeAdminPanel();
            }
            const searchInput = document.getElementById('searchInput');
            if (searchInput && document.activeElement === searchInput) {
                searchInput.blur();
            }
        }
    });
}

// ============================================================
//  28. 排序切换
// ============================================================

function initSortSelector() {
    const sortSelect = document.getElementById('sortSelect');
    if (!sortSelect) return;
    
    const saved = localStorage.getItem('sortPreference');
    if (saved) {
        sortSelect.value = saved;
    }
    
    sortSelect.addEventListener('change', function() {
        const [sortBy, order] = this.value.split(':');
        localStorage.setItem('sortPreference', this.value);
        loadLinks(sortBy, order);
    });
}

// ============================================================
//  29. 初始化
// ============================================================
// ============================================================
//  29. 初始化
// ============================================================

async function initApp() {
    sessionStorage.removeItem('unlockedTags');
    await loadTagSortOrder();
    loadActiveTag();
    initTheme();
    initTagsFilter();
    loadLatencyCache();  // 🔥 加这行
    initSortSelector();

    // 🔥 重置渲染标记（让标签只渲染一次）
    tagsRendered = false;

    const sortSelect = document.getElementById('sortSelect');
    if (sortSelect) {
        const saved = localStorage.getItem('sortPreference');
        if (saved) {
            const [sortBy, order] = saved.split(':');
            await loadLinks(sortBy, order);
        } else {
            await loadLinks();
        }
    } else {
        await loadLinks();
    }

    window.addEventListener('scroll', handleScroll);
    handleScroll();
    const lockBtn = document.getElementById('dragLockBtn');
    if (lockBtn) {
        lockBtn.textContent = '🔒';
        lockBtn.classList.add('locked');
    }
    initKeyboardShortcuts();
}
window.initApp = initApp;


// ============================================================
//  30. 管理员功能
// ============================================================

function openAdminPanel() {
    document.getElementById('adminModal').classList.add('show');
    adminLoadUsers();
}

function closeAdminPanel() {
    document.getElementById('adminModal').classList.remove('show');
}

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

// ============================================================
//  31. 事件绑定
// ============================================================
// ============================================================
//  31. 事件绑定
// ============================================================

document.addEventListener('DOMContentLoaded', function() {
    const loginBtn = document.getElementById('loginBtn');
    if (!loginBtn) {
        console.error('DOM 元素未就绪，稍后重试');
        return;
    }

    loginBtn.addEventListener('click', doLogin);

    const loginPassword = document.getElementById('loginPassword');
    const loginUsername = document.getElementById('loginUsername');
    if (loginPassword) {
        loginPassword.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') doLogin();
        });
    }
    if (loginUsername) {
        loginUsername.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') doLogin();
        });
    }

    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', doLogout);
    }

    const addBtn = document.getElementById('addBtn');
    if (addBtn) {
        addBtn.addEventListener('click', () => openEditModal());
    }

    // 🔥 快捷添加按钮
    const addQuickBtn = document.getElementById('addQuickBtn');
    if (addQuickBtn) {
        addQuickBtn.addEventListener('click', () => openEditModal());
    }

    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', batchTestLatency);
    }

    const importBtn = document.getElementById('importBtn');
    const exportBtn = document.getElementById('exportBtn');
    const fileInput = document.getElementById('fileInput');
    if (importBtn) importBtn.addEventListener('click', importJson);
    if (exportBtn) exportBtn.addEventListener('click', exportJson);
    if (fileInput) fileInput.addEventListener('change', handleFileImport);

    const dragLockBtn = document.getElementById('dragLockBtn');
    if (dragLockBtn) {
        dragLockBtn.addEventListener('click', toggleDragLock);
    }

    const themeToggleBtn = document.getElementById('themeToggleBtn');
    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', toggleTheme);
    }

    const searchInput = document.getElementById('searchInput');
    const clearSearchBtn = document.getElementById('clearSearchBtn');
    if (searchInput) searchInput.addEventListener('input', handleSearch);
    if (clearSearchBtn) clearSearchBtn.addEventListener('click', clearSearch);

    const modalCloseBtn = document.getElementById('modalCloseBtn');
    const modalCancelBtn = document.getElementById('modalCancelBtn');
    const modalConfirmBtn = document.getElementById('modalConfirmBtn');
    const modalDeleteBtn = document.getElementById('modalDeleteBtn');
    if (modalCloseBtn) modalCloseBtn.addEventListener('click', closeModal);
    if (modalCancelBtn) modalCancelBtn.addEventListener('click', closeModal);
    if (modalConfirmBtn) modalConfirmBtn.addEventListener('click', saveSite);
    if (modalDeleteBtn) modalDeleteBtn.addEventListener('click', deleteSite);

    const pasteBtn = document.getElementById('pasteBtn');
    if (pasteBtn) {
        pasteBtn.onclick = extractFromClipboard;  // 🔥 addEventListener → onclick
    }

    const modalSiteTags = document.getElementById('modalSiteTags');
    if (modalSiteTags) {
        modalSiteTags.addEventListener('input', syncInputToSelectedTags);
    }

    const adminBtn = document.getElementById('adminBtn');
    const adminModalCloseBtn = document.getElementById('adminModalCloseBtn');
    const adminModalCloseBtn2 = document.getElementById('adminModalCloseBtn2');
    const adminCreateBtn = document.getElementById('adminCreateBtn');
    if (adminBtn) adminBtn.addEventListener('click', openAdminPanel);
    if (adminModalCloseBtn) adminModalCloseBtn.addEventListener('click', closeAdminPanel);
    if (adminModalCloseBtn2) adminModalCloseBtn2.addEventListener('click', closeAdminPanel);
    if (adminCreateBtn) adminCreateBtn.addEventListener('click', adminCreateUser);

    const backToTopBtn = document.getElementById('backToTopBtn');
    if (backToTopBtn) backToTopBtn.addEventListener('click', backToTop);

    const addModal = document.getElementById('addModal');
    const adminModal = document.getElementById('adminModal');
    if (addModal) {
        addModal.addEventListener('click', (e) => {
            if (e.target === addModal) closeModal();
        });
        addModal.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' && addModal.classList.contains('show')) {
                const confirmBtn = document.getElementById('modalConfirmBtn');
                if (confirmBtn) {
                    e.preventDefault();
                    confirmBtn.click();
                }
            }
        });
    }
    if (adminModal) {
        adminModal.addEventListener('click', (e) => {
            if (e.target === adminModal) closeAdminPanel();
        });
    }

    if (isLoggedIn()) {
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        if (user.username) {
            enterMainPage();
            return;
        }
    }

    const loginPage = document.getElementById('loginPage');
    const mainPage = document.getElementById('mainPage');
    if (loginPage) loginPage.style.display = 'flex';
    if (mainPage) mainPage.style.display = 'none';
});

// ============================================================
//  32. 用户下拉菜单
// ============================================================

(function() {
    var userBtn = document.getElementById('userMenuBtn');
    var dropdown = document.getElementById('userDropdown');

    if (userBtn) {
        userBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            dropdown.classList.toggle('open');
        });

        document.addEventListener('click', function() {
            dropdown.classList.remove('open');
        });
    }

    var menuAdd = document.getElementById('menuAdd');
    var menuSpeed = document.getElementById('menuSpeed');
    var menuImport = document.getElementById('menuImport');
    var menuExport = document.getElementById('menuExport');
    var menuLock = document.getElementById('menuLock');
    var menuTheme = document.getElementById('menuTheme');
    var adminItem = document.getElementById('adminMenuItem');
    var logoutItem = document.getElementById('logoutMenuItem');

    var tagPasswordMenuItem = document.getElementById('tagPasswordMenuItem');

    if (menuAdd) {
        menuAdd.addEventListener('click', function() {
            if (typeof openEditModal === 'function') {
                openEditModal();
            }
            dropdown.classList.remove('open');
        });
    }

    if (menuSpeed) {
        menuSpeed.addEventListener('click', function() {
            if (typeof batchTestLatency === 'function') {
                batchTestLatency();
            }
            dropdown.classList.remove('open');
        });
    }

    if (menuImport) {
        menuImport.addEventListener('click', function() {
            if (typeof importJson === 'function') {
                importJson();
            }
            dropdown.classList.remove('open');
        });
    }

    if (menuExport) {
        menuExport.addEventListener('click', function() {
            if (typeof exportJson === 'function') {
                exportJson();
            }
            dropdown.classList.remove('open');
        });
    }

    if (menuLock) {
        menuLock.addEventListener('click', function() {
            if (typeof toggleDragLock === 'function') {
                toggleDragLock();
            }
            dropdown.classList.remove('open');
        });
    }

    if (menuTheme) {
        menuTheme.addEventListener('click', function() {
            if (typeof toggleTheme === 'function') {
                toggleTheme();
            }
            dropdown.classList.remove('open');
        });
    }

    if (adminItem) {
        adminItem.addEventListener('click', function() {
            if (typeof openAdminPanel === 'function') {
                openAdminPanel();
            }
            dropdown.classList.remove('open');
        });
    }

    if (tagPasswordMenuItem) {
        tagPasswordMenuItem.addEventListener('click', function() {
            if (typeof openTagPasswordManager === 'function') {
                openTagPasswordManager();
            }
            dropdown.classList.remove('open');
        });
    }

    if (logoutItem) {
        logoutItem.addEventListener('click', function() {
            if (typeof doLogout === 'function') {
                doLogout();
            }
            dropdown.classList.remove('open');
        });
    }

    function updateUserInfo() {
        try {
            var user = JSON.parse(localStorage.getItem('user') || '{}');
            var nameEl = document.getElementById('displayUsername');
            var dropdownName = document.getElementById('dropdownUsername');
            var roleEl = document.getElementById('dropdownRole');
            if (nameEl) nameEl.textContent = user.username || '用户';
            if (dropdownName) dropdownName.textContent = user.username || '用户';
            if (roleEl) roleEl.textContent = user.role === 'admin' ? '管理员' : '普通';
            if (adminItem) {
                adminItem.style.display = user.role === 'admin' ? 'flex' : 'none';
            }
        } catch(e) {}
    }
    updateUserInfo();
})();

// ============================================================
//  33. 页面加载后自动登录
// ============================================================

document.addEventListener('DOMContentLoaded', function() {
    var token = localStorage.getItem('token');
    var user = localStorage.getItem('user');
    
    var loginPage = document.getElementById('loginPage');
    var mainPage = document.getElementById('mainPage');
    
    if (token && user) {
        try {
            var userData = JSON.parse(user);
            if (userData.username) {
                if (loginPage) {
                    loginPage.style.display = 'none';
                    loginPage.classList.remove('show');
                }
                if (mainPage) mainPage.style.display = 'block';
                
                var nameEl = document.getElementById('displayUsername');
                var roleEl = document.getElementById('displayRole');
                if (nameEl) nameEl.textContent = userData.username || '用户';
                if (roleEl) roleEl.textContent = userData.role === 'admin' ? '管理员' : '普通';
                
                if (typeof initApp === 'function') {
                    initApp();
                }
                return;
            }
        } catch(e) {}
    }
    
    if (loginPage) {
        loginPage.style.display = 'flex';
        loginPage.classList.add('show');
    }
    if (mainPage) mainPage.style.display = 'none';
});

// ============================================================
//  34. 懒加载图标（先显示首字母，后台加载 favicon.im）
// ============================================================

let lazyObserver = null;
let iconLoadQueue = [];
let isLoadingIcons = false;
const BATCH_SIZE = 5;

// 🔥 队列控制
let iconTaskQueue = [];
let isProcessingQueue = false;
const CONCURRENT_LIMIT = 1;   // 同时只加载 1 个
const QUEUE_INTERVAL = 600;    // 每批间隔 600ms

function startLazyLoad(items) {
    iconLoadQueue = items.filter(({ site }) => {
        const cacheKey = 'icon_' + site.id;
        return !localStorage.getItem(cacheKey);
    });
    
    if (iconLoadQueue.length === 0) return;
    
    setTimeout(() => {
        loadVisibleIcons();
    }, 100);
    
    if (lazyObserver) {
        lazyObserver.disconnect();
    }
    
    lazyObserver = new IntersectionObserver((entries) => {
        const toLoad = [];
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const div = entry.target;
                const item = iconLoadQueue.find(i => i.div === div);
                if (item && !div._iconLoaded) {
                    toLoad.push(item);
                }
            }
        });
        
        if (toLoad.length > 0) {
            const batch = toLoad.slice(0, BATCH_SIZE);
            batch.forEach(({ div, site }) => {
                loadSingleIcon(div, site);
            });
        }
    }, {
        rootMargin: '100px',
        threshold: 0.01
    });
    
    iconLoadQueue.forEach(({ div }) => {
        lazyObserver.observe(div);
    });
}

function loadVisibleIcons() {
    let loaded = 0;
    for (let i = 0; i < iconLoadQueue.length && loaded < BATCH_SIZE; i++) {
        const { div, site } = iconLoadQueue[i];
        if (div._iconLoaded) continue;
        const rect = div.getBoundingClientRect();
        if (rect.top < window.innerHeight + 100 && rect.bottom > -100) {
            loadSingleIcon(div, site);
            loaded++;
        }
    }
}

// 🔥 修改：带队列控制的 loadSingleIcon
function loadSingleIcon(div, site) {
    if (div._iconLoaded) return;
    div._iconLoaded = true;
    
    const iconEl = div.querySelector('.site-icon');
    if (!iconEl) return;
    if (iconEl.querySelector('img')) return;
    
    const cacheKey = 'icon_' + site.id;
    const cached = localStorage.getItem(cacheKey);
    
    // 如果有缓存，直接显示
    if (cached) {
        iconEl.innerHTML = '';
        iconEl.style.background = 'transparent';
        iconEl.style.fontSize = '';
        iconEl.style.fontWeight = '';
        iconEl.style.color = '';
        iconEl.style.display = '';
        const img = document.createElement('img');
        img.src = cached;
        img.alt = site.name || '图标';
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.objectFit = 'cover';
        img.style.borderRadius = '8px';
        iconEl.appendChild(img);
        return;
    }
    
    // 先显示首字母
    const letter = (site.name || '链接').charAt(0).toUpperCase();
    iconEl.innerHTML = letter;
    iconEl.style.background = '#00b866';
    iconEl.style.color = '#fff';
    iconEl.style.fontSize = '24px';
    iconEl.style.fontWeight = 'bold';
    iconEl.style.display = 'flex';
    iconEl.style.alignItems = 'center';
    iconEl.style.justifyContent = 'center';
    iconEl.style.borderRadius = '8px';
    
    // 🔥 加入队列，不立即加载
    iconTaskQueue.push({ div, site, iconEl });
    processQueue();
}

// 🔥 处理队列
function processQueue() {
    if (isProcessingQueue) return;
    if (iconTaskQueue.length === 0) return;
    
    isProcessingQueue = true;
    
    // 取出 1 个
    const batch = iconTaskQueue.splice(0, CONCURRENT_LIMIT);
    let completed = 0;
    
    batch.forEach(({ div, site, iconEl }) => {
        // 获取域名
        let domain;
        try {
            const u = new URL(site.url || '');
            domain = u.hostname.replace(/^www\./, '');
            domain = domain.replace(/:\d+$/, '');
            if (!domain || 
                domain.startsWith('192.168.') || 
                domain.startsWith('10.') ||
                domain.startsWith('127.0.0.') ||
                domain.startsWith('localhost')) {
                completed++;
                return;
            }
        } catch {
            completed++;
            return;
        }
        
        const iconUrl = `https://favicon.im/${domain}`;
        const cacheKey = 'icon_' + site.id;
        
        const img = new Image();
        let loaded = false;
        
        img.onload = function() {
            if (loaded) return;
            loaded = true;
            
            if (img.width > 16 && img.height > 16) {
                iconEl.innerHTML = '';
                iconEl.style.background = 'transparent';
                iconEl.style.fontSize = '';
                iconEl.style.fontWeight = '';
                iconEl.style.color = '';
                iconEl.style.display = '';
                const newImg = document.createElement('img');
                newImg.src = iconUrl;
                newImg.alt = site.name || '图标';
                newImg.style.width = '100%';
                newImg.style.height = '100%';
                newImg.style.objectFit = 'cover';
                newImg.style.borderRadius = '8px';
                iconEl.appendChild(newImg);
                localStorage.setItem(cacheKey, iconUrl);
            }
            completed++;
            if (completed === batch.length) {
                isProcessingQueue = false;
                setTimeout(processQueue, QUEUE_INTERVAL);
            }
        };
        
        img.onerror = function() {
            loaded = true;
            completed++;
            if (completed === batch.length) {
                isProcessingQueue = false;
                setTimeout(processQueue, QUEUE_INTERVAL);
            }
        };
        
        img.timeout = 5000;
        img.src = iconUrl;
    });
    
    // 如果 batch 为空（都是内网地址），立即处理下一批
    if (batch.length === 0) {
        isProcessingQueue = false;
        processQueue();
    }
}

function cleanupLazyLoad() {
    if (lazyObserver) {
        lazyObserver.disconnect();
        lazyObserver = null;
    }
    iconLoadQueue = [];
    iconTaskQueue = [];
    isProcessingQueue = false;
    isLoadingIcons = false;
}

// ============================================================
//  35. 标签密码管理（D1 存储版）
// ============================================================
// ============================================================
//  35. 标签管理（加密 + 排序）
// ============================================================

// 从 D1 加载标签密码
async function loadTagPasswords() {
    try {
        const response = await fetch('/api/tag-passwords', {
            headers: {
                'Authorization': 'Bearer ' + localStorage.getItem('token')
            }
        });
        if (!response.ok) {
            throw new Error('加载密码失败');
        }
        const data = await response.json();
        const result = {};
        if (Array.isArray(data)) {
            data.forEach(item => {
                result[item.tag_name] = item.password_hash;
            });
        }
        return result;
    } catch (err) {
        console.error('加载标签密码失败:', err);
        return {};
    }
}

// 保存标签密码到 D1
async function saveTagPasswords(passwords) {
    try {
        const response = await fetch('/api/tag-passwords', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + localStorage.getItem('token')
            },
            body: JSON.stringify({ passwords })
        });
        if (!response.ok) {
            throw new Error('保存密码失败');
        }
        return await response.json();
    } catch (err) {
        console.error('保存标签密码失败:', err);
        throw err;
    }
}

// 获取标签密码哈希
async function getTagPasswordHash(tagName) {
    if (!tagName) return null;
    const passwords = await loadTagPasswords();
    return passwords[tagName] || null;
}

// 设置标签密码
async function setTagPassword(tagName, plainPassword) {
    if (!tagName) {
        console.error('标签名不能为空');
        return;
    }
    const passwords = await loadTagPasswords();
    if (plainPassword && plainPassword.trim() !== '') {
        const hash = await sha256(plainPassword.trim());
        passwords[tagName] = hash;
    } else {
        delete passwords[tagName];
    }
    await saveTagPasswords(passwords);
}

// 删除标签密码（单个）
async function deleteTagPassword(tagName) {
    if (!tagName) return;
    try {
        const response = await fetch(`/api/tag-passwords/${encodeURIComponent(tagName)}`, {
            method: 'DELETE',
            headers: {
                'Authorization': 'Bearer ' + localStorage.getItem('token')
            }
        });
        if (!response.ok) {
            throw new Error('删除密码失败');
        }
        return await response.json();
    } catch (err) {
        console.error('删除标签密码失败:', err);
        throw err;
    }
}

// 判断标签是否已解锁（sessionStorage）
function isTagUnlocked(tagName) {
    try {
        const unlocked = JSON.parse(sessionStorage.getItem('unlockedTags') || '[]');
        return unlocked.includes(tagName);
    } catch { return false; }
}

function markTagAsUnlocked(tagName) {
    const unlocked = JSON.parse(sessionStorage.getItem('unlockedTags') || '[]');
    if (!unlocked.includes(tagName)) {
        unlocked.push(tagName);
        sessionStorage.setItem('unlockedTags', JSON.stringify(unlocked));
    }
}

function clearUnlockedTags() {
    sessionStorage.removeItem('unlockedTags');
}

async function sha256(message) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

let pendingTagName = null;
let pendingTagHash = null;

function showTagPasswordModal(tagName, passwordHash) {
    pendingTagName = tagName;
    pendingTagHash = passwordHash;
    document.getElementById('tagPasswordTitle').textContent = '🔒 请输入标签密码';
    document.getElementById('tagPasswordLabel').textContent = `标签「${tagName}」需要密码才能访问`;
    document.getElementById('tagPasswordInput').value = '';
    document.getElementById('tagPasswordError').style.display = 'none';
    document.getElementById('tagPasswordModal').classList.add('show');
    setTimeout(() => {
        document.getElementById('tagPasswordInput').focus();
    }, 100);
}

function closeTagPasswordModal() {
    document.getElementById('tagPasswordModal').classList.remove('show');
    pendingTagName = null;
    pendingTagHash = null;
}

async function confirmTagPassword() {
    const input = document.getElementById('tagPasswordInput').value.trim();
    if (!input) {
        document.getElementById('tagPasswordError').textContent = '请输入密码';
        document.getElementById('tagPasswordError').style.display = 'block';
        return;
    }
    const inputHash = await sha256(input);
    if (inputHash === pendingTagHash) {
        markTagAsUnlocked(pendingTagName);
        closeTagPasswordModal();
        showToast(`✅ 标签「${pendingTagName}」已解锁`);
        const tagItems = document.querySelectorAll('.tag-item');
        tagItems.forEach(item => {
            item.classList.remove('active');
            if (item.dataset.tag === pendingTagName) {
                item.classList.add('active');
            }
        });
        activeTag = pendingTagName;
        saveActiveTag(pendingTagName);
        renderList();
        if (isMobileDevice()) {
            const wrap = document.getElementById('tagsFilterWrap');
            if (wrap) wrap.classList.remove('expanded');
        }
    } else {
        document.getElementById('tagPasswordError').textContent = '❌ 密码错误，请重试';
        document.getElementById('tagPasswordError').style.display = 'block';
        document.getElementById('tagPasswordInput').value = '';
        document.getElementById('tagPasswordInput').focus();
    }
}

document.addEventListener('DOMContentLoaded', function() {
    const modal = document.getElementById('tagPasswordModal');
    if (modal) {
        document.getElementById('tagPasswordCloseBtn').addEventListener('click', closeTagPasswordModal);
        document.getElementById('tagPasswordCancelBtn').addEventListener('click', closeTagPasswordModal);
        document.getElementById('tagPasswordConfirmBtn').addEventListener('click', confirmTagPassword);
        document.getElementById('tagPasswordInput').addEventListener('keydown', function(e) {
            if (e.key === 'Enter') confirmTagPassword();
        });
        modal.addEventListener('click', function(e) {
            if (e.target === modal) closeTagPasswordModal();
        });
    }
});

// ============================================================
//  标签管理弹窗（整合排序 + 加密）
// ============================================================

let tagManagerSortableInstance = null;

function openTagPasswordManager() {
    const modal = document.getElementById('tagPasswordManagerModal');
    if (!modal) return;
    modal.classList.add('show');
    renderTagManagerList();
}

function closeTagPasswordManager() {
    document.getElementById('tagPasswordManagerModal').classList.remove('show');
    if (tagManagerSortableInstance) {
        tagManagerSortableInstance.destroy();
        tagManagerSortableInstance = null;
    }
}

async function renderTagManagerList() {
    const list = document.getElementById('tagManagerList');
    if (!list) return;

    const allTags = getAllTags();
    const passwords = await loadTagPasswords();

    if (allTags.length === 0) {
        list.innerHTML = '<div style="padding:20px;text-align:center;color:#6b7280;">暂无标签</div>';
        return;
    }

    // 构建列表
    let html = '';
    const sortedTags = [...allTags];

    // 如果有保存的排序，按排序显示
    if (tagSortOrder.length > 0) {
        sortedTags.sort((a, b) => {
            const indexA = tagSortOrder.indexOf(a);
            const indexB = tagSortOrder.indexOf(b);
            if (indexA === -1 && indexB === -1) return 0;
            if (indexA === -1) return 1;
            if (indexB === -1) return -1;
            return indexA - indexB;
        });
    }

    sortedTags.forEach(tag => {
        const hasPassword = passwords[tag] && passwords[tag] !== '';
        const isAll = tag === '全部';
        const lockIcon = hasPassword ? '🔒' : '🔓';
        const statusText = hasPassword ? '已加密' : '未加密';
        const actionBtn = hasPassword
            ? `<button class="tag-password-set-btn" data-tag="${tag}" style="padding:2px 10px;border:1px solid #e8f8f0;border-radius:4px;background:#f9fbfc;cursor:pointer;font-size:12px;color:#4b5563;">修改</button>
               <button class="tag-password-remove-btn" data-tag="${tag}" style="padding:2px 10px;border:1px solid #fef2f2;border-radius:4px;background:#fef2f2;cursor:pointer;font-size:12px;color:#ef4444;">移除</button>`
            : `<button class="tag-password-set-btn" data-tag="${tag}" style="padding:2px 10px;border:1px solid #e8f8f0;border-radius:4px;background:#f9fbfc;cursor:pointer;font-size:12px;color:#4b5563;">设置</button>`;

        html += `
            <div class="tag-manager-item" data-tag="${tag}" style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;border-bottom:1px solid #f0f0f0;gap:10px;${isAll ? 'opacity:0.6;' : ''}">
                <div style="display:flex;align-items:center;gap:8px;flex:1;min-width:0;">
                    <span style="cursor:${isAll ? 'default' : 'grab'};color:#9ca3af;font-size:16px;user-select:none;${isAll ? 'visibility:hidden;' : ''}">☰</span>
                    <span style="font-weight:500;font-size:14px;min-width:60px;">${tag}</span>
                    <span style="font-size:13px;color:#6b7280;flex:1;">${lockIcon} ${statusText}</span>
                </div>
                <div style="display:flex;gap:6px;flex-shrink:0;">
                    ${actionBtn}
                </div>
            </div>
        `;
    });

    list.innerHTML = html;

    // 绑定加密按钮事件
    list.querySelectorAll('.tag-password-set-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const tag = this.dataset.tag;
            showSetTagPasswordModal(tag);
        });
    });

    list.querySelectorAll('.tag-password-remove-btn').forEach(btn => {
        btn.addEventListener('click', async function() {
            const tag = this.dataset.tag;
            if (confirm(`确定要移除标签「${tag}」的密码吗？`)) {
                await setTagPassword(tag, '');
                await renderTagManagerList();
                showToast(`✅ 已移除标签「${tag}」的密码`);
            }
        });
    });

    // 🔥 初始化拖拽排序
    initTagManagerSortable();
}

function initTagManagerSortable() {
    const container = document.getElementById('tagManagerList');
    if (!container) return;

    if (tagManagerSortableInstance) {
        tagManagerSortableInstance.destroy();
        tagManagerSortableInstance = null;
    }

    tagManagerSortableInstance = new Sortable(container, {
        animation: 150,
        ghostClass: 'tag-sort-ghost',
        handle: '.tag-manager-item:not(:first-child) span:first-child',
        filter: '.tag-manager-item:first-child',
        preventOnFilter: false,
        onStart: () => {
            container.querySelectorAll('.tag-manager-item').forEach(el => {
                el.style.cursor = 'grabbing';
            });
        },
        onEnd: async () => {
            container.querySelectorAll('.tag-manager-item').forEach(el => {
                el.style.cursor = '';
            });

            // 获取排序后的标签列表（排除"全部"）
            const items = container.querySelectorAll('.tag-manager-item');
            const newOrder = [];
            items.forEach(el => {
                const tag = el.dataset.tag;
                if (tag && tag !== '全部') {
                    newOrder.push(tag);
                }
            });

            if (newOrder.length > 0) {
                tagSortOrder = newOrder;
                const success = await saveTagSortOrder();
                if (success) {
                    showToast('✅ 标签顺序已保存');
                    // 刷新标签筛选栏
                    renderTagsFilter();
                } else {
                    showToast('❌ 保存排序失败');
                }
            }
        }
    });
}

// 设置标签密码弹窗相关
let settingTagName = null;

function showSetTagPasswordModal(tagName) {
    settingTagName = tagName;
    document.getElementById('setTagPasswordTitle').textContent = `设置「${tagName}」的密码`;
    document.getElementById('setTagPasswordInput').value = '';
    document.getElementById('setTagPasswordConfirm').value = '';
    document.getElementById('setTagPasswordError').style.display = 'none';
    document.getElementById('setTagPasswordModal').classList.add('show');
    setTimeout(() => {
        document.getElementById('setTagPasswordInput').focus();
    }, 100);
}

function closeSetTagPasswordModal() {
    document.getElementById('setTagPasswordModal').classList.remove('show');
    settingTagName = null;
}

async function confirmSetTagPassword() {
    const input = document.getElementById('setTagPasswordInput').value;
    const confirm = document.getElementById('setTagPasswordConfirm').value;
    const errorEl = document.getElementById('setTagPasswordError');
    if (!input || input.length < 4) {
        errorEl.textContent = '密码至少 4 位';
        errorEl.style.display = 'block';
        return;
    }
    if (input !== confirm) {
        errorEl.textContent = '两次输入的密码不一致';
        errorEl.style.display = 'block';
        return;
    }
    await setTagPassword(settingTagName, input);
    closeSetTagPasswordModal();
    await renderTagManagerList();
    showToast(`✅ 已为标签「${settingTagName}」设置密码`);
}

document.addEventListener('DOMContentLoaded', function() {
    const setModal = document.getElementById('setTagPasswordModal');
    if (setModal) {
        document.getElementById('setTagPasswordCloseBtn')?.addEventListener('click', closeSetTagPasswordModal);
        document.getElementById('setTagPasswordCancelBtn')?.addEventListener('click', closeSetTagPasswordModal);
        document.getElementById('setTagPasswordConfirmBtn')?.addEventListener('click', confirmSetTagPassword);
        document.getElementById('setTagPasswordInput')?.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') document.getElementById('setTagPasswordConfirm').focus();
        });
        document.getElementById('setTagPasswordConfirm')?.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') confirmSetTagPassword();
        });
        setModal.addEventListener('click', function(e) {
            if (e.target === setModal) closeSetTagPasswordModal();
        });
    }
    const managerModal = document.getElementById('tagPasswordManagerModal');
    if (managerModal) {
        document.getElementById('tagPasswordManagerCloseBtn')?.addEventListener('click', closeTagPasswordManager);
        document.getElementById('tagPasswordManagerCloseBtn2')?.addEventListener('click', closeTagPasswordManager);
        managerModal.addEventListener('click', function(e) {
            if (e.target === managerModal) closeTagPasswordManager();
        });
    }
});

