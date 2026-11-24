// Original flat weapon silhouettes for the HUD (inline SVG markup, viewBox 0 0 64 32, side view facing right).

const P = {
  fists: '<path d="M18 10h22a6 6 0 0 1 6 6v4a8 8 0 0 1-8 8H24a8 8 0 0 1-8-8v-8a2 2 0 0 1 2-2zM20 6h6v6h-6zM28 5h6v7h-6zM36 6h6v6h-6z"/>',
  pistol: '<path d="M10 9h44v7H28l-3 3 4 11h-9l-4-12V16h-6z"/><rect x="50" y="6" width="3" height="3"/>',
  smg: '<path d="M4 10h50v6h6v3h-6v1H40l-2 3h-6l2 9h-7l-3-9h-5l-2 4H8l-2-6h11l2-4H4z"/><rect x="33" y="20" width="5" height="11"/>',
  shotgun: '<path d="M2 10h60v5H34v4h-8l-4 2H4l-2-4 10-2V15H2z"/><rect x="34" y="16" width="14" height="4" rx="1"/>',
  rifle: '<path d="M2 11h58v4H40v3h-6l-2 3h-6l-3 2H6l-4-4 14-3v-1H2z"/><rect x="30" y="18" width="5" height="12"/><rect x="26" y="7" width="12" height="3"/>',
  bat: '<path d="M4 18l46-9a6 6 0 0 1 3 11L6 24z"/>',
  knife: '<path d="M4 15h20v6H4zM24 13h4v10h-4zM28 15h26l6 3-6 3H28z"/>',
  grenade: '<circle cx="32" cy="19" r="10"/><rect x="28" y="5" width="8" height="6"/><path d="M36 6h8v3h-8z"/>',
};
const FALLBACK = '<path d="M8 10h44v8H30l-4 12h-9l3-12H8z"/>';

export function weaponIcon(id) {
  return `<svg viewBox="0 0 64 32" aria-hidden="true">${P[id] ?? FALLBACK}</svg>`;
}
