// ============================================================
//  主应用逻辑
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
//  工具函数
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

// ===== 图标获取函数（首字母占位 + localStorage缓存） =====
function getSiteLogoSync(site) {
    if (!site) {
        return 'https://ui-avatars.com/api/?name=🔗&background=00b866&color=fff&size=48';
    }
    
    // 检查 localStorage 缓存
    const cacheKey = 'icon_' + site.id;
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
        return cached;
    }
    
    // 返回空，表示需要懒加载
    return null;
}

function isMobileDevice() {
    return /Android|iPhone|iPad|iPod|Windows Phone/i.test(navigator.userAgent);
}

// ============================================================
//  标签排序存储
// ============================================================

function loadTagSortOrder() {
    try {
        const saved = localStorage.getItem('tagSortOrder');
        if (saved) {
            tagSortOrder = JSON.parse(saved);
            return true;
        }
    } catch { }
    return false;
}

function saveTagSortOrder() {
    try {
        localStorage.setItem('tagSortOrder', JSON.stringify(tagSortOrder));
    } catch { }
}

// ============================================================
//  记住上次选中的标签
// ============================================================

function loadActiveTag() {
    const saved = localStorage.getItem('activeTag');
    if (saved && saved !== 'all') {
        // 验证该标签是否还存在
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
//  记住滚动位置
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
//  骨架屏
// ============================================================

function showSkeleton() {
    const wrap = document.getElementById('siteListWrap');
    if (!wrap) return;
    
    // 🔥 如果有数据缓存，不显示骨架屏
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
        // 🔥 只有当内容是骨架时才清空
        if (wrap.querySelector('.skeleton-item')) {
            wrap.innerHTML = '';
        }
    }
}

// ============================================================
//  主题
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
//  优化版数据加载 - 秒开策略（方案一：数据渲染）
// ============================================================

async function loadLinks(sortBy = 'sort_order', order = 'ASC') {
    const statusEl = document.getElementById('syncStatus');
    let hasCache = false;
    const tagsList = document.getElementById('tagsList');
    
    // ===== 第一步：读取数据缓存 =====
    const cached = localStorage.getItem('siteList');
    if (cached) {
        try {
            const parsed = JSON.parse(cached);
            if (Array.isArray(parsed) && parsed.length > 0) {
                siteList = parsed;
                hasCache = true;
                
                hideSkeleton();
                renderAll();
                restoreScrollPosition();
                
                // 🔥 延迟触发图标加载（等待 DOM 渲染完成）
                setTimeout(() => {
                    forceLoadIcons();
                }, 300);
                
                if (statusEl) statusEl.textContent = '● 缓存模式 ⚡';
            }
        } catch { }
    }
    
    // 🔥 恢复标签 HTML 缓存（秒开）
    const tagsHTML = localStorage.getItem('tagsHTML');
    if (tagsHTML && tagsList && !hasCache) {
        tagsList.innerHTML = tagsHTML;
        rebindTagEvents();
    }
    
    // 没有缓存才显示骨架屏
    if (!hasCache) {
        showSkeleton();
        if (statusEl) statusEl.textContent = '● 加载中...';
    } else {
        if (statusEl) statusEl.textContent = '● 更新中...';
    }
    
    // ===== 第二步：后台静默请求最新数据 =====
    try {
        const data = await API.getLinks(sortBy, order);
        
        if (!Array.isArray(data)) {
            throw new Error('返回的数据不是数组');
        }
        
        siteList = data.map(item => {
            let tags = item.tags || [];
            if (typeof tags === 'string') {
                try { tags = JSON.parse(tags); } catch { tags = []; }
            }
            if (!Array.isArray(tags)) tags = [];
            return {
                id: item.id,
                name: item.title || '未命名',
                url: item.url || '',
                icon: item.icon || '',
                tags: tags,
                sort: item.sort_order || 0,
                click_count: item.click_count || 0
            };
        });
        
        localStorage.setItem('siteList', JSON.stringify(siteList));
        
        hideSkeleton();
        renderAll();
        restoreScrollPosition();
        
        // 🔥 数据更新后也强制加载图标
        setTimeout(() => {
            forceLoadIcons();
        }, 300);
        
        if (statusEl) statusEl.textContent = '● 云端模式 ✅';
        
    } catch (err) {
        console.error('后台更新失败:', err);
        if (!hasCache) {
            siteList = [];
            hideSkeleton();
            renderAll();
            showToast('加载数据失败，请刷新重试');
        }
        if (statusEl) statusEl.textContent = hasCache ? '● 缓存模式' : '● 无数据';
    }
}

// ============================================================
//  重新绑定标签事件
// ============================================================

function rebindTagEvents() {
    const tagsList = document.getElementById('tagsList');
    if (!tagsList) return;
    
    tagsList.querySelectorAll('.tag-item').forEach(item => {
        // 移除旧事件（如果有）
        const newItem = item.cloneNode(true);
        item.parentNode.replaceChild(newItem, item);
        
        // 绑定新事件
        newItem.onclick = function() {
            if (isTagSortMode) return;
            document.querySelectorAll('.tag-item').forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            activeTag = this.dataset.tag;
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
//  渲染
// ============================================================

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

    return tags;
}

function renderTagsFilter() {
    const tagsList = document.getElementById('tagsList');
    if (!tagsList) return;
    const allTags = getAllTags();
    tagsList.innerHTML = '';

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
        // 移动端自动收起标签栏
        if (isMobileDevice()) {
            const wrap = document.getElementById('tagsFilterWrap');
            if (wrap) wrap.classList.remove('expanded');
        }
    };
    tagsList.appendChild(allTag);

    allTags.forEach(tag => {
        const item = document.createElement('div');
        item.className = `tag-item ${activeTag === tag ? 'active' : ''}`;
        item.innerText = tag;
        item.dataset.tag = tag;
        item.dataset.sortable = 'true';
        item.onclick = () => {
            if (isTagSortMode) return;
            document.querySelectorAll('.tag-item').forEach(t => t.classList.remove('active'));
            item.classList.add('active');
            activeTag = tag;
            saveActiveTag(tag);
            renderList();
            // 移动端自动收起标签栏
            if (isMobileDevice()) {
                const wrap = document.getElementById('tagsFilterWrap');
                if (wrap) wrap.classList.remove('expanded');
            }
        };
        tagsList.appendChild(item);
    });

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

    // 🔥 保存标签 HTML 到 localStorage
    try {
        localStorage.setItem('tagsHTML', tagsList.innerHTML);
    } catch (e) {
        // 存储失败不影响功能
    }
}

// ============================================================
//  标签拖拽排序
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
        saveTagSortOrder();
        showToast('排序已保存');
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
            saveTagSortOrder();
            showToast('标签顺序已更新');
        }
    });
}

function getFilteredList() {
    if (!Array.isArray(siteList)) {
        console.error('siteList 不是数组，重新初始化');
        siteList = [];
        return [];
    }

    const searchInput = document.getElementById('searchInput');
    const keyword = searchInput ? searchInput.value.trim().toLowerCase() : '';
    let list = [...siteList];
    if (activeTag !== 'all') {
        list = list.filter(s => s.tags && Array.isArray(s.tags) && s.tags.includes(activeTag));
    }
    if (keyword) {
        list = list.filter(s =>
            (s.name || '').toLowerCase().includes(keyword) ||
            (s.url || '').toLowerCase().includes(keyword) ||
            (s.tags && Array.isArray(s.tags) && s.tags.some(t => (t || '').toLowerCase().includes(keyword)))
        );
    }
    // 后端已排序，前端只做筛选，不重新排序
    return list;
}

// ============================================================
//  renderList - 使用 requestAnimationFrame 批量更新 DOM + loading="lazy"
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
    wrap.innerHTML = '';
    const filtered = getFilteredList();

    if (!Array.isArray(filtered) || filtered.length === 0) {
        wrap.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:#6b7280;">暂无链接，点击「添加网址」开始收藏</div>';
        isRendering = false;
        return;
    }

    // ===== 🔥 使用 requestAnimationFrame 批量更新 DOM =====
    requestAnimationFrame(() => {
        const frag = document.createDocumentFragment();
        const lazyItems = [];

        filtered.forEach((site) => {
            const div = document.createElement('div');
            div.className = `site-item ${isDragLocked ? 'locked' : ''}`;
            if (isDragLocked) div.style.cursor = 'not-allowed';
            div.setAttribute('data-url', site.url || '');
            div.setAttribute('data-id', site.id || '');

            // ===== 图标渲染（首字母占位 + 懒加载） =====
            let iconHtml = '';
            if (site.icon && site.icon.length <= 2 && !site.icon.startsWith('http')) {
                iconHtml = `<div class="site-icon" style="background:#00b866;">${site.icon}</div>`;
            } else {
                // 检查 localStorage 缓存
                const cacheKey = 'icon_' + site.id;
                const cached = localStorage.getItem(cacheKey);
                
                if (cached) {
                    // 🔥 有缓存 → 直接显示图标 + loading="lazy"
                    iconHtml = `<div class="site-icon" style="background:transparent;"><img src="${cached}" alt="${site.name || '链接'}" loading="lazy" style="width:100%;height:100%;object-fit:cover;"></div>`;
                } else {
                    // 无缓存 → 先显示首字母占位
                    const letter = (site.name || '链接').charAt(0).toUpperCase();
                    iconHtml = `<div class="site-icon" style="background:#00b866;font-size:24px;font-weight:bold;color:#fff;display:flex;align-items:center;justify-content:center;">${letter}</div>`;
                    // 记录到懒加载队列
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

            // ===== 测速显示 =====
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

            // ---- 点击反馈：按下动画 ----
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

            // ---- 悬停提示 ----
            div.title = '点击打开链接';

            // ---- 右键菜单 ----
            div.addEventListener('contextmenu', function(e) {
                e.preventDefault();
                e.stopPropagation();
                showContextMenu(e.clientX, e.clientY, site.id, site.url);
            });

            // PC 长按编辑
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

            // 移动端触屏收起标签
            div.addEventListener('touchstart', () => {
                const wrap2 = document.getElementById('tagsFilterWrap');
                if (wrap2 && wrap2.classList.contains('expanded')) {
                    wrap2.classList.remove('expanded');
                }
            });

            frag.appendChild(div);
        });

        wrap.appendChild(frag);

        // ===== 委托点击事件（只绑定一次，统一处理所有卡片点击） =====
        if (!wrap._clickBound) {
            wrap.addEventListener('click', function(e) {
                const item = e.target.closest('.site-item');
                if (item) {
                    const url = item.dataset.url;
                    if (url) {
                        window.open(url, '_blank');
                    }
                }
            });
            wrap._clickBound = true;
        }

        setTimeout(() => {
            if (!isDragLocked) initSortableDrag();
            isRendering = false;
            
            // ===== 启动懒加载图标 =====
            if (lazyItems.length > 0) {
                startLazyLoad(lazyItems);
            }
        }, 50);
    });
}

function renderAll() {
    renderTagsFilter();
    renderList();
    handleSearchUI();
}

// ============================================================
//  右键菜单（移动端长按菜单）
// ============================================================

let contextMenuEl = null;

function showContextMenu(x, y, id, url) {
    // 如果已有菜单，先关闭
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

    // 确保菜单不超出屏幕
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

    // 保存菜单引用以便清理
    menu._id = id;

    // ---- 滚动时关闭菜单 ----
    const scrollHandler = function() {
        closeContextMenu();
    };

    // ---- 点击页面其他位置关闭菜单 ----
    const clickHandler = function(e) {
        if (contextMenuEl && !contextMenuEl.contains(e.target)) {
            closeContextMenu();
        }
    };

    // ---- 触屏点击其他地方关闭 ----
    const touchHandler = function(e) {
        if (contextMenuEl && !contextMenuEl.contains(e.target)) {
            closeContextMenu();
        }
    };

    // 保存清理函数引用
    menu._scrollHandler = scrollHandler;
    menu._clickHandler = clickHandler;
    menu._touchHandler = touchHandler;

    // 绑定事件
    setTimeout(() => {
        window.addEventListener('scroll', scrollHandler, { passive: true });
        // 延迟绑定点击事件，防止点击菜单时立即触发关闭
        setTimeout(() => {
            document.addEventListener('click', clickHandler);
            document.addEventListener('touchstart', touchHandler, { passive: true });
        }, 50);
    }, 10);
}

function closeContextMenu() {
    if (contextMenuEl) {
        // 清理所有事件监听
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
//  搜索
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
//  拖拽
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
//  弹窗（添加/编辑）
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
    
    // 移动端：延迟调整弹窗位置，防止键盘遮挡
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
//  标签相关（含展开/收起）
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

    const lastComma = val.lastIndexOf(',');
    const keyword = lastComma === -1 ? val.trim() : val.substring(lastComma + 1).trim();

    const parts = val.split(',').map(s => s.trim()).filter(s => s);
    if (keyword && parts.length > 0 && parts[parts.length - 1] === keyword) {
        selectedTags = parts.slice(0, -1);
    } else {
        selectedTags = parts;
    }

    renderSelectedTags();
    renderExistingTags(keyword);
}

// ============================================================
//  保存 / 删除
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

    const tagsInput = document.getElementById('modalSiteTags');
    if (tagsInput) {
        const val = tagsInput.value;
        const parts = val.split(',').map(s => s.trim()).filter(s => s);
        selectedTags = parts.filter((t, i, arr) => t && arr.indexOf(t) === i);
    }

    const data = {
        title: name,
        url,
        icon,
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

async function deleteSite() {
    if (!editingId) return;
    if (!confirm('确定要删除这个网址吗？')) return;
    try {
        await API.deleteLink(editingId);
        showToast('删除成功');
        closeModal();
        await loadLinks();
    } catch (err) {
        showToast(err.message);
    }
}

// ============================================================
//  剪贴板
// ============================================================

async function extractFromClipboard() {
    try {
        const text = await navigator.clipboard.readText();
        if (!text) { showToast('剪贴板为空'); return; }
        const urls = text.match(/https?:\/\/[^\s]+/gi) || [];
        const valid = urls.find(u => isValidUrl(u));
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
//  测速（使用 no-cors 模式 - 可测内网）
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
        
        // 🔥 关键：使用 mode: 'no-cors'
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

// ============================================================
//  批量测速 - 使用 Web Worker（不阻塞主线程）
// ============================================================

let worker = null;

async function batchTestLatency() {
    const list = getFilteredList();
    if (!list.length) { showToast('暂无链接'); return; }
    
    const btn = document.getElementById('refreshBtn');
    if (btn) btn.disabled = true;
    
    // 获取所有卡片元素
    const allItems = document.querySelectorAll('.site-item');
    
    // 先让所有卡片显示"测速中"
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
    
    // 如果已有 Worker，先终止
    if (worker) {
        worker.terminate();
        worker = null;
    }
    
    // 创建新的 Worker
    try {
        worker = new Worker('worker.js');
    } catch (err) {
        showToast('Worker 创建失败，请刷新重试');
        if (btn) btn.disabled = false;
        return;
    }
    
    // 监听 Worker 返回的结果
    worker.addEventListener('message', function(e) {
        const data = e.data;
        
        if (data.type === 'result') {
            const { index, url, latency } = data;
            
            // 更新缓存
            if (latency === '超时' || latency === '失效') {
                latencyCache[url] = latency;
            } else if (typeof latency === 'number' && latency > 0) {
                latencyCache[url] = latency;
            }
            saveLatencyCache();
            
            // 更新对应的卡片
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
    
    // 发送测速任务到 Worker
    const urls = list.map(site => site.url);
    worker.postMessage({ urls });
}

// ============================================================
//  导入 / 导出
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

            showToast(`正在导入 ${data.length} 条数据...`);

            const importData = data
                .filter(item => item.name && item.url && isValidUrl(item.url))
                .map(item => ({
                    title: item.name,
                    url: item.url,
                    icon: item.icon || '',
                    tags: item.tags || [],
                    sort: item.sort || 0
                }));

            if (importData.length === 0) {
                showToast('没有有效数据可导入');
                return;
            }

            const result = await API.importLinks(importData);

            let msg = `✅ 导入完成：成功 ${result.successCount} 条`;
            if (result.skipCount > 0) {
                msg += `，⏭️ 跳过 ${result.skipCount} 条（已存在）`;
            }
            if (result.errorCount > 0) {
                msg += `，❌ 失败 ${result.errorCount} 条`;
            }
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
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
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
//  标签栏折叠（移动端）
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
//  返回顶部
// ============================================================

function handleScroll() {
    const btn = document.getElementById('backToTopBtn');
    if (btn) {
        btn.classList.toggle('show', window.scrollY > SCROLL_THRESHOLD);
    }
    // 保存滚动位置（每500ms保存一次，避免频繁写入）
    if (document.getElementById('mainPage') && document.getElementById('mainPage').style.display !== 'none') {
        clearTimeout(window._scrollSaveTimer);
        window._scrollSaveTimer = setTimeout(saveScrollPosition, 500);
    }
}

function backToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ============================================================
//  键盘快捷键
// ============================================================

function initKeyboardShortcuts() {
    document.addEventListener('keydown', function(e) {
        // Ctrl+K 或 Cmd+K → 聚焦搜索框
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            const searchInput = document.getElementById('searchInput');
            if (searchInput) {
                searchInput.focus();
                searchInput.select();
            }
        }
        
        // ESC → 关闭弹窗
        if (e.key === 'Escape') {
            const addModal = document.getElementById('addModal');
            if (addModal && addModal.classList.contains('show')) {
                closeModal();
            }
            const adminModal = document.getElementById('adminModal');
            if (adminModal && adminModal.classList.contains('show')) {
                closeAdminPanel();
            }
            // 如果搜索框有内容且有焦点，清除内容并失焦
            const searchInput = document.getElementById('searchInput');
            if (searchInput && document.activeElement === searchInput) {
                searchInput.blur();
            }
        }
    });
}

// ============================================================
//  排序切换
// ============================================================

function initSortSelector() {
    const sortSelect = document.getElementById('sortSelect');
    if (!sortSelect) return;
    
    // 恢复排序偏好
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
//  初始化
// ============================================================

function initApp() {
    loadTagSortOrder();
    loadActiveTag();
    initTheme();
    initTagsFilter();
    loadLatencyCache();
    initSortSelector();
    
    // 恢复排序偏好并加载数据
    const sortSelect = document.getElementById('sortSelect');
    if (sortSelect) {
        const saved = localStorage.getItem('sortPreference');
        if (saved) {
            const [sortBy, order] = saved.split(':');
            loadLinks(sortBy, order);
        } else {
            loadLinks();
        }
    } else {
        loadLinks();
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
//  管理员功能
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
//  事件绑定（在 DOM 加载后执行）
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
    if (pasteBtn) pasteBtn.addEventListener('click', extractFromClipboard);

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
//  用户下拉菜单（兼容 Edge）
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
//  页面加载后自动登录（优化版 - 无闪烁）
// ============================================================

document.addEventListener('DOMContentLoaded', function() {
    var token = localStorage.getItem('token');
    var user = localStorage.getItem('user');
    
    var loginPage = document.getElementById('loginPage');
    var mainPage = document.getElementById('mainPage');
    
    // 主页面默认已显示（HTML中 style="display:block"）
    // 先让用户看到缓存数据，同时异步检查登录状态
    if (token && user) {
        try {
            var userData = JSON.parse(user);
            if (userData.username) {
                // ✅ 已登录：主页面保持显示
                if (loginPage) {
                    loginPage.style.display = 'none';
                    loginPage.classList.remove('show');
                }
                if (mainPage) mainPage.style.display = 'block';
                
                // 更新用户信息
                var nameEl = document.getElementById('displayUsername');
                var roleEl = document.getElementById('displayRole');
                if (nameEl) nameEl.textContent = userData.username || '用户';
                if (roleEl) roleEl.textContent = userData.role === 'admin' ? '管理员' : '普通';
                
                // 初始化应用（loadLinks 会先读缓存，秒开）
                if (typeof initApp === 'function') {
                    initApp();
                }
                return;
            }
        } catch(e) {}
    }
    
    // ❌ 未登录：跳转到登录页
    if (loginPage) {
        loginPage.style.display = 'flex';
        loginPage.classList.add('show');
    }
    if (mainPage) mainPage.style.display = 'none';
});

// ============================================================
//  懒加载图标（滚动到才加载 + 每批5个 + localStorage缓存）
// ============================================================

let lazyObserver = null;
let iconLoadQueue = [];
let isLoadingIcons = false;
const BATCH_SIZE = 5;

function startLazyLoad(items) {
    // 只保留没有缓存的
    iconLoadQueue = items.filter(({ site }) => {
        const cacheKey = 'icon_' + site.id;
        return !localStorage.getItem(cacheKey);
    });
    
    if (iconLoadQueue.length === 0) return;
    
    // 立即加载第一屏可见的（最多5个）
    setTimeout(() => {
        loadVisibleIcons();
    }, 100);
    
    // 创建 IntersectionObserver
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
            // 每次最多加载 BATCH_SIZE 个
            const batch = toLoad.slice(0, BATCH_SIZE);
            batch.forEach(({ div, site }) => {
                loadSingleIcon(div, site);
            });
        }
    }, {
        rootMargin: '100px',
        threshold: 0.01
    });
    
    // 开始观察所有卡片
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

function loadSingleIcon(div, site) {
    if (div._iconLoaded) return;
    div._iconLoaded = true;
    
    const iconEl = div.querySelector('.site-icon');
    if (!iconEl) return;
    if (iconEl.querySelector('img')) return;
    
    // 再次检查 localStorage 缓存
    const cacheKey = 'icon_' + site.id;
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
        iconEl.innerHTML = '';
        iconEl.style.background = 'transparent';
        iconEl.style.fontSize = '';
        iconEl.style.fontWeight = '';
        iconEl.style.color = '';
        iconEl.style.display = '';
        const img = document.createElement('img');
        img.src = cached;
        img.loading = 'lazy';
        img.alt = site.name || '图标';
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.objectFit = 'cover';
        iconEl.appendChild(img);
        return;
    }
    
    // 直接拉取网站 favicon
    let iconUrl;
    try {
        const u = new URL(site.url || '');
        iconUrl = `${u.protocol}//${u.hostname}/favicon.ico`;
    } catch {
        // URL 解析失败，保留首字母
        return;
    }
    
    // 加载图片
    const img = new Image();
    img.loading = 'lazy';
    // img.crossOrigin = 'anonymous';
    img.onload = function() {
        iconEl.innerHTML = '';
        iconEl.style.background = 'transparent';
        iconEl.style.fontSize = '';
        iconEl.style.fontWeight = '';
        iconEl.style.color = '';
        iconEl.style.display = '';
        const newImg = document.createElement('img');
        newImg.src = iconUrl;
        newImg.loading = 'lazy';
        newImg.alt = site.name || '图标';
        newImg.style.width = '100%';
        newImg.style.height = '100%';
        newImg.style.objectFit = 'cover';
        iconEl.appendChild(newImg);
        localStorage.setItem(cacheKey, iconUrl);
    };
    img.onerror = function() {
        // 加载失败，保留首字母
        div._iconLoaded = false;
    };
    img.src = iconUrl;
}

function cleanupLazyLoad() {
    if (lazyObserver) {
        lazyObserver.disconnect();
        lazyObserver = null;
    }
    iconLoadQueue = [];
    isLoadingIcons = false;
}

// ============================================================
//  强制加载图标（兜底方案）
// ============================================================

function forceLoadIcons() {
    const wrap = document.getElementById('siteListWrap');
    if (!wrap) return;
    
    const items = wrap.querySelectorAll('.site-item');
    const toLoad = [];
    
    items.forEach(div => {
        const iconEl = div.querySelector('.site-icon');
        // 如果图标是首字母占位（没有 img），加入加载队列
        if (iconEl && !iconEl.querySelector('img')) {
            const id = parseInt(div.dataset.id);
            const site = siteList.find(s => s.id === id);
            if (site) {
                toLoad.push({ div, site });
            }
        }
    });
    
    if (toLoad.length > 0) {
        console.log('强制加载图标:', toLoad.length);
        startLazyLoad(toLoad);
    }
}
