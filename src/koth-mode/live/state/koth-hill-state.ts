import type { KothHillLetter } from '../config/koth-hills.ts';

export type KothHillControlState = 'inactive' | 'locked' | 'neutral' | 'team1' | 'team2' | 'contested';

export interface KothHillRuntimeState {
    currentHillIndex: number;
    currentHillLetter: KothHillLetter;
    nextHillIndex: number;
    activeObjectiveRemainingSeconds: number;
    nextPreviewRemainingSeconds: number;
    currentControlState: KothHillControlState;
    activeHillTeam1Players: Set<number>;
    activeHillTeam2Players: Set<number>;
    playerIdsByAreaTriggerId: Map<number, Set<number>>;
}
