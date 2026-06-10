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
