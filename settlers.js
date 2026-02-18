import {
  GRID_SIZE, SETTLER_SPEED, SETTLER_H,
  MAX_SETTLERS_PER_BUILDING,
  BUILDING_TYPES,
  state
} from "./state.js";

// ==============================
// SPAWN SETTLER
// ==============================
export function spawnSettler(scene, gx, gy) {
  const s = {
    id: state.nextSettlerId++,
    gx: gx,
    gy: gy,
    state: "idle",
    targetGX: null,
    targetGY: null,
    assignedBuilding: null,
    rect: null,
    idleTimer: Math.random() * 2,
    manuallyAssigned: false
  };

  const { screenX, screenY } = scene.gridToScreen(gx, gy);
  const rect = scene.add.rectangle(screenX, screenY - SETTLER_H / 2, 6, SETTLER_H, 0x00dd00);
  rect.setDepth(2000 + screenY);
  rect.setInteractive();
  rect.settlerRef = s;
  s.rect = rect;

  scene.uiCamera.ignore(rect);

  state.settlers.push(s);
  return s;
}

// ==============================
// UPDATE SETTLER (per frame)
// ==============================
export function updateSettler(scene, s, dt) {
  if (dt === 0) {
    // Still update visuals when paused, just don't move
    s.rect.setVisible(s.state !== "working");
    if (state.selectedSettler === s) {
      s.rect.setStrokeStyle(2, 0xffffff);
    } else {
      s.rect.setStrokeStyle();
    }
    const { screenX, screenY } = scene.gridToScreen(s.gx, s.gy);
    s.rect.setPosition(screenX, screenY - SETTLER_H / 2);
    s.rect.setDepth(2000 + screenY);
    return;
  }

  if (s.state === "idle") {
    s.idleTimer -= dt;
    if (s.idleTimer <= 0) {
      // At night, idle settlers go to the spaceship
      const isNight = state.dayTime < 0.2 || state.dayTime > 0.8;
      const ship = isNight ? state.buildings.find(b => b.type === "spaceship") : null;
      if (ship && !s.assignedBuilding) {
        s.targetGX = ship.x + 0.5 + (Math.random() - 0.5) * 0.5;
        s.targetGY = ship.y + 0.5 + (Math.random() - 0.5) * 0.5;
      } else {
        s.targetGX = s.gx + (Math.random() - 0.5) * 6;
        s.targetGY = s.gy + (Math.random() - 0.5) * 6;
      }
      s.targetGX = Phaser.Math.Clamp(s.targetGX, 1, GRID_SIZE - 2);
      s.targetGY = Phaser.Math.Clamp(s.targetGY, 1, GRID_SIZE - 2);
      s.state = "walking";
    }
  }

  if (s.state === "walking") {
    const dx = s.targetGX - s.gx;
    const dy = s.targetGY - s.gy;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 0.1) {
      s.gx = s.targetGX;
      s.gy = s.targetGY;
      s.state = "idle";
      s.idleTimer = 1.5 + Math.random() * 3;
      s.targetGX = null;
      s.targetGY = null;

      if (s.assignedBuilding) {
        const b = s.assignedBuilding;
        if (b.constructing) {
          s.state = "building";
        } else {
          s.state = "working";
        }
      }
    } else {
      const step = SETTLER_SPEED * dt * 60; // normalize: dt*60 ≈ 1 at 60fps
      s.gx += (dx / dist) * step;
      s.gy += (dy / dist) * step;
    }
  }

  // Building/working settlers jitter near their building
  if (s.state === "building" || s.state === "working") {
    if (!s.assignedBuilding) {
      // Safeguard: reset orphaned settlers
      s.state = "idle";
      s.idleTimer = 0.5;
    } else {
      const b = s.assignedBuilding;
      const jitterX = Math.sin(Date.now() * 0.002 + s.id * 1.7) * 0.3;
      const jitterY = Math.cos(Date.now() * 0.0015 + s.id * 2.3) * 0.3;
      const targetX = b.x + 0.5 + jitterX;
      const targetY = b.y + 0.5 + jitterY;
      const lerpSpeed = 0.05 * dt * 60;
      s.gx += (targetX - s.gx) * lerpSpeed;
      s.gy += (targetY - s.gy) * lerpSpeed;
    }
  }

  // Hide settlers that are working inside a station
  s.rect.setVisible(s.state !== "working");

  // Selection outline
  if (state.selectedSettler === s) {
    s.rect.setStrokeStyle(2, 0xffffff);
  } else {
    s.rect.setStrokeStyle();
  }

  // Update visual position
  const { screenX, screenY } = scene.gridToScreen(s.gx, s.gy);
  s.rect.setPosition(screenX, screenY - SETTLER_H / 2);
  s.rect.setDepth(2000 + screenY);
}

// ==============================
// ASSIGN SETTLER TO BUILDING
// ==============================
export function assignSettlerToBuilding(settler, building, manual = false) {
  // Don't allow assignment to wreckage that isn't being salvaged
  if (building.type === "wreckage" && !building.constructing) return false;

  unassignSettler(settler);

  if (building.settlers.length >= MAX_SETTLERS_PER_BUILDING) return false;

  settler.assignedBuilding = building;
  building.settlers.push(settler);
  settler.targetGX = building.x + 0.5;
  settler.targetGY = building.y + 0.5;
  settler.state = "walking";
  settler.idleTimer = 0;
  settler.manuallyAssigned = manual;
  return true;
}

// ==============================
// UNASSIGN SETTLER
// ==============================
export function unassignSettler(settler) {
  if (settler.assignedBuilding) {
    const b = settler.assignedBuilding;
    b.settlers = b.settlers.filter(s => s !== settler);
    settler.assignedBuilding = null;
    settler.manuallyAssigned = false;
  }
  settler.state = "idle";
  settler.idleTimer = 0.5;
  settler.targetGX = null;
  settler.targetGY = null;
}

// ==============================
// AUTO-ASSIGN IDLE SETTLERS
// ==============================
export function autoAssignSettlers() {
  const idle = state.settlers.filter(s => s.state === "idle" && !s.assignedBuilding && !s.manuallyAssigned);
  if (idle.length === 0) return;

  for (const s of idle) {
    // Priority 1: construction sites
    let bestTarget = null;
    let bestDist = Infinity;

    for (const b of state.buildings) {
      if (b.constructing && b.settlers.length < MAX_SETTLERS_PER_BUILDING) {
        const d = Math.abs(s.gx - b.x) + Math.abs(s.gy - b.y);
        if (d < bestDist) { bestDist = d; bestTarget = b; }
      }
    }

    if (bestTarget) { assignSettlerToBuilding(s, bestTarget); continue; }

    // Priority 2: unmanned production buildings
    bestDist = Infinity;
    bestTarget = null;
    for (const b of state.buildings) {
      if (b.constructing) continue;
      if (b.type === "wreckage") continue;
      const bt = BUILDING_TYPES[b.type];
      if (!bt.requiresSettlers) continue;
      if (b.settlers.length === 0) {
        const d = Math.abs(s.gx - b.x) + Math.abs(s.gy - b.y);
        if (d < bestDist) { bestDist = d; bestTarget = b; }
      }
    }

    if (bestTarget) { assignSettlerToBuilding(s, bestTarget); }
  }
}

// ==============================
// FIND SETTLER AT SCREEN POS
// ==============================
export function findSettlerAt(scene, worldX, worldY) {
  let closest = null;
  let closestDist = 15;
  for (const s of state.settlers) {
    const { screenX, screenY } = scene.gridToScreen(s.gx, s.gy);
    const dx = worldX - screenX;
    const dy = worldY - (screenY - SETTLER_H / 2);
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < closestDist) { closestDist = dist; closest = s; }
  }
  return closest;
}

// ==============================
// POPULATION GROWTH
// ==============================
export function tryGrowPopulation(scene) {
  if (state.settlers.length >= state.populationCap) return;

  const homes = state.buildings.filter(b => b.type === "home" && !b.constructing);
  if (homes.length === 0) return;

  const home = homes[Math.floor(Math.random() * homes.length)];
  spawnSettler(scene, home.x + 0.5, home.y + 0.5);
}
