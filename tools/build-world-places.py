#!/usr/bin/env python3
"""Builds js/world-places-data.js - the cities outside India offered by Settings > Location.

    python3 tools/build-world-places.py [workdir]      (default: /tmp/world-places-build)

What is listed (the lists are below; edit them and rebuild, never edit the js):
  * every country's capital (the 193 UN members, the Vatican, Palestine, Taiwan and Kosovo; a
    few countries with two seats of government list both), taken from GeoNames' capital flag;
  * the major cities of Europe and of the Americas (North, Central and South America and the Caribbean);
  * other cities where Indians commonly live, work, study, trade or go on pilgrimage: the Gulf,
    South and South-East Asia, East Africa, South Africa, the Indian-Ocean and Pacific islands,
    Australia and New Zealand, East Asia, and the Indian-heavy suburbs of US/UK/Canadian cities.
Sources (public, fetched once into `workdir` and cached there):
  * Coordinates, names and country/state - GeoNames (download.geonames.org/export/dump:
    cities15000, cities500, countryInfo, admin1CodesASCII).
  * Elevation - NASA SRTM-derived terrain tiles, AWS Open Data "Terrain Tiles" (terrarium, zoom 11),
    bilinear sample at the point, rounded to whole metres and never below 0 (the same method as
    build-india-places.py). GeoNames' own DEM value is the fallback and a cross-check.
Needs Python 3 with numpy and Pillow.
"""
import io, json, math, os, re, sys, unicodedata, urllib.request, zipfile
from concurrent.futures import ThreadPoolExecutor
import numpy as np
from PIL import Image

WORK = sys.argv[1] if len(sys.argv) > 1 else "/tmp/world-places-build"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "js", "world-places-data.js")
os.makedirs(WORK, exist_ok=True)
GN = "https://download.geonames.org/export/dump/"

def fetch(url, name):
    f = os.path.join(WORK, name)
    if not os.path.exists(f):
        with urllib.request.urlopen(url, timeout=300) as r, open(f, "wb") as o: o.write(r.read())
    return f

def gn_lines(name):
    if name.endswith(".zip"):
        with zipfile.ZipFile(fetch(GN + name, name)) as z:
            return z.read(name[:-4] + ".txt").decode("utf8").splitlines()
    return open(fetch(GN + name, name), encoding="utf8").read().splitlines()

def norm(s):
    return re.sub(r"[^a-z0-9]", "", "".join(c for c in unicodedata.normalize("NFD", s) if not unicodedata.combining(c)).lower())

# ---- elevation (terrarium tiles) - same method as build-india-places.py
Z = 11
def tile(x, y):
    f = os.path.join(WORK, f"t{Z}_{x}_{y}.npy")
    if os.path.exists(f): return np.load(f)
    u = f"https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{Z}/{x}/{y}.png"
    for t in range(4):
        try: d = urllib.request.urlopen(u, timeout=40).read(); break
        except Exception:
            if t == 3: raise
    a = np.asarray(Image.open(io.BytesIO(d)).convert("RGB")).astype(float)
    e = a[:, :, 0] * 256 + a[:, :, 1] + a[:, :, 2] / 256 - 32768
    np.save(f, e); return e
def txy(lat, lon):
    n = 2 ** Z
    return (lon + 180) / 360 * n, (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n
def elevation(lat, lon):
    fx, fy = txy(lat, lon); px = fx * 256 - 0.5; py = fy * 256 - 0.5
    x0, y0 = math.floor(px), math.floor(py); dx, dy = px - x0, py - y0
    v = lambda X, Y: tile(X // 256, Y // 256)[Y % 256, X % 256]
    e = v(x0, y0) * (1 - dx) * (1 - dy) + v(x0 + 1, y0) * dx * (1 - dy) + v(x0, y0 + 1) * (1 - dx) * dy + v(x0 + 1, y0 + 1) * dx * dy
    return round(max(0, e))

# ---- the lists
# Countries that are not sovereign states (GeoNames lists them with a capital): left out.
# Hong Kong, Macao and Reunion are listed below instead, as places Indians are found.
NOT_SOVEREIGN = set("""AX AS AI AQ AW BM BQ BV IO VG KY CX CC CK CW FK FO GF PF TF GI GL GP GU GG HM HK IM JE MO MQ YT AN NC NU NF
MP PN PR RE BL SH MF PM SX GS SJ TK TC VI UM WF EH CS MS""".split())
# Capitals GeoNames does not flag as one, and second seats of government: country code -> specs.
EXTRA_CAPITALS = {"IL": "Jerusalem", "PS": "Ramallah"}
SECOND_SEATS = {"ZA": "Cape Town, Bloemfontein", "BO": "La Paz", "LK": "Sri Jayewardenepura Kotte=Sri Jayawardenepura Kotte", "TZ": "Dar es Salaam",
                "CI": "Abidjan", "BJ": "Cotonou", "NL": "The Hague", "MY": "Putrajaya", "BI": "Bujumbura", "GQ": "Malabo"}
# Name shown for a capital whose GeoNames name is not the usual English one (or has an accent/apostrophe quirk).
CAPITAL_DISPLAY = {"Ulan Bator": "Ulaanbaatar", "Nay Pyi Taw": "Naypyidaw", "Port-Vila": "Port Vila", "Washington": "Washington, D.C.",
                   "Saint John’s": "St. John's", "Saint George's": "St. George's", "Nuku‘alofa": "Nuku'alofa", "Saint Helier": "St. Helier", "Male": "Malé"}
COUNTRY_DISPLAY = {"Macao": "Macau", "Reunion": "Réunion", "The Netherlands": "Netherlands", "Timor Leste": "Timor-Leste", "Palestinian Territory": "Palestine", "Vatican": "Vatican City",
                   "Cabo Verde": "Cape Verde"}
# Other names people type for a place, by the name shown.
ALTS = {
 "Kyiv": ["Kiev"], "Beijing": ["Peking"], "Ho Chi Minh City": ["Saigon"], "Yangon": ["Rangoon"], "Naypyidaw": ["Nay Pyi Taw"],
 "Ulaanbaatar": ["Ulan Bator"], "Mexico City": ["Ciudad de Mexico", "CDMX"], "New York": ["NYC", "New York City", "Manhattan"],
 "Washington, D.C.": ["Washington DC", "DC"], "Cologne": ["Koln"], "Munich": ["Munchen"], "Prague": ["Praha"], "Vienna": ["Wien"],
 "Rome": ["Roma"], "Milan": ["Milano"], "Naples": ["Napoli"], "Turin": ["Torino"], "Venice": ["Venezia"], "Florence": ["Firenze"],
 "Lisbon": ["Lisboa"], "Warsaw": ["Warszawa"], "Copenhagen": ["Kobenhavn"], "Gothenburg": ["Goteborg"], "Moscow": ["Moskva"],
 "Saint Petersburg": ["St Petersburg", "Leningrad"], "Athens": ["Athina"], "Brussels": ["Bruxelles"], "Geneva": ["Geneve"],
 "Hannover": ["Hanover"], "Seville": ["Sevilla"], "Thessaloniki": ["Salonika"], "Bucharest": ["Bucuresti"], "Belgrade": ["Beograd"],
 "Antwerp": ["Antwerpen"], "Ghent": ["Gent"], "The Hague": ["Den Haag"], "Quebec City": ["Quebec"], "George Town": ["Penang", "Georgetown"],
 "Melaka": ["Malacca"], "Gqeberha": ["Port Elizabeth"], "Zanzibar City": ["Zanzibar"], "Istanbul": ["Constantinople"],
 "Tel Aviv": ["Tel Aviv-Yafo"], "Jeddah": ["Jidda"], "Mecca": ["Makkah"], "Medina": ["Madinah"], "Dhaka": ["Dacca"],
 "Chittagong": ["Chattogram"], "Sri Jayawardenepura Kotte": ["Kotte", "Sri Jayewardenepura Kotte"], "Macau": ["Macao"],
 "Al Khobar": ["Khobar"], "Cusco": ["Cuzco"], "Santa Cruz de la Sierra": ["Santa Cruz"], "San Francisco": ["SF"], "Los Angeles": ["LA"],
 "Hong Kong": ["HK"], "Abu Dhabi": ["Abu Zaby"], "Cebu": ["Cebu City"], "Saint Louis": [],
}
for k in [k for k, v in ALTS.items() if not v]: del ALTS[k]

# Curated cities: country code -> comma-separated specs.   Name[@state][=Shown]
#   Name   : as GeoNames spells it (accents and case do not matter)
#   @state : GeoNames state/province name or code, to tell apart same-named places in one country
#   =Shown : the name to show when it is not GeoNames' (usually the common English one)
EUROPE = {
 "GB": "Birmingham, Manchester, Leeds, Glasgow, Liverpool, Sheffield, Edinburgh, Bristol, Leicester, Bradford, Coventry, Nottingham, Cardiff, Belfast, Newcastle upon Tyne, Southampton, Reading, Slough, Luton, Cambridge, Oxford, Milton Keynes, Wolverhampton, Southall, Wembley, Harrow, Croydon, Aberdeen, Derby, Swansea, Plymouth, Dundee",
 "IE": "Cork, Galway, Limerick",
 "FR": "Marseille, Lyon, Toulouse, Nice, Nantes, Strasbourg, Montpellier, Bordeaux, Lille, Rennes, Grenoble, Toulon",
 "DE": "Hamburg, Munich, Köln=Cologne, Frankfurt am Main=Frankfurt, Stuttgart, Düsseldorf, Dortmund, Essen, Leipzig, Bremen, Dresden, Hannover, Nuremberg, Duisburg, Bochum, Bonn, Karlsruhe, Mannheim, Münster, Wiesbaden, Wuppertal, Bielefeld, Augsburg, Aachen, Darmstadt",
 "IT": "Milan, Naples, Turin, Palermo, Genoa, Bologna, Florence, Venice, Verona, Bari, Catania, Padova=Padua",
 "ES": "Barcelona, Valencia, Sevilla=Seville, Zaragoza, Málaga, Murcia, Palma, Las Palmas de Gran Canaria=Las Palmas, Bilbao, Alicante",
 "PT": "Porto",
 "NL": "Rotterdam, Utrecht, Eindhoven, Groningen",
 "BE": "Antwerp, Gent=Ghent, Liège=Liege",
 "CH": "Zürich=Zurich, Geneva, Basel, Lausanne",
 "AT": "Graz, Linz, Salzburg",
 "SE": "Gothenburg, Malmö, Uppsala",
 "NO": "Bergen, Trondheim, Stavanger",
 "DK": "Århus=Aarhus, Odense",
 "FI": "Espoo, Tampere, Turku",
 "PL": "Kraków, Wrocław, Łódź, Poznań, Gdańsk, Szczecin",
 "CZ": "Brno",
 "HU": "Debrecen",
 "RO": "Cluj-Napoca, Timișoara=Timisoara, Iași=Iasi",
 "BG": "Plovdiv, Varna",
 "GR": "Thessaloníki=Thessaloniki",
 "HR": "Split",
 "UA": "Kharkiv, Odesa, Dnipro, Lviv",
 "BY": "Homyel'=Gomel",
 "RU": "Saint Petersburg, Novosibirsk, Yekaterinburg, Kazan, Nizhniy Novgorod=Nizhny Novgorod, Samara, Rostov-on-Don, Krasnodar, Vladivostok, Volgograd, Ufa, Perm, Sochi, Kaliningrad, Chelyabinsk, Omsk, Krasnoyarsk, Voronezh, Astrakhan",
 "TR": "Istanbul, İzmir=Izmir, Antalya",
 "CY": "Limassol",
}
AMERICAS = {
 "US": ("New York City@New York=New York, Los Angeles, Chicago, Houston, Phoenix, Philadelphia, San Antonio, San Diego, Dallas, San Jose, Austin, Jacksonville, Fort Worth, Columbus@Ohio, Charlotte, San Francisco, Indianapolis, "
        "Seattle, Denver, Boston, El Paso, Nashville, Detroit, Oklahoma City, Portland@Oregon, Las Vegas, Memphis, Louisville, Baltimore, Milwaukee, Albuquerque, Tucson, Fresno, Sacramento, Mesa, Kansas City@Missouri, Atlanta, "
        "Omaha, Colorado Springs, Raleigh, Miami, Virginia Beach, Long Beach, Oakland, Minneapolis, Tulsa, Tampa, New Orleans, Wichita, Cleveland, Honolulu, Anaheim, Pittsburgh, Cincinnati, St. Louis@Missouri, Orlando, Salt Lake City, "
        "Anchorage, Richmond@Virginia, Buffalo, Hartford, Providence, Birmingham@Alabama, Charleston@South Carolina, Madison@Wisconsin, Des Moines, Little Rock, Boise, Albany@New York"),
 "CA": "Toronto, Montréal=Montreal, Calgary, Edmonton, Winnipeg, Mississauga, Vancouver, Brampton, Hamilton@Ontario, Surrey, Québec=Quebec City, Halifax, London@Ontario, Markham, Vaughan, Kitchener, Windsor@Ontario, Victoria@British Columbia, Saskatoon, Regina, Burnaby, Richmond Hill, Oakville, Waterloo, Laval",
 "MX": "Guadalajara, Monterrey, Puebla, Tijuana, León de los Aldama=León, Ciudad Juárez=Juárez, Cancún, Mérida, Santiago de Querétaro=Querétaro",
 "BR": "São Paulo, Rio de Janeiro, Belo Horizonte, Salvador, Fortaleza, Curitiba, Recife, Porto Alegre, Manaus, Belém, Goiânia, Campinas",
 "AR": "Córdoba, Rosario, Mendoza",
 "PE": "Arequipa, Cusco",
 "CO": "Medellín, Cali, Barranquilla, Cartagena",
 "CL": "Valparaíso, Concepción, Iquique",
 "VE": "Maracaibo, Valencia",
 "EC": "Guayaquil, Cuenca",
 "BO": "Santa Cruz de la Sierra, Cochabamba",
 "PY": "Ciudad del Este",
 "TT": "San Fernando, Chaguanas",
 "DO": "Santiago de los Caballeros",
 "HN": "San Pedro Sula",
 "PA": "Colón",
 "JM": "Montego Bay",
}
# Where Indians are commonly found, outside Europe and the Americas (and the Indian-heavy suburbs inside them).
DIASPORA = {
 "AE": "Dubai, Sharjah, Ajman, Ras Al Khaimah, Fujairah, Al Ain City=Al Ain",
 "SA": "Jeddah, Makkah=Mecca, Madinah=Medina, Dammam, Khobar=Al Khobar, Dhahran, Yanbu, Ta’if=Taif, Abha",
 "OM": "Sohar, Şalālah=Salalah, Nizwá=Nizwa",
  "IR": "Mashhad, Isfahan, Shiraz",
 "IQ": "Najaf, Karbala, Basrah=Basra",
 "IL": "Tel Aviv, Haifa",
 "EG": "Alexandria",
 "JO": "Aqaba",
 "PK": "Karachi, Lahore, Peshawar, Rawalpindi",
 "BD": "Chattogram=Chittagong, Sylhet, Khulna",
 "LK": "Kandy, Jaffna, Galle, Negombo",
 "NP": "Pokhara, Biratnagar, Birganj=Birgunj",
 "BT": "Phuntsholing, Paro",
 "AF": "Kandahār=Kandahar, Mazār-e Sharīf=Mazar-i-Sharif",
 "MY": "George Town, Johor Bahru, Ipoh, Klang, Shah Alam, Petaling Jaya, Malacca=Melaka, Seremban, Kota Kinabalu, Kuching",
 "TH": "Phuket, Pattaya, Chiang Mai",
 "ID": "Medan, Surabaya, Bandung, Denpasar",
 "PH": "Cebu City=Cebu, Davao",
 "MM": "Yangon, Mandalay",
 "VN": "Ho Chi Minh City, Da Nang",
 "KH": "Siem Reap",
 "JP": "Osaka, Yokohama, Nagoya, Kobe, Kyoto",
 "KR": "Busan",
 "CN": "Shanghai, Guangzhou, Shenzhen, Chengdu, Hangzhou, Yiwu",
 "TW": "Kaohsiung",
 "KZ": "Almaty",
 "KG": "Osh",
 "UZ": "Samarkand",
 "KE": "Mombasa, Kisumu",
 "UG": "Jinja",
 "TZ": "Zanzibar=Zanzibar City, Arusha",
 "ZM": "Ndola",
 "MW": "Blantyre",
 "ZW": "Bulawayo",
 "ZA": "Johannesburg, Durban, Gqeberha, Pietermaritzburg",
 "NG": "Lagos",
 "GH": "Kumasi",
 "CM": "Douala",
 "MA": "Casablanca",
 "AU": "Sydney, Melbourne, Brisbane, Perth, Adelaide, Gold Coast, Parramatta, Newcastle@New South Wales, Wollongong, Darwin, Hobart",
 "NZ": "Auckland, Christchurch, Hamilton",
 "FJ": "Lautoka, Nadi, Labasa",
 "US": ("Sunnyvale, Santa Clara, Fremont, Milpitas, Cupertino, Mountain View, Palo Alto, Pleasanton, Dublin@California, Edison@New Jersey, Jersey City, Newark@New Jersey, Princeton@New Jersey, Plano, Irving, Frisco, Schaumburg, "
        "Naperville, Bellevue@Washington, Redmond, Cary, Sugar Land, Troy@Michigan, Duluth@Georgia, Alpharetta, Herndon, Sterling@Virginia, Rockville, Parsippany, Piscataway, Cambridge@Massachusetts, Lowell, Hoboken, Irvine, Stamford, "
        "Iselin, Artesia, Fairfax, Ann Arbor, Columbia@Maryland, Overland Park, Chandler, Scottsdale, Gainesville@Florida"),
}
SPECIAL = {"HK": "Hong Kong", "MO": "Macau", "RE": "Saint-Denis"}

def parse(spec):
    """'Köln=Cologne' -> (name, state hint, shown). Splits on commas that are not part of a '=Shown' name."""
    out = []
    for part in [p.strip() for p in spec.split(",") if p.strip()]:
        m = re.match(r"^([^@=]+?)(?:@([^=]+))?(?:=(.+))?$", part)
        out.append((m.group(1).strip(), (m.group(2) or "").strip(), (m.group(3) or "").strip()))
    return out

def main():
    countries = {}
    for l in gn_lines("countryInfo.txt"):
        if l.startswith("#") or not l.strip(): continue
        f = l.split("\t"); countries[f[0]] = f[4]
    adm1 = {}
    for l in gn_lines("admin1CodesASCII.txt"):
        f = l.split("\t"); adm1[f[0]] = f[2]          # "US.TX" -> "Texas" (the ASCII name)
    rows = {}
    for src in ("cities15000.zip", "cities500.zip"):
        for l in gn_lines(src):
            f = l.split("\t")
            if f[0] in rows: continue
            rows[f[0]] = dict(id=f[0], name=f[1], ascii=f[2], alts=f[3], lat=float(f[4]), lon=float(f[5]), code=f[7], cc=f[8],
                              a1=f[10], pop=int(f[14] or 0), dem=int(f[16]) if f[16].lstrip("-").isdigit() else None)
    by_cc = {}
    for r in rows.values(): by_cc.setdefault(r["cc"], []).append(r)

    def state_name(r): return adm1.get(r["cc"] + "." + r["a1"], "")
    def find(cc, name, hint=""):
        n = norm(name)
        c = [r for r in by_cc.get(cc, []) if n in (norm(r["name"]), norm(r["ascii"]))]
        if hint:
            h = norm(hint); c = [r for r in c if h in (norm(state_name(r)), norm(r["a1"]))]
        if not c: return None
        # a populated place, the capital if it is one, else the biggest
        return max(c, key=lambda r: (r["code"] == "PPLC", r["pop"]))

    chosen = {}     # geoname id -> [row, shown name, is capital]
    problems = []
    def add(r, shown, cap):
        e = chosen.get(r["id"])
        if e: e[2] = e[2] or cap; return
        chosen[r["id"]] = [r, shown or r["name"], cap]

    # 1. capitals
    sovereign = [cc for cc in countries if cc not in NOT_SOVEREIGN]
    for cc in sovereign:
        if cc in EXTRA_CAPITALS:
            r = find(cc, parse(EXTRA_CAPITALS[cc])[0][0])
        else:
            r = max([r for r in by_cc.get(cc, []) if r["code"] == "PPLC"] or [None], key=lambda r: r["pop"] if r else -1)
        if not r: problems.append(("capital", cc, countries[cc])); continue
        add(r, CAPITAL_DISPLAY.get(r["name"]), True)
    for cc, spec in SECOND_SEATS.items():
        for name, hint, shown in parse(spec):
            r = find(cc, name, hint)
            if r: add(r, shown or CAPITAL_DISPLAY.get(r["name"]), True)
            else: problems.append(("seat", cc, name))
    for cc, name in SPECIAL.items():
        r = find(cc, name)
        if r: add(r, CAPITAL_DISPLAY.get(r["name"]), False)
        else: problems.append(("special", cc, name))
    # 2. the curated lists
    for table in (EUROPE, AMERICAS, DIASPORA):
        for cc, spec in table.items():
            for name, hint, shown in parse(spec):
                r = find(cc, name, hint)
                if r: add(r, shown or CAPITAL_DISPLAY.get(r["name"]), False)
                else: problems.append(("city", cc, name + ("@" + hint if hint else "")))
    if problems:
        for p in problems: print("NOT FOUND", p)
        sys.exit("fix the lists above")

    # elevation
    pts = [(r["lat"], r["lon"]) for r, _, _ in chosen.values()]
    keys = sorted({tuple(map(math.floor, txy(la, lo))) for la, lo in pts})
    with ThreadPoolExecutor(8) as ex: list(ex.map(lambda k: tile(*k), keys))

    out = []
    for r, shown, cap in chosen.values():
        country = COUNTRY_DISPLAY.get(countries[r["cc"]], countries[r["cc"]])
        region = state_name(r) if r["cc"] in ("US", "CA", "AU") else ""
        if r["name"] == "Washington": region = ""        # the District is not a state
        e = elevation(r["lat"], r["lon"])
        if r["dem"] is not None and abs(e - max(0, r["dem"])) > 150:
            print("elevation check:", shown, country, "terrain", e, "GeoNames DEM", r["dem"])
        row = [shown, country, region, round(r["lat"], 4), round(r["lon"], 4), e, 1 if cap else 0]
        alts = ALTS.get(shown)
        if alts: row.append(alts)
        out.append(row)
    out.sort(key=lambda t: (t[1], -t[6], t[0]))
    names = {}
    for t in out: names.setdefault(t[0], []).append(t[1])
    for n, cs in names.items():
        if len(cs) > 1: print("same name in several countries (the label shows the country):", n, cs)

    head = ("// Generated by tools/build-world-places.py - do not edit by hand.\n"
            "// cities: [name, country, state/province (US, Canada, Australia only, else \"\"), lat, lon, elevation m,\n"
            "//   1 if a country's capital or seat of government, optional [other spellings]]. Every country's capital,\n"
            "//   the major cities of Europe and the Americas, and cities where Indians commonly live or go.\n"
            "// Sources: coordinates and names (GeoNames), elevation (NASA SRTM via AWS Terrain Tiles). See the script.\n")
    js = head + "(function (g) { (g.VedicEngine = g.VedicEngine || {}).WorldPlacesData = {\n  cities: [\n" + \
         ",\n".join("    " + json.dumps(t, ensure_ascii=False, separators=(",", ":")) for t in out) + "\n  ]\n}; })(typeof window !== \"undefined\" ? window : globalThis);\n"
    open(OUT, "w", encoding="utf8").write(js)
    caps = sum(t[6] for t in out)
    print(len(out), "cities (", caps, "capitals / seats ) ->", os.path.relpath(OUT))

main()
