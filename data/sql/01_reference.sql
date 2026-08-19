insert into countries (name, confederation)
select * from (values
  ('Algeria', NULL),
  ('Argentina', 'amerika'),
  ('Austria', 'europa'),
  ('Belgium', 'europa'),
  ('Bosnia-Herzegovina', NULL),
  ('Brazil', 'amerika'),
  ('Cameroon', NULL),
  ('Cote d''Ivoire', NULL),
  ('Croatia', 'europa'),
  ('Denmark', 'europa'),
  ('Ecuador', NULL),
  ('England', 'europa'),
  ('France', 'europa'),
  ('Georgia', NULL),
  ('Germany', 'europa'),
  ('Ghana', NULL),
  ('Guernsey', NULL),
  ('Guinea', NULL),
  ('Guinea-Bissau', NULL),
  ('Hungary', NULL),
  ('Italy', 'europa'),
  ('Kosovo', NULL),
  ('Morocco', NULL),
  ('Netherlands', 'europa'),
  ('Norway', 'europa'),
  ('Portugal', 'europa'),
  ('Senegal', NULL),
  ('Spain', 'europa'),
  ('Sweden', 'europa'),
  ('Switzerland', 'europa'),
  ('The Gambia', NULL),
  ('Türkiye', 'europa'),
  ('Uruguay', NULL),
  ('Uzbekistan', NULL)
) as v(name, confederation)
on conflict do nothing;

with src(tm_id, name, code, country, tier, url) as (values
  ('A1', 'bundesliga', 'bundesliga', 'Austria', 'FIRST_TIER', 'https://www.transfermarkt.co.uk/bundesliga/startseite/wettbewerb/A1'),
  ('BRA1', 'campeonato-brasileiro-serie-a', 'campeonato-brasileiro-serie-a', 'Brazil', 'FIRST_TIER', 'https://www.transfermarkt.co.uk/campeonato-brasileiro-serie-a/startseite/wettbewerb/BRA1'),
  ('ES1', 'laliga', 'laliga', 'Spain', 'FIRST_TIER', 'https://www.transfermarkt.co.uk/laliga/startseite/wettbewerb/ES1'),
  ('FR1', 'ligue-1', 'ligue-1', 'France', 'FIRST_TIER', 'https://www.transfermarkt.co.uk/ligue-1/startseite/wettbewerb/FR1'),
  ('GB1', 'premier-league', 'premier-league', 'England', 'FIRST_TIER', 'https://www.transfermarkt.co.uk/premier-league/startseite/wettbewerb/GB1'),
  ('IT1', 'serie-a', 'serie-a', 'Italy', 'FIRST_TIER', 'https://www.transfermarkt.co.uk/serie-a/startseite/wettbewerb/IT1'),
  ('L1', 'bundesliga', 'bundesliga', 'Germany', 'FIRST_TIER', 'https://www.transfermarkt.co.uk/bundesliga/startseite/wettbewerb/L1'),
  ('PO1', 'liga-portugal', 'liga-portugal', 'Portugal', 'FIRST_TIER', 'https://www.transfermarkt.co.uk/liga-portugal/startseite/wettbewerb/PO1'),
  ('SA1', 'saudi-pro-league', 'saudi-pro-league', 'Saudi Arabia', 'FIRST_TIER', 'https://www.transfermarkt.co.uk/saudi-pro-league/startseite/wettbewerb/SA1'),
  ('TR1', 'super-lig', 'super-lig', 'Türkiye', 'FIRST_TIER', 'https://www.transfermarkt.co.uk/super-lig/startseite/wettbewerb/TR1')
),
ins as (
  insert into competitions (name, short_name, country_id, area_name, tier)
  select src.name, src.code, c.id, src.country, src.tier::competition_tier
  from src left join countries c on c.normalized_name = gbm_normalize_name(src.country)
  on conflict do nothing
  returning id
)
select count(*) from ins;

with src(tm_id, name, country, url) as (values
  ('A1', 'bundesliga', 'Austria', 'https://www.transfermarkt.co.uk/bundesliga/startseite/wettbewerb/A1'),
  ('BRA1', 'campeonato-brasileiro-serie-a', 'Brazil', 'https://www.transfermarkt.co.uk/campeonato-brasileiro-serie-a/startseite/wettbewerb/BRA1'),
  ('ES1', 'laliga', 'Spain', 'https://www.transfermarkt.co.uk/laliga/startseite/wettbewerb/ES1'),
  ('FR1', 'ligue-1', 'France', 'https://www.transfermarkt.co.uk/ligue-1/startseite/wettbewerb/FR1'),
  ('GB1', 'premier-league', 'England', 'https://www.transfermarkt.co.uk/premier-league/startseite/wettbewerb/GB1'),
  ('IT1', 'serie-a', 'Italy', 'https://www.transfermarkt.co.uk/serie-a/startseite/wettbewerb/IT1'),
  ('L1', 'bundesliga', 'Germany', 'https://www.transfermarkt.co.uk/bundesliga/startseite/wettbewerb/L1'),
  ('PO1', 'liga-portugal', 'Portugal', 'https://www.transfermarkt.co.uk/liga-portugal/startseite/wettbewerb/PO1'),
  ('SA1', 'saudi-pro-league', 'Saudi Arabia', 'https://www.transfermarkt.co.uk/saudi-pro-league/startseite/wettbewerb/SA1'),
  ('TR1', 'super-lig', 'Türkiye', 'https://www.transfermarkt.co.uk/super-lig/startseite/wettbewerb/TR1')
)
insert into competition_external_ids (competition_id, provider_code, namespace, external_id, url)
select comp.id, 'TRANSFERMARKT_DATASET', 'wettbewerb', src.tm_id, src.url
from src join competitions comp
  on comp.normalized_name = gbm_normalize_name(src.name)
 and coalesce(comp.area_name, '') = coalesce(src.country, '')
on conflict do nothing;

with src(tm_id, name, stadium, url) as (values
  ('1023', 'Sociedade Esportiva Palmeiras', 'Nubank Parque', 'https://www.transfermarkt.co.uk/se-palmeiras-sao-paulo/startseite/verein/1023'),
  ('1025', 'Bologna Football Club 1909', 'Stadio Renato Dall’Ara', 'https://www.transfermarkt.co.uk/fc-bologna/startseite/verein/1025'),
  ('1047', 'Como 1907', 'Giuseppe Sinigaglia', 'https://www.transfermarkt.co.uk/como-1907/startseite/verein/1047'),
  ('1050', 'Villarreal CF', 'La Cerámica', 'https://www.transfermarkt.co.uk/fc-villarreal/startseite/verein/1050'),
  ('1082', 'LOSC Lille', 'Decathlon Arena-Stade Pierre-Mauroy', 'https://www.transfermarkt.co.uk/losc-lille/startseite/verein/1082'),
  ('11', 'Arsenal FC', 'Emirates Stadium', 'https://www.transfermarkt.co.uk/fc-arsenal/startseite/verein/11'),
  ('1148', 'Brentford FC', 'Gtech Community Stadium', 'https://www.transfermarkt.co.uk/fc-brentford/startseite/verein/1148'),
  ('1158', 'FC Lorient', 'Stade du Moustoir', 'https://www.transfermarkt.co.uk/fc-lorient/startseite/verein/1158'),
  ('12', 'Associazione Sportiva Roma', 'Olimpico di Roma', 'https://www.transfermarkt.co.uk/as-rom/startseite/verein/12'),
  ('12321', 'Girona FC', 'Montilivi', 'https://www.transfermarkt.co.uk/fc-girona/startseite/verein/12321'),
  ('1237', 'Brighton & Hove Albion', 'AMEX Stadium', 'https://www.transfermarkt.co.uk/brighton-amp-hove-albion/startseite/verein/1237'),
  ('13', 'Atlético de Madrid', 'Riyadh Air Metropolitano', 'https://www.transfermarkt.co.uk/atletico-madrid/startseite/verein/13'),
  ('131', 'FC Barcelona', 'Spotify Camp Nou', 'https://www.transfermarkt.co.uk/fc-barcelona/startseite/verein/131'),
  ('1420', 'Angers SCO', 'Stade Raymond-Kopa', 'https://www.transfermarkt.co.uk/sco-angers/startseite/verein/1420'),
  ('148', 'Tottenham Hotspur', 'Tottenham Hotspur Stadium', 'https://www.transfermarkt.co.uk/tottenham-hotspur/startseite/verein/148'),
  ('15', 'Bayer 04 Leverkusen', 'BayArena', 'https://www.transfermarkt.co.uk/bayer-04-leverkusen/startseite/verein/15'),
  ('16', 'Borussia Dortmund', 'SIGNAL IDUNA PARK', 'https://www.transfermarkt.co.uk/borussia-dortmund/startseite/verein/16'),
  ('162', 'AS Monaco', 'Stade Louis-II', 'https://www.transfermarkt.co.uk/as-monaco/startseite/verein/162'),
  ('18487', 'Al-Ahli Saudi Football Club', 'King Abdullah Sports City', 'https://www.transfermarkt.co.uk/al-ahli-dschidda/startseite/verein/18487'),
  ('23826', 'RB Leipzig', 'Red Bull Arena', 'https://www.transfermarkt.co.uk/rasenballsport-leipzig/startseite/verein/23826'),
  ('24', 'Eintracht Frankfurt', 'Deutsche Bank Park', 'https://www.transfermarkt.co.uk/eintracht-frankfurt/startseite/verein/24'),
  ('27', 'Bayern Munich', 'Allianz Arena', 'https://www.transfermarkt.co.uk/fc-bayern-munchen/startseite/verein/27'),
  ('273', 'Stade Rennais FC', 'Roazhon Park', 'https://www.transfermarkt.co.uk/fc-stade-rennes/startseite/verein/273'),
  ('281', 'Manchester City', 'Etihad Stadium', 'https://www.transfermarkt.co.uk/manchester-city/startseite/verein/281'),
  ('289', 'Sunderland AFC', 'Stadium of Light', 'https://www.transfermarkt.co.uk/afc-sunderland/startseite/verein/289'),
  ('290', 'AJ Auxerre', 'Stade de l''Abbé-Deschamps', 'https://www.transfermarkt.co.uk/aj-auxerre/startseite/verein/290'),
  ('294', 'SL Benfica', 'Estádio da Luz', 'https://www.transfermarkt.co.uk/benfica-lissabon/startseite/verein/294'),
  ('3', '1.FC Köln', 'RheinEnergieSTADION', 'https://www.transfermarkt.co.uk/1-fc-koln/startseite/verein/3'),
  ('31', 'Liverpool FC', 'Anfield', 'https://www.transfermarkt.co.uk/fc-liverpool/startseite/verein/31'),
  ('336', 'Sporting CP', 'Estádio José Alvalade', 'https://www.transfermarkt.co.uk/sporting-lissabon/startseite/verein/336'),
  ('379', 'West Ham United', 'London Stadium', 'https://www.transfermarkt.co.uk/west-ham-united/startseite/verein/379'),
  ('405', 'Aston Villa', 'Villa Park', 'https://www.transfermarkt.co.uk/aston-villa/startseite/verein/405'),
  ('409', 'Fußballclub Red Bull Salzburg', 'Red Bull Arena Salzburg', 'https://www.transfermarkt.co.uk/red-bull-salzburg/startseite/verein/409'),
  ('418', 'Real Madrid', 'Santiago Bernabéu', 'https://www.transfermarkt.co.uk/real-madrid/startseite/verein/418'),
  ('449', 'Trabzonspor', 'Papara Park', 'https://www.transfermarkt.co.uk/trabzonspor/startseite/verein/449'),
  ('46', 'Inter Milan', 'Giuseppe Meazza', 'https://www.transfermarkt.co.uk/inter-mailand/startseite/verein/46'),
  ('506', 'Juventus FC', 'Allianz Stadium', 'https://www.transfermarkt.co.uk/juventus-turin/startseite/verein/506'),
  ('533', 'TSG 1899 Hoffenheim', 'PreZero Arena', 'https://www.transfermarkt.co.uk/tsg-1899-hoffenheim/startseite/verein/533'),
  ('583', 'Paris Saint-Germain', 'Parc des Princes', 'https://www.transfermarkt.co.uk/fc-paris-saint-germain/startseite/verein/583'),
  ('60', 'SC Freiburg', 'Europa-Park Stadion', 'https://www.transfermarkt.co.uk/sc-freiburg/startseite/verein/60'),
  ('631', 'Chelsea FC', 'Stamford Bridge', 'https://www.transfermarkt.co.uk/fc-chelsea/startseite/verein/631'),
  ('667', 'RC Strasbourg Alsace', 'Stade de la Meinau', 'https://www.transfermarkt.co.uk/rc-strassburg-alsace/startseite/verein/667'),
  ('720', 'FC Porto', 'Estádio do Dragão', 'https://www.transfermarkt.co.uk/fc-porto/startseite/verein/720'),
  ('762', 'Newcastle United', 'St James'' Park', 'https://www.transfermarkt.co.uk/newcastle-united/startseite/verein/762'),
  ('79', 'VfB Stuttgart', 'MHPArena Stuttgart', 'https://www.transfermarkt.co.uk/vfb-stuttgart/startseite/verein/79'),
  ('800', 'Atalanta BC', 'New Balance Arena - Bergamo', 'https://www.transfermarkt.co.uk/atalanta-bergamo/startseite/verein/800'),
  ('8023', 'Al-Ittihad Football Club', 'King Abdullah Sports City', 'https://www.transfermarkt.co.uk/al-ittihad-dschidda/startseite/verein/8023'),
  ('873', 'Crystal Palace', 'Selhurst Park', 'https://www.transfermarkt.co.uk/crystal-palace/startseite/verein/873'),
  ('985', 'Manchester United', 'Old Trafford', 'https://www.transfermarkt.co.uk/manchester-united/startseite/verein/985'),
  ('989', 'AFC Bournemouth', 'Vitality Stadium', 'https://www.transfermarkt.co.uk/afc-bournemouth/startseite/verein/989')
),
ins as (
  insert into clubs (name, city)
  select src.name, src.stadium from src
  on conflict do nothing
  returning id
)
select count(*) from ins;

with src(tm_id, name, url) as (values
  ('1023', 'Sociedade Esportiva Palmeiras', 'https://www.transfermarkt.co.uk/se-palmeiras-sao-paulo/startseite/verein/1023'),
  ('1025', 'Bologna Football Club 1909', 'https://www.transfermarkt.co.uk/fc-bologna/startseite/verein/1025'),
  ('1047', 'Como 1907', 'https://www.transfermarkt.co.uk/como-1907/startseite/verein/1047'),
  ('1050', 'Villarreal CF', 'https://www.transfermarkt.co.uk/fc-villarreal/startseite/verein/1050'),
  ('1082', 'LOSC Lille', 'https://www.transfermarkt.co.uk/losc-lille/startseite/verein/1082'),
  ('11', 'Arsenal FC', 'https://www.transfermarkt.co.uk/fc-arsenal/startseite/verein/11'),
  ('1148', 'Brentford FC', 'https://www.transfermarkt.co.uk/fc-brentford/startseite/verein/1148'),
  ('1158', 'FC Lorient', 'https://www.transfermarkt.co.uk/fc-lorient/startseite/verein/1158'),
  ('12', 'Associazione Sportiva Roma', 'https://www.transfermarkt.co.uk/as-rom/startseite/verein/12'),
  ('12321', 'Girona FC', 'https://www.transfermarkt.co.uk/fc-girona/startseite/verein/12321'),
  ('1237', 'Brighton & Hove Albion', 'https://www.transfermarkt.co.uk/brighton-amp-hove-albion/startseite/verein/1237'),
  ('13', 'Atlético de Madrid', 'https://www.transfermarkt.co.uk/atletico-madrid/startseite/verein/13'),
  ('131', 'FC Barcelona', 'https://www.transfermarkt.co.uk/fc-barcelona/startseite/verein/131'),
  ('1420', 'Angers SCO', 'https://www.transfermarkt.co.uk/sco-angers/startseite/verein/1420'),
  ('148', 'Tottenham Hotspur', 'https://www.transfermarkt.co.uk/tottenham-hotspur/startseite/verein/148'),
  ('15', 'Bayer 04 Leverkusen', 'https://www.transfermarkt.co.uk/bayer-04-leverkusen/startseite/verein/15'),
  ('16', 'Borussia Dortmund', 'https://www.transfermarkt.co.uk/borussia-dortmund/startseite/verein/16'),
  ('162', 'AS Monaco', 'https://www.transfermarkt.co.uk/as-monaco/startseite/verein/162'),
  ('18487', 'Al-Ahli Saudi Football Club', 'https://www.transfermarkt.co.uk/al-ahli-dschidda/startseite/verein/18487'),
  ('23826', 'RB Leipzig', 'https://www.transfermarkt.co.uk/rasenballsport-leipzig/startseite/verein/23826'),
  ('24', 'Eintracht Frankfurt', 'https://www.transfermarkt.co.uk/eintracht-frankfurt/startseite/verein/24'),
  ('27', 'Bayern Munich', 'https://www.transfermarkt.co.uk/fc-bayern-munchen/startseite/verein/27'),
  ('273', 'Stade Rennais FC', 'https://www.transfermarkt.co.uk/fc-stade-rennes/startseite/verein/273'),
  ('281', 'Manchester City', 'https://www.transfermarkt.co.uk/manchester-city/startseite/verein/281'),
  ('289', 'Sunderland AFC', 'https://www.transfermarkt.co.uk/afc-sunderland/startseite/verein/289'),
  ('290', 'AJ Auxerre', 'https://www.transfermarkt.co.uk/aj-auxerre/startseite/verein/290'),
  ('294', 'SL Benfica', 'https://www.transfermarkt.co.uk/benfica-lissabon/startseite/verein/294'),
  ('3', '1.FC Köln', 'https://www.transfermarkt.co.uk/1-fc-koln/startseite/verein/3'),
  ('31', 'Liverpool FC', 'https://www.transfermarkt.co.uk/fc-liverpool/startseite/verein/31'),
  ('336', 'Sporting CP', 'https://www.transfermarkt.co.uk/sporting-lissabon/startseite/verein/336'),
  ('379', 'West Ham United', 'https://www.transfermarkt.co.uk/west-ham-united/startseite/verein/379'),
  ('405', 'Aston Villa', 'https://www.transfermarkt.co.uk/aston-villa/startseite/verein/405'),
  ('409', 'Fußballclub Red Bull Salzburg', 'https://www.transfermarkt.co.uk/red-bull-salzburg/startseite/verein/409'),
  ('418', 'Real Madrid', 'https://www.transfermarkt.co.uk/real-madrid/startseite/verein/418'),
  ('449', 'Trabzonspor', 'https://www.transfermarkt.co.uk/trabzonspor/startseite/verein/449'),
  ('46', 'Inter Milan', 'https://www.transfermarkt.co.uk/inter-mailand/startseite/verein/46'),
  ('506', 'Juventus FC', 'https://www.transfermarkt.co.uk/juventus-turin/startseite/verein/506'),
  ('533', 'TSG 1899 Hoffenheim', 'https://www.transfermarkt.co.uk/tsg-1899-hoffenheim/startseite/verein/533'),
  ('583', 'Paris Saint-Germain', 'https://www.transfermarkt.co.uk/fc-paris-saint-germain/startseite/verein/583'),
  ('60', 'SC Freiburg', 'https://www.transfermarkt.co.uk/sc-freiburg/startseite/verein/60'),
  ('631', 'Chelsea FC', 'https://www.transfermarkt.co.uk/fc-chelsea/startseite/verein/631'),
  ('667', 'RC Strasbourg Alsace', 'https://www.transfermarkt.co.uk/rc-strassburg-alsace/startseite/verein/667'),
  ('720', 'FC Porto', 'https://www.transfermarkt.co.uk/fc-porto/startseite/verein/720'),
  ('762', 'Newcastle United', 'https://www.transfermarkt.co.uk/newcastle-united/startseite/verein/762'),
  ('79', 'VfB Stuttgart', 'https://www.transfermarkt.co.uk/vfb-stuttgart/startseite/verein/79'),
  ('800', 'Atalanta BC', 'https://www.transfermarkt.co.uk/atalanta-bergamo/startseite/verein/800'),
  ('8023', 'Al-Ittihad Football Club', 'https://www.transfermarkt.co.uk/al-ittihad-dschidda/startseite/verein/8023'),
  ('873', 'Crystal Palace', 'https://www.transfermarkt.co.uk/crystal-palace/startseite/verein/873'),
  ('985', 'Manchester United', 'https://www.transfermarkt.co.uk/manchester-united/startseite/verein/985'),
  ('989', 'AFC Bournemouth', 'https://www.transfermarkt.co.uk/afc-bournemouth/startseite/verein/989')
)
insert into club_external_ids (club_id, provider_code, namespace, external_id, url)
select cl.id, 'TRANSFERMARKT_DATASET', 'verein', src.tm_id, src.url
from src join clubs cl on cl.normalized_name = gbm_normalize_name(src.name)
on conflict do nothing;