import type { KothHillLetter } from '../config/koth-hills.ts';

export type KothHillControlState = 'inactive' | 'locked' | 'neutral' | 'team1' | 'team2' | 'contested';
export type KothHillOwnerState = 'neutral' | 'team1' | 'team2';

export interface KothHillRuntimeState {
    currentHillIndex: number;
    currentHillLetter: KothHillLetter;
    nextHillIndex: number;
    activeObjectiveRemainingSeconds: number;
    activeLockRemainingSeconds: number;
    nextPreviewRemainingSeconds: number;
    currentControlState: KothHillControlState;
    currentOwnerState: KothHillOwnerState;
    activeHillTeam1Players: Set<number>;
    activeHillTeam2Players: Set<number>;
    playerIdsByAreaTriggerId: Map<number, Set<number>>;
}
