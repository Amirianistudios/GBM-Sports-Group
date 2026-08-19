/**
 * SOURCE STRIPE — the signature element of GBM Intelligence.
 *
 * One tick per contributing provider, coloured by agreement state. It answers
 * the question a scout should ask of every number on screen: how many sources
 * say this, and do they agree?
 *
 *   teal  (verified) — 2+ independent providers agree
 *   ochre (single)   — exactly one provider reports it
 *   brick (conflict) — providers disagree; GBM shows both, picks neither
 */

export type SourceState = 'verified' | 'single' | 'conflict' | 'none';

export function sourceState(sourceCount: number, hasConflict = false): SourceState {
  if (hasConflict) return 'conflict';
  if (sourceCount >= 2) return 'verified';
  if (sourceCount === 1) return 'single';
  return 'none';
}

export function SourceStripe({
  sourceCount,
  hasConflict = false,
  max = 4,
  label,
}: {
  sourceCount: number;
  hasConflict?: boolean;
  max?: number;
  label?: string;
}) {
  const state = sourceState(sourceCount, hasConflict);
  const filled = Math.min(sourceCount, max);

  const description = hasConflict
    ? `${sourceCount} sources, and they disagree`
    : sourceCount === 0
      ? 'No source recorded'
      : sourceCount === 1
        ? '1 source — unconfirmed'
        : `${sourceCount} sources agree`;

  return (
    <span className="source-stripe" title={label ? `${label}: ${description}` : description}>
      <span className="sr-only">{description}</span>
      {Array.from({ length: max }).map((_, i) => (
        <span
          key={i}
          className="source-tick"
          data-state={i < filled ? state : undefined}
          aria-hidden="true"
        />
      ))}
    </span>
  );
}

export function ProvenanceBadge({
  state,
  children,
}: {
  state: SourceState;
  children: React.ReactNode;
}) {
  const cls =
    state === 'verified'
      ? 'badge badge-verified'
      : state === 'conflict'
        ? 'badge badge-conflict'
        : state === 'single'
          ? 'badge badge-attention'
          : 'badge badge-neutral';
  return <span className={cls}>{children}</span>;
}
