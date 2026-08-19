#!/usr/bin/env python3
"""
Generate a COMPACT SQL sample load from the Transfermarkt dataset.

Emits set-based `with src(...) as (values ...)` statements rather than one
INSERT per row. This keeps the generated SQL small enough to apply through the
Supabase MCP connection before the service-role key is available for the full
TypeScript importer.

Selection is deliberately balanced so the sample exercises every platform
feature: players with and without a listed agency, a spread of ages and
positions, contract expiries, market-value history and transfers.
"""

import csv, os, sys, datetime, collections
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / "data"
OUT = DATA / "sql"
OUT.mkdir(exist_ok=True)
for f in OUT.glob("*.sql"):
    f.unlink()

TODAY = datetime.date(2026, 8, 19)
P = "TRANSFERMARKT_DATASET"
TARGET_PLAYERS = 120
MV_DEPTH = 10          # most recent valuations per player


def q(v):
    if v is None:
        return "NULL"
    s = str(v).strip()
    if s == "" or s.lower() in ("nan", "none", "null"):
        return "NULL"
    return "'" + s.replace("'", "''") + "'"


def num(v):
    s = (str(v).strip() if v is not None else "")
    if not s:
        return "NULL"
    try:
        f = float(s)
        return str(int(f)) if f.is_integer() else str(f)
    except ValueError:
        return "NULL"


def d(v):
    if not v or not v.strip():
        return "NULL"
    return q(v.strip()[:10])


def age_of(dob):
    try:
        return (TODAY - datetime.date.fromisoformat(dob[:10])).days / 365.25
    except Exception:
        return None


def read(name):
    with open(DATA / f"{name}.csv", encoding="utf-8") as f:
        return list(csv.DictReader(f))


players = read("players")
clubs = read("clubs")
competitions = read("competitions")
valuations = read("player_valuations")
transfers = read("transfers")

active = [p for p in players if p["last_season"].strip() in ("2025", "2026")]


def by_value(rows):
    return sorted(rows, key=lambda r: -(int(r["market_value_in_eur"]) if r["market_value_in_eur"].strip() else 0))


young_no_agency = [p for p in active if not p["agent_name"].strip()
                   and (a := age_of(p["date_of_birth"])) is not None and 15 <= a <= 23]
young_agency = [p for p in active if p["agent_name"].strip()
                and (a := age_of(p["date_of_birth"])) is not None and 15 <= a <= 23]
senior = [p for p in active if (a := age_of(p["date_of_birth"])) is not None and a > 23]

selected = by_value(young_no_agency)[:50] + by_value(young_agency)[:40] + by_value(senior)[:30]
seen, chosen = set(), []
for p in selected:
    if p["player_id"] in seen:
        continue
    seen.add(p["player_id"])
    chosen.append(p)
chosen = chosen[:TARGET_PLAYERS]
chosen_ids = {p["player_id"] for p in chosen}

club_ids = {p["current_club_id"] for p in chosen if p["current_club_id"].strip()}
clubs_sel = [c for c in clubs if c["club_id"] in club_ids]
comp_ids = {c["domestic_competition_id"] for c in clubs_sel if c["domestic_competition_id"].strip()}
comps_sel = [c for c in competitions if c["competition_id"] in comp_ids]

country_names = sorted({n.strip() for p in chosen
                        for n in (p["country_of_citizenship"], p["country_of_birth"]) if n.strip()})
CONFED = {c["country_name"].strip(): c["confederation"].strip()
          for c in competitions if c.get("country_name")}

files = []


def emit(name, sql):
    (OUT / name).write_text(sql, encoding="utf-8")
    files.append(name)
    print(f"{name}\t{len(sql)//1024}KB", file=sys.stderr)


# --- 01 reference: countries, competitions, clubs --------------------------
parts = []
parts.append(
    "insert into countries (name, confederation)\nselect * from (values\n  "
    + ",\n  ".join(f"({q(n)}, {q(CONFED.get(n) or None)})" for n in country_names)
    + "\n) as v(name, confederation)\non conflict do nothing;"
)

TIER = {"domestic_league": "FIRST_TIER", "domestic_cup": "CUP",
        "international_cup": "CONTINENTAL", "other": "UNKNOWN"}
parts.append(
    "with src(tm_id, name, code, country, tier, url) as (values\n  "
    + ",\n  ".join(
        f"({q(c['competition_id'])}, {q(c['name'])}, {q(c['competition_code'])}, "
        f"{q(c['country_name'])}, {q(TIER.get(c['type'].strip(), 'UNKNOWN'))}, {q(c['url'])})"
        for c in comps_sel)
    + "\n),\nins as (\n"
    "  insert into competitions (name, short_name, country_id, area_name, tier)\n"
    "  select src.name, src.code, c.id, src.country, src.tier::competition_tier\n"
    "  from src left join countries c on c.normalized_name = gbm_normalize_name(src.country)\n"
    "  on conflict do nothing\n"
    "  returning id\n)\n"
    "select count(*) from ins;"
)
# Map external ids in a separate statement so re-runs still attach ids for
# competitions that already existed (ON CONFLICT DO NOTHING returns no rows).
parts.append(
    "with src(tm_id, name, country, url) as (values\n  "
    + ",\n  ".join(
        f"({q(c['competition_id'])}, {q(c['name'])}, {q(c['country_name'])}, {q(c['url'])})"
        for c in comps_sel)
    + "\n)\n"
    f"insert into competition_external_ids (competition_id, provider_code, namespace, external_id, url)\n"
    f"select comp.id, '{P}', 'wettbewerb', src.tm_id, src.url\n"
    "from src join competitions comp\n"
    "  on comp.normalized_name = gbm_normalize_name(src.name)\n"
    " and coalesce(comp.area_name, '') = coalesce(src.country, '')\n"
    "on conflict do nothing;"
)

parts.append(
    "with src(tm_id, name, stadium, url) as (values\n  "
    + ",\n  ".join(
        f"({q(c['club_id'])}, {q(c['name'])}, {q(c['stadium_name'])}, {q(c['url'])})"
        for c in clubs_sel)
    + "\n),\nins as (\n"
    "  insert into clubs (name, city)\n"
    "  select src.name, src.stadium from src\n"
    "  on conflict do nothing\n"
    "  returning id\n)\n"
    "select count(*) from ins;"
)
parts.append(
    "with src(tm_id, name, url) as (values\n  "
    + ",\n  ".join(
        f"({q(c['club_id'])}, {q(c['name'])}, {q(c['url'])})" for c in clubs_sel)
    + "\n)\n"
    f"insert into club_external_ids (club_id, provider_code, namespace, external_id, url)\n"
    f"select cl.id, '{P}', 'verein', src.tm_id, src.url\n"
    "from src join clubs cl on cl.normalized_name = gbm_normalize_name(src.name)\n"
    "on conflict do nothing;"
)
emit("01_reference.sql", "\n\n".join(parts))

# --- 02 players + external ids + representation + contracts ----------------
FOOT = {"left": "LEFT", "right": "RIGHT", "both": "BOTH"}
for bi in range(0, len(chosen), 120):
    chunk = chosen[bi:bi + 200]
    rows = ",\n  ".join(
        "(" + ", ".join([
            q(p["player_id"]), q(p["name"]), q(p["first_name"]), q(p["last_name"]),
            d(p["date_of_birth"]), q(p["country_of_citizenship"]), q(p["country_of_birth"]),
            q(p["city_of_birth"]), num(p["height_in_cm"]),
            q(FOOT.get(p["foot"].strip().lower(), "UNKNOWN")),
            q(p["sub_position"] or p["position"]), q(p["current_club_id"]),
            q(p["image_url"]), q(p["url"]),
            "true" if p["position"].strip() == "Goalkeeper" else "false",
            q(p["agent_name"]), d(p["contract_expiration_date"]),
        ]) + ")"
        for p in chunk)

    values_cte = f"""with src(tm_id, name, first, last, dob, nat, born, city, height, foot, pos, club_tm, img, url, gk, agent, contract) as (values
  {rows}
)"""

    # Statement 1 — create only players whose Transfermarkt id is not already
    # mapped. The guard, not a unique constraint on (name, dob), is what makes
    # this import idempotent: real footballers can share a name and birthdate.
    sql = f"""{values_cte},
unmapped as (
  select src.* from src
  where not exists (
    select 1 from player_external_ids e
    where e.provider_code = '{P}' and e.namespace = 'spieler' and e.external_id = src.tm_id
  )
),
ins as (
  insert into players (full_name, first_name, last_name, date_of_birth,
                       nationality_country_id, birth_country_id, birth_place,
                       height_cm, foot, primary_position, current_club_id,
                       image_url, is_goalkeeper)
  select u.name, u.first, u.last, u.dob::date,
         nc.id, bc.id, u.city,
         u.height::int, u.foot::preferred_foot, u.pos, cl.id,
         u.img, u.gk::boolean
  from unmapped u
  left join countries nc on nc.normalized_name = gbm_normalize_name(u.nat)
  left join countries bc on bc.normalized_name = gbm_normalize_name(u.born)
  left join club_external_ids ce
         on ce.provider_code = '{P}' and ce.external_id = u.club_tm
  left join clubs cl on cl.id = ce.club_id
  returning id, full_name, date_of_birth
)
insert into player_external_ids (player_id, provider_code, namespace, external_id, url, confidence, match_method)
select ins.id, '{P}', 'spieler', u.tm_id, u.url, 1.000, 'EXACT_PROVIDER_MAPPING'
from ins
join unmapped u on u.name = ins.full_name and u.dob::date = ins.date_of_birth
on conflict do nothing;"""
    emit(f"02a_players_{bi//120 + 1:02d}.sql", sql)

    # Statement 2 — representation + contracts, joined through the now-present
    # external id. Runs correctly on both first load and re-runs.
    sql = f"""{values_cte},
mapped as (
  select src.*, e.player_id
  from src
  join player_external_ids e
    on e.provider_code = '{P}' and e.namespace = 'spieler' and e.external_id = src.tm_id
),
rep as (
  insert into representation_records (player_id, agency_name, status, provider_code, source_url)
  select m.player_id, m.agent,
         case when m.agent is null then 'NO_AGENCY_LISTED' else 'KNOWN_AGENCY' end::representation_status,
         '{P}', m.url
  from mapped m
  on conflict do nothing
  returning player_id
)
insert into contracts (player_id, club_id, expires_on, provider_code, source_url)
select m.player_id, cl.id, m.contract::date, '{P}', m.url
from mapped m
left join club_external_ids ce on ce.provider_code = '{P}' and ce.external_id = m.club_tm
left join clubs cl on cl.id = ce.club_id
where m.contract is not null
on conflict do nothing;"""
    emit(f"02b_repcontract_{bi//120 + 1:02d}.sql", sql)

# --- 03 market values ------------------------------------------------------
by_player = collections.defaultdict(list)
for v in valuations:
    if v["player_id"] in chosen_ids and v["market_value_in_eur"].strip():
        by_player[v["player_id"]].append(v)

mv_rows = []
for pid, rows in by_player.items():
    rows.sort(key=lambda r: r["date"])
    for v in rows[-MV_DEPTH:]:
        mv_rows.append((pid, v["market_value_in_eur"], v["date"]))

for bi in range(0, len(mv_rows), 1500):
    chunk = mv_rows[bi:bi + 1500]
    rows = ",\n  ".join(f"({q(a)}, {num(b)}, {d(c)})" for a, b, c in chunk)
    sql = f"""with src(tm_id, val, on_date) as (values
  {rows}
)
insert into market_values (player_id, value_amount, currency, valued_on, provider_code)
select e.player_id, src.val::numeric, 'EUR', src.on_date::date, '{P}'
from src
join player_external_ids e
  on e.provider_code = '{P}' and e.namespace = 'spieler' and e.external_id = src.tm_id
on conflict do nothing;"""
    emit(f"03_market_values_{bi//1500 + 1:02d}.sql", sql)

# --- 04 transfers ----------------------------------------------------------
tr = [t for t in transfers if t["player_id"] in chosen_ids]
for bi in range(0, len(tr), 1200):
    chunk = tr[bi:bi + 1200]
    rows = ",\n  ".join(
        f"({q(t['player_id'])}, {q(t['from_club_name'])}, {q(t['to_club_name'])}, "
        f"{d(t['transfer_date'])}, {q(t['transfer_season'])}, {num(t['transfer_fee'])}, "
        f"{num(t['market_value_in_eur'])})"
        for t in chunk)
    sql = f"""with src(tm_id, from_club, to_club, on_date, season, fee, mv) as (values
  {rows}
)
insert into transfers (player_id, from_club_name_raw, to_club_name_raw, transfer_date,
                       season_name, fee_amount, fee_currency, market_value_at_transfer,
                       is_free, provider_code)
select e.player_id, src.from_club, src.to_club, src.on_date::date, src.season,
       src.fee::numeric, 'EUR', src.mv::numeric,
       coalesce(src.fee::numeric, -1) = 0, '{P}'
from src
join player_external_ids e
  on e.provider_code = '{P}' and e.namespace = 'spieler' and e.external_id = src.tm_id
on conflict do nothing;"""
    emit(f"04_transfers_{bi//1200 + 1:02d}.sql", sql)

print(f"\nplayers={len(chosen)} clubs={len(clubs_sel)} comps={len(comps_sel)} "
      f"countries={len(country_names)} mv={len(mv_rows)} transfers={len(tr)}", file=sys.stderr)
