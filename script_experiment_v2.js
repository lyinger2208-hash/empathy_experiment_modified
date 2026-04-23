const app = document.getElementById("app");

const APP_CONFIG = {
  storageKey: "empathy_experiment_autosave_v6",
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

function chooseCondition() {
  return Math.random() < 0.5 ? "repeated" : "diverse";
}

function getThemeKeys() {
  return Object.keys(negativeMaterials);
}

function buildRepeatedNegativeTrials() {
  const allThemes = getThemeKeys();
  const selectedTheme = sampleArray(allThemes, 1)[0];
  const themePool = negativeMaterials[selectedTheme];

  const nearItems = sampleArray(themePool.near, APP_CONFIG.repeatedNearCount).map((item) => ({
    ...item,
    type: "negative",
    distance: "near",
    theme: selectedTheme
  }));

  const farItems = sampleArray(themePool.far, APP_CONFIG.repeatedFarCount).map((item) => ({
    ...item,
    type: "negative",
    distance: "far",
    theme: selectedTheme
  }));

  return shuffleArray([...nearItems, ...farItems]).map((item, index) => ({
    ...item,
    trialNumber: index + 1
  }));
}

function buildDiverseNegativeTrials() {
  const allThemes = getThemeKeys();
  const selectedThemes = sampleArray(allThemes, APP_CONFIG.diverseThemeCount);

  const pool = [];

  selectedThemes.forEach((themeKey) => {
    const themePool = negativeMaterials[themeKey];

    const nearItems = sampleArray(themePool.near, APP_CONFIG.diverseNearPerTheme).map((item) => ({
      ...item,
      type: "negative",
      distance: "near",
      theme: themeKey
    }));

    const farItems = sampleArray(themePool.far, APP_CONFIG.diverseFarPerTheme).map((item) => ({
      ...item,
      type: "negative",
      distance: "far",
      theme: themeKey
    }));

    pool.push(...nearItems, ...farItems);
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

  const neutralTrials = sampleArray(
    neutralMaterials,
    APP_CONFIG.neutralPerParticipant
  ).map((item, index) => ({
    ...item,
    type: "neutral",
    trialNumber: index + 1
  }));

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
    orderSlot: trial.orderSlot || "",
    orderTemplate: trial.orderTemplate || "",
    username: trial.username || ""
  }));

  return data;
}

function persistState() {
  const payload = {
    participantId: experimentState.participantId,
    condition: experimentState.condition,
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
  const username = trial.username || "匿名用户";

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

    experimentState.participantId = participantId;
    experimentState.condition = chooseCondition();
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
      exportCSV();
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
    orderSlot: trial.orderSlot || "",
    orderTemplate: trial.orderTemplate || "",
    username: trial.username || "",
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

  experimentState.data.trials.push(baseRecord);
  persistState();
}

function sanitizeCSVValue(value) {
  const str = String(value ?? "");
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function buildWideCSVRow(data) {
  const row = {
    participantId: data.participantId || "",
    condition: data.condition || "",
    orderTemplate: data.orderTemplate || "",
    startTime: data.startTime || "",
    endTime: data.endTime || "",
    completed: data.completed ? 1 : 0
  };

  data.trials.forEach((trial) => {
    const i = trial.timelineIndex;
    row[`trial${i}_type`] = trial.type || "";
    row[`trial${i}_distanceCondition`] = trial.distance || "";
    row[`trial${i}_theme`] = trial.theme || "";
    row[`trial${i}_materialId`] = trial.materialId || "";
    row[`trial${i}_orderSlot`] = trial.orderSlot || "";
    row[`trial${i}_username`] = trial.username || "";
    row[`trial${i}_readingCheck`] = trial.readingCheck ?? "";
    row[`trial${i}_psychologicalDistance`] = trial.psychologicalDistance ?? "";
    row[`trial${i}_affectiveEmpathy`] = trial.affectiveEmpathy ?? "";
    row[`trial${i}_cognitiveEmpathy`] = trial.cognitiveEmpathy ?? "";
    row[`trial${i}_helpWillingness`] = trial.helpWillingness ?? "";
    row[`trial${i}_selfRelevance`] = trial.selfRelevance ?? "";
    row[`trial${i}_interestLevel`] = trial.interestLevel ?? "";
    row[`trial${i}_continueWillingness`] = trial.continueWillingness ?? "";
  });

  return row;
}

function convertToCSV(data) {
  const row = buildWideCSVRow(data);
  const headers = Object.keys(row);
  const values = headers.map((key) => sanitizeCSVValue(row[key]));
  return "\uFEFF" + headers.join(",") + "\n" + values.join(",");
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

function exportCSV() {
  const filename = `${APP_CONFIG.dataFilePrefix}_${experimentState.participantId}_${safeFileTime()}.csv`;
  const csv = convertToCSV(experimentState.data);
  downloadFile(filename, csv, "text/csv;charset=utf-8;");
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
        CSV 已自动导出到浏览器下载。<br>
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
        如需额外备份，可再次导出 CSV 或 JSON。
      </div>

      <button id="exportCsvBtn">再次导出 CSV</button>
      <button id="exportJsonBtn" class="secondary-btn">导出 JSON 备份</button>
      <button id="confirmEndBtn" class="danger-btn">清除本地记录并返回开始页</button>
    </div>
  `;

  scrollToTopAfterRender();

  document.getElementById("exportCsvBtn").addEventListener("click", exportCSV);
  document.getElementById("exportJsonBtn").addEventListener("click", exportJSON);
  document.getElementById("confirmEndBtn").addEventListener("click", () => {
    const ok = confirm("确认清除本地自动保存记录，并返回开始页？");
    if (!ok) return;
    clearPersistedState();
    experimentState.participantId = "";
    experimentState.condition = null;
    experimentState.timeline = [];
    experimentState.currentIndex = 0;
    experimentState.data = null;
    renderWelcome();
  });
}

function boot() {
  const savedState = loadPersistedState();
  if (savedState && savedState.timeline?.length) {
    renderResumePrompt(savedState);
  } else {
    renderWelcome();
  }
}

boot();