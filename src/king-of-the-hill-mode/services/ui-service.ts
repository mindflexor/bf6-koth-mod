import type { KothPhaseModeContext } from '../state/mode-context.ts';

export class UiService {
    public constructor(private readonly _context: KothPhaseModeContext) {}

    public context(): KothPhaseModeContext {
        return this._context;
    }

    public setPrematchVisible(_visible: boolean): void {
        // Visibility remains kernel-owned until full UI extraction is completed.
    }

    public setLiveVisible(_visible: boolean): void {
        // Visibility remains kernel-owned until full UI extraction is completed.
    }

    public setPostmatchVisible(_visible: boolean): void {
        // Visibility remains kernel-owned until full UI extraction is completed.
    }

    public updateScoreboardAndHud(): void {
        // HUD/scoreboard updates remain kernel-owned until full UI extraction is completed.
    }
}

