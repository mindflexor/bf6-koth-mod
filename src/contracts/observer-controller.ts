export interface OptionalObserverController {
    isSpectator(player: mod.Player): boolean;
    isSpectatorId(playerId: number): boolean;
    destroy(): void;
}
