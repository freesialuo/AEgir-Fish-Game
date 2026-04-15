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
const timeDisplay = document.getElementById("time-display");
const gameOverScreen = document.getElementById("game-over-screen");
const startScreen = document.getElementById("start-screen");
const playNowButton = document.getElementById("play-now-button");
const finalScoreDisplay = document.getElementById("final-score");
const leaderboardList = document.getElementById("leaderboard-list");
const restartButton = document.getElementById("restart-button");
const loadingScreen = document.getElementById("loading-screen");
const loadingText = document.getElementById("loading-text");

const app = createApplication({ width: GAME_WIDTH, height: GAME_HEIGHT });
gameWrapper.appendChild(app.view);

const keys = {};
let loadedResources = {};
let createVisualObject;
let player;
let scoreDisplay;
let accumulatedTimeMs = 0;

const state = {
  isGameOver: true,
  score: INITIAL_SCORE,
  hp: INITIAL_HP,
  entities: [],
  spawnTimer: 0,
  timeLeft: INITIAL_TIME_LEFT,
};

window.addEventListener("keydown", (event) => {
  const loweredKey = event.key.toLowerCase();
  const shouldStartGame =
    loweredKey === "p" || event.code === "Space";

  keys[event.key.toLowerCase()] = true;

  if (shouldStartGame) {
    event.preventDefault();
  }

  if (shouldStartGame && state.isGameOver && Object.keys(loadedResources).length > 0) {
    startGame();
  }
});

window.addEventListener("keyup", (event) => {
  keys[event.key.toLowerCase()] = false;
});

restartButton.addEventListener("click", startGame);
playNowButton.addEventListener("click", startGame);

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

function startGame() {
  startScreen.style.display = "none";
  gameOverScreen.style.display = "none";

  if (player) {
    player.destroy(removeView, app);
  }

  destroyEntities();
  createPlayer();
  resetState();
}

function endGame() {
  state.isGameOver = true;
  gameOverScreen.style.display = "flex";
  finalScoreDisplay.innerText = state.score;
  renderLeaderboard(saveScore(state.score));
}

function updateTime(delta) {
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

function stepGame(delta) {
  if (state.isGameOver) {
    return;
  }

  if (!updateTime(delta)) {
    return;
  }

  spawnEntities(delta);
  player.update(keys, state.hp);
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
      startScreen.style.display = "flex";
    })
    .catch((error) => {
      console.error("加载资源出错, 请检查路径:", error);
      if (loadingText) {
        loadingText.innerText = "加载失败，请按 F12 查看报错";
      }
    });
}

loadGame();
