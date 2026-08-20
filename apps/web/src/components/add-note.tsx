'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

/** Quick internal note on a player. Scout opinion — never mixed into provider data. */
export function AddNote({ playerId }: { playerId: string }) {
  const router = useRouter();
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const text = body.trim();
    if (!text) return;
    setBusy(true);
    setError(null);
    const supabase = createClient();
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error('Your session has expired. Sign in again.');
      const { error } = await supabase
        .from('player_notes')
        .insert({ player_id: playerId, body: text, author_id: auth.user.id });
      if (error) throw error;
      setBody('');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the note.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex gap-2 items-start">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={2}
        placeholder="Add an internal note…"
        aria-label="Add an internal note"
        className="flex-1 min-w-0 px-3 py-2 text-sm rounded-[3px] resize-y"
        style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--fg)' }}
      />
      <button
        type="submit"
        disabled={busy || body.trim() === ''}
        className="px-3 py-2 rounded-[3px] text-sm font-semibold disabled:opacity-50 shrink-0"
        style={{ background: 'var(--color-verified)', color: '#fff' }}
      >
        {busy ? 'Saving…' : 'Save'}
      </button>
      {error && (
        <p role="alert" className="text-xs" style={{ color: 'var(--color-conflict)' }}>{error}</p>
      )}
    </form>
  );
}
