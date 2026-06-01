export const KOTH_TEAM_NEUTRAL = mod.GetTeam(0);
export const KOTH_TEAM_1 = mod.GetTeam(1);
export const KOTH_TEAM_2 = mod.GetTeam(2);

export function getPlayerId(player: mod.Player): number {
    return mod.GetObjId(player);
}

export function getTeamId(team: mod.Team): 0 | 1 | 2 {
    if (mod.Equals(team, KOTH_TEAM_1)) return 1;
    if (mod.Equals(team, KOTH_TEAM_2)) return 2;
    return 0;
}

export function isParticipantTeam(team: mod.Team): boolean {
    return mod.Equals(team, KOTH_TEAM_1) || mod.Equals(team, KOTH_TEAM_2);
}

export function isPlayerAlive(player: mod.Player): boolean {
    try {
        return mod.GetSoldierState(player, mod.SoldierStateBool.IsAlive);
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
    return mod.Message(formatClockText(seconds));
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
