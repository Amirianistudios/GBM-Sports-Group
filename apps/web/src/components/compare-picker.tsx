'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

interface Hit {
  id: string;
  full_name: string;
  primary_position: string | null;
}

/** Adds and removes players from the comparison via the ?ids= URL parameter. */
export function ComparePicker({ selected }: { selected: Array<{ id: string; name: string }> }) {
  const router = useRouter();
  const selectedIds = selected.map((s) => s.id);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [searching, setSearching] = useState(false);

  function navigate(ids: string[]) {
    router.push(ids.length ? `/compare?ids=${ids.join(',')}` : '/compare');
  }

  async function search(e: React.FormEvent) {
    e.preventDefault();
    const text = q.trim();
    if (text.length < 2) return;
    setSearching(true);
    const supabase = createClient();
    const { data } = await supabase
      .from('players')
      .select('id, full_name, primary_position')
      .ilike('full_name', `%${text}%`)
      .order('full_name')
      .limit(8);
    setHits((data ?? []) as Hit[]);
    setNames((prev) => ({
      ...prev,
      ...Object.fromEntries(((data ?? []) as Hit[]).map((h) => [h.id, h.full_name])),
    }));
    setSearching(false);
  }

  function add(id: string) {
    if (selectedIds.includes(id) || selectedIds.length >= 4) return;
    setHits([]);
    setQ('');
    navigate([...selectedIds, id]);
  }

  function remove(id: string) {
    navigate(selectedIds.filter((x) => x !== id));
  }

  return (
    <div className="px-4 md:px-6 pt-3">
      <form onSubmit={search} className="flex gap-2">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={selectedIds.length >= 4 ? 'Four players maximum' : 'Add a player by name'}
          disabled={selectedIds.length >= 4}
          aria-label="Search players to compare"
          className="flex-1 min-w-0 px-3 py-2.5 text-base rounded-[3px] disabled:opacity-50"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--fg)' }}
        />
        <button
          type="submit"
          disabled={searching || selectedIds.length >= 4}
          className="px-3 py-2.5 rounded-[3px] text-sm font-semibold shrink-0 disabled:opacity-50"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--fg)' }}
        >
          {searching ? '…' : 'Search'}
        </button>
      </form>

      {hits.length > 0 && (
        <div className="surface mt-2 overflow-hidden">
          {hits.map((h) => (
            <button
              key={h.id}
              type="button"
              onClick={() => add(h.id)}
              disabled={selectedIds.includes(h.id)}
              className="sheet-row w-full text-left disabled:opacity-40"
            >
              <span className="font-semibold text-sm">{h.full_name}</span>
              <span className="text-xs ml-2" style={{ color: 'var(--muted)' }}>{h.primary_position ?? ''}</span>
            </button>
          ))}
        </div>
      )}

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2">
          {selected.map((s) => (
            <span
              key={s.id}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-[3px] text-xs font-semibold"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
            >
              {names[s.id] ?? s.name}
              <button
                type="button"
                onClick={() => remove(s.id)}
                aria-label={`Remove ${names[s.id] ?? s.name} from comparison`}
                style={{ color: 'var(--muted)' }}
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
