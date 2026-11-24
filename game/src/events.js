// Minimal publish/subscribe bus so systems (police, missions, hud, audio) stay decoupled.

export function createEvents() {
  const handlers = new Map();
  return {
    on(name, fn) {
      if (!handlers.has(name)) handlers.set(name, []);
      handlers.get(name).push(fn);
      return () => this.off(name, fn);
    },
    off(name, fn) {
      const l = handlers.get(name);
      if (l) handlers.set(name, l.filter((f) => f !== fn));
    },
    emit(name, ...args) {
      const l = handlers.get(name);
      if (!l) return;
      for (const fn of l.slice()) fn(...args);
    },
  };
}
