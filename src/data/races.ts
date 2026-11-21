import type { EnemyArchetype, RaceId } from '../types';
import { KINGDOM_NAMES } from './config';

export interface RaceScenarioDef {
  name: string;
  difficulty: number;
  archetype: EnemyArchetype;
}

export interface RaceDef {
  id: RaceId;
  name: string;
  plural: string;
  kingdomName: string;
  kingTitle: string;
  kingName: string;
  palette: {
    primary: string;
    secondary: string;
    accent: string;
    skin: string;
    badgeBg: string;
  };
  customerNames: string[];
  scenarios: RaceScenarioDef[];
  /** Scale intervals in semitones from root for chiptune flavor */
  scaleIntervals: number[];
  rootMidi: number;
  letterTitle: string;
  letterBody: (playerName: string, weaponName: string, level: number) => string;
}

export const ENEMY_ARCHETYPE_INFO: Record<
  EnemyArchetype,
  { label: string; weaknessHint: string }
> = {
  skirmishers: { label: 'Agile Skirmishers', weaknessHint: 'Favors Edge & Balance (Sword, Dagger, Bow)' },
  armored: { label: 'Armored Vanguard', weaknessHint: 'Favors Power & Crush (Axe, Cleaver, Shield)' },
  warded: { label: 'Warded Cabal', weaknessHint: 'Favors Arcane & Piercing (Staff, Trident, Scythe)' },
  beasts: { label: 'Scaled Monsters', weaknessHint: 'Favors Reach & Durability (Spear, Longbow, Axe)' },
  void: { label: 'Abyssal Fiends', weaknessHint: 'Favors Arcane & High Tier (Scythe, Trident, Staff)' },
};

export const RACES: Record<RaceId, RaceDef> = {
  human: {
    id: 'human',
    name: 'Human',
    plural: 'Humans',
    kingdomName: KINGDOM_NAMES.human,
    kingTitle: 'King Cedric IV',
    kingName: 'Cedric',
    palette: {
      primary: '#2563eb',
      secondary: '#eab308',
      accent: '#93c5fd',
      skin: '#f3cfb6',
      badgeBg: '#1e3a8a',
    },
    customerNames: ['Sir Garrick', 'Elena Vance', 'Captain Thorne', 'Alden Marsh', 'Mira Ashford'],
    scenarios: [
      { name: 'Border Bandit Ambush', difficulty: 14, archetype: 'skirmishers' },
      { name: 'Bridgewatch Skirmish', difficulty: 26, archetype: 'armored' },
      { name: 'Siege of Ashen Keep', difficulty: 42, archetype: 'armored' },
    ],
    scaleIntervals: [0, 2, 4, 5, 7, 9, 11], // Major (Ionian)
    rootMidi: 60,
    letterTitle: 'Royal Seal of Aldermere',
    letterBody: (playerName, weaponName, level) =>
      `Master Smith ${playerName},\n\nReports from our border garrisons speak of a ${weaponName} (Lv ${level}) whose edge gleams like dawn over Aldermere. Our knights carry your mark with honor.\n\nMay your hearth never cool,\nKing Cedric IV of Aldermere`,
  },
  elf: {
    id: 'elf',
    name: 'Elf',
    plural: 'Elves',
    kingdomName: KINGDOM_NAMES.elf,
    kingTitle: 'High Queen Sylvanis',
    kingName: 'Sylvanis',
    palette: {
      primary: '#15803d',
      secondary: '#cbd5e1',
      accent: '#86efac',
      skin: '#fde8d7',
      badgeBg: '#14532d',
    },
    customerNames: ['Lirael Windbow', 'Theren Moonleaf', 'Aelar Silverthorn', 'Faelar Dawn', 'Nissa Glade'],
    scenarios: [
      { name: 'Mistwood Stalkers', difficulty: 20, archetype: 'skirmishers' },
      { name: 'Moonwell Defense', difficulty: 34, archetype: 'warded' },
      { name: 'Blighted Canopy Raid', difficulty: 52, archetype: 'beasts' },
    ],
    scaleIntervals: [0, 2, 4, 6, 7, 9, 11], // Lydian
    rootMidi: 64,
    letterTitle: 'Silverleaf Writ of Sylvara',
    letterBody: (playerName, weaponName, level) =>
      `Artisan ${playerName},\n\nRarely do mortal hands shape steel and wood with such quiet harmony. The ${weaponName} (Lv ${level}) you tempered sings beneath the starlight of Sylvara.\n\nIn eternal grace,\nHigh Queen Sylvanis`,
  },
  goblin: {
    id: 'goblin',
    name: 'Goblin',
    plural: 'Goblins',
    kingdomName: KINGDOM_NAMES.goblin,
    kingTitle: 'Boss-King Grubnak',
    kingName: 'Grubnak',
    palette: {
      primary: '#65a30d',
      secondary: '#92400e',
      accent: '#bef264',
      skin: '#84a94c',
      badgeBg: '#3f6212',
    },
    customerNames: ['Snaggletooth', 'Zik Sparkfinger', 'Grizzik Scrap', 'Nibs Cogpin', 'Vexx Tunnelrat'],
    scenarios: [
      { name: 'Fungus Cavern Brawl', difficulty: 22, archetype: 'skirmishers' },
      { name: 'Minecart Heist', difficulty: 38, archetype: 'armored' },
      { name: 'Deepbore Drake Scare', difficulty: 56, archetype: 'beasts' },
    ],
    scaleIntervals: [0, 1, 4, 5, 7, 8, 10], // Phrygian Dominant
    rootMidi: 62,
    letterTitle: 'Shiny Decree of Grubnak',
    letterBody: (playerName, weaponName, level) =>
      `Oi ${playerName}!\n\nDat ${weaponName} (Lv ${level}) chopped three cave-trolls clean in half! Best shiny-maker outside da Warrens! Keep hammering da good stuff!\n\nSigned with big stamp,\nBoss-King Grubnak`,
  },
  orc: {
    id: 'orc',
    name: 'Orc',
    plural: 'Orcs',
    kingdomName: KINGDOM_NAMES.orc,
    kingTitle: 'Warchief Kharzul',
    kingName: 'Kharzul',
    palette: {
      primary: '#b45309',
      secondary: '#64748b',
      accent: '#fb923c',
      skin: '#6e8c54',
      badgeBg: '#7c2d12',
    },
    customerNames: ['Grommash Ironjaw', 'Urzog Bloodfist', 'Kragga Stone', 'Durok Tusker', 'Shautha Ash'],
    scenarios: [
      { name: 'Red Gorge Clash', difficulty: 28, archetype: 'armored' },
      { name: 'Cragbeast Hunt', difficulty: 45, archetype: 'beasts' },
      { name: 'Ironspire Reckoning', difficulty: 64, archetype: 'armored' },
    ],
    scaleIntervals: [0, 2, 3, 5, 7, 9, 10], // Dorian
    rootMidi: 57,
    letterTitle: 'Iron Brand of Kharzul',
    letterBody: (playerName, weaponName, level) =>
      `Forge-Master ${playerName},\n\nYour ${weaponName} (Lv ${level}) broke enemy shields like dry kindling at Red Gorge. The Horde respects strength, and your anvil has earned a warrior's salute.\n\nWarchief Kharzul`,
  },
  demon: {
    id: 'demon',
    name: 'Demon',
    plural: 'Demons',
    kingdomName: KINGDOM_NAMES.demon,
    kingTitle: 'Archlord Malakor',
    kingName: 'Malakor',
    palette: {
      primary: '#dc2626',
      secondary: '#7e22ce',
      accent: '#f87171',
      skin: '#a82834',
      badgeBg: '#7f1d1d',
    },
    customerNames: ['Vaelith Ashborn', 'Kaelgor Cinder', 'Seraphine Void', 'Morgath Ember', 'Nyxara Blade'],
    scenarios: [
      { name: 'Obsidian Spire Duel', difficulty: 30, archetype: 'warded' },
      { name: 'Cinder Rift Breach', difficulty: 48, archetype: 'void' },
      { name: 'Abyssal Citadel Clash', difficulty: 68, archetype: 'void' },
    ],
    scaleIntervals: [0, 2, 3, 5, 7, 8, 11], // Harmonic Minor
    rootMidi: 55,
    letterTitle: 'Obsidian Charter of Infernis',
    letterBody: (playerName, weaponName, level) =>
      `Smith ${playerName},\n\nFew in the mortal realms dare temper weapons worthy of Infernis. Yet your ${weaponName} (Lv ${level}) drank the cinder-flames without flaw.\n\nBy pact and ember,\nArchlord Malakor`,
  },
};

export const RACE_LIST: RaceDef[] = [
  RACES.human,
  RACES.demon,
  RACES.elf,
  RACES.goblin,
  RACES.orc,
];
