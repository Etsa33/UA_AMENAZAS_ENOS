"""Genera data/advertencia.json (advertencia meteorológica del INAMHI) para la pestaña de Prevención y preparación.

Uso (desde la carpeta del repositorio, después de preparar_ua.py):
    pip install geopandas
    python scripts/preparar_advertencia.py Advertencia_86.shp 86 "10h00 del 4 de noviembre de 2026" "10h00 del 7 de noviembre de 2026" [Zona_de_crecidas.shp]

- El shapefile de advertencia debe tener el campo `Nivel` con los valores Medio / Alto / Muy Alto (y opcionalmente Crítico).
  Los polígonos del INAMHI vienen anidados (el nivel medio incluye al alto, y este al muy alto); a cada UA se le asigna
  el nivel más alto de los polígonos que la contienen.
- La zona de crecidas es solo informativa: se dibuja con tramado y no entra en el conteo de UA.
- Los polígonos se simplifican (~300 m) solo para el dibujo; el cruce con las UA usa la geometría original.
"""
import sys, json
import geopandas as gpd, shapely
from shapely.ops import unary_union

shp, num, desde, hasta = sys.argv[1:5]
crec = sys.argv[5] if len(sys.argv) > 5 else None
TOL = 0.003   # grados (~300 m) para la simplificación del dibujo
NIV = {'MEDIO': 1, 'ALTO': 2, 'MUY ALTO': 3, 'CRITICO': 4, 'CRÍTICO': 4}

g = gpd.read_file(shp).to_crs(4326)
col = next(c for c in g.columns if c.lower() == 'nivel')
g['lv'] = g[col].map(lambda v: NIV.get(str(v).strip().upper(), 0))
if (g.lv == 0).any(): print('Aviso: niveles no reconocidos:', sorted(g.loc[g.lv == 0, col].unique()))
g = g[g.lv > 0]
g['geometry'] = g.geometry.buffer(0)

# ---- cruce con las UA (geometría original) ----
ua = json.load(open('data/ua.json', encoding='utf-8'))
pts = [(i, r[18], r[17]) for i, r in enumerate(ua['rows']) if r[17] is not None]
P = gpd.GeoDataFrame({'i': [p[0] for p in pts]}, geometry=gpd.points_from_xy([p[1] for p in pts], [p[2] for p in pts]), crs=4326)
J = gpd.sjoin(P, g[['lv', 'geometry']], how='inner', predicate='within').groupby('i')['lv'].max()
uaLv = [[int(i), int(v)] for i, v in J.items()]

# ---- polígonos disjuntos por nivel y simplificados para el mapa ----
levels = sorted(g.lv.unique())
union = {k: unary_union(g.loc[g.lv == k].geometry.values) for k in levels}
dis, upper = {}, None
for k in sorted(levels, reverse=True):
    geom = union[k] if upper is None else union[k].difference(upper)
    dis[k] = geom
    upper = geom if upper is None else upper.union(geom)
ks = [k for k in levels if not dis[k].is_empty]
simp = shapely.coverage_simplify([dis[k] for k in ks], TOL)
fc = lambda feats: {'type': 'FeatureCollection', 'features': feats}
polys = fc([{'type': 'Feature', 'properties': {'lv': int(k)}, 'geometry': shapely.geometry.mapping(shapely.set_precision(s, 1e-4))}
            for k, s in zip(ks, simp)])

crecidas = None
if crec:
    c = gpd.read_file(crec).to_crs(4326)
    cu = unary_union(c.geometry.buffer(0).values).simplify(TOL / 2)
    crecidas = fc([{'type': 'Feature', 'properties': {}, 'geometry': shapely.geometry.mapping(shapely.set_precision(cu, 1e-4))}])

out = {'num': str(num), 'desde': desde, 'hasta': hasta, 'fuente': 'INAMHI', 'polys': polys, 'crecidas': crecidas, 'ua': uaLv}
json.dump(out, open('data/advertencia.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
cnt = {k: sum(1 for _, v in uaLv if v == k) for k in (1, 2, 3, 4)}
print(f'Advertencia N.º {num}: {len(uaLv)} UA dentro de zonas de advertencia | por nivel (1 medio, 2 alto, 3 muy alto, 4 crítico): {cnt}')
