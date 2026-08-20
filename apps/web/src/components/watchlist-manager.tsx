'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { Database } from '@/lib/database.types';
import { WATCHLIST_STATUSES, statusLabel } from '@/lib/format';

type EntryUpdate = Database['public']['Tables']['watchlist_players']['Update'];

export interface Scout {
  id: string;
  full_name: string | null;
  email: string | null;
}

/**
 * Inline workflow controls for one watchlist entry: status, priority,
 * assigned scout, reason. Every change writes immediately through RLS and
 * refreshes the server-rendered list, so the page never holds stale state.
 */
export function WatchlistEntryControls({
  entryId,
  status,
  priority,
  assignedScoutId,
  reason,
  scouts,
}: {
  entryId: string;
  status: string;
  priority: number | null;
  assignedScoutId: string | null;
  reason: string | null;
  scouts: Scout[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reasonDraft, setReasonDraft] = useState(reason ?? '');

  async function update(patch: EntryUpdate) {
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.from('watchlist_players').update(patch).eq('id', entryId);
    if (error) setError(error.message);
    else router.refresh();
    setBusy(false);
  }

  async function remove() {
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.from('watchlist_players').delete().eq('id', entryId);
    if (error) {
      setError(error.message);
      setBusy(false);
    } else {
      router.refresh();
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2" aria-busy={busy}>
      <select
        value={status}
        onChange={(e) => update({ status: e.target.value as EntryUpdate['status'] })}
        disabled={busy}
        aria-label="Status"
        className="px-2 py-1.5 text-xs font-semibold rounded-[3px]"
        style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--fg)' }}
      >
        {/* Keep any legacy value selectable so nothing silently changes. */}
        {!WATCHLIST_STATUSES.includes(status as (typeof WATCHLIST_STATUSES)[number]) && (
          <option value={status}>{statusLabel(status)}</option>
        )}
        {WATCHLIST_STATUSES.map((s) => (
          <option key={s} value={s}>{statusLabel(s)}</option>
        ))}
      </select>

      <select
        value={priority ?? 3}
        onChange={(e) => update({ priority: Number(e.target.value) })}
        disabled={busy}
        aria-label="Priority"
        className="data px-2 py-1.5 text-xs rounded-[3px]"
        style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--fg)' }}
      >
        {[1, 2, 3, 4, 5].map((p) => (
          <option key={p} value={p}>P{p}</option>
        ))}
      </select>

      <select
        value={assignedScoutId ?? ''}
        onChange={(e) => update({ assigned_scout_id: e.target.value || null })}
        disabled={busy}
        aria-label="Assigned scout"
        className="px-2 py-1.5 text-xs rounded-[3px] max-w-[10rem]"
        style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--fg)' }}
      >
        <option value="">Unassigned</option>
        {scouts.map((s) => (
          <option key={s.id} value={s.id}>{s.full_name || s.email || 'Scout'}</option>
        ))}
      </select>

      <input
        value={reasonDraft}
        onChange={(e) => setReasonDraft(e.target.value)}
        onBlur={() => {
          if (reasonDraft !== (reason ?? '')) update({ reason: reasonDraft || null });
        }}
        placeholder="Why this player…"
        aria-label="Reason"
        className="flex-1 min-w-[8rem] px-2 py-1.5 text-xs rounded-[3px]"
        style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--fg)' }}
      />

      <button
        type="button"
        onClick={remove}
        disabled={busy}
        aria-label="Remove from list"
        className="text-xs px-1.5 py-1.5"
        style={{ color: 'var(--muted)' }}
      >
        ✕
      </button>

      {error && (
        <p role="alert" className="text-xs w-full" style={{ color: 'var(--color-conflict)' }}>{error}</p>
      )}
    </div>
  );
}
