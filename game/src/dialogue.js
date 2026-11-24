// Subtitled dialogue player used by missions and story beats.

export function createDialogue(G) {
  const D = { queue: [], current: null, t: 0, busy: false };

  D.play = (lines, onDone) => {
    for (const l of lines) D.queue.push({ speaker: l[0], text: l[1], dur: l[2] });
    D.onDone = onDone;
    D.busy = true;
  };

  D.clear = () => {
    D.queue.length = 0;
    D.current = null;
    D.busy = false;
    G.hud?.hideSubtitle();
  };

  D.update = (dt) => {
    if (!D.current) {
      if (!D.queue.length) {
        if (D.busy) {
          D.busy = false;
          const cb = D.onDone;
          D.onDone = null;
          cb?.();
        }
        return;
      }
      D.current = D.queue.shift();
      D.t = D.current.dur ?? Math.max(2.4, 1.2 + D.current.text.length * 0.052);
      G.hud?.showSubtitle(D.current.speaker, D.current.text);
      G.audio?.dialogue();
    }
    D.t -= dt;
    if (D.t <= 0 || (G.input.hit('Enter') && D.t < (D.current.dur ?? 3) - 0.6)) {
      D.current = null;
      if (!D.queue.length) G.hud?.hideSubtitle();
    }
  };

  return D;
}
