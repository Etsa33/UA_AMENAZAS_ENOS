/* Geoportal – Unidades de Atención (UA) expuestas a amenazas (MTDH / DGID) · v3 */
(function () {
  'use strict';

  // ---------------- configuración ----------------
  const HAZ = {
    inund: { name: 'Inundaciones', short: 'Inundaciones', colors: ['#d4e3ec', '#7c9fbb', '#2f6690'], max: 2 },
    mm:    { name: 'Movimientos en masa', short: 'Mov. en masa', colors: ['#fde8cc', '#f8ad6a', '#e8740c'], max: 3 },
    seq:   { name: 'Sequía', short: 'Sequía', colors: ['#f6ecc4', '#dcb65a', '#9c6b1c'], max: 2 },
    inc:   { name: 'Incendios forestales', short: 'Incendios', colors: ['#fbd5c8', '#ec7b5c', '#b3261e'], max: 3 },
    multi: { name: 'Multiamenaza (inundaciones o mov. en masa)', short: 'Multiamenaza', colors: ['#e4d6ef', '#a07cb5', '#5b2a74'], max: 3 },
  };
  const CAT = ['No expuesta', 'Media', 'Alta', 'Muy alta'];
  const RAW = ['-', '1_MEDIA', '2_ALTA', '3_MUY ALTA'];
  const NONE_COLOR = '#ffffff';
  // regiones por provincia (código DPA)
  const REGION = {
    Costa: ['08', '13', '23', '12', '09', '24', '07'],
    Sierra: ['04', '10', '17', '05', '18', '02', '06', '03', '01', '11'],
    'Amazonía': ['21', '15', '22', '16', '14', '19'],
    Insular: ['20'],
  };
  const ALL_REG = ['Costa', 'Sierra', 'Amazonía', 'Insular'];
  const REG_OF = {}; Object.entries(REGION).forEach(([r, l]) => l.forEach((p) => (REG_OF[p] = r)));
  // En un Evento El Niño la sequía y los incendios se asocian a la Sierra y la Amazonía
  const DEFAULT_REG = { inund: ALL_REG, mm: ALL_REG, multi: ALL_REG, seq: ['Sierra', 'Amazonía'], inc: ['Sierra', 'Amazonía'] };

  const state = { prov: '', can: '', par: '', serv: '', mod: '', cats: [1, 2, 3], regs: ALL_REG.slice(), layer: 'inund', metric: 'n',
    showExp: true, showNoExp: false, poly: null };
  let DATA, UA = [], GEO = {}, DIC = null, MATRIZ = null, map, geoLayer, legendCtl, cluExp, cluNoExp, drawHandler, polyLayer;
  const NAMES = { prov: {}, can: {}, par: {} };

  const $ = (id) => document.getElementById(id);
  const fmt = (n) => Number(n).toLocaleString('es-EC');
  const pct = (a, b) => (b ? (100 * a) / b : 0);
  const fpct = (v) => v.toLocaleString('es-EC', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' %';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function loadJson(name, path) {
    const embedded = document.getElementById(`embedded-${name}`);
    return embedded ? Promise.resolve(JSON.parse(embedded.textContent)) : fetch(path).then((r) => r.json());
  }
  function loadBinary(name, path) {
    const embedded = document.getElementById(`embedded-${name}`);
    if (!embedded) return fetch(path).then((r) => r.arrayBuffer());
    const raw = atob(embedded.textContent.trim());
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    return Promise.resolve(bytes.buffer);
  }

  // ---------------- carga ----------------
  Promise.all([
    loadJson('ua', 'data/ua.json'),
    loadJson('provincias', 'data/provincias.json'),
    loadJson('cantones', 'data/cantones.json'),
    loadJson('diccionario', 'data/diccionario.json'),
  ]).then(([ua, prov, can, dic]) => {
    DATA = ua; DIC = dic;
    GEO.prov = prov; GEO.can = can;
    prov.features.forEach((f) => (NAMES.prov[f.properties.DPA_PROVIN] = f.properties.DPA_DESPRO));
    can.features.forEach((f) => (NAMES.can[f.properties.DPA_CANTON] = f.properties.DPA_DESCAN));
    UA = ua.rows.map((r, i) => ({
      i, codigo: r[0], nombre: r[1], serv: r[2], mod: r[3], prov: r[4], can: r[5], par: r[6], parNombre: r[7],
      ud: r[8], tipo: r[9], area: r[10], adm: r[11], usuarios: r[12], inund: r[13], mm: r[14], seq: r[15], inc: r[16],
      lat: r[17], lon: r[18], despro: r[19], descan: r[20], despar: r[21],
    }));
    UA.forEach((u) => { u.multi = u.inund > 0 || u.mm > 0 ? 1 : 0; u.reg = REG_OF[u.prov] || ''; });
    $('corte').textContent = ua.corte.toLowerCase();
    initMap(); initControls(); syncCats(true); setRegs(DEFAULT_REG[state.layer]); update(true);
    $('loading').classList.add('hide');
  }).catch((e) => {
    $('loading').innerHTML = '<b>No se pudieron cargar los datos.</b><small>Abra el geoportal desde un servidor web (GitHub Pages o un servidor local), no directamente como archivo.</small>';
    console.error(e);
  });

  function loadParroquias() {
    if (GEO.par) return Promise.resolve(GEO.par);
    return loadJson('parroquias', 'data/parroquias.json').then((g) => {
      GEO.par = g;
      g.features.forEach((f) => (NAMES.par[f.properties.DPA_PARROQ] = f.properties.DPA_DESPAR));
      return g;
    });
  }

  // ---------------- mapa ----------------
  function initMap() {
    map = L.map('map', { zoomControl: true, minZoom: 5, maxZoom: 19, attributionControl: true }).setView([-1.5, -78.4], 7);
    const esriAttr = 'Tiles &copy; Esri';
    const gris = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
      attribution: esriAttr + ' — Esri, HERE, Garmin, &copy; OpenStreetMap', maxNativeZoom: 16, maxZoom: 19 });
    const grisRef = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}', {
      maxNativeZoom: 16, maxZoom: 19, pane: 'shadowPane' });
    const topo = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', {
      attribution: esriAttr + ' — Esri, HERE, Garmin, USGS', maxZoom: 19 });
    const osm = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap', maxZoom: 19 });
    const esri = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      attribution: esriAttr + ' — Esri, Maxar, Earthstar Geographics', maxZoom: 19 });
    const claro = L.layerGroup([gris, grisRef]).addTo(map);
    L.control.layers({ 'Gris claro': claro, 'Topográfico': topo, 'OpenStreetMap': osm, 'Satélite': esri }, null, { position: 'topright' }).addTo(map);
    L.control.scale({ imperial: false, position: 'bottomright' }).addTo(map);
    legendCtl = L.control({ position: 'bottomright' });
    legendCtl.onAdd = () => { const d = L.DomUtil.create('div', 'legend'); d.id = 'legend'; return d; };
    legendCtl.addTo(map);

    // puntos de UA con clusters (expuestas / no expuestas)
    const cluOpts = (cls) => ({
      showCoverageOnHover: false, maxClusterRadius: 45, disableClusteringAtZoom: 15, chunkedLoading: true,
      iconCreateFunction: (c) => { const n = c.getChildCount(), s = n < 10 ? 26 : n < 100 ? 32 : n < 1000 ? 38 : 44;
        return L.divIcon({ html: `<div class="clu ${cls}" style="width:${s}px;height:${s}px">${n}</div>`, className: '', iconSize: [s, s] }); },
    });
    cluExp = L.markerClusterGroup(cluOpts('exp'));
    cluNoExp = L.markerClusterGroup(cluOpts('noexp'));
    // código de la UA visible desde ~1:20.000 (zoom 15)
    const codes = () => map.getContainer().classList.toggle('show-codes', map.getZoom() >= 15);
    map.on('zoomend', codes); codes();

    // polígono de selección
    drawHandler = new L.Draw.Polygon(map, { allowIntersection: false, showArea: false,
      shapeOptions: { color: '#454193', weight: 2.5, fillColor: '#FFC60A', fillOpacity: 0.12, dashArray: '6 4' } });
    map.on(L.Draw.Event.CREATED, (e) => {
      if (polyLayer) map.removeLayer(polyLayer);
      polyLayer = e.layer.addTo(map);
      state.poly = polyLayer.getLatLngs()[0].map((ll) => [ll.lng, ll.lat]);
      $('btnDraw').classList.remove('active');
      updateSelection();
    });
  }

  // ---------------- controles ----------------
  function opt(sel, value, text) { const o = document.createElement('option'); o.value = value; o.textContent = text; sel.appendChild(o); }
  function resetSelect(sel, label) { sel.innerHTML = ''; opt(sel, '', label); }
  const byName = (a, b) => a[1].localeCompare(b[1], 'es');

  function initControls() {
    fillProv();
    DATA.dict.serv.map((s, i) => [i, titleCase(s)]).sort(byName).forEach(([i, s]) => opt($('fServ'), i, s));
    fillMod();

    const ll = $('layerList');
    ['inund', 'mm', 'seq', 'inc', 'multi'].forEach((k) => {
      const b = document.createElement('button');
      b.className = 'layer-opt' + (k === state.layer ? ' active' : '');
      b.dataset.layer = k;
      b.innerHTML = `<span class="ramp">${HAZ[k].colors.map((c) => `<i style="background:${c}"></i>`).join('')}</span>${HAZ[k].name}`;
      b.onclick = () => {
        state.layer = k; ll.querySelectorAll('.layer-opt').forEach((x) => x.classList.toggle('active', x === b));
        syncCats(true); setRegs(DEFAULT_REG[k]); update(!state.prov);
      };
      ll.appendChild(b);
    });
    document.querySelectorAll('.seg-btn').forEach((b) => (b.onclick = () => {
      state.metric = b.dataset.metric;
      document.querySelectorAll('.seg-btn').forEach((x) => x.classList.toggle('active', x === b));
      update();
    }));
    $('fProv').onchange = (e) => setProv(e.target.value, true);
    $('fCan').onchange = (e) => setCan(e.target.value, true);
    $('fPar').onchange = (e) => { state.par = e.target.value; update(true); };
    $('fServ').onchange = (e) => { state.serv = e.target.value; state.mod = ''; fillMod(); update(); };
    $('fMod').onchange = (e) => { state.mod = e.target.value; update(); };
    $('fCat').querySelectorAll('input').forEach((i) => (i.onchange = () => {
      state.cats = [...$('fCat').querySelectorAll('input:checked')].map((x) => +x.value); update();
    }));
    $('fReg').querySelectorAll('input').forEach((i) => (i.onchange = () => {
      setRegs([...$('fReg').querySelectorAll('input:checked')].map((x) => x.value)); update(true);
    }));
    $('ptExp').onchange = (e) => { state.showExp = e.target.checked; renderPoints(); updateSelection(); };
    $('ptNoExp').onchange = (e) => { state.showNoExp = e.target.checked; renderPoints(); updateSelection(); };
    $('btnDraw').onclick = () => { $('btnDraw').classList.add('active'); drawHandler.enable(); };
    $('btnClearSel').onclick = () => clearSelection();
    $('btnClear').onclick = clearAll;
    $('btnExport').onclick = () => exportExcel(false);
    $('btnExportSel').onclick = () => exportExcel(true);
  }

  // categorías disponibles según la capa (inundaciones y sequía no tienen "muy alta")
  function syncCats(reset) {
    const max = HAZ[state.layer].max;
    $('fCat').querySelectorAll('label').forEach((lb) => {
      const inp = lb.querySelector('input'), v = +inp.value, dis = v > max;
      inp.disabled = dis; lb.classList.toggle('disabled', dis);
      if (dis) inp.checked = false; else if (reset) inp.checked = true;
    });
    state.cats = [...$('fCat').querySelectorAll('input:checked')].map((x) => +x.value);
  }
  // regiones: al quedar una provincia fuera de las regiones marcadas, se limpia el filtro territorial
  function setRegs(list) {
    state.regs = list.slice();
    $('fReg').querySelectorAll('input').forEach((i) => (i.checked = state.regs.includes(i.value)));
    if (state.prov && !state.regs.includes(REG_OF[state.prov])) setProv('', false, true);
    fillProv();
  }
  function fillProv() {
    const sel = $('fProv'), cur = state.prov; resetSelect(sel, 'Todas');
    Object.entries(NAMES.prov).filter(([c]) => state.regs.includes(REG_OF[c])).sort(byName).forEach(([c, n]) => opt(sel, c, n));
    sel.value = cur;
  }
  function fillMod() {
    const sel = $('fMod'); resetSelect(sel, 'Todas');
    const mods = new Set(DATA.servMod.filter(([s]) => state.serv === '' || s === +state.serv).map(([, m]) => m));
    [...mods].map((m) => [m, titleCase(DATA.dict.mod[m])]).sort(byName).forEach(([m, n]) => opt(sel, m, n));
  }
  function setProv(code, zoom, silent) {
    state.prov = code; state.can = ''; state.par = '';
    $('fProv').value = code;
    const sc = $('fCan'); resetSelect(sc, 'Todos'); sc.disabled = !code;
    resetSelect($('fPar'), 'Todas'); $('fPar').disabled = true;
    if (code) GEO.can.features.filter((f) => f.properties.DPA_PROVIN === code)
      .map((f) => [f.properties.DPA_CANTON, f.properties.DPA_DESCAN]).sort(byName).forEach(([c, n]) => opt(sc, c, n));
    if (!silent) update(zoom);
  }
  function setCan(code, zoom) {
    state.can = code; state.par = '';
    $('fCan').value = code;
    const sp = $('fPar'); resetSelect(sp, 'Todas'); sp.disabled = !code;
    if (!code) { update(zoom); return; }
    loadParroquias().then((g) => {
      g.features.filter((f) => f.properties.DPA_CANTON === code)
        .map((f) => [f.properties.DPA_PARROQ, f.properties.DPA_DESPAR]).sort(byName).forEach(([c, n]) => opt(sp, c, n));
      update(zoom);
    });
  }
  function clearAll() {
    Object.assign(state, { serv: '', mod: '' });
    $('fServ').value = ''; fillMod(); syncCats(true); clearSelection(true);
    setProv('', false, true); setRegs(DEFAULT_REG[state.layer]); update(true);
  }

  // ---------------- filtrado ----------------
  const inTerritory = (u) => (!state.prov || u.prov === state.prov) && (!state.can || u.can === state.can) && (!state.par || u.par === state.par);
  const inOthers = (u) => state.regs.includes(u.reg) && (state.serv === '' || u.serv === +state.serv) && (state.mod === '' || u.mod === +state.mod);
  const filtered = () => UA.filter((u) => inOthers(u) && inTerritory(u));
  // exposición a la capa seleccionada, según las categorías marcadas
  const exposed = (u, k = state.layer) => (k === 'multi' ? state.cats.includes(u.inund) || state.cats.includes(u.mm) : state.cats.includes(u[k]));
  const catsTxt = () => (state.cats.length ? state.cats.map((c) => CAT[c].toLowerCase()).join(', ') : 'ninguna categoría');
  function scopeName() {
    if (state.par) return titleCase(NAMES.par[state.par]);
    if (state.can) return titleCase(NAMES.can[state.can]);
    if (state.prov) return titleCase(NAMES.prov[state.prov]);
    return 'Nivel nacional' + (state.regs.length === 4 ? '' : ` (${state.regs.join(', ') || 'sin regiones'})`);
  }

  function level() {
    if (state.can) return { key: 'par', geo: GEO.par, code: 'DPA_PARROQ', name: 'DPA_DESPAR', parent: (f) => f.properties.DPA_CANTON === state.can, label: 'parroquia' };
    if (state.prov) return { key: 'can', geo: GEO.can, code: 'DPA_CANTON', name: 'DPA_DESCAN', parent: (f) => f.properties.DPA_PROVIN === state.prov, label: 'cantón' };
    return { key: 'prov', geo: GEO.prov, code: 'DPA_PROVIN', name: 'DPA_DESPRO', parent: (f) => state.regs.includes(REG_OF[f.properties.DPA_PROVIN]), label: 'provincia' };
  }
  function aggregate(lv, rows) {
    const agg = {};
    rows.forEach((u) => {
      const k = u[lv.key]; const a = agg[k] || (agg[k] = { tot: 0, exp: 0, usr: 0, usrExp: 0 });
      a.tot++; a.usr += u.usuarios;
      if (exposed(u)) { a.exp++; a.usrExp += u.usuarios; }
    });
    return agg;
  }

  // ---------------- Jenks (Fisher) ----------------
  function jenks(data, k) {
    const v = [...data].sort((a, b) => a - b), n = v.length;
    if (n === 0) return [];
    const uniq = [...new Set(v)];
    if (uniq.length <= k) return uniq;
    const lower = Array.from({ length: n + 1 }, () => Array(k + 1).fill(0));
    const varc = Array.from({ length: n + 1 }, () => Array(k + 1).fill(Infinity));
    for (let i = 1; i <= k; i++) { lower[1][i] = 1; varc[1][i] = 0; }
    for (let l = 2; l <= n; l++) {
      let s1 = 0, s2 = 0, w = 0, vv = 0;
      for (let m = 1; m <= l; m++) {
        const i3 = l - m + 1, val = v[i3 - 1];
        s2 += val * val; s1 += val; w++; vv = s2 - (s1 * s1) / w;
        const i4 = i3 - 1;
        if (i4 !== 0) for (let j = 2; j <= k; j++) {
          if (varc[l][j] >= vv + varc[i4][j - 1]) { lower[l][j] = i3; varc[l][j] = vv + varc[i4][j - 1]; }
        }
      }
      lower[l][1] = 1; varc[l][1] = vv;
    }
    const br = Array(k); br[k - 1] = v[n - 1];
    let c = n;
    for (let j = k; j >= 2; j--) { const id = lower[c][j] - 2; br[j - 2] = v[id]; c = lower[c][j] - 1; }
    return br;
  }

  // ---------------- actualización ----------------
  function update(zoom) {
    if (!GEO.prov) return;
    const lv = level();
    if (lv.key === 'par' && !GEO.par) { loadParroquias().then(() => update(zoom)); return; }
    const rowsTerr = UA.filter((u) => inOthers(u) && (!state.prov || u.prov === state.prov) && (!state.can || u.can === state.can));
    const agg = aggregate(lv, rowsTerr);
    const feats = lv.geo.features.filter(lv.parent);
    const val = (code) => { const a = agg[code]; if (!a || !a.tot) return null; return state.metric === 'n' ? a.exp : pct(a.exp, a.tot); };

    const vals = feats.map((f) => val(f.properties[lv.code])).filter((x) => x !== null && x > 0);
    const br = jenks(vals, 3);
    const colors = HAZ[state.layer].colors;
    const classOf = (x) => { if (x === null) return -1; if (x <= 0) return 0; const i = br.findIndex((b) => x <= b + 1e-9); return 1 + (i < 0 ? br.length - 1 : i); };
    const colorOf = (x) => { const c = classOf(x); return c < 0 ? null : c === 0 ? NONE_COLOR : colors[Math.min(c - 1, 2) + (br.length < 3 ? 3 - br.length : 0)]; };

    if (geoLayer) map.removeLayer(geoLayer);
    geoLayer = L.geoJSON({ type: 'FeatureCollection', features: feats }, {
      style: (f) => {
        const code = f.properties[lv.code], x = val(code), col = colorOf(x), sel = state.par && code === state.par;
        return { color: sel ? '#FFC60A' : '#2b2b3a', weight: sel ? 3.5 : 0.8, fillOpacity: col ? 0.8 : 0.35, fillColor: col || '#d9dce4', dashArray: col ? null : '3' };
      },
      onEachFeature: (f, layer) => {
        const code = f.properties[lv.code], a = agg[code] || { tot: 0, exp: 0, usr: 0, usrExp: 0 };
        layer.bindTooltip(`<div class="tt-t">${f.properties[lv.name]}</div>` +
          (a.tot ? `UA: <b>${fmt(a.tot)}</b> · Usuarios: <b>${fmt(a.usr)}</b><br>` +
            `Expuestas a ${HAZ[state.layer].short.toLowerCase()}: <b>${fmt(a.exp)}</b> (${fpct(pct(a.exp, a.tot))})<br>` +
            `Usuarios en UA expuestas: <b>${fmt(a.usrExp)}</b> (${fpct(pct(a.usrExp, a.usr))})` : 'Sin UA con los filtros actuales'),
          { sticky: true, className: 'tt' });
        layer.on({
          mouseover: (e) => e.target.setStyle({ weight: 2.5, color: '#454193' }),
          mouseout: (e) => geoLayer.resetStyle(e.target),
          click: () => drill(lv.key, code),
        });
      },
    }).addTo(map);
    if (zoom) {
      const b = geoLayer.getBounds();
      if (b.isValid()) map.fitBounds(lv.key === 'prov' && state.regs.length === 4 ? L.latLngBounds([[-5.1, -81.2], [1.5, -75.2]]) : b, { padding: [20, 20] });
    }
    renderLegend(br, colors, lv);
    renderChip(lv);
    renderCrumb();
    renderStats();
    renderTop(lv, agg, feats);
    renderPoints();
    updateSelection();
  }

  function drill(key, code) {
    if (key === 'prov') setProv(code, true);
    else if (key === 'can') setCan(code, true);
    else { state.par = state.par === code ? '' : code; $('fPar').value = state.par; update(false); }
  }

  function renderLegend(br, colors, lv) {
    const unit = state.metric === 'n' ? 'N.º de UA' : '% de UA';
    const f = (x) => (state.metric === 'n' ? fmt(Math.round(x)) : x.toLocaleString('es-EC', { maximumFractionDigits: 1 }));
    let lo = state.metric === 'n' ? 1 : 0.1, rows = '';
    const off = br.length < 3 ? 3 - br.length : 0;
    br.forEach((b, i) => {
      rows += `<div class="row"><span class="sw" style="background:${colors[i + off]}"></span>${f(lo)} – ${f(b)}</div>`;
      lo = state.metric === 'n' ? b + 1 : b + 0.1;
    });
    const allC = state.cats.length === HAZ[state.layer].max;
    $('legend').innerHTML = `<h4>${HAZ[state.layer].name}<br><span style="font-weight:500;color:#5a6072">${unit} expuestas por ${lv.label}${allC ? '' : '<br>Categorías: ' + catsTxt()}</span></h4>` +
      `<div class="row"><span class="sw" style="background:#fff"></span>Sin UA expuestas</div>${rows}` +
      `<div class="row"><span class="sw none"></span>Sin UA registradas</div>` +
      `<div class="row" style="margin-top:8px"><span class="pt pt-exp"></span>UA expuesta</div><div class="row"><span class="pt pt-noexp"></span>UA no expuesta</div>`;
  }

  function filterText() {
    const t = [];
    if (state.prov) t.push(NAMES.prov[state.prov]);
    if (state.can) t.push(NAMES.can[state.can]);
    if (state.par) t.push(NAMES.par[state.par]);
    if (state.regs.length < 4) t.push(state.regs.join(', ') || 'sin regiones');
    if (state.serv !== '') t.push(titleCase(DATA.dict.serv[+state.serv]));
    if (state.mod !== '') t.push(titleCase(DATA.dict.mod[+state.mod]));
    return t;
  }
  function renderChip(lv) {
    const t = filterText();
    $('mapChip').innerHTML = `${HAZ[state.layer].name} (${catsTxt()}) · por ${lv.label}<small>${t.length ? t.join(' · ') : 'Nivel nacional · sin filtros'}</small>`;
  }
  function renderCrumb() {
    const c = $('crumb'); c.innerHTML = '';
    const add = (txt, fn) => { const b = document.createElement('button'); b.textContent = txt; b.onclick = fn; c.appendChild(b); };
    add('Ecuador', () => setProv('', true));
    if (state.prov) { c.insertAdjacentHTML('beforeend', '<span>›</span>'); add(NAMES.prov[state.prov], () => setProv(state.prov, true)); }
    if (state.can) { c.insertAdjacentHTML('beforeend', '<span>›</span>'); add(NAMES.can[state.can], () => setCan(state.can, true)); }
  }

  function renderStats() {
    const rows = filtered(), n = rows.length, scope = scopeName();
    const exp = rows.filter((u) => exposed(u));
    $('kUA').textContent = fmt(n);
    $('kExp').textContent = fmt(exp.length);
    $('kUsr').textContent = fmt(exp.reduce((s, u) => s + u.usuarios, 0));
    $('kNote').textContent = `Cifras de ${HAZ[state.layer].name.toLowerCase()} (categorías: ${catsTxt()}) · ${scope}`;
    $('statsTitle').textContent = 'UA por categoría de susceptibilidad ' + (scope.startsWith('Nivel nacional') ? 'a n' + scope.slice(1) : 'de ' + scope);
    const keys = state.layer === 'multi' ? ['inund', 'mm'] : [state.layer];
    let html = '';
    if (state.layer === 'multi') {
      const m = rows.filter((u) => u.multi).length;
      html += `<div class="hz"><div class="hz-h"><span>Multiamenaza</span><span>${fmt(m)} UA · ${fpct(pct(m, n))}</span></div>` +
        bar('Sí', m, n, HAZ.multi.colors[2]) + bar('No', n - m, n, '#c9ccd6') + '</div>';
    }
    html += keys.map((k) => {
      const h = HAZ[k], cnt = [0, 0, 0, 0];
      rows.forEach((u) => cnt[u[k]]++);
      const e = n - cnt[0];
      const cats = h.max === 3 ? [1, 2, 3] : [1, 2];
      const bars = cats.map((c) => bar(CAT[c], cnt[c], n, h.colors[c - 1 + (h.max === 2 ? 1 : 0)])).concat(bar('No exp.', cnt[0], n, '#c9ccd6')).join('');
      return `<div class="hz"><div class="hz-h"><span>${h.name}</span><span>${fmt(e)} UA · ${fpct(pct(e, n))}</span></div>${bars}</div>`;
    }).join('');
    $('stats').innerHTML = n ? html : '<div class="empty">Sin UA con los filtros actuales</div>';
  }
  function bar(label, v, n, color) {
    const p = pct(v, n);
    return `<div class="bar"><span class="lb">${label}</span><span class="tr"><span class="fl" style="width:${p}%;background:${color}"></span></span><span class="vl">${fmt(v)} <small>${fpct(p)}</small></span></div>`;
  }

  function renderTop(lv, agg, feats) {
    const list = feats.map((f) => { const c = f.properties[lv.code], a = agg[c] || { tot: 0, exp: 0 };
      return { c, n: f.properties[lv.name], v: state.metric === 'n' ? a.exp : pct(a.exp, a.tot), a }; })
      .filter((x) => x.a.tot > 0).sort((a, b) => b.v - a.v).slice(0, 10);
    const lvName = { prov: 'Provincias', can: 'Cantones', par: 'Parroquias' }[lv.key];
    $('topTitle').textContent = `${lvName} con más UA expuestas · ${HAZ[state.layer].short}`;
    const mx = list.length ? list[0].v || 1 : 1, col = HAZ[state.layer].colors[2];
    $('top').innerHTML = list.length ? list.map((x) =>
      `<div class="top-row" data-c="${x.c}"><span class="top-n">${x.n}</span><span class="top-v">${state.metric === 'n' ? fmt(x.v) : fpct(x.v)}</span><span class="tr"><span class="fl" style="width:${(100 * x.v) / mx}%;background:${col}"></span></span></div>`).join('')
      : '<div class="empty">Sin UA con los filtros actuales</div>';
    $('top').querySelectorAll('.top-row').forEach((r) => (r.onclick = () => drill(lv.key, r.dataset.c)));
  }

  // ---------------- puntos de UA ----------------
  function label(col) {
    const v = DIC && DIC.variables.find((x) => x[1] === col);
    return v ? v[2].replace(/\s*\n\s*/g, ' ') : col;
  }
  function popupHtml(u) {
    const D = DATA.dict;
    const rowsP = [
      ['dpa_despro', u.despro], ['dpa_descan', u.descan], ['dpa_despar', u.despar], ['co_siimdh', u.codigo],
      ['servicio', D.serv[u.serv]], ['mod', D.mod[u.mod]], ['tipo', D.tipo[u.tipo]], ['total', fmt(u.usuarios)], ['corte', DATA.corte],
      ['susc_inundacion', RAW[u.inund]], ['susc_movimientos_masa', RAW[u.mm]], ['susc_sequia', RAW[u.seq]], ['susc_inc_forestales', RAW[u.inc]],
      ['multiamenaza', u.multi ? 'SI' : '-'],
    ];
    return `<div class="pop"><h3>${esc(u.nombre)}</h3><div class="pop-sub">Variables de la matriz</div><table>` +
      rowsP.map(([c, v]) => `<tr><td>${esc(label(c))}</td><td>${esc(v)}</td></tr>`).join('') + '</table></div>';
  }
  let ICONS;
  function marker(u, kind) {
    ICONS = ICONS || {
      exp: L.divIcon({ html: '<div class="ua-dot exp" style="width:12px;height:12px"></div>', className: '', iconSize: [12, 12] }),
      noexp: L.divIcon({ html: '<div class="ua-dot noexp" style="width:12px;height:12px"></div>', className: '', iconSize: [12, 12] }),
    };
    const m = L.marker([u.lat, u.lon], { icon: ICONS[kind] });
    m.bindTooltip(u.codigo, { permanent: true, direction: 'right', offset: [6, 0], className: 'code' });
    m.bindPopup(() => popupHtml(u), { maxWidth: 380 });
    return m;
  }
  function renderPoints() {
    const rows = filtered().filter((u) => u.lat != null);
    const e = rows.filter((u) => exposed(u)), ne = rows.filter((u) => !exposed(u));
    $('nExp').textContent = fmt(e.length); $('nNoExp').textContent = fmt(ne.length);
    cluExp.clearLayers(); cluNoExp.clearLayers();
    if (state.showNoExp) { cluNoExp.addLayers(ne.map((u) => marker(u, 'noexp'))); if (!map.hasLayer(cluNoExp)) map.addLayer(cluNoExp); }
    else if (map.hasLayer(cluNoExp)) map.removeLayer(cluNoExp);
    if (state.showExp) { cluExp.addLayers(e.map((u) => marker(u, 'exp'))); if (!map.hasLayer(cluExp)) map.addLayer(cluExp); }
    else if (map.hasLayer(cluExp)) map.removeLayer(cluExp);
  }

  // ---------------- selección por polígono ----------------
  function inPoly(pt, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  // solo se seleccionan las UA de las capas visibles (expuestas / no expuestas)
  const visible = (u) => (exposed(u) ? state.showExp : state.showNoExp);
  const selected = () => (state.poly ? filtered().filter((u) => u.lat != null && visible(u) && inPoly([u.lon, u.lat], state.poly)) : []);
  function layersTxt() {
    const hz = `${HAZ[state.layer].name.toLowerCase()} (${catsTxt()})`;
    if (state.showExp && state.showNoExp) return `Expuestas y no expuestas a ${hz}`;
    if (state.showExp) return `Expuestas a ${hz}`;
    if (state.showNoExp) return `No expuestas a ${hz}`;
    return 'Ninguna capa de UA activa';
  }
  function updateSelection() {
    if (!state.poly) {
      $('selInfo').textContent = 'Dibuje un polígono sobre el mapa para seleccionar las UA que quedan dentro (según los filtros activos).';
      $('btnExportSel').disabled = true; $('btnClearSel').disabled = true; return;
    }
    const s = selected(), e = s.filter((u) => exposed(u)).length;
    const hz = HAZ[state.layer].name.toLowerCase();
    $('selInfo').innerHTML = !state.showExp && !state.showNoExp
      ? 'Active al menos una capa de UA (expuestas o no expuestas) para seleccionar.'
      : `<b>${fmt(s.length)}</b> UA seleccionadas` + (state.showExp && state.showNoExp
        ? `, de las cuales <b>${fmt(e)}</b> están expuestas a ${hz}.`
        : state.showExp ? ` (solo expuestas a ${hz}).` : ` (solo no expuestas a ${hz}).`);
    $('btnExportSel').disabled = !s.length; $('btnClearSel').disabled = false;
  }
  function clearSelection(silent) {
    if (polyLayer) map.removeLayer(polyLayer);
    polyLayer = null; state.poly = null; if (drawHandler) drawHandler.disable(); $('btnDraw').classList.remove('active');
    if (silent !== true) updateSelection();
  }

  // ---------------- exportación Excel (formato UA_AGO26_FILTRO) ----------------
  const NAVY = 'FF454193', WHITE = 'FFFFFFFF';
  const COLW = [11.8, 11.5, 13, 13, 13, 13, 13, 30, 11.5, 13, 13, 13, 13, 11.5, 13, 13, 13, 13, 13, 13, 13, 13, 12.2, 11.5, 13, 13, 13, 13, 13, 13, 13, 13, 13, 13, 13, 13, 13, 13, 13, 13, 13, 13, 18.5, 13, 13, 13, 17.3];
  const hair = { style: 'hair', color: { argb: 'FF000000' } };
  const HAIR = { top: hair, left: hair, bottom: hair, right: hair };

  async function exportExcel(bySelection) {
    const btn = bySelection ? $('btnExportSel') : $('btnExport');
    const old = btn.innerHTML; btn.disabled = true; btn.textContent = 'Generando…';
    try {
      if (!MATRIZ) MATRIZ = await loadJson('ua-matriz', 'data/ua_matriz.json');
      const bannerBuf = await loadBinary('banner', 'data/banner.png');
      const sel = bySelection ? selected() : filtered();
      const afect = sel.filter((u) => exposed(u));
      const wb = new ExcelJS.Workbook();
      wb.creator = 'DGID – MTDH';
      const imgId = wb.addImage({ buffer: bannerBuf, extension: 'png' });
      const titulo = `Unidades de Atención expuestas a amenazas - ${DATA.corte}`;
      const tc = (s) => (s ? titleCase(s) : '-');
      const info = {
        prov: tc(state.prov && NAMES.prov[state.prov]), can: tc(state.can && NAMES.can[state.can]), par: tc(state.par && NAMES.par[state.par]),
        reg: state.regs.length === 4 ? 'Todas' : state.regs.join(', '),
        serv: state.serv !== '' ? tc(DATA.dict.serv[+state.serv]) : 'Todos', mod: state.mod !== '' ? tc(DATA.dict.mod[+state.mod]) : 'Todas',
        selec: bySelection ? 'Polígono dibujado en el mapa' : 'Filtros aplicados',
        capas: layersTxt(),
        susc: `${HAZ[state.layer].name} (${catsTxt()})`,
      };
      if (bySelection) addDataSheet(wb, imgId, 'UA_POLYGON', titulo, info, sel, false, true);
      else {
        addDataSheet(wb, imgId, 'UA_SELECT', titulo, info, sel, false, false);
        addDataSheet(wb, imgId, 'UA_EXPUESTAS', titulo, info, afect, true, false);
      }
      addDicSheet(wb, imgId);
      const buf = await wb.xlsx.writeBuffer();
      const tag = [state.prov && NAMES.prov[state.prov], state.can && NAMES.can[state.can], state.par && NAMES.par[state.par]]
        .filter(Boolean).join('_').replace(/\s+/g, '_') || 'NACIONAL';
      const mes = DATA.corte.slice(0, 3).toUpperCase() + DATA.corte.slice(-2);
      download(buf, `UA_${mes}_AMENAZAS_${bySelection ? 'POLYGON' : 'FILTRO'}_${tag}.xlsx`);
    } catch (e) { console.error(e); alert('No se pudo generar el reporte. Intente nuevamente.'); }
    finally { btn.innerHTML = old; btn.disabled = false; if (bySelection) updateSelection(); }
  }

  function putBanner(ws, imgId) {
    ws.addImage(imgId, { tl: { col: 0, row: 0 }, ext: { width: 557, height: 131 }, editAs: 'oneCell' });
    ws.getRow(5).height = 15.5; ws.getRow(6).height = 15.5;
  }
  function headLine(ws, r, labelTxt, value) {
    const a = ws.getCell(`A${r}`), f = ws.getCell(`F${r}`);
    a.value = labelTxt; a.font = { name: 'Calibri', size: 14, bold: true, color: { argb: NAVY } }; a.alignment = { horizontal: 'right' };
    f.value = value; f.font = { name: 'Calibri', size: 14, color: { argb: NAVY } }; f.alignment = { horizontal: 'left' };
    ws.mergeCells(`A${r}:E${r}`);
    ws.getRow(r).height = 18.5;
  }
  function sideLine(ws, r, labelTxt, value) {
    const a = ws.getCell(`J${r}`), b = ws.getCell(`M${r}`);
    a.value = labelTxt; a.font = { name: 'Calibri', size: 12, bold: true, color: { argb: NAVY } }; a.alignment = { horizontal: 'right' };
    b.value = value; b.font = { name: 'Calibri', size: 12, color: { argb: NAVY } };
    ws.mergeCells(`J${r}:L${r}`);
  }
  function addDataSheet(wb, imgId, name, titulo, info, list, afectadas, poligono) {
    const ws = wb.addWorksheet(name, { views: [{ showGridLines: false }] });
    ws.columns = COLW.map((w) => ({ width: w }));
    putBanner(ws, imgId);
    const t = ws.getCell('A7'); t.value = titulo; t.font = { name: 'Calibri', size: 14, bold: true, color: { argb: NAVY } }; t.alignment = { horizontal: 'center' };
    ws.mergeCells('A7:I7'); ws.getRow(7).height = 18.5;
    headLine(ws, 8, 'Filtro Provincia:', info.prov);
    headLine(ws, 9, 'Filtro Cantón:', info.can);
    headLine(ws, 10, 'Filtro Parroquia:', info.par);
    if (afectadas) headLine(ws, 11, 'Susceptibilidad:', info.susc);
    if (poligono) headLine(ws, 11, 'UA incluidas:', info.capas);
    sideLine(ws, 8, 'Región:', info.reg);
    sideLine(ws, 9, 'Servicio:', info.serv);
    sideLine(ws, 10, 'Modalidad:', info.mod);
    if (poligono) sideLine(ws, 11, 'Selección:', info.selec);
    const hr = afectadas || poligono ? 13 : 12;
    const cols = MATRIZ.cols;
    const h = ws.getRow(hr); h.height = 42;
    cols.forEach((c, j) => {
      const cell = h.getCell(j + 1); cell.value = c;
      const fill = j >= 42 && j <= 45 ? 'FF5982DB' : j === 46 ? 'FF755DD9' : NAVY;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
      cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: WHITE } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = HAIR;
    });
    list.forEach((u, k) => {
      const row = ws.getRow(hr + 1 + k);
      row.values = MATRIZ.rows[u.i];
      for (let j = 1; j <= cols.length; j++) { const c = row.getCell(j); c.border = HAIR; c.font = { name: 'Calibri', size: 11 }; }
    });
    if (list.length) ws.autoFilter = { from: { row: hr, column: 1 }, to: { row: hr + list.length, column: cols.length } };
    else { const c = ws.getCell(`A${hr + 1}`); c.value = 'Sin Unidades de Atención para los filtros aplicados.'; c.font = { italic: true, color: { argb: 'FF5A6072' } }; }
  }
  function addDicSheet(wb, imgId) {
    const ws = wb.addWorksheet('DICCIONARIO_VARIABLES', { views: [{ showGridLines: false }] });
    ws.columns = [{ width: 18.5 }, { width: 15.5 }, { width: 23 }, { width: 53.5 }, { width: 113.2 }];
    putBanner(ws, imgId);
    let r = 7;
    DIC.encabezado.forEach((line) => {
      const labelLike = /:\s*$/.test(line[0]);
      if (line.length > 1) {
        const a = ws.getCell(`A${r}`); a.value = line[0]; a.font = { name: 'Calibri', size: 11, bold: true };
        const b = ws.getCell(`B${r}`); b.value = line[1].trim(); b.font = { name: 'Calibri', size: 11, bold: r === 7 }; b.alignment = { wrapText: true, vertical: 'top' };
        ws.mergeCells(`B${r}:E${r}`);
      } else if (labelLike) {
        const a = ws.getCell(`A${r}`); a.value = line[0]; a.font = { name: 'Calibri', size: 11, bold: true };
      } else {
        const b = ws.getCell(`B${r}`); b.value = line[0]; b.font = { name: 'Calibri', size: 11 };
      }
      r++;
    });
    r += 3;
    const h = ws.getRow(r); h.height = 30.75;
    ['No. campo', 'Campo en shapefile', 'Variables de la matriz', 'Descripción'].forEach((t, j) => {
      const c = h.getCell(j + 2); c.value = t; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
      c.font = { name: 'Calibri', size: 11, bold: true, color: { argb: WHITE } }; c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; c.border = HAIR;
    });
    DIC.variables.forEach((v) => {
      r++;
      const row = ws.getRow(r);
      v.forEach((x, j) => { const c = row.getCell(j + 2); c.value = x; c.border = HAIR; c.font = { name: 'Calibri', size: 11 };
        c.alignment = { horizontal: j === 0 ? 'center' : 'left', vertical: 'middle', wrapText: j === 2 }; });
    });
  }
  function download(buf, name) {
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  function titleCase(s) {
    const low = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'e', 'en', 'para', 'con', 'a']);
    return String(s).toLowerCase().split(' ').map((w, i) => (i && low.has(w) ? w : w.replace(/^\p{L}/u, (c) => c.toUpperCase()))).join(' ')
      .replace(/\b(Cnh|Cdi|Pej|Osc|Gad)\b/g, (m) => m.toUpperCase());
  }
})();
