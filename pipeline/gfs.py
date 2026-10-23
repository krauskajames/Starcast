#!/usr/bin/env python3
"""Starcast global weather: NOAA GFS forecast -> small files the app reads.

Runs in GitHub Actions every 6 hours. It finds the newest complete GFS run,
downloads only the fields Starcast needs for the next 72 hours (every 3 hours),
and writes one gzip file per forecast step plus a manifest:

  <out>/manifest.json
  <out>/<cycle>/f000.bin.gz, f003.bin.gz, ... f072.bin.gz

Each step file holds one byte per grid point for each channel, channel after
channel, rows from the south pole north, columns from 180 W east. A byte b
means value = offset + b * scale; 255 means missing.

Sources, tried in order:
  aws    NOAA Open Data on AWS (noaa-gfs-bdp-pds): byte ranges from the .idx
         inventory, so only the needed fields are downloaded. No throttling.
  nomads NOAA NOMADS grib filter (limit 120 requests a minute; we stay far below).

If no newer run can be built, the files currently published (--reuse-from)
are copied instead, so the site never loses its weather data.
"""
import argparse, datetime as dt, gzip, json, os, shutil, sys, time, urllib.request, urllib.error
import numpy as np
import eccodes

UA = 'Starcast/1.0 (https://krauskagis.com/Starcast/; github.com/krauskajames/Starcast)'
AWS = 'https://noaa-gfs-bdp-pds.s3.amazonaws.com'
NOMADS_PUB = 'https://nomads.ncep.noaa.gov/pub/data/nccf/com/gfs/prod'
NOMADS_FILTER = 'https://nomads.ncep.noaa.gov/cgi-bin/filter_gfs_{res}.pl'

# (idx variable, idx level, grib discipline/category/number, level type, level value)
FIELDS = {
    'tcc':  ('TCDC', 'entire atmosphere', (0, 6, 1), (10, 200), None),
    'hcc':  ('HCDC', 'high cloud layer', (0, 6, 5), 234, None),
    'rh2':  ('RH', '2 m above ground', (0, 1, 1), 103, 2),
    't2':   ('TMP', '2 m above ground', (0, 0, 0), 103, 2),
    'd2':   ('DPT', '2 m above ground', (0, 0, 6), 103, 2),
    'u10':  ('UGRD', '10 m above ground', (0, 2, 2), 103, 10),
    'v10':  ('VGRD', '10 m above ground', (0, 2, 3), 103, 10),
    'u250': ('UGRD', '250 mb', (0, 2, 2), 100, 250),
    'v250': ('VGRD', '250 mb', (0, 2, 3), 100, 250),
    'u500': ('UGRD', '500 mb', (0, 2, 2), 100, 500),
    'v500': ('VGRD', '500 mb', (0, 2, 3), 100, 500),
}
# What the app gets. Units match Open-Meteo's (%, deg C, km/h) so one code path reads both.
CHANNELS = [
    {'key': 'cloud',  'offset': 0,   'scale': 1,   'unit': '%'},
    {'key': 'hcloud', 'offset': 0,   'scale': 1,   'unit': '%'},
    {'key': 'rh',     'offset': 0,   'scale': 1,   'unit': '%'},
    {'key': 'temp',   'offset': -90, 'scale': 0.6, 'unit': 'C'},
    {'key': 'spread', 'offset': 0,   'scale': 0.1, 'unit': 'C'},   # temperature minus dew point
    {'key': 'w10',    'offset': 0,   'scale': 1,   'unit': 'km/h'},
    {'key': 'j250',   'offset': 0,   'scale': 2,   'unit': 'km/h'},
    {'key': 'w500',   'offset': 0,   'scale': 2,   'unit': 'km/h'},
]
HOURS = list(range(0, 73, 3))


def log(*a):
    print(*a, file=sys.stderr, flush=True)


def http(url, headers=None, tries=3, timeout=60):
    h = {'User-Agent': UA}
    h.update(headers or {})
    last = None
    for k in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=h), timeout=timeout) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code in (403, 404):
                raise
            last = e
        except Exception as e:  # network hiccup: wait and retry
            last = e
        time.sleep(3 * (k + 1))
    raise last


def exists(url):
    try:
        http(url, headers={'Range': 'bytes=0-0'}, tries=2, timeout=30)
        return True
    except Exception:
        return False


def cycles(now, back=5):
    """GFS runs at 00, 06, 12, 18 UTC; newest first."""
    c = now.replace(minute=0, second=0, microsecond=0)
    c = c.replace(hour=c.hour - c.hour % 6)
    for k in range(back):
        yield c - dt.timedelta(hours=6 * k)


class Source:
    def __init__(self, kind, res, base=None):
        self.kind, self.res = kind, res
        self.base = base

    def name(self, cyc, fh):
        return f"gfs.t{cyc:%H}z.pgrb2.{self.res}.f{fh:03d}"

    def path(self, cyc):
        return f"gfs.{cyc:%Y%m%d}/{cyc:%H}/atmos"

    def ready(self, cyc):
        last = self.name(cyc, HOURS[-1]) + '.idx'
        root = self.base or (AWS if self.kind == 'aws' else NOMADS_PUB)
        return exists(f"{root}/{self.path(cyc)}/{last}")

    def fetch(self, cyc, fh):
        if self.kind == 'aws':
            return self._fetch_aws(cyc, fh)
        return self._fetch_nomads(cyc, fh)

    def _fetch_aws(self, cyc, fh):
        root = self.base or AWS
        url = f"{root}/{self.path(cyc)}/{self.name(cyc, fh)}"
        idx = http(url + '.idx').decode('utf-8', 'replace').strip().splitlines()
        want = {(v, l) for v, l, *_ in FIELDS.values()}
        offs = []
        for line in idx:
            p = line.split(':')
            if len(p) >= 6:
                offs.append((int(p[1]), p[3], p[4]))
        ranges = []
        for i, (o, var, lev) in enumerate(offs):
            if (var, lev) in want:
                end = offs[i + 1][0] - 1 if i + 1 < len(offs) else ''
                if ranges and ranges[-1][1] != '' and ranges[-1][1] + 1 == o:
                    ranges[-1][1] = end  # join neighbours into one request
                else:
                    ranges.append([o, end])
        if not ranges:
            raise RuntimeError(f'no wanted fields in {url}.idx')
        return b''.join(http(url, headers={'Range': f'bytes={a}-{b}'}) for a, b in ranges)

    def _fetch_nomads(self, cyc, fh):
        q = [f"dir=%2F{self.path(cyc).replace('/', '%2F')}", f"file={self.name(cyc, fh)}"]
        q += sorted({f"var_{v}=on" for v, *_ in FIELDS.values()})
        q += sorted({'lev_' + l.replace(' ', '_') + '=on' for _, l, *_ in FIELDS.values()})
        base = self.base + '/cgi-bin/filter_gfs_{res}.pl' if self.base else NOMADS_FILTER
        data = http(base.format(res=self.res) + '?' + '&'.join(q))
        time.sleep(2)  # NOMADS allows 120 hits a minute; stay far below
        return data


def messages(blob):
    """Split concatenated GRIB2 messages (section 0 holds each message's length)."""
    i = 0
    while True:
        i = blob.find(b'GRIB', i)
        if i < 0 or i + 16 > len(blob):
            return
        n = int.from_bytes(blob[i + 8:i + 16], 'big') if blob[i + 7] == 2 else int.from_bytes(blob[i + 4:i + 7], 'big')
        if n <= 0 or i + n > len(blob):
            return
        yield blob[i:i + n]
        i += n


def decode(blob, grid):
    """GRIB2 bytes -> {field: [(stepType, startStep, endStep, 2-D array on the output grid)]}."""
    out = {}
    for m in messages(blob):
        g = eccodes.codes_new_from_message(m)
        try:
            key = tuple(eccodes.codes_get(g, k, int) for k in ('discipline', 'parameterCategory', 'parameterNumber'))
            ltype = eccodes.codes_get(g, 'typeOfFirstFixedSurface', int)
            lev = eccodes.codes_get(g, 'level', int)
            name = next((n for n, (_, _, k, lt, lv) in FIELDS.items()
                         if k == key and ltype in (lt if isinstance(lt, tuple) else (lt,)) and (lv is None or lv == lev)), None)
            if name is None:
                continue
            step_type = eccodes.codes_get(g, 'stepType')
            start = eccodes.codes_get(g, 'startStep', int)
            end = eccodes.codes_get(g, 'endStep', int)
            out.setdefault(name, []).append((step_type, start, end, regrid(g, grid)))
        finally:
            eccodes.codes_release(g)
    return out


def regrid(g, grid):
    """Pick the output grid's points out of a regular lat/lon GRIB field."""
    ni, nj = eccodes.codes_get(g, 'Ni'), eccodes.codes_get(g, 'Nj')
    lat1 = eccodes.codes_get(g, 'latitudeOfFirstGridPointInDegrees')
    lon1 = eccodes.codes_get(g, 'longitudeOfFirstGridPointInDegrees')
    di = eccodes.codes_get(g, 'iDirectionIncrementInDegrees')
    dj = eccodes.codes_get(g, 'jDirectionIncrementInDegrees')
    south_first = eccodes.codes_get(g, 'jScansPositively') == 1
    v = eccodes.codes_get_values(g).reshape(nj, ni)
    if eccodes.codes_get(g, 'bitmapPresent'):
        miss = eccodes.codes_get(g, 'missingValue')
        v = np.where(v == miss, np.nan, v)
    lats = grid['lat0'] + grid['d'] * np.arange(grid['nLat'])
    lons = grid['lon0'] + grid['d'] * np.arange(grid['nLon'])
    # A finer source is averaged down (tent filter one output cell wide) rather than point-sampled,
    # so single-cell showers don't turn into speckle on the coarser map.
    k = int(round(grid['d'] / di))
    if k > 1:
        v = smooth(v, k)
    rows = np.rint(((lats - lat1) if south_first else (lat1 - lats)) / dj).astype(int)
    cols = np.rint(((lons - lon1) % 360) / di).astype(int) % ni
    if rows.min() < 0 or rows.max() >= nj:
        raise RuntimeError('GRIB grid does not cover the globe')
    return v[np.ix_(rows, cols)].astype(np.float32)


def smooth(v, k):
    """Tent-weighted moving average over 2k-1 cells: wraps in longitude, clamps at the poles, skips gaps."""
    w = [k - abs(j) for j in range(-(k - 1), k)]
    m = np.isfinite(v).astype(np.float64)
    a = np.where(m > 0, v, 0.0).astype(np.float64)
    num, den = np.zeros_like(a), np.zeros_like(a)
    for j, wt in zip(range(-(k - 1), k), w):          # along longitude (wraps)
        num += wt * np.roll(a, j, axis=1); den += wt * np.roll(m, j, axis=1)
    a2, m2 = num, den
    num, den = np.zeros_like(a), np.zeros_like(a)
    n = a.shape[0]
    for j, wt in zip(range(-(k - 1), k), w):          # along latitude (edge rows repeat)
        idx = np.clip(np.arange(n) + j, 0, n - 1)
        num += wt * a2[idx]; den += wt * m2[idx]
    with np.errstate(invalid='ignore', divide='ignore'):
        return np.where(den > 0, num / den, np.nan)


def pick(entries, fh, prev):
    """Prefer an instantaneous value; otherwise turn GFS running averages into the latest 3 hours."""
    inst = [e for e in entries if e[0] == 'instant']
    if inst:
        return inst[0][3]
    avg = [e for e in entries if e[0] == 'avg']
    if not avg:
        return None
    _, a, b, v = sorted(avg, key=lambda e: e[2] - e[1])[0]
    # GFS averages over 0-3 h then 0-6 h windows; the 3-6 h part is 2*avg(0-6) - avg(0-3)
    if prev is not None and b - a == 6 and prev[0] == a and prev[1] == b - 3:
        return np.clip(2 * v - prev[2], 0, 100)
    return v


def build_step(fields, fh, prev_avgs):
    def get(n):
        e = fields.get(n)
        if not e:
            return None
        if n in ('tcc', 'hcc'):
            avg = [x for x in e if x[0] == 'avg']
            v = pick(e, fh, prev_avgs.get(n))
            if avg:
                _, a, b, av = sorted(avg, key=lambda x: x[2] - x[1])[0]
                prev_avgs[n] = (a, b, av)
            return v
        return pick(e, fh, None)

    speed = lambda u, v: None if u is None or v is None else np.hypot(u, v) * 3.6
    t2, d2 = get('t2'), get('d2')
    vals = {
        'cloud': get('tcc'), 'hcloud': get('hcc'), 'rh': get('rh2'),
        'temp': None if t2 is None else t2 - 273.15,
        'spread': None if t2 is None or d2 is None else np.maximum(t2 - d2, 0),
        'w10': speed(get('u10'), get('v10')),
        'j250': speed(get('u250'), get('v250')),
        'w500': speed(get('u500'), get('v500')),
    }
    return vals


def encode(vals, grid):
    n = grid['nLat'] * grid['nLon']
    buf = bytearray()
    for ch in CHANNELS:
        v = vals.get(ch['key'])
        if v is None:
            buf += b'\xff' * n
            continue
        q = np.rint((v - ch['offset']) / ch['scale'])
        q = np.where(np.isnan(q), 255, np.clip(q, 0, 254)).astype(np.uint8)
        buf += q.tobytes()
    return gzip.compress(bytes(buf), 9, mtime=0)


def fill_gaps(steps):
    """A field missing at one step (e.g. cloud at hour 0) borrows the nearest step that has it."""
    for ch in CHANNELS:
        k = ch['key']
        have = [i for i, s in enumerate(steps) if s.get(k) is not None]
        if not have:
            continue
        for i, s in enumerate(steps):
            if s.get(k) is None:
                s[k] = steps[min(have, key=lambda j: abs(j - i))][k]


def build(src, cyc, out, grid):
    log(f'Building from {src.kind} {src.res}, run {cyc:%Y-%m-%d %H} UTC')
    steps, prev = [], {}
    for fh in HOURS:
        blob = src.fetch(cyc, fh)
        fields = decode(blob, grid)
        missing = [n for n in FIELDS if n not in fields]
        log(f'  f{fh:03d}: {len(blob)/1e6:.1f} MB' + (f', missing {missing}' if missing else ''))
        steps.append(build_step(fields, fh, prev))
    fill_gaps(steps)
    for ch in CHANNELS:
        if all(s.get(ch['key']) is None for s in steps):
            raise RuntimeError(f"no data for {ch['key']}")
    tag = f'{cyc:%Y%m%d%H}'
    os.makedirs(os.path.join(out, tag), exist_ok=True)
    files = []
    for fh, s in zip(HOURS, steps):
        name = f'{tag}/f{fh:03d}.bin.gz'
        with open(os.path.join(out, name), 'wb') as fp:
            fp.write(encode(s, grid))
        files.append(name)
    man = {
        'v': 1, 'source': 'NOAA GFS', 'cycle': tag,
        'made': dt.datetime.now(dt.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
        't0': int(cyc.timestamp()), 'dt': 3 * 3600, 'hours': HOURS,
        'grid': grid, 'channels': CHANNELS, 'files': files,
    }
    with open(os.path.join(out, 'manifest.json'), 'w') as fp:
        json.dump(man, fp, separators=(',', ':'))
    size = sum(os.path.getsize(os.path.join(out, f)) for f in files)
    log(f'Wrote {len(files)} steps, {size/1e6:.1f} MB')
    return man


def reuse(base, out):
    """Copy the data that is already published, so a failed run never empties the site."""
    man = json.loads(http(base.rstrip('/') + '/manifest.json'))
    for name in man['files']:
        os.makedirs(os.path.dirname(os.path.join(out, name)), exist_ok=True)
        with open(os.path.join(out, name), 'wb') as fp:
            fp.write(http(base.rstrip('/') + '/' + name))
    with open(os.path.join(out, 'manifest.json'), 'w') as fp:
        json.dump(man, fp, separators=(',', ':'))
    log(f"Reused published run {man['cycle']}")
    return man


def published(base):
    try:
        return json.loads(http(base.rstrip('/') + '/manifest.json', tries=2)).get('cycle')
    except Exception:
        return None


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--out', default='data/wx')
    ap.add_argument('--res', default='1p00', choices=['1p00', '0p50', '0p25'], help='GFS file to read')
    ap.add_argument('--grid', type=float, default=1.0, help='output spacing in degrees')
    ap.add_argument('--sources', default='aws,nomads')
    ap.add_argument('--base', help='test server standing in for AWS/NOMADS')
    ap.add_argument('--reuse-from', help='published data URL (…/data/wx) to copy when nothing newer is built')
    ap.add_argument('--reuse-only', action='store_true', help='copy published data; build only if that fails')
    ap.add_argument('--rebuild', action='store_true', help='build the newest run even if it is already published')
    ap.add_argument('--now', help='pretend time, e.g. 2026-10-23T12:00Z (testing)')
    a = ap.parse_args()

    d = a.grid
    grid = {'lat0': -90, 'lon0': -180, 'd': d, 'nLat': int(round(180 / d)) + 1, 'nLon': int(round(360 / d))}
    if os.path.exists(a.out):
        shutil.rmtree(a.out)
    os.makedirs(a.out)

    if a.reuse_only and a.reuse_from:
        try:
            reuse(a.reuse_from, a.out)
            return
        except Exception as e:
            log(f'Could not copy published data ({e}); building instead')

    now = dt.datetime.strptime(a.now, '%Y-%m-%dT%H:%MZ').replace(tzinfo=dt.timezone.utc) if a.now \
        else dt.datetime.now(dt.timezone.utc)
    current = published(a.reuse_from) if a.reuse_from and not a.rebuild else None
    for kind in a.sources.split(','):
        src = Source(kind, a.res, a.base)
        for cyc in cycles(now):
            if f'{cyc:%Y%m%d%H}' == current:
                break  # the published run is still the newest; no need to rebuild it
            if not src.ready(cyc):
                continue
            try:
                build(src, cyc, a.out, grid)
                return
            except Exception as e:
                log(f'{kind} run {cyc:%Y%m%d%H} failed: {e}')
                shutil.rmtree(a.out)
                os.makedirs(a.out)
                break
    if a.reuse_from:
        try:
            reuse(a.reuse_from, a.out)
            return
        except Exception as e:
            log(f'Could not copy published data either: {e}')
    log('No weather data could be built')
    sys.exit(1)


if __name__ == '__main__':
    main()
