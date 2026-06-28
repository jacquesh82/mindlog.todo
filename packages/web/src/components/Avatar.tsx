/** User avatar: shows the image when set, otherwise an initials circle. */
export function Avatar({
  name,
  avatarUrl,
  size = 28,
}: {
  name: string | null | undefined;
  avatarUrl: string | null | undefined;
  size?: number;
}) {
  const box = { width: size, height: size };
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt=""
        style={box}
        className="shrink-0 rounded-full border border-line object-cover"
      />
    );
  }
  const initial = (name ?? '?').trim().charAt(0).toUpperCase() || '?';
  return (
    <span
      style={{ ...box, fontSize: Math.round(size * 0.45) }}
      className="flex shrink-0 items-center justify-center rounded-full bg-brand-soft font-semibold text-brand"
      aria-hidden="true"
    >
      {initial}
    </span>
  );
}
