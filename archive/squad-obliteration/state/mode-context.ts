import { WORLD_IDS, type WorldIdsConfig } from '../config/world-ids.ts';
import { RULES } from '../config/rules.ts';
import { createRuntimeState, type RuntimeState } from './runtime-state.ts';

export interface ModeContext {
    runtime: RuntimeState;
    worldIds: WorldIdsConfig;
    rules: typeof RULES;
}

export function createModeContext(): ModeContext {
    return {
        runtime: createRuntimeState(),
        worldIds: WORLD_IDS,
        rules: RULES,
    };
}
