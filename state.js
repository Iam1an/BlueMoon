// ==============================
// CONFIG / CONSTANTS
// ==============================
export const TILE_WIDTH = 64;
export const TILE_HEIGHT = 32;
export const GRID_SIZE = 50;
export const TICK_RATE = 1000;

export const SETTLER_SPEED = 0.06;
export const SETTLER_W = 6;
export const SETTLER_H = 10;
export const MAX_SETTLERS_PER_BUILDING = 3;
export const BUILD_TIME_BASE = 45;
export const SALVAGE_TIME_BASE = 15;
export const POP_GROW_INTERVAL = 30000;
export const STARTING_SETTLERS = 5;
export const STARTING_POP_CAP = 5;
export const OXYGEN_PER_SETTLER = 1;
export const FOOD_PER_SETTLER = 1;
export const WATER_PER_SETTLER = 1;
export const DEPLETION_INTERVAL = 5; // consume O2/food/water every N ticks

export const DAY_LENGTH = 240;            // ticks per day (4 min at 1 tick/sec)
export const STORM_INTERVAL = 1680;      // 7 days * 240 ticks
export const STORM_WRECKAGE_MIN = 10;
export const STORM_WRECKAGE_MAX = 15;
export const SHIELD_RADIUS = 3;          // Manhattan distance

// ==============================
// RESOURCE DEFINITIONS
// ==============================
export const RESOURCE_INFO = {
  // Essentials
  power:   { name: "Power",    color: "#ffdd00", category: "essential" },
  oxygen:  { name: "Oxygen",   color: "#66bbff", category: "essential" },
  food:    { name: "Food",     color: "#ffaa44", category: "essential" },
  water:   { name: "Water",   color: "#4488ff", category: "essential" },
  fuel:    { name: "Fuel",     color: "#ff8844", category: "essential" },
  // Tier 1 raw
  iron:      { name: "Iron",      color: "#aa6644", category: "raw" },
  copper:    { name: "Copper",    color: "#cc7733", category: "raw" },
  sand:      { name: "Sand",      color: "#ddcc88", category: "raw" },
  aluminum:  { name: "Aluminum",  color: "#bbbbcc", category: "raw" },
  // Tier 2 raw (unlocked)
  stone:   { name: "Stone",   color: "#999988", category: "raw", tier: 2 },
  carbon:  { name: "Carbon",  color: "#444444", category: "raw", tier: 2 },
  sulfur:  { name: "Sulfur",  color: "#cccc22", category: "raw", tier: 2 },
  silicon: { name: "Silicon", color: "#7799aa", category: "raw", tier: 2 },
  shieldCrystal: { name: "Shield Crystal", color: "#88aaff", category: "raw", tier: 2 },
  // Tier 3 raw (unlocked)
  diamond:  { name: "Diamond",  color: "#aaeeff", category: "raw", tier: 3 },
  tungsten: { name: "Tungsten", color: "#8888aa", category: "raw", tier: 3 },
  // Compounds (crafted)
  steel:    { name: "Steel",    color: "#6688aa", category: "compound" },
  glass:    { name: "Glass",    color: "#aaddff", category: "compound" },
  plastic:  { name: "Plastic",  color: "#dd88cc", category: "compound" },
  electronics: { name: "Electronics", color: "#44ddaa", category: "compound" }
};

// ==============================
// RECIPES
// ==============================
export const RECIPES = {
  glass:    { name: "Glass",    inputs: { sand: 2 },                          outputs: { glass: 1 },    requiresResearch: null },
  plastic:  { name: "Plastic",  inputs: { sand: 2, fuel: 1 },                outputs: { plastic: 2 },  requiresResearch: null },
  steel:    { name: "Steel",    inputs: { iron: 3, carbon: 1 },              outputs: { steel: 2 },    requiresResearch: "advancedMining" },
  electronics: { name: "Electronics", inputs: { copper: 2, silicon: 1, glass: 1 }, outputs: { electronics: 1 }, requiresResearch: "compoundFab" }
};

// ==============================
// CROP TYPES
// ==============================
export const CROP_TYPES = {
  basicAlgae:   { name: "Basic Algae",    produces: { food: 4, oxygen: 3 },  consumes: {},           requiresResearch: null },
  potatoes:     { name: "Potatoes",       produces: { food: 8, oxygen: 1 },  consumes: { water: 1 }, requiresResearch: "seedResearch1" },
  soybeans:     { name: "Soybeans",       produces: { food: 6, oxygen: 4 },  consumes: { water: 1 }, requiresResearch: "seedResearch1" },
  hydroponics:  { name: "Hydroponics",    produces: { food: 12, oxygen: 2 }, consumes: { water: 3 }, requiresResearch: "seedResearch2" },
  oxygenGarden: { name: "Oxygen Garden",  produces: { food: 2, oxygen: 10 }, consumes: { water: 2 }, requiresResearch: "seedResearch2" }
};

// ==============================
// TECH TREE
// ==============================
export const TECH_TREE = {
  advancedMining: {
    name: "Advanced Mining",
    cost: { iron: 30, copper: 20 },
    time: 60,
    requires: [],
    unlocks: { buildings: ["advancedMine", "crystalMine"], recipes: ["steel"] }
  },
  compoundFab: {
    name: "Compound Fabrication",
    cost: { iron: 20, glass: 5 },
    time: 45,
    requires: [],
    unlocks: { recipes: ["electronics"] }
  },
  deepMining: {
    name: "Deep Mining",
    cost: { steel: 20, electronics: 5 },
    time: 90,
    requires: ["advancedMining"],
    unlocks: { buildings: ["deepMine"] }
  },
  seedResearch1: {
    name: "Seed Research I",
    cost: { food: 50, iron: 10, glass: 5 },
    time: 45,
    requires: [],
    unlocks: { crops: ["potatoes", "soybeans"] }
  },
  seedResearch2: {
    name: "Seed Research II",
    cost: { food: 100, glass: 10, plastic: 5 },
    time: 75,
    requires: ["seedResearch1"],
    unlocks: { crops: ["hydroponics", "oxygenGarden"] }
  }
};

// ==============================
// BUILDING REGISTRY
// ==============================
export const BUILDING_TYPES = {
  solar: {
    name: "Solar Panel",
    key: "solar",
    cost: { iron: 5, copper: 2 },
    produces: { power: 5 },
    consumes: {},
    color: 0xffdd00,
    height: 12,
    description: "+5 Power (dims at night)",
    requiresSettlers: false,
    requiresResearch: null
  },
  miner: {
    name: "Mining Drill",
    key: "miner",
    cost: { iron: 8, aluminum: 4 },
    produces: { iron: 2, copper: 1, sand: 1, aluminum: 1, carbon: 0.5 },
    consumes: { power: 2 },
    color: 0x888888,
    height: 18,
    description: "T1 Materials, -2 Power",
    requiresSettlers: true,
    requiresResearch: null
  },
  oilDrill: {
    name: "Oil Drill",
    key: "oilDrill",
    cost: { iron: 12, copper: 6 },
    produces: { fuel: 2 },
    consumes: { power: 3 },
    color: 0x1a1a1a,
    height: 22,
    description: "+2 Fuel, -3 Power",
    requiresSettlers: true,
    requiresResearch: null
  },
  greenhouse: {
    name: "Greenhouse",
    key: "greenhouse",
    cost: { iron: 8, sand: 4, copper: 3 },
    produces: { food: 4, oxygen: 3 },
    consumes: { power: 3 },
    color: 0x22cc66,
    height: 16,
    description: "Grows crops, -3 Power",
    requiresSettlers: true,
    requiresResearch: null
  },
  storage: {
    name: "Storage Depot",
    key: "storage",
    cost: { iron: 10, aluminum: 6 },
    produces: {},
    consumes: {},
    color: 0x4488ff,
    height: 14,
    description: "+25 raw material cap, +15 compound cap",
    requiresSettlers: false,
    requiresResearch: null
  },
  fabrication: {
    name: "Fab Workshop",
    key: "fabrication",
    cost: { iron: 15, copper: 8, aluminum: 5 },
    produces: {},
    consumes: { power: 2 },
    color: 0xcc8844,
    height: 18,
    description: "Crafts compounds",
    requiresSettlers: true,
    requiresResearch: null
  },
  home: {
    name: "Home",
    key: "home",
    cost: { iron: 6, glass: 4, plastic: 2 },
    produces: {},
    consumes: {},
    color: 0x44aa44,
    height: 12,
    description: "+2 Pop",
    requiresSettlers: false,
    requiresResearch: null
  },
  researchStation: {
    name: "Research Station",
    key: "researchStation",
    cost: { iron: 10, glass: 5, copper: 8 },
    produces: {},
    consumes: { power: 3 },
    color: 0x9966cc,
    height: 18,
    description: "Unlocks new tech",
    requiresSettlers: true,
    requiresResearch: null
  },
  generator: {
    name: "Generator",
    key: "generator",
    cost: { iron: 12, steel: 6, copper: 4 },
    produces: { power: 15 },
    consumes: { fuel: 2 },
    color: 0xff4400,
    height: 16,
    description: "+15 Power, -2 Fuel",
    requiresSettlers: true,
    requiresResearch: null
  },
  advancedMine: {
    name: "Advanced Mine",
    key: "advancedMine",
    cost: { steel: 20, glass: 8, aluminum: 5 },
    produces: { stone: 2, carbon: 1, sulfur: 1, silicon: 1, shieldCrystal: 0.05 },
    consumes: { power: 4 },
    color: 0x667788,
    height: 20,
    description: "T2 Materials, -4 Power",
    requiresSettlers: true,
    requiresResearch: "advancedMining"
  },
  deepMine: {
    name: "Deep Mine",
    key: "deepMine",
    cost: { steel: 25, aluminum: 15, electronics: 8 },
    produces: { diamond: 1, tungsten: 1 },
    consumes: { power: 6 },
    color: 0x445566,
    height: 24,
    description: "T3 Materials, -6 Power",
    requiresSettlers: true,
    requiresResearch: "deepMining"
  },
  waterCollector: {
    name: "Water Collector",
    key: "waterCollector",
    cost: { iron: 12, aluminum: 8, copper: 4 },
    produces: { water: 3 },
    consumes: { power: 2 },
    color: 0x4488ff,
    height: 14,
    description: "+3 Water, -2 Pwr (adj. Home/Farm)",
    requiresSettlers: true,
    requiresResearch: null,
    requiresAdjacency: ["greenhouse", "home"]
  },
  crystalMine: {
    name: "Crystal Mine",
    key: "crystalMine",
    cost: { steel: 15, glass: 6, electronics: 4 },
    produces: { shieldCrystal: 0.2 },
    consumes: { power: 4 },
    color: 0x6666cc,
    height: 20,
    description: "+0.2 Crystals/t, -4 Pwr",
    requiresSettlers: true,
    requiresResearch: "advancedMining"
  },
  spaceship: {
    name: "Spaceship",
    key: "spaceship",
    cost: {},
    produces: {},
    consumes: {},
    color: 0x667755,
    height: 20,
    description: "Crashed ship. Settlers rest here at night.",
    requiresSettlers: false,
    requiresResearch: null
  },
  battery: {
    name: "Battery",
    key: "battery",
    cost: { iron: 10, copper: 6, sand: 4 },
    produces: {},
    consumes: {},
    color: 0x44cc44,
    height: 14,
    description: "Stores 50 power, charges by day. Must be placed adjacent to a Solar Panel.",
    requiresSettlers: false,
    requiresResearch: null,
    batteryCapacity: 50,
    requiresAdjacency: ["solar"]
  },
  shieldGenerator: {
    name: "Shield Generator",
    key: "shieldGenerator",
    cost: { shieldCrystal: 10, steel: 15, electronics: 8 },
    produces: {},
    consumes: { power: 8 },
    color: 0x4466ff,
    height: 22,
    description: "Shields r=3 from storms, -8 Pwr",
    requiresSettlers: false,
    requiresResearch: null
  }
};

// Spritesheet frame index for each building type (0-based)
export const BUILDING_FRAMES = {
  solar: 0,
  miner: 1,
  advancedMine: 2,
  crystalMine: 3,
  oilDrill: 4,
  greenhouse: 5,
  storage: 6,
  fabrication: 7,
  home: 8,
  researchStation: 9,
  generator: 10,
  waterCollector: 11,
  shieldGenerator: 12,
  wreckage: 0,    // uses separate scrap image
  deepMine: 2,    // reuse advanced mine sprite
  battery: 0,     // uses separate image
  spaceship: 13   // wrecked ship from spritesheet
};

export const BUILDING_KEYS = Object.keys(BUILDING_TYPES);

// ==============================
// WRECKAGE LOOT TABLE
// ==============================
export const WRECKAGE_LOOT = {
  iron:     { min: 3, max: 10 },
  copper:   { min: 2, max: 6 },
  sand:     { min: 1, max: 5 },
  aluminum: { min: 1, max: 5 },
  fuel:     { chance: 0.2, min: 5, max: 10 }
};

// ==============================
// MUTABLE GAME STATE
// ==============================
export const resources = {
  power: 0,
  oxygen: 500, food: 300, water: 200, fuel: 0,
  iron: 30, copper: 20, sand: 15, aluminum: 15,
  stone: 0, carbon: 0, sulfur: 0, silicon: 0,
  shieldCrystal: 0,
  diamond: 0, tungsten: 0,
  steel: 0, glass: 0, plastic: 0, electronics: 0
};

export const storageCap = {
  oxygen: 1000, food: 500, water: 500, fuel: 100,
  iron: 30, copper: 30, sand: 30, aluminum: 30,
  stone: 30, carbon: 30, sulfur: 30, silicon: 30,
  shieldCrystal: 30,
  diamond: 30, tungsten: 30,
  steel: 15, glass: 15, plastic: 15, electronics: 15
};

export const state = {
  powerBalance: 0,
  populationCap: STARTING_POP_CAP,
  grid: [],
  buildings: [],
  settlers: [],
  nextSettlerId: 0,
  selectedType: null,
  selectedBuilding: null,
  selectedSettler: null,
  lifeSupportCritical: false,
  depletionCounter: 0,
  gameSpeed: 1,           // 0=paused, 1=normal, 2=double
  dayTime: 0.25,          // 0-1 cycle (0=midnight, 0.5=noon)
  dayCount: 1,
  stormTimer: 1680,
  stormActive: false,
  // Research
  research: {
    completed: [],
    active: null,
    progress: 0
  },
  unlockedBuildings: [],
  unlockedRecipes: [],
  unlockedCrops: [],
  // Tutorial
  tutorialActive: true,
  tutorialStep: 0,
  tutorialTimer: 0
};
