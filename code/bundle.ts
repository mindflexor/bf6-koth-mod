// --- BUNDLED TYPESCRIPT OUTPUT ---
// @ts-nocheck

// --- SOURCE: node_modules\bf6-portal-utils\logging\index.ts ---
// version: 1.0.2
export class Logging {
    constructor(tag: string) {
        this._tag = tag;
    }

    private _tag: string;

    private _logLevel: Logging.LogLevel = Logging.LogLevel.Info;

    private _includeError: boolean = false;

    private _logger?: (text: string) => Promise<void> | void;

    /**
     * Safely converts an error of unknown type to a string.
     * This method cannot throw - it will always return a string.
     * @param error - The error to convert to a string.
     * @returns The error as a string.
     */
    private _safeErrorToString(error: unknown): string {
        try {
            if (error instanceof Error) {
                // Try to get the message, but handle cases where .message might throw.
                try {
                    return error.message || 'Error';
                } catch {
                    return 'Error (message unavailable)';
                }
            }
            // Try `String()` conversion, but handle cases where `toString()` might throw.
            try {
                return String(error);
            } catch {
                return '[Error object]';
            }
        } catch {
            // Ultimate fallback - this should never happen, but ensures we always return a string.
            return '[Unable to stringify error]';
        }
    }

    /**
     * Checks if a message with the given log level would actually be logged.
     * Use this to avoid building expensive log messages when logging is disabled or below the threshold.
     * @param logLevel - The log level to check.
     * @returns True if logging will occur, false otherwise.
     */
    public willLog(logLevel: Logging.LogLevel): boolean {
        return this._logger !== undefined && logLevel >= this._logLevel;
    }

    public log(text: string, logLevel: Logging.LogLevel = Logging.LogLevel.Warning, error?: unknown): void {
        if (!this._logger || logLevel < this._logLevel) return;

        try {
            const errorText = this._includeError && error ? ` - Error: ${this._safeErrorToString(error)}` : '';
            const result = this._logger(`<${this._tag}> ${text}${errorText}`);

            if (result instanceof Promise) {
                result.catch((error) => {
                    // Catch and log async logger errors to prevent unhandled promise rejections.
                    console.log(`<${this._tag}> Error in async logger:`, error);
                });
            }
        } catch (error: unknown) {
            // Catch and log sync logger errors so the logging functionality can still run.
            console.log(`<${this._tag}> Error in sync logger:`, error);
        }
    }

    /**
     * Attaches a logger and defines a minimum log level and whether to include the runtime error in the log.
     * @param log - The logger function to use. Pass undefined to disable logging.
     * @param logLevel - The minimum log level to use.
     * @param includeError - Whether to attempt to include the runtime error, if any, as a string in the log.
     */
    public setLogging(
        log?: (text: string) => Promise<void> | void,
        logLevel?: Logging.LogLevel,
        includeError?: boolean
    ): void {
        this._logger = log;
        this._logLevel = logLevel ?? Logging.LogLevel.Warning;
        this._includeError = includeError ?? false;
    }
}

export namespace Logging {
    /**
     * The log levels.
     */
    export enum LogLevel {
        Debug = 0,
        Info = 1,
        Warning = 2,
        Error = 3,
    }
}


// --- SOURCE: node_modules\bf6-portal-utils\callback-handler\index.ts ---


// version: 1.0.0
export namespace CallbackHandler {
    /**
     * Safely invokes a callback that may be sync or async, catching and logging errors.
     * @param callback - The callback to invoke (may be undefined).
     * @param args - Arguments to pass to the callback.
     * @param errorContext - Context for error messages.
     * @param logging - Logging instance to use for error reporting.
     * @param logLevel - Log level for error messages.
     */
    export function invoke<T extends (...args: any[]) => Promise<void> | void>(
        callback: T | undefined,
        args: Parameters<T>,
        errorContext: string,
        logging: Logging,
        logLevel: Logging.LogLevel = Logging.LogLevel.Error
    ): void {
        if (!callback) return;

        try {
            const result = callback(...args);

            if (result instanceof Promise) {
                result.catch((error: unknown) => {
                    // Catch and log async errors to prevent unhandled promise rejections.
                    logging.log(
                        `Error in async ${errorContext} ${callback.name ?? 'anonymous'} callback:`,
                        logLevel,
                        error
                    );
                });
            }
        } catch (error: unknown) {
            // Catch and log sync errors so the invoking code can still run.
            logging.log(`Error in sync ${errorContext} ${callback?.name ?? 'anonymous'} callback:`, logLevel, error);
        }
    }

    /**
     * Safely invokes a callback with no arguments that may be sync or async, catching and logging errors.
     * @param callback - The callback to invoke (may be undefined).
     * @param errorContext - Context for error messages.
     * @param logging - Logging instance to use for error reporting.
     * @param logLevel - Log level for error messages.
     */
    export function invokeNoArgs(
        callback: (() => Promise<void> | void) | undefined,
        errorContext: string,
        logging: Logging,
        logLevel: Logging.LogLevel = Logging.LogLevel.Error
    ): void {
        invoke(callback, [], errorContext, logging, logLevel);
    }
}


// --- SOURCE: node_modules\bf6-portal-utils\events\index.ts ---



// version: 1.4.0
namespace EventsTypes {
    /**
     * Map of each event name to its trigger function. Use for typed references to event payloads
     * (e.g. `Parameters<typeof Events.Type.OnPlayerDied>`) or dynamic dispatch. Prefer the channel API
     * (`Events.OnPlayerDied.subscribe(handler)`) for subscribe/trigger with full IntelliSense.
     */
    export const Type = {
        OngoingGlobal,
        OngoingAreaTrigger,
        OngoingCapturePoint,
        OngoingEmplacementSpawner,
        OngoingHQ,
        OngoingInteractPoint,
        OngoingLootSpawner,
        OngoingMCOM,
        OngoingPlayer,
        OngoingRingOfFire,
        OngoingSector,
        OngoingSpawner,
        OngoingSpawnPoint,
        OngoingTeam,
        OngoingVehicle,
        OngoingVehicleSpawner,
        OngoingWaypointPath,
        OngoingWorldIcon,
        OnAIMoveToFailed,
        OnAIMoveToRunning,
        OnAIMoveToSucceeded,
        OnAIParachuteRunning,
        OnAIParachuteSucceeded,
        OnAIWaypointIdleFailed,
        OnAIWaypointIdleRunning,
        OnAIWaypointIdleSucceeded,
        OnCapturePointCaptured,
        OnCapturePointCapturing,
        OnCapturePointLost,
        OnGameModeEnding,
        OnGameModeStarted,
        OnMandown,
        OnMCOMArmed,
        OnMCOMDefused,
        OnMCOMDestroyed,
        OnPlayerDamaged,
        OnPlayerDeployed,
        OnPlayerDied,
        OnPlayerEarnedKill,
        OnPlayerEarnedKillAssist,
        OnPlayerEnterAreaTrigger,
        OnPlayerEnterCapturePoint,
        OnPlayerEnterVehicle,
        OnPlayerEnterVehicleSeat,
        OnPlayerExitAreaTrigger,
        OnPlayerExitCapturePoint,
        OnPlayerExitVehicle,
        OnPlayerExitVehicleSeat,
        OnPlayerInteract,
        OnPlayerJoinGame,
        OnPlayerLeaveGame,
        OnPlayerSwitchTeam,
        OnPlayerUIButtonEvent,
        OnPlayerUndeploy,
        OnRayCastHit,
        OnRayCastMissed,
        OnRevived,
        OnRingOfFireZoneSizeChange,
        OnSpawnerSpawned,
        OnTimeLimitReached,
        OnVehicleDestroyed,
        OnVehicleSpawned,
    } as const;

    /**
     * Extract parameters from a function type.
     */
    export type Parameters<T> = T extends (...args: infer P) => void ? P : never;

    /**
     * Trigger function types (single source of truth); same shape as Events.Type.
     */
    export type Signature = typeof Type;

    /**
     * One of the trigger function names (a key from Events.Type).
     */
    export type SignatureKey = keyof Signature;

    /**
     * One of the trigger functions (a value from Events.Type).
     */
    export type TypeValue = Signature[SignatureKey];

    /**
     * Typed channel for a single event. Each event (e.g. `Events.OngoingInteractPoint`, `Events.OnPlayerDied`)
     * exposes this interface with `subscribe`, `unsubscribe`, and `trigger` typed to that event's payload.
     * @template K - Event name; handler and trigger args are inferred from the corresponding trigger function.
     */
    export type EventChannel<K extends SignatureKey> = {
        /**
         * Subscribe a handler for this event. The handler receives the same arguments as this event's trigger.
         * @param handler - Callback invoked when the event is triggered; args match the event's payload.
         * @returns Function to call to unsubscribe this handler.
         */
        subscribe(handler: (...args: Parameters<Signature[K]>) => void | Promise<void>): () => void;

        /**
         * Unsubscribe a handler previously added with `subscribe`. Pass the same function reference.
         * @param handler - The same function reference that was passed to `subscribe`.
         */
        unsubscribe(handler: (...args: Parameters<Signature[K]>) => void | Promise<void>): void;

        /**
         * Trigger this event. Pass the same arguments as the exported trigger function for this event.
         * @param args - Event payload; types match the corresponding standalone trigger function (e.g. `OnPlayerDied`).
         */
        trigger(...args: Parameters<Signature[K]>): void;

        /**
         * Return the number of handlers currently subscribed to this event.
         * @returns Count of subscribed handlers (0 if none).
         */
        handlerCount(): number;
    };

    /**
     * Map of each event name to its typed channel (`subscribe`, `unsubscribe`, `trigger`, `handlerCount`).
     * Merged onto the Events namespace so you get e.g. `Events.OngoingInteractPoint.subscribe(handler)`.
     */
    export type EventChannelsMap = {
        [K in SignatureKey]: K extends SignatureKey ? EventChannel<K> : never;
    };

    // Get the event key (name) from a trigger function value.
    type EventTypeName<T extends TypeValue> = {
        [K in SignatureKey]: Signature[K] extends T ? K : never;
    }[SignatureKey];

    /**
     * Get the handler function type for a specific event type.
     * Handlers can be synchronous or asynchronous (returning void or Promise<void>).
     */
    export type HandlerForType<T extends TypeValue> =
        EventTypeName<T> extends SignatureKey
            ? Signature[EventTypeName<T>] extends (...args: infer P) => void
                ? (...args: P) => void | Promise<void>
                : never
            : never;

    /**
     * Get the parameter tuple for a specific event type.
     */
    export type EventParameters<T extends TypeValue> =
        EventTypeName<T> extends SignatureKey ? Parameters<Signature[EventTypeName<T>]> : never;

    /**
     * Create a union of all possible handler types.
     * Handlers can be synchronous or asynchronous (returning void or Promise<void>).
     */
    export type AllHandlers = {
        [K in SignatureKey]: Signature[K] extends (...args: infer P) => void
            ? (...args: P) => void | Promise<void>
            : never;
    }[SignatureKey];
}

class EventsImplementation {
    private static readonly _logging = new Logging('Events');

    private static readonly _handlers = new Map<EventsTypes.TypeValue, Set<EventsTypes.AllHandlers>>();

    /**
     * The event types.
     */
    public static readonly Type = EventsTypes.Type;

    /**
     * The logging levels.
     */
    public static readonly LogLevel = Logging.LogLevel;

    static {
        /** Build per-event channel objects so users can call Events.OngoingInteractPoint.subscribe(handler), etc. */
        const typeKeys = Object.keys(EventsTypes.Type) as EventsTypes.SignatureKey[];

        for (const key of typeKeys) {
            const typeValue = EventsTypes.Type[key];

            (
                EventsImplementation as unknown as Record<
                    EventsTypes.SignatureKey,
                    EventsTypes.EventChannel<EventsTypes.SignatureKey>
                >
            )[key] = {
                subscribe(handler: EventsTypes.AllHandlers): () => void {
                    return EventsImplementation.subscribe(
                        typeValue,
                        handler as EventsTypes.HandlerForType<typeof typeValue>
                    );
                },
                unsubscribe(handler: EventsTypes.AllHandlers): void {
                    EventsImplementation.unsubscribe(
                        typeValue,
                        handler as EventsTypes.HandlerForType<typeof typeValue>
                    );
                },
                trigger(...args: Parameters<EventsTypes.AllHandlers>): void {
                    EventsImplementation.trigger(typeValue, ...(args as EventsTypes.EventParameters<typeof typeValue>));
                },
                handlerCount(): number {
                    return EventsImplementation.handlerCount(typeValue);
                },
            };
        }
    }

    private constructor() {}

    /**
     * Attaches a logger and defines a minimum log level and whether to include the runtime error in the log.
     * @param log - The logger function to use. Pass undefined to disable logging.
     * @param logLevel - The minimum log level to use.
     * @param includeError - Whether to include the runtime error in the log.
     */
    public static setLogging(
        log?: (text: string) => Promise<void> | void,
        logLevel?: Logging.LogLevel,
        includeError?: boolean
    ): void {
        this._logging.setLogging(log, logLevel, includeError);
    }

    /**
     * Subscribe to an event.
     * @param type - The event type to subscribe to.
     * @param handler - The handler function to call when the event is triggered.
     * @returns A function to unsubscribe from the event.
     */
    public static subscribe<T extends EventsTypes.TypeValue>(
        type: T,
        handler: EventsTypes.HandlerForType<T>
    ): () => void {
        if (!this._handlers.has(type)) {
            this._handlers.set(type, new Set());
        }

        this._handlers.get(type)!.add(handler as EventsTypes.AllHandlers);

        return () => this.unsubscribe(type, handler);
    }

    /**
     * Unsubscribe from an event.
     * @param type - The event type to unsubscribe from.
     * @param handler - The handler function that was subscribed.
     */
    public static unsubscribe<T extends EventsTypes.TypeValue>(type: T, handler: EventsTypes.HandlerForType<T>): void {
        this._handlers.get(type)?.delete(handler as EventsTypes.AllHandlers);
    }

    /**
     * Triggers an event.
     * @param type - The event type to trigger.
     * @param args - The arguments to pass to the handler function.
     */
    public static trigger<T extends EventsTypes.TypeValue>(type: T, ...args: EventsTypes.EventParameters<T>): void {
        const typeHandlers = this._handlers.get(type);

        if (!typeHandlers) return;

        const typeName = (type as { name?: string }).name ?? 'unknown';

        // Execute each handler asynchronously and non-blocking.
        // Errors in one handler won't prevent other handlers from executing.
        for (const handler of typeHandlers) {
            CallbackHandler.invoke(handler, args, typeName, this._logging, Logging.LogLevel.Error);
        }
    }

    /**
     * Return the number of handlers currently subscribed to an event.
     * @param type - The event type to query.
     * @returns Count of subscribed handlers (0 if none).
     */
    public static handlerCount<T extends EventsTypes.TypeValue>(type: T): number {
        return this._handlers.get(type)?.size ?? 0;
    }
}

export const Events = EventsImplementation as typeof EventsImplementation & EventsTypes.EventChannelsMap;

/* eslint-disable jsdoc/require-jsdoc */
export function OngoingGlobal(): void {
    Events.OngoingGlobal.trigger();
}

export function OngoingAreaTrigger(areaTrigger: mod.AreaTrigger): void {
    Events.OngoingAreaTrigger.trigger(areaTrigger);
}

export function OngoingCapturePoint(capturePoint: mod.CapturePoint): void {
    Events.OngoingCapturePoint.trigger(capturePoint);
}

export function OngoingEmplacementSpawner(emplacementSpawner: mod.EmplacementSpawner): void {
    Events.OngoingEmplacementSpawner.trigger(emplacementSpawner);
}

export function OngoingHQ(hq: mod.HQ): void {
    Events.OngoingHQ.trigger(hq);
}

export function OngoingInteractPoint(interactPoint: mod.InteractPoint): void {
    Events.OngoingInteractPoint.trigger(interactPoint);
}

export function OngoingLootSpawner(lootSpawner: mod.LootSpawner): void {
    Events.OngoingLootSpawner.trigger(lootSpawner);
}

export function OngoingMCOM(mcom: mod.MCOM): void {
    Events.OngoingMCOM.trigger(mcom);
}

export function OngoingPlayer(player: mod.Player): void {
    Events.OngoingPlayer.trigger(player);
}

export function OngoingRingOfFire(ringOfFire: mod.RingOfFire): void {
    Events.OngoingRingOfFire.trigger(ringOfFire);
}

export function OngoingSector(sector: mod.Sector): void {
    Events.OngoingSector.trigger(sector);
}

export function OngoingSpawner(spawner: mod.Spawner): void {
    Events.OngoingSpawner.trigger(spawner);
}

export function OngoingSpawnPoint(spawnPoint: mod.SpawnPoint): void {
    Events.OngoingSpawnPoint.trigger(spawnPoint);
}

export function OngoingTeam(team: mod.Team): void {
    Events.OngoingTeam.trigger(team);
}

export function OngoingVehicle(vehicle: mod.Vehicle): void {
    Events.OngoingVehicle.trigger(vehicle);
}

export function OngoingVehicleSpawner(vehicleSpawner: mod.VehicleSpawner): void {
    Events.OngoingVehicleSpawner.trigger(vehicleSpawner);
}

export function OngoingWaypointPath(waypointPath: mod.WaypointPath): void {
    Events.OngoingWaypointPath.trigger(waypointPath);
}

export function OngoingWorldIcon(worldIcon: mod.WorldIcon): void {
    Events.OngoingWorldIcon.trigger(worldIcon);
}

export function OnAIMoveToFailed(player: mod.Player): void {
    Events.OnAIMoveToFailed.trigger(player);
}

export function OnAIMoveToRunning(player: mod.Player): void {
    Events.OnAIMoveToRunning.trigger(player);
}

export function OnAIMoveToSucceeded(player: mod.Player): void {
    Events.OnAIMoveToSucceeded.trigger(player);
}

export function OnAIParachuteRunning(player: mod.Player): void {
    Events.OnAIParachuteRunning.trigger(player);
}

export function OnAIParachuteSucceeded(player: mod.Player): void {
    Events.OnAIParachuteSucceeded.trigger(player);
}

export function OnAIWaypointIdleFailed(player: mod.Player): void {
    Events.OnAIWaypointIdleFailed.trigger(player);
}

export function OnAIWaypointIdleRunning(player: mod.Player): void {
    Events.OnAIWaypointIdleRunning.trigger(player);
}

export function OnAIWaypointIdleSucceeded(player: mod.Player): void {
    Events.OnAIWaypointIdleSucceeded.trigger(player);
}

export function OnCapturePointCaptured(capturePoint: mod.CapturePoint): void {
    Events.OnCapturePointCaptured.trigger(capturePoint);
}

export function OnCapturePointCapturing(capturePoint: mod.CapturePoint): void {
    Events.OnCapturePointCapturing.trigger(capturePoint);
}

export function OnCapturePointLost(capturePoint: mod.CapturePoint): void {
    Events.OnCapturePointLost.trigger(capturePoint);
}

export function OnGameModeEnding(): void {
    Events.OnGameModeEnding.trigger();
}

export function OnGameModeStarted(): void {
    Events.OnGameModeStarted.trigger();
}

export function OnMandown(player: mod.Player, otherPlayer: mod.Player): void {
    Events.OnMandown.trigger(player, otherPlayer);
}

export function OnMCOMArmed(mcom: mod.MCOM): void {
    Events.OnMCOMArmed.trigger(mcom);
}

export function OnMCOMDefused(mcom: mod.MCOM): void {
    Events.OnMCOMDefused.trigger(mcom);
}

export function OnMCOMDestroyed(mcom: mod.MCOM): void {
    Events.OnMCOMDestroyed.trigger(mcom);
}

export function OnPlayerDamaged(
    damagedPlayer: mod.Player,
    damagingPlayer: mod.Player,
    damageType: mod.DamageType,
    weapon: mod.WeaponUnlock
): void {
    Events.OnPlayerDamaged.trigger(damagedPlayer, damagingPlayer, damageType, weapon);
}

export function OnPlayerDeployed(player: mod.Player): void {
    Events.OnPlayerDeployed.trigger(player);
}

export function OnPlayerDied(
    victim: mod.Player,
    killer: mod.Player,
    deathType: mod.DeathType,
    weapon: mod.WeaponUnlock
): void {
    Events.OnPlayerDied.trigger(victim, killer, deathType, weapon);
}

export function OnPlayerEarnedKill(
    killer: mod.Player,
    victim: mod.Player,
    deathType: mod.DeathType,
    weapon: mod.WeaponUnlock
): void {
    Events.OnPlayerEarnedKill.trigger(killer, victim, deathType, weapon);
}

export function OnPlayerEarnedKillAssist(assistingPlayer: mod.Player, victim: mod.Player): void {
    Events.OnPlayerEarnedKillAssist.trigger(assistingPlayer, victim);
}

export function OnPlayerEnterAreaTrigger(player: mod.Player, areaTrigger: mod.AreaTrigger): void {
    Events.OnPlayerEnterAreaTrigger.trigger(player, areaTrigger);
}

export function OnPlayerEnterCapturePoint(player: mod.Player, capturePoint: mod.CapturePoint): void {
    Events.OnPlayerEnterCapturePoint.trigger(player, capturePoint);
}

export function OnPlayerEnterVehicle(player: mod.Player, vehicle: mod.Vehicle): void {
    Events.OnPlayerEnterVehicle.trigger(player, vehicle);
}

export function OnPlayerEnterVehicleSeat(player: mod.Player, vehicle: mod.Vehicle, seat: mod.Object): void {
    Events.OnPlayerEnterVehicleSeat.trigger(player, vehicle, seat);
}

export function OnPlayerExitAreaTrigger(player: mod.Player, areaTrigger: mod.AreaTrigger): void {
    Events.OnPlayerExitAreaTrigger.trigger(player, areaTrigger);
}

export function OnPlayerExitCapturePoint(player: mod.Player, capturePoint: mod.CapturePoint): void {
    Events.OnPlayerExitCapturePoint.trigger(player, capturePoint);
}

export function OnPlayerExitVehicle(player: mod.Player, vehicle: mod.Vehicle): void {
    Events.OnPlayerExitVehicle.trigger(player, vehicle);
}

export function OnPlayerExitVehicleSeat(player: mod.Player, vehicle: mod.Vehicle, seat: mod.Object): void {
    Events.OnPlayerExitVehicleSeat.trigger(player, vehicle, seat);
}

export function OnPlayerInteract(player: mod.Player, interactPoint: mod.InteractPoint): void {
    Events.OnPlayerInteract.trigger(player, interactPoint);
}

export function OnPlayerJoinGame(player: mod.Player): void {
    Events.OnPlayerJoinGame.trigger(player);
}

export function OnPlayerLeaveGame(playerId: number): void {
    Events.OnPlayerLeaveGame.trigger(playerId);
}

export function OnPlayerSwitchTeam(player: mod.Player, team: mod.Team): void {
    Events.OnPlayerSwitchTeam.trigger(player, team);
}

export function OnPlayerUIButtonEvent(
    player: mod.Player,
    uiWidget: mod.UIWidget,
    uiButtonEvent: mod.UIButtonEvent
): void {
    Events.OnPlayerUIButtonEvent.trigger(player, uiWidget, uiButtonEvent);
}

export function OnPlayerUndeploy(player: mod.Player): void {
    Events.OnPlayerUndeploy.trigger(player);
}

export function OnRayCastHit(player: mod.Player, point: mod.Vector, normal: mod.Vector): void {
    Events.OnRayCastHit.trigger(player, point, normal);
}

export function OnRayCastMissed(player: mod.Player): void {
    Events.OnRayCastMissed.trigger(player);
}

export function OnRevived(revivedPlayer: mod.Player, revivingPlayer: mod.Player): void {
    Events.OnRevived.trigger(revivedPlayer, revivingPlayer);
}

export function OnRingOfFireZoneSizeChange(ringOfFire: mod.RingOfFire, number: number): void {
    Events.OnRingOfFireZoneSizeChange.trigger(ringOfFire, number);
}

export function OnSpawnerSpawned(player: mod.Player, spawner: mod.Spawner): void {
    Events.OnSpawnerSpawned.trigger(player, spawner);
}

export function OnTimeLimitReached(): void {
    if (!mod.GetMatchTimeElapsed()) return; // Avoids a bug where this event is triggered by the server prematurely.

    Events.OnTimeLimitReached.trigger();
}

export function OnVehicleDestroyed(vehicle: mod.Vehicle): void {
    Events.OnVehicleDestroyed.trigger(vehicle);
}

export function OnVehicleSpawned(vehicle: mod.Vehicle): void {
    Events.OnVehicleSpawned.trigger(vehicle);
}
/* eslint-enable jsdoc/require-jsdoc */


// --- SOURCE: src\king-of-the-hill-mode\config\world-ids.ts ---
﻿export interface WorldIdsConfig {
    hq: {
        team1Initial: number;
        team2Initial: number;
        team1Readyup: number;
        team2Readyup: number;
        team1Live: number;
        team2Live: number;
        team1RouteByKey: Record<'A' | 'B' | 'C' | 'AB' | 'AC' | 'BC' | 'ABC' | 'NO', number>;
        team2RouteByKey: Record<'A' | 'B' | 'C' | 'AB' | 'AC' | 'BC' | 'ABC' | 'NO', number>;
    };
    capturePoints: {
        a: number;
        b: number;
        c: number;
        d: number;
        e: number;
        f: number;
    };
    interactPoints: {
        team1Switch: number;
        team1Ready: number;
        team2Switch: number;
        team2Ready: number;
        objectiveByCapturePoint: Record<number, number>;
    };
    areaTriggers: {
        objectiveByCapturePoint: Record<number, number>;
        damage: number;
        restricted: number;
        team1HqProtection: number;
        team2HqProtection: number;
        prematchHealth: number;
        prematchTeam1Kill: number;
        prematchTeam2Kill: number;
    };
    worldIcons: {
        team1Switch: number;
        team1Ready: number;
        team2Switch: number;
        team2Ready: number;
    };
    fireVfxIds: number[];
    dynamicSpawnersByRoute: {
        team1: Record<'A' | 'B' | 'C' | 'AB' | 'AC' | 'BC' | 'ABC' | 'NO', number[]>;
        team2: Record<'A' | 'B' | 'C' | 'AB' | 'AC' | 'BC' | 'ABC' | 'NO', number[]>;
    };
}

const WORLD_CP_A_ID = 201;
const WORLD_CP_B_ID = 202;
const WORLD_CP_C_ID = 203;
const WORLD_CP_D_ID = 301;
const WORLD_CP_E_ID = 302;
const WORLD_CP_F_ID = 303;

export const WORLD_IDS: WorldIdsConfig = {
    hq: {
        team1Initial: 1,
        team2Initial: 2,
        team1Readyup: 8888,
        team2Readyup: 8889,
        team1Live: 3,
        team2Live: 4,
        team1RouteByKey: {
            A: 5,
            B: 6,
            C: 7,
            AB: 11,
            AC: 12,
            BC: 13,
            ABC: 17,
            NO: 19,
        },
        team2RouteByKey: {
            A: 8,
            B: 9,
            C: 10,
            AB: 14,
            AC: 15,
            BC: 16,
            ABC: 18,
            NO: 20,
        },
    },
    capturePoints: {
        a: WORLD_CP_A_ID,
        b: WORLD_CP_B_ID,
        c: WORLD_CP_C_ID,
        d: WORLD_CP_D_ID,
        e: WORLD_CP_E_ID,
        f: WORLD_CP_F_ID,
    },
    interactPoints: {
        team1Switch: 2001,
        team1Ready: 2002,
        team2Switch: 2003,
        team2Ready: 2004,
        objectiveByCapturePoint: {
            [WORLD_CP_A_ID]: 2101,
            [WORLD_CP_B_ID]: 2102,
            [WORLD_CP_C_ID]: 2103,
            [WORLD_CP_D_ID]: 2104,
            [WORLD_CP_E_ID]: 2105,
            [WORLD_CP_F_ID]: 2106,
        },
    },
    areaTriggers: {
        objectiveByCapturePoint: {
            [WORLD_CP_A_ID]: 401,
            [WORLD_CP_B_ID]: 402,
            [WORLD_CP_C_ID]: 403,
            [WORLD_CP_D_ID]: 501,
            [WORLD_CP_E_ID]: 502,
            [WORLD_CP_F_ID]: 503,
        },
        damage: 7001,
        restricted: 7002,
        team1HqProtection: 7101,
        team2HqProtection: 7102,
        prematchHealth: 889,
        prematchTeam1Kill: 679,
        prematchTeam2Kill: 680,
    },
    worldIcons: {
        team1Switch: 5001,
        team1Ready: 5002,
        team2Switch: 5003,
        team2Ready: 5004,
    },
    fireVfxIds: [
        331, 332, 333, 334, 335, 336, 337, 338, 339, 340, 341, 342, 343, 344, 345, 346, 347, 348, 349,
    ],
    dynamicSpawnersByRoute: {
        team1: {
            A: [9101],
            B: [9102],
            C: [9103],
            AB: [9104],
            AC: [9105],
            BC: [9106],
            ABC: [9107],
            NO: [9108],
        },
        team2: {
            A: [9201],
            B: [9202],
            C: [9203],
            AB: [9204],
            AC: [9205],
            BC: [9206],
            ABC: [9207],
            NO: [9208],
        },
    },
};


// --- SOURCE: src\king-of-the-hill-mode\config\rules.ts ---
﻿export const RULES = {
    tickRate: 30,
    roundTimeSeconds: 1200,
    countdownTimeSeconds: 5,
    preliveTimeSeconds: 15,
    postmatchTimeSeconds: 20,
    redeployTimeSeconds: 10,
    objectiveInteractHoldSeconds: 3,
    gameplay: {
        initialTickets: 200,
        deathTicketLoss: -1,
        bleedPerSecond: {
            oneFlag: -0.33,
            twoFlags: -0.5,
            threeFlags: -1,
        },
        capture: {
            captureSeconds: 6,
            neutralizeSeconds: 6,
            twoPlayerMultiplier: 2,
            maxMultiplier: 1.6,
            progressEpsilon: 0.02,
        },
        safeSpawn: {
            checkDelaySeconds: 0.1,
            radiusStartMeters: 25,
            radiusEndMeters: 8,
            maxForcedRedeploys: 5,
            radiusReachEndUsed: 4,
            capturePointThreatRadius: {
                referenceDistanceMeters: 120,
                referenceRadiusMeters: 26,
                minMeters: 12,
                maxMeters: 32,
            },
            liveRouteRefreshSeconds: 0.25,
            liveRouteSwitchMarginMeters: 10,
            squadSpawnDistanceMeters: 8,
            squadProbeWindowSeconds: 0.25,
            squadProbeIntervalSeconds: 0.05,
            squadBypassLifetimeSeconds: 1,
            hqDesyncEpsilonMeters: 0.5,
            hqDesyncMaxForcedRedeploys: 2,
            hqDesyncCheckEnabled: true,
            friendlySpawnBypassMeters: 8,
            hqRoutingSafetyIntervalSeconds: 2,
            checkQueueBudgetPerTick: 2,
            forcedSpawnQueueBudgetPerTick: 1,
            forcedSpawnDelaySeconds: 0.2,
        },
        spatialHash: {
            cellSizeMeters: 32,
        },
        damage: {
            enableSmoothing: false,
            restrictedPulseDamage: 8,
            restrictedPulseIntervalSeconds: 0.25,
            smoothingSpread: {
                closeMaxDist: 10,
                midMaxDist: 25,
                closeSeconds: 2,
                midSeconds: 1.8,
                farSeconds: 1.6,
                minHealthDelayFactor: 0.45,
                maxHealthDelayFactor: 1,
            },
        },
    },
    timerLanes: {
        disabledMcomEnforceMs: 500,
        phaseSecondMs: 1000,
        liveFastMs: 100,
        liveSlowMs: 300,
        endgameAudioMs: 500,
        capturePointReconcileMs: 500,
        uiClockMs: 1000,
        damageZonePulseMs: 250,
        iconFollowMs: 50,
        holdUiMs: 50,
        noFireEnforceMs: 1000,
    },
    audio: {
        captureTickIntervalSeconds: 0.45,
        captureBuildupThreshold: 0.88,
        captureBuildupLeadSeconds: 0.45,
        captureBuildupBeats: 3,
        captureBuildupBeatIntervalSeconds: 0.12,
        captureBuildupCooldownSeconds: 2,
        captureBuildupProfile: 'captureLeadin',
        captureBuildupBeatVolumes: [0.18, 0.23, 0.3],
    },
    music: {
        enabled: true,
        package: 'Core',
        endgameTicketThreshold: 50,
        endgameTimeThresholdSeconds: 30,
        urgencyMin: 0,
        urgencyMax: 4,
        fallbackToSfxLoops: true,
    },
    debug: {
        parityDiagnostics: false,
        livePerformanceDiagnostics: false,
    },
} as const;


// --- SOURCE: src\king-of-the-hill-mode\state\runtime-state.ts ---
export enum GamePhase {
    NotStarted = 'NotStarted',
    Prematch = 'Prematch',
    Countdown = 'Countdown',
    Prelive = 'Prelive',
    Live = 'Live',
    Postmatch = 'Postmatch',
}

export interface SchedulerHandles {
    disabledMcomEnforce?: number;
    phaseSecond?: number;
    liveFast?: number;
    liveSlow?: number;
    endgameAudio?: number;
    damageZonePulse?: number;
    iconFollow?: number;
    holdUi?: number;
    noFireEnforce?: number;
}

export interface RuntimeState {
    phase: GamePhase;
    serverTickCount: number;
    phaseTickCount: number;
    scheduler: SchedulerHandles;
}

export function createRuntimeState(): RuntimeState {
    return {
        phase: GamePhase.NotStarted,
        serverTickCount: 0,
        phaseTickCount: 0,
        scheduler: {},
    };
}


// --- SOURCE: src\king-of-the-hill-mode\state\capture-point-state.ts ---
﻿export type CapturePointLane = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

function clampCaptureProgress01(value: number): number {
    if (value < 0) return 0;
    if (value > 1) return 1;
    return value;
}

export class CapturePointState {
    public constructor(public capturePoint: mod.CapturePoint, public id: number, public lane: CapturePointLane) {}

    private _owner: mod.Team = mod.GetTeam(0);
    private _capturingTeam: mod.Team = mod.GetTeam(0);
    private _onPointPlayerIds: number[] = [];

    private _captureProgress = 0;
    private _previousCaptureProgress = 0;
    private _fade = mod.Pi();

    private _onPointCounts: [number, number] = [0, 0];

    public get owner(): mod.Team {
        return this._owner;
    }

    public set owner(value: mod.Team) {
        this._owner = value;
    }

    public get capturingTeam(): mod.Team {
        return this._capturingTeam;
    }

    public set capturingTeam(value: mod.Team) {
        this._capturingTeam = value;
    }

    public get captureProgress(): number {
        return this._captureProgress;
    }

    public set captureProgress(value: number) {
        this._previousCaptureProgress = this._captureProgress;
        this._captureProgress = clampCaptureProgress01(value);
    }

    public get previousCaptureProgress(): number {
        return this._previousCaptureProgress;
    }

    public set previousCaptureProgress(value: number) {
        this._previousCaptureProgress = clampCaptureProgress01(value);
    }

    public get fade(): number {
        return this._fade;
    }

    public set fade(value: number) {
        this._fade = value;
    }

    public setOnPointCounts(team1: number, team2: number): void {
        this._onPointCounts = [team1, team2];
    }

    public getOnPointCounts(): [number, number] {
        return [...this._onPointCounts] as [number, number];
    }

    public addPlayerOnPoint(playerId: number): void {
        if (this._onPointPlayerIds.includes(playerId)) return;
        this._onPointPlayerIds.push(playerId);
    }

    public removePlayerOnPoint(playerId: number): void {
        const index = this._onPointPlayerIds.indexOf(playerId);
        if (index >= 0) this._onPointPlayerIds.splice(index, 1);
    }

    public clearOnPointPlayers(): void {
        this._onPointPlayerIds = [];
    }

    public getOnPointPlayers(): number[] {
        return [...this._onPointPlayerIds];
    }
}


// --- SOURCE: src\king-of-the-hill-mode\state\player-state.ts ---
﻿export type PlayerScoreboardSnapshot = [number, number, number, number, number];

export class PlayerState {
    public constructor(
        public player: mod.Player,
        public id: number,
        public team: mod.Team
    ) {}

    public isDeployed = false;

    private _firstDeploy = true;
    private _ready = false;
    private _capturePoint: mod.CapturePoint | null = null;

    // [score, kills, deaths, assists, captures]
    private _scoreboard: PlayerScoreboardSnapshot = [0, 0, 0, 0, 0];

    public setCapturePoint(capturePoint: mod.CapturePoint | null): void {
        this._capturePoint = capturePoint;
    }

    public getCapturePoint(): mod.CapturePoint | null {
        return this._capturePoint;
    }

    public consumeFirstDeploy(): boolean {
        if (!this._firstDeploy) return false;

        this._firstDeploy = false;
        return true;
    }

    public resetFirstDeploy(): void {
        this._firstDeploy = true;
    }

    public isReady(): boolean {
        return this._ready;
    }

    public setReady(value: boolean): void {
        this._ready = value;
    }

    public toggleReady(): void {
        this._ready = !this._ready;
    }

    public addScore(value: number): void {
        this._scoreboard[0] += value;
    }

    public addKill(): void {
        this._scoreboard[1] += 1;
    }

    public addDeath(): void {
        this._scoreboard[2] += 1;
    }

    public addKillAssist(): void {
        this._scoreboard[3] += 1;
    }

    public addCapture(): void {
        this._scoreboard[4] += 1;
    }

    // Compatibility aliases while legacy names are still phased out.
    public addArmed(): void {
        this.addKillAssist();
    }

    public addDestroyed(): void {
        this.addCapture();
    }

    public resetForNewRound(): void {
        this.isDeployed = false;
        this._firstDeploy = true;
        this._ready = false;
        this._capturePoint = null;
        this._scoreboard = [0, 0, 0, 0, 0];
    }

    public getScoreboardSnapshot(): PlayerScoreboardSnapshot {
        return [...this._scoreboard] as PlayerScoreboardSnapshot;
    }
}


// --- SOURCE: src\king-of-the-hill-mode\state\session-state.ts ---
﻿


export interface DynamicRoutingSessionState {
    currentDynamicHqTeam1: number;
    currentDynamicHqTeam2: number;
    hqRoutingDirty: boolean;
    lastHqRoutingUpdateTick: number;
}

export interface SafeSpawnSessionState {
    pendingDynamicHqForPlayer: Record<number, number | undefined>;
    lastDynamicHqForPlayer: Record<number, number>;
    safeSpawnSpawnerIndex: Record<number, number>;
    safeSpawnUnsafePending: Record<number, boolean>;
    safeSpawnUnsafeSpawnerObjId: Record<number, number>;
    safeSpawnForcedRedeploys: Record<number, number>;
    safeSpawnPendingCheck: Record<number, boolean>;
    safeSpawnForcedUndeploy: Record<number, boolean>;
    safeSpawnGenerationByPlayerId: Record<number, number>;
    safeSpawnCheckQueuedGenerationByPlayerId: Record<number, number | undefined>;
    safeSpawnForcedQueuedGenerationByPlayerId: Record<number, number | undefined>;
    squadSpawnBypassClearTimerByPlayerId: Record<number, number | undefined>;
    diagnostics: {
        checkQueueDepth: number;
        forcedSpawnQueueDepth: number;
        checksProcessed: number;
        forcedSpawnsProcessed: number;
        routeCacheRebuilds: number;
        spatialHashRebuilds: number;
        maxQueueAgeTicks: number;
    };
}

export interface RestrictedAreaSessionState {
    playerInDamageZone: Record<number, boolean>;
    playerInRestrictedArea: Record<number, boolean>;
    restrictedAreaCountdownToken: Record<number, number>;
    restrictedAreaRootWidgetByPlayerId: Record<number, mod.UIWidget | undefined>;
    restrictedAreaCounterWidgetByPlayerId: Record<number, mod.UIWidget | undefined>;
}

export interface PrematchSessionState {
    prematchHealthInside889ByPlayerId: Record<number, boolean>;
    prematchHealthAppliedMaxByPlayerId: Record<number, number>;
}

export interface PlayerDomainSessionState {
    byId: Map<number, PlayerState>;
    disconnectedPlayerIds: number[];
}

export interface ObjectiveDomainSessionState {
    capturePointsById: Map<number, CapturePointState>;
}

export interface CombatDomainSessionState {
    diagnostics: {
        liveTicks: number;
    };
}

export interface SpawnRoutingDomainSessionState {
    diagnostics: {
        routingTicks: number;
    };
    lastLiveFlankPressureByPlayerId: Record<
        number,
        | {
              defaultRouteKey: 'A' | 'B' | 'C' | null;
              chosenRouteKey: 'A' | 'B' | 'C' | null;
              aEnemyCount: number;
              cEnemyCount: number;
              recordedAtTick: number;
          }
        | undefined
    >;
}

export interface UiDomainSessionState {
    liveUiSlotByPlayerId: Record<
        number,
        | {
              teamKey: 'T1' | 'T2';
              slotIndex: number;
              slotKey: string;
          }
        | undefined
    >;
    playerIdByLiveUiSlotTeam1: Array<number | undefined>;
    playerIdByLiveUiSlotTeam2: Array<number | undefined>;
    diagnostics: {
        fastLaneTicks: number;
        slowLaneTicks: number;
        lastActiveTimerCount: number;
        assignedSlotCount: number;
        failedAssignmentCount: number;
    };
}

export interface AudioDomainSessionState {
    diagnostics: {
        endgameTicks: number;
    };
}

export interface LifecycleDomainSessionState {
    diagnostics: {
        prematchTicks: number;
        countdownTicks: number;
        preliveTicks: number;
        liveTicks: number;
        postmatchTicks: number;
    };
}

export interface SessionState {
    // Transitional compatibility keys still used by existing services.
    playersById: Map<number, PlayerState>;
    disconnectedPlayerIds: number[];
    capturePointsById: Map<number, CapturePointState>;
    dynamicRouting: DynamicRoutingSessionState;
    safeSpawn: SafeSpawnSessionState;
    restrictedArea: RestrictedAreaSessionState;
    prematch: PrematchSessionState;

    // Service-first domain slices.
    player: PlayerDomainSessionState;
    objective: ObjectiveDomainSessionState;
    combat: CombatDomainSessionState;
    spawnRouting: SpawnRoutingDomainSessionState;
    ui: UiDomainSessionState;
    audio: AudioDomainSessionState;
    lifecycle: LifecycleDomainSessionState;
}

export function createSessionState(): SessionState {
    const playersById = new Map<number, PlayerState>();
    const disconnectedPlayerIds: number[] = [];
    const capturePointsById = new Map<number, CapturePointState>();

    return {
        playersById,
        disconnectedPlayerIds,
        capturePointsById,
        dynamicRouting: {
            currentDynamicHqTeam1: 0,
            currentDynamicHqTeam2: 0,
            hqRoutingDirty: true,
            lastHqRoutingUpdateTick: -1,
        },
        safeSpawn: {
            pendingDynamicHqForPlayer: {},
            lastDynamicHqForPlayer: {},
            safeSpawnSpawnerIndex: {},
            safeSpawnUnsafePending: {},
            safeSpawnUnsafeSpawnerObjId: {},
            safeSpawnForcedRedeploys: {},
            safeSpawnPendingCheck: {},
            safeSpawnForcedUndeploy: {},
            safeSpawnGenerationByPlayerId: {},
            safeSpawnCheckQueuedGenerationByPlayerId: {},
            safeSpawnForcedQueuedGenerationByPlayerId: {},
            squadSpawnBypassClearTimerByPlayerId: {},
            diagnostics: {
                checkQueueDepth: 0,
                forcedSpawnQueueDepth: 0,
                checksProcessed: 0,
                forcedSpawnsProcessed: 0,
                routeCacheRebuilds: 0,
                spatialHashRebuilds: 0,
                maxQueueAgeTicks: 0,
            },
        },
        restrictedArea: {
            playerInDamageZone: {},
            playerInRestrictedArea: {},
            restrictedAreaCountdownToken: {},
            restrictedAreaRootWidgetByPlayerId: {},
            restrictedAreaCounterWidgetByPlayerId: {},
        },
        prematch: {
            prematchHealthInside889ByPlayerId: {},
            prematchHealthAppliedMaxByPlayerId: {},
        },
        player: {
            byId: playersById,
            disconnectedPlayerIds,
        },
        objective: {
            capturePointsById,
        },
        combat: {
            diagnostics: {
                liveTicks: 0,
            },
        },
        spawnRouting: {
            diagnostics: {
                routingTicks: 0,
            },
            lastLiveFlankPressureByPlayerId: {},
        },
        ui: {
            liveUiSlotByPlayerId: {},
            playerIdByLiveUiSlotTeam1: new Array<number | undefined>(32),
            playerIdByLiveUiSlotTeam2: new Array<number | undefined>(32),
            diagnostics: {
                fastLaneTicks: 0,
                slowLaneTicks: 0,
                lastActiveTimerCount: 0,
                assignedSlotCount: 0,
                failedAssignmentCount: 0,
            },
        },
        audio: {
            diagnostics: {
                endgameTicks: 0,
            },
        },
        lifecycle: {
            diagnostics: {
                prematchTicks: 0,
                countdownTicks: 0,
                preliveTicks: 0,
                liveTicks: 0,
                postmatchTicks: 0,
            },
        },
    };
}


// --- SOURCE: src\king-of-the-hill-mode\state\mode-context.ts ---





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



// --- SOURCE: src\king-of-the-hill-mode\services\audio-service.ts ---


export class AudioService {
    public constructor(private readonly _context: KothPhaseModeContext) {}

    public context(): KothPhaseModeContext {
        return this._context;
    }

    public playCountdownHeartbeat(_volume: number): void {
        // Audio remains kernel-owned until full audio extraction is completed.
    }

    public playCaptureTick(_team: mod.Team, _friendly: boolean): void {
        // Audio remains kernel-owned until full audio extraction is completed.
    }

    public playCaptureLoss(_team: mod.Team): void {
        // Audio remains kernel-owned until full audio extraction is completed.
    }

    public processEndgameSuspenseTick(): void {
        if (this._context.rules.debug.parityDiagnostics) {
            this._context.session.audio.diagnostics.endgameTicks += 1;
        }
    }
}



// --- SOURCE: node_modules\bf6-portal-utils\timers\index.ts ---



// version: 1.2.0
export namespace Timers {
    const logging = new Logging('Timers');

    /**
     * A re-export of the `Logging.LogLevel` enum.
     */
    export const LogLevel = Logging.LogLevel;

    /**
     * Attaches a logger and defines a minimum log level and whether to include the runtime error in the log.
     * @param log - The logger function to use. Pass undefined to disable logging.
     * @param logLevel - The minimum log level to use.
     * @param includeError - Whether to include the runtime error in the log.
     */
    export function setLogging(
        log?: (text: string) => Promise<void> | void,
        logLevel?: Logging.LogLevel,
        includeError?: boolean
    ): void {
        logging.setLogging(log, logLevel, includeError);
    }

    const ACTIVE_IDS = new Set<number>();

    let nextId: number = 1;

    async function executeTimeout(id: number, callback: () => Promise<void> | void, ms: number): Promise<void> {
        await Promise.resolve();
        await mod.Wait(ms / 1_000);

        if (!ACTIVE_IDS.has(id)) return; // Exit if the timer is no longer active.

        ACTIVE_IDS.delete(id); // Cleanup one-time timer.

        CallbackHandler.invokeNoArgs(callback, `timeout ${id}`, logging, LogLevel.Error);
    }

    async function executeInterval(
        id: number,
        callback: () => Promise<void> | void,
        ms: number,
        immediate: boolean
    ): Promise<void> {
        await Promise.resolve();

        // Skip the first wait if immediate is true.
        if (!immediate && ACTIVE_IDS.has(id)) {
            await mod.Wait(ms / 1_000);
        }

        do {
            if (!ACTIVE_IDS.has(id)) return;

            CallbackHandler.invokeNoArgs(callback, `interval ${id}`, logging, LogLevel.Error);

            if (!ACTIVE_IDS.has(id)) return;

            await mod.Wait(ms / 1_000);
            // eslint-disable-next-line no-constant-condition
        } while (true);
    }

    /**
     * Schedules a one-time execution after the specified delay.
     * @param callback - The callback to execute.
     * @param ms - The delay in milliseconds.
     * @returns The timer ID.
     */
    export function setTimeout(callback: () => Promise<void> | void, ms: number): number {
        const id = nextId++;
        ACTIVE_IDS.add(id);

        // Run async without awaiting (fire-and-forget).
        executeTimeout(id, callback, ms < 0 ? 0 : ms);

        return id;
    }

    /**
     * Schedules a repeated execution after the specified interval.
     * @param callback - The callback to execute. Synchronous callbacks will delay the start of the next interval.
     * @param ms - The interval in milliseconds.
     * @param immediate - If true, runs the callback immediately before the first wait period.
     * @returns The timer ID.
     */
    export function setInterval(callback: () => Promise<void> | void, ms: number, immediate: boolean = false): number {
        const id = nextId++;
        ACTIVE_IDS.add(id);

        // Run async without awaiting (fire-and-forget).
        executeInterval(id, callback, ms < 0 ? 0 : ms, immediate);

        return id;
    }

    /**
     * Cancels a timeout (or interval). Silently ignores null, undefined, or invalid IDs.
     * @param id - The timer ID to cancel.
     */
    export function clearTimeout(id: number | undefined | null): void {
        clear(id);
    }

    /**
     * Cancels an interval (or timeout). Silently ignores null, undefined, or invalid IDs.
     * @param id - The timer ID to cancel.
     */
    export function clearInterval(id: number | undefined | null): void {
        clear(id);
    }

    /**
     * Cancels a timeout or interval. Silently ignores null, undefined, or invalid IDs.
     * @param id - The timer ID to cancel.
     */
    export function clear(id: number | undefined | null): void {
        if (id === undefined || id === null) return;

        ACTIVE_IDS.delete(id);
    }

    /**
     * @returns The number of active timers.
     */
    export function getActiveTimerCount(): number {
        return ACTIVE_IDS.size;
    }
}


// --- SOURCE: src\king-of-the-hill-mode\config\ui-colors.ts ---
export type KothRgbColor = readonly [number, number, number];

export const KOTH_KERNEL_UI_COLOR_RGB = {
    neutral: [0.65, 0.65, 0.65] as KothRgbColor,
    friendly: [0.1, 0.55, 1] as KothRgbColor,
    enemy: [1, 72 / 255, 58 / 255] as KothRgbColor,
} as const;

export const KOTH_KERNEL_UI_COLORS = {
    neutral: mod.CreateVector(...KOTH_KERNEL_UI_COLOR_RGB.neutral),
    friendly: mod.CreateVector(...KOTH_KERNEL_UI_COLOR_RGB.friendly),
    enemy: mod.CreateVector(...KOTH_KERNEL_UI_COLOR_RGB.enemy),
} as const;


// --- SOURCE: src\king-of-the-hill-mode\live\config\koth-hills.ts ---
export type KothHillLetter = 'A' | 'B' | 'C' | 'D' | 'E';

export interface KothHillConfig {
    letter: KothHillLetter;
    areaTriggerId: number;
    neutralSectorId: number;
    neutralCapturePointId: number;
    team1SectorId: number;
    team1CapturePointId: number;
    team2SectorId: number;
    team2CapturePointId: number;
}

export const KOTH_HILLS = [
    {
        letter: 'A',
        areaTriggerId: 501,
        neutralSectorId: 400,
        neutralCapturePointId: 401,
        team1SectorId: 200,
        team1CapturePointId: 201,
        team2SectorId: 300,
        team2CapturePointId: 301,
    },
    {
        letter: 'B',
        areaTriggerId: 502,
        neutralSectorId: 400,
        neutralCapturePointId: 402,
        team1SectorId: 200,
        team1CapturePointId: 202,
        team2SectorId: 300,
        team2CapturePointId: 302,
    },
    {
        letter: 'C',
        areaTriggerId: 503,
        neutralSectorId: 400,
        neutralCapturePointId: 403,
        team1SectorId: 200,
        team1CapturePointId: 203,
        team2SectorId: 300,
        team2CapturePointId: 303,
    },
    {
        letter: 'D',
        areaTriggerId: 504,
        neutralSectorId: 400,
        neutralCapturePointId: 404,
        team1SectorId: 200,
        team1CapturePointId: 204,
        team2SectorId: 300,
        team2CapturePointId: 304,
    },
    {
        letter: 'E',
        areaTriggerId: 505,
        neutralSectorId: 400,
        neutralCapturePointId: 405,
        team1SectorId: 200,
        team1CapturePointId: 205,
        team2SectorId: 300,
        team2CapturePointId: 305,
    },
] as const satisfies readonly KothHillConfig[];

export const KOTH_HILL_AREA_TRIGGER_IDS: readonly number[] = KOTH_HILLS.map((hill) => hill.areaTriggerId);
export const KOTH_HILL_CAPTURE_POINT_IDS: readonly number[] = KOTH_HILLS.flatMap((hill) => [
    hill.neutralCapturePointId,
    hill.team1CapturePointId,
    hill.team2CapturePointId,
]);
export const KOTH_HILL_SECTOR_IDS = [200, 300, 400] as const;


// --- SOURCE: src\king-of-the-hill-mode\live\config\koth-spawns.ts ---


export type KothTeamId = 1 | 2;

export type KothPresenceZone = 'northWest' | 'northEast' | 'southWest' | 'southEast';

export interface KothPresenceZoneConfig {
    zone: KothPresenceZone;
    areaTriggerId: number;
}

export type KothCardinalSide = 'north' | 'south' | 'west' | 'east';
export type KothSpawnAxis = 'horizontal' | 'vertical';

export interface KothSpawnRegionConfig {
    regionId: string;
    objectiveLetter?: KothHillLetter;
    axis: KothSpawnAxis;
    opposingSides: readonly [KothCardinalSide, KothCardinalSide];
    defaultTeamSideByTeamId: Readonly<Record<KothTeamId, KothCardinalSide>>;
    defaultVariantSideByTeamId?: Readonly<Record<KothTeamId, KothCardinalSide>>;
    sectors: readonly KothSpawnSectorConfig[];
}

export interface KothSpawnSectorConfig {
    regionId: string;
    objectiveLetter?: KothHillLetter;
    teamSide: KothCardinalSide;
    variantSide: KothCardinalSide;
    pressureZones: readonly KothPresenceZone[];
    idealDistanceMeters?: number;
    minDistanceMeters?: number;
    maxDistanceMeters?: number;
    anchorObjectIds: readonly number[];
}

export type KothSpawnSectorKey = `${string}:${KothCardinalSide}:${KothCardinalSide}`;

export interface KothSpawnDistanceConfig {
    idealObjectiveDistanceMeters: number;
    minObjectiveDistanceMeters: number;
    maxObjectiveDistanceMeters: number;
    hardMaxObjectiveDistanceMeters: number;
    distancePenaltyPerMeter: number;
}

export interface KothSpawnPressureConfig {
    enemyHeavyThreshold: number;
    enemyPressurePenalty: number;
    friendlyPresenceBonus: number;
}

export interface KothSpawnSafetyConfig {
    enemySafetyRadiusMeters: number;
    queuedAnchorEnemySafetyRadiusMeters: number;
    teammateTeleportEnemySafetyRadiusMeters: number;
    teammateTeleportMinObjectiveDistanceMeters: number;
    inactiveFallbackMinActiveObjectiveDistanceMeters: number;
    inactiveFallbackMaxActiveObjectiveDistanceMeters: number;
    unsafeAnchorPenalty: number;
}

export interface KothSpawnFrontlineConfig {
    sideFlipCooldownMs: number;
    enemyDominantSideMinDelta: number;
    friendlyAnchorMarginMeters: number;
}

export interface KothAnchorDistanceScore {
    anchorObjectId: number;
    distanceToObjectiveMeters: number;
    distanceErrorMeters: number;
    isWithinPreferredRange: boolean;
    isWithinHardRange: boolean;
    distancePenalty: number;
}

export interface KothSpawnSectorPressure {
    friendlyCount: number;
    enemyCount: number;
    score: number;
    isEnemyHeavy: boolean;
}

export interface KothSpawnCandidateScore {
    sector: KothSpawnSectorConfig;
    anchorObjectId: number;
    score: number;
    sectorPressure: KothSpawnSectorPressure;
    distanceToObjectiveMeters: number;
    distancePenalty: number;
    enemySafetyPenalty: number;
    isPreferredDistance: boolean;
    isEmergencyFallback: boolean;
}

export const KOTH_PRESENCE_ZONES: readonly KothPresenceZoneConfig[] = [
    { zone: 'northWest', areaTriggerId: 901 },
    { zone: 'northEast', areaTriggerId: 902 },
    { zone: 'southWest', areaTriggerId: 903 },
    { zone: 'southEast', areaTriggerId: 904 },
] as const;

export const KOTH_PRESENCE_ZONE_AREA_TRIGGER_IDS: readonly number[] = KOTH_PRESENCE_ZONES.map(
    (zone) => zone.areaTriggerId
);

export const KOTH_SPAWN_DISTANCE: KothSpawnDistanceConfig = {
    idealObjectiveDistanceMeters: 60,
    minObjectiveDistanceMeters: 45,
    maxObjectiveDistanceMeters: 80,
    hardMaxObjectiveDistanceMeters: 120,
    distancePenaltyPerMeter: 1,
};

export const KOTH_SPAWN_PRESSURE: KothSpawnPressureConfig = {
    enemyHeavyThreshold: 2,
    enemyPressurePenalty: 200,
    friendlyPresenceBonus: 20,
};

export const KOTH_SPAWN_SAFETY: KothSpawnSafetyConfig = {
    enemySafetyRadiusMeters: 25,
    queuedAnchorEnemySafetyRadiusMeters: 40,
    teammateTeleportEnemySafetyRadiusMeters: 40,
    teammateTeleportMinObjectiveDistanceMeters: 40,
    inactiveFallbackMinActiveObjectiveDistanceMeters: 60,
    inactiveFallbackMaxActiveObjectiveDistanceMeters: 80,
    unsafeAnchorPenalty: 1000,
};

export const KOTH_SPAWN_FRONTLINE: KothSpawnFrontlineConfig = {
    sideFlipCooldownMs: 5000,
    enemyDominantSideMinDelta: 1,
    friendlyAnchorMarginMeters: 10,
};

export function getOppositeCardinalSide(side: KothCardinalSide): KothCardinalSide {
    switch (side) {
        case 'north':
            return 'south';
        case 'south':
            return 'north';
        case 'west':
            return 'east';
        case 'east':
            return 'west';
    }
}

export function getVariantSidesForAxis(axis: KothSpawnAxis): readonly KothCardinalSide[] {
    return axis === 'horizontal' ? (['north', 'south'] as const) : (['west', 'east'] as const);
}

export function getTeamSidesForAxis(axis: KothSpawnAxis): readonly KothCardinalSide[] {
    return axis === 'horizontal' ? (['west', 'east'] as const) : (['north', 'south'] as const);
}

export function getPresenceZonesForSector(
    teamSide: KothCardinalSide,
    variantSide: KothCardinalSide
): readonly KothPresenceZone[] {
    if (teamSide === 'west' && variantSide === 'north') return ['northWest'];
    if (teamSide === 'west' && variantSide === 'south') return ['southWest'];
    if (teamSide === 'east' && variantSide === 'north') return ['northEast'];
    if (teamSide === 'east' && variantSide === 'south') return ['southEast'];
    if (teamSide === 'north' && variantSide === 'west') return ['northWest'];
    if (teamSide === 'north' && variantSide === 'east') return ['northEast'];
    if (teamSide === 'south' && variantSide === 'west') return ['southWest'];
    if (teamSide === 'south' && variantSide === 'east') return ['southEast'];

    return [];
}

export function getSectorKey(
    regionId: string,
    teamSide: KothCardinalSide,
    variantSide: KothCardinalSide
): KothSpawnSectorKey {
    return `${regionId}:${teamSide}:${variantSide}`;
}

function createSector(
    regionId: string,
    teamSide: KothCardinalSide,
    variantSide: KothCardinalSide,
    anchorObjectIds: readonly number[],
    objectiveLetter?: KothHillLetter
): KothSpawnSectorConfig {
    return {
        regionId,
        objectiveLetter,
        teamSide,
        variantSide,
        pressureZones: getPresenceZonesForSector(teamSide, variantSide),
        anchorObjectIds,
    };
}

export const KOTH_SPAWN_REGIONS: readonly KothSpawnRegionConfig[] = [
    {
        regionId: 'A',
        objectiveLetter: 'A',
        axis: 'horizontal',
        opposingSides: ['west', 'east'],
        defaultTeamSideByTeamId: { 1: 'west', 2: 'east' },
        defaultVariantSideByTeamId: { 1: 'north', 2: 'south' },
        sectors: [
            createSector('A', 'west', 'north', [1311, 1312, 1313, 1314, 1315], 'A'),
            createSector('A', 'west', 'south', [1321, 1322, 1323, 1324, 1325], 'A'),
            createSector('A', 'east', 'north', [1411, 1412, 1413, 1414, 1415], 'A'),
            createSector('A', 'east', 'south', [1421, 1422, 1423, 1424, 1425], 'A'),
        ],
    },
    {
        regionId: 'B',
        objectiveLetter: 'B',
        axis: 'horizontal',
        opposingSides: ['west', 'east'],
        defaultTeamSideByTeamId: { 1: 'west', 2: 'east' },
        defaultVariantSideByTeamId: { 1: 'north', 2: 'south' },
        sectors: [
            createSector('B', 'west', 'north', [2311, 2312, 2313, 2314, 2315], 'B'),
            createSector('B', 'west', 'south', [2321, 2322, 2323, 2324, 2325], 'B'),
            createSector('B', 'east', 'north', [2411, 2412, 2413, 2414, 2415], 'B'),
            createSector('B', 'east', 'south', [2421, 2422, 2423, 2424, 2425], 'B'),
        ],
    },
    {
        regionId: 'C',
        objectiveLetter: 'C',
        axis: 'horizontal',
        opposingSides: ['west', 'east'],
        defaultTeamSideByTeamId: { 1: 'west', 2: 'east' },
        defaultVariantSideByTeamId: { 1: 'north', 2: 'south' },
        sectors: [
            createSector('C', 'west', 'north', [3311, 3312, 3313, 3314, 3315], 'C'),
            createSector('C', 'west', 'south', [3321, 3322, 3323, 3324, 3325], 'C'),
            createSector('C', 'east', 'north', [3411, 3412, 3413, 3414, 3415], 'C'),
            createSector('C', 'east', 'south', [3421, 3422, 3423, 3424, 3425], 'C'),
        ],
    },
    {
        regionId: 'D',
        objectiveLetter: 'D',
        axis: 'horizontal',
        opposingSides: ['west', 'east'],
        defaultTeamSideByTeamId: { 1: 'west', 2: 'east' },
        defaultVariantSideByTeamId: { 1: 'north', 2: 'south' },
        sectors: [
            createSector('D', 'west', 'north', [4311, 4312, 4313, 4314, 4315], 'D'),
            createSector('D', 'west', 'south', [4321, 4322, 4323, 4324, 4325], 'D'),
            createSector('D', 'east', 'north', [4411, 4412, 4413, 4414, 4415], 'D'),
            createSector('D', 'east', 'south', [4421, 4422, 4423, 4424, 4425], 'D'),
        ],
    },
    {
        regionId: 'E',
        objectiveLetter: 'E',
        axis: 'horizontal',
        opposingSides: ['west', 'east'],
        defaultTeamSideByTeamId: { 1: 'west', 2: 'east' },
        defaultVariantSideByTeamId: { 1: 'north', 2: 'south' },
        sectors: [
            createSector('E', 'west', 'north', [5311, 5312, 5313, 5314, 5315], 'E'),
            createSector('E', 'west', 'south', [5321, 5322, 5323, 5324, 5325], 'E'),
            createSector('E', 'east', 'north', [5411, 5412, 5413, 5414, 5415], 'E'),
            createSector('E', 'east', 'south', [5421, 5422, 5423, 5424, 5425], 'E'),
        ],
    },
] as const satisfies readonly KothSpawnRegionConfig[];

export const KOTH_SPAWNS = {
    hqSpawners: {
        team1: 1,
        team2: 2,
    },
    disabledLegacyHqIds: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 8888, 8889] as const,
    rules: {
        spawnJobsPerTick: 1,
        spawnJobTickMs: 50,
        spawnRetryWindowMs: 750,
        anchorReuseCooldownMs: 8000,
    },
    presenceZones: KOTH_PRESENCE_ZONES,
    distance: KOTH_SPAWN_DISTANCE,
    pressure: KOTH_SPAWN_PRESSURE,
    safety: KOTH_SPAWN_SAFETY,
    frontline: KOTH_SPAWN_FRONTLINE,
    regions: KOTH_SPAWN_REGIONS,
} as const;

export function getRegionForActiveObjective(objectiveLetter: KothHillLetter): KothSpawnRegionConfig | undefined {
    for (const region of KOTH_SPAWN_REGIONS) {
        if (region.objectiveLetter === objectiveLetter) return region;
    }

    return undefined;
}

export function getPresenceZoneForAreaTriggerId(areaTriggerId: number): KothPresenceZone | undefined {
    for (const zone of KOTH_PRESENCE_ZONES) {
        if (zone.areaTriggerId === areaTriggerId) return zone.zone;
    }

    return undefined;
}


// --- SOURCE: src\vendor\portal-sdk\code\modlib\index.ts ---
// 

export function Concat(s1: string, s2: string) {
    return s1 + s2;
}

export function And(...rest: boolean[]): boolean {
    for (let i = 0; i < rest.length; i++) {
        const cond = rest[i];
        if (!cond) return false;
    }
    return true;
}

type ConditionFunction = () => boolean;

export function AndFn(...rest: ConditionFunction[]): boolean {
    for (let i = 0; i < rest.length; i++) {
        const condFn = rest[i];
        if (!condFn()) return false;
    }
    return true;
}

export function getPlayerId(player: mod.Player): number {
    return mod.GetObjId(player);
}

export function getTeamId(team: mod.Team): number {
    return mod.GetObjId(team);
}

export function ConvertArray(array: mod.Array): any[] {
    let v = [];
    let n = mod.CountOf(array);
    for (let i = 0; i < n; i++) {
        let currentElement = mod.ValueInArray(array, i);
        v.push(currentElement);
    }
    return v;
}

export function FilteredArray(array: mod.Array, cond: (currentElement: any) => boolean): mod.Array {
    const arr = ConvertArray(array);
    let v = mod.EmptyArray();
    let n = arr.length;
    for (let i = 0; i < n; i++) {
        let currentElement = arr[i];
        if (cond(currentElement)) v = mod.AppendToArray(v, currentElement);
    }
    return v;
}

export function IndexOfFirstTrue(array: mod.Array, cond: (element: any, arg: any) => boolean, arg: any = null): number {
    const arr = ConvertArray(array);
    let n = arr.length;
    for (let i = 0; i < n; i++) {
        let currentArrayElement = arr[i];
        if (cond(currentArrayElement, arg)) return i;
    }
    return -1;
}

export function IfThenElse<T>(condition: boolean, ifTrue: () => T, ifFalse: () => T) {
    if (condition) return ifTrue();
    else return ifFalse();
}

export function IsTrueForAll(array: mod.Array, condition: (element: any, arg: any) => boolean, arg: any = null) {
    const arr = ConvertArray(array);
    let n = arr.length;
    for (let i = 0; i < n; i++) {
        let currentArrayElement = arr[i];
        if (!condition(currentArrayElement, arg)) return false;
    }
    return true;
}

export function IsTrueForAny(array: mod.Array, condition: (element: any, arg: any) => boolean, arg: any = null) {
    const arr = ConvertArray(array);
    let n = arr.length;
    for (let i = 0; i < n; i++) {
        let currentArrayElement = arr[i];
        if (condition(currentArrayElement, arg)) return true;
    }
    return false;
}

export function SortedArray(array: any[], compare: (a: any, b: any) => number) {
    let v1 = array.slice();
    v1.sort(compare);
    let v2 = [];
    for (let e of v1) v2.push(e);
    return v2;
}

export function Equals(a: any, b: any) {
    if (a == null || b == null) debugger;
    return mod.Equals(a, b);
}

// Waits for a provided number of seconds or if the provided condition evaluates to true during that interval.
export async function WaitUntil(delay: number, cond: () => boolean) {
    // rush hack. this will likely wait too long and other problems.
    const interval = 0.2; // seconds
    const checks = Math.ceil(delay / interval);
    for (let t = 0; t < checks; t++) {
        if (cond()) break;
        await mod.Wait(interval);
    }
}

export class ConditionState {
    lastState: boolean;

    constructor() {
        this.lastState = false;
    }

    update(newState: boolean): boolean {
        // if the new state is false then reset last state and don't trigger action
        if (!newState) {
            this.lastState = false;
            return false;
        }
        // if last state was already true then don't trigger
        if (this.lastState) return false;
        // if the state just transitioned to true then trigger
        this.lastState = true;
        return true;
    }
}

class Conditions {
    constructor() {
        this.conditionStates = [];
    }

    conditionStates: ConditionState[];

    getConditionState(n: number): ConditionState {
        while (n >= this.conditionStates.length) {
            this.conditionStates.push(new ConditionState());
        }
        return this.conditionStates[n];
    }
}

let playerConditions: Conditions[] = [];
let teamConditions: Conditions[] = [];
let capturePointConditions: Conditions[] = [];
let mcomConditions: Conditions[] = [];
let vehicleConditions: Conditions[] = [];
let hqConditions: Conditions[] = [];
let sectorConditions: Conditions[] = [];
let vehicleSpawnerConditions: Conditions[] = [];

let globalConditions: Conditions = new Conditions();

function getObjectCondition(id: number, objectConditions: Conditions[], n: number) {
    while (id >= objectConditions.length) {
        objectConditions.push(new Conditions());
    }
    let conditions = objectConditions[id];
    return conditions.getConditionState(n);
}

export function getPlayerCondition(obj: mod.Player, n: number) {
    let id = getPlayerId(obj);
    while (id >= playerConditions.length) {
        playerConditions.push(new Conditions());
    }
    let conditions = playerConditions[id];
    return conditions.getConditionState(n);
}

export function getTeamCondition(team: mod.Team, n: number) {
    let id = getTeamId(team);
    while (id >= teamConditions.length) {
        teamConditions.push(new Conditions());
    }
    let conditions = teamConditions[id];
    return conditions.getConditionState(n);
}

export function getCapturePointCondition(obj: mod.CapturePoint, n: number) {
    let id = mod.GetObjId(obj);
    return getObjectCondition(id, capturePointConditions, n);
}

export function getMCOMCondition(obj: mod.MCOM, n: number) {
    let id = mod.GetObjId(obj);
    return getObjectCondition(id, mcomConditions, n);
}

export function getVehicleCondition(obj: mod.Vehicle, n: number) {
    let id = mod.GetObjId(obj);
    return getObjectCondition(id, vehicleConditions, n);
}

export function getHQCondition(obj: mod.HQ, n: number) {
    let id = mod.GetObjId(obj);
    return getObjectCondition(id, hqConditions, n);
}

export function getSectorCondition(obj: mod.Sector, n: number) {
    let id = mod.GetObjId(obj);
    return getObjectCondition(id, sectorConditions, n);
}

export function getVehicleSpawnerCondition(obj: mod.VehicleSpawner, n: number) {
    let id = mod.GetObjId(obj);
    return getObjectCondition(id, vehicleSpawnerConditions, n);
}

export function getGlobalCondition(n: number) {
    return globalConditions.getConditionState(n);
}

export function getPlayersInTeam(teamObj: mod.Team) {
    const team = mod.GetObjId(teamObj);
    const allPlayers = mod.AllPlayers();
    const n = mod.CountOf(allPlayers);
    let teamMembers = [];

    for (let i = 0; i < n; i++) {
        let player = mod.ValueInArray(allPlayers, i) as mod.Player;
        if (mod.GetObjId(mod.GetTeam(player)) == team) {
            teamMembers.push(player);
        }
    }
    return teamMembers;
}

//-----------------------------------------------------------------------------------------------//
//-----------------------------------------------------------------------------------------------//
//-----------------------------------------------------------------------------------------------//
//-----------------------------------------------------------------------------------------------//
// Helper functions to create UI from a JSON object tree:
//-----------------------------------------------------------------------------------------------//

type UIVector = mod.Vector | number[];

interface UIParams {
    name: string;
    type: string;
    position: any;
    size: any;
    anchor: mod.UIAnchor;
    parent: mod.UIWidget;
    visible: boolean;
    textLabel: string;
    textColor: UIVector;
    textAlpha: number;
    textSize: number;
    textAnchor: mod.UIAnchor;
    padding: number;
    bgColor: UIVector;
    bgAlpha: number;
    bgFill: mod.UIBgFill;
    imageType: mod.UIImageType;
    imageColor: UIVector;
    imageAlpha: number;
    teamId?: mod.Team;
    playerId?: mod.Player;
    children?: any[];
    buttonEnabled: boolean;
    buttonColorBase: UIVector;
    buttonAlphaBase: number;
    buttonColorDisabled: UIVector;
    buttonAlphaDisabled: number;
    buttonColorPressed: UIVector;
    buttonAlphaPressed: number;
    buttonColorHover: UIVector;
    buttonAlphaHover: number;
    buttonColorFocused: UIVector;
    buttonAlphaFocused: number;
}

function __asModVector(param: number[] | mod.Vector) {
    if (Array.isArray(param)) return mod.CreateVector(param[0], param[1], param.length == 2 ? 0 : param[2]);
    else return param;
}

function __asModMessage(param: string | mod.Message) {
    if (typeof param === 'string') return mod.Message(param);
    return param;
}

function __fillInDefaultArgs(params: UIParams) {
    if (!params.hasOwnProperty('name')) params.name = '';
    if (!params.hasOwnProperty('position')) params.position = mod.CreateVector(0, 0, 0);
    if (!params.hasOwnProperty('size')) params.size = mod.CreateVector(100, 100, 0);
    if (!params.hasOwnProperty('anchor')) params.anchor = mod.UIAnchor.TopLeft;
    if (!params.hasOwnProperty('parent')) params.parent = mod.GetUIRoot();
    if (!params.hasOwnProperty('visible')) params.visible = true;
    if (!params.hasOwnProperty('padding')) params.padding = params.type == 'Container' ? 0 : 8;
    if (!params.hasOwnProperty('bgColor')) params.bgColor = mod.CreateVector(0.25, 0.25, 0.25);
    if (!params.hasOwnProperty('bgAlpha')) params.bgAlpha = 0.5;
    if (!params.hasOwnProperty('bgFill')) params.bgFill = mod.UIBgFill.Solid;
}

function __setNameAndGetWidget(uniqueName: any, params: any) {
    let widget = mod.FindUIWidgetWithName(uniqueName) as mod.UIWidget;
    mod.SetUIWidgetName(widget, params.name);
    return widget;
}

const __cUniqueName = '----uniquename----';

function __addUIContainer(params: UIParams) {
    __fillInDefaultArgs(params);
    let restrict = params.teamId ?? params.playerId;
    if (restrict) {
        mod.AddUIContainer(
            __cUniqueName,
            __asModVector(params.position),
            __asModVector(params.size),
            params.anchor,
            params.parent,
            params.visible,
            params.padding,
            __asModVector(params.bgColor),
            params.bgAlpha,
            params.bgFill,
            restrict
        );
    } else {
        mod.AddUIContainer(
            __cUniqueName,
            __asModVector(params.position),
            __asModVector(params.size),
            params.anchor,
            params.parent,
            params.visible,
            params.padding,
            __asModVector(params.bgColor),
            params.bgAlpha,
            params.bgFill
        );
    }
    let widget = __setNameAndGetWidget(__cUniqueName, params);
    if (params.children) {
        params.children.forEach((childParams: any) => {
            childParams.parent = widget;
            __addUIWidget(childParams);
        });
    }
    return widget;
}

function __fillInDefaultTextArgs(params: UIParams) {
    if (!params.hasOwnProperty('textLabel')) params.textLabel = '';
    if (!params.hasOwnProperty('textSize')) params.textSize = 0;
    if (!params.hasOwnProperty('textColor')) params.textColor = mod.CreateVector(1, 1, 1);
    if (!params.hasOwnProperty('textAlpha')) params.textAlpha = 1;
    if (!params.hasOwnProperty('textAnchor')) params.textAnchor = mod.UIAnchor.CenterLeft;
}

function __addUIText(params: UIParams) {
    __fillInDefaultArgs(params);
    __fillInDefaultTextArgs(params);
    let restrict = params.teamId ?? params.playerId;
    if (restrict) {
        mod.AddUIText(
            __cUniqueName,
            __asModVector(params.position),
            __asModVector(params.size),
            params.anchor,
            params.parent,
            params.visible,
            params.padding,
            __asModVector(params.bgColor),
            params.bgAlpha,
            params.bgFill,
            __asModMessage(params.textLabel),
            params.textSize,
            __asModVector(params.textColor),
            params.textAlpha,
            params.textAnchor,
            restrict
        );
    } else {
        mod.AddUIText(
            __cUniqueName,
            __asModVector(params.position),
            __asModVector(params.size),
            params.anchor,
            params.parent,
            params.visible,
            params.padding,
            __asModVector(params.bgColor),
            params.bgAlpha,
            params.bgFill,
            __asModMessage(params.textLabel),
            params.textSize,
            __asModVector(params.textColor),
            params.textAlpha,
            params.textAnchor
        );
    }
    return __setNameAndGetWidget(__cUniqueName, params);
}

function __fillInDefaultImageArgs(params: any) {
    if (!params.hasOwnProperty('imageType')) params.imageType = mod.UIImageType.None;
    if (!params.hasOwnProperty('imageColor')) params.imageColor = mod.CreateVector(1, 1, 1);
    if (!params.hasOwnProperty('imageAlpha')) params.imageAlpha = 1;
}

function __addUIImage(params: UIParams) {
    __fillInDefaultArgs(params);
    __fillInDefaultImageArgs(params);
    let restrict = params.teamId ?? params.playerId;
    if (restrict) {
        mod.AddUIImage(
            __cUniqueName,
            __asModVector(params.position),
            __asModVector(params.size),
            params.anchor,
            params.parent,
            params.visible,
            params.padding,
            __asModVector(params.bgColor),
            params.bgAlpha,
            params.bgFill,
            params.imageType,
            __asModVector(params.imageColor),
            params.imageAlpha,
            restrict
        );
    } else {
        mod.AddUIImage(
            __cUniqueName,
            __asModVector(params.position),
            __asModVector(params.size),
            params.anchor,
            params.parent,
            params.visible,
            params.padding,
            __asModVector(params.bgColor),
            params.bgAlpha,
            params.bgFill,
            params.imageType,
            __asModVector(params.imageColor),
            params.imageAlpha
        );
    }
    return __setNameAndGetWidget(__cUniqueName, params);
}

function __fillInDefaultArg(params: any, argName: any, defaultValue: any) {
    if (!params.hasOwnProperty(argName)) params[argName] = defaultValue;
}

function __fillInDefaultButtonArgs(params: any) {
    if (!params.hasOwnProperty('buttonEnabled')) params.buttonEnabled = true;
    if (!params.hasOwnProperty('buttonColorBase')) params.buttonColorBase = mod.CreateVector(0.7, 0.7, 0.7);
    if (!params.hasOwnProperty('buttonAlphaBase')) params.buttonAlphaBase = 1;
    if (!params.hasOwnProperty('buttonColorDisabled')) params.buttonColorDisabled = mod.CreateVector(0.2, 0.2, 0.2);
    if (!params.hasOwnProperty('buttonAlphaDisabled')) params.buttonAlphaDisabled = 0.5;
    if (!params.hasOwnProperty('buttonColorPressed')) params.buttonColorPressed = mod.CreateVector(0.25, 0.25, 0.25);
    if (!params.hasOwnProperty('buttonAlphaPressed')) params.buttonAlphaPressed = 1;
    if (!params.hasOwnProperty('buttonColorHover')) params.buttonColorHover = mod.CreateVector(1, 1, 1);
    if (!params.hasOwnProperty('buttonAlphaHover')) params.buttonAlphaHover = 1;
    if (!params.hasOwnProperty('buttonColorFocused')) params.buttonColorFocused = mod.CreateVector(1, 1, 1);
    if (!params.hasOwnProperty('buttonAlphaFocused')) params.buttonAlphaFocused = 1;
}

function __addUIButton(params: UIParams) {
    __fillInDefaultArgs(params);
    __fillInDefaultButtonArgs(params);
    let restrict = params.teamId ?? params.playerId;
    if (restrict) {
        mod.AddUIButton(
            __cUniqueName,
            __asModVector(params.position),
            __asModVector(params.size),
            params.anchor,
            params.parent,
            params.visible,
            params.padding,
            __asModVector(params.bgColor),
            params.bgAlpha,
            params.bgFill,
            params.buttonEnabled,
            __asModVector(params.buttonColorBase),
            params.buttonAlphaBase,
            __asModVector(params.buttonColorDisabled),
            params.buttonAlphaDisabled,
            __asModVector(params.buttonColorPressed),
            params.buttonAlphaPressed,
            __asModVector(params.buttonColorHover),
            params.buttonAlphaHover,
            __asModVector(params.buttonColorFocused),
            params.buttonAlphaFocused,
            restrict
        );
    } else {
        mod.AddUIButton(
            __cUniqueName,
            __asModVector(params.position),
            __asModVector(params.size),
            params.anchor,
            params.parent,
            params.visible,
            params.padding,
            __asModVector(params.bgColor),
            params.bgAlpha,
            params.bgFill,
            params.buttonEnabled,
            __asModVector(params.buttonColorBase),
            params.buttonAlphaBase,
            __asModVector(params.buttonColorDisabled),
            params.buttonAlphaDisabled,
            __asModVector(params.buttonColorPressed),
            params.buttonAlphaPressed,
            __asModVector(params.buttonColorHover),
            params.buttonAlphaHover,
            __asModVector(params.buttonColorFocused),
            params.buttonAlphaFocused
        );
    }
    return __setNameAndGetWidget(__cUniqueName, params);
}

function __addUIWidget(params: UIParams) {
    if (params == null) return undefined;
    if (params.type == 'Container') return __addUIContainer(params);
    else if (params.type == 'Text') return __addUIText(params);
    else if (params.type == 'Image') return __addUIImage(params);
    else if (params.type == 'Button') return __addUIButton(params);
    return undefined;
}

export function ParseUI(...params: any[]) {
    let widget: mod.UIWidget | undefined;
    for (let a = 0; a < params.length; a++) {
        widget = __addUIWidget(params[a] as UIParams);
    }
    return widget;
}

export function DisplayCustomNotificationMessage(msg: mod.Message, custom: mod.CustomNotificationSlots, duration: number, target?: mod.Player | mod.Team) {
    const CreateHeader = async (widgetId: string, msg: mod.Message, targetPlayer: mod.Player, slot: number) => {
        mod.AddUIText(
            widgetId,
            mod.CreateVector(50, 250 + slot * (40 + 5), 0),
            mod.CreateVector(250, 60, 0),
            mod.UIAnchor.TopRight,
            mod.GetUIRoot(),
            true,
            8,
            mod.CreateVector(1, 1, 1),
            1,
            mod.UIBgFill.Blur,
            msg,
            30,
            mod.CreateVector(1, 1, 1),
            1,
            mod.UIAnchor.Center,
            targetPlayer
        );
        if (duration > 0) {
            await mod.Wait(duration);
            mod.DeleteUIWidget(mod.FindUIWidgetWithName(widgetId));
        }
    };
    const CreateSubText = async (widgetId: string, msg: mod.Message, targetPlayer: mod.Player, slot: number) => {
        mod.AddUIText(
            widgetId,
            mod.CreateVector(85, 270 + slot * (40 + 3), 0),
            mod.CreateVector(125, 40, 0),
            mod.UIAnchor.TopRight,
            mod.GetUIRoot(),
            true,
            8,
            mod.CreateVector(1, 1, 1),
            1,
            mod.UIBgFill.Blur,
            msg,
            20,
            mod.CreateVector(1, 1, 1),
            1,
            mod.UIAnchor.Center,
            targetPlayer
        );
        if (duration > 0) {
            await mod.Wait(duration);
            mod.DeleteUIWidget(mod.FindUIWidgetWithName(widgetId));
        }
    };
    const createNotificationFunction = custom < 1 ? CreateHeader : CreateSubText;

    if (target) {
        // if target is player, fill message in their slot
        if (mod.IsType(target, mod.Types.Player)) {
            const widgetId = custom + String(target);
            createNotificationFunction(widgetId, msg, target as mod.Player, custom);
        }
        // if target is team, fill message in slot for all players on team
        else if (mod.IsType(target, mod.Types.Team)) {
            const teamMates = getPlayersInTeam(target as mod.Team);
            teamMates.forEach((player) => {
                const widgetId = custom + String(player);
                createNotificationFunction(widgetId, msg, player, custom);
            });
        }
    } else {
        const allPlayers = mod.AllPlayers();
        const n = mod.CountOf(allPlayers);
        for (let i = 0; i < n; i++) {
            let player = mod.ValueInArray(allPlayers, i) as mod.Player;
            const widgetId = custom + String(player);
            createNotificationFunction(widgetId, msg, player, custom);
        }
    }
}

export function ShowEventGameModeMessage(event: mod.Message, target?: mod.Player | mod.Team) {
    //TODO: restore these once DisplayGameModeMessage is fixed
    // if (target) {
    //     mod.DisplayGameModeMessage(event, target as mod.Player );
    // } else{
    //     mod.DisplayGameModeMessage(event);
    // }

    const MakeShiftDisplayGameModeMessage = async (message: mod.Message, target?: mod.Player | mod.Team) => {
        const widgetId = 'GameModeMessage';
        if (target) {
            mod.AddUIText(
                widgetId,
                mod.CreateVector(0, 0, 0),
                mod.CreateVector(2500, 80, 0),
                mod.UIAnchor.TopCenter,
                mod.GetUIRoot(),
                true,
                8,
                mod.CreateVector(1, 1, 1),
                1,
                mod.UIBgFill.Blur,
                message,
                30,
                mod.CreateVector(1, 1, 1),
                1,
                mod.UIAnchor.Center,
                target as mod.Player
            );
        } else {
            mod.AddUIText(
                widgetId,
                mod.CreateVector(0, 0, 0),
                mod.CreateVector(2500, 80, 0),
                mod.UIAnchor.TopCenter,
                mod.GetUIRoot(),
                true,
                8,
                mod.CreateVector(1, 1, 1),
                1,
                mod.UIBgFill.Blur,
                message,
                30,
                mod.CreateVector(1, 1, 1),
                1,
                mod.UIAnchor.Center
            );
        }

        await mod.Wait(6);
        mod.DeleteUIWidget(mod.FindUIWidgetWithName(widgetId));
    };

    if (target) {
        MakeShiftDisplayGameModeMessage(event, target as mod.Player);
    } else {
        MakeShiftDisplayGameModeMessage(event);
    }
}

export function ShowHighlightedGameModeMessage(event: mod.Message, target?: mod.Player | mod.Team) {
    if (target) {
        mod.DisplayHighlightedWorldLogMessage(event, target as mod.Player);
    } else {
        mod.DisplayHighlightedWorldLogMessage(event);
    }
}

export function ShowNotificationMessage(msg: mod.Message, target?: mod.Player | mod.Team) {
    if (target) {
        mod.DisplayNotificationMessage(msg, target as mod.Player);
    } else {
        mod.DisplayNotificationMessage(msg);
    }
}

export function ClearAllCustomNotificationMessages(target: mod.Player) {
    try {
        ClearCustomNotificationMessage(mod.CustomNotificationSlots.HeaderText, target);
    } catch {}
    try {
        ClearCustomNotificationMessage(mod.CustomNotificationSlots.MessageText1, target);
    } catch {}
    try {
        ClearCustomNotificationMessage(mod.CustomNotificationSlots.MessageText2, target);
    } catch {}
    try {
        ClearCustomNotificationMessage(mod.CustomNotificationSlots.MessageText3, target);
    } catch {}
    try {
        ClearCustomNotificationMessage(mod.CustomNotificationSlots.MessageText4, target);
    } catch {}
}

export function ClearCustomNotificationMessage(custom: mod.CustomNotificationSlots, target?: mod.Player | mod.Team) {
    try {
        if (target) {
            // if target is player, just delete message in their slot
            if (mod.IsType(target, mod.Types.Player)) {
                mod.DeleteUIWidget(mod.FindUIWidgetWithName(custom + String(target as mod.Player)));
            }
            // if target is team, delete message in slot for all players on team
            else if (mod.IsType(target, mod.Types.Team)) {
                const teamMembers = getPlayersInTeam(target as mod.Team);
                for (let i = 0; i < teamMembers.length; i++) {
                    let player = teamMembers[i];
                    mod.DeleteUIWidget(mod.FindUIWidgetWithName(custom + String(player)));
                }
            }
        } else {
            // if no target, delete for all players
            const allPlayers = mod.AllPlayers();
            const n = mod.CountOf(allPlayers);
            for (let i = 0; i < n; i++) {
                let player = mod.ValueInArray(allPlayers, i) as mod.Player;
                mod.DeleteUIWidget(mod.FindUIWidgetWithName(custom + String(player)));
            }
        }
    } catch {
        console.log('Could not clear custom message for specified target(s)');
    }
}


// --- SOURCE: src\king-of-the-hill-mode\utils\mod-compat.ts ---


type ParseUiNode = {
    name: string;
    type: 'Container' | 'Text';
    position?: [number, number] | [number, number, number];
    size?: [number, number] | [number, number, number];
    anchor?: mod.UIAnchor;
    visible?: boolean;
    padding?: number;
    bgColor?: [number, number, number];
    bgAlpha?: number;
    bgFill?: mod.UIBgFill;
    textLabel?: mod.Message | string | number;
    textColor?: [number, number, number];
    textAlpha?: number;
    textSize?: number;
    textAnchor?: mod.UIAnchor;
    parent?: mod.UIWidget;
    playerId?: mod.Player | mod.Team;
    children?: ParseUiNode[];
};

type VendorParseUiNode = Omit<ParseUiNode, 'playerId' | 'children'> & {
    playerId?: mod.Player;
    teamId?: mod.Team;
    children?: VendorParseUiNode[];
};

function normalizeParseUiNode(node: ParseUiNode): VendorParseUiNode {
    const { children, playerId: receiver, ...rest } = node;
    const normalizedNode: VendorParseUiNode = { ...rest };

    if (receiver) {
        if (mod.IsType(receiver, mod.Types.Team)) {
            normalizedNode.teamId = receiver as mod.Team;
        } else {
            normalizedNode.playerId = receiver as mod.Player;
        }
    }

    if (children) {
        normalizedNode.children = children.map((child) => normalizeParseUiNode(child));
    }

    return normalizedNode;
}

function parseUiNode(node: ParseUiNode, parent?: mod.UIWidget): mod.UIWidget {
    const normalizedNode = normalizeParseUiNode({
        ...node,
        ...(parent ? { parent } : {}),
    });

    return ParseUI(normalizedNode) as mod.UIWidget;
}

export function equals(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (a == null || b == null) return false;
    return Equals(a, b);
}

function compatGetPlayerId(player: mod.Player): number {
    return getPlayerId(player);
}

function compatGetTeamId(team: mod.Team): number {
    if (mod.Equals(team, mod.GetTeam(1))) return 1;
    if (mod.Equals(team, mod.GetTeam(2))) return 2;
    return 0;
}

export function showHighlightedGameModeMessage(message: mod.Message, receiver?: mod.Player | mod.Team): void {
    ShowHighlightedGameModeMessage(message, receiver);
}

export const modlib = {
    Equals: equals,
    getPlayerId: compatGetPlayerId,
    getTeamId: compatGetTeamId,
    ParseUI: parseUiNode,
    ShowHighlightedGameModeMessage: showHighlightedGameModeMessage,
};


// --- SOURCE: src\king-of-the-hill-mode\services\koth-kernel.ts ---
﻿/* =================================================================================================
   Mind Flexor - King of the Hill Phase Runtime
   -------------------------------------------------------------------------------------------------
   

   Description:
     - Preserves the prematch, ready-up, prelive, and postmatch phase runtime:
         * Prematch ready-up flow (team switch + ready interactions)
         * Countdown -> Pre-live -> Live -> Postmatch state machine
         * Ticket system with bleed for 2/3 flag control + death ticket loss (after first live deploy)
         * Capture UI (flag letters, on-point counts, progress bar) + remaining time + postmatch overlay
         * Dynamic HQ routing based on owned uncontested flags + furthest-safe fallback
         * Safe-spawn recycling (enemy proximity check) with squad-spawn bypass probing
         * Capture audio (ticks, contested VO, captured stingers) + countdown heartbeat + match start stinger
         * Optional damage zone (AreaTrigger -> periodic damage)

   Usage / Notes:
     - This script assumes specific CapturePoint IDs, HQ IDs, InteractPoint IDs, WorldIcon IDs,
       and Godot PlayerSpawner ObjIds already placed in your level.
     - Keep IDs in sync with your map placement.

   Credits:
     - Enoc Bernal / mindflexor: King of the Hill mode and project integration.
     - BattlefieldDad, Mancour, uberdubersoldat, and dfk_7677: legacy logic inspiration.
     - Mike De Luca: BF6 Portal TypeScript template and utility tooling foundation.

   License:
     - See the repository MIT license.

   Version:
     - v3.5.5
================================================================================================= */










/* =================================================================================================
   1) CORE CONFIGURATION
================================================================================================= */

const VERSION = [1, 4, 4];

const TICK_RATE = RULES.tickRate;                    // OngoingGlobal is treated as 30 ticks/sec

// Performance throttles (reduce per-tick work to avoid server Hz drops)
const LIVE_FAST_UPDATE_INTERVAL_TICKS = mod.Max(1, mod.Floor((RULES.timerLanes.liveFastMs / 1000) * TICK_RATE)); // ~10 Hz
const LIVE_SLOW_UPDATE_INTERVAL_TICKS = mod.Max(1, mod.Floor((RULES.timerLanes.liveSlowMs / 1000) * TICK_RATE));  // ~3.3 Hz
const LIVE_ENDGAME_AUDIO_INTERVAL_TICKS = mod.Max(1, mod.Floor((RULES.timerLanes.endgameAudioMs / 1000) * TICK_RATE)); // ~2 Hz
const LIVE_CAPTURE_WATCHDOG_INTERVAL_TICKS = TICK_RATE;
const LIVE_UI_CLOCK_INTERVAL_TICKS = mod.Max(1, mod.Floor((RULES.timerLanes.uiClockMs / 1000) * TICK_RATE));
const INITIAL_TICKETS = RULES.gameplay.initialTickets;

const ROUND_TIME = RULES.roundTimeSeconds;                // seconds
const TOTAL_TICKS = ROUND_TIME * TICK_RATE;

const COUNT_DOWN_TIME = RULES.countdownTimeSeconds;              // legacy countdown seconds (not used by prematch all-ready)
const PRELIVE_TIME = RULES.preliveTimeSeconds;                // seconds (pre-live freeze)
const POSTMATCH_TIME = RULES.postmatchTimeSeconds;              // seconds

const REDEPLOY_TIME = RULES.redeployTimeSeconds;               // live redeploy time
const DEATH_TICKET_LOSS = RULES.gameplay.deathTicketLoss;           // tickets after first live deploy

const BLEED_TWO_FLAGS = RULES.gameplay.bleedPerSecond.twoFlags;           // per second
const BLEED_THREE_FLAGS = RULES.gameplay.bleedPerSecond.threeFlags;           // per second
const BLEED_ONE_FLAG = RULES.gameplay.bleedPerSecond.oneFlag;

// Damage smoothing (applies in OnPlayerDamaged)
const ENABLE_DAMAGE_SMOOTHING = RULES.gameplay.damage.enableSmoothing;   // set to false to disable smoothing


const CAPTURE_TIME = RULES.gameplay.capture.captureSeconds;                 // seconds to capture neutral -> owned
const NEUTRALIZE_TIME = RULES.gameplay.capture.neutralizeSeconds;              // seconds to neutralize owned -> neutral
const CAPTURE_MULTIPLIER_FOR_2_PLAYERS = RULES.gameplay.capture.twoPlayerMultiplier;     // 2 players => 2x speed => time / 2
const CAPTURE_MULTIPLIER_MAX = RULES.gameplay.capture.maxMultiplier;               // cap it (keep BF4-ish, avoids insane speeds)
const CAPTURE_PROGRESS_DELTA_EPSILON = 0.0001;
type CaptureProgressMotionMode = -1 | 0 | 1;

type RgbColor = [number, number, number];

const COLOR_NEUTRAL_RGB: RgbColor = [...KOTH_KERNEL_UI_COLOR_RGB.neutral];
const COLOR_FRIENDLY_RGB: RgbColor = [...KOTH_KERNEL_UI_COLOR_RGB.friendly];
const COLOR_ENEMY_RGB: RgbColor = [...KOTH_KERNEL_UI_COLOR_RGB.enemy];

const COLOR_NEUTRAL = KOTH_KERNEL_UI_COLORS.neutral;
const COLOR_FRIENDLY = KOTH_KERNEL_UI_COLORS.friendly;
const COLOR_ENEMY = KOTH_KERNEL_UI_COLORS.enemy;
/* Capture progress float tolerances */
const PROGRESS_EPSILON = RULES.gameplay.capture.progressEpsilon;
const PROGRESS_FULL = 1 - PROGRESS_EPSILON;
const PROGRESS_EMPTY = PROGRESS_EPSILON;

/* =================================================================================================
   2) TEAM / PHASE STATE
================================================================================================= */

const teamNeutral: mod.Team = mod.GetTeam(0);
const team1: mod.Team = mod.GetTeam(1);
const team2: mod.Team = mod.GetTeam(2);

let kernelKothLiveOverrideEnabled = false;
const RESERVED_SPAWN_POINT_ID = 0;

export function setKernelKothLiveOverrideEnabled(enabled: boolean): void {
  kernelKothLiveOverrideEnabled = enabled;
  if (enabled) {
    SafeSetWidgetVisibleByName("CountDownContainer", false);
    SafeSetWidgetVisibleByName("PreMatchContainer", false);
    SafeSetWidgetVisibleByName("LiveContainer", false);
    setLiveHudVisibleForAllPlayers(false);
  }
}

function isExcludedPlayer(_player: mod.Player): boolean {
  return false;
}

function isParticipantPlayer(player: mod.Player): boolean {
  if (!mod.IsPlayerValid(player)) return false;
  if (isExcludedPlayer(player)) return false;

  const team = mod.GetTeam(player);

  return mod.Equals(team, team1) || mod.Equals(team, team2);
}

/*
  Game status:
    -1: not started
     0: prematch
     1: legacy countdown
     2: pre-live
     3: live
     4: postmatch
*/
let gameStatus: number = -1;

let gameModeStarted: boolean = false;

let serverTickCount: number = 0;
let phaseTickCount: number = 0;
let countDown: number = COUNT_DOWN_TIME;
let lastTicketBleedTimeElapsed = 0;

let initialization: boolean[] = [false, false, false, false, false];

/* Tickets are stored as [team1Tickets, team2Tickets] */
let serverScores: number[] = [INITIAL_TICKETS, INITIAL_TICKETS];
let lastSyncedGameModeScores: [number, number] | null = null;
let scoreboardDirty = true;
let liveHudScoresDirty = true;
let captureTickLoopsDirty = true;
let endgameSuspenseDirty = true;
let liveHudTopFlagsDirty = true;
let liveHudTopFlagDirtyBySymbol: { [symbol: string]: boolean } = { A: true, B: true, C: true };
let liveHudTopFlagBlinkNeutralPhase = false;
let liveHudTopFlagBlinkIntervalHandle: number | undefined = undefined;
let liveHudPulseIntervalHandle: number | undefined = undefined;

let capturePointReconcileFlushes = 0;
let captureLoopDirtyFlushes = 0;
let scoreboardDirtyFlushes = 0;
let liveHudScoreDirtyFlushes = 0;
let endgameAudioFlushes = 0;

function syncDisplayedGameModeScores(force: boolean = false): void {
  const team1Score = mod.Ceiling(serverScores[0]);
  const team2Score = mod.Ceiling(serverScores[1]);

  if (!force && lastSyncedGameModeScores !== null) {
    if (lastSyncedGameModeScores[0] === team1Score && lastSyncedGameModeScores[1] === team2Score) {
      return;
    }
  }

  mod.SetGameModeScore(team1, team1Score);
  mod.SetGameModeScore(team2, team2Score);
  lastSyncedGameModeScores = [team1Score, team2Score];
}

function markScoreboardDirty(): void {
  scoreboardDirty = true;
}

function markLiveHudScoresDirty(): void {
  liveHudScoresDirty = true;
}

function markCaptureTickLoopsDirty(): void {
  captureTickLoopsDirty = true;
}

function markEndgameSuspenseDirty(): void {
  endgameSuspenseDirty = true;
}

function markLiveHudTopFlagLaneDirty(symbol: "A" | "B" | "C"): void {
  liveHudTopFlagsDirty = true;
  liveHudTopFlagDirtyBySymbol[symbol] = true;
}

function markLiveHudTopFlagsDirtyAll(): void {
  liveHudTopFlagsDirty = true;
  liveHudTopFlagDirtyBySymbol.A = true;
  liveHudTopFlagDirtyBySymbol.B = true;
  liveHudTopFlagDirtyBySymbol.C = true;
}

const POSTMATCH_END_STEP_IDLE = 0;
const POSTMATCH_END_STEP_UNDEPLOY_ALL_PLAYERS = 1;
const POSTMATCH_END_STEP_END_GAMEMODE = 2;
const POSTMATCH_END_STEP_COMPLETE = 3;

let postmatchEndStep = 0;
let postmatchEndStepTick = 0;
let postmatchWinnerTeam: mod.Team = teamNeutral;

// Advance undeploy -> endgame one tick at a time so the engine commits each state.
const POSTMATCH_END_STEP_ADVANCE_TICKS = 1;

const PREMATCH_SWITCH_DEBOUNCE_TICKS = 6;
const PRELIVE_TEAM_SWITCH_STABILIZE_TICKS = 10;
let prematchSwitchLastHandledTickByPlayerId: { [playerId: number]: number } = {};
let prematchSwitchDebounceWarnedByPlayerId: { [playerId: number]: boolean } = {};
let lastPrematchTeamSwitchTick = -999999;
let lastPrematchTeamSwitchTickByPlayerId: { [playerId: number]: number } = {};
let prematchStabilizationGateWarnedBySwitchTick: { [switchTick: string]: boolean } = {};
let hqEnableWarnedById: { [hqId: number]: boolean } = {};
let prematchUiGuardWarnedByKey: { [key: string]: boolean } = {};
let prematchHqMapValidationWarnedByKey: { [key: string]: boolean } = {};
let transitionRecoveryWarnedByKey: { [key: string]: boolean } = {};
let capturePointBootstrapContractWarnedById: { [capturePointId: number]: boolean } = {};
let objectiveHighlightWarnedMissingKeyByContext: { [context: string]: boolean } = {};
let objectiveHighlightWarnedMissingSymbolByContext: { [context: string]: boolean } = {};
let objectiveHighlightWarnedBuildFailureByContext: { [context: string]: boolean } = {};
let objectiveHighlightUseLiteralFallback: boolean = false;
let objectiveHighlightHealthChecked: boolean = false;
let objectiveHighlightKeyHealthWarned: boolean = false;
let reservedSpawnIsolationValidated: boolean = false;

const DEBUG_WORLD_LOG_JOIN_EVENTS = false;
const JOIN_WORLD_LOG_THROTTLE_TICKS = 5 * TICK_RATE;
const DEBUG_OBJECTIVE_STRINGKEY_DIAG = false;
const DEBUG_LIVE_PERFORMANCE_DIAGNOSTICS = RULES.debug.livePerformanceDiagnostics;

let joinWorldLogLastTickByPlayerId: { [playerId: number]: number } = {};

let prematchHealthInside889ByPlayerId: { [playerId: number]: boolean } = {};
let prematchHealthAppliedMaxByPlayerId: { [playerId: number]: number } = {};


/* =================================================================================================
   3) WORLD IDS (HQ / CAPTURE POINTS / INTERACT / ICONS / DAMAGE ZONE)
================================================================================================= */

/* Initial HQs (prematch + countdown + prelive) */
const TEAM1_INITIAL_HQ = WORLD_IDS.hq.team1Initial;
const TEAM2_INITIAL_HQ = WORLD_IDS.hq.team2Initial;

/* Prematch ready-up HQs */
const TEAM1_READYUP_HQ = WORLD_IDS.hq.team1Readyup;
const TEAM2_READYUP_HQ = WORLD_IDS.hq.team2Readyup;
let resolvedPrematchHqTeam1Id: number = TEAM1_READYUP_HQ;
let resolvedPrematchHqTeam2Id: number = TEAM2_READYUP_HQ;
let prematchHqFallbackActive = false;

/* Legacy live HQs (disabled during live routing) */
const TEAM1_LIVE_HQ = WORLD_IDS.hq.team1Live;
const TEAM2_LIVE_HQ = WORLD_IDS.hq.team2Live;

/* Per-flag HQs */
const TEAM1_FLAG_A_HQ = WORLD_IDS.hq.team1RouteByKey.A;
const TEAM1_FLAG_B_HQ = WORLD_IDS.hq.team1RouteByKey.B;
const TEAM1_FLAG_C_HQ = WORLD_IDS.hq.team1RouteByKey.C;

const TEAM2_FLAG_A_HQ = WORLD_IDS.hq.team2RouteByKey.A;
const TEAM2_FLAG_B_HQ = WORLD_IDS.hq.team2RouteByKey.B;
const TEAM2_FLAG_C_HQ = WORLD_IDS.hq.team2RouteByKey.C;

/* Two-flag combos */
const TEAM1_AB_HQ = WORLD_IDS.hq.team1RouteByKey.AB;
const TEAM1_AC_HQ = WORLD_IDS.hq.team1RouteByKey.AC;
const TEAM1_BC_HQ = WORLD_IDS.hq.team1RouteByKey.BC;

const TEAM2_AB_HQ = WORLD_IDS.hq.team2RouteByKey.AB;
const TEAM2_AC_HQ = WORLD_IDS.hq.team2RouteByKey.AC;
const TEAM2_BC_HQ = WORLD_IDS.hq.team2RouteByKey.BC;

/* All three flags */
const TEAM1_ABC_HQ = WORLD_IDS.hq.team1RouteByKey.ABC;
const TEAM2_ABC_HQ = WORLD_IDS.hq.team2RouteByKey.ABC;

/* No flags */
const TEAM1_NO_FLAG_HQ = WORLD_IDS.hq.team1RouteByKey.NO;
const TEAM2_NO_FLAG_HQ = WORLD_IDS.hq.team2RouteByKey.NO;

/* CapturePoint IDs */
const CP_A_ID = WORLD_IDS.capturePoints.a;
const CP_B_ID = WORLD_IDS.capturePoints.b;
const CP_C_ID = WORLD_IDS.capturePoints.c;
const EXPECTED_ROUTING_CP_A_ID = 201;
const EXPECTED_ROUTING_CP_C_ID = 203;

/* Prematch InteractPoints (switch team + ready) */
const IP_T1_SWITCH = WORLD_IDS.interactPoints.team1Switch;
const IP_T1_READY = WORLD_IDS.interactPoints.team1Ready;
const IP_T2_SWITCH = WORLD_IDS.interactPoints.team2Switch;
const IP_T2_READY = WORLD_IDS.interactPoints.team2Ready;

/* Reserved live InteractPoint */

/* Prematch WorldIcons */
const WORLDICON_T1_SWITCH = WORLD_IDS.worldIcons.team1Switch;
const WORLDICON_T1_READY = WORLD_IDS.worldIcons.team1Ready;
const WORLDICON_T2_SWITCH = WORLD_IDS.worldIcons.team2Switch;
const WORLDICON_T2_READY = WORLD_IDS.worldIcons.team2Ready;

/* Damage zone AreaTrigger */
const DAMAGE_TRIGGER_ID = WORLD_IDS.areaTriggers.damage;
const RESTRICTED_AREA_TRIGGER = WORLD_IDS.areaTriggers.restricted;
const TEAM1_HQ_PROTECTION_TRIGGER_ID = WORLD_IDS.areaTriggers.team1HqProtection;
const TEAM2_HQ_PROTECTION_TRIGGER_ID = WORLD_IDS.areaTriggers.team2HqProtection;
const PREMATCH_HEALTH_AREA_TRIGGER_ID = WORLD_IDS.areaTriggers.prematchHealth;
const PREMATCH_TEAM1_KILL_TRIGGER_ID = WORLD_IDS.areaTriggers.prematchTeam1Kill;
const PREMATCH_TEAM2_KILL_TRIGGER_ID = WORLD_IDS.areaTriggers.prematchTeam2Kill;
const PREMATCH_HEALTH_NORMAL_MAX = 100;
const PREMATCH_HEALTH_OUTSIDE_MAX = 100;
const PREMATCH_HEALTH_FULL_HEAL_AMOUNT = 9999;

const DAMAGE_PER_PULSE = RULES.gameplay.damage.restrictedPulseDamage;
const DAMAGE_INTERVAL_SECONDS = RULES.gameplay.damage.restrictedPulseIntervalSeconds;
const DAMAGE_INTERVAL_TICKS_RAW = mod.Floor(DAMAGE_INTERVAL_SECONDS * TICK_RATE);
const DAMAGE_INTERVAL_TICKS = DAMAGE_INTERVAL_TICKS_RAW < 1 ? 1 : DAMAGE_INTERVAL_TICKS_RAW;

/* Fire VFX enabled at match start */
const FIRE_IDS = WORLD_IDS.fireVfxIds;
const fireVfx: mod.VFX[] = FIRE_IDS.map((id) => mod.GetVFX(id));


/* =================================================================================================
   4) DYNAMIC ROUTING + SAFE SPAWN (GODOT PLAYERSPAWNERS)
================================================================================================= */

type DynamicRouteKey = "A" | "B" | "C" | "AB" | "AC" | "BC" | "ABC" | "NO";

/*
  Godot PlayerSpawner ObjId mapping.
  Fill arrays with the ObjIds you placed in Godot.
*/
const TEAM1_SPAWNERS_BY_ROUTE: Record<DynamicRouteKey, number[]> = {
  A: WORLD_IDS.dynamicSpawnersByRoute.team1.A,
  B: WORLD_IDS.dynamicSpawnersByRoute.team1.B,
  C: WORLD_IDS.dynamicSpawnersByRoute.team1.C,
  AB: WORLD_IDS.dynamicSpawnersByRoute.team1.AB,
  AC: WORLD_IDS.dynamicSpawnersByRoute.team1.AC,
  BC: WORLD_IDS.dynamicSpawnersByRoute.team1.BC,
  ABC: WORLD_IDS.dynamicSpawnersByRoute.team1.ABC,
  NO: WORLD_IDS.dynamicSpawnersByRoute.team1.NO,
};

const TEAM2_SPAWNERS_BY_ROUTE: Record<DynamicRouteKey, number[]> = {
  A: WORLD_IDS.dynamicSpawnersByRoute.team2.A,
  B: WORLD_IDS.dynamicSpawnersByRoute.team2.B,
  C: WORLD_IDS.dynamicSpawnersByRoute.team2.C,
  AB: WORLD_IDS.dynamicSpawnersByRoute.team2.AB,
  AC: WORLD_IDS.dynamicSpawnersByRoute.team2.AC,
  BC: WORLD_IDS.dynamicSpawnersByRoute.team2.BC,
  ABC: WORLD_IDS.dynamicSpawnersByRoute.team2.ABC,
  NO: WORLD_IDS.dynamicSpawnersByRoute.team2.NO,
};

/* Current HQ routing for each team (safe-spawn and spawn routing use this) */
let currentDynamicHqTeam1: number = TEAM1_INITIAL_HQ;
let currentDynamicHqTeam2: number = TEAM2_INITIAL_HQ;

/* Player routing + safe-spawn state */
let lastDynamicHqForPlayer: { [playerId: number]: number } = {};
// Pending route chosen at deploy time; only committed after a successful safe-spawn check.
let pendingDynamicHqForPlayer: { [playerId: number]: number | undefined } = {};
let safeSpawnSpawnerIndex: { [playerId: number]: number } = {};


let safeSpawnUnsafePending: { [playerId: number]: boolean } = {};
let safeSpawnUnsafeSpawnerObjId: { [playerId: number]: number } = {};
let safeSpawnForcedRedeploys: { [playerId: number]: number } = {};
let safeSpawnPendingCheck: { [playerId: number]: boolean } = {};
let safeSpawnForcedUndeploy: { [playerId: number]: boolean } = {};
let safeSpawnSkipNextSafetyCheck: { [playerId: number]: boolean } = {};
let safeSpawnGenerationByPlayerId: { [playerId: number]: number } = {};
let safeSpawnCheckQueuedGenerationByPlayerId: { [playerId: number]: number | undefined } = {};
let safeSpawnForcedQueuedGenerationByPlayerId: { [playerId: number]: number | undefined } = {};
let squadSpawnBypassClearTimerByPlayerId: { [playerId: number]: number | undefined } = {};

/* HQ DESYNC FIX: detect "spawned at HQ spawner object origin" and recycle spawn */
let hqDesyncForcedRedeploys: { [playerId: number]: number } = {};

const HQ_DESYNC_SPAWNER_EPSILON_METERS = RULES.gameplay.safeSpawn.hqDesyncEpsilonMeters; // treat "0 meters" as <= this threshold (float-safe)
const HQ_DESYNC_MAX_FORCED_REDEPLOYS = RULES.gameplay.safeSpawn.hqDesyncMaxForcedRedeploys;     // safety: prevent infinite loops
const HQ_DESYNC_CHECK_ENABLED = RULES.gameplay.safeSpawn.hqDesyncCheckEnabled;


/* Safe spawn tuning */
const SAFE_SPAWN_CHECK_DELAY_SECONDS = RULES.gameplay.safeSpawn.checkDelaySeconds;
const SAFE_SPAWN_CHECK_DELAY_TICKS = mod.Max(1, mod.Ceiling(SAFE_SPAWN_CHECK_DELAY_SECONDS * TICK_RATE));
const SAFE_SPAWN_CHECK_QUEUE_BUDGET_PER_TICK = RULES.gameplay.safeSpawn.checkQueueBudgetPerTick;
const SAFE_SPAWN_FORCED_QUEUE_BUDGET_PER_TICK = RULES.gameplay.safeSpawn.forcedSpawnQueueBudgetPerTick;
const SAFE_SPAWN_FORCED_SPAWN_DELAY_TICKS = mod.Max(
  1,
  mod.Ceiling(RULES.gameplay.safeSpawn.forcedSpawnDelaySeconds * TICK_RATE)
);

// Radius schedule: 25m down to 8m by the 5th attempt.
const SAFE_SPAWN_RADIUS_START_METERS = RULES.gameplay.safeSpawn.radiusStartMeters;
const SAFE_SPAWN_RADIUS_END_METERS   = RULES.gameplay.safeSpawn.radiusEndMeters;

// Unsafe attempts allowed before forcing a furthest-safe single-flag fallback route.
const SAFE_SPAWN_MAX_FORCED_REDEPLOYS = RULES.gameplay.safeSpawn.maxForcedRedeploys;

// How many attempts to reach END radius (attempt 1..5 => used 0..4)
const SAFE_SPAWN_RADIUS_REACH_END_USED = RULES.gameplay.safeSpawn.radiusReachEndUsed; // used=4 corresponds to attempt 5
const CAPTURE_POINT_THREAT_RADIUS_REFERENCE_DISTANCE_METERS =
  RULES.gameplay.safeSpawn.capturePointThreatRadius.referenceDistanceMeters;
const CAPTURE_POINT_THREAT_RADIUS_REFERENCE_RADIUS_METERS =
  RULES.gameplay.safeSpawn.capturePointThreatRadius.referenceRadiusMeters;
const CAPTURE_POINT_THREAT_RADIUS_MIN_METERS =
  RULES.gameplay.safeSpawn.capturePointThreatRadius.minMeters;
const CAPTURE_POINT_THREAT_RADIUS_MAX_METERS =
  RULES.gameplay.safeSpawn.capturePointThreatRadius.maxMeters;
const LIVE_ROUTE_SWITCH_MARGIN_METERS = RULES.gameplay.safeSpawn.liveRouteSwitchMarginMeters;
const SPATIAL_HASH_CELL_SIZE_METERS = RULES.gameplay.spatialHash.cellSizeMeters;
type SingleFlagRouteKey = "A" | "B" | "C";
const SINGLE_FLAG_ROUTE_KEYS: SingleFlagRouteKey[] = ["A", "C", "B"];

type SafeSpawnCheckReason = "deploy";
type SafeSpawnCheckQueueItem = {
  playerId: number;
  generation: number;
  dueTick: number;
  enqueuedTick: number;
  reason: SafeSpawnCheckReason;
};
type ForcedSafeSpawnStage = "undeploy" | "spawn";
type ForcedSafeSpawnQueueItem = {
  playerId: number;
  generation: number;
  spawnerObjId: number;
  routeKey: SingleFlagRouteKey | null;
  hqId: number;
  stage: ForcedSafeSpawnStage;
  dueTick: number;
  enqueuedTick: number;
  waitTicks: number;
};
type LiveSafeSpawnDiagnostics = {
  checkQueueDepth: number;
  forcedSpawnQueueDepth: number;
  checksProcessed: number;
  forcedSpawnsProcessed: number;
  routeCacheRebuilds: number;
  spatialHashRebuilds: number;
  maxQueueAgeTicks: number;
};

let safeSpawnCheckQueue: SafeSpawnCheckQueueItem[] = [];
let safeSpawnForcedQueue: ForcedSafeSpawnQueueItem[] = [];
let liveSafeSpawnDiagnostics: LiveSafeSpawnDiagnostics = {
  checkQueueDepth: 0,
  forcedSpawnQueueDepth: 0,
  checksProcessed: 0,
  forcedSpawnsProcessed: 0,
  routeCacheRebuilds: 0,
  spatialHashRebuilds: 0,
  maxQueueAgeTicks: 0,
};
let lastLivePerformanceDiagnosticsTick = -999999;

type SingleFlagRouteThreatEval = {
  routeKey: SingleFlagRouteKey;
  owner: mod.Team;
  contested: boolean;
  captureProgress: number;
  capturingTeam: mod.Team;
  friendlyOnPointCount: number;
  enemyOnPointCount: number;
  enemyCountWithinThreatRadius: number;
  hasEnemyWithinThreatRadius: boolean;
  nearestEnemyDistanceToCapturePoint: number;
  enemyCapturingOrNeutralizing: boolean;
  directPressure: boolean;
};

type LiveFlankPressureSnapshot = {
  defaultRouteKey: SingleFlagRouteKey | null;
  chosenRouteKey: SingleFlagRouteKey | null;
  aEnemyCount: number;
  cEnemyCount: number;
  recordedAtTick: number;
};

/* Squad-spawn bypass state */
const SQUAD_SPAWN_DISTANCE = RULES.gameplay.safeSpawn.squadSpawnDistanceMeters;
const SQUAD_SPAWN_BYPASS_LIFETIME_SECONDS = RULES.gameplay.safeSpawn.squadBypassLifetimeSeconds;

let squadSpawnBypass: { [playerId: number]: boolean } = {};
let lastLiveFlankPressureByPlayerId: { [playerId: number]: LiveFlankPressureSnapshot | undefined } = {};
let lastLiveFlankRouteByTeamId: { [teamId: number]: "A" | "C" | undefined } = {};

type SpatialPlayerEntry = {
  id: number;
  player: mod.Player;
  team: mod.Team;
  squad: mod.Squad;
  position: mod.Vector;
};

let livePlayerSpatialHashTick = -999999;
let livePlayerSpatialHashEntries: SpatialPlayerEntry[] = [];
let livePlayerSpatialHashCells: { [cellKey: string]: SpatialPlayerEntry[] } = {};

function getSpatialHashCellSizeMeters(): number {
  const configured = SPATIAL_HASH_CELL_SIZE_METERS;
  if (!Number.isFinite(configured) || configured <= 0) return CAPTURE_POINT_THREAT_RADIUS_MAX_METERS;
  return configured;
}

function getSpatialHashCellCoord(component: number): number {
  return Math.floor(component / getSpatialHashCellSizeMeters());
}

function getSpatialHashCellKey(cellX: number, cellZ: number): string {
  return String(cellX) + ":" + String(cellZ);
}

function getSpatialHashCellKeyFromPosition(position: mod.Vector): string {
  return getSpatialHashCellKey(
    getSpatialHashCellCoord(mod.XComponentOf(position)),
    getSpatialHashCellCoord(mod.ZComponentOf(position))
  );
}

function invalidateLivePlayerSpatialHash(): void {
  livePlayerSpatialHashTick = -999999;
  invalidateSafeRoutePressureCache();
}

function rebuildLivePlayerSpatialHash(): void {
  livePlayerSpatialHashTick = phaseTickCount;
  livePlayerSpatialHashEntries = [];
  livePlayerSpatialHashCells = {};
  liveSafeSpawnDiagnostics.spatialHashRebuilds += 1;

  serverPlayers.forEach((sp) => {
    if (!sp.isDeployed) return;
    if (!mod.IsPlayerValid(sp.player)) return;
    if (!kernelIsPlayerAliveSafe(sp.player)) return;

    const position = getPlayerPosition(sp.player);
    const entry: SpatialPlayerEntry = {
      id: sp.id,
      player: sp.player,
      team: mod.GetTeam(sp.player),
      squad: mod.GetSquad(sp.player),
      position: position,
    };
    const cellKey = getSpatialHashCellKeyFromPosition(position);
    let cellEntries = livePlayerSpatialHashCells[cellKey];
    if (!cellEntries) {
      cellEntries = [];
      livePlayerSpatialHashCells[cellKey] = cellEntries;
    }

    livePlayerSpatialHashEntries.push(entry);
    cellEntries.push(entry);
  });
}

function ensureLivePlayerSpatialHash(): SpatialPlayerEntry[] {
  if (livePlayerSpatialHashTick !== phaseTickCount) {
    rebuildLivePlayerSpatialHash();
  }

  return livePlayerSpatialHashEntries;
}

function getSpatialPlayerEntry(playerId: number): SpatialPlayerEntry | null {
  const entries = ensureLivePlayerSpatialHash();
  for (let i = 0; i < entries.length; i++) {
    if (entries[i].id === playerId) return entries[i];
  }

  return null;
}

function forEachSpatialPlayerNearPosition(
  position: mod.Vector,
  radiusMeters: number,
  callback: (entry: SpatialPlayerEntry) => void
): void {
  ensureLivePlayerSpatialHash();

  const cellSize = getSpatialHashCellSizeMeters();
  const cellRadius = Math.max(0, Math.ceil(radiusMeters / cellSize));
  const centerCellX = getSpatialHashCellCoord(mod.XComponentOf(position));
  const centerCellZ = getSpatialHashCellCoord(mod.ZComponentOf(position));

  for (let x = centerCellX - cellRadius; x <= centerCellX + cellRadius; x++) {
    for (let z = centerCellZ - cellRadius; z <= centerCellZ + cellRadius; z++) {
      const cellEntries = livePlayerSpatialHashCells[getSpatialHashCellKey(x, z)];
      if (!cellEntries) continue;

      for (let i = 0; i < cellEntries.length; i++) {
        callback(cellEntries[i]);
      }
    }
  }
}

function routeKeyFromHqId(hqId: number): DynamicRouteKey {
  // Team 1 routes
  if (hqId === TEAM1_FLAG_A_HQ) return "A";
  if (hqId === TEAM1_FLAG_B_HQ) return "B";
  if (hqId === TEAM1_FLAG_C_HQ) return "C";
  if (hqId === TEAM1_AB_HQ) return "AB";
  if (hqId === TEAM1_AC_HQ) return "AC";
  if (hqId === TEAM1_BC_HQ) return "BC";
  if (hqId === TEAM1_ABC_HQ) return "ABC";
  if (hqId === TEAM1_NO_FLAG_HQ) return "NO";

  // Team 2 routes
  if (hqId === TEAM2_FLAG_A_HQ) return "A";
  if (hqId === TEAM2_FLAG_B_HQ) return "B";
  if (hqId === TEAM2_FLAG_C_HQ) return "C";
  if (hqId === TEAM2_AB_HQ) return "AB";
  if (hqId === TEAM2_AC_HQ) return "AC";
  if (hqId === TEAM2_BC_HQ) return "BC";
  if (hqId === TEAM2_ABC_HQ) return "ABC";
  if (hqId === TEAM2_NO_FLAG_HQ) return "NO";

  return "NO";
}

function getHqIdForTeamAndRoute(team: mod.Team, routeKey: DynamicRouteKey): number {
  if (mod.Equals(team, team1)) {
    if (routeKey === "A") return TEAM1_FLAG_A_HQ;
    if (routeKey === "B") return TEAM1_FLAG_B_HQ;
    if (routeKey === "C") return TEAM1_FLAG_C_HQ;
    if (routeKey === "AB") return TEAM1_AB_HQ;
    if (routeKey === "AC") return TEAM1_AC_HQ;
    if (routeKey === "BC") return TEAM1_BC_HQ;
    if (routeKey === "ABC") return TEAM1_ABC_HQ;
    return TEAM1_NO_FLAG_HQ;
  }

  if (routeKey === "A") return TEAM2_FLAG_A_HQ;
  if (routeKey === "B") return TEAM2_FLAG_B_HQ;
  if (routeKey === "C") return TEAM2_FLAG_C_HQ;
  if (routeKey === "AB") return TEAM2_AB_HQ;
  if (routeKey === "AC") return TEAM2_AC_HQ;
  if (routeKey === "BC") return TEAM2_BC_HQ;
  if (routeKey === "ABC") return TEAM2_ABC_HQ;
  return TEAM2_NO_FLAG_HQ;
}

function getCapturePointBySymbol(symbol: SingleFlagRouteKey): CapturePoint | undefined {
  if (symbol === "A") return serverCapturePoints[CP_A_ID];
  if (symbol === "B") return serverCapturePoints[CP_B_ID];
  return serverCapturePoints[CP_C_ID];
}

function isSingleFlagRouteKey(routeKey: DynamicRouteKey | null | undefined): routeKey is SingleFlagRouteKey {
  return routeKey === "A" || routeKey === "B" || routeKey === "C";
}

function getNearestEnemyDistanceMeters(team: mod.Team, pos: mod.Vector, ignorePlayerId: number): number {
  let nearest = Number.POSITIVE_INFINITY;
  const entries = ensureLivePlayerSpatialHash();

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (entry.id === ignorePlayerId) continue;
    if (mod.Equals(entry.team, team)) continue;

    const d = mod.DistanceBetween(pos, entry.position);
    if (d < nearest) nearest = d;
  }

  return nearest;
}

function getCurrentSingleFlagRouteForTeam(team: mod.Team): SingleFlagRouteKey | null {
  const routeKey = routeKeyFromHqId(mod.Equals(team, team1) ? currentDynamicHqTeam1 : currentDynamicHqTeam2);
  return isSingleFlagRouteKey(routeKey) ? routeKey : null;
}

function getHasCapturedAnyFlagForTeam(team: mod.Team): boolean {
  return mod.Equals(team, team1) ? team1HasCapturedAnyFlag : team2HasCapturedAnyFlag;
}

function getPendingOrCommittedSingleFlagRouteForPlayer(team: mod.Team, playerId: number): SingleFlagRouteKey | null {
  const routeHqId =
    pendingDynamicHqForPlayer[playerId] ??
    lastDynamicHqForPlayer[playerId] ??
    (mod.Equals(team, team1) ? currentDynamicHqTeam1 : currentDynamicHqTeam2) ??
    getNoFlagHqIdForTeam(team);
  const routeKey = routeKeyFromHqId(routeHqId);
  return isSingleFlagRouteKey(routeKey) ? routeKey : null;
}

function chooseOwnershipDrivenSingleFlagRouteForTeam(
  team: mod.Team,
  currentRouteKey: SingleFlagRouteKey | null,
  hasCapturedAnyFlag: boolean
): SingleFlagRouteKey | null {
  if (!hasCapturedAnyFlag) return null;

  const safeOwnedRouteKey = chooseSafeOwnedSingleFlagRouteForTeam(team, currentRouteKey);
  if (safeOwnedRouteKey !== null) return safeOwnedRouteKey;

  return null;
}

function chooseSafeOwnedSingleFlagRouteForTeam(
  team: mod.Team,
  currentRouteKey: SingleFlagRouteKey | null,
  requireAlternateRoute: boolean = false
): SingleFlagRouteKey | null {
  const routeEvalByKey = buildSingleFlagRouteThreatEvalMap(team, liveCapturePointThreatRadiusMeters);
  const ownsB =
    routeEvalByKey.B !== undefined &&
    mod.Equals(routeEvalByKey.B.owner, team);
  let bestSafeOwnedFlankEval: SingleFlagRouteThreatEval | null = null;

  if (ownsB) {
    const ownedFlankRouteKeys: Array<"A" | "C"> = ["A", "C"];

    for (let i = 0; i < ownedFlankRouteKeys.length; i++) {
      const routeKey = ownedFlankRouteKeys[i];
      const routeEval = routeEvalByKey[routeKey];
      if (routeEval === undefined) continue;
      if (!mod.Equals(routeEval.owner, team)) continue;
      if (routeEval.directPressure) continue;

      if (!requireAlternateRoute && routeKey === currentRouteKey) {
        return routeKey;
      }

      if (requireAlternateRoute && routeKey === currentRouteKey) {
        continue;
      }

      if (bestSafeOwnedFlankEval === null || compareSingleFlagRouteThreatEvals(routeEval, bestSafeOwnedFlankEval) > 0) {
        bestSafeOwnedFlankEval = routeEval;
      }
    }

    if (bestSafeOwnedFlankEval !== null) {
      return bestSafeOwnedFlankEval.routeKey;
    }
  }

  let bestSafeOwnedRouteEval: SingleFlagRouteThreatEval | null = null;

  for (let i = 0; i < SINGLE_FLAG_ROUTE_KEYS.length; i++) {
    const routeKey = SINGLE_FLAG_ROUTE_KEYS[i];
    const routeEval = routeEvalByKey[routeKey];
    if (routeEval === undefined) continue;
    if (!mod.Equals(routeEval.owner, team)) continue;
    if (routeEval.directPressure) continue;

    if (!requireAlternateRoute && routeKey === currentRouteKey) {
      return routeKey;
    }

    if (requireAlternateRoute && routeKey === currentRouteKey) {
      continue;
    }

    if (bestSafeOwnedRouteEval === null || compareSingleFlagRouteThreatEvals(routeEval, bestSafeOwnedRouteEval) > 0) {
      bestSafeOwnedRouteEval = routeEval;
    }
  }

  return bestSafeOwnedRouteEval?.routeKey ?? null;
}

function rememberLiveFlankPressureSnapshot(
  playerId: number,
  defaultRouteKey: SingleFlagRouteKey | null,
  chosenRouteKey: SingleFlagRouteKey | null,
  aEnemyCount: number,
  cEnemyCount: number
): void {
  lastLiveFlankPressureByPlayerId[playerId] = {
    defaultRouteKey: defaultRouteKey,
    chosenRouteKey: chosenRouteKey,
    aEnemyCount: aEnemyCount,
    cEnemyCount: cEnemyCount,
    recordedAtTick: phaseTickCount,
  };
}

function getLiveFlankTeamId(team: mod.Team): number | null {
  if (mod.Equals(team, team1)) return 1;
  if (mod.Equals(team, team2)) return 2;
  return null;
}

function getRememberedLiveFlankRouteForTeam(team: mod.Team): "A" | "C" | null {
  const teamId = getLiveFlankTeamId(team);
  if (teamId === null) return null;
  const remembered = lastLiveFlankRouteByTeamId[teamId];
  return remembered === "A" || remembered === "C" ? remembered : null;
}

function rememberLiveFlankRouteForTeam(team: mod.Team, routeKey: SingleFlagRouteKey | null): void {
  if (routeKey !== "A" && routeKey !== "C") return;
  const teamId = getLiveFlankTeamId(team);
  if (teamId === null) return;
  lastLiveFlankRouteByTeamId[teamId] = routeKey;
}

function getLiveFlankTieDefaultRouteForTeam(team: mod.Team, preferredRouteKey: SingleFlagRouteKey | null): "A" | "C" {
  if (preferredRouteKey === "A" || preferredRouteKey === "C") return preferredRouteKey;
  return getRememberedLiveFlankRouteForTeam(team) ?? "A";
}

function countLiveFlankPressureForTeam(team: mod.Team): { aEnemyCount: number; cEnemyCount: number } | null {
  if (!liveRoutingCapturePointPositionsInitialized) return null;

  const cpA = getCapturePointBySymbol("A");
  const cpC = getCapturePointBySymbol("C");
  const aPosition = cpA?.getPosition() ?? null;
  const cPosition = cpC?.getPosition() ?? null;
  if (aPosition === null || cPosition === null) return null;

  return {
    aEnemyCount: countEnemiesNearPosition(team, aPosition, liveCapturePointThreatRadiusMeters, -1),
    cEnemyCount: countEnemiesNearPosition(team, cPosition, liveCapturePointThreatRadiusMeters, -1),
  };
}

function chooseLeastPressureFlankRoute(
  defaultRouteKey: SingleFlagRouteKey | null,
  aEnemyCount: number,
  cEnemyCount: number
): "A" | "C" {
  if (aEnemyCount === cEnemyCount) {
    if (defaultRouteKey === "A" || defaultRouteKey === "C") return defaultRouteKey;
    return "A";
  }

  return aEnemyCount < cEnemyCount ? "A" : "C";
}

function hasSingleFlagSpawnersForTeam(team: mod.Team, routeKey: SingleFlagRouteKey): boolean {
  const spawnerObjIds = getSpawnersForTeamAndRoute(team, routeKey);
  return spawnerObjIds.length > 0;
}

function chooseValidFlankRouteForTeam(team: mod.Team, preferredRouteKey: "A" | "C"): "A" | "C" | null {
  if (hasSingleFlagSpawnersForTeam(team, preferredRouteKey)) return preferredRouteKey;
  const alternateRouteKey: "A" | "C" = preferredRouteKey === "A" ? "C" : "A";
  if (hasSingleFlagSpawnersForTeam(team, alternateRouteKey)) return alternateRouteKey;
  return null;
}

function chooseLiveFlankFallbackRouteForTeam(
  team: mod.Team,
  preferredRouteKey: SingleFlagRouteKey | null
): SingleFlagRouteKey | null {
  const safestRoute = chooseSafestCapturePointRouteForTeam(team);
  if (safestRoute !== null) {
    rememberLiveFlankRouteForTeam(team, safestRoute);
    return safestRoute;
  }

  const tieDefaultRoute = getLiveFlankTieDefaultRouteForTeam(team, preferredRouteKey);
  const chosenFlankRoute = chooseValidFlankRouteForTeam(team, tieDefaultRoute);
  if (chosenFlankRoute !== null) rememberLiveFlankRouteForTeam(team, chosenFlankRoute);
  return chosenFlankRoute;
}

function chooseLiveDeployPressureRedirect(
  eventPlayer: mod.Player,
  playerId: number
): { routeKey: SingleFlagRouteKey; hqId: number; spawnerObjId: number } | null {
  const team = mod.GetTeam(eventPlayer);
  const defaultRouteKey = getPendingOrCommittedSingleFlagRouteForPlayer(team, playerId);
  const pressureCounts = countLiveFlankPressureForTeam(team);
  const aEnemyCount = pressureCounts?.aEnemyCount ?? -1;
  const cEnemyCount = pressureCounts?.cEnemyCount ?? -1;

  if (defaultRouteKey !== "A" && defaultRouteKey !== "B" && defaultRouteKey !== "C") {
    rememberLiveFlankPressureSnapshot(playerId, defaultRouteKey, defaultRouteKey, aEnemyCount, cEnemyCount);
    return null;
  }

  const safeOwnedRouteKey = chooseSafeOwnedSingleFlagRouteForTeam(team, defaultRouteKey);
  if (safeOwnedRouteKey !== null) {
    if (safeOwnedRouteKey === defaultRouteKey) {
      rememberLiveFlankPressureSnapshot(playerId, defaultRouteKey, defaultRouteKey, aEnemyCount, cEnemyCount);
      return null;
    }

    const hqId = getHqIdForTeamAndRoute(team, safeOwnedRouteKey);
    safeSpawnSpawnerIndex[playerId] = 0;
    const spawnerObjId = resolveSpawnerObjIdForRouteKey(playerId, team, safeOwnedRouteKey);
    if (!spawnerObjId) {
      rememberLiveFlankPressureSnapshot(playerId, defaultRouteKey, defaultRouteKey, aEnemyCount, cEnemyCount);
      return null;
    }

    rememberLiveFlankRouteForTeam(team, safeOwnedRouteKey);
    rememberLiveFlankPressureSnapshot(playerId, defaultRouteKey, safeOwnedRouteKey, aEnemyCount, cEnemyCount);
    return {
      routeKey: safeOwnedRouteKey,
      hqId: hqId,
      spawnerObjId: spawnerObjId,
    };
  }

  if (pressureCounts === null) {
    rememberLiveFlankPressureSnapshot(playerId, defaultRouteKey, defaultRouteKey, -1, -1);
    return null;
  }

  if (defaultRouteKey === "B") {
    const bRouteThreat = evaluateSingleFlagRouteThreat(team, "B", liveCapturePointThreatRadiusMeters);
    if (bRouteThreat === null || !bRouteThreat.directPressure) {
      rememberLiveFlankPressureSnapshot(
        playerId,
        defaultRouteKey,
        defaultRouteKey,
        pressureCounts.aEnemyCount,
        pressureCounts.cEnemyCount
      );
      return null;
    }
  }

  const chosenRouteKey = chooseSafestCapturePointRouteForTeam(team);
  if (chosenRouteKey === null) {
    rememberLiveFlankPressureSnapshot(
      playerId,
      defaultRouteKey,
      defaultRouteKey,
      pressureCounts.aEnemyCount,
      pressureCounts.cEnemyCount
    );
    return null;
  }

  rememberLiveFlankRouteForTeam(team, chosenRouteKey);
  rememberLiveFlankPressureSnapshot(
    playerId,
    defaultRouteKey,
    chosenRouteKey,
    pressureCounts.aEnemyCount,
    pressureCounts.cEnemyCount
  );

  if (chosenRouteKey === defaultRouteKey) return null;

  const hqId = getHqIdForTeamAndRoute(team, chosenRouteKey);
  safeSpawnSpawnerIndex[playerId] = 0;
  const spawnerObjId = resolveSpawnerObjIdForRouteKey(playerId, team, chosenRouteKey);
  if (!spawnerObjId) return null;

  return {
    routeKey: chosenRouteKey,
    hqId: hqId,
    spawnerObjId: spawnerObjId,
  };
}

function evaluateSingleFlagRouteThreatFresh(
  team: mod.Team,
  routeKey: SingleFlagRouteKey,
  radiusMeters: number
): SingleFlagRouteThreatEval | null {
  if (!liveRoutingCapturePointPositionsInitialized) return null;

  const cp = getCapturePointBySymbol(routeKey);
  if (!cp) return null;

  const spawnerObjIds = getSpawnersForTeamAndRoute(team, routeKey);
  if (!spawnerObjIds || spawnerObjIds.length <= 0) return null;

  const capturePointPosition = cp.getPosition();
  if (capturePointPosition === null) return null;

  const onPoint = cp.getOnPoint();
  const friendlyOnPointCount = mod.Equals(team, team1) ? onPoint[0] : onPoint[1];
  const enemyOnPointCount = mod.Equals(team, team1) ? onPoint[1] : onPoint[0];
  const contested = friendlyOnPointCount > 0 && enemyOnPointCount > 0;
  const owner = cp.getOwner();
  const captureProgress = cp.getCaptureProgress();
  const capturingTeam = cp.getProgressTeam();
  const phase = getCapturePointPhase(cp);
  const ownsB =
    routeKey !== "B" &&
    mod.Equals(owner, team) &&
    (() => {
      const cpB = getCapturePointBySymbol("B");
      return cpB !== undefined && mod.Equals(cpB.getOwner(), team);
    })();
  const enemyCapturingOrNeutralizing =
    (phase === "capturing_neutral" || phase === "neutralizing_enemy") &&
    !mod.Equals(capturingTeam, teamNeutral) &&
    !mod.Equals(capturingTeam, team);
  const enemyCountWithinThreatRadius = countEnemiesNearPosition(team, capturePointPosition, radiusMeters, -1);
  const hasEnemyWithinThreatRadius = enemyCountWithinThreatRadius > 0;
  const nearestEnemyDistanceToCapturePoint = getNearestEnemyDistanceMeters(team, capturePointPosition, -1);
  const radiusEnemyThreshold = ownsB ? 2 : 1;
  const directPressure =
    contested ||
    enemyCapturingOrNeutralizing ||
    enemyCountWithinThreatRadius >= radiusEnemyThreshold;

  return {
    routeKey: routeKey,
    owner: owner,
    contested: contested,
    captureProgress: captureProgress,
    capturingTeam: capturingTeam,
    friendlyOnPointCount: friendlyOnPointCount,
    enemyOnPointCount: enemyOnPointCount,
    enemyCountWithinThreatRadius: enemyCountWithinThreatRadius,
    hasEnemyWithinThreatRadius: hasEnemyWithinThreatRadius,
    nearestEnemyDistanceToCapturePoint: nearestEnemyDistanceToCapturePoint,
    enemyCapturingOrNeutralizing: enemyCapturingOrNeutralizing,
    directPressure: directPressure,
  };
}

function evaluateSingleFlagRouteThreat(
  team: mod.Team,
  routeKey: SingleFlagRouteKey,
  radiusMeters: number
): SingleFlagRouteThreatEval | null {
  if (radiusMeters !== liveCapturePointThreatRadiusMeters) {
    return evaluateSingleFlagRouteThreatFresh(team, routeKey, radiusMeters);
  }

  return getSafeRoutePressureCacheForTeam(team).singleFlagThreatByRoute[routeKey] ?? null;
}

function buildSingleFlagRouteThreatEvalMap(
  team: mod.Team,
  radiusMeters: number
): Partial<Record<SingleFlagRouteKey, SingleFlagRouteThreatEval>> {
  const routeEvalByKey: Partial<Record<SingleFlagRouteKey, SingleFlagRouteThreatEval>> = {};

  for (let i = 0; i < SINGLE_FLAG_ROUTE_KEYS.length; i++) {
    const routeKey = SINGLE_FLAG_ROUTE_KEYS[i];
    const evalResult = evaluateSingleFlagRouteThreat(team, routeKey, radiusMeters);
    if (evalResult !== null) routeEvalByKey[routeKey] = evalResult;
  }

  return routeEvalByKey;
}

function buildLegalSingleFlagRouteKeysForTeam(
  team: mod.Team,
  routeEvalByKey: Partial<Record<SingleFlagRouteKey, SingleFlagRouteThreatEval>>,
  hasCapturedAnyFlag: boolean
): SingleFlagRouteKey[] {
  const routeKeySet: Partial<Record<SingleFlagRouteKey, true>> = {};

  const routeA = routeEvalByKey.A ?? null;
  const routeB = routeEvalByKey.B ?? null;
  const routeC = routeEvalByKey.C ?? null;

  const ownsA = routeA !== null && mod.Equals(routeA.owner, team);
  const ownsB = routeB !== null && mod.Equals(routeB.owner, team);
  const ownsC = routeC !== null && mod.Equals(routeC.owner, team);
  const ownedCount = (ownsA ? 1 : 0) + (ownsB ? 1 : 0) + (ownsC ? 1 : 0);

  if (ownedCount <= 0) {
    if (!hasCapturedAnyFlag) return [];
    routeKeySet.A = true;
    routeKeySet.C = true;
    return SINGLE_FLAG_ROUTE_KEYS.filter((routeKey) => routeKeySet[routeKey] === true);
  }

  if (ownsA) routeKeySet.A = true;
  if (ownsB) routeKeySet.B = true;
  if (ownsC) routeKeySet.C = true;

  if (ownedCount === 1) {
    if (ownsA && routeA !== null && routeA.directPressure) routeKeySet.C = true;
    if (ownsB && routeB !== null && routeB.directPressure) {
      routeKeySet.A = true;
      routeKeySet.C = true;
    }
    if (ownsC && routeC !== null && routeC.directPressure) routeKeySet.A = true;
  }

  return SINGLE_FLAG_ROUTE_KEYS.filter((routeKey) => routeKeySet[routeKey] === true);
}

function getSingleFlagRouteTieBreakPriority(routeKey: SingleFlagRouteKey): number {
  if (routeKey === "A") return 0;
  if (routeKey === "C") return 1;
  return 2;
}

function compareSingleFlagRouteThreatEvals(
  candidate: SingleFlagRouteThreatEval,
  incumbent: SingleFlagRouteThreatEval
): number {
  const candidateSafe = !candidate.directPressure;
  const incumbentSafe = !incumbent.directPressure;
  if (candidateSafe !== incumbentSafe) return candidateSafe ? 1 : -1;

  if (candidate.nearestEnemyDistanceToCapturePoint !== incumbent.nearestEnemyDistanceToCapturePoint) {
    return candidate.nearestEnemyDistanceToCapturePoint > incumbent.nearestEnemyDistanceToCapturePoint ? 1 : -1;
  }

  return getSingleFlagRouteTieBreakPriority(candidate.routeKey) < getSingleFlagRouteTieBreakPriority(incumbent.routeKey)
    ? 1
    : -1;
}

type CapturePointRoutePressureEval = {
  routeKey: SingleFlagRouteKey;
  enemyCapturingOrNeutralizing: boolean;
  enemyCount: number;
  nearestEnemyDistance: number;
};

type SafeRoutePressureCache = {
  tick: number;
  radiusMeters: number;
  teamId: number;
  capturePointPressureByRoute: Partial<Record<SingleFlagRouteKey, CapturePointRoutePressureEval>>;
  singleFlagThreatByRoute: Partial<Record<SingleFlagRouteKey, SingleFlagRouteThreatEval>>;
};

let safeRoutePressureCacheByTeamId: { [teamId: number]: SafeRoutePressureCache | undefined } = {};

function getSafeRoutePressureTeamId(team: mod.Team): number {
  if (mod.Equals(team, team1)) return 1;
  if (mod.Equals(team, team2)) return 2;
  return 0;
}

function invalidateSafeRoutePressureCache(): void {
  safeRoutePressureCacheByTeamId = {};
}

function evaluateCapturePointRoutePressureForTeamFresh(
  team: mod.Team,
  routeKey: SingleFlagRouteKey,
  radiusMeters: number
): CapturePointRoutePressureEval | null {
  if (!liveRoutingCapturePointPositionsInitialized) return null;
  if (!hasSingleFlagSpawnersForTeam(team, routeKey)) return null;

  const cp = getCapturePointBySymbol(routeKey);
  if (!cp) return null;

  const capturePointPosition = cp.getPosition();
  if (capturePointPosition === null) return null;

  const phase = getCapturePointPhase(cp);
  const progressTeam = cp.getProgressTeam();
  const enemyCapturingOrNeutralizing =
    (phase === "capturing_neutral" || phase === "neutralizing_enemy") &&
    !mod.Equals(progressTeam, teamNeutral) &&
    !mod.Equals(progressTeam, team);

  return {
    routeKey: routeKey,
    enemyCapturingOrNeutralizing: enemyCapturingOrNeutralizing,
    enemyCount: countEnemiesNearPosition(team, capturePointPosition, radiusMeters, -1),
    nearestEnemyDistance: getNearestEnemyDistanceMeters(team, capturePointPosition, -1),
  };
}

function buildSafeRoutePressureCacheForTeam(team: mod.Team): SafeRoutePressureCache {
  ensureLivePlayerSpatialHash();

  const teamId = getSafeRoutePressureTeamId(team);
  const cache: SafeRoutePressureCache = {
    tick: phaseTickCount,
    radiusMeters: liveCapturePointThreatRadiusMeters,
    teamId: teamId,
    capturePointPressureByRoute: {},
    singleFlagThreatByRoute: {},
  };

  for (let i = 0; i < SINGLE_FLAG_ROUTE_KEYS.length; i++) {
    const routeKey = SINGLE_FLAG_ROUTE_KEYS[i];
    const capturePressure = evaluateCapturePointRoutePressureForTeamFresh(
      team,
      routeKey,
      liveCapturePointThreatRadiusMeters
    );
    if (capturePressure !== null) cache.capturePointPressureByRoute[routeKey] = capturePressure;

    const singleFlagThreat = evaluateSingleFlagRouteThreatFresh(team, routeKey, liveCapturePointThreatRadiusMeters);
    if (singleFlagThreat !== null) cache.singleFlagThreatByRoute[routeKey] = singleFlagThreat;
  }

  safeRoutePressureCacheByTeamId[teamId] = cache;
  liveSafeSpawnDiagnostics.routeCacheRebuilds += 1;
  return cache;
}

function getSafeRoutePressureCacheForTeam(team: mod.Team): SafeRoutePressureCache {
  const teamId = getSafeRoutePressureTeamId(team);
  const existing = safeRoutePressureCacheByTeamId[teamId];
  if (
    existing !== undefined &&
    existing.tick === phaseTickCount &&
    existing.radiusMeters === liveCapturePointThreatRadiusMeters
  ) {
    return existing;
  }

  return buildSafeRoutePressureCacheForTeam(team);
}

function evaluateCapturePointRoutePressureForTeam(
  team: mod.Team,
  routeKey: SingleFlagRouteKey,
  radiusMeters: number
): CapturePointRoutePressureEval | null {
  if (radiusMeters !== liveCapturePointThreatRadiusMeters) {
    return evaluateCapturePointRoutePressureForTeamFresh(team, routeKey, radiusMeters);
  }

  return getSafeRoutePressureCacheForTeam(team).capturePointPressureByRoute[routeKey] ?? null;
}

function compareCapturePointRoutePressureEvals(
  candidate: CapturePointRoutePressureEval,
  incumbent: CapturePointRoutePressureEval
): number {
  if (candidate.enemyCapturingOrNeutralizing !== incumbent.enemyCapturingOrNeutralizing) {
    return candidate.enemyCapturingOrNeutralizing ? -1 : 1;
  }

  if (candidate.enemyCount !== incumbent.enemyCount) {
    return candidate.enemyCount < incumbent.enemyCount ? 1 : -1;
  }

  if (candidate.nearestEnemyDistance !== incumbent.nearestEnemyDistance) {
    return candidate.nearestEnemyDistance > incumbent.nearestEnemyDistance ? 1 : -1;
  }

  return getSingleFlagRouteTieBreakPriority(candidate.routeKey) < getSingleFlagRouteTieBreakPriority(incumbent.routeKey)
    ? 1
    : -1;
}

function chooseSafestCapturePointRouteForTeam(team: mod.Team): SingleFlagRouteKey | null {
  let bestEval: CapturePointRoutePressureEval | null = null;

  for (let i = 0; i < SINGLE_FLAG_ROUTE_KEYS.length; i++) {
    const routeKey = SINGLE_FLAG_ROUTE_KEYS[i];
    const routeEval = evaluateCapturePointRoutePressureForTeam(team, routeKey, liveCapturePointThreatRadiusMeters);
    if (routeEval === null) continue;

    if (bestEval === null || compareCapturePointRoutePressureEvals(routeEval, bestEval) > 0) {
      bestEval = routeEval;
    }
  }

  return bestEval?.routeKey ?? null;
}

function chooseLiveSingleFlagRouteForTeam(
  team: mod.Team,
  currentRouteKey: SingleFlagRouteKey | null,
  preferCurrentRouteWithinMargin: boolean,
  hasCapturedAnyFlag: boolean
): SingleFlagRouteKey | null {
  const routeEvalByKey = buildSingleFlagRouteThreatEvalMap(team, liveCapturePointThreatRadiusMeters);
  const legalRouteKeys = buildLegalSingleFlagRouteKeysForTeam(team, routeEvalByKey, hasCapturedAnyFlag);
  const routeEvals: SingleFlagRouteThreatEval[] = [];

  for (let i = 0; i < legalRouteKeys.length; i++) {
    const routeEval = routeEvalByKey[legalRouteKeys[i]];
    if (routeEval !== undefined) routeEvals.push(routeEval);
  }

  if (routeEvals.length <= 0) return null;

  const currentRouteEval =
    currentRouteKey !== null && legalRouteKeys.indexOf(currentRouteKey) >= 0
      ? (routeEvalByKey[currentRouteKey] ?? null)
      : null;

  // Do not flip routes unless the active legal route is under direct pressure.
  if (currentRouteEval !== null && !currentRouteEval.directPressure) return currentRouteEval.routeKey;

  let bestRouteEval = routeEvals[0];
  for (let i = 1; i < routeEvals.length; i++) {
    if (compareSingleFlagRouteThreatEvals(routeEvals[i], bestRouteEval) > 0) {
      bestRouteEval = routeEvals[i];
    }
  }

  if (!preferCurrentRouteWithinMargin || currentRouteEval === null) return bestRouteEval.routeKey;
  if (bestRouteEval.routeKey === currentRouteEval.routeKey) return currentRouteEval.routeKey;

  if (bestRouteEval.directPressure === currentRouteEval.directPressure) {
    const nearestEnemyDistanceGain =
      bestRouteEval.nearestEnemyDistanceToCapturePoint - currentRouteEval.nearestEnemyDistanceToCapturePoint;
    if (nearestEnemyDistanceGain < LIVE_ROUTE_SWITCH_MARGIN_METERS) {
      return currentRouteEval.routeKey;
    }
  }

  return bestRouteEval.routeKey;
}

function isSingleFlagRouteUnderDirectPressure(team: mod.Team, routeKey: SingleFlagRouteKey): boolean {
  const routeThreat = evaluateSingleFlagRouteThreat(team, routeKey, liveCapturePointThreatRadiusMeters);
  return routeThreat !== null && routeThreat.directPressure;
}

function chooseLiveDynamicHqForTeam(team: mod.Team, hasCapturedAnyFlag: boolean): number {
  if (!hasCapturedAnyFlag) return getInitialSpawnPointObjIdForTeam(team);

  const currentRouteKey = getCurrentSingleFlagRouteForTeam(team);
  const ownershipRouteKey = chooseOwnershipDrivenSingleFlagRouteForTeam(team, currentRouteKey, hasCapturedAnyFlag);

  if (ownershipRouteKey === null) {
    const flankFallbackRoute = chooseLiveFlankFallbackRouteForTeam(team, currentRouteKey);
    if (flankFallbackRoute !== null) return getHqIdForTeamAndRoute(team, flankFallbackRoute);

    const currentRouteHqId = mod.Equals(team, team1) ? currentDynamicHqTeam1 : currentDynamicHqTeam2;
    return isValidDynamicSpawnId(currentRouteHqId) ? currentRouteHqId : getInitialSpawnPointObjIdForTeam(team);
  }

  if (ownershipRouteKey === "B" && isSingleFlagRouteUnderDirectPressure(team, "B")) {
    const flankFallbackRoute = chooseLiveFlankFallbackRouteForTeam(team, currentRouteKey);
    if (flankFallbackRoute !== null) return getHqIdForTeamAndRoute(team, flankFallbackRoute);
  }

  if (ownershipRouteKey === "A" || ownershipRouteKey === "C") {
    rememberLiveFlankRouteForTeam(team, ownershipRouteKey);
  }

  return getHqIdForTeamAndRoute(team, ownershipRouteKey);
}

function markHqRoutingDirty(): void {
  hqRoutingDirty = true;
  invalidateSafeRoutePressureCache();
}

function getCapturePointTopFlagSymbol(cp: CapturePoint): "A" | "B" | "C" | null {
  return cp.symbol === "A" || cp.symbol === "B" || cp.symbol === "C" ? cp.symbol : null;
}

function markCapturePointTopFlagLaneDirty(cp: CapturePoint | undefined): void {
  if (!cp) return;
  const symbol = getCapturePointTopFlagSymbol(cp);
  if (symbol === null) return;
  markLiveHudTopFlagLaneDirty(symbol);
}

function refreshCapturePointsEngineStateForUI(): boolean {
  let changed = false;
  invalidateSafeRoutePressureCache();

  Object.values(serverCapturePoints).forEach((cp) => {
    const previousSnapshot = createCapturePointStateSnapshot(cp);

    refreshCapturePointFromEngine(cp);

    const nextSnapshot = createCapturePointStateSnapshot(cp);
    const captureStateChanged = didCapturePointStateChange(previousSnapshot, nextSnapshot);

    if (captureStateChanged) changed = true;

    cp.updateUIforPlayersOnPoint();
    cp.setUIProgressForPlayersOnPoint();

    if (!mod.Equals(previousSnapshot.owner, nextSnapshot.owner) || previousSnapshot.phase !== nextSnapshot.phase) {
      markCapturePointTopFlagLaneDirty(cp);
    }
  });

  syncLiveHudTopFlagBlinkTimer();
  return changed;
}

function recomputeLiveHqRouting(forceImmediate: boolean = false, captureStateAlreadyFresh: boolean = false): void {
  // Debounce: avoid doing this multiple times in the same tick if several events fire together.
  if (!forceImmediate && lastHqRoutingUpdateTick === phaseTickCount) return;
  lastHqRoutingUpdateTick = phaseTickCount;

  // Keep our cached CP state fresh before computing live routing.
  if (!captureStateAlreadyFresh) {
    refreshCapturePointsEngineStateForUI();
  }

  UpdateFlagHQSpawns();

  hqRoutingDirty = false;
}

function refreshLiveHqRoutingFromObjectiveEvent(captureStateAlreadyFresh: boolean = false): void {
  if (gameStatus !== 3) return;
  markHqRoutingDirty();
  recomputeLiveHqRouting(true, captureStateAlreadyFresh);
}

function isReservedSpawnPointId(spawnerObjId: number): boolean {
  return RESERVED_SPAWN_POINT_ID > 0 && spawnerObjId === RESERVED_SPAWN_POINT_ID;
}

function filterReservedSpawnPointIds(spawnerObjIds: number[] | undefined): number[] {
  if (!spawnerObjIds || spawnerObjIds.length <= 0) return [];
  return spawnerObjIds.filter((spawnerObjId) => !isReservedSpawnPointId(spawnerObjId));
}

function sanitizeParticipantSpawnerObjId(spawnerObjId: number): number {
  if (!spawnerObjId || spawnerObjId <= 0) return 0;
  return isReservedSpawnPointId(spawnerObjId) ? 0 : spawnerObjId;
}

function resolveReservedRecoverySpawnPoint(): number {
  const routeKeys: DynamicRouteKey[] = ["NO", "A", "B", "C", "AB", "AC", "BC", "ABC"];
  const candidates: number[] = [
    TEAM1_INITIAL_HQ,
    TEAM2_INITIAL_HQ,
    TEAM1_NO_FLAG_HQ,
    TEAM2_NO_FLAG_HQ,
  ];

  for (let index = 0; index < routeKeys.length; index++) {
    const routeKey = routeKeys[index];
    candidates.push(...TEAM1_SPAWNERS_BY_ROUTE[routeKey]);
    candidates.push(...TEAM2_SPAWNERS_BY_ROUTE[routeKey]);
  }

  for (let index = 0; index < candidates.length; index++) {
    const candidate = sanitizeParticipantSpawnerObjId(candidates[index]);

    if (candidate > 0) {
      return candidate;
    }
  }

  return 0;
}

function getSpawnersForTeamAndRoute(team: mod.Team, routeKey: DynamicRouteKey): number[] {
  const configured = mod.Equals(team, team1) ? TEAM1_SPAWNERS_BY_ROUTE[routeKey] : TEAM2_SPAWNERS_BY_ROUTE[routeKey];
  return filterReservedSpawnPointIds(configured);
}

function getInitialSpawnPointObjIdForTeam(team: mod.Team): number {
  // Initial HQ spawn during countdown / match start.
  // We use the HQ id directly here (these are configured as the initial HQ spawns in the experience).
  const configured = mod.Equals(team, team1) ? TEAM1_INITIAL_HQ : TEAM2_INITIAL_HQ;
  return sanitizeParticipantSpawnerObjId(configured);
}

function getNoFlagHqIdForTeam(team: mod.Team): number {
  return mod.Equals(team, team1) ? TEAM1_NO_FLAG_HQ : TEAM2_NO_FLAG_HQ;
}
function commitPendingDynamicHqForPlayer(playerId: number): void {
  const pending = pendingDynamicHqForPlayer[playerId];
  if (pending && isValidDynamicSpawnId(pending)) {
    lastDynamicHqForPlayer[playerId] = pending;
  }
  pendingDynamicHqForPlayer[playerId] = undefined;
}

/*
  Resolve a spawn ObjId from a specific route key.
  - Falls back to NO if the requested route has no spawners.
  - Returns 0 if nothing exists at all (defensive).
*/
function resolveSpawnerObjIdForRouteKey(playerId: number, team: mod.Team, routeKey: DynamicRouteKey): number {
  const list = getSpawnersForTeamAndRoute(team, routeKey);
  const finalList = list && list.length > 0 ? list : getSpawnersForTeamAndRoute(team, "NO");

  if (!finalList || finalList.length <= 0) return 0;

  const idx = safeSpawnSpawnerIndex[playerId] ?? 0;
  const chosen = finalList[idx % finalList.length];

  safeSpawnSpawnerIndex[playerId] = (idx + 1) % finalList.length;

  return sanitizeParticipantSpawnerObjId(chosen);
}

function HqDesyncCheckAndRecycle(playerId: number): void {
  const playerState = serverPlayers.get(playerId);
  if (!playerState) return;

  const eventPlayer = playerState.player;
  if (!mod.IsPlayerValid(eventPlayer)) return;

  // If we're already in a safe-spawn recycle flow, don't add another recycle on top.
  if (safeSpawnUnsafePending[playerId] === true) return;
  if (safeSpawnForcedUndeploy[playerId] === true) return;

  const retries = hqDesyncForcedRedeploys[playerId] ?? 0;
  if (retries >= HQ_DESYNC_MAX_FORCED_REDEPLOYS) return;

  const team = mod.GetTeam(eventPlayer);

  // Determine the dynamic HQ spawner object ID the player is currently routed to.
  const routeHqId =
    pendingDynamicHqForPlayer[playerId] ??
    lastDynamicHqForPlayer[playerId] ??
    (mod.Equals(team, team1) ? currentDynamicHqTeam1 : currentDynamicHqTeam2) ??
    getNoFlagHqIdForTeam(team);

  // Defensive: if we somehow don't have a route, do nothing.
  if (!routeHqId) return;

  // HQ spawner object position (signature for the bug case).
  const hqSpawnerPos = mod.GetObjectPosition(mod.GetSpawnPoint(routeHqId));

  // Actual player position right after deploy.
  const playerPos = getPlayerPosition(eventPlayer);

  const distToHqSpawner = mod.DistanceBetween(playerPos, hqSpawnerPos);

  // If they spawned essentially on the HQ spawner object, treat as desync spawn -> recycle.
  if (distToHqSpawner > HQ_DESYNC_SPAWNER_EPSILON_METERS) return;

  hqDesyncForcedRedeploys[playerId] = retries + 1;

  // Use your existing safe-spawn routing to pick the correct spawnpoint from the route list.
  const spawnerObjId = resolveSafeSpawnSpawnerObjId(playerId, team);
  if (!spawnerObjId) return;

  queueForcedSpawnRetry(playerId, spawnerObjId, null, routeHqId);
}

function resolveSafeSpawnSpawnerObjId(playerId: number, team: mod.Team): number {
  const routeHqId =
    pendingDynamicHqForPlayer[playerId] ??
    lastDynamicHqForPlayer[playerId] ??
    (mod.Equals(team, team1) ? currentDynamicHqTeam1 : currentDynamicHqTeam2) ??
    getNoFlagHqIdForTeam(team);

  // If routing is pointing to an initial HQ, spawn directly from the initial HQ spawn point.
  if (routeHqId === TEAM1_INITIAL_HQ || routeHqId === TEAM2_INITIAL_HQ) {
    return getInitialSpawnPointObjIdForTeam(team);
  }

  const routeKey = routeKeyFromHqId(routeHqId);
  return resolveSpawnerObjIdForRouteKey(playerId, team, routeKey);
}

function getPlayerPosition(player: mod.Player): mod.Vector {
  return mod.GetSoldierState(player, mod.SoldierStateVector.GetPosition);
}

function getObjIdSafe(target: unknown): number {
  if (target === undefined || target === null) return -1;
  try {
    const id = Number(mod.GetObjId(target as any));
    return Number.isFinite(id) ? id : -1;
  } catch (_err) {
    return -1;
  }
}

function kernelIsPlayerAlive(player: mod.Player): boolean {
  return mod.GetSoldierState(player, mod.SoldierStateBool.IsAlive);
}

function kernelIsPlayerAliveSafe(player: mod.Player): boolean {
  try {
    return kernelIsPlayerAlive(player);
  } catch (_err) {
    return false;
  }
}

function isSquadSpawnBypassActive(playerId: number): boolean {
  return squadSpawnBypass[playerId] === true;
}

function getSafeSpawnGeneration(playerId: number): number {
  return safeSpawnGenerationByPlayerId[playerId] ?? 0;
}

function bumpSafeSpawnGeneration(playerId: number): number {
  const nextGeneration = getSafeSpawnGeneration(playerId) + 1;
  safeSpawnGenerationByPlayerId[playerId] = nextGeneration;
  return nextGeneration;
}

function resetLiveSafeSpawnDiagnostics(): void {
  liveSafeSpawnDiagnostics = {
    checkQueueDepth: 0,
    forcedSpawnQueueDepth: 0,
    checksProcessed: 0,
    forcedSpawnsProcessed: 0,
    routeCacheRebuilds: 0,
    spatialHashRebuilds: 0,
    maxQueueAgeTicks: 0,
  };
  lastLivePerformanceDiagnosticsTick = -999999;
}

function markSafeSpawnQueueAge(enqueuedTick: number): void {
  const ageTicks = phaseTickCount - enqueuedTick;
  if (ageTicks > liveSafeSpawnDiagnostics.maxQueueAgeTicks) {
    liveSafeSpawnDiagnostics.maxQueueAgeTicks = ageTicks;
  }
}

function updateSafeSpawnQueueDepthDiagnostics(): void {
  liveSafeSpawnDiagnostics.checkQueueDepth = safeSpawnCheckQueue.length;
  liveSafeSpawnDiagnostics.forcedSpawnQueueDepth = safeSpawnForcedQueue.length;
}

function clearSafeSpawnCheckTimer(playerId: number): void {
  delete safeSpawnCheckQueuedGenerationByPlayerId[playerId];
  safeSpawnPendingCheck[playerId] = false;
}

function clearSafeSpawnRetryTimer(playerId: number): void {
  delete safeSpawnForcedQueuedGenerationByPlayerId[playerId];
}

function clearSquadSpawnBypassTimer(playerId: number): void {
  Timers.clear(squadSpawnBypassClearTimerByPlayerId[playerId]);
  delete squadSpawnBypassClearTimerByPlayerId[playerId];
}

function clearSpawnRoutingTimersForPlayer(playerId: number): void {
  clearSafeSpawnCheckTimer(playerId);
  clearSafeSpawnRetryTimer(playerId);
  clearSquadSpawnBypassTimer(playerId);
}

function resetTransientSpawnRoutingStateForPlayer(playerId: number): void {
  bumpSafeSpawnGeneration(playerId);
  clearSpawnRoutingTimersForPlayer(playerId);

  delete pendingDynamicHqForPlayer[playerId];
  delete safeSpawnUnsafeSpawnerObjId[playerId];
  delete safeSpawnPendingCheck[playerId];
  delete safeSpawnUnsafePending[playerId];
  delete safeSpawnForcedUndeploy[playerId];
  delete safeSpawnSkipNextSafetyCheck[playerId];
  delete squadSpawnBypass[playerId];
  delete lastLiveFlankPressureByPlayerId[playerId];
}

function resetSpawnRoutingStateForPlayer(playerId: number): void {
  resetTransientSpawnRoutingStateForPlayer(playerId);

  delete lastDynamicHqForPlayer[playerId];
  delete safeSpawnSpawnerIndex[playerId];
  delete safeSpawnForcedRedeploys[playerId];
  delete hqDesyncForcedRedeploys[playerId];
}

function resetAllSpawnRoutingState(): void {
  Object.keys(squadSpawnBypassClearTimerByPlayerId).forEach((playerId) => clearSquadSpawnBypassTimer(Number(playerId)));

  lastDynamicHqForPlayer = {};
  pendingDynamicHqForPlayer = {};
  safeSpawnSpawnerIndex = {};
  safeSpawnUnsafePending = {};
  safeSpawnUnsafeSpawnerObjId = {};
  safeSpawnForcedRedeploys = {};
  safeSpawnPendingCheck = {};
  safeSpawnForcedUndeploy = {};
  safeSpawnSkipNextSafetyCheck = {};
  safeSpawnGenerationByPlayerId = {};
  safeSpawnCheckQueuedGenerationByPlayerId = {};
  safeSpawnForcedQueuedGenerationByPlayerId = {};
  safeSpawnCheckQueue = [];
  safeSpawnForcedQueue = [];
  squadSpawnBypassClearTimerByPlayerId = {};
  squadSpawnBypass = {};
  lastLiveFlankPressureByPlayerId = {};
  lastLiveFlankRouteByTeamId = {};
  hqDesyncForcedRedeploys = {};
  resetLiveSafeSpawnDiagnostics();
  invalidateLivePlayerSpatialHash();
}

function scheduleSquadSpawnBypassClear(playerId: number): void {
  clearSquadSpawnBypassTimer(playerId);

  squadSpawnBypassClearTimerByPlayerId[playerId] = Timers.setTimeout(() => {
    delete squadSpawnBypassClearTimerByPlayerId[playerId];
    squadSpawnBypass[playerId] = false;
  }, SQUAD_SPAWN_BYPASS_LIFETIME_SECONDS * 1000);
}

function checkIfSpawnedOnSquadmate(player: mod.Player): boolean {
  const playerId = modlib.getPlayerId(player);
  const playerEntry = getSpatialPlayerEntry(playerId);
  const playerSquad = playerEntry?.squad ?? mod.GetSquad(player);
  const playerPosition = playerEntry?.position ?? getPlayerPosition(player);
  let spawnedOnSquadmate = false;

  forEachSpatialPlayerNearPosition(playerPosition, SQUAD_SPAWN_DISTANCE, (entry) => {
    if (spawnedOnSquadmate) return;
    if (entry.id === playerId) return;
    if (!mod.Equals(entry.squad, playerSquad)) return;

    const distance = mod.DistanceBetween(playerPosition, entry.position);
    if (distance <= SQUAD_SPAWN_DISTANCE) {
      spawnedOnSquadmate = true;
    }
  });

  return spawnedOnSquadmate;
}

function hasEnemyNearPosition(team: mod.Team, pos: mod.Vector, radiusMeters: number, ignorePlayerId: number): boolean {
  return countEnemiesNearPosition(team, pos, radiusMeters, ignorePlayerId) > 0;
}

function countEnemiesNearPosition(team: mod.Team, pos: mod.Vector, radiusMeters: number, ignorePlayerId: number): number {
  let count = 0;

  forEachSpatialPlayerNearPosition(pos, radiusMeters, (entry) => {
    if (entry.id === ignorePlayerId) return;
    if (mod.Equals(entry.team, team)) return;

    const d = mod.DistanceBetween(pos, entry.position);
    if (d <= radiusMeters) count += 1;
  });

  return count;
}
const FRIENDLY_SPAWN_BYPASS_RADIUS_METERS = RULES.gameplay.safeSpawn.friendlySpawnBypassMeters;

function isSpawnNearFriendlyPlayer(eventPlayer: mod.Player, playerId: number, radiusMeters: number): boolean {
  if (!mod.IsPlayerValid(eventPlayer)) return false;
  if (!kernelIsPlayerAlive(eventPlayer)) return false;

  const myTeam = mod.GetTeam(eventPlayer);
  const myEntry = getSpatialPlayerEntry(playerId);
  const myPos = myEntry?.position ?? getPlayerPosition(eventPlayer);

  let nearFriendly = false;

  forEachSpatialPlayerNearPosition(myPos, radiusMeters, (entry) => {
    if (nearFriendly) return;

    // ignore self
    if (entry.id === playerId) return;

    if (!mod.Equals(entry.team, myTeam)) return;

    const d = mod.DistanceBetween(myPos, entry.position);
    if (d <= radiusMeters) {
      nearFriendly = true;
    }
  });

  return nearFriendly;
}

function isValidDynamicSpawnId(id: number): boolean {
  return id >= TEAM1_FLAG_A_HQ && id <= TEAM2_NO_FLAG_HQ;
}
function getSafeSpawnEnemyRadiusMeters(attemptUsed: number): number {
  // attemptUsed: 0 on attempt 1, 1 on attempt 2, etc.
  // We want:
  //  used=0 => 25m  (attempt 1)
  //  used=4 => 8m   (attempt 5)
  //  used>=4 => stay at 8m
  let u = attemptUsed;
  if (u < 0) u = 0;
  if (u > SAFE_SPAWN_RADIUS_REACH_END_USED) u = SAFE_SPAWN_RADIUS_REACH_END_USED;

  const t = SAFE_SPAWN_RADIUS_REACH_END_USED <= 0 ? 1 : (u / SAFE_SPAWN_RADIUS_REACH_END_USED); // 0..1

  return SAFE_SPAWN_RADIUS_START_METERS + (SAFE_SPAWN_RADIUS_END_METERS - SAFE_SPAWN_RADIUS_START_METERS) * t;
}





/*
  Safe spawn check:
    - Runs shortly after deploy (live only).
    - If enemy is within the safe-spawn radius, force one undeploy and re-spawn from the
      numeric PlayerSpawner ObjId for the safest A/B/C capture-point route.
    - Route safety is scored from enemy positions near capture points, never PlayerSpawner positions.
    - Bypasses recycling if it looks like a squad spawn.
*/
function resolveSafestCapturePointSpawnCorrection(
  playerId: number,
  team: mod.Team
): { routeKey: SingleFlagRouteKey; hqId: number; spawnerObjId: number } | null {
  const routeKey = chooseSafestCapturePointRouteForTeam(team);
  if (routeKey === null) return null;

  const hqId = getHqIdForTeamAndRoute(team, routeKey);
  safeSpawnSpawnerIndex[playerId] = 0;

  const spawnerObjId = resolveSpawnerObjIdForRouteKey(playerId, team, routeKey);
  if (!spawnerObjId) return null;

  return {
    routeKey: routeKey,
    hqId: hqId,
    spawnerObjId: spawnerObjId,
  };
}

function enqueueSafeSpawnCheck(playerId: number, dueTick: number, reason: SafeSpawnCheckReason): void {
  const playerState = serverPlayers.get(playerId);
  if (!playerState) return;
  if (gameStatus !== 3) return;
  if (safeSpawnUnsafePending[playerId] === true) return;

  const generation = getSafeSpawnGeneration(playerId);
  if (safeSpawnCheckQueuedGenerationByPlayerId[playerId] === generation) return;

  safeSpawnCheckQueuedGenerationByPlayerId[playerId] = generation;
  safeSpawnCheckQueue.push({
    playerId: playerId,
    generation: generation,
    dueTick: dueTick,
    enqueuedTick: phaseTickCount,
    reason: reason,
  });
  updateSafeSpawnQueueDepthDiagnostics();
}

function isSafeSpawnCheckQueueItemCurrent(item: SafeSpawnCheckQueueItem): boolean {
  if (safeSpawnCheckQueuedGenerationByPlayerId[item.playerId] !== item.generation) return false;
  if (getSafeSpawnGeneration(item.playerId) !== item.generation) return false;
  return serverPlayers.get(item.playerId) !== undefined;
}

function isForcedSafeSpawnQueueItemCurrent(item: ForcedSafeSpawnQueueItem): boolean {
  if (safeSpawnForcedQueuedGenerationByPlayerId[item.playerId] !== item.generation) return false;
  if (getSafeSpawnGeneration(item.playerId) !== item.generation) return false;
  return serverPlayers.get(item.playerId) !== undefined;
}

function queueForcedSpawnRetry(
  playerId: number,
  spawnerObjId: number,
  routeKey: SingleFlagRouteKey | null,
  hqId: number
): void {
  const playerState = serverPlayers.get(playerId);
  if (!playerState) return;
  if (!spawnerObjId) return;

  const generation = getSafeSpawnGeneration(playerId);
  if (safeSpawnForcedQueuedGenerationByPlayerId[playerId] === generation) return;
  safeSpawnForcedUndeploy[playerId] = true;
  safeSpawnUnsafePending[playerId] = true;
  safeSpawnUnsafeSpawnerObjId[playerId] = spawnerObjId;
  safeSpawnSkipNextSafetyCheck[playerId] = true;

  safeSpawnForcedQueuedGenerationByPlayerId[playerId] = generation;
  safeSpawnForcedQueue.push({
    playerId: playerId,
    generation: generation,
    spawnerObjId: spawnerObjId,
    routeKey: routeKey,
    hqId: hqId,
    stage: "undeploy",
    dueTick: phaseTickCount + 1,
    enqueuedTick: phaseTickCount,
    waitTicks: 0,
  });
  updateSafeSpawnQueueDepthDiagnostics();
}

function finalizeSafeSpawnSuccess(eventPlayer: mod.Player, playerId: number): void {
  if (HQ_DESYNC_CHECK_ENABLED) {
    HqDesyncCheckAndRecycle(playerId);
  }
  if (safeSpawnUnsafePending[playerId] !== true) {
    safeSpawnForcedUndeploy[playerId] = false;
  }
}

function runSafeSpawnCheckOrRedeploy(playerId: number, generation: number): void {
  if (safeSpawnPendingCheck[playerId] === true) return;
  if (safeSpawnUnsafePending[playerId] === true) return;
  if (generation !== getSafeSpawnGeneration(playerId)) return;

  const p = serverPlayers.get(playerId);
  if (!p) return;

  const eventPlayer = p.player;
  if (!mod.IsPlayerValid(eventPlayer)) return;

  safeSpawnPendingCheck[playerId] = true;

  try {
    if (safeSpawnSkipNextSafetyCheck[playerId] === true) {
      delete safeSpawnSkipNextSafetyCheck[playerId];
      safeSpawnForcedRedeploys[playerId] = 0;
      commitPendingDynamicHqForPlayer(playerId);
      finalizeSafeSpawnSuccess(eventPlayer, playerId);
      return;
    }

    // 1) Hard bypass if spawn is near ANY friendly within 8m
    if (isSpawnNearFriendlyPlayer(eventPlayer, playerId, FRIENDLY_SPAWN_BYPASS_RADIUS_METERS)) {
      safeSpawnForcedRedeploys[playerId] = 0;
      commitPendingDynamicHqForPlayer(playerId);
      finalizeSafeSpawnSuccess(eventPlayer, playerId);
      return;
    }


    // 2) Keep your existing bypass if you still want it
    if (isSquadSpawnBypassActive(playerId)) {
      safeSpawnForcedRedeploys[playerId] = 0;
      commitPendingDynamicHqForPlayer(playerId);
      finalizeSafeSpawnSuccess(eventPlayer, playerId);
      return;
    }

    if (gameStatus !== 3) return;
    if (!p.isDeployed) return;
    if (!kernelIsPlayerAlive(eventPlayer)) return;

    const team = mod.GetTeam(eventPlayer);
    const pressureRedirect = chooseLiveDeployPressureRedirect(eventPlayer, playerId);
    if (pressureRedirect !== null) {
      safeSpawnForcedRedeploys[playerId] = 0;
      pendingDynamicHqForPlayer[playerId] = pressureRedirect.hqId;
      queueForcedSpawnRetry(playerId, pressureRedirect.spawnerObjId, pressureRedirect.routeKey, pressureRedirect.hqId);
      return;
    }

    const radius = SAFE_SPAWN_RADIUS_START_METERS;

    // If this looks like a squad spawn, do not force recycle.
    if (checkIfSpawnedOnSquadmate(eventPlayer)) {
      safeSpawnForcedRedeploys[playerId] = 0;
      commitPendingDynamicHqForPlayer(playerId);
      finalizeSafeSpawnSuccess(eventPlayer, playerId);
      return;
    }

    const playerEntry = getSpatialPlayerEntry(playerId);
    const pos = playerEntry?.position ?? getPlayerPosition(eventPlayer);
    const unsafe = hasEnemyNearPosition(team, pos, radius, playerId);

    if (!unsafe) {
      // Successful safe spawn: reset attempt counter.
      safeSpawnForcedRedeploys[playerId] = 0;
      commitPendingDynamicHqForPlayer(playerId);
      finalizeSafeSpawnSuccess(eventPlayer, playerId);
      return;
    }

    const correction = resolveSafestCapturePointSpawnCorrection(playerId, team);
    if (correction === null) {
      finalizeSafeSpawnSuccess(eventPlayer, playerId);
      return;
    }

    pendingDynamicHqForPlayer[playerId] = correction.hqId;
    safeSpawnForcedRedeploys[playerId] = 0;
    queueForcedSpawnRetry(playerId, correction.spawnerObjId, correction.routeKey, correction.hqId);
  } finally {
    safeSpawnPendingCheck[playerId] = false;
  }
}

function SafeSpawnCheckOrRedeploy(playerId: number): void {
  clearSafeSpawnCheckTimer(playerId);
  if (safeSpawnUnsafePending[playerId] === true) return;
  enqueueSafeSpawnCheck(playerId, phaseTickCount + SAFE_SPAWN_CHECK_DELAY_TICKS, "deploy");
}

function processSafeSpawnCheckQueue(): void {
  if (gameStatus !== 3 || safeSpawnCheckQueue.length <= 0) {
    updateSafeSpawnQueueDepthDiagnostics();
    return;
  }

  let processed = 0;
  const remaining: SafeSpawnCheckQueueItem[] = [];

  for (let i = 0; i < safeSpawnCheckQueue.length; i++) {
    const item = safeSpawnCheckQueue[i];

    if (!isSafeSpawnCheckQueueItemCurrent(item)) {
      continue;
    }

    if (processed >= SAFE_SPAWN_CHECK_QUEUE_BUDGET_PER_TICK || item.dueTick > phaseTickCount) {
      remaining.push(item);
      continue;
    }

    delete safeSpawnCheckQueuedGenerationByPlayerId[item.playerId];
    markSafeSpawnQueueAge(item.enqueuedTick);
    processed += 1;
    liveSafeSpawnDiagnostics.checksProcessed += 1;
    runSafeSpawnCheckOrRedeploy(item.playerId, item.generation);
  }

  safeSpawnCheckQueue = remaining;
  updateSafeSpawnQueueDepthDiagnostics();
}

function processForcedSafeSpawnQueue(): void {
  if (gameStatus !== 3 || safeSpawnForcedQueue.length <= 0) {
    updateSafeSpawnQueueDepthDiagnostics();
    return;
  }

  let processed = 0;
  const remaining: ForcedSafeSpawnQueueItem[] = [];

  for (let i = 0; i < safeSpawnForcedQueue.length; i++) {
    const item = safeSpawnForcedQueue[i];

    if (!isForcedSafeSpawnQueueItemCurrent(item)) {
      continue;
    }

    if (processed >= SAFE_SPAWN_FORCED_QUEUE_BUDGET_PER_TICK || item.dueTick > phaseTickCount) {
      remaining.push(item);
      continue;
    }

    const playerState = serverPlayers.get(item.playerId);
    if (!playerState) continue;

    const player = playerState.player;
    if (!mod.IsPlayerValid(player)) {
      delete safeSpawnForcedQueuedGenerationByPlayerId[item.playerId];
      safeSpawnUnsafePending[item.playerId] = false;
      safeSpawnUnsafeSpawnerObjId[item.playerId] = 0;
      continue;
    }

    markSafeSpawnQueueAge(item.enqueuedTick);
    processed += 1;

    if (item.stage === "undeploy") {
      safeSpawnForcedUndeploy[item.playerId] = true;
      safeSpawnUnsafePending[item.playerId] = true;
      safeSpawnUnsafeSpawnerObjId[item.playerId] = item.spawnerObjId;
      safeSpawnSkipNextSafetyCheck[item.playerId] = true;
      playerState.isDeployed = false;
      invalidateLivePlayerSpatialHash();

      mod.SetRedeployTime(player, 9999);
      mod.DisplayNotificationMessage(mod.Message(mod.stringkeys.SafeSpawnRetryToast), player);
      mod.UndeployPlayer(player);

      remaining.push({
        playerId: item.playerId,
        generation: item.generation,
        spawnerObjId: item.spawnerObjId,
        routeKey: item.routeKey,
        hqId: item.hqId,
        stage: "spawn",
        dueTick: phaseTickCount + SAFE_SPAWN_FORCED_SPAWN_DELAY_TICKS,
        enqueuedTick: item.enqueuedTick,
        waitTicks: 0,
      });
      continue;
    }

    if (playerState.isDeployed && item.waitTicks < TICK_RATE) {
      remaining.push({
        playerId: item.playerId,
        generation: item.generation,
        spawnerObjId: item.spawnerObjId,
        routeKey: item.routeKey,
        hqId: item.hqId,
        stage: "spawn",
        dueTick: phaseTickCount + 1,
        enqueuedTick: item.enqueuedTick,
        waitTicks: item.waitTicks + 1,
      });
      continue;
    }

    safeSpawnUnsafePending[item.playerId] = false;
    safeSpawnUnsafeSpawnerObjId[item.playerId] = 0;
    delete safeSpawnForcedQueuedGenerationByPlayerId[item.playerId];

    mod.SetRedeployTime(player, 0);
    mod.SpawnPlayerFromSpawnPoint(player, item.spawnerObjId);
    mod.SetRedeployTime(player, REDEPLOY_TIME);
    liveSafeSpawnDiagnostics.forcedSpawnsProcessed += 1;
  }

  safeSpawnForcedQueue = remaining;
  updateSafeSpawnQueueDepthDiagnostics();
}

function processLiveSafeSpawnQueues(): void {
  processForcedSafeSpawnQueue();
  processSafeSpawnCheckQueue();
}

function maybeEmitLivePerformanceDiagnostics(): void {
  if (!DEBUG_LIVE_PERFORMANCE_DIAGNOSTICS) return;
  if (gameStatus !== 3) return;
  if (serverTickCount - lastLivePerformanceDiagnosticsTick < 10 * TICK_RATE) return;

  lastLivePerformanceDiagnosticsTick = serverTickCount;
  updateSafeSpawnQueueDepthDiagnostics();
  const summary =
    "[LIVE PERF] sq/fq/chk/fsp/rcache/shash/maxAge " +
    String(liveSafeSpawnDiagnostics.checkQueueDepth) +
    "/" +
    String(liveSafeSpawnDiagnostics.forcedSpawnQueueDepth) +
    "/" +
    String(liveSafeSpawnDiagnostics.checksProcessed) +
    "/" +
    String(liveSafeSpawnDiagnostics.forcedSpawnsProcessed) +
    "/" +
    String(liveSafeSpawnDiagnostics.routeCacheRebuilds) +
    "/" +
    String(liveSafeSpawnDiagnostics.spatialHashRebuilds) +
    "/" +
    String(liveSafeSpawnDiagnostics.maxQueueAgeTicks);

  mod.DisplayHighlightedWorldLogMessage(
    mod.Message(summary)
  );
}

/* =================================================================================================
   5) AUDIO (SFX / VO)
================================================================================================= */

let audioInitialized = false;
let SFX_CaptureLeadinFriendly: any = null;
let SFX_CaptureLeadinEnemy: any = null;
let SFX_CaptureLeadinNeutral: any = null;
let SFX_CaptureLeadinThump: any = null;
let SFX_CapturingTickInBetweenFriendly: any = null;
let SFX_CapturingTickInBetweenEnemy: any = null;

let SFX_TickFriendly: any = null;
let SFX_TickEnemy: any = null;
let SFX_CapturedFriendly: any = null;
let SFX_ReadyUp: any = null;
let SFX_CountdownHeartbeat: any = null;
let SFX_ThumpFriendly: any = null;
let SFX_ThumpEnemy: any = null;
let SFX_MatchStartStinger: any = null;
// Capture tick LOOPS (start once, stop once)
let SFX_TickFriendlyLoop: any = null;
let SFX_TickEnemyLoop: any = null;
let SFX_TickContestedLoop: any = null;
// End-of-round suspense loops
let SFX_Endgame_WinningLoop: any = null;
let SFX_Endgame_LosingLoop: any = null;
// Restricted Area countdown loop
let SFX_OutOfBoundsCountdownLoop: any = null;


// Track per-player state so loops never stack
let endgameLoopStateByPlayerId: { [playerId: number]: "none" | "win" | "lose" } = {};


// Track what loop (if any) each player is currently hearing
let captureTickLoopStateByPlayerId: { [playerId: number]: "none" | "friendly" | "enemy" | "contested" } = {};

let VO_Module: any = null;
// Postmatch result SFX
let SFX_PostMatchVictory: any = null;
let SFX_PostMatchDefeat: any = null;

let postmatchResultSfxPlayed = false;

const MUSIC_ENABLED = RULES.music.enabled;
const MUSIC_PACKAGE: string = RULES.music.package;
const MUSIC_ENDGAME_TICKET_THRESHOLD = RULES.music.endgameTicketThreshold;
const MUSIC_ENDGAME_TIME_THRESHOLD_SECONDS = RULES.music.endgameTimeThresholdSeconds;
const MUSIC_URGENCY_MIN = RULES.music.urgencyMin;
const MUSIC_URGENCY_MAX = RULES.music.urgencyMax;
const MUSIC_FALLBACK_TO_SFX_LOOPS = RULES.music.fallbackToSfxLoops;

let musicPackageLoaded = false;
let musicRuntimeHealthy = true;
let liveEndgameSuspenseEntered = false;
let postmatchResultMusicActive = false;
let coreEndgameWinningTeam: mod.Team = teamNeutral;
let coreStartMusicTriggeredThisRound = false;
let preliveMusicRetryAttemptsRemaining = 0;
let preliveMusicRetryNextTick = 0;
let preliveRoundStartVoPlayedThisRound = false;

// Endgame suspense loop tuning (SFX fallback lane)
const ENDGAME_TICKET_THRESHOLD = MUSIC_ENDGAME_TICKET_THRESHOLD;
const ENDGAME_TIME_THRESHOLD_SECONDS = MUSIC_ENDGAME_TIME_THRESHOLD_SECONDS;
const ENDGAME_LOOP_INTERVAL_SECONDS = 0.8;
const PRELIVE_MUSIC_RETRY_DELAY_TICKS = TICK_RATE;
const PRELIVE_MUSIC_RETRY_ATTEMPTS = 2;
const PRELIVE_ROUNDSTART_VO_COUNTDOWN_SECONDS = 3;
const PRELIVE_ROUNDSTART_VO_FLAG = mod.VoiceOverFlags.Alpha;

// Per-player endgame loop tokens (token invalidation like capture tick loop)
let endgameLoopTokenByPlayerId: { [playerId: number]: number } = {};
let endgameLoopModeByPlayerId: { [playerId: number]: "none" | "win" | "lose" } = {};

/* Cooldowns */
const SFX_CONTEST_COOLDOWN = 2.0;
const SFX_CAPTURE_COOLDOWN = 2.0;
const SFX_TEAMMATE_JOIN_COOLDOWN = 1.0;

const SFX_CONTEST_CD_TICKS = mod.Ceiling(SFX_CONTEST_COOLDOWN * TICK_RATE);
const SFX_CAPTURE_CD_TICKS = mod.Ceiling(SFX_CAPTURE_COOLDOWN * TICK_RATE);
const SFX_JOIN_CD_TICKS = mod.Ceiling(SFX_TEAMMATE_JOIN_COOLDOWN * TICK_RATE);
const CAPTURE_LOOP_VOLUME_FRIENDLY = 0.2;
const CAPTURE_LOOP_VOLUME_NON_FRIENDLY = 0.2;

const CAPTURE_BUILDUP_LEAD_SECONDS = RULES.audio.captureBuildupLeadSeconds;
const CAPTURE_BUILDUP_BEATS = RULES.audio.captureBuildupBeats;
const CAPTURE_BUILDUP_BEAT_INTERVAL_SECONDS = RULES.audio.captureBuildupBeatIntervalSeconds;
const CAPTURE_BUILDUP_PROFILE = RULES.audio.captureBuildupProfile;
const CAPTURE_BUILDUP_BEAT_VOLUMES: readonly number[] = RULES.audio.captureBuildupBeatVolumes;

let lastCaptureBuildupTickByCp: { [cpId: number]: number } = {};
const CAPTURE_BUILDUP_COOLDOWN_TICKS = mod.Ceiling(RULES.audio.captureBuildupCooldownSeconds * TICK_RATE);
let nextCaptureBuildupSessionToken = 1;
let captureBuildupSessionTokenByCpId: { [cpId: number]: number | undefined } = {};
let captureBuildupTeamByCpId: { [cpId: number]: mod.Team | undefined } = {};
let captureBuildupActiveCpIdByPlayerId: { [playerId: number]: number | undefined } = {};
let captureBuildupActiveSessionTokenByPlayerId: { [playerId: number]: number | undefined } = {};


let lastContestSfxTickByCp: { [cpId: number]: number } = {};
let lastCaptureSfxTickByCp: { [cpId: number]: number } = {};
let lastJoinSfxTickByCp: { [cpId: number]: number } = {};

let capturePointContested: { [cpId: number]: boolean } = {};


let lastEnterPointSfxTickByPlayerId: { [playerId: number]: number } = {};
const ENTER_POINT_SFX_COOLDOWN_TICKS = mod.Floor(0.75 * TICK_RATE);

function tryRunMusic(op: string, fn: () => void): boolean {
  if (!MUSIC_ENABLED || !musicRuntimeHealthy) return false;

  try {
    fn();
    return true;
  } catch (err) {
    musicRuntimeHealthy = false;
    LogRuntimeError("Music/" + op, err);
    return false;
  }
}

function resolveConfiguredMusicPackage(): mod.MusicPackages {
  if (MUSIC_PACKAGE === "Core") return mod.MusicPackages.Core;
  if (MUSIC_PACKAGE === "BR") return mod.MusicPackages.BR;
  return mod.MusicPackages.Gauntlet;
}

function clampMusicUrgency(value: number): number {
  let min: number = MUSIC_URGENCY_MIN;
  let max: number = MUSIC_URGENCY_MAX;
  if (min > max) {
    const swap = min;
    min = max;
    max = swap;
  }

  let clamped = value;
  if (!Number.isFinite(clamped)) clamped = min;
  if (clamped < min) clamped = min;
  if (clamped > max) clamped = max;
  return clamped;
}

function resetCoreMusicParamsForTeams(): void {
  if (!MUSIC_ENABLED || !musicRuntimeHealthy) return;

  tryRunMusic("SetParam/Core_IsWinning/team1", () => mod.SetMusicParam(mod.MusicParams.Core_IsWinning, 0, team1));
  tryRunMusic("SetParam/Core_IsWinning/team2", () => mod.SetMusicParam(mod.MusicParams.Core_IsWinning, 0, team2));
  tryRunMusic("SetParam/Core_Urgency/team1", () => mod.SetMusicParam(mod.MusicParams.Core_Urgency, 0, team1));
  tryRunMusic("SetParam/Core_Urgency/team2", () => mod.SetMusicParam(mod.MusicParams.Core_Urgency, 0, team2));
}

function ensureMusicPackageLoaded(): boolean {
  if (!MUSIC_ENABLED || !musicRuntimeHealthy) return false;
  if (musicPackageLoaded) return true;

  const loaded = tryRunMusic("LoadPackage", () => {
    mod.LoadMusic(resolveConfiguredMusicPackage());
  });

  if (!loaded) return false;
  musicPackageLoaded = true;
  resetCoreMusicParamsForTeams();
  return true;
}

function playCoreLiveStartMusic(force: boolean = false): void {
  if (!MUSIC_ENABLED) return;
  if (!force && coreStartMusicTriggeredThisRound) return;
  if (!ensureMusicPackageLoaded()) return;

  tryRunMusic("Play/Core_PhaseBegin", () => mod.PlayMusic(mod.MusicEvents.Core_PhaseBegin));
  tryRunMusic("Play/Core_Deploy_Loop", () => mod.PlayMusic(mod.MusicEvents.Core_Deploy_Loop));
  coreStartMusicTriggeredThisRound = true;
}

function armPreliveMusicRetryWindow(): void {
  preliveMusicRetryAttemptsRemaining = PRELIVE_MUSIC_RETRY_ATTEMPTS;
  preliveMusicRetryNextTick = serverTickCount + PRELIVE_MUSIC_RETRY_DELAY_TICKS;
}

function maybeRetryPreliveMusicStart(): void {
  if (gameStatus !== 2) {
    preliveMusicRetryAttemptsRemaining = 0;
    return;
  }

  if (preliveMusicRetryAttemptsRemaining <= 0) return;
  if (serverTickCount < preliveMusicRetryNextTick) return;

  playCoreLiveStartMusic(true);
  preliveMusicRetryAttemptsRemaining -= 1;
  preliveMusicRetryNextTick = serverTickCount + PRELIVE_MUSIC_RETRY_DELAY_TICKS;
}

function playPreliveRoundStartVoToTeams(): void {
  if (preliveRoundStartVoPlayedThisRound) return;

  playVOToTeam(team1, mod.VoiceOverEvents2D.RoundStartGeneric, PRELIVE_ROUNDSTART_VO_FLAG);
  playVOToTeam(team2, mod.VoiceOverEvents2D.RoundStartGeneric, PRELIVE_ROUNDSTART_VO_FLAG);
  preliveRoundStartVoPlayedThisRound = true;
}

function applyCoreWinningStateForTeams(leader: mod.Team, urgencyValue: number): boolean {
  if (!MUSIC_ENABLED || !ensureMusicPackageLoaded()) return false;

  const urgency = clampMusicUrgency(urgencyValue);
  if (mod.Equals(leader, team1)) {
    coreEndgameWinningTeam = team1;
    tryRunMusic("SetParam/Core_IsWinning/team1", () => mod.SetMusicParam(mod.MusicParams.Core_IsWinning, 1, team1));
    tryRunMusic("SetParam/Core_IsWinning/team2", () => mod.SetMusicParam(mod.MusicParams.Core_IsWinning, 0, team2));
  } else if (mod.Equals(leader, team2)) {
    coreEndgameWinningTeam = team2;
    tryRunMusic("SetParam/Core_IsWinning/team1", () => mod.SetMusicParam(mod.MusicParams.Core_IsWinning, 0, team1));
    tryRunMusic("SetParam/Core_IsWinning/team2", () => mod.SetMusicParam(mod.MusicParams.Core_IsWinning, 1, team2));
  } else {
    coreEndgameWinningTeam = teamNeutral;
    tryRunMusic("SetParam/Core_IsWinning/team1", () => mod.SetMusicParam(mod.MusicParams.Core_IsWinning, 0, team1));
    tryRunMusic("SetParam/Core_IsWinning/team2", () => mod.SetMusicParam(mod.MusicParams.Core_IsWinning, 0, team2));
  }

  tryRunMusic("SetParam/Core_Urgency/team1", () => mod.SetMusicParam(mod.MusicParams.Core_Urgency, urgency, team1));
  tryRunMusic("SetParam/Core_Urgency/team2", () => mod.SetMusicParam(mod.MusicParams.Core_Urgency, urgency, team2));
  return musicRuntimeHealthy;
}

function applyCoreLiveEndgameSuspenseMusic(leader: mod.Team, urgencyValue: number): boolean {
  if (!MUSIC_ENABLED) return false;
  if (!ensureMusicPackageLoaded()) return false;

  if (!coreStartMusicTriggeredThisRound) {
    tryRunMusic("Play/Core_Deploy_Loop/seed", () => mod.PlayMusic(mod.MusicEvents.Core_Deploy_Loop));
    coreStartMusicTriggeredThisRound = true;
  }

  if (!liveEndgameSuspenseEntered) {
    tryRunMusic("Play/Core_LastPhaseBegin", () => mod.PlayMusic(mod.MusicEvents.Core_LastPhaseBegin));
    liveEndgameSuspenseEntered = true;
  }

  postmatchResultMusicActive = false;
  return applyCoreWinningStateForTeams(leader, urgencyValue);
}

function clearCoreLiveEndgameSuspenseState(): void {
  if (!MUSIC_ENABLED || !musicRuntimeHealthy) {
    liveEndgameSuspenseEntered = false;
    coreEndgameWinningTeam = teamNeutral;
    return;
  }

  if (!liveEndgameSuspenseEntered) return;

  resetCoreMusicParamsForTeams();
  liveEndgameSuspenseEntered = false;
  coreEndgameWinningTeam = teamNeutral;
}

function startCorePostmatchResultMusic(): boolean {
  if (!MUSIC_ENABLED) return false;
  if (!ensureMusicPackageLoaded()) return false;

  clearCoreLiveEndgameSuspenseState();

  if (!postmatchResultMusicActive) {
    tryRunMusic("Play/Core_PhaseEnded", () => mod.PlayMusic(mod.MusicEvents.Core_PhaseEnded));
    tryRunMusic("Play/Core_EndOfRound_Loop/team1", () => mod.PlayMusic(mod.MusicEvents.Core_EndOfRound_Loop, team1));
    tryRunMusic("Play/Core_EndOfRound_Loop/team2", () => mod.PlayMusic(mod.MusicEvents.Core_EndOfRound_Loop, team2));
    postmatchResultMusicActive = true;
  }

  return applyCoreWinningStateForTeams(getWinningTeam(), 0);
}

function stopCoreMusicPlayback(): void {
  coreStartMusicTriggeredThisRound = false;
  preliveMusicRetryAttemptsRemaining = 0;
  preliveMusicRetryNextTick = 0;
  preliveRoundStartVoPlayedThisRound = false;
  liveEndgameSuspenseEntered = false;
  postmatchResultMusicActive = false;
  coreEndgameWinningTeam = teamNeutral;
  if (!MUSIC_ENABLED || !musicRuntimeHealthy) return;

  tryRunMusic("Play/Core_Stop", () => mod.PlayMusic(mod.MusicEvents.Core_Stop));
  resetCoreMusicParamsForTeams();
}

function calculateEndgameUrgencyValue(t1Tickets: number, t2Tickets: number, timeLeftSeconds: number): number {
  let urgency = 0;

  if (MUSIC_ENDGAME_TICKET_THRESHOLD > 0) {
    const minTickets = Math.min(t1Tickets, t2Tickets);
    const ticketFactor = 1 - minTickets / MUSIC_ENDGAME_TICKET_THRESHOLD;
    const ticketUrgency = clampMusicUrgency(ticketFactor * MUSIC_URGENCY_MAX);
    if (ticketUrgency > urgency) urgency = ticketUrgency;
  }

  if (MUSIC_ENDGAME_TIME_THRESHOLD_SECONDS > 0) {
    const timeFactor = 1 - timeLeftSeconds / MUSIC_ENDGAME_TIME_THRESHOLD_SECONDS;
    const timeUrgency = clampMusicUrgency(timeFactor * MUSIC_URGENCY_MAX);
    if (timeUrgency > urgency) urgency = timeUrgency;
  }

  return clampMusicUrgency(urgency);
}

function getOpposingTeam(team: mod.Team): mod.Team {
  if (mod.Equals(team, team1)) return team2;
  if (mod.Equals(team, team2)) return team1;
  return teamNeutral;
}

function ensureAudioSpawned(): void {
  if (audioInitialized) return;
  audioInitialized = true;

  SFX_CaptureLeadinFriendly = mod.SpawnObject(
    mod.RuntimeSpawn_Common.SFX_UI_Gamemode_Shared_CaptureObjectives_CaptureLeadinFriendly_OneShot2D,
    mod.CreateVector(0, 0, 0),
    mod.CreateVector(0, 0, 0),
    mod.CreateVector(0, 0, 0)
  );

  SFX_CaptureLeadinEnemy = mod.SpawnObject(
    mod.RuntimeSpawn_Common.SFX_UI_Gamemode_Shared_CaptureObjectives_CaptureLeadinEnemy_OneShot2D,
    mod.CreateVector(0, 0, 0),
    mod.CreateVector(0, 0, 0),
    mod.CreateVector(0, 0, 0)
  );

  SFX_CaptureLeadinNeutral = mod.SpawnObject(
    mod.RuntimeSpawn_Common.SFX_UI_Gamemode_Shared_CaptureObjectives_CaptureLeadinNeutral_OneShot2D,
    mod.CreateVector(0, 0, 0),
    mod.CreateVector(0, 0, 0),
    mod.CreateVector(0, 0, 0)
  );

  SFX_CaptureLeadinThump = mod.SpawnObject(
    mod.RuntimeSpawn_Common.SFX_UI_Gamemode_Shared_CaptureObjectives_CaptureLeadinThump_OneShot2D,
    mod.CreateVector(0, 0, 0),
    mod.CreateVector(0, 0, 0),
    mod.CreateVector(0, 0, 0)
  );

  SFX_CapturingTickInBetweenFriendly = mod.SpawnObject(
    mod.RuntimeSpawn_Common.SFX_UI_Gamemode_Shared_CaptureObjectives_CapturingTickInBetweenFriendly_OneShot2D,
    mod.CreateVector(0, 0, 0),
    mod.CreateVector(0, 0, 0),
    mod.CreateVector(0, 0, 0)
  );

  SFX_CapturingTickInBetweenEnemy = mod.SpawnObject(
    mod.RuntimeSpawn_Common.SFX_UI_Gamemode_Shared_CaptureObjectives_CapturingTickInBetweenEnemy_OneShot2D,
    mod.CreateVector(0, 0, 0),
    mod.CreateVector(0, 0, 0),
    mod.CreateVector(0, 0, 0)
  );

    // Looping capture tick sounds (SimpleLoop2D)
  SFX_TickFriendlyLoop = mod.SpawnObject(
    mod.RuntimeSpawn_Common.SFX_UI_Gamemode_Shared_CaptureObjectives_CapturingTick_IsFriendly_SimpleLoop2D,
    mod.CreateVector(0, 0, 0),
    mod.CreateVector(0, 0, 0),
    mod.CreateVector(0, 0, 0)
  );

  SFX_TickEnemyLoop = mod.SpawnObject(
    mod.RuntimeSpawn_Common.SFX_UI_Gamemode_Shared_CaptureObjectives_CapturingTick_IsEnemy_SimpleLoop2D,
    mod.CreateVector(0, 0, 0),
    mod.CreateVector(0, 0, 0),
    mod.CreateVector(0, 0, 0)
  );

  SFX_TickContestedLoop = mod.SpawnObject(
    mod.RuntimeSpawn_Common.SFX_UI_Gamemode_Shared_CaptureObjectives_OnContested_SimpleLoop2D,
    mod.CreateVector(0, 0, 0),
    mod.CreateVector(0, 0, 0),
    mod.CreateVector(0, 0, 0)
  );


  SFX_ReadyUp = mod.SpawnObject(
    mod.RuntimeSpawn_Common.SFX_UI_SP_Collectibles_Dogtag_OneShot2D,
    mod.CreateVector(0, 0, 0),
    mod.CreateVector(0, 0, 0),
    mod.CreateVector(0, 0, 0)
  );

  SFX_CountdownHeartbeat = mod.SpawnObject(
    mod.RuntimeSpawn_Common.SFX_UI_Shared_Countdown_Tick_Urgent_OneShot2D,
    mod.CreateVector(0, 0, 0),
    mod.CreateVector(0, 0, 0),
    mod.CreateVector(0, 0, 0)
  );

  SFX_TickFriendly = mod.SpawnObject(
    mod.RuntimeSpawn_Common.SFX_UI_Gauntlet_Standoff_ZoneCaptureTick_OneShot2D,
    mod.CreateVector(0, 0, 0),
    mod.CreateVector(0, 0, 0),
    mod.CreateVector(0, 0, 0)
  );

  SFX_TickEnemy = mod.SpawnObject(
    mod.RuntimeSpawn_Common.SFX_UI_Gamemode_Shared_CaptureObjectives_CapturingTickEnemy_OneShot2D,
    mod.CreateVector(0, 0, 0),
    mod.CreateVector(0, 0, 0),
    mod.CreateVector(0, 0, 0)
  );

  SFX_CapturedFriendly = mod.SpawnObject(
    mod.RuntimeSpawn_Common.SFX_UI_Gamemode_Shared_CaptureObjectives_OnCapturedByFriendly_OneShot2D,
    mod.CreateVector(0, 0, 0),
    mod.CreateVector(0, 0, 0),
    mod.CreateVector(0, 0, 0)
  );

  SFX_ThumpFriendly = mod.SpawnObject(
    mod.RuntimeSpawn_Common.SFX_UI_Gamemode_Shared_CaptureObjectives_CapturingThumpFriendly_OneShot2D,
    mod.CreateVector(0, 0, 0),
    mod.CreateVector(0, 0, 0),
    mod.CreateVector(0, 0, 0)
  );

  SFX_ThumpEnemy = mod.SpawnObject(
    mod.RuntimeSpawn_Common.SFX_UI_Gamemode_Shared_CaptureObjectives_CapturingThumpEnemy_OneShot2D,
    mod.CreateVector(0, 0, 0),
    mod.CreateVector(0, 0, 0),
    mod.CreateVector(0, 0, 0)
  );

  SFX_MatchStartStinger = mod.SpawnObject(
    mod.RuntimeSpawn_Common.SFX_UI_Gamemode_Shared_Intro_FinalImpact_OneShot2D,
    mod.CreateVector(0, 0, 0),
    mod.CreateVector(0, 0, 0),
    mod.CreateVector(0, 0, 0)
  );

    // End-of-round suspense loops
  // Winning team: satisfying / anticipatory tension
  SFX_Endgame_WinningLoop = mod.SpawnObject(
    mod.RuntimeSpawn_Common.SFX_GameModes_BR_Circle_DamageStop_Loop2D,
    mod.CreateVector(0, 0, 0),
    mod.CreateVector(0, 0, 0),
    mod.CreateVector(0, 0, 0)
  );

  // Losing team: hopeless / pressure tone
  SFX_Endgame_LosingLoop = mod.SpawnObject(
    mod.RuntimeSpawn_Common.SFX_GameModes_BR_Circle_DeathWarning_SimpleLoop2D,
    mod.CreateVector(0, 0, 0),
    mod.CreateVector(0, 0, 0),
    mod.CreateVector(0, 0, 0)
  );


    // Postmatch result sounds
  // "Qualified" reads as a positive/celebration stinger in Portal
  SFX_PostMatchVictory = mod.SpawnObject(
    mod.RuntimeSpawn_Common.SFX_UI_Gauntlet_EOM_Qualified_OneShot2D,
    mod.CreateVector(0, 0, 0),
    mod.CreateVector(0, 0, 0),
    mod.CreateVector(0, 0, 0)
  );

  // Defeat stinger
  SFX_PostMatchDefeat = mod.SpawnObject(
    mod.RuntimeSpawn_Common.SFX_UI_Gauntlet_EOM_Defeat_OneShot2D,
    mod.CreateVector(0, 0, 0),
    mod.CreateVector(0, 0, 0),
    mod.CreateVector(0, 0, 0)
  );


  VO_Module = mod.SpawnObject(
    mod.RuntimeSpawn_Common.SFX_VOModule_OneShot2D,
    mod.CreateVector(0, 0, 0),
    mod.CreateVector(0, 0, 0),
    mod.CreateVector(0, 0, 0)
  );

    // Restricted Area / Out-of-bounds warning loop (SimpleLoop2D)
  SFX_OutOfBoundsCountdownLoop = mod.SpawnObject(
    mod.RuntimeSpawn_Common.SFX_UI_Gamemode_Shared_OutOfBounds_SFXLoop_SimpleLoop2D,
    mod.CreateVector(0, 0, 0),
    mod.CreateVector(0, 0, 0),
    mod.CreateVector(0, 0, 0)
  );

}

function forEachPlayerOnTeam(team: mod.Team, fn: (p: Player) => void): void {
  serverPlayers.forEach((p) => {
    if (mod.Equals(mod.GetTeam(p.player), team)) fn(p);
  });
}

function stopCaptureTickLoop(playerId: number): void {
  const p = serverPlayers.get(playerId);
  if (p && mod.IsPlayerValid(p.player)) {
    stopCaptureTickLoopsForPlayer(p.player, playerId);
    return;
  }

  captureTickLoopStateByPlayerId[playerId] = "none";
}

function stopCaptureBuildupSfxForPlayer(player: mod.Player): void {
  if (SFX_CaptureLeadinFriendly) mod.StopSound(SFX_CaptureLeadinFriendly, player);
  if (SFX_CaptureLeadinEnemy) mod.StopSound(SFX_CaptureLeadinEnemy, player);
  if (SFX_CaptureLeadinNeutral) mod.StopSound(SFX_CaptureLeadinNeutral, player);
  if (SFX_CaptureLeadinThump) mod.StopSound(SFX_CaptureLeadinThump, player);
  if (SFX_CapturingTickInBetweenFriendly) mod.StopSound(SFX_CapturingTickInBetweenFriendly, player);
  if (SFX_CapturingTickInBetweenEnemy) mod.StopSound(SFX_CapturingTickInBetweenEnemy, player);
}

function clearCaptureBuildupTrackingForPlayer(playerId: number, stopSounds: boolean = true): void {
  const p = serverPlayers.get(playerId);
  if (stopSounds && p && mod.IsPlayerValid(p.player)) {
    stopCaptureBuildupSfxForPlayer(p.player);
  }

  delete captureBuildupActiveCpIdByPlayerId[playerId];
  delete captureBuildupActiveSessionTokenByPlayerId[playerId];
}

function stopCaptureBuildupForPlayer(playerId: number): void {
  clearCaptureBuildupTrackingForPlayer(playerId, true);
}

function invalidateCaptureBuildupSessionForCp(cpId: number): void {
  delete captureBuildupSessionTokenByCpId[cpId];
  delete captureBuildupTeamByCpId[cpId];

  serverPlayers.forEach((sp) => {
    if (captureBuildupActiveCpIdByPlayerId[sp.id] !== cpId) return;
    clearCaptureBuildupTrackingForPlayer(sp.id, true);
  });
}

function resetAllCaptureBuildupState(stopPlayerSounds: boolean): void {
  if (stopPlayerSounds) {
    serverPlayers.forEach((sp) => clearCaptureBuildupTrackingForPlayer(sp.id, true));
  } else {
    captureBuildupActiveCpIdByPlayerId = {};
    captureBuildupActiveSessionTokenByPlayerId = {};
  }

  lastCaptureBuildupTickByCp = {};
  captureBuildupSessionTokenByCpId = {};
  captureBuildupTeamByCpId = {};
  nextCaptureBuildupSessionToken = 1;
}

function beginCaptureBuildupSession(cpId: number, capturingTeam: mod.Team): number {
  invalidateCaptureBuildupSessionForCp(cpId);

  const sessionToken = nextCaptureBuildupSessionToken++;
  captureBuildupSessionTokenByCpId[cpId] = sessionToken;
  captureBuildupTeamByCpId[cpId] = capturingTeam;
  return sessionToken;
}

function isCaptureBuildupPlayerEligible(
  cp: CapturePoint,
  playerId: number,
  capturingTeam: mod.Team,
  sessionToken: number
): boolean {
  if (gameStatus !== 3) return false;
  if (captureBuildupSessionTokenByCpId[cp.id] !== sessionToken) return false;

  const sessionTeam = captureBuildupTeamByCpId[cp.id];
  if (!sessionTeam || !mod.Equals(sessionTeam, capturingTeam)) return false;
  const onPoint = cp.getOnPoint();
  if (onPoint[0] > 0 && onPoint[1] > 0) return false;
  if (cp.getCaptureProgressDirection() < 0) return false;
  if (cp.getCaptureProgress() >= PROGRESS_FULL) return false;
  if (mod.Equals(cp.getProgressTeam(), teamNeutral)) return false;
  if (!mod.Equals(cp.getProgressTeam(), capturingTeam)) return false;
  if (cp.getPlayerIdsOnPoint().indexOf(playerId) < 0) return false;

  const sp = serverPlayers.get(playerId);
  if (!sp) return false;
  if (!sp.isDeployed) return false;
  if (!mod.IsPlayerValid(sp.player)) return false;
  if (!kernelIsPlayerAlive(sp.player)) return false;
  if (!mod.Equals(mod.GetTeam(sp.player), capturingTeam)) return false;

  return true;
}

function syncCaptureBuildupPlayersForSession(
  cp: CapturePoint,
  capturingTeam: mod.Team,
  sessionToken: number
): void {
  serverPlayers.forEach((sp) => {
    if (captureBuildupActiveCpIdByPlayerId[sp.id] !== cp.id) return;
    if (captureBuildupActiveSessionTokenByPlayerId[sp.id] !== sessionToken) return;
    if (isCaptureBuildupPlayerEligible(cp, sp.id, capturingTeam, sessionToken)) return;

    clearCaptureBuildupTrackingForPlayer(sp.id, true);
  });
}

function stopEndgameLoop(playerId: number): void {
  const t = endgameLoopTokenByPlayerId[playerId] ?? 0;
  endgameLoopTokenByPlayerId[playerId] = t + 1;
  endgameLoopModeByPlayerId[playerId] = "none";

  const p = serverPlayers.get(playerId);
  if (p && mod.IsPlayerValid(p.player)) {
    stopEndgameLoopForPlayer(p.player, playerId);
    return;
  }

  endgameLoopStateByPlayerId[playerId] = "none";
}
function startRestrictedAreaLoopSfxForPlayer(player: mod.Player): void {
  if (!SFX_OutOfBoundsCountdownLoop) return;
  mod.PlaySound(SFX_OutOfBoundsCountdownLoop, 1.0, player);
}

function stopRestrictedAreaLoopSfxForPlayer(player: mod.Player): void {
  if (!SFX_OutOfBoundsCountdownLoop) return;
  mod.StopSound(SFX_OutOfBoundsCountdownLoop, player);
}

async function startEndgameLoop(playerId: number, mode: "win" | "lose"): Promise<void> {
  stopEndgameLoop(playerId);
  endgameLoopModeByPlayerId[playerId] = mode;

  const myToken = endgameLoopTokenByPlayerId[playerId];

  while (true) {
    if (endgameLoopTokenByPlayerId[playerId] !== myToken) return;
    if (gameStatus !== 3) return;

    const sp = serverPlayers.get(playerId);
    if (!sp) return;
    if (!sp.isDeployed) return;
    if (!mod.IsPlayerValid(sp.player)) return;
    if (!kernelIsPlayerAlive(sp.player)) return;

    // Use only sounds you already spawn and already know work.
    if (mode === "win") {
      if (SFX_Endgame_WinningLoop) mod.PlaySound(SFX_Endgame_WinningLoop, 0.25, sp.player);
    } else {
      if (SFX_Endgame_LosingLoop) mod.PlaySound(SFX_Endgame_LosingLoop, 0.25, sp.player);
    }

    await mod.Wait(ENDGAME_LOOP_INTERVAL_SECONDS);
  }
}

function StopAllEndgameLoops(): void {
  serverPlayers.forEach((p) => stopEndgameLoop(p.id));
}
function getCaptureBuildupBeatVolume(beatIndex: number): number {
  if (!CAPTURE_BUILDUP_BEAT_VOLUMES || CAPTURE_BUILDUP_BEAT_VOLUMES.length <= 0) return 0.2;
  const clampedIndex = Math.min(beatIndex, CAPTURE_BUILDUP_BEAT_VOLUMES.length - 1);
  return CAPTURE_BUILDUP_BEAT_VOLUMES[clampedIndex];
}

function getEffectiveCaptureTimeForMajorityCount(majorityCount: number): number {
  let mult = 1;
  if (majorityCount >= 2) mult = CAPTURE_MULTIPLIER_FOR_2_PLAYERS;
  if (mult > CAPTURE_MULTIPLIER_MAX) mult = CAPTURE_MULTIPLIER_MAX;
  return CAPTURE_TIME / mult;
}

function playCaptureBuildupBeat(receiver: mod.Player, capturingTeam: mod.Team, beatIndex: number): void {
  const volume = getCaptureBuildupBeatVolume(beatIndex);
  const isFinalBeat = beatIndex >= CAPTURE_BUILDUP_BEATS - 1;
  const isPenultimateBeat = CAPTURE_BUILDUP_BEATS > 1 && beatIndex === CAPTURE_BUILDUP_BEATS - 2;

  if (CAPTURE_BUILDUP_PROFILE === "captureLeadin") {
    const receiverTeam = mod.GetTeam(receiver);

    if (isFinalBeat && SFX_CaptureLeadinThump) {
      mod.PlaySound(SFX_CaptureLeadinThump, volume, receiver);
      return;
    }

    if (isPenultimateBeat) {
      let inBetween = SFX_CapturingTickInBetweenFriendly;
      if (!mod.Equals(capturingTeam, teamNeutral)) {
        inBetween =
          mod.Equals(receiverTeam, capturingTeam)
            ? SFX_CapturingTickInBetweenFriendly
            : SFX_CapturingTickInBetweenEnemy;
      }

      if (inBetween) {
        mod.PlaySound(inBetween, volume, receiver);
        return;
      }
    }

    let leadin = SFX_CaptureLeadinNeutral;

    if (!mod.Equals(capturingTeam, teamNeutral)) {
      leadin = mod.Equals(receiverTeam, capturingTeam) ? SFX_CaptureLeadinFriendly : SFX_CaptureLeadinEnemy;
    }

    if (leadin) {
      mod.PlaySound(leadin, volume, receiver);
      return;
    }
  }

  if (SFX_CaptureLeadinThump) {
    mod.PlaySound(SFX_CaptureLeadinThump, volume, receiver);
  }
}

function stopEndgameLoopForPlayer(player: mod.Player, playerId: number): void {
  if (SFX_Endgame_WinningLoop) mod.StopSound(SFX_Endgame_WinningLoop, player);
  if (SFX_Endgame_LosingLoop) mod.StopSound(SFX_Endgame_LosingLoop, player);
  endgameLoopStateByPlayerId[playerId] = "none";
}

function setEndgameLoopForPlayer(
  player: mod.Player,
  playerId: number,
  desired: "none" | "win" | "lose"
): void {
  const current = endgameLoopStateByPlayerId[playerId] ?? "none";
  if (current === desired) return;

  // Stop previous loop
  if (SFX_Endgame_WinningLoop) mod.StopSound(SFX_Endgame_WinningLoop, player);
  if (SFX_Endgame_LosingLoop) mod.StopSound(SFX_Endgame_LosingLoop, player);

  if (desired === "win") {
    if (SFX_Endgame_WinningLoop) mod.PlaySound(SFX_Endgame_WinningLoop, 0.25, player);
  } else if (desired === "lose") {
    if (SFX_Endgame_LosingLoop) mod.PlaySound(SFX_Endgame_LosingLoop, 0.25, player);
  }

  endgameLoopStateByPlayerId[playerId] = desired;
}
function UpdateEndgameSuspenseAudio(): void {
  if (gameStatus !== 3) {
    clearCoreLiveEndgameSuspenseState();
    StopAllEndgameLoops();
    endgameSuspenseDirty = false;
    return;
  }

  const timeLeft = mod.Max(0, ROUND_TIME - phaseTickCount / TICK_RATE);

  // Compare with CEILING tickets so it matches what players see.
  const t1Tickets = mod.Ceiling(serverScores[0]);
  const t2Tickets = mod.Ceiling(serverScores[1]);

  const endByTicketsSoon = t1Tickets <= ENDGAME_TICKET_THRESHOLD || t2Tickets <= ENDGAME_TICKET_THRESHOLD;
  const endByTimeSoon = timeLeft <= ENDGAME_TIME_THRESHOLD_SECONDS;

  if (!liveEndgameSuspenseEntered && !endByTicketsSoon && !endByTimeSoon) {
    StopAllEndgameLoops();
    endgameSuspenseDirty = false;
    return;
  }

  // Current leader decides win/lose mood.
  let leader: mod.Team = teamNeutral;
  if (t1Tickets > t2Tickets) leader = team1;
  else if (t2Tickets > t1Tickets) leader = team2;

  const urgencyValue = calculateEndgameUrgencyValue(t1Tickets, t2Tickets, timeLeft);
  const musicApplied = applyCoreLiveEndgameSuspenseMusic(leader, urgencyValue);
  if (musicApplied) {
    StopAllEndgameLoops();
    endgameSuspenseDirty = false;
    endgameAudioFlushes += 1;
    return;
  }

  if (!MUSIC_FALLBACK_TO_SFX_LOOPS) {
    StopAllEndgameLoops();
    endgameSuspenseDirty = false;
    endgameAudioFlushes += 1;
    return;
  }

  serverPlayers.forEach((sp) => {
    if (!sp) return;
    if (!sp.isDeployed) return;
    if (!mod.IsPlayerValid(sp.player)) return;

    const playerTeam = mod.GetTeam(sp.player);

    let desired: "none" | "win" | "lose" = "none";
    if (!mod.Equals(leader, teamNeutral)) {
      if (mod.Equals(playerTeam, leader)) desired = "win";
      else if (mod.Equals(playerTeam, team1) || mod.Equals(playerTeam, team2)) desired = "lose";
    }
    setEndgameLoopForPlayer(sp.player, sp.id, desired);
  });

  endgameSuspenseDirty = false;
  endgameAudioFlushes += 1;
}


async function playCaptureBuildupToCapturingTeamOnPoint(cp: CapturePoint, capturingTeam: mod.Team): Promise<void> {
  // Rate limit per capture point so it does not spam.
  const last = lastCaptureBuildupTickByCp[cp.id] ?? -999999;
  if (serverTickCount - last < CAPTURE_BUILDUP_COOLDOWN_TICKS) return;
  lastCaptureBuildupTickByCp[cp.id] = serverTickCount;
  const sessionToken = beginCaptureBuildupSession(cp.id, capturingTeam);

  // Play a short 3-beat buildup only to the capturing team currently on the point.
  for (let beat = 0; beat < CAPTURE_BUILDUP_BEATS; beat++) {
    if (captureBuildupSessionTokenByCpId[cp.id] !== sessionToken) return;

    syncCaptureBuildupPlayersForSession(cp, capturingTeam, sessionToken);
    const ids = cp.getPlayerIdsOnPoint();
    let playedBeat = false;

    for (let i = 0; i < ids.length; i++) {
      const pid = ids[i];
      if (!isCaptureBuildupPlayerEligible(cp, pid, capturingTeam, sessionToken)) {
        clearCaptureBuildupTrackingForPlayer(pid, true);
        continue;
      }

      const p = serverPlayers.get(pid);
      if (!p) continue;
      captureBuildupActiveCpIdByPlayerId[pid] = cp.id;
      captureBuildupActiveSessionTokenByPlayerId[pid] = sessionToken;

      playCaptureBuildupBeat(p.player, capturingTeam, beat);
      playedBeat = true;
    }

    if (!playedBeat) {
      invalidateCaptureBuildupSessionForCp(cp.id);
      return;
    }

    if (beat >= CAPTURE_BUILDUP_BEATS - 1) return;
    await mod.Wait(CAPTURE_BUILDUP_BEAT_INTERVAL_SECONDS);
  }
}

function playTickFriendly(receiver: mod.Player): void {
  // The CaptureObjectives ticking runtime spawners can be silent or unavailable in some Portal builds.
  // Use the countdown heartbeat sound as the reliable capture tick.
  if (SFX_TickFriendly) {
    mod.PlaySound(SFX_TickFriendly, 0.1, receiver);
    return;
  }

  // Fallbacks if heartbeat is not available for some reason.
  if (SFX_ThumpFriendly) {
    mod.PlaySound(SFX_ThumpFriendly, 0.2, receiver);
    return;
  }

  if (SFX_TickFriendly) mod.PlaySound(SFX_TickFriendly, 0.1, receiver);
}

function playTickEnemy(receiver: mod.Player): void {
  // Use the same reliable tick during contest/pressure.
  if (SFX_TickEnemy) {
    mod.PlaySound(SFX_TickEnemy, 0.2, receiver);
    return;
  }

  // Fallbacks.
  if (SFX_ThumpEnemy) {
    mod.PlaySound(SFX_ThumpEnemy, 0.2, receiver);
    return;
  }

  if (SFX_TickEnemy) mod.PlaySound(SFX_TickEnemy, 0.2, receiver);
}

function stopCaptureTickLoopsForPlayer(player: mod.Player, playerId: number): void {
  // Stop all capture loops so we never overlap
  if (SFX_TickFriendlyLoop) mod.StopSound(SFX_TickFriendlyLoop, player);
  if (SFX_TickEnemyLoop) mod.StopSound(SFX_TickEnemyLoop, player);
  if (SFX_TickContestedLoop) mod.StopSound(SFX_TickContestedLoop, player);

  captureTickLoopStateByPlayerId[playerId] = "none";
}

function setCaptureTickLoopForPlayer(
  player: mod.Player,
  playerId: number,
  desired: "none" | "friendly" | "enemy" | "contested"
): void {
  const current = captureTickLoopStateByPlayerId[playerId] ?? "none";
  if (current === desired) return;

  // Always stop previous loop first
  if (SFX_TickFriendlyLoop) mod.StopSound(SFX_TickFriendlyLoop, player);
  if (SFX_TickEnemyLoop) mod.StopSound(SFX_TickEnemyLoop, player);
  if (SFX_TickContestedLoop) mod.StopSound(SFX_TickContestedLoop, player);

  if (desired === "friendly") {
    if (SFX_TickFriendlyLoop) mod.PlaySound(SFX_TickFriendlyLoop, CAPTURE_LOOP_VOLUME_FRIENDLY, player);
  } else if (desired === "enemy") {
    if (SFX_TickEnemyLoop) mod.PlaySound(SFX_TickEnemyLoop, CAPTURE_LOOP_VOLUME_NON_FRIENDLY, player);
  } else if (desired === "contested") {
    if (SFX_TickContestedLoop) mod.PlaySound(SFX_TickContestedLoop, CAPTURE_LOOP_VOLUME_NON_FRIENDLY, player);
  }

  captureTickLoopStateByPlayerId[playerId] = desired;
}

function StopAllCaptureTickLoops(): void {
  serverPlayers.forEach((p) => {
    if (!p) return;
    if (!mod.IsPlayerValid(p.player)) return;
    stopCaptureTickLoopsForPlayer(p.player, p.id);
  });
}


/*
  Global loop manager:
  - For each deployed/alive player, decide what they should hear:
      none: not on a point or no contest/progress activity
      friendly: player is on point AND their team is the majority capturing/neutralizing (not contested)
      contested: player is on a contested point and is not minority (equal counts or majority side)
      enemy: player is on a contested point as minority OR not majority during neutralize/capture pressure
  - Start/stop loops only on state changes (no spam).
*/
function UpdateCaptureTickLoopsGlobal(): void {
  if (gameStatus !== 3) {
    StopAllCaptureTickLoops();
    return;
  }

  const desiredByPlayerId: { [playerId: number]: "none" | "friendly" | "enemy" | "contested" } = {};

  Object.values(serverCapturePoints).forEach((cpWrap) => {
    const playerIds = cpWrap.getPlayerIdsOnPoint();
    if (!playerIds || playerIds.length === 0) return;

    const on = cpWrap.getOnPoint();
    const hasT1 = on[0] > 0;
    const hasT2 = on[1] > 0;
    if (!hasT1 && !hasT2) return;

    const contested = hasT1 && hasT2;
    const majority = getMajorityTeamOnPoint(cpWrap);
    const phase = getCapturePointPhase(cpWrap);
    const progressTeam = cpWrap.getProgressTeam();

    if (!contested && (phase === "neutral_idle" || phase === "owned_idle")) return;

    for (let i = 0; i < playerIds.length; i++) {
      const playerId = playerIds[i];
      const sp = serverPlayers.get(playerId);
      if (!sp) continue;
      if (!sp.isDeployed) continue;
      if (!mod.IsPlayerValid(sp.player)) continue;
      if (!kernelIsPlayerAlive(sp.player)) continue;

      const playerTeam = mod.GetTeam(sp.player);

      if (contested) {
        if (mod.Equals(majority, teamNeutral)) {
          desiredByPlayerId[playerId] = "contested";
        } else if (mod.Equals(playerTeam, majority)) {
          desiredByPlayerId[playerId] = "contested";
        } else {
          desiredByPlayerId[playerId] = "enemy";
        }
        continue;
      }

      if (mod.Equals(progressTeam, teamNeutral)) {
        desiredByPlayerId[playerId] = "enemy";
        continue;
      }

      desiredByPlayerId[playerId] = mod.Equals(playerTeam, progressTeam) ? "friendly" : "enemy";
    }
  });

  serverPlayers.forEach((sp) => {
    if (!sp) return;

    const player = sp.player;
    const playerId = sp.id;

    if (!sp.isDeployed || !mod.IsPlayerValid(player) || !kernelIsPlayerAlive(player)) {
      if (mod.IsPlayerValid(player)) stopCaptureTickLoopsForPlayer(player, playerId);
      else captureTickLoopStateByPlayerId[playerId] = "none";
      return;
    }

    setCaptureTickLoopForPlayer(player, playerId, desiredByPlayerId[playerId] ?? "none");
  });
}


function playCapturedSfx(receiver: mod.Player): void {
  if (SFX_CapturedFriendly) mod.PlaySound(SFX_CapturedFriendly, 1.0, receiver);
}

function playThumpFriendly(receiver: mod.Player): void {
  if (SFX_ThumpFriendly) mod.PlaySound(SFX_ThumpFriendly, 0.8, receiver);
}

function playThumpEnemy(receiver: mod.Player): void {
  if (SFX_ThumpEnemy) mod.PlaySound(SFX_ThumpEnemy, 0.8, receiver);
}

function playCountdownHeartbeatToAll(volume: number): void {
  if (!SFX_CountdownHeartbeat) return;
  serverPlayers.forEach((p) => mod.PlaySound(SFX_CountdownHeartbeat, volume, p.player));
}

function playMatchStartStingerToAll(volume: number): void {
  if (!SFX_MatchStartStinger) return;
  serverPlayers.forEach((p) => mod.PlaySound(SFX_MatchStartStinger, volume, p.player));
}

function playVOToPlayer(receiver: mod.Player, evt: mod.VoiceOverEvents2D, flag: mod.VoiceOverFlags): void {
  if (VO_Module) mod.PlayVO(VO_Module, evt, flag, receiver);
}

function playVOToTeam(team: mod.Team, evt: mod.VoiceOverEvents2D, flag: mod.VoiceOverFlags): void {
  if (VO_Module) mod.PlayVO(VO_Module, evt, flag, team);
}

function playSfxToTeam(team: mod.Team, kind: "tickFriendly" | "tickEnemy"): void {
  forEachPlayerOnTeam(team, (p) => {
    if (kind === "tickFriendly") playTickFriendly(p.player);
    else playTickEnemy(p.player);
  });
}

function playPostMatchResultSfxOnce(): void {
  if (postmatchResultSfxPlayed) return;
  postmatchResultSfxPlayed = true;

  const winner = getWinningTeam();
  if (mod.Equals(winner, teamNeutral)) return;

  serverPlayers.forEach((p) => {
    const t = mod.GetTeam(p.player);

    // Winner hears victory, losers hear defeat
    if (mod.Equals(t, winner)) {
      if (SFX_PostMatchVictory) mod.PlaySound(SFX_PostMatchVictory, 1.0, p.player);
    } else if (mod.Equals(t, team1) || mod.Equals(t, team2)) {
      if (SFX_PostMatchDefeat) mod.PlaySound(SFX_PostMatchDefeat, 1.0, p.player);
    }
  });
}


function canPlayCpSfx(cdTicks: number, lastMap: { [cpId: number]: number }, cpId: number): boolean {
  const last = lastMap[cpId] ?? -9999999;
  return serverTickCount - last >= cdTicks;
}

function markCpSfx(lastMap: { [cpId: number]: number }, cpId: number): void {
  lastMap[cpId] = serverTickCount;
}

/* =================================================================================================
   6) UI (PARSE UI + PER-PLAYER HUD)
================================================================================================= */
const TICKETS_BAR_MAX = INITIAL_TICKETS;

let UIContainers: mod.UIWidget[] = [];

const LIVE_UI_SLOTS_PER_TEAM = 32;
type LiveUiTeamKey = "T1" | "T2";
const SPECTATOR_LIVE_UI_TEAM_KEY: LiveUiTeamKey = "T1";
const SPECTATOR_LIVE_UI_SLOT_INDEX = 31;
const SPECTATOR_LIVE_UI_SLOT_KEY = "T1_31";
type LiveUiFlagSymbol = "A" | "B" | "C";
const LIVE_HUD_FLAG_SYMBOLS: LiveUiFlagSymbol[] = ["A", "B", "C"];

type LiveUiSlotAssignment = {
  teamKey: LiveUiTeamKey;
  slotIndex: number;
  slotKey: string;
};

let liveUiSlotByPlayerId: { [playerId: number]: LiveUiSlotAssignment | undefined } = {};
let playerIdByLiveUiSlotTeam1: Array<number | undefined> = new Array(LIVE_UI_SLOTS_PER_TEAM);
let playerIdByLiveUiSlotTeam2: Array<number | undefined> = new Array(LIVE_UI_SLOTS_PER_TEAM);
let lastActiveTimerCount = 0;
let liveUiAssignedSlotCount = 0;
let liveUiFailedAssignmentCount = 0;
let liveUiSlotExhaustedWarnedByTeamKey: { [teamKey: string]: boolean } = {};
const LIVE_HUD_PREBUILD_PLAYERS_PER_TICK = 4;
let liveHudPrebuildQueue: number[] = [];
let liveHudPrebuildQueuedByPlayerId: { [playerId: number]: boolean } = {};

let readyTextBuiltByPlayerId: { [playerId: number]: boolean } = {};
let readyTextWidgetByPlayerId: { [playerId: number]: mod.UIWidget } = {};


/* Prematch roster UI */
const MAX_ROSTER_LINES = 32;
let prematchRosterBuilt: boolean = false;
let prematchRosterTeam1: Array<mod.UIWidget | null> = [];
let prematchRosterTeam2: Array<mod.UIWidget | null> = [];
const POSTMATCH_MAX_LINES = 24;

let postMatchWidgetsToDelete: string[] = [];

/* VoiceOver flag mapping */
const voflags: { [key: string]: mod.VoiceOverFlags } = {
  A: mod.VoiceOverFlags.Alpha,
  B: mod.VoiceOverFlags.Bravo,
  C: mod.VoiceOverFlags.Charlie,
};
const PREMATCH_SAFE_ROOT_WIDTH = 7000;
const PREMATCH_SAFE_ROOT_HEIGHT = 7000;
const PREMATCH_PANEL_NAME = "PreMatchPanel";
const PREMATCH_PANEL_POS_X = -560;
const PREMATCH_PANEL_POS_Y = -176;
const PREMATCH_PANEL_WIDTH = 292;
const PREMATCH_PANEL_HEIGHT = 572;
const PREMATCH_PANEL_ANCHOR = mod.UIAnchor.Center;
const SCREEN_UI_REFERENCE_WIDTH = 1920;
const SCREEN_UI_REFERENCE_HEIGHT = 1080;

function convertTopOffsetToCenteredY(topOffset: number, widgetHeight: number): number {
  return topOffset + widgetHeight / 2 - SCREEN_UI_REFERENCE_HEIGHT / 2;
}

const LIVE_CONTAINER_WIDTH = 900;
const LIVE_CONTAINER_HEIGHT = 140;
const LIVE_CONTAINER_CENTERED_POS_Y = convertTopOffsetToCenteredY(30, LIVE_CONTAINER_HEIGHT);
const COUNTDOWN_CONTAINER_WIDTH = 300;
const COUNTDOWN_CONTAINER_HEIGHT = 150;
const COUNTDOWN_CONTAINER_CENTERED_POS_Y = convertTopOffsetToCenteredY(150, COUNTDOWN_CONTAINER_HEIGHT);

/* -----------------------------------------------------------------------------------------------
   Top-level UI layout
------------------------------------------------------------------------------------------------ */

const UIWidget = modlib.ParseUI({
  name: "UIContainer",
  type: "Container",
  position: [0, 0],
  size: [SCREEN_UI_REFERENCE_WIDTH, SCREEN_UI_REFERENCE_HEIGHT],
  anchor: mod.UIAnchor.Center,
  visible: true,
  padding: 0,
  bgColor: [0, 0, 0],
  bgAlpha: 1,
  bgFill: mod.UIBgFill.None,
  children: [
    {
      name: "LiveContainer",
      type: "Container",
      position: [0, LIVE_CONTAINER_CENTERED_POS_Y],
      size: [LIVE_CONTAINER_WIDTH, LIVE_CONTAINER_HEIGHT],
      anchor: mod.UIAnchor.Center,
      visible: false,
      padding: 0,
      bgColor: [0, 0, 0],
      bgAlpha: 0,
      bgFill: mod.UIBgFill.None,
      children: [
        {
          name: "matchtime",
          type: "Container",
          position: [0, 30],
          size: [130, 34],
          anchor: mod.UIAnchor.TopCenter,
          visible: true,
          padding: 0,
          bgColor: [0.1216, 0.1216, 0.1216],
          bgAlpha: 0.8,
          bgFill: mod.UIBgFill.Blur,
          children: [
            {
              name: "RemainingTime",
              type: "Text",
              position: [0, 0],
              size: [130, 34],
              anchor: mod.UIAnchor.TopCenter,
              visible: true,
              padding: 0,
              bgColor: [0, 0, 0],
              bgAlpha: 0,
              bgFill: mod.UIBgFill.None,
              textLabel: mod.stringkeys.RemainingTime,
              textColor: [1, 1, 1],
              textAlpha: 1,
              textSize: 24,
              textAnchor: mod.UIAnchor.Center,
            },
          ],
        },
        {
          name: "friendlyscore",
          type: "Container",
          position: [-335, 30],
          size: [120, 34],
          anchor: mod.UIAnchor.TopCenter,
          visible: true,
          padding: 0,
          bgColor: [0.2314, 0.4196, 0.6745],
          bgAlpha: 0.8,
          bgFill: mod.UIBgFill.Blur,
          children: [
            {
              name: "friendlyscore_pulse",
              type: "Container",
              position: [0, 0],
              size: [120, 34],
              anchor: mod.UIAnchor.TopLeft,
              visible: true,
              padding: 0,
              bgColor: [0.2314, 0.4196, 0.6745],
              bgAlpha: 0,
              bgFill: mod.UIBgFill.GradientLeft,
            },
          ],
        },
        {
          name: "enemyscore",
          type: "Container",
          position: [335, 30],
          size: [120, 34],
          anchor: mod.UIAnchor.TopCenter,
          visible: true,
          padding: 0,
          bgColor: [0.698, 0.1882, 0.1882],
          bgAlpha: 0.8,
          bgFill: mod.UIBgFill.Blur,
          children: [
            {
              name: "enemyscore_pulse",
              type: "Container",
              position: [0, 0],
              size: [120, 34],
              anchor: mod.UIAnchor.TopLeft,
              visible: true,
              padding: 0,
              bgColor: [0.698, 0.1882, 0.1882],
              bgAlpha: 0,
              bgFill: mod.UIBgFill.GradientRight,
            },
          ],
        },
        {
          name: "friendlyprogressbar",
          type: "Container",
          position: [-170, 44],
          size: [210, 6],
          anchor: mod.UIAnchor.TopCenter,
          visible: true,
          padding: 0,
          bgColor: [0.2314, 0.4196, 0.6745],
          bgAlpha: 1,
          bgFill: mod.UIBgFill.Blur,
          children: [
            {
              name: "friendlyprogressbarfill",
              type: "Container",
              position: [0, 1],
              size: [210, 4],
              anchor: mod.UIAnchor.TopLeft,
              visible: true,
              padding: 0,
              bgColor: [0.2314, 0.4196, 0.6745],
              bgAlpha: 1,
              bgFill: mod.UIBgFill.GradientRight,
            },
            {
              name: "friendlyprogress_pulse",
              type: "Container",
              position: [0, 0],
              size: [210, 6],
              anchor: mod.UIAnchor.TopLeft,
              visible: true,
              padding: 0,
              bgColor: [0.2314, 0.4196, 0.6745],
              bgAlpha: 0,
              bgFill: mod.UIBgFill.GradientLeft,
            },
          ],
        },
        {
          name: "enemyprogressbar",
          type: "Container",
          position: [170, 44],
          size: [210, 6],
          anchor: mod.UIAnchor.TopCenter,
          visible: true,
          padding: 0,
          bgColor: [0.698, 0.1882, 0.1882],
          bgAlpha: 1,
          bgFill: mod.UIBgFill.Blur,
          children: [
            {
              name: "enemyprogressbarfill",
              type: "Container",
              position: [0, 1],
              size: [210, 4],
              anchor: mod.UIAnchor.TopLeft,
              visible: true,
              padding: 0,
              bgColor: [0.698, 0.1882, 0.1882],
              bgAlpha: 1,
              bgFill: mod.UIBgFill.GradientLeft,
            },
            {
              name: "enemyprogress_pulse",
              type: "Container",
              position: [0, 0],
              size: [210, 6],
              anchor: mod.UIAnchor.TopLeft,
              visible: true,
              padding: 0,
              bgColor: [0.698, 0.1882, 0.1882],
              bgAlpha: 0,
              bgFill: mod.UIBgFill.GradientRight,
            },
          ],
        },
        {
          name: "FlagContainerB",
          type: "Container",
          position: [0, 90],
          size: [20, 20],
          anchor: mod.UIAnchor.TopCenter,
          visible: true,
          padding: 0,
          bgColor: [0.0314, 0.0431, 0.0431],
          bgAlpha: 0.4,
          bgFill: mod.UIBgFill.None,
        },
        {
          name: "FlagContainerC",
          type: "Container",
          position: [100, 90],
          size: [20, 20],
          anchor: mod.UIAnchor.TopCenter,
          visible: true,
          padding: 0,
          bgColor: [0.0314, 0.0431, 0.0431],
          bgAlpha: 0.4,
          bgFill: mod.UIBgFill.None,
        },
        {
          name: "FlagContainerA",
          type: "Container",
          position: [-100, 90],
          size: [20, 20],
          anchor: mod.UIAnchor.TopCenter,
          visible: true,
          padding: 0,
          bgColor: [0.0314, 0.0431, 0.0431],
          bgAlpha: 0.4,
          bgFill: mod.UIBgFill.None,
        },
      ],
    },
    {
      name: "PostMatchContainer",
      type: "Container",
      position: [0, 0],
      size: [SCREEN_UI_REFERENCE_WIDTH, SCREEN_UI_REFERENCE_HEIGHT],
      anchor: mod.UIAnchor.Center,
      visible: true,
      padding: 0,
      bgColor: [0, 0, 0],
      bgAlpha: 1,
      bgFill: mod.UIBgFill.None,
    },
    {
      name: "PreMatchContainer",
      type: "Container",
      position: [0, 0],
      size: [PREMATCH_SAFE_ROOT_WIDTH, PREMATCH_SAFE_ROOT_HEIGHT],
      anchor: mod.UIAnchor.Center,
      visible: true,
      padding: 0,
      bgColor: [0, 0, 0],
      bgAlpha: 0,
      bgFill: mod.UIBgFill.None,
      children: [
        {
          name: PREMATCH_PANEL_NAME,
          type: "Container",
          position: [PREMATCH_PANEL_POS_X, PREMATCH_PANEL_POS_Y],
          size: [PREMATCH_PANEL_WIDTH, PREMATCH_PANEL_HEIGHT],
          anchor: PREMATCH_PANEL_ANCHOR,
          visible: true,
          padding: 0,
          bgColor: [0, 0, 0],
          bgAlpha: 0.5,
          bgFill: mod.UIBgFill.Blur,
          children: [
            {
              name: "Text_Cipher_Esports",
              type: "Text",
              position: [-72, 22],
              size: [130, 42],
              anchor: mod.UIAnchor.TopCenter,
              visible: true,
              padding: 0,
              bgColor: [0.2, 0.2, 0.2],
              bgAlpha: 1,
              bgFill: mod.UIBgFill.None,
              textLabel: mod.stringkeys.Text_Cipher_Esports,
              textColor: [1, 1, 1],
              textAlpha: 1,
              textSize: 22,
              textAnchor: mod.UIAnchor.Center,
            },
            {
              name: "Text_Mode_KingOfTheHill",
              type: "Text",
              position: [72, 22],
              size: [130, 42],
              anchor: mod.UIAnchor.TopCenter,
              visible: true,
              padding: 0,
              bgColor: [0.2, 0.2, 0.2],
              bgAlpha: 1,
              bgFill: mod.UIBgFill.None,
              textLabel: mod.stringkeys.Text_Mode_KingOfTheHill,
              textColor: [1, 1, 1],
              textAlpha: 1,
              textSize: 22,
              textAnchor: mod.UIAnchor.Center,
            },
            {
              name: "Container_NRDAA",
              type: "Container",
              position: [0, 18],
              size: [1, 58],
              anchor: mod.UIAnchor.TopCenter,
              visible: true,
              padding: 0,
              bgColor: [1, 1, 1],
              bgAlpha: 0.8,
              bgFill: mod.UIBgFill.Solid,
            },
            {
              name: "Text_Current_Map",
              type: "Text",
              position: [0, 70],
              size: [260, 48],
              anchor: mod.UIAnchor.TopCenter,
              visible: true,
              padding: 0,
              bgColor: [0.2, 0.2, 0.2],
              bgAlpha: 1,
              bgFill: mod.UIBgFill.None,
              textLabel: mod.stringkeys.Text_Current_Map,
              textColor: [1, 1, 1],
              textAlpha: 1,
              textSize: 20,
              textAnchor: mod.UIAnchor.Center,
            },
            {
              name: "Text_Team_1",
              type: "Text",
              position: [-72, 170],
              size: [130, 34],
              anchor: mod.UIAnchor.TopCenter,
              visible: true,
              padding: 0,
              bgColor: [0.2, 0.2, 0.2],
              bgAlpha: 1,
              bgFill: mod.UIBgFill.None,
              textLabel: mod.stringkeys.Text_Team_1,
              textColor: [1, 1, 1],
              textAlpha: 1,
              textSize: 22,
              textAnchor: mod.UIAnchor.Center,
            },
            {
              name: "Text_Team_2",
              type: "Text",
              position: [72, 170],
              size: [130, 34],
              anchor: mod.UIAnchor.TopCenter,
              visible: true,
              padding: 0,
              bgColor: [0.2, 0.2, 0.2],
              bgAlpha: 1,
              bgFill: mod.UIBgFill.None,
              textLabel: mod.stringkeys.Text_Team_2,
              textColor: [1, 1, 1],
              textAlpha: 1,
              textSize: 22,
              textAnchor: mod.UIAnchor.Center,
            },
          ],
        },
      ],
    },
    {
      name: "CountDownContainer",
      type: "Container",
      position: [0, COUNTDOWN_CONTAINER_CENTERED_POS_Y],
      size: [COUNTDOWN_CONTAINER_WIDTH, COUNTDOWN_CONTAINER_HEIGHT],
      anchor: mod.UIAnchor.Center,
      visible: false,
      padding: 0,
      bgColor: [0, 0, 0],
      bgAlpha: 0.5,
      bgFill: mod.UIBgFill.Blur,
      children: [
        {
          name: "MatchStartsText",
          type: "Text",
          position: [0, 0],
          size: [300, 50],
          anchor: mod.UIAnchor.TopCenter,
          visible: true,
          padding: 0,
          bgColor: [0.2, 0.2, 0.2],
          bgAlpha: 1,
          bgFill: mod.UIBgFill.None,
          textLabel: mod.stringkeys.MatchStarts,
          textColor: [1, 1, 1],
          textAlpha: 1,
          textSize: 50,
          textAnchor: mod.UIAnchor.Center,
        },
        {
          name: "CountDownText",
          type: "Text",
          position: [0, 50],
          size: [300, 100],
          anchor: mod.UIAnchor.TopCenter,
          visible: true,
          padding: 0,
          bgColor: [0.2, 0.2, 0.2],
          bgAlpha: 1,
          bgFill: mod.UIBgFill.None,
          textLabel: mod.stringkeys.CountDownText,
          textColor: [1, 1, 1],
          textAlpha: 1,
          textSize: 100,
          textAnchor: mod.UIAnchor.Center,
        },
      ],
    },
  ],
});
// Legacy dormant helper retained for rollback safety; not called in interact-only prematch authority.

function ArmPrematchUIInteractivityForAllPlayers(): void {
  // Re-assert prematch overlay widgets only; prematch authority is world interact driven.
  const allPlayers = mod.AllPlayers();
  for (let i = 0; i < mod.CountOf(allPlayers); i++) {
    const p = mod.ValueInArray(allPlayers, i) as mod.Player;
    if (p && mod.IsPlayerValid(p)) {
      EnsureGlobalPrematchHitboxesForPlayer(p);
    }
  }
}

function HandlePrematchReadyUp(player: mod.Player): void {
  if (gameStatus !== 0) return;
  if (!mod.IsPlayerValid(player)) return;
  if (isBotBackfillPlayer(player)) return;
  if (isExcludedPlayer(player)) return;

  const p = serverPlayers.get(modlib.getPlayerId(player));
  if (!p) return;

  // Prematch authority is interact-only; this toggles authoritative ready state.
  p.changeReady();

  UpdatePrematchRosterUI();

  if (SFX_ReadyUp) mod.PlaySound(SFX_ReadyUp, 0.8, player);
}

function warnPrematchSwitchDebounceOnce(playerId: number, ticksRemaining: number): void {
  if (prematchSwitchDebounceWarnedByPlayerId[playerId] === true) return;
  prematchSwitchDebounceWarnedByPlayerId[playerId] = true;
  mod.DisplayHighlightedWorldLogMessage(
    mod.Message(
      "[PREMATCH SWITCH] debounced player/remainTicks/status/inits {}",
      String(playerId) +
        "/" +
        String(ticksRemaining) +
        "/" +
        String(gameStatus) +
        "/" +
        getInitializationFlagSummary()
    )
  );
}

function warnPrematchStabilizationGateBlockedOnce(
  readyPlayers: number[],
  totalPlayers: number[],
  elapsedTicksSinceSwitch: number
): void {
  const key = String(lastPrematchTeamSwitchTick);
  if (prematchStabilizationGateWarnedBySwitchTick[key] === true) return;
  prematchStabilizationGateWarnedBySwitchTick[key] = true;

  mod.DisplayHighlightedWorldLogMessage(
    mod.Message(
      "[PREMATCH GATE] blocked status/inits/rdy/tot/switchElapsed {}",
      String(gameStatus) +
        "/" +
        getInitializationFlagSummary() +
        "/" +
        String(readyPlayers[0]) +
        "-" +
        String(readyPlayers[1]) +
        "/" +
        String(totalPlayers[0]) +
        "-" +
        String(totalPlayers[1]) +
        "/" +
        String(elapsedTicksSinceSwitch)
    )
  );
}

function markPrematchTeamSwitchTick(playerId: number): void {
  lastPrematchTeamSwitchTick = serverTickCount;
  lastPrematchTeamSwitchTickByPlayerId[playerId] = serverTickCount;
}

function isPrematchSwitchDebounced(playerId: number): boolean {
  const lastTick = prematchSwitchLastHandledTickByPlayerId[playerId] ?? -999999;
  const elapsedTicks = serverTickCount - lastTick;
  if (elapsedTicks < PREMATCH_SWITCH_DEBOUNCE_TICKS) {
    warnPrematchSwitchDebounceOnce(playerId, PREMATCH_SWITCH_DEBOUNCE_TICKS - elapsedTicks);
    return true;
  }

  prematchSwitchLastHandledTickByPlayerId[playerId] = serverTickCount;
  return false;
}

function HandlePrematchSwitchTeams(player: mod.Player): void {
  if (gameStatus !== 0) return;
  if (!mod.IsPlayerValid(player)) return;
  if (isBotBackfillPlayer(player)) return;
  if (isExcludedPlayer(player)) return;
  const playerId = modlib.getPlayerId(player);
  if (isPrematchSwitchDebounced(playerId)) return;

  const p = serverPlayers.get(playerId);
  const currentTeam = mod.GetTeam(player);

  // If they were ready, unready them when switching (same behavior as your IP path)
  if (p && p.isReady()) p.changeReady();

  const goingToTeam2 = modlib.getTeamId(currentTeam) === 1;
  const newTeam = goingToTeam2 ? team2 : team1;

  switchTeamPrematchAndRedeploy(player, newTeam);
  markPrematchTeamSwitchTick(playerId);

  p?.setTeam();
  queueLiveHudPrebuildForPlayer(p);
  setReadyPhaseProtectionForPlayer(player, true);

  Object.values(serverCapturePoints).forEach((cp) => {
    if (!p) return;

    if (modlib.Equals(cp.getOwner(), newTeam)) {
      setFlagLetterAndOutlineColorForPlayer(p.id, cp.symbol as any, COLOR_FRIENDLY);
    } else if (!modlib.Equals(cp.getOwner(), teamNeutral)) {
      setFlagLetterAndOutlineColorForPlayer(p.id, cp.symbol as any, COLOR_ENEMY);
    } else {
      setFlagLetterAndOutlineColorForPlayer(p.id, cp.symbol as any, COLOR_NEUTRAL);
    }
  });

  UpdatePrematchRosterUI();
}

function Mode_OnPlayerUIButtonEvent(
  eventPlayer: mod.Player,
  eventUIWidget: mod.UIWidget,
  eventUIButtonEvent: mod.UIButtonEvent
): void {
  return;
}

// Force key UI widgets to render AboveGameUI (above deploy screen / game UI layer)
function SetDepthAboveGameUI(name: string): void {
  const w = mod.FindUIWidgetWithName(name);
  if (!w) return;
  mod.SetUIWidgetDepth(w, mod.UIDepth.AboveGameUI);
}

/* -----------------------------------------------------------------------------------------------
   Match start banner (KOTH splash)
------------------------------------------------------------------------------------------------ */

const MATCH_START_BANNER_SHOW_SECONDS = 2.0;
let matchStartBannerRunning = false;

const container0nx1gWidget = modlib.ParseUI({
  name: "Container_0NX1G",
  type: "Container",
  position: [0, 0],
  size: [SCREEN_UI_REFERENCE_WIDTH, SCREEN_UI_REFERENCE_HEIGHT],
  anchor: mod.UIAnchor.Center,
  visible: false,
  padding: 0,
  bgColor: [0, 0, 0],
  bgAlpha: 0,
  bgFill: mod.UIBgFill.None,
  children: [
    {
      name: "Text_Cipher_Presents",
      type: "Text",
      position: [0, -325],
      size: [650, 110],
      anchor: mod.UIAnchor.Center,
      visible: true,
      padding: 0,
      bgColor: [0, 0, 0],
      bgAlpha: 0,
      bgFill: mod.UIBgFill.None,
      textLabel: mod.stringkeys.Text_Cipher_Presents,
      textColor: [0.35, 0.65, 1.0],
      textAlpha: 1,
      textSize: 34,
      textAnchor: mod.UIAnchor.TopCenter,
    },
    {
      name: "Intro_KOTH_Text",
      type: "Text",
      position: [0, 200],
      size: [650, 110],
      anchor: mod.UIAnchor.TopCenter,
      visible: true,
      padding: 0,
      bgColor: [1.0, 0.55, 0.18],
      bgAlpha: 0.95,
      bgFill: mod.UIBgFill.Solid,
      textLabel: mod.stringkeys.Text_KingOfTheHill,
      textColor: [1, 1, 1],
      textAlpha: 1,
      textSize: 80,
      textAnchor: mod.UIAnchor.Center,
    },
    {
      name: "Intro_KOTH_Line_Left",
      type: "Container",
      position: [-385, 200],
      size: [80, 110],
      anchor: mod.UIAnchor.TopCenter,
      visible: true,
      padding: 0,
      bgColor: [1.0, 0.45, 0.16],
      bgAlpha: 0.9,
      bgFill: mod.UIBgFill.GradientRight,
    },
    {
      name: "Intro_KOTH_Line_Right",
      type: "Container",
      position: [385, 200],
      size: [80, 110],
      anchor: mod.UIAnchor.TopCenter,
      visible: true,
      padding: 0,
      bgColor: [1.0, 0.45, 0.16],
      bgAlpha: 0.9,
      bgFill: mod.UIBgFill.GradientLeft,
    },
  ],
});

function Lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}

async function showMatchStartBannerOnce(): Promise<void> {
  await mod.Wait(0.8); // Wait for the match start stinger to finish playing
  if (matchStartBannerRunning) return;
  matchStartBannerRunning = true;

  const root = mod.FindUIWidgetWithName("Container_0NX1G");
  const textW = mod.FindUIWidgetWithName("Intro_KOTH_Text");
  const leftW = mod.FindUIWidgetWithName("Intro_KOTH_Line_Left");
  const rightW = mod.FindUIWidgetWithName("Intro_KOTH_Line_Right");

  if (!root || !textW || !leftW || !rightW) {
    matchStartBannerRunning = false;
    return;
  }

  mod.SetUIWidgetVisible(root, true);

  mod.SetUIWidgetBgAlpha(textW, 1);
  mod.SetUITextAlpha(textW, 1);

  mod.SetUIWidgetBgAlpha(leftW, 1);
  mod.SetUIWidgetBgAlpha(rightW, 1);

  await mod.Wait(MATCH_START_BANNER_SHOW_SECONDS);

  let currentLerpValue = 0;
  let lerpIncrement = 0;

  while (currentLerpValue < 1.0) {
    lerpIncrement += 0.1;
    currentLerpValue = Lerp(currentLerpValue, 1, lerpIncrement);

    const a = 1 - currentLerpValue;

    mod.SetUIWidgetBgAlpha(textW, a);
    mod.SetUITextAlpha(textW, a);
    mod.SetUIWidgetBgAlpha(leftW, a);
    mod.SetUIWidgetBgAlpha(rightW, a);

    await mod.Wait(0.1);
  }

  mod.SetUIWidgetVisible(root, false);
  matchStartBannerRunning = false;
}

/* -----------------------------------------------------------------------------------------------
   Prematch roster UI
------------------------------------------------------------------------------------------------ */
// -------------------- Prematch UI (per-player) --------------------

const UI_PREMATCH_CONTAINER_ID = "UI_PREMATCH_CONTAINER_";
const UI_PREMATCH_BUTTON_READY_ID = "UI_PREMATCH_BUTTON_READY_";
const UI_PREMATCH_BUTTON_SWITCH_ID = "UI_PREMATCH_BUTTON_SWITCH_";
const UI_PREMATCH_LABEL_READY_ID = "UI_PREMATCH_LABEL_READY_";
const UI_PREMATCH_LABEL_SWITCH_ID = "UI_PREMATCH_LABEL_SWITCH_";

const PREMATCH_BUTTON_TEXT_COLOR = mod.CreateVector(0.0314, 0.0431, 0.0431);
const PREMATCH_BUTTON_BASE_COLOR = mod.CreateVector(0.0745, 0.1843, 0.2471);
const PREMATCH_BUTTON_HOVER_COLOR = mod.CreateVector(1, 1, 1);
const PREMATCH_BUTTON_PRESSED_COLOR = mod.CreateVector(0.4392, 0.9216, 1);
const PREMATCH_COLUMN_CENTER_OFFSET = 72;
const PREMATCH_BUTTON_Y = 516;
const PREMATCH_BUTTON_WIDTH = 130;
const PREMATCH_BUTTON_HEIGHT = 42;
const PREMATCH_BUTTON_LABEL_Y = PREMATCH_BUTTON_Y;
const PREMATCH_LABEL_WIDTH = PREMATCH_BUTTON_WIDTH;
const PREMATCH_LABEL_HEIGHT = PREMATCH_BUTTON_HEIGHT;
const PREMATCH_ROSTER_START_Y = 214;
const PREMATCH_ROSTER_ROW_HEIGHT = 16;
const PREMATCH_ROSTER_TEXT_WIDTH = 130;
const PREMATCH_ROSTER_TEXT_HEIGHT = 16;
const PREMATCH_ROSTER_TEXT_SIZE = 14;
const PREMATCH_ROSTER_LINE_WIDTH = 118;
const PREMATCH_ROSTER_LINE_HEIGHT = 1;

function safeFind(name: string): mod.UIWidget | undefined {
  try {
    const root = mod.GetUIRoot();
    try {
      const wRoot = mod.FindUIWidgetWithName(name, root);
      if (wRoot && mod.IsType(wRoot, mod.Types.UIWidget)) return wRoot as mod.UIWidget;
    } catch {
    }

    const w = mod.FindUIWidgetWithName(name);
    if (w && mod.IsType(w, mod.Types.UIWidget)) return w as mod.UIWidget;
  } catch {
  }
  return undefined;
}

function getPrematchPanelWidget(): mod.UIWidget | null {
  return SafeFindWidget(PREMATCH_PANEL_NAME) ?? SafeFindWidget("PreMatchContainer");
}

function ensurePrematchLabelOverlay(
  player: mod.Player,
  container: mod.UIWidget,
  labelName: string,
  posX: number,
  labelKey: any
): void {
  const existing = safeFind(labelName);
  if (!existing) {
    mod.AddUIText(
      labelName,
      mod.CreateVector(posX, PREMATCH_BUTTON_LABEL_Y, 0),
      mod.CreateVector(PREMATCH_LABEL_WIDTH, PREMATCH_LABEL_HEIGHT, 0),
      mod.UIAnchor.TopCenter,
      container,
      true,
      0,
      mod.CreateVector(0, 0, 0),
      0,
      mod.UIBgFill.None,
      mod.Message(labelKey),
      22,
      PREMATCH_BUTTON_TEXT_COLOR,
      1,
      mod.UIAnchor.Center,
      player
    );
  }

  const label = safeFind(labelName);
  if (label) {
    mod.SetUITextLabel(label, mod.Message(labelKey));
    mod.SetUITextColor(label, PREMATCH_BUTTON_TEXT_COLOR);
    mod.SetUIWidgetDepth(label, mod.UIDepth.AboveGameUI);
    mod.SetUIWidgetVisible(label, true);
  }
}

function HideLegacyPrematchButtons(): void {
  const legacyNames = [
    "Button_Ready",
    "Button_Switch_Team",
    "Text_Ready",
    "Text_Switch_Teams",
    "Button_Ready_Label",
    "Button_Switch_Team_Label",
  ];

  for (let i = 0; i < legacyNames.length; i++) {
    const w = safeFind(legacyNames[i]);
    if (!w) continue;
    try {
      mod.SetUIWidgetVisible(w, false);
      // Defensive: ensure legacy buttons never capture input
      if (legacyNames[i] === "Button_Ready" || legacyNames[i] === "Button_Switch_Team") {
        mod.EnableUIButtonEvent(w, mod.UIButtonEvent.ButtonDown, false);
        mod.EnableUIButtonEvent(w, mod.UIButtonEvent.ButtonUp, false);
      }
    } catch {
      // ignore
    }
  }
}

function EnsurePrematchButtonsForPlayer(player: mod.Player): void {
  if (!mod.IsPlayerValid(player)) return;

  HideLegacyPrematchButtons();
  const pid = mod.GetObjId(player);

  const containerName = UI_PREMATCH_CONTAINER_ID + pid;
  const readyBtnName = UI_PREMATCH_BUTTON_READY_ID + pid;
  const switchBtnName = UI_PREMATCH_BUTTON_SWITCH_ID + pid;
  const readyLabelName = UI_PREMATCH_LABEL_READY_ID + pid;
  const switchLabelName = UI_PREMATCH_LABEL_SWITCH_ID + pid;

  const applyButtonBaseAndAlphas = (btn: mod.UIWidget): void => {
    mod.SetUIButtonEnabled(btn, true);

    mod.SetUIButtonColorBase(btn, PREMATCH_BUTTON_BASE_COLOR);
    mod.SetUIButtonColorDisabled(btn, PREMATCH_BUTTON_BASE_COLOR);
    mod.SetUIButtonColorPressed(btn, PREMATCH_BUTTON_PRESSED_COLOR);
    mod.SetUIButtonColorHover(btn, PREMATCH_BUTTON_HOVER_COLOR);
    mod.SetUIButtonColorFocused(btn, PREMATCH_BUTTON_BASE_COLOR);

    mod.SetUIButtonAlphaBase(btn, 1);
    mod.SetUIButtonAlphaDisabled(btn, 1);
    mod.SetUIButtonAlphaPressed(btn, 1);
    mod.SetUIButtonAlphaHover(btn, 1);
    mod.SetUIButtonAlphaFocused(btn, 1);

    mod.SetUIWidgetDepth(btn, mod.UIDepth.AboveGameUI);
  };

  const existingContainer = safeFind(containerName);
  if (existingContainer) {
    mod.EnableUIInputMode(false, player);

    const readyBtn = safeFind(readyBtnName);
    const switchBtn = safeFind(switchBtnName);

    const rebuild = false;

    if (rebuild) {
      const readyLabel = safeFind(readyLabelName);
      const switchLabel = safeFind(switchLabelName);

      if (readyLabel) mod.DeleteUIWidget(readyLabel);
      if (switchLabel) mod.DeleteUIWidget(switchLabel);
      if (readyBtn) mod.DeleteUIWidget(readyBtn);
      if (switchBtn) mod.DeleteUIWidget(switchBtn);

      mod.DeleteUIWidget(existingContainer);
    } else {
      mod.SetUIWidgetVisible(existingContainer, true);
      mod.SetUIWidgetDepth(existingContainer, mod.UIDepth.AboveGameUI);

      if (readyBtn) applyButtonBaseAndAlphas(readyBtn);
      if (switchBtn) applyButtonBaseAndAlphas(switchBtn);

      ensurePrematchLabelOverlay(
        player,
        existingContainer,
        readyLabelName,
        -PREMATCH_COLUMN_CENTER_OFFSET,
        mod.stringkeys.Text_Ready
      );
      ensurePrematchLabelOverlay(
        player,
        existingContainer,
        switchLabelName,
        PREMATCH_COLUMN_CENTER_OFFSET,
        mod.stringkeys.Text_Switch_Teams
      );

      return;
    }
  }

  mod.EnableUIInputMode(false, player);

  mod.AddUIContainer(
    containerName,
    mod.CreateVector(PREMATCH_PANEL_POS_X, PREMATCH_PANEL_POS_Y, 0),
    mod.CreateVector(PREMATCH_PANEL_WIDTH, PREMATCH_PANEL_HEIGHT, 0),
    PREMATCH_PANEL_ANCHOR,
    mod.GetUIRoot(),
    true,
    0,
    mod.CreateVector(0, 0, 0),
    0,
    mod.UIBgFill.None,
    player
  );

  const container = safeFind(containerName);
  if (!container) return;
  mod.SetUIWidgetDepth(container, mod.UIDepth.AboveGameUI);

  mod.AddUIButton(
    readyBtnName,
    mod.CreateVector(-PREMATCH_COLUMN_CENTER_OFFSET, PREMATCH_BUTTON_Y, 0),
    mod.CreateVector(PREMATCH_BUTTON_WIDTH, PREMATCH_BUTTON_HEIGHT, 0),
    mod.UIAnchor.TopCenter,
    container,
    true,
    0,
    mod.CreateVector(1, 1, 1),
    1,
    mod.UIBgFill.Solid,
    true,
    PREMATCH_BUTTON_BASE_COLOR,
    1,
    PREMATCH_BUTTON_BASE_COLOR,
    1,
    PREMATCH_BUTTON_PRESSED_COLOR,
    1,
    PREMATCH_BUTTON_HOVER_COLOR,
    1,
    PREMATCH_BUTTON_BASE_COLOR,
    1,
    player
  );

  mod.AddUIButton(
    switchBtnName,
    mod.CreateVector(PREMATCH_COLUMN_CENTER_OFFSET, PREMATCH_BUTTON_Y, 0),
    mod.CreateVector(PREMATCH_BUTTON_WIDTH, PREMATCH_BUTTON_HEIGHT, 0),
    mod.UIAnchor.TopCenter,
    container,
    true,
    0,
    mod.CreateVector(1, 1, 1),
    1,
    mod.UIBgFill.Solid,
    true,
    PREMATCH_BUTTON_BASE_COLOR,
    1,
    PREMATCH_BUTTON_BASE_COLOR,
    1,
    PREMATCH_BUTTON_PRESSED_COLOR,
    1,
    PREMATCH_BUTTON_HOVER_COLOR,
    1,
    PREMATCH_BUTTON_BASE_COLOR,
    1,
    player
  );

  const readyBtn2 = safeFind(readyBtnName);
  const switchBtn2 = safeFind(switchBtnName);
  if (readyBtn2) applyButtonBaseAndAlphas(readyBtn2);
  if (switchBtn2) applyButtonBaseAndAlphas(switchBtn2);

  ensurePrematchLabelOverlay(
    player,
    container,
    readyLabelName,
    -PREMATCH_COLUMN_CENTER_OFFSET,
    mod.stringkeys.Text_Ready
  );
  ensurePrematchLabelOverlay(
    player,
    container,
    switchLabelName,
    PREMATCH_COLUMN_CENTER_OFFSET,
    mod.stringkeys.Text_Switch_Teams
  );
}

function SetPrematchButtonsVisibleForPlayer(player: mod.Player, visible: boolean): void {
  if (!mod.IsPlayerValid(player)) return;

  const pid = mod.GetObjId(player);
  const container = safeFind(UI_PREMATCH_CONTAINER_ID + pid);
  const rdybutton = safeFind(UI_PREMATCH_BUTTON_READY_ID + pid);
  const switchbutton = safeFind(UI_PREMATCH_BUTTON_SWITCH_ID + pid);
  const txtready = safeFind(UI_PREMATCH_LABEL_READY_ID + pid);
  const txtswitch = safeFind(UI_PREMATCH_LABEL_SWITCH_ID + pid);
  if (container) mod.SetUIWidgetVisible(container, visible);
  if (rdybutton) mod.SetUIWidgetVisible(rdybutton, visible);
  if (switchbutton) mod.SetUIWidgetVisible(switchbutton, visible);
  if (txtready) mod.SetUIWidgetVisible(txtready, visible);
  if (txtswitch) mod.SetUIWidgetVisible(txtswitch, visible);
  if (!visible) mod.EnableUIInputMode(false, player);
}

function SetPrematchButtonsVisibleForAllPlayers(visible: boolean): void {
  const allPlayers = mod.AllPlayers();
  for (let i = 0; i < mod.CountOf(allPlayers); i++) {
    const p = mod.ValueInArray(allPlayers, i) as mod.Player;
    if (p && mod.IsPlayerValid(p)) SetPrematchButtonsVisibleForPlayer(p, visible);
  }
}
// Prematch roster UI lists centered player names with a light separator line under each row.

let prematchRosterTeam1Lines: Array<mod.UIWidget | null> = [];
let prematchRosterTeam2Lines: Array<mod.UIWidget | null> = [];

const ROSTER_LINE_COLOR = mod.CreateVector(0.9, 0.9, 0.9);

function resetPrematchRosterBuildState(): void {
  prematchRosterBuilt = false;
  prematchRosterTeam1 = [];
  prematchRosterTeam2 = [];
  prematchRosterTeam1Lines = [];
  prematchRosterTeam2Lines = [];
}

function BuildPrematchRosterUI(): void {
  if (prematchRosterBuilt) return;

  const parent = getPrematchPanelWidget();
  if (!parent) {
    warnPrematchUiGuardOnce(
      "prematch_roster_parent_missing",
      mod.Message("[PREMATCH ROSTER] missing parent widget {}", PREMATCH_PANEL_NAME)
    );
    return;
  }

  let buildOk = false;
  try {
    const startY = PREMATCH_ROSTER_START_Y;
    const rowH = PREMATCH_ROSTER_ROW_HEIGHT;

    const textW = PREMATCH_ROSTER_TEXT_WIDTH;
    const textH = PREMATCH_ROSTER_TEXT_HEIGHT;

    const lineW = PREMATCH_ROSTER_LINE_WIDTH;
    const lineH = PREMATCH_ROSTER_LINE_HEIGHT;

    prematchRosterTeam1 = [];
    prematchRosterTeam2 = [];
    prematchRosterTeam1Lines = [];
    prematchRosterTeam2Lines = [];

    for (let i = 0; i < MAX_ROSTER_LINES; i++) {
      const y = startY + i * rowH;

      mod.AddUIText(
        "PreMatchRosterT1_" + i,
        mod.CreateVector(-PREMATCH_COLUMN_CENTER_OFFSET, y, 0),
        mod.CreateVector(textW, textH, 0),
        mod.UIAnchor.TopCenter,
        parent,
        false,
        0,
        mod.CreateVector(0, 0, 0),
        0,
        mod.UIBgFill.None,
        mod.Message(""),
        PREMATCH_ROSTER_TEXT_SIZE,
        mod.CreateVector(1, 1, 1),
        1,
        mod.UIAnchor.Center
      );

      mod.AddUIContainer(
        "PreMatchRosterT1Line_" + i,
        mod.CreateVector(-PREMATCH_COLUMN_CENTER_OFFSET, y + textH - 1, 0),
        mod.CreateVector(lineW, lineH, 0),
        mod.UIAnchor.TopCenter,
        parent,
        false,
        0,
        ROSTER_LINE_COLOR,
        0.8,
        mod.UIBgFill.Solid
      );

      mod.AddUIText(
        "PreMatchRosterT2_" + i,
        mod.CreateVector(PREMATCH_COLUMN_CENTER_OFFSET, y, 0),
        mod.CreateVector(textW, textH, 0),
        mod.UIAnchor.TopCenter,
        parent,
        false,
        0,
        mod.CreateVector(0, 0, 0),
        0,
        mod.UIBgFill.None,
        mod.Message(""),
        PREMATCH_ROSTER_TEXT_SIZE,
        mod.CreateVector(1, 1, 1),
        1,
        mod.UIAnchor.Center
      );

      mod.AddUIContainer(
        "PreMatchRosterT2Line_" + i,
        mod.CreateVector(PREMATCH_COLUMN_CENTER_OFFSET, y + textH - 1, 0),
        mod.CreateVector(lineW, lineH, 0),
        mod.UIAnchor.TopCenter,
        parent,
        false,
        0,
        ROSTER_LINE_COLOR,
        0.8,
        mod.UIBgFill.Solid
      );

      prematchRosterTeam1.push(SafeFindWidget("PreMatchRosterT1_" + i));
      prematchRosterTeam2.push(SafeFindWidget("PreMatchRosterT2_" + i));

      prematchRosterTeam1Lines.push(SafeFindWidget("PreMatchRosterT1Line_" + i));
      prematchRosterTeam2Lines.push(SafeFindWidget("PreMatchRosterT2Line_" + i));
    }

    buildOk = true;
  } catch (err) {
    LogRuntimeError("BuildPrematchRosterUI", err);
    warnPrematchUiGuardOnce(
      "prematch_roster_build_failed",
      mod.Message("[PREMATCH ROSTER] build failed (see runtime error log)")
    );
  } finally {
    prematchRosterBuilt = buildOk;
    if (!buildOk) {
      resetPrematchRosterBuildState();
    }
  }
}

function UpdatePrematchRosterUI(): void {
  if (!prematchRosterBuilt) {
    BuildPrematchRosterUI();
    if (!prematchRosterBuilt) return;
  }

  try {
    const team1Players: Player[] = [];
    const team2Players: Player[] = [];

    serverPlayers.forEach((p) => {
      const t = mod.GetTeam(p.player);
      if (mod.Equals(t, team1)) team1Players.push(p);
      else if (mod.Equals(t, team2)) team2Players.push(p);
    });

    team1Players.sort((a, b) => a.id - b.id);
    team2Players.sort((a, b) => a.id - b.id);

    for (let i = 0; i < MAX_ROSTER_LINES; i++) {
      const w = prematchRosterTeam1[i];
      const line = prematchRosterTeam1Lines[i];
      if (!w || !line) continue;

      if (i < team1Players.length) {
        const p = team1Players[i];
        const ready = isBotBackfillPlayer(p.player) ? true : p.isReady();

        SafeSetWidgetVisibleHandle(w, true);
        SafeSetWidgetVisibleHandle(line, true);
        SafeSetTextColorHandle(w, ready ? mod.CreateVector(0, 1, 0) : mod.CreateVector(1, 0, 0));
        SafeSetTextLabelHandle(
          w,
          ready
            ? mod.Message(mod.stringkeys.RosterReadyLine, p.player)
            : mod.Message(mod.stringkeys.RosterNotReadyLine, p.player)
        );
      } else {
        SafeSetWidgetVisibleHandle(w, false);
        SafeSetWidgetVisibleHandle(line, false);
        SafeSetTextLabelHandle(w, mod.Message(""));
      }
    }

    for (let i = 0; i < MAX_ROSTER_LINES; i++) {
      const w = prematchRosterTeam2[i];
      const line = prematchRosterTeam2Lines[i];
      if (!w || !line) continue;

      if (i < team2Players.length) {
        const p = team2Players[i];
        const ready = isBotBackfillPlayer(p.player) ? true : p.isReady();

        SafeSetWidgetVisibleHandle(w, true);
        SafeSetWidgetVisibleHandle(line, true);
        SafeSetTextColorHandle(w, ready ? mod.CreateVector(0, 1, 0) : mod.CreateVector(1, 0, 0));
        SafeSetTextLabelHandle(
          w,
          ready
            ? mod.Message(mod.stringkeys.RosterReadyLine, p.player)
            : mod.Message(mod.stringkeys.RosterNotReadyLine, p.player)
        );
      } else {
        SafeSetWidgetVisibleHandle(w, false);
        SafeSetWidgetVisibleHandle(line, false);
        SafeSetTextLabelHandle(w, mod.Message(""));
      }
    }
  } catch (err) {
    LogRuntimeError("UpdatePrematchRosterUI", err);
    warnPrematchUiGuardOnce(
      "prematch_roster_update_failed",
      mod.Message("[PREMATCH ROSTER] update failed; forcing rebuild")
    );
    resetPrematchRosterBuildState();
  }
}

/* -----------------------------------------------------------------------------------------------
   Per-player ReadyText (prematch)
------------------------------------------------------------------------------------------------ */

function replacePrematchReadyText(playerId: number, receiver: mod.Player): void {
  const readyTextName = "ReadyText" + playerId;
  safeDeleteWidgetByName(readyTextName);

  const parent = getPrematchPanelWidget();
  if (!parent) {
    readyTextBuiltByPlayerId[playerId] = false;
    delete readyTextWidgetByPlayerId[playerId];
    warnPrematchUiGuardOnce(
      "prematch_readytext_parent_missing",
      mod.Message("[PREMATCH READY TEXT] missing parent widget {}", PREMATCH_PANEL_NAME)
    );
    return;
  }

  try {
    mod.AddUIText(
      readyTextName,
      mod.CreateVector(0, 106, 0),
      mod.CreateVector(260, 24, 0),
      mod.UIAnchor.TopCenter,
      parent,
      true,
      0,
      mod.CreateVector(0, 0, 0),
      0.4,
      mod.UIBgFill.None,
      mod.Message(mod.stringkeys.NotReady),
      22,
      mod.CreateVector(1, 0, 0),
      1,
      mod.UIAnchor.Center,
      receiver
    );
  } catch (err) {
    LogRuntimeError("replacePrematchReadyText/" + String(playerId), err);
    readyTextBuiltByPlayerId[playerId] = false;
    delete readyTextWidgetByPlayerId[playerId];
    return;
  }

  const readyWidget = SafeFindWidget(readyTextName);
  if (!readyWidget) {
    readyTextBuiltByPlayerId[playerId] = false;
    delete readyTextWidgetByPlayerId[playerId];
    warnPrematchUiGuardOnce(
      "prematch_readytext_handle_missing",
      mod.Message("[PREMATCH READY TEXT] widget missing after add {}", readyTextName)
    );
    return;
  }

  readyTextBuiltByPlayerId[playerId] = true;
  readyTextWidgetByPlayerId[playerId] = readyWidget;
}

function resolvePrematchReadyTextWidgetForPlayer(playerId: number): mod.UIWidget | undefined {
  const name = "ReadyText" + playerId;
  const widget = SafeFindWidget(name);
  if (!widget) {
    readyTextBuiltByPlayerId[playerId] = false;
    delete readyTextWidgetByPlayerId[playerId];
    return undefined;
  }

  readyTextBuiltByPlayerId[playerId] = true;
  readyTextWidgetByPlayerId[playerId] = widget;
  return widget;
}

/* -----------------------------------------------------------------------------------------------
   Live HUD (per player) build / rebuild
------------------------------------------------------------------------------------------------ */

function deleteLegacyLiveHudWidgetsForPlayer(playerId: number): void {
  const widgetNames = [
    "TeamFriendlyScore" + playerId,
    "TeamFriendlyScorePad1" + playerId,
    "TeamFriendlyScorePad2" + playerId,
    "TeamOpponentScore" + playerId,
    "TeamOpponentScorePad1" + playerId,
    "TeamOpponentScorePad2" + playerId,
    "FriendlyScorePulse" + playerId,
    "EnemyScorePulse" + playerId,
    "FriendlyTicketsFill" + playerId,
    "EnemyTicketsFill" + playerId,
    "FLAGA" + playerId,
    "FLAGB" + playerId,
    "FLAGC" + playerId,
    "FLAGA_FILL" + playerId,
    "FLAGB_FILL" + playerId,
    "FLAGC_FILL" + playerId,
    "FLAGA_OL_T" + playerId,
    "FLAGA_OL_B" + playerId,
    "FLAGA_OL_L" + playerId,
    "FLAGA_OL_R" + playerId,
    "FLAGB_OL_T" + playerId,
    "FLAGB_OL_B" + playerId,
    "FLAGB_OL_L" + playerId,
    "FLAGB_OL_R" + playerId,
    "FLAGC_OL_T" + playerId,
    "FLAGC_OL_B" + playerId,
    "FLAGC_OL_L" + playerId,
    "FLAGC_OL_R" + playerId,
    "ActiveFlagContainer" + playerId,
    "ActiveFlag" + playerId,
    "FriendlyCap" + playerId,
    "EnemyCap" + playerId,
    "CapProgress" + playerId,
  ];

  for (let i = 0; i < widgetNames.length; i++) {
    safeDeleteWidgetByName(widgetNames[i]);
  }
}

function rebuildPlayerLiveHud(p: Player): void {
  deleteLegacyLiveHudWidgetsForPlayer(p.id);
  if (ensureLiveHudSlotForPlayer(p)) {
    setLiveHudVisibleForPlayer(p, true);
  }
}

function getLiveUiTeamKey(team: mod.Team): LiveUiTeamKey | null {
  if (mod.Equals(team, team1)) return "T1";
  if (mod.Equals(team, team2)) return "T2";
  return null;
}

function getLiveUiSlotOwners(teamKey: LiveUiTeamKey): Array<number | undefined> {
  return teamKey === "T1" ? playerIdByLiveUiSlotTeam1 : playerIdByLiveUiSlotTeam2;
}

function getLiveUiSlotKey(teamKey: LiveUiTeamKey, slotIndex: number): string {
  return teamKey + "_" + (slotIndex < 10 ? "0" + slotIndex : String(slotIndex));
}

function isReservedLiveHudSlot(teamKey: LiveUiTeamKey, slotIndex: number): boolean {
  return teamKey === SPECTATOR_LIVE_UI_TEAM_KEY && slotIndex === SPECTATOR_LIVE_UI_SLOT_INDEX;
}

function getReservedLiveHudSlotAssignment(): LiveUiSlotAssignment {
  return {
    teamKey: SPECTATOR_LIVE_UI_TEAM_KEY,
    slotIndex: SPECTATOR_LIVE_UI_SLOT_INDEX,
    slotKey: SPECTATOR_LIVE_UI_SLOT_KEY,
  };
}
function getLiveHudWidgetName(slotKey: string, widgetBaseName: string): string {
  return widgetBaseName + "_" + slotKey;
}

function findLiveHudWidget(slotKey: string, widgetBaseName: string): mod.UIWidget | undefined {
  return safeFindWidgetByNameNoThrow(
    getLiveHudWidgetName(slotKey, widgetBaseName),
    "livehud/" + slotKey + "/" + widgetBaseName
  );
}

function collectLiveHudFlagOutlineWidgets(slotKey: string, symbol: LiveUiFlagSymbol): mod.UIWidget[] {
  const widgets: mod.UIWidget[] = [];
  const suffixes = ["T", "B", "L", "R"];

  for (let i = 0; i < suffixes.length; i++) {
    const widget = findLiveHudWidget(slotKey, "FLAG" + symbol + "_OL_" + suffixes[i]);
    if (widget) widgets.push(widget);
  }

  return widgets;
}

function getLiveHudContainerWidget(): mod.UIWidget | undefined {
  return safeFindWidgetByNameNoThrow("LiveContainer", "livehud/container");
}

function getSharedLiveHudWidget(name: string): mod.UIWidget | undefined {
  return safeFindWidgetByNameNoThrow(name, "livehud/shared/" + name);
}

const LIVE_HUD_SLOT_VISIBLE_WIDGET_BASE_NAMES: string[] = [
  "LiveHudSlotAnchor",
  "TeamFriendlyScore",
  "TeamFriendlyScorePad1",
  "TeamFriendlyScorePad2",
  "TeamOpponentScore",
  "TeamOpponentScorePad1",
  "TeamOpponentScorePad2",
  "FriendlyScorePulse",
  "EnemyScorePulse",
  "FriendlyProgressPulse",
  "EnemyProgressPulse",
  "FriendlyTicketsFill",
  "EnemyTicketsFill",
  "FLAGA",
  "FLAGB",
  "FLAGC",
  "FLAGA_FILL",
  "FLAGB_FILL",
  "FLAGC_FILL",
  "FLAGA_OL_T",
  "FLAGA_OL_B",
  "FLAGA_OL_L",
  "FLAGA_OL_R",
  "FLAGB_OL_T",
  "FLAGB_OL_B",
  "FLAGB_OL_L",
  "FLAGB_OL_R",
  "FLAGC_OL_T",
  "FLAGC_OL_B",
  "FLAGC_OL_L",
  "FLAGC_OL_R",
  "ActiveFlagContainer",
  "ActiveFlag",
  "FriendlyCap",
  "EnemyCap",
  "CapProgress",
];

const LIVE_HUD_SLOT_DELETE_WIDGET_BASE_NAMES: string[] = [
  "LiveHudSlotAnchor",
  "LiveHudRoot",
  "LiveHudTimeBox",
  "RemainingTime",
  "LiveHudFriendlyScoreBox",
  "LiveHudEnemyScoreBox",
  "LiveHudFriendlyProgressBar",
  "LiveHudEnemyProgressBar",
  "FlagContainerA",
  "FlagContainerB",
  "FlagContainerC",
  ...LIVE_HUD_SLOT_VISIBLE_WIDGET_BASE_NAMES,
];

function deleteLiveHudWidgetsForSlot(slotKey: string): void {
  for (let i = 0; i < LIVE_HUD_SLOT_DELETE_WIDGET_BASE_NAMES.length; i++) {
    safeDeleteWidgetByName(getLiveHudWidgetName(slotKey, LIVE_HUD_SLOT_DELETE_WIDGET_BASE_NAMES[i]));
  }
}

function resetLiveUiSlotOwnerArrays(): void {
  for (let i = 0; i < LIVE_UI_SLOTS_PER_TEAM; i++) {
    playerIdByLiveUiSlotTeam1[i] = undefined;
    playerIdByLiveUiSlotTeam2[i] = undefined;
  }
}

function resetLiveUiDiagnostics(): void {
  lastActiveTimerCount = Timers.getActiveTimerCount();
  liveUiAssignedSlotCount = 0;
  liveUiFailedAssignmentCount = 0;
  liveUiSlotExhaustedWarnedByTeamKey = {};
}

function clearLiveHudPrebuildQueue(): void {
  liveHudPrebuildQueue = [];
  liveHudPrebuildQueuedByPlayerId = {};
}

function dequeueLiveHudPrebuildForPlayer(playerId: number): void {
  delete liveHudPrebuildQueuedByPlayerId[playerId];
}

function queueLiveHudPrebuildForPlayer(player: Player | undefined): void {
  if (!player) return;
  if (gameStatus === 3) return;
  if (!mod.IsPlayerValid(player.player) || !isParticipantPlayer(player.player)) {
    dequeueLiveHudPrebuildForPlayer(player.id);
    return;
  }
  if (liveHudPrebuildQueuedByPlayerId[player.id] === true) return;

  liveHudPrebuildQueuedByPlayerId[player.id] = true;
  liveHudPrebuildQueue.push(player.id);
}

function queueLiveHudPrebuildForAllParticipants(): void {
  serverPlayers.forEach((p) => queueLiveHudPrebuildForPlayer(p));
}

function drainLiveHudPrebuildQueue(maxPlayers: number, allowHiddenBuild: boolean): void {
  let builtCount = 0;

  while (liveHudPrebuildQueue.length > 0 && builtCount < maxPlayers) {
    const playerId = liveHudPrebuildQueue.shift();
    if (playerId === undefined) continue;
    if (liveHudPrebuildQueuedByPlayerId[playerId] !== true) continue;

    delete liveHudPrebuildQueuedByPlayerId[playerId];

    const player = serverPlayers.get(playerId);
    if (!player) continue;

    if (!mod.IsPlayerValid(player.player) || !isParticipantPlayer(player.player)) {
      releaseLiveHudSlotForPlayer(playerId);
      continue;
    }

    if (!ensureLiveHudSlotForPlayer(player, allowHiddenBuild)) {
      queueLiveHudPrebuildForPlayer(player);
      break;
    }

    setLiveHudVisibleForPlayer(player, false);
    builtCount += 1;
  }
}

function warnLiveHudSlotExhaustedOnce(teamKey: LiveUiTeamKey): void {
  if (liveUiSlotExhaustedWarnedByTeamKey[teamKey] === true) return;
  liveUiSlotExhaustedWarnedByTeamKey[teamKey] = true;

  mod.DisplayHighlightedWorldLogMessage(
    mod.Message("[LIVE HUD] No free {} slot available for HUD assignment", teamKey)
  );
}

function bindPlayerLiveHudWidgetsForSlot(p: Player, assignment: LiveUiSlotAssignment): void {
  const slotKey = assignment.slotKey;

  p.liveHudSlotTeamKey = assignment.teamKey;
  p.liveHudSlotIndex = assignment.slotIndex;
  p.liveHudSlotKey = slotKey;

  p.liveHudRootWidget = findLiveHudWidget(slotKey, "LiveHudSlotAnchor") as any;
  p.remainingTimeWidget = null as any;

  p.friendlyScoreWidget = findLiveHudWidget(slotKey, "TeamFriendlyScore") as any;
  p.opponentScoreWidget = findLiveHudWidget(slotKey, "TeamOpponentScore") as any;
  p.friendlyScorePad1Widget = findLiveHudWidget(slotKey, "TeamFriendlyScorePad1") as any;
  p.friendlyScorePad2Widget = findLiveHudWidget(slotKey, "TeamFriendlyScorePad2") as any;
  p.opponentScorePad1Widget = findLiveHudWidget(slotKey, "TeamOpponentScorePad1") as any;
  p.opponentScorePad2Widget = findLiveHudWidget(slotKey, "TeamOpponentScorePad2") as any;

  p.friendlyTicketsFillWidget = findLiveHudWidget(slotKey, "FriendlyTicketsFill") as any;
  p.enemyTicketsFillWidget = findLiveHudWidget(slotKey, "EnemyTicketsFill") as any;
  p.friendlyScorePulseWidget = findLiveHudWidget(slotKey, "FriendlyScorePulse") as any;
  p.enemyScorePulseWidget = findLiveHudWidget(slotKey, "EnemyScorePulse") as any;
  p.friendlyProgressPulseWidget = findLiveHudWidget(slotKey, "FriendlyProgressPulse") as any;
  p.enemyProgressPulseWidget = findLiveHudWidget(slotKey, "EnemyProgressPulse") as any;

  p.flagContainerWidget = {
    A: getSharedLiveHudWidget("FlagContainerA") as any,
    B: getSharedLiveHudWidget("FlagContainerB") as any,
    C: getSharedLiveHudWidget("FlagContainerC") as any,
  };

  p.flagWidget = {
    A: findLiveHudWidget(slotKey, "FLAGA") as any,
    B: findLiveHudWidget(slotKey, "FLAGB") as any,
    C: findLiveHudWidget(slotKey, "FLAGC") as any,
  };

  p.flagFillWidget = {
    A: findLiveHudWidget(slotKey, "FLAGA_FILL") as any,
    B: findLiveHudWidget(slotKey, "FLAGB_FILL") as any,
    C: findLiveHudWidget(slotKey, "FLAGC_FILL") as any,
  };

  p.flagOutlineWidget = {
    A: collectLiveHudFlagOutlineWidgets(slotKey, "A"),
    B: collectLiveHudFlagOutlineWidgets(slotKey, "B"),
    C: collectLiveHudFlagOutlineWidgets(slotKey, "C"),
  };

  p.activeFlagContainerWidget = findLiveHudWidget(slotKey, "ActiveFlagContainer") as any;
  p.activeFlagWidget = findLiveHudWidget(slotKey, "ActiveFlag") as any;
  p.activeFlagFriendlyWidget = findLiveHudWidget(slotKey, "FriendlyCap") as any;
  p.activeFlagEnemyWidget = findLiveHudWidget(slotKey, "EnemyCap") as any;
  p.friendlyCapWidget = p.activeFlagFriendlyWidget;
  p.enemyCapWidget = p.activeFlagEnemyWidget;
  p.progressBarWidget = findLiveHudWidget(slotKey, "CapProgress") as any;
}

function allocateLiveHudSlotForPlayer(p: Player): LiveUiSlotAssignment | undefined {
  const teamKey = getLiveUiTeamKey(mod.GetTeam(p.player));
  if (!teamKey) return undefined;

  const owners = getLiveUiSlotOwners(teamKey);
  for (let i = 0; i < LIVE_UI_SLOTS_PER_TEAM; i++) {
    if (isReservedLiveHudSlot(teamKey, i)) continue;
    if (owners[i] !== undefined) continue;

    owners[i] = p.id;

    const assignment: LiveUiSlotAssignment = {
      teamKey,
      slotIndex: i,
      slotKey: getLiveUiSlotKey(teamKey, i),
    };

    liveUiSlotByPlayerId[p.id] = assignment;
    liveUiAssignedSlotCount += 1;
    bindPlayerLiveHudWidgetsForSlot(p, assignment);
    return assignment;
  }

  liveUiFailedAssignmentCount += 1;
  warnLiveHudSlotExhaustedOnce(teamKey);
  return undefined;
}

function releaseLiveHudSlotForPlayer(playerId: number): void {
  dequeueLiveHudPrebuildForPlayer(playerId);

  const assignment = liveUiSlotByPlayerId[playerId];
  if (assignment) {
    const owners = getLiveUiSlotOwners(assignment.teamKey);
    if (owners[assignment.slotIndex] === playerId) {
      owners[assignment.slotIndex] = undefined;
    }

    deleteLiveHudWidgetsForSlot(assignment.slotKey);
    delete liveUiSlotByPlayerId[playerId];
    if (liveUiAssignedSlotCount > 0) liveUiAssignedSlotCount -= 1;
  }

  deleteLegacyLiveHudWidgetsForPlayer(playerId);

  const connectedPlayer = serverPlayers.get(playerId);
  if (connectedPlayer) connectedPlayer.clearLiveHudRefs();

  for (let i = 0; i < disconnectedPlayers.length; i++) {
    if (disconnectedPlayers[i].id !== playerId) continue;
    disconnectedPlayers[i].clearLiveHudRefs();
    break;
  }
}

function setLiveHudVisibleForPlayer(p: Player, visible: boolean): void {
  if (!p.liveHudSlotKey) return;

  const slotKey = p.liveHudSlotKey;
  const playerTeam = mod.GetTeam(p.player);
  const friendly = getFriendlyScore(playerTeam);
  const enemy = getOpponentScore(playerTeam);
  const activeFlagVisible = visible && p.getCapturePoint() !== null;

  for (let i = 0; i < LIVE_HUD_SLOT_VISIBLE_WIDGET_BASE_NAMES.length; i++) {
    const baseName = LIVE_HUD_SLOT_VISIBLE_WIDGET_BASE_NAMES[i];
    const widget = findLiveHudWidget(slotKey, baseName);
    if (!widget) continue;

    let widgetVisible = visible;
    if (baseName === "TeamFriendlyScorePad1") widgetVisible = visible && friendly < 100;
    else if (baseName === "TeamFriendlyScorePad2") widgetVisible = visible && friendly < 10;
    else if (baseName === "TeamOpponentScorePad1") widgetVisible = visible && enemy < 100;
    else if (baseName === "TeamOpponentScorePad2") widgetVisible = visible && enemy < 10;
    else if (baseName === "ActiveFlagContainer") widgetVisible = activeFlagVisible;

    SafeSetWidgetVisibleHandle(widget, widgetVisible);
  }
}

function setLiveHudVisibleForAllPlayers(visible: boolean): void {
  serverPlayers.forEach((p) => setLiveHudVisibleForPlayer(p, visible));
}

function resetAllLiveHudState(): void {
  stopLiveHudTopFlagBlinkTimer(false);
  stopLiveHudPulseTimer(false);
  liveHudTopFlagsDirty = true;
  liveHudTopFlagDirtyBySymbol = { A: true, B: true, C: true };
  liveHudTopFlagBlinkNeutralPhase = false;

  const teamKeys: LiveUiTeamKey[] = ["T1", "T2"];
  for (let teamIndex = 0; teamIndex < teamKeys.length; teamIndex++) {
    const teamKey = teamKeys[teamIndex];
    for (let slotIndex = 0; slotIndex < LIVE_UI_SLOTS_PER_TEAM; slotIndex++) {
      deleteLiveHudWidgetsForSlot(getLiveUiSlotKey(teamKey, slotIndex));
    }
  }

  const clearPlayerHud = (player: Player): void => {
    deleteLegacyLiveHudWidgetsForPlayer(player.id);
    player.clearLiveHudRefs();
  };

  serverPlayers.forEach((p) => clearPlayerHud(p));
  for (let i = 0; i < disconnectedPlayers.length; i++) {
    clearPlayerHud(disconnectedPlayers[i]);
  }

  liveUiSlotByPlayerId = {};
  resetLiveUiSlotOwnerArrays();
  resetLiveUiDiagnostics();
  clearLiveHudPrebuildQueue();
}

function buildLiveHudWidgetsForPlayer(p: Player, assignment: LiveUiSlotAssignment): void {
  const slotKey = assignment.slotKey;
  const slotName = (widgetBaseName: string): string => getLiveHudWidgetName(slotKey, widgetBaseName);
  const liveContainer = getLiveHudContainerWidget();
  const friendlyScoreParent = getSharedLiveHudWidget("friendlyscore");
  const enemyScoreParent = getSharedLiveHudWidget("enemyscore");
  const friendlyProgressBarParent = getSharedLiveHudWidget("friendlyprogressbar");
  const enemyProgressBarParent = getSharedLiveHudWidget("enemyprogressbar");
  const flagContainerA = getSharedLiveHudWidget("FlagContainerA");
  const flagContainerB = getSharedLiveHudWidget("FlagContainerB");
  const flagContainerC = getSharedLiveHudWidget("FlagContainerC");

  if (
    !liveContainer ||
    !friendlyScoreParent ||
    !enemyScoreParent ||
    !friendlyProgressBarParent ||
    !enemyProgressBarParent ||
    !flagContainerA ||
    !flagContainerB ||
    !flagContainerC
  ) {
    return;
  }

  deleteLiveHudWidgetsForSlot(slotKey);

  mod.AddUIContainer(
    slotName("LiveHudSlotAnchor"),
    mod.CreateVector(0, 0, 0),
    mod.CreateVector(1, 1, 0),
    mod.UIAnchor.TopLeft,
    liveContainer,
    true,
    0,
    mod.CreateVector(0, 0, 0),
    0,
    mod.UIBgFill.None,
    p.player
  );

  mod.AddUIText(
    slotName("TeamFriendlyScore"),
    mod.CreateVector(0, 0, 0),
    mod.CreateVector(150, 34, 0),
    mod.UIAnchor.TopCenter,
    friendlyScoreParent,
    true,
    0,
    mod.CreateVector(0, 0, 0),
    0,
    mod.UIBgFill.None,
    mod.Message(getFriendlyScore(mod.GetTeam(p.player))),
    24,
    COLOR_FRIENDLY,
    1,
    mod.UIAnchor.Center,
    p.player
  );

  mod.AddUIText(
    slotName("TeamFriendlyScorePad1"),
    mod.CreateVector(-18, 0, 0),
    mod.CreateVector(30, 34, 0),
    mod.UIAnchor.TopCenter,
    friendlyScoreParent,
    true,
    0,
    mod.CreateVector(0, 0, 0),
    0,
    mod.UIBgFill.None,
    mod.Message(0),
    24,
    COLOR_FRIENDLY,
    1,
    mod.UIAnchor.Center,
    p.player
  );

  mod.AddUIText(
    slotName("TeamFriendlyScorePad2"),
    mod.CreateVector(-34, 0, 0),
    mod.CreateVector(30, 34, 0),
    mod.UIAnchor.TopCenter,
    friendlyScoreParent,
    true,
    0,
    mod.CreateVector(0, 0, 0),
    0,
    mod.UIBgFill.None,
    mod.Message(0),
    24,
    COLOR_FRIENDLY,
    1,
    mod.UIAnchor.Center,
    p.player
  );

  mod.AddUIText(
    slotName("TeamOpponentScore"),
    mod.CreateVector(0, 0, 0),
    mod.CreateVector(150, 34, 0),
    mod.UIAnchor.TopCenter,
    enemyScoreParent,
    true,
    0,
    mod.CreateVector(0, 0, 0),
    0,
    mod.UIBgFill.None,
    mod.Message(getOpponentScore(mod.GetTeam(p.player))),
    24,
    COLOR_ENEMY,
    1,
    mod.UIAnchor.Center,
    p.player
  );

  mod.AddUIText(
    slotName("TeamOpponentScorePad1"),
    mod.CreateVector(-18, 0, 0),
    mod.CreateVector(30, 34, 0),
    mod.UIAnchor.TopCenter,
    enemyScoreParent,
    true,
    0,
    mod.CreateVector(0, 0, 0),
    0,
    mod.UIBgFill.None,
    mod.Message(0),
    24,
    COLOR_ENEMY,
    1,
    mod.UIAnchor.Center,
    p.player
  );

  mod.AddUIText(
    slotName("TeamOpponentScorePad2"),
    mod.CreateVector(-34, 0, 0),
    mod.CreateVector(30, 34, 0),
    mod.UIAnchor.TopCenter,
    enemyScoreParent,
    true,
    0,
    mod.CreateVector(0, 0, 0),
    0,
    mod.UIBgFill.None,
    mod.Message(0),
    24,
    COLOR_ENEMY,
    1,
    mod.UIAnchor.Center,
    p.player
  );

  mod.AddUIContainer(
    slotName("FriendlyScorePulse"),
    mod.CreateVector(0, 0, 0),
    mod.CreateVector(120, 34, 0),
    mod.UIAnchor.TopLeft,
    friendlyScoreParent,
    true,
    0,
    mod.CreateVector(0.2314, 0.4196, 0.6745),
    0,
    mod.UIBgFill.GradientLeft,
    p.player
  );

  mod.AddUIContainer(
    slotName("EnemyScorePulse"),
    mod.CreateVector(0, 0, 0),
    mod.CreateVector(120, 34, 0),
    mod.UIAnchor.TopLeft,
    enemyScoreParent,
    true,
    0,
    mod.CreateVector(0.698, 0.1882, 0.1882),
    0,
    mod.UIBgFill.GradientRight,
    p.player
  );

  mod.AddUIContainer(
    slotName("FriendlyTicketsFill"),
    mod.CreateVector(0, 1, 0),
    mod.CreateVector(210, 4, 0),
    mod.UIAnchor.TopLeft,
    friendlyProgressBarParent,
    true,
    0,
    mod.CreateVector(0.2314, 0.4196, 0.6745),
    1,
    mod.UIBgFill.GradientRight,
    p.player
  );

  mod.AddUIContainer(
    slotName("EnemyTicketsFill"),
    mod.CreateVector(0, 1, 0),
    mod.CreateVector(210, 4, 0),
    mod.UIAnchor.TopLeft,
    enemyProgressBarParent,
    true,
    0,
    mod.CreateVector(0.698, 0.1882, 0.1882),
    1,
    mod.UIBgFill.GradientLeft,
    p.player
  );

  mod.AddUIContainer(
    slotName("FriendlyProgressPulse"),
    mod.CreateVector(0, 0, 0),
    mod.CreateVector(210, 6, 0),
    mod.UIAnchor.TopLeft,
    friendlyProgressBarParent,
    true,
    0,
    mod.CreateVector(0.2314, 0.4196, 0.6745),
    0,
    mod.UIBgFill.GradientLeft,
    p.player
  );

  mod.AddUIContainer(
    slotName("EnemyProgressPulse"),
    mod.CreateVector(0, 0, 0),
    mod.CreateVector(210, 6, 0),
    mod.UIAnchor.TopLeft,
    enemyProgressBarParent,
    true,
    0,
    mod.CreateVector(0.698, 0.1882, 0.1882),
    0,
    mod.UIBgFill.GradientRight,
    p.player
  );

  mod.AddUIText(
    slotName("FLAGA"),
    mod.CreateVector(0, 0, 0),
    mod.CreateVector(30, 30, 0),
    mod.UIAnchor.Center,
    flagContainerA,
    true,
    0,
    mod.CreateVector(0, 0, 0),
    0.4,
    mod.UIBgFill.Blur,
    mod.Message("A"),
    18,
    serverCapturePoints[CP_A_ID].getColor(mod.GetTeam(p.player)),
    1,
    mod.UIAnchor.Center,
    p.player
  );

  mod.AddUIText(
    slotName("FLAGB"),
    mod.CreateVector(0, 0, 0),
    mod.CreateVector(30, 30, 0),
    mod.UIAnchor.Center,
    flagContainerB,
    true,
    0,
    mod.CreateVector(0, 0, 0),
    0.4,
    mod.UIBgFill.Blur,
    mod.Message("B"),
    18,
    serverCapturePoints[CP_B_ID].getColor(mod.GetTeam(p.player)),
    1,
    mod.UIAnchor.Center,
    p.player
  );

  mod.AddUIText(
    slotName("FLAGC"),
    mod.CreateVector(0, 0, 0),
    mod.CreateVector(30, 30, 0),
    mod.UIAnchor.Center,
    flagContainerC,
    true,
    0,
    mod.CreateVector(0, 0, 0),
    0.4,
    mod.UIBgFill.Blur,
    mod.Message("C"),
    18,
    serverCapturePoints[CP_C_ID].getColor(mod.GetTeam(p.player)),
    1,
    mod.UIAnchor.Center,
    p.player
  );

  const outlineThickness = 1;
  const flagBoxSize = 30;
  const flagFillAlpha = 0.5;

  const addFlagOutline = (
    symbol: LiveUiFlagSymbol,
    parentWidget: mod.UIWidget,
    color: mod.Vector
  ): void => {
    const half = flagBoxSize / 2;
    const tHalf = outlineThickness / 2;

    mod.AddUIContainer(
      slotName("FLAG" + symbol + "_OL_T"),
      mod.CreateVector(0, -half + tHalf, 0),
      mod.CreateVector(flagBoxSize, outlineThickness, 0),
      mod.UIAnchor.Center,
      parentWidget,
      true,
      0,
      color,
      1,
      mod.UIBgFill.Solid,
      p.player
    );
    mod.AddUIContainer(
      slotName("FLAG" + symbol + "_OL_B"),
      mod.CreateVector(0, half - tHalf, 0),
      mod.CreateVector(flagBoxSize, outlineThickness, 0),
      mod.UIAnchor.Center,
      parentWidget,
      true,
      0,
      color,
      1,
      mod.UIBgFill.Solid,
      p.player
    );
    mod.AddUIContainer(
      slotName("FLAG" + symbol + "_OL_L"),
      mod.CreateVector(-half + tHalf, 0, 0),
      mod.CreateVector(outlineThickness, flagBoxSize, 0),
      mod.UIAnchor.Center,
      parentWidget,
      true,
      0,
      color,
      1,
      mod.UIBgFill.Solid,
      p.player
    );
    mod.AddUIContainer(
      slotName("FLAG" + symbol + "_OL_R"),
      mod.CreateVector(half - tHalf, 0, 0),
      mod.CreateVector(outlineThickness, flagBoxSize, 0),
      mod.UIAnchor.Center,
      parentWidget,
      true,
      0,
      color,
      1,
      mod.UIBgFill.Solid,
      p.player
    );
  };

  const addFlagFill = (
    symbol: LiveUiFlagSymbol,
    parentWidget: mod.UIWidget,
    color: mod.Vector
  ): void => {
    mod.AddUIContainer(
      slotName("FLAG" + symbol + "_FILL"),
      mod.CreateVector(0, 0, 0),
      mod.CreateVector(flagBoxSize, flagBoxSize, 0),
      mod.UIAnchor.Center,
      parentWidget,
      true,
      0,
      color,
      flagFillAlpha,
      mod.UIBgFill.Blur,
      p.player
    );
  };

  addFlagFill("A", flagContainerA, serverCapturePoints[CP_A_ID].getColor(mod.GetTeam(p.player)));
  addFlagFill("B", flagContainerB, serverCapturePoints[CP_B_ID].getColor(mod.GetTeam(p.player)));
  addFlagFill("C", flagContainerC, serverCapturePoints[CP_C_ID].getColor(mod.GetTeam(p.player)));

  addFlagOutline("A", flagContainerA, serverCapturePoints[CP_A_ID].getColor(mod.GetTeam(p.player)));
  addFlagOutline("B", flagContainerB, serverCapturePoints[CP_B_ID].getColor(mod.GetTeam(p.player)));
  addFlagOutline("C", flagContainerC, serverCapturePoints[CP_C_ID].getColor(mod.GetTeam(p.player)));

  mod.AddUIContainer(
    slotName("ActiveFlagContainer"),
    mod.CreateVector(0, 120, 0),
    mod.CreateVector(180, 80, 0),
    mod.UIAnchor.TopCenter,
    liveContainer,
    false,
    0,
    mod.CreateVector(0.0314, 0.0431, 0.0431),
    0.4,
    mod.UIBgFill.None,
    p.player
  );

  const activeFlagParent = findLiveHudWidget(slotKey, "ActiveFlagContainer");
  if (!activeFlagParent) return;

  mod.AddUIText(
    slotName("ActiveFlag"),
    mod.CreateVector(0, 0, 0),
    mod.CreateVector(60, 60, 0),
    mod.UIAnchor.Center,
    activeFlagParent,
    true,
    0,
    mod.CreateVector(0, 0, 0),
    0.4,
    mod.UIBgFill.Blur,
    mod.Message(0),
    34,
    COLOR_NEUTRAL,
    1,
    mod.UIAnchor.Center,
    p.player
  );

  mod.AddUIText(
    slotName("FriendlyCap"),
    mod.CreateVector(-80, 0, 0),
    mod.CreateVector(40, 40, 0),
    mod.UIAnchor.Center,
    activeFlagParent,
    true,
    0,
    mod.CreateVector(0, 0, 0),
    0.2,
    mod.UIBgFill.Blur,
    mod.Message(0),
    20,
    COLOR_FRIENDLY,
    1,
    mod.UIAnchor.Center,
    p.player
  );

  mod.AddUIText(
    slotName("EnemyCap"),
    mod.CreateVector(80, 0, 0),
    mod.CreateVector(40, 40, 0),
    mod.UIAnchor.Center,
    activeFlagParent,
    true,
    0,
    mod.CreateVector(0, 0, 0),
    0.2,
    mod.UIBgFill.Blur,
    mod.Message(0),
    20,
    COLOR_ENEMY,
    1,
    mod.UIAnchor.Center,
    p.player
  );

  mod.AddUIContainer(
    slotName("CapProgress"),
    mod.CreateVector(60, 0, 0),
    mod.CreateVector(0, 60, 0),
    mod.UIAnchor.CenterLeft,
    activeFlagParent,
    true,
    0,
    mod.CreateVector(1, 1, 1),
    0.4,
    mod.UIBgFill.Solid,
    p.player
  );

  bindPlayerLiveHudWidgetsForSlot(p, assignment);
  SafeSetWidgetVisibleHandle(p.friendlyScorePad1Widget, false);
  SafeSetWidgetVisibleHandle(p.friendlyScorePad2Widget, false);
  SafeSetWidgetVisibleHandle(p.opponentScorePad1Widget, false);
  SafeSetWidgetVisibleHandle(p.opponentScorePad2Widget, false);
  SafeSetWidgetVisibleHandle(p.activeFlagContainerWidget, false);
}

function ensureReservedLiveHudSlotForPlayer(p: Player): boolean {
  const assignment = getReservedLiveHudSlotAssignment();
  const existingAssignment = liveUiSlotByPlayerId[p.id];

  if (
    existingAssignment &&
    (existingAssignment.teamKey !== assignment.teamKey || existingAssignment.slotIndex !== assignment.slotIndex)
  ) {
    releaseLiveHudSlotForPlayer(p.id);
  }

  const owners = getLiveUiSlotOwners(assignment.teamKey);
  const currentOwner = owners[assignment.slotIndex];

  if (currentOwner !== undefined && currentOwner !== p.id) {
    releaseLiveHudSlotForPlayer(currentOwner);
  }

  if (liveUiSlotByPlayerId[p.id] === undefined) {
    liveUiAssignedSlotCount += 1;
  }

  owners[assignment.slotIndex] = p.id;
  liveUiSlotByPlayerId[p.id] = assignment;

  if (!p.liveHudRootWidget || p.liveHudSlotKey !== assignment.slotKey) {
    buildLiveHudWidgetsForPlayer(p, assignment);
  } else {
    bindPlayerLiveHudWidgetsForSlot(p, assignment);
  }

  if (!p.liveHudRootWidget) {
    releaseLiveHudSlotForPlayer(p.id);
    return false;
  }

  return true;
}

function ensureLiveHudSlotForPlayer(p: Player, allowHiddenBuild: boolean = false): boolean {
  const liveVisibleReady = gameStatus === 3;
  const hiddenPrebuildReady =
    allowHiddenBuild &&
    gameStatus >= 0 &&
    gameStatus <= 2 &&
    initialization[0];

  if (!liveVisibleReady && !hiddenPrebuildReady) return false;

  const excludedPlayer = isExcludedPlayer(p.player);
  const participant = isParticipantPlayer(p.player);

  if (!participant && !excludedPlayer) {
    releaseLiveHudSlotForPlayer(p.id);
    return false;
  }

  if (excludedPlayer) {
    if (!liveVisibleReady) return false;
    return ensureReservedLiveHudSlotForPlayer(p);
  }

  const currentTeamKey = getLiveUiTeamKey(mod.GetTeam(p.player));
  if (!currentTeamKey) {
    releaseLiveHudSlotForPlayer(p.id);
    return false;
  }

  const existingAssignment = liveUiSlotByPlayerId[p.id];
  if (existingAssignment && existingAssignment.teamKey !== currentTeamKey) {
    releaseLiveHudSlotForPlayer(p.id);
  }

  const assignment = liveUiSlotByPlayerId[p.id] ?? allocateLiveHudSlotForPlayer(p);
  if (!assignment) return false;

  const owners = getLiveUiSlotOwners(assignment.teamKey);
  owners[assignment.slotIndex] = p.id;

  if (!p.liveHudRootWidget) {
    buildLiveHudWidgetsForPlayer(p, assignment);
  } else {
    bindPlayerLiveHudWidgetsForSlot(p, assignment);
  }

  if (!p.liveHudRootWidget) {
    releaseLiveHudSlotForPlayer(p.id);
    return false;
  }

  return true;
}


/* -----------------------------------------------------------------------------------------------
   Live HUD helpers
------------------------------------------------------------------------------------------------ */
const TICKET_PULSE_OVERLAY_MAX_ALPHA = 0.8;
const TICKET_PULSE_FILL_MIN_ALPHA = 0.55;
const PULSE_DURATION_SECONDS = 0.55;
const PULSE_STEP_SECONDS = 0.05;
const TICKET_PULSE_DURATION_TICKS = mod.Max(1, mod.Ceiling(PULSE_DURATION_SECONDS * TICK_RATE));


function clamp01(x: number): number {
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

function getTicketPulseTriangle(playerPulseUntilTick: number): number {
  if (playerPulseUntilTick <= serverTickCount) return 0;

  const elapsedTicks = TICKET_PULSE_DURATION_TICKS - (playerPulseUntilTick - serverTickCount);
  const t = clamp01(elapsedTicks / TICKET_PULSE_DURATION_TICKS);
  return t <= 0.5 ? (t / 0.5) : ((1 - t) / 0.5);
}

function getTicketPulseTextAlpha(playerPulseUntilTick: number): number {
  const triangle = getTicketPulseTriangle(playerPulseUntilTick);
  return TICKET_PULSE_TEXT_MIN_ALPHA + (TICKET_PULSE_TEXT_MAX_ALPHA - TICKET_PULSE_TEXT_MIN_ALPHA) * triangle;
}

function getTicketPulseOverlayAlpha(playerPulseUntilTick: number): number {
  return TICKET_PULSE_OVERLAY_MAX_ALPHA * getTicketPulseTriangle(playerPulseUntilTick);
}

function getTicketPulseFillAlpha(playerPulseUntilTick: number): number {
  const triangle = getTicketPulseTriangle(playerPulseUntilTick);
  return 1 - ((1 - TICKET_PULSE_FILL_MIN_ALPHA) * triangle);
}

function getDisplayedTeamTickets(team: mod.Team): number {
  return mod.Equals(team, team1) ? mod.Ceiling(serverScores[0]) : mod.Ceiling(serverScores[1]);
}

function applyLiveHudPulseStateToPlayer(p: Player, side: "friendly" | "enemy"): void {
  const pulseUntilTick = side === "friendly" ? p.liveHudFriendlyPulseUntilTick : p.liveHudEnemyPulseUntilTick;
  const scoreWidget = side === "friendly" ? p.friendlyScoreWidget : p.opponentScoreWidget;
  const scorePulseWidget = side === "friendly" ? p.friendlyScorePulseWidget : p.enemyScorePulseWidget;
  const progressPulseWidget = side === "friendly" ? p.friendlyProgressPulseWidget : p.enemyProgressPulseWidget;
  const fillWidget = side === "friendly" ? p.friendlyTicketsFillWidget : p.enemyTicketsFillWidget;

  if (pulseUntilTick <= serverTickCount) {
    if (scoreWidget) mod.SetUITextAlpha(scoreWidget, 1);
    if (scorePulseWidget) mod.SetUIWidgetBgAlpha(scorePulseWidget, 0);
    if (progressPulseWidget) mod.SetUIWidgetBgAlpha(progressPulseWidget, 0);
    if (fillWidget) mod.SetUIWidgetBgAlpha(fillWidget, 1);
    return;
  }

  const textAlpha = getTicketPulseTextAlpha(pulseUntilTick);
  const overlayAlpha = getTicketPulseOverlayAlpha(pulseUntilTick);
  const fillAlpha = getTicketPulseFillAlpha(pulseUntilTick);

  if (scoreWidget) mod.SetUITextAlpha(scoreWidget, textAlpha);
  if (scorePulseWidget) mod.SetUIWidgetBgAlpha(scorePulseWidget, overlayAlpha);
  if (progressPulseWidget) mod.SetUIWidgetBgAlpha(progressPulseWidget, overlayAlpha);
  if (fillWidget) mod.SetUIWidgetBgAlpha(fillWidget, fillAlpha);
}

function hasAnyActiveLiveHudPulse(): boolean {
  let active = false;
  serverPlayers.forEach((p) => {
    if (active) return;
    if (!p.liveHudRootWidget) return;
    if (p.liveHudFriendlyPulseUntilTick > serverTickCount || p.liveHudEnemyPulseUntilTick > serverTickCount) {
      active = true;
    }
  });
  return active;
}

function stopLiveHudPulseTimer(applyFinalState: boolean = false): void {
  Timers.clearInterval(liveHudPulseIntervalHandle);
  liveHudPulseIntervalHandle = undefined;
  if (applyFinalState) UpdateLiveHudPulses();
}

function ensureLiveHudPulseTimer(): void {
  if (liveHudPulseIntervalHandle !== undefined) return;
  liveHudPulseIntervalHandle = Timers.setInterval(() => {
    if (!hasAnyActiveLiveHudPulse()) {
      stopLiveHudPulseTimer(true);
      return;
    }

    UpdateLiveHudPulses();
  }, PULSE_STEP_SECONDS * 1000);
}

function UpdateLiveHudPulses(): void {
  serverPlayers.forEach((p) => {
    if (!p.liveHudRootWidget) return;
    applyLiveHudPulseStateToPlayer(p, "friendly");
    applyLiveHudPulseStateToPlayer(p, "enemy");
  });
}

function getLiveHudPerspectiveTeamForPlayer(p: Player): mod.Team {
  return isExcludedPlayer(p.player) ? team1 : mod.GetTeam(p.player);
}

function isCapturePointBeingNeutralizedForHud(cp: CapturePoint): boolean {
  return getCapturePointPhase(cp) === "neutralizing_enemy";
}

function shouldShowNeutralizedFlagLaneNeutralPhase(): boolean {
  return liveHudTopFlagBlinkNeutralPhase;
}

function getLiveHudTopFlagLaneColorForTeam(cp: CapturePoint, perspectiveTeam: mod.Team): mod.Vector {
  const baseColor = cp.getColor(perspectiveTeam);
  if (!isCapturePointBeingNeutralizedForHud(cp)) return baseColor;
  return shouldShowNeutralizedFlagLaneNeutralPhase() ? COLOR_NEUTRAL : baseColor;
}

function getCapturePointProgressFillColorForTeam(cp: CapturePoint, perspectiveTeam: mod.Team): mod.Vector {
  const phase = getCapturePointPhase(cp);
  const progressTeam = cp.getProgressTeam();

  if (phase === "neutral_idle") {
    return COLOR_NEUTRAL;
  }

  if (phase === "owned_idle") {
    return mod.Equals(cp.getOwner(), perspectiveTeam) ? COLOR_FRIENDLY : COLOR_ENEMY;
  }

  if (phase === "contested") {
    if (!mod.Equals(progressTeam, teamNeutral)) {
      return mod.Equals(progressTeam, perspectiveTeam) ? COLOR_FRIENDLY : COLOR_ENEMY;
    }
    if (mod.Equals(cp.getOwner(), perspectiveTeam)) return COLOR_FRIENDLY;
    if (mod.Equals(cp.getOwner(), teamNeutral)) return COLOR_NEUTRAL;
    return COLOR_ENEMY;
  }

  return mod.Equals(progressTeam, perspectiveTeam) ? COLOR_FRIENDLY : COLOR_ENEMY;
}

function getLiveHudNeutralizingFlagSymbols(): LiveUiFlagSymbol[] {
  const symbols: LiveUiFlagSymbol[] = [];

  for (let i = 0; i < LIVE_HUD_FLAG_SYMBOLS.length; i++) {
    const symbol = LIVE_HUD_FLAG_SYMBOLS[i];
    const cp = getCapturePointBySymbol(symbol);
    if (!cp || !isCapturePointBeingNeutralizedForHud(cp)) continue;
    symbols.push(symbol);
  }

  return symbols;
}

function stopLiveHudTopFlagBlinkTimer(resetToNormalColor: boolean = false): void {
  Timers.clearInterval(liveHudTopFlagBlinkIntervalHandle);
  liveHudTopFlagBlinkIntervalHandle = undefined;

  if (liveHudTopFlagBlinkNeutralPhase) {
    liveHudTopFlagBlinkNeutralPhase = false;
    if (resetToNormalColor) {
      markLiveHudTopFlagsDirtyAll();
    }
  }
}

function ensureLiveHudTopFlagBlinkTimer(): void {
  const activeSymbols = getLiveHudNeutralizingFlagSymbols();
  if (activeSymbols.length <= 0) {
    stopLiveHudTopFlagBlinkTimer(true);
    return;
  }

  if (liveHudTopFlagBlinkIntervalHandle === undefined) {
    liveHudTopFlagBlinkNeutralPhase = true;
    for (let i = 0; i < activeSymbols.length; i++) {
      markLiveHudTopFlagLaneDirty(activeSymbols[i]);
    }

    liveHudTopFlagBlinkIntervalHandle = Timers.setInterval(() => {
      const blinkingSymbols = getLiveHudNeutralizingFlagSymbols();
      if (blinkingSymbols.length <= 0) {
        stopLiveHudTopFlagBlinkTimer(true);
        return;
      }

      liveHudTopFlagBlinkNeutralPhase = !liveHudTopFlagBlinkNeutralPhase;
      for (let i = 0; i < blinkingSymbols.length; i++) {
        markLiveHudTopFlagLaneDirty(blinkingSymbols[i]);
      }
    }, 1000);
  }
}

function syncLiveHudTopFlagBlinkTimer(): void {
  const activeSymbols = getLiveHudNeutralizingFlagSymbols();
  if (activeSymbols.length <= 0) {
    stopLiveHudTopFlagBlinkTimer(true);
    return;
  }

  ensureLiveHudTopFlagBlinkTimer();
}

function getDirtyLiveHudTopFlagSymbols(): LiveUiFlagSymbol[] {
  const symbols: LiveUiFlagSymbol[] = [];
  for (let i = 0; i < LIVE_HUD_FLAG_SYMBOLS.length; i++) {
    const symbol = LIVE_HUD_FLAG_SYMBOLS[i];
    if (liveHudTopFlagDirtyBySymbol[symbol] === true) symbols.push(symbol);
  }
  return symbols;
}

function UpdateLiveHudTopFlagLanes(symbols: LiveUiFlagSymbol[] = LIVE_HUD_FLAG_SYMBOLS): void {
  serverPlayers.forEach((p) => {
    if (!p.liveHudRootWidget) return;
    UpdateTopFlagColorsForPlayer(p, symbols);
  });
}

function flushLiveHudTopFlagLanes(): void {
  if (!liveHudTopFlagsDirty) return;

  const dirtySymbols = getDirtyLiveHudTopFlagSymbols();
  if (dirtySymbols.length <= 0) {
    liveHudTopFlagsDirty = false;
    return;
  }

  UpdateLiveHudTopFlagLanes(dirtySymbols);

  for (let i = 0; i < dirtySymbols.length; i++) {
    liveHudTopFlagDirtyBySymbol[dirtySymbols[i]] = false;
  }

  liveHudTopFlagsDirty =
    liveHudTopFlagDirtyBySymbol.A === true ||
    liveHudTopFlagDirtyBySymbol.B === true ||
    liveHudTopFlagDirtyBySymbol.C === true;
}

function SetUITimeForPlayer(p: Player): void {
  const timeWidget = SafeFindWidget("RemainingTime");
  if (!timeWidget) return;

  const remainingTime = mod.Max(0, mod.GetMatchTimeRemaining());
  const minutes = mod.Floor(remainingTime / 60);
  const totalseconds = mod.Floor(remainingTime % 60);
  const seconds = totalseconds % 10;
  const seconds10 = mod.Floor(totalseconds / 10);

  mod.SetUITextLabel(timeWidget, mod.Message("{}:{}{}", minutes, seconds10, seconds));
}

function UpdateLiveHudTimerDiagnostics(): void {
  lastActiveTimerCount = Timers.getActiveTimerCount();
}

function ClampTicketsAndMaybeEndMatch(): void {
  // If something ever becomes NaN or invalid, force it to 0 so the end condition can trigger.
  const t1 = serverScores[0];
  const t2 = serverScores[1];

  const t1Valid = typeof t1 === "number" && Number.isFinite(t1);
  const t2Valid = typeof t2 === "number" && Number.isFinite(t2);

  serverScores[0] = t1Valid ? t1 : 0;
  serverScores[1] = t2Valid ? t2 : 0;

  if (serverScores[0] < 0) serverScores[0] = 0;
  if (serverScores[1] < 0) serverScores[1] = 0;
  syncDisplayedGameModeScores();

  // End immediately when either hits zero.
  if (serverScores[0] <= 0 || serverScores[1] <= 0) {
    gameStatus = 4;
    const live = mod.FindUIWidgetWithName("LiveContainer");
    if (live) mod.SetUIWidgetVisible(live, false);
    setLiveHudVisibleForAllPlayers(false);
  }
}
const TICKET_PULSE_TEXT_MAX_ALPHA = 1.0;
const TICKET_PULSE_TEXT_MIN_ALPHA = 0.55;
function ClearAllTicketBleedPulses(): void {
  stopLiveHudPulseTimer(false);
  serverPlayers.forEach((p) => {
    p.liveHudFriendlyPulseUntilTick = 0;
    p.liveHudEnemyPulseUntilTick = 0;
    applyLiveHudPulseStateToPlayer(p, "friendly");
    applyLiveHudPulseStateToPlayer(p, "enemy");
  });
}


function triggerBleedPulseForLosingTeam(losingTeam: mod.Team): void {
  const pulseUntilTick = serverTickCount + TICKET_PULSE_DURATION_TICKS;
  serverPlayers.forEach((p) => {
    if (!p.liveHudRootWidget) return;

    const playerTeam = mod.GetTeam(p.player);
    if (mod.Equals(playerTeam, losingTeam)) {
      p.liveHudFriendlyPulseUntilTick = pulseUntilTick;
      applyLiveHudPulseStateToPlayer(p, "friendly");
      return;
    }

    if (mod.Equals(playerTeam, team1) || mod.Equals(playerTeam, team2)) {
      p.liveHudEnemyPulseUntilTick = pulseUntilTick;
      applyLiveHudPulseStateToPlayer(p, "enemy");
    }
  });

  ensureLiveHudPulseTimer();
}


function ChangeTickets(): void {
  const now = mod.GetMatchTimeElapsed();
  if (lastTicketBleedTimeElapsed <= 0) lastTicketBleedTimeElapsed = now;

  let dt = now - lastTicketBleedTimeElapsed;
  lastTicketBleedTimeElapsed = now;

  // Guard against weird resets
  if (dt < 0) dt = 0;
  if (dt > 1) dt = 1; // clamp big spikes (optional)

  const t1DisplayedBefore = getDisplayedTeamTickets(team1);
  const t2DisplayedBefore = getDisplayedTeamTickets(team2);

  let teamcps = [0, 0];

  Object.values(serverCapturePoints).forEach((capturePoint) => {
    if (mod.Equals(capturePoint.getOwner(), team1)) teamcps[0] += 1;
    else if (mod.Equals(capturePoint.getOwner(), team2)) teamcps[1] += 1;
  });

  // 1-flag ticket bleed (only when the other team has 0 flags)
  if (teamcps[0] === 1 && teamcps[1] === 0) {
    serverScores[1] += BLEED_ONE_FLAG * dt;
  } else if (teamcps[0] === 2) {
    serverScores[1] += BLEED_TWO_FLAGS * dt;
  } else if (teamcps[0] === 3) {
    serverScores[1] += BLEED_THREE_FLAGS * dt;
  } else if (teamcps[1] === 1 && teamcps[0] === 0) {
    serverScores[0] += BLEED_ONE_FLAG * dt;
  } else if (teamcps[1] === 2) {
    serverScores[0] += BLEED_TWO_FLAGS * dt;
  } else if (teamcps[1] === 3) {
    serverScores[0] += BLEED_THREE_FLAGS * dt;
  }

  ClampTicketsAndMaybeEndMatch();

  const t1DisplayedAfter = getDisplayedTeamTickets(team1);
  const t2DisplayedAfter = getDisplayedTeamTickets(team2);
  const ticketsChanged = t1DisplayedAfter !== t1DisplayedBefore || t2DisplayedAfter !== t2DisplayedBefore;

  if (ticketsChanged) {
    markLiveHudScoresDirty();
    markEndgameSuspenseDirty();
  }

  if (t1DisplayedAfter < t1DisplayedBefore) {
    triggerBleedPulseForLosingTeam(team1);
  }

  if (t2DisplayedAfter < t2DisplayedBefore) {
    triggerBleedPulseForLosingTeam(team2);
  }
}

function HideSharedTicketBarFills(): void {
  const friendlyFill = SafeFindWidget("friendlyprogressbarfill");
  const enemyFill = SafeFindWidget("enemyprogressbarfill");
  if (friendlyFill) mod.SetUIWidgetVisible(friendlyFill, false);
  if (enemyFill) mod.SetUIWidgetVisible(enemyFill, false);
}

function UpdateTopFlagColorsForPlayer(
  p: Player,
  symbols: LiveUiFlagSymbol[] = LIVE_HUD_FLAG_SYMBOLS
): void {
  if (!p.liveHudRootWidget) return;

  const perspectiveTeam = getLiveHudPerspectiveTeamForPlayer(p);
  for (let i = 0; i < symbols.length; i++) {
    const symbol = symbols[i];
    const capturePoint = getCapturePointBySymbol(symbol);
    if (!capturePoint) continue;

    const color = getLiveHudTopFlagLaneColorForTeam(capturePoint, perspectiveTeam);
    const flag = p.flagWidget[symbol];
    const fill = p.flagFillWidget[symbol];
    const outlines = p.flagOutlineWidget[symbol] ?? [];

    if (flag) {
      mod.SetUITextColor(flag, color);
      mod.SetUITextAlpha(flag, 1);
    }

    if (fill) {
      mod.SetUIWidgetBgColor(fill, color);
      mod.SetUIWidgetBgAlpha(fill, 0.5);
      mod.SetUIWidgetBgFill(fill, mod.UIBgFill.Blur);
    }

    for (let j = 0; j < outlines.length; j++) {
      mod.SetUIWidgetBgColor(outlines[j], color);
    }
  }
}


// Ticket bar fills shrink with the viewer's friendly/opponent tickets.
function UpdateTopTicketBarsForPlayer(p: Player): void {
    const friendlyFill = p.friendlyTicketsFillWidget;
    const enemyFill = p.enemyTicketsFillWidget;
    if (!friendlyFill || !enemyFill) return;

    const barW = 210;
    const fillH = 4;
    const fillY = 1;

    const team = mod.GetTeam(p.player);

    let friendlyTickets = mod.Equals(team, team1) ? serverScores[0] : serverScores[1];
    let enemyTickets = mod.Equals(team, team1) ? serverScores[1] : serverScores[0];

    if (friendlyTickets < 0) friendlyTickets = 0;
    if (enemyTickets < 0) enemyTickets = 0;

    let fFriendly = friendlyTickets / TICKETS_BAR_MAX;
    let fEnemy = enemyTickets / TICKETS_BAR_MAX;

    if (fFriendly < 0) fFriendly = 0;
    if (fFriendly > 1) fFriendly = 1;

    if (fEnemy < 0) fEnemy = 0;
    if (fEnemy > 1) fEnemy = 1;

    const wFriendly = mod.Ceiling(barW * fFriendly);
    const wEnemy = mod.Ceiling(barW * fEnemy);

    // Friendly bar: outer edge is the score box side (left), shrink toward center (right).
    mod.SetUIWidgetSize(friendlyFill, mod.CreateVector(wFriendly, fillH, 0));
    mod.SetUIWidgetPosition(friendlyFill, mod.CreateVector(0, fillY, 0));

    // Enemy bar: outer edge is the score box side (right), shrink toward center (left).
    mod.SetUIWidgetSize(enemyFill, mod.CreateVector(wEnemy, fillH, 0));
    mod.SetUIWidgetPosition(enemyFill, mod.CreateVector(barW - wEnemy, fillY, 0));
}


// -------------------------------------------------------------------------------------------------
// UI SAFE HELPERS
// Prevent runtime errors if a widget name does not exist yet (join-in-progress / rebuild races).
// These functions do nothing if the widget is missing.
// -------------------------------------------------------------------------------------------------
function setFlagOutlineColorForPlayer(playerId: number, symbol: "A" | "B" | "C", color: mod.Vector): void {
  const playerState = serverPlayers.get(playerId);
  const outlineWidgets = playerState?.flagOutlineWidget?.[symbol] ?? [];
  for (let i = 0; i < outlineWidgets.length; i++) {
    mod.SetUIWidgetBgColor(outlineWidgets[i], color);
  }

  const t = mod.FindUIWidgetWithName("FLAG" + symbol + "_OL_T" + playerId);
  const b = mod.FindUIWidgetWithName("FLAG" + symbol + "_OL_B" + playerId);
  const l = mod.FindUIWidgetWithName("FLAG" + symbol + "_OL_L" + playerId);
  const r = mod.FindUIWidgetWithName("FLAG" + symbol + "_OL_R" + playerId);

  if (t) mod.SetUIWidgetBgColor(t, color);
  if (b) mod.SetUIWidgetBgColor(b, color);
  if (l) mod.SetUIWidgetBgColor(l, color);
  if (r) mod.SetUIWidgetBgColor(r, color);
}

function setFlagLetterAndOutlineColorForPlayer(playerId: number, symbol: "A" | "B" | "C", color: mod.Vector): void {
  const playerState = serverPlayers.get(playerId);
  const currentFlagWidget = playerState?.flagWidget?.[symbol];
  if (currentFlagWidget) {
    mod.SetUITextColor(currentFlagWidget, color);
    mod.SetUITextAlpha(currentFlagWidget, 1);
  }

  const letter = mod.FindUIWidgetWithName("FLAG" + symbol + playerId);
  if (letter) {
    mod.SetUITextColor(letter, color);
    mod.SetUITextAlpha(letter, 1);
  }

  setFlagOutlineColorForPlayer(playerId, symbol, color);
  setFlagFillColorForPlayer(playerId, symbol, color);
}


function setFlagFillColorForPlayer(playerId: number, symbol: "A" | "B" | "C", color: mod.Vector): void {
  const playerState = serverPlayers.get(playerId);
  const currentFillWidget = playerState?.flagFillWidget?.[symbol];
  if (currentFillWidget) {
    mod.SetUIWidgetBgColor(currentFillWidget, color);
    mod.SetUIWidgetBgAlpha(currentFillWidget, 0.5);
    mod.SetUIWidgetBgFill(currentFillWidget, mod.UIBgFill.Blur);
  }

  const fill = mod.FindUIWidgetWithName("FLAG" + symbol + "_FILL" + playerId);
  if (!fill) return;

  mod.SetUIWidgetBgColor(fill, color);
  mod.SetUIWidgetBgAlpha(fill, 0.5);
  mod.SetUIWidgetBgFill(fill, mod.UIBgFill.Blur);
}

function warnPrematchUiGuardOnce(key: string, message: any): void {
  if (prematchUiGuardWarnedByKey[key] === true) return;
  prematchUiGuardWarnedByKey[key] = true;
  mod.DisplayHighlightedWorldLogMessage(message);
}

function safeFindWidgetByNameNoThrow(widgetName: string, context: string): mod.UIWidget | undefined {
  try {
    const widget = mod.FindUIWidgetWithName(widgetName);
    return widget ? widget : undefined;
  } catch (err) {
    LogRuntimeError("FindUIWidget/" + context, err);
    return undefined;
  }
}

function safeDeleteWidgetByName(widgetName: string): void {
  const widget = safeFindWidgetByNameNoThrow(widgetName, "delete/" + widgetName);
  if (!widget) return;
  try {
    mod.DeleteUIWidget(widget);
  } catch (err) {
    LogRuntimeError("DeleteUIWidget/" + widgetName, err);
  }
}

function SafeFindWidget(name: string): mod.UIWidget | null {
  try {
    const w = mod.FindUIWidgetWithName(name);
    return w ? w : null;
  } catch (_err) {
    return null;
  }
}

function SafeSetTextAlphaByName(name: string, a: number): void {
  const w = SafeFindWidget(name);
  if (!w) return;
  try {
    mod.SetUITextAlpha(w, a);
  } catch (_err) {}
}

function SafeSetTextLabelByName(name: string, label: any): void {
  const w = SafeFindWidget(name);
  if (!w) return;
  try {
    mod.SetUITextLabel(w, label);
  } catch (_err) {}
}

function SafeSetWidgetVisibleHandle(widget: mod.UIWidget | undefined | null, visible: boolean): void {
  if (!widget) return;
  try {
    mod.SetUIWidgetVisible(widget, visible);
  } catch (_err) {}
}

function SafeSetWidgetPositionHandle(widget: mod.UIWidget | undefined | null, pos: mod.Vector): void {
  if (!widget) return;
  try {
    mod.SetUIWidgetPosition(widget, pos);
  } catch (_err) {}
}

function SafeSetWidgetSizeHandle(widget: mod.UIWidget | undefined | null, size: mod.Vector): void {
  if (!widget) return;
  try {
    mod.SetUIWidgetSize(widget, size);
  } catch (_err) {}
}

function SafeSetTextLabelHandle(widget: mod.UIWidget | undefined | null, label: any): void {
  if (!widget) return;
  try {
    mod.SetUITextLabel(widget, label);
  } catch (_err) {}
}

function SafeSetTextColorHandle(widget: mod.UIWidget | undefined | null, color: mod.Vector): void {
  if (!widget) return;
  try {
    mod.SetUITextColor(widget, color);
  } catch (_err) {}
}

function SafeSetWidgetDepthHandle(widget: mod.UIWidget | undefined | null, depth: mod.UIDepth): void {
  if (!widget) return;
  try {
    mod.SetUIWidgetDepth(widget, depth);
  } catch (_err) {}
}

function SafeSetWidgetBgColorHandle(widget: mod.UIWidget | undefined | null, color: mod.Vector): void {
  if (!widget) return;
  try {
    mod.SetUIWidgetBgColor(widget, color);
  } catch (_err) {}
}

function SafeSetWidgetVisibleByName(name: string, visible: boolean): void {
  const w = SafeFindWidget(name);
  if (!w) return;
  try {
    mod.SetUIWidgetVisible(w, visible);
  } catch (_err) {}
}

function SafeEnableWorldIconById(iconId: number, enabledImage: boolean, enabledText: boolean): void {
  try {
    const icon = mod.GetWorldIcon(iconId);
    mod.EnableWorldIconImage(icon, enabledImage);
    mod.EnableWorldIconText(icon, enabledText);
  } catch (_err) {}
}

function SafeEnableInteractPointById(interactId: number, enabled: boolean): void {
  try {
    mod.EnableInteractPoint(mod.GetInteractPoint(interactId), enabled);
  } catch (_err) {}
}

function SafeSetWorldIconTextById(iconId: number, textLabel: any): void {
  try {
    mod.SetWorldIconText(mod.GetWorldIcon(iconId), textLabel);
  } catch (_err) {}
}


function SetUITime(): void {
  const timeWidget = SafeFindWidget("RemainingTime");
  if (!timeWidget) return;

  const remainingTime = mod.Max(0, mod.GetMatchTimeRemaining());
  const minutes = mod.Floor(remainingTime / 60);
  const totalseconds = mod.Floor(remainingTime % 60);
  const seconds = totalseconds % 10;
  const seconds10 = mod.Floor(totalseconds / 10);

  mod.SetUITextLabel(timeWidget, mod.Message("{}:{}{}", minutes, seconds10, seconds));
}



function getFriendlyScore(team: mod.Team): number {
  return mod.Equals(team, team1) ? mod.Ceiling(serverScores[0]) : mod.Ceiling(serverScores[1]);
}

function getOpponentScore(team: mod.Team): number {
  return mod.Equals(team, team1) ? mod.Ceiling(serverScores[1]) : mod.Ceiling(serverScores[0]);
}

function SetUIScores(): void {
  serverPlayers.forEach((p) => p.updateTickets());
}

/* =================================================================================================
   7) PLAYER / CAPTURE POINT WRAPPERS
================================================================================================= */
// Reused, per-sync caches to avoid allocations
let _syncStamp = 0; // increments each sync call (stamp technique)
const _seenThisSync: { [playerId: number]: number } = {}; // playerId -> stamp

const _tmpPlayerToCpId: { [playerId: number]: number } = {}; // temporary mapping
const _tmpPlayerToCpIdKeys: number[] = []; // keys set this sync (so we can clear cheaply)

function _tmpPlayerToCpIdSet(playerId: number, cpId: number): void {
  // Only record the key once so we can clear fast later
  if (_tmpPlayerToCpId[playerId] === undefined) {
    _tmpPlayerToCpIdKeys.push(playerId);
  }
  _tmpPlayerToCpId[playerId] = cpId;
}

function _tmpPlayerToCpIdClear(): void {
  for (let i = 0; i < _tmpPlayerToCpIdKeys.length; i++) {
    const id = _tmpPlayerToCpIdKeys[i];
    delete _tmpPlayerToCpId[id];
  }
  _tmpPlayerToCpIdKeys.length = 0;
}


const serverPlayers = new Map<number, Player>();
const disconnectedPlayers: Player[] = [];

let playerInDamageZone: { [playerId: number]: boolean } = {};

// -------------------------------
// Restricted Area (UI + countdown)
// -------------------------------
let playerInRestrictedArea: { [playerId: number]: boolean } = {};
let restrictedAreaCountdownToken: { [playerId: number]: number } = {};
// Track overlapping restricted triggers so one zone exit cannot cancel another zone's countdown/UI.
let activeRestrictedAreaTriggersByPlayerId: { [playerId: number]: { [triggerId: number]: true } } = {};

let restrictedAreaRootWidgetByPlayerId: { [playerId: number]: mod.UIWidget } = {};
let restrictedAreaCounterWidgetByPlayerId: { [playerId: number]: mod.UIWidget } = {};

function isManagedRestrictedAreaTrigger(triggerId: number): boolean {
  return (
    triggerId === RESTRICTED_AREA_TRIGGER ||
    triggerId === TEAM1_HQ_PROTECTION_TRIGGER_ID ||
    triggerId === TEAM2_HQ_PROTECTION_TRIGGER_ID
  );
}

function shouldApplyRestrictedAreaTriggerToPlayer(eventPlayer: mod.Player, triggerId: number): boolean {
  if (triggerId === RESTRICTED_AREA_TRIGGER) return true;

  const playerTeam = mod.GetTeam(eventPlayer);
  if (triggerId === TEAM1_HQ_PROTECTION_TRIGGER_ID) return mod.Equals(playerTeam, team2);
  if (triggerId === TEAM2_HQ_PROTECTION_TRIGGER_ID) return mod.Equals(playerTeam, team1);

  return false;
}

function getOrCreateRestrictedAreaTriggersForPlayer(playerId: number): { [triggerId: number]: true } {
  const existing = activeRestrictedAreaTriggersByPlayerId[playerId];
  if (existing) return existing;

  const created: { [triggerId: number]: true } = {};
  activeRestrictedAreaTriggersByPlayerId[playerId] = created;
  return created;
}

function addRestrictedAreaTriggerForPlayer(playerId: number, triggerId: number): void {
  const activeTriggers = getOrCreateRestrictedAreaTriggersForPlayer(playerId);
  activeTriggers[triggerId] = true;
}

function hasActiveRestrictedAreaTrigger(playerId: number): boolean {
  const activeTriggers = activeRestrictedAreaTriggersByPlayerId[playerId];
  if (!activeTriggers) return false;

  for (const _triggerId in activeTriggers) {
    return true;
  }

  return false;
}

function removeRestrictedAreaTriggerForPlayer(playerId: number, triggerId: number): boolean {
  const activeTriggers = activeRestrictedAreaTriggersByPlayerId[playerId];
  if (!activeTriggers || activeTriggers[triggerId] !== true) return false;

  delete activeTriggers[triggerId];
  if (!hasActiveRestrictedAreaTrigger(playerId)) {
    delete activeRestrictedAreaTriggersByPlayerId[playerId];
  }

  return true;
}

function clearRestrictedAreaStateForPlayer(playerId: number, eventPlayer?: mod.Player): void {
  restrictedAreaCountdownToken[playerId] = (restrictedAreaCountdownToken[playerId] ?? 0) + 1;
  playerInRestrictedArea[playerId] = false;
  delete activeRestrictedAreaTriggersByPlayerId[playerId];
  hideRestrictedAreaUi(playerId);

  if (eventPlayer) stopRestrictedAreaLoopSfxForPlayer(eventPlayer);
}

function buildRestrictedAreaUiForPlayer(p: Player): void {
  const playerId = p.id;

  // If it already exists (reconnect / re-init), delete and rebuild.
  const existingRoot = restrictedAreaRootWidgetByPlayerId[playerId];
  if (existingRoot) {
    mod.DeleteUIWidget(existingRoot);
    delete restrictedAreaRootWidgetByPlayerId[playerId];
    delete restrictedAreaCounterWidgetByPlayerId[playerId];
  }

  const rootName = `Restricted_Area_UI_${playerId}`;
  const counterName = `Restricted_Area_CounterText_${playerId}`;

  const root = modlib.ParseUI({
    name: rootName,
    type: "Container",
    position: [0, 0],
    size: [1920, 1080],
    anchor: mod.UIAnchor.Center,
    visible: false, // hidden by default
    padding: 0,
    bgColor: [0.2, 0.2, 0.2],
    bgAlpha: 1,
    bgFill: mod.UIBgFill.None,
    playerId: p.player, // IMPORTANT: restrict this UI to this player only
    children: [
      {
        name: `Restricted_Area_Faded_${playerId}`,
        type: "Container",
        position: [0, 0],
        size: [2000, 1500],
        anchor: mod.UIAnchor.Center,
        visible: true,
        padding: 0,
        bgColor: [0.0314, 0.0431, 0.0431],
        bgAlpha: 0.8,
        bgFill: mod.UIBgFill.Blur,
        children: [
          {
            name: `Restricted_Area_RedRect_${playerId}`,
            type: "Container",
            position: [0, 0],
            size: [1337.4, 201.8],
            anchor: mod.UIAnchor.Center,
            visible: true,
            padding: 0,
            bgColor: [0.8902, 0.0078, 0.0078],
            bgAlpha: 0.5,
            bgFill: mod.UIBgFill.Blur,
            children: [
              {
                name: `Restricted_Area_Text_${playerId}`,
                type: "Text",
                position: [0, -59.8],
                size: [746.3, 194.9],
                anchor: mod.UIAnchor.Center,
                visible: true,
                padding: 0,
                bgColor: [0.2, 0.2, 0.2],
                bgAlpha: 1,
                bgFill: mod.UIBgFill.None,
                textLabel: mod.stringkeys.Restricted_Area,
                textColor: [1, 1, 1],
                textAlpha: 1,
                textSize: 69,
                textAnchor: mod.UIAnchor.Center,
              },
              {
                name: `Restricted_Area_LeaveNow_${playerId}`,
                type: "Text",
                position: [0, 0],
                size: [571.5, 50],
                anchor: mod.UIAnchor.Center,
                visible: true,
                padding: 0,
                bgColor: [0.2, 0.2, 0.2],
                bgAlpha: 1,
                bgFill: mod.UIBgFill.None,
                textLabel: mod.stringkeys.Leave_Now,
                textColor: [1, 1, 1],
                textAlpha: 1,
                textSize: 38,
                textAnchor: mod.UIAnchor.Center,
              },
              {
                name: counterName,
                type: "Text",
                position: [0, 50],
                size: [150, 150],
                anchor: mod.UIAnchor.Center,
                visible: true,
                padding: 0,
                bgColor: [0.2, 0.2, 0.2],
                bgAlpha: 1,
                bgFill: mod.UIBgFill.None,
                textLabel: mod.Message(5),
                textColor: [1, 1, 1],
                textAlpha: 1,
                textSize: 63,
                textAnchor: mod.UIAnchor.Center,
              },
            ],
          },
          {
            name: `Restricted_Area_Outline_${playerId}`,
            type: "Container",
            position: [0, 0],
            size: [1337.4, 201.8],
            anchor: mod.UIAnchor.Center,
            visible: true,
            padding: 0,
            bgColor: [1, 1, 1],
            bgAlpha: 0.5,
            bgFill: mod.UIBgFill.OutlineThick,
          },
        ],
      },
    ],
  }) as mod.UIWidget;

  const counterWidget = mod.FindUIWidgetWithName(counterName) as mod.UIWidget;

  restrictedAreaRootWidgetByPlayerId[playerId] = root;
  restrictedAreaCounterWidgetByPlayerId[playerId] = counterWidget;

  // Ensure clean defaults
  playerInRestrictedArea[playerId] = false;
  restrictedAreaCountdownToken[playerId] = 0;
  delete activeRestrictedAreaTriggersByPlayerId[playerId];
  mod.SetUIWidgetVisible(root, false);
}

function showRestrictedAreaUi(playerId: number): void {
  const root = restrictedAreaRootWidgetByPlayerId[playerId];
  if (!root) return;
  mod.SetUIWidgetVisible(root, true);
}

function hideRestrictedAreaUi(playerId: number): void {
  const root = restrictedAreaRootWidgetByPlayerId[playerId];
  if (!root) return;
  mod.SetUIWidgetVisible(root, false);
}

async function startRestrictedAreaCountdown(p: Player): Promise<void> {
  const playerId = p.id;

  // New token cancels any existing countdown loop for this player
  const myToken = (restrictedAreaCountdownToken[playerId] ?? 0) + 1;
  restrictedAreaCountdownToken[playerId] = myToken;

  // Show UI immediately
  showRestrictedAreaUi(playerId);
  startRestrictedAreaLoopSfxForPlayer(p.player);


  let secondsLeft = 3;

  while (secondsLeft > 0) {
    // Cancel if player left area or a newer countdown started
    if (playerInRestrictedArea[playerId] !== true) break;
    if (restrictedAreaCountdownToken[playerId] !== myToken) break;

    const counterWidget = restrictedAreaCounterWidgetByPlayerId[playerId];
    if (counterWidget) mod.SetUITextLabel(counterWidget, mod.Message(secondsLeft));

    await mod.Wait(1);
    secondsLeft--;
  }

  // If still in area after countdown, kill
  if (
    playerInRestrictedArea[playerId] === true &&
    restrictedAreaCountdownToken[playerId] === myToken &&
    p.isDeployed &&
    kernelIsPlayerAlive(p.player)
  ) {
    // Big damage = guaranteed kill
    mod.DealDamage(p.player, 9999);
  }

  // Hide UI if they left (or after kill attempt)
  if (playerInRestrictedArea[playerId] !== true) {
    hideRestrictedAreaUi(playerId);
    stopRestrictedAreaLoopSfxForPlayer(p.player);
  } else {
    // Still in restricted area after countdown (even after kill attempt), keep UI up,
    // but stop the ticking loop so it doesn't run forever.
    stopRestrictedAreaLoopSfxForPlayer(p.player);
  }

}

function cleanupRestrictedAreaUiForPlayer(playerId: number): void {
  clearRestrictedAreaStateForPlayer(playerId);

  const root = restrictedAreaRootWidgetByPlayerId[playerId];
  if (root) mod.DeleteUIWidget(root);

  delete restrictedAreaRootWidgetByPlayerId[playerId];
  delete restrictedAreaCounterWidgetByPlayerId[playerId];
}

/* ----------------------------------------
   Player state (UI + scoreboard + capture)
---------------------------------------- */

class Player {
  public player: mod.Player;
  public id: number;
  public team: mod.Team;

  public isDeployed: boolean;

  public friendlyCapWidget: mod.UIWidget;
  public enemyCapWidget: mod.UIWidget;
  public progressBarWidget: mod.UIWidget;

  public friendlyScoreWidget: mod.UIWidget;
  public opponentScoreWidget: mod.UIWidget;


  public friendlyScorePad1Widget: mod.UIWidget;
  public friendlyScorePad2Widget: mod.UIWidget;
  public opponentScorePad1Widget: mod.UIWidget;
  public opponentScorePad2Widget: mod.UIWidget;


  public flagWidget: { [key: string]: mod.UIWidget };

  public activeFlagContainerWidget: mod.UIWidget;
  public activeFlagFriendlyWidget: mod.UIWidget;
  public activeFlagEnemyWidget: mod.UIWidget;
  public activeFlagWidget: mod.UIWidget;
  public liveHudRootWidget: mod.UIWidget;
  public remainingTimeWidget: mod.UIWidget;
  public friendlyTicketsFillWidget: mod.UIWidget;
  public enemyTicketsFillWidget: mod.UIWidget;
  public friendlyScorePulseWidget: mod.UIWidget;
  public enemyScorePulseWidget: mod.UIWidget;
  public friendlyProgressPulseWidget: mod.UIWidget;
  public enemyProgressPulseWidget: mod.UIWidget;
  public flagContainerWidget: { [key: string]: mod.UIWidget };
  public flagFillWidget: { [key: string]: mod.UIWidget };
  public flagOutlineWidget: { [key: string]: mod.UIWidget[] };
  public liveHudSlotTeamKey: LiveUiTeamKey | null;
  public liveHudSlotIndex: number;
  public liveHudSlotKey: string;
  public liveHudFriendlyPulseUntilTick: number;
  public liveHudEnemyPulseUntilTick: number;

  private _scoreboard: number[]; // [score, kills, deaths, assists, captures]
  private _capturePointId: number | null;
  private _firstDeploy: boolean;
  private _ready: boolean;

    constructor(player: mod.Player) {
    this.player = player;
    this.id = modlib.getPlayerId(this.player);
    this.team = mod.GetTeam(this.player);

    this._scoreboard = [0, 0, 0, 0, 0];
    this._capturePointId = null;
    this._firstDeploy = true;
    this._ready = false;

    this.isDeployed = false;

    // Live HUD widget refs start empty. They will be built when live starts or when joining during live.
    this.friendlyCapWidget = null as any;
    this.enemyCapWidget = null as any;
    this.progressBarWidget = null as any;

    this.friendlyScoreWidget = null as any;
    this.opponentScoreWidget = null as any;

    this.friendlyScorePad1Widget = null as any;
    this.friendlyScorePad2Widget = null as any;
    this.opponentScorePad1Widget = null as any;
    this.opponentScorePad2Widget = null as any;

    this.flagWidget = {} as any;

    this.activeFlagContainerWidget = null as any;
    this.activeFlagFriendlyWidget = null as any;
    this.activeFlagEnemyWidget = null as any;
    this.activeFlagWidget = null as any;
    this.liveHudRootWidget = null as any;
    this.remainingTimeWidget = null as any;
    this.friendlyTicketsFillWidget = null as any;
    this.enemyTicketsFillWidget = null as any;
    this.friendlyScorePulseWidget = null as any;
    this.enemyScorePulseWidget = null as any;
    this.friendlyProgressPulseWidget = null as any;
    this.enemyProgressPulseWidget = null as any;
    this.flagContainerWidget = {} as any;
    this.flagFillWidget = {} as any;
    this.flagOutlineWidget = {} as any;
    this.liveHudSlotTeamKey = null;
    this.liveHudSlotIndex = -1;
    this.liveHudSlotKey = "";
    this.liveHudFriendlyPulseUntilTick = 0;
    this.liveHudEnemyPulseUntilTick = 0;

    // Do not build any Live HUD widgets here.
    // Building them here is what causes some players to keep the placeholder tickets and then get a second set in live.

    mod.SetRedeployTime(this.player, 0);
  }


  resetActiveCaptureProgressUi(): void {
    if (this.progressBarWidget) {
      mod.SetUIWidgetSize(this.progressBarWidget, mod.CreateVector(0, 60, 0));
      mod.SetUIWidgetPosition(this.progressBarWidget, mod.CreateVector(60, 0, 0));
      mod.SetUIWidgetBgColor(this.progressBarWidget, COLOR_NEUTRAL);
    }

    if (this.activeFlagWidget) {
      mod.SetUITextLabel(this.activeFlagWidget, mod.Message(0));
      mod.SetUITextColor(this.activeFlagWidget, COLOR_NEUTRAL);
      mod.SetUIWidgetBgColor(this.activeFlagWidget, mod.CreateVector(0, 0, 0));
      mod.SetUIWidgetBgAlpha(this.activeFlagWidget, 0.4);
      mod.SetUIWidgetBgFill(this.activeFlagWidget, mod.UIBgFill.Blur);
    }

    if (this.friendlyCapWidget) mod.SetUITextLabel(this.friendlyCapWidget, mod.Message(0));
    if (this.enemyCapWidget) mod.SetUITextLabel(this.enemyCapWidget, mod.Message(0));
  }

  setCapturePoint(capturePointId: number | null): void {
    if (this._capturePointId !== capturePointId) {
      this.resetActiveCaptureProgressUi();
    }
    this._capturePointId = capturePointId;
  }

  getCapturePoint(): number | null {
    return this._capturePointId;
  }

  isFirstDeploy(): boolean {
    if (this._firstDeploy) {
      this._firstDeploy = false;
      return true;
    }
    return false;
  }

  updateScoreboard(): void {
    if (!isParticipantPlayer(this.player)) return;

    mod.SetScoreboardPlayerValues(
      this.player,
      this._scoreboard[0],
      this._scoreboard[1],
      this._scoreboard[2],
      this._scoreboard[3],
      this._scoreboard[4]
    );
  }

  addScore(score: number): void {
    this._scoreboard[0] += score;
    markScoreboardDirty();
  }

  addKill(): void {
    this._scoreboard[1] += 1;
    markScoreboardDirty();
  }

  addDeath(): void {
    this._scoreboard[2] += 1;
    markScoreboardDirty();
  }

  addKillAssist(): void {
    this._scoreboard[3] += 1;
    markScoreboardDirty();
  }

  addCapture(): void {
    this._scoreboard[4] += 1;
    markScoreboardDirty();
  }

  isReady(): boolean {
    return this._ready;
  }

  changeReady(): void {
    this._ready = !this._ready;

    const w = resolvePrematchReadyTextWidgetForPlayer(this.id);
    if (!w) return;

    if (this._ready) {
      SafeSetTextColorHandle(w, mod.CreateVector(0, 1, 0));
      SafeSetTextLabelHandle(w, mod.Message(mod.stringkeys.Ready));
    } else {
      SafeSetTextColorHandle(w, mod.CreateVector(1, 0, 0));
      SafeSetTextLabelHandle(w, mod.Message(mod.stringkeys.NotReady));
    }
  }
  resetReadyForNewRound(): void {
    this._ready = false;

    const w = resolvePrematchReadyTextWidgetForPlayer(this.id);
    if (!w) return;

    SafeSetTextColorHandle(w, mod.CreateVector(1, 0, 0));
    SafeSetTextLabelHandle(w, mod.Message(mod.stringkeys.NotReady));
  }

  setTeam(): void {
    this.team = mod.GetTeam(this.player);
  }

  clearLiveHudRefs(): void {
    this.liveHudRootWidget = null as any;
    this.remainingTimeWidget = null as any;

    this.friendlyCapWidget = null as any;
    this.enemyCapWidget = null as any;
    this.progressBarWidget = null as any;

    this.friendlyScoreWidget = null as any;
    this.opponentScoreWidget = null as any;
    this.friendlyScorePad1Widget = null as any;
    this.friendlyScorePad2Widget = null as any;
    this.opponentScorePad1Widget = null as any;
    this.opponentScorePad2Widget = null as any;

    this.friendlyTicketsFillWidget = null as any;
    this.enemyTicketsFillWidget = null as any;
    this.friendlyScorePulseWidget = null as any;
    this.enemyScorePulseWidget = null as any;
    this.friendlyProgressPulseWidget = null as any;
    this.enemyProgressPulseWidget = null as any;

    this.flagContainerWidget = {} as any;
    this.flagWidget = {} as any;
    this.flagFillWidget = {} as any;
    this.flagOutlineWidget = {} as any;

    this.activeFlagContainerWidget = null as any;
    this.activeFlagFriendlyWidget = null as any;
    this.activeFlagEnemyWidget = null as any;
    this.activeFlagWidget = null as any;

    this.liveHudSlotTeamKey = null;
    this.liveHudSlotIndex = -1;
    this.liveHudSlotKey = "";
    this.liveHudFriendlyPulseUntilTick = 0;
    this.liveHudEnemyPulseUntilTick = 0;
  }

  addUI(): void {
    if (gameStatus !== 3) return;

    const excludedPlayer = isExcludedPlayer(this.player);
    const participant = isParticipantPlayer(this.player);

    if (!participant && !excludedPlayer) {
      dequeueLiveHudPrebuildForPlayer(this.id);
      releaseLiveHudSlotForPlayer(this.id);
      return;
    }

    dequeueLiveHudPrebuildForPlayer(this.id);
    if (!ensureLiveHudSlotForPlayer(this)) return;

    setLiveHudVisibleForPlayer(this, true);

    this.updateTickets();

    if (!participant) {
      return;
    }

    this.updateUIPlayersOnPoint();
    this.updateUIProgress();
    SetUITimeForPlayer(this);

    if (this.activeFlagContainerWidget) {
      mod.SetUIWidgetVisible(this.activeFlagContainerWidget, this._capturePointId !== null);
    }
  }

  getScoreboardSnapshot(): number[] {
    // [score, kills, deaths, assists, captures]
    return [
      this._scoreboard[0],
      this._scoreboard[1],
      this._scoreboard[2],
      this._scoreboard[3],
      this._scoreboard[4],
    ];
  }

  resetForNewRound(): void {
    this._scoreboard = [0, 0, 0, 0, 0];
    this._capturePointId = null;
    this._firstDeploy = true;
    this._ready = false;
    this.isDeployed = false;
    this.clearLiveHudRefs();

    // Reset prematch ready text if it exists.
    const w = resolvePrematchReadyTextWidgetForPlayer(this.id);
    if (w) {
      SafeSetTextColorHandle(w, mod.CreateVector(1, 0, 0));
      SafeSetTextLabelHandle(w, mod.Message(mod.stringkeys.NotReady));
    }

    markScoreboardDirty();
  }



  updateTickets(): void {
    const excludedPlayer = isExcludedPlayer(this.player);
    const participant = isParticipantPlayer(this.player);

    if (!participant && !excludedPlayer) return;
    if (gameStatus !== 3) return;

    if (excludedPlayer) {
      if (!ensureReservedLiveHudSlotForPlayer(this)) return;
      setLiveHudVisibleForPlayer(this, true);
    } else {
      const currentTeamKey = getLiveUiTeamKey(mod.GetTeam(this.player));
      if (!currentTeamKey) {
        dequeueLiveHudPrebuildForPlayer(this.id);
        releaseLiveHudSlotForPlayer(this.id);
        return;
      }

      if (!this.liveHudRootWidget || this.liveHudSlotTeamKey !== currentTeamKey) {
        if (!ensureLiveHudSlotForPlayer(this)) return;
        setLiveHudVisibleForPlayer(this, true);
      }
    }

    const scorePerspectiveTeam = excludedPlayer ? team1 : mod.GetTeam(this.player);

    const friendly = getFriendlyScore(scorePerspectiveTeam);
    const enemy = getOpponentScore(scorePerspectiveTeam);

    mod.SetUITextLabel(this.friendlyScoreWidget, mod.Message(friendly));
    mod.SetUITextLabel(this.opponentScoreWidget, mod.Message(enemy));

    mod.SetUIWidgetVisible(this.friendlyScorePad1Widget, friendly < 100);
    mod.SetUIWidgetVisible(this.friendlyScorePad2Widget, friendly < 10);

    mod.SetUIWidgetVisible(this.opponentScorePad1Widget, enemy < 100);
    mod.SetUIWidgetVisible(this.opponentScorePad2Widget, enemy < 10);

    UpdateTopTicketBarsForPlayer(this);

    // Keep top flag colors correct when team perspective changes.
    UpdateTopFlagColorsForPlayer(this);
  }

  updateUIPlayersOnPoint(): void {
    if (!isParticipantPlayer(this.player)) return;

    const pointId = this.getCapturePoint();
    if (pointId === null) return;

    const cp = serverCapturePoints[pointId];
    if (!cp) return;

    this.updateActiveCaptureUi(cp);
  }

  updateUIProgress(): void {
    if (!isParticipantPlayer(this.player)) return;

    const pointId = this.getCapturePoint();
    if (pointId === null) return;

    const cp = serverCapturePoints[pointId];
    if (!cp) return;

    this.updateActiveCaptureUi(cp);
  }

  updateActiveCaptureUi(cp: CapturePoint): void {
    const team = mod.GetTeam(this.player);
    const onPoint = cp.getOnPoint();
    const friendlyCount = modlib.Equals(team, team1) ? onPoint[0] : onPoint[1];
    const enemyCount = modlib.Equals(team, team1) ? onPoint[1] : onPoint[0];

    if (this.friendlyCapWidget) mod.SetUITextLabel(this.friendlyCapWidget, mod.Message(friendlyCount));
    if (this.enemyCapWidget) mod.SetUITextLabel(this.enemyCapWidget, mod.Message(enemyCount));

    if (this.activeFlagWidget) {
      const accentColor = getLiveHudTopFlagLaneColorForTeam(cp, team);
      mod.SetUITextLabel(this.activeFlagWidget, mod.Message(cp.symbol));
      mod.SetUITextColor(this.activeFlagWidget, mod.CreateVector(1, 1, 1));
      mod.SetUIWidgetBgColor(this.activeFlagWidget, accentColor);
      mod.SetUIWidgetBgAlpha(this.activeFlagWidget, 0.45);
      mod.SetUIWidgetBgFill(this.activeFlagWidget, mod.UIBgFill.Blur);
    }

    let prog = cp.getDisplayCaptureProgress();

    if (mod.Equals(cp.getOwner(), team) && prog >= PROGRESS_FULL) {
      prog = 1;
    }

    let clampedProgress = prog;
    if (clampedProgress < 0) clampedProgress = 0;
    if (clampedProgress > 1) clampedProgress = 1;

    const fillWidth = 60 * clampedProgress;
    const size = mod.CreateVector(fillWidth, 60, 0);

    if (this.progressBarWidget) {
      mod.SetUIWidgetSize(this.progressBarWidget, size);
      mod.SetUIWidgetPosition(this.progressBarWidget, mod.CreateVector(60, 0, 0));
      mod.SetUIWidgetBgColor(this.progressBarWidget, getCapturePointProgressFillColorForTeam(cp, team));
    }

    if (this.activeFlagContainerWidget) {
      mod.SetUIWidgetVisible(this.activeFlagContainerWidget, true);
    }
  }
}

/* ----------------------------------------
   Capture point wrapper
---------------------------------------- */

class CapturePoint {
  public symbol: string;
  public id: number;

  private _owner: mod.Team;
  private _onPoint: number[];
  private _captureProgress: number;
  private _previousCaptureProgress: number;
  private _captureProgressDirection: -1 | 0 | 1;
  private _lastCaptureProgressSampleTick: number;
  private _displayProgressRatePerTick: number;
  private _displayProgressMotionMode: CaptureProgressMotionMode;
  private _capturingTeam: mod.Team;
  private _progressTeam: mod.Team;
  private _position: mod.Vector | null;
  private _lastSampledPhase: CapturePointPhase;
  private _lastAnnouncedPhase: CapturePointPhase | null;
  private _lastAnnouncedOwner: mod.Team;
  private _lastAnnouncedProgressTeam: mod.Team;

  constructor(id: number, symbol: string) {
    this.id = id;
    this.symbol = symbol;

    this._owner = teamNeutral;
    this._onPoint = [];
    this._captureProgress = 0;
    this._previousCaptureProgress = 0;
    this._captureProgressDirection = 0;
    this._lastCaptureProgressSampleTick = serverTickCount;
    this._displayProgressRatePerTick = 0;
    this._displayProgressMotionMode = 0;
    this._capturingTeam = teamNeutral;
    this._progressTeam = teamNeutral;
    this._position = null;
    this._lastSampledPhase = "neutral_idle";
    this._lastAnnouncedPhase = null;
    this._lastAnnouncedOwner = teamNeutral;
    this._lastAnnouncedProgressTeam = teamNeutral;
  }

  resolveHandle(eventCapturePoint?: mod.CapturePoint | null): mod.CapturePoint {
    if (eventCapturePoint && mod.GetObjId(eventCapturePoint) === this.id) {
      return eventCapturePoint;
    }
    return mod.GetCapturePoint(this.id);
  }

  applyCaptureSettings(eventCapturePoint?: mod.CapturePoint | null): void {
    const handle = this.resolveHandle(eventCapturePoint);
    mod.SetCapturePointCapturingTime(handle, CAPTURE_TIME);
    mod.SetCapturePointNeutralizationTime(handle, NEUTRALIZE_TIME);
    mod.SetMaxCaptureMultiplier(handle, CAPTURE_MULTIPLIER_MAX);
  }

  setObjectiveEnabled(enabled: boolean, eventCapturePoint?: mod.CapturePoint | null): void {
    mod.EnableGameModeObjective(this.resolveHandle(eventCapturePoint), enabled);
  }

  getPlayerIdsOnPoint(): number[] {
    return this._onPoint;
  }
  clearOnPoint(): void {
    this._onPoint.length = 0; // reuses same array backing store
  }

  addOnPoint(playerId: number): void {
    this._onPoint.push(playerId);
  }

  removeOnPoint(playerId: number): void {
    const index = this._onPoint.indexOf(playerId);
    if (index >= 0) this._onPoint.splice(index, 1);
  }

  getOnPoint(): number[] {
    let onPoint = [0, 0];
    for (let i = 0; i < this._onPoint.length; i++) {
      const p = serverPlayers.get(this._onPoint[i]);
      if (!p) continue;

      const team = mod.GetTeam(p.player);
      if (mod.Equals(team, team1)) onPoint[0] += 1;
      else onPoint[1] += 1;
    }
    return onPoint;
  }

  refreshPosition(eventCapturePoint?: mod.CapturePoint | null): void {
    try {
      this._position = mod.GetObjectPosition(this.resolveHandle(eventCapturePoint));
    } catch (_err) {
      this._position = null;
    }
  }

  clearPosition(): void {
    this._position = null;
  }

  getPosition(): mod.Vector | null {
    return this._position;
  }

  setOwner(owner: mod.Team): void {
    this._owner = owner;
  }

  getOwner(): mod.Team {
    return this._owner;
  }

  setCaptureProgress(eventCapturePoint?: mod.CapturePoint | null): void {
    const handle = this.resolveHandle(eventCapturePoint);
    const previousSampleTick = this._lastCaptureProgressSampleTick;
    this._lastCaptureProgressSampleTick = serverTickCount;
    this._previousCaptureProgress = this._captureProgress;
    this._captureProgress = mod.GetCaptureProgress(handle);
    this._progressTeam = mod.GetOwnerProgressTeam(handle);
    const progressDelta = this._captureProgress - this._previousCaptureProgress;
    this._captureProgressDirection =
      progressDelta > CAPTURE_PROGRESS_DELTA_EPSILON ? 1 :
      progressDelta < -CAPTURE_PROGRESS_DELTA_EPSILON ? -1 :
      0;

    const onPoint = this.getOnPoint();
    const contestedNow = onPoint[0] > 0 && onPoint[1] > 0;
    const progressTeam = this._progressTeam;
    const inProgressBand = this._captureProgress > PROGRESS_EMPTY && this._captureProgress < PROGRESS_FULL;
    const sampleTickDelta = previousSampleTick < serverTickCount ? serverTickCount - previousSampleTick : 1;
    const observedRatePerTick = sampleTickDelta > 0 ? progressDelta / sampleTickDelta : 0;

    const progressIncreased = this._captureProgressDirection > 0;
    const progressDecreased = this._captureProgressDirection < 0;

    if (
      !contestedNow &&
      inProgressBand &&
      !mod.Equals(progressTeam, teamNeutral) &&
      Math.abs(observedRatePerTick) > CAPTURE_PROGRESS_DELTA_EPSILON
    ) {
      this._displayProgressMotionMode = observedRatePerTick > 0 ? 1 : -1;
      this._displayProgressRatePerTick = observedRatePerTick;
    } else {
      this._displayProgressMotionMode = 0;
      this._displayProgressRatePerTick = 0;
    }

    this._capturingTeam = inProgressBand ? progressTeam : teamNeutral;

    const activeBuildupTeam = captureBuildupTeamByCpId[this.id];
    if (
      activeBuildupTeam &&
      (contestedNow ||
        mod.Equals(progressTeam, teamNeutral) ||
        !mod.Equals(activeBuildupTeam, progressTeam) ||
        progressDecreased ||
        !inProgressBand)
    ) {
      invalidateCaptureBuildupSessionForCp(this.id);
    }

    // Buildup sound when capture is close to completion. Trigger by live observed capture velocity.
    if (gameStatus === 3 && progressIncreased && inProgressBand && !mod.Equals(progressTeam, teamNeutral) && !contestedNow) {
      const prev = this._previousCaptureProgress;
      const cur = this._captureProgress;
      const sampleSeconds = sampleTickDelta / TICK_RATE;
      const progressPerSecond = sampleSeconds > 0 ? progressDelta / sampleSeconds : 0;

      if (progressPerSecond > CAPTURE_PROGRESS_DELTA_EPSILON) {
        const prevRemainingSeconds = mod.Max(0, (1 - prev) / progressPerSecond);
        const curRemainingSeconds = mod.Max(0, (1 - cur) / progressPerSecond);
        const crossedLeadWindow =
          prevRemainingSeconds > CAPTURE_BUILDUP_LEAD_SECONDS &&
          curRemainingSeconds <= CAPTURE_BUILDUP_LEAD_SECONDS;

        if (crossedLeadWindow) {
          void playCaptureBuildupToCapturingTeamOnPoint(this, progressTeam);
        }
      }
    }

    if ((progressIncreased || progressDecreased) && !mod.Equals(progressTeam, teamNeutral)) {
      this.setUIProgressForPlayersOnPoint();
    }
  }

  getCaptureProgress(): number {
    return this._captureProgress;
  }

  getCapturingTeam(): mod.Team {
    return this._capturingTeam;
  }

  getCaptureProgressDirection(): -1 | 0 | 1 {
    return this._captureProgressDirection;
  }

  getDisplayCaptureProgress(currentTick: number = serverTickCount): number {
    const elapsedTicks = mod.Max(0, currentTick - this._lastCaptureProgressSampleTick);
    let displayProgress = this._captureProgress + elapsedTicks * this._displayProgressRatePerTick;

    if (this._displayProgressMotionMode > 0 && displayProgress < this._captureProgress) {
      displayProgress = this._captureProgress;
    } else if (this._displayProgressMotionMode < 0 && displayProgress > this._captureProgress) {
      displayProgress = this._captureProgress;
    }

    if (displayProgress < 0) return 0;
    if (displayProgress > 1) return 1;
    return displayProgress;
  }

  getProgressTeam(): mod.Team {
    return this._progressTeam;
  }

  getLastSampledPhase(): CapturePointPhase {
    return this._lastSampledPhase;
  }

  setLastSampledPhase(phase: CapturePointPhase): void {
    this._lastSampledPhase = phase;
  }

  getLastAnnouncedPhase(): CapturePointPhase | null {
    return this._lastAnnouncedPhase;
  }

  getLastAnnouncedOwner(): mod.Team {
    return this._lastAnnouncedOwner;
  }

  getLastAnnouncedProgressTeam(): mod.Team {
    return this._lastAnnouncedProgressTeam;
  }

  setAnnouncementState(phase: CapturePointPhase, owner: mod.Team, progressTeam: mod.Team): void {
    this._lastAnnouncedPhase = phase;
    this._lastAnnouncedOwner = owner;
    this._lastAnnouncedProgressTeam = progressTeam;
  }

  clearAnnouncementState(): void {
    this._lastAnnouncedPhase = null;
    this._lastAnnouncedOwner = teamNeutral;
    this._lastAnnouncedProgressTeam = teamNeutral;
  }

  getColor(team: mod.Team): mod.Vector {
    if (mod.Equals(team, this._owner)) return COLOR_FRIENDLY;
    if (mod.Equals(this._owner, teamNeutral)) return COLOR_NEUTRAL;
    return COLOR_ENEMY;
  }

  getColorRgb(team: mod.Team): RgbColor {
    if (mod.Equals(team, this._owner)) return COLOR_FRIENDLY_RGB;
    if (mod.Equals(this._owner, teamNeutral)) return COLOR_NEUTRAL_RGB;
    return COLOR_ENEMY_RGB;
  }

  updateUIforPlayersOnPoint(): void {
    this._onPoint.forEach((id) => {
      const p = serverPlayers.get(id);
      if (p) p.updateUIPlayersOnPoint();
    });
  }

  setUIProgressForPlayersOnPoint(): void {
    this._onPoint.forEach((id) => {
      const p = serverPlayers.get(id);
      if (p) p.updateUIProgress();
    });
  }
}

/* Capture points registry */
let serverCapturePoints: { [key: number]: CapturePoint } = {
  [CP_A_ID]: new CapturePoint(CP_A_ID, "A"),
  [CP_B_ID]: new CapturePoint(CP_B_ID, "B"),
  [CP_C_ID]: new CapturePoint(CP_C_ID, "C"),
};

// HQ routing is ownership-driven during live play and only recomputed when capture events mark it dirty.
let hqRoutingDirty: boolean = true;
let lastHqRoutingUpdateTick: number = -999999;
let liveRoutingCapturePointPositionsInitialized: boolean = false;
let liveRoutingCapturePointPositionsWarned: boolean = false;
let liveRoutingCapturePointIdValidationLogged: boolean = false;
let liveCapturePointThreatRadiusMeters: number = CAPTURE_POINT_THREAT_RADIUS_REFERENCE_RADIUS_METERS;


// Track whether each team has captured at least one flag this round.
// Used to keep initial HQ spawns until a team captures a flag for the first time.
let team1HasCapturedAnyFlag: boolean = false;
let team2HasCapturedAnyFlag: boolean = false;

function updateLiveActiveCaptureBarsSmoothly(): void {
  Object.values(serverCapturePoints).forEach((cp) => {
    if (cp.getPlayerIdsOnPoint().length <= 0) return;
    cp.setUIProgressForPlayersOnPoint();
  });
}

function arePlayerIdListsEqual(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (!b.includes(a[i])) return false;
  }
  return true;
}

function shouldKeepCapturePointAnnouncement(phase: CapturePointPhase): boolean {
  return phase === "capturing_neutral" || phase === "neutralizing_enemy";
}

type CapturePointStateSnapshot = {
  owner: mod.Team;
  progress: number;
  capturingTeam: mod.Team;
  progressTeam: mod.Team;
  contested: boolean;
  phase: CapturePointPhase;
  playerIds: number[];
};

function createCapturePointStateSnapshot(cp: CapturePoint): CapturePointStateSnapshot {
  return {
    owner: cp.getOwner(),
    progress: cp.getCaptureProgress(),
    capturingTeam: cp.getCapturingTeam(),
    progressTeam: cp.getProgressTeam(),
    contested: capturePointContested[cp.id] === true,
    phase: cp.getLastSampledPhase(),
    playerIds: cp.getPlayerIdsOnPoint().slice(),
  };
}

function didCapturePointPresenceChange(
  previousSnapshot: CapturePointStateSnapshot,
  nextSnapshot: CapturePointStateSnapshot
): boolean {
  return !arePlayerIdListsEqual(previousSnapshot.playerIds, nextSnapshot.playerIds);
}

function didCapturePointStateChange(
  previousSnapshot: CapturePointStateSnapshot,
  nextSnapshot: CapturePointStateSnapshot
): boolean {
  return (
    !mod.Equals(previousSnapshot.owner, nextSnapshot.owner) ||
    Math.abs(previousSnapshot.progress - nextSnapshot.progress) > CAPTURE_PROGRESS_DELTA_EPSILON ||
    !mod.Equals(previousSnapshot.capturingTeam, nextSnapshot.capturingTeam) ||
    !mod.Equals(previousSnapshot.progressTeam, nextSnapshot.progressTeam) ||
    previousSnapshot.contested !== nextSnapshot.contested ||
    previousSnapshot.phase !== nextSnapshot.phase
  );
}

function getCapturePointPlayerIdsFromEngine(
  cp: CapturePoint,
  eventCapturePoint?: mod.CapturePoint | null
): number[] {
  const playerIds: number[] = [];
  const playersOnPoint = mod.GetPlayersOnPoint(cp.resolveHandle(eventCapturePoint));

  for (let i = 0; i < mod.CountOf(playersOnPoint); i++) {
    const player = mod.ValueInArray(playersOnPoint, i) as mod.Player;
    if (!mod.IsPlayerValid(player)) continue;
    if (!kernelIsPlayerAlive(player)) continue;

    const playerId = modlib.getPlayerId(player);
    const playerState = serverPlayers.get(playerId);
    if (!playerState) continue;
    if (!playerState.isDeployed) continue;
    if (playerIds.includes(playerId)) continue;

    playerIds.push(playerId);
  }

  return playerIds;
}

function syncCapturePointPlayersOnPointFromEngine(
  cp: CapturePoint,
  eventCapturePoint?: mod.CapturePoint | null
): boolean {
  const previousPlayerIds = cp.getPlayerIdsOnPoint().slice();
  const nextPlayerIds = getCapturePointPlayerIdsFromEngine(cp, eventCapturePoint);

  cp.clearOnPoint();
  for (let i = 0; i < nextPlayerIds.length; i++) {
    cp.addOnPoint(nextPlayerIds[i]);
  }

  let removedAnyPlayer = false;
  for (let i = 0; i < previousPlayerIds.length; i++) {
    const previousPlayerId = previousPlayerIds[i];
    if (nextPlayerIds.includes(previousPlayerId)) continue;

    const playerState = serverPlayers.get(previousPlayerId);
    if (!playerState) continue;
    if (playerState.getCapturePoint() !== cp.id) continue;

    removedAnyPlayer = true;
    stopCaptureBuildupForPlayer(previousPlayerId);
    playerState.setCapturePoint(null);
    playerState.resetActiveCaptureProgressUi();
    if (playerState.activeFlagContainerWidget) mod.SetUIWidgetVisible(playerState.activeFlagContainerWidget, false);
    stopCaptureTickLoop(previousPlayerId);
  }

  if (removedAnyPlayer) {
    invalidateCaptureBuildupSessionForCp(cp.id);
  }

  for (let i = 0; i < nextPlayerIds.length; i++) {
    const nextPlayerId = nextPlayerIds[i];
    const playerState = serverPlayers.get(nextPlayerId);
    if (!playerState) continue;

    const oldPointId = playerState.getCapturePoint();
    if (oldPointId === null || oldPointId !== cp.id) {
      if (oldPointId !== null) invalidateCaptureBuildupSessionForCp(oldPointId);
      stopCaptureBuildupForPlayer(nextPlayerId);
      playerState.setCapturePoint(cp.id);
    }
  }

  return !arePlayerIdListsEqual(previousPlayerIds, nextPlayerIds);
}

function refreshCapturePointFromEngine(
  cp: CapturePoint,
  syncPlayersOnPoint: boolean = false,
  eventCapturePoint?: mod.CapturePoint | null
): void {
  const handle = cp.resolveHandle(eventCapturePoint);

  if (syncPlayersOnPoint) {
    syncCapturePointPlayersOnPointFromEngine(cp, handle);
  }

  cp.setOwner(mod.GetCurrentOwnerTeam(handle));
  cp.setCaptureProgress(handle);
  UpdateCapturePointContestedState(cp);
  const nextPhase = getCapturePointPhase(cp);
  cp.setLastSampledPhase(nextPhase);
  if (!shouldKeepCapturePointAnnouncement(nextPhase)) {
    cp.clearAnnouncementState();
  }

  if (syncPlayersOnPoint) {
    const playerIdsOnPoint = cp.getPlayerIdsOnPoint();
    for (let i = 0; i < playerIdsOnPoint.length; i++) {
      const playerState = serverPlayers.get(playerIdsOnPoint[i]);
      if (!playerState) continue;
      playerState.updateUIPlayersOnPoint();
      playerState.updateUIProgress();
    }
  }
}

function validateLiveRoutingCapturePointIds(): boolean {
  const idsValid = CP_A_ID === EXPECTED_ROUTING_CP_A_ID && CP_C_ID === EXPECTED_ROUTING_CP_C_ID;
  if (!liveRoutingCapturePointIdValidationLogged) {
    liveRoutingCapturePointIdValidationLogged = true;
    console.log("[HQ ROUTING] capture-point ids for live routing: A=" + String(CP_A_ID) + ", C=" + String(CP_C_ID));
    if (!idsValid) {
      LogRuntimeError(
        "RoutingCapturePointIds",
        "Expected routing capture-point ids A=" +
          String(EXPECTED_ROUTING_CP_A_ID) +
          " and C=" +
          String(EXPECTED_ROUTING_CP_C_ID) +
          " but found A=" +
          String(CP_A_ID) +
          " and C=" +
          String(CP_C_ID)
      );
    }
  }

  return idsValid;
}

function getCapturePointHorizontalDistanceMeters(a: mod.Vector, c: mod.Vector): number {
  const dx = mod.XComponentOf(a) - mod.XComponentOf(c);
  const dz = mod.ZComponentOf(a) - mod.ZComponentOf(c);
  return Math.sqrt(dx * dx + dz * dz);
}

function clampLiveCapturePointThreatRadiusMeters(radiusMeters: number): number {
  let minMeters: number = CAPTURE_POINT_THREAT_RADIUS_MIN_METERS;
  let maxMeters: number = CAPTURE_POINT_THREAT_RADIUS_MAX_METERS;
  if (minMeters > maxMeters) {
    const swap: number = minMeters;
    minMeters = maxMeters;
    maxMeters = swap;
  }

  let clamped = radiusMeters;
  if (!Number.isFinite(clamped)) clamped = CAPTURE_POINT_THREAT_RADIUS_REFERENCE_RADIUS_METERS;
  if (clamped < minMeters) clamped = minMeters;
  if (clamped > maxMeters) clamped = maxMeters;
  return clamped;
}

function resetLiveCapturePointThreatRadiusMeters(): void {
  liveCapturePointThreatRadiusMeters = CAPTURE_POINT_THREAT_RADIUS_REFERENCE_RADIUS_METERS;
}

function refreshLiveCapturePointThreatRadiusFromAcDistance(): void {
  resetLiveCapturePointThreatRadiusMeters();

  const cpA = serverCapturePoints[CP_A_ID];
  const cpC = serverCapturePoints[CP_C_ID];
  const aPosition = cpA?.getPosition() ?? null;
  const cPosition = cpC?.getPosition() ?? null;

  if (aPosition === null || cPosition === null) {
    console.log(
      "[HQ ROUTING] using reference threat radius " +
        CAPTURE_POINT_THREAT_RADIUS_REFERENCE_RADIUS_METERS.toFixed(2) +
        "m because A/C positions are unavailable"
    );
    return;
  }

  const referenceDistanceMeters = CAPTURE_POINT_THREAT_RADIUS_REFERENCE_DISTANCE_METERS;
  if (!Number.isFinite(referenceDistanceMeters) || referenceDistanceMeters <= 0) {
    console.log(
      "[HQ ROUTING] using reference threat radius " +
        CAPTURE_POINT_THREAT_RADIUS_REFERENCE_RADIUS_METERS.toFixed(2) +
        "m because the reference A-C distance is invalid"
    );
    return;
  }

  const acHorizontalDistanceMeters = getCapturePointHorizontalDistanceMeters(aPosition, cPosition);
  if (!Number.isFinite(acHorizontalDistanceMeters) || acHorizontalDistanceMeters <= 0) {
    console.log(
      "[HQ ROUTING] using reference threat radius " +
        CAPTURE_POINT_THREAT_RADIUS_REFERENCE_RADIUS_METERS.toFixed(2) +
        "m because the measured A-C horizontal distance is invalid"
    );
    return;
  }

  const rawRadiusMeters =
    acHorizontalDistanceMeters *
    (CAPTURE_POINT_THREAT_RADIUS_REFERENCE_RADIUS_METERS / referenceDistanceMeters);
  liveCapturePointThreatRadiusMeters = clampLiveCapturePointThreatRadiusMeters(rawRadiusMeters);

  console.log(
    "[HQ ROUTING] A-C horizontal distance=" +
      acHorizontalDistanceMeters.toFixed(2) +
      "m, raw threat radius=" +
      rawRadiusMeters.toFixed(2) +
      "m, applied threat radius=" +
      liveCapturePointThreatRadiusMeters.toFixed(2) +
      "m"
  );
}

function clearLiveRoutingCapturePointPositions(): void {
  const routingCapturePoints = [
    serverCapturePoints[CP_A_ID],
    serverCapturePoints[CP_B_ID],
    serverCapturePoints[CP_C_ID],
  ];

  for (let i = 0; i < routingCapturePoints.length; i++) {
    const cp = routingCapturePoints[i];
    if (!cp) continue;
    cp.clearPosition();
  }

  liveRoutingCapturePointPositionsInitialized = false;
  liveRoutingCapturePointPositionsWarned = false;
  resetLiveCapturePointThreatRadiusMeters();
}

function initializeLiveRoutingCapturePointPositions(): boolean {
  clearLiveRoutingCapturePointPositions();
  if (!validateLiveRoutingCapturePointIds()) return false;

  const routingCapturePoints = [
    serverCapturePoints[CP_A_ID],
    serverCapturePoints[CP_B_ID],
    serverCapturePoints[CP_C_ID],
  ];
  const missingPositionIds: number[] = [];

  for (let i = 0; i < routingCapturePoints.length; i++) {
    const cp = routingCapturePoints[i];
    if (!cp) {
      missingPositionIds.push(i === 0 ? CP_A_ID : i === 1 ? CP_B_ID : CP_C_ID);
      continue;
    }

    cp.refreshPosition();
    if (cp.getPosition() === null) missingPositionIds.push(cp.id);
  }

  if (missingPositionIds.length > 0) {
    LogRuntimeError(
      "LiveRoutingCapturePointPositions",
      "Unable to sample live routing capture-point positions for ids: " +
        missingPositionIds.join(", ") +
        "; using reference threat radius " +
        CAPTURE_POINT_THREAT_RADIUS_REFERENCE_RADIUS_METERS.toFixed(2) +
        "m"
    );
    return false;
  }

  liveRoutingCapturePointPositionsInitialized = true;
  liveRoutingCapturePointPositionsWarned = false;
  refreshLiveCapturePointThreatRadiusFromAcDistance();
  console.log(
    "[HQ ROUTING] live capture-point positions initialized for ids A=" +
      String(CP_A_ID) +
      ", B=" +
      String(CP_B_ID) +
      ", C=" +
      String(CP_C_ID)
  );
  return true;
}

function warnLiveRoutingPositionsUnavailableOnce(): void {
  if (liveRoutingCapturePointPositionsWarned) return;
  liveRoutingCapturePointPositionsWarned = true;
  console.log("[HQ ROUTING] live routing positions unavailable; preserving current HQ selection");
}

/* =================================================================================================
   8) INPUT / DAMAGE RESTRICTIONS (PHASE-BASED)
================================================================================================= */

function applyPhaseInputRestrictionsForPlayer(player: mod.Player): void {
  if (!mod.IsPlayerValid(player)) return;
  if (isExcludedPlayer(player)) {
    mod.EnableAllInputRestrictions(player, false);
    return;
  }

  const isPrematch = gameStatus === 0;
  const isRedeployCountdown = gameStatus === 1;
  const isPreLive = gameStatus === 2;
  const isLive = gameStatus >= 3;

  if (isLive) {
    mod.EnableAllInputRestrictions(player, false);
    
    return;
  }

  

  if (isPrematch) {
    mod.EnableAllInputRestrictions(player, false);
    mod.EnableInputRestriction(player, mod.RestrictedInputs.Interact, false);
    return;
  }

  if (isRedeployCountdown) {
    mod.EnableAllInputRestrictions(player, false);
    mod.EnableInputRestriction(player, mod.RestrictedInputs.FireWeapon, true);
    mod.EnableInputRestriction(player, mod.RestrictedInputs.Interact, true);
    return;
  }

  if (isPreLive) {
    mod.EnableAllInputRestrictions(player, true);
    mod.EnableInputRestriction(player, mod.RestrictedInputs.CameraPitch, false);
    mod.EnableInputRestriction(player, mod.RestrictedInputs.CameraYaw, false);
    return;
  }
}

/* Utility wrapper (keeps old call sites readable) */
function setReadyPhaseProtectionForPlayer(player: mod.Player, enabled: boolean): void {
  if (!enabled) {
    mod.EnableAllInputRestrictions(player, false);
    
    return;
  }
  applyPhaseInputRestrictionsForPlayer(player);
}

function setPlayerMaxHealthAndRefill(player: mod.Player, maxHealth: number): void {
  if (!mod.IsPlayerValid(player)) return;

  try {
    mod.SetPlayerMaxHealth(player, maxHealth);
  } catch (_errSetMax) {}

  try {
    mod.Heal(player, PREMATCH_HEALTH_FULL_HEAL_AMOUNT);
  } catch (_errHeal) {}
}

function clearPrematch889StateForPlayer(playerId: number): void {
  delete prematchHealthInside889ByPlayerId[playerId];
  delete prematchHealthAppliedMaxByPlayerId[playerId];
}

function isPrematchOutside889(playerId: number): boolean {
  if (gameStatus !== 0) return false;

  const sp = serverPlayers.get(playerId);
  if (!sp) return false;
  if (!mod.IsPlayerValid(sp.player)) return false;

  return prematchHealthInside889ByPlayerId[playerId] !== true;
}

function forcePrematchOutside889FullHeal(player: mod.Player, playerId: number): void {
  if (!mod.IsPlayerValid(player)) return;
  if (!isPrematchOutside889(playerId)) return;

  try {
    mod.Heal(player, PREMATCH_HEALTH_FULL_HEAL_AMOUNT);
  } catch (_err) {}
}

// Prematch 889 health mapping:
// - inside 889: normal max health
// - outside 889: outside max health policy
function applyPrematch889HealthForPlayer(playerId: number): void {
  const sp = serverPlayers.get(playerId);
  if (!sp) return;
  if (!mod.IsPlayerValid(sp.player)) return;
  if (isExcludedPlayer(sp.player)) return;

  const desiredMax =
    gameStatus === 0
      ? prematchHealthInside889ByPlayerId[playerId] === true
        ? PREMATCH_HEALTH_NORMAL_MAX
        : PREMATCH_HEALTH_OUTSIDE_MAX
      : PREMATCH_HEALTH_NORMAL_MAX;

  if (prematchHealthAppliedMaxByPlayerId[playerId] !== desiredMax) {
    setPlayerMaxHealthAndRefill(sp.player, desiredMax);
    prematchHealthAppliedMaxByPlayerId[playerId] = desiredMax;
    return;
  }

  // Outside 889 in prematch must always be topped off, even when max-health value is unchanged.
  if (isPrematchOutside889(playerId)) {
    forcePrematchOutside889FullHeal(sp.player, playerId);
  }
}

function applyPrematch889HealthForAllPlayers(): void {
  serverPlayers.forEach((p) => {
    if (isExcludedPlayer(p.player)) return;
    applyPrematch889HealthForPlayer(p.id);
  });
}

function normalizeAllPlayersToStandardHealthAndClearPrematch889State(): void {
  serverPlayers.forEach((p) => {
    if (isExcludedPlayer(p.player)) {
      clearPrematch889StateForPlayer(p.id);
      return;
    }

    if (!mod.IsPlayerValid(p.player)) {
      clearPrematch889StateForPlayer(p.id);
      return;
    }

    setPlayerMaxHealthAndRefill(p.player, PREMATCH_HEALTH_NORMAL_MAX);
    clearPrematch889StateForPlayer(p.id);
  });
}

/* Prematch team switch helper */
function switchTeamPrematchAndRedeploy(player: mod.Player, newTeam: mod.Team): void {
  mod.UndeployPlayer(player);
  mod.SetTeam(player, newTeam);
  mod.SetRedeployTime(player, 0);
}

function forceAutoDeployToInitialHqDuringCountdown(): void {
  // Legacy countdown only. Pre-live uses anchor placement and must not accept HQ as final placement.
  if (gameStatus !== 1) return;

  serverPlayers.forEach((sp) => {
    if (!sp) return;
    if (sp.isDeployed) return;
    if (!mod.IsPlayerValid(sp.player)) return;
    if (!isParticipantPlayer(sp.player)) return;

    const spawnerObjId = getInitialSpawnPointObjIdForTeam(mod.GetTeam(sp.player));
    if (!spawnerObjId) return;

    mod.SetRedeployTime(sp.player, 0);
    mod.SpawnPlayerFromSpawnPoint(sp.player, spawnerObjId);
  });
}

type PreliveSpawnSector = (typeof KOTH_SPAWNS.regions)[number]["sectors"][number];
type PreliveObjectiveHill = (typeof KOTH_HILLS)[number];

const PRELIVE_INITIAL_SPAWN_OBJECTIVE_LETTER = "A";
const PRELIVE_ANCHOR_ENEMY_SAFETY_RADIUS_METERS = KOTH_SPAWNS.safety.enemySafetyRadiusMeters;
const PRELIVE_FALLBACK_IDEAL_DISTANCE_METERS = KOTH_SPAWNS.distance.idealObjectiveDistanceMeters;
const PRELIVE_FALLBACK_MIN_DISTANCE_METERS = KOTH_SPAWNS.distance.minObjectiveDistanceMeters;
const PRELIVE_FALLBACK_MAX_DISTANCE_METERS = KOTH_SPAWNS.distance.maxObjectiveDistanceMeters;
const PRELIVE_FALLBACK_HARD_MAX_DISTANCE_METERS = KOTH_SPAWNS.distance.idealObjectiveDistanceMeters;
const PRELIVE_FALLBACK_PREFERRED_BAND_PENALTY = 250;
const PRELIVE_FALLBACK_HARD_RANGE_PENALTY = 1000;

interface PreliveAnchorDestination {
  anchorObjectId: number;
  sector: PreliveSpawnSector;
  position: mod.Vector;
  orientationRadians: number;
  distanceToActiveObjectiveMeters: number;
  distanceErrorMeters: number;
  isActiveObjectiveAnchor: boolean;
  score: number;
}

let preliveClusterTeleportIndexByTeamId: { [teamId: number]: number } = {};
let preliveTeleportWarnedMissingAnchorById: { [anchorObjectId: number]: boolean } = {};
let prelivePendingAnchorByPlayerId: { [playerId: number]: PreliveAnchorDestination | undefined } = {};
let preliveTeleportedPlayerById: { [playerId: number]: boolean } = {};

function resetPreliveClusterTeleportState(): void {
  preliveClusterTeleportIndexByTeamId = {};
  preliveTeleportWarnedMissingAnchorById = {};
  prelivePendingAnchorByPlayerId = {};
  preliveTeleportedPlayerById = {};
}

function getPreliveTeamSide(team: mod.Team): "west" | "east" | undefined {
  const teamId = modlib.getTeamId(team);
  if (teamId === 1) return "west";
  if (teamId === 2) return "east";
  return undefined;
}

function getPreliveActiveHill(): PreliveObjectiveHill | undefined {
  for (let i = 0; i < KOTH_HILLS.length; i++) {
    const hill = KOTH_HILLS[i];
    if (hill.letter === PRELIVE_INITIAL_SPAWN_OBJECTIVE_LETTER) return hill;
  }

  return KOTH_HILLS[0];
}

function getPreliveObjectiveSectorsForTeam(
  team: mod.Team,
  includeActiveObjective: boolean
): PreliveSpawnSector[] {
  const teamSide = getPreliveTeamSide(team);
  const sectors: PreliveSpawnSector[] = [];
  if (!teamSide) return sectors;

  for (let i = 0; i < KOTH_SPAWNS.regions.length; i++) {
    const region = KOTH_SPAWNS.regions[i];
    if (region.objectiveLetter === undefined) continue;
    const isActiveRegion = region.objectiveLetter === PRELIVE_INITIAL_SPAWN_OBJECTIVE_LETTER;
    if (includeActiveObjective !== isActiveRegion) continue;

    for (let j = 0; j < region.sectors.length; j++) {
      const sector = region.sectors[j];
      if (sector.teamSide === teamSide) sectors.push(sector);
    }
  }

  return sectors;
}

function warnPreliveTeleportMissingAnchorOnce(anchorObjectId: number): void {
  if (preliveTeleportWarnedMissingAnchorById[anchorObjectId] === true) return;
  preliveTeleportWarnedMissingAnchorById[anchorObjectId] = true;

  mod.DisplayHighlightedWorldLogMessage(
    mod.Message("[PRELIVE TELEPORT] missing cluster anchor {}", anchorObjectId)
  );
}

function isPreliveForbiddenAnchorObjectId(anchorObjectId: number): boolean {
  if (anchorObjectId === KOTH_SPAWNS.hqSpawners.team1) return true;
  if (anchorObjectId === KOTH_SPAWNS.hqSpawners.team2) return true;

  for (let i = 0; i < KOTH_SPAWNS.disabledLegacyHqIds.length; i++) {
    if (anchorObjectId === KOTH_SPAWNS.disabledLegacyHqIds[i]) return true;
  }

  return false;
}

function getPreliveObjectivePosition(): mod.Vector | null {
  const hill = getPreliveActiveHill();
  if (hill) {
    const capturePointIds = [
      hill.neutralCapturePointId,
      hill.team1CapturePointId,
      hill.team2CapturePointId,
      CP_A_ID,
    ];
    const triedIds: { [capturePointId: number]: boolean } = {};

    for (let j = 0; j < capturePointIds.length; j++) {
      const capturePointId = capturePointIds[j];
      if (triedIds[capturePointId] === true) continue;
      triedIds[capturePointId] = true;

      try {
        return mod.GetObjectPosition(mod.GetCapturePoint(capturePointId));
      } catch (_err) {}
    }
  }

  try {
    return mod.GetObjectPosition(mod.GetCapturePoint(CP_A_ID));
  } catch (_err) {
    return null;
  }
}

function yawTowardPreliveObjective(fromPosition: mod.Vector): number {
  const objectivePosition = getPreliveObjectivePosition();
  if (!objectivePosition) return 0;

  const deltaX = mod.XComponentOf(objectivePosition) - mod.XComponentOf(fromPosition);
  const deltaZ = mod.ZComponentOf(objectivePosition) - mod.ZComponentOf(fromPosition);
  return Math.atan2(deltaX, deltaZ);
}

function resolvePreliveAnchorPosition(anchorObjectId: number): mod.Vector | null {
  let spatialObject: mod.SpatialObject;
  let position: mod.Vector;

  if (isPreliveForbiddenAnchorObjectId(anchorObjectId)) return null;

  try {
    spatialObject = mod.GetSpatialObject(anchorObjectId);
    position = mod.GetObjectPosition(spatialObject);
  } catch (err) {
    warnPreliveTeleportMissingAnchorOnce(anchorObjectId);
    LogRuntimeError("PreliveTeleport/ResolveAnchor/" + String(anchorObjectId), err);
    return null;
  }

  return position;
}

function countPreliveLivingEnemiesNearPosition(position: mod.Vector, team: mod.Team, radiusMeters: number): number {
  let enemyCount = 0;

  serverPlayers.forEach((other) => {
    if (!other) return;
    if (!mod.IsPlayerValid(other.player)) return;
    if (!other.isDeployed) return;
    if (!kernelIsPlayerAliveSafe(other.player)) return;
    if (!isParticipantPlayer(other.player)) return;
    if (mod.Equals(mod.GetTeam(other.player), team)) return;

    try {
      const distance = mod.DistanceBetween(position, getPlayerPosition(other.player));
      if (distance <= radiusMeters) enemyCount++;
    } catch (_err) {}
  });

  return enemyCount;
}

function scorePreliveAnchorDestination(
  sector: PreliveSpawnSector,
  anchorObjectId: number,
  position: mod.Vector,
  activeObjectivePosition: mod.Vector,
  isActiveObjectiveAnchor: boolean,
  anchorOffset: number
): PreliveAnchorDestination {
  const distanceToActiveObjectiveMeters = mod.DistanceBetween(position, activeObjectivePosition);
  const distanceErrorMeters = Math.abs(distanceToActiveObjectiveMeters - PRELIVE_FALLBACK_IDEAL_DISTANCE_METERS);
  let score = isActiveObjectiveAnchor ? 0 : 500 + distanceErrorMeters;

  if (!isActiveObjectiveAnchor) {
    if (
      distanceToActiveObjectiveMeters < PRELIVE_FALLBACK_MIN_DISTANCE_METERS ||
      distanceToActiveObjectiveMeters > PRELIVE_FALLBACK_MAX_DISTANCE_METERS
    ) {
      score += PRELIVE_FALLBACK_PREFERRED_BAND_PENALTY;
    }

    if (distanceToActiveObjectiveMeters > PRELIVE_FALLBACK_HARD_MAX_DISTANCE_METERS) {
      score += PRELIVE_FALLBACK_HARD_RANGE_PENALTY;
    }
  }

  score += anchorOffset * 0.01;

  return {
    anchorObjectId,
    sector,
    position,
    orientationRadians: yawTowardPreliveObjective(position),
    distanceToActiveObjectiveMeters,
    distanceErrorMeters,
    isActiveObjectiveAnchor,
    score,
  };
}

function selectBestPreliveAnchorFromSectors(
  sectors: PreliveSpawnSector[],
  team: mod.Team,
  activeObjectivePosition: mod.Vector,
  isActiveObjectiveAnchor: boolean,
  allowOutsideHardFallbackRange: boolean
): PreliveAnchorDestination | null {
  const teamId = modlib.getTeamId(team);
  let bestDestination: PreliveAnchorDestination | null = null;
  let bestScore = Number.MAX_SAFE_INTEGER;
  let bestUnsafeDestination: PreliveAnchorDestination | null = null;
  let bestUnsafeScore = Number.MAX_SAFE_INTEGER;

  for (let s = 0; s < sectors.length; s++) {
    const sector = sectors[s];
    if (sector.objectiveLetter === undefined) continue;
    if (sector.anchorObjectIds.length <= 0) continue;

    const startIndex = preliveClusterTeleportIndexByTeamId[teamId] ?? 0;
    for (let offset = 0; offset < sector.anchorObjectIds.length; offset++) {
      const anchorIndex = (startIndex + offset) % sector.anchorObjectIds.length;
      const anchorObjectId = sector.anchorObjectIds[anchorIndex];
      const position = resolvePreliveAnchorPosition(anchorObjectId);
      if (!position) continue;

      const destination = scorePreliveAnchorDestination(
        sector,
        anchorObjectId,
        position,
        activeObjectivePosition,
        isActiveObjectiveAnchor,
        offset
      );

      if (
        !isActiveObjectiveAnchor &&
        !allowOutsideHardFallbackRange &&
        destination.distanceToActiveObjectiveMeters > PRELIVE_FALLBACK_HARD_MAX_DISTANCE_METERS
      ) {
        continue;
      }

      const enemyCount = countPreliveLivingEnemiesNearPosition(
        destination.position,
        team,
        PRELIVE_ANCHOR_ENEMY_SAFETY_RADIUS_METERS
      );
      if (enemyCount > 0) {
        const unsafeScore = destination.score + enemyCount * KOTH_SPAWNS.safety.unsafeAnchorPenalty;
        if (unsafeScore < bestUnsafeScore) {
          bestUnsafeScore = unsafeScore;
          bestUnsafeDestination = destination;
        }
        continue;
      }
      if (destination.score >= bestScore) continue;

      bestDestination = destination;
      bestScore = destination.score;
      preliveClusterTeleportIndexByTeamId[teamId] = (anchorIndex + 1) % sector.anchorObjectIds.length;
    }
  }

  return bestDestination ?? bestUnsafeDestination;
}

function selectBestPreliveAnchorForPlayer(sp: Player): PreliveAnchorDestination | null {
  if (!sp) return null;
  if (!mod.IsPlayerValid(sp.player)) return null;
  if (!isParticipantPlayer(sp.player)) return null;

  const team = mod.GetTeam(sp.player);
  const activeObjectivePosition = getPreliveObjectivePosition();
  if (!activeObjectivePosition) return null;

  const activeSectors = getPreliveObjectiveSectorsForTeam(team, true);
  const fallbackSectors = getPreliveObjectiveSectorsForTeam(team, false);

  const activeDestination = selectBestPreliveAnchorFromSectors(
    activeSectors,
    team,
    activeObjectivePosition,
    true,
    false
  );
  if (activeDestination) return activeDestination;

  const boundedFallbackDestination = selectBestPreliveAnchorFromSectors(
    fallbackSectors,
    team,
    activeObjectivePosition,
    false,
    false
  );
  if (boundedFallbackDestination) return boundedFallbackDestination;

  return null;
}

function queuePreliveAnchorForPlayer(sp: Player): void {
  if (!sp) return;
  if (!mod.IsPlayerValid(sp.player)) return;
  if (!isParticipantPlayer(sp.player)) return;

  const destination = selectBestPreliveAnchorForPlayer(sp);
  if (!destination) return;

  prelivePendingAnchorByPlayerId[sp.id] = destination;
}

function teleportPlayerToPrelivePendingAnchor(sp: Player): void {
  if (!sp) return;
  if (!mod.IsPlayerValid(sp.player)) return;
  if (!isParticipantPlayer(sp.player)) return;
  if (!sp.isDeployed) return;
  if (!kernelIsPlayerAliveSafe(sp.player)) return;
  if (preliveTeleportedPlayerById[sp.id] === true) return;

  let destination = prelivePendingAnchorByPlayerId[sp.id];
  if (!destination) {
    destination = selectBestPreliveAnchorForPlayer(sp) ?? undefined;
    if (destination) prelivePendingAnchorByPlayerId[sp.id] = destination;
  }
  if (!destination) return;

  try {
    const finalOrientationRadians = yawTowardPreliveObjective(destination.position);
    mod.Teleport(sp.player, destination.position, finalOrientationRadians);
    preliveTeleportedPlayerById[sp.id] = true;
    delete prelivePendingAnchorByPlayerId[sp.id];
    invalidateLivePlayerSpatialHash();
  } catch (err) {
    LogRuntimeError("PreliveTeleport/Teleport/" + String(sp.id), err);
  }
}

function preparePreliveAnchorsForAllParticipants(): void {
  serverPlayers.forEach((sp) => {
    if (!sp) return;
    if (!mod.IsPlayerValid(sp.player)) return;
    if (!isParticipantPlayer(sp.player)) return;

    queuePreliveAnchorForPlayer(sp);

    if (kernelIsPlayerAliveSafe(sp.player)) {
      sp.isDeployed = true;
      teleportPlayerToPrelivePendingAnchor(sp);
    }
  });
}


/* Prematch loadout stripping (MELEE ONLY) */
const READYUP_REMOVE_SLOTS: mod.InventorySlots[] = [
  mod.InventorySlots.PrimaryWeapon,
  mod.InventorySlots.SecondaryWeapon,
  mod.InventorySlots.Throwable,
  mod.InventorySlots.ClassGadget,
  mod.InventorySlots.GadgetOne,
  mod.InventorySlots.GadgetTwo,
  mod.InventorySlots.MiscGadget,
  // IMPORTANT: do NOT remove mod.InventorySlots.MeleeWeapon
];

function stripLoadoutToMeleeOnly(player: mod.Player): void {
  for (let i = 0; i < READYUP_REMOVE_SLOTS.length; i++) {
    mod.RemoveEquipment(player, READYUP_REMOVE_SLOTS[i]);
  }
}

/* Bot backfill detection (Portal setting: bot backfill counts as AI soldiers). 
   We must exclude AI soldiers from Ready Up requirements. */
function isBotBackfillPlayer(player: mod.Player): boolean {
  return mod.GetSoldierState(player, mod.SoldierStateBool.IsAISoldier);
}


/* =================================================================================================
   9) HQ ENABLE/DISABLE + ROUTING LOGIC
================================================================================================= */

function validateReservedSpawnIsolationFromConfigOnce(): void {
  if (reservedSpawnIsolationValidated) return;
  reservedSpawnIsolationValidated = true;

  if (RESERVED_SPAWN_POINT_ID <= 0) return;

  const collisions: string[] = [];
  const hqEntries: Array<[string, number]> = [
    ["team1Initial", TEAM1_INITIAL_HQ],
    ["team2Initial", TEAM2_INITIAL_HQ],
    ["team1Readyup", TEAM1_READYUP_HQ],
    ["team2Readyup", TEAM2_READYUP_HQ],
    ["team1Live", TEAM1_LIVE_HQ],
    ["team2Live", TEAM2_LIVE_HQ],
    ["team1A", TEAM1_FLAG_A_HQ],
    ["team1B", TEAM1_FLAG_B_HQ],
    ["team1C", TEAM1_FLAG_C_HQ],
    ["team2A", TEAM2_FLAG_A_HQ],
    ["team2B", TEAM2_FLAG_B_HQ],
    ["team2C", TEAM2_FLAG_C_HQ],
    ["team1AB", TEAM1_AB_HQ],
    ["team1AC", TEAM1_AC_HQ],
    ["team1BC", TEAM1_BC_HQ],
    ["team2AB", TEAM2_AB_HQ],
    ["team2AC", TEAM2_AC_HQ],
    ["team2BC", TEAM2_BC_HQ],
    ["team1ABC", TEAM1_ABC_HQ],
    ["team2ABC", TEAM2_ABC_HQ],
    ["team1NO", TEAM1_NO_FLAG_HQ],
    ["team2NO", TEAM2_NO_FLAG_HQ],
  ];

  for (let i = 0; i < hqEntries.length; i++) {
    if (hqEntries[i][1] === RESERVED_SPAWN_POINT_ID) {
      collisions.push("hq." + hqEntries[i][0]);
    }
  }

  const routeKeys: DynamicRouteKey[] = ["A", "B", "C", "AB", "AC", "BC", "ABC", "NO"];

  for (let i = 0; i < routeKeys.length; i++) {
    const routeKey = routeKeys[i];
    const team1RouteSpawners = TEAM1_SPAWNERS_BY_ROUTE[routeKey];
    const team2RouteSpawners = TEAM2_SPAWNERS_BY_ROUTE[routeKey];

    if (team1RouteSpawners.indexOf(RESERVED_SPAWN_POINT_ID) >= 0) {
      collisions.push("dynamic.team1." + routeKey);
    }

    if (team2RouteSpawners.indexOf(RESERVED_SPAWN_POINT_ID) >= 0) {
      collisions.push("dynamic.team2." + routeKey);
    }
  }

  if (collisions.length <= 0) return;

  const collisionSummary = collisions.join(", ");
  LogRuntimeError(
    "ReservedSpawnIsolation",
    "reserved spawn id " + String(RESERVED_SPAWN_POINT_ID) + " collides with: " + collisionSummary
  );
  mod.DisplayHighlightedWorldLogMessage(
    mod.Message("[RESERVED SPAWN] id {} collides with {}", RESERVED_SPAWN_POINT_ID, collisionSummary)
  );
}
function warnPrematchHqMapValidationOnce(key: string, message: any): void {
  if (prematchHqMapValidationWarnedByKey[key] === true) return;
  prematchHqMapValidationWarnedByKey[key] = true;
  mod.DisplayHighlightedWorldLogMessage(message);
}

function tryResolveHqObjIdFromMapData(hqId: number): number {
  try {
    const hq = mod.GetHQ(hqId);
    return getObjIdSafe(hq);
  } catch (_err) {
    return -1;
  }
}

function validatePrematchReadyupHqsFromMapData(): void {
  const configuredTeam1HqId: number = Number(TEAM1_READYUP_HQ);
  const configuredTeam2HqId: number = Number(TEAM2_READYUP_HQ);

  const team1ObjId = tryResolveHqObjIdFromMapData(configuredTeam1HqId);
  const team2ObjId = tryResolveHqObjIdFromMapData(configuredTeam2HqId);

  let valid = true;
  let reason = "ok";

  if (configuredTeam1HqId === configuredTeam2HqId) {
    valid = false;
    reason = "same_configured_id";
  } else if (team1ObjId < 0 && team2ObjId < 0) {
    valid = false;
    reason = "missing_both";
  } else if (team1ObjId < 0) {
    valid = false;
    reason = "missing_team1";
  } else if (team2ObjId < 0) {
    valid = false;
    reason = "missing_team2";
  } else if (team1ObjId === team2ObjId) {
    valid = false;
    reason = "same_objid";
  }

  if (valid) {
    resolvedPrematchHqTeam1Id = configuredTeam1HqId;
    resolvedPrematchHqTeam2Id = configuredTeam2HqId;
    prematchHqFallbackActive = false;
  } else {
    resolvedPrematchHqTeam1Id = TEAM1_INITIAL_HQ;
    resolvedPrematchHqTeam2Id = TEAM2_INITIAL_HQ;
    prematchHqFallbackActive = true;
  }

  const diag = "cfg=" +
    String(configuredTeam1HqId) +
    "/" +
    String(configuredTeam2HqId) +
    " obj=" +
    String(team1ObjId) +
    "/" +
    String(team2ObjId) +
    " valid=" +
    (valid ? "1" : "0") +
    " reason=" +
    reason +
    " targets=" +
    String(resolvedPrematchHqTeam1Id) +
    "/" +
    String(resolvedPrematchHqTeam2Id);

  const key = "prematch_hq_map/" + diag;
  warnPrematchHqMapValidationOnce(
    key,
    mod.Message("[PREMATCH HQ MAP] {}", diag)
  );
}

function enforceReadyupHqsDisabledOutsidePrematch(_source: string): void {
  if (gameStatus === 0) return;
  SafeEnableHQById(TEAM1_READYUP_HQ, false);
  SafeEnableHQById(TEAM2_READYUP_HQ, false);
}

function warnSafeEnableHqOnce(hqId: number, enabled: boolean, reason: string): void {
  if (hqEnableWarnedById[hqId] === true) return;
  hqEnableWarnedById[hqId] = true;
  mod.DisplayHighlightedWorldLogMessage(
    mod.Message("[HQ SAFE ENABLE] HQ {} toggle {} failed ({})", hqId, enabled ? "on" : "off", reason)
  );
}

function SafeEnableHQById(hqId: number, enabled: boolean): void {
  try {
    mod.EnableHQ(mod.GetHQ(hqId), enabled);
  } catch (err) {
    warnSafeEnableHqOnce(hqId, enabled, String(err));
    LogRuntimeError("SafeEnableHQById/" + String(hqId), err);
  }
}

function DisableAllDynamicHQsAndLiveHQs(): void {
  const idsToDisable: number[] = [
    TEAM1_READYUP_HQ, TEAM2_READYUP_HQ,

    TEAM1_LIVE_HQ, TEAM2_LIVE_HQ,

    TEAM1_FLAG_A_HQ, TEAM1_FLAG_B_HQ, TEAM1_FLAG_C_HQ,
    TEAM2_FLAG_A_HQ, TEAM2_FLAG_B_HQ, TEAM2_FLAG_C_HQ,

    TEAM1_AB_HQ, TEAM1_AC_HQ, TEAM1_BC_HQ,
    TEAM2_AB_HQ, TEAM2_AC_HQ, TEAM2_BC_HQ,

    TEAM1_ABC_HQ, TEAM2_ABC_HQ,

    TEAM1_NO_FLAG_HQ, TEAM2_NO_FLAG_HQ,
  ];

  idsToDisable.forEach((id) => SafeEnableHQById(id, false));
}

function EnableOnlyInitialHQs(): void {
  SafeEnableHQById(TEAM1_INITIAL_HQ, true);
  SafeEnableHQById(TEAM2_INITIAL_HQ, true);
}

function EnableLiveBaseHQs(): void {
  SafeEnableHQById(TEAM1_INITIAL_HQ, true);
  SafeEnableHQById(TEAM2_INITIAL_HQ, true);
  SafeEnableHQById(TEAM1_LIVE_HQ, true);
  SafeEnableHQById(TEAM2_LIVE_HQ, true);
}

function ConfigureLiveSpawns(): void {
  DisableAllDynamicHQsAndLiveHQs();
  EnableLiveBaseHQs();
  enforceReadyupHqsDisabledOutsidePrematch("ConfigureLiveSpawns");
  currentDynamicHqTeam1 = TEAM1_INITIAL_HQ;
  currentDynamicHqTeam2 = TEAM2_INITIAL_HQ;
}

function ConfigurePreMatchSpawns(): void {
  validatePrematchReadyupHqsFromMapData();
  DisableAllDynamicHQsAndLiveHQs();

  if (prematchHqFallbackActive) {
    SafeEnableHQById(TEAM1_READYUP_HQ, false);
    SafeEnableHQById(TEAM2_READYUP_HQ, false);
    SafeEnableHQById(TEAM1_INITIAL_HQ, true);
    SafeEnableHQById(TEAM2_INITIAL_HQ, true);
    return;
  }

  SafeEnableHQById(TEAM1_INITIAL_HQ, false);
  SafeEnableHQById(TEAM2_INITIAL_HQ, false);

  SafeEnableHQById(resolvedPrematchHqTeam1Id, true);
  SafeEnableHQById(resolvedPrematchHqTeam2Id, true);
}


/*
  Updates which HQ is enabled for each team in live phase.
  Priority:
    - Before first capture this round, keep initial HQ.
    - After first capture, choose a single ownership-driven live route from A/B/C only.
    - If current ownership route is B under direct pressure, evict to least-pressure flank (A/C).
    - If team owns 0 flags after having captured at least one, fallback to least-pressure flank (A/C).
    - Keep A/C flank ties sticky by team (fallback to A when no prior flank exists).
*/
function UpdateFlagHQSpawns(): void {
  if (gameStatus !== 3) return;
  if (!liveRoutingCapturePointPositionsInitialized) {
    warnLiveRoutingPositionsUnavailableOnce();
    return;
  }

  const ownerA = serverCapturePoints[CP_A_ID].getOwner();
  const ownerB = serverCapturePoints[CP_B_ID].getOwner();
  const ownerC = serverCapturePoints[CP_C_ID].getOwner();

  const t1OwnA = mod.Equals(ownerA, team1);
  const t1OwnB = mod.Equals(ownerB, team1);
  const t1OwnC = mod.Equals(ownerC, team1);
  const t1Count = (t1OwnA ? 1 : 0) + (t1OwnB ? 1 : 0) + (t1OwnC ? 1 : 0);

  const t2OwnA = mod.Equals(ownerA, team2);
  const t2OwnB = mod.Equals(ownerB, team2);
  const t2OwnC = mod.Equals(ownerC, team2);
  const t2Count = (t2OwnA ? 1 : 0) + (t2OwnB ? 1 : 0) + (t2OwnC ? 1 : 0);

  if (t1Count > 0) team1HasCapturedAnyFlag = true;
  if (t2Count > 0) team2HasCapturedAnyFlag = true;

  const chosenT1 = chooseLiveDynamicHqForTeam(team1, team1HasCapturedAnyFlag);
  const chosenT2 = chooseLiveDynamicHqForTeam(team2, team2HasCapturedAnyFlag);

  if (chosenT1 === currentDynamicHqTeam1 && chosenT2 === currentDynamicHqTeam2) {
    return;
  }

  const t1SingleHQs = [TEAM1_FLAG_A_HQ, TEAM1_FLAG_B_HQ, TEAM1_FLAG_C_HQ];
  const t1ComboHQs = [TEAM1_AB_HQ, TEAM1_AC_HQ, TEAM1_BC_HQ, TEAM1_ABC_HQ];
  const t1AllSpecialHQs = t1SingleHQs.concat(t1ComboHQs).concat([TEAM1_NO_FLAG_HQ]);

  const t2SingleHQs = [TEAM2_FLAG_A_HQ, TEAM2_FLAG_B_HQ, TEAM2_FLAG_C_HQ];
  const t2ComboHQs = [TEAM2_AB_HQ, TEAM2_AC_HQ, TEAM2_BC_HQ, TEAM2_ABC_HQ];
  const t2AllSpecialHQs = t2SingleHQs.concat(t2ComboHQs).concat([TEAM2_NO_FLAG_HQ]);

  t1AllSpecialHQs.forEach((id) => mod.EnableHQ(mod.GetHQ(id), false));
  t2AllSpecialHQs.forEach((id) => mod.EnableHQ(mod.GetHQ(id), false));

  // Disable initial HQs by default; we will enable them only when selected.
  mod.EnableHQ(mod.GetHQ(TEAM1_INITIAL_HQ), false);
  mod.EnableHQ(mod.GetHQ(TEAM2_INITIAL_HQ), false);

  mod.EnableHQ(mod.GetHQ(chosenT1), true);
  mod.EnableHQ(mod.GetHQ(chosenT2), true);

  currentDynamicHqTeam1 = chosenT1;
  currentDynamicHqTeam2 = chosenT2;
}

/* =================================================================================================
   10) TICKETS / BLEED / SCOREBOARD
================================================================================================= */





function UpdateScoreboard(): void {
  serverPlayers.forEach((p) => p.updateScoreboard());
}

function PlayCaptureContestedAudio(cp: CapturePoint): void {
  const owner = cp.getOwner();
  const playerIds = cp.getPlayerIdsOnPoint();

  for (let i = 0; i < playerIds.length; i++) {
    const playerId = playerIds[i];
    const p = serverPlayers.get(playerId);
    if (!p) continue;

    const playerTeam = mod.GetTeam(p.player);

    if (!mod.Equals(owner, teamNeutral) && mod.Equals(playerTeam, owner)) {
      playVOToPlayer(p.player, mod.VoiceOverEvents2D.ObjectiveContested, voflags[cp.symbol]);
    }
  }
}

function UpdateCapturePointContestedState(cp: CapturePoint): void {
  const onPoint = cp.getOnPoint();
  const contestedNow = onPoint[0] > 0 && onPoint[1] > 0;

  const cpId = cp.id;
  const wasContested = capturePointContested[cpId] === true;

  if (contestedNow && !wasContested) {
    PlayCaptureContestedAudio(cp);
  }

  capturePointContested[cpId] = contestedNow;

  const activeBuildupTeam = captureBuildupTeamByCpId[cpId];
  if (!activeBuildupTeam) return;

  const progressTeam = cp.getProgressTeam();
  if (contestedNow || mod.Equals(progressTeam, teamNeutral) || !mod.Equals(activeBuildupTeam, progressTeam)) {
    invalidateCaptureBuildupSessionForCp(cpId);
  }
}

function getMajorityTeamOnPoint(cp: CapturePoint): mod.Team {
  const onPoint = cp.getOnPoint();
  if (onPoint[0] > onPoint[1]) return team1;
  if (onPoint[1] > onPoint[0]) return team2;
  return teamNeutral;
}

type CapturePointPhase =
  | "neutral_idle"
  | "capturing_neutral"
  | "neutralizing_enemy"
  | "rebuilding_owner"
  | "contested"
  | "owned_idle";

function isCapturePointProgressInBand(cp: CapturePoint): boolean {
  const progress = cp.getCaptureProgress();
  return progress > PROGRESS_EMPTY && progress < PROGRESS_FULL;
}

function getCapturePointPhase(cp: CapturePoint): CapturePointPhase {
  const owner = cp.getOwner();
  const progressTeam = cp.getProgressTeam();
  const contested = capturePointContested[cp.id] === true;

  if (contested) return "contested";
  if (!isCapturePointProgressInBand(cp) || mod.Equals(progressTeam, teamNeutral)) {
    return mod.Equals(owner, teamNeutral) ? "neutral_idle" : "owned_idle";
  }
  if (mod.Equals(owner, teamNeutral)) return "capturing_neutral";
  if (mod.Equals(progressTeam, owner)) return "rebuilding_owner";
  return "neutralizing_enemy";
}

/* =================================================================================================
   12) PHASE INITIALIZATION
================================================================================================= */
function ResetRoundGameplayState(): void {
  // Reset tickets immediately so any UI that reads serverScores starts clean.
  serverScores = [INITIAL_TICKETS, INITIAL_TICKETS];
  syncDisplayedGameModeScores(true);
  markLiveHudScoresDirty();
  markScoreboardDirty();
  markCaptureTickLoopsDirty();
  markEndgameSuspenseDirty();

  // Clear per-round caches related to capture audio and capture buildup state.
  capturePointContested = {};
  lastContestSfxTickByCp = {};
  lastCaptureSfxTickByCp = {};
  lastJoinSfxTickByCp = {};
  lastEnterPointSfxTickByPlayerId = {};
  resetAllCaptureBuildupState(true);
  lastLiveFlankRouteByTeamId = {};
  clearLiveRoutingCapturePointPositions();
  hqRoutingDirty = true;
  lastHqRoutingUpdateTick = -999999;

  // Reset each capturepoint in our wrapper/UI state only.
  // Engine-facing bootstrap happens in InitializePreLive after objectives are enabled.
  Object.values(serverCapturePoints).forEach((cp) => {
    // Clear wrapper state (we can safely overwrite via (cp as any) to avoid editing the class)
    (cp as any)._owner = teamNeutral;
    (cp as any)._capturingTeam = teamNeutral;
    (cp as any)._progressTeam = teamNeutral;
    (cp as any)._captureProgress = 0;
    (cp as any)._previousCaptureProgress = 0;
    (cp as any)._captureProgressDirection = 0;
    (cp as any)._lastCaptureProgressSampleTick = serverTickCount;
    (cp as any)._displayProgressRatePerTick = 0;
    (cp as any)._displayProgressMotionMode = 0;
    (cp as any)._onPoint = [];
    (cp as any)._position = null;
    (cp as any)._lastSampledPhase = "neutral_idle";
    cp.clearAnnouncementState();
  });

  // Clear all players capturepoint refs and hide the capture widget container
  serverPlayers.forEach((p) => {
    p.setCapturePoint(null);
    p.resetActiveCaptureProgressUi();
    if (p.activeFlagContainerWidget) mod.SetUIWidgetVisible(p.activeFlagContainerWidget, false);
  });

  // Reset the match timer baseline (your custom timer uses phaseTickCount + ROUND_TIME)
  phaseTickCount = 0;
  markLiveHudTopFlagsDirtyAll();
  syncLiveHudTopFlagBlinkTimer();
}

function describeTeamForCapturePointDiagnostics(team: mod.Team): string {
  if (mod.Equals(team, teamNeutral)) return "Neutral";
  if (mod.Equals(team, team1)) return "Team1";
  if (mod.Equals(team, team2)) return "Team2";
  return "Unknown";
}

function warnCapturePointBootstrapContractOnce(
  cp: CapturePoint,
  owner: mod.Team,
  progress: number,
  progressTeam: mod.Team,
  previousOwner: mod.Team
): void {
  if (capturePointBootstrapContractWarnedById[cp.id] === true) return;
  capturePointBootstrapContractWarnedById[cp.id] = true;

  const summary =
    cp.symbol +
    "/" +
    String(cp.id) +
    " owner=" +
    describeTeamForCapturePointDiagnostics(owner) +
    " progress=" +
    progress.toFixed(3) +
    " progressTeam=" +
    describeTeamForCapturePointDiagnostics(progressTeam) +
    " prevOwner=" +
    describeTeamForCapturePointDiagnostics(previousOwner);

  mod.DisplayHighlightedWorldLogMessage(
    mod.Message("[KOTH LEGACY CAPTURE CONTRACT] {} is not neutral at bootstrap", cp.symbol + "/" + String(cp.id))
  );
  console.log(
    "[KOTH LEGACY CAPTURE CONTRACT] " +
      summary +
      " ; legacy capture points must be authored with InitialOwner=TeamNeutral and zero capture progress"
  );
}

function validateCapturePointNeutralBootstrap(cp: CapturePoint, eventCapturePoint?: mod.CapturePoint | null): boolean {
  const handle = cp.resolveHandle(eventCapturePoint);
  const owner = cp.getOwner();
  const progress = cp.getCaptureProgress();
  const progressTeam = cp.getProgressTeam();
  const previousOwner = mod.GetPreviousOwnerTeam(handle);

  const ownerNeutral = mod.Equals(owner, teamNeutral);
  const progressNeutral = progress <= PROGRESS_EMPTY;
  const progressTeamNeutral = mod.Equals(progressTeam, teamNeutral);

  if (ownerNeutral && progressNeutral && progressTeamNeutral) return true;

  warnCapturePointBootstrapContractOnce(cp, owner, progress, progressTeam, previousOwner);
  return false;
}

function bootstrapCapturePointsForRoundStart(): void {
  Object.values(serverCapturePoints).forEach((cp) => {
    const handle = cp.resolveHandle();
    cp.applyCaptureSettings(handle);
    cp.setObjectiveEnabled(true, handle);
    refreshCapturePointFromEngine(cp, false, handle);
    validateCapturePointNeutralBootstrap(cp, handle);
    cp.clearAnnouncementState();
  });

  markLiveHudTopFlagsDirtyAll();
  syncLiveHudTopFlagBlinkTimer();
  markCaptureTickLoopsDirty();
}

function resyncCapturePointsForLiveBootstrap(): void {
  refreshCapturePointsEngineStateForUI();
  markLiveHudTopFlagsDirtyAll();
  syncLiveHudTopFlagBlinkTimer();
  markCaptureTickLoopsDirty();
}
function tryGetPlayerSquadName(player: mod.Player): string | null {
  if (!mod.IsPlayerValid(player)) return null;

  try {
    return mod.GetSquadName(mod.GetSquad(player));
  } catch (_err) {
    return null;
  }
}

function ResetPostmatchEndState(): void {
  postmatchEndStep = POSTMATCH_END_STEP_IDLE;
  postmatchEndStepTick = 0;
  postmatchWinnerTeam = teamNeutral;
}

function ReturnToPreMatchAfterRoundReset(): void {
  stopCoreMusicPlayback();
  resetAllCaptureBuildupState(true);
  resetAllLiveHudState();
  serverScores = [INITIAL_TICKETS, INITIAL_TICKETS];
  syncDisplayedGameModeScores(true);
  markLiveHudScoresDirty();
  markScoreboardDirty();
  markCaptureTickLoopsDirty();
  markEndgameSuspenseDirty();
  phaseTickCount = 0;
  countDown = COUNT_DOWN_TIME;
  postmatchResultSfxPlayed = false;
  ResetPostmatchEndState();
  prematchSwitchLastHandledTickByPlayerId = {};
  prematchSwitchDebounceWarnedByPlayerId = {};
  lastPrematchTeamSwitchTick = -999999;
  lastPrematchTeamSwitchTickByPlayerId = {};
  prematchStabilizationGateWarnedBySwitchTick = {};
  prematchHealthInside889ByPlayerId = {};
  prematchHealthAppliedMaxByPlayerId = {};

  initialization[0] = false;
  initialization[1] = false;
  initialization[2] = false;
  initialization[3] = false;
  initialization[4] = false;

  SafeSetWidgetVisibleByName("PreMatchContainer", true);
  SafeSetWidgetVisibleByName("CountDownContainer", false);
  SafeSetWidgetVisibleByName("LiveContainer", false);
  SafeSetWidgetVisibleByName("PostMatchContainer", false);

  serverPlayers.forEach((p) => {
    p.resetReadyForNewRound();
    replacePrematchReadyText(p.id, p.player);
    p.isDeployed = false;
    p.setCapturePoint(null);
    p.resetActiveCaptureProgressUi();
    if (p.activeFlagContainerWidget) {
      try {
        mod.SetUIWidgetVisible(p.activeFlagContainerWidget, false);
      } catch (_err) {}
    }

    mod.SetRedeployTime(p.player, 0);
    applyPhaseInputRestrictionsForPlayer(p.player);
  });

  for (let i = 0; i < 4; i++) {
    SafeEnableWorldIconById(WORLDICON_T1_SWITCH + i, true, true);
  }

  SafeEnableInteractPointById(IP_T1_SWITCH, true);
  SafeEnableInteractPointById(IP_T1_READY, true);
  SafeEnableInteractPointById(IP_T2_SWITCH, true);
  SafeEnableInteractPointById(IP_T2_READY, true);

  ConfigurePreMatchSpawns();
  gameStatus = 0;
  BuildPrematchRosterUI();
  UpdatePrematchRosterUI();

  applyPrematch889HealthForAllPlayers();
  mod.DeployAllPlayers();
}

function InitializePreMatch(): void {
  phaseTickCount = 0;
  stopCoreMusicPlayback();
  evaluateObjectiveHighlightStringKeyHealth();
  validateReservedSpawnIsolationFromConfigOnce();

  // If we are looping back into prematch, ensure the world state is clean.
  ResetRoundGameplayState();
  StopAllEndgameLoops();

  UIContainers = [
    mod.FindUIWidgetWithName("PreMatchContainer"),
    mod.FindUIWidgetWithName("CountDownContainer"),
    mod.FindUIWidgetWithName("LiveContainer"),
    mod.FindUIWidgetWithName("PostMatchContainer"),
  ];

  serverPlayers.forEach((p) => p.setTeam());

  SafeSetWorldIconTextById(WORLDICON_T1_SWITCH, mod.Message(mod.stringkeys.SwitchTeam));
  SafeSetWorldIconTextById(WORLDICON_T1_READY, mod.Message(mod.stringkeys.Ready));
  SafeSetWorldIconTextById(WORLDICON_T2_SWITCH, mod.Message(mod.stringkeys.SwitchTeam));
  SafeSetWorldIconTextById(WORLDICON_T2_READY, mod.Message(mod.stringkeys.Ready));

  // Re-enable icons (they were disabled in countdown)
  for (let i = 0; i < 4; i++) {
    SafeEnableWorldIconById(WORLDICON_T1_SWITCH + i, true, true);
  }

  // Re-enable prematch interact points (ready + switch)
  SafeEnableInteractPointById(IP_T1_SWITCH, true);
  SafeEnableInteractPointById(IP_T1_READY, true);
  SafeEnableInteractPointById(IP_T2_SWITCH, true);
  SafeEnableInteractPointById(IP_T2_READY, true);

  mod.SetScoreboardType(mod.ScoreboardType.CustomTwoTeams);
  mod.SetGameModeTimeLimit(60000);

  // Prematch UI visibility
  SafeSetWidgetVisibleByName("PreMatchContainer", true);
  SafeSetWidgetVisibleByName("CountDownContainer", false);
  SafeSetWidgetVisibleByName("LiveContainer", false);

  mod.SetSpawnMode(mod.SpawnModes.Deploy);
  serverPlayers.forEach((p) => mod.SetRedeployTime(p.player, 0));

  Object.values(serverCapturePoints).forEach((cp) => {
    cp.setObjectiveEnabled(false);
  });

  ConfigurePreMatchSpawns();


  BuildPrematchRosterUI();
  UpdatePrematchRosterUI();
  queueLiveHudPrebuildForAllParticipants();

  serverPlayers.forEach((p) => setReadyPhaseProtectionForPlayer(p.player, true));
  applyPrematch889HealthForAllPlayers();

  initialization[0] = true;
}

function InitializeCountDown(): void {
  let initOk = false;
  try {
    phaseTickCount = 0;
    countDown = COUNT_DOWN_TIME;

    team1HasCapturedAnyFlag = false;
    team2HasCapturedAnyFlag = false;

    // Legacy countdown path is not used by the all-ready prematch flow.
    mod.SetSpawnMode(mod.SpawnModes.AutoSpawn);
    SafeSetWidgetVisibleByName("PreMatchContainer", false);
    SetPrematchButtonsVisibleForAllPlayers(false);

    for (let i = 0; i < 4; i++) {
      SafeEnableWorldIconById(WORLDICON_T1_SWITCH + i, false, false);
    }

    SafeEnableInteractPointById(IP_T1_READY, false);
    SafeEnableInteractPointById(IP_T2_READY, false);

    SafeSetTextLabelByName("MatchStartsText", mod.Message(mod.stringkeys.MatchStarts));
    SafeSetWidgetVisibleByName("CountDownContainer", true);

    DisableAllDynamicHQsAndLiveHQs();
    EnableOnlyInitialHQs();
    enforceReadyupHqsDisabledOutsidePrematch("InitializeCountDown");

    serverPlayers.forEach((p) => setReadyPhaseProtectionForPlayer(p.player, true));
    initOk = true;
  } catch (err) {
    LogRuntimeError("InitializeCountDown", err);
  } finally {
    initialization[1] = initOk;
  }
}

function InitializePreLive(): void {
  let initOk = false;
  try {
    phaseTickCount = 0;
    countDown = PRELIVE_TIME;

    SafeSetTextLabelByName("MatchStartsText", mod.Message(mod.stringkeys.MatchStarts));
    SafeSetTextLabelByName("CountDownText", mod.Message(countDown));

    // Hide prematch UI.
    SafeSetWidgetVisibleByName("PreMatchContainer", false);
    SetPrematchButtonsVisibleForAllPlayers(false);
    SafeSetWidgetVisibleByName("CountDownContainer", true);

    // Disable prematch world icons + interact points.
    for (let i = 0; i < 4; i++) {
      SafeEnableWorldIconById(WORLDICON_T1_SWITCH + i, false, false);
    }
    SafeEnableInteractPointById(IP_T1_SWITCH, false);
    SafeEnableInteractPointById(IP_T1_READY, false);
    SafeEnableInteractPointById(IP_T2_SWITCH, false);
    SafeEnableInteractPointById(IP_T2_READY, false);

    // Keep the deploy screen suppressed during pre-live while already-alive players are teleported in place.
    mod.SetSpawnMode(mod.SpawnModes.AutoSpawn);
    DisableAllDynamicHQsAndLiveHQs();
    EnableOnlyInitialHQs();
    enforceReadyupHqsDisabledOutsidePrematch("InitializePreLive");
    resetPreliveClusterTeleportState();
    bootstrapCapturePointsForRoundStart();
    preparePreliveAnchorsForAllParticipants();

    queueLiveHudPrebuildForAllParticipants();
    serverPlayers.forEach((p) => setReadyPhaseProtectionForPlayer(p.player, true));
    playCoreLiveStartMusic();
    armPreliveMusicRetryWindow();
    initOk = true;
  } catch (err) {
    LogRuntimeError("InitializePreLive", err);
  } finally {
    initialization[2] = initOk;
  }
}

function InitializeLive(): void {
  mod.SetGameModeTimeLimit(mod.GetMatchTimeElapsed() + ROUND_TIME);
  // Re-enable the tabletop deploy screen for live play.
  mod.SetSpawnMode(mod.SpawnModes.Deploy);
  ConfigureLiveSpawns();
  phaseTickCount = 0;

  // Ensure cached owner/progress state is rebuilt from the engine after PreLive bootstrap
  // before any live routing or HUD decisions read the wrappers.
  resyncCapturePointsForLiveBootstrap();
  Object.values(serverCapturePoints).forEach((cp) => validateCapturePointNeutralBootstrap(cp));

  // Root containers
  SetDepthAboveGameUI("UIContainer");
  SetDepthAboveGameUI("LiveContainer");
  SetDepthAboveGameUI("matchtime");
  SetDepthAboveGameUI("friendlyscore");
  SetDepthAboveGameUI("friendlyscore_pulse");
  SetDepthAboveGameUI("enemyscore");
  SetDepthAboveGameUI("enemyscore_pulse");
  SetDepthAboveGameUI("friendlyprogressbar");
  SetDepthAboveGameUI("friendlyprogressbarfill");
  SetDepthAboveGameUI("friendlyprogress_pulse");
  SetDepthAboveGameUI("enemyprogressbar");
  SetDepthAboveGameUI("enemyprogressbarfill");
  SetDepthAboveGameUI("enemyprogress_pulse");
  SetDepthAboveGameUI("FlagContainerA");
  SetDepthAboveGameUI("FlagContainerB");
  SetDepthAboveGameUI("FlagContainerC");

  initializeLiveRoutingCapturePointPositions();
  UpdateFlagHQSpawns();

  serverScores = [INITIAL_TICKETS, INITIAL_TICKETS];
  syncDisplayedGameModeScores(true);
  markLiveHudScoresDirty();
  markScoreboardDirty();
  markCaptureTickLoopsDirty();
  markEndgameSuspenseDirty();
  drainLiveHudPrebuildQueue(LIVE_UI_SLOTS_PER_TEAM * 2, true);

  // Hide prematch UI once players are deploying/playing.
  const pre = mod.FindUIWidgetWithName("PreMatchContainer");
  if (pre) mod.SetUIWidgetVisible(pre, false);
  SafeSetWidgetVisibleByName("CountDownContainer", false);
  SetPrematchButtonsVisibleForAllPlayers(false);

  if (UIContainers[1]) mod.SetUIWidgetVisible(UIContainers[1], false);
  if (UIContainers[2]) mod.SetUIWidgetVisible(UIContainers[2], true);
  else SafeSetWidgetVisibleByName("LiveContainer", true);
  HideSharedTicketBarFills();

  serverPlayers.forEach((p) => p.addUI());

  // Repaint the top-lane HUD from the freshly sampled engine state now that live HUD widgets exist.
  markLiveHudTopFlagsDirtyAll();
  flushLiveHudTopFlagLanes();

  serverPlayers.forEach((p) => setReadyPhaseProtectionForPlayer(p.player, false));

  serverPlayers.forEach((p) => {
    if (!mod.IsPlayerValid(p.player)) return;
    p.setTeam();
    mod.SetRedeployTime(p.player, REDEPLOY_TIME);
    mod.EnableAllInputRestrictions(p.player, false);
    mod.EnableInputRestriction(p.player, mod.RestrictedInputs.FireWeapon, false);
    mod.EnableInputRestriction(p.player, mod.RestrictedInputs.Interact, false);
    if (p.isDeployed) p.isFirstDeploy();
  });

  mod.SetScoreboardColumnNames(
    mod.Message(mod.stringkeys.ScoreboardScore),
    mod.Message(mod.stringkeys.ScoreboardKills),
    mod.Message(mod.stringkeys.ScoreboardDeaths),
    mod.Message(mod.stringkeys.ScoreboardAssists),
    mod.Message(mod.stringkeys.ScoreboardCaptures)
  );

  SetUITime();
  SetUIScores();
  UpdateLiveHudTimerDiagnostics();

  initialization[3] = true;
}

function getWinningTeam(): mod.Team {
  const t1 = serverScores[0];
  const t2 = serverScores[1];

  if (t1 > t2) return team1;
  if (t2 > t1) return team2;
  return teamNeutral;
}

function deletePostMatchReportUI(): void {
  for (let i = 0; i < postMatchWidgetsToDelete.length; i++) {
    mod.DeleteUIWidget(mod.FindUIWidgetWithName(postMatchWidgetsToDelete[i]));
  }
  postMatchWidgetsToDelete = [];
}

function addPostMatchText(
  name: string,
  posX: number,
  posY: number,
  w: number,
  h: number,
  size: number,
  color: mod.Vector,
  alpha: number,
  receiver: mod.Team | mod.Player
): void {
  const parent = mod.FindUIWidgetWithName("PostMatchContainer");
  mod.AddUIText(
    name,
    mod.CreateVector(posX, posY, 0),
    mod.CreateVector(w, h, 0),
    mod.UIAnchor.TopCenter,
    parent,
    true,
    0,
    mod.CreateVector(0, 0, 0),
    0,
    mod.UIBgFill.None,
    mod.Message(""),
    size,
    color,
    alpha,
    mod.UIAnchor.Center,
    receiver as any
  );

  postMatchWidgetsToDelete.push(name);
}

function setPostMatchText(name: string, label: any): void {
  const w = mod.FindUIWidgetWithName(name);
  if (w) mod.SetUITextLabel(w, label);
}

function BuildPostMatchReportUI(): void {
  deletePostMatchReportUI();

  const parent = mod.FindUIWidgetWithName("PostMatchContainer");
  if (!parent) return;

  mod.SetUIWidgetBgFill(parent, mod.UIBgFill.Solid);
  mod.SetUIWidgetBgAlpha(parent, 0.75);
  mod.SetUIWidgetBgColor(parent, mod.CreateVector(0, 0, 0));
  mod.SetUIWidgetDepth(parent, mod.UIDepth.AboveGameUI);

  const winner = getWinningTeam();

  // Build connected player lists (serverPlayers only contains connected players)
  const t1List: Player[] = [];
  const t2List: Player[] = [];

  serverPlayers.forEach((p) => {
    if (isExcludedPlayer(p.player)) return;

    const t = mod.GetTeam(p.player);
    if (mod.Equals(t, team1)) t1List.push(p);
    else if (mod.Equals(t, team2)) t2List.push(p);
  });

  t1List.sort((a, b) => b.getScoreboardSnapshot()[0] - a.getScoreboardSnapshot()[0]);
  t2List.sort((a, b) => b.getScoreboardSnapshot()[0] - a.getScoreboardSnapshot()[0]);

  // Layout
  const headerY = 220;
  const rowStartY = 260;
  const rowH = 22;

  // Portal-safe centered layout
const TABLE_WIDTH = 620; // safe on 16:9
const TABLE_GAP = 60;    // space between teams

// Left and right table centers
const leftX  = -(TABLE_GAP / 2 + TABLE_WIDTH / 2);
const rightX = +(TABLE_GAP / 2 + TABLE_WIDTH / 2);

  // Utility: clamp line count without mod.Min
  function clampLines(n: number): number {
    let out = n;
    if (out > POSTMATCH_MAX_LINES) out = POSTMATCH_MAX_LINES;
    if (out < 0) out = 0;
    return out;
  }

  // Build a full view for a specific receiver team:
  // left side = friendly team data, right side = enemy team data.
  function buildForReceiver(
    receiver: mod.Team,
    friendlyList: Player[],
    enemyList: Player[],
    friendlyTicketsA: number,
    friendlyTicketsB: number,
    resultKey: any
  ): void {
    // Result text (color depends on result)
    const resultColor =
      resultKey === mod.stringkeys.PostMatchVictory ? COLOR_FRIENDLY :
      resultKey === mod.stringkeys.PostMatchDefeat ? COLOR_ENEMY :
      COLOR_NEUTRAL;

    addPostMatchText("PM_Result_" + modlib.getTeamId(receiver), 0, 80, 800, 80, 64, resultColor, 1, receiver);
    setPostMatchText("PM_Result_" + modlib.getTeamId(receiver), mod.Message(resultKey));

    // Final tickets line (friendly-enemy from viewer perspective)
    addPostMatchText("PM_Tickets_" + modlib.getTeamId(receiver), 0, 150, 900, 40, 28, COLOR_NEUTRAL, 1, receiver);
    setPostMatchText(
      "PM_Tickets_" + modlib.getTeamId(receiver),
      mod.Message(mod.stringkeys.PostMatchFinalTickets, mod.Ceiling(friendlyTicketsA), mod.Ceiling(friendlyTicketsB))
    );

    // Headers (left = friendly, right = enemy)
    function addHeaders(side: "L" | "R", x: number, color: mod.Vector): void {
      const suffix = side + "_" + modlib.getTeamId(receiver);

      addPostMatchText("H_Name_" + suffix, x - 220, headerY, 280, 24, 18, color, 1, receiver);
      addPostMatchText("H_Score_" + suffix, x + 120, headerY, 90, 24, 18, color, 1, receiver);
      addPostMatchText("H_K_" + suffix, x + 200, headerY, 40, 24, 18, color, 1, receiver);
      addPostMatchText("H_D_" + suffix, x + 245, headerY, 40, 24, 18, color, 1, receiver);
      addPostMatchText("H_A_" + suffix, x + 290, headerY, 40, 24, 18, color, 1, receiver);
      addPostMatchText("H_C_" + suffix, x + 345, headerY, 60, 24, 18, color, 1, receiver);

      setPostMatchText("H_Name_" + suffix, mod.Message(mod.stringkeys.PostMatchHeaderName));
      setPostMatchText("H_Score_" + suffix, mod.Message(mod.stringkeys.PostMatchHeaderScore));
      setPostMatchText("H_K_" + suffix, mod.Message(mod.stringkeys.PostMatchHeaderKills));
      setPostMatchText("H_D_" + suffix, mod.Message(mod.stringkeys.PostMatchHeaderDeaths));
      setPostMatchText("H_A_" + suffix, mod.Message(mod.stringkeys.PostMatchHeaderAssists));
      setPostMatchText("H_C_" + suffix, mod.Message(mod.stringkeys.PostMatchHeaderCaptures));
    }

    addHeaders("L", leftX, COLOR_FRIENDLY);
    addHeaders("R", rightX, COLOR_ENEMY);

    // Friendly rows (left)
    const friendlyLines = clampLines(friendlyList.length);
    for (let i = 0; i < friendlyLines; i++) {
      const y = rowStartY + i * rowH;
      const p = friendlyList[i];
      const s = p.getScoreboardSnapshot();
      const suf = "L_" + modlib.getTeamId(receiver) + "_" + i;

      addPostMatchText("N_" + suf, leftX - 220, y, 280, 22, 16, COLOR_FRIENDLY, 1, receiver);
      addPostMatchText("S_" + suf, leftX + 120, y, 90, 22, 16, COLOR_NEUTRAL, 1, receiver);
      addPostMatchText("K_" + suf, leftX + 200, y, 40, 22, 16, COLOR_NEUTRAL, 1, receiver);
      addPostMatchText("D_" + suf, leftX + 245, y, 40, 22, 16, COLOR_NEUTRAL, 1, receiver);
      addPostMatchText("A_" + suf, leftX + 290, y, 40, 22, 16, COLOR_NEUTRAL, 1, receiver);
      addPostMatchText("C_" + suf, leftX + 345, y, 60, 22, 16, COLOR_NEUTRAL, 1, receiver);

      setPostMatchText("N_" + suf, mod.Message(mod.stringkeys.PostMatchPlayerName, p.player));
      setPostMatchText("S_" + suf, mod.Message(s[0]));
      setPostMatchText("K_" + suf, mod.Message(s[1]));
      setPostMatchText("D_" + suf, mod.Message(s[2]));
      setPostMatchText("A_" + suf, mod.Message(s[3]));
      setPostMatchText("C_" + suf, mod.Message(s[4]));
    }

    // Enemy rows (right) in COLOR_ENEMY for the name column
    const enemyLines = clampLines(enemyList.length);
    for (let i = 0; i < enemyLines; i++) {
      const y = rowStartY + i * rowH;
      const p = enemyList[i];
      const s = p.getScoreboardSnapshot();
      const suf = "R_" + modlib.getTeamId(receiver) + "_" + i;

      addPostMatchText("N_" + suf, rightX - 220, y, 280, 22, 16, COLOR_ENEMY, 1, receiver);
      addPostMatchText("S_" + suf, rightX + 120, y, 90, 22, 16, COLOR_NEUTRAL, 1, receiver);
      addPostMatchText("K_" + suf, rightX + 200, y, 40, 22, 16, COLOR_NEUTRAL, 1, receiver);
      addPostMatchText("D_" + suf, rightX + 245, y, 40, 22, 16, COLOR_NEUTRAL, 1, receiver);
      addPostMatchText("A_" + suf, rightX + 290, y, 40, 22, 16, COLOR_NEUTRAL, 1, receiver);
      addPostMatchText("C_" + suf, rightX + 345, y, 60, 22, 16, COLOR_NEUTRAL, 1, receiver);

      setPostMatchText("N_" + suf, mod.Message(mod.stringkeys.PostMatchPlayerName, p.player));
      setPostMatchText("S_" + suf, mod.Message(s[0]));
      setPostMatchText("K_" + suf, mod.Message(s[1]));
      setPostMatchText("D_" + suf, mod.Message(s[2]));
      setPostMatchText("A_" + suf, mod.Message(s[3]));
      setPostMatchText("C_" + suf, mod.Message(s[4]));
    }
  }

  // Determine result per receiver team
  const t1ResultKey =
    mod.Equals(winner, team1) ? mod.stringkeys.PostMatchVictory :
    mod.Equals(winner, team2) ? mod.stringkeys.PostMatchDefeat :
    mod.stringkeys.PostMatchDraw;

  const t2ResultKey =
    mod.Equals(winner, team2) ? mod.stringkeys.PostMatchVictory :
    mod.Equals(winner, team1) ? mod.stringkeys.PostMatchDefeat :
    mod.stringkeys.PostMatchDraw;

  // Team 1 viewers: left = team1 (friendly), right = team2 (enemy)
  buildForReceiver(team1, t1List, t2List, serverScores[0], serverScores[1], t1ResultKey);

  // Team 2 viewers: left = team2 (friendly), right = team1 (enemy)
  buildForReceiver(team2, t2List, t1List, serverScores[1], serverScores[0], t2ResultKey);
}
function InitializePostmatch(): void {
  phaseTickCount = 0;
  countDown = POSTMATCH_TIME;
  startCorePostmatchResultMusic();
  ResetPostmatchEndState();
  enforceReadyupHqsDisabledOutsidePrematch("InitializePostmatch");
  prematchSwitchLastHandledTickByPlayerId = {};
  prematchSwitchDebounceWarnedByPlayerId = {};
  lastPrematchTeamSwitchTick = -999999;
  lastPrematchTeamSwitchTickByPlayerId = {};
  prematchStabilizationGateWarnedBySwitchTick = {};
  prematchHealthInside889ByPlayerId = {};
  prematchHealthAppliedMaxByPlayerId = {};

  mod.SetUIWidgetVisible(mod.FindUIWidgetWithName("LiveContainer"), false);
  setLiveHudVisibleForAllPlayers(false);
  mod.SetUIWidgetVisible(mod.FindUIWidgetWithName("CountDownContainer"), false);
  mod.SetUIWidgetVisible(mod.FindUIWidgetWithName("PreMatchContainer"), false);
  SetPrematchButtonsVisibleForAllPlayers(false);
  StopAllCaptureTickLoops();
  StopAllEndgameLoops();



  const post = mod.FindUIWidgetWithName("PostMatchContainer");
  if (post) {
    mod.SetUIWidgetVisible(post, true);
    mod.SetUIWidgetDepth(post, mod.UIDepth.AboveGameUI);
    mod.SetUIWidgetSize(post, mod.CreateVector(SCREEN_UI_REFERENCE_WIDTH, SCREEN_UI_REFERENCE_HEIGHT, 0));
  }

  // Unlock players but keep them from interacting/shooting.
  serverPlayers.forEach((p) => {
    mod.EnableAllInputRestrictions(p.player, true);
    mod.EnableInputRestriction(p.player, mod.RestrictedInputs.CameraPitch, false);
    mod.EnableInputRestriction(p.player, mod.RestrictedInputs.CameraYaw, false);
  });

  // Clamp scores for display.
  if (serverScores[0] < 0) serverScores[0] = 0;
  if (serverScores[1] < 0) serverScores[1] = 0;
  syncDisplayedGameModeScores(true);

  BuildPostMatchReportUI();
  playPostMatchResultSfxOnce();


  initialization[4] = true;

}


/* =================================================================================================
   13) GAME MODE LIFECYCLE + MAIN LOOP
================================================================================================= */
// -------------------------------------------------------------------------------------------------
// RUNTIME SAFETY GUARD
// If any unexpected runtime error occurs, keep the mode running and rate-limit logs.
// This prevents "timer frozen / capture logic stopped" failure mode.
// -------------------------------------------------------------------------------------------------

let lastRuntimeErrorTick = -999999;

function LogRuntimeError(tag: string, err: any): void {
  // Rate limit to once per second (prevents spam + performance issues).
  if (serverTickCount - lastRuntimeErrorTick < TICK_RATE) return;
  lastRuntimeErrorTick = serverTickCount;

  mod.DisplayHighlightedWorldLogMessage(
    mod.Message("[RUNTIME ERROR] {}: {}", tag, String(err))
  );
}

function getInitializationFlagSummary(): string {
  let out = "";
  for (let i = 0; i < initialization.length; i++) {
    if (i > 0) out += "/";
    out += initialization[i] ? "1" : "0";
  }
  return out;
}

function warnTransitionRecoveryOnce(key: string, message: any): void {
  if (transitionRecoveryWarnedByKey[key] === true) return;
  transitionRecoveryWarnedByKey[key] = true;
  mod.DisplayHighlightedWorldLogMessage(message);
}

function forceReturnToPrematchFromTransitionFailure(source: string, err?: any): void {
  if (err !== undefined) {
    LogRuntimeError("Transition/" + source, err);
  }

  warnTransitionRecoveryOnce(
    "fallback/" + source,
    mod.Message(
      "[TRANSITION RECOVERY] source/status/inits {}",
      source + "/" + String(gameStatus) + "/" + getInitializationFlagSummary()
    )
  );

  try {
    ReturnToPreMatchAfterRoundReset();
  } catch (fallbackErr) {
    LogRuntimeError("TransitionFallback/" + source, fallbackErr);
  }
}

function EnsureGlobalPrematchHitboxesForPlayer(player: mod.Player): void {
  EnsurePrematchButtonsForPlayer(player);
}

const MAIN_LOOP_INTERVAL_MS = 33;
let mainLoopIntervalHandle: number | undefined = undefined;

function stopMainLoopTimer(): void {
  Timers.clearInterval(mainLoopIntervalHandle);
  mainLoopIntervalHandle = undefined;
}

function startMainLoopTimer(): void {
  stopMainLoopTimer();
  mainLoopIntervalHandle = Timers.setInterval(() => {
    Mode_OngoingGlobal_Inner();
  }, MAIN_LOOP_INTERVAL_MS);
}

export interface KernelLiveTickServiceDelegates {
  combatLiveTick?: () => void;
  objectiveFastLiveTick?: () => void;
  objectiveSlowLiveTick?: () => void;
  spawnRoutingLiveTick?: () => void;
}

const kernelLiveTickServiceDelegates: KernelLiveTickServiceDelegates = {};

export function registerKernelLiveTickServiceDelegates(delegates: KernelLiveTickServiceDelegates): void {
  if (delegates.combatLiveTick) {
    kernelLiveTickServiceDelegates.combatLiveTick = delegates.combatLiveTick;
  }
  if (delegates.objectiveFastLiveTick) {
    kernelLiveTickServiceDelegates.objectiveFastLiveTick = delegates.objectiveFastLiveTick;
  }
  if (delegates.objectiveSlowLiveTick) {
    kernelLiveTickServiceDelegates.objectiveSlowLiveTick = delegates.objectiveSlowLiveTick;
  }
  if (delegates.spawnRoutingLiveTick) {
    kernelLiveTickServiceDelegates.spawnRoutingLiveTick = delegates.spawnRoutingLiveTick;
  }
}

export function kernelGetKothGameStatus(): number {
  return gameStatus;
}

function runLegacyCombatLiveTick(): void {
  if (!ENABLE_DAMAGE_SMOOTHING) return;

  dmgSpreadProcessQueueTick();
  dmgSpreadUpdateHealthCacheTick();
}

function runLegacyObjectiveFastLiveTick(): void {
  // Intentionally empty. Capture state now comes from point-local OngoingCapturePoint events
  // and the 1s watchdog only repairs stale player-on-point bindings.
  return;
}

function runLegacySpawnRoutingLiveTick(): void {
  if (gameStatus !== 3) return;
  if (!hqRoutingDirty) return;
  recomputeLiveHqRouting(false);
}

function runLegacyObjectiveSlowLiveTick(): void {
  ChangeTickets();
  UpdateLiveHudTimerDiagnostics();
}

function flushLiveDirtyState(): void {
  if (captureTickLoopsDirty) {
    UpdateCaptureTickLoopsGlobal();
    captureTickLoopsDirty = false;
    captureLoopDirtyFlushes += 1;
  }

  if (liveHudTopFlagsDirty) {
    flushLiveHudTopFlagLanes();
  }

  if (liveHudScoresDirty) {
    SetUIScores();
    liveHudScoresDirty = false;
    liveHudScoreDirtyFlushes += 1;
  }

  if (scoreboardDirty) {
    UpdateScoreboard();
    scoreboardDirty = false;
    scoreboardDirtyFlushes += 1;
  }
}

function Mode_OnGameModeStarted(): void {
  stopMainLoopTimer();
  stopCoreMusicPlayback();
  resetAllCaptureBuildupState(true);
  kernelKothLiveOverrideEnabled = false;

  gameModeStarted = false;
  gameStatus = -1;
  serverTickCount = 0;
  phaseTickCount = 0;
  countDown = COUNT_DOWN_TIME;
  lastTicketBleedTimeElapsed = 0;
  initialization = [false, false, false, false, false];
  serverScores = [INITIAL_TICKETS, INITIAL_TICKETS];
  lastSyncedGameModeScores = null;
  scoreboardDirty = true;
  liveHudScoresDirty = true;
  captureTickLoopsDirty = true;
  endgameSuspenseDirty = true;
  capturePointReconcileFlushes = 0;
  captureLoopDirtyFlushes = 0;
  scoreboardDirtyFlushes = 0;
  liveHudScoreDirtyFlushes = 0;
  endgameAudioFlushes = 0;
  musicRuntimeHealthy = true;
  musicPackageLoaded = false;
  liveEndgameSuspenseEntered = false;
  postmatchResultMusicActive = false;
  coreEndgameWinningTeam = teamNeutral;
  coreStartMusicTriggeredThisRound = false;
  preliveMusicRetryAttemptsRemaining = 0;
  preliveMusicRetryNextTick = 0;
  preliveRoundStartVoPlayedThisRound = false;

  mod.SetGameModeTimeLimit(60000);
  mod.SetGameModeTargetScore(mod.Ceiling(INITIAL_TICKETS) + 1);
  syncDisplayedGameModeScores(true);

  SetDepthAboveGameUI("PreMatchContainer");

  ensureAudioSpawned();
  ensureMusicPackageLoaded();
  ResetPostmatchEndState();
  postmatchResultSfxPlayed = false;
  objectiveHighlightUseLiteralFallback = false;
  objectiveHighlightHealthChecked = false;
  objectiveHighlightKeyHealthWarned = false;
  evaluateObjectiveHighlightStringKeyHealth();
  validateReservedSpawnIsolationFromConfigOnce();
  prematchHealthInside889ByPlayerId = {};
  prematchHealthAppliedMaxByPlayerId = {};
  resetAllSpawnRoutingState();
  resetPreliveClusterTeleportState();
  resetAllLiveHudState();

  gameStatus = 0;
  serverTickCount = 0;
  phaseTickCount = 0;
  gameModeStarted = true;

  ConfigurePreMatchSpawns();

  for (let i = 0; i < fireVfx.length; i++) {
    mod.EnableVFX(fireVfx[i], true);
  }

  SafeSetWidgetVisibleByName("PreMatchContainer", true);
  BuildPrematchRosterUI();
  UpdatePrematchRosterUI();
  applyPrematch889HealthForAllPlayers();

  startMainLoopTimer();
}

function Mode_OnGameModeEnding(): void {
  stopMainLoopTimer();
  stopCoreMusicPlayback();
  resetAllCaptureBuildupState(true);
  kernelKothLiveOverrideEnabled = false;
  gameModeStarted = false;
  gameStatus = -1;
  serverTickCount = 0;
  phaseTickCount = 0;
  countDown = COUNT_DOWN_TIME;
  lastTicketBleedTimeElapsed = 0;
  initialization = [false, false, false, false, false];
  serverScores = [INITIAL_TICKETS, INITIAL_TICKETS];
  lastSyncedGameModeScores = null;
  scoreboardDirty = true;
  liveHudScoresDirty = true;
  captureTickLoopsDirty = true;
  endgameSuspenseDirty = true;
  coreStartMusicTriggeredThisRound = false;
  ResetPostmatchEndState();
  postmatchResultSfxPlayed = false;
  resetAllSpawnRoutingState();
  resetPreliveClusterTeleportState();
  resetAllLiveHudState();
  normalizeAllPlayersToStandardHealthAndClearPrematch889State();
}

function Mode_OngoingGlobal(): void {
  // Intentionally lightweight. Main loop logic runs through Timers.
  return;
}

function Mode_OngoingGlobal_Inner(): void {
  if (!gameModeStarted) return;

  serverTickCount += 1;
  phaseTickCount += 1;
  if (gameStatus >= 0 && gameStatus <= 2) {
    drainLiveHudPrebuildQueue(LIVE_HUD_PREBUILD_PLAYERS_PER_TICK, true);
  }
  if (gameStatus !== 0 && mod.Modulo(phaseTickCount, TICK_RATE) === 0) {
    enforceReadyupHqsDisabledOutsidePrematch("OngoingGlobal_Inner_periodic");
  }

  if (gameStatus === 0) {
    if (!initialization[0]) InitializePreMatch();

    let readyPlayers: number[] = [0, 0];
    let totalPlayers: number[] = [0, 0];
    let humanParticipantPlayers = 0;
    let humanExcludedPlayers = 0;

  serverPlayers.forEach((p) => {
      p.setTeam();
      if (isBotBackfillPlayer(p.player)) return;
      if (isExcludedPlayer(p.player)) {
        humanExcludedPlayers += 1;
        return;
      }

      const team = mod.GetTeam(p.player);

      if (mod.Equals(team, team1)) {
        humanParticipantPlayers += 1;
        totalPlayers[0] += 1;
        if (p.isReady()) readyPlayers[0] += 1;
      } else if (mod.Equals(team, team2)) {
        humanParticipantPlayers += 1;
        totalPlayers[1] += 1;
        if (p.isReady()) readyPlayers[1] += 1;
      }
    });

    SafeSetTextLabelByName("PreMatchTeam1", mod.Message(mod.stringkeys.PreMatchTeam1, readyPlayers[0], totalPlayers[0]));
    SafeSetTextLabelByName("PreMatchTeam2", mod.Message(mod.stringkeys.PreMatchTeam2, readyPlayers[1], totalPlayers[1]));

    const allReady =
      readyPlayers[0] === totalPlayers[0] &&
      readyPlayers[1] === totalPlayers[1] &&
      (humanParticipantPlayers > 0 || humanExcludedPlayers > 0);
    const switchElapsedTicks = serverTickCount - lastPrematchTeamSwitchTick;
    const teamSwitchStabilized = switchElapsedTicks >= PRELIVE_TEAM_SWITCH_STABILIZE_TICKS;

    if (allReady) {
      if (!teamSwitchStabilized) {
        warnPrematchStabilizationGateBlockedOnce(readyPlayers, totalPlayers, switchElapsedTicks);
      } else {
        normalizeAllPlayersToStandardHealthAndClearPrematch889State();
        initialization[1] = false;
        initialization[2] = false;
        initialization[3] = false;
        gameStatus = 2;
      }
    }
  } else if (gameStatus === 1) {
    if (!initialization[1]) {
      try {
        InitializeCountDown();
      } catch (err) {
        LogRuntimeError("InitializeCountDown", err);
        initialization[1] = false;
      }
      if (!initialization[1]) {
        forceReturnToPrematchFromTransitionFailure("InitializeCountDown");
        return;
      }
    }

    if (mod.Modulo(phaseTickCount, TICK_RATE) === 0) {
      countDown -= 1;

      playCountdownHeartbeatToAll(0.6);
      SafeSetTextLabelByName("CountDownText", mod.Message(countDown));
      forceAutoDeployToInitialHqDuringCountdown();

      if (countDown <= 0) {
        SafeSetTextLabelByName("CountDownText", mod.Message(0));
        gameStatus = 2;
      }
    }
  } else if (gameStatus === 2) {
    if (!initialization[2]) {
      try {
        InitializePreLive();
      } catch (err) {
        LogRuntimeError("InitializePreLive", err);
        initialization[2] = false;
      }
      if (!initialization[2]) {
        forceReturnToPrematchFromTransitionFailure("InitializePreLive");
      }
      return;
    }

    maybeRetryPreliveMusicStart();

    if (mod.Modulo(phaseTickCount, TICK_RATE) === 0) {
      countDown -= 1;
      const vol = countDown <= 3 ? 0.85 : 0.6;
      playCountdownHeartbeatToAll(vol);
      SafeSetTextLabelByName("CountDownText", mod.Message(countDown < 0 ? 0 : countDown));
      if (countDown === PRELIVE_ROUNDSTART_VO_COUNTDOWN_SECONDS) {
        playPreliveRoundStartVoToTeams();
      }
      if (countDown <= 0) {
        SafeSetTextLabelByName("CountDownText", mod.Message(0));
        SafeSetWidgetVisibleByName("CountDownContainer", false);
        playMatchStartStingerToAll(1.0);
        void showMatchStartBannerOnce();
        initialization[3] = false;
        gameStatus = 3;
      }
    }
  } else if (gameStatus === 3) {
    if (kernelKothLiveOverrideEnabled) {
      SafeSetWidgetVisibleByName("LiveContainer", false);
      setLiveHudVisibleForAllPlayers(false);

      if (!initialization[3]) {
        initialization[3] = true;
        SafeSetWidgetVisibleByName("CountDownContainer", false);
        SafeSetWidgetVisibleByName("PreMatchContainer", false);
        serverPlayers.forEach((p) => {
          if (p && mod.IsPlayerValid(p.player)) {
            mod.EnableAllInputRestrictions(p.player, false);
            mod.EnableInputRestriction(p.player, mod.RestrictedInputs.FireWeapon, false);
            mod.EnableInputRestriction(p.player, mod.RestrictedInputs.Interact, false);
          }
        });
      }

      if (mod.Modulo(phaseTickCount, DAMAGE_INTERVAL_TICKS) === 0) {
        serverPlayers.forEach((p) => {
          if (playerInDamageZone[p.id] === true && p.isDeployed && kernelIsPlayerAlive(p.player)) {
            mod.DealDamage(p.player, DAMAGE_PER_PULSE);
          }
        });
      }
      return;
    }

    if (!initialization[3]) {
      InitializeLive();
      return;
    }

    if (kernelLiveTickServiceDelegates.combatLiveTick) {
      kernelLiveTickServiceDelegates.combatLiveTick();
    } else {
      runLegacyCombatLiveTick();
    }

    processLiveSafeSpawnQueues();

    updateLiveActiveCaptureBarsSmoothly();

    if (mod.Modulo(phaseTickCount, LIVE_FAST_UPDATE_INTERVAL_TICKS) === 0) {
      if (kernelLiveTickServiceDelegates.objectiveFastLiveTick) {
        kernelLiveTickServiceDelegates.objectiveFastLiveTick();
      } else {
        runLegacyObjectiveFastLiveTick();
      }

      if (kernelLiveTickServiceDelegates.spawnRoutingLiveTick) {
        kernelLiveTickServiceDelegates.spawnRoutingLiveTick();
      } else {
        runLegacySpawnRoutingLiveTick();
      }
    }

    if (mod.Modulo(phaseTickCount, LIVE_CAPTURE_WATCHDOG_INTERVAL_TICKS) === 0) {
      runCapturePointWatchdogSync();
    }

    if (mod.Modulo(phaseTickCount, LIVE_UI_CLOCK_INTERVAL_TICKS) === 0) {
      SetUITime();
    }

    const shouldRunDirtyEndgameAudio =
      endgameSuspenseDirty && mod.Modulo(phaseTickCount, LIVE_ENDGAME_AUDIO_INTERVAL_TICKS) === 0;
    const shouldRunEndgameWatchdog = mod.Modulo(phaseTickCount, TICK_RATE) === 0;
    if (shouldRunDirtyEndgameAudio || shouldRunEndgameWatchdog) {
      UpdateEndgameSuspenseAudio();
    }

    if (mod.Modulo(phaseTickCount, LIVE_SLOW_UPDATE_INTERVAL_TICKS) === 0) {
      if (kernelLiveTickServiceDelegates.objectiveSlowLiveTick) {
        kernelLiveTickServiceDelegates.objectiveSlowLiveTick();
      } else {
        runLegacyObjectiveSlowLiveTick();
      }
    }

    flushLiveDirtyState();
    maybeEmitLivePerformanceDiagnostics();

    if (mod.GetMatchTimeRemaining() <= 0) gameStatus = 4;

    if (serverScores[0] <= 0 || serverScores[1] <= 0) {
      gameStatus = 4;
      SafeSetWidgetVisibleByName("LiveContainer", false);
      setLiveHudVisibleForAllPlayers(false);
    }

    if (mod.Modulo(phaseTickCount, DAMAGE_INTERVAL_TICKS) === 0) {
      serverPlayers.forEach((p) => {
        if (playerInDamageZone[p.id] === true && p.isDeployed && kernelIsPlayerAlive(p.player)) {
          mod.DealDamage(p.player, DAMAGE_PER_PULSE);
        }
      });
    }
  } else if (gameStatus === 4) {
    if (!initialization[4]) InitializePostmatch();
    if (postmatchEndStep !== POSTMATCH_END_STEP_IDLE) {
      if (serverTickCount - postmatchEndStepTick < POSTMATCH_END_STEP_ADVANCE_TICKS) {
        return;
      }

      if (postmatchEndStep === POSTMATCH_END_STEP_UNDEPLOY_ALL_PLAYERS) {
        mod.UndeployAllPlayers();
        postmatchEndStep = POSTMATCH_END_STEP_END_GAMEMODE;
        postmatchEndStepTick = serverTickCount;
        return;
      }

      if (postmatchEndStep === POSTMATCH_END_STEP_END_GAMEMODE) {
        mod.EndGameMode(postmatchWinnerTeam);
        postmatchEndStep = POSTMATCH_END_STEP_COMPLETE;
        postmatchEndStepTick = serverTickCount;
        return;
      }

      return;
    }

    if (mod.Modulo(phaseTickCount, TICK_RATE) === 0) {
      countDown -= 1;
      if (countDown === 0) {
        SafeSetWidgetVisibleByName("PostMatchContainer", false);
        postmatchWinnerTeam = getWinningTeam();
        postmatchEndStep = POSTMATCH_END_STEP_UNDEPLOY_ALL_PLAYERS;
        postmatchEndStepTick = serverTickCount;
        return;
      }
    }
  } else {
    return;
  }

  /* Always enforce no-fire during countdown/prelive (engine can clear on redeploy) */
  if (gameStatus === 1 || gameStatus === 2) {
    if (mod.Modulo(serverTickCount, TICK_RATE) === 0) {
      serverPlayers.forEach((p) => {
        if (p && mod.IsPlayerValid(p.player)) {
          mod.EnableInputRestriction(p.player, mod.RestrictedInputs.FireWeapon, true);
        }
      });
    }
  }

  if (serverTickCount === 10000000) serverTickCount = 137;
}

/* =================================================================================================
   14) PLAYER EVENTS (JOIN / LEAVE / DEPLOY / UNDEPLOY / INTERACT)
================================================================================================= */

function findServerPlayerByObjId(playerObjId: number): Player | undefined {
  let found: Player | undefined = undefined;
  serverPlayers.forEach((sp) => {
    if (sp && mod.GetObjId(sp.player) === playerObjId) found = sp;
  });
  return found;
}

function emitJoinWorldLogIfEnabled(playerId: number, message: mod.Message): void {
  if (!DEBUG_WORLD_LOG_JOIN_EVENTS) return;

  const lastTick = joinWorldLogLastTickByPlayerId[playerId] ?? -999999;
  if (serverTickCount - lastTick < JOIN_WORLD_LOG_THROTTLE_TICKS) return;

  joinWorldLogLastTickByPlayerId[playerId] = serverTickCount;
  mod.DisplayHighlightedWorldLogMessage(message);
}

function Mode_OnPlayerJoinGame(eventPlayer: mod.Player): void {
  let player: Player | undefined;

  const joiningId = modlib.getPlayerId(eventPlayer);
  resetTransientSpawnRoutingStateForPlayer(joiningId);

  const existing = serverPlayers.get(joiningId);
  if (existing) {
    existing.player = eventPlayer;
    player = existing;
  } else {
    for (let i = 0; i < disconnectedPlayers.length; i++) {
      const p = disconnectedPlayers[i];
      if (p.id === joiningId) {
        p.player = eventPlayer;
        p.setTeam();
        serverPlayers.set(p.id, p);
        emitJoinWorldLogIfEnabled(
          p.id,
          mod.Message(mod.stringkeys.PlayerReconnected, eventPlayer, p.id)
        );
        disconnectedPlayers.splice(i, 1);
        player = p;
        break;
      }
    }

    if (!player) {
      const newPlayer = new Player(eventPlayer);
      serverPlayers.set(newPlayer.id, newPlayer);
      emitJoinWorldLogIfEnabled(
        newPlayer.id,
        mod.Message(mod.stringkeys.PlayerJoined, newPlayer.player, newPlayer.id)
      );
      player = newPlayer;
    }
  }

  if (player && !isExcludedPlayer(player.player)) {
    buildRestrictedAreaUiForPlayer(player);
  }
  if (prematchHealthInside889ByPlayerId[joiningId] === undefined) {
    prematchHealthInside889ByPlayerId[joiningId] = false;
  }
  delete prematchHealthAppliedMaxByPlayerId[joiningId];
  if (gameStatus === 0) {
    applyPrematch889HealthForPlayer(joiningId);
  }

  applyPhaseInputRestrictionsForPlayer(eventPlayer);

  if (isExcludedPlayer(eventPlayer)) {
    if (gameStatus === 0 || gameStatus === -1) {
      BuildPrematchRosterUI();
      UpdatePrematchRosterUI();
    } else {
      SetPrematchButtonsVisibleForPlayer(eventPlayer, false);
    }
    return;
  }

  if (gameStatus === 1) {
    stripLoadoutToMeleeOnly(eventPlayer);
  }

  if (gameStatus === 0 || gameStatus === -1) {
    queueLiveHudPrebuildForPlayer(player);
    if (player) replacePrematchReadyText(player.id, eventPlayer);
    BuildPrematchRosterUI();
    UpdatePrematchRosterUI();
  } else if (gameStatus === 1 || gameStatus === 2) {
    queueLiveHudPrebuildForPlayer(player);
  } else if (gameStatus === 3) {
    SafeSetWidgetVisibleByName("PreMatchContainer", false);
    if (kernelKothLiveOverrideEnabled) {
      SafeSetWidgetVisibleByName("LiveContainer", false);
      if (player) setLiveHudVisibleForPlayer(player, false);
      return;
    }

    SafeSetWidgetVisibleByName("LiveContainer", true);
    HideSharedTicketBarFills();
    if (player && initialization[3]) player.addUI();
  }
}

function Mode_OnPlayerLeaveGame(eventNumber: number): void {
  let leaving: Player | undefined = findServerPlayerByObjId(eventNumber);
  if (!leaving) leaving = serverPlayers.get(eventNumber);

  if (!leaving) return;
  const leavingWasExcluded = isExcludedPlayer(leaving.player);
  cleanupRestrictedAreaUiForPlayer(leaving.id);
  clearPrematch889StateForPlayer(leaving.id);
  resetSpawnRoutingStateForPlayer(leaving.id);
  delete prelivePendingAnchorByPlayerId[leaving.id];
  delete preliveTeleportedPlayerById[leaving.id];
  releaseLiveHudSlotForPlayer(leaving.id);
  stopCaptureBuildupForPlayer(leaving.id);



  emitJoinWorldLogIfEnabled(leaving.id, mod.Message(mod.stringkeys.PlayerDisconnected, leaving.id));
  disconnectedPlayers.push(leaving);
  serverPlayers.delete(leaving.id);
  invalidateLivePlayerSpatialHash();

  if (gameStatus === 3 && !leavingWasExcluded) {
    leaving.addDeath();

    const cpId = leaving.getCapturePoint();
    if (cpId !== null) {
      const capturePoint = serverCapturePoints[cpId];
      if (capturePoint) {
        capturePoint.removeOnPoint(leaving.id);
        invalidateCaptureBuildupSessionForCp(capturePoint.id);
        markCapturePointTopFlagLaneDirty(capturePoint);
      }
      stopCaptureBuildupForPlayer(leaving.id);
      leaving.setCapturePoint(null);
      leaving.resetActiveCaptureProgressUi();
      syncLiveHudTopFlagBlinkTimer();
      refreshLiveHqRoutingFromObjectiveEvent();
      markCaptureTickLoopsDirty();
    }
  }

  if (gameStatus === 0) UpdatePrematchRosterUI();
}

async function Mode_OnPlayerDeployed(eventPlayer: mod.Player): Promise<void> {
  const playerId = modlib.getPlayerId(eventPlayer);
  const team = mod.GetTeam(eventPlayer);

  if (isExcludedPlayer(eventPlayer) || (!mod.Equals(team, team1) && !mod.Equals(team, team2))) {
    return;
  }

  applyPhaseInputRestrictionsForPlayer(eventPlayer);
  // Reset damage spacing state on deploy
  dmgSpreadClearForPlayer(eventPlayer);
  clearSafeSpawnCheckTimer(playerId);
  clearSafeSpawnRetryTimer(playerId);
  clearSquadSpawnBypassTimer(playerId);
  bumpSafeSpawnGeneration(playerId);
  squadSpawnBypass[playerId] = false;

  if (gameStatus === 0 || gameStatus === 1) {
    const pPreMatchOrCountdown = serverPlayers.get(playerId);
    if (pPreMatchOrCountdown) pPreMatchOrCountdown.isDeployed = true;
    applyPrematch889HealthForPlayer(playerId);
    if (gameStatus === 0) {
      BuildPrematchRosterUI();
      UpdatePrematchRosterUI();
    }
    if (gameStatus === 1) stripLoadoutToMeleeOnly(eventPlayer);
    return;
  }

  if (gameStatus === 2) {
    const pPre = serverPlayers.get(playerId);
    if (pPre) {
      pPre.isDeployed = true;
      teleportPlayerToPrelivePendingAnchor(pPre);
    }
    applyPrematch889HealthForPlayer(playerId);
    return;
  }

  if (gameStatus !== 3) return;

  const p = serverPlayers.get(playerId);
  if (!p) return;

  p.isDeployed = true;
  invalidateLivePlayerSpatialHash();
  applyPrematch889HealthForPlayer(playerId);
  applyPhaseInputRestrictionsForPlayer(eventPlayer);
  p.addUI();
  markCaptureTickLoopsDirty();

  const enteringForcedSafeSpawnFlow = safeSpawnForcedUndeploy[playerId] === true;

  // If we spawned near ANY friendly player (<= 8m), do not allow safe-spawn recycling.
  if (isSpawnNearFriendlyPlayer(eventPlayer, playerId, FRIENDLY_SPAWN_BYPASS_RADIUS_METERS)) {
    safeSpawnForcedRedeploys[playerId] = 0;
    if (!enteringForcedSafeSpawnFlow) {
      safeSpawnForcedUndeploy[playerId] = false;
      safeSpawnUnsafePending[playerId] = false;
    }
  }

  // --- SQUAD SPAWN HARD BYPASS (within 8m) ---
  // If the player spawned close to a living squadmate, we do NOT want safe-spawn recycling at all.
  const squadSpawnNow = checkIfSpawnedOnSquadmate(eventPlayer);
  if (squadSpawnNow) {
    squadSpawnBypass[playerId] = true;
    scheduleSquadSpawnBypassClear(playerId);

    // Reset forced redeploy counter so a squad spawn doesn't inherit prior "unsafe" history.
    safeSpawnForcedRedeploys[playerId] = 0;
    if (!enteringForcedSafeSpawnFlow) {
      safeSpawnForcedUndeploy[playerId] = false;
      safeSpawnUnsafePending[playerId] = false;
    }
  } else {
    squadSpawnBypass[playerId] = false;
  }

  mod.SetRedeployTime(eventPlayer, REDEPLOY_TIME);

  const wasForced = enteringForcedSafeSpawnFlow;

  // IMPORTANT: Do NOT overwrite the player's HQ routing while we are in a forced safe-spawn recycle.
  // We only "commit" the route after the safe-spawn check succeeds.
  if (!wasForced && safeSpawnUnsafePending[playerId] !== true) {
    const dyn = modlib.Equals(team, team1) ? currentDynamicHqTeam1 : currentDynamicHqTeam2;
    if (dyn && isValidDynamicSpawnId(dyn)) {
      pendingDynamicHqForPlayer[playerId] = dyn;
    }
  }


  const isFirstLiveDeploy = p.isFirstDeploy();
  const t1DisplayedBefore = getDisplayedTeamTickets(team1);
  const t2DisplayedBefore = getDisplayedTeamTickets(team2);
  if (!wasForced && !isFirstLiveDeploy) {
    if (modlib.Equals(team, team1)) serverScores[0] += DEATH_TICKET_LOSS;
    else serverScores[1] += DEATH_TICKET_LOSS;
  }
  ClampTicketsAndMaybeEndMatch();
  const t1DisplayedAfter = getDisplayedTeamTickets(team1);
  const t2DisplayedAfter = getDisplayedTeamTickets(team2);
  if (t1DisplayedAfter !== t1DisplayedBefore || t2DisplayedAfter !== t2DisplayedBefore) {
    markLiveHudScoresDirty();
    markEndgameSuspenseDirty();
  }

  SafeSpawnCheckOrRedeploy(playerId);
}

async function Mode_OnPlayerUndeploy(eventPlayer: mod.Player): Promise<void> {
  const id = modlib.getPlayerId(eventPlayer);
  const p = serverPlayers.get(id);
  if (!p) return;
  const capturePointBeforeUndeploy = p.getCapturePoint();
  const isForcedSafeSpawnFlowAtUndeploy = safeSpawnUnsafePending[id] === true || safeSpawnForcedUndeploy[id] === true;

  prematchHealthInside889ByPlayerId[id] = false;
  delete prematchHealthAppliedMaxByPlayerId[id];

   // Reset damage spacing state on undeploy
  dmgSpreadClearForPlayer(eventPlayer);

  p.isDeployed = false;
  invalidateLivePlayerSpatialHash();
  stopCaptureBuildupForPlayer(id);
  p.setCapturePoint(null);
  p.resetActiveCaptureProgressUi();
  if (p.activeFlagContainerWidget) {
    mod.SetUIWidgetVisible(p.activeFlagContainerWidget, false);
  }
  clearRestrictedAreaStateForPlayer(id, p.player);
  clearSafeSpawnCheckTimer(id);
  if (!isForcedSafeSpawnFlowAtUndeploy) {
    bumpSafeSpawnGeneration(id);
    clearSafeSpawnRetryTimer(id);
  }
  clearSquadSpawnBypassTimer(id);
  if (isExcludedPlayer(eventPlayer)) {
    ForceRemovePlayerFromAllCapturePoints(id);
    stopCaptureTickLoop(id);
    markCaptureTickLoopsDirty();
    return;
  }
  

  // Legacy countdown auto-spawn keeps the old tablet suppression path before pre-live exists.
  if (gameStatus === 1) {
    const spawnerObjId = getInitialSpawnPointObjIdForTeam(mod.GetTeam(eventPlayer));
    if (spawnerObjId) {
      mod.SetRedeployTime(eventPlayer, 0);
      mod.SpawnPlayerFromSpawnPoint(eventPlayer, spawnerObjId);
    }
    return;
  }

  if (gameStatus === 2) {
    queuePreliveAnchorForPlayer(p);
    delete preliveTeleportedPlayerById[id];
    mod.SetRedeployTime(eventPlayer, 0);
    return;
  }

  if (gameStatus === 3) {
    if (capturePointBeforeUndeploy !== null) {
      const cp = serverCapturePoints[capturePointBeforeUndeploy];
      if (cp) invalidateCaptureBuildupSessionForCp(cp.id);
    }
    ForceRemovePlayerFromAllCapturePoints(id);
    stopCaptureTickLoop(id);
    markCaptureTickLoopsDirty();

    if (!isForcedSafeSpawnFlowAtUndeploy) {
      markHqRoutingDirty();

      const team = mod.GetTeam(eventPlayer);
      const dyn = mod.Equals(team, team1) ? currentDynamicHqTeam1 : currentDynamicHqTeam2;
      if (dyn && isValidDynamicSpawnId(dyn)) {
        pendingDynamicHqForPlayer[id] = dyn;
      }
    }
  }

  if (safeSpawnUnsafePending[id] === true) {
    safeSpawnUnsafePending[id] = false;
    safeSpawnUnsafeSpawnerObjId[id] = 0;
    return;
  }

  if (safeSpawnForcedUndeploy[id] === true) return;
  if (gameStatus === 2) return;

  if (gameStatus === 3) p.addDeath();
}

function Mode_OnPlayerInteract(eventPlayer: mod.Player, eventInteractPoint: mod.InteractPoint): void {
  if (isExcludedPlayer(eventPlayer)) return;

  const ipId = mod.GetObjId(eventInteractPoint);

  if (gameStatus === 0) {
    if (ipId === IP_T1_SWITCH || ipId === IP_T2_SWITCH) {
      HandlePrematchSwitchTeams(eventPlayer);
    }

    if (ipId === IP_T1_READY || ipId === IP_T2_READY) {
      HandlePrematchReadyUp(eventPlayer);
    }

    return;
  }

  if (gameStatus === 3) {
    if (ipId === IP_T1_SWITCH || ipId === IP_T2_SWITCH) {
      mod.UndeployPlayer(eventPlayer);

      const p = serverPlayers.get(modlib.getPlayerId(eventPlayer));
      const currentTeam = mod.GetTeam(eventPlayer);

      if (modlib.getTeamId(currentTeam) === 1) {
        mod.SetTeam(eventPlayer, team2);
        p?.setTeam();
      } else {
        mod.SetTeam(eventPlayer, team1);
        p?.setTeam();
      }
    }
  }
}

/* =================================================================================================
   15) CAPTURE EVENTS (ENTER/EXIT / CAPTURED / LOST / CAPTURING)
================================================================================================= */
function SyncPlayersOnPointsFromEngine(): boolean {
  if (gameStatus !== 3) return false;
  let changed = false;

  // --- Reused caches (declare these once at module scope if you haven't yet) ---
  // let _syncStamp = 0;
  // const _seenThisSync: { [playerId: number]: number } = {};
  // const _tmpPlayerToCpId: { [playerId: number]: number } = {};
  // const _tmpPlayerToCpIdKeys: number[] = [];
  // function _tmpPlayerToCpIdSet(playerId: number, cpId: number): void { ... }
  // function _tmpPlayerToCpIdClear(): void { ... }

  _syncStamp += 1;

  // Overwrite each CP's _onPoint list with engine truth (no per-call arrays).
  // Also build a temp player->cpId mapping without allocating a new object.
  for (const k in serverCapturePoints) {
    const cp = serverCapturePoints[k];
    if (!cp) continue;

    cp.clearOnPoint();

    const arr = mod.GetPlayersOnPoint(cp.resolveHandle());

    for (let i = 0; i < mod.CountOf(arr); i++) {
      const pl = mod.ValueInArray(arr, i) as mod.Player;
      if (!mod.IsPlayerValid(pl)) continue;
      if (!kernelIsPlayerAlive(pl)) continue;

      const pid = modlib.getPlayerId(pl);
      const sp = serverPlayers.get(pid);
      if (!sp) continue;
      if (!sp.isDeployed) continue;

      // De-dupe without allocating freshIds or doing indexOf scans
      if (_seenThisSync[pid] === _syncStamp) continue;
      _seenThisSync[pid] = _syncStamp;

      // Add to this CP's on-point list (reuses same array backing store)
      (cp as any)._onPoint.push(pid);

      // Record mapping (reused cache, cleared cheaply later)
      _tmpPlayerToCpIdSet(pid, cp.id);
    }
  }

  // Ensure each player's capture UI state matches engine truth.
  serverPlayers.forEach((sp) => {
    if (!sp) return;

    const newCpId = _tmpPlayerToCpId[sp.id]; // undefined if not on any point
    const oldPointId = sp.getCapturePoint();

    if (newCpId === undefined) {
      if (oldPointId !== null) {
        changed = true;
        invalidateCaptureBuildupSessionForCp(oldPointId);
        stopCaptureBuildupForPlayer(sp.id);
        sp.setCapturePoint(null);
        sp.resetActiveCaptureProgressUi();
        if (sp.activeFlagContainerWidget) mod.SetUIWidgetVisible(sp.activeFlagContainerWidget, false);
        stopCaptureTickLoop(sp.id);
      }
      return;
    }

    const cpWrap = serverCapturePoints[newCpId];
    if (!cpWrap) return;

    if (oldPointId === null || oldPointId !== newCpId) {
      changed = true;
      if (oldPointId !== null) invalidateCaptureBuildupSessionForCp(oldPointId);
      stopCaptureBuildupForPlayer(sp.id);
      sp.setCapturePoint(newCpId);

      if (sp.activeFlagWidget) mod.SetUITextLabel(sp.activeFlagWidget, mod.Message(cpWrap.symbol));
      if (sp.activeFlagContainerWidget) mod.SetUIWidgetVisible(sp.activeFlagContainerWidget, true);
    } else {
      if (sp.activeFlagContainerWidget) mod.SetUIWidgetVisible(sp.activeFlagContainerWidget, true);
    }
  });

  // Clear only keys we set this sync (no new object alloc)
  _tmpPlayerToCpIdClear();
  return changed;
}

function runCapturePointWatchdogSync(): void {
  if (gameStatus !== 3) return;

  const presenceChanged = SyncPlayersOnPointsFromEngine();
  capturePointReconcileFlushes += 1;

  if (!presenceChanged) return;

  Object.values(serverCapturePoints).forEach((cp) => {
    cp.updateUIforPlayersOnPoint();
    cp.setUIProgressForPlayersOnPoint();
  });

  markCaptureTickLoopsDirty();
}






function ForceRemovePlayerFromAllCapturePoints(playerId: number): void {
  stopCaptureTickLoop(playerId);
  stopCaptureBuildupForPlayer(playerId);
  const changedCapturePointIds: number[] = [];

  // Remove from all tracked capture points.
  Object.values(serverCapturePoints).forEach((cp) => {
    if (cp.getPlayerIdsOnPoint().indexOf(playerId) >= 0) changedCapturePointIds.push(cp.id);
    cp.removeOnPoint(playerId);
  });

  for (let i = 0; i < changedCapturePointIds.length; i++) {
    invalidateCaptureBuildupSessionForCp(changedCapturePointIds[i]);
    const capturePoint = serverCapturePoints[changedCapturePointIds[i]];
    if (capturePoint) markCapturePointTopFlagLaneDirty(capturePoint);
  }

  // Clear their local capture UI state if they are still known on server.
  const p = serverPlayers.get(playerId);
  if (p) {
    p.setCapturePoint(null);
    p.resetActiveCaptureProgressUi();
    if (p.activeFlagContainerWidget) mod.SetUIWidgetVisible(p.activeFlagContainerWidget, false);
  }

  // Refresh UI for everyone still on points.
  Object.values(serverCapturePoints).forEach((cp) => cp.updateUIforPlayersOnPoint());
  syncLiveHudTopFlagBlinkTimer();
  markCaptureTickLoopsDirty();
}

function logObjectiveStringKeyDiag(message: string): void {
  if (!DEBUG_OBJECTIVE_STRINGKEY_DIAG) return;
  console.log(message);
}

function evaluateObjectiveHighlightStringKeyHealth(): void {
  if (objectiveHighlightHealthChecked) return;
  objectiveHighlightHealthChecked = true;

  const sk: any = mod.stringkeys as any;
  const requiredKeys = [
    sk.ObjectiveCapturing,
    sk.ObjectiveCapturingEnemy,
    sk.ObjectiveCaptured,
    sk.ObjectiveCapturedEnemy,
    sk.ObjectiveNeutralizing,
    sk.ObjectiveNeutralizingEnemy,
    sk.ObjectiveNeutralised,
    sk.ObjectiveLost,
  ];
  const joinKeys = [sk.PlayerJoined, sk.PlayerReconnected, sk.PlayerDisconnected];

  let valid = true;
  let reason = "ok";

  for (let i = 0; i < requiredKeys.length; i++) {
    const k = requiredKeys[i];
    if (k === undefined || k === null) {
      valid = false;
      reason = "missing_required_key_" + String(i);
      break;
    }
  }

  if (valid) {
    for (let i = 0; i < requiredKeys.length; i++) {
      for (let j = i + 1; j < requiredKeys.length; j++) {
        if (requiredKeys[i] === requiredKeys[j]) {
          valid = false;
          reason = "required_pair_collision_" + String(i) + "_" + String(j);
          break;
        }
      }
      if (!valid) break;
    }
  }

  if (valid) {
    for (let i = 0; i < requiredKeys.length; i++) {
      for (let j = 0; j < joinKeys.length; j++) {
        const jk = joinKeys[j];
        if (jk === undefined || jk === null) continue;
        if (requiredKeys[i] === jk) {
          valid = false;
          reason = "join_collision_req_" + String(i) + "_join_" + String(j);
          break;
        }
      }
      if (!valid) break;
    }
  }

  objectiveHighlightUseLiteralFallback = !valid;

  logObjectiveStringKeyDiag(
    "[OBJECTIVE STRINGKEY DIAG] valid/fallback/reason " +
      (valid ? "1" : "0") +
      "/" +
      (objectiveHighlightUseLiteralFallback ? "1" : "0") +
      "/" +
      reason
  );

  if (!valid && !objectiveHighlightKeyHealthWarned) {
    objectiveHighlightKeyHealthWarned = true;
    console.log("[OBJECTIVE HIGHLIGHT] key health invalid, enabling literal fallback (" + reason + ")");
  }
}

function warnObjectiveHighlightMissingKeyOnce(context: string): void {
  if (objectiveHighlightWarnedMissingKeyByContext[context] === true) return;
  objectiveHighlightWarnedMissingKeyByContext[context] = true;
  console.log("[OBJECTIVE HIGHLIGHT] missing string key for context " + context);
}

function warnObjectiveHighlightMissingSymbolOnce(context: string): void {
  if (objectiveHighlightWarnedMissingSymbolByContext[context] === true) return;
  objectiveHighlightWarnedMissingSymbolByContext[context] = true;
  console.log("[OBJECTIVE HIGHLIGHT] missing objective symbol for context " + context);
}

function warnObjectiveHighlightBuildFailureOnce(context: string): void {
  if (objectiveHighlightWarnedBuildFailureByContext[context] === true) return;
  objectiveHighlightWarnedBuildFailureByContext[context] = true;
  console.log("[OBJECTIVE HIGHLIGHT] failed to build message for context " + context);
}

function buildObjectiveHighlightMessage(
  key: any,
  fallbackTemplate: string,
  symbol: string,
  context: string
): mod.Message | undefined {
  if (typeof symbol !== "string" || symbol.length === 0) {
    warnObjectiveHighlightMissingSymbolOnce(context);
    return;
  }

  evaluateObjectiveHighlightStringKeyHealth();

  if (objectiveHighlightUseLiteralFallback === true) {
    try {
      return mod.Message(fallbackTemplate, symbol);
    } catch (_err) {
      warnObjectiveHighlightBuildFailureOnce(context + "/literal");
      return undefined;
    }
  }

  if (key === undefined || key === null) {
    warnObjectiveHighlightMissingKeyOnce(context);
    try {
      return mod.Message(fallbackTemplate, symbol);
    } catch (_err) {
      warnObjectiveHighlightBuildFailureOnce(context + "/missing_key_literal");
      return undefined;
    }
  }

  try {
    return mod.Message(key, symbol);
  } catch (_err) {
    try {
      return mod.Message(fallbackTemplate, symbol);
    } catch (_err2) {
      warnObjectiveHighlightBuildFailureOnce(context + "/key_and_literal");
      return undefined;
    }
  }
}

function showObjectiveHighlightToTeamStrict(
  key: any,
  fallbackTemplate: string,
  symbol: string,
  team: mod.Team,
  context: string
): void {
  const eventMessage = buildObjectiveHighlightMessage(key, fallbackTemplate, symbol, context);
  if (!eventMessage) {
    return;
  }

  mod.DisplayHighlightedWorldLogMessage(eventMessage, team);
}

function tryGetCapturePointSymbolByObjId(cpObjId: number): string | undefined {
  const cp = serverCapturePoints[cpObjId];
  if (!cp) return undefined;
  if (typeof cp.symbol !== "string" || cp.symbol.length === 0) return undefined;
  return cp.symbol;
}

function getCapturePointFinisherIds(cp: CapturePoint | undefined, ownerTeam: mod.Team): number[] {
  if (!cp) return [];

  const finisherIds: number[] = [];
  const seenByPlayerId: { [playerId: number]: boolean } = {};
  const playerIdsOnPoint = cp.getPlayerIdsOnPoint();

  for (let i = 0; i < playerIdsOnPoint.length; i++) {
    const playerId = playerIdsOnPoint[i];
    if (seenByPlayerId[playerId] === true) continue;
    seenByPlayerId[playerId] = true;

    const sp = serverPlayers.get(playerId);
    if (!sp) continue;
    if (!sp.isDeployed) continue;
    if (!mod.IsPlayerValid(sp.player)) continue;
    if (!kernelIsPlayerAlive(sp.player)) continue;
    if (!mod.Equals(mod.GetTeam(sp.player), ownerTeam)) continue;

    finisherIds.push(playerId);
  }

  return finisherIds;
}

function shouldAnnounceCapturePointPhase(
  cp: CapturePoint,
  phase: CapturePointPhase,
  owner: mod.Team,
  progressTeam: mod.Team
): boolean {
  if (!shouldKeepCapturePointAnnouncement(phase)) return false;
  if (mod.Equals(progressTeam, teamNeutral)) return false;

  return (
    cp.getLastAnnouncedPhase() !== phase ||
    !mod.Equals(cp.getLastAnnouncedOwner(), owner) ||
    !mod.Equals(cp.getLastAnnouncedProgressTeam(), progressTeam)
  );
}

function Mode_OngoingCapturePoint(eventCapturePoint: mod.CapturePoint): void {
  if (gameStatus !== 3) return;

  const cpObjId = mod.GetObjId(eventCapturePoint);
  const cp = serverCapturePoints[cpObjId];
  if (!cp) return;

  const previousSnapshot = createCapturePointStateSnapshot(cp);
  refreshCapturePointFromEngine(cp, true, eventCapturePoint);
  const nextSnapshot = createCapturePointStateSnapshot(cp);

  const stateChanged = didCapturePointStateChange(previousSnapshot, nextSnapshot);
  const presenceChanged = didCapturePointPresenceChange(previousSnapshot, nextSnapshot);
  const controlStateChanged =
    presenceChanged ||
    !mod.Equals(previousSnapshot.owner, nextSnapshot.owner) ||
    !mod.Equals(previousSnapshot.progressTeam, nextSnapshot.progressTeam) ||
    previousSnapshot.contested !== nextSnapshot.contested ||
    previousSnapshot.phase !== nextSnapshot.phase;

  if (!stateChanged && !presenceChanged) {
    return;
  }

  if (!mod.Equals(previousSnapshot.owner, nextSnapshot.owner) || previousSnapshot.phase !== nextSnapshot.phase) {
    markCapturePointTopFlagLaneDirty(cp);
  }

  if (
    !mod.Equals(previousSnapshot.owner, nextSnapshot.owner) ||
    previousSnapshot.phase !== nextSnapshot.phase ||
    previousSnapshot.contested !== nextSnapshot.contested
  ) {
    syncLiveHudTopFlagBlinkTimer();
  }

  if (controlStateChanged) {
    markCaptureTickLoopsDirty();
  }

  if (!mod.Equals(previousSnapshot.owner, nextSnapshot.owner) || previousSnapshot.phase !== nextSnapshot.phase) {
    refreshLiveHqRoutingFromObjectiveEvent(true);
  }
}

function Mode_OnPlayerEnterCapturePoint(eventPlayer: mod.Player, eventCapturePoint: mod.CapturePoint): void {
  if (gameStatus !== 3) return;
  if (!isParticipantPlayer(eventPlayer)) return;

  const team = mod.GetTeam(eventPlayer);
  const id = modlib.getPlayerId(eventPlayer);
  const cpObjId = mod.GetObjId(eventCapturePoint);
  const cp = serverCapturePoints[cpObjId];

  if (!cp) return;

  refreshCapturePointFromEngine(cp, true, eventCapturePoint);
  refreshLiveHqRoutingFromObjectiveEvent(true);
  markCapturePointTopFlagLaneDirty(cp);
  syncLiveHudTopFlagBlinkTimer();

  const lastEnter = lastEnterPointSfxTickByPlayerId[id] ?? -999999;
  if (phaseTickCount - lastEnter >= ENTER_POINT_SFX_COOLDOWN_TICKS) {
    lastEnterPointSfxTickByPlayerId[id] = phaseTickCount;

    if (mod.Equals(cp.getOwner(), team) || mod.Equals(cp.getOwner(), teamNeutral)) playThumpFriendly(eventPlayer);
    else playThumpEnemy(eventPlayer);
  }

  const onpoint = cp.getOnPoint();
  const playerTeamIndex: 0 | 1 = mod.Equals(team, team1) ? 0 : 1;
  const before: number[] = [onpoint[0], onpoint[1]];
  before[playerTeamIndex] = mod.Max(0, before[playerTeamIndex] - 1);

  const myIdx: 0 | 1 = mod.Equals(team, team1) ? 0 : 1;
  const otherIdx: 0 | 1 = myIdx === 0 ? 1 : 0;

  const myBefore = before[myIdx];
  const myAfter = onpoint[myIdx];
  const enemyAfter = onpoint[otherIdx];

  const ownerTeam = cp.getOwner();

  const teammateJoined = myBefore >= 1 && myAfter >= 2 && enemyAfter === 0 && !mod.Equals(ownerTeam, team);

  if (teammateJoined) {
    const cpId = cpObjId;

    if (canPlayCpSfx(SFX_JOIN_CD_TICKS, lastJoinSfxTickByCp, cpId)) {
      markCpSfx(lastJoinSfxTickByCp, cpId);

      serverPlayers.forEach((sp) => {
        if (!mod.Equals(mod.GetTeam(sp.player), team)) return;

        const onCpId = sp.getCapturePoint();
        if (onCpId === null) return;
        if (onCpId !== cpId) return;
        if (sp.id === id) return;

        playTickFriendly(sp.player);
      });
    }
  }

  markCaptureTickLoopsDirty();
}

function Mode_OnPlayerExitCapturePoint(eventPlayer: mod.Player, eventCapturePoint: mod.CapturePoint): void {
  if (gameStatus !== 3) return;
  if (!isParticipantPlayer(eventPlayer)) return;

  const cp = serverCapturePoints[mod.GetObjId(eventCapturePoint)];
  const playerId = modlib.getPlayerId(eventPlayer);
  if (!cp) return;

  refreshCapturePointFromEngine(cp, true, eventCapturePoint);
  refreshLiveHqRoutingFromObjectiveEvent(true);
  markCapturePointTopFlagLaneDirty(cp);
  syncLiveHudTopFlagBlinkTimer();

  const playerState = serverPlayers.get(playerId);
  if (playerState && playerState.getCapturePoint() === null) {
    stopCaptureTickLoop(playerId);
  }

  markCaptureTickLoopsDirty();
}

function Mode_OnCapturePointCaptured(flag: mod.CapturePoint): void {
  if (gameStatus !== 3) return;
  const id = mod.GetObjId(flag);
  const cpWrap = serverCapturePoints[id];
  if (!cpWrap) return;

  refreshCapturePointFromEngine(cpWrap, true, flag);
  refreshLiveHqRoutingFromObjectiveEvent(true);

  const team = cpWrap.getOwner();
  if (mod.Equals(team, teamNeutral)) return;
  const cpObjId = mod.GetObjId(flag);
  const finisherIds = getCapturePointFinisherIds(cpWrap, team);
  const symbol = cpWrap.symbol;
  const highlightSymbol = tryGetCapturePointSymbolByObjId(id);
  invalidateCaptureBuildupSessionForCp(cpObjId);

  const playerIdsOnPoint = cpWrap.getPlayerIdsOnPoint();
  for (let i = 0; i < playerIdsOnPoint.length; i++) {
    stopCaptureTickLoop(playerIdsOnPoint[i]);
  }

  for (let i = 0; i < finisherIds.length; i++) {
    const finisherId = finisherIds[i];
    const sp = serverPlayers.get(finisherId);
    if (!sp) continue;

    sp.addCapture();
    sp.addScore(150);
  }

  // Push scoreboard refresh through dirty-lane so we avoid extra full-player loops this frame.
  markScoreboardDirty();
  markCapturePointTopFlagLaneDirty(cpWrap);
  syncLiveHudTopFlagBlinkTimer();
  cpWrap.clearAnnouncementState();



  if (modlib.Equals(team, team1)) {
    showObjectiveHighlightToTeamStrict(
      mod.stringkeys.ObjectiveCaptured,
      "Objective {} captured",
      highlightSymbol ?? "",
      team1,
      "OnCapturePointCaptured/ObjectiveCaptured/team1"
    );
    showObjectiveHighlightToTeamStrict(
      mod.stringkeys.ObjectiveCapturedEnemy,
      "Objective {} captured by enemy team",
      highlightSymbol ?? "",
      team2,
      "OnCapturePointCaptured/ObjectiveCapturedEnemy/team2"
    );
  } else {
    showObjectiveHighlightToTeamStrict(
      mod.stringkeys.ObjectiveCaptured,
      "Objective {} captured",
      highlightSymbol ?? "",
      team2,
      "OnCapturePointCaptured/ObjectiveCaptured/team2"
    );
    showObjectiveHighlightToTeamStrict(
      mod.stringkeys.ObjectiveCapturedEnemy,
      "Objective {} captured by enemy team",
      highlightSymbol ?? "",
      team1,
      "OnCapturePointCaptured/ObjectiveCapturedEnemy/team1"
    );
  }

  if (canPlayCpSfx(SFX_CAPTURE_CD_TICKS, lastCaptureSfxTickByCp, id)) {
    markCpSfx(lastCaptureSfxTickByCp, id);

    for (let i = 0; i < finisherIds.length; i++) {
      const sp = serverPlayers.get(finisherIds[i]);
      if (!sp) continue;
      playCapturedSfx(sp.player);
    }
    playVOToTeam(team, mod.VoiceOverEvents2D.ObjectiveCaptured, voflags[symbol]);

    const enemyTeam = mod.Equals(team, team1) ? team2 : team1;
    playVOToTeam(enemyTeam, mod.VoiceOverEvents2D.ObjectiveCapturedEnemy, voflags[symbol]);
  }

  markCaptureTickLoopsDirty();
}

function OnCapturePointNeutralizing(flag: mod.CapturePoint, team: mod.Team): void {
  if (gameStatus !== 3) return;

  const id = mod.GetObjId(flag);
  const cp = serverCapturePoints[id];
  if (!cp || mod.Equals(team, teamNeutral)) return;
  const symbol = cp.symbol;
  const highlightSymbol = tryGetCapturePointSymbolByObjId(id);

  const owner = cp.getOwner();
  const defenders = owner;

  if (!mod.Equals(defenders, teamNeutral) && !mod.Equals(defenders, team)) {
    if (canPlayCpSfx(SFX_CONTEST_CD_TICKS, lastContestSfxTickByCp, id)) {
      markCpSfx(lastContestSfxTickByCp, id);

      playSfxToTeam(defenders, "tickEnemy");
      playVOToTeam(defenders, mod.VoiceOverEvents2D.ObjectiveContested, voflags[symbol]);
    }
  }

  if (modlib.Equals(team, team1)) {
    showObjectiveHighlightToTeamStrict(
      mod.stringkeys.ObjectiveNeutralizing,
      "Objective {} being neutralized",
      highlightSymbol ?? "",
      team1,
      "OnCapturePointNeutralizing/ObjectiveNeutralizing/team1"
    );
    showObjectiveHighlightToTeamStrict(
      mod.stringkeys.ObjectiveNeutralizingEnemy,
      "Objective {} being neutralized by enemy team",
      highlightSymbol ?? "",
      team2,
      "OnCapturePointNeutralizing/ObjectiveNeutralizingEnemy/team2"
    );
  } else {
    showObjectiveHighlightToTeamStrict(
      mod.stringkeys.ObjectiveNeutralizing,
      "Objective {} being neutralized",
      highlightSymbol ?? "",
      team2,
      "OnCapturePointNeutralizing/ObjectiveNeutralizing/team2"
    );
    showObjectiveHighlightToTeamStrict(
      mod.stringkeys.ObjectiveNeutralizingEnemy,
      "Objective {} being neutralized by enemy team",
      highlightSymbol ?? "",
      team1,
      "OnCapturePointNeutralizing/ObjectiveNeutralizingEnemy/team1"
    );
  }

  markCapturePointTopFlagLaneDirty(cp);
  syncLiveHudTopFlagBlinkTimer();
  markCaptureTickLoopsDirty();
}

function Mode_OnCapturePointLost(flag: mod.CapturePoint): void {
  if (gameStatus !== 3) return;
  const id = mod.GetObjId(flag);
  const cp = serverCapturePoints[id];
  if (!cp) return;

  refreshCapturePointFromEngine(cp, true, flag);
  refreshLiveHqRoutingFromObjectiveEvent(true);

  invalidateCaptureBuildupSessionForCp(id);
  const symbol = cp.symbol;
  const highlightSymbol = tryGetCapturePointSymbolByObjId(id);
  markCapturePointTopFlagLaneDirty(cp);
  syncLiveHudTopFlagBlinkTimer();
  cp.clearAnnouncementState();

  const team = mod.GetPreviousOwnerTeam(flag);
  if (mod.Equals(team, teamNeutral)) return;

  if (modlib.Equals(team, team1)) {
    showObjectiveHighlightToTeamStrict(
      mod.stringkeys.ObjectiveNeutralised,
      "Objective {} neutralized",
      highlightSymbol ?? "",
      team1,
      "OnCapturePointLost/ObjectiveNeutralised/team1"
    );
    showObjectiveHighlightToTeamStrict(
      mod.stringkeys.ObjectiveLost,
      "Objective {} lost",
      highlightSymbol ?? "",
      team2,
      "OnCapturePointLost/ObjectiveLost/team2"
    );
  } else {
    showObjectiveHighlightToTeamStrict(
      mod.stringkeys.ObjectiveNeutralised,
      "Objective {} neutralized",
      highlightSymbol ?? "",
      team2,
      "OnCapturePointLost/ObjectiveNeutralised/team2"
    );
    showObjectiveHighlightToTeamStrict(
      mod.stringkeys.ObjectiveLost,
      "Objective {} lost",
      highlightSymbol ?? "",
      team1,
      "OnCapturePointLost/ObjectiveLost/team1"
    );
  }

  markCaptureTickLoopsDirty();
}

function Mode_OnCapturePointCapturing(flag: mod.CapturePoint): void {
  if (gameStatus !== 3) return;
  const cpObjId = mod.GetObjId(flag);
  const cp = serverCapturePoints[cpObjId];
  if (!cp) return;

  refreshCapturePointFromEngine(cp, true, flag);
  refreshLiveHqRoutingFromObjectiveEvent(true);

  const highlightSymbol = tryGetCapturePointSymbolByObjId(cpObjId);
  markCapturePointTopFlagLaneDirty(cp);
  syncLiveHudTopFlagBlinkTimer();

  const phase = cp.getLastSampledPhase();
  const owner = cp.getOwner();
  const team = cp.getProgressTeam();
  const previousOwner = mod.GetPreviousOwnerTeam(flag);
  const suppressInitialCaptureAnnouncementAfterNeutralize =
    phase === "capturing_neutral" &&
    mod.Equals(owner, teamNeutral) &&
    !mod.Equals(previousOwner, teamNeutral) &&
    cp.getCaptureProgress() <= 0.05;

  if (!shouldAnnounceCapturePointPhase(cp, phase, owner, team)) {
    markCaptureTickLoopsDirty();
    return;
  }

  if (phase === "neutralizing_enemy") {
    OnCapturePointNeutralizing(flag, team);
    cp.setAnnouncementState(phase, owner, team);
    return;
  }

  if (
    phase !== "capturing_neutral" ||
    mod.Equals(team, teamNeutral) ||
    suppressInitialCaptureAnnouncementAfterNeutralize
  ) {
    markCaptureTickLoopsDirty();
    return;
  }

  if (modlib.Equals(team, team1)) {
    showObjectiveHighlightToTeamStrict(
      mod.stringkeys.ObjectiveCapturing,
      "Objective {} being captured",
      highlightSymbol ?? "",
      team1,
      "OnCapturePointCapturing/ObjectiveCapturing/team1"
    );
    showObjectiveHighlightToTeamStrict(
      mod.stringkeys.ObjectiveCapturingEnemy,
      "Objective {} being attacked by enemy team",
      highlightSymbol ?? "",
      team2,
      "OnCapturePointCapturing/ObjectiveCapturingEnemy/team2"
    );
  } else if (modlib.Equals(team, team2)) {
    showObjectiveHighlightToTeamStrict(
      mod.stringkeys.ObjectiveCapturing,
      "Objective {} being captured",
      highlightSymbol ?? "",
      team2,
      "OnCapturePointCapturing/ObjectiveCapturing/team2"
    );
    showObjectiveHighlightToTeamStrict(
      mod.stringkeys.ObjectiveCapturingEnemy,
      "Objective {} being attacked by enemy team",
      highlightSymbol ?? "",
      team1,
      "OnCapturePointCapturing/ObjectiveCapturingEnemy/team1"
    );
  }

  cp.setAnnouncementState(phase, owner, team);
  markCaptureTickLoopsDirty();
}

/* =================================================================================================
   16) COMBAT EVENTS
================================================================================================= */
/* =================================================================================================
   DAMAGE SPACING (NO DAMAGE FACTORS)
   - Keeps total damage the same
   - Spaces incoming damage over a short window based on distance
   - Uses Heal() to undo the instant hit, then DealDamage() to re-apply over time
================================================================================================= */

const DMG_SPREAD_CLOSE_MAX_DIST = RULES.gameplay.damage.smoothingSpread.closeMaxDist;
const DMG_SPREAD_MID_MAX_DIST = RULES.gameplay.damage.smoothingSpread.midMaxDist;

// Tune these (seconds). Close range = more delay, long range = less delay.
const DMG_SPREAD_CLOSE_SEC = RULES.gameplay.damage.smoothingSpread.closeSeconds; // 0-10m
const DMG_SPREAD_MID_SEC = RULES.gameplay.damage.smoothingSpread.midSeconds;   // 10-25m
const DMG_SPREAD_FAR_SEC = RULES.gameplay.damage.smoothingSpread.farSeconds;   // 25m+

// Per-player health cache (LIVE only)
let dmgLastHealth: { [playerId: number]: number } = {};

// Per-player queued damage
let dmgQueued: { [playerId: number]: number } = {};
let dmgQueuedTicksLeft: { [playerId: number]: number } = {};
let dmgQueuedGiverObjId: { [playerId: number]: number } = {};
// Track only victims currently needing smoothing work
let dmgActive: { [playerId: number]: boolean } = {};
let dmgActiveIds: number[] = [];

// Guard to prevent our own re-applied DealDamage() from being re-smoothed
let dmgIsReapplying: { [playerId: number]: boolean } = {};
// Health-based delay scaling:
//  - 1.0 health => 100% of base delay
//  - 0.0 health => MIN factor of base delay
const DMG_SPREAD_HEALTH_DELAY_MIN_FACTOR = RULES.gameplay.damage.smoothingSpread.minHealthDelayFactor; // <= 1.0 (lower = faster when low HP)
const DMG_SPREAD_HEALTH_DELAY_MAX_FACTOR = RULES.gameplay.damage.smoothingSpread.maxHealthDelayFactor;  // keep at 1.0

function dmgGetNormalizedHealth(player: mod.Player): number {
  // SDK supports NormalizedHealth (0..1)
  return mod.GetSoldierState(player, mod.SoldierStateNumber.NormalizedHealth);
}

function dmgSpreadApplyHealthDelayScale(baseTicks: number, normalizedHealth: number): number {
  // Clamp 0..1 without relying on Math.min/max
  let h = normalizedHealth;
  if (typeof h !== "number" || !Number.isFinite(h)) h = 1;
  if (h < 0) h = 0;
  if (h > 1) h = 1;

  // Scale factor = min + (max-min)*h
  const factor =
    DMG_SPREAD_HEALTH_DELAY_MIN_FACTOR +
    (DMG_SPREAD_HEALTH_DELAY_MAX_FACTOR - DMG_SPREAD_HEALTH_DELAY_MIN_FACTOR) * h;

  const scaled = mod.Ceiling(baseTicks * factor);
  return scaled < 1 ? 1 : scaled;
}

function dmgMarkActive(id: number): void {
  if (dmgActive[id] === true) return;
  dmgActive[id] = true;
  dmgActiveIds.push(id);
}

function dmgUnmarkActive(id: number): void {
  if (dmgActive[id] !== true) return;
  dmgActive[id] = false;
  const idx = dmgActiveIds.indexOf(id);
  if (idx >= 0) dmgActiveIds.splice(idx, 1);
}

function dmgSpreadSecondsToTicks(sec: number): number {
  const raw = mod.Ceiling(sec * TICK_RATE);
  return raw < 1 ? 1 : raw;
}

function dmgSpreadDistanceMeters(victim: mod.Player, attacker: mod.Player): number {
  if (!mod.IsPlayerValid(attacker)) return 99999;
  if (!kernelIsPlayerAlive(victim)) return 99999;
  if (!kernelIsPlayerAlive(attacker)) return 99999;

  const vPos = getPlayerPosition(victim);
  const aPos = getPlayerPosition(attacker);
  return mod.DistanceBetween(vPos, aPos);
}

function dmgSpreadPickTicks(distanceMeters: number): number {
  if (distanceMeters <= DMG_SPREAD_CLOSE_MAX_DIST) return dmgSpreadSecondsToTicks(DMG_SPREAD_CLOSE_SEC);
  if (distanceMeters <= DMG_SPREAD_MID_MAX_DIST) return dmgSpreadSecondsToTicks(DMG_SPREAD_MID_SEC);
  return dmgSpreadSecondsToTicks(DMG_SPREAD_FAR_SEC);
}

function dmgGetCurrentHealth(player: mod.Player): number {
  return mod.GetSoldierState(player, mod.SoldierStateNumber.CurrentHealth);
}

// Update cached health for all deployed alive players during LIVE
function dmgSpreadUpdateHealthCacheTick(): void {
  if (gameStatus !== 3) return;

  serverPlayers.forEach((sp) => {
    if (!sp || !sp.isDeployed) return;
    if (!mod.IsPlayerValid(sp.player)) return;
    if (!kernelIsPlayerAlive(sp.player)) return;

    dmgLastHealth[sp.id] = dmgGetCurrentHealth(sp.player);
  });
}

// Apply queued damage smoothly during LIVE (ONLY for active damaged victims)
function dmgSpreadProcessQueueTick(): void {
  if (gameStatus !== 3) return;
  if (dmgActiveIds.length <= 0) return;

  // Iterate backwards so we can safely remove entries
  for (let i = dmgActiveIds.length - 1; i >= 0; i--) {
    const id = dmgActiveIds[i];

    const sp = serverPlayers.get(id);
    if (!sp || !sp.isDeployed || !mod.IsPlayerValid(sp.player) || !kernelIsPlayerAlive(sp.player)) {
      // Player gone / invalid: stop processing them
      dmgQueued[id] = 0;
      dmgQueuedTicksLeft[id] = 0;
      dmgQueuedGiverObjId[id] = 0;
      dmgUnmarkActive(id);
      continue;
    }

    const remaining = dmgQueued[id] ?? 0;
    let ticksLeft = dmgQueuedTicksLeft[id] ?? 0;

    // Nothing left to do => deactivate
    if (remaining <= 0 || ticksLeft <= 0) {
      dmgQueued[id] = 0;
      dmgQueuedTicksLeft[id] = 0;
      dmgQueuedGiverObjId[id] = 0;
      dmgUnmarkActive(id);
      continue;
    }

    // Spread evenly. Use Ceiling so it always finishes.
    let step = mod.Ceiling(remaining / ticksLeft);
    if (step < 1) step = 1;
    if (step > remaining) step = remaining;

    // Optional giver for kill credit (best-effort)
    const giverObjId = dmgQueuedGiverObjId[id] ?? 0;
    let giver: mod.Player | null = null;

    if (giverObjId !== 0) {
      const found = findServerPlayerByObjId(giverObjId);
      if (found && mod.IsPlayerValid(found.player)) giver = found.player;
    }

    // IMPORTANT: prevent re-smoothing our own scripted DealDamage
    dmgIsReapplying[id] = true;
    try {
      if (giver) mod.DealDamage(sp.player, step, giver);
      else mod.DealDamage(sp.player, step);
    } finally {
      dmgIsReapplying[id] = false;
    }

    dmgQueued[id] = remaining - step;
    ticksLeft -= 1;
    dmgQueuedTicksLeft[id] = ticksLeft;

    if (dmgQueued[id] <= 0 || dmgQueuedTicksLeft[id] <= 0) {
      dmgQueued[id] = 0;
      dmgQueuedTicksLeft[id] = 0;
      dmgQueuedGiverObjId[id] = 0;
      dmgUnmarkActive(id);
    }
  }
}


// Clear queue state for a player (call on deploy/undeploy)
function dmgSpreadClearForPlayer(player: mod.Player): void {
  if (!mod.IsPlayerValid(player)) return;
  const id = modlib.getPlayerId(player);

  dmgQueued[id] = 0;
  dmgQueuedTicksLeft[id] = 0;
  dmgQueuedGiverObjId[id] = 0;

  dmgIsReapplying[id] = false;
  dmgUnmarkActive(id);

  if (mod.IsPlayerValid(player) && kernelIsPlayerAlive(player)) {
    dmgLastHealth[id] = dmgGetCurrentHealth(player);
  } else {
    dmgLastHealth[id] = 0;
  }
}


function Mode_OnPlayerDamaged(
  eventPlayer: mod.Player,      // victim
  eventOtherPlayer: mod.Player, // attacker
  eventDamageType: mod.DamageType,
  eventWeaponUnlock: mod.WeaponUnlock
): void {
  if (!mod.IsPlayerValid(eventPlayer)) return;
  if (!isParticipantPlayer(eventPlayer)) return;
  if (mod.IsPlayerValid(eventOtherPlayer) && isExcludedPlayer(eventOtherPlayer)) return;

  const victimId = modlib.getPlayerId(eventPlayer);

  // Prematch 889 rule:
  // - outside 889: full non-lethal protection (always force full heal)
  // - inside 889: no protection, player can be killed/downed normally
  if (isPrematchOutside889(victimId)) {
    forcePrematchOutside889FullHeal(eventPlayer, victimId);
    return;
  }

  if (!kernelIsPlayerAlive(eventPlayer)) return;

  const sp = serverPlayers.get(victimId);
  if (!sp) return;

  // LIVE only
  if (gameStatus !== 3) return;
  if (!sp.isDeployed) return;

  const cur = dmgGetCurrentHealth(eventPlayer);

  // Toggle: if smoothing is disabled, just keep health cache updated and do nothing.
  if (!ENABLE_DAMAGE_SMOOTHING) {
    dmgLastHealth[victimId] = cur;
    return;
  }

  const healthNormAfterHit = dmgGetNormalizedHealth(eventPlayer);


  // If this damage came from our own queued re-application, just update cache and stop.
  if (dmgIsReapplying[victimId] === true) {
    dmgLastHealth[victimId] = cur;
    return;
  }

  // If not player-vs-player (world/zone/etc), do NOT smooth; just keep cache updated.
  if (!mod.IsPlayerValid(eventOtherPlayer) || mod.Equals(eventPlayer, eventOtherPlayer)) {
    dmgLastHealth[victimId] = cur;
    return;
  }

  // Only smooth enemy damage
  const vTeam = mod.GetTeam(eventPlayer);
  const aTeam = mod.GetTeam(eventOtherPlayer);
  if (mod.Equals(vTeam, aTeam)) {
    dmgLastHealth[victimId] = cur;
    return;
  }

  const prev = dmgLastHealth[victimId];

  // If cache is missing, initialize and do nothing this hit (avoids bad deltas)
  if (typeof prev !== "number" || !Number.isFinite(prev) || prev <= 0) {
    dmgLastHealth[victimId] = cur;
    return;
  }

  const delta = prev - cur;
  if (delta <= 0) {
    dmgLastHealth[victimId] = cur;
    return;
  }

  // Undo the instant damage
  mod.Heal(eventPlayer, delta);

  // Restore cache to the healed value
  dmgLastHealth[victimId] = prev;

  // Queue the same damage to be applied over time
  const dist = dmgSpreadDistanceMeters(eventPlayer, eventOtherPlayer);
  const baseTicks = dmgSpreadPickTicks(dist);
  const spreadTicks = dmgSpreadApplyHealthDelayScale(baseTicks, healthNormAfterHit);


  dmgQueued[victimId] = (dmgQueued[victimId] ?? 0) + delta;
  dmgQueuedTicksLeft[victimId] = spreadTicks;

  // Best-effort store giver ObjId for credit
  dmgQueuedGiverObjId[victimId] = mod.GetObjId(eventOtherPlayer);

  // Mark victim active so queue processing runs ONLY for them
  dmgMarkActive(victimId);
}

function Mode_OnMandown(eventPlayer: mod.Player, eventOtherPlayer: mod.Player): void {
  if (!mod.IsPlayerValid(eventPlayer)) return;
  if (!isParticipantPlayer(eventPlayer)) return;
  if (mod.IsPlayerValid(eventOtherPlayer) && isExcludedPlayer(eventOtherPlayer)) return;

  const playerId = modlib.getPlayerId(eventPlayer);
  if (!isPrematchOutside889(playerId)) return;

  // Prematch outside 889 must never stay in mandown.
  forcePrematchOutside889FullHeal(eventPlayer, playerId);
}




function Mode_OnPlayerEarnedKill(
  eventPlayer: mod.Player,
  eventOtherPlayer: mod.Player,
  eventDeathType: mod.DeathType,
  eventWeaponUnlock: mod.WeaponUnlock
): void {
  if (gameStatus !== 3) return;
  if (!isParticipantPlayer(eventPlayer)) return;
  if (mod.IsPlayerValid(eventOtherPlayer) && isExcludedPlayer(eventOtherPlayer)) return;

  const p = serverPlayers.get(modlib.getPlayerId(eventPlayer));
  if (!p) return;

  if (mod.NotEqualTo(eventPlayer, eventOtherPlayer)) {
    p.addKill();
    p.addScore(100);
  }
}

function Mode_OnPlayerEarnedKillAssist(eventPlayer: mod.Player, eventOtherPlayer: mod.Player): void {
  if (gameStatus !== 3) return;
  if (!isParticipantPlayer(eventPlayer)) return;
  if (mod.IsPlayerValid(eventOtherPlayer) && isExcludedPlayer(eventOtherPlayer)) return;

  const p = serverPlayers.get(modlib.getPlayerId(eventPlayer));
  if (!p) return;

  p.addKillAssist();
  p.addScore(50);
}

/* =================================================================================================
   17) DAMAGE ZONE EVENTS
================================================================================================= */

function tryGetAreaTriggerIdSafe(
  eventAreaTrigger: mod.AreaTrigger,
  context: string
): number | undefined {
  try {
    return mod.GetObjId(eventAreaTrigger);
  } catch (err) {
    LogRuntimeError("AreaTriggerId/" + context, err);
    return undefined;
  }
}

function Mode_OnPlayerEnterAreaTrigger(eventPlayer: mod.Player, eventAreaTrigger: mod.AreaTrigger): void {
  if (!isParticipantPlayer(eventPlayer)) return;

  try {
    const triggerId = tryGetAreaTriggerIdSafe(eventAreaTrigger, "OnPlayerEnterAreaTrigger");
    if (triggerId === undefined) return;
    const playerId = modlib.getPlayerId(eventPlayer);

    if (triggerId === PREMATCH_HEALTH_AREA_TRIGGER_ID) {
      if (gameStatus === 0) {
        prematchHealthInside889ByPlayerId[playerId] = true;
        applyPrematch889HealthForPlayer(playerId);
      }
      return;
    }

    if (gameStatus === 0) {
      if (!mod.IsPlayerValid(eventPlayer)) return;
      if (!kernelIsPlayerAliveSafe(eventPlayer)) return;

      const playerTeam = mod.GetTeam(eventPlayer);
      if (triggerId === PREMATCH_TEAM1_KILL_TRIGGER_ID && mod.Equals(playerTeam, team1)) {
        mod.DealDamage(eventPlayer, 9999);
        return;
      }

      if (triggerId === PREMATCH_TEAM2_KILL_TRIGGER_ID && mod.Equals(playerTeam, team2)) {
        mod.DealDamage(eventPlayer, 9999);
        return;
      }
    }

    if (gameStatus !== 3) return;

    const p = serverPlayers.get(playerId);
    if (!p) return;

    // Existing damage zone
    if (triggerId === DAMAGE_TRIGGER_ID) {
      playerInDamageZone[playerId] = true;
      return;
    }

    // Restricted area
    if (shouldApplyRestrictedAreaTriggerToPlayer(eventPlayer, triggerId)) {
      addRestrictedAreaTriggerForPlayer(playerId, triggerId);
      if (playerInRestrictedArea[playerId] === true) return;

      playerInRestrictedArea[playerId] = true;
      startRestrictedAreaCountdown(p);
      return;
    }
  } catch (err) {
    LogRuntimeError("OnPlayerEnterAreaTrigger", err);
  }
}


function Mode_OnPlayerExitAreaTrigger(eventPlayer: mod.Player, eventAreaTrigger: mod.AreaTrigger): void {
  if (!isParticipantPlayer(eventPlayer)) return;

  try {
    const triggerId = tryGetAreaTriggerIdSafe(eventAreaTrigger, "OnPlayerExitAreaTrigger");
    if (triggerId === undefined) return;
    const playerId = modlib.getPlayerId(eventPlayer);

    if (triggerId === PREMATCH_HEALTH_AREA_TRIGGER_ID) {
      if (gameStatus === 0) {
        prematchHealthInside889ByPlayerId[playerId] = false;
        applyPrematch889HealthForPlayer(playerId);
      }
      return;
    }

    if (gameStatus !== 3) return;

    // Existing damage zone
    if (triggerId === DAMAGE_TRIGGER_ID) {
      playerInDamageZone[playerId] = false;
      return;
    }

    // Restricted area
    if (isManagedRestrictedAreaTrigger(triggerId)) {
      const removedTrackedTrigger = removeRestrictedAreaTriggerForPlayer(playerId, triggerId);
      if (!removedTrackedTrigger) return;
      if (hasActiveRestrictedAreaTrigger(playerId)) return;

      const p = serverPlayers.get(playerId);
      clearRestrictedAreaStateForPlayer(playerId, p?.player);
      return;
    }
  } catch (err) {
    LogRuntimeError("OnPlayerExitAreaTrigger", err);
  }
}

export const KernelCombatBridge = {
  onPlayerDamaged: Mode_OnPlayerDamaged,
  onMandown: Mode_OnMandown,
  onPlayerEarnedKill: Mode_OnPlayerEarnedKill,
  onPlayerEarnedKillAssist: Mode_OnPlayerEarnedKillAssist,
  processLiveTick: runLegacyCombatLiveTick,
};

export const KernelObjectiveBridge = {
  onPlayerEnterCapturePoint: Mode_OnPlayerEnterCapturePoint,
  onPlayerExitCapturePoint: Mode_OnPlayerExitCapturePoint,
  onOngoingCapturePoint: Mode_OngoingCapturePoint,
  onCapturePointCaptured: Mode_OnCapturePointCaptured,
  onCapturePointLost: Mode_OnCapturePointLost,
  onCapturePointCapturing: Mode_OnCapturePointCapturing,
  processLiveFastTick: runLegacyObjectiveFastLiveTick,
  processLiveSlowTick: runLegacyObjectiveSlowLiveTick,
};

export const KernelSpawnRoutingBridge = {
  onPlayerDeployed: Mode_OnPlayerDeployed,
  onPlayerUndeploy: Mode_OnPlayerUndeploy,
  processLiveRoutingTick: runLegacySpawnRoutingLiveTick,
};

export const KernelKothModeHandlers = {
  OnGameModeStarted: Mode_OnGameModeStarted,
  OnGameModeEnding: Mode_OnGameModeEnding,
  OngoingGlobal: Mode_OngoingGlobal,
  OnPlayerJoinGame: Mode_OnPlayerJoinGame,
  OnPlayerLeaveGame: Mode_OnPlayerLeaveGame,
  OnPlayerDeployed: Mode_OnPlayerDeployed,
  OnPlayerUndeploy: Mode_OnPlayerUndeploy,
  OnPlayerInteract: Mode_OnPlayerInteract,
  OnPlayerUIButtonEvent: Mode_OnPlayerUIButtonEvent,
  OnPlayerEnterCapturePoint: Mode_OnPlayerEnterCapturePoint,
  OnPlayerExitCapturePoint: Mode_OnPlayerExitCapturePoint,
  OngoingCapturePoint: Mode_OngoingCapturePoint,
  OnCapturePointCaptured: Mode_OnCapturePointCaptured,
  OnCapturePointLost: Mode_OnCapturePointLost,
  OnCapturePointCapturing: Mode_OnCapturePointCapturing,
  OnPlayerDamaged: Mode_OnPlayerDamaged,
  OnMandown: Mode_OnMandown,
  OnPlayerEarnedKill: Mode_OnPlayerEarnedKill,
  OnPlayerEarnedKillAssist: Mode_OnPlayerEarnedKillAssist,
  OnPlayerEnterAreaTrigger: Mode_OnPlayerEnterAreaTrigger,
  OnPlayerExitAreaTrigger: Mode_OnPlayerExitAreaTrigger,
};





































// --- SOURCE: src\king-of-the-hill-mode\services\combat-service.ts ---



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




// --- SOURCE: src\king-of-the-hill-mode\services\global-tick-service.ts ---



export class GlobalTickService {
    public constructor(private readonly _context: KothPhaseModeContext) {}

    public onTick(): void {
        this._context.runtime.serverTickCount += 1;
        this._context.runtime.phaseTickCount += 1;
    }

    public onOngoingGlobal(): void {
        KernelKothModeHandlers.OngoingGlobal();
    }
}




// --- SOURCE: src\king-of-the-hill-mode\live\config\koth-rules.ts ---
export const KOTH_RULES = {
    scoreToWin: 250,
    scorePerOwnedSecond: 1,

    objectiveDurationSeconds: 85,
    initialObjectiveLockSeconds: 10,
    nextObjectivePreviewSeconds: 10,

    hillStateUpdateMs: 250,
    scoreTickMs: 1000,
    worldIconTimerUpdateMs: 1000,
    workJobTickMs: 25,
    workQueueBudgets: {
        critical: 1,
        startup: 1,
        spawn: 1,
        ui: 2,
        world: 1,
        maintenance: 1,
    },
    workQueueBacklogDegradeThreshold: 24,
    performanceDiagnosticsEnabled: false,

    victoryImminentScore: 225,

    rotationOrder: ['A', 'B', 'C', 'D', 'E'] as const,

    enemyPresenceContests: true,
    emptyHillScores: false,

    postmatchDelaySeconds: 12,
    matchTimeLimitSeconds: 60000,
    redeployTimeSeconds: 0,

} as const;


// --- SOURCE: src\king-of-the-hill-mode\live\state\koth-spawn-state.ts ---



export interface KothSpawnPositionVector {
    x: number;
    y: number;
    z: number;
}

export interface KothSpawnPlayerPositionSnapshot {
    playerId: number;
    teamId: KothTeamId;
    position: KothSpawnPositionVector;
}

export interface QueuedKothSpawnAnchor {
    regionId: string;
    selectedForObjectiveLetter: KothHillLetter;
    objectiveLetter?: KothHillLetter;
    teamSide: KothCardinalSide;
    variantSide: KothCardinalSide;
    anchorObjectId: number;
    distanceToObjectiveMeters?: number;
    isEmergencyFallback?: boolean;
}

export type KothSpawnJobKind =
    | 'queue-spawn'
    | 'teleport-deployed'
    | 'confirm-teleport-orientation'
    | 'live-start-deploy-recovery';

export interface KothSpawnJob {
    kind: KothSpawnJobKind;
    playerId: number;
    createdAtMs: number;
    attempt: number;
}

export interface KothSpawnSideAssignment {
    team1Side: KothCardinalSide;
    team2Side: KothCardinalSide;
    team1VariantSide: KothCardinalSide;
    team2VariantSide: KothCardinalSide;
}

export interface KothReinforcementTarget {
    playerId: number;
    teamId: KothTeamId;
    createdAtMs: number;
}

export interface KothReinforcementTargetsByTeam {
    1?: KothReinforcementTarget;
    2?: KothReinforcementTarget;
}

export interface KothPresenceZonePressureSnapshot {
    team1Count: number;
    team2Count: number;
    revision: number;
}

export interface KothSpawnState {
    queuedAnchorByPlayerId: Map<number, QueuedKothSpawnAnchor>;
    pendingQueueSpawnPlayerIds: Set<number>;
    playersByPresenceZone: Record<KothPresenceZone, Set<number>>;
    presenceZonesByPlayerId: Map<number, Set<KothPresenceZone>>;
    pressureSnapshotByPresenceZone: Record<KothPresenceZone, KothPresenceZonePressureSnapshot>;
    sideAssignmentByRegionId: Record<string, KothSpawnSideAssignment>;
    sideAssignmentChangedAtMsByRegionId: Record<string, number>;
    reinforcementTargetByTeamId: KothReinforcementTargetsByTeam;
    nextAnchorIndexBySectorKey: Record<string, number>;
    anchorCooldownUntilMsByObjectId: Map<number, number>;
    anchorPositionByObjectId: Map<number, mod.Vector>;
    anchorPositionVectorByObjectId: Map<number, KothSpawnPositionVector>;
    capturePointPositionByObjectId: Map<number, mod.Vector>;
    capturePointPositionVectorByObjectId: Map<number, KothSpawnPositionVector>;
    playerPositionSnapshotByPlayerId: Map<number, KothSpawnPlayerPositionSnapshot>;
    pendingJobs: KothSpawnJob[];
    warnedMissingSpawnAnchors: boolean;
    warnedSpawnAnchorResolveByObjectId: Record<number, boolean>;
    warnedPresenceAreaTriggerResolveByObjectId: Record<number, boolean>;
    warnedSpawnTeleportByPlayerId: Record<number, boolean>;
}

export function createKothSpawnState(): KothSpawnState {
    return {
        queuedAnchorByPlayerId: new Map<number, QueuedKothSpawnAnchor>(),
        pendingQueueSpawnPlayerIds: new Set<number>(),
        playersByPresenceZone: {
            northWest: new Set<number>(),
            northEast: new Set<number>(),
            southWest: new Set<number>(),
            southEast: new Set<number>(),
        },
        presenceZonesByPlayerId: new Map<number, Set<KothPresenceZone>>(),
        pressureSnapshotByPresenceZone: {
            northWest: { team1Count: 0, team2Count: 0, revision: 0 },
            northEast: { team1Count: 0, team2Count: 0, revision: 0 },
            southWest: { team1Count: 0, team2Count: 0, revision: 0 },
            southEast: { team1Count: 0, team2Count: 0, revision: 0 },
        },
        sideAssignmentByRegionId: {},
        sideAssignmentChangedAtMsByRegionId: {},
        reinforcementTargetByTeamId: {},
        nextAnchorIndexBySectorKey: {},
        anchorCooldownUntilMsByObjectId: new Map<number, number>(),
        anchorPositionByObjectId: new Map<number, mod.Vector>(),
        anchorPositionVectorByObjectId: new Map<number, KothSpawnPositionVector>(),
        capturePointPositionByObjectId: new Map<number, mod.Vector>(),
        capturePointPositionVectorByObjectId: new Map<number, KothSpawnPositionVector>(),
        playerPositionSnapshotByPlayerId: new Map<number, KothSpawnPlayerPositionSnapshot>(),
        pendingJobs: [],
        warnedMissingSpawnAnchors: false,
        warnedSpawnAnchorResolveByObjectId: {},
        warnedPresenceAreaTriggerResolveByObjectId: {},
        warnedSpawnTeleportByPlayerId: {},
    };
}


// --- SOURCE: src\king-of-the-hill-mode\live\state\koth-hill-state.ts ---


export type KothHillControlState = 'inactive' | 'locked' | 'neutral' | 'team1' | 'team2' | 'contested';
export type KothHillOwnerState = 'neutral' | 'team1' | 'team2';

export interface KothHillRuntimeState {
    currentHillIndex: number;
    currentHillLetter: KothHillLetter;
    nextHillIndex: number;
    activeObjectiveRemainingSeconds: number;
    activeLockRemainingSeconds: number;
    nextPreviewRemainingSeconds: number;
    currentControlState: KothHillControlState;
    currentOwnerState: KothHillOwnerState;
    activeHillTeam1Players: Set<number>;
    activeHillTeam2Players: Set<number>;
    playerIdsByAreaTriggerId: Map<number, Set<number>>;
}


// --- SOURCE: src\king-of-the-hill-mode\live\state\koth-player-state.ts ---
export type KothPlayerScoreboardSnapshot = [number, number, number, number, number];

export class KothPlayerState {
    public isBot = false;
    public isDeployed = false;
    public isInsideActiveHill = false;
    public activeHillAreaTriggerId: number | null = null;
    public totalHillTimeSeconds = 0;
    public lastHillEnterTime: number | null = null;

    private _scoreboard: KothPlayerScoreboardSnapshot = [0, 0, 0, 0, 0];

    public constructor(
        public player: mod.Player,
        public id: number,
        public team: mod.Team
    ) {}

    public setTeam(team: mod.Team): void {
        this.team = team;
    }

    public addScore(value: number): void {
        this._scoreboard[0] += value;
    }

    public addKill(): void {
        this._scoreboard[1] += 1;
    }

    public addDeath(): void {
        this._scoreboard[2] += 1;
    }

    public addAssist(): void {
        this._scoreboard[3] += 1;
    }

    public addHillTime(seconds: number): void {
        this.totalHillTimeSeconds += seconds;
        this._scoreboard[4] = this.totalHillTimeSeconds;
    }

    public resetForNewRound(): void {
        this.isDeployed = false;
        this.isInsideActiveHill = false;
        this.activeHillAreaTriggerId = null;
        this.totalHillTimeSeconds = 0;
        this.lastHillEnterTime = null;
        this._scoreboard = [0, 0, 0, 0, 0];
    }

    public getScoreboardSnapshot(): KothPlayerScoreboardSnapshot {
        return [...this._scoreboard] as KothPlayerScoreboardSnapshot;
    }
}


// --- SOURCE: src\king-of-the-hill-mode\live\state\koth-runtime-state.ts ---






export enum KothGamePhase {
    NotStarted = 'NotStarted',
    Live = 'Live',
    Postmatch = 'Postmatch',
}

export interface KothSchedulerHandles {
    workJob?: number;
    hillState?: number;
    objectiveTimer?: number;
    scoreTick?: number;
    worldIcon?: number;
    spawnJob?: number;
    postmatchEnd?: number;
}

export interface KothWorldIconRuntimeState {
    activeIconTeam1?: mod.WorldIcon;
    activeIconTeam2?: mod.WorldIcon;
    activeLockedIcon?: mod.WorldIcon;
    contestedTextIcon?: mod.WorldIcon;
    previewIcon?: mod.WorldIcon;
    warnedSpawnFailed: boolean;
    warnedPositionFailedByCapturePointId: Record<number, boolean>;
}

export interface KothRuntimeState {
    phase: KothGamePhase;
    isMatchActive: boolean;
    isPostGame: boolean;
    scheduler: KothSchedulerHandles;
    hill: KothHillRuntimeState;
    playersById: Map<number, KothPlayerState>;
    disconnectedPlayerIds: number[];
    team1Score: number;
    team2Score: number;
    victoryImminentShownTeam1: boolean;
    victoryImminentShownTeam2: boolean;
    scoreboardDirty: boolean;
    hudDirty: boolean;
    worldIcons: KothWorldIconRuntimeState;
    spawn: KothSpawnState;
    warnedMissingObjectiveIds: Record<number, boolean>;
}

export function createKothRuntimeState(): KothRuntimeState {
    return {
        phase: KothGamePhase.NotStarted,
        isMatchActive: false,
        isPostGame: false,
        scheduler: {},
        hill: {
            currentHillIndex: 0,
            currentHillLetter: KOTH_HILLS[0].letter,
            nextHillIndex: 1,
            activeObjectiveRemainingSeconds: KOTH_RULES.objectiveDurationSeconds,
            activeLockRemainingSeconds: 0,
            nextPreviewRemainingSeconds: 0,
            currentControlState: 'inactive',
            currentOwnerState: 'neutral',
            activeHillTeam1Players: new Set<number>(),
            activeHillTeam2Players: new Set<number>(),
            playerIdsByAreaTriggerId: new Map<number, Set<number>>(),
        },
        playersById: new Map<number, KothPlayerState>(),
        disconnectedPlayerIds: [],
        team1Score: 0,
        team2Score: 0,
        victoryImminentShownTeam1: false,
        victoryImminentShownTeam2: false,
        scoreboardDirty: true,
        hudDirty: true,
        worldIcons: {
            warnedSpawnFailed: false,
            warnedPositionFailedByCapturePointId: {},
        },
        spawn: createKothSpawnState(),
        warnedMissingObjectiveIds: {},
    };
}


// --- SOURCE: src\king-of-the-hill-mode\live\state\koth-mode-context.ts ---





export interface KothLiveModeContext {
    runtime: KothRuntimeState;
    hills: typeof KOTH_HILLS;
    rules: typeof KOTH_RULES;
    spawns: typeof KOTH_SPAWNS;
}

export function createKothLiveModeContext(): KothLiveModeContext {
    return {
        runtime: createKothRuntimeState(),
        hills: KOTH_HILLS,
        rules: KOTH_RULES,
        spawns: KOTH_SPAWNS,
    };
}


// --- SOURCE: src\king-of-the-hill-mode\live\services\koth-sdk-utils.ts ---
export const KOTH_TEAM_NEUTRAL = mod.GetTeam(0);
export const KOTH_TEAM_1 = mod.GetTeam(1);
export const KOTH_TEAM_2 = mod.GetTeam(2);

export function getKothPlayerId(player: mod.Player): number {
    return mod.GetObjId(player);
}

export function getKothTeamId(team: mod.Team): 0 | 1 | 2 {
    if (mod.Equals(team, KOTH_TEAM_1)) return 1;
    if (mod.Equals(team, KOTH_TEAM_2)) return 2;
    return 0;
}

export function isParticipantTeam(team: mod.Team): boolean {
    return mod.Equals(team, KOTH_TEAM_1) || mod.Equals(team, KOTH_TEAM_2);
}

export function isKothPlayerAlive(player: mod.Player): boolean {
    try {
        return mod.GetSoldierState(player, mod.SoldierStateBool.IsAlive);
    } catch (_err) {
        return false;
    }
}

export function isKothPlayerManDown(player: mod.Player): boolean {
    try {
        return mod.GetSoldierState(player, mod.SoldierStateBool.IsManDown);
    } catch (_err) {
        return false;
    }
}

export function isKothPlayerDead(player: mod.Player): boolean {
    try {
        return mod.GetSoldierState(player, mod.SoldierStateBool.IsDead);
    } catch (_err) {
        return false;
    }
}

export function isKothPlayerLiving(player: mod.Player): boolean {
    return isKothPlayerAlive(player) && !isKothPlayerManDown(player) && !isKothPlayerDead(player);
}

export function isKothAiSoldier(player: mod.Player): boolean {
    try {
        return mod.GetSoldierState(player, mod.SoldierStateBool.IsAISoldier);
    } catch (_err) {
        return false;
    }
}

export function createOffsetVector(position: mod.Vector, yOffset: number): mod.Vector {
    return mod.CreateVector(
        mod.XComponentOf(position),
        mod.YComponentOf(position) + yOffset,
        mod.ZComponentOf(position)
    );
}

export function formatClockText(seconds: number): string {
    const clamped = seconds < 0 ? 0 : seconds;
    const minutes = mod.Floor(clamped / 60);
    const totalSeconds = mod.Floor(clamped % 60);
    const ones = totalSeconds % 10;
    const tens = mod.Floor(totalSeconds / 10);

    return `${minutes}:${tens}${ones}`;
}

export function formatClock(seconds: number): mod.Message {
    return formatClockMessage(seconds);
}

export function formatClockMessage(seconds: number): mod.Message {
    const clamped = seconds < 0 ? 0 : seconds;
    const minutes = mod.Floor(clamped / 60);
    const totalSeconds = mod.Floor(clamped % 60);
    const ones = totalSeconds % 10;
    const tens = mod.Floor(totalSeconds / 10);

    if (minutes < 10) {
        return mod.Message(mod.stringkeys.RemainingTimeSingleDigitMinute, minutes, tens, ones);
    }

    return mod.Message(mod.stringkeys.RemainingTimeDoubleDigitMinute, minutes, tens, ones);
}

export function formatScore3Message(score: number): mod.Message {
    const clamped = score < 0 ? 0 : score > 999 ? 999 : mod.Floor(score);
    const hundreds = mod.Floor(clamped / 100);
    const tens = mod.Floor((clamped % 100) / 10);
    const ones = clamped % 10;

    return mod.Message(mod.stringkeys.Score_ThreeDigits, hundreds, tens, ones);
}

export function getHillLetterMessage(letter: string): mod.Message {
    if (letter === 'A') return mod.Message(mod.stringkeys.FLAGA);
    if (letter === 'B') return mod.Message(mod.stringkeys.FLAGB);
    if (letter === 'C') return mod.Message(mod.stringkeys.FLAGC);
    if (letter === 'D') return mod.Message(mod.stringkeys.FLAGD);
    if (letter === 'E') return mod.Message(mod.stringkeys.FLAGE);
    return mod.Message(mod.stringkeys.EmptyText);
}

export function getKothControlStateMessage(controlState: string): mod.Message {
    if (controlState === 'team1') return mod.Message(mod.stringkeys.KothTeam1Holds);
    if (controlState === 'team2') return mod.Message(mod.stringkeys.KothTeam2Holds);
    if (controlState === 'contested') return mod.Message(mod.stringkeys.KothObjectiveContestedShort);
    return mod.Message(mod.stringkeys.KothObjectiveNeutralShort);
}

export function displayWorldLog(message: mod.Message, target?: mod.Player | mod.Team): void {
    if (target) {
        if (mod.IsType(target, mod.Types.Team)) {
            mod.DisplayHighlightedWorldLogMessage(message, target as mod.Team);
        } else {
            mod.DisplayHighlightedWorldLogMessage(message, target as mod.Player);
        }
        return;
    }

    mod.DisplayHighlightedWorldLogMessage(message);
}

export function warnOnce(flags: Record<number, boolean>, key: number, message: mod.Message): void {
    if (flags[key]) return;
    flags[key] = true;
    displayWorldLog(message);
}



// --- SOURCE: src\king-of-the-hill-mode\live\services\koth-banner-service.ts ---


export class KothBannerService {
    public showObjectiveActivated(letter: string): void {
        this._showGlobal(mod.Message(mod.stringkeys.KothObjectiveActivated, letter));
    }

    public showObjectiveLocked(letter: string, seconds: number): void {
        this._showGlobal(mod.Message(mod.stringkeys.KothObjectiveLocked, letter, seconds));
    }

    public showObjectiveContested(letter: string): void {
        this._showGlobal(mod.Message(mod.stringkeys.KothObjectiveContested, letter));
    }

    public showVictoryImminent(team: mod.Team): void {
        this._showTeam(team, mod.Message(mod.stringkeys.KothVictoryImminent));
    }

    public showDefeatImminent(team: mod.Team): void {
        this._showTeam(team, mod.Message(mod.stringkeys.KothDefeatImminent));
    }

    public showMatchWon(team: mod.Team): void {
        this._showTeam(team, mod.Message(mod.stringkeys.KothMatchWon));
    }

    public showMatchLost(team: mod.Team): void {
        this._showTeam(team, mod.Message(mod.stringkeys.KothMatchLost));
    }

    private _showGlobal(message: mod.Message): void {
        mod.DisplayCustomNotificationMessage(message, mod.CustomNotificationSlots.HeaderText, 3);
        displayWorldLog(message);
    }

    private _showTeam(team: mod.Team, message: mod.Message): void {
        mod.DisplayCustomNotificationMessage(message, mod.CustomNotificationSlots.HeaderText, 3, team);
        displayWorldLog(message, team);
    }
}


// --- SOURCE: src\king-of-the-hill-mode\live\config\koth-sfx.ts ---
export const KOTH_SFX = {
    objectiveActivated: mod.RuntimeSpawn_Common.SFX_UI_Gamemode_Shared_CaptureObjectives_ObjetiveUnlockReveal_OneShot2D,
    objectiveLocked: mod.RuntimeSpawn_Common.SFX_UI_Gamemode_Shared_CaptureObjectives_ObjetiveUnlockCountdownTick_OneShot2D,
    objectiveContested: mod.RuntimeSpawn_Common.SFX_UI_Gamemode_Shared_CaptureObjectives_OnContested_OneShot2D,
    objectiveContestedLoop: mod.RuntimeSpawn_Common.SFX_UI_Gamemode_Shared_CaptureObjectives_OnContested_SimpleLoop2D,
    objectiveEnterFriendly: mod.RuntimeSpawn_Common.SFX_UI_Gamemode_Shared_CaptureObjectives_CapturingThumpFriendly_OneShot2D,
    objectiveEnterEnemy: mod.RuntimeSpawn_Common.SFX_UI_Gamemode_Shared_CaptureObjectives_CapturingThumpEnemy_OneShot2D,
    victoryImminent: mod.RuntimeSpawn_Common.SFX_UI_Notification_SharedGamemode_GameModeCritical_OneShot2D,
    defeatImminent: mod.RuntimeSpawn_Common.SFX_GameModes_BR_Circle_DeathWarning_SimpleLoop2D,
    matchWon: mod.RuntimeSpawn_Common.SFX_UI_Gauntlet_EOM_Qualified_OneShot2D,
    matchLost: mod.RuntimeSpawn_Common.SFX_UI_Gauntlet_EOM_Defeat_OneShot2D,
    timerWarning: mod.RuntimeSpawn_Common.SFX_UI_Gamemode_Shared_CaptureObjectives_ObjetiveUnlockCountdownRiser_OneShot2D,
} as const;


// --- SOURCE: src\king-of-the-hill-mode\live\services\koth-sfx-service.ts ---



const KOTH_OBJECTIVE_ENTER_SFX_COOLDOWN_MS = 750;

export class KothSfxService {
    private _initialized = false;
    private _objectiveActivated?: mod.SFX;
    private _objectiveLocked?: mod.SFX;
    private _objectiveContested?: mod.SFX;
    private _objectiveContestedLoop?: mod.SFX;
    private _objectiveEnterFriendly?: mod.SFX;
    private _objectiveEnterEnemy?: mod.SFX;
    private _victoryImminent?: mod.SFX;
    private _matchWon?: mod.SFX;
    private _matchLost?: mod.SFX;
    private _timerWarning?: mod.SFX;
    private readonly _lastObjectiveEnterSfxAtMsByPlayerId: Record<number, number> = {};
    private readonly _contestedLoopPlayerById = new Map<number, mod.Player>();

    public ensureSpawned(): void {
        if (this._initialized) return;
        this._initialized = true;

        this._objectiveActivated = this._spawn(KOTH_SFX.objectiveActivated);
        this._objectiveLocked = this._spawn(KOTH_SFX.objectiveLocked);
        this._objectiveContested = this._spawn(KOTH_SFX.objectiveContested);
        this._objectiveContestedLoop = this._spawn(KOTH_SFX.objectiveContestedLoop);
        this._objectiveEnterFriendly = this._spawn(KOTH_SFX.objectiveEnterFriendly);
        this._objectiveEnterEnemy = this._spawn(KOTH_SFX.objectiveEnterEnemy);
        this._victoryImminent = this._spawn(KOTH_SFX.victoryImminent);
        this._matchWon = this._spawn(KOTH_SFX.matchWon);
        this._matchLost = this._spawn(KOTH_SFX.matchLost);
        this._timerWarning = this._spawn(KOTH_SFX.timerWarning);
    }

    public playObjectiveActivated(): void {
        this._playGlobal(this._objectiveActivated, 1);
    }

    public playObjectiveLocked(): void {
        this._playGlobal(this._objectiveLocked, 0.8);
    }

    public playObjectiveContestedForPlayers(players: readonly mod.Player[]): void {
        for (const player of players) {
            this._playPlayer(this._objectiveContested, 0.8, player);
        }
    }

    public playObjectiveEnter(player: mod.Player, isFriendly: boolean): void {
        if (!this._isHumanPlayer(player)) return;

        const playerId = getKothPlayerId(player);
        const now = this._getMatchTimeMs();
        const lastPlayedAt = this._lastObjectiveEnterSfxAtMsByPlayerId[playerId] ?? -999999;
        if (now - lastPlayedAt < KOTH_OBJECTIVE_ENTER_SFX_COOLDOWN_MS) return;

        this._lastObjectiveEnterSfxAtMsByPlayerId[playerId] = now;
        this._playPlayer(isFriendly ? this._objectiveEnterFriendly : this._objectiveEnterEnemy, 0.8, player);
    }

    public syncObjectiveContestedLoopForPlayers(players: readonly mod.Player[]): void {
        const activePlayerIds = new Set<number>();

        for (const player of players) {
            if (!this._isHumanPlayer(player)) continue;

            const playerId = getKothPlayerId(player);
            activePlayerIds.add(playerId);
            if (this._contestedLoopPlayerById.has(playerId)) continue;
            if (!this._objectiveContestedLoop) continue;

            this._playPlayer(this._objectiveContestedLoop, 0.8, player);
            this._contestedLoopPlayerById.set(playerId, player);
        }

        this._contestedLoopPlayerById.forEach((player, playerId) => {
            if (activePlayerIds.has(playerId)) return;

            this._stopPlayer(this._objectiveContestedLoop, player);
            this._contestedLoopPlayerById.delete(playerId);
        });
    }

    public stopObjectiveContestedLoops(): void {
        this._contestedLoopPlayerById.forEach((player) => {
            this._stopPlayer(this._objectiveContestedLoop, player);
        });
        this._contestedLoopPlayerById.clear();
    }

    public clearPlayerAudioState(playerId: number): void {
        const contestedLoopPlayer = this._contestedLoopPlayerById.get(playerId);
        if (contestedLoopPlayer) {
            this._stopPlayer(this._objectiveContestedLoop, contestedLoopPlayer);
            this._contestedLoopPlayerById.delete(playerId);
        }

        delete this._lastObjectiveEnterSfxAtMsByPlayerId[playerId];
    }

    public resetPlayerAudioState(): void {
        this.stopObjectiveContestedLoops();

        for (const playerId in this._lastObjectiveEnterSfxAtMsByPlayerId) {
            delete this._lastObjectiveEnterSfxAtMsByPlayerId[Number(playerId)];
        }
    }

    public playVictoryImminent(team: mod.Team): void {
        this._playTeam(this._victoryImminent, 0.9, team);
    }

    public playMatchWon(team: mod.Team): void {
        this._playTeam(this._matchWon, 1, team);
    }

    public playMatchLost(team: mod.Team): void {
        this._playTeam(this._matchLost, 1, team);
    }

    public playTimerWarning(): void {
        this._playGlobal(this._timerWarning, 0.8);
    }

    private _spawn(prefab: mod.RuntimeSpawn_Common): mod.SFX | undefined {
        try {
            return mod.SpawnObject(
                prefab,
                mod.CreateVector(0, 0, 0),
                mod.CreateVector(0, 0, 0),
                mod.CreateVector(0, 0, 0)
            ) as mod.SFX;
        } catch (_err) {
            return undefined;
        }
    }

    private _playGlobal(sound: mod.SFX | undefined, amplitude: number): void {
        if (!sound) return;
        mod.PlaySound(sound, amplitude);
    }

    private _playTeam(sound: mod.SFX | undefined, amplitude: number, team: mod.Team): void {
        if (!sound) return;
        mod.PlaySound(sound, amplitude, team);
    }

    private _playPlayer(sound: mod.SFX | undefined, amplitude: number, player: mod.Player): void {
        if (!sound || !this._isHumanPlayer(player)) return;
        mod.PlaySound(sound, amplitude, player);
    }

    private _stopPlayer(sound: mod.SFX | undefined, player: mod.Player): void {
        if (!sound || !mod.IsPlayerValid(player)) return;

        try {
            mod.StopSound(sound, player);
        } catch (_err) {
            return;
        }
    }

    private _isHumanPlayer(player: mod.Player): boolean {
        return mod.IsPlayerValid(player) && !this._isAiSoldier(player);
    }

    private _isAiSoldier(player: mod.Player): boolean {
        try {
            return mod.GetSoldierState(player, mod.SoldierStateBool.IsAISoldier);
        } catch (_err) {
            return false;
        }
    }

    private _getMatchTimeMs(): number {
        return mod.GetMatchTimeElapsed() * 1000;
    }
}


// --- SOURCE: src\king-of-the-hill-mode\live\services\koth-hill-service.ts ---







export class KothHillService {
    public constructor(
        private readonly _context: KothLiveModeContext,
        private readonly _bannerService: KothBannerService,
        private readonly _sfxService: KothSfxService
    ) {}

    public initializeForMatch(): void {
        this._context.runtime.hill.playerIdsByAreaTriggerId.clear();

        for (const triggerId of KOTH_HILL_AREA_TRIGGER_IDS) {
            this._context.runtime.hill.playerIdsByAreaTriggerId.set(triggerId, new Set<number>());
            this._safeEnableAreaTrigger(triggerId, true);
        }

        for (const capturePointId of KOTH_HILL_CAPTURE_POINT_IDS) {
            this._safeConfigureCapturePoint(capturePointId);
        }

        this.activateHill(0, false, true);
    }

    public reset(): void {
        this._context.runtime.hill.activeHillTeam1Players.clear();
        this._context.runtime.hill.activeHillTeam2Players.clear();
        this._context.runtime.hill.playerIdsByAreaTriggerId.clear();
        this._context.runtime.hill.activeLockRemainingSeconds = 0;
        this._context.runtime.hill.currentControlState = 'inactive';
        this._context.runtime.hill.currentOwnerState = 'neutral';
        this._disableAllObjectiveLayers();

        for (const triggerId of KOTH_HILL_AREA_TRIGGER_IDS) {
            this._safeEnableAreaTrigger(triggerId, false);
        }

        this._sfxService.stopObjectiveContestedLoops();
    }

    public activateHill(index: number, announce: boolean = true, useInitialLock: boolean = false): void {
        const hillCount = this._context.hills.length;
        const normalizedIndex = ((index % hillCount) + hillCount) % hillCount;
        const nextIndex = (normalizedIndex + 1) % hillCount;
        const hill = this._context.hills[normalizedIndex];
        const shouldLock = useInitialLock && this._context.rules.initialObjectiveLockSeconds > 0;

        this._context.runtime.hill.currentHillIndex = normalizedIndex;
        this._context.runtime.hill.currentHillLetter = hill.letter;
        this._context.runtime.hill.nextHillIndex = nextIndex;
        this._context.runtime.hill.activeObjectiveRemainingSeconds = this._context.rules.objectiveDurationSeconds;
        this._context.runtime.hill.activeLockRemainingSeconds = shouldLock
            ? this._context.rules.initialObjectiveLockSeconds
            : 0;
        this._context.runtime.hill.nextPreviewRemainingSeconds = 0;
        this._context.runtime.hill.currentControlState = shouldLock ? 'locked' : 'neutral';
        this._context.runtime.hill.currentOwnerState = 'neutral';
        this._context.runtime.hudDirty = true;

        this.updateActiveHillState(true);
        this._applyObjectiveLayers();

        if (announce) {
            this._bannerService.showObjectiveActivated(hill.letter);
            this._sfxService.playObjectiveActivated();
        }
    }

    public tickObjectiveTimer(): void {
        const runtime = this._context.runtime;
        if (!runtime.isMatchActive) return;

        if (runtime.hill.activeLockRemainingSeconds > 0) {
            runtime.hill.activeLockRemainingSeconds -= 1;
            if (runtime.hill.activeLockRemainingSeconds <= 0) {
                runtime.hill.activeLockRemainingSeconds = 0;
                this._unlockActiveHill();
            } else {
                runtime.hudDirty = true;
                this._applyObjectiveLayers();
            }
            return;
        }

        runtime.hill.activeObjectiveRemainingSeconds -= 1;
        if (runtime.hill.activeObjectiveRemainingSeconds <= 0) {
            this.activateHill(runtime.hill.nextHillIndex, true);
            return;
        }

        if (runtime.hill.activeObjectiveRemainingSeconds <= this._context.rules.nextObjectivePreviewSeconds) {
            runtime.hill.nextPreviewRemainingSeconds = runtime.hill.activeObjectiveRemainingSeconds;
            this._applyObjectiveLayers();

            if (runtime.hill.nextPreviewRemainingSeconds === this._context.rules.nextObjectivePreviewSeconds) {
                const previewHill = this._context.hills[runtime.hill.nextHillIndex];
                this._bannerService.showObjectiveLocked(previewHill.letter, runtime.hill.nextPreviewRemainingSeconds);
                this._sfxService.playObjectiveLocked();
            }
        } else {
            runtime.hill.nextPreviewRemainingSeconds = 0;
        }

        runtime.hudDirty = true;
    }

    public updateActiveHillState(forceVisualSync: boolean = false): void {
        const hillState = this._context.runtime.hill;
        const previousState = hillState.currentControlState;
        const previousOwnerState = hillState.currentOwnerState;
        const previousTeam1Players = [...hillState.activeHillTeam1Players];
        const previousTeam2Players = [...hillState.activeHillTeam2Players];
        this._syncActivePresence();
        const membershipChanged =
            !this._hasSamePlayerIds(previousTeam1Players, hillState.activeHillTeam1Players) ||
            !this._hasSamePlayerIds(previousTeam2Players, hillState.activeHillTeam2Players);

        if (previousState === 'locked') {
            if (forceVisualSync) {
                hillState.currentOwnerState = 'neutral';
                this._context.runtime.hudDirty = true;
                this._applyObjectiveLayers();
            } else if (membershipChanged) {
                this._context.runtime.hudDirty = true;
            }
            this._syncObjectiveContestedLoop();
            return;
        }

        const nextState = this._resolveControlState();
        const nextOwnerState = this._resolveOwnerState(nextState, previousOwnerState);

        if (previousState !== nextState || previousOwnerState !== nextOwnerState || forceVisualSync) {
            hillState.currentControlState = nextState;
            hillState.currentOwnerState = nextOwnerState;
            this._context.runtime.hudDirty = true;
            this._applyObjectiveLayers();

            if (nextState === 'contested' && previousState !== 'contested') {
                this._bannerService.showObjectiveContested(this._context.runtime.hill.currentHillLetter);
                this._sfxService.playObjectiveContestedForPlayers(this._getActiveHillHumanPlayers());
            }
        } else if (membershipChanged) {
            this._context.runtime.hudDirty = true;
        }

        this._syncObjectiveContestedLoop();
    }

    public onPlayerEnterAreaTrigger(eventPlayer: mod.Player, eventAreaTrigger: mod.AreaTrigger): boolean {
        const triggerId = this._getAreaTriggerId(eventAreaTrigger);
        if (triggerId === undefined || !this._isHillAreaTrigger(triggerId)) return false;
        if (!mod.IsPlayerValid(eventPlayer)) return true;

        const playerId = getKothPlayerId(eventPlayer);
        if (!this._isLivingDeployedParticipant(eventPlayer)) {
            this._getPlayersForAreaTrigger(triggerId).delete(playerId);
            this.updateActiveHillState();
            return true;
        }

        this._getPlayersForAreaTrigger(triggerId).add(playerId);
        this._playObjectiveEnterSfx(eventPlayer, triggerId);
        this.updateActiveHillState();
        return true;
    }

    public onPlayerExitAreaTrigger(eventPlayer: mod.Player, eventAreaTrigger: mod.AreaTrigger): boolean {
        const triggerId = this._getAreaTriggerId(eventAreaTrigger);
        if (triggerId === undefined || !this._isHillAreaTrigger(triggerId)) return false;
        if (!mod.IsPlayerValid(eventPlayer)) return true;

        const playerId = getKothPlayerId(eventPlayer);
        this._getPlayersForAreaTrigger(triggerId).delete(playerId);
        this.updateActiveHillState();
        return true;
    }

    public removePlayerFromAllHills(playerId: number): void {
        this._context.runtime.hill.playerIdsByAreaTriggerId.forEach((playerIds) => playerIds.delete(playerId));

        const playerState = this._context.runtime.playersById.get(playerId);
        if (playerState) {
            playerState.isInsideActiveHill = false;
            playerState.activeHillAreaTriggerId = null;
            playerState.lastHillEnterTime = null;
        }

        this.updateActiveHillState();
    }

    public getActiveHillPlayerIds(): number[] {
        return [
            ...this._context.runtime.hill.activeHillTeam1Players,
            ...this._context.runtime.hill.activeHillTeam2Players,
        ];
    }

    public isActiveHillTrulyContested(): boolean {
        this._syncActivePresence();
        return (
            this._context.runtime.hill.activeHillTeam1Players.size > 0 &&
            this._context.runtime.hill.activeHillTeam2Players.size > 0
        );
    }

    private _getActiveHillHumanPlayers(): mod.Player[] {
        const players: mod.Player[] = [];

        for (const playerId of this.getActiveHillPlayerIds()) {
            const playerState = this._context.runtime.playersById.get(playerId);
            if (!playerState || playerState.isBot || !mod.IsPlayerValid(playerState.player)) continue;

            players.push(playerState.player);
        }

        return players;
    }

    private _playObjectiveEnterSfx(player: mod.Player, triggerId: number): void {
        const activeHill = this._context.hills[this._context.runtime.hill.currentHillIndex];
        if (!activeHill || triggerId !== activeHill.areaTriggerId) return;

        this._sfxService.playObjectiveEnter(player, this._isObjectiveEnterFriendly(player));
    }

    private _isObjectiveEnterFriendly(player: mod.Player): boolean {
        const ownerState = this._context.runtime.hill.currentOwnerState;
        if (ownerState === 'neutral') return true;

        const team = mod.GetTeam(player);
        if (ownerState === 'team1') return mod.Equals(team, KOTH_TEAM_1);
        if (ownerState === 'team2') return mod.Equals(team, KOTH_TEAM_2);
        return true;
    }

    private _syncObjectiveContestedLoop(): void {
        const hillState = this._context.runtime.hill;
        const isContested =
            hillState.currentControlState === 'contested' &&
            hillState.activeHillTeam1Players.size > 0 &&
            hillState.activeHillTeam2Players.size > 0;

        if (!isContested) {
            this._sfxService.syncObjectiveContestedLoopForPlayers([]);
            return;
        }

        this._sfxService.syncObjectiveContestedLoopForPlayers(this._getActiveHillHumanPlayers());
    }

    private _hasSamePlayerIds(previousPlayerIds: readonly number[], currentPlayerIds: Set<number>): boolean {
        if (previousPlayerIds.length !== currentPlayerIds.size) return false;

        for (const playerId of previousPlayerIds) {
            if (!currentPlayerIds.has(playerId)) return false;
        }

        return true;
    }

    private _syncActivePresence(): void {
        const hillState = this._context.runtime.hill;
        const activeHill = this._context.hills[hillState.currentHillIndex];
        const activePlayerIds = this._getPlayersForAreaTrigger(activeHill.areaTriggerId);
        const touchedPlayerIds = new Set<number>([
            ...hillState.activeHillTeam1Players,
            ...hillState.activeHillTeam2Players,
        ]);
        activePlayerIds.forEach((playerId) => touchedPlayerIds.add(playerId));

        hillState.activeHillTeam1Players.clear();
        hillState.activeHillTeam2Players.clear();

        touchedPlayerIds.forEach((playerId) => {
            const playerState = this._context.runtime.playersById.get(playerId);
            if (!playerState) return;

            playerState.isInsideActiveHill = false;
            playerState.activeHillAreaTriggerId = null;
        });

        activePlayerIds.forEach((playerId) => {
            const playerState = this._context.runtime.playersById.get(playerId);
            if (!playerState || !this._isLivingDeployedParticipant(playerState.player)) {
                activePlayerIds.delete(playerId);
                return;
            }

            const team = mod.GetTeam(playerState.player);
            playerState.setTeam(team);
            playerState.isInsideActiveHill = true;
            playerState.activeHillAreaTriggerId = activeHill.areaTriggerId;

            if (mod.Equals(team, KOTH_TEAM_1)) {
                hillState.activeHillTeam1Players.add(playerId);
            } else if (mod.Equals(team, KOTH_TEAM_2)) {
                hillState.activeHillTeam2Players.add(playerId);
            }
        });
    }

    private _resolveControlState(): KothHillControlState {
        const hasTeam1 = this._context.runtime.hill.activeHillTeam1Players.size > 0;
        const hasTeam2 = this._context.runtime.hill.activeHillTeam2Players.size > 0;

        if (hasTeam1 && hasTeam2) return 'contested';
        if (hasTeam1) return 'team1';
        if (hasTeam2) return 'team2';
        return 'neutral';
    }

    private _resolveOwnerState(
        controlState: KothHillControlState,
        previousOwnerState: KothHillOwnerState
    ): KothHillOwnerState {
        if (controlState === 'team1') return 'team1';
        if (controlState === 'team2') return 'team2';
        return previousOwnerState;
    }

    private _applyObjectiveLayers(): void {
        // KOTH uses area triggers, custom HUD, and custom world icons. Keeping native objectives
        // disabled prevents the engine capture-objective HUD from surfacing during revive flows.
        this._disableAllObjectiveLayers();
    }

    private _unlockActiveHill(): void {
        const activeHill = this._context.hills[this._context.runtime.hill.currentHillIndex];
        this._syncActivePresence();
        const nextState = this._resolveControlState();
        this._context.runtime.hill.currentControlState = nextState;
        this._context.runtime.hill.currentOwnerState = this._resolveOwnerState(nextState, 'neutral');
        this._context.runtime.hudDirty = true;
        this._applyObjectiveLayers();
        this._bannerService.showObjectiveActivated(activeHill.letter);
        this._sfxService.playObjectiveActivated();
    }

    private _getVisualObjectiveControlState(): KothHillControlState {
        const hillState = this._context.runtime.hill;
        if (hillState.currentControlState === 'contested' && hillState.currentOwnerState !== 'neutral') {
            return hillState.currentOwnerState;
        }

        return hillState.currentControlState;
    }

    private _disableAllObjectiveLayers(): void {
        for (const sectorId of KOTH_HILL_SECTOR_IDS) {
            this._safeEnableSector(sectorId, false);
        }

        for (const capturePointId of KOTH_HILL_CAPTURE_POINT_IDS) {
            this._safeEnableCapturePoint(capturePointId, false, KOTH_TEAM_NEUTRAL);
        }
    }

    private _safeConfigureCapturePoint(capturePointId: number): void {
        try {
            const capturePoint = mod.GetCapturePoint(capturePointId);
            mod.SetCapturePointCapturingTime(capturePoint, 9999);
            mod.SetCapturePointNeutralizationTime(capturePoint, 9999);
            mod.SetMaxCaptureMultiplier(capturePoint, 1);
            mod.EnableCapturePointDeploying(capturePoint, false);
            mod.EnableGameModeObjective(capturePoint, false);
        } catch (_err) {
            this._warnMissingObjective(capturePointId);
        }
    }

    private _safeEnableCapturePoint(capturePointId: number, enabled: boolean, owner: mod.Team): void {
        try {
            const capturePoint = mod.GetCapturePoint(capturePointId);
            mod.SetCapturePointOwner(capturePoint, owner);
            mod.EnableGameModeObjective(capturePoint, enabled);
        } catch (_err) {
            this._warnMissingObjective(capturePointId);
        }
    }

    private _safeEnableSector(sectorId: number, enabled: boolean): void {
        try {
            mod.EnableGameModeObjective(mod.GetSector(sectorId), enabled);
        } catch (_err) {
            this._warnMissingObjective(sectorId);
        }
    }

    private _safeEnableAreaTrigger(triggerId: number, enabled: boolean): void {
        try {
            mod.EnableAreaTrigger(mod.GetAreaTrigger(triggerId), enabled);
        } catch (_err) {
            this._warnMissingObjective(triggerId);
        }
    }

    private _warnMissingObjective(objectId: number): void {
        const warnings = this._context.runtime.warnedMissingObjectiveIds;
        if (warnings[objectId]) return;

        warnings[objectId] = true;
        displayWorldLog(mod.Message("[KOTH] Missing or unavailable objective object {}", objectId));
    }

    private _getAreaTriggerId(eventAreaTrigger: mod.AreaTrigger): number | undefined {
        try {
            return mod.GetObjId(eventAreaTrigger);
        } catch (_err) {
            return undefined;
        }
    }

    private _isHillAreaTrigger(triggerId: number): boolean {
        return KOTH_HILL_AREA_TRIGGER_IDS.indexOf(triggerId) >= 0;
    }

    private _getPlayersForAreaTrigger(triggerId: number): Set<number> {
        const existing = this._context.runtime.hill.playerIdsByAreaTriggerId.get(triggerId);
        if (existing) return existing;

        const created = new Set<number>();
        this._context.runtime.hill.playerIdsByAreaTriggerId.set(triggerId, created);
        return created;
    }

    private _isLivingDeployedParticipant(player: mod.Player): boolean {
        if (!mod.IsPlayerValid(player)) return false;

        const playerState = this._context.runtime.playersById.get(getKothPlayerId(player));
        if (!playerState?.isDeployed) return false;

        const team = mod.GetTeam(player);
        return isParticipantTeam(team) && isKothPlayerLiving(player);
    }
}



// --- SOURCE: src\king-of-the-hill-mode\live\services\koth-scoreboard-service.ts ---



export class KothScoreboardService {
    public constructor(private readonly _context: KothLiveModeContext) {}

    public configure(): void {
        mod.SetScoreboardType(mod.ScoreboardType.CustomTwoTeams);
        mod.SetScoreboardColumnNames(
            mod.Message(mod.stringkeys.KothScoreboardScore),
            mod.Message(mod.stringkeys.KothScoreboardKills),
            mod.Message(mod.stringkeys.KothScoreboardDeaths),
            mod.Message(mod.stringkeys.KothScoreboardAssists),
            mod.Message(mod.stringkeys.KothScoreboardHillTime)
        );
        mod.SetScoreboardColumnWidths(80, 70, 70, 80, 100);
        mod.SetScoreboardSorting(1, true);
    }

    public updateAll(): void {
        this._context.runtime.playersById.forEach((playerState) => this.updatePlayer(playerState.id));
        this._context.runtime.scoreboardDirty = false;
    }

    public updatePlayer(playerId: number): void {
        const playerState = this._context.runtime.playersById.get(playerId);
        if (!playerState) return;
        if (!mod.IsPlayerValid(playerState.player)) return;
        if (!isParticipantTeam(mod.GetTeam(playerState.player))) return;

        const snapshot = playerState.getScoreboardSnapshot();
        mod.SetScoreboardPlayerValues(
            playerState.player,
            snapshot[0],
            snapshot[1],
            snapshot[2],
            snapshot[3],
            snapshot[4]
        );
    }
}


// --- SOURCE: src\king-of-the-hill-mode\live\services\koth-score-service.ts ---







export class KothScoreService {
    public constructor(
        private readonly _context: KothLiveModeContext,
        private readonly _hillService: KothHillService,
        private readonly _scoreboardService: KothScoreboardService,
        private readonly _bannerService: KothBannerService,
        private readonly _sfxService: KothSfxService
    ) {}

    public resetScores(): void {
        this._context.runtime.team1Score = 0;
        this._context.runtime.team2Score = 0;
        this._context.runtime.victoryImminentShownTeam1 = false;
        this._context.runtime.victoryImminentShownTeam2 = false;
        this.syncGameModeScores(true);
    }

    public syncGameModeScores(_force: boolean = false): void {
        mod.SetGameModeScore(KOTH_TEAM_1, this._context.runtime.team1Score);
        mod.SetGameModeScore(KOTH_TEAM_2, this._context.runtime.team2Score);
    }

    public tickScore(): mod.Team | null {
        const runtime = this._context.runtime;
        if (!runtime.isMatchActive) return null;

        this._awardHillTime();

        if (runtime.hill.currentControlState === 'team1') {
            runtime.team1Score += this._context.rules.scorePerOwnedSecond;
        } else if (runtime.hill.currentControlState === 'team2') {
            runtime.team2Score += this._context.rules.scorePerOwnedSecond;
        }

        if (runtime.team1Score > this._context.rules.scoreToWin) runtime.team1Score = this._context.rules.scoreToWin;
        if (runtime.team2Score > this._context.rules.scoreToWin) runtime.team2Score = this._context.rules.scoreToWin;

        this._checkImminentBanners();
        this.syncGameModeScores();
        runtime.scoreboardDirty = true;
        runtime.hudDirty = true;

        if (runtime.team1Score >= this._context.rules.scoreToWin) return KOTH_TEAM_1;
        if (runtime.team2Score >= this._context.rules.scoreToWin) return KOTH_TEAM_2;
        return null;
    }

    public addKillScore(player: mod.Player): void {
        const playerState = this._context.runtime.playersById.get(mod.GetObjId(player));
        if (!playerState) return;

        playerState.addKill();
        playerState.addScore(100);
        this._context.runtime.scoreboardDirty = true;
    }

    public addDeath(player: mod.Player): void {
        const playerState = this._context.runtime.playersById.get(mod.GetObjId(player));
        if (!playerState) return;

        playerState.addDeath();
        this._context.runtime.scoreboardDirty = true;
    }

    public addAssistScore(player: mod.Player): void {
        const playerState = this._context.runtime.playersById.get(mod.GetObjId(player));
        if (!playerState) return;

        playerState.addAssist();
        playerState.addScore(50);
        this._context.runtime.scoreboardDirty = true;
    }

    private _awardHillTime(): void {
        if (this._context.runtime.hill.currentControlState === 'locked') return;

        for (const playerId of this._hillService.getActiveHillPlayerIds()) {
            const playerState = this._context.runtime.playersById.get(playerId);
            if (!playerState) continue;
            playerState.addHillTime(1);
        }
    }

    private _checkImminentBanners(): void {
        const runtime = this._context.runtime;

        if (!runtime.victoryImminentShownTeam1 && runtime.team1Score >= this._context.rules.victoryImminentScore) {
            runtime.victoryImminentShownTeam1 = true;
            this._bannerService.showVictoryImminent(KOTH_TEAM_1);
            this._bannerService.showDefeatImminent(KOTH_TEAM_2);
            this._sfxService.playVictoryImminent(KOTH_TEAM_1);
        }

        if (!runtime.victoryImminentShownTeam2 && runtime.team2Score >= this._context.rules.victoryImminentScore) {
            runtime.victoryImminentShownTeam2 = true;
            this._bannerService.showVictoryImminent(KOTH_TEAM_2);
            this._bannerService.showDefeatImminent(KOTH_TEAM_1);
            this._sfxService.playVictoryImminent(KOTH_TEAM_2);
        }
    }
}


// --- SOURCE: src\king-of-the-hill-mode\live\services\koth-work-queue-service.ts ---


export type KothWorkQueueLane = 'critical' | 'startup' | 'spawn' | 'ui' | 'world' | 'maintenance';

interface KothQueuedWorkJob {
    callback: () => void;
    key?: string;
}

interface KothWorkQueueLaneState {
    jobs: KothQueuedWorkJob[];
    readIndex: number;
    keys: Set<string>;
}

export interface KothWorkQueueDiagnosticsSnapshot {
    queuedByLane: Record<KothWorkQueueLane, number>;
    processedByLane: Record<KothWorkQueueLane, number>;
    mergedJobs: number;
}

const KOTH_WORK_QUEUE_LANES: readonly KothWorkQueueLane[] = [
    'critical',
    'startup',
    'spawn',
    'ui',
    'world',
    'maintenance',
] as const;

const KOTH_ROTATING_WORK_QUEUE_LANES: readonly KothWorkQueueLane[] = [
    'startup',
    'spawn',
    'ui',
    'world',
    'maintenance',
] as const;

export class KothWorkQueueService {
    private readonly _queues: Record<KothWorkQueueLane, KothWorkQueueLaneState> = {
        critical: this._createLaneState(),
        startup: this._createLaneState(),
        spawn: this._createLaneState(),
        ui: this._createLaneState(),
        world: this._createLaneState(),
        maintenance: this._createLaneState(),
    };
    private readonly _processedByLane: Record<KothWorkQueueLane, number> = {
        critical: 0,
        startup: 0,
        spawn: 0,
        ui: 0,
        world: 0,
        maintenance: 0,
    };
    private _mergedJobs = 0;
    private _rotatingLaneCursor = 0;

    public constructor(private readonly _context: KothLiveModeContext) {}

    public enqueue(lane: KothWorkQueueLane, callback: () => void, key?: string): void {
        const queue = this._queues[lane];
        if (key && queue.keys.has(key)) {
            this._mergedJobs += 1;
            return;
        }

        queue.jobs.push({ callback, key });
        if (key) queue.keys.add(key);
    }

    public clearAll(): void {
        for (const lane of KOTH_WORK_QUEUE_LANES) {
            const queue = this._queues[lane];
            queue.jobs = [];
            queue.readIndex = 0;
            queue.keys.clear();
            this._processedByLane[lane] = 0;
        }
        this._mergedJobs = 0;
        this._rotatingLaneCursor = 0;
    }

    public getDiagnosticsSnapshot(): KothWorkQueueDiagnosticsSnapshot {
        return {
            queuedByLane: {
                critical: this._getQueuedCount('critical'),
                startup: this._getQueuedCount('startup'),
                spawn: this._getQueuedCount('spawn'),
                ui: this._getQueuedCount('ui'),
                world: this._getQueuedCount('world'),
                maintenance: this._getQueuedCount('maintenance'),
            },
            processedByLane: { ...this._processedByLane },
            mergedJobs: this._mergedJobs,
        };
    }

    public getLaneQueuedCount(lane: KothWorkQueueLane): number {
        return this._getQueuedCount(lane);
    }

    public getTotalQueuedCount(): number {
        let total = 0;
        for (const lane of KOTH_WORK_QUEUE_LANES) {
            total += this._getQueuedCount(lane);
        }

        return total;
    }

    public tick(): void {
        if (this._context.rules.workQueueBudgets.critical > 0 && this._processLane('critical')) return;

        for (let i = 0; i < KOTH_ROTATING_WORK_QUEUE_LANES.length; i++) {
            const lane = KOTH_ROTATING_WORK_QUEUE_LANES[
                this._rotatingLaneCursor % KOTH_ROTATING_WORK_QUEUE_LANES.length
            ];
            this._rotatingLaneCursor += 1;
            if (this._context.rules.workQueueBudgets[lane] <= 0) continue;
            if (this._processLane(lane)) return;
        }
    }

    private _processLane(lane: KothWorkQueueLane): boolean {
        const queue = this._queues[lane];
        if (queue.readIndex >= queue.jobs.length) {
            this._compactLane(queue);
            return false;
        }

        const job = queue.jobs[queue.readIndex];
        queue.readIndex += 1;

        if (job.key) queue.keys.delete(job.key);
        try {
            job.callback();
        } catch (_err) {
            // Keep the scheduler alive if one deferred job fails.
        } finally {
            this._processedByLane[lane] += 1;
        }

        this._compactLane(queue);
        return true;
    }

    private _compactLane(queue: KothWorkQueueLaneState): void {
        if (queue.readIndex <= 32 || queue.readIndex * 2 < queue.jobs.length) return;

        queue.jobs = queue.jobs.slice(queue.readIndex);
        queue.readIndex = 0;
    }

    private _createLaneState(): KothWorkQueueLaneState {
        return {
            jobs: [],
            readIndex: 0,
            keys: new Set<string>(),
        };
    }

    private _getQueuedCount(lane: KothWorkQueueLane): number {
        const queue = this._queues[lane];
        return queue.jobs.length - queue.readIndex;
    }
}


// --- SOURCE: src\king-of-the-hill-mode\live\services\koth-spawn-job-service.ts ---




export class KothSpawnJobService {
    private _processor: ((job: KothSpawnJob) => void) | undefined;
    private _pendingReadIndex = 0;
    private _urgentJobs: KothSpawnJob[] = [];
    private _urgentReadIndex = 0;

    public constructor(
        private readonly _context: KothLiveModeContext,
        private readonly _workQueueService: KothWorkQueueService
    ) {}

    public setProcessor(processor: (job: KothSpawnJob) => void): void {
        this._processor = processor;
    }

    public enqueue(job: KothSpawnJob): void {
        if (this._pendingReadIndex > this._context.runtime.spawn.pendingJobs.length) {
            this._pendingReadIndex = 0;
        }

        this._context.runtime.spawn.pendingJobs.push(job);
        this._requestPump();
    }

    public enqueueFront(job: KothSpawnJob): void {
        if (this._urgentReadIndex > this._urgentJobs.length) {
            this._urgentReadIndex = 0;
        }

        this._urgentJobs.push(job);
        this._requestPump();
    }

    public clearAll(): void {
        this._context.runtime.spawn.pendingJobs = [];
        this._pendingReadIndex = 0;
        this._urgentJobs = [];
        this._urgentReadIndex = 0;
    }

    public clearPlayerJobs(playerId: number): void {
        this._context.runtime.spawn.pendingJobs = this._context.runtime.spawn.pendingJobs
            .slice(this._pendingReadIndex)
            .filter((job) => job.playerId !== playerId);
        this._pendingReadIndex = 0;

        this._urgentJobs = this._urgentJobs.slice(this._urgentReadIndex).filter(
            (job) => job.playerId !== playerId
        );
        this._urgentReadIndex = 0;
    }

    public tick(processor?: (job: KothSpawnJob) => void): void {
        const activeProcessor = processor ?? this._processor;
        if (!activeProcessor) return;

        const maxJobs = this._context.spawns.rules.spawnJobsPerTick;
        let processed = 0;

        while (processed < maxJobs) {
            const job = this._nextJob();
            if (!job) break;

            try {
                activeProcessor(job);
            } catch (_err) {
                // Keep later spawn jobs moving if one player/job fails.
            }
            processed += 1;
        }

        this._compactQueues();
        if (this._hasPendingJobs()) this._requestPump();
    }

    private _nextJob(): KothSpawnJob | undefined {
        if (this._urgentReadIndex < this._urgentJobs.length) {
            const job = this._urgentJobs[this._urgentReadIndex];
            this._urgentReadIndex += 1;
            return job;
        }

        if (this._pendingReadIndex < this._context.runtime.spawn.pendingJobs.length) {
            const job = this._context.runtime.spawn.pendingJobs[this._pendingReadIndex];
            this._pendingReadIndex += 1;
            return job;
        }

        return undefined;
    }

    private _requestPump(): void {
        this._workQueueService.enqueue('spawn', () => this.tick(), 'spawn:pump');
    }

    private _hasPendingJobs(): boolean {
        return (
            this._urgentReadIndex < this._urgentJobs.length ||
            this._pendingReadIndex < this._context.runtime.spawn.pendingJobs.length
        );
    }

    private _compactQueues(): void {
        if (this._urgentReadIndex > 32 && this._urgentReadIndex * 2 >= this._urgentJobs.length) {
            this._urgentJobs = this._urgentJobs.slice(this._urgentReadIndex);
            this._urgentReadIndex = 0;
        }

        const pendingJobs = this._context.runtime.spawn.pendingJobs;
        if (this._pendingReadIndex > 32 && this._pendingReadIndex * 2 >= pendingJobs.length) {
            this._context.runtime.spawn.pendingJobs = pendingJobs.slice(this._pendingReadIndex);
            this._pendingReadIndex = 0;
        }
    }
}


// --- SOURCE: src\king-of-the-hill-mode\live\services\koth-spawn-service.ts ---










const KOTH_REINFORCEMENT_TARGET_TTL_MS = 15000;
const KOTH_FORBIDDEN_SPAWN_POSITION_EPSILON_METERS = 8;
const KOTH_TELEPORT_ORIENTATION_CONFIRM_DELAY_MS = 100;
const KOTH_TELEPORT_ORIENTATION_CONFIRM_DOT_TOLERANCE = 0.85;
const KOTH_LIVE_START_DEPLOY_RECOVERY_DELAY_MS = 250;
const KOTH_LIVE_START_DEPLOY_RECOVERY_WINDOW_MS = 3000;
const KOTH_LIVE_START_DEPLOY_RECOVERY_MAX_ATTEMPTS = 8;

interface ResolvedKothSpawnDestination {
    position: mod.Vector;
    orientationRadians: number;
    label: string;
    pressureZones: readonly KothPresenceZone[];
    anchorObjectId?: number;
}

interface ScoredSpawnCandidateSelection {
    candidate: KothSpawnCandidateScore;
    anchorIndex: number;
}

interface KothSpawnSectorChoice {
    teamSide: KothCardinalSide;
    variantSide: KothCardinalSide;
}

interface KothSpawnSidePressure {
    friendlyCount: number;
    enemyCount: number;
    nearestFriendlyDistanceMeters: number;
    nearestEnemyDistanceMeters: number;
}

interface KothSpawnSidePressurePair {
    firstSide: KothCardinalSide;
    secondSide: KothCardinalSide;
    firstPressure: KothSpawnSidePressure;
    secondPressure: KothSpawnSidePressure;
}

interface KothPreferredTeamSideDecision {
    side: KothCardinalSide;
    enemyDominantSide?: KothCardinalSide;
    isHardPressure: boolean;
}

interface KothSpawnEvaluationPlayer {
    playerState: KothPlayerState;
    playerId: number;
    teamId: KothTeamId;
    position: mod.Vector;
    positionVector: KothSpawnPositionVector;
    presenceZones?: Set<KothPresenceZone>;
}

interface KothSpawnEvaluationContext {
    teamId: KothTeamId;
    enemyTeamId: KothTeamId;
    activeObjectiveLetter: KothHillLetter;
    activeRegion: KothSpawnRegionConfig;
    activeObjectivePosition: mod.Vector;
    activeObjectiveVector: KothSpawnPositionVector;
    assignedTeamSide: KothCardinalSide;
    assignedVariantSide: KothCardinalSide;
    players: KothSpawnEvaluationPlayer[];
}

export class KothSpawnService {
    private readonly _forbiddenSpawnPositionByObjectId = new Map<number, mod.Vector>();
    private readonly _queueSpawnRetryTimeoutByPlayerId = new Map<number, number>();
    private readonly _teleportRetryTimeoutByPlayerId = new Map<number, number>();
    private readonly _orientationConfirmTimeoutByPlayerId = new Map<number, number>();
    private readonly _deployRecoveryTimeoutByPlayerId = new Map<number, number>();

    public constructor(
        private readonly _context: KothLiveModeContext,
        private readonly _jobService: KothSpawnJobService
    ) {
        this._jobService.setProcessor((job) => this._processSpawnJob(job));
    }

    public configureLiveDeploySpawns(): void {
        this.configureLiveDeploySpawnCore();

        this._context.runtime.playersById.forEach((playerState) => {
            this.configureLiveDeploySpawnForPlayer(playerState.id);
        });
    }

    public configureLiveDeploySpawnCore(): void {
        mod.SetSpawnMode(mod.SpawnModes.Deploy);

        this._safeEnableHq(this._context.spawns.hqSpawners.team1, true);
        this._safeEnableHq(this._context.spawns.hqSpawners.team2, true);

        for (const hqId of this._context.spawns.disabledLegacyHqIds) {
            this._safeEnableHq(hqId, false);
        }

        this._initializePresenceAreaTriggers();
    }

    public configureLiveDeploySpawnForPlayer(playerId: number): void {
        const playerState = this._context.runtime.playersById.get(playerId);
        if (!playerState || !mod.IsPlayerValid(playerState.player)) return;

        if (this._isLivingDeployedParticipant(playerState)) {
            if (this.isPlayerAtForbiddenSpawnPosition(playerState.player)) {
                this.teleportToQueuedSpawn(playerState.player);
                return;
            }

            mod.SetRedeployTime(playerState.player, this._context.rules.redeployTimeSeconds);
            this._seedPlayerPresenceFromQueuedAnchor(playerState);
            this._context.runtime.spawn.queuedAnchorByPlayerId.delete(playerState.id);
            return;
        }

        this.queueSpawnForPlayer(playerState.player);
    }

    public reset(): void {
        this._jobService.clearAll();
        this._clearAllSpawnRetryTimeouts();
        this._context.runtime.spawn.queuedAnchorByPlayerId.clear();
        this._context.runtime.spawn.pendingQueueSpawnPlayerIds.clear();
        this._clearPresenceState();
        this._context.runtime.spawn.nextAnchorIndexBySectorKey = {};
        this._context.runtime.spawn.sideAssignmentByRegionId = {};
        this._context.runtime.spawn.sideAssignmentChangedAtMsByRegionId = {};
        this._context.runtime.spawn.reinforcementTargetByTeamId = {};
        this._context.runtime.spawn.anchorCooldownUntilMsByObjectId.clear();
        this._context.runtime.spawn.anchorPositionByObjectId.clear();
        this._context.runtime.spawn.anchorPositionVectorByObjectId.clear();
        this._context.runtime.spawn.capturePointPositionByObjectId.clear();
        this._context.runtime.spawn.capturePointPositionVectorByObjectId.clear();
        this._context.runtime.spawn.playerPositionSnapshotByPlayerId.clear();

        for (const triggerId of KOTH_PRESENCE_ZONE_AREA_TRIGGER_IDS) {
            this._safeEnablePresenceAreaTrigger(triggerId, false);
        }
    }

    public clearSpawnJobs(): void {
        this._jobService.clearAll();
        this._clearAllSpawnRetryTimeouts();
        this._context.runtime.spawn.pendingQueueSpawnPlayerIds.clear();
    }

    public onObjectiveActivated(): void {
        this._jobService.clearAll();
        this._clearAllSpawnRetryTimeouts();
        this._context.runtime.spawn.queuedAnchorByPlayerId.clear();
        this._context.runtime.spawn.pendingQueueSpawnPlayerIds.clear();
        this._context.runtime.spawn.sideAssignmentByRegionId = {};
        this._context.runtime.spawn.sideAssignmentChangedAtMsByRegionId = {};
        this._context.runtime.spawn.reinforcementTargetByTeamId = {};

        this._context.runtime.playersById.forEach((playerState) => {
            if (!mod.IsPlayerValid(playerState.player) || playerState.isDeployed) return;

            this._requestAnchorSpawnForPlayerState(playerState, 0);
        });
    }

    public queueSpawnForPlayer(player: mod.Player): void {
        if (!mod.IsPlayerValid(player)) return;

        const teamId = getKothTeamId(mod.GetTeam(player));
        if (teamId !== 1 && teamId !== 2) return;

        const playerId = getKothPlayerId(player);
        const playerState = this._context.runtime.playersById.get(playerId);
        if (playerState) {
            this._requestAnchorSpawnForPlayerState(playerState, 0);
            return;
        }

        this._enqueueQueueSpawnJob(playerId, 0);
    }

    public recoverLiveStartPlayer(playerState: KothPlayerState): void {
        if (!mod.IsPlayerValid(playerState.player)) return;

        const teamId = getKothTeamId(mod.GetTeam(playerState.player));
        if (teamId !== 1 && teamId !== 2) return;

        playerState.isDeployed = false;
        this._clearLiveInputRestrictions(playerState.player);
        mod.SetRedeployTime(playerState.player, this._context.rules.redeployTimeSeconds);
        this.clearPlayerPresenceCache(playerState.id);
        this._requestAnchorSpawnForPlayerState(playerState, 0);
        this._tryRecoverLiveStartDeploy(playerState);
        this._enqueueLiveStartDeployRecoveryJob(
            playerState.id,
            0,
            KOTH_LIVE_START_DEPLOY_RECOVERY_DELAY_MS,
            this._getMatchTimeMs()
        );
    }

    public queueSpawnForPlayerNow(player: mod.Player): void {
        if (!mod.IsPlayerValid(player)) return;

        const teamId = getKothTeamId(mod.GetTeam(player));
        if (teamId !== 1 && teamId !== 2) return;

        const playerId = getKothPlayerId(player);
        const activeLetter = this._context.runtime.hill.currentHillLetter;
        const candidate = this._selectBestSpawnCandidateForTeam(teamId, activeLetter);
        if (!candidate) {
            this._warnMissingAnchorsOnce();
            const playerState = this._context.runtime.playersById.get(playerId);
            if (playerState) this._requestAnchorSpawnForPlayerState(playerState, 1);
            return;
        }

        this._queueCandidateForPlayer(playerId, candidate, activeLetter);
    }

    public teleportToQueuedSpawn(player: mod.Player): boolean {
        if (!mod.IsPlayerValid(player)) return false;

        const playerId = getKothPlayerId(player);
        const playerState = this._context.runtime.playersById.get(playerId);
        if (playerState && this._tryTeleportDeployedPlayer(playerState)) return true;

        if (playerState) {
            this._enqueueTeleportDeployedJob(playerState.id, 0);
            this._undeployUnanchoredPlayer(playerState);
        }
        return false;
    }

    public isPlayerAtForbiddenSpawnPosition(player: mod.Player): boolean {
        if (!mod.IsPlayerValid(player)) return false;

        const playerPosition = this._getPlayerPosition(player);
        if (!playerPosition) return false;

        if (this._isNearForbiddenSpawnObject(playerPosition, this._context.spawns.hqSpawners.team1)) return true;
        if (this._isNearForbiddenSpawnObject(playerPosition, this._context.spawns.hqSpawners.team2)) return true;

        for (const hqId of this._context.spawns.disabledLegacyHqIds) {
            if (this._isNearForbiddenSpawnObject(playerPosition, hqId)) return true;
        }

        return false;
    }

    public processSpawnJobs(): void {
        this._jobService.tick((job) => this._processSpawnJob(job));
    }

    public onPlayerEnterAreaTrigger(eventPlayer: mod.Player, eventAreaTrigger: mod.AreaTrigger): boolean {
        const zone = this._getPresenceZoneFromAreaTrigger(eventAreaTrigger);
        if (!zone) return false;
        if (!mod.IsPlayerValid(eventPlayer)) return true;

        const playerId = getKothPlayerId(eventPlayer);
        const playerState = this._context.runtime.playersById.get(playerId);
        if (!playerState || !this._isLivingDeployedParticipant(playerState)) {
            this.clearPlayerPresenceCache(playerId);
            return true;
        }

        this._addPlayerToPresenceZone(playerId, zone);
        this._flipVariantAssignmentForExactSectorIntrusion(playerId, zone);
        this._recordReinforcementTargetIfEnemySide(playerId, zone);
        return true;
    }

    public onPlayerExitAreaTrigger(eventPlayer: mod.Player, eventAreaTrigger: mod.AreaTrigger): boolean {
        const zone = this._getPresenceZoneFromAreaTrigger(eventAreaTrigger);
        if (!zone) return false;
        if (!mod.IsPlayerValid(eventPlayer)) return true;

        const playerId = getKothPlayerId(eventPlayer);
        this._removePlayerFromPresenceZone(playerId, zone);
        this._clearInvalidReinforcementTargetForPlayer(playerId);
        return true;
    }

    public removePlayerFromAllPresenceZones(playerId: number): void {
        this.clearPlayerPresenceCache(playerId);
        this.clearQueuedSpawn(playerId);
    }

    public clearPlayerPresenceCache(playerId: number): void {
        this._removePlayerFromAllPresenceZones(playerId);
        this._context.runtime.spawn.playerPositionSnapshotByPlayerId.delete(playerId);
        this._clearReinforcementTargetsForPlayer(playerId);
    }

    public clearQueuedSpawn(playerId: number): void {
        this._context.runtime.spawn.queuedAnchorByPlayerId.delete(playerId);
        this._jobService.clearPlayerJobs(playerId);
        this._clearSpawnRetryTimeoutsForPlayer(playerId);
        this._context.runtime.spawn.pendingQueueSpawnPlayerIds.delete(playerId);
    }

    public selectBestSpawnCandidate(
        player: mod.Player,
        teamId: KothTeamId,
        activeObjectiveLetter: KothHillLetter
    ): KothSpawnCandidateScore | undefined {
        if (!mod.IsPlayerValid(player)) return undefined;
        return this._selectBestSpawnCandidateForTeam(teamId, activeObjectiveLetter);
    }

    private _processSpawnJob(job: KothSpawnJob): void {
        if (job.kind === 'queue-spawn') {
            this._context.runtime.spawn.pendingQueueSpawnPlayerIds.delete(job.playerId);
        }

        const playerState = this._context.runtime.playersById.get(job.playerId);
        if (!playerState || !mod.IsPlayerValid(playerState.player)) return;

        if (job.kind === 'queue-spawn') {
            this._prepareQueuedAnchorForPlayer(playerState, job);
            return;
        }

        if (job.kind === 'confirm-teleport-orientation') {
            this._processTeleportOrientationConfirmJob(job, playerState);
            return;
        }

        if (job.kind === 'live-start-deploy-recovery') {
            this._processLiveStartDeployRecoveryJob(job, playerState);
            return;
        }

        this._processDeployTeleportJob(job, playerState);
    }

    private _prepareQueuedAnchorForPlayer(playerState: KothPlayerState, job: KothSpawnJob): void {
        if (!mod.IsPlayerValid(playerState.player)) return;

        if (this._isLivingDeployedParticipant(playerState)) {
            return;
        }

        const teamId = getKothTeamId(mod.GetTeam(playerState.player));
        if (teamId !== 1 && teamId !== 2) return;

        const activeLetter = this._context.runtime.hill.currentHillLetter;
        const candidate = this._selectBestSpawnCandidateForTeam(teamId, activeLetter);
        if (!candidate) {
            this._warnMissingAnchorsOnce();
            this._enqueueQueueSpawnJob(
                playerState.id,
                job.attempt + 1,
                this._context.spawns.rules.spawnRetryWindowMs
            );
            return;
        }

        this._queueCandidateForPlayer(playerState.id, candidate, activeLetter);
    }

    private _requestAnchorSpawnForPlayerState(playerState: KothPlayerState, attempt: number): void {
        if (!mod.IsPlayerValid(playerState.player)) return;
        if (this._isLivingDeployedParticipant(playerState)) return;

        this._context.runtime.spawn.queuedAnchorByPlayerId.delete(playerState.id);
        this._jobService.clearPlayerJobs(playerState.id);
        this._clearSpawnRetryTimeoutsForPlayer(playerState.id);
        this._context.runtime.spawn.pendingQueueSpawnPlayerIds.delete(playerState.id);
        if (attempt <= 0) {
            this._prepareQueuedAnchorForPlayer(playerState, {
                kind: 'queue-spawn',
                playerId: playerState.id,
                createdAtMs: this._getMatchTimeMs(),
                attempt,
            });
            return;
        }

        this._enqueueQueueSpawnJob(playerState.id, attempt);
    }

    private _enqueueQueueSpawnJob(playerId: number, attempt: number, delayMs = 0): void {
        if (this._context.runtime.spawn.pendingQueueSpawnPlayerIds.has(playerId)) return;

        if (delayMs > 0) {
            if (this._queueSpawnRetryTimeoutByPlayerId.has(playerId)) return;

            this._context.runtime.spawn.pendingQueueSpawnPlayerIds.add(playerId);
            const timeoutHandle = Timers.setTimeout(() => {
                this._queueSpawnRetryTimeoutByPlayerId.delete(playerId);
                this._context.runtime.spawn.pendingQueueSpawnPlayerIds.delete(playerId);
                if (!this._context.runtime.isMatchActive) return;
                const playerState = this._context.runtime.playersById.get(playerId);
                if (!playerState || !mod.IsPlayerValid(playerState.player)) return;
                if (this._isLivingDeployedParticipant(playerState)) return;

                this._enqueueQueueSpawnJob(playerId, attempt);
            }, delayMs);
            this._queueSpawnRetryTimeoutByPlayerId.set(playerId, timeoutHandle);
            return;
        }

        this._context.runtime.spawn.pendingQueueSpawnPlayerIds.add(playerId);
        this._jobService.enqueueFront({
            kind: 'queue-spawn',
            playerId,
            createdAtMs: this._getMatchTimeMs(),
            attempt,
        });
    }

    private _enqueueTeleportDeployedJob(playerId: number, attempt: number, delayMs = 0): void {
        if (delayMs > 0) {
            if (this._teleportRetryTimeoutByPlayerId.has(playerId)) return;

            const timeoutHandle = Timers.setTimeout(() => {
                this._teleportRetryTimeoutByPlayerId.delete(playerId);
                if (!this._context.runtime.isMatchActive) return;
                const playerState = this._context.runtime.playersById.get(playerId);
                if (!playerState || !this._isLivingDeployedParticipant(playerState)) return;

                this._enqueueTeleportDeployedJob(playerId, attempt);
            }, delayMs);
            this._teleportRetryTimeoutByPlayerId.set(playerId, timeoutHandle);
            return;
        }

        this._jobService.enqueueFront({
            kind: 'teleport-deployed',
            playerId,
            createdAtMs: this._getMatchTimeMs(),
            attempt,
        });
    }

    private _enqueueTeleportOrientationConfirmJob(playerId: number, delayMs: number): void {
        if (this._orientationConfirmTimeoutByPlayerId.has(playerId)) return;

        const timeoutHandle = Timers.setTimeout(() => {
            this._orientationConfirmTimeoutByPlayerId.delete(playerId);
            if (!this._context.runtime.isMatchActive) return;

            this._jobService.enqueue({
                kind: 'confirm-teleport-orientation',
                playerId,
                createdAtMs: this._getMatchTimeMs(),
                attempt: 0,
            });
        }, delayMs);
        this._orientationConfirmTimeoutByPlayerId.set(playerId, timeoutHandle);
    }

    private _enqueueLiveStartDeployRecoveryJob(
        playerId: number,
        attempt: number,
        delayMs: number,
        createdAtMs: number
    ): void {
        if (this._deployRecoveryTimeoutByPlayerId.has(playerId)) return;

        const timeoutHandle = Timers.setTimeout(() => {
            this._deployRecoveryTimeoutByPlayerId.delete(playerId);
            if (!this._context.runtime.isMatchActive) return;

            this._jobService.enqueueFront({
                kind: 'live-start-deploy-recovery',
                playerId,
                createdAtMs,
                attempt,
            });
        }, delayMs);
        this._deployRecoveryTimeoutByPlayerId.set(playerId, timeoutHandle);
    }

    private _clearSpawnRetryTimeoutsForPlayer(playerId: number): void {
        this._clearQueueSpawnRetryTimeout(playerId);
        this._clearTeleportRetryTimeout(playerId);
        this._clearOrientationConfirmTimeout(playerId);
        this._clearDeployRecoveryTimeout(playerId);
    }

    private _clearAllSpawnRetryTimeouts(): void {
        this._queueSpawnRetryTimeoutByPlayerId.forEach((timeoutHandle) => Timers.clearTimeout(timeoutHandle));
        this._teleportRetryTimeoutByPlayerId.forEach((timeoutHandle) => Timers.clearTimeout(timeoutHandle));
        this._orientationConfirmTimeoutByPlayerId.forEach((timeoutHandle) => Timers.clearTimeout(timeoutHandle));
        this._deployRecoveryTimeoutByPlayerId.forEach((timeoutHandle) => Timers.clearTimeout(timeoutHandle));
        this._queueSpawnRetryTimeoutByPlayerId.clear();
        this._teleportRetryTimeoutByPlayerId.clear();
        this._orientationConfirmTimeoutByPlayerId.clear();
        this._deployRecoveryTimeoutByPlayerId.clear();
    }

    private _clearQueueSpawnRetryTimeout(playerId: number): void {
        const timeoutHandle = this._queueSpawnRetryTimeoutByPlayerId.get(playerId);
        if (timeoutHandle === undefined) return;

        Timers.clearTimeout(timeoutHandle);
        this._queueSpawnRetryTimeoutByPlayerId.delete(playerId);
    }

    private _clearTeleportRetryTimeout(playerId: number): void {
        const timeoutHandle = this._teleportRetryTimeoutByPlayerId.get(playerId);
        if (timeoutHandle === undefined) return;

        Timers.clearTimeout(timeoutHandle);
        this._teleportRetryTimeoutByPlayerId.delete(playerId);
    }

    private _clearOrientationConfirmTimeout(playerId: number): void {
        const timeoutHandle = this._orientationConfirmTimeoutByPlayerId.get(playerId);
        if (timeoutHandle === undefined) return;

        Timers.clearTimeout(timeoutHandle);
        this._orientationConfirmTimeoutByPlayerId.delete(playerId);
    }

    private _clearDeployRecoveryTimeout(playerId: number): void {
        const timeoutHandle = this._deployRecoveryTimeoutByPlayerId.get(playerId);
        if (timeoutHandle === undefined) return;

        Timers.clearTimeout(timeoutHandle);
        this._deployRecoveryTimeoutByPlayerId.delete(playerId);
    }

    private _processDeployTeleportJob(job: KothSpawnJob, playerState: KothPlayerState): void {
        if (!this._isLivingDeployedParticipant(playerState)) return;

        if (this._tryTeleportDeployedPlayer(playerState)) return;

        if (this._shouldRetryTeleport(job)) {
            this._enqueueTeleportDeployedJob(
                playerState.id,
                job.attempt + 1,
                this._context.spawns.rules.spawnRetryWindowMs
            );
            return;
        }

        this._warnTeleportFailedOnce(playerState.id);
    }

    private _processLiveStartDeployRecoveryJob(job: KothSpawnJob, playerState: KothPlayerState): void {
        if (!this._context.runtime.isMatchActive) return;
        if (!mod.IsPlayerValid(playerState.player)) return;

        this._clearLiveInputRestrictions(playerState.player);
        mod.SetRedeployTime(playerState.player, this._context.rules.redeployTimeSeconds);

        if (isKothPlayerLiving(playerState.player)) {
            playerState.isDeployed = true;
            if (!this._tryTeleportDeployedPlayer(playerState)) {
                this._enqueueTeleportDeployedJob(playerState.id, 0);
            }
            return;
        }

        this._tryRecoverLiveStartDeploy(playerState);

        if (isKothPlayerLiving(playerState.player)) {
            playerState.isDeployed = true;
            if (!this._tryTeleportDeployedPlayer(playerState)) {
                this._enqueueTeleportDeployedJob(playerState.id, 0);
            }
            return;
        }

        if (
            job.attempt < KOTH_LIVE_START_DEPLOY_RECOVERY_MAX_ATTEMPTS &&
            this._getMatchTimeMs() - job.createdAtMs < KOTH_LIVE_START_DEPLOY_RECOVERY_WINDOW_MS
        ) {
            this._enqueueLiveStartDeployRecoveryJob(
                playerState.id,
                job.attempt + 1,
                KOTH_LIVE_START_DEPLOY_RECOVERY_DELAY_MS,
                job.createdAtMs
            );
        }
    }

    private _tryRecoverLiveStartDeploy(playerState: KothPlayerState): void {
        if (!mod.IsPlayerValid(playerState.player)) return;

        this._clearLiveInputRestrictions(playerState.player);

        try {
            mod.SetRedeployTime(playerState.player, this._context.rules.redeployTimeSeconds);
        } catch (_err) {
            return;
        }

        if (isKothPlayerManDown(playerState.player)) {
            try {
                mod.ForceRevive(playerState.player);
                return;
            } catch (_err) {
                return;
            }
        }

        try {
            mod.DeployPlayer(playerState.player);
        } catch (_err) {
            return;
        }
    }

    private _processTeleportOrientationConfirmJob(job: KothSpawnJob, playerState: KothPlayerState): void {
        if (job.attempt > 0) return;
        if (!this._isLivingDeployedParticipant(playerState)) return;

        const position = this._getPlayerPosition(playerState.player);
        if (!position || this._isZeroVector(position)) return;
        if (this._isPlayerFacingActiveObjective(playerState.player, position)) return;

        try {
            mod.Teleport(playerState.player, position, this._yawTowardActiveObjective(position));
        } catch (_err) {
            this._warnTeleportFailedOnce(playerState.id);
        }
    }

    private _tryTeleportDeployedPlayer(playerState: KothPlayerState): boolean {
        if (!this._isLivingDeployedParticipant(playerState)) return false;

        const destination = this._selectTeleportDestination(playerState);
        if (!destination) return false;

        if (!this._teleportPlayer(playerState.id, playerState.player, destination)) return false;

        this._context.runtime.spawn.queuedAnchorByPlayerId.delete(playerState.id);
        return true;
    }

    private _selectTeleportDestination(playerState: KothPlayerState): ResolvedKothSpawnDestination | undefined {
        const teamId = getKothTeamId(playerState.team);
        if (teamId !== 1 && teamId !== 2) return undefined;

        const context = this._createSpawnEvaluationContext(teamId, this._context.runtime.hill.currentHillLetter);
        if (!context) return undefined;

        const queuedDestination = this._selectQueuedDestination(playerState, context);
        if (queuedDestination) return queuedDestination;

        const activeSelection = this._selectBoundedActiveSpawnCandidate(context);
        if (activeSelection && !this._isSpawnCandidateBlockedByQueuedEnemySafety(activeSelection.candidate)) {
            const activeCandidate = this._finalizeSpawnCandidateSelection(context, activeSelection);
            return this._resolveAndQueueCandidateDestination(playerState.id, context, activeCandidate);
        }

        const teammateDestination = this._selectTeammateDestination(playerState, context);
        if (teammateDestination) return teammateDestination;

        if (activeSelection) {
            const activeCandidate = this._finalizeSpawnCandidateSelection(context, activeSelection);
            return this._resolveAndQueueCandidateDestination(playerState.id, context, activeCandidate);
        }

        return undefined;
    }

    private _resolveAndQueueCandidateDestination(
        playerId: number,
        context: KothSpawnEvaluationContext,
        candidate: KothSpawnCandidateScore
    ): ResolvedKothSpawnDestination | undefined {
        this._queueCandidateForPlayer(playerId, candidate, context.activeObjectiveLetter);
        return this._resolveAnchorDestination(candidate.sector, candidate.anchorObjectId, context);
    }

    private _selectTeammateDestination(
        playerState: KothPlayerState,
        context: KothSpawnEvaluationContext
    ): ResolvedKothSpawnDestination | undefined {
        let bestTarget: KothSpawnEvaluationPlayer | undefined;
        let bestDistanceSquared = Number.POSITIVE_INFINITY;
        const minDistanceSquared = this._square(this._context.spawns.safety.teammateTeleportMinObjectiveDistanceMeters);
        const enemySafetyRadius = this._context.spawns.safety.teammateTeleportEnemySafetyRadiusMeters;

        for (const target of context.players) {
            if (target.playerId === playerState.id) continue;
            if (target.teamId !== context.teamId) continue;
            if (this._isPlayerInsideActiveObjective(target.playerState)) continue;
            if (!this._isEvaluationPlayerInEnemySidePresence(target, context)) continue;

            const distanceSquared = this._distanceSquared(target.positionVector, context.activeObjectiveVector);
            if (distanceSquared < minDistanceSquared) continue;
            if (!this._isPositionVectorSafeFromEnemies(target.positionVector, context, enemySafetyRadius)) continue;

            if (distanceSquared >= bestDistanceSquared) continue;
            bestDistanceSquared = distanceSquared;
            bestTarget = target;
        }

        if (!bestTarget) return undefined;

        return {
            position: bestTarget.position,
            orientationRadians: this._yawTowardActiveObjectiveFromVector(bestTarget.positionVector, context),
            label: `teammate-${bestTarget.playerId}`,
            pressureZones: bestTarget.presenceZones ? [...bestTarget.presenceZones] : [],
        };
    }

    private _selectQueuedDestination(
        playerState: KothPlayerState,
        context: KothSpawnEvaluationContext
    ): ResolvedKothSpawnDestination | undefined {
        const queued = this._context.runtime.spawn.queuedAnchorByPlayerId.get(playerState.id);
        if (!queued) return undefined;

        if (queued.selectedForObjectiveLetter !== context.activeObjectiveLetter) {
            this._context.runtime.spawn.queuedAnchorByPlayerId.delete(playerState.id);
            return undefined;
        }

        const sector = this._getSectorForQueuedAnchor(queued);
        if (!sector) {
            this._context.runtime.spawn.queuedAnchorByPlayerId.delete(playerState.id);
            return undefined;
        }

        if (sector.objectiveLetter !== context.activeObjectiveLetter) {
            this._context.runtime.spawn.queuedAnchorByPlayerId.delete(playerState.id);
            return undefined;
        } else if (sector.teamSide !== context.assignedTeamSide || sector.variantSide !== context.assignedVariantSide) {
            this._context.runtime.spawn.queuedAnchorByPlayerId.delete(playerState.id);
            return undefined;
        }

        const destinationVector = this._getAnchorPositionVector(queued.anchorObjectId);
        if (!destinationVector) {
            this._context.runtime.spawn.queuedAnchorByPlayerId.delete(playerState.id);
            return undefined;
        }

        if (
            !this._isPositionVectorSafeFromEnemies(
                destinationVector,
                context,
                this._context.spawns.safety.queuedAnchorEnemySafetyRadiusMeters
            )
        ) {
            this._context.runtime.spawn.queuedAnchorByPlayerId.delete(playerState.id);
            return undefined;
        }

        const distanceScore = this.scoreAnchorVectorDistanceToObjective(
            queued.anchorObjectId,
            destinationVector,
            context.activeObjectiveVector,
            this._getDistanceConfigForSector(sector)
        );
        if (!distanceScore.isWithinHardRange) {
            this._context.runtime.spawn.queuedAnchorByPlayerId.delete(playerState.id);
            return undefined;
        }

        return this._resolveAnchorDestination(sector, queued.anchorObjectId, context);
    }

    private _selectBestSpawnCandidateForTeam(
        teamId: KothTeamId,
        activeObjectiveLetter: KothHillLetter
    ): KothSpawnCandidateScore | undefined {
        const context = this._createSpawnEvaluationContext(teamId, activeObjectiveLetter);
        if (!context) return undefined;

        const activeCandidate = this._selectBestActiveSpawnCandidate(context);
        if (activeCandidate) return activeCandidate;

        return undefined;
    }

    private _selectBestActiveSpawnCandidate(context: KothSpawnEvaluationContext): KothSpawnCandidateScore | undefined {
        const selection = this._selectBoundedActiveSpawnCandidate(context);
        if (selection) return this._finalizeSpawnCandidateSelection(context, selection);

        return undefined;
    }

    private _selectBoundedActiveSpawnCandidate(
        context: KothSpawnEvaluationContext
    ): ScoredSpawnCandidateSelection | undefined {
        let bestUnsafeSelection: ScoredSpawnCandidateSelection | undefined;
        let bestUnsafeScore = Number.MAX_SAFE_INTEGER;
        const sectorChoices = this._getBoundedActiveSectorChoices(context);

        for (let choiceIndex = 0; choiceIndex < sectorChoices.length; choiceIndex++) {
            const choice = sectorChoices[choiceIndex];
            const sector = this._getActiveSectorForChoice(context, choice);
            if (!sector) continue;

            const selection = this._selectBoundedAnchorFromSector(sector, context, choiceIndex);
            if (!selection) continue;
            if (!this._isSpawnCandidateBlockedByQueuedEnemySafety(selection.candidate)) return selection;

            if (selection.candidate.score < bestUnsafeScore) {
                bestUnsafeScore = selection.candidate.score;
                bestUnsafeSelection = selection;
            }
        }

        return bestUnsafeSelection;
    }

    private _getBoundedActiveSectorChoices(context: KothSpawnEvaluationContext): readonly KothSpawnSectorChoice[] {
        const assignedTeamSide = context.assignedTeamSide;
        const oppositeTeamSide = this._getOpposingSideForRegion(context.activeRegion, assignedTeamSide);
        const assignedVariantSide = context.assignedVariantSide;
        const oppositeVariantSide = getOppositeCardinalSide(assignedVariantSide);

        return [
            { teamSide: assignedTeamSide, variantSide: assignedVariantSide },
            { teamSide: assignedTeamSide, variantSide: oppositeVariantSide },
            { teamSide: oppositeTeamSide, variantSide: assignedVariantSide },
            { teamSide: oppositeTeamSide, variantSide: oppositeVariantSide },
        ];
    }

    private _getActiveSectorForChoice(
        context: KothSpawnEvaluationContext,
        choice: KothSpawnSectorChoice
    ): KothSpawnSectorConfig | undefined {
        for (const sector of context.activeRegion.sectors) {
            if (sector.objectiveLetter !== context.activeObjectiveLetter) continue;
            if (sector.teamSide !== choice.teamSide) continue;
            if (sector.variantSide !== choice.variantSide) continue;
            return sector;
        }

        return undefined;
    }

    private _selectBoundedAnchorFromSector(
        sector: KothSpawnSectorConfig,
        context: KothSpawnEvaluationContext,
        choiceIndex: number
    ): ScoredSpawnCandidateSelection | undefined {
        const anchorCount = sector.anchorObjectIds.length;
        if (anchorCount <= 0) return undefined;

        let bestUnsafeSelection: ScoredSpawnCandidateSelection | undefined;
        let bestUnsafeScore = Number.MAX_SAFE_INTEGER;
        let bestCooldownSelection: ScoredSpawnCandidateSelection | undefined;
        let bestCooldownUntilMs = Number.MAX_SAFE_INTEGER;
        let bestCooldownScore = Number.MAX_SAFE_INTEGER;
        const startIndex = this._getRandomAnchorStartIndex(anchorCount);
        const nowMs = this._getMatchTimeMs();

        for (let offset = 0; offset < anchorCount; offset++) {
            const anchorIndex = (startIndex + offset) % anchorCount;
            const anchorObjectId = sector.anchorObjectIds[anchorIndex];
            const candidate = this._createActiveSpawnCandidate(sector, anchorObjectId, context, choiceIndex, offset);
            if (!candidate) continue;

            const selection = { anchorIndex, candidate };
            const isEnemyBlocked = this._isSpawnCandidateBlockedByQueuedEnemySafety(candidate);
            const cooldownUntilMs = this._getAnchorCooldownUntilMs(anchorObjectId);
            const isCooldownBlocked = cooldownUntilMs > nowMs;

            if (!isEnemyBlocked && !isCooldownBlocked) return selection;

            if (isCooldownBlocked && this._isBetterCooldownFallback(candidate, cooldownUntilMs, bestCooldownScore, bestCooldownUntilMs)) {
                bestCooldownSelection = selection;
                bestCooldownUntilMs = cooldownUntilMs;
                bestCooldownScore = candidate.score;
            }

            if (isEnemyBlocked && !isCooldownBlocked && candidate.score < bestUnsafeScore) {
                bestUnsafeScore = candidate.score;
                bestUnsafeSelection = selection;
            }
        }

        return bestCooldownSelection ?? bestUnsafeSelection;
    }

    private _createActiveSpawnCandidate(
        sector: KothSpawnSectorConfig,
        anchorObjectId: number,
        context: KothSpawnEvaluationContext,
        choiceIndex: number,
        anchorOffset: number
    ): KothSpawnCandidateScore | undefined {
        if (this._isForbiddenSpawnAnchorObjectId(anchorObjectId)) return undefined;

        const destinationVector = this._getAnchorPositionVector(anchorObjectId);
        if (!destinationVector) return undefined;

        const distanceScore = this.scoreAnchorVectorDistanceToObjective(
            anchorObjectId,
            destinationVector,
            context.activeObjectiveVector,
            this._getDistanceConfigForSector(sector)
        );
        const enemyCount = this._countEnemiesNearPositionVector(
            destinationVector,
            context,
            this._context.spawns.safety.queuedAnchorEnemySafetyRadiusMeters
        );
        const enemySafetyPenalty = enemyCount * this._context.spawns.safety.unsafeAnchorPenalty;
        const sectorPressure = this.scoreSectorPressure(sector, context.teamId);
        const score =
            enemySafetyPenalty +
            choiceIndex * 100 +
            distanceScore.distancePenalty +
            anchorOffset * 0.01;

        return {
            sector,
            anchorObjectId,
            score,
            sectorPressure,
            distanceToObjectiveMeters: distanceScore.distanceToObjectiveMeters,
            distancePenalty: distanceScore.distancePenalty,
            enemySafetyPenalty,
            isPreferredDistance: distanceScore.isWithinPreferredRange,
            isEmergencyFallback: choiceIndex > 0 || enemySafetyPenalty > 0,
        };
    }

    private _isSpawnCandidateBlockedByQueuedEnemySafety(candidate: KothSpawnCandidateScore): boolean {
        return candidate.enemySafetyPenalty > 0;
    }

    private _isBetterCooldownFallback(
        candidate: KothSpawnCandidateScore,
        cooldownUntilMs: number,
        currentBestScore: number,
        currentBestCooldownUntilMs: number
    ): boolean {
        if (candidate.score !== currentBestScore) return candidate.score < currentBestScore;
        return cooldownUntilMs < currentBestCooldownUntilMs;
    }

    private _getAnchorCooldownUntilMs(anchorObjectId: number): number {
        return this._context.runtime.spawn.anchorCooldownUntilMsByObjectId.get(anchorObjectId) ?? 0;
    }

    private _markAnchorCooldown(anchorObjectId: number): void {
        this._context.runtime.spawn.anchorCooldownUntilMsByObjectId.set(
            anchorObjectId,
            this._getMatchTimeMs() + this._context.spawns.rules.anchorReuseCooldownMs
        );
    }

    private _getRandomAnchorStartIndex(anchorCount: number): number {
        if (anchorCount <= 1) return 0;

        return Math.floor(Math.random() * anchorCount) % anchorCount;
    }

    public scoreSectorPressure(sector: KothSpawnSectorConfig, teamId: KothTeamId): KothSpawnSectorPressure {
        const enemyTeamId = this._getEnemyTeamId(teamId);
        let friendlyCount = 0;
        let enemyCount = 0;

        for (const zone of sector.pressureZones) {
            const snapshot = this._context.runtime.spawn.pressureSnapshotByPresenceZone[zone];
            const team1Count = snapshot.team1Count;
            const team2Count = snapshot.team2Count;
            friendlyCount += teamId === 1 ? team1Count : team2Count;
            enemyCount += enemyTeamId === 1 ? team1Count : team2Count;
        }

        const pressureConfig = this._context.spawns.pressure;

        return {
            friendlyCount,
            enemyCount,
            score: enemyCount * pressureConfig.enemyPressurePenalty - friendlyCount * pressureConfig.friendlyPresenceBonus,
            isEnemyHeavy: enemyCount > friendlyCount || enemyCount >= pressureConfig.enemyHeavyThreshold,
        };
    }

    public scoreAnchorDistanceToObjective(
        anchorObjectId: number,
        anchorPosition: mod.Vector,
        activeObjectivePosition: mod.Vector,
        distanceConfig: KothSpawnDistanceConfig
    ): KothAnchorDistanceScore {
        return this.scoreAnchorVectorDistanceToObjective(
            anchorObjectId,
            this._toPositionVector(anchorPosition),
            this._toPositionVector(activeObjectivePosition),
            distanceConfig
        );
    }

    public scoreAnchorVectorDistanceToObjective(
        anchorObjectId: number,
        anchorPosition: KothSpawnPositionVector,
        activeObjectivePosition: KothSpawnPositionVector,
        distanceConfig: KothSpawnDistanceConfig
    ): KothAnchorDistanceScore {
        const distanceToObjectiveMeters = Math.sqrt(
            this._distanceSquared(anchorPosition, activeObjectivePosition)
        );
        const distanceErrorMeters = Math.abs(distanceToObjectiveMeters - distanceConfig.idealObjectiveDistanceMeters);
        const isWithinPreferredRange =
            distanceToObjectiveMeters >= distanceConfig.minObjectiveDistanceMeters &&
            distanceToObjectiveMeters <= distanceConfig.maxObjectiveDistanceMeters;
        const isWithinHardRange = distanceToObjectiveMeters <= distanceConfig.hardMaxObjectiveDistanceMeters;
        let distancePenalty = distanceErrorMeters * distanceConfig.distancePenaltyPerMeter;

        if (!isWithinPreferredRange) {
            distancePenalty += 100;
        }

        if (!isWithinHardRange) {
            distancePenalty += 1000;
        }

        return {
            anchorObjectId,
            distanceToObjectiveMeters,
            distanceErrorMeters,
            isWithinPreferredRange,
            isWithinHardRange,
            distancePenalty,
        };
    }

    private _createSpawnEvaluationContext(
        teamId: KothTeamId,
        activeObjectiveLetter: KothHillLetter
    ): KothSpawnEvaluationContext | undefined {
        const activeRegion = getRegionForActiveObjective(activeObjectiveLetter);
        if (!activeRegion) return undefined;

        const activeObjectivePosition = this._getActiveObjectivePosition(activeObjectiveLetter);
        if (!activeObjectivePosition) return undefined;

        const activeObjectiveVector = this._toPositionVector(activeObjectivePosition);
        const players: KothSpawnEvaluationPlayer[] = [];
        this._context.runtime.spawn.playerPositionSnapshotByPlayerId.clear();

        this._context.runtime.playersById.forEach((playerState) => {
            if (!this._isLivingDeployedParticipant(playerState)) return;

            const playerTeamId = getKothTeamId(playerState.team);
            if (playerTeamId !== 1 && playerTeamId !== 2) return;

            const position = this._getPlayerPosition(playerState.player);
            if (!position || this._isZeroVector(position)) return;

            const positionVector = this._toPositionVector(position);
            this._context.runtime.spawn.playerPositionSnapshotByPlayerId.set(playerState.id, {
                playerId: playerState.id,
                teamId: playerTeamId,
                position: positionVector,
            });
            players.push({
                playerState,
                playerId: playerState.id,
                teamId: playerTeamId,
                position,
                positionVector,
                presenceZones: this._context.runtime.spawn.presenceZonesByPlayerId.get(playerState.id),
            });
        });

        return {
            teamId,
            enemyTeamId: this._getEnemyTeamId(teamId),
            activeObjectiveLetter,
            activeRegion,
            activeObjectivePosition,
            activeObjectiveVector,
            assignedTeamSide: this._refreshAssignedTeamSideForPressure(activeRegion, teamId, activeObjectivePosition),
            assignedVariantSide: this._getAssignedVariantSide(activeRegion, teamId),
            players,
        };
    }

    private _isEvaluationPlayerInEnemySidePresence(
        player: KothSpawnEvaluationPlayer,
        context: KothSpawnEvaluationContext
    ): boolean {
        const zones = player.presenceZones;
        if (!zones) return false;

        for (const zone of zones) {
            const zoneTeamSide = this._getTeamSideForPresenceZone(context.activeRegion, zone);
            if (zoneTeamSide && zoneTeamSide !== context.assignedTeamSide) return true;
        }

        return false;
    }

    private _refreshAssignedTeamSideForPressure(
        region: KothSpawnRegionConfig,
        teamId: KothTeamId,
        activeObjectivePosition: mod.Vector
    ): KothCardinalSide {
        const currentSide = this._getAssignedTeamSide(region, teamId);
        const decision = this._getPreferredTeamSideForPressure(region, teamId, activeObjectivePosition);
        if (!decision || decision.side === currentSide) return currentSide;

        const currentSideHardBlocked =
            decision.enemyDominantSide === currentSide || this._isTeamSideHardBlocked(region, currentSide, teamId, activeObjectivePosition);
        const lastChangedAt = this._context.runtime.spawn.sideAssignmentChangedAtMsByRegionId[region.regionId];
        const elapsedSinceChange = this._getMatchTimeMs() - (lastChangedAt ?? 0);
        const canFlipByCooldown = lastChangedAt === undefined || elapsedSinceChange >= this._context.spawns.frontline.sideFlipCooldownMs;

        if (!decision.isHardPressure && !currentSideHardBlocked && !canFlipByCooldown) return currentSide;

        this._setSideAssignmentForTeam(region, teamId, decision.side);
        return decision.side;
    }

    private _getPreferredTeamSideForPressure(
        region: KothSpawnRegionConfig,
        teamId: KothTeamId,
        activeObjectivePosition: mod.Vector
    ): KothPreferredTeamSideDecision | undefined {
        const pair = this._getSidePressurePair(region, teamId, activeObjectivePosition);
        if (pair.firstPressure.enemyCount <= 0 && pair.secondPressure.enemyCount <= 0) return undefined;

        const enemyDelta = pair.firstPressure.enemyCount - pair.secondPressure.enemyCount;
        const minDelta = this._context.spawns.frontline.enemyDominantSideMinDelta;
        if (enemyDelta >= minDelta) {
            return {
                side: pair.secondSide,
                enemyDominantSide: pair.firstSide,
                isHardPressure: true,
            };
        }

        if (enemyDelta <= -minDelta) {
            return {
                side: pair.firstSide,
                enemyDominantSide: pair.secondSide,
                isHardPressure: true,
            };
        }

        const distanceMargin = this._context.spawns.frontline.friendlyAnchorMarginMeters;
        if (pair.firstPressure.nearestEnemyDistanceMeters >= pair.secondPressure.nearestEnemyDistanceMeters + distanceMargin) {
            return {
                side: pair.firstSide,
                isHardPressure: false,
            };
        }

        if (pair.secondPressure.nearestEnemyDistanceMeters >= pair.firstPressure.nearestEnemyDistanceMeters + distanceMargin) {
            return {
                side: pair.secondSide,
                isHardPressure: false,
            };
        }

        return undefined;
    }

    private _getSidePressurePair(
        region: KothSpawnRegionConfig,
        teamId: KothTeamId,
        activeObjectivePosition: mod.Vector
    ): KothSpawnSidePressurePair {
        const firstSide = region.opposingSides[0];
        const secondSide = region.opposingSides[1];

        return {
            firstSide,
            secondSide,
            firstPressure: this._scoreSidePressure(region, firstSide, teamId, activeObjectivePosition),
            secondPressure: this._scoreSidePressure(region, secondSide, teamId, activeObjectivePosition),
        };
    }

    private _scoreSidePressure(
        region: KothSpawnRegionConfig,
        side: KothCardinalSide,
        teamId: KothTeamId,
        activeObjectivePosition: mod.Vector
    ): KothSpawnSidePressure {
        void activeObjectivePosition;

        const enemyTeamId = this._getEnemyTeamId(teamId);
        let friendlyCount = 0;
        let enemyCount = 0;

        for (const zone of this._getPresenceZonesForTeamSide(region, side)) {
            const snapshot = this._context.runtime.spawn.pressureSnapshotByPresenceZone[zone];
            const team1Count = snapshot.team1Count;
            const team2Count = snapshot.team2Count;
            friendlyCount += teamId === 1 ? team1Count : team2Count;
            enemyCount += enemyTeamId === 1 ? team1Count : team2Count;
        }

        return {
            friendlyCount,
            enemyCount,
            nearestFriendlyDistanceMeters: Number.POSITIVE_INFINITY,
            nearestEnemyDistanceMeters: Number.POSITIVE_INFINITY,
        };
    }

    private _isTeamSideHardBlocked(
        region: KothSpawnRegionConfig,
        side: KothCardinalSide,
        teamId: KothTeamId,
        activeObjectivePosition: mod.Vector
    ): boolean {
        const sidePressure = this._scoreSidePressure(region, side, teamId, activeObjectivePosition);
        if (sidePressure.enemyCount >= this._context.spawns.pressure.enemyHeavyThreshold) return true;

        const sideSectors = region.sectors.filter((sector) => sector.teamSide === side);
        if (sideSectors.length <= 0) return true;

        for (const sector of sideSectors) {
            if (!this.scoreSectorPressure(sector, teamId).isEnemyHeavy) return false;
        }

        return true;
    }

    private _finalizeSpawnCandidateSelection(
        context: KothSpawnEvaluationContext,
        selection: ScoredSpawnCandidateSelection
    ): KothSpawnCandidateScore {
        this._applyAssignmentForCandidateSector(context, selection.candidate.sector);
        this._setNextAnchorIndex(selection.candidate.sector, selection.anchorIndex + 1);
        return selection.candidate;
    }

    private _applyAssignmentForCandidateSector(
        context: KothSpawnEvaluationContext,
        sector: KothSpawnSectorConfig
    ): void {
        const region = this._getRegionForSector(sector);
        if (!region) return;

        const currentSide = this._getAssignedTeamSide(region, context.teamId);
        const currentVariantSide = this._getAssignedVariantSide(region, context.teamId);
        if (currentSide === sector.teamSide && currentVariantSide === sector.variantSide) return;

        this._setSideAndVariantAssignmentForTeam(region, context.teamId, sector.teamSide, sector.variantSide);

        if (region.regionId === context.activeRegion.regionId) {
            context.assignedTeamSide = this._getAssignedTeamSide(region, context.teamId);
            context.assignedVariantSide = this._getAssignedVariantSide(region, context.teamId);
        }
    }

    private _getRegionForSector(sector: KothSpawnSectorConfig): KothSpawnRegionConfig | undefined {
        for (const region of this._context.spawns.regions) {
            if (region.regionId === sector.regionId) return region;
        }

        return undefined;
    }

    private _setSideAssignmentForTeam(
        region: KothSpawnRegionConfig,
        teamId: KothTeamId,
        teamSide: KothCardinalSide
    ): void {
        const current = this._getOrCreateSideAssignment(region);
        const teamVariantSide = teamId === 1 ? current.team1VariantSide : current.team2VariantSide;
        this._setSideAndVariantAssignmentForTeam(region, teamId, teamSide, teamVariantSide);
    }

    private _setSideAndVariantAssignmentForTeam(
        region: KothSpawnRegionConfig,
        teamId: KothTeamId,
        teamSide: KothCardinalSide,
        variantSide: KothCardinalSide
    ): void {
        const current = this._getOrCreateSideAssignment(region);
        const nextAssignment = this._createAssignmentForTeam(region, teamId, teamSide, variantSide);

        if (this._isSameSideAssignment(current, nextAssignment)) return;

        this._context.runtime.spawn.sideAssignmentByRegionId[region.regionId] = nextAssignment;
        this._context.runtime.spawn.sideAssignmentChangedAtMsByRegionId[region.regionId] = this._getMatchTimeMs();
    }

    private _getOpposingSideForRegion(region: KothSpawnRegionConfig, side: KothCardinalSide): KothCardinalSide {
        return region.opposingSides[0] === side ? region.opposingSides[1] : region.opposingSides[0];
    }

    private _queueCandidateForPlayer(
        playerId: number,
        candidate: KothSpawnCandidateScore,
        selectedForObjectiveLetter: KothHillLetter
    ): void {
        if (!this._resolveAnchorDestination(candidate.sector, candidate.anchorObjectId)) return;

        this._context.runtime.spawn.queuedAnchorByPlayerId.set(playerId, {
            regionId: candidate.sector.regionId,
            selectedForObjectiveLetter,
            objectiveLetter: candidate.sector.objectiveLetter,
            teamSide: candidate.sector.teamSide,
            variantSide: candidate.sector.variantSide,
            anchorObjectId: candidate.anchorObjectId,
            distanceToObjectiveMeters: candidate.distanceToObjectiveMeters,
            isEmergencyFallback: candidate.isEmergencyFallback,
        });
        this._markAnchorCooldown(candidate.anchorObjectId);
    }

    private _getDistanceConfigForSector(sector: KothSpawnSectorConfig): KothSpawnDistanceConfig {
        const globalDistance = this._context.spawns.distance;

        return {
            idealObjectiveDistanceMeters: sector.idealDistanceMeters ?? globalDistance.idealObjectiveDistanceMeters,
            minObjectiveDistanceMeters: sector.minDistanceMeters ?? globalDistance.minObjectiveDistanceMeters,
            maxObjectiveDistanceMeters: sector.maxDistanceMeters ?? globalDistance.maxObjectiveDistanceMeters,
            hardMaxObjectiveDistanceMeters: globalDistance.hardMaxObjectiveDistanceMeters,
            distancePenaltyPerMeter: globalDistance.distancePenaltyPerMeter,
        };
    }

    private _getAssignedTeamSide(region: KothSpawnRegionConfig, teamId: KothTeamId): KothCardinalSide {
        const assignment = this._getOrCreateSideAssignment(region);
        return teamId === 1 ? assignment.team1Side : assignment.team2Side;
    }

    private _getAssignedVariantSide(region: KothSpawnRegionConfig, teamId: KothTeamId): KothCardinalSide {
        const assignment = this._getOrCreateSideAssignment(region);
        return teamId === 1 ? assignment.team1VariantSide : assignment.team2VariantSide;
    }

    private _getOrCreateSideAssignment(region: KothSpawnRegionConfig): KothSpawnSideAssignment {
        const existing = this._context.runtime.spawn.sideAssignmentByRegionId[region.regionId];
        if (existing) {
            const normalized = this._normalizeSideAssignment(region, existing);
            if (!this._isSameSideAssignment(existing, normalized)) {
                this._context.runtime.spawn.sideAssignmentByRegionId[region.regionId] = normalized;
            }
            return normalized;
        }

        const assignment = this._normalizeSideAssignment(region, {
            team1Side: region.defaultTeamSideByTeamId[1],
            team2Side: region.defaultTeamSideByTeamId[2],
            team1VariantSide: this._getDefaultVariantSide(region, 1),
            team2VariantSide: this._getDefaultVariantSide(region, 2),
        });

        this._context.runtime.spawn.sideAssignmentByRegionId[region.regionId] = assignment;
        return assignment;
    }

    private _setVariantAssignmentForTeam(
        region: KothSpawnRegionConfig,
        teamId: KothTeamId,
        variantSide: KothCardinalSide
    ): void {
        const current = this._getOrCreateSideAssignment(region);
        const teamSide = teamId === 1 ? current.team1Side : current.team2Side;
        this._setSideAndVariantAssignmentForTeam(region, teamId, teamSide, variantSide);
    }

    private _createAssignmentForTeam(
        region: KothSpawnRegionConfig,
        teamId: KothTeamId,
        teamSide: KothCardinalSide,
        variantSide: KothCardinalSide
    ): KothSpawnSideAssignment {
        const otherSide = this._getOpposingSideForRegion(region, teamSide);
        const otherVariantSide = getOppositeCardinalSide(variantSide);

        return this._normalizeSideAssignment(
            region,
            teamId === 1
                ? {
                      team1Side: teamSide,
                      team2Side: otherSide,
                      team1VariantSide: variantSide,
                      team2VariantSide: otherVariantSide,
                  }
                : {
                      team1Side: otherSide,
                      team2Side: teamSide,
                      team1VariantSide: otherVariantSide,
                      team2VariantSide: variantSide,
                  }
        );
    }

    private _normalizeSideAssignment(
        region: KothSpawnRegionConfig,
        assignment: KothSpawnSideAssignment
    ): KothSpawnSideAssignment {
        const team1Side = this._isRegionTeamSide(region, assignment.team1Side)
            ? assignment.team1Side
            : region.defaultTeamSideByTeamId[1];
        const team2Side =
            this._isRegionTeamSide(region, assignment.team2Side) && assignment.team2Side !== team1Side
                ? assignment.team2Side
                : this._getOpposingSideForRegion(region, team1Side);
        const team1VariantSide = this._isRegionVariantSide(region, assignment.team1VariantSide)
            ? assignment.team1VariantSide
            : this._getDefaultVariantSide(region, 1);
        const team2VariantSide =
            this._isRegionVariantSide(region, assignment.team2VariantSide) &&
            assignment.team2VariantSide !== team1VariantSide
                ? assignment.team2VariantSide
                : getOppositeCardinalSide(team1VariantSide);

        return {
            team1Side,
            team2Side,
            team1VariantSide,
            team2VariantSide,
        };
    }

    private _getDefaultVariantSide(region: KothSpawnRegionConfig, teamId: KothTeamId): KothCardinalSide {
        const configured = region.defaultVariantSideByTeamId?.[teamId];
        if (configured && this._isRegionVariantSide(region, configured)) return configured;

        const variantSides = getVariantSidesForAxis(region.axis);
        return teamId === 1 ? variantSides[0] : variantSides[1];
    }

    private _isRegionTeamSide(region: KothSpawnRegionConfig, side: KothCardinalSide): boolean {
        return side === region.opposingSides[0] || side === region.opposingSides[1];
    }

    private _isRegionVariantSide(region: KothSpawnRegionConfig, side: KothCardinalSide): boolean {
        for (const variantSide of getVariantSidesForAxis(region.axis)) {
            if (side === variantSide) return true;
        }

        return false;
    }

    private _isSameSideAssignment(first: KothSpawnSideAssignment, second: KothSpawnSideAssignment): boolean {
        return (
            first.team1Side === second.team1Side &&
            first.team2Side === second.team2Side &&
            first.team1VariantSide === second.team1VariantSide &&
            first.team2VariantSide === second.team2VariantSide
        );
    }

    private _getSectorForQueuedAnchor(queued: QueuedKothSpawnAnchor): KothSpawnSectorConfig | undefined {
        for (const region of this._context.spawns.regions) {
            if (!this._isObjectiveSpawnRegion(region)) continue;
            if (region.regionId !== queued.regionId) continue;

            for (const sector of region.sectors) {
                if (
                    sector.teamSide === queued.teamSide &&
                    sector.variantSide === queued.variantSide &&
                    this._sectorHasAnchorObjectId(sector, queued.anchorObjectId)
                ) {
                    return sector;
                }
            }
        }

        return undefined;
    }

    private _isObjectiveSpawnRegion(region: KothSpawnRegionConfig): boolean {
        return region.objectiveLetter !== undefined;
    }

    private _isObjectiveSpawnSector(sector: KothSpawnSectorConfig): boolean {
        return sector.objectiveLetter !== undefined;
    }

    private _isConfiguredObjectiveAnchorObjectId(objectId: number): boolean {
        for (const region of this._context.spawns.regions) {
            if (!this._isObjectiveSpawnRegion(region)) continue;

            for (const sector of region.sectors) {
                if (!this._isObjectiveSpawnSector(sector)) continue;
                if (this._sectorHasAnchorObjectId(sector, objectId)) return true;
            }
        }

        return false;
    }

    private _sectorHasAnchorObjectId(sector: KothSpawnSectorConfig, objectId: number): boolean {
        for (const anchorObjectId of sector.anchorObjectIds) {
            if (anchorObjectId === objectId) return true;
        }

        return false;
    }

    private _initializePresenceAreaTriggers(): void {
        this._clearPresenceState();

        for (const triggerId of KOTH_PRESENCE_ZONE_AREA_TRIGGER_IDS) {
            this._safeEnablePresenceAreaTrigger(triggerId, true);
        }
    }

    private _clearPresenceState(): void {
        this._context.runtime.spawn.presenceZonesByPlayerId.clear();
        this._context.runtime.spawn.playersByPresenceZone.northWest.clear();
        this._context.runtime.spawn.playersByPresenceZone.northEast.clear();
        this._context.runtime.spawn.playersByPresenceZone.southWest.clear();
        this._context.runtime.spawn.playersByPresenceZone.southEast.clear();
        this._refreshAllPresenceZonePressureSnapshots();
    }

    private _addPlayerToPresenceZone(playerId: number, zone: KothPresenceZone): void {
        this._context.runtime.spawn.playersByPresenceZone[zone].add(playerId);

        let zones = this._context.runtime.spawn.presenceZonesByPlayerId.get(playerId);
        if (!zones) {
            zones = new Set<KothPresenceZone>();
            this._context.runtime.spawn.presenceZonesByPlayerId.set(playerId, zones);
        }

        zones.add(zone);
        this._refreshPresenceZonePressureSnapshot(zone);
    }

    private _removePlayerFromPresenceZone(playerId: number, zone: KothPresenceZone): void {
        this._context.runtime.spawn.playersByPresenceZone[zone].delete(playerId);

        const zones = this._context.runtime.spawn.presenceZonesByPlayerId.get(playerId);
        if (!zones) return;

        zones.delete(zone);
        if (zones.size <= 0) {
            this._context.runtime.spawn.presenceZonesByPlayerId.delete(playerId);
        }
        this._refreshPresenceZonePressureSnapshot(zone);
    }

    private _removePlayerFromAllPresenceZones(playerId: number): void {
        let removedNorthWest = this._context.runtime.spawn.playersByPresenceZone.northWest.delete(playerId);
        let removedNorthEast = this._context.runtime.spawn.playersByPresenceZone.northEast.delete(playerId);
        let removedSouthWest = this._context.runtime.spawn.playersByPresenceZone.southWest.delete(playerId);
        let removedSouthEast = this._context.runtime.spawn.playersByPresenceZone.southEast.delete(playerId);
        this._context.runtime.spawn.presenceZonesByPlayerId.delete(playerId);

        if (removedNorthWest) this._refreshPresenceZonePressureSnapshot('northWest');
        if (removedNorthEast) this._refreshPresenceZonePressureSnapshot('northEast');
        if (removedSouthWest) this._refreshPresenceZonePressureSnapshot('southWest');
        if (removedSouthEast) this._refreshPresenceZonePressureSnapshot('southEast');
    }

    private _setPlayerPresenceZonesFromTeleport(playerId: number, zones: readonly KothPresenceZone[]): void {
        this._removePlayerFromAllPresenceZones(playerId);
        for (const zone of zones) {
            this._addPlayerToPresenceZone(playerId, zone);
        }
    }

    private _refreshAllPresenceZonePressureSnapshots(): void {
        for (const zone of this._context.spawns.presenceZones) {
            this._refreshPresenceZonePressureSnapshot(zone.zone);
        }
    }

    private _refreshPresenceZonePressureSnapshot(zone: KothPresenceZone): void {
        let team1Count = 0;
        let team2Count = 0;

        this._context.runtime.spawn.playersByPresenceZone[zone].forEach((playerId) => {
            const playerState = this._context.runtime.playersById.get(playerId);
            if (!playerState || !this._isLivingDeployedParticipant(playerState)) return;

            const teamId = getKothTeamId(playerState.team);
            if (teamId === 1) {
                team1Count += 1;
            } else if (teamId === 2) {
                team2Count += 1;
            }
        });

        const current = this._context.runtime.spawn.pressureSnapshotByPresenceZone[zone];
        this._context.runtime.spawn.pressureSnapshotByPresenceZone[zone] = {
            team1Count,
            team2Count,
            revision: current.revision + 1,
        };
    }

    private _seedPlayerPresenceFromQueuedAnchor(playerState: KothPlayerState): void {
        const queued = this._context.runtime.spawn.queuedAnchorByPlayerId.get(playerState.id);
        if (!queued) return;

        const sector = this._getSectorForQueuedAnchor(queued);
        if (!sector) return;

        this._setPlayerPresenceZonesFromTeleport(playerState.id, sector.pressureZones);
    }

    private _getPresenceZoneFromAreaTrigger(eventAreaTrigger: mod.AreaTrigger): KothPresenceZone | undefined {
        const triggerId = this._getAreaTriggerId(eventAreaTrigger);
        if (triggerId === undefined) return undefined;

        return getPresenceZoneForAreaTriggerId(triggerId);
    }

    private _flipVariantAssignmentForExactSectorIntrusion(playerId: number, zone: KothPresenceZone): void {
        const playerState = this._context.runtime.playersById.get(playerId);
        if (!playerState || !this._isLivingDeployedParticipant(playerState)) return;

        const teamId = getKothTeamId(playerState.team);
        if (teamId !== 1 && teamId !== 2) return;

        const activeRegion = getRegionForActiveObjective(this._context.runtime.hill.currentHillLetter);
        if (!activeRegion) return;

        const zoneTeamSide = this._getTeamSideForPresenceZone(activeRegion, zone);
        const zoneVariantSide = this._getVariantSideForPresenceZone(activeRegion, zone);
        if (!zoneTeamSide || !zoneVariantSide) return;

        const enemyTeamId = this._getEnemyTeamId(teamId);
        if (zoneTeamSide !== this._getAssignedTeamSide(activeRegion, enemyTeamId)) return;
        if (zoneVariantSide !== this._getAssignedVariantSide(activeRegion, enemyTeamId)) return;

        this._setVariantAssignmentForTeam(activeRegion, teamId, zoneVariantSide);
    }

    private _recordReinforcementTargetIfEnemySide(playerId: number, zone: KothPresenceZone): void {
        const playerState = this._context.runtime.playersById.get(playerId);
        if (!playerState || !this._isLivingDeployedParticipant(playerState)) return;
        if (this._isPlayerInsideActiveObjective(playerState)) return;

        const teamId = getKothTeamId(playerState.team);
        if (teamId !== 1 && teamId !== 2) return;

        const activeRegion = getRegionForActiveObjective(this._context.runtime.hill.currentHillLetter);
        if (!activeRegion) return;
        const activeObjectivePosition = this._getActiveObjectivePosition(this._context.runtime.hill.currentHillLetter);
        if (!activeObjectivePosition) return;

        const zoneTeamSide = this._getTeamSideForPresenceZone(activeRegion, zone);
        if (!zoneTeamSide) return;

        const assignedTeamSide = this._refreshAssignedTeamSideForPressure(activeRegion, teamId, activeObjectivePosition);
        if (zoneTeamSide === assignedTeamSide) return;

        this._context.runtime.spawn.reinforcementTargetByTeamId[teamId] = {
            playerId,
            teamId,
            createdAtMs: this._getMatchTimeMs(),
        };
    }

    private _isReinforcementTargetValid(playerId: number, teamId: KothTeamId, createdAtMs: number): boolean {
        if (this._getMatchTimeMs() - createdAtMs > KOTH_REINFORCEMENT_TARGET_TTL_MS) return false;

        const playerState = this._context.runtime.playersById.get(playerId);
        if (!playerState || !this._isLivingDeployedParticipant(playerState)) return false;
        if (getKothTeamId(playerState.team) !== teamId) return false;
        if (this._isPlayerInsideActiveObjective(playerState)) return false;

        return this._isPlayerInEnemySidePresence(playerId, teamId);
    }

    private _isPlayerInEnemySidePresence(playerId: number, teamId: KothTeamId): boolean {
        const activeRegion = getRegionForActiveObjective(this._context.runtime.hill.currentHillLetter);
        if (!activeRegion) return false;
        const activeObjectivePosition = this._getActiveObjectivePosition(this._context.runtime.hill.currentHillLetter);
        if (!activeObjectivePosition) return false;

        const assignedTeamSide = this._refreshAssignedTeamSideForPressure(activeRegion, teamId, activeObjectivePosition);
        const zones = this._context.runtime.spawn.presenceZonesByPlayerId.get(playerId);
        if (!zones) return false;

        for (const zone of zones) {
            const zoneTeamSide = this._getTeamSideForPresenceZone(activeRegion, zone);
            if (zoneTeamSide && zoneTeamSide !== assignedTeamSide) return true;
        }

        return false;
    }

    private _getTeamSideForPresenceZone(
        region: KothSpawnRegionConfig,
        zone: KothPresenceZone
    ): KothCardinalSide | undefined {
        if (region.axis === 'horizontal') {
            if (zone === 'northWest' || zone === 'southWest') return 'west';
            if (zone === 'northEast' || zone === 'southEast') return 'east';
            return undefined;
        }

        if (zone === 'northWest' || zone === 'northEast') return 'north';
        if (zone === 'southWest' || zone === 'southEast') return 'south';
        return undefined;
    }

    private _getVariantSideForPresenceZone(
        region: KothSpawnRegionConfig,
        zone: KothPresenceZone
    ): KothCardinalSide | undefined {
        if (region.axis === 'horizontal') {
            if (zone === 'northWest' || zone === 'northEast') return 'north';
            if (zone === 'southWest' || zone === 'southEast') return 'south';
            return undefined;
        }

        if (zone === 'northWest' || zone === 'southWest') return 'west';
        if (zone === 'northEast' || zone === 'southEast') return 'east';
        return undefined;
    }

    private _getPresenceZonesForTeamSide(
        region: KothSpawnRegionConfig,
        side: KothCardinalSide
    ): readonly KothPresenceZone[] {
        if (region.axis === 'horizontal') {
            if (side === 'west') return ['northWest', 'southWest'];
            if (side === 'east') return ['northEast', 'southEast'];
            return [];
        }

        if (side === 'north') return ['northWest', 'northEast'];
        if (side === 'south') return ['southWest', 'southEast'];
        return [];
    }

    private _clearInvalidReinforcementTargetForPlayer(playerId: number): void {
        const team1Target = this._context.runtime.spawn.reinforcementTargetByTeamId[1];
        if (
            team1Target?.playerId === playerId &&
            !this._isReinforcementTargetValid(playerId, 1, team1Target.createdAtMs)
        ) {
            delete this._context.runtime.spawn.reinforcementTargetByTeamId[1];
        }

        const team2Target = this._context.runtime.spawn.reinforcementTargetByTeamId[2];
        if (
            team2Target?.playerId === playerId &&
            !this._isReinforcementTargetValid(playerId, 2, team2Target.createdAtMs)
        ) {
            delete this._context.runtime.spawn.reinforcementTargetByTeamId[2];
        }
    }

    private _clearReinforcementTargetsForPlayer(playerId: number): void {
        if (this._context.runtime.spawn.reinforcementTargetByTeamId[1]?.playerId === playerId) {
            delete this._context.runtime.spawn.reinforcementTargetByTeamId[1];
        }

        if (this._context.runtime.spawn.reinforcementTargetByTeamId[2]?.playerId === playerId) {
            delete this._context.runtime.spawn.reinforcementTargetByTeamId[2];
        }
    }

    private _isPlayerInsideActiveObjective(playerState: KothPlayerState): boolean {
        if (playerState.isInsideActiveHill) return true;

        const activeHill = this._context.hills[this._context.runtime.hill.currentHillIndex];
        if (activeHill && playerState.activeHillAreaTriggerId === activeHill.areaTriggerId) return true;

        const hillState = this._context.runtime.hill;
        return hillState.activeHillTeam1Players.has(playerState.id) || hillState.activeHillTeam2Players.has(playerState.id);
    }

    private _getActiveObjectivePosition(objectiveLetter: KothHillLetter): mod.Vector | undefined {
        const activeHill = this._getHillByLetter(objectiveLetter);
        if (!activeHill) return undefined;

        const preferredCapturePointId = this._getPreferredCapturePointId(activeHill);
        const fallbackCapturePointIds = [
            preferredCapturePointId,
            activeHill.neutralCapturePointId,
            activeHill.team1CapturePointId,
            activeHill.team2CapturePointId,
        ];
        const triedIds = new Set<number>();

        for (const capturePointId of fallbackCapturePointIds) {
            if (triedIds.has(capturePointId)) continue;
            triedIds.add(capturePointId);

            const position = this._getCapturePointPosition(capturePointId);
            if (position) return position;
        }

        return undefined;
    }

    private _getPreferredCapturePointId(activeHill: KothHillConfig): number {
        switch (this._context.runtime.hill.currentControlState) {
            case 'team1':
                return activeHill.team1CapturePointId;
            case 'team2':
                return activeHill.team2CapturePointId;
            case 'contested':
                if (this._context.runtime.hill.currentOwnerState === 'team1') return activeHill.team1CapturePointId;
                if (this._context.runtime.hill.currentOwnerState === 'team2') return activeHill.team2CapturePointId;
                return activeHill.neutralCapturePointId;
            case 'neutral':
            case 'locked':
            case 'inactive':
                return activeHill.neutralCapturePointId;
        }
    }

    private _getHillByLetter(objectiveLetter: KothHillLetter): KothHillConfig | undefined {
        for (const hill of this._context.hills) {
            if (hill.letter === objectiveLetter) return hill;
        }

        return undefined;
    }

    private _resolveAnchorDestination(
        sector: KothSpawnSectorConfig,
        anchorObjectId: number,
        context?: KothSpawnEvaluationContext
    ): ResolvedKothSpawnDestination | undefined {
        if (!this._isObjectiveSpawnSector(sector)) return undefined;
        if (this._isForbiddenSpawnAnchorObjectId(anchorObjectId)) return undefined;
        if (!this._isConfiguredObjectiveAnchorObjectId(anchorObjectId)) return undefined;
        if (!this._sectorHasAnchorObjectId(sector, anchorObjectId)) return undefined;

        const position = this._getAnchorPosition(anchorObjectId);
        if (!position) return undefined;

        if (this._isZeroVector(position)) {
            this._warnInvalidAnchorPositionOnce(anchorObjectId);
            return undefined;
        }

        const positionVector = context ? this._getAnchorPositionVector(anchorObjectId) : undefined;

        return {
            position,
            orientationRadians:
                context && positionVector
                    ? this._yawTowardActiveObjectiveFromVector(positionVector, context)
                    : this._yawTowardActiveObjective(position),
            label: `${sector.regionId}-${sector.teamSide}-${sector.variantSide}-${anchorObjectId}`,
            pressureZones: sector.pressureZones,
            anchorObjectId,
        };
    }

    private _getCapturePointPosition(capturePointId: number): mod.Vector | undefined {
        const cached = this._context.runtime.spawn.capturePointPositionByObjectId.get(capturePointId);
        if (cached) return cached;

        try {
            const position = mod.GetObjectPosition(mod.GetCapturePoint(capturePointId));
            this._context.runtime.spawn.capturePointPositionByObjectId.set(capturePointId, position);
            this._context.runtime.spawn.capturePointPositionVectorByObjectId.set(
                capturePointId,
                this._toPositionVector(position)
            );
            return position;
        } catch (_err) {
            this._warnMissingObjectiveOnce(capturePointId);
            return undefined;
        }
    }

    private _getAnchorPosition(anchorObjectId: number): mod.Vector | undefined {
        const cached = this._context.runtime.spawn.anchorPositionByObjectId.get(anchorObjectId);
        if (cached) return cached;

        try {
            const spatialObject = mod.GetSpatialObject(anchorObjectId);
            const position = mod.GetObjectPosition(spatialObject);
            if (this._isZeroVector(position)) {
                this._warnInvalidAnchorPositionOnce(anchorObjectId);
                return undefined;
            }

            this._context.runtime.spawn.anchorPositionByObjectId.set(anchorObjectId, position);
            this._context.runtime.spawn.anchorPositionVectorByObjectId.set(
                anchorObjectId,
                this._toPositionVector(position)
            );
            return position;
        } catch (_err) {
            this._warnMissingAnchorOnce(anchorObjectId);
            return undefined;
        }
    }

    private _getAnchorPositionVector(anchorObjectId: number): KothSpawnPositionVector | undefined {
        const cached = this._context.runtime.spawn.anchorPositionVectorByObjectId.get(anchorObjectId);
        if (cached) return cached;

        const position = this._getAnchorPosition(anchorObjectId);
        if (!position) return undefined;

        const positionVector = this._toPositionVector(position);
        this._context.runtime.spawn.anchorPositionVectorByObjectId.set(anchorObjectId, positionVector);
        return positionVector;
    }

    private _teleportPlayer(
        playerId: number,
        player: mod.Player,
        destination: ResolvedKothSpawnDestination
    ): boolean {
        try {
            const orientationRadians = this._yawTowardActiveObjective(destination.position);
            mod.Teleport(player, destination.position, orientationRadians);
            if (destination.anchorObjectId !== undefined) this._markAnchorCooldown(destination.anchorObjectId);
            this._setPlayerPresenceZonesFromTeleport(playerId, destination.pressureZones);
            this._enqueueTeleportOrientationConfirmJob(playerId, KOTH_TELEPORT_ORIENTATION_CONFIRM_DELAY_MS);
            return true;
        } catch (_err) {
            displayWorldLog(mod.Message("[KOTH] Spawn teleport failed for {}", destination.label));
            return false;
        }
    }

    private _isPositionVectorSafeFromEnemies(
        position: KothSpawnPositionVector,
        context: KothSpawnEvaluationContext,
        radiusMeters: number
    ): boolean {
        return this._countEnemiesNearPositionVector(position, context, radiusMeters) <= 0;
    }

    private _countEnemiesNearPositionVector(
        position: KothSpawnPositionVector,
        context: KothSpawnEvaluationContext,
        radiusMeters: number
    ): number {
        const radiusSquared = this._square(radiusMeters);
        let count = 0;

        for (const player of context.players) {
            if (player.teamId !== context.enemyTeamId) continue;
            if (this._distanceSquared(position, player.positionVector) <= radiusSquared) {
                count += 1;
            }
        }

        return count;
    }

    private _getPlayerPosition(player: mod.Player): mod.Vector | undefined {
        try {
            return mod.GetSoldierState(player, mod.SoldierStateVector.GetPosition);
        } catch (_err) {
            try {
                return mod.GetObjectPosition(player);
            } catch (_innerErr) {
                return undefined;
            }
        }
    }

    private _toPositionVector(position: mod.Vector): KothSpawnPositionVector {
        return {
            x: mod.XComponentOf(position),
            y: mod.YComponentOf(position),
            z: mod.ZComponentOf(position),
        };
    }

    private _distanceSquared(first: KothSpawnPositionVector, second: KothSpawnPositionVector): number {
        const deltaX = first.x - second.x;
        const deltaY = first.y - second.y;
        const deltaZ = first.z - second.z;

        return deltaX * deltaX + deltaY * deltaY + deltaZ * deltaZ;
    }

    private _square(value: number): number {
        return value * value;
    }

    private _yawTowardActiveObjectiveFromVector(
        fromPosition: KothSpawnPositionVector,
        context: KothSpawnEvaluationContext
    ): number {
        const deltaX = context.activeObjectiveVector.x - fromPosition.x;
        const deltaZ = context.activeObjectiveVector.z - fromPosition.z;
        return this._normalizeRadians(Math.atan2(deltaX, deltaZ));
    }

    private _yawTowardActiveObjective(fromPosition: mod.Vector): number {
        const objectivePosition = this._getActiveObjectivePosition(this._context.runtime.hill.currentHillLetter);
        if (!objectivePosition) return 0;

        return this._normalizeRadians(
            Math.atan2(
                mod.XComponentOf(objectivePosition) - mod.XComponentOf(fromPosition),
                mod.ZComponentOf(objectivePosition) - mod.ZComponentOf(fromPosition)
            )
        );
    }

    private _isPlayerFacingActiveObjective(player: mod.Player, fromPosition: mod.Vector): boolean {
        const objectivePosition = this._getActiveObjectivePosition(this._context.runtime.hill.currentHillLetter);
        if (!objectivePosition) return true;

        const deltaX = mod.XComponentOf(objectivePosition) - mod.XComponentOf(fromPosition);
        const deltaZ = mod.ZComponentOf(objectivePosition) - mod.ZComponentOf(fromPosition);
        const desiredMagnitude = Math.sqrt(deltaX * deltaX + deltaZ * deltaZ);
        if (desiredMagnitude <= 0) return true;

        try {
            const facingDirection = mod.GetSoldierState(player, mod.SoldierStateVector.GetFacingDirection);
            const facingX = mod.XComponentOf(facingDirection);
            const facingZ = mod.ZComponentOf(facingDirection);
            const facingMagnitude = Math.sqrt(facingX * facingX + facingZ * facingZ);
            if (facingMagnitude <= 0) return false;

            const dot =
                (facingX / facingMagnitude) * (deltaX / desiredMagnitude) +
                (facingZ / facingMagnitude) * (deltaZ / desiredMagnitude);
            return dot >= KOTH_TELEPORT_ORIENTATION_CONFIRM_DOT_TOLERANCE;
        } catch (_err) {
            return true;
        }
    }

    private _normalizeRadians(value: number): number {
        let normalized = value;
        while (normalized > Math.PI) normalized -= Math.PI * 2;
        while (normalized < -Math.PI) normalized += Math.PI * 2;
        return normalized;
    }

    private _getNextAnchorIndex(sector: KothSpawnSectorConfig): number {
        const key = this._getSectorKey(sector);
        return this._context.runtime.spawn.nextAnchorIndexBySectorKey[key] ?? 0;
    }

    private _setNextAnchorIndex(sector: KothSpawnSectorConfig, index: number): void {
        if (sector.anchorObjectIds.length <= 0) return;

        const key = this._getSectorKey(sector);
        this._context.runtime.spawn.nextAnchorIndexBySectorKey[key] = index % sector.anchorObjectIds.length;
    }

    private _getSectorKey(sector: KothSpawnSectorConfig): string {
        return getSectorKey(sector.regionId, sector.teamSide, sector.variantSide);
    }

    private _getAreaTriggerId(eventAreaTrigger: mod.AreaTrigger): number | undefined {
        try {
            return mod.GetObjId(eventAreaTrigger);
        } catch (_err) {
            return undefined;
        }
    }

    private _safeEnablePresenceAreaTrigger(triggerId: number, enabled: boolean): void {
        try {
            mod.EnableAreaTrigger(mod.GetAreaTrigger(triggerId), enabled);
        } catch (_err) {
            const warnings = this._context.runtime.spawn.warnedPresenceAreaTriggerResolveByObjectId;
            if (!warnings[triggerId]) {
                warnings[triggerId] = true;
                displayWorldLog(mod.Message("[KOTH] Presence area trigger {} is not available", triggerId));
            }
        }
    }

    private _safeEnableHq(hqId: number, enabled: boolean): void {
        try {
            mod.EnableHQ(mod.GetHQ(hqId), enabled);
        } catch (_err) {
            return;
        }
    }

    private _isForbiddenSpawnAnchorObjectId(objectId: number): boolean {
        if (objectId === this._context.spawns.hqSpawners.team1 || objectId === this._context.spawns.hqSpawners.team2) {
            return true;
        }

        for (const hqId of this._context.spawns.disabledLegacyHqIds) {
            if (objectId === hqId) return true;
        }

        return false;
    }

    private _isNearForbiddenSpawnObject(playerPosition: mod.Vector, objectId: number): boolean {
        const forbiddenPosition = this._getForbiddenSpawnPosition(objectId);
        if (!forbiddenPosition) return false;

        return mod.DistanceBetween(playerPosition, forbiddenPosition) <= KOTH_FORBIDDEN_SPAWN_POSITION_EPSILON_METERS;
    }

    private _getForbiddenSpawnPosition(objectId: number): mod.Vector | undefined {
        const cached = this._forbiddenSpawnPositionByObjectId.get(objectId);
        if (cached) return cached;

        try {
            const position = mod.GetObjectPosition(mod.GetSpawnPoint(objectId));
            this._forbiddenSpawnPositionByObjectId.set(objectId, position);
            return position;
        } catch (_spawnPointErr) {
            try {
                const position = mod.GetObjectPosition(mod.GetHQ(objectId));
                this._forbiddenSpawnPositionByObjectId.set(objectId, position);
                return position;
            } catch (_hqErr) {
                return undefined;
            }
        }
    }

    private _undeployUnanchoredPlayer(playerState: KothPlayerState): void {
        if (!mod.IsPlayerValid(playerState.player)) return;

        try {
            mod.SetRedeployTime(playerState.player, this._context.rules.redeployTimeSeconds);
            mod.UndeployPlayer(playerState.player);
            playerState.isDeployed = false;
            this.clearPlayerPresenceCache(playerState.id);
            this._requestAnchorSpawnForPlayerState(playerState, 0);
        } catch (_err) {
            return;
        }
    }

    private _clearLiveInputRestrictions(player: mod.Player): void {
        if (!mod.IsPlayerValid(player)) return;

        mod.EnableAllInputRestrictions(player, false);
        mod.EnableInputRestriction(player, mod.RestrictedInputs.FireWeapon, false);
        mod.EnableInputRestriction(player, mod.RestrictedInputs.Interact, false);
        mod.EnableInputRestriction(player, mod.RestrictedInputs.MoveForwardBack, false);
        mod.EnableInputRestriction(player, mod.RestrictedInputs.MoveLeftRight, false);
    }

    private _isLivingDeployedParticipant(playerState: KothPlayerState): boolean {
        const player = playerState.player;
        if (!mod.IsPlayerValid(player)) return false;
        if (!playerState.isDeployed) return false;
        if (!isKothPlayerLiving(player)) return false;

        const team = mod.GetTeam(player);
        playerState.setTeam(team);
        return isParticipantTeam(team);
    }

    private _shouldRetryTeleport(job: KothSpawnJob): boolean {
        return job.attempt < 4 && this._getMatchTimeMs() - job.createdAtMs < this._context.spawns.rules.spawnRetryWindowMs;
    }

    private _getMatchTimeMs(): number {
        return mod.GetMatchTimeElapsed() * 1000;
    }

    private _getEnemyTeamId(teamId: KothTeamId): KothTeamId {
        return teamId === 1 ? 2 : 1;
    }

    private _isZeroVector(position: mod.Vector): boolean {
        return (
            mod.XComponentOf(position) === 0 &&
            mod.YComponentOf(position) === 0 &&
            mod.ZComponentOf(position) === 0
        );
    }

    private _warnMissingAnchorOnce(anchorObjectId: number): void {
        const warnings = this._context.runtime.spawn.warnedSpawnAnchorResolveByObjectId;
        if (warnings[anchorObjectId]) return;

        warnings[anchorObjectId] = true;
        displayWorldLog(mod.Message("[KOTH] Spawn anchor object {} is not available", anchorObjectId));
    }

    private _warnInvalidAnchorPositionOnce(anchorObjectId: number): void {
        const warnings = this._context.runtime.spawn.warnedSpawnAnchorResolveByObjectId;
        if (warnings[anchorObjectId]) return;

        warnings[anchorObjectId] = true;
        displayWorldLog(mod.Message("[KOTH] Spawn anchor object {} resolved to origin and was skipped", anchorObjectId));
    }

    private _warnMissingAnchorsOnce(): void {
        if (this._context.runtime.spawn.warnedMissingSpawnAnchors) return;

        this._context.runtime.spawn.warnedMissingSpawnAnchors = true;
        displayWorldLog(mod.Message("[KOTH] No safe KOTH objective spawn anchors available"));
    }

    private _warnMissingObjectiveOnce(objectId: number): void {
        const warnings = this._context.runtime.warnedMissingObjectiveIds;
        if (warnings[objectId]) return;

        warnings[objectId] = true;
        displayWorldLog(mod.Message("[KOTH] Objective object {} is not available", objectId));
    }

    private _warnTeleportFailedOnce(playerId: number): void {
        const warnings = this._context.runtime.spawn.warnedSpawnTeleportByPlayerId;
        if (warnings[playerId]) return;

        warnings[playerId] = true;
        displayWorldLog(mod.Message("[KOTH] No non-HQ spawn destination available for player {}", playerId));
    }
}


// --- SOURCE: src\king-of-the-hill-mode\live\config\koth-ui.ts ---
export const KOTH_UI_COLOR_RGB = {
    team1: [0.1647, 0.3098, 0.4941] as const,
    team2: [0.6353, 0.251, 0.1843] as const,
    neutral: [0.3412, 0.3412, 0.3412] as const,
    contested: [0.749, 0.6157, 0.3608] as const,
    crown: [1, 1, 1] as const,
    border: [0.3294, 0.3686, 0.3882] as const,
    text: [1, 1, 1] as const,
    background: [0, 0, 0] as const,
} as const;

export const KOTH_UI_COLORS = {
    team1: mod.CreateVector(...KOTH_UI_COLOR_RGB.team1),
    team2: mod.CreateVector(...KOTH_UI_COLOR_RGB.team2),
    neutral: mod.CreateVector(...KOTH_UI_COLOR_RGB.neutral),
    contested: mod.CreateVector(...KOTH_UI_COLOR_RGB.contested),
    crown: mod.CreateVector(...KOTH_UI_COLOR_RGB.crown),
    border: mod.CreateVector(...KOTH_UI_COLOR_RGB.border),
    text: mod.CreateVector(...KOTH_UI_COLOR_RGB.text),
    background: mod.CreateVector(...KOTH_UI_COLOR_RGB.background),
} as const;

export const KOTH_UI = {
    rootNamePrefix: 'KOTH_HUD_ROOT_',
    scoreBarWidth: 240,
    scoreBarHeight: 8,
    objectiveBarWidth: 88,
    objectiveBarHeight: 4,
    objectiveFlagSize: 80,
} as const;


// --- SOURCE: src\king-of-the-hill-mode\live\services\koth-ui-service.ts ---







const KOTH_TOP_HUD_LAYOUT = {
    rootX: 0,
    rootY: 36,
    rootWidth: 7000,
    rootHeight: 7000,
    topHudY: -511.9,
    topHudWidth: 576,
    topHudHeight: 50,
    friendlyScoreBoxX: -238,
    enemyScoreBoxX: 226,
    scoreBoxY: -4,
    scoreBoxWidth: 82,
    scoreBoxHeight: 42,
    scoreTextX: 0,
    scoreTextY: 0,
    scoreTextWidth: 84,
    scoreTextHeight: 50,
    scoreTextSize: 24,
    friendlyBarX: 108,
    enemyBarX: 342,
    barY: 15,
    barWidth: 120,
    barHeight: 12,
    targetScoreBoxX: 258,
    targetScoreBoxY: 0,
    targetScoreBoxWidth: 60,
    targetScoreBoxHeight: 40,
    targetScoreTextX: 0,
    targetScoreTextY: 0,
    targetScoreTextWidth: 60,
    targetScoreTextHeight: 50,
    targetScoreTextSize: 24,
    crownX: 0,
    crownY: -531,
    crownWidth: 20,
    crownHeight: 18,
    objectiveX: 0,
    objectiveCompactY: -462.87,
    objectiveExpandedY: -430,
    objectiveCompactSize: 40,
    objectiveExpandedSize: 50,
    objectiveTextWidth: 100,
    objectiveTextHeight: 50,
    objectiveTextSize: 17,
    objectiveExpandedTextSize: 20,
    objectiveTimerCompactY: -39,
    objectiveTimerExpandedY: -46,
    objectiveLockedTimerY: -46,
    objectiveTimerWidth: 90,
    objectiveTimerHeight: 18,
    objectiveTimerTextSize: 14,
    objectiveDetailLabelY: 37,
    objectiveDetailLabelWidth: 110,
    objectiveDetailLabelHeight: 22,
    objectiveDetailLabelSize: 14,
    objectiveDetailCountX: 46,
    objectiveDetailCountY: 58,
    objectiveDetailCountWidth: 30,
    objectiveDetailCountHeight: 18,
    objectiveDetailCountTextSize: 13,
    objectiveDetailBarY: 58,
    objectiveDetailBarWidth: 50,
    objectiveDetailBarHeight: 9,
    objectiveDetailBarFillHeight: 9,
    contestedOutlineSizes: [50, 70] as const,
    contestedOutlineClosePadding: 10,
    contestedOutlineWidePadding: 30,
} as const;

const KOTH_TOP_HUD_COLORS = {
    root: mod.CreateVector(0.051, 0.051, 0.051),
    dark: mod.CreateVector(0.2, 0.2, 0.2),
} as const;

const KOTH_CONTESTED_BLINK_INTERVAL_MS = 260;
const KOTH_CONTESTED_BLINK_FRAME_COUNT = 4;

export class KothUiService {
    private readonly _widgetByName = new Map<string, mod.UIWidget>();
    private readonly _visibleByName = new Map<string, boolean>();
    private _contestedBlinkIntervalHandle: number | undefined;
    private _contestedBlinkFrame = 0;

    public constructor(private readonly _context: KothLiveModeContext) {}

    public ensurePlayerHud(playerId: number): void {
        const playerState = this._context.runtime.playersById.get(playerId);
        if (!playerState || !mod.IsPlayerValid(playerState.player)) return;
        if (playerState.isBot) {
            this._hidePlayerHudForPlayer(playerId);
            return;
        }
        if (!isParticipantTeam(mod.GetTeam(playerState.player))) return;

        const player = playerState.player;
        const rootName = this._name(playerId, 'Root');
        const existingRoot = this._findWidget(rootName);
        if (existingRoot) {
            this._ensureObjectiveHud(playerId, player, existingRoot);
            return;
        }

        const root = this._addContainerWithFill(
            rootName,
            mod.CreateVector(KOTH_TOP_HUD_LAYOUT.rootX, KOTH_TOP_HUD_LAYOUT.rootY, 0),
            mod.CreateVector(KOTH_TOP_HUD_LAYOUT.rootWidth, KOTH_TOP_HUD_LAYOUT.rootHeight, 0),
            mod.UIAnchor.Center,
            mod.GetUIRoot(),
            player,
            KOTH_TOP_HUD_COLORS.root,
            1,
            mod.UIBgFill.None
        );
        if (!root) return;

        const topHud = this._addContainerWithFill(
            this._name(playerId, 'TopHudContainer'),
            mod.CreateVector(0, KOTH_TOP_HUD_LAYOUT.topHudY, 0),
            mod.CreateVector(KOTH_TOP_HUD_LAYOUT.topHudWidth, KOTH_TOP_HUD_LAYOUT.topHudHeight, 0),
            mod.UIAnchor.Center,
            root,
            player,
            KOTH_TOP_HUD_COLORS.dark,
            1,
            mod.UIBgFill.None
        );
        if (!topHud) return;

        this._ensureScoreBox(
            playerId,
            player,
            topHud,
            'FriendlyScoreBox',
            'FriendlyScore',
            KOTH_TOP_HUD_LAYOUT.friendlyScoreBoxX,
            KOTH_UI_COLORS.team1,
            mod.Message(mod.stringkeys.Text_Friendly_Score),
            KOTH_UI_COLORS.team1
        );
        this._ensureScoreBox(
            playerId,
            player,
            topHud,
            'EnemyScoreBox',
            'EnemyScore',
            KOTH_TOP_HUD_LAYOUT.enemyScoreBoxX,
            KOTH_UI_COLORS.team2,
            mod.Message(mod.stringkeys.Text_Enemy_Score),
            KOTH_UI_COLORS.team2
        );
        this._ensureScoreBar(
            playerId,
            player,
            topHud,
            'Team1BarBg',
            'Team1BarFill',
            KOTH_TOP_HUD_LAYOUT.friendlyBarX,
            mod.UIAnchor.TopLeft,
            KOTH_UI_COLORS.team1,
            KOTH_UI_COLORS.team1
        );
        this._ensureScoreBar(
            playerId,
            player,
            topHud,
            'Team2BarBg',
            'Team2BarFill',
            KOTH_TOP_HUD_LAYOUT.enemyBarX,
            mod.UIAnchor.TopRight,
            KOTH_UI_COLORS.team2,
            KOTH_UI_COLORS.team2
        );

        const targetScoreBox = this._addContainerWithFill(
            this._name(playerId, 'TargetScoreBox'),
            mod.CreateVector(KOTH_TOP_HUD_LAYOUT.targetScoreBoxX, KOTH_TOP_HUD_LAYOUT.targetScoreBoxY, 0),
            mod.CreateVector(KOTH_TOP_HUD_LAYOUT.targetScoreBoxWidth, KOTH_TOP_HUD_LAYOUT.targetScoreBoxHeight, 0),
            mod.UIAnchor.TopLeft,
            topHud,
            player,
            KOTH_TOP_HUD_COLORS.dark,
            0.5,
            mod.UIBgFill.Solid
        );
        if (targetScoreBox) {
            this._addTextWithStyle(
                this._name(playerId, 'TargetScore'),
                mod.CreateVector(KOTH_TOP_HUD_LAYOUT.targetScoreTextX, KOTH_TOP_HUD_LAYOUT.targetScoreTextY, 0),
                mod.CreateVector(KOTH_TOP_HUD_LAYOUT.targetScoreTextWidth, KOTH_TOP_HUD_LAYOUT.targetScoreTextHeight, 0),
                mod.UIAnchor.Center,
                targetScoreBox,
                player,
                mod.Message(mod.stringkeys.Target_Score),
                KOTH_TOP_HUD_LAYOUT.targetScoreTextSize,
                KOTH_UI_COLORS.text,
                1,
                mod.UIAnchor.Center
            );
        }

        this._addImage(
            this._name(playerId, 'Crown'),
            mod.CreateVector(KOTH_TOP_HUD_LAYOUT.crownX, KOTH_TOP_HUD_LAYOUT.crownY, 0),
            mod.CreateVector(KOTH_TOP_HUD_LAYOUT.crownWidth, KOTH_TOP_HUD_LAYOUT.crownHeight, 0),
            root,
            player
        );
        this._ensureObjectiveHud(playerId, player, root);
        this.resetObjectiveHudPresentation(playerId);
    }

    public precreatePlayerHudHidden(playerId: number): void {
        this.ensurePlayerHud(playerId);
        this.resetObjectiveHudPresentation(playerId);
        this.setPlayerHudVisible(playerId, false);
    }

    public refreshObjectiveHudForPlayer(playerId: number, visible: boolean): void {
        const playerState = this._context.runtime.playersById.get(playerId);
        if (!playerState || !mod.IsPlayerValid(playerState.player)) return;
        if (playerState.isBot) {
            this._hidePlayerHudForPlayer(playerId);
            return;
        }

        this.ensurePlayerHud(playerId);
        this.updatePlayerHud(playerId);
        this.setPlayerHudVisible(playerId, visible);
        this._syncContestedBlinkTimer();
    }

    public refreshObjectiveHudOnlyForPlayer(playerId: number, visible: boolean): void {
        const runtime = this._context.runtime;
        const playerState = runtime.playersById.get(playerId);
        if (!playerState || !mod.IsPlayerValid(playerState.player)) return;
        if (playerState.isBot) {
            this._hidePlayerHudForPlayer(playerId);
            return;
        }

        this.ensurePlayerHud(playerId);

        const activeHill = this._context.hills[runtime.hill.currentHillIndex];
        const teamId = getKothTeamId(mod.GetTeam(playerState.player));
        this._safeSetText(this._name(playerId, 'ObjectiveLetter'), getHillLetterMessage(activeHill.letter));
        this._safeSetTextColor(this._name(playerId, 'ObjectiveLetter'), KOTH_UI_COLORS.text);
        this._updateObjectiveHud(playerId, teamId);
        this.setPlayerHudVisible(playerId, visible);
        this._syncContestedBlinkTimer();
    }

    public setPlayerHudVisible(playerId: number, visible: boolean): void {
        const playerState = this._context.runtime.playersById.get(playerId);
        if (!playerState || playerState.isBot) {
            this._hidePlayerHudForPlayer(playerId);
            return;
        }

        const shouldShow = visible && this._context.runtime.isMatchActive;
        const rootName = this._name(playerId, 'Root');
        const root = this._findWidget(rootName);
        if (root) this._safeSetVisible(root, shouldShow, rootName);

        const objectiveRootName = this._name(playerId, 'ObjectiveRoot');
        const objectiveRoot = this._findWidget(objectiveRootName);
        if (objectiveRoot) this._safeSetVisible(objectiveRoot, shouldShow, objectiveRootName);
    }

    public resetObjectiveHudPresentation(playerId: number): void {
        const root = this._findWidget(this._name(playerId, 'ObjectiveRoot'));
        if (!root) return;

        const playerState = this._context.runtime.playersById.get(playerId);
        const teamId =
            playerState && mod.IsPlayerValid(playerState.player)
                ? getKothTeamId(mod.GetTeam(playerState.player))
                : 0;
        const visualControlState = this._getObjectiveVisualControlState();

        this._safeSetBgColor(root, this._getObjectiveFlagColor(visualControlState, teamId), this._name(playerId, 'ObjectiveRoot'));
        this._safeSetBgFill(root, this._getObjectiveFlagFill(visualControlState), this._name(playerId, 'ObjectiveRoot'));
        this._setObjectiveExpandedDetailsVisibleForPlayer(playerId, false, false);
        this._applyObjectiveOutlineState(
            playerId,
            KOTH_TOP_HUD_LAYOUT.objectiveCompactSize,
            visualControlState,
            teamId,
            false,
            false
        );
        this._safeSetPosition(
            this._name(playerId, 'ObjectiveTimer'),
            mod.CreateVector(0, KOTH_TOP_HUD_LAYOUT.objectiveTimerCompactY, 0)
        );
        this._safeSetVisibleByName(this._name(playerId, 'ObjectiveTimer'), false);
    }

    public resetObjectiveHudPresentationForAll(): void {
        this._context.runtime.playersById.forEach((playerState) => {
            this.resetObjectiveHudPresentation(playerState.id);
        });
        this._syncContestedBlinkTimer();
    }

    public updateAll(): void {
        this._context.runtime.playersById.forEach((playerState) => {
            if (playerState.isBot) {
                this._hidePlayerHudForPlayer(playerState.id);
                return;
            }
            this.refreshObjectiveHudForPlayer(playerState.id, this._context.runtime.isMatchActive);
        });
        this._syncContestedBlinkTimer();
        this._context.runtime.hudDirty = false;
    }

    public updatePlayerHud(playerId: number): void {
        const runtime = this._context.runtime;
        const playerState = runtime.playersById.get(playerId);
        if (!playerState || !mod.IsPlayerValid(playerState.player)) return;
        if (playerState.isBot) {
            this._hidePlayerHudForPlayer(playerId);
            return;
        }

        const root = this._findWidget(this._name(playerId, 'Root'));
        if (!root) return;

        const activeHill = this._context.hills[runtime.hill.currentHillIndex];

        const teamId = getKothTeamId(mod.GetTeam(playerState.player));
        const isTeam1Viewer = teamId === 1;
        const friendlyScore = isTeam1Viewer ? runtime.team1Score : runtime.team2Score;
        const enemyScore = isTeam1Viewer ? runtime.team2Score : runtime.team1Score;

        this._safeSetText(this._name(playerId, 'FriendlyScore'), formatScore3Message(friendlyScore));
        this._safeSetText(this._name(playerId, 'EnemyScore'), formatScore3Message(enemyScore));
        this._safeSetText(this._name(playerId, 'TargetScore'), mod.Message(mod.stringkeys.Target_Score));
        this._safeSetText(this._name(playerId, 'ObjectiveLetter'), getHillLetterMessage(activeHill.letter));
        this._safeSetTextColor(this._name(playerId, 'FriendlyScore'), KOTH_UI_COLORS.team1);
        this._safeSetTextColor(this._name(playerId, 'EnemyScore'), KOTH_UI_COLORS.team2);

        this._safeSetSize(
            this._name(playerId, 'Team1BarFill'),
            mod.CreateVector(KOTH_TOP_HUD_LAYOUT.barWidth * this._scoreRatio(friendlyScore), KOTH_TOP_HUD_LAYOUT.barHeight, 0)
        );
        this._safeSetSize(
            this._name(playerId, 'Team2BarFill'),
            mod.CreateVector(KOTH_TOP_HUD_LAYOUT.barWidth * this._scoreRatio(enemyScore), KOTH_TOP_HUD_LAYOUT.barHeight, 0)
        );
        this._updateObjectiveHud(playerId, teamId);
    }

    public syncContestedBlinkTimer(): void {
        this._syncContestedBlinkTimer();
    }

    public hideLiveHud(): void {
        this._context.runtime.playersById.forEach((playerState) => {
            this.resetObjectiveHudPresentation(playerState.id);
            this._hidePlayerHudForPlayer(playerState.id);
        });
        this._stopContestedBlinkTimer();
    }

    public forgetPlayerHud(playerId: number): void {
        const prefix = this._name(playerId, '');
        for (const name of [...this._widgetByName.keys()]) {
            if (name.startsWith(prefix)) {
                this._widgetByName.delete(name);
                this._visibleByName.delete(name);
            }
        }
    }

    public showPostmatch(winner: mod.Team): void {
        this.hideLiveHud();
        this._showPostmatchForTeam(KOTH_TEAM_1, winner);
        this._showPostmatchForTeam(KOTH_TEAM_2, winner);
    }

    private _showPostmatchForTeam(receiver: mod.Team, winner: mod.Team): void {
        const teamId = getKothTeamId(receiver);
        const rootName = `KOTH_POSTMATCH_${teamId}`;
        const existing = this._findWidget(rootName);
        if (existing) this._safeSetVisible(existing, true, rootName);

        const root =
            existing ??
            this._addContainer(
                rootName,
                mod.CreateVector(0, 145, 0),
                mod.CreateVector(720, 180, 0),
                mod.UIAnchor.TopCenter,
                mod.GetUIRoot(),
                receiver,
                KOTH_UI_COLORS.background,
                0.5
            );
        if (!root) return;

        const won = mod.Equals(receiver, winner);
        const resultName = `KOTH_POSTMATCH_RESULT_${teamId}`;
        const scoreName = `KOTH_POSTMATCH_SCORE_${teamId}`;
        if (!this._findWidget(resultName)) {
            this._addText(resultName, mod.CreateVector(0, 24, 0), mod.CreateVector(620, 56, 0), root, receiver, 44);
        }
        if (!this._findWidget(scoreName)) {
            this._addText(scoreName, mod.CreateVector(0, 92, 0), mod.CreateVector(620, 36, 0), root, receiver, 26);
        }

        this._safeSetText(resultName, won ? mod.Message(mod.stringkeys.KothMatchWon) : mod.Message(mod.stringkeys.KothMatchLost));
        this._safeSetTextColor(resultName, this._getPostmatchResultColor(receiver, won));
        this._safeSetText(
            scoreName,
            mod.Message(mod.stringkeys.KothFinalScore, this._context.runtime.team1Score, this._context.runtime.team2Score)
        );
    }

    private _ensureScoreBox(
        playerId: number,
        player: mod.Player,
        parent: mod.UIWidget,
        boxSuffix: string,
        textSuffix: string,
        boxX: number,
        boxColor: mod.Vector,
        textLabel: mod.Message,
        textColor: mod.Vector
    ): void {
        const box = this._addContainerWithFill(
            this._name(playerId, boxSuffix),
            mod.CreateVector(boxX, KOTH_TOP_HUD_LAYOUT.scoreBoxY, 0),
            mod.CreateVector(KOTH_TOP_HUD_LAYOUT.scoreBoxWidth, KOTH_TOP_HUD_LAYOUT.scoreBoxHeight, 0),
            mod.UIAnchor.Center,
            parent,
            player,
            boxColor,
            0.5,
            mod.UIBgFill.Blur
        );
        if (!box) return;

        this._addTextWithStyle(
            this._name(playerId, textSuffix),
            mod.CreateVector(KOTH_TOP_HUD_LAYOUT.scoreTextX, KOTH_TOP_HUD_LAYOUT.scoreTextY, 0),
            mod.CreateVector(KOTH_TOP_HUD_LAYOUT.scoreTextWidth, KOTH_TOP_HUD_LAYOUT.scoreTextHeight, 0),
            mod.UIAnchor.Center,
            box,
            player,
            textLabel,
            KOTH_TOP_HUD_LAYOUT.scoreTextSize,
            textColor,
            1,
            mod.UIAnchor.Center
        );
    }

    private _ensureScoreBar(
        playerId: number,
        player: mod.Player,
        parent: mod.UIWidget,
        bgSuffix: string,
        fillSuffix: string,
        bgX: number,
        fillAnchor: mod.UIAnchor,
        bgColor: mod.Vector,
        fillColor: mod.Vector
    ): void {
        const bg = this._addContainerWithFill(
            this._name(playerId, bgSuffix),
            mod.CreateVector(bgX, KOTH_TOP_HUD_LAYOUT.barY, 0),
            mod.CreateVector(KOTH_TOP_HUD_LAYOUT.barWidth, KOTH_TOP_HUD_LAYOUT.barHeight, 0),
            mod.UIAnchor.TopLeft,
            parent,
            player,
            bgColor,
            0.5,
            mod.UIBgFill.Blur
        );
        if (!bg) return;

        this._addContainerWithFill(
            this._name(playerId, fillSuffix),
            mod.CreateVector(0, 0, 0),
            mod.CreateVector(0, KOTH_TOP_HUD_LAYOUT.barHeight, 0),
            fillAnchor,
            bg,
            player,
            fillColor,
            1,
            mod.UIBgFill.Solid
        );
    }

    private _ensureObjectiveHud(playerId: number, player: mod.Player, parent: mod.UIWidget): void {
        const rootName = this._name(playerId, 'ObjectiveRoot');
        const existingRoot = this._findWidget(rootName);
        if (existingRoot) {
            this._ensureObjectiveOutlineWidgets(playerId, player, existingRoot);
            return;
        }

        const root = this._addContainerWithFill(
            rootName,
            mod.CreateVector(KOTH_TOP_HUD_LAYOUT.objectiveX, KOTH_TOP_HUD_LAYOUT.objectiveCompactY, 0),
            mod.CreateVector(
                KOTH_TOP_HUD_LAYOUT.objectiveCompactSize,
                KOTH_TOP_HUD_LAYOUT.objectiveCompactSize,
                0
            ),
            mod.UIAnchor.Center,
            parent,
            player,
            KOTH_UI_COLORS.neutral,
            0.5,
            mod.UIBgFill.Solid
        );
        if (!root) return;

        this._addTextWithStyle(
            this._name(playerId, 'ObjectiveLetter'),
            mod.CreateVector(0, 0, 0),
            mod.CreateVector(KOTH_TOP_HUD_LAYOUT.objectiveTextWidth, KOTH_TOP_HUD_LAYOUT.objectiveTextHeight, 0),
            mod.UIAnchor.Center,
            root,
            player,
            mod.Message(mod.stringkeys.Objective_Letter),
            KOTH_TOP_HUD_LAYOUT.objectiveTextSize,
            KOTH_UI_COLORS.text,
            0.6,
            mod.UIAnchor.Center
        );

        this._ensureObjectiveOutlineWidgets(playerId, player, root);
        this._addTextWithStyle(
            this._name(playerId, 'ObjectiveTimer'),
            mod.CreateVector(0, KOTH_TOP_HUD_LAYOUT.objectiveTimerCompactY, 0),
            mod.CreateVector(KOTH_TOP_HUD_LAYOUT.objectiveTimerWidth, KOTH_TOP_HUD_LAYOUT.objectiveTimerHeight, 0),
            mod.UIAnchor.Center,
            root,
            player,
            mod.Message(mod.stringkeys.TimeDefault),
            KOTH_TOP_HUD_LAYOUT.objectiveTimerTextSize,
            KOTH_UI_COLORS.text,
            0.9,
            mod.UIAnchor.Center
        );
        this._addObjectiveExpandedDetails(playerId, player, root);
        this._applyObjectiveOutlineState(playerId, KOTH_TOP_HUD_LAYOUT.objectiveCompactSize, 'neutral', 0, false, false);
        this._setObjectiveExpandedDetailsVisibleForPlayer(playerId, false, false);
        this._safeSetVisibleByName(this._name(playerId, 'ObjectiveTimer'), false);
    }

    private _ensureObjectiveOutlineWidgets(playerId: number, player: mod.Player, parent: mod.UIWidget): void {
        if (!this._findWidget(this._name(playerId, 'ObjectiveStaticOutline'))) {
            this._addObjectiveOutline(
                playerId,
                player,
                parent,
                'ObjectiveStaticOutline',
                KOTH_TOP_HUD_LAYOUT.objectiveCompactSize,
                KOTH_UI_COLORS.text
            );
        }
        if (!this._findWidget(this._name(playerId, 'ObjectiveContestedOutline'))) {
            this._addObjectiveOutline(
                playerId,
                player,
                parent,
                'ObjectiveContestedOutline',
                KOTH_TOP_HUD_LAYOUT.contestedOutlineSizes[0],
                KOTH_UI_COLORS.contested
            );
        }
        if (!this._findWidget(this._name(playerId, 'ObjectiveContestedThickOutline'))) {
            this._addObjectiveOutline(
                playerId,
                player,
                parent,
                'ObjectiveContestedThickOutline',
                KOTH_TOP_HUD_LAYOUT.contestedOutlineSizes[1],
                KOTH_UI_COLORS.contested
            );
        }
        if (!this._findWidget(this._name(playerId, 'ObjectiveContestedThickOutlineWide'))) {
            this._addObjectiveOutline(
                playerId,
                player,
                parent,
                'ObjectiveContestedThickOutlineWide',
                KOTH_TOP_HUD_LAYOUT.objectiveCompactSize + KOTH_TOP_HUD_LAYOUT.contestedOutlineWidePadding,
                KOTH_UI_COLORS.contested
            );
        }
    }

    private _addObjectiveOutline(
        playerId: number,
        player: mod.Player,
        parent: mod.UIWidget,
        suffix: string,
        size: number,
        color: mod.Vector
    ): void {
        this._addContainerWithFill(
            this._name(playerId, suffix),
            mod.CreateVector(0, 0, 0),
            mod.CreateVector(size, size, 0),
            mod.UIAnchor.Center,
            parent,
            player,
            color,
            1,
            mod.UIBgFill.OutlineThin
        );
    }

    private _addObjectiveExpandedDetails(playerId: number, player: mod.Player, parent: mod.UIWidget): void {
        this._addTextWithStyle(
            this._name(playerId, 'ObjectiveContestedLabel'),
            mod.CreateVector(0, KOTH_TOP_HUD_LAYOUT.objectiveDetailLabelY, 0),
            mod.CreateVector(
                KOTH_TOP_HUD_LAYOUT.objectiveDetailLabelWidth,
                KOTH_TOP_HUD_LAYOUT.objectiveDetailLabelHeight,
                0
            ),
            mod.UIAnchor.Center,
            parent,
            player,
            mod.Message(mod.stringkeys.KothObjectiveContestedShort),
            KOTH_TOP_HUD_LAYOUT.objectiveDetailLabelSize,
            KOTH_UI_COLORS.contested,
            1,
            mod.UIAnchor.Center
        );

        this._addTextWithStyle(
            this._name(playerId, 'ObjectiveFriendlyCount'),
            mod.CreateVector(-KOTH_TOP_HUD_LAYOUT.objectiveDetailCountX, KOTH_TOP_HUD_LAYOUT.objectiveDetailCountY, 0),
            mod.CreateVector(
                KOTH_TOP_HUD_LAYOUT.objectiveDetailCountWidth,
                KOTH_TOP_HUD_LAYOUT.objectiveDetailCountHeight,
                0
            ),
            mod.UIAnchor.Center,
            parent,
            player,
            mod.Message(mod.stringkeys.CounterText, 0),
            KOTH_TOP_HUD_LAYOUT.objectiveDetailCountTextSize,
            KOTH_UI_COLORS.team1,
            1,
            mod.UIAnchor.Center
        );

        this._addTextWithStyle(
            this._name(playerId, 'ObjectiveEnemyCount'),
            mod.CreateVector(KOTH_TOP_HUD_LAYOUT.objectiveDetailCountX, KOTH_TOP_HUD_LAYOUT.objectiveDetailCountY, 0),
            mod.CreateVector(
                KOTH_TOP_HUD_LAYOUT.objectiveDetailCountWidth,
                KOTH_TOP_HUD_LAYOUT.objectiveDetailCountHeight,
                0
            ),
            mod.UIAnchor.Center,
            parent,
            player,
            mod.Message(mod.stringkeys.CounterText, 0),
            KOTH_TOP_HUD_LAYOUT.objectiveDetailCountTextSize,
            KOTH_UI_COLORS.team2,
            1,
            mod.UIAnchor.Center
        );

        const detailBarRoot = this._addContainerWithFill(
            this._name(playerId, 'ObjectiveDetailBarRoot'),
            mod.CreateVector(0, KOTH_TOP_HUD_LAYOUT.objectiveDetailBarY, 0),
            mod.CreateVector(
                KOTH_TOP_HUD_LAYOUT.objectiveDetailBarWidth,
                KOTH_TOP_HUD_LAYOUT.objectiveDetailBarHeight,
                0
            ),
            mod.UIAnchor.Center,
            parent,
            player,
            KOTH_TOP_HUD_COLORS.dark,
            0.7,
            mod.UIBgFill.Solid
        );
        if (!detailBarRoot) return;

        this._addContainerWithFill(
            this._name(playerId, 'ObjectiveFriendlyBar'),
            mod.CreateVector(0, 0, 0),
            mod.CreateVector(0, KOTH_TOP_HUD_LAYOUT.objectiveDetailBarFillHeight, 0),
            mod.UIAnchor.TopLeft,
            detailBarRoot,
            player,
            KOTH_UI_COLORS.team1,
            1,
            mod.UIBgFill.Solid
        );

        this._addContainerWithFill(
            this._name(playerId, 'ObjectiveEnemyBar'),
            mod.CreateVector(0, 0, 0),
            mod.CreateVector(0, KOTH_TOP_HUD_LAYOUT.objectiveDetailBarFillHeight, 0),
            mod.UIAnchor.TopRight,
            detailBarRoot,
            player,
            KOTH_UI_COLORS.team2,
            1,
            mod.UIBgFill.Solid
        );
    }

    private _updateObjectiveHud(playerId: number, teamId: 0 | 1 | 2): void {
        const runtime = this._context.runtime;
        const playerState = runtime.playersById.get(playerId);
        const rootName = this._name(playerId, 'ObjectiveRoot');
        const root = this._findWidget(rootName);
        if (!root || !playerState) return;

        const isExpanded = runtime.isMatchActive && playerState.isInsideActiveHill;
        const objectiveSize = isExpanded
            ? KOTH_TOP_HUD_LAYOUT.objectiveExpandedSize
            : KOTH_TOP_HUD_LAYOUT.objectiveCompactSize;
        const objectiveY = isExpanded
            ? KOTH_TOP_HUD_LAYOUT.objectiveExpandedY
            : KOTH_TOP_HUD_LAYOUT.objectiveCompactY;
        const isLocked = runtime.hill.currentControlState === 'locked';
        const timerY = isLocked && isExpanded
            ? KOTH_TOP_HUD_LAYOUT.objectiveLockedTimerY
            : isExpanded
            ? KOTH_TOP_HUD_LAYOUT.objectiveTimerExpandedY
            : KOTH_TOP_HUD_LAYOUT.objectiveTimerCompactY;
        const isContested = this._isObjectiveContestedForPresentation();
        const visualControlState = this._getObjectiveVisualControlState();
        const showContestedDetails = isExpanded && isContested && this._isActiveHillContested();
        const showLockedDetails = isExpanded && isLocked;
        const showHoldingDetails = isExpanded && !showContestedDetails && !showLockedDetails && this._isHoldingForViewer(visualControlState, teamId);
        const showDetailLabel = showContestedDetails || showLockedDetails || showHoldingDetails;
        const showObjectiveTimer =
            showLockedDetails ||
            (runtime.isMatchActive && runtime.hill.currentControlState !== 'locked' && runtime.hill.currentControlState !== 'inactive');

        this._safeSetPosition(rootName, mod.CreateVector(KOTH_TOP_HUD_LAYOUT.objectiveX, objectiveY, 0));
        this._safeSetSize(rootName, mod.CreateVector(objectiveSize, objectiveSize, 0));
        this._safeSetTextColor(this._name(playerId, 'ObjectiveLetter'), KOTH_UI_COLORS.text);
        this._safeSetTextSize(
            this._name(playerId, 'ObjectiveLetter'),
            isExpanded ? KOTH_TOP_HUD_LAYOUT.objectiveExpandedTextSize : KOTH_TOP_HUD_LAYOUT.objectiveTextSize
        );
        this._safeSetBgColor(root, this._getObjectiveFlagColor(visualControlState, teamId), rootName);
        this._safeSetBgFill(root, this._getObjectiveFlagFill(visualControlState), rootName);
        this._setObjectiveExpandedDetailsVisibleForPlayer(playerId, showDetailLabel, showContestedDetails);
        if (showDetailLabel) this._updateObjectiveStatusLabel(playerId, visualControlState, teamId, showContestedDetails, showLockedDetails);
        if (showContestedDetails) this._updateObjectiveExpandedDetails(playerId, teamId);
        this._safeSetPosition(this._name(playerId, 'ObjectiveTimer'), mod.CreateVector(0, timerY, 0));
        this._setObjectiveTimerVisibleForPlayer(playerId, showObjectiveTimer);
        this._safeSetText(
            this._name(playerId, 'ObjectiveTimer'),
            formatClockMessage(showLockedDetails ? runtime.hill.activeLockRemainingSeconds : runtime.hill.activeObjectiveRemainingSeconds)
        );
        this._safeSetTextColor(
            this._name(playerId, 'ObjectiveTimer'),
            this._getObjectiveTimerColor(visualControlState, teamId)
        );

        this._applyObjectiveOutlineState(playerId, objectiveSize, visualControlState, teamId, isContested, true);
    }

    private _isActiveHillContested(): boolean {
        return (
            this._context.runtime.hill.activeHillTeam1Players.size > 0 &&
            this._context.runtime.hill.activeHillTeam2Players.size > 0
        );
    }

    private _isObjectiveContestedForPresentation(): boolean {
        return this._context.runtime.hill.currentControlState === 'contested' && this._isActiveHillContested();
    }

    private _isHoldingForViewer(controlState: KothHillControlState, teamId: 0 | 1 | 2): boolean {
        if (controlState === 'team1') return teamId === 1;
        if (controlState === 'team2') return teamId === 2;
        return false;
    }

    private _updateObjectiveStatusLabel(
        playerId: number,
        visualControlState: KothHillControlState,
        teamId: 0 | 1 | 2,
        isContested: boolean,
        isLocked: boolean
    ): void {
        if (isLocked) {
            this._safeSetText(this._name(playerId, 'ObjectiveContestedLabel'), mod.Message(mod.stringkeys.KothObjectiveLockedShort));
            this._safeSetTextColor(this._name(playerId, 'ObjectiveContestedLabel'), KOTH_UI_COLORS.text);
            return;
        }

        if (isContested) {
            this._safeSetText(this._name(playerId, 'ObjectiveContestedLabel'), mod.Message(mod.stringkeys.KothObjectiveContestedShort));
            this._safeSetTextColor(this._name(playerId, 'ObjectiveContestedLabel'), KOTH_UI_COLORS.contested);
            return;
        }

        this._safeSetText(this._name(playerId, 'ObjectiveContestedLabel'), mod.Message(mod.stringkeys.KothObjectiveHoldingShort));
        this._safeSetTextColor(
            this._name(playerId, 'ObjectiveContestedLabel'),
            this._getObjectiveFlagColor(visualControlState, teamId)
        );
    }

    private _updateObjectiveExpandedDetails(playerId: number, teamId: 0 | 1 | 2): void {
        const counts = this._getViewerRelativeActiveHillCounts(teamId);
        const totalPlayers = counts.friendly + counts.enemy;
        const barWidth = KOTH_TOP_HUD_LAYOUT.objectiveExpandedSize;
        const friendlyRatio = totalPlayers > 0 ? counts.friendly / totalPlayers : 0;
        const enemyRatio = totalPlayers > 0 ? counts.enemy / totalPlayers : 0;
        const friendlyWidth = barWidth * friendlyRatio;
        const enemyWidth = barWidth * enemyRatio;

        this._safeSetText(this._name(playerId, 'ObjectiveFriendlyCount'), mod.Message(mod.stringkeys.CounterText, counts.friendly));
        this._safeSetText(this._name(playerId, 'ObjectiveEnemyCount'), mod.Message(mod.stringkeys.CounterText, counts.enemy));
        this._safeSetTextColor(this._name(playerId, 'ObjectiveFriendlyCount'), KOTH_UI_COLORS.team1);
        this._safeSetTextColor(this._name(playerId, 'ObjectiveEnemyCount'), KOTH_UI_COLORS.team2);
        this._safeSetSize(
            this._name(playerId, 'ObjectiveDetailBarRoot'),
            mod.CreateVector(barWidth, KOTH_TOP_HUD_LAYOUT.objectiveDetailBarHeight, 0)
        );
        this._safeSetSize(
            this._name(playerId, 'ObjectiveFriendlyBar'),
            mod.CreateVector(friendlyWidth, KOTH_TOP_HUD_LAYOUT.objectiveDetailBarFillHeight, 0)
        );
        this._safeSetSize(
            this._name(playerId, 'ObjectiveEnemyBar'),
            mod.CreateVector(enemyWidth, KOTH_TOP_HUD_LAYOUT.objectiveDetailBarFillHeight, 0)
        );
    }

    private _getViewerRelativeActiveHillCounts(teamId: 0 | 1 | 2): { friendly: number; enemy: number } {
        const team1Count = this._context.runtime.hill.activeHillTeam1Players.size;
        const team2Count = this._context.runtime.hill.activeHillTeam2Players.size;

        if (teamId === 2) {
            return { friendly: team2Count, enemy: team1Count };
        }
        return { friendly: team1Count, enemy: team2Count };
    }

    private _setObjectiveExpandedDetailsVisibleForPlayer(
        playerId: number,
        labelVisible: boolean,
        barVisible: boolean
    ): void {
        this._safeSetVisibleByName(this._name(playerId, 'ObjectiveContestedLabel'), labelVisible);
        this._safeSetVisibleByName(this._name(playerId, 'ObjectiveFriendlyCount'), barVisible);
        this._safeSetVisibleByName(this._name(playerId, 'ObjectiveEnemyCount'), barVisible);
        this._safeSetVisibleByName(this._name(playerId, 'ObjectiveDetailBarRoot'), barVisible);
        this._safeSetVisibleByName(this._name(playerId, 'ObjectiveFriendlyBar'), barVisible);
        this._safeSetVisibleByName(this._name(playerId, 'ObjectiveEnemyBar'), barVisible);
    }

    private _setObjectiveTimerVisibleForPlayer(playerId: number, visible: boolean): void {
        this._safeSetVisibleByName(this._name(playerId, 'ObjectiveTimer'), visible);
    }

    private _syncContestedBlinkTimer(): void {
        if (!this._isObjectiveContestedForPresentation()) {
            this._stopContestedBlinkTimer(true);
            return;
        }

        if (this._contestedBlinkIntervalHandle !== undefined) return;

        this._contestedBlinkFrame = 0;
        this._applyContestedBlinkFrame();
        this._contestedBlinkIntervalHandle = Timers.setInterval(() => {
            this._contestedBlinkFrame = (this._contestedBlinkFrame + 1) % KOTH_CONTESTED_BLINK_FRAME_COUNT;
            this._applyContestedBlinkFrame();
        }, KOTH_CONTESTED_BLINK_INTERVAL_MS);
    }

    private _stopContestedBlinkTimer(hideOutlines: boolean = true): void {
        Timers.clearInterval(this._contestedBlinkIntervalHandle);
        this._contestedBlinkIntervalHandle = undefined;
        this._contestedBlinkFrame = 0;

        if (!hideOutlines) return;

        this._context.runtime.playersById.forEach((playerState) => {
            this._setObjectiveContestedOutlineVisibleForPlayer(playerState.id, 0);
        });
    }

    private _applyContestedBlinkFrame(): void {
        if (!this._isObjectiveContestedForPresentation()) {
            this._stopContestedBlinkTimer(true);
            return;
        }

        const visibleCount = this._getContestedBlinkVisibleCount();
        this._context.runtime.playersById.forEach((playerState) => {
            if (playerState.isBot) return;

            const objectiveSize =
                this._context.runtime.isMatchActive && playerState.isInsideActiveHill
                    ? KOTH_TOP_HUD_LAYOUT.objectiveExpandedSize
                    : KOTH_TOP_HUD_LAYOUT.objectiveCompactSize;
            this._setObjectiveContestedOutlineSizesForPlayer(playerState.id, objectiveSize);
            this._setObjectiveStaticOutlineVisibleForPlayer(playerState.id, false);
            this._setObjectiveContestedOutlineVisibleForPlayer(playerState.id, visibleCount);
        });
    }

    private _getContestedBlinkVisibleCount(): number {
        if (this._contestedBlinkFrame === 0) return 1;
        if (this._contestedBlinkFrame === 1) return 2;
        if (this._contestedBlinkFrame === 2) return 3;
        return 0;
    }

    private _applyObjectiveOutlineState(
        playerId: number,
        objectiveSize: number,
        visualControlState: KothHillControlState,
        teamId: 0 | 1 | 2,
        isContested: boolean,
        showStaticOutline: boolean
    ): void {
        this._setObjectiveStaticOutlineSizeForPlayer(playerId, objectiveSize);
        this._setObjectiveContestedOutlineSizesForPlayer(playerId, objectiveSize);
        this._setObjectiveStaticOutlineColorForPlayer(
            playerId,
            this._getObjectiveStaticOutlineColor(visualControlState, teamId)
        );
        this._setObjectiveContestedOutlineColorForPlayer(playerId, KOTH_UI_COLORS.contested);
        this._setObjectiveStaticOutlineVisibleForPlayer(playerId, false);
        this._setObjectiveContestedOutlineVisibleForPlayer(playerId, 0);

        if (isContested) {
            this._setObjectiveContestedOutlineVisibleForPlayer(playerId, this._getContestedBlinkVisibleCount());
            return;
        }

        this._setObjectiveStaticOutlineVisibleForPlayer(playerId, showStaticOutline);
    }

    private _setObjectiveStaticOutlineVisibleForPlayer(playerId: number, visible: boolean): void {
        this._safeSetVisibleByName(this._name(playerId, 'ObjectiveStaticOutline'), visible);
    }

    private _setObjectiveContestedOutlineVisibleForPlayer(playerId: number, visibleCount: number): void {
        this._safeSetVisibleByName(this._name(playerId, 'ObjectiveContestedOutline'), visibleCount >= 1);
        this._safeSetVisibleByName(this._name(playerId, 'ObjectiveContestedThickOutline'), visibleCount >= 2);
        this._safeSetVisibleByName(this._name(playerId, 'ObjectiveContestedThickOutlineWide'), visibleCount >= 3);
    }

    private _setObjectiveStaticOutlineColorForPlayer(playerId: number, color: mod.Vector): void {
        this._safeSetBgColorByName(this._name(playerId, 'ObjectiveStaticOutline'), color);
    }

    private _setObjectiveContestedOutlineColorForPlayer(playerId: number, color: mod.Vector): void {
        this._safeSetBgColorByName(this._name(playerId, 'ObjectiveContestedOutline'), color);
        this._safeSetBgColorByName(this._name(playerId, 'ObjectiveContestedThickOutline'), color);
        this._safeSetBgColorByName(this._name(playerId, 'ObjectiveContestedThickOutlineWide'), color);
    }

    private _setObjectiveStaticOutlineSizeForPlayer(playerId: number, objectiveSize: number): void {
        this._safeSetSize(this._name(playerId, 'ObjectiveStaticOutline'), mod.CreateVector(objectiveSize, objectiveSize, 0));
    }

    private _setObjectiveContestedOutlineSizesForPlayer(playerId: number, objectiveSize: number): void {
        this._safeSetSize(
            this._name(playerId, 'ObjectiveContestedOutline'),
            mod.CreateVector(objectiveSize, objectiveSize, 0)
        );
        this._safeSetSize(
            this._name(playerId, 'ObjectiveContestedThickOutline'),
            mod.CreateVector(
                objectiveSize + KOTH_TOP_HUD_LAYOUT.contestedOutlineClosePadding,
                objectiveSize + KOTH_TOP_HUD_LAYOUT.contestedOutlineClosePadding,
                0
            )
        );
        this._safeSetSize(
            this._name(playerId, 'ObjectiveContestedThickOutlineWide'),
            mod.CreateVector(
                objectiveSize + KOTH_TOP_HUD_LAYOUT.contestedOutlineWidePadding,
                objectiveSize + KOTH_TOP_HUD_LAYOUT.contestedOutlineWidePadding,
                0
            )
        );
    }

    private _hidePlayerHudForPlayer(playerId: number): void {
        const rootName = this._name(playerId, 'Root');
        const root = this._findWidget(rootName);
        if (root) this._safeSetVisible(root, false, rootName);

        const objectiveRootName = this._name(playerId, 'ObjectiveRoot');
        const objectiveRoot = this._findWidget(objectiveRootName);
        if (objectiveRoot) this._safeSetVisible(objectiveRoot, false, objectiveRootName);
    }

    private _name(playerId: number, suffix: string): string {
        return `${KOTH_UI.rootNamePrefix}${playerId}_${suffix}`;
    }

    private _findWidget(name: string): mod.UIWidget | undefined {
        const cached = this._widgetByName.get(name);
        if (cached) return cached;

        try {
            const widget = mod.FindUIWidgetWithName(name);
            if (!widget) return undefined;

            this._widgetByName.set(name, widget);
            return widget;
        } catch (_err) {
            return undefined;
        }
    }

    private _addContainer(
        name: string,
        position: mod.Vector,
        size: mod.Vector,
        anchor: mod.UIAnchor,
        parent: mod.UIWidget,
        receiver: mod.Player | mod.Team,
        color: mod.Vector,
        alpha: number
    ): mod.UIWidget | undefined {
        return this._addContainerWithFill(name, position, size, anchor, parent, receiver, color, alpha, mod.UIBgFill.Blur);
    }

    private _addContainerWithFill(
        name: string,
        position: mod.Vector,
        size: mod.Vector,
        anchor: mod.UIAnchor,
        parent: mod.UIWidget,
        receiver: mod.Player | mod.Team,
        color: mod.Vector,
        alpha: number,
        fill: mod.UIBgFill
    ): mod.UIWidget | undefined {
        try {
            mod.AddUIContainer(name, position, size, anchor, parent, true, 0, color, alpha, fill, receiver);
            return this._findWidget(name);
        } catch (_err) {
            return undefined;
        }
    }

    private _addText(
        name: string,
        position: mod.Vector,
        size: mod.Vector,
        parent: mod.UIWidget,
        receiver: mod.Player | mod.Team,
        textSize: number
    ): mod.UIWidget | undefined {
        return this._addTextWithStyle(
            name,
            position,
            size,
            mod.UIAnchor.TopCenter,
            parent,
            receiver,
            mod.Message(mod.stringkeys.EmptyText),
            textSize,
            KOTH_UI_COLORS.text,
            1,
            mod.UIAnchor.Center
        );
    }

    private _addTextWithStyle(
        name: string,
        position: mod.Vector,
        size: mod.Vector,
        anchor: mod.UIAnchor,
        parent: mod.UIWidget,
        receiver: mod.Player | mod.Team,
        textLabel: mod.Message,
        textSize: number,
        textColor: mod.Vector,
        textAlpha: number,
        textAnchor: mod.UIAnchor
    ): mod.UIWidget | undefined {
        try {
            mod.AddUIText(
                name,
                position,
                size,
                anchor,
                parent,
                true,
                0,
                mod.CreateVector(0, 0, 0),
                0,
                mod.UIBgFill.Solid,
                textLabel,
                textSize,
                textColor,
                textAlpha,
                textAnchor,
                receiver
            );
            return this._findWidget(name);
        } catch (_err) {
            return undefined;
        }
    }

    private _addImage(
        name: string,
        position: mod.Vector,
        size: mod.Vector,
        parent: mod.UIWidget,
        receiver: mod.Player | mod.Team
    ): mod.UIWidget | undefined {
        try {
            mod.AddUIImage(
                name,
                position,
                size,
                mod.UIAnchor.Center,
                parent,
                true,
                0,
                mod.CreateVector(0, 0, 0),
                0,
                mod.UIBgFill.Solid,
                mod.UIImageType.CrownSolid,
                KOTH_UI_COLORS.text,
                1,
                receiver
            );
            return this._findWidget(name);
        } catch (_err) {
            return undefined;
        }
    }

    private _safeSetText(name: string, message: mod.Message): void {
        const widget = this._findWidget(name);
        if (!widget) return;
        try {
            mod.SetUITextLabel(widget, message);
        } catch (_err) {
            return;
        }
    }

    private _safeSetTextColor(name: string, color: mod.Vector): void {
        const widget = this._findWidget(name);
        if (!widget) return;
        try {
            mod.SetUITextColor(widget, color);
        } catch (_err) {
            return;
        }
    }

    private _safeSetSize(name: string, size: mod.Vector): void {
        const widget = this._findWidget(name);
        if (!widget) return;
        try {
            mod.SetUIWidgetSize(widget, size);
        } catch (_err) {
            return;
        }
    }

    private _safeSetPosition(name: string, position: mod.Vector): void {
        const widget = this._findWidget(name);
        if (!widget) return;
        try {
            mod.SetUIWidgetPosition(widget, position);
        } catch (_err) {
            return;
        }
    }

    private _safeSetTextSize(name: string, textSize: number): void {
        const widget = this._findWidget(name);
        if (!widget) return;
        try {
            mod.SetUITextSize(widget, textSize);
        } catch (_err) {
            return;
        }
    }

    private _safeSetVisible(widget: mod.UIWidget, visible: boolean, name?: string): void {
        if (name && this._visibleByName.get(name) === visible) return;

        try {
            mod.SetUIWidgetVisible(widget, visible);
            if (name) this._visibleByName.set(name, visible);
        } catch (_err) {
            return;
        }
    }

    private _safeSetVisibleByName(name: string, visible: boolean): void {
        const widget = this._findWidget(name);
        if (widget) this._safeSetVisible(widget, visible, name);
    }

    private _safeSetBgColor(widget: mod.UIWidget, color: mod.Vector, name?: string): void {
        try {
            mod.SetUIWidgetBgColor(widget, color);
        } catch (_err) {
            return;
        }
    }

    private _safeSetBgColorByName(name: string, color: mod.Vector): void {
        const widget = this._findWidget(name);
        if (widget) this._safeSetBgColor(widget, color, name);
    }

    private _safeSetBgFill(widget: mod.UIWidget, fill: mod.UIBgFill, name?: string): void {
        try {
            mod.SetUIWidgetBgFill(widget, fill);
        } catch (_err) {
            return;
        }
    }

    private _getObjectiveVisualControlState(): KothHillControlState {
        const hillState = this._context.runtime.hill;
        if (hillState.currentControlState === 'contested') {
            if (!this._isActiveHillContested()) return hillState.currentOwnerState === 'neutral' ? 'neutral' : hillState.currentOwnerState;
            if (hillState.currentOwnerState !== 'neutral') return hillState.currentOwnerState;
        }

        return hillState.currentControlState;
    }

    private _getObjectiveFlagColor(controlState: KothHillControlState, viewerTeamId: 0 | 1 | 2): mod.Vector {
        if (controlState === 'team1') {
            return viewerTeamId === 1 ? KOTH_UI_COLORS.team1 : KOTH_UI_COLORS.team2;
        }
        if (controlState === 'team2') {
            return viewerTeamId === 2 ? KOTH_UI_COLORS.team1 : KOTH_UI_COLORS.team2;
        }
        return KOTH_UI_COLORS.neutral;
    }

    private _getObjectiveFlagFill(controlState: KothHillControlState): mod.UIBgFill {
        if (controlState === 'team1' || controlState === 'team2') return mod.UIBgFill.Blur;
        return mod.UIBgFill.Solid;
    }

    private _getObjectiveTimerColor(controlState: KothHillControlState, viewerTeamId: 0 | 1 | 2): mod.Vector {
        if (controlState === 'team1' || controlState === 'team2') {
            return this._getObjectiveFlagColor(controlState, viewerTeamId);
        }

        return KOTH_UI_COLORS.text;
    }

    private _getObjectiveStaticOutlineColor(controlState: KothHillControlState, viewerTeamId: 0 | 1 | 2): mod.Vector {
        if (controlState === 'team1') return viewerTeamId === 1 ? KOTH_UI_COLORS.team1 : KOTH_UI_COLORS.team2;
        if (controlState === 'team2') return viewerTeamId === 2 ? KOTH_UI_COLORS.team1 : KOTH_UI_COLORS.team2;
        return KOTH_UI_COLORS.text;
    }

    private _scoreRatio(score: number): number {
        const ratio = score / this._context.rules.scoreToWin;
        if (ratio < 0) return 0;
        if (ratio > 1) return 1;
        return ratio;
    }

    private _getPostmatchResultColor(receiver: mod.Team, won: boolean): mod.Vector {
        if (won) return mod.Equals(receiver, KOTH_TEAM_1) ? KOTH_UI_COLORS.team1 : KOTH_UI_COLORS.team2;
        return mod.Equals(receiver, KOTH_TEAM_1) ? KOTH_UI_COLORS.team2 : KOTH_UI_COLORS.team1;
    }
}


// --- SOURCE: src\king-of-the-hill-mode\live\services\koth-player-tracker-service.ts ---










export class KothPlayerTrackerService {
    private readonly _preservedLiveStartPlayerIds = new Set<number>();
    private readonly _liveStartRecoveryPlayerIds = new Set<number>();

    public constructor(
        private readonly _context: KothLiveModeContext,
        private readonly _hillService: KothHillService,
        private readonly _scoreService: KothScoreService,
        private readonly _scoreboardService: KothScoreboardService,
        private readonly _spawnService: KothSpawnService,
        private readonly _uiService: KothUiService,
        private readonly _sfxService: KothSfxService
    ) {}

    public onPlayerJoinGame(eventPlayer: mod.Player): void {
        const playerState = this.syncGameplayPlayer(eventPlayer);
        if (!playerState) return;

        this._spawnService.queueSpawnForPlayer(eventPlayer);
        this._markPlayerPresentationDirty();
    }

    public onPlayerLeaveGame(eventNumber: number): void {
        this._removePlayerById(eventNumber, true);
    }

    public onPlayerDeployed(eventPlayer: mod.Player): void {
        if (!mod.IsPlayerValid(eventPlayer)) return;

        const playerId = getKothPlayerId(eventPlayer);
        const playerState = this.syncGameplayPlayer(eventPlayer);
        if (!playerState) return;

        playerState.isDeployed = true;
        this._liveStartRecoveryPlayerIds.delete(playerId);
        this._clearLiveInputRestrictions(eventPlayer);
        mod.SetRedeployTime(eventPlayer, this._context.rules.redeployTimeSeconds);

        if (this._preservedLiveStartPlayerIds.delete(playerId)) {
            if (this._spawnService.isPlayerAtForbiddenSpawnPosition(eventPlayer)) {
                this._spawnService.teleportToQueuedSpawn(eventPlayer);
            }
            this._markPlayerPresentationDirty();
            this._hillService.updateActiveHillState();
            return;
        }

        if (!this._spawnService.teleportToQueuedSpawn(eventPlayer)) {
            this._markPlayerPresentationDirty();
            this._hillService.updateActiveHillState();
            return;
        }

        this._markPlayerPresentationDirty();
        this._hillService.updateActiveHillState();
    }

    public onPlayerUndeploy(eventPlayer: mod.Player): void {
        if (!mod.IsPlayerValid(eventPlayer)) return;

        const playerId = getKothPlayerId(eventPlayer);
        const playerState = this.syncGameplayPlayer(eventPlayer);
        if (!playerState) return;

        playerState.isDeployed = false;
        this._preservedLiveStartPlayerIds.delete(playerId);
        this._liveStartRecoveryPlayerIds.delete(playerId);
        this._hillService.removePlayerFromAllHills(playerId);
        this._spawnService.clearPlayerPresenceCache(playerId);
        this._sfxService.clearPlayerAudioState(playerId);
        mod.SetRedeployTime(eventPlayer, this._context.rules.redeployTimeSeconds);

        if (this._context.runtime.isMatchActive) {
            this._spawnService.queueSpawnForPlayer(eventPlayer);
        }
    }

    public onPlayerDied(eventPlayer: mod.Player): void {
        if (!mod.IsPlayerValid(eventPlayer)) return;

        const playerId = getKothPlayerId(eventPlayer);
        if (!this.syncGameplayPlayer(eventPlayer)) return;

        this._preservedLiveStartPlayerIds.delete(playerId);
        const suppressDeathScore = this._liveStartRecoveryPlayerIds.delete(playerId);
        if (!suppressDeathScore) this._scoreService.addDeath(eventPlayer);
        this._hillService.removePlayerFromAllHills(playerId);
        this._spawnService.clearPlayerPresenceCache(playerId);
        this._sfxService.clearPlayerAudioState(playerId);
        mod.SetRedeployTime(eventPlayer, this._context.rules.redeployTimeSeconds);
        this._spawnService.queueSpawnForPlayer(eventPlayer);
    }

    public onMandown(eventPlayer: mod.Player): void {
        if (!mod.IsPlayerValid(eventPlayer)) return;

        const playerId = getKothPlayerId(eventPlayer);
        const playerState = this.syncGameplayPlayer(eventPlayer);
        if (!playerState) return;

        playerState.isDeployed = false;
        this._preservedLiveStartPlayerIds.delete(playerId);
        this._hillService.removePlayerFromAllHills(playerId);
        this._spawnService.clearPlayerPresenceCache(playerId);
        this._sfxService.clearPlayerAudioState(playerId);
        mod.SetRedeployTime(eventPlayer, this._context.rules.redeployTimeSeconds);
    }

    public onPlayerRevived(eventPlayer: mod.Player, eventOtherPlayer: mod.Player): void {
        void eventOtherPlayer;
        if (!mod.IsPlayerValid(eventPlayer)) return;

        const playerId = getKothPlayerId(eventPlayer);
        const playerState = this.syncGameplayPlayer(eventPlayer);
        if (!playerState) return;

        playerState.isDeployed = true;
        this._liveStartRecoveryPlayerIds.delete(playerId);
        this._spawnService.clearQueuedSpawn(playerId);
        mod.SetRedeployTime(eventPlayer, this._context.rules.redeployTimeSeconds);

        this._markPlayerPresentationDirty();

        this._hillService.updateActiveHillState();
    }

    public onPlayerEarnedKill(eventPlayer: mod.Player, eventOtherPlayer: mod.Player): void {
        if (!this._context.runtime.isMatchActive) return;
        if (!mod.IsPlayerValid(eventPlayer)) return;
        if (mod.IsPlayerValid(eventOtherPlayer) && mod.Equals(eventPlayer, eventOtherPlayer)) return;
        if (!this.syncGameplayPlayer(eventPlayer)) return;

        this._scoreService.addKillScore(eventPlayer);
    }

    public onPlayerEarnedKillAssist(eventPlayer: mod.Player): void {
        if (!this._context.runtime.isMatchActive) return;
        if (!mod.IsPlayerValid(eventPlayer)) return;
        if (!this.syncGameplayPlayer(eventPlayer)) return;

        this._scoreService.addAssistScore(eventPlayer);
    }

    public resetPlayersForNewMatch(preserveExistingDeployments = false): void {
        this.clearMandownState();
        this._preservedLiveStartPlayerIds.clear();
        this._context.runtime.playersById.forEach((playerState) => {
            this.resetPlayerForNewMatch(playerState.id, preserveExistingDeployments, true);
        });
    }

    public resetPlayerForNewMatch(
        playerId: number,
        preserveExistingDeployments = false,
        queueMissingSpawn = true
    ): void {
        const playerState = this._context.runtime.playersById.get(playerId);
        if (!playerState || !mod.IsPlayerValid(playerState.player)) return;

        const wasAlreadyLiving = preserveExistingDeployments && isKothPlayerLiving(playerState.player);
        playerState.resetForNewRound();
        playerState.setTeam(mod.GetTeam(playerState.player));
        playerState.isBot = isKothAiSoldier(playerState.player);
        playerState.isDeployed = wasAlreadyLiving;
        if (wasAlreadyLiving && !this._spawnService.isPlayerAtForbiddenSpawnPosition(playerState.player)) {
            this._preservedLiveStartPlayerIds.add(playerState.id);
            this._liveStartRecoveryPlayerIds.delete(playerState.id);
            this._clearLiveInputRestrictions(playerState.player);
        } else {
            this._preservedLiveStartPlayerIds.delete(playerState.id);
        }

        if (!wasAlreadyLiving && preserveExistingDeployments) {
            this._liveStartRecoveryPlayerIds.add(playerState.id);
            this._spawnService.recoverLiveStartPlayer(playerState);
            return;
        }

        if (!wasAlreadyLiving && queueMissingSpawn) {
            this._spawnService.queueSpawnForPlayer(playerState.player);
        }
    }

    public syncCurrentPlayersBatch(startIndex: number, maxPlayers: number): number {
        const allPlayers = mod.AllPlayers();
        const totalPlayers = mod.CountOf(allPlayers);
        let nextIndex = startIndex;
        let processed = 0;

        while (nextIndex < totalPlayers && processed < maxPlayers) {
            const player = mod.ValueInArray(allPlayers, nextIndex) as mod.Player;
            if (mod.IsPlayerValid(player)) {
                this.syncGameplayPlayer(player);
            }

            nextIndex += 1;
            processed += 1;
        }

        return nextIndex >= totalPlayers ? -1 : nextIndex;
    }

    public bootstrapLiveStartPlayersBatch(startIndex: number, maxPlayers: number): number {
        const allPlayers = mod.AllPlayers();
        const totalPlayers = mod.CountOf(allPlayers);
        let nextIndex = startIndex;
        let processed = 0;

        while (nextIndex < totalPlayers && processed < maxPlayers) {
            const player = mod.ValueInArray(allPlayers, nextIndex) as mod.Player;
            if (mod.IsPlayerValid(player)) {
                this.bootstrapLiveStartPlayer(player);
            }

            nextIndex += 1;
            processed += 1;
        }

        this._markPlayerPresentationDirty();
        return nextIndex >= totalPlayers ? -1 : nextIndex;
    }

    public bootstrapLiveStartPlayer(player: mod.Player): void {
        const playerState = this.syncGameplayPlayer(player);
        if (!playerState) return;

        if (this._liveStartRecoveryPlayerIds.has(playerState.id)) {
            if (isKothPlayerLiving(player)) {
                playerState.isDeployed = true;
                this._clearLiveInputRestrictions(player);
                this._spawnService.teleportToQueuedSpawn(player);
            } else {
                this._spawnService.recoverLiveStartPlayer(playerState);
            }
        } else if (isKothPlayerLiving(player)) {
            playerState.isDeployed = true;
            this._clearLiveInputRestrictions(player);
            if (this._spawnService.isPlayerAtForbiddenSpawnPosition(player)) {
                this._preservedLiveStartPlayerIds.delete(playerState.id);
                this._spawnService.teleportToQueuedSpawn(player);
            } else {
                this._preservedLiveStartPlayerIds.add(playerState.id);
            }
        }

        if (playerState.isDeployed) {
            mod.SetRedeployTime(player, this._context.rules.redeployTimeSeconds);
        }
    }

    public clearMandownState(): void {
        return;
    }

    public bootstrapLiveStartPlayers(): void {
        const allPlayers = mod.AllPlayers();
        for (let i = 0; i < mod.CountOf(allPlayers); i++) {
            const player = mod.ValueInArray(allPlayers, i) as mod.Player;
            if (!mod.IsPlayerValid(player)) continue;

            this.bootstrapLiveStartPlayer(player);
        }

        this._context.runtime.hudDirty = true;
        this._context.runtime.scoreboardDirty = true;
    }

    public syncCurrentPlayers(): void {
        const allPlayers = mod.AllPlayers();
        for (let i = 0; i < mod.CountOf(allPlayers); i++) {
            const player = mod.ValueInArray(allPlayers, i) as mod.Player;
            if (mod.IsPlayerValid(player)) {
                this.onPlayerJoinGame(player);
            }
        }
    }

    public syncGameplayPlayers(): void {
        const seenPlayerIds = new Set<number>();
        const allPlayers = mod.AllPlayers();

        for (let i = 0; i < mod.CountOf(allPlayers); i++) {
            const player = mod.ValueInArray(allPlayers, i) as mod.Player;
            const playerState = this.syncGameplayPlayer(player);
            if (playerState) seenPlayerIds.add(playerState.id);
        }

        const stalePlayerIds: number[] = [];
        this._context.runtime.playersById.forEach((playerState, playerId) => {
            if (seenPlayerIds.has(playerId) && mod.IsPlayerValid(playerState.player)) return;
            stalePlayerIds.push(playerId);
        });

        for (const playerId of stalePlayerIds) {
            this._removeStalePlayer(playerId);
        }
    }

    public syncGameplayPlayer(player: mod.Player): KothPlayerState | undefined {
        if (!mod.IsPlayerValid(player)) return undefined;

        const playerId = getKothPlayerId(player);
        const team = mod.GetTeam(player);
        if (!isParticipantTeam(team)) {
            this._removePlayerById(playerId, true);
            return undefined;
        }

        const existing = this._context.runtime.playersById.get(playerId);
        if (existing) {
            const previousTeam = existing.team;
            const previousIsBot = existing.isBot;
            this._syncPlayerState(existing, player, team);
            if (!mod.Equals(previousTeam, team) || previousIsBot !== existing.isBot) {
                this._markPlayerPresentationDirty();
            }
            return existing;
        }

        const created = new KothPlayerState(player, playerId, team);
        this._syncPlayerState(created, player, team);
        this._context.runtime.playersById.set(playerId, created);
        this._markPlayerPresentationDirty();
        return created;
    }

    private _syncPlayerState(playerState: KothPlayerState, player: mod.Player, team: mod.Team): void {
        const wasLivingDeployed = playerState.isDeployed;
        const isLivingDeployed = this._isPlayerLivingForSpawn(player);

        playerState.player = player;
        playerState.setTeam(team);
        playerState.isBot = isKothAiSoldier(player);
        playerState.isDeployed = isLivingDeployed;

        if (wasLivingDeployed && !isLivingDeployed) {
            this._clearPlayerCombatPresence(playerState.id);
        }
    }

    private _removeStalePlayer(playerId: number): void {
        this._removePlayerById(playerId, true);
    }

    private _markPlayerPresentationDirty(): void {
        this._context.runtime.hudDirty = true;
        this._context.runtime.scoreboardDirty = true;
    }

    private _clearPlayerCombatPresence(playerId: number): void {
        this._hillService.removePlayerFromAllHills(playerId);
        this._spawnService.clearPlayerPresenceCache(playerId);
        this._sfxService.clearPlayerAudioState(playerId);
        this._context.runtime.hudDirty = true;
    }

    private _removePlayerById(playerId: number, forgetUi: boolean): void {
        this._preservedLiveStartPlayerIds.delete(playerId);
        this._liveStartRecoveryPlayerIds.delete(playerId);
        this._hillService.removePlayerFromAllHills(playerId);
        this._spawnService.removePlayerFromAllPresenceZones(playerId);
        this._spawnService.clearQueuedSpawn(playerId);
        this._sfxService.clearPlayerAudioState(playerId);
        if (forgetUi) this._uiService.forgetPlayerHud(playerId);

        if (this._context.runtime.playersById.delete(playerId)) {
            this._markPlayerPresentationDirty();
        }
    }

    private _isPlayerLivingForSpawn(player: mod.Player): boolean {
        return isKothPlayerLiving(player);
    }

    private _clearLiveInputRestrictions(player: mod.Player): void {
        if (!mod.IsPlayerValid(player)) return;

        mod.EnableAllInputRestrictions(player, false);
        mod.EnableInputRestriction(player, mod.RestrictedInputs.FireWeapon, false);
        mod.EnableInputRestriction(player, mod.RestrictedInputs.Interact, false);
        mod.EnableInputRestriction(player, mod.RestrictedInputs.MoveForwardBack, false);
        mod.EnableInputRestriction(player, mod.RestrictedInputs.MoveLeftRight, false);
    }
}



// --- SOURCE: src\king-of-the-hill-mode\live\services\koth-scheduler-service.ts ---




export class KothSchedulerService {
    public constructor(private readonly _context: KothLiveModeContext) {}

    public clearAll(): void {
        const scheduler = this._context.runtime.scheduler;

        Timers.clearInterval(scheduler.workJob);
        Timers.clearInterval(scheduler.hillState);
        Timers.clearInterval(scheduler.objectiveTimer);
        Timers.clearInterval(scheduler.scoreTick);
        Timers.clearInterval(scheduler.worldIcon);
        Timers.clearInterval(scheduler.spawnJob);
        Timers.clearTimeout(scheduler.postmatchEnd);

        this._context.runtime.scheduler = {};
    }

    public setWorkJobInterval(callback: () => void): void {
        this._context.runtime.scheduler.workJob = Timers.setInterval(callback, this._context.rules.workJobTickMs);
    }

    public setHillStateInterval(callback: () => void): void {
        this._context.runtime.scheduler.hillState = Timers.setInterval(
            callback,
            this._context.rules.hillStateUpdateMs,
            true
        );
    }

    public setObjectiveTimerInterval(callback: () => void): void {
        this._context.runtime.scheduler.objectiveTimer = Timers.setInterval(
            callback,
            this._context.rules.worldIconTimerUpdateMs
        );
    }

    public setScoreTickInterval(callback: () => void): void {
        this._context.runtime.scheduler.scoreTick = Timers.setInterval(callback, this._context.rules.scoreTickMs);
    }

    public setWorldIconInterval(callback: () => void): void {
        this._context.runtime.scheduler.worldIcon = Timers.setInterval(
            callback,
            this._context.rules.worldIconTimerUpdateMs,
            true
        );
    }

    public setSpawnJobInterval(callback: () => void): void {
        this._context.runtime.scheduler.spawnJob = Timers.setInterval(
            callback,
            this._context.spawns.rules.spawnJobTickMs,
            true
        );
    }

    public setPostmatchEndTimeout(callback: () => void): void {
        this._context.runtime.scheduler.postmatchEnd = Timers.setTimeout(
            callback,
            this._context.rules.postmatchDelaySeconds * 1000
        );
    }
}


// --- SOURCE: src\king-of-the-hill-mode\live\config\koth-world-icons.ts ---


export const KOTH_WORLD_ICONS = {
    yOffset: 6,
    contestedTextYOffset: 9,
    activeImage: mod.WorldIconImages.Flag,
    previewImage: mod.WorldIconImages.Alert,
    colors: {
        team1: KOTH_UI_COLORS.team1,
        team2: KOTH_UI_COLORS.team2,
        neutral: KOTH_UI_COLORS.neutral,
        contested: KOTH_UI_COLORS.contested,
        locked: KOTH_UI_COLORS.neutral,
    },
} as const;


// --- SOURCE: src\king-of-the-hill-mode\live\services\koth-world-icon-service.ts ---






export class KothWorldIconService {
    public constructor(private readonly _context: KothLiveModeContext) {}

    public reset(): void {
        this._hide(this._context.runtime.worldIcons.activeIconTeam1);
        this._hide(this._context.runtime.worldIcons.activeIconTeam2);
        this._hide(this._context.runtime.worldIcons.activeLockedIcon);
        this._hide(this._context.runtime.worldIcons.contestedTextIcon);
        this._hide(this._context.runtime.worldIcons.previewIcon);
    }

    public update(): void {
        const runtime = this._context.runtime;
        if (!runtime.isMatchActive) {
            this.reset();
            return;
        }

        const activeHill = this._context.hills[runtime.hill.currentHillIndex];
        const previewHill =
            runtime.hill.nextPreviewRemainingSeconds > 0 ? this._context.hills[runtime.hill.nextHillIndex] : undefined;

        if (runtime.hill.currentControlState === 'locked') {
            this._hide(this._context.runtime.worldIcons.activeIconTeam1);
            this._hide(this._context.runtime.worldIcons.activeIconTeam2);
            this._hide(this._context.runtime.worldIcons.contestedTextIcon);
            this._updateActiveLockedIcon(activeHill, runtime.hill.activeLockRemainingSeconds);
        } else {
            this._hide(this._context.runtime.worldIcons.activeLockedIcon);
            this._updateActiveIcons(activeHill, runtime.hill.currentControlState, runtime.hill.activeObjectiveRemainingSeconds);
            this._updateContestedTextIcon(activeHill, runtime.hill.currentControlState);
        }
        this._updatePreviewIcon(previewHill, runtime.hill.nextPreviewRemainingSeconds);
    }

    private _updateActiveLockedIcon(hill: KothHillConfig, seconds: number): void {
        const icon = this._ensureActiveLockedIcon();
        if (!icon) return;

        const position = this._resolveCapturePointPosition(hill.neutralCapturePointId);
        if (!position) {
            this._hide(icon);
            return;
        }

        mod.SetWorldIconPosition(icon, position);
        mod.SetWorldIconColor(icon, KOTH_WORLD_ICONS.colors.locked);
        mod.SetWorldIconText(icon, this._getLockedPreviewText(seconds));
        mod.EnableWorldIconImage(icon, false);
        mod.EnableWorldIconText(icon, true);
    }

    private _updateActiveIcons(hill: KothHillConfig, controlState: KothHillControlState, seconds: number): void {
        const position = this._resolveHillPosition(hill, controlState);
        if (!position) {
            this._hide(this._context.runtime.worldIcons.activeIconTeam1);
            this._hide(this._context.runtime.worldIcons.activeIconTeam2);
            return;
        }

        this._updateActiveIconForTeam(KOTH_TEAM_1, 1, position, controlState, seconds);
        this._updateActiveIconForTeam(KOTH_TEAM_2, 2, position, controlState, seconds);
    }

    private _updateContestedTextIcon(hill: KothHillConfig, controlState: KothHillControlState): void {
        const icon = this._ensureContestedTextIcon();
        if (!icon) return;

        if (controlState !== 'contested') {
            this._hide(icon);
            return;
        }

        const position = this._resolveHillPosition(hill, controlState, KOTH_WORLD_ICONS.contestedTextYOffset);
        if (!position) {
            this._hide(icon);
            return;
        }

        mod.SetWorldIconPosition(icon, position);
        mod.SetWorldIconColor(icon, KOTH_WORLD_ICONS.colors.contested);
        mod.SetWorldIconText(icon, mod.Message(mod.stringkeys.KothContestedWorldIcon));
        mod.EnableWorldIconImage(icon, false);
        mod.EnableWorldIconText(icon, true);
    }

    private _updateActiveIconForTeam(
        owner: mod.Team,
        ownerTeamId: 1 | 2,
        position: mod.Vector,
        controlState: KothHillControlState,
        seconds: number
    ): void {
        const icon = this._ensureActiveIcon(ownerTeamId);
        if (!icon) return;

        mod.SetWorldIconOwner(icon, owner);
        mod.SetWorldIconPosition(icon, position);
        mod.SetWorldIconColor(icon, this._getColorForViewer(controlState, ownerTeamId));
        mod.SetWorldIconText(icon, formatClockMessage(seconds));
        mod.EnableWorldIconImage(icon, false);
        mod.EnableWorldIconText(icon, true);
    }

    private _updatePreviewIcon(hill: KothHillConfig | undefined, seconds: number): void {
        const icon = this._ensurePreviewIcon();
        if (!icon) return;

        if (!hill || seconds <= 0) {
            this._hide(icon);
            return;
        }

        const position = this._resolveCapturePointPosition(hill.neutralCapturePointId);
        if (!position) {
            this._hide(icon);
            return;
        }

        mod.SetWorldIconPosition(icon, position);
        mod.SetWorldIconColor(icon, KOTH_WORLD_ICONS.colors.locked);
        mod.SetWorldIconText(icon, this._getLockedPreviewText(seconds));
        mod.EnableWorldIconImage(icon, false);
        mod.EnableWorldIconText(icon, true);
    }

    private _ensureActiveIcon(teamId: 1 | 2): mod.WorldIcon | undefined {
        if (teamId === 1) {
            if (!this._context.runtime.worldIcons.activeIconTeam1) {
                this._context.runtime.worldIcons.activeIconTeam1 = this._spawnIcon();
            }

            return this._context.runtime.worldIcons.activeIconTeam1;
        }

        if (!this._context.runtime.worldIcons.activeIconTeam2) {
            this._context.runtime.worldIcons.activeIconTeam2 = this._spawnIcon();
        }

        return this._context.runtime.worldIcons.activeIconTeam2;
    }

    private _ensurePreviewIcon(): mod.WorldIcon | undefined {
        if (!this._context.runtime.worldIcons.previewIcon) {
            this._context.runtime.worldIcons.previewIcon = this._spawnIcon();
        }

        return this._context.runtime.worldIcons.previewIcon;
    }

    private _ensureActiveLockedIcon(): mod.WorldIcon | undefined {
        if (!this._context.runtime.worldIcons.activeLockedIcon) {
            this._context.runtime.worldIcons.activeLockedIcon = this._spawnIcon();
        }

        return this._context.runtime.worldIcons.activeLockedIcon;
    }

    private _ensureContestedTextIcon(): mod.WorldIcon | undefined {
        if (!this._context.runtime.worldIcons.contestedTextIcon) {
            this._context.runtime.worldIcons.contestedTextIcon = this._spawnIcon();
        }

        return this._context.runtime.worldIcons.contestedTextIcon;
    }

    private _spawnIcon(): mod.WorldIcon | undefined {
        try {
            return mod.SpawnObject(
                mod.RuntimeSpawn_Common.WorldIcon,
                mod.CreateVector(0, 0, 0),
                mod.CreateVector(0, 0, 0),
                mod.CreateVector(1, 1, 1)
            ) as mod.WorldIcon;
        } catch (_err) {
            if (!this._context.runtime.worldIcons.warnedSpawnFailed) {
                this._context.runtime.worldIcons.warnedSpawnFailed = true;
                displayWorldLog(mod.Message("[KOTH] Runtime world icon spawn failed"));
            }
            return undefined;
        }
    }

    private _hide(icon: mod.WorldIcon | undefined): void {
        if (!icon) return;

        try {
            mod.EnableWorldIconImage(icon, false);
            mod.EnableWorldIconText(icon, false);
        } catch (_err) {
            return;
        }
    }

    private _resolveHillPosition(
        hill: KothHillConfig,
        controlState: KothHillControlState,
        yOffset: number = KOTH_WORLD_ICONS.yOffset
    ): mod.Vector | undefined {
        if (controlState === 'team1') return this._resolveCapturePointPosition(hill.team1CapturePointId, yOffset);
        if (controlState === 'team2') return this._resolveCapturePointPosition(hill.team2CapturePointId, yOffset);
        return this._resolveCapturePointPosition(hill.neutralCapturePointId, yOffset);
    }

    private _resolveCapturePointPosition(
        capturePointId: number,
        yOffset: number = KOTH_WORLD_ICONS.yOffset
    ): mod.Vector | undefined {
        try {
            const position = mod.GetObjectPosition(mod.GetCapturePoint(capturePointId));
            return createOffsetVector(position, yOffset);
        } catch (_err) {
            const warnings = this._context.runtime.worldIcons.warnedPositionFailedByCapturePointId;
            if (!warnings[capturePointId]) {
                warnings[capturePointId] = true;
                displayWorldLog(mod.Message("[KOTH] Missing capture point position for {}", capturePointId));
            }
            return undefined;
        }
    }

    private _getColorForViewer(controlState: KothHillControlState, viewerTeamId: 1 | 2): mod.Vector {
        if (controlState === 'team1') {
            return viewerTeamId === 1 ? KOTH_WORLD_ICONS.colors.team1 : KOTH_WORLD_ICONS.colors.team2;
        }
        if (controlState === 'team2') {
            return viewerTeamId === 2 ? KOTH_WORLD_ICONS.colors.team1 : KOTH_WORLD_ICONS.colors.team2;
        }
        if (controlState === 'contested') return KOTH_WORLD_ICONS.colors.contested;
        return KOTH_WORLD_ICONS.colors.neutral;
    }

    private _getLockedPreviewText(seconds: number): mod.Message {
        const clamped = seconds < 0 ? 0 : mod.Floor(seconds);
        const secondsOnes = clamped % 10;
        const secondsTens = mod.Floor((clamped % 60) / 10);

        return mod.Message(mod.stringkeys.KothLockedWorldIcon, secondsTens, secondsOnes);
    }
}


// --- SOURCE: src\king-of-the-hill-mode\live\services\koth-lifecycle-service.ts ---















export class KothLifecycleService {
    public constructor(
        private readonly _context: KothLiveModeContext,
        private readonly _schedulerService: KothSchedulerService,
        private readonly _hillService: KothHillService,
        private readonly _scoreService: KothScoreService,
        private readonly _scoreboardService: KothScoreboardService,
        private readonly _uiService: KothUiService,
        private readonly _workQueueService: KothWorkQueueService,
        private readonly _worldIconService: KothWorldIconService,
        private readonly _spawnService: KothSpawnService,
        private readonly _playerTrackerService: KothPlayerTrackerService,
        private readonly _bannerService: KothBannerService,
        private readonly _sfxService: KothSfxService
    ) {}

    public onGameModeStarted(): void {
        const existingPlayers = this._context.runtime.playersById;

        this._sfxService.resetPlayerAudioState();
        this._schedulerService.clearAll();
        this._workQueueService.clearAll();
        this._context.runtime = createKothRuntimeState();
        existingPlayers.forEach((playerState, playerId) => {
            this._context.runtime.playersById.set(playerId, playerState);
        });
        this._spawnService.clearSpawnJobs();

        this._context.runtime.phase = KothGamePhase.Live;
        this._context.runtime.isMatchActive = true;
        this._context.runtime.isPostGame = false;

        mod.SetGameModeTargetScore(this._context.rules.scoreToWin);
        mod.SetGameModeTimeLimit(this._context.rules.matchTimeLimitSeconds);
        this._scoreService.resetScores();
        this._scoreboardService.configure();
        this._enqueueLiveStartupJobs();
    }

    public onGameModeEnding(): void {
        this._schedulerService.clearAll();
        this._workQueueService.clearAll();
        this._playerTrackerService.clearMandownState();
        this._hillService.reset();
        this._spawnService.reset();
        this._worldIconService.reset();
        this._uiService.hideLiveHud();
        this._sfxService.resetPlayerAudioState();
        this._context.runtime.phase = KothGamePhase.NotStarted;
        this._context.runtime.isMatchActive = false;
        this._context.runtime.isPostGame = false;
    }

    public endMatch(winner: mod.Team): void {
        if (!this._context.runtime.isMatchActive) return;

        this._context.runtime.isMatchActive = false;
        this._context.runtime.isPostGame = true;
        this._context.runtime.phase = KothGamePhase.Postmatch;
        this._scoreService.syncGameModeScores(true);
        this._schedulerService.clearAll();
        this._workQueueService.clearAll();
        this._playerTrackerService.clearMandownState();
        this._hillService.reset();
        this._spawnService.reset();
        this._worldIconService.reset();
        this._sfxService.resetPlayerAudioState();
        this._uiService.showPostmatch(winner);

        if (mod.Equals(winner, KOTH_TEAM_1)) {
            this._bannerService.showMatchWon(KOTH_TEAM_1);
            this._bannerService.showMatchLost(KOTH_TEAM_2);
            this._sfxService.playMatchWon(KOTH_TEAM_1);
            this._sfxService.playMatchLost(KOTH_TEAM_2);
        } else {
            this._bannerService.showMatchWon(KOTH_TEAM_2);
            this._bannerService.showMatchLost(KOTH_TEAM_1);
            this._sfxService.playMatchWon(KOTH_TEAM_2);
            this._sfxService.playMatchLost(KOTH_TEAM_1);
        }

        this._schedulerService.setPostmatchEndTimeout(() => {
            mod.EndGameMode(winner);
        });
    }

    private _enqueueLiveStartupJobs(): void {
        this._workQueueService.enqueue('startup', () => this._sfxService.ensureSpawned(), 'startup:sfx');
        this._enqueueCurrentPlayerSyncBatch(0);
    }

    private _enqueueCurrentPlayerSyncBatch(startIndex: number): void {
        this._workQueueService.enqueue(
            'maintenance',
            () => {
                const nextIndex = this._playerTrackerService.syncCurrentPlayersBatch(
                    startIndex,
                    this._context.rules.workQueueBudgets.maintenance
                );
                if (nextIndex >= 0) {
                    this._enqueueCurrentPlayerSyncBatch(nextIndex);
                    return;
                }

                this._workQueueService.enqueue('startup', () => {
                    this._hillService.initializeForMatch();
                    this._enqueuePlayerResetBatch([...this._context.runtime.playersById.keys()], 0);
                }, 'startup:hill-init');
            },
            `startup:sync-players:${startIndex}`
        );
    }

    private _enqueuePlayerResetBatch(playerIds: readonly number[], startIndex: number): void {
        this._workQueueService.enqueue(
            'maintenance',
            () => {
                const maxPlayers = this._context.rules.workQueueBudgets.maintenance;
                const endIndex = Math.min(startIndex + maxPlayers, playerIds.length);

                for (let i = startIndex; i < endIndex; i++) {
                    this._playerTrackerService.resetPlayerForNewMatch(playerIds[i], true, false);
                }

                if (endIndex < playerIds.length) {
                    this._enqueuePlayerResetBatch(playerIds, endIndex);
                    return;
                }

                this._workQueueService.enqueue('startup', () => {
                    this._spawnService.configureLiveDeploySpawnCore();
                    this._enqueueSpawnConfigureBatch([...this._context.runtime.playersById.keys()], 0);
                }, 'startup:spawn-core');
            },
            `startup:reset-players:${startIndex}`
        );
    }

    private _enqueueSpawnConfigureBatch(playerIds: readonly number[], startIndex: number): void {
        this._workQueueService.enqueue(
            'maintenance',
            () => {
                const maxPlayers = this._context.rules.workQueueBudgets.maintenance;
                const endIndex = Math.min(startIndex + maxPlayers, playerIds.length);

                for (let i = startIndex; i < endIndex; i++) {
                    this._spawnService.configureLiveDeploySpawnForPlayer(playerIds[i]);
                }

                if (endIndex < playerIds.length) {
                    this._enqueueSpawnConfigureBatch(playerIds, endIndex);
                    return;
                }

                this._enqueueBootstrapBatch(0);
            },
            `startup:configure-spawns:${startIndex}`
        );
    }

    private _enqueueBootstrapBatch(startIndex: number): void {
        this._workQueueService.enqueue(
            'maintenance',
            () => {
                const nextIndex = this._playerTrackerService.bootstrapLiveStartPlayersBatch(
                    startIndex,
                    this._context.rules.workQueueBudgets.maintenance
                );
                if (nextIndex >= 0) {
                    this._enqueueBootstrapBatch(nextIndex);
                    return;
                }

                this._workQueueService.enqueue('startup', () => {
                    this._hillService.updateActiveHillState(true);
                    this._context.runtime.hudDirty = true;
                    this._context.runtime.scoreboardDirty = true;
                }, 'startup:final-hill-sync');
                this._workQueueService.enqueue('world', () => this._worldIconService.update(), 'world:update');
            },
            `startup:bootstrap:${startIndex}`
        );
    }
}


// --- SOURCE: src\king-of-the-hill-mode\live\services\koth-runtime.ts ---

















type KothHudDirtyPriority = 'critical' | 'normal';

interface KothObjectiveHudSnapshot {
    playerIds: number[];
    controlState: KothHillControlState;
    ownerState: KothHillOwnerState;
}

class KothRuntimeFacade {
    private readonly _context = createKothLiveModeContext();
    private _maintenanceSyncStartIndex = 0;
    private readonly _criticalHudPlayerIds = new Set<number>();
    private readonly _dirtyHudPlayerIds = new Set<number>();
    private _criticalHudFlushQueued = false;
    private _hudFlushQueued = false;
    private _scoreboardFlushPlayerIds: number[] = [];
    private _scoreboardFlushIndex = 0;
    private _scoreboardFlushQueued = false;

    private readonly _bannerService = new KothBannerService();
    private readonly _sfxService = new KothSfxService();
    private readonly _schedulerService = new KothSchedulerService(this._context);
    private readonly _workQueueService = new KothWorkQueueService(this._context);
    private readonly _worldIconService = new KothWorldIconService(this._context);
    private readonly _hillService = new KothHillService(this._context, this._bannerService, this._sfxService);
    private readonly _scoreboardService = new KothScoreboardService(this._context);
    private readonly _scoreService = new KothScoreService(
        this._context,
        this._hillService,
        this._scoreboardService,
        this._bannerService,
        this._sfxService
    );
    private readonly _spawnJobService = new KothSpawnJobService(this._context, this._workQueueService);
    private readonly _spawnService = new KothSpawnService(this._context, this._spawnJobService);
    private readonly _uiService = new KothUiService(this._context);
    private readonly _playerTrackerService = new KothPlayerTrackerService(
        this._context,
        this._hillService,
        this._scoreService,
        this._scoreboardService,
        this._spawnService,
        this._uiService,
        this._sfxService
    );
    private readonly _lifecycleService = new KothLifecycleService(
        this._context,
        this._schedulerService,
        this._hillService,
        this._scoreService,
        this._scoreboardService,
        this._uiService,
        this._workQueueService,
        this._worldIconService,
        this._spawnService,
        this._playerTrackerService,
        this._bannerService,
        this._sfxService
    );

    public onGameModeStarted(): void {
        this._clearRuntimeQueues();
        this._maintenanceSyncStartIndex = 0;
        this._lifecycleService.onGameModeStarted();
        this._startLiveTimers();
    }

    public onKernelGameModeStarted(): void {
        if (this._context.runtime.isMatchActive) return;

        this._clearRuntimeQueues();
        this._schedulerService.clearAll();
        this._workQueueService.clearAll();
        this._context.runtime.isMatchActive = false;
        this._context.runtime.isPostGame = false;
        this._startWorkQueueOnly();
        this._enqueuePrecreateHiddenHudForCurrentPlayers(0);
    }

    public onGameModeEnding(): void {
        this._lifecycleService.onGameModeEnding();
        this._clearRuntimeQueues();
    }

    public onPlayerJoinGame(eventPlayer: mod.Player): void {
        this._playerTrackerService.onPlayerJoinGame(eventPlayer);
        const playerId = this._precreateHiddenHudForPlayer(eventPlayer);
        if (playerId !== undefined && this._context.runtime.isMatchActive) {
            this._uiService.refreshObjectiveHudForPlayer(playerId, true);
        }
    }

    public onKernelPlayerJoinGame(eventPlayer: mod.Player): void {
        if (this._context.runtime.isMatchActive) return;
        if (!mod.IsPlayerValid(eventPlayer)) return;

        const playerId = getKothPlayerId(eventPlayer);

        this._workQueueService.enqueue(
            'ui',
            () => this._precreateHiddenHudForPlayer(eventPlayer),
            `ui:precreate:${playerId}`
        );
    }

    public onPlayerLeaveGame(eventNumber: number): void {
        this._playerTrackerService.onPlayerLeaveGame(eventNumber);
        this._forgetRuntimePlayerQueues(eventNumber);
    }

    public onKernelPlayerLeaveGame(eventNumber: number): void {
        if (this._context.runtime.isMatchActive) return;

        this._playerTrackerService.onPlayerLeaveGame(eventNumber);
        this._forgetRuntimePlayerQueues(eventNumber);
    }

    public onPlayerDeployed(eventPlayer: mod.Player): void {
        this._playerTrackerService.onPlayerDeployed(eventPlayer);
    }

    public onPlayerUndeploy(eventPlayer: mod.Player): void {
        const before = this._getObjectiveHudSnapshot();
        const playerId = mod.IsPlayerValid(eventPlayer) ? getKothPlayerId(eventPlayer) : undefined;
        this._playerTrackerService.onPlayerUndeploy(eventPlayer);
        if (playerId !== undefined) this._queueObjectiveTriggerHudRefresh(playerId, before);
    }

    public onPlayerDied(eventPlayer: mod.Player): void {
        const before = this._getObjectiveHudSnapshot();
        const playerId = mod.IsPlayerValid(eventPlayer) ? getKothPlayerId(eventPlayer) : undefined;
        this._playerTrackerService.onPlayerDied(eventPlayer);
        if (playerId !== undefined) this._queueObjectiveTriggerHudRefresh(playerId, before);
    }

    public onMandown(eventPlayer: mod.Player): void {
        const before = this._getObjectiveHudSnapshot();
        const playerId = mod.IsPlayerValid(eventPlayer) ? getKothPlayerId(eventPlayer) : undefined;
        this._playerTrackerService.onMandown(eventPlayer);
        if (playerId !== undefined) this._queueObjectiveTriggerHudRefresh(playerId, before);
    }

    public onPlayerRevived(eventPlayer: mod.Player, eventOtherPlayer: mod.Player): void {
        const before = this._getObjectiveHudSnapshot();
        const playerId = mod.IsPlayerValid(eventPlayer) ? getKothPlayerId(eventPlayer) : undefined;
        this._playerTrackerService.onPlayerRevived(eventPlayer, eventOtherPlayer);
        if (playerId !== undefined) this._queueObjectiveTriggerHudRefresh(playerId, before);
    }

    public onPlayerEarnedKill(eventPlayer: mod.Player, eventOtherPlayer: mod.Player): void {
        this._playerTrackerService.onPlayerEarnedKill(eventPlayer, eventOtherPlayer);
    }

    public onPlayerEarnedKillAssist(eventPlayer: mod.Player): void {
        this._playerTrackerService.onPlayerEarnedKillAssist(eventPlayer);
    }

    public onPlayerEnterAreaTrigger(eventPlayer: mod.Player, eventAreaTrigger: mod.AreaTrigger): void {
        const playerState = this._playerTrackerService.syncGameplayPlayer(eventPlayer);
        if (!playerState) return;

        const before = this._getObjectiveHudSnapshot();
        const handledHillTrigger = this._hillService.onPlayerEnterAreaTrigger(eventPlayer, eventAreaTrigger);
        this._spawnService.onPlayerEnterAreaTrigger(eventPlayer, eventAreaTrigger);
        if (handledHillTrigger) {
            this._uiService.refreshObjectiveHudOnlyForPlayer(playerState.id, true);
            this._queueObjectiveTriggerHudRefresh(playerState.id, before);
        }
    }

    public onPlayerExitAreaTrigger(eventPlayer: mod.Player, eventAreaTrigger: mod.AreaTrigger): void {
        let playerId: number | undefined;
        if (mod.IsPlayerValid(eventPlayer)) {
            const playerState = this._playerTrackerService.syncGameplayPlayer(eventPlayer);
            playerId = playerState?.id ?? getKothPlayerId(eventPlayer);
        }

        const before = this._getObjectiveHudSnapshot();
        const handledHillTrigger = this._hillService.onPlayerExitAreaTrigger(eventPlayer, eventAreaTrigger);
        this._spawnService.onPlayerExitAreaTrigger(eventPlayer, eventAreaTrigger);
        if (handledHillTrigger && playerId !== undefined) {
            this._uiService.refreshObjectiveHudOnlyForPlayer(playerId, true);
            this._queueObjectiveTriggerHudRefresh(playerId, before);
        }
    }

    private _startLiveTimers(): void {
        this._schedulerService.setWorkJobInterval(() => {
            this._workQueueService.tick();
        });

        this._schedulerService.setHillStateInterval(() => {
            this._workQueueService.enqueue(
                'maintenance',
                () => {
                    const nextIndex = this._playerTrackerService.syncCurrentPlayersBatch(
                        this._maintenanceSyncStartIndex,
                        this._context.rules.workQueueBudgets.maintenance
                    );
                    this._maintenanceSyncStartIndex = nextIndex >= 0 ? nextIndex : 0;
                    this._hillService.updateActiveHillState();
                    this._flushVisuals();
                },
                'runtime:hill-state'
            );
        });

        this._schedulerService.setObjectiveTimerInterval(() => {
            const previousHillIndex = this._context.runtime.hill.currentHillIndex;
            this._hillService.tickObjectiveTimer();
            if (this._context.runtime.hill.currentHillIndex !== previousHillIndex) {
                this._spawnService.onObjectiveActivated();
            }
            this._queueWorldIconUpdate();
            this._flushVisuals();
        });

        this._schedulerService.setScoreTickInterval(() => {
            const winner = this._scoreService.tickScore();
            if (winner) {
                this._lifecycleService.endMatch(winner);
                return;
            }

            this._flushVisuals();
        });

        this._schedulerService.setWorldIconInterval(() => {
            this._queueWorldIconUpdate();
        });
    }

    private _startWorkQueueOnly(): void {
        this._schedulerService.setWorkJobInterval(() => {
            this._workQueueService.tick();
        });
    }

    private _flushVisuals(): void {
        if (this._context.runtime.hudDirty) {
            this._context.runtime.hudDirty = false;
            this.markAllHudDirty();
        }

        if (this._context.runtime.scoreboardDirty) {
            this._context.runtime.scoreboardDirty = false;
            this._queueScoreboardFlush();
        }

        this._uiService.syncContestedBlinkTimer();
    }

    private _queueWorldIconUpdate(): void {
        if (
            this._workQueueService.getTotalQueuedCount() > this._context.rules.workQueueBacklogDegradeThreshold &&
            this._workQueueService.getLaneQueuedCount('world') > 0
        ) {
            return;
        }

        this._workQueueService.enqueue('world', () => this._worldIconService.update(), 'world:update');
    }

    private markPlayerHudDirty(playerId: number, priority: KothHudDirtyPriority = 'normal'): void {
        if (!this._context.runtime.playersById.has(playerId)) return;

        if (priority === 'critical') {
            this._criticalHudPlayerIds.add(playerId);
            this._queueCriticalHudFlush();
            return;
        }

        this._dirtyHudPlayerIds.add(playerId);
        this._queueHudFlush();
    }

    private markPlayersHudDirty(playerIds: readonly number[], priority: KothHudDirtyPriority = 'normal'): void {
        for (const playerId of playerIds) {
            this.markPlayerHudDirty(playerId, priority);
        }
    }

    private markAllHudDirty(): void {
        this._context.runtime.playersById.forEach((playerState) => {
            this.markPlayerHudDirty(playerState.id, 'normal');
        });
    }

    private _queueCriticalHudFlush(): void {
        if (this._criticalHudFlushQueued) return;

        this._criticalHudFlushQueued = true;
        this._workQueueService.enqueue('critical', () => this._processCriticalHudFlushJob(), 'ui:hud-critical-flush');
    }

    private _processCriticalHudFlushJob(): void {
        const playerId = this._takeNextDirtyPlayerId(this._criticalHudPlayerIds);
        if (playerId === undefined) {
            this._criticalHudFlushQueued = false;
            return;
        }

        this._refreshHudPlayer(playerId);

        if (this._criticalHudPlayerIds.size > 0) {
            this._workQueueService.enqueue('critical', () => this._processCriticalHudFlushJob(), 'ui:hud-critical-flush');
            return;
        }

        this._criticalHudFlushQueued = false;
    }

    private _queueHudFlush(): void {
        if (this._hudFlushQueued) return;

        this._hudFlushQueued = true;
        this._workQueueService.enqueue('ui', () => this._processHudFlushJob(), 'ui:hud-flush');
    }

    private _processHudFlushJob(): void {
        const playerId = this._takeNextDirtyPlayerId(this._dirtyHudPlayerIds);
        if (playerId === undefined) {
            this._hudFlushQueued = false;
            return;
        }

        this._refreshHudPlayer(playerId);

        if (this._dirtyHudPlayerIds.size > 0) {
            this._workQueueService.enqueue('ui', () => this._processHudFlushJob(), 'ui:hud-flush');
            return;
        }

        this._hudFlushQueued = false;
    }

    private _takeNextDirtyPlayerId(playerIds: Set<number>): number | undefined {
        while (true) {
            const next = playerIds.values().next();
            if (next.done) return undefined;

            playerIds.delete(next.value);
            if (this._context.runtime.playersById.has(next.value)) return next.value;

            this._uiService.forgetPlayerHud(next.value);
        }
    }

    private _refreshHudPlayer(playerId: number): void {
        this._uiService.refreshObjectiveHudForPlayer(playerId, true);
    }

    private _queueObjectiveTriggerHudRefresh(eventPlayerId: number, before: KothObjectiveHudSnapshot): void {
        const after = this._getObjectiveHudSnapshot();
        const affectedPlayerIds = this._mergePlayerIds([eventPlayerId], before.playerIds, after.playerIds);
        const controlChanged = before.controlState !== after.controlState || before.ownerState !== after.ownerState;

        this.markPlayerHudDirty(eventPlayerId, 'critical');
        this.markPlayersHudDirty(affectedPlayerIds, 'critical');

        if (controlChanged) {
            this.markAllHudDirty();
        }

        this._uiService.syncContestedBlinkTimer();
    }

    private _getObjectiveHudSnapshot(): KothObjectiveHudSnapshot {
        return {
            playerIds: this._hillService.getActiveHillPlayerIds(),
            controlState: this._context.runtime.hill.currentControlState,
            ownerState: this._context.runtime.hill.currentOwnerState,
        };
    }

    private _mergePlayerIds(...groups: readonly (readonly number[])[]): number[] {
        const merged = new Set<number>();
        for (const group of groups) {
            for (const playerId of group) merged.add(playerId);
        }

        return [...merged];
    }

    private _queueScoreboardFlush(): void {
        if (!this._scoreboardFlushQueued) {
            this._scoreboardFlushPlayerIds = [...this._context.runtime.playersById.keys()];
            this._scoreboardFlushIndex = 0;
            this._scoreboardFlushQueued = true;
        }

        this._workQueueService.enqueue('ui', () => this._processScoreboardFlushJob(), 'ui:scoreboard-flush');
    }

    private _processScoreboardFlushJob(): void {
        if (this._scoreboardFlushIndex >= this._scoreboardFlushPlayerIds.length) {
            this._scoreboardFlushQueued = false;
            this._scoreboardFlushPlayerIds = [];
            this._scoreboardFlushIndex = 0;
            return;
        }

        const playerId = this._scoreboardFlushPlayerIds[this._scoreboardFlushIndex];
        this._scoreboardFlushIndex += 1;
        if (this._context.runtime.playersById.has(playerId)) {
            this._scoreboardService.updatePlayer(playerId);
        } else {
            this._uiService.forgetPlayerHud(playerId);
        }

        if (this._scoreboardFlushIndex < this._scoreboardFlushPlayerIds.length) {
            this._workQueueService.enqueue('ui', () => this._processScoreboardFlushJob(), 'ui:scoreboard-flush');
            return;
        }

        this._scoreboardFlushQueued = false;
        this._scoreboardFlushPlayerIds = [];
        this._scoreboardFlushIndex = 0;
    }

    private _forgetRuntimePlayerQueues(playerId: number): void {
        this._criticalHudPlayerIds.delete(playerId);
        this._dirtyHudPlayerIds.delete(playerId);
        let removedBeforeFlushCursor = 0;
        this._scoreboardFlushPlayerIds = this._scoreboardFlushPlayerIds.filter((queuedPlayerId, index) => {
            if (queuedPlayerId !== playerId) return true;
            if (index < this._scoreboardFlushIndex) removedBeforeFlushCursor += 1;
            return false;
        });
        this._scoreboardFlushIndex = Math.max(0, this._scoreboardFlushIndex - removedBeforeFlushCursor);
        if (this._scoreboardFlushIndex > this._scoreboardFlushPlayerIds.length) {
            this._scoreboardFlushIndex = this._scoreboardFlushPlayerIds.length;
        }
        this._uiService.forgetPlayerHud(playerId);
        this._sfxService.clearPlayerAudioState(playerId);
    }

    private _clearRuntimeQueues(): void {
        this._criticalHudPlayerIds.clear();
        this._dirtyHudPlayerIds.clear();
        this._criticalHudFlushQueued = false;
        this._hudFlushQueued = false;
        this._scoreboardFlushPlayerIds = [];
        this._scoreboardFlushIndex = 0;
        this._scoreboardFlushQueued = false;
    }

    private _enqueuePrecreateHiddenHudForCurrentPlayers(startIndex: number): void {
        this._workQueueService.enqueue(
            'ui',
            () => {
                const allPlayers = mod.AllPlayers();
                const totalPlayers = mod.CountOf(allPlayers);
                if (startIndex >= totalPlayers) return;

                const player = mod.ValueInArray(allPlayers, startIndex) as mod.Player;
                if (mod.IsPlayerValid(player)) {
                    this._precreateHiddenHudForPlayer(player);
                }

                if (startIndex + 1 < totalPlayers) {
                    this._enqueuePrecreateHiddenHudForCurrentPlayers(startIndex + 1);
                }
            },
            `ui:precreate-current:${startIndex}`
        );
    }

    private _precreateHiddenHudForPlayer(player: mod.Player): number | undefined {
        const playerState = this._playerTrackerService.syncGameplayPlayer(player);
        if (!playerState) return undefined;

        this._uiService.precreatePlayerHudHidden(playerState.id);
        return playerState.id;
    }
}

const kothLiveFacade = new KothRuntimeFacade();
const warnedKothHandlerFailureByName: Record<string, boolean> = {};

function safeKothHandler<TArgs extends readonly unknown[]>(
    name: string,
    handler: (...args: TArgs) => void
): (...args: TArgs) => void {
    return (...args: TArgs): void => {
        try {
            handler(...args);
        } catch (_err) {
            if (warnedKothHandlerFailureByName[name]) return;

            warnedKothHandlerFailureByName[name] = true;
            displayWorldLog(mod.Message("[KOTH] Live handler {} failed", name));
        }
    };
}

export const KothLiveModeHandlers = {
    OnKernelGameModeStarted: safeKothHandler('OnKernelGameModeStarted', () => kothLiveFacade.onKernelGameModeStarted()),
    OnGameModeStarted: safeKothHandler('OnGameModeStarted', () => kothLiveFacade.onGameModeStarted()),
    OnGameModeEnding: safeKothHandler('OnGameModeEnding', () => kothLiveFacade.onGameModeEnding()),
    OnKernelPlayerJoinGame: safeKothHandler('OnKernelPlayerJoinGame', (eventPlayer: mod.Player) =>
        kothLiveFacade.onKernelPlayerJoinGame(eventPlayer)
    ),
    OnPlayerJoinGame: safeKothHandler('OnPlayerJoinGame', (eventPlayer: mod.Player) =>
        kothLiveFacade.onPlayerJoinGame(eventPlayer)
    ),
    OnKernelPlayerLeaveGame: safeKothHandler('OnKernelPlayerLeaveGame', (eventNumber: number) =>
        kothLiveFacade.onKernelPlayerLeaveGame(eventNumber)
    ),
    OnPlayerLeaveGame: safeKothHandler('OnPlayerLeaveGame', (eventNumber: number) =>
        kothLiveFacade.onPlayerLeaveGame(eventNumber)
    ),
    OnPlayerDeployed: safeKothHandler('OnPlayerDeployed', (eventPlayer: mod.Player) =>
        kothLiveFacade.onPlayerDeployed(eventPlayer)
    ),
    OnPlayerUndeploy: safeKothHandler('OnPlayerUndeploy', (eventPlayer: mod.Player) =>
        kothLiveFacade.onPlayerUndeploy(eventPlayer)
    ),
    OnPlayerDied: safeKothHandler('OnPlayerDied', (eventPlayer: mod.Player) =>
        kothLiveFacade.onPlayerDied(eventPlayer)
    ),
    OnMandown: safeKothHandler('OnMandown', (eventPlayer: mod.Player) => kothLiveFacade.onMandown(eventPlayer)),
    OnRevived: safeKothHandler('OnRevived', (eventPlayer: mod.Player, eventOtherPlayer: mod.Player) =>
        kothLiveFacade.onPlayerRevived(eventPlayer, eventOtherPlayer)
    ),
    OnPlayerEarnedKill: safeKothHandler('OnPlayerEarnedKill', (eventPlayer: mod.Player, eventOtherPlayer: mod.Player) =>
        kothLiveFacade.onPlayerEarnedKill(eventPlayer, eventOtherPlayer)
    ),
    OnPlayerEarnedKillAssist: safeKothHandler('OnPlayerEarnedKillAssist', (eventPlayer: mod.Player) =>
        kothLiveFacade.onPlayerEarnedKillAssist(eventPlayer)
    ),
    OnPlayerEnterAreaTrigger: safeKothHandler(
        'OnPlayerEnterAreaTrigger',
        (eventPlayer: mod.Player, eventAreaTrigger: mod.AreaTrigger) =>
            kothLiveFacade.onPlayerEnterAreaTrigger(eventPlayer, eventAreaTrigger)
    ),
    OnPlayerExitAreaTrigger: safeKothHandler(
        'OnPlayerExitAreaTrigger',
        (eventPlayer: mod.Player, eventAreaTrigger: mod.AreaTrigger) =>
            kothLiveFacade.onPlayerExitAreaTrigger(eventPlayer, eventAreaTrigger)
    ),
};


// --- SOURCE: src\king-of-the-hill-mode\services\lifecycle-service.ts ---



export class LifecycleService {
    public constructor(private readonly _context: KothPhaseModeContext) {}

    public context(): KothPhaseModeContext {
        return this._context;
    }

    public onGameModeStarted(): void {
        KernelKothModeHandlers.OnGameModeStarted();
    }

    public onGameModeEnding(): void {
        KernelKothModeHandlers.OnGameModeEnding();
    }

    public processPrematchTick(): void {
        if (this._context.rules.debug.parityDiagnostics) {
            this._context.session.lifecycle.diagnostics.prematchTicks += 1;
        }
    }

    public processCountdownTick(): void {
        if (this._context.rules.debug.parityDiagnostics) {
            this._context.session.lifecycle.diagnostics.countdownTicks += 1;
        }
    }

    public processPreliveTick(): void {
        if (this._context.rules.debug.parityDiagnostics) {
            this._context.session.lifecycle.diagnostics.preliveTicks += 1;
        }
    }

    public processPostmatchTick(): void {
        if (this._context.rules.debug.parityDiagnostics) {
            this._context.session.lifecycle.diagnostics.postmatchTicks += 1;
        }
    }
}



// --- SOURCE: src\king-of-the-hill-mode\services\objective-service.ts ---



export class ObjectiveService {
    public constructor(private readonly _context: KothPhaseModeContext) {}

    public context(): KothPhaseModeContext {
        return this._context;
    }

    public onPlayerEnterCapturePoint(eventPlayer: mod.Player, eventCapturePoint: mod.CapturePoint): void {
        KernelObjectiveBridge.onPlayerEnterCapturePoint(eventPlayer, eventCapturePoint);
    }

    public onPlayerExitCapturePoint(eventPlayer: mod.Player, eventCapturePoint: mod.CapturePoint): void {
        KernelObjectiveBridge.onPlayerExitCapturePoint(eventPlayer, eventCapturePoint);
    }

    public onOngoingCapturePoint(eventCapturePoint: mod.CapturePoint): void {
        KernelObjectiveBridge.onOngoingCapturePoint(eventCapturePoint);
    }

    public onCapturePointCaptured(flag: mod.CapturePoint): void {
        KernelObjectiveBridge.onCapturePointCaptured(flag);
    }

    public onCapturePointLost(flag: mod.CapturePoint): void {
        KernelObjectiveBridge.onCapturePointLost(flag);
    }

    public onCapturePointCapturing(flag: mod.CapturePoint): void {
        KernelObjectiveBridge.onCapturePointCapturing(flag);
    }

    public processLiveFastTick(): void {
        if (this._context.rules.debug.parityDiagnostics) {
            this._context.session.ui.diagnostics.fastLaneTicks += 1;
        }
        KernelObjectiveBridge.processLiveFastTick();
    }

    public processLiveSlowTick(): void {
        if (this._context.rules.debug.parityDiagnostics) {
            this._context.session.ui.diagnostics.slowLaneTicks += 1;
        }
        KernelObjectiveBridge.processLiveSlowTick();
    }
}




// --- SOURCE: src\king-of-the-hill-mode\services\spawn-routing-service.ts ---



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




// --- SOURCE: src\king-of-the-hill-mode\services\player-service.ts ---




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




// --- SOURCE: src\king-of-the-hill-mode\services\restricted-area-service.ts ---



export class RestrictedAreaService {
    public constructor(private readonly _context: KothPhaseModeContext) {}

    public context(): KothPhaseModeContext {
        return this._context;
    }

    public onPlayerEnterAreaTrigger(eventPlayer: mod.Player, eventAreaTrigger: mod.AreaTrigger): void {
        KernelKothModeHandlers.OnPlayerEnterAreaTrigger(eventPlayer, eventAreaTrigger);
    }

    public onPlayerExitAreaTrigger(eventPlayer: mod.Player, eventAreaTrigger: mod.AreaTrigger): void {
        KernelKothModeHandlers.OnPlayerExitAreaTrigger(eventPlayer, eventAreaTrigger);
    }

    public processDamagePulseTick(): void {
        // The authoritative damage pulse remains in the kernel live loop for parity.
    }
}



// --- SOURCE: src\king-of-the-hill-mode\services\scheduler-service.ts ---




export class SchedulerService {
    public constructor(private readonly _context: KothPhaseModeContext) {}

    public clearAll(): void {
        const scheduler = this._context.runtime.scheduler;
        const handles = [
            scheduler.disabledMcomEnforce,
            scheduler.phaseSecond,
            scheduler.liveFast,
            scheduler.liveSlow,
            scheduler.endgameAudio,
            scheduler.damageZonePulse,
            scheduler.iconFollow,
            scheduler.holdUi,
            scheduler.noFireEnforce,
        ];

        for (const handle of handles) {
            Timers.clearInterval(handle);
        }

        this._context.runtime.scheduler = {};
    }
}



// --- SOURCE: src\king-of-the-hill-mode\services\ui-service.ts ---


export class UiService {
    public constructor(private readonly _context: KothPhaseModeContext) {}

    public context(): KothPhaseModeContext {
        return this._context;
    }

    public setPrematchVisible(_visible: boolean): void {
        // Visibility remains kernel-owned until full UI extraction is completed.
    }

    public setLiveVisible(_visible: boolean): void {
        // Visibility remains kernel-owned until full UI extraction is completed.
    }

    public setPostmatchVisible(_visible: boolean): void {
        // Visibility remains kernel-owned until full UI extraction is completed.
    }

    public updateScoreboardAndHud(): void {
        // HUD/scoreboard updates remain kernel-owned until full UI extraction is completed.
    }
}



// --- SOURCE: src\king-of-the-hill-mode\services\koth-mode-runtime.ts ---














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





// --- SOURCE: src\king-of-the-hill-mode\events\register-events.ts ---




let registered = false;

export function registerKingOfTheHillEvents(): void {
    if (registered) return;
    registered = true;

    Events.OnGameModeStarted.subscribe(KothPhaseModeHandlers.OnGameModeStarted);
    Events.OnGameModeEnding.subscribe(KothPhaseModeHandlers.OnGameModeEnding);
    Events.OngoingGlobal.subscribe(KothPhaseModeHandlers.OngoingGlobal);

    Events.OnPlayerJoinGame.subscribe(KothPhaseModeHandlers.OnPlayerJoinGame);
    Events.OnPlayerLeaveGame.subscribe(KothPhaseModeHandlers.OnPlayerLeaveGame);
    Events.OnPlayerDeployed.subscribe(KothPhaseModeHandlers.OnPlayerDeployed);
    Events.OnPlayerUndeploy.subscribe(KothPhaseModeHandlers.OnPlayerUndeploy);
    Events.OnPlayerInteract.subscribe(KothPhaseModeHandlers.OnPlayerInteract);
    Events.OnPlayerUIButtonEvent.subscribe(KothPhaseModeHandlers.OnPlayerUIButtonEvent);

    Events.OnPlayerDamaged.subscribe(KothPhaseModeHandlers.OnPlayerDamaged);
    Events.OnMandown.subscribe(KothPhaseModeHandlers.OnMandown);
    Events.OnRevived.subscribe(KothPhaseModeHandlers.OnRevived);
    Events.OnPlayerDied.subscribe(KothPhaseModeHandlers.OnPlayerDied);
    Events.OnPlayerEarnedKill.subscribe(KothPhaseModeHandlers.OnPlayerEarnedKill);
    Events.OnPlayerEarnedKillAssist.subscribe(KothPhaseModeHandlers.OnPlayerEarnedKillAssist);

    Events.OnPlayerEnterAreaTrigger.subscribe(KothPhaseModeHandlers.OnPlayerEnterAreaTrigger);
    Events.OnPlayerExitAreaTrigger.subscribe(KothPhaseModeHandlers.OnPlayerExitAreaTrigger);
}



// --- SOURCE: src\king-of-the-hill-mode\index.ts ---



export function registerKingOfTheHillMode(): void {
    registerKingOfTheHillEvents();
}



// --- SOURCE: src\index.ts ---


registerKingOfTheHillMode();


