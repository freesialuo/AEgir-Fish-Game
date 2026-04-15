import { loadGameAssets, updateLoadingText } from "./assets.js";
import {
  FIXED_TIMESTEP_MS,
  GAME_CONFIG,
  GAME_HEIGHT,
  GAME_WIDTH,
  INITIAL_HP,
  INITIAL_SCORE,
  INITIAL_TIME_LEFT,
  MAX_FRAME_TIME_MS,
} from "./config.js";
import { Entity } from "./entities/entity.js";
import { Player } from "./entities/player.js";
import { checkCollision } from "./systems/collision.js";
import { saveScore } from "./systems/leaderboard.js";
import {
  applyCollisionResult,
  getCollisionOutcome,
} from "./systems/rules.js";
import { getSpawnCategories } from "./systems/spawn.js";
import {
  createApplication,
  createBackground,
  createHpBackground,
  createHpFill,
  createHpText,
  createScoreDisplay,
  createVisualObjectFactory,
  removeView,
} from "./systems/view.js";

const gameWrapper = document.getElementById("game-wrapper");
const hud = document.getElementById("hud");
const timeDisplay = document.getElementById("time-display");
const gameOverScreen = document.getElementById("game-over-screen");
const finalScoreDisplay = document.getElementById("final-score");
const leaderboardList = document.getElementById("leaderboard-list");
const restartButton = document.getElementById("restart-button");
const loadingScreen = document.getElementById("loading-screen");
const loadingText = document.getElementById("loading-text");

const app = createApplication({ width: GAME_WIDTH, height: GAME_HEIGHT });
gameWrapper.appendChild(app.view);

const keys = {};
const demoKeys = {
  w: false,
  a: false,
  s: false,
  d: false,
  arrowup: false,
  arrowleft: false,
  arrowdown: false,
  arrowright: false,
};
let loadedResources = {};
let createVisualObject;
let player;
let scoreDisplay;
let accumulatedTimeMs = 0;
let demoRestartTimeoutId = null;

const state = {
  isGameOver: true,
  mode: "demo",
  score: INITIAL_SCORE,
  hp: INITIAL_HP,
  entities: [],
  spawnTimer: 0,
  timeLeft: INITIAL_TIME_LEFT,
  demoTargetX: GAME_WIDTH / 2,
  demoTargetY: GAME_HEIGHT / 2,
  demoDecisionTimer: 0,
};

window.addEventListener("keydown", (event) => {
  const loweredKey = event.key.toLowerCase();
  const shouldStartGame = loweredKey === "p";
  const shouldReturnToDemo = event.code === "Escape";

  keys[loweredKey] = true;

  if (shouldStartGame || shouldReturnToDemo) {
    event.preventDefault();
  }

  if (shouldReturnToDemo && state.mode === "play") {
    startGame("demo");
    return;
  }

  if (
    shouldStartGame &&
    Object.keys(loadedResources).length > 0 &&
    (state.mode === "demo" || state.isGameOver)
  ) {
    startGame("play");
  }
});

window.addEventListener("keyup", (event) => {
  keys[event.key.toLowerCase()] = false;
});

restartButton.addEventListener("click", () => startGame("play"));

function renderLeaderboard(scores) {
  leaderboardList.innerHTML = "";
  scores.forEach((score, index) => {
    leaderboardList.innerHTML += `<li>第 ${index + 1} 名: ${score} 分</li>`;
  });
}

function resetState() {
  state.score = INITIAL_SCORE;
  state.hp = INITIAL_HP;
  state.spawnTimer = 0;
  state.timeLeft = INITIAL_TIME_LEFT;
  state.isGameOver = false;
  accumulatedTimeMs = 0;
  timeDisplay.innerText = String(INITIAL_TIME_LEFT);
}

function clearPlayerInput() {
  Object.keys(keys).forEach((key) => {
    keys[key] = false;
  });
}

function clearDemoInput() {
  Object.keys(demoKeys).forEach((key) => {
    demoKeys[key] = false;
  });
}

function destroyEntities() {
  state.entities.forEach((entity) => entity.destroy(removeView));
  state.entities = [];
}

function createPlayer() {
  player = new Player({
    createVisualObject,
    app,
    hpBgFactory: createHpBackground,
    hpFillFactory: createHpFill,
    hpTextFactory: createHpText,
  });
}

function scheduleDemoRestart(delayMs) {
  if (demoRestartTimeoutId) {
    window.clearTimeout(demoRestartTimeoutId);
  }

  demoRestartTimeoutId = window.setTimeout(() => {
    demoRestartTimeoutId = null;
    startGame("demo");
  }, delayMs);
}

function startGame(mode = "play") {
  if (demoRestartTimeoutId) {
    window.clearTimeout(demoRestartTimeoutId);
    demoRestartTimeoutId = null;
  }

  state.mode = mode;
  gameOverScreen.style.display = "none";
  hud.style.display = mode === "demo" ? "none" : "block";

  if (scoreDisplay?.parent) {
    scoreDisplay.parent.visible = mode !== "demo";
  }

  if (player) {
    player.destroy(removeView, app);
  }

  destroyEntities();
  createPlayer();
  resetState();
  clearPlayerInput();
  clearDemoInput();
  state.demoDecisionTimer = 0;
  state.demoTargetX = GAME_WIDTH / 2;
  state.demoTargetY = GAME_HEIGHT / 2;
}

function endGame() {
  state.isGameOver = true;

  if (state.mode === "demo") {
    scheduleDemoRestart(1200);
    return;
  }

  gameOverScreen.style.display = "flex";
  finalScoreDisplay.innerText = state.score;
  renderLeaderboard(saveScore(state.score));
  scheduleDemoRestart(6000);
}

function updateTime(delta) {
  if (state.mode === "demo") {
    return true;
  }

  const deltaSeconds = delta / 60;
  state.timeLeft -= deltaSeconds;

  if (state.timeLeft <= 0) {
    state.timeLeft = 0;
    timeDisplay.innerText = "0";
    endGame();
    return false;
  }

  timeDisplay.innerText = String(Math.ceil(state.timeLeft));
  return true;
}

function spawnEntities(delta) {
  state.spawnTimer += delta;

  getSpawnCategories(state.spawnTimer, delta).forEach((category) => {
    state.entities.push(new Entity(category, createVisualObject));
  });
}

function handleCollision(entity, index) {
  const result = getCollisionOutcome({
    category: entity.category,
    playerWidth: player.width,
    entityWidth: entity.width,
    entityArea: entity.width * entity.height,
    entityScoreValue: entity.config.scoreValue,
    playerInvincibleTimer: player.invincibleTimer,
  });

  if (result.removeEntity) {
    entity.destroy(removeView);
    state.entities.splice(index, 1);
  }

  const nextState = applyCollisionResult({
    score: state.score,
    hp: state.hp,
    targetWidth: player.targetWidth,
    lastRecoveryWidth: player.lastRecoveryWidth,
    result,
  });

  state.score = nextState.score;
  state.hp = nextState.hp;
  player.targetWidth = nextState.targetWidth;
  player.invincibleTimer = nextState.invincibleTimer;
  player.lastRecoveryWidth = nextState.lastRecoveryWidth;

  if (nextState.healedHp) {
    player.flashHealText();
  }

  if (result.shouldPlayInteract) {
    player.playInteractAnimation();
  }

  if (state.hp <= 0) {
    endGame();
  }
}

function updateEntities() {
  for (let index = state.entities.length - 1; index >= 0; index--) {
    const entity = state.entities[index];
    entity.update();

    if (checkCollision(player, entity)) {
      handleCollision(entity, index);
      if (state.isGameOver) {
        return;
      }
    } else if (entity.isOffScreen()) {
      entity.destroy(removeView);
      state.entities.splice(index, 1);
    }
  }
}

function updateDemoTarget() {
  state.demoDecisionTimer -= 1;

  const threats = [];
  const opportunities = [];

  state.entities.forEach((entity) => {
    const dx = entity.logicalX - player.logicalX;
    const dy = entity.logicalY - player.logicalY;
    const distance = Math.hypot(dx, dy) || 1;
    const isThreat =
      entity.category !== "fish" || entity.width > player.width * 1.2;

    if (isThreat) {
      threats.push({ dx, dy, distance });
      return;
    }

    opportunities.push({
      x: entity.logicalX,
      y: entity.logicalY,
      distance,
      weight: entity.category === "reward" ? 2.4 : 1.2,
    });
  });

  let steerX = 0;
  let steerY = 0;

  threats.forEach((threat) => {
    if (threat.distance > 420) {
      return;
    }

    const force = (420 - threat.distance) / 420;
    steerX -= (threat.dx / threat.distance) * force * 2.6;
    steerY -= (threat.dy / threat.distance) * force * 2.6;
  });

  const closestOpportunity = opportunities.sort(
    (left, right) => left.distance - right.distance,
  )[0];

  if (closestOpportunity) {
    steerX +=
      ((closestOpportunity.x - player.logicalX) / closestOpportunity.distance) *
      closestOpportunity.weight;
    steerY +=
      ((closestOpportunity.y - player.logicalY) / closestOpportunity.distance) *
      closestOpportunity.weight;
  }

  const shouldRetarget =
    state.demoDecisionTimer <= 0 ||
    Math.hypot(state.demoTargetX - player.logicalX, state.demoTargetY - player.logicalY) < 80;

  if (shouldRetarget) {
    state.demoDecisionTimer = 45 + Math.floor(Math.random() * 45);
    state.demoTargetX = 220 + Math.random() * (GAME_WIDTH - 440);
    state.demoTargetY = 180 + Math.random() * (GAME_HEIGHT - 360);
  }

  const wanderDx = state.demoTargetX - player.logicalX;
  const wanderDy = state.demoTargetY - player.logicalY;
  const wanderDistance = Math.hypot(wanderDx, wanderDy) || 1;

  steerX += (wanderDx / wanderDistance) * 0.35;
  steerY += (wanderDy / wanderDistance) * 0.35;

  clearDemoInput();

  if (steerX > 0.12) {
    demoKeys.d = true;
    demoKeys.arrowright = true;
  } else if (steerX < -0.12) {
    demoKeys.a = true;
    demoKeys.arrowleft = true;
  }

  if (steerY > 0.12) {
    demoKeys.s = true;
    demoKeys.arrowdown = true;
  } else if (steerY < -0.12) {
    demoKeys.w = true;
    demoKeys.arrowup = true;
  }
}

function stepGame(delta) {
  if (state.isGameOver) {
    return;
  }

  if (!updateTime(delta)) {
    return;
  }

  spawnEntities(delta);
  if (state.mode === "demo") {
    updateDemoTarget();
  }

  player.update(state.mode === "demo" ? demoKeys : keys, state.hp);
  updateEntities();
  player.updateHpBar(state.hp);

  if (scoreDisplay) {
    scoreDisplay.text = String(state.score);
  }
}

function gameLoop() {
  if (state.isGameOver) {
    accumulatedTimeMs = 0;
    return;
  }

  accumulatedTimeMs += Math.min(app.ticker.elapsedMS, MAX_FRAME_TIME_MS);

  // Run the simulation at a fixed 60 Hz so browser/frame variance changes
  // smoothness but not spawn cadence, movement, or overall difficulty.
  while (accumulatedTimeMs >= FIXED_TIMESTEP_MS) {
    stepGame(1);
    accumulatedTimeMs -= FIXED_TIMESTEP_MS;

    if (state.isGameOver) {
      accumulatedTimeMs = 0;
      break;
    }
  }
}

function loadGame() {
  loadGameAssets(GAME_CONFIG, updateLoadingText)
    .then((resources) => {
      loadedResources = resources;
      loadingScreen.style.display = "none";
      if (loadingText) {
        loadingText.innerText = "";
      }

      const bgSprite = createBackground(resources[GAME_CONFIG.bgUrl], {
        width: GAME_WIDTH,
        height: GAME_HEIGHT,
      });
      app.stage.addChildAt(bgSprite, 0);

      scoreDisplay = createScoreDisplay(app, resources[GAME_CONFIG.scoreUIUrl]);
      createVisualObject = createVisualObjectFactory(app, resources);

      app.ticker.add(gameLoop);
      startGame("demo");
    })
    .catch((error) => {
      console.error("加载资源出错, 请检查路径:", error);
      if (loadingText) {
        loadingText.innerText = "加载失败，请按 F12 查看报错";
      }
    });
}

loadGame();
