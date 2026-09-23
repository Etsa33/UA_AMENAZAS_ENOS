# Geoportal · UA expuestas a amenazas asociadas al Evento El Niño

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
Reemplazar `data/ua.json` con el script de preparación usando la nueva matriz
(UA_MMMAA_AMENAZAS.xlsx). Se consideran las categorías media, alta y muy alta.
