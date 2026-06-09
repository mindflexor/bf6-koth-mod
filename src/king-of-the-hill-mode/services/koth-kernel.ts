/* =================================================================================================
   Mind Flexor - King of the Hill Phase Runtime
   -------------------------------------------------------------------------------------------------
   

   Description:
     - Preserves the prematch, ready-up, prelive, and postmatch phase runtime:
         * Prematch ready-up flow (team switch + ready interactions)
         * Countdown -> Pre-live -> Live -> Postmatch state machine
         * Ticket system with bleed for 2/3 flag control + death ticket loss (after first live deploy)
         * Capture UI (flag letters, on-point counts, progress bar) + remaining time + postmatch overlay
         * Dynamic HQ routing based on owned uncontested flags + furthest-safe fallback
         * Safe-spawn recycling (enemy proximity check) with squad-spawn bypass probing
         * Capture audio (ticks, contested VO, captured stingers) + countdown heartbeat + match start stinger
         * Optional damage zone (AreaTrigger -> periodic damage)

   Usage / Notes:
     - This script assumes specific CapturePoint IDs, HQ IDs, InteractPoint IDs, WorldIcon IDs,
       and Godot PlayerSpawner ObjIds already placed in your level.
     - Keep IDs in sync with your map placement.

   Credits:
     - Enoc Bernal / mindflexor: King of the Hill mode and project integration.
     - BattlefieldDad, Mancour, uberdubersoldat, and dfk_7677: legacy logic inspiration.
     - Mike De Luca: BF6 Portal TypeScript template and utility tooling foundation.

   License:
     - See the repository MIT license.

   Version:
     - v3.5.5
================================================================================================= */

import { Timers } from "bf6-portal-utils/timers/index.ts";

import { RULES } from "../config/rules.ts";
import { KOTH_KERNEL_UI_COLORS, KOTH_KERNEL_UI_COLOR_RGB } from "../config/ui-colors.ts";
import { WORLD_IDS } from "../config/world-ids.ts";
import { KOTH_HILLS } from "../live/config/koth-hills.ts";
import { KOTH_SPAWNS } from "../live/config/koth-spawns.ts";
import { modlib } from "../utils/mod-compat.ts";

/* =================================================================================================
   1) CORE CONFIGURATION
================================================================================================= */

const VERSION = [1, 4, 4];

const TICK_RATE = RULES.tickRate;                    // OngoingGlobal is treated as 30 ticks/sec

// Performance throttles (reduce per-tick work to avoid server Hz drops)
const LIVE_FAST_UPDATE_INTERVAL_TICKS = mod.Max(1, mod.Floor((RULES.timerLanes.liveFastMs / 1000) * TICK_RATE)); // ~10 Hz
const LIVE_SLOW_UPDATE_INTERVAL_TICKS = mod.Max(1, mod.Floor((RULES.timerLanes.liveSlowMs / 1000) * TICK_RATE));  // ~3.3 Hz
const LIVE_ENDGAME_AUDIO_INTERVAL_TICKS = mod.Max(1, mod.Floor((RULES.timerLanes.endgameAudioMs / 1000) * TICK_RATE)); // ~2 Hz
const LIVE_CAPTURE_WATCHDOG_INTERVAL_TICKS = TICK_RATE;
const LIVE_UI_CLOCK_INTERVAL_TICKS = mod.Max(1, mod.Floor((RULES.timerLanes.uiClockMs / 1000) * TICK_RATE));
const INITIAL_TICKETS = RULES.gameplay.initialTickets;

const ROUND_TIME = RULES.roundTimeSeconds;                // seconds
const TOTAL_TICKS = ROUND_TIME * TICK_RATE;

const COUNT_DOWN_TIME = RULES.countdownTimeSeconds;              // legacy countdown seconds (not used by prematch all-ready)
const PRELIVE_TIME = RULES.preliveTimeSeconds;                // seconds (pre-live freeze)
const POSTMATCH_TIME = RULES.postmatchTimeSeconds;              // seconds

const REDEPLOY_TIME = RULES.redeployTimeSeconds;               // live redeploy time
const DEATH_TICKET_LOSS = RULES.gameplay.deathTicketLoss;           // tickets after first live deploy

const BLEED_TWO_FLAGS = RULES.gameplay.bleedPerSecond.twoFlags;           // per second
const BLEED_THREE_FLAGS = RULES.gameplay.bleedPerSecond.threeFlags;           // per second
const BLEED_ONE_FLAG = RULES.gameplay.bleedPerSecond.oneFlag;

// Damage smoothing (applies in OnPlayerDamaged)
const ENABLE_DAMAGE_SMOOTHING = RULES.gameplay.damage.enableSmoothing;   // set to false to disable smoothing


const CAPTURE_TIME = RULES.gameplay.capture.captureSeconds;                 // seconds to capture neutral -> owned
const NEUTRALIZE_TIME = RULES.gameplay.capture.neutralizeSeconds;              // seconds to neutralize owned -> neutral
const CAPTURE_MULTIPLIER_FOR_2_PLAYERS = RULES.gameplay.capture.twoPlayerMultiplier;     // 2 players => 2x speed => time / 2
const CAPTURE_MULTIPLIER_MAX = RULES.gameplay.capture.maxMultiplier;               // cap it (keep BF4-ish, avoids insane speeds)
const CAPTURE_PROGRESS_DELTA_EPSILON = 0.0001;
type CaptureProgressMotionMode = -1 | 0 | 1;

type RgbColor = [number, number, number];

const COLOR_NEUTRAL_RGB: RgbColor = [...KOTH_KERNEL_UI_COLOR_RGB.neutral];
const COLOR_FRIENDLY_RGB: RgbColor = [...KOTH_KERNEL_UI_COLOR_RGB.friendly];
const COLOR_ENEMY_RGB: RgbColor = [...KOTH_KERNEL_UI_COLOR_RGB.enemy];

const COLOR_NEUTRAL = KOTH_KERNEL_UI_COLORS.neutral;
const COLOR_FRIENDLY = KOTH_KERNEL_UI_COLORS.friendly;
const COLOR_ENEMY = KOTH_KERNEL_UI_COLORS.enemy;
/* Capture progress float tolerances */
const PROGRESS_EPSILON = RULES.gameplay.capture.progressEpsilon;
const PROGRESS_FULL = 1 - PROGRESS_EPSILON;
const PROGRESS_EMPTY = PROGRESS_EPSILON;

/* =================================================================================================
   2) TEAM / PHASE STATE
================================================================================================= */

const teamNeutral: mod.Team = mod.GetTeam(0);
const team1: mod.Team = mod.GetTeam(1);
const team2: mod.Team = mod.GetTeam(2);

let kernelKothLiveOverrideEnabled = false;
const RESERVED_SPAWN_POINT_ID = 0;

export function setKernelKothLiveOverrideEnabled(enabled: boolean): void {
  kernelKothLiveOverrideEnabled = enabled;
  if (enabled) {
    SafeSetWidgetVisibleByName("CountDownContainer", false);
    SafeSetWidgetVisibleByName("PreMatchContainer", false);
    SafeSetWidgetVisibleByName("LiveContainer", false);
    setLiveHudVisibleForAllPlayers(false);
  }
}

function isExcludedPlayer(_player: mod.Player): boolean {
  return false;
}

function isParticipantPlayer(player: mod.Player): boolean {
  if (!mod.IsPlayerValid(player)) return false;
  if (isExcludedPlayer(player)) return false;

  const team = mod.GetTeam(player);

  return mod.Equals(team, team1) || mod.Equals(team, team2);
}

/*
  Game status:
    -1: not started
     0: prematch
     1: legacy countdown
     2: pre-live
     3: live
     4: postmatch
*/
let gameStatus: number = -1;

let gameModeStarted: boolean = false;

let serverTickCount: number = 0;
let phaseTickCount: number = 0;
let countDown: number = COUNT_DOWN_TIME;
let lastTicketBleedTimeElapsed = 0;

let initialization: boolean[] = [false, false, false, false, false];

/* Tickets are stored as [team1Tickets, team2Tickets] */
let serverScores: number[] = [INITIAL_TICKETS, INITIAL_TICKETS];
let lastSyncedGameModeScores: [number, number] | null = null;
let scoreboardDirty = true;
let liveHudScoresDirty = true;
let captureTickLoopsDirty = true;
let endgameSuspenseDirty = true;
let liveHudTopFlagsDirty = true;
let liveHudTopFlagDirtyBySymbol: { [symbol: string]: boolean } = { A: true, B: true, C: true };
let liveHudTopFlagBlinkNeutralPhase = false;
let liveHudTopFlagBlinkIntervalHandle: number | undefined = undefined;
let liveHudPulseIntervalHandle: number | undefined = undefined;

let capturePointReconcileFlushes = 0;
let captureLoopDirtyFlushes = 0;
let scoreboardDirtyFlushes = 0;
let liveHudScoreDirtyFlushes = 0;
let endgameAudioFlushes = 0;

function syncDisplayedGameModeScores(force: boolean = false): void {
  const team1Score = mod.Ceiling(serverScores[0]);
  const team2Score = mod.Ceiling(serverScores[1]);

  if (!force && lastSyncedGameModeScores !== null) {
    if (lastSyncedGameModeScores[0] === team1Score && lastSyncedGameModeScores[1] === team2Score) {
      return;
    }
  }

  mod.SetGameModeScore(team1, team1Score);
  mod.SetGameModeScore(team2, team2Score);
  lastSyncedGameModeScores = [team1Score, team2Score];
}

function markScoreboardDirty(): void {
  scoreboardDirty = true;
}

function markLiveHudScoresDirty(): void {
  liveHudScoresDirty = true;
}

function markCaptureTickLoopsDirty(): void {
  captureTickLoopsDirty = true;
}

function markEndgameSuspenseDirty(): void {
  endgameSuspenseDirty = true;
}

function markLiveHudTopFlagLaneDirty(symbol: "A" | "B" | "C"): void {
  liveHudTopFlagsDirty = true;
  liveHudTopFlagDirtyBySymbol[symbol] = true;
}

function markLiveHudTopFlagsDirtyAll(): void {
  liveHudTopFlagsDirty = true;
  liveHudTopFlagDirtyBySymbol.A = true;
  liveHudTopFlagDirtyBySymbol.B = true;
  liveHudTopFlagDirtyBySymbol.C = true;
}

const POSTMATCH_END_STEP_IDLE = 0;
const POSTMATCH_END_STEP_UNDEPLOY_ALL_PLAYERS = 1;
const POSTMATCH_END_STEP_END_GAMEMODE = 2;
const POSTMATCH_END_STEP_COMPLETE = 3;

let postmatchEndStep = 0;
let postmatchEndStepTick = 0;
let postmatchWinnerTeam: mod.Team = teamNeutral;

// Advance undeploy -> endgame one tick at a time so the engine commits each state.
const POSTMATCH_END_STEP_ADVANCE_TICKS = 1;

const PREMATCH_SWITCH_DEBOUNCE_TICKS = 6;
const PRELIVE_TEAM_SWITCH_STABILIZE_TICKS = 10;
let prematchSwitchLastHandledTickByPlayerId: { [playerId: number]: number } = {};
let prematchSwitchDebounceWarnedByPlayerId: { [playerId: number]: boolean } = {};
let lastPrematchTeamSwitchTick = -999999;
let lastPrematchTeamSwitchTickByPlayerId: { [playerId: number]: number } = {};
let prematchStabilizationGateWarnedBySwitchTick: { [switchTick: string]: boolean } = {};
let hqEnableWarnedById: { [hqId: number]: boolean } = {};
let prematchUiGuardWarnedByKey: { [key: string]: boolean } = {};
let prematchHqMapValidationWarnedByKey: { [key: string]: boolean } = {};
let transitionRecoveryWarnedByKey: { [key: string]: boolean } = {};
let capturePointBootstrapContractWarnedById: { [capturePointId: number]: boolean } = {};
let objectiveHighlightWarnedMissingKeyByContext: { [context: string]: boolean } = {};
let objectiveHighlightWarnedMissingSymbolByContext: { [context: string]: boolean } = {};
let objectiveHighlightWarnedBuildFailureByContext: { [context: string]: boolean } = {};
let objectiveHighlightUseLiteralFallback: boolean = false;
let objectiveHighlightHealthChecked: boolean = false;
let objectiveHighlightKeyHealthWarned: boolean = false;
let reservedSpawnIsolationValidated: boolean = false;

const DEBUG_WORLD_LOG_JOIN_EVENTS = false;
const JOIN_WORLD_LOG_THROTTLE_TICKS = 5 * TICK_RATE;
const DEBUG_OBJECTIVE_STRINGKEY_DIAG = false;
const DEBUG_LIVE_PERFORMANCE_DIAGNOSTICS = RULES.debug.livePerformanceDiagnostics;

let joinWorldLogLastTickByPlayerId: { [playerId: number]: number } = {};

let prematchHealthInside889ByPlayerId: { [playerId: number]: boolean } = {};
let prematchHealthAppliedMaxByPlayerId: { [playerId: number]: number } = {};


/* =================================================================================================
   3) WORLD IDS (HQ / CAPTURE POINTS / INTERACT / ICONS / DAMAGE ZONE)
================================================================================================= */

/* Initial HQs (prematch + countdown + prelive) */
const TEAM1_INITIAL_HQ = WORLD_IDS.hq.team1Initial;
const TEAM2_INITIAL_HQ = WORLD_IDS.hq.team2Initial;

/* Prematch ready-up HQs */
const TEAM1_READYUP_HQ = WORLD_IDS.hq.team1Readyup;
const TEAM2_READYUP_HQ = WORLD_IDS.hq.team2Readyup;
let resolvedPrematchHqTeam1Id: number = TEAM1_READYUP_HQ;
let resolvedPrematchHqTeam2Id: number = TEAM2_READYUP_HQ;
let prematchHqFallbackActive = false;

/* Legacy live HQs (disabled during live routing) */
const TEAM1_LIVE_HQ = WORLD_IDS.hq.team1Live;
const TEAM2_LIVE_HQ = WORLD_IDS.hq.team2Live;

/* Per-flag HQs */
const TEAM1_FLAG_A_HQ = WORLD_IDS.hq.team1RouteByKey.A;
const TEAM1_FLAG_B_HQ = WORLD_IDS.hq.team1RouteByKey.B;
const TEAM1_FLAG_C_HQ = WORLD_IDS.hq.team1RouteByKey.C;

const TEAM2_FLAG_A_HQ = WORLD_IDS.hq.team2RouteByKey.A;
const TEAM2_FLAG_B_HQ = WORLD_IDS.hq.team2RouteByKey.B;
const TEAM2_FLAG_C_HQ = WORLD_IDS.hq.team2RouteByKey.C;

/* Two-flag combos */
const TEAM1_AB_HQ = WORLD_IDS.hq.team1RouteByKey.AB;
const TEAM1_AC_HQ = WORLD_IDS.hq.team1RouteByKey.AC;
const TEAM1_BC_HQ = WORLD_IDS.hq.team1RouteByKey.BC;

const TEAM2_AB_HQ = WORLD_IDS.hq.team2RouteByKey.AB;
const TEAM2_AC_HQ = WORLD_IDS.hq.team2RouteByKey.AC;
const TEAM2_BC_HQ = WORLD_IDS.hq.team2RouteByKey.BC;

/* All three flags */
const TEAM1_ABC_HQ = WORLD_IDS.hq.team1RouteByKey.ABC;
const TEAM2_ABC_HQ = WORLD_IDS.hq.team2RouteByKey.ABC;

/* No flags */
const TEAM1_NO_FLAG_HQ = WORLD_IDS.hq.team1RouteByKey.NO;
const TEAM2_NO_FLAG_HQ = WORLD_IDS.hq.team2RouteByKey.NO;

/* CapturePoint IDs */
const CP_A_ID = WORLD_IDS.capturePoints.a;
const CP_B_ID = WORLD_IDS.capturePoints.b;
const CP_C_ID = WORLD_IDS.capturePoints.c;
const EXPECTED_ROUTING_CP_A_ID = 201;
const EXPECTED_ROUTING_CP_C_ID = 203;

/* Prematch InteractPoints (switch team + ready) */
const IP_T1_SWITCH = WORLD_IDS.interactPoints.team1Switch;
const IP_T1_READY = WORLD_IDS.interactPoints.team1Ready;
const IP_T2_SWITCH = WORLD_IDS.interactPoints.team2Switch;
const IP_T2_READY = WORLD_IDS.interactPoints.team2Ready;

/* Reserved live InteractPoint */

/* Prematch WorldIcons */
const WORLDICON_T1_SWITCH = WORLD_IDS.worldIcons.team1Switch;
const WORLDICON_T1_READY = WORLD_IDS.worldIcons.team1Ready;
const WORLDICON_T2_SWITCH = WORLD_IDS.worldIcons.team2Switch;
const WORLDICON_T2_READY = WORLD_IDS.worldIcons.team2Ready;

/* Damage zone AreaTrigger */
const DAMAGE_TRIGGER_ID = WORLD_IDS.areaTriggers.damage;
const RESTRICTED_AREA_TRIGGER = WORLD_IDS.areaTriggers.restricted;
const TEAM1_HQ_PROTECTION_TRIGGER_ID = WORLD_IDS.areaTriggers.team1HqProtection;
const TEAM2_HQ_PROTECTION_TRIGGER_ID = WORLD_IDS.areaTriggers.team2HqProtection;
const PREMATCH_HEALTH_AREA_TRIGGER_ID = WORLD_IDS.areaTriggers.prematchHealth;
const PREMATCH_TEAM1_KILL_TRIGGER_ID = WORLD_IDS.areaTriggers.prematchTeam1Kill;
const PREMATCH_TEAM2_KILL_TRIGGER_ID = WORLD_IDS.areaTriggers.prematchTeam2Kill;
const PREMATCH_HEALTH_NORMAL_MAX = 100;
const PREMATCH_HEALTH_OUTSIDE_MAX = 100;
const PREMATCH_HEALTH_FULL_HEAL_AMOUNT = 9999;

const DAMAGE_PER_PULSE = RULES.gameplay.damage.restrictedPulseDamage;
const DAMAGE_INTERVAL_SECONDS = RULES.gameplay.damage.restrictedPulseIntervalSeconds;
const DAMAGE_INTERVAL_TICKS_RAW = mod.Floor(DAMAGE_INTERVAL_SECONDS * TICK_RATE);
const DAMAGE_INTERVAL_TICKS = DAMAGE_INTERVAL_TICKS_RAW < 1 ? 1 : DAMAGE_INTERVAL_TICKS_RAW;

/* Fire VFX enabled at match start */
const FIRE_IDS = WORLD_IDS.fireVfxIds;
const fireVfx: mod.VFX[] = FIRE_IDS.map((id) => mod.GetVFX(id));


/* =================================================================================================
   4) DYNAMIC ROUTING + SAFE SPAWN (GODOT PLAYERSPAWNERS)
================================================================================================= */

type DynamicRouteKey = "A" | "B" | "C" | "AB" | "AC" | "BC" | "ABC" | "NO";

/*
  Godot PlayerSpawner ObjId mapping.
  Fill arrays with the ObjIds you placed in Godot.
*/
const TEAM1_SPAWNERS_BY_ROUTE: Record<DynamicRouteKey, number[]> = {
  A: WORLD_IDS.dynamicSpawnersByRoute.team1.A,
  B: WORLD_IDS.dynamicSpawnersByRoute.team1.B,
  C: WORLD_IDS.dynamicSpawnersByRoute.team1.C,
  AB: WORLD_IDS.dynamicSpawnersByRoute.team1.AB,
  AC: WORLD_IDS.dynamicSpawnersByRoute.team1.AC,
  BC: WORLD_IDS.dynamicSpawnersByRoute.team1.BC,
  ABC: WORLD_IDS.dynamicSpawnersByRoute.team1.ABC,
  NO: WORLD_IDS.dynamicSpawnersByRoute.team1.NO,
};

const TEAM2_SPAWNERS_BY_ROUTE: Record<DynamicRouteKey, number[]> = {
  A: WORLD_IDS.dynamicSpawnersByRoute.team2.A,
  B: WORLD_IDS.dynamicSpawnersByRoute.team2.B,
  C: WORLD_IDS.dynamicSpawnersByRoute.team2.C,
  AB: WORLD_IDS.dynamicSpawnersByRoute.team2.AB,
  AC: WORLD_IDS.dynamicSpawnersByRoute.team2.AC,
  BC: WORLD_IDS.dynamicSpawnersByRoute.team2.BC,
  ABC: WORLD_IDS.dynamicSpawnersByRoute.team2.ABC,
  NO: WORLD_IDS.dynamicSpawnersByRoute.team2.NO,
};

/* Current HQ routing for each team (safe-spawn and spawn routing use this) */
let currentDynamicHqTeam1: number = TEAM1_INITIAL_HQ;
let currentDynamicHqTeam2: number = TEAM2_INITIAL_HQ;

/* Player routing + safe-spawn state */
let lastDynamicHqForPlayer: { [playerId: number]: number } = {};
// Pending route chosen at deploy time; only committed after a successful safe-spawn check.
let pendingDynamicHqForPlayer: { [playerId: number]: number | undefined } = {};
let safeSpawnSpawnerIndex: { [playerId: number]: number } = {};


let safeSpawnUnsafePending: { [playerId: number]: boolean } = {};
let safeSpawnUnsafeSpawnerObjId: { [playerId: number]: number } = {};
let safeSpawnForcedRedeploys: { [playerId: number]: number } = {};
let safeSpawnPendingCheck: { [playerId: number]: boolean } = {};
let safeSpawnForcedUndeploy: { [playerId: number]: boolean } = {};
let safeSpawnSkipNextSafetyCheck: { [playerId: number]: boolean } = {};
let safeSpawnGenerationByPlayerId: { [playerId: number]: number } = {};
let safeSpawnCheckQueuedGenerationByPlayerId: { [playerId: number]: number | undefined } = {};
let safeSpawnForcedQueuedGenerationByPlayerId: { [playerId: number]: number | undefined } = {};
let squadSpawnBypassClearTimerByPlayerId: { [playerId: number]: number | undefined } = {};

/* HQ DESYNC FIX: detect "spawned at HQ spawner object origin" and recycle spawn */
let hqDesyncForcedRedeploys: { [playerId: number]: number } = {};

const HQ_DESYNC_SPAWNER_EPSILON_METERS = RULES.gameplay.safeSpawn.hqDesyncEpsilonMeters; // treat "0 meters" as <= this threshold (float-safe)
const HQ_DESYNC_MAX_FORCED_REDEPLOYS = RULES.gameplay.safeSpawn.hqDesyncMaxForcedRedeploys;     // safety: prevent infinite loops
const HQ_DESYNC_CHECK_ENABLED = RULES.gameplay.safeSpawn.hqDesyncCheckEnabled;


/* Safe spawn tuning */
const SAFE_SPAWN_CHECK_DELAY_SECONDS = RULES.gameplay.safeSpawn.checkDelaySeconds;
const SAFE_SPAWN_CHECK_DELAY_TICKS = mod.Max(1, mod.Ceiling(SAFE_SPAWN_CHECK_DELAY_SECONDS * TICK_RATE));
const SAFE_SPAWN_CHECK_QUEUE_BUDGET_PER_TICK = RULES.gameplay.safeSpawn.checkQueueBudgetPerTick;
const SAFE_SPAWN_FORCED_QUEUE_BUDGET_PER_TICK = RULES.gameplay.safeSpawn.forcedSpawnQueueBudgetPerTick;
const SAFE_SPAWN_FORCED_SPAWN_DELAY_TICKS = mod.Max(
  1,
  mod.Ceiling(RULES.gameplay.safeSpawn.forcedSpawnDelaySeconds * TICK_RATE)
);

// Radius schedule: 25m down to 8m by the 5th attempt.
const SAFE_SPAWN_RADIUS_START_METERS = RULES.gameplay.safeSpawn.radiusStartMeters;
const SAFE_SPAWN_RADIUS_END_METERS   = RULES.gameplay.safeSpawn.radiusEndMeters;

// Unsafe attempts allowed before forcing a furthest-safe single-flag fallback route.
const SAFE_SPAWN_MAX_FORCED_REDEPLOYS = RULES.gameplay.safeSpawn.maxForcedRedeploys;

// How many attempts to reach END radius (attempt 1..5 => used 0..4)
const SAFE_SPAWN_RADIUS_REACH_END_USED = RULES.gameplay.safeSpawn.radiusReachEndUsed; // used=4 corresponds to attempt 5
const CAPTURE_POINT_THREAT_RADIUS_REFERENCE_DISTANCE_METERS =
  RULES.gameplay.safeSpawn.capturePointThreatRadius.referenceDistanceMeters;
const CAPTURE_POINT_THREAT_RADIUS_REFERENCE_RADIUS_METERS =
  RULES.gameplay.safeSpawn.capturePointThreatRadius.referenceRadiusMeters;
const CAPTURE_POINT_THREAT_RADIUS_MIN_METERS =
  RULES.gameplay.safeSpawn.capturePointThreatRadius.minMeters;
const CAPTURE_POINT_THREAT_RADIUS_MAX_METERS =
  RULES.gameplay.safeSpawn.capturePointThreatRadius.maxMeters;
const LIVE_ROUTE_SWITCH_MARGIN_METERS = RULES.gameplay.safeSpawn.liveRouteSwitchMarginMeters;
const SPATIAL_HASH_CELL_SIZE_METERS = RULES.gameplay.spatialHash.cellSizeMeters;
type SingleFlagRouteKey = "A" | "B" | "C";
const SINGLE_FLAG_ROUTE_KEYS: SingleFlagRouteKey[] = ["A", "C", "B"];

type SafeSpawnCheckReason = "deploy";
type SafeSpawnCheckQueueItem = {
  playerId: number;
  generation: number;
  dueTick: number;
  enqueuedTick: number;
  reason: SafeSpawnCheckReason;
};
type ForcedSafeSpawnStage = "undeploy" | "spawn";
type ForcedSafeSpawnQueueItem = {
  playerId: number;
  generation: number;
  spawnerObjId: number;
  routeKey: SingleFlagRouteKey | null;
  hqId: number;
  stage: ForcedSafeSpawnStage;
  dueTick: number;
  enqueuedTick: number;
  waitTicks: number;
};
type LiveSafeSpawnDiagnostics = {
  checkQueueDepth: number;
  forcedSpawnQueueDepth: number;
  checksProcessed: number;
  forcedSpawnsProcessed: number;
  routeCacheRebuilds: number;
  spatialHashRebuilds: number;
  maxQueueAgeTicks: number;
};

let safeSpawnCheckQueue: SafeSpawnCheckQueueItem[] = [];
let safeSpawnForcedQueue: ForcedSafeSpawnQueueItem[] = [];
let liveSafeSpawnDiagnostics: LiveSafeSpawnDiagnostics = {
  checkQueueDepth: 0,
  forcedSpawnQueueDepth: 0,
  checksProcessed: 0,
  forcedSpawnsProcessed: 0,
  routeCacheRebuilds: 0,
  spatialHashRebuilds: 0,
  maxQueueAgeTicks: 0,
};
let lastLivePerformanceDiagnosticsTick = -999999;

type SingleFlagRouteThreatEval = {
  routeKey: SingleFlagRouteKey;
  owner: mod.Team;
  contested: boolean;
  captureProgress: number;
  capturingTeam: mod.Team;
  friendlyOnPointCount: number;
  enemyOnPointCount: number;
  enemyCountWithinThreatRadius: number;
  hasEnemyWithinThreatRadius: boolean;
  nearestEnemyDistanceToCapturePoint: number;
  enemyCapturingOrNeutralizing: boolean;
  directPressure: boolean;
};

type LiveFlankPressureSnapshot = {
  defaultRouteKey: SingleFlagRouteKey | null;
  chosenRouteKey: SingleFlagRouteKey | null;
  aEnemyCount: number;
  cEnemyCount: number;
  recordedAtTick: number;
};

/* Squad-spawn bypass state */
const SQUAD_SPAWN_DISTANCE = RULES.gameplay.safeSpawn.squadSpawnDistanceMeters;
const SQUAD_SPAWN_BYPASS_LIFETIME_SECONDS = RULES.gameplay.safeSpawn.squadBypassLifetimeSeconds;

let squadSpawnBypass: { [playerId: number]: boolean } = {};
let lastLiveFlankPressureByPlayerId: { [playerId: number]: LiveFlankPressureSnapshot | undefined } = {};
let lastLiveFlankRouteByTeamId: { [teamId: number]: "A" | "C" | undefined } = {};

type SpatialPlayerEntry = {
  id: number;
  player: mod.Player;
  team: mod.Team;
  squad: mod.Squad;
  position: mod.Vector;
};

let livePlayerSpatialHashTick = -999999;
let livePlayerSpatialHashEntries: SpatialPlayerEntry[] = [];
let livePlayerSpatialHashCells: { [cellKey: string]: SpatialPlayerEntry[] } = {};

function getSpatialHashCellSizeMeters(): number {
  const configured = SPATIAL_HASH_CELL_SIZE_METERS;
  if (!Number.isFinite(configured) || configured <= 0) return CAPTURE_POINT_THREAT_RADIUS_MAX_METERS;
  return configured;
}

function getSpatialHashCellCoord(component: number): number {
  return Math.floor(component / getSpatialHashCellSizeMeters());
}

function getSpatialHashCellKey(cellX: number, cellZ: number): string {
  return String(cellX) + ":" + String(cellZ);
}

function getSpatialHashCellKeyFromPosition(position: mod.Vector): string {
  return getSpatialHashCellKey(
    getSpatialHashCellCoord(mod.XComponentOf(position)),
    getSpatialHashCellCoord(mod.ZComponentOf(position))
  );
}

function invalidateLivePlayerSpatialHash(): void {
  livePlayerSpatialHashTick = -999999;
  invalidateSafeRoutePressureCache();
}

function rebuildLivePlayerSpatialHash(): void {
  livePlayerSpatialHashTick = phaseTickCount;
  livePlayerSpatialHashEntries = [];
  livePlayerSpatialHashCells = {};
  liveSafeSpawnDiagnostics.spatialHashRebuilds += 1;

  serverPlayers.forEach((sp) => {
    if (!sp.isDeployed) return;
    if (!mod.IsPlayerValid(sp.player)) return;
    if (!kernelIsPlayerAliveSafe(sp.player)) return;

    const position = getPlayerPosition(sp.player);
    const entry: SpatialPlayerEntry = {
      id: sp.id,
      player: sp.player,
      team: mod.GetTeam(sp.player),
      squad: mod.GetSquad(sp.player),
      position: position,
    };
    const cellKey = getSpatialHashCellKeyFromPosition(position);
    let cellEntries = livePlayerSpatialHashCells[cellKey];
    if (!cellEntries) {
      cellEntries = [];
      livePlayerSpatialHashCells[cellKey] = cellEntries;
    }

    livePlayerSpatialHashEntries.push(entry);
    cellEntries.push(entry);
  });
}

function ensureLivePlayerSpatialHash(): SpatialPlayerEntry[] {
  if (livePlayerSpatialHashTick !== phaseTickCount) {
    rebuildLivePlayerSpatialHash();
  }

  return livePlayerSpatialHashEntries;
}

function getSpatialPlayerEntry(playerId: number): SpatialPlayerEntry | null {
  const entries = ensureLivePlayerSpatialHash();
  for (let i = 0; i < entries.length; i++) {
    if (entries[i].id === playerId) return entries[i];
  }

  return null;
}

function forEachSpatialPlayerNearPosition(
  position: mod.Vector,
  radiusMeters: number,
  callback: (entry: SpatialPlayerEntry) => void
): void {
  ensureLivePlayerSpatialHash();

  const cellSize = getSpatialHashCellSizeMeters();
  const cellRadius = Math.max(0, Math.ceil(radiusMeters / cellSize));
  const centerCellX = getSpatialHashCellCoord(mod.XComponentOf(position));
  const centerCellZ = getSpatialHashCellCoord(mod.ZComponentOf(position));

  for (let x = centerCellX - cellRadius; x <= centerCellX + cellRadius; x++) {
    for (let z = centerCellZ - cellRadius; z <= centerCellZ + cellRadius; z++) {
      const cellEntries = livePlayerSpatialHashCells[getSpatialHashCellKey(x, z)];
      if (!cellEntries) continue;

      for (let i = 0; i < cellEntries.length; i++) {
        callback(cellEntries[i]);
      }
    }
  }
}

function routeKeyFromHqId(hqId: number): DynamicRouteKey {
  // Team 1 routes
  if (hqId === TEAM1_FLAG_A_HQ) return "A";
  if (hqId === TEAM1_FLAG_B_HQ) return "B";
  if (hqId === TEAM1_FLAG_C_HQ) return "C";
  if (hqId === TEAM1_AB_HQ) return "AB";
  if (hqId === TEAM1_AC_HQ) return "AC";
  if (hqId === TEAM1_BC_HQ) return "BC";
  if (hqId === TEAM1_ABC_HQ) return "ABC";
  if (hqId === TEAM1_NO_FLAG_HQ) return "NO";

  // Team 2 routes
  if (hqId === TEAM2_FLAG_A_HQ) return "A";
  if (hqId === TEAM2_FLAG_B_HQ) return "B";
  if (hqId === TEAM2_FLAG_C_HQ) return "C";
  if (hqId === TEAM2_AB_HQ) return "AB";
  if (hqId === TEAM2_AC_HQ) return "AC";
  if (hqId === TEAM2_BC_HQ) return "BC";
  if (hqId === TEAM2_ABC_HQ) return "ABC";
  if (hqId === TEAM2_NO_FLAG_HQ) return "NO";

  return "NO";
}

function getHqIdForTeamAndRoute(team: mod.Team, routeKey: DynamicRouteKey): number {
  if (mod.Equals(team, team1)) {
    if (routeKey === "A") return TEAM1_FLAG_A_HQ;
    if (routeKey === "B") return TEAM1_FLAG_B_HQ;
    if (routeKey === "C") return TEAM1_FLAG_C_HQ;
    if (routeKey === "AB") return TEAM1_AB_HQ;
    if (routeKey === "AC") return TEAM1_AC_HQ;
    if (routeKey === "BC") return TEAM1_BC_HQ;
    if (routeKey === "ABC") return TEAM1_ABC_HQ;
    return TEAM1_NO_FLAG_HQ;
  }

  if (routeKey === "A") return TEAM2_FLAG_A_HQ;
  if (routeKey === "B") return TEAM2_FLAG_B_HQ;
  if (routeKey === "C") return TEAM2_FLAG_C_HQ;
  if (routeKey === "AB") return TEAM2_AB_HQ;
  if (routeKey === "AC") return TEAM2_AC_HQ;
  if (routeKey === "BC") return TEAM2_BC_HQ;
  if (routeKey === "ABC") return TEAM2_ABC_HQ;
  return TEAM2_NO_FLAG_HQ;
}

function getCapturePointBySymbol(symbol: SingleFlagRouteKey): CapturePoint | undefined {
  if (symbol === "A") return serverCapturePoints[CP_A_ID];
  if (symbol === "B") return serverCapturePoints[CP_B_ID];
  return serverCapturePoints[CP_C_ID];
}

function isSingleFlagRouteKey(routeKey: DynamicRouteKey | null | undefined): routeKey is SingleFlagRouteKey {
  return routeKey === "A" || routeKey === "B" || routeKey === "C";
}

function getNearestEnemyDistanceMeters(team: mod.Team, pos: mod.Vector, ignorePlayerId: number): number {
  let nearest = Number.POSITIVE_INFINITY;
  const entries = ensureLivePlayerSpatialHash();

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (entry.id === ignorePlayerId) continue;
    if (mod.Equals(entry.team, team)) continue;

    const d = mod.DistanceBetween(pos, entry.position);
    if (d < nearest) nearest = d;
  }

  return nearest;
}

function getCurrentSingleFlagRouteForTeam(team: mod.Team): SingleFlagRouteKey | null {
  const routeKey = routeKeyFromHqId(mod.Equals(team, team1) ? currentDynamicHqTeam1 : currentDynamicHqTeam2);
  return isSingleFlagRouteKey(routeKey) ? routeKey : null;
}

function getHasCapturedAnyFlagForTeam(team: mod.Team): boolean {
  return mod.Equals(team, team1) ? team1HasCapturedAnyFlag : team2HasCapturedAnyFlag;
}

function getPendingOrCommittedSingleFlagRouteForPlayer(team: mod.Team, playerId: number): SingleFlagRouteKey | null {
  const routeHqId =
    pendingDynamicHqForPlayer[playerId] ??
    lastDynamicHqForPlayer[playerId] ??
    (mod.Equals(team, team1) ? currentDynamicHqTeam1 : currentDynamicHqTeam2) ??
    getNoFlagHqIdForTeam(team);
  const routeKey = routeKeyFromHqId(routeHqId);
  return isSingleFlagRouteKey(routeKey) ? routeKey : null;
}

function chooseOwnershipDrivenSingleFlagRouteForTeam(
  team: mod.Team,
  currentRouteKey: SingleFlagRouteKey | null,
  hasCapturedAnyFlag: boolean
): SingleFlagRouteKey | null {
  if (!hasCapturedAnyFlag) return null;

  const safeOwnedRouteKey = chooseSafeOwnedSingleFlagRouteForTeam(team, currentRouteKey);
  if (safeOwnedRouteKey !== null) return safeOwnedRouteKey;

  return null;
}

function chooseSafeOwnedSingleFlagRouteForTeam(
  team: mod.Team,
  currentRouteKey: SingleFlagRouteKey | null,
  requireAlternateRoute: boolean = false
): SingleFlagRouteKey | null {
  const routeEvalByKey = buildSingleFlagRouteThreatEvalMap(team, liveCapturePointThreatRadiusMeters);
  const ownsB =
    routeEvalByKey.B !== undefined &&
    mod.Equals(routeEvalByKey.B.owner, team);
  let bestSafeOwnedFlankEval: SingleFlagRouteThreatEval | null = null;

  if (ownsB) {
    const ownedFlankRouteKeys: Array<"A" | "C"> = ["A", "C"];

    for (let i = 0; i < ownedFlankRouteKeys.length; i++) {
      const routeKey = ownedFlankRouteKeys[i];
      const routeEval = routeEvalByKey[routeKey];
      if (routeEval === undefined) continue;
      if (!mod.Equals(routeEval.owner, team)) continue;
      if (routeEval.directPressure) continue;

      if (!requireAlternateRoute && routeKey === currentRouteKey) {
        return routeKey;
      }

      if (requireAlternateRoute && routeKey === currentRouteKey) {
        continue;
      }

      if (bestSafeOwnedFlankEval === null || compareSingleFlagRouteThreatEvals(routeEval, bestSafeOwnedFlankEval) > 0) {
        bestSafeOwnedFlankEval = routeEval;
      }
    }

    if (bestSafeOwnedFlankEval !== null) {
      return bestSafeOwnedFlankEval.routeKey;
    }
  }

  let bestSafeOwnedRouteEval: SingleFlagRouteThreatEval | null = null;

  for (let i = 0; i < SINGLE_FLAG_ROUTE_KEYS.length; i++) {
    const routeKey = SINGLE_FLAG_ROUTE_KEYS[i];
    const routeEval = routeEvalByKey[routeKey];
    if (routeEval === undefined) continue;
    if (!mod.Equals(routeEval.owner, team)) continue;
    if (routeEval.directPressure) continue;

    if (!requireAlternateRoute && routeKey === currentRouteKey) {
      return routeKey;
    }

    if (requireAlternateRoute && routeKey === currentRouteKey) {
      continue;
    }

    if (bestSafeOwnedRouteEval === null || compareSingleFlagRouteThreatEvals(routeEval, bestSafeOwnedRouteEval) > 0) {
      bestSafeOwnedRouteEval = routeEval;
    }
  }

  return bestSafeOwnedRouteEval?.routeKey ?? null;
}

function rememberLiveFlankPressureSnapshot(
  playerId: number,
  defaultRouteKey: SingleFlagRouteKey | null,
  chosenRouteKey: SingleFlagRouteKey | null,
  aEnemyCount: number,
  cEnemyCount: number
): void {
  lastLiveFlankPressureByPlayerId[playerId] = {
    defaultRouteKey: defaultRouteKey,
    chosenRouteKey: chosenRouteKey,
    aEnemyCount: aEnemyCount,
    cEnemyCount: cEnemyCount,
    recordedAtTick: phaseTickCount,
  };
}

function getLiveFlankTeamId(team: mod.Team): number | null {
  if (mod.Equals(team, team1)) return 1;
  if (mod.Equals(team, team2)) return 2;
  return null;
}

function getRememberedLiveFlankRouteForTeam(team: mod.Team): "A" | "C" | null {
  const teamId = getLiveFlankTeamId(team);
  if (teamId === null) return null;
  const remembered = lastLiveFlankRouteByTeamId[teamId];
  return remembered === "A" || remembered === "C" ? remembered : null;
}

function rememberLiveFlankRouteForTeam(team: mod.Team, routeKey: SingleFlagRouteKey | null): void {
  if (routeKey !== "A" && routeKey !== "C") return;
  const teamId = getLiveFlankTeamId(team);
  if (teamId === null) return;
  lastLiveFlankRouteByTeamId[teamId] = routeKey;
}

function getLiveFlankTieDefaultRouteForTeam(team: mod.Team, preferredRouteKey: SingleFlagRouteKey | null): "A" | "C" {
  if (preferredRouteKey === "A" || preferredRouteKey === "C") return preferredRouteKey;
  return getRememberedLiveFlankRouteForTeam(team) ?? "A";
}

function countLiveFlankPressureForTeam(team: mod.Team): { aEnemyCount: number; cEnemyCount: number } | null {
  if (!liveRoutingCapturePointPositionsInitialized) return null;

  const cpA = getCapturePointBySymbol("A");
  const cpC = getCapturePointBySymbol("C");
  const aPosition = cpA?.getPosition() ?? null;
  const cPosition = cpC?.getPosition() ?? null;
  if (aPosition === null || cPosition === null) return null;

  return {
    aEnemyCount: countEnemiesNearPosition(team, aPosition, liveCapturePointThreatRadiusMeters, -1),
    cEnemyCount: countEnemiesNearPosition(team, cPosition, liveCapturePointThreatRadiusMeters, -1),
  };
}

function chooseLeastPressureFlankRoute(
  defaultRouteKey: SingleFlagRouteKey | null,
  aEnemyCount: number,
  cEnemyCount: number
): "A" | "C" {
  if (aEnemyCount === cEnemyCount) {
    if (defaultRouteKey === "A" || defaultRouteKey === "C") return defaultRouteKey;
    return "A";
  }

  return aEnemyCount < cEnemyCount ? "A" : "C";
}

function hasSingleFlagSpawnersForTeam(team: mod.Team, routeKey: SingleFlagRouteKey): boolean {
  const spawnerObjIds = getSpawnersForTeamAndRoute(team, routeKey);
  return spawnerObjIds.length > 0;
}

function chooseValidFlankRouteForTeam(team: mod.Team, preferredRouteKey: "A" | "C"): "A" | "C" | null {
  if (hasSingleFlagSpawnersForTeam(team, preferredRouteKey)) return preferredRouteKey;
  const alternateRouteKey: "A" | "C" = preferredRouteKey === "A" ? "C" : "A";
  if (hasSingleFlagSpawnersForTeam(team, alternateRouteKey)) return alternateRouteKey;
  return null;
}

function chooseLiveFlankFallbackRouteForTeam(
  team: mod.Team,
  preferredRouteKey: SingleFlagRouteKey | null
): SingleFlagRouteKey | null {
  const safestRoute = chooseSafestCapturePointRouteForTeam(team);
  if (safestRoute !== null) {
    rememberLiveFlankRouteForTeam(team, safestRoute);
    return safestRoute;
  }

  const tieDefaultRoute = getLiveFlankTieDefaultRouteForTeam(team, preferredRouteKey);
  const chosenFlankRoute = chooseValidFlankRouteForTeam(team, tieDefaultRoute);
  if (chosenFlankRoute !== null) rememberLiveFlankRouteForTeam(team, chosenFlankRoute);
  return chosenFlankRoute;
}

function chooseLiveDeployPressureRedirect(
  eventPlayer: mod.Player,
  playerId: number
): { routeKey: SingleFlagRouteKey; hqId: number; spawnerObjId: number } | null {
  const team = mod.GetTeam(eventPlayer);
  const defaultRouteKey = getPendingOrCommittedSingleFlagRouteForPlayer(team, playerId);
  const pressureCounts = countLiveFlankPressureForTeam(team);
  const aEnemyCount = pressureCounts?.aEnemyCount ?? -1;
  const cEnemyCount = pressureCounts?.cEnemyCount ?? -1;

  if (defaultRouteKey !== "A" && defaultRouteKey !== "B" && defaultRouteKey !== "C") {
    rememberLiveFlankPressureSnapshot(playerId, defaultRouteKey, defaultRouteKey, aEnemyCount, cEnemyCount);
    return null;
  }

  const safeOwnedRouteKey = chooseSafeOwnedSingleFlagRouteForTeam(team, defaultRouteKey);
  if (safeOwnedRouteKey !== null) {
    if (safeOwnedRouteKey === defaultRouteKey) {
      rememberLiveFlankPressureSnapshot(playerId, defaultRouteKey, defaultRouteKey, aEnemyCount, cEnemyCount);
      return null;
    }

    const hqId = getHqIdForTeamAndRoute(team, safeOwnedRouteKey);
    safeSpawnSpawnerIndex[playerId] = 0;
    const spawnerObjId = resolveSpawnerObjIdForRouteKey(playerId, team, safeOwnedRouteKey);
    if (!spawnerObjId) {
      rememberLiveFlankPressureSnapshot(playerId, defaultRouteKey, defaultRouteKey, aEnemyCount, cEnemyCount);
      return null;
    }

    rememberLiveFlankRouteForTeam(team, safeOwnedRouteKey);
    rememberLiveFlankPressureSnapshot(playerId, defaultRouteKey, safeOwnedRouteKey, aEnemyCount, cEnemyCount);
    return {
      routeKey: safeOwnedRouteKey,
      hqId: hqId,
      spawnerObjId: spawnerObjId,
    };
  }

  if (pressureCounts === null) {
    rememberLiveFlankPressureSnapshot(playerId, defaultRouteKey, defaultRouteKey, -1, -1);
    return null;
  }

  if (defaultRouteKey === "B") {
    const bRouteThreat = evaluateSingleFlagRouteThreat(team, "B", liveCapturePointThreatRadiusMeters);
    if (bRouteThreat === null || !bRouteThreat.directPressure) {
      rememberLiveFlankPressureSnapshot(
        playerId,
        defaultRouteKey,
        defaultRouteKey,
        pressureCounts.aEnemyCount,
        pressureCounts.cEnemyCount
      );
      return null;
    }
  }

  const chosenRouteKey = chooseSafestCapturePointRouteForTeam(team);
  if (chosenRouteKey === null) {
    rememberLiveFlankPressureSnapshot(
      playerId,
      defaultRouteKey,
      defaultRouteKey,
      pressureCounts.aEnemyCount,
      pressureCounts.cEnemyCount
    );
    return null;
  }

  rememberLiveFlankRouteForTeam(team, chosenRouteKey);
  rememberLiveFlankPressureSnapshot(
    playerId,
    defaultRouteKey,
    chosenRouteKey,
    pressureCounts.aEnemyCount,
    pressureCounts.cEnemyCount
  );

  if (chosenRouteKey === defaultRouteKey) return null;

  const hqId = getHqIdForTeamAndRoute(team, chosenRouteKey);
  safeSpawnSpawnerIndex[playerId] = 0;
  const spawnerObjId = resolveSpawnerObjIdForRouteKey(playerId, team, chosenRouteKey);
  if (!spawnerObjId) return null;

  return {
    routeKey: chosenRouteKey,
    hqId: hqId,
    spawnerObjId: spawnerObjId,
  };
}

function evaluateSingleFlagRouteThreatFresh(
  team: mod.Team,
  routeKey: SingleFlagRouteKey,
  radiusMeters: number
): SingleFlagRouteThreatEval | null {
  if (!liveRoutingCapturePointPositionsInitialized) return null;

  const cp = getCapturePointBySymbol(routeKey);
  if (!cp) return null;

  const spawnerObjIds = getSpawnersForTeamAndRoute(team, routeKey);
  if (!spawnerObjIds || spawnerObjIds.length <= 0) return null;

  const capturePointPosition = cp.getPosition();
  if (capturePointPosition === null) return null;

  const onPoint = cp.getOnPoint();
  const friendlyOnPointCount = mod.Equals(team, team1) ? onPoint[0] : onPoint[1];
  const enemyOnPointCount = mod.Equals(team, team1) ? onPoint[1] : onPoint[0];
  const contested = friendlyOnPointCount > 0 && enemyOnPointCount > 0;
  const owner = cp.getOwner();
  const captureProgress = cp.getCaptureProgress();
  const capturingTeam = cp.getProgressTeam();
  const phase = getCapturePointPhase(cp);
  const ownsB =
    routeKey !== "B" &&
    mod.Equals(owner, team) &&
    (() => {
      const cpB = getCapturePointBySymbol("B");
      return cpB !== undefined && mod.Equals(cpB.getOwner(), team);
    })();
  const enemyCapturingOrNeutralizing =
    (phase === "capturing_neutral" || phase === "neutralizing_enemy") &&
    !mod.Equals(capturingTeam, teamNeutral) &&
    !mod.Equals(capturingTeam, team);
  const enemyCountWithinThreatRadius = countEnemiesNearPosition(team, capturePointPosition, radiusMeters, -1);
  const hasEnemyWithinThreatRadius = enemyCountWithinThreatRadius > 0;
  const nearestEnemyDistanceToCapturePoint = getNearestEnemyDistanceMeters(team, capturePointPosition, -1);
  const radiusEnemyThreshold = ownsB ? 2 : 1;
  const directPressure =
    contested ||
    enemyCapturingOrNeutralizing ||
    enemyCountWithinThreatRadius >= radiusEnemyThreshold;

  return {
    routeKey: routeKey,
    owner: owner,
    contested: contested,
    captureProgress: captureProgress,
    capturingTeam: capturingTeam,
    friendlyOnPointCount: friendlyOnPointCount,
    enemyOnPointCount: enemyOnPointCount,
    enemyCountWithinThreatRadius: enemyCountWithinThreatRadius,
    hasEnemyWithinThreatRadius: hasEnemyWithinThreatRadius,
    nearestEnemyDistanceToCapturePoint: nearestEnemyDistanceToCapturePoint,
    enemyCapturingOrNeutralizing: enemyCapturingOrNeutralizing,
    directPressure: directPressure,
  };
}

function evaluateSingleFlagRouteThreat(
  team: mod.Team,
  routeKey: SingleFlagRouteKey,
  radiusMeters: number
): SingleFlagRouteThreatEval | null {
  if (radiusMeters !== liveCapturePointThreatRadiusMeters) {
    return evaluateSingleFlagRouteThreatFresh(team, routeKey, radiusMeters);
  }

  return getSafeRoutePressureCacheForTeam(team).singleFlagThreatByRoute[routeKey] ?? null;
}

function buildSingleFlagRouteThreatEvalMap(
  team: mod.Team,
  radiusMeters: number
): Partial<Record<SingleFlagRouteKey, SingleFlagRouteThreatEval>> {
  const routeEvalByKey: Partial<Record<SingleFlagRouteKey, SingleFlagRouteThreatEval>> = {};

  for (let i = 0; i < SINGLE_FLAG_ROUTE_KEYS.length; i++) {
    const routeKey = SINGLE_FLAG_ROUTE_KEYS[i];
    const evalResult = evaluateSingleFlagRouteThreat(team, routeKey, radiusMeters);
    if (evalResult !== null) routeEvalByKey[routeKey] = evalResult;
  }

  return routeEvalByKey;
}

function buildLegalSingleFlagRouteKeysForTeam(
  team: mod.Team,
  routeEvalByKey: Partial<Record<SingleFlagRouteKey, SingleFlagRouteThreatEval>>,
  hasCapturedAnyFlag: boolean
): SingleFlagRouteKey[] {
  const routeKeySet: Partial<Record<SingleFlagRouteKey, true>> = {};

  const routeA = routeEvalByKey.A ?? null;
  const routeB = routeEvalByKey.B ?? null;
  const routeC = routeEvalByKey.C ?? null;

  const ownsA = routeA !== null && mod.Equals(routeA.owner, team);
  const ownsB = routeB !== null && mod.Equals(routeB.owner, team);
  const ownsC = routeC !== null && mod.Equals(routeC.owner, team);
  const ownedCount = (ownsA ? 1 : 0) + (ownsB ? 1 : 0) + (ownsC ? 1 : 0);

  if (ownedCount <= 0) {
    if (!hasCapturedAnyFlag) return [];
    routeKeySet.A = true;
    routeKeySet.C = true;
    return SINGLE_FLAG_ROUTE_KEYS.filter((routeKey) => routeKeySet[routeKey] === true);
  }

  if (ownsA) routeKeySet.A = true;
  if (ownsB) routeKeySet.B = true;
  if (ownsC) routeKeySet.C = true;

  if (ownedCount === 1) {
    if (ownsA && routeA !== null && routeA.directPressure) routeKeySet.C = true;
    if (ownsB && routeB !== null && routeB.directPressure) {
      routeKeySet.A = true;
      routeKeySet.C = true;
    }
    if (ownsC && routeC !== null && routeC.directPressure) routeKeySet.A = true;
  }

  return SINGLE_FLAG_ROUTE_KEYS.filter((routeKey) => routeKeySet[routeKey] === true);
}

function getSingleFlagRouteTieBreakPriority(routeKey: SingleFlagRouteKey): number {
  if (routeKey === "A") return 0;
  if (routeKey === "C") return 1;
  return 2;
}

function compareSingleFlagRouteThreatEvals(
  candidate: SingleFlagRouteThreatEval,
  incumbent: SingleFlagRouteThreatEval
): number {
  const candidateSafe = !candidate.directPressure;
  const incumbentSafe = !incumbent.directPressure;
  if (candidateSafe !== incumbentSafe) return candidateSafe ? 1 : -1;

  if (candidate.nearestEnemyDistanceToCapturePoint !== incumbent.nearestEnemyDistanceToCapturePoint) {
    return candidate.nearestEnemyDistanceToCapturePoint > incumbent.nearestEnemyDistanceToCapturePoint ? 1 : -1;
  }

  return getSingleFlagRouteTieBreakPriority(candidate.routeKey) < getSingleFlagRouteTieBreakPriority(incumbent.routeKey)
    ? 1
    : -1;
}

type CapturePointRoutePressureEval = {
  routeKey: SingleFlagRouteKey;
  enemyCapturingOrNeutralizing: boolean;
  enemyCount: number;
  nearestEnemyDistance: number;
};

type SafeRoutePressureCache = {
  tick: number;
  radiusMeters: number;
  teamId: number;
  capturePointPressureByRoute: Partial<Record<SingleFlagRouteKey, CapturePointRoutePressureEval>>;
  singleFlagThreatByRoute: Partial<Record<SingleFlagRouteKey, SingleFlagRouteThreatEval>>;
};

let safeRoutePressureCacheByTeamId: { [teamId: number]: SafeRoutePressureCache | undefined } = {};

function getSafeRoutePressureTeamId(team: mod.Team): number {
  if (mod.Equals(team, team1)) return 1;
  if (mod.Equals(team, team2)) return 2;
  return 0;
}

function invalidateSafeRoutePressureCache(): void {
  safeRoutePressureCacheByTeamId = {};
}

function evaluateCapturePointRoutePressureForTeamFresh(
  team: mod.Team,
  routeKey: SingleFlagRouteKey,
  radiusMeters: number
): CapturePointRoutePressureEval | null {
  if (!liveRoutingCapturePointPositionsInitialized) return null;
  if (!hasSingleFlagSpawnersForTeam(team, routeKey)) return null;

  const cp = getCapturePointBySymbol(routeKey);
  if (!cp) return null;

  const capturePointPosition = cp.getPosition();
  if (capturePointPosition === null) return null;

  const phase = getCapturePointPhase(cp);
  const progressTeam = cp.getProgressTeam();
  const enemyCapturingOrNeutralizing =
    (phase === "capturing_neutral" || phase === "neutralizing_enemy") &&
    !mod.Equals(progressTeam, teamNeutral) &&
    !mod.Equals(progressTeam, team);

  return {
    routeKey: routeKey,
    enemyCapturingOrNeutralizing: enemyCapturingOrNeutralizing,
    enemyCount: countEnemiesNearPosition(team, capturePointPosition, radiusMeters, -1),
    nearestEnemyDistance: getNearestEnemyDistanceMeters(team, capturePointPosition, -1),
  };
}

function buildSafeRoutePressureCacheForTeam(team: mod.Team): SafeRoutePressureCache {
  ensureLivePlayerSpatialHash();

  const teamId = getSafeRoutePressureTeamId(team);
  const cache: SafeRoutePressureCache = {
    tick: phaseTickCount,
    radiusMeters: liveCapturePointThreatRadiusMeters,
    teamId: teamId,
    capturePointPressureByRoute: {},
    singleFlagThreatByRoute: {},
  };

  for (let i = 0; i < SINGLE_FLAG_ROUTE_KEYS.length; i++) {
    const routeKey = SINGLE_FLAG_ROUTE_KEYS[i];
    const capturePressure = evaluateCapturePointRoutePressureForTeamFresh(
      team,
      routeKey,
      liveCapturePointThreatRadiusMeters
    );
    if (capturePressure !== null) cache.capturePointPressureByRoute[routeKey] = capturePressure;

    const singleFlagThreat = evaluateSingleFlagRouteThreatFresh(team, routeKey, liveCapturePointThreatRadiusMeters);
    if (singleFlagThreat !== null) cache.singleFlagThreatByRoute[routeKey] = singleFlagThreat;
  }

  safeRoutePressureCacheByTeamId[teamId] = cache;
  liveSafeSpawnDiagnostics.routeCacheRebuilds += 1;
  return cache;
}

function getSafeRoutePressureCacheForTeam(team: mod.Team): SafeRoutePressureCache {
  const teamId = getSafeRoutePressureTeamId(team);
  const existing = safeRoutePressureCacheByTeamId[teamId];
  if (
    existing !== undefined &&
    existing.tick === phaseTickCount &&
    existing.radiusMeters === liveCapturePointThreatRadiusMeters
  ) {
    return existing;
  }

  return buildSafeRoutePressureCacheForTeam(team);
}

function evaluateCapturePointRoutePressureForTeam(
  team: mod.Team,
  routeKey: SingleFlagRouteKey,
  radiusMeters: number
): CapturePointRoutePressureEval | null {
  if (radiusMeters !== liveCapturePointThreatRadiusMeters) {
    return evaluateCapturePointRoutePressureForTeamFresh(team, routeKey, radiusMeters);
  }

  return getSafeRoutePressureCacheForTeam(team).capturePointPressureByRoute[routeKey] ?? null;
}

function compareCapturePointRoutePressureEvals(
  candidate: CapturePointRoutePressureEval,
  incumbent: CapturePointRoutePressureEval
): number {
  if (candidate.enemyCapturingOrNeutralizing !== incumbent.enemyCapturingOrNeutralizing) {
    return candidate.enemyCapturingOrNeutralizing ? -1 : 1;
  }

  if (candidate.enemyCount !== incumbent.enemyCount) {
    return candidate.enemyCount < incumbent.enemyCount ? 1 : -1;
  }

  if (candidate.nearestEnemyDistance !== incumbent.nearestEnemyDistance) {
    return candidate.nearestEnemyDistance > incumbent.nearestEnemyDistance ? 1 : -1;
  }

  return getSingleFlagRouteTieBreakPriority(candidate.routeKey) < getSingleFlagRouteTieBreakPriority(incumbent.routeKey)
    ? 1
    : -1;
}

function chooseSafestCapturePointRouteForTeam(team: mod.Team): SingleFlagRouteKey | null {
  let bestEval: CapturePointRoutePressureEval | null = null;

  for (let i = 0; i < SINGLE_FLAG_ROUTE_KEYS.length; i++) {
    const routeKey = SINGLE_FLAG_ROUTE_KEYS[i];
    const routeEval = evaluateCapturePointRoutePressureForTeam(team, routeKey, liveCapturePointThreatRadiusMeters);
    if (routeEval === null) continue;

    if (bestEval === null || compareCapturePointRoutePressureEvals(routeEval, bestEval) > 0) {
      bestEval = routeEval;
    }
  }

  return bestEval?.routeKey ?? null;
}

function chooseLiveSingleFlagRouteForTeam(
  team: mod.Team,
  currentRouteKey: SingleFlagRouteKey | null,
  preferCurrentRouteWithinMargin: boolean,
  hasCapturedAnyFlag: boolean
): SingleFlagRouteKey | null {
  const routeEvalByKey = buildSingleFlagRouteThreatEvalMap(team, liveCapturePointThreatRadiusMeters);
  const legalRouteKeys = buildLegalSingleFlagRouteKeysForTeam(team, routeEvalByKey, hasCapturedAnyFlag);
  const routeEvals: SingleFlagRouteThreatEval[] = [];

  for (let i = 0; i < legalRouteKeys.length; i++) {
    const routeEval = routeEvalByKey[legalRouteKeys[i]];
    if (routeEval !== undefined) routeEvals.push(routeEval);
  }

  if (routeEvals.length <= 0) return null;

  const currentRouteEval =
    currentRouteKey !== null && legalRouteKeys.indexOf(currentRouteKey) >= 0
      ? (routeEvalByKey[currentRouteKey] ?? null)
      : null;

  // Do not flip routes unless the active legal route is under direct pressure.
  if (currentRouteEval !== null && !currentRouteEval.directPressure) return currentRouteEval.routeKey;

  let bestRouteEval = routeEvals[0];
  for (let i = 1; i < routeEvals.length; i++) {
    if (compareSingleFlagRouteThreatEvals(routeEvals[i], bestRouteEval) > 0) {
      bestRouteEval = routeEvals[i];
    }
  }

  if (!preferCurrentRouteWithinMargin || currentRouteEval === null) return bestRouteEval.routeKey;
  if (bestRouteEval.routeKey === currentRouteEval.routeKey) return currentRouteEval.routeKey;

  if (bestRouteEval.directPressure === currentRouteEval.directPressure) {
    const nearestEnemyDistanceGain =
      bestRouteEval.nearestEnemyDistanceToCapturePoint - currentRouteEval.nearestEnemyDistanceToCapturePoint;
    if (nearestEnemyDistanceGain < LIVE_ROUTE_SWITCH_MARGIN_METERS) {
      return currentRouteEval.routeKey;
    }
  }

  return bestRouteEval.routeKey;
}

function isSingleFlagRouteUnderDirectPressure(team: mod.Team, routeKey: SingleFlagRouteKey): boolean {
  const routeThreat = evaluateSingleFlagRouteThreat(team, routeKey, liveCapturePointThreatRadiusMeters);
  return routeThreat !== null && routeThreat.directPressure;
}

function chooseLiveDynamicHqForTeam(team: mod.Team, hasCapturedAnyFlag: boolean): number {
  if (!hasCapturedAnyFlag) return getInitialSpawnPointObjIdForTeam(team);

  const currentRouteKey = getCurrentSingleFlagRouteForTeam(team);
  const ownershipRouteKey = chooseOwnershipDrivenSingleFlagRouteForTeam(team, currentRouteKey, hasCapturedAnyFlag);

  if (ownershipRouteKey === null) {
    const flankFallbackRoute = chooseLiveFlankFallbackRouteForTeam(team, currentRouteKey);
    if (flankFallbackRoute !== null) return getHqIdForTeamAndRoute(team, flankFallbackRoute);

    const currentRouteHqId = mod.Equals(team, team1) ? currentDynamicHqTeam1 : currentDynamicHqTeam2;
    return isValidDynamicSpawnId(currentRouteHqId) ? currentRouteHqId : getInitialSpawnPointObjIdForTeam(team);
  }

  if (ownershipRouteKey === "B" && isSingleFlagRouteUnderDirectPressure(team, "B")) {
    const flankFallbackRoute = chooseLiveFlankFallbackRouteForTeam(team, currentRouteKey);
    if (flankFallbackRoute !== null) return getHqIdForTeamAndRoute(team, flankFallbackRoute);
  }

  if (ownershipRouteKey === "A" || ownershipRouteKey === "C") {
    rememberLiveFlankRouteForTeam(team, ownershipRouteKey);
  }

  return getHqIdForTeamAndRoute(team, ownershipRouteKey);
}

function markHqRoutingDirty(): void {
  hqRoutingDirty = true;
  invalidateSafeRoutePressureCache();
}

function getCapturePointTopFlagSymbol(cp: CapturePoint): "A" | "B" | "C" | null {
  return cp.symbol === "A" || cp.symbol === "B" || cp.symbol === "C" ? cp.symbol : null;
}

function markCapturePointTopFlagLaneDirty(cp: CapturePoint | undefined): void {
  if (!cp) return;
  const symbol = getCapturePointTopFlagSymbol(cp);
  if (symbol === null) return;
  markLiveHudTopFlagLaneDirty(symbol);
}

function refreshCapturePointsEngineStateForUI(): boolean {
  let changed = false;
  invalidateSafeRoutePressureCache();

  Object.values(serverCapturePoints).forEach((cp) => {
    const previousSnapshot = createCapturePointStateSnapshot(cp);

    refreshCapturePointFromEngine(cp);

    const nextSnapshot = createCapturePointStateSnapshot(cp);
    const captureStateChanged = didCapturePointStateChange(previousSnapshot, nextSnapshot);

    if (captureStateChanged) changed = true;

    cp.updateUIforPlayersOnPoint();
    cp.setUIProgressForPlayersOnPoint();

    if (!mod.Equals(previousSnapshot.owner, nextSnapshot.owner) || previousSnapshot.phase !== nextSnapshot.phase) {
      markCapturePointTopFlagLaneDirty(cp);
    }
  });

  syncLiveHudTopFlagBlinkTimer();
  return changed;
}

function recomputeLiveHqRouting(forceImmediate: boolean = false, captureStateAlreadyFresh: boolean = false): void {
  // Debounce: avoid doing this multiple times in the same tick if several events fire together.
  if (!forceImmediate && lastHqRoutingUpdateTick === phaseTickCount) return;
  lastHqRoutingUpdateTick = phaseTickCount;

  // Keep our cached CP state fresh before computing live routing.
  if (!captureStateAlreadyFresh) {
    refreshCapturePointsEngineStateForUI();
  }

  UpdateFlagHQSpawns();

  hqRoutingDirty = false;
}

function refreshLiveHqRoutingFromObjectiveEvent(captureStateAlreadyFresh: boolean = false): void {
  if (gameStatus !== 3) return;
  markHqRoutingDirty();
  recomputeLiveHqRouting(true, captureStateAlreadyFresh);
}

function isReservedSpawnPointId(spawnerObjId: number): boolean {
  return RESERVED_SPAWN_POINT_ID > 0 && spawnerObjId === RESERVED_SPAWN_POINT_ID;
}

function filterReservedSpawnPointIds(spawnerObjIds: number[] | undefined): number[] {
  if (!spawnerObjIds || spawnerObjIds.length <= 0) return [];
  return spawnerObjIds.filter((spawnerObjId) => !isReservedSpawnPointId(spawnerObjId));
}

function sanitizeParticipantSpawnerObjId(spawnerObjId: number): number {
  if (!spawnerObjId || spawnerObjId <= 0) return 0;
  return isReservedSpawnPointId(spawnerObjId) ? 0 : spawnerObjId;
}

function resolveReservedRecoverySpawnPoint(): number {
  const routeKeys: DynamicRouteKey[] = ["NO", "A", "B", "C", "AB", "AC", "BC", "ABC"];
  const candidates: number[] = [
    TEAM1_INITIAL_HQ,
    TEAM2_INITIAL_HQ,
    TEAM1_NO_FLAG_HQ,
    TEAM2_NO_FLAG_HQ,
  ];

  for (let index = 0; index < routeKeys.length; index++) {
    const routeKey = routeKeys[index];
    candidates.push(...TEAM1_SPAWNERS_BY_ROUTE[routeKey]);
    candidates.push(...TEAM2_SPAWNERS_BY_ROUTE[routeKey]);
  }

  for (let index = 0; index < candidates.length; index++) {
    const candidate = sanitizeParticipantSpawnerObjId(candidates[index]);

    if (candidate > 0) {
      return candidate;
    }
  }

  return 0;
}

function getSpawnersForTeamAndRoute(team: mod.Team, routeKey: DynamicRouteKey): number[] {
  const configured = mod.Equals(team, team1) ? TEAM1_SPAWNERS_BY_ROUTE[routeKey] : TEAM2_SPAWNERS_BY_ROUTE[routeKey];
  return filterReservedSpawnPointIds(configured);
}

function getInitialSpawnPointObjIdForTeam(team: mod.Team): number {
  // Initial HQ spawn during countdown / match start.
  // We use the HQ id directly here (these are configured as the initial HQ spawns in the experience).
  const configured = mod.Equals(team, team1) ? TEAM1_INITIAL_HQ : TEAM2_INITIAL_HQ;
  return sanitizeParticipantSpawnerObjId(configured);
}

function getNoFlagHqIdForTeam(team: mod.Team): number {
  return mod.Equals(team, team1) ? TEAM1_NO_FLAG_HQ : TEAM2_NO_FLAG_HQ;
}
function commitPendingDynamicHqForPlayer(playerId: number): void {
  const pending = pendingDynamicHqForPlayer[playerId];
  if (pending && isValidDynamicSpawnId(pending)) {
    lastDynamicHqForPlayer[playerId] = pending;
  }
  pendingDynamicHqForPlayer[playerId] = undefined;
}

/*
  Resolve a spawn ObjId from a specific route key.
  - Falls back to NO if the requested route has no spawners.
  - Returns 0 if nothing exists at all (defensive).
*/
function resolveSpawnerObjIdForRouteKey(playerId: number, team: mod.Team, routeKey: DynamicRouteKey): number {
  const list = getSpawnersForTeamAndRoute(team, routeKey);
  const finalList = list && list.length > 0 ? list : getSpawnersForTeamAndRoute(team, "NO");

  if (!finalList || finalList.length <= 0) return 0;

  const idx = safeSpawnSpawnerIndex[playerId] ?? 0;
  const chosen = finalList[idx % finalList.length];

  safeSpawnSpawnerIndex[playerId] = (idx + 1) % finalList.length;

  return sanitizeParticipantSpawnerObjId(chosen);
}

function HqDesyncCheckAndRecycle(playerId: number): void {
  const playerState = serverPlayers.get(playerId);
  if (!playerState) return;

  const eventPlayer = playerState.player;
  if (!mod.IsPlayerValid(eventPlayer)) return;

  // If we're already in a safe-spawn recycle flow, don't add another recycle on top.
  if (safeSpawnUnsafePending[playerId] === true) return;
  if (safeSpawnForcedUndeploy[playerId] === true) return;

  const retries = hqDesyncForcedRedeploys[playerId] ?? 0;
  if (retries >= HQ_DESYNC_MAX_FORCED_REDEPLOYS) return;

  const team = mod.GetTeam(eventPlayer);

  // Determine the dynamic HQ spawner object ID the player is currently routed to.
  const routeHqId =
    pendingDynamicHqForPlayer[playerId] ??
    lastDynamicHqForPlayer[playerId] ??
    (mod.Equals(team, team1) ? currentDynamicHqTeam1 : currentDynamicHqTeam2) ??
    getNoFlagHqIdForTeam(team);

  // Defensive: if we somehow don't have a route, do nothing.
  if (!routeHqId) return;

  // HQ spawner object position (signature for the bug case).
  const hqSpawnerPos = mod.GetObjectPosition(mod.GetSpawnPoint(routeHqId));

  // Actual player position right after deploy.
  const playerPos = getPlayerPosition(eventPlayer);

  const distToHqSpawner = mod.DistanceBetween(playerPos, hqSpawnerPos);

  // If they spawned essentially on the HQ spawner object, treat as desync spawn -> recycle.
  if (distToHqSpawner > HQ_DESYNC_SPAWNER_EPSILON_METERS) return;

  hqDesyncForcedRedeploys[playerId] = retries + 1;

  // Use your existing safe-spawn routing to pick the correct spawnpoint from the route list.
  const spawnerObjId = resolveSafeSpawnSpawnerObjId(playerId, team);
  if (!spawnerObjId) return;

  queueForcedSpawnRetry(playerId, spawnerObjId, null, routeHqId);
}

function resolveSafeSpawnSpawnerObjId(playerId: number, team: mod.Team): number {
  const routeHqId =
    pendingDynamicHqForPlayer[playerId] ??
    lastDynamicHqForPlayer[playerId] ??
    (mod.Equals(team, team1) ? currentDynamicHqTeam1 : currentDynamicHqTeam2) ??
    getNoFlagHqIdForTeam(team);

  // If routing is pointing to an initial HQ, spawn directly from the initial HQ spawn point.
  if (routeHqId === TEAM1_INITIAL_HQ || routeHqId === TEAM2_INITIAL_HQ) {
    return getInitialSpawnPointObjIdForTeam(team);
  }

  const routeKey = routeKeyFromHqId(routeHqId);
  return resolveSpawnerObjIdForRouteKey(playerId, team, routeKey);
}

function getPlayerPosition(player: mod.Player): mod.Vector {
  return mod.GetSoldierState(player, mod.SoldierStateVector.GetPosition);
}

function getObjIdSafe(target: unknown): number {
  if (target === undefined || target === null) return -1;
  try {
    const id = Number(mod.GetObjId(target as any));
    return Number.isFinite(id) ? id : -1;
  } catch (_err) {
    return -1;
  }
}

function kernelIsPlayerAlive(player: mod.Player): boolean {
  return mod.GetSoldierState(player, mod.SoldierStateBool.IsAlive);
}

function kernelIsPlayerAliveSafe(player: mod.Player): boolean {
  try {
    return kernelIsPlayerAlive(player);
  } catch (_err) {
    return false;
  }
}

function isSquadSpawnBypassActive(playerId: number): boolean {
  return squadSpawnBypass[playerId] === true;
}

function getSafeSpawnGeneration(playerId: number): number {
  return safeSpawnGenerationByPlayerId[playerId] ?? 0;
}

function bumpSafeSpawnGeneration(playerId: number): number {
  const nextGeneration = getSafeSpawnGeneration(playerId) + 1;
  safeSpawnGenerationByPlayerId[playerId] = nextGeneration;
  return nextGeneration;
}

function resetLiveSafeSpawnDiagnostics(): void {
  liveSafeSpawnDiagnostics = {
    checkQueueDepth: 0,
    forcedSpawnQueueDepth: 0,
    checksProcessed: 0,
    forcedSpawnsProcessed: 0,
    routeCacheRebuilds: 0,
    spatialHashRebuilds: 0,
    maxQueueAgeTicks: 0,
  };
  lastLivePerformanceDiagnosticsTick = -999999;
}

function markSafeSpawnQueueAge(enqueuedTick: number): void {
  const ageTicks = phaseTickCount - enqueuedTick;
  if (ageTicks > liveSafeSpawnDiagnostics.maxQueueAgeTicks) {
    liveSafeSpawnDiagnostics.maxQueueAgeTicks = ageTicks;
  }
}

function updateSafeSpawnQueueDepthDiagnostics(): void {
  liveSafeSpawnDiagnostics.checkQueueDepth = safeSpawnCheckQueue.length;
  liveSafeSpawnDiagnostics.forcedSpawnQueueDepth = safeSpawnForcedQueue.length;
}

function clearSafeSpawnCheckTimer(playerId: number): void {
  delete safeSpawnCheckQueuedGenerationByPlayerId[playerId];
  safeSpawnPendingCheck[playerId] = false;
}

function clearSafeSpawnRetryTimer(playerId: number): void {
  delete safeSpawnForcedQueuedGenerationByPlayerId[playerId];
}

function clearSquadSpawnBypassTimer(playerId: number): void {
  Timers.clear(squadSpawnBypassClearTimerByPlayerId[playerId]);
  delete squadSpawnBypassClearTimerByPlayerId[playerId];
}

function clearSpawnRoutingTimersForPlayer(playerId: number): void {
  clearSafeSpawnCheckTimer(playerId);
  clearSafeSpawnRetryTimer(playerId);
  clearSquadSpawnBypassTimer(playerId);
}

function resetTransientSpawnRoutingStateForPlayer(playerId: number): void {
  bumpSafeSpawnGeneration(playerId);
  clearSpawnRoutingTimersForPlayer(playerId);

  delete pendingDynamicHqForPlayer[playerId];
  delete safeSpawnUnsafeSpawnerObjId[playerId];
  delete safeSpawnPendingCheck[playerId];
  delete safeSpawnUnsafePending[playerId];
  delete safeSpawnForcedUndeploy[playerId];
  delete safeSpawnSkipNextSafetyCheck[playerId];
  delete squadSpawnBypass[playerId];
  delete lastLiveFlankPressureByPlayerId[playerId];
}

function resetSpawnRoutingStateForPlayer(playerId: number): void {
  resetTransientSpawnRoutingStateForPlayer(playerId);

  delete lastDynamicHqForPlayer[playerId];
  delete safeSpawnSpawnerIndex[playerId];
  delete safeSpawnForcedRedeploys[playerId];
  delete hqDesyncForcedRedeploys[playerId];
}

function resetAllSpawnRoutingState(): void {
  Object.keys(squadSpawnBypassClearTimerByPlayerId).forEach((playerId) => clearSquadSpawnBypassTimer(Number(playerId)));

  lastDynamicHqForPlayer = {};
  pendingDynamicHqForPlayer = {};
  safeSpawnSpawnerIndex = {};
  safeSpawnUnsafePending = {};
  safeSpawnUnsafeSpawnerObjId = {};
  safeSpawnForcedRedeploys = {};
  safeSpawnPendingCheck = {};
  safeSpawnForcedUndeploy = {};
  safeSpawnSkipNextSafetyCheck = {};
  safeSpawnGenerationByPlayerId = {};
  safeSpawnCheckQueuedGenerationByPlayerId = {};
  safeSpawnForcedQueuedGenerationByPlayerId = {};
  safeSpawnCheckQueue = [];
  safeSpawnForcedQueue = [];
  squadSpawnBypassClearTimerByPlayerId = {};
  squadSpawnBypass = {};
  lastLiveFlankPressureByPlayerId = {};
  lastLiveFlankRouteByTeamId = {};
  hqDesyncForcedRedeploys = {};
  resetLiveSafeSpawnDiagnostics();
  invalidateLivePlayerSpatialHash();
}

function scheduleSquadSpawnBypassClear(playerId: number): void {
  clearSquadSpawnBypassTimer(playerId);

  squadSpawnBypassClearTimerByPlayerId[playerId] = Timers.setTimeout(() => {
    delete squadSpawnBypassClearTimerByPlayerId[playerId];
    squadSpawnBypass[playerId] = false;
  }, SQUAD_SPAWN_BYPASS_LIFETIME_SECONDS * 1000);
}

function checkIfSpawnedOnSquadmate(player: mod.Player): boolean {
  const playerId = modlib.getPlayerId(player);
  const playerEntry = getSpatialPlayerEntry(playerId);
  const playerSquad = playerEntry?.squad ?? mod.GetSquad(player);
  const playerPosition = playerEntry?.position ?? getPlayerPosition(player);
  let spawnedOnSquadmate = false;

  forEachSpatialPlayerNearPosition(playerPosition, SQUAD_SPAWN_DISTANCE, (entry) => {
    if (spawnedOnSquadmate) return;
    if (entry.id === playerId) return;
    if (!mod.Equals(entry.squad, playerSquad)) return;

    const distance = mod.DistanceBetween(playerPosition, entry.position);
    if (distance <= SQUAD_SPAWN_DISTANCE) {
      spawnedOnSquadmate = true;
    }
  });

  return spawnedOnSquadmate;
}

function hasEnemyNearPosition(team: mod.Team, pos: mod.Vector, radiusMeters: number, ignorePlayerId: number): boolean {
  return countEnemiesNearPosition(team, pos, radiusMeters, ignorePlayerId) > 0;
}

function countEnemiesNearPosition(team: mod.Team, pos: mod.Vector, radiusMeters: number, ignorePlayerId: number): number {
  let count = 0;

  forEachSpatialPlayerNearPosition(pos, radiusMeters, (entry) => {
    if (entry.id === ignorePlayerId) return;
    if (mod.Equals(entry.team, team)) return;

    const d = mod.DistanceBetween(pos, entry.position);
    if (d <= radiusMeters) count += 1;
  });

  return count;
}
const FRIENDLY_SPAWN_BYPASS_RADIUS_METERS = RULES.gameplay.safeSpawn.friendlySpawnBypassMeters;

function isSpawnNearFriendlyPlayer(eventPlayer: mod.Player, playerId: number, radiusMeters: number): boolean {
  if (!mod.IsPlayerValid(eventPlayer)) return false;
  if (!kernelIsPlayerAlive(eventPlayer)) return false;

  const myTeam = mod.GetTeam(eventPlayer);
  const myEntry = getSpatialPlayerEntry(playerId);
  const myPos = myEntry?.position ?? getPlayerPosition(eventPlayer);

  let nearFriendly = false;

  forEachSpatialPlayerNearPosition(myPos, radiusMeters, (entry) => {
    if (nearFriendly) return;

    // ignore self
    if (entry.id === playerId) return;

    if (!mod.Equals(entry.team, myTeam)) return;

    const d = mod.DistanceBetween(myPos, entry.position);
    if (d <= radiusMeters) {
      nearFriendly = true;
    }
  });

  return nearFriendly;
}

function isValidDynamicSpawnId(id: number): boolean {
  return id >= TEAM1_FLAG_A_HQ && id <= TEAM2_NO_FLAG_HQ;
}
function getSafeSpawnEnemyRadiusMeters(attemptUsed: number): number {
  // attemptUsed: 0 on attempt 1, 1 on attempt 2, etc.
  // We want:
  //  used=0 => 25m  (attempt 1)
  //  used=4 => 8m   (attempt 5)
  //  used>=4 => stay at 8m
  let u = attemptUsed;
  if (u < 0) u = 0;
  if (u > SAFE_SPAWN_RADIUS_REACH_END_USED) u = SAFE_SPAWN_RADIUS_REACH_END_USED;

  const t = SAFE_SPAWN_RADIUS_REACH_END_USED <= 0 ? 1 : (u / SAFE_SPAWN_RADIUS_REACH_END_USED); // 0..1

  return SAFE_SPAWN_RADIUS_START_METERS + (SAFE_SPAWN_RADIUS_END_METERS - SAFE_SPAWN_RADIUS_START_METERS) * t;
}





/*
  Safe spawn check:
    - Runs shortly after deploy (live only).
    - If enemy is within the safe-spawn radius, force one undeploy and re-spawn from the
      numeric PlayerSpawner ObjId for the safest A/B/C capture-point route.
    - Route safety is scored from enemy positions near capture points, never PlayerSpawner positions.
    - Bypasses recycling if it looks like a squad spawn.
*/
function resolveSafestCapturePointSpawnCorrection(
  playerId: number,
  team: mod.Team
): { routeKey: SingleFlagRouteKey; hqId: number; spawnerObjId: number } | null {
  const routeKey = chooseSafestCapturePointRouteForTeam(team);
  if (routeKey === null) return null;

  const hqId = getHqIdForTeamAndRoute(team, routeKey);
  safeSpawnSpawnerIndex[playerId] = 0;

  const spawnerObjId = resolveSpawnerObjIdForRouteKey(playerId, team, routeKey);
  if (!spawnerObjId) return null;

  return {
    routeKey: routeKey,
    hqId: hqId,
    spawnerObjId: spawnerObjId,
  };
}

function enqueueSafeSpawnCheck(playerId: number, dueTick: number, reason: SafeSpawnCheckReason): void {
  const playerState = serverPlayers.get(playerId);
  if (!playerState) return;
  if (gameStatus !== 3) return;
  if (safeSpawnUnsafePending[playerId] === true) return;

  const generation = getSafeSpawnGeneration(playerId);
  if (safeSpawnCheckQueuedGenerationByPlayerId[playerId] === generation) return;

  safeSpawnCheckQueuedGenerationByPlayerId[playerId] = generation;
  safeSpawnCheckQueue.push({
    playerId: playerId,
    generation: generation,
    dueTick: dueTick,
    enqueuedTick: phaseTickCount,
    reason: reason,
  });
  updateSafeSpawnQueueDepthDiagnostics();
}

function isSafeSpawnCheckQueueItemCurrent(item: SafeSpawnCheckQueueItem): boolean {
  if (safeSpawnCheckQueuedGenerationByPlayerId[item.playerId] !== item.generation) return false;
  if (getSafeSpawnGeneration(item.playerId) !== item.generation) return false;
  return serverPlayers.get(item.playerId) !== undefined;
}

function isForcedSafeSpawnQueueItemCurrent(item: ForcedSafeSpawnQueueItem): boolean {
  if (safeSpawnForcedQueuedGenerationByPlayerId[item.playerId] !== item.generation) return false;
  if (getSafeSpawnGeneration(item.playerId) !== item.generation) return false;
  return serverPlayers.get(item.playerId) !== undefined;
}

function queueForcedSpawnRetry(
  playerId: number,
  spawnerObjId: number,
  routeKey: SingleFlagRouteKey | null,
  hqId: number
): void {
  const playerState = serverPlayers.get(playerId);
  if (!playerState) return;
  if (!spawnerObjId) return;

  const generation = getSafeSpawnGeneration(playerId);
  if (safeSpawnForcedQueuedGenerationByPlayerId[playerId] === generation) return;
  safeSpawnForcedUndeploy[playerId] = true;
  safeSpawnUnsafePending[playerId] = true;
  safeSpawnUnsafeSpawnerObjId[playerId] = spawnerObjId;
  safeSpawnSkipNextSafetyCheck[playerId] = true;

  safeSpawnForcedQueuedGenerationByPlayerId[playerId] = generation;
  safeSpawnForcedQueue.push({
    playerId: playerId,
    generation: generation,
    spawnerObjId: spawnerObjId,
    routeKey: routeKey,
    hqId: hqId,
    stage: "undeploy",
    dueTick: phaseTickCount + 1,
    enqueuedTick: phaseTickCount,
    waitTicks: 0,
  });
  updateSafeSpawnQueueDepthDiagnostics();
}

function finalizeSafeSpawnSuccess(eventPlayer: mod.Player, playerId: number): void {
  if (HQ_DESYNC_CHECK_ENABLED) {
    HqDesyncCheckAndRecycle(playerId);
  }
  if (safeSpawnUnsafePending[playerId] !== true) {
    safeSpawnForcedUndeploy[playerId] = false;
  }
}

function runSafeSpawnCheckOrRedeploy(playerId: number, generation: number): void {
  if (safeSpawnPendingCheck[playerId] === true) return;
  if (safeSpawnUnsafePending[playerId] === true) return;
  if (generation !== getSafeSpawnGeneration(playerId)) return;

  const p = serverPlayers.get(playerId);
  if (!p) return;

  const eventPlayer = p.player;
  if (!mod.IsPlayerValid(eventPlayer)) return;

  safeSpawnPendingCheck[playerId] = true;

  try {
    if (safeSpawnSkipNextSafetyCheck[playerId] === true) {
      delete safeSpawnSkipNextSafetyCheck[playerId];
      safeSpawnForcedRedeploys[playerId] = 0;
      commitPendingDynamicHqForPlayer(playerId);
      finalizeSafeSpawnSuccess(eventPlayer, playerId);
      return;
    }

    // 1) Hard bypass if spawn is near ANY friendly within 8m
    if (isSpawnNearFriendlyPlayer(eventPlayer, playerId, FRIENDLY_SPAWN_BYPASS_RADIUS_METERS)) {
      safeSpawnForcedRedeploys[playerId] = 0;
      commitPendingDynamicHqForPlayer(playerId);
      finalizeSafeSpawnSuccess(eventPlayer, playerId);
      return;
    }


    // 2) Keep your existing bypass if you still want it
    if (isSquadSpawnBypassActive(playerId)) {
      safeSpawnForcedRedeploys[playerId] = 0;
      commitPendingDynamicHqForPlayer(playerId);
      finalizeSafeSpawnSuccess(eventPlayer, playerId);
      return;
    }

    if (gameStatus !== 3) return;
    if (!p.isDeployed) return;
    if (!kernelIsPlayerAlive(eventPlayer)) return;

    const team = mod.GetTeam(eventPlayer);
    const pressureRedirect = chooseLiveDeployPressureRedirect(eventPlayer, playerId);
    if (pressureRedirect !== null) {
      safeSpawnForcedRedeploys[playerId] = 0;
      pendingDynamicHqForPlayer[playerId] = pressureRedirect.hqId;
      queueForcedSpawnRetry(playerId, pressureRedirect.spawnerObjId, pressureRedirect.routeKey, pressureRedirect.hqId);
      return;
    }

    const radius = SAFE_SPAWN_RADIUS_START_METERS;

    // If this looks like a squad spawn, do not force recycle.
    if (checkIfSpawnedOnSquadmate(eventPlayer)) {
      safeSpawnForcedRedeploys[playerId] = 0;
      commitPendingDynamicHqForPlayer(playerId);
      finalizeSafeSpawnSuccess(eventPlayer, playerId);
      return;
    }

    const playerEntry = getSpatialPlayerEntry(playerId);
    const pos = playerEntry?.position ?? getPlayerPosition(eventPlayer);
    const unsafe = hasEnemyNearPosition(team, pos, radius, playerId);

    if (!unsafe) {
      // Successful safe spawn: reset attempt counter.
      safeSpawnForcedRedeploys[playerId] = 0;
      commitPendingDynamicHqForPlayer(playerId);
      finalizeSafeSpawnSuccess(eventPlayer, playerId);
      return;
    }

    const correction = resolveSafestCapturePointSpawnCorrection(playerId, team);
    if (correction === null) {
      finalizeSafeSpawnSuccess(eventPlayer, playerId);
      return;
    }

    pendingDynamicHqForPlayer[playerId] = correction.hqId;
    safeSpawnForcedRedeploys[playerId] = 0;
    queueForcedSpawnRetry(playerId, correction.spawnerObjId, correction.routeKey, correction.hqId);
  } finally {
    safeSpawnPendingCheck[playerId] = false;
  }
}

function SafeSpawnCheckOrRedeploy(playerId: number): void {
  clearSafeSpawnCheckTimer(playerId);
  if (safeSpawnUnsafePending[playerId] === true) return;
  enqueueSafeSpawnCheck(playerId, phaseTickCount + SAFE_SPAWN_CHECK_DELAY_TICKS, "deploy");
}

function processSafeSpawnCheckQueue(): void {
  if (gameStatus !== 3 || safeSpawnCheckQueue.length <= 0) {
    updateSafeSpawnQueueDepthDiagnostics();
    return;
  }

  let processed = 0;
  const remaining: SafeSpawnCheckQueueItem[] = [];

  for (let i = 0; i < safeSpawnCheckQueue.length; i++) {
    const item = safeSpawnCheckQueue[i];

    if (!isSafeSpawnCheckQueueItemCurrent(item)) {
      continue;
    }

    if (processed >= SAFE_SPAWN_CHECK_QUEUE_BUDGET_PER_TICK || item.dueTick > phaseTickCount) {
      remaining.push(item);
      continue;
    }

    delete safeSpawnCheckQueuedGenerationByPlayerId[item.playerId];
    markSafeSpawnQueueAge(item.enqueuedTick);
    processed += 1;
    liveSafeSpawnDiagnostics.checksProcessed += 1;
    runSafeSpawnCheckOrRedeploy(item.playerId, item.generation);
  }

  safeSpawnCheckQueue = remaining;
  updateSafeSpawnQueueDepthDiagnostics();
}

function processForcedSafeSpawnQueue(): void {
  if (gameStatus !== 3 || safeSpawnForcedQueue.length <= 0) {
    updateSafeSpawnQueueDepthDiagnostics();
    return;
  }

  let processed = 0;
  const remaining: ForcedSafeSpawnQueueItem[] = [];

  for (let i = 0; i < safeSpawnForcedQueue.length; i++) {
    const item = safeSpawnForcedQueue[i];

    if (!isForcedSafeSpawnQueueItemCurrent(item)) {
      continue;
    }

    if (processed >= SAFE_SPAWN_FORCED_QUEUE_BUDGET_PER_TICK || item.dueTick > phaseTickCount) {
      remaining.push(item);
      continue;
    }

    const playerState = serverPlayers.get(item.playerId);
    if (!playerState) continue;

    const player = playerState.player;
    if (!mod.IsPlayerValid(player)) {
      delete safeSpawnForcedQueuedGenerationByPlayerId[item.playerId];
      safeSpawnUnsafePending[item.playerId] = false;
      safeSpawnUnsafeSpawnerObjId[item.playerId] = 0;
      continue;
    }

    markSafeSpawnQueueAge(item.enqueuedTick);
    processed += 1;

    if (item.stage === "undeploy") {
      safeSpawnForcedUndeploy[item.playerId] = true;
      safeSpawnUnsafePending[item.playerId] = true;
      safeSpawnUnsafeSpawnerObjId[item.playerId] = item.spawnerObjId;
      safeSpawnSkipNextSafetyCheck[item.playerId] = true;
      playerState.isDeployed = false;
      invalidateLivePlayerSpatialHash();

      mod.SetRedeployTime(player, 9999);
      mod.DisplayNotificationMessage(mod.Message(mod.stringkeys.SafeSpawnRetryToast), player);
      mod.UndeployPlayer(player);

      remaining.push({
        playerId: item.playerId,
        generation: item.generation,
        spawnerObjId: item.spawnerObjId,
        routeKey: item.routeKey,
        hqId: item.hqId,
        stage: "spawn",
        dueTick: phaseTickCount + SAFE_SPAWN_FORCED_SPAWN_DELAY_TICKS,
        enqueuedTick: item.enqueuedTick,
        waitTicks: 0,
      });
      continue;
    }

    if (playerState.isDeployed && item.waitTicks < TICK_RATE) {
      remaining.push({
        playerId: item.playerId,
        generation: item.generation,
        spawnerObjId: item.spawnerObjId,
        routeKey: item.routeKey,
        hqId: item.hqId,
        stage: "spawn",
        dueTick: phaseTickCount + 1,
        enqueuedTick: item.enqueuedTick,
        waitTicks: item.waitTicks + 1,
      });
      continue;
    }

    safeSpawnUnsafePending[item.playerId] = false;
    safeSpawnUnsafeSpawnerObjId[item.playerId] = 0;
    delete safeSpawnForcedQueuedGenerationByPlayerId[item.playerId];

    mod.SetRedeployTime(player, 0);
    mod.SpawnPlayerFromSpawnPoint(player, item.spawnerObjId);
    mod.SetRedeployTime(player, REDEPLOY_TIME);
    liveSafeSpawnDiagnostics.forcedSpawnsProcessed += 1;
  }

  safeSpawnForcedQueue = remaining;
  updateSafeSpawnQueueDepthDiagnostics();
}

function processLiveSafeSpawnQueues(): void {
  processForcedSafeSpawnQueue();
  processSafeSpawnCheckQueue();
}

function maybeEmitLivePerformanceDiagnostics(): void {
  if (!DEBUG_LIVE_PERFORMANCE_DIAGNOSTICS) return;
  if (gameStatus !== 3) return;
  if (serverTickCount - lastLivePerformanceDiagnosticsTick < 10 * TICK_RATE) return;

  lastLivePerformanceDiagnosticsTick = serverTickCount;
  updateSafeSpawnQueueDepthDiagnostics();
  const summary =
    "[LIVE PERF] sq/fq/chk/fsp/rcache/shash/maxAge " +
    String(liveSafeSpawnDiagnostics.checkQueueDepth) +
    "/" +
    String(liveSafeSpawnDiagnostics.forcedSpawnQueueDepth) +
    "/" +
    String(liveSafeSpawnDiagnostics.checksProcessed) +
    "/" +
    String(liveSafeSpawnDiagnostics.forcedSpawnsProcessed) +
    "/" +
    String(liveSafeSpawnDiagnostics.routeCacheRebuilds) +
    "/" +
    String(liveSafeSpawnDiagnostics.spatialHashRebuilds) +
    "/" +
    String(liveSafeSpawnDiagnostics.maxQueueAgeTicks);

  mod.DisplayHighlightedWorldLogMessage(
    mod.Message(summary)
  );
}

/* =================================================================================================
   5) AUDIO (SFX / VO)
================================================================================================= */

let audioInitialized = false;
let SFX_CaptureLeadinFriendly: any = null;
let SFX_CaptureLeadinEnemy: any = null;
let SFX_CaptureLeadinNeutral: any = null;
let SFX_CaptureLeadinThump: any = null;
let SFX_CapturingTickInBetweenFriendly: any = null;
let SFX_CapturingTickInBetweenEnemy: any = null;

let SFX_TickFriendly: any = null;
let SFX_TickEnemy: any = null;
let SFX_CapturedFriendly: any = null;
let SFX_ReadyUp: any = null;
let SFX_CountdownHeartbeat: any = null;
let SFX_ThumpFriendly: any = null;
let SFX_ThumpEnemy: any = null;
let SFX_MatchStartStinger: any = null;
// Capture tick LOOPS (start once, stop once)
let SFX_TickFriendlyLoop: any = null;
let SFX_TickEnemyLoop: any = null;
let SFX_TickContestedLoop: any = null;
// End-of-round suspense loops
let SFX_Endgame_WinningLoop: any = null;
let SFX_Endgame_LosingLoop: any = null;
// Restricted Area countdown loop
let SFX_OutOfBoundsCountdownLoop: any = null;


// Track per-player state so loops never stack
let endgameLoopStateByPlayerId: { [playerId: number]: "none" | "win" | "lose" } = {};


// Track what loop (if any) each player is currently hearing
let captureTickLoopStateByPlayerId: { [playerId: number]: "none" | "friendly" | "enemy" | "contested" } = {};

let VO_Module: any = null;
// Postmatch result SFX
let SFX_PostMatchVictory: any = null;
let SFX_PostMatchDefeat: any = null;

let postmatchResultSfxPlayed = false;

const MUSIC_ENABLED = RULES.music.enabled;
const MUSIC_PACKAGE: string = RULES.music.package;
const MUSIC_ENDGAME_TICKET_THRESHOLD = RULES.music.endgameTicketThreshold;
const MUSIC_ENDGAME_TIME_THRESHOLD_SECONDS = RULES.music.endgameTimeThresholdSeconds;
const MUSIC_URGENCY_MIN = RULES.music.urgencyMin;
const MUSIC_URGENCY_MAX = RULES.music.urgencyMax;
const MUSIC_FALLBACK_TO_SFX_LOOPS = RULES.music.fallbackToSfxLoops;

let musicPackageLoaded = false;
let musicRuntimeHealthy = true;
let liveEndgameSuspenseEntered = false;
let postmatchResultMusicActive = false;
let coreEndgameWinningTeam: mod.Team = teamNeutral;
let coreStartMusicTriggeredThisRound = false;
let preliveMusicRetryAttemptsRemaining = 0;
let preliveMusicRetryNextTick = 0;
let preliveRoundStartVoPlayedThisRound = false;

// Endgame suspense loop tuning (SFX fallback lane)
const ENDGAME_TICKET_THRESHOLD = MUSIC_ENDGAME_TICKET_THRESHOLD;
const ENDGAME_TIME_THRESHOLD_SECONDS = MUSIC_ENDGAME_TIME_THRESHOLD_SECONDS;
const ENDGAME_LOOP_INTERVAL_SECONDS = 0.8;
const PRELIVE_MUSIC_RETRY_DELAY_TICKS = TICK_RATE;
const PRELIVE_MUSIC_RETRY_ATTEMPTS = 2;
const PRELIVE_ROUNDSTART_VO_COUNTDOWN_SECONDS = 3;
const PRELIVE_ROUNDSTART_VO_FLAG = mod.VoiceOverFlags.Alpha;

// Per-player endgame loop tokens (token invalidation like capture tick loop)
let endgameLoopTokenByPlayerId: { [playerId: number]: number } = {};
let endgameLoopModeByPlayerId: { [playerId: number]: "none" | "win" | "lose" } = {};

/* Cooldowns */
const SFX_CONTEST_COOLDOWN = 2.0;
const SFX_CAPTURE_COOLDOWN = 2.0;
const SFX_TEAMMATE_JOIN_COOLDOWN = 1.0;

const SFX_CONTEST_CD_TICKS = mod.Ceiling(SFX_CONTEST_COOLDOWN * TICK_RATE);
const SFX_CAPTURE_CD_TICKS = mod.Ceiling(SFX_CAPTURE_COOLDOWN * TICK_RATE);
const SFX_JOIN_CD_TICKS = mod.Ceiling(SFX_TEAMMATE_JOIN_COOLDOWN * TICK_RATE);
const CAPTURE_LOOP_VOLUME_FRIENDLY = 0.2;
const CAPTURE_LOOP_VOLUME_NON_FRIENDLY = 0.2;

const CAPTURE_BUILDUP_LEAD_SECONDS = RULES.audio.captureBuildupLeadSeconds;
const CAPTURE_BUILDUP_BEATS = RULES.audio.captureBuildupBeats;
const CAPTURE_BUILDUP_BEAT_INTERVAL_SECONDS = RULES.audio.captureBuildupBeatIntervalSeconds;
const CAPTURE_BUILDUP_PROFILE = RULES.audio.captureBuildupProfile;
const CAPTURE_BUILDUP_BEAT_VOLUMES: readonly number[] = RULES.audio.captureBuildupBeatVolumes;

let lastCaptureBuildupTickByCp: { [cpId: number]: number } = {};
const CAPTURE_BUILDUP_COOLDOWN_TICKS = mod.Ceiling(RULES.audio.captureBuildupCooldownSeconds * TICK_RATE);
let nextCaptureBuildupSessionToken = 1;
let captureBuildupSessionTokenByCpId: { [cpId: number]: number | undefined } = {};
let captureBuildupTeamByCpId: { [cpId: number]: mod.Team | undefined } = {};
let captureBuildupActiveCpIdByPlayerId: { [playerId: number]: number | undefined } = {};
let captureBuildupActiveSessionTokenByPlayerId: { [playerId: number]: number | undefined } = {};


let lastContestSfxTickByCp: { [cpId: number]: number } = {};
let lastCaptureSfxTickByCp: { [cpId: number]: number } = {};
let lastJoinSfxTickByCp: { [cpId: number]: number } = {};

let capturePointContested: { [cpId: number]: boolean } = {};


let lastEnterPointSfxTickByPlayerId: { [playerId: number]: number } = {};
const ENTER_POINT_SFX_COOLDOWN_TICKS = mod.Floor(0.75 * TICK_RATE);

function tryRunMusic(op: string, fn: () => void): boolean {
  if (!MUSIC_ENABLED || !musicRuntimeHealthy) return false;

  try {
    fn();
    return true;
  } catch (err) {
    musicRuntimeHealthy = false;
    LogRuntimeError("Music/" + op, err);
    return false;
  }
}

function resolveConfiguredMusicPackage(): mod.MusicPackages {
  if (MUSIC_PACKAGE === "Core") return mod.MusicPackages.Core;
  if (MUSIC_PACKAGE === "BR") return mod.MusicPackages.BR;
  return mod.MusicPackages.Gauntlet;
}

function clampMusicUrgency(value: number): number {
  let min: number = MUSIC_URGENCY_MIN;
  let max: number = MUSIC_URGENCY_MAX;
  if (min > max) {
    const swap = min;
    min = max;
    max = swap;
  }

  let clamped = value;
  if (!Number.isFinite(clamped)) clamped = min;
  if (clamped < min) clamped = min;
  if (clamped > max) clamped = max;
  return clamped;
}

function resetCoreMusicParamsForTeams(): void {
  if (!MUSIC_ENABLED || !musicRuntimeHealthy) return;

  tryRunMusic("SetParam/Core_IsWinning/team1", () => mod.SetMusicParam(mod.MusicParams.Core_IsWinning, 0, team1));
  tryRunMusic("SetParam/Core_IsWinning/team2", () => mod.SetMusicParam(mod.MusicParams.Core_IsWinning, 0, team2));
  tryRunMusic("SetParam/Core_Urgency/team1", () => mod.SetMusicParam(mod.MusicParams.Core_Urgency, 0, team1));
  tryRunMusic("SetParam/Core_Urgency/team2", () => mod.SetMusicParam(mod.MusicParams.Core_Urgency, 0, team2));
}

function ensureMusicPackageLoaded(): boolean {
  if (!MUSIC_ENABLED || !musicRuntimeHealthy) return false;
  if (musicPackageLoaded) return true;

  const loaded = tryRunMusic("LoadPackage", () => {
    mod.LoadMusic(resolveConfiguredMusicPackage());
  });

  if (!loaded) return false;
  musicPackageLoaded = true;
  resetCoreMusicParamsForTeams();
  return true;
}

function playCoreLiveStartMusic(force: boolean = false): void {
  if (!MUSIC_ENABLED) return;
  if (!force && coreStartMusicTriggeredThisRound) return;
  if (!ensureMusicPackageLoaded()) return;

  tryRunMusic("Play/Core_PhaseBegin", () => mod.PlayMusic(mod.MusicEvents.Core_PhaseBegin));
  tryRunMusic("Play/Core_Deploy_Loop", () => mod.PlayMusic(mod.MusicEvents.Core_Deploy_Loop));
  coreStartMusicTriggeredThisRound = true;
}

function armPreliveMusicRetryWindow(): void {
  preliveMusicRetryAttemptsRemaining = PRELIVE_MUSIC_RETRY_ATTEMPTS;
  preliveMusicRetryNextTick = serverTickCount + PRELIVE_MUSIC_RETRY_DELAY_TICKS;
}

function maybeRetryPreliveMusicStart(): void {
  if (gameStatus !== 2) {
    preliveMusicRetryAttemptsRemaining = 0;
    return;
  }

  if (preliveMusicRetryAttemptsRemaining <= 0) return;
  if (serverTickCount < preliveMusicRetryNextTick) return;

  playCoreLiveStartMusic(true);
  preliveMusicRetryAttemptsRemaining -= 1;
  preliveMusicRetryNextTick = serverTickCount + PRELIVE_MUSIC_RETRY_DELAY_TICKS;
}

function playPreliveRoundStartVoToTeams(): void {
  if (preliveRoundStartVoPlayedThisRound) return;

  playVOToTeam(team1, mod.VoiceOverEvents2D.RoundStartGeneric, PRELIVE_ROUNDSTART_VO_FLAG);
  playVOToTeam(team2, mod.VoiceOverEvents2D.RoundStartGeneric, PRELIVE_ROUNDSTART_VO_FLAG);
  preliveRoundStartVoPlayedThisRound = true;
}

function applyCoreWinningStateForTeams(leader: mod.Team, urgencyValue: number): boolean {
  if (!MUSIC_ENABLED || !ensureMusicPackageLoaded()) return false;

  const urgency = clampMusicUrgency(urgencyValue);
  if (mod.Equals(leader, team1)) {
    coreEndgameWinningTeam = team1;
    tryRunMusic("SetParam/Core_IsWinning/team1", () => mod.SetMusicParam(mod.MusicParams.Core_IsWinning, 1, team1));
    tryRunMusic("SetParam/Core_IsWinning/team2", () => mod.SetMusicParam(mod.MusicParams.Core_IsWinning, 0, team2));
  } else if (mod.Equals(leader, team2)) {
    coreEndgameWinningTeam = team2;
    tryRunMusic("SetParam/Core_IsWinning/team1", () => mod.SetMusicParam(mod.MusicParams.Core_IsWinning, 0, team1));
    tryRunMusic("SetParam/Core_IsWinning/team2", () => mod.SetMusicParam(mod.MusicParams.Core_IsWinning, 1, team2));
  } else {
    coreEndgameWinningTeam = teamNeutral;
    tryRunMusic("SetParam/Core_IsWinning/team1", () => mod.SetMusicParam(mod.MusicParams.Core_IsWinning, 0, team1));
    tryRunMusic("SetParam/Core_IsWinning/team2", () => mod.SetMusicParam(mod.MusicParams.Core_IsWinning, 0, team2));
  }

  tryRunMusic("SetParam/Core_Urgency/team1", () => mod.SetMusicParam(mod.MusicParams.Core_Urgency, urgency, team1));
  tryRunMusic("SetParam/Core_Urgency/team2", () => mod.SetMusicParam(mod.MusicParams.Core_Urgency, urgency, team2));
  return musicRuntimeHealthy;
}

function applyCoreLiveEndgameSuspenseMusic(leader: mod.Team, urgencyValue: number): boolean {
  if (!MUSIC_ENABLED) return false;
  if (!ensureMusicPackageLoaded()) return false;

  if (!coreStartMusicTriggeredThisRound) {
    tryRunMusic("Play/Core_Deploy_Loop/seed", () => mod.PlayMusic(mod.MusicEvents.Core_Deploy_Loop));
    coreStartMusicTriggeredThisRound = true;
  }

  if (!liveEndgameSuspenseEntered) {
    tryRunMusic("Play/Core_LastPhaseBegin", () => mod.PlayMusic(mod.MusicEvents.Core_LastPhaseBegin));
    liveEndgameSuspenseEntered = true;
  }

  postmatchResultMusicActive = false;
  return applyCoreWinningStateForTeams(leader, urgencyValue);
}

function clearCoreLiveEndgameSuspenseState(): void {
  if (!MUSIC_ENABLED || !musicRuntimeHealthy) {
    liveEndgameSuspenseEntered = false;
    coreEndgameWinningTeam = teamNeutral;
    return;
  }

  if (!liveEndgameSuspenseEntered) return;

  resetCoreMusicParamsForTeams();
  liveEndgameSuspenseEntered = false;
  coreEndgameWinningTeam = teamNeutral;
}

function startCorePostmatchResultMusic(): boolean {
  if (!MUSIC_ENABLED) return false;
  if (!ensureMusicPackageLoaded()) return false;

  clearCoreLiveEndgameSuspenseState();

  if (!postmatchResultMusicActive) {
    tryRunMusic("Play/Core_PhaseEnded", () => mod.PlayMusic(mod.MusicEvents.Core_PhaseEnded));
    tryRunMusic("Play/Core_EndOfRound_Loop/team1", () => mod.PlayMusic(mod.MusicEvents.Core_EndOfRound_Loop, team1));
    tryRunMusic("Play/Core_EndOfRound_Loop/team2", () => mod.PlayMusic(mod.MusicEvents.Core_EndOfRound_Loop, team2));
    postmatchResultMusicActive = true;
  }

  return applyCoreWinningStateForTeams(getWinningTeam(), 0);
}

function stopCoreMusicPlayback(): void {
  coreStartMusicTriggeredThisRound = false;
  preliveMusicRetryAttemptsRemaining = 0;
  preliveMusicRetryNextTick = 0;
  preliveRoundStartVoPlayedThisRound = false;
  liveEndgameSuspenseEntered = false;
  postmatchResultMusicActive = false;
  coreEndgameWinningTeam = teamNeutral;
  if (!MUSIC_ENABLED || !musicRuntimeHealthy) return;

  tryRunMusic("Play/Core_Stop", () => mod.PlayMusic(mod.MusicEvents.Core_Stop));
  resetCoreMusicParamsForTeams();
}

function calculateEndgameUrgencyValue(t1Tickets: number, t2Tickets: number, timeLeftSeconds: number): number {
  let urgency = 0;

  if (MUSIC_ENDGAME_TICKET_THRESHOLD > 0) {
    const minTickets = Math.min(t1Tickets, t2Tickets);
    const ticketFactor = 1 - minTickets / MUSIC_ENDGAME_TICKET_THRESHOLD;
    const ticketUrgency = clampMusicUrgency(ticketFactor * MUSIC_URGENCY_MAX);
    if (ticketUrgency > urgency) urgency = ticketUrgency;
  }

  if (MUSIC_ENDGAME_TIME_THRESHOLD_SECONDS > 0) {
    const timeFactor = 1 - timeLeftSeconds / MUSIC_ENDGAME_TIME_THRESHOLD_SECONDS;
    const timeUrgency = clampMusicUrgency(timeFactor * MUSIC_URGENCY_MAX);
    if (timeUrgency > urgency) urgency = timeUrgency;
  }

  return clampMusicUrgency(urgency);
}

function getOpposingTeam(team: mod.Team): mod.Team {
  if (mod.Equals(team, team1)) return team2;
  if (mod.Equals(team, team2)) return team1;
  return teamNeutral;
}

function ensureAudioSpawned(): void {
  if (audioInitialized) return;
  audioInitialized = true;

  SFX_CaptureLeadinFriendly = mod.SpawnObject(
    mod.RuntimeSpawn_Common.SFX_UI_Gamemode_Shared_CaptureObjectives_CaptureLeadinFriendly_OneShot2D,
    mod.CreateVector(0, 0, 0),
    mod.CreateVector(0, 0, 0),
    mod.CreateVector(0, 0, 0)
  );

  SFX_CaptureLeadinEnemy = mod.SpawnObject(
    mod.RuntimeSpawn_Common.SFX_UI_Gamemode_Shared_CaptureObjectives_CaptureLeadinEnemy_OneShot2D,
    mod.CreateVector(0, 0, 0),
    mod.CreateVector(0, 0, 0),
    mod.CreateVector(0, 0, 0)
  );

  SFX_CaptureLeadinNeutral = mod.SpawnObject(
    mod.RuntimeSpawn_Common.SFX_UI_Gamemode_Shared_CaptureObjectives_CaptureLeadinNeutral_OneShot2D,
    mod.CreateVector(0, 0, 0),
    mod.CreateVector(0, 0, 0),
    mod.CreateVector(0, 0, 0)
  );

  SFX_CaptureLeadinThump = mod.SpawnObject(
    mod.RuntimeSpawn_Common.SFX_UI_Gamemode_Shared_CaptureObjectives_CaptureLeadinThump_OneShot2D,
    mod.CreateVector(0, 0, 0),
    mod.CreateVector(0, 0, 0),
    mod.CreateVector(0, 0, 0)
  );

  SFX_CapturingTickInBetweenFriendly = mod.SpawnObject(
    mod.RuntimeSpawn_Common.SFX_UI_Gamemode_Shared_CaptureObjectives_CapturingTickInBetweenFriendly_OneShot2D,
    mod.CreateVector(0, 0, 0),
    mod.CreateVector(0, 0, 0),
    mod.CreateVector(0, 0, 0)
  );

  SFX_CapturingTickInBetweenEnemy = mod.SpawnObject(
    mod.RuntimeSpawn_Common.SFX_UI_Gamemode_Shared_CaptureObjectives_CapturingTickInBetweenEnemy_OneShot2D,
    mod.CreateVector(0, 0, 0),
    mod.CreateVector(0, 0, 0),
    mod.CreateVector(0, 0, 0)
  );

    // Looping capture tick sounds (SimpleLoop2D)
  SFX_TickFriendlyLoop = mod.SpawnObject(
    mod.RuntimeSpawn_Common.SFX_UI_Gamemode_Shared_CaptureObjectives_CapturingTick_IsFriendly_SimpleLoop2D,
    mod.CreateVector(0, 0, 0),
    mod.CreateVector(0, 0, 0),
    mod.CreateVector(0, 0, 0)
  );

  SFX_TickEnemyLoop = mod.SpawnObject(
    mod.RuntimeSpawn_Common.SFX_UI_Gamemode_Shared_CaptureObjectives_CapturingTick_IsEnemy_SimpleLoop2D,
    mod.CreateVector(0, 0, 0),
    mod.CreateVector(0, 0, 0),
    mod.CreateVector(0, 0, 0)
  );

  SFX_TickContestedLoop = mod.SpawnObject(
    mod.RuntimeSpawn_Common.SFX_UI_Gamemode_Shared_CaptureObjectives_OnContested_SimpleLoop2D,
    mod.CreateVector(0, 0, 0),
    mod.CreateVector(0, 0, 0),
    mod.CreateVector(0, 0, 0)
  );


  SFX_ReadyUp = mod.SpawnObject(
    mod.RuntimeSpawn_Common.SFX_UI_SP_Collectibles_Dogtag_OneShot2D,
    mod.CreateVector(0, 0, 0),
    mod.CreateVector(0, 0, 0),
    mod.CreateVector(0, 0, 0)
  );

  SFX_CountdownHeartbeat = mod.SpawnObject(
    mod.RuntimeSpawn_Common.SFX_UI_Shared_Countdown_Tick_Urgent_OneShot2D,
    mod.CreateVector(0, 0, 0),
    mod.CreateVector(0, 0, 0),
    mod.CreateVector(0, 0, 0)
  );

  SFX_TickFriendly = mod.SpawnObject(
    mod.RuntimeSpawn_Common.SFX_UI_Gauntlet_Standoff_ZoneCaptureTick_OneShot2D,
    mod.CreateVector(0, 0, 0),
    mod.CreateVector(0, 0, 0),
    mod.CreateVector(0, 0, 0)
  );

  SFX_TickEnemy = mod.SpawnObject(
    mod.RuntimeSpawn_Common.SFX_UI_Gamemode_Shared_CaptureObjectives_CapturingTickEnemy_OneShot2D,
    mod.CreateVector(0, 0, 0),
    mod.CreateVector(0, 0, 0),
    mod.CreateVector(0, 0, 0)
  );

  SFX_CapturedFriendly = mod.SpawnObject(
    mod.RuntimeSpawn_Common.SFX_UI_Gamemode_Shared_CaptureObjectives_OnCapturedByFriendly_OneShot2D,
    mod.CreateVector(0, 0, 0),
    mod.CreateVector(0, 0, 0),
    mod.CreateVector(0, 0, 0)
  );

  SFX_ThumpFriendly = mod.SpawnObject(
    mod.RuntimeSpawn_Common.SFX_UI_Gamemode_Shared_CaptureObjectives_CapturingThumpFriendly_OneShot2D,
    mod.CreateVector(0, 0, 0),
    mod.CreateVector(0, 0, 0),
    mod.CreateVector(0, 0, 0)
  );

  SFX_ThumpEnemy = mod.SpawnObject(
    mod.RuntimeSpawn_Common.SFX_UI_Gamemode_Shared_CaptureObjectives_CapturingThumpEnemy_OneShot2D,
    mod.CreateVector(0, 0, 0),
    mod.CreateVector(0, 0, 0),
    mod.CreateVector(0, 0, 0)
  );

  SFX_MatchStartStinger = mod.SpawnObject(
    mod.RuntimeSpawn_Common.SFX_UI_Gamemode_Shared_Intro_FinalImpact_OneShot2D,
    mod.CreateVector(0, 0, 0),
    mod.CreateVector(0, 0, 0),
    mod.CreateVector(0, 0, 0)
  );

    // End-of-round suspense loops
  // Winning team: satisfying / anticipatory tension
  SFX_Endgame_WinningLoop = mod.SpawnObject(
    mod.RuntimeSpawn_Common.SFX_GameModes_BR_Circle_DamageStop_Loop2D,
    mod.CreateVector(0, 0, 0),
    mod.CreateVector(0, 0, 0),
    mod.CreateVector(0, 0, 0)
  );

  // Losing team: hopeless / pressure tone
  SFX_Endgame_LosingLoop = mod.SpawnObject(
    mod.RuntimeSpawn_Common.SFX_GameModes_BR_Circle_DeathWarning_SimpleLoop2D,
    mod.CreateVector(0, 0, 0),
    mod.CreateVector(0, 0, 0),
    mod.CreateVector(0, 0, 0)
  );


    // Postmatch result sounds
  // "Qualified" reads as a positive/celebration stinger in Portal
  SFX_PostMatchVictory = mod.SpawnObject(
    mod.RuntimeSpawn_Common.SFX_UI_Gauntlet_EOM_Qualified_OneShot2D,
    mod.CreateVector(0, 0, 0),
    mod.CreateVector(0, 0, 0),
    mod.CreateVector(0, 0, 0)
  );

  // Defeat stinger
  SFX_PostMatchDefeat = mod.SpawnObject(
    mod.RuntimeSpawn_Common.SFX_UI_Gauntlet_EOM_Defeat_OneShot2D,
    mod.CreateVector(0, 0, 0),
    mod.CreateVector(0, 0, 0),
    mod.CreateVector(0, 0, 0)
  );


  VO_Module = mod.SpawnObject(
    mod.RuntimeSpawn_Common.SFX_VOModule_OneShot2D,
    mod.CreateVector(0, 0, 0),
    mod.CreateVector(0, 0, 0),
    mod.CreateVector(0, 0, 0)
  );

    // Restricted Area / Out-of-bounds warning loop (SimpleLoop2D)
  SFX_OutOfBoundsCountdownLoop = mod.SpawnObject(
    mod.RuntimeSpawn_Common.SFX_UI_Gamemode_Shared_OutOfBounds_SFXLoop_SimpleLoop2D,
    mod.CreateVector(0, 0, 0),
    mod.CreateVector(0, 0, 0),
    mod.CreateVector(0, 0, 0)
  );

}

function forEachPlayerOnTeam(team: mod.Team, fn: (p: Player) => void): void {
  serverPlayers.forEach((p) => {
    if (mod.Equals(mod.GetTeam(p.player), team)) fn(p);
  });
}

function stopCaptureTickLoop(playerId: number): void {
  const p = serverPlayers.get(playerId);
  if (p && mod.IsPlayerValid(p.player)) {
    stopCaptureTickLoopsForPlayer(p.player, playerId);
    return;
  }

  captureTickLoopStateByPlayerId[playerId] = "none";
}

function stopCaptureBuildupSfxForPlayer(player: mod.Player): void {
  if (SFX_CaptureLeadinFriendly) mod.StopSound(SFX_CaptureLeadinFriendly, player);
  if (SFX_CaptureLeadinEnemy) mod.StopSound(SFX_CaptureLeadinEnemy, player);
  if (SFX_CaptureLeadinNeutral) mod.StopSound(SFX_CaptureLeadinNeutral, player);
  if (SFX_CaptureLeadinThump) mod.StopSound(SFX_CaptureLeadinThump, player);
  if (SFX_CapturingTickInBetweenFriendly) mod.StopSound(SFX_CapturingTickInBetweenFriendly, player);
  if (SFX_CapturingTickInBetweenEnemy) mod.StopSound(SFX_CapturingTickInBetweenEnemy, player);
}

function clearCaptureBuildupTrackingForPlayer(playerId: number, stopSounds: boolean = true): void {
  const p = serverPlayers.get(playerId);
  if (stopSounds && p && mod.IsPlayerValid(p.player)) {
    stopCaptureBuildupSfxForPlayer(p.player);
  }

  delete captureBuildupActiveCpIdByPlayerId[playerId];
  delete captureBuildupActiveSessionTokenByPlayerId[playerId];
}

function stopCaptureBuildupForPlayer(playerId: number): void {
  clearCaptureBuildupTrackingForPlayer(playerId, true);
}

function invalidateCaptureBuildupSessionForCp(cpId: number): void {
  delete captureBuildupSessionTokenByCpId[cpId];
  delete captureBuildupTeamByCpId[cpId];

  serverPlayers.forEach((sp) => {
    if (captureBuildupActiveCpIdByPlayerId[sp.id] !== cpId) return;
    clearCaptureBuildupTrackingForPlayer(sp.id, true);
  });
}

function resetAllCaptureBuildupState(stopPlayerSounds: boolean): void {
  if (stopPlayerSounds) {
    serverPlayers.forEach((sp) => clearCaptureBuildupTrackingForPlayer(sp.id, true));
  } else {
    captureBuildupActiveCpIdByPlayerId = {};
    captureBuildupActiveSessionTokenByPlayerId = {};
  }

  lastCaptureBuildupTickByCp = {};
  captureBuildupSessionTokenByCpId = {};
  captureBuildupTeamByCpId = {};
  nextCaptureBuildupSessionToken = 1;
}

function beginCaptureBuildupSession(cpId: number, capturingTeam: mod.Team): number {
  invalidateCaptureBuildupSessionForCp(cpId);

  const sessionToken = nextCaptureBuildupSessionToken++;
  captureBuildupSessionTokenByCpId[cpId] = sessionToken;
  captureBuildupTeamByCpId[cpId] = capturingTeam;
  return sessionToken;
}

function isCaptureBuildupPlayerEligible(
  cp: CapturePoint,
  playerId: number,
  capturingTeam: mod.Team,
  sessionToken: number
): boolean {
  if (gameStatus !== 3) return false;
  if (captureBuildupSessionTokenByCpId[cp.id] !== sessionToken) return false;

  const sessionTeam = captureBuildupTeamByCpId[cp.id];
  if (!sessionTeam || !mod.Equals(sessionTeam, capturingTeam)) return false;
  const onPoint = cp.getOnPoint();
  if (onPoint[0] > 0 && onPoint[1] > 0) return false;
  if (cp.getCaptureProgressDirection() < 0) return false;
  if (cp.getCaptureProgress() >= PROGRESS_FULL) return false;
  if (mod.Equals(cp.getProgressTeam(), teamNeutral)) return false;
  if (!mod.Equals(cp.getProgressTeam(), capturingTeam)) return false;
  if (cp.getPlayerIdsOnPoint().indexOf(playerId) < 0) return false;

  const sp = serverPlayers.get(playerId);
  if (!sp) return false;
  if (!sp.isDeployed) return false;
  if (!mod.IsPlayerValid(sp.player)) return false;
  if (!kernelIsPlayerAlive(sp.player)) return false;
  if (!mod.Equals(mod.GetTeam(sp.player), capturingTeam)) return false;

  return true;
}

function syncCaptureBuildupPlayersForSession(
  cp: CapturePoint,
  capturingTeam: mod.Team,
  sessionToken: number
): void {
  serverPlayers.forEach((sp) => {
    if (captureBuildupActiveCpIdByPlayerId[sp.id] !== cp.id) return;
    if (captureBuildupActiveSessionTokenByPlayerId[sp.id] !== sessionToken) return;
    if (isCaptureBuildupPlayerEligible(cp, sp.id, capturingTeam, sessionToken)) return;

    clearCaptureBuildupTrackingForPlayer(sp.id, true);
  });
}

function stopEndgameLoop(playerId: number): void {
  const t = endgameLoopTokenByPlayerId[playerId] ?? 0;
  endgameLoopTokenByPlayerId[playerId] = t + 1;
  endgameLoopModeByPlayerId[playerId] = "none";

  const p = serverPlayers.get(playerId);
  if (p && mod.IsPlayerValid(p.player)) {
    stopEndgameLoopForPlayer(p.player, playerId);
    return;
  }

  endgameLoopStateByPlayerId[playerId] = "none";
}
function startRestrictedAreaLoopSfxForPlayer(player: mod.Player): void {
  if (!SFX_OutOfBoundsCountdownLoop) return;
  mod.PlaySound(SFX_OutOfBoundsCountdownLoop, 1.0, player);
}

function stopRestrictedAreaLoopSfxForPlayer(player: mod.Player): void {
  if (!SFX_OutOfBoundsCountdownLoop) return;
  mod.StopSound(SFX_OutOfBoundsCountdownLoop, player);
}

async function startEndgameLoop(playerId: number, mode: "win" | "lose"): Promise<void> {
  stopEndgameLoop(playerId);
  endgameLoopModeByPlayerId[playerId] = mode;

  const myToken = endgameLoopTokenByPlayerId[playerId];

  while (true) {
    if (endgameLoopTokenByPlayerId[playerId] !== myToken) return;
    if (gameStatus !== 3) return;

    const sp = serverPlayers.get(playerId);
    if (!sp) return;
    if (!sp.isDeployed) return;
    if (!mod.IsPlayerValid(sp.player)) return;
    if (!kernelIsPlayerAlive(sp.player)) return;

    // Use only sounds you already spawn and already know work.
    if (mode === "win") {
      if (SFX_Endgame_WinningLoop) mod.PlaySound(SFX_Endgame_WinningLoop, 0.25, sp.player);
    } else {
      if (SFX_Endgame_LosingLoop) mod.PlaySound(SFX_Endgame_LosingLoop, 0.25, sp.player);
    }

    await mod.Wait(ENDGAME_LOOP_INTERVAL_SECONDS);
  }
}

function StopAllEndgameLoops(): void {
  serverPlayers.forEach((p) => stopEndgameLoop(p.id));
}
function getCaptureBuildupBeatVolume(beatIndex: number): number {
  if (!CAPTURE_BUILDUP_BEAT_VOLUMES || CAPTURE_BUILDUP_BEAT_VOLUMES.length <= 0) return 0.2;
  const clampedIndex = Math.min(beatIndex, CAPTURE_BUILDUP_BEAT_VOLUMES.length - 1);
  return CAPTURE_BUILDUP_BEAT_VOLUMES[clampedIndex];
}

function getEffectiveCaptureTimeForMajorityCount(majorityCount: number): number {
  let mult = 1;
  if (majorityCount >= 2) mult = CAPTURE_MULTIPLIER_FOR_2_PLAYERS;
  if (mult > CAPTURE_MULTIPLIER_MAX) mult = CAPTURE_MULTIPLIER_MAX;
  return CAPTURE_TIME / mult;
}

function playCaptureBuildupBeat(receiver: mod.Player, capturingTeam: mod.Team, beatIndex: number): void {
  const volume = getCaptureBuildupBeatVolume(beatIndex);
  const isFinalBeat = beatIndex >= CAPTURE_BUILDUP_BEATS - 1;
  const isPenultimateBeat = CAPTURE_BUILDUP_BEATS > 1 && beatIndex === CAPTURE_BUILDUP_BEATS - 2;

  if (CAPTURE_BUILDUP_PROFILE === "captureLeadin") {
    const receiverTeam = mod.GetTeam(receiver);

    if (isFinalBeat && SFX_CaptureLeadinThump) {
      mod.PlaySound(SFX_CaptureLeadinThump, volume, receiver);
      return;
    }

    if (isPenultimateBeat) {
      let inBetween = SFX_CapturingTickInBetweenFriendly;
      if (!mod.Equals(capturingTeam, teamNeutral)) {
        inBetween =
          mod.Equals(receiverTeam, capturingTeam)
            ? SFX_CapturingTickInBetweenFriendly
            : SFX_CapturingTickInBetweenEnemy;
      }

      if (inBetween) {
        mod.PlaySound(inBetween, volume, receiver);
        return;
      }
    }

    let leadin = SFX_CaptureLeadinNeutral;

    if (!mod.Equals(capturingTeam, teamNeutral)) {
      leadin = mod.Equals(receiverTeam, capturingTeam) ? SFX_CaptureLeadinFriendly : SFX_CaptureLeadinEnemy;
    }

    if (leadin) {
      mod.PlaySound(leadin, volume, receiver);
      return;
    }
  }

  if (SFX_CaptureLeadinThump) {
    mod.PlaySound(SFX_CaptureLeadinThump, volume, receiver);
  }
}

function stopEndgameLoopForPlayer(player: mod.Player, playerId: number): void {
  if (SFX_Endgame_WinningLoop) mod.StopSound(SFX_Endgame_WinningLoop, player);
  if (SFX_Endgame_LosingLoop) mod.StopSound(SFX_Endgame_LosingLoop, player);
  endgameLoopStateByPlayerId[playerId] = "none";
}

function setEndgameLoopForPlayer(
  player: mod.Player,
  playerId: number,
  desired: "none" | "win" | "lose"
): void {
  const current = endgameLoopStateByPlayerId[playerId] ?? "none";
  if (current === desired) return;

  // Stop previous loop
  if (SFX_Endgame_WinningLoop) mod.StopSound(SFX_Endgame_WinningLoop, player);
  if (SFX_Endgame_LosingLoop) mod.StopSound(SFX_Endgame_LosingLoop, player);

  if (desired === "win") {
    if (SFX_Endgame_WinningLoop) mod.PlaySound(SFX_Endgame_WinningLoop, 0.25, player);
  } else if (desired === "lose") {
    if (SFX_Endgame_LosingLoop) mod.PlaySound(SFX_Endgame_LosingLoop, 0.25, player);
  }

  endgameLoopStateByPlayerId[playerId] = desired;
}
function UpdateEndgameSuspenseAudio(): void {
  if (gameStatus !== 3) {
    clearCoreLiveEndgameSuspenseState();
    StopAllEndgameLoops();
    endgameSuspenseDirty = false;
    return;
  }

  const timeLeft = mod.Max(0, ROUND_TIME - phaseTickCount / TICK_RATE);

  // Compare with CEILING tickets so it matches what players see.
  const t1Tickets = mod.Ceiling(serverScores[0]);
  const t2Tickets = mod.Ceiling(serverScores[1]);

  const endByTicketsSoon = t1Tickets <= ENDGAME_TICKET_THRESHOLD || t2Tickets <= ENDGAME_TICKET_THRESHOLD;
  const endByTimeSoon = timeLeft <= ENDGAME_TIME_THRESHOLD_SECONDS;

  if (!liveEndgameSuspenseEntered && !endByTicketsSoon && !endByTimeSoon) {
    StopAllEndgameLoops();
    endgameSuspenseDirty = false;
    return;
  }

  // Current leader decides win/lose mood.
  let leader: mod.Team = teamNeutral;
  if (t1Tickets > t2Tickets) leader = team1;
  else if (t2Tickets > t1Tickets) leader = team2;

  const urgencyValue = calculateEndgameUrgencyValue(t1Tickets, t2Tickets, timeLeft);
  const musicApplied = applyCoreLiveEndgameSuspenseMusic(leader, urgencyValue);
  if (musicApplied) {
    StopAllEndgameLoops();
    endgameSuspenseDirty = false;
    endgameAudioFlushes += 1;
    return;
  }

  if (!MUSIC_FALLBACK_TO_SFX_LOOPS) {
    StopAllEndgameLoops();
    endgameSuspenseDirty = false;
    endgameAudioFlushes += 1;
    return;
  }

  serverPlayers.forEach((sp) => {
    if (!sp) return;
    if (!sp.isDeployed) return;
    if (!mod.IsPlayerValid(sp.player)) return;

    const playerTeam = mod.GetTeam(sp.player);

    let desired: "none" | "win" | "lose" = "none";
    if (!mod.Equals(leader, teamNeutral)) {
      if (mod.Equals(playerTeam, leader)) desired = "win";
      else if (mod.Equals(playerTeam, team1) || mod.Equals(playerTeam, team2)) desired = "lose";
    }
    setEndgameLoopForPlayer(sp.player, sp.id, desired);
  });

  endgameSuspenseDirty = false;
  endgameAudioFlushes += 1;
}


async function playCaptureBuildupToCapturingTeamOnPoint(cp: CapturePoint, capturingTeam: mod.Team): Promise<void> {
  // Rate limit per capture point so it does not spam.
  const last = lastCaptureBuildupTickByCp[cp.id] ?? -999999;
  if (serverTickCount - last < CAPTURE_BUILDUP_COOLDOWN_TICKS) return;
  lastCaptureBuildupTickByCp[cp.id] = serverTickCount;
  const sessionToken = beginCaptureBuildupSession(cp.id, capturingTeam);

  // Play a short 3-beat buildup only to the capturing team currently on the point.
  for (let beat = 0; beat < CAPTURE_BUILDUP_BEATS; beat++) {
    if (captureBuildupSessionTokenByCpId[cp.id] !== sessionToken) return;

    syncCaptureBuildupPlayersForSession(cp, capturingTeam, sessionToken);
    const ids = cp.getPlayerIdsOnPoint();
    let playedBeat = false;

    for (let i = 0; i < ids.length; i++) {
      const pid = ids[i];
      if (!isCaptureBuildupPlayerEligible(cp, pid, capturingTeam, sessionToken)) {
        clearCaptureBuildupTrackingForPlayer(pid, true);
        continue;
      }

      const p = serverPlayers.get(pid);
      if (!p) continue;
      captureBuildupActiveCpIdByPlayerId[pid] = cp.id;
      captureBuildupActiveSessionTokenByPlayerId[pid] = sessionToken;

      playCaptureBuildupBeat(p.player, capturingTeam, beat);
      playedBeat = true;
    }

    if (!playedBeat) {
      invalidateCaptureBuildupSessionForCp(cp.id);
      return;
    }

    if (beat >= CAPTURE_BUILDUP_BEATS - 1) return;
    await mod.Wait(CAPTURE_BUILDUP_BEAT_INTERVAL_SECONDS);
  }
}

function playTickFriendly(receiver: mod.Player): void {
  // The CaptureObjectives ticking runtime spawners can be silent or unavailable in some Portal builds.
  // Use the countdown heartbeat sound as the reliable capture tick.
  if (SFX_TickFriendly) {
    mod.PlaySound(SFX_TickFriendly, 0.1, receiver);
    return;
  }

  // Fallbacks if heartbeat is not available for some reason.
  if (SFX_ThumpFriendly) {
    mod.PlaySound(SFX_ThumpFriendly, 0.2, receiver);
    return;
  }

  if (SFX_TickFriendly) mod.PlaySound(SFX_TickFriendly, 0.1, receiver);
}

function playTickEnemy(receiver: mod.Player): void {
  // Use the same reliable tick during contest/pressure.
  if (SFX_TickEnemy) {
    mod.PlaySound(SFX_TickEnemy, 0.2, receiver);
    return;
  }

  // Fallbacks.
  if (SFX_ThumpEnemy) {
    mod.PlaySound(SFX_ThumpEnemy, 0.2, receiver);
    return;
  }

  if (SFX_TickEnemy) mod.PlaySound(SFX_TickEnemy, 0.2, receiver);
}

function stopCaptureTickLoopsForPlayer(player: mod.Player, playerId: number): void {
  // Stop all capture loops so we never overlap
  if (SFX_TickFriendlyLoop) mod.StopSound(SFX_TickFriendlyLoop, player);
  if (SFX_TickEnemyLoop) mod.StopSound(SFX_TickEnemyLoop, player);
  if (SFX_TickContestedLoop) mod.StopSound(SFX_TickContestedLoop, player);

  captureTickLoopStateByPlayerId[playerId] = "none";
}

function setCaptureTickLoopForPlayer(
  player: mod.Player,
  playerId: number,
  desired: "none" | "friendly" | "enemy" | "contested"
): void {
  const current = captureTickLoopStateByPlayerId[playerId] ?? "none";
  if (current === desired) return;

  // Always stop previous loop first
  if (SFX_TickFriendlyLoop) mod.StopSound(SFX_TickFriendlyLoop, player);
  if (SFX_TickEnemyLoop) mod.StopSound(SFX_TickEnemyLoop, player);
  if (SFX_TickContestedLoop) mod.StopSound(SFX_TickContestedLoop, player);

  if (desired === "friendly") {
    if (SFX_TickFriendlyLoop) mod.PlaySound(SFX_TickFriendlyLoop, CAPTURE_LOOP_VOLUME_FRIENDLY, player);
  } else if (desired === "enemy") {
    if (SFX_TickEnemyLoop) mod.PlaySound(SFX_TickEnemyLoop, CAPTURE_LOOP_VOLUME_NON_FRIENDLY, player);
  } else if (desired === "contested") {
    if (SFX_TickContestedLoop) mod.PlaySound(SFX_TickContestedLoop, CAPTURE_LOOP_VOLUME_NON_FRIENDLY, player);
  }

  captureTickLoopStateByPlayerId[playerId] = desired;
}

function StopAllCaptureTickLoops(): void {
  serverPlayers.forEach((p) => {
    if (!p) return;
    if (!mod.IsPlayerValid(p.player)) return;
    stopCaptureTickLoopsForPlayer(p.player, p.id);
  });
}


/*
  Global loop manager:
  - For each deployed/alive player, decide what they should hear:
      none: not on a point or no contest/progress activity
      friendly: player is on point AND their team is the majority capturing/neutralizing (not contested)
      contested: player is on a contested point and is not minority (equal counts or majority side)
      enemy: player is on a contested point as minority OR not majority during neutralize/capture pressure
  - Start/stop loops only on state changes (no spam).
*/
function UpdateCaptureTickLoopsGlobal(): void {
  if (gameStatus !== 3) {
    StopAllCaptureTickLoops();
    return;
  }

  const desiredByPlayerId: { [playerId: number]: "none" | "friendly" | "enemy" | "contested" } = {};

  Object.values(serverCapturePoints).forEach((cpWrap) => {
    const playerIds = cpWrap.getPlayerIdsOnPoint();
    if (!playerIds || playerIds.length === 0) return;

    const on = cpWrap.getOnPoint();
    const hasT1 = on[0] > 0;
    const hasT2 = on[1] > 0;
    if (!hasT1 && !hasT2) return;

    const contested = hasT1 && hasT2;
    const majority = getMajorityTeamOnPoint(cpWrap);
    const phase = getCapturePointPhase(cpWrap);
    const progressTeam = cpWrap.getProgressTeam();

    if (!contested && (phase === "neutral_idle" || phase === "owned_idle")) return;

    for (let i = 0; i < playerIds.length; i++) {
      const playerId = playerIds[i];
      const sp = serverPlayers.get(playerId);
      if (!sp) continue;
      if (!sp.isDeployed) continue;
      if (!mod.IsPlayerValid(sp.player)) continue;
      if (!kernelIsPlayerAlive(sp.player)) continue;

      const playerTeam = mod.GetTeam(sp.player);

      if (contested) {
        if (mod.Equals(majority, teamNeutral)) {
          desiredByPlayerId[playerId] = "contested";
        } else if (mod.Equals(playerTeam, majority)) {
          desiredByPlayerId[playerId] = "contested";
        } else {
          desiredByPlayerId[playerId] = "enemy";
        }
        continue;
      }

      if (mod.Equals(progressTeam, teamNeutral)) {
        desiredByPlayerId[playerId] = "enemy";
        continue;
      }

      desiredByPlayerId[playerId] = mod.Equals(playerTeam, progressTeam) ? "friendly" : "enemy";
    }
  });

  serverPlayers.forEach((sp) => {
    if (!sp) return;

    const player = sp.player;
    const playerId = sp.id;

    if (!sp.isDeployed || !mod.IsPlayerValid(player) || !kernelIsPlayerAlive(player)) {
      if (mod.IsPlayerValid(player)) stopCaptureTickLoopsForPlayer(player, playerId);
      else captureTickLoopStateByPlayerId[playerId] = "none";
      return;
    }

    setCaptureTickLoopForPlayer(player, playerId, desiredByPlayerId[playerId] ?? "none");
  });
}


function playCapturedSfx(receiver: mod.Player): void {
  if (SFX_CapturedFriendly) mod.PlaySound(SFX_CapturedFriendly, 1.0, receiver);
}

function playThumpFriendly(receiver: mod.Player): void {
  if (SFX_ThumpFriendly) mod.PlaySound(SFX_ThumpFriendly, 0.8, receiver);
}

function playThumpEnemy(receiver: mod.Player): void {
  if (SFX_ThumpEnemy) mod.PlaySound(SFX_ThumpEnemy, 0.8, receiver);
}

function playCountdownHeartbeatToAll(volume: number): void {
  if (!SFX_CountdownHeartbeat) return;
  serverPlayers.forEach((p) => mod.PlaySound(SFX_CountdownHeartbeat, volume, p.player));
}

function playMatchStartStingerToAll(volume: number): void {
  if (!SFX_MatchStartStinger) return;
  serverPlayers.forEach((p) => mod.PlaySound(SFX_MatchStartStinger, volume, p.player));
}

function playVOToPlayer(receiver: mod.Player, evt: mod.VoiceOverEvents2D, flag: mod.VoiceOverFlags): void {
  if (VO_Module) mod.PlayVO(VO_Module, evt, flag, receiver);
}

function playVOToTeam(team: mod.Team, evt: mod.VoiceOverEvents2D, flag: mod.VoiceOverFlags): void {
  if (VO_Module) mod.PlayVO(VO_Module, evt, flag, team);
}

function playSfxToTeam(team: mod.Team, kind: "tickFriendly" | "tickEnemy"): void {
  forEachPlayerOnTeam(team, (p) => {
    if (kind === "tickFriendly") playTickFriendly(p.player);
    else playTickEnemy(p.player);
  });
}

function playPostMatchResultSfxOnce(): void {
  if (postmatchResultSfxPlayed) return;
  postmatchResultSfxPlayed = true;

  const winner = getWinningTeam();
  if (mod.Equals(winner, teamNeutral)) return;

  serverPlayers.forEach((p) => {
    const t = mod.GetTeam(p.player);

    // Winner hears victory, losers hear defeat
    if (mod.Equals(t, winner)) {
      if (SFX_PostMatchVictory) mod.PlaySound(SFX_PostMatchVictory, 1.0, p.player);
    } else if (mod.Equals(t, team1) || mod.Equals(t, team2)) {
      if (SFX_PostMatchDefeat) mod.PlaySound(SFX_PostMatchDefeat, 1.0, p.player);
    }
  });
}


function canPlayCpSfx(cdTicks: number, lastMap: { [cpId: number]: number }, cpId: number): boolean {
  const last = lastMap[cpId] ?? -9999999;
  return serverTickCount - last >= cdTicks;
}

function markCpSfx(lastMap: { [cpId: number]: number }, cpId: number): void {
  lastMap[cpId] = serverTickCount;
}

/* =================================================================================================
   6) UI (PARSE UI + PER-PLAYER HUD)
================================================================================================= */
const TICKETS_BAR_MAX = INITIAL_TICKETS;

let UIContainers: mod.UIWidget[] = [];

const LIVE_UI_SLOTS_PER_TEAM = 32;
type LiveUiTeamKey = "T1" | "T2";
const SPECTATOR_LIVE_UI_TEAM_KEY: LiveUiTeamKey = "T1";
const SPECTATOR_LIVE_UI_SLOT_INDEX = 31;
const SPECTATOR_LIVE_UI_SLOT_KEY = "T1_31";
type LiveUiFlagSymbol = "A" | "B" | "C";
const LIVE_HUD_FLAG_SYMBOLS: LiveUiFlagSymbol[] = ["A", "B", "C"];

type LiveUiSlotAssignment = {
  teamKey: LiveUiTeamKey;
  slotIndex: number;
  slotKey: string;
};

let liveUiSlotByPlayerId: { [playerId: number]: LiveUiSlotAssignment | undefined } = {};
let playerIdByLiveUiSlotTeam1: Array<number | undefined> = new Array(LIVE_UI_SLOTS_PER_TEAM);
let playerIdByLiveUiSlotTeam2: Array<number | undefined> = new Array(LIVE_UI_SLOTS_PER_TEAM);
let lastActiveTimerCount = 0;
let liveUiAssignedSlotCount = 0;
let liveUiFailedAssignmentCount = 0;
let liveUiSlotExhaustedWarnedByTeamKey: { [teamKey: string]: boolean } = {};
const LIVE_HUD_PREBUILD_PLAYERS_PER_TICK = 4;
let liveHudPrebuildQueue: number[] = [];
let liveHudPrebuildQueuedByPlayerId: { [playerId: number]: boolean } = {};

let readyTextBuiltByPlayerId: { [playerId: number]: boolean } = {};
let readyTextWidgetByPlayerId: { [playerId: number]: mod.UIWidget } = {};


/* Prematch roster UI */
const MAX_ROSTER_LINES = 32;
let prematchRosterBuilt: boolean = false;
let prematchRosterTeam1: Array<mod.UIWidget | null> = [];
let prematchRosterTeam2: Array<mod.UIWidget | null> = [];
const POSTMATCH_MAX_LINES = 24;

let postMatchWidgetsToDelete: string[] = [];

/* VoiceOver flag mapping */
const voflags: { [key: string]: mod.VoiceOverFlags } = {
  A: mod.VoiceOverFlags.Alpha,
  B: mod.VoiceOverFlags.Bravo,
  C: mod.VoiceOverFlags.Charlie,
};
const PREMATCH_SAFE_ROOT_WIDTH = 7000;
const PREMATCH_SAFE_ROOT_HEIGHT = 7000;
const PREMATCH_PANEL_NAME = "PreMatchPanel";
const PREMATCH_PANEL_POS_X = -560;
const PREMATCH_PANEL_POS_Y = -176;
const PREMATCH_PANEL_WIDTH = 292;
const PREMATCH_PANEL_HEIGHT = 572;
const PREMATCH_PANEL_ANCHOR = mod.UIAnchor.Center;
const SCREEN_UI_REFERENCE_WIDTH = 1920;
const SCREEN_UI_REFERENCE_HEIGHT = 1080;

function convertTopOffsetToCenteredY(topOffset: number, widgetHeight: number): number {
  return topOffset + widgetHeight / 2 - SCREEN_UI_REFERENCE_HEIGHT / 2;
}

const LIVE_CONTAINER_WIDTH = 900;
const LIVE_CONTAINER_HEIGHT = 140;
const LIVE_CONTAINER_CENTERED_POS_Y = convertTopOffsetToCenteredY(30, LIVE_CONTAINER_HEIGHT);
const COUNTDOWN_CONTAINER_WIDTH = 300;
const COUNTDOWN_CONTAINER_HEIGHT = 150;
const COUNTDOWN_CONTAINER_CENTERED_POS_Y = convertTopOffsetToCenteredY(150, COUNTDOWN_CONTAINER_HEIGHT);

/* -----------------------------------------------------------------------------------------------
   Top-level UI layout
------------------------------------------------------------------------------------------------ */

const UIWidget = modlib.ParseUI({
  name: "UIContainer",
  type: "Container",
  position: [0, 0],
  size: [SCREEN_UI_REFERENCE_WIDTH, SCREEN_UI_REFERENCE_HEIGHT],
  anchor: mod.UIAnchor.Center,
  visible: true,
  padding: 0,
  bgColor: [0, 0, 0],
  bgAlpha: 1,
  bgFill: mod.UIBgFill.None,
  children: [
    {
      name: "LiveContainer",
      type: "Container",
      position: [0, LIVE_CONTAINER_CENTERED_POS_Y],
      size: [LIVE_CONTAINER_WIDTH, LIVE_CONTAINER_HEIGHT],
      anchor: mod.UIAnchor.Center,
      visible: false,
      padding: 0,
      bgColor: [0, 0, 0],
      bgAlpha: 0,
      bgFill: mod.UIBgFill.None,
      children: [
        {
          name: "matchtime",
          type: "Container",
          position: [0, 30],
          size: [130, 34],
          anchor: mod.UIAnchor.TopCenter,
          visible: true,
          padding: 0,
          bgColor: [0.1216, 0.1216, 0.1216],
          bgAlpha: 0.8,
          bgFill: mod.UIBgFill.Blur,
          children: [
            {
              name: "RemainingTime",
              type: "Text",
              position: [0, 0],
              size: [130, 34],
              anchor: mod.UIAnchor.TopCenter,
              visible: true,
              padding: 0,
              bgColor: [0, 0, 0],
              bgAlpha: 0,
              bgFill: mod.UIBgFill.None,
              textLabel: mod.stringkeys.RemainingTime,
              textColor: [1, 1, 1],
              textAlpha: 1,
              textSize: 24,
              textAnchor: mod.UIAnchor.Center,
            },
          ],
        },
        {
          name: "friendlyscore",
          type: "Container",
          position: [-335, 30],
          size: [120, 34],
          anchor: mod.UIAnchor.TopCenter,
          visible: true,
          padding: 0,
          bgColor: [0.2314, 0.4196, 0.6745],
          bgAlpha: 0.8,
          bgFill: mod.UIBgFill.Blur,
          children: [
            {
              name: "friendlyscore_pulse",
              type: "Container",
              position: [0, 0],
              size: [120, 34],
              anchor: mod.UIAnchor.TopLeft,
              visible: true,
              padding: 0,
              bgColor: [0.2314, 0.4196, 0.6745],
              bgAlpha: 0,
              bgFill: mod.UIBgFill.GradientLeft,
            },
          ],
        },
        {
          name: "enemyscore",
          type: "Container",
          position: [335, 30],
          size: [120, 34],
          anchor: mod.UIAnchor.TopCenter,
          visible: true,
          padding: 0,
          bgColor: [0.698, 0.1882, 0.1882],
          bgAlpha: 0.8,
          bgFill: mod.UIBgFill.Blur,
          children: [
            {
              name: "enemyscore_pulse",
              type: "Container",
              position: [0, 0],
              size: [120, 34],
              anchor: mod.UIAnchor.TopLeft,
              visible: true,
              padding: 0,
              bgColor: [0.698, 0.1882, 0.1882],
              bgAlpha: 0,
              bgFill: mod.UIBgFill.GradientRight,
            },
          ],
        },
        {
          name: "friendlyprogressbar",
          type: "Container",
          position: [-170, 44],
          size: [210, 6],
          anchor: mod.UIAnchor.TopCenter,
          visible: true,
          padding: 0,
          bgColor: [0.2314, 0.4196, 0.6745],
          bgAlpha: 1,
          bgFill: mod.UIBgFill.Blur,
          children: [
            {
              name: "friendlyprogressbarfill",
              type: "Container",
              position: [0, 1],
              size: [210, 4],
              anchor: mod.UIAnchor.TopLeft,
              visible: true,
              padding: 0,
              bgColor: [0.2314, 0.4196, 0.6745],
              bgAlpha: 1,
              bgFill: mod.UIBgFill.GradientRight,
            },
            {
              name: "friendlyprogress_pulse",
              type: "Container",
              position: [0, 0],
              size: [210, 6],
              anchor: mod.UIAnchor.TopLeft,
              visible: true,
              padding: 0,
              bgColor: [0.2314, 0.4196, 0.6745],
              bgAlpha: 0,
              bgFill: mod.UIBgFill.GradientLeft,
            },
          ],
        },
        {
          name: "enemyprogressbar",
          type: "Container",
          position: [170, 44],
          size: [210, 6],
          anchor: mod.UIAnchor.TopCenter,
          visible: true,
          padding: 0,
          bgColor: [0.698, 0.1882, 0.1882],
          bgAlpha: 1,
          bgFill: mod.UIBgFill.Blur,
          children: [
            {
              name: "enemyprogressbarfill",
              type: "Container",
              position: [0, 1],
              size: [210, 4],
              anchor: mod.UIAnchor.TopLeft,
              visible: true,
              padding: 0,
              bgColor: [0.698, 0.1882, 0.1882],
              bgAlpha: 1,
              bgFill: mod.UIBgFill.GradientLeft,
            },
            {
              name: "enemyprogress_pulse",
              type: "Container",
              position: [0, 0],
              size: [210, 6],
              anchor: mod.UIAnchor.TopLeft,
              visible: true,
              padding: 0,
              bgColor: [0.698, 0.1882, 0.1882],
              bgAlpha: 0,
              bgFill: mod.UIBgFill.GradientRight,
            },
          ],
        },
        {
          name: "FlagContainerB",
          type: "Container",
          position: [0, 90],
          size: [20, 20],
          anchor: mod.UIAnchor.TopCenter,
          visible: true,
          padding: 0,
          bgColor: [0.0314, 0.0431, 0.0431],
          bgAlpha: 0.4,
          bgFill: mod.UIBgFill.None,
        },
        {
          name: "FlagContainerC",
          type: "Container",
          position: [100, 90],
          size: [20, 20],
          anchor: mod.UIAnchor.TopCenter,
          visible: true,
          padding: 0,
          bgColor: [0.0314, 0.0431, 0.0431],
          bgAlpha: 0.4,
          bgFill: mod.UIBgFill.None,
        },
        {
          name: "FlagContainerA",
          type: "Container",
          position: [-100, 90],
          size: [20, 20],
          anchor: mod.UIAnchor.TopCenter,
          visible: true,
          padding: 0,
          bgColor: [0.0314, 0.0431, 0.0431],
          bgAlpha: 0.4,
          bgFill: mod.UIBgFill.None,
        },
      ],
    },
    {
      name: "PostMatchContainer",
      type: "Container",
      position: [0, 0],
      size: [SCREEN_UI_REFERENCE_WIDTH, SCREEN_UI_REFERENCE_HEIGHT],
      anchor: mod.UIAnchor.Center,
      visible: true,
      padding: 0,
      bgColor: [0, 0, 0],
      bgAlpha: 1,
      bgFill: mod.UIBgFill.None,
    },
    {
      name: "PreMatchContainer",
      type: "Container",
      position: [0, 0],
      size: [PREMATCH_SAFE_ROOT_WIDTH, PREMATCH_SAFE_ROOT_HEIGHT],
      anchor: mod.UIAnchor.Center,
      visible: true,
      padding: 0,
      bgColor: [0, 0, 0],
      bgAlpha: 0,
      bgFill: mod.UIBgFill.None,
      children: [
        {
          name: PREMATCH_PANEL_NAME,
          type: "Container",
          position: [PREMATCH_PANEL_POS_X, PREMATCH_PANEL_POS_Y],
          size: [PREMATCH_PANEL_WIDTH, PREMATCH_PANEL_HEIGHT],
          anchor: PREMATCH_PANEL_ANCHOR,
          visible: true,
          padding: 0,
          bgColor: [0, 0, 0],
          bgAlpha: 0.5,
          bgFill: mod.UIBgFill.Blur,
          children: [
            {
              name: "Text_Cipher_Esports",
              type: "Text",
              position: [-72, 22],
              size: [130, 42],
              anchor: mod.UIAnchor.TopCenter,
              visible: true,
              padding: 0,
              bgColor: [0.2, 0.2, 0.2],
              bgAlpha: 1,
              bgFill: mod.UIBgFill.None,
              textLabel: mod.stringkeys.Text_Cipher_Esports,
              textColor: [1, 1, 1],
              textAlpha: 1,
              textSize: 22,
              textAnchor: mod.UIAnchor.Center,
            },
            {
              name: "Text_Mode_KingOfTheHill",
              type: "Text",
              position: [72, 22],
              size: [130, 42],
              anchor: mod.UIAnchor.TopCenter,
              visible: true,
              padding: 0,
              bgColor: [0.2, 0.2, 0.2],
              bgAlpha: 1,
              bgFill: mod.UIBgFill.None,
              textLabel: mod.stringkeys.Text_Mode_KingOfTheHill,
              textColor: [1, 1, 1],
              textAlpha: 1,
              textSize: 22,
              textAnchor: mod.UIAnchor.Center,
            },
            {
              name: "Container_NRDAA",
              type: "Container",
              position: [0, 18],
              size: [1, 58],
              anchor: mod.UIAnchor.TopCenter,
              visible: true,
              padding: 0,
              bgColor: [1, 1, 1],
              bgAlpha: 0.8,
              bgFill: mod.UIBgFill.Solid,
            },
            {
              name: "Text_Current_Map",
              type: "Text",
              position: [0, 70],
              size: [260, 48],
              anchor: mod.UIAnchor.TopCenter,
              visible: true,
              padding: 0,
              bgColor: [0.2, 0.2, 0.2],
              bgAlpha: 1,
              bgFill: mod.UIBgFill.None,
              textLabel: mod.stringkeys.Text_Current_Map,
              textColor: [1, 1, 1],
              textAlpha: 1,
              textSize: 20,
              textAnchor: mod.UIAnchor.Center,
            },
            {
              name: "Text_Team_1",
              type: "Text",
              position: [-72, 170],
              size: [130, 34],
              anchor: mod.UIAnchor.TopCenter,
              visible: true,
              padding: 0,
              bgColor: [0.2, 0.2, 0.2],
              bgAlpha: 1,
              bgFill: mod.UIBgFill.None,
              textLabel: mod.stringkeys.Text_Team_1,
              textColor: [1, 1, 1],
              textAlpha: 1,
              textSize: 22,
              textAnchor: mod.UIAnchor.Center,
            },
            {
              name: "Text_Team_2",
              type: "Text",
              position: [72, 170],
              size: [130, 34],
              anchor: mod.UIAnchor.TopCenter,
              visible: true,
              padding: 0,
              bgColor: [0.2, 0.2, 0.2],
              bgAlpha: 1,
              bgFill: mod.UIBgFill.None,
              textLabel: mod.stringkeys.Text_Team_2,
              textColor: [1, 1, 1],
              textAlpha: 1,
              textSize: 22,
              textAnchor: mod.UIAnchor.Center,
            },
          ],
        },
      ],
    },
    {
      name: "CountDownContainer",
      type: "Container",
      position: [0, COUNTDOWN_CONTAINER_CENTERED_POS_Y],
      size: [COUNTDOWN_CONTAINER_WIDTH, COUNTDOWN_CONTAINER_HEIGHT],
      anchor: mod.UIAnchor.Center,
      visible: false,
      padding: 0,
      bgColor: [0, 0, 0],
      bgAlpha: 0.5,
      bgFill: mod.UIBgFill.Blur,
      children: [
        {
          name: "MatchStartsText",
          type: "Text",
          position: [0, 0],
          size: [300, 50],
          anchor: mod.UIAnchor.TopCenter,
          visible: true,
          padding: 0,
          bgColor: [0.2, 0.2, 0.2],
          bgAlpha: 1,
          bgFill: mod.UIBgFill.None,
          textLabel: mod.stringkeys.MatchStarts,
          textColor: [1, 1, 1],
          textAlpha: 1,
          textSize: 50,
          textAnchor: mod.UIAnchor.Center,
        },
        {
          name: "CountDownText",
          type: "Text",
          position: [0, 50],
          size: [300, 100],
          anchor: mod.UIAnchor.TopCenter,
          visible: true,
          padding: 0,
          bgColor: [0.2, 0.2, 0.2],
          bgAlpha: 1,
          bgFill: mod.UIBgFill.None,
          textLabel: mod.stringkeys.CountDownText,
          textColor: [1, 1, 1],
          textAlpha: 1,
          textSize: 100,
          textAnchor: mod.UIAnchor.Center,
        },
      ],
    },
  ],
});
// Legacy dormant helper retained for rollback safety; not called in interact-only prematch authority.

function ArmPrematchUIInteractivityForAllPlayers(): void {
  // Re-assert prematch overlay widgets only; prematch authority is world interact driven.
  const allPlayers = mod.AllPlayers();
  for (let i = 0; i < mod.CountOf(allPlayers); i++) {
    const p = mod.ValueInArray(allPlayers, i) as mod.Player;
    if (p && mod.IsPlayerValid(p)) {
      EnsureGlobalPrematchHitboxesForPlayer(p);
    }
  }
}

function HandlePrematchReadyUp(player: mod.Player): void {
  if (gameStatus !== 0) return;
  if (!mod.IsPlayerValid(player)) return;
  if (isBotBackfillPlayer(player)) return;
  if (isExcludedPlayer(player)) return;

  const p = serverPlayers.get(modlib.getPlayerId(player));
  if (!p) return;

  // Prematch authority is interact-only; this toggles authoritative ready state.
  p.changeReady();

  UpdatePrematchRosterUI();

  if (SFX_ReadyUp) mod.PlaySound(SFX_ReadyUp, 0.8, player);
}

function warnPrematchSwitchDebounceOnce(playerId: number, ticksRemaining: number): void {
  if (prematchSwitchDebounceWarnedByPlayerId[playerId] === true) return;
  prematchSwitchDebounceWarnedByPlayerId[playerId] = true;
  mod.DisplayHighlightedWorldLogMessage(
    mod.Message(
      "[PREMATCH SWITCH] debounced player/remainTicks/status/inits {}",
      String(playerId) +
        "/" +
        String(ticksRemaining) +
        "/" +
        String(gameStatus) +
        "/" +
        getInitializationFlagSummary()
    )
  );
}

function warnPrematchStabilizationGateBlockedOnce(
  readyPlayers: number[],
  totalPlayers: number[],
  elapsedTicksSinceSwitch: number
): void {
  const key = String(lastPrematchTeamSwitchTick);
  if (prematchStabilizationGateWarnedBySwitchTick[key] === true) return;
  prematchStabilizationGateWarnedBySwitchTick[key] = true;

  mod.DisplayHighlightedWorldLogMessage(
    mod.Message(
      "[PREMATCH GATE] blocked status/inits/rdy/tot/switchElapsed {}",
      String(gameStatus) +
        "/" +
        getInitializationFlagSummary() +
        "/" +
        String(readyPlayers[0]) +
        "-" +
        String(readyPlayers[1]) +
        "/" +
        String(totalPlayers[0]) +
        "-" +
        String(totalPlayers[1]) +
        "/" +
        String(elapsedTicksSinceSwitch)
    )
  );
}

function markPrematchTeamSwitchTick(playerId: number): void {
  lastPrematchTeamSwitchTick = serverTickCount;
  lastPrematchTeamSwitchTickByPlayerId[playerId] = serverTickCount;
}

function isPrematchSwitchDebounced(playerId: number): boolean {
  const lastTick = prematchSwitchLastHandledTickByPlayerId[playerId] ?? -999999;
  const elapsedTicks = serverTickCount - lastTick;
  if (elapsedTicks < PREMATCH_SWITCH_DEBOUNCE_TICKS) {
    warnPrematchSwitchDebounceOnce(playerId, PREMATCH_SWITCH_DEBOUNCE_TICKS - elapsedTicks);
    return true;
  }

  prematchSwitchLastHandledTickByPlayerId[playerId] = serverTickCount;
  return false;
}

function HandlePrematchSwitchTeams(player: mod.Player): void {
  if (gameStatus !== 0) return;
  if (!mod.IsPlayerValid(player)) return;
  if (isBotBackfillPlayer(player)) return;
  if (isExcludedPlayer(player)) return;
  const playerId = modlib.getPlayerId(player);
  if (isPrematchSwitchDebounced(playerId)) return;

  const p = serverPlayers.get(playerId);
  const currentTeam = mod.GetTeam(player);

  // If they were ready, unready them when switching (same behavior as your IP path)
  if (p && p.isReady()) p.changeReady();

  const goingToTeam2 = modlib.getTeamId(currentTeam) === 1;
  const newTeam = goingToTeam2 ? team2 : team1;

  switchTeamPrematchAndRedeploy(player, newTeam);
  markPrematchTeamSwitchTick(playerId);

  p?.setTeam();
  queueLiveHudPrebuildForPlayer(p);
  setReadyPhaseProtectionForPlayer(player, true);

  Object.values(serverCapturePoints).forEach((cp) => {
    if (!p) return;

    if (modlib.Equals(cp.getOwner(), newTeam)) {
      setFlagLetterAndOutlineColorForPlayer(p.id, cp.symbol as any, COLOR_FRIENDLY);
    } else if (!modlib.Equals(cp.getOwner(), teamNeutral)) {
      setFlagLetterAndOutlineColorForPlayer(p.id, cp.symbol as any, COLOR_ENEMY);
    } else {
      setFlagLetterAndOutlineColorForPlayer(p.id, cp.symbol as any, COLOR_NEUTRAL);
    }
  });

  UpdatePrematchRosterUI();
}

function Mode_OnPlayerUIButtonEvent(
  eventPlayer: mod.Player,
  eventUIWidget: mod.UIWidget,
  eventUIButtonEvent: mod.UIButtonEvent
): void {
  return;
}

// Force key UI widgets to render AboveGameUI (above deploy screen / game UI layer)
function SetDepthAboveGameUI(name: string): void {
  const w = mod.FindUIWidgetWithName(name);
  if (!w) return;
  mod.SetUIWidgetDepth(w, mod.UIDepth.AboveGameUI);
}

/* -----------------------------------------------------------------------------------------------
   Match start banner (KOTH splash)
------------------------------------------------------------------------------------------------ */

const MATCH_START_BANNER_SHOW_SECONDS = 2.0;
let matchStartBannerRunning = false;

const container0nx1gWidget = modlib.ParseUI({
  name: "Container_0NX1G",
  type: "Container",
  position: [0, 0],
  size: [SCREEN_UI_REFERENCE_WIDTH, SCREEN_UI_REFERENCE_HEIGHT],
  anchor: mod.UIAnchor.Center,
  visible: false,
  padding: 0,
  bgColor: [0, 0, 0],
  bgAlpha: 0,
  bgFill: mod.UIBgFill.None,
  children: [
    {
      name: "Text_Cipher_Presents",
      type: "Text",
      position: [0, -325],
      size: [650, 110],
      anchor: mod.UIAnchor.Center,
      visible: true,
      padding: 0,
      bgColor: [0, 0, 0],
      bgAlpha: 0,
      bgFill: mod.UIBgFill.None,
      textLabel: mod.stringkeys.Text_Cipher_Presents,
      textColor: [0.35, 0.65, 1.0],
      textAlpha: 1,
      textSize: 34,
      textAnchor: mod.UIAnchor.TopCenter,
    },
    {
      name: "Intro_KOTH_Text",
      type: "Text",
      position: [0, 200],
      size: [650, 110],
      anchor: mod.UIAnchor.TopCenter,
      visible: true,
      padding: 0,
      bgColor: [1.0, 0.55, 0.18],
      bgAlpha: 0.95,
      bgFill: mod.UIBgFill.Solid,
      textLabel: mod.stringkeys.Text_KingOfTheHill,
      textColor: [1, 1, 1],
      textAlpha: 1,
      textSize: 80,
      textAnchor: mod.UIAnchor.Center,
    },
    {
      name: "Intro_KOTH_Line_Left",
      type: "Container",
      position: [-385, 200],
      size: [80, 110],
      anchor: mod.UIAnchor.TopCenter,
      visible: true,
      padding: 0,
      bgColor: [1.0, 0.45, 0.16],
      bgAlpha: 0.9,
      bgFill: mod.UIBgFill.GradientRight,
    },
    {
      name: "Intro_KOTH_Line_Right",
      type: "Container",
      position: [385, 200],
      size: [80, 110],
      anchor: mod.UIAnchor.TopCenter,
      visible: true,
      padding: 0,
      bgColor: [1.0, 0.45, 0.16],
      bgAlpha: 0.9,
      bgFill: mod.UIBgFill.GradientLeft,
    },
  ],
});

function Lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}

async function showMatchStartBannerOnce(): Promise<void> {
  await mod.Wait(0.8); // Wait for the match start stinger to finish playing
  if (matchStartBannerRunning) return;
  matchStartBannerRunning = true;

  const root = mod.FindUIWidgetWithName("Container_0NX1G");
  const textW = mod.FindUIWidgetWithName("Intro_KOTH_Text");
  const leftW = mod.FindUIWidgetWithName("Intro_KOTH_Line_Left");
  const rightW = mod.FindUIWidgetWithName("Intro_KOTH_Line_Right");

  if (!root || !textW || !leftW || !rightW) {
    matchStartBannerRunning = false;
    return;
  }

  mod.SetUIWidgetVisible(root, true);

  mod.SetUIWidgetBgAlpha(textW, 1);
  mod.SetUITextAlpha(textW, 1);

  mod.SetUIWidgetBgAlpha(leftW, 1);
  mod.SetUIWidgetBgAlpha(rightW, 1);

  await mod.Wait(MATCH_START_BANNER_SHOW_SECONDS);

  let currentLerpValue = 0;
  let lerpIncrement = 0;

  while (currentLerpValue < 1.0) {
    lerpIncrement += 0.1;
    currentLerpValue = Lerp(currentLerpValue, 1, lerpIncrement);

    const a = 1 - currentLerpValue;

    mod.SetUIWidgetBgAlpha(textW, a);
    mod.SetUITextAlpha(textW, a);
    mod.SetUIWidgetBgAlpha(leftW, a);
    mod.SetUIWidgetBgAlpha(rightW, a);

    await mod.Wait(0.1);
  }

  mod.SetUIWidgetVisible(root, false);
  matchStartBannerRunning = false;
}

/* -----------------------------------------------------------------------------------------------
   Prematch roster UI
------------------------------------------------------------------------------------------------ */
// -------------------- Prematch UI (per-player) --------------------

const UI_PREMATCH_CONTAINER_ID = "UI_PREMATCH_CONTAINER_";
const UI_PREMATCH_BUTTON_READY_ID = "UI_PREMATCH_BUTTON_READY_";
const UI_PREMATCH_BUTTON_SWITCH_ID = "UI_PREMATCH_BUTTON_SWITCH_";
const UI_PREMATCH_LABEL_READY_ID = "UI_PREMATCH_LABEL_READY_";
const UI_PREMATCH_LABEL_SWITCH_ID = "UI_PREMATCH_LABEL_SWITCH_";

const PREMATCH_BUTTON_TEXT_COLOR = mod.CreateVector(0.0314, 0.0431, 0.0431);
const PREMATCH_BUTTON_BASE_COLOR = mod.CreateVector(0.0745, 0.1843, 0.2471);
const PREMATCH_BUTTON_HOVER_COLOR = mod.CreateVector(1, 1, 1);
const PREMATCH_BUTTON_PRESSED_COLOR = mod.CreateVector(0.4392, 0.9216, 1);
const PREMATCH_COLUMN_CENTER_OFFSET = 72;
const PREMATCH_BUTTON_Y = 516;
const PREMATCH_BUTTON_WIDTH = 130;
const PREMATCH_BUTTON_HEIGHT = 42;
const PREMATCH_BUTTON_LABEL_Y = PREMATCH_BUTTON_Y;
const PREMATCH_LABEL_WIDTH = PREMATCH_BUTTON_WIDTH;
const PREMATCH_LABEL_HEIGHT = PREMATCH_BUTTON_HEIGHT;
const PREMATCH_ROSTER_START_Y = 214;
const PREMATCH_ROSTER_ROW_HEIGHT = 16;
const PREMATCH_ROSTER_TEXT_WIDTH = 130;
const PREMATCH_ROSTER_TEXT_HEIGHT = 16;
const PREMATCH_ROSTER_TEXT_SIZE = 14;
const PREMATCH_ROSTER_LINE_WIDTH = 118;
const PREMATCH_ROSTER_LINE_HEIGHT = 1;

function safeFind(name: string): mod.UIWidget | undefined {
  try {
    const root = mod.GetUIRoot();
    try {
      const wRoot = mod.FindUIWidgetWithName(name, root);
      if (wRoot && mod.IsType(wRoot, mod.Types.UIWidget)) return wRoot as mod.UIWidget;
    } catch {
    }

    const w = mod.FindUIWidgetWithName(name);
    if (w && mod.IsType(w, mod.Types.UIWidget)) return w as mod.UIWidget;
  } catch {
  }
  return undefined;
}

function getPrematchPanelWidget(): mod.UIWidget | null {
  return SafeFindWidget(PREMATCH_PANEL_NAME) ?? SafeFindWidget("PreMatchContainer");
}

function ensurePrematchLabelOverlay(
  player: mod.Player,
  container: mod.UIWidget,
  labelName: string,
  posX: number,
  labelKey: any
): void {
  const existing = safeFind(labelName);
  if (!existing) {
    mod.AddUIText(
      labelName,
      mod.CreateVector(posX, PREMATCH_BUTTON_LABEL_Y, 0),
      mod.CreateVector(PREMATCH_LABEL_WIDTH, PREMATCH_LABEL_HEIGHT, 0),
      mod.UIAnchor.TopCenter,
      container,
      true,
      0,
      mod.CreateVector(0, 0, 0),
      0,
      mod.UIBgFill.None,
      mod.Message(labelKey),
      22,
      PREMATCH_BUTTON_TEXT_COLOR,
      1,
      mod.UIAnchor.Center,
      player
    );
  }

  const label = safeFind(labelName);
  if (label) {
    mod.SetUITextLabel(label, mod.Message(labelKey));
    mod.SetUITextColor(label, PREMATCH_BUTTON_TEXT_COLOR);
    mod.SetUIWidgetDepth(label, mod.UIDepth.AboveGameUI);
    mod.SetUIWidgetVisible(label, true);
  }
}

function HideLegacyPrematchButtons(): void {
  const legacyNames = [
    "Button_Ready",
    "Button_Switch_Team",
    "Text_Ready",
    "Text_Switch_Teams",
    "Button_Ready_Label",
    "Button_Switch_Team_Label",
  ];

  for (let i = 0; i < legacyNames.length; i++) {
    const w = safeFind(legacyNames[i]);
    if (!w) continue;
    try {
      mod.SetUIWidgetVisible(w, false);
      // Defensive: ensure legacy buttons never capture input
      if (legacyNames[i] === "Button_Ready" || legacyNames[i] === "Button_Switch_Team") {
        mod.EnableUIButtonEvent(w, mod.UIButtonEvent.ButtonDown, false);
        mod.EnableUIButtonEvent(w, mod.UIButtonEvent.ButtonUp, false);
      }
    } catch {
      // ignore
    }
  }
}

function EnsurePrematchButtonsForPlayer(player: mod.Player): void {
  if (!mod.IsPlayerValid(player)) return;

  HideLegacyPrematchButtons();
  const pid = mod.GetObjId(player);

  const containerName = UI_PREMATCH_CONTAINER_ID + pid;
  const readyBtnName = UI_PREMATCH_BUTTON_READY_ID + pid;
  const switchBtnName = UI_PREMATCH_BUTTON_SWITCH_ID + pid;
  const readyLabelName = UI_PREMATCH_LABEL_READY_ID + pid;
  const switchLabelName = UI_PREMATCH_LABEL_SWITCH_ID + pid;

  const applyButtonBaseAndAlphas = (btn: mod.UIWidget): void => {
    mod.SetUIButtonEnabled(btn, true);

    mod.SetUIButtonColorBase(btn, PREMATCH_BUTTON_BASE_COLOR);
    mod.SetUIButtonColorDisabled(btn, PREMATCH_BUTTON_BASE_COLOR);
    mod.SetUIButtonColorPressed(btn, PREMATCH_BUTTON_PRESSED_COLOR);
    mod.SetUIButtonColorHover(btn, PREMATCH_BUTTON_HOVER_COLOR);
    mod.SetUIButtonColorFocused(btn, PREMATCH_BUTTON_BASE_COLOR);

    mod.SetUIButtonAlphaBase(btn, 1);
    mod.SetUIButtonAlphaDisabled(btn, 1);
    mod.SetUIButtonAlphaPressed(btn, 1);
    mod.SetUIButtonAlphaHover(btn, 1);
    mod.SetUIButtonAlphaFocused(btn, 1);

    mod.SetUIWidgetDepth(btn, mod.UIDepth.AboveGameUI);
  };

  const existingContainer = safeFind(containerName);
  if (existingContainer) {
    mod.EnableUIInputMode(false, player);

    const readyBtn = safeFind(readyBtnName);
    const switchBtn = safeFind(switchBtnName);

    const rebuild = false;

    if (rebuild) {
      const readyLabel = safeFind(readyLabelName);
      const switchLabel = safeFind(switchLabelName);

      if (readyLabel) mod.DeleteUIWidget(readyLabel);
      if (switchLabel) mod.DeleteUIWidget(switchLabel);
      if (readyBtn) mod.DeleteUIWidget(readyBtn);
      if (switchBtn) mod.DeleteUIWidget(switchBtn);

      mod.DeleteUIWidget(existingContainer);
    } else {
      mod.SetUIWidgetVisible(existingContainer, true);
      mod.SetUIWidgetDepth(existingContainer, mod.UIDepth.AboveGameUI);

      if (readyBtn) applyButtonBaseAndAlphas(readyBtn);
      if (switchBtn) applyButtonBaseAndAlphas(switchBtn);

      ensurePrematchLabelOverlay(
        player,
        existingContainer,
        readyLabelName,
        -PREMATCH_COLUMN_CENTER_OFFSET,
        mod.stringkeys.Text_Ready
      );
      ensurePrematchLabelOverlay(
        player,
        existingContainer,
        switchLabelName,
        PREMATCH_COLUMN_CENTER_OFFSET,
        mod.stringkeys.Text_Switch_Teams
      );

      return;
    }
  }

  mod.EnableUIInputMode(false, player);

  mod.AddUIContainer(
    containerName,
    mod.CreateVector(PREMATCH_PANEL_POS_X, PREMATCH_PANEL_POS_Y, 0),
    mod.CreateVector(PREMATCH_PANEL_WIDTH, PREMATCH_PANEL_HEIGHT, 0),
    PREMATCH_PANEL_ANCHOR,
    mod.GetUIRoot(),
    true,
    0,
    mod.CreateVector(0, 0, 0),
    0,
    mod.UIBgFill.None,
    player
  );

  const container = safeFind(containerName);
  if (!container) return;
  mod.SetUIWidgetDepth(container, mod.UIDepth.AboveGameUI);

  mod.AddUIButton(
    readyBtnName,
    mod.CreateVector(-PREMATCH_COLUMN_CENTER_OFFSET, PREMATCH_BUTTON_Y, 0),
    mod.CreateVector(PREMATCH_BUTTON_WIDTH, PREMATCH_BUTTON_HEIGHT, 0),
    mod.UIAnchor.TopCenter,
    container,
    true,
    0,
    mod.CreateVector(1, 1, 1),
    1,
    mod.UIBgFill.Solid,
    true,
    PREMATCH_BUTTON_BASE_COLOR,
    1,
    PREMATCH_BUTTON_BASE_COLOR,
    1,
    PREMATCH_BUTTON_PRESSED_COLOR,
    1,
    PREMATCH_BUTTON_HOVER_COLOR,
    1,
    PREMATCH_BUTTON_BASE_COLOR,
    1,
    player
  );

  mod.AddUIButton(
    switchBtnName,
    mod.CreateVector(PREMATCH_COLUMN_CENTER_OFFSET, PREMATCH_BUTTON_Y, 0),
    mod.CreateVector(PREMATCH_BUTTON_WIDTH, PREMATCH_BUTTON_HEIGHT, 0),
    mod.UIAnchor.TopCenter,
    container,
    true,
    0,
    mod.CreateVector(1, 1, 1),
    1,
    mod.UIBgFill.Solid,
    true,
    PREMATCH_BUTTON_BASE_COLOR,
    1,
    PREMATCH_BUTTON_BASE_COLOR,
    1,
    PREMATCH_BUTTON_PRESSED_COLOR,
    1,
    PREMATCH_BUTTON_HOVER_COLOR,
    1,
    PREMATCH_BUTTON_BASE_COLOR,
    1,
    player
  );

  const readyBtn2 = safeFind(readyBtnName);
  const switchBtn2 = safeFind(switchBtnName);
  if (readyBtn2) applyButtonBaseAndAlphas(readyBtn2);
  if (switchBtn2) applyButtonBaseAndAlphas(switchBtn2);

  ensurePrematchLabelOverlay(
    player,
    container,
    readyLabelName,
    -PREMATCH_COLUMN_CENTER_OFFSET,
    mod.stringkeys.Text_Ready
  );
  ensurePrematchLabelOverlay(
    player,
    container,
    switchLabelName,
    PREMATCH_COLUMN_CENTER_OFFSET,
    mod.stringkeys.Text_Switch_Teams
  );
}

function SetPrematchButtonsVisibleForPlayer(player: mod.Player, visible: boolean): void {
  if (!mod.IsPlayerValid(player)) return;

  const pid = mod.GetObjId(player);
  const container = safeFind(UI_PREMATCH_CONTAINER_ID + pid);
  const rdybutton = safeFind(UI_PREMATCH_BUTTON_READY_ID + pid);
  const switchbutton = safeFind(UI_PREMATCH_BUTTON_SWITCH_ID + pid);
  const txtready = safeFind(UI_PREMATCH_LABEL_READY_ID + pid);
  const txtswitch = safeFind(UI_PREMATCH_LABEL_SWITCH_ID + pid);
  if (container) mod.SetUIWidgetVisible(container, visible);
  if (rdybutton) mod.SetUIWidgetVisible(rdybutton, visible);
  if (switchbutton) mod.SetUIWidgetVisible(switchbutton, visible);
  if (txtready) mod.SetUIWidgetVisible(txtready, visible);
  if (txtswitch) mod.SetUIWidgetVisible(txtswitch, visible);
  if (!visible) mod.EnableUIInputMode(false, player);
}

function SetPrematchButtonsVisibleForAllPlayers(visible: boolean): void {
  const allPlayers = mod.AllPlayers();
  for (let i = 0; i < mod.CountOf(allPlayers); i++) {
    const p = mod.ValueInArray(allPlayers, i) as mod.Player;
    if (p && mod.IsPlayerValid(p)) SetPrematchButtonsVisibleForPlayer(p, visible);
  }
}
// Prematch roster UI lists centered player names with a light separator line under each row.

let prematchRosterTeam1Lines: Array<mod.UIWidget | null> = [];
let prematchRosterTeam2Lines: Array<mod.UIWidget | null> = [];

const ROSTER_LINE_COLOR = mod.CreateVector(0.9, 0.9, 0.9);

function resetPrematchRosterBuildState(): void {
  prematchRosterBuilt = false;
  prematchRosterTeam1 = [];
  prematchRosterTeam2 = [];
  prematchRosterTeam1Lines = [];
  prematchRosterTeam2Lines = [];
}

function BuildPrematchRosterUI(): void {
  if (prematchRosterBuilt) return;

  const parent = getPrematchPanelWidget();
  if (!parent) {
    warnPrematchUiGuardOnce(
      "prematch_roster_parent_missing",
      mod.Message("[PREMATCH ROSTER] missing parent widget {}", PREMATCH_PANEL_NAME)
    );
    return;
  }

  let buildOk = false;
  try {
    const startY = PREMATCH_ROSTER_START_Y;
    const rowH = PREMATCH_ROSTER_ROW_HEIGHT;

    const textW = PREMATCH_ROSTER_TEXT_WIDTH;
    const textH = PREMATCH_ROSTER_TEXT_HEIGHT;

    const lineW = PREMATCH_ROSTER_LINE_WIDTH;
    const lineH = PREMATCH_ROSTER_LINE_HEIGHT;

    prematchRosterTeam1 = [];
    prematchRosterTeam2 = [];
    prematchRosterTeam1Lines = [];
    prematchRosterTeam2Lines = [];

    for (let i = 0; i < MAX_ROSTER_LINES; i++) {
      const y = startY + i * rowH;

      mod.AddUIText(
        "PreMatchRosterT1_" + i,
        mod.CreateVector(-PREMATCH_COLUMN_CENTER_OFFSET, y, 0),
        mod.CreateVector(textW, textH, 0),
        mod.UIAnchor.TopCenter,
        parent,
        false,
        0,
        mod.CreateVector(0, 0, 0),
        0,
        mod.UIBgFill.None,
        mod.Message(""),
        PREMATCH_ROSTER_TEXT_SIZE,
        mod.CreateVector(1, 1, 1),
        1,
        mod.UIAnchor.Center
      );

      mod.AddUIContainer(
        "PreMatchRosterT1Line_" + i,
        mod.CreateVector(-PREMATCH_COLUMN_CENTER_OFFSET, y + textH - 1, 0),
        mod.CreateVector(lineW, lineH, 0),
        mod.UIAnchor.TopCenter,
        parent,
        false,
        0,
        ROSTER_LINE_COLOR,
        0.8,
        mod.UIBgFill.Solid
      );

      mod.AddUIText(
        "PreMatchRosterT2_" + i,
        mod.CreateVector(PREMATCH_COLUMN_CENTER_OFFSET, y, 0),
        mod.CreateVector(textW, textH, 0),
        mod.UIAnchor.TopCenter,
        parent,
        false,
        0,
        mod.CreateVector(0, 0, 0),
        0,
        mod.UIBgFill.None,
        mod.Message(""),
        PREMATCH_ROSTER_TEXT_SIZE,
        mod.CreateVector(1, 1, 1),
        1,
        mod.UIAnchor.Center
      );

      mod.AddUIContainer(
        "PreMatchRosterT2Line_" + i,
        mod.CreateVector(PREMATCH_COLUMN_CENTER_OFFSET, y + textH - 1, 0),
        mod.CreateVector(lineW, lineH, 0),
        mod.UIAnchor.TopCenter,
        parent,
        false,
        0,
        ROSTER_LINE_COLOR,
        0.8,
        mod.UIBgFill.Solid
      );

      prematchRosterTeam1.push(SafeFindWidget("PreMatchRosterT1_" + i));
      prematchRosterTeam2.push(SafeFindWidget("PreMatchRosterT2_" + i));

      prematchRosterTeam1Lines.push(SafeFindWidget("PreMatchRosterT1Line_" + i));
      prematchRosterTeam2Lines.push(SafeFindWidget("PreMatchRosterT2Line_" + i));
    }

    buildOk = true;
  } catch (err) {
    LogRuntimeError("BuildPrematchRosterUI", err);
    warnPrematchUiGuardOnce(
      "prematch_roster_build_failed",
      mod.Message("[PREMATCH ROSTER] build failed (see runtime error log)")
    );
  } finally {
    prematchRosterBuilt = buildOk;
    if (!buildOk) {
      resetPrematchRosterBuildState();
    }
  }
}

function UpdatePrematchRosterUI(): void {
  if (!prematchRosterBuilt) {
    BuildPrematchRosterUI();
    if (!prematchRosterBuilt) return;
  }

  try {
    const team1Players: Player[] = [];
    const team2Players: Player[] = [];

    serverPlayers.forEach((p) => {
      const t = mod.GetTeam(p.player);
      if (mod.Equals(t, team1)) team1Players.push(p);
      else if (mod.Equals(t, team2)) team2Players.push(p);
    });

    team1Players.sort((a, b) => a.id - b.id);
    team2Players.sort((a, b) => a.id - b.id);

    for (let i = 0; i < MAX_ROSTER_LINES; i++) {
      const w = prematchRosterTeam1[i];
      const line = prematchRosterTeam1Lines[i];
      if (!w || !line) continue;

      if (i < team1Players.length) {
        const p = team1Players[i];
        const ready = isBotBackfillPlayer(p.player) ? true : p.isReady();

        SafeSetWidgetVisibleHandle(w, true);
        SafeSetWidgetVisibleHandle(line, true);
        SafeSetTextColorHandle(w, ready ? mod.CreateVector(0, 1, 0) : mod.CreateVector(1, 0, 0));
        SafeSetTextLabelHandle(
          w,
          ready
            ? mod.Message(mod.stringkeys.RosterReadyLine, p.player)
            : mod.Message(mod.stringkeys.RosterNotReadyLine, p.player)
        );
      } else {
        SafeSetWidgetVisibleHandle(w, false);
        SafeSetWidgetVisibleHandle(line, false);
        SafeSetTextLabelHandle(w, mod.Message(""));
      }
    }

    for (let i = 0; i < MAX_ROSTER_LINES; i++) {
      const w = prematchRosterTeam2[i];
      const line = prematchRosterTeam2Lines[i];
      if (!w || !line) continue;

      if (i < team2Players.length) {
        const p = team2Players[i];
        const ready = isBotBackfillPlayer(p.player) ? true : p.isReady();

        SafeSetWidgetVisibleHandle(w, true);
        SafeSetWidgetVisibleHandle(line, true);
        SafeSetTextColorHandle(w, ready ? mod.CreateVector(0, 1, 0) : mod.CreateVector(1, 0, 0));
        SafeSetTextLabelHandle(
          w,
          ready
            ? mod.Message(mod.stringkeys.RosterReadyLine, p.player)
            : mod.Message(mod.stringkeys.RosterNotReadyLine, p.player)
        );
      } else {
        SafeSetWidgetVisibleHandle(w, false);
        SafeSetWidgetVisibleHandle(line, false);
        SafeSetTextLabelHandle(w, mod.Message(""));
      }
    }
  } catch (err) {
    LogRuntimeError("UpdatePrematchRosterUI", err);
    warnPrematchUiGuardOnce(
      "prematch_roster_update_failed",
      mod.Message("[PREMATCH ROSTER] update failed; forcing rebuild")
    );
    resetPrematchRosterBuildState();
  }
}

/* -----------------------------------------------------------------------------------------------
   Per-player ReadyText (prematch)
------------------------------------------------------------------------------------------------ */

function replacePrematchReadyText(playerId: number, receiver: mod.Player): void {
  const readyTextName = "ReadyText" + playerId;
  safeDeleteWidgetByName(readyTextName);

  const parent = getPrematchPanelWidget();
  if (!parent) {
    readyTextBuiltByPlayerId[playerId] = false;
    delete readyTextWidgetByPlayerId[playerId];
    warnPrematchUiGuardOnce(
      "prematch_readytext_parent_missing",
      mod.Message("[PREMATCH READY TEXT] missing parent widget {}", PREMATCH_PANEL_NAME)
    );
    return;
  }

  try {
    mod.AddUIText(
      readyTextName,
      mod.CreateVector(0, 106, 0),
      mod.CreateVector(260, 24, 0),
      mod.UIAnchor.TopCenter,
      parent,
      true,
      0,
      mod.CreateVector(0, 0, 0),
      0.4,
      mod.UIBgFill.None,
      mod.Message(mod.stringkeys.NotReady),
      22,
      mod.CreateVector(1, 0, 0),
      1,
      mod.UIAnchor.Center,
      receiver
    );
  } catch (err) {
    LogRuntimeError("replacePrematchReadyText/" + String(playerId), err);
    readyTextBuiltByPlayerId[playerId] = false;
    delete readyTextWidgetByPlayerId[playerId];
    return;
  }

  const readyWidget = SafeFindWidget(readyTextName);
  if (!readyWidget) {
    readyTextBuiltByPlayerId[playerId] = false;
    delete readyTextWidgetByPlayerId[playerId];
    warnPrematchUiGuardOnce(
      "prematch_readytext_handle_missing",
      mod.Message("[PREMATCH READY TEXT] widget missing after add {}", readyTextName)
    );
    return;
  }

  readyTextBuiltByPlayerId[playerId] = true;
  readyTextWidgetByPlayerId[playerId] = readyWidget;
}

function resolvePrematchReadyTextWidgetForPlayer(playerId: number): mod.UIWidget | undefined {
  const name = "ReadyText" + playerId;
  const widget = SafeFindWidget(name);
  if (!widget) {
    readyTextBuiltByPlayerId[playerId] = false;
    delete readyTextWidgetByPlayerId[playerId];
    return undefined;
  }

  readyTextBuiltByPlayerId[playerId] = true;
  readyTextWidgetByPlayerId[playerId] = widget;
  return widget;
}

/* -----------------------------------------------------------------------------------------------
   Live HUD (per player) build / rebuild
------------------------------------------------------------------------------------------------ */

function deleteLegacyLiveHudWidgetsForPlayer(playerId: number): void {
  const widgetNames = [
    "TeamFriendlyScore" + playerId,
    "TeamFriendlyScorePad1" + playerId,
    "TeamFriendlyScorePad2" + playerId,
    "TeamOpponentScore" + playerId,
    "TeamOpponentScorePad1" + playerId,
    "TeamOpponentScorePad2" + playerId,
    "FriendlyScorePulse" + playerId,
    "EnemyScorePulse" + playerId,
    "FriendlyTicketsFill" + playerId,
    "EnemyTicketsFill" + playerId,
    "FLAGA" + playerId,
    "FLAGB" + playerId,
    "FLAGC" + playerId,
    "FLAGA_FILL" + playerId,
    "FLAGB_FILL" + playerId,
    "FLAGC_FILL" + playerId,
    "FLAGA_OL_T" + playerId,
    "FLAGA_OL_B" + playerId,
    "FLAGA_OL_L" + playerId,
    "FLAGA_OL_R" + playerId,
    "FLAGB_OL_T" + playerId,
    "FLAGB_OL_B" + playerId,
    "FLAGB_OL_L" + playerId,
    "FLAGB_OL_R" + playerId,
    "FLAGC_OL_T" + playerId,
    "FLAGC_OL_B" + playerId,
    "FLAGC_OL_L" + playerId,
    "FLAGC_OL_R" + playerId,
    "ActiveFlagContainer" + playerId,
    "ActiveFlag" + playerId,
    "FriendlyCap" + playerId,
    "EnemyCap" + playerId,
    "CapProgress" + playerId,
  ];

  for (let i = 0; i < widgetNames.length; i++) {
    safeDeleteWidgetByName(widgetNames[i]);
  }
}

function rebuildPlayerLiveHud(p: Player): void {
  deleteLegacyLiveHudWidgetsForPlayer(p.id);
  if (ensureLiveHudSlotForPlayer(p)) {
    setLiveHudVisibleForPlayer(p, true);
  }
}

function getLiveUiTeamKey(team: mod.Team): LiveUiTeamKey | null {
  if (mod.Equals(team, team1)) return "T1";
  if (mod.Equals(team, team2)) return "T2";
  return null;
}

function getLiveUiSlotOwners(teamKey: LiveUiTeamKey): Array<number | undefined> {
  return teamKey === "T1" ? playerIdByLiveUiSlotTeam1 : playerIdByLiveUiSlotTeam2;
}

function getLiveUiSlotKey(teamKey: LiveUiTeamKey, slotIndex: number): string {
  return teamKey + "_" + (slotIndex < 10 ? "0" + slotIndex : String(slotIndex));
}

function isReservedLiveHudSlot(teamKey: LiveUiTeamKey, slotIndex: number): boolean {
  return teamKey === SPECTATOR_LIVE_UI_TEAM_KEY && slotIndex === SPECTATOR_LIVE_UI_SLOT_INDEX;
}

function getReservedLiveHudSlotAssignment(): LiveUiSlotAssignment {
  return {
    teamKey: SPECTATOR_LIVE_UI_TEAM_KEY,
    slotIndex: SPECTATOR_LIVE_UI_SLOT_INDEX,
    slotKey: SPECTATOR_LIVE_UI_SLOT_KEY,
  };
}
function getLiveHudWidgetName(slotKey: string, widgetBaseName: string): string {
  return widgetBaseName + "_" + slotKey;
}

function findLiveHudWidget(slotKey: string, widgetBaseName: string): mod.UIWidget | undefined {
  return safeFindWidgetByNameNoThrow(
    getLiveHudWidgetName(slotKey, widgetBaseName),
    "livehud/" + slotKey + "/" + widgetBaseName
  );
}

function collectLiveHudFlagOutlineWidgets(slotKey: string, symbol: LiveUiFlagSymbol): mod.UIWidget[] {
  const widgets: mod.UIWidget[] = [];
  const suffixes = ["T", "B", "L", "R"];

  for (let i = 0; i < suffixes.length; i++) {
    const widget = findLiveHudWidget(slotKey, "FLAG" + symbol + "_OL_" + suffixes[i]);
    if (widget) widgets.push(widget);
  }

  return widgets;
}

function getLiveHudContainerWidget(): mod.UIWidget | undefined {
  return safeFindWidgetByNameNoThrow("LiveContainer", "livehud/container");
}

function getSharedLiveHudWidget(name: string): mod.UIWidget | undefined {
  return safeFindWidgetByNameNoThrow(name, "livehud/shared/" + name);
}

const LIVE_HUD_SLOT_VISIBLE_WIDGET_BASE_NAMES: string[] = [
  "LiveHudSlotAnchor",
  "TeamFriendlyScore",
  "TeamFriendlyScorePad1",
  "TeamFriendlyScorePad2",
  "TeamOpponentScore",
  "TeamOpponentScorePad1",
  "TeamOpponentScorePad2",
  "FriendlyScorePulse",
  "EnemyScorePulse",
  "FriendlyProgressPulse",
  "EnemyProgressPulse",
  "FriendlyTicketsFill",
  "EnemyTicketsFill",
  "FLAGA",
  "FLAGB",
  "FLAGC",
  "FLAGA_FILL",
  "FLAGB_FILL",
  "FLAGC_FILL",
  "FLAGA_OL_T",
  "FLAGA_OL_B",
  "FLAGA_OL_L",
  "FLAGA_OL_R",
  "FLAGB_OL_T",
  "FLAGB_OL_B",
  "FLAGB_OL_L",
  "FLAGB_OL_R",
  "FLAGC_OL_T",
  "FLAGC_OL_B",
  "FLAGC_OL_L",
  "FLAGC_OL_R",
  "ActiveFlagContainer",
  "ActiveFlag",
  "FriendlyCap",
  "EnemyCap",
  "CapProgress",
];

const LIVE_HUD_SLOT_DELETE_WIDGET_BASE_NAMES: string[] = [
  "LiveHudSlotAnchor",
  "LiveHudRoot",
  "LiveHudTimeBox",
  "RemainingTime",
  "LiveHudFriendlyScoreBox",
  "LiveHudEnemyScoreBox",
  "LiveHudFriendlyProgressBar",
  "LiveHudEnemyProgressBar",
  "FlagContainerA",
  "FlagContainerB",
  "FlagContainerC",
  ...LIVE_HUD_SLOT_VISIBLE_WIDGET_BASE_NAMES,
];

function deleteLiveHudWidgetsForSlot(slotKey: string): void {
  for (let i = 0; i < LIVE_HUD_SLOT_DELETE_WIDGET_BASE_NAMES.length; i++) {
    safeDeleteWidgetByName(getLiveHudWidgetName(slotKey, LIVE_HUD_SLOT_DELETE_WIDGET_BASE_NAMES[i]));
  }
}

function resetLiveUiSlotOwnerArrays(): void {
  for (let i = 0; i < LIVE_UI_SLOTS_PER_TEAM; i++) {
    playerIdByLiveUiSlotTeam1[i] = undefined;
    playerIdByLiveUiSlotTeam2[i] = undefined;
  }
}

function resetLiveUiDiagnostics(): void {
  lastActiveTimerCount = Timers.getActiveTimerCount();
  liveUiAssignedSlotCount = 0;
  liveUiFailedAssignmentCount = 0;
  liveUiSlotExhaustedWarnedByTeamKey = {};
}

function clearLiveHudPrebuildQueue(): void {
  liveHudPrebuildQueue = [];
  liveHudPrebuildQueuedByPlayerId = {};
}

function dequeueLiveHudPrebuildForPlayer(playerId: number): void {
  delete liveHudPrebuildQueuedByPlayerId[playerId];
}

function queueLiveHudPrebuildForPlayer(player: Player | undefined): void {
  if (!player) return;
  if (gameStatus === 3) return;
  if (!mod.IsPlayerValid(player.player) || !isParticipantPlayer(player.player)) {
    dequeueLiveHudPrebuildForPlayer(player.id);
    return;
  }
  if (liveHudPrebuildQueuedByPlayerId[player.id] === true) return;

  liveHudPrebuildQueuedByPlayerId[player.id] = true;
  liveHudPrebuildQueue.push(player.id);
}

function queueLiveHudPrebuildForAllParticipants(): void {
  serverPlayers.forEach((p) => queueLiveHudPrebuildForPlayer(p));
}

function drainLiveHudPrebuildQueue(maxPlayers: number, allowHiddenBuild: boolean): void {
  let builtCount = 0;

  while (liveHudPrebuildQueue.length > 0 && builtCount < maxPlayers) {
    const playerId = liveHudPrebuildQueue.shift();
    if (playerId === undefined) continue;
    if (liveHudPrebuildQueuedByPlayerId[playerId] !== true) continue;

    delete liveHudPrebuildQueuedByPlayerId[playerId];

    const player = serverPlayers.get(playerId);
    if (!player) continue;

    if (!mod.IsPlayerValid(player.player) || !isParticipantPlayer(player.player)) {
      releaseLiveHudSlotForPlayer(playerId);
      continue;
    }

    if (!ensureLiveHudSlotForPlayer(player, allowHiddenBuild)) {
      queueLiveHudPrebuildForPlayer(player);
      break;
    }

    setLiveHudVisibleForPlayer(player, false);
    builtCount += 1;
  }
}

function warnLiveHudSlotExhaustedOnce(teamKey: LiveUiTeamKey): void {
  if (liveUiSlotExhaustedWarnedByTeamKey[teamKey] === true) return;
  liveUiSlotExhaustedWarnedByTeamKey[teamKey] = true;

  mod.DisplayHighlightedWorldLogMessage(
    mod.Message("[LIVE HUD] No free {} slot available for HUD assignment", teamKey)
  );
}

function bindPlayerLiveHudWidgetsForSlot(p: Player, assignment: LiveUiSlotAssignment): void {
  const slotKey = assignment.slotKey;

  p.liveHudSlotTeamKey = assignment.teamKey;
  p.liveHudSlotIndex = assignment.slotIndex;
  p.liveHudSlotKey = slotKey;

  p.liveHudRootWidget = findLiveHudWidget(slotKey, "LiveHudSlotAnchor") as any;
  p.remainingTimeWidget = null as any;

  p.friendlyScoreWidget = findLiveHudWidget(slotKey, "TeamFriendlyScore") as any;
  p.opponentScoreWidget = findLiveHudWidget(slotKey, "TeamOpponentScore") as any;
  p.friendlyScorePad1Widget = findLiveHudWidget(slotKey, "TeamFriendlyScorePad1") as any;
  p.friendlyScorePad2Widget = findLiveHudWidget(slotKey, "TeamFriendlyScorePad2") as any;
  p.opponentScorePad1Widget = findLiveHudWidget(slotKey, "TeamOpponentScorePad1") as any;
  p.opponentScorePad2Widget = findLiveHudWidget(slotKey, "TeamOpponentScorePad2") as any;

  p.friendlyTicketsFillWidget = findLiveHudWidget(slotKey, "FriendlyTicketsFill") as any;
  p.enemyTicketsFillWidget = findLiveHudWidget(slotKey, "EnemyTicketsFill") as any;
  p.friendlyScorePulseWidget = findLiveHudWidget(slotKey, "FriendlyScorePulse") as any;
  p.enemyScorePulseWidget = findLiveHudWidget(slotKey, "EnemyScorePulse") as any;
  p.friendlyProgressPulseWidget = findLiveHudWidget(slotKey, "FriendlyProgressPulse") as any;
  p.enemyProgressPulseWidget = findLiveHudWidget(slotKey, "EnemyProgressPulse") as any;

  p.flagContainerWidget = {
    A: getSharedLiveHudWidget("FlagContainerA") as any,
    B: getSharedLiveHudWidget("FlagContainerB") as any,
    C: getSharedLiveHudWidget("FlagContainerC") as any,
  };

  p.flagWidget = {
    A: findLiveHudWidget(slotKey, "FLAGA") as any,
    B: findLiveHudWidget(slotKey, "FLAGB") as any,
    C: findLiveHudWidget(slotKey, "FLAGC") as any,
  };

  p.flagFillWidget = {
    A: findLiveHudWidget(slotKey, "FLAGA_FILL") as any,
    B: findLiveHudWidget(slotKey, "FLAGB_FILL") as any,
    C: findLiveHudWidget(slotKey, "FLAGC_FILL") as any,
  };

  p.flagOutlineWidget = {
    A: collectLiveHudFlagOutlineWidgets(slotKey, "A"),
    B: collectLiveHudFlagOutlineWidgets(slotKey, "B"),
    C: collectLiveHudFlagOutlineWidgets(slotKey, "C"),
  };

  p.activeFlagContainerWidget = findLiveHudWidget(slotKey, "ActiveFlagContainer") as any;
  p.activeFlagWidget = findLiveHudWidget(slotKey, "ActiveFlag") as any;
  p.activeFlagFriendlyWidget = findLiveHudWidget(slotKey, "FriendlyCap") as any;
  p.activeFlagEnemyWidget = findLiveHudWidget(slotKey, "EnemyCap") as any;
  p.friendlyCapWidget = p.activeFlagFriendlyWidget;
  p.enemyCapWidget = p.activeFlagEnemyWidget;
  p.progressBarWidget = findLiveHudWidget(slotKey, "CapProgress") as any;
}

function allocateLiveHudSlotForPlayer(p: Player): LiveUiSlotAssignment | undefined {
  const teamKey = getLiveUiTeamKey(mod.GetTeam(p.player));
  if (!teamKey) return undefined;

  const owners = getLiveUiSlotOwners(teamKey);
  for (let i = 0; i < LIVE_UI_SLOTS_PER_TEAM; i++) {
    if (isReservedLiveHudSlot(teamKey, i)) continue;
    if (owners[i] !== undefined) continue;

    owners[i] = p.id;

    const assignment: LiveUiSlotAssignment = {
      teamKey,
      slotIndex: i,
      slotKey: getLiveUiSlotKey(teamKey, i),
    };

    liveUiSlotByPlayerId[p.id] = assignment;
    liveUiAssignedSlotCount += 1;
    bindPlayerLiveHudWidgetsForSlot(p, assignment);
    return assignment;
  }

  liveUiFailedAssignmentCount += 1;
  warnLiveHudSlotExhaustedOnce(teamKey);
  return undefined;
}

function releaseLiveHudSlotForPlayer(playerId: number): void {
  dequeueLiveHudPrebuildForPlayer(playerId);

  const assignment = liveUiSlotByPlayerId[playerId];
  if (assignment) {
    const owners = getLiveUiSlotOwners(assignment.teamKey);
    if (owners[assignment.slotIndex] === playerId) {
      owners[assignment.slotIndex] = undefined;
    }

    deleteLiveHudWidgetsForSlot(assignment.slotKey);
    delete liveUiSlotByPlayerId[playerId];
    if (liveUiAssignedSlotCount > 0) liveUiAssignedSlotCount -= 1;
  }

  deleteLegacyLiveHudWidgetsForPlayer(playerId);

  const connectedPlayer = serverPlayers.get(playerId);
  if (connectedPlayer) connectedPlayer.clearLiveHudRefs();

  for (let i = 0; i < disconnectedPlayers.length; i++) {
    if (disconnectedPlayers[i].id !== playerId) continue;
    disconnectedPlayers[i].clearLiveHudRefs();
    break;
  }
}

function setLiveHudVisibleForPlayer(p: Player, visible: boolean): void {
  if (!p.liveHudSlotKey) return;

  const slotKey = p.liveHudSlotKey;
  const playerTeam = mod.GetTeam(p.player);
  const friendly = getFriendlyScore(playerTeam);
  const enemy = getOpponentScore(playerTeam);
  const activeFlagVisible = visible && p.getCapturePoint() !== null;

  for (let i = 0; i < LIVE_HUD_SLOT_VISIBLE_WIDGET_BASE_NAMES.length; i++) {
    const baseName = LIVE_HUD_SLOT_VISIBLE_WIDGET_BASE_NAMES[i];
    const widget = findLiveHudWidget(slotKey, baseName);
    if (!widget) continue;

    let widgetVisible = visible;
    if (baseName === "TeamFriendlyScorePad1") widgetVisible = visible && friendly < 100;
    else if (baseName === "TeamFriendlyScorePad2") widgetVisible = visible && friendly < 10;
    else if (baseName === "TeamOpponentScorePad1") widgetVisible = visible && enemy < 100;
    else if (baseName === "TeamOpponentScorePad2") widgetVisible = visible && enemy < 10;
    else if (baseName === "ActiveFlagContainer") widgetVisible = activeFlagVisible;

    SafeSetWidgetVisibleHandle(widget, widgetVisible);
  }
}

function setLiveHudVisibleForAllPlayers(visible: boolean): void {
  serverPlayers.forEach((p) => setLiveHudVisibleForPlayer(p, visible));
}

function resetAllLiveHudState(): void {
  stopLiveHudTopFlagBlinkTimer(false);
  stopLiveHudPulseTimer(false);
  liveHudTopFlagsDirty = true;
  liveHudTopFlagDirtyBySymbol = { A: true, B: true, C: true };
  liveHudTopFlagBlinkNeutralPhase = false;

  const teamKeys: LiveUiTeamKey[] = ["T1", "T2"];
  for (let teamIndex = 0; teamIndex < teamKeys.length; teamIndex++) {
    const teamKey = teamKeys[teamIndex];
    for (let slotIndex = 0; slotIndex < LIVE_UI_SLOTS_PER_TEAM; slotIndex++) {
      deleteLiveHudWidgetsForSlot(getLiveUiSlotKey(teamKey, slotIndex));
    }
  }

  const clearPlayerHud = (player: Player): void => {
    deleteLegacyLiveHudWidgetsForPlayer(player.id);
    player.clearLiveHudRefs();
  };

  serverPlayers.forEach((p) => clearPlayerHud(p));
  for (let i = 0; i < disconnectedPlayers.length; i++) {
    clearPlayerHud(disconnectedPlayers[i]);
  }

  liveUiSlotByPlayerId = {};
  resetLiveUiSlotOwnerArrays();
  resetLiveUiDiagnostics();
  clearLiveHudPrebuildQueue();
}

function buildLiveHudWidgetsForPlayer(p: Player, assignment: LiveUiSlotAssignment): void {
  const slotKey = assignment.slotKey;
  const slotName = (widgetBaseName: string): string => getLiveHudWidgetName(slotKey, widgetBaseName);
  const liveContainer = getLiveHudContainerWidget();
  const friendlyScoreParent = getSharedLiveHudWidget("friendlyscore");
  const enemyScoreParent = getSharedLiveHudWidget("enemyscore");
  const friendlyProgressBarParent = getSharedLiveHudWidget("friendlyprogressbar");
  const enemyProgressBarParent = getSharedLiveHudWidget("enemyprogressbar");
  const flagContainerA = getSharedLiveHudWidget("FlagContainerA");
  const flagContainerB = getSharedLiveHudWidget("FlagContainerB");
  const flagContainerC = getSharedLiveHudWidget("FlagContainerC");

  if (
    !liveContainer ||
    !friendlyScoreParent ||
    !enemyScoreParent ||
    !friendlyProgressBarParent ||
    !enemyProgressBarParent ||
    !flagContainerA ||
    !flagContainerB ||
    !flagContainerC
  ) {
    return;
  }

  deleteLiveHudWidgetsForSlot(slotKey);

  mod.AddUIContainer(
    slotName("LiveHudSlotAnchor"),
    mod.CreateVector(0, 0, 0),
    mod.CreateVector(1, 1, 0),
    mod.UIAnchor.TopLeft,
    liveContainer,
    true,
    0,
    mod.CreateVector(0, 0, 0),
    0,
    mod.UIBgFill.None,
    p.player
  );

  mod.AddUIText(
    slotName("TeamFriendlyScore"),
    mod.CreateVector(0, 0, 0),
    mod.CreateVector(150, 34, 0),
    mod.UIAnchor.TopCenter,
    friendlyScoreParent,
    true,
    0,
    mod.CreateVector(0, 0, 0),
    0,
    mod.UIBgFill.None,
    mod.Message(getFriendlyScore(mod.GetTeam(p.player))),
    24,
    COLOR_FRIENDLY,
    1,
    mod.UIAnchor.Center,
    p.player
  );

  mod.AddUIText(
    slotName("TeamFriendlyScorePad1"),
    mod.CreateVector(-18, 0, 0),
    mod.CreateVector(30, 34, 0),
    mod.UIAnchor.TopCenter,
    friendlyScoreParent,
    true,
    0,
    mod.CreateVector(0, 0, 0),
    0,
    mod.UIBgFill.None,
    mod.Message(0),
    24,
    COLOR_FRIENDLY,
    1,
    mod.UIAnchor.Center,
    p.player
  );

  mod.AddUIText(
    slotName("TeamFriendlyScorePad2"),
    mod.CreateVector(-34, 0, 0),
    mod.CreateVector(30, 34, 0),
    mod.UIAnchor.TopCenter,
    friendlyScoreParent,
    true,
    0,
    mod.CreateVector(0, 0, 0),
    0,
    mod.UIBgFill.None,
    mod.Message(0),
    24,
    COLOR_FRIENDLY,
    1,
    mod.UIAnchor.Center,
    p.player
  );

  mod.AddUIText(
    slotName("TeamOpponentScore"),
    mod.CreateVector(0, 0, 0),
    mod.CreateVector(150, 34, 0),
    mod.UIAnchor.TopCenter,
    enemyScoreParent,
    true,
    0,
    mod.CreateVector(0, 0, 0),
    0,
    mod.UIBgFill.None,
    mod.Message(getOpponentScore(mod.GetTeam(p.player))),
    24,
    COLOR_ENEMY,
    1,
    mod.UIAnchor.Center,
    p.player
  );

  mod.AddUIText(
    slotName("TeamOpponentScorePad1"),
    mod.CreateVector(-18, 0, 0),
    mod.CreateVector(30, 34, 0),
    mod.UIAnchor.TopCenter,
    enemyScoreParent,
    true,
    0,
    mod.CreateVector(0, 0, 0),
    0,
    mod.UIBgFill.None,
    mod.Message(0),
    24,
    COLOR_ENEMY,
    1,
    mod.UIAnchor.Center,
    p.player
  );

  mod.AddUIText(
    slotName("TeamOpponentScorePad2"),
    mod.CreateVector(-34, 0, 0),
    mod.CreateVector(30, 34, 0),
    mod.UIAnchor.TopCenter,
    enemyScoreParent,
    true,
    0,
    mod.CreateVector(0, 0, 0),
    0,
    mod.UIBgFill.None,
    mod.Message(0),
    24,
    COLOR_ENEMY,
    1,
    mod.UIAnchor.Center,
    p.player
  );

  mod.AddUIContainer(
    slotName("FriendlyScorePulse"),
    mod.CreateVector(0, 0, 0),
    mod.CreateVector(120, 34, 0),
    mod.UIAnchor.TopLeft,
    friendlyScoreParent,
    true,
    0,
    mod.CreateVector(0.2314, 0.4196, 0.6745),
    0,
    mod.UIBgFill.GradientLeft,
    p.player
  );

  mod.AddUIContainer(
    slotName("EnemyScorePulse"),
    mod.CreateVector(0, 0, 0),
    mod.CreateVector(120, 34, 0),
    mod.UIAnchor.TopLeft,
    enemyScoreParent,
    true,
    0,
    mod.CreateVector(0.698, 0.1882, 0.1882),
    0,
    mod.UIBgFill.GradientRight,
    p.player
  );

  mod.AddUIContainer(
    slotName("FriendlyTicketsFill"),
    mod.CreateVector(0, 1, 0),
    mod.CreateVector(210, 4, 0),
    mod.UIAnchor.TopLeft,
    friendlyProgressBarParent,
    true,
    0,
    mod.CreateVector(0.2314, 0.4196, 0.6745),
    1,
    mod.UIBgFill.GradientRight,
    p.player
  );

  mod.AddUIContainer(
    slotName("EnemyTicketsFill"),
    mod.CreateVector(0, 1, 0),
    mod.CreateVector(210, 4, 0),
    mod.UIAnchor.TopLeft,
    enemyProgressBarParent,
    true,
    0,
    mod.CreateVector(0.698, 0.1882, 0.1882),
    1,
    mod.UIBgFill.GradientLeft,
    p.player
  );

  mod.AddUIContainer(
    slotName("FriendlyProgressPulse"),
    mod.CreateVector(0, 0, 0),
    mod.CreateVector(210, 6, 0),
    mod.UIAnchor.TopLeft,
    friendlyProgressBarParent,
    true,
    0,
    mod.CreateVector(0.2314, 0.4196, 0.6745),
    0,
    mod.UIBgFill.GradientLeft,
    p.player
  );

  mod.AddUIContainer(
    slotName("EnemyProgressPulse"),
    mod.CreateVector(0, 0, 0),
    mod.CreateVector(210, 6, 0),
    mod.UIAnchor.TopLeft,
    enemyProgressBarParent,
    true,
    0,
    mod.CreateVector(0.698, 0.1882, 0.1882),
    0,
    mod.UIBgFill.GradientRight,
    p.player
  );

  mod.AddUIText(
    slotName("FLAGA"),
    mod.CreateVector(0, 0, 0),
    mod.CreateVector(30, 30, 0),
    mod.UIAnchor.Center,
    flagContainerA,
    true,
    0,
    mod.CreateVector(0, 0, 0),
    0.4,
    mod.UIBgFill.Blur,
    mod.Message("A"),
    18,
    serverCapturePoints[CP_A_ID].getColor(mod.GetTeam(p.player)),
    1,
    mod.UIAnchor.Center,
    p.player
  );

  mod.AddUIText(
    slotName("FLAGB"),
    mod.CreateVector(0, 0, 0),
    mod.CreateVector(30, 30, 0),
    mod.UIAnchor.Center,
    flagContainerB,
    true,
    0,
    mod.CreateVector(0, 0, 0),
    0.4,
    mod.UIBgFill.Blur,
    mod.Message("B"),
    18,
    serverCapturePoints[CP_B_ID].getColor(mod.GetTeam(p.player)),
    1,
    mod.UIAnchor.Center,
    p.player
  );

  mod.AddUIText(
    slotName("FLAGC"),
    mod.CreateVector(0, 0, 0),
    mod.CreateVector(30, 30, 0),
    mod.UIAnchor.Center,
    flagContainerC,
    true,
    0,
    mod.CreateVector(0, 0, 0),
    0.4,
    mod.UIBgFill.Blur,
    mod.Message("C"),
    18,
    serverCapturePoints[CP_C_ID].getColor(mod.GetTeam(p.player)),
    1,
    mod.UIAnchor.Center,
    p.player
  );

  const outlineThickness = 1;
  const flagBoxSize = 30;
  const flagFillAlpha = 0.5;

  const addFlagOutline = (
    symbol: LiveUiFlagSymbol,
    parentWidget: mod.UIWidget,
    color: mod.Vector
  ): void => {
    const half = flagBoxSize / 2;
    const tHalf = outlineThickness / 2;

    mod.AddUIContainer(
      slotName("FLAG" + symbol + "_OL_T"),
      mod.CreateVector(0, -half + tHalf, 0),
      mod.CreateVector(flagBoxSize, outlineThickness, 0),
      mod.UIAnchor.Center,
      parentWidget,
      true,
      0,
      color,
      1,
      mod.UIBgFill.Solid,
      p.player
    );
    mod.AddUIContainer(
      slotName("FLAG" + symbol + "_OL_B"),
      mod.CreateVector(0, half - tHalf, 0),
      mod.CreateVector(flagBoxSize, outlineThickness, 0),
      mod.UIAnchor.Center,
      parentWidget,
      true,
      0,
      color,
      1,
      mod.UIBgFill.Solid,
      p.player
    );
    mod.AddUIContainer(
      slotName("FLAG" + symbol + "_OL_L"),
      mod.CreateVector(-half + tHalf, 0, 0),
      mod.CreateVector(outlineThickness, flagBoxSize, 0),
      mod.UIAnchor.Center,
      parentWidget,
      true,
      0,
      color,
      1,
      mod.UIBgFill.Solid,
      p.player
    );
    mod.AddUIContainer(
      slotName("FLAG" + symbol + "_OL_R"),
      mod.CreateVector(half - tHalf, 0, 0),
      mod.CreateVector(outlineThickness, flagBoxSize, 0),
      mod.UIAnchor.Center,
      parentWidget,
      true,
      0,
      color,
      1,
      mod.UIBgFill.Solid,
      p.player
    );
  };

  const addFlagFill = (
    symbol: LiveUiFlagSymbol,
    parentWidget: mod.UIWidget,
    color: mod.Vector
  ): void => {
    mod.AddUIContainer(
      slotName("FLAG" + symbol + "_FILL"),
      mod.CreateVector(0, 0, 0),
      mod.CreateVector(flagBoxSize, flagBoxSize, 0),
      mod.UIAnchor.Center,
      parentWidget,
      true,
      0,
      color,
      flagFillAlpha,
      mod.UIBgFill.Blur,
      p.player
    );
  };

  addFlagFill("A", flagContainerA, serverCapturePoints[CP_A_ID].getColor(mod.GetTeam(p.player)));
  addFlagFill("B", flagContainerB, serverCapturePoints[CP_B_ID].getColor(mod.GetTeam(p.player)));
  addFlagFill("C", flagContainerC, serverCapturePoints[CP_C_ID].getColor(mod.GetTeam(p.player)));

  addFlagOutline("A", flagContainerA, serverCapturePoints[CP_A_ID].getColor(mod.GetTeam(p.player)));
  addFlagOutline("B", flagContainerB, serverCapturePoints[CP_B_ID].getColor(mod.GetTeam(p.player)));
  addFlagOutline("C", flagContainerC, serverCapturePoints[CP_C_ID].getColor(mod.GetTeam(p.player)));

  mod.AddUIContainer(
    slotName("ActiveFlagContainer"),
    mod.CreateVector(0, 120, 0),
    mod.CreateVector(180, 80, 0),
    mod.UIAnchor.TopCenter,
    liveContainer,
    false,
    0,
    mod.CreateVector(0.0314, 0.0431, 0.0431),
    0.4,
    mod.UIBgFill.None,
    p.player
  );

  const activeFlagParent = findLiveHudWidget(slotKey, "ActiveFlagContainer");
  if (!activeFlagParent) return;

  mod.AddUIText(
    slotName("ActiveFlag"),
    mod.CreateVector(0, 0, 0),
    mod.CreateVector(60, 60, 0),
    mod.UIAnchor.Center,
    activeFlagParent,
    true,
    0,
    mod.CreateVector(0, 0, 0),
    0.4,
    mod.UIBgFill.Blur,
    mod.Message(0),
    34,
    COLOR_NEUTRAL,
    1,
    mod.UIAnchor.Center,
    p.player
  );

  mod.AddUIText(
    slotName("FriendlyCap"),
    mod.CreateVector(-80, 0, 0),
    mod.CreateVector(40, 40, 0),
    mod.UIAnchor.Center,
    activeFlagParent,
    true,
    0,
    mod.CreateVector(0, 0, 0),
    0.2,
    mod.UIBgFill.Blur,
    mod.Message(0),
    20,
    COLOR_FRIENDLY,
    1,
    mod.UIAnchor.Center,
    p.player
  );

  mod.AddUIText(
    slotName("EnemyCap"),
    mod.CreateVector(80, 0, 0),
    mod.CreateVector(40, 40, 0),
    mod.UIAnchor.Center,
    activeFlagParent,
    true,
    0,
    mod.CreateVector(0, 0, 0),
    0.2,
    mod.UIBgFill.Blur,
    mod.Message(0),
    20,
    COLOR_ENEMY,
    1,
    mod.UIAnchor.Center,
    p.player
  );

  mod.AddUIContainer(
    slotName("CapProgress"),
    mod.CreateVector(60, 0, 0),
    mod.CreateVector(0, 60, 0),
    mod.UIAnchor.CenterLeft,
    activeFlagParent,
    true,
    0,
    mod.CreateVector(1, 1, 1),
    0.4,
    mod.UIBgFill.Solid,
    p.player
  );

  bindPlayerLiveHudWidgetsForSlot(p, assignment);
  SafeSetWidgetVisibleHandle(p.friendlyScorePad1Widget, false);
  SafeSetWidgetVisibleHandle(p.friendlyScorePad2Widget, false);
  SafeSetWidgetVisibleHandle(p.opponentScorePad1Widget, false);
  SafeSetWidgetVisibleHandle(p.opponentScorePad2Widget, false);
  SafeSetWidgetVisibleHandle(p.activeFlagContainerWidget, false);
}

function ensureReservedLiveHudSlotForPlayer(p: Player): boolean {
  const assignment = getReservedLiveHudSlotAssignment();
  const existingAssignment = liveUiSlotByPlayerId[p.id];

  if (
    existingAssignment &&
    (existingAssignment.teamKey !== assignment.teamKey || existingAssignment.slotIndex !== assignment.slotIndex)
  ) {
    releaseLiveHudSlotForPlayer(p.id);
  }

  const owners = getLiveUiSlotOwners(assignment.teamKey);
  const currentOwner = owners[assignment.slotIndex];

  if (currentOwner !== undefined && currentOwner !== p.id) {
    releaseLiveHudSlotForPlayer(currentOwner);
  }

  if (liveUiSlotByPlayerId[p.id] === undefined) {
    liveUiAssignedSlotCount += 1;
  }

  owners[assignment.slotIndex] = p.id;
  liveUiSlotByPlayerId[p.id] = assignment;

  if (!p.liveHudRootWidget || p.liveHudSlotKey !== assignment.slotKey) {
    buildLiveHudWidgetsForPlayer(p, assignment);
  } else {
    bindPlayerLiveHudWidgetsForSlot(p, assignment);
  }

  if (!p.liveHudRootWidget) {
    releaseLiveHudSlotForPlayer(p.id);
    return false;
  }

  return true;
}

function ensureLiveHudSlotForPlayer(p: Player, allowHiddenBuild: boolean = false): boolean {
  const liveVisibleReady = gameStatus === 3;
  const hiddenPrebuildReady =
    allowHiddenBuild &&
    gameStatus >= 0 &&
    gameStatus <= 2 &&
    initialization[0];

  if (!liveVisibleReady && !hiddenPrebuildReady) return false;

  const excludedPlayer = isExcludedPlayer(p.player);
  const participant = isParticipantPlayer(p.player);

  if (!participant && !excludedPlayer) {
    releaseLiveHudSlotForPlayer(p.id);
    return false;
  }

  if (excludedPlayer) {
    if (!liveVisibleReady) return false;
    return ensureReservedLiveHudSlotForPlayer(p);
  }

  const currentTeamKey = getLiveUiTeamKey(mod.GetTeam(p.player));
  if (!currentTeamKey) {
    releaseLiveHudSlotForPlayer(p.id);
    return false;
  }

  const existingAssignment = liveUiSlotByPlayerId[p.id];
  if (existingAssignment && existingAssignment.teamKey !== currentTeamKey) {
    releaseLiveHudSlotForPlayer(p.id);
  }

  const assignment = liveUiSlotByPlayerId[p.id] ?? allocateLiveHudSlotForPlayer(p);
  if (!assignment) return false;

  const owners = getLiveUiSlotOwners(assignment.teamKey);
  owners[assignment.slotIndex] = p.id;

  if (!p.liveHudRootWidget) {
    buildLiveHudWidgetsForPlayer(p, assignment);
  } else {
    bindPlayerLiveHudWidgetsForSlot(p, assignment);
  }

  if (!p.liveHudRootWidget) {
    releaseLiveHudSlotForPlayer(p.id);
    return false;
  }

  return true;
}


/* -----------------------------------------------------------------------------------------------
   Live HUD helpers
------------------------------------------------------------------------------------------------ */
const TICKET_PULSE_OVERLAY_MAX_ALPHA = 0.8;
const TICKET_PULSE_FILL_MIN_ALPHA = 0.55;
const PULSE_DURATION_SECONDS = 0.55;
const PULSE_STEP_SECONDS = 0.05;
const TICKET_PULSE_DURATION_TICKS = mod.Max(1, mod.Ceiling(PULSE_DURATION_SECONDS * TICK_RATE));


function clamp01(x: number): number {
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

function getTicketPulseTriangle(playerPulseUntilTick: number): number {
  if (playerPulseUntilTick <= serverTickCount) return 0;

  const elapsedTicks = TICKET_PULSE_DURATION_TICKS - (playerPulseUntilTick - serverTickCount);
  const t = clamp01(elapsedTicks / TICKET_PULSE_DURATION_TICKS);
  return t <= 0.5 ? (t / 0.5) : ((1 - t) / 0.5);
}

function getTicketPulseTextAlpha(playerPulseUntilTick: number): number {
  const triangle = getTicketPulseTriangle(playerPulseUntilTick);
  return TICKET_PULSE_TEXT_MIN_ALPHA + (TICKET_PULSE_TEXT_MAX_ALPHA - TICKET_PULSE_TEXT_MIN_ALPHA) * triangle;
}

function getTicketPulseOverlayAlpha(playerPulseUntilTick: number): number {
  return TICKET_PULSE_OVERLAY_MAX_ALPHA * getTicketPulseTriangle(playerPulseUntilTick);
}

function getTicketPulseFillAlpha(playerPulseUntilTick: number): number {
  const triangle = getTicketPulseTriangle(playerPulseUntilTick);
  return 1 - ((1 - TICKET_PULSE_FILL_MIN_ALPHA) * triangle);
}

function getDisplayedTeamTickets(team: mod.Team): number {
  return mod.Equals(team, team1) ? mod.Ceiling(serverScores[0]) : mod.Ceiling(serverScores[1]);
}

function applyLiveHudPulseStateToPlayer(p: Player, side: "friendly" | "enemy"): void {
  const pulseUntilTick = side === "friendly" ? p.liveHudFriendlyPulseUntilTick : p.liveHudEnemyPulseUntilTick;
  const scoreWidget = side === "friendly" ? p.friendlyScoreWidget : p.opponentScoreWidget;
  const scorePulseWidget = side === "friendly" ? p.friendlyScorePulseWidget : p.enemyScorePulseWidget;
  const progressPulseWidget = side === "friendly" ? p.friendlyProgressPulseWidget : p.enemyProgressPulseWidget;
  const fillWidget = side === "friendly" ? p.friendlyTicketsFillWidget : p.enemyTicketsFillWidget;

  if (pulseUntilTick <= serverTickCount) {
    if (scoreWidget) mod.SetUITextAlpha(scoreWidget, 1);
    if (scorePulseWidget) mod.SetUIWidgetBgAlpha(scorePulseWidget, 0);
    if (progressPulseWidget) mod.SetUIWidgetBgAlpha(progressPulseWidget, 0);
    if (fillWidget) mod.SetUIWidgetBgAlpha(fillWidget, 1);
    return;
  }

  const textAlpha = getTicketPulseTextAlpha(pulseUntilTick);
  const overlayAlpha = getTicketPulseOverlayAlpha(pulseUntilTick);
  const fillAlpha = getTicketPulseFillAlpha(pulseUntilTick);

  if (scoreWidget) mod.SetUITextAlpha(scoreWidget, textAlpha);
  if (scorePulseWidget) mod.SetUIWidgetBgAlpha(scorePulseWidget, overlayAlpha);
  if (progressPulseWidget) mod.SetUIWidgetBgAlpha(progressPulseWidget, overlayAlpha);
  if (fillWidget) mod.SetUIWidgetBgAlpha(fillWidget, fillAlpha);
}

function hasAnyActiveLiveHudPulse(): boolean {
  let active = false;
  serverPlayers.forEach((p) => {
    if (active) return;
    if (!p.liveHudRootWidget) return;
    if (p.liveHudFriendlyPulseUntilTick > serverTickCount || p.liveHudEnemyPulseUntilTick > serverTickCount) {
      active = true;
    }
  });
  return active;
}

function stopLiveHudPulseTimer(applyFinalState: boolean = false): void {
  Timers.clearInterval(liveHudPulseIntervalHandle);
  liveHudPulseIntervalHandle = undefined;
  if (applyFinalState) UpdateLiveHudPulses();
}

function ensureLiveHudPulseTimer(): void {
  if (liveHudPulseIntervalHandle !== undefined) return;
  liveHudPulseIntervalHandle = Timers.setInterval(() => {
    if (!hasAnyActiveLiveHudPulse()) {
      stopLiveHudPulseTimer(true);
      return;
    }

    UpdateLiveHudPulses();
  }, PULSE_STEP_SECONDS * 1000);
}

function UpdateLiveHudPulses(): void {
  serverPlayers.forEach((p) => {
    if (!p.liveHudRootWidget) return;
    applyLiveHudPulseStateToPlayer(p, "friendly");
    applyLiveHudPulseStateToPlayer(p, "enemy");
  });
}

function getLiveHudPerspectiveTeamForPlayer(p: Player): mod.Team {
  return isExcludedPlayer(p.player) ? team1 : mod.GetTeam(p.player);
}

function isCapturePointBeingNeutralizedForHud(cp: CapturePoint): boolean {
  return getCapturePointPhase(cp) === "neutralizing_enemy";
}

function shouldShowNeutralizedFlagLaneNeutralPhase(): boolean {
  return liveHudTopFlagBlinkNeutralPhase;
}

function getLiveHudTopFlagLaneColorForTeam(cp: CapturePoint, perspectiveTeam: mod.Team): mod.Vector {
  const baseColor = cp.getColor(perspectiveTeam);
  if (!isCapturePointBeingNeutralizedForHud(cp)) return baseColor;
  return shouldShowNeutralizedFlagLaneNeutralPhase() ? COLOR_NEUTRAL : baseColor;
}

function getCapturePointProgressFillColorForTeam(cp: CapturePoint, perspectiveTeam: mod.Team): mod.Vector {
  const phase = getCapturePointPhase(cp);
  const progressTeam = cp.getProgressTeam();

  if (phase === "neutral_idle") {
    return COLOR_NEUTRAL;
  }

  if (phase === "owned_idle") {
    return mod.Equals(cp.getOwner(), perspectiveTeam) ? COLOR_FRIENDLY : COLOR_ENEMY;
  }

  if (phase === "contested") {
    if (!mod.Equals(progressTeam, teamNeutral)) {
      return mod.Equals(progressTeam, perspectiveTeam) ? COLOR_FRIENDLY : COLOR_ENEMY;
    }
    if (mod.Equals(cp.getOwner(), perspectiveTeam)) return COLOR_FRIENDLY;
    if (mod.Equals(cp.getOwner(), teamNeutral)) return COLOR_NEUTRAL;
    return COLOR_ENEMY;
  }

  return mod.Equals(progressTeam, perspectiveTeam) ? COLOR_FRIENDLY : COLOR_ENEMY;
}

function getLiveHudNeutralizingFlagSymbols(): LiveUiFlagSymbol[] {
  const symbols: LiveUiFlagSymbol[] = [];

  for (let i = 0; i < LIVE_HUD_FLAG_SYMBOLS.length; i++) {
    const symbol = LIVE_HUD_FLAG_SYMBOLS[i];
    const cp = getCapturePointBySymbol(symbol);
    if (!cp || !isCapturePointBeingNeutralizedForHud(cp)) continue;
    symbols.push(symbol);
  }

  return symbols;
}

function stopLiveHudTopFlagBlinkTimer(resetToNormalColor: boolean = false): void {
  Timers.clearInterval(liveHudTopFlagBlinkIntervalHandle);
  liveHudTopFlagBlinkIntervalHandle = undefined;

  if (liveHudTopFlagBlinkNeutralPhase) {
    liveHudTopFlagBlinkNeutralPhase = false;
    if (resetToNormalColor) {
      markLiveHudTopFlagsDirtyAll();
    }
  }
}

function ensureLiveHudTopFlagBlinkTimer(): void {
  const activeSymbols = getLiveHudNeutralizingFlagSymbols();
  if (activeSymbols.length <= 0) {
    stopLiveHudTopFlagBlinkTimer(true);
    return;
  }

  if (liveHudTopFlagBlinkIntervalHandle === undefined) {
    liveHudTopFlagBlinkNeutralPhase = true;
    for (let i = 0; i < activeSymbols.length; i++) {
      markLiveHudTopFlagLaneDirty(activeSymbols[i]);
    }

    liveHudTopFlagBlinkIntervalHandle = Timers.setInterval(() => {
      const blinkingSymbols = getLiveHudNeutralizingFlagSymbols();
      if (blinkingSymbols.length <= 0) {
        stopLiveHudTopFlagBlinkTimer(true);
        return;
      }

      liveHudTopFlagBlinkNeutralPhase = !liveHudTopFlagBlinkNeutralPhase;
      for (let i = 0; i < blinkingSymbols.length; i++) {
        markLiveHudTopFlagLaneDirty(blinkingSymbols[i]);
      }
    }, 1000);
  }
}

function syncLiveHudTopFlagBlinkTimer(): void {
  const activeSymbols = getLiveHudNeutralizingFlagSymbols();
  if (activeSymbols.length <= 0) {
    stopLiveHudTopFlagBlinkTimer(true);
    return;
  }

  ensureLiveHudTopFlagBlinkTimer();
}

function getDirtyLiveHudTopFlagSymbols(): LiveUiFlagSymbol[] {
  const symbols: LiveUiFlagSymbol[] = [];
  for (let i = 0; i < LIVE_HUD_FLAG_SYMBOLS.length; i++) {
    const symbol = LIVE_HUD_FLAG_SYMBOLS[i];
    if (liveHudTopFlagDirtyBySymbol[symbol] === true) symbols.push(symbol);
  }
  return symbols;
}

function UpdateLiveHudTopFlagLanes(symbols: LiveUiFlagSymbol[] = LIVE_HUD_FLAG_SYMBOLS): void {
  serverPlayers.forEach((p) => {
    if (!p.liveHudRootWidget) return;
    UpdateTopFlagColorsForPlayer(p, symbols);
  });
}

function flushLiveHudTopFlagLanes(): void {
  if (!liveHudTopFlagsDirty) return;

  const dirtySymbols = getDirtyLiveHudTopFlagSymbols();
  if (dirtySymbols.length <= 0) {
    liveHudTopFlagsDirty = false;
    return;
  }

  UpdateLiveHudTopFlagLanes(dirtySymbols);

  for (let i = 0; i < dirtySymbols.length; i++) {
    liveHudTopFlagDirtyBySymbol[dirtySymbols[i]] = false;
  }

  liveHudTopFlagsDirty =
    liveHudTopFlagDirtyBySymbol.A === true ||
    liveHudTopFlagDirtyBySymbol.B === true ||
    liveHudTopFlagDirtyBySymbol.C === true;
}

function SetUITimeForPlayer(p: Player): void {
  const timeWidget = SafeFindWidget("RemainingTime");
  if (!timeWidget) return;

  const remainingTime = mod.Max(0, mod.GetMatchTimeRemaining());
  const minutes = mod.Floor(remainingTime / 60);
  const totalseconds = mod.Floor(remainingTime % 60);
  const seconds = totalseconds % 10;
  const seconds10 = mod.Floor(totalseconds / 10);

  mod.SetUITextLabel(timeWidget, mod.Message("{}:{}{}", minutes, seconds10, seconds));
}

function UpdateLiveHudTimerDiagnostics(): void {
  lastActiveTimerCount = Timers.getActiveTimerCount();
}

function ClampTicketsAndMaybeEndMatch(): void {
  // If something ever becomes NaN or invalid, force it to 0 so the end condition can trigger.
  const t1 = serverScores[0];
  const t2 = serverScores[1];

  const t1Valid = typeof t1 === "number" && Number.isFinite(t1);
  const t2Valid = typeof t2 === "number" && Number.isFinite(t2);

  serverScores[0] = t1Valid ? t1 : 0;
  serverScores[1] = t2Valid ? t2 : 0;

  if (serverScores[0] < 0) serverScores[0] = 0;
  if (serverScores[1] < 0) serverScores[1] = 0;
  syncDisplayedGameModeScores();

  // End immediately when either hits zero.
  if (serverScores[0] <= 0 || serverScores[1] <= 0) {
    gameStatus = 4;
    const live = mod.FindUIWidgetWithName("LiveContainer");
    if (live) mod.SetUIWidgetVisible(live, false);
    setLiveHudVisibleForAllPlayers(false);
  }
}
const TICKET_PULSE_TEXT_MAX_ALPHA = 1.0;
const TICKET_PULSE_TEXT_MIN_ALPHA = 0.55;
function ClearAllTicketBleedPulses(): void {
  stopLiveHudPulseTimer(false);
  serverPlayers.forEach((p) => {
    p.liveHudFriendlyPulseUntilTick = 0;
    p.liveHudEnemyPulseUntilTick = 0;
    applyLiveHudPulseStateToPlayer(p, "friendly");
    applyLiveHudPulseStateToPlayer(p, "enemy");
  });
}


function triggerBleedPulseForLosingTeam(losingTeam: mod.Team): void {
  const pulseUntilTick = serverTickCount + TICKET_PULSE_DURATION_TICKS;
  serverPlayers.forEach((p) => {
    if (!p.liveHudRootWidget) return;

    const playerTeam = mod.GetTeam(p.player);
    if (mod.Equals(playerTeam, losingTeam)) {
      p.liveHudFriendlyPulseUntilTick = pulseUntilTick;
      applyLiveHudPulseStateToPlayer(p, "friendly");
      return;
    }

    if (mod.Equals(playerTeam, team1) || mod.Equals(playerTeam, team2)) {
      p.liveHudEnemyPulseUntilTick = pulseUntilTick;
      applyLiveHudPulseStateToPlayer(p, "enemy");
    }
  });

  ensureLiveHudPulseTimer();
}


function ChangeTickets(): void {
  const now = mod.GetMatchTimeElapsed();
  if (lastTicketBleedTimeElapsed <= 0) lastTicketBleedTimeElapsed = now;

  let dt = now - lastTicketBleedTimeElapsed;
  lastTicketBleedTimeElapsed = now;

  // Guard against weird resets
  if (dt < 0) dt = 0;
  if (dt > 1) dt = 1; // clamp big spikes (optional)

  const t1DisplayedBefore = getDisplayedTeamTickets(team1);
  const t2DisplayedBefore = getDisplayedTeamTickets(team2);

  let teamcps = [0, 0];

  Object.values(serverCapturePoints).forEach((capturePoint) => {
    if (mod.Equals(capturePoint.getOwner(), team1)) teamcps[0] += 1;
    else if (mod.Equals(capturePoint.getOwner(), team2)) teamcps[1] += 1;
  });

  // 1-flag ticket bleed (only when the other team has 0 flags)
  if (teamcps[0] === 1 && teamcps[1] === 0) {
    serverScores[1] += BLEED_ONE_FLAG * dt;
  } else if (teamcps[0] === 2) {
    serverScores[1] += BLEED_TWO_FLAGS * dt;
  } else if (teamcps[0] === 3) {
    serverScores[1] += BLEED_THREE_FLAGS * dt;
  } else if (teamcps[1] === 1 && teamcps[0] === 0) {
    serverScores[0] += BLEED_ONE_FLAG * dt;
  } else if (teamcps[1] === 2) {
    serverScores[0] += BLEED_TWO_FLAGS * dt;
  } else if (teamcps[1] === 3) {
    serverScores[0] += BLEED_THREE_FLAGS * dt;
  }

  ClampTicketsAndMaybeEndMatch();

  const t1DisplayedAfter = getDisplayedTeamTickets(team1);
  const t2DisplayedAfter = getDisplayedTeamTickets(team2);
  const ticketsChanged = t1DisplayedAfter !== t1DisplayedBefore || t2DisplayedAfter !== t2DisplayedBefore;

  if (ticketsChanged) {
    markLiveHudScoresDirty();
    markEndgameSuspenseDirty();
  }

  if (t1DisplayedAfter < t1DisplayedBefore) {
    triggerBleedPulseForLosingTeam(team1);
  }

  if (t2DisplayedAfter < t2DisplayedBefore) {
    triggerBleedPulseForLosingTeam(team2);
  }
}

function HideSharedTicketBarFills(): void {
  const friendlyFill = SafeFindWidget("friendlyprogressbarfill");
  const enemyFill = SafeFindWidget("enemyprogressbarfill");
  if (friendlyFill) mod.SetUIWidgetVisible(friendlyFill, false);
  if (enemyFill) mod.SetUIWidgetVisible(enemyFill, false);
}

function UpdateTopFlagColorsForPlayer(
  p: Player,
  symbols: LiveUiFlagSymbol[] = LIVE_HUD_FLAG_SYMBOLS
): void {
  if (!p.liveHudRootWidget) return;

  const perspectiveTeam = getLiveHudPerspectiveTeamForPlayer(p);
  for (let i = 0; i < symbols.length; i++) {
    const symbol = symbols[i];
    const capturePoint = getCapturePointBySymbol(symbol);
    if (!capturePoint) continue;

    const color = getLiveHudTopFlagLaneColorForTeam(capturePoint, perspectiveTeam);
    const flag = p.flagWidget[symbol];
    const fill = p.flagFillWidget[symbol];
    const outlines = p.flagOutlineWidget[symbol] ?? [];

    if (flag) {
      mod.SetUITextColor(flag, color);
      mod.SetUITextAlpha(flag, 1);
    }

    if (fill) {
      mod.SetUIWidgetBgColor(fill, color);
      mod.SetUIWidgetBgAlpha(fill, 0.5);
      mod.SetUIWidgetBgFill(fill, mod.UIBgFill.Blur);
    }

    for (let j = 0; j < outlines.length; j++) {
      mod.SetUIWidgetBgColor(outlines[j], color);
    }
  }
}


// Ticket bar fills shrink with the viewer's friendly/opponent tickets.
function UpdateTopTicketBarsForPlayer(p: Player): void {
    const friendlyFill = p.friendlyTicketsFillWidget;
    const enemyFill = p.enemyTicketsFillWidget;
    if (!friendlyFill || !enemyFill) return;

    const barW = 210;
    const fillH = 4;
    const fillY = 1;

    const team = mod.GetTeam(p.player);

    let friendlyTickets = mod.Equals(team, team1) ? serverScores[0] : serverScores[1];
    let enemyTickets = mod.Equals(team, team1) ? serverScores[1] : serverScores[0];

    if (friendlyTickets < 0) friendlyTickets = 0;
    if (enemyTickets < 0) enemyTickets = 0;

    let fFriendly = friendlyTickets / TICKETS_BAR_MAX;
    let fEnemy = enemyTickets / TICKETS_BAR_MAX;

    if (fFriendly < 0) fFriendly = 0;
    if (fFriendly > 1) fFriendly = 1;

    if (fEnemy < 0) fEnemy = 0;
    if (fEnemy > 1) fEnemy = 1;

    const wFriendly = mod.Ceiling(barW * fFriendly);
    const wEnemy = mod.Ceiling(barW * fEnemy);

    // Friendly bar: outer edge is the score box side (left), shrink toward center (right).
    mod.SetUIWidgetSize(friendlyFill, mod.CreateVector(wFriendly, fillH, 0));
    mod.SetUIWidgetPosition(friendlyFill, mod.CreateVector(0, fillY, 0));

    // Enemy bar: outer edge is the score box side (right), shrink toward center (left).
    mod.SetUIWidgetSize(enemyFill, mod.CreateVector(wEnemy, fillH, 0));
    mod.SetUIWidgetPosition(enemyFill, mod.CreateVector(barW - wEnemy, fillY, 0));
}


// -------------------------------------------------------------------------------------------------
// UI SAFE HELPERS
// Prevent runtime errors if a widget name does not exist yet (join-in-progress / rebuild races).
// These functions do nothing if the widget is missing.
// -------------------------------------------------------------------------------------------------
function setFlagOutlineColorForPlayer(playerId: number, symbol: "A" | "B" | "C", color: mod.Vector): void {
  const playerState = serverPlayers.get(playerId);
  const outlineWidgets = playerState?.flagOutlineWidget?.[symbol] ?? [];
  for (let i = 0; i < outlineWidgets.length; i++) {
    mod.SetUIWidgetBgColor(outlineWidgets[i], color);
  }

  const t = mod.FindUIWidgetWithName("FLAG" + symbol + "_OL_T" + playerId);
  const b = mod.FindUIWidgetWithName("FLAG" + symbol + "_OL_B" + playerId);
  const l = mod.FindUIWidgetWithName("FLAG" + symbol + "_OL_L" + playerId);
  const r = mod.FindUIWidgetWithName("FLAG" + symbol + "_OL_R" + playerId);

  if (t) mod.SetUIWidgetBgColor(t, color);
  if (b) mod.SetUIWidgetBgColor(b, color);
  if (l) mod.SetUIWidgetBgColor(l, color);
  if (r) mod.SetUIWidgetBgColor(r, color);
}

function setFlagLetterAndOutlineColorForPlayer(playerId: number, symbol: "A" | "B" | "C", color: mod.Vector): void {
  const playerState = serverPlayers.get(playerId);
  const currentFlagWidget = playerState?.flagWidget?.[symbol];
  if (currentFlagWidget) {
    mod.SetUITextColor(currentFlagWidget, color);
    mod.SetUITextAlpha(currentFlagWidget, 1);
  }

  const letter = mod.FindUIWidgetWithName("FLAG" + symbol + playerId);
  if (letter) {
    mod.SetUITextColor(letter, color);
    mod.SetUITextAlpha(letter, 1);
  }

  setFlagOutlineColorForPlayer(playerId, symbol, color);
  setFlagFillColorForPlayer(playerId, symbol, color);
}


function setFlagFillColorForPlayer(playerId: number, symbol: "A" | "B" | "C", color: mod.Vector): void {
  const playerState = serverPlayers.get(playerId);
  const currentFillWidget = playerState?.flagFillWidget?.[symbol];
  if (currentFillWidget) {
    mod.SetUIWidgetBgColor(currentFillWidget, color);
    mod.SetUIWidgetBgAlpha(currentFillWidget, 0.5);
    mod.SetUIWidgetBgFill(currentFillWidget, mod.UIBgFill.Blur);
  }

  const fill = mod.FindUIWidgetWithName("FLAG" + symbol + "_FILL" + playerId);
  if (!fill) return;

  mod.SetUIWidgetBgColor(fill, color);
  mod.SetUIWidgetBgAlpha(fill, 0.5);
  mod.SetUIWidgetBgFill(fill, mod.UIBgFill.Blur);
}

function warnPrematchUiGuardOnce(key: string, message: any): void {
  if (prematchUiGuardWarnedByKey[key] === true) return;
  prematchUiGuardWarnedByKey[key] = true;
  mod.DisplayHighlightedWorldLogMessage(message);
}

function safeFindWidgetByNameNoThrow(widgetName: string, context: string): mod.UIWidget | undefined {
  try {
    const widget = mod.FindUIWidgetWithName(widgetName);
    return widget ? widget : undefined;
  } catch (err) {
    LogRuntimeError("FindUIWidget/" + context, err);
    return undefined;
  }
}

function safeDeleteWidgetByName(widgetName: string): void {
  const widget = safeFindWidgetByNameNoThrow(widgetName, "delete/" + widgetName);
  if (!widget) return;
  try {
    mod.DeleteUIWidget(widget);
  } catch (err) {
    LogRuntimeError("DeleteUIWidget/" + widgetName, err);
  }
}

function SafeFindWidget(name: string): mod.UIWidget | null {
  try {
    const w = mod.FindUIWidgetWithName(name);
    return w ? w : null;
  } catch (_err) {
    return null;
  }
}

function SafeSetTextAlphaByName(name: string, a: number): void {
  const w = SafeFindWidget(name);
  if (!w) return;
  try {
    mod.SetUITextAlpha(w, a);
  } catch (_err) {}
}

function SafeSetTextLabelByName(name: string, label: any): void {
  const w = SafeFindWidget(name);
  if (!w) return;
  try {
    mod.SetUITextLabel(w, label);
  } catch (_err) {}
}

function SafeSetWidgetVisibleHandle(widget: mod.UIWidget | undefined | null, visible: boolean): void {
  if (!widget) return;
  try {
    mod.SetUIWidgetVisible(widget, visible);
  } catch (_err) {}
}

function SafeSetWidgetPositionHandle(widget: mod.UIWidget | undefined | null, pos: mod.Vector): void {
  if (!widget) return;
  try {
    mod.SetUIWidgetPosition(widget, pos);
  } catch (_err) {}
}

function SafeSetWidgetSizeHandle(widget: mod.UIWidget | undefined | null, size: mod.Vector): void {
  if (!widget) return;
  try {
    mod.SetUIWidgetSize(widget, size);
  } catch (_err) {}
}

function SafeSetTextLabelHandle(widget: mod.UIWidget | undefined | null, label: any): void {
  if (!widget) return;
  try {
    mod.SetUITextLabel(widget, label);
  } catch (_err) {}
}

function SafeSetTextColorHandle(widget: mod.UIWidget | undefined | null, color: mod.Vector): void {
  if (!widget) return;
  try {
    mod.SetUITextColor(widget, color);
  } catch (_err) {}
}

function SafeSetWidgetDepthHandle(widget: mod.UIWidget | undefined | null, depth: mod.UIDepth): void {
  if (!widget) return;
  try {
    mod.SetUIWidgetDepth(widget, depth);
  } catch (_err) {}
}

function SafeSetWidgetBgColorHandle(widget: mod.UIWidget | undefined | null, color: mod.Vector): void {
  if (!widget) return;
  try {
    mod.SetUIWidgetBgColor(widget, color);
  } catch (_err) {}
}

function SafeSetWidgetVisibleByName(name: string, visible: boolean): void {
  const w = SafeFindWidget(name);
  if (!w) return;
  try {
    mod.SetUIWidgetVisible(w, visible);
  } catch (_err) {}
}

function SafeEnableWorldIconById(iconId: number, enabledImage: boolean, enabledText: boolean): void {
  try {
    const icon = mod.GetWorldIcon(iconId);
    mod.EnableWorldIconImage(icon, enabledImage);
    mod.EnableWorldIconText(icon, enabledText);
  } catch (_err) {}
}

function SafeEnableInteractPointById(interactId: number, enabled: boolean): void {
  try {
    mod.EnableInteractPoint(mod.GetInteractPoint(interactId), enabled);
  } catch (_err) {}
}

function SafeSetWorldIconTextById(iconId: number, textLabel: any): void {
  try {
    mod.SetWorldIconText(mod.GetWorldIcon(iconId), textLabel);
  } catch (_err) {}
}


function SetUITime(): void {
  const timeWidget = SafeFindWidget("RemainingTime");
  if (!timeWidget) return;

  const remainingTime = mod.Max(0, mod.GetMatchTimeRemaining());
  const minutes = mod.Floor(remainingTime / 60);
  const totalseconds = mod.Floor(remainingTime % 60);
  const seconds = totalseconds % 10;
  const seconds10 = mod.Floor(totalseconds / 10);

  mod.SetUITextLabel(timeWidget, mod.Message("{}:{}{}", minutes, seconds10, seconds));
}



function getFriendlyScore(team: mod.Team): number {
  return mod.Equals(team, team1) ? mod.Ceiling(serverScores[0]) : mod.Ceiling(serverScores[1]);
}

function getOpponentScore(team: mod.Team): number {
  return mod.Equals(team, team1) ? mod.Ceiling(serverScores[1]) : mod.Ceiling(serverScores[0]);
}

function SetUIScores(): void {
  serverPlayers.forEach((p) => p.updateTickets());
}

/* =================================================================================================
   7) PLAYER / CAPTURE POINT WRAPPERS
================================================================================================= */
// Reused, per-sync caches to avoid allocations
let _syncStamp = 0; // increments each sync call (stamp technique)
const _seenThisSync: { [playerId: number]: number } = {}; // playerId -> stamp

const _tmpPlayerToCpId: { [playerId: number]: number } = {}; // temporary mapping
const _tmpPlayerToCpIdKeys: number[] = []; // keys set this sync (so we can clear cheaply)

function _tmpPlayerToCpIdSet(playerId: number, cpId: number): void {
  // Only record the key once so we can clear fast later
  if (_tmpPlayerToCpId[playerId] === undefined) {
    _tmpPlayerToCpIdKeys.push(playerId);
  }
  _tmpPlayerToCpId[playerId] = cpId;
}

function _tmpPlayerToCpIdClear(): void {
  for (let i = 0; i < _tmpPlayerToCpIdKeys.length; i++) {
    const id = _tmpPlayerToCpIdKeys[i];
    delete _tmpPlayerToCpId[id];
  }
  _tmpPlayerToCpIdKeys.length = 0;
}


const serverPlayers = new Map<number, Player>();
const disconnectedPlayers: Player[] = [];

let playerInDamageZone: { [playerId: number]: boolean } = {};

// -------------------------------
// Restricted Area (UI + countdown)
// -------------------------------
let playerInRestrictedArea: { [playerId: number]: boolean } = {};
let restrictedAreaCountdownToken: { [playerId: number]: number } = {};
// Track overlapping restricted triggers so one zone exit cannot cancel another zone's countdown/UI.
let activeRestrictedAreaTriggersByPlayerId: { [playerId: number]: { [triggerId: number]: true } } = {};

let restrictedAreaRootWidgetByPlayerId: { [playerId: number]: mod.UIWidget } = {};
let restrictedAreaCounterWidgetByPlayerId: { [playerId: number]: mod.UIWidget } = {};

function isManagedRestrictedAreaTrigger(triggerId: number): boolean {
  return (
    triggerId === RESTRICTED_AREA_TRIGGER ||
    triggerId === TEAM1_HQ_PROTECTION_TRIGGER_ID ||
    triggerId === TEAM2_HQ_PROTECTION_TRIGGER_ID
  );
}

function shouldApplyRestrictedAreaTriggerToPlayer(eventPlayer: mod.Player, triggerId: number): boolean {
  if (triggerId === RESTRICTED_AREA_TRIGGER) return true;

  const playerTeam = mod.GetTeam(eventPlayer);
  if (triggerId === TEAM1_HQ_PROTECTION_TRIGGER_ID) return mod.Equals(playerTeam, team2);
  if (triggerId === TEAM2_HQ_PROTECTION_TRIGGER_ID) return mod.Equals(playerTeam, team1);

  return false;
}

function getOrCreateRestrictedAreaTriggersForPlayer(playerId: number): { [triggerId: number]: true } {
  const existing = activeRestrictedAreaTriggersByPlayerId[playerId];
  if (existing) return existing;

  const created: { [triggerId: number]: true } = {};
  activeRestrictedAreaTriggersByPlayerId[playerId] = created;
  return created;
}

function addRestrictedAreaTriggerForPlayer(playerId: number, triggerId: number): void {
  const activeTriggers = getOrCreateRestrictedAreaTriggersForPlayer(playerId);
  activeTriggers[triggerId] = true;
}

function hasActiveRestrictedAreaTrigger(playerId: number): boolean {
  const activeTriggers = activeRestrictedAreaTriggersByPlayerId[playerId];
  if (!activeTriggers) return false;

  for (const _triggerId in activeTriggers) {
    return true;
  }

  return false;
}

function removeRestrictedAreaTriggerForPlayer(playerId: number, triggerId: number): boolean {
  const activeTriggers = activeRestrictedAreaTriggersByPlayerId[playerId];
  if (!activeTriggers || activeTriggers[triggerId] !== true) return false;

  delete activeTriggers[triggerId];
  if (!hasActiveRestrictedAreaTrigger(playerId)) {
    delete activeRestrictedAreaTriggersByPlayerId[playerId];
  }

  return true;
}

function clearRestrictedAreaStateForPlayer(playerId: number, eventPlayer?: mod.Player): void {
  restrictedAreaCountdownToken[playerId] = (restrictedAreaCountdownToken[playerId] ?? 0) + 1;
  playerInRestrictedArea[playerId] = false;
  delete activeRestrictedAreaTriggersByPlayerId[playerId];
  hideRestrictedAreaUi(playerId);

  if (eventPlayer) stopRestrictedAreaLoopSfxForPlayer(eventPlayer);
}

function buildRestrictedAreaUiForPlayer(p: Player): void {
  const playerId = p.id;

  // If it already exists (reconnect / re-init), delete and rebuild.
  const existingRoot = restrictedAreaRootWidgetByPlayerId[playerId];
  if (existingRoot) {
    mod.DeleteUIWidget(existingRoot);
    delete restrictedAreaRootWidgetByPlayerId[playerId];
    delete restrictedAreaCounterWidgetByPlayerId[playerId];
  }

  const rootName = `Restricted_Area_UI_${playerId}`;
  const counterName = `Restricted_Area_CounterText_${playerId}`;

  const root = modlib.ParseUI({
    name: rootName,
    type: "Container",
    position: [0, 0],
    size: [1920, 1080],
    anchor: mod.UIAnchor.Center,
    visible: false, // hidden by default
    padding: 0,
    bgColor: [0.2, 0.2, 0.2],
    bgAlpha: 1,
    bgFill: mod.UIBgFill.None,
    playerId: p.player, // IMPORTANT: restrict this UI to this player only
    children: [
      {
        name: `Restricted_Area_Faded_${playerId}`,
        type: "Container",
        position: [0, 0],
        size: [2000, 1500],
        anchor: mod.UIAnchor.Center,
        visible: true,
        padding: 0,
        bgColor: [0.0314, 0.0431, 0.0431],
        bgAlpha: 0.8,
        bgFill: mod.UIBgFill.Blur,
        children: [
          {
            name: `Restricted_Area_RedRect_${playerId}`,
            type: "Container",
            position: [0, 0],
            size: [1337.4, 201.8],
            anchor: mod.UIAnchor.Center,
            visible: true,
            padding: 0,
            bgColor: [0.8902, 0.0078, 0.0078],
            bgAlpha: 0.5,
            bgFill: mod.UIBgFill.Blur,
            children: [
              {
                name: `Restricted_Area_Text_${playerId}`,
                type: "Text",
                position: [0, -59.8],
                size: [746.3, 194.9],
                anchor: mod.UIAnchor.Center,
                visible: true,
                padding: 0,
                bgColor: [0.2, 0.2, 0.2],
                bgAlpha: 1,
                bgFill: mod.UIBgFill.None,
                textLabel: mod.stringkeys.Restricted_Area,
                textColor: [1, 1, 1],
                textAlpha: 1,
                textSize: 69,
                textAnchor: mod.UIAnchor.Center,
              },
              {
                name: `Restricted_Area_LeaveNow_${playerId}`,
                type: "Text",
                position: [0, 0],
                size: [571.5, 50],
                anchor: mod.UIAnchor.Center,
                visible: true,
                padding: 0,
                bgColor: [0.2, 0.2, 0.2],
                bgAlpha: 1,
                bgFill: mod.UIBgFill.None,
                textLabel: mod.stringkeys.Leave_Now,
                textColor: [1, 1, 1],
                textAlpha: 1,
                textSize: 38,
                textAnchor: mod.UIAnchor.Center,
              },
              {
                name: counterName,
                type: "Text",
                position: [0, 50],
                size: [150, 150],
                anchor: mod.UIAnchor.Center,
                visible: true,
                padding: 0,
                bgColor: [0.2, 0.2, 0.2],
                bgAlpha: 1,
                bgFill: mod.UIBgFill.None,
                textLabel: mod.Message(5),
                textColor: [1, 1, 1],
                textAlpha: 1,
                textSize: 63,
                textAnchor: mod.UIAnchor.Center,
              },
            ],
          },
          {
            name: `Restricted_Area_Outline_${playerId}`,
            type: "Container",
            position: [0, 0],
            size: [1337.4, 201.8],
            anchor: mod.UIAnchor.Center,
            visible: true,
            padding: 0,
            bgColor: [1, 1, 1],
            bgAlpha: 0.5,
            bgFill: mod.UIBgFill.OutlineThick,
          },
        ],
      },
    ],
  }) as mod.UIWidget;

  const counterWidget = mod.FindUIWidgetWithName(counterName) as mod.UIWidget;

  restrictedAreaRootWidgetByPlayerId[playerId] = root;
  restrictedAreaCounterWidgetByPlayerId[playerId] = counterWidget;

  // Ensure clean defaults
  playerInRestrictedArea[playerId] = false;
  restrictedAreaCountdownToken[playerId] = 0;
  delete activeRestrictedAreaTriggersByPlayerId[playerId];
  mod.SetUIWidgetVisible(root, false);
}

function showRestrictedAreaUi(playerId: number): void {
  const root = restrictedAreaRootWidgetByPlayerId[playerId];
  if (!root) return;
  mod.SetUIWidgetVisible(root, true);
}

function hideRestrictedAreaUi(playerId: number): void {
  const root = restrictedAreaRootWidgetByPlayerId[playerId];
  if (!root) return;
  mod.SetUIWidgetVisible(root, false);
}

async function startRestrictedAreaCountdown(p: Player): Promise<void> {
  const playerId = p.id;

  // New token cancels any existing countdown loop for this player
  const myToken = (restrictedAreaCountdownToken[playerId] ?? 0) + 1;
  restrictedAreaCountdownToken[playerId] = myToken;

  // Show UI immediately
  showRestrictedAreaUi(playerId);
  startRestrictedAreaLoopSfxForPlayer(p.player);


  let secondsLeft = 3;

  while (secondsLeft > 0) {
    // Cancel if player left area or a newer countdown started
    if (playerInRestrictedArea[playerId] !== true) break;
    if (restrictedAreaCountdownToken[playerId] !== myToken) break;

    const counterWidget = restrictedAreaCounterWidgetByPlayerId[playerId];
    if (counterWidget) mod.SetUITextLabel(counterWidget, mod.Message(secondsLeft));

    await mod.Wait(1);
    secondsLeft--;
  }

  // If still in area after countdown, kill
  if (
    playerInRestrictedArea[playerId] === true &&
    restrictedAreaCountdownToken[playerId] === myToken &&
    p.isDeployed &&
    kernelIsPlayerAlive(p.player)
  ) {
    // Big damage = guaranteed kill
    mod.DealDamage(p.player, 9999);
  }

  // Hide UI if they left (or after kill attempt)
  if (playerInRestrictedArea[playerId] !== true) {
    hideRestrictedAreaUi(playerId);
    stopRestrictedAreaLoopSfxForPlayer(p.player);
  } else {
    // Still in restricted area after countdown (even after kill attempt), keep UI up,
    // but stop the ticking loop so it doesn't run forever.
    stopRestrictedAreaLoopSfxForPlayer(p.player);
  }

}

function cleanupRestrictedAreaUiForPlayer(playerId: number): void {
  clearRestrictedAreaStateForPlayer(playerId);

  const root = restrictedAreaRootWidgetByPlayerId[playerId];
  if (root) mod.DeleteUIWidget(root);

  delete restrictedAreaRootWidgetByPlayerId[playerId];
  delete restrictedAreaCounterWidgetByPlayerId[playerId];
}

/* ----------------------------------------
   Player state (UI + scoreboard + capture)
---------------------------------------- */

class Player {
  public player: mod.Player;
  public id: number;
  public team: mod.Team;

  public isDeployed: boolean;

  public friendlyCapWidget: mod.UIWidget;
  public enemyCapWidget: mod.UIWidget;
  public progressBarWidget: mod.UIWidget;

  public friendlyScoreWidget: mod.UIWidget;
  public opponentScoreWidget: mod.UIWidget;


  public friendlyScorePad1Widget: mod.UIWidget;
  public friendlyScorePad2Widget: mod.UIWidget;
  public opponentScorePad1Widget: mod.UIWidget;
  public opponentScorePad2Widget: mod.UIWidget;


  public flagWidget: { [key: string]: mod.UIWidget };

  public activeFlagContainerWidget: mod.UIWidget;
  public activeFlagFriendlyWidget: mod.UIWidget;
  public activeFlagEnemyWidget: mod.UIWidget;
  public activeFlagWidget: mod.UIWidget;
  public liveHudRootWidget: mod.UIWidget;
  public remainingTimeWidget: mod.UIWidget;
  public friendlyTicketsFillWidget: mod.UIWidget;
  public enemyTicketsFillWidget: mod.UIWidget;
  public friendlyScorePulseWidget: mod.UIWidget;
  public enemyScorePulseWidget: mod.UIWidget;
  public friendlyProgressPulseWidget: mod.UIWidget;
  public enemyProgressPulseWidget: mod.UIWidget;
  public flagContainerWidget: { [key: string]: mod.UIWidget };
  public flagFillWidget: { [key: string]: mod.UIWidget };
  public flagOutlineWidget: { [key: string]: mod.UIWidget[] };
  public liveHudSlotTeamKey: LiveUiTeamKey | null;
  public liveHudSlotIndex: number;
  public liveHudSlotKey: string;
  public liveHudFriendlyPulseUntilTick: number;
  public liveHudEnemyPulseUntilTick: number;

  private _scoreboard: number[]; // [score, kills, deaths, assists, captures]
  private _capturePointId: number | null;
  private _firstDeploy: boolean;
  private _ready: boolean;

    constructor(player: mod.Player) {
    this.player = player;
    this.id = modlib.getPlayerId(this.player);
    this.team = mod.GetTeam(this.player);

    this._scoreboard = [0, 0, 0, 0, 0];
    this._capturePointId = null;
    this._firstDeploy = true;
    this._ready = false;

    this.isDeployed = false;

    // Live HUD widget refs start empty. They will be built when live starts or when joining during live.
    this.friendlyCapWidget = null as any;
    this.enemyCapWidget = null as any;
    this.progressBarWidget = null as any;

    this.friendlyScoreWidget = null as any;
    this.opponentScoreWidget = null as any;

    this.friendlyScorePad1Widget = null as any;
    this.friendlyScorePad2Widget = null as any;
    this.opponentScorePad1Widget = null as any;
    this.opponentScorePad2Widget = null as any;

    this.flagWidget = {} as any;

    this.activeFlagContainerWidget = null as any;
    this.activeFlagFriendlyWidget = null as any;
    this.activeFlagEnemyWidget = null as any;
    this.activeFlagWidget = null as any;
    this.liveHudRootWidget = null as any;
    this.remainingTimeWidget = null as any;
    this.friendlyTicketsFillWidget = null as any;
    this.enemyTicketsFillWidget = null as any;
    this.friendlyScorePulseWidget = null as any;
    this.enemyScorePulseWidget = null as any;
    this.friendlyProgressPulseWidget = null as any;
    this.enemyProgressPulseWidget = null as any;
    this.flagContainerWidget = {} as any;
    this.flagFillWidget = {} as any;
    this.flagOutlineWidget = {} as any;
    this.liveHudSlotTeamKey = null;
    this.liveHudSlotIndex = -1;
    this.liveHudSlotKey = "";
    this.liveHudFriendlyPulseUntilTick = 0;
    this.liveHudEnemyPulseUntilTick = 0;

    // Do not build any Live HUD widgets here.
    // Building them here is what causes some players to keep the placeholder tickets and then get a second set in live.

    mod.SetRedeployTime(this.player, 0);
  }


  resetActiveCaptureProgressUi(): void {
    if (this.progressBarWidget) {
      mod.SetUIWidgetSize(this.progressBarWidget, mod.CreateVector(0, 60, 0));
      mod.SetUIWidgetPosition(this.progressBarWidget, mod.CreateVector(60, 0, 0));
      mod.SetUIWidgetBgColor(this.progressBarWidget, COLOR_NEUTRAL);
    }

    if (this.activeFlagWidget) {
      mod.SetUITextLabel(this.activeFlagWidget, mod.Message(0));
      mod.SetUITextColor(this.activeFlagWidget, COLOR_NEUTRAL);
      mod.SetUIWidgetBgColor(this.activeFlagWidget, mod.CreateVector(0, 0, 0));
      mod.SetUIWidgetBgAlpha(this.activeFlagWidget, 0.4);
      mod.SetUIWidgetBgFill(this.activeFlagWidget, mod.UIBgFill.Blur);
    }

    if (this.friendlyCapWidget) mod.SetUITextLabel(this.friendlyCapWidget, mod.Message(0));
    if (this.enemyCapWidget) mod.SetUITextLabel(this.enemyCapWidget, mod.Message(0));
  }

  setCapturePoint(capturePointId: number | null): void {
    if (this._capturePointId !== capturePointId) {
      this.resetActiveCaptureProgressUi();
    }
    this._capturePointId = capturePointId;
  }

  getCapturePoint(): number | null {
    return this._capturePointId;
  }

  isFirstDeploy(): boolean {
    if (this._firstDeploy) {
      this._firstDeploy = false;
      return true;
    }
    return false;
  }

  updateScoreboard(): void {
    if (!isParticipantPlayer(this.player)) return;

    mod.SetScoreboardPlayerValues(
      this.player,
      this._scoreboard[0],
      this._scoreboard[1],
      this._scoreboard[2],
      this._scoreboard[3],
      this._scoreboard[4]
    );
  }

  addScore(score: number): void {
    this._scoreboard[0] += score;
    markScoreboardDirty();
  }

  addKill(): void {
    this._scoreboard[1] += 1;
    markScoreboardDirty();
  }

  addDeath(): void {
    this._scoreboard[2] += 1;
    markScoreboardDirty();
  }

  addKillAssist(): void {
    this._scoreboard[3] += 1;
    markScoreboardDirty();
  }

  addCapture(): void {
    this._scoreboard[4] += 1;
    markScoreboardDirty();
  }

  isReady(): boolean {
    return this._ready;
  }

  changeReady(): void {
    this._ready = !this._ready;

    const w = resolvePrematchReadyTextWidgetForPlayer(this.id);
    if (!w) return;

    if (this._ready) {
      SafeSetTextColorHandle(w, mod.CreateVector(0, 1, 0));
      SafeSetTextLabelHandle(w, mod.Message(mod.stringkeys.Ready));
    } else {
      SafeSetTextColorHandle(w, mod.CreateVector(1, 0, 0));
      SafeSetTextLabelHandle(w, mod.Message(mod.stringkeys.NotReady));
    }
  }
  resetReadyForNewRound(): void {
    this._ready = false;

    const w = resolvePrematchReadyTextWidgetForPlayer(this.id);
    if (!w) return;

    SafeSetTextColorHandle(w, mod.CreateVector(1, 0, 0));
    SafeSetTextLabelHandle(w, mod.Message(mod.stringkeys.NotReady));
  }

  setTeam(): void {
    this.team = mod.GetTeam(this.player);
  }

  clearLiveHudRefs(): void {
    this.liveHudRootWidget = null as any;
    this.remainingTimeWidget = null as any;

    this.friendlyCapWidget = null as any;
    this.enemyCapWidget = null as any;
    this.progressBarWidget = null as any;

    this.friendlyScoreWidget = null as any;
    this.opponentScoreWidget = null as any;
    this.friendlyScorePad1Widget = null as any;
    this.friendlyScorePad2Widget = null as any;
    this.opponentScorePad1Widget = null as any;
    this.opponentScorePad2Widget = null as any;

    this.friendlyTicketsFillWidget = null as any;
    this.enemyTicketsFillWidget = null as any;
    this.friendlyScorePulseWidget = null as any;
    this.enemyScorePulseWidget = null as any;
    this.friendlyProgressPulseWidget = null as any;
    this.enemyProgressPulseWidget = null as any;

    this.flagContainerWidget = {} as any;
    this.flagWidget = {} as any;
    this.flagFillWidget = {} as any;
    this.flagOutlineWidget = {} as any;

    this.activeFlagContainerWidget = null as any;
    this.activeFlagFriendlyWidget = null as any;
    this.activeFlagEnemyWidget = null as any;
    this.activeFlagWidget = null as any;

    this.liveHudSlotTeamKey = null;
    this.liveHudSlotIndex = -1;
    this.liveHudSlotKey = "";
    this.liveHudFriendlyPulseUntilTick = 0;
    this.liveHudEnemyPulseUntilTick = 0;
  }

  addUI(): void {
    if (gameStatus !== 3) return;

    const excludedPlayer = isExcludedPlayer(this.player);
    const participant = isParticipantPlayer(this.player);

    if (!participant && !excludedPlayer) {
      dequeueLiveHudPrebuildForPlayer(this.id);
      releaseLiveHudSlotForPlayer(this.id);
      return;
    }

    dequeueLiveHudPrebuildForPlayer(this.id);
    if (!ensureLiveHudSlotForPlayer(this)) return;

    setLiveHudVisibleForPlayer(this, true);

    this.updateTickets();

    if (!participant) {
      return;
    }

    this.updateUIPlayersOnPoint();
    this.updateUIProgress();
    SetUITimeForPlayer(this);

    if (this.activeFlagContainerWidget) {
      mod.SetUIWidgetVisible(this.activeFlagContainerWidget, this._capturePointId !== null);
    }
  }

  getScoreboardSnapshot(): number[] {
    // [score, kills, deaths, assists, captures]
    return [
      this._scoreboard[0],
      this._scoreboard[1],
      this._scoreboard[2],
      this._scoreboard[3],
      this._scoreboard[4],
    ];
  }

  resetForNewRound(): void {
    this._scoreboard = [0, 0, 0, 0, 0];
    this._capturePointId = null;
    this._firstDeploy = true;
    this._ready = false;
    this.isDeployed = false;
    this.clearLiveHudRefs();

    // Reset prematch ready text if it exists.
    const w = resolvePrematchReadyTextWidgetForPlayer(this.id);
    if (w) {
      SafeSetTextColorHandle(w, mod.CreateVector(1, 0, 0));
      SafeSetTextLabelHandle(w, mod.Message(mod.stringkeys.NotReady));
    }

    markScoreboardDirty();
  }



  updateTickets(): void {
    const excludedPlayer = isExcludedPlayer(this.player);
    const participant = isParticipantPlayer(this.player);

    if (!participant && !excludedPlayer) return;
    if (gameStatus !== 3) return;

    if (excludedPlayer) {
      if (!ensureReservedLiveHudSlotForPlayer(this)) return;
      setLiveHudVisibleForPlayer(this, true);
    } else {
      const currentTeamKey = getLiveUiTeamKey(mod.GetTeam(this.player));
      if (!currentTeamKey) {
        dequeueLiveHudPrebuildForPlayer(this.id);
        releaseLiveHudSlotForPlayer(this.id);
        return;
      }

      if (!this.liveHudRootWidget || this.liveHudSlotTeamKey !== currentTeamKey) {
        if (!ensureLiveHudSlotForPlayer(this)) return;
        setLiveHudVisibleForPlayer(this, true);
      }
    }

    const scorePerspectiveTeam = excludedPlayer ? team1 : mod.GetTeam(this.player);

    const friendly = getFriendlyScore(scorePerspectiveTeam);
    const enemy = getOpponentScore(scorePerspectiveTeam);

    mod.SetUITextLabel(this.friendlyScoreWidget, mod.Message(friendly));
    mod.SetUITextLabel(this.opponentScoreWidget, mod.Message(enemy));

    mod.SetUIWidgetVisible(this.friendlyScorePad1Widget, friendly < 100);
    mod.SetUIWidgetVisible(this.friendlyScorePad2Widget, friendly < 10);

    mod.SetUIWidgetVisible(this.opponentScorePad1Widget, enemy < 100);
    mod.SetUIWidgetVisible(this.opponentScorePad2Widget, enemy < 10);

    UpdateTopTicketBarsForPlayer(this);

    // Keep top flag colors correct when team perspective changes.
    UpdateTopFlagColorsForPlayer(this);
  }

  updateUIPlayersOnPoint(): void {
    if (!isParticipantPlayer(this.player)) return;

    const pointId = this.getCapturePoint();
    if (pointId === null) return;

    const cp = serverCapturePoints[pointId];
    if (!cp) return;

    this.updateActiveCaptureUi(cp);
  }

  updateUIProgress(): void {
    if (!isParticipantPlayer(this.player)) return;

    const pointId = this.getCapturePoint();
    if (pointId === null) return;

    const cp = serverCapturePoints[pointId];
    if (!cp) return;

    this.updateActiveCaptureUi(cp);
  }

  updateActiveCaptureUi(cp: CapturePoint): void {
    const team = mod.GetTeam(this.player);
    const onPoint = cp.getOnPoint();
    const friendlyCount = modlib.Equals(team, team1) ? onPoint[0] : onPoint[1];
    const enemyCount = modlib.Equals(team, team1) ? onPoint[1] : onPoint[0];

    if (this.friendlyCapWidget) mod.SetUITextLabel(this.friendlyCapWidget, mod.Message(friendlyCount));
    if (this.enemyCapWidget) mod.SetUITextLabel(this.enemyCapWidget, mod.Message(enemyCount));

    if (this.activeFlagWidget) {
      const accentColor = getLiveHudTopFlagLaneColorForTeam(cp, team);
      mod.SetUITextLabel(this.activeFlagWidget, mod.Message(cp.symbol));
      mod.SetUITextColor(this.activeFlagWidget, mod.CreateVector(1, 1, 1));
      mod.SetUIWidgetBgColor(this.activeFlagWidget, accentColor);
      mod.SetUIWidgetBgAlpha(this.activeFlagWidget, 0.45);
      mod.SetUIWidgetBgFill(this.activeFlagWidget, mod.UIBgFill.Blur);
    }

    let prog = cp.getDisplayCaptureProgress();

    if (mod.Equals(cp.getOwner(), team) && prog >= PROGRESS_FULL) {
      prog = 1;
    }

    let clampedProgress = prog;
    if (clampedProgress < 0) clampedProgress = 0;
    if (clampedProgress > 1) clampedProgress = 1;

    const fillWidth = 60 * clampedProgress;
    const size = mod.CreateVector(fillWidth, 60, 0);

    if (this.progressBarWidget) {
      mod.SetUIWidgetSize(this.progressBarWidget, size);
      mod.SetUIWidgetPosition(this.progressBarWidget, mod.CreateVector(60, 0, 0));
      mod.SetUIWidgetBgColor(this.progressBarWidget, getCapturePointProgressFillColorForTeam(cp, team));
    }

    if (this.activeFlagContainerWidget) {
      mod.SetUIWidgetVisible(this.activeFlagContainerWidget, true);
    }
  }
}

/* ----------------------------------------
   Capture point wrapper
---------------------------------------- */

class CapturePoint {
  public symbol: string;
  public id: number;

  private _owner: mod.Team;
  private _onPoint: number[];
  private _captureProgress: number;
  private _previousCaptureProgress: number;
  private _captureProgressDirection: -1 | 0 | 1;
  private _lastCaptureProgressSampleTick: number;
  private _displayProgressRatePerTick: number;
  private _displayProgressMotionMode: CaptureProgressMotionMode;
  private _capturingTeam: mod.Team;
  private _progressTeam: mod.Team;
  private _position: mod.Vector | null;
  private _lastSampledPhase: CapturePointPhase;
  private _lastAnnouncedPhase: CapturePointPhase | null;
  private _lastAnnouncedOwner: mod.Team;
  private _lastAnnouncedProgressTeam: mod.Team;

  constructor(id: number, symbol: string) {
    this.id = id;
    this.symbol = symbol;

    this._owner = teamNeutral;
    this._onPoint = [];
    this._captureProgress = 0;
    this._previousCaptureProgress = 0;
    this._captureProgressDirection = 0;
    this._lastCaptureProgressSampleTick = serverTickCount;
    this._displayProgressRatePerTick = 0;
    this._displayProgressMotionMode = 0;
    this._capturingTeam = teamNeutral;
    this._progressTeam = teamNeutral;
    this._position = null;
    this._lastSampledPhase = "neutral_idle";
    this._lastAnnouncedPhase = null;
    this._lastAnnouncedOwner = teamNeutral;
    this._lastAnnouncedProgressTeam = teamNeutral;
  }

  resolveHandle(eventCapturePoint?: mod.CapturePoint | null): mod.CapturePoint {
    if (eventCapturePoint && mod.GetObjId(eventCapturePoint) === this.id) {
      return eventCapturePoint;
    }
    return mod.GetCapturePoint(this.id);
  }

  applyCaptureSettings(eventCapturePoint?: mod.CapturePoint | null): void {
    const handle = this.resolveHandle(eventCapturePoint);
    mod.SetCapturePointCapturingTime(handle, CAPTURE_TIME);
    mod.SetCapturePointNeutralizationTime(handle, NEUTRALIZE_TIME);
    mod.SetMaxCaptureMultiplier(handle, CAPTURE_MULTIPLIER_MAX);
  }

  setObjectiveEnabled(enabled: boolean, eventCapturePoint?: mod.CapturePoint | null): void {
    mod.EnableGameModeObjective(this.resolveHandle(eventCapturePoint), enabled);
  }

  getPlayerIdsOnPoint(): number[] {
    return this._onPoint;
  }
  clearOnPoint(): void {
    this._onPoint.length = 0; // reuses same array backing store
  }

  addOnPoint(playerId: number): void {
    this._onPoint.push(playerId);
  }

  removeOnPoint(playerId: number): void {
    const index = this._onPoint.indexOf(playerId);
    if (index >= 0) this._onPoint.splice(index, 1);
  }

  getOnPoint(): number[] {
    let onPoint = [0, 0];
    for (let i = 0; i < this._onPoint.length; i++) {
      const p = serverPlayers.get(this._onPoint[i]);
      if (!p) continue;

      const team = mod.GetTeam(p.player);
      if (mod.Equals(team, team1)) onPoint[0] += 1;
      else onPoint[1] += 1;
    }
    return onPoint;
  }

  refreshPosition(eventCapturePoint?: mod.CapturePoint | null): void {
    try {
      this._position = mod.GetObjectPosition(this.resolveHandle(eventCapturePoint));
    } catch (_err) {
      this._position = null;
    }
  }

  clearPosition(): void {
    this._position = null;
  }

  getPosition(): mod.Vector | null {
    return this._position;
  }

  setOwner(owner: mod.Team): void {
    this._owner = owner;
  }

  getOwner(): mod.Team {
    return this._owner;
  }

  setCaptureProgress(eventCapturePoint?: mod.CapturePoint | null): void {
    const handle = this.resolveHandle(eventCapturePoint);
    const previousSampleTick = this._lastCaptureProgressSampleTick;
    this._lastCaptureProgressSampleTick = serverTickCount;
    this._previousCaptureProgress = this._captureProgress;
    this._captureProgress = mod.GetCaptureProgress(handle);
    this._progressTeam = mod.GetOwnerProgressTeam(handle);
    const progressDelta = this._captureProgress - this._previousCaptureProgress;
    this._captureProgressDirection =
      progressDelta > CAPTURE_PROGRESS_DELTA_EPSILON ? 1 :
      progressDelta < -CAPTURE_PROGRESS_DELTA_EPSILON ? -1 :
      0;

    const onPoint = this.getOnPoint();
    const contestedNow = onPoint[0] > 0 && onPoint[1] > 0;
    const progressTeam = this._progressTeam;
    const inProgressBand = this._captureProgress > PROGRESS_EMPTY && this._captureProgress < PROGRESS_FULL;
    const sampleTickDelta = previousSampleTick < serverTickCount ? serverTickCount - previousSampleTick : 1;
    const observedRatePerTick = sampleTickDelta > 0 ? progressDelta / sampleTickDelta : 0;

    const progressIncreased = this._captureProgressDirection > 0;
    const progressDecreased = this._captureProgressDirection < 0;

    if (
      !contestedNow &&
      inProgressBand &&
      !mod.Equals(progressTeam, teamNeutral) &&
      Math.abs(observedRatePerTick) > CAPTURE_PROGRESS_DELTA_EPSILON
    ) {
      this._displayProgressMotionMode = observedRatePerTick > 0 ? 1 : -1;
      this._displayProgressRatePerTick = observedRatePerTick;
    } else {
      this._displayProgressMotionMode = 0;
      this._displayProgressRatePerTick = 0;
    }

    this._capturingTeam = inProgressBand ? progressTeam : teamNeutral;

    const activeBuildupTeam = captureBuildupTeamByCpId[this.id];
    if (
      activeBuildupTeam &&
      (contestedNow ||
        mod.Equals(progressTeam, teamNeutral) ||
        !mod.Equals(activeBuildupTeam, progressTeam) ||
        progressDecreased ||
        !inProgressBand)
    ) {
      invalidateCaptureBuildupSessionForCp(this.id);
    }

    // Buildup sound when capture is close to completion. Trigger by live observed capture velocity.
    if (gameStatus === 3 && progressIncreased && inProgressBand && !mod.Equals(progressTeam, teamNeutral) && !contestedNow) {
      const prev = this._previousCaptureProgress;
      const cur = this._captureProgress;
      const sampleSeconds = sampleTickDelta / TICK_RATE;
      const progressPerSecond = sampleSeconds > 0 ? progressDelta / sampleSeconds : 0;

      if (progressPerSecond > CAPTURE_PROGRESS_DELTA_EPSILON) {
        const prevRemainingSeconds = mod.Max(0, (1 - prev) / progressPerSecond);
        const curRemainingSeconds = mod.Max(0, (1 - cur) / progressPerSecond);
        const crossedLeadWindow =
          prevRemainingSeconds > CAPTURE_BUILDUP_LEAD_SECONDS &&
          curRemainingSeconds <= CAPTURE_BUILDUP_LEAD_SECONDS;

        if (crossedLeadWindow) {
          void playCaptureBuildupToCapturingTeamOnPoint(this, progressTeam);
        }
      }
    }

    if ((progressIncreased || progressDecreased) && !mod.Equals(progressTeam, teamNeutral)) {
      this.setUIProgressForPlayersOnPoint();
    }
  }

  getCaptureProgress(): number {
    return this._captureProgress;
  }

  getCapturingTeam(): mod.Team {
    return this._capturingTeam;
  }

  getCaptureProgressDirection(): -1 | 0 | 1 {
    return this._captureProgressDirection;
  }

  getDisplayCaptureProgress(currentTick: number = serverTickCount): number {
    const elapsedTicks = mod.Max(0, currentTick - this._lastCaptureProgressSampleTick);
    let displayProgress = this._captureProgress + elapsedTicks * this._displayProgressRatePerTick;

    if (this._displayProgressMotionMode > 0 && displayProgress < this._captureProgress) {
      displayProgress = this._captureProgress;
    } else if (this._displayProgressMotionMode < 0 && displayProgress > this._captureProgress) {
      displayProgress = this._captureProgress;
    }

    if (displayProgress < 0) return 0;
    if (displayProgress > 1) return 1;
    return displayProgress;
  }

  getProgressTeam(): mod.Team {
    return this._progressTeam;
  }

  getLastSampledPhase(): CapturePointPhase {
    return this._lastSampledPhase;
  }

  setLastSampledPhase(phase: CapturePointPhase): void {
    this._lastSampledPhase = phase;
  }

  getLastAnnouncedPhase(): CapturePointPhase | null {
    return this._lastAnnouncedPhase;
  }

  getLastAnnouncedOwner(): mod.Team {
    return this._lastAnnouncedOwner;
  }

  getLastAnnouncedProgressTeam(): mod.Team {
    return this._lastAnnouncedProgressTeam;
  }

  setAnnouncementState(phase: CapturePointPhase, owner: mod.Team, progressTeam: mod.Team): void {
    this._lastAnnouncedPhase = phase;
    this._lastAnnouncedOwner = owner;
    this._lastAnnouncedProgressTeam = progressTeam;
  }

  clearAnnouncementState(): void {
    this._lastAnnouncedPhase = null;
    this._lastAnnouncedOwner = teamNeutral;
    this._lastAnnouncedProgressTeam = teamNeutral;
  }

  getColor(team: mod.Team): mod.Vector {
    if (mod.Equals(team, this._owner)) return COLOR_FRIENDLY;
    if (mod.Equals(this._owner, teamNeutral)) return COLOR_NEUTRAL;
    return COLOR_ENEMY;
  }

  getColorRgb(team: mod.Team): RgbColor {
    if (mod.Equals(team, this._owner)) return COLOR_FRIENDLY_RGB;
    if (mod.Equals(this._owner, teamNeutral)) return COLOR_NEUTRAL_RGB;
    return COLOR_ENEMY_RGB;
  }

  updateUIforPlayersOnPoint(): void {
    this._onPoint.forEach((id) => {
      const p = serverPlayers.get(id);
      if (p) p.updateUIPlayersOnPoint();
    });
  }

  setUIProgressForPlayersOnPoint(): void {
    this._onPoint.forEach((id) => {
      const p = serverPlayers.get(id);
      if (p) p.updateUIProgress();
    });
  }
}

/* Capture points registry */
let serverCapturePoints: { [key: number]: CapturePoint } = {
  [CP_A_ID]: new CapturePoint(CP_A_ID, "A"),
  [CP_B_ID]: new CapturePoint(CP_B_ID, "B"),
  [CP_C_ID]: new CapturePoint(CP_C_ID, "C"),
};

// HQ routing is ownership-driven during live play and only recomputed when capture events mark it dirty.
let hqRoutingDirty: boolean = true;
let lastHqRoutingUpdateTick: number = -999999;
let liveRoutingCapturePointPositionsInitialized: boolean = false;
let liveRoutingCapturePointPositionsWarned: boolean = false;
let liveRoutingCapturePointIdValidationLogged: boolean = false;
let liveCapturePointThreatRadiusMeters: number = CAPTURE_POINT_THREAT_RADIUS_REFERENCE_RADIUS_METERS;


// Track whether each team has captured at least one flag this round.
// Used to keep initial HQ spawns until a team captures a flag for the first time.
let team1HasCapturedAnyFlag: boolean = false;
let team2HasCapturedAnyFlag: boolean = false;

function updateLiveActiveCaptureBarsSmoothly(): void {
  Object.values(serverCapturePoints).forEach((cp) => {
    if (cp.getPlayerIdsOnPoint().length <= 0) return;
    cp.setUIProgressForPlayersOnPoint();
  });
}

function arePlayerIdListsEqual(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (!b.includes(a[i])) return false;
  }
  return true;
}

function shouldKeepCapturePointAnnouncement(phase: CapturePointPhase): boolean {
  return phase === "capturing_neutral" || phase === "neutralizing_enemy";
}

type CapturePointStateSnapshot = {
  owner: mod.Team;
  progress: number;
  capturingTeam: mod.Team;
  progressTeam: mod.Team;
  contested: boolean;
  phase: CapturePointPhase;
  playerIds: number[];
};

function createCapturePointStateSnapshot(cp: CapturePoint): CapturePointStateSnapshot {
  return {
    owner: cp.getOwner(),
    progress: cp.getCaptureProgress(),
    capturingTeam: cp.getCapturingTeam(),
    progressTeam: cp.getProgressTeam(),
    contested: capturePointContested[cp.id] === true,
    phase: cp.getLastSampledPhase(),
    playerIds: cp.getPlayerIdsOnPoint().slice(),
  };
}

function didCapturePointPresenceChange(
  previousSnapshot: CapturePointStateSnapshot,
  nextSnapshot: CapturePointStateSnapshot
): boolean {
  return !arePlayerIdListsEqual(previousSnapshot.playerIds, nextSnapshot.playerIds);
}

function didCapturePointStateChange(
  previousSnapshot: CapturePointStateSnapshot,
  nextSnapshot: CapturePointStateSnapshot
): boolean {
  return (
    !mod.Equals(previousSnapshot.owner, nextSnapshot.owner) ||
    Math.abs(previousSnapshot.progress - nextSnapshot.progress) > CAPTURE_PROGRESS_DELTA_EPSILON ||
    !mod.Equals(previousSnapshot.capturingTeam, nextSnapshot.capturingTeam) ||
    !mod.Equals(previousSnapshot.progressTeam, nextSnapshot.progressTeam) ||
    previousSnapshot.contested !== nextSnapshot.contested ||
    previousSnapshot.phase !== nextSnapshot.phase
  );
}

function getCapturePointPlayerIdsFromEngine(
  cp: CapturePoint,
  eventCapturePoint?: mod.CapturePoint | null
): number[] {
  const playerIds: number[] = [];
  const playersOnPoint = mod.GetPlayersOnPoint(cp.resolveHandle(eventCapturePoint));

  for (let i = 0; i < mod.CountOf(playersOnPoint); i++) {
    const player = mod.ValueInArray(playersOnPoint, i) as mod.Player;
    if (!mod.IsPlayerValid(player)) continue;
    if (!kernelIsPlayerAlive(player)) continue;

    const playerId = modlib.getPlayerId(player);
    const playerState = serverPlayers.get(playerId);
    if (!playerState) continue;
    if (!playerState.isDeployed) continue;
    if (playerIds.includes(playerId)) continue;

    playerIds.push(playerId);
  }

  return playerIds;
}

function syncCapturePointPlayersOnPointFromEngine(
  cp: CapturePoint,
  eventCapturePoint?: mod.CapturePoint | null
): boolean {
  const previousPlayerIds = cp.getPlayerIdsOnPoint().slice();
  const nextPlayerIds = getCapturePointPlayerIdsFromEngine(cp, eventCapturePoint);

  cp.clearOnPoint();
  for (let i = 0; i < nextPlayerIds.length; i++) {
    cp.addOnPoint(nextPlayerIds[i]);
  }

  let removedAnyPlayer = false;
  for (let i = 0; i < previousPlayerIds.length; i++) {
    const previousPlayerId = previousPlayerIds[i];
    if (nextPlayerIds.includes(previousPlayerId)) continue;

    const playerState = serverPlayers.get(previousPlayerId);
    if (!playerState) continue;
    if (playerState.getCapturePoint() !== cp.id) continue;

    removedAnyPlayer = true;
    stopCaptureBuildupForPlayer(previousPlayerId);
    playerState.setCapturePoint(null);
    playerState.resetActiveCaptureProgressUi();
    if (playerState.activeFlagContainerWidget) mod.SetUIWidgetVisible(playerState.activeFlagContainerWidget, false);
    stopCaptureTickLoop(previousPlayerId);
  }

  if (removedAnyPlayer) {
    invalidateCaptureBuildupSessionForCp(cp.id);
  }

  for (let i = 0; i < nextPlayerIds.length; i++) {
    const nextPlayerId = nextPlayerIds[i];
    const playerState = serverPlayers.get(nextPlayerId);
    if (!playerState) continue;

    const oldPointId = playerState.getCapturePoint();
    if (oldPointId === null || oldPointId !== cp.id) {
      if (oldPointId !== null) invalidateCaptureBuildupSessionForCp(oldPointId);
      stopCaptureBuildupForPlayer(nextPlayerId);
      playerState.setCapturePoint(cp.id);
    }
  }

  return !arePlayerIdListsEqual(previousPlayerIds, nextPlayerIds);
}

function refreshCapturePointFromEngine(
  cp: CapturePoint,
  syncPlayersOnPoint: boolean = false,
  eventCapturePoint?: mod.CapturePoint | null
): void {
  const handle = cp.resolveHandle(eventCapturePoint);

  if (syncPlayersOnPoint) {
    syncCapturePointPlayersOnPointFromEngine(cp, handle);
  }

  cp.setOwner(mod.GetCurrentOwnerTeam(handle));
  cp.setCaptureProgress(handle);
  UpdateCapturePointContestedState(cp);
  const nextPhase = getCapturePointPhase(cp);
  cp.setLastSampledPhase(nextPhase);
  if (!shouldKeepCapturePointAnnouncement(nextPhase)) {
    cp.clearAnnouncementState();
  }

  if (syncPlayersOnPoint) {
    const playerIdsOnPoint = cp.getPlayerIdsOnPoint();
    for (let i = 0; i < playerIdsOnPoint.length; i++) {
      const playerState = serverPlayers.get(playerIdsOnPoint[i]);
      if (!playerState) continue;
      playerState.updateUIPlayersOnPoint();
      playerState.updateUIProgress();
    }
  }
}

function validateLiveRoutingCapturePointIds(): boolean {
  const idsValid = CP_A_ID === EXPECTED_ROUTING_CP_A_ID && CP_C_ID === EXPECTED_ROUTING_CP_C_ID;
  if (!liveRoutingCapturePointIdValidationLogged) {
    liveRoutingCapturePointIdValidationLogged = true;
    console.log("[HQ ROUTING] capture-point ids for live routing: A=" + String(CP_A_ID) + ", C=" + String(CP_C_ID));
    if (!idsValid) {
      LogRuntimeError(
        "RoutingCapturePointIds",
        "Expected routing capture-point ids A=" +
          String(EXPECTED_ROUTING_CP_A_ID) +
          " and C=" +
          String(EXPECTED_ROUTING_CP_C_ID) +
          " but found A=" +
          String(CP_A_ID) +
          " and C=" +
          String(CP_C_ID)
      );
    }
  }

  return idsValid;
}

function getCapturePointHorizontalDistanceMeters(a: mod.Vector, c: mod.Vector): number {
  const dx = mod.XComponentOf(a) - mod.XComponentOf(c);
  const dz = mod.ZComponentOf(a) - mod.ZComponentOf(c);
  return Math.sqrt(dx * dx + dz * dz);
}

function clampLiveCapturePointThreatRadiusMeters(radiusMeters: number): number {
  let minMeters: number = CAPTURE_POINT_THREAT_RADIUS_MIN_METERS;
  let maxMeters: number = CAPTURE_POINT_THREAT_RADIUS_MAX_METERS;
  if (minMeters > maxMeters) {
    const swap: number = minMeters;
    minMeters = maxMeters;
    maxMeters = swap;
  }

  let clamped = radiusMeters;
  if (!Number.isFinite(clamped)) clamped = CAPTURE_POINT_THREAT_RADIUS_REFERENCE_RADIUS_METERS;
  if (clamped < minMeters) clamped = minMeters;
  if (clamped > maxMeters) clamped = maxMeters;
  return clamped;
}

function resetLiveCapturePointThreatRadiusMeters(): void {
  liveCapturePointThreatRadiusMeters = CAPTURE_POINT_THREAT_RADIUS_REFERENCE_RADIUS_METERS;
}

function refreshLiveCapturePointThreatRadiusFromAcDistance(): void {
  resetLiveCapturePointThreatRadiusMeters();

  const cpA = serverCapturePoints[CP_A_ID];
  const cpC = serverCapturePoints[CP_C_ID];
  const aPosition = cpA?.getPosition() ?? null;
  const cPosition = cpC?.getPosition() ?? null;

  if (aPosition === null || cPosition === null) {
    console.log(
      "[HQ ROUTING] using reference threat radius " +
        CAPTURE_POINT_THREAT_RADIUS_REFERENCE_RADIUS_METERS.toFixed(2) +
        "m because A/C positions are unavailable"
    );
    return;
  }

  const referenceDistanceMeters = CAPTURE_POINT_THREAT_RADIUS_REFERENCE_DISTANCE_METERS;
  if (!Number.isFinite(referenceDistanceMeters) || referenceDistanceMeters <= 0) {
    console.log(
      "[HQ ROUTING] using reference threat radius " +
        CAPTURE_POINT_THREAT_RADIUS_REFERENCE_RADIUS_METERS.toFixed(2) +
        "m because the reference A-C distance is invalid"
    );
    return;
  }

  const acHorizontalDistanceMeters = getCapturePointHorizontalDistanceMeters(aPosition, cPosition);
  if (!Number.isFinite(acHorizontalDistanceMeters) || acHorizontalDistanceMeters <= 0) {
    console.log(
      "[HQ ROUTING] using reference threat radius " +
        CAPTURE_POINT_THREAT_RADIUS_REFERENCE_RADIUS_METERS.toFixed(2) +
        "m because the measured A-C horizontal distance is invalid"
    );
    return;
  }

  const rawRadiusMeters =
    acHorizontalDistanceMeters *
    (CAPTURE_POINT_THREAT_RADIUS_REFERENCE_RADIUS_METERS / referenceDistanceMeters);
  liveCapturePointThreatRadiusMeters = clampLiveCapturePointThreatRadiusMeters(rawRadiusMeters);

  console.log(
    "[HQ ROUTING] A-C horizontal distance=" +
      acHorizontalDistanceMeters.toFixed(2) +
      "m, raw threat radius=" +
      rawRadiusMeters.toFixed(2) +
      "m, applied threat radius=" +
      liveCapturePointThreatRadiusMeters.toFixed(2) +
      "m"
  );
}

function clearLiveRoutingCapturePointPositions(): void {
  const routingCapturePoints = [
    serverCapturePoints[CP_A_ID],
    serverCapturePoints[CP_B_ID],
    serverCapturePoints[CP_C_ID],
  ];

  for (let i = 0; i < routingCapturePoints.length; i++) {
    const cp = routingCapturePoints[i];
    if (!cp) continue;
    cp.clearPosition();
  }

  liveRoutingCapturePointPositionsInitialized = false;
  liveRoutingCapturePointPositionsWarned = false;
  resetLiveCapturePointThreatRadiusMeters();
}

function initializeLiveRoutingCapturePointPositions(): boolean {
  clearLiveRoutingCapturePointPositions();
  if (!validateLiveRoutingCapturePointIds()) return false;

  const routingCapturePoints = [
    serverCapturePoints[CP_A_ID],
    serverCapturePoints[CP_B_ID],
    serverCapturePoints[CP_C_ID],
  ];
  const missingPositionIds: number[] = [];

  for (let i = 0; i < routingCapturePoints.length; i++) {
    const cp = routingCapturePoints[i];
    if (!cp) {
      missingPositionIds.push(i === 0 ? CP_A_ID : i === 1 ? CP_B_ID : CP_C_ID);
      continue;
    }

    cp.refreshPosition();
    if (cp.getPosition() === null) missingPositionIds.push(cp.id);
  }

  if (missingPositionIds.length > 0) {
    LogRuntimeError(
      "LiveRoutingCapturePointPositions",
      "Unable to sample live routing capture-point positions for ids: " +
        missingPositionIds.join(", ") +
        "; using reference threat radius " +
        CAPTURE_POINT_THREAT_RADIUS_REFERENCE_RADIUS_METERS.toFixed(2) +
        "m"
    );
    return false;
  }

  liveRoutingCapturePointPositionsInitialized = true;
  liveRoutingCapturePointPositionsWarned = false;
  refreshLiveCapturePointThreatRadiusFromAcDistance();
  console.log(
    "[HQ ROUTING] live capture-point positions initialized for ids A=" +
      String(CP_A_ID) +
      ", B=" +
      String(CP_B_ID) +
      ", C=" +
      String(CP_C_ID)
  );
  return true;
}

function warnLiveRoutingPositionsUnavailableOnce(): void {
  if (liveRoutingCapturePointPositionsWarned) return;
  liveRoutingCapturePointPositionsWarned = true;
  console.log("[HQ ROUTING] live routing positions unavailable; preserving current HQ selection");
}

/* =================================================================================================
   8) INPUT / DAMAGE RESTRICTIONS (PHASE-BASED)
================================================================================================= */

function applyPhaseInputRestrictionsForPlayer(player: mod.Player): void {
  if (!mod.IsPlayerValid(player)) return;
  if (isExcludedPlayer(player)) {
    mod.EnableAllInputRestrictions(player, false);
    return;
  }

  const isPrematch = gameStatus === 0;
  const isRedeployCountdown = gameStatus === 1;
  const isPreLive = gameStatus === 2;
  const isLive = gameStatus >= 3;

  if (isLive) {
    mod.EnableAllInputRestrictions(player, false);
    
    return;
  }

  

  if (isPrematch) {
    mod.EnableAllInputRestrictions(player, false);
    mod.EnableInputRestriction(player, mod.RestrictedInputs.Interact, false);
    return;
  }

  if (isRedeployCountdown) {
    mod.EnableAllInputRestrictions(player, false);
    mod.EnableInputRestriction(player, mod.RestrictedInputs.FireWeapon, true);
    mod.EnableInputRestriction(player, mod.RestrictedInputs.Interact, true);
    return;
  }

  if (isPreLive) {
    mod.EnableAllInputRestrictions(player, true);
    mod.EnableInputRestriction(player, mod.RestrictedInputs.CameraPitch, false);
    mod.EnableInputRestriction(player, mod.RestrictedInputs.CameraYaw, false);
    return;
  }
}

/* Utility wrapper (keeps old call sites readable) */
function setReadyPhaseProtectionForPlayer(player: mod.Player, enabled: boolean): void {
  if (!enabled) {
    mod.EnableAllInputRestrictions(player, false);
    
    return;
  }
  applyPhaseInputRestrictionsForPlayer(player);
}

function setPlayerMaxHealthAndRefill(player: mod.Player, maxHealth: number): void {
  if (!mod.IsPlayerValid(player)) return;

  try {
    mod.SetPlayerMaxHealth(player, maxHealth);
  } catch (_errSetMax) {}

  try {
    mod.Heal(player, PREMATCH_HEALTH_FULL_HEAL_AMOUNT);
  } catch (_errHeal) {}
}

function clearPrematch889StateForPlayer(playerId: number): void {
  delete prematchHealthInside889ByPlayerId[playerId];
  delete prematchHealthAppliedMaxByPlayerId[playerId];
}

function isPrematchOutside889(playerId: number): boolean {
  if (gameStatus !== 0) return false;

  const sp = serverPlayers.get(playerId);
  if (!sp) return false;
  if (!mod.IsPlayerValid(sp.player)) return false;

  return prematchHealthInside889ByPlayerId[playerId] !== true;
}

function forcePrematchOutside889FullHeal(player: mod.Player, playerId: number): void {
  if (!mod.IsPlayerValid(player)) return;
  if (!isPrematchOutside889(playerId)) return;

  try {
    mod.Heal(player, PREMATCH_HEALTH_FULL_HEAL_AMOUNT);
  } catch (_err) {}
}

// Prematch 889 health mapping:
// - inside 889: normal max health
// - outside 889: outside max health policy
function applyPrematch889HealthForPlayer(playerId: number): void {
  const sp = serverPlayers.get(playerId);
  if (!sp) return;
  if (!mod.IsPlayerValid(sp.player)) return;
  if (isExcludedPlayer(sp.player)) return;

  const desiredMax =
    gameStatus === 0
      ? prematchHealthInside889ByPlayerId[playerId] === true
        ? PREMATCH_HEALTH_NORMAL_MAX
        : PREMATCH_HEALTH_OUTSIDE_MAX
      : PREMATCH_HEALTH_NORMAL_MAX;

  if (prematchHealthAppliedMaxByPlayerId[playerId] !== desiredMax) {
    setPlayerMaxHealthAndRefill(sp.player, desiredMax);
    prematchHealthAppliedMaxByPlayerId[playerId] = desiredMax;
    return;
  }

  // Outside 889 in prematch must always be topped off, even when max-health value is unchanged.
  if (isPrematchOutside889(playerId)) {
    forcePrematchOutside889FullHeal(sp.player, playerId);
  }
}

function applyPrematch889HealthForAllPlayers(): void {
  serverPlayers.forEach((p) => {
    if (isExcludedPlayer(p.player)) return;
    applyPrematch889HealthForPlayer(p.id);
  });
}

function normalizeAllPlayersToStandardHealthAndClearPrematch889State(): void {
  serverPlayers.forEach((p) => {
    if (isExcludedPlayer(p.player)) {
      clearPrematch889StateForPlayer(p.id);
      return;
    }

    if (!mod.IsPlayerValid(p.player)) {
      clearPrematch889StateForPlayer(p.id);
      return;
    }

    setPlayerMaxHealthAndRefill(p.player, PREMATCH_HEALTH_NORMAL_MAX);
    clearPrematch889StateForPlayer(p.id);
  });
}

/* Prematch team switch helper */
function switchTeamPrematchAndRedeploy(player: mod.Player, newTeam: mod.Team): void {
  mod.UndeployPlayer(player);
  mod.SetTeam(player, newTeam);
  mod.SetRedeployTime(player, 0);
}

function forceAutoDeployToInitialHqDuringCountdown(): void {
  // During the redeploy/countdown (and any pre-live phase), keep players from getting stuck on the tablet.
  // Force-spawn them directly onto their team's initial HQ spawn.
  if (gameStatus !== 1 && gameStatus !== 2) return;

  serverPlayers.forEach((sp) => {
    if (!sp) return;
    if (sp.isDeployed) return;
    if (!mod.IsPlayerValid(sp.player)) return;
    if (!isParticipantPlayer(sp.player)) return;

    const spawnerObjId = getInitialSpawnPointObjIdForTeam(mod.GetTeam(sp.player));
    if (!spawnerObjId) return;

    mod.SetRedeployTime(sp.player, 0);
    mod.SpawnPlayerFromSpawnPoint(sp.player, spawnerObjId);
  });
}

type PreliveSpawnSector = (typeof KOTH_SPAWNS.regions)[number]["sectors"][number];

const PRELIVE_INITIAL_SPAWN_OBJECTIVE_LETTER = "A";

let preliveClusterTeleportIndexByTeamId: { [teamId: number]: number } = {};
let preliveTeleportWarnedMissingAnchorById: { [anchorObjectId: number]: boolean } = {};

function resetPreliveClusterTeleportState(): void {
  preliveClusterTeleportIndexByTeamId = {};
  preliveTeleportWarnedMissingAnchorById = {};
}

function getPreliveSectorForTeam(team: mod.Team): PreliveSpawnSector | undefined {
  const teamId = modlib.getTeamId(team);
  const teamSide = teamId === 1 ? "west" : teamId === 2 ? "east" : "";
  if (teamSide === "") return undefined;

  for (let i = 0; i < KOTH_SPAWNS.regions.length; i++) {
    const region = KOTH_SPAWNS.regions[i];
    if (region.objectiveLetter !== PRELIVE_INITIAL_SPAWN_OBJECTIVE_LETTER) continue;

    for (let j = 0; j < region.sectors.length; j++) {
      const sector = region.sectors[j];
      if (sector.teamSide === teamSide && sector.variantSide === "north") return sector;
    }

    for (let j = 0; j < region.sectors.length; j++) {
      const sector = region.sectors[j];
      if (sector.teamSide === teamSide) return sector;
    }
  }

  return undefined;
}

function warnPreliveTeleportMissingAnchorOnce(anchorObjectId: number): void {
  if (preliveTeleportWarnedMissingAnchorById[anchorObjectId] === true) return;
  preliveTeleportWarnedMissingAnchorById[anchorObjectId] = true;

  mod.DisplayHighlightedWorldLogMessage(
    mod.Message("[PRELIVE TELEPORT] missing cluster anchor {}", anchorObjectId)
  );
}

function getPreliveObjectivePosition(): mod.Vector | null {
  for (let i = 0; i < KOTH_HILLS.length; i++) {
    const hill = KOTH_HILLS[i];
    if (hill.letter !== PRELIVE_INITIAL_SPAWN_OBJECTIVE_LETTER) continue;

    const capturePointIds = [
      hill.neutralCapturePointId,
      hill.team1CapturePointId,
      hill.team2CapturePointId,
      CP_A_ID,
    ];
    const triedIds: { [capturePointId: number]: boolean } = {};

    for (let j = 0; j < capturePointIds.length; j++) {
      const capturePointId = capturePointIds[j];
      if (triedIds[capturePointId] === true) continue;
      triedIds[capturePointId] = true;

      try {
        return mod.GetObjectPosition(mod.GetCapturePoint(capturePointId));
      } catch (_err) {}
    }
  }

  try {
    return mod.GetObjectPosition(mod.GetCapturePoint(CP_A_ID));
  } catch (_err) {
    return null;
  }
}

function yawTowardPreliveObjective(fromPosition: mod.Vector): number {
  const objectivePosition = getPreliveObjectivePosition();
  if (!objectivePosition) return 0;

  const deltaX = mod.XComponentOf(objectivePosition) - mod.XComponentOf(fromPosition);
  const deltaZ = mod.ZComponentOf(objectivePosition) - mod.ZComponentOf(fromPosition);
  return Math.atan2(deltaX, deltaZ);
}

function resolvePreliveClusterAnchorDestination(
  anchorObjectId: number
): { position: mod.Vector; orientationRadians: number } | null {
  let spatialObject: mod.SpatialObject;
  let position: mod.Vector;

  try {
    spatialObject = mod.GetSpatialObject(anchorObjectId);
    position = mod.GetObjectPosition(spatialObject);
  } catch (err) {
    warnPreliveTeleportMissingAnchorOnce(anchorObjectId);
    LogRuntimeError("PreliveTeleport/ResolveAnchor/" + String(anchorObjectId), err);
    return null;
  }

  return {
    position: position,
    orientationRadians: yawTowardPreliveObjective(position),
  };
}

function teleportPlayerToPreliveClusterAnchor(sp: Player): void {
  if (!sp) return;
  if (!mod.IsPlayerValid(sp.player)) return;
  if (!isParticipantPlayer(sp.player)) return;
  if (!sp.isDeployed) return;
  if (!kernelIsPlayerAliveSafe(sp.player)) return;

  const team = mod.GetTeam(sp.player);
  const teamId = modlib.getTeamId(team);
  const sector = getPreliveSectorForTeam(team);
  if (!sector || sector.anchorObjectIds.length <= 0) return;

  const startIndex = preliveClusterTeleportIndexByTeamId[teamId] ?? 0;
  for (let offset = 0; offset < sector.anchorObjectIds.length; offset++) {
    const index = (startIndex + offset) % sector.anchorObjectIds.length;
    const anchorObjectId = sector.anchorObjectIds[index];
    const destination = resolvePreliveClusterAnchorDestination(anchorObjectId);
    if (!destination) continue;

    preliveClusterTeleportIndexByTeamId[teamId] = (index + 1) % sector.anchorObjectIds.length;

    try {
      mod.Teleport(sp.player, destination.position, destination.orientationRadians);
      invalidateLivePlayerSpatialHash();
    } catch (err) {
      LogRuntimeError("PreliveTeleport/Teleport/" + String(sp.id), err);
    }
    return;
  }
}

function teleportAliveParticipantsToPreliveClusterAnchors(): void {
  serverPlayers.forEach((sp) => teleportPlayerToPreliveClusterAnchor(sp));
}


/* Prematch loadout stripping (MELEE ONLY) */
const READYUP_REMOVE_SLOTS: mod.InventorySlots[] = [
  mod.InventorySlots.PrimaryWeapon,
  mod.InventorySlots.SecondaryWeapon,
  mod.InventorySlots.Throwable,
  mod.InventorySlots.ClassGadget,
  mod.InventorySlots.GadgetOne,
  mod.InventorySlots.GadgetTwo,
  mod.InventorySlots.MiscGadget,
  // IMPORTANT: do NOT remove mod.InventorySlots.MeleeWeapon
];

function stripLoadoutToMeleeOnly(player: mod.Player): void {
  for (let i = 0; i < READYUP_REMOVE_SLOTS.length; i++) {
    mod.RemoveEquipment(player, READYUP_REMOVE_SLOTS[i]);
  }
}

/* Bot backfill detection (Portal setting: bot backfill counts as AI soldiers). 
   We must exclude AI soldiers from Ready Up requirements. */
function isBotBackfillPlayer(player: mod.Player): boolean {
  return mod.GetSoldierState(player, mod.SoldierStateBool.IsAISoldier);
}


/* =================================================================================================
   9) HQ ENABLE/DISABLE + ROUTING LOGIC
================================================================================================= */

function validateReservedSpawnIsolationFromConfigOnce(): void {
  if (reservedSpawnIsolationValidated) return;
  reservedSpawnIsolationValidated = true;

  if (RESERVED_SPAWN_POINT_ID <= 0) return;

  const collisions: string[] = [];
  const hqEntries: Array<[string, number]> = [
    ["team1Initial", TEAM1_INITIAL_HQ],
    ["team2Initial", TEAM2_INITIAL_HQ],
    ["team1Readyup", TEAM1_READYUP_HQ],
    ["team2Readyup", TEAM2_READYUP_HQ],
    ["team1Live", TEAM1_LIVE_HQ],
    ["team2Live", TEAM2_LIVE_HQ],
    ["team1A", TEAM1_FLAG_A_HQ],
    ["team1B", TEAM1_FLAG_B_HQ],
    ["team1C", TEAM1_FLAG_C_HQ],
    ["team2A", TEAM2_FLAG_A_HQ],
    ["team2B", TEAM2_FLAG_B_HQ],
    ["team2C", TEAM2_FLAG_C_HQ],
    ["team1AB", TEAM1_AB_HQ],
    ["team1AC", TEAM1_AC_HQ],
    ["team1BC", TEAM1_BC_HQ],
    ["team2AB", TEAM2_AB_HQ],
    ["team2AC", TEAM2_AC_HQ],
    ["team2BC", TEAM2_BC_HQ],
    ["team1ABC", TEAM1_ABC_HQ],
    ["team2ABC", TEAM2_ABC_HQ],
    ["team1NO", TEAM1_NO_FLAG_HQ],
    ["team2NO", TEAM2_NO_FLAG_HQ],
  ];

  for (let i = 0; i < hqEntries.length; i++) {
    if (hqEntries[i][1] === RESERVED_SPAWN_POINT_ID) {
      collisions.push("hq." + hqEntries[i][0]);
    }
  }

  const routeKeys: DynamicRouteKey[] = ["A", "B", "C", "AB", "AC", "BC", "ABC", "NO"];

  for (let i = 0; i < routeKeys.length; i++) {
    const routeKey = routeKeys[i];
    const team1RouteSpawners = TEAM1_SPAWNERS_BY_ROUTE[routeKey];
    const team2RouteSpawners = TEAM2_SPAWNERS_BY_ROUTE[routeKey];

    if (team1RouteSpawners.indexOf(RESERVED_SPAWN_POINT_ID) >= 0) {
      collisions.push("dynamic.team1." + routeKey);
    }

    if (team2RouteSpawners.indexOf(RESERVED_SPAWN_POINT_ID) >= 0) {
      collisions.push("dynamic.team2." + routeKey);
    }
  }

  if (collisions.length <= 0) return;

  const collisionSummary = collisions.join(", ");
  LogRuntimeError(
    "ReservedSpawnIsolation",
    "reserved spawn id " + String(RESERVED_SPAWN_POINT_ID) + " collides with: " + collisionSummary
  );
  mod.DisplayHighlightedWorldLogMessage(
    mod.Message("[RESERVED SPAWN] id {} collides with {}", RESERVED_SPAWN_POINT_ID, collisionSummary)
  );
}
function warnPrematchHqMapValidationOnce(key: string, message: any): void {
  if (prematchHqMapValidationWarnedByKey[key] === true) return;
  prematchHqMapValidationWarnedByKey[key] = true;
  mod.DisplayHighlightedWorldLogMessage(message);
}

function tryResolveHqObjIdFromMapData(hqId: number): number {
  try {
    const hq = mod.GetHQ(hqId);
    return getObjIdSafe(hq);
  } catch (_err) {
    return -1;
  }
}

function validatePrematchReadyupHqsFromMapData(): void {
  const configuredTeam1HqId: number = Number(TEAM1_READYUP_HQ);
  const configuredTeam2HqId: number = Number(TEAM2_READYUP_HQ);

  const team1ObjId = tryResolveHqObjIdFromMapData(configuredTeam1HqId);
  const team2ObjId = tryResolveHqObjIdFromMapData(configuredTeam2HqId);

  let valid = true;
  let reason = "ok";

  if (configuredTeam1HqId === configuredTeam2HqId) {
    valid = false;
    reason = "same_configured_id";
  } else if (team1ObjId < 0 && team2ObjId < 0) {
    valid = false;
    reason = "missing_both";
  } else if (team1ObjId < 0) {
    valid = false;
    reason = "missing_team1";
  } else if (team2ObjId < 0) {
    valid = false;
    reason = "missing_team2";
  } else if (team1ObjId === team2ObjId) {
    valid = false;
    reason = "same_objid";
  }

  if (valid) {
    resolvedPrematchHqTeam1Id = configuredTeam1HqId;
    resolvedPrematchHqTeam2Id = configuredTeam2HqId;
    prematchHqFallbackActive = false;
  } else {
    resolvedPrematchHqTeam1Id = TEAM1_INITIAL_HQ;
    resolvedPrematchHqTeam2Id = TEAM2_INITIAL_HQ;
    prematchHqFallbackActive = true;
  }

  const diag = "cfg=" +
    String(configuredTeam1HqId) +
    "/" +
    String(configuredTeam2HqId) +
    " obj=" +
    String(team1ObjId) +
    "/" +
    String(team2ObjId) +
    " valid=" +
    (valid ? "1" : "0") +
    " reason=" +
    reason +
    " targets=" +
    String(resolvedPrematchHqTeam1Id) +
    "/" +
    String(resolvedPrematchHqTeam2Id);

  const key = "prematch_hq_map/" + diag;
  warnPrematchHqMapValidationOnce(
    key,
    mod.Message("[PREMATCH HQ MAP] {}", diag)
  );
}

function enforceReadyupHqsDisabledOutsidePrematch(_source: string): void {
  if (gameStatus === 0) return;
  SafeEnableHQById(TEAM1_READYUP_HQ, false);
  SafeEnableHQById(TEAM2_READYUP_HQ, false);
}

function warnSafeEnableHqOnce(hqId: number, enabled: boolean, reason: string): void {
  if (hqEnableWarnedById[hqId] === true) return;
  hqEnableWarnedById[hqId] = true;
  mod.DisplayHighlightedWorldLogMessage(
    mod.Message("[HQ SAFE ENABLE] HQ {} toggle {} failed ({})", hqId, enabled ? "on" : "off", reason)
  );
}

function SafeEnableHQById(hqId: number, enabled: boolean): void {
  try {
    mod.EnableHQ(mod.GetHQ(hqId), enabled);
  } catch (err) {
    warnSafeEnableHqOnce(hqId, enabled, String(err));
    LogRuntimeError("SafeEnableHQById/" + String(hqId), err);
  }
}

function DisableAllDynamicHQsAndLiveHQs(): void {
  const idsToDisable: number[] = [
    TEAM1_READYUP_HQ, TEAM2_READYUP_HQ,

    TEAM1_LIVE_HQ, TEAM2_LIVE_HQ,

    TEAM1_FLAG_A_HQ, TEAM1_FLAG_B_HQ, TEAM1_FLAG_C_HQ,
    TEAM2_FLAG_A_HQ, TEAM2_FLAG_B_HQ, TEAM2_FLAG_C_HQ,

    TEAM1_AB_HQ, TEAM1_AC_HQ, TEAM1_BC_HQ,
    TEAM2_AB_HQ, TEAM2_AC_HQ, TEAM2_BC_HQ,

    TEAM1_ABC_HQ, TEAM2_ABC_HQ,

    TEAM1_NO_FLAG_HQ, TEAM2_NO_FLAG_HQ,
  ];

  idsToDisable.forEach((id) => SafeEnableHQById(id, false));
}

function EnableOnlyInitialHQs(): void {
  SafeEnableHQById(TEAM1_INITIAL_HQ, true);
  SafeEnableHQById(TEAM2_INITIAL_HQ, true);
}

function EnableLiveBaseHQs(): void {
  SafeEnableHQById(TEAM1_INITIAL_HQ, true);
  SafeEnableHQById(TEAM2_INITIAL_HQ, true);
  SafeEnableHQById(TEAM1_LIVE_HQ, true);
  SafeEnableHQById(TEAM2_LIVE_HQ, true);
}

function ConfigureLiveSpawns(): void {
  DisableAllDynamicHQsAndLiveHQs();
  EnableLiveBaseHQs();
  enforceReadyupHqsDisabledOutsidePrematch("ConfigureLiveSpawns");
  currentDynamicHqTeam1 = TEAM1_INITIAL_HQ;
  currentDynamicHqTeam2 = TEAM2_INITIAL_HQ;
}

function ConfigurePreMatchSpawns(): void {
  validatePrematchReadyupHqsFromMapData();
  DisableAllDynamicHQsAndLiveHQs();

  if (prematchHqFallbackActive) {
    SafeEnableHQById(TEAM1_READYUP_HQ, false);
    SafeEnableHQById(TEAM2_READYUP_HQ, false);
    SafeEnableHQById(TEAM1_INITIAL_HQ, true);
    SafeEnableHQById(TEAM2_INITIAL_HQ, true);
    return;
  }

  SafeEnableHQById(TEAM1_INITIAL_HQ, false);
  SafeEnableHQById(TEAM2_INITIAL_HQ, false);

  SafeEnableHQById(resolvedPrematchHqTeam1Id, true);
  SafeEnableHQById(resolvedPrematchHqTeam2Id, true);
}


/*
  Updates which HQ is enabled for each team in live phase.
  Priority:
    - Before first capture this round, keep initial HQ.
    - After first capture, choose a single ownership-driven live route from A/B/C only.
    - If current ownership route is B under direct pressure, evict to least-pressure flank (A/C).
    - If team owns 0 flags after having captured at least one, fallback to least-pressure flank (A/C).
    - Keep A/C flank ties sticky by team (fallback to A when no prior flank exists).
*/
function UpdateFlagHQSpawns(): void {
  if (gameStatus !== 3) return;
  if (!liveRoutingCapturePointPositionsInitialized) {
    warnLiveRoutingPositionsUnavailableOnce();
    return;
  }

  const ownerA = serverCapturePoints[CP_A_ID].getOwner();
  const ownerB = serverCapturePoints[CP_B_ID].getOwner();
  const ownerC = serverCapturePoints[CP_C_ID].getOwner();

  const t1OwnA = mod.Equals(ownerA, team1);
  const t1OwnB = mod.Equals(ownerB, team1);
  const t1OwnC = mod.Equals(ownerC, team1);
  const t1Count = (t1OwnA ? 1 : 0) + (t1OwnB ? 1 : 0) + (t1OwnC ? 1 : 0);

  const t2OwnA = mod.Equals(ownerA, team2);
  const t2OwnB = mod.Equals(ownerB, team2);
  const t2OwnC = mod.Equals(ownerC, team2);
  const t2Count = (t2OwnA ? 1 : 0) + (t2OwnB ? 1 : 0) + (t2OwnC ? 1 : 0);

  if (t1Count > 0) team1HasCapturedAnyFlag = true;
  if (t2Count > 0) team2HasCapturedAnyFlag = true;

  const chosenT1 = chooseLiveDynamicHqForTeam(team1, team1HasCapturedAnyFlag);
  const chosenT2 = chooseLiveDynamicHqForTeam(team2, team2HasCapturedAnyFlag);

  if (chosenT1 === currentDynamicHqTeam1 && chosenT2 === currentDynamicHqTeam2) {
    return;
  }

  const t1SingleHQs = [TEAM1_FLAG_A_HQ, TEAM1_FLAG_B_HQ, TEAM1_FLAG_C_HQ];
  const t1ComboHQs = [TEAM1_AB_HQ, TEAM1_AC_HQ, TEAM1_BC_HQ, TEAM1_ABC_HQ];
  const t1AllSpecialHQs = t1SingleHQs.concat(t1ComboHQs).concat([TEAM1_NO_FLAG_HQ]);

  const t2SingleHQs = [TEAM2_FLAG_A_HQ, TEAM2_FLAG_B_HQ, TEAM2_FLAG_C_HQ];
  const t2ComboHQs = [TEAM2_AB_HQ, TEAM2_AC_HQ, TEAM2_BC_HQ, TEAM2_ABC_HQ];
  const t2AllSpecialHQs = t2SingleHQs.concat(t2ComboHQs).concat([TEAM2_NO_FLAG_HQ]);

  t1AllSpecialHQs.forEach((id) => mod.EnableHQ(mod.GetHQ(id), false));
  t2AllSpecialHQs.forEach((id) => mod.EnableHQ(mod.GetHQ(id), false));

  // Disable initial HQs by default; we will enable them only when selected.
  mod.EnableHQ(mod.GetHQ(TEAM1_INITIAL_HQ), false);
  mod.EnableHQ(mod.GetHQ(TEAM2_INITIAL_HQ), false);

  mod.EnableHQ(mod.GetHQ(chosenT1), true);
  mod.EnableHQ(mod.GetHQ(chosenT2), true);

  currentDynamicHqTeam1 = chosenT1;
  currentDynamicHqTeam2 = chosenT2;
}

/* =================================================================================================
   10) TICKETS / BLEED / SCOREBOARD
================================================================================================= */





function UpdateScoreboard(): void {
  serverPlayers.forEach((p) => p.updateScoreboard());
}

function PlayCaptureContestedAudio(cp: CapturePoint): void {
  const owner = cp.getOwner();
  const playerIds = cp.getPlayerIdsOnPoint();

  for (let i = 0; i < playerIds.length; i++) {
    const playerId = playerIds[i];
    const p = serverPlayers.get(playerId);
    if (!p) continue;

    const playerTeam = mod.GetTeam(p.player);

    if (!mod.Equals(owner, teamNeutral) && mod.Equals(playerTeam, owner)) {
      playVOToPlayer(p.player, mod.VoiceOverEvents2D.ObjectiveContested, voflags[cp.symbol]);
    }
  }
}

function UpdateCapturePointContestedState(cp: CapturePoint): void {
  const onPoint = cp.getOnPoint();
  const contestedNow = onPoint[0] > 0 && onPoint[1] > 0;

  const cpId = cp.id;
  const wasContested = capturePointContested[cpId] === true;

  if (contestedNow && !wasContested) {
    PlayCaptureContestedAudio(cp);
  }

  capturePointContested[cpId] = contestedNow;

  const activeBuildupTeam = captureBuildupTeamByCpId[cpId];
  if (!activeBuildupTeam) return;

  const progressTeam = cp.getProgressTeam();
  if (contestedNow || mod.Equals(progressTeam, teamNeutral) || !mod.Equals(activeBuildupTeam, progressTeam)) {
    invalidateCaptureBuildupSessionForCp(cpId);
  }
}

function getMajorityTeamOnPoint(cp: CapturePoint): mod.Team {
  const onPoint = cp.getOnPoint();
  if (onPoint[0] > onPoint[1]) return team1;
  if (onPoint[1] > onPoint[0]) return team2;
  return teamNeutral;
}

type CapturePointPhase =
  | "neutral_idle"
  | "capturing_neutral"
  | "neutralizing_enemy"
  | "rebuilding_owner"
  | "contested"
  | "owned_idle";

function isCapturePointProgressInBand(cp: CapturePoint): boolean {
  const progress = cp.getCaptureProgress();
  return progress > PROGRESS_EMPTY && progress < PROGRESS_FULL;
}

function getCapturePointPhase(cp: CapturePoint): CapturePointPhase {
  const owner = cp.getOwner();
  const progressTeam = cp.getProgressTeam();
  const contested = capturePointContested[cp.id] === true;

  if (contested) return "contested";
  if (!isCapturePointProgressInBand(cp) || mod.Equals(progressTeam, teamNeutral)) {
    return mod.Equals(owner, teamNeutral) ? "neutral_idle" : "owned_idle";
  }
  if (mod.Equals(owner, teamNeutral)) return "capturing_neutral";
  if (mod.Equals(progressTeam, owner)) return "rebuilding_owner";
  return "neutralizing_enemy";
}

/* =================================================================================================
   12) PHASE INITIALIZATION
================================================================================================= */
function ResetRoundGameplayState(): void {
  // Reset tickets immediately so any UI that reads serverScores starts clean.
  serverScores = [INITIAL_TICKETS, INITIAL_TICKETS];
  syncDisplayedGameModeScores(true);
  markLiveHudScoresDirty();
  markScoreboardDirty();
  markCaptureTickLoopsDirty();
  markEndgameSuspenseDirty();

  // Clear per-round caches related to capture audio and capture buildup state.
  capturePointContested = {};
  lastContestSfxTickByCp = {};
  lastCaptureSfxTickByCp = {};
  lastJoinSfxTickByCp = {};
  lastEnterPointSfxTickByPlayerId = {};
  resetAllCaptureBuildupState(true);
  lastLiveFlankRouteByTeamId = {};
  clearLiveRoutingCapturePointPositions();
  hqRoutingDirty = true;
  lastHqRoutingUpdateTick = -999999;

  // Reset each capturepoint in our wrapper/UI state only.
  // Engine-facing bootstrap happens in InitializePreLive after objectives are enabled.
  Object.values(serverCapturePoints).forEach((cp) => {
    // Clear wrapper state (we can safely overwrite via (cp as any) to avoid editing the class)
    (cp as any)._owner = teamNeutral;
    (cp as any)._capturingTeam = teamNeutral;
    (cp as any)._progressTeam = teamNeutral;
    (cp as any)._captureProgress = 0;
    (cp as any)._previousCaptureProgress = 0;
    (cp as any)._captureProgressDirection = 0;
    (cp as any)._lastCaptureProgressSampleTick = serverTickCount;
    (cp as any)._displayProgressRatePerTick = 0;
    (cp as any)._displayProgressMotionMode = 0;
    (cp as any)._onPoint = [];
    (cp as any)._position = null;
    (cp as any)._lastSampledPhase = "neutral_idle";
    cp.clearAnnouncementState();
  });

  // Clear all players capturepoint refs and hide the capture widget container
  serverPlayers.forEach((p) => {
    p.setCapturePoint(null);
    p.resetActiveCaptureProgressUi();
    if (p.activeFlagContainerWidget) mod.SetUIWidgetVisible(p.activeFlagContainerWidget, false);
  });

  // Reset the match timer baseline (your custom timer uses phaseTickCount + ROUND_TIME)
  phaseTickCount = 0;
  markLiveHudTopFlagsDirtyAll();
  syncLiveHudTopFlagBlinkTimer();
}

function describeTeamForCapturePointDiagnostics(team: mod.Team): string {
  if (mod.Equals(team, teamNeutral)) return "Neutral";
  if (mod.Equals(team, team1)) return "Team1";
  if (mod.Equals(team, team2)) return "Team2";
  return "Unknown";
}

function warnCapturePointBootstrapContractOnce(
  cp: CapturePoint,
  owner: mod.Team,
  progress: number,
  progressTeam: mod.Team,
  previousOwner: mod.Team
): void {
  if (capturePointBootstrapContractWarnedById[cp.id] === true) return;
  capturePointBootstrapContractWarnedById[cp.id] = true;

  const summary =
    cp.symbol +
    "/" +
    String(cp.id) +
    " owner=" +
    describeTeamForCapturePointDiagnostics(owner) +
    " progress=" +
    progress.toFixed(3) +
    " progressTeam=" +
    describeTeamForCapturePointDiagnostics(progressTeam) +
    " prevOwner=" +
    describeTeamForCapturePointDiagnostics(previousOwner);

  mod.DisplayHighlightedWorldLogMessage(
    mod.Message("[KOTH LEGACY CAPTURE CONTRACT] {} is not neutral at bootstrap", cp.symbol + "/" + String(cp.id))
  );
  console.log(
    "[KOTH LEGACY CAPTURE CONTRACT] " +
      summary +
      " ; legacy capture points must be authored with InitialOwner=TeamNeutral and zero capture progress"
  );
}

function validateCapturePointNeutralBootstrap(cp: CapturePoint, eventCapturePoint?: mod.CapturePoint | null): boolean {
  const handle = cp.resolveHandle(eventCapturePoint);
  const owner = cp.getOwner();
  const progress = cp.getCaptureProgress();
  const progressTeam = cp.getProgressTeam();
  const previousOwner = mod.GetPreviousOwnerTeam(handle);

  const ownerNeutral = mod.Equals(owner, teamNeutral);
  const progressNeutral = progress <= PROGRESS_EMPTY;
  const progressTeamNeutral = mod.Equals(progressTeam, teamNeutral);

  if (ownerNeutral && progressNeutral && progressTeamNeutral) return true;

  warnCapturePointBootstrapContractOnce(cp, owner, progress, progressTeam, previousOwner);
  return false;
}

function bootstrapCapturePointsForRoundStart(): void {
  Object.values(serverCapturePoints).forEach((cp) => {
    const handle = cp.resolveHandle();
    cp.applyCaptureSettings(handle);
    cp.setObjectiveEnabled(true, handle);
    refreshCapturePointFromEngine(cp, false, handle);
    validateCapturePointNeutralBootstrap(cp, handle);
    cp.clearAnnouncementState();
  });

  markLiveHudTopFlagsDirtyAll();
  syncLiveHudTopFlagBlinkTimer();
  markCaptureTickLoopsDirty();
}

function resyncCapturePointsForLiveBootstrap(): void {
  refreshCapturePointsEngineStateForUI();
  markLiveHudTopFlagsDirtyAll();
  syncLiveHudTopFlagBlinkTimer();
  markCaptureTickLoopsDirty();
}
function tryGetPlayerSquadName(player: mod.Player): string | null {
  if (!mod.IsPlayerValid(player)) return null;

  try {
    return mod.GetSquadName(mod.GetSquad(player));
  } catch (_err) {
    return null;
  }
}

function ResetPostmatchEndState(): void {
  postmatchEndStep = POSTMATCH_END_STEP_IDLE;
  postmatchEndStepTick = 0;
  postmatchWinnerTeam = teamNeutral;
}

function ReturnToPreMatchAfterRoundReset(): void {
  stopCoreMusicPlayback();
  resetAllCaptureBuildupState(true);
  resetAllLiveHudState();
  serverScores = [INITIAL_TICKETS, INITIAL_TICKETS];
  syncDisplayedGameModeScores(true);
  markLiveHudScoresDirty();
  markScoreboardDirty();
  markCaptureTickLoopsDirty();
  markEndgameSuspenseDirty();
  phaseTickCount = 0;
  countDown = COUNT_DOWN_TIME;
  postmatchResultSfxPlayed = false;
  ResetPostmatchEndState();
  prematchSwitchLastHandledTickByPlayerId = {};
  prematchSwitchDebounceWarnedByPlayerId = {};
  lastPrematchTeamSwitchTick = -999999;
  lastPrematchTeamSwitchTickByPlayerId = {};
  prematchStabilizationGateWarnedBySwitchTick = {};
  prematchHealthInside889ByPlayerId = {};
  prematchHealthAppliedMaxByPlayerId = {};

  initialization[0] = false;
  initialization[1] = false;
  initialization[2] = false;
  initialization[3] = false;
  initialization[4] = false;

  SafeSetWidgetVisibleByName("PreMatchContainer", true);
  SafeSetWidgetVisibleByName("CountDownContainer", false);
  SafeSetWidgetVisibleByName("LiveContainer", false);
  SafeSetWidgetVisibleByName("PostMatchContainer", false);

  serverPlayers.forEach((p) => {
    p.resetReadyForNewRound();
    replacePrematchReadyText(p.id, p.player);
    p.isDeployed = false;
    p.setCapturePoint(null);
    p.resetActiveCaptureProgressUi();
    if (p.activeFlagContainerWidget) {
      try {
        mod.SetUIWidgetVisible(p.activeFlagContainerWidget, false);
      } catch (_err) {}
    }

    mod.SetRedeployTime(p.player, 0);
    applyPhaseInputRestrictionsForPlayer(p.player);
  });

  for (let i = 0; i < 4; i++) {
    SafeEnableWorldIconById(WORLDICON_T1_SWITCH + i, true, true);
  }

  SafeEnableInteractPointById(IP_T1_SWITCH, true);
  SafeEnableInteractPointById(IP_T1_READY, true);
  SafeEnableInteractPointById(IP_T2_SWITCH, true);
  SafeEnableInteractPointById(IP_T2_READY, true);

  ConfigurePreMatchSpawns();
  gameStatus = 0;
  BuildPrematchRosterUI();
  UpdatePrematchRosterUI();

  applyPrematch889HealthForAllPlayers();
  mod.DeployAllPlayers();
}

function InitializePreMatch(): void {
  phaseTickCount = 0;
  stopCoreMusicPlayback();
  evaluateObjectiveHighlightStringKeyHealth();
  validateReservedSpawnIsolationFromConfigOnce();

  // If we are looping back into prematch, ensure the world state is clean.
  ResetRoundGameplayState();
  StopAllEndgameLoops();

  UIContainers = [
    mod.FindUIWidgetWithName("PreMatchContainer"),
    mod.FindUIWidgetWithName("CountDownContainer"),
    mod.FindUIWidgetWithName("LiveContainer"),
    mod.FindUIWidgetWithName("PostMatchContainer"),
  ];

  serverPlayers.forEach((p) => p.setTeam());

  SafeSetWorldIconTextById(WORLDICON_T1_SWITCH, mod.Message(mod.stringkeys.SwitchTeam));
  SafeSetWorldIconTextById(WORLDICON_T1_READY, mod.Message(mod.stringkeys.Ready));
  SafeSetWorldIconTextById(WORLDICON_T2_SWITCH, mod.Message(mod.stringkeys.SwitchTeam));
  SafeSetWorldIconTextById(WORLDICON_T2_READY, mod.Message(mod.stringkeys.Ready));

  // Re-enable icons (they were disabled in countdown)
  for (let i = 0; i < 4; i++) {
    SafeEnableWorldIconById(WORLDICON_T1_SWITCH + i, true, true);
  }

  // Re-enable prematch interact points (ready + switch)
  SafeEnableInteractPointById(IP_T1_SWITCH, true);
  SafeEnableInteractPointById(IP_T1_READY, true);
  SafeEnableInteractPointById(IP_T2_SWITCH, true);
  SafeEnableInteractPointById(IP_T2_READY, true);

  mod.SetScoreboardType(mod.ScoreboardType.CustomTwoTeams);
  mod.SetGameModeTimeLimit(60000);

  // Prematch UI visibility
  SafeSetWidgetVisibleByName("PreMatchContainer", true);
  SafeSetWidgetVisibleByName("CountDownContainer", false);
  SafeSetWidgetVisibleByName("LiveContainer", false);

  mod.SetSpawnMode(mod.SpawnModes.Deploy);
  serverPlayers.forEach((p) => mod.SetRedeployTime(p.player, 0));

  Object.values(serverCapturePoints).forEach((cp) => {
    cp.setObjectiveEnabled(false);
  });

  ConfigurePreMatchSpawns();


  BuildPrematchRosterUI();
  UpdatePrematchRosterUI();
  queueLiveHudPrebuildForAllParticipants();

  serverPlayers.forEach((p) => setReadyPhaseProtectionForPlayer(p.player, true));
  applyPrematch889HealthForAllPlayers();

  initialization[0] = true;
}

function InitializeCountDown(): void {
  let initOk = false;
  try {
    phaseTickCount = 0;
    countDown = COUNT_DOWN_TIME;

    team1HasCapturedAnyFlag = false;
    team2HasCapturedAnyFlag = false;

    // Legacy countdown path is not used by the all-ready prematch flow.
    mod.SetSpawnMode(mod.SpawnModes.AutoSpawn);
    SafeSetWidgetVisibleByName("PreMatchContainer", false);
    SetPrematchButtonsVisibleForAllPlayers(false);

    for (let i = 0; i < 4; i++) {
      SafeEnableWorldIconById(WORLDICON_T1_SWITCH + i, false, false);
    }

    SafeEnableInteractPointById(IP_T1_READY, false);
    SafeEnableInteractPointById(IP_T2_READY, false);

    SafeSetTextLabelByName("MatchStartsText", mod.Message(mod.stringkeys.MatchStarts));
    SafeSetWidgetVisibleByName("CountDownContainer", true);

    DisableAllDynamicHQsAndLiveHQs();
    EnableOnlyInitialHQs();
    enforceReadyupHqsDisabledOutsidePrematch("InitializeCountDown");

    serverPlayers.forEach((p) => setReadyPhaseProtectionForPlayer(p.player, true));
    initOk = true;
  } catch (err) {
    LogRuntimeError("InitializeCountDown", err);
  } finally {
    initialization[1] = initOk;
  }
}

function InitializePreLive(): void {
  let initOk = false;
  try {
    phaseTickCount = 0;
    countDown = PRELIVE_TIME;

    SafeSetTextLabelByName("MatchStartsText", mod.Message(mod.stringkeys.MatchStarts));
    SafeSetTextLabelByName("CountDownText", mod.Message(countDown));

    // Hide prematch UI.
    SafeSetWidgetVisibleByName("PreMatchContainer", false);
    SetPrematchButtonsVisibleForAllPlayers(false);
    SafeSetWidgetVisibleByName("CountDownContainer", true);

    // Disable prematch world icons + interact points.
    for (let i = 0; i < 4; i++) {
      SafeEnableWorldIconById(WORLDICON_T1_SWITCH + i, false, false);
    }
    SafeEnableInteractPointById(IP_T1_SWITCH, false);
    SafeEnableInteractPointById(IP_T1_READY, false);
    SafeEnableInteractPointById(IP_T2_SWITCH, false);
    SafeEnableInteractPointById(IP_T2_READY, false);

    // Keep the deploy screen suppressed during pre-live while already-alive players are teleported in place.
    mod.SetSpawnMode(mod.SpawnModes.AutoSpawn);
    DisableAllDynamicHQsAndLiveHQs();
    EnableOnlyInitialHQs();
    enforceReadyupHqsDisabledOutsidePrematch("InitializePreLive");
    resetPreliveClusterTeleportState();
    teleportAliveParticipantsToPreliveClusterAnchors();

    bootstrapCapturePointsForRoundStart();

    queueLiveHudPrebuildForAllParticipants();
    serverPlayers.forEach((p) => setReadyPhaseProtectionForPlayer(p.player, true));
    playCoreLiveStartMusic();
    armPreliveMusicRetryWindow();
    initOk = true;
  } catch (err) {
    LogRuntimeError("InitializePreLive", err);
  } finally {
    initialization[2] = initOk;
  }
}

function InitializeLive(): void {
  mod.SetGameModeTimeLimit(mod.GetMatchTimeElapsed() + ROUND_TIME);
  // Re-enable the tabletop deploy screen for live play.
  mod.SetSpawnMode(mod.SpawnModes.Deploy);
  ConfigureLiveSpawns();
  phaseTickCount = 0;

  // Ensure cached owner/progress state is rebuilt from the engine after PreLive bootstrap
  // before any live routing or HUD decisions read the wrappers.
  resyncCapturePointsForLiveBootstrap();
  Object.values(serverCapturePoints).forEach((cp) => validateCapturePointNeutralBootstrap(cp));

  // Root containers
  SetDepthAboveGameUI("UIContainer");
  SetDepthAboveGameUI("LiveContainer");
  SetDepthAboveGameUI("matchtime");
  SetDepthAboveGameUI("friendlyscore");
  SetDepthAboveGameUI("friendlyscore_pulse");
  SetDepthAboveGameUI("enemyscore");
  SetDepthAboveGameUI("enemyscore_pulse");
  SetDepthAboveGameUI("friendlyprogressbar");
  SetDepthAboveGameUI("friendlyprogressbarfill");
  SetDepthAboveGameUI("friendlyprogress_pulse");
  SetDepthAboveGameUI("enemyprogressbar");
  SetDepthAboveGameUI("enemyprogressbarfill");
  SetDepthAboveGameUI("enemyprogress_pulse");
  SetDepthAboveGameUI("FlagContainerA");
  SetDepthAboveGameUI("FlagContainerB");
  SetDepthAboveGameUI("FlagContainerC");

  initializeLiveRoutingCapturePointPositions();
  UpdateFlagHQSpawns();

  serverScores = [INITIAL_TICKETS, INITIAL_TICKETS];
  syncDisplayedGameModeScores(true);
  markLiveHudScoresDirty();
  markScoreboardDirty();
  markCaptureTickLoopsDirty();
  markEndgameSuspenseDirty();
  drainLiveHudPrebuildQueue(LIVE_UI_SLOTS_PER_TEAM * 2, true);

  // Hide prematch UI once players are deploying/playing.
  const pre = mod.FindUIWidgetWithName("PreMatchContainer");
  if (pre) mod.SetUIWidgetVisible(pre, false);
  SafeSetWidgetVisibleByName("CountDownContainer", false);
  SetPrematchButtonsVisibleForAllPlayers(false);

  if (UIContainers[1]) mod.SetUIWidgetVisible(UIContainers[1], false);
  if (UIContainers[2]) mod.SetUIWidgetVisible(UIContainers[2], true);
  else SafeSetWidgetVisibleByName("LiveContainer", true);
  HideSharedTicketBarFills();

  serverPlayers.forEach((p) => p.addUI());

  // Repaint the top-lane HUD from the freshly sampled engine state now that live HUD widgets exist.
  markLiveHudTopFlagsDirtyAll();
  flushLiveHudTopFlagLanes();

  serverPlayers.forEach((p) => setReadyPhaseProtectionForPlayer(p.player, false));

  serverPlayers.forEach((p) => {
    if (!mod.IsPlayerValid(p.player)) return;
    p.setTeam();
    mod.SetRedeployTime(p.player, REDEPLOY_TIME);
    mod.EnableAllInputRestrictions(p.player, false);
    mod.EnableInputRestriction(p.player, mod.RestrictedInputs.FireWeapon, false);
    mod.EnableInputRestriction(p.player, mod.RestrictedInputs.Interact, false);
    if (p.isDeployed) p.isFirstDeploy();
  });

  mod.SetScoreboardColumnNames(
    mod.Message(mod.stringkeys.ScoreboardScore),
    mod.Message(mod.stringkeys.ScoreboardKills),
    mod.Message(mod.stringkeys.ScoreboardDeaths),
    mod.Message(mod.stringkeys.ScoreboardAssists),
    mod.Message(mod.stringkeys.ScoreboardCaptures)
  );

  SetUITime();
  SetUIScores();
  UpdateLiveHudTimerDiagnostics();

  initialization[3] = true;
}

function getWinningTeam(): mod.Team {
  const t1 = serverScores[0];
  const t2 = serverScores[1];

  if (t1 > t2) return team1;
  if (t2 > t1) return team2;
  return teamNeutral;
}

function deletePostMatchReportUI(): void {
  for (let i = 0; i < postMatchWidgetsToDelete.length; i++) {
    mod.DeleteUIWidget(mod.FindUIWidgetWithName(postMatchWidgetsToDelete[i]));
  }
  postMatchWidgetsToDelete = [];
}

function addPostMatchText(
  name: string,
  posX: number,
  posY: number,
  w: number,
  h: number,
  size: number,
  color: mod.Vector,
  alpha: number,
  receiver: mod.Team | mod.Player
): void {
  const parent = mod.FindUIWidgetWithName("PostMatchContainer");
  mod.AddUIText(
    name,
    mod.CreateVector(posX, posY, 0),
    mod.CreateVector(w, h, 0),
    mod.UIAnchor.TopCenter,
    parent,
    true,
    0,
    mod.CreateVector(0, 0, 0),
    0,
    mod.UIBgFill.None,
    mod.Message(""),
    size,
    color,
    alpha,
    mod.UIAnchor.Center,
    receiver as any
  );

  postMatchWidgetsToDelete.push(name);
}

function setPostMatchText(name: string, label: any): void {
  const w = mod.FindUIWidgetWithName(name);
  if (w) mod.SetUITextLabel(w, label);
}

function BuildPostMatchReportUI(): void {
  deletePostMatchReportUI();

  const parent = mod.FindUIWidgetWithName("PostMatchContainer");
  if (!parent) return;

  mod.SetUIWidgetBgFill(parent, mod.UIBgFill.Solid);
  mod.SetUIWidgetBgAlpha(parent, 0.75);
  mod.SetUIWidgetBgColor(parent, mod.CreateVector(0, 0, 0));
  mod.SetUIWidgetDepth(parent, mod.UIDepth.AboveGameUI);

  const winner = getWinningTeam();

  // Build connected player lists (serverPlayers only contains connected players)
  const t1List: Player[] = [];
  const t2List: Player[] = [];

  serverPlayers.forEach((p) => {
    if (isExcludedPlayer(p.player)) return;

    const t = mod.GetTeam(p.player);
    if (mod.Equals(t, team1)) t1List.push(p);
    else if (mod.Equals(t, team2)) t2List.push(p);
  });

  t1List.sort((a, b) => b.getScoreboardSnapshot()[0] - a.getScoreboardSnapshot()[0]);
  t2List.sort((a, b) => b.getScoreboardSnapshot()[0] - a.getScoreboardSnapshot()[0]);

  // Layout
  const headerY = 220;
  const rowStartY = 260;
  const rowH = 22;

  // Portal-safe centered layout
const TABLE_WIDTH = 620; // safe on 16:9
const TABLE_GAP = 60;    // space between teams

// Left and right table centers
const leftX  = -(TABLE_GAP / 2 + TABLE_WIDTH / 2);
const rightX = +(TABLE_GAP / 2 + TABLE_WIDTH / 2);

  // Utility: clamp line count without mod.Min
  function clampLines(n: number): number {
    let out = n;
    if (out > POSTMATCH_MAX_LINES) out = POSTMATCH_MAX_LINES;
    if (out < 0) out = 0;
    return out;
  }

  // Build a full view for a specific receiver team:
  // left side = friendly team data, right side = enemy team data.
  function buildForReceiver(
    receiver: mod.Team,
    friendlyList: Player[],
    enemyList: Player[],
    friendlyTicketsA: number,
    friendlyTicketsB: number,
    resultKey: any
  ): void {
    // Result text (color depends on result)
    const resultColor =
      resultKey === mod.stringkeys.PostMatchVictory ? COLOR_FRIENDLY :
      resultKey === mod.stringkeys.PostMatchDefeat ? COLOR_ENEMY :
      COLOR_NEUTRAL;

    addPostMatchText("PM_Result_" + modlib.getTeamId(receiver), 0, 80, 800, 80, 64, resultColor, 1, receiver);
    setPostMatchText("PM_Result_" + modlib.getTeamId(receiver), mod.Message(resultKey));

    // Final tickets line (friendly-enemy from viewer perspective)
    addPostMatchText("PM_Tickets_" + modlib.getTeamId(receiver), 0, 150, 900, 40, 28, COLOR_NEUTRAL, 1, receiver);
    setPostMatchText(
      "PM_Tickets_" + modlib.getTeamId(receiver),
      mod.Message(mod.stringkeys.PostMatchFinalTickets, mod.Ceiling(friendlyTicketsA), mod.Ceiling(friendlyTicketsB))
    );

    // Headers (left = friendly, right = enemy)
    function addHeaders(side: "L" | "R", x: number, color: mod.Vector): void {
      const suffix = side + "_" + modlib.getTeamId(receiver);

      addPostMatchText("H_Name_" + suffix, x - 220, headerY, 280, 24, 18, color, 1, receiver);
      addPostMatchText("H_Score_" + suffix, x + 120, headerY, 90, 24, 18, color, 1, receiver);
      addPostMatchText("H_K_" + suffix, x + 200, headerY, 40, 24, 18, color, 1, receiver);
      addPostMatchText("H_D_" + suffix, x + 245, headerY, 40, 24, 18, color, 1, receiver);
      addPostMatchText("H_A_" + suffix, x + 290, headerY, 40, 24, 18, color, 1, receiver);
      addPostMatchText("H_C_" + suffix, x + 345, headerY, 60, 24, 18, color, 1, receiver);

      setPostMatchText("H_Name_" + suffix, mod.Message(mod.stringkeys.PostMatchHeaderName));
      setPostMatchText("H_Score_" + suffix, mod.Message(mod.stringkeys.PostMatchHeaderScore));
      setPostMatchText("H_K_" + suffix, mod.Message(mod.stringkeys.PostMatchHeaderKills));
      setPostMatchText("H_D_" + suffix, mod.Message(mod.stringkeys.PostMatchHeaderDeaths));
      setPostMatchText("H_A_" + suffix, mod.Message(mod.stringkeys.PostMatchHeaderAssists));
      setPostMatchText("H_C_" + suffix, mod.Message(mod.stringkeys.PostMatchHeaderCaptures));
    }

    addHeaders("L", leftX, COLOR_FRIENDLY);
    addHeaders("R", rightX, COLOR_ENEMY);

    // Friendly rows (left)
    const friendlyLines = clampLines(friendlyList.length);
    for (let i = 0; i < friendlyLines; i++) {
      const y = rowStartY + i * rowH;
      const p = friendlyList[i];
      const s = p.getScoreboardSnapshot();
      const suf = "L_" + modlib.getTeamId(receiver) + "_" + i;

      addPostMatchText("N_" + suf, leftX - 220, y, 280, 22, 16, COLOR_FRIENDLY, 1, receiver);
      addPostMatchText("S_" + suf, leftX + 120, y, 90, 22, 16, COLOR_NEUTRAL, 1, receiver);
      addPostMatchText("K_" + suf, leftX + 200, y, 40, 22, 16, COLOR_NEUTRAL, 1, receiver);
      addPostMatchText("D_" + suf, leftX + 245, y, 40, 22, 16, COLOR_NEUTRAL, 1, receiver);
      addPostMatchText("A_" + suf, leftX + 290, y, 40, 22, 16, COLOR_NEUTRAL, 1, receiver);
      addPostMatchText("C_" + suf, leftX + 345, y, 60, 22, 16, COLOR_NEUTRAL, 1, receiver);

      setPostMatchText("N_" + suf, mod.Message(mod.stringkeys.PostMatchPlayerName, p.player));
      setPostMatchText("S_" + suf, mod.Message(s[0]));
      setPostMatchText("K_" + suf, mod.Message(s[1]));
      setPostMatchText("D_" + suf, mod.Message(s[2]));
      setPostMatchText("A_" + suf, mod.Message(s[3]));
      setPostMatchText("C_" + suf, mod.Message(s[4]));
    }

    // Enemy rows (right) in COLOR_ENEMY for the name column
    const enemyLines = clampLines(enemyList.length);
    for (let i = 0; i < enemyLines; i++) {
      const y = rowStartY + i * rowH;
      const p = enemyList[i];
      const s = p.getScoreboardSnapshot();
      const suf = "R_" + modlib.getTeamId(receiver) + "_" + i;

      addPostMatchText("N_" + suf, rightX - 220, y, 280, 22, 16, COLOR_ENEMY, 1, receiver);
      addPostMatchText("S_" + suf, rightX + 120, y, 90, 22, 16, COLOR_NEUTRAL, 1, receiver);
      addPostMatchText("K_" + suf, rightX + 200, y, 40, 22, 16, COLOR_NEUTRAL, 1, receiver);
      addPostMatchText("D_" + suf, rightX + 245, y, 40, 22, 16, COLOR_NEUTRAL, 1, receiver);
      addPostMatchText("A_" + suf, rightX + 290, y, 40, 22, 16, COLOR_NEUTRAL, 1, receiver);
      addPostMatchText("C_" + suf, rightX + 345, y, 60, 22, 16, COLOR_NEUTRAL, 1, receiver);

      setPostMatchText("N_" + suf, mod.Message(mod.stringkeys.PostMatchPlayerName, p.player));
      setPostMatchText("S_" + suf, mod.Message(s[0]));
      setPostMatchText("K_" + suf, mod.Message(s[1]));
      setPostMatchText("D_" + suf, mod.Message(s[2]));
      setPostMatchText("A_" + suf, mod.Message(s[3]));
      setPostMatchText("C_" + suf, mod.Message(s[4]));
    }
  }

  // Determine result per receiver team
  const t1ResultKey =
    mod.Equals(winner, team1) ? mod.stringkeys.PostMatchVictory :
    mod.Equals(winner, team2) ? mod.stringkeys.PostMatchDefeat :
    mod.stringkeys.PostMatchDraw;

  const t2ResultKey =
    mod.Equals(winner, team2) ? mod.stringkeys.PostMatchVictory :
    mod.Equals(winner, team1) ? mod.stringkeys.PostMatchDefeat :
    mod.stringkeys.PostMatchDraw;

  // Team 1 viewers: left = team1 (friendly), right = team2 (enemy)
  buildForReceiver(team1, t1List, t2List, serverScores[0], serverScores[1], t1ResultKey);

  // Team 2 viewers: left = team2 (friendly), right = team1 (enemy)
  buildForReceiver(team2, t2List, t1List, serverScores[1], serverScores[0], t2ResultKey);
}
function InitializePostmatch(): void {
  phaseTickCount = 0;
  countDown = POSTMATCH_TIME;
  startCorePostmatchResultMusic();
  ResetPostmatchEndState();
  enforceReadyupHqsDisabledOutsidePrematch("InitializePostmatch");
  prematchSwitchLastHandledTickByPlayerId = {};
  prematchSwitchDebounceWarnedByPlayerId = {};
  lastPrematchTeamSwitchTick = -999999;
  lastPrematchTeamSwitchTickByPlayerId = {};
  prematchStabilizationGateWarnedBySwitchTick = {};
  prematchHealthInside889ByPlayerId = {};
  prematchHealthAppliedMaxByPlayerId = {};

  mod.SetUIWidgetVisible(mod.FindUIWidgetWithName("LiveContainer"), false);
  setLiveHudVisibleForAllPlayers(false);
  mod.SetUIWidgetVisible(mod.FindUIWidgetWithName("CountDownContainer"), false);
  mod.SetUIWidgetVisible(mod.FindUIWidgetWithName("PreMatchContainer"), false);
  SetPrematchButtonsVisibleForAllPlayers(false);
  StopAllCaptureTickLoops();
  StopAllEndgameLoops();



  const post = mod.FindUIWidgetWithName("PostMatchContainer");
  if (post) {
    mod.SetUIWidgetVisible(post, true);
    mod.SetUIWidgetDepth(post, mod.UIDepth.AboveGameUI);
    mod.SetUIWidgetSize(post, mod.CreateVector(SCREEN_UI_REFERENCE_WIDTH, SCREEN_UI_REFERENCE_HEIGHT, 0));
  }

  // Unlock players but keep them from interacting/shooting.
  serverPlayers.forEach((p) => {
    mod.EnableAllInputRestrictions(p.player, true);
    mod.EnableInputRestriction(p.player, mod.RestrictedInputs.CameraPitch, false);
    mod.EnableInputRestriction(p.player, mod.RestrictedInputs.CameraYaw, false);
  });

  // Clamp scores for display.
  if (serverScores[0] < 0) serverScores[0] = 0;
  if (serverScores[1] < 0) serverScores[1] = 0;
  syncDisplayedGameModeScores(true);

  BuildPostMatchReportUI();
  playPostMatchResultSfxOnce();


  initialization[4] = true;

}


/* =================================================================================================
   13) GAME MODE LIFECYCLE + MAIN LOOP
================================================================================================= */
// -------------------------------------------------------------------------------------------------
// RUNTIME SAFETY GUARD
// If any unexpected runtime error occurs, keep the mode running and rate-limit logs.
// This prevents "timer frozen / capture logic stopped" failure mode.
// -------------------------------------------------------------------------------------------------

let lastRuntimeErrorTick = -999999;

function LogRuntimeError(tag: string, err: any): void {
  // Rate limit to once per second (prevents spam + performance issues).
  if (serverTickCount - lastRuntimeErrorTick < TICK_RATE) return;
  lastRuntimeErrorTick = serverTickCount;

  mod.DisplayHighlightedWorldLogMessage(
    mod.Message("[RUNTIME ERROR] {}: {}", tag, String(err))
  );
}

function getInitializationFlagSummary(): string {
  let out = "";
  for (let i = 0; i < initialization.length; i++) {
    if (i > 0) out += "/";
    out += initialization[i] ? "1" : "0";
  }
  return out;
}

function warnTransitionRecoveryOnce(key: string, message: any): void {
  if (transitionRecoveryWarnedByKey[key] === true) return;
  transitionRecoveryWarnedByKey[key] = true;
  mod.DisplayHighlightedWorldLogMessage(message);
}

function forceReturnToPrematchFromTransitionFailure(source: string, err?: any): void {
  if (err !== undefined) {
    LogRuntimeError("Transition/" + source, err);
  }

  warnTransitionRecoveryOnce(
    "fallback/" + source,
    mod.Message(
      "[TRANSITION RECOVERY] source/status/inits {}",
      source + "/" + String(gameStatus) + "/" + getInitializationFlagSummary()
    )
  );

  try {
    ReturnToPreMatchAfterRoundReset();
  } catch (fallbackErr) {
    LogRuntimeError("TransitionFallback/" + source, fallbackErr);
  }
}

function EnsureGlobalPrematchHitboxesForPlayer(player: mod.Player): void {
  EnsurePrematchButtonsForPlayer(player);
}

const MAIN_LOOP_INTERVAL_MS = 33;
let mainLoopIntervalHandle: number | undefined = undefined;

function stopMainLoopTimer(): void {
  Timers.clearInterval(mainLoopIntervalHandle);
  mainLoopIntervalHandle = undefined;
}

function startMainLoopTimer(): void {
  stopMainLoopTimer();
  mainLoopIntervalHandle = Timers.setInterval(() => {
    Mode_OngoingGlobal_Inner();
  }, MAIN_LOOP_INTERVAL_MS);
}

export interface KernelLiveTickServiceDelegates {
  combatLiveTick?: () => void;
  objectiveFastLiveTick?: () => void;
  objectiveSlowLiveTick?: () => void;
  spawnRoutingLiveTick?: () => void;
}

const kernelLiveTickServiceDelegates: KernelLiveTickServiceDelegates = {};

export function registerKernelLiveTickServiceDelegates(delegates: KernelLiveTickServiceDelegates): void {
  if (delegates.combatLiveTick) {
    kernelLiveTickServiceDelegates.combatLiveTick = delegates.combatLiveTick;
  }
  if (delegates.objectiveFastLiveTick) {
    kernelLiveTickServiceDelegates.objectiveFastLiveTick = delegates.objectiveFastLiveTick;
  }
  if (delegates.objectiveSlowLiveTick) {
    kernelLiveTickServiceDelegates.objectiveSlowLiveTick = delegates.objectiveSlowLiveTick;
  }
  if (delegates.spawnRoutingLiveTick) {
    kernelLiveTickServiceDelegates.spawnRoutingLiveTick = delegates.spawnRoutingLiveTick;
  }
}

export function kernelGetKothGameStatus(): number {
  return gameStatus;
}

function runLegacyCombatLiveTick(): void {
  if (!ENABLE_DAMAGE_SMOOTHING) return;

  dmgSpreadProcessQueueTick();
  dmgSpreadUpdateHealthCacheTick();
}

function runLegacyObjectiveFastLiveTick(): void {
  // Intentionally empty. Capture state now comes from point-local OngoingCapturePoint events
  // and the 1s watchdog only repairs stale player-on-point bindings.
  return;
}

function runLegacySpawnRoutingLiveTick(): void {
  if (gameStatus !== 3) return;
  if (!hqRoutingDirty) return;
  recomputeLiveHqRouting(false);
}

function runLegacyObjectiveSlowLiveTick(): void {
  ChangeTickets();
  UpdateLiveHudTimerDiagnostics();
}

function flushLiveDirtyState(): void {
  if (captureTickLoopsDirty) {
    UpdateCaptureTickLoopsGlobal();
    captureTickLoopsDirty = false;
    captureLoopDirtyFlushes += 1;
  }

  if (liveHudTopFlagsDirty) {
    flushLiveHudTopFlagLanes();
  }

  if (liveHudScoresDirty) {
    SetUIScores();
    liveHudScoresDirty = false;
    liveHudScoreDirtyFlushes += 1;
  }

  if (scoreboardDirty) {
    UpdateScoreboard();
    scoreboardDirty = false;
    scoreboardDirtyFlushes += 1;
  }
}

function Mode_OnGameModeStarted(): void {
  stopMainLoopTimer();
  stopCoreMusicPlayback();
  resetAllCaptureBuildupState(true);
  kernelKothLiveOverrideEnabled = false;

  gameModeStarted = false;
  gameStatus = -1;
  serverTickCount = 0;
  phaseTickCount = 0;
  countDown = COUNT_DOWN_TIME;
  lastTicketBleedTimeElapsed = 0;
  initialization = [false, false, false, false, false];
  serverScores = [INITIAL_TICKETS, INITIAL_TICKETS];
  lastSyncedGameModeScores = null;
  scoreboardDirty = true;
  liveHudScoresDirty = true;
  captureTickLoopsDirty = true;
  endgameSuspenseDirty = true;
  capturePointReconcileFlushes = 0;
  captureLoopDirtyFlushes = 0;
  scoreboardDirtyFlushes = 0;
  liveHudScoreDirtyFlushes = 0;
  endgameAudioFlushes = 0;
  musicRuntimeHealthy = true;
  musicPackageLoaded = false;
  liveEndgameSuspenseEntered = false;
  postmatchResultMusicActive = false;
  coreEndgameWinningTeam = teamNeutral;
  coreStartMusicTriggeredThisRound = false;
  preliveMusicRetryAttemptsRemaining = 0;
  preliveMusicRetryNextTick = 0;
  preliveRoundStartVoPlayedThisRound = false;

  mod.SetGameModeTimeLimit(60000);
  mod.SetGameModeTargetScore(mod.Ceiling(INITIAL_TICKETS) + 1);
  syncDisplayedGameModeScores(true);

  SetDepthAboveGameUI("PreMatchContainer");

  ensureAudioSpawned();
  ensureMusicPackageLoaded();
  ResetPostmatchEndState();
  postmatchResultSfxPlayed = false;
  objectiveHighlightUseLiteralFallback = false;
  objectiveHighlightHealthChecked = false;
  objectiveHighlightKeyHealthWarned = false;
  evaluateObjectiveHighlightStringKeyHealth();
  validateReservedSpawnIsolationFromConfigOnce();
  prematchHealthInside889ByPlayerId = {};
  prematchHealthAppliedMaxByPlayerId = {};
  resetAllSpawnRoutingState();
  resetAllLiveHudState();

  gameStatus = 0;
  serverTickCount = 0;
  phaseTickCount = 0;
  gameModeStarted = true;

  ConfigurePreMatchSpawns();

  for (let i = 0; i < fireVfx.length; i++) {
    mod.EnableVFX(fireVfx[i], true);
  }

  SafeSetWidgetVisibleByName("PreMatchContainer", true);
  BuildPrematchRosterUI();
  UpdatePrematchRosterUI();
  applyPrematch889HealthForAllPlayers();

  startMainLoopTimer();
}

function Mode_OnGameModeEnding(): void {
  stopMainLoopTimer();
  stopCoreMusicPlayback();
  resetAllCaptureBuildupState(true);
  kernelKothLiveOverrideEnabled = false;
  gameModeStarted = false;
  gameStatus = -1;
  serverTickCount = 0;
  phaseTickCount = 0;
  countDown = COUNT_DOWN_TIME;
  lastTicketBleedTimeElapsed = 0;
  initialization = [false, false, false, false, false];
  serverScores = [INITIAL_TICKETS, INITIAL_TICKETS];
  lastSyncedGameModeScores = null;
  scoreboardDirty = true;
  liveHudScoresDirty = true;
  captureTickLoopsDirty = true;
  endgameSuspenseDirty = true;
  coreStartMusicTriggeredThisRound = false;
  ResetPostmatchEndState();
  postmatchResultSfxPlayed = false;
  resetAllSpawnRoutingState();
  resetAllLiveHudState();
  normalizeAllPlayersToStandardHealthAndClearPrematch889State();
}

function Mode_OngoingGlobal(): void {
  // Intentionally lightweight. Main loop logic runs through Timers.
  return;
}

function Mode_OngoingGlobal_Inner(): void {
  if (!gameModeStarted) return;

  serverTickCount += 1;
  phaseTickCount += 1;
  if (gameStatus >= 0 && gameStatus <= 2) {
    drainLiveHudPrebuildQueue(LIVE_HUD_PREBUILD_PLAYERS_PER_TICK, true);
  }
  if (gameStatus !== 0 && mod.Modulo(phaseTickCount, TICK_RATE) === 0) {
    enforceReadyupHqsDisabledOutsidePrematch("OngoingGlobal_Inner_periodic");
  }

  if (gameStatus === 0) {
    if (!initialization[0]) InitializePreMatch();

    let readyPlayers: number[] = [0, 0];
    let totalPlayers: number[] = [0, 0];
    let humanParticipantPlayers = 0;
    let humanExcludedPlayers = 0;

  serverPlayers.forEach((p) => {
      p.setTeam();
      if (isBotBackfillPlayer(p.player)) return;
      if (isExcludedPlayer(p.player)) {
        humanExcludedPlayers += 1;
        return;
      }

      const team = mod.GetTeam(p.player);

      if (mod.Equals(team, team1)) {
        humanParticipantPlayers += 1;
        totalPlayers[0] += 1;
        if (p.isReady()) readyPlayers[0] += 1;
      } else if (mod.Equals(team, team2)) {
        humanParticipantPlayers += 1;
        totalPlayers[1] += 1;
        if (p.isReady()) readyPlayers[1] += 1;
      }
    });

    SafeSetTextLabelByName("PreMatchTeam1", mod.Message(mod.stringkeys.PreMatchTeam1, readyPlayers[0], totalPlayers[0]));
    SafeSetTextLabelByName("PreMatchTeam2", mod.Message(mod.stringkeys.PreMatchTeam2, readyPlayers[1], totalPlayers[1]));

    const allReady =
      readyPlayers[0] === totalPlayers[0] &&
      readyPlayers[1] === totalPlayers[1] &&
      (humanParticipantPlayers > 0 || humanExcludedPlayers > 0);
    const switchElapsedTicks = serverTickCount - lastPrematchTeamSwitchTick;
    const teamSwitchStabilized = switchElapsedTicks >= PRELIVE_TEAM_SWITCH_STABILIZE_TICKS;

    if (allReady) {
      if (!teamSwitchStabilized) {
        warnPrematchStabilizationGateBlockedOnce(readyPlayers, totalPlayers, switchElapsedTicks);
      } else {
        normalizeAllPlayersToStandardHealthAndClearPrematch889State();
        initialization[1] = false;
        initialization[2] = false;
        initialization[3] = false;
        gameStatus = 2;
      }
    }
  } else if (gameStatus === 1) {
    if (!initialization[1]) {
      try {
        InitializeCountDown();
      } catch (err) {
        LogRuntimeError("InitializeCountDown", err);
        initialization[1] = false;
      }
      if (!initialization[1]) {
        forceReturnToPrematchFromTransitionFailure("InitializeCountDown");
        return;
      }
    }

    if (mod.Modulo(phaseTickCount, TICK_RATE) === 0) {
      countDown -= 1;

      playCountdownHeartbeatToAll(0.6);
      SafeSetTextLabelByName("CountDownText", mod.Message(countDown));
      forceAutoDeployToInitialHqDuringCountdown();

      if (countDown <= 0) {
        SafeSetTextLabelByName("CountDownText", mod.Message(0));
        gameStatus = 2;
      }
    }
  } else if (gameStatus === 2) {
    if (!initialization[2]) {
      try {
        InitializePreLive();
      } catch (err) {
        LogRuntimeError("InitializePreLive", err);
        initialization[2] = false;
      }
      if (!initialization[2]) {
        forceReturnToPrematchFromTransitionFailure("InitializePreLive");
      }
      return;
    }

    maybeRetryPreliveMusicStart();

    if (mod.Modulo(phaseTickCount, TICK_RATE) === 0) {
      countDown -= 1;
      const vol = countDown <= 3 ? 0.85 : 0.6;
      playCountdownHeartbeatToAll(vol);
      SafeSetTextLabelByName("CountDownText", mod.Message(countDown < 0 ? 0 : countDown));
      if (countDown === PRELIVE_ROUNDSTART_VO_COUNTDOWN_SECONDS) {
        playPreliveRoundStartVoToTeams();
      }
      if (countDown <= 0) {
        SafeSetTextLabelByName("CountDownText", mod.Message(0));
        SafeSetWidgetVisibleByName("CountDownContainer", false);
        playMatchStartStingerToAll(1.0);
        void showMatchStartBannerOnce();
        initialization[3] = false;
        gameStatus = 3;
      }
    }
  } else if (gameStatus === 3) {
    if (kernelKothLiveOverrideEnabled) {
      if (!initialization[3]) {
        initialization[3] = true;
        SafeSetWidgetVisibleByName("CountDownContainer", false);
        SafeSetWidgetVisibleByName("PreMatchContainer", false);
        SafeSetWidgetVisibleByName("LiveContainer", false);
        setLiveHudVisibleForAllPlayers(false);
        serverPlayers.forEach((p) => {
          if (p && mod.IsPlayerValid(p.player)) {
            mod.EnableAllInputRestrictions(p.player, false);
            mod.EnableInputRestriction(p.player, mod.RestrictedInputs.FireWeapon, false);
            mod.EnableInputRestriction(p.player, mod.RestrictedInputs.Interact, false);
          }
        });
      }

      if (mod.Modulo(phaseTickCount, DAMAGE_INTERVAL_TICKS) === 0) {
        serverPlayers.forEach((p) => {
          if (playerInDamageZone[p.id] === true && p.isDeployed && kernelIsPlayerAlive(p.player)) {
            mod.DealDamage(p.player, DAMAGE_PER_PULSE);
          }
        });
      }
      return;
    }

    if (!initialization[3]) {
      InitializeLive();
      return;
    }

    if (kernelLiveTickServiceDelegates.combatLiveTick) {
      kernelLiveTickServiceDelegates.combatLiveTick();
    } else {
      runLegacyCombatLiveTick();
    }

    processLiveSafeSpawnQueues();

    updateLiveActiveCaptureBarsSmoothly();

    if (mod.Modulo(phaseTickCount, LIVE_FAST_UPDATE_INTERVAL_TICKS) === 0) {
      if (kernelLiveTickServiceDelegates.objectiveFastLiveTick) {
        kernelLiveTickServiceDelegates.objectiveFastLiveTick();
      } else {
        runLegacyObjectiveFastLiveTick();
      }

      if (kernelLiveTickServiceDelegates.spawnRoutingLiveTick) {
        kernelLiveTickServiceDelegates.spawnRoutingLiveTick();
      } else {
        runLegacySpawnRoutingLiveTick();
      }
    }

    if (mod.Modulo(phaseTickCount, LIVE_CAPTURE_WATCHDOG_INTERVAL_TICKS) === 0) {
      runCapturePointWatchdogSync();
    }

    if (mod.Modulo(phaseTickCount, LIVE_UI_CLOCK_INTERVAL_TICKS) === 0) {
      SetUITime();
    }

    const shouldRunDirtyEndgameAudio =
      endgameSuspenseDirty && mod.Modulo(phaseTickCount, LIVE_ENDGAME_AUDIO_INTERVAL_TICKS) === 0;
    const shouldRunEndgameWatchdog = mod.Modulo(phaseTickCount, TICK_RATE) === 0;
    if (shouldRunDirtyEndgameAudio || shouldRunEndgameWatchdog) {
      UpdateEndgameSuspenseAudio();
    }

    if (mod.Modulo(phaseTickCount, LIVE_SLOW_UPDATE_INTERVAL_TICKS) === 0) {
      if (kernelLiveTickServiceDelegates.objectiveSlowLiveTick) {
        kernelLiveTickServiceDelegates.objectiveSlowLiveTick();
      } else {
        runLegacyObjectiveSlowLiveTick();
      }
    }

    flushLiveDirtyState();
    maybeEmitLivePerformanceDiagnostics();

    if (mod.GetMatchTimeRemaining() <= 0) gameStatus = 4;

    if (serverScores[0] <= 0 || serverScores[1] <= 0) {
      gameStatus = 4;
      SafeSetWidgetVisibleByName("LiveContainer", false);
      setLiveHudVisibleForAllPlayers(false);
    }

    if (mod.Modulo(phaseTickCount, DAMAGE_INTERVAL_TICKS) === 0) {
      serverPlayers.forEach((p) => {
        if (playerInDamageZone[p.id] === true && p.isDeployed && kernelIsPlayerAlive(p.player)) {
          mod.DealDamage(p.player, DAMAGE_PER_PULSE);
        }
      });
    }
  } else if (gameStatus === 4) {
    if (!initialization[4]) InitializePostmatch();
    if (postmatchEndStep !== POSTMATCH_END_STEP_IDLE) {
      if (serverTickCount - postmatchEndStepTick < POSTMATCH_END_STEP_ADVANCE_TICKS) {
        return;
      }

      if (postmatchEndStep === POSTMATCH_END_STEP_UNDEPLOY_ALL_PLAYERS) {
        mod.UndeployAllPlayers();
        postmatchEndStep = POSTMATCH_END_STEP_END_GAMEMODE;
        postmatchEndStepTick = serverTickCount;
        return;
      }

      if (postmatchEndStep === POSTMATCH_END_STEP_END_GAMEMODE) {
        mod.EndGameMode(postmatchWinnerTeam);
        postmatchEndStep = POSTMATCH_END_STEP_COMPLETE;
        postmatchEndStepTick = serverTickCount;
        return;
      }

      return;
    }

    if (mod.Modulo(phaseTickCount, TICK_RATE) === 0) {
      countDown -= 1;
      if (countDown === 0) {
        SafeSetWidgetVisibleByName("PostMatchContainer", false);
        postmatchWinnerTeam = getWinningTeam();
        postmatchEndStep = POSTMATCH_END_STEP_UNDEPLOY_ALL_PLAYERS;
        postmatchEndStepTick = serverTickCount;
        return;
      }
    }
  } else {
    return;
  }

  /* Always enforce no-fire during countdown/prelive (engine can clear on redeploy) */
  if (gameStatus === 1 || gameStatus === 2) {
    if (mod.Modulo(serverTickCount, TICK_RATE) === 0) {
      serverPlayers.forEach((p) => {
        if (p && mod.IsPlayerValid(p.player)) {
          mod.EnableInputRestriction(p.player, mod.RestrictedInputs.FireWeapon, true);
        }
      });
    }
  }

  if (serverTickCount === 10000000) serverTickCount = 137;
}

/* =================================================================================================
   14) PLAYER EVENTS (JOIN / LEAVE / DEPLOY / UNDEPLOY / INTERACT)
================================================================================================= */

function findServerPlayerByObjId(playerObjId: number): Player | undefined {
  let found: Player | undefined = undefined;
  serverPlayers.forEach((sp) => {
    if (sp && mod.GetObjId(sp.player) === playerObjId) found = sp;
  });
  return found;
}

function emitJoinWorldLogIfEnabled(playerId: number, message: mod.Message): void {
  if (!DEBUG_WORLD_LOG_JOIN_EVENTS) return;

  const lastTick = joinWorldLogLastTickByPlayerId[playerId] ?? -999999;
  if (serverTickCount - lastTick < JOIN_WORLD_LOG_THROTTLE_TICKS) return;

  joinWorldLogLastTickByPlayerId[playerId] = serverTickCount;
  mod.DisplayHighlightedWorldLogMessage(message);
}

function Mode_OnPlayerJoinGame(eventPlayer: mod.Player): void {
  let player: Player | undefined;

  const joiningId = modlib.getPlayerId(eventPlayer);
  resetTransientSpawnRoutingStateForPlayer(joiningId);

  const existing = serverPlayers.get(joiningId);
  if (existing) {
    existing.player = eventPlayer;
    player = existing;
  } else {
    for (let i = 0; i < disconnectedPlayers.length; i++) {
      const p = disconnectedPlayers[i];
      if (p.id === joiningId) {
        p.player = eventPlayer;
        p.setTeam();
        serverPlayers.set(p.id, p);
        emitJoinWorldLogIfEnabled(
          p.id,
          mod.Message(mod.stringkeys.PlayerReconnected, eventPlayer, p.id)
        );
        disconnectedPlayers.splice(i, 1);
        player = p;
        break;
      }
    }

    if (!player) {
      const newPlayer = new Player(eventPlayer);
      serverPlayers.set(newPlayer.id, newPlayer);
      emitJoinWorldLogIfEnabled(
        newPlayer.id,
        mod.Message(mod.stringkeys.PlayerJoined, newPlayer.player, newPlayer.id)
      );
      player = newPlayer;
    }
  }

  if (player && !isExcludedPlayer(player.player)) {
    buildRestrictedAreaUiForPlayer(player);
  }
  if (prematchHealthInside889ByPlayerId[joiningId] === undefined) {
    prematchHealthInside889ByPlayerId[joiningId] = false;
  }
  delete prematchHealthAppliedMaxByPlayerId[joiningId];
  if (gameStatus === 0) {
    applyPrematch889HealthForPlayer(joiningId);
  }

  applyPhaseInputRestrictionsForPlayer(eventPlayer);

  if (isExcludedPlayer(eventPlayer)) {
    if (gameStatus === 0 || gameStatus === -1) {
      BuildPrematchRosterUI();
      UpdatePrematchRosterUI();
    } else {
      SetPrematchButtonsVisibleForPlayer(eventPlayer, false);
    }
    return;
  }

  if (gameStatus === 1) {
    stripLoadoutToMeleeOnly(eventPlayer);
  }

  if (gameStatus === 0 || gameStatus === -1) {
    queueLiveHudPrebuildForPlayer(player);
    if (player) replacePrematchReadyText(player.id, eventPlayer);
    BuildPrematchRosterUI();
    UpdatePrematchRosterUI();
  } else if (gameStatus === 1 || gameStatus === 2) {
    queueLiveHudPrebuildForPlayer(player);
  } else if (gameStatus === 3) {
    SafeSetWidgetVisibleByName("PreMatchContainer", false);
    SafeSetWidgetVisibleByName("LiveContainer", true);
    HideSharedTicketBarFills();
    if (player && initialization[3]) player.addUI();
  }
}

function Mode_OnPlayerLeaveGame(eventNumber: number): void {
  let leaving: Player | undefined = findServerPlayerByObjId(eventNumber);
  if (!leaving) leaving = serverPlayers.get(eventNumber);

  if (!leaving) return;
  const leavingWasExcluded = isExcludedPlayer(leaving.player);
  cleanupRestrictedAreaUiForPlayer(leaving.id);
  clearPrematch889StateForPlayer(leaving.id);
  resetSpawnRoutingStateForPlayer(leaving.id);
  releaseLiveHudSlotForPlayer(leaving.id);
  stopCaptureBuildupForPlayer(leaving.id);



  emitJoinWorldLogIfEnabled(leaving.id, mod.Message(mod.stringkeys.PlayerDisconnected, leaving.id));
  disconnectedPlayers.push(leaving);
  serverPlayers.delete(leaving.id);
  invalidateLivePlayerSpatialHash();

  if (gameStatus === 3 && !leavingWasExcluded) {
    leaving.addDeath();

    const cpId = leaving.getCapturePoint();
    if (cpId !== null) {
      const capturePoint = serverCapturePoints[cpId];
      if (capturePoint) {
        capturePoint.removeOnPoint(leaving.id);
        invalidateCaptureBuildupSessionForCp(capturePoint.id);
        markCapturePointTopFlagLaneDirty(capturePoint);
      }
      stopCaptureBuildupForPlayer(leaving.id);
      leaving.setCapturePoint(null);
      leaving.resetActiveCaptureProgressUi();
      syncLiveHudTopFlagBlinkTimer();
      refreshLiveHqRoutingFromObjectiveEvent();
      markCaptureTickLoopsDirty();
    }
  }

  if (gameStatus === 0) UpdatePrematchRosterUI();
}

async function Mode_OnPlayerDeployed(eventPlayer: mod.Player): Promise<void> {
  const playerId = modlib.getPlayerId(eventPlayer);
  const team = mod.GetTeam(eventPlayer);

  if (isExcludedPlayer(eventPlayer) || (!mod.Equals(team, team1) && !mod.Equals(team, team2))) {
    return;
  }

  applyPhaseInputRestrictionsForPlayer(eventPlayer);
  // Reset damage spacing state on deploy
  dmgSpreadClearForPlayer(eventPlayer);
  clearSafeSpawnCheckTimer(playerId);
  clearSafeSpawnRetryTimer(playerId);
  clearSquadSpawnBypassTimer(playerId);
  bumpSafeSpawnGeneration(playerId);
  squadSpawnBypass[playerId] = false;

  if (gameStatus === 0 || gameStatus === 1) {
    const pPreMatchOrCountdown = serverPlayers.get(playerId);
    if (pPreMatchOrCountdown) pPreMatchOrCountdown.isDeployed = true;
    applyPrematch889HealthForPlayer(playerId);
    if (gameStatus === 0) {
      BuildPrematchRosterUI();
      UpdatePrematchRosterUI();
    }
    if (gameStatus === 1) stripLoadoutToMeleeOnly(eventPlayer);
    return;
  }

  if (gameStatus === 2) {
    const pPre = serverPlayers.get(playerId);
    if (pPre) {
      pPre.isDeployed = true;
      teleportPlayerToPreliveClusterAnchor(pPre);
    }
    applyPrematch889HealthForPlayer(playerId);
    return;
  }

  if (gameStatus !== 3) return;

  const p = serverPlayers.get(playerId);
  if (!p) return;

  p.isDeployed = true;
  invalidateLivePlayerSpatialHash();
  applyPrematch889HealthForPlayer(playerId);
  applyPhaseInputRestrictionsForPlayer(eventPlayer);
  p.addUI();
  markCaptureTickLoopsDirty();

  const enteringForcedSafeSpawnFlow = safeSpawnForcedUndeploy[playerId] === true;

  // If we spawned near ANY friendly player (<= 8m), do not allow safe-spawn recycling.
  if (isSpawnNearFriendlyPlayer(eventPlayer, playerId, FRIENDLY_SPAWN_BYPASS_RADIUS_METERS)) {
    safeSpawnForcedRedeploys[playerId] = 0;
    if (!enteringForcedSafeSpawnFlow) {
      safeSpawnForcedUndeploy[playerId] = false;
      safeSpawnUnsafePending[playerId] = false;
    }
  }

  // --- SQUAD SPAWN HARD BYPASS (within 8m) ---
  // If the player spawned close to a living squadmate, we do NOT want safe-spawn recycling at all.
  const squadSpawnNow = checkIfSpawnedOnSquadmate(eventPlayer);
  if (squadSpawnNow) {
    squadSpawnBypass[playerId] = true;
    scheduleSquadSpawnBypassClear(playerId);

    // Reset forced redeploy counter so a squad spawn doesn't inherit prior "unsafe" history.
    safeSpawnForcedRedeploys[playerId] = 0;
    if (!enteringForcedSafeSpawnFlow) {
      safeSpawnForcedUndeploy[playerId] = false;
      safeSpawnUnsafePending[playerId] = false;
    }
  } else {
    squadSpawnBypass[playerId] = false;
  }

  mod.SetRedeployTime(eventPlayer, REDEPLOY_TIME);

  const wasForced = enteringForcedSafeSpawnFlow;

  // IMPORTANT: Do NOT overwrite the player's HQ routing while we are in a forced safe-spawn recycle.
  // We only "commit" the route after the safe-spawn check succeeds.
  if (!wasForced && safeSpawnUnsafePending[playerId] !== true) {
    const dyn = modlib.Equals(team, team1) ? currentDynamicHqTeam1 : currentDynamicHqTeam2;
    if (dyn && isValidDynamicSpawnId(dyn)) {
      pendingDynamicHqForPlayer[playerId] = dyn;
    }
  }


  const isFirstLiveDeploy = p.isFirstDeploy();
  const t1DisplayedBefore = getDisplayedTeamTickets(team1);
  const t2DisplayedBefore = getDisplayedTeamTickets(team2);
  if (!wasForced && !isFirstLiveDeploy) {
    if (modlib.Equals(team, team1)) serverScores[0] += DEATH_TICKET_LOSS;
    else serverScores[1] += DEATH_TICKET_LOSS;
  }
  ClampTicketsAndMaybeEndMatch();
  const t1DisplayedAfter = getDisplayedTeamTickets(team1);
  const t2DisplayedAfter = getDisplayedTeamTickets(team2);
  if (t1DisplayedAfter !== t1DisplayedBefore || t2DisplayedAfter !== t2DisplayedBefore) {
    markLiveHudScoresDirty();
    markEndgameSuspenseDirty();
  }

  SafeSpawnCheckOrRedeploy(playerId);
}

async function Mode_OnPlayerUndeploy(eventPlayer: mod.Player): Promise<void> {
  const id = modlib.getPlayerId(eventPlayer);
  const p = serverPlayers.get(id);
  if (!p) return;
  const capturePointBeforeUndeploy = p.getCapturePoint();
  const isForcedSafeSpawnFlowAtUndeploy = safeSpawnUnsafePending[id] === true || safeSpawnForcedUndeploy[id] === true;

  prematchHealthInside889ByPlayerId[id] = false;
  delete prematchHealthAppliedMaxByPlayerId[id];

   // Reset damage spacing state on undeploy
  dmgSpreadClearForPlayer(eventPlayer);

  p.isDeployed = false;
  invalidateLivePlayerSpatialHash();
  stopCaptureBuildupForPlayer(id);
  p.setCapturePoint(null);
  p.resetActiveCaptureProgressUi();
  if (p.activeFlagContainerWidget) {
    mod.SetUIWidgetVisible(p.activeFlagContainerWidget, false);
  }
  clearRestrictedAreaStateForPlayer(id, p.player);
  clearSafeSpawnCheckTimer(id);
  if (!isForcedSafeSpawnFlowAtUndeploy) {
    bumpSafeSpawnGeneration(id);
    clearSafeSpawnRetryTimer(id);
  }
  clearSquadSpawnBypassTimer(id);
  if (isExcludedPlayer(eventPlayer)) {
    ForceRemovePlayerFromAllCapturePoints(id);
    stopCaptureTickLoop(id);
    markCaptureTickLoopsDirty();
    return;
  }
  

  // Countdown/pre-live auto-spawn:
  // If a player redeploys manually (or gets undeployed by the mode) during the countdown,
  // instantly spawn them from their team's initial HQ spawn point so they never land on the tablet.
  if (gameStatus === 1 || gameStatus === 2) {
    const spawnerObjId = getInitialSpawnPointObjIdForTeam(mod.GetTeam(eventPlayer));
    if (spawnerObjId) {
      mod.SetRedeployTime(eventPlayer, 0);
      mod.SpawnPlayerFromSpawnPoint(eventPlayer, spawnerObjId);
    }
    return;
  }

  if (gameStatus === 3) {
    if (capturePointBeforeUndeploy !== null) {
      const cp = serverCapturePoints[capturePointBeforeUndeploy];
      if (cp) invalidateCaptureBuildupSessionForCp(cp.id);
    }
    ForceRemovePlayerFromAllCapturePoints(id);
    stopCaptureTickLoop(id);
    markCaptureTickLoopsDirty();

    if (!isForcedSafeSpawnFlowAtUndeploy) {
      markHqRoutingDirty();

      const team = mod.GetTeam(eventPlayer);
      const dyn = mod.Equals(team, team1) ? currentDynamicHqTeam1 : currentDynamicHqTeam2;
      if (dyn && isValidDynamicSpawnId(dyn)) {
        pendingDynamicHqForPlayer[id] = dyn;
      }
    }
  }

  if (safeSpawnUnsafePending[id] === true) {
    safeSpawnUnsafePending[id] = false;
    safeSpawnUnsafeSpawnerObjId[id] = 0;
    return;
  }

  if (safeSpawnForcedUndeploy[id] === true) return;
  if (gameStatus === 2) return;

  if (gameStatus === 3) p.addDeath();
}

function Mode_OnPlayerInteract(eventPlayer: mod.Player, eventInteractPoint: mod.InteractPoint): void {
  if (isExcludedPlayer(eventPlayer)) return;

  const ipId = mod.GetObjId(eventInteractPoint);

  if (gameStatus === 0) {
    if (ipId === IP_T1_SWITCH || ipId === IP_T2_SWITCH) {
      HandlePrematchSwitchTeams(eventPlayer);
    }

    if (ipId === IP_T1_READY || ipId === IP_T2_READY) {
      HandlePrematchReadyUp(eventPlayer);
    }

    return;
  }

  if (gameStatus === 3) {
    if (ipId === IP_T1_SWITCH || ipId === IP_T2_SWITCH) {
      mod.UndeployPlayer(eventPlayer);

      const p = serverPlayers.get(modlib.getPlayerId(eventPlayer));
      const currentTeam = mod.GetTeam(eventPlayer);

      if (modlib.getTeamId(currentTeam) === 1) {
        mod.SetTeam(eventPlayer, team2);
        p?.setTeam();
      } else {
        mod.SetTeam(eventPlayer, team1);
        p?.setTeam();
      }
    }
  }
}

/* =================================================================================================
   15) CAPTURE EVENTS (ENTER/EXIT / CAPTURED / LOST / CAPTURING)
================================================================================================= */
function SyncPlayersOnPointsFromEngine(): boolean {
  if (gameStatus !== 3) return false;
  let changed = false;

  // --- Reused caches (declare these once at module scope if you haven't yet) ---
  // let _syncStamp = 0;
  // const _seenThisSync: { [playerId: number]: number } = {};
  // const _tmpPlayerToCpId: { [playerId: number]: number } = {};
  // const _tmpPlayerToCpIdKeys: number[] = [];
  // function _tmpPlayerToCpIdSet(playerId: number, cpId: number): void { ... }
  // function _tmpPlayerToCpIdClear(): void { ... }

  _syncStamp += 1;

  // Overwrite each CP's _onPoint list with engine truth (no per-call arrays).
  // Also build a temp player->cpId mapping without allocating a new object.
  for (const k in serverCapturePoints) {
    const cp = serverCapturePoints[k];
    if (!cp) continue;

    cp.clearOnPoint();

    const arr = mod.GetPlayersOnPoint(cp.resolveHandle());

    for (let i = 0; i < mod.CountOf(arr); i++) {
      const pl = mod.ValueInArray(arr, i) as mod.Player;
      if (!mod.IsPlayerValid(pl)) continue;
      if (!kernelIsPlayerAlive(pl)) continue;

      const pid = modlib.getPlayerId(pl);
      const sp = serverPlayers.get(pid);
      if (!sp) continue;
      if (!sp.isDeployed) continue;

      // De-dupe without allocating freshIds or doing indexOf scans
      if (_seenThisSync[pid] === _syncStamp) continue;
      _seenThisSync[pid] = _syncStamp;

      // Add to this CP's on-point list (reuses same array backing store)
      (cp as any)._onPoint.push(pid);

      // Record mapping (reused cache, cleared cheaply later)
      _tmpPlayerToCpIdSet(pid, cp.id);
    }
  }

  // Ensure each player's capture UI state matches engine truth.
  serverPlayers.forEach((sp) => {
    if (!sp) return;

    const newCpId = _tmpPlayerToCpId[sp.id]; // undefined if not on any point
    const oldPointId = sp.getCapturePoint();

    if (newCpId === undefined) {
      if (oldPointId !== null) {
        changed = true;
        invalidateCaptureBuildupSessionForCp(oldPointId);
        stopCaptureBuildupForPlayer(sp.id);
        sp.setCapturePoint(null);
        sp.resetActiveCaptureProgressUi();
        if (sp.activeFlagContainerWidget) mod.SetUIWidgetVisible(sp.activeFlagContainerWidget, false);
        stopCaptureTickLoop(sp.id);
      }
      return;
    }

    const cpWrap = serverCapturePoints[newCpId];
    if (!cpWrap) return;

    if (oldPointId === null || oldPointId !== newCpId) {
      changed = true;
      if (oldPointId !== null) invalidateCaptureBuildupSessionForCp(oldPointId);
      stopCaptureBuildupForPlayer(sp.id);
      sp.setCapturePoint(newCpId);

      if (sp.activeFlagWidget) mod.SetUITextLabel(sp.activeFlagWidget, mod.Message(cpWrap.symbol));
      if (sp.activeFlagContainerWidget) mod.SetUIWidgetVisible(sp.activeFlagContainerWidget, true);
    } else {
      if (sp.activeFlagContainerWidget) mod.SetUIWidgetVisible(sp.activeFlagContainerWidget, true);
    }
  });

  // Clear only keys we set this sync (no new object alloc)
  _tmpPlayerToCpIdClear();
  return changed;
}

function runCapturePointWatchdogSync(): void {
  if (gameStatus !== 3) return;

  const presenceChanged = SyncPlayersOnPointsFromEngine();
  capturePointReconcileFlushes += 1;

  if (!presenceChanged) return;

  Object.values(serverCapturePoints).forEach((cp) => {
    cp.updateUIforPlayersOnPoint();
    cp.setUIProgressForPlayersOnPoint();
  });

  markCaptureTickLoopsDirty();
}






function ForceRemovePlayerFromAllCapturePoints(playerId: number): void {
  stopCaptureTickLoop(playerId);
  stopCaptureBuildupForPlayer(playerId);
  const changedCapturePointIds: number[] = [];

  // Remove from all tracked capture points.
  Object.values(serverCapturePoints).forEach((cp) => {
    if (cp.getPlayerIdsOnPoint().indexOf(playerId) >= 0) changedCapturePointIds.push(cp.id);
    cp.removeOnPoint(playerId);
  });

  for (let i = 0; i < changedCapturePointIds.length; i++) {
    invalidateCaptureBuildupSessionForCp(changedCapturePointIds[i]);
    const capturePoint = serverCapturePoints[changedCapturePointIds[i]];
    if (capturePoint) markCapturePointTopFlagLaneDirty(capturePoint);
  }

  // Clear their local capture UI state if they are still known on server.
  const p = serverPlayers.get(playerId);
  if (p) {
    p.setCapturePoint(null);
    p.resetActiveCaptureProgressUi();
    if (p.activeFlagContainerWidget) mod.SetUIWidgetVisible(p.activeFlagContainerWidget, false);
  }

  // Refresh UI for everyone still on points.
  Object.values(serverCapturePoints).forEach((cp) => cp.updateUIforPlayersOnPoint());
  syncLiveHudTopFlagBlinkTimer();
  markCaptureTickLoopsDirty();
}

function logObjectiveStringKeyDiag(message: string): void {
  if (!DEBUG_OBJECTIVE_STRINGKEY_DIAG) return;
  console.log(message);
}

function evaluateObjectiveHighlightStringKeyHealth(): void {
  if (objectiveHighlightHealthChecked) return;
  objectiveHighlightHealthChecked = true;

  const sk: any = mod.stringkeys as any;
  const requiredKeys = [
    sk.ObjectiveCapturing,
    sk.ObjectiveCapturingEnemy,
    sk.ObjectiveCaptured,
    sk.ObjectiveCapturedEnemy,
    sk.ObjectiveNeutralizing,
    sk.ObjectiveNeutralizingEnemy,
    sk.ObjectiveNeutralised,
    sk.ObjectiveLost,
  ];
  const joinKeys = [sk.PlayerJoined, sk.PlayerReconnected, sk.PlayerDisconnected];

  let valid = true;
  let reason = "ok";

  for (let i = 0; i < requiredKeys.length; i++) {
    const k = requiredKeys[i];
    if (k === undefined || k === null) {
      valid = false;
      reason = "missing_required_key_" + String(i);
      break;
    }
  }

  if (valid) {
    for (let i = 0; i < requiredKeys.length; i++) {
      for (let j = i + 1; j < requiredKeys.length; j++) {
        if (requiredKeys[i] === requiredKeys[j]) {
          valid = false;
          reason = "required_pair_collision_" + String(i) + "_" + String(j);
          break;
        }
      }
      if (!valid) break;
    }
  }

  if (valid) {
    for (let i = 0; i < requiredKeys.length; i++) {
      for (let j = 0; j < joinKeys.length; j++) {
        const jk = joinKeys[j];
        if (jk === undefined || jk === null) continue;
        if (requiredKeys[i] === jk) {
          valid = false;
          reason = "join_collision_req_" + String(i) + "_join_" + String(j);
          break;
        }
      }
      if (!valid) break;
    }
  }

  objectiveHighlightUseLiteralFallback = !valid;

  logObjectiveStringKeyDiag(
    "[OBJECTIVE STRINGKEY DIAG] valid/fallback/reason " +
      (valid ? "1" : "0") +
      "/" +
      (objectiveHighlightUseLiteralFallback ? "1" : "0") +
      "/" +
      reason
  );

  if (!valid && !objectiveHighlightKeyHealthWarned) {
    objectiveHighlightKeyHealthWarned = true;
    console.log("[OBJECTIVE HIGHLIGHT] key health invalid, enabling literal fallback (" + reason + ")");
  }
}

function warnObjectiveHighlightMissingKeyOnce(context: string): void {
  if (objectiveHighlightWarnedMissingKeyByContext[context] === true) return;
  objectiveHighlightWarnedMissingKeyByContext[context] = true;
  console.log("[OBJECTIVE HIGHLIGHT] missing string key for context " + context);
}

function warnObjectiveHighlightMissingSymbolOnce(context: string): void {
  if (objectiveHighlightWarnedMissingSymbolByContext[context] === true) return;
  objectiveHighlightWarnedMissingSymbolByContext[context] = true;
  console.log("[OBJECTIVE HIGHLIGHT] missing objective symbol for context " + context);
}

function warnObjectiveHighlightBuildFailureOnce(context: string): void {
  if (objectiveHighlightWarnedBuildFailureByContext[context] === true) return;
  objectiveHighlightWarnedBuildFailureByContext[context] = true;
  console.log("[OBJECTIVE HIGHLIGHT] failed to build message for context " + context);
}

function buildObjectiveHighlightMessage(
  key: any,
  fallbackTemplate: string,
  symbol: string,
  context: string
): mod.Message | undefined {
  if (typeof symbol !== "string" || symbol.length === 0) {
    warnObjectiveHighlightMissingSymbolOnce(context);
    return;
  }

  evaluateObjectiveHighlightStringKeyHealth();

  if (objectiveHighlightUseLiteralFallback === true) {
    try {
      return mod.Message(fallbackTemplate, symbol);
    } catch (_err) {
      warnObjectiveHighlightBuildFailureOnce(context + "/literal");
      return undefined;
    }
  }

  if (key === undefined || key === null) {
    warnObjectiveHighlightMissingKeyOnce(context);
    try {
      return mod.Message(fallbackTemplate, symbol);
    } catch (_err) {
      warnObjectiveHighlightBuildFailureOnce(context + "/missing_key_literal");
      return undefined;
    }
  }

  try {
    return mod.Message(key, symbol);
  } catch (_err) {
    try {
      return mod.Message(fallbackTemplate, symbol);
    } catch (_err2) {
      warnObjectiveHighlightBuildFailureOnce(context + "/key_and_literal");
      return undefined;
    }
  }
}

function showObjectiveHighlightToTeamStrict(
  key: any,
  fallbackTemplate: string,
  symbol: string,
  team: mod.Team,
  context: string
): void {
  const eventMessage = buildObjectiveHighlightMessage(key, fallbackTemplate, symbol, context);
  if (!eventMessage) {
    return;
  }

  mod.DisplayHighlightedWorldLogMessage(eventMessage, team);
}

function tryGetCapturePointSymbolByObjId(cpObjId: number): string | undefined {
  const cp = serverCapturePoints[cpObjId];
  if (!cp) return undefined;
  if (typeof cp.symbol !== "string" || cp.symbol.length === 0) return undefined;
  return cp.symbol;
}

function getCapturePointFinisherIds(cp: CapturePoint | undefined, ownerTeam: mod.Team): number[] {
  if (!cp) return [];

  const finisherIds: number[] = [];
  const seenByPlayerId: { [playerId: number]: boolean } = {};
  const playerIdsOnPoint = cp.getPlayerIdsOnPoint();

  for (let i = 0; i < playerIdsOnPoint.length; i++) {
    const playerId = playerIdsOnPoint[i];
    if (seenByPlayerId[playerId] === true) continue;
    seenByPlayerId[playerId] = true;

    const sp = serverPlayers.get(playerId);
    if (!sp) continue;
    if (!sp.isDeployed) continue;
    if (!mod.IsPlayerValid(sp.player)) continue;
    if (!kernelIsPlayerAlive(sp.player)) continue;
    if (!mod.Equals(mod.GetTeam(sp.player), ownerTeam)) continue;

    finisherIds.push(playerId);
  }

  return finisherIds;
}

function shouldAnnounceCapturePointPhase(
  cp: CapturePoint,
  phase: CapturePointPhase,
  owner: mod.Team,
  progressTeam: mod.Team
): boolean {
  if (!shouldKeepCapturePointAnnouncement(phase)) return false;
  if (mod.Equals(progressTeam, teamNeutral)) return false;

  return (
    cp.getLastAnnouncedPhase() !== phase ||
    !mod.Equals(cp.getLastAnnouncedOwner(), owner) ||
    !mod.Equals(cp.getLastAnnouncedProgressTeam(), progressTeam)
  );
}

function Mode_OngoingCapturePoint(eventCapturePoint: mod.CapturePoint): void {
  if (gameStatus !== 3) return;

  const cpObjId = mod.GetObjId(eventCapturePoint);
  const cp = serverCapturePoints[cpObjId];
  if (!cp) return;

  const previousSnapshot = createCapturePointStateSnapshot(cp);
  refreshCapturePointFromEngine(cp, true, eventCapturePoint);
  const nextSnapshot = createCapturePointStateSnapshot(cp);

  const stateChanged = didCapturePointStateChange(previousSnapshot, nextSnapshot);
  const presenceChanged = didCapturePointPresenceChange(previousSnapshot, nextSnapshot);
  const controlStateChanged =
    presenceChanged ||
    !mod.Equals(previousSnapshot.owner, nextSnapshot.owner) ||
    !mod.Equals(previousSnapshot.progressTeam, nextSnapshot.progressTeam) ||
    previousSnapshot.contested !== nextSnapshot.contested ||
    previousSnapshot.phase !== nextSnapshot.phase;

  if (!stateChanged && !presenceChanged) {
    return;
  }

  if (!mod.Equals(previousSnapshot.owner, nextSnapshot.owner) || previousSnapshot.phase !== nextSnapshot.phase) {
    markCapturePointTopFlagLaneDirty(cp);
  }

  if (
    !mod.Equals(previousSnapshot.owner, nextSnapshot.owner) ||
    previousSnapshot.phase !== nextSnapshot.phase ||
    previousSnapshot.contested !== nextSnapshot.contested
  ) {
    syncLiveHudTopFlagBlinkTimer();
  }

  if (controlStateChanged) {
    markCaptureTickLoopsDirty();
  }

  if (!mod.Equals(previousSnapshot.owner, nextSnapshot.owner) || previousSnapshot.phase !== nextSnapshot.phase) {
    refreshLiveHqRoutingFromObjectiveEvent(true);
  }
}

function Mode_OnPlayerEnterCapturePoint(eventPlayer: mod.Player, eventCapturePoint: mod.CapturePoint): void {
  if (gameStatus !== 3) return;
  if (!isParticipantPlayer(eventPlayer)) return;

  const team = mod.GetTeam(eventPlayer);
  const id = modlib.getPlayerId(eventPlayer);
  const cpObjId = mod.GetObjId(eventCapturePoint);
  const cp = serverCapturePoints[cpObjId];

  if (!cp) return;

  refreshCapturePointFromEngine(cp, true, eventCapturePoint);
  refreshLiveHqRoutingFromObjectiveEvent(true);
  markCapturePointTopFlagLaneDirty(cp);
  syncLiveHudTopFlagBlinkTimer();

  const lastEnter = lastEnterPointSfxTickByPlayerId[id] ?? -999999;
  if (phaseTickCount - lastEnter >= ENTER_POINT_SFX_COOLDOWN_TICKS) {
    lastEnterPointSfxTickByPlayerId[id] = phaseTickCount;

    if (mod.Equals(cp.getOwner(), team) || mod.Equals(cp.getOwner(), teamNeutral)) playThumpFriendly(eventPlayer);
    else playThumpEnemy(eventPlayer);
  }

  const onpoint = cp.getOnPoint();
  const playerTeamIndex: 0 | 1 = mod.Equals(team, team1) ? 0 : 1;
  const before: number[] = [onpoint[0], onpoint[1]];
  before[playerTeamIndex] = mod.Max(0, before[playerTeamIndex] - 1);

  const myIdx: 0 | 1 = mod.Equals(team, team1) ? 0 : 1;
  const otherIdx: 0 | 1 = myIdx === 0 ? 1 : 0;

  const myBefore = before[myIdx];
  const myAfter = onpoint[myIdx];
  const enemyAfter = onpoint[otherIdx];

  const ownerTeam = cp.getOwner();

  const teammateJoined = myBefore >= 1 && myAfter >= 2 && enemyAfter === 0 && !mod.Equals(ownerTeam, team);

  if (teammateJoined) {
    const cpId = cpObjId;

    if (canPlayCpSfx(SFX_JOIN_CD_TICKS, lastJoinSfxTickByCp, cpId)) {
      markCpSfx(lastJoinSfxTickByCp, cpId);

      serverPlayers.forEach((sp) => {
        if (!mod.Equals(mod.GetTeam(sp.player), team)) return;

        const onCpId = sp.getCapturePoint();
        if (onCpId === null) return;
        if (onCpId !== cpId) return;
        if (sp.id === id) return;

        playTickFriendly(sp.player);
      });
    }
  }

  markCaptureTickLoopsDirty();
}

function Mode_OnPlayerExitCapturePoint(eventPlayer: mod.Player, eventCapturePoint: mod.CapturePoint): void {
  if (gameStatus !== 3) return;
  if (!isParticipantPlayer(eventPlayer)) return;

  const cp = serverCapturePoints[mod.GetObjId(eventCapturePoint)];
  const playerId = modlib.getPlayerId(eventPlayer);
  if (!cp) return;

  refreshCapturePointFromEngine(cp, true, eventCapturePoint);
  refreshLiveHqRoutingFromObjectiveEvent(true);
  markCapturePointTopFlagLaneDirty(cp);
  syncLiveHudTopFlagBlinkTimer();

  const playerState = serverPlayers.get(playerId);
  if (playerState && playerState.getCapturePoint() === null) {
    stopCaptureTickLoop(playerId);
  }

  markCaptureTickLoopsDirty();
}

function Mode_OnCapturePointCaptured(flag: mod.CapturePoint): void {
  if (gameStatus !== 3) return;
  const id = mod.GetObjId(flag);
  const cpWrap = serverCapturePoints[id];
  if (!cpWrap) return;

  refreshCapturePointFromEngine(cpWrap, true, flag);
  refreshLiveHqRoutingFromObjectiveEvent(true);

  const team = cpWrap.getOwner();
  if (mod.Equals(team, teamNeutral)) return;
  const cpObjId = mod.GetObjId(flag);
  const finisherIds = getCapturePointFinisherIds(cpWrap, team);
  const symbol = cpWrap.symbol;
  const highlightSymbol = tryGetCapturePointSymbolByObjId(id);
  invalidateCaptureBuildupSessionForCp(cpObjId);

  const playerIdsOnPoint = cpWrap.getPlayerIdsOnPoint();
  for (let i = 0; i < playerIdsOnPoint.length; i++) {
    stopCaptureTickLoop(playerIdsOnPoint[i]);
  }

  for (let i = 0; i < finisherIds.length; i++) {
    const finisherId = finisherIds[i];
    const sp = serverPlayers.get(finisherId);
    if (!sp) continue;

    sp.addCapture();
    sp.addScore(150);
  }

  // Push scoreboard refresh through dirty-lane so we avoid extra full-player loops this frame.
  markScoreboardDirty();
  markCapturePointTopFlagLaneDirty(cpWrap);
  syncLiveHudTopFlagBlinkTimer();
  cpWrap.clearAnnouncementState();



  if (modlib.Equals(team, team1)) {
    showObjectiveHighlightToTeamStrict(
      mod.stringkeys.ObjectiveCaptured,
      "Objective {} captured",
      highlightSymbol ?? "",
      team1,
      "OnCapturePointCaptured/ObjectiveCaptured/team1"
    );
    showObjectiveHighlightToTeamStrict(
      mod.stringkeys.ObjectiveCapturedEnemy,
      "Objective {} captured by enemy team",
      highlightSymbol ?? "",
      team2,
      "OnCapturePointCaptured/ObjectiveCapturedEnemy/team2"
    );
  } else {
    showObjectiveHighlightToTeamStrict(
      mod.stringkeys.ObjectiveCaptured,
      "Objective {} captured",
      highlightSymbol ?? "",
      team2,
      "OnCapturePointCaptured/ObjectiveCaptured/team2"
    );
    showObjectiveHighlightToTeamStrict(
      mod.stringkeys.ObjectiveCapturedEnemy,
      "Objective {} captured by enemy team",
      highlightSymbol ?? "",
      team1,
      "OnCapturePointCaptured/ObjectiveCapturedEnemy/team1"
    );
  }

  if (canPlayCpSfx(SFX_CAPTURE_CD_TICKS, lastCaptureSfxTickByCp, id)) {
    markCpSfx(lastCaptureSfxTickByCp, id);

    for (let i = 0; i < finisherIds.length; i++) {
      const sp = serverPlayers.get(finisherIds[i]);
      if (!sp) continue;
      playCapturedSfx(sp.player);
    }
    playVOToTeam(team, mod.VoiceOverEvents2D.ObjectiveCaptured, voflags[symbol]);

    const enemyTeam = mod.Equals(team, team1) ? team2 : team1;
    playVOToTeam(enemyTeam, mod.VoiceOverEvents2D.ObjectiveCapturedEnemy, voflags[symbol]);
  }

  markCaptureTickLoopsDirty();
}

function OnCapturePointNeutralizing(flag: mod.CapturePoint, team: mod.Team): void {
  if (gameStatus !== 3) return;

  const id = mod.GetObjId(flag);
  const cp = serverCapturePoints[id];
  if (!cp || mod.Equals(team, teamNeutral)) return;
  const symbol = cp.symbol;
  const highlightSymbol = tryGetCapturePointSymbolByObjId(id);

  const owner = cp.getOwner();
  const defenders = owner;

  if (!mod.Equals(defenders, teamNeutral) && !mod.Equals(defenders, team)) {
    if (canPlayCpSfx(SFX_CONTEST_CD_TICKS, lastContestSfxTickByCp, id)) {
      markCpSfx(lastContestSfxTickByCp, id);

      playSfxToTeam(defenders, "tickEnemy");
      playVOToTeam(defenders, mod.VoiceOverEvents2D.ObjectiveContested, voflags[symbol]);
    }
  }

  if (modlib.Equals(team, team1)) {
    showObjectiveHighlightToTeamStrict(
      mod.stringkeys.ObjectiveNeutralizing,
      "Objective {} being neutralized",
      highlightSymbol ?? "",
      team1,
      "OnCapturePointNeutralizing/ObjectiveNeutralizing/team1"
    );
    showObjectiveHighlightToTeamStrict(
      mod.stringkeys.ObjectiveNeutralizingEnemy,
      "Objective {} being neutralized by enemy team",
      highlightSymbol ?? "",
      team2,
      "OnCapturePointNeutralizing/ObjectiveNeutralizingEnemy/team2"
    );
  } else {
    showObjectiveHighlightToTeamStrict(
      mod.stringkeys.ObjectiveNeutralizing,
      "Objective {} being neutralized",
      highlightSymbol ?? "",
      team2,
      "OnCapturePointNeutralizing/ObjectiveNeutralizing/team2"
    );
    showObjectiveHighlightToTeamStrict(
      mod.stringkeys.ObjectiveNeutralizingEnemy,
      "Objective {} being neutralized by enemy team",
      highlightSymbol ?? "",
      team1,
      "OnCapturePointNeutralizing/ObjectiveNeutralizingEnemy/team1"
    );
  }

  markCapturePointTopFlagLaneDirty(cp);
  syncLiveHudTopFlagBlinkTimer();
  markCaptureTickLoopsDirty();
}

function Mode_OnCapturePointLost(flag: mod.CapturePoint): void {
  if (gameStatus !== 3) return;
  const id = mod.GetObjId(flag);
  const cp = serverCapturePoints[id];
  if (!cp) return;

  refreshCapturePointFromEngine(cp, true, flag);
  refreshLiveHqRoutingFromObjectiveEvent(true);

  invalidateCaptureBuildupSessionForCp(id);
  const symbol = cp.symbol;
  const highlightSymbol = tryGetCapturePointSymbolByObjId(id);
  markCapturePointTopFlagLaneDirty(cp);
  syncLiveHudTopFlagBlinkTimer();
  cp.clearAnnouncementState();

  const team = mod.GetPreviousOwnerTeam(flag);
  if (mod.Equals(team, teamNeutral)) return;

  if (modlib.Equals(team, team1)) {
    showObjectiveHighlightToTeamStrict(
      mod.stringkeys.ObjectiveNeutralised,
      "Objective {} neutralized",
      highlightSymbol ?? "",
      team1,
      "OnCapturePointLost/ObjectiveNeutralised/team1"
    );
    showObjectiveHighlightToTeamStrict(
      mod.stringkeys.ObjectiveLost,
      "Objective {} lost",
      highlightSymbol ?? "",
      team2,
      "OnCapturePointLost/ObjectiveLost/team2"
    );
  } else {
    showObjectiveHighlightToTeamStrict(
      mod.stringkeys.ObjectiveNeutralised,
      "Objective {} neutralized",
      highlightSymbol ?? "",
      team2,
      "OnCapturePointLost/ObjectiveNeutralised/team2"
    );
    showObjectiveHighlightToTeamStrict(
      mod.stringkeys.ObjectiveLost,
      "Objective {} lost",
      highlightSymbol ?? "",
      team1,
      "OnCapturePointLost/ObjectiveLost/team1"
    );
  }

  markCaptureTickLoopsDirty();
}

function Mode_OnCapturePointCapturing(flag: mod.CapturePoint): void {
  if (gameStatus !== 3) return;
  const cpObjId = mod.GetObjId(flag);
  const cp = serverCapturePoints[cpObjId];
  if (!cp) return;

  refreshCapturePointFromEngine(cp, true, flag);
  refreshLiveHqRoutingFromObjectiveEvent(true);

  const highlightSymbol = tryGetCapturePointSymbolByObjId(cpObjId);
  markCapturePointTopFlagLaneDirty(cp);
  syncLiveHudTopFlagBlinkTimer();

  const phase = cp.getLastSampledPhase();
  const owner = cp.getOwner();
  const team = cp.getProgressTeam();
  const previousOwner = mod.GetPreviousOwnerTeam(flag);
  const suppressInitialCaptureAnnouncementAfterNeutralize =
    phase === "capturing_neutral" &&
    mod.Equals(owner, teamNeutral) &&
    !mod.Equals(previousOwner, teamNeutral) &&
    cp.getCaptureProgress() <= 0.05;

  if (!shouldAnnounceCapturePointPhase(cp, phase, owner, team)) {
    markCaptureTickLoopsDirty();
    return;
  }

  if (phase === "neutralizing_enemy") {
    OnCapturePointNeutralizing(flag, team);
    cp.setAnnouncementState(phase, owner, team);
    return;
  }

  if (
    phase !== "capturing_neutral" ||
    mod.Equals(team, teamNeutral) ||
    suppressInitialCaptureAnnouncementAfterNeutralize
  ) {
    markCaptureTickLoopsDirty();
    return;
  }

  if (modlib.Equals(team, team1)) {
    showObjectiveHighlightToTeamStrict(
      mod.stringkeys.ObjectiveCapturing,
      "Objective {} being captured",
      highlightSymbol ?? "",
      team1,
      "OnCapturePointCapturing/ObjectiveCapturing/team1"
    );
    showObjectiveHighlightToTeamStrict(
      mod.stringkeys.ObjectiveCapturingEnemy,
      "Objective {} being attacked by enemy team",
      highlightSymbol ?? "",
      team2,
      "OnCapturePointCapturing/ObjectiveCapturingEnemy/team2"
    );
  } else if (modlib.Equals(team, team2)) {
    showObjectiveHighlightToTeamStrict(
      mod.stringkeys.ObjectiveCapturing,
      "Objective {} being captured",
      highlightSymbol ?? "",
      team2,
      "OnCapturePointCapturing/ObjectiveCapturing/team2"
    );
    showObjectiveHighlightToTeamStrict(
      mod.stringkeys.ObjectiveCapturingEnemy,
      "Objective {} being attacked by enemy team",
      highlightSymbol ?? "",
      team1,
      "OnCapturePointCapturing/ObjectiveCapturingEnemy/team1"
    );
  }

  cp.setAnnouncementState(phase, owner, team);
  markCaptureTickLoopsDirty();
}

/* =================================================================================================
   16) COMBAT EVENTS
================================================================================================= */
/* =================================================================================================
   DAMAGE SPACING (NO DAMAGE FACTORS)
   - Keeps total damage the same
   - Spaces incoming damage over a short window based on distance
   - Uses Heal() to undo the instant hit, then DealDamage() to re-apply over time
================================================================================================= */

const DMG_SPREAD_CLOSE_MAX_DIST = RULES.gameplay.damage.smoothingSpread.closeMaxDist;
const DMG_SPREAD_MID_MAX_DIST = RULES.gameplay.damage.smoothingSpread.midMaxDist;

// Tune these (seconds). Close range = more delay, long range = less delay.
const DMG_SPREAD_CLOSE_SEC = RULES.gameplay.damage.smoothingSpread.closeSeconds; // 0-10m
const DMG_SPREAD_MID_SEC = RULES.gameplay.damage.smoothingSpread.midSeconds;   // 10-25m
const DMG_SPREAD_FAR_SEC = RULES.gameplay.damage.smoothingSpread.farSeconds;   // 25m+

// Per-player health cache (LIVE only)
let dmgLastHealth: { [playerId: number]: number } = {};

// Per-player queued damage
let dmgQueued: { [playerId: number]: number } = {};
let dmgQueuedTicksLeft: { [playerId: number]: number } = {};
let dmgQueuedGiverObjId: { [playerId: number]: number } = {};
// Track only victims currently needing smoothing work
let dmgActive: { [playerId: number]: boolean } = {};
let dmgActiveIds: number[] = [];

// Guard to prevent our own re-applied DealDamage() from being re-smoothed
let dmgIsReapplying: { [playerId: number]: boolean } = {};
// Health-based delay scaling:
//  - 1.0 health => 100% of base delay
//  - 0.0 health => MIN factor of base delay
const DMG_SPREAD_HEALTH_DELAY_MIN_FACTOR = RULES.gameplay.damage.smoothingSpread.minHealthDelayFactor; // <= 1.0 (lower = faster when low HP)
const DMG_SPREAD_HEALTH_DELAY_MAX_FACTOR = RULES.gameplay.damage.smoothingSpread.maxHealthDelayFactor;  // keep at 1.0

function dmgGetNormalizedHealth(player: mod.Player): number {
  // SDK supports NormalizedHealth (0..1)
  return mod.GetSoldierState(player, mod.SoldierStateNumber.NormalizedHealth);
}

function dmgSpreadApplyHealthDelayScale(baseTicks: number, normalizedHealth: number): number {
  // Clamp 0..1 without relying on Math.min/max
  let h = normalizedHealth;
  if (typeof h !== "number" || !Number.isFinite(h)) h = 1;
  if (h < 0) h = 0;
  if (h > 1) h = 1;

  // Scale factor = min + (max-min)*h
  const factor =
    DMG_SPREAD_HEALTH_DELAY_MIN_FACTOR +
    (DMG_SPREAD_HEALTH_DELAY_MAX_FACTOR - DMG_SPREAD_HEALTH_DELAY_MIN_FACTOR) * h;

  const scaled = mod.Ceiling(baseTicks * factor);
  return scaled < 1 ? 1 : scaled;
}

function dmgMarkActive(id: number): void {
  if (dmgActive[id] === true) return;
  dmgActive[id] = true;
  dmgActiveIds.push(id);
}

function dmgUnmarkActive(id: number): void {
  if (dmgActive[id] !== true) return;
  dmgActive[id] = false;
  const idx = dmgActiveIds.indexOf(id);
  if (idx >= 0) dmgActiveIds.splice(idx, 1);
}

function dmgSpreadSecondsToTicks(sec: number): number {
  const raw = mod.Ceiling(sec * TICK_RATE);
  return raw < 1 ? 1 : raw;
}

function dmgSpreadDistanceMeters(victim: mod.Player, attacker: mod.Player): number {
  if (!mod.IsPlayerValid(attacker)) return 99999;
  if (!kernelIsPlayerAlive(victim)) return 99999;
  if (!kernelIsPlayerAlive(attacker)) return 99999;

  const vPos = getPlayerPosition(victim);
  const aPos = getPlayerPosition(attacker);
  return mod.DistanceBetween(vPos, aPos);
}

function dmgSpreadPickTicks(distanceMeters: number): number {
  if (distanceMeters <= DMG_SPREAD_CLOSE_MAX_DIST) return dmgSpreadSecondsToTicks(DMG_SPREAD_CLOSE_SEC);
  if (distanceMeters <= DMG_SPREAD_MID_MAX_DIST) return dmgSpreadSecondsToTicks(DMG_SPREAD_MID_SEC);
  return dmgSpreadSecondsToTicks(DMG_SPREAD_FAR_SEC);
}

function dmgGetCurrentHealth(player: mod.Player): number {
  return mod.GetSoldierState(player, mod.SoldierStateNumber.CurrentHealth);
}

// Update cached health for all deployed alive players during LIVE
function dmgSpreadUpdateHealthCacheTick(): void {
  if (gameStatus !== 3) return;

  serverPlayers.forEach((sp) => {
    if (!sp || !sp.isDeployed) return;
    if (!mod.IsPlayerValid(sp.player)) return;
    if (!kernelIsPlayerAlive(sp.player)) return;

    dmgLastHealth[sp.id] = dmgGetCurrentHealth(sp.player);
  });
}

// Apply queued damage smoothly during LIVE (ONLY for active damaged victims)
function dmgSpreadProcessQueueTick(): void {
  if (gameStatus !== 3) return;
  if (dmgActiveIds.length <= 0) return;

  // Iterate backwards so we can safely remove entries
  for (let i = dmgActiveIds.length - 1; i >= 0; i--) {
    const id = dmgActiveIds[i];

    const sp = serverPlayers.get(id);
    if (!sp || !sp.isDeployed || !mod.IsPlayerValid(sp.player) || !kernelIsPlayerAlive(sp.player)) {
      // Player gone / invalid: stop processing them
      dmgQueued[id] = 0;
      dmgQueuedTicksLeft[id] = 0;
      dmgQueuedGiverObjId[id] = 0;
      dmgUnmarkActive(id);
      continue;
    }

    const remaining = dmgQueued[id] ?? 0;
    let ticksLeft = dmgQueuedTicksLeft[id] ?? 0;

    // Nothing left to do => deactivate
    if (remaining <= 0 || ticksLeft <= 0) {
      dmgQueued[id] = 0;
      dmgQueuedTicksLeft[id] = 0;
      dmgQueuedGiverObjId[id] = 0;
      dmgUnmarkActive(id);
      continue;
    }

    // Spread evenly. Use Ceiling so it always finishes.
    let step = mod.Ceiling(remaining / ticksLeft);
    if (step < 1) step = 1;
    if (step > remaining) step = remaining;

    // Optional giver for kill credit (best-effort)
    const giverObjId = dmgQueuedGiverObjId[id] ?? 0;
    let giver: mod.Player | null = null;

    if (giverObjId !== 0) {
      const found = findServerPlayerByObjId(giverObjId);
      if (found && mod.IsPlayerValid(found.player)) giver = found.player;
    }

    // IMPORTANT: prevent re-smoothing our own scripted DealDamage
    dmgIsReapplying[id] = true;
    try {
      if (giver) mod.DealDamage(sp.player, step, giver);
      else mod.DealDamage(sp.player, step);
    } finally {
      dmgIsReapplying[id] = false;
    }

    dmgQueued[id] = remaining - step;
    ticksLeft -= 1;
    dmgQueuedTicksLeft[id] = ticksLeft;

    if (dmgQueued[id] <= 0 || dmgQueuedTicksLeft[id] <= 0) {
      dmgQueued[id] = 0;
      dmgQueuedTicksLeft[id] = 0;
      dmgQueuedGiverObjId[id] = 0;
      dmgUnmarkActive(id);
    }
  }
}


// Clear queue state for a player (call on deploy/undeploy)
function dmgSpreadClearForPlayer(player: mod.Player): void {
  if (!mod.IsPlayerValid(player)) return;
  const id = modlib.getPlayerId(player);

  dmgQueued[id] = 0;
  dmgQueuedTicksLeft[id] = 0;
  dmgQueuedGiverObjId[id] = 0;

  dmgIsReapplying[id] = false;
  dmgUnmarkActive(id);

  if (mod.IsPlayerValid(player) && kernelIsPlayerAlive(player)) {
    dmgLastHealth[id] = dmgGetCurrentHealth(player);
  } else {
    dmgLastHealth[id] = 0;
  }
}


function Mode_OnPlayerDamaged(
  eventPlayer: mod.Player,      // victim
  eventOtherPlayer: mod.Player, // attacker
  eventDamageType: mod.DamageType,
  eventWeaponUnlock: mod.WeaponUnlock
): void {
  if (!mod.IsPlayerValid(eventPlayer)) return;
  if (!isParticipantPlayer(eventPlayer)) return;
  if (mod.IsPlayerValid(eventOtherPlayer) && isExcludedPlayer(eventOtherPlayer)) return;

  const victimId = modlib.getPlayerId(eventPlayer);

  // Prematch 889 rule:
  // - outside 889: full non-lethal protection (always force full heal)
  // - inside 889: no protection, player can be killed/downed normally
  if (isPrematchOutside889(victimId)) {
    forcePrematchOutside889FullHeal(eventPlayer, victimId);
    return;
  }

  if (!kernelIsPlayerAlive(eventPlayer)) return;

  const sp = serverPlayers.get(victimId);
  if (!sp) return;

  // LIVE only
  if (gameStatus !== 3) return;
  if (!sp.isDeployed) return;

  const cur = dmgGetCurrentHealth(eventPlayer);

  // Toggle: if smoothing is disabled, just keep health cache updated and do nothing.
  if (!ENABLE_DAMAGE_SMOOTHING) {
    dmgLastHealth[victimId] = cur;
    return;
  }

  const healthNormAfterHit = dmgGetNormalizedHealth(eventPlayer);


  // If this damage came from our own queued re-application, just update cache and stop.
  if (dmgIsReapplying[victimId] === true) {
    dmgLastHealth[victimId] = cur;
    return;
  }

  // If not player-vs-player (world/zone/etc), do NOT smooth; just keep cache updated.
  if (!mod.IsPlayerValid(eventOtherPlayer) || mod.Equals(eventPlayer, eventOtherPlayer)) {
    dmgLastHealth[victimId] = cur;
    return;
  }

  // Only smooth enemy damage
  const vTeam = mod.GetTeam(eventPlayer);
  const aTeam = mod.GetTeam(eventOtherPlayer);
  if (mod.Equals(vTeam, aTeam)) {
    dmgLastHealth[victimId] = cur;
    return;
  }

  const prev = dmgLastHealth[victimId];

  // If cache is missing, initialize and do nothing this hit (avoids bad deltas)
  if (typeof prev !== "number" || !Number.isFinite(prev) || prev <= 0) {
    dmgLastHealth[victimId] = cur;
    return;
  }

  const delta = prev - cur;
  if (delta <= 0) {
    dmgLastHealth[victimId] = cur;
    return;
  }

  // Undo the instant damage
  mod.Heal(eventPlayer, delta);

  // Restore cache to the healed value
  dmgLastHealth[victimId] = prev;

  // Queue the same damage to be applied over time
  const dist = dmgSpreadDistanceMeters(eventPlayer, eventOtherPlayer);
  const baseTicks = dmgSpreadPickTicks(dist);
  const spreadTicks = dmgSpreadApplyHealthDelayScale(baseTicks, healthNormAfterHit);


  dmgQueued[victimId] = (dmgQueued[victimId] ?? 0) + delta;
  dmgQueuedTicksLeft[victimId] = spreadTicks;

  // Best-effort store giver ObjId for credit
  dmgQueuedGiverObjId[victimId] = mod.GetObjId(eventOtherPlayer);

  // Mark victim active so queue processing runs ONLY for them
  dmgMarkActive(victimId);
}

function Mode_OnMandown(eventPlayer: mod.Player, eventOtherPlayer: mod.Player): void {
  if (!mod.IsPlayerValid(eventPlayer)) return;
  if (!isParticipantPlayer(eventPlayer)) return;
  if (mod.IsPlayerValid(eventOtherPlayer) && isExcludedPlayer(eventOtherPlayer)) return;

  const playerId = modlib.getPlayerId(eventPlayer);
  if (!isPrematchOutside889(playerId)) return;

  // Prematch outside 889 must never stay in mandown.
  forcePrematchOutside889FullHeal(eventPlayer, playerId);
}




function Mode_OnPlayerEarnedKill(
  eventPlayer: mod.Player,
  eventOtherPlayer: mod.Player,
  eventDeathType: mod.DeathType,
  eventWeaponUnlock: mod.WeaponUnlock
): void {
  if (gameStatus !== 3) return;
  if (!isParticipantPlayer(eventPlayer)) return;
  if (mod.IsPlayerValid(eventOtherPlayer) && isExcludedPlayer(eventOtherPlayer)) return;

  const p = serverPlayers.get(modlib.getPlayerId(eventPlayer));
  if (!p) return;

  if (mod.NotEqualTo(eventPlayer, eventOtherPlayer)) {
    p.addKill();
    p.addScore(100);
  }
}

function Mode_OnPlayerEarnedKillAssist(eventPlayer: mod.Player, eventOtherPlayer: mod.Player): void {
  if (gameStatus !== 3) return;
  if (!isParticipantPlayer(eventPlayer)) return;
  if (mod.IsPlayerValid(eventOtherPlayer) && isExcludedPlayer(eventOtherPlayer)) return;

  const p = serverPlayers.get(modlib.getPlayerId(eventPlayer));
  if (!p) return;

  p.addKillAssist();
  p.addScore(50);
}

/* =================================================================================================
   17) DAMAGE ZONE EVENTS
================================================================================================= */

function tryGetAreaTriggerIdSafe(
  eventAreaTrigger: mod.AreaTrigger,
  context: string
): number | undefined {
  try {
    return mod.GetObjId(eventAreaTrigger);
  } catch (err) {
    LogRuntimeError("AreaTriggerId/" + context, err);
    return undefined;
  }
}

function Mode_OnPlayerEnterAreaTrigger(eventPlayer: mod.Player, eventAreaTrigger: mod.AreaTrigger): void {
  if (!isParticipantPlayer(eventPlayer)) return;

  try {
    const triggerId = tryGetAreaTriggerIdSafe(eventAreaTrigger, "OnPlayerEnterAreaTrigger");
    if (triggerId === undefined) return;
    const playerId = modlib.getPlayerId(eventPlayer);

    if (triggerId === PREMATCH_HEALTH_AREA_TRIGGER_ID) {
      if (gameStatus === 0) {
        prematchHealthInside889ByPlayerId[playerId] = true;
        applyPrematch889HealthForPlayer(playerId);
      }
      return;
    }

    if (gameStatus === 0) {
      if (!mod.IsPlayerValid(eventPlayer)) return;
      if (!kernelIsPlayerAliveSafe(eventPlayer)) return;

      const playerTeam = mod.GetTeam(eventPlayer);
      if (triggerId === PREMATCH_TEAM1_KILL_TRIGGER_ID && mod.Equals(playerTeam, team1)) {
        mod.DealDamage(eventPlayer, 9999);
        return;
      }

      if (triggerId === PREMATCH_TEAM2_KILL_TRIGGER_ID && mod.Equals(playerTeam, team2)) {
        mod.DealDamage(eventPlayer, 9999);
        return;
      }
    }

    if (gameStatus !== 3) return;

    const p = serverPlayers.get(playerId);
    if (!p) return;

    // Existing damage zone
    if (triggerId === DAMAGE_TRIGGER_ID) {
      playerInDamageZone[playerId] = true;
      return;
    }

    // Restricted area
    if (shouldApplyRestrictedAreaTriggerToPlayer(eventPlayer, triggerId)) {
      addRestrictedAreaTriggerForPlayer(playerId, triggerId);
      if (playerInRestrictedArea[playerId] === true) return;

      playerInRestrictedArea[playerId] = true;
      startRestrictedAreaCountdown(p);
      return;
    }
  } catch (err) {
    LogRuntimeError("OnPlayerEnterAreaTrigger", err);
  }
}


function Mode_OnPlayerExitAreaTrigger(eventPlayer: mod.Player, eventAreaTrigger: mod.AreaTrigger): void {
  if (!isParticipantPlayer(eventPlayer)) return;

  try {
    const triggerId = tryGetAreaTriggerIdSafe(eventAreaTrigger, "OnPlayerExitAreaTrigger");
    if (triggerId === undefined) return;
    const playerId = modlib.getPlayerId(eventPlayer);

    if (triggerId === PREMATCH_HEALTH_AREA_TRIGGER_ID) {
      if (gameStatus === 0) {
        prematchHealthInside889ByPlayerId[playerId] = false;
        applyPrematch889HealthForPlayer(playerId);
      }
      return;
    }

    if (gameStatus !== 3) return;

    // Existing damage zone
    if (triggerId === DAMAGE_TRIGGER_ID) {
      playerInDamageZone[playerId] = false;
      return;
    }

    // Restricted area
    if (isManagedRestrictedAreaTrigger(triggerId)) {
      const removedTrackedTrigger = removeRestrictedAreaTriggerForPlayer(playerId, triggerId);
      if (!removedTrackedTrigger) return;
      if (hasActiveRestrictedAreaTrigger(playerId)) return;

      const p = serverPlayers.get(playerId);
      clearRestrictedAreaStateForPlayer(playerId, p?.player);
      return;
    }
  } catch (err) {
    LogRuntimeError("OnPlayerExitAreaTrigger", err);
  }
}

export const KernelCombatBridge = {
  onPlayerDamaged: Mode_OnPlayerDamaged,
  onMandown: Mode_OnMandown,
  onPlayerEarnedKill: Mode_OnPlayerEarnedKill,
  onPlayerEarnedKillAssist: Mode_OnPlayerEarnedKillAssist,
  processLiveTick: runLegacyCombatLiveTick,
};

export const KernelObjectiveBridge = {
  onPlayerEnterCapturePoint: Mode_OnPlayerEnterCapturePoint,
  onPlayerExitCapturePoint: Mode_OnPlayerExitCapturePoint,
  onOngoingCapturePoint: Mode_OngoingCapturePoint,
  onCapturePointCaptured: Mode_OnCapturePointCaptured,
  onCapturePointLost: Mode_OnCapturePointLost,
  onCapturePointCapturing: Mode_OnCapturePointCapturing,
  processLiveFastTick: runLegacyObjectiveFastLiveTick,
  processLiveSlowTick: runLegacyObjectiveSlowLiveTick,
};

export const KernelSpawnRoutingBridge = {
  onPlayerDeployed: Mode_OnPlayerDeployed,
  onPlayerUndeploy: Mode_OnPlayerUndeploy,
  processLiveRoutingTick: runLegacySpawnRoutingLiveTick,
};

export const KernelKothModeHandlers = {
  OnGameModeStarted: Mode_OnGameModeStarted,
  OnGameModeEnding: Mode_OnGameModeEnding,
  OngoingGlobal: Mode_OngoingGlobal,
  OnPlayerJoinGame: Mode_OnPlayerJoinGame,
  OnPlayerLeaveGame: Mode_OnPlayerLeaveGame,
  OnPlayerDeployed: Mode_OnPlayerDeployed,
  OnPlayerUndeploy: Mode_OnPlayerUndeploy,
  OnPlayerInteract: Mode_OnPlayerInteract,
  OnPlayerUIButtonEvent: Mode_OnPlayerUIButtonEvent,
  OnPlayerEnterCapturePoint: Mode_OnPlayerEnterCapturePoint,
  OnPlayerExitCapturePoint: Mode_OnPlayerExitCapturePoint,
  OngoingCapturePoint: Mode_OngoingCapturePoint,
  OnCapturePointCaptured: Mode_OnCapturePointCaptured,
  OnCapturePointLost: Mode_OnCapturePointLost,
  OnCapturePointCapturing: Mode_OnCapturePointCapturing,
  OnPlayerDamaged: Mode_OnPlayerDamaged,
  OnMandown: Mode_OnMandown,
  OnPlayerEarnedKill: Mode_OnPlayerEarnedKill,
  OnPlayerEarnedKillAssist: Mode_OnPlayerEarnedKillAssist,
  OnPlayerEnterAreaTrigger: Mode_OnPlayerEnterAreaTrigger,
  OnPlayerExitAreaTrigger: Mode_OnPlayerExitAreaTrigger,
};



































