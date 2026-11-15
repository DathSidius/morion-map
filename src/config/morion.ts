import type { MapRecord } from '../types/morion.ts';

export interface LocationTypeMeta {
  image: string;
  emoji: string;
  label: string;
  compact?: boolean;
}

export interface SimpleTypeMeta {
  icon: string;
  label: string;
}

export const MORION_CONFIG = {
  IMAGE_WIDTH: 18432,
  IMAGE_HEIGHT: 12288,
  TILE_SIZE: 256,
  TILES_PATH: '/tiles/{z}/{x}/{y}.png',
  MAX_NATIVE_ZOOM: 7,
  START_X_PERCENT: 50,
  START_Y_PERCENT: 50,
  START_ZOOM: 4,
} as const;

export const ZOOM_LEVEL = Math.ceil(
  Math.log2(Math.max(MORION_CONFIG.IMAGE_WIDTH, MORION_CONFIG.IMAGE_HEIGHT) / MORION_CONFIG.TILE_SIZE)
);
export const WORLD_W = MORION_CONFIG.IMAGE_WIDTH / Math.pow(2, ZOOM_LEVEL);
export const WORLD_H = MORION_CONFIG.IMAGE_HEIGHT / Math.pow(2, ZOOM_LEVEL);

export const LOCATION_TYPES: Record<string, LocationTypeMeta> = {
  capital: { image: '/icons/capital.png', emoji: '🏰', label: 'Столица' },
  city: { image: '/icons/city.png', emoji: '🏘️', label: 'Город' },
  town: { image: '/icons/town.png', emoji: '🏘️', label: 'Городок' },
  fortress: { image: '/icons/fortress.png', emoji: '⚔️', label: 'Крепость' },
  tower: { image: '/icons/tower.png', emoji: '🗼', label: 'Башня' },
  village: { image: '/icons/village.png', emoji: '🛖', label: 'Деревня' },
  village_dock: { image: '/icons/village-dock.png', emoji: '⚓', label: 'Причал' },
  port: { image: '/icons/lighthouse.png', emoji: '🗼', label: 'Маяк / Порт' },
  gate: { image: '/icons/gate.png', emoji: '🚪', label: 'Врата' },
  bridge: { image: '/icons/bridge.png', emoji: '🌉', label: 'Мост' },
  temple: { image: '/icons/temple.png', emoji: '⛪', label: 'Храм' },
  mill: { image: '/icons/mill.png', emoji: '🌾', label: 'Мельница' },
  waterwheel: { image: '/icons/waterWheel.png', emoji: '⚙️', label: 'Водяная мельница' },
  mine: { image: '/icons/mine.png', emoji: '⛏️', label: 'Шахта' },
  camp: { image: '/icons/tent.png', emoji: '⛺', label: 'Лагерь' },
  graveyard: { image: '/icons/graveyard.png', emoji: '🪦', label: 'Кладбище', compact: true },
  ruins: { image: '/icons/ruins.png', emoji: '🏚️', label: 'Руины' },
  mountain: { image: '/icons/mountain.png', emoji: '⛰️', label: 'Гора', compact: true },
  forest: { image: '/icons/forest.png', emoji: '🌲', label: 'Лес', compact: true },
  region: { image: '/icons/region.png', emoji: '📜', label: 'Регион', compact: true },
  dark: { image: '/icons/dark.png', emoji: '💀', label: 'Тёмное место' },
};

export const SUBLOCATION_TYPES: Record<string, SimpleTypeMeta> = {
  district: { icon: '🏛', label: 'Район' },
  building: { icon: '🏰', label: 'Здание' },
  temple: { icon: '⛪', label: 'Храм' },
  market: { icon: '🏪', label: 'Рынок' },
  arena: { icon: '🏟️', label: 'Арена' },
  tavern: { icon: '🍺', label: 'Таверна' },
  academy: { icon: '📚', label: 'Академия' },
  ruins: { icon: '🏚️', label: 'Руины' },
  dungeon: { icon: '🗝️', label: 'Подземелье' },
  landmark: { icon: '🗿', label: 'Достопримечательность' },
};

export const FACTION_TYPES: Record<string, SimpleTypeMeta> = {
  guild: { icon: '⚒️', label: 'Гильдия' },
  order: { icon: '⚔️', label: 'Орден' },
  cult: { icon: '🔮', label: 'Культ' },
  house: { icon: '👑', label: 'Дом / Династия' },
  secret: { icon: '🎭', label: 'Тайное общество' },
  trade: { icon: '💰', label: 'Торговый дом' },
  band: { icon: '🗡️', label: 'Банда' },
  fleet: { icon: '⛵', label: 'Флот' },
  mages: { icon: '✨', label: 'Магический круг' },
  church: { icon: '📿', label: 'Церковь' },
  academy: { icon: '🎓', label: 'Академия' },
  rebels: { icon: '🔥', label: 'Мятежники' },
};

export function getTypeMeta(record: Pick<MapRecord, 'kind' | 'type'> | undefined) {
  if (!record) {
    return { label: LOCATION_TYPES.city.label, emoji: LOCATION_TYPES.city.emoji, image: LOCATION_TYPES.city.image, compact: false };
  }
  if (record.kind === 'faction') {
    const meta = FACTION_TYPES[record.type] ?? FACTION_TYPES.guild;
    return { label: meta.label, emoji: meta.icon, image: '/icons/fractions.png', compact: false };
  }
  if (record.kind === 'sublocation') {
    const meta = SUBLOCATION_TYPES[record.type] ?? SUBLOCATION_TYPES.district;
    return { label: meta.label, emoji: meta.icon, image: '', compact: false };
  }
  const meta = LOCATION_TYPES[record.type] ?? LOCATION_TYPES.city;
  return { label: meta.label, emoji: meta.emoji, image: meta.image, compact: Boolean(meta.compact) };
}
