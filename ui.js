import {
  BUILDING_TYPES, BUILDING_KEYS,
  MAX_SETTLERS_PER_BUILDING,
  RESOURCE_INFO, RECIPES, TECH_TREE, CROP_TYPES, DAY_LENGTH,
  resources, storageCap, state
} from "./state.js";
import { canAfford, isBuildingUnlocked, isRecipeUnlocked, isCropUnlocked, demolishBuilding, salvageWreckage, cancelSalvage, startResearch } from "./buildings.js";
import { unassignSettler, assignSettlerToBuilding } from "./settlers.js";

// ==============================
// TUTORIAL STEPS
// ==============================
const TUTORIAL_STEPS = [
  { message: "Welcome to Blue Moon! Your settlers have crash-landed. Let's get the colony started.", auto: true, delay: 180 },
  { message: "Click on crash debris near the ship to salvage parts and free up space.", condition: (st) => st.buildings.some(b => b.type === "wreckage" && b.constructing) },
  { message: "Settlers are salvaging the debris. Wait for them to finish.", condition: (st) => st.buildings.filter(b => b.type === "wreckage").length < 18 },
  { message: "Nice! Now select a Solar Panel from the build menu and place it near the ship.", condition: (st) => st.buildings.some(b => b.type === "solar") },
  { message: "Build a Greenhouse to grow food for your settlers. ", condition: (st) => st.buildings.some(b => b.type === "greenhouse") },
  { message: "We are gonna need a second Solar Panel for the next building.", condition: (st) => st.buildings.filter(b => b.type === "solar").length >= 2 },
  { message: "Build a Water Collector to supply your colony with water.", condition: (st) => st.buildings.some(b => b.type === "waterCollector") },
  { message: "Remember that all buildings take energy to run!", condition: (st) => st.buildings.some(b => b.type === "waterCollector") },
  { message: "A solar rain is coming... Get your colony ready.", auto: true, delay: 300 }
];

// ==============================
// CREATE UI
// ==============================
export function createUI(scene) {
  const W = scene.cameras.main.width;
  const H = scene.cameras.main.height;
  const ign = (el) => scene.cameras.main.ignore(el);

  // --- Top essentials bar ---
  scene.uiBg = scene.add.graphics().setScrollFactor(0).setDepth(20000);
  scene.uiBg.fillStyle(0x000000, 0.7);
  scene.uiBg.fillRoundedRect(8, 8, W - 16, 36, 6);
  ign(scene.uiBg);

  scene.powerText = scene.add.text(16, 16, "", { fontSize: "13px", fontFamily: "monospace", fill: "#ffdd00" }).setScrollFactor(0).setDepth(20001);
  ign(scene.powerText);
  scene.oxygenText = scene.add.text(155, 16, "", { fontSize: "13px", fontFamily: "monospace", fill: "#66bbff" }).setScrollFactor(0).setDepth(20001);
  ign(scene.oxygenText);
  scene.foodText = scene.add.text(295, 16, "", { fontSize: "13px", fontFamily: "monospace", fill: "#ffaa44" }).setScrollFactor(0).setDepth(20001);
  ign(scene.foodText);
  scene.waterText = scene.add.text(420, 16, "", { fontSize: "13px", fontFamily: "monospace", fill: "#4488ff" }).setScrollFactor(0).setDepth(20001);
  ign(scene.waterText);
  scene.popText = scene.add.text(540, 16, "", { fontSize: "13px", fontFamily: "monospace", fill: "#00dd00" }).setScrollFactor(0).setDepth(20001);
  ign(scene.popText);
  scene.warningText = scene.add.text(640, 16, "", { fontSize: "13px", fontFamily: "monospace", fill: "#ff2222" }).setScrollFactor(0).setDepth(20001);
  ign(scene.warningText);
  scene.stormText = scene.add.text(W - 140, 16, "", { fontSize: "13px", fontFamily: "monospace", fill: "#ffffff" }).setScrollFactor(0).setDepth(20001);
  ign(scene.stormText);
  scene.dayText = scene.add.text(W - 140, 30, "", { fontSize: "10px", fontFamily: "monospace", fill: "#ccccaa" }).setScrollFactor(0).setDepth(20001);
  ign(scene.dayText);

  // --- Speed controls ---
  const speedLabels = ["||", ">", ">>"];
  scene.speedButtons = [];
  for (let i = 0; i < 3; i++) {
    const sx = W - 270 + i * 28;
    const sy = 14;
    const gfx = scene.add.graphics().setScrollFactor(0).setDepth(20001);
    ign(gfx);
    const txt = scene.add.text(sx + 11, sy + 9, speedLabels[i], {
      fontSize: "10px", fontFamily: "monospace", fill: "#ffffff"
    }).setOrigin(0.5, 0.5).setScrollFactor(0).setDepth(20002);
    ign(txt);
    const z = scene.add.zone(sx, sy, 24, 18).setOrigin(0, 0).setScrollFactor(0).setDepth(20003).setInteractive();
    ign(z);
    const speed = i; // 0=pause, 1=normal, 2=double
    z.on("pointerdown", () => {
      state.gameSpeed = speed;
      updateSpeedButtons(scene);
    });
    scene.speedButtons.push({ gfx, txt, z, sx, sy, speed });
  }
  updateSpeedButtons(scene);

  // PAUSED overlay
  scene.pausedText = scene.add.text(W / 2, H / 2 - 20, "PAUSED", {
    fontSize: "32px", fontFamily: "monospace", fill: "#ffffff", fontStyle: "bold"
  }).setOrigin(0.5, 0.5).setScrollFactor(0).setDepth(25000).setVisible(false).setAlpha(0.7);
  ign(scene.pausedText);

  // --- Left side resource panel ---
  scene.sidePanelBg = scene.add.graphics().setScrollFactor(0).setDepth(20000);
  ign(scene.sidePanelBg);
  scene.sidePanelTexts = [];
  // We'll create text objects on first update
  scene.sidePanelBuilt = false;

  // --- Bottom building selector ---
  scene.selectorBg = scene.add.graphics().setScrollFactor(0).setDepth(20000);
  ign(scene.selectorBg);

  scene.selectorButtons = [];
  scene.selectorBuilt = false;
  scene.selectorMinimized = false;

  // Toggle button for build menu
  scene.selectorToggleBg = scene.add.graphics().setScrollFactor(0).setDepth(20001);
  ign(scene.selectorToggleBg);
  scene.selectorToggleText = scene.add.text(0, 0, "", {
    fontSize: "10px", fontFamily: "monospace", fill: "#aaaaaa", align: "center"
  }).setOrigin(0.5, 0.5).setScrollFactor(0).setDepth(20002);
  ign(scene.selectorToggleText);
  scene.selectorToggleZone = scene.add.zone(0, 0, 80, 16)
    .setOrigin(0.5, 0.5).setScrollFactor(0).setDepth(20003).setInteractive();
  ign(scene.selectorToggleZone);
  scene.selectorToggleZone.on("pointerdown", () => {
    scene.selectorMinimized = !scene.selectorMinimized;
    updateSelectorVisibility(scene);
  });

  buildSelector(scene);

  // --- Tooltip (hover popup for selector buttons) ---
  scene.tooltipBg = scene.add.graphics().setScrollFactor(0).setDepth(25000).setVisible(false);
  ign(scene.tooltipBg);
  scene.tooltipTexts = [];
  for (let i = 0; i < 6; i++) {
    const t = scene.add.text(0, 0, "", { fontSize: "10px", fontFamily: "monospace", fill: "#ffffff" })
      .setScrollFactor(0).setDepth(25001).setVisible(false);
    ign(t);
    scene.tooltipTexts.push(t);
  }

  // --- Info panel ---
  scene.infoBg = scene.add.graphics().setScrollFactor(0).setDepth(20000);
  ign(scene.infoBg);
  scene.infoTexts = [];
  for (let i = 0; i < 16; i++) {
    const t = scene.add.text(0, 0, "", { fontSize: "11px", fontFamily: "monospace", fill: "#ffffff" })
      .setScrollFactor(0).setDepth(20001).setVisible(false);
    ign(t);
    scene.infoTexts.push(t);
  }

  // Action zones (clickable buttons in info panel)
  scene.actionZones = [];
  for (let i = 0; i < 14; i++) {
    const z = scene.add.zone(0, 0, 120, 16).setOrigin(0, 0).setScrollFactor(0).setDepth(20003).setInteractive().setVisible(false);
    ign(z);
    scene.actionZones.push(z);
  }

  updateInfoPanel(scene);

  // --- Tutorial overlay ---
  scene.tutorialBg = scene.add.graphics().setScrollFactor(0).setDepth(22000);
  ign(scene.tutorialBg);
  scene.tutorialText = scene.add.text(W / 2, 56, "", {
    fontSize: "14px", fontFamily: "monospace", fill: "#ffffff", align: "center",
    wordWrap: { width: W - 100 }
  }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(22001);
  ign(scene.tutorialText);
  scene.tutorialSkip = scene.add.text(W - 16, 52, "[Skip Tutorial]", {
    fontSize: "10px", fontFamily: "monospace", fill: "#888888"
  }).setOrigin(1, 0).setScrollFactor(0).setDepth(22001).setInteractive();
  ign(scene.tutorialSkip);
  scene.tutorialSkip.on("pointerdown", () => {
    state.tutorialActive = false;
    hideTutorial(scene);
  });
  scene.tutorialSkip.on("pointerover", () => scene.tutorialSkip.setFill("#ffffff"));
  scene.tutorialSkip.on("pointerout", () => scene.tutorialSkip.setFill("#888888"));

  // Next button
  scene.tutorialNext = scene.add.text(0, 0, "[Next >>]", {
    fontSize: "11px", fontFamily: "monospace", fill: "#44aaff"
  }).setOrigin(1, 0).setScrollFactor(0).setDepth(22001).setInteractive().setVisible(false);
  ign(scene.tutorialNext);
  scene.tutorialNext.on("pointerdown", () => {
    if (!state.tutorialActive) return;
    state.tutorialStep++;
    const next = TUTORIAL_STEPS[state.tutorialStep];
    if (next && next.auto) {
      state.tutorialTimer = next.delay;
    }
  });
  scene.tutorialNext.on("pointerover", () => scene.tutorialNext.setFill("#ffffff"));
  scene.tutorialNext.on("pointerout", () => scene.tutorialNext.setFill("#44aaff"));

  // Initialize first tutorial step timer and pause
  if (state.tutorialActive) {
    state.gameSpeed = 0;
    const step = TUTORIAL_STEPS[state.tutorialStep];
    if (step && step.auto) {
      state.tutorialTimer = step.delay;
    }
  }
}

// ==============================
// BUILD BOTTOM SELECTOR
// ==============================
function buildSelector(scene) {
  const W = scene.cameras.main.width;
  const H = scene.cameras.main.height;
  const ign = (el) => scene.cameras.main.ignore(el);

  // Clear old buttons
  for (const btn of scene.selectorButtons) {
    btn.btnGfx.destroy();
    btn.label.destroy();
    btn.costLabel.destroy();
    btn.zone.destroy();
  }
  scene.selectorButtons = [];

  // Filter to unlocked buildings + cursor
  const availableKeys = BUILDING_KEYS.filter(k => k !== "spaceship" && k !== "wreckage" && isBuildingUnlocked(k));
  const allKeys = [null, ...availableKeys];
  const btnWidth = Math.min((W - 40) / allKeys.length, 120);
  const totalW = btnWidth * allKeys.length;
  const startX = (W - totalW) / 2;

  scene.selectorBg.clear();
  scene.selectorBg.fillStyle(0x000000, 0.8);
  scene.selectorBg.fillRoundedRect(8, H - 66, W - 16, 58, 6);

  for (let i = 0; i < allKeys.length; i++) {
    const key = allKeys[i];
    const bx = startX + i * btnWidth;
    const by = H - 62;

    const btnGfx = scene.add.graphics().setScrollFactor(0).setDepth(20001);
    ign(btnGfx);

    let labelStr, costStr;
    if (key === null) {
      labelStr = "[0] Cursor";
      costStr = "";
    } else {
      const bt = BUILDING_TYPES[key];
      const idx = availableKeys.indexOf(key) + 1;
      labelStr = `[${idx}] ${bt.name}`;
      const costs = Object.entries(bt.cost);
      costStr = costs.length <= 2
        ? costs.map(([r, a]) => `${a} ${r}`).join(", ")
        : costs.slice(0, 2).map(([r, a]) => `${a}${r.slice(0, 3)}`).join(",") + "...";
    }

    const label = scene.add.text(bx + btnWidth / 2, by + 8, labelStr, {
      fontSize: "9px", fontFamily: "monospace", fill: "#ffffff", align: "center"
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(20002);
    ign(label);

    const costLabel = scene.add.text(bx + btnWidth / 2, by + 22, costStr, {
      fontSize: "8px", fontFamily: "monospace", fill: "#aaaaaa", align: "center"
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(20002);
    ign(costLabel);

    const zone = scene.add.zone(bx, by, btnWidth - 2, 48)
      .setOrigin(0, 0).setScrollFactor(0).setDepth(20003).setInteractive();
    ign(zone);

    zone.on("pointerdown", () => {
      state.selectedType = key;
      state.selectedSettler = null;
      updateBuildingSelector(scene);
      updateInfoPanel(scene);
    });

    zone.on("pointerover", () => { showTooltip(scene, key, bx, by, btnWidth); });
    zone.on("pointerout", () => { hideTooltip(scene); });

    scene.selectorButtons.push({ key, btnGfx, label, costLabel, bx, by, btnWidth, zone });
  }

  updateSelectorVisibility(scene);
}

// ==============================
// TOOLTIP (hover popup)
// ==============================
function showTooltip(scene, buildingKey, bx, by, btnWidth) {
  if (buildingKey === null) {
    hideTooltip(scene);
    return;
  }

  const bt = BUILDING_TYPES[buildingKey];
  if (!bt) return;

  const tipLines = [];
  const tipColors = [];

  tipLines.push(bt.name);
  tipColors.push("#ffffff");

  tipLines.push(bt.description);
  tipColors.push("#aaaaaa");

  // Full cost breakdown
  const costEntries = Object.entries(bt.cost);
  tipLines.push("Cost: " + costEntries.map(([r, a]) => {
    const affordable = (resources[r] || 0) >= a;
    return `${a} ${r}`;
  }).join(", "));
  tipColors.push("#ffcc44");

  // Production
  const prodEntries = Object.entries(bt.produces || {});
  if (prodEntries.length > 0) {
    tipLines.push("+" + prodEntries.map(([r, a]) => `${a} ${r}`).join(", "));
    tipColors.push("#44ff44");
  }

  // Consumption
  const consEntries = Object.entries(bt.consumes || {});
  if (consEntries.length > 0) {
    tipLines.push("-" + consEntries.map(([r, a]) => `${a} ${r}`).join(", "));
    tipColors.push("#ff6666");
  }

  // Workers
  if (bt.requiresSettlers) {
    tipLines.push("Requires workers");
    tipColors.push("#888888");
  }

  // Position tooltip above button
  const tipW = 230;
  const tipH = 8 + tipLines.length * 13 + 4;
  let tipX = bx + btnWidth / 2 - tipW / 2;
  const tipY = by - tipH - 4;

  // Clamp to screen
  const W = scene.cameras.main.width;
  if (tipX < 4) tipX = 4;
  if (tipX + tipW > W - 4) tipX = W - 4 - tipW;

  scene.tooltipBg.clear();
  scene.tooltipBg.fillStyle(0x111111, 0.95);
  scene.tooltipBg.fillRoundedRect(tipX, tipY, tipW, tipH, 4);
  scene.tooltipBg.lineStyle(1, 0x4488ff, 0.8);
  scene.tooltipBg.strokeRoundedRect(tipX, tipY, tipW, tipH, 4);
  scene.tooltipBg.setVisible(true);

  for (let i = 0; i < scene.tooltipTexts.length; i++) {
    if (i < tipLines.length) {
      scene.tooltipTexts[i].setText(tipLines[i]);
      scene.tooltipTexts[i].setPosition(tipX + 6, tipY + 4 + i * 13);
      scene.tooltipTexts[i].setFill(tipColors[i]);
      scene.tooltipTexts[i].setVisible(true);
    } else {
      scene.tooltipTexts[i].setVisible(false);
    }
  }
}

function hideTooltip(scene) {
  scene.tooltipBg.setVisible(false);
  for (const t of scene.tooltipTexts) t.setVisible(false);
}

// ==============================
// BUILD SIDE PANEL
// ==============================
function buildSidePanel(scene) {
  const ign = (el) => scene.cameras.main.ignore(el);

  // Destroy old texts
  for (const t of scene.sidePanelTexts) t.destroy();
  scene.sidePanelTexts = [];

  const categories = [
    { header: "-- Raw Materials --", keys: ["iron", "copper", "sand", "aluminum", "stone", "carbon", "sulfur", "silicon", "shieldCrystal", "diamond", "tungsten"] },
    { header: "-- Compounds --", keys: ["steel", "glass", "plastic", "electronics"] },
    { header: "-- Fuel --", keys: ["fuel"] }
  ];

  let y = 52;
  const x = 12;

  for (const cat of categories) {
    // Filter to resources that player has seen (amount > 0 or T1)
    const visibleKeys = cat.keys.filter(k => {
      const info = RESOURCE_INFO[k];
      if (!info) return false;
      if (info.tier === 2 && !state.research.completed.includes("advancedMining") && (resources[k] || 0) === 0) return false;
      if (info.tier === 3 && !state.research.completed.includes("deepMining") && (resources[k] || 0) === 0) return false;
      if (info.category === "compound" && (resources[k] || 0) === 0 && !state.unlockedRecipes.includes(k)) {
        // Show glass/plastic always (available without research)
        if (k === "glass" || k === "plastic") return true;
        return false;
      }
      return true;
    });

    if (visibleKeys.length === 0) continue;

    const headerText = scene.add.text(x, y, cat.header, {
      fontSize: "10px", fontFamily: "monospace", fill: "#888888"
    }).setScrollFactor(0).setDepth(20001);
    ign(headerText);
    scene.sidePanelTexts.push(headerText);
    y += 15;

    for (const key of visibleKeys) {
      const info = RESOURCE_INFO[key];
      const t = scene.add.text(x + 4, y, "", {
        fontSize: "11px", fontFamily: "monospace", fill: info.color
      }).setScrollFactor(0).setDepth(20001);
      ign(t);
      t.resourceKey = key;
      scene.sidePanelTexts.push(t);
      y += 14;
    }
  }

  scene.sidePanelBg.clear();
  scene.sidePanelBg.fillStyle(0x000000, 0.65);
  scene.sidePanelBg.fillRoundedRect(4, 48, 168, y - 44, 6);

  scene.sidePanelBuilt = true;
}

// ==============================
// UPDATE RESOURCE UI
// ==============================
export function updateResourceUI(scene) {
  const ps = state.powerBalance >= 0 ? "+" : "";
  scene.powerText.setText(`Pwr:${ps}${state.powerBalance}/t`);
  scene.powerText.setFill(state.powerBalance >= 0 ? "#ffdd00" : "#ff4444");
  scene.oxygenText.setText(`O2:${Math.floor(resources.oxygen)}/${storageCap.oxygen}`);
  scene.oxygenText.setFill(resources.oxygen > 50 ? "#66bbff" : "#ff4444");
  scene.foodText.setText(`Food:${Math.floor(resources.food)}/${storageCap.food}`);
  scene.foodText.setFill(resources.food > 50 ? "#ffaa44" : "#ff4444");
  scene.waterText.setText(`H2O:${Math.floor(resources.water)}/${storageCap.water}`);
  scene.waterText.setFill(resources.water > 50 ? "#4488ff" : "#ff4444");
  scene.popText.setText(`Pop:${state.settlers.length}/${state.populationCap}`);
  scene.warningText.setText(state.lifeSupportCritical ? "LIFE SUPPORT CRITICAL" : "");

  // Storm timer (in days)
  const stormDays = state.stormTimer / DAY_LENGTH;
  let stormStr;
  if (stormDays >= 1) {
    stormStr = `RAIN: ${stormDays.toFixed(1)}d`;
  } else {
    const stormTicks = state.stormTimer;
    const minutes = Math.floor(stormTicks / 60);
    const seconds = stormTicks % 60;
    stormStr = `RAIN: ${minutes}:${seconds.toString().padStart(2, "0")}`;
  }
  let stormColor = "#ffffff";
  if (stormDays < 0.15) {
    stormColor = (Date.now() % 1000 < 500) ? "#ff0000" : "#440000";
  } else if (stormDays < 0.5) {
    stormColor = "#ff0000";
  } else if (stormDays < 1) {
    stormColor = "#ffff00";
  }
  scene.stormText.setText(stormStr);
  scene.stormText.setFill(stormColor);

  // Day/time display
  const hours = Math.floor(state.dayTime * 24);
  const mins = Math.floor((state.dayTime * 24 - hours) * 60);
  scene.dayText.setText(`Day ${state.dayCount}  ${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`);

  // Speed buttons + PAUSED
  updateSpeedButtons(scene);
  scene.pausedText.setVisible(state.gameSpeed === 0);

  // Side panel
  if (!scene.sidePanelBuilt) buildSidePanel(scene);

  for (const t of scene.sidePanelTexts) {
    if (t.resourceKey) {
      const key = t.resourceKey;
      const info = RESOURCE_INFO[key];
      const cap = storageCap[key];
      const val = Math.floor(resources[key] || 0);
      t.setText(`${info.name}: ${val}/${cap}`);
    }
  }

  updateBuildingSelector(scene);
}

// ==============================
// REBUILD SIDE PANEL (call when techs unlock)
// ==============================
export function rebuildSidePanel(scene) {
  scene.sidePanelBuilt = false;
  buildSidePanel(scene);
}

// ==============================
// REBUILD SELECTOR (call when buildings unlock)
// ==============================
export function rebuildSelector(scene) {
  buildSelector(scene);
}

// ==============================
// UPDATE SELECTOR VISIBILITY
// ==============================
function updateSelectorVisibility(scene) {
  const H = scene.cameras.main.height;
  const W = scene.cameras.main.width;

  if (scene.selectorMinimized) {
    scene.selectorBg.clear();
    scene.selectorBg.fillStyle(0x000000, 0.8);
    scene.selectorBg.fillRoundedRect(W / 2 - 50, H - 22, 100, 18, 4);
    for (const btn of scene.selectorButtons) {
      btn.btnGfx.setVisible(false);
      btn.label.setVisible(false);
      btn.costLabel.setVisible(false);
      btn.zone.disableInteractive();
    }
    hideTooltip(scene);
    scene.selectorToggleText.setText("Build [+]");
    scene.selectorToggleText.setPosition(W / 2, H - 13);
    scene.selectorToggleZone.setPosition(W / 2, H - 13);
    scene.selectorToggleBg.clear();
  } else {
    for (const btn of scene.selectorButtons) {
      btn.btnGfx.setVisible(true);
      btn.label.setVisible(true);
      btn.costLabel.setVisible(true);
      btn.zone.setInteractive();
    }
    scene.selectorToggleText.setText("[-]");
    scene.selectorToggleText.setPosition(W / 2, H - 72);
    scene.selectorToggleZone.setPosition(W / 2, H - 72);
    scene.selectorToggleBg.clear();
    scene.selectorToggleBg.fillStyle(0x000000, 0.6);
    scene.selectorToggleBg.fillRoundedRect(W / 2 - 16, H - 79, 32, 14, 3);
    updateBuildingSelector(scene);
  }
}

// ==============================
// UPDATE BUILDING SELECTOR
// ==============================
export function updateBuildingSelector(scene) {
  for (const btn of scene.selectorButtons) {
    btn.btnGfx.clear();
    const isSelected = btn.key === state.selectedType;
    const affordable = btn.key === null ? true : canAfford(btn.key);

    btn.btnGfx.fillStyle(isSelected ? 0x336633 : 0x222222, isSelected ? 0.9 : 0.8);
    btn.btnGfx.fillRoundedRect(btn.bx + 1, btn.by + 1, btn.btnWidth - 4, 44, 4);
    btn.btnGfx.lineStyle(isSelected ? 2 : 1, isSelected ? 0x00ff00 : 0x444444, 1);
    btn.btnGfx.strokeRoundedRect(btn.bx + 1, btn.by + 1, btn.btnWidth - 4, 44, 4);

    if (btn.key !== null) {
      btn.costLabel.setFill(affordable ? "#aaaaaa" : "#ff4444");
    }
  }
}

// ==============================
// UPDATE SPEED BUTTONS
// ==============================
function updateSpeedButtons(scene) {
  for (const btn of scene.speedButtons) {
    const active = state.gameSpeed === btn.speed;
    btn.gfx.clear();
    btn.gfx.fillStyle(active ? 0x336633 : 0x222222, 0.9);
    btn.gfx.fillRoundedRect(btn.sx, btn.sy, 24, 18, 3);
    btn.gfx.lineStyle(1, active ? 0x00ff00 : 0x555555, 1);
    btn.gfx.strokeRoundedRect(btn.sx, btn.sy, 24, 18, 3);
    btn.txt.setFill(active ? "#00ff00" : "#aaaaaa");
  }
}

// ==============================
// UPDATE INFO PANEL
// ==============================
export function updateInfoPanel(scene) {
  const W = scene.cameras.main.width;
  scene.infoBg.clear();
  for (const t of scene.infoTexts) t.setVisible(false);
  for (const z of scene.actionZones) { z.setVisible(false); z.removeAllListeners("pointerdown"); }

  // Return early only when in placement mode with nothing selected
  if (!state.selectedBuilding && !state.selectedSettler && state.selectedType !== null) return;

  const px = W - 254;
  const py = 52;
  let lines = [];
  let colors = [];
  let actions = []; // { lineIndex, label, callback }

  // Helper: find nearest idle settler and assign manually
  function addWorkerAction(lineIdx, b) {
    actions.push({ lineIndex: lineIdx, cb: () => {
      if (b.settlers.length >= MAX_SETTLERS_PER_BUILDING) return;
      const idle = state.settlers.filter(s => s.state === "idle" && !s.assignedBuilding);
      if (idle.length === 0) return;
      const nearest = idle.reduce((best, s) => {
        const d = Math.abs(s.gx - b.x) + Math.abs(s.gy - b.y);
        return d < best.d ? { s, d } : best;
      }, { s: null, d: Infinity }).s;
      if (nearest) assignSettlerToBuilding(nearest, b, true);
      updateInfoPanel(scene);
    }});
  }

  function removeWorkerAction(lineIdx, b) {
    actions.push({ lineIndex: lineIdx, cb: () => {
      if (b.settlers.length === 0) return;
      unassignSettler(b.settlers[b.settlers.length - 1]);
      updateInfoPanel(scene);
    }});
  }

  function demolishAction(lineIdx, b) {
    actions.push({ lineIndex: lineIdx, cb: () => {
      demolishBuilding(scene, b.x, b.y);
      updateInfoPanel(scene);
      updateResourceUI(scene);
    }});
  }

  if (state.selectedBuilding) {
    const b = state.selectedBuilding;

    // --- WRECKAGE ---
    if (b.type === "wreckage") {
      if (b.constructing) {
        const builders = b.settlers.filter(s => s.state === "building").length;
        const canAdd = b.settlers.length < MAX_SETTLERS_PER_BUILDING;
        const canRemove = b.settlers.length > 0;
        lines = ["Crash Wreckage", "SALVAGING...", `Progress: ${Math.floor(b.buildProgress * 100)}%`, `Workers: ${builders}/${MAX_SETTLERS_PER_BUILDING}`,
          "[+WORKER]", "[-WORKER]", "[CANCEL]"];
        colors = ["#cc8844", "#ffaa00", "#ffffff", "#ffffff",
          canAdd ? "#44ff44" : "#666666", canRemove ? "#ffaa44" : "#666666", "#ff4444"];
        addWorkerAction(4, b);
        removeWorkerAction(5, b);
        actions.push({ lineIndex: 6, cb: () => {
          cancelSalvage(scene, b.x, b.y);
          updateInfoPanel(scene);
        }});
      } else {
        lines = ["Crash Wreckage", "Salvage for resources", "", "[SALVAGE]"];
        colors = ["#cc8844", "#aaaaaa", "", "#44ff44"];
        actions.push({ lineIndex: 3, cb: () => {
          salvageWreckage(scene, b.x, b.y);
          updateInfoPanel(scene);
        }});
      }
    }
    // --- FABRICATION WORKSHOP ---
    else if (b.type === "fabrication" && !b.constructing) {
      const bt = BUILDING_TYPES[b.type];
      const workers = b.settlers.filter(s => s.state === "working").length;
      const canAdd = b.settlers.length < MAX_SETTLERS_PER_BUILDING;
      const canRemove = b.settlers.length > 0;
      lines = [bt.name, `Workers: ${workers}/${MAX_SETTLERS_PER_BUILDING}`,
        "[+WORKER]", "[-WORKER]",
        `Recipe: ${b.activeRecipe ? RECIPES[b.activeRecipe].name : "None"}`, ""];
      colors = ["#cc8844", "#ffffff",
        canAdd ? "#44ff44" : "#666666", canRemove ? "#ffaa44" : "#666666",
        "#88cc88", ""];
      addWorkerAction(2, b);
      removeWorkerAction(3, b);

      // Recipe buttons — "None" first
      let recipeIdx = lines.length;
      const noneActive = !b.activeRecipe;
      lines.push(`${noneActive ? ">" : " "} None`);
      colors.push(noneActive ? "#44ff44" : "#aaaaff");
      actions.push({ lineIndex: recipeIdx, cb: () => {
        b.activeRecipe = null;
        updateInfoPanel(scene);
      }});
      recipeIdx++;

      for (const [key, recipe] of Object.entries(RECIPES)) {
        if (!isRecipeUnlocked(key)) continue;
        const active = b.activeRecipe === key;
        const inputStr = Object.entries(recipe.inputs).map(([r, a]) => `${a}${r.slice(0, 3)}`).join("+");
        const outputStr = Object.entries(recipe.outputs).map(([r, a]) => `${a}${r.slice(0, 3)}`).join("+");
        lines.push(`${active ? ">" : " "} ${recipe.name} (${inputStr}->${outputStr})`);
        colors.push(active ? "#44ff44" : "#aaaaff");
        const rk = key;
        actions.push({ lineIndex: recipeIdx, cb: () => {
          b.activeRecipe = rk;
          updateInfoPanel(scene);
        }});
        recipeIdx++;
      }

      lines.push("[DEMOLISH]");
      colors.push("#ff4444");
      demolishAction(lines.length - 1, b);
    }
    // --- RESEARCH STATION ---
    else if (b.type === "researchStation" && !b.constructing) {
      const bt = BUILDING_TYPES[b.type];
      const workers = b.settlers.filter(s => s.state === "working").length;
      const activeResearch = state.research.active;
      const progressStr = activeResearch ? `${Math.floor(state.research.progress * 100)}%` : "None";
      const canAdd = b.settlers.length < MAX_SETTLERS_PER_BUILDING;
      const canRemove = b.settlers.length > 0;

      lines = [bt.name, `Workers: ${workers}/${MAX_SETTLERS_PER_BUILDING}`,
        "[+WORKER]", "[-WORKER]",
        `Researching: ${activeResearch ? TECH_TREE[activeResearch].name : "None"} ${progressStr}`, ""];
      colors = ["#9966cc", "#ffffff",
        canAdd ? "#44ff44" : "#666666", canRemove ? "#ffaa44" : "#666666",
        "#88cc88", ""];
      addWorkerAction(2, b);
      removeWorkerAction(3, b);

      // Cancel research button (if active)
      let techIdx = lines.length;
      if (activeResearch) {
        lines.push("[CANCEL RESEARCH]");
        colors.push("#ff8844");
        actions.push({ lineIndex: techIdx, cb: () => {
          state.research.active = null;
          state.research.progress = 0;
          updateInfoPanel(scene);
          updateResourceUI(scene);
        }});
        techIdx++;
      }

      // Tech buttons
      for (const [key, tech] of Object.entries(TECH_TREE)) {
        if (state.research.completed.includes(key)) {
          lines.push(`  ${tech.name} [DONE]`);
          colors.push("#666666");
          techIdx++;
          continue;
        }
        const prereqMet = tech.requires.every(r => state.research.completed.includes(r));
        if (!prereqMet) {
          lines.push(`  ${tech.name} [LOCKED]`);
          colors.push("#444444");
          techIdx++;
          continue;
        }
        const costStr = Object.entries(tech.cost).map(([r, a]) => `${a}${r.slice(0, 3)}`).join(",");
        const canStart = !activeResearch && Object.entries(tech.cost).every(([r, a]) => (resources[r] || 0) >= a);
        lines.push(`  ${tech.name} (${costStr})`);
        colors.push(canStart ? "#aaaaff" : "#ff6666");
        if (canStart) {
          const tk = key;
          actions.push({ lineIndex: techIdx, cb: () => {
            startResearch(tk);
            updateInfoPanel(scene);
            updateResourceUI(scene);
            rebuildSelector(scene);
            rebuildSidePanel(scene);
          }});
        }
        techIdx++;
      }

      lines.push("[DEMOLISH]");
      colors.push("#ff4444");
      demolishAction(lines.length - 1, b);
    }
    // --- GREENHOUSE ---
    else if (b.type === "greenhouse" && !b.constructing) {
      const bt = BUILDING_TYPES[b.type];
      const workers = b.settlers.filter(s => s.state === "working").length;
      const cropKey = b.selectedCrop || "basicAlgae";
      const cropName = CROP_TYPES[cropKey] ? CROP_TYPES[cropKey].name : "None";
      let statusStr = b.active ? "ACTIVE" : "INACTIVE";
      if (b.notConnected) statusStr = "NOT CONNECTED";
      const statusColor = b.active ? "#00ff00" : (b.notConnected ? "#ff8800" : "#ff4444");

      const canAdd = b.settlers.length < MAX_SETTLERS_PER_BUILDING;
      const canRemove = b.settlers.length > 0;
      lines = [bt.name, `Status: ${statusStr}`, `Crop: ${cropName}`, `Workers: ${workers}/${MAX_SETTLERS_PER_BUILDING}`,
        "[+WORKER]", "[-WORKER]", "-- Crops --"];
      colors = ["#22cc66", statusColor, "#88cc88", "#cccccc",
        canAdd ? "#44ff44" : "#666666", canRemove ? "#ffaa44" : "#666666", "#888888"];
      addWorkerAction(4, b);
      removeWorkerAction(5, b);

      // Crop selection buttons
      let cropIdx = lines.length;
      for (const [key, crop] of Object.entries(CROP_TYPES)) {
        const unlocked = isCropUnlocked(key);
        const active = cropKey === key;
        if (!unlocked) {
          const techName = TECH_TREE[crop.requiresResearch]?.name || "???";
          lines.push(`  ${crop.name} [LOCKED]`);
          colors.push("#444444");
        } else {
          const prodStr = Object.entries(crop.produces).map(([r, a]) => `+${a}${r.slice(0, 3)}`).join(",");
          const consStr = Object.entries(crop.consumes).map(([r, a]) => `-${a}${r.slice(0, 3)}`).join(",");
          const fullStr = consStr ? `${prodStr},${consStr}` : prodStr;
          lines.push(`${active ? ">" : " "} ${crop.name} (${fullStr})`);
          colors.push(active ? "#44ff44" : "#aaaaff");
          const ck = key;
          actions.push({ lineIndex: cropIdx, cb: () => {
            b.selectedCrop = ck;
            updateInfoPanel(scene);
          }});
        }
        cropIdx++;
      }

      lines.push("[DEMOLISH]");
      colors.push("#ff4444");
      demolishAction(lines.length - 1, b);
    }
    // --- REGULAR BUILDING ---
    else {
      const bt = BUILDING_TYPES[b.type];
      if (!bt) return;
      const workers = b.settlers.filter(s => s.state === "working").length;
      const builders = b.settlers.filter(s => s.state === "building").length;

      if (b.constructing) {
        const canAdd = b.settlers.length < MAX_SETTLERS_PER_BUILDING;
        const canRemove = b.settlers.length > 0;
        lines = [bt.name, "UNDER CONSTRUCTION", `Progress: ${Math.floor(b.buildProgress * 100)}%`, `Builders: ${builders}/${MAX_SETTLERS_PER_BUILDING}`,
          "[+WORKER]", "[-WORKER]", "[DEMOLISH]"];
        colors = ["#4488ff", "#ffaa00", "#ffffff", "#ffffff",
          canAdd ? "#44ff44" : "#666666", canRemove ? "#ffaa44" : "#666666", "#ff4444"];
        addWorkerAction(4, b);
        removeWorkerAction(5, b);
      } else {
        let statusStr = b.active ? "ACTIVE" : "INACTIVE";
        if (b.notConnected) statusStr = "NOT CONNECTED";
        const statusColor = b.active ? "#00ff00" : (b.notConnected ? "#ff8800" : "#ff4444");
        const settlerStr = bt.requiresSettlers ? `Workers: ${workers}/${MAX_SETTLERS_PER_BUILDING}` : "No workers needed";

        // Solar panel: show output % based on time of day
        let solarLine = null;
        if (b.type === "solar") {
          const solarFactor = Math.max(0.1, Math.sin(state.dayTime * Math.PI));
          const pct = Math.round(solarFactor * 100);
          const effectivePower = (bt.produces.power * solarFactor).toFixed(1);
          solarLine = `Output: ${pct}% (${effectivePower} Pwr)`;
        }

        if (bt.requiresSettlers) {
          const canAdd = b.settlers.length < MAX_SETTLERS_PER_BUILDING;
          const canRemove = b.settlers.length > 0;
          lines = [bt.name, `Status: ${statusStr}`, bt.description, settlerStr,
            "[+WORKER]", "[-WORKER]", "[DEMOLISH]"];
          colors = ["#4488ff", statusColor, "#cccccc", "#cccccc",
            canAdd ? "#44ff44" : "#666666", canRemove ? "#ffaa44" : "#666666", "#ff4444"];
          addWorkerAction(4, b);
          removeWorkerAction(5, b);
        } else if (solarLine) {
          lines = [bt.name, `Status: ${statusStr}`, solarLine, bt.description, settlerStr, "", "[DEMOLISH]"];
          colors = ["#4488ff", statusColor, "#ffdd00", "#cccccc", "#cccccc", "", "#ff4444"];
        } else if (b.type === "battery") {
          const cap = bt.batteryCapacity || 50;
          const charge = Math.floor(b.batteryCharge || 0);
          const pct = Math.round((charge / cap) * 100);
          lines = [bt.name, `Status: ${statusStr}`, `Charge: ${charge}/${cap} (${pct}%)`, bt.description, settlerStr, "", "[DEMOLISH]"];
          colors = ["#4488ff", statusColor, "#44cc44", "#cccccc", "#cccccc", "", "#ff4444"];
        } else {
          lines = [bt.name, `Status: ${statusStr}`, bt.description, settlerStr, "", "[DEMOLISH]"];
          colors = ["#4488ff", statusColor, "#cccccc", "#cccccc", "", "#ff4444"];
        }
      }
      demolishAction(lines.length - 1, b);
    }
  } else if (state.selectedSettler) {
    const s = state.selectedSettler;
    const stateNames = { idle: "Idle", walking: "Walking", building: "Building", working: "Working" };
    const assignedName = s.assignedBuilding ? (BUILDING_TYPES[s.assignedBuilding.type]?.name || "Wreckage") : "None";
    lines = [`Settler #${s.id}`, `State: ${stateNames[s.state] || s.state}`, `Assigned: ${assignedName}`, "", s.assignedBuilding ? "[UNASSIGN]" : ""];
    colors = ["#00dd00", "#ffffff", "#ffffff", "", "#ff4444"];
    if (s.assignedBuilding) {
      actions.push({ lineIndex: 4, cb: () => {
        unassignSettler(state.selectedSettler);
        state.selectedSettler = null;
        updateInfoPanel(scene);
      }});
    }
  } else {
    // --- SETTLER SIDEBAR ---
    lines = [`SETTLERS (${state.settlers.length}/${state.populationCap})`];
    colors = ["#00dd00"];

    const stateNames = { idle: "Idle", walking: "Walk", building: "Build", working: "Work" };
    const maxShow = Math.min(state.settlers.length, 12);
    for (let i = 0; i < maxShow; i++) {
      const s = state.settlers[i];
      const bName = s.assignedBuilding ? (BUILDING_TYPES[s.assignedBuilding.type]?.name || "Wreckage").slice(0, 10) : "---";
      lines.push(`#${s.id} ${stateNames[s.state] || s.state} ${bName}`);
      colors.push(s.state === "idle" ? "#888888" : "#aaaaaa");
      const idx = i;
      actions.push({ lineIndex: lines.length - 1, cb: () => {
        state.selectedSettler = state.settlers[idx];
        state.selectedBuilding = null;
        updateInfoPanel(scene);
      }});
    }

    if (state.settlers.length > 12) {
      lines.push(`... +${state.settlers.length - 12} more`);
      colors.push("#666666");
    }
  }

  // Draw panel
  const panelW = 244;
  const panelH = 10 + lines.length * 15 + 4;
  scene.infoBg.fillStyle(0x000000, 0.85);
  scene.infoBg.fillRoundedRect(px, py, panelW, panelH, 6);
  scene.infoBg.lineStyle(1, 0x4488ff, 1);
  scene.infoBg.strokeRoundedRect(px, py, panelW, panelH, 6);

  for (let i = 0; i < lines.length && i < scene.infoTexts.length; i++) {
    if (!lines[i]) continue;
    scene.infoTexts[i].setText(lines[i]);
    scene.infoTexts[i].setPosition(px + 8, py + 6 + i * 15);
    scene.infoTexts[i].setFill(colors[i] || "#ffffff");
    scene.infoTexts[i].setVisible(true);
  }

  // Wire up action zones
  for (let i = 0; i < actions.length && i < scene.actionZones.length; i++) {
    const a = actions[i];
    const z = scene.actionZones[i];
    z.setPosition(px + 8, py + 6 + a.lineIndex * 15);
    z.setSize(228, 14);
    z.setVisible(true);
    z.on("pointerdown", a.cb);
  }
}

// ==============================
// TUTORIAL
// ==============================
function hideTutorial(scene) {
  scene.tutorialBg.clear();
  scene.tutorialText.setVisible(false);
  scene.tutorialSkip.setVisible(false);
  scene.tutorialNext.setVisible(false);
  if (state.gameSpeed === 0) state.gameSpeed = 1;
}

export function updateTutorial(scene) {
  if (!state.tutorialActive) {
    hideTutorial(scene);
    return;
  }

  const step = TUTORIAL_STEPS[state.tutorialStep];
  if (!step) {
    state.tutorialActive = false;
    hideTutorial(scene);
    return;
  }

  if (step.auto) {
    state.tutorialTimer--;
    if (state.tutorialTimer <= 0) {
      state.tutorialStep++;
      const next = TUTORIAL_STEPS[state.tutorialStep];
      if (next && next.auto) {
        state.tutorialTimer = next.delay;
      }
      return;
    }
  } else if (step.condition && step.condition(state)) {
    state.tutorialStep++;
    const next = TUTORIAL_STEPS[state.tutorialStep];
    if (next && next.auto) {
      state.tutorialTimer = next.delay;
    }
    return;
  }

  // Draw tutorial bar
  const W = scene.cameras.main.width;
  const barW = Math.min(W - 40, 700);
  const barX = (W - barW) / 2;
  const barH = 54;
  const barY = 48;

  scene.tutorialBg.clear();
  scene.tutorialBg.fillStyle(0x000000, 0.8);
  scene.tutorialBg.fillRoundedRect(barX, barY, barW, barH, 6);
  scene.tutorialBg.lineStyle(1, 0x44aaff, 0.6);
  scene.tutorialBg.strokeRoundedRect(barX, barY, barW, barH, 6);

  scene.tutorialText.setWordWrapWidth(barW - 160);
  scene.tutorialText.setText(step.message);
  scene.tutorialText.setPosition(W / 2, barY + 10);
  scene.tutorialText.setVisible(true);
  scene.tutorialSkip.setVisible(true);

  // Show Next button on auto steps
  if (step.auto) {
    scene.tutorialNext.setPosition(barX + barW - 8, barY + 18);
    scene.tutorialNext.setVisible(true);
  } else {
    scene.tutorialNext.setVisible(false);
  }

  // Unpause once player needs to take action (non-auto step)
  if (!step.auto && state.gameSpeed === 0) {
    state.gameSpeed = 1;
  }
}
