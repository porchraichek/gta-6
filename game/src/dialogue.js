// Subtitled dialogue player used by missions and story beats, plus two-way story choices (Y / N).

const CHOICE_KEYS = [['KeyY', 'Y'], ['KeyN', 'N']];

export function createDialogue(G) {
  const D = { queue: [], current: null, t: 0, busy: false, choice: null };

  D.play = (lines, onDone) => {
    for (const l of lines) if (l) D.queue.push({ speaker: l[0], text: l[1], dur: l[2] });
    D.onDone = onDone;
    D.busy = true;
  };

  D.clear = () => {
    D.queue.length = 0;
    D.current = null;
    D.busy = false;
    G.hud?.hideSubtitle();
    closeChoice();
  };

  // ---- choices: a small panel with two options; resolves with the picked index
  let panel = null;
  function buildPanel(prompt, options) {
    const root = document.getElementById('ui') || document.body;
    panel = document.createElement('div');
    panel.className = 'story-choice';
    Object.assign(panel.style, {
      position: 'absolute', left: '50%', bottom: '21%', transform: 'translateX(-50%)', padding: '14px 20px', zIndex: 30,
      background: 'rgba(10,10,20,0.82)', border: '1px solid rgba(255,209,102,0.55)', borderRadius: '10px',
      color: '#fff', font: '600 16px Arial, sans-serif', textAlign: 'center', minWidth: '360px', pointerEvents: 'auto',
    });
    const head = document.createElement('div');
    head.textContent = prompt;
    Object.assign(head.style, { color: '#ffd166', marginBottom: '10px', letterSpacing: '0.04em' });
    panel.appendChild(head);
    options.forEach((label, i) => {
      const row = document.createElement('div');
      row.innerHTML = `<kbd style="display:inline-block;min-width:22px;padding:2px 6px;margin-right:8px;border-radius:4px;background:#ffd166;color:#111">${CHOICE_KEYS[i][1]}</kbd>`;
      row.appendChild(document.createTextNode(label));
      Object.assign(row.style, { margin: '6px 0', cursor: 'pointer', textAlign: 'left' });
      row.addEventListener('click', () => pick(i));
      panel.appendChild(row);
    });
    root.appendChild(panel);
  }
  function closeChoice() {
    panel?.remove();
    panel = null;
    D.choice = null;
  }
  function pick(i) {
    const c = D.choice;
    if (!c) return;
    closeChoice();
    G.audio?.uiSelect();
    c.cb(i);
  }

  D.choose = (prompt, options, cb) => {
    closeChoice();
    D.choice = { prompt, options, cb };
    buildPanel(prompt, options);
  };
  D.pick = pick; // also used by tests / debug helpers

  D.update = (dt) => {
    if (D.choice) {
      for (let i = 0; i < D.choice.options.length; i++) if (G.input.hit(CHOICE_KEYS[i][0])) { pick(i); break; }
    }
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

  // skip everything queued (debug helpers)
  D.skip = () => {
    D.queue.length = 0;
    D.current = null;
    G.hud?.hideSubtitle();
  };

  return D;
}
