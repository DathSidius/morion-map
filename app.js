/* ============================================================
   ЛОГИКА КАРТЫ МОРРИОНА — ЧАСТЬ 1
   ============================================================ */

const CONFIG = window.MORION_CONFIG;

const ZOOM_LEVEL = Math.ceil(Math.log2(Math.max(CONFIG.IMAGE_WIDTH, CONFIG.IMAGE_HEIGHT) / CONFIG.TILE_SIZE));
const WORLD_W = CONFIG.IMAGE_WIDTH * Math.pow(2, ZOOM_LEVEL);
const WORLD_H = CONFIG.IMAGE_HEIGHT * Math.pow(2, ZOOM_LEVEL);

let map;
let locations = [];
let markers = {};
let isEditing = false;
let currentPin = '';

/* ===== УТИЛИТЫ ===== */
function setStatus(state, text) {
    const bar = document.getElementById('statusBar');
    if (!bar) return;
    bar.className = 'status-bar ' + state;
    const st = document.getElementById('statusText');
    if (st) st.textContent = text;
}

function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, m => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
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

/* ===== ПОСТРОЕНИЕ HTML МАРКЕРА ===== */
function buildMarkerHtml(info) {
    const css = info.css || '';
    const emoji = info.emoji || info.icon || '';

    if (info.image) {
        return `<div class="marker-icon ${css}"><img src="${info.image}" alt="" draggable="false" onerror="this.style.display='none'; this.parentNode.textContent='${emoji}';"></div>`;
    }
    return `<div class="marker-icon ${css}">${emoji}</div>`;
}

/* ===== КАРТА ===== */
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

/* ===== ЗАГРУЗКА / СОХРАНЕНИЕ ===== */
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
            } catch (e) {}
        }
    }
}

async function saveLocations() {
    if (!currentPin) { alert('Сначала введите PIN'); return false; }
    setStatus('loading', 'Сохранение...');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
        const resp = await fetch(CONFIG.API_LOCATIONS, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pin: currentPin, locations: locations }),
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || 'HTTP ' + resp.status);

        localStorage.setItem('morion_locations', JSON.stringify(locations));
        setStatus('ok', 'Сохранено');
        return true;
    } catch (err) {
        clearTimeout(timeoutId);
        console.error(err);
        if (err.name === 'AbortError') {
            setStatus('error', 'Таймаут: сервер не ответил');
            alert('Сервер не ответил за 15 секунд. Проверь API.');
        } else {
            setStatus('error', 'Ошибка сохранения');
            alert('Ошибка: ' + err.message);
        }
        return false;
    }
}

/* ===== МАРКЕРЫ ===== */
function renderMarkers() {
    Object.values(markers).forEach(m => map.removeLayer(m));
    markers = {};

    locations.filter(l => l.kind === 'location').forEach(loc => {
        const info = getTypeInfo(loc);
        const latlng = imageToLeaflet(loc.x, loc.y);

        const icon = L.divIcon({
            className: 'custom-marker',
            html: buildMarkerHtml(info),
            iconSize: [44, 44],
            iconAnchor: [22, 44],
            popupAnchor: [0, -40]
        });

        const marker = L.marker(latlng, { icon: icon, draggable: isEditing }).addTo(map);
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

    if (typeof renderSidebarList === 'function') renderSidebarList();
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

/* ===== МОДАЛКА ===== */
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
            const panel = modal.querySelector('[data-panel="' + target + '"]');
            if (panel) panel.classList.add('active');
        };
    });
}

function formatDescription(text) {
    if (!text) return '';
    return escapeHtml(text).replace(/\n/g, '<br>');
}

/* ===== ПРОСМОТР ЛОКАЦИИ ===== */
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

/* ===== РЕДАКТОР ЛОКАЦИИ ===== */
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
            <div class="tab-panel ${(activeTab === 'desc' || isNew) ? 'active' : ''}" data-panel="desc">${renderDescPanel(loc, true, isNew)}</div>
            ${!isNew ? `<div class="tab-panel ${activeTab === 'sub' ? 'active' : ''}" data-panel="sub">${renderSubPanel(loc, true)}</div>` : ''}
            ${!isNew ? `<div class="tab-panel ${activeTab === 'fac' ? 'active' : ''}" data-panel="fac">${renderFacPanel(loc, true)}</div>` : ''}
            ${!isNew ? `<div class="tab-panel ${activeTab === 'links' ? 'active' : ''}" data-panel="links">${renderLinksPanel(loc, true)}</div>` : ''}
        </div>
    `);
    bindTabs(document.getElementById('modalContent'));
    bindDescPanel(loc, isNew);
}

/* ===== ПАНЕЛИ ===== */
function renderDescPanel(loc, editable, isNew) {
    if (isNew === undefined) isNew = false;
    const isFaction = loc.kind === 'faction';
    let html = '';

    if (editable) {
        const typesDict = loc.kind === 'faction' ? CONFIG.FACTION_TYPES
            : loc.kind === 'sublocation' ? CONFIG.SUBLOCATION_TYPES
            : CONFIG.LOCATION_TYPES;

        const typeOptions = Object.entries(typesDict).map(([key, info]) =>
            `<option value="${key}" ${loc.type === key ? 'selected' : ''}>${info.emoji || info.icon} ${info.label}</option>`
        ).join('');

        html += `
        <div class="form-row">
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
            html += `
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
            </div>`;
        }

        html += `
        <div class="form-row">
            <label>Картинка (URL или загрузка)</label>
            <input type="text" id="f-image" value="${escapeHtml(loc.image || '')}" placeholder="https://... или загрузите файл">
            <input type="file" id="f-file" accept="image/*" style="margin-top:8px; font-size:14px;">
        </div>`;

        html += `
        <div class="form-actions">
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
            let msg = `Удалить ${loc.name}?`;
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
                    ${actions || '<div class="item-arrow" style="color:var(--text-muted);font-size:18px;align-self:center;">›</div>'}
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
                    ${actions || '<div class="item-arrow" style="color:var(--text-muted);font-size:18px;align-self:center;">›</div>'}
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
                    ${actions || '<div class="item-arrow" style="color:var(--text-muted);font-size:18px;align-self:center;">›</div>'}
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