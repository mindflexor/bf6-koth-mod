import type { KothPhaseModeContext } from '../state/mode-context.ts';
import { KernelKothModeHandlers } from './koth-kernel.ts';
import type { SpawnRoutingService } from './spawn-routing-service.ts';

export class PlayerService {
    private _spawnRoutingService?: SpawnRoutingService;

    public constructor(private readonly _context: KothPhaseModeContext) {}

    public context(): KothPhaseModeContext {
        return this._context;
    }

    public attachSpawnRoutingService(spawnRoutingService: SpawnRoutingService): void {
        this._spawnRoutingService = spawnRoutingService;
    }

    public onPlayerJoinGame(eventPlayer: mod.Player): void {
        KernelKothModeHandlers.OnPlayerJoinGame(eventPlayer);
    }

    public onPlayerLeaveGame(eventNumber: number): void {
        KernelKothModeHandlers.OnPlayerLeaveGame(eventNumber);
    }

    public onPlayerDeployed(eventPlayer: mod.Player): Promise<void> {
        if (this._spawnRoutingService) {
            return this._spawnRoutingService.onPlayerDeployed(eventPlayer);
        }
        return KernelKothModeHandlers.OnPlayerDeployed(eventPlayer);
    }

    public onPlayerUndeploy(eventPlayer: mod.Player): Promise<void> {
        if (this._spawnRoutingService) {
            return this._spawnRoutingService.onPlayerUndeploy(eventPlayer);
        }
        return KernelKothModeHandlers.OnPlayerUndeploy(eventPlayer);
    }

    public onPlayerInteract(eventPlayer: mod.Player, eventInteractPoint: mod.InteractPoint): void {
        KernelKothModeHandlers.OnPlayerInteract(eventPlayer, eventInteractPoint);
    }

    public onPlayerUIButtonEvent(
        eventPlayer: mod.Player,
        eventUIWidget: mod.UIWidget,
        eventUIButtonEvent: mod.UIButtonEvent
    ): void {
        KernelKothModeHandlers.OnPlayerUIButtonEvent(eventPlayer, eventUIWidget, eventUIButtonEvent);
    }
}


