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

function getSiteLogoSync(url) {
    try {
        const parsedUrl = new URL(url);
        return `${parsedUrl.protocol}//${parsedUrl.hostname}/favicon.ico`;
    } catch (error) {
        return `https://ui-avatars.com/api/?name=${encodeURIComponent(url)}&background=00b866&color=fff&size=48`;
    }
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
//  骨架屏
// ============================================================

function showSkeleton() {
    const wrap = document.getElementById('siteListWrap');
    if (!wrap) return;
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
        wrap.innerHTML = '';
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
//  数据加载
// ============================================================

async function loadLinks() {
    const statusEl = document.getElementById('syncStatus');
    if (statusEl) statusEl.textContent = '● 加载中...';

    showSkeleton();

    try {
        const data = await API.getLinks();

        if (!Array.isArray(data)) {
            throw new Error('返回的数据不是数组');
        }

        siteList = data.map(item => {
            let tags = item.tags || [];
            if (typeof tags === 'string') {
                try {
                    tags = JSON.parse(tags);
                } catch (e) {
                    tags = [];
                }
            }
            if (!Array.isArray(tags)) {
                tags = [];
            }
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
        siteList.sort((a, b) => (a.sort || 0) - (b.sort || 0));
        localStorage.setItem('siteList', JSON.stringify(siteList));
        if (statusEl) {
            statusEl.textContent = '● 云端模式 ✅';
        }
    } catch (err) {
        console.error('加载数据失败:', err);
        const cached = localStorage.getItem('siteList');
        if (cached) {
            try {
                siteList = JSON.parse(cached);
                if (!Array.isArray(siteList)) siteList = [];
            } catch {
                siteList = [];
            }
            if (statusEl) {
                statusEl.textContent = '● 缓存模式';
            }
            showToast('使用缓存数据');
        } else {
            siteList = [];
            if (statusEl) {
                statusEl.textContent = '● 无数据';
            }
            showToast('加载数据失败，请刷新重试');
        }
    }
    hideSkeleton();
    renderAll();
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
        renderList();
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
            renderList();
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
    list.sort((a, b) => (a.sort || 0) - (b.sort || 0));
    return list;
}

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

const frag = document.createDocumentFragment();
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
            const logo = getSiteLogoSync(site.url || '');
            iconHtml = `<div class="site-icon"><img src="${logo}" alt="${site.name || '链接'}" onerror="this.parentElement.innerHTML='🔗';this.parentElement.style.background='#00b866'"></div>`;
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
        if (latencyCache[url] !== undefined) {
            if (latencyCache[url] === '超时') {
                latencyText = '超时';
                latencyClass = 'latency-timeout';
            } else {
                latencyText = latencyCache[url] + ' ms';
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

        // ---- 点击打开链接 ----
        div.addEventListener('click', function(e) {
            if (isDragging || isMouseMoving) {
                e.preventDefault();
                return;
            }
            if (site.url) {
                window.open(site.url, '_blank');
            } else {
                showToast('该链接地址无效');
            }
        });

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

    // 备用委托点击
    wrap.addEventListener('click', function(e) {
        const item = e.target.closest('.site-item');
        if (item) {
            const url = item.dataset.url;
            if (url) {
                window.open(url, '_blank');
            }
        }
    });

    setTimeout(() => {
        if (!isDragLocked) initSortableDrag();
        isRendering = false;
    }, 50);
}

function renderAll() {
    renderTagsFilter();
    renderList();
    handleSearchUI();
}

// ============================================================
//  右键菜单
// ============================================================

let contextMenuEl = null;

function showContextMenu(x, y, id, url) {
    if (contextMenuEl) {
        contextMenuEl.remove();
        contextMenuEl = null;
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
        menu.appendChild(btn);
    });

    document.body.appendChild(menu);
    contextMenuEl = menu;

    setTimeout(() => {
        document.addEventListener('click', closeContextMenu, { once: true });
        document.addEventListener('contextmenu', closeContextMenu, { once: true });
    }, 10);
}

function closeContextMenu() {
    if (contextMenuEl) {
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
//  测速
// ============================================================

async function testLatency(url) {
    const start = performance.now();
    try {
        const controller = new AbortController();
        setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
        await fetch(url, { method: 'HEAD', mode: 'no-cors', cache: 'no-cache', signal: controller.signal });
        const latency = Math.round(performance.now() - start);
        latencyCache[url] = latency;
        localStorage.setItem('latencyCache', JSON.stringify(latencyCache));
        return latency;
    } catch {
        latencyCache[url] = '超时';
        localStorage.setItem('latencyCache', JSON.stringify(latencyCache));
        return '超时';
    }
}

async function batchTestLatency() {
    const list = getFilteredList();
    if (!list.length) { showToast('暂无链接'); return; }
    showToast('测速中...');
    const tags = document.querySelectorAll('.latency-tag');
    tags.forEach((el, i) => {
        if (i < list.length) {
            el.textContent = '测速中';
            el.className = 'latency-tag latency-loading';
        }
    });
    for (let i = 0; i < list.length; i++) {
        const el = document.querySelectorAll('.latency-tag')[i];
        if (!el) continue;
        const result = await testLatency(list[i].url);
        el.textContent = result === '超时' ? '超时' : result + ' ms';
        el.className = 'latency-tag' + (result === '超时' ? ' latency-timeout' : '');
    }
    showToast('测速完成');
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
}

function backToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ============================================================
//  初始化
// ============================================================

function initApp() {
    loadTagSortOrder();
    initTheme();
    initTagsFilter();
    loadLatencyCache();
    loadLinks();
    window.addEventListener('scroll', handleScroll);
    handleScroll();
    const lockBtn = document.getElementById('dragLockBtn');
    if (lockBtn) {
        lockBtn.textContent = '🔒';
        lockBtn.classList.add('locked');
    }
}
window.initApp = initApp;

function loadLatencyCache() {
    try {
        const saved = localStorage.getItem('latencyCache');
        if (saved) latencyCache = JSON.parse(saved);
    } catch { latencyCache = {}; }
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
//  页面加载后自动登录（修复跳转登录页问题）
// ============================================================

document.addEventListener('DOMContentLoaded', function() {
    var token = localStorage.getItem('token');
    var user = localStorage.getItem('user');
    
    if (token && user) {
        try {
            var userData = JSON.parse(user);
            if (userData.username) {
                // 直接显示主页面
                var loginPage = document.getElementById('loginPage');
                var mainPage = document.getElementById('mainPage');
                if (loginPage) loginPage.style.display = 'none';
                if (mainPage) mainPage.style.display = 'block';
                
                // 更新用户信息
                var nameEl = document.getElementById('displayUsername');
                var roleEl = document.getElementById('displayRole');
                if (nameEl) nameEl.textContent = userData.username || '用户';
                if (roleEl) roleEl.textContent = userData.role === 'admin' ? '管理员' : '普通';
                
                // 初始化应用
                if (typeof initApp === 'function') {
                    initApp();
                }
                return;
            }
        } catch(e) {}
    }
    
    // 未登录：显示登录页
    var loginPage = document.getElementById('loginPage');
    var mainPage = document.getElementById('mainPage');
    if (loginPage) loginPage.style.display = 'flex';
    if (mainPage) mainPage.style.display = 'none';
});
