import Link from 'next/link';
import { PlayerPhoto } from './player-photo';
import { countryFlag } from '@/lib/flags';
import {
  contractRunway,
  formatCurrency,
  formatMinutes,
  leagueLabel,
  positionCode,
  signalLabel,
  statusLabel,
  trend,
} from '@/lib/format';

/**
 * One row of v_player_discovery — the shared contract for the card (grid)
 * and the row (list). Everything shown comes from this row; a missing field
 * simply doesn't render. Nothing is estimated, padded or invented.
 */
export interface PlayerCardData {
  player_id: string;
  full_name: string;
  image_url?: string | null;
  age?: number | null;
  primary_position?: string | null;
  nationality?: string | null;
  club_name?: string | null;
  league_name?: string | null;
  market_value?: number | null;
  value_change_12m_pct?: number | null;
  contract_months_remaining?: number | null;
  season_apps?: number | null;
  season_minutes?: number | null;
  season_goals?: number | null;
  season_assists?: number | null;
  top_signal_type?: string | null;
  gbm_status?: string | null;
  representation_status?: string | null;
  season_name?: string | null;
  /** GBM opportunity model score (0–100) — the agency's own number. */
  gbm_opportunity?: number | null;
}

/**
 * A value change worth interrupting the eye for. Small drifts are noise on a
 * card; ±25% in a year is the kind of move an agent asks about.
 */
function bigMove(t: ReturnType<typeof trend>): boolean {
  if (!t) return false;
  const pct = Number.parseFloat(t.text.replace(/[^0-9.-]/g, ''));
  return Number.isFinite(pct) && Math.abs(pct) >= 25;
}

function GbmBadge({ status }: { status: string | null }) {
  if (!status || status === 'NONE' || status === 'UNTRACKED') return null;
  return <span className="badge badge-gbm">GBM · {statusLabel(status)}</span>;
}

/** Grid card: compact identity-first card — many per row, seconds to read. */
export function PlayerCard({ player, priority = false }: { player: PlayerCardData; priority?: boolean }) {
  const t = trend(player.value_change_12m_pct);
  const runway = contractRunway(player.contract_months_remaining);
  const flag = countryFlag(player.nationality);

  return (
    <Link
      href={`/players/${player.player_id}`}
      className="card card-interactive block p-3"
      aria-label={player.full_name}
    >
      {/* Recognition first. The face is the largest thing on the card, and the
          rest is the four facts an agent actually reads at a glance: who,
          where, what he costs, whether he fits. Signal names, minutes and
          per-90s live on the profile — a card carrying fifteen fields is a
          spreadsheet row with a photograph stuck to it. */}
      <div className="flex items-start gap-3">
        <PlayerPhoto src={player.image_url ?? null} name={player.full_name} size={72} priority={priority} />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-[0.9375rem] leading-snug truncate">{player.full_name}</p>
          <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>
            {[
              positionCode(player.primary_position),
              player.age != null ? `${Math.floor(Number(player.age))}` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
          <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--muted)' }}>
            {player.club_name ?? 'Club unknown'}
          </p>
          {(flag || player.nationality) && (
            <p className="text-xs mt-0.5 truncate flex items-center gap-1.5" style={{ color: 'var(--muted)' }}>
              {flag && <span className="flag" aria-hidden="true">{flag}</span>}
              <span className="truncate">{player.nationality ?? ''}</span>
            </p>
          )}
        </div>
      </div>

      <div
        className="mt-3 pt-2.5 flex items-baseline justify-between gap-2"
        style={{ borderTop: '1px solid var(--border)' }}
      >
        <span className="data text-[0.9375rem] font-semibold">
          {formatCurrency(player.market_value)}
        </span>
        {player.gbm_opportunity != null && (
          <span className="opportunity text-xs" title="GBM opportunity score">
            fit {Math.round(Number(player.gbm_opportunity))}
          </span>
        )}
      </div>

      {/* Only what changes a decision: that GBM represents him, or that his
          contract is nearly up, or that his value has moved sharply. */}
      {(runway?.urgent || (player.gbm_status && player.gbm_status !== 'NONE') || bigMove(t)) && (
        <div className="mt-2 flex flex-wrap gap-1">
          <GbmBadge status={player.gbm_status ?? null} />
          {runway?.urgent && <span className="badge badge-attention">{runway.text}</span>}
          {bigMove(t) && t && (
            <span className={`data text-xs font-semibold self-center ${t.className}`}>
              <span aria-hidden="true">{t.glyph}</span> {t.text}
            </span>
          )}
        </div>
      )}
    </Link>
  );
}

/** List row: the high-volume scouting view — denser than the card, same data. */
export function PlayerListRow({ player }: { player: PlayerCardData }) {
  const t = trend(player.value_change_12m_pct);
  const runway = contractRunway(player.contract_months_remaining);
  const flag = countryFlag(player.nationality);
  const signal = signalLabel(player.top_signal_type);
  const hasSeason = player.season_minutes !== null && player.season_minutes !== undefined;

  return (
    <Link href={`/players/${player.player_id}`} className="sheet-row">
      <div className="flex items-center gap-3">
        <PlayerPhoto src={player.image_url ?? null} name={player.full_name} size={40} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-[0.9375rem] truncate">{player.full_name}</span>
            <GbmBadge status={player.gbm_status ?? null} />
            {player.representation_status === 'NO_AGENCY_LISTED' && (
              <span className="badge badge-attention">No agency listed</span>
            )}
          </div>
          <div className="flex items-center gap-x-2 gap-y-0.5 flex-wrap mt-0.5 text-xs" style={{ color: 'var(--muted)' }}>
            <span className="pos-chip">
              {positionCode(player.primary_position)}
              {player.age != null && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="data">{Number(player.age).toFixed(1)}</span>
                </>
              )}
            </span>
            {flag && <span className="flag" aria-hidden="true">{flag}</span>}
            <span className="truncate">{player.club_name ?? 'Club unknown'}</span>
            {hasSeason && (
              <span className="data hidden sm:inline">
                {player.league_name ? `${leagueLabel(player.league_name)} · ` : ''}
                {player.season_apps != null ? `${player.season_apps} apps · ` : ''}
                {formatMinutes(player.season_minutes)}
                {player.season_goals != null ? ` · ${player.season_goals}G ${player.season_assists ?? 0}A` : ''}
              </span>
            )}
            {signal && <span className="badge badge-neutral hidden md:inline-flex">{signal}</span>}
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="data text-[0.9375rem] font-semibold">{formatCurrency(player.market_value)}</p>
          <p className="text-[0.6875rem] mt-0.5 flex items-center justify-end gap-1.5">
            {t && (
              <span className={`data font-semibold ${t.className}`}>
                <span aria-hidden="true">{t.glyph}</span> {t.text}
              </span>
            )}
            {runway?.urgent && (
              <span className="data" style={{ color: 'var(--color-attention-2)' }}>{runway.text}</span>
            )}
            {player.gbm_opportunity != null && (
              <span className="opportunity" title="GBM opportunity score">
                fit {Math.round(Number(player.gbm_opportunity))}
              </span>
            )}
          </p>
        </div>
      </div>
    </Link>
  );
}
