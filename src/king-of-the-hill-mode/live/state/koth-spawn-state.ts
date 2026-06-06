import type { KothHillLetter } from '../config/koth-hills.ts';
import type { KothCardinalSide, KothPresenceZone } from '../config/koth-spawns.ts';

export interface QueuedKothSpawnAnchor {
    regionId: string;
    objectiveLetter?: KothHillLetter;
    teamSide: KothCardinalSide;
    variantSide: KothCardinalSide;
    anchorObjectId: number;
    distanceToObjectiveMeters?: number;
}

export type KothSpawnJobKind = 'queue-spawn' | 'teleport-deployed';

export interface KothSpawnJob {
    kind: KothSpawnJobKind;
    playerId: number;
    createdAtMs: number;
    attempt: number;
}

export interface KothSpawnState {
    queuedAnchorByPlayerId: Map<number, QueuedKothSpawnAnchor>;
    playersByPresenceZone: Record<KothPresenceZone, Set<number>>;
    presenceZonesByPlayerId: Map<number, Set<KothPresenceZone>>;
    nextAnchorIndexBySectorKey: Record<string, number>;
    pendingJobs: KothSpawnJob[];
    warnedMissingSpawnAnchors: boolean;
    warnedSpawnAnchorResolveByObjectId: Record<number, boolean>;
    warnedPresenceAreaTriggerResolveByObjectId: Record<number, boolean>;
    warnedSpawnTeleportByPlayerId: Record<number, boolean>;
}

export function createKothSpawnState(): KothSpawnState {
    return {
        queuedAnchorByPlayerId: new Map<number, QueuedKothSpawnAnchor>(),
        playersByPresenceZone: {
            northWest: new Set<number>(),
            northEast: new Set<number>(),
            southWest: new Set<number>(),
            southEast: new Set<number>(),
        },
        presenceZonesByPlayerId: new Map<number, Set<KothPresenceZone>>(),
        nextAnchorIndexBySectorKey: {},
        pendingJobs: [],
        warnedMissingSpawnAnchors: false,
        warnedSpawnAnchorResolveByObjectId: {},
        warnedPresenceAreaTriggerResolveByObjectId: {},
        warnedSpawnTeleportByPlayerId: {},
    };
}
