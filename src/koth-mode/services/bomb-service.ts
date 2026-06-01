import type { KothPhaseModeContext } from '../state/mode-context.ts';

export class BombService {
    public constructor(private readonly _context: KothPhaseModeContext) {}

    public context(): KothPhaseModeContext {
        return this._context;
    }
}

