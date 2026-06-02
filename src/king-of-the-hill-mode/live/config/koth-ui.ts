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
