import type { ModeContext } from '../state/mode-context.ts';

export class GlobalTickService {
    public constructor(private readonly _context: ModeContext) {}

    public onTick(): void {
        this._context.runtime.serverTickCount += 1;
        this._context.runtime.phaseTickCount += 1;
    }
}
