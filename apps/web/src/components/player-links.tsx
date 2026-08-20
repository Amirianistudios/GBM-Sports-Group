'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

const KINDS = [
  ['INSTAGRAM', 'Instagram'],
  ['X', 'X / Twitter'],
  ['FACEBOOK', 'Facebook'],
  ['LINKEDIN', 'LinkedIn'],
  ['TIKTOK', 'TikTok'],
  ['YOUTUBE', 'YouTube'],
  ['WEBSITE', 'Official website'],
  ['CLUB_PAGE', 'Club page'],
  ['FEDERATION', 'Federation page'],
  ['OTHER', 'Other'],
] as const;

const KIND_LABEL = new Map<string, string>(KINDS as unknown as [string, string][]);

export interface PlayerLink {
  id: string;
  kind: string;
  url: string;
  label: string | null;
}

/**
 * Official public references, entered by GBM staff by hand. A registry of
 * legitimate URLs — never scraped content, never contact details.
 */
export function PlayerLinks({ playerId, links }: { playerId: string; links: PlayerLink[] }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [kind, setKind] = useState<string>('INSTAGRAM');
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const clean = url.trim();
    if (!/^https?:\/\//i.test(clean)) {
      setError('Enter a full URL starting with https://');
      return;
    }
    setBusy(true);
    setError(null);
    const supabase = createClient();
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error('Your session has expired. Sign in again.');
      const { error } = await supabase
        .from('player_links')
        .insert({ player_id: playerId, kind, url: clean, added_by: auth.user.id });
      if (error) throw error;
      setUrl('');
      setAdding(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the link.');
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    const supabase = createClient();
    const { error } = await supabase.from('player_links').delete().eq('id', id);
    if (error) setError(error.message);
    else router.refresh();
  }

  return (
    <div className="p-4">
      {links.length === 0 && !adding && (
        <p className="text-sm" style={{ color: 'var(--muted)' }}>
          No official references recorded. Add verified public profiles and pages only.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {links.map((l) => (
          <span
            key={l.id}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-[3px] text-sm"
            style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}
          >
            <a href={l.url} target="_blank" rel="noopener noreferrer" className="font-semibold">
              {l.label || KIND_LABEL.get(l.kind) || l.kind}
              <span aria-hidden="true" className="ml-1" style={{ color: 'var(--muted)' }}>↗</span>
            </a>
            <button
              type="button"
              onClick={() => remove(l.id)}
              aria-label={`Remove ${KIND_LABEL.get(l.kind) ?? l.kind} link`}
              className="text-xs"
              style={{ color: 'var(--muted)' }}
            >
              ✕
            </button>
          </span>
        ))}
      </div>

      {adding ? (
        <form onSubmit={add} className="mt-3 flex flex-wrap gap-2 items-center">
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            aria-label="Link type"
            className="px-2 py-2 text-sm rounded-[3px]"
            style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--fg)' }}
          >
            {KINDS.map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://…"
            aria-label="Link URL"
            className="flex-1 min-w-[12rem] px-3 py-2 text-sm rounded-[3px] data"
            style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--fg)' }}
          />
          <button
            type="submit"
            disabled={busy}
            className="px-3 py-2 rounded-[3px] text-sm font-semibold disabled:opacity-50"
            style={{ background: 'var(--color-verified)', color: '#fff' }}
          >
            {busy ? 'Saving…' : 'Add'}
          </button>
          <button type="button" onClick={() => setAdding(false)} className="text-xs font-semibold px-2 py-2" style={{ color: 'var(--muted)' }}>
            Cancel
          </button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="mt-3 text-xs font-semibold"
          style={{ color: 'var(--color-verified-2)' }}
        >
          + Add official link
        </button>
      )}

      {error && (
        <p role="alert" className="text-xs mt-2" style={{ color: 'var(--color-conflict)' }}>{error}</p>
      )}

      <p className="text-xs mt-3 leading-relaxed" style={{ color: 'var(--muted)' }}>
        Official public references only. No contact details, no scraped content.
      </p>
    </div>
  );
}
