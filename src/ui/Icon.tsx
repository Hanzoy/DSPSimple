const paths = {
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  play: 'm8 5 11 7-11 7Z',
  pause: 'M8 5v14M16 5v14',
  search: 'M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
  save: 'M5 3h12l4 4v14H3V3h2Zm2 0v6h10V3M7 21v-8h10v8',
  close: 'm6 6 12 12M6 18 18 6',
  trash: 'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7',
  cube: 'm12 2 9 5v10l-9 5-9-5V7l9-5Zm0 10 9-5M12 12 3 7m9 5v10',
  factory: 'M3 21V9l6 4V9l6 4V3h4l2 18H3ZM7 17h1m4 0h1m4 0h1',
  mine: 'm4 20 9-11M3 5c7-4 13-1 18 7l-6-3-4-4-8 0Z',
  blueprint: 'M4 3h16v18H4V3Zm4 5h3v3H8V8Zm5 5h3v3h-3v-3Zm-3-2v4h3',
  arrow: 'M4 12h16m-6-6 6 6-6 6',
  check: 'm5 12 4 4L19 6',
  menu: 'M4 6h16M4 12h16M4 18h16',
} as const;

export function Icon({ name, size = 18 }: { name: keyof typeof paths; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}

export const itemSymbols = ['Fe', 'Cu', 'Fe', 'Cu', 'M', 'G', 'MC', 'PCB', 'EM'];

export function ItemMark({ item }: { item: number }) {
  return <span className={`item-mark item-${item}`} aria-hidden="true">{itemSymbols[item]}</span>;
}
