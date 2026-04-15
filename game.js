// ==========================================
// 1. 全局配置中心 (Game Config)
// ==========================================
// - type: 'spine' 代表加载骨骼动画，'image' 代表加载普通静态图片。
// - 路径可以自由指向不同的文件夹。

const GameConfig = {
    bgUrl: 'assets/bg.jpg', // 背景图片
    scoreUIUrl: 'assets/score_bg.png', //盟约图片
    
    // 玩家配置
    player: { 
        type: 'spine', 
        url: 'assets/player/player.skel',
        baseSize: 80 // 初始宽度
    },
    
    // 敌怪鱼池配置
    fishVariants: [
        { type: 'spine', url: 'assets/syjely/syjely.skel', minSize: 50, maxSize: 60, minSpeed: 1, maxSpeed: 3, weight: 40, scoreValue: 1 },
        { type: 'spine', url: 'assets/ghost/ghost.skel', minSize: 60, maxSize: 80, minSpeed: 2, maxSpeed: 3, weight: 25, scoreValue: 2 },
        { type: 'spine', url: 'assets/skadi/skadi.skel', minSize: 60, maxSize: 100, minSpeed: 2, maxSpeed: 3, weight: 20, scoreValue: 3 },
        { type: 'spine', url: 'assets/glady/glady.skel', minSize: 130, maxSize: 160, minSpeed: 4, maxSpeed: 6, weight: 20, scoreValue: 5 },
        { type: 'spine', url: 'assets/ulpia/ulpia.skel', minSize: 180, maxSize: 300, minSpeed: 1, maxSpeed: 2, weight: 5, scoreValue: 10 }
    ],

    // 奖励物品配置
    rewardVariants: [
        { type: 'image', url: 'assets/rewards/special_reward.png', minSize: 80, maxSize: 80, minSpeed: 2, maxSpeed: 2, weight: 100, scoreValue: 20 }
    ],

    // 惩罚物品配置
    punishVariants: [
        { type: 'spine', url: 'assets/punishes/jellyboss/jellyboss.skel', minSize: 180, maxSize: 180, minSpeed: 1, maxSpeed: 1, weight: 40, scoreValue: 0 },
        { type: 'spine', url: 'assets/punishes/enemy_1152_dsurch_2/enemy_1152_dsurch_2.skel', minSize: 100, maxSize: 100, minSpeed: 1, maxSpeed: 1, weight: 60, scoreValue: -10 }

    ]
};

// ==========================================
// 2. 引擎初始化与资源加载
// ==========================================

const gameWrapper = document.getElementById('game-wrapper');
const app = new PIXI.Application({
    width: 1920,
    height: 1080,
    backgroundColor: 0x0a4263,
    resolution: window.devicePixelRatio || 1,
});
gameWrapper.appendChild(app.view);
app.view.style.position = 'absolute';
app.view.style.top = '0';
app.view.style.left = '0';
app.view.style.zIndex = '1';

let loadedResources = {};

const allUrls = new Set();
allUrls.add(GameConfig.bgUrl);
allUrls.add(GameConfig.player.url);
allUrls.add(GameConfig.scoreUIUrl);
GameConfig.fishVariants.forEach(v => allUrls.add(v.url));
GameConfig.rewardVariants.forEach(v => allUrls.add(v.url));
GameConfig.punishVariants.forEach(v => allUrls.add(v.url));

PIXI.Assets.load(Array.from(allUrls), (progress) => {
    document.getElementById('loading-text').innerText = `资源加载中 (${Math.round(progress * 100)}%)...`;
}).then((resources) => {
    loadedResources = resources;
    document.getElementById('loading-screen').style.display = 'none';
    
    const bgSprite = new PIXI.Sprite(resources[GameConfig.bgUrl]);
    bgSprite.width = 1920;
    bgSprite.height = 1080;
    app.stage.addChildAt(bgSprite, 0);
    
    
    const scoreCont = new PIXI.Container();
    
    const scoreBg = new PIXI.Sprite(resources[GameConfig.scoreUIUrl]);
    scoreBg.anchor.set(0.5); 

    //图标位置
    scoreBg.x = 0; 
    scoreBg.y = 50;
    
    scoreBg.width = 120;  
    scoreBg.height = 120;  
    
    scoreCont.addChild(scoreBg);    

    scorePixiText = new PIXI.Text('0', { fill: 0xffffff, fontSize: 36, fontWeight: 'bold' });
    scorePixiText.anchor.set(0.5);

    //数字位置
    scorePixiText.x = 0; 
    scorePixiText.y = 110;

    scoreCont.addChild(scorePixiText);
    
    scoreCont.position.set(1920 / 2, 80);
    app.stage.addChild(scoreCont);

    app.ticker.add(gameLoop);
    
    startGame();
}).catch(err => {
    console.error("加载资源出错, 请检查路径:", err);
    document.getElementById('loading-text').innerText = "加载失败，请按 F12 查看报错";
});


// ==========================================
// 3. 核心状态与通用工具
// ==========================================

let isGameOver = true;
let score = 0;
let hp = 5;
let entities = [];
let keys = {};
let spawnTimer = 0;

let timeLeft = 60; // 倒计时变量
let scorePixiText;

window.addEventListener('keydown', e => keys[e.key.toLowerCase()] = true);
window.addEventListener('keyup', e => keys[e.key.toLowerCase()] = false);
window.addEventListener('keydown', e => {
    if (e.code === 'Space' && isGameOver && Object.keys(loadedResources).length > 0) startGame();
});

function getRandomVariant(variantsArray) {
    let totalWeight = variantsArray.reduce((sum, variant) => sum + variant.weight, 0);
    let randomNum = Math.random() * totalWeight;
    let currentWeight = 0;
    for (let variant of variantsArray) {
        currentWeight += variant.weight;
        if (randomNum <= currentWeight) return variant;
    }
    return variantsArray[0];
}

function createVisualObject(config) {
    let view;
    const resource = loadedResources[config.url];
    
    if (config.type === 'spine') {
        view = new PIXI.spine.Spine(resource.spineData);
        if (view.state.hasAnimation('Move')) view.state.setAnimation(0, 'Move', true);
        else if (view.state.hasAnimation('Default')) view.state.setAnimation(0, 'Default', true);
    } else {
        view = new PIXI.Sprite(resource);
        view.anchor.set(0.5);
    }
    app.stage.addChild(view);
    return view;
}

// ==========================================
// 4. 玩家类
// ==========================================

class Player {
    constructor() {
        this.logicalX = 1920 / 2;
        this.logicalY = 1080 / 2;
        
        this.view = createVisualObject(GameConfig.player);
        this.view.x = this.logicalX;
        this.view.y = this.logicalY;

        this.width = GameConfig.player.baseSize;
        this.targetWidth = this.width; 
        this.lastRecoveryWidth = this.width;
        
        this.ratio = 1;
        const bounds = this.view.getLocalBounds();
        if (bounds.width > 0) this.ratio = bounds.height / bounds.width;
        this.height = this.width * this.ratio;

        this.speed = 4;
        this.invincibleTimer = 0;

        // 最大血量上限
        this.maxHp = 5; 

        this.hpContainer = new PIXI.Container();
        
        this.hpBg = new PIXI.Graphics();
        this.hpBg.beginFill(0x333333);
        this.hpBg.drawRect(-50, 0, 100, 10);
        this.hpBg.endFill();
        this.hpContainer.addChild(this.hpBg);

        // 2. 实际血量 (绿色/红色)
        this.hpFill = new PIXI.Graphics();
        this.hpContainer.addChild(this.hpFill);

        this.hpText = new PIXI.Text(`HP: ${hp}/${this.maxHp}`, { fill: 0xffffff, fontSize: 14, fontWeight: 'bold' });
        this.hpText.anchor.set(0.5, 1);
        this.hpText.position.set(0, -2);
        this.hpContainer.addChild(this.hpText);

        app.stage.addChild(this.hpContainer);
    }

    update() {
        if (keys['w'] || keys['arrowup']) this.logicalY -= this.speed;
        if (keys['s'] || keys['arrowdown']) this.logicalY += this.speed;
        if (keys['a'] || keys['arrowleft']) this.logicalX -= this.speed;
        if (keys['d'] || keys['arrowright']) this.logicalX += this.speed;

        this.logicalX = Math.max(0, Math.min(1920, this.logicalX));
        this.logicalY = Math.max(0, Math.min(1080, this.logicalY));

        // 变大速率
        this.width += (this.targetWidth - this.width) * 0.002;
        this.height = this.width * this.ratio;

        this.view.x = this.logicalX;
        this.view.y = this.logicalY;
        
        const scaleFactor = this.width / this.view.getLocalBounds().width;
        let flipX = (keys['a'] || keys['arrowleft']) ? -1 : ((keys['d'] || keys['arrowright']) ? 1 : Math.sign(this.view.scale.x) || 1);
        this.view.scale.set(scaleFactor * flipX, scaleFactor);

        // 无敌帧闪烁特效 (通过透明度控制)
        if (this.invincibleTimer > 0) {
            this.invincibleTimer--;
            this.view.alpha = (Math.floor(Date.now() / 100) % 2 === 0) ? 0.3 : 1;
        } else {
            this.view.alpha = 1;
        }

        const verticalOffset = (this.height / 2) - this.height * 0.3; 
        this.hpContainer.position.set(this.logicalX, this.logicalY + verticalOffset);

        let uiScale = Math.max(1, this.width / 100);
        this.hpContainer.scale.set(uiScale);

        this.hpText.text = `HP: ${hp}/${this.maxHp}`;
        
        let hpPercentage = Math.max(0, hp / this.maxHp);
        this.hpFill.clear();
        
        // 血量低于 40% 变黄，低于 20% 变红
        let barColor = hpPercentage > 0.4 ? 0x00FF00 : (hpPercentage > 0.2 ? 0xFFFF00 : 0xFF0000);
        
        this.hpFill.beginFill(barColor);
        this.hpFill.drawRect(-50, 0, 100 * hpPercentage, 10); 
        this.hpFill.endFill();
    }

    takeDamage() {
        if (this.invincibleTimer <= 0) {
            hp--;
            this.invincibleTimer = 120; // 无敌帧数，约2秒无敌
            
            if (this.view instanceof PIXI.spine.Spine && this.view.state.hasAnimation('Interact')) {
                this.view.state.setAnimation(0, 'Interact', false);
                this.view.state.addAnimation(0, 'Move', true, 0);
            }

            if (hp <= 0) endGame();
        }
    }
    
    destroy() {
        if (this.view) {
            app.stage.removeChild(this.view);
            this.view.destroy();
        }
        if (this.hpContainer) {
            app.stage.removeChild(this.hpContainer);
            this.hpContainer.destroy({ children: true });
        }
    }
}

// ==========================================
// 5. 实体类 (鱼 / 奖励 / 惩罚)
// ==========================================

class Entity {
    constructor(category) {
        this.category = category;
        
        let variantConf;
        if (category === 'fish') variantConf = getRandomVariant(GameConfig.fishVariants);
        else if (category === 'reward') variantConf = getRandomVariant(GameConfig.rewardVariants);
        else variantConf = getRandomVariant(GameConfig.punishVariants);

        this.config = variantConf;
        
        if (Math.random() > 0.5) {
            this.logicalX = Math.random() > 0.5 ? -200 : 2120;
            this.logicalY = Math.random() * 1080;
        } else {
            this.logicalX = Math.random() * 1920;
            this.logicalY = Math.random() > 0.5 ? -200 : 1280;
        }

        this.view = createVisualObject(this.config);
        
        let randomLogicalWidth = Math.random() * (this.config.maxSize - this.config.minSize) + this.config.minSize;
        this.speed = Math.random() * (this.config.maxSpeed - this.config.minSpeed) + this.config.minSpeed;
        
        this.width = randomLogicalWidth;
        let bounds = this.view.getLocalBounds();
        this.ratio = bounds.width > 0 ? (bounds.height / bounds.width) : 1;
        this.height = this.width * this.ratio;

        const scaleFactor = this.width / bounds.width;

        let angle = Math.atan2((1080/2 - 200 + Math.random()*400) - this.logicalY, (1920/2 - 200 + Math.random()*400) - this.logicalX);
        this.vx = Math.cos(angle) * this.speed;
        this.vy = Math.sin(angle) * this.speed;

        let flipX = this.vx < 0 ? -1 : 1;
        this.view.scale.set(scaleFactor * flipX, scaleFactor);
    }

    update() {
        this.logicalX += this.vx;
        this.logicalY += this.vy;
        this.view.x = this.logicalX;
        this.view.y = this.logicalY;
    }

    isOffScreen() {
        return (this.logicalX < -300 || this.logicalX > 2220 || this.logicalY < -300 || this.logicalY > 1380);
    }

    destroy() {
        if (this.view) {
            app.stage.removeChild(this.view);
            this.view.destroy();
        }
    }
}

// ==========================================
// 6. 游戏主循环控制
// ==========================================

let player;

function checkCollision(obj1, obj2) {
    const rect1 = { x: obj1.logicalX - obj1.width/2, y: obj1.logicalY - obj1.height/2, w: obj1.width, h: obj1.height };
    const rect2 = { x: obj2.logicalX - obj2.width/2, y: obj2.logicalY - obj2.height/2, w: obj2.width, h: obj2.height };
    
    return rect1.x < rect2.x + rect2.w &&
           rect1.x + rect1.w > rect2.x &&
           rect1.y < rect2.y + rect2.h &&
           rect1.y + rect1.h > rect2.y;
}

function startGame() {
    document.getElementById('game-over-screen').style.display = 'none';
    
    if (player) player.destroy();
    entities.forEach(e => e.destroy());
    
    entities = [];
    player = new Player();
    score = 0;
    hp = 5;
    timeLeft = 60; //重置倒计时
    spawnTimer = 0;
    isGameOver = false;
}

function endGame() {
    isGameOver = true;
    document.getElementById('game-over-screen').style.display = 'flex';
    document.getElementById('final-score').innerText = score;
    
    let board = JSON.parse(localStorage.getItem('fishGameScores')) || [];
    board.push(score);
    board.sort((a, b) => b - a);
    board = board.slice(0, 5);
    localStorage.setItem('fishGameScores', JSON.stringify(board));

    const listUl = document.getElementById('leaderboard-list');
    listUl.innerHTML = '';
    board.forEach((s, index) => {
        listUl.innerHTML += `<li>第 ${index + 1} 名: ${s} 分</li>`;
    });
}

function gameLoop(delta) {
    if (isGameOver) return;

    const deltaSeconds = delta / 60; 
    timeLeft -= deltaSeconds;

    if (timeLeft <= 0) {
        timeLeft = 0;
        document.getElementById('time-display').innerText = "0";
        endGame();
        return;
    }
    document.getElementById('time-display').innerText = Math.ceil(timeLeft);

    // 实体生成频率
    spawnTimer += delta;
    if (spawnTimer % 40 < delta) entities.push(new Entity('fish'));
    if (spawnTimer % 850 < delta) entities.push(new Entity('reward'));
    if (spawnTimer % 700 < delta) entities.push(new Entity('punish'));

    player.update();

    for (let i = entities.length - 1; i >= 0; i--) {
        let e = entities[i];
        e.update();

        if (checkCollision(player, e)) {
            let playerArea = player.width * player.height;
            let entityArea = e.width * e.height;

            if (e.category === 'fish') {
                if (player.width * 1.2 >= e.width) {
                    score += (e.config.scoreValue || 10);
                    let growthFactor = Math.sqrt(entityArea) * 0.1;
                    player.targetWidth += growthFactor;
                    
                    if (player.targetWidth - player.lastRecoveryWidth >= 80) { //每增长像素值
                        hp = Math.min(hp + 1, 5); // 生命增加上限
                        player.lastRecoveryWidth = player.targetWidth;
                        
                        // 回血闪烁颜色
                        if (player && player.hpText) {
                            player.hpText.style.fill = 0x00FF00;
                            setTimeout(() => { 
                                if(player && player.hpText) player.hpText.style.fill = 0xffffff; 
                            }, 500);
                        }
                    }

                    if (player.view instanceof PIXI.spine.Spine && player.view.state.hasAnimation('Interact')) {
                        player.view.state.setAnimation(0, 'Interact', false);
                        player.view.state.addAnimation(0, 'Move', true, 0);
                    }

                    e.destroy();
                    entities.splice(i, 1);
                } else {
                    player.takeDamage();
                }
            } else if (e.category === 'reward') {
                score += e.config.scoreValue; 
                e.destroy();
                entities.splice(i, 1);
            } else if (e.category === 'punish') {
                score += e.config.scoreValue; 
                player.takeDamage(); 
                e.destroy();
                entities.splice(i, 1);
            }
        } else if (e.isOffScreen()) {
            e.destroy();
            entities.splice(i, 1);
        }
    }

    if (scorePixiText) scorePixiText.text = score;
}