import React from 'react';

/**
 * OASIS icon set — monoline, 24×24 grid, 1.6 stroke, currentColor.
 * One optical weight across the whole product: no emoji, no mixed metaphors.
 */
const P: Record<string, React.ReactNode> = {
  dashboard: <><rect x="3" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5"/></>,
  building: <><path d="M3 21h18M5 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16M15 21V10h3a2 2 0 0 1 2 2v9"/><path d="M8.5 7h3M8.5 11h3M8.5 15h3" strokeLinecap="round"/></>,
  badge: <><path d="M12 2.6 14.4 5l3.3.2.2 3.3L20.3 11l-2.4 2.4-.2 3.3-3.3.2L12 19.4 9.6 17l-3.3-.2-.2-3.3L3.7 11l2.4-2.4.2-3.3L9.6 5z"/><path d="m9.2 11.4 2 2 3.6-3.8" strokeLinecap="round" strokeLinejoin="round"/></>,
  clipboard: <><path d="M9 4H7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2"/><rect x="9" y="2.5" width="6" height="3.4" rx="1.2"/><path d="M8.6 11h6.8M8.6 15h4.4" strokeLinecap="round"/></>,
  chat: <><path d="M20.5 12.4c0 4-3.8 7.2-8.5 7.2a9.9 9.9 0 0 1-2.6-.34L4.4 21l1.3-3.5A6.9 6.9 0 0 1 3.5 12.4c0-4 3.8-7.2 8.5-7.2s8.5 3.2 8.5 7.2Z" strokeLinejoin="round"/></>,
  bell: <><path d="M18 8.6a6 6 0 1 0-12 0c0 5-2 6.4-2 6.4h16s-2-1.4-2-6.4Z" strokeLinejoin="round"/><path d="M13.7 19a2 2 0 0 1-3.4 0" strokeLinecap="round"/></>,
  box: <><path d="M20.5 7.8 12 3 3.5 7.8v8.4L12 21l8.5-4.8z" strokeLinejoin="round"/><path d="M3.7 7.9 12 12.6l8.3-4.7M12 21v-8.4" strokeLinejoin="round"/></>,
  chart: <><path d="M3 21h18" strokeLinecap="round"/><path d="M6.5 21v-6M11.5 21V8M16.5 21v-9.5M21 21V4.5" strokeLinecap="round"/></>,
  survey: <><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8.4 8h7.2M8.4 12h7.2M8.4 16h4" strokeLinecap="round"/></>,
  lifebuoy: <><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.6"/><path d="m5.6 5.6 3.9 3.9M14.5 14.5l3.9 3.9M18.4 5.6l-3.9 3.9M9.5 14.5l-3.9 3.9"/></>,
  check: <><circle cx="12" cy="12" r="9"/><path d="m8.2 12.2 2.6 2.6 5-5.6" strokeLinecap="round" strokeLinejoin="round"/></>,
  shield: <><path d="M12 2.8 4.5 6v5.4c0 4.6 3.1 8.4 7.5 9.8 4.4-1.4 7.5-5.2 7.5-9.8V6z" strokeLinejoin="round"/><path d="m9 12 2.2 2.2L15.2 10" strokeLinecap="round" strokeLinejoin="round"/></>,
  users: <><circle cx="9.2" cy="8.4" r="3.4"/><path d="M2.8 20a6.4 6.4 0 0 1 12.8 0" strokeLinecap="round"/><path d="M16.2 5.4a3.4 3.4 0 0 1 0 6M17.8 14.4A6.4 6.4 0 0 1 21.2 20" strokeLinecap="round"/></>,
  settings: <><circle cx="12" cy="12" r="3.1"/><path d="M19.6 14.6a1.6 1.6 0 0 0 .32 1.76l.06.06a1.9 1.9 0 1 1-2.7 2.7l-.06-.06a1.6 1.6 0 0 0-1.76-.32 1.6 1.6 0 0 0-.97 1.46v.17a1.9 1.9 0 1 1-3.8 0v-.09a1.6 1.6 0 0 0-1.05-1.46 1.6 1.6 0 0 0-1.76.32l-.06.06a1.9 1.9 0 1 1-2.7-2.7l.06-.06a1.6 1.6 0 0 0 .32-1.76 1.6 1.6 0 0 0-1.46-.97h-.17a1.9 1.9 0 1 1 0-3.8h.09a1.6 1.6 0 0 0 1.46-1.05 1.6 1.6 0 0 0-.32-1.76l-.06-.06a1.9 1.9 0 1 1 2.7-2.7l.06.06a1.6 1.6 0 0 0 1.76.32h.08a1.6 1.6 0 0 0 .97-1.46v-.17a1.9 1.9 0 1 1 3.8 0v.09a1.6 1.6 0 0 0 .97 1.46 1.6 1.6 0 0 0 1.76-.32l.06-.06a1.9 1.9 0 1 1 2.7 2.7l-.06.06a1.6 1.6 0 0 0-.32 1.76v.08a1.6 1.6 0 0 0 1.46.97h.17a1.9 1.9 0 1 1 0 3.8h-.09a1.6 1.6 0 0 0-1.46.97Z" strokeLinejoin="round"/></>,
  plug: <><path d="M9 2.8v5M15 2.8v5" strokeLinecap="round"/><path d="M6.4 7.8h11.2v3.4a5.6 5.6 0 1 1-11.2 0z" strokeLinejoin="round"/><path d="M12 16.8V21" strokeLinecap="round"/></>,
  globe: <><circle cx="12" cy="12" r="9"/><path d="M3.2 12h17.6"/><path d="M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18Z"/></>,
  file: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" strokeLinejoin="round"/><path d="M14 3v5h5M8.6 13h6.8M8.6 16.6h4.4" strokeLinecap="round"/></>,
  power: <><path d="M12 3.4v8.2" strokeLinecap="round"/><path d="M7.2 6.4a7.6 7.6 0 1 0 9.6 0" strokeLinecap="round"/></>,
  menu: <><path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round"/></>,
  search: <><circle cx="11" cy="11" r="6.6"/><path d="m16 16 4.4 4.4" strokeLinecap="round"/></>,
  download: <><path d="M12 3.6v11" strokeLinecap="round"/><path d="m7.6 10.4 4.4 4.4 4.4-4.4" strokeLinecap="round" strokeLinejoin="round"/><path d="M4.4 19.2h15.2" strokeLinecap="round"/></>,
};

export type IconName = keyof typeof P;

export function Icon({ name, size = 18, className, style }: { name: string; size?: number; className?: string; style?: React.CSSProperties }) {
  const d = P[name];
  if (!d) return null;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.6} className={className} style={style} aria-hidden="true" focusable="false">
      {d}
    </svg>
  );
}
