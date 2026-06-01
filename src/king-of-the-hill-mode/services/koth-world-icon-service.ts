import { KOTH_WORLD_ICONS } from '../config/koth-world-icons.ts';
import type { KothHillConfig } from '../config/koth-hills.ts';
import type { KothHillControlState } from '../state/koth-hill-state.ts';
import type { KothModeContext } from '../state/koth-mode-context.ts';
import { createOffsetVector, displayWorldLog, formatClockText } from './koth-sdk-utils.ts';

export class KothWorldIconService {
    public constructor(private readonly _context: KothModeContext) {}

    public reset(): void {
        this._hide(this._context.runtime.worldIcons.activeIcon);
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

        this._updateActiveIcon(activeHill, runtime.hill.currentControlState, runtime.hill.activeObjectiveRemainingSeconds);
        this._updatePreviewIcon(previewHill, runtime.hill.nextPreviewRemainingSeconds);
    }

    private _updateActiveIcon(hill: KothHillConfig, controlState: KothHillControlState, seconds: number): void {
        const icon = this._ensureActiveIcon();
        if (!icon) return;

        const position = this._resolveHillPosition(hill, controlState);
        if (!position) {
            this._hide(icon);
            return;
        }

        mod.SetWorldIconPosition(icon, position);
        mod.SetWorldIconImage(icon, KOTH_WORLD_ICONS.activeImage);
        mod.SetWorldIconColor(icon, this._getColor(controlState));
        mod.SetWorldIconText(icon, this._getActiveText(hill.letter, controlState, seconds));
        mod.EnableWorldIconImage(icon, true);
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
        mod.SetWorldIconImage(icon, KOTH_WORLD_ICONS.previewImage);
        mod.SetWorldIconColor(icon, KOTH_WORLD_ICONS.colors.locked);
        mod.SetWorldIconText(icon, mod.Message(mod.stringkeys.KothLockedWorldIcon, hill.letter, seconds));
        mod.EnableWorldIconImage(icon, true);
        mod.EnableWorldIconText(icon, true);
    }

    private _ensureActiveIcon(): mod.WorldIcon | undefined {
        if (!this._context.runtime.worldIcons.activeIcon) {
            this._context.runtime.worldIcons.activeIcon = this._spawnIcon();
        }

        return this._context.runtime.worldIcons.activeIcon;
    }

    private _ensurePreviewIcon(): mod.WorldIcon | undefined {
        if (!this._context.runtime.worldIcons.previewIcon) {
            this._context.runtime.worldIcons.previewIcon = this._spawnIcon();
        }

        return this._context.runtime.worldIcons.previewIcon;
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

    private _resolveHillPosition(hill: KothHillConfig, controlState: KothHillControlState): mod.Vector | undefined {
        if (controlState === 'team1') return this._resolveCapturePointPosition(hill.team1CapturePointId);
        if (controlState === 'team2') return this._resolveCapturePointPosition(hill.team2CapturePointId);
        return this._resolveCapturePointPosition(hill.neutralCapturePointId);
    }

    private _resolveCapturePointPosition(capturePointId: number): mod.Vector | undefined {
        try {
            const position = mod.GetObjectPosition(mod.GetCapturePoint(capturePointId));
            return createOffsetVector(position, KOTH_WORLD_ICONS.yOffset);
        } catch (_err) {
            const warnings = this._context.runtime.worldIcons.warnedPositionFailedByCapturePointId;
            if (!warnings[capturePointId]) {
                warnings[capturePointId] = true;
                displayWorldLog(mod.Message("[KOTH] Missing capture point position for {}", capturePointId));
            }
            return undefined;
        }
    }

    private _getColor(controlState: KothHillControlState): mod.Vector {
        if (controlState === 'team1') return KOTH_WORLD_ICONS.colors.team1;
        if (controlState === 'team2') return KOTH_WORLD_ICONS.colors.team2;
        if (controlState === 'contested') return KOTH_WORLD_ICONS.colors.contested;
        return KOTH_WORLD_ICONS.colors.neutral;
    }

    private _getActiveText(letter: string, controlState: KothHillControlState, seconds: number): mod.Message {
        if (controlState === 'contested') {
            return mod.Message(mod.stringkeys.KothContestedWorldIcon, letter);
        }

        return mod.Message(mod.stringkeys.KothActiveWorldIcon, letter, formatClockText(seconds));
    }
}
