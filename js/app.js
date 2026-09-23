/* Geoportal – UA expuestas a amenazas asociadas al Evento El Niño (MTDH / DGID) */
(function () {
  'use strict';

  // ---------------- configuración ----------------
  const HAZ = {
    inund: { name: 'Inundaciones', short: 'Inundaciones', colors: ['#d4e3ec', '#7c9fbb', '#2f6690'], max: 2 },
    mm:    { name: 'Movimientos en masa', short: 'Mov. en masa', colors: ['#fde8cc', '#f8ad6a', '#e8740c'], max: 3 },
    seq:   { name: 'Sequía', short: 'Sequía', colors: ['#f6ecc4', '#dcb65a', '#9c6b1c'], max: 2 },
    inc:   { name: 'Incendios forestales', short: 'Incendios', colors: ['#fbd5c8', '#ec7b5c', '#b3261e'], max: 3 },
    multi: { name: 'Multiamenaza (inundaciones o mov. en masa)', short: 'Multiamenaza', colors: ['#e4d6ef', '#a07cb5', '#5b2a74'], max: 0 },
  };
  const HAZ4 = ['inund', 'mm', 'seq', 'inc'];
  const CAT = ['No expuesta', 'Media', 'Alta', 'Muy alta'];
  const NONE_COLOR = '#ffffff';

  const state = { prov: '', can: '', par: '', serv: '', mod: '', am: '', cats: [1, 2, 3], layer: 'inund', metric: 'n' };
  let DATA, UA = [], GEO = {}, map, geoLayer, legendCtl;
  const NAMES = { prov: {}, can: {}, par: {} };

  const $ = (id) => document.getElementById(id);
  const fmt = (n) => Number(n).toLocaleString('es-EC');
  const pct = (a, b) => (b ? (100 * a) / b : 0);
  const fpct = (v) => v.toLocaleString('es-EC', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' %';

  // ---------------- carga ----------------
  Promise.all([
    fetch('data/ua.json').then((r) => r.json()),
    fetch('data/provincias.json').then((r) => r.json()),
    fetch('data/cantones.json').then((r) => r.json()),
  ]).then(([ua, prov, can]) => {
    DATA = ua;
    GEO.prov = prov; GEO.can = can;
    prov.features.forEach((f) => (NAMES.prov[f.properties.DPA_PROVIN] = f.properties.DPA_DESPRO));
    can.features.forEach((f) => (NAMES.can[f.properties.DPA_CANTON] = f.properties.DPA_DESCAN));
    UA = ua.rows.map((r) => ({
      codigo: r[0], nombre: r[1], serv: r[2], mod: r[3], prov: r[4], can: r[5], par: r[6], parNombre: r[7],
      ud: r[8], reg: r[9], area: r[10], adm: r[11], usuarios: r[12], extPob: r[13], pob: r[14],
      inund: r[15], mm: r[16], seq: r[17], inc: r[18],
    }));
    UA.forEach((u) => (u.multi = u.inund > 0 || u.mm > 0 ? 1 : 0));
    $('corte').textContent = ua.corte.toLowerCase();
    initMap(); initControls(); update(true);
    $('loading').classList.add('hide');
  }).catch((e) => {
    $('loading').innerHTML = '<b>No se pudieron cargar los datos.</b><small>Abra el geoportal desde un servidor web (GitHub Pages o un servidor local), no directamente como archivo.</small>';
    console.error(e);
  });

  function loadParroquias() {
    if (GEO.par) return Promise.resolve(GEO.par);
    return fetch('data/parroquias.json').then((r) => r.json()).then((g) => {
      GEO.par = g;
      g.features.forEach((f) => (NAMES.par[f.properties.DPA_PARROQ] = f.properties.DPA_DESPAR));
      return g;
    });
  }

  // ---------------- mapa ----------------
  function initMap() {
    map = L.map('map', { zoomControl: true, minZoom: 5, attributionControl: true }).setView([-1.5, -78.4], 7);
    const esriAttr = 'Tiles &copy; Esri';
    const gris = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
      attribution: esriAttr + ' — Esri, HERE, Garmin, &copy; OpenStreetMap', maxZoom: 16 });
    const grisRef = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 16, pane: 'shadowPane' });
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
  }

  // ---------------- controles ----------------
  function opt(sel, value, text) { const o = document.createElement('option'); o.value = value; o.textContent = text; sel.appendChild(o); }
  function resetSelect(sel, label) { sel.innerHTML = ''; opt(sel, '', label); }
  const byName = (a, b) => a[1].localeCompare(b[1], 'es');

  function initControls() {
    Object.entries(NAMES.prov).sort(byName).forEach(([c, n]) => opt($('fProv'), c, n));
    DATA.dict.serv.forEach((s, i) => opt($('fServ'), i, titleCase(s)));
    fillMod();

    // capas de coropletas
    const ll = $('layerList');
    ['inund', 'mm', 'seq', 'inc', 'multi'].forEach((k) => {
      const b = document.createElement('button');
      b.className = 'layer-opt' + (k === state.layer ? ' active' : '');
      b.dataset.layer = k;
      b.innerHTML = `<span class="ramp">${HAZ[k].colors.map((c) => `<i style="background:${c}"></i>`).join('')}</span>${HAZ[k].name}`;
      b.onclick = () => { state.layer = k; ll.querySelectorAll('.layer-opt').forEach((x) => x.classList.toggle('active', x === b)); update(); };
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
    $('fAm').onchange = (e) => { state.am = e.target.value; syncCats(); update(); };
    $('fCat').querySelectorAll('input').forEach((i) => (i.onchange = () => {
      state.cats = [...$('fCat').querySelectorAll('input:checked')].map((x) => +x.value); update();
    }));
    $('btnClear').onclick = clearAll;
    $('btnExport').onclick = exportExcel;
  }

  function syncCats() {
    const on = !!state.am, max = on ? HAZ[state.am].max : 3;
    $('fCat').querySelectorAll('label').forEach((lb) => {
      const inp = lb.querySelector('input'), v = +inp.value, dis = !on || v > max;
      inp.disabled = dis; lb.classList.toggle('disabled', dis);
      if (v > max) inp.checked = false; else if (!on) inp.checked = true;
    });
    state.cats = [...$('fCat').querySelectorAll('input:checked')].map((x) => +x.value);
  }

  function fillMod() {
    const sel = $('fMod'); resetSelect(sel, 'Todas');
    const mods = new Set(DATA.servMod.filter(([s]) => state.serv === '' || s === +state.serv).map(([, m]) => m));
    [...mods].map((m) => [m, DATA.dict.mod[m]]).sort(byName).forEach(([m, n]) => opt(sel, m, titleCase(n)));
  }

  function setProv(code, zoom) {
    state.prov = code; state.can = ''; state.par = '';
    $('fProv').value = code;
    const sc = $('fCan'); resetSelect(sc, 'Todos'); sc.disabled = !code;
    resetSelect($('fPar'), 'Todas'); $('fPar').disabled = true;
    if (code) GEO.can.features.filter((f) => f.properties.DPA_PROVIN === code)
      .map((f) => [f.properties.DPA_CANTON, f.properties.DPA_DESCAN]).sort(byName).forEach(([c, n]) => opt(sc, c, n));
    update(zoom);
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
    Object.assign(state, { serv: '', mod: '', am: '' });
    $('fServ').value = ''; fillMod(); $('fAm').value = ''; syncCats();
    setProv('', true);
  }

  // ---------------- filtrado ----------------
  function filtered(ignoreTerritory) {
    return UA.filter((u) =>
      (ignoreTerritory || ((!state.prov || u.prov === state.prov) && (!state.can || u.can === state.can) && (!state.par || u.par === state.par))) &&
      (state.serv === '' || u.serv === +state.serv) && (state.mod === '' || u.mod === +state.mod) &&
      (!state.am || state.cats.includes(u[state.am])));
  }
  const exposed = (u, k) => (k === 'multi' ? u.multi === 1 : u[k] > 0);

  // nivel de agregación del mapa
  function level() {
    if (state.can) return { key: 'par', geo: GEO.par, code: 'DPA_PARROQ', name: 'DPA_DESPAR', parent: (f) => f.properties.DPA_CANTON === state.can, label: 'parroquia' };
    if (state.prov) return { key: 'can', geo: GEO.can, code: 'DPA_CANTON', name: 'DPA_DESCAN', parent: (f) => f.properties.DPA_PROVIN === state.prov, label: 'cantón' };
    return { key: 'prov', geo: GEO.prov, code: 'DPA_PROVIN', name: 'DPA_DESPRO', parent: () => true, label: 'provincia' };
  }

  // sin filtro territorial fino: agregamos al nivel mostrado
  function aggregate(lv, rows) {
    const agg = {};
    rows.forEach((u) => {
      const k = u[lv.key]; const a = agg[k] || (agg[k] = { tot: 0, exp: 0 });
      a.tot++; if (exposed(u, state.layer)) a.exp++;
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
    return br; // límites superiores de cada clase
  }

  // ---------------- actualización ----------------
  function update(zoom) {
    if (!GEO.prov) return;
    const lv = level();
    if (lv.key === 'par' && !GEO.par) { loadParroquias().then(() => update(zoom)); return; }
    const rowsTerr = filtered(true).filter((u) => (!state.prov || u.prov === state.prov) && (!state.can || u.can === state.can));
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
        return { color: sel ? '#FFC701' : '#2b2b3a', weight: sel ? 3.5 : 0.8, fillOpacity: col ? 0.85 : 0.35,
          fillColor: col || '#d9dce4', dashArray: col ? null : '3' };
      },
      onEachFeature: (f, layer) => {
        const code = f.properties[lv.code], a = agg[code] || { tot: 0, exp: 0 };
        layer.bindTooltip(`<div class="tt-t">${f.properties[lv.name]}</div>` +
          (a.tot ? `UA: <b>${fmt(a.tot)}</b><br>Expuestas a ${HAZ[state.layer].short.toLowerCase()}: <b>${fmt(a.exp)}</b> (${fpct(pct(a.exp, a.tot))})` : 'Sin UA con los filtros actuales'),
          { sticky: true, className: 'tt' });
        layer.on({
          mouseover: (e) => e.target.setStyle({ weight: 2.5, color: '#2D2D93' }),
          mouseout: (e) => geoLayer.resetStyle(e.target),
          click: () => drill(lv.key, code),
        });
      },
    }).addTo(map);
    if (zoom) {
      const b = geoLayer.getBounds();
      if (b.isValid()) map.fitBounds(lv.key === 'prov' ? L.latLngBounds([[-5.1, -81.2], [1.5, -75.2]]) : b, { padding: [20, 20] });
    }
    renderLegend(br, colors, lv);
    renderChip(lv);
    renderCrumb();
    renderStats();
    renderTop(lv, agg, feats);
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
    $('legend').innerHTML = `<h4>${HAZ[state.layer].name}<br><span style="font-weight:500;color:#5a6072">${unit} expuestas por ${lv.label}</span></h4>` +
      `<div class="row"><span class="sw" style="background:#fff"></span>Sin UA expuestas</div>${rows}` +
      `<div class="row"><span class="sw none"></span>Sin UA registradas</div>`;
  }

  function filterText() {
    const t = [];
    if (state.prov) t.push(NAMES.prov[state.prov]);
    if (state.can) t.push(NAMES.can[state.can]);
    if (state.par) t.push(NAMES.par[state.par]);
    if (state.serv !== '') t.push(titleCase(DATA.dict.serv[+state.serv]));
    if (state.mod !== '') t.push(titleCase(DATA.dict.mod[+state.mod]));
    if (state.am) t.push(HAZ[state.am].short + ': ' + state.cats.map((c) => CAT[c]).join(', '));
    return t;
  }
  function renderChip(lv) {
    const t = filterText();
    $('mapChip').innerHTML = `${HAZ[state.layer].name} · por ${lv.label}<small>${t.length ? t.join(' · ') : 'Nivel nacional · sin filtros'}</small>`;
  }
  function renderCrumb() {
    const c = $('crumb'); c.innerHTML = '';
    const add = (txt, fn) => { const b = document.createElement('button'); b.textContent = txt; b.onclick = fn; c.appendChild(b); };
    add('Ecuador', () => setProv('', true));
    if (state.prov) { c.insertAdjacentHTML('beforeend', '<span>›</span>'); add(NAMES.prov[state.prov], () => setProv(state.prov, true)); }
    if (state.can) { c.insertAdjacentHTML('beforeend', '<span>›</span>'); add(NAMES.can[state.can], () => setCan(state.can, true)); }
  }

  function renderStats() {
    const rows = filtered(false);
    const expAny = rows.filter((u) => HAZ4.some((k) => u[k] > 0)).length;
    $('kUA').textContent = fmt(rows.length);
    $('kExp').textContent = fmt(expAny);
    $('kUsr').textContent = fmt(rows.reduce((s, u) => s + u.usuarios, 0));
    const n = rows.length;
    $('stats').innerHTML = HAZ4.map((k) => {
      const h = HAZ[k], cnt = [0, 0, 0, 0];
      rows.forEach((u) => cnt[u[k]]++);
      const exp = n - cnt[0];
      const cats = h.max === 3 ? [1, 2, 3] : [1, 2];
      const bars = cats.map((c) => bar(CAT[c], cnt[c], n, h.colors[c - 1 + (h.max === 2 ? 1 : 0)]))
        .concat(bar('No exp.', cnt[0], n, '#c9ccd6')).join('');
      return `<div class="hz"><div class="hz-h"><span>${h.name}</span><span>${fmt(exp)} UA · ${fpct(pct(exp, n))}</span></div>${bars}</div>`;
    }).join('') || '<div class="empty">Sin datos</div>';
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

  // ---------------- exportación Excel ----------------
  function exportExcel() {
    const rows = filtered(false), n = rows.length, lv = level();
    const wb = XLSX.utils.book_new();
    const now = new Date();

    // 1. Filtros y totales
    const f = [
      ['Reporte de Unidades de Atención expuestas a amenazas asociadas al Evento El Niño'],
      ['Ministerio de Trabajo y Desarrollo Humano · Dirección de Gestión de Información y Datos'],
      [],
      ['Corte de la información', DATA.corte],
      ['Fecha de descarga', now.toLocaleString('es-EC')],
      [],
      ['FILTROS APLICADOS'],
      ['Provincia', state.prov ? NAMES.prov[state.prov] : 'Todas'],
      ['Cantón', state.can ? NAMES.can[state.can] : 'Todos'],
      ['Parroquia', state.par ? NAMES.par[state.par] : 'Todas'],
      ['Servicio', state.serv !== '' ? DATA.dict.serv[+state.serv] : 'Todos'],
      ['Modalidad', state.mod !== '' ? DATA.dict.mod[+state.mod] : 'Todas'],
      ['Amenaza', state.am ? HAZ[state.am].name + ' (' + state.cats.map((c) => CAT[c]).join(', ') + ')' : 'Sin filtro'],
      [],
      ['TOTALES'],
      ['Unidades de Atención', n],
      ['UA expuestas al menos a una amenaza', rows.filter((u) => HAZ4.some((k) => u[k] > 0)).length],
      ['UA expuestas a inundaciones o movimientos en masa', rows.filter((u) => u.multi).length],
      ['Usuarios atendidos', rows.reduce((s, u) => s + u.usuarios, 0)],
      [],
      ['Nota: se consideran las categorías de susceptibilidad media, alta y muy alta.'],
    ];
    const ws1 = XLSX.utils.aoa_to_sheet(f); ws1['!cols'] = [{ wch: 50 }, { wch: 60 }];
    XLSX.utils.book_append_sheet(wb, ws1, 'Filtros');

    // 2. Resumen por amenaza y categoría
    const r2 = [['Amenaza', 'Categoría', 'N.º UA', '% UA', 'Usuarios']];
    HAZ4.forEach((k) => {
      const cats = HAZ[k].max === 3 ? [1, 2, 3] : [1, 2];
      cats.concat([0]).forEach((c) => {
        const sub = rows.filter((u) => u[k] === c);
        r2.push([HAZ[k].name, CAT[c], sub.length, +pct(sub.length, n).toFixed(2), sub.reduce((s, u) => s + u.usuarios, 0)]);
      });
      const e = rows.filter((u) => u[k] > 0);
      r2.push([HAZ[k].name, 'Total expuestas', e.length, +pct(e.length, n).toFixed(2), e.reduce((s, u) => s + u.usuarios, 0)]);
    });
    const ws2 = XLSX.utils.aoa_to_sheet(r2); ws2['!cols'] = [{ wch: 26 }, { wch: 16 }, { wch: 10 }, { wch: 10 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, ws2, 'Resumen amenazas');

    // 3. Por territorio (nivel del mapa)
    const nm = { prov: 'Provincia', can: 'Cantón', par: 'Parroquia' }[lv.key];
    const h3 = ['Código', nm, 'Total UA'];
    HAZ4.forEach((k) => { const cats = HAZ[k].max === 3 ? [1, 2, 3] : [1, 2]; cats.forEach((c) => h3.push(`${HAZ[k].short} ${CAT[c]}`)); h3.push(`${HAZ[k].short} total`, `${HAZ[k].short} %`); });
    h3.push('Multiamenaza (inund. o MM)', 'Multiamenaza %', 'Usuarios');
    const byT = {};
    rows.forEach((u) => (byT[u[lv.key]] = byT[u[lv.key]] || []).push(u));
    const r3 = [h3];
    Object.keys(byT).sort().forEach((code) => {
      const g = byT[code], t = g.length;
      const nameT = (lv.key === 'prov' ? NAMES.prov : lv.key === 'can' ? NAMES.can : NAMES.par)[code] || code;
      const row = [code, nameT, t];
      HAZ4.forEach((k) => { const cats = HAZ[k].max === 3 ? [1, 2, 3] : [1, 2]; cats.forEach((c) => row.push(g.filter((u) => u[k] === c).length));
        const e = g.filter((u) => u[k] > 0).length; row.push(e, +pct(e, t).toFixed(2)); });
      const m = g.filter((u) => u.multi).length; row.push(m, +pct(m, t).toFixed(2), g.reduce((s, u) => s + u.usuarios, 0));
      r3.push(row);
    });
    const ws3 = XLSX.utils.aoa_to_sheet(r3); ws3['!cols'] = h3.map((_, i) => ({ wch: i === 1 ? 28 : 12 }));
    XLSX.utils.book_append_sheet(wb, ws3, 'Por ' + nm.toLowerCase());

    // 4. Detalle de UA
    const r4 = [['Código UA', 'Nombre', 'Servicio', 'Modalidad', 'Provincia', 'Cantón', 'Parroquia', 'Unidad desconcentrada', 'Región', 'Área', 'Tipo de administración', 'Usuarios', 'Usuarios en extrema pobreza (RS 2025)', 'Usuarios en pobreza (RS 2025)', 'Susc. inundaciones', 'Susc. movimientos en masa', 'Susc. sequía', 'Susc. incendios forestales', 'Multiamenaza (inund. o MM)']];
    const D = DATA.dict;
    rows.forEach((u) => r4.push([u.codigo, u.nombre, D.serv[u.serv], D.mod[u.mod], NAMES.prov[u.prov], NAMES.can[u.can], u.parNombre, D.ud[u.ud], D.reg[u.reg], D.area[u.area], D.adm[u.adm],
      u.usuarios, u.extPob, u.pob, CAT[u.inund], CAT[u.mm], CAT[u.seq], CAT[u.inc], u.multi ? 'Sí' : 'No']));
    const ws4 = XLSX.utils.aoa_to_sheet(r4);
    ws4['!cols'] = [10, 38, 30, 34, 16, 18, 22, 40, 10, 9, 24, 9, 12, 12, 14, 14, 12, 14, 12].map((w) => ({ wch: w }));
    ws4['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: r4.length - 1, c: r4[0].length - 1 } }) };
    XLSX.utils.book_append_sheet(wb, ws4, 'Detalle UA');

    const tag = [state.prov && NAMES.prov[state.prov], state.can && NAMES.can[state.can]].filter(Boolean).join('_').replace(/\s+/g, '_') || 'Nacional';
    XLSX.writeFile(wb, `Reporte_UA_Amenazas_${tag}_${now.toISOString().slice(0, 10)}.xlsx`);
  }

  function titleCase(s) {
    const low = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'e', 'en', 'para', 'con', 'a']);
    return String(s).toLowerCase().split(' ').map((w, i) => (i && low.has(w) ? w : w.replace(/^\p{L}/u, (c) => c.toUpperCase()))).join(' ')
      .replace(/\b(Cnh|Cdi|Pej|Osc|Gad)\b/g, (m) => m.toUpperCase());
  }
})();
