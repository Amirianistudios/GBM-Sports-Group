'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

/**
 * Creating a GBM player.
 *
 * Authority is never decided here. Every write goes through the signed-in
 * user's own client, so RLS decides: `players_manage` and `gbm_portfolio_write`
 * admit OWNER and EXECUTIVE_DIRECTOR, and `player_guardians_write` admits the
 * same two. A scout who reaches this action by any route gets a database
 * refusal, not a hidden button.
 *
 * Only a name is required. An agency knows a player long before it knows his
 * height, and demanding fields nobody has yet is how real records get filled
 * with invented ones.
 */

function text(form: FormData, key: string): string | null {
  const v = form.get(key);
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t === '' ? null : t;
}

function int(form: FormData, key: string): number | null {
  const t = text(form, key);
  if (t === null) return null;
  const n = Number.parseInt(t.replace(/[^0-9-]/g, ''), 10);
  return Number.isFinite(n) ? n : null;
}

/** Euro millions in the form, integer euros in the database. */
function euros(form: FormData, key: string): number | null {
  const t = text(form, key);
  if (t === null) return null;
  const n = Number.parseFloat(t.replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? Math.round(n * 1_000_000) : null;
}

/** The column is a constrained enum; anything unrecognised stays unset. */
function foot(form: FormData): 'LEFT' | 'RIGHT' | 'BOTH' | undefined {
  const v = form.get('foot');
  return v === 'LEFT' || v === 'RIGHT' || v === 'BOTH' ? v : undefined;
}

/** The column is an array; one typed position is still an array of one. */
function secondaryPositions(form: FormData): string[] | null {
  const v = form.get('secondary_position');
  if (typeof v !== 'string' || v.trim() === '') return null;
  return v
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function isMinor(dob: string | null): boolean {
  if (!dob) return false;
  const d = Date.parse(dob);
  if (Number.isNaN(d)) return false;
  return Date.now() - d < 18 * 365.25 * 24 * 3600 * 1000;
}

export interface AddPlayerResult {
  error: string;
}

export async function addPlayer(
  _prev: AddPlayerResult | null,
  form: FormData,
): Promise<AddPlayerResult | null> {
  const supabase = await createClient();

  const fullName = text(form, 'full_name');
  if (!fullName) return { error: 'A full name is required.' };

  const dob = text(form, 'date_of_birth');
  const minor = isMinor(dob);

  // Countries and clubs are referenced by id; resolve what we can by name and
  // leave the rest null rather than inventing a row.
  const nationalityName = text(form, 'nationality');
  const secondNationalityName = text(form, 'second_nationality');
  const clubName = text(form, 'club_name');

  const [{ data: country }, { data: country2 }, { data: club }] = await Promise.all([
    nationalityName
      ? supabase.from('countries').select('id').ilike('name', nationalityName).maybeSingle()
      : Promise.resolve({ data: null }),
    secondNationalityName
      ? supabase.from('countries').select('id').ilike('name', secondNationalityName).maybeSingle()
      : Promise.resolve({ data: null }),
    clubName
      ? supabase.from('clubs').select('id').ilike('name', clubName).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const { data: created, error: playerError } = await supabase
    .from('players')
    .insert({
      full_name: fullName,
      date_of_birth: dob,
      nationality_country_id: country?.id ?? null,
      second_nationality_country_id: country2?.id ?? null,
      primary_position: text(form, 'primary_position'),
      secondary_positions: secondaryPositions(form) ?? undefined,
      height_cm: int(form, 'height_cm'),
      foot: foot(form),
      current_club_id: club?.id ?? null,
      gbm_portrait_url: text(form, 'gbm_portrait_url'),
      gbm_hero_image_url: text(form, 'gbm_hero_image_url'),
      image_credit: text(form, 'image_credit'),
      gbm_status: 'REPRESENTED',
    })
    .select('id')
    .single();

  if (playerError || !created) {
    return {
      error:
        playerError?.message.includes('row-level security') ||
        playerError?.code === '42501'
          ? 'Your role cannot add players. Portfolio management is limited to the owner and executive director.'
          : `Could not create the player — ${playerError?.message ?? 'unknown error'}`,
    };
  }

  const playerId = created.id as string;

  const { error: portfolioError } = await supabase.from('gbm_portfolio').insert({
    player_id: playerId,
    status: (text(form, 'status') ?? 'REPRESENTED') as 'REPRESENTED',
    representation_start: text(form, 'representation_start'),
    assigned_staff_id: text(form, 'assigned_staff_id'),
    verification_note: text(form, 'verification_note') ?? 'Entered by GBM staff.',
    notes: text(form, 'notes'),
  });
  if (portfolioError) {
    return { error: `Player created, but the portfolio entry failed — ${portfolioError.message}` };
  }

  // A recorded market value is a fact with a date, so it goes to market_values
  // where every other valuation lives, not into a loose column.
  const value = euros(form, 'market_value_eur');
  if (value !== null) {
    await supabase.from('market_values').insert({
      player_id: playerId,
      value_amount: value,
      currency: 'EUR',
      valued_on: new Date().toISOString().slice(0, 10),
      provider_code: 'GBM_INTERNAL',
    });
  }

  const contractEnd = text(form, 'contract_expires_on');
  if (contractEnd) {
    await supabase.from('contracts').insert({
      player_id: playerId,
      club_id: club?.id ?? null,
      expires_on: contractEnd,
      status: 'ACTIVE',
      provider_code: 'GBM_INTERNAL',
    });
  }

  // Guardian details only exist for minors, and only management may write them.
  const guardianName = text(form, 'guardian_name');
  if (minor && guardianName) {
    const { error: guardianError } = await supabase.from('player_guardians').insert({
      player_id: playerId,
      guardian_name: guardianName,
      relationship: text(form, 'guardian_relationship'),
      contact_email: text(form, 'guardian_email'),
      contact_phone: text(form, 'guardian_phone'),
      consent_reference: text(form, 'consent_reference'),
      consent_on_file: form.get('consent_on_file') === 'on',
    });
    if (guardianError) {
      return {
        error: `Player added, but the guardian record failed — ${guardianError.message}`,
      };
    }
  }

  revalidatePath('/portfolio');
  redirect(`/players/${playerId}`);
}
