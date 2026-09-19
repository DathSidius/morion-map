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
    //  СПРАЙТ ИКОНОК
    // ============================================================
    // Путь к файлу со спрайтом
    SPRITE_URL: 'icons.png',
    // Сколько колонок и рядов в спрайте
    SPRITE_COLS: 7,
    SPRITE_ROWS: 5,

    KIND_INFO: {
        location:    { icon: '📍', label: 'Локация на карте' },
        sublocation: { icon: '🏛', label: 'Подлокация' },
        faction:     { icon: '⚔️', label: 'Фракция' }
    },

    // ============================================================
    //  ТИПЫ ЛОКАЦИЙ
    // ============================================================
    // sprite: { col: индекс_колонки_0_до_6, row: индекс_ряда_0_до_4 }
    //   если sprite нет — используется emoji (icon)
    // ============================================================
    LOCATION_TYPES: {
        capital:  { emoji: '🏰', label: 'Столица',      css: 'marker-capital', sprite: { col: 1, row: 0 } },
        city:     { emoji: '🏘️', label: 'Город',        css: '',               sprite: { col: 1, row: 1 } },
        fortress: { emoji: '⚔️', label: 'Крепость',     css: '',               sprite: { col: 3, row: 2 } },
        village:  { emoji: '🛖', label: 'Деревня',      css: '',               sprite: { col: 2, row: 4 } },
        port:     { emoji: '⚓', label: 'Порт',         css: '',               sprite: { col: 4, row: 1 } },
        region:   { emoji: '📜', label: 'Регион',       css: 'marker-region',  sprite: { col: 2, row: 2 } },
        sea:      { emoji: '🌊', label: 'Море',         css: 'marker-sea' },
        forest:   { emoji: '🌲', label: 'Лес',          css: 'marker-region' },
        mountain: { emoji: '⛰️', label: 'Гора',         css: 'marker-region' },
        dark:     { emoji: '💀', label: 'Тёмное место', css: 'marker-dark',    sprite: { col: 0, row: 2 } },
        gate:     { emoji: '🚪', label: 'Врата',        css: '',               sprite: { col: 5, row: 2 } }
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