import { EventEmitter } from 'events';
type AppEvent = 'data-changed' | 'navigate-to-month' | string;

class EventManager extends EventEmitter {
    emit(event: AppEvent, ...args: any[]): boolean {
        return super.emit(event, ...args);
    }
    on(event: AppEvent, listener: (...args: any[]) => void): this {
        return super.on(event, listener);
    }
    off(event: AppEvent, listener: (...args: any[]) => void): this {
        return super.off(event, listener);
    }
}
export const eventManager = new EventManager();