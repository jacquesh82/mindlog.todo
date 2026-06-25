// Small sidebar glyphs, tinted by the item's colour (falling back to the
// inherited text colour when no colour is set).

interface IconProps {
  color?: string | null;
  className?: string;
}

const base = (color?: string | null) => color ?? 'currentColor';

/** Project — a hash (#), matching the #project Quick Add syntax. */
export function HashIcon({ color, className }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" className={className} fill="none"
      stroke={base(color)} strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
      <path d="M6.2 2.5 4.8 13.5M11.2 2.5 9.8 13.5M2.7 5.6h11M2.3 10.4h11" />
    </svg>
  );
}

/** Label — a price tag with a hole. */
export function TagIcon({ color, className }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" className={className} fill="none"
      stroke={base(color)} strokeWidth="1.4" strokeLinejoin="round" aria-hidden="true">
      <path d="M8.4 2H12.6A1.4 1.4 0 0 1 14 3.4v4.2a1.4 1.4 0 0 1-.41.99l-5.8 5.8a1.2 1.2 0 0 1-1.7 0l-3.9-3.9a1.2 1.2 0 0 1 0-1.7l5.8-5.8A1.4 1.4 0 0 1 8.4 2Z" />
      <circle cx="11" cy="5" r="1.05" fill={base(color)} stroke="none" />
    </svg>
  );
}

/** Filter — a funnel. */
export function FunnelIcon({ color, className }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" className={className} fill="none"
      stroke={base(color)} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2.2 3.2h11.6L9.4 8.6v4.2L6.6 11.3V8.6L2.2 3.2Z" />
    </svg>
  );
}
