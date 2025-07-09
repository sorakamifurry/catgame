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
    let currentFishGroupCount = 0; // 現在生成中の魚のグループ数 (今回は直接は使用しませんが、連なり制御のために保持)
    let fishGroupMax = 3; // 魚が連なる最大数
    let fishGroupInterval = 100; // 魚が連なる際の生成間隔（ms）

    // 2段ジャンプのための変数
    let jumpCount = 0; // 現在のジャンプ回数
    const MAX_JUMPS = 2; // 最大ジャンプ回数

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
        const upSpeed = 30 + gameSpeed; // スピードが上がるほど、上昇も速く
        const jumpHeight = catBottom + (250 + (gameSpeed * 4)); // 現在の高さからのジャンプ高さを計算

        cat.upTimerId = setInterval(function () {
            // ジャンプの高さ制限に達したら落下へ
            if (catBottom >= jumpHeight) { // >= に変更
                clearInterval(cat.upTimerId);
                fall();
            } else {
                catBottom += upSpeed; // 計算されたスピードで上昇
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
                        (catBottom >= blockBottom + 15) && // ブロックの上か？
                        (catBottom <= blockBottom + 25) &&
                        (parseInt(cat.style.left) + 60 > blockLeft) && // 横位置が合っているか？
                        (parseInt(cat.style.left) < blockLeft + 130) 
                    ) {
                        clearInterval(cat.downTimerId);
                        isJumping = false;
                        catBottom = blockBottom + 20; // ブロックの高さに合わせる
                        cat.style.bottom = catBottom + 'px';
                        jumpCount = 0; // ブロックに着地したらジャンプ回数をリセット
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

    // 魚の生成
    function generateFish(yPos = -1) { // yPosが指定されなければランダム
        const fish = document.createElement('div');
        fish.classList.add('fish');
        const fishData = {
            element: fish,
            type: 'fish',
            left: 800,
            bottom: yPos === -1 ? Math.random() * 450 : yPos // yPosが-1ならランダム、そうでなければ指定された位置
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
        const blockData = {
            element: block,
            type: 'block',
            left: 800,
            bottom: Math.random() * 200 + 50 // 低めの位置に生成
        };
        block.style.left = blockData.left + 'px';
        block.style.bottom = blockData.bottom + 'px';
        gameContainer.appendChild(block);
        fishAndBlocks.push(blockData);
    }

    // ゲームオーバー処理
    function gameOver() {
        isGameOver = true;
        // すべてのタイマーを停止
        clearInterval(gameTimerId);
        clearInterval(speedTimerId);
        clearTimeout(fishGeneratorId);
        clearTimeout(blockGeneratorId);
        fishAndBlocks.forEach(item => clearInterval(item.timerId)); // 各アイテムの動きも止める
        
        // 猫のジャンプ・落下タイマーも停止
        if (cat && cat.upTimerId) clearInterval(cat.upTimerId);
        if (cat && cat.downTimerId) clearInterval(cat.downTimerId);

        gameOverMessage.classList.remove('hidden'); // ゲームオーバーメッセージ表示
    }

    // メインのゲームループ
    function gameLoop() {
        if (isGameOver) return;

        // 全ての魚とブロックを動かす
        fishAndBlocks.forEach((item, index) => {
            item.left -= gameSpeed;
            item.element.style.left = item.left + 'px';

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
        });

        // 猫が空中に浮いていないかチェックする
        if (!isJumping && catBottom > 0) {
            let isSupported = false;
            // 足元にブロックがあるか確認
            for (const item of fishAndBlocks) {
                if (item.type === 'block') {
                    const blockLeft = item.left;
                    // 猫の真下にブロックがあるか？
                    if (blockLeft < 50 + 60 && blockLeft + 130 > 50) {
                        // 猫がそのブロックの高さにいるか？
                        if (catBottom === item.bottom + 20) {
                            isSupported = true;
                            break;
                        }
                    }
                }
            }

            // もし支えがなければ、落下させる
            if (!isSupported) {
                isJumping = true; // 落下状態にする
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
        timeLeftDisplay.innerText = 30;
        scoreDisplay.innerText = 0;
        gameOverMessage.classList.add('hidden');
        fishAndBlocks.forEach(item => gameContainer.removeChild(item.element));
        fishAndBlocks = [];
        if (cat) gameContainer.removeChild(cat);
        
        // 魚の生成数と最後に生成数を増やした時のスピードをリセット
        fishSpawnCount = 1; 
        lastFishSpawnSpeedIncrease = 5;
        currentFishGroupCount = 0; // グループ生成カウンターもリセット
        jumpCount = 0; // ジャンプ回数をリセット

        // ゲームの要素を初期化
        createCat();
        
        // メインループを開始
        gameTimerId = setInterval(gameLoop, 20);
        document.addEventListener('keydown', control);
        
        // 制限時間のタイマー
        let timeLeft = 30;
        const countdownTimerId = setInterval(() => {
            if(isGameOver) {
                clearInterval(countdownTimerId);
                return;
            }
            timeLeft--;
            timeLeftDisplay.innerText = timeLeft;
            
            // 残り時間に応じて魚の生成数をさらに増やす
            if (timeLeft <= 10 && fishSpawnCount < 10) { // 残り10秒以下で、かつ魚の生成数が10未満の場合
                fishSpawnCount = Math.min(10, fishSpawnCount + 1); // 最大10匹まで増やす
            } else if (timeLeft <= 5 && fishSpawnCount < 15) { // 残り5秒以下で、さらに増やす
                fishSpawnCount = Math.min(15, fishSpawnCount + 2); // 最大15匹まで増やす
            } else if (timeLeft <= 2 && fishSpawnCount < 20) { // 残り2秒以下で、画面いっぱいに出すためにさらに増やす
                fishSpawnCount = Math.min(20, fishSpawnCount + 5); // 最大20匹まで増やす（調整可能）
            }


            if (timeLeft <= 0) {
                clearInterval(countdownTimerId);
                gameOver();
            }
        }, 1000);

        // 加速タイマー
        speedTimerId = setInterval(() => {
            if (!isGameOver) {
                gameSpeed += 2; // 加速量を増やす
                // gameSpeedが特定の増加量を超えるごとに魚の生成数を増やす
                const speedIncreaseThreshold = 8; // 例えば、gameSpeedが8上がるごとに魚の数を増やす
                if (gameSpeed - lastFishSpawnSpeedIncrease >= speedIncreaseThreshold) {
                    fishSpawnCount++;
                    lastFishSpawnSpeedIncrease = gameSpeed; // 最後に増やしたスピードを更新
                    if (fishSpawnCount > 5) fishGroupMax = 5; // ある程度魚が増えたら、連なる魚の最大数も増やす
                }
            }
        }, 4000); // 4秒ごとに加速

        // アイテム生成を開始
        (function generateItems() {
            if (isGameOver) return;

            // fishSpawnCount の数だけ魚を生成
            for (let i = 0; i < fishSpawnCount; i++) {
                // 上下バラバラに生成するため、generateFishにY座標を渡さない
                setTimeout(() => {
                    generateFish(); // ここで引数を渡さないことで、generateFish内でランダムなY座標が選ばれます
                }, i * fishGroupInterval); // iが増えるごとにわずかに遅延させて連なりを出す
            }

            // 確率でブロックも生成
            if (Math.random() > 0.4) {
                generateBlock();
            }
            
            // 次のアイテム生成までの時間を調整
            // 基本生成間隔を短くして、連なり生成時間を考慮
            let baseDelay = 500; // 通常時の最低遅延
            if (timeLeft <= 10) { // 残り10秒以下では、生成間隔をさらに短縮
                baseDelay = 200; // 例えば200msから700msの範囲
            } else if (timeLeft <= 5) { // 残り5秒以下では、さらに短縮
                baseDelay = 100; // 例えば100msから600msの範囲
            } else if (timeLeft <= 2) { // 残り2秒以下では、ほぼ連打で出す
                baseDelay = 50; // 例えば50msから550msの範囲
            }
            
            let nextGenerateDelay = Math.random() * 500 + baseDelay; 
            if (fishSpawnCount > 1) { // 魚が複数生成される場合は、連なり生成にかかる時間を加算
                nextGenerateDelay += (fishSpawnCount - 1) * fishGroupInterval;
            }
            // 最小遅延を設定して、あまりにも間隔が短くなりすぎないようにする（パフォーマンス対策）
            nextGenerateDelay = Math.max(nextGenerateDelay, 50); // 最低50msの間隔を確保

            fishGeneratorId = setTimeout(generateItems, nextGenerateDelay); 
        })();
    }

    // リスタートボタンのイベント
    restartButton.addEventListener('click', startGame);

    // 最初のゲームを開始
    startGame();
});