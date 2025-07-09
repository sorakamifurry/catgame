document.addEventListener('DOMContentLoaded', () => {
    // HTML要素の取得
    const gameContainer = document.getElementById('game-container');
    const scoreDisplay = document.getElementById('score');
    const timeLeftDisplay = document.getElementById('time-left');
    const gameOverMessage = document.getElementById('game-over-message');
    const restartButton = document.getElementById('restart-button');
    
    // グローバル変数
    let cat, catBottom, isJumping, gravity = 0.9;
    let isGameOver = false;
    let score = 0;
    let gameSpeed = 5;
    let fishAndBlocks = []; // 画面上の魚とブロックをすべて管理する配列
    let gameTimerId, speedTimerId, fishGeneratorId, blockGeneratorId;
    let fishSpawnCount = 1; // 魚の初期生成数
    let lastFishSpawnSpeedIncrease = 5; // 魚の生成数を最後に増やした時のgameSpeed (初期値は最初のgameSpeed)
    let fishGroupInterval = 100; // 魚が連なる際の生成間隔（ms）
    let timeLeft; 
    let isFishAttractionActive = false; // 魚の吸い寄せが有効かどうか
    let fishAttractionTimerId; // 吸い寄せ効果のタイマーID

    // 2段ジャンプのための変数
    let jumpCount = 0; // 現在のジャンプ回数
    const MAX_JUMPS = 2; // 最大ジャンプ回数

    // ★追加：オブジェクト重なり防止のための定数とヘルパー関数
    const SPAWN_X = 800; // アイテムが生成されるX座標
    const CONTAINER_HEIGHT = 500; // ゲームコンテナの高さ

    // アイテムの種類ごとの寸法を取得するヘルパー関数
    function getItemDimensions(type) {
        switch (type) {
            case 'fish': return { width: 50, height: 30 };
            case 'block': return { width: 130, height: 20 }; // ブロックの幅と高さは衝突判定から推測
            case 'can':
            case 'yellowCan':
            case 'blackCan': return { width: 30, height: 40 }; // 缶の幅と高さは衝突判定から推測
            default: return { width: 0, height: 0 };
        }
    }

    // 2つの矩形が重なっているかを判定するヘルパー関数
    function doRectanglesOverlap(rect1, rect2) {
        return rect1.left < rect2.left + rect2.width &&
               rect1.left + rect1.width > rect2.left &&
               rect1.bottom < rect2.bottom + rect2.height &&
               rect1.bottom + rect1.height > rect2.bottom;
    }

    // 重ならないbottom座標を見つけるヘルパー関数
    function findNonOverlappingBottom(newWidth, newHeight, initialY = -1) {
        let proposedBottom;
        let attempts = 0;
        const maxAttempts = 50; // 最大試行回数
        let foundValidPosition = false;

        while (attempts < maxAttempts && !foundValidPosition) {
            // initialYが指定されていて、かつ最初の試行の場合、そのY座標を優先して試す
            if (initialY !== -1 && attempts === 0) {
                proposedBottom = initialY;
            } else {
                // ランダムなY座標を生成し、画面内に収まるように調整
                proposedBottom = Math.random() * (CONTAINER_HEIGHT - newHeight);
                proposedBottom = Math.max(0, Math.min(proposedBottom, CONTAINER_HEIGHT - newHeight));
            }

            let overlaps = false;
            const newRect = {
                left: SPAWN_X,
                bottom: proposedBottom,
                width: newWidth,
                height: newHeight
            };

            // 既存のアイテムと重ならないかチェック
            for (let i = 0; i < fishAndBlocks.length; i++) {
                const existingItem = fishAndBlocks[i];
                const existingDimensions = getItemDimensions(existingItem.type);
                
                // アイテムが生成地点 (SPAWN_X) 付近にある場合のみ重なりチェック
                // これにより、画面左端に移動したアイテムとの無駄なチェックを避ける
                const SPAWN_AREA_BUFFER = 200; // 例えば、SPAWN_Xから左右200pxの範囲
                if (existingItem.left < SPAWN_X + SPAWN_AREA_BUFFER && existingItem.left + existingDimensions.width > SPAWN_X - SPAWN_AREA_BUFFER) {
                    const existingRect = {
                        left: existingItem.left,
                        bottom: existingItem.bottom,
                        width: existingDimensions.width,
                        height: existingDimensions.height
                    };

                    if (doRectanglesOverlap(newRect, existingRect)) {
                        overlaps = true;
                        break; // 重なりが見つかったら、この位置はNGなのでループを抜ける
                    }
                }
            }

            if (!overlaps) {
                foundValidPosition = true; // 重なりがなければ有効な位置
            }
            attempts++;
        }

        if (!foundValidPosition) {
            // 重ならない位置が見つからなかった場合のフォールバック（デバッグ用）
            console.warn("重ならない位置が見つかりませんでした。最後の候補位置を使用します。");
        }
        return proposedBottom; // 見つかった位置、または最後の候補位置を返す
    }
    // ★追加ここまで★


    // 猫の作成
    function createCat() {
        cat = document.createElement('div');
        cat.id = 'cat';
        cat.style.left = '50px';
        catBottom = 0;
        cat.style.bottom = catBottom + 'px';
        gameContainer.appendChild(cat);
    }

    // ジャンプ処理
    function jump() {
        // ジャンプ回数が最大ジャンプ数未満の場合にのみジャンプを許可
        if (jumpCount >= MAX_JUMPS) return; 

        isJumping = true;
        jumpCount++; // ジャンプ回数を増やす
        
        // 前回のジャンプのタイマーをクリアしてから新しいジャンプを開始
        // これにより、ジャンプ中に再度ジャンプしたときにスムーズに移行
        if (cat.upTimerId) clearInterval(cat.upTimerId); 
        if (cat.downTimerId) clearInterval(cat.downTimerId);

        // ゲームスピードに応じてジャンプ力と高さを計算
        const upSpeed = 30 + gameSpeed; 
        const jumpHeight = catBottom + (250 + (gameSpeed * 4)); 

        cat.upTimerId = setInterval(function () {
            // ジャンプの高さ制限に達したら落下へ
            if (catBottom >= jumpHeight) { 
                clearInterval(cat.upTimerId);
                fall();
            } else {
                catBottom += upSpeed; 
                cat.style.bottom = catBottom * gravity + 'px';
            }
        }, 20);
    }

    // 落下処理
    function fall() {
        // 前回のジャンプによる上昇タイマーが残っていたらクリア
        if (cat.upTimerId) clearInterval(cat.upTimerId);

        cat.downTimerId = setInterval(function () {
            // 地面に着いたか？
            if (catBottom <= 0) {
                clearInterval(cat.downTimerId);
                isJumping = false;
                catBottom = 0;
                cat.style.bottom = '0px';
                jumpCount = 0; // 地面に着いたらジャンプ回数をリセット
                return;
            }

            // ブロックの上に着地したか？
            for (let item of fishAndBlocks) {
                if (item.type === 'block') {
                    let block = item.element;
                    let blockLeft = parseInt(block.style.left);
                    let blockBottom = parseInt(block.style.bottom);

                    if (
                        (catBottom >= blockBottom + 15) && 
                        (catBottom <= blockBottom + 25) &&
                        (parseInt(cat.style.left) + 60 > blockLeft) && 
                        (parseInt(cat.style.left) < blockLeft + 130) 
                    ) {
                        clearInterval(cat.downTimerId);
                        isJumping = false;
                        catBottom = blockBottom + 20; 
                        cat.style.bottom = catBottom + 'px';
                        jumpCount = 0; 
                        return;
                    }
                }
            }

            // 落下を続ける (ゲームスピードに応じて落下速度を調整)
            catBottom -= (5 + gameSpeed * 0.5); 
            cat.style.bottom = catBottom + 'px';
        }, 20);
    }
    
    // キー操作
    function control(e) {
        // ゲームオーバーでなく、かつジャンプ回数がMAX_JUMPS未満の場合にジャンプを許可
        if (e.code === 'Space' && !isGameOver && jumpCount < MAX_JUMPS) {
            jump();
        }
    }

    // ★修正：魚の生成
    function generateFish(yPos = -1) { 
        const fish = document.createElement('div');
        fish.classList.add('fish');
        const newFishDimensions = getItemDimensions('fish');
        const proposedBottom = findNonOverlappingBottom(newFishDimensions.width, newFishDimensions.height, yPos);

        const fishData = {
            element: fish,
            type: 'fish',
            left: SPAWN_X, // 定数SPAWN_Xを使用
            bottom: proposedBottom 
        };
        fish.style.left = fishData.left + 'px';
        fish.style.bottom = fishData.bottom + 'px';
        gameContainer.appendChild(fish);
        fishAndBlocks.push(fishData);
    }

    // ★修正：ブロックの生成
    function generateBlock() {
        const block = document.createElement('div');
        block.classList.add('block');
        const newBlockDimensions = getItemDimensions('block');
        const proposedBottom = findNonOverlappingBottom(newBlockDimensions.width, newBlockDimensions.height);

        const blockData = {
            element: block,
            type: 'block',
            left: SPAWN_X, // 定数SPAWN_Xを使用
            bottom: proposedBottom 
        };
        block.style.left = blockData.left + 'px';
        block.style.bottom = blockData.bottom + 'px';
        gameContainer.appendChild(block);
        fishAndBlocks.push(blockData);
    }

    // ★修正：白い缶の生成関数
    function generateCan() {
        const can = document.createElement('div');
        can.classList.add('can');
        const newCanDimensions = getItemDimensions('can');
        const proposedBottom = findNonOverlappingBottom(newCanDimensions.width, newCanDimensions.height);

        const canData = {
            element: can,
            type: 'can',
            left: SPAWN_X, // 定数SPAWN_Xを使用
            bottom: proposedBottom 
        };
        can.style.left = canData.left + 'px';
        can.style.bottom = canData.bottom + 'px';
        gameContainer.appendChild(can);
        fishAndBlocks.push(canData);
    }

    // ★修正：黄色い缶の生成関数
    function generateYellowCan() {
        const yellowCan = document.createElement('div');
        yellowCan.classList.add('yellow-can');
        const newYellowCanDimensions = getItemDimensions('yellowCan');
        const proposedBottom = findNonOverlappingBottom(newYellowCanDimensions.width, newYellowCanDimensions.height);

        const yellowCanData = {
            element: yellowCan,
            type: 'yellowCan', 
            left: SPAWN_X, // 定数SPAWN_Xを使用
            bottom: proposedBottom
        };
        yellowCan.style.left = yellowCanData.left + 'px';
        yellowCan.style.bottom = yellowCanData.bottom + 'px';
        gameContainer.appendChild(yellowCan);
        fishAndBlocks.push(yellowCanData);
    }

    // ★修正：黒い缶の生成関数
    function generateBlackCan() {
        const blackCan = document.createElement('div');
        blackCan.classList.add('black-can');
        const newBlackCanDimensions = getItemDimensions('blackCan');
        const proposedBottom = findNonOverlappingBottom(newBlackCanDimensions.width, newBlackCanDimensions.height);

        const blackCanData = {
            element: blackCan,
            type: 'blackCan', 
            left: SPAWN_X, // 定数SPAWN_Xを使用
            bottom: proposedBottom 
        };
        blackCan.style.left = blackCanData.left + 'px';
        blackCan.style.bottom = blackCanData.bottom + 'px';
        gameContainer.appendChild(blackCan);
        fishAndBlocks.push(blackCanData);
    }
    // ★修正ここまで★

    // ゲームオーバー処理
    function gameOver() {
        isGameOver = true;
        // すべてのタイマーを停止
        clearInterval(gameTimerId);
        clearInterval(speedTimerId);
        clearTimeout(fishGeneratorId);
        clearTimeout(blockGeneratorId);
        fishAndBlocks.forEach(item => clearInterval(item.timerId)); 
        
        // 猫のジャンプ・落下タイマーも停止
        if (cat && cat.upTimerId) clearInterval(cat.upTimerId);
        if (cat && cat.downTimerId) clearInterval(cat.downTimerId);

        gameOverMessage.classList.remove('hidden'); 
    }

    // メインのゲームループ
    function gameLoop() {
        if (isGameOver) return;

        // 全ての魚とブロックを動かす
        fishAndBlocks.forEach((item, index) => {
            if (item.type === 'fish') {
                if (isFishAttractionActive) {
                    const fishX = item.left;
                    const fishY = item.bottom;
                    const catX = parseInt(cat.style.left);
                    const catY = catBottom;

                    const dx = catX - fishX;
                    const dy = catY - fishY;
                    const distance = Math.sqrt(dx * dx + dy * dy);

                    const attractionSpeed = (gameSpeed + 2); 

                    if (distance > 5) { 
                        item.left += (dx / distance) * attractionSpeed;
                        item.bottom += (dy / distance) * attractionSpeed;
                    }
                    item.left -= gameSpeed * 0.5; 
                } else {
                    item.left -= gameSpeed; 
                }

                item.element.style.left = item.left + 'px';
                item.element.style.bottom = item.bottom + 'px';
            } else {
                item.left -= gameSpeed; 
                item.element.style.left = item.left + 'px';
            }

            // 画面外に出たら削除
            if (item.left < -130) {
                gameContainer.removeChild(item.element);
                fishAndBlocks.splice(index, 1);
            }
            
            // 魚との当たり判定
            if (item.type === 'fish') {
                if (
                    item.left > 50 && item.left < 110 &&
                    catBottom + 60 > item.bottom &&
                    catBottom < item.bottom + 30
                ) {
                    gameContainer.removeChild(item.element);
                    fishAndBlocks.splice(index, 1);
                    score++;
                    scoreDisplay.innerText = score;
                }
            } 
            // 白い缶との当たり判定
            else if (item.type === 'can') {
                if (
                    item.left < parseInt(cat.style.left) + 60 && 
                    item.left + 30 > parseInt(cat.style.left) && 
                    catBottom + 60 > item.bottom && 
                    catBottom < item.bottom + 40 
                ) {
                    gameContainer.removeChild(item.element);
                    fishAndBlocks.splice(index, 1);
                    timeLeft += 3; 
                    timeLeftDisplay.innerText = timeLeft; 
                }
            }
            // 黄色い缶との当たり判定
            else if (item.type === 'yellowCan') {
                if (
                    item.left < parseInt(cat.style.left) + 60 && 
                    item.left + 30 > parseInt(cat.style.left) && 
                    catBottom + 60 > item.bottom && 
                    catBottom < item.bottom + 40 
                ) {
                    gameContainer.removeChild(item.element);
                    fishAndBlocks.splice(index, 1);
                    
                    if (fishAttractionTimerId) {
                        clearTimeout(fishAttractionTimerId);
                    }
                    
                    isFishAttractionActive = true; 
                    fishAttractionTimerId = setTimeout(() => {
                        isFishAttractionActive = false;
                        console.log("魚の吸い寄せ効果が終了しました。"); 
                    }, 5000); 
                    
                    console.log("黄色い缶を取りました！魚が吸い寄せられます。"); 
                }
            }
            // 黒い缶との当たり判定
            else if (item.type === 'blackCan') {
                if (
                    item.left < parseInt(cat.style.left) + 60 && 
                    item.left + 30 > parseInt(cat.style.left) && 
                    catBottom + 60 > item.bottom && 
                    catBottom < item.bottom + 40 
                ) {
                    gameContainer.removeChild(item.element);
                    fishAndBlocks.splice(index, 1);
                    
                    gameSpeed = Math.max(1, gameSpeed - 10); 
                    console.log("黒い缶を取りました！ゲームスピードが低下し、ここから加速します。現在のスピード:", gameSpeed); 
                }
            }
        });

        // 猫が空中に浮いていないかチェックする
        if (!isJumping && catBottom > 0) {
            let isSupported = false;
            // 足元にブロックがあるか確認
            for (const item of fishAndBlocks) {
                if (item.type === 'block') {
                    const blockLeft = item.left;
                    if (blockLeft < 50 + 60 && blockLeft + 130 > 50) {
                        if (catBottom === item.bottom + 20) {
                            isSupported = true;
                            break;
                        }
                    }
                }
            }

            // もし支えがなければ、落下させる
            if (!isSupported) {
                isJumping = true; 
                fall();
            }
        }
    }

    // ゲーム開始処理
    function startGame() {
        // 変数をリセット
        isGameOver = false;
        isJumping = false;
        score = 0;
        gameSpeed = 5; 
        timeLeft = 30; 
        timeLeftDisplay.innerText = timeLeft; 
        scoreDisplay.innerText = 0;
        gameOverMessage.classList.add('hidden');
        fishAndBlocks.forEach(item => gameContainer.removeChild(item.element));
        fishAndBlocks = [];
        if (cat) gameContainer.removeChild(cat);
        
        // 魚の生成数と最後に生成数を増やした時のスピードをリセット
        fishSpawnCount = 1; 
        lastFishSpawnSpeedIncrease = 5;
        jumpCount = 0; 
        isFishAttractionActive = false; 
        if (fishAttractionTimerId) clearTimeout(fishAttractionTimerId); 

        // ゲームの要素を初期化
        createCat();
        
        // メインループを開始
        gameTimerId = setInterval(gameLoop, 20);
        document.addEventListener('keydown', control);
        gameContainer.addEventListener('click', () => {
            if (!isGameOver && jumpCount < MAX_JUMPS) {
                jump();
            }
        });
        gameContainer.addEventListener('touchstart', (e) => {
            e.preventDefault(); 
            if (!isGameOver && jumpCount < MAX_JUMPS) {
                jump();
            }
        });
        
        // 制限時間のタイマー
        const countdownTimerId = setInterval(() => {
            if(isGameOver) {
                clearInterval(countdownTimerId);
                return;
            }
            timeLeft--; 
            timeLeftDisplay.innerText = timeLeft;
            
            // 残り時間に応じて魚の生成数をさらに増やす
            if (timeLeft <= 10 && fishSpawnCount < 10) { 
                fishSpawnCount = Math.min(10, fishSpawnCount + 1); 
            } else if (timeLeft <= 5 && fishSpawnCount < 15) { 
                fishSpawnCount = Math.min(15, fishSpawnCount + 2); 
            } else if (timeLeft <= 2 && fishSpawnCount < 20) { 
                fishSpawnCount = Math.min(20, fishSpawnCount + 5); 
            }


            if (timeLeft <= 0) {
                clearInterval(countdownTimerId);
                gameOver();
            }
        }, 1000);

        // 加速タイマー
        speedTimerId = setInterval(() => {
            if (!isGameOver) {
                gameSpeed += 2; 
                const speedIncreaseThreshold = 8; 
                if (gameSpeed - lastFishSpawnSpeedIncrease >= speedIncreaseThreshold) {
                    fishSpawnCount++;
                    lastFishSpawnSpeedIncrease = gameSpeed; 
                }
            }
        }, 4000); 

        // アイテム生成を開始
        (function generateItems() {
            if (isGameOver) return;

            // fishSpawnCount の数だけ魚を生成
            for (let i = 0; i < fishSpawnCount; i++) {
                setTimeout(() => {
                    generateFish(); 
                }, i * fishGroupInterval); 
            }

            // 確率でブロックも生成
            if (Math.random() > 0.4) {
                generateBlock();
            }
            
            // 白い缶の生成
            if (Math.random() > 0.7) { 
                generateCan();
            }

            // 黄色い缶の生成
            if (Math.random() > 0.85) { 
                generateYellowCan();
            }

            // 黒い缶の生成
            if (Math.random() > 0.95) { 
                generateBlackCan();
            }

            // 次のアイテム生成までの時間を調整
            let baseDelay = 500; 
            if (timeLeft <= 10) { 
                baseDelay = 200; 
            } else if (timeLeft <= 5) { 
                baseDelay = 100; 
            } else if (timeLeft <= 2) { 
                baseDelay = 50; 
            }
            
            let nextGenerateDelay = Math.random() * 500 + baseDelay; 
            if (fishSpawnCount > 1) { 
                nextGenerateDelay += (fishSpawnCount - 1) * fishGroupInterval;
            }
            nextGenerateDelay = Math.max(nextGenerateDelay, 50); 

            fishGeneratorId = setTimeout(generateItems, nextGenerateDelay); 
        })();
    }

    // リスタートボタンのイベント
    restartButton.addEventListener('click', startGame);

    // 最初のゲームを開始
    startGame();
});