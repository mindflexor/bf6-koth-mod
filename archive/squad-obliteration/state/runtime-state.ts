export enum GamePhase {
    NotStarted = 'NotStarted',
    Prematch = 'Prematch',
    Countdown = 'Countdown',
    Prelive = 'Prelive',
    Live = 'Live',
    Postmatch = 'Postmatch',
}

export interface SchedulerHandles {
    disabledMcomEnforce?: number;
    phaseSecond?: number;
    liveFast?: number;
    liveSlow?: number;
    endgameAudio?: number;
    damageZonePulse?: number;
    iconFollow?: number;
    holdUi?: number;
    noFireEnforce?: number;
}

export interface RuntimeState {
    phase: GamePhase;
    serverTickCount: number;
    phaseTickCount: number;
    roundResetting: boolean;
    scheduler: SchedulerHandles;
}

export function createRuntimeState(): RuntimeState {
    return {
        phase: GamePhase.NotStarted,
        serverTickCount: 0,
        phaseTickCount: 0,
        roundResetting: false,
        scheduler: {},
    };
}
