import type { KothHillLetter } from '../config/koth-hills.ts';
import type { KothCardinalSide, KothPresenceZone, KothTeamId } from '../config/koth-spawns.ts';

export interface KothSpawnPositionVector {
    x: number;
    y: number;
    z: number;
}

export interface KothSpawnPlayerPositionSnapshot {
    playerId: number;
    teamId: KothTeamId;
    position: KothSpawnPositionVector;
}

export interface QueuedKothSpawnAnchor {
    regionId: string;
    selectedForObjectiveLetter: KothHillLetter;
    objectiveLetter?: KothHillLetter;
    teamSide: KothCardinalSide;
    variantSide: KothCardinalSide;
    anchorObjectId: number;
    distanceToObjectiveMeters?: number;
    isEmergencyFallback?: boolean;
}

export type KothSpawnJobKind =
    | 'queue-spawn'
    | 'teleport-deployed'
    | 'confirm-teleport-orientation'
    | 'live-start-deploy-recovery';

export interface KothSpawnJob {
    kind: KothSpawnJobKind;
    playerId: number;
    createdAtMs: number;
    attempt: number;
}

export interface KothSpawnSideAssignment {
    team1Side: KothCardinalSide;
    team2Side: KothCardinalSide;
    team1VariantSide: KothCardinalSide;
    team2VariantSide: KothCardinalSide;
}

export interface KothReinforcementTarget {
    playerId: number;
    teamId: KothTeamId;
    createdAtMs: number;
}

export interface KothReinforcementTargetsByTeam {
    1?: KothReinforcementTarget;
    2?: KothReinforcementTarget;
}

export interface KothPresenceZonePressureSnapshot {
    team1Count: number;
    team2Count: number;
    revision: number;
}

export interface KothSpawnState {
    queuedAnchorByPlayerId: Map<number, QueuedKothSpawnAnchor>;
    pendingQueueSpawnPlayerIds: Set<number>;
    playersByPresenceZone: Record<KothPresenceZone, Set<number>>;
    presenceZonesByPlayerId: Map<number, Set<KothPresenceZone>>;
    pressureSnapshotByPresenceZone: Record<KothPresenceZone, KothPresenceZonePressureSnapshot>;
    sideAssignmentByRegionId: Record<string, KothSpawnSideAssignment>;
    sideAssignmentChangedAtMsByRegionId: Record<string, number>;
    reinforcementTargetByTeamId: KothReinforcementTargetsByTeam;
    nextAnchorIndexBySectorKey: Record<string, number>;
    anchorCooldownUntilMsByObjectId: Map<number, number>;
    anchorPositionByObjectId: Map<number, mod.Vector>;
    anchorPositionVectorByObjectId: Map<number, KothSpawnPositionVector>;
    capturePointPositionByObjectId: Map<number, mod.Vector>;
    capturePointPositionVectorByObjectId: Map<number, KothSpawnPositionVector>;
    playerPositionSnapshotByPlayerId: Map<number, KothSpawnPlayerPositionSnapshot>;
    pendingJobs: KothSpawnJob[];
    warnedMissingSpawnAnchors: boolean;
    warnedSpawnAnchorResolveByObjectId: Record<number, boolean>;
    warnedPresenceAreaTriggerResolveByObjectId: Record<number, boolean>;
    warnedSpawnTeleportByPlayerId: Record<number, boolean>;
}

export function createKothSpawnState(): KothSpawnState {
    return {
        queuedAnchorByPlayerId: new Map<number, QueuedKothSpawnAnchor>(),
        pendingQueueSpawnPlayerIds: new Set<number>(),
        playersByPresenceZone: {
            northWest: new Set<number>(),
            northEast: new Set<number>(),
            southWest: new Set<number>(),
            southEast: new Set<number>(),
        },
        presenceZonesByPlayerId: new Map<number, Set<KothPresenceZone>>(),
        pressureSnapshotByPresenceZone: {
            northWest: { team1Count: 0, team2Count: 0, revision: 0 },
            northEast: { team1Count: 0, team2Count: 0, revision: 0 },
            southWest: { team1Count: 0, team2Count: 0, revision: 0 },
            southEast: { team1Count: 0, team2Count: 0, revision: 0 },
        },
        sideAssignmentByRegionId: {},
        sideAssignmentChangedAtMsByRegionId: {},
        reinforcementTargetByTeamId: {},
        nextAnchorIndexBySectorKey: {},
        anchorCooldownUntilMsByObjectId: new Map<number, number>(),
        anchorPositionByObjectId: new Map<number, mod.Vector>(),
        anchorPositionVectorByObjectId: new Map<number, KothSpawnPositionVector>(),
        capturePointPositionByObjectId: new Map<number, mod.Vector>(),
        capturePointPositionVectorByObjectId: new Map<number, KothSpawnPositionVector>(),
        playerPositionSnapshotByPlayerId: new Map<number, KothSpawnPlayerPositionSnapshot>(),
        pendingJobs: [],
        warnedMissingSpawnAnchors: false,
        warnedSpawnAnchorResolveByObjectId: {},
        warnedPresenceAreaTriggerResolveByObjectId: {},
        warnedSpawnTeleportByPlayerId: {},
    };
}
