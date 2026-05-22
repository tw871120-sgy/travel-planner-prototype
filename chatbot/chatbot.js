const storageKeys = {
  settings: "rag-chatbot-settings",
  memory: "rag-chatbot-memory",
  knowledge: "rag-chatbot-knowledge",
  messages: "rag-chatbot-messages",
};

const els = {
  endpoint: document.querySelector("#api-endpoint"),
  model: document.querySelector("#api-model"),
  apiKey: document.querySelector("#api-key"),
  temperature: document.querySelector("#temperature"),
  ragTopK: document.querySelector("#rag-topk"),
  saveSettings: document.querySelector("#save-settings"),
  apiStatus: document.querySelector("#api-status"),
  statusText: document.querySelector("#status-text"),
  memoryEnabled: document.querySelector("#memory-enabled"),
  memoryForm: document.querySelector("#memory-form"),
  memoryInput: document.querySelector("#memory-input"),
  memoryList: document.querySelector("#memory-list"),
  clearMemory: document.querySelector("#clear-memory"),
  fileInput: document.querySelector("#file-input"),
  knowledgeText: document.querySelector("#knowledge-text"),
  addKnowledge: document.querySelector("#add-knowledge"),
  knowledgeList: document.querySelector("#knowledge-list"),
  clearKnowledge: document.querySelector("#clear-knowledge"),
  messages: document.querySelector("#messages"),
  sourcesBar: document.querySelector("#sources-bar"),
  chatForm: document.querySelector("#chat-form"),
  messageInput: document.querySelector("#message-input"),
  sendButton: document.querySelector("#send-button"),
  clearChat: document.querySelector("#clear-chat"),
  exportChat: document.querySelector("#export-chat"),
};

let settings = load(storageKeys.settings, {
  endpoint: "https://api.openai.com/v1/chat/completions",
  model: "gpt-4o-mini",
  apiKey: "",
  temperature: 0.4,
  ragTopK: 4,
});
let memory = load(storageKeys.memory, []);
let knowledge = load(storageKeys.knowledge, []);
let messages = load(storageKeys.messages, [
  {
    role: "assistant",
    content: "你好，我是你的 RAG 記憶型聊天助理。先在左側填 API Key，再放入知識庫或記憶，就可以開始問問題。",
  },
]);

hydrateSettings();
renderAll();

els.saveSettings.addEventListener("click", saveSettings);
els.memoryForm.addEventListener("submit", addMemory);
els.clearMemory.addEventListener("click", () => {
  memory = [];
  persist(storageKeys.memory, memory);
  renderMemory();
});
els.addKnowledge.addEventListener("click", addKnowledgeFromText);
els.fileInput.addEventListener("change", addKnowledgeFromFiles);
els.clearKnowledge.addEventListener("click", () => {
  knowledge = [];
  persist(storageKeys.knowledge, knowledge);
  renderKnowledge();
});
els.chatForm.addEventListener("submit", sendMessage);
els.clearChat.addEventListener("click", () => {
  messages = [];
  persist(storageKeys.messages, messages);
  renderMessages();
  renderSources([]);
});
els.exportChat.addEventListener("click", exportChat);
els.messageInput.addEventListener("input", autoGrow);
els.messageInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    els.chatForm.requestSubmit();
  }
});

function load(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

function persist(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function hydrateSettings() {
  els.endpoint.value = settings.endpoint;
  els.model.value = settings.model;
  els.apiKey.value = settings.apiKey;
  els.temperature.value = settings.temperature;
  els.ragTopK.value = settings.ragTopK;
  updateStatus(settings.apiKey ? "ready" : "idle", settings.apiKey ? "API 已設定" : "尚未連線");
}

function saveSettings() {
  settings = {
    endpoint: els.endpoint.value.trim(),
    model: els.model.value.trim(),
    apiKey: els.apiKey.value.trim(),
    temperature: Number(els.temperature.value || 0.4),
    ragTopK: Number(els.ragTopK.value || 4),
  };
  persist(storageKeys.settings, settings);
  updateStatus(settings.apiKey ? "ready" : "idle", settings.apiKey ? "API 已設定" : "尚未連線");
}

function addMemory(event) {
  event.preventDefault();
  const text = els.memoryInput.value.trim();
  if (!text) return;
  memory.unshift({ id: crypto.randomUUID(), text, createdAt: new Date().toISOString() });
  els.memoryInput.value = "";
  persist(storageKeys.memory, memory);
  renderMemory();
}

function addKnowledgeFromText() {
  const text = els.knowledgeText.value.trim();
  if (!text) return;
  addDocument("手動貼上", text);
  els.knowledgeText.value = "";
}

async function addKnowledgeFromFiles(event) {
  const files = Array.from(event.target.files || []);
  for (const file of files) {
    const text = await file.text();
    addDocument(file.name, text);
  }
  event.target.value = "";
}

function addDocument(title, text) {
  const chunks = chunkText(text);
  const docs = chunks.map((chunk, index) => ({
    id: crypto.randomUUID(),
    title,
    chunkIndex: index + 1,
    text: chunk,
    tokens: tokenize(chunk),
    createdAt: new Date().toISOString(),
  }));
  knowledge = [...docs, ...knowledge];
  persist(storageKeys.knowledge, knowledge);
  renderKnowledge();
}

function chunkText(text) {
  const clean = text.replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim();
  const chunks = [];
  const size = 900;
  const overlap = 120;
  for (let start = 0; start < clean.length; start += size - overlap) {
    chunks.push(clean.slice(start, start + size));
  }
  return chunks.filter(Boolean);
}

function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((token) => token.length > 1);
}

function retrieve(query) {
  const queryTokens = tokenize(query);
  if (!queryTokens.length) return [];
  const querySet = new Set(queryTokens);
  return knowledge
    .map((doc) => {
      const overlap = doc.tokens.filter((token) => querySet.has(token)).length;
      const density = overlap / Math.max(doc.tokens.length, 1);
      return { ...doc, score: overlap + density };
    })
    .filter((doc) => doc.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, settings.ragTopK);
}

async function sendMessage(event) {
  event.preventDefault();
  saveSettings();
  const content = els.messageInput.value.trim();
  if (!content || els.sendButton.disabled) return;
  if (!settings.apiKey || !settings.endpoint || !settings.model) {
    addSystemMessage("請先填好 Endpoint、Model 和 API Key。");
    updateStatus("error", "API 設定不完整");
    return;
  }

  const sources = retrieve(content);
  messages.push({ role: "user", content });
  persist(storageKeys.messages, messages);
  els.messageInput.value = "";
  autoGrow();
  renderMessages();
  renderSources(sources);
  setSending(true);

  try {
    const reply = await callChatApi(content, sources);
    messages.push({ role: "assistant", content: reply });
    persist(storageKeys.messages, messages);
    updateStatus("ready", "回覆完成");
  } catch (error) {
    messages.push({ role: "assistant", content: `API 呼叫失敗：${error.message}` });
    updateStatus("error", "呼叫失敗");
  } finally {
    setSending(false);
    renderMessages();
  }
}

async function callChatApi(userContent, sources) {
  const systemPrompt = [
    "你是專業、可靠的中文聊天助理。",
    "回答要根據使用者問題、長期記憶與 RAG 知識庫內容。",
    "如果知識庫不足，請明確說明你是根據一般推理回答。",
  ].join("\n");
  const memoryBlock = els.memoryEnabled.checked && memory.length
    ? `長期記憶：\n${memory.map((item, index) => `${index + 1}. ${item.text}`).join("\n")}`
    : "長期記憶：未啟用或沒有資料。";
  const ragBlock = sources.length
    ? `RAG 檢索內容：\n${sources.map((doc, index) => `[${index + 1}] ${doc.title} #${doc.chunkIndex}\n${doc.text}`).join("\n\n")}`
    : "RAG 檢索內容：沒有找到相關片段。";
  const recentMessages = messages.slice(-10).map(({ role, content }) => ({ role, content }));

  const response = await fetch(settings.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.apiKey}`,
    },
    body: JSON.stringify({
      model: settings.model,
      temperature: settings.temperature,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "system", content: memoryBlock },
        { role: "system", content: ragBlock },
        ...recentMessages,
        { role: "user", content: userContent },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content?.trim() || "沒有收到模型回覆。";
}

function addSystemMessage(content) {
  messages.push({ role: "system", content });
  persist(storageKeys.messages, messages);
  renderMessages();
}

function renderAll() {
  renderMemory();
  renderKnowledge();
  renderMessages();
}

function renderMemory() {
  els.memoryList.classList.toggle("empty", memory.length === 0);
  els.memoryList.innerHTML = memory.map((item) => `<div class="pill">${escapeHtml(item.text)}</div>`).join("");
}

function renderKnowledge() {
  els.knowledgeList.classList.toggle("empty", knowledge.length === 0);
  const grouped = knowledge.reduce((acc, doc) => {
    acc[doc.title] = (acc[doc.title] || 0) + 1;
    return acc;
  }, {});
  els.knowledgeList.innerHTML = Object.entries(grouped)
    .map(([title, count]) => `<div class="doc-item">${escapeHtml(title)} · ${count} chunks</div>`)
    .join("");
}

function renderMessages() {
  els.messages.innerHTML = messages
    .map((message) => `<article class="message ${message.role}">${escapeHtml(message.content)}</article>`)
    .join("");
  els.messages.scrollTop = els.messages.scrollHeight;
}

function renderSources(sources) {
  els.sourcesBar.classList.toggle("empty", sources.length === 0);
  els.sourcesBar.innerHTML = sources
    .map((source, index) => `<span class="source-chip">[${index + 1}] ${escapeHtml(source.title)} #${source.chunkIndex}</span>`)
    .join("");
}

function updateStatus(type, text) {
  els.apiStatus.className = `status-dot ${type}`;
  els.statusText.textContent = text;
}

function setSending(isSending) {
  els.sendButton.disabled = isSending;
  els.sendButton.textContent = isSending ? "思考中" : "送出";
}

function exportChat() {
  const text = messages.map((message) => `${message.role.toUpperCase()}: ${message.content}`).join("\n\n");
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `chatbot-export-${new Date().toISOString().slice(0, 10)}.txt`;
  link.click();
  URL.revokeObjectURL(url);
}

function autoGrow() {
  els.messageInput.style.height = "auto";
  els.messageInput.style.height = `${Math.min(els.messageInput.scrollHeight, 160)}px`;
}

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
