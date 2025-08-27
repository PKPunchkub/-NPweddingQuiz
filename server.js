const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Game configuration
const ADMIN_PASSWORD = 'namkhing2024';
const MAX_PLAYERS = 250;
const QUESTION_TIME = 10; // seconds

// Game questions
const questions = [
    {
        question: "น้ำขิงชอบสีอะไรมากที่สุด? (What is Namkhing's favorite color?)",
        answers: ["สีชมพู (Pink)", "สีฟ้า (Blue)", "สีเขียว (Green)", "สีม่วง (Purple)"],
        correct: 3
    },
    {
        question: "พันช์ชอบกินอาหารประเภทไหนมากที่สุด? (What type of food does Punch like most?)",
        answers: ["อาหารญี่ปุ่น (Japanese)", "อาหารอิตาเลียน (Italian)", "อาหารไทย (Thai)", "อาหารเกาหลี (Korean)"],
        correct: 0
    },
    {
        question: "น้ำขิงและพันช์รู้จักกันที่ไหน? (Where did Namkhing and Punch meet?)",
        answers: ["ที่ทำงาน (At work)", "ที่มหาวิทยาลัย (At university)", "ผ่านเพื่อน (Through friends)", "แอปหาคู่ (Dating app)"],
        correct: 1
    },
    {
        question: "งานอดิเรกที่ทั้งคู่ชอบทำร่วมกันคืออะไร? (What hobby do they both enjoy together?)",
        answers: ["ดูหนัง (Watching movies)", "ทำอาหาร (Cooking)", "เดินทาง (Traveling)", "เล่นเกม (Playing games)"],
        correct: 2
    },
    {
        question: "พันช์ขอน้ำขิงแต่งงานที่ไหน? (Where did Punch propose to Namkhing?)",
        answers: ["ที่บ้าน (At home)", "ร้านอาหาร (Restaurant)", "ชายหาด (Beach)", "สวนสาธารณะ (Park)"],
        correct: 2
    }
];

// Character emojis for players
const characters = ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵', '🙈', '🙉', '🙊', '🐒', '🐔', '🐧', '🐦', '🐤', '🐣', '🐥', '🦆', '🦅', '🦉', '🦇', '🐺', '🐗', '🐴', '🦄', '🐝', '🐛', '🦋', '🐌', '🐞', '🐜', '🦟', '🦗', '🕷', '🦂', '🐢', '🐍', '🦎', '🦖', '🦕', '🐙', '🦑', '🦐', '🦞', '🦀', '🐡', '🐠', '🐟', '🐬', '🐳', '🐋', '🦈', '🐊', '🐅', '🐆', '🦓', '🦍', '🦧', '🐘', '🦛', '🦏', '🐪', '🐫', '🦒', '🦘', '🐃', '🐂', '🐄', '🐎', '🐖', '🐏', '🐑', '🦙', '🐐', '🦌', '🐕', '🐩', '🦮', '🐕‍🦺', '🐈', '🐈‍⬛', '🐓', '🦃', '🦚', '🦜', '🦢', '🦩', '🕊', '🐇', '🦝', '🦨', '🦡', '🦦', '🦥', '🐁', '🐀', '🐿', '🦔'];

// Game state
const rooms = new Map();
let onlineUsers = 0;

// Utility functions
function generateRoomId() {
    return 'room_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
}

function getRandomCharacter() {
    return characters[Math.floor(Math.random() * characters.length)];
}

function calculateScore(timeLeft, totalTime = QUESTION_TIME) {
    // Base score for correct answer
    const baseScore = 100;
    // Time bonus (up to 50 points for answering quickly)
    const timeBonus = Math.floor((timeLeft / totalTime) * 50);
    return baseScore + timeBonus;
}

// Function to get the correct host URL for cloud deployment
function getHostUrl(socket) {
    // Try to get from environment variable first (highest priority)
    if (process.env.GAME_URL) {
        return process.env.GAME_URL;
    }
    
    // Get from request headers
    const headers = socket.handshake.headers;
    const host = headers.host;
    
    // Determine protocol based on various indicators
    let protocol = 'http';
    
    // Check for forwarded protocol (from reverse proxy/load balancer)
    if (headers['x-forwarded-proto']) {
        protocol = headers['x-forwarded-proto'];
    } 
    // Check for SSL forwarding
    else if (headers['x-forwarded-ssl'] === 'on') {
        protocol = 'https';
    }
    // Check if running in production environment
    else if (process.env.NODE_ENV === 'production') {
        protocol = 'https';
    }
    // Check for common cloud hosting platforms
    else if (host && (
        host.includes('herokuapp.com') || 
        host.includes('railway.app') || 
        host.includes('vercel.app') || 
        host.includes('netlify.app') ||
        host.includes('render.com') ||
        host.includes('fly.io') ||
        host.includes('glitch.me')
    )) {
        protocol = 'https';
    }
    
    if (host) {
        const gameUrl = `${protocol}://${host}`;
        console.log(`Generated game URL: ${gameUrl}`);
        return gameUrl;
    }
    
    // Fallback to localhost (for local development only)
    console.log('Falling back to localhost - this will not work for mobile devices over internet');
    return 'http://localhost:3000';
}

// Health check endpoint for cloud platforms
app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        rooms: rooms.size,
        onlineUsers: onlineUsers
    });
});

// Root endpoint
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log('User connected:', socket.id);
    onlineUsers++;
    
    // Broadcast online count to all users
    io.emit('online-count', { count: onlineUsers });

    // Host authentication
    socket.on('host-authenticate', (data) => {
        console.log('Host authentication attempt:', data.password);
        
        if (data.password === ADMIN_PASSWORD) {
            const roomId = generateRoomId();
            const hostUrl = getHostUrl(socket);
            const gameUrl = `${hostUrl}?join=true&room=${roomId}`;
            
            // Create new room
            rooms.set(roomId, {
                id: roomId,
                hostId: socket.id,
                players: [],
                gameStarted: false,
                currentQuestion: 0,
                questionStartTime: null
            });
            
            socket.join(roomId);
            socket.emit('host-authenticated', { 
                roomId: roomId,
                gameUrl: gameUrl
            });
            
            console.log('Host authenticated, room created:', roomId);
            console.log('Game URL generated:', gameUrl);
        } else {
            socket.emit('host-auth-failed', { message: 'Invalid password' });
        }
    });

    // Player registration
    socket.on('player-register', (data) => {
        const { roomId, name, table } = data;
        const room = rooms.get(roomId);
        
        if (!room) {
            socket.emit('registration-failed', { message: 'ห้องเล่นไม่พบ กรุณาสแกน QR Code ใหม่' });
            return;
        }
        
        if (room.gameStarted) {
            socket.emit('registration-failed', { message: 'เกมเริ่มแล้ว ไม่สามารถเข้าร่วมได้' });
            return;
        }
        
        if (room.players.length >= MAX_PLAYERS) {
            socket.emit('registration-failed', { message: 'ห้องเต็มแล้ว' });
            return;
        }
        
        // Check if name already exists
        const existingPlayer = room.players.find(p => p.name.toLowerCase() === name.toLowerCase());
        if (existingPlayer) {
            socket.emit('registration-failed', { message: 'ชื่อนี้มีคนใช้แล้ว กรุณาใช้ชื่ออื่น' });
            return;
        }
        
        const player = {
            id: socket.id,
            name: name,
            table: table,
            character: getRandomCharacter(),
            score: 0,
            answers: [],
            joinTime: Date.now()
        };
        
        room.players.push(player);
        socket.join(roomId);
        
        socket.emit('registration-success', { player: player });
        
        // Notify all players in room
        io.to(roomId).emit('player-joined', { 
            player: player, 
            totalPlayers: room.players.length 
        });
        
        // Notify host specifically
        io.to(room.hostId).emit('host-player-joined', { 
            player: player, 
            totalPlayers: room.players.length 
        });
        
        console.log(`Player ${name} joined room ${roomId}`);
    });

    // Get game state
    socket.on('get-game-state', (data) => {
        const room = rooms.get(data.roomId);
        if (room) {
            socket.emit('game-state', { 
                players: room.players,
                gameStarted: room.gameStarted,
                currentQuestion: room.currentQuestion
            });
        }
    });

    // Start game
    socket.on('start-game', (data) => {
        const room = rooms.get(data.roomId);
        if (!room || room.hostId !== socket.id) {
            socket.emit('error', { message: 'Unauthorized' });
            return;
        }
        
        if (room.players.length === 0) {
            socket.emit('error', { message: 'ไม่มีผู้เล่นในห้อง' });
            return;
        }
        
        room.gameStarted = true;
        room.currentQuestion = 0;
        room.questionStartTime = Date.now();
        
        const questionData = {
            currentQuestion: room.currentQuestion,
            question: questions[room.currentQuestion],
            totalQuestions: questions.length
        };
        
        // Send to players
        io.to(data.roomId).emit('game-started', questionData);
        
        // Send to host
        io.to(room.hostId).emit('host-game-started', questionData);
        
        console.log(`Game started in room ${data.roomId} with ${room.players.length} players`);
        
        // Auto advance to next question after time limit
        setTimeout(() => {
            advanceToNextQuestion(data.roomId);
        }, (QUESTION_TIME + 3) * 1000); // Extra 3 seconds for showing results
    });

    // Submit answer
    socket.on('submit-answer', (data) => {
        const { roomId, playerId, questionIndex, selectedAnswer, timeLeft } = data;
        const room = rooms.get(roomId);
        
        if (!room || !room.gameStarted) {
            return;
        }
        
        const player = room.players.find(p => p.id === playerId);
        if (!player) {
            return;
        }
        
        // Check if player already answered this question
        if (player.answers[questionIndex] !== undefined) {
            return;
        }
        
        const question = questions[questionIndex];
        const isCorrect = selectedAnswer === question.correct;
        const correctAnswer = question.correct;
        
        // Store answer
        player.answers[questionIndex] = selectedAnswer;
        
        // Calculate and add score if correct
        if (isCorrect) {
            const scoreEarned = calculateScore(timeLeft);
            player.score += scoreEarned;
        }
        
        // Send result to player
        socket.emit('answer-result', {
            isCorrect: isCorrect,
            correctAnswer: correctAnswer,
            score: player.score,
            scoreEarned: isCorrect ? calculateScore(timeLeft) : 0
        });
        
        // Send updated statistics to host
        updateHostStatistics(roomId);
        
        console.log(`Player ${player.name} answered question ${questionIndex}: ${selectedAnswer} (correct: ${correctAnswer})`);
    });

    // End game (host only)
    socket.on('end-game', (data) => {
        const room = rooms.get(data.roomId);
        if (!room || room.hostId !== socket.id) {
            socket.emit('error', { message: 'Unauthorized' });
            return;
        }
        
        endGame(data.roomId);
    });

    // Host restart game
    socket.on('host-restart-game', (data) => {
        const room = rooms.get(data.roomId);
        if (!room || room.hostId !== socket.id) {
            socket.emit('error', { message: 'Unauthorized' });
            return;
        }
        
        // Clear all players from the room
        room.players.forEach(player => {
            const playerSocket = io.sockets.sockets.get(player.id);
            if (playerSocket) {
                playerSocket.leave(data.roomId);
            }
        });
        
        // Reset room state
        room.players = [];
        room.gameStarted = false;
        room.currentQuestion = 0;
        room.questionStartTime = null;
        
        // Notify all clients that players were cleared
        io.to(data.roomId).emit('players-cleared', { 
            message: 'All players cleared for new game' 
        });
        
        console.log(`Host restarted game in room ${data.roomId}`);
    });

    // Handle disconnection
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        onlineUsers--;
        
        // Remove player from any room
        for (const [roomId, room] of rooms.entries()) {
            const playerIndex = room.players.findIndex(p => p.id === socket.id);
            if (playerIndex !== -1) {
                room.players.splice(playerIndex, 1);
                io.to(roomId).emit('player-left', { 
                    totalPlayers: room.players.length 
                });
                console.log(`Player left room ${roomId}`);
            }
            
            // If host disconnected, clean up room
            if (room.hostId === socket.id) {
                io.to(roomId).emit('host-disconnected', { 
                    message: 'Host disconnected, game ended' 
                });
                rooms.delete(roomId);
                console.log(`Room ${roomId} deleted - host disconnected`);
            }
        }
        
        // Broadcast updated online count
        io.emit('online-count', { count: onlineUsers });
    });
});

// Helper functions
function updateHostStatistics(roomId) {
    const room = rooms.get(roomId);
    if (!room) return;
    
    const currentQuestion = room.currentQuestion;
    const correctAnswer = questions[currentQuestion].correct;
    
    // Count answers for each option
    let countA = 0, countB = 0, countC = 0, countD = 0;
    let answeredPlayers = 0;
    
    room.players.forEach(player => {
        if (player.answers[currentQuestion] !== undefined) {
            answeredPlayers++;
            switch (player.answers[currentQuestion]) {
                case 0: countA++; break;
                case 1: countB++; break;
                case 2: countC++; break;
                case 3: countD++; break;
            }
        }
    });
    
    // Get list of players who answered correctly
    const correctPlayers = room.players.filter(player => {
        return player.answers && player.answers[currentQuestion] === correctAnswer;
    }).map(player => ({
        id: player.id,
        name: player.name,
        character: player.character,
        table: player.table
    }));
    
    // Send statistics to host with correct players list
    io.to(room.hostId).emit('host-answer-stats', {
        answerStats: [countA, countB, countC, countD],
        answeredCount: answeredPlayers,
        totalPlayers: room.players.length,
        correctPlayers: correctPlayers
    });
}

function advanceToNextQuestion(roomId) {
    const room = rooms.get(roomId);
    if (!room || !room.gameStarted) return;
    
    room.currentQuestion++;
    
    if (room.currentQuestion >= questions.length) {
        // Game finished
        endGame(roomId);
        return;
    }
    
    room.questionStartTime = Date.now();
    
    const questionData = {
        currentQuestion: room.currentQuestion,
        question: questions[room.currentQuestion],
        totalQuestions: questions.length
    };
    
    // Send to players
    io.to(roomId).emit('next-question', questionData);
    
    // Send to host
    io.to(room.hostId).emit('host-next-question', questionData);
    
    console.log(`Advanced to question ${room.currentQuestion + 1} in room ${roomId}`);
    
    // Auto advance to next question
    setTimeout(() => {
        advanceToNextQuestion(roomId);
    }, (QUESTION_TIME + 3) * 1000);
}

function endGame(roomId) {
    const room = rooms.get(roomId);
    if (!room) return;
    
    // Calculate final rankings
    const sortedPlayers = room.players
        .filter(player => player.answers.length > 0) // Only players who answered at least one question
        .sort((a, b) => {
            if (b.score !== a.score) {
                return b.score - a.score; // Sort by score descending
            }
            return a.joinTime - b.joinTime; // If tied, earlier joiner wins
        });
    
    // Assign ranks
    let currentRank = 1;
    for (let i = 0; i < sortedPlayers.length; i++) {
        if (i > 0 && sortedPlayers[i].score < sortedPlayers[i-1].score) {
            currentRank = i + 1;
        }
        sortedPlayers[i].rank = currentRank;
        sortedPlayers[i].totalQuestions = questions.length;
    }
    
    // Send results to all players
    io.to(roomId).emit('game-ended', {
        leaderboard: sortedPlayers
    });
    
    console.log(`Game ended in room ${roomId}. Winner: ${sortedPlayers[0]?.name || 'None'}`);
    
    // Mark game as finished
    room.gameStarted = false;
}

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🎮 Wedding Game Server running on port ${PORT}`);
    console.log(`🔐 Admin password: ${ADMIN_PASSWORD}`);
    console.log(`👥 Max players per room: ${MAX_PLAYERS}`);
    console.log(`⏱️  Question time: ${QUESTION_TIME} seconds`);
    console.log(`🌐 Server listening on all interfaces (0.0.0.0:${PORT})`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});
