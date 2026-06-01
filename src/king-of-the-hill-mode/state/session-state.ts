import type { CapturePointState } from './capture-point-state.ts';
import type { PlayerState } from './player-state.ts';

export interface DynamicRoutingSessionState {
    currentDynamicHqTeam1: number;
    currentDynamicHqTeam2: number;
    hqRoutingDirty: boolean;
    lastHqRoutingUpdateTick: number;
}

export interface SafeSpawnSessionState {
    pendingDynamicHqForPlayer: Record<number, number | undefined>;
    lastDynamicHqForPlayer: Record<number, number>;
    safeSpawnSpawnerIndex: Record<number, number>;
    safeSpawnUnsafePending: Record<number, boolean>;
    safeSpawnUnsafeSpawnerObjId: Record<number, number>;
    safeSpawnForcedRedeploys: Record<number, number>;
    safeSpawnPendingCheck: Record<number, boolean>;
    safeSpawnForcedUndeploy: Record<number, boolean>;
    safeSpawnGenerationByPlayerId: Record<number, number>;
    safeSpawnCheckQueuedGenerationByPlayerId: Record<number, number | undefined>;
    safeSpawnForcedQueuedGenerationByPlayerId: Record<number, number | undefined>;
    squadSpawnBypassClearTimerByPlayerId: Record<number, number | undefined>;
    diagnostics: {
        checkQueueDepth: number;
        forcedSpawnQueueDepth: number;
        checksProcessed: number;
        forcedSpawnsProcessed: number;
        routeCacheRebuilds: number;
        spatialHashRebuilds: number;
        maxQueueAgeTicks: number;
    };
}

export interface RestrictedAreaSessionState {
    playerInDamageZone: Record<number, boolean>;
    playerInRestrictedArea: Record<number, boolean>;
    restrictedAreaCountdownToken: Record<number, number>;
    restrictedAreaRootWidgetByPlayerId: Record<number, mod.UIWidget | undefined>;
    restrictedAreaCounterWidgetByPlayerId: Record<number, mod.UIWidget | undefined>;
}

export interface PrematchSessionState {
    prematchHealthInside889ByPlayerId: Record<number, boolean>;
    prematchHealthAppliedMaxByPlayerId: Record<number, number>;
}

export interface PlayerDomainSessionState {
    byId: Map<number, PlayerState>;
    disconnectedPlayerIds: number[];
}

export interface ObjectiveDomainSessionState {
    capturePointsById: Map<number, CapturePointState>;
}

export interface CombatDomainSessionState {
    diagnostics: {
        liveTicks: number;
    };
}

export interface SpawnRoutingDomainSessionState {
    diagnostics: {
        routingTicks: number;
    };
    lastLiveFlankPressureByPlayerId: Record<
        number,
        | {
              defaultRouteKey: 'A' | 'B' | 'C' | null;
              chosenRouteKey: 'A' | 'B' | 'C' | null;
              aEnemyCount: number;
              cEnemyCount: number;
              recordedAtTick: number;
          }
        | undefined
    >;
}

export interface UiDomainSessionState {
    liveUiSlotByPlayerId: Record<
        number,
        | {
              teamKey: 'T1' | 'T2';
              slotIndex: number;
              slotKey: string;
          }
        | undefined
    >;
    playerIdByLiveUiSlotTeam1: Array<number | undefined>;
    playerIdByLiveUiSlotTeam2: Array<number | undefined>;
    diagnostics: {
        fastLaneTicks: number;
        slowLaneTicks: number;
        lastActiveTimerCount: number;
        assignedSlotCount: number;
        failedAssignmentCount: number;
    };
}

export interface AudioDomainSessionState {
    diagnostics: {
        endgameTicks: number;
    };
}

export interface LifecycleDomainSessionState {
    diagnostics: {
        prematchTicks: number;
        countdownTicks: number;
        preliveTicks: number;
        liveTicks: number;
        postmatchTicks: number;
    };
}

export interface SessionState {
    // Transitional compatibility keys still used by existing services.
    playersById: Map<number, PlayerState>;
    disconnectedPlayerIds: number[];
    capturePointsById: Map<number, CapturePointState>;
    dynamicRouting: DynamicRoutingSessionState;
    safeSpawn: SafeSpawnSessionState;
    restrictedArea: RestrictedAreaSessionState;
    prematch: PrematchSessionState;

    // Service-first domain slices.
    player: PlayerDomainSessionState;
    objective: ObjectiveDomainSessionState;
    combat: CombatDomainSessionState;
    spawnRouting: SpawnRoutingDomainSessionState;
    ui: UiDomainSessionState;
    audio: AudioDomainSessionState;
    lifecycle: LifecycleDomainSessionState;
}

export function createSessionState(): SessionState {
    const playersById = new Map<number, PlayerState>();
    const disconnectedPlayerIds: number[] = [];
    const capturePointsById = new Map<number, CapturePointState>();

    return {
        playersById,
        disconnectedPlayerIds,
        capturePointsById,
        dynamicRouting: {
            currentDynamicHqTeam1: 0,
            currentDynamicHqTeam2: 0,
            hqRoutingDirty: true,
            lastHqRoutingUpdateTick: -1,
        },
        safeSpawn: {
            pendingDynamicHqForPlayer: {},
            lastDynamicHqForPlayer: {},
            safeSpawnSpawnerIndex: {},
            safeSpawnUnsafePending: {},
            safeSpawnUnsafeSpawnerObjId: {},
            safeSpawnForcedRedeploys: {},
            safeSpawnPendingCheck: {},
            safeSpawnForcedUndeploy: {},
            safeSpawnGenerationByPlayerId: {},
            safeSpawnCheckQueuedGenerationByPlayerId: {},
            safeSpawnForcedQueuedGenerationByPlayerId: {},
            squadSpawnBypassClearTimerByPlayerId: {},
            diagnostics: {
                checkQueueDepth: 0,
                forcedSpawnQueueDepth: 0,
                checksProcessed: 0,
                forcedSpawnsProcessed: 0,
                routeCacheRebuilds: 0,
                spatialHashRebuilds: 0,
                maxQueueAgeTicks: 0,
            },
        },
        restrictedArea: {
            playerInDamageZone: {},
            playerInRestrictedArea: {},
            restrictedAreaCountdownToken: {},
            restrictedAreaRootWidgetByPlayerId: {},
            restrictedAreaCounterWidgetByPlayerId: {},
        },
        prematch: {
            prematchHealthInside889ByPlayerId: {},
            prematchHealthAppliedMaxByPlayerId: {},
        },
        player: {
            byId: playersById,
            disconnectedPlayerIds,
        },
        objective: {
            capturePointsById,
        },
        combat: {
            diagnostics: {
                liveTicks: 0,
            },
        },
        spawnRouting: {
            diagnostics: {
                routingTicks: 0,
            },
            lastLiveFlankPressureByPlayerId: {},
        },
        ui: {
            liveUiSlotByPlayerId: {},
            playerIdByLiveUiSlotTeam1: new Array<number | undefined>(32),
            playerIdByLiveUiSlotTeam2: new Array<number | undefined>(32),
            diagnostics: {
                fastLaneTicks: 0,
                slowLaneTicks: 0,
                lastActiveTimerCount: 0,
                assignedSlotCount: 0,
                failedAssignmentCount: 0,
            },
        },
        audio: {
            diagnostics: {
                endgameTicks: 0,
            },
        },
        lifecycle: {
            diagnostics: {
                prematchTicks: 0,
                countdownTicks: 0,
                preliveTicks: 0,
                liveTicks: 0,
                postmatchTicks: 0,
            },
        },
    };
}
