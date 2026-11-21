import type { SaveState } from '../types';
import { getSmithProgress, LEGENDARY_LEVEL } from './config';

export interface AchievementDef {
  id: string;
  title: string;
  description: string;
  goldReward: number;
  check: (s: SaveState) => boolean;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: 'first_order',
    title: 'First Spark',
    description: 'Complete and deliver your first customer order.',
    goldReward: 40,
    check: (s) => s.stats.ordersCompleted >= 1,
  },
  {
    id: 'orders_10',
    title: 'Journeyman Smith',
    description: 'Complete 10 weapon orders.',
    goldReward: 120,
    check: (s) => s.stats.ordersCompleted >= 10,
  },
  {
    id: 'orders_50',
    title: 'Master of the Hearth',
    description: 'Complete 50 weapon orders.',
    goldReward: 400,
    check: (s) => s.stats.ordersCompleted >= 50,
  },
  {
    id: 'orders_100',
    title: 'Living Legend of Steel',
    description: 'Complete 100 weapon orders.',
    goldReward: 1000,
    check: (s) => s.stats.ordersCompleted >= 100,
  },
  {
    id: 'masterwork_first',
    title: 'Pure Perfection',
    description: 'Forge an S-Rank Masterwork weapon (94%+ Quality).',
    goldReward: 160,
    check: (s) => (s.stats.masterworkCount ?? 0) >= 1,
  },
  {
    id: 'smith_rank_5',
    title: 'Seasoned Bladesmith',
    description: 'Reach Smith Level 5 through crafting mastery.',
    goldReward: 220,
    check: (s) => getSmithProgress(s.smithXp).level >= 5,
  },
  {
    id: 'conquer_one_kingdom',
    title: 'Banner of Victory',
    description: 'Clear all 3 battle territories in any single kingdom.',
    goldReward: 300,
    check: (s) =>
      Object.values(s.conqueredTerritories ?? {}).some((list) => list.length >= 3),
  },
  {
    id: 'perfect_streak_10',
    title: 'Unbroken Rhythm',
    description: 'Land a streak of 10 PERFECT strikes or judgments.',
    goldReward: 150,
    check: (s) => s.stats.bestPerfectStreak >= 10,
  },
  {
    id: 'first_legendary',
    title: 'Awakened Blade',
    description: `Forge a weapon to Legendary Level ${LEGENDARY_LEVEL}.`,
    goldReward: 250,
    check: (s) => s.stats.legendaryWeaponsForged >= 1,
  },
  {
    id: 'all_letters',
    title: 'Crown Favorite',
    description: "Receive a Royal King's Letter from all five kingdoms.",
    goldReward: 600,
    check: (s) => {
      const races = new Set(s.kingLetters.map((l) => l.race));
      return races.size >= 5;
    },
  },
  {
    id: 'serve_all_races',
    title: 'Guild Without Borders',
    description: 'Deliver weapons to all five races.',
    goldReward: 200,
    check: (s) => s.stats.racesServed.length >= 5,
  },
  {
    id: 'renowned_kingdom',
    title: 'Royal Summons',
    description: 'Reach Renowned popularity in any kingdom.',
    goldReward: 220,
    check: (s) => Object.values(s.popularity).some((v) => v >= 140),
  },
  {
    id: 'legendary_popularity',
    title: 'Myth of the Realm',
    description: 'Reach Legendary popularity in any kingdom.',
    goldReward: 500,
    check: (s) => Object.values(s.popularity).some((v) => v >= 240),
  },
  {
    id: 'weapon_level_20',
    title: 'Apex Artifact',
    description: 'Forge a weapon to maximum Level 20.',
    goldReward: 800,
    check: (s) => s.stats.highestWeaponLevel >= 20,
  },
  {
    id: 'max_one_equip',
    title: 'Finest Tool',
    description: 'Upgrade any workshop station to Tier 5.',
    goldReward: 250,
    check: (s) => Object.values(s.equipment).some((t) => t >= 5),
  },
  {
    id: 'max_all_equip',
    title: 'Grand Forge',
    description: 'Upgrade all six workshop stations to Tier 5.',
    goldReward: 1200,
    check: (s) => Object.values(s.equipment).every((t) => t >= 5),
  },
  {
    id: 'all_mythic_materials',
    title: 'Mythic Vault',
    description: 'Collect all five Mythic materials at least once.',
    goldReward: 750,
    check: (s) => s.stats.mythicsCollected.length >= 5,
  },
  {
    id: 'earn_10000_gold',
    title: 'Golden Anvil',
    description: 'Earn 10,000 total gold across your career.',
    goldReward: 500,
    check: (s) => s.stats.totalGoldEarned >= 10000,
  },
  {
    id: 'no_miss_10',
    title: 'Ironclad Reliability',
    description: 'Deliver 10 orders in a row without a missed deadline.',
    goldReward: 180,
    check: (s) => s.stats.noMissStreak >= 10,
  },
];
