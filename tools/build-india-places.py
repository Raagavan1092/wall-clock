#!/usr/bin/env python3
"""Builds js/india-places-data.js - the offline place list behind Settings > Location.

    python3 tools/build-india-places.py [workdir]      (default: /tmp/india-places-build)

Sources (all public, fetched once into `workdir` and cached there):
  * District boundaries - udit-001/india-maps-data (github.com), per-state GeoJSON of
    India's current districts (Survey of India / Census / LGD based). A district's
    point is the centroid of its largest part, moved to the nearest interior point
    when the centroid falls outside the district; Leh uses Leh town (its claimed
    area is far larger than the inhabited district).
  * Town coordinates - GeoNames (via lutangar/cities.json, a GeoNames extract of
    places with 1000+ people). A few towns GeoNames lacks under that spelling keep
    hand-entered coordinates (marked below) that were checked to lie inside their
    district.
  * Elevation - NASA SRTM-derived terrain tiles, AWS Open Data "Terrain Tiles"
    (s3://elevation-tiles-prod/terrarium), zoom 11 (~75 m), bilinear sample at the
    point, rounded to whole metres.
Needs Python 3 with numpy and Pillow.
"""
import io, json, math, os, re, sys, unicodedata, urllib.request
from concurrent.futures import ThreadPoolExecutor
import numpy as np
from PIL import Image

WORK = sys.argv[1] if len(sys.argv) > 1 else "/tmp/india-places-build"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "js", "india-places-data.js")
os.makedirs(WORK, exist_ok=True)
BASE = "https://raw.githubusercontent.com/udit-001/india-maps-data/main/geojson/states/"
STATES = """andaman-and-nicobar-islands andhra-pradesh arunachal-pradesh assam bihar chandigarh chhattisgarh delhi
dnh-and-dd goa gujarat haryana himachal-pradesh jammu-and-kashmir jharkhand karnataka kerala ladakh lakshadweep
madhya-pradesh maharashtra manipur meghalaya mizoram nagaland odisha puducherry punjab rajasthan sikkim tamil-nadu
telangana tripura uttar-pradesh uttarakhand west-bengal""".split()
CITIES = "https://raw.githubusercontent.com/lutangar/cities.json/master/cities.json"

def fetch(url, name):
    f = os.path.join(WORK, name)
    if not os.path.exists(f):
        with urllib.request.urlopen(url, timeout=120) as r, open(f, "wb") as o: o.write(r.read())
    return f

def norm(s):
    return re.sub(r"[^a-z]", "", "".join(c for c in unicodedata.normalize("NFD", s) if not unicodedata.combining(c)).lower())

# ---- geometry helpers
def polys(g): return g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
def pip(x, y, ring):
    ins = False
    for i in range(len(ring)):
        x0, y0 = ring[i]; x1, y1 = ring[(i + 1) % len(ring)]
        if (y0 > y) != (y1 > y) and x < (x1 - x0) * (y - y0) / (y1 - y0) + x0: ins = not ins
    return ins
def inside(x, y, g):
    return any(pip(x, y, p[0]) and not any(pip(x, y, h) for h in p[1:]) for p in polys(g))
def ring_centroid(r):
    a = cx = cy = 0.0
    for (x0, y0), (x1, y1) in zip(r, r[1:]):
        c = x0 * y1 - x1 * y0; a += c; cx += (x0 + x1) * c; cy += (y0 + y1) * c
    a /= 2
    return (cx / (6 * a), cy / (6 * a), abs(a)) if a else (r[0][0], r[0][1], 0)
def centroid(g):
    b = max((ring_centroid(p[0]) for p in polys(g)), key=lambda t: t[2]); return b[1], b[0]
def interior_near(g, la, lo, n=400):
    pts = [pt for p in polys(g) for r in p for pt in r]
    xs = [p[0] for p in pts]; ys = [p[1] for p in pts]; best = None
    for i in range(n + 1):
        for j in range(n + 1):
            x = min(xs) + (max(xs) - min(xs)) * i / n; y = min(ys) + (max(ys) - min(ys)) * j / n
            d = (x - lo) ** 2 + (y - la) ** 2
            if (best is None or d < best[0]) and inside(x, y, g): best = (d, y, x)
    return best[1], best[2]

# ---- elevation (terrarium tiles)
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

# ---- hand-entered data
# Well-known towns that are not district names: (name, state, lat, lon, GeoNames spellings to try).
# Coordinates here are only used when GeoNames has no match within 10 km.
TOWNS = [
 ("Port Blair","Andaman and Nicobar Islands",11.6234,92.7265,[]),("Vijayawada","Andhra Pradesh",16.5062,80.6480,[]),
 ("Itanagar","Arunachal Pradesh",27.0844,93.6053,[]),("Guwahati","Assam",26.1445,91.7362,[]),
 ("Panaji","Goa",15.4989,73.8278,["Panjim"]),("Dwarka","Gujarat",22.2394,68.9678,[]),
 ("Somnath","Gujarat",20.8880,70.4012,["Veraval"]),("Śṛṅgeri","Karnataka",13.4180,75.2570,["Sringeri"]),
 ("Mangaluru","Karnataka",12.9141,74.8560,["Mangalore"]),("Hubballi","Karnataka",15.3647,75.1240,["Hubli"]),
 ("Melukote","Karnataka",12.6600,76.6500,["Melkote"]),("Kochi","Kerala",9.9312,76.2673,["Cochin"]),
 ("Guruvayur","Kerala",10.5944,76.0411,[]),("Kavaratti","Lakshadweep",10.5626,72.6369,[]),
 ("Pandharpur","Maharashtra",17.6792,75.3319,[]),("Shillong","Meghalaya",25.5788,91.8933,[]),
 ("Bhubaneswar","Odisha",20.2961,85.8245,[]),("Pushkar","Rajasthan",26.4900,74.5513,[]),
 ("Gangtok","Sikkim",27.3389,88.6065,[]),("Kumbakonam","Tamil Nadu",10.9617,79.3881,[]),
 ("Rameswaram","Tamil Nadu",9.2876,79.3129,[]),("Kanchipuram","Tamil Nadu",12.8342,79.7036,[]),
 ("Agartala","Tripura",23.8315,91.2868,[]),("Rishikesh","Uttarakhand",30.0869,78.2676,[]),
 ("Siliguri","West Bengal",26.7271,88.3953,[]),
]
# Two towns (west, east) in each district whose boundary spans >= 1.5 degrees of longitude
# (sunrise 6+ minutes apart). A string is looked up in GeoNames inside the district;
# a tuple (name, lat, lon) is hand-entered (verified to lie inside the district).
WIDE = [
 ("Ladakh","Leh",("Khalatse",34.32,76.88),("Hanle",32.78,78.96)),
 ("Gujarat","Kutch","Naliya","Rapar"),
 ("Rajasthan","Jaisalmer",("Tanot",27.73,70.27),"Pokaran"),
 ("Rajasthan","Barmer","Dhorimanna","Samdari"),
 ("Rajasthan","Bikaner","Kolayat","Sri Dungargarh"),
 ("Andhra Pradesh","Alluri Sitharama Raju","Rampachodavaram",("Paderu",18.08,82.67)),
 ("Himachal Pradesh","Lahaul and Spiti","Kyelang",("Kaza",32.23,78.07)),
 ("Rajasthan","Nagaur","Gotan","Kuchaman"),
 ("Ladakh","Kargil",("Drass",34.43,75.76),"Padam"),
 ("Rajasthan","Jodhpur","Phalodi","Bilara"),
 ("Maharashtra","Sangli","Urun-Islampur",("Jath",17.05,75.22)),
 ("Maharashtra","Ahmednagar","Sangamner","Jamkhed"),
 ("Maharashtra","Beed","Ashti","Parli Vaijnath"),
 ("Rajasthan","Jalore","Sanchor","Sankhwali"),
 ("Maharashtra","Yavatmal","Pusad","Wani"),
 ("Maharashtra","Pune","Lonavla","Indapur"),
 ("Odisha","Sundargarh","Rourkela","Koira"),
 ("Maharashtra","Amravati","Dharni","Warud"),
 ("Maharashtra","Solapur","Akluj","Akalkot"),
 ("Rajasthan","Churu","Sujangarh","Rajgarh"),
 ("Rajasthan","Chittorgarh","Kapasan","Rawatbhata"),
 ("Rajasthan","Hanumangarh","Pilibangan","Bhadra"),
 ("Maharashtra","Nashik","Trimbak","Malegaon"),
 ("Rajasthan","Ganganagar","Anupgarh","Sadulshahar"),
 ("Maharashtra","Jalgaon","Chalisgaon","Raver"),
 ("Karnataka","Kalaburagi","Afzalpur","Chincholi"),
 ("Rajasthan","Pali","Sumerpur","Raipur"),
 ("Madhya Pradesh","Sehore","Ashta","Budhni"),
 ("Uttarakhand","Uttarkashi","Barkot",("Gangotri",30.99,78.94)),
 ("Andhra Pradesh","Chittoor","Kuppam","Nagari"),
 ("Andhra Pradesh","Sri Sathya Sai","Hindupur","Kadiri"),
 ("Madhya Pradesh","Betul","Bhainsdehi","Multai"),
 ("Lakshadweep","Lakshadweep","Kavaratti","Andrott"),
 ("Andhra Pradesh","Prakasam","Giddalur","Ongole"),
 ("Madhya Pradesh","Balaghat","Tirodi","Malajkhand"),
 ("Arunachal Pradesh","Changlang","Taipi Duidam","Miao"),
 ("Odisha","Mayurbhanj","Karanjia","Baripada"),
 ("Maharashtra","Osmanabad","Paranda","Umarga"),
 ("Karnataka","Ballari","Hadagalli","Siruguppa"),
]
DISPLAY = {"Sundergarh":"Sundargarh","Urun-Islampur":"Islampur","Padam":"Padum"}
DISTRICT_POINT = {("Ladakh","Leh"):(34.17,77.58)}

def main():
    feats = {}
    for s in STATES:
        for ft in json.load(open(fetch(BASE + s + ".geojson", s + ".geojson")))["features"]:
            p = ft["properties"]
            if p.get("st_nm") and p.get("district") and ft.get("geometry"):
                feats[(p["st_nm"].strip(), p["district"].strip())] = ft["geometry"]
    cities = [c for c in json.load(open(fetch(CITIES, "cities.json"))) if c["country"] == "IN"]
    for c in cities: c["lat"] = float(c["lat"]); c["lng"] = float(c["lng"])
    def in_district(st, dn): return [c for c in cities if inside(c["lng"], c["lat"], feats[(st, dn)])]

    districts = {}
    for (st, dn), g in sorted(feats.items()):
        la, lo = DISTRICT_POINT.get((st, dn)) or centroid(g)
        if (st, dn) not in DISTRICT_POINT and not inside(lo, la, g): la, lo = interior_near(g, la, lo)
        districts.setdefault(st, {})[dn] = [round(la, 2), round(lo, 2)]
    dnames = {(st, norm(d)) for st, ds in districts.items() for d in ds}

    towns = []   # [name, district or "", state, lat, lon]
    for n, st, la, lo, alts in TOWNS:
        assert (st, norm(n)) not in dnames, ("redundant with a district", n)
        near = [c for c in cities if norm(c["name"]) in {norm(n)} | {norm(a) for a in alts} and math.hypot(c["lat"] - la, c["lng"] - lo) * 111 < 10]
        if near:
            c = min(near, key=lambda c: math.hypot(c["lat"] - la, c["lng"] - lo)); la, lo = round(c["lat"], 4), round(c["lng"], 4)
        towns.append([n, "", st, la, lo])
    for st, dn, *pair in WIDE:
        cs = in_district(st, dn)
        for t in pair:
            if isinstance(t, tuple): n, la, lo = t
            else:
                m = [c for c in cs if norm(c["name"]) == norm(t)]; assert m, (st, dn, t)
                n, la, lo = DISPLAY.get(t, t), round(m[0]["lat"], 2), round(m[0]["lng"], 2)
            assert inside(lo, la, feats[(st, dn)]), ("outside its district", n)
            assert (st, norm(n)) not in dnames, ("redundant with a district", n)
            if not any(x[0] == n and x[2] == st for x in towns): towns.append([n, dn, st, la, lo])

    pts = [(d[0], d[1]) for ds in districts.values() for d in ds.values()] + [(t[3], t[4]) for t in towns]
    keys = sorted({tuple(map(math.floor, txy(la, lo))) for la, lo in pts})
    with ThreadPoolExecutor(8) as ex: list(ex.map(lambda k: tile(*k), keys))
    dist_out = [[st, [[d] + p + [elevation(*p)] for d, p in sorted(ds.items())]] for st, ds in sorted(districts.items())]
    towns_out = [t + [elevation(t[3], t[4])] for t in towns]
    head = ("// Generated by tools/build-india-places.py - do not edit by hand.\n"
            "// districts: [state, [[name, lat, lon, elevation m], ...]] - one point per current district.\n"
            "// towns: [name, district (\"\" if none), state, lat, lon, elevation m].\n"
            "// Sources: district boundaries (udit-001/india-maps-data), town coordinates (GeoNames),\n"
            "// elevation (NASA SRTM via AWS Terrain Tiles). See the script for details.\n")
    js = head + "(function (g) { (g.VedicEngine = g.VedicEngine || {}).IndiaPlacesData = {\n  districts: " + \
         json.dumps(dist_out, ensure_ascii=False, separators=(",", ":")) + ",\n  towns: " + \
         json.dumps(towns_out, ensure_ascii=False, separators=(",", ":")) + "\n}; })(typeof window !== \"undefined\" ? window : globalThis);\n"
    open(OUT, "w").write(js)
    print(sum(len(d[1]) for d in dist_out), "districts,", len(towns_out), "towns ->", os.path.relpath(OUT))

main()
