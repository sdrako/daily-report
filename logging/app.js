/* Program structure:
   - State (records, selected)
   - Router (Browse/View/Edit)
   - UI actions (New/View/Edit/Delete/Save/Export)
   - Offline banner & write-action disabling
*/

(() => {
  // =========================
  // CONFIG
  // =========================
  // Later: set APPS_SCRIPT_URL to your deployed web app URL.
  const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyJqkdvF7v4Vw5kdxmvTHyo4GMgwOwfrWm1p2d-ZrugHw-KxqNiV4keCgT6ZEocJiW1/exec";
  const API_KEY = "AXON-TECHNIC_MEASURE-LOGGER-APP-KEY";

  // Column headers must match your Google Sheet headers EXACTLY.
  // You can reorder freely; browse uses only 3 fields + View button.
  const FIELDS = [
    { key: "ΧΘ-1", type: "text", required: true, lockAfterCreate: true },
    { key: "ΧΘ-2", type: "text", required: true, lockAfterCreate: true },
    { key: "ΜΗΚΟΣ", type: "number" },
    { key: "ΠΛΑΤΟΣ", type: "number" },
    { key: "ΒΑΘΟΣ", type: "number" },
    { key: "ΕΤΚΔ", type: "text" },
    { key: "ΠΛΕΓΜΑ ΣΗΜΑΝΣΗΣ", type: "number" },
    { key: "ΒΑΘΟΣ ΤΟΠΟΘΕΤΗΣΗΣ 3A", type: "number" },
    { key: "XLPE 3X150 (XT)", type: "number" },
    { key: "XLPE 3X240 (MT)", type: "number" },
    { key: "ΣΩΛΗΝΕΣ Φ160", type: "number" },
    { key: "ΠΛΑΤΟΣ ΠΛΕΓΜΑΤΟΣ Τ-139", type: "number" },
    { key: "ΠΛΑΤΟΣ ΥΠΟΣΤΡΩΜΑΤΟΣ", type: "number" },
    { key: "ΒΑΘΟΣ ΥΠΟΣΤΡΩΜΑΤΟΣ", type: "number" },
    { key: "ΠΛΑΤΟΣ ΑΣΦΑΛΤΟΥ", type: "number" },
    { key: "ΒΑΘΟΣ ΑΣΦΑΛΤΟΥ", type: "number" },
    { key: "ΠΑΡΑΤΗΡΗΣΕΙΣ", type: "textarea" }
  ];

  const BROWSE_COLS = ["ΧΘ-1", "ΧΘ-2", "ΕΤΚΔ"];

  // =========================
  // STATE
  // =========================
  const state = {
    isOnline: navigator.onLine,
    screen: "browse", // browse | view | edit
    records: [],
    selectedKey: null, // { ch1, ch2 }
    selectedRecord: null, // object of all fields
    editMode: "edit", // edit | create
    isListLoading: false,
  };
  

  // =========================
  // DOM
  // =========================
  const el = {
    offlineBanner: document.getElementById("offlineBanner"),
    btnRefresh: document.getElementById("btnRefresh"),
    btnExportPdf: document.getElementById("btnExportPdf"),
    fabNew: document.getElementById("fabNew"),

    screenBrowse: document.getElementById("screenBrowse"),
    browseTbody: document.getElementById("browseTbody"),
    browseEmpty: document.getElementById("browseEmpty"),

    screenView: document.getElementById("screenView"),
    viewTitle: document.getElementById("viewTitle"),
    viewSubtitle: document.getElementById("viewSubtitle"),
    viewGrid: document.getElementById("viewGrid"),
    btnViewBack: document.getElementById("btnViewBack"),
    btnViewEdit: document.getElementById("btnViewEdit"),
    btnViewDelete: document.getElementById("btnViewDelete"),

    screenEdit: document.getElementById("screenEdit"),
    editTitle: document.getElementById("editTitle"),
    editSubtitle: document.getElementById("editSubtitle"),
    editForm: document.getElementById("editForm"),
    btnEditBack: document.getElementById("btnEditBack"),
    btnEditSave: document.getElementById("btnEditSave"),

    modalBackdrop: document.getElementById("modalBackdrop"),
    modal: document.getElementById("modal"),
    modalTitle: document.getElementById("modalTitle"),
    modalBody: document.getElementById("modalBody"),
    modalActions: document.getElementById("modalActions"),

    loadingOverlay: document.getElementById("loadingOverlay"),
    loadingText: document.getElementById("loadingText")
  };

  // =========================
  // UTIL
  // =========================
  function norm(s) {
    return String(s ?? "").trim();
  }
  function keyOf(rec) {
    return { ch1: norm(rec["ΧΘ-1"]), ch2: norm(rec["ΧΘ-2"]) };
  }
  function sameKey(a, b) {
    return a && b && norm(a.ch1) === norm(b.ch1) && norm(a.ch2) === norm(b.ch2);
  }

  function parsePlainNumber(x) {
    const s = norm(x).replace(",", "."); // tolerate comma decimals
    if (!s) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
    }

function computeLengthFromCH(ch1, ch2) {
  const a = parsePlainNumber(ch1);
  const b = parsePlainNumber(ch2);
  if (a === null || b === null) return null;
  return b - a;
}

  function showModal({ title, bodyHtml, actions }) {
    el.modalTitle.textContent = title;
    el.modalBody.innerHTML = bodyHtml || "";
    el.modalActions.innerHTML = "";

    (actions || []).forEach((a) => {
      const b = document.createElement("button");
      b.className = `btn ${a.variant || ""}`.trim();
      b.textContent = a.label;
      b.onclick = () => {
        if (a.onClick) a.onClick();
      };
      el.modalActions.appendChild(b);
    });

    el.modalBackdrop.hidden = false;
    el.modal.hidden = false;
  }
  function closeModal() {
    el.modalBackdrop.hidden = true;
    el.modal.hidden = true;
  }
  el.modalBackdrop.addEventListener("click", closeModal);

  function toast(msg) {
    // minimal: modal-style toast substitute
    showModal({
      title: "Ενημέρωση",
      bodyHtml: `<div>${escapeHtml(msg)}</div>`,
      actions: [{ label: "OK", variant: "ghost", onClick: closeModal }]
    });
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function setScreen(name) {
    state.screen = name;
    el.screenBrowse.hidden = name !== "browse";
    el.screenView.hidden = name !== "view";
    el.screenEdit.hidden = name !== "edit";
  }

  function updateConnectivityUi() {
    state.isOnline = navigator.onLine;
    el.offlineBanner.hidden = state.isOnline;

    // disable write actions if offline
    const writesDisabled = !state.isOnline;
    el.fabNew.disabled = writesDisabled;
    el.btnExportPdf.disabled = writesDisabled;
    el.btnViewDelete.disabled = writesDisabled;
    el.btnEditSave.disabled = writesDisabled;

    // refresh can be allowed only online (since it fetches)
    el.btnRefresh.disabled = !state.isOnline;
  }

    let loadingDepth = 0;

    function showOverlay(text = "Φόρτωση…") {
    if (!el.loadingOverlay || !el.loadingText) return;
    el.loadingText.textContent = text;
    el.loadingOverlay.style.display = "flex";
    }

    function hideOverlay() {
    if (!el.loadingOverlay) return;
    el.loadingOverlay.style.display = "none";
    }

    function setLoading(isLoading, text = "Φόρτωση…") {
    if (isLoading) loadingDepth++;
    else loadingDepth = Math.max(0, loadingDepth - 1);

    if (loadingDepth > 0) showOverlay(text);
    else hideOverlay();
    }

    function clearLoading() {
    loadingDepth = 0;
    hideOverlay();
    }

    function printHeaderLabel(key) {
        const map = {
            "ΧΘ-1": "ΧΘ-1",
            "ΧΘ-2": "ΧΘ-2",
            "ΜΗΚΟΣ": "ΜΗΚΟΣ",
            "ΠΛΑΤΟΣ": "ΠΛΑΤΟΣ",
            "ΒΑΘΟΣ": "ΒΑΘΟΣ",
            "ΕΤΚΔ": "ΕΤΚΔ",

            "ΠΛΕΓΜΑ ΣΗΜΑΝΣΗΣ": "ΠΛΕΓΜΑ<wbr>ΣΗΜ.",
            "ΒΑΘΟΣ ΤΟΠΟΘΕΤΗΣΗΣ 3A": "ΒΑΘΟΣ<br>3A",

            "XLPE 3X150 (XT)": "XLPE<wbr>3×150",
            "XLPE 3X240 (MT)": "XLPE<wbr>3×240",

            "ΣΩΛΗΝΕΣ Φ160": "Φ160",

            "ΠΛΑΤΟΣ ΠΛΕΓΜΑΤΟΣ Τ-139": "ΠΛΑΤΟΣ<wbr>T-139",
            "ΠΛΑΤΟΣ ΥΠΟΣΤΡΩΜΑΤΟΣ": "ΠΛΑΤΟΣ<wbr>ΥΠΟΣΤΡ.",
            "ΒΑΘΟΣ ΥΠΟΣΤΡΩΜΑΤΟΣ": "ΒΑΘΟΣ<wbr>ΥΠΟΣΤΡ.",

            "ΠΛΑΤΟΣ ΑΣΦΑΛΤΟΥ": "ΠΛΑΤΟΣ<wbr>ΑΣΦ.",
            "ΒΑΘΟΣ ΑΣΦΑΛΤΟΥ": "ΒΑΘΟΣ<wbr>ΑΣΦ.",

            "ΠΑΡΑΤΗΡΗΣΕΙΣ": "ΠΑΡΑΤΗΡΗΣΕΙΣ"
        };

        return map[key] || escapeHtml(key);
    }

function buildAndPrintTableReport(rows) {
    rows = [...rows].sort((a, b) => {
        const x1 = Number(norm(a["ΧΘ-1"]));
        const x2 = Number(norm(b["ΧΘ-1"]));
        if (Number.isFinite(x1) && Number.isFinite(x2)) return x1 - x2;
        return norm(a["ΧΘ-1"]).localeCompare(norm(b["ΧΘ-1"]));
    });

    const now = new Date();
    const stamp = now.toLocaleString("el-GR");
    const cols = FIELDS.map(f => f.key);

    const thead = `
        <thead>
        <tr>
            ${cols.map(c => `<th>${printHeaderLabel(c)}</th>`).join("")}
        </tr>
        </thead>
    `;

    const tbody = `
        <tbody>
        ${rows.map(r => `
            <tr>
            ${cols.map(c => {
                const v = norm(r[c]);
                return `<td>${v ? escapeHtml(v) : ""}</td>`;
            }).join("")}
            </tr>
        `).join("")}
        </tbody>
    `;

    const html = `<!doctype html>
    <html lang="el">
    <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Πίνακας Επιμετρήσεων</title>
    <style>
    :root{
        --border:#e5e7eb;
        --muted:#6b7280;
        --text:#111827;
        --head:#f9fafb;
    }
    body{
        font-family: system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;
        color:var(--text);
        margin: 3mm;
    }
    .hdr{
        display:flex;
        justify-content:space-between;
        align-items:flex-start;
        gap:12px;
        margin-bottom:6mm;
    }
    .h1{margin:0;font-size:16px;font-weight:900}
    .muted{color:var(--muted);font-size:12px}

    .wrap{
    display:flex;
    justify-content:center;
    align-items:flex-start;
    padding:0;
    }

    .print-scale{
    transform-origin: top center; /* IMPORTANT */
    display:inline-block;
    }

    table{
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
    font-size: 10px;
    }

    thead th{
    background: var(--head);
    font-weight: 900;
    text-align: left;
    vertical-align: top;           /* key: avoid mid-cell centering */
    padding: 6px 6px;

    border-bottom: 1px solid var(--border);
    border-right: 1px solid var(--border);

    white-space: normal;           /* wrapping enabled */
    word-break: normal;            /* do NOT split words */
    overflow-wrap: normal;         /* wrap only at spaces */
    hyphens: none;

    line-height: 1.15;
    min-height: 34px;              /* consistent header height */
    }

    tbody td{
    padding: 5px 6px;
    vertical-align: top;

    border-bottom: 1px solid var(--border);
    border-right: 1px solid var(--border);

    white-space: normal;
    word-break: normal;
    overflow-wrap: normal;
    hyphens: none;

    line-height: 1.2;
    }

    thead th:last-child,
    tbody td:last-child{
    border-right: none;
    }

    tbody tr:nth-child(even){ background:#fcfcfd; }

    /* Emphasize key columns */
    th:nth-child(1), th:nth-child(2),
    td:nth-child(1), td:nth-child(2){ font-weight:900; }

    @media print {
    .wrap { overflow: visible !important; }
    }


    @page { size: A4 landscape; margin: 3mm; }
    @media print {
        body{ margin:0; }
        thead{ display: table-header-group; } /* repeat header on each page */
        tr{ page-break-inside: avoid; }
    }
    </style>
    </head>
    <body>
    <div class="hdr">
        <div>
        <h1 class="h1">Πίνακας Επιμετρήσεων</h1>
        <div class="muted">Εξαγωγή: ${escapeHtml(stamp)}</div>
        </div>
    </div>

    <div class="wrap" id="wrap">
        <div class="print-scale" id="printScale">
        <table id="reportTable">
            ${thead}
            ${tbody}
        </table>
        </div>
    </div>

   <script>
    var PAGE_MARGIN_MM = 3;
    var A4_LANDSCAPE_WIDTH_MM = 297;

    function mmToPx(mm) {
        var probe = document.createElement('div');
        probe.style.width = mm + 'mm';
        probe.style.position = 'absolute';
        probe.style.visibility = 'hidden';
        probe.style.left = '-9999px';
        document.body.appendChild(probe);
        var px = probe.getBoundingClientRect().width;
        probe.parentNode.removeChild(probe);
        return px;
    }

    function fitToPrintWidth() {
        var wrap = document.getElementById('wrap');
        var scaleEl = document.getElementById('printScale');
        var table = document.getElementById('reportTable');
        if (!wrap || !scaleEl || !table) return;

        scaleEl.style.transform = 'scale(1)';
        wrap.style.height = 'auto';

        requestAnimationFrame(function () {
        requestAnimationFrame(function () {
            var printableMm = A4_LANDSCAPE_WIDTH_MM - 2 * PAGE_MARGIN_MM;
            var availablePx = mmToPx(printableMm);

            var rect = table.getBoundingClientRect();
            var neededPx = rect.width;

            var s = 1;
            if (neededPx > availablePx) s = availablePx / neededPx;
            s = Math.max(0.95, Math.min(1, s)); // don’t shrink too much now that wrapping works

            scaleEl.style.transform = 'scale(' + s + ')';
            wrap.style.height = (table.scrollHeight * s) + 'px';
        });
        });
    }

    window.onload = function () {
        fitToPrintWidth();
        setTimeout(function () { window.print(); }, 120);
    };
    </script>

    </body>
    </html>`;

    const w = window.open("", "_blank");
    if (!w) {
        toast("Επιτρέψτε τα αναδυόμενα παράθυρα και δοκιμάστε ξανά.");
        return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
    }

  // =========================
  // API
  // =========================
  function jsonpRequest(params) {
    return new Promise((resolve, reject) => {
        const cb = `__cb_${Date.now()}_${Math.random().toString(16).slice(2)}`;
        const qs = new URLSearchParams({ ...params, key: API_KEY, callback: cb });

        const script = document.createElement("script");
        script.src = `${APPS_SCRIPT_URL}?${qs.toString()}`;
        script.async = true;

        const timeout = setTimeout(() => {
        cleanup();
        reject(new Error("JSONP timeout"));
        }, 15000);

        function cleanup() {
        clearTimeout(timeout);
        delete window[cb];
        if (script.parentNode) script.parentNode.removeChild(script);
        }

        window[cb] = (data) => {
        cleanup();
        resolve(data);
        };

        script.onerror = () => {
        cleanup();
        reject(new Error("JSONP network error"));
        };

        document.head.appendChild(script);
    });
}

  const api = {
  async list() {
    const res = await jsonpRequest({
      action: "list",
      fields: "ΧΘ-1,ΧΘ-2,ΕΤΚΔ"
    });
    if (!res.ok) throw new Error(res.error || "list_failed");
    return res.data || [];
  },

  async getByKey(ch1, ch2) {
    const res = await jsonpRequest({
      action: "get",
      ch1: String(ch1 || "").trim(),
      ch2: String(ch2 || "").trim()
    });
    if (!res.ok) throw new Error(res.error || "get_failed");
    return res.data || null;
  },

  async upsertByKey(ch1, ch2, patch) {
    const res = await jsonpRequest({
      action: "upsert",
      ch1: String(ch1 || "").trim(),
      ch2: String(ch2 || "").trim(),
      patch: JSON.stringify(patch || {})
    });
    if (!res.ok) throw new Error(res.error || "upsert_failed");
    return res.data;
  },

  async deleteByKey(ch1, ch2) {
    const res = await jsonpRequest({
      action: "delete",
      ch1: String(ch1 || "").trim(),
      ch2: String(ch2 || "").trim()
    });
    if (!res.ok) return false;
    return true;
  },

  async exportPdfAll() {
    const fields = FIELDS.map(f => f.key).join(",");
    const res = await jsonpRequest({ action: "list", fields });
    if (!res.ok) throw new Error(res.error || "export_list_failed");
    const rows = res.data || [];
    buildAndPrintTableReport(rows);
    }
};


  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  // =========================
  // RENDER: BROWSE
  // =========================
  function renderBrowse() {
    el.browseTbody.innerHTML = "";

    if (state.isListLoading) {
        // 8 skeleton rows
        for (let i = 0; i < 8; i++) {
        const tr = document.createElement("tr");
        for (let c = 0; c < BROWSE_COLS.length; c++) {
            const td = document.createElement("td");
            td.innerHTML = `<span class="skeleton">&nbsp;</span>`;
            tr.appendChild(td);
        }
        el.browseTbody.appendChild(tr);
        }
        el.browseEmpty.hidden = true;
        return;
    }

    if (!state.records.length) {
        el.browseEmpty.hidden = false;
        return;
    }
    el.browseEmpty.hidden = true;

    for (const rec of state.records) {
        const tr = document.createElement("tr");

        for (const k of BROWSE_COLS) {
        const td = document.createElement("td");
        td.textContent = norm(rec[k]) || "";
        tr.appendChild(td);
        }

        tr.style.cursor = "pointer";
        tr.addEventListener("click", () => openView(rec));
        el.browseTbody.appendChild(tr);
    }
}

  // =========================
  // VIEW
  // =========================
async function openView(recOrKey) {
  const k = recOrKey["ΧΘ-1"] ? keyOf(recOrKey) : recOrKey;
  state.selectedKey = k;

  setLoading(true, "Φόρτωση εγγραφής…");
  try {
    let rec = null;
    if (state.isOnline) rec = await api.getByKey(k.ch1, k.ch2);
    else rec = state.records.find(r => sameKey(keyOf(r), k)) || null;

    if (!rec) { toast("Η εγγραφή δεν βρέθηκε."); return; }

    state.selectedRecord = rec;
    el.viewTitle.textContent = `${norm(rec["ΧΘ-1"])} → ${norm(rec["ΧΘ-2"])}`;
    el.viewSubtitle.textContent = "Λειτουργία Προβολής";

    el.viewGrid.innerHTML = "";
    for (const f of FIELDS) {
      const val = norm(rec[f.key]);
      const kv = document.createElement("div");
      kv.className = "kv";
      kv.innerHTML = `
        <div class="k">${escapeHtml(f.key)}</div>
        <div class="v">${val ? escapeHtml(val) : "—"}</div>
      `;
      el.viewGrid.appendChild(kv);
    }

    setScreen("view");
    updateConnectivityUi();

     } catch (e) {
        toast("Αποτυχία φόρτωσης εγγραφής.");
        console.error(e);
    } finally {
        setLoading(false);
    }
  }

  // =========================
  // EDIT / CREATE
  // =========================
  function blankRecord() {
    const o = {};
    for (const f of FIELDS) o[f.key] = "";
    return o;
  }

function renderEditForm(rec, mode) {
  el.editForm.innerHTML = "";

  const inputs = {}; // key -> input element

  for (const f of FIELDS) {
    const wrap = document.createElement("div");
    wrap.className = "field";

    const label = document.createElement("div");
    label.className = "label";
    label.textContent = f.key;

    let input;
    if (f.type === "textarea") {
      input = document.createElement("textarea");
      input.className = "textarea";
    } else {
      input = document.createElement("input");
      input.className = "input";
      input.type = (f.type === "number") ? "number" : "text";
      if (f.type === "number") input.step = "any";
    }

    input.name = f.key;
    input.value = rec[f.key] ?? "";

    const shouldLock = (mode === "edit") && f.lockAfterCreate;
    if (shouldLock) {
      input.readOnly = true;
      input.classList.add("readonly");
    }

    if (f.required) input.placeholder = "Υποχρεωτικό";

    inputs[f.key] = input;

    wrap.appendChild(label);
    wrap.appendChild(input);
    el.editForm.appendChild(wrap);
  }

  // ---- Autofill ΜΗΚΟΣ & ΠΛΕΓΜΑ ΣΗΜΑΝΣΗΣ = ΧΘ-2 - ΧΘ-1 ----
  const ch1El = inputs["ΧΘ-1"];
  const ch2El = inputs["ΧΘ-2"];
  const lenEl = inputs["ΜΗΚΟΣ"];
  const meshEl = inputs["ΠΛΕΓΜΑ ΣΗΜΑΝΣΗΣ"];

  function maybeAutofill() {
    const L = computeLengthFromCH(ch1El?.value, ch2El?.value);
    if (L === null) return;
    if (L < 0) return; // guard against swapped inputs

    const val = String(L);

    if (mode === "create") {
      if (lenEl) lenEl.value = val;
      if (meshEl) meshEl.value = val;
    } else {
      if (lenEl && !norm(lenEl.value)) lenEl.value = val;
      if (meshEl && !norm(meshEl.value)) meshEl.value = val;
    }
  }

  ch1El?.addEventListener("input", maybeAutofill);
  ch2El?.addEventListener("input", maybeAutofill);
  maybeAutofill();
}

  function openCreate() {
    if (!state.isOnline) {
      toast("Εκτός σύνδεσης.");
      return;
    }
    state.editMode = "create";
    const rec = blankRecord();
    state.selectedRecord = rec;
    state.selectedKey = null;

    el.editTitle.textContent = "Νέα εγγραφή";
    el.editSubtitle.textContent = "Τα ΧΘ-1 και ΧΘ-2 είναι υποχρεωτικά και κλειδώνουν μετά τη δημιουργία.";
    renderEditForm(rec, "create");
    setScreen("edit");
    updateConnectivityUi();
  }

  function openEditFromView() {
    if (!state.selectedRecord) return;
    if (!state.isOnline) {
      toast("Εκτός σύνδεσης.");
    }
    state.editMode = "edit";
    el.editTitle.textContent = "Επεξεργασία εγγραφής";
    el.editSubtitle.textContent = "Τα ΧΘ-1/ΧΘ-2 είναι κλειδωμένα.";
    renderEditForm(structuredClone(state.selectedRecord), "edit");
    setScreen("edit");
    updateConnectivityUi();
  }

  function readFormValues() {
    const data = {};
    const fd = new FormData(el.editForm);
    for (const [k, v] of fd.entries()) {
      data[k] = (typeof v === "string") ? v.trim() : v;
    }
    return data;
  }

async function saveEdit() {
  if (!state.isOnline) { toast("Εκτός Σύνδεσης."); return; }

  const data = readFormValues();
  const ch1 = norm(data["ΧΘ-1"]);
  const ch2 = norm(data["ΧΘ-2"]);
  if (!ch1 || !ch2) { toast("Τα πεδία ΧΘ-1 και ΧΘ-2 είναι υποχρεωτικά."); return; }

  const L = computeLengthFromCH(data["ΧΘ-1"], data["ΧΘ-2"]);
  if (L !== null && L >= 0) {
    if (!norm(data["ΜΗΚΟΣ"])) data["ΜΗΚΟΣ"] = String(L);
    if (!norm(data["ΠΛΕΓΜΑ ΣΗΜΑΝΣΗΣ"])) data["ΠΛΕΓΜΑ ΣΗΜΑΝΣΗΣ"] = String(L);
  }

  const patch = {};
  for (const f of FIELDS) patch[f.key] = data[f.key] ?? "";

  const wasCreate = (state.editMode === "create");

  setLoading(true, "Αποθήκευση…");
  el.btnEditSave.disabled = true;

  try {
    const saved = await api.upsertByKey(ch1, ch2, patch);

    state.selectedKey = { ch1, ch2 };
    state.selectedRecord = saved;

    await loadList(); // refresh browse list from server

    if (wasCreate) {
      // HARD NAVIGATION TO BROWSE AFTER NEW ENTRY
      state.editMode = "edit";      // reset mode so back button doesn't behave like create
      setScreen("browse");
      updateConnectivityUi();
      return;                       // CRITICAL: prevents any later navigation to view/edit
    }

    // EDIT case: go to view
    //await openView({ ch1, ch2 });

  } catch (e) {
    toast("Αποτυχία αποθήκευσης. Δοκιμάστε ξανά.");
    console.error(e);
  } finally {
    el.btnEditSave.disabled = !state.isOnline;
    setLoading(false);
  }
}


  async function deleteFromView() {
    if (!state.selectedKey) return;
    if (!state.isOnline) {
      toast("Έκτος σύνδεσης.");
      return;
    }

    const { ch1, ch2 } = state.selectedKey;

    showModal({
      title: "Επιβεβαίωση Διαγραφής",
      bodyHtml: `
        <div>Θέλετε σίγουρα να διαγράψετε την εγγραφή;</div>
        <div style="margin-top:8px;font-weight:900;">${escapeHtml(ch1)} → ${escapeHtml(ch2)}</div>
      `,
      actions: [
        { label: "Άκυρο", variant: "ghost", onClick: closeModal },
        {
          label: "Διαγραφή",
          variant: "danger",
          onClick: async () => {
            closeModal();
            const ok = await api.deleteByKey(ch1, ch2);
            if (!ok) {
              toast("Η εγγραφή δεν βρέθηκε.");
              return;
            }
            state.selectedKey = null;
            state.selectedRecord = null;

            await loadList();
            renderBrowse();
            setScreen("browse");
            updateConnectivityUi();
          }
        }
      ]
    });
  }

  // =========================
  // EXPORT PDF
  // =========================
  async function exportPdf() {
    if (!state.isOnline) {
        toast("Έκτος σύνδεσης.");
        return;
    }

    setLoading(true, "Δημιουργία PDF…");
    try {
        await api.exportPdfAll();
    } catch (e) {
        console.error(e);
        toast("Αποτυχία εξαγωγής PDF. Δοκιμάστε ξανά.");
    } finally {
        setLoading(false);
    }
    }

  // =========================
  // EVENTS
  // =========================
  el.btnRefresh.addEventListener("click", async () => {
    if (!state.isOnline) return;
    await loadList();
  });

  el.btnExportPdf.addEventListener("click", exportPdf);
  el.fabNew.addEventListener("click", openCreate);

  el.btnViewBack.addEventListener("click", () => {
    setScreen("browse");
    updateConnectivityUi();
  });
  el.btnViewEdit.addEventListener("click", openEditFromView);
  el.btnViewDelete.addEventListener("click", deleteFromView);

  el.btnEditBack.addEventListener("click", () => {
    // Simple back: go to view if we came from an existing record, else browse
    if (state.editMode === "edit" && state.selectedKey) {
      openView(state.selectedKey);
    } else {
      setScreen("browse");
      updateConnectivityUi();
    }
  });
  el.btnEditSave.addEventListener("click", (e) => {
    e.preventDefault();
    saveEdit();
  });

  window.addEventListener("online", () => {
    updateConnectivityUi();
    // optionally auto-refresh when connectivity returns
  });
  window.addEventListener("offline", () => {
    updateConnectivityUi();
  });

  // =========================
  // LOAD
  // =========================
  async function loadList() {
  try {
    state.isListLoading = true;
    renderBrowse(); // render skeleton immediately
    setLoading(true, "Φόρτωση λίστας…");

    const rows = await api.list();
    state.records = rows;

  } catch (e) {
    toast("Έκτος Σύνδεσης");
    console.error(e);
    state.records = [];
  } finally {
    state.isListLoading = false;
    renderBrowse();
    setScreen("browse");
    updateConnectivityUi();

    // Force-close any leftover overlay state
    clearLoading();
    }
}

  // boot
  updateConnectivityUi();
  loadList();

})();
