// public/client.js
const socket = io();

let myName = "";
let currentQuestionId = null;
let questionStartAt = 0;

const el = (id) => document.getElementById(id);
const joinEl = el("join");
const nameEl = el("name");
const joinBtn = el("joinBtn");
const startBtn = el("startBtn");
const qTitle = el("qTitle");
const choicesEl = el("choices");
const progressEl = el("progress");
const playersEl = el("players");
const leaderboardEl = el("leaderboard");
const answeredCountEl = el("answeredCount");
const answeredNamesEl = el("answeredNames");
const nextBtn = el("nextBtn");

// UI helpers
function renderPlayers(list) {
  playersEl.innerHTML = list
    .map(p => `<div class="${p.name === myName ? "me" : ""}">• ${escapeHtml(p.name)} <span class="muted">(${p.score})</span></div>`)
    .join("");
}

function renderLeaderboard(list) {
  leaderboardEl.innerHTML = list
    .map((p, i) => `<div>${i + 1}. ${escapeHtml(p.name)} — <b>${p.score}</b></div>`)
    .join("");
}

function renderAnsweredNames(names) {
  answeredNamesEl.innerHTML = names.map(n => `<span class="pill">${escapeHtml(n)}</span>`).join("");
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (m) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

// events
joinBtn.onclick = () => {
  myName = (nameEl.value || "").trim() || "Player";
  socket.emit("player:join", myName);
};

startBtn.onclick = () => {
  socket.emit("game:start");
};

nextBtn.onclick = () => {
  socket.emit("game:next");
};

socket.on("hello", (state) => {
  // initial info
  fetchLeaderboard(); // request initial
});

socket.on("players:update", (players) => {
  renderPlayers(players);
  renderLeaderboard(players.sort((a,b)=>b.score-a.score));
});

socket.on("progress:update", ({ started, currentIndex, total }) => {
  progressEl.textContent = started
    ? `Question ${currentIndex + 1} / ${total}`
    : `Game not started`;
});

socket.on("game:started", () => {
  // reset UI for a new game
  answeredNamesEl.innerHTML = "";
  answeredCountEl.textContent = "0";
});

socket.on("question", (q) => {
  currentQuestionId = q.id;
  questionStartAt = Date.now();

  qTitle.textContent = q.text;
  choicesEl.innerHTML = "";
  q.choices.forEach((c, idx) => {
    const btn = document.createElement("button");
    btn.className = "choice";
    btn.textContent = `${String.fromCharCode(65 + idx)}. ${c}`;
    btn.onclick = () => {
      const timeMs = Date.now() - questionStartAt;
      socket.emit("answer", { questionId: q.id, choiceIndex: idx, timeMs });
      // ล็อกปุ่มหลังตอบแล้ว
      Array.from(choicesEl.querySelectorAll("button")).forEach(b => b.disabled = true);
    };
    choicesEl.appendChild(btn);
  });

  answeredCountEl.textContent = String(q.answeredCount || 0);
  renderAnsweredNames(q.answeredNames || []);
});

socket.on("question:answeredUpdate", (info) => {
  if (info.questionId !== currentQuestionId) return;
  answeredCountEl.textContent = String(info.answeredCount);
  renderAnsweredNames(info.answeredNames);
});

socket.on("game:finished", (leaderboard) => {
  qTitle.textContent = "🎉 Game Finished!";
  choicesEl.innerHTML = "";
  renderLeaderboard(leaderboard);
});

// simple poll to rebuild leaderboard from players:update anyway
function fetchLeaderboard(){ /* kept for extensibility */ }
