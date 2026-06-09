import { KOTH_UI_COLORS } from './koth-ui.ts';

export const KOTH_WORLD_ICONS = {
    yOffset: 6,
    contestedTextYOffset: 3,
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
