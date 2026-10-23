"""Write a fake GFS run (GRIB2 + .idx) laid out like NOAA's AWS bucket, for offline tests.
Fields follow simple formulas so the output can be checked:
  cloud = (lat + 90) / 1.8 (instant from f003; f000 has none)
  high cloud: only 0-3 h / 0-6 h style averages; true value = 10 + fh
  temp 2 m = 20 + lon/18 deg C, dew point 3 deg C lower, RH = 60
  wind 10 m = (3, 4) m/s, 250 mb = (30, 40) m/s, 500 mb = (15, 20) m/s
"""
import sys, os, numpy as np, eccodes
out, cyc = sys.argv[1], sys.argv[2]   # cyc like 2026102312
WAVY = '--wavy' in sys.argv          # moving cloud bands instead of the checkable formulas
HALF = '--half' in sys.argv          # 0.5 degree files (pgrb2.0p50) instead of 1 degree
D = 0.5 if HALF else 1.0; RES = '0p50' if HALF else '1p00'
ymd, hh = cyc[:8], cyc[8:]
d = os.path.join(out, f'gfs.{ymd}', hh, 'atmos'); os.makedirs(d, exist_ok=True)
lats = np.linspace(90, -90, int(180 / D) + 1); lons = np.arange(0, 360, D)
LAT, LON = np.meshgrid(lats, lons, indexing='ij'); LONW = np.where(LON >= 180, LON - 360, LON)

def msg(disc, cat, num, ltype, lval, vals, fh, avg=None):
    g = eccodes.codes_grib_new_from_samples('GRIB2')
    for k, v in [('Ni', len(lons)), ('Nj', len(lats)), ('latitudeOfFirstGridPointInDegrees', 90), ('longitudeOfFirstGridPointInDegrees', 0),
                 ('latitudeOfLastGridPointInDegrees', -90), ('longitudeOfLastGridPointInDegrees', 360 - D),
                 ('iDirectionIncrementInDegrees', D), ('jDirectionIncrementInDegrees', D), ('jScansPositively', 0),
                 ('dataDate', int(ymd)), ('dataTime', int(hh) * 100)]:
        eccodes.codes_set(g, k, v)
    if avg:
        eccodes.codes_set(g, 'productDefinitionTemplateNumber', 8)
        eccodes.codes_set(g, 'typeOfStatisticalProcessing', 0)
        eccodes.codes_set(g, 'stepRange', f'{avg[0]}-{avg[1]}')
    else:
        eccodes.codes_set(g, 'stepRange', str(fh))
    eccodes.codes_set(g, 'discipline', disc); eccodes.codes_set(g, 'parameterCategory', cat); eccodes.codes_set(g, 'parameterNumber', num)
    eccodes.codes_set(g, 'typeOfFirstFixedSurface', ltype)
    if lval is None:
        eccodes.codes_set_missing(g, 'scaleFactorOfFirstFixedSurface'); eccodes.codes_set_missing(g, 'scaledValueOfFirstFixedSurface')
    else:
        eccodes.codes_set(g, 'scaleFactorOfFirstFixedSurface', 0)
        eccodes.codes_set(g, 'scaledValueOfFirstFixedSurface', lval * 100 if ltype == 100 else lval)
    eccodes.codes_set(g, 'bitsPerValue', 16)
    eccodes.codes_set_values(g, np.asarray(vals, float).ravel())
    b = eccodes.codes_get_message(g); eccodes.codes_release(g); return b

for fh in range(0, 73, 3):
    ms = []  # (bytes, idx var, idx level, desc)
    c = lambda a, b: f'{a}-{b} hour ave fcst'
    if fh:
        tc = np.clip(50 + 70 * np.sin(np.radians(LON * 3 + LAT * 2) - fh / 8) * np.cos(np.radians(LAT * 3)), 0, 100) if WAVY else (LAT + 90) / 1.8
        ms.append((msg(0, 6, 1, 10, None, tc, fh), 'TCDC', 'entire atmosphere', f'{fh} hour fcst'))
        a = fh - 3 if fh % 6 == 3 else fh - 6
        if fh % 6 == 3:
            hv = np.full(LAT.shape, 10.0 + fh)
        else:  # 0-6 window: average of previous 3 h value and this one
            hv = np.full(LAT.shape, ((10 + fh - 3) + (10 + fh)) / 2)
        ms.append((msg(0, 6, 5, 234, None, hv, fh, (a, fh)), 'HCDC', 'high cloud layer', c(a, fh)))
        ms.append((msg(0, 6, 1, 10, None, np.full(LAT.shape, 99.0), fh, (a, fh)), 'TCDC', 'entire atmosphere', c(a, fh)))
    ms.append((msg(0, 1, 1, 103, 2, np.full(LAT.shape, 60.0), fh), 'RH', '2 m above ground', f'{fh} hour fcst'))
    ms.append((msg(0, 1, 1, 100, 500, np.full(LAT.shape, 5.0), fh), 'RH', '500 mb', f'{fh} hour fcst'))  # not wanted
    ms.append((msg(0, 0, 0, 103, 2, 273.15 + 20 + LONW / 18, fh), 'TMP', '2 m above ground', f'{fh} hour fcst'))
    ms.append((msg(0, 0, 0, 100, 250, np.full(LAT.shape, 220.0), fh), 'TMP', '250 mb', f'{fh} hour fcst'))  # not wanted
    ms.append((msg(0, 0, 6, 103, 2, 273.15 + 17 + LONW / 18, fh), 'DPT', '2 m above ground', f'{fh} hour fcst'))
    for lev, (u, v) in [(10, (3, 4)), (250, (30, 40)), (500, (15, 20))]:
        t, lv, name = (103, 10, '10 m above ground') if lev == 10 else (100, lev, f'{lev} mb')
        uu = u * (1 + np.sin(np.radians(LAT * 4 + LON - fh * 2))) if WAVY else np.full(LAT.shape, float(u))
        ms.append((msg(0, 2, 2, t, lv, uu, fh), 'UGRD', name, f'{fh} hour fcst'))
        ms.append((msg(0, 2, 3, t, lv, np.full(LAT.shape, float(v)), fh), 'VGRD', name, f'{fh} hour fcst'))
    name = f'gfs.t{hh}z.pgrb2.{RES}.f{fh:03d}'
    off, idx = 0, []
    with open(os.path.join(d, name), 'wb') as f:
        for i, (b, var, lev, desc) in enumerate(ms):
            idx.append(f'{i+1}:{off}:d={cyc}:{var}:{lev}:{desc}:'); f.write(b); off += len(b)
    open(os.path.join(d, name + '.idx'), 'w').write('\n'.join(idx) + '\n')
print('fake run written to', d)
