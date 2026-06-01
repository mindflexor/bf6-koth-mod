import { Timers } from 'bf6-portal-utils/timers/index.ts';

import type { ModeContext } from '../state/mode-context.ts';

export class SchedulerService {
    public constructor(private readonly _context: ModeContext) {}

    public clearAll(): void {
        const scheduler = this._context.runtime.scheduler;
        const handles = [
            scheduler.disabledMcomEnforce,
            scheduler.phaseSecond,
            scheduler.liveFast,
            scheduler.liveSlow,
            scheduler.endgameAudio,
            scheduler.damageZonePulse,
            scheduler.iconFollow,
            scheduler.holdUi,
            scheduler.noFireEnforce,
        ];

        for (const handle of handles) {
            Timers.clearInterval(handle);
        }

        this._context.runtime.scheduler = {};
    }
}
