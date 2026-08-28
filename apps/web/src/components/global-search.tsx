'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { PlayerPhoto } from './player-photo';
import { formatCurrency, positionCode } from '@/lib/format';

/**
 * GLOBAL SEARCH — from anywhere to any player in two keystrokes.
 *
 * `/` or Cmd/Ctrl+K opens it; typing searches the whole population through
 * the trigram index (measured at ~6ms for a mid-word match, so no throttling
 * theatre is needed beyond a courtesy debounce). Results rank by the GBM
 * opportunity score: when four players share a surname, the one the agency
 * would care about comes first.
 *
 * Labels arrive as finished strings from the server shell, same contract as
 * the navs — this component never learns that translation exists.
 */

export interface SearchLabels {
  button: string;
  placeholder: string;
  empty: string;
  hint: string;
}

interface Hit {
  id: string;
  full_name: string;
  primary_position: string | null;
  cached_league: string | null;
  cached_market_value: number | null;
  image_url: string | null;
  clubs: { name: string } | null;
}

export function GlobalSearch({ labels }: { labels: SearchLabels }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [selected, setSelected] = useState(0);
  const [searched, setSearched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const close = useCallback(() => {
    setOpen(false);
    setQ('');
    setHits([]);
    setSearched(false);
    setSelected(0);
  }, []);

  // `/` and Cmd/Ctrl+K from anywhere; both are ignored while the user is
  // already typing somewhere else, so a `/` inside a note stays a slash.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' ||
          target.isContentEditable);
      if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === '/' && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setOpen(true);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  useEffect(() => {
    clearTimeout(debounce.current);
    const text = q.trim();
    // The too-short case clears through the same timer as a real search: a
    // synchronous setState inside an effect body would cascade a render.
    debounce.current = setTimeout(
      async () => {
        if (text.length < 2) {
          setHits([]);
          setSearched(false);
          return;
        }
        const supabase = createClient();
        const { data } = await supabase
          .from('players')
          .select('id, full_name, primary_position, cached_league, cached_market_value, image_url, clubs(name)')
          .ilike('full_name', `%${text.replaceAll('%', '')}%`)
          .order('cached_opportunity', { ascending: false, nullsFirst: false })
          .limit(8);
        setHits((data ?? []) as unknown as Hit[]);
        setSearched(true);
        setSelected(0);
      },
      text.length < 2 ? 0 : 180,
    );
    return () => clearTimeout(debounce.current);
  }, [q]);

  function onInputKey(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelected((s) => Math.min(s + 1, hits.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelected((s) => Math.max(s - 1, 0));
    } else if (e.key === 'Enter' && hits[selected]) {
      e.preventDefault();
      const id = hits[selected].id;
      close();
      router.push(`/players/${id}`);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={labels.button}
        className="flex items-center gap-2 px-3 rounded-[4px] text-sm shrink-0 min-h-[36px]"
        style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--muted)' }}
      >
        <SearchIcon />
        <span className="hidden lg:inline">{labels.button}</span>
        <kbd
          className="hidden md:inline data text-[0.625rem] px-1 rounded-[3px]"
          style={{ border: '1px solid var(--border-strong)', color: 'var(--muted)' }}
        >
          /
        </kbd>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[60] flex items-start justify-center px-3 pt-[12dvh]"
          role="dialog"
          aria-modal="true"
          aria-label={labels.button}
        >
          {/* Backdrop closes on tap — the panel stops propagation. */}
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            onClick={close}
            className="absolute inset-0 cursor-default"
            style={{ background: 'color-mix(in srgb, var(--bg) 72%, transparent)', backdropFilter: 'blur(2px)' }}
          />
          <div
            className="relative w-full max-w-lg rounded-[8px] overflow-hidden"
            style={{ background: 'var(--surface)', border: '1px solid var(--border-strong)', boxShadow: 'var(--shadow-2)' }}
          >
            <div className="flex items-center gap-2 px-3" style={{ borderBottom: '1px solid var(--border)' }}>
              <SearchIcon />
              <input
                ref={inputRef}
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={onInputKey}
                placeholder={labels.placeholder}
                aria-label={labels.placeholder}
                className="flex-1 min-w-0 py-3.5 text-base bg-transparent outline-none"
                style={{ color: 'var(--fg)' }}
              />
              <kbd
                className="data text-[0.625rem] px-1.5 py-0.5 rounded-[3px] shrink-0"
                style={{ border: '1px solid var(--border)', color: 'var(--muted)' }}
              >
                esc
              </kbd>
            </div>

            {hits.length > 0 ? (
              <ul className="max-h-[50dvh] overflow-y-auto py-1">
                {hits.map((h, i) => (
                  <li key={h.id}>
                    <button
                      type="button"
                      onClick={() => {
                        close();
                        router.push(`/players/${h.id}`);
                      }}
                      onMouseEnter={() => setSelected(i)}
                      className="w-full flex items-center gap-3 px-3 py-2 text-left min-h-[48px]"
                      style={{
                        background:
                          i === selected
                            ? 'color-mix(in srgb, var(--color-verified) 10%, transparent)'
                            : 'transparent',
                      }}
                    >
                      <PlayerPhoto src={h.image_url} name={h.full_name} size={32} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold truncate">{h.full_name}</span>
                        <span className="block text-xs truncate" style={{ color: 'var(--muted)' }}>
                          {[positionCode(h.primary_position), h.clubs?.name, h.cached_league]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      </span>
                      <span className="data text-xs shrink-0" style={{ color: 'var(--muted)' }}>
                        {formatCurrency(h.cached_market_value)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 py-6 text-sm" style={{ color: 'var(--muted)' }}>
                {searched && q.trim().length >= 2 ? labels.empty : labels.hint}
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function SearchIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.8-3.8" />
    </svg>
  );
}
