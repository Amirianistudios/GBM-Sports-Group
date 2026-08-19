import { formatCurrency } from '@/lib/format';

/**
 * Market value history. Inline SVG rather than a charting library: the series
 * is short, the shape is all that matters, and the page must stay fast on a
 * phone with poor signal.
 */
export function ValueChart({
  points,
}: {
  points: Array<{ valued_on: string; value_amount: number }>;
}) {
  if (points.length < 2) {
    return (
      <p className="text-xs px-4 py-6 text-center" style={{ color: 'var(--muted)' }}>
        Not enough valuation history to plot a trend.
      </p>
    );
  }

  const sorted = [...points].sort(
    (a, b) => new Date(a.valued_on).getTime() - new Date(b.valued_on).getTime(),
  );

  const W = 320;
  const H = 88;
  const PAD = 4;

  const values = sorted.map((p) => Number(p.value_amount));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;

  const x = (i: number) => PAD + (i / (sorted.length - 1)) * (W - PAD * 2);
  const y = (v: number) => H - PAD - ((v - min) / span) * (H - PAD * 2);

  const line = sorted.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(Number(p.value_amount)).toFixed(1)}`).join(' ');
  const area = `${line} L${x(sorted.length - 1).toFixed(1)},${H - PAD} L${x(0).toFixed(1)},${H - PAD} Z`;

  const first = values[0];
  const last = values[values.length - 1];
  const rising = last >= first;
  const stroke = rising ? 'var(--color-verified-2)' : 'var(--color-attention-2)';

  return (
    <div className="px-4 py-3">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto"
        role="img"
        aria-label={`Market value from ${formatCurrency(first)} to ${formatCurrency(last)} across ${sorted.length} valuations`}
        preserveAspectRatio="none"
      >
        <path d={area} fill={stroke} opacity="0.10" />
        <path d={line} fill="none" stroke={stroke} strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        <circle cx={x(sorted.length - 1)} cy={y(last)} r="3" fill={stroke} />
      </svg>

      <div className="flex justify-between mt-2 text-xs" style={{ color: 'var(--muted)' }}>
        <span className="data">
          {new Date(sorted[0].valued_on).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })}
          {' · '}
          {formatCurrency(first)}
        </span>
        <span className="data" style={{ color: 'var(--fg)', fontWeight: 600 }}>
          {formatCurrency(last)}
        </span>
      </div>
    </div>
  );
}
