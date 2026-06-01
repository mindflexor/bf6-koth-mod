import { Timers } from 'bf6-portal-utils/timers/index.ts';

import type { KothModeContext } from '../state/koth-mode-context.ts';

export class KothSchedulerService {
    public constructor(private readonly _context: KothModeContext) {}

    public clearAll(): void {
        const scheduler = this._context.runtime.scheduler;

        Timers.clearInterval(scheduler.hillState);
        Timers.clearInterval(scheduler.objectiveTimer);
        Timers.clearInterval(scheduler.scoreTick);
        Timers.clearInterval(scheduler.worldIcon);
        Timers.clearInterval(scheduler.spawnJob);
        Timers.clearTimeout(scheduler.postmatchEnd);

        this._context.runtime.scheduler = {};
    }

    public setHillStateInterval(callback: () => void): void {
        this._context.runtime.scheduler.hillState = Timers.setInterval(
            callback,
            this._context.rules.hillStateUpdateMs,
            true
        );
    }

    public setObjectiveTimerInterval(callback: () => void): void {
        this._context.runtime.scheduler.objectiveTimer = Timers.setInterval(
            callback,
            this._context.rules.worldIconTimerUpdateMs
        );
    }

    public setScoreTickInterval(callback: () => void): void {
        this._context.runtime.scheduler.scoreTick = Timers.setInterval(callback, this._context.rules.scoreTickMs);
    }

    public setWorldIconInterval(callback: () => void): void {
        this._context.runtime.scheduler.worldIcon = Timers.setInterval(
            callback,
            this._context.rules.worldIconTimerUpdateMs,
            true
        );
    }

    public setSpawnJobInterval(callback: () => void): void {
        this._context.runtime.scheduler.spawnJob = Timers.setInterval(
            callback,
            this._context.spawns.rules.spawnJobTickMs,
            true
        );
    }

    public setPostmatchEndTimeout(callback: () => void): void {
        this._context.runtime.scheduler.postmatchEnd = Timers.setTimeout(
            callback,
            this._context.rules.postmatchDelaySeconds * 1000
        );
    }
}
