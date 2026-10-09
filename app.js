async function deleteSite() {
  if (editingId) {
    try {
      (await deleteSiteById(editingId), closeModal());
    } catch (e) {
      showToast(e.message);
    }
  }
}
const TOAST_DURATION = 2e3,
  REQUEST_TIMEOUT = 3e3,
  SCROLL_THRESHOLD = 300;
let siteList = [],
  activeTag = "all",
  isRendering = !1,
  selectedTags = [],
  editingId = null,
  latencyCache = {},
  sortableInstance = null,
  isDragLocked = !0,
  isDarkTheme = !1,
  isDragging = !1,
  isMouseMoving = !1,
  longPressTimer = null,
  tagExpandState = {},
  tagSortOrder = [],
  isTagSortMode = !1,
  tagSortableInstance = null,
  isLoading = !0;
function showToast(e, t = 2e3) {
  const n = document.getElementById("toast");
  n &&
    ((n.textContent = e),
    n.classList.add("show"),
    clearTimeout(n.timer),
    (n.timer = setTimeout(() => n.classList.remove("show"), t)));
}
function isValidUrl(e) {
  return !!e && /^(http|https):\/\/[a-zA-Z0-9.-]+(:\d+)?(\/[^#?]*)*(\?.*)?(#.*)?$/i.test(e);
}
function getFileName() {
  const e = new Date();
  return `站点备份-${e.getFullYear()}${String(e.getMonth() + 1).padStart(2, "0")}${String(e.getDate()).padStart(2, "0")}.json`;
}
function getSiteLogoSync(e) {
  if (!e) return "https://ui-avatars.com/api/?name=🔗&background=00b866&color=fff&size=48";
  const t = "icon_" + e.id,
    n = localStorage.getItem(t);
  if (n) return n;
  try {
    const t = new URL(e.url || "").hostname.replace(/^www\./, "");
    if (t) return `/api/favicon?domain=${encodeURIComponent(t)}`;
  } catch {}
  return null;
}
function isInternalHost(e) {
  if (
    !(e = String(e || "")
      .toLowerCase()
      .replace(/\.$/, "")) ||
    "localhost" === e
  )
    return !0;
  if (/\.(local|internal|lan|test|home\.arpa|invalid)$/.test(e)) return !0;
  const t = e.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (t) {
    const e = +t[1],
      n = +t[2];
    if (0 === e || 10 === e || 127 === e) return !0;
    if (169 === e && 254 === n) return !0;
    if (172 === e && n >= 16 && n <= 31) return !0;
    if (192 === e && 168 === n) return !0;
    if (100 === e && n >= 64 && n <= 127) return !0;
    if (e >= 224) return !0;
  }
  return !(!e.includes(":") || !/^(::1|fe80:|fc|fd)/i.test(e.replace(/^\[|\]$/g, "")));
}
function isMobileDevice() {
  return /Android|iPhone|iPad|iPod|Windows Phone/i.test(navigator.userAgent);
}
function loadLatencyCache() {
  try {
    const e = localStorage.getItem("latencyCache");
    e && (latencyCache = JSON.parse(e));
  } catch {
    latencyCache = {};
  }
}
function saveLatencyCache() {
  try {
    localStorage.setItem("latencyCache", JSON.stringify(latencyCache));
  } catch {}
}
async function loadTagSortOrder() {
  try {
    const e = await fetch("/api/tags/order", { headers: { Authorization: "Bearer " + localStorage.getItem("token") } });
    if (!e.ok) throw new Error("加载排序失败");
    const t = await e.json();
    if (Array.isArray(t) && t.length > 0) {
      tagSortOrder = t.map((e, n) => ("object" == typeof e && e && "n" in e ? e : { n: e, s: 10 * (n + 1) }));
      return !0;
    }
    return !1;
  } catch (e) {
    return (console.error("加载标签排序失败:", e), !1);
  }
}
async function saveTagSortOrder() {
  try {
    if (
      !(
        await fetch("/api/tags/order", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: "Bearer " + localStorage.getItem("token") },
          body: JSON.stringify({ tags: tagSortOrder }),
        })
      ).ok
    )
      throw new Error("保存排序失败");
    return !0;
  } catch (e) {
    return (console.error("保存标签排序失败:", e), !1);
  }
}
function loadActiveTag() {
  const e = localStorage.getItem("activeTag");
  if (e && "all" !== e) {
    if (getAllTags().includes(e)) return ((activeTag = e), !0);
  }
  const n = "CloudFlare应用";
  return getAllTags().includes(n) ? ((activeTag = n), !0) : ((activeTag = "all"), !1);
}
function saveActiveTag(e) {
  localStorage.setItem("activeTag", e);
}
function saveScrollPosition() {
  document.getElementById("mainPage") && localStorage.setItem("scrollPosition", String(window.scrollY));
}
function restoreScrollPosition() {
  const e = localStorage.getItem("scrollPosition");
  e &&
    setTimeout(() => {
      window.scrollTo(0, parseInt(e));
    }, 100);
}
function showSkeleton() {
  const e = document.getElementById("siteListWrap");
  if (!e) return;
  isLoading = !0;
  let t = "";
  const n = window.innerWidth > 1200 ? 16 : window.innerWidth > 768 ? 12 : 8;
  for (let e = 0; e < n; e++)
    t +=
      '\n            <div class="skeleton-item">\n                <div class="skeleton-icon"></div>\n                <div class="skeleton-line" style="width:60%;"></div>\n                <div class="skeleton-line" style="width:80%;"></div>\n                <div class="skeleton-line" style="width:40%;"></div>\n            </div>\n        ';
  e.innerHTML = t;
}
function hideSkeleton() {
  isLoading = !1;
  const e = document.getElementById("siteListWrap");
  e && e.querySelector(".skeleton-item") && (e.innerHTML = "");
}
function initTheme() {
  ((isDarkTheme = "true" === localStorage.getItem("darkTheme")), document.body.classList.toggle("dark", isDarkTheme));
  const e = document.getElementById("themeToggleBtn");
  e && (e.textContent = isDarkTheme ? "🌙" : "🌞");
}
function toggleTheme() {
  ((isDarkTheme = !isDarkTheme),
    document.body.classList.toggle("dark", isDarkTheme),
    localStorage.setItem("darkTheme", isDarkTheme));
  const e = document.getElementById("themeToggleBtn");
  (e && (e.textContent = isDarkTheme ? "🌙" : "🌞"), showToast(isDarkTheme ? "暗黑模式" : "明亮模式"));
}
const SNAPSHOT_KEY = 'siteSnapshot';
const LEGACY_SNAPSHOT_KEY = 'siteList';
let linksEtag = null;
let snapshotEtag = null;

// 同时兼容服务端新行格式（title / sort_order / tags 数组）与旧快照格式（name / sort）
function normalizeRow(row) {
  let tags = row.tags;
  if (typeof tags === 'string') {
    try { tags = JSON.parse(tags); } catch { tags = []; }
  }
  if (!Array.isArray(tags)) tags = [];
  return {
    id: row.id,
    name: row.title !== undefined ? row.title || '未命名' : row.name || '未命名',
    url: row.url || '',
    icon: row.icon || '',
    icon_url: row.icon_url || '',
    tags: tags.filter(tag => typeof tag === 'string' && tag),
    sort: row.sort_order !== undefined ? row.sort_order || 0 : row.sort || 0,
    click_count: row.click_count || 0,
  };
}

function readSnapshot(sort, order) {
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY);
    if (raw) {
      const stored = JSON.parse(raw);
      // 排序方式不同时内容顺序不一样，不能复用另一个排序的快照
      if (stored && Array.isArray(stored.rows) && stored.sort === sort && stored.order === order) return stored;
    }
  } catch {}
  try {
    const legacy = localStorage.getItem(LEGACY_SNAPSHOT_KEY);
    if (legacy) {
      localStorage.removeItem(LEGACY_SNAPSHOT_KEY);
      const rows = JSON.parse(legacy);
      if (Array.isArray(rows) && rows.length > 0) return { rows, etag: null, sort, order };
    }
  } catch {}
  return null;
}

function writeSnapshot(sort, order, rows, etag) {
  try {
    // 内容指纹没变就不必再序列化并写入整份列表
    if (etag && snapshotEtag === etag) return;
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify({ sort, order, etag, rows }));
    snapshotEtag = etag;
  } catch {}
}

async function loadLinks(sort = 'sort_order', order = 'ASC') {
  const status = document.getElementById('syncStatus');
  const snapshot = readSnapshot(sort, order);
  linksEtag = snapshot ? snapshot.etag || null : null;
  let usedCache = false;

  if (snapshot && snapshot.rows.length > 0) {
    siteList = snapshot.rows.map(normalizeRow);
    usedCache = true;
    hideSkeleton();
    renderAll();
    restoreScrollPosition();
    if (status) status.textContent = '● 更新中...';
  } else {
    showSkeleton();
    if (status) status.textContent = '● 加载中...';
  }

  try {
    const result = await API.getLinks(sort, order, linksEtag);

    // 服务端确认内容未变：列表保持原样，不重新渲染，也不重写本地快照
    if (result.notModified) {
      if (status) status.textContent = usedCache ? '● 云端一致 ✅' : '● 云端模式 ✅';
      return;
    }
    if (!Array.isArray(result.data)) throw new Error('返回的数据不是数组');

    linksEtag = result.etag || null;
    siteList = result.data.map(normalizeRow);
    result.data.forEach(row => {
      if (!row.icon_url) return;
      const key = 'icon_' + row.id;
      if (!localStorage.getItem(key)) localStorage.setItem(key, row.icon_url);
    });
    writeSnapshot(sort, order, result.data, linksEtag);
    hideSkeleton();
    renderAll();
    restoreScrollPosition();
    if (status) status.textContent = '● 云端模式 ✅';
  } catch (e) {
    console.error('后台更新失败:', e);
    if (!usedCache) {
      siteList = [];
      hideSkeleton();
      renderAll();
      showToast('加载数据失败，请刷新重试');
    }
    if (status) status.textContent = usedCache ? '● 缓存模式' : '● 无数据';
  }
}
window.showToast = showToast;
let isRenderingTags = !1;
function getAllTags() {
  if (!Array.isArray(siteList)) return ((siteList = []), []);
  const e = {};
  siteList.forEach((t) => {
    t.tags &&
      Array.isArray(t.tags) &&
      t.tags.forEach((t) => {
        t && (e[t] = (e[t] || 0) + 1);
      });
  });
  let t = Object.keys(e);
  const u = {};
  tagSortOrder.forEach((e) => {
    u[e.n] = e.s || 0;
  });
  t.sort((n, o) => {
    const s = void 0 !== u[n] ? u[n] : 999999,
      r = void 0 !== u[o] ? u[o] : 999999;
    return s !== r ? s - r : (e[o] || 0) - (e[n] || 0) || n.localeCompare(o);
  });
  if (0 === tagSortOrder.length) tagSortOrder = t.map((e, n) => ({ n: e, s: 10 * (n + 1) }));
  return [...new Set(t)];
}
async function renderTagsFilter() {
  if (isRenderingTags) {
    console.log('⏳ 标签正在渲染，跳过重复调用');
    return;
  }
  isRenderingTags = true;
  try {
    const wrap = document.getElementById('tagsList');
    if (!wrap) return;
    wrap.replaceChildren();
    wrap.classList.remove('show');

    lockedTagSet = await loadLockedTags();

    const allChip = document.createElement('div');
    allChip.className = 'tag-item all ' + (activeTag === 'all' ? 'active' : '');
    allChip.textContent = '全部';
    allChip.dataset.tag = 'all';
    allChip.onclick = () => selectTag('all');
    wrap.appendChild(allChip);

    // 加密标签下的链接不会出现在数据里，标签本身仍要显示出来，否则无法解锁
    const tagNames = [...new Set([...getAllTags(), ...lockedTagSet])];
    tagNames.forEach(tag => {
      const chip = document.createElement('div');
      chip.className = 'tag-item ' + (activeTag === tag ? 'active' : '');
      chip.textContent = (lockedTagSet.has(tag) ? '🔒 ' : '') + tag;
      chip.dataset.tag = tag;
      chip.dataset.sortable = 'true';
      chip.onclick = () => {
        if (isTagSortMode) return;
        handleTagClick(tag);
      };
      wrap.appendChild(chip);
    });

    const toggle = document.createElement('div');
    toggle.className = 'tag-sort-toggle';
    toggle.innerHTML = isTagSortMode ? '✅ 完成' : '⚙️';
    toggle.title = isTagSortMode ? '完成排序' : '拖拽调整标签顺序';
    toggle.style.cssText =
      'padding:4px 10px;border-radius:6px;background:' +
      (isTagSortMode ? '#10b981' : '#e5e7eb') +
      ';color:' +
      (isTagSortMode ? '#fff' : '#4b5563') +
      ';font-size:13px;cursor:pointer;transition:all 0.2s;user-select:none;display:inline-flex;align-items:center;gap:4px;border:none;margin-left:auto;';
    if (document.body.classList.contains('dark')) {
      toggle.style.background = isTagSortMode ? '#10b981' : '#404258';
      toggle.style.color = isTagSortMode ? '#fff' : '#d1d5db';
    }
    toggle.onclick = () => toggleTagSortMode();
    wrap.appendChild(toggle);

    if (isTagSortMode) initTagSortable();
    wrap.classList.add('show');
  } finally {
    isRenderingTags = false;
  }
}
function toggleTagSortMode() {
  if (
    ((isTagSortMode = !isTagSortMode),
    tagSortableInstance && (tagSortableInstance.destroy(), (tagSortableInstance = null)),
    isTagSortMode)
  )
    showToast("进入排序模式，拖动标签调整顺序");
  else {
    const e = document.querySelectorAll(".tag-item:not(.all)");
    ((tagSortOrder = []),
      e.forEach((e) => {
        const t = e.dataset.tag;
        t && "all" !== t && tagSortOrder.push({ n: t, s: 10 * (tagSortOrder.length + 1) });
      }),
      saveTagSortOrder().then((e) => {
        showToast(e ? "排序已保存" : "排序保存失败");
      }));
  }
  (renderTagsFilter(), renderList());
}
function initTagSortable() {
  tagSortableInstance && (tagSortableInstance.destroy(), (tagSortableInstance = null));
  const e = document.getElementById("tagsList");
  e &&
    (tagSortableInstance = new Sortable(e, {
      animation: 150,
      ghostClass: "tag-sort-ghost",
      handle: ".tag-item:not(.all)",
      filter: ".all, .tag-sort-toggle",
      preventOnFilter: !1,
      onStart: () => {
        document.querySelectorAll(".tag-item").forEach((e) => {
          e.style.cursor = "grabbing";
        });
      },
      onEnd: () => {
        document.querySelectorAll(".tag-item").forEach((e) => {
          e.style.cursor = "";
        });
        const t = e.querySelectorAll(".tag-item:not(.all)");
        ((tagSortOrder = []),
          t.forEach((e) => {
            const t = e.dataset.tag;
            t && "all" !== t && tagSortOrder.push({ n: t, s: 10 * (tagSortOrder.length + 1) });
          }),
          saveTagSortOrder().then((e) => {
            showToast(e ? "标签顺序已更新" : "排序保存失败");
          }));
      },
    }));
}
// 私密链接已由服务端在 /api/links 响应里过滤，这里只做标签与关键词筛选
function getFilteredList() {
  if (!Array.isArray(siteList)) {
    console.error('siteList 不是数组，重新初始化');
    siteList = [];
    return [];
  }
  const searchEl = document.getElementById('searchInput');
  const keyword = searchEl ? searchEl.value.trim().toLowerCase() : '';
  let result = [...siteList];

  if (!keyword && activeTag !== 'all') {
    result = result.filter(site => Array.isArray(site.tags) && site.tags.includes(activeTag));
  }
  if (keyword) {
    result = result.filter(
      site =>
        (site.name || '').toLowerCase().includes(keyword) ||
        (site.url || '').toLowerCase().includes(keyword) ||
        (Array.isArray(site.tags) && site.tags.some(tag => (tag || '').toLowerCase().includes(keyword))),
    );
  }
  return result;
}
function buildIconSlot(site) {
  const iconEl = document.createElement('div');
  iconEl.className = 'site-icon';
  if (site.icon && site.icon.length <= 2 && !site.icon.startsWith('http')) {
    iconEl.style.background = '#00b866';
    iconEl.textContent = site.icon;
    return { node: iconEl, needsRemote: false };
  }
  const cached = localStorage.getItem('icon_' + site.id);
  if (cached) {
    iconEl.style.background = 'transparent';
    const img = document.createElement('img');
    img.loading = 'lazy';
    img.src = cached;
    img.alt = site.name || '链接';
    img.style.cssText = 'width:100%;height:100%;object-fit:cover;';
    iconEl.appendChild(img);
    return { node: iconEl, needsRemote: false };
  }
  iconEl.style.cssText =
    'background:#00b866;font-size:24px;font-weight:bold;color:#fff;display:flex;align-items:center;justify-content:center;';
  iconEl.textContent = (site.name || '链接').charAt(0).toUpperCase();
  return { node: iconEl, needsRemote: true };
}

function buildLatencyTag(site) {
  const el = document.createElement('div');
  const value = latencyCache[site.url || ''];
  if (value === undefined) {
    el.className = 'latency-tag';
    el.textContent = '未测速';
  } else if (value === '超时' || value === '失效') {
    el.className = 'latency-tag latency-timeout';
    el.textContent = value;
  } else if (typeof value === 'number' && value > 0) {
    el.className = 'latency-tag latency-success';
    el.textContent = value + ' ms';
  } else {
    el.className = 'latency-tag latency-timeout';
    el.textContent = String(value);
  }
  return el;
}

function renderCard(site) {
  const card = document.createElement('div');
  card.className = 'site-item ' + (isDragLocked ? 'locked' : '');
  if (isDragLocked) card.style.cursor = 'not-allowed';
  card.setAttribute('data-url', site.url || '');
  card.setAttribute('data-id', site.id || '');

  const icon = buildIconSlot(site);
  const info = document.createElement('div');
  info.className = 'site-info';

  const nameEl = document.createElement('div');
  nameEl.className = 'site-name';
  nameEl.textContent = site.name || '未命名';

  const urlEl = document.createElement('div');
  urlEl.className = 'site-url';
  urlEl.textContent = site.url || '';

  info.append(nameEl, urlEl);
  if (Array.isArray(site.tags) && site.tags.length) info.appendChild(buildSiteTags(site.tags));

  card.append(icon.node, buildLatencyTag(site), info);
  card.title = site.name || '未命名';
  card.style.cursor = 'pointer';
  return { card, needsRemoteIcon: icon.needsRemote };
}

function buildSiteTags(tags) {
  const wrap = document.createElement('div');
  wrap.className = 'site-tags';
  tags.slice(0, 3).forEach(tag => {
    const chip = document.createElement('span');
    chip.className = 'site-tag';
    chip.textContent = tag || '';
    wrap.appendChild(chip);
  });
  const extra = tags.length - 3;
  if (extra > 0) {
    const chip = document.createElement('span');
    chip.className = 'site-tag';
    chip.style.background = '#e5e7eb';
    chip.style.color = '#6b7280';
    chip.textContent = '+' + extra;
    wrap.appendChild(chip);
  }
  return wrap;
}

function attachCardInteractions(card, site) {
  card.addEventListener('mousedown', e => {
    if (e.button === 0) {
      card.style.transform = 'scale(0.95)';
      card.style.transition = 'transform 0.1s';
    }
  });
  card.addEventListener('mouseup', e => {
    if (e.button === 0) {
      card.style.transform = 'scale(1)';
      card.style.transition = 'transform 0.1s';
    }
  });
  card.addEventListener('mouseleave', () => {
    card.style.transform = 'scale(1)';
    card.style.transition = 'transform 0.1s';
  });
  card.addEventListener('contextmenu', e => {
    e.preventDefault();
    e.stopPropagation();
    showContextMenu(e.clientX, e.clientY, site.id, site.url);
  });
  card.addEventListener('mousedown', () => {
    if (!isMobileDevice()) longPressTimer = setTimeout(() => openEditModal(site.id), 800);
  });
  card.addEventListener('mousemove', () => {
    isMouseMoving = true;
    clearTimeout(longPressTimer);
  });
  card.addEventListener('mouseup', () => clearTimeout(longPressTimer));
  card.addEventListener('mouseleave', () => clearTimeout(longPressTimer));
  card.addEventListener('touchstart', () => {
    const wrap = document.getElementById('tagsFilterWrap');
    if (wrap && wrap.classList.contains('expanded')) wrap.classList.remove('expanded');
  });
}

const RENDER_FIRST_CHUNK = 120;
const RENDER_MORE_CHUNK = 240;
let renderLimit = RENDER_FIRST_CHUNK;
let renderViewKey = '';
let listSentinelObserver = null;

// 拖拽要能把卡片放到任意位置，所以解锁拖拽时渲染完整列表；日常浏览只渲染滚动到的部分
function currentRenderLimit() {
  return isDragLocked ? renderLimit : Infinity;
}

function growRenderWindow() {
  renderLimit += RENDER_MORE_CHUNK;
  renderList();
}

function attachListSentinel(wrap, remaining) {
  const stale = wrap.querySelector('.load-more-sentinel');
  if (stale) stale.remove();
  if (listSentinelObserver) {
    listSentinelObserver.disconnect();
    listSentinelObserver = null;
  }
  if (remaining <= 0) return;

  const sentinel = document.createElement('div');
  sentinel.className = 'load-more-sentinel';
  sentinel.style.cssText = 'grid-column:1/-1;text-align:center;padding:18px;color:#6b7280;font-size:13px;';
  sentinel.textContent = '向下滚动继续加载（还有 ' + remaining + ' 条）';
  wrap.appendChild(sentinel);

  listSentinelObserver = new IntersectionObserver(
    entries => {
      if (entries.some(entry => entry.isIntersecting)) growRenderWindow();
    },
    { rootMargin: '300px' }
  );
  listSentinelObserver.observe(sentinel);
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

  const filtered = getFilteredList();

  // 换了标签 / 搜索词 / 排序方式，回到首屏窗口
  const searchEl = document.getElementById('searchInput');
  const sortEl = document.getElementById('sortSelect');
  const viewKey = activeTag + '|' + (searchEl ? searchEl.value : '') + '|' + (sortEl ? sortEl.value : '');
  if (viewKey !== renderViewKey) {
    renderViewKey = viewKey;
    renderLimit = RENDER_FIRST_CHUNK;
  }

  if (!Array.isArray(filtered) || filtered.length === 0) {
    wrap.replaceChildren();
    const empty = document.createElement('div');
    empty.style.cssText = 'grid-column:1/-1;text-align:center;padding:40px;color:#6b7280;';
    empty.textContent = '暂无链接，点击「添加网址」开始收藏';
    wrap.appendChild(empty);
    attachListSentinel(wrap, 0);
    isRendering = false;
    return;
  }

  const limit = currentRenderLimit();
  const visible = filtered.length > limit ? filtered.slice(0, limit) : filtered;

  const existing = wrap.querySelectorAll('.site-item');
  if (existing.length === visible.length && existing.length > 0) {
    const sameOrder = Array.from(existing).every((node, i) => parseInt(node.dataset.id) === visible[i].id);
    if (sameOrder) {
      existing.forEach((node, i) => updateItemContent(node, visible[i]));
      attachListSentinel(wrap, filtered.length - visible.length);
      bindCardEvents(wrap);
      if (!isDragLocked) setTimeout(() => initSortableDrag(), 50);
      isRendering = false;
      return;
    }
  }

  const fragment = document.createDocumentFragment();
  const pendingIcons = [];
  visible.forEach(site => {
    const { card, needsRemoteIcon } = renderCard(site);
    attachCardInteractions(card, site);
    if (needsRemoteIcon) pendingIcons.push({ div: card, site });
    fragment.appendChild(card);
  });

  wrap.replaceChildren(fragment);
  attachListSentinel(wrap, filtered.length - visible.length);
  bindCardEvents(wrap);
  setTimeout(() => {
    if (!isDragLocked) initSortableDrag();
    isRendering = false;
    if (pendingIcons.length > 0) startLazyLoad(pendingIcons);
  }, 50);
}
let clickLock = !1,
  lastOpenTime = 0,
  lastOpenId = null,
  contextMenuBound = !1;
function bindCardEvents(e) {
  e &&
    (e._clickBound ||
      (e.addEventListener("click", function (e) {
        const t = e.target.closest(".site-item");
        if (!t) return;
        if (e.target.closest(".site-action") || e.target.closest(".edit-btn")) return;
        e.stopPropagation();
        const n = t.dataset.url,
          o = t.dataset.id;
        if (!n) return;
        const a = Date.now();
        (o === lastOpenId && a - lastOpenTime < 500) ||
          clickLock ||
          ((clickLock = !0),
          (lastOpenId = o),
          (lastOpenTime = a),
          setTimeout(() => {
            (window.open(n, "_blank", "noopener,noreferrer"),
              setTimeout(() => {
                clickLock = !1;
              }, 300));
          }, 50));
      }),
      (e._clickBound = !0),
      e._contextMenuBound ||
        (e.addEventListener("contextmenu", function (e) {
          const t = e.target.closest(".site-item");
          if (t) {
            (e.preventDefault(), e.stopPropagation());
            const n = parseInt(t.dataset.id),
              o = t.dataset.url;
            showContextMenu(e.clientX, e.clientY, n, o);
          }
        }),
        (e._contextMenuBound = !0))));
}
function updateItemContent(e, t) {
  const n = e.querySelector(".latency-tag");
  if (n) {
    const e = t.url || "",
      o = latencyCache[e];
    void 0 !== o
      ? "超时" === o || "失效" === o
        ? ((n.textContent = o), (n.className = "latency-tag latency-timeout"))
        : "number" == typeof o && o > 0
          ? ((n.textContent = o + " ms"), (n.className = "latency-tag latency-success"))
          : ((n.textContent = String(o)), (n.className = "latency-tag latency-timeout"))
      : ((n.textContent = "未测速"), (n.className = "latency-tag"));
  }
  const existingTags = e.querySelector('.site-tags');
  if (existingTags) existingTags.remove();
  if (t.tags && Array.isArray(t.tags) && t.tags.length) {
    e.querySelector('.site-info').appendChild(buildSiteTags(t.tags));
  }
  const a = e.querySelector(".site-name");
  a && (a.textContent = t.name || "未命名");
  const s = e.querySelector(".site-url");
  (s && (s.textContent = t.url || ""),
    (e.dataset.url = t.url || ""),
    (e.dataset.id = t.id || ""),
    (e.title = t.name || "未命名"));
}
function renderAll() {
  (renderTagsFilter(), renderList(), handleSearchUI());
}
let contextMenuEl = null;
function showContextMenu(e, t, n, o) {
  contextMenuEl && closeContextMenu();
  const a = document.createElement("div");
  ((a.className = "context-menu"),
    (a.style.cssText = `\n        position: fixed;\n        left: ${e}px;\n        top: ${t}px;\n        background: #fff;\n        border-radius: 12px;\n        box-shadow: 0 4px 20px rgba(0,0,0,0.15);\n        padding: 6px 0;\n        z-index: 99999;\n        min-width: 160px;\n        font-size: 14px;\n        color: #1f2937;\n        border: 1px solid #e8f8f0;\n        touch-action: manipulation;\n    `),
    document.body.classList.contains("dark") &&
      ((a.style.background = "#242535"), (a.style.borderColor = "#404258"), (a.style.color = "#e5e5e5")));
  const s = a.getBoundingClientRect();
  (e + s.width > window.innerWidth && (a.style.left = e - s.width + "px"),
    t + s.height > window.innerHeight && (a.style.top = t - s.height + "px"));
  ([
    { label: "✏️ 编辑", action: () => openEditModal(n) },
    {
      label: "📋 复制链接",
      action: () => {
        (navigator.clipboard.writeText(o || ""), showToast("链接已复制"));
      },
    },
    {
      label: "🗑️ 删除",
      action: () => {
        confirm("确定删除吗？") && deleteSiteById(n);
      },
      danger: !0,
    },
  ].forEach((e) => {
    const t = document.createElement("div");
    ((t.textContent = e.label),
      (t.style.cssText = `\n            padding: 8px 20px;\n            cursor: pointer;\n            transition: background 0.15s;\n            color: ${e.danger ? "#ef4444" : "inherit"};\n            touch-action: manipulation;\n            -webkit-touch-callout: none;\n            user-select: none;\n        `),
      document.body.classList.contains("dark") && e.danger && (t.style.color = "#f87171"),
      (t.onmouseover = () => {
        t.style.background = document.body.classList.contains("dark") ? "#404258" : "#f3f4f6";
      }),
      (t.onmouseout = () => {
        t.style.background = "transparent";
      }),
      (t.onclick = () => {
        (e.action(), closeContextMenu());
      }),
      (t.ontouchend = function (t) {
        (t.preventDefault(), e.action(), closeContextMenu());
      }),
      a.appendChild(t));
  }),
    document.body.appendChild(a),
    (contextMenuEl = a),
    (a._id = n));
  const r = function () {
      closeContextMenu();
    },
    i = function (e) {
      contextMenuEl && !contextMenuEl.contains(e.target) && closeContextMenu();
    },
    c = function (e) {
      contextMenuEl && !contextMenuEl.contains(e.target) && closeContextMenu();
    };
  ((a._scrollHandler = r),
    (a._clickHandler = i),
    (a._touchHandler = c),
    setTimeout(() => {
      (window.addEventListener("scroll", r, { passive: !0 }),
        setTimeout(() => {
          (document.addEventListener("click", i), document.addEventListener("touchstart", c, { passive: !0 }));
        }, 50));
    }, 10));
}
function closeContextMenu() {
  contextMenuEl &&
    (contextMenuEl._scrollHandler && window.removeEventListener("scroll", contextMenuEl._scrollHandler),
    contextMenuEl._clickHandler && document.removeEventListener("click", contextMenuEl._clickHandler),
    contextMenuEl._touchHandler && document.removeEventListener("touchstart", contextMenuEl._touchHandler),
    contextMenuEl.remove(),
    (contextMenuEl = null));
}
async function deleteSiteById(e) {
  if (e)
    try {
      (await API.deleteLink(e), showToast("删除成功"), await loadLinks());
    } catch (e) {
      showToast(e.message);
    }
}
function handleSearch() {
  (renderList(), handleSearchUI());
}
function handleSearchUI() {
  const e = document.getElementById("searchInput"),
    t = document.getElementById("clearSearchBtn");
  if (!e || !t) return;
  const n = e.value.trim();
  t.classList.toggle("hidden", !n);
}
function clearSearch() {
  const e = document.getElementById("searchInput"),
    t = document.getElementById("clearSearchBtn");
  (e && (e.value = ""), t && t.classList.add("hidden"), renderList());
}
function toggleDragLock() {
  isDragLocked = !isDragLocked;
  const btn = document.getElementById('dragLockBtn');
  if (btn) {
    btn.textContent = isDragLocked ? '🔒' : '🔓';
    btn.classList.toggle('locked', isDragLocked);
  }
  if (sortableInstance) {
    sortableInstance.destroy();
    sortableInstance = null;
  }
  // 解锁后需要完整列表才能把卡片拖到任意位置；重新锁定后收回首屏窗口
  if (isDragLocked) renderLimit = RENDER_FIRST_CHUNK;
  renderList();
  showToast(isDragLocked ? '拖拽已锁定' : '拖拽已解锁');
}
const SORT_STEP = 10;
const SORT_MIN_GAP = 1e-6;
const SORT_BATCH_CHUNK = 2000;

// 在相邻两项之间取中间值；没有缝隙时返回 null，交给调用方做整体重排
function pickSortBetween(prevSort, nextSort) {
  if (prevSort === null && nextSort === null) return null;
  if (prevSort === null) return nextSort - SORT_STEP;
  if (nextSort === null) return prevSort + SORT_STEP;
  if (nextSort - prevSort <= SORT_MIN_GAP) return null;
  const mid = (prevSort + nextSort) / 2;
  return mid > prevSort && mid < nextSort ? mid : null;
}

function currentViewOrder(wrap) {
  const byId = new Map(siteList.map(site => [site.id, site]));
  return Array.from(wrap.querySelectorAll('.site-item'))
    .map(node => byId.get(parseInt(node.dataset.id)))
    .filter(Boolean);
}

async function sendSortChunks(items) {
  for (let i = 0; i < items.length; i += SORT_BATCH_CHUNK) {
    await API.setSortBatch(items.slice(i, i + SORT_BATCH_CHUNK));
  }
}

// 把被移动的卡片插入到全局顺序中紧邻 prevId 的位置，其余相对顺序不变
function reorderGlobalList(movedId, prevId, nextId) {
  const global = [...siteList].sort((a, b) => a.sort - b.sort);
  const moved = global.find(site => site.id === movedId);
  if (!moved) return null;
  const rest = global.filter(site => site.id !== movedId);
  let at = 0;
  if (prevId !== null) at = rest.findIndex(site => site.id === prevId) + 1;
  else if (nextId !== null) at = rest.findIndex(site => site.id === nextId);
  if (at < 0) at = 0;
  rest.splice(at, 0, moved);
  const changed = [];
  rest.forEach((site, i) => {
    const value = SORT_STEP * (i + 1);
    if (site.sort !== value) {
      site.sort = value;
      changed.push({ id: site.id, sort_order: value });
    }
  });
  return changed;
}

// 排序值保持互不相同：只在筛选视图内部取中点或步进时，被筛掉的项可能占用同一个值
function sortValueTaken(target, excludeId) {
  return siteList.some(site => site.id !== excludeId && site.sort === target);
}

// 常规情况：只重算被拖动那一条的排序值 -> 1 个请求、1 行写入。
// 只有在"相邻两项之间已无空隙"或"新值与他人撞号"时，才做一次整体重排并走批量接口。
async function applyDragOrder(wrap, movedNode) {
  const view = currentViewOrder(wrap);
  const movedId = parseInt(movedNode.dataset.id);
  const moved = view.find(site => site.id === movedId);
  if (!moved) return;

  const index = view.findIndex(site => site.id === movedId);
  const prev = index > 0 ? view[index - 1] : null;
  const next = index < view.length - 1 ? view[index + 1] : null;

  const candidate = pickSortBetween(prev ? prev.sort : null, next ? next.sort : null);
  const usable = candidate !== null && !sortValueTaken(candidate, movedId);

  if (usable) {
    moved.sort = candidate;
    await API.updateSort(moved.id, candidate);
  } else {
    const changed = reorderGlobalList(movedId, prev ? prev.id : null, next ? next.id : null);
    if (changed === null || changed.length === 0) return;
    await sendSortChunks(changed);
  }

  siteList.sort((a, b) => a.sort - b.sort);
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
    onEnd: async evt => {
      isDragging = false;
      isMouseMoving = false;
      try {
        await applyDragOrder(wrap, evt.item);
        showToast('排序已保存');
      } catch (e) {
        showToast('排序保存失败，重新加载数据');
        await loadLinks(...currentSort());
      }
    },
  });
}
function openEditModal(e = null) {
  editingId = e;
  const t = document.getElementById("addModal");
  if (!t) return;
  tagExpandState[t.id || "default"] = !1;
  const n = document.getElementById("modalTitle"),
    o = document.getElementById("modalDeleteBtn");
  (n && (n.textContent = e ? "编辑网址" : "添加新网址"), o && (o.style.display = e ? "block" : "none"));
  const a = document.getElementById("modalSiteName"),
    s = document.getElementById("modalSiteUrl"),
    r = document.getElementById("modalSiteIcon"),
    i = document.getElementById("modalSiteTags"),
    c = document.getElementById("modalSiteSort");
  if (
    (a && (a.value = ""),
    s && (s.value = ""),
    r && (r.value = ""),
    i && (i.value = ""),
    (selectedTags = []),
    renderSelectedTags(),
    renderExistingTags(""),
    e)
  ) {
    const t = siteList.find((t) => t.id === e);
    t &&
      (a && (a.value = t.name || ""),
      s && (s.value = t.url || ""),
      r && (r.value = t.icon || ""),
      i && (i.value = (t.tags || []).join(",")),
      c && (c.value = t.sort || 0),
      (selectedTags = t.tags || []),
      renderSelectedTags(),
      renderExistingTags(""));
  } else {
    const e = siteList.length ? Math.max(...siteList.map((e) => e.sort || 0)) : 0;
    (c && (c.value = e + 10), renderExistingTags(""));
  }
  (t.classList.add("show"),
    a && a.focus(),
    isMobileDevice() &&
      setTimeout(() => {
        const e = document.activeElement;
        e && "INPUT" === e.tagName && e.scrollIntoView({ block: "center", behavior: "smooth" });
      }, 300));
}
function closeModal() {
  const e = document.getElementById("addModal");
  (e && e.classList.remove("show"), (editingId = null));
}
function renderExistingTags(e = "") {
  const t = document.getElementById("existingTagsList");
  if (!t) return;
  const n = getAllTags();
  let o = e ? n.filter((t) => t.toLowerCase().includes(e.toLowerCase())) : n;
  const a = e.length > 0,
    s = tagExpandState.default || !1;
  let r = o,
    i = !1;
  if ((!a && o.length > 14 && ((i = !0), s || (r = o.slice(0, 14))), (t.innerHTML = ""), !r.length))
    return void (t.innerHTML = '<div style="font-size:12px;color:#6b7280;">💡 没有匹配的标签</div>');
  const c = document.createElement("div");
  if (
    ((c.style.cssText =
      "\n        display: flex;\n        flex-wrap: wrap;\n        gap: 6px;\n        width: 100%;\n        align-items: center;\n    "),
    r.forEach((e) => {
      const t = document.createElement("div");
      ((t.className = "existing-tag-item"),
        (t.textContent = e),
        (t.style.cssText =
          "\n            padding: 4px 10px;\n            border-radius: 6px;\n            background: #f0f3f9;\n            color: #4b5563;\n            font-size: 13px;\n            cursor: pointer;\n            transition: all 0.2s;\n            white-space: nowrap;\n            flex-shrink: 0;\n        "),
        document.body.classList.contains("dark") && ((t.style.background = "#404258"), (t.style.color = "#d1d5db")),
        (t.onmouseover = () => {
          document.body.classList.contains("dark")
            ? ((t.style.background = "#475569"), (t.style.color = "#10b981"))
            : ((t.style.background = "#e8f8f0"), (t.style.color = "#00b866"));
        }),
        (t.onmouseout = () => {
          document.body.classList.contains("dark")
            ? ((t.style.background = "#404258"), (t.style.color = "#d1d5db"))
            : ((t.style.background = "#f0f3f9"), (t.style.color = "#4b5563"));
        }),
        (t.onclick = () => {
          if (!selectedTags.includes(e)) {
            (selectedTags.push(e), renderSelectedTags(), syncSelectedTags());
            const t = document.getElementById("modalSiteTags");
            t && ((t.value = selectedTags.join(",") + ","), t.dispatchEvent(new Event("input")));
          }
        }),
        c.appendChild(t));
    }),
    t.appendChild(c),
    i)
  ) {
    const e = document.createElement("div");
    e.style.cssText = "width:100%;text-align:center;margin-top:8px;";
    const n = document.createElement("button");
    ((n.textContent = s ? "收起 ▲" : `展开更多 (${o.length - 14}个) ▼`),
      (n.style.cssText =
        "\n            padding: 4px 14px;\n            border: 1px solid #e8f8f0;\n            border-radius: 6px;\n            background: #f9fbfc;\n            color: #00b866;\n            cursor: pointer;\n            font-size: 12px;\n            transition: all 0.2s;\n        "),
      document.body.classList.contains("dark") &&
        (n.style.cssText +=
          "\n                background: #343541;\n                border-color: #404258;\n                color: #10b981;\n            "),
      (n.onmouseover = () => {
        document.body.classList.contains("dark") ? (n.style.background = "#404258") : (n.style.background = "#e8f8f0");
      }),
      (n.onmouseout = () => {
        document.body.classList.contains("dark") ? (n.style.background = "#343541") : (n.style.background = "#f9fbfc");
      }),
      (n.onclick = () => {
        tagExpandState.default = !tagExpandState.default;
        const e = document.getElementById("modalSiteTags")?.value || "",
          t = e.lastIndexOf(",");
        renderExistingTags(-1 === t ? e.trim() : e.substring(t + 1).trim());
      }),
      e.appendChild(n),
      t.appendChild(e));
  }
}
function renderSelectedTags() {
  const wrap = document.getElementById('selectedTagsList');
  if (!wrap) return;
  wrap.replaceChildren();
  if (selectedTags.length === 0) {
    const empty = document.createElement('div');
    empty.style.cssText = 'font-size:12px;color:#6b7280;';
    empty.textContent = '还未选择任何标签';
    wrap.appendChild(empty);
    return;
  }
  selectedTags.forEach(tag => {
    const chip = document.createElement('div');
    chip.className = 'selected-tag-item';
    chip.textContent = tag;
    const close = document.createElement('span');
    close.className = 'selected-tag-close';
    close.textContent = '×';
    close.addEventListener('click', () => {
      selectedTags = selectedTags.filter(t => t !== tag);
      renderSelectedTags();
      syncSelectedTags();
      renderExistingTags('');
    });
    chip.appendChild(close);
    wrap.appendChild(chip);
  });
}
function syncSelectedTags() {
  const e = document.getElementById("modalSiteTags");
  e && ((e.value = selectedTags.join(",")), selectedTags.length > 0 && (e.value = selectedTags.join(",") + ","));
}
function syncInputToSelectedTags() {
  const e = document.getElementById("modalSiteTags");
  if (!e) return;
  const t = e.value,
    n = t.lastIndexOf(",");
  renderExistingTags(-1 === n ? t.trim() : t.substring(n + 1).trim());
}
async function saveSite() {
  const e = document.getElementById("modalSiteName"),
    t = document.getElementById("modalSiteUrl"),
    n = document.getElementById("modalSiteIcon"),
    o = document.getElementById("modalSiteSort");
  if (!e || !t) return;
  const a = e.value.trim(),
    s = t.value.trim(),
    r = n ? n.value.trim() : "",
    i = (o && parseInt(o.value.trim())) || 0;
  if (!a) return void showToast("请输入网站名称");
  if (!isValidUrl(s)) return void showToast("请输入有效的网址");
  if (!editingId) {
    if (siteList.find((e) => e.url === s)) return void showToast("您已有该收藏，无须重复收藏！");
  }
  const c = document.getElementById("modalSiteTags");
  if (c) {
    const e = c.value
      .split(",")
      .map((e) => e.trim())
      .filter((e) => e);
    selectedTags = e.filter((e, t, n) => e && n.indexOf(e) === t);
  }
  let l = "";
  try {
    let e = new URL(s).hostname.replace(/^www\./, "");
    ((e = e.replace(/:\d+$/, "")),
      !e ||
        e.startsWith("192.168.") ||
        e.startsWith("10.") ||
        e.startsWith("127.0.0.") ||
        e.startsWith("localhost") ||
        (l = `/api/favicon?domain=${encodeURIComponent(e)}`));
  } catch {}
  const d = { title: a, url: s, icon: r, icon_url: l, tags: selectedTags, sort_order: i };
  try {
    (editingId
      ? (await API.updateLink(editingId, d), showToast("修改成功"))
      : (await API.addLink(d), showToast("添加成功")),
      closeModal(),
      await loadLinks());
  } catch (e) {
    showToast(e.message);
  }
}
async function extractFromClipboard() {
  try {
    const e = await navigator.clipboard.readText();
    if (!e) return void showToast("剪贴板为空");
    const t = (e.match(/https?:\/\/[^\s]+/gi) || []).find((e) => e.startsWith("http://") || e.startsWith("https://"));
    if (!t) return void showToast("未找到有效网址");
    let n = e
      .replace(/https?:\/\/[^\s]+/gi, "")
      .trim()
      .replace(/[\n\r]/g, " ")
      .trim();
    if (!n)
      try {
        n = new URL(t).hostname.split(".")[0];
      } catch {
        n = "未知网站";
      }
    const o = document.getElementById("modalSiteName"),
      a = document.getElementById("modalSiteUrl");
    (o && (o.value = n), a && (a.value = t), showToast("已识别并填充"));
  } catch {
    showToast("读取剪贴板失败");
  }
}
async function testLatency(e) {
  const t = performance.now();
  if (!e || !e.startsWith("http")) return ((latencyCache[e] = "失效"), saveLatencyCache(), "失效");
  try {
    const n = new AbortController(),
      o = setTimeout(() => n.abort(), 3e3);
    (await fetch(e, { method: "HEAD", mode: "no-cors", cache: "no-cache", signal: n.signal }), clearTimeout(o));
    const a = Math.round(performance.now() - t);
    return ((latencyCache[e] = a), saveLatencyCache(), a);
  } catch (t) {
    return ((latencyCache[e] = "超时"), saveLatencyCache(), "超时");
  }
}
async function batchTestLatency() {
  const e = getFilteredList();
  if (!e.length) return void showToast("暂无链接");
  const t = document.getElementById("refreshBtn");
  t && (t.disabled = !0);
  const n = document.querySelectorAll(".site-item");
  (n.forEach((e) => {
    const t = e.querySelector(".latency-tag");
    t && ((t.textContent = "测速中"), (t.className = "latency-tag latency-loading"));
  }),
    showToast("测速中..."));
  try {
    const t = await fetch("/api/speedtest", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + localStorage.getItem("token") },
      body: JSON.stringify({ urls: e.map((e) => e.url) }),
    });
    (((await t.json()).results || []).forEach((e) => {
      e.ok
        ? (latencyCache[e.url] = e.ms)
        : 0 === e.status
          ? (latencyCache[e.url] = "超时")
          : (latencyCache[e.url] = "失效");
    }),
      saveLatencyCache());
  } catch (e) {
    showToast("测速失败，请重试");
  }
  (n.forEach((e) => {
    const t = e.querySelector(".latency-tag"),
      n = e.dataset.url;
    if (!t || !n) return;
    const o = latencyCache[n];
    "超时" === o || "失效" === o
      ? ((t.textContent = o), (t.className = "latency-tag latency-timeout"))
      : "number" == typeof o && o > 0 && ((t.textContent = o + " ms"), (t.className = "latency-tag latency-success"));
  }),
    t && (t.disabled = !1),
    showToast("测速完成"));
}
function importJson() {
  const e = document.getElementById("fileInput");
  e && e.click();
}
async function handleFileImport(e) {
  const t = e.target.files[0];
  if (!t) return;
  const n = new FileReader();
  ((n.onload = async function (e) {
    try {
      const t = JSON.parse(e.target.result);
      if (!Array.isArray(t)) return void showToast("格式错误：需要数组");
      const n = new Set(siteList.map((e) => e.url)),
        o = t
          .filter((e) => (e.name || e.title) && e.url && isValidUrl(e.url))
          .map((e) => ({
            title: e.name || e.title,
            url: e.url,
            icon: e.icon || "",
            icon_url: e.icon_url || "",
            tags: e.tags || [],
            sort: e.sort_order || e.sort || 0,
          })),
        a = o.filter((e) => !n.has(e.url)),
        s = o.length - a.length;
      if (0 === a.length)
        return (
          showToast(s > 0 ? `所有 ${s} 条数据都已存在，无需导入` : "没有有效数据可导入"),
          void (await loadLinks())
        );
      showToast(`共 ${o.length} 条，其中 ${s} 条已存在，将导入 ${a.length} 条新数据`);
      const r = 20;
      let i = 0,
        c = 0,
        l = 0;
      for (let e = 0; e < a.length; e += r) {
        const t = a.slice(e, e + r);
        showToast(`正在导入 ${Math.min(e + r, a.length)}/${a.length} 条...`);
        try {
          const e = await API.importLinks(t);
          ((i += e.successCount || 0),
            (c += e.skipCount || 0),
            (l += e.errorCount || 0),
            e.items &&
              e.items.forEach((e) => {
                e.icon_url && localStorage.setItem("icon_" + e.id, e.icon_url);
              }));
        } catch (e) {
          ((l += t.length), console.error("批次导入失败:", e));
        }
      }
      let d = `✅ 导入完成：成功 ${i} 条`;
      (c > 0 && (d += `，⏭️ 跳过 ${c} 条（后端去重）`),
        l > 0 && (d += `，❌ 失败 ${l} 条`),
        (d += `（本次实际新增 ${a.length} 条）`),
        showToast(d),
        await loadLinks());
    } catch (e) {
      showToast("❌ 导入失败：" + e.message);
    }
  }),
    n.readAsText(t),
    (e.target.value = ""));
}
async function exportJson() {
  try {
    const e = (await API.exportLinks()).map((e) => {
        const t = localStorage.getItem("icon_" + e.id) || "";
        return { ...e, icon_url: t };
      }),
      t = new Blob([JSON.stringify(e, null, 2)], { type: "application/json" }),
      n = URL.createObjectURL(t),
      o = document.createElement("a");
    ((o.href = n), (o.download = getFileName()), o.click(), URL.revokeObjectURL(n), showToast("导出成功"));
  } catch (e) {
    showToast("导出失败");
  }
}
function initTagsFilter() {
  const e = document.getElementById("tagsFilterWrap");
  if (!e) return;
  const t = e.querySelector(".tags-filter-title");
  (isMobileDevice() ? e.classList.remove("expanded") : e.classList.add("expanded"),
    t && (t.onclick = () => e.classList.toggle("expanded")));
}
function handleScroll() {
  const e = document.getElementById("backToTopBtn");
  (e && e.classList.toggle("show", window.scrollY > 300),
    document.getElementById("mainPage") &&
      "none" !== document.getElementById("mainPage").style.display &&
      (clearTimeout(window._scrollSaveTimer), (window._scrollSaveTimer = setTimeout(saveScrollPosition, 500))));
}
function backToTop() {
  const t = document.scrollingElement || document.documentElement;
  try {
    (window.scrollTo({ top: 0, behavior: "smooth" }),
      setTimeout(() => {
        if ((t.scrollTop || window.scrollY || 0) > 0) t.scrollTop = 0;
      }, 400));
  } catch (e) {
    t.scrollTop = 0;
  }
}
function initKeyboardShortcuts() {
  document.addEventListener("keydown", function (e) {
    if ((e.ctrlKey || e.metaKey) && "k" === e.key) {
      e.preventDefault();
      const t = document.getElementById("searchInput");
      t && (t.focus(), t.select());
    }
    if ("Escape" === e.key) {
      const e = document.getElementById("addModal");
      e && e.classList.contains("show") && closeModal();
      const t = document.getElementById("adminModal");
      t && t.classList.contains("show") && closeAdminPanel();
      const n = document.getElementById("searchInput");
      n && document.activeElement === n && n.blur();
    }
  });
}
function initSortSelector() {
  const e = document.getElementById("sortSelect");
  if (!e) return;
  const t = localStorage.getItem("sortPreference");
  (t && (e.value = t),
    e.addEventListener("change", function () {
      const [e, t] = this.value.split(":");
      (localStorage.setItem("sortPreference", this.value), loadLinks(e, t));
    }));
}
// 用户名一律走 textContent，不进入 HTML 字符串上下文
function refreshUserMenu() {
  const user = getAuthUser();
  const isAdmin = user.role === 'admin';
  const display = document.getElementById('displayUsername');
  const dropdownName = document.getElementById('dropdownUsername');
  const dropdownRole = document.getElementById('dropdownRole');
  const adminItem = document.getElementById('adminMenuItem');
  if (display) display.textContent = user.username || '用户';
  if (dropdownName) dropdownName.textContent = user.username || '用户';
  if (dropdownRole) dropdownRole.textContent = isAdmin ? '管理员' : '普通';
  if (adminItem) adminItem.style.display = isAdmin ? 'flex' : 'none';
}

async function initApp() {
  await loadTagSortOrder();
  loadActiveTag();
  initTheme();
  initTagsFilter();
  loadLatencyCache();
  initSortSelector();
  const [sort, order] = currentSort();
  await loadLinks(sort, order);
  window.addEventListener('scroll', handleScroll);
  handleScroll();
  const lockBtn = document.getElementById('dragLockBtn');
  if (lockBtn) {
    lockBtn.textContent = '🔒';
    lockBtn.classList.add('locked');
  }
  initKeyboardShortcuts();
}
((window.initApp = initApp),
  document.addEventListener("DOMContentLoaded", function () {
    const e = document.getElementById("loginBtn");
    if (!e) return void console.error("DOM 元素未就绪，稍后重试");
    e.addEventListener("click", doLogin);
    const t = document.getElementById("loginPassword"),
      n = document.getElementById("loginUsername");
    (t &&
      t.addEventListener("keydown", (e) => {
        "Enter" === e.key && doLogin();
      }),
      n &&
        n.addEventListener("keydown", (e) => {
          "Enter" === e.key && doLogin();
        }));
    const o = document.getElementById("logoutBtn");
    o && o.addEventListener("click", doLogout);
    const a = document.getElementById("addBtn");
    a && a.addEventListener("click", () => openEditModal());
    const s = document.getElementById("addQuickBtn");
    s && s.addEventListener("click", () => openEditModal());
    const r = document.getElementById("refreshBtn");
    r && r.addEventListener("click", batchTestLatency);
    const i = document.getElementById("importBtn"),
      c = document.getElementById("exportBtn"),
      l = document.getElementById("fileInput");
    (i && i.addEventListener("click", importJson),
      c && c.addEventListener("click", exportJson),
      l && l.addEventListener("change", handleFileImport));
    const d = document.getElementById("dragLockBtn");
    d && d.addEventListener("click", toggleDragLock);
    const g = document.getElementById("themeToggleBtn");
    g && g.addEventListener("click", toggleTheme);
    const u = document.getElementById("searchInput"),
      m = document.getElementById("clearSearchBtn");
    (u && u.addEventListener("input", handleSearch), m && m.addEventListener("click", clearSearch));
    const y = document.getElementById("modalCloseBtn"),
      f = document.getElementById("modalCancelBtn"),
      p = document.getElementById("modalConfirmBtn"),
      h = document.getElementById("modalDeleteBtn");
    (y && y.addEventListener("click", closeModal),
      f && f.addEventListener("click", closeModal),
      p && p.addEventListener("click", saveSite),
      h && h.addEventListener("click", deleteSite));
    const T = document.getElementById("pasteBtn");
    T && (T.onclick = extractFromClipboard);
    const E = document.getElementById("modalSiteTags");
    E && E.addEventListener("input", syncInputToSelectedTags);
    const v = document.getElementById("adminBtn"),
      w = document.getElementById("adminModalCloseBtn"),
      L = document.getElementById("adminModalCloseBtn2"),
      I = document.getElementById("adminCreateBtn");
    (v && v.addEventListener("click", openAdminPanel),
      w && w.addEventListener("click", closeAdminPanel),
      L && L.addEventListener("click", closeAdminPanel),
      I && I.addEventListener("click", adminCreateUser));
    const S = document.getElementById("backToTopBtn");
    S && S.addEventListener("click", backToTop);
    const k = document.getElementById("addModal"),
      b = document.getElementById("adminModal");
    k &&
      (k.addEventListener('click', e => {
        if (e.target === k) closeModal();
      }),
      k.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && k.classList.contains('show')) {
          const confirmBtn = document.getElementById('modalConfirmBtn');
          if (confirmBtn) {
            e.preventDefault();
            confirmBtn.click();
          }
        }
      }));
    b &&
      b.addEventListener('click', e => {
        if (e.target === b) closeAdminPanel();
      });
  }),
  (function () {
    var e = document.getElementById("userMenuBtn"),
      t = document.getElementById("userDropdown");
    e &&
      (e.addEventListener("click", function (e) {
        (e.stopPropagation(), t.classList.toggle("open"));
      }),
      document.addEventListener("click", function () {
        t.classList.remove("open");
      }));
    var n = document.getElementById("menuAdd"),
      o = document.getElementById("menuSpeed"),
      a = document.getElementById("menuImport"),
      s = document.getElementById("menuExport"),
      r = document.getElementById("menuLock"),
      i = document.getElementById("menuTheme"),
      c = document.getElementById("adminMenuItem"),
      l = document.getElementById("logoutMenuItem"),
      d = document.getElementById("tagPasswordMenuItem");
    (n &&
      n.addEventListener("click", function () {
        ("function" == typeof openEditModal && openEditModal(), t.classList.remove("open"));
      }),
      o &&
        o.addEventListener("click", function () {
          ("function" == typeof batchTestLatency && batchTestLatency(), t.classList.remove("open"));
        }),
      a &&
        a.addEventListener("click", function () {
          ("function" == typeof importJson && importJson(), t.classList.remove("open"));
        }),
      s &&
        s.addEventListener("click", function () {
          ("function" == typeof exportJson && exportJson(), t.classList.remove("open"));
        }),
      r &&
        r.addEventListener("click", function () {
          ("function" == typeof toggleDragLock && toggleDragLock(), t.classList.remove("open"));
        }),
      i &&
        i.addEventListener("click", function () {
          ("function" == typeof toggleTheme && toggleTheme(), t.classList.remove("open"));
        }),
      c &&
        c.addEventListener("click", function () {
          ("function" == typeof openAdminPanel && openAdminPanel(), t.classList.remove("open"));
        }),
      d &&
        d.addEventListener("click", function () {
          ("function" == typeof openTagPasswordManager && openTagPasswordManager(), t.classList.remove("open"));
        }),
      l &&
        l.addEventListener("click", function () {
          ("function" == typeof doLogout && doLogout(), t.classList.remove("open"));
        }),
      refreshUserMenu());
  })(),
  document.addEventListener('DOMContentLoaded', function () {
    // 单一入口：已登录走 enterMainPage()，否则停在登录页，避免两处各自 initApp 一次
    if (isLoggedIn() && getAuthUser().username) enterMainPage();
    else showLoginPage();
  }));
let lazyObserver = null,
  iconLoadQueue = [],
  isLoadingIcons = !1;
const BATCH_SIZE = 5;
let iconTaskQueue = [],
  isProcessingQueue = !1;
const CONCURRENT_LIMIT = 4,
  QUEUE_INTERVAL = 150;
function startLazyLoad(e) {
  ((iconLoadQueue = e.filter(({ site: e }) => {
    const t = "icon_" + e.id;
    return !localStorage.getItem(t);
  })),
    0 !== iconLoadQueue.length &&
      (setTimeout(() => {
        loadVisibleIcons();
      }, 100),
      lazyObserver && lazyObserver.disconnect(),
      (lazyObserver = new IntersectionObserver(
        (e) => {
          const t = [];
          if (
            (e.forEach((e) => {
              if (e.isIntersecting) {
                const n = e.target,
                  o = iconLoadQueue.find((e) => e.div === n);
                o && !n._iconLoaded && t.push(o);
              }
            }),
            t.length > 0)
          ) {
            t.slice(0, BATCH_SIZE).forEach(({ div: e, site: t }) => {
              loadSingleIcon(e, t);
            });
          }
        },
        { rootMargin: "100px", threshold: 0.01 },
      )),
      iconLoadQueue.forEach(({ div: e }) => {
        lazyObserver.observe(e);
      })));
}
function loadVisibleIcons() {
  let e = 0;
  for (let t = 0; t < iconLoadQueue.length && e < BATCH_SIZE; t++) {
    const { div: n, site: o } = iconLoadQueue[t];
    if (n._iconLoaded) continue;
    const a = n.getBoundingClientRect();
    a.top < window.innerHeight + 100 && a.bottom > -100 && (loadSingleIcon(n, o), e++);
  }
}
function loadSingleIcon(card, site) {
  if (card._iconLoaded) return;
  card._iconLoaded = true;
  const iconEl = card.querySelector('.site-icon');
  if (!iconEl) return;
  if (iconEl.querySelector('img')) return;

  const cached = localStorage.getItem('icon_' + site.id);
  if (cached) {
    iconEl.replaceChildren();
    iconEl.style.cssText = 'background:transparent;border-radius:8px;';
    const img = document.createElement('img');
    img.loading = 'lazy';
    img.src = cached;
    img.alt = site.name || '图标';
    img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:8px;';
    iconEl.appendChild(img);
    return;
  }

  iconEl.textContent = (site.name || '链接').charAt(0).toUpperCase();
  iconEl.style.cssText =
    'background:#00b866;color:#fff;font-size:24px;font-weight:bold;display:flex;align-items:center;justify-content:center;border-radius:8px;';
  iconTaskQueue.push({ div: card, site, iconEl });
  processQueue();
}
const ICON_CONCURRENCY = 4;
const ICON_TIMEOUT_MS = 6000;

function processQueue() {
  if (isProcessingQueue) return;
  if (iconTaskQueue.length === 0) return;
  isProcessingQueue = true;

  const batch = iconTaskQueue.splice(0, ICON_CONCURRENCY);
  let settled = 0;
  const finish = () => {
    settled++;
    if (settled === batch.length) {
      isProcessingQueue = false;
      if (iconTaskQueue.length > 0) setTimeout(processQueue, 150);
    }
  };

  batch.forEach(({ site, iconEl }) => {
    let host;
    try {
      host = new URL(site.url || '')
        .hostname.replace(/^www\./, '')
        .replace(/:\d+$/, '');
    } catch {
      return finish();
    }
    if (!host || isInternalHost(host) || localStorage.getItem('iconFail_' + host)) return finish();

    const src = `/api/favicon?domain=${encodeURIComponent(host)}`;
    const probe = new Image();
    let done = false;
    // Image 没有 timeout 语义，请求挂起时必须自己释放队列槽位，否则后续图标永远不再加载
    const timer = setTimeout(settle, ICON_TIMEOUT_MS);
    function settle() {
      if (done) return;
      done = true;
      clearTimeout(timer);
      finish();
    }

    probe.onload = () => {
      if (probe.width > 16 && probe.height > 16) {
        iconEl.replaceChildren();
        iconEl.style.cssText = 'background:transparent;border-radius:8px;';
        const shown = document.createElement('img');
        shown.loading = 'lazy';
        shown.src = src;
        shown.alt = site.name || '图标';
        shown.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:8px;';
        iconEl.appendChild(shown);
        try {
          localStorage.setItem('icon_' + site.id, src);
        } catch {}
      }
      settle();
    };
    probe.onerror = () => {
      try {
        localStorage.setItem('iconFail_' + host, String(Date.now() + 86400000));
      } catch {}
      settle();
    };
    probe.src = src;
  });
}
function cleanupLazyLoad() {
  (lazyObserver && (lazyObserver.disconnect(), (lazyObserver = null)),
    (iconLoadQueue = []),
    (iconTaskQueue = []),
    (isProcessingQueue = !1),
    (isLoadingIcons = !1));
}
// ============================================================
//  标签密码（服务端权威）
//  浏览器只知道"哪些标签被锁"，既拿不到哈希也不需要持有明文
// ============================================================
let lockedTagSet = new Set();

async function loadLockedTags() {
  try {
    const list = await API.getTagPasswords();
    return new Set(Array.isArray(list) ? list.map(item => item.tag_name).filter(Boolean) : []);
  } catch (e) {
    console.error('加载标签锁状态失败:', e);
    return new Set();
  }
}

// 已解锁列表只驱动界面显示，链接可见性由服务端签发的 grant 决定
function getUnlockedTags() {
  try {
    const list = JSON.parse(sessionStorage.getItem('unlockedTags') || '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function setUnlockedTags(tags) {
  sessionStorage.setItem('unlockedTags', JSON.stringify(Array.from(tags || [])));
}

function isTagUnlocked(tag) {
  return getUnlockedTags().includes(tag);
}

// 可见集合发生变化时，作废本地指纹与快照，强制下一次拉取拿完整新内容
function invalidateListCache() {
  linksEtag = null;
  snapshotEtag = null;
  try { localStorage.removeItem(SNAPSHOT_KEY); } catch {}
}

function clearTagUnlocks() {
  sessionStorage.removeItem('unlockedTags');
  API.setTagGrant('');
  invalidateListCache();
}

async function setTagPassword(tagName, password) {
  await API.setTagPassword(tagName, password || '');
  clearTagUnlocks();
}

async function deleteTagPassword(tagName) {
  await API.deleteTagPassword(tagName);
  clearTagUnlocks();
}

function clearUnlockedTags() {
  clearTagUnlocks();
}

function currentSort() {
  const el = document.getElementById('sortSelect');
  if (!el) return ['sort_order', 'ASC'];
  const parts = el.value.split(':');
  return [parts[0] || 'sort_order', parts[1] || 'ASC'];
}

function selectTag(tag) {
  document.querySelectorAll('.tag-item').forEach(el => {
    el.classList.remove('active');
    if (el.dataset.tag === tag) el.classList.add('active');
  });
  activeTag = tag;
  saveActiveTag(tag);
  if (isMobileDevice()) {
    const wrap = document.getElementById('tagsFilterWrap');
    if (wrap) wrap.classList.remove('expanded');
  }
  renderList();
}

// 点击标签：未加密或已解锁则直接筛选，否则要求输入密码
function handleTagClick(tag) {
  if (!lockedTagSet.has(tag) || isTagUnlocked(tag)) selectTag(tag);
  else showTagPasswordModal(tag);
}

let pendingTagName = null;

function showTagPasswordModal(tagName) {
  pendingTagName = tagName;
  document.getElementById('tagPasswordTitle').textContent = '🔒 请输入标签密码';
  document.getElementById('tagPasswordLabel').textContent = `标签「${tagName}」需要密码才能访问`;
  document.getElementById('tagPasswordInput').value = '';
  document.getElementById('tagPasswordError').style.display = 'none';
  document.getElementById('tagPasswordModal').classList.add('show');
  setTimeout(() => document.getElementById('tagPasswordInput').focus(), 100);
}

function closeTagPasswordModal() {
  document.getElementById('tagPasswordModal').classList.remove('show');
  pendingTagName = null;
}

function showTagPasswordError(message) {
  const error = document.getElementById('tagPasswordError');
  error.textContent = message;
  error.style.display = 'block';
  const input = document.getElementById('tagPasswordInput');
  input.value = '';
  input.focus();
}

async function confirmTagPassword() {
  const password = document.getElementById('tagPasswordInput').value.trim();
  if (!password) return showTagPasswordError('请输入密码');
  const tag = pendingTagName;
  try {
    const result = await API.unlockTag(tag, password);
    // 先落 grant 再拉数据，否则服务端仍会过滤掉该标签下的链接
    API.setTagGrant(result.grant);
    setUnlockedTags(result.tags);
    invalidateListCache();
    closeTagPasswordModal();
    showToast(`✅ 标签「${tag}」已解锁`);
    activeTag = tag;
    saveActiveTag(tag);
    const [sort, order] = currentSort();
    await loadLinks(sort, order);
  } catch (e) {
    showTagPasswordError(e.message || '密码错误，请重试');
  }
}
document.addEventListener("DOMContentLoaded", function () {
  const e = document.getElementById("tagPasswordModal");
  e &&
    (document.getElementById("tagPasswordCloseBtn").addEventListener("click", closeTagPasswordModal),
    document.getElementById("tagPasswordCancelBtn").addEventListener("click", closeTagPasswordModal),
    document.getElementById("tagPasswordConfirmBtn").addEventListener("click", confirmTagPassword),
    document.getElementById("tagPasswordInput").addEventListener("keydown", function (e) {
      "Enter" === e.key && confirmTagPassword();
    }),
    e.addEventListener("click", function (t) {
      t.target === e && closeTagPasswordModal();
    }));
});
let tagManagerSortableInstance = null;
function openTagPasswordManager() {
  const e = document.getElementById("tagPasswordManagerModal");
  e && (e.classList.add("show"), renderTagManagerList());
}
function closeTagPasswordManager() {
  (document.getElementById("tagPasswordManagerModal").classList.remove("show"),
    tagManagerSortableInstance && (tagManagerSortableInstance.destroy(), (tagManagerSortableInstance = null)));
}
function buildTagManagerRow(tag, isLocked, orderValue) {
  const isAll = tag === '全部';
  const row = document.createElement('div');
  row.className = 'tag-manager-item';
  row.dataset.tag = tag;
  row.style.cssText =
    'display:flex;align-items:center;justify-content:space-between;padding:8px 12px;border-bottom:1px solid #f0f0f0;gap:10px;' +
    (isAll ? 'opacity:0.6;' : '');

  const left = document.createElement('div');
  left.style.cssText = 'display:flex;align-items:center;gap:8px;flex:1;min-width:0;';

  const handle = document.createElement('span');
  handle.textContent = '☰';
  handle.style.cssText =
    'cursor:' + (isAll ? 'default' : 'grab') + ';color:#9ca3af;font-size:16px;user-select:none;' + (isAll ? 'visibility:hidden;' : '');

  const nameLabel = document.createElement('span');
  nameLabel.textContent = tag;
  nameLabel.style.cssText = 'font-weight:500;font-size:14px;min-width:60px;';

  const status = document.createElement('span');
  status.textContent = (isLocked ? '🔒 已加密' : '🔓 未加密');
  status.style.cssText = 'font-size:13px;color:#6b7280;flex:1;';

  left.append(handle, nameLabel, status);

  const right = document.createElement('div');
  right.style.cssText = 'display:flex;gap:6px;align-items:center;flex-shrink:0;';

  const orderInput = document.createElement('input');
  orderInput.type = 'number';
  orderInput.className = 'tag-sort-input';
  orderInput.dataset.tag = tag;
  orderInput.value = orderValue === undefined ? '' : orderValue;
  orderInput.placeholder = '顺序';
  orderInput.min = '1';
  orderInput.step = '1';
  orderInput.style.cssText =
    'width:56px;padding:2px 6px;border:1px solid #e8f8f0;border-radius:4px;font-size:12px;text-align:center;';
  orderInput.addEventListener('change', function () {
    const value = parseInt(this.value) || 9999;
    const index = tagSortOrder.findIndex(item => item.n === tag);
    if (index >= 0) tagSortOrder[index].s = value;
    else tagSortOrder.push({ n: tag, s: value });
    tagSortOrder.sort((a, b) => a.s - b.s);
    saveTagSortOrder().then(ok => {
      showToast(ok ? '顺序已保存' : '保存失败');
      renderTagsFilter();
    });
  });
  right.appendChild(orderInput);

  const buttonStyle = 'padding:2px 10px;border:1px solid #e8f8f0;border-radius:4px;background:#f9fbfc;cursor:pointer;font-size:12px;color:#4b5563;';

  const setBtn = document.createElement('button');
  setBtn.className = 'tag-password-set-btn';
  setBtn.textContent = isLocked ? '修改' : '设置';
  setBtn.style.cssText = buttonStyle;
  setBtn.addEventListener('click', () => showSetTagPasswordModal(tag));
  right.appendChild(setBtn);

  if (isLocked) {
    const removeBtn = document.createElement('button');
    removeBtn.className = 'tag-password-remove-btn';
    removeBtn.textContent = '移除';
    removeBtn.style.cssText =
      'padding:2px 10px;border:1px solid #fef2f2;border-radius:4px;background:#fef2f2;cursor:pointer;font-size:12px;color:#ef4444;';
    removeBtn.addEventListener('click', async () => {
      if (!confirm(`确定要移除标签「${tag}」的密码吗？`)) return;
      await setTagPassword(tag, '');
      await renderTagManagerList();
      showToast(`✅ 已移除标签「${tag}」的密码`);
    });
    right.appendChild(removeBtn);
  }

  row.append(left, right);
  return row;
}

async function renderTagManagerList() {
  const wrap = document.getElementById('tagManagerList');
  if (!wrap) return;

  lockedTagSet = await loadLockedTags();
  // 加密标签可能一条可见链接都没有，仍需要出现在管理列表里
  const tags = [...new Set([...getAllTags(), ...lockedTagSet])];
  if (tags.length === 0) {
    wrap.replaceChildren();
    const empty = document.createElement('div');
    empty.style.cssText = 'padding:20px;text-align:center;color:#6b7280;';
    empty.textContent = '暂无标签';
    wrap.appendChild(empty);
    return;
  }

  const orderValues = {};
  tagSortOrder.forEach(item => {
    orderValues[item.n] = item.s;
  });
  tags.sort((a, b) => {
    const av = orderValues[a] === undefined ? 999999 : orderValues[a];
    const bv = orderValues[b] === undefined ? 999999 : orderValues[b];
    return av - bv;
  });

  wrap.replaceChildren();
  tags.forEach(tag => wrap.appendChild(buildTagManagerRow(tag, lockedTagSet.has(tag), orderValues[tag])));
  initTagManagerSortable();
}
// 用 dataset 比对而不是把标签名拼进选择器，含引号的标签名会让 querySelector 抛错
function syncTagManagerOrderInputs(orderList) {
  const inputs = document.querySelectorAll('.tag-sort-input');
  orderList.forEach(item => {
    for (const input of inputs) {
      if (input.dataset.tag === item.n) {
        input.value = item.s;
        break;
      }
    }
  });
}

function initTagManagerSortable() {
  const e = document.getElementById("tagManagerList");
  e &&
    (tagManagerSortableInstance && (tagManagerSortableInstance.destroy(), (tagManagerSortableInstance = null)),
    (tagManagerSortableInstance = new Sortable(e, {
      animation: 150,
      ghostClass: "tag-sort-ghost",
      handle: ".tag-manager-item:not(:first-child) span:first-child",
      filter: ".tag-manager-item:first-child",
      preventOnFilter: !1,
      onStart: () => {
        e.querySelectorAll(".tag-manager-item").forEach((e) => {
          e.style.cursor = "grabbing";
        });
      },
      onEnd: async () => {
        e.querySelectorAll(".tag-manager-item").forEach((e) => {
          e.style.cursor = "";
        });
        const t = e.querySelectorAll(".tag-manager-item"),
          n = [];
        if (
          (t.forEach((e) => {
            const t = e.dataset.tag;
            t && "全部" !== t && n.push(t);
          }),
          n.length > 0)
        ) {
          ((tagSortOrder = n.map((e, i) => ({ n: e, s: 10 * (i + 1) }))),
            syncTagManagerOrderInputs(tagSortOrder));
          (await saveTagSortOrder())
            ? (showToast("✅ 标签顺序已保存"), renderTagsFilter())
            : showToast("❌ 保存排序失败");
        }
      },
    })));
}
let settingTagName = null;
function showSetTagPasswordModal(e) {
  ((settingTagName = e),
    (document.getElementById("setTagPasswordTitle").textContent = `设置「${e}」的密码`),
    (document.getElementById("setTagPasswordInput").value = ""),
    (document.getElementById("setTagPasswordConfirm").value = ""),
    (document.getElementById("setTagPasswordError").style.display = "none"),
    document.getElementById("setTagPasswordModal").classList.add("show"),
    setTimeout(() => {
      document.getElementById("setTagPasswordInput").focus();
    }, 100));
}
function closeSetTagPasswordModal() {
  (document.getElementById("setTagPasswordModal").classList.remove("show"), (settingTagName = null));
}
async function confirmSetTagPassword() {
  const e = document.getElementById("setTagPasswordInput").value,
    t = document.getElementById("setTagPasswordConfirm").value,
    n = document.getElementById("setTagPasswordError");
  return !e || e.length < 4
    ? ((n.textContent = "密码至少 4 位"), void (n.style.display = "block"))
    : e !== t
      ? ((n.textContent = "两次输入的密码不一致"), void (n.style.display = "block"))
      : (await setTagPassword(settingTagName, e),
        closeSetTagPasswordModal(),
        await renderTagManagerList(),
        void showToast(`✅ 已为标签「${settingTagName}」设置密码`));
}
document.addEventListener("DOMContentLoaded", function () {
  const e = document.getElementById("setTagPasswordModal");
  e &&
    (document.getElementById("setTagPasswordCloseBtn")?.addEventListener("click", closeSetTagPasswordModal),
    document.getElementById("setTagPasswordCancelBtn")?.addEventListener("click", closeSetTagPasswordModal),
    document.getElementById("setTagPasswordConfirmBtn")?.addEventListener("click", confirmSetTagPassword),
    document.getElementById("setTagPasswordInput")?.addEventListener("keydown", function (e) {
      "Enter" === e.key && document.getElementById("setTagPasswordConfirm").focus();
    }),
    document.getElementById("setTagPasswordConfirm")?.addEventListener("keydown", function (e) {
      "Enter" === e.key && confirmSetTagPassword();
    }),
    e.addEventListener("click", function (t) {
      t.target === e && closeSetTagPasswordModal();
    }));
  const t = document.getElementById("tagPasswordManagerModal");
  t &&
    (document.getElementById("tagPasswordManagerCloseBtn")?.addEventListener("click", closeTagPasswordManager),
    document.getElementById("tagPasswordManagerCloseBtn2")?.addEventListener("click", closeTagPasswordManager),
    t.addEventListener("click", function (e) {
      e.target === t && closeTagPasswordManager();
    }));
});
