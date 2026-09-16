// ============================================================
//  КОНФИГУРАЦИЯ КАРТЫ МОРРИОНА
// ============================================================

window.MORION_CONFIG = {

    // === РАЗМЕРЫ ОРИГИНАЛЬНОЙ КАРТЫ (в пикселях) ===
    IMAGE_WIDTH: 18432,
    IMAGE_HEIGHT: 12288,
    TILE_SIZE: 256,

    // === ПУТЬ К НАРЕЗАННЫМ ТАЙЛАМ ===
    TILES_PATH: 'tiles/{z}/{x}/{y}.png',
    MAX_NATIVE_ZOOM: 6,

    // === СТАРТОВЫЙ ВИД ===
    START_X_PERCENT: 50,
    START_Y_PERCENT: 50,
    START_ZOOM: 4,

    // === API ===
    API_LOCATIONS: '/api/locations',
    API_UPLOAD: '/api/upload',
    STORAGE_PIN: 'morion_pin',

    // ============================================================
    //  ТИПЫ ЗАПИСЕЙ
    // ============================================================
    KIND_INFO: {
        location:    { icon: '📍', label: 'Локация на карте' },
        sublocation: { icon: '🏛', label: 'Подлокация (внутри локации)' },
        faction:     { icon: '⚔️', label: 'Фракция' }
    },

    // ============================================================
    //  ТИПЫ ЛОКАЦИЙ (для kind = 'location')
    // ============================================================
    LOCATION_TYPES: {
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
    },

    // ============================================================
    //  ТИПЫ ПОДЛОКАЦИЙ (для kind = 'sublocation')
    // ============================================================
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

    // ============================================================
    //  ТИПЫ ФРАКЦИЙ (для kind = 'faction')
    // ============================================================
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
