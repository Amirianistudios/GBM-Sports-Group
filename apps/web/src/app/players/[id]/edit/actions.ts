'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

/**
 * Editing a GBM player.
 *
 * The portfolio existed for a while with no way to change anything: a player
 * could be created with a name and a position and then stayed that way, which
 * is why thirteen of fifteen records held nothing else. Nothing external can
 * fill them either — these are youth and lower-league players who are not in
 * any public dataset, and GBM is the only source that actually knows their
 * club, contract and value.
 *
 * Semantics are those of an edit form, not a patch: the form arrives
 * pre-filled with the current record, so what comes back *is* the intended
 * state. A cleared field clears the value rather than being ignored, because
 * "this player has no agent" has to be expressible.
 *
 * Authority is never decided here. Every write goes through the signed-in
 * user's own client and RLS decides — a scout reaching this action by any
 * route gets a database refusal rather than a hidden button.
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

/**
 * The column is a non-null enum, so "not recorded" is `UNKNOWN` rather than
 * NULL — clearing the field has to say "we do not know", not leave the old
 * answer standing.
 */
function foot(form: FormData): 'LEFT' | 'RIGHT' | 'BOTH' | 'UNKNOWN' {
  const v = form.get('foot');
  return v === 'LEFT' || v === 'RIGHT' || v === 'BOTH' ? v : 'UNKNOWN';
}

/**
 * An image URL GBM supplies for its own player. Restricted to https so a
 * `javascript:` or `data:` value can never reach an `<img src>`, and rejected
 * rather than silently dropped so a typo is visible.
 */
function imageUrl(form: FormData, key: string): { value: string | null; error?: string } {
  const raw = text(form, key);
  if (raw === null) return { value: null };
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return { value: null, error: `${key} is not a valid URL` };
  }
  if (parsed.protocol !== 'https:') {
    return { value: null, error: `${key} must be an https:// address` };
  }
  return { value: parsed.toString() };
}

export interface EditPlayerResult {
  error?: string;
  saved?: boolean;
  /** Fields that could not be written, reported rather than swallowed. */
  problems?: string[];
}

export async function editPlayer(
  _prev: EditPlayerResult | null,
  form: FormData,
): Promise<EditPlayerResult> {
  const supabase = await createClient();

  const playerId = text(form, 'player_id');
  if (!playerId) return { error: 'Missing player id.' };

  const fullName = text(form, 'full_name');
  if (!fullName) return { error: 'A full name is required.' };

  const portrait = imageUrl(form, 'gbm_portrait_url');
  const hero = imageUrl(form, 'gbm_hero_image_url');
  const urlError = portrait.error ?? hero.error;
  if (urlError) return { error: urlError };

  // Countries by name; a name we do not hold stays null rather than becoming
  // a new country row.
  const nationalityName = text(form, 'nationality');
  const clubName = text(form, 'club_name');

  const [{ data: country }, clubId] = await Promise.all([
    nationalityName
      ? supabase.from('countries').select('id').ilike('name', nationalityName).maybeSingle()
      : Promise.resolve({ data: null }),
    resolveClub(supabase, clubName),
  ]);

  const { error: playerError } = await supabase
    .from('players')
    .update({
      full_name: fullName,
      date_of_birth: text(form, 'date_of_birth'),
      nationality_country_id: country?.id ?? null,
      primary_position: text(form, 'primary_position'),
      height_cm: int(form, 'height_cm'),
      foot: foot(form),
      current_club_id: clubId,
      gbm_portrait_url: portrait.value,
      gbm_hero_image_url: hero.value,
      image_credit: text(form, 'image_credit'),
    })
    .eq('id', playerId);

  if (playerError) {
    const denied =
      playerError.code === '42501' || playerError.message.includes('row-level security');
    return {
      error: denied
        ? 'Your role cannot edit players. Portfolio management is limited to the owner and executive director.'
        : `Could not save the player — ${playerError.message}`,
    };
  }

  const problems: string[] = [];

  // The portfolio row carries the relationship, not the person.
  const { error: portfolioError } = await supabase
    .from('gbm_portfolio')
    .update({
      status: (text(form, 'status') ?? 'REPRESENTED') as 'REPRESENTED',
      representation_start: text(form, 'representation_start'),
      assigned_staff_id: text(form, 'assigned_staff_id'),
      notes: text(form, 'notes'),
    })
    .eq('player_id', playerId);
  if (portfolioError) problems.push(`representation details (${portfolioError.message})`);

  /*
   * A valuation is a fact with a date, so it belongs in market_values beside
   * every other valuation rather than in a column on the player. Attributed to
   * GBM_INTERNAL — this is the agency's own number and must never be mistaken
   * for a provider's. The natural key is (player, provider, date), so editing
   * twice in one day corrects today's figure instead of stacking duplicates,
   * while a value entered tomorrow becomes a new point in the history.
   */
  const value = euros(form, 'market_value_eur');
  if (value !== null) {
    const { error } = await supabase.from('market_values').upsert(
      {
        player_id: playerId,
        value_amount: value,
        currency: 'EUR',
        valued_on: new Date().toISOString().slice(0, 10),
        provider_code: 'GBM_INTERNAL',
      },
      { onConflict: 'player_id,provider_code,valued_on' },
    );
    if (error) problems.push(`market value (${error.message})`);
  }

  const contractEnd = text(form, 'contract_expires_on');
  if (contractEnd) {
    // Unique on (player_id, provider_code, club_id) with NULLS NOT DISTINCT,
    // so this corrects GBM's own contract record rather than adding another.
    const { error } = await supabase.from('contracts').upsert(
      {
        player_id: playerId,
        club_id: clubId,
        expires_on: contractEnd,
        status: 'ACTIVE',
        provider_code: 'GBM_INTERNAL',
      },
      { onConflict: 'player_id,provider_code,club_id' },
    );
    if (error) problems.push(`contract (${error.message})`);
  }

  // The profile, the portfolio and the dashboard all read this player.
  revalidatePath('/', 'layout');

  return problems.length > 0 ? { saved: true, problems } : { saved: true };
}

/**
 * A club by name, created if GBM names one the database does not hold.
 *
 * Creating it is deliberate. These players are at clubs the Transfermarkt
 * import never covered, and refusing to record the club is what leaves
 * "Club unknown" on a card forever. `clubs.normalized_name` is unique, so a
 * race or a differently-cased duplicate collides rather than duplicating; the
 * conflict is answered by re-reading the row that won.
 */
async function resolveClub(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  name: string | null,
): Promise<string | null> {
  if (!name) return null;

  const { data: existing } = await supabase
    .from('clubs')
    .select('id')
    .ilike('name', name)
    .maybeSingle();
  if (existing?.id) return existing.id as string;

  const { data: created, error } = await supabase
    .from('clubs')
    .insert({ name })
    .select('id')
    .single();
  if (created?.id) return created.id as string;

  // Unique violation: someone else created it between the read and the write.
  if (error?.code === '23505') {
    const { data: found } = await supabase
      .from('clubs')
      .select('id')
      .ilike('name', name)
      .maybeSingle();
    return (found?.id as string) ?? null;
  }
  return null;
}
