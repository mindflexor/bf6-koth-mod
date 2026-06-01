import type { KothPhaseModeContext } from '../state/mode-context.ts';
import { KernelKothModeHandlers } from './koth-kernel.ts';

export class RestrictedAreaService {
    public constructor(private readonly _context: KothPhaseModeContext) {}

    public context(): KothPhaseModeContext {
        return this._context;
    }

    public onPlayerEnterAreaTrigger(eventPlayer: mod.Player, eventAreaTrigger: mod.AreaTrigger): void {
        KernelKothModeHandlers.OnPlayerEnterAreaTrigger(eventPlayer, eventAreaTrigger);
    }

    public onPlayerExitAreaTrigger(eventPlayer: mod.Player, eventAreaTrigger: mod.AreaTrigger): void {
        KernelKothModeHandlers.OnPlayerExitAreaTrigger(eventPlayer, eventAreaTrigger);
    }

    public processDamagePulseTick(): void {
        // The authoritative damage pulse remains in the kernel live loop for parity.
    }
}

