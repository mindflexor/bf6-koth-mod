import { registerSquadObliterationEvents } from './events/register-events.ts';
import { createModeContext } from './state/mode-context.ts';
import { AudioService } from './services/audio-service.ts';
import { BombService } from './services/bomb-service.ts';
import { CombatService } from './services/combat-service.ts';
import { GlobalTickService } from './services/global-tick-service.ts';
import { LifecycleService } from './services/lifecycle-service.ts';
import { ObjectiveService } from './services/objective-service.ts';
import { RestrictedAreaService } from './services/restricted-area-service.ts';
import { SchedulerService } from './services/scheduler-service.ts';
import { SpawnRoutingService } from './services/spawn-routing-service.ts';
import { UiService } from './services/ui-service.ts';

const context = createModeContext();

// Service instantiation keeps a single composition root while the legacy parity
// implementation is progressively moved behind these boundaries.
void new LifecycleService(context);
void new SpawnRoutingService(context);
void new ObjectiveService(context);
void new BombService(context);
void new CombatService(context);
void new RestrictedAreaService(context);
void new UiService(context);
void new AudioService(context);
void new SchedulerService(context);
void new GlobalTickService(context);

registerSquadObliterationEvents();
