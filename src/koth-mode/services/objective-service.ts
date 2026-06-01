import type { KothPhaseModeContext } from '../state/mode-context.ts';
import { KernelObjectiveBridge } from './koth-kernel.ts';

export class ObjectiveService {
    public constructor(private readonly _context: KothPhaseModeContext) {}

    public context(): KothPhaseModeContext {
        return this._context;
    }

    public onPlayerEnterCapturePoint(eventPlayer: mod.Player, eventCapturePoint: mod.CapturePoint): void {
        KernelObjectiveBridge.onPlayerEnterCapturePoint(eventPlayer, eventCapturePoint);
    }

    public onPlayerExitCapturePoint(eventPlayer: mod.Player, eventCapturePoint: mod.CapturePoint): void {
        KernelObjectiveBridge.onPlayerExitCapturePoint(eventPlayer, eventCapturePoint);
    }

    public onOngoingCapturePoint(eventCapturePoint: mod.CapturePoint): void {
        KernelObjectiveBridge.onOngoingCapturePoint(eventCapturePoint);
    }

    public onCapturePointCaptured(flag: mod.CapturePoint): void {
        KernelObjectiveBridge.onCapturePointCaptured(flag);
    }

    public onCapturePointLost(flag: mod.CapturePoint): void {
        KernelObjectiveBridge.onCapturePointLost(flag);
    }

    public onCapturePointCapturing(flag: mod.CapturePoint): void {
        KernelObjectiveBridge.onCapturePointCapturing(flag);
    }

    public processLiveFastTick(): void {
        if (this._context.rules.debug.parityDiagnostics) {
            this._context.session.ui.diagnostics.fastLaneTicks += 1;
        }
        KernelObjectiveBridge.processLiveFastTick();
    }

    public processLiveSlowTick(): void {
        if (this._context.rules.debug.parityDiagnostics) {
            this._context.session.ui.diagnostics.slowLaneTicks += 1;
        }
        KernelObjectiveBridge.processLiveSlowTick();
    }
}


