/* global L, PLANS_GEOJSON, POINTS_GEOJSON, CROSSINGS_GEOJSON, MARKINGS_GEOJSON, CROSSEND_GEOJSON, AXIS_GEOJSON  */

(function () {
  const map = L.map('map', { preferCanvas: true });

  const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 20,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);

  function escapeHtml(s) {
    return String(s ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function fmtNum(x, decimals = 1) {
  const n = Number(x);
  if (!Number.isFinite(n)) return '';
  return n.toFixed(decimals);
  }

  function chainageIntFromV2(v2) {
  const n = Number(v2);
  if (!Number.isFinite(n)) return null;
  return Math.floor(n);
  }

  function buildCrossingPhotoPathFromV2(v2) {
  const chInt = chainageIntFromV2(v2);
  if (chInt == null) return "";
  return `photos/crossings/${chInt}.jpg`;
  }

  function buildPhotoPathsFromId(id) {
    const n = Number(id);
    if (!Number.isFinite(n)) return { A: "", B: "", C: "" };
    return {
      A: `photos/${n}/A${n}.jpg`,
      B: `photos/${n}/B${n}.jpg`,
      C: `photos/${n}/C${n}.jpg`
      };
  }

  function photoBlock(label, path) {
    const clean = (path || '').trim();
    if (!clean) return '';
    const safePath = escapeHtml(clean);
    const safeLabel = escapeHtml(label);
    return `
      <div>
        <div class="muted">${safeLabel}</div>
        <a href="${safePath}" target="_blank" rel="noopener">Open full size</a>
        <img src="${safePath}" alt="${safeLabel}" loading="lazy" />
      </div>
    `;
  }

  function pointPopupHtml(props) {
    const completed = !!props.completed;
    const badge = completed
      ? '<span class="pill ok">completed</span>'
      : '<span class="pill no">not completed</span>';

    return `
      <div class="popup-title">Point ${escapeHtml(props.id ?? '')} ${badge}</div>
      <div class="muted">
        Chainage: <b>${escapeHtml(props.chainage_m ?? '')} m</b><br/>
        Type: <b>${escapeHtml(props.type ?? '')}</b><br/>
        Note: ${escapeHtml(props.note ?? '')}
      </div>
      <div class="photos">
        ${photoBlock('A (Before)', props.photo_A)}
        ${photoBlock('B (Cables visible)', props.photo_B)}
        ${photoBlock('C (Restored)', props.photo_C)}
      </div>
    `;
  }

function midLatLngOfLine(layer) {
  const latlngs = layer.getLatLngs();
  const pts = Array.isArray(latlngs[0]) ? latlngs.flat() : latlngs;
  if (!pts || pts.length === 0) return null;
  return pts[Math.floor(pts.length / 2)];
}

const axisLayer = L.geoJSON(AXIS_GEOJSON, {
  style: (f) => {
    const code = f?.properties?.code;
    return {
      weight: 10,
      opacity: 0.9,
      color: code === "U2B1" ? "#4078f0ff" : "#241f19ff"
    };
  },

  onEachFeature: (feature, layer) => {
    const p = feature?.properties ?? {};
    const label = `${p.code ?? ""} | ${p.length ?? ""} m`;

    const mid = midLatLngOfLine(layer);
    if (!mid) return;

    layer.bindTooltip(label, {
      permanent: true,
      direction: "center",
      offset: [0, -15],     // ⬅ vertical offset from axis
      className: "axis-label",
      opacity: 1
    }).openTooltip(mid);

    // --- click popup ---
    const rows = [];

    // always show these
    rows.push(["ΕΚΤΔ", p.code]);
    rows.push(["ΜΗΚΟΣ", (p.length ?? "") + " m"]);
    rows.push(["ΒΑΘΟΣ", (p.depth ?? "") + " m"]);

    // show only when not null / not empty
    if (p["3x150 XLPE"] != null) rows.push(["3x150 XLPE", p["3x150 XLPE"]]);
    if (p["3x240 XLPE"] != null) rows.push(["3x240 XLPE", p["3x240 XLPE"]]);
    if (p["Φ160"] != null) rows.push(["Φ160", p["Φ160"]]);

    const html =
      `<div style="font-family:system-ui,Segoe UI,Roboto,Arial; font-size:13px;">` +
      `<div style="font-weight:800; margin-bottom:6px;">Πληροφορίες Τμήματος</div>` +
      `<table style="border-collapse:collapse;">` +
      rows
        .map(([k, v]) =>
          `<tr>` +
          `<td style="padding:2px 10px 2px 0; color:#6b7280; white-space:nowrap;">${k}</td>` +
          `<td style="padding:2px 0; font-weight:700;">${v ?? ""}</td>` +
          `</tr>`
        )
        .join("") +
      `</table>` +
      `</div>`;

    layer.bindPopup(html, { closeButton: true });
  }

}).addTo(map);

  const pointsIndex = new Map(); // key: id and chainage_m -> leaflet layer


  const pointsLayer = L.geoJSON(POINTS_GEOJSON, {
    pointToLayer: (feature, latlng) => {
      const completed = !!feature.properties?.completed;
      return L.circleMarker(latlng, {
        radius: 7,
        color: "#c00000",        // stroke (red)
        fillColor: "#e00000",    // fill (red)
        weight: 2,
        fillOpacity: 0.7
      }).bindTooltip(completed ? 'Completed' : 'In progress');
    },
    onEachFeature: (feature, layer) => {
    const props = feature.properties || {};

    // 🔹 OPTION A: auto-generate photo paths from id
    if (!props.photo_A && !props.photo_B && !props.photo_C) {
      const pp = buildPhotoPathsFromId(props.id);
      props.photo_A = pp.A;
      props.photo_B = pp.B;
      props.photo_C = pp.C;
    }

    layer.bindPopup(pointPopupHtml(props), { maxWidth: 360 });
    }
  }).addTo(map);

const crossingsLayer = L.geoJSON(CROSSINGS_GEOJSON, {
  pointToLayer: (feature, latlng) => {
    const done = !!feature.properties?.completion;
    return L.circleMarker(latlng, {
      radius: 6,
      weight: 2,
      fillOpacity: 0.75,
      // no explicit colors (keeps it neutral); differentiate by radius/tooltip/popup
    }).bindTooltip(done ? 'Crossing (completed)' : 'Crossing (pending)');
  },
  onEachFeature: (feature, layer) => {
  const p = feature.properties || {};

  const chV2 = p.dist_from_start_v2;
  const chInt = chainageIntFromV2(chV2);
  const crossingPhoto = buildCrossingPhotoPathFromV2(chV2);

  const html = `
    <div class="popup-title">Crossing ${escapeHtml(p.fid ?? '')}
      ${p.completion ? '<span class="pill ok">completed</span>' : '<span class="pill no">pending</span>'}
    </div>

    <div class="muted">
      Length: <b>${escapeHtml(fmtNum(p.length, 1))} m</b><br/>
      Depth: <b>${escapeHtml(fmtNum(p.depth, 1))} m</b><br/>
      Pipes: <b>${escapeHtml(p.pipes ?? '')}</b><br/>
      Chainage (v2): <b>${escapeHtml(fmtNum(chV2, 1))} m</b><br/>
    </div>

    <div class="photos">
      ${photoBlock('Crossing photo', crossingPhoto)}
    </div>
  `;

  layer.bindPopup(html, { maxWidth: 360 });
  }
  }).addTo(map);


const markingsLayer = L.geoJSON(MARKINGS_GEOJSON, {
  pointToLayer: (feature, latlng) => {
    const id = feature?.properties?.marking_id ?? "";

    const icon = L.divIcon({
      className: "marking-icon",
      html: `<span class="marking-text">${String(id)}</span>`
    });

    return L.marker(latlng, { icon });
  }
}).addTo(map);


const crossEndLayer = L.geoJSON(CROSSEND_GEOJSON, {
  pointToLayer: (feature, latlng) => {
    return L.circleMarker(latlng, {
      radius: 3,
      weight: 2,
      fillOpacity: 0.75,
    });
  },
}).addTo(map);


  const overlayMaps = {
    'Photo Points': pointsLayer,
    'Διαβάσεις': crossingsLayer,
    'Σημάνσεις': markingsLayer
  };  


  L.control.layers({ 'OpenStreetMap': osm }, overlayMaps, { collapsed: false }).addTo(map);

  // Fit map
  try {
    const b = pointsLayer.getBounds();
    if (b.isValid()) map.fitBounds(b.pad(0.15));
    else map.setView([38.1906, 20.4801], 16);
  } catch {
    map.setView([38.1906, 20.4801], 16);
  }

  // KPIs
  const total = (POINTS_GEOJSON?.features || []).length;
  const completed = (POINTS_GEOJSON?.features || []).filter(f => !!f.properties?.completed).length;
  document.getElementById('kpiPoints').textContent = String(total);
  document.getElementById('kpiCompleted').textContent = String(completed);

  // Search
  function findAndZoom() {
    const q = (document.getElementById('searchBox').value || '').trim();
    if (!q) return;
    const layer = pointsIndex.get(q);
    if (!layer) {
      alert('Not found. Try a different id/chainage.');
      return;
    }
    const latlng = layer.getLatLng ? layer.getLatLng() : null;
    if (latlng) map.setView(latlng, Math.max(map.getZoom(), 18));
    layer.openPopup();
  }

  document.getElementById('btnFind').addEventListener('click', findAndZoom);
  document.getElementById('searchBox').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') findAndZoom();
  });
})();
