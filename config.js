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

    KIND_INFO: {
        location:    { icon: '📍', label: 'Локация на карте' },
        sublocation: { icon: '🏛', label: 'Подлокация' },
        faction:     { icon: '⚔️', label: 'Фракция' }
    },

    // ============================================================
    //  ТИПЫ ЛОКАЦИЙ — имена совпадают с файлами в icons/
    // ============================================================
    LOCATION_TYPES: {
        capital:  { image: 'icons/capital.png',    emoji: '🏰', label: 'Столица' },
        city:     { image: 'icons/city.png',       emoji: '🏘️', label: 'Город' },
        town:     { image: 'icons/town.png',       emoji: '🏘️', label: 'Городок' },
        fortress: { image: 'icons/fortress.png',   emoji: '⚔️', label: 'Крепость' },
        tower:    { image: 'icons/Tower.png',      emoji: '🗼', label: 'Башня' },
        village:  { image: 'icons/village.png',    emoji: '🛖', label: 'Деревня' },
        hamlet:   { image: 'icons/village.png',    emoji: '🛖', label: 'Хутор' },
        gate:     { image: 'icons/gate.png',       emoji: '🚪', label: 'Врата' },
        port:     { image: 'icons/lighthouse.png', emoji: '⚓', label: 'Порт' },
        ruins:    { image: 'icons/ruins.png',      emoji: '🏚️', label: 'Руины' },
        mountain: { image: 'icons/mountain.png',   emoji: '⛰️', label: 'Гора' },
        forest:   { image: 'icons/forest.png',     emoji: '🌲', label: 'Лес' },
        region:   { image: 'icons/region.png',     emoji: '📜', label: 'Регион' },
        dark:     { image: 'icons/dark.png',       emoji: '💀', label: 'Тёмное место' }
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