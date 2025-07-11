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
    let fishAndBlocks = []; // 画面上の魚とブロック、缶をすべて管理する配列
    let gameTimerId, speedTimerId, fishGeneratorId; // blockGeneratorIdは使用されていないため削除
    let fishSpawnCount = 1; // 魚の初期生成数
    let lastFishSpawnSpeedIncrease = 5; // 魚の生成数を最後に増やした時のgameSpeed (初期値は最初のgameSpeed)
    let fishGroupInterval = 100; // 魚が連なる際の生成間隔（ms）
    let timeLeft;
    let isFishAttractionActive = false; // 魚の吸い寄せが有効かどうか
    let fishAttractionTimerId; // 吸い寄せ効果のタイマーID

    // 2段ジャンプのための変数
    let jumpCount = 0; // 現在のジャンプ回数
    const MAX_JUMPS = 2; // 最大ジャンプ回数

    // オブジェクト重なり防止のための定数とヘルパー関数
    const SPAWN_X = 800; // アイテムが生成されるX座標
    const CONTAINER_HEIGHT = 500; // ゲームコンテナの高さ

    // アイテムの種類ごとの寸法を取得するヘルパー関数
    function getItemDimensions(type) {
        switch (type) {
            case 'fish': return { width: 50, height: 30 };
            case 'block': return { width: 130, height: 20 };
            case 'can':
            case 'yellowCan':
            case 'blackCan': return { width: 30, height: 40 };
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
        const maxAttempts = 50;
        let foundValidPosition = false;

        while (attempts < maxAttempts && !foundValidPosition) {
            if (initialY !== -1 && attempts === 0) {
                proposedBottom = initialY;
            } else {
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

            for (let i = 0; i < fishAndBlocks.length; i++) {
                const existingItem = fishAndBlocks[i];
                const existingDimensions = getItemDimensions(existingItem.type);
                
                const SPAWN_AREA_BUFFER = 200; 
                if (existingItem.left < SPAWN_X + SPAWN_AREA_BUFFER && existingItem.left + existingDimensions.width > SPAWN_X - SPAWN_AREA_BUFFER) {
                    const existingRect = {
                        left: existingItem.left,
                        bottom: existingItem.bottom,
                        width: existingDimensions.width,
                        height: existingDimensions.height
                    };

                    if (doRectanglesOverlap(newRect, existingRect)) {
                        overlaps = true;
                        break; 
                    }
                }
            }

            if (!overlaps) {
                foundValidPosition = true;
            }
            attempts++;
        }

        if (!foundValidPosition) {
            console.warn("重ならない位置が見つかりませんでした。最後の候補位置を使用します。");
        }
        return proposedBottom;
    }

    // 猫の作成
    function createCat() {
        cat = document.createElement('div');
        cat.id = 'cat';
        cat.style.left = '50px';
        // CSSのbottom値と合わせる
        catBottom = -85; 
        cat.style.bottom = catBottom + 'px';
        gameContainer.appendChild(cat);
    }

    // ジャンプ処理
    function jump() {
        if (jumpCount >= MAX_JUMPS) return; 

        isJumping = true;
        jumpCount++; 
        
        if (cat.upTimerId) clearInterval(cat.upTimerId); 
        if (cat.downTimerId) clearInterval(cat.downTimerId);

        // ゲームスピードに応じてジャンプ力と高さを計算
        const upSpeed = 30 + gameSpeed; 
        const jumpHeight = catBottom + (250 + (gameSpeed * 4)); 

        cat.upTimerId = setInterval(function () {
            if (catBottom >= jumpHeight) { 
                clearInterval(cat.upTimerId);
                fall();
            } else {
                catBottom += upSpeed; 
                cat.style.bottom = catBottom + 'px';
            }
        }, 20);
    }

    // 落下処理
    function fall() {
        if (cat.upTimerId) clearInterval(cat.upTimerId);

        cat.downTimerId = setInterval(function () {
            // 地面に着いたか？ (CSSのbottom値と合わせる)
            if (catBottom <= -85) { 
                clearInterval(cat.downTimerId);
                isJumping = false;
                catBottom = -85; 
                cat.style.bottom = '-85px'; 
                jumpCount = 0; 
                return;
            }

            // ブロックの上に着地したか？
            for (let item of fishAndBlocks) {
                if (item.type === 'block') {
                    let block = item.element;
                    let blockLeft = parseInt(block.style.left);
                    let blockBottom = parseInt(block.style.bottom);
                    const blockHeight = getItemDimensions('block').height;

                    // 猫の当たり判定の微調整のための定数（gameLoop()のものを再利用）
                    const CAT_COLLISION_WIDTH = 180;  
                    const CAT_COLLISION_OFFSET_X = 35; 

                    // 猫の衝突ボックスの左右の境界を計算
                    const catCollisionLeft = parseInt(cat.style.left) + CAT_COLLISION_OFFSET_X;
                    const catCollisionRight = catCollisionLeft + CAT_COLLISION_WIDTH;
                    const blockRight = blockLeft + getItemDimensions('block').width;

                    // 猫とブロックが水平方向に重なっているか（より正確な当たり判定）
                    const isOverlappingHorizontally = 
                        (catCollisionLeft < blockRight) && 
                        (catCollisionRight > blockLeft);

                    // 猫がこのブロックに着地した際に、最終的に設定されるcatBottomの目標値
                    const targetLandedCatBottom = blockBottom + blockHeight - 85; 

                    // 猫の足元がブロックのわずかに上にあるか（着地判定）
                    // 落下中のcatBottomが、着地したい目標位置の±5pxの範囲内にあるかを確認
                    const isLandingVertically = 
                        (catBottom >= targetLandedCatBottom - 5) && 
                        (catBottom <= targetLandedCatBottom + 5);   

                    if (isOverlappingHorizontally && isLandingVertically) {
                        clearInterval(cat.downTimerId);
                        isJumping = false;
                        catBottom = targetLandedCatBottom; 
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
        if (e.code === 'Space' && !isGameOver && jumpCount < MAX_JUMPS) {
            e.preventDefault(); // デフォルトのスクロール動作を無効にする
            jump();
        }
    }

    // 魚の生成
    function generateFish(yPos = -1) { 
        const fish = document.createElement('div');
        fish.classList.add('fish');
        const newFishDimensions = getItemDimensions('fish');
        const proposedBottom = findNonOverlappingBottom(newFishDimensions.width, newFishDimensions.height, yPos);

        const fishData = {
            element: fish,
            type: 'fish',
            left: SPAWN_X, 
            bottom: proposedBottom 
        };
        fish.style.left = fishData.left + 'px';
        fish.style.bottom = fishData.bottom + 'px';
        gameContainer.appendChild(fish);
        fishAndBlocks.push(fishData);
    }

    // ブロックの生成
    function generateBlock() {
        const block = document.createElement('div');
        block.classList.add('block');
        const newBlockDimensions = getItemDimensions('block');
        const proposedBottom = findNonOverlappingBottom(newBlockDimensions.width, newBlockDimensions.height);

        const blockData = {
            element: block,
            type: 'block',
            left: SPAWN_X, 
            bottom: proposedBottom 
        };
        block.style.left = blockData.left + 'px';
        block.style.bottom = blockData.bottom + 'px';
        gameContainer.appendChild(block);
        fishAndBlocks.push(blockData);
    }

    // 白い缶の生成関数
    function generateCan() {
        const can = document.createElement('div');
        can.classList.add('can');
        const newCanDimensions = getItemDimensions('can');
        const proposedBottom = findNonOverlappingBottom(newCanDimensions.width, newCanDimensions.height);

        const canData = {
            element: can,
            type: 'can',
            left: SPAWN_X, 
            bottom: proposedBottom 
        };
        can.style.left = canData.left + 'px';
        can.style.bottom = canData.bottom + 'px';
        gameContainer.appendChild(can);
        fishAndBlocks.push(canData);
    }

    // 黄色い缶の生成関数
    function generateYellowCan() {
        const yellowCan = document.createElement('div');
        yellowCan.classList.add('yellow-can');
        const newYellowCanDimensions = getItemDimensions('yellowCan');
        const proposedBottom = findNonOverlappingBottom(newYellowCanDimensions.width, newYellowCanDimensions.height);

        const yellowCanData = {
            element: yellowCan,
            type: 'yellowCan', 
            left: SPAWN_X, 
            bottom: proposedBottom
        };
        yellowCan.style.left = yellowCanData.left + 'px';
        yellowCan.style.bottom = yellowCanData.bottom + 'px';
        gameContainer.appendChild(yellowCan);
        fishAndBlocks.push(yellowCanData);
    }

    // 黒い缶の生成関数
    function generateBlackCan() {
        const blackCan = document.createElement('div');
        blackCan.classList.add('black-can');
        const newBlackCanDimensions = getItemDimensions('blackCan');
        const proposedBottom = findNonOverlappingBottom(newBlackCanDimensions.width, newBlackCanDimensions.height);

        const blackCanData = {
            element: blackCan,
            type: 'blackCan', 
            left: SPAWN_X, 
            bottom: proposedBottom 
        };
        blackCan.style.left = blackCanData.left + 'px';
        blackCan.style.bottom = blackCanData.bottom + 'px';
        gameContainer.appendChild(blackCan);
        fishAndBlocks.push(blackCanData);
    }

    // ゲームオーバー処理
    function gameOver() {
        isGameOver = true;
        // すべてのタイマーを停止
        clearInterval(gameTimerId);
        clearInterval(speedTimerId);
        clearTimeout(fishGeneratorId);
        fishAndBlocks.forEach(item => clearInterval(item.timerId)); 
        
        // 猫のジャンプ・落下タイマーも停止
        if (cat && cat.upTimerId) clearInterval(cat.upTimerId);
        if (cat && cat.downTimerId) clearInterval(cat.downTimerId);

        // ゲームオーバーメッセージを表示
        gameOverMessage.style.display = 'flex'; 
        
        // ゲームオーバー画像を動的に追加
        const gameOverImageElement = document.createElement('img');
        gameOverImageElement.id = 'game-over-image';
        gameOverImageElement.src = 'GAMEOVER.png'; // GAMEOVER.jpgのURLを指定
        // 画像をボタンの前に挿入（flexboxなので先頭に追加すれば自動で中央揃えになる）
        gameOverMessage.insertBefore(gameOverImageElement, restartButton);
    }

    // メインのゲームループ
    function gameLoop() {
        if (isGameOver) return;

        // 猫の当たり判定の微調整のための定数
        const CAT_COLLISION_WIDTH = 100;  // 猫の実際の見た目の幅（推定）
        const CAT_COLLISION_HEIGHT = 250; // 猫の実際の見た目の高さ（推定）
        const CAT_COLLISION_OFFSET_X = 35; // 猫のdivの左端から当たり判定の左端までのオフセット
        const CAT_COLLISION_OFFSET_Y = 85; // 猫のdivの下端から当たり判定の下端までのオフセット。

        // 全ての魚とブロック、缶を動かす
        fishAndBlocks.forEach((item, index) => {
            if (item.type === 'fish') {
                if (isFishAttractionActive) {
                    const fishDimensions = getItemDimensions('fish');
                    const fishCenterX = item.left + fishDimensions.width / 2; // 魚の中心X
                    const fishCenterY = item.bottom + fishDimensions.height / 2; // 魚の中心Y
                    
                    // 猫の衝突ボックスの中心
                    const catRect = { 
                        left: parseInt(cat.style.left) + CAT_COLLISION_OFFSET_X, 
                        bottom: catBottom + CAT_COLLISION_OFFSET_Y, 
                        width: CAT_COLLISION_WIDTH, 
                        height: CAT_COLLISION_HEIGHT 
                    };
                    const catCenterX = catRect.left + catRect.width / 2;
                    const catCenterY = catRect.bottom + catRect.height / 2;

                    const dx = catCenterX - fishCenterX;
                    const dy = catCenterY - fishCenterY;
                    const distance = Math.sqrt(dx * dx + dy * dy);

                    const attractionSpeed = (gameSpeed + 2); 
                    // 吸い寄せを停止する距離 (猫の当たり判定の中心から魚の中心までの距離)
                    const attractionStopDistance = Math.max(catRect.width / 2, fishDimensions.width / 2) + 10; // 少し余裕を持たせる

                    if (distance > attractionStopDistance) { 
                        item.left += (dx / distance) * attractionSpeed;
                        item.bottom += (dy / distance) * attractionSpeed;
                    }
                    // 吸い寄せが有効な場合でも、魚は通常のゲームスピードで左に流れる
                    item.left -= gameSpeed; 
                    
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
            if (item.left < -cat.offsetWidth) { 
                gameContainer.removeChild(item.element);
                fishAndBlocks.splice(index, 1);
                return; 
            }
            
            // アイテムとの当たり判定
            // ここで猫の当たり判定領域をより正確に定義します
            const catRect = { 
                left: parseInt(cat.style.left) + CAT_COLLISION_OFFSET_X, 
                bottom: catBottom + CAT_COLLISION_OFFSET_Y, 
                width: CAT_COLLISION_WIDTH, 
                height: CAT_COLLISION_HEIGHT 
            };
            const itemDimensions = getItemDimensions(item.type);
            const itemRect = { 
                left: item.left, 
                bottom: item.bottom, 
                width: itemDimensions.width, 
                height: itemDimensions.height 
            };

            if (doRectanglesOverlap(catRect, itemRect)) {
                if (item.type === 'fish') {
                    gameContainer.removeChild(item.element);
                    fishAndBlocks.splice(index, 1);
                    score++;
                    scoreDisplay.innerText = score;
                } 
                else if (item.type === 'can') {
                    gameContainer.removeChild(item.element);
                    fishAndBlocks.splice(index, 1);
                    timeLeft += 3; 
                    timeLeftDisplay.innerText = timeLeft; 
                }
                else if (item.type === 'yellowCan') {
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
                else if (item.type === 'blackCan') {
                    gameContainer.removeChild(item.element);
                    fishAndBlocks.splice(index, 1);
                    
                    gameSpeed = Math.max(1, gameSpeed - 10); 
                    console.log("黒い缶を取りました！ゲームスピードが低下し、ここから加速します。現在のスピード:", gameSpeed); 
                }
            }
        });

        // 猫が空中に浮いていないかチェックする（落下が必要か）
        if (!isJumping && catBottom > -85) { 
            let isSupported = false;
            // 足元にブロックがあるか確認
            for (const item of fishAndBlocks) {
                if (item.type === 'block') {
                    const blockLeft = item.left;
                    const blockBottom = item.bottom;
                    const blockHeight = getItemDimensions('block').height;

                    // 猫の当たり判定の微調整のための定数（gameLoop()のものを再利用）
                    const CAT_COLLISION_WIDTH = 180;  
                    const CAT_COLLISION_OFFSET_X = 35; 

                    // 猫の衝突ボックスの左右の境界を計算
                    const catCollisionLeft = parseInt(cat.style.left) + CAT_COLLISION_OFFSET_X;
                    const catCollisionRight = catCollisionLeft + CAT_COLLISION_WIDTH;
                    const blockRight = blockLeft + getItemDimensions('block').width;

                    // 猫がブロックの上にいるかどうかの判定をより厳密に
                    const horizontalOverlap = 
                        (catCollisionLeft < blockRight) && 
                        (catCollisionRight > blockLeft);

                    // 猫がこのブロックに着地した際に、最終的に設定されるcatBottomの目標値
                    const targetLandedCatBottom = blockBottom + blockHeight - 85; 

                    // 猫の足元がブロックのわずかに上にあるか（着地判定）
                    // 落下中のcatBottomが、着地したい目標位置の±5pxの範囲内にあるかを確認
                    const isLandingVertically = 
                        (catBottom >= targetLandedCatBottom - 5) && 
                        (catBottom <= targetLandedCatBottom + 5); 

                    if (horizontalOverlap && isLandingVertically) {
                        isSupported = true;
                        break;
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
        
        // ゲームオーバーメッセージを非表示にする
        gameOverMessage.style.display = 'none'; 
        
        // 既存のゲーム要素（魚、ブロック、缶）をすべて削除
        fishAndBlocks.forEach(item => {
            if (item.element && gameContainer.contains(item.element)) {
                gameContainer.removeChild(item.element);
            }
        });
        fishAndBlocks = []; // 配列もクリア
        
        // 猫の要素が存在すれば削除
        if (cat && gameContainer.contains(cat)) {
            gameContainer.removeChild(cat);
        }
        
        fishSpawnCount = 1; 
        lastFishSpawnSpeedIncrease = 5;
        jumpCount = 0; 
        isFishAttractionActive = false; 
        if (fishAttractionTimerId) clearTimeout(fishAttractionTimerId); 

        // ゲーム再開時にゲームオーバー画像を削除
        const existingGameOverImage = document.getElementById('game-over-image');
        if (existingGameOverImage && gameOverMessage.contains(existingGameOverImage)) {
            gameOverMessage.removeChild(existingGameOverImage);
        }

        // 既存のタイマーをすべてクリアして新しいゲームサイクルを開始
        if (gameTimerId) clearInterval(gameTimerId);
        if (speedTimerId) clearInterval(speedTimerId);
        if (fishGeneratorId) clearTimeout(fishGeneratorId);
        
        // ゲームの要素を初期化
        createCat();
        
        // メインループを開始
        gameTimerId = setInterval(gameLoop, 20);
        document.addEventListener('keydown', control);
        // タッチ/クリックでのジャンプを追加
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

            for (let i = 0; i < fishSpawnCount; i++) {
                setTimeout(() => {
                    generateFish(); 
                }, i * fishGroupInterval); 
            }

            // アイテム生成の確率を調整
            if (Math.random() > 0.4) { // ブロックの生成確率
                generateBlock();
            }
            
            if (Math.random() > 0.7) { // 白い缶の生成確率
                generateCan();
            }

            if (Math.random() > 0.85) { // 黄色い缶の生成確率
                generateYellowCan();
            }

            if (Math.random() > 0.95) { // 黒い缶の生成確率
                generateBlackCan();
            }

            let baseDelay = 500; // 基本のアイテム生成間隔
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
            nextGenerateDelay = Math.max(nextGenerateDelay, 50); // 最低生成間隔
            
            // 次のアイテム生成をスケジュール
            fishGeneratorId = setTimeout(generateItems, nextGenerateDelay); 
        })();
    }

    // リスタートボタンのイベント
    restartButton.addEventListener('click', startGame);

    // 最初のゲームを開始
    startGame();
});