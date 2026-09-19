// ============================================================
//  ЛОГИКА КАРТЫ МОРРИОНА — С ПОДЛОКАЦИЯМИ И ФРАКЦИЯМИ
// ============================================================

const CONFIG = window.MORION_CONFIG;

const ZOOM_LEVEL = Math.ceil(Math.log2(Math.max(CONFIG.IMAGE_WIDTH, CONFIG.IMAGE_HEIGHT) / CONFIG.TILE_SIZE));
const WORLD_W = CONFIG.IMAGE_WIDTH / Math.pow(2, ZOOM_LEVEL);
const WORLD_H = CONFIG.IMAGE_HEIGHT / Math.pow(2, ZOOM_LEVEL);

let map;
let locations = [];
let markers = {};
let isEditing = false;
let currentPin = '';

// ============================================================
//  УТИЛИТЫ
// ============================================================
function setStatus(state, text) {
    const bar = document.getElementById('statusBar');
    if (!bar) return;
    bar.className = 'status-bar ' + state;
    const st = document.getElementById('statusText');
    if (st) st.textContent = text;
}
function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, m => ({
        '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    })[m]);
}
function genId() {
    return 'rec-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
}

function findById(id) {
    return locations.find(l => l.id === id);
}
function getTypeInfo(record) {
    if (!record) return CONFIG.LOCATION_TYPES.city;
    if (record.kind === 'faction') return CONFIG.FACTION_TYPES[record.type] || CONFIG.FACTION_TYPES.guild;
    if (record.kind === 'sublocation') return CONFIG.SUBLOCATION_TYPES[record.type] || CONFIG.SUBLOCATION_TYPES.district;
    return CONFIG.LOCATION_TYPES[record.type] || CONFIG.LOCATION_TYPES.city;
}
function getChildren(parentId, kind) {
    return locations.filter(l => l.parentId === parentId && l.kind === kind);
}
function getFactionsAt(locId) {
    return locations.filter(l => l.kind === 'faction' && l.bases && l.bases.includes(locId));
}
function getFactionBases(fac) {
    return (fac.bases || []).map(id => findById(id)).filter(Boolean);
}
function getPath(record) {
    const path = [];
    let current = record;
    let depth = 0;
    while (current && depth < 10) {
        path.unshift(current);
        if (!current.parentId || current.kind === 'faction') break;
        current = findById(current.parentId);
        depth++;
    }
    return path;
}

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

function migrateLocations() {
    locations.forEach(loc => {
        if (!loc.kind) loc.kind = 'location';
        if (loc.parentId === undefined) loc.parentId = null;
        if (loc.kind === 'faction') {
            if (!loc.bases) {
                loc.bases = loc.parentId ? [loc.parentId] : [];
            }
            delete loc.parentId;
        }
    });
}

// ============================================================
//  ПОСТРОЕНИЕ HTML МАРКЕРА (со спрайтом или emoji)
// ============================================================
function buildMarkerHtml(info) {
    const css = info.css || '';
    const emoji = info.emoji || info.icon || '';

    if (info.image) {
        return `<div class="marker-icon ${css}"><img src="${info.image}" alt="" draggable="false"></div>`;
    }
    return `<div class="marker-icon ${css}">${emoji}</div>`;
}

    // Fallback — emoji
    return `<div class="marker-icon ${css}">${emoji}</div>`;
}

// ============================================================
//  КАРТА
// ============================================================
function applyStartView(animate) {
    const px = CONFIG.START_X_PERCENT / 100 * CONFIG.IMAGE_WIDTH;
    const py = CONFIG.START_Y_PERCENT / 100 * CONFIG.IMAGE_HEIGHT;
    const center = imageToLeaflet(px, py);
    map.setView(center, CONFIG.START_ZOOM, { animate: !!animate });
}

function initMap() {
    map = L.map('map', {
        crs: L.CRS.Simple,
        minZoom: 0,
        maxZoom: ZOOM_LEVEL,
        zoomSnap: 0.25,
        zoomDelta: 0.5,
        attributionControl: false,
        zoomControl: false
    });

    const bounds = L.latLngBounds(L.latLng(-WORLD_H, 0), L.latLng(0, WORLD_W));

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
        setStatus('ok', locations.filter(l => l.kind === 'location').length + ' локаций');
    } catch (err) {
        console.error(err);
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
//  МАРКЕРЫ
// ============================================================
function renderMarkers() {
    Object.values(markers).forEach(m => map.removeLayer(m));
    markers = {};

    locations.filter(l => l.kind === 'location').forEach(loc => {
        const info = getTypeInfo(loc);
        const latlng = imageToLeaflet(loc.x, loc.y);

        const icon = L.divIcon({
            className: 'custom-marker',
            html: buildMarkerHtml(info),
            iconSize: [48, 48],
            iconAnchor: [24, 48],
            popupAnchor: [0, -44]
        });

        const marker = L.marker(latlng, { icon, draggable: isEditing }).addTo(map);
        marker.bindPopup(buildPopupHtml(loc), { maxWidth: 300, minWidth: 220, closeButton: true, autoPan: true });

        marker.on('popupopen', () => {
            const btn = document.querySelector('.popup-btn[data-id="' + loc.id + '"]');
            if (btn) {
                btn.onclick = () => {
                    marker.closePopup();
                    if (isEditing) {
                        openLocationEditor(loc);
                    } else {
                        openLocationViewer(loc);
                    }
                };
            }
        });

        if (isEditing) {
            marker.on('dragend', (e) => {
                const pos = e.target.getLatLng();
                const coords = leafletToImage(pos);
                loc.x = coords.x;
                loc.y = coords.y;
                saveLocations();
            });
            marker.on('click', (e) => {
                L.DomEvent.stopPropagation(e);
                marker.closePopup();
                openLocationEditor(loc);
            });
        }

        markers[loc.id] = marker;
    });
}

function buildPopupHtml(loc) {
    const info = getTypeInfo(loc);
    const subCount = getChildren(loc.id, 'sublocation').length;
    const factCount = getFactionsAt(loc.id).length;

    let extra = '';
    if (subCount || factCount) {
        const parts = [];
        if (subCount) parts.push('🏛 ' + subCount);
        if (factCount) parts.push('⚔️ ' + factCount);
        extra = ' · ' + parts.join(' · ');
    }

    const emoji = info.emoji || info.icon || '';

    return `
        <div class="popup-header">${emoji} ${escapeHtml(loc.name)}</div>
        <div class="popup-body">
            <p>${escapeHtml(loc.short || info.label)}${extra}</p>
        </div>
        <button class="popup-btn" data-id="${loc.id}">${isEditing ? '✏️ Редактировать' : 'Подробнее →'}</button>
    `;
}

// ============================================================
//  МОДАЛКА
// ============================================================
function closeModal() {
    const overlay = document.getElementById('modalOverlay');
    if (overlay) overlay.classList.remove('open');
}
function setModal(html) {
    const modal = document.getElementById('modalContent');
    if (!modal) return;
    modal.innerHTML = html;
    const overlay = document.getElementById('modalOverlay');
    if (overlay) overlay.classList.add('open');
}
function bindTabs(modal) {
    if (!modal) return;
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
}
function formatDescription(text) {
    if (!text) return '';
    return escapeHtml(text).replace(/\n/g, '<br>');
}

// ============================================================
//  ПРОСМОТР ЛОКАЦИИ
// ============================================================
function openLocationViewer(loc, activeTab) {
    const info = getTypeInfo(loc);
    if (!activeTab) activeTab = 'desc';

    const subCount = getChildren(loc.id, 'sublocation').length;
    const facs = getFactionsAt(loc.id);
    const linksCount = (loc.links || []).length;

    const tabs = `
        <div class="modal-tabs">
            <button class="modal-tab ${activeTab === 'desc' ? 'active' : ''}" data-tab="desc">📜 Описание</button>
            <button class="modal-tab ${activeTab === 'sub' ? 'active' : ''}" data-tab="sub">🏛 Районы${subCount ? ` <span class="tab-count">${subCount}</span>` : ''}</button>
            <button class="modal-tab ${activeTab === 'fac' ? 'active' : ''}" data-tab="fac">⚔️ Фракции${facs.length ? ` <span class="tab-count">${facs.length}</span>` : ''}</button>
            <button class="modal-tab ${activeTab === 'links' ? 'active' : ''}" data-tab="links">🔗 Связи${linksCount ? ` <span class="tab-count">${linksCount}</span>` : ''}</button>
        </div>`;

    const path = getPath(loc);
    let breadcrumbsHtml = '';
    if (path.length > 1) {
        breadcrumbsHtml = '<div class="breadcrumbs">';
        path.forEach((node, i) => {
            if (i < path.length - 1) {
                breadcrumbsHtml += `<button onclick="openLocationViewer(findById('${node.id}'))">${escapeHtml(node.name)}</button><span class="sep">→</span>`;
            } else {
                breadcrumbsHtml += `<span class="current">${escapeHtml(node.name)}</span>`;
            }
        });
        breadcrumbsHtml += '</div>';
    }

    setModal(`
        <div class="modal-header">
            <div class="modal-title-block">
                <div class="modal-type">${info.emoji || info.icon} ${info.label}</div>
                <div class="modal-title">${escapeHtml(loc.name)}</div>
            </div>
            <button class="modal-close" onclick="closeModal()">✕</button>
        </div>
        ${breadcrumbsHtml}
        ${tabs}
        <div class="modal-body">
            <div class="tab-panel ${activeTab === 'desc' ? 'active' : ''}" data-panel="desc">${renderDescPanel(loc, false)}</div>
            <div class="tab-panel ${activeTab === 'sub' ? 'active' : ''}" data-panel="sub">${renderSubPanel(loc, false)}</div>
            <div class="tab-panel ${activeTab === 'fac' ? 'active' : ''}" data-panel="fac">${renderFacPanel(loc, false)}</div>
            <div class="tab-panel ${activeTab === 'links' ? 'active' : ''}" data-panel="links">${renderLinksPanel(loc, false)}</div>
        </div>
    `);
    bindTabs(document.getElementById('modalContent'));
}

// ============================================================
//  РЕДАКТОР ЛОКАЦИИ
// ============================================================
function openLocationEditor(loc, isNew, activeTab) {
    if (!isEditing) return;
    const info = getTypeInfo(loc);
    if (!activeTab) activeTab = 'desc';

    const subCount = getChildren(loc.id, 'sublocation').length;
    const facs = getFactionsAt(loc.id);
    const linksCount = (loc.links || []).length;

    const title = isNew ? 'Новая локация' : escapeHtml(loc.name);
    const typeLabel = isNew ? '➕ Создание' : `✏️ ${info.label}`;

    const tabs = `
        <div class="modal-tabs">
            <button class="modal-tab ${activeTab === 'desc' ? 'active' : ''}" data-tab="desc">📜 Описание</button>
            <button class="modal-tab ${activeTab === 'sub' ? 'active' : ''}" data-tab="sub">🏛 Районы${subCount ? ` <span class="tab-count">${subCount}</span>` : ''}</button>
            <button class="modal-tab ${activeTab === 'fac' ? 'active' : ''}" data-tab="fac">⚔️ Фракции${facs.length ? ` <span class="tab-count">${facs.length}</span>` : ''}</button>
            <button class="modal-tab ${activeTab === 'links' ? 'active' : ''}" data-tab="links">🔗 Связи${linksCount ? ` <span class="tab-count">${linksCount}</span>` : ''}</button>
        </div>`;

    setModal(`
        <div class="modal-header">
            <div class="modal-title-block">
                <div class="modal-type">${typeLabel}</div>
                <div class="modal-title">${title}</div>
            </div>
            <button class="modal-close" onclick="closeModal()">✕</button>
        </div>
        ${!isNew ? tabs : ''}
        <div class="modal-body">
            <div class="tab-panel ${activeTab === 'desc' || isNew ? 'active' : ''}" data-panel="desc">${renderDescPanel(loc, true, isNew)}</div>
            ${!isNew ? `<div class="tab-panel ${activeTab === 'sub' ? 'active' : ''}" data-panel="sub">${renderSubPanel(loc, true)}</div>` : ''}
            ${!isNew ? `<div class="tab-panel ${activeTab === 'fac' ? 'active' : ''}" data-panel="fac">${renderFacPanel(loc, true)}</div>` : ''}
            ${!isNew ? `<div class="tab-panel ${activeTab === 'links' ? 'active' : ''}" data-panel="links">${renderLinksPanel(loc, true)}</div>` : ''}
        </div>
    `);
    bindTabs(document.getElementById('modalContent'));
    bindDescPanel(loc, isNew);
}

// ============================================================
//  ПАНЕЛИ
// ============================================================
function renderDescPanel(loc, editable, isNew = false) {
    const isFaction = loc.kind === 'faction';
    let html = '';

    if (editable) {
        const typesDict = loc.kind === 'faction' ? CONFIG.FACTION_TYPES
            : loc.kind === 'sublocation' ? CONFIG.SUBLOCATION_TYPES
            : CONFIG.LOCATION_TYPES;

        const typeOptions = Object.entries(typesDict).map(([key, info]) =>
            `<option value="${key}" ${loc.type === key ? 'selected' : ''}>${info.emoji || info.icon} ${info.label}</option>`
        ).join('');

        html += `<div class="form-row">
            <label>Название</label>
            <input type="text" id="f-name" value="${escapeHtml(loc.name)}" placeholder="Например: Тирон">
        </div>
        <div class="form-row">
            <label>Тип</label>
            <select id="f-type">${typeOptions}</select>
        </div>
        <div class="form-row">
            <label>Краткое описание (для попапа)</label>
            <input type="text" id="f-short" value="${escapeHtml(loc.short)}" placeholder="Одно предложение">
        </div>
        <div class="form-row">
            <label>Полное описание</label>
            <textarea id="f-description" placeholder="Подробное описание...">${escapeHtml(loc.description)}</textarea>
        </div>`;

        if (isFaction) {
            html += `<div class="form-row">
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
            </div>`;
        }

        html += `<div class="form-row">
            <label>Картинка (URL или загрузка)</label>
            <input type="text" id="f-image" value="${escapeHtml(loc.image || '')}" placeholder="https://... или загрузите файл">
            <input type="file" id="f-file" accept="image/*" style="margin-top:8px; font-size:14px;">
        </div>`;

        html += `<div class="form-actions">
            ${!isNew ? `<button class="form-btn danger" id="f-delete">🗑 Удалить</button>` : ''}
            <button class="form-btn secondary" onclick="closeModal()">Отмена</button>
            <button class="form-btn primary" id="f-save">💾 Сохранить</button>
        </div>`;
    } else {
        if (loc.image) {
            html += `<img class="modal-image" src="${escapeHtml(loc.image)}" alt="${escapeHtml(loc.name)}">`;
        }
        html += `<div class="modal-description">${formatDescription(loc.description || loc.short || 'Пустое описание.')}</div>`;

        if (loc.kind === 'faction') {
            const metaItems = [];
            if (loc.leader) metaItems.push(`<div class="faction-meta-item"><span class="meta-label">Руководитель</span><span class="meta-value">${escapeHtml(loc.leader)}</span></div>`);
            if (loc.members) metaItems.push(`<div class="faction-meta-item"><span class="meta-label">Состав</span><span class="meta-value">${escapeHtml(loc.members)}</span></div>`);
            if (loc.goals) metaItems.push(`<div class="faction-meta-item"><span class="meta-label">Цели</span><span class="meta-value">${escapeHtml(loc.goals)}</span></div>`);
            if (metaItems.length) html += `<div class="faction-meta">${metaItems.join('')}</div>`;
        }
    }
    return html;
}

function bindDescPanel(loc, isNew) {
    const modal = document.getElementById('modalContent');
    if (!modal) return;
    const fFile = modal.querySelector('#f-file');
    const fImage = modal.querySelector('#f-image');

    if (fFile && fImage) {
        fFile.onchange = async () => {
            const file = fFile.files[0];
            if (!file) return;
            if (file.size > 2 * 1024 * 1024) { alert('Файл больше 2 МБ'); return; }
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
    }

    const saveBtn = modal.querySelector('#f-save');
    if (saveBtn) {
        saveBtn.onclick = async () => {
            const name = modal.querySelector('#f-name').value.trim();
            if (!name) { alert('Введите название'); return; }

            loc.name = name;
            loc.type = modal.querySelector('#f-type').value;
            loc.short = modal.querySelector('#f-short').value.trim();
            loc.description = modal.querySelector('#f-description').value.trim();
            loc.image = fImage ? fImage.value.trim() : '';

            if (loc.kind === 'faction') {
                const leaderEl = modal.querySelector('#f-leader');
                const membersEl = modal.querySelector('#f-members');
                const goalsEl = modal.querySelector('#f-goals');
                if (leaderEl) loc.leader = leaderEl.value.trim();
                if (membersEl) loc.members = membersEl.value.trim();
                if (goalsEl) loc.goals = goalsEl.value.trim();
                if (!loc.bases) loc.bases = [];
            }

            if (isNew) {
                if (!loc.kind) loc.kind = 'location';
                if (loc.kind === 'location') {
                    if (loc.parentId === undefined) loc.parentId = null;
                } else if (loc.kind === 'sublocation') {
                    if (!loc.parentId) loc.parentId = null;
                }
                locations.push(loc);
            } else {
                const idx = locations.findIndex(l => l.id === loc.id);
                if (idx >= 0) locations[idx] = loc;
            }

            const ok = await saveLocations();
            if (ok) {
                closeModal();
                renderMarkers();
                if (isNew && loc.kind === 'sublocation' && loc.parentId) {
                    const parent = findById(loc.parentId);
                    if (parent) setTimeout(() => openLocationEditor(parent, false, 'sub'), 200);
                }
            }
        };
    }

    const deleteBtn = modal.querySelector('#f-delete');
    if (deleteBtn) {
        deleteBtn.onclick = async () => {
            const children = locations.filter(l => l.parentId === loc.id);
            let msg = `Удалить "${loc.name}"?`;
            if (children.length) msg += `\n\nВложенных записей: ${children.length}. Они тоже удалятся.`;
            if (!confirm(msg)) return;

            const toDelete = new Set([loc.id]);
            let changed = true;
            while (changed) {
                changed = false;
                locations.forEach(l => {
                    if (l.parentId && toDelete.has(l.parentId) && !toDelete.has(l.id)) {
                        toDelete.add(l.id); changed = true;
                    }
                });
            }
            locations = locations.filter(l => !toDelete.has(l.id));
            locations.forEach(l => {
                if (l.links) l.links = l.links.filter(id => !toDelete.has(id));
                if (l.bases) l.bases = l.bases.filter(id => !toDelete.has(id));
            });

            const ok = await saveLocations();
            if (ok) { closeModal(); renderMarkers(); }
        };
    }
}

function renderSubPanel(loc, editable) {
    const subs = getChildren(loc.id, 'sublocation');
    let html = '';

    if (!subs.length) {
        html += `<div class="empty-state"><span class="empty-icon">🏛</span>Внутри этой локации пока нет районов или зданий.</div>`;
    } else {
        html += '<div class="items-list">';
        subs.forEach(sub => {
            const info = getTypeInfo(sub);
            const actions = editable ? `
                <div class="item-actions">
                    <button class="item-action-btn" onclick="event.stopPropagation(); openSublocationEditor(findById('${sub.id}'))" title="Редактировать">✎</button>
                    <button class="item-action-btn danger" onclick="event.stopPropagation(); deleteSublocation('${sub.id}')" title="Удалить">✕</button>
                </div>` : '';
            const clickHandler = editable ? `openSublocationEditor(findById('${sub.id}'))` : `openLocationViewer(findById('${sub.id}'))`;
            html += `
                <div class="item-card" onclick="${clickHandler}">
                    <div class="item-icon">${info.icon}</div>
                    <div class="item-content">
                        <div class="item-name">${escapeHtml(sub.name)}</div>
                        <div class="item-subtitle">${info.label}</div>
                        ${sub.short ? `<div class="item-short">${escapeHtml(sub.short)}</div>` : ''}
                    </div>
                    ${actions || '<div class="item-arrow" style="color:var(--ink-muted);font-size:18px;align-self:center;">›</div>'}
                </div>`;
        });
        html += '</div>';
    }

    if (editable) {
        html += `<button class="add-item-btn" onclick="createSublocationIn('${loc.id}')">＋ Добавить район / здание</button>`;
    }
    return html;
}

function renderFacPanel(loc, editable) {
    const facs = getFactionsAt(loc.id);
    let html = '';

    if (!facs.length) {
        html += `<div class="empty-state"><span class="empty-icon">⚔️</span>Здесь пока нет фракций.</div>`;
    } else {
        html += '<div class="items-list">';
        facs.forEach(fac => {
            const info = getTypeInfo(fac);
            const actions = editable ? `
                <div class="item-actions">
                    <button class="item-action-btn" onclick="event.stopPropagation(); openFactionEditor(findById('${fac.id}'), false, '${loc.id}')" title="Редактировать">✎</button>
                    <button class="item-action-btn danger" onclick="event.stopPropagation(); unlinkFaction('${fac.id}', '${loc.id}')" title="Отвязать">✕</button>
                </div>` : '';
            const clickHandler = editable ? `openFactionEditor(findById('${fac.id}'), false, '${loc.id}')` : `openLocationViewer(findById('${fac.id}'))`;
            html += `
                <div class="item-card" onclick="${clickHandler}">
                    <div class="item-icon">${info.icon}</div>
                    <div class="item-content">
                        <div class="item-name">${escapeHtml(fac.name)}</div>
                        <div class="item-subtitle">${info.label}</div>
                        ${fac.short ? `<div class="item-short">${escapeHtml(fac.short)}</div>` : ''}
                    </div>
                    ${actions || '<div class="item-arrow" style="color:var(--ink-muted);font-size:18px;align-self:center;">›</div>'}
                </div>`;
        });
        html += '</div>';
    }

    if (editable) {
        const existingFactions = locations.filter(l => l.kind === 'faction' && !facs.some(f => f.id === l.id));
        html += `<div style="display:flex; gap:8px; margin-top:12px; flex-wrap:wrap;">
            <button class="add-item-btn" style="flex:1; min-width:200px; margin-top:0;" onclick="createNewFactionIn('${loc.id}')">＋ Создать новую фракцию</button>
            ${existingFactions.length ? `<button class="add-item-btn" style="flex:1; min-width:200px; margin-top:0;" onclick="showAttachFactionDialog('${loc.id}')">🔗 Привязать существующую</button>` : ''}
        </div>`;
    }
    return html;
}

function renderLinksPanel(loc, editable) {
    const links = (loc.links || []).map(id => findById(id)).filter(Boolean);
    let html = '';

    if (!links.length) {
        html += `<div class="empty-state"><span class="empty-icon">🔗</span>Связанных локаций пока нет.</div>`;
    } else {
        html += '<div class="items-list">';
        links.forEach(link => {
            const info = getTypeInfo(link);
            const actions = editable ? `
                <div class="item-actions">
                    <button class="item-action-btn danger" onclick="event.stopPropagation(); unlinkLocation('${loc.id}', '${link.id}')" title="Убрать связь">✕</button>
                </div>` : '';
            html += `
                <div class="item-card" onclick="openLocationViewer(findById('${link.id}'))">
                    <div class="item-icon">${info.icon}</div>
                    <div class="item-content">
                        <div class="item-name">${escapeHtml(link.name)}</div>
                        <div class="item-subtitle">${info.label}</div>
                    </div>
                    ${actions || '<div class="item-arrow" style="color:var(--ink-muted);font-size:18px;align-self:center;">›</div>'}
                </div>`;
        });
        html += '</div>';
    }

    if (editable) {
        const allLocs = locations.filter(l => l.kind === 'location' && l.id !== loc.id);
        if (allLocs.length) {
            const options = allLocs.map(l => {
                const info = getTypeInfo(l);
                const alreadyLinked = (loc.links || []).includes(l.id);
                return `<option value="${l.id}" ${alreadyLinked ? 'disabled' : ''}>${info.emoji || info.icon} ${escapeHtml(l.name)}${alreadyLinked ? ' (уже связана)' : ''}</option>`;
            }).join('');
            html += `<div class="form-row" style="margin-top:16px;">
                <label>Добавить связь</label>
                <select id="f-add-link" data-loc-id="${loc.id}">
                    <option value="">— Выберите локацию —</option>
                    ${options}
                </select>
            </div>`;
        }
    }
    return html;
}

// ============================================================
//  ПОДЛОКАЦИИ
// ============================================================
function createSublocationIn(parentId) {
    const newSub = {
        id: genId(),
        name: '',
        kind: 'sublocation',
        parentId: parentId,
        type: 'district',
        short: '', description: '', image: ''
    };
    openSublocationEditor(newSub, true);
}

function openSublocationEditor(sub, isNew = false) {
    const info = getTypeInfo(sub);
    const typeOptions = Object.entries(CONFIG.SUBLOCATION_TYPES).map(([key, inf]) =>
        `<option value="${key}" ${sub.type === key ? 'selected' : ''}>${inf.icon} ${inf.label}</option>`
    ).join('');

    setModal(`
        <div class="modal-header">
            <div class="modal-title-block">
                <div class="modal-type">${isNew ? '➕ Новый район' : '✏️ ' + info.label}</div>
                <div class="modal-title">${isNew ? 'Создать' : escapeHtml(sub.name)}</div>
            </div>
            <button class="modal-close" onclick="closeModal()">✕</button>
        </div>
        <div class="modal-body">
            <div class="tab-panel active">
                <div class="form-row">
                    <label>Название</label>
                    <input type="text" id="s-name" value="${escapeHtml(sub.name)}" placeholder="Например: Сады Селунэ">
                </div>
                <div class="form-row">
                    <label>Тип</label>
                    <select id="s-type">${typeOptions}</select>
                </div>
                <div class="form-row">
                    <label>Краткое описание</label>
                    <input type="text" id="s-short" value="${escapeHtml(sub.short)}" placeholder="Одно предложение">
                </div>
                <div class="form-row">
                    <label>Полное описание</label>
                    <textarea id="s-description">${escapeHtml(sub.description)}</textarea>
                </div>
                <div class="form-row">
                    <label>Картинка (URL или загрузка)</label>
                    <input type="text" id="s-image" value="${escapeHtml(sub.image || '')}" placeholder="https://...">
                    <input type="file" id="s-file" accept="image/*" style="margin-top:8px; font-size:14px;">
                </div>
                <div class="form-actions">
                    ${!isNew ? `<button class="form-btn danger" id="s-delete">🗑 Удалить</button>` : ''}
                    <button class="form-btn secondary" onclick="closeModal()">Отмена</button>
                    <button class="form-btn primary" id="s-save">💾 Сохранить</button>
                </div>
            </div>
        </div>
    `);

    const modal = document.getElementById('modalContent');
    const fImage = modal.querySelector('#s-image');
    const sFile = modal.querySelector('#s-file');

    if (sFile) {
        sFile.onchange = async () => {
            const file = sFile.files[0];
            if (!file) return;
            if (file.size > 2 * 1024 * 1024) { alert('Файл больше 2 МБ'); return; }
            setStatus('loading', 'Загрузка...');
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
                    setStatus('ok', 'Загружено');
                } catch (err) {
                    alert('Ошибка: ' + err.message);
                    setStatus('error', 'Ошибка');
                }
            };
            reader.readAsDataURL(file);
        };
    }

    modal.querySelector('#s-save').onclick = async () => {
        const name = modal.querySelector('#s-name').value.trim();
        if (!name) { alert('Введите название'); return; }

        sub.name = name;
        sub.type = modal.querySelector('#s-type').value;
        sub.short = modal.querySelector('#s-short').value.trim();
        sub.description = modal.querySelector('#s-description').value.trim();
        sub.image = fImage.value.trim();

        if (isNew) locations.push(sub);
        else {
            const idx = locations.findIndex(l => l.id === sub.id);
            if (idx >= 0) locations[idx] = sub;
        }

        const ok = await saveLocations();
        if (ok) {
            closeModal();
            renderMarkers();
            const parent = findById(sub.parentId);
            if (parent) setTimeout(() => openLocationEditor(parent, false, 'sub'), 200);
        }
    };

    if (!isNew) {
        modal.querySelector('#s-delete').onclick = async () => {
            if (!confirm('Удалить "' + sub.name + '"?')) return;
            locations = locations.filter(l => l.id !== sub.id);
            const ok = await saveLocations();
            if (ok) {
                closeModal();
                renderMarkers();
                const parent = findById(sub.parentId);
                if (parent) setTimeout(() => openLocationEditor(parent, false, 'sub'), 200);
            }
        };
    }

    if (isNew) setTimeout(() => modal.querySelector('#s-name').focus(), 100);
}

async function deleteSublocation(id) {
    const sub = findById(id);
    if (!sub) return;
    if (!confirm('Удалить "' + sub.name + '"?')) return;
    locations = locations.filter(l => l.id !== id);
    const ok = await saveLocations();
    if (ok) {
        renderMarkers();
        const parent = findById(sub.parentId);
        if (parent) openLocationEditor(parent, false, 'sub');
    }
}

// ============================================================
//  ФРАКЦИИ
// ============================================================
function openFactionsLibrary() {
    const factions = locations.filter(l => l.kind === 'faction');

    let html = '';
    if (!factions.length) {
        html = `<div class="empty-state"><span class="empty-icon">⚔️</span>Фракций пока нет.</div>`;
    } else {
        html = '<div class="items-list">';
        factions.forEach(fac => {
            const info = getTypeInfo(fac);
            const bases = getFactionBases(fac);
            const basesText = bases.length
                ? bases.map(b => escapeHtml(b.name)).join(', ')
                : 'Нет привязки';
            const actions = isEditing ? `
                <div class="item-actions">
                    <button class="item-action-btn" onclick="event.stopPropagation(); openFactionEditor(findById('${fac.id}'))" title="Редактировать">✎</button>
                    <button class="item-action-btn danger" onclick="event.stopPropagation(); deleteFaction('${fac.id}')" title="Удалить">✕</button>
                </div>` : '';
            const handler = isEditing ? `openFactionEditor(findById('${fac.id}'))` : `openLocationViewer(findById('${fac.id}'))`;
            html += `
                <div class="item-card" onclick="${handler}">
                    <div class="item-icon">${info.icon}</div>
                    <div class="item-content">
                        <div class="item-name">${escapeHtml(fac.name)}</div>
                        <div class="item-subtitle">${info.label}</div>
                        <div class="item-short">${basesText}</div>
                    </div>
                    ${actions || '<div class="item-arrow" style="color:var(--ink-muted);font-size:18px;align-self:center;">›</div>'}
                </div>`;
        });
        html += '</div>';
    }

    if (isEditing) {
        html += `<button class="add-item-btn" onclick="createNewFaction()">＋ Создать фракцию</button>`;
    }

    setModal(`
        <div class="modal-header">
            <div class="modal-title-block">
                <div class="modal-type">⚔️ Справочник</div>
                <div class="modal-title">Фракции</div>
            </div>
            <button class="modal-close" onclick="closeModal()">✕</button>
        </div>
        <div class="modal-body">
            <div class="tab-panel active">${html}</div>
        </div>
    `);
}

function createNewFaction() {
    const newFac = {
        id: genId(),
        name: '',
        kind: 'faction',
        type: 'guild',
        short: '', description: '', image: '',
        leader: '', members: '', goals: '',
        bases: []
    };
    openFactionEditor(newFac, true);
}

function createNewFactionIn(locId) {
    const newFac = {
        id: genId(),
        name: '',
        kind: 'faction',
        type: 'guild',
        short: '', description: '', image: '',
        leader: '', members: '', goals: '',
        bases: [locId]
    };
    openFactionEditor(newFac, true, locId);
}

async function deleteFaction(id) {
    const fac = findById(id);
    if (!fac) return;
    if (!confirm('Удалить фракцию "' + fac.name + '"?')) return;
    locations = locations.filter(l => l.id !== id);
    const ok = await saveLocations();
    if (ok) {
        renderMarkers();
        openFactionsLibrary();
    }
}

function openFactionEditor(fac, isNew = false, backToLocId = null) {
    const info = getTypeInfo(fac);
    const typeOptions = Object.entries(CONFIG.FACTION_TYPES).map(([key, inf]) =>
        `<option value="${key}" ${fac.type === key ? 'selected' : ''}>${inf.icon} ${inf.label}</option>`
    ).join('');

    const allLocs = locations.filter(l => l.kind === 'location');
    const basesList = (fac.bases || []).map(id => findById(id)).filter(Boolean);

    let basesHtml = '';
    if (basesList.length) {
        basesHtml = basesList.map(b => {
            const bInfo = getTypeInfo(b);
            const removeBtn = isEditing ? `<span class="remove-link" onclick="event.stopPropagation(); removeFactionBase('${fac.id}', '${b.id}')">✕</span>` : '';
            return `<span class="modal-link-btn" style="${isEditing ? '' : 'cursor:pointer;'}" onclick="${isEditing ? '' : `closeModal(); openLocationViewer(findById('${b.id}'))`}">${bInfo.icon} ${escapeHtml(b.name)} ${removeBtn}</span>`;
        }).join('');
    } else {
        basesHtml = '<span style="color: var(--ink-muted); font-style: italic; font-size: 14px;">Нет привязки к локациям</span>';
    }

    let addBaseSelect = '';
    if (isEditing) {
        const available = allLocs.filter(l => !(fac.bases || []).includes(l.id));
        if (available.length) {
            const opts = available.map(l => {
                const inf = getTypeInfo(l);
                return `<option value="${l.id}">${inf.icon} ${escapeHtml(l.name)}</option>`;
            }).join('');
            addBaseSelect = `
                <select id="f-add-base" style="margin-top:8px;">
                    <option value="">— Добавить локацию, где базируется —</option>
                    ${opts}
                </select>`;
        }
    }

    setModal(`
        <div class="modal-header">
            <div class="modal-title-block">
                <div class="modal-type">${isNew ? '➕ Новая фракция' : '✏️ ' + info.label}</div>
                <div class="modal-title">${isNew ? 'Создать' : escapeHtml(fac.name)}</div>
            </div>
            <button class="modal-close" onclick="closeModal()">✕</button>
        </div>
        <div class="modal-body">
            <div class="tab-panel active">
                <div class="form-row">
                    <label>Название</label>
                    <input type="text" id="fac-name" value="${escapeHtml(fac.name)}" placeholder="Например: Круг Небесных Тел" ${!isEditing ? 'readonly' : ''}>
                </div>
                <div class="form-row">
                    <label>Тип фракции</label>
                    <select id="fac-type" ${!isEditing ? 'disabled' : ''}>${typeOptions}</select>
                </div>
                <div class="form-row">
                    <label>Краткое описание</label>
                    <input type="text" id="fac-short" value="${escapeHtml(fac.short)}" placeholder="Одно предложение" ${!isEditing ? 'readonly' : ''}>
                </div>
                <div class="form-row">
                    <label>Полное описание</label>
                    <textarea id="fac-description" ${!isEditing ? 'readonly' : ''}>${escapeHtml(fac.description)}</textarea>
                </div>
                <div class="form-row">
                    <label>Руководитель</label>
                    <input type="text" id="fac-leader" value="${escapeHtml(fac.leader || '')}" placeholder="Например: Сэр Морис" ${!isEditing ? 'readonly' : ''}>
                </div>
                <div class="form-row">
                    <label>Состав / численность</label>
                    <input type="text" id="fac-members" value="${escapeHtml(fac.members || '')}" placeholder="Например: ~200 рыцарей" ${!isEditing ? 'readonly' : ''}>
                </div>
                <div class="form-row">
                    <label>Цели</label>
                    <input type="text" id="fac-goals" value="${escapeHtml(fac.goals || '')}" placeholder="Например: охранять паломников" ${!isEditing ? 'readonly' : ''}>
                </div>
                <div class="form-row">
                    <label>Картинка (URL или загрузка)</label>
                    <input type="text" id="fac-image" value="${escapeHtml(fac.image || '')}" placeholder="https://..." ${!isEditing ? 'readonly' : ''}>
                    ${isEditing ? `<input type="file" id="fac-file" accept="image/*" style="margin-top:8px; font-size:14px;">` : ''}
                </div>
                <div class="form-row">
                    <label>Где базируется</label>
                    <div style="display:flex; flex-wrap:wrap; gap:6px;">${basesHtml}</div>
                    ${addBaseSelect}
                </div>
                ${isEditing ? `<div class="form-actions">
                    ${!isNew ? `<button class="form-btn danger" id="fac-delete">🗑 Удалить</button>` : ''}
                    <button class="form-btn secondary" onclick="closeModal()">Отмена</button>
                    <button class="form-btn primary" id="fac-save">💾 Сохранить</button>
                </div>` : `<div class="form-actions"><button class="form-btn secondary" onclick="closeModal()">Закрыть</button></div>`}
            </div>
        </div>
    `);

    const modal = document.getElementById('modalContent');
    const facImage = modal.querySelector('#fac-image');
    const facFile = modal.querySelector('#fac-file');

    if (facFile && facImage) {
        facFile.onchange = async () => {
            const file = facFile.files[0];
            if (!file) return;
            if (file.size > 2 * 1024 * 1024) { alert('Файл больше 2 МБ'); return; }
            setStatus('loading', 'Загрузка...');
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
                    facImage.value = data.url;
                    setStatus('ok', 'Загружено');
                } catch (err) {
                    alert('Ошибка: ' + err.message);
                    setStatus('error', 'Ошибка');
                }
            };
            reader.readAsDataURL(file);
        };
    }

    const addBaseSelect2 = modal.querySelector('#f-add-base');
    if (addBaseSelect2) {
        addBaseSelect2.onchange = async () => {
            const id = addBaseSelect2.value;
            if (!id) return;
            if (!fac.bases) fac.bases = [];
            if (!fac.bases.includes(id)) {
                fac.bases.push(id);
                await saveLocations();
                openFactionEditor(fac, false, backToLocId);
            }
        };
    }

    const saveBtn = modal.querySelector('#fac-save');
    if (saveBtn) {
        saveBtn.onclick = async () => {
            const name = modal.querySelector('#fac-name').value.trim();
            if (!name) { alert('Введите название'); return; }

            fac.name = name;
            fac.type = modal.querySelector('#fac-type').value;
            fac.short = modal.querySelector('#fac-short').value.trim();
            fac.description = modal.querySelector('#fac-description').value.trim();
            fac.leader = modal.querySelector('#fac-leader').value.trim();
            fac.members = modal.querySelector('#fac-members').value.trim();
            fac.goals = modal.querySelector('#fac-goals').value.trim();
            fac.image = facImage.value.trim();

            if (isNew) locations.push(fac);
            else {
                const idx = locations.findIndex(l => l.id === fac.id);
                if (idx >= 0) locations[idx] = fac;
            }

            const ok = await saveLocations();
            if (ok) {
                closeModal();
                renderMarkers();
                if (backToLocId) {
                    const backLoc = findById(backToLocId);
                    if (backLoc) setTimeout(() => openLocationEditor(backLoc, false, 'fac'), 200);
                }
            }
        };
    }

    const delBtn = modal.querySelector('#fac-delete');
    if (delBtn) {
        delBtn.onclick = async () => {
            if (!confirm('Удалить "' + fac.name + '"?')) return;
            locations = locations.filter(l => l.id !== fac.id);
            const ok = await saveLocations();
            if (ok) {
                closeModal();
                renderMarkers();
                if (backToLocId) {
                    const backLoc = findById(backToLocId);
                    if (backLoc) setTimeout(() => openLocationEditor(backLoc, false, 'fac'), 200);
                }
            }
        };
    }

    if (isNew) setTimeout(() => modal.querySelector('#fac-name').focus(), 100);
}

async function removeFactionBase(facId, locId) {
    const fac = findById(facId);
    if (!fac || !fac.bases) return;
    fac.bases = fac.bases.filter(id => id !== locId);
    const ok = await saveLocations();
    if (ok) openFactionEditor(fac, false);
}

async function unlinkFaction(facId, locId) {
    await removeFactionBase(facId, locId);
}

function showAttachFactionDialog(locId) {
    const loc = findById(locId);
    if (!loc) return;
    const currentFacs = getFactionsAt(locId);
    const available = locations.filter(l => l.kind === 'faction' && !currentFacs.some(f => f.id === l.id));

    if (!available.length) {
        alert('Нет непривязанных фракций. Создайте новую.');
        return;
    }

    const opts = available.map(f => {
        const inf = getTypeInfo(f);
        return `<option value="${f.id}">${inf.icon} ${escapeHtml(f.name)}</option>`;
    }).join('');

    setModal(`
        <div class="modal-header">
            <div class="modal-title-block">
                <div class="modal-type">🔗 Привязка</div>
                <div class="modal-title">Привязать к «${escapeHtml(loc.name)}»</div>
            </div>
            <button class="modal-close" onclick="closeModal()">✕</button>
        </div>
        <div class="modal-body">
            <div class="tab-panel active">
                <div class="form-row">
                    <label>Выберите фракцию</label>
                    <select id="attach-select">
                        <option value="">— Выберите —</option>
                        ${opts}
                    </select>
                </div>
                <div class="form-actions">
                    <button class="form-btn secondary" onclick="openLocationEditor(findById('${locId}'), false, 'fac')">Отмена</button>
                    <button class="form-btn primary" id="attach-save">Привязать</button>
                </div>
            </div>
        </div>
    `);

    const modal = document.getElementById('modalContent');
    modal.querySelector('#attach-save').onclick = async () => {
        const facId = modal.querySelector('#attach-select').value;
        if (!facId) { alert('Выберите фракцию'); return; }
        const fac = findById(facId);
        if (!fac) return;
        if (!fac.bases) fac.bases = [];
        if (!fac.bases.includes(locId)) fac.bases.push(locId);
        const ok = await saveLocations();
        if (ok) openLocationEditor(loc, false, 'fac');
    };
}

async function unlinkLocation(locId, otherId) {
    const loc = findById(locId);
    if (!loc) return;
    loc.links = (loc.links || []).filter(id => id !== otherId);
    const other = findById(otherId);
    if (other) other.links = (other.links || []).filter(id => id !== locId);
    const ok = await saveLocations();
    if (ok) openLocationEditor(loc, false, 'links');
}

// Делегирование для добавления связи
document.addEventListener('change', async (e) => {
    if (e.target && e.target.id === 'f-add-link') {
        const targetId = e.target.value;
        const sourceLocId = e.target.getAttribute('data-loc-id');
        if (!targetId || !sourceLocId) return;
        const sourceLoc = findById(sourceLocId);
        const targetLoc = findById(targetId);
        if (!sourceLoc || !targetLoc) return;

        sourceLoc.links = sourceLoc.links || [];
        targetLoc.links = targetLoc.links || [];
        if (!sourceLoc.links.includes(targetId)) sourceLoc.links.push(targetId);
        if (!targetLoc.links.includes(sourceLocId)) targetLoc.links.push(sourceLocId);

        const ok = await saveLocations();
        if (ok) openLocationEditor(sourceLoc, false, 'links');
    }
});

// ============================================================
//  PIN
// ============================================================
function openPinModal() {
    let pin = '';
    setModal(`
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
    `);

    const overlay = document.getElementById('modalOverlay');
    const modal = document.getElementById('modalContent');
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
//  РЕЖИМ РЕДАКТОРА
// ============================================================
function enableEditMode() {
    isEditing = true;
    document.body.classList.add('editing');
    const editBtn = document.getElementById('editBtn');
    if (editBtn) {
        editBtn.classList.add('active');
        editBtn.textContent = '✅ Выйти из редактора';
    }
    renderMarkers();
    setStatus('ok', 'Режим редактирования');
}
function disableEditMode() {
    isEditing = false;
    document.body.classList.remove('editing');
    const editBtn = document.getElementById('editBtn');
    if (editBtn) {
        editBtn.classList.remove('active');
        editBtn.textContent = '✏️ Редактировать';
    }
    renderMarkers();
    setStatus('ok', 'Просмотр');
}

function onMapClick(e) {
    if (!isEditing) return;
    if (e.originalEvent && e.originalEvent._dragged) return;

    const coords = leafletToImage(e.latlng);
    const newLoc = {
        id: genId(),
        name: '',
        kind: 'location',
        parentId: null,
        type: 'city',
        x: coords.x, y: coords.y,
        short: '', description: '', image: '', links: []
    };
    openLocationEditor(newLoc, true);
}

// ============================================================
//  КНОПКИ
// ============================================================
const editBtn = document.getElementById('editBtn');
if (editBtn) {
    editBtn.onclick = () => {
        if (isEditing) disableEditMode();
        else {
            const savedPin = sessionStorage.getItem(CONFIG.STORAGE_PIN);
            if (savedPin) { currentPin = savedPin; enableEditMode(); }
            else openPinModal();
        }
    };
}

const resetBtn = document.getElementById('resetViewBtn');
if (resetBtn) {
    resetBtn.onclick = () => applyStartView(true);
}

const facBtn = document.getElementById('factionsBtn');
if (facBtn) {
    facBtn.onclick = () => openFactionsLibrary();
}

const overlayEl = document.getElementById('modalOverlay');
if (overlayEl) {
    overlayEl.onclick = (e) => {
        if (e.target.id === 'modalOverlay') closeModal();
    };
}

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
    loadLocations();
})();