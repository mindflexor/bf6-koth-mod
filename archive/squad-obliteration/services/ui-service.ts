import type { ModeContext } from '../state/mode-context.ts';

export class UiService {
    public constructor(private readonly _context: ModeContext) {}

    public context(): ModeContext {
        return this._context;
    }
}
