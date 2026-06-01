export const KOTH_RULES = {
    scoreToWin: 250,
    scorePerOwnedSecond: 1,

    objectiveDurationSeconds: 85,
    nextObjectivePreviewSeconds: 6,

    hillStateUpdateMs: 250,
    scoreTickMs: 1000,
    worldIconTimerUpdateMs: 1000,

    victoryImminentScore: 225,

    rotationOrder: ['A', 'B', 'C', 'D', 'E'] as const,

    enemyPresenceContests: true,
    emptyHillScores: false,

    postmatchDelaySeconds: 12,
    matchTimeLimitSeconds: 60000,
    redeployTimeSeconds: 0,

    spectator: {
        enabled: true,
        entryTeamId: 1,
        fixedCamera: {
            preferredIndex: 9301,
            fallbackIndex: 0,
        },
        cameraOffsets: {
            third: {
                x: 0.55,
                y: 0.9,
                z: -2.4,
            },
        },
        freeCam: {
            speedMetersPerSecond: 6,
            sprintMultiplier: 3,
        },
        cameraFollow: {
            smoothingSeconds: 0.2,
        },
        trigger: {
            requiredClicks: 3,
            windowMs: 2000,
        },
        ui: {
            refreshIntervalMs: 250,
        },
    },
} as const;
