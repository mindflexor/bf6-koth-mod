import { registerKingOfTheHillEvents } from './events/register-events.ts';
import './services/koth-mode-runtime.ts';

export function registerKingOfTheHillMode(): void {
    registerKingOfTheHillEvents();
}

