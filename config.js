// ============================================================
//  КОНФИГУРАЦИЯ КАРТЫ МОРРИОНА
//  Все настройки в одном месте. Меняйте только этот файл,
//  чтобы изменить поведение карты.
// ============================================================

window.MORION_CONFIG = {

    // === РАЗМЕРЫ ОРИГИНАЛЬНОЙ КАРТЫ (в пикселях) ===
    IMAGE_WIDTH: 18432,
    IMAGE_HEIGHT: 12288,
    TILE_SIZE: 256,

    // === ПУТЬ К НАРЕЗАННЫМ ТАЙЛАМ ===
    TILES_PATH: 'tiles/{z}/{x}/{y}.png',
    MAX_NATIVE_ZOOM: 6,   // сколько уровней нарезал gdal2tiles (0..6)

    // === СТАРТОВЫЙ ВИД ===
    // Центр в ПРОЦЕНТАХ от левого-верхнего угла карты:
    //   X: 0 = левый край, 100 = правый
    //   Y: 0 = верхний край, 100 = нижний
    START_X_PERCENT: 50,
    START_Y_PERCENT: 50,

    // Стартовый зум. Больше = крупнее.
    //   2 — видна почти вся карта
    //   3 — виден центр
    //   4 — крупный план Тирона
    //   5 — очень крупно
    START_ZOOM: 4,

    // === API (Cloudflare Pages Functions) ===
    API_LOCATIONS: '/api/locations',
    API_UPLOAD: '/api/upload',

    // === ХРАНИЛИЩЕ PIN В БРАУЗЕРЕ ===
    STORAGE_PIN: 'morion_pin',

    // === ТИПЫ ЛОКАЦИЙ ===
    TYPE_INFO: {
        capital:  { icon: '🏰', label: 'Столица',      css: 'marker-capital' },
        city:     { icon: '🏘️', label: 'Город',        css: '' },
        fortress: { icon: '⚔️', label: 'Крепость',     css: '' },
        village:  { icon: '🛖', label: 'Деревня',      css: '' },
        port:     { icon: '⚓', label: 'Порт',         css: '' },
        region:   { icon: '📜', label: 'Регион',       css: 'marker-region' },
        sea:      { icon: '🌊', label: 'Море',         css: 'marker-sea' },
        forest:   { icon: '🌲', label: 'Лес',          css: 'marker-region' },
        mountain: { icon: '⛰️', label: 'Гора',         css: 'marker-region' },
        dark:     { icon: '💀', label: 'Тёмное место', css: 'marker-dark' },
        gate:     { icon: '🚪', label: 'Врата',        css: '' }
    }
};