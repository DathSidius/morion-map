/* ============================================================
   ЛОГИКА КАРТЫ МОРРИОНА — ЧАСТЬ 2 (подлокации, фракции, PIN, старт)
   ============================================================ */

/* ============================================================
   ПОДЛОКАЦИИ
   ============================================================ */
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

function openSublocationEditor(sub, isNew) {
    if (isNew === undefined) isNew = false;
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
            if (!confirm('Удалить ' + sub.name + '?')) return;
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
    if (!confirm('Удалить ' + sub.name + '?')) return;
    locations = locations.filter(l => l.id !== id);
    const ok = await saveLocations();
    if (ok) {
        renderMarkers();
        const parent = findById(sub.parentId);
        if (parent) openLocationEditor(parent, false, 'sub');
    }
}

/* ============================================================
   ФРАКЦИИ
   ============================================================ */
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
    if (!confirm('Удалить фракцию ' + fac.name + '?')) return;
    locations = locations.filter(l => l.id !== id);
    const ok = await saveLocations();
    if (ok) {
        renderMarkers();
        openFactionsLibrary();
    }
}

function openFactionEditor(fac, isNew, backToLocId) {
    if (isNew === undefined) isNew = false;
    if (backToLocId === undefined) backToLocId = null;
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
        basesHtml = '<span style="color:var(--ink-muted); font-style:italic; font-size:14px;">Нет привязки к локациям</span>';
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

    const addBaseSelectEl = modal.querySelector('#f-add-base');
    if (addBaseSelectEl) {
        addBaseSelectEl.onchange = async () => {
            const id = addBaseSelectEl.value;
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
            if (!confirm('Удалить ' + fac.name + '?')) return;
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

/* ============================================================
   PIN
   ============================================================ */
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

    function updatePinDisplay(p) {
        modal.querySelectorAll('.pin-digit').forEach((el, i) => {
            el.textContent = p[i] ? '●' : '';
            el.classList.toggle('filled', i < p.length);
        });
    }

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
}

async function verifyPin(pin) {
    try {
        const resp = await fetch(CONFIG.API_LOCATIONS, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pin: pin, locations: null })
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

/* ============================================================
   РЕЖИМ РЕДАКТОРА
   ============================================================ */
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

/* ============================================================
   КНОПКИ
   ============================================================ */
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

/* ============================================================
   СТАРТ
   ============================================================ */
(function() {
    setStatus('loading', 'Загрузка карты...');
    initMap();
    applyStartView(false);
    setTimeout(() => applyStartView(false), 100);
    setTimeout(() => applyStartView(false), 400);
    loadLocations();
})();