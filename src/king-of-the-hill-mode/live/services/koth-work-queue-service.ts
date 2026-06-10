import type { KothLiveModeContext } from '../state/koth-mode-context.ts';

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
