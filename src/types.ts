import type { ForgeInsightReport } from './game/forgeInsightReport';

export type RaceId = 'human' | 'elf' | 'goblin' | 'orc' | 'demon';

export type RarityId = 'common' | 'uncommon' | 'rare' | 'epic' | 'mythic';

export type MaterialShape = 'ingot' | 'hide' | 'wood' | 'thread' | 'crystal';

export type WeaponTypeId =
  | 'sword'
  | 'shield'
  | 'dagger'
  | 'longbow'
  | 'staff'
  | 'spear'
  | 'cleaver'
  | 'axe'
  | 'scythe'
  | 'trident';

export type StationId = 'furnace' | 'anvil' | 'grindstone' | 'quench' | 'workbench';

export type EquipmentId = StationId | 'hammer';

export type RequestFocus = 'edge' | 'power' | 'grip' | 'durability' | 'arcane';

export type PopularityTierId = 'unknown' | 'known' | 'respected' | 'renowned' | 'legendary';

export type QualityGrade = 'S' | 'A' | 'B' | 'C' | 'D';

export type EnemyArchetype = 'skirmishers' | 'armored' | 'warded' | 'beasts' | 'void';

export type AttackAnimType =
  | 'slash'
  | 'shieldBash'
  | 'thrust'
  | 'arrow'
  | 'spell'
  | 'cleave'
  | 'axeSwing'
  | 'scytheSweep';

export interface WeaponStats {
  power: number;
  edge: number;
  balance: number;
  durability: number;
  arcane: number;
}

export interface WeaponPartState {
  partKey: string;
  rarity: RarityId;
  level: number;
}

export interface WeaponInstance {
  uid: string;
  type: WeaponTypeId;
  level: number;
  stats: WeaponStats;
  parts: Record<string, WeaponPartState>;
  legendaryNotifiedLevels: number[];
  trait?: string | null;
}

export interface MaterialDef {
  id: string;
  name: string;
  sourceRace: RaceId;
  targetRace: RaceId;
  rarity: RarityId;
  potency: number;
  shape: MaterialShape;
  basePrice: number;
  colors: [string, string, string]; // [dark, mid, highlight]
}

export interface MaterialStackSelection {
  materialId: string;
  units: number; // 1..5
}

export interface Order {
  id: string;
  kind: 'standard' | 'royal';
  race: RaceId;
  customerName: string;
  portraitVariant: number; // 0..2
  weapon: WeaponInstance;
  requestFocus: RequestFocus | null; // null for royal commissions
  requestText: string;
  targetPart: string;
  baseFee: number;
  deadlineSec: number;
  remainingSec: number;
  scenarioName: string;
  scenarioDifficulty: number;
  enemyArchetype?: EnemyArchetype;
  isTutorial?: boolean;
}

export interface PendingBattle {
  id: string;
  orderId: string;
  race: RaceId;
  customerName: string;
  portraitVariant: number;
  weapon: WeaponInstance;
  quality: number; // 0..1
  fulfilment: number; // 0.5..1.5
  scenarioName: string;
  scenarioDifficulty: number;
  enemyArchetype?: EnemyArchetype;
  smithLevel?: number;
  etaSec: number;
  ready: boolean;
  rewardMultiplier: number; // 1, or 2/3/4 for legendary milestones
  wasRoyal: boolean;
  // V0.2: the outcome is resolved exactly once when the battle becomes ready
  // and persisted here, so reloads/modal-opens/claims can never reroll it.
  resolvedResult?: BattleResult;
}

export interface BattleBreakdown {
  weaponRating: number;
  scenarioThreat: number;
  matchupLabel: string;
  matchupBonus: number;
  qualityBonus: number;
  smithBonus: number;
  winChancePct: number;
}

export interface BattleResult {
  battleId: string;
  race: RaceId;
  customerName: string;
  portraitVariant: number;
  weapon: WeaponInstance;
  scenarioName: string;
  enemyArchetype?: EnemyArchetype;
  won: boolean;
  satisfaction: number; // 0..100
  qualityGrade?: QualityGrade;
  popularityDelta: number;
  materialRewards: { materialId: string; count: number }[];
  goldBonus: number;
  territoryConquered?: boolean;
  breakdown?: BattleBreakdown;
}

export interface WeaponRecord {
  uid: string;
  type: WeaponTypeId;
  level: number;
  quality: number;
  grade: QualityGrade;
  trait: string | null;
  customerName: string;
  race: RaceId;
  stats: WeaponStats;
  forgedAt: number;
}

export interface CompletedOrderRecord {
  id: string;
  race: RaceId;
  customerName: string;
  weaponType: WeaponTypeId;
  weaponLevel: number;
  quality: number;
  grade: QualityGrade;
  goldEarned: number;
  completedAt: number;
}

export interface KingLetter {
  id: string;
  race: RaceId;
  milestoneLevel: number;
  title: string;
  body: string;
  timestamp: number;
}

export interface PlayerCustomization {
  name: string;
  gender: 'male' | 'female';
  hairColorIndex: number;
  skinToneIndex: number;
  outfitColorIndex: number;
}

export interface AudioSettings {
  musicVolume: number;
  sfxVolume: number;
  muted: boolean;
}

export interface RotatingShopItem {
  materialId: string;
  stock: number;
  price: number;
}

export interface GameStats {
  ordersCompleted: number;
  ordersMissed: number;
  noMissStreak: number;
  bestPerfectStreak: number;
  totalGoldEarned: number;
  racesServed: RaceId[];
  highestWeaponLevel: number;
  mythicsCollected: string[];
  legendaryWeaponsForged: number;
  battlesWon?: number;
  battlesLost?: number;
  masterworkCount?: number;
}

// Accounting remains inactive until a separately authorized integration phase.
export interface DailyBucket {
  dayIndex: number;
  observedFromSec: number;
  coverage: 'complete' | 'partial';
  deliveries: number; // Accepted transactions, not unique order IDs.
  missed: number;
  deliveryGold: number;
}

export interface DailyLedger {
  format: 1;
  current: DailyBucket;
  closed: DailyBucket[]; // Oldest first, at most 30.
}

export interface SaveState {
  version: number;
  createdAt: number;
  updatedAt: number;
  activePlaySec: number;
  dailyLedger: DailyLedger;
  smithXp: number;
  player: PlayerCustomization;
  gold: number;
  inventory: Record<string, number>;
  equipment: Record<EquipmentId, number>; // tier 1..5
  popularity: Record<RaceId, number>;
  unlockedRaces: RaceId[];
  conqueredTerritories: Record<RaceId, string[]>;
  orders: Order[];
  pendingBattles: PendingBattle[];
  kingLetters: KingLetter[];
  weaponArmory: WeaponRecord[];
  completedOrders: CompletedOrderRecord[];
  battleHistory: BattleResult[];
  achievementsUnlocked: string[];
  tutorialsSeen: {
    firstOrder: boolean;
    stations: Record<StationId, boolean>;
  };
  rotatingStock: RotatingShopItem[];
  rotatingStockTimerSec: number;
  nextCustomerTimerSec: number;
  stats: GameStats;
  audio: AudioSettings;
}

export type AppScreen = 'title' | 'character' | 'workshop';

export type ActiveModal =
  | null
  | 'orders'
  | 'shop'
  | 'inventory'
  | 'map'
  | 'battle'
  | 'achievements'
  | 'settings'
  | 'legendary'
  | 'delivery';

export interface ForgingSession {
  order: Order;
  steps: StationId[];
  stepIndex: number;
  stepAccuracies: number[];
  completedSteps?: boolean[];
  selectedMaterials: MaterialStackSelection[];
  targetPart: string;
  streak: number;
  bestStreakInForge: number;
  // V3-1: ephemeral per-step insight reports indexed by step. App state only;
  // never persisted.
  stepReports?: (ForgeInsightReport | undefined)[];
}

export interface DeliverySummary {
  order: Order;
  quality: number;
  qualityGrade: QualityGrade;
  masterworkTrait: string | null;
  fulfilment: number;
  goldEarned: number;
  promptBonusGold: number;
  reputationPenalty: number;
  xpEarned: number;
  smithLevelBefore: number;
  smithLevelAfter: number;
  oldLevel: number;
  newLevel: number;
  levelUpChance: number;
  leveledUp: boolean;
  statDeltas: WeaponStats;
  selectedMaterials?: MaterialStackSelection[];
  legendaryMilestone: number | null;
  newAchievements: string[];
  // V3-1: per-step insight reports indexed by step, available at the existing
  // receipt boundary. Optional so existing summary construction is unaffected.
  stepReports?: (ForgeInsightReport | undefined)[];
  // V3-1 correction: the actual forge step list, so the receipt can show step
  // identity (order and station) even for steps whose report is unavailable.
  // Ephemeral; never persisted.
  steps?: StationId[];
}
