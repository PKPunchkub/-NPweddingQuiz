// server.js
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Game state
let gameRooms = new Map();
let activeRoomId = null;

// Game configuration
const ADMIN_PASSWORD = '689';
const MAX_PLAYERS = 250;
const QUESTION_TIME = 10; // seconds

// Questions data
const questions = [
    {
        question: "เจ้าบ่าวเจ้าสาวพบกันครั้งแรกที่ไหน? (Where did the bride and groom first meet?)",
        answers: ["มหาวิทยาลัย (University)", "ที่ทำงาน (At work)", "งานเพื่อน (Friend's party)", "แอปหาคู่ (Dating app)"],
        correct: 1
    },
    {
        question: "เจ้าสาวชอบสีอะไรมากที่สุด? (What is the bride's favorite color?)",
        answers: ["ชมพู (Pink)", "ฟ้า (Blue)", "เขียว (Green)", "ม่วง (Purple)"],
        correct: 0
    },
    {
        question: "เจ้าบ่าวขอแต่งงานที่ไหน? (Where did the groom propose?)",
        answers: ["ร้านอาหาร (Restaurant)", "ชายหาด (Beach)", "บ้าน (Home)", "สวนสาธารณะ (Park)"],
        correct: 1
    },
    {
        question: "คู่บ่าวสาวชอบทำอะไรร่วมกันมากที่สุด? (What do the couple enjoy doing together most?)",
        answers: ["ดูหนัง (Watching movies)", "ทำอาหาร (Cooking)", "เที่ยว (Traveling)", "เล่นเกม (Playing games)"],
        correct: 2
    },
    {
        question: "เจ้าบ่าวเจ้าสาวมีความฝันร่วมกันคืออะไร? (What is the couple's shared dream?)",
        answers: ["เปิดร้านอาหาร (Open a restaurant)", "เที่ยวรอบโลก (Travel around the world)", "มีบ้านหลังใหญ่ (Have a big house)", "เลี้ยงสุนัข (Raise dogs)"],
        correct: 1
    }
];

// Animal characters for players (250 unique characters)
const animalCharacters = [
    '🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🦁', '🐯', '🐸', '🐷', '🐮', '🐵',
    '🦄', '🐴', '🦓', '🦌', '🐺', '🐗', '🐽', '🐄', '🐂', '🐃', '🐪', '🐫', '🦏', '🦛', '🐘',
    '🦒', '🦘', '🐿️', '🦔', '🦇', '🐾', '🦮', '🐕‍🦺', '🐩', '🐈', '🐈‍⬛', '🦝', '🦨', '🦡', '🦦',
    '🐙', '🦑', '🐠', '🐟', '🐡', '🦈', '🐳', '🐋', '🦭', '🐧', '🦞', '🦀', '🐚', '🪸', '🐌',
    '🦐', '🦪', '🐢', '🐊', '🦕', '🦖', '🐲', '🐉', '🦎', '🐍', '🕸️', '🦂', '🕷️', '🦟', '🦠',
    '🐦', '🦅', '🦆', '🦢', '🦉', '🐓', '🦃', '🦚', '🦜', '🐥', '🐤', '🐣', '🦩', '🕊️', '🦤',
    '🪶', '🦋', '🐛', '🐝', '🐞', '🦗', '🕸️', '🦂', '🕷️', '🦟', '🦠', '🐜', '🪲', '🪳', '🦪'
];

// Extend to 250 characters
while (animalCharacters.length < 250) {
    const baseAnimals = ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🦁'];
    animalCharacters.push(...baseAnimals.slice(0, Math.min(baseAnimals.length, 250 - animalCharacters.length)));
}

// Utility functions
function generateRoomId() {
    return 'WEDDING-GAME-' + Date.now().toString().slice(-8);
}

function getUniqueAnimalCharacter(roomId) {
    const room = gameRooms.get(roomId);
    if (!room) return animalCharacters[0];
    
    const usedCharacters = room.players.map(player => player.character).filter(char => char);
    const availableCharacters = animalCharacters.filter(char => !usedCharacters.includes(char));
    
    if (availableCharacters.length === 0) {
        return animalCharacters[Math.floor(Math.random() * animalCharacters.length)];
    }
    
    return availableCharacters[Math.floor(Math.random() * availableCharacters.length)];
}

function createGameRoom() {
    // Only allow one active room
    if (activeRoomId && gameRooms.has(activeRoomId)) {
        const existingRoom = gameRooms.get(activeRoomId);
        // If room is less than 2 hours old, reuse it
        if (Date.now() - existingRoom.createdAt < 7200000) {
            return activeRoomId;
        }
    }
    
    // Clear old rooms
    gameRooms.clear();
    
    const roomId = generateRoomId();
    activeRoomId = roomId;
    
    gameRooms.set(roomId, {
        roomId: roomId,
        createdAt: Date.now(),
        players: [],
        gameState: 'waiting',
        gameStarted: false,
        currentQuestion: 0,
        questionStartTime: null,
        hostSocketId: null,
        isActive: true
    });
    
    console.log('Created new game room:', roomId);
    return roomId;
}

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/api/verify-admin', (req, res) => {
    const { password } = req.body;
    if (password === ADMIN_PASSWORD) {
        const roomId = createGameRoom();
        res.json({ success: true, roomId: roomId });
    } else {
        res.json({ success: false, message: 'Invalid password' });
    }
});

app.get('/api/room/:roomId', (req, res) => {
    const roomId = req.params.roomId;
    const room = gameRooms.get(roomId);
    
    if (!room) {
        return res.status(404).json({ error: 'Room not found' });
    }
    
    res.json({
        roomId: room.roomId,
        playerCount: room.players.length,
        gameState: room.gameState,
        gameStarted: room.gameStarted,
        currentQuestion: room.currentQuestion
    });
});

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log('User connected:', socket.id);
    
    // Host authentication
socket.on('host-authenticate', (data) => {
    const { password } = data;
    if (password === ADMIN_PASSWORD) {
        const roomId = createGameRoom();
        const room = gameRooms.get(roomId);
        room.hostSocketId = socket.id;
        
        socket.join(roomId);
        
        // สร้าง URL สำหรับเกม - แก้ไขส่วนนี้
        const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
        const host = socket.handshake.headers.host || 'localhost:3000';
        const gameUrl = `${protocol}://${host}/?join=true&room=${roomId}`;
        
        socket.emit('host-authenticated', { 
            roomId: roomId,
            gameUrl: gameUrl
        });
        
        console.log('Host authenticated for room:', roomId);
        console.log('Game URL:', gameUrl);
    } else {
        socket.emit('host-auth-failed', { message: 'Invalid password' });
    }
});
    
    // Player registration
    socket.on('player-register', (data) => {
        const { roomId, name, table } = data;
        const room = gameRooms.get(roomId);
        
        if (!room) {
            socket.emit('registration-failed', { message: 'Room not found' });
            return;
        }
        
        if (room.players.length >= MAX_PLAYERS) {
            socket.emit('registration-failed', { message: 'Room is full' });
            return;
        }
        
        // Check for duplicate names
        const existingPlayer = room.players.find(p => p.name.toLowerCase() === name.toLowerCase());
        if (existingPlayer) {
            socket.emit('registration-failed', { message: 'Name already taken' });
            return;
        }
        
        const player = {
            id: 'player-' + Date.now() + '-' + Math.floor(Math.random() * 10000),
            socketId: socket.id,
            name: name,
            table: table || '',
            character: getUniqueAnimalCharacter(roomId),
            score: 0,
            answers: [],
            joinedAt: Date.now(),
            roomId: roomId
        };
        
        room.players.push(player);
        socket.join(roomId);
        
        socket.emit('registration-success', { player: player });
        
        // Notify all clients in room about new player
        io.to(roomId).emit('player-joined', { 
            player: player, 
            totalPlayers: room.players.length 
        });
        
        // Notify host specifically
        if (room.hostSocketId) {
            io.to(room.hostSocketId).emit('host-player-joined', {
                player: player,
                totalPlayers: room.players.length
            });
        }
        
        console.log('Player registered:', name, 'in room:', roomId, 'Total players:', room.players.length);
    });
    
    // Start game (Host only)
    socket.on('start-game', (data) => {
        const { roomId } = data;
        const room = gameRooms.get(roomId);
        
        if (!room || room.hostSocketId !== socket.id) {
            socket.emit('error', { message: 'Unauthorized' });
            return;
        }
        
        if (room.players.length === 0) {
            socket.emit('error', { message: 'No players joined' });
            return;
        }
        
        room.gameStarted = true;
        room.gameState = 'playing';
        room.currentQuestion = 0;
        room.questionStartTime = Date.now();
        
        // Reset all player scores
        room.players.forEach(player => {
            player.score = 0;
            player.answers = [];
        });
        
        // Start first question
        const question = questions[0];
        io.to(roomId).emit('game-started', {
            currentQuestion: 0,
            question: question,
            questionStartTime: room.questionStartTime,
            timeLimit: QUESTION_TIME
        });
        
        // Host gets additional data
        io.to(room.hostSocketId).emit('host-game-started', {
            currentQuestion: 0,
            question: question,
            totalPlayers: room.players.length
        });
        
        console.log('Game started in room:', roomId, 'with', room.players.length, 'players');
        
        // Auto-advance to next question after time limit
        setTimeout(() => {
            advanceToNextQuestion(roomId);
        }, QUESTION_TIME * 1000 + 3000); // 10s + 3s for results
    });
    
    // Player answer submission
    socket.on('submit-answer', (data) => {
        const { roomId, playerId, questionIndex, selectedAnswer, timeLeft } = data;
        const room = gameRooms.get(roomId);
        
        if (!room || !room.gameStarted) {
            return;
        }
        
        const player = room.players.find(p => p.id === playerId && p.socketId === socket.id);
        if (!player) {
            return;
        }
        
        // Check if already answered this question
        if (player.answers.length > questionIndex) {
            return;
        }
        
        const question = questions[questionIndex];
        const isCorrect = selectedAnswer === question.correct;
        
        if (isCorrect) {
            player.score++;
        }
        
        player.answers.push({
            question: questionIndex,
            selected: selectedAnswer,
            correct: question.correct,
            isCorrect: isCorrect,
            timeLeft: timeLeft,
            answeredAt: Date.now()
        });
        
        // Send result to player
        socket.emit('answer-result', {
            isCorrect: isCorrect,
            correctAnswer: question.correct,
            score: player.score
        });
        
        // Update host with real-time stats
        if (room.hostSocketId) {
            const answerStats = [0, 0, 0, 0];
            let answeredCount = 0;
            
            room.players.forEach(p => {
                if (p.answers.length > questionIndex) {
                    const answer = p.answers[questionIndex];
                    if (answer.selected >= 0 && answer.selected <= 3) {
                        answerStats[answer.selected]++;
                    }
                    answeredCount++;
                }
            });
            
            io.to(room.hostSocketId).emit('host-answer-stats', {
                questionIndex: questionIndex,
                answerStats: answerStats,
                answeredCount: answeredCount,
                totalPlayers: room.players.length
            });
        }
        
        console.log('Answer submitted by', player.name, 'for question', questionIndex, 'Correct:', isCorrect);
    });
    
    // Get game state
    socket.on('get-game-state', (data) => {
        const { roomId } = data;
        const room = gameRooms.get(roomId);
        
        if (!room) {
            socket.emit('error', { message: 'Room not found' });
            return;
        }
        
        socket.emit('game-state', {
            roomId: room.roomId,
            players: room.players.map(p => ({
                id: p.id,
                name: p.name,
                table: p.table,
                character: p.character,
                score: p.score
            })),
            gameState: room.gameState,
            gameStarted: room.gameStarted,
            currentQuestion: room.currentQuestion,
            questionStartTime: room.questionStartTime
        });
    });
    
    // End game (Host only)
    socket.on('end-game', (data) => {
        const { roomId } = data;
        const room = gameRooms.get(roomId);
        
        if (!room || room.hostSocketId !== socket.id) {
            socket.emit('error', { message: 'Unauthorized' });
            return;
        }
        
        room.gameState = 'finished';
        
        // Calculate final rankings
        const activePlayers = room.players.filter(p => p.answers.length > 0);
        activePlayers.sort((a, b) => {
            if (b.score !== a.score) {
                return b.score - a.score;
            }
            const aAvgTime = a.answers.reduce((sum, ans) => sum + (ans.timeLeft || 0), 0) / a.answers.length;
            const bAvgTime = b.answers.reduce((sum, ans) => sum + (ans.timeLeft || 0), 0) / b.answers.length;
            return bAvgTime - aAvgTime;
        });
        
        io.to(roomId).emit('game-ended', {
            leaderboard: activePlayers.slice(0, 10).map((player, index) => ({
                rank: index + 1,
                id: player.id,
                name: player.name,
                table: player.table,
                character: player.character,
                score: player.score,
                totalQuestions: questions.length
            }))
        });
        
        console.log('Game ended in room:', roomId);
    });
    
    // Handle disconnection
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        
        // Remove player from all rooms
        gameRooms.forEach((room, roomId) => {
            const playerIndex = room.players.findIndex(p => p.socketId === socket.id);
            if (playerIndex !== -1) {
                const player = room.players[playerIndex];
                room.players.splice(playerIndex, 1);
                
                // Notify room about player leaving
                io.to(roomId).emit('player-left', {
                    playerId: player.id,
                    playerName: player.name,
                    totalPlayers: room.players.length
                });
                
                console.log('Player left:', player.name, 'from room:', roomId);
            }
            
            // If host disconnected, mark room as inactive
            if (room.hostSocketId === socket.id) {
                room.hostSocketId = null;
                console.log('Host disconnected from room:', roomId);
            }
        });
    });
});

// Function to advance to next question
function advanceToNextQuestion(roomId) {
    const room = gameRooms.get(roomId);
    if (!room || !room.gameStarted) return;
    
    room.currentQuestion++;
    
    if (room.currentQuestion >= questions.length) {
        // Game finished
        room.gameState = 'finished';
        
        const activePlayers = room.players.filter(p => p.answers.length > 0);
        activePlayers.sort((a, b) => {
            if (b.score !== a.score) {
                return b.score - a.score;
            }
            const aAvgTime = a.answers.reduce((sum, ans) => sum + (ans.timeLeft || 0), 0) / a.answers.length;
            const bAvgTime = b.answers.reduce((sum, ans) => sum + (ans.timeLeft || 0), 0) / b.answers.length;
            return bAvgTime - aAvgTime;
        });
        
        io.to(roomId).emit('game-ended', {
            leaderboard: activePlayers.slice(0, 10).map((player, index) => ({
                rank: index + 1,
                id: player.id,
                name: player.name,
                table: player.table,
                character: player.character,
                score: player.score,
                totalQuestions: questions.length
            }))
        });
        
        console.log('Game automatically ended in room:', roomId);
        return;
    }
    
    // Next question
    room.questionStartTime = Date.now();
    const question = questions[room.currentQuestion];
    
    io.to(roomId).emit('next-question', {
        currentQuestion: room.currentQuestion,
        question: question,
        questionStartTime: room.questionStartTime,
        timeLimit: QUESTION_TIME
    });
    
    // Host gets additional data
    if (room.hostSocketId) {
        io.to(room.hostSocketId).emit('host-next-question', {
            currentQuestion: room.currentQuestion,
            question: question
        });
    }
    
    console.log('Advanced to question', room.currentQuestion + 1, 'in room:', roomId);
    
    // Schedule next question
    setTimeout(() => {
        advanceToNextQuestion(roomId);
    }, QUESTION_TIME * 1000 + 3000);
}

// Clean up old rooms every hour
setInterval(() => {
    const now = Date.now();
    gameRooms.forEach((room, roomId) => {
        if (now - room.createdAt > 7200000) { // 2 hours
            gameRooms.delete(roomId);
            console.log('Cleaned up old room:', roomId);
        }
    });
}, 3600000); // 1 hour

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🎉 Namkhing & Punch Wedding Quiz Server running on port ${PORT}`);
    console.log(`🌐 Access the game at: http://localhost:${PORT}`);
});
