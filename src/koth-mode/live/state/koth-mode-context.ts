import { KOTH_HILLS } from '../config/koth-hills.ts';
import { KOTH_RULES } from '../config/koth-rules.ts';
import { KOTH_SPAWNS } from '../config/koth-spawns.ts';
import type { OptionalObserverController } from '../../../contracts/observer-controller.ts';
import { createKothRuntimeState, type KothRuntimeState } from './koth-runtime-state.ts';

export interface KothLiveModeContext {
    runtime: KothRuntimeState;
    hills: typeof KOTH_HILLS;
    rules: typeof KOTH_RULES;
    spawns: typeof KOTH_SPAWNS;
    spectatorController?: OptionalObserverController;
}

export function createKothLiveModeContext(): KothLiveModeContext {
    return {
        runtime: createKothRuntimeState(),
        hills: KOTH_HILLS,
        rules: KOTH_RULES,
        spawns: KOTH_SPAWNS,
    };
}
