import Link from 'next/link';
import { SourceStripe } from './source-stripe';
import { formatAge, formatCurrency, formatPercent, positionCode } from '@/lib/format';

export interface PlayerRowData {
  player_id: string;
  full_name: string;
  date_of_birth: string | null;
  primary_position: string | null;
  club_name: string | null;
  nationality: string | null;
  market_value: number | null;
  value_change_12m_pct: number | null;
  representation_status: string | null;
  agency_name: string | null;
  contract_months_remaining: number | null;
  source_count?: number;
  /** Current-season counting statistics, when the surface provides them. */
  league_name?: string | null;
  season_apps?: number | null;
  season_minutes?: number | null;
  season_goals?: number | null;
  season_assists?: number | null;
}

/**
 * The teamsheet row. Dense by design: a scout scanning 40 names on a phone
 * needs name, position, age, club and value in one glance, with the source
 * stripe telling them how much to trust it.
 */
export function PlayerRow({ player }: { player: PlayerRowData }) {
  const change = player.value_change_12m_pct;
  const rising = change !== null && change > 0;

  return (
    <Link href={`/players/${player.player_id}`} className="sheet-row">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-[0.9375rem] leading-tight truncate">
              {player.full_name}
            </span>
            {player.representation_status === 'NO_AGENCY_LISTED' && (
              <span className="badge badge-attention">No agency listed</span>
            )}
            {player.representation_status === 'CONFLICTING' && (
              <span className="badge badge-conflict">Sources disagree</span>
            )}
          </div>

          <div className="flex items-center gap-2 mt-1 text-xs" style={{ color: 'var(--muted)' }}>
            <span className="pos-chip">
              {positionCode(player.primary_position)}
              <span aria-hidden="true">·</span>
              <span className="data">{formatAge(player.date_of_birth)}</span>
            </span>
            <span className="truncate">{player.club_name ?? 'Club unknown'}</span>
          </div>

          {player.season_minutes != null && player.season_minutes > 0 && (
            <div className="data flex items-center gap-2 mt-1 text-[0.6875rem]" style={{ color: 'var(--muted)' }}>
              {player.league_name && <span className="truncate max-w-[10rem]">{player.league_name}</span>}
              <span>{player.season_apps ?? 0} apps</span>
              <span>{Number(player.season_minutes).toLocaleString('en-GB')}&#8217;</span>
              <span>{player.season_goals ?? 0}G {player.season_assists ?? 0}A</span>
            </div>
          )}
        </div>

        <div className="text-right shrink-0">
          <div className="data font-semibold text-[0.9375rem] tabular-nums">
            {formatCurrency(player.market_value)}
          </div>
          <div className="flex items-center justify-end gap-1.5 mt-1">
            {change !== null && (
              <span
                className="data text-xs font-medium"
                style={{ color: rising ? 'var(--color-verified-2)' : 'var(--muted)' }}
              >
                {formatPercent(change)}
              </span>
            )}
            <SourceStripe sourceCount={player.source_count ?? 1} label="Market value" />
          </div>
        </div>
      </div>
    </Link>
  );
}
