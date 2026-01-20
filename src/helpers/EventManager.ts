// import { EventEmitter } from 'events'; // NODE ONLY - CRASHES MOBILE
type AppEvent = 'data-changed' | 'navigate-to-month' | 'view-opened' | string;

class SimpleEventEmitter {
    private listeners: Record<string, ((...args: any[]) => void)[]> = {};

    emit(event: AppEvent, ...args: any[]): boolean {
        if (!this.listeners[event]) return false;
        this.listeners[event].forEach(listener => listener(...args));
        return true;
    }

    on(event: AppEvent, listener: (...args: any[]) => void): this {
        if (!this.listeners[event]) this.listeners[event] = [];
        this.listeners[event].push(listener);
        return this;
    }

    off(event: AppEvent, listener: (...args: any[]) => void): this {
        if (!this.listeners[event]) return this;
        this.listeners[event] = this.listeners[event].filter(l => l !== listener);
        return this;
    }

    removeAllListeners() {
        this.listeners = {};
    }
}

export const eventManager = new SimpleEventEmitter();