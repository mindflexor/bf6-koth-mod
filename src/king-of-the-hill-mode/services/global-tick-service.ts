import type { KothPhaseModeContext } from '../state/mode-context.ts';
import { KernelKothModeHandlers } from './koth-kernel.ts';

export class GlobalTickService {
    public constructor(private readonly _context: KothPhaseModeContext) {}

    public onTick(): void {
        this._context.runtime.serverTickCount += 1;
        this._context.runtime.phaseTickCount += 1;
    }

    public onOngoingGlobal(): void {
        KernelKothModeHandlers.OngoingGlobal();
    }
}


