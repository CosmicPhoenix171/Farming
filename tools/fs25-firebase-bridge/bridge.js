"use strict";

const fs = require("fs");
const path = require("path");
const chokidar = require("chokidar");
const admin = require("firebase-admin");
require("dotenv").config();

const REQUIRED_ENV = [
  "SERVICE_ACCOUNT_PATH",
  "FIREBASE_DATABASE_URL",
  "FS25_SNAPSHOT_PATH"
];

for (const key of REQUIRED_ENV) {
  if (!process.env[key] || !process.env[key].trim()) {
    console.error(`[bridge] Missing required env var: ${key}`);
    process.exit(1);
  }
}

const SERVICE_ACCOUNT_PATH = path.resolve(process.env.SERVICE_ACCOUNT_PATH);
const FIREBASE_DATABASE_URL = process.env.FIREBASE_DATABASE_URL;
const FS25_SNAPSHOT_PATH = path.resolve(process.env.FS25_SNAPSHOT_PATH);
const FIREBASE_PRICES_PATH = (process.env.FIREBASE_PRICES_PATH || "fs25/livePrices").replace(/^\/+|\/+$/g, "");
const VERBOSE = String(process.env.VERBOSE || "false").toLowerCase() === "true";

if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
  console.error(`[bridge] Service account file not found: ${SERVICE_ACCOUNT_PATH}`);
  process.exit(1);
}

const serviceAccount = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, "utf8"));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: FIREBASE_DATABASE_URL
});

const db = admin.database();
const targetRef = db.ref(FIREBASE_PRICES_PATH);

let uploadInFlight = false;
let uploadQueued = false;

function normalizePayload(raw) {
  // Accept either object or array snapshots from your FS25 exporter.
  // We add standard metadata for clients.
  const nowIso = new Date().toISOString();
  const unixMs = Date.now();

  if (Array.isArray(raw)) {
    return {
      updatedAt: nowIso,
      updatedAtMs: unixMs,
      source: "fs25-server",
      prices: raw
    };
  }

  if (raw && typeof raw === "object") {
    return {
      updatedAt: nowIso,
      updatedAtMs: unixMs,
      source: "fs25-server",
      ...raw
    };
  }

  throw new Error("Snapshot must be a JSON object or array");
}

async function uploadSnapshot(reason) {
  if (uploadInFlight) {
    uploadQueued = true;
    return;
  }

  uploadInFlight = true;
  try {
    const text = fs.readFileSync(FS25_SNAPSHOT_PATH, "utf8");
    const parsed = JSON.parse(text);
    const payload = normalizePayload(parsed);

    await targetRef.set(payload);

    const count = Array.isArray(payload.prices)
      ? payload.prices.length
      : Array.isArray(payload.items)
        ? payload.items.length
        : undefined;

    if (VERBOSE) {
      console.log(`[bridge] Uploaded (${reason}) to /${FIREBASE_PRICES_PATH} at ${payload.updatedAt}`);
      if (count != null) console.log(`[bridge] Entries: ${count}`);
    } else {
      console.log(`[bridge] Uploaded (${reason}) at ${payload.updatedAt}`);
    }
  } catch (err) {
    console.error(`[bridge] Upload failed (${reason}):`, err.message);
  } finally {
    uploadInFlight = false;
    if (uploadQueued) {
      uploadQueued = false;
      setTimeout(() => uploadSnapshot("queued"), 50);
    }
  }
}

if (!fs.existsSync(FS25_SNAPSHOT_PATH)) {
  console.warn(`[bridge] Snapshot file not found yet: ${FS25_SNAPSHOT_PATH}`);
  console.warn("[bridge] Waiting for file to appear...");
}

const watcher = chokidar.watch(FS25_SNAPSHOT_PATH, {
  ignoreInitial: false,
  awaitWriteFinish: {
    stabilityThreshold: 350,
    pollInterval: 80
  }
});

watcher
  .on("add", () => uploadSnapshot("file-added"))
  .on("change", () => uploadSnapshot("file-changed"))
  .on("error", (err) => console.error("[bridge] Watcher error:", err.message));

console.log("[bridge] FS25 Firebase bridge started");
console.log(`[bridge] Watching: ${FS25_SNAPSHOT_PATH}`);
console.log(`[bridge] Writing to: ${FIREBASE_DATABASE_URL}/${FIREBASE_PRICES_PATH}`);

process.on("SIGINT", async () => {
  console.log("\n[bridge] Stopping...");
  try {
    await watcher.close();
  } catch (_) {
    // no-op
  }
  process.exit(0);
});
