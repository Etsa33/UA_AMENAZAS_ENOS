"""Genera data/ua.json a partir de la matriz mensual de UA con amenazas.
Uso:  python scripts/preparar_ua.py UA_AGO26_AMENAZAS_4.xlsx "Agosto 2026"
Requiere: pip install openpyxl
"""
import sys, json, openpyxl
xlsx, corte = sys.argv[1], sys.argv[2]
ws = openpyxl.load_workbook(xlsx, read_only=True, data_only=True)['UA_AGOSTO_2026' if len(sys.argv) < 4 else sys.argv[3]]
hdr, rows = None, []
for r in ws.iter_rows(values_only=True):
    if hdr is None:
        if r and r[0] == 'zon_plan': hdr = list(r)
        continue
    if r[10] is None: continue
    rows.append(dict(zip(hdr, r)))
pars = {f['properties']['DPA_PARROQ'] for f in json.load(open('data/parroquias.json', encoding='utf-8'))['features']}
gp = lambda p: str(p) if str(p) in pars else str(p)[:4] + '50'   # parroquias urbanas -> cabecera cantonal
cat = lambda v: {'1_MEDIA': 1, '2_ALTA': 2, '3_MUY ALTA': 3}.get(v, 0)
d = {k: [] for k in ('serv', 'mod', 'ud', 'reg', 'area', 'adm')}
def ix(k, v):
    v = v or 'S/I'
    if v not in d[k]: d[k].append(v)
    return d[k].index(v)
out = [[str(r['co_siimdh']), r['nombre'], ix('serv', r['servicio']), ix('mod', r['mod']), str(r['dpa_prov']), str(r['dpa_can']), gp(r['dpa_par']), r['dpa_despar'],
        ix('ud', r['uni_des']), ix('reg', r['region']), ix('area', r['area']), ix('adm', r['tipo_admin']),
        int(r['total'] or 0), int(r['ext_pob25'] or 0), int(r['pob25'] or 0),
        cat(r['susc_inundacion']), cat(r['susc_movimientos_masa']), cat(r['susc_sequia']), cat(r['susc_inc_forestales'])] for r in rows]
json.dump({'corte': corte, 'dict': d, 'servMod': sorted({(o[2], o[3]) for o in out}), 'rows': out},
          open('data/ua.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print(len(out), 'UA escritas en data/ua.json')
