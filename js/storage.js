/* ============================================================
   FS25 Crop Tracker - localStorage + import/export helpers
   ============================================================ */
(function () {
  const STORAGE_KEY = "fs25_crops_v1";

  function loadCrops() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return clone(window.DEFAULT_CROPS);
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return clone(window.DEFAULT_CROPS);
      return parsed.map(normalize);
    } catch (e) {
      console.warn("[fs25] failed to load crops:", e);
      return clone(window.DEFAULT_CROPS);
    }
  }

  function saveCrops(crops) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(crops));
    } catch (e) {
      console.warn("[fs25] failed to save crops:", e);
    }
  }

  function resetCrops() {
    localStorage.removeItem(STORAGE_KEY);
    return clone(window.DEFAULT_CROPS);
  }

  function clone(arr) {
    return JSON.parse(JSON.stringify(arr));
  }

  function normalize(c) {
    const normalized = {
      crop: String(c.crop || "Unnamed"),
      monthsToGrow: Number(c.monthsToGrow) || 1,
      yieldPerSquareAcre: Number(c.yieldPerSquareAcre) || 0,
      acreStrawYield: c.acreStrawYield == null || c.acreStrawYield === "" ? null : Number(c.acreStrawYield),
      // sell prices are stored as per 1,000 units
      lowSellPrice: c.lowSellPrice == null || c.lowSellPrice === "" ? null : Number(c.lowSellPrice),
      highSellPrice: c.highSellPrice == null || c.highSellPrice === "" ? null : Number(c.highSellPrice),
      manualPriceOverrideAt: c.manualPriceOverrideAt == null || c.manualPriceOverrideAt === "" ? null : Number(c.manualPriceOverrideAt),
      playerYieldInput: !!c.playerYieldInput,
      type: c.type || "other",
      notes: c.notes || "",
      // future-ready fields preserved if present
      pricePerUnit: c.pricePerUnit,
      seedCostPerAcre: c.seedCostPerAcre,
      fertilizerCostPerAcre: c.fertilizerCostPerAcre,
      productionChainValue: c.productionChainValue,
      economyMultiplier: c.economyMultiplier
    };
    if (c.maxMonthsToGrow != null && c.maxMonthsToGrow !== "") {
      normalized.maxMonthsToGrow = Number(c.maxMonthsToGrow);
    }
    return normalized;
  }

  function exportJson(crops) {
    const blob = new Blob([JSON.stringify(crops, null, 2)], { type: "application/json" });
    downloadBlob(blob, "fs25-crops.json");
  }

  function exportCsv(crops) {
    const headers = [
      "crop", "monthsToGrow", "maxMonthsToGrow", "yieldPerSquareAcre",
      "acreStrawYield", "harvestsPerYear", "yearlyYield", "yearlyStraw",
      "lowSellPrice", "highSellPrice", "pricePointCategory", "type", "notes"
    ];
    const rows = crops.map(c => {
      const h = Math.floor(12 / c.monthsToGrow);
      const avgPrice = c.lowSellPrice != null && c.highSellPrice != null
        ? (c.lowSellPrice + c.highSellPrice) / 2
        : (c.highSellPrice ?? c.lowSellPrice ?? null);
      const pricePointCategory = avgPrice == null
        ? "Unknown"
        : avgPrice < 1000
          ? "Low"
          : avgPrice < 2500
            ? "Mid"
            : avgPrice < 4500
              ? "High"
              : "Premium";
      return [
        c.crop, c.monthsToGrow, c.maxMonthsToGrow ?? "",
        c.yieldPerSquareAcre, c.acreStrawYield ?? "",
        h, c.yieldPerSquareAcre * h,
        c.acreStrawYield ? c.acreStrawYield * h : "",
        c.lowSellPrice ?? "", c.highSellPrice ?? "", pricePointCategory,
        c.type, c.notes
      ];
    });
    const csv = [headers, ...rows]
      .map(r => r.map(csvEscape).join(","))
      .join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    downloadBlob(blob, "fs25-crops.csv");
  }

  function csvEscape(v) {
    if (v == null) return "";
    const s = String(v);
    if (/[",\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function downloadBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
      a.remove();
    }, 0);
  }

  function importJsonFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = JSON.parse(reader.result);
          if (!Array.isArray(data)) throw new Error("JSON must be an array of crops");
          resolve(data.map(normalize));
        } catch (e) {
          reject(e);
        }
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });
  }

  window.CropStore = {
    load: loadCrops,
    save: saveCrops,
    reset: resetCrops,
    exportJson,
    exportCsv,
    importJsonFile,
    normalize
  };
})();
