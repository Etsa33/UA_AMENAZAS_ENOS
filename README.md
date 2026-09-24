# UA_AMENAZAS_ENOS · Geoportal de Unidades de Atención expuestas a amenazas asociadas al Evento El Niño

En línea: https://etsa33.github.io/UA_AMENAZAS_ENOS/

Aplicación web estática (HTML/CSS/JS + Leaflet), lista para GitHub Pages.

## Estructura
- `index.html` – página principal
- `css/styles.css` – estilos (línea gráfica MTDH: #2D2D93 / #FFC701)
- `js/app.js` – lógica: filtros, coropletas, estadísticas y exportación a Excel
- `data/ua.json` – Unidades de Atención (corte agosto 2026) con categorías de susceptibilidad
- `data/provincias.json`, `data/cantones.json`, `data/parroquias.json` – límites DPA simplificados

## Publicar en GitHub Pages
1. Crear un repositorio (p. ej. `Amenazas_UA`) y subir todo el contenido de esta carpeta.
2. Settings → Pages → Source: *Deploy from a branch* → rama `main`, carpeta `/ (root)`.
3. El geoportal quedará en `https://<usuario>.github.io/Amenazas_UA/`.

Para probarlo localmente, no abrir `index.html` con doble clic: ejecutar en la carpeta
`python -m http.server 8000` y abrir http://localhost:8000.

## Actualizar el corte mensual
Desde la carpeta del repositorio:

    pip install openpyxl
    python scripts/preparar_ua.py UA_SEP26_AMENAZAS.xlsx "Septiembre 2026" UA_SEPTIEMBRE_2026

(el tercer argumento es el nombre de la hoja; por defecto `UA_AGOSTO_2026`).
El script usa la variable `cod_cc` (parroquia DPA: parroquias urbanas agregadas en la
cabecera cantonal y rurales con su propio código) para enlazar cada UA con el polígono
parroquial, y reporta si algún código no tiene polígono. Luego subir el nuevo `data/ua.json`.

Se consideran las categorías de susceptibilidad media, alta y muy alta.
