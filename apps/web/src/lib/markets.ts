/**
 * GBM primary markets, grouped for the Discover chips. Country names match
 * `gbm_target_markets.country_name` (= `countries.name` as the dataset
 * spells them: 'Korea, South', 'Cote d''Ivoire', 'Bosnia-Herzegovina').
 * The database table is the authority; this grouping is presentation.
 */

export const MARKET_REGIONS: Record<string, { label: string; countries: string[] }> = {
  europe: {
    label: 'Europe',
    countries: [
      'Albania', 'Armenia', 'Azerbaijan', 'Belgium', 'Bosnia-Herzegovina', 'Bulgaria',
      'Croatia', 'Czech Republic', 'Estonia', 'Georgia', 'Latvia', 'Lithuania',
      'Moldova', 'Montenegro', 'North Macedonia', 'Poland', 'Romania', 'Serbia',
      'Slovakia', 'Slovenia', 'Ukraine',
    ],
  },
  'central-asia': {
    label: 'Central Asia',
    countries: ['Kazakhstan', 'Uzbekistan'],
  },
  asia: {
    label: 'Asia',
    countries: ['Japan', 'Korea, South'],
  },
  'south-america': {
    label: 'South America',
    countries: ['Argentina', 'Bolivia', 'Brazil', 'Colombia', 'Ecuador', 'Paraguay', 'Uruguay'],
  },
  africa: {
    label: 'Africa',
    countries: [
      "Cote d'Ivoire", 'Egypt', 'Ghana', 'Morocco', 'Nigeria', 'Rwanda', 'Senegal', 'South Africa',
    ],
  },
};

export const ALL_TARGET_COUNTRIES: string[] = Object.values(MARKET_REGIONS).flatMap(
  (r) => r.countries,
);

export function marketCountries(region: string | undefined): string[] | null {
  if (!region || region === 'all') return null;
  return MARKET_REGIONS[region]?.countries ?? null;
}
