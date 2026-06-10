import { createKothPhaseModeContext } from '../state/mode-context.ts';
import { AudioService } from './audio-service.ts';
import { CombatService } from './combat-service.ts';
import { GlobalTickService } from './global-tick-service.ts';
import {
    kernelGetKothGameStatus,
    registerKernelLiveTickServiceDelegates,
    setKernelKothLiveOverrideEnabled,
} from './koth-kernel.ts';
import { KothLiveModeHandlers } from '../live/services/koth-runtime.ts';
import { LifecycleService } from './lifecycle-service.ts';
import { ObjectiveService } from './objective-service.ts';
import { PlayerService } from './player-service.ts';
import { RestrictedAreaService } from './restricted-area-service.ts';
import { SchedulerService } from './scheduler-service.ts';
import { SpawnRoutingService } from './spawn-routing-service.ts';
import { UiService } from './ui-service.ts';

const ONGOING_GLOBAL_PARITY_CONTRACT = Object.freeze([
    'timer-driven main loop remains authoritative in modular kernel',
    'event callback stays lightweight',
    'handler dispatch order remains stable via facade mapping',
]);

class KothPhaseRuntimeFacade {
    private readonly _context = createKothPhaseModeContext();

    private readonly _audioService = new AudioService(this._context);
    private readonly _combatService = new CombatService(this._context);
    private readonly _globalTickService = new GlobalTickService(this._context);
    private readonly _lifecycleService = new LifecycleService(this._context);
    private readonly _objectiveService = new ObjectiveService(this._context);
    private readonly _playerService = new PlayerService(this._context);
    private readonly _restrictedAreaService = new RestrictedAreaService(this._context);
    private readonly _schedulerService = new SchedulerService(this._context);
    private readonly _spawnRoutingService = new SpawnRoutingService(this._context);
    private readonly _uiService = new UiService(this._context);
    private readonly _debugParityDiagnostics = this._context.rules.debug.parityDiagnostics;
    private _kothLiveStarted = false;

    private _trackDiag(counter: () => void): void {
        if (!this._debugParityDiagnostics) return;
        counter();
    }

    public constructor() {
        this._playerService.attachSpawnRoutingService(this._spawnRoutingService);

        registerKernelLiveTickServiceDelegates({
            combatLiveTick: () => this._combatService.processLiveTick(),
            objectiveFastLiveTick: () => undefined,
            objectiveSlowLiveTick: () => undefined,
            spawnRoutingLiveTick: () => undefined,
        });
    }

    public onGameModeStarted(): void {
        this._kothLiveStarted = false;
        this._lifecycleService.onGameModeStarted();
        KothLiveModeHandlers.OnKernelGameModeStarted();
    }

    public onGameModeEnding(): void {
        if (this._kothLiveStarted) {
            KothLiveModeHandlers.OnGameModeEnding();
            this._kothLiveStarted = false;
        }
        setKernelKothLiveOverrideEnabled(false);
        this._lifecycleService.onGameModeEnding();
    }

    public onOngoingGlobal(): void {
        void this._audioService;
        void this._schedulerService;
        void this._spawnRoutingService;
        void this._uiService;
        void ONGOING_GLOBAL_PARITY_CONTRACT;

        this._trackDiag(() => {
            this._context.session.lifecycle.diagnostics.liveTicks += 1;
        });
        this._globalTickService.onOngoingGlobal();
        this._startKothLiveRuntimeIfNeeded();
    }

    public onPlayerJoinGame(eventPlayer: mod.Player): void {
        this._playerService.onPlayerJoinGame(eventPlayer);
        if (this._kothLiveStarted) {
            KothLiveModeHandlers.OnPlayerJoinGame(eventPlayer);
        } else {
            KothLiveModeHandlers.OnKernelPlayerJoinGame(eventPlayer);
        }
    }

    public onPlayerLeaveGame(eventNumber: number): void {
        this._playerService.onPlayerLeaveGame(eventNumber);
        if (this._kothLiveStarted) {
            KothLiveModeHandlers.OnPlayerLeaveGame(eventNumber);
        } else {
            KothLiveModeHandlers.OnKernelPlayerLeaveGame(eventNumber);
        }
    }

    public onPlayerDeployed(eventPlayer: mod.Player): Promise<void> {
        if (this._ensureKothLiveRuntimeStartedForKernelLive()) {
            KothLiveModeHandlers.OnPlayerDeployed(eventPlayer);
            return Promise.resolve();
        }
        return this._playerService.onPlayerDeployed(eventPlayer);
    }

    public onPlayerUndeploy(eventPlayer: mod.Player): Promise<void> {
        if (this._ensureKothLiveRuntimeStartedForKernelLive()) {
            KothLiveModeHandlers.OnPlayerUndeploy(eventPlayer);
            return Promise.resolve();
        }
        return this._playerService.onPlayerUndeploy(eventPlayer);
    }

    public onPlayerInteract(eventPlayer: mod.Player, eventInteractPoint: mod.InteractPoint): void {
        this._playerService.onPlayerInteract(eventPlayer, eventInteractPoint);
    }

    public onPlayerUIButtonEvent(
        eventPlayer: mod.Player,
        eventUIWidget: mod.UIWidget,
        eventUIButtonEvent: mod.UIButtonEvent
    ): void {
        this._playerService.onPlayerUIButtonEvent(eventPlayer, eventUIWidget, eventUIButtonEvent);
    }

    public onPlayerEnterCapturePoint(eventPlayer: mod.Player, eventCapturePoint: mod.CapturePoint): void {
        this._objectiveService.onPlayerEnterCapturePoint(eventPlayer, eventCapturePoint);
    }

    public onPlayerExitCapturePoint(eventPlayer: mod.Player, eventCapturePoint: mod.CapturePoint): void {
        this._objectiveService.onPlayerExitCapturePoint(eventPlayer, eventCapturePoint);
    }

    public onOngoingCapturePoint(flag: mod.CapturePoint): void {
        this._objectiveService.onOngoingCapturePoint(flag);
    }

    public onCapturePointCaptured(flag: mod.CapturePoint): void {
        this._objectiveService.onCapturePointCaptured(flag);
    }

    public onCapturePointLost(flag: mod.CapturePoint): void {
        this._objectiveService.onCapturePointLost(flag);
    }

    public onCapturePointCapturing(flag: mod.CapturePoint): void {
        this._objectiveService.onCapturePointCapturing(flag);
    }

    public onPlayerDamaged(
        eventPlayer: mod.Player,
        eventOtherPlayer: mod.Player,
        eventDamageType: mod.DamageType,
        eventWeaponUnlock: mod.WeaponUnlock
    ): void {
        this._trackDiag(() => {
            this._context.session.combat.diagnostics.liveTicks += 1;
        });
        if (this._kothLiveStarted) return;
        this._combatService.onPlayerDamaged(eventPlayer, eventOtherPlayer, eventDamageType, eventWeaponUnlock);
    }

    public onMandown(eventPlayer: mod.Player, eventOtherPlayer: mod.Player): void {
        if (this._ensureKothLiveRuntimeStartedForKernelLive()) {
            KothLiveModeHandlers.OnMandown(eventPlayer);
            return;
        }
        this._combatService.onMandown(eventPlayer, eventOtherPlayer);
    }

    public onPlayerRevived(eventPlayer: mod.Player, eventOtherPlayer: mod.Player): void {
        if (this._ensureKothLiveRuntimeStartedForKernelLive()) {
            KothLiveModeHandlers.OnRevived(eventPlayer, eventOtherPlayer);
        }
    }

    public onPlayerEarnedKill(
        eventPlayer: mod.Player,
        eventOtherPlayer: mod.Player,
        eventDeathType: mod.DeathType,
        eventWeaponUnlock: mod.WeaponUnlock
    ): void {
        if (this._ensureKothLiveRuntimeStartedForKernelLive()) {
            KothLiveModeHandlers.OnPlayerEarnedKill(eventPlayer, eventOtherPlayer);
            return;
        }
        this._combatService.onPlayerEarnedKill(eventPlayer, eventOtherPlayer, eventDeathType, eventWeaponUnlock);
    }

    public onPlayerEarnedKillAssist(eventPlayer: mod.Player, eventOtherPlayer: mod.Player): void {
        if (this._ensureKothLiveRuntimeStartedForKernelLive()) {
            KothLiveModeHandlers.OnPlayerEarnedKillAssist(eventPlayer);
            return;
        }
        this._combatService.onPlayerEarnedKillAssist(eventPlayer, eventOtherPlayer);
    }

    public onPlayerEnterAreaTrigger(eventPlayer: mod.Player, eventAreaTrigger: mod.AreaTrigger): void {
        this._restrictedAreaService.onPlayerEnterAreaTrigger(eventPlayer, eventAreaTrigger);
        if (this._ensureKothLiveRuntimeStartedForKernelLive()) {
            KothLiveModeHandlers.OnPlayerEnterAreaTrigger(eventPlayer, eventAreaTrigger);
        }
    }

    public onPlayerExitAreaTrigger(eventPlayer: mod.Player, eventAreaTrigger: mod.AreaTrigger): void {
        this._restrictedAreaService.onPlayerExitAreaTrigger(eventPlayer, eventAreaTrigger);
        if (this._ensureKothLiveRuntimeStartedForKernelLive()) {
            KothLiveModeHandlers.OnPlayerExitAreaTrigger(eventPlayer, eventAreaTrigger);
        }
    }

    public onPlayerDied(eventPlayer: mod.Player): void {
        if (this._ensureKothLiveRuntimeStartedForKernelLive()) KothLiveModeHandlers.OnPlayerDied(eventPlayer);
    }

    private _ensureKothLiveRuntimeStartedForKernelLive(): boolean {
        if (!this._kothLiveStarted && kernelGetKothGameStatus() === 3) {
            this._startKothLiveRuntimeIfNeeded();
        }

        return this._kothLiveStarted;
    }

    private _startKothLiveRuntimeIfNeeded(): void {
        if (this._kothLiveStarted) return;
        if (kernelGetKothGameStatus() !== 3) return;

        this._kothLiveStarted = true;
        setKernelKothLiveOverrideEnabled(true);
        KothLiveModeHandlers.OnGameModeStarted();
    }
}

const phaseFacade = new KothPhaseRuntimeFacade();

export const KothPhaseModeHandlers = {
    OnGameModeStarted: (): void => phaseFacade.onGameModeStarted(),
    OnGameModeEnding: (): void => phaseFacade.onGameModeEnding(),
    OngoingGlobal: (): void => phaseFacade.onOngoingGlobal(),
    OnPlayerJoinGame: (eventPlayer: mod.Player): void => phaseFacade.onPlayerJoinGame(eventPlayer),
    OnPlayerLeaveGame: (eventNumber: number): void => phaseFacade.onPlayerLeaveGame(eventNumber),
    OnPlayerDeployed: (eventPlayer: mod.Player): Promise<void> => phaseFacade.onPlayerDeployed(eventPlayer),
    OnPlayerUndeploy: (eventPlayer: mod.Player): Promise<void> => phaseFacade.onPlayerUndeploy(eventPlayer),
    OnPlayerInteract: (eventPlayer: mod.Player, eventInteractPoint: mod.InteractPoint): void =>
        phaseFacade.onPlayerInteract(eventPlayer, eventInteractPoint),
    OnPlayerUIButtonEvent: (
        eventPlayer: mod.Player,
        eventUIWidget: mod.UIWidget,
        eventUIButtonEvent: mod.UIButtonEvent
    ): void => phaseFacade.onPlayerUIButtonEvent(eventPlayer, eventUIWidget, eventUIButtonEvent),
    OnPlayerDamaged: (
        eventPlayer: mod.Player,
        eventOtherPlayer: mod.Player,
        eventDamageType: mod.DamageType,
        eventWeaponUnlock: mod.WeaponUnlock
    ): void => phaseFacade.onPlayerDamaged(eventPlayer, eventOtherPlayer, eventDamageType, eventWeaponUnlock),
    OnMandown: (eventPlayer: mod.Player, eventOtherPlayer: mod.Player): void =>
        phaseFacade.onMandown(eventPlayer, eventOtherPlayer),
    OnRevived: (eventPlayer: mod.Player, eventOtherPlayer: mod.Player): void =>
        phaseFacade.onPlayerRevived(eventPlayer, eventOtherPlayer),
    OnPlayerDied: (eventPlayer: mod.Player): void => phaseFacade.onPlayerDied(eventPlayer),
    OnPlayerEarnedKill: (
        eventPlayer: mod.Player,
        eventOtherPlayer: mod.Player,
        eventDeathType: mod.DeathType,
        eventWeaponUnlock: mod.WeaponUnlock
    ): void => phaseFacade.onPlayerEarnedKill(eventPlayer, eventOtherPlayer, eventDeathType, eventWeaponUnlock),
    OnPlayerEarnedKillAssist: (eventPlayer: mod.Player, eventOtherPlayer: mod.Player): void =>
        phaseFacade.onPlayerEarnedKillAssist(eventPlayer, eventOtherPlayer),
    OnPlayerEnterAreaTrigger: (eventPlayer: mod.Player, eventAreaTrigger: mod.AreaTrigger): void =>
        phaseFacade.onPlayerEnterAreaTrigger(eventPlayer, eventAreaTrigger),
    OnPlayerExitAreaTrigger: (eventPlayer: mod.Player, eventAreaTrigger: mod.AreaTrigger): void =>
        phaseFacade.onPlayerExitAreaTrigger(eventPlayer, eventAreaTrigger),
};



