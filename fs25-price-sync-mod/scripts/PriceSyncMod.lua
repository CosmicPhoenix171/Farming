PriceSyncMod = {}

PriceSyncMod.modName = g_currentModName or "FS25_PriceSync"
PriceSyncMod.logPrefix = "[FS25-PriceSync] "
PriceSyncMod.defaultIntervalMs = 30000
PriceSyncMod.defaultFirebasePath = "https://farming-66ed6-default-rtdb.firebaseio.com/fs25/livePrices.json"
PriceSyncMod.defaultConfigName = "config.xml"
PriceSyncMod.defaultSnapshotName = "fs25-live-prices.json"

local function logInfo(msg)
  print(PriceSyncMod.logPrefix .. msg)
end

local function logWarn(msg)
  print(PriceSyncMod.logPrefix .. "WARN: " .. msg)
end

local function escapeJsonString(v)
  v = tostring(v or "")
  v = v:gsub("\\", "\\\\")
  v = v:gsub("\"", "\\\"")
  v = v:gsub("\n", "\\n")
  v = v:gsub("\r", "\\r")
  v = v:gsub("\t", "\\t")
  return v
end

local function encodeJson(value)
  local t = type(value)
  if t == "nil" then
    return "null"
  elseif t == "number" then
    return tostring(value)
  elseif t == "boolean" then
    return value and "true" or "false"
  elseif t == "string" then
    return "\"" .. escapeJsonString(value) .. "\""
  elseif t == "table" then
    local isArray = true
    local maxIndex = 0
    for k, _ in pairs(value) do
      if type(k) ~= "number" then
        isArray = false
        break
      end
      if k > maxIndex then maxIndex = k end
    end

    local out = {}
    if isArray then
      for i = 1, maxIndex do
        out[#out + 1] = encodeJson(value[i])
      end
      return "[" .. table.concat(out, ",") .. "]"
    end

    for k, v in pairs(value) do
      out[#out + 1] = "\"" .. escapeJsonString(k) .. "\":" .. encodeJson(v)
    end
    return "{" .. table.concat(out, ",") .. "}"
  end

  return "null"
end

function PriceSyncMod:loadMap(_)
  if g_server == nil then
    return
  end

  self.elapsedMs = 0
  self.intervalMs = PriceSyncMod.defaultIntervalMs
  self.enableFirebasePost = true
  self.firebaseUrl = PriceSyncMod.defaultFirebasePath
  self.snapshotPath = nil

  self:loadOrCreateConfig()
  logInfo("Started on server. Interval=" .. tostring(self.intervalMs) .. "ms")
end

function PriceSyncMod:deleteMap()
  if g_server ~= nil then
    logInfo("Stopped")
  end
end

function PriceSyncMod:update(dt)
  if g_server == nil then
    return
  end

  self.elapsedMs = self.elapsedMs + dt
  if self.elapsedMs < self.intervalMs then
    return
  end

  self.elapsedMs = 0
  self:exportAndSend()
end

function PriceSyncMod:loadOrCreateConfig()
  local userPath = getUserProfileAppPath() or ""
  local modSettingsDir = userPath .. "modSettings/FS25_PriceSync/"
  if not fileExists(modSettingsDir) then
    createFolder(modSettingsDir)
  end

  local configPath = modSettingsDir .. PriceSyncMod.defaultConfigName
  local snapshotPath = modSettingsDir .. PriceSyncMod.defaultSnapshotName

  if not fileExists(configPath) then
    local xml = createXMLFile("priceSyncConfig", configPath, "priceSync")
    setXMLInt(xml, "priceSync#intervalMs", PriceSyncMod.defaultIntervalMs)
    setXMLString(xml, "priceSync#firebaseUrl", PriceSyncMod.defaultFirebasePath)
    setXMLBool(xml, "priceSync#enableFirebasePost", true)
    setXMLString(xml, "priceSync#snapshotPath", snapshotPath)
    saveXMLFile(xml)
    delete(xml)
    logInfo("Created config: " .. configPath)
  end

  local xml = loadXMLFile("priceSyncConfig", configPath)
  if xml ~= nil then
    local interval = getXMLInt(xml, "priceSync#intervalMs")
    if interval ~= nil and interval >= 1000 then
      self.intervalMs = interval
    end

    local url = getXMLString(xml, "priceSync#firebaseUrl")
    if url ~= nil and url ~= "" then
      self.firebaseUrl = url
    end

    local enabled = getXMLBool(xml, "priceSync#enableFirebasePost")
    if enabled ~= nil then
      self.enableFirebasePost = enabled
    end

    local cfgSnapshot = getXMLString(xml, "priceSync#snapshotPath")
    if cfgSnapshot ~= nil and cfgSnapshot ~= "" then
      self.snapshotPath = cfgSnapshot
    else
      self.snapshotPath = snapshotPath
    end

    delete(xml)
  else
    self.snapshotPath = snapshotPath
  end
end

function PriceSyncMod:readPrice(fillTypeIndex)
  local econ = g_currentMission and g_currentMission.economyManager
  if econ == nil then
    return nil
  end

  local candidates = {
    "getPricePerLiter",      -- verify in FS25
    "getCostPerLiter",       -- verify in FS25
    "getMarketPrice"         -- verify in FS25
  }

  for _, fn in ipairs(candidates) do
    if type(econ[fn]) == "function" then
      local ok, value = pcall(econ[fn], econ, fillTypeIndex)
      if ok and type(value) == "number" then
        return value
      end
    end
  end

  return nil
end

function PriceSyncMod:buildPayload()
  local nowUnix = os.time()
  local nowIso = os.date("!%Y-%m-%dT%H:%M:%SZ", nowUnix)

  local entries = {}

  local fillTypes = nil
  if g_fillTypeManager ~= nil then
    fillTypes = g_fillTypeManager.fillTypes
  end

  if fillTypes ~= nil then
    for _, fillType in pairs(fillTypes) do
      local index = fillType.index
      if index ~= nil then
        local avg = self:readPrice(index)
        if avg ~= nil then
          local low = math.floor(avg * 0.9)
          local high = math.floor(avg * 1.1)
          entries[#entries + 1] = {
            fillTypeName = fillType.name or ("fillType_" .. tostring(index)),
            fillTypeIndex = index,
            crop = fillType.title or fillType.name,
            lowPrice = low,
            highPrice = high,
            avgPrice = math.floor(avg)
          }
        end
      end
    end
  else
    logWarn("FillType manager not available")
  end

  return {
    updatedAt = nowIso,
    updatedAtMs = nowUnix * 1000,
    source = "fs25-server-mod",
    mapName = g_currentMission and g_currentMission.missionInfo and g_currentMission.missionInfo.mapId or "unknown",
    entries = entries
  }
end

function PriceSyncMod:writeSnapshot(jsonText)
  if self.snapshotPath == nil or self.snapshotPath == "" then
    return
  end

  local f, err = io.open(self.snapshotPath, "w")
  if f == nil then
    logWarn("Failed to open snapshot for write: " .. tostring(err))
    return
  end

  f:write(jsonText)
  f:close()
end

function PriceSyncMod:tryFirebasePost(jsonText)
  if not self.enableFirebasePost then
    return
  end

  if self.firebaseUrl == nil or self.firebaseUrl == "" then
    return
  end

  -- FS25/GIANTS HTTP API differs by version; this tries common request helpers.
  -- If unavailable, snapshot export still works and can be bridged externally.
  local posted = false

  if NetworkUtil ~= nil and type(NetworkUtil.httpRequest) == "function" then
    local ok = pcall(NetworkUtil.httpRequest, self.firebaseUrl, "PUT", "application/json", jsonText)
    posted = posted or ok
  end

  if not posted and g_masterServerConnection ~= nil and type(g_masterServerConnection.sendHTTPRequest) == "function" then
    local ok = pcall(g_masterServerConnection.sendHTTPRequest, g_masterServerConnection, self.firebaseUrl, "PUT", jsonText, "application/json")
    posted = posted or ok
  end

  if not posted then
    logWarn("Direct HTTP post helper not available in this runtime. Using snapshot file only.")
  end
end

function PriceSyncMod:exportAndSend()
  local payload = self:buildPayload()
  local count = payload.entries and #payload.entries or 0
  local jsonText = encodeJson(payload)

  self:writeSnapshot(jsonText)
  self:tryFirebasePost(jsonText)

  logInfo("Exported prices: " .. tostring(count) .. " entries")
end

addModEventListener(PriceSyncMod)
