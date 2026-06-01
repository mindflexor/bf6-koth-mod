/* =================================================================================================
   Mind Flexor - Domination (3-Flag) Game Mode Script
   -------------------------------------------------------------------------------------------------
   

   Description:
     - Implements a 3-flag Domination / Conquest-Small style mode:
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

   Intellectual Property / Restrictions:
     - This code is the property of mindflexor. 
     - Credits: BattlefieldDad, Mancour, uberdubersoldat, and dfk_7677 for some logic used. Mind Flexor w/ main development.
     - Unauthorized copying, redistribution, or reuse is not allowed without explicit permission.

   Version:
     - v3.5.5
================================================================================================= */

import { Timers } from "bf6-portal-utils/timers/index.ts";

import { modlib } from "../utils/mod-compat.ts";

/* =================================================================================================
   1) CORE CONFIGURATION
================================================================================================= */

const VERSION = [1, 4, 4];

const TICK_RATE = 30;                    // OngoingGlobal is treated as 30 ticks/sec

// Performance throttles (reduce per-tick work to avoid server Hz drops)
const LIVE_FAST_UPDATE_INTERVAL_TICKS = mod.Max(1, mod.Floor(TICK_RATE / 10)); // ~10 Hz
const LIVE_SLOW_UPDATE_INTERVAL_TICKS = mod.Max(1, mod.Floor(TICK_RATE / 3));  // ~3.3 Hz
const LIVE_ENDGAME_AUDIO_INTERVAL_TICKS = mod.Max(1, mod.Floor(TICK_RATE / 2)); // ~2 Hz
const INITIAL_TICKETS = 200;

const ROUND_TIME = 1200;                // seconds
const TOTAL_TICKS = ROUND_TIME * TICK_RATE;

const COUNT_DOWN_TIME = 5;              // seconds (redeploy countdown)
const PRELIVE_TIME = 15;                // seconds (pre-live freeze)
const POSTMATCH_TIME = 20;              // seconds

const REDEPLOY_TIME = 10;               // live redeploy time
const DEATH_TICKET_LOSS = -1;           // tickets after first live deploy

const BLEED_TWO_FLAGS = -0.66;           // per second
const BLEED_THREE_FLAGS = -1;           // per second
const BLEED_ONE_FLAG = -0.33;

// Damage smoothing (applies in OnPlayerDamaged)
const ENABLE_DAMAGE_SMOOTHING = true;   // set to false to disable smoothing


const CAPTURE_TIME = 6;                 // seconds to capture neutral -> owned
const NEUTRALIZE_TIME = 6;              // seconds to neutralize owned -> neutral
const CAPTURE_MULTIPLIER_FOR_2_PLAYERS = 2;     // 2 players => 2x speed => time / 2
const CAPTURE_MULTIPLIER_MAX = 1.75;               // cap it (keep BF4-ish, avoids insane speeds)

const COLOR_NEUTRAL = mod.CreateVector(0.65, 0.65, 0.65);
const COLOR_FRIENDLY = mod.CreateVector(0.10, 0.55, 1.00);

// Enemy: bright flat red
const COLOR_ENEMY = mod.CreateVector(
    1,
    72 / 255,
    58 / 255
);
/* Capture progress float tolerances */
const PROGRESS_EPSILON = 0.02;
const PROGRESS_FULL = 1 - PROGRESS_EPSILON;
const PROGRESS_EMPTY = PROGRESS_EPSILON;

/* =================================================================================================
   2) TEAM / PHASE STATE
================================================================================================= */

const teamNeutral: mod.Team = mod.GetTeam(0);
const team1: mod.Team = mod.GetTeam(1);
const team2: mod.Team = mod.GetTeam(2);

/*
  Game status:
    -1: not started
     0: prematch
     1: redeploy countdown
     2: pre-live
     3: live
     4: postmatch
*/
let gameStatus: number = -1;
let roundResetting: boolean = false;

let gameModeStarted: boolean = false;
let pendingCpResetTicks: number = 0;

let serverTickCount: number = 0;
let phaseTickCount: number = 0;
let countDown: number = COUNT_DOWN_TIME;
let roundResetCpTickAccumulator: number = 0;
let lastTicketBleedTimeElapsed = 0;

let initialization: boolean[] = [false, false, false, false, false];

/* Tickets are stored as [team1Tickets, team2Tickets] */
let serverScores: number[] = [INITIAL_TICKETS, INITIAL_TICKETS];

let postmatchEndStep = 0;
let postmatchEndStepTick = 0;
let postmatchWinnerTeam: mod.Team = teamNeutral;

// 5 seconds at 30 ticks/sec
const POSTMATCH_END_DELAY_TICKS = 5 * TICK_RATE;

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
let objectiveHighlightWarnedMissingKeyByContext: { [context: string]: boolean } = {};
let objectiveHighlightWarnedMissingSymbolByContext: { [context: string]: boolean } = {};
let objectiveHighlightWarnedBuildFailureByContext: { [context: string]: boolean } = {};
let objectiveHighlightUseLiteralFallback: boolean = false;
let objectiveHighlightHealthChecked: boolean = false;
let objectiveHighlightKeyHealthWarned: boolean = false;

const DEBUG_WORLD_LOG_JOIN_EVENTS = false;
const JOIN_WORLD_LOG_THROTTLE_TICKS = 5 * TICK_RATE;
const DEBUG_OBJECTIVE_STRINGKEY_DIAG = false;

let joinWorldLogLastTickByPlayerId: { [playerId: number]: number } = {};

let prematchHealthInside889ByPlayerId: { [playerId: number]: boolean } = {};
let prematchHealthAppliedMaxByPlayerId: { [playerId: number]: number } = {};


/* =================================================================================================
   3) WORLD IDS (HQ / CAPTURE POINTS / INTERACT / ICONS / DAMAGE ZONE)
================================================================================================= */

/* Initial HQs (prematch + countdown + prelive) */
const TEAM1_INITIAL_HQ = 1;
const TEAM2_INITIAL_HQ = 2;

/* Prematch ready-up HQs */
const TEAM1_READYUP_HQ = 8888;
const TEAM2_READYUP_HQ = 8889;
let resolvedPrematchHqTeam1Id: number = TEAM1_READYUP_HQ;
let resolvedPrematchHqTeam2Id: number = TEAM2_READYUP_HQ;
let prematchHqFallbackActive = false;

/* Legacy live HQs (disabled during live routing) */
const TEAM1_LIVE_HQ = 3;
const TEAM2_LIVE_HQ = 4;

/* Per-flag HQs */
const TEAM1_FLAG_A_HQ = 5;
const TEAM1_FLAG_B_HQ = 6;
const TEAM1_FLAG_C_HQ = 7;

const TEAM2_FLAG_A_HQ = 8;
const TEAM2_FLAG_B_HQ = 9;
const TEAM2_FLAG_C_HQ = 10;

/* Two-flag combos */
const TEAM1_AB_HQ = 11;
const TEAM1_AC_HQ = 12;
const TEAM1_BC_HQ = 13;

const TEAM2_AB_HQ = 14;
const TEAM2_AC_HQ = 15;
const TEAM2_BC_HQ = 16;

/* All three flags */
const TEAM1_ABC_HQ = 17;
const TEAM2_ABC_HQ = 18;

/* No flags */
const TEAM1_NO_FLAG_HQ = 19;
const TEAM2_NO_FLAG_HQ = 20;

/* CapturePoint IDs */
const CP_A_ID = 201;
const CP_B_ID = 202;
const CP_C_ID = 203;

/* Prematch InteractPoints (switch team + ready) */
const IP_T1_SWITCH = 2001;
const IP_T1_READY = 2002;
const IP_T2_SWITCH = 2003;
const IP_T2_READY = 2004;

/* Live spectator InteractPoint */
const IP_SPECTATOR = 6001;

/* Prematch WorldIcons */
const WORLDICON_T1_SWITCH = 5001;
const WORLDICON_T1_READY = 5002;
const WORLDICON_T2_SWITCH = 5003;
const WORLDICON_T2_READY = 5004;

/* Damage zone AreaTrigger */
const DAMAGE_TRIGGER_ID = 7001;
const RESTRICTED_AREA_TRIGGER = 7002;
const PREMATCH_HEALTH_AREA_TRIGGER_ID = 889;
const PREMATCH_HEALTH_NORMAL_MAX = 100;
const PREMATCH_HEALTH_OUTSIDE_MAX = 100;
const PREMATCH_HEALTH_FULL_HEAL_AMOUNT = 9999;

const DAMAGE_PER_PULSE = 8;
const DAMAGE_INTERVAL_SECONDS = 0.25;
const DAMAGE_INTERVAL_TICKS_RAW = mod.Floor(DAMAGE_INTERVAL_SECONDS * TICK_RATE);
const DAMAGE_INTERVAL_TICKS = DAMAGE_INTERVAL_TICKS_RAW < 1 ? 1 : DAMAGE_INTERVAL_TICKS_RAW;

/* Fire VFX enabled at match start */
const FIRE_IDS = [
  331, 332, 333, 334, 335, 336, 337, 338, 339, 340,
  341, 342, 343, 344, 345, 346, 347, 348, 349,
];
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
  A: [9101],
  B: [9102],
  C: [9103],
  AB: [9104],
  AC: [9105],
  BC: [9106],
  ABC: [9107],
  NO: [9108],
};

const TEAM2_SPAWNERS_BY_ROUTE: Record<DynamicRouteKey, number[]> = {
  A: [9201],
  B: [9202],
  C: [9203],
  AB: [9204],
  AC: [9205],
  BC: [9206],
  ABC: [9207],
  NO: [9208],
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

/* HQ DESYNC FIX: detect "spawned at HQ spawner object origin" and recycle spawn */
let hqDesyncForcedRedeploys: { [playerId: number]: number } = {};

const HQ_DESYNC_SPAWNER_EPSILON_METERS = 0.5; // treat "0 meters" as <= this threshold (float-safe)
const HQ_DESYNC_MAX_FORCED_REDEPLOYS = 2;     // safety: prevent infinite loops


/* Safe spawn tuning */
const SAFE_SPAWN_CHECK_DELAY_SECONDS = 0.1;

// Radius schedule: 25m down to 8m by the 5th attempt.
const SAFE_SPAWN_RADIUS_START_METERS = 25;
const SAFE_SPAWN_RADIUS_END_METERS   = 8;

// Unsafe attempts allowed before forcing a furthest-safe single-flag fallback route.
const SAFE_SPAWN_MAX_FORCED_REDEPLOYS = 5;

// How many attempts to reach END radius (attempt 1..5 => used 0..4)
const SAFE_SPAWN_RADIUS_REACH_END_USED = 4; // used=4 corresponds to attempt 5
type SingleFlagRouteKey = "A" | "B" | "C";
const SINGLE_FLAG_ROUTE_KEYS: SingleFlagRouteKey[] = ["A", "B", "C"];
type SingleFlagRouteThreatEval = {
  routeKey: SingleFlagRouteKey;
  enemyOnPointCount: number;
  routeHasSafeSpawner: boolean;
  routeBestNearestEnemyDistance: number;
};

/* Squad-spawn bypass probing */
const SQUAD_SPAWN_DISTANCE = 8;
const SQUAD_SPAWN_PROBE_WINDOW_SECONDS = 0.25;
const SQUAD_SPAWN_PROBE_INTERVAL_SECONDS = 0.05;
const SQUAD_SPAWN_BYPASS_LIFETIME_SECONDS = 1.0;

let squadSpawnBypass: { [playerId: number]: boolean } = {};

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

function isOwnedFlagSpawnEligible(cp: CapturePoint | undefined, owningTeam: mod.Team): boolean {
  if (!cp) return false;
  if (!mod.Equals(cp.getOwner(), owningTeam)) return false;

  const onPoint = cp.getOnPoint();
  const contested = onPoint[0] > 0 && onPoint[1] > 0;
  if (contested) return false;

  const progress = cp.getCaptureProgress();
  const inProgressBand = progress > PROGRESS_EMPTY && progress < PROGRESS_FULL;
  if (!inProgressBand) return true;

  const majorityTeam =
    onPoint[0] > onPoint[1] ? team1 :
    onPoint[1] > onPoint[0] ? team2 :
    teamNeutral;

  // Broad block rule:
  // if enemy majority is actively pushing progress while the flag is owner-held, do not allow spawn.
  if (!mod.Equals(majorityTeam, teamNeutral) && !mod.Equals(majorityTeam, owningTeam)) return false;

  return true;
}

function getOwnedUncontestedFlagSymbolsForTeam(team: mod.Team): SingleFlagRouteKey[] {
  const symbols: SingleFlagRouteKey[] = [];

  SINGLE_FLAG_ROUTE_KEYS.forEach((symbol) => {
    const cp = getCapturePointBySymbol(symbol);
    if (isOwnedFlagSpawnEligible(cp, team)) symbols.push(symbol);
  });

  return symbols;
}

function getOwnedUncontestedRouteKeyForTeam(team: mod.Team): DynamicRouteKey | null {
  const symbols = getOwnedUncontestedFlagSymbolsForTeam(team);

  const hasA = symbols.indexOf("A") >= 0;
  const hasB = symbols.indexOf("B") >= 0;
  const hasC = symbols.indexOf("C") >= 0;

  if (hasA && hasB && hasC) return "ABC";
  if (hasA && hasB) return "AB";
  if (hasA && hasC) return "AC";
  if (hasB && hasC) return "BC";
  if (hasA) return "A";
  if (hasB) return "B";
  if (hasC) return "C";
  return null;
}

function getOwnedFlagCountForTeam(team: mod.Team): number {
  let owned = 0;

  const cpA = serverCapturePoints[CP_A_ID];
  const cpB = serverCapturePoints[CP_B_ID];
  const cpC = serverCapturePoints[CP_C_ID];

  if (cpA && mod.Equals(cpA.getOwner(), team)) owned += 1;
  if (cpB && mod.Equals(cpB.getOwner(), team)) owned += 1;
  if (cpC && mod.Equals(cpC.getOwner(), team)) owned += 1;

  return owned;
}

function getEnemyCountOnFlagForTeam(team: mod.Team, routeKey: SingleFlagRouteKey): number {
  const cp = getCapturePointBySymbol(routeKey);
  if (!cp) return 0;

  const onPoint = cp.getOnPoint();
  return mod.Equals(team, team1) ? onPoint[1] : onPoint[0];
}

function getNearestEnemyDistanceMeters(team: mod.Team, pos: mod.Vector, ignorePlayerId: number): number {
  let nearest = Number.POSITIVE_INFINITY;

  serverPlayers.forEach((sp) => {
    if (sp.id === ignorePlayerId) return;
    if (!sp.isDeployed) return;
    if (!mod.IsPlayerValid(sp.player)) return;
    if (!isPlayerAliveSafe(sp.player)) return;

    const otherTeam = mod.GetTeam(sp.player);
    if (mod.Equals(otherTeam, team)) return;

    const enemyPos = getPlayerPosition(sp.player);
    const d = mod.DistanceBetween(pos, enemyPos);
    if (d < nearest) nearest = d;
  });

  return nearest;
}

function getSpawnPointPositionByObjId(spawnerObjId: number): mod.Vector | null {
  try {
    return mod.GetObjectPosition(mod.GetSpawnPoint(spawnerObjId));
  } catch (_err) {
    return null;
  }
}

function evaluateSingleFlagRouteThreat(
  team: mod.Team,
  routeKey: SingleFlagRouteKey,
  radiusMeters: number
): SingleFlagRouteThreatEval | null {
  const spawnerObjIds = getSpawnersForTeamAndRoute(team, routeKey);
  if (!spawnerObjIds || spawnerObjIds.length <= 0) return null;

  let routeHasSafeSpawner = false;
  let routeBestNearestEnemyDistance = -1;

  for (let i = 0; i < spawnerObjIds.length; i++) {
    const spawnerObjId = spawnerObjIds[i];
    const spawnPos = getSpawnPointPositionByObjId(spawnerObjId);
    if (!spawnPos) continue;

    const nearestEnemyDistance = getNearestEnemyDistanceMeters(team, spawnPos, -1);
    if (nearestEnemyDistance > routeBestNearestEnemyDistance) {
      routeBestNearestEnemyDistance = nearestEnemyDistance;
    }
    if (nearestEnemyDistance > radiusMeters) routeHasSafeSpawner = true;
  }

  if (routeBestNearestEnemyDistance < 0) return null;

  return {
    routeKey: routeKey,
    enemyOnPointCount: getEnemyCountOnFlagForTeam(team, routeKey),
    routeHasSafeSpawner: routeHasSafeSpawner,
    routeBestNearestEnemyDistance: routeBestNearestEnemyDistance,
  };
}

function chooseFurthestSafeSingleFlagRoute(team: mod.Team, radiusMeters: number): SingleFlagRouteKey | null {
  let bestSafeRoute: SingleFlagRouteKey | null = null;
  let bestSafeScore = -1;
  let bestUnsafeRoute: SingleFlagRouteKey | null = null;
  let bestUnsafeScore = -1;

  for (let i = 0; i < SINGLE_FLAG_ROUTE_KEYS.length; i++) {
    const routeKey = SINGLE_FLAG_ROUTE_KEYS[i];
    const spawnerObjIds = getSpawnersForTeamAndRoute(team, routeKey);
    if (!spawnerObjIds || spawnerObjIds.length <= 0) continue;

    let routeHasSafeSpawner = false;
    let routeBestNearestEnemyDistance = -1;

    for (let j = 0; j < spawnerObjIds.length; j++) {
      const spawnerObjId = spawnerObjIds[j];
      const spawnPos = getSpawnPointPositionByObjId(spawnerObjId);
      if (!spawnPos) continue;

      const nearestEnemyDistance = getNearestEnemyDistanceMeters(team, spawnPos, -1);
      if (nearestEnemyDistance > routeBestNearestEnemyDistance) {
        routeBestNearestEnemyDistance = nearestEnemyDistance;
      }
      if (nearestEnemyDistance > radiusMeters) routeHasSafeSpawner = true;
    }

    if (routeBestNearestEnemyDistance < 0) continue;

    // Deterministic tie-breaks rely on strict ">" and stable A->B->C iteration order.
    if (routeHasSafeSpawner) {
      if (routeBestNearestEnemyDistance > bestSafeScore) {
        bestSafeScore = routeBestNearestEnemyDistance;
        bestSafeRoute = routeKey;
      }
    } else if (routeBestNearestEnemyDistance > bestUnsafeScore) {
      bestUnsafeScore = routeBestNearestEnemyDistance;
      bestUnsafeRoute = routeKey;
    }
  }

  if (bestSafeRoute !== null) return bestSafeRoute;
  return bestUnsafeRoute;
}

function chooseZeroOwnedThreatAwareSingleFlagRoute(team: mod.Team, radiusMeters: number): SingleFlagRouteKey | null {
  const routeEvals: SingleFlagRouteThreatEval[] = [];

  for (let i = 0; i < SINGLE_FLAG_ROUTE_KEYS.length; i++) {
    const routeKey = SINGLE_FLAG_ROUTE_KEYS[i];
    const evalResult = evaluateSingleFlagRouteThreat(team, routeKey, radiusMeters);
    if (evalResult !== null) routeEvals.push(evalResult);
  }

  if (routeEvals.length <= 0) return null;

  // Phase A: prefer only flags with zero enemies on-point.
  const zeroEnemyRouteEvals: SingleFlagRouteThreatEval[] = [];
  for (let i = 0; i < routeEvals.length; i++) {
    if (routeEvals[i].enemyOnPointCount === 0) zeroEnemyRouteEvals.push(routeEvals[i]);
  }

  if (zeroEnemyRouteEvals.length > 0) {
    let bestSafe: SingleFlagRouteThreatEval | null = null;
    let bestUnsafe: SingleFlagRouteThreatEval | null = null;

    for (let i = 0; i < zeroEnemyRouteEvals.length; i++) {
      const candidate = zeroEnemyRouteEvals[i];
      if (candidate.routeHasSafeSpawner) {
        if (!bestSafe || candidate.routeBestNearestEnemyDistance > bestSafe.routeBestNearestEnemyDistance) {
          bestSafe = candidate;
        }
      } else if (!bestUnsafe || candidate.routeBestNearestEnemyDistance > bestUnsafe.routeBestNearestEnemyDistance) {
        bestUnsafe = candidate;
      }
    }

    if (bestSafe) return bestSafe.routeKey;
    if (bestUnsafe) return bestUnsafe.routeKey;
    return null;
  }

  // Phase B: all flags have enemies on-point.
  // Choose least enemy count first, then furthest nearest-enemy distance.
  // Deterministic tie-break remains A -> B -> C due stable iteration + strict comparisons.
  let best = routeEvals[0];

  for (let i = 1; i < routeEvals.length; i++) {
    const candidate = routeEvals[i];

    if (candidate.enemyOnPointCount < best.enemyOnPointCount) {
      best = candidate;
      continue;
    }

    if (
      candidate.enemyOnPointCount === best.enemyOnPointCount &&
      candidate.routeBestNearestEnemyDistance > best.routeBestNearestEnemyDistance
    ) {
      best = candidate;
    }
  }

  return best.routeKey;
}

function getFurthestSafeSingleFlagHqIdForTeam(team: mod.Team, radiusMeters: number): number | null {
  const routeKey = chooseFurthestSafeSingleFlagRoute(team, radiusMeters);
  if (!routeKey) return null;
  return getHqIdForTeamAndRoute(team, routeKey);
}

function chooseLiveDynamicHqForTeam(team: mod.Team, hasCapturedAnyFlag: boolean): number {
  if (!hasCapturedAnyFlag) return getInitialSpawnPointObjIdForTeam(team);

  const ownedCount = getOwnedFlagCountForTeam(team);
  if (ownedCount === 0) {
    const zeroOwnedRoute = chooseZeroOwnedThreatAwareSingleFlagRoute(team, SAFE_SPAWN_RADIUS_END_METERS);
    if (zeroOwnedRoute !== null) return getHqIdForTeamAndRoute(team, zeroOwnedRoute);

    const zeroOwnedFallbackHqId = getFurthestSafeSingleFlagHqIdForTeam(team, SAFE_SPAWN_RADIUS_END_METERS);
    if (zeroOwnedFallbackHqId !== null) return zeroOwnedFallbackHqId;

    return getInitialSpawnPointObjIdForTeam(team);
  }

  const ownedRouteKey = getOwnedUncontestedRouteKeyForTeam(team);
  if (ownedRouteKey !== null) return getHqIdForTeamAndRoute(team, ownedRouteKey);

  const fallbackHqId = getFurthestSafeSingleFlagHqIdForTeam(team, SAFE_SPAWN_RADIUS_END_METERS);
  if (fallbackHqId !== null) return fallbackHqId;

  // Defensive fallback for misconfigured spawn mappings.
  return getInitialSpawnPointObjIdForTeam(team);
}
function markHqRoutingDirty(): void {
  hqRoutingDirty = true;
}
function refreshCapturePointsEngineStateForUI(): void {
  // Lightweight sampling for UI smoothness: owner + progress + contested state.
  Object.values(serverCapturePoints).forEach((cp) => {
    cp.setOwner(mod.GetCurrentOwnerTeam(cp.capturePoint));
    cp.setCaptureProgress();
    UpdateCapturePointContestedState(cp);
  });
}

function recomputeLiveHqRouting(): void {
  // Debounce: avoid doing this multiple times in the same tick if several events fire together.
  if (lastHqRoutingUpdateTick === phaseTickCount) return;
  lastHqRoutingUpdateTick = phaseTickCount;

  // Keep our cached CP state fresh before computing live routing.
  refreshCapturePointsEngineStateForUI();

  UpdateFlagHQSpawns();

  hqRoutingDirty = false;
}

function getSpawnersForTeamAndRoute(team: mod.Team, routeKey: DynamicRouteKey): number[] {
  return mod.Equals(team, team1) ? TEAM1_SPAWNERS_BY_ROUTE[routeKey] : TEAM2_SPAWNERS_BY_ROUTE[routeKey];
}

function getInitialSpawnPointObjIdForTeam(team: mod.Team): number {
  // Initial HQ spawn during countdown / match start.
  // We use the HQ id directly here (these are configured as the initial HQ spawns in the experience).
  return mod.Equals(team, team1) ? TEAM1_INITIAL_HQ : TEAM2_INITIAL_HQ;
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

  return chosen;
}

function HqDesyncCheckAndRecycle(eventPlayer: mod.Player, playerId: number): void {
  // If we're already in a safe-spawn recycle flow, don't add another recycle on top.
  if (safeSpawnUnsafePending[playerId] === true) return;
  if (safeSpawnForcedUndeploy[playerId] === true) return;

  const retries = hqDesyncForcedRedeploys[playerId] ?? 0;
  if (retries >= HQ_DESYNC_MAX_FORCED_REDEPLOYS) return;

  const team = mod.GetTeam(eventPlayer);

  // Determine the dynamic HQ spawner object ID the player is currently routed to.
  const routeHqId =
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

  safeSpawnForcedUndeploy[playerId] = true;
  safeSpawnUnsafePending[playerId] = true;
  safeSpawnUnsafeSpawnerObjId[playerId] = spawnerObjId;

  mod.UndeployPlayer(eventPlayer);
}

function resolveSafeSpawnSpawnerObjId(playerId: number, team: mod.Team): number {
  const routeHqId =
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

function isPlayerAlive(player: mod.Player): boolean {
  return mod.GetSoldierState(player, mod.SoldierStateBool.IsAlive);
}

function isPlayerAliveSafe(player: mod.Player): boolean {
  try {
    return isPlayerAlive(player);
  } catch (_err) {
    return false;
  }
}

function isSquadSpawnBypassActive(playerId: number): boolean {
  return squadSpawnBypass[playerId] === true;
}

async function clearSquadSpawnBypassLater(playerId: number): Promise<void> {
  await mod.Wait(SQUAD_SPAWN_BYPASS_LIFETIME_SECONDS);
  squadSpawnBypass[playerId] = false;
}

async function startSquadSpawnBypassProbe(player: mod.Player, playerId: number): Promise<void> {
  const playerSquad = mod.GetSquad(player);
  const allPlayers = mod.AllPlayers();

  let elapsed = 0;

  while (elapsed <= SQUAD_SPAWN_PROBE_WINDOW_SECONDS) {
    const sp = serverPlayers.get(playerId);
    if (!sp || !sp.isDeployed) return;
    if (!isPlayerAlive(player)) return;

    const playerPosition = getPlayerPosition(player);

    for (let i = 0; i < mod.CountOf(allPlayers); i++) {
      const otherPlayer = mod.ValueInArray(allPlayers, i) as mod.Player;

      if (mod.Equals(player, otherPlayer)) continue;
      if (!mod.IsPlayerValid(otherPlayer)) continue;
      if (!isPlayerAlive(otherPlayer)) continue;
      if (!mod.Equals(mod.GetSquad(otherPlayer), playerSquad)) continue;

      const otherId = modlib.getPlayerId(otherPlayer);
      const otherSp = serverPlayers.get(otherId);
      if (!otherSp || !otherSp.isDeployed) continue;

      const otherPosition = getPlayerPosition(otherPlayer);
      const distance = mod.DistanceBetween(playerPosition, otherPosition);

      if (distance <= SQUAD_SPAWN_DISTANCE) {
        squadSpawnBypass[playerId] = true;
        void clearSquadSpawnBypassLater(playerId);
        return;
      }
    }

    await mod.Wait(SQUAD_SPAWN_PROBE_INTERVAL_SECONDS);
    elapsed += SQUAD_SPAWN_PROBE_INTERVAL_SECONDS;
  }
}

function checkIfSpawnedOnSquadmate(player: mod.Player): boolean {
  const playerSquad = mod.GetSquad(player);
  const allPlayers = mod.AllPlayers();
  const playerPosition = getPlayerPosition(player);

  for (let i = 0; i < mod.CountOf(allPlayers); i++) {
    const otherPlayer = mod.ValueInArray(allPlayers, i) as mod.Player;

    if (mod.Equals(player, otherPlayer)) continue;
    if (!mod.IsPlayerValid(otherPlayer)) continue;
    if (!isPlayerAlive(otherPlayer)) continue;
    if (!mod.Equals(mod.GetSquad(otherPlayer), playerSquad)) continue;

    const otherPosition = getPlayerPosition(otherPlayer);
    const distance = mod.DistanceBetween(playerPosition, otherPosition);

    if (distance <= SQUAD_SPAWN_DISTANCE) {
      return true;
    }
  }

  return false;
}

function hasEnemyNearPosition(team: mod.Team, pos: mod.Vector, radiusMeters: number, ignorePlayerId: number): boolean {
  let found = false;

  serverPlayers.forEach((p) => {
    if (found) return;

    if (p.id === ignorePlayerId) return;
    if (!p.isDeployed) return;

    const otherTeam = mod.GetTeam(p.player);
    if (mod.Equals(otherTeam, team)) return;

    if (!isPlayerAlive(p.player)) return;

    const enemyPos = getPlayerPosition(p.player);
    const d = mod.DistanceBetween(pos, enemyPos);

    if (d <= radiusMeters) found = true;
  });

  return found;
}
const FRIENDLY_SPAWN_BYPASS_RADIUS_METERS = 8;

function isSpawnNearFriendlyPlayer(eventPlayer: mod.Player, playerId: number, radiusMeters: number): boolean {
  if (!mod.IsPlayerValid(eventPlayer)) return false;
  if (!isPlayerAlive(eventPlayer)) return false;

  const myTeam = mod.GetTeam(eventPlayer);
  const myPos = getPlayerPosition(eventPlayer);

  let nearFriendly = false;

  serverPlayers.forEach((sp) => {
    if (nearFriendly) return;

    // ignore self
    if (sp.id === playerId) return;

    if (!sp.isDeployed) return;
    if (!mod.IsPlayerValid(sp.player)) return;
    if (!isPlayerAlive(sp.player)) return;

    const t = mod.GetTeam(sp.player);
    if (!mod.Equals(t, myTeam)) return;

    const otherPos = getPlayerPosition(sp.player);
    const d = mod.DistanceBetween(myPos, otherPos);

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
    - If enemy is within SAFE_SPAWN_ENEMY_RADIUS_METERS, force an undeploy and re-spawn from a safer spawner.
    - Makes up to SAFE_SPAWN_MAX_FORCED_REDEPLOYS attempts.
    - If the 5th attempt is still unsafe, force that player's dynamic HQ route to furthest-safe A/B/C.
    - Bypasses recycling if it looks like a squad spawn.
*/
async function SafeSpawnCheckOrRedeploy(eventPlayer: mod.Player, playerId: number): Promise<void> {
  if (safeSpawnPendingCheck[playerId] === true) return;
  if (safeSpawnUnsafePending[playerId] === true) return;

  safeSpawnPendingCheck[playerId] = true;

  try {
    await mod.Wait(SAFE_SPAWN_CHECK_DELAY_SECONDS);

    // 1) Hard bypass if spawn is near ANY friendly within 8m
    if (isSpawnNearFriendlyPlayer(eventPlayer, playerId, FRIENDLY_SPAWN_BYPASS_RADIUS_METERS)) {
      safeSpawnForcedRedeploys[playerId] = 0;
      commitPendingDynamicHqForPlayer(playerId);
      return;
    }


    // 2) Keep your existing bypass if you still want it
    if (isSquadSpawnBypassActive(playerId)) {
      safeSpawnForcedRedeploys[playerId] = 0;
      return;
    }

    if (gameStatus !== 3) return;

    const p = serverPlayers.get(playerId);
    if (!p) return;

    if (!p.isDeployed) return;
    if (!isPlayerAlive(eventPlayer)) return;

    const used = safeSpawnForcedRedeploys[playerId] ?? 0;
    const radius = getSafeSpawnEnemyRadiusMeters(used);


    // If we already hit the cap previously, do not loop forever.
    if (used >= SAFE_SPAWN_MAX_FORCED_REDEPLOYS) return;

    // If this looks like a squad spawn, do not force recycle.
    if (checkIfSpawnedOnSquadmate(eventPlayer)) {
      safeSpawnForcedRedeploys[playerId] = 0;
      return;
    }

    const team = mod.GetTeam(eventPlayer);
    const pos = getPlayerPosition(eventPlayer);

    
    const unsafe = hasEnemyNearPosition(team, pos, radius, playerId);



    if (!unsafe) {
      // Successful safe spawn: reset attempt counter.
      safeSpawnForcedRedeploys[playerId] = 0;
      commitPendingDynamicHqForPlayer(playerId);
      return;
    }


    // Unsafe: consume one attempt.
    const nextUsed = used + 1;
    safeSpawnForcedRedeploys[playerId] = nextUsed;
    safeSpawnForcedUndeploy[playerId] = true;

    let spawnerObjId = 0;

    // On the 5th unsafe attempt:
    // - if team owns 0 flags, use zero-flag threat-aware route selection
    // - otherwise keep furthest-safe single-flag fallback selection
    const forceFurthestSingleFlag = nextUsed >= SAFE_SPAWN_MAX_FORCED_REDEPLOYS;
    if (forceFurthestSingleFlag) {
      const ownedCount = getOwnedFlagCountForTeam(team);
      const fallbackRoute =
        ownedCount === 0
          ? chooseZeroOwnedThreatAwareSingleFlagRoute(team, SAFE_SPAWN_RADIUS_END_METERS)
          : chooseFurthestSafeSingleFlagRoute(team, SAFE_SPAWN_RADIUS_END_METERS);

      if (fallbackRoute !== null) {
        const fallbackHqId = getHqIdForTeamAndRoute(team, fallbackRoute);
        lastDynamicHqForPlayer[playerId] = fallbackHqId;
      }

      // Ensure stale pre-fallback route cannot overwrite this forced route on commit.
      pendingDynamicHqForPlayer[playerId] = undefined;

      // Reset rotation index so forced route starts from its first spawner.
      safeSpawnSpawnerIndex[playerId] = 0;

      if (fallbackRoute !== null) {
        spawnerObjId = resolveSpawnerObjIdForRouteKey(playerId, team, fallbackRoute);
      }

      // Defensive fallback if route mapping is missing.
      if (!spawnerObjId) {
        spawnerObjId = resolveSafeSpawnSpawnerObjId(playerId, team);
      }
    } else {
      // Normal recycle within the current route.
      spawnerObjId = resolveSafeSpawnSpawnerObjId(playerId, team);
    }


    // Defensive: if mapping is empty/misconfigured, do nothing (avoids random fallback behavior).
    if (!spawnerObjId) return;

    safeSpawnUnsafePending[playerId] = true;
    safeSpawnUnsafeSpawnerObjId[playerId] = spawnerObjId;

    p.isDeployed = false;

    mod.SetRedeployTime(eventPlayer, 9999);

    mod.DisplayNotificationMessage(mod.Message(mod.stringkeys.SafeSpawnRetryToast), eventPlayer);
    mod.UndeployPlayer(eventPlayer);
  } finally {
    safeSpawnPendingCheck[playerId] = false;
  }
}

/* =================================================================================================
   5) AUDIO (SFX / VO)
================================================================================================= */

let audioInitialized = false;
let SFX_CaptureBuildup: any = null;

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
// End-of-round suspense loops
let SFX_Endgame_WinningLoop: any = null;
let SFX_Endgame_LosingLoop: any = null;
// Restricted Area countdown loop
let SFX_OutOfBoundsCountdownLoop: any = null;


// Track per-player state so loops never stack
let endgameLoopStateByPlayerId: { [playerId: number]: "none" | "win" | "lose" } = {};


// Track what loop (if any) each player is currently hearing
let captureTickLoopStateByPlayerId: { [playerId: number]: "none" | "friendly" | "enemy" } = {};

let VO_Module: any = null;
// Postmatch result SFX
let SFX_PostMatchVictory: any = null;
let SFX_PostMatchDefeat: any = null;

let postmatchResultSfxPlayed = false;
// Endgame suspense loop tuning
const ENDGAME_TICKET_THRESHOLD = 20;
const ENDGAME_TIME_THRESHOLD_SECONDS = 30;
const ENDGAME_LOOP_INTERVAL_SECONDS = 0.8;

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

const CAPTURE_TICK_INTERVAL_SECONDS = 0.45;
const CAPTURE_TICK_INTERVAL_TICKS = mod.Max(1, mod.Floor(CAPTURE_TICK_INTERVAL_SECONDS * TICK_RATE));

const CAPTURE_BUILDUP_THRESHOLD = 0.88;   // Start buildup when progress crosses this on the way up to 1.0
const CAPTURE_BUILDUP_BEATS = 3;
const CAPTURE_BUILDUP_BEAT_INTERVAL_SECONDS = 0.12;

let lastCaptureBuildupTickByCp: { [cpId: number]: number } = {};
const CAPTURE_BUILDUP_COOLDOWN_TICKS = mod.Ceiling(2.0 * TICK_RATE);


let lastContestSfxTickByCp: { [cpId: number]: number } = {};
let lastCaptureSfxTickByCp: { [cpId: number]: number } = {};
let lastJoinSfxTickByCp: { [cpId: number]: number } = {};

let lastCaptureTickAt: { [key: string]: number } = {};
let capturePointContested: { [cpId: number]: boolean } = {};
let lastCaptureProgressByCpId: { [cpId: number]: number } = {};
let captureTickLoopTokenByPlayerId: { [playerId: number]: number } = {};
let captureCreditByCpId: { [cpId: number]: { [playerId: number]: boolean } } = {};


let lastEnterPointSfxTickByPlayerId: { [playerId: number]: number } = {};
const ENTER_POINT_SFX_COOLDOWN_TICKS = mod.Floor(0.75 * TICK_RATE);

function ensureAudioSpawned(): void {
  if (audioInitialized) return;
  audioInitialized = true;

  SFX_CaptureBuildup = mod.SpawnObject(
    mod.RuntimeSpawn_Common.SFX_UI_Notification_ObjectiveSecured_FadeIn_OneShot2D,
    mod.CreateVector(0, 0, 0),
    mod.CreateVector(0, 0, 0),
    mod.CreateVector(0, 0, 0)
  );

    // Looping capture tick sounds (SimpleLoop2D)
  SFX_TickFriendlyLoop = mod.SpawnObject(
    mod.RuntimeSpawn_Common.SFX_UI_Gauntlet_Standoff_ZoneCaptureTick_OneShot2D,
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
  // Keep the token invalidation (in case other code expects it)
  const t = captureTickLoopTokenByPlayerId[playerId] ?? 0;
  captureTickLoopTokenByPlayerId[playerId] = t + 1;

  const p = serverPlayers.get(playerId);
  if (p && mod.IsPlayerValid(p.player)) {
    stopCaptureTickLoopsForPlayer(p.player, playerId);
  }
}
function stopEndgameLoop(playerId: number): void {
  const t = endgameLoopTokenByPlayerId[playerId] ?? 0;
  endgameLoopTokenByPlayerId[playerId] = t + 1;
  endgameLoopModeByPlayerId[playerId] = "none";
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
    if (!isPlayerAlive(sp.player)) return;

    // Use only sounds you already spawn and already know work.
    if (mode === "win") {
      if (SFX_Endgame_WinningLoop) mod.PlaySound(SFX_CaptureBuildup, 0, sp.player);
    } else {
      if (SFX_CountdownHeartbeat) mod.PlaySound(SFX_CountdownHeartbeat, 0, sp.player);
    }

    await mod.Wait(ENDGAME_LOOP_INTERVAL_SECONDS);
  }
}

function StopAllEndgameLoops(): void {
  serverPlayers.forEach((p) => stopEndgameLoop(p.id));
}

async function startCaptureTickLoop(playerId: number): Promise<void> {
  // Kill any previous loop and start a new one.
  stopCaptureTickLoop(playerId);
  const myToken = captureTickLoopTokenByPlayerId[playerId];

  while (true) {
    // Stop if token changed.
    if (captureTickLoopTokenByPlayerId[playerId] !== myToken) return;

    if (gameStatus !== 3) return;

    const p = serverPlayers.get(playerId);
    if (!p) return;

    if (!p.isDeployed) return;
    if (!mod.IsPlayerValid(p.player)) return;
    if (!isPlayerAlive(p.player)) return;

    const point = p.getCapturePoint();
    if (!point) return;

    const cp = serverCapturePoints[mod.GetObjId(point)];
    if (!cp) return;

    const onPointCounts = cp.getOnPoint();
    const hasT1 = onPointCounts[0] > 0;
    const hasT2 = onPointCounts[1] > 0;

        const contested = hasT1 && hasT2;

    const progress = cp.getCaptureProgress();
    const inProgressBand = progress > PROGRESS_EMPTY && progress < PROGRESS_FULL;

    const majorityTeam = getMajorityTeamOnPoint(cp);
    const ownerTeam = cp.getOwner();

    // "Working" means: your team has majority and you are not already the owner at full progress.
    // This makes ticking start immediately even when progress is 0 at the beginning of a neutral capture.
    const working =
      !contested &&
      !mod.Equals(majorityTeam, teamNeutral) &&
      !mod.Equals(ownerTeam, majorityTeam);

    // Only tick if contested, progress is moving, or we're actively working the objective.
    if (contested || inProgressBand || working) {
      if (contested) {
        playTickEnemy(p.player);
      } else {
        const playerTeam = mod.GetTeam(p.player);

        if (mod.Equals(majorityTeam, teamNeutral)) {
          playTickEnemy(p.player);
        } else if (mod.Equals(playerTeam, majorityTeam)) {
          playTickFriendly(p.player);
        } else {
          playTickEnemy(p.player);
        }
      }
    }


    await mod.Wait(CAPTURE_TICK_INTERVAL_SECONDS);
  }
}
function playCaptureBuildupBeat(receiver: mod.Player): void {
  if (SFX_CaptureBuildup) {
    // Slightly lower volume so it feels like a buildup, not a capture stinger.
    mod.PlaySound(SFX_CaptureBuildup, 0.2, receiver);
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
    StopAllEndgameLoops();
    return;
  }

  const timeLeft = mod.Max(0, ROUND_TIME - phaseTickCount / TICK_RATE);

  // Compare with CEILING tickets so it matches what players see.
  const t1Tickets = mod.Ceiling(serverScores[0]);
  const t2Tickets = mod.Ceiling(serverScores[1]);

  const endByTicketsSoon = t1Tickets <= ENDGAME_TICKET_THRESHOLD || t2Tickets <= ENDGAME_TICKET_THRESHOLD;
  const endByTimeSoon = timeLeft <= ENDGAME_TIME_THRESHOLD_SECONDS;

  if (!endByTicketsSoon && !endByTimeSoon) {
    StopAllEndgameLoops();
    return;
  }

  // Current leader decides win/lose mood.
  let leader: mod.Team = teamNeutral;
  if (t1Tickets > t2Tickets) leader = team1;
  else if (t2Tickets > t1Tickets) leader = team2;

  // If tied, do not play either mood.
  if (mod.Equals(leader, teamNeutral)) {
    StopAllEndgameLoops();
    return;
  }

  serverPlayers.forEach((sp) => {
    if (!sp) return;
    if (!sp.isDeployed) return;
    if (!mod.IsPlayerValid(sp.player)) return;

    const playerTeam = mod.GetTeam(sp.player);

    let desired: "none" | "win" | "lose" = "none";
    if (mod.Equals(playerTeam, leader)) desired = "win";
    else if (mod.Equals(playerTeam, team1) || mod.Equals(playerTeam, team2)) desired = "lose";

    const current = endgameLoopModeByPlayerId[sp.id] ?? "none";
    if (current === desired) return;

    if (desired === "none") {
      stopEndgameLoop(sp.id);
      return;
    }

    void startEndgameLoop(sp.id, desired);
  });
}


async function playCaptureBuildupToCapturingTeamOnPoint(cp: CapturePoint, capturingTeam: mod.Team): Promise<void> {
  // Rate limit per capture point so it does not spam.
  const last = lastCaptureBuildupTickByCp[cp.id] ?? -999999;
  if (serverTickCount - last < CAPTURE_BUILDUP_COOLDOWN_TICKS) return;
  lastCaptureBuildupTickByCp[cp.id] = serverTickCount;

  // Play a short 3-beat buildup only to the capturing team currently on the point.
  for (let beat = 0; beat < CAPTURE_BUILDUP_BEATS; beat++) {
    const ids = cp.getPlayerIdsOnPoint();

    for (let i = 0; i < ids.length; i++) {
      const pid = ids[i];
      const p = serverPlayers.get(pid);
      if (!p) continue;

      if (!p.isDeployed) continue;
      if (!mod.IsPlayerValid(p.player)) continue;
      if (!isPlayerAlive(p.player)) continue;

      if (!mod.Equals(mod.GetTeam(p.player), capturingTeam)) continue;

      playCaptureBuildupBeat(p.player);
    }

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
  // Stop both so we never overlap
  if (SFX_TickFriendlyLoop) mod.StopSound(SFX_TickFriendlyLoop, player);
  if (SFX_TickEnemyLoop) mod.StopSound(SFX_TickEnemyLoop, player);

  captureTickLoopStateByPlayerId[playerId] = "none";
}

function setCaptureTickLoopForPlayer(player: mod.Player, playerId: number, desired: "none" | "friendly" | "enemy"): void {
  const current = captureTickLoopStateByPlayerId[playerId] ?? "none";
  if (current === desired) return;

  // Always stop previous loop first
  if (SFX_TickFriendlyLoop) mod.StopSound(SFX_TickFriendlyLoop, player);
  if (SFX_TickEnemyLoop) mod.StopSound(SFX_TickEnemyLoop, player);

  if (desired === "friendly") {
    if (SFX_TickFriendlyLoop) mod.PlaySound(SFX_TickFriendlyLoop, 0.20, player);
  } else if (desired === "enemy") {
    if (SFX_TickEnemyLoop) mod.PlaySound(SFX_TickEnemyLoop, 0.20, player);
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
      enemy: contested OR player is not majority OR majority is neutral
  - Start/stop loops only on state changes (no spam).
*/
function UpdateCaptureTickLoopsGlobal(): void {
  if (gameStatus !== 3) {
    StopAllCaptureTickLoops();
    return;
  }

  serverPlayers.forEach((sp) => {
    if (!sp) return;

    const player = sp.player;
    const playerId = sp.id;

    if (!sp.isDeployed || !mod.IsPlayerValid(player) || !isPlayerAlive(player)) {
      if (mod.IsPlayerValid(player)) stopCaptureTickLoopsForPlayer(player, playerId);
      return;
    }

    const point = sp.getCapturePoint();
    if (!point) {
      stopCaptureTickLoopsForPlayer(player, playerId);
      return;
    }

    const cpWrap = serverCapturePoints[mod.GetObjId(point)];
    if (!cpWrap) {
      stopCaptureTickLoopsForPlayer(player, playerId);
      return;
    }

    const on = cpWrap.getOnPoint();
    const hasT1 = on[0] > 0;
    const hasT2 = on[1] > 0;

    const contested = hasT1 && hasT2;

    const progress = cpWrap.getCaptureProgress();
    const inProgressBand = progress > PROGRESS_EMPTY && progress < PROGRESS_FULL;

    // If nothing is actually happening, do not play a tick loop
    if (!contested && !inProgressBand) {
      stopCaptureTickLoopsForPlayer(player, playerId);
      return;
    }

    // Decide friendly vs enemy loop
    if (contested) {
      setCaptureTickLoopForPlayer(player, playerId, "enemy");
      return;
    }

    const majority = getMajorityTeamOnPoint(cpWrap);
    const myTeam = mod.GetTeam(player);

    if (mod.Equals(majority, teamNeutral)) {
      setCaptureTickLoopForPlayer(player, playerId, "enemy");
      return;
    }

    if (mod.Equals(myTeam, majority)) setCaptureTickLoopForPlayer(player, playerId, "friendly");
    else setCaptureTickLoopForPlayer(player, playerId, "enemy");
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

function playSfxToTeam(team: mod.Team, kind: "tickFriendly" | "tickEnemy" | "captured"): void {
  forEachPlayerOnTeam(team, (p) => {
    if (kind === "tickFriendly") playTickFriendly(p.player);
    else if (kind === "tickEnemy") playTickEnemy(p.player);
    else playCapturedSfx(p.player);
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

/* Track HUD build state so we can build once and then only toggle/update */
let liveHudBuiltByPlayerId: { [playerId: number]: boolean } = {}; // reused name to avoid touching lots of code paths
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
const PREMATCH_PANEL_POS_X = -780;
const PREMATCH_PANEL_POS_Y = -176;
const PREMATCH_PANEL_WIDTH = 292;
const PREMATCH_PANEL_HEIGHT = 572;
const PREMATCH_PANEL_ANCHOR = mod.UIAnchor.Center;

/* -----------------------------------------------------------------------------------------------
   Top-level UI layout
------------------------------------------------------------------------------------------------ */

const UIWidget = modlib.ParseUI({
  name: "UIContainer",
  type: "Container",
  position: [0, 0],
  size: [7000, 5000],
  anchor: mod.UIAnchor.TopCenter,
  visible: true,
  padding: 0,
  bgColor: [0, 0, 0],
  bgAlpha: 1,
  bgFill: mod.UIBgFill.None,
  children: [
        {
      name: "LiveContainer",
      type: "Container",
      position: [0, 30],
      size: [900, 140],
      anchor: mod.UIAnchor.TopCenter,
      visible: false,
      padding: 0,
      bgColor: [0, 0, 0],
      bgAlpha: 0,
      bgFill: mod.UIBgFill.None,
      children: [
        // Center time box (keeps widget name "RemainingTime" so SetUITime keeps working)
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

        // Friendly score box (left)
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
              bgFill: mod.UIBgFill.GradientLeft, // right -> left pulse
            },
          ],

        },

        // Enemy score box (right)
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
              bgFill: mod.UIBgFill.GradientRight, // left -> right pulse
            },
          ],

        },

        // Friendly progress bar (between friendly score and time)
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
              bgFill: mod.UIBgFill.GradientLeft, // right -> left
            },
          ],
        },

        // Enemy progress bar (between time and enemy score)
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
              bgFill: mod.UIBgFill.GradientRight, // left -> right
            },
          ],
        },

        // KEEP your existing flag containers exactly as-is (do not change names)
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
      size: [7000, 5000],
      anchor: mod.UIAnchor.TopCenter,
      visible: true,
      padding: 0,
      bgColor: [0, 0, 0],
      bgAlpha: 1,
      bgFill: mod.UIBgFill.None,
    },
    {
  name: "PreMatchContainer",
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
      textAnchor: mod.UIAnchor.Center
    },
    {
      name: "Text_Mode_Domination",
      type: "Text",
      position: [72, 22],
      size: [130, 42],
      anchor: mod.UIAnchor.TopCenter,
      visible: true,
      padding: 0,
      bgColor: [0.2, 0.2, 0.2],
      bgAlpha: 1,
      bgFill: mod.UIBgFill.None,
      textLabel: mod.stringkeys.Text_Mode_Domination,
      textColor: [1, 1, 1],
      textAlpha: 1,
      textSize: 22,
      textAnchor: mod.UIAnchor.Center
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
      textAnchor: mod.UIAnchor.Center
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
      bgFill: mod.UIBgFill.Solid
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
      textAnchor: mod.UIAnchor.Center
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
      textAnchor: mod.UIAnchor.Center
    }
  ]
},
    {
      name: "CountDownContainer",
      type: "Container",
      position: [0, 150],
      size: [300, 150],
      anchor: mod.UIAnchor.TopCenter,
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
          textLabel: mod.stringkeys.Redeploying,
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
  // Re-assert per-player UI input and ensure interactive buttons exist.
  const allPlayers = mod.AllPlayers();
  for (let i = 0; i < mod.CountOf(allPlayers); i++) {
    const p = mod.ValueInArray(allPlayers, i) as mod.Player;
    if (p && mod.IsPlayerValid(p)) {
      mod.EnableUIInputMode(true, p);
      EnsureGlobalPrematchHitboxesForPlayer(p);
    }
  }
}

function HandlePrematchReadyUp(player: mod.Player): void {
  if (gameStatus !== 0) return;
  if (!mod.IsPlayerValid(player)) return;
  if (isBotBackfillPlayer(player)) return;

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

// Prevent UI buttons from firing twice (ButtonDown + ButtonUp) and canceling themselves out.
const uiButtonLastHandledTick: { [key: string]: number } = {};
const UI_BUTTON_DEBOUNCE_TICKS = 6; // ~0.2s at 30 tick rate
const DEBUG_PREMATCH_UI = false;
const UI_DEBUG_TOAST_COOLDOWN_TICKS = mod.Max(1, mod.Floor(TICK_RATE / 2));
const uiDebugLastToastTickByPlayerId: { [playerId: number]: number } = {};


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
   Match start banner (DOMINATION splash)
------------------------------------------------------------------------------------------------ */

const MATCH_START_BANNER_SHOW_SECONDS = 2.0;
let matchStartBannerRunning = false;

const container0nx1gWidget = modlib.ParseUI({
  name: "Container_0NX1G",
  type: "Container",
  position: [0, 0],
  size: [1920, 1080],
  anchor: mod.UIAnchor.TopCenter,
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
      name: "Intro_DOMINATION_Text",
      type: "Text",
      position: [0, 200],
      size: [650, 110],
      anchor: mod.UIAnchor.TopCenter,
      visible: true,
      padding: 0,
      bgColor: [1.0, 0.55, 0.18],
      bgAlpha: 0.95,
      bgFill: mod.UIBgFill.Solid,
      textLabel: mod.stringkeys.Text_Domination,
      textColor: [1, 1, 1],
      textAlpha: 1,
      textSize: 80,
      textAnchor: mod.UIAnchor.Center,
    },
    {
      name: "Intro_DOMINATION_Line_Left",
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
      name: "Intro_DOMINATION_Line_Right",
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
  const textW = mod.FindUIWidgetWithName("Intro_DOMINATION_Text");
  const leftW = mod.FindUIWidgetWithName("Intro_DOMINATION_Line_Left");
  const rightW = mod.FindUIWidgetWithName("Intro_DOMINATION_Line_Right");

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
    mod.EnableUIInputMode(true, player);

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

  mod.EnableUIInputMode(true, player);

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
  // If you hide the UI, you generally want to turn off UI input mode too.
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

    const parent = SafeFindWidget("PreMatchContainer");
    if (!parent) {
      warnPrematchUiGuardOnce(
        "prematch_roster_parent_missing",
        mod.Message("[PREMATCH ROSTER] missing parent widget {}", "PreMatchContainer")
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

  const parent = SafeFindWidget("PreMatchContainer");
  if (!parent) {
    readyTextBuiltByPlayerId[playerId] = false;
    delete readyTextWidgetByPlayerId[playerId];
    warnPrematchUiGuardOnce(
      "prematch_readytext_parent_missing",
      mod.Message("[PREMATCH READY TEXT] missing parent widget {}", "PreMatchContainer")
    );
    return;
  }

  try {
    mod.AddUIText(
      readyTextName,
      mod.CreateVector(0, 126, 0),
      mod.CreateVector(220, 40, 0),
      mod.UIAnchor.TopCenter,
      parent,
      true,
      0,
      mod.CreateVector(0, 0, 0),
      0.4,
      mod.UIBgFill.None,
      mod.Message(mod.stringkeys.NotReady),
      32,
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

function deletePlayerLiveHudWidgets(playerId: number): void {
  mod.DeleteUIWidget(mod.FindUIWidgetWithName("TeamFriendlyScore" + playerId));
  mod.DeleteUIWidget(mod.FindUIWidgetWithName("TeamOpponentScore" + playerId));
  mod.DeleteUIWidget(mod.FindUIWidgetWithName("FriendlyTicketsFill" + playerId));
  mod.DeleteUIWidget(mod.FindUIWidgetWithName("EnemyTicketsFill" + playerId));

  mod.DeleteUIWidget(mod.FindUIWidgetWithName("FLAGA_FILL" + playerId));
  mod.DeleteUIWidget(mod.FindUIWidgetWithName("FLAGB_FILL" + playerId));
  mod.DeleteUIWidget(mod.FindUIWidgetWithName("FLAGC_FILL" + playerId));

  mod.DeleteUIWidget(mod.FindUIWidgetWithName("FLAGA" + playerId));
  mod.DeleteUIWidget(mod.FindUIWidgetWithName("FLAGB" + playerId));
  mod.DeleteUIWidget(mod.FindUIWidgetWithName("FLAGC" + playerId));
  mod.DeleteUIWidget(mod.FindUIWidgetWithName("FLAGA_OUTLINE" + playerId));
  mod.DeleteUIWidget(mod.FindUIWidgetWithName("FLAGA_INNER" + playerId));
  mod.DeleteUIWidget(mod.FindUIWidgetWithName("FLAGB_OUTLINE" + playerId));
  mod.DeleteUIWidget(mod.FindUIWidgetWithName("FLAGB_INNER" + playerId));
  mod.DeleteUIWidget(mod.FindUIWidgetWithName("FLAGC_OUTLINE" + playerId));
  mod.DeleteUIWidget(mod.FindUIWidgetWithName("FLAGC_INNER" + playerId));
    // Thin outline frame pieces
  const syms = ["A", "B", "C"];
  for (let i = 0; i < syms.length; i++) {
    const s = syms[i];

    mod.DeleteUIWidget(mod.FindUIWidgetWithName("FLAG" + s + "_OL_T" + playerId));
    mod.DeleteUIWidget(mod.FindUIWidgetWithName("FLAG" + s + "_OL_B" + playerId));
    mod.DeleteUIWidget(mod.FindUIWidgetWithName("FLAG" + s + "_OL_L" + playerId));
    mod.DeleteUIWidget(mod.FindUIWidgetWithName("FLAG" + s + "_OL_R" + playerId));
  }


  mod.DeleteUIWidget(mod.FindUIWidgetWithName("ActiveFlag" + playerId));
  mod.DeleteUIWidget(mod.FindUIWidgetWithName("FriendlyCap" + playerId));
  mod.DeleteUIWidget(mod.FindUIWidgetWithName("EnemyCap" + playerId));
  mod.DeleteUIWidget(mod.FindUIWidgetWithName("CapProgress" + playerId));
  mod.DeleteUIWidget(mod.FindUIWidgetWithName("ActiveFlagContainer" + playerId));
  mod.DeleteUIWidget(mod.FindUIWidgetWithName("FriendlyScorePulse" + playerId));
  mod.DeleteUIWidget(mod.FindUIWidgetWithName("EnemyScorePulse" + playerId));

}

function rebuildPlayerLiveHud(p: Player): void {
  // If already built, DO NOT recreate widgets.
  // Just re-bind widget references (important for reconnect/deploy cases) and return.
  if (liveHudBuiltByPlayerId[p.id] === true) {
    p.flagWidget = {
      A: mod.FindUIWidgetWithName("FLAGA" + p.id),
      B: mod.FindUIWidgetWithName("FLAGB" + p.id),
      C: mod.FindUIWidgetWithName("FLAGC" + p.id),
    };

    p.friendlyScoreWidget = mod.FindUIWidgetWithName("TeamFriendlyScore" + p.id);
    p.opponentScoreWidget = mod.FindUIWidgetWithName("TeamOpponentScore" + p.id);
    p.friendlyScorePad1Widget = mod.FindUIWidgetWithName("TeamFriendlyScorePad1" + p.id);
    p.friendlyScorePad2Widget = mod.FindUIWidgetWithName("TeamFriendlyScorePad2" + p.id);
    p.opponentScorePad1Widget = mod.FindUIWidgetWithName("TeamOpponentScorePad1" + p.id);
    p.opponentScorePad2Widget = mod.FindUIWidgetWithName("TeamOpponentScorePad2" + p.id);

    p.activeFlagContainerWidget = mod.FindUIWidgetWithName("ActiveFlagContainer" + p.id);
    p.activeFlagFriendlyWidget = mod.FindUIWidgetWithName("FriendlyCap" + p.id);
    p.activeFlagEnemyWidget = mod.FindUIWidgetWithName("EnemyCap" + p.id);
    p.friendlyCapWidget = p.activeFlagFriendlyWidget;
    p.enemyCapWidget = p.activeFlagEnemyWidget;

    p.activeFlagWidget = mod.FindUIWidgetWithName("ActiveFlag" + p.id);
    p.progressBarWidget = mod.FindUIWidgetWithName("CapProgress" + p.id);

    // Enforce default visibility expectations (updateTickets/updateUIPlayersOnPoint can override later)
    if (p.friendlyScorePad1Widget) mod.SetUIWidgetVisible(p.friendlyScorePad1Widget, false);
    if (p.friendlyScorePad2Widget) mod.SetUIWidgetVisible(p.friendlyScorePad2Widget, false);
    if (p.opponentScorePad1Widget) mod.SetUIWidgetVisible(p.opponentScorePad1Widget, false);
    if (p.opponentScorePad2Widget) mod.SetUIWidgetVisible(p.opponentScorePad2Widget, false);

    if (p.activeFlagContainerWidget) mod.SetUIWidgetVisible(p.activeFlagContainerWidget, false);

    return;
  }

  mod.AddUIText(
    "TeamFriendlyScore" + p.id,
    mod.CreateVector(0, 0, 0),
    mod.CreateVector(150, 34, 0),
    mod.UIAnchor.TopCenter,
    mod.FindUIWidgetWithName("friendlyscore"),
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

  // Leading-zero pads for friendly tickets (kept separate so we don't require string formatting)
  mod.AddUIText(
    "TeamFriendlyScorePad1" + p.id,
    mod.CreateVector(-18, 0, 0),
    mod.CreateVector(30, 34, 0),
    mod.UIAnchor.TopCenter,
    mod.FindUIWidgetWithName("friendlyscore"),
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
    "TeamFriendlyScorePad2" + p.id,
    mod.CreateVector(-34, 0, 0),
    mod.CreateVector(30, 34, 0),
    mod.UIAnchor.TopCenter,
    mod.FindUIWidgetWithName("friendlyscore"),
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
    "TeamOpponentScore" + p.id,
    mod.CreateVector(0, 0, 0),
    mod.CreateVector(150, 34, 0),
    mod.UIAnchor.TopCenter,
    mod.FindUIWidgetWithName("enemyscore"),
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

  // Leading-zero pads for enemy tickets (kept separate so we don't require string formatting)
  mod.AddUIText(
    "TeamOpponentScorePad1" + p.id,
    mod.CreateVector(-18, 0, 0),
    mod.CreateVector(30, 34, 0),
    mod.UIAnchor.TopCenter,
    mod.FindUIWidgetWithName("enemyscore"),
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
    "TeamOpponentScorePad2" + p.id,
    mod.CreateVector(-34, 0, 0),
    mod.CreateVector(30, 34, 0),
    mod.UIAnchor.TopCenter,
    mod.FindUIWidgetWithName("enemyscore"),
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

  // Per-player score pulse overlays (so pulse is always visible)
  mod.AddUIContainer(
    "FriendlyScorePulse" + p.id,
    mod.CreateVector(0, 0, 0),
    mod.CreateVector(120, 34, 0),
    mod.UIAnchor.TopLeft,
    mod.FindUIWidgetWithName("friendlyscore"),
    true,
    0,
    mod.CreateVector(0.2314, 0.4196, 0.6745),
    0,
    mod.UIBgFill.GradientLeft,
    p.player
  );

  mod.AddUIContainer(
    "EnemyScorePulse" + p.id,
    mod.CreateVector(0, 0, 0),
    mod.CreateVector(120, 34, 0),
    mod.UIAnchor.TopLeft,
    mod.FindUIWidgetWithName("enemyscore"),
    true,
    0,
    mod.CreateVector(0.698, 0.1882, 0.1882),
    0,
    mod.UIBgFill.GradientRight,
    p.player
  );

  // Per-player friendly ticket fill (shrinks toward center)
  mod.AddUIContainer(
    "FriendlyTicketsFill" + p.id,
    mod.CreateVector(0, 1, 0),
    mod.CreateVector(210, 4, 0),
    mod.UIAnchor.TopLeft,
    mod.FindUIWidgetWithName("friendlyprogressbar"),
    true,
    0,
    mod.CreateVector(0.2314, 0.4196, 0.6745),
    1,
    mod.UIBgFill.GradientRight,
    p.player
  );

  // Per-player enemy ticket fill (shrinks toward center)
  mod.AddUIContainer(
    "EnemyTicketsFill" + p.id,
    mod.CreateVector(0, 1, 0),
    mod.CreateVector(210, 4, 0),
    mod.UIAnchor.TopLeft,
    mod.FindUIWidgetWithName("enemyprogressbar"),
    true,
    0,
    mod.CreateVector(0.698, 0.1882, 0.1882),
    1,
    mod.UIBgFill.GradientLeft,
    p.player
  );

  mod.AddUIText(
    "FLAGA" + p.id,
    mod.CreateVector(0, 0, 0),
    mod.CreateVector(30, 30, 0),
    mod.UIAnchor.Center,
    mod.FindUIWidgetWithName("FlagContainerA"),
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
    "FLAGB" + p.id,
    mod.CreateVector(0, 0, 0),
    mod.CreateVector(30, 30, 0),
    mod.UIAnchor.Center,
    mod.FindUIWidgetWithName("FlagContainerB"),
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
    "FLAGC" + p.id,
    mod.CreateVector(0, 0, 0),
    mod.CreateVector(30, 30, 0),
    mod.UIAnchor.Center,
    mod.FindUIWidgetWithName("FlagContainerC"),
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

  // Thin outline frames ON TOP of the existing squares (does not change your original containers)
  const outlineThickness = 1;

  // IMPORTANT: This must match the FlagContainer size in ParseUI.
  // Your ParseUI FlagContainerA/B/C are size [20, 20], so use 20 unless you changed them.
  const flagBoxSize = 30;

  function addFlagOutline(symbol: "A" | "B" | "C", parentName: string, color: mod.Vector): void {
    const parentWidget = mod.FindUIWidgetWithName(parentName);
    if (!parentWidget) return;

    const half = flagBoxSize / 2;
    const tHalf = outlineThickness / 2;

    // Top
    mod.AddUIContainer(
      "FLAG" + symbol + "_OL_T" + p.id,
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

    // Bottom
    mod.AddUIContainer(
      "FLAG" + symbol + "_OL_B" + p.id,
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

    // Left
    mod.AddUIContainer(
      "FLAG" + symbol + "_OL_L" + p.id,
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

    // Right
    mod.AddUIContainer(
      "FLAG" + symbol + "_OL_R" + p.id,
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
  }

  // Per-player blur fill overlays for the flag boxes (keeps shared containers untouched)
  const flagFillAlpha = 0.5;

  function addFlagFill(symbol: "A" | "B" | "C", parentName: string, color: mod.Vector): void {
    const parentWidget = mod.FindUIWidgetWithName(parentName);
    if (!parentWidget) return;

    mod.AddUIContainer(
      "FLAG" + symbol + "_FILL" + p.id,
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
  }

  addFlagFill("A", "FlagContainerA", serverCapturePoints[CP_A_ID].getColor(mod.GetTeam(p.player)));
  addFlagFill("B", "FlagContainerB", serverCapturePoints[CP_B_ID].getColor(mod.GetTeam(p.player)));
  addFlagFill("C", "FlagContainerC", serverCapturePoints[CP_C_ID].getColor(mod.GetTeam(p.player)));

  // Initial outline colors match the same logic you already use for letters
  addFlagOutline("A", "FlagContainerA", serverCapturePoints[CP_A_ID].getColor(mod.GetTeam(p.player)));
  addFlagOutline("B", "FlagContainerB", serverCapturePoints[CP_B_ID].getColor(mod.GetTeam(p.player)));
  addFlagOutline("C", "FlagContainerC", serverCapturePoints[CP_C_ID].getColor(mod.GetTeam(p.player)));

  mod.AddUIContainer(
    "ActiveFlagContainer" + p.id,
    mod.CreateVector(0, 120, 0),
    mod.CreateVector(180, 80, 0),
    mod.UIAnchor.TopCenter,
    mod.FindUIWidgetWithName("LiveContainer"),
    false,
    0,
    mod.CreateVector(0.0314, 0.0431, 0.0431),
    0.4,
    mod.UIBgFill.None,
    p.player
  );

  const parent = mod.FindUIWidgetWithName("ActiveFlagContainer" + p.id);

  mod.AddUIText(
    "ActiveFlag" + p.id,
    mod.CreateVector(0, 0, 0),
    mod.CreateVector(60, 60, 0),
    mod.UIAnchor.Center,
    parent,
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
    "FriendlyCap" + p.id,
    mod.CreateVector(-80, 0, 0),
    mod.CreateVector(40, 40, 0),
    mod.UIAnchor.Center,
    parent,
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
    "EnemyCap" + p.id,
    mod.CreateVector(80, 0, 0),
    mod.CreateVector(40, 40, 0),
    mod.UIAnchor.Center,
    parent,
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
    "CapProgress" + p.id,
    mod.CreateVector(60, 0, 0),
    mod.CreateVector(0, 60, 0),
    mod.UIAnchor.CenterLeft,
    parent,
    true,
    0,
    mod.CreateVector(1, 1, 1),
    0.4,
    mod.UIBgFill.Solid,
    p.player
  );

  p.flagWidget = {
    A: mod.FindUIWidgetWithName("FLAGA" + p.id),
    B: mod.FindUIWidgetWithName("FLAGB" + p.id),
    C: mod.FindUIWidgetWithName("FLAGC" + p.id),
  };

  p.friendlyScoreWidget = mod.FindUIWidgetWithName("TeamFriendlyScore" + p.id);
  p.opponentScoreWidget = mod.FindUIWidgetWithName("TeamOpponentScore" + p.id);
  p.friendlyScorePad1Widget = mod.FindUIWidgetWithName("TeamFriendlyScorePad1" + p.id);
  p.friendlyScorePad2Widget = mod.FindUIWidgetWithName("TeamFriendlyScorePad2" + p.id);
  p.opponentScorePad1Widget = mod.FindUIWidgetWithName("TeamOpponentScorePad1" + p.id);
  p.opponentScorePad2Widget = mod.FindUIWidgetWithName("TeamOpponentScorePad2" + p.id);

  // Hide pads by default; updateTickets() will enable as needed.
  mod.SetUIWidgetVisible(p.friendlyScorePad1Widget, false);
  mod.SetUIWidgetVisible(p.friendlyScorePad2Widget, false);
  mod.SetUIWidgetVisible(p.opponentScorePad1Widget, false);
  mod.SetUIWidgetVisible(p.opponentScorePad2Widget, false);

  p.activeFlagContainerWidget = parent;
  p.activeFlagFriendlyWidget = mod.FindUIWidgetWithName("FriendlyCap" + p.id);
  p.activeFlagEnemyWidget = mod.FindUIWidgetWithName("EnemyCap" + p.id);
  p.friendlyCapWidget = p.activeFlagFriendlyWidget;
  p.enemyCapWidget = p.activeFlagEnemyWidget;

  p.activeFlagWidget = mod.FindUIWidgetWithName("ActiveFlag" + p.id);
  p.progressBarWidget = mod.FindUIWidgetWithName("CapProgress" + p.id);

  mod.SetUIWidgetVisible(p.activeFlagContainerWidget, false);

  liveHudBuiltByPlayerId[p.id] = true;
}


/* -----------------------------------------------------------------------------------------------
   Live HUD helpers
------------------------------------------------------------------------------------------------ */
const PULSE_MAX_ALPHA = 0.4;
const PULSE_DURATION_SECONDS = 0.55;
const PULSE_STEP_SECONDS = 0.05;

let lastFriendlyBleedPulseTick = -999999;
let lastEnemyBleedPulseTick = -999999;

let friendlyPulseRunning = false;
let enemyPulseRunning = false;

const BLEED_PULSE_COOLDOWN_TICKS = mod.Floor(1 * TICK_RATE);


function clamp01(x: number): number {
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

async function pulseWidgetAlpha(widget: mod.UIWidget, maxAlpha: number): Promise<void> {
  if (!widget) return;

  const steps = mod.Max(1, mod.Ceiling(PULSE_DURATION_SECONDS / PULSE_STEP_SECONDS));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;

    // triangle wave 0 -> 1 -> 0
    const up = t <= 0.5 ? (t / 0.5) : ((1 - t) / 0.5);
    const a = maxAlpha * clamp01(up);

    mod.SetUIWidgetBgAlpha(widget, a);

    await mod.Wait(PULSE_STEP_SECONDS);
  }

  mod.SetUIWidgetBgAlpha(widget, 0);
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

  // End immediately when either hits zero.
  if (serverScores[0] <= 0 || serverScores[1] <= 0) {
    gameStatus = 4;
    const live = mod.FindUIWidgetWithName("LiveContainer");
    if (live) mod.SetUIWidgetVisible(live, false);
  }
}
const TICKET_PULSE_TEXT_MAX_ALPHA = 1.0;
const TICKET_PULSE_TEXT_MIN_ALPHA = 0.55;

let pulseRunningByPlayerKey: { [key: string]: boolean } = {};
let lastBleedPulseTickByLosingTeamId: { [teamId: number]: number } = {};

async function pulseBgAlpha(widget: mod.UIWidget, maxAlpha: number, endAlpha: number): Promise<void> {
  if (!widget) return;

  const steps = mod.Max(1, mod.Ceiling(PULSE_DURATION_SECONDS / PULSE_STEP_SECONDS));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;

    const up = t <= 0.5 ? (t / 0.5) : ((1 - t) / 0.5);
    const a = maxAlpha * clamp01(up);

    mod.SetUIWidgetBgAlpha(widget, a);
    await mod.Wait(PULSE_STEP_SECONDS);
  }

  mod.SetUIWidgetBgAlpha(widget, endAlpha);
}


async function pulseTextAlpha(widget: mod.UIWidget): Promise<void> {
  if (!widget) return;

  const steps = mod.Max(1, mod.Ceiling(PULSE_DURATION_SECONDS / PULSE_STEP_SECONDS));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;

    const up = t <= 0.5 ? (t / 0.5) : ((1 - t) / 0.5);
    const a = TICKET_PULSE_TEXT_MIN_ALPHA + (TICKET_PULSE_TEXT_MAX_ALPHA - TICKET_PULSE_TEXT_MIN_ALPHA) * clamp01(up);

    mod.SetUITextAlpha(widget, a);
    await mod.Wait(PULSE_STEP_SECONDS);
  }

  mod.SetUITextAlpha(widget, 1);
}

async function pulseTicketsForPlayerSide(p: Player, side: "friendly" | "enemy"): Promise<void> {
  const key = p.id + "_" + side;
  if (pulseRunningByPlayerKey[key] === true) return;
  pulseRunningByPlayerKey[key] = true;

  try {
    if (side === "friendly") {
      const fill = mod.FindUIWidgetWithName("FriendlyTicketsFill" + p.id);
      const score = mod.FindUIWidgetWithName("TeamFriendlyScore" + p.id);
      const scorePulse = mod.FindUIWidgetWithName("FriendlyScorePulse" + p.id);

      await Promise.all([
        pulseBgAlpha(fill, 0.4, 1),        // fill stays visible
        pulseTextAlpha(score),
        pulseBgAlpha(scorePulse, 0.4, 0),  // overlay returns to invisible
      ]);
      return;
    }

    const fill = mod.FindUIWidgetWithName("EnemyTicketsFill" + p.id);
    const score = mod.FindUIWidgetWithName("TeamOpponentScore" + p.id);
    const scorePulse = mod.FindUIWidgetWithName("EnemyScorePulse" + p.id);

    await Promise.all([
      pulseBgAlpha(fill, 0.4, 1),
      pulseTextAlpha(score),
      pulseBgAlpha(scorePulse, 0.4, 0),
    ]);
  } finally {
    pulseRunningByPlayerKey[key] = false;
  }
}
function ClearAllTicketBleedPulses(): void {
  serverPlayers.forEach((p) => {
    const f = mod.FindUIWidgetWithName("FriendlyScorePulse" + p.id);
    const e = mod.FindUIWidgetWithName("EnemyScorePulse" + p.id);
    if (f) mod.SetUIWidgetBgAlpha(f, 0);
    if (e) mod.SetUIWidgetBgAlpha(e, 0);
  });
}


function triggerBleedPulseForLosingTeam(losingTeam: mod.Team): void {
  const losingTeamId = modlib.getTeamId(losingTeam);

  const last = lastBleedPulseTickByLosingTeamId[losingTeamId] ?? -999999;
  if (serverTickCount - last < BLEED_PULSE_COOLDOWN_TICKS) return;
  lastBleedPulseTickByLosingTeamId[losingTeamId] = serverTickCount;

  // If losingTeam is your team => pulse friendly side. Otherwise pulse enemy side.
  serverPlayers.forEach((p) => {
    const t = mod.GetTeam(p.player);

    if (mod.Equals(t, losingTeam)) {
      void pulseTicketsForPlayerSide(p, "friendly");
    } else if (mod.Equals(t, team1) || mod.Equals(t, team2)) {
      void pulseTicketsForPlayerSide(p, "enemy");
    }
  });
}


function ChangeTickets(): void {
  const now = mod.GetMatchTimeElapsed();
  if (lastTicketBleedTimeElapsed <= 0) lastTicketBleedTimeElapsed = now;

  let dt = now - lastTicketBleedTimeElapsed;
  lastTicketBleedTimeElapsed = now;

  // Guard against weird resets
  if (dt < 0) dt = 0;
  if (dt > 1) dt = 1; // clamp big spikes (optional)

  let teamcps = [0, 0];

  Object.values(serverCapturePoints).forEach((capturePoint) => {
    if (mod.Equals(capturePoint.getOwner(), team1)) teamcps[0] += 1;
    else if (mod.Equals(capturePoint.getOwner(), team2)) teamcps[1] += 1;
  });

    let anyBleed = false;

  // 1-flag ticket bleed (only when the other team has 0 flags)
  if (teamcps[0] === 1 && teamcps[1] === 0) {
    serverScores[1] += BLEED_ONE_FLAG * dt;
    triggerBleedPulseForLosingTeam(team2);
    anyBleed = true;
  } else if (teamcps[0] === 2) {
    serverScores[1] += BLEED_TWO_FLAGS * dt;
    triggerBleedPulseForLosingTeam(team2);
    anyBleed = true;
  } else if (teamcps[0] === 3) {
    serverScores[1] += BLEED_THREE_FLAGS * dt;
    triggerBleedPulseForLosingTeam(team2);
    anyBleed = true;
  } else if (teamcps[1] === 1 && teamcps[0] === 0) {
    serverScores[0] += BLEED_ONE_FLAG * dt;
    triggerBleedPulseForLosingTeam(team1);
    anyBleed = true;
  } else if (teamcps[1] === 2) {
    serverScores[0] += BLEED_TWO_FLAGS * dt;
    triggerBleedPulseForLosingTeam(team1);
    anyBleed = true;
  } else if (teamcps[1] === 3) {
    serverScores[0] += BLEED_THREE_FLAGS * dt;
    triggerBleedPulseForLosingTeam(team1);
    anyBleed = true;
  }

  if (!anyBleed) {
    ClearAllTicketBleedPulses();
  }


  ClampTicketsAndMaybeEndMatch();
}

function ForceAllPlayersNeutralFlagUI(): void {
  serverPlayers.forEach((p) => {
    // Neutralize the small A/B/C letters for this player
    setFlagLetterAndOutlineColorForPlayer(p.id, "A", COLOR_NEUTRAL);
    setFlagLetterAndOutlineColorForPlayer(p.id, "B", COLOR_NEUTRAL);
    setFlagLetterAndOutlineColorForPlayer(p.id, "C", COLOR_NEUTRAL);


    // Hide the on-point widget if it is showing
    p.setCapturePoint(null);
    if (p.activeFlagContainerWidget) mod.SetUIWidgetVisible(p.activeFlagContainerWidget, false);

    // Clear numbers so they do not stick visually
    if (p.activeFlagWidget) mod.SetUITextLabel(p.activeFlagWidget, mod.Message(""));
    if (p.activeFlagFriendlyWidget) mod.SetUITextLabel(p.activeFlagFriendlyWidget, mod.Message(""));
    if (p.activeFlagEnemyWidget) mod.SetUITextLabel(p.activeFlagEnemyWidget, mod.Message(""));

    // Optional: also clear the per-player cap numbers if they exist
    if (p.friendlyCapWidget) mod.SetUITextLabel(p.friendlyCapWidget, mod.Message(""));
    if (p.enemyCapWidget) mod.SetUITextLabel(p.enemyCapWidget, mod.Message(""));
  });
}

// Ticket bar fills are per-player; keep shared fills hidden.
function HideSharedTicketBarFills(): void {
    const f = mod.FindUIWidgetWithName("friendlyprogressbarfill");
    const e = mod.FindUIWidgetWithName("enemyprogressbarfill");
    if (f) mod.SetUIWidgetVisible(f, false);
    if (e) mod.SetUIWidgetVisible(e, false);
}
function UpdateTopFlagColorsForPlayer(p: Player): void {
  const team = mod.GetTeam(p.player);

  // Only A/B/C exist in your current HUD code
  const aColor = serverCapturePoints[CP_A_ID].getColor(team);
  const bColor = serverCapturePoints[CP_B_ID].getColor(team);
  const cColor = serverCapturePoints[CP_C_ID].getColor(team);

  // Text letters
  const flagA = mod.FindUIWidgetWithName("FLAGA" + p.id);
  const flagB = mod.FindUIWidgetWithName("FLAGB" + p.id);
  const flagC = mod.FindUIWidgetWithName("FLAGC" + p.id);

  if (flagA) mod.SetUITextColor(flagA, aColor);
  if (flagB) mod.SetUITextColor(flagB, bColor);
  if (flagC) mod.SetUITextColor(flagC, cColor);

  // Blur fills (per-player overlays)
  const aFill = mod.FindUIWidgetWithName("FLAGA_FILL" + p.id);
  const bFill = mod.FindUIWidgetWithName("FLAGB_FILL" + p.id);
  const cFill = mod.FindUIWidgetWithName("FLAGC_FILL" + p.id);

  if (aFill) mod.SetUIWidgetBgColor(aFill, aColor);
  if (bFill) mod.SetUIWidgetBgColor(bFill, bColor);
  if (cFill) mod.SetUIWidgetBgColor(cFill, cColor);

  // Outlines (4 segments each)
  const aOutT = mod.FindUIWidgetWithName("FLAGA_OL_T" + p.id);
  const aOutB = mod.FindUIWidgetWithName("FLAGA_OL_B" + p.id);
  const aOutL = mod.FindUIWidgetWithName("FLAGA_OL_L" + p.id);
  const aOutR = mod.FindUIWidgetWithName("FLAGA_OL_R" + p.id);

  const bOutT = mod.FindUIWidgetWithName("FLAGB_OL_T" + p.id);
  const bOutB = mod.FindUIWidgetWithName("FLAGB_OL_B" + p.id);
  const bOutL = mod.FindUIWidgetWithName("FLAGB_OL_L" + p.id);
  const bOutR = mod.FindUIWidgetWithName("FLAGB_OL_R" + p.id);

  const cOutT = mod.FindUIWidgetWithName("FLAGC_OL_T" + p.id);
  const cOutB = mod.FindUIWidgetWithName("FLAGC_OL_B" + p.id);
  const cOutL = mod.FindUIWidgetWithName("FLAGC_OL_L" + p.id);
  const cOutR = mod.FindUIWidgetWithName("FLAGC_OL_R" + p.id);

  if (aOutT) mod.SetUIWidgetBgColor(aOutT, aColor);
  if (aOutB) mod.SetUIWidgetBgColor(aOutB, aColor);
  if (aOutL) mod.SetUIWidgetBgColor(aOutL, aColor);
  if (aOutR) mod.SetUIWidgetBgColor(aOutR, aColor);

  if (bOutT) mod.SetUIWidgetBgColor(bOutT, bColor);
  if (bOutB) mod.SetUIWidgetBgColor(bOutB, bColor);
  if (bOutL) mod.SetUIWidgetBgColor(bOutL, bColor);
  if (bOutR) mod.SetUIWidgetBgColor(bOutR, bColor);

  if (cOutT) mod.SetUIWidgetBgColor(cOutT, cColor);
  if (cOutB) mod.SetUIWidgetBgColor(cOutB, cColor);
  if (cOutL) mod.SetUIWidgetBgColor(cOutL, cColor);
  if (cOutR) mod.SetUIWidgetBgColor(cOutR, cColor);
}


// Ticket bar fills shrink with the viewer's friendly/opponent tickets.
function UpdateTopTicketBarsForPlayer(p: Player): void {
    const friendlyFill = mod.FindUIWidgetWithName("FriendlyTicketsFill" + p.id);
    const enemyFill = mod.FindUIWidgetWithName("EnemyTicketsFill" + p.id);
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
  const letter = mod.FindUIWidgetWithName("FLAG" + symbol + playerId);
  if (letter) mod.SetUITextColor(letter, color);

  setFlagOutlineColorForPlayer(playerId, symbol, color);
  setFlagFillColorForPlayer(playerId, symbol, color);
}


function setFlagFillColorForPlayer(playerId: number, symbol: "A" | "B" | "C", color: mod.Vector): void {
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
  const timeWidget = mod.FindUIWidgetWithName("RemainingTime");
  if (!timeWidget) return;

  // Engine authoritative time remaining (seconds)
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

let restrictedAreaRootWidgetByPlayerId: { [playerId: number]: mod.UIWidget } = {};
let restrictedAreaCounterWidgetByPlayerId: { [playerId: number]: mod.UIWidget } = {};

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
    isPlayerAlive(p.player)
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
  // Cancel countdowns
  restrictedAreaCountdownToken[playerId] = (restrictedAreaCountdownToken[playerId] ?? 0) + 1;
  playerInRestrictedArea[playerId] = false;

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

  private _scoreboard: number[]; // [score, kills, deaths, assists, captures]
  private _onCapturePoint: mod.CapturePoint | null;
  private _firstDeploy: boolean;
  private _ready: boolean;

    constructor(player: mod.Player) {
    this.player = player;
    this.id = modlib.getPlayerId(this.player);
    this.team = mod.GetTeam(this.player);

    this._scoreboard = [0, 0, 0, 0, 0];
    this._onCapturePoint = null;
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

    // Do not build any Live HUD widgets here.
    // Building them here is what causes some players to keep the placeholder tickets and then get a second set in live.

    mod.SetRedeployTime(this.player, 0);

    // Mark as not built so rebuildPlayerLiveHud will build cleanly when needed.
    liveHudBuiltByPlayerId[this.id] = false;
  }


  setCapturePoint(capturePoint: mod.CapturePoint | null): void {
    this._onCapturePoint = capturePoint;
  }

  getCapturePoint(): mod.CapturePoint | null {
    return this._onCapturePoint;
  }

  isFirstDeploy(): boolean {
    if (this._firstDeploy) {
      this._firstDeploy = false;
      return true;
    }
    return false;
  }

  updateScoreboard(): void {
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
  }

  addKill(): void {
    this._scoreboard[1] += 1;
  }

  addDeath(): void {
    this._scoreboard[2] += 1;
  }

  addKillAssist(): void {
    this._scoreboard[3] += 1;
  }

  addCapture(): void {
    this._scoreboard[4] += 1;
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

  addUI(): void {
  if (gameStatus !== 3) return;

  // Build once (if needed), then only apply authoritative state -> UI.
  rebuildPlayerLiveHud(this);

  // Pull from authoritative server state
  this.updateTickets();
  this.updateUIPlayersOnPoint();
  this.updateUIProgress();

  // Active flag container only when actually on a point
  if (this.activeFlagContainerWidget) {
    mod.SetUIWidgetVisible(this.activeFlagContainerWidget, this._onCapturePoint !== null);
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
    this._onCapturePoint = null;
    this._firstDeploy = true;
    this._ready = false;
    this.isDeployed = false;

    // Reset prematch ready text if it exists.
    const w = resolvePrematchReadyTextWidgetForPlayer(this.id);
    if (w) {
      SafeSetTextColorHandle(w, mod.CreateVector(1, 0, 0));
      SafeSetTextLabelHandle(w, mod.Message(mod.stringkeys.NotReady));
    }
  }



  updateTickets(): void {
    const currentTeam = mod.GetTeam(this.player);

    const friendly = getFriendlyScore(currentTeam);
    const enemy = getOpponentScore(currentTeam);

    mod.SetUITextLabel(this.friendlyScoreWidget, mod.Message(friendly));
    mod.SetUITextLabel(this.opponentScoreWidget, mod.Message(enemy));

    mod.SetUIWidgetVisible(this.friendlyScorePad1Widget, friendly < 100);
    mod.SetUIWidgetVisible(this.friendlyScorePad2Widget, friendly < 10);

    mod.SetUIWidgetVisible(this.opponentScorePad1Widget, enemy < 100);
    mod.SetUIWidgetVisible(this.opponentScorePad2Widget, enemy < 10);

    UpdateTopTicketBarsForPlayer(this);

    // NEW: keep top flag colors correct when the player's team changes mid-match
    UpdateTopFlagColorsForPlayer(this);
  }



  updateUIPlayersOnPoint(): void {
    const point = this.getCapturePoint();
    if (!point) return;

    const cp = serverCapturePoints[mod.GetObjId(point)];
    const team = mod.GetTeam(this.player);

    if (modlib.Equals(team, team1)) {
      mod.SetUITextLabel(this.friendlyCapWidget, mod.Message(cp.getOnPoint()[0]));
      mod.SetUITextLabel(this.enemyCapWidget, mod.Message(cp.getOnPoint()[1]));
    } else {
      mod.SetUITextLabel(this.friendlyCapWidget, mod.Message(cp.getOnPoint()[1]));
      mod.SetUITextLabel(this.enemyCapWidget, mod.Message(cp.getOnPoint()[0]));
    }
  }

  updateUIProgress(): void {
    const point = this.getCapturePoint();
    if (!point) return;

    const cp = serverCapturePoints[mod.GetObjId(point)];
    const team = mod.GetTeam(this.player);

    let prog = cp.getCaptureProgress();

    if (mod.Equals(cp.getOwner(), team) && prog >= PROGRESS_FULL) {
      prog = 1;
    }

    const size = mod.CreateVector(mod.Ceiling(60 * prog), 60, 0);

    if (this.progressBarWidget) {
      mod.SetUIWidgetSize(this.progressBarWidget, size);

      if (modlib.Equals(cp.getOwner(), team)) {
        mod.SetUIWidgetBgColor(this.progressBarWidget, COLOR_FRIENDLY);
      } else if (modlib.Equals(cp.getOwner(), teamNeutral)) {
        if (modlib.Equals(cp.getCapturingTeam(), team)) mod.SetUIWidgetBgColor(this.progressBarWidget, COLOR_FRIENDLY);
        else mod.SetUIWidgetBgColor(this.progressBarWidget, COLOR_ENEMY);
      } else {
        mod.SetUIWidgetBgColor(this.progressBarWidget, COLOR_ENEMY);
      }
    }
  }
}

/* ----------------------------------------
   Capture point wrapper
---------------------------------------- */

class CapturePoint {
  public capturePoint: mod.CapturePoint;
  public symbol: string;
  public id: number;

  private _owner: mod.Team;
  private _onPoint: number[];
  private _captureProgress: number;
  private _previousCaptureProgress: number;
  private _capturingTeam: mod.Team;
  private _fade: number;

  constructor(id: number, symbol: string) {
    this.id = id;
    this.symbol = symbol;

    this.capturePoint = mod.GetCapturePoint(id);

    this._owner = teamNeutral;
    this._onPoint = [];
    this._captureProgress = 0;
    this._previousCaptureProgress = 0;
    this._capturingTeam = teamNeutral;
    this._fade = mod.Pi();

    mod.SetCapturePointCapturingTime(this.capturePoint, CAPTURE_TIME);
    mod.SetCapturePointNeutralizationTime(this.capturePoint, NEUTRALIZE_TIME);

    mod.EnableGameModeObjective(this.capturePoint, false);
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

  setOwner(owner: mod.Team): void {
    this._owner = owner;
  }

  getOwner(): mod.Team {
    return this._owner;
  }

  setCaptureProgress(): void {
    this._previousCaptureProgress = this._captureProgress;
    this._captureProgress = mod.GetCaptureProgress(this.capturePoint);

        // Buildup sound when capture is close to completion (progress rising toward 1.0).
    // Only when progress is increasing (capture), not decreasing (neutralize).
    if (gameStatus === 3) {
      const prev = this._previousCaptureProgress;
      const cur = this._captureProgress;

      const progressRising = cur > prev;
      const crossedThreshold = prev < CAPTURE_BUILDUP_THRESHOLD && cur >= CAPTURE_BUILDUP_THRESHOLD;

      if (progressRising && crossedThreshold) {
        const majorityTeam = getMajorityTeamOnPoint(this);
      // Track capture participation credit while progress is actively moving.
      const progressMoved = mod.AbsoluteValue(this._captureProgress - this._previousCaptureProgress) > 0.0001;
      if (progressMoved && !mod.Equals(majorityTeam, teamNeutral)) {
        // Mark all players currently on this point for capture credit.
        const ids = this.getPlayerIdsOnPoint();
        for (let i = 0; i < ids.length; i++) {
          const pid = ids[i];
          const sp = serverPlayers.get(pid);
          if (!sp) continue;
          if (!mod.Equals(mod.GetTeam(sp.player), majorityTeam)) continue;
          markCaptureCredit(this.id, pid);
        }
      }

        // Only play buildup if there is a clear capturing side.
        if (!mod.Equals(majorityTeam, teamNeutral)) {
          void playCaptureBuildupToCapturingTeamOnPoint(this, majorityTeam);
        }
      }
      
    }


    const onPoint = this.getOnPoint();
    const majorityTeam =
      onPoint[0] > onPoint[1] ? team1 :
      onPoint[1] > onPoint[0] ? team2 :
      teamNeutral;

    const progressIncreased = this._captureProgress > this._previousCaptureProgress;
    const progressDecreased = this._captureProgress < this._previousCaptureProgress;

    if ((progressIncreased || progressDecreased) && !mod.Equals(majorityTeam, teamNeutral)) {
      this._capturingTeam = majorityTeam;

      if (progressIncreased) {
        const majorityCount = mod.Equals(majorityTeam, team1) ? onPoint[0] : onPoint[1];

        // 1 player => 1x (time = CAPTURE_TIME)
        // 2+ players => 2x (time = CAPTURE_TIME / 2)
        let mult = 1;
        if (majorityCount >= 2) mult = CAPTURE_MULTIPLIER_FOR_2_PLAYERS;

        // Optional cap (keeps things sane)
        if (mult > CAPTURE_MULTIPLIER_MAX) mult = CAPTURE_MULTIPLIER_MAX;

        const effectiveCaptureTime = CAPTURE_TIME / mult;
        mod.SetCapturePointCapturingTime(this.capturePoint, effectiveCaptureTime);
      } else {
        mod.SetCapturePointNeutralizationTime(this.capturePoint, NEUTRALIZE_TIME);
      }

      this.setUIProgressForPlayersOnPoint();
    }


    if (progressDecreased && mod.Equals(majorityTeam, teamNeutral)) {
      mod.SetCapturePointNeutralizationTime(this.capturePoint, NEUTRALIZE_TIME);
      this._capturingTeam = teamNeutral;
    }

    const fading = this._captureProgress > PROGRESS_EMPTY && this._captureProgress < PROGRESS_FULL;
    if (fading) this._fade += (2 * mod.Pi()) / TICK_RATE;
    else this._fade = mod.Pi();

    serverPlayers.forEach((p) => {
      const a = (mod.SineFromRadians(this._fade) + 1) / 2;
      SafeSetTextAlphaByName("FLAG" + this.symbol + p.id, a);
    });

  }

  getCaptureProgress(): number {
    return this._captureProgress;
  }

  getCapturingTeam(): mod.Team {
    return this._capturingTeam;
  }

  getColor(team: mod.Team): mod.Vector {
    if (mod.Equals(team, this._owner)) return COLOR_FRIENDLY;
    if (mod.Equals(this._owner, teamNeutral)) return COLOR_NEUTRAL;
    return COLOR_ENEMY;
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

// HQ routing updates can be expensive; we drive them off capture-point events and a small safety cadence.
let hqRoutingDirty: boolean = true;
let lastHqRoutingUpdateTick: number = -999999;
const HQ_ROUTING_SAFETY_INTERVAL_TICKS = TICK_RATE * 2; // refresh occasionally in case events are missed


// Track whether each team has captured at least one flag this round.
// Used to keep initial HQ spawns until a team captures a flag for the first time.
let team1HasCapturedAnyFlag: boolean = false;
let team2HasCapturedAnyFlag: boolean = false;

/* =================================================================================================
   8) INPUT / DAMAGE RESTRICTIONS (PHASE-BASED)
================================================================================================= */

function applyPhaseInputRestrictionsForPlayer(player: mod.Player): void {
  if (!mod.IsPlayerValid(player)) return;

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
    applyPrematch889HealthForPlayer(p.id);
  });
}

function normalizeAllPlayersToStandardHealthAndClearPrematch889State(): void {
  serverPlayers.forEach((p) => {
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
  if ((gameStatus !== 1 && gameStatus !== 2) || roundResetting) return;

  serverPlayers.forEach((sp) => {
    if (!sp) return;
    if (sp.isDeployed) return;
    if (!mod.IsPlayerValid(sp.player)) return;

    const spawnerObjId = getInitialSpawnPointObjIdForTeam(mod.GetTeam(sp.player));
    if (!spawnerObjId) return;

    mod.SetRedeployTime(sp.player, 0);
    mod.SpawnPlayerFromSpawnPoint(sp.player, spawnerObjId);
  });
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
    - After first capture, route by owned + uncontested flags:
      1 flag -> A/B/C, 2 flags -> AB/AC/BC, 3 flags -> ABC.
    - If no owned uncontested flag exists, fall back immediately to furthest-safe single-flag HQ (A/B/C).
*/
function UpdateFlagHQSpawns(): void {
  if (gameStatus !== 3) return;

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

  const chosenT1 = chooseLiveDynamicHqForTeam(team1, team1HasCapturedAnyFlag);
  const chosenT2 = chooseLiveDynamicHqForTeam(team2, team2HasCapturedAnyFlag);

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

/* =================================================================================================
   11) CAPTURE AUDIO LOOPS / CONTESTED DETECTION
================================================================================================= */

function UpdateCaptureTickAudio(): void {
  if (gameStatus !== 3) return;

  const now = serverTickCount;

  Object.values(serverCapturePoints).forEach((cp) => {
    const cpId = cp.id;

    const playerIds = cp.getPlayerIdsOnPoint();
    if (!playerIds || playerIds.length === 0) return;

    const onPointCounts = cp.getOnPoint();
    const hasT1 = onPointCounts[0] > 0;
    const hasT2 = onPointCounts[1] > 0;
    if (!hasT1 && !hasT2) return;

    const progress = cp.getCaptureProgress();
    const contested = hasT1 && hasT2;

    const inProgressBand = progress > PROGRESS_EMPTY && progress < PROGRESS_FULL;

    // Tick while:
    // - contested (both teams present), OR
    // - progress is actively between empty/full (someone is capturing or neutralizing)
    if (!contested && !inProgressBand) return;

    const majorityTeam = getMajorityTeamOnPoint(cp);

    for (let i = 0; i < playerIds.length; i++) {
      const playerId = playerIds[i];
      const p = serverPlayers.get(playerId);
      if (!p) continue;
      if (!p.isDeployed) continue;
      if (!mod.IsPlayerValid(p.player)) continue;
      if (!isPlayerAlive(p.player)) continue;

      const key = playerId + "_" + cpId;
      const last = lastCaptureTickAt[key] ?? -999999;

      if (now - last < CAPTURE_TICK_INTERVAL_TICKS) continue;
      lastCaptureTickAt[key] = now;

      if (contested) {
        // Everyone hears enemy tick when contested.
        playTickEnemy(p.player);
        continue;
      }

      // Not contested: majority team hears friendly tick, minority hears enemy tick.
      // If equal (no majority), treat like contested for feedback.
      if (mod.Equals(majorityTeam, teamNeutral)) {
        playTickEnemy(p.player);
        continue;
      }

      const playerTeam = mod.GetTeam(p.player);
      if (mod.Equals(playerTeam, majorityTeam)) playTickFriendly(p.player);
      else playTickEnemy(p.player);
    }
  });
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
}

function getMajorityTeamOnPoint(cp: CapturePoint): mod.Team {
  const onPoint = cp.getOnPoint();
  if (onPoint[0] > onPoint[1]) return team1;
  if (onPoint[1] > onPoint[0]) return team2;
  return teamNeutral;
}

/* =================================================================================================
   12) PHASE INITIALIZATION
================================================================================================= */
function ResetRoundGameplayState(): void {
  // Reset tickets immediately so any UI that reads serverScores starts clean.
  serverScores = [INITIAL_TICKETS, INITIAL_TICKETS];

  // Clear per-round caches related to capture tick audio and capture credit (if you added it)
  lastCaptureTickAt = {};
  capturePointContested = {};
  lastContestSfxTickByCp = {};
  lastCaptureSfxTickByCp = {};
  lastJoinSfxTickByCp = {};
  lastEnterPointSfxTickByPlayerId = {};

  // Reset each capturepoint in the world and in our wrapper state
  Object.values(serverCapturePoints).forEach((cp) => {
    // Force owner back to neutral in the engine
    mod.SetCapturePointOwner(cp.capturePoint, teamNeutral);

    // Reset times (safe to reapply)
    mod.SetCapturePointCapturingTime(cp.capturePoint, CAPTURE_TIME);
    mod.SetCapturePointNeutralizationTime(cp.capturePoint, NEUTRALIZE_TIME);

    // Clear wrapper state (we can safely overwrite via (cp as any) to avoid editing the class)
    (cp as any)._owner = teamNeutral;
    (cp as any)._capturingTeam = teamNeutral;
    (cp as any)._captureProgress = 0;
    (cp as any)._previousCaptureProgress = 0;
    (cp as any)._fade = mod.Pi();
    (cp as any)._onPoint = [];
  });

  // Clear all players capturepoint refs and hide the capture widget container
  serverPlayers.forEach((p) => {
    p.setCapturePoint(null);
    if (p.activeFlagContainerWidget) mod.SetUIWidgetVisible(p.activeFlagContainerWidget, false);
  });

  // Reset the match timer baseline (your custom timer uses phaseTickCount + ROUND_TIME)
  phaseTickCount = 0;
}
function SwapAllPlayersTeams(): void {
  serverPlayers.forEach((p) => {
    const t = mod.GetTeam(p.player);
    if (mod.Equals(t, team1)) {
      mod.SetTeam(p.player, team2);
    } else if (mod.Equals(t, team2)) {
      mod.SetTeam(p.player, team1);
    }

    p.setTeam();
  });
}
function ResetAllPlayersReadyState(): void {
  serverPlayers.forEach((p) => p.resetReadyForNewRound());
}
function ResetAllCapturePoints(): void {
  Object.values(serverCapturePoints).forEach((cp) => {
    // OFF first to flush capture state
    mod.EnableGameModeObjective(cp.capturePoint, false);

    // Force neutral owner while disabled
    mod.SetCapturePointOwner(cp.capturePoint, teamNeutral);

    // Toggle ON briefly so the engine replicates the new owner/state
    mod.EnableGameModeObjective(cp.capturePoint, true);

    // Force neutral again while enabled (helps when the engine re-applies old owner)
    mod.SetCapturePointOwner(cp.capturePoint, teamNeutral);

    // Turn back OFF for prematch; PreLive will turn ON cleanly
    mod.EnableGameModeObjective(cp.capturePoint, false);

    // Reapply timings
    mod.SetCapturePointCapturingTime(cp.capturePoint, CAPTURE_TIME);
    mod.SetCapturePointNeutralizationTime(cp.capturePoint, NEUTRALIZE_TIME);

    // Reset wrapper-side state
    (cp as any)._owner = teamNeutral;
    (cp as any)._capturingTeam = teamNeutral;
    (cp as any)._captureProgress = 0;
    (cp as any)._previousCaptureProgress = 0;
    (cp as any)._onPoint = [];
    (cp as any)._fade = mod.Pi();
  });

  capturePointContested = {};
  lastCaptureTickAt = {};
  lastContestSfxTickByCp = {};
  lastCaptureSfxTickByCp = {};
  lastJoinSfxTickByCp = {};

  serverPlayers.forEach((p) => {
    p.setCapturePoint(null);
    if (p.activeFlagContainerWidget) {
      mod.SetUIWidgetVisible(p.activeFlagContainerWidget, false);
    }
  });
}
function StartCapturePointResetReplication(): void {
  // Run reset multiple ticks so all clients replicate the neutral state
  pendingCpResetTicks = 8;
}

function ProcessCapturePointResetReplication(): void {
  if (pendingCpResetTicks <= 0) return;

  // Do the expensive reset once at the start of the window
  if (pendingCpResetTicks === 8) {
    ResetAllCapturePoints();
  }

  pendingCpResetTicks -= 1;
}


function ReturnToPreMatchAfterRoundReset(): void {
  serverScores = [INITIAL_TICKETS, INITIAL_TICKETS];
  phaseTickCount = 0;
  countDown = COUNT_DOWN_TIME;
  postmatchResultSfxPlayed = false;
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
  BuildPrematchRosterUI();
  UpdatePrematchRosterUI();

  gameStatus = 0;
  applyPrematch889HealthForAllPlayers();
  mod.DeployAllPlayers();
}

function InitializePreMatch(): void {
  phaseTickCount = 0;
  evaluateObjectiveHighlightStringKeyHealth();

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
    mod.EnableGameModeObjective(cp.capturePoint, false);
  });

  ConfigurePreMatchSpawns();


  BuildPrematchRosterUI();
  UpdatePrematchRosterUI();

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

    // Disable the tabletop deploy screen during the redeploy countdown (auto-spawn only).
    mod.SetSpawnMode(mod.SpawnModes.AutoSpawn);
    // If this countdown is the postmatch reset countdown, keep it minimal.
    if (roundResetting) {
      SafeSetWidgetVisibleByName("PreMatchContainer", false);
      SafeSetWidgetVisibleByName("LiveContainer", false);

      SafeSetTextLabelByName("MatchStartsText", mod.Message(mod.stringkeys.Redeploying));
      SafeSetWidgetVisibleByName("CountDownContainer", true);

      // Spawn routing back to prematch will be applied in ResetRoundToPreMatch().
      initOk = true;
      return;
    }

    SafeSetWidgetVisibleByName("PreMatchContainer", false);

    for (let i = 0; i < 4; i++) {
      SafeEnableWorldIconById(WORLDICON_T1_SWITCH + i, false, false);
    }

    SafeEnableInteractPointById(IP_T1_READY, false);
    SafeEnableInteractPointById(IP_T2_READY, false);

    SafeSetTextLabelByName("MatchStartsText", mod.Message(mod.stringkeys.Redeploying));
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
    SafeSetWidgetVisibleByName("CountDownContainer", true);

    // Disable prematch world icons + interact points.
    for (let i = 0; i < 4; i++) {
      SafeEnableWorldIconById(WORLDICON_T1_SWITCH + i, false, false);
    }
    SafeEnableInteractPointById(IP_T1_SWITCH, false);
    SafeEnableInteractPointById(IP_T1_READY, false);
    SafeEnableInteractPointById(IP_T2_SWITCH, false);
    SafeEnableInteractPointById(IP_T2_READY, false);

    // Auto-spawn players at initial HQ for pre-live countdown.
    mod.SetSpawnMode(mod.SpawnModes.AutoSpawn);
    DisableAllDynamicHQsAndLiveHQs();
    EnableOnlyInitialHQs();
    enforceReadyupHqsDisabledOutsidePrematch("InitializePreLive");
    mod.UndeployAllPlayers();

    forceAutoDeployToInitialHqDuringCountdown();

    Object.values(serverCapturePoints).forEach((capturePoint) => {
      mod.EnableGameModeObjective(capturePoint.capturePoint, true);
    });

    serverPlayers.forEach((p) => setReadyPhaseProtectionForPlayer(p.player, true));
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
  // Root containers
  SetDepthAboveGameUI("UIContainer");
  SetDepthAboveGameUI("LiveContainer");

  // Match time container + label
  SetDepthAboveGameUI("matchtime");


  // Scores + pulses
  SetDepthAboveGameUI("friendlyscore");
  SetDepthAboveGameUI("friendlyscore_pulse");
  SetDepthAboveGameUI("enemyscore");
  SetDepthAboveGameUI("enemyscore_pulse");

  // Match progress bars + fills + pulses
  SetDepthAboveGameUI("friendlyprogressbar");
  SetDepthAboveGameUI("friendlyprogressbarfill");
  SetDepthAboveGameUI("friendlyprogress_pulse");

  SetDepthAboveGameUI("enemyprogressbar");
  SetDepthAboveGameUI("enemyprogressbarfill");
  SetDepthAboveGameUI("enemyprogress_pulse");

  // Flag containers
  SetDepthAboveGameUI("FlagContainerA");
  SetDepthAboveGameUI("FlagContainerB");
  SetDepthAboveGameUI("FlagContainerC");

  UpdateFlagHQSpawns();

  // Hide prematch UI once players are deploying/playing.
  const pre = mod.FindUIWidgetWithName("PreMatchContainer");
  if (pre) mod.SetUIWidgetVisible(pre, false);

  mod.SetUIWidgetVisible(UIContainers[1], false);
  mod.SetUIWidgetVisible(UIContainers[2], true);
  HideSharedTicketBarFills();


  serverPlayers.forEach((p) => p.addUI());

  serverPlayers.forEach((p) => setReadyPhaseProtectionForPlayer(p.player, false));

  serverPlayers.forEach((p) => {
    p.setTeam();
    mod.SetRedeployTime(p.player, REDEPLOY_TIME);
    mod.EnableAllInputRestrictions(p.player, false);
    mod.EnableInputRestriction(p.player, mod.RestrictedInputs.FireWeapon, false);
    if (p.isDeployed) p.isFirstDeploy();
  });

  serverScores = [INITIAL_TICKETS, INITIAL_TICKETS];

  mod.SetScoreboardColumnNames(
    mod.Message(mod.stringkeys.ScoreboardScore),
    mod.Message(mod.stringkeys.ScoreboardKills),
    mod.Message(mod.stringkeys.ScoreboardDeaths),
    mod.Message(mod.stringkeys.ScoreboardAssists),
    mod.Message(mod.stringkeys.ScoreboardCaptures)
  );

  SetUITime();
  SetUIScores();

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

function ProcessRoundResetCapturePointNeutralize(): void {
  // Only run this while we are in countdown and doing a round reset
  if (gameStatus !== 1) return;
  if (!roundResetting) return;

  // Run the reset attempt every second (avoids spamming)
  roundResetCpTickAccumulator += 1;
  if (mod.Modulo(roundResetCpTickAccumulator, TICK_RATE) !== 0) return;

  // Force UI neutral each second during reset countdown
  ForceAllPlayersNeutralFlagUI();

  // Attempt to force-world reset each second during countdown
  ResetAllCapturePoints();
}

function InitializePostmatch(): void {
  phaseTickCount = 0;
  countDown = POSTMATCH_TIME;
  enforceReadyupHqsDisabledOutsidePrematch("InitializePostmatch");
  prematchSwitchLastHandledTickByPlayerId = {};
  prematchSwitchDebounceWarnedByPlayerId = {};
  lastPrematchTeamSwitchTick = -999999;
  lastPrematchTeamSwitchTickByPlayerId = {};
  prematchStabilizationGateWarnedBySwitchTick = {};
  prematchHealthInside889ByPlayerId = {};
  prematchHealthAppliedMaxByPlayerId = {};

  mod.SetUIWidgetVisible(mod.FindUIWidgetWithName("LiveContainer"), false);
  mod.SetUIWidgetVisible(mod.FindUIWidgetWithName("CountDownContainer"), false);
  mod.SetUIWidgetVisible(mod.FindUIWidgetWithName("PreMatchContainer"), false);
  StopAllCaptureTickLoops();
  StopAllEndgameLoops();



  const post = mod.FindUIWidgetWithName("PostMatchContainer");
  if (post) {
    mod.SetUIWidgetVisible(post, true);
    mod.SetUIWidgetDepth(post, mod.UIDepth.AboveGameUI);
    mod.SetUIWidgetSize(post, mod.CreateVector(6000, 5000, 0));
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

function Mode_OnGameModeStarted(): void {
  startMainLoopTimer();
  SetDepthAboveGameUI("PreMatchContainer");

  ensureAudioSpawned();
  postmatchResultSfxPlayed = false;
  objectiveHighlightUseLiteralFallback = false;
  objectiveHighlightHealthChecked = false;
  objectiveHighlightKeyHealthWarned = false;
  evaluateObjectiveHighlightStringKeyHealth();
  prematchHealthInside889ByPlayerId = {};
  prematchHealthAppliedMaxByPlayerId = {};

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
}

function Mode_OnGameModeEnding(): void {
  stopMainLoopTimer();
  normalizeAllPlayersToStandardHealthAndClearPrematch889State();
  SwapAllPlayersTeams();
}

function Mode_OngoingGlobal(): void {
  // Intentionally lightweight. Main loop logic runs through Timers.
  return;
}

function Mode_OngoingGlobal_Inner(): void {
  if (!gameModeStarted) return;

  serverTickCount += 1;
  phaseTickCount += 1;
  if (gameStatus !== 0 && mod.Modulo(phaseTickCount, TICK_RATE) === 0) {
    enforceReadyupHqsDisabledOutsidePrematch("OngoingGlobal_Inner_periodic");
  }
  ProcessCapturePointResetReplication();
  ProcessRoundResetCapturePointNeutralize();

  if (gameStatus === 0) {
    if (!initialization[0]) InitializePreMatch();

    let readyPlayers: number[] = [0, 0];
    let totalPlayers: number[] = [0, 0];

    serverPlayers.forEach((p) => {
      p.setTeam();
      const team = mod.GetTeam(p.player);
      if (isBotBackfillPlayer(p.player)) return;

      if (mod.Equals(team, team1)) {
        totalPlayers[0] += 1;
        if (p.isReady()) readyPlayers[0] += 1;
      } else if (mod.Equals(team, team2)) {
        totalPlayers[1] += 1;
        if (p.isReady()) readyPlayers[1] += 1;
      }
    });

    SafeSetTextLabelByName("PreMatchTeam1", mod.Message("{}/{}", readyPlayers[0], totalPlayers[0]));
    SafeSetTextLabelByName("PreMatchTeam2", mod.Message("{}/{}", readyPlayers[1], totalPlayers[1]));
    UpdatePrematchRosterUI();

    const allReady =
      readyPlayers[0] === totalPlayers[0] &&
      readyPlayers[1] === totalPlayers[1] &&
      (readyPlayers[0] > 0 || readyPlayers[1] > 0);
    const switchElapsedTicks = serverTickCount - lastPrematchTeamSwitchTick;
    const teamSwitchStabilized = switchElapsedTicks >= PRELIVE_TEAM_SWITCH_STABILIZE_TICKS;

    if (allReady) {
      if (!teamSwitchStabilized) {
        warnPrematchStabilizationGateBlockedOnce(readyPlayers, totalPlayers, switchElapsedTicks);
      } else {
        normalizeAllPlayersToStandardHealthAndClearPrematch889State();
        initialization[1] = false;
        gameStatus = 1;
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

      if (countDown === 0) {
        if (roundResetting) {
          roundResetting = false;
          mod.UndeployAllPlayers();
          SwapAllPlayersTeams();
          StartCapturePointResetReplication();
          ReturnToPreMatchAfterRoundReset();
          return;
        } else {
          gameStatus = 2;
        }
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

    if (mod.Modulo(phaseTickCount, TICK_RATE) === 0) {
      countDown -= 1;
      const vol = countDown <= 3 ? 0.85 : 0.6;
      playCountdownHeartbeatToAll(vol);
      SafeSetTextLabelByName("CountDownText", mod.Message(countDown));
      if (countDown === 0) {
        playMatchStartStingerToAll(1.0);
        void showMatchStartBannerOnce();
        gameStatus = 3;
      }
    }
  } else if (gameStatus === 3) {
    if (!initialization[3]) {
      InitializeLive();
      return;
    }

    if (ENABLE_DAMAGE_SMOOTHING) {
      dmgSpreadProcessQueueTick();
      dmgSpreadUpdateHealthCacheTick();
    }

    if (mod.Modulo(phaseTickCount, LIVE_FAST_UPDATE_INTERVAL_TICKS) === 0) {
      SyncPlayersOnPointsFromEngine();
      refreshCapturePointsEngineStateForUI();
      const safetyDue = mod.Modulo(phaseTickCount, HQ_ROUTING_SAFETY_INTERVAL_TICKS) === 0;
      if (hqRoutingDirty || safetyDue) {
        recomputeLiveHqRouting();
      }
    }

    if (mod.Modulo(phaseTickCount, LIVE_ENDGAME_AUDIO_INTERVAL_TICKS) === 0) {
      UpdateEndgameSuspenseAudio();
    }

    if (mod.Modulo(phaseTickCount, LIVE_SLOW_UPDATE_INTERVAL_TICKS) === 0) {
      SetUITime();
      ChangeTickets();
      SetUIScores();
      UpdateScoreboard();
      UpdateCaptureTickLoopsGlobal();
    }

    if (mod.GetMatchTimeRemaining() <= 0) gameStatus = 4;

    if (serverScores[0] <= 0 || serverScores[1] <= 0) {
      gameStatus = 4;
      SafeSetWidgetVisibleByName("LiveContainer", false);
    }

    if (mod.Modulo(phaseTickCount, DAMAGE_INTERVAL_TICKS) === 0) {
      serverPlayers.forEach((p) => {
        if (playerInDamageZone[p.id] === true && p.isDeployed && isPlayerAlive(p.player)) {
          mod.DealDamage(p.player, DAMAGE_PER_PULSE);
        }
      });
    }
  } else {
    if (!initialization[4]) InitializePostmatch();
    if (postmatchEndStep !== 0) {
      if (postmatchEndStep === 1) {
        if (serverTickCount - postmatchEndStepTick >= 1) {
          mod.EndGameMode(postmatchWinnerTeam);
          postmatchEndStep = 2;
          postmatchEndStepTick = serverTickCount;
        }
        return;
      }

      if (postmatchEndStep === 2) {
        if (serverTickCount - postmatchEndStepTick >= POSTMATCH_END_DELAY_TICKS) {
          mod.UndeployAllPlayers();
          postmatchEndStep = 3;
          postmatchEndStepTick = serverTickCount;
        }
        return;
      }

      if (postmatchEndStep === 3) {
        if (serverTickCount - postmatchEndStepTick >= POSTMATCH_END_DELAY_TICKS) {
          SwapAllPlayersTeams();
          postmatchEndStep = 0;
        }
        return;
      }
    }

    if (mod.Modulo(phaseTickCount, TICK_RATE) === 0) {
      countDown -= 1;
      if (countDown === 0) {
        SafeSetWidgetVisibleByName("PostMatchContainer", false);
        postmatchWinnerTeam = getWinningTeam();
        postmatchEndStep = 1;
        postmatchEndStepTick = serverTickCount;
        return;
      }
    }
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

  if (player) {
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

  if (gameStatus === 1) {
    stripLoadoutToMeleeOnly(eventPlayer);
  }

  if (gameStatus === 0 || gameStatus === -1) {
    if (player) replacePrematchReadyText(player.id, eventPlayer);
    BuildPrematchRosterUI();
    UpdatePrematchRosterUI();
  } else if (gameStatus === 3) {
    SafeSetWidgetVisibleByName("PreMatchContainer", false);
    SafeSetWidgetVisibleByName("LiveContainer", true);
    HideSharedTicketBarFills();
    if (player) player.addUI();
  }
}

function Mode_OnPlayerLeaveGame(eventNumber: number): void {
  let leaving: Player | undefined = undefined;

  leaving = findServerPlayerByObjId(eventNumber);
  if (!leaving) leaving = serverPlayers.get(eventNumber);

  if (!leaving) return;
  cleanupRestrictedAreaUiForPlayer(leaving.id);
  clearPrematch889StateForPlayer(leaving.id);
  // Ensure HUD can be rebuilt cleanly if the engine destroys UI widgets on disconnect.
  liveHudBuiltByPlayerId[leaving.id] = false;



  emitJoinWorldLogIfEnabled(leaving.id, mod.Message(mod.stringkeys.PlayerDisconnected, leaving.id));
  disconnectedPlayers.push(leaving);
  serverPlayers.delete(leaving.id);

  if (gameStatus === 3) {
    leaving.addDeath();

    const cp = leaving.getCapturePoint();
    if (cp) {
      const capturePoint = serverCapturePoints[mod.GetObjId(cp)];
      if (capturePoint) capturePoint.removeOnPoint(leaving.id);
      leaving.setCapturePoint(null);
    }
  }

  if (gameStatus === 0) UpdatePrematchRosterUI();
}

async function Mode_OnPlayerDeployed(eventPlayer: mod.Player): Promise<void> {
  const playerId = modlib.getPlayerId(eventPlayer);
  const team = mod.GetTeam(eventPlayer);

  applyPhaseInputRestrictionsForPlayer(eventPlayer);
  // Reset damage spacing state on deploy
  dmgSpreadClearForPlayer(eventPlayer);
  


  if (gameStatus === 0 || gameStatus === 1) {
    const pPreMatchOrCountdown = serverPlayers.get(playerId);
    if (pPreMatchOrCountdown) pPreMatchOrCountdown.isDeployed = true;
    applyPrematch889HealthForPlayer(playerId);
    if (gameStatus === 1) stripLoadoutToMeleeOnly(eventPlayer);
    return;
  }

  if (gameStatus === 2) {
    const pPre = serverPlayers.get(playerId);
    if (pPre) pPre.isDeployed = true;
    applyPrematch889HealthForPlayer(playerId);
    return;
  }

  if (gameStatus !== 3) return;

  const p = serverPlayers.get(playerId);
  if (!p) return;

  p.isDeployed = true;
  applyPrematch889HealthForPlayer(playerId);
  applyPhaseInputRestrictionsForPlayer(eventPlayer);
  // If we spawned near ANY friendly player (<= 8m), do not allow safe-spawn recycling.
  if (isSpawnNearFriendlyPlayer(eventPlayer, playerId, FRIENDLY_SPAWN_BYPASS_RADIUS_METERS)) {
    safeSpawnForcedRedeploys[playerId] = 0;
    safeSpawnForcedUndeploy[playerId] = false;
    safeSpawnUnsafePending[playerId] = false;
    // Optional: you can also stop the squad probe logic if you want.
  }


  // --- SQUAD SPAWN HARD BYPASS (within 8m) ---
  // If the player spawned close to a living squadmate, we do NOT want safe-spawn recycling at all.
  // This avoids the timing/race where the async probe hasn't set bypass yet.
  const squadSpawnNow = checkIfSpawnedOnSquadmate(eventPlayer);
  if (squadSpawnNow) {
    squadSpawnBypass[playerId] = true;
    void clearSquadSpawnBypassLater(playerId);

    // Reset forced redeploy counter so a squad spawn doesn't inherit prior "unsafe" history.
    safeSpawnForcedRedeploys[playerId] = 0;
    safeSpawnForcedUndeploy[playerId] = false;
    safeSpawnUnsafePending[playerId] = false;
  } else {
    squadSpawnBypass[playerId] = false;

    // Keep your probe if you still want it for edge cases.
    void startSquadSpawnBypassProbe(eventPlayer, playerId);
  }

  mod.SetRedeployTime(eventPlayer, REDEPLOY_TIME);

  const wasForced = safeSpawnForcedUndeploy[playerId] === true;

  // IMPORTANT: Do NOT overwrite the player's HQ routing while we are in a forced safe-spawn recycle.
  // We only "commit" the route after the safe-spawn check succeeds.
  if (!wasForced && safeSpawnUnsafePending[playerId] !== true) {
    const dyn = modlib.Equals(team, team1) ? currentDynamicHqTeam1 : currentDynamicHqTeam2;
    if (dyn && isValidDynamicSpawnId(dyn)) {
      pendingDynamicHqForPlayer[playerId] = dyn;
    }
  }


  const isFirstLiveDeploy = p.isFirstDeploy();
  if (!wasForced && !isFirstLiveDeploy) {
    if (modlib.Equals(team, team1)) serverScores[0] += DEATH_TICKET_LOSS;
    else serverScores[1] += DEATH_TICKET_LOSS;
  }
  ClampTicketsAndMaybeEndMatch();

  await SafeSpawnCheckOrRedeploy(eventPlayer, playerId);
  
  HqDesyncCheckAndRecycle(eventPlayer, playerId);


  if (safeSpawnUnsafePending[playerId] !== true) {
    safeSpawnForcedUndeploy[playerId] = false;
  }
}

async function Mode_OnPlayerUndeploy(eventPlayer: mod.Player): Promise<void> {
  const id = modlib.getPlayerId(eventPlayer);
  const p = serverPlayers.get(id);
  if (!p) return;

  prematchHealthInside889ByPlayerId[id] = false;
  delete prematchHealthAppliedMaxByPlayerId[id];

   // Reset damage spacing state on undeploy
  dmgSpreadClearForPlayer(eventPlayer);


  p.isDeployed = false;
  

  // Countdown/pre-live auto-spawn:
  // If a player redeploys manually (or gets undeployed by the mode) during the countdown,
  // instantly spawn them from their team's initial HQ spawn point so they never land on the tablet.
  if ((gameStatus === 1 || gameStatus === 2) && !roundResetting) {
    const spawnerObjId = getInitialSpawnPointObjIdForTeam(mod.GetTeam(eventPlayer));
    if (spawnerObjId) {
      mod.SetRedeployTime(eventPlayer, 0);
      mod.SpawnPlayerFromSpawnPoint(eventPlayer, spawnerObjId);
    }
    return;
  }

  if (gameStatus === 3) {
    ForceRemovePlayerFromAllCapturePoints(id);
    stopCaptureTickLoop(id);

  }

  if (safeSpawnUnsafePending[id] === true) {
    safeSpawnUnsafePending[id] = false;

    const spawnerObjId = safeSpawnUnsafeSpawnerObjId[id];
    safeSpawnUnsafeSpawnerObjId[id] = 0;

    // Keep the original 0.1s undeploy buffer, but add an extra 0.5s between redeploy attempts
    await mod.Wait(0.1);
    await mod.Wait(0.5);

    if (spawnerObjId) {
      mod.SetRedeployTime(eventPlayer, 0);
      mod.SpawnPlayerFromSpawnPoint(eventPlayer, spawnerObjId);
    }

    mod.SetRedeployTime(eventPlayer, REDEPLOY_TIME);
    return;
  }

  if (safeSpawnForcedUndeploy[id] === true) return;
  if (gameStatus === 2) return;

  if (gameStatus === 3) p.addDeath();
}

function Mode_OnPlayerInteract(eventPlayer: mod.Player, eventInteractPoint: mod.InteractPoint): void {
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
    if (ipId === IP_SPECTATOR) {
      mod.SetCameraTypeForPlayer(eventPlayer, mod.Cameras.Free);
    }

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
function SyncPlayersOnPointsFromEngine(): void {
  if (gameStatus !== 3) return;

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

    const arr = mod.GetPlayersOnPoint(cp.capturePoint);

    for (let i = 0; i < mod.CountOf(arr); i++) {
      const pl = mod.ValueInArray(arr, i) as mod.Player;
      if (!mod.IsPlayerValid(pl)) continue;
      if (!isPlayerAlive(pl)) continue;

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
    const oldPoint = sp.getCapturePoint();

    if (newCpId === undefined) {
      if (oldPoint) {
        sp.setCapturePoint(null);
        if (sp.activeFlagContainerWidget) mod.SetUIWidgetVisible(sp.activeFlagContainerWidget, false);
        stopCaptureTickLoop(sp.id);
      }
      return;
    }

    const cpWrap = serverCapturePoints[newCpId];
    if (!cpWrap) return;

    const newPoint = cpWrap.capturePoint;

    // No mod.GetCapturePointId in your SDK; compare capture point handle directly
    if (!oldPoint || oldPoint !== newPoint) {
      sp.setCapturePoint(newPoint);

      if (sp.activeFlagWidget) mod.SetUITextLabel(sp.activeFlagWidget, mod.Message(cpWrap.symbol));
      if (sp.activeFlagContainerWidget) mod.SetUIWidgetVisible(sp.activeFlagContainerWidget, true);

      void startCaptureTickLoop(sp.id);
    } else {
      if (sp.activeFlagContainerWidget) mod.SetUIWidgetVisible(sp.activeFlagContainerWidget, true);
    }

    sp.updateUIPlayersOnPoint();
    sp.updateUIProgress();
  });

  // Clear only keys we set this sync (no new object alloc)
  _tmpPlayerToCpIdClear();
}






function ForceRemovePlayerFromAllCapturePoints(playerId: number): void {
  stopCaptureTickLoop(playerId);

  // Remove from all tracked capture points.
  Object.values(serverCapturePoints).forEach((cp) => cp.removeOnPoint(playerId));

  // Clear their local capture UI state if they are still known on server.
  const p = serverPlayers.get(playerId);
  if (p) {
    p.setCapturePoint(null);
    if (p.activeFlagContainerWidget) mod.SetUIWidgetVisible(p.activeFlagContainerWidget, false);

    // These widgets exist only in live; guard in case they are not built yet.
    if (p.friendlyCapWidget) mod.SetUITextLabel(p.friendlyCapWidget, mod.Message(0));
    if (p.enemyCapWidget) mod.SetUITextLabel(p.enemyCapWidget, mod.Message(0));
    if (p.activeFlagWidget) mod.SetUITextLabel(p.activeFlagWidget, mod.Message(0));
  }

  // Refresh UI for everyone still on points.
  Object.values(serverCapturePoints).forEach((cp) => cp.updateUIforPlayersOnPoint());
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

function markCaptureCredit(cpId: number, playerId: number): void {
  if (!captureCreditByCpId[cpId]) captureCreditByCpId[cpId] = {};
  captureCreditByCpId[cpId][playerId] = true;
}

function clearCaptureCredit(cpId: number): void {
  captureCreditByCpId[cpId] = {};
}

function Mode_OnPlayerEnterCapturePoint(eventPlayer: mod.Player, eventCapturePoint: mod.CapturePoint): void {
  if (gameStatus !== 3) return;
  markHqRoutingDirty();

  const team = mod.GetTeam(eventPlayer);
  const id = modlib.getPlayerId(eventPlayer);
  const cpObjId = mod.GetObjId(eventCapturePoint);
  const cp = serverCapturePoints[cpObjId];
  const player = serverPlayers.get(id);

  if (!cp) return;
  const highlightSymbol = tryGetCapturePointSymbolByObjId(cpObjId);

  const before = cp.getOnPoint();
  cp.addOnPoint(id);

  const lastEnter = lastEnterPointSfxTickByPlayerId[id] ?? -999999;
  if (phaseTickCount - lastEnter >= ENTER_POINT_SFX_COOLDOWN_TICKS) {
    lastEnterPointSfxTickByPlayerId[id] = phaseTickCount;

    if (mod.Equals(cp.getOwner(), team) || mod.Equals(cp.getOwner(), teamNeutral)) playThumpFriendly(eventPlayer);
    else playThumpEnemy(eventPlayer);
  }

  const onpoint = cp.getOnPoint();

  const progress = cp.getCaptureProgress();
  const effectivelyFull = progress >= PROGRESS_FULL;

  if (effectivelyFull) {
    const majorityTeam = getMajorityTeamOnPoint(cp);
    if (!mod.Equals(majorityTeam, teamNeutral) && !mod.Equals(majorityTeam, cp.getOwner())) {
      OnCapturePointNeutralizing(eventCapturePoint, majorityTeam);
    }
  }

  const capturingNeutralByTeam1 = mod.Equals(cp.getOwner(), teamNeutral) && onpoint[0] === 1 && cp.getCaptureProgress() < PROGRESS_EPSILON;
  const capturingNeutralByTeam2 = mod.Equals(cp.getOwner(), teamNeutral) && onpoint[1] === 1 && cp.getCaptureProgress() < PROGRESS_EPSILON;

  if (capturingNeutralByTeam1) {
    showObjectiveHighlightToTeamStrict(
      mod.stringkeys.ObjectiveCapturing,
      "Objective {} being captured",
      highlightSymbol ?? "",
      team1,
      "OnPlayerEnterCapturePoint/ObjectiveCapturing/team1"
    );
    showObjectiveHighlightToTeamStrict(
      mod.stringkeys.ObjectiveCapturingEnemy,
      "Objective {} being attacked by enemy team",
      highlightSymbol ?? "",
      team2,
      "OnPlayerEnterCapturePoint/ObjectiveCapturingEnemy/team2"
    );
  } else if (capturingNeutralByTeam2) {
    showObjectiveHighlightToTeamStrict(
      mod.stringkeys.ObjectiveCapturing,
      "Objective {} being captured",
      highlightSymbol ?? "",
      team2,
      "OnPlayerEnterCapturePoint/ObjectiveCapturing/team2"
    );
    showObjectiveHighlightToTeamStrict(
      mod.stringkeys.ObjectiveCapturingEnemy,
      "Objective {} being attacked by enemy team",
      highlightSymbol ?? "",
      team1,
      "OnPlayerEnterCapturePoint/ObjectiveCapturingEnemy/team1"
    );
  }

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

        const onCp = sp.getCapturePoint();
        if (!onCp) return;
        if (mod.GetObjId(onCp) !== cpId) return;
        if (sp.id === id) return;

        playTickFriendly(sp.player);
      });
    }
  }

  if (player) {
    let t: number[] = modlib.Equals(team, team1) ? [0, 1] : [1, 0];

    mod.SetUITextLabel(player.activeFlagWidget, mod.Message(cp.symbol));
    mod.SetUITextLabel(player.activeFlagFriendlyWidget, mod.Message(cp.getOnPoint()[t[0]]));
    mod.SetUITextLabel(player.activeFlagEnemyWidget, mod.Message(cp.getOnPoint()[t[1]]));
    mod.SetUIWidgetVisible(player.activeFlagContainerWidget, true);

    player.setCapturePoint(eventCapturePoint);
    void startCaptureTickLoop(id);
  }
  
  cp.updateUIforPlayersOnPoint();
}

function Mode_OnPlayerExitCapturePoint(eventPlayer: mod.Player, eventCapturePoint: mod.CapturePoint): void {
  if (gameStatus !== 3) return;
  markHqRoutingDirty();

  const cp = serverCapturePoints[mod.GetObjId(eventCapturePoint)];
  cp.removeOnPoint(modlib.getPlayerId(eventPlayer));

  const progress = cp.getCaptureProgress();
  const effectivelyFull = progress >= PROGRESS_FULL;

  if (effectivelyFull) {
    const majorityTeam = getMajorityTeamOnPoint(cp);
    if (!mod.Equals(majorityTeam, teamNeutral) && !mod.Equals(majorityTeam, cp.getOwner())) {
      OnCapturePointNeutralizing(eventCapturePoint, majorityTeam);
    }
  }

  const p = serverPlayers.get(modlib.getPlayerId(eventPlayer));
  if (p) {
    p.setCapturePoint(null);
    if (p.activeFlagContainerWidget) mod.SetUIWidgetVisible(p.activeFlagContainerWidget, false);
    stopCaptureTickLoop(modlib.getPlayerId(eventPlayer));

  }

  cp.updateUIforPlayersOnPoint();
}

function Mode_OnCapturePointCaptured(flag: mod.CapturePoint): void {
  if (gameStatus !== 3) return;
  markHqRoutingDirty();

  mod.SetCapturePointNeutralizationTime(flag, NEUTRALIZE_TIME);
  const team = mod.GetCurrentOwnerTeam(flag);

    // Award captures to players of the capturing team that are currently on the point.
    // Award captures to credited players of the capturing team.
  const cpObjId = mod.GetObjId(flag);
  const newOwner = mod.GetCurrentOwnerTeam(flag);

  const credit = captureCreditByCpId[cpObjId];
  if (credit) {
    Object.keys(credit).forEach((k) => {
      const pid = Number(k);
      const sp = serverPlayers.get(pid);
      if (!sp) return;
      if (!mod.Equals(mod.GetTeam(sp.player), newOwner)) return;

      sp.addCapture();
      sp.addScore(150);
    });
  }

  clearCaptureCredit(cpObjId);

  // Push scoreboard update immediately so players see capture count right away.
  UpdateScoreboard();



  const id = mod.GetObjId(flag);
  const symbol = serverCapturePoints[id].symbol;
  const highlightSymbol = tryGetCapturePointSymbolByObjId(id);

  serverPlayers.forEach((p) => {
    const playerTeam = mod.GetTeam(p.player);

    if (modlib.Equals(team, playerTeam)) {
      setFlagLetterAndOutlineColorForPlayer(p.id, symbol as any, COLOR_FRIENDLY);
    } else {
      setFlagLetterAndOutlineColorForPlayer(p.id, symbol as any, COLOR_ENEMY);
    }
  });



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

    playSfxToTeam(team, "captured");
    playVOToTeam(team, mod.VoiceOverEvents2D.ObjectiveCaptured, voflags[symbol]);

    const enemyTeam = mod.Equals(team, team1) ? team2 : team1;
    playVOToTeam(enemyTeam, mod.VoiceOverEvents2D.ObjectiveCapturedEnemy, voflags[symbol]);
  }
}

function OnCapturePointNeutralizing(flag: mod.CapturePoint, team: mod.Team): void {
  if (gameStatus !== 3) return;

  const id = mod.GetObjId(flag);
  const symbol = serverCapturePoints[id].symbol;
  const highlightSymbol = tryGetCapturePointSymbolByObjId(id);

  const owner = serverCapturePoints[id].getOwner();
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
}

function Mode_OnCapturePointLost(flag: mod.CapturePoint): void {
  if (gameStatus !== 3) return;
  markHqRoutingDirty();

  mod.SetCapturePointCapturingTime(flag, CAPTURE_TIME);

  const id = mod.GetObjId(flag);
  const symbol = serverCapturePoints[id].symbol;
  const highlightSymbol = tryGetCapturePointSymbolByObjId(id);

  serverPlayers.forEach((p) => {
    setFlagLetterAndOutlineColorForPlayer(p.id, symbol as any, COLOR_NEUTRAL);
  });



  const team = mod.GetPreviousOwnerTeam(flag);

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
}

function Mode_OnCapturePointCapturing(flag: mod.CapturePoint): void {
  if (gameStatus !== 3) return;
  markHqRoutingDirty();

  const cpObjId = mod.GetObjId(flag);
  const cp = serverCapturePoints[cpObjId];
  if (!cp) return;
  const highlightSymbol = tryGetCapturePointSymbolByObjId(cpObjId);

  const team = mod.GetCurrentOwnerTeam(flag);

  if (modlib.Equals(team, team1)) {
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
  } else if (modlib.Equals(team, team2)) {
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
  }
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

const DMG_SPREAD_CLOSE_MAX_DIST = 10;
const DMG_SPREAD_MID_MAX_DIST = 25;

// Tune these (seconds). Close range = more delay, long range = less delay.
const DMG_SPREAD_CLOSE_SEC = 2.0; // 0-10m
const DMG_SPREAD_MID_SEC = 1.80;   // 10-25m
const DMG_SPREAD_FAR_SEC = 1.60;   // 25m+

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
const DMG_SPREAD_HEALTH_DELAY_MIN_FACTOR = 0.45; // <= 1.0 (lower = faster when low HP)
const DMG_SPREAD_HEALTH_DELAY_MAX_FACTOR = 1.0;  // keep at 1.0

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
  if (!isPlayerAlive(victim)) return 99999;
  if (!isPlayerAlive(attacker)) return 99999;

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
    if (!isPlayerAlive(sp.player)) return;

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
    if (!sp || !sp.isDeployed || !mod.IsPlayerValid(sp.player) || !isPlayerAlive(sp.player)) {
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

  if (mod.IsPlayerValid(player) && isPlayerAlive(player)) {
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

  const victimId = modlib.getPlayerId(eventPlayer);

  // Prematch 889 rule:
  // - outside 889: full non-lethal protection (always force full heal)
  // - inside 889: no protection, player can be killed/downed normally
  if (isPrematchOutside889(victimId)) {
    forcePrematchOutside889FullHeal(eventPlayer, victimId);
    return;
  }

  if (!isPlayerAlive(eventPlayer)) return;

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

  const p = serverPlayers.get(modlib.getPlayerId(eventPlayer));
  if (!p) return;

  if (mod.NotEqualTo(eventPlayer, eventOtherPlayer)) {
    p.addKill();
    p.addScore(100);
  }
}

function Mode_OnPlayerEarnedKillAssist(eventPlayer: mod.Player, eventOtherPlayer: mod.Player): void {
  if (gameStatus !== 3) return;

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

    if (gameStatus !== 3) return;

    const p = serverPlayers.get(playerId);
    if (!p) return;

    // Existing damage zone
    if (triggerId === DAMAGE_TRIGGER_ID) {
      playerInDamageZone[playerId] = true;
      return;
    }

    // Restricted area
    if (triggerId === RESTRICTED_AREA_TRIGGER) {
      playerInRestrictedArea[playerId] = true;
      startRestrictedAreaCountdown(p);
      return;
    }
  } catch (err) {
    LogRuntimeError("OnPlayerEnterAreaTrigger", err);
  }
}


function Mode_OnPlayerExitAreaTrigger(eventPlayer: mod.Player, eventAreaTrigger: mod.AreaTrigger): void {
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
    if (triggerId === RESTRICTED_AREA_TRIGGER) {
      playerInRestrictedArea[playerId] = false;

      // Cancel any running countdown and hide the UI
      restrictedAreaCountdownToken[playerId] = (restrictedAreaCountdownToken[playerId] ?? 0) + 1;
      hideRestrictedAreaUi(playerId);

      const p = serverPlayers.get(playerId);
      if (p) stopRestrictedAreaLoopSfxForPlayer(p.player);

      return;
    }
  } catch (err) {
    LogRuntimeError("OnPlayerExitAreaTrigger", err);
  }
}

export const SquadObliterationHandlers = {
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
