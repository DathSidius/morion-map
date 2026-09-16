// ============================================================
//  ЛОГИКА КАРТЫ МОРРИОНА
//  Все настройки — в config.js
// ============================================================

// Забираем конфиг
const CONFIG = window.MORION_CONFIG;
const TYPE_INFO = CONFIG.TYPE_INFO;

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
//  УТИЛИТЫ
// ============================================================
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

    console.log('W=' + W + ' H=' + H + ' ZOOM_LEVEL=' + ZOOM_LEVEL + ' WORLD_W=' + WORLD_W + ' WORLD_H=' + WORLD_H);

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

    console.log('Карта инициализирована.');
}

// ============================================================
//  ЗАГРУЗКА / СОХРАНЕНИЕ ЛОКАЦИЙ
// ============================================================
async function loadLocations() {
    setStatus('loading', 'Загрузка локаций...');
    try {
        const resp = await fetch(CONFIG.API_LOCATIONS);
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        const data = await resp.json();
        locations = data.locations || [];
        renderMarkers();
        setStatus('ok', locations.length + ' локаций');
    } catch (err) {
        console.error('Ошибка загрузки локаций:', err);
        setStatus('error', 'API не отвечает');
        const cached = localStorage.getItem('morion_locations');
        if (cached) {
            try {
                locations = JSON.parse(cached);
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

    locations.forEach(loc => {
        const info = TYPE_INFO[loc.type] || TYPE_INFO.city;
        const latlng = imageToLeaflet(loc.x, loc.y);

        const icon = L.divIcon({
            className: 'custom-marker',
            html: `<div class="marker-icon ${info.css}">${info.icon}</div>`,
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

        if (isEditing) {
            marker.on('dragend', (e) => {
                const pos = e.target.getLatLng();
                const coords = leafletToImage(pos);
                loc.x = coords.x;
                loc.y = coords.y;
                saveLocations();
            });
            marker.on('click', (e) => {
                if (isEditing) {
                    L.DomEvent.stopPropagation(e);
                    openEditModal(loc);
                }
            });
        }

        markers[loc.id] = marker;
    });
}

function buildPopupHtml(loc) {
    const info = TYPE_INFO[loc.type] || TYPE_INFO.city;
    return `
        <div class="popup-header">${info.icon} ${escapeHtml(loc.name)}</div>
        <div class="popup-body"><p>${escapeHtml(loc.short || info.label)}</p></div>
        <button class="popup-btn" data-id="${loc.id}">Подробнее →</button>
    `;
}

// ============================================================
//  МОДАЛКА С ОПИСАНИЕМ
// ============================================================
function openDetailsModal(loc) {
    const info = TYPE_INFO[loc.type] || TYPE_INFO.city;
    const overlay = document.getElementById('modalOverlay');
    const modal = document.getElementById('modalContent');

    let linksHtml = '';
    if (loc.links && loc.links.length) {
        const linkBtns = loc.links.map(id => {
            const target = locations.find(l => l.id === id);
            if (!target) return '';
            return `<button class="modal-link-btn" data-goto="${id}">${escapeHtml(target.name)}</button>`;
        }).filter(Boolean).join('');
        if (linkBtns) {
            linksHtml = `<div class="modal-links"><div class="modal-links-title">Связанные локации</div><div class="modal-links-list">${linkBtns}</div></div>`;
        }
    }

    modal.innerHTML = `
        <div class="modal-header">
            <div class="modal-title-block">
                <div class="modal-type">${info.icon} ${info.label}</div>
                <div class="modal-title">${escapeHtml(loc.name)}</div>
            </div>
            <button class="modal-close" onclick="closeModal()">✕</button>
        </div>
        <div class="modal-body">
            ${loc.image ? `<img class="modal-image" src="${escapeHtml(loc.image)}" alt="${escapeHtml(loc.name)}">` : ''}
            <div class="modal-description">${formatDescription(loc.description || loc.short || '')}</div>
            ${linksHtml}
            ${isEditing ? `<div class="form-actions" style="margin-top:24px;">
                <button class="form-btn secondary" onclick="editFromDetails('${loc.id}')">✏️ Редактировать</button>
            </div>` : ''}
        </div>
    `;

    modal.querySelectorAll('[data-goto]').forEach(btn => {
        btn.onclick = () => {
            const targetId = btn.getAttribute('data-goto');
            const target = locations.find(l => l.id === targetId);
            if (target) { closeModal(); openDetailsModal(target); }
        };
    });

    overlay.classList.add('open');
}

function formatDescription(text) {
    if (!text) return '';
    return escapeHtml(text).replace(/\n/g, '<br>');
}

function closeModal() {
    document.getElementById('modalOverlay').classList.remove('open');
}

function editFromDetails(id) {
    const loc = locations.find(l => l.id === id);
    if (loc) openEditModal(loc);
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
    setStatus('ok', locations.length + ' локаций');
}

function onMapClick(e) {
    if (!isEditing) return;
    if (e.originalEvent && e.originalEvent._dragged) return;

    const coords = leafletToImage(e.latlng);
    const newLoc = {
        id: genId(),
        name: '', type: 'city',
        x: coords.x, y: coords.y,
        short: '', description: '', image: '', links: []
    };
    openEditModal(newLoc, true);
}

// ============================================================
//  ФОРМА РЕДАКТИРОВАНИЯ
// ============================================================
function openEditModal(loc, isNew = false) {
    const overlay = document.getElementById('modalOverlay');
    const modal = document.getElementById('modalContent');

    const typeOptions = Object.entries(TYPE_INFO).map(([key, info]) => 
        `<option value="${key}" ${loc.type === key ? 'selected' : ''}>${info.icon} ${info.label}</option>`
    ).join('');

    const linkOptions = locations
        .filter(l => l.id !== loc.id)
        .map(l => `<option value="${l.id}">${escapeHtml(l.name)}</option>`)
        .join('');

    const currentLinks = (loc.links || []).map(id => {
        const t = locations.find(l => l.id === id);
        if (!t) return '';
        return `<span class="modal-link-btn" data-remove-link="${id}" style="cursor:pointer;">${escapeHtml(t.name)} ✕</span>`;
    }).join('');

    modal.innerHTML = `
        <div class="modal-header">
            <div class="modal-title-block">
                <div class="modal-type">${isNew ? '➕ Новая локация' : '✏️ Редактирование'}</div>
                <div class="modal-title">${isNew ? 'Создать точку' : escapeHtml(loc.name || 'Без названия')}</div>
            </div>
            <button class="modal-close" onclick="closeModal()">✕</button>
        </div>
        <div class="modal-body">
            <div class="form-row">
                <label>Название</label>
                <input type="text" id="f-name" value="${escapeHtml(loc.name)}" placeholder="Например: Тирон">
            </div>
            <div class="form-row">
                <label>Тип локации</label>
                <select id="f-type">${typeOptions}</select>
            </div>
            <div class="form-row">
                <label>Краткое описание (для попапа)</label>
                <input type="text" id="f-short" value="${escapeHtml(loc.short)}" placeholder="Одно предложение">
            </div>
            <div class="form-row">
                <label>Полное описание</label>
                <textarea id="f-description" placeholder="Подробное описание локации...">${escapeHtml(loc.description)}</textarea>
            </div>
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
            const t = locations.find(l => l.id === id);
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

        if (isNew) locations.push(loc);
        else {
            const idx = locations.findIndex(l => l.id === loc.id);
            if (idx >= 0) locations[idx] = loc;
        }

        const ok = await saveLocations();
        if (ok) { closeModal(); renderMarkers(); }
    };

    if (!isNew) {
        modal.querySelector('#f-delete').onclick = async () => {
            if (!confirm('Удалить локацию "' + loc.name + '"?')) return;
            locations = locations.filter(l => l.id !== loc.id);
            locations.forEach(l => { if (l.links) l.links = l.links.filter(id => id !== loc.id); });
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

    // Применяем вид несколько раз — гарантированно после измерения контейнера
    applyStartView(false);
    setTimeout(() => applyStartView(false), 100);
    setTimeout(() => applyStartView(false), 400);
    setTimeout(() => applyStartView(false), 1000);

    loadLocations();
})();