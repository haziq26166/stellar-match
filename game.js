/* ============================================================
   STELLAR MATCH — GAME LOGIC
   ------------------------------------------------------------
   Flow:
   - Player swaps adjacent orbs freely.
   - After every N VALID swaps, a question appears automatically.
     N = state.questionsTarget (default 2).
   - Correct answer → target resets to base (2).
   - Wrong answer  → target drops by 1 (floor = 1).
     The next question comes ONE swap sooner.
   - Move counter is never affected by answers.
   - Questions NEVER repeat until every question has appeared
     once. The list is drawn in cycles:
       Cycle 1  → authored order (QUESTIONS[0], [1], [2] …)
       Cycle 2+ → random order
     A cycle only ends when the whole list has been shown.
     The cycle persists across levels, wins and losses.
   - Level ends when score >= target (win) or moves run out (lose).
   ============================================================ */

(function () {
  'use strict';

  const state = {
    // Persistent
    currentLevel: 0,
    isGrandmage: false,

    // Active level
    levelConfig: null,
    grid: [],
    selectedTile: null,
    score: 0,
    movesLeft: 0,
    shufflesLeft: 0,
    levelLocked: false,
    cascadeDepth: 0,

    // Question trigger
    swapsSinceLastQuestion: 0,
    questionsAnswered: 0,
    questionsCorrect: 0,
    questionPending: false,

    // Dynamic question counter
    // Number of valid swaps needed before the next question appears.
    // Wrong answers reduce this by 1 (floor = 1).
    questionsTarget: 2,

    // ------------------------------------------------------------
    // Question cycle — no repeats until EVERY question has appeared
    // ------------------------------------------------------------
    questionPass: 1,        // 1 = first ordered cycle, 2+ = random cycles
    usedQuestions: [],      // questions already shown in the current cycle

    // Question flow
    currentQuestion: null,
    currentQuestionTime: 0,
    timerInterval: null,
    timeLeft: 0,
    answering: false,

    audioUnlocked: false
  };

  const SWAPS_PER_QUESTION = 2;

  const $ = function (id) { return document.getElementById(id); };

  /* ============================================================
     SAVE / LOAD
     ============================================================ */
  function loadSave() {
    try {
      const raw = localStorage.getItem(GAME_CONFIG.SAVE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        state.currentLevel = data.currentLevel || 0;
        state.isGrandmage = data.isGrandmage || false;
      }
    } catch (e) {}
  }
  function saveGame() {
    try {
      localStorage.setItem(GAME_CONFIG.SAVE_KEY, JSON.stringify({
        currentLevel: state.currentLevel,
        isGrandmage: state.isGrandmage,
        savedAt: Date.now()
      }));
    } catch (e) {}
  }
  function resetSave() {
    if (!confirm("Reset all progress?")) return;
    state.currentLevel = 0;
    state.isGrandmage = false;
    state.questionPass = 1;
    state.usedQuestions = [];
    saveGame();
    Audio.sfxReset();
    showScreen('start-screen');
  }

  /* ============================================================
     HELPERS
     ============================================================ */
  function orbById(id) { return ORBS.find(function (r) { return r.id === id; }); }
  function randomOrb() { return ORBS[Math.floor(Math.random() * ORBS.length)].id; }
  function inBounds(r, c) {
    return r >= 0 && r < GAME_CONFIG.GRID_ROWS && c >= 0 && c < GAME_CONFIG.GRID_COLS;
  }
  function isAdjacent(a, b) {
    const dr = Math.abs(a.r - b.r);
    const dc = Math.abs(a.c - b.c);
    return (dr + dc) === 1;
  }

  /* ============================================================
     GRID SETUP
     ============================================================ */
  function buildEmptyGrid() {
    const grid = [];
    for (let r = 0; r < GAME_CONFIG.GRID_ROWS; r++) {
      const row = [];
      for (let c = 0; c < GAME_CONFIG.GRID_COLS; c++) row.push(null);
      grid.push(row);
    }
    return grid;
  }

  function fillGridNoMatches() {
    for (let r = 0; r < GAME_CONFIG.GRID_ROWS; r++) {
      for (let c = 0; c < GAME_CONFIG.GRID_COLS; c++) {
        let attempts = 0;
        let id;
        do {
          id = randomOrb();
          attempts++;
          if (attempts > 30) break;
        } while (createsInitialMatch(r, c, id));
        state.grid[r][c] = id;
      }
    }
  }

  function createsInitialMatch(r, c, id) {
    if (c >= 2 && state.grid[r][c - 1] === id && state.grid[r][c - 2] === id) return true;
    if (r >= 2 && state.grid[r - 1][c] === id && state.grid[r - 2][c] === id) return true;
    return false;
  }

  /* ============================================================
     RENDER
     ============================================================ */
  function renderGrid() {
    const gridEl = $('grid');
    gridEl.innerHTML = '';
    for (let r = 0; r < GAME_CONFIG.GRID_ROWS; r++) {
      for (let c = 0; c < GAME_CONFIG.GRID_COLS; c++) {
        const id = state.grid[r][c];
        const tile = document.createElement('div');
        tile.className = 'orb';
        tile.dataset.r = r;
        tile.dataset.c = c;
        tile.dataset.orb = id;
        const orb = orbById(id);
        if (orb) {
          // Inline SVG shape (colour inherited via currentColor).
          tile.innerHTML = orb.svg;
          tile.style.color = orb.color;
        }
        if (state.selectedTile && state.selectedTile.r === r && state.selectedTile.c === c) {
          tile.classList.add('selected');
        }
        tile.addEventListener('click', onTileClick);
        gridEl.appendChild(tile);
      }
    }
  }

  function getTileEl(r, c) {
    return $('grid').querySelector('.orb[data-r="' + r + '"][data-c="' + c + '"]');
  }

  function updateScoreDisplay() {
    $('score-display').textContent = state.score + ' / ' + state.levelConfig.targetScore;
    $('total-moves-display').textContent = Math.max(0, state.movesLeft);

    // Dynamic counter — how many swaps until the next question
    const swapsUntilQ = Math.max(0, state.questionsTarget - state.swapsSinceLastQuestion);
    $('moves-display').textContent = swapsUntilQ;

    const pct = Math.min(100, (state.score / state.levelConfig.targetScore) * 100);
    $('score-fill').style.width = pct + '%';

    $('shuffle-count').textContent = state.shufflesLeft + ' left';
    $('action-shuffle').disabled = state.shufflesLeft <= 0 || state.levelLocked;
  }

  function setStatus(msg, kind) {
    const el = $('status-msg');
    el.textContent = msg;
    el.className = 'status-msg' + (kind ? ' ' + kind : '');
  }

  /* ============================================================
     SCREEN NAV
     ============================================================ */
  function showScreen(id) {
    ['start-screen', 'play-screen', 'orbs-screen', 'victory-screen'].forEach(function (s) {
      const el = $(s);
      if (el) el.classList.add('hidden');
    });
    const target = $(id);
    if (target) target.classList.remove('hidden');

    ['nav-play-btn', 'nav-orbs-btn'].forEach(function (bid) {
      $(bid).classList.remove('active');
    });
    if (id === 'play-screen' || id === 'start-screen' || id === 'victory-screen') {
      $('nav-play-btn').classList.add('active');
    }
    if (id === 'orbs-screen') $('nav-orbs-btn').classList.add('active');
  }

  function showPlay() {
    Audio.sfxClick();
    if (state.isGrandmage) {
      showScreen('victory-screen');
      return;
    }
    if (!state.levelConfig) {
      startLevel(state.currentLevel);
      requestAnimationFrame(updateGridSize);
    } else {
      showScreen('play-screen');
      requestAnimationFrame(updateGridSize);
    }
  }

  function showOrbs() {
    Audio.sfxClick();
    renderOrbsScreen();
    showScreen('orbs-screen');
  }

  function renderOrbsScreen() {
    const grid = $('orbs-grid');
    grid.innerHTML = '';
    ORBS.forEach(function (r) {
      const card = document.createElement('div');
      card.className = 'orb-info-card';
      card.style.borderColor = r.color;
      card.style.background = 'linear-gradient(135deg, ' + hexToRgba(r.color, 0.2) + ', ' + hexToRgba(r.color, 0.05) + ')';
      card.innerHTML =
        '<div class="orb-info-icon" style="color:' + r.color + ';">' + r.svg + '</div>' +
        '<div class="orb-info-name">' + r.name + '</div>';
      grid.appendChild(card);
    });
  }

  function hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
  }

  /* ============================================================
     GRID SIZING — keeps the grid square
     ============================================================ */
  function updateGridSize() {
    const wrap = $('grid-wrap');
    const grid = $('grid');
    if (!wrap || !grid) return;

    const wrapStyles = getComputedStyle(wrap);
    const padX = parseFloat(wrapStyles.paddingLeft) + parseFloat(wrapStyles.paddingRight);
    const padY = parseFloat(wrapStyles.paddingTop) + parseFloat(wrapStyles.paddingBottom);
    const availW = wrap.clientWidth - padX;
    const availH = wrap.clientHeight - padY;

    const side = Math.max(180, Math.min(availW, availH));
    grid.style.setProperty('--grid-size', side + 'px');
  }

  /* ============================================================
     LEVEL SETUP
     ============================================================ */
  function startLevel(index) {
    if (index >= LEVELS.length) {
      state.isGrandmage = true;
      saveGame();
      showScreen('victory-screen');
      return;
    }

    state.currentLevel = index;
    state.levelConfig = LEVELS[index];
    state.score = 0;
    state.movesLeft = state.levelConfig.moves;
    state.shufflesLeft = 1;
    state.selectedTile = null;
    state.levelLocked = false;
    state.cascadeDepth = 0;
    state.swapsSinceLastQuestion = 0;
    state.questionsAnswered = 0;
    state.questionsCorrect = 0;
    state.questionPending = false;
    state.questionsTarget = SWAPS_PER_QUESTION;

    // NOTE: the question cycle (questionPass / usedQuestions) is
    // intentionally NOT reset here. Keeping it alive across levels
    // guarantees no question reappears until the whole list has
    // been shown once.

    $('level-tag').textContent = 'Sector ' + (index + 1) + ' of ' + LEVELS.length;
    $('level-name').textContent = state.levelConfig.name;

    let attempts = 0;
    do {
      state.grid = buildEmptyGrid();
      fillGridNoMatches();
      attempts++;
    } while (attempts < 5 && !gridHasAnyValidMove());

    renderGrid();
    updateScoreDisplay();
    setStatus('Swap adjacent orbs to match 3 or more!');
    showScreen('play-screen');
    requestAnimationFrame(updateGridSize);
  }

  function restartLevel() {
    Audio.sfxClick();
    startLevel(state.currentLevel);
  }

  /* ============================================================
     TILE CLICK — selection + swap
     ============================================================ */
  function onTileClick(e) {
    if (state.levelLocked) return;
    if (state.questionPending) return;

    const r = parseInt(e.currentTarget.dataset.r, 10);
    const c = parseInt(e.currentTarget.dataset.c, 10);

    if (!state.selectedTile) {
      state.selectedTile = { r: r, c: c };
      Audio.sfxSelect();
      renderGrid();
      setStatus('Now click an adjacent orb to swap.');
      return;
    }

    if (state.selectedTile.r === r && state.selectedTile.c === c) {
      state.selectedTile = null;
      renderGrid();
      setStatus('Selection cleared.');
      return;
    }

    if (isAdjacent(state.selectedTile, { r: r, c: c })) {
      const a = state.selectedTile;
      const b = { r: r, c: c };
      state.selectedTile = null;
      performSwap(a, b);
    } else {
      state.selectedTile = { r: r, c: c };
      Audio.sfxSelect();
      renderGrid();
      setStatus('Now click an adjacent orb to swap.');
    }
  }

  function swapTiles(a, b) {
    const tmp = state.grid[a.r][a.c];
    state.grid[a.r][a.c] = state.grid[b.r][b.c];
    state.grid[b.r][b.c] = tmp;
  }

  function performSwap(a, b) {
    state.levelLocked = true;
    Audio.sfxSwap();
    swapTiles(a, b);
    renderGrid();

    setTimeout(function () {
      const matches = findAllMatches();
      if (matches.length === 0) {
        Audio.sfxNoMatch();
        swapTiles(a, b);
        renderGrid();
        state.levelLocked = false;
        setStatus('No match! Try a different swap.', 'error');
        updateScoreDisplay();
        return;
      }

      // VALID swap — count toward question trigger
      state.swapsSinceLastQuestion++;
      state.movesLeft--;
      updateScoreDisplay();

      resolveMatchesAndCascade();
    }, 250);
  }

  /* ============================================================
     MATCH DETECTION
     ============================================================ */
  function findAllMatches() {
    const matched = new Set();

    for (let r = 0; r < GAME_CONFIG.GRID_ROWS; r++) {
      let runStart = 0;
      for (let c = 1; c <= GAME_CONFIG.GRID_COLS; c++) {
        const sameAsPrev = c < GAME_CONFIG.GRID_COLS
          && state.grid[r][c] === state.grid[r][c - 1]
          && state.grid[r][c] !== null;
        if (!sameAsPrev) {
          const runLen = c - runStart;
          if (runLen >= 3) {
            for (let k = runStart; k < c; k++) matched.add(r + ',' + k);
          }
          runStart = c;
        }
      }
    }

    for (let c = 0; c < GAME_CONFIG.GRID_COLS; c++) {
      let runStart = 0;
      for (let r = 1; r <= GAME_CONFIG.GRID_ROWS; r++) {
        const sameAsPrev = r < GAME_CONFIG.GRID_ROWS
          && state.grid[r][c] === state.grid[r - 1][c]
          && state.grid[r][c] !== null;
        if (!sameAsPrev) {
          const runLen = r - runStart;
          if (runLen >= 3) {
            for (let k = runStart; k < r; k++) matched.add(k + ',' + c);
          }
          runStart = r;
        }
      }
    }

    return Array.from(matched).map(function (key) {
      const parts = key.split(',');
      return { r: parseInt(parts[0], 10), c: parseInt(parts[1], 10) };
    });
  }

  /* ============================================================
     CASCADE + SCORE
     ============================================================ */
  function resolveMatchesAndCascade() {
    state.cascadeDepth = 0;
    cascadeStep();
  }

  function cascadeStep() {
    const matches = findAllMatches();

    if (matches.length === 0) {
      state.levelLocked = false;
      state.selectedTile = null;
      renderGrid();
      updateScoreDisplay();

      if (state.score >= state.levelConfig.targetScore) {
        onLevelWin();
        return;
      }

      if (state.movesLeft <= 0) {
        onLevelLose();
        return;
      }

      // Dynamic trigger — uses questionsTarget instead of constant
      if (state.swapsSinceLastQuestion >= state.questionsTarget) {
        state.questionPending = true;
        state.levelLocked = true;
        setStatus('Incoming cosmic scan...', 'success');
        setTimeout(function () { openQuestionModal(); }, 400);
        return;
      }

      setStatus('Swap adjacent orbs to match 3 or more!');
      return;
    }

    const size = matches.length;
    const baseScore = matchScore(size);
    const cascadeMultiplier = 1 + state.cascadeDepth * SCORING.cascadeBonus;
    const totalScore = Math.round(baseScore * cascadeMultiplier);
    state.score += totalScore;
    updateScoreDisplay();

    Audio.sfxMatch(size);
    if (state.cascadeDepth > 0) Audio.sfxCascade(state.cascadeDepth);

    if (state.cascadeDepth > 0) {
      showComboTag('COMBO ×' + (1 + state.cascadeDepth));
    }

    const sample = matches[0];
    spawnFloatingText(sample.r, sample.c, '+' + totalScore);

    matches.forEach(function (m) {
      const el = getTileEl(m.r, m.c);
      if (el) el.classList.add('matched');
    });

    setTimeout(function () {
      matches.forEach(function (m) { state.grid[m.r][m.c] = null; });
      applyGravityAndRefill();
      renderGrid();
      state.cascadeDepth++;
      setTimeout(cascadeStep, 350);
    }, 350);
  }

  function matchScore(size) {
    if (size >= 5) return SCORING.base5 + (size - 5) * 20;
    if (size === 4) return SCORING.base4;
    return SCORING.base3;
  }

  function applyGravityAndRefill() {
    for (let c = 0; c < GAME_CONFIG.GRID_COLS; c++) {
      const column = [];
      for (let r = GAME_CONFIG.GRID_ROWS - 1; r >= 0; r--) {
        if (state.grid[r][c] !== null) column.push(state.grid[r][c]);
      }
      while (column.length < GAME_CONFIG.GRID_ROWS) {
        column.push(randomOrb());
      }
      for (let r = GAME_CONFIG.GRID_ROWS - 1; r >= 0; r--) {
        state.grid[r][c] = column[GAME_CONFIG.GRID_ROWS - 1 - r];
      }
    }
  }

  /* ============================================================
     VISUAL EFFECTS
     ============================================================ */
  function spawnFloatingText(r, c, text) {
    const tileEl = getTileEl(r, c);
    if (!tileEl) return;
    const wrapRect = $('grid-wrap').getBoundingClientRect();
    const tileRect = tileEl.getBoundingClientRect();
    const layer = $('float-layer');
    const el = document.createElement('div');
    el.className = 'float-score';
    el.textContent = text;
    el.style.color = '#6ee7ff';
    el.style.left = (tileRect.left - wrapRect.left + tileRect.width / 2 - 20) + 'px';
    el.style.top = (tileRect.top - wrapRect.top) + 'px';
    layer.appendChild(el);
    setTimeout(function () { el.remove(); }, 1500);
  }

  function showComboTag(text) {
    const tag = $('combo-tag');
    tag.textContent = text;
    tag.classList.remove('hidden');
    tag.style.animation = 'none';
    void tag.offsetWidth;
    tag.style.animation = '';
    setTimeout(function () { tag.classList.add('hidden'); }, 1000);
  }

  /* ============================================================
     GRID STUCK CHECK
     ============================================================ */
  function gridHasAnyValidMove() {
    const original = state.grid.map(function (row) { return row.slice(); });
    for (let r = 0; r < GAME_CONFIG.GRID_ROWS; r++) {
      for (let c = 0; c < GAME_CONFIG.GRID_COLS; c++) {
        const moves = [[r + 1, c], [r, c + 1]];
        for (let i = 0; i < moves.length; i++) {
          const nr = moves[i][0], nc = moves[i][1];
          if (nr >= GAME_CONFIG.GRID_ROWS || nc >= GAME_CONFIG.GRID_COLS) continue;
          const t = state.grid[r][c];
          state.grid[r][c] = state.grid[nr][nc];
          state.grid[nr][nc] = t;
          const hasMatch = findAllMatches().length > 0;
          state.grid[nr][nc] = state.grid[r][c];
          state.grid[r][c] = t;
          if (hasMatch) {
            for (let rr = 0; rr < GAME_CONFIG.GRID_ROWS; rr++) {
              for (let cc = 0; cc < GAME_CONFIG.GRID_COLS; cc++) {
                state.grid[rr][cc] = original[rr][cc];
              }
            }
            return true;
          }
        }
      }
    }
    for (let rr = 0; rr < GAME_CONFIG.GRID_ROWS; rr++) {
      for (let cc = 0; cc < GAME_CONFIG.GRID_COLS; cc++) {
        state.grid[rr][cc] = original[rr][cc];
      }
    }
    return false;
  }

  /* ============================================================
     WARP (SHUFFLE)
     ============================================================ */
  function doShuffle() {
    if (state.shufflesLeft <= 0) return;
    if (state.levelLocked) return;
    if (state.questionPending) return;
    state.shufflesLeft--;
    Audio.sfxShuffle();

    state.grid = buildEmptyGrid();
    let attempts = 0;
    do {
      fillGridNoMatches();
      attempts++;
    } while (attempts < 5 && !gridHasAnyValidMove());

    state.selectedTile = null;
    renderGrid();
    updateScoreDisplay();
    setStatus('Space warped! Board reshuffled.', 'success');
  }

  /* ============================================================
     LEVEL WIN / LOSE
     ============================================================ */
  function onLevelWin() {
    Audio.sfxLevelWin();
    flashScreen('gold');
    const isFinal = state.currentLevel >= LEVELS.length - 1;

    if (isFinal) state.isGrandmage = true;
    state.currentLevel++;
    saveGame();

    const acc = state.questionsAnswered > 0
      ? Math.round((state.questionsCorrect / state.questionsAnswered) * 100)
      : 100;

    $('level-win-emoji').textContent = isFinal ? '👑' : '🛸';
    $('level-win-title').textContent = isFinal ? 'Galactic Legend!' : 'Sector Cleared!';
    $('level-win-info').innerHTML =
      '<div class="result-stat"><span class="result-stat-label">Sector</span><span class="result-stat-value">' + (state.currentLevel) + ' / ' + LEVELS.length + '</span></div>' +
      '<div class="result-stat"><span class="result-stat-label">Score</span><span class="result-stat-value">' + state.score + ' / ' + state.levelConfig.targetScore + '</span></div>' +
      '<div class="result-stat"><span class="result-stat-label">Moves Remaining</span><span class="result-stat-value">' + Math.max(0, state.movesLeft) + '</span></div>' +
      '<div class="result-stat"><span class="result-stat-label">Scan Accuracy</span><span class="result-stat-value">' + acc + '%</span></div>';
    $('level-win-continue-btn').textContent = isFinal ? '👑 CLAIM THE TITLE' : 'NEXT SECTOR →';
    state.levelConfig = null;
    $('level-win-modal').classList.remove('hidden');
  }

  function onLevelLose() {
    Audio.sfxLevelLose();
    flashScreen('red');
    $('level-lose-emoji').textContent = '💥';
    $('level-lose-title').textContent = 'Out of Moves';
    $('level-lose-info').innerHTML =
      '<div class="result-stat"><span class="result-stat-label">Sector</span><span class="result-stat-value">' + (state.currentLevel + 1) + ' / ' + LEVELS.length + '</span></div>' +
      '<div class="result-stat"><span class="result-stat-label">Score</span><span class="result-stat-value">' + state.score + ' / ' + state.levelConfig.targetScore + '</span></div>' +
      '<div class="result-stat"><span class="result-stat-label">Needed</span><span class="result-stat-value" style="color:#ff7b9c;">' + (state.levelConfig.targetScore - state.score) + ' more</span></div>';
    state.levelConfig = null;
    $('level-lose-modal').classList.remove('hidden');
  }

  /* ============================================================
     AUDIO UNLOCK
     ============================================================ */
  function unlockAudioOnce() {
    if (state.audioUnlocked) return;
    Audio.unlock();
    state.audioUnlocked = true;
    document.removeEventListener('click', unlockAudioOnce);
    document.removeEventListener('keydown', unlockAudioOnce);
    document.removeEventListener('touchstart', unlockAudioOnce);
  }

  /* ============================================================
     QUESTION FLOW — no repeats until every question has appeared
     ============================================================ */

  /* ------------------------------------------------------------
     selectNextQuestion
     ------------------------------------------------------------
     Questions are drawn in "cycles". A cycle only ends once
     EVERY question has been shown exactly once.

       Cycle 1  → authored order (QUESTIONS[0], [1], [2] …)
       Cycle 2+ → random order

     Inside a cycle a question can never appear twice. When the
     cycle is exhausted, the pool resets and a new cycle begins.
     ------------------------------------------------------------ */
  function selectNextQuestion() {
    if (QUESTIONS.length === 0) {
      state.currentQuestion = { q: '', a: [''] };
      return;
    }

    // Every question not yet shown in the current cycle.
    let remaining = QUESTIONS.filter(function (q) {
      return state.usedQuestions.indexOf(q) === -1;
    });

    // Whole list seen — start a brand-new cycle.
    if (remaining.length === 0) {
      state.usedQuestions = [];
      remaining = QUESTIONS.slice();
    }

    let question;
    if (state.questionPass === 1) {
      question = remaining[0];                              // ordered first pass
    } else {
      question = remaining[Math.floor(Math.random() * remaining.length)];
    }

    state.usedQuestions.push(question);
    state.currentQuestion = question;

    // Ordered pass finished → all later cycles are random.
    if (state.questionPass === 1 && state.usedQuestions.length >= QUESTIONS.length) {
      state.questionPass = 2;
    }
  }

  function openQuestionModal() {
    if (state.answering) return;
    if (!$('question-modal').classList.contains('hidden')) return;

    selectNextQuestion();

    state.currentQuestionTime = getQuestionTime(state.currentQuestion);
    state.answering = false;

    $('question-text').textContent = state.currentQuestion.q;
    const box = $('answers');
    box.innerHTML = '';
    const shuffled = state.currentQuestion.a.slice().sort(function () { return Math.random() - 0.5; });
    const correct = state.currentQuestion.a[0];
    shuffled.forEach(function (ans) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'answer-btn';
      btn.textContent = ans;
      btn.addEventListener('click', function () {
        Audio.sfxAnswer();
        handleAnswer(btn, ans === correct);
      });
      box.appendChild(btn);
    });

    $('question-modal').classList.remove('hidden');
    startTimer();
  }

  function hideQuestionModal() {
    $('question-modal').classList.add('hidden');
    stopTimer();
  }

  function getQuestionTime(question) {
    if (question.time && typeof question.time === 'number' && question.time > 0) return question.time;
    if (GAME_CONFIG.TIME_AUTO_SCALE) {
      const qLen = (question.q || '').length;
      const longestAnswer = Math.max.apply(null, question.a.map(function (a) { return a.length; }));
      const totalChars = qLen + longestAnswer;
      const scaled = GAME_CONFIG.TIME_PER_QUESTION + (totalChars * GAME_CONFIG.TIME_PER_CHAR);
      return Math.round(Math.max(GAME_CONFIG.TIME_MIN, Math.min(GAME_CONFIG.TIME_MAX, scaled)));
    }
    return GAME_CONFIG.TIME_PER_QUESTION;
  }

  function startTimer() {
    stopTimer();
    state.timeLeft = state.currentQuestionTime;
    const fill = $('modal-timer-fill');
    fill.classList.remove('warning');
    fill.style.width = '100%';
    const startTime = Date.now();

    state.timerInterval = setInterval(function () {
      const elapsed = (Date.now() - startTime) / 1000;
      state.timeLeft = Math.max(0, state.currentQuestionTime - elapsed);
      const pct = (state.timeLeft / state.currentQuestionTime) * 100;
      fill.style.width = pct + '%';
      const warningThreshold = Math.min(3, state.currentQuestionTime * 0.2);
      if (state.timeLeft <= warningThreshold) fill.classList.add('warning');
      if (state.timeLeft <= 0 && !state.answering) {
        stopTimer();
        timeUp();
      }
    }, 100);
  }

  function stopTimer() {
    if (state.timerInterval) clearInterval(state.timerInterval);
    state.timerInterval = null;
  }

  function timeUp() {
    if (state.answering) return;
    state.answering = true;
    Audio.sfxWrong();
    $('question-text').textContent = "⏰ Time's up!";
    document.querySelectorAll('.answer-btn').forEach(function (b) {
      b.disabled = true;
      if (b.textContent === state.currentQuestion.a[0]) b.classList.add('correct');
    });
    setTimeout(function () {
      hideQuestionModal();
      resolveAnswer(false);
    }, 1200);
  }

  function handleAnswer(btn, isCorrect) {
    if (state.answering) return;
    state.answering = true;
    stopTimer();

    document.querySelectorAll('.answer-btn').forEach(function (b) { b.disabled = true; });
    const correct = state.currentQuestion.a[0];
    document.querySelectorAll('.answer-btn').forEach(function (b) {
      if (b.textContent === correct) b.classList.add('correct');
      else if (b === btn && !isCorrect) b.classList.add('wrong');
    });

    if (isCorrect) Audio.sfxCorrect();
    else Audio.sfxWrong();

    setTimeout(function () {
      hideQuestionModal();
      resolveAnswer(isCorrect);
    }, 1100);
  }

  /* ------------------------------------------------------------
     resolveAnswer — penalty affects the QUESTION COUNTER
     ------------------------------------------------------------
     Correct → target resets to SWAPS_PER_QUESTION (2)
     Wrong   → target drops by 1 (floor = 1)
               so the next question comes one swap sooner
     ------------------------------------------------------------ */
  function resolveAnswer(isCorrect) {
    state.questionsAnswered++;
    if (isCorrect) {
      state.questionsCorrect++;
      state.questionsTarget = SWAPS_PER_QUESTION;
      Audio.sfxCorrect();
    } else {
      state.questionsTarget = Math.max(1, state.questionsTarget - 1);
      Audio.sfxWrong();
    }

    // Reset swap counter so the next round starts fresh
    state.swapsSinceLastQuestion = 0;
    state.questionPending = false;

    // Unlock the board
    state.levelLocked = false;
    state.selectedTile = null;
    state.answering = false;

    updateScoreDisplay();
    showResultModal(isCorrect);
  }

  function showResultModal(isCorrect) {
    const el = $('result-emoji');
    const title = $('result-title');
    const info = $('result-info');

    if (isCorrect) {
      el.textContent = '✨';
      title.textContent = 'Correct!';
      title.style.color = '#7dffc4';
      info.innerHTML =
        '<div class="result-stat"><span class="result-stat-label">Result</span><span class="result-stat-value">No penalty</span></div>' +
        '<div class="result-stat"><span class="result-stat-label">Next Scan In</span><span class="result-stat-value">' + state.questionsTarget + ' swap' + (state.questionsTarget === 1 ? '' : 's') + '</span></div>' +
        '<div class="result-stat"><span class="result-stat-label">Moves Remaining</span><span class="result-stat-value">' + state.movesLeft + '</span></div>';
    } else {
      const targetText = state.questionsTarget + ' swap' + (state.questionsTarget === 1 ? '' : 's');
      el.textContent = '💥';
      title.textContent = 'Wrong!';
      title.style.color = '#ff7b9c';
      info.innerHTML =
        '<div class="result-stat"><span class="result-stat-label">Penalty</span><span class="result-stat-value" style="color:#ff7b9c;">Next scan comes sooner</span></div>' +
        '<div class="result-stat"><span class="result-stat-label">Next Scan In</span><span class="result-stat-value" style="color:#ff7b9c;">' + targetText + '</span></div>' +
        '<div class="result-stat"><span class="result-stat-label">Moves Remaining</span><span class="result-stat-value">' + state.movesLeft + '</span></div>';
    }

    $('result-modal').classList.remove('hidden');
  }

  /* ============================================================
     FLASH
     ============================================================ */
  function flashScreen(kind) {
    const flash = $('end-flash');
    flash.className = 'end-flash ' + kind;
    void flash.offsetWidth;
  }

  /* ============================================================
     EVENT WIRING
     ============================================================ */
  function wireEvents() {
    $('music-btn').addEventListener('click', function () {
      const on = Audio.toggleMusic();
      $('music-btn').textContent = on ? '🎵' : '🔇';
    });

    $('start-btn').addEventListener('click', function () {
      Audio.sfxClick();
      $('intro-modal').classList.remove('hidden');
    });

    $('intro-begin-btn').addEventListener('click', function () {
      Audio.sfxClick();
      $('intro-modal').classList.add('hidden');
      startLevel(state.currentLevel);
    });

    $('nav-play-btn').addEventListener('click', showPlay);
    $('nav-orbs-btn').addEventListener('click', showOrbs);
    $('back-from-orbs-btn').addEventListener('click', showPlay);
    $('reset-btn').addEventListener('click', resetSave);
    $('reset-from-victory-btn').addEventListener('click', resetSave);

    $('action-shuffle').addEventListener('click', doShuffle);
    $('action-restart').addEventListener('click', restartLevel);

    $('result-continue-btn').addEventListener('click', function () {
      Audio.sfxClick();
      $('result-modal').classList.add('hidden');

      // Win/lose checks
      if (state.score >= state.levelConfig.targetScore) {
        onLevelWin();
        return;
      }
      if (state.movesLeft <= 0) {
        onLevelLose();
        return;
      }

      // Re-unlock the board
      state.levelLocked = false;
      state.selectedTile = null;
      renderGrid();
      updateScoreDisplay();

      const swapsLeft = Math.max(0, state.questionsTarget - state.swapsSinceLastQuestion);
      setStatus('Keep matching! Next scan in ' + swapsLeft + ' swap' + (swapsLeft === 1 ? '' : 's') + '.', 'success');
    });

    $('level-win-continue-btn').addEventListener('click', function () {
      Audio.sfxClick();
      $('level-win-modal').classList.add('hidden');
      if (state.isGrandmage) {
        showScreen('victory-screen');
      } else {
        startLevel(state.currentLevel);
      }
    });

    $('level-lose-continue-btn').addEventListener('click', function () {
      Audio.sfxClick();
      $('level-lose-modal').classList.add('hidden');
      startLevel(state.currentLevel);
    });

    $('play-again-btn').addEventListener('click', function () {
      Audio.sfxClick();
      state.currentLevel = 0;
      state.isGrandmage = false;
      state.levelConfig = null;
      state.questionPass = 1;
      state.usedQuestions = [];
      saveGame();
      startLevel(0);
    });

    document.addEventListener('click', unlockAudioOnce);
    document.addEventListener('keydown', unlockAudioOnce);
    document.addEventListener('touchstart', unlockAudioOnce);

    window.addEventListener('resize', updateGridSize);
    window.addEventListener('orientationchange', updateGridSize);
  }

  /* ============================================================
     BOOT
     ============================================================ */
  document.addEventListener('DOMContentLoaded', function () {
    loadSave();
    wireEvents();
    $('music-btn').textContent = '🎵';
    window.addEventListener('error', function (e) {
      console.warn('Game warning:', e.message);
    });
  });

})();