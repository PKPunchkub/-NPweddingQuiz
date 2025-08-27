// server.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.static(path.join(__dirname, "public")));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

// ====== ข้อมูลเกม (5 ข้อ) ======
const QUESTIONS = [
  {
    id: 1,
    text: "Which planet is known as the Red Planet?",
    choices: ["Mercury", "Venus", "Earth", "Mars"],
    answerIndex: 3
  },
  {
    id: 2,
    text: "2 + 2 × 3 = ?",
    choices: ["8", "12", "6", "10"],
    answerIndex: 0
  },
  {
    id: 3,
    text: "The capital of Japan is ____.",
    choices: ["Kyoto", "Tokyo", "Osaka", "Sapporo"],
    answerIndex: 1
  },
  {
    id: 4,
    text: "HTTP status 404 means:",
    choices: ["OK", "Forbidden", "Not Found", "Server Error"],
    answerIndex: 2
  },
  {
    id: 5,
    text: "Which one is a JavaScript runtime?",
    choices: ["Django", "Laravel", "Node.js", "Rails"],
    answerIndex: 2
  }
];

// ====== สถานะเกม ======
let gameState = {
  started: false,
  currentIndex: 0, // index ของคำถามใน QUESTIONS
  players: new Map(), 
  // players.set(socketId, { name, score, answeredFor: Set(questionId) })
  answersByQuestion: new Map() 
  // answersByQuestion.set(questionId, Map<socketId, {name, choiceIndex, correct, timeMs}>)
};

// รีเซ็ตเกม (แอดมินสามารถเรียกใช้ผ่าน endpoint ง่ายๆ)
function resetGame() {
  gameState.started = false;
  gameState.currentIndex = 0;
  gameState.players.clear();
  gameState.answersByQuestion.clear();
}
app.get("/admin/reset", (_req, res) => {
  resetGame();
  io.emit("game:reset");
  res.json({ ok: true });
});

// เริ่มเกมและเริ่มที่ข้อแรก
function startGame() {
  gameState.started = true;
  gameState.currentIndex = 0;
  io.emit("game:started");
  emitState();
  sendCurrentQuestion();
}

function nextQuestion() {
  if (gameState.currentIndex < QUESTIONS.length - 1) {
    gameState.currentIndex += 1;
    emitState();
    sendCurrentQuestion();
  } else {
    // จบเกม
    gameState.started = false;
    io.emit("game:finished", buildLeaderboard());
  }
}

function sendCurrentQuestion() {
  const q = QUESTIONS[gameState.currentIndex];
  const payload = {
    id: q.id,
    text: q.text,
    choices: q.choices,
    index: gameState.currentIndex,
    total: QUESTIONS.length,
    answeredCount: getAnsweredCount(q.id),
    answeredNames: getAnsweredNames(q.id)
  };
  io.emit("question", payload);
}

function getAnsweredCount(qid) {
  const m = gameState.answersByQuestion.get(qid);
  return m ? m.size : 0;
}

function getAnsweredNames(qid) {
  const m = gameState.answersByQuestion.get(qid);
  return m ? [...m.values()].map(v => v.name) : [];
}

function buildPlayerList() {
  return [...gameState.players.entries()].map(([id, p]) => ({
    id, name: p.name, score: p.score
  }));
}

function buildLeaderboard() {
  return buildPlayerList().sort((a, b) => b.score - a.score);
}

function emitState() {
  io.emit("players:update", buildPlayerList());
  io.emit("progress:update", {
    started: gameState.started,
    currentIndex: gameState.currentIndex,
    total: QUESTIONS.length
  });
}

// ====== Socket.io ======
io.on("connection", (socket) => {
  // ผู้เล่นเข้าร่วม
  socket.on("player:join", (nameRaw) => {
    const name = String(nameRaw || "").trim().slice(0, 24) || "Player";
    gameState.players.set(socket.id, {
      name,
      score: 0,
      answeredFor: new Set()
    });

    // ส่งสถานะเริ่มต้นให้คนที่เพิ่งเข้ามา
    socket.emit("hello", {
      started: gameState.started,
      currentIndex: gameState.currentIndex,
      total: QUESTIONS.length,
      leaderboard: buildLeaderboard()
    });

    emitState();
    if (gameState.started) {
      sendCurrentQuestion();
    }
  });

  // เริ่มเกม (ปกติคุณจะล็อกเป็นแอดมิน แต่ตัวอย่างให้เริ่มจากใครก็ได้)
  socket.on("game:start", () => {
    if (!gameState.started) startGame();
  });

  // ผู้เล่นส่งคำตอบ
  socket.on("answer", ({ questionId, choiceIndex, timeMs }) => {
    const player = gameState.players.get(socket.id);
    const qIndex = gameState.currentIndex;
    const q = QUESTIONS[qIndex];

    // ป้องกันตอบผิดข้อ/ซ้ำ หรือยังไม่ใช่รอบนี้
    if (!player || !q || q.id !== questionId || player.answeredFor.has(questionId)) {
      return;
    }

    // บันทึกคำตอบ
    const correct = Number(choiceIndex) === q.answerIndex;
    player.answeredFor.add(questionId);
    if (correct) {
      // ให้แต้ม: พื้นฐาน 10 แต้ม + โบนัสความเร็วเล็กน้อย
      const speedBonus = Math.max(0, 5 - Math.floor((timeMs || 0) / 1000)); // สูงสุด +5
      player.score += 10 + speedBonus;
    }

    if (!gameState.answersByQuestion.has(questionId)) {
      gameState.answersByQuestion.set(questionId, new Map());
    }
    gameState.answersByQuestion.get(questionId).set(socket.id, {
      name: player.name,
      choiceIndex: Number(choiceIndex),
      correct,
      timeMs: Number(timeMs || 0)
    });

    // อัปเดตรายชื่อผู้ที่ตอบแล้วในข้อนี้
    io.emit("question:answeredUpdate", {
      questionId,
      answeredCount: getAnsweredCount(questionId),
      answeredNames: getAnsweredNames(questionId)
    });

    emitState();

    // ถ้าทุกคนที่ "กำลังออนไลน์" ตอบแล้ว หรือครบเวลา จะไปข้อถัดไป
    // (ตัวอย่างนี้ให้ไปต่ออัตโนมัติเมื่อมีคนตอบครบ >= 1/2 ของผู้ที่ออนไลน์ หรือครบ 20 วิ)
    const onlinePlayers = [...gameState.players.values()].length;
    const answeredNow = getAnsweredCount(questionId);
    if (answeredNow >= Math.ceil(Math.max(2, onlinePlayers * 0.5))) {
      nextQuestion();
    }
  });

  // ขอไปข้อถัดไปแบบกด (ป้องกันกรณีคนตอบไม่ครบ)
  socket.on("game:next", () => {
    if (gameState.started) nextQuestion();
  });

  socket.on("disconnect", () => {
    // เอาออกจาก players
    const existed = gameState.players.delete(socket.id);
    if (existed) emitState();
  });
});

// ====== Start server (ใช้ PORT ของ Render/Heroku ได้) ======
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Quiz server running on http://localhost:${PORT}`);
});
