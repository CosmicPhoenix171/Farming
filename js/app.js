/* ============================================================
   FS25 Crop Tracker - main application
   ============================================================ */
(function () {
  // ---------- State ----------
  const state = {
    crops: [],
    sort: { key: "yearlyYield", dir: "desc" },
    filters: {
      search: "",
      growth: "all",
      type: "all",
      strawOnly: false,
      bestYearlyOnly: false
    },
    chartSort: "yearlyDesc",
    adminMode: false,
    selectedCrop: null
  };

  // ---------- Helpers ----------
  const fmt = (n) => (n == null ? "—" : Number(n).toLocaleString());
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  function harvestsPerYear(c) {
    return Math.floor(12 / c.monthsToGrow);
  }
  function harvestsPerYearMax(c) {
    // for grass-style crops, max months means fewer harvests
    if (!c.maxMonthsToGrow) return harvestsPerYear(c);
    return Math.floor(12 / c.maxMonthsToGrow);
  }
  function yearlyYield(c) {
    return c.yieldPerSquareAcre * harvestsPerYear(c);
  }
  function yearlyYieldMin(c) {
    // worst case (longer growth) for ranged crops
    return c.yieldPerSquareAcre * harvestsPerYearMax(c);
  }
  function yearlyStraw(c) {
    return c.acreStrawYield ? c.acreStrawYield * harvestsPerYear(c) : 0;
  }
  function averageSellPrice(c) {
    if (c.lowSellPrice != null && c.highSellPrice != null) return (c.lowSellPrice + c.highSellPrice) / 2;
    return c.highSellPrice ?? c.lowSellPrice ?? null;
  }
  function pricePointCategory(c) {
    const avg = averageSellPrice(c);
    if (avg == null) return "Unknown";
    if (avg < 1000) return "Low";
    if (avg < 2500) return "Mid";
    if (avg < 4500) return "High";
    return "Premium";
  }
  function efficiency(c) {
    // simple efficiency metric: yield per month of growth
    return c.yieldPerSquareAcre / c.monthsToGrow;
  }
  function isRange(c) {
    return c.maxMonthsToGrow && c.maxMonthsToGrow !== c.monthsToGrow;
  }
  function monthsLabel(c) {
    return isRange(c) ? `${c.monthsToGrow}–${c.maxMonthsToGrow}` : `${c.monthsToGrow}`;
  }
  function harvestsLabel(c) {
    if (isRange(c)) {
      const max = harvestsPerYear(c);
      const min = harvestsPerYearMax(c);
      return min === max ? `${max}` : `${min}–${max}`;
    }
    return `${harvestsPerYear(c)}`;
  }
  function yearlyYieldLabel(c) {
    if (isRange(c)) {
      const hi = yearlyYield(c);
      const lo = yearlyYieldMin(c);
      return lo === hi ? fmt(hi) : `${fmt(lo)}–${fmt(hi)}`;
    }
    return fmt(yearlyYield(c));
  }
  function yearlyStrawLabel(c) {
    if (!c.acreStrawYield) return "—";
    if (isRange(c)) {
      const hi = c.acreStrawYield * harvestsPerYear(c);
      const lo = c.acreStrawYield * harvestsPerYearMax(c);
      return lo === hi ? fmt(hi) : `${fmt(lo)}–${fmt(hi)}`;
    }
    return fmt(yearlyStraw(c));
  }

  function useCase(c) {
    const m = c.monthsToGrow;
    const yy = yearlyYield(c);
    const cases = [];
    if (m <= 3) cases.push("Fast turnover crop");
    if (m >= 8) cases.push("Long-term / set-and-forget crop");
    if (c.acreStrawYield) cases.push("Straw producer");
    if (yy >= 100000) cases.push("High 12-month yield powerhouse");
    if (efficiency(c) >= 6000) cases.push("Top yield-per-month efficiency");
    if (!cases.length) cases.push("Balanced general-purpose crop");
    return cases.join(" · ");
  }

  // ---------- Init ----------
  function init() {
    state.crops = window.CropStore.load();
    bindEvents();
    populateTypeFilter();
    renderAll();
  }

  function renderAll() {
    renderDashboard();
    renderTable();
    renderChart();
    renderTimeline();
  }

  // ---------- Events ----------
  function bindEvents() {
    // Sort
    $$("#cropTable th[data-sort]").forEach(th => {
      th.addEventListener("click", () => {
        const key = th.dataset.sort;
        if (state.sort.key === key) {
          state.sort.dir = state.sort.dir === "asc" ? "desc" : "asc";
        } else {
          state.sort.key = key;
          state.sort.dir = key === "crop" ? "asc" : "desc";
        }
        renderTable();
      });
    });

    // Filters
    $("#searchInput").addEventListener("input", e => { state.filters.search = e.target.value.toLowerCase(); renderTable(); });
    $("#growthFilter").addEventListener("change", e => { state.filters.growth = e.target.value; renderTable(); });
    $("#typeFilter").addEventListener("change", e => { state.filters.type = e.target.value; renderTable(); });
    $("#strawOnly").addEventListener("change", e => { state.filters.strawOnly = e.target.checked; renderTable(); });
    $("#bestYearlyOnly").addEventListener("change", e => { state.filters.bestYearlyOnly = e.target.checked; renderTable(); });

    // Chart sort
    $("#chartSort").addEventListener("change", e => { state.chartSort = e.target.value; renderChart(); });

    // Admin toggle
    $("#adminToggle").addEventListener("change", e => {
      state.adminMode = e.target.checked;
      $("#adminActions").hidden = !state.adminMode;
      $$(".admin-col").forEach(el => el.hidden = !state.adminMode);
      renderTable();
    });

    // Admin actions
    $("#addCropBtn").addEventListener("click", () => openModal(null));
    $("#exportJsonBtn").addEventListener("click", () => window.CropStore.exportJson(state.crops));
    $("#exportCsvBtn").addEventListener("click", () => window.CropStore.exportCsv(state.crops));
    $("#importJsonBtn").addEventListener("click", () => $("#importFile").click());
    $("#importFile").addEventListener("change", onImportFile);
    $("#resetBtn").addEventListener("click", () => {
      if (confirm("Reset all crop data to defaults? This cannot be undone.")) {
        state.crops = window.CropStore.reset();
        renderAll();
      }
    });

    // Modal
    $("#closeModal").addEventListener("click", closeModal);
    $("#cancelEdit").addEventListener("click", closeModal);
    $("#cropForm").addEventListener("submit", onSubmitForm);

    // Detail panel
    $("#closeDetail").addEventListener("click", closeDetail);
    $("#overlay").addEventListener("click", () => { closeDetail(); closeModal(); });

    // Esc key
    document.addEventListener("keydown", e => {
      if (e.key === "Escape") { closeDetail(); closeModal(); }
    });
  }

  function populateTypeFilter() {
    const types = Array.from(new Set(state.crops.map(c => c.type))).sort();
    const sel = $("#typeFilter");
    // keep "all" then append
    sel.querySelectorAll("option:not([value='all'])").forEach(o => o.remove());
    types.forEach(t => {
      const o = document.createElement("option");
      o.value = t;
      o.textContent = t.charAt(0).toUpperCase() + t.slice(1);
      sel.appendChild(o);
    });
  }

  // ---------- Dashboard ----------
  function renderDashboard() {
    if (!state.crops.length) {
      $("#dashboardCards").innerHTML = `<div class="card"><div class="label">No data</div><div class="value">—</div></div>`;
      return;
    }
    const bestYield = [...state.crops].sort((a, b) => b.yieldPerSquareAcre - a.yieldPerSquareAcre)[0];
    const bestYearly = [...state.crops].sort((a, b) => yearlyYield(b) - yearlyYield(a))[0];
    const fastest = [...state.crops].sort((a, b) => a.monthsToGrow - b.monthsToGrow)[0];
    const strawCrops = state.crops.filter(c => c.acreStrawYield);
    const bestStraw = strawCrops.length
      ? [...strawCrops].sort((a, b) => yearlyStraw(b) - yearlyStraw(a))[0]
      : null;
    const bestEff = [...state.crops].sort((a, b) => efficiency(b) - efficiency(a))[0];

    const cards = [
      {
        label: "Best yield / acre (single)",
        value: bestYield.crop,
        sub: `${fmt(bestYield.yieldPerSquareAcre)} / acre`
      },
      {
        label: "Best 12-month yield",
        value: bestYearly.crop,
        sub: `${fmt(yearlyYield(bestYearly))} / acre / yr`
      },
      {
        label: "Fastest crop",
        value: fastest.crop,
        sub: `${monthsLabel(fastest)} months`
      },
      {
        label: "Best straw producer",
        value: bestStraw ? bestStraw.crop : "—",
        sub: bestStraw ? `${fmt(yearlyStraw(bestStraw))} straw / yr` : "no straw data"
      },
      {
        label: "Best yield-per-month efficiency",
        value: bestEff.crop,
        sub: `${fmt(Math.round(efficiency(bestEff)))} / acre / mo`
      }
    ];

    $("#dashboardCards").innerHTML = cards.map(c => `
      <div class="card">
        <div class="label">${c.label}</div>
        <div class="value">${escapeHtml(c.value)}</div>
        <div class="sub">${escapeHtml(c.sub)}</div>
      </div>
    `).join("");
  }

  // ---------- Filtering + sorting ----------
  function filteredCrops() {
    let list = state.crops.slice();
    const f = state.filters;
    if (f.search) {
      list = list.filter(c => c.crop.toLowerCase().includes(f.search));
    }
    if (f.growth !== "all") {
      list = list.filter(c => {
        if (f.growth === "fast") return c.monthsToGrow <= 3;
        if (f.growth === "mid")  return c.monthsToGrow >= 4 && c.monthsToGrow <= 6;
        if (f.growth === "long") return c.monthsToGrow >= 7;
        return true;
      });
    }
    if (f.type !== "all") {
      list = list.filter(c => c.type === f.type);
    }
    if (f.strawOnly) {
      list = list.filter(c => c.acreStrawYield);
    }
    if (f.bestYearlyOnly) {
      const top = [...state.crops].sort((a, b) => yearlyYield(b) - yearlyYield(a)).slice(0, 8);
      const names = new Set(top.map(c => c.crop));
      list = list.filter(c => names.has(c.crop));
    }
    return list;
  }

  function sortValue(c, key) {
    switch (key) {
      case "crop": return c.crop.toLowerCase();
      case "monthsToGrow": return c.monthsToGrow;
      case "yieldPerSquareAcre": return c.yieldPerSquareAcre;
      case "acreStrawYield": return c.acreStrawYield ?? -1;
      case "harvestsPerYear": return harvestsPerYear(c);
      case "yearlyYield": return yearlyYield(c);
      case "yearlyStraw": return yearlyStraw(c);
      case "lowSellPrice": return c.lowSellPrice ?? -1;
      case "highSellPrice": return c.highSellPrice ?? -1;
      case "pricePointCategory": return pricePointCategory(c);
      default: return 0;
    }
  }

  function sortedFilteredCrops() {
    const list = filteredCrops();
    const { key, dir } = state.sort;
    const mult = dir === "asc" ? 1 : -1;
    list.sort((a, b) => {
      const va = sortValue(a, key);
      const vb = sortValue(b, key);
      if (va < vb) return -1 * mult;
      if (va > vb) return 1 * mult;
      return 0;
    });
    return list;
  }

  // ---------- Table ----------
  function renderTable() {
    const tbody = $("#cropTableBody");
    const list = sortedFilteredCrops();

    // header sort indicators
    $$("#cropTable th[data-sort]").forEach(th => {
      th.classList.remove("sorted-asc", "sorted-desc");
      if (th.dataset.sort === state.sort.key) {
        th.classList.add(state.sort.dir === "asc" ? "sorted-asc" : "sorted-desc");
      }
    });

    if (!list.length) {
      tbody.innerHTML = `<tr><td colspan="12" style="text-align:center;color:var(--muted);padding:24px">No crops match your filters.</td></tr>`;
      return;
    }

    tbody.innerHTML = list.map(c => {
      const sel = state.selectedCrop === c.crop ? " selected" : "";
      const adminCell = state.adminMode
        ? `<td class="admin-col">
             <div class="row-actions">
               <button class="btn" data-action="edit" data-crop="${escapeAttr(c.crop)}">Edit</button>
               <button class="btn btn-danger" data-action="delete" data-crop="${escapeAttr(c.crop)}">Del</button>
             </div>
           </td>`
        : "";
      return `
        <tr class="${sel}" data-crop="${escapeAttr(c.crop)}">
          <td>${escapeHtml(c.crop)}${c.acreStrawYield ? '<span class="tag yellow">straw</span>' : ""}</td>
          <td class="num">${monthsLabel(c)}</td>
          <td class="num">${fmt(c.yieldPerSquareAcre)}</td>
          <td class="num">${fmt(c.acreStrawYield)}</td>
          <td class="num">${harvestsLabel(c)}</td>
          <td class="num">${yearlyYieldLabel(c)}</td>
          <td class="num">${yearlyStrawLabel(c)}</td>
          <td class="num">${fmt(c.lowSellPrice)}</td>
          <td class="num">${fmt(c.highSellPrice)}</td>
          <td>${pricePointCategory(c)}</td>
          <td class="notes">${escapeHtml(c.notes || "")}</td>
          ${adminCell}
        </tr>
      `;
    }).join("");

    // row click → detail
    tbody.querySelectorAll("tr[data-crop]").forEach(tr => {
      tr.addEventListener("click", e => {
        if (e.target.closest("button")) return;
        openDetail(tr.dataset.crop);
      });
    });
    // admin buttons
    tbody.querySelectorAll("button[data-action]").forEach(b => {
      b.addEventListener("click", e => {
        e.stopPropagation();
        const action = b.dataset.action;
        const name = b.dataset.crop;
        if (action === "edit") openModal(name);
        if (action === "delete") deleteCrop(name);
      });
    });
  }

  // ---------- Chart (SVG bar chart) ----------
  function renderChart() {
    const svg = $("#yieldChart");
    const list = state.crops.slice();
    switch (state.chartSort) {
      case "yearlyDesc": list.sort((a, b) => yearlyYield(b) - yearlyYield(a)); break;
      case "yearlyAsc":  list.sort((a, b) => yearlyYield(a) - yearlyYield(b)); break;
      case "months":     list.sort((a, b) => a.monthsToGrow - b.monthsToGrow); break;
      case "name":       list.sort((a, b) => a.crop.localeCompare(b.crop)); break;
    }
    if (!list.length) { svg.innerHTML = ""; return; }

    const rowH = 22;
    const padL = 150;
    const padR = 80;
    const padT = 30;
    const padB = 30;
    const innerW = 700; // viewBox width minus padding
    const totalW = padL + innerW + padR;
    const totalH = padT + list.length * rowH + padB;

    const max = Math.max(...list.map(yearlyYield));
    const niceMax = Math.ceil(max / 50000) * 50000 || max;

    svg.setAttribute("viewBox", `0 0 ${totalW} ${totalH}`);
    svg.setAttribute("height", totalH);

    const ticks = 5;
    let gridlines = "";
    let axisLabels = "";
    for (let i = 0; i <= ticks; i++) {
      const x = padL + (innerW * i) / ticks;
      const val = (niceMax * i) / ticks;
      gridlines += `<line class="chart-gridline" x1="${x}" y1="${padT}" x2="${x}" y2="${padT + list.length * rowH}" />`;
      axisLabels += `<text class="chart-axis-label" x="${x}" y="${padT + list.length * rowH + 16}" text-anchor="middle">${formatShort(val)}</text>`;
    }

    let bars = "";
    list.forEach((c, i) => {
      const y = padT + i * rowH + 3;
      const w = (innerW * yearlyYield(c)) / niceMax;
      const cls = c.monthsToGrow <= 3 ? "chart-bar fast" : "chart-bar";
      bars += `
        <g data-crop="${escapeAttr(c.crop)}">
          <text class="chart-label" x="${padL - 8}" y="${y + 12}" text-anchor="end">${escapeHtml(c.crop)}</text>
          <rect class="${cls}" x="${padL}" y="${y}" width="${Math.max(1, w)}" height="${rowH - 6}" rx="3">
            <title>${escapeHtml(c.crop)} — ${fmt(yearlyYield(c))} / acre / yr (${monthsLabel(c)} mo, ${harvestsLabel(c)} harvests)</title>
          </rect>
          <text class="chart-value" x="${padL + w + 6}" y="${y + 12}">${fmt(yearlyYield(c))}</text>
        </g>
      `;
    });

    svg.innerHTML = `
      ${gridlines}
      <line class="chart-axis" x1="${padL}" y1="${padT}" x2="${padL}" y2="${padT + list.length * rowH}" />
      <line class="chart-axis" x1="${padL}" y1="${padT + list.length * rowH}" x2="${padL + innerW}" y2="${padT + list.length * rowH}" />
      ${bars}
      ${axisLabels}
      <text class="chart-axis-label" x="${padL + innerW / 2}" y="${totalH - 4}" text-anchor="middle">12-Month Yield (per acre)</text>
    `;

    svg.querySelectorAll("g[data-crop]").forEach(g => {
      g.style.cursor = "pointer";
      g.addEventListener("click", () => openDetail(g.dataset.crop));
    });
  }

  function formatShort(n) {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
    if (n >= 1_000) return Math.round(n / 1_000) + "k";
    return String(n);
  }

  // ---------- Timeline ----------
  function renderTimeline() {
    const el = $("#timeline");
    const list = state.crops.slice().sort((a, b) => a.monthsToGrow - b.monthsToGrow);
    if (!list.length) { el.innerHTML = `<div style="color:var(--muted)">No crops.</div>`; return; }

    el.innerHTML = list.map(c => {
      const min = c.monthsToGrow;
      const harvests = Math.floor(12 / min);
      const usefulMonths = harvests * min; // months covered by complete cycles
      let cells = "";
      for (let m = 1; m <= 12; m++) {
        let cls = "idle";
        let label = "";
        let title = `Month ${m}`;
        if (m <= usefulMonths) {
          const monthInCycle = ((m - 1) % min) + 1;
          if (monthInCycle === min) {
            cls = "harvest";
            label = "✓";
            title += " — harvest ready";
          } else {
            cls = "growing";
            title += " — growing";
          }
        } else {
          title += " — idle (not enough time for another cycle)";
        }
        cells += `<div class="timeline-cell ${cls}" title="${title}">${label}</div>`;
      }
      return `
        <div class="timeline-row" data-crop="${escapeAttr(c.crop)}">
          <div class="timeline-name">
            <strong>${escapeHtml(c.crop)}</strong>
            <small>${monthsLabel(c)} mo</small>
          </div>
          <div class="timeline-bar">${cells}</div>
        </div>
      `;
    }).join("");

    el.querySelectorAll(".timeline-row").forEach(r => {
      r.style.cursor = "pointer";
      r.addEventListener("click", () => openDetail(r.dataset.crop));
    });
  }

  // ---------- Detail panel ----------
  function openDetail(name) {
    const c = state.crops.find(x => x.crop === name);
    if (!c) return;
    state.selectedCrop = name;
    $("#detailTitle").textContent = c.crop;
    $("#detailBody").innerHTML = `
      <div class="stat"><span class="k">Type</span><span class="v">${escapeHtml(c.type || "—")}</span></div>
      <div class="stat"><span class="k">Months to grow</span><span class="v">${monthsLabel(c)}</span></div>
      <div class="stat"><span class="k">Yield / acre</span><span class="v">${fmt(c.yieldPerSquareAcre)}</span></div>
      <div class="stat"><span class="k">Straw / acre</span><span class="v">${fmt(c.acreStrawYield)}</span></div>
      <div class="stat"><span class="k">Harvests / 12 mo</span><span class="v">${harvestsLabel(c)}</span></div>
      <div class="stat"><span class="k">12-month yield</span><span class="v">${yearlyYieldLabel(c)}</span></div>
      <div class="stat"><span class="k">12-month straw</span><span class="v">${yearlyStrawLabel(c)}</span></div>
      <div class="stat"><span class="k">Low sell price (per 1,000u)</span><span class="v">${fmt(c.lowSellPrice)}</span></div>
      <div class="stat"><span class="k">High sell price (per 1,000u)</span><span class="v">${fmt(c.highSellPrice)}</span></div>
      <div class="stat"><span class="k">Price point category</span><span class="v">${pricePointCategory(c)}</span></div>
      <div class="stat"><span class="k">Yield / month efficiency</span><span class="v">${fmt(Math.round(efficiency(c)))}</span></div>
      <div class="use-case"><strong>Suggested use:</strong> ${escapeHtml(useCase(c))}</div>
      ${c.notes ? `<div class="notes-box"><strong>Notes:</strong> ${escapeHtml(c.notes)}</div>` : ""}
    `;
    $("#detailPanel").hidden = false;
    requestAnimationFrame(() => $("#detailPanel").setAttribute("data-open", "true"));
    $("#overlay").hidden = false;
    renderTable();
  }

  function closeDetail() {
    state.selectedCrop = null;
    $("#detailPanel").setAttribute("data-open", "false");
    $("#overlay").hidden = true;
    setTimeout(() => { $("#detailPanel").hidden = true; }, 200);
    renderTable();
  }

  // ---------- Modal (add/edit) ----------
  function openModal(name) {
    const isEdit = !!name;
    $("#modalTitle").textContent = isEdit ? "Edit Crop" : "Add Crop";
    const c = isEdit ? state.crops.find(x => x.crop === name) : null;
    $("#f_originalName").value = isEdit ? name : "";
    $("#f_crop").value = c ? c.crop : "";
    $("#f_months").value = c ? c.monthsToGrow : "";
    $("#f_maxMonths").value = c && c.maxMonthsToGrow ? c.maxMonthsToGrow : "";
    $("#f_yield").value = c ? c.yieldPerSquareAcre : "";
    $("#f_straw").value = c && c.acreStrawYield != null ? c.acreStrawYield : "";
    $("#f_lowSell").value = c && c.lowSellPrice != null ? c.lowSellPrice : "";
    $("#f_highSell").value = c && c.highSellPrice != null ? c.highSellPrice : "";
    $("#f_type").value = c ? c.type : "grain";
    $("#f_notes").value = c ? c.notes : "";
    $("#editModal").hidden = false;
    $("#overlay").hidden = false;
    $("#f_crop").focus();
  }

  function closeModal() {
    $("#editModal").hidden = true;
    if ($("#detailPanel").hidden) $("#overlay").hidden = true;
  }

  function onSubmitForm(e) {
    e.preventDefault();
    const original = $("#f_originalName").value;
    const maxM = $("#f_maxMonths").value ? Number($("#f_maxMonths").value) : undefined;
    const newCrop = window.CropStore.normalize({
      crop: $("#f_crop").value.trim(),
      monthsToGrow: Number($("#f_months").value),
      maxMonthsToGrow: maxM,
      yieldPerSquareAcre: Number($("#f_yield").value),
      acreStrawYield: $("#f_straw").value === "" ? null : Number($("#f_straw").value),
      lowSellPrice: $("#f_lowSell").value === "" ? null : Number($("#f_lowSell").value),
      highSellPrice: $("#f_highSell").value === "" ? null : Number($("#f_highSell").value),
      type: $("#f_type").value,
      notes: $("#f_notes").value.trim()
    });
    if (!newCrop.crop) return;
    if (original) {
      const idx = state.crops.findIndex(x => x.crop === original);
      if (idx >= 0) state.crops[idx] = newCrop;
    } else {
      if (state.crops.some(x => x.crop.toLowerCase() === newCrop.crop.toLowerCase())) {
        alert("A crop with that name already exists.");
        return;
      }
      state.crops.push(newCrop);
    }
    window.CropStore.save(state.crops);
    populateTypeFilter();
    closeModal();
    renderAll();
  }

  function deleteCrop(name) {
    if (!confirm(`Delete "${name}"?`)) return;
    state.crops = state.crops.filter(c => c.crop !== name);
    window.CropStore.save(state.crops);
    if (state.selectedCrop === name) closeDetail();
    renderAll();
  }

  function onImportFile(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    window.CropStore.importJsonFile(file).then(data => {
      if (!confirm(`Import ${data.length} crops? This replaces current data.`)) return;
      state.crops = data;
      window.CropStore.save(state.crops);
      populateTypeFilter();
      renderAll();
    }).catch(err => alert("Import failed: " + err.message));
    e.target.value = "";
  }

  // ---------- Escaping ----------
  function escapeHtml(s) {
    return String(s ?? "").replace(/[&<>"']/g, m => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[m]));
  }
  function escapeAttr(s) { return escapeHtml(s); }

  // ---------- Boot ----------
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
