/* Brynn's Outfit Finder - Single-collection app */

// App data (loaded from JSON)
let clothingIndex = {};
let pageItems = {};
let SOURCE_IMAGE_PATHS = {};
let SOURCE_LABELS = {};
let CATEGORY_ORDER = {};
let CATEGORY_ICONS = {};
let APP_DATA = {};

// State
let currentCategory = 'all';
let DATA_READY = false;
let EDIT_MODE = false;
let ACTIVE_EDIT_ITEM_NAME = null;
let TOAST_TIMEOUT = null;

const EDIT_KEY_STORAGE_KEY = 'brynn_outfits_edit_key';

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

function buildItemMetadataLookup(itemsByPage) {
    const lookup = {};
    Object.values(itemsByPage || {}).forEach(items => {
        if (!Array.isArray(items)) return;
        items.forEach(entry => {
            const normalized = normalizeItemEntry(entry);
            if (!normalized.name) return;

            if (!lookup[normalized.name]) {
                lookup[normalized.name] = {
                    category: normalized.category || 'Other',
                    trashed: Boolean(normalized.trashed)
                };
                return;
            }

            if (normalized.trashed) {
                lookup[normalized.name].trashed = true;
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

    const itemMetadataLookup = buildItemMetadataLookup(itemsByPage);

    Object.keys(index || {}).forEach(itemName => {
        const pages = index[itemName] || [];
        const metadata = itemMetadataLookup[itemName] || { category: 'Other', trashed: false };
        let category = metadata.category || 'Other';
        if (!categoriesSet.has(category)) category = 'Other';
        if (!categorized[category]) categorized[category] = [];

        categorized[category].push({
            name: itemName,
            pages,
            category,
            trashed: Boolean(metadata.trashed)
        });
    });

    Object.keys(categorized).forEach(cat => {
        categorized[cat].sort((a, b) => {
            const trashDiff = Number(Boolean(a.trashed)) - Number(Boolean(b.trashed));
            if (trashDiff !== 0) return trashDiff;
            const countDiff = (b.pages?.length || 0) - (a.pages?.length || 0);
            if (countDiff !== 0) return countDiff;
            return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
        });
    });

    return categorized;
}

function normalizeItemEntry(entry) {
    if (entry && typeof entry === 'object') {
        return {
            name: String(entry.name || '').trim(),
            category: String(entry.category || 'Other').trim() || 'Other',
            trashed: Boolean(entry.trashed)
        };
    }

    if (typeof entry === 'string') {
        return {
            name: entry.trim(),
            category: 'Other',
            trashed: false
        };
    }

    return { name: '', category: 'Other', trashed: false };
}

function getEditableCategories() {
    const ordered = getCategoryOrder().filter(cat => cat && cat !== 'all');
    const seen = new Set(ordered);

    Object.values(pageItems || {}).forEach(items => {
        if (!Array.isArray(items)) return;
        items.forEach(entry => {
            const { category } = normalizeItemEntry(entry);
            if (category && !seen.has(category)) {
                seen.add(category);
                ordered.push(category);
            }
        });
    });

    if (!seen.has('Other')) {
        ordered.push('Other');
    }

    return ordered;
}

function getItemCategory(itemName) {
    const lookup = buildItemMetadataLookup(pageItems);
    return lookup[itemName]?.category || 'Other';
}

function isItemTrashed(itemName) {
    const lookup = buildItemMetadataLookup(pageItems);
    return Boolean(lookup[itemName]?.trashed);
}

function getApiDataUrl() {
    return document.body?.dataset?.apiData || '/api/data';
}

function getStoredEditKey() {
    try {
        return sessionStorage.getItem(EDIT_KEY_STORAGE_KEY) || '';
    } catch (error) {
        return '';
    }
}

function setStoredEditKey(value) {
    try {
        if (value) {
            sessionStorage.setItem(EDIT_KEY_STORAGE_KEY, value);
        } else {
            sessionStorage.removeItem(EDIT_KEY_STORAGE_KEY);
        }
    } catch (error) {
        // Ignore storage errors in private browsing.
    }
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

    const categoryTabsHtml = cats.map(cat => {
        if (cat === 'all') {
            return `<button data-category-tab="1" onclick="filterByCategory('all')" class="active" id="cat-all" title="All">All</button>`;
        }
        const icon = CATEGORY_ICONS[cat] || '';
        const title = cat;
        return `<button data-category-tab="1" onclick="filterByCategory('${escapeForInline(cat)}')" id="cat-${escapeForInline(cat)}" title="${escapeForInline(title)}">${icon || cat}</button>`;
    }).join('');

    const editLabel = EDIT_MODE ? 'Done' : 'Edit';
    const editPressed = EDIT_MODE ? 'true' : 'false';
    const editActiveClass = EDIT_MODE ? ' active' : '';
    const editButtonHtml = `<button type="button" id="edit-mode-toggle" class="edit-mode-btn${editActiveClass}" aria-pressed="${editPressed}" onclick="toggleEditMode()">${editLabel}</button>`;

    container.innerHTML = `${categoryTabsHtml}${editButtonHtml}`;
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
            const escapedCategory = escapeForInline(item.category || 'Other');
            const pagesCount = item.pages?.length || 0;
            const pageLabel = pagesCount === 1 ? 'page' : 'pages';
            const trashed = Boolean(item.trashed);
            const trashIndicator = trashed ? '<span class="item-trash-indicator" aria-hidden="true">🗑️</span>' : '';

            html += `
                            <div class="item-card" data-item-name="${escapeForInline(item.name)}" data-item-category="${escapedCategory}" data-item-trashed="${trashed ? '1' : '0'}" onclick="onItemCardClick('${escapedName}')">
                                <button type="button" class="edit-btn" onclick="event.stopPropagation(); openEditItemModal('${escapedName}', '${escapedCategory}', ${trashed ? 'true' : 'false'})" aria-label="Edit item">✎</button>
                                <div class="item-name">${item.name}</div>
                                <div class="item-count">
                                    Appears on ${pagesCount} ${pageLabel}
                                </div>
                                ${trashIndicator}
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
    document.querySelectorAll('.category-tabs button[data-category-tab="1"]').forEach(btn => btn.classList.remove('active'));
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
// Edit Mode + Persistence
// =============================================================================

function updateEditModeButton() {
    const button = document.getElementById('edit-mode-toggle');
    if (!button) return;
    button.classList.toggle('active', EDIT_MODE);
    button.setAttribute('aria-pressed', String(EDIT_MODE));
    button.textContent = EDIT_MODE ? 'Done' : 'Edit';
}

function toggleEditMode() {
    EDIT_MODE = !EDIT_MODE;
    document.body.classList.toggle('edit-mode', EDIT_MODE);
    updateEditModeButton();
    if (!EDIT_MODE) closeEditItemModal();
}

function onItemCardClick(itemName) {
    if (EDIT_MODE) {
        openEditItemModal(itemName, getItemCategory(itemName), isItemTrashed(itemName));
        return;
    }
    showItemDetail(itemName);
}

function openEditItemModal(itemName, currentCategory, currentTrashed = false) {
    if (!DATA_READY) return;

    const modal = document.getElementById('editItemModal');
    const nameInput = document.getElementById('editItemNameInput');
    const categorySelect = document.getElementById('editItemCategorySelect');
    const trashedCheckbox = document.getElementById('editItemTrashedCheckbox');
    if (!modal || !nameInput || !categorySelect || !trashedCheckbox) return;

    ACTIVE_EDIT_ITEM_NAME = itemName;
    nameInput.value = itemName;

    const categories = getEditableCategories();
    if (currentCategory && !categories.includes(currentCategory)) {
        categories.push(currentCategory);
    }

    categorySelect.innerHTML = categories
        .map(cat => `<option value="${escapeForInline(cat)}">${cat}</option>`)
        .join('');
    categorySelect.value = currentCategory || 'Other';
    trashedCheckbox.checked = Boolean(currentTrashed);

    modal.classList.remove('hidden');
    nameInput.focus();
    nameInput.select();
}

function closeEditItemModal() {
    ACTIVE_EDIT_ITEM_NAME = null;
    const modal = document.getElementById('editItemModal');
    if (!modal) return;
    modal.classList.add('hidden');
}

function showToast(message, type = 'success') {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();
    if (TOAST_TIMEOUT) clearTimeout(TOAST_TIMEOUT);

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    TOAST_TIMEOUT = setTimeout(() => {
        toast.classList.add('fade-out');
        setTimeout(() => toast.remove(), 280);
    }, 2200);
}

function renameAndRecategorizeItem(oldName, newName, newCategory, newTrashed) {
    const oldPages = Array.isArray(clothingIndex[oldName]) ? clothingIndex[oldName] : [];
    const existingNewPages = Array.isArray(clothingIndex[newName]) ? clothingIndex[newName] : [];
    clothingIndex[newName] = Array.from(new Set([...existingNewPages, ...oldPages]));
    if (oldName !== newName) {
        delete clothingIndex[oldName];
    }

    Object.keys(pageItems || {}).forEach(pageKey => {
        const items = Array.isArray(pageItems[pageKey]) ? pageItems[pageKey] : [];
        const merged = [];
        const seen = new Map();

        items.forEach(entry => {
            const normalized = normalizeItemEntry(entry);
            if (!normalized.name) return;

            let name = normalized.name;
            let category = normalized.category || 'Other';
            let trashed = Boolean(normalized.trashed);
            const isTarget = name === oldName || (oldName !== newName && name === newName);

            if (isTarget) {
                name = newName;
                category = newCategory;
                trashed = Boolean(newTrashed);
            }

            if (seen.has(name)) {
                const idx = seen.get(name);
                if (name === newName) {
                    merged[idx].category = newCategory;
                    if (newTrashed) {
                        merged[idx].trashed = true;
                    } else {
                        delete merged[idx].trashed;
                    }
                } else if (trashed) {
                    merged[idx].trashed = true;
                }
                return;
            }

            const next = { name, category };
            if (trashed) {
                next.trashed = true;
            }
            seen.set(name, merged.length);
            merged.push(next);
        });

        pageItems[pageKey] = merged;
    });
}

function buildPersistedDataPayload() {
    return {
        ...APP_DATA,
        all_index: clothingIndex,
        all_items: pageItems,
        source_image_paths: SOURCE_IMAGE_PATHS,
        source_labels: SOURCE_LABELS,
        category_order: CATEGORY_ORDER,
        category_icons: CATEGORY_ICONS,
        edit_mode_enabled: EDIT_MODE
    };
}

async function persistAppData(payload) {
    const headers = { 'Content-Type': 'application/json' };
    const storedEditKey = getStoredEditKey();
    if (storedEditKey) {
        headers['x-edit-key'] = storedEditKey;
    }

    const doSave = async () => {
        const response = await fetch(getApiDataUrl(), {
            method: 'POST',
            headers,
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const detail = await response.text().catch(() => '');
            throw { status: response.status, detail };
        }

        const result = await response.json().catch(() => ({}));
        return result?.data || payload;
    };

    try {
        return await doSave();
    } catch (error) {
        if (error && error.status === 401) {
            const key = window.prompt('Enter edit key');
            if (!key || !key.trim()) {
                throw new Error('Edit key is required to save live changes.');
            }
            const trimmed = key.trim();
            setStoredEditKey(trimmed);
            headers['x-edit-key'] = trimmed;
            return doSave();
        }

        const message = error?.detail ? String(error.detail).slice(0, 200) : 'Unknown error';
        throw new Error(`Failed to save changes. ${message}`);
    }
}

function rerenderCollectionView() {
    renderAllItems();
    filterByCategory(currentCategory || 'all');
    filterItems('all');
}

async function saveEditItem() {
    const nameInput = document.getElementById('editItemNameInput');
    const categorySelect = document.getElementById('editItemCategorySelect');
    const trashedCheckbox = document.getElementById('editItemTrashedCheckbox');
    const saveButton = document.getElementById('editItemSaveButton');
    if (!nameInput || !categorySelect || !trashedCheckbox || !saveButton) return;

    const oldName = ACTIVE_EDIT_ITEM_NAME;
    if (!oldName) return;

    const newName = nameInput.value.trim();
    const newCategory = categorySelect.value.trim() || 'Other';
    const newTrashed = Boolean(trashedCheckbox.checked);

    if (!newName) {
        showToast('Item name cannot be empty.', 'error');
        return;
    }

    if (oldName !== newName && clothingIndex[newName]) {
        const shouldMerge = window.confirm(
            `"${newName}" already exists. Merge "${oldName}" into "${newName}"?`
        );
        if (!shouldMerge) return;
    }

    const snapshot = JSON.parse(JSON.stringify(buildPersistedDataPayload()));

    saveButton.disabled = true;
    saveButton.textContent = 'Saving...';

    try {
        renameAndRecategorizeItem(oldName, newName, newCategory, newTrashed);
        rerenderCollectionView();

        const savedData = await persistAppData(buildPersistedDataPayload());
        applyAppData(savedData);
        rerenderCollectionView();
        renderFromLocation();
        closeEditItemModal();
        showToast('Item updated on live site.');
    } catch (error) {
        applyAppData(snapshot);
        rerenderCollectionView();
        showToast(error.message || 'Failed to save item changes.', 'error');
    } finally {
        saveButton.disabled = false;
        saveButton.textContent = 'Save';
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
    const apiUrl = getApiDataUrl();

    try {
        const apiResponse = await fetch(apiUrl, { cache: 'no-store' });
        if (apiResponse.ok) {
            return apiResponse.json();
        }
    } catch (error) {
        // Fall through to static file fallback.
    }

    const staticUrl = document.body?.dataset?.appData || 'data/collections.json';
    const fallbackResponse = await fetch(staticUrl, { cache: 'no-store' });
    if (!fallbackResponse.ok) {
        throw new Error(`Failed to load app data: ${fallbackResponse.status}`);
    }
    return fallbackResponse.json();
}

function applyAppData(data) {
    APP_DATA = data || {};
    clothingIndex = APP_DATA.all_index || {};
    pageItems = APP_DATA.all_items || {};
    SOURCE_IMAGE_PATHS = APP_DATA.source_image_paths || {};
    SOURCE_LABELS = APP_DATA.source_labels || {};
    CATEGORY_ORDER = APP_DATA.category_order || {};
    CATEGORY_ICONS = APP_DATA.category_icons || {};
    DATA_READY = true;
}

function initAppAfterData() {
    buildCategoryTabs();
    initSwipeNavigation();
    updateEditModeButton();
    renderAllItems();
    filterByCategory('all');
    filterItems('all');
    renderFromLocation();
}

document.addEventListener('DOMContentLoaded', function() {
    const editItemModal = document.getElementById('editItemModal');
    const editItemNameInput = document.getElementById('editItemNameInput');
    if (editItemModal) {
        editItemModal.addEventListener('click', function(event) {
            if (event.target === editItemModal) {
                closeEditItemModal();
            }
        });
    }
    if (editItemNameInput) {
        editItemNameInput.addEventListener('keydown', function(event) {
            if (event.key === 'Enter') {
                event.preventDefault();
                saveEditItem();
            }
            if (event.key === 'Escape') {
                event.preventDefault();
                closeEditItemModal();
            }
        });
    }

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
