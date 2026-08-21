/**
 * GBM Intelligence Summary — the sentence under a player's name.
 *
 * Assembled ONLY from fields the database actually holds; every clause maps
 * to a stored fact. No scouting judgement, no invented traits ("strong in
 * the air" cannot come from minutes and a market value), no pronouns — the
 * subject is always the player or the fact. If nothing beyond identity is
 * known, the summary is short; if identity itself is unknown, there is none.
 */

export interface SummaryInput {
  age: number | null;
  nationality: string | null;
  position: string | null;
  clubName: string | null;
  leagueName: string | null; // display label, already humanised
  seasonMinutes: number | null;
  seasonApps: number | null;
  marketValue: number | null;
  valueChangePct: number | null;
  contractMonths: number | null;
  citizenshipIsTarget: boolean;
  leagueIsTarget: boolean;
  /** Representation status is only mentioned with its caveat, verbatim. */
  noAgencyListed: boolean;
}

function positionNoun(position: string | null): string {
  if (!position) return 'player';
  return position.toLowerCase();
}

function euros(v: number): string {
  if (v >= 1_000_000) {
    const m = v / 1_000_000;
    return `€${m >= 10 ? Math.round(m) : Math.round(m * 10) / 10}m`;
  }
  return `€${Math.round(v / 1000)}k`;
}

export function buildIntelligenceSummary(i: SummaryInput): string | null {
  // Identity sentence — requires at least an age or a nationality.
  if (i.age === null && !i.nationality) return null;

  // "right winger from Spain", never "Spain right winger" — the database
  // stores country names, not demonyms, and the phrasing must stay correct
  // for every country without a lookup table.
  const who = [
    i.age !== null ? `${Math.floor(i.age)}-year-old` : null,
    positionNoun(i.position),
    i.nationality ? `from ${i.nationality}` : null,
  ]
    .filter(Boolean)
    .join(' ');

  const where =
    i.clubName && i.leagueName
      ? ` at ${i.clubName}, playing ${i.leagueName} football this season`
      : i.clubName
        ? ` at ${i.clubName}`
        : i.leagueName
          ? `, playing ${i.leagueName} football this season`
          : '';

  const sentences: string[] = [`${who.charAt(0).toUpperCase()}${who.slice(1)}${where}.`];

  // Why interesting — at most three clauses, each a stored fact.
  const clauses: string[] = [];
  if (i.seasonMinutes !== null && i.seasonMinutes >= 900) {
    clauses.push(
      `a regular starter with ${i.seasonMinutes.toLocaleString('en-GB')}′${
        i.seasonApps ? ` across ${i.seasonApps} appearances` : ''
      } this season`,
    );
  } else if (i.seasonMinutes !== null && i.seasonMinutes >= 450) {
    clauses.push(`${i.seasonMinutes.toLocaleString('en-GB')}′ of league football this season`);
  }
  if (i.valueChangePct !== null && i.valueChangePct >= 50) {
    clauses.push(`market value up ${Math.round(i.valueChangePct)}% in twelve months`);
  }
  if (i.contractMonths !== null && i.contractMonths <= 18) {
    clauses.push(`a contract with only ${i.contractMonths} months remaining`);
  }
  if (
    i.marketValue !== null &&
    i.marketValue > 0 &&
    i.marketValue <= 5_000_000 &&
    clauses.length < 3
  ) {
    clauses.push(`a ${euros(i.marketValue)} valuation inside a realistic acquisition range`);
  }
  if (clauses.length > 0) {
    const top = clauses.slice(0, 3);
    const joined =
      top.length === 1
        ? top[0]
        : `${top.slice(0, -1).join(', ')} and ${top[top.length - 1]}`;
    sentences.push(`Worth monitoring for ${joined}.`);
  }

  // Market fit — from the target-market reference data, never guessed.
  if (i.citizenshipIsTarget && i.leagueIsTarget) {
    sentences.push('Nationality and current league both sit inside GBM’s primary markets.');
  } else if (i.citizenshipIsTarget) {
    sentences.push('Nationality sits inside GBM’s primary markets.');
  } else if (i.leagueIsTarget) {
    sentences.push('Current league sits inside GBM’s primary markets.');
  }

  // The representation caveat keeps its exact meaning wherever it appears.
  if (i.noAgencyListed) {
    sentences.push(
      'The source lists no agency — a blank field is not proof of no representation.',
    );
  }

  return sentences.join(' ');
}
