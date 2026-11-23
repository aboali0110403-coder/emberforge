import { projectDailyLedger } from './game/dailyLedger';
import { useCallback, useEffect, useRef, useState } from 'react';
import { soundEngine } from './audio/soundEngine';
import { GameCanvas } from './canvas/GameCanvas';
import type { MinigameFinishPayload } from './canvas/minigames';
import type { WorkshopHotspotId } from './canvas/workshopScene';
import { AchievementsModal } from './components/AchievementsModal';
import { BattleReportModal } from './components/BattleReportModal';
import { CharacterCreator } from './components/CharacterCreator';
import { DebugPanel } from './components/DebugPanel';
import { DeliveryModal, ForgingOverlay } from './components/ForgingOverlay';
import { HudOverlay } from './components/HudOverlay';
import { InventoryModal } from './components/InventoryModal';
import { KingdomMapModal } from './components/KingdomMapModal';
import { LegendaryModal } from './components/LegendaryModal';
import { OrderModal } from './components/OrderModal';
import { RotateHint } from './components/RotateHint';
import { SettingsModal } from './components/SettingsModal';
import { ShopModal } from './components/ShopModal';
import { TitleScreen } from './components/TitleScreen';
import { ACHIEVEMENTS } from './data/achievements';
import { BALANCE } from './data/balance';
import { QUALITY_GRADE_META, getSmithProgress } from './data/config';
import { MATERIALS } from './data/materials';
import { RACES } from './data/races';
import {
  applyBattleClaimResult,
  applyForgeUpgradesToWeapon,
  calculateDeliveryGoldBreakdown,
  calculateForgeXp,
  checkLegendaryMilestone,
  checkProgressiveUnlocks,
  createInitialSaveState,
  createKingLetter,
  decodeBackupCode,
  evaluateAchievements,
  generateCustomerOrder,
  getLegendaryMultiplier,
  getQualityGrade,
  nextUid,
  randInt,
  resolveBattleOutcome,
  resolvePendingBattleResult,
  rollRotatingStock,
  rollWeaponLevelUp,
  sellMaterialFromInventory,
} from './game/rules';
import {
  advanceForgeStep,
  isEditableEventTarget,
  resolveWorkshopKeyAction,
  switchForgeStation,
} from './game/hotkeys';
import {
  clearSaveState,
  loadSaveState,
  loadSaveStateWithStatus,
  persistSaveState,
} from './game/storage';
import {
  advanceAutosave,
  bindLifecyclePersistence,
  deliverSaveWarning,
  persistenceWarning,
  preferHigherWarning,
  resolveContinueSave,
} from './game/saveReliability';
import type { SaveWarning, ShownSaveWarning } from './game/saveReliability';
import {
  advanceArrivalCountdown,
  advanceOrderDeadlines,
  canReceiveNewOrders,
  isSkipNightAvailable,
  skipNight,
} from './game/worldCycle';
import { STRINGS } from './strings';
import type {
  ActiveModal,
  AppScreen,
  AudioSettings,
  BattleResult,
  CompletedOrderRecord,
  DeliverySummary,
  EquipmentId,
  ForgingSession,
  KingLetter,
  MaterialStackSelection,
  Order,
  PlayerCustomization,
  RaceId,
  SaveState,
  StationId,
  WeaponRecord,
} from './types';

export default function App() {
  const initialLoad = useRef(loadSaveStateWithStatus());
  const [storedSave, setStoredSave] = useState<SaveState | null>(initialLoad.current.state);
  const [recoveryNotice, setRecoveryNotice] = useState<string | null>(
    initialLoad.current.recoveredFromBackup
      ? STRINGS.title.corruptRecovered
      : initialLoad.current.corruptedCleared
        ? STRINGS.title.corruptReset
        : null,
  );

  const [screen, setScreen] = useState<AppScreen>('title');
  const [save, setSave] = useState<SaveState | null>(null);
  const [activeModal, setActiveModal] = useState<ActiveModal>(null);
  const [forging, setForging] = useState<ForgingSession | null>(null);
  const [forgePaused, setForgePaused] = useState(false);
  const [liveAccuracy, setLiveAccuracy] = useState(1);
  const [liveStreak, setLiveStreak] = useState(0);
  const [summonCooldownSec, setSummonCooldownSec] = useState(0);

  const [deliverySummary, setDeliverySummary] = useState<DeliverySummary | null>(null);
  const [activeBattleResult, setActiveBattleResult] = useState<BattleResult | null>(null);
  const [legendaryPayload, setLegendaryPayload] = useState<{
    order: Order;
    milestone: number;
    letter: KingLetter;
    popBonus: number;
  } | null>(null);

  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [saveWarning, setSaveWarning] = useState<SaveWarning | null>(null);
  const [showDebug, setShowDebug] = useState(false);
  const [bgPaused, setBgPaused] = useState(false);

  const saveRef = useRef<SaveState | null>(null);
  const autosaveElapsed = useRef(0);
  const ledgerObservation = useRef<SaveState['dailyLedger'] | null>(null);
  const simulationUi = useRef({ activeModal, forging, screen, forgePaused, bgPaused });
  simulationUi.current = { activeModal, forging, screen, forgePaused, bgPaused };
  const pendingSaveWarning = useRef<SaveWarning | null>(null);
  const displayedSaveWarning = useRef<SaveWarning | null>(null);
  const lastSaveWarning = useRef<ShownSaveWarning | null>(null);
  const persistenceFailed = useRef(false);

  // Publish synchronously so back-to-back events always see the latest state.
  // React receives a value, never a replayable updater with side effects.
  const publishSave = useCallback((next: SaveState | null) => {
    saveRef.current = next;
    setSave(next);
  }, []);

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    window.setTimeout(() => {
      setToastMsg((cur) => (cur === msg ? null : cur));
    }, 3400);
  }, []);

  const flushSaveWarning = useCallback(() => {
    const now = Date.now();
    const delivery = deliverSaveWarning(
      pendingSaveWarning.current, displayedSaveWarning.current,
      lastSaveWarning.current, document.hidden, now,
    );
    pendingSaveWarning.current = delivery.pending;
    if (delivery.show) {
      lastSaveWarning.current = { severity: delivery.show.severity, at: now };
      displayedSaveWarning.current = delivery.show;
      setSaveWarning(delivery.show);
    }
  }, []);

  useEffect(() => {
    if (!saveWarning) return;
    const timer = window.setTimeout(() => {
      // An old dismissal must not clear a higher warning queued before render.
      if (displayedSaveWarning.current === saveWarning) {
        displayedSaveWarning.current = null;
        setSaveWarning(null);
      }
    }, 6000);
    return () => window.clearTimeout(timer);
  }, [saveWarning]);

  const persistCurrent = useCallback((next: SaveState, deferWarning = false) => {
    const result = persistSaveState(next);
    persistenceFailed.current = result.status === 'failed';
    if (result.status !== 'failed') {
      autosaveElapsed.current = 0;
      setStoredSave(next);
    }
    const warning = persistenceWarning(result);
    if (warning) {
      pendingSaveWarning.current = preferHigherWarning(pendingSaveWarning.current, warning);
    }
    if (!deferWarning) flushSaveWarning();
    return result;
  }, [flushSaveWarning]);

  const commitSave = useCallback((updater: (prev: SaveState) => SaveState) => {
    const prev = saveRef.current;
    if (!prev) return;
    const next = updater(prev);
    publishSave(next);
    persistCurrent(next);
  }, [persistCurrent, publishSave]);

  useEffect(() => bindLifecyclePersistence(
    document, window, () => saveRef.current,
    (state) => persistCurrent(state, true), flushSaveWarning,
  ), [persistCurrent, flushSaveWarning]);

  // Support ?autostart=1 for immediate testing/play
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('autostart') === '1') {
      const existing = loadSaveState();
      const initial =
        existing ??
        createInitialSaveState({
          name: 'Rowan',
          gender: 'male',
          hairColorIndex: 1,
          skinToneIndex: 0,
          outfitColorIndex: 0,
        });
      publishSave(initial);
      persistCurrent(initial);
      setScreen('workshop');
    }
  }, [publishSave, persistCurrent]);

  // Mirror game state machine to document.body.dataset.state
  useEffect(() => {
    if (screen === 'title' || screen === 'character') {
      document.body.dataset.state = 'title';
    } else if (activeModal === 'settings' || bgPaused || forgePaused) {
      document.body.dataset.state = 'paused';
    } else {
      document.body.dataset.state = 'playing';
    }
  }, [screen, activeModal, bgPaused, forgePaused]);

  // Sync Web Audio settings & music track
  useEffect(() => {
    if (!save) return;
    soundEngine.setSettings(save.audio);
    if (screen !== 'workshop') {
      soundEngine.setMusic('none');
    } else if (activeModal === 'legendary') {
      soundEngine.setMusic('legendary', legendaryPayload?.order.race ?? 'human');
    } else if (activeModal === 'battle') {
      soundEngine.setMusic('battle', activeBattleResult?.race ?? 'human');
    } else if (activeModal === 'map') {
      soundEngine.setMusic('map', save.unlockedRaces[save.unlockedRaces.length - 1] ?? 'human');
    } else {
      const leadRace = save.orders[0]?.race ?? 'human';
      soundEngine.setMusic('workshop', leadRace);
    }
  }, [save?.audio, screen, activeModal, legendaryPayload, activeBattleResult, save?.orders]);

  // Pause audio & active simulation on backgrounding
  useEffect(() => {
    const onVisibility = () => {
      const hidden = document.hidden;
      setBgPaused(hidden);
      soundEngine.setBackgroundPaused(hidden);
    };
    const onBlur = () => {
      soundEngine.setBackgroundPaused(true);
    };
    const onFocus = () => {
      if (!document.hidden) {
        setBgPaused(false);
        soundEngine.setBackgroundPaused(false);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  // Active Play Timer (1 Hz) + 30s Autosave
  useEffect(() => {
    if (screen !== 'workshop' || bgPaused) return;

    const timer = window.setInterval(() => {
      const prev = saveRef.current;
      if (!prev || document.hidden) return;
      setSummonCooldownSec((c) => (c > 0 ? Math.max(0, c - 1) : 0));
      // Deadlines pause in shop, menus, settings, and during mini-game steps
      const deadlinesPaused =
        simulationUi.current.activeModal !== null || simulationUi.current.forging !== null;

      let expiredOrders = prev.orders.slice(0, 0);
      let nextOrders = prev.orders;
      let nextPop = prev.popularity;
      let nextMissed = prev.stats.ordersMissed;
      let nextNoMissStreak = prev.stats.noMissStreak;
      let nextCustomerTimer = prev.nextCustomerTimerSec;

      const advancedPlaySec = prev.activePlaySec + 1;
      if (!deadlinesPaused) {
        const deadlines = advanceOrderDeadlines(prev, 1, BALANCE.popularityMissDeadlinePenalty);
        expiredOrders = deadlines.expiredOrders;
        nextOrders = deadlines.orders;
        nextPop = deadlines.popularity;
        nextMissed = deadlines.ordersMissed;
        nextNoMissStreak = deadlines.noMissStreak;
        for (const ord of deadlines.expiredOrders) {
          showToast(`Missed deadline: ${ord.customerName} (-${BALANCE.popularityMissDeadlinePenalty} Rep)`);
        }

        // Night closes creation only, never the existing deadline processing.
        const arrival = advanceArrivalCountdown(
          advancedPlaySec, nextCustomerTimer, nextOrders.length, BALANCE.maxActiveOrders,
        );
        nextCustomerTimer = arrival.remainingSec;
        if (arrival.arrivalDue) {
          nextOrders = [...nextOrders, generateCustomerOrder(prev)];
          nextCustomerTimer = randInt(
            BALANCE.customerArrivalSecMin,
            BALANCE.customerArrivalSecMax,
          );
        }
      }

      // Pending battles & rotating shop tick in active workshop time (outside settings/title)
      let battleJustReady = false;
      const nextBattles = prev.pendingBattles.map((b) => {
        if (b.ready) return b;
        const eta = Math.max(0, b.etaSec - 1);
        if (eta > 0) return { ...b, etaSec: eta, ready: false };
        battleJustReady = true;
        // Resolve the outcome exactly once, at the readiness transition,
        // and persist it together with the ready state (autosave below).
        return resolvePendingBattleResult({ ...b, etaSec: 0, ready: true });
      });

      let rotTimer = prev.rotatingStockTimerSec - 1;
      let rotStock = prev.rotatingStock;
      if (rotTimer <= 0) {
        rotTimer = BALANCE.rotatingStockRefreshSec;
        const includeEpic = Object.values(prev.popularity).some((v) => v >= 140);
        rotStock = rollRotatingStock(Math.random, includeEpic);
      }

      const orderExpiredOrArrived =
        nextOrders.length !== prev.orders.length || nextMissed !== prev.stats.ordersMissed;

      const next: SaveState = {
        ...prev,
        activePlaySec: advancedPlaySec,
        orders: nextOrders,
        popularity: nextPop,
        pendingBattles: nextBattles,
        rotatingStock: rotStock,
        rotatingStockTimerSec: rotTimer,
        nextCustomerTimerSec: nextCustomerTimer,
        stats: {
          ...prev.stats,
          ordersMissed: nextMissed,
          noMissStreak: nextNoMissStreak,
        },
      };

      next.dailyLedger = projectDailyLedger(prev, next, {
        kind: 'tick', expiredOrders,
        continuous: ledgerObservation.current === prev.dailyLedger,
      });
      ledgerObservation.current = next.dailyLedger;

      const cadence = advanceAutosave(autosaveElapsed.current, 1000);
      autosaveElapsed.current = cadence.elapsedMs;
      publishSave(next);
      if (cadence.due || orderExpiredOrArrived || battleJustReady) {
        persistCurrent(next);
      }
    }, 1000);

    return () => window.clearInterval(timer);
  }, [screen, bgPaused, showToast, publishSave, persistCurrent]);

  const handleSwitchForgeStation = useCallback(
    (mode: { kind: 'index'; index: number } | { kind: 'delta'; delta: 1 | -1 }) => {
      if (!forging) return;
      const res = switchForgeStation(forging, mode);
      if (!res.changed) {
        if (res.reason === 'completed') {
          soundEngine.playWarningTone();
          showToast('Station step already completed.');
        }
        return;
      }
      soundEngine.playUiBlip(720);
      setLiveAccuracy(1);
      setLiveStreak(0);
      setForging(res.session);
    },
    [forging, showToast],
  );

  // Global keyboard shortcuts (workshop modal triggers + forging pause/station hotkeys)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const curSt = forging ? forging.steps[forging.stepIndex] : null;
      const tutorialOpen =
        forging !== null &&
        curSt !== null &&
        saveRef.current !== null &&
        !saveRef.current.tutorialsSeen.stations[curSt];

      const action = resolveWorkshopKeyAction({
        screen,
        forging,
        activeModal,
        showDebug,
        forgePaused,
        showStationTutorial: tutorialOpen,
        key: e.key,
        repeat: e.repeat,
        isEditableTarget: isEditableEventTarget(e.target),
        hasModifier: e.ctrlKey || e.metaKey || e.altKey,
      });

      if (action.type === 'noop') return;

      if (
        action.type === 'switch_station_delta' ||
        action.type === 'switch_station_index'
      ) {
        e.preventDefault();
      }

      switch (action.type) {
        case 'toggle_debug':
          setShowDebug((v) => !v);
          break;
        case 'close_debug':
          setShowDebug(false);
          break;
        case 'toggle_forge_pause':
          setForgePaused((p) => !p);
          break;
        case 'open_station_guide':
          if (curSt) {
            setForgePaused(false);
            commitSave((prev) => ({
              ...prev,
              tutorialsSeen: {
                ...prev.tutorialsSeen,
                stations: {
                  ...prev.tutorialsSeen.stations,
                  [curSt]: false,
                },
              },
            }));
          }
          break;
        case 'switch_station_delta':
          handleSwitchForgeStation({ kind: 'delta', delta: action.delta });
          break;
        case 'switch_station_index':
          handleSwitchForgeStation({ kind: 'index', index: action.index });
          break;
        case 'close_modal':
          setActiveModal(null);
          break;
        case 'open_modal':
          setActiveModal(action.modal);
          break;
        case 'toggle_mute':
          commitSave((prev) => ({
            ...prev,
            audio: { ...prev.audio, muted: !prev.audio.muted },
          }));
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    screen,
    activeModal,
    forging,
    forgePaused,
    showDebug,
    commitSave,
    handleSwitchForgeStation,
  ]);

  const handleContinue = useCallback(() => {
    soundEngine.unlock();
    soundEngine.playUiBlip(740);
    const continuation = resolveContinueSave(
      saveRef.current, persistenceFailed.current, loadSaveState,
    );
    const loaded = continuation.state;
    if (loaded) {
      publishSave(loaded);
      if (continuation.retryLive) persistCurrent(loaded);
      autosaveElapsed.current = 0;
      setRecoveryNotice(null);
      setScreen('workshop');
    }
  }, [publishSave, persistCurrent]);

  const handleStartNewGame = useCallback(() => {
    soundEngine.unlock();
    soundEngine.playUiBlip(680);
    setRecoveryNotice(null);
    setScreen('character');
  }, []);

  const handleCharacterConfirm = useCallback((player: PlayerCustomization) => {
    soundEngine.unlock();
    soundEngine.playLevelUp();
    const fresh = createInitialSaveState(player);
    publishSave(fresh);
    persistCurrent(fresh);
    setScreen('workshop');
    setActiveModal('orders');
  }, [publishSave, persistCurrent]);

  const handleImportBackup = useCallback(
    (code: string): boolean => {
      const parsed = decodeBackupCode(code);
      if (!parsed) return false;
      soundEngine.unlock();
      soundEngine.playLevelUp();
      publishSave(parsed);
      persistCurrent(parsed);
      setRecoveryNotice(null);
      setScreen('workshop');
      setActiveModal(null);
      return true;
    },
    [publishSave, persistCurrent],
  );

  const openBattleModal = useCallback(
    (curSave: SaveState) => {
      const ready = curSave.pendingBattles.find((b) => b.ready);
      if (!ready) return;
      // Consume the outcome persisted when the battle became ready; never
      // reroll here. The fallback covers only a ready battle whose result was
      // never persisted (crash between ticks); it resolves once and persists.
      let result = ready.resolvedResult;
      if (!result || result.battleId !== ready.id) {
        const resolved = resolveBattleOutcome(ready);
        result = resolved;
        commitSave((prev) => {
          const idx = prev.pendingBattles.findIndex((b) => b.id === ready.id);
          if (idx < 0) return prev;
          if (prev.pendingBattles[idx].resolvedResult) return prev;
          const nextBattles = prev.pendingBattles.slice();
          nextBattles[idx] = { ...nextBattles[idx], resolvedResult: resolved };
          return { ...prev, pendingBattles: nextBattles };
        });
      }
      const alreadyConquered = (curSave.conqueredTerritories?.[ready.race] ?? []).includes(
        ready.scenarioName,
      );
      setActiveBattleResult({
        ...result,
        enemyArchetype: ready.enemyArchetype,
        territoryConquered: result.won && !alreadyConquered,
      });
      setActiveModal('battle');
    },
    [commitSave],
  );

  const handleSelectHotspot = useCallback(
    (id: WorkshopHotspotId) => {
      if (!save) return;
      soundEngine.playUiBlip(640);
      if (id === 'counter' || id === 'furnace' || id === 'anvil' || id === 'grindstone' || id === 'quench' || id === 'workbench') {
        setActiveModal('orders');
      } else if (id === 'shop') {
        setActiveModal('shop');
      } else if (id === 'map') {
        setActiveModal('map');
      }
    },
    [save],
  );

  const handleSummonCustomer = useCallback(() => {
    const live = saveRef.current;
    if (!live || !canReceiveNewOrders(live.activePlaySec)) return;
    if (!save || save.orders.length >= BALANCE.maxActiveOrders || summonCooldownSec > 0) return;
    soundEngine.playUiBlip(760);
    setSummonCooldownSec(BALANCE.summonCooldownSec);
    commitSave((prev) => ({
      ...prev,
      orders: [...prev.orders, generateCustomerOrder(prev)],
      nextCustomerTimerSec: randInt(
        BALANCE.customerArrivalSecMin,
        BALANCE.customerArrivalSecMax,
      ),
    }));
  }, [save, summonCooldownSec, commitSave]);

  const handleSkipNight = useCallback(() => {
    const live = saveRef.current;
    const ui = simulationUi.current;
    if (!live || !isSkipNightAvailable(live.activePlaySec, {
      ...ui, hidden: document.hidden, forging: ui.forging !== null,
    })) return;
    const skipped = skipNight(live, BALANCE.popularityMissDeadlinePenalty);
    if (skipped.skippedSec === 0) return;
    const next = {
      ...skipped.state,
      dailyLedger: projectDailyLedger(live, skipped.state, {
        kind: 'skip', expiredOrders: skipped.expiredOrders,
        continuous: ledgerObservation.current === live.dailyLedger,
      }),
    };
    ledgerObservation.current = next.dailyLedger;
    publishSave(next);
    persistCurrent(next);
    for (const ord of skipped.expiredOrders) {
      showToast(`Missed deadline: ${ord.customerName} (-${BALANCE.popularityMissDeadlinePenalty} Rep)`);
    }
  }, [publishSave, persistCurrent, showToast]);

  const handleStartForge = useCallback(
    (
      order: Order,
      steps: StationId[],
      targetPart: string,
      materials: MaterialStackSelection[],
    ) => {
      soundEngine.playUiBlip(820);
      setActiveModal(null);
      setForgePaused(false);
      setLiveAccuracy(1);
      setLiveStreak(0);
      setForging({
        order,
        steps,
        stepIndex: 0,
        stepAccuracies: steps.map(() => 0),
        completedSteps: steps.map(() => false),
        selectedMaterials: materials,
        targetPart,
        streak: 0,
        bestStreakInForge: 0,
      });
      commitSave((prev) => ({
        ...prev,
        tutorialsSeen: { ...prev.tutorialsSeen, firstOrder: true },
      }));
    },
    [commitSave],
  );

  const handleForgeStepFinish = useCallback(
    (payload: MinigameFinishPayload) => {
      if (!forging || !saveRef.current) return;

      const stepOutcome = advanceForgeStep(
        forging,
        payload.accuracy,
        payload.bestStreak,
      );

      if (!stepOutcome.finishedAll) {
        soundEngine.playUiBlip(880);
        setLiveAccuracy(1);
        setLiveStreak(0);
        setForging(stepOutcome.nextSession);
        return;
      }

      const updatedAcc = stepOutcome.accuracies;
      const bestStreak = stepOutcome.nextSession.bestStreakInForge;

      // Final step complete! Compute Quality Q, Grade, Level-Up, Stat Upgrades, XP, Gold & Delivery
      const quality =
        updatedAcc.reduce((a, b) => a + b, 0) / Math.max(1, updatedAcc.length);
      const qualityGrade = getQualityGrade(quality);
      const gradeMeta = QUALITY_GRADE_META[qualityGrade];
      const ord = forging.order;
      const oldLevel = ord.weapon.level;
      const curSave = saveRef.current;

      const { newLevel, evaluation } = rollWeaponLevelUp(
        oldLevel,
        ord.weapon.type,
        quality,
        forging.selectedMaterials,
      );

      const { updated: upgradedWeapon, deltas, trait } = applyForgeUpgradesToWeapon(
        ord.weapon,
        forging.targetPart,
        quality,
        forging.selectedMaterials,
        curSave.equipment,
        newLevel,
        ord.requestFocus,
      );

      const fulfilment =
        ord.kind === 'royal'
          ? 1.15
          : forging.targetPart === ord.targetPart
            ? 1.0
            : 0.75;
      const remainingRatio = ord.deadlineSec > 0 ? ord.remainingSec / ord.deadlineSec : 0;
      const conqueredCount = curSave.conqueredTerritories?.[ord.race]?.length ?? 0;

      const goldBreakdown = calculateDeliveryGoldBreakdown({
        baseFee: ord.baseFee,
        fulfilment,
        quality,
        weaponLevel: oldLevel,
        stacks: forging.selectedMaterials,
        remainingRatio,
        conqueredCount,
        isRoyal: ord.kind === 'royal',
      });
      const goldEarned = goldBreakdown.totalGold;

      const xpEarned = calculateForgeXp(
        newLevel,
        quality,
        ord.kind === 'royal',
        newLevel > oldLevel,
      );
      const smithLevelBefore = getSmithProgress(curSave.smithXp).level;
      const smithLevelAfter = getSmithProgress(curSave.smithXp + xpEarned).level;

      const milestone = checkLegendaryMilestone(upgradedWeapon);
      if (milestone !== null) {
        upgradedWeapon.legendaryNotifiedLevels = [
          ...upgradedWeapon.legendaryNotifiedLevels,
          milestone,
        ];
      }

      soundEngine.playCoin();
      if (newLevel > oldLevel || smithLevelAfter > smithLevelBefore) {
        soundEngine.playLevelUp();
      }

      let newlyUnlockedAch: string[] = [];
      let letterForModal: KingLetter | null = null;
      const reputationPenalty = qualityGrade === 'D' ? gradeMeta.popBonus : 0;

      commitSave((prev) => {
        const nextInv = { ...prev.inventory };
        for (const stack of forging.selectedMaterials) {
          nextInv[stack.materialId] = Math.max(
            0,
            (nextInv[stack.materialId] ?? 0) - stack.units,
          );
          if (nextInv[stack.materialId] === 0) {
            delete nextInv[stack.materialId];
          }
        }

        const racesServedSet = new Set<RaceId>(prev.stats.racesServed);
        racesServedSet.add(ord.race);

        let nextPop = { ...prev.popularity };
        if (reputationPenalty < 0) {
          nextPop[ord.race] = Math.max(0, nextPop[ord.race] + reputationPenalty);
        }

        let nextLetters = prev.kingLetters;
        let nextLegCount = prev.stats.legendaryWeaponsForged;

        if (milestone !== null) {
          nextPop[ord.race] = nextPop[ord.race] + BALANCE.legendaryPopBonus;
          letterForModal = createKingLetter(
            ord.race,
            prev.player.name,
            upgradedWeapon,
            milestone,
          );
          nextLetters = [...prev.kingLetters, letterForModal];
          nextLegCount += 1;
        }

        const etaSec = ord.isTutorial
          ? 10
          : randInt(BALANCE.battleDelayMinSec, BALANCE.battleDelayMaxSec);

        const nextPendingBattle = {
          id: nextUid('bat'),
          orderId: ord.id,
          race: ord.race,
          customerName: ord.customerName,
          portraitVariant: ord.portraitVariant,
          weapon: upgradedWeapon,
          quality,
          fulfilment,
          scenarioName: ord.scenarioName,
          scenarioDifficulty: ord.scenarioDifficulty,
          enemyArchetype: ord.enemyArchetype,
          smithLevel: smithLevelAfter,
          etaSec,
          ready: false,
          rewardMultiplier: getLegendaryMultiplier(upgradedWeapon.level),
          wasRoyal: ord.kind === 'royal',
        };

        const armoryEntry: WeaponRecord = {
          uid: upgradedWeapon.uid,
          type: upgradedWeapon.type,
          level: upgradedWeapon.level,
          quality,
          grade: qualityGrade,
          trait: trait ?? null,
          customerName: ord.customerName,
          race: ord.race,
          stats: upgradedWeapon.stats,
          forgedAt: Date.now(),
        };

        const completedEntry: CompletedOrderRecord = {
          id: ord.id,
          race: ord.race,
          customerName: ord.customerName,
          weaponType: upgradedWeapon.type,
          weaponLevel: upgradedWeapon.level,
          quality,
          grade: qualityGrade,
          goldEarned,
          completedAt: Date.now(),
        };

        const draft: SaveState = {
          ...prev,
          smithXp: prev.smithXp + xpEarned,
          gold: prev.gold + goldEarned,
          inventory: nextInv,
          popularity: nextPop,
          unlockedRaces: checkProgressiveUnlocks(nextPop, prev.unlockedRaces),
          orders: prev.orders.filter((o) => o.id !== ord.id),
          pendingBattles: [...prev.pendingBattles, nextPendingBattle],
          kingLetters: nextLetters,
          weaponArmory: [...(prev.weaponArmory ?? []), armoryEntry].slice(-80),
          completedOrders: [...(prev.completedOrders ?? []), completedEntry].slice(-60),
          stats: {
            ...prev.stats,
            ordersCompleted: prev.stats.ordersCompleted + 1,
            noMissStreak: prev.stats.noMissStreak + 1,
            bestPerfectStreak: Math.max(
              prev.stats.bestPerfectStreak,
              bestStreak,
            ),
            totalGoldEarned: prev.stats.totalGoldEarned + goldEarned,
            racesServed: Array.from(racesServedSet),
            highestWeaponLevel: Math.max(
              prev.stats.highestWeaponLevel,
              upgradedWeapon.level,
            ),
            legendaryWeaponsForged: nextLegCount,
            masterworkCount:
              (prev.stats.masterworkCount ?? 0) + (qualityGrade === 'S' ? 1 : 0),
          },
        };

        const achRes = evaluateAchievements(draft);
        newlyUnlockedAch = achRes.newlyUnlocked;
        if (achRes.newlyUnlocked.length > 0) {
          draft.achievementsUnlocked = [
            ...draft.achievementsUnlocked,
            ...achRes.newlyUnlocked,
          ];
          draft.gold += achRes.goldAwarded;
          draft.stats.totalGoldEarned += achRes.goldAwarded;
        }
        draft.dailyLedger = projectDailyLedger(prev, draft, {
          kind: 'delivery', feeGold: goldEarned,
          continuous: ledgerObservation.current === prev.dailyLedger,
        });
        ledgerObservation.current = draft.dailyLedger;
        return draft;
      });

      const updatedOrder: Order = { ...ord, weapon: upgradedWeapon };
      setForging(null);
      setForgePaused(false);
      setDeliverySummary({
        order: updatedOrder,
        quality,
        qualityGrade,
        masterworkTrait: trait,
        fulfilment,
        goldEarned,
        promptBonusGold: goldBreakdown.promptBonusGold,
        reputationPenalty,
        xpEarned,
        smithLevelBefore,
        smithLevelAfter,
        oldLevel,
        newLevel,
        levelUpChance: evaluation.chance,
        leveledUp: newLevel > oldLevel,
        statDeltas: deltas,
        selectedMaterials: forging.selectedMaterials,
        legendaryMilestone: milestone,
        newAchievements: newlyUnlockedAch,
      });

      if (letterForModal && milestone !== null) {
        setLegendaryPayload({
          order: updatedOrder,
          milestone,
          letter: letterForModal,
          popBonus: BALANCE.legendaryPopBonus,
        });
      }

      if (newlyUnlockedAch.length > 0) {
        const achTitle =
          ACHIEVEMENTS.find((a) => a.id === newlyUnlockedAch[0])?.title ??
          'Achievement';
        showToast(`Achievement Unlocked: ${achTitle}!`);
      }

      setActiveModal('delivery');
    },
    [forging, commitSave, showToast],
  );

  const handleClaimBattle = useCallback(() => {
    if (!activeBattleResult) return;
    soundEngine.playCoin();
    const displayed = activeBattleResult;

    commitSave((prev) => {
      // Consumes the persisted outcome; idempotent if the battle is already
      // claimed, and never rerolls.
      const outcome = applyBattleClaimResult(prev, displayed);
      if (!outcome.claimed) return prev;

      if (outcome.newlyUnlockedAchievements.length > 0) {
        showToast(`Achievement Unlocked!`);
      }

      if (outcome.newlyUnlockedRaces.length > 0) {
        const newest = outcome.newlyUnlockedRaces[outcome.newlyUnlockedRaces.length - 1];
        showToast(`New Kingdom Unlocked: ${RACES[newest].kingdomName}!`);
      }

      return outcome.state;
    });

    setActiveBattleResult(null);
    setActiveModal(null);
  }, [activeBattleResult, commitSave, showToast]);

  const currentStation: StationId | null = forging
    ? forging.steps[forging.stepIndex]
    : null;
  const showStationTutorial =
    forging !== null &&
    currentStation !== null &&
    save !== null &&
    !save.tutorialsSeen.stations[currentStation];

  const deliveryReceiptVisible =
    screen === 'workshop' && save !== null && activeModal === 'delivery' && deliverySummary !== null;

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[#120c0a] select-none">
      {/* Persistent 480x270 Pixel Canvas */}
      <GameCanvas
        mode={screen === 'workshop' ? (forging ? 'forging' : 'workshop') : 'title'}
        save={save}
        forging={forging}
        paused={bgPaused || activeModal === 'settings' || forgePaused}
        tutorialBlocked={showStationTutorial}
        onSelectHotspot={handleSelectHotspot}
        onForgeProgress={(acc, streak) => {
          setLiveAccuracy(acc);
          setLiveStreak(streak);
        }}
        onForgeStepFinish={handleForgeStepFinish}
      />

      {/* Screen: Title */}
      {screen === 'title' && (
        <TitleScreen
          hasSave={storedSave !== null}
          recoveryNotice={recoveryNotice}
          onContinue={handleContinue}
          onNewGame={handleStartNewGame}
          onImportBackup={handleImportBackup}
        />
      )}

      {/* Screen: Character Creation */}
      {screen === 'character' && (
        <CharacterCreator
          onConfirm={handleCharacterConfirm}
          onBack={() => setScreen('title')}
        />
      )}

      {/* Screen: Workshop HUD */}
      {screen === 'workshop' && save && !forging && (
        <HudOverlay
          save={save}
          activeModal={activeModal}
          canSkipNight={isSkipNightAvailable(save.activePlaySec, {
            screen, hidden: document.hidden, bgPaused, activeModal,
            forging: forging !== null, forgePaused,
          })}
          onSkipNight={handleSkipNight}
          onOpenModal={(m) => {
            soundEngine.playUiBlip(660);
            if (m === 'battle') {
              openBattleModal(save);
            } else {
              setActiveModal(m);
            }
          }}
          onToggleMute={() => {
            soundEngine.unlock();
            commitSave((prev) => ({
              ...prev,
              audio: { ...prev.audio, muted: !prev.audio.muted },
            }));
          }}
        />
      )}

      {/* Active Mini-Game Overlay + Pause Menu + Station Tutorial */}
      {screen === 'workshop' && forging && save && (
        <ForgingOverlay
          forging={forging}
          liveAccuracy={liveAccuracy}
          liveStreak={liveStreak}
          showTutorial={showStationTutorial}
          isPaused={forgePaused}
          audio={save.audio}
          onSetPaused={(paused) => setForgePaused(paused)}
          onSwitchStation={(index) =>
            handleSwitchForgeStation({ kind: 'index', index })
          }
          onShowGuide={() => {
            if (!currentStation) return;
            setForgePaused(false);
            commitSave((prev) => ({
              ...prev,
              tutorialsSeen: {
                ...prev.tutorialsSeen,
                stations: {
                  ...prev.tutorialsSeen.stations,
                  [currentStation]: false,
                },
              },
            }));
          }}
          onUpdateAudio={(audio: AudioSettings) => {
            commitSave((prev) => ({ ...prev, audio }));
          }}
          onDismissTutorial={(skipAll) => {
            if (!currentStation) return;
            soundEngine.playUiBlip(740);
            commitSave((prev) => ({
              ...prev,
              tutorialsSeen: {
                firstOrder: true,
                stations: skipAll
                  ? {
                      furnace: true,
                      anvil: true,
                      grindstone: true,
                      quench: true,
                      workbench: true,
                    }
                  : {
                      ...prev.tutorialsSeen.stations,
                      [currentStation]: true,
                    },
              },
            }));
          }}
          onCancelForge={() => {
            setForging(null);
            setForgePaused(false);
            setActiveModal('orders');
          }}
        />
      )}

      {/* Modals */}
      {screen === 'workshop' && save && activeModal === 'orders' && (
        <OrderModal
          save={save}
          summonCooldownSec={summonCooldownSec}
          onClose={() => setActiveModal(null)}
          onSummonCustomer={handleSummonCustomer}
          onStartForge={handleStartForge}
        />
      )}

      {screen === 'workshop' && save && activeModal === 'shop' && (
        <ShopModal
          save={save}
          onClose={() => setActiveModal(null)}
          onBuyMaterial={(materialId, price, isRotating) => {
            soundEngine.playCoin();
            commitSave((prev) => {
              if (prev.gold < price) return prev;
              const nextRot = isRotating
                ? prev.rotatingStock.map((it) =>
                    it.materialId === materialId
                      ? { ...it, stock: Math.max(0, it.stock - 1) }
                      : it,
                  )
                : prev.rotatingStock;
              return {
                ...prev,
                gold: prev.gold - price,
                inventory: {
                  ...prev.inventory,
                  [materialId]: (prev.inventory[materialId] ?? 0) + 1,
                },
                rotatingStock: nextRot,
              };
            });
          }}
          onSellMaterial={(materialId) => {
            soundEngine.playCoin();
            commitSave((prev) => sellMaterialFromInventory(prev, materialId, 1).state);
          }}
          onUpgradeEquipment={(eqId: EquipmentId, cost: number) => {
            soundEngine.playLevelUp();
            commitSave((prev) => {
              if (prev.gold < cost || prev.equipment[eqId] >= 5) return prev;
              const draft: SaveState = {
                ...prev,
                gold: prev.gold - cost,
                equipment: {
                  ...prev.equipment,
                  [eqId]: prev.equipment[eqId] + 1,
                },
              };
              const achRes = evaluateAchievements(draft);
              if (achRes.newlyUnlocked.length > 0) {
                draft.achievementsUnlocked = [
                  ...draft.achievementsUnlocked,
                  ...achRes.newlyUnlocked,
                ];
                draft.gold += achRes.goldAwarded;
                draft.stats.totalGoldEarned += achRes.goldAwarded;
              }
              return draft;
            });
          }}
        />
      )}

      {screen === 'workshop' && save && activeModal === 'inventory' && (
        <InventoryModal save={save} onClose={() => setActiveModal(null)} />
      )}

      {screen === 'workshop' && save && activeModal === 'map' && (
        <KingdomMapModal save={save} onClose={() => setActiveModal(null)} />
      )}

      {screen === 'workshop' && save && activeModal === 'achievements' && (
        <AchievementsModal save={save} onClose={() => setActiveModal(null)} />
      )}

      {deliveryReceiptVisible && deliverySummary && (
        <DeliveryModal
          summary={deliverySummary}
          notification={!saveWarning && toastMsg ? (
            <div className="max-w-full border-2 border-[#fde047] bg-[#1a110e] px-4 py-2 shadow-lg" style={{ overflowWrap: 'anywhere' }}>
              <span className="font-pixel text-xs font-bold text-[#fde047]">{toastMsg}</span>
            </div>
          ) : undefined}
          onConfirm={() => {
            setDeliverySummary(null);
            if (legendaryPayload) {
              soundEngine.playLegendaryFanfare();
              setActiveModal('legendary');
            } else {
              setActiveModal(null);
            }
          }}
        />
      )}

      {screen === 'workshop' && activeModal === 'legendary' && legendaryPayload && (
        <LegendaryModal
          order={legendaryPayload.order}
          milestoneLevel={legendaryPayload.milestone}
          letter={legendaryPayload.letter}
          popBonus={legendaryPayload.popBonus}
          onClose={() => {
            setLegendaryPayload(null);
            setActiveModal(null);
          }}
        />
      )}

      {screen === 'workshop' && activeModal === 'battle' && activeBattleResult && (
        <BattleReportModal result={activeBattleResult} onClaim={handleClaimBattle} />
      )}

      {screen === 'workshop' && save && activeModal === 'settings' && (
        <SettingsModal
          save={save}
          onClose={() => setActiveModal(null)}
          onUpdateAudio={(audio: AudioSettings) => {
            commitSave((prev) => ({ ...prev, audio }));
          }}
          onReplayTutorials={() => {
            commitSave((prev) => ({
              ...prev,
              tutorialsSeen: {
                firstOrder: false,
                stations: {
                  furnace: false,
                  anvil: false,
                  grindstone: false,
                  quench: false,
                  workbench: false,
                },
              },
            }));
          }}
          onImportBackup={handleImportBackup}
          onResetGame={() => {
            const fresh = createInitialSaveState(save.player);
            fresh.audio = save.audio;
            publishSave(fresh);
            persistCurrent(fresh);
            setForging(null);
            setForgePaused(false);
            setActiveModal('orders');
            showToast('Forge reset cleanly.');
          }}
          onDeleteSave={() => {
            clearSaveState();
            setStoredSave(null);
            publishSave(null);
            autosaveElapsed.current = 0;
            pendingSaveWarning.current = null;
            displayedSaveWarning.current = null;
            setSaveWarning(null);
            lastSaveWarning.current = null;
            persistenceFailed.current = false;
            setForging(null);
            setForgePaused(false);
            setActiveModal(null);
            setScreen('title');
          }}
          onReturnToTitle={() => {
            if (saveRef.current) persistCurrent(saveRef.current);
            setActiveModal(null);
            setScreen('title');
          }}
        />
      )}

      {/* Hidden Balance Debug Panel (Key D) */}
      {showDebug && save && (
        <DebugPanel
          onClose={() => setShowDebug(false)}
          onGrantResources={() => {
            commitSave((prev) => {
              const nextInv = { ...prev.inventory };
              for (const m of MATERIALS) {
                nextInv[m.id] = (nextInv[m.id] ?? 0) + 3;
              }
              return { ...prev, gold: prev.gold + 500, inventory: nextInv };
            });
          }}
          onFastForwardBattles={() => {
            commitSave((prev) => ({
              ...prev,
              pendingBattles: prev.pendingBattles.map((b) => ({
                ...b,
                etaSec: 0,
                ready: true,
              })),
            }));
          }}
          onAddPopularities={() => {
            commitSave((prev) => {
              const nextPop = {
                human: prev.popularity.human + 30,
                elf: prev.popularity.elf + 30,
                goblin: prev.popularity.goblin + 30,
                orc: prev.popularity.orc + 30,
                demon: prev.popularity.demon + 30,
              };
              return {
                ...prev,
                popularity: nextPop,
                unlockedRaces: checkProgressiveUnlocks(nextPop, prev.unlockedRaces),
              };
            });
          }}
        />
      )}

      {/* Save warnings sit above the portrait rotate hint; ordinary toasts keep their existing layer. */}
      {(saveWarning || (toastMsg && !deliveryReceiptVisible)) && (
        <div data-testid="global-notification" className={`pointer-events-none fixed bottom-12 left-1/2 ${saveWarning ? 'z-[60]' : 'z-50'} -translate-x-1/2 border-2 border-[#fde047] bg-[#1a110e] px-4 py-2 shadow-lg`}>
          <span className="font-pixel text-xs font-bold text-[#fde047]">{saveWarning?.message ?? toastMsg}</span>
        </div>
      )}

      {/* Mobile Portrait Rotate Hint */}
      <RotateHint />
    </main>
  );
}
