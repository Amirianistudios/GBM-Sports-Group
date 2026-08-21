/**
 * Country name → flag emoji, deterministically.
 *
 * The dataset stores English country names and no ISO codes, so this is a
 * fixed dictionary for the nations that actually appear in the data — not an
 * inference. An unmapped name renders no flag (never a wrong one). Flags are
 * a recognition aid beside the written nationality, never a replacement for
 * it (the name always renders alongside).
 */

const ISO: Record<string, string> = {
  Afghanistan: 'AF', Albania: 'AL', Algeria: 'DZ', Angola: 'AO', Argentina: 'AR',
  Armenia: 'AM', Australia: 'AU', Austria: 'AT', Azerbaijan: 'AZ', Belgium: 'BE',
  Benin: 'BJ', 'Bosnia-Herzegovina': 'BA', Brazil: 'BR', Bulgaria: 'BG',
  'Burkina Faso': 'BF', Burundi: 'BI', Cameroon: 'CM', Canada: 'CA',
  'Cape Verde': 'CV', Chile: 'CL', China: 'CN', Colombia: 'CO', Comoros: 'KM',
  Congo: 'CG', 'Cote d’Ivoire': 'CI', "Cote d'Ivoire": 'CI', Croatia: 'HR',
  Cuba: 'CU', Curacao: 'CW', Cyprus: 'CY', 'Czech Republic': 'CZ', Denmark: 'DK',
  'DR Congo': 'CD', Ecuador: 'EC', Egypt: 'EG', 'El Salvador': 'SV',
  'Equatorial Guinea': 'GQ', Eritrea: 'ER', Estonia: 'EE', Ethiopia: 'ET',
  Finland: 'FI', France: 'FR', Gabon: 'GA', Gambia: 'GM', Georgia: 'GE',
  Germany: 'DE', Ghana: 'GH', Greece: 'GR', Grenada: 'GD', Guadeloupe: 'GP',
  Guatemala: 'GT', Guinea: 'GN', 'Guinea-Bissau': 'GW', Haiti: 'HT',
  Honduras: 'HN', Hungary: 'HU', Iceland: 'IS', India: 'IN', Indonesia: 'ID',
  Iran: 'IR', Iraq: 'IQ', Ireland: 'IE', Israel: 'IL', Italy: 'IT',
  Jamaica: 'JM', Japan: 'JP', Jordan: 'JO', Kazakhstan: 'KZ', Kenya: 'KE',
  'Korea, South': 'KR', 'Korea, North': 'KP', Kosovo: 'XK', Latvia: 'LV',
  Lebanon: 'LB', Liberia: 'LR', Libya: 'LY', Lithuania: 'LT', Luxembourg: 'LU',
  Madagascar: 'MG', Mali: 'ML', Malta: 'MT', Martinique: 'MQ', Mauritania: 'MR',
  Mexico: 'MX', Moldova: 'MD', Montenegro: 'ME', Morocco: 'MA', Mozambique: 'MZ',
  Netherlands: 'NL', 'New Zealand': 'NZ', Nicaragua: 'NI', Niger: 'NE',
  Nigeria: 'NG', 'North Macedonia': 'MK', Norway: 'NO', Panama: 'PA',
  Paraguay: 'PY', Peru: 'PE', Philippines: 'PH', Poland: 'PL', Portugal: 'PT',
  Qatar: 'QA', Romania: 'RO', Russia: 'RU', Rwanda: 'RW', 'Saudi Arabia': 'SA',
  Senegal: 'SN', Serbia: 'RS', 'Sierra Leone': 'SL', Slovakia: 'SK',
  Slovenia: 'SI', Somalia: 'SO', 'South Africa': 'ZA', 'South Sudan': 'SS',
  Spain: 'ES', Suriname: 'SR', Sweden: 'SE', Switzerland: 'CH', Syria: 'SY',
  Tanzania: 'TZ', Togo: 'TG', 'Trinidad and Tobago': 'TT', Tunisia: 'TN',
  'Türkiye': 'TR', Turkey: 'TR', Uganda: 'UG', Ukraine: 'UA',
  'United States': 'US', Uruguay: 'UY', Uzbekistan: 'UZ', Venezuela: 'VE',
  Wales: 'GB-WLS', England: 'GB-ENG', Scotland: 'GB-SCT',
  'Northern Ireland': 'GB-NIR', Zambia: 'ZM', Zimbabwe: 'ZW',
};

/** Regional-indicator flag for ISO-3166 alpha-2; tag-sequence flags for UK nations. */
function isoToEmoji(iso: string): string {
  if (iso.startsWith('GB-')) {
    const region = iso.slice(3).toLowerCase();
    const tags = Array.from(`gb${region}`)
      .map((c) => String.fromCodePoint(0xe0000 + c.charCodeAt(0)))
      .join('');
    return `\u{1F3F4}${tags}\u{E007F}`;
  }
  return Array.from(iso)
    .map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65))
    .join('');
}

/** Flag emoji for a dataset country name, or null when unmapped. */
export function countryFlag(name: string | null | undefined): string | null {
  if (!name) return null;
  const iso = ISO[name];
  return iso ? isoToEmoji(iso) : null;
}
