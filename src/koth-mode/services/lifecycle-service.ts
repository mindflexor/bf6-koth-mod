import type { KothPhaseModeContext } from '../state/mode-context.ts';
import { KernelKothModeHandlers } from './koth-kernel.ts';

export class LifecycleService {
    public constructor(private readonly _context: KothPhaseModeContext) {}

    public context(): KothPhaseModeContext {
        return this._context;
    }

    public onGameModeStarted(): void {
        KernelKothModeHandlers.OnGameModeStarted();
    }

    public onGameModeEnding(): void {
        KernelKothModeHandlers.OnGameModeEnding();
    }

    public processPrematchTick(): void {
        if (this._context.rules.debug.parityDiagnostics) {
            this._context.session.lifecycle.diagnostics.prematchTicks += 1;
        }
    }

    public processCountdownTick(): void {
        if (this._context.rules.debug.parityDiagnostics) {
            this._context.session.lifecycle.diagnostics.countdownTicks += 1;
        }
    }

    public processPreliveTick(): void {
        if (this._context.rules.debug.parityDiagnostics) {
            this._context.session.lifecycle.diagnostics.preliveTicks += 1;
        }
    }

    public processPostmatchTick(): void {
        if (this._context.rules.debug.parityDiagnostics) {
            this._context.session.lifecycle.diagnostics.postmatchTicks += 1;
        }
    }
}

