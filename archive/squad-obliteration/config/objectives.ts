import { WORLD_IDS } from './world-ids.ts';

export type ObjectiveLane = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

export interface ObjectiveDefinition {
    cpId: number;
    lane: ObjectiveLane;
    defendingTeamId: 1 | 2;
    countsForRouting: boolean;
}

export const OBJECTIVE_DEFINITIONS: ObjectiveDefinition[] = [
    { cpId: WORLD_IDS.capturePoints.a, lane: 'A', defendingTeamId: 1, countsForRouting: true },
    { cpId: WORLD_IDS.capturePoints.b, lane: 'B', defendingTeamId: 1, countsForRouting: true },
    { cpId: WORLD_IDS.capturePoints.c, lane: 'C', defendingTeamId: 1, countsForRouting: true },
    { cpId: WORLD_IDS.capturePoints.d, lane: 'D', defendingTeamId: 2, countsForRouting: false },
    { cpId: WORLD_IDS.capturePoints.e, lane: 'E', defendingTeamId: 2, countsForRouting: false },
    { cpId: WORLD_IDS.capturePoints.f, lane: 'F', defendingTeamId: 2, countsForRouting: false },
];

export const ROUTING_CAPTURE_POINT_IDS: number[] = [
    WORLD_IDS.capturePoints.a,
    WORLD_IDS.capturePoints.b,
    WORLD_IDS.capturePoints.c,
];
