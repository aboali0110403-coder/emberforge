import type { EquipmentId } from '../types';

export interface EquipmentDef {
  id: EquipmentId;
  name: string;
  tierNames: [string, string, string, string, string];
  effectSummary: string;
  tierBonuses: [string, string, string, string, string];
}

export const EQUIPMENT_LIST: EquipmentDef[] = [
  {
    id: 'furnace',
    name: 'Furnace',
    tierNames: [
      'Clay Hearth',
      'Brick Forge',
      'Bellows Blast Furnace',
      'Runic Crucible',
      'Dragonheart Kiln',
    ],
    effectSummary: 'Heat stability & unlocks higher-rarity materials',
    tierBonuses: [
      'Common & Uncommon materials',
      'Unlocks Rare materials · +15% heat band',
      'Unlocks Epic materials · +30% heat band',
      'Unlocks Mythic materials · +45% heat band',
      'Master stability · +60% heat band',
    ],
  },
  {
    id: 'hammer',
    name: 'Hammer',
    tierNames: [
      'Iron Peen',
      'Forged Cross-Peen',
      'Balanced Fuller Hammer',
      'Dwarven Master Mallet',
      'Starfall Hammer',
    ],
    effectSummary: 'Wider strike windows & +Power gain',
    tierBonuses: [
      'Standard timing',
      '+15% strike window · +1 Power',
      '+30% strike window · +2 Power',
      '+45% strike window · +3 Power',
      '+60% strike window · +5 Power',
    ],
  },
  {
    id: 'anvil',
    name: 'Anvil',
    tierNames: [
      'Worn Iron Block',
      'Horned Smith Anvil',
      'Hardened Steel Anvil',
      'Runed Horned Anvil',
      'Eternal Sky-Iron Anvil',
    ],
    effectSummary: 'More forgiving misses & higher Quality ceiling',
    tierBonuses: [
      'Standard quality',
      '+8% miss forgiveness · +2% Q bonus',
      '+16% miss forgiveness · +4% Q bonus',
      '+24% miss forgiveness · +6% Q bonus',
      '+32% miss forgiveness · +8% Q bonus',
    ],
  },
  {
    id: 'grindstone',
    name: 'Grindstone',
    tierNames: [
      'Sandstone Wheel',
      'Pedal Grit Wheel',
      'Fine Corundum Wheel',
      'Diamond-Dusted Wheel',
      'Astral Edge Wheel',
    ],
    effectSummary: 'Wider pressure zone & +Edge gain',
    tierBonuses: [
      'Standard zone',
      '+15% pressure zone · +1 Edge',
      '+30% pressure zone · +2 Edge',
      '+45% pressure zone · +3 Edge',
      '+60% pressure zone · +5 Edge',
    ],
  },
  {
    id: 'quench',
    name: 'Quench Trough',
    tierNames: [
      'Oak Water Tub',
      'Copper-Lined Trough',
      'Tempered Oil Bath',
      'Alchemical Cooling Vat',
      'Moonwell Quench Basin',
    ],
    effectSummary: 'Wider cooling window & +Durability gain',
    tierBonuses: [
      'Standard window',
      '+15% temp window · +1 Durability',
      '+30% temp window · +2 Durability',
      '+45% temp window · +3 Durability',
      '+60% temp window · +5 Durability',
    ],
  },
  {
    id: 'workbench',
    name: 'Workbench',
    tierNames: [
      'Rough Timber Bench',
      'Vise-Fitted Bench',
      'Master Joiner Bench',
      'Artificer Precision Table',
      'Grandmaster Rune Bench',
    ],
    effectSummary: 'Forgiving part fitting & +Balance gain',
    tierBonuses: [
      'Standard fit',
      '+15% fit snap · +1 Balance',
      '+30% fit snap · +2 Balance',
      '+45% fit snap · +3 Balance',
      '+60% fit snap · +5 Balance',
    ],
  },
];

export const EQUIPMENT_BY_ID: Record<EquipmentId, EquipmentDef> = Object.fromEntries(
  EQUIPMENT_LIST.map((e) => [e.id, e]),
) as Record<EquipmentId, EquipmentDef>;
