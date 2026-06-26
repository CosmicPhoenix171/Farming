/* ============================================================
   FS25 Crop Tracker - main application
   ============================================================ */
(function () {
  let fxRafId = null;
  let fxStopTimer = null;

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
    livePriceEntries: [],
    lastLivePriceUpdateMs: 0,
    chartSort: "yearlyDesc",
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
  function pricePerAcre(c) {
    const avg = averageSellPrice(c);
    if (avg == null) return null;
    return (c.yieldPerSquareAcre / 1000) * avg;
  }
  function yearlyPricePerAcre(c) {
    const one = pricePerAcre(c);
    if (one == null) return null;
    return one * harvestsPerYear(c);
  }
  function yearlyPricePerAcreMin(c) {
    const one = pricePerAcre(c);
    if (one == null) return null;
    return one * harvestsPerYearMax(c);
  }
  function pricePerAcreLabel(c) {
    const v = pricePerAcre(c);
    if (v == null) return "—";
    return fmt(Math.round(v));
  }
  function yearlyPricePerAcreLabel(c) {
    const hi = yearlyPricePerAcre(c);
    if (hi == null) return "—";
    if (isRange(c)) {
      const lo = yearlyPricePerAcreMin(c);
      return lo === hi ? fmt(Math.round(hi)) : `${fmt(Math.round(lo))}–${fmt(Math.round(hi))}`;
    }
    return fmt(Math.round(hi));
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

  function normalizeKey(v) {
    return String(v || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  function readNumber(...values) {
    for (const v of values) {
      if (v == null || v === "") continue;
      const n = Number(v);
      if (!Number.isNaN(n) && Number.isFinite(n)) return n;
    }
    return null;
  }

  function applyLivePrices(entries, liveUpdatedAtMs = 0) {
    if (!Array.isArray(entries) || !entries.length) return;

    const byKey = new Map();
    state.crops.forEach((c, i) => byKey.set(normalizeKey(c.crop), i));

    const cropAliases = {
      greenbeans: "greenbean",
      redbeet: "redbeets",
      redbeets: "redbeets",
      sugaret: "sugarbeet",
      sugarbeets: "sugarbeet",
      longgrainrice: "ricelonggrain"
    };

    for (const e of entries) {
      const nameRaw = e.crop || e.fillTypeName || e.name || e.title || e.product || e.id;
      const keyRaw = normalizeKey(nameRaw);
      if (!keyRaw) continue;
      const key = cropAliases[keyRaw] || keyRaw;

      let idx = byKey.get(key);
      if (idx == null) {
        idx = state.crops.findIndex(c => key.includes(normalizeKey(c.crop)) || normalizeKey(c.crop).includes(key));
      }
      if (idx == null || idx < 0) continue;

      const low = readNumber(e.lowSellPrice, e.lowPrice, e.minPrice);
      const high = readNumber(e.highSellPrice, e.highPrice, e.maxPrice);
      const avg = readNumber(e.avgPrice, e.price, e.currentPrice);

      if (low == null && high == null && avg == null) continue;

      const crop = state.crops[idx];
      if (crop.manualPriceOverrideAt && crop.manualPriceOverrideAt > liveUpdatedAtMs) {
        continue;
      }

      if (low != null) crop.lowSellPrice = Math.round(low);
      if (high != null) crop.highSellPrice = Math.round(high);
      if (low == null && high == null && avg != null) {
        crop.lowSellPrice = Math.round(avg);
        crop.highSellPrice = Math.round(avg);
      } else if (low != null && high == null) {
        crop.highSellPrice = Math.round(low);
      } else if (high != null && low == null) {
        crop.lowSellPrice = Math.round(high);
      }
    }
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
    setupLiveCloudSync();
  }

  async function setupLiveCloudSync() {
    if (!window.FirebaseSync) return;
    if (window.FirebaseSync.ready) await window.FirebaseSync.ready;
    if (!window.FirebaseSync.enabled) return;

    let hasSeededCloud = false;
    window.FirebaseSync.subscribeCrops(async (cloud) => {
      if (Array.isArray(cloud) && cloud.length) {
        state.crops = cloud.map(window.CropStore.normalize);
        applyLivePrices(state.livePriceEntries, state.lastLivePriceUpdateMs);
        window.CropStore.save(state.crops);
        populateTypeFilter();
        renderAll();
        return;
      }

      if (!hasSeededCloud && state.crops.length) {
        hasSeededCloud = true;
        await window.FirebaseSync.saveCrops(state.crops);
      }
    });

    window.FirebaseSync.subscribeLivePrices((payload) => {
      state.livePriceEntries = Array.isArray(payload && payload.entries) ? payload.entries : [];
      state.lastLivePriceUpdateMs = Number(payload && payload.updatedAtMs) || Date.now();
      applyLivePrices(state.livePriceEntries, state.lastLivePriceUpdateMs);
      renderAll();
    });
  }

  async function persistCrops() {
    window.CropStore.save(state.crops);
    if (window.FirebaseSync && window.FirebaseSync.enabled) {
      await window.FirebaseSync.saveCrops(state.crops);
    }
  }

  function renderAll() {
    renderTable();
    renderChart();
    renderTimeline();
  }

  // ---------- Events ----------
  function bindEvents() {
    const brandMark = $(".brand-mark");
    if (brandMark) {
      brandMark.style.cursor = "pointer";
      brandMark.title = "Summon the tractor tornado";
      brandMark.addEventListener("click", triggerTractorTornadoFx);
    }

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

    // Actions
    $("#addCropBtn").addEventListener("click", () => openModal(null));

    // Modal
    $("#closeModal").addEventListener("click", closeModal);
    $("#cancelEdit").addEventListener("click", closeModal);
    $("#cropForm").addEventListener("submit", onSubmitForm);

    // Overlay
    $("#overlay").addEventListener("click", () => { closeModal(); });

    // Esc key
    document.addEventListener("keydown", e => {
      if (e.key === "Escape") { closeModal(); }
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
      case "pricePerAcre": return pricePerAcre(c) ?? -1;
      case "yearlyPricePerAcre": return yearlyPricePerAcre(c) ?? -1;
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
      tbody.innerHTML = `<tr><td colspan="13" style="text-align:center;color:var(--muted);padding:24px">No crops match your filters.</td></tr>`;
      return;
    }

    tbody.innerHTML = list.map((c, i) => {
      return `
        <tr data-crop="${escapeAttr(c.crop)}">
          <td class="num">${i + 1}</td>
          <td>${escapeHtml(c.crop)}${c.acreStrawYield ? '<span class="tag yellow">straw</span>' : ""}</td>
          <td class="num">${monthsLabel(c)}</td>
          <td class="num">${fmt(c.yieldPerSquareAcre)}</td>
          <td class="num">${fmt(c.acreStrawYield)}</td>
          <td class="num">${harvestsLabel(c)}</td>
          <td class="num">${yearlyYieldLabel(c)}</td>
          <td class="num">${yearlyStrawLabel(c)}</td>
          <td class="num">${fmt(c.lowSellPrice)}</td>
          <td class="num">${fmt(c.highSellPrice)}</td>
          <td class="num">${pricePerAcreLabel(c)}</td>
          <td class="num">${yearlyPricePerAcreLabel(c)}</td>
          <td class="notes">${escapeHtml(c.notes || "")}</td>
        </tr>
      `;
    }).join("");

    // row click → edit
    tbody.querySelectorAll("tr[data-crop]").forEach(tr => {
      tr.addEventListener("click", () => openModal(tr.dataset.crop));
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
      g.addEventListener("click", () => openModal(g.dataset.crop));
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
      r.addEventListener("click", () => openModal(r.dataset.crop));
    });
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
    $("#overlay").hidden = true;
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
      if (idx >= 0) {
        const prev = state.crops[idx];
        if (prev.lowSellPrice !== newCrop.lowSellPrice || prev.highSellPrice !== newCrop.highSellPrice) {
          newCrop.manualPriceOverrideAt = Date.now();
        } else {
          newCrop.manualPriceOverrideAt = prev.manualPriceOverrideAt ?? null;
        }
        state.crops[idx] = newCrop;
      }
    } else {
      if (state.crops.some(x => x.crop.toLowerCase() === newCrop.crop.toLowerCase())) {
        alert("A crop with that name already exists.");
        return;
      }
      if (newCrop.lowSellPrice != null || newCrop.highSellPrice != null) {
        newCrop.manualPriceOverrideAt = Date.now();
      }
      state.crops.push(newCrop);
    }
    persistCrops();
    populateTypeFilter();
    closeModal();
    renderAll();
  }

  // ---------- Fun FX ----------
  function triggerTractorTornadoFx() {
    const layer = $("#fxLayer");
    if (!layer) return;

    if (fxRafId) {
      cancelAnimationFrame(fxRafId);
      fxRafId = null;
    }
    if (fxStopTimer) {
      clearTimeout(fxStopTimer);
      fxStopTimer = null;
    }
    layer.innerHTML = "";

    const width = window.innerWidth;
    const height = window.innerHeight;
    const fromLeft = Math.random() < 0.5;
    const tornadoYBase = height * (0.84 + Math.random() * 0.08);
    const tornadoStartX = fromLeft ? -140 : width + 140;
    const swirlDir = fromLeft ? 1 : -1;
    let tornadoDirX = fromLeft ? 1 : -1;

    const tornado = document.createElement("div");
    tornado.className = "fx-tornado";
    tornado.style.left = `${tornadoStartX}px`;
    tornado.style.top = `${tornadoYBase}px`;
    layer.appendChild(tornado);

    const hitbox = document.createElement("div");
    hitbox.className = "fx-hitbox";
    hitbox.style.left = `${tornadoStartX}px`;
    hitbox.style.top = `${tornadoYBase}px`;
    layer.appendChild(hitbox);

    const count = 28;
    const tractors = [];
    const bottomPad = 16;
    const span = Math.max(100, width - 80);

    function randomTractorFilter() {
      const hue = Math.floor(Math.random() * 360);
      const sat = (1.1 + Math.random() * 1.3).toFixed(2);
      const bright = (0.9 + Math.random() * 0.45).toFixed(2);
      return `hue-rotate(${hue}deg) saturate(${sat}) brightness(${bright})`;
    }

    for (let i = 0; i < count; i++) {
      const el = document.createElement("span");
      el.className = "fx-tractor";
      el.textContent = "🚜";
      const size = 18 + Math.random() * 18;
      el.style.fontSize = `${size}px`;
      el.style.filter = randomTractorFilter();
      layer.appendChild(el);
      const lane = count === 1 ? 0.5 : i / (count - 1);
      const baseX = 40 + lane * span + (Math.random() - 0.5) * 28;
      const floorY = height - bottomPad - size - Math.random() * 12;
      tractors.push({
        el,
        x: baseX,
        y: floorY + 20 + Math.random() * 16,
        floorY,
        size,
        vx: (Math.random() - 0.5) * 0.22,
        vy: -(0.08 + Math.random() * 0.22),
        role: Math.random() < 0.22
          ? "far"
          : Math.random() < 0.5
            ? "trapped"
            : Math.random() < 0.75
              ? "ahead"
              : "normal",
        burstDone: false,
        inHitFrames: 0,
        coreDetectedAt: null,
        bornLag: Math.random() * 420
      });
    }

    const start = performance.now();
    const tornadoStartsAt = 1400;
    const minRunMs = 11000 + Math.random() * 10000;
    const maxRunMs = minRunMs + 24000;
    const hitHalfSize = 185;
    const gravity = 0.012;
    const tornadoSpeed = 0.7 + Math.random() * 0.55;
    const tornadoEdgePad = 170;
    const yBobAmp = 9;
    let tornadoX = tornadoStartX;
    let tornadoY = tornadoYBase;
    let nextFlipAt = tornadoStartsAt + 1800 + Math.random() * 2800;
    let ending = false;
    let endingStartedAt = 0;
    const fadeOutMs = 1000;

    function isTractorOnScreen(t) {
      return t.x > -80 && t.x < width + 80 && t.y > -80 && t.y < height + 80;
    }

    function frame(now) {
      const elapsed = now - start;
      const dt = 1;
      if (elapsed > tornadoStartsAt) {
        tornado.classList.add("active");
        hitbox.classList.add("active");

        if (!ending) {
          tornadoX += tornadoDirX * tornadoSpeed * dt * 2.1;
          tornadoY = tornadoYBase + Math.sin(elapsed * 0.0075) * yBobAmp;

          if (tornadoX < -tornadoEdgePad) {
            tornadoX = -tornadoEdgePad;
            tornadoDirX = 1;
          } else if (tornadoX > width + tornadoEdgePad) {
            tornadoX = width + tornadoEdgePad;
            tornadoDirX = -1;
          }

          if (elapsed >= nextFlipAt) {
            if (Math.random() < 0.55) tornadoDirX *= -1;
            nextFlipAt = elapsed + 1700 + Math.random() * 3000;
          }
        }
      }

      const center = { x: tornadoX, y: tornadoY };
      tornado.style.left = `${center.x}px`;
      tornado.style.top = `${center.y}px`;
      hitbox.style.left = `${center.x}px`;
      hitbox.style.top = `${center.y}px`;

      let tractorsOnScreen = 0;

      for (const t of tractors) {
        if (elapsed < t.bornLag) continue;

        if (elapsed <= tornadoStartsAt) {
          // Keep tractors lined up near the bottom until the tornado enters.
          t.vx += (Math.random() - 0.5) * 0.006;
          t.vx *= 0.94;
          t.vy += (t.floorY - t.y) * 0.05;
          t.vy *= 0.74;
        } else {
          const dx = center.x - t.x;
          const dy = center.y - t.y;
          const absDx = Math.abs(dx);
          const absDy = Math.abs(dy);
          const inSquareHitbox = absDx <= hitHalfSize && absDy <= hitHalfSize;

          if (inSquareHitbox) {
            t.inHitFrames += 1;
            const dist = Math.max(12, Math.hypot(dx, dy));
            const nx = dx / dist;
            const ny = dy / dist;
            const edgeFactor = Math.max(absDx, absDy) / hitHalfSize;
            const influence = 1 - edgeFactor;
            const trailingBehind = dx * tornadoDirX > 0;
            // Base pull/swirl only inside square hitbox.
            let pull = 0.08 * influence;
            let swirl = 0.12 * influence;
            let chaos = 0.02 * influence;
            let forwardKick = 0;

            // Chaotic behavior profiles.
            if (t.role === "far") {
              pull *= 0.8;
              swirl *= 1.7;
              chaos *= 1.7;
              if (!t.burstDone && influence > 0.45) {
                // One strong launch can fling some tractors far away.
                t.vx += tornadoDirX * (0.7 + Math.random() * 0.8);
                t.vy -= 0.35 + Math.random() * 0.45;
                t.burstDone = true;
              }
            } else if (t.role === "trapped") {
              // Keep some tractors locked near the tornado core.
              pull *= 1.9;
              swirl *= 0.8;
              chaos *= 0.5;
              if (dist < 70) {
                t.vx *= 0.86;
                t.vy *= 0.86;
              }
            } else if (t.role === "ahead") {
              // Throw some tractors in front of tornado travel.
              pull *= 0.9;
              swirl *= 1.05;
              chaos *= 1.1;
              forwardKick = (0.05 + Math.random() * 0.07) * influence;
            }

            // If trailing behind too long, eject forward to avoid a chained look.
            if (trailingBehind) {
              pull *= 0.72;
              swirl *= 0.9;
              t.vx += tornadoDirX * (0.02 + 0.06 * influence);
              if (t.inHitFrames > 20) {
                t.vx += tornadoDirX * (0.42 + Math.random() * 0.34);
                t.vy -= 0.08 + Math.random() * 0.2;
                t.inHitFrames = 0;
              }
            }

            // Core ejection: if detected in center, eject after 1 second.
            if (dist < 56) {
              if (t.coreDetectedAt == null) {
                t.coreDetectedAt = elapsed;
              }
            } else {
              t.coreDetectedAt = null;
            }

            if (t.coreDetectedAt != null && elapsed - t.coreDetectedAt >= 1000) {
              const eject = 1.25 + Math.random() * 1.05;
              t.vx += (-nx) * eject + tornadoDirX * 0.42;
              t.vy += (-ny) * eject - (0.32 + Math.random() * 0.34);
              t.inHitFrames = 0;
              t.coreDetectedAt = null;
            }

            t.vx += nx * pull + (-ny) * swirl * swirlDir;
            t.vy += ny * pull + nx * swirl * swirlDir;
            t.vx += tornadoDirX * forwardKick;

            // Storm turbulence while inside hitbox.
            t.vx += (Math.random() - 0.5) * chaos;
            t.vy += (Math.random() - 0.5) * chaos;

            const damp = t.role === "trapped" ? 0.965 : 0.976;
            t.vx *= damp;
            t.vy *= damp;
          } else {
            t.inHitFrames = 0;
            t.coreDetectedAt = null;
            // Outside hitbox: keep momentum while airborne, settle only near ground.
            const airborne = t.y < t.floorY - 4 || t.vy < -0.02;
            if (airborne) {
              t.vy += gravity;
              t.vx *= 0.992;
              t.vy *= 0.998;
            } else {
              t.vx *= 0.9;
              t.vy += (t.floorY - t.y) * 0.06;
              t.vy *= 0.7;
            }
          }
        }

        t.x += t.vx * dt * 2.35;
        t.y += t.vy * dt * 2.35;
        const maxY = height - bottomPad - t.size;
        if (t.y > maxY) {
          t.y = maxY;
          if (Math.abs(t.vy) > 0.12) {
            // Small bounce so landing feels physical rather than hard-clamped.
            t.vy = -Math.abs(t.vy) * 0.35;
            t.vx *= 0.96;
          } else {
            t.vy = 0;
          }
        }
        if (isTractorOnScreen(t)) tractorsOnScreen += 1;

        let tractorOpacity = 1;
        if (ending) {
          const p = Math.min(1, (elapsed - endingStartedAt) / fadeOutMs);
          tractorOpacity = 1 - p;
        }
        t.el.style.opacity = String(Math.max(0, Math.min(1, tractorOpacity)));
        t.el.style.transform = `translate(${t.x}px, ${t.y}px)`;
      }

      if (!ending && elapsed > minRunMs && tractorsOnScreen === 0) {
        ending = true;
        endingStartedAt = elapsed;
      }
      if (!ending && elapsed > maxRunMs) {
        ending = true;
        endingStartedAt = elapsed;
      }

      let tornadoOpacity = 1;
      if (ending) {
        const p = Math.min(1, (elapsed - endingStartedAt) / fadeOutMs);
        tornadoOpacity = 1 - p;
      }
      tornado.style.opacity = String(Math.max(0, Math.min(1, tornadoOpacity)));
      hitbox.style.opacity = "0";

      if (!ending || elapsed - endingStartedAt < fadeOutMs) {
        fxRafId = requestAnimationFrame(frame);
      } else {
        layer.innerHTML = "";
        fxRafId = null;
      }
    }

    fxRafId = requestAnimationFrame(frame);
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
