import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/app-shell';
import { getTranslator } from '@/lib/i18n';
import { EditForm } from './edit-form';

export const dynamic = 'force-dynamic';

/**
 * EDIT PLAYER — the surface that lets GBM keep its own record right.
 *
 * The page is only a loader and a guard. It reads the player as they stand,
 * hands the form finished strings, and lets RLS have the final word on the
 * write: `gbm_can_manage_portfolio()` is checked here so a scout sees the
 * profile instead of a form they cannot submit, but the database refuses the
 * write regardless of what the interface shows.
 */
export default async function EditPlayerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { t } = await getTranslator();

  const [{ data: canManage }, { data: player }, { data: portfolio }] = await Promise.all([
    supabase.rpc('gbm_can_manage_portfolio'),
    supabase
      .from('players')
      // One string literal, not a concatenation: the client infers the row
      // type from the literal, and a `+` join collapses it to an error type.
      .select('id, full_name, date_of_birth, primary_position, height_cm, foot, gbm_portrait_url, gbm_hero_image_url, image_credit, current_club_id, nationality_country_id')
      .eq('id', id)
      .maybeSingle(),
    supabase
      .from('gbm_portfolio')
      .select('representation_start, notes')
      .eq('player_id', id)
      .maybeSingle(),
  ]);

  if (!player) notFound();
  // Not an error page: a scout who follows the link simply lands on the
  // profile, which is the page they are allowed to see.
  if (canManage !== true) redirect(`/players/${id}`);

  // Club and country are ids on the player; the form edits them by name.
  const [{ data: club }, { data: country }, { data: value }, { data: contract }] = await Promise.all([
    player.current_club_id
      ? supabase.from('clubs').select('name').eq('id', player.current_club_id).maybeSingle()
      : Promise.resolve({ data: null }),
    player.nationality_country_id
      ? supabase.from('countries').select('name').eq('id', player.nationality_country_id).maybeSingle()
      : Promise.resolve({ data: null }),
    // GBM's own last valuation, not a provider's — this form edits GBM's number.
    supabase
      .from('market_values')
      .select('value_amount')
      .eq('player_id', id)
      .eq('provider_code', 'GBM_INTERNAL')
      .order('valued_on', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('contracts')
      .select('expires_on')
      .eq('player_id', id)
      .eq('provider_code', 'GBM_INTERNAL')
      .maybeSingle(),
  ]);

  const euros = value?.value_amount as number | null | undefined;

  return (
    <AppShell eyebrow={player.full_name} title={t('edit.title')}>
      <EditForm
        values={{
          player_id: player.id as string,
          full_name: (player.full_name as string) ?? '',
          date_of_birth: (player.date_of_birth as string) ?? '',
          nationality: country?.name ?? '',
          primary_position: (player.primary_position as string) ?? '',
          height_cm: player.height_cm ? String(player.height_cm) : '',
          foot: (player.foot as string) ?? '',
          club_name: club?.name ?? '',
          market_value_eur: euros ? String(euros / 1_000_000) : '',
          contract_expires_on: (contract?.expires_on as string) ?? '',
          representation_start: (portfolio?.representation_start as string) ?? '',
          notes: (portfolio?.notes as string) ?? '',
          gbm_portrait_url: (player.gbm_portrait_url as string) ?? '',
          gbm_hero_image_url: (player.gbm_hero_image_url as string) ?? '',
          image_credit: (player.image_credit as string) ?? '',
        }}
        labels={{
          intro: t('edit.intro'),
          identity: t('edit.section.identity'),
          football: t('edit.section.football'),
          representation: t('edit.section.representation'),
          media: t('edit.section.media'),
          mediaNote: t('edit.mediaNote'),
          saved: t('edit.saved'),
          savedPartial: t('edit.savedPartial'),
          fullName: t('edit.fullName'),
          dob: t('edit.dob'),
          nationality: t('common.nationality'),
          position: t('common.position'),
          height: t('edit.height'),
          foot: t('edit.foot'),
          footLeft: t('edit.footLeft'),
          footRight: t('edit.footRight'),
          footBoth: t('edit.footBoth'),
          club: t('common.club'),
          marketValue: t('edit.marketValue'),
          contractExpires: t('edit.contractExpires'),
          repStart: t('edit.repStart'),
          notes: t('edit.notes'),
          portraitUrl: t('edit.portraitUrl'),
          heroUrl: t('edit.heroUrl'),
          imageCredit: t('edit.imageCredit'),
          save: t('common.save'),
          cancel: t('common.cancel'),
        }}
      />
    </AppShell>
  );
}
