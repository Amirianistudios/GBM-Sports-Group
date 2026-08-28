'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

/**
 * Creating a club requirement and ranking against it.
 *
 * Authority is never decided here. Both writes go through the signed-in user's
 * own client, so RLS decides. The policy is still named
 * `club_requirements_insert` — Postgres keeps policy names through a table
 * rename, and renaming them for tidiness would be a second migration for no
 * behavioural gain. It admits whoever `gbm_can_write()` admits, and a reader
 * who reaches this action gets a database refusal rather than a hidden button.
 *
 * Only a position is required. A club says "we need a striker" long before it
 * has agreed a budget, and demanding numbers nobody has settled is how briefs
 * get filled with invented ones — the same rule the rest of the platform
 * follows for players.
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

/** Plain euros in the form, plain euros in the database. */
function money(form: FormData, key: string): number | null {
  const t = text(form, key);
  if (t === null) return null;
  const n = Number.parseFloat(t.replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? Math.round(n) : null;
}

/** Comma-separated countries. Empty stays an empty array, never null. */
function markets(form: FormData, key: string): string[] {
  const t = text(form, key);
  if (t === null) return [];
  return t.split(',').map((s) => s.trim()).filter(Boolean);
}

export async function createRequirement(
  _prev: { error?: string } | null,
  form: FormData,
): Promise<{ error?: string }> {
  const supabase = await createClient();

  const position = text(form, 'position_required');
  if (!position) return { error: 'A position is required — everything else can follow later.' };

  const ageMin = int(form, 'age_min');
  const ageMax = int(form, 'age_max');
  if (ageMin !== null && ageMax !== null && ageMax < ageMin) {
    return { error: `Age range reads ${ageMin}–${ageMax}. The upper bound has to be the larger one.` };
  }

  const budgetMin = money(form, 'transfer_budget_min');
  const budgetMax = money(form, 'transfer_budget_max');
  if (budgetMin !== null && budgetMax !== null && budgetMax < budgetMin) {
    return { error: 'The maximum transfer budget is below the minimum.' };
  }

  const { data: requirement, error } = await supabase
    .from('recruitment_requests')
    .insert({
      club_name: text(form, 'club_name'),
      title: text(form, 'title'),
      position_required: position.toUpperCase(),
      tactical_role: text(form, 'tactical_role'),
      preferred_age_min: ageMin,
      preferred_age_max: ageMax,
      transfer_budget_min: budgetMin,
      transfer_budget_max: budgetMax,
      salary_budget_max: money(form, 'salary_budget_max'),
      contract_preference: text(form, 'contract_preference'),
      preferred_markets: markets(form, 'preferred_markets'),
      country: text(form, 'country'),
      league: text(form, 'league'),
      competition_level: text(form, 'competition_level'),
      player_profile_description: text(form, 'player_profile_description'),
      urgency: text(form, 'urgency'),
      notes: text(form, 'notes'),
    })
    .select('id')
    .single();

  if (error) return { error: `The requirement could not be saved — ${error.message}` };

  // Rank immediately: a brief with no candidates against it is a form, not a
  // recruitment tool. A failure here leaves the requirement saved and says so,
  // rather than discarding what the user typed.
  const { error: rankError } = await supabase.rpc('gbm_generate_shortlist', {
    p_request: requirement.id,
  });

  revalidatePath('/recruitment');

  if (rankError) {
    return {
      error:
        `Saved, but ranking failed — ${rankError.message}. ` +
        `Open the requirement and run it again.`,
    };
  }

  redirect(`/recruitment/${requirement.id}`);
}

/** Re-rank an existing requirement, after new data has arrived. */
export async function recomputeRequirement(form: FormData): Promise<void> {
  const id = form.get('requirement_id');
  if (typeof id !== 'string') return;

  const supabase = await createClient();
  const { error } = await supabase.rpc('gbm_generate_shortlist', { p_request: id });
  if (error) console.error(`[recruitment] recompute failed — ${error.message}`);

  revalidatePath(`/recruitment/${id}`);
}
