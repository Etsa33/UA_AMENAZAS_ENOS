# UA_AMENAZAS_ENOS · Geoportal de Unidades de Atención (UA) expuestas a amenazas

En línea: https://etsa33.github.io/UA_AMENAZAS_ENOS/

Aplicación web estática (HTML/CSS/JS + Leaflet), publicada en GitHub Pages.

## Estructura
- `index.html` – página principal
- `css/styles.css` – estilos (línea gráfica MTDH: #2D2D93 / #FFC701)
- `js/app.js` – lógica: filtros, regiones, coropletas, puntos de UA con clusters, selección por polígono y reporte Excel
- `data/ua.json` – UA (corte mensual) con categorías de susceptibilidad y coordenadas geográficas
- `data/ua_matriz.json` – matriz completa (47 variables, tal cual) que alimenta el reporte Excel
- `data/diccionario.json` – pestaña DICCIONARIO_VARIABLES (etiquetas del popup y hoja del reporte)
- `data/banner.png` – encabezado institucional del reporte Excel
- `data/provincias.json`, `data/cantones.json`, `data/parroquias.json` – límites DPA (MDG, 2026) simplificados
- `scripts/preparar_ua.py` – genera los tres archivos de datos a partir de la matriz mensual

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

(el tercer argumento es el nombre de la hoja; por defecto `UA_AGOSTO_2026`). El script usa `cod_cc`
para enlazar cada UA con el polígono parroquial, convierte las coordenadas UTM 17S (`x`, `y`) a
geográficas y reporta si algún código no tiene polígono. Luego subir la carpeta `data/` actualizada.

## Criterios
- Categorías de susceptibilidad consideradas: media, alta y muy alta.
- Regiones por defecto: todas para inundaciones, movimientos en masa y multiamenaza; Sierra y Amazonía
  para sequía e incendios forestales (escenario de déficit hídrico del Evento El Niño).
