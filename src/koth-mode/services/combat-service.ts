import type { KothPhaseModeContext } from '../state/mode-context.ts';
import { KernelCombatBridge } from './koth-kernel.ts';

export class CombatService {
    public constructor(private readonly _context: KothPhaseModeContext) {}

    public context(): KothPhaseModeContext {
        return this._context;
    }

    public onPlayerDamaged(
        eventPlayer: mod.Player,
        eventOtherPlayer: mod.Player,
        eventDamageType: mod.DamageType,
        eventWeaponUnlock: mod.WeaponUnlock
    ): void {
        KernelCombatBridge.onPlayerDamaged(eventPlayer, eventOtherPlayer, eventDamageType, eventWeaponUnlock);
    }

    public onMandown(eventPlayer: mod.Player, eventOtherPlayer: mod.Player): void {
        KernelCombatBridge.onMandown(eventPlayer, eventOtherPlayer);
    }

    public onPlayerEarnedKill(
        eventPlayer: mod.Player,
        eventOtherPlayer: mod.Player,
        eventDeathType: mod.DeathType,
        eventWeaponUnlock: mod.WeaponUnlock
    ): void {
        KernelCombatBridge.onPlayerEarnedKill(eventPlayer, eventOtherPlayer, eventDeathType, eventWeaponUnlock);
    }

    public onPlayerEarnedKillAssist(eventPlayer: mod.Player, eventOtherPlayer: mod.Player): void {
        KernelCombatBridge.onPlayerEarnedKillAssist(eventPlayer, eventOtherPlayer);
    }

    public processLiveTick(): void {
        if (this._context.rules.debug.parityDiagnostics) {
            this._context.session.combat.diagnostics.liveTicks += 1;
        }
        KernelCombatBridge.processLiveTick();
    }
}


