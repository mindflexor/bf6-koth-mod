import { KOTH_HILLS } from '../config/koth-hills.ts';
import { KOTH_RULES } from '../config/koth-rules.ts';
import { createKothSpawnState, type KothSpawnState } from './koth-spawn-state.ts';
import type { KothHillRuntimeState } from './koth-hill-state.ts';
import type { KothPlayerState } from './koth-player-state.ts';

export enum KothGamePhase {
    NotStarted = 'NotStarted',
    Live = 'Live',
    Postmatch = 'Postmatch',
}

export interface KothSchedulerHandles {
    workJob?: number;
    hillState?: number;
    objectiveTimer?: number;
    scoreTick?: number;
    worldIcon?: number;
    spawnJob?: number;
    postmatchEnd?: number;
}

export interface KothWorldIconRuntimeState {
    activeIconTeam1?: mod.WorldIcon;
    activeIconTeam2?: mod.WorldIcon;
    activeLockedIcon?: mod.WorldIcon;
    contestedTextIcon?: mod.WorldIcon;
    previewIcon?: mod.WorldIcon;
    warnedSpawnFailed: boolean;
    warnedPositionFailedByCapturePointId: Record<number, boolean>;
}

export interface KothRuntimeState {
    phase: KothGamePhase;
    isMatchActive: boolean;
    isPostGame: boolean;
    scheduler: KothSchedulerHandles;
    hill: KothHillRuntimeState;
    playersById: Map<number, KothPlayerState>;
    disconnectedPlayerIds: number[];
    team1Score: number;
    team2Score: number;
    victoryImminentShownTeam1: boolean;
    victoryImminentShownTeam2: boolean;
    scoreboardDirty: boolean;
    hudDirty: boolean;
    worldIcons: KothWorldIconRuntimeState;
    spawn: KothSpawnState;
    warnedMissingObjectiveIds: Record<number, boolean>;
}

export function createKothRuntimeState(): KothRuntimeState {
    return {
        phase: KothGamePhase.NotStarted,
        isMatchActive: false,
        isPostGame: false,
        scheduler: {},
        hill: {
            currentHillIndex: 0,
            currentHillLetter: KOTH_HILLS[0].letter,
            nextHillIndex: 1,
            activeObjectiveRemainingSeconds: KOTH_RULES.objectiveDurationSeconds,
            activeLockRemainingSeconds: 0,
            nextPreviewRemainingSeconds: 0,
            currentControlState: 'inactive',
            currentOwnerState: 'neutral',
            activeHillTeam1Players: new Set<number>(),
            activeHillTeam2Players: new Set<number>(),
            playerIdsByAreaTriggerId: new Map<number, Set<number>>(),
        },
        playersById: new Map<number, KothPlayerState>(),
        disconnectedPlayerIds: [],
        team1Score: 0,
        team2Score: 0,
        victoryImminentShownTeam1: false,
        victoryImminentShownTeam2: false,
        scoreboardDirty: true,
        hudDirty: true,
        worldIcons: {
            warnedSpawnFailed: false,
            warnedPositionFailedByCapturePointId: {},
        },
        spawn: createKothSpawnState(),
        warnedMissingObjectiveIds: {},
    };
}
