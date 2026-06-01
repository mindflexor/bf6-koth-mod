import type { KothHillLetter } from '../config/koth-hills.ts';
import type { KothSpawnClusterSlot, KothTeamId } from '../config/koth-spawns.ts';

export interface QueuedKothSpawnAnchor {
    objectiveLetter: KothHillLetter;
    clusterSlot: KothSpawnClusterSlot;
    anchorObjectId: number;
}

export type KothSpawnJobKind = 'queue-spawn' | 'teleport-deployed';

export interface KothSpawnJob {
    kind: KothSpawnJobKind;
    playerId: number;
    createdAtMs: number;
    attempt: number;
}

export type KothClusterAssignmentByObjective = Record<KothHillLetter, Record<KothTeamId, KothSpawnClusterSlot>>;

export interface KothSpawnState {
    queuedAnchorByPlayerId: Map<number, QueuedKothSpawnAnchor>;
    playerIdsBySpawnAreaTriggerId: Map<number, Set<number>>;
    clusterAssignmentByObjective: KothClusterAssignmentByObjective;
    nextAnchorIndexByClusterKey: Record<string, number>;
    forwardReinforcementCountByClusterTeamKey: Record<string, number>;
    pendingJobs: KothSpawnJob[];
    warnedMissingSpawnAnchors: boolean;
    warnedSpawnAnchorResolveByObjectId: Record<number, boolean>;
    warnedSpawnAreaTriggerResolveByObjectId: Record<number, boolean>;
    warnedSpawnTeleportByPlayerId: Record<number, boolean>;
}

export function createKothSpawnState(): KothSpawnState {
    return {
        queuedAnchorByPlayerId: new Map<number, QueuedKothSpawnAnchor>(),
        playerIdsBySpawnAreaTriggerId: new Map<number, Set<number>>(),
        clusterAssignmentByObjective: createDefaultClusterAssignments(),
        nextAnchorIndexByClusterKey: {},
        forwardReinforcementCountByClusterTeamKey: {},
        pendingJobs: [],
        warnedMissingSpawnAnchors: false,
        warnedSpawnAnchorResolveByObjectId: {},
        warnedSpawnAreaTriggerResolveByObjectId: {},
        warnedSpawnTeleportByPlayerId: {},
    };
}

function createDefaultClusterAssignments(): KothClusterAssignmentByObjective {
    return {
        A: createDefaultTeamAssignment(),
        B: createDefaultTeamAssignment(),
        C: createDefaultTeamAssignment(),
        D: createDefaultTeamAssignment(),
        E: createDefaultTeamAssignment(),
    };
}

function createDefaultTeamAssignment(): Record<KothTeamId, KothSpawnClusterSlot> {
    return {
        1: '01',
        2: '02',
    };
}
