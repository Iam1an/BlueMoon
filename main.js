import {
  TILE_WIDTH, TILE_HEIGHT, GRID_SIZE, TICK_RATE,
  STARTING_SETTLERS, POP_GROW_INTERVAL, DAY_LENGTH,
  BUILDING_TYPES, BUILDING_KEYS,
  state
} from "./state.js";
import { canAfford, isBuildingUnlocked, drawIsoBox, placeBuilding, canPlaceAtPosition, redrawBuildings, processConstruction, processProduction, spawnWreckage, processMeteorStorm } from "./buildings.js";
import { spawnSettler, updateSettler, assignSettlerToBuilding, findSettlerAt, autoAssignSettlers, tryGrowPopulation } from "./settlers.js";
import { createUI, updateResourceUI, updateBuildingSelector, updateInfoPanel, rebuildSelector, rebuildSidePanel, updateTutorial } from "./ui.js";

// ==============================
// MENU SCENE
// ==============================
class MenuScene extends Phaser.Scene {
  constructor() {
    super("menu");
  }

  create() {
    const W = this.cameras.main.width;
    const H = this.cameras.main.height;

    this.cameras.main.setBackgroundColor("#2a2a2a");

    this.add.text(W / 2, H / 2 - 80, "BLUE MOON", {
      fontSize: "48px", fontFamily: "monospace", fill: "#ffffff", fontStyle: "bold"
    }).setOrigin(0.5, 0.5);

    this.add.text(W / 2, H / 2 - 30, "A Space Colony Game", {
      fontSize: "16px", fontFamily: "monospace", fill: "#aaaaaa"
    }).setOrigin(0.5, 0.5);

    // Play button
    const btnW = 160, btnH = 48;
    const btnX = W / 2 - btnW / 2;
    const btnY = H / 2 + 30;

    const btnGfx = this.add.graphics();
    btnGfx.fillStyle(0x336633, 1);
    btnGfx.fillRoundedRect(btnX, btnY, btnW, btnH, 8);
    btnGfx.lineStyle(2, 0x00ff00, 1);
    btnGfx.strokeRoundedRect(btnX, btnY, btnW, btnH, 8);

    this.add.text(W / 2, btnY + btnH / 2, "PLAY", {
      fontSize: "24px", fontFamily: "monospace", fill: "#00ff00", fontStyle: "bold"
    }).setOrigin(0.5, 0.5);

    const btnZone = this.add.zone(btnX, btnY, btnW, btnH).setOrigin(0, 0).setInteractive();
    btnZone.on("pointerdown", () => {
      this.scene.start("game");
    });
    btnZone.on("pointerover", () => {
      btnGfx.clear();
      btnGfx.fillStyle(0x448844, 1);
      btnGfx.fillRoundedRect(btnX, btnY, btnW, btnH, 8);
      btnGfx.lineStyle(2, 0x44ff44, 1);
      btnGfx.strokeRoundedRect(btnX, btnY, btnW, btnH, 8);
    });
    btnZone.on("pointerout", () => {
      btnGfx.clear();
      btnGfx.fillStyle(0x336633, 1);
      btnGfx.fillRoundedRect(btnX, btnY, btnW, btnH, 8);
      btnGfx.lineStyle(2, 0x00ff00, 1);
      btnGfx.strokeRoundedRect(btnX, btnY, btnW, btnH, 8);
    });
  }
}

// ==============================
// MAIN SCENE
// ==============================
class GameScene extends Phaser.Scene {
  constructor() {
    super("game");
  }

  preload() {
    this.load.image("ground", "assets/ground_tile.png");
    this.load.image("solar1", "assets/solar_lvl1.png");
    this.load.image("solar2", "assets/Solar-Panel2.png");
    this.load.image("battery", "assets/battery.png");
    this.load.image("scrap", "assets/scrap-pile2.png");
    this.load.image("settler", "assets/Settler.png");
    this.load.spritesheet("buildings", "assets/buildings_spritesheet.png", {
      frameWidth: 130,
      frameHeight: 200
    });
  }

  create() {
    this.input.mouse.disableContextMenu();

    const W = this.cameras.main.width;
    const H = this.cameras.main.height;

    const worldWidth = GRID_SIZE * TILE_WIDTH;
    const worldHeight = GRID_SIZE * TILE_HEIGHT;
    this.cameras.main.setBounds(
      -worldWidth, -worldHeight,
      worldWidth * 2 + TILE_WIDTH * 2, worldHeight * 2 + TILE_HEIGHT * 4
    );

    this.uiCamera = this.cameras.add(0, 0, W, H);
    this.uiCamera.setScroll(0, 0);

    this.originX = this.cameras.main.width / 2;
    this.originY = 120;

    for (let x = 0; x < GRID_SIZE; x++) {
      state.grid[x] = [];
      for (let y = 0; y < GRID_SIZE; y++) {
        state.grid[x][y] = null;
      }
    }

    this.isPanning = false;
    this.panStart = { x: 0, y: 0 };
    this.camStart = { x: 0, y: 0 };

    this.drawGround();

    this.buildingGraphics = this.add.graphics().setDepth(5000);
    this.progressGraphics = this.add.graphics().setDepth(9000);
    this.hoverGraphics = this.add.graphics().setDepth(10000);

    this.uiCamera.ignore(this.buildingGraphics);
    this.uiCamera.ignore(this.progressGraphics);
    this.uiCamera.ignore(this.hoverGraphics);

    this.solarSprites = [];

    // Day/night overlay — covers game view, below UI
    this.dayOverlay = this.add.rectangle(
      W / 2, H / 2, W * 4, H * 4,
      0x000000, 0
    ).setScrollFactor(0).setDepth(15000);
    this.uiCamera.ignore(this.dayOverlay);

    this.setupInput();
    createUI(this);

    // Place spaceship at center
    const shipX = 25, shipY = 25;
    const spaceship = {
      type: "spaceship",
      x: shipX, y: shipY,
      active: true,
      constructing: false,
      buildProgress: 0,
      settlers: [],
      batteryCharge: 0
    };
    state.grid[shipX][shipY] = spaceship;
    state.buildings.push(spaceship);

    // Spawn wreckage near crash site
    spawnWreckage(this, 18);

    // Spawn starting settlers near spaceship
    for (let i = 0; i < STARTING_SETTLERS; i++) {
      spawnSettler(this, shipX + (Math.random() - 0.5) * 4, shipY + (Math.random() - 0.5) * 4);
    }

    // Center camera on the spaceship / colonists
    const shipScreen = this.gridToScreen(shipX, shipY);
    this.cameras.main.centerOn(shipScreen.screenX, shipScreen.screenY);

    this.time.addEvent({ delay: TICK_RATE, loop: true, callback: () => this.gameTick() });
    this.time.addEvent({ delay: POP_GROW_INTERVAL, loop: true, callback: () => { if (state.gameSpeed === 0) return; tryGrowPopulation(this); updateResourceUI(this); } });

    updateResourceUI(this);
  }

  update(time, delta) {
    const dt = state.gameSpeed === 0 ? 0 : delta / 1000;
    for (const s of state.settlers) {
      updateSettler(this, s, dt);
    }
    this.updateDayOverlay();
  }

  getDayNightColor(t) {
    // Keyframes: [time, r, g, b, alpha]
    const keys = [
      [0.00, 10, 10, 42, 0.45],  // midnight — dark blue
      [0.20, 80, 40, 30, 0.20],  // pre-dawn — dark orange
      [0.28, 255, 102, 51, 0.12],// dawn — orange-pink
      [0.40, 255, 220, 180, 0.04],// morning — warm
      [0.50, 255, 255, 204, 0.02],// noon — clear
      [0.60, 255, 220, 180, 0.04],// afternoon
      [0.72, 255, 102, 51, 0.15],// dusk — orange
      [0.80, 80, 40, 30, 0.25],  // twilight
      [0.90, 10, 10, 42, 0.40],  // night
      [1.00, 10, 10, 42, 0.45]   // midnight wrap
    ];

    // Find surrounding keyframes
    let i = 0;
    while (i < keys.length - 1 && keys[i + 1][0] <= t) i++;
    if (i >= keys.length - 1) return { color: (keys[0][1] << 16) | (keys[0][2] << 8) | keys[0][3], alpha: keys[0][4] };

    const a = keys[i], b = keys[i + 1];
    const frac = (t - a[0]) / (b[0] - a[0]);
    const r = Math.round(a[1] + (b[1] - a[1]) * frac);
    const g = Math.round(a[2] + (b[2] - a[2]) * frac);
    const bl = Math.round(a[3] + (b[3] - a[3]) * frac);
    const alpha = a[4] + (b[4] - a[4]) * frac;
    return { color: (r << 16) | (g << 8) | bl, alpha };
  }

  updateDayOverlay() {
    const { color, alpha } = this.getDayNightColor(state.dayTime);
    this.dayOverlay.setFillStyle(color, alpha);
    const W = this.cameras.main.width;
    const H = this.cameras.main.height;
    this.dayOverlay.setPosition(W / 2, H / 2);
    this.dayOverlay.setSize(W * 4, H * 4);
  }

  gameTick() {
    updateTutorial(this);
    if (state.gameSpeed === 0) return; // paused

    const prevCompleted = [...state.research.completed];

    // Day advances at a rate that gives 5 min/day at speed 1, 10 min/day at speed 2
    state.dayTime += 1 / (DAY_LENGTH * state.gameSpeed);
    if (state.dayTime >= 1) {
      state.dayTime -= 1;
      state.dayCount++;
    }

    processConstruction(this);
    autoAssignSettlers();
    processProduction();

    // Storm countdown
    state.stormTimer--;
    if (state.stormTimer <= 0) {
      this.triggerMeteorStorm();
    }

    // Check if new research completed — rebuild UI
    if (state.research.completed.length > prevCompleted.length) {
      rebuildSelector(this);
      rebuildSidePanel(this);
    }

    redrawBuildings(this);
    updateResourceUI(this);
    updateInfoPanel(this);
  }

  triggerMeteorStorm() {
    state.stormActive = true;

    // Visual feedback: screen flash
    const flash = this.add.rectangle(
      this.cameras.main.width / 2,
      this.cameras.main.height / 2,
      this.cameras.main.width,
      this.cameras.main.height,
      0xffffff, 0.6
    ).setScrollFactor(0).setDepth(30000).setOrigin(0.5, 0.5);
    this.cameras.main.ignore(flash);

    const stormWarning = this.add.text(
      this.cameras.main.width / 2,
      this.cameras.main.height / 2 - 40,
      "SOLAR RAIN!",
      { fontSize: "36px", fontFamily: "monospace", fill: "#ff2200", fontStyle: "bold" }
    ).setOrigin(0.5, 0.5).setScrollFactor(0).setDepth(30001);
    this.cameras.main.ignore(stormWarning);

    this.tweens.add({
      targets: flash,
      alpha: 0,
      duration: 1500,
      onComplete: () => flash.destroy()
    });
    this.tweens.add({
      targets: stormWarning,
      alpha: 0,
      duration: 2500,
      delay: 500,
      onComplete: () => stormWarning.destroy()
    });

    processMeteorStorm(this);
    updateResourceUI(this);
    updateInfoPanel(this);
    rebuildSelector(this);
  }

  drawGround() {
    for (let x = 0; x < GRID_SIZE; x++) {
      for (let y = 0; y < GRID_SIZE; y++) {
        const { screenX, screenY } = this.gridToScreen(x, y);
        const tile = this.add.image(screenX, screenY + TILE_HEIGHT * 1.5, "ground");
        tile.setOrigin(0.5, 1);
        tile.setDepth(screenY);
        this.uiCamera.ignore(tile);
      }
    }
  }

  setupInput() {
    // Left click
    this.input.on("pointerdown", (pointer) => {
      if (pointer.rightButtonDown() || this.isPanning) return;
      if (pointer.y > this.cameras.main.height - 70) return;

      const W = this.cameras.main.width;
      const infoPanelVisible = state.selectedBuilding || state.selectedSettler || state.selectedType === null;
      if (infoPanelVisible && pointer.x > W - 220 && pointer.y > 48) return;
      // Don't intercept side panel clicks
      if (pointer.x < 155 && pointer.y > 48) return;

      const worldPoint = pointer.positionToCamera(this.cameras.main);
      const tile = this.screenToGrid(worldPoint.x, worldPoint.y);

      // 1. If settler selected and clicking a building → assign settler (manual)
      if (state.selectedSettler && tile && state.grid[tile.x][tile.y] !== null) {
        assignSettlerToBuilding(state.selectedSettler, state.grid[tile.x][tile.y], true);
        state.selectedSettler = null;
        updateInfoPanel(this);
        return;
      }

      // 2. If clicking a building tile → select building
      if (tile && state.grid[tile.x][tile.y] !== null) {
        state.selectedBuilding = state.grid[tile.x][tile.y];
        state.selectedSettler = null;
        updateInfoPanel(this);
        return;
      }

      // 3. If clicking near a settler on empty ground → select settler
      const clickedSettler = findSettlerAt(this, worldPoint.x, worldPoint.y);
      if (clickedSettler) {
        state.selectedSettler = clickedSettler;
        state.selectedBuilding = null;
        updateInfoPanel(this);
        return;
      }

      // 4. If building type selected and empty tile → place building
      if (tile && state.selectedType !== null) {
        placeBuilding(this, tile.x, tile.y, state.selectedType);
        state.selectedBuilding = null;
        state.selectedSettler = null;
        updateInfoPanel(this);
        updateResourceUI(this);
        return;
      }

      // 5. Otherwise → deselect everything
      state.selectedBuilding = null;
      state.selectedSettler = null;
      updateInfoPanel(this);
    });

    // Right click pan
    this.input.on("pointerdown", (pointer) => {
      if (!pointer.rightButtonDown()) return;
      this.isPanning = true;
      this.panStart.x = pointer.x;
      this.panStart.y = pointer.y;
      this.camStart.x = this.cameras.main.scrollX;
      this.camStart.y = this.cameras.main.scrollY;
    });

    this.input.on("pointerup", (pointer) => {
      if (pointer.rightButtonReleased()) this.isPanning = false;
    });

    // Hover
    this.input.on("pointermove", (pointer) => {
      this.hoverGraphics.clear();
      const worldPoint = pointer.positionToCamera(this.cameras.main);

      if (this.isPanning) {
        this.cameras.main.scrollX = this.camStart.x - (pointer.x - this.panStart.x);
        this.cameras.main.scrollY = this.camStart.y - (pointer.y - this.panStart.y);
      }

      if (pointer.y > this.cameras.main.height - 70) return;

      const tile = this.screenToGrid(worldPoint.x, worldPoint.y);
      if (!tile) return;

      const { screenX, screenY } = this.gridToScreen(tile.x, tile.y);
      const occupied = state.grid[tile.x][tile.y] !== null;

      let hoverColor;
      if (state.selectedType === null) {
        if (!occupied) return;
        hoverColor = 0x00aaff;
      } else if (occupied) {
        hoverColor = 0x00aaff;
      } else if (canAfford(state.selectedType) && canPlaceAtPosition(tile.x, tile.y, state.selectedType)) {
        hoverColor = 0x00ff00;
      } else {
        hoverColor = 0xff0000;
      }

      this.hoverGraphics.lineStyle(2, hoverColor, 1);
      this.hoverGraphics.beginPath();
      this.hoverGraphics.moveTo(screenX, screenY - TILE_HEIGHT / 2);
      this.hoverGraphics.lineTo(screenX + TILE_WIDTH / 2, screenY);
      this.hoverGraphics.lineTo(screenX, screenY + TILE_HEIGHT / 2);
      this.hoverGraphics.lineTo(screenX - TILE_WIDTH / 2, screenY);
      this.hoverGraphics.closePath();
      this.hoverGraphics.strokePath();

      if (state.selectedType !== null && !occupied && canAfford(state.selectedType) && canPlaceAtPosition(tile.x, tile.y, state.selectedType)) {
        const bt = BUILDING_TYPES[state.selectedType];
        if (bt) drawIsoBox(this.hoverGraphics, screenX, screenY, bt.color, bt.height, 0.4);
      }
    });

    // Zoom
    this.input.on("wheel", (pointer, go, dx, deltaY) => {
      const cam = this.cameras.main;
      cam.zoom = Phaser.Math.Clamp(cam.zoom + (deltaY > 0 ? -0.1 : 0.1), 0.3, 3);
    });

    // Keyboard
    this.input.keyboard.on("keydown", (event) => {
      if (event.key === " ") {
        state.gameSpeed = state.gameSpeed === 0 ? 1 : 0;
        state.tutorialPaused = false;
        updateResourceUI(this);
        return;
      }
      if (event.key === "Escape" || event.key === "0") {
        state.selectedType = null;
        state.selectedBuilding = null;
        state.selectedSettler = null;
        updateBuildingSelector(this);
        updateInfoPanel(this);
        return;
      }
      const num = parseInt(event.key);
      const availableKeys = BUILDING_KEYS.filter(k => isBuildingUnlocked(k));
      if (num >= 1 && num <= availableKeys.length) {
        state.selectedType = availableKeys[num - 1];
        state.selectedSettler = null;
        updateBuildingSelector(this);
      }
    });
  }

  gridToScreen(x, y) {
    return {
      screenX: (x - y) * TILE_WIDTH / 2 + this.originX,
      screenY: (x + y) * TILE_HEIGHT / 2 + this.originY
    };
  }

  screenToGrid(screenX, screenY) {
    screenY -= TILE_HEIGHT * 0.5;
    screenY += TILE_HEIGHT / 2;
    const x = ((screenX - this.originX) / (TILE_WIDTH / 2) + (screenY - this.originY) / (TILE_HEIGHT / 2)) / 2;
    const y = ((screenY - this.originY) / (TILE_HEIGHT / 2) - (screenX - this.originX) / (TILE_WIDTH / 2)) / 2;
    const gx = Math.round(x);
    const gy = Math.round(y);
    if (gx < 0 || gx >= GRID_SIZE || gy < 0 || gy >= GRID_SIZE) return null;
    return { x: gx, y: gy };
  }
}

const config = {
  type: Phaser.AUTO,
  width: 800,
  height: 600,
  backgroundColor: "#2a2a2a",
  scene: [MenuScene, GameScene],
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH
  }
};

new Phaser.Game(config);
