import type { KothPhaseModeContext } from '../state/mode-context.ts';

export class AudioService {
    public constructor(private readonly _context: KothPhaseModeContext) {}

    public context(): KothPhaseModeContext {
        return this._context;
    }

    public playCountdownHeartbeat(_volume: number): void {
        // Audio remains kernel-owned until full audio extraction is completed.
    }

    public playCaptureTick(_team: mod.Team, _friendly: boolean): void {
        // Audio remains kernel-owned until full audio extraction is completed.
    }

    public playCaptureLoss(_team: mod.Team): void {
        // Audio remains kernel-owned until full audio extraction is completed.
    }

    public processEndgameSuspenseTick(): void {
        if (this._context.rules.debug.parityDiagnostics) {
            this._context.session.audio.diagnostics.endgameTicks += 1;
        }
    }
}

