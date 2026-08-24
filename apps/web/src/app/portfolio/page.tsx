import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/app-shell';
import { PlayerPhoto } from '@/components/player-photo';
import { countryFlag } from '@/lib/flags';
import { formatCurrency, leagueLabel, positionCode, trend } from '@/lib/format';
import { freshness } from '@/lib/freshness';
import { elapsedIn, getTranslator, type Translate } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

/**
 * GBM PORTFOLIO — relationship management, not discovery.
 *
 * Discover answers "who should we look at". This answers "how is our player
 * doing, and does anything need me today". So the card leads with recognition
 * — face, name, club — then the handful of facts an agent acts on: contract
 * runway, who at GBM is responsible, the last match, and when the platform
 * last checked. Statistics live on the profile; putting them here would turn
 * a client list back into a database.
 */

interface Row {
  player_id: string;
  status: string;
  full_name: string;
  age: number | null;
  is_minor: boolean | null;
  guardian_consent: boolean | null;
  guardian_documented: boolean | null;
  nationality: string | null;
  primary_position: string | null;
  club_name: string | null;
  league_name: string | null;
  market_value: number | null;
  value_change_12m_pct: number | null;
  contract_expires_on: string | null;
  contract_months_remaining: number | null;
  portrait_url: string | null;
  assigned_staff_name: string | null;
  representation_start: string | null;
  latest_match_at: string | null;
  latest_opponent: string | null;
  latest_result: string | null;
  latest_minutes: number | null;
  latest_goals: number | null;
  latest_assists: number | null;
  availability: string | null;
  last_checked_at: string | null;
  caches_refreshed_at: string | null;
  news_last_7d: number | null;
}

const STATUS_KEY = {
  REPRESENTED: 'port.status.represented',
  IN_DISCUSSION: 'port.status.discussion',
  FORMER: 'port.status.former',
  REVIEW_QUEUE: 'port.status.review',
} as const;

/**
 * What an agent should notice about this player today.
 *
 * `availability` is passed through untranslated on purpose: it is live text
 * from the intelligence pipeline (an injury note, a suspension), not a fixed
 * label, and inventing a translation for a source string would misreport it.
 */
function alerts(r: Row, t: Translate): string[] {
  const out: string[] = [];
  if (r.contract_months_remaining !== null && r.contract_months_remaining <= 6) {
    out.push(t('port.alert.contractEnds', { months: r.contract_months_remaining }));
  }
  if (r.availability) out.push(r.availability);
  if (r.status === 'REVIEW_QUEUE') out.push(t('port.alert.unverified'));
  // Being under 18 is not itself something to act on — missing consent is.
  // Once consent is recorded the card says so quietly instead of warning,
  // and the minor's status is still visible from the age beside the name.
  if (r.is_minor && !r.guardian_consent) out.push(t('port.alert.minor'));
  return out;
}

export default async function PortfolioPage() {
  const supabase = await createClient();
  const { t } = await getTranslator();

  const [{ data, error }, { data: canManage }] = await Promise.all([
    supabase
      .from('v_gbm_portfolio')
      .select('*')
      .order('status')
      .order('full_name'),
    supabase.rpc('gbm_can_manage_portfolio'),
  ]);

  if (error) console.error(`[portfolio] read failed — ${error.message}`);
  const rows = (data ?? []) as Row[];
  const represented = rows.filter((r) => r.status === 'REPRESENTED');
  const other = rows.filter((r) => r.status !== 'REPRESENTED');

  return (
    <AppShell eyebrow={t('nav.group.gbm')} title={t('port.title')}>
      <div className="px-4 md:px-6 pt-3 flex items-start justify-between gap-4">
        <p className="text-xs leading-relaxed max-w-2xl" style={{ color: 'var(--muted)' }}>
          {t('port.intro')}
        </p>
        {canManage === true && (
          <Link
            href="/portfolio/new"
            className="shrink-0 px-3 py-2 rounded-[4px] text-sm font-semibold"
            style={{ background: 'var(--color-gbm)', color: '#14100A' }}
          >
            {t('port.addPlayer')}
          </Link>
        )}
      </div>

      {rows.length > 0 && (
        <section className="px-4 md:px-6 mt-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Summary
              label={t('port.summary.represented')}
              value={represented.length.toLocaleString('en-GB')}
            />
            <Summary
              label={t('port.summary.value')}
              value={formatCurrency(
                rows.reduce((sum, r) => sum + (r.market_value ?? 0), 0) || null,
              )}
              hint={t('port.summary.valueHint', {
                known: rows.filter((r) => r.market_value !== null).length,
                total: rows.length,
              })}
            />
            <Summary
              label={t('port.summary.attention')}
              value={String(rows.filter((r) => alerts(r, t).length > 0).length)}
              accent
            />
            <Summary
              label={t('port.summary.expiring')}
              value={String(
                rows.filter(
                  (r) => r.contract_months_remaining !== null && r.contract_months_remaining <= 6,
                ).length,
              )}
              accent
            />
          </div>
        </section>
      )}

      {rows.length === 0 ? (
        <section className="px-4 md:px-6 pt-6">
          <div className="card p-8 max-w-xl mx-auto text-center">
            <h2 className="text-lg font-bold tracking-tight">{t('port.empty.title')}</h2>
            <p className="text-sm mt-2 leading-relaxed" style={{ color: 'var(--muted)' }}>
              {t('port.empty.body')}
            </p>
          </div>
        </section>
      ) : (
        <>
          <Group
            title={t('port.group.represented')}
            count={represented.length}
            rows={represented}
            t={t}
            canManage={canManage === true}
          />
          {other.length > 0 && (
            <Group
              title={t('port.group.other')}
              count={other.length}
              rows={other}
              subtitle={t('port.group.otherSub')}
              t={t}
              canManage={canManage === true}
            />
          )}
        </>
      )}
      <div className="h-8" />
    </AppShell>
  );
}

/** One headline number. The portfolio is small; these are read, not scanned. */
function Summary({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: boolean;
}) {
  const isZero = value === '0';
  return (
    <div className="card p-4">
      <p
        className="data text-2xl font-bold tracking-tight"
        style={accent && !isZero ? { color: 'var(--color-gbm)' } : undefined}
      >
        {value}
      </p>
      <p className="eyebrow mt-1">{label}</p>
      {hint && (
        <p className="text-[0.6875rem] mt-0.5" style={{ color: 'var(--muted)' }}>
          {hint}
        </p>
      )}
    </div>
  );
}

function Group({
  title,
  subtitle,
  count,
  rows,
  t,
  canManage,
}: {
  title: string;
  subtitle?: string;
  count: number;
  rows: Row[];
  t: Translate;
  canManage: boolean;
}) {
  return (
    <section className="px-4 md:px-6 mt-5">
      <div className="mb-2">
        <h2 className="text-[0.9375rem] font-semibold tracking-tight">
          {title} <span className="data" style={{ color: 'var(--muted)' }}>{count}</span>
        </h2>
        {subtitle && <p className="text-xs" style={{ color: 'var(--muted)' }}>{subtitle}</p>}
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {rows.map((r) => (
          <PortfolioCard key={r.player_id} r={r} t={t} canManage={canManage} />
        ))}
      </div>
    </section>
  );
}

function PortfolioCard({ r, t, canManage }: { r: Row; t: Translate; canManage: boolean }) {
  const flag = countryFlag(r.nationality);
  const move = r.value_change_12m_pct !== null ? trend(r.value_change_12m_pct) : null;
  const notes = alerts(r, t);
  const checked = freshness(r.last_checked_at ?? r.caches_refreshed_at, {
    never: t('common.neverChecked'),
    elapsed: elapsedIn(t),
    format: (e) => t('common.checkedAgo', { when: e }),
  });

  /* How much of this record is still empty. Shown rather than hidden: the
     point of the portfolio is knowing what GBM does and does not hold. */
  const missing = [
    r.club_name,
    r.market_value,
    r.contract_months_remaining,
    r.age,
    r.nationality,
    r.portrait_url,
  ].filter((v) => v === null || v === undefined).length;

  return (
    /* A "stretched link": the whole card is clickable via an overlay, so the
       edit control can sit in normal flow in the footer instead of floating
       over the player's name. Nesting an <a> inside an <a> is invalid, and
       absolute-positioning the edit button on top covered the one field the
       card exists to show — visibly so in Georgian, where "დეტალების
       რედაქტირება" is twice the length of "Edit details". */
    <div className="card card-interactive p-4 relative">
      <Link
        href={`/players/${r.player_id}`}
        className="absolute inset-0 z-[1] rounded-[inherit]"
        aria-label={r.full_name}
      />
      <div className="flex items-start gap-3">
        <PlayerPhoto src={r.portrait_url} name={r.full_name} size={64} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-[0.9375rem] truncate">{r.full_name}</p>
            {r.status !== 'REPRESENTED' && (
              <span className="badge">
                {r.status in STATUS_KEY ? t(STATUS_KEY[r.status as keyof typeof STATUS_KEY]) : r.status}
              </span>
            )}
          </div>
          <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--muted)' }}>
            {r.club_name ?? t('common.clubUnknown')}
            {r.league_name ? ` · ${leagueLabel(r.league_name) ?? r.league_name}` : ''}
          </p>
          <p className="text-xs mt-1 data" style={{ color: 'var(--muted)' }}>
            {positionCode(r.primary_position)}
            {r.age !== null ? ` · ${r.age}y` : ''}
            {flag ? ` · ${flag}` : ''} {r.nationality ?? ''}
          </p>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <div>
          <p className="eyebrow">{t('common.value')}</p>
          <p className="data text-sm font-semibold">
            {formatCurrency(r.market_value)}
            {move && <span className={`ml-1.5 text-xs ${move.className}`}>{move.text}</span>}
          </p>
        </div>
        <div className="text-right">
          <p className="eyebrow">{t('common.contract')}</p>
          <p className="data text-sm font-semibold">
            {r.contract_months_remaining !== null
              ? t('common.months', { count: r.contract_months_remaining })
              : t('common.none')}
          </p>
        </div>
        <div className="text-right">
          <p className="eyebrow">{t('port.responsible')}</p>
          <p className="text-sm font-semibold truncate max-w-[9rem]">
            {r.assigned_staff_name ?? t('port.unassigned')}
          </p>
        </div>
      </div>

      <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
        <p className="eyebrow mb-1">{t('port.lastMatch')}</p>
        {r.latest_match_at ? (
          <p className="text-xs" style={{ color: 'var(--muted)' }}>
            {new Date(r.latest_match_at).toLocaleDateString('en-GB', {
              day: 'numeric',
              month: 'short',
            })}
            {r.latest_opponent ? ` · ${r.latest_opponent}` : ''}
            {r.latest_result ? ` · ${r.latest_result}` : ''}
            {r.latest_minutes !== null ? ` · ${r.latest_minutes}'` : ''}
            {r.latest_goals ? ` · ${r.latest_goals}G` : ''}
            {r.latest_assists ? ` · ${r.latest_assists}A` : ''}
          </p>
        ) : (
          <p className="text-xs" style={{ color: 'var(--muted)' }}>
            {t('port.noMatchData')}
          </p>
        )}
      </div>

      {notes.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {notes.map((n) => (
            <li key={n} className="badge badge-alert">{n}</li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex items-end justify-between gap-3">
        <p className="eyebrow" style={{ color: 'var(--muted)' }}>
          {checked.label}
          {missing > 0 && ` · ${t('port.incomplete', { count: missing })}`}
          {/* Stated quietly rather than badged: it is the absence of consent
              that needs attention, not its presence. */}
          {r.is_minor && r.guardian_consent && ` · ${t('port.consentHeld')}`}
        </p>
        {canManage && (
          <Link
            href={`/players/${r.player_id}/edit`}
            className="relative z-[2] shrink-0 px-2 py-1 rounded-[4px] text-[0.6875rem] font-semibold whitespace-nowrap"
            style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--muted)' }}
          >
            {t('port.editPlayer')}
          </Link>
        )}
      </div>
    </div>
  );
}
