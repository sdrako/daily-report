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

    window.__photoPopupTidy = function (imgEl, ok) {
      const item = imgEl?.closest?.('.photo-item');
      const src = imgEl?.currentSrc || imgEl?.src || "(no src)";
      console.log(`[PHOTO] ${ok ? "OK" : "FAIL"}:`, src);
  
      if (!item) return;
  
      if (ok) {
        item.classList.add('is-ok'); 
      } else {
        item.remove();           
      }
  
      const photos = imgEl.closest('.photos');
      if (!photos) return;
  
      // Only hide container if it truly has no remaining blocks
      if (photos.querySelectorAll('.photo-item').length === 0) {
        photos.style.display = 'none';
      }
    };
  
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
    if (!Number.isFinite(n)) return { A: "", X: "", B: "", C: ""};
    return {
      A: `photos/${n}/A${n}.jpg`,
      X: `photos/${n}/X${n}.jpg`,
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
      <div class="photo-item">
        <div class="muted">${safeLabel}</div>
        <a href="${safePath}" target="_blank" rel="noopener">Open full size</a>
        <img 
          src="${safePath}"
          alt="${safeLabel}"
          loading="eager"
          decoding = "async" 
          onload="window.__photoPopupTidy(this, true)"
          onerror="window.__photoPopupTidy(this, false)"
        />
      </div>
    `;
  }
  
  function pointPopupHtml(props) {
    const completed = !!props.completed;
    const badge = completed
      ? '<span class="pill ok">Ολοκληρωμένο</span>'
      : '<span class="pill no">Σε εξέλιξη</span>';

    // Build candidate URLs (A/B/C/X). We’ll verify which exist on popupopen.
    const id = props.id ?? '';
    const pp = buildPhotoPathsFromId(id);

    const candidates = [
      { key: 'A', label: 'A (ΠΡΙΝ)', url: pp.A },
      { key: 'X', label: 'X (ΑΥΛΑΚΙ)', url: pp.X },
      { key: 'B', label: 'B (ΚΑΤΑ ΤΗ ΔΙΑΡΚΕΙΑ)', url: pp.B },
      { key: 'C', label: 'C (ΑΠΟΚΑΤΑΣΤΑΣΗ)', url: pp.C }
      
    ];

    // Store candidates in a data attribute so popupopen can initialize the viewer.
    const data = encodeURIComponent(JSON.stringify(candidates));

    return `
      <div class="popup-title popup-title--point">
        Σημείο ${escapeHtml(id)} m ${badge}
      </div>

      <div class="photo-viewer" data-photos="${data}" hidden>
        <div class="frame">
          <button class="nav prev" type="button" aria-label="Previous photo">‹</button>
          <button class="nav next" type="button" aria-label="Next photo">›</button>
          <img class="viewer-img" alt="" decoding="async" loading="eager">
        </div>
        <div class="meta">
          <div class="viewer-label"></div>
          <a class="viewer-open" href="#" target="_blank" rel="noopener">Open full size</a>
        </div>
      </div>
    `;
  }

  function resolveUrl(u) {
    const clean = (u || '').trim();
    if (!clean) return '';
    return new URL(clean, document.baseURI).toString();
  }

  function probeImage(url) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
      img.decoding = "async";
      img.loading = "eager";
      img.src = url;
    });
  }

  function renderViewer(root, state) {
    const viewer = root.querySelector('.photo-viewer');
    if (!viewer) return;

    const img = viewer.querySelector('.viewer-img');
    const labelEl = viewer.querySelector('.viewer-label');
    const openEl = viewer.querySelector('.viewer-open');
    const prevBtn = viewer.querySelector('.prev');
    const nextBtn = viewer.querySelector('.next');

    const n = state.photos.length;
    const i = state.index;

    const cur = state.photos[i];
    img.src = cur.url;
    img.alt = cur.label;
    labelEl.textContent = `${cur.label} (${i + 1}/${n})`;
    openEl.href = cur.url;

    const multi = n > 1;
    prevBtn.disabled = !multi;
    nextBtn.disabled = !multi;
    prevBtn.style.display = multi ? '' : 'none';
    nextBtn.style.display = multi ? '' : 'none';
  }

  map.on('popupopen', async (e) => {
    const root = e.popup?.getElement?.();
    if (!root) return;

    const viewer = root.querySelector('.photo-viewer');
    if (!viewer) return;

    // Prevent re-init if Leaflet reuses DOM
    if (viewer.__inited) return;
    viewer.__inited = true;

    let candidates = [];
    try {
      candidates = JSON.parse(decodeURIComponent(viewer.getAttribute('data-photos') || '[]'));
    } catch { candidates = []; }

    // Resolve + filter empty
    candidates = candidates
      .map(p => ({ ...p, url: resolveUrl(p.url) }))
      .filter(p => p.url);

    // Probe which exist
    const ok = [];
    for (const c of candidates) {
      // eslint-disable-next-line no-await-in-loop
      const exists = await probeImage(c.url);
      if (exists) ok.push(c);
    }

    // If none exist, keep viewer hidden
    if (ok.length === 0) return;

    // Store state on the viewer
    viewer.__state = { photos: ok, index: 0 };
    viewer.hidden = false;

    renderViewer(root, viewer.__state);

    // Wire buttons (scoped to this popup DOM)
    viewer.addEventListener('click', (ev) => {
      const st = viewer.__state;
      if (!st || st.photos.length <= 1) return;

      if (ev.target.closest('.prev')) {
        st.index = (st.index - 1 + st.photos.length) % st.photos.length;
        renderViewer(root, st);
      } else if (ev.target.closest('.next')) {
        st.index = (st.index + 1) % st.photos.length;
        renderViewer(root, st);
      }
    });
  });

  function googleMapsPinUrl(lat, lon) {
    // "query" opens a red pin at the coordinates in Google Maps
    const q = `${lat},${lon}`;
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
  }

  function midLatLngOfLine(layer) {
    const latlngs = layer.getLatLngs();
    const pts = Array.isArray(latlngs[0]) ? latlngs.flat() : latlngs;
    if (!pts || pts.length === 0) return null;
    return pts[Math.floor(pts.length / 2)];
  }

  function axisLabelForZoom(p, z) {
    const code = (p.code ?? "").toString().trim();
    const len  = (p.length ?? "").toString().trim();

    if (!code) return "";             // nothing to show
    if (z < 18) return "";            // hide
    if (z < 19) return code;          // code only
    return `${code} | ${len} m`;      // full
  }

  function perpendicularOffsetPx(map, layer, px = 14, side = 1) {
    if (!map) return [0, 0];

    const latlngs = layer.getLatLngs();
    const pts = Array.isArray(latlngs[0]) ? latlngs.flat() : latlngs;
    if (!pts || pts.length < 2) return [0, 0];

    // use direction near the middle
    const i = Math.floor(pts.length / 2);
    const p1 = pts[i - 1] || pts[i];
    const p2 = pts[i + 1] || pts[i];

    const a = map.latLngToLayerPoint(p1);
    const b = map.latLngToLayerPoint(p2);

    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;

    // perpendicular unit vector
    const nx = -dy / len;
    const ny = dx / len;

    return [nx * px * side, ny * px * side];
  }

  function stableSideFromFeature(feature) {
    const s = String(feature?.properties?.code ?? feature?.properties?.id ?? "");
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return h % 2 === 0 ? 1 : -1;   // +1 or -1
  }

  function updateAxisTooltip(layer, map) {
    if (!map || !map._loaded) return; // <-- prevents "Set map center and zoom first."

    const p = layer?.feature?.properties ?? {};
    const z = map.getZoom();

    const label = axisLabelForZoom(p, z);
    const mid = layer.__axisMid ?? (layer.__axisMid = midLatLngOfLine(layer));
    if (!mid) return;

    if (!label) {
      layer.closeTooltip();
      return;
    }

    const side = layer.__labelSide ?? (layer.__labelSide = stableSideFromFeature(layer.feature));
    const px = z >= 18 ? 18 : 14;
    const offset = perpendicularOffsetPx(map, layer, px, side);

    if (!layer.getTooltip()) {
      layer.bindTooltip(label, {
        permanent: true,
        direction: "center",
        offset,
        className: "axis-label",
        opacity: 1
      });
    } else {
      layer.setTooltipContent(label);
      layer.getTooltip().options.offset = offset;
    }

    layer.openTooltip(mid);
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

    layer.__axisMid = midLatLngOfLine(layer);
    layer.__labelSide = stableSideFromFeature(feature);

    // Delay initial render so geometry is fully attached to map panes
    setTimeout(() => updateAxisTooltip(layer, map), 0);

    const p = feature?.properties ?? {};

    // Initial tooltip render based on current zoom
    updateAxisTooltip(layer, map);

    // --- click popup (unchanged) ---
    const rows = [];
    rows.push(["ΕΚΤΔ", p.code]);
    rows.push(["ΜΗΚΟΣ", (p.length ?? "") + " m"]);
    rows.push(["ΒΑΘΟΣ", (p.depth ?? "") + " m"]);
    if (p["3x150 XLPE"] != null) rows.push(["3x150 XLPE", p["3x150 XLPE"]]);
    if (p["3x240 XLPE"] != null) rows.push(["3x240 XLPE", p["3x240 XLPE"]]);
    if (p["Φ160"] != null) rows.push(["Φ160", p["Φ160"]]);

    const html =
      `<div style="font-family:system-ui,Segoe UI,Roboto,Arial; font-size:13px;">` +
      `<div style="font-weight:800; margin-bottom:6px;">Πληροφορίες Τμήματος</div>` +
      `<table style="border-collapse:collapse;">` +
      rows.map(([k, v]) =>
        `<tr>` +
          `<td style="padding:2px 10px 2px 0; color:#6b7280; white-space:nowrap;">${k}</td>` +
          `<td style="padding:2px 0; font-weight:700;">${v ?? ""}</td>` +
        `</tr>`
      ).join("") +
      `</table>` +
      `</div>`;

    layer.bindPopup(html, { closeButton: true });
  }
}).addTo(map);

// Update labels whenever zoom changes
map.on("zoomend", () => {
  axisLayer.eachLayer((layer) => updateAxisTooltip(layer, map));
});

  const pointsIndex = new Map(); // key: id and chainage_m -> leaflet layer

 const pointsLayer = L.geoJSON(POINTS_GEOJSON, {
  pointToLayer: (feature, latlng) => {
    const props = feature.properties || {};
    const completed = !!props.completed;

    const text = String(props.id ?? ""); // expected 100, 200, 300, ...

    const icon = L.divIcon({
      className: "",
      html: `<div class="chainage-icon">${escapeHtml(text)}</div>`
    });

    return L.marker(latlng, { icon })
      .bindTooltip(completed ? "Ολοκληρωμένο" : "Σε εξέλιξη");
  },

  onEachFeature: (feature, layer) => {
    const props = feature.properties || {};

    const pp = buildPhotoPathsFromId(props.id);
    if (!props.photo_A) props.photo_A = pp.A;
    if (!props.photo_B) props.photo_B = pp.B;
    if (!props.photo_C) props.photo_C = pp.C;
    if (!props.photo_X) props.photo_X = pp.X;

    layer.bindPopup(pointPopupHtml(props), {
      maxWidth: 360,
      autoPan: true,
      keepInView: true,
      autoPanPadding: [20, 20],
      className: "point-photo-popup"
    });

    layer.on("click", () => {
      const ll = layer.getLatLng();
      map.panTo(ll, { animate: true });
    });
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
    }).bindTooltip(done ? 'Διάβαση (ολοκληρωμένη)' : 'Διάβαση (εκκρεμής)');
  },
  onEachFeature: (feature, layer) => {
  const p = feature.properties || {};

  const chV2 = p.dist_from_start_v2;
  const chInt = chainageIntFromV2(chV2);
  const crossingPhoto = buildCrossingPhotoPathFromV2(chV2);

  const html = `
    <div class="popup-title">Διάβαση ${escapeHtml(p.fid ?? '')}
      ${p.completion ? '<span class="pill ok">ολοκληρωμένη</span>' : '<span class="pill no">εκκρεμής</span>'}
    </div>

    <div class="muted">
      Μήκος: <b>${escapeHtml(fmtNum(p.length, 1))} m</b><br/>
      Βάθος: <b>${escapeHtml(fmtNum(p.depth, 1))} m</b><br/>
      Σωλήνες: <b>${escapeHtml(p.pipes ?? '')}</b><br/>
      Θέση: <b>${escapeHtml(fmtNum(chV2, 1))} m</b><br/>
    </div>

    <div class="photos">
      ${photoBlock('Φωτογραφία Διάβασης', crossingPhoto)}
    </div>
  `;

  layer.bindPopup(html, { maxWidth: 360 });

  layer.on('click', () => {
      const ll = layer.getLatLng();
      map.panTo(ll, { animate: true });
    });  

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
  },

  onEachFeature: (feature, layer) => {
    const latlng = layer.getLatLng();

    const id = feature?.properties?.marking_id ?? "";
    const lat = latlng.lat.toFixed(6);
    const lng = latlng.lng.toFixed(6);

    const url = googleMapsPinUrl(lat, lng);

    const html = `
      <div style="font-family:system-ui,Segoe UI,Roboto,Arial; font-size:13px;">
        <div style="font-weight:800; margin-bottom:6px;">
          ΣΗΜΑΝΣΗ ${escapeHtml(id)}
        </div>
        <div>Lat: <b>${lat}</b></div>
        <div>Lon: <b>${lng}</b></div>
        <a href="${url}" target="_blank" rel="noopener noreferrer"
          style="display:inline-block; margin-top:10px;padding:8px 8px;border-radius:10px;background:#111827;color:#fff;text-decoration:none;font-weight:700">
          Άνοιγμα στο Google Maps
        </a>
      </div>
    `;

    layer.bindPopup(html, {
      autoPan: true,
      keepInView: true
    });
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
