import { Timers } from 'bf6-portal-utils/timers/index.ts';

import { KOTH_UI, KOTH_UI_COLORS } from '../config/koth-ui.ts';
import type { KothHillControlState } from '../state/koth-hill-state.ts';
import type { KothLiveModeContext } from '../state/koth-mode-context.ts';
import type { KothPlayerState } from '../state/koth-player-state.ts';
import {
    formatClockMessage,
    formatScore3Message,
    getHillLetterMessage,
    getKothTeamId,
    isParticipantTeam,
    KOTH_TEAM_1,
    KOTH_TEAM_2,
} from './koth-sdk-utils.ts';

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

const KOTH_POSTMATCH_LAYOUT = {
    rootWidth: 1920,
    rootHeight: 1080,
    resultY: 80,
    resultWidth: 800,
    resultHeight: 80,
    resultTextSize: 64,
    finalScoreY: 150,
    finalScoreWidth: 900,
    finalScoreHeight: 40,
    finalScoreTextSize: 28,
    headerY: 220,
    headerHeight: 24,
    headerTextSize: 18,
    rowStartY: 260,
    rowHeight: 22,
    rowTextSize: 16,
    maxRows: 24,
    tableWidth: 620,
    tableGap: 60,
    nameX: -220,
    nameWidth: 280,
    scoreX: 120,
    scoreWidth: 90,
    killsX: 200,
    killsWidth: 40,
    deathsX: 245,
    deathsWidth: 40,
    assistsX: 290,
    assistsWidth: 40,
    hillTimeX: 345,
    hillTimeWidth: 92,
} as const;

const KOTH_CONTESTED_BLINK_INTERVAL_MS = 260;
const KOTH_CONTESTED_BLINK_FRAME_COUNT = 4;

export class KothUiService {
    private readonly _widgetByName = new Map<string, mod.UIWidget>();
    private readonly _visibleByName = new Map<string, boolean>();
    private readonly _postmatchWidgetNames = new Set<string>();
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
            mod.UIBgFill.None,
            mod.UIDepth.AboveGameUI
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
            mod.UIBgFill.None,
            mod.UIDepth.AboveGameUI
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
        this._deletePostmatchReportWidgets();
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

        const team1Players: KothPlayerState[] = [];
        const team2Players: KothPlayerState[] = [];

        this._context.runtime.playersById.forEach((playerState) => {
            if (playerState.isBot || !mod.IsPlayerValid(playerState.player)) return;

            const team = mod.GetTeam(playerState.player);
            if (mod.Equals(team, KOTH_TEAM_1)) {
                team1Players.push(playerState);
            } else if (mod.Equals(team, KOTH_TEAM_2)) {
                team2Players.push(playerState);
            }
        });

        team1Players.sort((a, b) => b.getScoreboardSnapshot()[0] - a.getScoreboardSnapshot()[0]);
        team2Players.sort((a, b) => b.getScoreboardSnapshot()[0] - a.getScoreboardSnapshot()[0]);

        this._showPostmatchForTeam(
            KOTH_TEAM_1,
            winner,
            team1Players,
            team2Players,
            this._context.runtime.team1Score,
            this._context.runtime.team2Score
        );
        this._showPostmatchForTeam(
            KOTH_TEAM_2,
            winner,
            team2Players,
            team1Players,
            this._context.runtime.team2Score,
            this._context.runtime.team1Score
        );
    }

    private _showPostmatchForTeam(
        receiver: mod.Team,
        winner: mod.Team,
        friendlyPlayers: readonly KothPlayerState[],
        enemyPlayers: readonly KothPlayerState[],
        friendlyScore: number,
        enemyScore: number
    ): void {
        const teamId = getKothTeamId(receiver);
        const rootName = `KOTH_POSTMATCH_${teamId}`;
        const root = this._addPostmatchContainer(
            rootName,
            mod.CreateVector(0, 0, 0),
            mod.CreateVector(KOTH_POSTMATCH_LAYOUT.rootWidth, KOTH_POSTMATCH_LAYOUT.rootHeight, 0),
            mod.UIAnchor.Center,
            mod.GetUIRoot(),
            receiver,
            KOTH_UI_COLORS.background,
            0.75
        );
        if (!root) return;

        const isDraw = !mod.Equals(winner, KOTH_TEAM_1) && !mod.Equals(winner, KOTH_TEAM_2);
        const won = !isDraw && mod.Equals(receiver, winner);
        const resultKey = isDraw
            ? mod.stringkeys.PostMatchDraw
            : won
              ? mod.stringkeys.PostMatchVictory
              : mod.stringkeys.PostMatchDefeat;
        const resultColor = isDraw ? KOTH_UI_COLORS.neutral : won ? KOTH_UI_COLORS.team1 : KOTH_UI_COLORS.team2;

        this._addPostmatchText(
            `KOTH_POSTMATCH_RESULT_${teamId}`,
            0,
            KOTH_POSTMATCH_LAYOUT.resultY,
            KOTH_POSTMATCH_LAYOUT.resultWidth,
            KOTH_POSTMATCH_LAYOUT.resultHeight,
            KOTH_POSTMATCH_LAYOUT.resultTextSize,
            resultColor,
            receiver,
            root,
            mod.Message(resultKey)
        );
        this._addPostmatchText(
            `KOTH_POSTMATCH_SCORE_${teamId}`,
            0,
            KOTH_POSTMATCH_LAYOUT.finalScoreY,
            KOTH_POSTMATCH_LAYOUT.finalScoreWidth,
            KOTH_POSTMATCH_LAYOUT.finalScoreHeight,
            KOTH_POSTMATCH_LAYOUT.finalScoreTextSize,
            KOTH_UI_COLORS.text,
            receiver,
            root,
            mod.Message(
                mod.stringkeys.PostMatchFinalTickets,
                mod.Ceiling(friendlyScore),
                mod.Ceiling(enemyScore)
            )
        );

        const leftX = -(KOTH_POSTMATCH_LAYOUT.tableGap / 2 + KOTH_POSTMATCH_LAYOUT.tableWidth / 2);
        const rightX = KOTH_POSTMATCH_LAYOUT.tableGap / 2 + KOTH_POSTMATCH_LAYOUT.tableWidth / 2;

        this._addPostmatchHeaders('L', teamId, leftX, KOTH_UI_COLORS.team1, receiver, root);
        this._addPostmatchHeaders('R', teamId, rightX, KOTH_UI_COLORS.team2, receiver, root);
        this._addPostmatchRows('L', teamId, leftX, friendlyPlayers, KOTH_UI_COLORS.team1, receiver, root);
        this._addPostmatchRows('R', teamId, rightX, enemyPlayers, KOTH_UI_COLORS.team2, receiver, root);
    }

    private _addPostmatchHeaders(
        side: 'L' | 'R',
        receiverTeamId: 0 | 1 | 2,
        tableX: number,
        color: mod.Vector,
        receiver: mod.Team,
        root: mod.UIWidget
    ): void {
        const suffix = `${side}_${receiverTeamId}`;
        this._addPostmatchText(
            `KOTH_PM_H_NAME_${suffix}`,
            tableX + KOTH_POSTMATCH_LAYOUT.nameX,
            KOTH_POSTMATCH_LAYOUT.headerY,
            KOTH_POSTMATCH_LAYOUT.nameWidth,
            KOTH_POSTMATCH_LAYOUT.headerHeight,
            KOTH_POSTMATCH_LAYOUT.headerTextSize,
            color,
            receiver,
            root,
            mod.Message(mod.stringkeys.PostMatchHeaderName)
        );
        this._addPostmatchText(
            `KOTH_PM_H_SCORE_${suffix}`,
            tableX + KOTH_POSTMATCH_LAYOUT.scoreX,
            KOTH_POSTMATCH_LAYOUT.headerY,
            KOTH_POSTMATCH_LAYOUT.scoreWidth,
            KOTH_POSTMATCH_LAYOUT.headerHeight,
            KOTH_POSTMATCH_LAYOUT.headerTextSize,
            color,
            receiver,
            root,
            mod.Message(mod.stringkeys.PostMatchHeaderScore)
        );
        this._addPostmatchText(
            `KOTH_PM_H_K_${suffix}`,
            tableX + KOTH_POSTMATCH_LAYOUT.killsX,
            KOTH_POSTMATCH_LAYOUT.headerY,
            KOTH_POSTMATCH_LAYOUT.killsWidth,
            KOTH_POSTMATCH_LAYOUT.headerHeight,
            KOTH_POSTMATCH_LAYOUT.headerTextSize,
            color,
            receiver,
            root,
            mod.Message(mod.stringkeys.PostMatchHeaderKills)
        );
        this._addPostmatchText(
            `KOTH_PM_H_D_${suffix}`,
            tableX + KOTH_POSTMATCH_LAYOUT.deathsX,
            KOTH_POSTMATCH_LAYOUT.headerY,
            KOTH_POSTMATCH_LAYOUT.deathsWidth,
            KOTH_POSTMATCH_LAYOUT.headerHeight,
            KOTH_POSTMATCH_LAYOUT.headerTextSize,
            color,
            receiver,
            root,
            mod.Message(mod.stringkeys.PostMatchHeaderDeaths)
        );
        this._addPostmatchText(
            `KOTH_PM_H_A_${suffix}`,
            tableX + KOTH_POSTMATCH_LAYOUT.assistsX,
            KOTH_POSTMATCH_LAYOUT.headerY,
            KOTH_POSTMATCH_LAYOUT.assistsWidth,
            KOTH_POSTMATCH_LAYOUT.headerHeight,
            KOTH_POSTMATCH_LAYOUT.headerTextSize,
            color,
            receiver,
            root,
            mod.Message(mod.stringkeys.PostMatchHeaderAssists)
        );
        this._addPostmatchText(
            `KOTH_PM_H_HT_${suffix}`,
            tableX + KOTH_POSTMATCH_LAYOUT.hillTimeX,
            KOTH_POSTMATCH_LAYOUT.headerY,
            KOTH_POSTMATCH_LAYOUT.hillTimeWidth,
            KOTH_POSTMATCH_LAYOUT.headerHeight,
            KOTH_POSTMATCH_LAYOUT.headerTextSize,
            color,
            receiver,
            root,
            mod.Message(mod.stringkeys.KothScoreboardHillTime)
        );
    }

    private _addPostmatchRows(
        side: 'L' | 'R',
        receiverTeamId: 0 | 1 | 2,
        tableX: number,
        players: readonly KothPlayerState[],
        nameColor: mod.Vector,
        receiver: mod.Team,
        root: mod.UIWidget
    ): void {
        const lineCount = this._clampPostmatchLineCount(players.length);
        for (let i = 0; i < lineCount; i++) {
            const y = KOTH_POSTMATCH_LAYOUT.rowStartY + i * KOTH_POSTMATCH_LAYOUT.rowHeight;
            const playerState = players[i];
            const snapshot = playerState.getScoreboardSnapshot();
            const suffix = `${side}_${receiverTeamId}_${i}`;

            this._addPostmatchText(
                `KOTH_PM_N_${suffix}`,
                tableX + KOTH_POSTMATCH_LAYOUT.nameX,
                y,
                KOTH_POSTMATCH_LAYOUT.nameWidth,
                KOTH_POSTMATCH_LAYOUT.rowHeight,
                KOTH_POSTMATCH_LAYOUT.rowTextSize,
                nameColor,
                receiver,
                root,
                mod.Message(mod.stringkeys.PostMatchPlayerName, playerState.player)
            );
            this._addPostmatchStatText(
                `KOTH_PM_S_${suffix}`,
                tableX + KOTH_POSTMATCH_LAYOUT.scoreX,
                y,
                KOTH_POSTMATCH_LAYOUT.scoreWidth,
                snapshot[0],
                receiver,
                root
            );
            this._addPostmatchStatText(
                `KOTH_PM_K_${suffix}`,
                tableX + KOTH_POSTMATCH_LAYOUT.killsX,
                y,
                KOTH_POSTMATCH_LAYOUT.killsWidth,
                snapshot[1],
                receiver,
                root
            );
            this._addPostmatchStatText(
                `KOTH_PM_D_${suffix}`,
                tableX + KOTH_POSTMATCH_LAYOUT.deathsX,
                y,
                KOTH_POSTMATCH_LAYOUT.deathsWidth,
                snapshot[2],
                receiver,
                root
            );
            this._addPostmatchStatText(
                `KOTH_PM_A_${suffix}`,
                tableX + KOTH_POSTMATCH_LAYOUT.assistsX,
                y,
                KOTH_POSTMATCH_LAYOUT.assistsWidth,
                snapshot[3],
                receiver,
                root
            );
            this._addPostmatchStatText(
                `KOTH_PM_HT_${suffix}`,
                tableX + KOTH_POSTMATCH_LAYOUT.hillTimeX,
                y,
                KOTH_POSTMATCH_LAYOUT.hillTimeWidth,
                snapshot[4],
                receiver,
                root
            );
        }
    }

    private _addPostmatchStatText(
        name: string,
        x: number,
        y: number,
        width: number,
        value: number,
        receiver: mod.Team,
        root: mod.UIWidget
    ): void {
        this._addPostmatchText(
            name,
            x,
            y,
            width,
            KOTH_POSTMATCH_LAYOUT.rowHeight,
            KOTH_POSTMATCH_LAYOUT.rowTextSize,
            KOTH_UI_COLORS.text,
            receiver,
            root,
            mod.Message(value)
        );
    }

    private _addPostmatchContainer(
        name: string,
        position: mod.Vector,
        size: mod.Vector,
        anchor: mod.UIAnchor,
        parent: mod.UIWidget,
        receiver: mod.Team,
        color: mod.Vector,
        alpha: number
    ): mod.UIWidget | undefined {
        const widget = this._addContainerWithFill(name, position, size, anchor, parent, receiver, color, alpha, mod.UIBgFill.Solid);
        if (widget) this._postmatchWidgetNames.add(name);
        return widget;
    }

    private _addPostmatchText(
        name: string,
        x: number,
        y: number,
        width: number,
        height: number,
        textSize: number,
        color: mod.Vector,
        receiver: mod.Team,
        root: mod.UIWidget,
        label: mod.Message
    ): void {
        const widget = this._addTextWithStyle(
            name,
            mod.CreateVector(x, y, 0),
            mod.CreateVector(width, height, 0),
            mod.UIAnchor.TopCenter,
            root,
            receiver,
            label,
            textSize,
            color,
            1,
            mod.UIAnchor.Center
        );
        if (widget) this._postmatchWidgetNames.add(name);
    }

    private _deletePostmatchReportWidgets(): void {
        const names = [...this._postmatchWidgetNames].reverse();
        for (const name of names) {
            const widget = this._findWidget(name);
            if (widget) {
                try {
                    mod.DeleteUIWidget(widget);
                } catch (_err) {
                    // The engine may already have removed children when a parent was deleted.
                }
            }

            this._widgetByName.delete(name);
            this._visibleByName.delete(name);
        }

        this._postmatchWidgetNames.clear();
    }

    private _clampPostmatchLineCount(count: number): number {
        if (count < 0) return 0;
        if (count > KOTH_POSTMATCH_LAYOUT.maxRows) return KOTH_POSTMATCH_LAYOUT.maxRows;
        return count;
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
        fill: mod.UIBgFill,
        depth?: mod.UIDepth
    ): mod.UIWidget | undefined {
        try {
            if (depth === undefined) {
                mod.AddUIContainer(name, position, size, anchor, parent, true, 0, color, alpha, fill, receiver);
            } else {
                mod.AddUIContainer(name, position, size, anchor, parent, true, 0, color, alpha, fill, depth, receiver);
            }
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
}
