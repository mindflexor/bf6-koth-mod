import { WORLD_IDS, type WorldIdsConfig } from '../config/world-ids.ts';
import { RULES } from '../config/rules.ts';
import { createRuntimeState, type RuntimeState } from './runtime-state.ts';
import { createSessionState, type SessionState } from './session-state.ts';

export interface KothPhaseModeContext {
    runtime: RuntimeState;
    session: SessionState;
    worldIds: WorldIdsConfig;
    rules: typeof RULES;
}

export function createKothPhaseModeContext(): KothPhaseModeContext {
    return {
        runtime: createRuntimeState(),
        session: createSessionState(),
        worldIds: WORLD_IDS,
        rules: RULES,
    };
}

