/* Brynn's Outfit Finder - Single-collection app */

// App data (loaded from JSON)
let clothingIndex = {};
let pageItems = {};
let SOURCE_IMAGE_PATHS = {};
let SOURCE_LABELS = {};
let CATEGORY_ORDER = {};
let CATEGORY_ICONS = {};

// State
let currentCategory = 'all';
let DATA_READY = false;

// =============================================================================
// Utilities
// =============================================================================

function escapeForInline(str) {
    return String(str)
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'")
        .replace(/"/g, '\\"');
}

function parsePrefixedPage(prefixedPage) {
    // Expected: "<source>_page_<n>"
    const idx = String(prefixedPage).indexOf('_');
    if (idx === -1) {
        return { source: '', page: String(prefixedPage) };
    }
    return {
        source: prefixedPage.slice(0, idx),
        page: prefixedPage.slice(idx + 1)
    };
}

function getImageFolder(prefixedPage) {
    const { source } = parsePrefixedPage(prefixedPage);
    return SOURCE_IMAGE_PATHS[source] || 'images';
}

function sourceLabel(source) {
    return SOURCE_LABELS[source] || source || 'Pages';
}

function getCategoryOrder() {
    return CATEGORY_ORDER.all || CATEGORY_ORDER.summer || [];
}

function buildItemCategoryLookup(itemsByPage) {
    const lookup = {};
    Object.values(itemsByPage || {}).forEach(items => {
        if (!Array.isArray(items)) return;
        items.forEach(item => {
            if (item && typeof item === 'object') {
                if (item.name && item.category && !lookup[item.name]) {
                    lookup[item.name] = item.category;
                }
            }
        });
    });
    return lookup;
}

function categorizeItemsForRender(index, itemsByPage) {
    const order = getCategoryOrder();
    const categoriesSet = new Set(order);
    const categorized = {};
    order.forEach(cat => { categorized[cat] = []; });

    const itemCategoryLookup = buildItemCategoryLookup(itemsByPage);

    Object.keys(index || {}).forEach(itemName => {
        const pages = index[itemName] || [];
        let category = itemCategoryLookup[itemName] || 'Other';
        if (!categoriesSet.has(category)) category = 'Other';
        if (!categorized[category]) categorized[category] = [];

        categorized[category].push({
            name: itemName,
            pages,
            category
        });
    });

    Object.keys(categorized).forEach(cat => {
        categorized[cat].sort((a, b) => {
            const countDiff = (b.pages?.length || 0) - (a.pages?.length || 0);
            if (countDiff !== 0) return countDiff;
            return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
        });
    });

    return categorized;
}

// =============================================================================
// Fuzzy Search
// =============================================================================

function levenshteinDistance(str1, str2) {
    const m = str1.length;
    const n = str2.length;
    const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;

    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            if (str1[i - 1] === str2[j - 1]) {
                dp[i][j] = dp[i - 1][j - 1];
            } else {
                dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
            }
        }
    }
    return dp[m][n];
}

function fuzzyMatch(search, target) {
    const searchLower = search.toLowerCase();
    const targetLower = target.toLowerCase();

    if (targetLower.includes(searchLower)) return true;

    const searchWords = searchLower.split(/\s+/);
    const targetWords = targetLower.split(/\s+/);

    return searchWords.every(searchWord => {
        return targetWords.some(targetWord => {
            if (targetWord.includes(searchWord) || searchWord.includes(targetWord)) return true;
            if (searchWord.length > 3) {
                const maxDistance = searchWord.length > 5 ? 2 : 1;
                return levenshteinDistance(searchWord, targetWord) <= maxDistance;
            }
            return false;
        });
    });
}

/**
 * Debounce function - delays execution until after wait milliseconds
 * have elapsed since the last time the debounced function was invoked.
 */
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

const debouncedFilterItems = {
    all: debounce(() => filterItems('all'), 150),
};

// =============================================================================
// Rendering
// =============================================================================

function buildCategoryTabs() {
    const container = document.getElementById('category-tabs');
    if (!container) return;

    const order = getCategoryOrder();

    // Always include All first; avoid double-adding if order already contains it.
    const cats = ['all', ...order.filter(c => c && c !== 'all')];

    container.innerHTML = cats.map(cat => {
        if (cat === 'all') {
            return `<button onclick="filterByCategory('all')" class="active" id="cat-all" title="All">All</button>`;
        }
        const icon = CATEGORY_ICONS[cat] || '';
        const title = cat;
        return `<button onclick="filterByCategory('${escapeForInline(cat)}')" id="cat-${escapeForInline(cat)}" title="${escapeForInline(title)}">${icon || cat}</button>`;
    }).join('');
}

function renderAllItems() {
    const container = document.getElementById('all-items-grid');
    if (!container) return;

    const categorized = categorizeItemsForRender(clothingIndex, pageItems);
    const order = getCategoryOrder();

    let html = '';
    order.forEach(category => {
        const items = categorized[category] || [];
        if (!items.length) return;

        const icon = CATEGORY_ICONS[category] || '';
        html += `
                    <div class="category-section">
                        <div class="category-header">
                            <h2>${icon} ${category}</h2>
                            <p class="category-description">${items.length} items in this category</p>
                        </div>
                        <div class="item-grid">`;

        items.forEach(item => {
            const escapedName = escapeForInline(item.name);
            const pagesCount = item.pages?.length || 0;
            const pageLabel = pagesCount === 1 ? 'page' : 'pages';

            html += `
                            <div class="item-card" data-item-name="${escapeForInline(item.name)}" onclick="showItemDetail('${escapedName}')">
                                <div class="item-name">${item.name}</div>
                                <div class="item-count">
                                    Appears on ${pagesCount} ${pageLabel}
                                </div>
                            </div>`;
        });

        html += `
                        </div>
                    </div>`;
    });

    container.innerHTML = html;

    // Apply active category filter after render.
    if (currentCategory && currentCategory !== 'all') {
        filterByCategory(currentCategory);
    }
}

// =============================================================================
// Navigation + Filters
// =============================================================================

function getRouteFromHash() {
    const hash = window.location.hash || '';
    const query = hash.startsWith('#') ? hash.slice(1) : hash;
    const params = new URLSearchParams(query);

    // Prefer "page" if both are present.
    const page = params.get('page');
    if (page) return { view: 'page', prefixedPageName: page };

    const item = params.get('item');
    if (item) return { view: 'item', itemName: item };

    return { view: 'all' };
}

function routeToHash(route) {
    if (!route || route.view === 'all') return '';
    const params = new URLSearchParams();
    if (route.view === 'item' && route.itemName) params.set('item', route.itemName);
    if (route.view === 'page' && route.prefixedPageName) params.set('page', route.prefixedPageName);
    const qs = params.toString();
    return qs ? `#${qs}` : '';
}

function renderAllView() {
    document.getElementById('item-view').classList.add('hidden');
    document.getElementById('page-view').classList.add('hidden');
    document.getElementById('all-view').classList.remove('hidden');
    document.title = "Brynn's Outfit Finder";
}

function renderItemDetail(itemName) {
    if (!DATA_READY) return;
    const pages = clothingIndex[itemName];
    if (!pages || !pages.length) return;

    document.getElementById('all-view').classList.add('hidden');
    document.getElementById('page-view').classList.add('hidden');
    document.getElementById('item-view').classList.remove('hidden');

    document.title = itemName + " - Brynn's Outfit Finder";

    const content = document.getElementById('item-detail-content');
    content.innerHTML = `
        <div class="page-images">
            ${pages.map(prefixedPage => {
                const { source, page } = parsePrefixedPage(prefixedPage);
                const imageFolder = getImageFolder(prefixedPage);
                const displayPage = page.replace('page_', 'Page ');
                const label = sourceLabel(source);
                const caption = escapeForInline(label + ' - ' + displayPage + ' - ' + itemName);

                return `
                <div class="page-card">
                    <img src="${imageFolder}/${page}.jpg"
                         alt="${escapeForInline(label + ' - ' + displayPage)}"
                         class="clickable-image"
                         loading="lazy"
                         onclick="openModal('${imageFolder}/${page}.jpg', '${caption}')"
                         onerror="this.parentElement.style.display='none';">
                    <div class="page-title" onclick="showPageDetail('${escapeForInline(prefixedPage)}')" style="cursor: pointer;">
                        ${label} - ${displayPage}
                    </div>
                </div>
            `}).join('')}
        </div>
    `;
}

function renderPageDetail(prefixedPageName) {
    if (!DATA_READY) return;
    const items = pageItems[prefixedPageName];
    if (!items) return;

    const { source, page } = parsePrefixedPage(prefixedPageName);
    const imageFolder = getImageFolder(prefixedPageName);
    const displayPage = page.replace('page_', 'Page ');
    const label = sourceLabel(source);

    document.getElementById('all-view').classList.add('hidden');
    document.getElementById('item-view').classList.add('hidden');
    document.getElementById('page-view').classList.remove('hidden');
    document.title = `${label} - ${displayPage} - Brynn's Outfit Finder`;

    const itemsList = Array.isArray(items)
        ? items.map(item => {
            if (item && typeof item === 'object') {
                return `
                    <a onclick="showItemDetail('${escapeForInline(item.name)}')" class="item-link">
                        ${item.name} <span style="color: #7f8c8d; font-size: 0.9em;">[${item.category}]</span>
                    </a>`;
            }
            // Legacy string fallback
            return `
                <a onclick="showItemDetail('${escapeForInline(item)}')" class="item-link">
                    ${item}
                </a>`;
        }).join('')
        : '';

    const content = document.getElementById('page-detail-content');
    content.innerHTML = `
        <div class="page-detail">
            <div class="page-image">
                <img src="${imageFolder}/${page}.jpg" alt="${escapeForInline(label + ' - ' + displayPage)}"
                     class="clickable-image"
                     loading="lazy"
                     style="max-width: 100%; height: auto; border-radius: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.1);"
                     onclick="openModal('${imageFolder}/${page}.jpg', '${escapeForInline(label + ' - ' + displayPage)}')">
            </div>
            <div class="page-items">
                <h3>Clothing items on this page:</h3>
                <div class="item-list">
                    ${itemsList}
                </div>
            </div>
        </div>
    `;
}

function renderRoute(route) {
    if (!route) return renderAllView();
    if (route.view === 'item') return renderItemDetail(route.itemName);
    if (route.view === 'page') return renderPageDetail(route.prefixedPageName);
    return renderAllView();
}

function renderFromLocation() {
    if (!DATA_READY) return;
    renderRoute(getRouteFromHash());
}

function navigateTo(route, { replace = false } = {}) {
    const url = new URL(window.location.href);
    url.hash = routeToHash(route);
    const state = { __brynn_outfits: true };

    if (replace) {
        history.replaceState(state, '', url);
    } else {
        history.pushState(state, '', url);
    }

    renderRoute(route);
}

function backToCollection() {
    // Prefer actual browser back to keep the history stack consistent.
    // If this history entry wasn't created by our in-app navigation (e.g. a deep link
    // opened directly to an item/page), fall back to navigating to the collection view
    // instead of potentially leaving the app.
    if (history.state && history.state.__brynn_outfits && history.length > 1) {
        history.back();
        return;
    }
    navigateTo({ view: 'all' });
}

function filterByCategory(category) {
    currentCategory = category;

    // Update active tab
    document.querySelectorAll('.category-tabs button').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.getElementById('cat-' + category);
    if (activeBtn) activeBtn.classList.add('active');

    // Filter category sections in the only view
    const container = document.getElementById('all-items-grid');
    if (!container) return;

    const sections = container.querySelectorAll('.category-section');
    sections.forEach(section => {
        const header = section.querySelector('.category-header h2');
        if (!header) return;

        const sectionCategory = header.textContent.split(' ').slice(1).join(' ');
        if (category === 'all' || sectionCategory === category) {
            section.classList.remove('hidden');
        } else {
            section.classList.add('hidden');
        }
    });
}

function updateClearButton(collection) {
    const input = document.getElementById(collection + 'SearchInput');
    const clearBtn = input?.parentElement?.querySelector('.search-clear');
    if (clearBtn && input) {
        clearBtn.classList.toggle('visible', input.value.length > 0);
    }
}

function clearSearch(collection) {
    const input = document.getElementById(collection + 'SearchInput');
    if (!input) return;
    input.value = '';
    updateClearButton(collection);
    filterItems(collection);
    input.focus();
}

function filterItems(collection) {
    const input = document.getElementById(collection + 'SearchInput');
    const container = document.getElementById(collection + '-items-grid');
    const noResults = document.getElementById(collection + '-no-results');
    if (!input || !container || !noResults) return;

    const search = input.value.trim();
    updateClearButton(collection);

    const items = container.querySelectorAll('.item-card');
    let visibleCount = 0;

    items.forEach(item => {
        const itemName = item.getAttribute('data-item-name') || '';
        const isVisible = (search === '' || fuzzyMatch(search, itemName));
        item.style.display = isVisible ? '' : 'none';
        if (isVisible) visibleCount++;
    });

    if (visibleCount === 0 && search !== '') {
        noResults.classList.remove('hidden');
    } else {
        noResults.classList.add('hidden');
    }
}

// =============================================================================
// Item + Page Details
// =============================================================================

function showItemDetail(itemName) {
    navigateTo({ view: 'item', itemName });
}

function showPageDetail(prefixedPageName) {
    navigateTo({ view: 'page', prefixedPageName });
}

// =============================================================================
// Modal
// =============================================================================

function openModal(imageSrc, caption, pushModalHistory = true) {
    // Add a history entry so the browser back button closes the modal first.
    // Keep the URL the same; modal identity lives in the history state.
    if (pushModalHistory) {
        const current = history.state && typeof history.state === 'object' ? history.state : {};
        history.pushState(
            { ...current, __brynn_outfits: true, modal: true, modalImageSrc: imageSrc, modalCaption: caption },
            '',
            window.location.href
        );
    }

    const modal = document.getElementById('imageModal');
    const modalImg = document.getElementById('modalImage');
    const modalCaption = document.getElementById('modalCaption');

    modal.style.display = 'block';
    modalImg.src = imageSrc;
    modalCaption.innerHTML = caption;

    // Close on click outside
    modal.onclick = function(event) {
        if (event.target === modal || event.target === modalImg) {
            closeModal();
        }
    };

    // Close on Escape key
    document.onkeydown = function(event) {
        if (event.key === 'Escape') {
            closeModal();
        }
    };
}

function closeModal(fromPopstate = false) {
    document.getElementById('imageModal').style.display = 'none';

    // If this close was user-initiated, pop the modal history entry.
    if (!fromPopstate && history.state && history.state.modal) {
        history.back();
    }
}

// =============================================================================
// Swipe Navigation (mobile)
// =============================================================================

let touchStartX = 0;
let touchStartY = 0;
let touchEndX = 0;
let touchEndY = 0;
let touchStartTarget = null;

function handleSwipeGesture() {
    const swipeThreshold = 80; // px
    const edgeThreshold = 40; // px from left edge to qualify as "back" swipe
    const anywhereThreshold = 160; // allow stronger swipes that don't start at the edge

    const deltaX = touchEndX - touchStartX;
    const deltaY = touchEndY - touchStartY;

    const modal = document.getElementById('imageModal');
    if (modal.style.display === 'block') {
        const totalDistance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
        if (totalDistance > swipeThreshold) closeModal();
        return;
    }

    // Ignore back-swipe gestures that start on form controls.
    if (touchStartTarget && touchStartTarget.closest && touchStartTarget.closest('input, textarea, select')) return;

    // Swipe left-to-right to go back (edge swipe to reduce accidental triggers).
    const mostlyHorizontal = Math.abs(deltaY) <= Math.max(48, Math.abs(deltaX) * 0.5);
    const itemView = document.getElementById('item-view');
    const pageView = document.getElementById('page-view');
    const inDetailView = !itemView.classList.contains('hidden') || !pageView.classList.contains('hidden');

    const qualifiesForBack = (touchStartX <= edgeThreshold && deltaX >= swipeThreshold)
        || (deltaX >= anywhereThreshold);

    if (inDetailView && qualifiesForBack && mostlyHorizontal) {
        backToCollection();
    }
}

function initSwipeNavigation() {
    document.addEventListener('touchstart', function(e) {
        if (!e.changedTouches || !e.changedTouches.length) return;
        touchStartTarget = e.target;
        touchStartX = e.changedTouches[0].clientX;
        touchStartY = e.changedTouches[0].clientY;
    }, { passive: true });

    document.addEventListener('touchend', function(e) {
        if (!e.changedTouches || !e.changedTouches.length) return;
        touchEndX = e.changedTouches[0].clientX;
        touchEndY = e.changedTouches[0].clientY;
        handleSwipeGesture();
    }, { passive: true });
}

// =============================================================================
// Data Load + Init
// =============================================================================

async function loadAppData() {
    const url = document.body?.dataset?.appData || 'data/collections.json';
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to load app data: ${response.status}`);
    return response.json();
}

function applyAppData(data) {
    clothingIndex = data.all_index || {};
    pageItems = data.all_items || {};
    SOURCE_IMAGE_PATHS = data.source_image_paths || {};
    SOURCE_LABELS = data.source_labels || {};
    CATEGORY_ORDER = data.category_order || {};
    CATEGORY_ICONS = data.category_icons || {};
    DATA_READY = true;
}

function initAppAfterData() {
    buildCategoryTabs();
    initSwipeNavigation();
    renderAllItems();
    filterByCategory('all');
    filterItems('all');
    renderFromLocation();
}

document.addEventListener('DOMContentLoaded', function() {
    loadAppData()
        .then(data => {
            applyAppData(data);
            initAppAfterData();
        })
        .catch(err => {
            console.error('Failed to initialize app:', err);
        });
});

// Keep in-app views in sync with browser back/forward navigation.
window.addEventListener('popstate', function(event) {
    const state = event && event.state && typeof event.state === 'object' ? event.state : null;

    // Modal state takes precedence; underlying route is still derived from the URL hash.
    if (state && state.modal && state.modalImageSrc) {
        renderFromLocation();
        openModal(state.modalImageSrc, state.modalCaption || '', false);
        return;
    }

    closeModal(true);
    renderFromLocation();
});

// PWA: register the service worker (served at /sw.js so it can control navigation).
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch(err => {
            console.warn('Service worker registration failed:', err);
        });
    });
}
