import type { KothLiveModeContext } from '../state/koth-mode-context.ts';
import type { KothSpawnJob } from '../state/koth-spawn-state.ts';
import type { KothWorkQueueService } from './koth-work-queue-service.ts';

export class KothSpawnJobService {
    private _processor: ((job: KothSpawnJob) => void) | undefined;
    private _pendingReadIndex = 0;
    private _urgentJobs: KothSpawnJob[] = [];
    private _urgentReadIndex = 0;

    public constructor(
        private readonly _context: KothLiveModeContext,
        private readonly _workQueueService: KothWorkQueueService
    ) {}

    public setProcessor(processor: (job: KothSpawnJob) => void): void {
        this._processor = processor;
    }

    public enqueue(job: KothSpawnJob): void {
        if (this._pendingReadIndex > this._context.runtime.spawn.pendingJobs.length) {
            this._pendingReadIndex = 0;
        }

        this._context.runtime.spawn.pendingJobs.push(job);
        this._requestPump();
    }

    public enqueueFront(job: KothSpawnJob): void {
        if (this._urgentReadIndex > this._urgentJobs.length) {
            this._urgentReadIndex = 0;
        }

        this._urgentJobs.push(job);
        this._requestPump();
    }

    public clearAll(): void {
        this._context.runtime.spawn.pendingJobs = [];
        this._pendingReadIndex = 0;
        this._urgentJobs = [];
        this._urgentReadIndex = 0;
    }

    public clearPlayerJobs(playerId: number): void {
        this._context.runtime.spawn.pendingJobs = this._context.runtime.spawn.pendingJobs
            .slice(this._pendingReadIndex)
            .filter((job) => job.playerId !== playerId);
        this._pendingReadIndex = 0;

        this._urgentJobs = this._urgentJobs.slice(this._urgentReadIndex).filter(
            (job) => job.playerId !== playerId
        );
        this._urgentReadIndex = 0;
    }

    public tick(processor?: (job: KothSpawnJob) => void): void {
        const activeProcessor = processor ?? this._processor;
        if (!activeProcessor) return;

        const maxJobs = this._context.spawns.rules.spawnJobsPerTick;
        let processed = 0;

        while (processed < maxJobs) {
            const job = this._nextJob();
            if (!job) break;

            try {
                activeProcessor(job);
            } catch (_err) {
                // Keep later spawn jobs moving if one player/job fails.
            }
            processed += 1;
        }

        this._compactQueues();
        if (this._hasPendingJobs()) this._requestPump();
    }

    private _nextJob(): KothSpawnJob | undefined {
        if (this._urgentReadIndex < this._urgentJobs.length) {
            const job = this._urgentJobs[this._urgentReadIndex];
            this._urgentReadIndex += 1;
            return job;
        }

        if (this._pendingReadIndex < this._context.runtime.spawn.pendingJobs.length) {
            const job = this._context.runtime.spawn.pendingJobs[this._pendingReadIndex];
            this._pendingReadIndex += 1;
            return job;
        }

        return undefined;
    }

    private _requestPump(): void {
        this._workQueueService.enqueue('spawn', () => this.tick(), 'spawn:pump');
    }

    private _hasPendingJobs(): boolean {
        return (
            this._urgentReadIndex < this._urgentJobs.length ||
            this._pendingReadIndex < this._context.runtime.spawn.pendingJobs.length
        );
    }

    private _compactQueues(): void {
        if (this._urgentReadIndex > 32 && this._urgentReadIndex * 2 >= this._urgentJobs.length) {
            this._urgentJobs = this._urgentJobs.slice(this._urgentReadIndex);
            this._urgentReadIndex = 0;
        }

        const pendingJobs = this._context.runtime.spawn.pendingJobs;
        if (this._pendingReadIndex > 32 && this._pendingReadIndex * 2 >= pendingJobs.length) {
            this._context.runtime.spawn.pendingJobs = pendingJobs.slice(this._pendingReadIndex);
            this._pendingReadIndex = 0;
        }
    }
}
