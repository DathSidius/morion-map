// ============================================================
//  КОНФИГУРАЦИЯ КАРТЫ МОРРИОНА
// ============================================================

window.MORION_CONFIG = {

    IMAGE_WIDTH: 18432,
    IMAGE_HEIGHT: 12288,
    TILE_SIZE: 256,

    TILES_PATH: 'tiles/{z}/{x}/{y}.png',
    MAX_NATIVE_ZOOM: 6,

    START_X_PERCENT: 50,
    START_Y_PERCENT: 50,
    START_ZOOM: 4,

    API_LOCATIONS: '/api/locations',
    API_UPLOAD: '/api/upload',
    STORAGE_PIN: 'morion_pin',

    // ============================================================
    //  ЗУМ-СЛОИ
    // ============================================================
    // При каком зуме появляется каждый ТИП объекта.
    // Можно переопределить на конкретном объекте полем minZoomOverride.
    //
    //   0 — видно всегда (регионы, моря, столицы)
    //   2 — крупные города
    //   3 — крепости, порты
    //   4 — мелкие объекты, врата
    //   5 — деревни, руины
    // ============================================================

    KIND_INFO: {
        location:    { icon: '📍', label: 'Локация на карте' },
        sublocation: { icon: '🏛', label: 'Подлокация' },
        faction:     { icon: '⚔️', label: 'Фракция' }
    },

    LOCATION_TYPES: {
        region:   { icon: '📜', label: 'Регион',       css: 'marker-region',   minZoom: 0 },
        sea:      { icon: '🌊', label: 'Море',         css: 'marker-sea',      minZoom: 0 },
        forest:   { icon: '🌲', label: 'Лес',          css: 'marker-region',   minZoom: 0 },
        mountain: { icon: '⛰️', label: 'Гора',         css: 'marker-region',   minZoom: 0 },
        capital:  { icon: '🏰', label: 'Столица',      css: 'marker-capital',  minZoom: 0 },
        dark:     { icon: '💀', label: 'Тёмное место', css: 'marker-dark',     minZoom: 2 },
        city:     { icon: '🏘️', label: 'Город',        css: '',                minZoom: 2 },
        fortress: { icon: '⚔️', label: 'Крепость',     css: '',                minZoom: 3 },
        port:     { icon: '⚓', label: 'Порт',         css: '',                minZoom: 3 },
        gate:     { icon: '🚪', label: 'Врата',        css: '',                minZoom: 4 },
        village:  { icon: '🛖', label: 'Деревня',      css: '',                minZoom: 5 }
    },

    SUBLOCATION_TYPES: {
        district:  { icon: '🏛', label: 'Район' },
        building:  { icon: '🏰', label: 'Здание' },
        temple:    { icon: '⛪', label: 'Храм' },
        market:    { icon: '🏪', label: 'Рынок' },
        arena:     { icon: '🏟️', label: 'Арена' },
        tavern:    { icon: '🍺', label: 'Таверна' },
        academy:   { icon: '📚', label: 'Академия' },
        ruins:     { icon: '🏚️', label: 'Руины' },
        dungeon:   { icon: '🗝️', label: 'Подземелье' },
        landmark:  { icon: '🗿', label: 'Достопримечательность' }
    },

    FACTION_TYPES: {
        guild:      { icon: '⚒️', label: 'Гильдия' },
        order:      { icon: '⚔️', label: 'Орден' },
        cult:       { icon: '🔮', label: 'Культ' },
        house:      { icon: '👑', label: 'Дом / Династия' },
        secret:     { icon: '🎭', label: 'Тайное общество' },
        trade:      { icon: '💰', label: 'Торговый дом' },
        band:       { icon: '🗡️', label: 'Банда' },
        fleet:      { icon: '⛵', label: 'Флот' },
        mages:      { icon: '✨', label: 'Магический круг' },
        church:     { icon: '📿', label: 'Церковь' },
        academy:    { icon: '🎓', label: 'Академия' },
        rebels:     { icon: '🔥', label: 'Мятежники' }
    }
};