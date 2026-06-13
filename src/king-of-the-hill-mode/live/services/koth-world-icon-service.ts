import { KOTH_WORLD_ICONS } from '../config/koth-world-icons.ts';
import type { KothHillConfig } from '../config/koth-hills.ts';
import type { KothHillControlState } from '../state/koth-hill-state.ts';
import type { KothLiveModeContext } from '../state/koth-mode-context.ts';
import {
    createOffsetVector,
    displayWorldLog,
    formatClockMessage,
    KOTH_TEAM_1,
    KOTH_TEAM_2,
} from './koth-sdk-utils.ts';

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
