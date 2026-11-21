import type {
  AttackAnimType,
  RaceId,
  RequestFocus,
  StationId,
  WeaponStats,
  WeaponTypeId,
} from '../types';

export interface WeaponDef {
  id: WeaponTypeId;
  name: string;
  ownerRace: RaceId | 'general';
  parts: string[];
  partLabels: Record<string, string>;
  baseStats: WeaponStats;
  hasArcane: boolean;
  attackAnim: AttackAnimType;
  possibleRequests: {
    focus: RequestFocus;
    text: string;
    targetPart: string;
  }[];
}

export const WEAPONS: Record<WeaponTypeId, WeaponDef> = {
  sword: {
    id: 'sword',
    name: 'Sword',
    ownerRace: 'general',
    parts: ['blade', 'guard', 'grip', 'pommel'],
    partLabels: { blade: 'Blade', guard: 'Crossguard', grip: 'Grip', pommel: 'Pommel' },
    baseStats: { power: 10, edge: 10, balance: 9, durability: 10, arcane: 0 },
    hasArcane: false,
    attackAnim: 'slash',
    possibleRequests: [
      { focus: 'edge', text: 'Sharper blade edge', targetPart: 'blade' },
      { focus: 'power', text: 'Heavier strike power', targetPart: 'blade' },
      { focus: 'grip', text: 'Improve the leather grip', targetPart: 'grip' },
      { focus: 'durability', text: 'Reinforce guard & tang', targetPart: 'guard' },
    ],
  },
  shield: {
    id: 'shield',
    name: 'Shield',
    ownerRace: 'general',
    parts: ['face', 'rim', 'strap', 'boss'],
    partLabels: { face: 'Shield Face', rim: 'Iron Rim', strap: 'Arm Strap', boss: 'Center Boss' },
    baseStats: { power: 6, edge: 3, balance: 10, durability: 14, arcane: 0 },
    hasArcane: false,
    attackAnim: 'shieldBash',
    possibleRequests: [
      { focus: 'durability', text: 'Thicker reinforced rim', targetPart: 'rim' },
      { focus: 'grip', text: 'Sturdier arm strap', targetPart: 'strap' },
      { focus: 'power', text: 'Heavy bash boss', targetPart: 'boss' },
    ],
  },
  dagger: {
    id: 'dagger',
    name: 'Dagger',
    ownerRace: 'general',
    parts: ['blade', 'guard', 'grip'],
    partLabels: { blade: 'Blade', guard: 'Guard', grip: 'Grip' },
    baseStats: { power: 7, edge: 12, balance: 13, durability: 7, arcane: 0 },
    hasArcane: false,
    attackAnim: 'thrust',
    possibleRequests: [
      { focus: 'edge', text: 'Razor-keen point', targetPart: 'blade' },
      { focus: 'grip', text: 'Rebalance the hilt grip', targetPart: 'grip' },
      { focus: 'durability', text: 'Temper the thin steel', targetPart: 'guard' },
    ],
  },
  longbow: {
    id: 'longbow',
    name: 'Longbow',
    ownerRace: 'elf',
    parts: ['limbs', 'string', 'grip'],
    partLabels: { limbs: 'Bow Limbs', string: 'Bowstring', grip: 'Riser Grip' },
    baseStats: { power: 11, edge: 5, balance: 12, durability: 8, arcane: 2 },
    hasArcane: true,
    attackAnim: 'arrow',
    possibleRequests: [
      { focus: 'grip', text: 'Restring with high tension', targetPart: 'string' },
      { focus: 'power', text: 'Reinforce draw limbs', targetPart: 'limbs' },
      { focus: 'arcane', text: 'Attune wind enchantment', targetPart: 'limbs' },
    ],
  },
  staff: {
    id: 'staff',
    name: 'Magic Staff',
    ownerRace: 'elf',
    parts: ['shaft', 'crystal', 'cap'],
    partLabels: { shaft: 'Staff Shaft', crystal: 'Focus Crystal', cap: 'Silver Cap' },
    baseStats: { power: 7, edge: 2, balance: 10, durability: 8, arcane: 15 },
    hasArcane: true,
    attackAnim: 'spell',
    possibleRequests: [
      { focus: 'arcane', text: 'Socket brighter focus crystal', targetPart: 'crystal' },
      { focus: 'grip', text: 'Carve runes along shaft', targetPart: 'shaft' },
      { focus: 'durability', text: 'Bind silver end cap', targetPart: 'cap' },
    ],
  },
  spear: {
    id: 'spear',
    name: 'Spear',
    ownerRace: 'human',
    parts: ['head', 'shaft', 'binding'],
    partLabels: { head: 'Spearhead', shaft: 'Ash Shaft', binding: 'Collar Binding' },
    baseStats: { power: 11, edge: 11, balance: 10, durability: 9, arcane: 0 },
    hasArcane: false,
    attackAnim: 'thrust',
    possibleRequests: [
      { focus: 'edge', text: 'Hone piercing spearhead', targetPart: 'head' },
      { focus: 'grip', text: 'Tighten collar binding', targetPart: 'binding' },
      { focus: 'durability', text: 'Reinforce hardwood shaft', targetPart: 'shaft' },
    ],
  },
  cleaver: {
    id: 'cleaver',
    name: 'Serrated Cleaver',
    ownerRace: 'goblin',
    parts: ['blade', 'grip', 'wrap'],
    partLabels: { blade: 'Serrated Blade', grip: 'Hilt', wrap: 'Leather Wrap' },
    baseStats: { power: 12, edge: 11, balance: 8, durability: 8, arcane: 0 },
    hasArcane: false,
    attackAnim: 'cleave',
    possibleRequests: [
      { focus: 'edge', text: 'File vicious serrations', targetPart: 'blade' },
      { focus: 'grip', text: 'Rewrap sticky handle', targetPart: 'wrap' },
      { focus: 'power', text: 'Add weight to chop spine', targetPart: 'blade' },
    ],
  },
  axe: {
    id: 'axe',
    name: 'Battle Axe',
    ownerRace: 'orc',
    parts: ['head', 'haft', 'binding'],
    partLabels: { head: 'Axe Head', haft: 'War Haft', binding: 'Iron Binding' },
    baseStats: { power: 15, edge: 9, balance: 7, durability: 12, arcane: 0 },
    hasArcane: false,
    attackAnim: 'axeSwing',
    possibleRequests: [
      { focus: 'power', text: 'Widen crushing axe head', targetPart: 'head' },
      { focus: 'edge', text: 'Grind a brutal bevel', targetPart: 'head' },
      { focus: 'grip', text: 'Bind war haft tighter', targetPart: 'binding' },
    ],
  },
  scythe: {
    id: 'scythe',
    name: 'Scythe',
    ownerRace: 'demon',
    parts: ['blade', 'snath', 'grip'],
    partLabels: { blade: 'Reaping Blade', snath: 'Curved Snath', grip: 'Twin Grips' },
    baseStats: { power: 13, edge: 13, balance: 9, durability: 9, arcane: 5 },
    hasArcane: true,
    attackAnim: 'scytheSweep',
    possibleRequests: [
      { focus: 'edge', text: 'Whet curved reaping arc', targetPart: 'blade' },
      { focus: 'arcane', text: 'Etch hellfire runes', targetPart: 'blade' },
      { focus: 'grip', text: 'Fit balanced twin grips', targetPart: 'grip' },
    ],
  },
  trident: {
    id: 'trident',
    name: 'Trident',
    ownerRace: 'demon',
    parts: ['prongs', 'shaft', 'binding'],
    partLabels: { prongs: 'Triple Prongs', shaft: 'Iron Shaft', binding: 'Rune Binding' },
    baseStats: { power: 13, edge: 11, balance: 10, durability: 11, arcane: 4 },
    hasArcane: true,
    attackAnim: 'thrust',
    possibleRequests: [
      { focus: 'power', text: 'Forge heavier center prong', targetPart: 'prongs' },
      { focus: 'arcane', text: 'Bind cinder sigils', targetPart: 'binding' },
      { focus: 'durability', text: 'Quench iron shaft', targetPart: 'shaft' },
    ],
  },
};

export const WEAPON_LIST = Object.values(WEAPONS);

export function getStepsForRequest(
  focus: RequestFocus,
  targetPart: string,
): StationId[] {
  switch (focus) {
    case 'edge':
      return ['furnace', 'anvil', 'grindstone', 'quench'];
    case 'power':
      return ['furnace', 'anvil', 'quench'];
    case 'durability':
      return ['furnace', 'anvil', 'quench'];
    case 'arcane':
      return ['furnace', 'workbench', 'quench'];
    case 'grip': {
      const metalParts = ['guard', 'boss', 'binding', 'cap'];
      if (metalParts.includes(targetPart)) {
        return ['anvil', 'workbench'];
      }
      return ['workbench'];
    }
  }
}

export function getWeaponsForRace(race: RaceId): WeaponDef[] {
  return WEAPON_LIST.filter(
    (w) => w.ownerRace === 'general' || w.ownerRace === race,
  );
}
