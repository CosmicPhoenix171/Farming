/* ============================================================
   FS25 Crop Tracker - Firebase Realtime Database sync (optional)
   Uses Firebase Web SDK compat build for no-bundler setup.
   ============================================================ */
(function () {
  const config = {
    apiKey: "AIzaSyA7pBKRbIJz5NLsYxU75HPKaeVkh1eAWVM",
    authDomain: "farming-66ed6.firebaseapp.com",
    databaseURL: "https://farming-66ed6-default-rtdb.firebaseio.com",
    projectId: "farming-66ed6",
    storageBucket: "farming-66ed6.firebasestorage.app",
    messagingSenderId: "351178881148",
    appId: "1:351178881148:web:bb28c8fa9e18e0f464f1f9",
    measurementId: "G-NTZCZWL8EV"
  };

  const DB_PATH = "powerstarCropTrackerFS25/crops";
  const LIVE_PRICES_PATH = "fs25/livePrices";

  function canUseFirebase() {
    return typeof window !== "undefined" && window.firebase && window.firebase.database;
  }

  function getStatusEl() {
    return document.getElementById("syncStatus");
  }

  function setStatus(text, kind) {
    const el = getStatusEl();
    if (!el) return;
    el.textContent = text;
    el.classList.remove("ok", "warn", "err");
    if (kind) el.classList.add(kind);
  }

  async function init() {
    if (!canUseFirebase()) {
      setStatus("Local only", "warn");
      return null;
    }

    try {
      const app = window.firebase.apps.length
        ? window.firebase.app()
        : window.firebase.initializeApp(config);
      const db = app.database();
      setStatus("Cloud sync ready", "ok");
      return db;
    } catch (e) {
      console.warn("[fs25] Firebase init failed:", e);
      setStatus("Sync error", "err");
      return null;
    }
  }

  const api = {
    enabled: false,
    _db: null,
    _ref: null,
    _unsubscribe: null,
    _liveRef: null,
    _unsubscribeLive: null,
    ready: Promise.resolve(),

    async loadCrops() {
      if (!this._db) return null;
      try {
        setStatus("Syncing down...", "warn");
        const snap = await this._db.ref(DB_PATH).get();
        if (!snap.exists()) {
          setStatus("Cloud empty", "warn");
          return null;
        }
        const value = snap.val();
        if (!Array.isArray(value)) {
          setStatus("Cloud format issue", "err");
          return null;
        }
        setStatus("Cloud synced", "ok");
        return value;
      } catch (e) {
        console.warn("[fs25] cloud load failed:", e);
        setStatus("Sync read failed", "err");
        return null;
      }
    },

    async saveCrops(crops) {
      if (!this._db) return false;
      try {
        await this._db.ref(DB_PATH).set(crops);
        setStatus("Cloud synced", "ok");
        return true;
      } catch (e) {
        console.warn("[fs25] cloud save failed:", e);
        setStatus("Sync write failed", "err");
        return false;
      }
    },

    subscribeCrops(onChange) {
      if (!this._db || typeof onChange !== "function") return () => {};
      if (this._unsubscribe) this._unsubscribe();

      const ref = this._db.ref(DB_PATH);
      this._ref = ref;
      const handler = (snap) => {
        if (!snap.exists()) {
          setStatus("Cloud empty", "warn");
          onChange(null);
          return;
        }
        const value = snap.val();
        if (!Array.isArray(value)) {
          setStatus("Cloud format issue", "err");
          onChange(null);
          return;
        }
        setStatus("Live synced", "ok");
        onChange(value);
      };
      const errorHandler = (e) => {
        console.warn("[fs25] cloud subscribe failed:", e);
        setStatus("Live sync failed", "err");
      };

      ref.on("value", handler, errorHandler);
      this._unsubscribe = () => ref.off("value", handler);
      return this._unsubscribe;
    },

    subscribeLivePrices(onChange) {
      if (!this._db || typeof onChange !== "function") return () => {};
      if (this._unsubscribeLive) this._unsubscribeLive();

      const ref = this._db.ref(LIVE_PRICES_PATH);
      this._liveRef = ref;

      const toEntries = (value) => {
        if (!value) return [];
        if (Array.isArray(value)) return value;
        if (Array.isArray(value.entries)) return value.entries;
        if (Array.isArray(value.prices)) return value.prices;
        if (Array.isArray(value.items)) return value.items;
        if (value.byCrop && typeof value.byCrop === "object") {
          return Object.entries(value.byCrop).map(([crop, v]) => ({ crop, ...(v || {}) }));
        }
        // Support map-like payloads keyed by crop name.
        if (typeof value === "object") {
          const metaKeys = new Set(["updatedAt", "updatedAtMs", "source", "entries", "prices", "items", "byCrop"]);
          const keys = Object.keys(value).filter(k => !metaKeys.has(k));
          if (keys.length) return keys.map(k => ({ crop: k, ...(value[k] || {}) }));
        }
        return [];
      };

      const handler = (snap) => {
        if (!snap.exists()) {
          onChange({ entries: [], updatedAtMs: Date.now() });
          return;
        }
        const value = snap.val();
        const entries = toEntries(value);
        const updatedAtMs = Number(value && value.updatedAtMs) || Date.now();
        setStatus("Live prices synced", "ok");
        onChange({ entries, updatedAtMs });
      };
      const errorHandler = (e) => {
        console.warn("[fs25] live prices subscribe failed:", e);
        setStatus("Price sync failed", "err");
      };

      ref.on("value", handler, errorHandler);
      this._unsubscribeLive = () => ref.off("value", handler);
      return this._unsubscribeLive;
    }
  };

  window.FirebaseSync = api;

  api.ready = init().then(db => {
    api._db = db;
    api.enabled = !!db;
    return api;
  });
})();
