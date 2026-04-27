const app = document.getElementById("app");

const APP_CONFIG = {
  storageKey: "empathy_experiment_autosave_v10",
  dataFilePrefix: "empathy_experiment_data",
  negativePerParticipant: 8,
  neutralPerParticipant: 8,
  repeatedNearCount: 4,
  repeatedFarCount: 4,
  diverseThemeCount: 4,
  diverseNearPerTheme: 1,
  diverseFarPerTheme: 1,
  ratingScaleMin: 1,
  ratingScaleMax: 7,
  debugMode: false
};

const ORDER_TEMPLATES = [
  ["A", "B", "B", "A", "B", "A", "A", "B", "A", "B", "A", "A", "B", "B", "A", "B"],
  ["B", "A", "A", "B", "A", "B", "B", "A", "B", "A", "B", "B", "A", "A", "B", "A"],
  ["A", "B", "A", "A", "B", "B", "A", "B", "B", "A", "B", "A", "A", "B", "A", "B"],
  ["B", "A", "B", "B", "A", "A", "B", "A", "A", "B", "A", "B", "B", "A", "B", "A"]
];

const QUESTION_TEXT = {
  negative: {
    readingCheck: "阅读这个故事时，你觉得自己有多认真地阅读并理解了故事内容？",
    psychologicalDistance: "阅读这个故事时，你觉得故事主人公的处境离你有多近/远？",
    affectiveEmpathy: "阅读这个故事时，你为故事主人公感到难过/担忧的程度是？",
    cognitiveEmpathy: "阅读这个故事时，你理解故事主人公感受和想法的程度是？",
    helpWillingness: "阅读这个故事时，你想要帮助或支持故事主人公的意愿是？"
  },
  neutral: {
    readingCheck: "阅读这段内容时，你觉得自己有多认真地阅读并理解了内容？",
    selfRelevance: "阅读这段内容时，你觉得它与你自己的生活有多近/远？",
    interestLevel: "阅读这段内容时，你觉得它有多吸引你、让你感兴趣？",
    continueWillingness: "阅读这段内容时，你继续浏览这类内容的意愿有多强？"
  }
};

const experimentState = {
  participantId: "",
  condition: null,
  assignment: null,
  timeline: [],
  currentIndex: 0,
  data: null
};

function safeFileTime() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  return `${y}${m}${d}_${hh}${mm}${ss}`;
}

function shuffleArray(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function sampleArray(arr, n) {
  return shuffleArray(arr).slice(0, n);
}

function parseParticipantNumber(participantId) {
  const match = String(participantId || "").match(/(\d+)$/);
  if (!match) {
    throw new Error("被试编号末尾需要包含数字，例如 E001、E002。这样程序才能按编号进行平衡分组。");
  }

  const participantNumber = Number(match[1]);
  if (!Number.isInteger(participantNumber) || participantNumber < 1) {
    throw new Error("被试编号中的数字必须是大于 0 的整数，例如 E001、E002。");
  }

  return participantNumber;
}

function buildBalancedAssignment(participantId) {
  const participantNumber = parseParticipantNumber(participantId);
  const allThemes = getThemeKeys();

  if (allThemes.length === 0) {
    throw new Error("未找到任何负性材料主题，请检查 materials 文件。");
  }

  const blockSize = allThemes.length * 2;
  const zeroBasedIndex = participantNumber - 1;
  const assignmentBlock = Math.floor(zeroBasedIndex / blockSize) + 1;
  const blockPosition = zeroBasedIndex % blockSize;

  // 每个主题占两个连续位置：第一个位置进入 repeated，第二个位置进入 diverse。
  // 以 4 个主题为例，每 8 名被试构成一个完整平衡区组：
  // 1 repeated-主题1；2 diverse；3 repeated-主题2；4 diverse；
  // 5 repeated-主题3；6 diverse；7 repeated-主题4；8 diverse。
  const themeIndex = Math.floor(blockPosition / 2) % allThemes.length;
  const condition = blockPosition % 2 === 0 ? "repeated" : "diverse";

  return {
    mode: "balanced_by_participant_id",
    participantNumber,
    assignmentBlock,
    blockPosition: blockPosition + 1,
    blockSize,
    condition,
    repeatedTheme: condition === "repeated" ? allThemes[themeIndex] : "",
    diversePairStartIndex: condition === "diverse" ? themeIndex : "",
    orderTemplateIndex: zeroBasedIndex % ORDER_TEMPLATES.length
  };
}

function getThemeKeys() {
  return Object.keys(negativeMaterials);
}

function getTrialUsername(trial) {
  return trial.username || trial.userName || "匿名用户";
}

function getTrialUsernameForData(trial) {
  return trial.username || trial.userName || "";
}

function getMaterialPairId(item, themeKey, pairIndex) {
  if (item.pairId) return item.pairId;

  const id = String(item.id || "");
  if (id.includes("_near_")) return id.replace("_near_", "_pair_");
  if (id.includes("_far_")) return id.replace("_far_", "_pair_");

  return `${themeKey}_pair_${pairIndex + 1}`;
}

function buildPairedNegativeItems(themeKey, themePool, pairCount, fixedPairIndexes = null) {
  if (!themePool || !Array.isArray(themePool.near) || !Array.isArray(themePool.far)) {
    throw new Error(`主题 ${themeKey} 的近/远距离材料结构不完整。`);
  }

  if (themePool.near.length !== themePool.far.length) {
    throw new Error(`主题 ${themeKey} 的近距离材料数量与远距离材料数量不一致，无法进行成对抽取。`);
  }

  if (pairCount > themePool.near.length) {
    throw new Error(`主题 ${themeKey} 的可用故事对不足：需要 ${pairCount} 对，实际只有 ${themePool.near.length} 对。`);
  }

  const selectedPairIndexes = Array.isArray(fixedPairIndexes)
    ? fixedPairIndexes.slice(0, pairCount)
    : sampleArray(
      Array.from({ length: themePool.near.length }, (_, index) => index),
      pairCount
    );

  if (selectedPairIndexes.length !== pairCount) {
    throw new Error(`主题 ${themeKey} 的固定故事对索引数量不足：需要 ${pairCount} 对，实际提供 ${selectedPairIndexes.length} 对。`);
  }

  selectedPairIndexes.forEach((pairIndex) => {
    if (pairIndex < 0 || pairIndex >= themePool.near.length) {
      throw new Error(`主题 ${themeKey} 的故事对索引超出范围：${pairIndex}。`);
    }
  });

  const pairedItems = [];

  selectedPairIndexes.forEach((pairIndex) => {
    const nearItem = themePool.near[pairIndex];
    const farItem = themePool.far[pairIndex];
    const pairId = getMaterialPairId(nearItem, themeKey, pairIndex);

    pairedItems.push({
      ...nearItem,
      type: "negative",
      distance: "near",
      theme: themeKey,
      pairId
    });

    pairedItems.push({
      ...farItem,
      type: "negative",
      distance: "far",
      theme: themeKey,
      pairId
    });
  });

  return pairedItems;
}

function buildRepeatedNegativeTrials() {
  if (APP_CONFIG.repeatedNearCount !== APP_CONFIG.repeatedFarCount) {
    throw new Error("重复暴露组要求近距离与远距离材料数量相等，以保证成对抽取。");
  }

  const allThemes = getThemeKeys();
  const assignedTheme = experimentState.assignment?.repeatedTheme;
  const selectedTheme = assignedTheme || sampleArray(allThemes, 1)[0];
  const themePool = negativeMaterials[selectedTheme];

  const pairedItems = buildPairedNegativeItems(
    selectedTheme,
    themePool,
    APP_CONFIG.repeatedNearCount
  );

  return shuffleArray(pairedItems).map((item, index) => ({
    ...item,
    trialNumber: index + 1
  }));
}

function buildDiverseNegativeTrials() {
  if (APP_CONFIG.diverseNearPerTheme !== APP_CONFIG.diverseFarPerTheme) {
    throw new Error("多样暴露组要求每个主题下近距离与远距离材料数量相等，以保证成对抽取。");
  }

  const allThemes = getThemeKeys();
  const selectedThemes = APP_CONFIG.diverseThemeCount === allThemes.length
    ? allThemes
    : sampleArray(allThemes, APP_CONFIG.diverseThemeCount);

  const pool = [];
  const assignedPairStartIndex = experimentState.assignment?.diversePairStartIndex;

  selectedThemes.forEach((themeKey, themePosition) => {
    const themePool = negativeMaterials[themeKey];

    let fixedPairIndexes = null;
    if (assignedPairStartIndex !== "" && assignedPairStartIndex !== undefined && assignedPairStartIndex !== null) {
      fixedPairIndexes = Array.from(
        { length: APP_CONFIG.diverseNearPerTheme },
        (_, offset) => (Number(assignedPairStartIndex) + themePosition + offset) % themePool.near.length
      );
    }

    const pairedItems = buildPairedNegativeItems(
      themeKey,
      themePool,
      APP_CONFIG.diverseNearPerTheme,
      fixedPairIndexes
    );

    pool.push(...pairedItems);
  });

  return shuffleArray(pool).map((item, index) => ({
    ...item,
    trialNumber: index + 1
  }));
}

function pickOrderTemplate() {
  const totalNeeded = APP_CONFIG.negativePerParticipant + APP_CONFIG.neutralPerParticipant;
  const validTemplates = ORDER_TEMPLATES.filter((tpl) => tpl.length === totalNeeded);

  if (validTemplates.length === 0) {
    throw new Error("没有可用的顺序模板，请检查 ORDER_TEMPLATES 的长度设置。");
  }

  const assignedOrderTemplateIndex = experimentState.assignment?.orderTemplateIndex;
  if (assignedOrderTemplateIndex !== undefined && assignedOrderTemplateIndex !== null && assignedOrderTemplateIndex !== "") {
    return validTemplates[Number(assignedOrderTemplateIndex) % validTemplates.length];
  }

  return sampleArray(validTemplates, 1)[0];
}

function buildTimelineFromTemplate(template, negativeTrials, neutralTrials) {
  const negativePool = shuffleArray(negativeTrials);
  const neutralPool = shuffleArray(neutralTrials);

  let negativeIndex = 0;
  let neutralIndex = 0;

  return template.map((slot, index) => {
    const trial = slot === "B"
      ? negativePool[negativeIndex++]
      : neutralPool[neutralIndex++];

    if (!trial) {
      throw new Error("顺序模板与材料数量不匹配。");
    }

    return {
      ...trial,
      timelineIndex: index + 1,
      orderSlot: slot,
      orderTemplate: template.join("")
    };
  });
}

function buildNegativeTrials() {
  return experimentState.condition === "repeated"
    ? buildRepeatedNegativeTrials()
    : buildDiverseNegativeTrials();
}

function buildTimeline() {
  const negativeTrials = buildNegativeTrials();

  if (negativeTrials.length !== APP_CONFIG.negativePerParticipant) {
    throw new Error(`负性材料数量不符合设置：需要 ${APP_CONFIG.negativePerParticipant} 条，实际生成 ${negativeTrials.length} 条。`);
  }

  const neutralTrials = sampleArray(
    neutralMaterials,
    APP_CONFIG.neutralPerParticipant
  ).map((item, index) => ({
    ...item,
    type: "neutral",
    trialNumber: index + 1,
    pairId: ""
  }));

  if (neutralTrials.length !== APP_CONFIG.neutralPerParticipant) {
    throw new Error(`中性材料数量不符合设置：需要 ${APP_CONFIG.neutralPerParticipant} 条，实际生成 ${neutralTrials.length} 条。`);
  }

  const template = pickOrderTemplate();

  experimentState.timeline = buildTimelineFromTemplate(
    template,
    negativeTrials,
    neutralTrials
  );

  experimentState.currentIndex = 0;

  if (APP_CONFIG.debugMode) {
    console.log("condition:", experimentState.condition);
    console.log("orderTemplate:", template.join(""));
    console.log("timeline:", experimentState.timeline);
  }
}

function initializeExperimentRecord(participantId, condition, timeline) {
  const data = {
    participantId,
    condition,
    assignmentMode: experimentState.assignment?.mode || "random",
    participantNumber: experimentState.assignment?.participantNumber || "",
    assignmentBlock: experimentState.assignment?.assignmentBlock || "",
    blockPosition: experimentState.assignment?.blockPosition || "",
    repeatedTheme: experimentState.assignment?.repeatedTheme || "",
    diversePairStartIndex: experimentState.assignment?.diversePairStartIndex ?? "",
    orderTemplateIndex: experimentState.assignment?.orderTemplateIndex ?? "",
    orderTemplate: timeline[0]?.orderTemplate || null,
    startTime: new Date().toISOString(),
    endTime: null,
    completed: false,
    trials: [],
    timelineMeta: [],
    completedTrials: 0
  };

  data.timelineMeta = timeline.map((trial, idx) => ({
    timelineIndex: idx + 1,
    type: trial.type,
    distance: trial.distance || "",
    theme: trial.theme || "",
    materialId: trial.id || "",
    pairId: trial.pairId || "",
    orderSlot: trial.orderSlot || "",
    orderTemplate: trial.orderTemplate || "",
    username: getTrialUsernameForData(trial)
  }));

  return data;
}

function persistState() {
  const payload = {
    participantId: experimentState.participantId,
    condition: experimentState.condition,
    assignment: experimentState.assignment,
    timeline: experimentState.timeline,
    currentIndex: experimentState.currentIndex,
    data: experimentState.data
  };
  localStorage.setItem(APP_CONFIG.storageKey, JSON.stringify(payload));
}

function clearPersistedState() {
  localStorage.removeItem(APP_CONFIG.storageKey);
}

function loadPersistedState() {
  const raw = localStorage.getItem(APP_CONFIG.storageKey);
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch (e) {
    console.error("无法读取自动保存数据：", e);
    return null;
  }
}

function getScaleOptions(scaleType) {
  const scaleMap = {
    readingCheck7: [
      "1 完全没有认真阅读 / 完全没理解",
      "2 比较没有认真阅读 / 比较没理解",
      "3 有一点没有认真阅读 / 理解较少",
      "4 一般",
      "5 比较认真阅读 / 比较理解",
      "6 很认真阅读 / 很理解",
      "7 非常认真阅读且完全理解"
    ],
    psychologicalDistance7: [
      "1 非常遥远",
      "2 比较遥远",
      "3 有一点遥远",
      "4 一般",
      "5 比较接近",
      "6 很接近",
      "7 非常接近"
    ],
    affectiveEmpathy7: [
      "1 完全没有",
      "2 比较没有",
      "3 有一点",
      "4 中等程度",
      "5 比较强",
      "6 很强",
      "7 非常强烈"
    ],
    cognitiveEmpathy7: [
      "1 完全不能理解",
      "2 比较不能理解",
      "3 有一点不能理解",
      "4 一般",
      "5 比较理解",
      "6 很理解",
      "7 非常理解"
    ],
    helpWillingness7: [
      "1 完全不愿意",
      "2 比较不愿意",
      "3 有一点不愿意",
      "4 一般",
      "5 比较愿意",
      "6 很愿意",
      "7 非常愿意"
    ],
    selfRelevance7: [
      "1 非常遥远",
      "2 比较遥远",
      "3 有一点遥远",
      "4 一般",
      "5 比较接近",
      "6 很接近",
      "7 非常接近"
    ],
    interestLevel7: [
      "1 完全不感兴趣",
      "2 比较不感兴趣",
      "3 有一点不感兴趣",
      "4 一般",
      "5 比较感兴趣",
      "6 很感兴趣",
      "7 非常感兴趣"
    ],
    continueWillingness7: [
      "1 完全不愿意",
      "2 比较不愿意",
      "3 有一点不愿意",
      "4 一般",
      "5 比较愿意",
      "6 很愿意",
      "7 非常愿意"
    ]
  };

  return scaleMap[scaleType] || [];
}

function formatScale(name, scaleType, required = true) {
  const options = getScaleOptions(scaleType);

  return `
    <div class="scale-vertical">
      ${options.map((text, index) => `
        <label class="scale-option-card">
          <input type="radio" name="${name}" value="${index + 1}" ${required ? "required" : ""}>
          <span class="scale-option-text">${text}</span>
        </label>
      `).join("")}
    </div>
  `;
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text ?? "";
  return div.innerHTML;
}

function renderPostCard(trial) {
  const username = getTrialUsername(trial);

  return `
    <div class="post-card">
      <div class="post-header">
        <div class="avatar" aria-hidden="true">
          <svg viewBox="0 0 24 24" class="avatar-icon" fill="none">
            <circle cx="12" cy="8" r="4" fill="currentColor"></circle>
            <path d="M4 20c0-3.6 3.6-6 8-6s8 2.4 8 6" fill="currentColor"></path>
          </svg>
        </div>
        <div class="user-info">
          <div class="username">${escapeHtml(username)}</div>
        </div>
      </div>

      <div class="post-text">${escapeHtml(trial.text || "")}</div>

      <div class="post-actions" aria-hidden="true">
        <div class="post-action-item">
          <span class="post-action-icon">♡</span>
          <span class="post-action-label">点赞</span>
        </div>
        <div class="post-action-item">
          <span class="post-action-icon">💬</span>
          <span class="post-action-label">评论</span>
        </div>
        <div class="post-action-item">
          <span class="post-action-icon">☆</span>
          <span class="post-action-label">收藏</span>
        </div>
      </div>
    </div>
  `;
}

function renderNegativeQuestions() {
  return `
    <div class="question-block">
      <p>${QUESTION_TEXT.negative.readingCheck}</p>
      ${formatScale("readingCheck", "readingCheck7")}
    </div>

    <div class="question-block">
      <p>${QUESTION_TEXT.negative.psychologicalDistance}</p>
      ${formatScale("psychologicalDistance", "psychologicalDistance7")}
    </div>

    <div class="question-block">
      <p>${QUESTION_TEXT.negative.affectiveEmpathy}</p>
      ${formatScale("affectiveEmpathy", "affectiveEmpathy7")}
    </div>

    <div class="question-block">
      <p>${QUESTION_TEXT.negative.cognitiveEmpathy}</p>
      ${formatScale("cognitiveEmpathy", "cognitiveEmpathy7")}
    </div>

    <div class="question-block">
      <p>${QUESTION_TEXT.negative.helpWillingness}</p>
      ${formatScale("helpWillingness", "helpWillingness7")}
    </div>
  `;
}

function renderNeutralQuestions() {
  return `
    <div class="question-block">
      <p>${QUESTION_TEXT.neutral.readingCheck}</p>
      ${formatScale("readingCheck", "readingCheck7")}
    </div>

    <div class="question-block">
      <p>${QUESTION_TEXT.neutral.selfRelevance}</p>
      ${formatScale("selfRelevance", "selfRelevance7")}
    </div>

    <div class="question-block">
      <p>${QUESTION_TEXT.neutral.interestLevel}</p>
      ${formatScale("interestLevel", "interestLevel7")}
    </div>

    <div class="question-block">
      <p>${QUESTION_TEXT.neutral.continueWillingness}</p>
      ${formatScale("continueWillingness", "continueWillingness7")}
    </div>
  `;
}

function scrollToTopAfterRender() {
  window.scrollTo({ top: 0, behavior: "auto" });
  const appElement = document.getElementById("app");
  if (appElement) {
    appElement.scrollTop = 0;
  }
}

function renderWelcome() {
  app.innerHTML = `
    <div class="topbar">实验开始</div>
    <div class="screen">
      <h2>欢迎参加本实验</h2>
      <div class="note-box">
        请根据实验员提供的编号填写被试编号。<br>
        该编号将用于后续数据整理与匹配。
      </div>

      <label for="participantIdInput">被试编号</label>
      <input id="participantIdInput" type="text" value="" placeholder="例如：E001" />

      <button id="startExperimentBtn">开始实验</button>
    </div>
  `;

  scrollToTopAfterRender();

  document.getElementById("startExperimentBtn").addEventListener("click", () => {
    const input = document.getElementById("participantIdInput");
    const participantId = input.value.trim();

    if (!participantId) {
      alert("请先填写实验员提供的被试编号。");
      return;
    }

    let assignment;
    try {
      assignment = buildBalancedAssignment(participantId);
    } catch (error) {
      alert(error.message);
      return;
    }

    experimentState.participantId = participantId;
    experimentState.assignment = assignment;
    experimentState.condition = assignment.condition;
    buildTimeline();
    experimentState.data = initializeExperimentRecord(
      participantId,
      experimentState.condition,
      experimentState.timeline
    );
    persistState();
    renderTrial();
  });
}

function renderResumePrompt(savedState) {
  app.innerHTML = `
    <div class="topbar">发现未完成实验</div>
    <div class="screen">
      <h2>检测到未完成记录</h2>
      <div class="note-box">
        被试编号：${savedState.participantId || "未记录"}<br>
        已完成试次：${savedState.data?.completedTrials || 0} / ${(savedState.timeline || []).length || 0}
      </div>
      <p class="resume-hint">请选择继续上次实验，或清除旧记录后重新开始。</p>
      <button id="resumeBtn">继续实验</button>
      <button id="restartBtn" class="secondary-btn">重新开始</button>
    </div>
  `;

  scrollToTopAfterRender();

  document.getElementById("resumeBtn").addEventListener("click", () => {
    experimentState.participantId = savedState.participantId;
    experimentState.condition = savedState.condition;
    experimentState.assignment = savedState.assignment || null;
    experimentState.timeline = savedState.timeline;
    experimentState.currentIndex = savedState.currentIndex;
    experimentState.data = savedState.data;
    renderTrial();
  });

  document.getElementById("restartBtn").addEventListener("click", () => {
    clearPersistedState();
    renderWelcome();
  });
}

function renderTrial() {
  const trial = experimentState.timeline[experimentState.currentIndex];
  const total = experimentState.timeline.length;
  const current = experimentState.currentIndex + 1;

  const questionHtml = trial.type === "negative"
    ? renderNegativeQuestions()
    : renderNeutralQuestions();

  app.innerHTML = `
    <div class="topbar">实验进行中</div>
    <div class="screen">
      <div class="progress-box">第 ${current} / ${total} 条</div>
      <div class="feed-meta">请像浏览信息流一样阅读下面的内容，并完成后续作答</div>

      ${renderPostCard(trial)}

      <form id="trialForm" class="question-panel">
        ${questionHtml}
        <button type="submit">${current === total ? "完成" : "下一条"}</button>
      </form>
    </div>
  `;

  scrollToTopAfterRender();

  const form = document.getElementById("trialForm");
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    saveTrialResponse(form, trial);

    if (experimentState.currentIndex < total - 1) {
      experimentState.currentIndex += 1;
      experimentState.data.completedTrials = experimentState.currentIndex;
      persistState();
      renderTrial();
    } else {
      experimentState.data.completedTrials = total;
      experimentState.data.completed = true;
      experimentState.data.endTime = new Date().toISOString();
      persistState();
      exportAllCSV();
      renderFinish();
    }
  });
}

function getFormValue(form, name) {
  const selected = form.querySelector(`input[name="${name}"]:checked`);
  return selected ? Number(selected.value) : "";
}

function saveTrialResponse(form, trial) {
  const baseRecord = {
    timelineIndex: trial.timelineIndex,
    trialNumber: trial.trialNumber,
    type: trial.type,
    distance: trial.distance || "",
    theme: trial.theme || "",
    materialId: trial.id || "",
    pairId: trial.pairId || "",
    orderSlot: trial.orderSlot || "",
    orderTemplate: trial.orderTemplate || "",
    username: getTrialUsernameForData(trial),
    text: trial.text,
    readingCheck: getFormValue(form, "readingCheck"),
    psychologicalDistance: trial.type === "negative" ? getFormValue(form, "psychologicalDistance") : "",
    affectiveEmpathy: trial.type === "negative" ? getFormValue(form, "affectiveEmpathy") : "",
    cognitiveEmpathy: trial.type === "negative" ? getFormValue(form, "cognitiveEmpathy") : "",
    helpWillingness: trial.type === "negative" ? getFormValue(form, "helpWillingness") : "",
    selfRelevance: trial.type === "neutral" ? getFormValue(form, "selfRelevance") : "",
    interestLevel: trial.type === "neutral" ? getFormValue(form, "interestLevel") : "",
    continueWillingness: trial.type === "neutral" ? getFormValue(form, "continueWillingness") : "",
    timestamp: new Date().toISOString()
  };

  const existingIndex = experimentState.data.trials.findIndex(
    (record) => Number(record.timelineIndex) === Number(trial.timelineIndex)
  );

  if (existingIndex >= 0) {
    experimentState.data.trials[existingIndex] = baseRecord;
  } else {
    experimentState.data.trials.push(baseRecord);
  }

  persistState();
}

function sanitizeCSVValue(value) {
  const str = String(value ?? "");
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function buildParticipantBaseRow(data) {
  const mergedTrials = getAllMergedTrialRecords(data);
  return {
    participantId: data.participantId || "",
    condition: data.condition || "",
    assignmentMode: data.assignmentMode || "",
    participantNumber: data.participantNumber || "",
    assignmentBlock: data.assignmentBlock || "",
    blockPosition: data.blockPosition || "",
    repeatedTheme: data.repeatedTheme || "",
    diversePairStartIndex: data.diversePairStartIndex ?? "",
    orderTemplateIndex: data.orderTemplateIndex ?? "",
    orderTemplate: data.orderTemplate || "",
    startTime: data.startTime || "",
    endTime: data.endTime || "",
    completed: data.completed ? 1 : 0,
    completedTrials: data.completedTrials ?? "",
    timelineTypeSequence: mergedTrials.map((trial) => trial.type || "").join("|"),
    timelineMaterialSequence: mergedTrials.map((trial) => trial.materialId || "").join("|"),
    negativeMaterialSequence: mergedTrials.filter((trial) => trial.type === "negative").map((trial) => trial.materialId || "").join("|"),
    neutralMaterialSequence: mergedTrials.filter((trial) => trial.type === "neutral").map((trial) => trial.materialId || "").join("|")
  };
}

function getTrialByTimelineIndex(data, timelineIndex) {
  return (data.trials || []).find((trial) => Number(trial.timelineIndex) === Number(timelineIndex)) || null;
}

function getTrialMetaByTimelineIndex(data, timelineIndex) {
  return (data.timelineMeta || []).find((trial) => Number(trial.timelineIndex) === Number(timelineIndex)) || null;
}

function getMergedTrialRecord(data, timelineIndex) {
  const response = getTrialByTimelineIndex(data, timelineIndex);
  const meta = getTrialMetaByTimelineIndex(data, timelineIndex);
  return {
    timelineIndex,
    trialNumber: response?.trialNumber ?? "",
    type: response?.type ?? meta?.type ?? "",
    distance: response?.distance ?? meta?.distance ?? "",
    theme: response?.theme ?? meta?.theme ?? "",
    materialId: response?.materialId ?? meta?.materialId ?? "",
    pairId: response?.pairId ?? meta?.pairId ?? "",
    orderSlot: response?.orderSlot ?? meta?.orderSlot ?? "",
    orderTemplate: response?.orderTemplate ?? meta?.orderTemplate ?? data.orderTemplate ?? "",
    username: response?.username ?? meta?.username ?? "",
    text: response?.text ?? "",
    readingCheck: response?.readingCheck ?? "",
    psychologicalDistance: response?.psychologicalDistance ?? "",
    affectiveEmpathy: response?.affectiveEmpathy ?? "",
    cognitiveEmpathy: response?.cognitiveEmpathy ?? "",
    helpWillingness: response?.helpWillingness ?? "",
    selfRelevance: response?.selfRelevance ?? "",
    interestLevel: response?.interestLevel ?? "",
    continueWillingness: response?.continueWillingness ?? "",
    timestamp: response?.timestamp ?? ""
  };
}

function getAllMergedTrialRecords(data) {
  const totalTrials = APP_CONFIG.negativePerParticipant + APP_CONFIG.neutralPerParticipant;
  const trials = [];
  for (let i = 1; i <= totalTrials; i++) {
    trials.push(getMergedTrialRecord(data, i));
  }
  return trials;
}

function getTypeSeparatedWideHeaders() {
  const baseHeaders = [
    "participantId",
    "condition",
    "assignmentMode",
    "participantNumber",
    "assignmentBlock",
    "blockPosition",
    "repeatedTheme",
    "diversePairStartIndex",
    "orderTemplateIndex",
    "orderTemplate",
    "startTime",
    "endTime",
    "completed",
    "completedTrials",
    "timelineTypeSequence",
    "timelineMaterialSequence",
    "negativeMaterialSequence",
    "neutralMaterialSequence"
  ];

  const negativeFields = [
    "withinTypeOrder",
    "timelineIndex",
    "trialNumber",
    "distanceCondition",
    "theme",
    "materialId",
    "pairId",
    "username",
    "readingCheck",
    "psychologicalDistance",
    "affectiveEmpathy",
    "cognitiveEmpathy",
    "helpWillingness",
    "timestamp"
  ];

  const neutralFields = [
    "withinTypeOrder",
    "timelineIndex",
    "trialNumber",
    "materialId",
    "username",
    "readingCheck",
    "selfRelevance",
    "interestLevel",
    "continueWillingness",
    "timestamp"
  ];

  const negativeHeaders = [];
  for (let i = 1; i <= APP_CONFIG.negativePerParticipant; i++) {
    negativeFields.forEach((field) => negativeHeaders.push(`neg${i}_${field}`));
  }

  const neutralHeaders = [];
  for (let i = 1; i <= APP_CONFIG.neutralPerParticipant; i++) {
    neutralFields.forEach((field) => neutralHeaders.push(`neu${i}_${field}`));
  }

  return [...baseHeaders, ...negativeHeaders, ...neutralHeaders];
}

function buildTypeSeparatedWideCSVRow(data) {
  const row = buildParticipantBaseRow(data);
  const mergedTrials = getAllMergedTrialRecords(data);
  const negativeTrials = mergedTrials.filter((trial) => trial.type === "negative");
  const neutralTrials = mergedTrials.filter((trial) => trial.type === "neutral");

  for (let i = 1; i <= APP_CONFIG.negativePerParticipant; i++) {
    const trial = negativeTrials[i - 1] || {};
    row[`neg${i}_withinTypeOrder`] = trial.type ? i : "";
    row[`neg${i}_timelineIndex`] = trial.timelineIndex ?? "";
    row[`neg${i}_trialNumber`] = trial.trialNumber ?? "";
    row[`neg${i}_distanceCondition`] = trial.distance || "";
    row[`neg${i}_theme`] = trial.theme || "";
    row[`neg${i}_materialId`] = trial.materialId || "";
    row[`neg${i}_pairId`] = trial.pairId || "";
    row[`neg${i}_username`] = trial.username || "";
    row[`neg${i}_readingCheck`] = trial.readingCheck ?? "";
    row[`neg${i}_psychologicalDistance`] = trial.psychologicalDistance ?? "";
    row[`neg${i}_affectiveEmpathy`] = trial.affectiveEmpathy ?? "";
    row[`neg${i}_cognitiveEmpathy`] = trial.cognitiveEmpathy ?? "";
    row[`neg${i}_helpWillingness`] = trial.helpWillingness ?? "";
    row[`neg${i}_timestamp`] = trial.timestamp || "";
  }

  for (let i = 1; i <= APP_CONFIG.neutralPerParticipant; i++) {
    const trial = neutralTrials[i - 1] || {};
    row[`neu${i}_withinTypeOrder`] = trial.type ? i : "";
    row[`neu${i}_timelineIndex`] = trial.timelineIndex ?? "";
    row[`neu${i}_trialNumber`] = trial.trialNumber ?? "";
    row[`neu${i}_materialId`] = trial.materialId || "";
    row[`neu${i}_username`] = trial.username || "";
    row[`neu${i}_readingCheck`] = trial.readingCheck ?? "";
    row[`neu${i}_selfRelevance`] = trial.selfRelevance ?? "";
    row[`neu${i}_interestLevel`] = trial.interestLevel ?? "";
    row[`neu${i}_continueWillingness`] = trial.continueWillingness ?? "";
    row[`neu${i}_timestamp`] = trial.timestamp || "";
  }

  return row;
}

function convertTypeSeparatedWideToCSV(data) {
  const row = buildTypeSeparatedWideCSVRow(data);
  const headers = getTypeSeparatedWideHeaders();
  const values = headers.map((key) => sanitizeCSVValue(row[key] ?? ""));
  return "\uFEFF" + headers.join(",") + "\n" + values.join(",");
}

function getLongHeaders() {
  return [
    "participantId",
    "condition",
    "assignmentMode",
    "participantNumber",
    "assignmentBlock",
    "blockPosition",
    "repeatedTheme",
    "diversePairStartIndex",
    "orderTemplateIndex",
    "orderTemplate",
    "startTime",
    "endTime",
    "completed",
    "completedTrials",
    "timelineTypeSequence",
    "timelineMaterialSequence",
    "negativeMaterialSequence",
    "neutralMaterialSequence",
    "timelineIndex",
    "withinTypeOrder",
    "trialNumber",
    "type",
    "distanceCondition",
    "theme",
    "materialId",
    "pairId",
    "orderSlot",
    "username",
    "text",
    "readingCheck",
    "psychologicalDistance",
    "affectiveEmpathy",
    "cognitiveEmpathy",
    "helpWillingness",
    "selfRelevance",
    "interestLevel",
    "continueWillingness",
    "timestamp"
  ];
}

function buildLongCSVRows(data) {
  const base = buildParticipantBaseRow(data);
  const mergedTrials = getAllMergedTrialRecords(data);
  let negativeOrder = 0;
  let neutralOrder = 0;

  return mergedTrials.map((trial) => {
    let withinTypeOrder = "";
    if (trial.type === "negative") {
      negativeOrder += 1;
      withinTypeOrder = negativeOrder;
    } else if (trial.type === "neutral") {
      neutralOrder += 1;
      withinTypeOrder = neutralOrder;
    }

    return {
      ...base,
      timelineIndex: trial.timelineIndex,
      withinTypeOrder,
      trialNumber: trial.trialNumber,
      type: trial.type || "",
      distanceCondition: trial.distance || "",
      theme: trial.theme || "",
      materialId: trial.materialId || "",
      pairId: trial.pairId || "",
      orderSlot: trial.orderSlot || "",
      username: trial.username || "",
      text: trial.text || "",
      readingCheck: trial.readingCheck ?? "",
      psychologicalDistance: trial.psychologicalDistance ?? "",
      affectiveEmpathy: trial.affectiveEmpathy ?? "",
      cognitiveEmpathy: trial.cognitiveEmpathy ?? "",
      helpWillingness: trial.helpWillingness ?? "",
      selfRelevance: trial.selfRelevance ?? "",
      interestLevel: trial.interestLevel ?? "",
      continueWillingness: trial.continueWillingness ?? "",
      timestamp: trial.timestamp || ""
    };
  });
}

function convertLongToCSV(data) {
  const headers = getLongHeaders();
  const rows = buildLongCSVRows(data);
  const lines = rows.map((row) => headers.map((key) => sanitizeCSVValue(row[key] ?? "")).join(","));
  return "\uFEFF" + headers.join(",") + "\n" + lines.join("\n");
}

function downloadFile(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function exportTypeSeparatedWideCSV() {
  const filename = `${APP_CONFIG.dataFilePrefix}_wide_by_type_${experimentState.participantId}_${safeFileTime()}.csv`;
  const csv = convertTypeSeparatedWideToCSV(experimentState.data);
  downloadFile(filename, csv, "text/csv;charset=utf-8;");
}

function exportLongCSV() {
  const filename = `${APP_CONFIG.dataFilePrefix}_long_by_trial_${experimentState.participantId}_${safeFileTime()}.csv`;
  const csv = convertLongToCSV(experimentState.data);
  downloadFile(filename, csv, "text/csv;charset=utf-8;");
}

function exportAllCSV() {
  exportTypeSeparatedWideCSV();
  exportLongCSV();
}

function exportJSON() {
  const filename = `${APP_CONFIG.dataFilePrefix}_${experimentState.participantId}_${safeFileTime()}.json`;
  const content = JSON.stringify(experimentState.data, null, 2);
  downloadFile(filename, content, "application/json;charset=utf-8;");
}

function renderFinish() {
  app.innerHTML = `
    <div class="topbar">实验结束</div>
    <div class="screen">
      <h2>实验结束</h2>
      <div class="note-box">
        你已完成本部分实验任务。<br>
        请联系实验员进行下一步操作。
      </div>

      <button id="experimenterConfirmBtn" class="danger-btn">实验员确认完成</button>
    </div>
  `;

  scrollToTopAfterRender();

  document.getElementById("experimenterConfirmBtn").addEventListener("click", () => {
    renderDataExportPage();
  });
}

function renderDataExportPage() {
  app.innerHTML = `
    <div class="topbar">实验员页面</div>
    <div class="screen">
      <h2>实验结束确认</h2>
      <div class="note-box">
        被试编号：${experimentState.participantId}<br>
        条件：${experimentState.condition}<br>
        顺序模板：${experimentState.data?.orderTemplate || ""}<br>
        程序已自动导出两种 CSV：按材料类型分列的宽格式用于与问卷平台按编号合并，逐试次长格式用于 LMM 或项目层面分析。<br>
        如需额外备份，可再次导出 CSV 或 JSON。
      </div>

      <button id="exportWideByTypeCsvBtn">再次导出按材料类型分列的宽格式 CSV</button>
      <button id="exportLongCsvBtn" class="secondary-btn">再次导出逐试次长格式 CSV</button>
      <button id="exportAllCsvBtn" class="secondary-btn">同时导出两种 CSV</button>
      <button id="exportJsonBtn" class="secondary-btn">导出 JSON 备份</button>
      <button id="confirmEndBtn" class="danger-btn">清除本地记录并返回开始页</button>
    </div>
  `;

  scrollToTopAfterRender();

  document.getElementById("exportWideByTypeCsvBtn").addEventListener("click", exportTypeSeparatedWideCSV);
  document.getElementById("exportLongCsvBtn").addEventListener("click", exportLongCSV);
  document.getElementById("exportAllCsvBtn").addEventListener("click", exportAllCSV);
  document.getElementById("exportJsonBtn").addEventListener("click", exportJSON);
  document.getElementById("confirmEndBtn").addEventListener("click", () => {
    const ok = confirm("确认清除本地自动保存记录，并返回开始页？");
    if (!ok) return;
    clearPersistedState();
    experimentState.participantId = "";
    experimentState.condition = null;
    experimentState.assignment = null;
    experimentState.timeline = [];
    experimentState.currentIndex = 0;
    experimentState.data = null;
    renderWelcome();
  });
}

function restoreSavedState(savedState) {
  experimentState.participantId = savedState.participantId || "";
  experimentState.condition = savedState.condition || null;
  experimentState.assignment = savedState.assignment || null;
  experimentState.timeline = savedState.timeline || [];
  experimentState.currentIndex = savedState.currentIndex || 0;
  experimentState.data = savedState.data || null;
}

function boot() {
  const savedState = loadPersistedState();

  if (savedState && savedState.timeline?.length) {
    restoreSavedState(savedState);

    if (savedState.data?.completed) {
      renderDataExportPage();
    } else {
      renderResumePrompt(savedState);
    }
  } else {
    renderWelcome();
  }
}

boot();