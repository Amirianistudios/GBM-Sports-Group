import type { Dict } from './en';

/**
 * Georgian (ქართული).
 *
 * Written in Mkhedruli, which has no letter case — so no string here is
 * capitalised, and none should be. Any UI that applies `text-transform:
 * uppercase` to a label is a no-op in Georgian rather than an error, but
 * letter-spacing set for Latin eyebrows can hurt legibility; the stylesheet
 * drops tracking for this locale.
 *
 * Terminology follows Georgian football media usage: სკაუტინგი, კონტრაქტი and
 * პორტფოლიო are established loanwords and are used in preference to invented
 * native compounds, which would read as a translation exercise rather than as
 * the product's own voice. Where a natural Georgian word exists it is
 * preferred — შესაძლებლობები over an English borrowing for "opportunities".
 *
 * Georgian is verb-final and case-marked, so several strings are not word-for-
 * word parallel to the English: "Players GBM represents" becomes a relative
 * clause ("მოთამაშეები, რომლებსაც GBM წარმოადგენს") because the English
 * participle has no direct equivalent. This is why `t()` interpolates whole
 * sentences and nothing in the codebase concatenates translated fragments.
 *
 * Confidence: this is a careful translation, not a certified one. The Georgian
 * strings should be read once by a native speaker before GBM shows the
 * interface to a Georgian-speaking client or player family. Nothing else in
 * the platform depends on them being perfect — they are presentation only.
 */
export const ka: Dict = {
  'brand.name': 'GBM',
  'brand.product': 'Intelligence',
  'brand.org': 'GBM Sports Group',

  'nav.group.intelligence': 'ანალიტიკა',
  'nav.group.scouting': 'სკაუტინგი',
  'nav.group.gbm': 'GBM',
  'nav.group.organization': 'ორგანიზაცია',
  'nav.dashboard': 'მთავარი',
  'nav.discover': 'აღმოჩენა',
  'nav.radar': 'ბაზრის რადარი',
  'nav.trends': 'ტენდენციები',
  'nav.players': 'მოთამაშეები',
  'nav.compare': 'შედარება',
  'nav.clubs': 'კლუბები',
  'nav.portfolio': 'პორტფოლიო',
  'nav.watchlists': 'დაკვირვების სიები',
  'nav.scouting': 'სკაუტინგის ანგარიშები',
  'nav.team': 'გუნდი',
  'nav.data': 'მონაცემთა მომწოდებლები',
  'nav.sync': 'სინქრონიზაციის სტატუსი',
  'nav.settings': 'პარამეტრები',
  'nav.signout': 'გასვლა',
  'nav.menu': 'მენიუ',
  'nav.watch': 'დაკვირვება',
  'nav.primary': 'ძირითადი ნავიგაცია',

  'dash.title': 'მთავარი',
  'dash.stat.represented': 'წარმომადგენლობაში',
  'dash.stat.expiring': 'კონტრაქტები ≤6 თვე',
  'dash.stat.tracked': 'მოთამაშეები ბაზაში',
  'dash.stat.alerts': 'აქტიური შეტყობინებები',
  'dash.block.priority': 'პრიორიტეტი',
  'dash.block.priority.sub': 'ჩვენი მოთამაშეები, რომელთა კონტრაქტიც თორმეტ თვეზე ნაკლებია',
  'dash.block.priority.empty': 'წლის განმავლობაში ვადაგასული კონტრაქტები არ არის.',
  'dash.block.opportunities': 'შესაძლებლობები',
  'dash.block.opportunities.sub': 'ამჟამად უმაღლესი შესაბამისობა GBM-თან',
  'dash.block.opportunities.empty': 'შეფასებული მოთამაშეები ჯერ არ არის.',
  'dash.block.portfolio': 'პორტფოლიო',
  'dash.block.portfolio.sub': 'მოთამაშეები, რომლებსაც GBM წარმოადგენს',
  'dash.block.portfolio.empty': 'წარმომადგენლობაში მყოფი მოთამაშეები ჯერ არ არის.',
  'dash.block.movement': 'ბაზრის მოძრაობა',
  'dash.block.movement.sub': 'ღირებულების უდიდესი ცვლილება თორმეტ თვეში, რეალური სათამაშო წუთებით',
  'dash.block.movement.empty': 'ღირებულების ისტორია ჯერ არ არის.',
  'dash.block.activity': 'ბოლო აქტივობა',
  'dash.block.activity.empty': 'ჯერ არაფერი შესრულებულა.',
  'dash.viewAll': 'ყველას ნახვა',
  'dash.updated': 'განახლდა: {count}',

  'port.title': 'პორტფოლიო',
  'port.intro':
    'მოთამაშეები, რომლებთანაც GBM Sports Group მუშაობს. ეს არის GBM-ის საკუთარი ჩანაწერი — თუ გარე საიტი მოთამაშეს არ მიუთითებს, ის აქედან არ იშლება.',
  'port.addPlayer': '+ მოთამაშის დამატება',
  'port.editPlayer': 'დეტალების რედაქტირება',
  'port.summary.represented': 'წარმომადგენლობაში',
  'port.summary.value': 'პორტფოლიოს ცნობილი ღირებულება',
  'port.summary.valueHint': 'შეფასებულია {known} / {total}',
  'port.summary.attention': 'საჭიროებს ყურადღებას',
  'port.summary.expiring': 'კონტრაქტები ≤6 თვე',
  'port.group.represented': 'წარმომადგენლობაში',
  'port.group.other': 'შესამოწმებელი და სხვა ურთიერთობები',
  'port.group.otherSub':
    'შიდა ჩანაწერებში მითითებული, მაგრამ ჯერ დაუდასტურებელი, მოლაპარაკების ეტაპზე ან ყოფილი კლიენტები',
  'port.empty.title': 'პორტფოლიოში ჯერ არ არის მოთამაშეები',
  'port.empty.body':
    'ბაზაში არ არის GBM-ის წარმომადგენლობის არცერთი ჩანაწერი. დაამატეთ მოთამაშე პორტფოლიოს დასაწყებად — პლატფორმა არასოდეს აჩვენებს გამოგონილ ჩანაწერებს.',
  'port.lastMatch': 'ბოლო მატჩი',
  'port.noMatchData': 'ამ მოთამაშეზე მატჩების მონაცემები ჯერ არ არის.',
  'port.responsible': 'პასუხისმგებელი',
  'port.unassigned': 'არ არის მინიჭებული',
  'port.status.represented': 'წარმომადგენლობაში',
  'port.status.discussion': 'მოლაპარაკების ეტაპზე',
  'port.status.former': 'ყოფილი',
  'port.status.review': 'საჭიროებს დადასტურებას',
  'port.alert.contractEnds': 'კონტრაქტი მთავრდება {months} თვეში',
  'port.alert.unverified': 'წარმომადგენლობა დაუდასტურებელია',
  'port.alert.minor': 'არასრულწლოვანი — საჭიროა მეურვის თანხმობა',
  'port.incomplete': 'აკლია {count} ველი',
  'port.consentHeld': 'მეურვის თანხმობა მიღებულია',

  'players.title': 'მოთამაშეები',
  'players.search': 'ძებნა სახელით',
  'players.filters': 'ფილტრები',
  'players.count': '{count} მოთამაშე',
  'players.countMore': '{count}+ მოთამაშე',
  'players.page': 'გვერდი {page}',
  'players.rankedByFit': 'დალაგებულია GBM-ის შესაძლებლობების მოდელით',
  'players.countingStats': 'სტატისტიკა დაკავშირებული მონაცემთა ბაზიდან',
  'players.error.title': 'მოთამაშეების ჩატვირთვა ვერ მოხერხდა',
  'players.empty.title': 'ამ ფილტრებს არცერთი მოთამაშე არ შეესაბამება',
  'players.empty.body': 'გააფართოვეთ ასაკობრივი დიაპაზონი ან შეამცირეთ სტატისტიკური ზღვრები.',
  'players.view.list': 'სია',
  'players.view.grid': 'ბადე',
  'players.noAgency': 'აგენტი მითითებული არ არის',

  'login.title': 'შესვლა',
  'login.email': 'ელ. ფოსტა',
  'login.password': 'პაროლი',
  'login.submit': 'შესვლა',
  'login.working': 'მიმდინარეობს შესვლა…',
  'login.noSignup': 'ანგარიშებს ქმნის GBM-ის ადმინისტრატორი. საჯარო რეგისტრაცია არ არსებობს.',
  'login.loading': 'იტვირთება…',

  'settings.title': 'პარამეტრები',
  'settings.signedInAs': 'შესული ხართ როგორც',
  'settings.memberSince': 'წევრი თარიღიდან',
  'settings.note':
    'ანგარიშებს ქმნის GBM-ის ადმინისტრატორი — საჯარო რეგისტრაცია არ არსებობს. როლების მართვა და გუნდის ადმინისტრირება მომდევნო ეტაპზე დაემატება.',
  'settings.language': 'ენა',
  'settings.languageNote': 'მოქმედებს მთელ პლატფორმაზე და ინახება ამ მოწყობილობაზე.',
  'settings.languageSave': 'შენახვა',
  'settings.languageSaved': 'ენა განახლდა.',

  'team.title': 'გუნდი',
  'team.role.owner': 'მფლობელი',
  'team.role.executive': 'აღმასრულებელი დირექტორი',
  'team.role.scout': 'მოთამაშეთა სერვისი / სკაუტი',
  'team.role.admin': 'ადმინისტრატორი',
  'team.role.analyst': 'ანალიტიკოსი',
  'team.role.viewer': 'დამკვირვებელი',

  'common.value': 'ღირებულება',
  'common.contract': 'კონტრაქტი',
  'common.club': 'კლუბი',
  'common.clubUnknown': 'კლუბი უცნობია',
  'common.age': 'ასაკი',
  'common.nationality': 'მოქალაქეობა',
  'common.position': 'პოზიცია',
  'common.months': '{count} თვე',
  'common.monthsLeft': 'დარჩა {count} თვე',
  'common.unknown': 'უცნობი',
  'common.none': '—',
  'common.save': 'შენახვა',
  'common.cancel': 'გაუქმება',
  'common.back': 'უკან',
  'common.justNow': 'ახლახან',
  'common.minutesAgo': '{count} წუთის წინ',
  'common.hoursAgo': '{count} საათის წინ',
  'common.daysAgo': '{count} დღის წინ',
  'common.neverChecked': 'არასოდეს შემოწმებულა',
  'common.checkedAgo': 'შემოწმდა {when}',
  'common.fit': 'შესაბამისობა {score}',

  'edit.title': 'დეტალების რედაქტირება',
  'edit.intro':
    'საკუთარი მოთამაშეების მონაცემების პირველწყარო თავად GBM-ია. რასაც აქ შეიყვანთ, სწორედ იმას აჩვენებს პლატფორმა — გარე საიტები არ იკითხება და არაფერი ივსება ავტომატურად.',
  'edit.section.identity': 'პირადი მონაცემები',
  'edit.section.football': 'ფეხბურთი',
  'edit.section.representation': 'წარმომადგენლობა',
  'edit.section.media': 'ფოტო',
  'edit.mediaNote':
    'პირდაპირი https ბმული ფოტოზე, რომლის გამოყენების უფლებაც GBM-ს აქვს: კლუბის საკუთარი მასალა, GBM-ის დაკვეთით გადაღებული ფოტო ან სააგენტოს პორტრეტი. არ ჩასვათ ბმული საიტიდან, რომელიც ამას კრძალავს.',
  'edit.saved': 'შენახულია.',
  'edit.savedPartial': 'შენახულია, გარდა: {problems}',
  'edit.fullName': 'სრული სახელი',
  'edit.dob': 'დაბადების თარიღი',
  'edit.height': 'სიმაღლე (სმ)',
  'edit.foot': 'ძირითადი ფეხი',
  'edit.footLeft': 'მარცხენა',
  'edit.footRight': 'მარჯვენა',
  'edit.footBoth': 'ორივე',
  'edit.marketValue': 'საბაზრო ღირებულება (მლნ €)',
  'edit.contractExpires': 'კონტრაქტის ვადა',
  'edit.repStart': 'წარმომადგენლობაში თარიღიდან',
  'edit.notes': 'შიდა შენიშვნები',
  'edit.portraitUrl': 'პორტრეტის ბმული',
  'edit.heroUrl': 'ფართო ფოტოს ბმული',
  'edit.imageCredit': 'ფოტოს ავტორი',

  'lang.en': 'English',
  'lang.ru': 'Русский',
  'lang.nl': 'Nederlands',
  'lang.ka': 'ქართული',
};
