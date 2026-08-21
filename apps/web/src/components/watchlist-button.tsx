'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

/**
 * One-tap watchlist toggle. Adds to (or creates) the signed-in user's default
 * watchlist. Deliberately optimistic: a scout tapping this in a stadium should
 * see it register immediately, and a failure explains itself rather than
 * silently reverting.
 */
export function WatchlistButton({ playerId }: { playerId: string }) {
  const [state, setState] = useState<'loading' | 'in' | 'out' | 'saving'>('loading');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from('watchlist_players')
        .select('id')
        .eq('player_id', playerId)
        .limit(1);
      if (!cancelled) setState((data ?? []).length > 0 ? 'in' : 'out');
    })();
    return () => { cancelled = true; };
  }, [playerId]);

  async function toggle() {
    const previous = state;
    setState('saving');
    setError(null);
    const supabase = createClient();

    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error('Your session has expired. Sign in again.');

      if (previous === 'in') {
        const { error } = await supabase.from('watchlist_players').delete().eq('player_id', playerId);
        if (error) throw error;
        setState('out');
        return;
      }

      // Find or create this user's default list.
      const { data: lists } = await supabase.from('watchlists').select('id').limit(1);
      let watchlistId = lists?.[0]?.id;

      if (!watchlistId) {
        const { data: org } = await supabase.from('organizations').select('id').limit(1).maybeSingle();
        const { data: created, error: createError } = await supabase
          .from('watchlists')
          .insert({ name: 'My watchlist', created_by: auth.user.id, organization_id: org?.id ?? null })
          .select('id')
          .single();
        if (createError) throw createError;
        watchlistId = created.id;
      }

      const { error } = await supabase
        .from('watchlist_players')
        .insert({ watchlist_id: watchlistId, player_id: playerId, added_by: auth.user.id });
      if (error) throw error;
      setState('in');
    } catch (e) {
      setState(previous);
      setError(e instanceof Error ? e.message : 'Could not update the watchlist.');
    }
  }

  const inList = state === 'in';

  return (
    <div className="shrink-0 text-right">
      <button
        type="button"
        onClick={toggle}
        disabled={state === 'loading' || state === 'saving'}
        aria-pressed={inList}
        className="px-3 py-2 rounded-[3px] text-sm font-semibold disabled:opacity-50"
        style={{
          background: inList ? 'var(--color-verified)' : 'var(--bg)',
          color: inList ? '#06201C' : 'var(--fg)',
          border: `1px solid ${inList ? 'var(--color-verified)' : 'var(--border)'}`,
        }}
      >
        {state === 'loading' ? '…' : state === 'saving' ? 'Saving' : inList ? 'Watching' : 'Watch'}
      </button>
      {error && (
        <p role="alert" className="text-xs mt-1 max-w-[12rem]" style={{ color: 'var(--color-conflict)' }}>
          {error}
        </p>
      )}
    </div>
  );
}
