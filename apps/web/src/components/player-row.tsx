/**
 * Compatibility surface: the teamsheet row grew into the player card family.
 * Existing pages keep importing PlayerRow/PlayerRowData; both now resolve to
 * the list variant of the card grammar (portrait included).
 */
export { PlayerListRow as PlayerRow } from './player-card';
export type { PlayerCardData as PlayerRowData } from './player-card';
