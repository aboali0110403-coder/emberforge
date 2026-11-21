import { QUALITY_GRADE_META } from '../data/config';
import { ENEMY_ARCHETYPE_INFO, RACES } from '../data/races';
import { WEAPONS } from '../data/weapons';
import { getEnemyArchetypeForScenario } from '../game/rules';
import { getVfxSprite } from '../gfx/assetSheets';
import { getBattleBgAsset, getPortraitAsset } from '../gfx/generatedAssets';
import { getWeaponSpriteCanvas } from '../gfx/sprites';
import type { BattleResult, EnemyArchetype } from '../types';
import { computeBattleTimeline } from './animation';

function drawHeroArmoredSprite(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  primary: string,
  secondary: string,
  walkPhase: number,
  impactHit: boolean,
  kneelRatio: number,
  portrait: HTMLCanvasElement | HTMLImageElement,
): void {
  const legOffset = Math.round(Math.sin(walkPhase) * 3);
  const kneelY = Math.round(kneelRatio * 8);

  // Flowing cape behind shoulders with battle sway
  const capeSway = Math.round(Math.sin(walkPhase * 0.6) * 2);
  ctx.fillStyle = '#1e1612';
  ctx.fillRect(x - 2 - Math.abs(capeSway), y + 18 + kneelY, 13, 26 - Math.round(kneelRatio * 6));
  ctx.fillStyle = impactHit ? '#fef08a' : primary;
  ctx.fillRect(x - Math.abs(capeSway), y + 19 + kneelY, 10, 23 - Math.round(kneelRatio * 6));

  // Armored boots & greaves
  ctx.fillStyle = '#120c0a';
  ctx.fillRect(x + 7 + legOffset, y + 40 + Math.round(kneelRatio * 3), 8, 10 - Math.round(kneelRatio * 3));
  ctx.fillRect(x + 19 - legOffset, y + 40 + Math.round(kneelRatio * 3), 8, 10 - Math.round(kneelRatio * 3));
  ctx.fillStyle = impactHit ? '#fffbeb' : '#64748b';
  ctx.fillRect(x + 8 + legOffset, y + 41 + Math.round(kneelRatio * 3), 6, 6);
  ctx.fillRect(x + 20 - legOffset, y + 41 + Math.round(kneelRatio * 3), 6, 6);
  ctx.fillStyle = '#451a03';
  ctx.fillRect(x + 8 + legOffset, y + 46 + Math.round(kneelRatio * 3), 7, 3);
  ctx.fillRect(x + 20 - legOffset, y + 46 + Math.round(kneelRatio * 3), 7, 3);

  // Steel cuirass + colored surcoat & belt
  ctx.fillStyle = '#120c0a';
  ctx.fillRect(x + 6, y + 20 + kneelY, 22, 22);
  ctx.fillStyle = impactHit ? '#fffbeb' : '#94a3b8';
  ctx.fillRect(x + 8, y + 21 + kneelY, 18, 10);
  ctx.fillStyle = impactHit ? '#fef08a' : '#cbd5e1';
  ctx.fillRect(x + 10, y + 22 + kneelY, 8, 4);
  ctx.fillStyle = impactHit ? '#fef08a' : primary;
  ctx.fillRect(x + 8, y + 31 + kneelY, 18, 10);
  ctx.fillStyle = secondary;
  ctx.fillRect(x + 8, y + 30 + kneelY, 18, 3);
  ctx.fillRect(x + 15, y + 31 + kneelY, 4, 10);

  // Pauldrons
  ctx.fillStyle = '#475569';
  ctx.fillRect(x + 3, y + 19 + kneelY, 7, 7);
  ctx.fillRect(x + 24, y + 19 + kneelY, 7, 7);
  ctx.fillStyle = secondary;
  ctx.fillRect(x + 4, y + 19 + kneelY, 5, 2);
  ctx.fillRect(x + 25, y + 19 + kneelY, 5, 2);

  // Ornate RPG portrait bust frame with gold bevel
  ctx.fillStyle = '#120c0a';
  ctx.fillRect(x + 1, y - 9 + kneelY, 32, 31);
  ctx.fillStyle = impactHit ? '#ef4444' : '#d97706';
  ctx.fillRect(x + 2, y - 8 + kneelY, 30, 29);
  ctx.fillStyle = '#1f1610';
  ctx.fillRect(x + 4, y - 6 + kneelY, 26, 25);
  ctx.drawImage(portrait, x + 4, y - 6 + kneelY, 26, 25);
}

function drawEnemyArchetypeSprite(
  ctx: CanvasRenderingContext2D,
  archetype: EnemyArchetype,
  x: number,
  y: number,
  impactHit: boolean,
  idleBob: number,
  toppleRatio: number,
): void {
  const by = y + Math.round(idleBob);

  ctx.save();
  if (toppleRatio > 0) {
    ctx.translate(x + 18, by + 48);
    ctx.rotate(toppleRatio * 1.42);
    ctx.globalAlpha = Math.max(0.15, 1 - toppleRatio * 0.85);
    ctx.translate(-(x + 18), -(by + 48));
  }

  if (archetype === 'skirmishers') {
    // Hooded Agile Stalker with twin curved blades & scarf
    ctx.fillStyle = impactHit ? '#fef08a' : '#14532d';
    ctx.fillRect(x + 20, by + 16, 13, 22);
    ctx.fillStyle = '#120c0a';
    ctx.fillRect(x + 7, by + 18, 19, 21);
    ctx.fillStyle = impactHit ? '#fffbeb' : '#365314';
    ctx.fillRect(x + 9, by + 19, 15, 18);
    ctx.fillStyle = '#a16207'; // leather bandolier
    ctx.fillRect(x + 9, by + 26, 15, 3);
    // Boots
    ctx.fillStyle = '#120c0a';
    ctx.fillRect(x + 7, by + 39, 7, 10);
    ctx.fillRect(x + 19, by + 39, 7, 10);
    // Hood & glowing amber mask eyes
    ctx.fillStyle = '#120c0a';
    ctx.fillRect(x + 8, by + 1, 18, 18);
    ctx.fillStyle = impactHit ? '#fffbeb' : '#1e293b';
    ctx.fillRect(x + 10, by + 3, 14, 14);
    ctx.fillStyle = '#facc15';
    ctx.fillRect(x + 11, by + 9, 4, 2);
    ctx.fillRect(x + 18, by + 9, 4, 2);
    // Twin forward daggers
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(x - 4, by + 24, 12, 3);
    ctx.fillRect(x - 2, by + 32, 10, 3);
  } else if (archetype === 'warded') {
    // Floating Cabal Mage with violet robes, arcane halo & staff
    const hover = Math.round(Math.sin(idleBob * 2) * 2);
    ctx.fillStyle = 'rgba(192, 132, 252, 0.25)';
    ctx.beginPath();
    ctx.arc(x + 17, by + 22 + hover, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#120c0a';
    ctx.fillRect(x + 5, by + 15 + hover, 24, 32);
    ctx.fillStyle = impactHit ? '#fffbeb' : '#4c1d95';
    ctx.fillRect(x + 7, by + 17 + hover, 20, 28);
    ctx.fillStyle = '#a855f7';
    ctx.fillRect(x + 14, by + 18 + hover, 6, 26);
    // Hooded helm + cyan arcane eyes
    ctx.fillStyle = '#120c0a';
    ctx.fillRect(x + 8, by - 1 + hover, 18, 18);
    ctx.fillStyle = impactHit ? '#fef08a' : '#312e81';
    ctx.fillRect(x + 10, by + 1 + hover, 14, 14);
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(x + 12, by + 8 + hover, 3, 3);
    ctx.fillRect(x + 19, by + 8 + hover, 3, 3);
    // Rune Staff
    ctx.fillStyle = '#78350f';
    ctx.fillRect(x - 1, by + 8 + hover, 3, 38);
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(x - 3, by + 4 + hover, 7, 7);
  } else if (archetype === 'beasts') {
    // Scaled Drake-Beast with horned crest, fangs, claws & dorsal spines
    ctx.fillStyle = '#120c0a';
    ctx.fillRect(x + 2, by + 14, 30, 30);
    ctx.fillStyle = impactHit ? '#fef08a' : '#14532d';
    ctx.fillRect(x + 4, by + 16, 26, 24);
    ctx.fillStyle = impactHit ? '#fffbeb' : '#65a30d'; // Scaled chest plates
    ctx.fillRect(x + 6, by + 20, 14, 16);
    // Dorsal spikes
    ctx.fillStyle = '#fde047';
    ctx.fillRect(x + 27, by + 8, 5, 5);
    ctx.fillRect(x + 30, by + 16, 5, 5);
    ctx.fillRect(x + 31, by + 25, 5, 5);
    // Snouted beast head & fangs
    ctx.fillStyle = '#120c0a';
    ctx.fillRect(x + 1, by + 1, 24, 17);
    ctx.fillStyle = impactHit ? '#fffbeb' : '#15803d';
    ctx.fillRect(x + 3, by + 3, 20, 13);
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(x + 7, by + 6, 4, 3);
    ctx.fillStyle = '#fffbeb';
    ctx.fillRect(x + 4, by + 13, 3, 4);
    ctx.fillRect(x + 10, by + 13, 3, 4);
    // Heavy legs & claws
    ctx.fillStyle = '#365314';
    ctx.fillRect(x + 6, by + 40, 8, 10);
    ctx.fillRect(x + 20, by + 40, 8, 10);
  } else if (archetype === 'void') {
    // Abyssal Void Fiend with obsidian wings, ember chest core & curved scythe
    ctx.fillStyle = '#1e1b4b';
    ctx.fillRect(x + 26, by + 6, 14, 24);
    ctx.fillStyle = impactHit ? '#fef08a' : '#7e22ce';
    ctx.fillRect(x + 28, by + 9, 10, 18);
    ctx.fillStyle = '#120c0a';
    ctx.fillRect(x + 4, by + 14, 26, 28);
    ctx.fillStyle = impactHit ? '#fffbeb' : '#1f162b';
    ctx.fillRect(x + 6, by + 16, 22, 24);
    // Molten ember core
    ctx.fillStyle = '#f97316';
    ctx.fillRect(x + 13, by + 22, 8, 8);
    ctx.fillStyle = '#fde047';
    ctx.fillRect(x + 15, by + 24, 4, 4);
    // Twin demon horns & glowing eyes
    ctx.fillStyle = '#dc2626';
    ctx.fillRect(x + 4, by - 7, 4, 9);
    ctx.fillRect(x + 24, by - 7, 4, 9);
    ctx.fillStyle = '#120c0a';
    ctx.fillRect(x + 7, by, 19, 16);
    ctx.fillStyle = impactHit ? '#fffbeb' : '#3b0764';
    ctx.fillRect(x + 9, by + 2, 15, 12);
    ctx.fillStyle = '#f87171';
    ctx.fillRect(x + 10, by + 7, 4, 3);
    ctx.fillRect(x + 18, by + 7, 4, 3);
    // Boots & Abyssal Blade
    ctx.fillStyle = '#1f162b';
    ctx.fillRect(x + 7, by + 41, 8, 9);
    ctx.fillRect(x + 19, by + 41, 8, 9);
    ctx.fillStyle = '#94a3b8';
    ctx.fillRect(x - 5, by + 10, 6, 28);
    ctx.fillStyle = '#dc2626';
    ctx.fillRect(x - 10, by + 8, 10, 6);
  } else {
    // Armored Vanguard (spiked iron warlord + tower shield + horned greathelm)
    ctx.fillStyle = impactHit ? '#fef08a' : '#450a0a';
    ctx.fillRect(x + 22, by + 16, 12, 28);
    ctx.fillStyle = impactHit ? '#fde047' : '#7f1d1d';
    ctx.fillRect(x + 23, by + 18, 9, 24);
    ctx.fillStyle = '#120c0a';
    ctx.fillRect(x + 6, by + 40, 9, 10);
    ctx.fillRect(x + 20, by + 40, 9, 10);
    ctx.fillStyle = impactHit ? '#fffbeb' : '#334155';
    ctx.fillRect(x + 7, by + 41, 7, 7);
    ctx.fillRect(x + 21, by + 41, 7, 7);

    ctx.fillStyle = '#120c0a';
    ctx.fillRect(x + 4, by + 16, 26, 26);
    ctx.fillStyle = impactHit ? '#fef08a' : '#334155';
    ctx.fillRect(x + 6, by + 18, 22, 22);
    ctx.fillStyle = impactHit ? '#fffbeb' : '#64748b';
    ctx.fillRect(x + 8, by + 19, 10, 8);
    ctx.fillStyle = '#b91c1c';
    ctx.fillRect(x + 6, by + 31, 22, 4);

    // Horned helm
    ctx.fillStyle = '#120c0a';
    ctx.fillRect(x + 7, by - 1, 20, 19);
    ctx.fillStyle = impactHit ? '#fffbeb' : '#475569';
    ctx.fillRect(x + 9, by + 1, 16, 15);
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(x + 5, by - 6, 4, 8);
    ctx.fillRect(x + 25, by - 6, 4, 8);
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(x + 10, by + 7, 14, 5);
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(x + 11, by + 8, 4, 3);
    ctx.fillRect(x + 19, by + 8, 4, 3);

    // Broad-axe & tower shield
    ctx.fillStyle = '#451a03';
    ctx.fillRect(x - 1, by + 10, 3, 28);
    ctx.fillStyle = impactHit ? '#fffbeb' : '#94a3b8';
    ctx.fillRect(x - 7, by + 10, 8, 12);
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(x - 4, by + 24, 9, 17);
  }

  ctx.restore();
}

function drawArenaHpHud(
  ctx: CanvasRenderingContext2D,
  result: BattleResult,
  archetype: EnemyArchetype,
  heroHpPct: number,
  enemyHpPct: number,
  portrait: HTMLCanvasElement | HTMLImageElement,
): void {
  const race = RACES[result.race];
  const archInfo = ENEMY_ARCHETYPE_INFO[archetype];

  // Top translucent battle HUD strip
  ctx.fillStyle = 'rgba(18, 12, 10, 0.84)';
  ctx.fillRect(10, 8, 460, 28);
  ctx.strokeStyle = '#6b4931';
  ctx.lineWidth = 1;
  ctx.strokeRect(10.5, 8.5, 459, 27);

  // Left: Hero portrait + name + HP bar
  ctx.drawImage(portrait, 14, 11, 22, 22);
  ctx.fillStyle = '#fffbeb';
  ctx.font = 'bold 8px "Courier New", monospace';
  ctx.fillText(result.customerName.slice(0, 15), 40, 18);
  ctx.fillStyle = '#1c1411';
  ctx.fillRect(40, 22, 148, 8);
  const hFill = Math.max(0, Math.round(146 * heroHpPct));
  ctx.fillStyle = heroHpPct > 0.45 ? '#22c55e' : heroHpPct > 0.2 ? '#f59e0b' : '#ef4444';
  ctx.fillRect(41, 23, hFill, 6);

  // Center VS
  ctx.fillStyle = '#fde047';
  ctx.font = 'bold 10px "Courier New", monospace';
  ctx.textAlign = 'center';
  ctx.fillText('VS', 240, 25);

  // Right: Enemy Archetype + HP bar
  ctx.textAlign = 'right';
  ctx.fillStyle = '#fca5a5';
  ctx.font = 'bold 8px "Courier New", monospace';
  ctx.fillText(archInfo.label.slice(0, 18), 464, 18);
  ctx.fillStyle = '#1c1411';
  ctx.fillRect(292, 22, 148, 8);
  const eFill = Math.max(0, Math.round(146 * enemyHpPct));
  ctx.fillStyle = race.palette.primary === '#dc2626' ? '#a855f7' : '#ef4444';
  ctx.fillRect(439 - eFill, 23, eFill, 6);
  ctx.textAlign = 'left';
}

export function renderBattleFrame(
  ctx: CanvasRenderingContext2D,
  t: number,
  result: BattleResult,
): void {
  const bg = getBattleBgAsset(result.race);
  ctx.drawImage(bg, 0, 0, 480, 270);

  const race = RACES[result.race];
  const weaponDef = WEAPONS[result.weapon.type];
  const wSprite = getWeaponSpriteCanvas(result.weapon);
  const portrait = getPortraitAsset(result.race, result.portraitVariant, false);
  const archetype = getEnemyArchetypeForScenario(
    result.race,
    result.scenarioName,
    result.enemyArchetype,
  );
  const grade = result.qualityGrade ?? 'B';
  const gradeColor = QUALITY_GRADE_META[grade].color;

  const tl = computeBattleTimeline(t, result.won, grade);
  const shakeActive = tl.enemyImpactFlash || tl.heroImpactFlash;
  const shakeX = shakeActive ? Math.sin(t * 95) * 3 : 0;
  const shakeY = shakeActive ? Math.cos(t * 82) * 2 : 0;

  ctx.save();
  ctx.translate(shakeX, shakeY);

  const hx = Math.round(tl.heroX + tl.heroShakeX);
  const hy = 152;
  const ex = Math.round(tl.enemyX + tl.enemyShakeX);
  const ey = 152;

  // Ground shadows
  ctx.fillStyle = 'rgba(0,0,0,0.48)';
  ctx.fillRect(hx - 2, hy + 48, 38, 6);
  if (tl.enemyTopple < 0.85) {
    ctx.fillRect(ex - 2, ey + 48, 38, 6);
  }

  // Quality charge glow around hero during windup/strike
  if (tl.windupRatio > 0 && tl.attackRatio < 0.9) {
    ctx.save();
    ctx.globalAlpha = 0.28 + Math.sin(t * 20) * 0.12;
    const aura = ctx.createRadialGradient(hx + 22, hy + 20, 4, hx + 22, hy + 20, 32);
    aura.addColorStop(0, gradeColor);
    aura.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = aura;
    ctx.fillRect(hx - 12, hy - 14, 68, 68);
    ctx.restore();
  }

  drawHeroArmoredSprite(
    ctx,
    hx,
    hy,
    race.palette.primary,
    race.palette.secondary,
    tl.heroWalkPhase,
    tl.heroImpactFlash,
    tl.heroKneel,
    portrait,
  );

  // Weapon held + anticipation windup + weapon-specific attack choreography
  const anim = weaponDef.attackAnim;
  if (anim === 'arrow') {
    const pullTilt = tl.windupRatio > 0 && tl.attackRatio === 0 ? -0.18 * tl.windupRatio : 0;
    ctx.save();
    ctx.translate(hx + 28, hy + 20);
    ctx.rotate(pullTilt);
    ctx.drawImage(wSprite, -4, -16, 34, 34);
    ctx.restore();
    if (tl.attackRatio > 0.05 && tl.attackRatio < 0.92) {
      const arrowX = hx + 42 + (tl.attackRatio / 0.92) * (ex - hx - 32);
      const arrowSprite = getVfxSprite('arrow', 46, 16);
      if (arrowSprite) {
        ctx.drawImage(arrowSprite, arrowX, hy + 14, 46, 16);
      } else {
        ctx.fillStyle = gradeColor;
        ctx.fillRect(arrowX, hy + 18, 18, 3);
      }
    }
  } else if (anim === 'spell') {
    const liftY = tl.windupRatio > 0 && tl.attackRatio === 0 ? -Math.round(tl.windupRatio * 5) : 0;
    ctx.drawImage(wSprite, hx + 22, hy + 2 + liftY, 36, 36);
    if (tl.attackRatio > 0.05 && tl.attackRatio < 0.92) {
      const boltX = hx + 44 + (tl.attackRatio / 0.92) * (ex - hx - 32);
      const spellSprite = getVfxSprite('spell', 54, 20);
      if (spellSprite) {
        ctx.drawImage(spellSprite, boltX, hy + 12, 54, 20);
      } else {
        ctx.fillStyle = '#38bdf8';
        ctx.beginPath();
        ctx.arc(boltX, hy + 16, 7, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else if (anim === 'thrust') {
    const pullback = tl.attackRatio === 0 ? -tl.windupRatio * 10 : 0;
    const thrustOffset =
      tl.attackRatio > 0.1 && tl.attackRatio < 0.85
        ? Math.sin((tl.attackRatio / 0.85) * Math.PI) * 44
        : 0;
    ctx.drawImage(wSprite, hx + 22 + pullback + thrustOffset, hy + 10, 38, 38);
    if (tl.enemyImpactFlash) {
      const slash = getVfxSprite('slash', 64, 64);
      if (slash) ctx.drawImage(slash, ex - 22, ey - 2, 64, 64);
    }
  } else {
    const windupAngle = tl.attackRatio === 0 ? -0.35 - tl.windupRatio * 0.85 : -0.3;
    const swingAngle =
      tl.attackRatio > 0.08 && tl.attackRatio < 0.82
        ? -1.2 + ((tl.attackRatio - 0.08) / 0.74) * 2.5
        : windupAngle;
    ctx.save();
    ctx.translate(hx + 28, hy + 22);
    ctx.rotate(swingAngle);
    ctx.drawImage(wSprite, -4, -30, 38, 38);
    ctx.restore();

    if (tl.enemyImpactFlash) {
      const vfxId =
        anim === 'scytheSweep'
          ? 'scythe'
          : anim === 'axeSwing' || anim === 'cleave' || anim === 'shieldBash'
            ? 'cleave'
            : 'slash';
      const arcSprite = getVfxSprite(vfxId, 72, 72);
      if (arcSprite) {
        ctx.drawImage(arcSprite, ex - 26, ey - 8, 72, 72);
      }
    }
  }

  // Impact burst, quality ring & sparks over foe on hero strike
  if (tl.enemyImpactFlash) {
    const impact = getVfxSprite('impact', 58, 58);
    const sparks = getVfxSprite('sparks', 54, 54);
    if (impact) ctx.drawImage(impact, ex - 14, ey - 4, 58, 58);
    if (sparks) ctx.drawImage(sparks, ex - 10, ey + 4, 54, 54);
    ctx.strokeStyle = gradeColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(ex + 16, ey + 24, 18 + (t % 0.25) * 40, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Enemy fighter sprite (topples/dissolves if defeated)
  if (tl.enemyTopple < 0.95) {
    drawEnemyArchetypeSprite(
      ctx,
      archetype,
      ex,
      ey,
      tl.enemyImpactFlash,
      Math.sin(t * 5) * 1.4,
      tl.enemyTopple,
    );
  }
  if (result.won && tl.enemyTopple > 0.25) {
    const steam = getVfxSprite('steam', 52, 52);
    const fade = Math.max(0, 1 - (tl.enemyTopple - 0.25) * 1.35);
    if (steam && fade > 0.05) {
      ctx.save();
      ctx.globalAlpha = fade;
      ctx.drawImage(steam, ex - 8, ey - tl.enemyTopple * 24, 52, 52);
      ctx.restore();
    }
  }

  // Enemy counter-slash VFX when battle is lost
  if (tl.heroImpactFlash) {
    const impact = getVfxSprite('impact', 52, 52);
    if (impact) ctx.drawImage(impact, hx - 8, hy + 4, 52, 52);
  }

  // Floating Pixel Damage / CRIT Callout
  if (tl.damagePopupAlpha > 0.05) {
    const rating = result.breakdown?.weaponRating ?? result.weapon.stats.power * 3;
    const isCrit = grade === 'S' || grade === 'A';
    const dmgText = isCrit ? `CRIT ${rating}!` : `${rating} DMG`;
    const popY = Math.round(ey - 10 - tl.damagePopupYOffset);
    ctx.save();
    ctx.globalAlpha = tl.damagePopupAlpha;
    ctx.font = 'bold 11px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#120c0a';
    ctx.fillText(dmgText, ex + 17, popY + 1);
    ctx.fillStyle = isCrit ? '#fde047' : '#fffbeb';
    ctx.fillText(dmgText, ex + 16, popY);
    ctx.restore();
  }

  ctx.restore();

  // Top Battle Arena HP Bars (unshaken for readability)
  drawArenaHpHud(ctx, result, archetype, tl.heroHpPct, tl.enemyHpPct, portrait);

  // Outcome Banner
  if (tl.bannerAlpha > 0.05) {
    ctx.save();
    ctx.globalAlpha = tl.bannerAlpha;
    ctx.fillStyle = 'rgba(18, 12, 10, 0.90)';
    ctx.fillRect(110, 52, 260, 42);
    ctx.strokeStyle = result.won ? '#facc15' : '#ef4444';
    ctx.lineWidth = 2;
    ctx.strokeRect(110, 52, 260, 42);

    ctx.font = 'bold 14px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = result.won ? '#fde047' : '#f87171';
    ctx.fillText(result.won ? 'VICTORY!' : 'DEFEATED...', 240, 77);
    ctx.textAlign = 'left';
    ctx.restore();
  }
}
