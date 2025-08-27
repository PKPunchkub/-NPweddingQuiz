// public/client.js
// Game client-side logic
const socket = io();

// Game state variables
let currentPlayer = null;
let currentQuestion = 0;
let score = 0;
let timeLeft = 10;
let timer;
let gameActive = false;
let gameStarted = false;
let isHost = false;
let roomId = null;
let players = [];

// Initialize game
document.addEventListener('DOMContentLoaded', function() {
    console.log('Game client initializing...');
    createFloatingHearts();
    checkURLParameters();
    
    // Socket event listeners
    setupSocketListeners();
});

// Socket event listeners
function setupSocketListeners() {
    // Host authentication
    socket.on('host-authenticated', (data) => {
        roomId = data.roomId;
        isHost = true;
        
        hideAllScreens();
        document.getElementById('hostScreen').classList.remove('hidden');
        
        // Update room display
        document.getElementById('hostRoomDisplay').textContent = roomId.slice(-8);
        
        // Generate QR Code
        generateQRCode(data.gameUrl);
        
        console.log('Host authenticated for room:', roomId);
    });
    
    socket.on('host-auth-failed', (data) => {
        alert('❌ รหัสผ่านไม่ถูกต้อง! กรุณาลองใหม่อีกครั้ง');
        document.getElementById('adminPassword').value = '';
        document.getElementById('adminPassword').focus();
    });
    
    // Player registration
    socket.on('registration-success', (data) => {
        currentPlayer = data.player;
        console.log('Player registered successfully:', currentPlayer);
        showWaitingScreen();
    });
    
    socket.on('registration-failed', (data) => {
        alert('❌ ' + data.message);
    });
    
    // Player joined notification
    socket.on('player-joined', (data) => {
        updatePlayerCount(data.totalPlayers);
        updatePlayersList();
    });
    
    socket.on('host-player-joined', (data) => {
        updatePlayerCount(data.totalPlayers);
        showToast(`🎉 ผู้เล่นใหม่เข้าร่วม: ${data.player.name}`, 'success');
        updatePlayersList();
    });
    
    // Game started
    socket.on('game-started', (data) => {
        if (!isHost) {
            gameStarted = true;
            currentQuestion = data.currentQuestion;
            startGameForPlayer(data);
        }
    });
    
    socket.on('host-game-started', (data) => {
        if (isHost) {
            showHostDashboard();
            updateHostQuestion(data);
        }
    });
    
    // Next question
    socket.on('next-question', (data) => {
        if (!isHost) {
            currentQuestion = data.currentQuestion;
            showQuestion(data);
        }
    });
    
    socket.on('host-next-question', (data) => {
        if (isHost) {
            updateHostQuestion(data);
        }
    });
    
    // Answer result
    socket.on('answer-result', (data) => {
        handleAnswerResult(data);
    });
    
    // Host answer statistics
    socket.on('host-answer-stats', (data) => {
        if (isHost) {
            updateAnswerStats(data);
        }
    });
    
    // Game ended
    socket.on('game-ended', (data) => {
        showResults(data.leaderboard);
    });
    
    // Game state
    socket.on('game-state', (data) => {
        players = data.players;
        updatePlayersList();
        updatePlayerCount(players.length);
    });
    
    // Error handling
    socket.on('error', (data) => {
        alert('❌ Error: ' + data.message);
    });
}

// UI Functions
function showHomeScreen() {
    hideAllScreens();
    document.getElementById('homeScreen').classList.remove('hidden');
}

function showHostScreen() {
    if (isMobileDevice()) {
        alert('⚠️ โหมด Host สำหรับคอมพิวเตอร์เท่านั้น!\nกรุณาใช้คอมพิวเตอร์เพื่อควบคุมเกม\n\n(Host mode is for computers only!\nPlease use a computer to control the game)');
        return;
    }
    
    hideAllScreens();
    document.getElementById('passwordScreen').classList.remove('hidden');
    document.getElementById('adminPassword').value = '';
    setTimeout(() => {
        document.getElementById('adminPassword').focus();
    }, 100);
}

function showRegisterScreen() {
    if (!isMobileDevice()) {
        const usePhone = confirm('📱 แนะนำให้ใช้มือถือสำหรับเล่นเกม!\nเพื่อประสบการณ์ที่ดีที่สุด\n\nคลิก OK เพื่อดำเนินการต่อบนคอมพิวเตอร์\nหรือ Cancel เพื่อใช้มือถือแทน\n\n(Recommended to use mobile phone for playing!\nFor the best experience\n\nClick OK to continue on computer\nor Cancel to use mobile instead)');
        
        if (!usePhone) {
            alert('กรุณาเปิดเว็บไซต์นี้ในมือถือ หรือสแกน QR Code จากคอมพิวเตอร์ Host\n\n(Please open this website on mobile phone or scan QR Code from Host computer)');
            return;
        }
    }
    
    hideAllScreens();
    document.getElementById('registerScreen').classList.remove('hidden');
    isHost = false;
}

function hideAllScreens() {
    const screens = ['homeScreen', 'passwordScreen', 'hostScreen', 'registerScreen', 'waitingScreen', 'gameScreen', 'resultScreen', 'hostDashboard'];
    screens.forEach(screen => {
        document.getElementById(screen).classList.add('hidden');
    });
}

// Host functions
function verifyPassword() {
    const password = document.getElementById('adminPassword').value;
    socket.emit('host-authenticate', { password: password });
}

function generateQRCode(gameUrl) {
    document.getElementById('shareLink').value = gameUrl;
    
    const qrContainer = document.getElementById('qrcode');
    qrContainer.innerHTML = '';
    
    const qrSize = 200;
    const qrURL = `https://chart.googleapis.com/chart?chs=${qrSize}x${qrSize}&cht=qr&chl=${encodeURIComponent(gameUrl)}&choe=UTF-8`;
    
    const img = document.createElement('img');
    img.src = qrURL;
    img.alt = 'QR Code สำหรับเข้าร่วมเกม';
    img.className = 'mx-auto border-2 border-purple-300 rounded-lg shadow-lg';
    img.style.width = qrSize + 'px';
    img.style.height = qrSize + 'px';
    
    img.onerror = function() {
        const alternativeQRURL = `https://api.qrserver.com/v1/create-qr-code/?size=${qrSize}x${qrSize}&data=${encodeURIComponent(gameUrl)}`;
        img.src = alternativeQRURL;
    };
    
    qrContainer.appendChild(img);
}

function copyLink() {
    const linkInput = document.getElementById('shareLink');
    linkInput.select();
    linkInput.setSelectionRange(0, 99999);
    
    navigator.clipboard.writeText(linkInput.value).then(() => {
        const button = event.target;
        const originalText = button.innerHTML;
        button.innerHTML = '✅ คัดลอกแล้ว!';
        button.classList.add('bg-green-500');
        button.classList.remove('bg-blue-500');
        
        setTimeout(() => {
            button.innerHTML = originalText;
            button.classList.remove('bg-green-500');
            button.classList.add('bg-blue-500');
        }, 2000);
    }).catch(() => {
        try {
            document.execCommand('copy');
            alert('คัดลอกลิงก์แล้ว!');
        } catch (err) {
            alert('ไม่สามารถคัดลอกได้ กรุณาคัดลอกด้วยตนเอง');
        }
    });
}

function showWaitingScreenAsHost() {
    hideAllScreens();
    document.getElementById('waitingScreen').classList.remove('hidden');
    
    document.getElementById('startGameBtn').style.display = 'block';
    document.getElementById('waitingMessage').style.display = 'none';
    
    if (roomId) {
        document.getElementById('waitingRoomId').textContent = roomId.slice(-8);
    }
    
    socket.emit('get-game-state', { roomId: roomId });
}

// Player functions
function registerPlayer() {
    const name = document.getElementById('playerName').value.trim();
    const table = document.getElementById('playerTable').value.trim();
    
    if (!name) {
        alert('กรุณาใส่ชื่อของคุณ (Please enter your name)');
        return;
    }
    
    if (!roomId) {
        alert('ไม่พบห้องเล่น กรุณาสแกน QR Code ใหม่อีกครั้ง (Room not found, please scan QR Code again)');
        return;
    }
    
    socket.emit('player-register', {
        roomId: roomId,
        name: name,
        table: table
    });
}

function showWaitingScreen() {
    hideAllScreens();
    document.getElementById('waitingScreen').classList.remove('hidden');
    
    document.getElementById('startGameBtn').style.display = 'none';
    document.getElementById('waitingMessage').style.display = 'block';
    
    if (roomId) {
        document.getElementById('waitingRoomId').textContent = roomId.slice(-8);
    }
    
    if (currentPlayer) {
        document.getElementById('welcomeName').textContent = currentPlayer.name;
        document.getElementById('welcomeTable').textContent = currentPlayer.table ? `โต๊ะ ${currentPlayer.table}` : '';
        document.getElementById('playerCharacter').textContent = currentPlayer.character;
    }
    
    socket.emit('get-game-state', { roomId: roomId });
}

// Game functions
function startGame() {
    if (!isHost) {
        alert('เฉพาะ Admin เท่านั้นที่สามารถเริ่มเกมได้ (Only Admin can start the game)');
        return;
    }
    
    socket.emit('start-game', { roomId: roomId });
}

function startGameForPlayer(data) {
    hideAllScreens();
    document.getElementById('gameScreen').classList.remove('hidden');
    
    if (currentPlayer) {
        document.getElementById('gamePlayerCharacter').textContent = currentPlayer.character;
    }
    
    score = 0;
    showQuestion(data);
}

function showQuestion(data) {
    gameActive = true;
    timeLeft = 10;
    
    // Update UI
    document.getElementById('questionNumber').textContent = data.currentQuestion + 1;
    document.getElementById('score').textContent = score;
    document.getElementById('questionText').textContent = data.question.question;
    
    // Update answer options
    for (let i = 0; i < 4; i++) {
        document.getElementById(`answerText${i}`).textContent = data.question.answers[i];
        document.getElementById(`answer${i}`).disabled = false;
        document.getElementById(`answer${i}`).classList.remove('correct-answer', 'wrong-answer');
    }

    // Update progress bar
    const progress = ((data.currentQuestion + 1) / 5) * 100;
    document.getElementById('progressBar').style.width = progress + '%';

    // Start timer
    startTimer();
}

function startTimer() {
    document.getElementById('timer').textContent = timeLeft;
    
    timer = setInterval(() => {
        timeLeft--;
        document.getElementById('timer').textContent = timeLeft;
        
        if (timeLeft <= 0) {
            clearInterval(timer);
            if (gameActive) {
                selectAnswer(-1); // Time's up
            }
        }
    }, 1000);
}

function selectAnswer(selectedIndex) {
    if (!gameActive) return;
    
    gameActive = false;
    clearInterval(timer);
    
    // Submit answer to server
    socket.emit('submit-answer', {
        roomId: roomId,
        playerId: currentPlayer.id,
        questionIndex: currentQuestion,
        selectedAnswer: selectedIndex,
        timeLeft: timeLeft
    });
    
    // Disable all buttons
    for (let i = 0; i < 4; i++) {
        document.getElementById(`answer${i}`).disabled = true;
    }
}

function handleAnswerResult(data) {
    const correctIndex = data.correctAnswer;
    
    // Show correct answer
    document.getElementById(`answer${correctIndex}`).classList.add('correct-answer');
    
    // Show wrong answer if applicable
    if (data.isCorrect) {
        score = data.score;
        document.getElementById('score').textContent = score;
    } else if (selectedIndex >= 0) {
        document.getElementById(`answer${selectedIndex}`).classList.add('wrong-answer');
    }
    
    // Show result message
    let resultMessage = '';
    if (selectedIndex === -1) {
        resultMessage = '⏰ หมดเวลา! (Time\'s up!)';
    } else if (data.isCorrect) {
        resultMessage = '🎉 ถูกต้อง! (Correct!)';
    } else {
        resultMessage = '❌ ผิด! (Wrong!)';
    }
    
    const questionText = document.getElementById('questionText');
    const originalText = questionText.textContent;
    questionText.innerHTML = `<div class="text-2xl mb-2">${resultMessage}</div><div class="text-lg">${originalText}</div>`;
}

// Host Dashboard functions
function showHostDashboard() {
    hideAllScreens();
    document.getElementById('hostDashboard').classList.remove('hidden');
    
    document.getElementById('hostRoomId').textContent = roomId ? roomId.slice(-8) : '-';
    socket.emit('get-game-state', { roomId: roomId });
}

function updateHostQuestion(data) {
    document.getElementById('hostQuestionNumber').textContent = data.currentQuestion + 1;
    document.getElementById('hostQuestionText').textContent = data.question.question;
    
    // Update answer options
    for (let i = 0; i < 4; i++) {
        document.getElementById(`hostAnswer${i}`).textContent = data.question.answers[i];
    }
    
    // Show correct answer
    document.getElementById('hostCorrectText').textContent = data.question.answers[data.question.correct];
    
    // Start host timer
    startHostTimer();
}

function startHostTimer() {
    let hostTimeLeft = 10;
    document.getElementById('hostTimer').textContent = hostTimeLeft;
    
    const hostTimerInterval = setInterval(() => {
        hostTimeLeft--;
        document.getElementById('hostTimer').textContent = hostTimeLeft;
        
        if (hostTimeLeft <= 0) {
            clearInterval(hostTimerInterval);
        }
    }, 1000);
}

function updateAnswerStats(data) {
    document.getElementById('answerStatsA').textContent = data.answerStats[0];
    document.getElementById('answerStatsB').textContent = data.answerStats[1];
    document.getElementById('answerStatsC').textContent = data.answerStats[2];
    document.getElementById('answerStatsD').textContent = data.answerStats[3];
    document.getElementById('answeredCount').textContent = data.answeredCount;
    document.getElementById('totalPlayersCount').textContent = data.totalPlayers;
}

function hostEndGame() {
    socket.emit('end-game', { roomId: roomId });
}

// Results functions
function showResults(leaderboard) {
    hideAllScreens();
    document.getElementById('resultScreen').classList.remove('hidden');
    
    if (isHost) {
        document.getElementById('playerScoreSection').style.display = 'none';
    } else {
        document.getElementById('playerScoreSection').style.display = 'block';
        document.getElementById('finalScore').textContent = score;
        
        const playerRank = leaderboard.findIndex(p => p.id === currentPlayer.id) + 1;
        if (playerRank > 0) {
            document.getElementById('playerRank').textContent = `🏅 อันดับที่ ${playerRank} จาก ${leaderboard.length} คน`;
        }
    }
    
    showLeaderboard(leaderboard);
}

function showLeaderboard(leaderboard) {
    const leaderboardElement = document.getElementById('leaderboard');
    leaderboardElement.innerHTML = '';
    
    if (leaderboard.length === 0) {
        leaderboardElement.innerHTML = `
            <div class="text-center text-gray-500 py-8">
                <div class="text-4xl mb-2">🏆</div>
                <p>ยังไม่มีผู้เล่นที่เสร็จสิ้นการแข่งขัน</p>
            </div>
        `;
        return;
    }
    
    leaderboard.forEach((player, index) => {
        const rank = player.rank;
        let rankEmoji = '';
        let bgColor = '';
        
        if (rank === 1) {
            rankEmoji = '🥇';
            bgColor = 'bg-gradient-to-r from-yellow-200 to-yellow-300 border-2 border-yellow-400';
        } else if (rank === 2) {
            rankEmoji = '🥈';
            bgColor = 'bg-gradient-to-r from-gray-200 to-gray-300 border-2 border-gray-400';
        } else if (rank === 3) {
            rankEmoji = '🥉';
            bgColor = 'bg-gradient-to-r from-orange-200 to-orange-300 border-2 border-orange-400';
        } else {
            rankEmoji = `${rank}`;
            bgColor = 'bg-gradient-to-r from-blue-100 to-purple-100';
        }
        
        const isCurrentPlayer = currentPlayer && player.id === currentPlayer.id;
        
        const playerRow = document.createElement('div');
        playerRow.className = `${bgColor} p-4 rounded-xl shadow-md flex justify-between items-center ${isCurrentPlayer ? 'ring-4 ring-pink-500 ring-opacity-50' : ''} mb-2`;
        playerRow.innerHTML = `
            <div class="flex items-center">
                <span class="text-2xl mr-4 font-bold">${rankEmoji}</span>
                <div class="text-3xl mr-3">${player.character}</div>
                <div>
                    <p class="font-bold text-gray-800">${player.name} ${isCurrentPlayer ? '(คุณ)' : ''}</p>
                    ${player.table ? `<p class="text-sm text-gray-600">โต๊ะ ${player.table}</p>` : ''}
                </div>
            </div>
            <div class="text-right">
                <p class="text-3xl font-bold text-purple-600">${player.score}/${player.totalQuestions}</p>
                <p class="text-sm text-gray-600">คะแนน</p>
            </div>
        `;
        leaderboardElement.appendChild(playerRow);
    });
}

// Utility functions
function updatePlayersList() {
    const playersList = document.getElementById('playersList');
    if (!playersList) return;
    
    playersList.innerHTML = '';
    
    if (players.length === 0) {
        playersList.innerHTML = `
            <div class="col-span-full text-center text-gray-500 py-8">
                <div class="text-4xl mb-2">👥</div>
                <p>ยังไม่มีผู้เล่นเข้าร่วม</p>
            </div>
        `;
        return;
    }
    
    players.forEach((player) => {
        const playerCard = document.createElement('div');
        playerCard.className = 'player-card bg-gradient-to-r from-pink-100 to-purple-100 p-4 rounded-xl shadow-md';
        playerCard.innerHTML = `
            <div class="text-center">
                <div class="text-4xl mb-2">${player.character}</div>
                <p class="font-semibold text-gray-800">${player.name}</p>
                ${player.table ? `<p class="text-sm text-gray-600">โต๊ะ ${player.table}</p>` : ''}
            </div>
        `;
        playersList.appendChild(playerCard);
    });
}

function updatePlayerCount(count) {
    const elements = ['onlineCount', 'onlineCountRegister', 'totalPlayers', 'gamePlayerCount', 'hostOnlineCount', 'hostPlayerCount'];
    elements.forEach(elementId => {
        const element = document.getElementById(elementId);
        if (element) {
            element.textContent = count;
        }
    });
}

function isMobileDevice() {
    const userAgent = navigator.userAgent || navigator.vendor || window.opera;
    const mobileRegex = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i;
    const screenWidth = window.screen.width;
    const screenHeight = window.screen.height;
    
    return mobileRegex.test(userAgent) || 
           (screenWidth <= 768 && screenHeight <= 1024) ||
           ('ontouchstart' in window) ||
           (navigator.maxTouchPoints > 0);
}

function checkURLParameters() {
    const urlParams = new URLSearchParams(window.location.search);
    const joinParam = urlParams.get('join');
    const roomParam = urlParams.get('room');
    
    if (joinParam === 'true' && roomParam) {
        roomId = roomParam;
        console.log('Joining room from QR Code:', roomId);
        showRegisterScreen();
    } else {
        showHomeScreen();
    }
}

function createFloatingHearts() {
    const container = document.getElementById('heartsContainer');
    setInterval(() => {
        const heart = document.createElement('div');
        heart.className = 'heart';
        heart.innerHTML = '💕';
        heart.style.left = Math.random() * 100 + '%';
        heart.style.animationDuration = (Math.random() * 3 + 3) + 's';
        container.appendChild(heart);
        
        setTimeout(() => {
            heart.remove();
        }, 6000);
    }, 800);
}

function showToast(message, type = 'info') {
    const toastContainer = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast bg-${type === 'success' ? 'green' : 'blue'}-500 text-white px-6 py-3 rounded-lg shadow-lg`;
    toast.innerHTML = `
        <div class="flex items-center">
            <span class="mr-2">${type === 'success' ? '✅' : 'ℹ️'}</span>
            <span>${message}</span>
        </div>
    `;
    
    toastContainer.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.add('show');
    }, 100);
    
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 300);
    }, 3000);
}

function goBackFromWaiting() {
    if (isHost) {
        showHostScreen();
    } else {
        showRegisterScreen();
        if (currentPlayer) {
            document.getElementById('playerName').value = currentPlayer.name;
            document.getElementById('playerTable').value = currentPlayer.table;
        }
    }
}

function restartGame() {
    currentPlayer = null;
    score = 0;
    currentQuestion = 0;
    gameStarted = false;
    gameActive = false;
    isHost = false;
    roomId = null;
    players = [];
    
    if (timer) {
        clearInterval(timer);
    }
    
    showHomeScreen();
}
