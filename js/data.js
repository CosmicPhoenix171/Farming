/* ============================================================
   FS25 Crop Tracker - default crop data
   Schema (one crop):
   {
     crop: string,
     monthsToGrow: number,            // min growth time
     maxMonthsToGrow?: number,        // optional max (e.g. grass)
     yieldPerSquareAcre: number,
     acreStrawYield: number | null,
     type: string,                    // grain, root, vegetable, fruit, forage, oilseed, fiber, tree, other
     notes: string,
     // future-ready fields (unused now but reserved):
     pricePerUnit?: number,
     seedCostPerAcre?: number,
     fertilizerCostPerAcre?: number,
     productionChainValue?: number,
     economyMultiplier?: number
   }
   ============================================================ */
window.DEFAULT_CROPS = [
  { crop: "Barley",         monthsToGrow: 7, yieldPerSquareAcre: 3885,  acreStrawYield: 14892, type: "grain",     notes: "Straw crop" },
  { crop: "Barley Swath",   monthsToGrow: 7, yieldPerSquareAcre: 4856,  acreStrawYield: 18616, type: "grain",     notes: "Swath version" },
  { crop: "Canola",         monthsToGrow: 8, yieldPerSquareAcre: 2347,  acreStrawYield: 14892, type: "oilseed",   notes: "" },
  { crop: "Canola Swath",   monthsToGrow: 8, yieldPerSquareAcre: 2934,  acreStrawYield: 18616, type: "oilseed",   notes: "Swath version" },
  { crop: "Carrot",         monthsToGrow: 4, yieldPerSquareAcre: 31161, acreStrawYield: null,  type: "root",      notes: "" },
  { crop: "Corn",           monthsToGrow: 6, yieldPerSquareAcre: 3723,  acreStrawYield: null,  type: "grain",     notes: "" },
  { crop: "Corn Silage",    monthsToGrow: 6, yieldPerSquareAcre: 29056, acreStrawYield: null,  type: "forage",    notes: "Silage crop" },
  { crop: "Cotton",         monthsToGrow: 8, yieldPerSquareAcre: 2011,  acreStrawYield: null,  type: "fiber",     notes: "" },
  { crop: "Grape",          monthsToGrow: 5, yieldPerSquareAcre: 3723,  acreStrawYield: null,  type: "fruit",     notes: "" },
  { crop: "Grass",          monthsToGrow: 2, maxMonthsToGrow: 3, yieldPerSquareAcre: 17685, acreStrawYield: null, type: "forage", notes: "Harvest min at 2 months, max at 3 months" },
  { crop: "Grass Silage",   monthsToGrow: 2, maxMonthsToGrow: 3, yieldPerSquareAcre: 17685, acreStrawYield: null, type: "forage", notes: "Silage version" },
  { crop: "Greenbean",      monthsToGrow: 4, yieldPerSquareAcre: 2823,  acreStrawYield: null,  type: "vegetable", notes: "" },
  { crop: "Hay",            monthsToGrow: 2, maxMonthsToGrow: 3, yieldPerSquareAcre: 17685, acreStrawYield: null, type: "forage", notes: "Grass/hay crop" },
  { crop: "Oat",            monthsToGrow: 4, yieldPerSquareAcre: 2307,  acreStrawYield: 14892, type: "grain",     notes: "Straw crop" },
  { crop: "Oat Swath",      monthsToGrow: 4, yieldPerSquareAcre: 2883,  acreStrawYield: 18616, type: "grain",     notes: "Swath version" },
  { crop: "Olive",          monthsToGrow: 4, yieldPerSquareAcre: 3723,  acreStrawYield: null,  type: "fruit",     notes: "" },
  { crop: "Parsnip",        monthsToGrow: 4, yieldPerSquareAcre: 28126, acreStrawYield: null,  type: "root",      notes: "" },
  { crop: "Peas",           monthsToGrow: 4, yieldPerSquareAcre: 1942,  acreStrawYield: null,  type: "vegetable", notes: "" },
  { crop: "Poplar",         monthsToGrow: 12, yieldPerSquareAcre: 11412, acreStrawYield: null, type: "tree",      notes: "Long growth crop" },
  { crop: "Potatoes",       monthsToGrow: 5, yieldPerSquareAcre: 16714, acreStrawYield: null,  type: "root",      notes: "" },
  { crop: "Red Beets",      monthsToGrow: 4, yieldPerSquareAcre: 23391, acreStrawYield: null,  type: "root",      notes: "" },
  { crop: "Rice",           monthsToGrow: 4, yieldPerSquareAcre: 2671,  acreStrawYield: null,  type: "grain",     notes: "" },
  { crop: "Rice Long Grain",monthsToGrow: 5, yieldPerSquareAcre: 3642,  acreStrawYield: null,  type: "grain",     notes: "" },
  { crop: "Sorghum",        monthsToGrow: 4, yieldPerSquareAcre: 3318,  acreStrawYield: null,  type: "grain",     notes: "" },
  { crop: "Soybean",        monthsToGrow: 6, yieldPerSquareAcre: 1821,  acreStrawYield: null,  type: "oilseed",   notes: "" },
  { crop: "Soybean Swath",  monthsToGrow: 6, yieldPerSquareAcre: 2276,  acreStrawYield: null,  type: "oilseed",   notes: "Swath version" },
  { crop: "Spinach",        monthsToGrow: 3, yieldPerSquareAcre: 9348,  acreStrawYield: null,  type: "vegetable", notes: "" },
  { crop: "Sugar Beet",     monthsToGrow: 7, yieldPerSquareAcre: 23391, acreStrawYield: null,  type: "root",      notes: "" },
  { crop: "Sugar Beet Cut", monthsToGrow: 7, yieldPerSquareAcre: 23391, acreStrawYield: null,  type: "root",      notes: "Cut version" },
  { crop: "Sugarcane",      monthsToGrow: 7, yieldPerSquareAcre: 45891, acreStrawYield: null,  type: "grain",     notes: "" },
  { crop: "Sunflower",      monthsToGrow: 7, yieldPerSquareAcre: 2104,  acreStrawYield: null,  type: "oilseed",   notes: "" },
  { crop: "Wheat",          monthsToGrow: 7, yieldPerSquareAcre: 3602,  acreStrawYield: 14892, type: "grain",     notes: "Straw crop" },
  { crop: "Wheat Swath",    monthsToGrow: 7, yieldPerSquareAcre: 4502,  acreStrawYield: 18616, type: "grain",     notes: "Swath version" }
];
