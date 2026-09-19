type Handler = (...args: unknown[]) => void

class EventBusClass {
  private listeners = new Map<string, Set<Handler>>()

  on(event: string, handler: Handler): void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set())
    this.listeners.get(event)!.add(handler)
  }

  off(event: string, handler: Handler): void {
    this.listeners.get(event)?.delete(handler)
  }

  emit(event: string, ...args: unknown[]): void {
    this.listeners.get(event)?.forEach(h => h(...args))
  }
}

export const EventBus = new EventBusClass()
