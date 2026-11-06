"""Genera data/alojamientos.json para la pestaña de respuesta a la emergencia.

Uso (desde la carpeta del repositorio):
    pip install geopandas openpyxl
    python scripts/preparar_alojamientos.py Alojamientos_Temporales.gpkg UA_SEP26_AMENAZAS_1.xlsx [estado.xlsx] [--dist 50]

- Alojamientos_Temporales.gpkg : catastro de alojamientos temporales calificados de la SNGR.
- UA_SEP26_AMENAZAS_1.xlsx     : matriz mensual de UA (hoja UA_<MES>_<AÑO>, encabezado en la fila 'zon_plan').
- estado.xlsx (opcional)       : lista de alojamientos MTDH con las columnas CÓDIGO y ESTADO
                                 (Activo / Habilitado / Cerrado). Si se entrega, SOLO esos alojamientos
                                 se publican, con su estado.
                                 Si no, se seleccionan por el NOMBRE del alojamiento: los que mencionan al
                                 MTDH / MDH / MDT / MIES o a sus servicios (CDI, CIBV, CNH, centros gerontológicos,
                                 adultos mayores, centros diurnos, discapacidad). Se excluyen los que tienen
                                 fecha de cierre; el estado es su categoría (Calificado / Pre-posicionado).
- --dist                       : distancia máxima (m) para mostrar la UA más cercana como vinculada (por defecto 100).

No se publican datos personales: el nombre y el teléfono del responsable del alojamiento se excluyen.
"""
import sys, json, argparse, unicodedata, re
import pandas as pd, geopandas as gpd

ap = argparse.ArgumentParser()
ap.add_argument('gpkg'); ap.add_argument('matriz'); ap.add_argument('estado', nargs='?')
ap.add_argument('--dist', type=float, default=100)
a = ap.parse_args()

def norm(s):
    s = unicodedata.normalize('NFKD', str(s or '')).encode('ascii', 'ignore').decode().upper().strip()
    return re.sub(r'\s+', ' ', s)

# ---- alojamientos (sin datos personales) ----
A = gpd.read_file(a.gpkg)
A = A.rename(columns={c: norm(c) for c in A.columns if c != 'geometry'})
A['CODIGO'] = A['CODIGO'].astype(str).str.strip()
A = A[A.geometry.notna() & ~A.geometry.is_empty].to_crs(4326)

# ---- UA (matriz mensual) ----
x = pd.ExcelFile(a.matriz)
hoja = next(s for s in x.sheet_names if s.upper().startswith('UA_') and s.upper() != 'UA_RESUMEN')
raw = pd.read_excel(a.matriz, sheet_name=hoja, header=None)
hr = raw.index[raw.iloc[:, 0].astype(str).str.strip() == 'zon_plan'][0]
U = pd.read_excel(a.matriz, sheet_name=hoja, header=hr).dropna(subset=['co_siimdh'])
U['x'] = pd.to_numeric(U['x'], errors='coerce'); U['y'] = pd.to_numeric(U['y'], errors='coerce')
U = gpd.GeoDataFrame(U.dropna(subset=['x', 'y']), geometry=gpd.points_from_xy(U.x.dropna(), U.y.dropna()), crs=32717)
U['co_siimdh'] = U['co_siimdh'].astype(str).str.replace(r'\.0$', '', regex=True)

# vínculo con la UA más cercana (en metros)
J = gpd.sjoin_nearest(A.to_crs(32717), U[['co_siimdh', 'nombre', 'servicio', 'mod', 'geometry']], how='left', distance_col='dist')
J = J.sort_values('dist').drop_duplicates('CODIGO').to_crs(4326)

if a.estado:
    E = pd.read_excel(a.estado)
    E.columns = [norm(c) for c in E.columns]
    E['CODIGO'] = E['CODIGO'].astype(str).str.strip()
    E['ESTADO'] = E['ESTADO'].map(lambda v: norm(v).capitalize())
    J = J.merge(E[['CODIGO', 'ESTADO']], on='CODIGO', how='inner')
    faltan = sorted(set(E['CODIGO']) - set(J['CODIGO']))
    if faltan: print('Códigos de la lista que no están en el catastro:', faltan)
    origen = 'lista'
else:
    # alojamientos identificados por su nombre como infraestructura o servicio del MTDH
    CRIT = [
        ('MTDH / MIES', r' (?:MTDH|MDH|MDT|MIES|M I E S) |MINISTERIO DE (?:TRABAJO|DESARROLLO HUMANO|INCLUSION)'),
        ('Desarrollo infantil (CDI / CIBV)', r' (?:CDI|C D I|CIBV|CIDI) |DESARROLLO INFANTIL|CENTRO INFANTIL'),
        ('Desarrollo infantil (CNH)', r' CNH '),
        ('Gerontológico / adultos mayores', r'GER[EO]{0,2}N?TO?LOGIC|GERIATRIC|ADULTOS? MAYOR|TERCERA EDAD|CENTRO DIURNO'),
        ('Discapacidad', r'DISCAPACI'),
    ]
    nom = J['NOMBRE DEL ALOJAMIENTO'].map(lambda v: ' ' + re.sub(r'[^A-Z0-9]+', ' ', norm(v)) + ' ')
    J['CRITERIO'] = None
    for lab, pat in reversed(CRIT):
        J.loc[nom.str.contains(pat, regex=True), 'CRITERIO'] = lab
    J = J[J['CRITERIO'].notna()].copy()
    J = J[J['FECHA DE CIERRE'].isna()]   # se excluyen los alojamientos con fecha de cierre (hasta contar con el estado de la SNGR)
    J['ESTADO'] = [('Cerrado' if pd.notna(fc) else str(cat).strip().capitalize()) for fc, cat in zip(J['FECHA DE CIERRE'], J['CATEGORIA'])]
    origen = 'nombre'

# DPA a partir de los polígonos parroquiales del geoportal (urbanas agregadas en la cabecera cantonal)
P = gpd.read_file('data/parroquias.json').to_crs(4326)[['DPA_PARROQ', 'DPA_CANTON', 'DPA_PROVIN', 'geometry']]
J = gpd.sjoin(J.drop(columns=[c for c in J.columns if c.startswith('index_')]), P, how='left', predicate='within')
sin_dpa = J['DPA_PARROQ'].isna().sum()

f = lambda v: None if pd.isna(v) else v
rows = []
for _, r in J.iterrows():
    rows.append({
        'cod': r['CODIGO'], 'nom': str(r['NOMBRE DEL ALOJAMIENTO']).strip(), 'tipo': f(r['MODALIDAD']),
        'est': r['ESTADO'], 'calif': f(r['CALIFICACION']), 'crit': f(r.get('CRITERIO')),
        'prov': f(r['DPA_PROVIN']), 'can': f(r['DPA_CANTON']), 'par': f(r['DPA_PARROQ']),
        'despro': f(r['PROVINCIA']), 'descan': f(r['CANTON']), 'despar': f(r['PARROQUIA']), 'sector': f(r['SECTOR']),
        'cap_p': int(r['CANTIDAD DE PERSONAS']) if pd.notna(r['CANTIDAD DE PERSONAS']) else None,
        'cap_f': int(r['CANTIDAD DE FAMILIAS']) if pd.notna(r['CANTIDAD DE FAMILIAS']) else None,
        'f_calif': r['FECHA DE CALIFICACION'].strftime('%Y-%m-%d') if pd.notna(r['FECHA DE CALIFICACION']) else None,
        'f_cierre': r['FECHA DE CIERRE'].strftime('%Y-%m-%d') if pd.notna(r['FECHA DE CIERRE']) else None,
        **({'ua': f(r['co_siimdh']), 'ua_nom': f(r['nombre']), 'ua_serv': f(r['servicio']), 'ua_mod': f(r['mod']),
            'dist': round(float(r['dist']), 1)} if pd.notna(r['dist']) and r['dist'] <= a.dist else {}),
        'lat': round(r.geometry.y, 6), 'lon': round(r.geometry.x, 6),
    })
json.dump({'origen': origen, 'rows': rows}, open('data/alojamientos.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print(len(rows), 'alojamientos |', origen, '| estados:', pd.Series([r['est'] for r in rows]).value_counts().to_dict(), '| sin DPA:', sin_dpa)
