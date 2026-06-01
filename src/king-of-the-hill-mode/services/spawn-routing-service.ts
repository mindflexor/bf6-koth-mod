import type { KothPhaseModeContext } from '../state/mode-context.ts';
import { KernelSpawnRoutingBridge } from './koth-kernel.ts';

export class SpawnRoutingService {
    public constructor(private readonly _context: KothPhaseModeContext) {}

    public context(): KothPhaseModeContext {
        return this._context;
    }

    public processLiveRoutingTick(): void {
        if (this._context.rules.debug.parityDiagnostics) {
            this._context.session.spawnRouting.diagnostics.routingTicks += 1;
        }
        KernelSpawnRoutingBridge.processLiveRoutingTick();
    }

    public onPlayerDeployed(eventPlayer: mod.Player): Promise<void> {
        return KernelSpawnRoutingBridge.onPlayerDeployed(eventPlayer);
    }

    public onPlayerUndeploy(eventPlayer: mod.Player): Promise<void> {
        return KernelSpawnRoutingBridge.onPlayerUndeploy(eventPlayer);
    }
}


