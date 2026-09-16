// ============================================================
//  ЛОГИКА КАРТЫ МОРРИОНА — С ПОДЛОКАЦИЯМИ И ФРАКЦИЯМИ
// ============================================================

const CONFIG = window.MORION_CONFIG;

// ============================================================
//  ВЫЧИСЛЕНИЕ ZOOM LEVEL ДЛЯ CRS.Simple
// ============================================================
const ZOOM_LEVEL = Math.ceil(Math.log2(Math.max(CONFIG.IMAGE_WIDTH, CONFIG.IMAGE_HEIGHT) / CONFIG.TILE_SIZE));
const WORLD_W = CONFIG.IMAGE_WIDTH / Math.pow(2, ZOOM_LEVEL);
const WORLD_H = CONFIG.IMAGE_HEIGHT / Math.pow(2, ZOOM_LEVEL);

// ============================================================
//  СОСТОЯНИЕ
// ============================================================
let map;
let locations = [];
let markers = {};
let isEditing = false;
let currentPin = '';

// ============================================================
//  ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================================

// Тип записи (иконка + подпись)
function getTypeInfo(record) {
    if (record.kind === 'faction') {
        return CONFIG.FACTION_TYPES[record.type] || CONFIG.FACTION_TYPES.guild;
    }
    if (record.kind === 'sublocation') {
        return CONFIG.SUBLOCATION_TYPES[record.type] || CONFIG.SUBLOCATION_TYPES.district;
    }
    return CONFIG.LOCATION_TYPES[record.type] || CONFIG.LOCATION_TYPES.city;
}

// Дети конкретного родителя
function getChildren(parentId, kind) {
    return locations.filter(l => l.parentId === parentId && l.kind === kind);
}

// Найти по id
function findById(id) {
    return locations.find(l => l.id === id);
}

// Путь до записи (для хлебных крошек)
function getPath(record) {
    const path = [];
    let current = record;
    let depth = 0;
    while (current && depth < 10) {
        path.unshift(current);
        if (!current.parentId) break;
        current = findById(current.parentId);
        depth++;
    }
    return path;
}

// UI утилиты
function setStatus(state, text) {
    const bar = document.getElementById('statusBar');
    bar.className = 'status-bar ' + state;
    document.getElementById('statusText').textContent = text;
}

function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, m => ({
        '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    })[m]);
}

function genId() {
    return 'loc-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
}

// ============================================================
//  КОНВЕРТАЦИЯ КООРДИНАТ
// ============================================================
function imageToLeaflet(x, y) {
    const scale = Math.pow(2, ZOOM_LEVEL);
    return L.latLng(-y / scale, x / scale);
}

function leafletToImage(latlng) {
    const scale = Math.pow(2, ZOOM_LEVEL);
    return {
        x: Math.round(latlng.lng * scale),
        y: Math.round(-latlng.lat * scale)
    };
}

// ============================================================
//  МИГРАЦИЯ СТАРЫХ ДАННЫХ
// ============================================================
function migrateLocations() {
    locations.forEach(loc => {
        if (!loc.kind) loc.kind = 'location';
        if (loc.parentId === undefined) loc.parentId = null;
    });
}

// ============================================================
//  СТАРТОВЫЙ ВИД
// ============================================================
function applyStartView(animate) {
    const W = CONFIG.IMAGE_WIDTH;
    const H = CONFIG.IMAGE_HEIGHT;

    const px = CONFIG.START_X_PERCENT / 100 * W;
    const py = CONFIG.START_Y_PERCENT / 100 * H;

    const center = imageToLeaflet(px, py);

    map.setView(center, CONFIG.START_ZOOM, { animate: !!animate });
    console.log('[applyStartView] px=' + px + ' py=' + py +
        ' | latlng=(' + center.lat.toFixed(2) + ',' + center.lng.toFixed(2) + ')' +
        ' | zoom=' + map.getZoom());
}

// ============================================================
//  ИНИЦИАЛИЗАЦИЯ КАРТЫ
// ============================================================
function initMap() {
    const W = CONFIG.IMAGE_WIDTH;
    const H = CONFIG.IMAGE_HEIGHT;

    console.log('W=' + W + ' H=' + H + ' ZOOM_LEVEL=' + ZOOM_LEVEL);

    map = L.map('map', {
        crs: L.CRS.Simple,
        minZoom: 0,
        maxZoom: ZOOM_LEVEL,
        zoomSnap: 0.25,
        zoomDelta: 0.5,
        attributionControl: false,
        zoomControl: false
    });

    const sw = L.latLng(-WORLD_H, 0);
    const ne = L.latLng(0, WORLD_W);
    const bounds = L.latLngBounds(sw, ne);

    const tileLayer = L.tileLayer(CONFIG.TILES_PATH, {
        tileSize: CONFIG.TILE_SIZE,
        tms: true,
        noWrap: true,
        bounds: bounds,
        minNativeZoom: 0,
        maxNativeZoom: CONFIG.MAX_NATIVE_ZOOM,
        keepBuffer: 2,
        updateWhenIdle: false
    });

    tileLayer.on('tileerror', function() {});
    tileLayer.addTo(map);

    L.control.zoom({ position: 'bottomright' }).addTo(map);
    map.on('click', onMapClick);

    window.addEventListener('resize', () => map.invalidateSize());
}

// ============================================================
//  ЗАГРУЗКА / СОХРАНЕНИЕ
// ============================================================
async function loadLocations() {
    setStatus('loading', 'Загрузка...');
    try {
        const resp = await fetch(CONFIG.API_LOCATIONS);
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        const data = await resp.json();
        locations = data.locations || [];
        migrateLocations();
        renderMarkers();
        setStatus('ok', locations.length + ' записей');
    } catch (err) {
        console.error('Ошибка загрузки:', err);
        setStatus('error', 'API не отвечает');
        const cached = localStorage.getItem('morion_locations');
        if (cached) {
            try {
                locations = JSON.parse(cached);
                migrateLocations();
                renderMarkers();
            } catch {}
        }
    }
}

async function saveLocations() {
    if (!currentPin) { alert('Сначала введите PIN'); return false; }
    setStatus('loading', 'Сохранение...');
    try {
        const resp = await fetch(CONFIG.API_LOCATIONS, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pin: currentPin, locations: locations })
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || 'HTTP ' + resp.status);
        localStorage.setItem('morion_locations', JSON.stringify(locations));
        setStatus('ok', 'Сохранено');
        return true;
    } catch (err) {
        console.error(err);
        setStatus('error', 'Ошибка сохранения');
        alert('Ошибка: ' + err.message);
        return false;
    }
}

// ============================================================
//  МАРКЕРЫ НА КАРТЕ — только kind === 'location'
// ============================================================
function renderMarkers() {
    Object.values(markers).forEach(m => map.removeLayer(m));
    markers = {};

    const topLevel = locations.filter(l => l.kind === 'location');

    topLevel.forEach(loc => {
        const info = getTypeInfo(loc);
        const latlng = imageToLeaflet(loc.x, loc.y);

        const icon = L.divIcon({
            className: 'custom-marker',
            html: `<div class="marker-icon ${info.css || ''}">${info.icon}</div>`,
            iconSize: [38, 38],
            iconAnchor: [19, 44],
            popupAnchor: [0, -40]
        });

        const marker = L.marker(latlng, { icon, draggable: isEditing }).addTo(map);
        marker.bindPopup(buildPopupHtml(loc), { maxWidth: 300, minWidth: 220, closeButton: true, autoPan: true });

        marker.on('popupopen', () => {
            const btn = document.querySelector('.popup-btn[data-id="' + loc.id + '"]');
            if (btn) {
                btn.onclick = () => {
                    marker.closePopup();
                    openDetailsModal(loc);
                };
            }
        });

        // В режиме редактора маркер можно таскать
        // Клик при этом НЕ перехватываем — попап откроется как обычно,
        // а через него откроется модалка с вкладками и кнопками добавления
        if (isEditing) {
            marker.on('dragend', (e) => {
                const pos = e.target.getLatLng();
                const coords = leafletToImage(pos);
                loc.x = coords.x;
                loc.y = coords.y;
                saveLocations();
            });
        }

        markers[loc.id] = marker;
    });
}

function buildPopupHtml(loc) {
    const info = getTypeInfo(loc);
    const subCount = getChildren(loc.id, 'sublocation').length;
    const factCount = getChildren(loc.id, 'faction').length;

    let extra = '';
    if (subCount || factCount) {
        const parts = [];
        if (subCount) parts.push('🏛 ' + subCount);
        if (factCount) parts.push('⚔️ ' + factCount);
        extra = ' · ' + parts.join(' · ');
    }

    return `
        <div class="popup-header">${info.icon} ${escapeHtml(loc.name)}</div>
        <div class="popup-body">
            <p>${escapeHtml(loc.short || info.label)}${extra}</p>
        </div>
        <button class="popup-btn" data-id="${loc.id}">Подробнее →</button>
    `;
}

// ============================================================
//  МОДАЛКА С ВКЛАДКАМИ
// ============================================================
function openDetailsModal(loc, activeTab) {
    const info = getTypeInfo(loc);
    const overlay = document.getElementById('modalOverlay');
    const modal = document.getElementById('modalContent');

    const isFaction = loc.kind === 'faction';
    const hasSub = loc.kind === 'location';
    const hasFactions = loc.kind === 'location' || loc.kind === 'sublocation';

    const subCount = hasSub ? getChildren(loc.id, 'sublocation').length : 0;
    const factCount = hasFactions ? getChildren(loc.id, 'faction').length : 0;
    const linksCount = (loc.links || []).length;

    if (!activeTab) activeTab = 'desc';

    // Хлебные крошки
    const path = getPath(loc);
    let breadcrumbsHtml = '';
    if (path.length > 1) {
        breadcrumbsHtml = '<div class="breadcrumbs">';
        path.forEach((node, i) => {
            if (i < path.length - 1) {
                breadcrumbsHtml += `<button onclick="openDetailsModal(findById('${node.id}'))">${escapeHtml(node.name)}</button>`;
                breadcrumbsHtml += '<span class="sep">→</span>';
            } else {
                breadcrumbsHtml += `<span class="current">${escapeHtml(node.name)}</span>`;
            }
        });
        breadcrumbsHtml += '</div>';
    }

    // Вкладки
    let tabsHtml = '<div class="modal-tabs">';
    tabsHtml += `<button class="modal-tab ${activeTab === 'desc' ? 'active' : ''}" data-tab="desc">📜 Описание</button>`;
    if (hasSub) {
        tabsHtml += `<button class="modal-tab ${activeTab === 'sub' ? 'active' : ''}" data-tab="sub">🏛 Районы${subCount ? ` <span class="tab-count">${subCount}</span>` : ''}</button>`;
    }
    if (hasFactions) {
        tabsHtml += `<button class="modal-tab ${activeTab === 'fac' ? 'active' : ''}" data-tab="fac">⚔️ Фракции${factCount ? ` <span class="tab-count">${factCount}</span>` : ''}</button>`;
    }
    tabsHtml += `<button class="modal-tab ${activeTab === 'links' ? 'active' : ''}" data-tab="links">🔗 Связи${linksCount ? ` <span class="tab-count">${linksCount}</span>` : ''}</button>`;
    tabsHtml += '</div>';

    // Содержимое вкладок
    const descHtml = buildDescTab(loc, info);
    const subHtml = hasSub ? buildSubTab(loc) : '';
    const facHtml = hasFactions ? buildFacTab(loc) : '';
    const linksHtml = buildLinksTab(loc);

    modal.innerHTML = `
        <div class="modal-header">
            <div class="modal-title-block">
                <div class="modal-type">${info.icon} ${info.label}</div>
                <div class="modal-title">${escapeHtml(loc.name)}</div>
            </div>
            <button class="modal-close" onclick="closeModal()">✕</button>
        </div>
        ${breadcrumbsHtml}
        ${tabsHtml}
        <div class="modal-body">
            <div class="tab-panel ${activeTab === 'desc' ? 'active' : ''}" data-panel="desc">${descHtml}</div>
            ${hasSub ? `<div class="tab-panel ${activeTab === 'sub' ? 'active' : ''}" data-panel="sub">${subHtml}</div>` : ''}
            ${hasFactions ? `<div class="tab-panel ${activeTab === 'fac' ? 'active' : ''}" data-panel="fac">${facHtml}</div>` : ''}
            <div class="tab-panel ${activeTab === 'links' ? 'active' : ''}" data-panel="links">${linksHtml}</div>
        </div>
    `;

    // Переключение вкладок
    modal.querySelectorAll('.modal-tab').forEach(tab => {
        tab.onclick = () => {
            const target = tab.getAttribute('data-tab');
            modal.querySelectorAll('.modal-tab').forEach(t => t.classList.remove('active'));
            modal.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
            tab.classList.add('active');
            const panel = modal.querySelector(`[data-panel="${target}"]`);
            if (panel) panel.classList.add('active');
        };
    });

    overlay.classList.add('open');
}

// --- Вкладка "Описание" ---
function buildDescTab(loc, info) {
    let html = '';
    if (loc.image) {
        html += `<img class="modal-image" src="${escapeHtml(loc.image)}" alt="${escapeHtml(loc.name)}">`;
    }
    html += `<div class="modal-description">${formatDescription(loc.description || loc.short || 'Пустое описание.')}</div>`;

    if (loc.kind === 'faction') {
        const metaItems = [];
        if (loc.leader) metaItems.push(`<div class="faction-meta-item"><span class="meta-label">Руководитель</span><span class="meta-value">${escapeHtml(loc.leader)}</span></div>`);
        if (loc.members) metaItems.push(`<div class="faction-meta-item"><span class="meta-label">Состав</span><span class="meta-value">${escapeHtml(loc.members)}</span></div>`);
        if (loc.goals) metaItems.push(`<div class="faction-meta-item"><span class="meta-label">Цели</span><span class="meta-value">${escapeHtml(loc.goals)}</span></div>`);
        if (metaItems.length) {
            html += `<div class="faction-meta">${metaItems.join('')}</div>`;
        }
    }

    if (isEditing) {
        html += `<div class="form-actions" style="margin-top:24px;">
            <button class="form-btn secondary" onclick="editFromDetails('${loc.id}')">✏️ Редактировать</button>
        </div>`;
    }
    return html;
}

// --- Вкладка "Районы" (подлокации) ---
function buildSubTab(loc) {
    const subs = getChildren(loc.id, 'sublocation');

    let html = '';
    if (!subs.length) {
        html += `<div class="empty-state"><span class="empty-icon">🏛</span>Внутри этой локации пока нет районов или зданий.</div>`;
    } else {
        html += '<div class="items-list">';
        subs.forEach(sub => {
            const info = getTypeInfo(sub);
            html += `
                <div class="item-card" onclick="openDetailsModal(findById('${sub.id}'))">
                    <div class="item-icon">${info.icon}</div>
                    <div class="item-content">
                        <div class="item-name">${escapeHtml(sub.name)}</div>
                        <div class="item-subtitle">${info.label}</div>
                        ${sub.short ? `<div class="item-short">${escapeHtml(sub.short)}</div>` : ''}
                    </div>
                    <div class="item-arrow">›</div>
                </div>
            `;
        });
        html += '</div>';
    }

    if (isEditing) {
        html += `<button class="add-item-btn" onclick="addSublocationTo('${loc.id}')">＋ Добавить район / здание</button>`;
    }

    return html;
}

// --- Вкладка "Фракции" ---
function buildFacTab(loc) {
    const facs = getChildren(loc.id, 'faction');

    let html = '';
    if (!facs.length) {
        html += `<div class="empty-state"><span class="empty-icon">⚔️</span>Здесь пока нет фракций.</div>`;
    } else {
        html += '<div class="items-list">';
        facs.forEach(fac => {
            const info = getTypeInfo(fac);
            html += `
                <div class="item-card" onclick="openDetailsModal(findById('${fac.id}'))">
                    <div class="item-icon">${info.icon}</div>
                    <div class="item-content">
                        <div class="item-name">${escapeHtml(fac.name)}</div>
                        <div class="item-subtitle">${info.label}</div>
                        ${fac.short ? `<div class="item-short">${escapeHtml(fac.short)}</div>` : ''}
                    </div>
                    <div class="item-arrow">›</div>
                </div>
            `;
        });
        html += '</div>';
    }

    if (isEditing) {
        html += `<button class="add-item-btn" onclick="addFactionTo('${loc.id}')">＋ Добавить фракцию</button>`;
    }

    return html;
}

// --- Вкладка "Связи" ---
function buildLinksTab(loc) {
    const links = (loc.links || []).map(id => findById(id)).filter(Boolean);

    let html = '';
    if (!links.length) {
        html += `<div class="empty-state"><span class="empty-icon">🔗</span>Связанных локаций пока нет.</div>`;
    } else {
        html += '<div class="items-list">';
        links.forEach(link => {
            const info = getTypeInfo(link);
            html += `
                <div class="item-card" onclick="openDetailsModal(findById('${link.id}'))">
                    <div class="item-icon">${info.icon}</div>
                    <div class="item-content">
                        <div class="item-name">${escapeHtml(link.name)}</div>
                        <div class="item-subtitle">${info.label}</div>
                        ${link.short ? `<div class="item-short">${escapeHtml(link.short)}</div>` : ''}
                    </div>
                    <div class="item-arrow">›</div>
                </div>
            `;
        });
        html += '</div>';
    }

    if (isEditing) {
        html += `<div class="form-actions" style="margin-top:24px; justify-content:flex-start;">
            <button class="form-btn secondary" onclick="editFromDetails('${loc.id}')">✏️ Изменить связи</button>
        </div>`;
    }

    return html;
}

function formatDescription(text) {
    if (!text) return '';
    return escapeHtml(text).replace(/\n/g, '<br>');
}

function closeModal() {
    document.getElementById('modalOverlay').classList.remove('open');
}

function editFromDetails(id) {
    const loc = findById(id);
    if (loc) openEditModal(loc);
}

// ============================================================
//  БЫСТРОЕ СОЗДАНИЕ ПОДЛОКАЦИИ / ФРАКЦИИ
// ============================================================
function addSublocationTo(parentId) {
    const newRec = {
        id: genId(),
        name: '',
        kind: 'sublocation',
        parentId: parentId,
        type: 'district',
        short: '', description: '', image: '',
        links: [], x: null, y: null
    };
    openEditModal(newRec, true);
}

function addFactionTo(parentId) {
    const newRec = {
        id: genId(),
        name: '',
        kind: 'faction',
        parentId: parentId,
        type: 'guild',
        short: '', description: '', image: '',
        links: [], x: null, y: null,
        leader: '', members: '', goals: ''
    };
    openEditModal(newRec, true);
}

// ============================================================
//  PIN-ФОРМА
// ============================================================
function openPinModal() {
    const overlay = document.getElementById('modalOverlay');
    const modal = document.getElementById('modalContent');
    let pin = '';

    modal.innerHTML = `
        <div class="modal-header">
            <div class="modal-title-block">
                <div class="modal-type">🔒 Мастер</div>
                <div class="modal-title">Введите PIN</div>
            </div>
            <button class="modal-close" onclick="closeModal()">✕</button>
        </div>
        <div class="modal-body">
            <div class="pin-form">
                <div class="pin-display">
                    <div class="pin-digit" data-i="0"></div>
                    <div class="pin-digit" data-i="1"></div>
                    <div class="pin-digit" data-i="2"></div>
                    <div class="pin-digit" data-i="3"></div>
                </div>
                <div class="pin-hint">Для доступа к редактированию карты</div>
            </div>
        </div>
    `;

    overlay.classList.add('open');

    const keyHandler = (e) => {
        if (!overlay.classList.contains('open')) {
            document.removeEventListener('keydown', keyHandler);
            return;
        }
        if (e.key === 'Escape') { closeModal(); document.removeEventListener('keydown', keyHandler); return; }
        if (e.key >= '0' && e.key <= '9' && pin.length < 4) {
            pin += e.key;
            updatePinDisplay(pin);
            if (pin.length === 4) {
                setTimeout(() => {
                    document.removeEventListener('keydown', keyHandler);
                    verifyPin(pin);
                }, 200);
            }
        } else if (e.key === 'Backspace' && pin.length > 0) {
            pin = pin.slice(0, -1);
            updatePinDisplay(pin);
        }
    };
    document.addEventListener('keydown', keyHandler);

    function updatePinDisplay(p) {
        modal.querySelectorAll('.pin-digit').forEach((el, i) => {
            el.textContent = p[i] ? '●' : '';
            el.classList.toggle('filled', i < p.length);
        });
    }
}

async function verifyPin(pin) {
    try {
        const resp = await fetch(CONFIG.API_LOCATIONS, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pin, locations: null })
        });
        if (resp.status === 401) {
            alert('Неверный PIN');
            return false;
        }
        currentPin = pin;
        sessionStorage.setItem(CONFIG.STORAGE_PIN, pin);
        closeModal();
        enableEditMode();
        return true;
    } catch (err) {
        currentPin = pin;
        sessionStorage.setItem(CONFIG.STORAGE_PIN, pin);
        closeModal();
        enableEditMode();
        return true;
    }
}

// ============================================================
//  РЕЖИМ РЕДАКТИРОВАНИЯ
// ============================================================
function enableEditMode() {
    isEditing = true;
    document.body.classList.add('editing');
    document.getElementById('editBtn').classList.add('active');
    document.getElementById('editBtn').textContent = '✅ Выйти из редактора';
    renderMarkers();
    setStatus('ok', 'Режим редактирования');
}

function disableEditMode() {
    isEditing = false;
    document.body.classList.remove('editing');
    document.getElementById('editBtn').classList.remove('active');
    document.getElementById('editBtn').textContent = '✏️ Редактировать';
    renderMarkers();
    setStatus('ok', locations.length + ' записей');
}

function onMapClick(e) {
    if (!isEditing) return;
    if (e.originalEvent && e.originalEvent._dragged) return;

    const coords = leafletToImage(e.latlng);
    const newRec = {
        id: genId(),
        name: '',
        kind: 'location',
        parentId: null,
        type: 'city',
        x: coords.x, y: coords.y,
        short: '', description: '', image: '', links: []
    };
    openEditModal(newRec, true);
}

// ============================================================
//  ФОРМА РЕДАКТИРОВАНИЯ
// ============================================================
function openEditModal(loc, isNew = false) {
    const overlay = document.getElementById('modalOverlay');
    const modal = document.getElementById('modalContent');

    const isFaction = loc.kind === 'faction';
    const isSublocation = loc.kind === 'sublocation';
    const isLocation = loc.kind === 'location';

    let typesDict;
    if (isFaction) typesDict = CONFIG.FACTION_TYPES;
    else if (isSublocation) typesDict = CONFIG.SUBLOCATION_TYPES;
    else typesDict = CONFIG.LOCATION_TYPES;

    const typeOptions = Object.entries(typesDict).map(([key, info]) => 
        `<option value="${key}" ${loc.type === key ? 'selected' : ''}>${info.icon} ${info.label}</option>`
    ).join('');

    // Селект родителя для новых вложенных записей
    let parentSelectHtml = '';
    if (isNew && !isLocation) {
        const possibleParents = locations.filter(l => l.kind === 'location' || l.kind === 'sublocation');
        if (possibleParents.length) {
            const opts = possibleParents.map(p => {
                const info = getTypeInfo(p);
                return `<option value="${p.id}" ${loc.parentId === p.id ? 'selected' : ''}>${info.icon} ${escapeHtml(p.name)}</option>`;
            }).join('');
            parentSelectHtml = `
                <div class="form-row">
                    <label>Где находится</label>
                    <select id="f-parent">${opts}</select>
                </div>
            `;
        }
    }

    // Связи
    const linkOptions = locations
        .filter(l => l.id !== loc.id && l.kind === 'location')
        .map(l => `<option value="${l.id}">${escapeHtml(l.name)}</option>`)
        .join('');

    const currentLinks = (loc.links || []).map(id => {
        const t = findById(id);
        if (!t) return '';
        return `<span class="modal-link-btn" data-remove-link="${id}" style="cursor:pointer;">${escapeHtml(t.name)} ✕</span>`;
    }).join('');

    // Доп. поля фракции
    let factionFieldsHtml = '';
    if (isFaction) {
        factionFieldsHtml = `
            <div class="form-row">
                <label>Руководитель</label>
                <input type="text" id="f-leader" value="${escapeHtml(loc.leader || '')}" placeholder="Например: Сэр Морис">
            </div>
            <div class="form-row">
                <label>Состав / численность</label>
                <input type="text" id="f-members" value="${escapeHtml(loc.members || '')}" placeholder="Например: ~200 рыцарей">
            </div>
            <div class="form-row">
                <label>Цели</label>
                <input type="text" id="f-goals" value="${escapeHtml(loc.goals || '')}" placeholder="Например: охранять паломников">
            </div>
        `;
    }

    const kindLabel = isNew ? 'Новая запись' : 'Редактирование';
    const recordKindLabel = CONFIG.KIND_INFO[loc.kind] ? CONFIG.KIND_INFO[loc.kind].label : '';

    modal.innerHTML = `
        <div class="modal-header">
            <div class="modal-title-block">
                <div class="modal-type">${isNew ? '➕' : '✏️'} ${kindLabel}</div>
                <div class="modal-title">${isNew ? 'Создать ' + recordKindLabel.toLowerCase() : escapeHtml(loc.name || 'Без названия')}</div>
            </div>
            <button class="modal-close" onclick="closeModal()">✕</button>
        </div>
        <div class="modal-body">
            <div class="form-row">
                <label>Название</label>
                <input type="text" id="f-name" value="${escapeHtml(loc.name)}" placeholder="Например: Тирон">
            </div>
            <div class="form-row">
                <label>Тип</label>
                <select id="f-type">${typeOptions}</select>
            </div>
            ${parentSelectHtml}
            <div class="form-row">
                <label>Краткое описание (для попапа)</label>
                <input type="text" id="f-short" value="${escapeHtml(loc.short)}" placeholder="Одно предложение">
            </div>
            <div class="form-row">
                <label>Полное описание</label>
                <textarea id="f-description" placeholder="Подробное описание...">${escapeHtml(loc.description)}</textarea>
            </div>
            ${factionFieldsHtml}
            <div class="form-row">
                <label>Картинка (URL или загрузка)</label>
                <input type="text" id="f-image" value="${escapeHtml(loc.image || '')}" placeholder="https://... или загрузите файл">
                <input type="file" id="f-file" accept="image/*" style="margin-top:8px; font-size:14px;">
            </div>
            <div class="form-row">
                <label>Связанные локации</label>
                <div id="links-list" style="margin-bottom:8px; display:flex; flex-wrap:wrap; gap:6px;">${currentLinks}</div>
                <select id="f-add-link">
                    <option value="">— Добавить связь —</option>
                    ${linkOptions}
                </select>
            </div>
            <div class="form-actions">
                ${!isNew ? `<button class="form-btn danger" id="f-delete">🗑 Удалить</button>` : ''}
                <button class="form-btn secondary" onclick="closeModal()">Отмена</button>
                <button class="form-btn primary" id="f-save">💾 Сохранить</button>
            </div>
        </div>
    `;

    overlay.classList.add('open');

    const fName = modal.querySelector('#f-name');
    const fType = modal.querySelector('#f-type');
    const fShort = modal.querySelector('#f-short');
    const fDesc = modal.querySelector('#f-description');
    const fImage = modal.querySelector('#f-image');
    const fFile = modal.querySelector('#f-file');
    const fAddLink = modal.querySelector('#f-add-link');
    const linksList = modal.querySelector('#links-list');
    const fParent = modal.querySelector('#f-parent');
    const fLeader = modal.querySelector('#f-leader');
    const fMembers = modal.querySelector('#f-members');
    const fGoals = modal.querySelector('#f-goals');

    let currentLinksArr = [...(loc.links || [])];

    fFile.onchange = async () => {
        const file = fFile.files[0];
        if (!file) return;
        if (file.size > 2 * 1024 * 1024) {
            alert('Файл больше 2 МБ. Пожалуйста, сожмите.');
            return;
        }
        setStatus('loading', 'Загрузка картинки...');
        const reader = new FileReader();
        reader.onload = async () => {
            const base64 = reader.result.split(',')[1];
            try {
                const resp = await fetch(CONFIG.API_UPLOAD, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ pin: currentPin, data: base64, mime: file.type })
                });
                const data = await resp.json();
                if (!resp.ok) throw new Error(data.error);
                fImage.value = data.url;
                setStatus('ok', 'Картинка загружена');
            } catch (err) {
                alert('Ошибка загрузки: ' + err.message);
                setStatus('error', 'Ошибка');
            }
        };
        reader.readAsDataURL(file);
    };

    fAddLink.onchange = () => {
        const id = fAddLink.value;
        if (!id) return;
        if (!currentLinksArr.includes(id)) {
            currentLinksArr.push(id);
            renderLinks();
        }
        fAddLink.value = '';
    };

    function renderLinks() {
        linksList.innerHTML = currentLinksArr.map(id => {
            const t = findById(id);
            if (!t) return '';
            return `<span class="modal-link-btn" data-remove-link="${id}" style="cursor:pointer;">${escapeHtml(t.name)} ✕</span>`;
        }).join('');
        linksList.querySelectorAll('[data-remove-link]').forEach(el => {
            el.onclick = () => {
                const id = el.getAttribute('data-remove-link');
                currentLinksArr = currentLinksArr.filter(x => x !== id);
                renderLinks();
            };
        });
    }
    renderLinks();

    modal.querySelector('#f-save').onclick = async () => {
        const name = fName.value.trim();
        if (!name) { alert('Введите название'); return; }

        loc.name = name;
        loc.type = fType.value;
        loc.short = fShort.value.trim();
        loc.description = fDesc.value.trim();
        loc.image = fImage.value.trim();
        loc.links = currentLinksArr;

        if (isFaction) {
            loc.leader = fLeader ? fLeader.value.trim() : '';
            loc.members = fMembers ? fMembers.value.trim() : '';
            loc.goals = fGoals ? fGoals.value.trim() : '';
        }

        if (isNew && fParent) {
            loc.parentId = fParent.value;
        }

        if (isNew) locations.push(loc);
        else {
            const idx = locations.findIndex(l => l.id === loc.id);
            if (idx >= 0) locations[idx] = loc;
        }

        const ok = await saveLocations();
        if (ok) {
            closeModal();
            renderMarkers();
            // После создания вложенной записи — вернуться к родителю
            if (isNew && loc.parentId) {
                const parent = findById(loc.parentId);
                if (parent) {
                    const tab = loc.kind === 'faction' ? 'fac' : 'sub';
                    setTimeout(() => openDetailsModal(parent, tab), 200);
                }
            }
        }
    };

    if (!isNew) {
        modal.querySelector('#f-delete').onclick = async () => {
            const children = locations.filter(l => l.parentId === loc.id);
            let confirmMsg = 'Удалить "' + loc.name + '"?';
            if (children.length) {
                confirmMsg += `\n\nУ неё есть ${children.length} вложенных записей — они тоже будут удалены.`;
            }
            if (!confirm(confirmMsg)) return;

            // Удаляем запись и всех потомков
            const toDelete = new Set([loc.id]);
            let changed = true;
            while (changed) {
                changed = false;
                locations.forEach(l => {
                    if (l.parentId && toDelete.has(l.parentId) && !toDelete.has(l.id)) {
                        toDelete.add(l.id);
                        changed = true;
                    }
                });
            }
            locations = locations.filter(l => !toDelete.has(l.id));
            locations.forEach(l => {
                if (l.links) l.links = l.links.filter(id => !toDelete.has(id));
            });

            const ok = await saveLocations();
            if (ok) { closeModal(); renderMarkers(); }
        };
    }

    if (isNew) setTimeout(() => fName.focus(), 100);
}

// ============================================================
//  КНОПКИ
// ============================================================
document.getElementById('editBtn').onclick = () => {
    if (isEditing) disableEditMode();
    else {
        const savedPin = sessionStorage.getItem(CONFIG.STORAGE_PIN);
        if (savedPin) { currentPin = savedPin; enableEditMode(); }
        else openPinModal();
    }
};

document.getElementById('resetViewBtn').onclick = () => {
    applyStartView(true);
};

document.getElementById('modalOverlay').onclick = (e) => {
    if (e.target.id === 'modalOverlay') closeModal();
};

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
});

// ============================================================
//  СТАРТ
// ============================================================
(function() {
    setStatus('loading', 'Загрузка карты...');
    initMap();

    applyStartView(false);
    setTimeout(() => applyStartView(false), 100);
    setTimeout(() => applyStartView(false), 400);
    setTimeout(() => applyStartView(false), 1000);

    loadLocations();
})();