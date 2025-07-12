document.addEventListener('DOMContentLoaded', () => {
    // HTML要素の取得
    const gameContainer = document.getElementById('game-container');
    const scoreDisplay = document.getElementById('score');
    const timeLeftDisplay = document.getElementById('time-left');
    const gameOverMessage = document.getElementById('game-over-message');
    const restartButton = document.getElementById('restart-button');
    const highScoreDisplay = document.getElementById('high-score');
    const jumpButton = document.getElementById('jump-button');
    const fishCollectSound = document.getElementById('fish-collect-sound');
    const birdHitSound = document.getElementById('bird-hit-sound');
    const jumpSound = document.getElementById('jump-sound');
    const countdownSound = document.getElementById('countdown-sound');
    const gameOverWhistle = document.getElementById('game-over-whistle');
    const gameBGM = document.getElementById('game-bgm');

    // ★追加: モバイルデバイスかどうかを判定する関数★
    function isMobileDevice() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    }

    // ★追加: モバイルデバイスの場合はオーディオ再生を無効にするフラグ★
    const disableAudio = isMobileDevice();
    if (disableAudio) {
        console.log("モバイルデバイスを検出しました。BGMと効果音を無効にします。");
    }

    // BGMの初回再生を試みるためのフラグ
    let hasInteracted = false;

    // グローバル変数
    let cat, catBottom, isJumping, gravity = 0.9;
    let isGameOver = false;
    let score = 0;
    let gameSpeed = 5;
    let fishAndBlocks = [];
    let gameTimerId, speedTimerId, fishGeneratorId;
    let fishSpawnCount = 1;
    let lastFishSpawnSpeedIncrease = 5;
    let fishGroupInterval = 100;
    let timeLeft;
    let isFishAttractionActive = false;
    let fishAttractionTimerId;
    let highScore = 0;
    let fishSpawnBoostTimerId;
    const BLACK_CAN_FISH_BOOST_AMOUNT = 5;
    const BLACK_CAN_BOOST_DURATION = 10000;

    // 2段ジャンプのための変数
    let jumpCount = 0;
    const MAX_JUMPS = 2;

    const SPAWN_X = 800;
    const CONTAINER_HEIGHT = 500;

    function getItemDimensions(type) {
        switch (type) {
            case 'fish': return { width: 50, height: 30 };
            case 'block': return { width: 130, height: 20 };
            case 'can':
            case 'yellowCan':
            case 'blackCan': return { width: 30, height: 40 };
            case 'bird': return { width: 60, height: 40 };
            case 'warning-sign': return { width: 100, height: 100 };
            default: return { width: 0, height: 0 };
        }
    }

    function doRectanglesOverlap(rect1, rect2) {
        return rect1.left < rect2.left + rect2.width &&
               rect1.left + rect1.width > rect2.left &&
               rect1.bottom < rect2.bottom + rect2.height &&
               rect1.bottom + rect1.height > rect2.bottom;
    }

    function findNonOverlappingBottom(newWidth, newHeight, initialY = -1) {
        let proposedBottom;
        let attempts = 0;
        const maxAttempts = 50;
        let foundValidPosition = false;

        while (attempts < maxAttempts && !foundValidPosition) {
            if (initialY !== -1 && attempts === 0) {
                proposedBottom = initialY;
            } else {
                if (newHeight === getItemDimensions('bird').height) {
                    proposedBottom = Math.random() * (CONTAINER_HEIGHT - newHeight - 100) + 100;
                } else {
                    proposedBottom = Math.random() * (CONTAINER_HEIGHT - newHeight);
                }
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
                if ((existingItem.type === 'warning-sign' && existingItem.left > SPAWN_X - SPAWN_AREA_BUFFER) ||
                    (existingItem.left < SPAWN_X + SPAWN_AREA_BUFFER && existingItem.left + existingDimensions.width > SPAWN_X - SPAWN_AREA_BUFFER)) {
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

    function createCat() {
        cat = document.createElement('div');
        cat.id = 'cat';
        cat.style.left = '50px';
        catBottom = -85;
        cat.style.bottom = catBottom + 'px';
        gameContainer.appendChild(cat);
    }

    function jump() {
        console.log("jump()が呼び出されました。現在のjumpCount:", jumpCount, "isJumping:", isJumping);
        if (jumpCount >= MAX_JUMPS) {
            console.log("jump(): MAX_JUMPS (" + MAX_JUMPS + ") に達したため、ジャンプできません。");
            return;
        }

        isJumping = true;
        jumpCount++;
        console.log("jump(): ジャンプ実行。jumpCountが", jumpCount, "になりました。");

        // ★修正: disableAudioがfalseの場合のみジャンプ音を再生★
        if (!disableAudio && jumpSound) {
            jumpSound.currentTime = 0;
            jumpSound.play().catch(e => console.error("ジャンプ音の再生に失敗しました:", e));
        }

        if (cat.upTimerId) clearInterval(cat.upTimerId);
        if (cat.downTimerId) clearInterval(cat.downTimerId);

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

    function fall() {
        if (cat.upTimerId) clearInterval(cat.upTimerId);

        cat.downTimerId = setInterval(function () {
            if (catBottom <= -85) {
                clearInterval(cat.downTimerId);
                isJumping = false;
                catBottom = -85;
                cat.style.bottom = '-85px';
                jumpCount = 0;
                console.log("fall(): 地面に着地。jumpCountを", jumpCount, "にリセットしました。");
                return;
            }

            for (let item of fishAndBlocks) {
                if (item.type === 'block') {
                    let block = item.element;
                    let blockLeft = parseInt(block.style.left);
                    let blockBottom = parseInt(block.style.bottom);
                    const blockHeight = getItemDimensions('block').height;

                    const CAT_COLLISION_WIDTH = 180;
                    const CAT_COLLISION_OFFSET_X = 35;

                    const catCollisionLeft = parseInt(cat.style.left) + CAT_COLLISION_OFFSET_X;
                    const catCollisionRight = catCollisionLeft + CAT_COLLISION_WIDTH;
                    const blockRight = blockLeft + getItemDimensions('block').width;

                    const isOverlappingHorizontally =
                        (catCollisionLeft < blockRight) &&
                        (catCollisionRight > blockLeft);

                    const targetLandedCatBottom = blockBottom + blockHeight - 85;

                    const isLandingVertically =
                        (catBottom >= targetLandedCatBottom - 5) &&
                        (catBottom <= targetLandedCatBottom + 5);

                    if (isOverlappingHorizontally && isLandingVertically) {
                        clearInterval(cat.downTimerId);
                        isJumping = false;
                        catBottom = targetLandedCatBottom;
                        cat.style.bottom = catBottom + 'px';
                        jumpCount = 0;
                        console.log("fall(): ブロックに着地。jumpCountを", jumpCount, "にリセットしました。");
                        return;
                    }
                }
            }

            catBottom -= (5 + gameSpeed * 0.5);
            cat.style.bottom = catBottom + 'px';
        }, 20);
    }

    function control(e) {
        if (e.code === 'KeyS' && !isGameOver && jumpCount < MAX_JUMPS) {
            e.preventDefault();
            jump();
        }
    }

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

    function generateBird(yPos = -1) {
        const bird = document.createElement('div');
        bird.classList.add('bird');
        const newBirdDimensions = getItemDimensions('bird');
        const proposedBottom = (yPos !== -1) ? yPos : findNonOverlappingBottom(newBirdDimensions.width, newBirdDimensions.height);

        const birdData = {
            element: bird,
            type: 'bird',
            left: SPAWN_X,
            bottom: proposedBottom
        };
        bird.style.left = birdData.left + 'px';
        bird.style.bottom = birdData.bottom + 'px';
        gameContainer.appendChild(bird);
        fishAndBlocks.push(birdData);
    }

    function generateWarningSign(bottomPosition) {
        console.log("generateWarningSign関数が呼び出されました。bottomPosition:", bottomPosition);
        const warningSign = document.createElement('div');
        warningSign.classList.add('warning-sign');
        warningSign.style.left = (SPAWN_X - getItemDimensions('warning-sign').width) + 'px';

        const birdHeight = getItemDimensions('bird').height;
        const warningHeight = getItemDimensions('warning-sign').height;
        warningSign.style.bottom = (bottomPosition + (birdHeight / 2) - (warningHeight / 2)) + 'px';

        gameContainer.appendChild(warningSign);
        console.log("警告サイン要素がゲームコンテナに追加されました。", warningSign);

        setTimeout(() => {
            if (gameContainer.contains(warningSign)) {
                warningSign.style.opacity = '0';
                console.log("警告サインをフェードアウトさせます。");
                setTimeout(() => {
                    if (gameContainer.contains(warningSign)) {
                        gameContainer.removeChild(warningSign);
                        console.log("警告サイン要素が削除されました。");
                    }
                }, 300);
            }
        }, 1000);
    }

    function gameOver() {
        isGameOver = true;
        // ★修正: disableAudioがfalseの場合のみ効果音を再生★
        if (!disableAudio) {
            gameOverWhistle.play();
            gameBGM.pause();
            gameBGM.currentTime = 0;
        }

        clearInterval(gameTimerId);
        clearInterval(speedTimerId);
        clearTimeout(fishGeneratorId);
        fishAndBlocks.forEach(item => clearInterval(item.timerId));

        if (cat && cat.upTimerId) clearInterval(cat.upTimerId);
        if (cat && cat.downTimerId) clearInterval(cat.downTimerId);

        if (score > highScore) {
            highScore = score;
            localStorage.setItem('catJumpHighScore', highScore);
            highScoreDisplay.innerText = highScore;
        }

        gameOverMessage.style.display = 'flex';

        const gameOverImageElement = document.createElement('img');
        gameOverImageElement.id = 'game-over-image';
        gameOverImageElement.src = 'gameover.png'; // ここを 'GAMEOVER.png' から 'gameover.png' に修正。元のファイル名に合わせてください。
        gameOverMessage.insertBefore(gameOverImageElement, restartButton);
    }

    function gameLoop() {
        if (isGameOver) return;

        const CAT_COLLISION_WIDTH = 100;
        const CAT_COLLISION_HEIGHT = 160;
        const CAT_COLLISION_OFFSET_X = 35;
        const CAT_COLLISION_OFFSET_Y = 85;

        fishAndBlocks.forEach((item, index) => {
            if (item.type === 'fish') {
                if (isFishAttractionActive) {
                    const fishDimensions = getItemDimensions('fish');
                    const fishCenterX = item.left + fishDimensions.width / 2;
                    const fishCenterY = item.bottom + fishDimensions.height / 2;

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
                    const attractionStopDistance = Math.max(catRect.width / 2, fishDimensions.width / 2) + 10;

                    if (distance > attractionStopDistance) {
                        item.left += (dx / distance) * attractionSpeed;
                        item.bottom += (dy / distance) * attractionSpeed;
                    }
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

            if (item.left < -cat.offsetWidth && item.type !== 'warning-sign') {
                gameContainer.removeChild(item.element);
                fishAndBlocks.splice(index, 1);
                return;
            }

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

            if (item.type === 'warning-sign') return;

            if (doRectanglesOverlap(catRect, itemRect)) {
                if (item.type === 'fish') {
                    gameContainer.removeChild(item.element);
                    fishAndBlocks.splice(index, 1);
                    score++;
                    scoreDisplay.innerText = score;
                    // ★修正: disableAudioがfalseの場合のみ効果音を再生★
                    if (!disableAudio && fishCollectSound) {
                        fishCollectSound.currentTime = 0;
                        fishCollectSound.play().catch(e => console.error("効果音の再生に失敗しました:", e));
                    }
                }
                else if (item.type === 'can') {
                    gameContainer.removeChild(item.element);
                    fishAndBlocks.splice(index, 1);
                    timeLeft += 4;
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

                    if (fishSpawnBoostTimerId) {
                        clearTimeout(fishSpawnBoostTimerId);
                    }

                    fishSpawnCount += BLACK_CAN_FISH_BOOST_AMOUNT;
                    fishSpawnCount = Math.min(20, fishSpawnCount);

                    console.log("黒い缶の効果: 魚の出現数が増加しました (現在の魚生成数: " + fishSpawnCount + ")");

                    fishSpawnBoostTimerId = setTimeout(() => {
                        fishSpawnCount = Math.max(1, fishSpawnCount - BLACK_CAN_FISH_BOOST_AMOUNT);
                        console.log("黒い缶の効果(魚出現ブースト)が終了しました。魚の出現数が元に戻りました (現在の魚生成数: " + fishSpawnCount + ")");
                        fishSpawnBoostTimerId = null;
                    }, BLACK_CAN_BOOST_DURATION);
                }
                else if (item.type === 'bird') {
                    gameContainer.removeChild(item.element);
                    fishAndBlocks.splice(index, 1);
                    // ★修正: disableAudioがfalseの場合のみ効果音を再生★
                    if (!disableAudio && birdHitSound) {
                        birdHitSound.currentTime = 0;
                        birdHitSound.play().catch(e => console.error("鳥の効果音の再生に失敗しました:", e));
                    }
                    gameOver();
                }
            }
        });

        if (!isJumping && catBottom > -85) {
            let isSupported = false;
            for (const item of fishAndBlocks) {
                if (item.type === 'block') {
                    const blockLeft = item.left;
                    const blockBottom = item.bottom;
                    const blockHeight = getItemDimensions('block').height;

                    const CAT_COLLISION_WIDTH = 180;
                    const CAT_COLLISION_OFFSET_X = 35;

                    const catCollisionLeft = parseInt(cat.style.left) + CAT_COLLISION_OFFSET_X;
                    const catCollisionRight = catCollisionLeft + CAT_COLLISION_WIDTH;
                    const blockRight = blockLeft + getItemDimensions('block').width;

                    const horizontalOverlap =
                        (catCollisionLeft < blockRight) &&
                        (catCollisionRight > blockLeft);

                    const targetLandedCatBottom = blockBottom + blockHeight - 85;

                    const isLandingVertically =
                        (catBottom >= targetLandedCatBottom - 5) &&
                        (catBottom <= targetLandedCatBottom + 5);

                    if (horizontalOverlap && isLandingVertically) {
                        isSupported = true;
                        break;
                    }
                }
            }

            if (!isSupported) {
                isJumping = true;
                fall();
            }
        }
    }

    function startGame() {
        console.log("--- startGameが呼び出されました ---");

        isGameOver = false;
        isJumping = false;
        score = 0;
        gameSpeed = 5;
        timeLeft = 30;
        timeLeftDisplay.innerText = timeLeft;
        scoreDisplay.innerText = 0;

        gameOverMessage.style.display = 'none';

        fishAndBlocks.forEach(item => {
            if (item.element && gameContainer.contains(item.element)) {
                gameContainer.removeChild(item.element);
            }
        });
        fishAndBlocks = [];

        if (cat && gameContainer.contains(cat)) {
            gameContainer.removeChild(cat);
        }

        fishSpawnCount = 1;
        lastFishSpawnSpeedIncrease = 5;
        jumpCount = 0;

        console.log("startGame: jumpCountを", jumpCount, "にリセットしました。");
        console.log("startGame: isJumpingを", isJumping, "にリセットしました。");

        isFishAttractionActive = false;
        if (fishAttractionTimerId) clearTimeout(fishAttractionTimerId);

        if (fishSpawnBoostTimerId) {
            clearTimeout(fishSpawnBoostTimerId);
            fishSpawnBoostTimerId = null;
        }

        const existingGameOverImage = document.getElementById('game-over-image');
        if (existingGameOverImage && gameOverMessage.contains(existingGameOverImage)) {
            gameOverMessage.removeChild(existingGameOverImage);
        }

        if (gameTimerId) clearInterval(gameTimerId);
        if (speedTimerId) clearInterval(speedTimerId);
        if (fishGeneratorId) clearTimeout(fishGeneratorId);
        if (cat && cat.upTimerId) clearInterval(cat.upTimerId);
        if (cat && cat.downTimerId) clearInterval(cat.downTimerId);

        createCat();
        catBottom = -85;
        if (cat) cat.style.bottom = catBottom + 'px';

        // ★修正: disableAudioがfalseの場合のみBGMを再生★
        if (!disableAudio) {
            gameBGM.play().catch(error => {
                console.log("BGMの再生に失敗しました:", error);
            });
        }


        const savedHighScore = localStorage.getItem('catJumpHighScore');
        if (savedHighScore !== null) {
            highScore = parseInt(savedHighScore);
        } else {
            highScore = 0;
        }
        highScoreDisplay.innerText = highScore;

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

        const countdownTimerId = setInterval(() => {
            if(isGameOver) {
                clearInterval(countdownTimerId);
                return;
            }
            timeLeft--;
            timeLeftDisplay.innerText = timeLeft;

            // ★修正: disableAudioがfalseの場合のみカウントダウン音を鳴らす★
            if (!disableAudio && timeLeft <= 10 && timeLeft > 0 && countdownSound) {
                countdownSound.currentTime = 0;
                countdownSound.play().catch(e => console.error("カウントダウン音の再生に失敗しました:", e));
            }


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

        (function generateItems() {
            if (isGameOver) return;

            for (let i = 0; i < fishSpawnCount; i++) {
                setTimeout(() => {
                    generateFish();
                }, i * fishGroupInterval);
            }

            if (Math.random() > 0.4) {
                generateBlock();
            }

            if (Math.random() > 0.7) {
                generateCan();
            }

            if (Math.random() > 0.85) {
                generateYellowCan();
            }

            if (Math.random() > 0.95) {
                generateBlackCan();
            }

            if (Math.random() > 0.88) {
                const birdDimensions = getItemDimensions('bird');
                const birdBottomPos = findNonOverlappingBottom(birdDimensions.width, birdDimensions.height);

                generateWarningSign(birdBottomPos);

                setTimeout(() => {
                    generateBird(birdBottomPos);
                }, 2000);
            }

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

    // ★修正: disableAudioがfalseの場合のみBGM再生リスナーを設定★
    if (!disableAudio) {
        const playBGMOnFirstInteraction = () => {
            if (!hasInteracted) {
                gameBGM.play().then(() => {
                    hasInteracted = true;
                    console.log("BGMがユーザー操作により再生されました。");
                    document.removeEventListener('click', playBGMOnFirstInteraction);
                    document.removeEventListener('keydown', playBGMOnFirstInteraction);
                }).catch(error => {
                    console.log("BGMの初回再生に失敗しました:", error);
                });
            }
        };

        document.addEventListener('click', playBGMOnFirstInteraction);
        document.addEventListener('keydown', playBGMOnFirstInteraction);
    }


    restartButton.addEventListener('click', startGame);
    restartButton.addEventListener('touchstart', (e) => {
        e.preventDefault();
        startGame();
    });

    if (jumpButton) {
        jumpButton.addEventListener('click', (e) => {
            e.preventDefault();
            if (!isGameOver && jumpCount < MAX_JUMPS) {
                jump();
            }
        });

        jumpButton.addEventListener('touchstart', (e) => {
            e.preventDefault();
            if (!isGameOver && jumpCount < MAX_JUMPS) {
                jump();
            }
        });
    }

    startGame();
});
