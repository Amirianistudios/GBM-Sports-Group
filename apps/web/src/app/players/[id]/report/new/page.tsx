import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/app-shell';
import { ReportForm } from './report-form';

export const dynamic = 'force-dynamic';

export default async function NewReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: player } = await supabase
    .from('players')
    .select('id, full_name, primary_position, clubs(name)')
    .eq('id', id)
    .maybeSingle();

  if (!player) notFound();

  const club = Array.isArray(player.clubs) ? player.clubs[0] : player.clubs;

  return (
    <AppShell eyebrow="Scouting report" title={player.full_name}>
      <p className="px-4 md:px-6 pt-3 text-xs leading-relaxed" style={{ color: 'var(--muted)' }}>
        {player.primary_position ?? '—'} · {club?.name ?? 'Club unknown'}. GBM scout opinion is
        stored separately from provider statistics — the two are never mixed.
      </p>
      <div className="surface mx-4 md:mx-6 mt-3">
        <ReportForm playerId={player.id} />
      </div>
      <div className="h-8" />
    </AppShell>
  );
}
