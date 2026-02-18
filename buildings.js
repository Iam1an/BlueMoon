import {
  TILE_WIDTH, TILE_HEIGHT, GRID_SIZE,
  BUILDING_TYPES, BUILDING_FRAMES, BUILD_TIME_BASE, SALVAGE_TIME_BASE,
  STARTING_POP_CAP,
  OXYGEN_PER_SETTLER, FOOD_PER_SETTLER, WATER_PER_SETTLER,
  DEPLETION_INTERVAL,
  SHIELD_RADIUS, STORM_INTERVAL, STORM_WRECKAGE_MIN, STORM_WRECKAGE_MAX,
  RECIPES, TECH_TREE, CROP_TYPES, WRECKAGE_LOOT,
  resources, storageCap, state
} from "./state.js";
import { unassignSettler } from "./settlers.js";

const STORAGE_RAW_KEYS = ["iron", "copper", "sand", "aluminum", "stone", "carbon", "sulfur", "silicon", "shieldCrystal", "diamond", "tungsten"];
const STORAGE_COMPOUND_KEYS = ["steel", "glass", "plastic", "electronics"];

// ==============================
// DRAW ISOMETRIC BOX
// ==============================
export function drawIsoBox(gfx, cx, cy, color, height, alpha) {
  alpha = alpha || 1;
  const hw = TILE_WIDTH / 2 - 2;
  const hh = TILE_HEIGHT / 2 - 1;
  const h = height;

  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  const sideColor = ((r * 0.6) << 16) | ((g * 0.6) << 8) | (b * 0.6);
  const darkSideColor = ((r * 0.4) << 16) | ((g * 0.4) << 8) | (b * 0.4);

  gfx.fillStyle(color, alpha);
  gfx.beginPath();
  gfx.moveTo(cx, cy - hh - h);
  gfx.lineTo(cx + hw, cy - h);
  gfx.lineTo(cx, cy + hh - h);
  gfx.lineTo(cx - hw, cy - h);
  gfx.closePath();
  gfx.fillPath();

  gfx.fillStyle(sideColor, alpha);
  gfx.beginPath();
  gfx.moveTo(cx - hw, cy - h);
  gfx.lineTo(cx, cy + hh - h);
  gfx.lineTo(cx, cy + hh);
  gfx.lineTo(cx - hw, cy);
  gfx.closePath();
  gfx.fillPath();

  gfx.fillStyle(darkSideColor, alpha);
  gfx.beginPath();
  gfx.moveTo(cx + hw, cy - h);
  gfx.lineTo(cx, cy + hh - h);
  gfx.lineTo(cx, cy + hh);
  gfx.lineTo(cx + hw, cy);
  gfx.closePath();
  gfx.fillPath();
}

// ==============================
// CAN AFFORD
// ==============================
export function canAfford(type) {
  if (type === null) return false;
  const bt = BUILDING_TYPES[type];
  if (!bt) return false;
  for (const [res, amount] of Object.entries(bt.cost)) {
    if ((resources[res] || 0) < amount) return false;
  }
  return true;
}

// ==============================
// IS BUILDING UNLOCKED
// ==============================
export function isBuildingUnlocked(type) {
  const bt = BUILDING_TYPES[type];
  if (!bt) return false;
  if (!bt.requiresResearch) return true;
  return state.unlockedBuildings.includes(type);
}

// ==============================
// IS RECIPE UNLOCKED
// ==============================
export function isRecipeUnlocked(recipeKey) {
  const recipe = RECIPES[recipeKey];
  if (!recipe) return false;
  if (!recipe.requiresResearch) return true;
  return state.unlockedRecipes.includes(recipeKey);
}

// ==============================
// CHECK ADJACENCY REQUIREMENT
// ==============================
function checkAdjacency(b) {
  const bt = BUILDING_TYPES[b.type];
  if (!bt || !bt.requiresAdjacency) return true;

  const neighbors = [
    { x: b.x - 1, y: b.y },
    { x: b.x + 1, y: b.y },
    { x: b.x, y: b.y - 1 },
    { x: b.x, y: b.y + 1 }
  ];

  for (const n of neighbors) {
    if (n.x < 0 || n.x >= GRID_SIZE || n.y < 0 || n.y >= GRID_SIZE) continue;
    const neighbor = state.grid[n.x][n.y];
    if (neighbor && !neighbor.constructing && bt.requiresAdjacency.includes(neighbor.type)) {
      return true;
    }
  }
  return false;
}

// ==============================
// CHECK PLACEMENT ADJACENCY
// ==============================
export function canPlaceAtPosition(x, y, type) {
  const bt = BUILDING_TYPES[type];
  if (!bt || !bt.requiresAdjacency) return true;
  const neighbors = [
    { x: x - 1, y: y },
    { x: x + 1, y: y },
    { x: x, y: y - 1 },
    { x: x, y: y + 1 }
  ];
  for (const n of neighbors) {
    if (n.x < 0 || n.x >= GRID_SIZE || n.y < 0 || n.y >= GRID_SIZE) continue;
    const neighbor = state.grid[n.x][n.y];
    if (neighbor && bt.requiresAdjacency.includes(neighbor.type)) return true;
  }
  return false;
}

// ==============================
// PLACE BUILDING
// ==============================
export function placeBuilding(scene, x, y, type) {
  if (type === null) return false;
  if (state.grid[x][y] !== null) return false;
  if (!canAfford(type)) return false;
  if (!isBuildingUnlocked(type)) return false;
  if (!canPlaceAtPosition(x, y, type)) return false;

  const bt = BUILDING_TYPES[type];
  for (const [res, amount] of Object.entries(bt.cost)) {
    resources[res] -= amount;
  }

  const building = {
    type: type,
    x: x,
    y: y,
    active: true,
    constructing: true,
    buildProgress: 0,
    settlers: [],
    activeRecipe: null, // for fabrication workshops
    selectedCrop: type === "greenhouse" ? "basicAlgae" : null,
    batteryCharge: 0
  };

  state.grid[x][y] = building;
  state.buildings.push(building);

  redrawBuildings(scene);
  return true;
}

// ==============================
// DEMOLISH BUILDING
// ==============================
export function demolishBuilding(scene, x, y) {
  const building = state.grid[x][y];
  if (!building) return;
  if (building.type === "wreckage") return; // use salvage instead

  const bt = BUILDING_TYPES[building.type];

  // 50% refund
  for (const [res, amount] of Object.entries(bt.cost)) {
    const cap = storageCap[res] || Infinity;
    resources[res] = Math.min((resources[res] || 0) + Math.floor(amount / 2), cap);
  }

  if (building.type === "storage" && !building.constructing) {
    for (const key of STORAGE_RAW_KEYS) {
      storageCap[key] = Math.max(storageCap[key] - 25, 30);
      resources[key] = Math.min(resources[key] || 0, storageCap[key]);
    }
    for (const key of STORAGE_COMPOUND_KEYS) {
      storageCap[key] = Math.max(storageCap[key] - 15, 15);
      resources[key] = Math.min(resources[key] || 0, storageCap[key]);
    }
  }

  if (building.type === "home" && !building.constructing) {
    state.populationCap = Math.max(STARTING_POP_CAP, state.populationCap - 2);
  }

  for (const s of [...building.settlers]) {
    unassignSettler(s);
  }

  state.grid[x][y] = null;
  state.buildings = state.buildings.filter(b => b !== building);

  scene.solarSprites = scene.solarSprites.filter(s => {
    if (s.gridX === x && s.gridY === y) {
      s.sprite.destroy();
      return false;
    }
    return true;
  });

  state.selectedBuilding = null;
  redrawBuildings(scene);
}

// ==============================
// SPAWN WRECKAGE
// ==============================
export function spawnWreckage(scene, count) {
  let placed = 0;
  let attempts = 0;
  while (placed < count && attempts < count * 5) {
    attempts++;
    const x = 22 + Math.floor(Math.random() * 7);
    const y = 22 + Math.floor(Math.random() * 7);
    if (state.grid[x][y] !== null) continue;

    const wreckage = {
      type: "wreckage",
      x: x,
      y: y,
      active: false,
      constructing: false,
      buildProgress: 0,
      settlers: [],
      wreckageHeight: 6 + Math.floor(Math.random() * 8)
    };

    state.grid[x][y] = wreckage;
    state.buildings.push(wreckage);
    placed++;
  }
  redrawBuildings(scene);
}

// ==============================
// SALVAGE WRECKAGE
// ==============================
export function salvageWreckage(scene, x, y) {
  const obj = state.grid[x][y];
  if (!obj || obj.type !== "wreckage") return;
  if (obj.constructing) return; // already being salvaged

  obj.constructing = true;
  obj.buildProgress = 0;
  redrawBuildings(scene);
}

// ==============================
// CANCEL SALVAGE
// ==============================
export function cancelSalvage(scene, x, y) {
  const obj = state.grid[x][y];
  if (!obj || obj.type !== "wreckage" || !obj.constructing) return;

  for (const s of [...obj.settlers]) {
    unassignSettler(s);
  }
  obj.constructing = false;
  obj.buildProgress = 0;
  redrawBuildings(scene);
}

// ==============================
// PROCESS CONSTRUCTION
// ==============================
export function processConstruction(scene) {
  for (const b of state.buildings) {
    if (!b.constructing) continue;
    const numBuilders = b.settlers.filter(s => s.state === "building").length;
    if (numBuilders === 0) continue;

    const timeBase = b.type === "wreckage" ? SALVAGE_TIME_BASE : BUILD_TIME_BASE;
    b.buildProgress += numBuilders / timeBase;

    if (b.buildProgress >= 1) {
      b.buildProgress = 1;

      if (b.type === "wreckage") {
        // Salvage complete — give loot and remove
        for (const [res, range] of Object.entries(WRECKAGE_LOOT)) {
          if (range.chance !== undefined) {
            if (Math.random() < range.chance) {
              const amount = range.min + Math.floor(Math.random() * (range.max - range.min + 1));
              const cap = storageCap[res] || Infinity;
              resources[res] = Math.min((resources[res] || 0) + amount, cap);
            }
          } else {
            const amount = range.min + Math.floor(Math.random() * (range.max - range.min + 1));
            const cap = storageCap[res] || Infinity;
            resources[res] = Math.min((resources[res] || 0) + amount, cap);
          }
        }

        for (const s of [...b.settlers]) {
          unassignSettler(s);
        }
        state.grid[b.x][b.y] = null;
        state.buildings = state.buildings.filter(obj => obj !== b);
        if (state.selectedBuilding === b) state.selectedBuilding = null;
      } else {
        // Normal construction complete
        b.constructing = false;

        if (b.type === "storage") {
          for (const key of STORAGE_RAW_KEYS) storageCap[key] += 25;
          for (const key of STORAGE_COMPOUND_KEYS) storageCap[key] += 15;
        }
        if (b.type === "home") {
          state.populationCap += 2;
        }

        for (const s of [...b.settlers]) {
          unassignSettler(s);
        }
      }
    }
  }
}

// ==============================
// PROCESS FABRICATION
// ==============================
function processFabrication() {
  for (const b of state.buildings) {
    if (b.constructing || b.type !== "fabrication") continue;
    if (!b.active || !b.activeRecipe) continue;

    const recipe = RECIPES[b.activeRecipe];
    if (!recipe) continue;
    if (!isRecipeUnlocked(b.activeRecipe)) continue;

    // Check inputs available
    let canCraft = true;
    for (const [res, amount] of Object.entries(recipe.inputs)) {
      if ((resources[res] || 0) < amount) { canCraft = false; break; }
    }
    if (!canCraft) continue;

    // Settler production bonus
    const workers = b.settlers.filter(s => s.state === "working").length;
    const multiplier = 1 + (workers - 1) * 0.33;

    // Consume inputs
    for (const [res, amount] of Object.entries(recipe.inputs)) {
      resources[res] -= amount;
    }

    // Produce outputs
    for (const [res, amount] of Object.entries(recipe.outputs)) {
      const produced = amount * multiplier;
      const cap = storageCap[res] || Infinity;
      resources[res] = Math.min((resources[res] || 0) + produced, cap);
    }
  }
}

// ==============================
// IS CROP UNLOCKED
// ==============================
export function isCropUnlocked(cropKey) {
  const crop = CROP_TYPES[cropKey];
  if (!crop) return false;
  if (!crop.requiresResearch) return true;
  return state.unlockedCrops.includes(cropKey);
}

// ==============================
// PROCESS GREENHOUSE
// ==============================
function processGreenhouse() {
  for (const b of state.buildings) {
    if (b.constructing || b.type !== "greenhouse") continue;
    if (!b.active) continue;

    const cropKey = b.selectedCrop || "basicAlgae";
    const crop = CROP_TYPES[cropKey];
    if (!crop) continue;

    // Check crop resource requirements (e.g. water)
    let canProduce = true;
    for (const [res, amount] of Object.entries(crop.consumes)) {
      if ((resources[res] || 0) < amount) { canProduce = false; break; }
    }
    if (!canProduce) continue;

    // Worker multiplier
    const workerCount = b.settlers.filter(s => s.state === "working").length;
    const multiplier = 1 + (Math.max(workerCount, 1) - 1) * 0.33;

    // Consume crop inputs
    for (const [res, amount] of Object.entries(crop.consumes)) {
      resources[res] -= amount;
    }

    // Produce crop outputs
    for (const [res, amount] of Object.entries(crop.produces)) {
      const produced = amount * multiplier;
      const cap = storageCap[res] || Infinity;
      resources[res] = Math.min((resources[res] || 0) + produced, cap);
    }
  }
}

// ==============================
// PROCESS RESEARCH
// ==============================
export function processResearch() {
  if (!state.research.active) return;

  // Find an active research station with workers
  let hasWorkers = false;
  for (const b of state.buildings) {
    if (b.type === "researchStation" && !b.constructing && b.active) {
      const workers = b.settlers.filter(s => s.state === "working").length;
      if (workers > 0) {
        hasWorkers = true;
        break;
      }
    }
  }
  if (!hasWorkers) return;

  const tech = TECH_TREE[state.research.active];
  if (!tech) return;

  state.research.progress += 1 / tech.time;

  if (state.research.progress >= 1) {
    state.research.progress = 1;
    const techKey = state.research.active;

    state.research.completed.push(techKey);

    // Apply unlocks
    if (tech.unlocks.buildings) {
      state.unlockedBuildings.push(...tech.unlocks.buildings);
    }
    if (tech.unlocks.recipes) {
      state.unlockedRecipes.push(...tech.unlocks.recipes);
    }
    if (tech.unlocks.crops) {
      state.unlockedCrops.push(...tech.unlocks.crops);
    }

    state.research.active = null;
    state.research.progress = 0;
  }
}

// ==============================
// START RESEARCH
// ==============================
export function startResearch(techKey) {
  if (state.research.active) return false;
  if (state.research.completed.includes(techKey)) return false;

  const tech = TECH_TREE[techKey];
  if (!tech) return false;

  // Check prerequisites
  for (const req of tech.requires) {
    if (!state.research.completed.includes(req)) return false;
  }

  // Check cost
  for (const [res, amount] of Object.entries(tech.cost)) {
    if ((resources[res] || 0) < amount) return false;
  }

  // Pay cost
  for (const [res, amount] of Object.entries(tech.cost)) {
    resources[res] -= amount;
  }

  state.research.active = techKey;
  state.research.progress = 0;
  return true;
}

// ==============================
// PROCESS PRODUCTION
// ==============================
export function processProduction() {
  const activeBuildings = state.buildings.filter(b => !b.constructing && b.type !== "wreckage" && b.type !== "spaceship");

  // Determine which buildings are manned and connected
  for (const b of activeBuildings) {
    const bt = BUILDING_TYPES[b.type];
    if (!bt) continue;
    const manned = !bt.requiresSettlers || b.settlers.filter(s => s.state === "working").length > 0;
    const adjacent = checkAdjacency(b);
    b.active = manned && adjacent;
    b.notConnected = !adjacent && !!bt.requiresAdjacency;
  }

  // Fuel check (before power deficit pass): include fuel that active oil drills
  // will produce this tick so generators don't shut off while drills are running.
  let pendingFuel = resources.fuel || 0;
  for (const b of activeBuildings) {
    if (!b.active) continue;
    const bt = BUILDING_TYPES[b.type];
    if (bt && bt.produces.fuel) pendingFuel += bt.produces.fuel;
  }
  for (const b of activeBuildings) {
    if (!b.active) continue;
    const bt = BUILDING_TYPES[b.type];
    if (bt && bt.consumes.fuel) {
      if (pendingFuel >= bt.consumes.fuel) {
        pendingFuel -= bt.consumes.fuel;
      } else {
        b.active = false;
      }
    }
  }

  // Solar dimming factor based on time of day
  const solarFactor = Math.max(0.1, Math.sin(state.dayTime * Math.PI));

  // Calculate power
  let powerProduced = 0;
  let powerConsumed = 0;
  for (const b of activeBuildings) {
    if (!b.active) continue;
    const bt = BUILDING_TYPES[b.type];
    if (!bt) continue;
    if (bt.produces.power) {
      const factor = b.type === "solar" ? solarFactor : 1;
      powerProduced += bt.produces.power * factor;
    }
    if (bt.consumes.power) powerConsumed += bt.consumes.power;
  }
  state.powerBalance = Math.round(powerProduced - powerConsumed);

  // Battery discharge: cover deficit before deactivating buildings
  const batteries = activeBuildings.filter(b => b.type === "battery" && !b.constructing);
  if (state.powerBalance < 0) {
    let needed = -state.powerBalance;
    for (const bat of batteries) {
      const discharge = Math.min(bat.batteryCharge, needed);
      bat.batteryCharge -= discharge;
      needed -= discharge;
      powerProduced += discharge;
      if (needed <= 0) break;
    }
    state.powerBalance = Math.round(powerProduced - powerConsumed);
  }
  // Battery charge: store excess power
  else if (state.powerBalance > 0) {
    let excess = state.powerBalance;
    for (const bat of batteries) {
      const cap = BUILDING_TYPES.battery.batteryCapacity;
      const room = cap - bat.batteryCharge;
      const charge = Math.min(room, excess);
      bat.batteryCharge += charge;
      excess -= charge;
      if (excess <= 0) break;
    }
  }

  // Deactivate power consumers if deficit
  let deficit = state.powerBalance < 0 ? -state.powerBalance : 0;
  if (deficit > 0) {
    for (let i = activeBuildings.length - 1; i >= 0; i--) {
      if (deficit <= 0) break;
      const b = activeBuildings[i];
      const bt = BUILDING_TYPES[b.type];
      if (bt && bt.consumes.power && b.active) {
        b.active = false;
        deficit -= bt.consumes.power;
      }
    }
  }

  // Recalculate power
  powerProduced = 0;
  powerConsumed = 0;
  for (const b of activeBuildings) {
    if (!b.active) continue;
    const bt = BUILDING_TYPES[b.type];
    if (!bt) continue;
    if (bt.produces.power) {
      const factor = b.type === "solar" ? solarFactor : 1;
      powerProduced += bt.produces.power * factor;
    }
    if (bt.consumes.power) powerConsumed += bt.consumes.power;
  }
  state.powerBalance = Math.round(powerProduced - powerConsumed);

  // Second deficit pass
  deficit = state.powerBalance < 0 ? -state.powerBalance : 0;
  if (deficit > 0) {
    for (let i = activeBuildings.length - 1; i >= 0; i--) {
      if (deficit <= 0) break;
      const b = activeBuildings[i];
      if (!b.active) continue;
      const bt = BUILDING_TYPES[b.type];
      if (bt && bt.consumes.power) {
        b.active = false;
        deficit -= bt.consumes.power;
      }
    }
    powerProduced = 0;
    powerConsumed = 0;
    for (const b of activeBuildings) {
      if (!b.active) continue;
      const bt = BUILDING_TYPES[b.type];
      if (!bt) continue;
      if (bt.produces.power) {
        const factor = b.type === "solar" ? solarFactor : 1;
        powerProduced += bt.produces.power * factor;
      }
      if (bt.consumes.power) powerConsumed += bt.consumes.power;
    }
    state.powerBalance = Math.round(powerProduced - powerConsumed);
  }

  // Produce resources (not fabrication — that's separate)
  for (const b of activeBuildings) {
    if (!b.active) continue;
    if (b.type === "fabrication") continue; // handled by processFabrication
    if (b.type === "greenhouse") continue; // handled by processGreenhouse
    const bt = BUILDING_TYPES[b.type];
    if (!bt) continue;

    const workerCount = b.settlers.filter(s => s.state === "working").length;
    const multiplier = bt.requiresSettlers ? (1 + (Math.max(workerCount, 1) - 1) * 0.33) : 1;

    if (bt.consumes.fuel) {
      resources.fuel = Math.max(0, (resources.fuel || 0) - bt.consumes.fuel);
    }

    for (const [res, amount] of Object.entries(bt.produces)) {
      if (res === "power") continue;
      const produced = amount * multiplier;
      const cap = storageCap[res] || Infinity;
      resources[res] = Math.min((resources[res] || 0) + produced, cap);
    }
  }

  // Fabrication
  processFabrication();

  // Greenhouse crops
  processGreenhouse();

  // Research
  processResearch();

  resources.power = state.powerBalance;

  // Settler consumption — every DEPLETION_INTERVAL ticks
  state.depletionCounter++;
  if (state.depletionCounter % DEPLETION_INTERVAL === 0) {
    const pop = state.settlers.length;
    resources.oxygen = Math.max(0, resources.oxygen - pop * OXYGEN_PER_SETTLER);
    resources.food = Math.max(0, resources.food - pop * FOOD_PER_SETTLER);
    resources.water = Math.max(0, resources.water - pop * WATER_PER_SETTLER);
  }

  // Life support check
  state.lifeSupportCritical = resources.oxygen <= 0 || resources.food <= 0 || resources.water <= 0;
  if (state.lifeSupportCritical) {
    for (const b of activeBuildings) {
      const bt = BUILDING_TYPES[b.type];
      if (bt && bt.requiresSettlers) b.active = false;
    }
  }
}

// ==============================
// SHIELD PROTECTION HELPERS
// ==============================
export function getActiveShieldGenerators() {
  return state.buildings.filter(b =>
    b.type === "shieldGenerator" && !b.constructing && b.active
  );
}

export function getProtectedTiles() {
  const protectedSet = new Set();
  const generators = getActiveShieldGenerators();

  for (const gen of generators) {
    for (let dx = -SHIELD_RADIUS; dx <= SHIELD_RADIUS; dx++) {
      for (let dy = -SHIELD_RADIUS; dy <= SHIELD_RADIUS; dy++) {
        if (Math.abs(dx) + Math.abs(dy) > SHIELD_RADIUS) continue;
        const tx = gen.x + dx;
        const ty = gen.y + dy;
        if (tx >= 0 && tx < GRID_SIZE && ty >= 0 && ty < GRID_SIZE) {
          protectedSet.add(`${tx},${ty}`);
        }
      }
    }
  }
  return protectedSet;
}

// ==============================
// SPAWN STORM WRECKAGE
// ==============================
function spawnStormWreckage(count) {
  let placed = 0;
  let attempts = 0;
  while (placed < count && attempts < count * 10) {
    attempts++;
    const x = 15 + Math.floor(Math.random() * 20);
    const y = 15 + Math.floor(Math.random() * 20);
    if (state.grid[x][y] !== null) continue;

    const wreckage = {
      type: "wreckage",
      x: x,
      y: y,
      active: false,
      constructing: false,
      buildProgress: 0,
      settlers: [],
      wreckageHeight: 6 + Math.floor(Math.random() * 8)
    };

    state.grid[x][y] = wreckage;
    state.buildings.push(wreckage);
    placed++;
  }
}

// ==============================
// PROCESS METEOR STORM
// ==============================
export function processMeteorStorm(scene) {
  const protectedTiles = getProtectedTiles();
  const destroyed = [];

  for (const b of [...state.buildings]) {
    if (b.type === "wreckage") continue;
    const key = `${b.x},${b.y}`;
    if (!protectedTiles.has(key)) {
      destroyed.push(b);
    }
  }

  for (const b of destroyed) {
    for (const s of [...b.settlers]) {
      unassignSettler(s);
    }

    scene.solarSprites = scene.solarSprites.filter(s => {
      if (s.gridX === b.x && s.gridY === b.y) {
        s.sprite.destroy();
        return false;
      }
      return true;
    });

    if (b.type === "storage" && !b.constructing) {
      for (const key of STORAGE_RAW_KEYS) {
        storageCap[key] = Math.max(storageCap[key] - 25, 30);
        resources[key] = Math.min(resources[key] || 0, storageCap[key]);
      }
      for (const key of STORAGE_COMPOUND_KEYS) {
        storageCap[key] = Math.max(storageCap[key] - 15, 15);
        resources[key] = Math.min(resources[key] || 0, storageCap[key]);
      }
    }
    if (b.type === "home" && !b.constructing) {
      state.populationCap = Math.max(STARTING_POP_CAP, state.populationCap - 2);
    }

    state.grid[b.x][b.y] = null;
    state.buildings = state.buildings.filter(obj => obj !== b);
  }

  if (destroyed.includes(state.selectedBuilding)) {
    state.selectedBuilding = null;
  }

  const wreckageCount = STORM_WRECKAGE_MIN + Math.floor(Math.random() * (STORM_WRECKAGE_MAX - STORM_WRECKAGE_MIN + 1));
  spawnStormWreckage(wreckageCount);

  state.stormTimer = STORM_INTERVAL;
  state.stormActive = false;

  redrawBuildings(scene);
}

// ==============================
// REDRAW ALL BUILDINGS
// ==============================
export function redrawBuildings(scene) {
  scene.buildingGraphics.clear();
  scene.progressGraphics.clear();

  // Destroy old building sprites
  if (!scene.buildingSprites) scene.buildingSprites = [];
  for (const s of scene.buildingSprites) s.destroy();
  scene.buildingSprites = [];

  const sorted = [...state.buildings].sort((a, b) => (a.x + a.y) - (b.x + b.y));

  for (const building of sorted) {
    const { screenX, screenY } = scene.gridToScreen(building.x, building.y);

    // Get frame index
    const frameIdx = BUILDING_FRAMES[building.type];
    const isConstructing = building.constructing;

    if (frameIdx !== undefined && frameIdx >= 0) {
      // Sprite-based rendering
      let sprite, scale;
      if (building.type === "solar") {
        scale = TILE_WIDTH / 128;
        sprite = scene.add.sprite(screenX, screenY + TILE_HEIGHT / 2, "solar2");
      } else if (building.type === "battery") {
        scale = TILE_WIDTH / 132;
        sprite = scene.add.sprite(screenX, screenY + TILE_HEIGHT / 2, "battery");
      } else if (building.type === "wreckage") {
        scale = TILE_WIDTH / 128;
        sprite = scene.add.sprite(screenX, screenY + TILE_HEIGHT / 2, "scrap");
      } else if (building.type === "spaceship") {
        scale = TILE_WIDTH / 130;
        sprite = scene.add.sprite(screenX, screenY + TILE_HEIGHT / 2 + 32, "buildings", 13);
      } else {
        scale = TILE_WIDTH / 130;
        sprite = scene.add.sprite(screenX, screenY + TILE_HEIGHT / 2 + 32, "buildings", frameIdx);
      }
      sprite.setOrigin(0.5, 1);
      sprite.setDepth(screenY + 5000);
      sprite.setScale(scale);

      if (isConstructing) {
        sprite.setAlpha(0.4);
        sprite.setTint(0x88aaff);
      } else if (!building.active) {
        sprite.setAlpha(0.5);
      }

      scene.uiCamera.ignore(sprite);
      scene.buildingSprites.push(sprite);

      // Sprite height in screen pixels
      const spriteTop = screenY + TILE_HEIGHT / 2 + 32 - 200 * scale;

      // Construction progress bar
      if (isConstructing) {
        const barW = 30, barH = 4;
        const barX = screenX - barW / 2;
        const barY = spriteTop - 6;
        scene.progressGraphics.fillStyle(0x000000, 0.7);
        scene.progressGraphics.fillRect(barX, barY, barW, barH);
        scene.progressGraphics.fillStyle(building.type === "wreckage" ? 0xffaa00 : 0x00ff00, 0.9);
        scene.progressGraphics.fillRect(barX, barY, barW * building.buildProgress, barH);
        scene.progressGraphics.lineStyle(1, 0xffffff, 0.5);
        scene.progressGraphics.strokeRect(barX, barY, barW, barH);
      }

      // Inactive indicator (red circle)
      if (!isConstructing && !building.active && building.type !== "wreckage") {
        scene.buildingGraphics.lineStyle(2, 0xff0000, 0.8);
        scene.buildingGraphics.strokeCircle(screenX, spriteTop - 2, 4);
      }

      // NOT CONNECTED indicator
      if (building.notConnected && !isConstructing) {
        scene.buildingGraphics.lineStyle(2, 0xff8800, 0.9);
        scene.buildingGraphics.lineBetween(screenX - 4, spriteTop - 6, screenX + 4, spriteTop + 2);
        scene.buildingGraphics.lineBetween(screenX - 4, spriteTop + 2, screenX + 4, spriteTop - 6);
      }
    } else {
      // Fallback: iso box for unknown types
      const bt = BUILDING_TYPES[building.type];
      if (!bt) continue;
      const alpha = isConstructing ? 0.35 : (building.active ? 1 : 0.4);
      drawIsoBox(scene.buildingGraphics, screenX, screenY, bt.color, bt.height, alpha);
    }
  }

  // Shield radius overlays
  const generators = getActiveShieldGenerators();
  for (const gen of generators) {
    for (let dx = -SHIELD_RADIUS; dx <= SHIELD_RADIUS; dx++) {
      for (let dy = -SHIELD_RADIUS; dy <= SHIELD_RADIUS; dy++) {
        if (Math.abs(dx) + Math.abs(dy) > SHIELD_RADIUS) continue;
        const tx = gen.x + dx;
        const ty = gen.y + dy;
        if (tx < 0 || tx >= GRID_SIZE || ty < 0 || ty >= GRID_SIZE) continue;

        const { screenX, screenY } = scene.gridToScreen(tx, ty);
        scene.buildingGraphics.fillStyle(0x4466ff, 0.12);
        scene.buildingGraphics.beginPath();
        scene.buildingGraphics.moveTo(screenX, screenY - TILE_HEIGHT / 2);
        scene.buildingGraphics.lineTo(screenX + TILE_WIDTH / 2, screenY);
        scene.buildingGraphics.lineTo(screenX, screenY + TILE_HEIGHT / 2);
        scene.buildingGraphics.lineTo(screenX - TILE_WIDTH / 2, screenY);
        scene.buildingGraphics.closePath();
        scene.buildingGraphics.fillPath();
      }
    }
  }
}
