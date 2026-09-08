export const icon = (name: string) => {
  const paths: Record<string, string> = {
    inspect:
      '<circle cx="13" cy="13" r="8"/><path d="m19 19 10 10M13 9v8m-4-4h8"/>',
    menu: '<path d="M5 9h22M5 16h22M5 23h22"/>',
    cable:
      '<path d="M3 6h26M9 6v6m14-6v6"/><rect x="6" y="12" width="20" height="14" rx="5"/><path d="M11 16h10v5H11z"/>',
    span: '<path d="M3 23V9m26 14V9M3 12h26M3 17c7-6 19-6 26 0M8 12v10m8-10v10m8-10v10M2 27q4-3 8 0t8 0t8 0"/>',
    express:
      '<path d="M3 25Q16-2 29 25M5 25h4m14 0h4"/><path d="m18 5-7 12h7l-4 10"/>',
    signal:
      '<rect x="10" y="3" width="12" height="23" rx="5"/><circle cx="16" cy="9" r="2"/><circle cx="16" cy="16" r="2"/><path d="M16 26v4"/>',
    roundabout:
      '<path d="M24 9a10 10 0 1 0 2 11M24 3v7h-7"/><circle cx="16" cy="16" r="3"/>',
    erase:
      '<path d="m4 20 12-14a3 3 0 0 1 4 0l8 7a3 3 0 0 1 0 4l-10 11H11zM10 14l12 10M18 28h12"/>',
    pause: '<path d="M12 8v16m8-16v16"/>',
    play: '<path d="m11 7 14 9-14 9z"/>',
    sound: '<path d="M4 12h6l8-6v20l-8-6H4zM23 10q7 6 0 12M23 5q12 11 0 22"/>',
    mute: '<path d="M4 12h6l8-6v20l-8-6H4zM23 12l7 8m0-8-7 8"/>',
    help: '<circle cx="16" cy="16" r="12"/><path d="M12 12a4 4 0 1 1 6 3q-2 1-2 4M16 23h.01"/>',
    leaf: '<path d="M7 24C-1 10 17 3 27 5c1 17-6 24-17 18M8 27l12-14"/>',
    close: '<path d="m8 8 16 16M24 8 8 24"/>',
  };
  return `<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] ?? paths.cable}</svg>`;
};
