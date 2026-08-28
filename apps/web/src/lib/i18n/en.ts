/**
 * English — the source of truth for every translatable string.
 *
 * This file defines the key set. `Dict` is derived from it, so the other
 * locales are typed as `Dict` and TypeScript refuses to compile a locale that
 * is missing a key or invents one. `i18n.test.ts` additionally rejects empty
 * strings and untranslated copies, because a key that type-checks can still be
 * a blank or a forgotten English sentence.
 *
 * Keys are flat and prefixed by surface. Flat because parity checking and
 * lookup stay trivial; prefixed because a translator needs to know where a
 * string appears before they can choose a register for it.
 *
 * Interpolation is `{name}`-style and handled by `t()`. Never build a sentence
 * by concatenating translated fragments — word order differs across these four
 * languages, and Georgian and Russian both put the verb somewhere English
 * would not.
 */
export const en = {
  // ---------------------------------------------------------------- brand --
  'brand.name': 'GBM',
  'brand.product': 'Intelligence',
  'brand.org': 'GBM Sports Group',

  // ------------------------------------------------------------ navigation --
  'nav.group.intelligence': 'Intelligence',
  'nav.group.scouting': 'Scouting',
  'nav.group.gbm': 'GBM',
  'nav.group.organization': 'Organization',
  'nav.dashboard': 'Dashboard',
  'nav.discover': 'Discover',
  'nav.radar': 'Market Radar',
  'nav.trends': 'Trends',
  'nav.players': 'Players',
  'nav.compare': 'Compare',
  'nav.clubs': 'Clubs',
  'nav.recruitment': 'Recruitment',
  'nav.portfolio': 'Portfolio',
  'nav.watchlists': 'Watchlists',
  'nav.scouting': 'Scouting Reports',
  'nav.team': 'Team',
  'nav.data': 'Data Providers',
  'nav.sync': 'Sync Status',
  'nav.settings': 'Settings',
  'nav.signout': 'Sign out',
  'nav.menu': 'Menu',
  'nav.watch': 'Watch',
  'nav.primary': 'Primary',

  // -------------------------------------------------------------- dashboard --
  'dash.title': 'Dashboard',
  'dash.stat.represented': 'Represented',
  'dash.stat.expiring': 'Contracts ≤6 mo',
  'dash.stat.tracked': 'Players tracked',
  'dash.stat.alerts': 'Open alerts',
  'dash.block.priority': 'Priority',
  'dash.block.priority.sub': 'Our players with a contract inside twelve months',
  'dash.block.priority.empty': 'No portfolio contracts closing inside a year.',
  'dash.block.opportunities': 'Opportunities',
  'dash.block.opportunities.sub': 'Highest GBM fit right now',
  'dash.block.opportunities.empty': 'No scored players yet.',
  'dash.block.portfolio': 'Portfolio',
  'dash.block.portfolio.sub': 'Players GBM represents',
  'dash.block.portfolio.empty': 'No represented players yet.',
  'dash.block.movement': 'Market movement',
  'dash.block.movement.sub': 'Biggest twelve-month value change, with real minutes',
  'dash.block.movement.empty': 'No valuation history yet.',
  'dash.block.activity': 'Recent activity',
  'dash.block.activity.empty': 'Nothing has run yet.',
  'dash.viewAll': 'View all',
  'dash.updated': '{count} updated',

  // -------------------------------------------------------------- portfolio --
  'port.title': 'Portfolio',
  'port.intro':
    'Players GBM Sports Group works with. This list is GBM’s own record — an external site omitting a player never removes him from here.',
  'port.addPlayer': '+ Add Player',
  'port.editPlayer': 'Edit details',
  'port.summary.represented': 'Represented',
  'port.summary.value': 'Known portfolio value',
  'port.summary.valueHint': '{known} of {total} valued',
  'port.summary.attention': 'Needing attention',
  'port.summary.expiring': 'Contracts ≤6 mo',
  'port.group.represented': 'Represented',
  'port.group.other': 'Review queue and other relationships',
  'port.group.otherSub': 'Named internally but not yet verified, in discussion, or former clients',
  'port.empty.title': 'No portfolio players yet',
  'port.empty.body':
    'Nothing in the database records a GBM representation relationship. Add a player to start the portfolio — this platform never displays invented entries.',
  'port.lastMatch': 'Last match',
  'port.noMatchData': 'No match data yet for this player.',
  'port.responsible': 'Responsible',
  'port.unassigned': 'Unassigned',
  'port.status.represented': 'Represented',
  'port.status.discussion': 'In discussion',
  'port.status.former': 'Former',
  'port.status.review': 'Needs verification',
  'port.alert.contractEnds': 'Contract ends in {months} mo',
  'port.alert.unverified': 'Representation unverified',
  'port.alert.minor': 'Minor — guardian consent required',
  'port.incomplete': '{count} details missing',
  'port.consentHeld': 'Guardian consent on file',

  // ---------------------------------------------------------------- players --
  'players.title': 'Players',
  'players.search': 'Search by name',
  'players.filters': 'Filters',
  'players.count': '{count} players',
  'players.countMore': '{count}+ players',
  'players.page': 'page {page}',
  'players.rankedByFit': 'Ranked by GBM opportunity model',
  'players.countingStats': 'Counting statistics from the connected dataset',
  'players.error.title': 'Could not load players',
  'players.empty.title': 'No players match these filters',
  'players.empty.body': 'Widen the age range or lower the statistical floors to see more.',
  'players.view.list': 'List',
  'players.view.grid': 'Grid',
  'players.noAgency': 'No agency listed',

  // ------------------------------------------------------------------ login --
  'login.title': 'Sign in',
  'login.email': 'Email',
  'login.password': 'Password',
  'login.submit': 'Sign in',
  'login.working': 'Signing in…',
  'login.noSignup': 'Accounts are created by a GBM administrator. There is no public sign-up.',
  'login.loading': 'Loading…',

  // --------------------------------------------------------------- settings --
  'settings.title': 'Settings',
  'settings.signedInAs': 'Signed in as',
  'settings.memberSince': 'Member since',
  'settings.note':
    'Accounts are created by a GBM administrator — there is no public sign-up. Role management and team administration arrive in the next phase.',
  'settings.language': 'Language',
  'settings.languageNote': 'Applies to the whole platform and is remembered on this device.',
  'settings.languageSave': 'Save',
  'settings.languageSaved': 'Language updated.',

  // ------------------------------------------------------------------- team --
  'team.title': 'Team',
  'team.role.owner': 'Owner',
  'team.role.executive': 'Executive Director',
  'team.role.scout': 'Player Service / Scout',
  'team.role.admin': 'Administrator',
  'team.role.analyst': 'Analyst',
  'team.role.viewer': 'Viewer',

  // ----------------------------------------------------------------- common --
  'common.value': 'Value',
  'common.contract': 'Contract',
  'common.club': 'Club',
  'common.clubUnknown': 'Club unknown',
  'common.age': 'Age',
  'common.nationality': 'Nationality',
  'common.position': 'Position',
  'common.months': '{count} mo',
  'common.monthsLeft': '{count} mo left',
  'common.unknown': 'Unknown',
  'common.none': '—',
  'common.save': 'Save',
  'common.cancel': 'Cancel',
  'common.back': 'Back',
  'common.justNow': 'just now',
  'common.minutesAgo': '{count} min ago',
  'common.hoursAgo': '{count} h ago',
  'common.daysAgo': '{count} d ago',
  'common.neverChecked': 'Never checked',
  'common.checkedAgo': 'Checked {when}',
  'common.fit': 'fit {score}',

  'edit.title': 'Edit details',
  'edit.intro':
    'GBM is the source of record for its own players. What you enter here is what the platform shows — no external site is consulted, and nothing is filled in for you.',
  'edit.section.identity': 'Identity',
  'edit.section.football': 'Football',
  'edit.section.representation': 'Representation',
  'edit.section.media': 'Photograph',
  'edit.mediaNote':
    'A direct https link to a photograph GBM has the right to use — the club’s own media, a photographer GBM has commissioned, or an agency portrait. Do not paste a link from a site that forbids it.',
  'edit.saved': 'Saved.',
  'edit.savedPartial': 'Saved, except: {problems}',
  'edit.fullName': 'Full name',
  'edit.dob': 'Date of birth',
  'edit.height': 'Height (cm)',
  'edit.foot': 'Preferred foot',
  'edit.footLeft': 'Left',
  'edit.footRight': 'Right',
  'edit.footBoth': 'Both',
  'edit.marketValue': 'Market value (€ millions)',
  'edit.contractExpires': 'Contract expires',
  'edit.repStart': 'Represented since',
  'edit.notes': 'Internal notes',
  'edit.portraitUrl': 'Portrait image URL',
  'edit.heroUrl': 'Hero image URL',
  'edit.imageCredit': 'Image credit',

  // -------------------------------------------------------------- languages --
  'lang.en': 'English',
  'lang.ru': 'Русский',
  'lang.nl': 'Nederlands',
  'lang.ka': 'ქართული',
} as const;

/** The key set every locale must satisfy, in full. */
export type Dict = Record<keyof typeof en, string>;
export type MessageKey = keyof typeof en;
