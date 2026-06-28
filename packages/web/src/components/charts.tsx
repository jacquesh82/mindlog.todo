import { arc, area, curveMonotoneX, line, max, pie, scaleLinear } from 'd3';

// Small, dependency-light D3 charts. We use d3 only to compute scales/paths and
// render plain SVG via JSX (no imperative DOM), so they play well with React and
// theme via CSS variables. SVG <text> uses fill="currentColor" + a text-* class
// so colors follow the theme.

export interface Slice {
  label: string;
  value: number;
  color: string;
}

/** Donut chart with a centered headline + sublabel. */
export function DonutChart({
  data,
  size = 168,
  thickness = 30,
  center,
  sub,
}: {
  data: Slice[];
  size?: number;
  thickness?: number;
  center?: string;
  sub?: string;
}) {
  const r = size / 2;
  const a = arc<{ startAngle: number; endAngle: number }>()
    .innerRadius(r - thickness)
    .outerRadius(r)
    .cornerRadius(2)
    .padAngle(0.02);
  const total = data.reduce((s, d) => s + d.value, 0);
  const slices = pie<Slice>().sort(null).value((d) => d.value)(data);

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <g transform={`translate(${r},${r})`}>
        {total === 0 ? (
          <circle r={r - thickness / 2} fill="none" stroke="var(--color-line)" strokeWidth={thickness} />
        ) : (
          slices.map((s, i) => <path key={i} d={a(s) ?? undefined} fill={data[i]!.color} />)
        )}
        {center && (
          <text textAnchor="middle" dy={sub ? '-0.1em' : '0.35em'} fill="currentColor" className="text-ink" style={{ fontSize: 24, fontWeight: 600 }}>
            {center}
          </text>
        )}
        {sub && (
          <text textAnchor="middle" dy="1.4em" fill="currentColor" className="text-muted" style={{ fontSize: 11 }}>
            {sub}
          </text>
        )}
      </g>
    </svg>
  );
}

/** Circular gauge (0–100) with a centered percentage. */
export function Gauge({ value, size = 168, thickness = 16, label }: { value: number; size?: number; thickness?: number; label?: string }) {
  const r = size / 2;
  const a = arc<{ endAngle: number }>()
    .innerRadius(r - thickness)
    .outerRadius(r)
    .cornerRadius(thickness / 2)
    .startAngle(0);
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <g transform={`translate(${r},${r})`}>
        <path d={a({ endAngle: 2 * Math.PI }) ?? undefined} fill="var(--color-line)" />
        <path d={a({ endAngle: (2 * Math.PI * clamped) / 100 }) ?? undefined} fill="var(--color-brand)" />
        <text textAnchor="middle" dy={label ? '-0.05em' : '0.35em'} fill="currentColor" className="text-ink" style={{ fontSize: 26, fontWeight: 600 }}>
          {Math.round(clamped)}%
        </text>
        {label && (
          <text textAnchor="middle" dy="1.5em" fill="currentColor" className="text-muted" style={{ fontSize: 11 }}>
            {label}
          </text>
        )}
      </g>
    </svg>
  );
}

/** Area + line chart over an ordered series (responsive width via viewBox). */
export function AreaChart({ data, width = 560, height = 160 }: { data: { date: string; count: number }[]; width?: number; height?: number }) {
  const m = { top: 10, right: 10, bottom: 22, left: 28 };
  const w = width - m.left - m.right;
  const h = height - m.top - m.bottom;
  const n = Math.max(1, data.length - 1);
  const xs = scaleLinear().domain([0, n]).range([0, w]);
  const ymax = Math.max(1, max(data, (d) => d.count) ?? 1);
  const ys = scaleLinear().domain([0, ymax]).range([h, 0]).nice();

  const ln = line<{ count: number }>().x((_d, i) => xs(i)).y((d) => ys(d.count)).curve(curveMonotoneX);
  const ar = area<{ count: number }>().x((_d, i) => xs(i)).y0(h).y1((d) => ys(d.count)).curve(curveMonotoneX);

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" className="block">
      <g transform={`translate(${m.left},${m.top})`}>
        {ys.ticks(3).map((tick) => (
          <g key={tick}>
            <line x1={0} x2={w} y1={ys(tick)} y2={ys(tick)} stroke="var(--color-line)" strokeWidth={1} />
            <text x={-6} y={ys(tick)} dy="0.32em" textAnchor="end" fill="currentColor" className="text-muted" style={{ fontSize: 9 }}>
              {tick}
            </text>
          </g>
        ))}
        {data.length > 0 && (
          <>
            <path d={ar(data) ?? undefined} fill="var(--color-brand-soft)" />
            <path d={ln(data) ?? undefined} fill="none" stroke="var(--color-brand)" strokeWidth={2} />
            {data.map((d, i) => (
              <circle key={i} cx={xs(i)} cy={ys(d.count)} r={2} fill="var(--color-brand)" />
            ))}
            <text x={0} y={h + 15} fill="currentColor" className="text-muted" style={{ fontSize: 9 }}>
              {data[0]?.date.slice(5)}
            </text>
            <text x={w} y={h + 15} textAnchor="end" fill="currentColor" className="text-muted" style={{ fontSize: 9 }}>
              {data[data.length - 1]?.date.slice(5)}
            </text>
          </>
        )}
      </g>
    </svg>
  );
}
