# UA_AMENAZAS_ENOS · Geoportal de Unidades de Atención (UA) expuestas a amenazas

En línea: https://etsa33.github.io/UA_AMENAZAS_ENOS/

Aplicación web estática (HTML/CSS/JS + Leaflet), publicada en GitHub Pages.

## Estructura
- `index.html` – página principal
- `css/styles.css` – estilos (línea gráfica MTDH: #2D2D93 / #FFC701)
- `js/app.js` – lógica: pestañas (Prevención / Seguimiento a la emergencia), filtros, coropletas, puntos de UA y de alojamientos con clusters, selección por polígono y reportes Excel
- `data/ua.json` – UA (corte mensual) con categorías de susceptibilidad y coordenadas geográficas
- `data/ua_matriz.json` – matriz completa (47 variables, tal cual) que alimenta el reporte Excel
- `data/diccionario.json` – pestaña DICCIONARIO_VARIABLES (etiquetas del popup y hoja del reporte)
- `data/banner.png` – encabezado institucional del reporte Excel
- `img/logo_encabezado.png` – logo institucional de la cabecera
- `data/provincias.json`, `data/cantones.json`, `data/parroquias.json` – límites DPA (MDG, 2026) simplificados
- `data/advertencia.json` – advertencia meteorológica vigente del INAMHI (polígonos por nivel, zona de crecidas y nivel de cada UA)
- `data/alojamientos.json` – alojamientos temporales calificados (SNGR) identificados como MTDH, sin datos personales
- `scripts/preparar_ua.py` – genera los tres archivos de datos a partir de la matriz mensual
- `scripts/preparar_advertencia.py` – genera `data/advertencia.json` a partir del shapefile de la advertencia del INAMHI
- `scripts/preparar_alojamientos.py` – genera `data/alojamientos.json` a partir del GeoPackage de la SNGR (y, si existe, la lista de estados)

## Librerías (cdnjs)
Leaflet 1.9.4 · Leaflet.markercluster 1.5.3 · Leaflet.draw 1.0.4 · ExcelJS 4.4.0

## Publicar en GitHub Pages
1. Subir todo el contenido de esta carpeta a la raíz del repositorio `UA_AMENAZAS_ENOS` (incluido `.nojekyll`).
2. Settings → Pages → Source: *Deploy from a branch* → rama `main`, carpeta `/ (root)`.

Para probar localmente: `python -m http.server 8000` en la carpeta y abrir http://localhost:8000
(no funciona abriendo `index.html` con doble clic).

## Actualizar el corte mensual

    pip install openpyxl pyproj
    python scripts/preparar_ua.py UA_SEP26_AMENAZAS.xlsx "Septiembre 2026" UA_SEPTIEMBRE_2026

(el tercer argumento es el nombre de la hoja; por defecto `UA_AGOSTO_2026`; para septiembre: `UA_SEPTIEMBRE_2026`). El script usa `cod_cc`
para enlazar cada UA con el polígono parroquial, convierte las coordenadas UTM 17S (`x`, `y`) a
geográficas y reporta si algún código no tiene polígono. Luego subir la carpeta `data/` actualizada.

## Actualizar la advertencia de precipitación (cada nueva advertencia del INAMHI)

    pip install geopandas
    python scripts/preparar_advertencia.py Advertencia_87.shp 87 "10h00 del 7 de noviembre de 2026" "10h00 del 10 de noviembre de 2026" Zona_de_crecidas.shp

Argumentos: shapefile de la advertencia (campo `Nivel`: Medio / Alto / Muy Alto), número, desde, hasta y, opcional, la zona de crecidas.
Correr después de `preparar_ua.py` (usa las coordenadas de `data/ua.json`). Luego subir `data/advertencia.json`
y actualizar en `index.html` el número de la advertencia en la línea de fuentes.

## Actualizar los alojamientos temporales

    pip install geopandas openpyxl
    python scripts/preparar_alojamientos.py Alojamientos_Temporales.gpkg UA_SEP26_AMENAZAS_1.xlsx [estado.xlsx]

Sin lista de estados, se publican los alojamientos cuyo nombre los identifica como MTDH / MDH / MDT / MIES o sus servicios
(CDI, CIBV, CNH, gerontológicos, adultos mayores, centros diurnos, discapacidad); estado: Cerrado si tiene fecha de cierre,
si no, su categoría (Calificado). `estado.xlsx` (opcional, columnas `CÓDIGO` y `ESTADO`: Activo / Habilitado / Cerrado)
reemplaza esa selección. El nombre y teléfono del responsable nunca se publican.

## Criterios
- Pestañas: Prevención y preparación (susceptibilidad + advertencia INAMHI) y Respuesta (alojamientos temporales).
- Capas: inundaciones, movimientos en masa, multiamenaza y advertencia de precipitación (sequía e incendios forestales se retiraron en noviembre de 2026).
- La zona de crecidas es solo informativa (tramado); no entra en los conteos.
- Categorías de susceptibilidad consideradas: media, alta y muy alta (sin selector).
- El mapa se expresa en número absoluto de UA expuestas.
