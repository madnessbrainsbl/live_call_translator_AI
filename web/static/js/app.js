// ===== DOM refs =====
const chat = document.getElementById('chat');
const statusEl = document.getElementById('status');
const typingEl = document.getElementById('typing');
const toastEl = document.getElementById('toast');

// ===== State =====
const SYSTEM_LOOPBACK_DEVICE = '__system_output_loopback__';
const SYSTEM_LOOPBACK_LABEL = 'System output loopback (no microphone)';
const AI_MEMORY_KEY = 'translator-ai-memory-v1';
const AI_CALL_HISTORY_KEY = 'translator-ai-call-assistant-v1';
const AI_MEMORY_MAX = 12;
const AI_CALL_HISTORY_MAX = 40;
const AI_MEMORY_CONTEXT_MAX = 600;
const AI_MEMORY_ANSWER_MAX = 900;
const AI_CALL_ANSWER_MAX = 8000;

let stats = { stt: [], trl: [], tts: [], lat: [], count: 0 };
let muteState = { outgoing: false, incoming: false };
let pending = { direction: null, transcript: null, translation: null };
let lastRenderedDirection = null;
let lastMsgEl = null;
let lastMsgTime = 0;
let lastRenderedMessage = null;
let recentRenderedMessages = [];
let sessionStart = Date.now();
let bookmarkFilterOn = false;
let textOnlyMode = false;
let allMessages = [];
let currentSettings = {};
let availableAudioInputs = [];
let availableAudioOutputs = [];
let browserVoices = [];
let browserVoicesReady = false;
let browserTtsSpeaking = false;
let browserTtsQueue = Promise.resolve();
let edgeVoicesByLang = {};
let edgeVoicesLoading = {};
let aiSuggestionsOpen = false;
let aiSuggestionsBusy = false;
let aiSuggestionTimer = null;
let lastSuggestionFingerprint = '';
let assistantMsgEl = null;
let assistantEntriesEl = null;
let activeAssistantEntry = null;
let aiSuggestionsQueued = false;
let latestAssistantAnswer = '';
let assistantMemory = loadAssistantMemory();
let assistantMemoryRendered = false;
let activeCallId = null;
let resumedCallId = null;
let resumedCallLoaded = false;
let resumeAutoStart = false;
let bootReady = false;
let engineReady = false;

// ===== API key masking (no password detection) =====
document.querySelectorAll('.sp-key').forEach(input => {
  let realValue = input.value;
  const mask = (v) => v.length > 4 ? '••••••••' + v.slice(-4) : v;

  input.addEventListener('focus', () => { input.value = realValue; });
  input.addEventListener('blur', () => { realValue = input.value; input.value = mask(realValue); });
  input.addEventListener('input', () => { realValue = input.value; });

  // Expose real value getter for readForm/populateForm
  input._getRealValue = () => realValue;
  input._setRealValue = (v) => { realValue = v; input.value = mask(v); };
});

// ===== Theme =====
function getTheme() { return localStorage.getItem('translator-theme') || 'dark'; }
function applyTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  document.getElementById('theme-btn').textContent = t === 'dark' ? '\u2600' : '\u263E';
}
function toggleTheme() {
  const t = getTheme() === 'dark' ? 'light' : 'dark';
  localStorage.setItem('translator-theme', t);
  applyTheme(t);
}
applyTheme(getTheme());

// ===== Timer =====
function updateTimer() {
  if (timerPaused) return;
  const elapsed = Date.now() - sessionStart - timerOffset;
  const s = Math.max(0, Math.floor(elapsed / 1000));
  const m = Math.floor(s / 60);
  document.getElementById('timer').textContent = m + ':' + String(s % 60).padStart(2, '0');
}
setInterval(updateTimer, 1000);

// ===== Toast =====
let toastTimeout = null;
function showToast(text) {
  toastEl.textContent = text;
  toastEl.classList.add('show');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toastEl.classList.remove('show'), 1500);
}

// ===== Copy =====
function copyBubble(text) {
  navigator.clipboard.writeText(text).then(() => showToast('Copied!'));
}

// ===== AI Assistant =====
function latestSuggestionMessages() {
  return allMessages.slice(-30).map(m => ({
    direction: m.direction,
    transcript: m.transcript || '',
    translation: m.translation || '',
    at: m.at || 0
  }));
}

function loadAssistantMemory() {
  try {
    const items = JSON.parse(sessionStorage.getItem(AI_MEMORY_KEY) || '[]');
    return Array.isArray(items) ? items.slice(-AI_MEMORY_MAX) : [];
  } catch (e) {
    return [];
  }
}

function saveAssistantMemory() {
  try {
    sessionStorage.setItem(AI_MEMORY_KEY, JSON.stringify(assistantMemory.slice(-AI_MEMORY_MAX)));
  } catch (e) {}
}

function loadCallAssistantStore() {
  try {
    const parsed = JSON.parse(localStorage.getItem(AI_CALL_HISTORY_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (e) {
    return {};
  }
}

function saveCallAssistantStore(store) {
  try {
    localStorage.setItem(AI_CALL_HISTORY_KEY, JSON.stringify(store || {}));
  } catch (e) {}
}

function loadCallAssistantEntries(callId) {
  if (!callId) return [];
  const store = loadCallAssistantStore();
  const entries = store[String(callId)];
  return Array.isArray(entries) ? entries.slice(-AI_CALL_HISTORY_MAX) : [];
}

function persistCallAssistantAnswer(answer, provider, messages) {
  if (!activeCallId) return;
  const text = clipMemoryText(cleanAssistantAnswerText(answer), AI_CALL_ANSWER_MAX);
  if (!text) return;
  const last = messages?.[messages.length - 1] || {};
  const store = loadCallAssistantStore();
  const key = String(activeCallId);
  const entries = Array.isArray(store[key]) ? store[key] : [];
  const fingerprint = suggestionFingerprint(messages || []);
  const lastEntry = entries[entries.length - 1] || {};
  if (lastEntry.fingerprint === fingerprint && lastEntry.answer === text) return;
  entries.push({
    answer: text,
    provider: provider || '',
    source: answerSourceFromMessages(messages || []),
    side: last.direction === 'incoming' ? 'assistant-right' : 'assistant-left',
    at: Date.now(),
    fingerprint
  });
  store[key] = entries.slice(-AI_CALL_HISTORY_MAX);
  saveCallAssistantStore(store);
}

function clearAssistantMemory() {
  assistantMemory = [];
  assistantMemoryRendered = false;
  try { sessionStorage.removeItem(AI_MEMORY_KEY); } catch (e) {}
}

function clipMemoryText(text, maxLen) {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  if (value.length <= maxLen) return value;
  return value.slice(0, maxLen - 1).trimEnd() + '…';
}

function latestAiMemory() {
  return assistantMemory.slice(-8).map(item => ({
    provider: item.provider || '',
    source: clipMemoryText(item.source || '', AI_MEMORY_CONTEXT_MAX),
    answer: clipMemoryText(item.answer || '', AI_MEMORY_ANSWER_MAX),
    at: item.at || 0
  }));
}

function answerSourceFromMessages(messages) {
  const last = messages[messages.length - 1] || {};
  const speaker = last.direction === 'incoming' ? 'Them' : 'Me';
  const text = last.translation || last.transcript || '';
  return clipMemoryText(speaker + ': ' + text, AI_MEMORY_CONTEXT_MAX);
}

function rememberAssistantAnswer(answer, provider, messages) {
  const text = clipMemoryText(answer, AI_MEMORY_ANSWER_MAX);
  if (!text) return;
  assistantMemory.push({
    provider: provider || '',
    source: answerSourceFromMessages(messages || []),
    answer: text,
    at: Date.now()
  });
  assistantMemory = assistantMemory.slice(-AI_MEMORY_MAX);
  saveAssistantMemory();
  persistCallAssistantAnswer(answer, provider, messages);
}

function suggestionFingerprint(messages) {
  return messages.map(m => [
    m.direction,
    normalizeMessageText(m.transcript),
    normalizeMessageText(m.translation)
  ].join(':')).join('|');
}

function providerLabel(provider) {
  if (provider === 'codex') return 'ChatGPT / Codex';
  if (provider === 'auto') return 'Auto';
  if (provider === 'openrouter') return 'OpenRouter';
  if (provider === 'groq') return 'Groq';
  return 'LLM';
}

function latestMessageElement() {
  return allMessages.length ? allMessages[allMessages.length - 1].el : null;
}

function insertAssistantCard(card, afterEl = null) {
  const anchor = afterEl && afterEl.parentNode === chat ? afterEl.nextSibling : typingEl;
  chat.insertBefore(card, anchor || typingEl);
}

function createAssistantCard(state) {
  const card = document.createElement('div');
  const sourceMsg = allMessages[allMessages.length - 1] || null;
  const sourceEl = latestMessageElement();
  const sideClass = sourceMsg?.direction === 'incoming' ? 'assistant-right' : 'assistant-left';
  card.className = 'assistant-msg assistant-inline ' + sideClass;
  if (sourceEl) card.dataset.sourceAt = String(sourceMsg?.at || Date.now());

  const head = document.createElement('div');
  head.className = 'assistant-head';
  const title = document.createElement('span');
  title.className = 'assistant-title';
  title.textContent = 'AI Assistant';
  const status = document.createElement('span');
  status.className = 'assistant-status';
  head.appendChild(title);
  head.appendChild(status);

  const body = document.createElement('div');
  body.className = 'assistant-body';

  card.appendChild(head);
  card.appendChild(body);
  insertAssistantCard(card, sourceEl);
  updateAssistantCard(card, '', '', state);
  return card;
}

function updateAssistantCard(card, answer, provider, state) {
  const status = card.querySelector('.assistant-status');
  const body = card.querySelector('.assistant-body');
  const answerText = cleanAssistantAnswerText(answer || '');

  card.classList.toggle('loading', state === 'loading' || state === 'partial');
  card.classList.toggle('error', state === 'error');
  status.textContent = (state === 'loading' || state === 'partial')
    ? 'Thinking...'
    : (provider ? providerLabel(provider) : (state === 'error' ? 'Error' : ''));
  body.textContent = answerText || (state === 'loading' ? '1) Thinking...\n\n2) Waiting for the detailed answer...' : 'No answer yet');
}

function renderAssistantAnswer(answer, provider, state) {
  latestAssistantAnswer = answer || '';
  if (state === 'loading') {
    activeAssistantEntry = createAssistantCard(state);
  } else if (state === 'partial') {
    const card = activeAssistantEntry || createAssistantCard(state);
    updateAssistantCard(card, answer, provider, state);
  } else {
    const card = activeAssistantEntry || createAssistantCard(state);
    updateAssistantCard(card, answer, provider, state);
    activeAssistantEntry = null;
    trimAssistantCards();
  }
  scrollBottom();
}

function renderStoredAssistantEntry(entry) {
  if (!entry || !entry.answer) return;
  const card = document.createElement('div');
  const sideClass = entry.side === 'assistant-right' ? 'assistant-right' : 'assistant-left';
  card.className = 'assistant-msg assistant-inline ' + sideClass;

  const head = document.createElement('div');
  head.className = 'assistant-head';
  const title = document.createElement('span');
  title.className = 'assistant-title';
  title.textContent = 'AI Assistant';
  const status = document.createElement('span');
  status.className = 'assistant-status';
  status.textContent = entry.provider ? providerLabel(entry.provider) : '';
  head.appendChild(title);
  head.appendChild(status);

  const body = document.createElement('div');
  body.className = 'assistant-body';
  body.textContent = cleanAssistantAnswerText(entry.answer);

  card.appendChild(head);
  card.appendChild(body);
  insertAssistantCard(card, null);
}

function renderStoredAssistantEntries(callId) {
  const entries = loadCallAssistantEntries(callId);
  entries.forEach(renderStoredAssistantEntry);
  trimAssistantCards();
}

function hydrateAssistantMemoryFromCall(callId) {
  const entries = loadCallAssistantEntries(callId);
  assistantMemory = entries.slice(-AI_MEMORY_MAX).map(entry => ({
    provider: entry.provider || '',
    source: clipMemoryText(entry.source || 'Previous resumed AI answer', AI_MEMORY_CONTEXT_MAX),
    answer: clipMemoryText(entry.answer || '', AI_MEMORY_ANSWER_MAX),
    at: entry.at || 0
  })).filter(entry => entry.answer);
  saveAssistantMemory();
}

function ensureNumberedOption(answer, number) {
  const text = cleanAssistantAnswerText(answer);
  if (!text) return '';
  const pattern = new RegExp('^\\s*' + number + '\\s*[\\).:：-]');
  return pattern.test(text) ? text : (number + ') ' + text);
}

function cleanAssistantAnswerText(answer) {
  let text = String(answer || '').replace(/\r\n/g, '\n').trim();
  if (!text) return '';
  text = text
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/\s*(?:\[(?:\d+|source\s*\d+|источник\s*\d+)\])+/gi, '')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return text;
}

function combineAssistantOptions(quickAnswer, detailAnswer) {
  const parts = [];
  const quick = ensureNumberedOption(quickAnswer, 1);
  const detail = ensureNumberedOption(detailAnswer, 2);
  if (quick) parts.push(quick);
  if (detail) parts.push(detail);
  return parts.join('\n\n');
}

function trimAssistantCards() {
  const cards = Array.from(chat.querySelectorAll('.assistant-msg.assistant-inline'));
  while (cards.length > 20) {
    cards.shift()?.remove();
  }
}

function openSuggestions() {
  aiSuggestionsOpen = true;
  document.getElementById('btn-suggestions').classList.add('on');
  if (allMessages.length === 0) {
    showToast('Waiting for transcript');
    return;
  }
  void fetchAiSuggestions(true);
}

function closeSuggestions() {
  aiSuggestionsOpen = false;
  aiSuggestionsQueued = false;
  document.getElementById('btn-suggestions').classList.remove('on');
  chat.querySelectorAll('.assistant-msg').forEach(el => el.remove());
  assistantMsgEl = null;
  assistantEntriesEl = null;
  activeAssistantEntry = null;
  assistantMemoryRendered = false;
}

function toggleSuggestions() {
  if (aiSuggestionsOpen) closeSuggestions();
  else openSuggestions();
}

function resetSuggestions(clearMemory = false) {
  lastSuggestionFingerprint = '';
  latestAssistantAnswer = '';
  aiSuggestionsQueued = false;
  clearTimeout(aiSuggestionTimer);
  if (clearMemory) clearAssistantMemory();
  chat.querySelectorAll('.assistant-msg').forEach(el => el.remove());
  assistantMsgEl = null;
  assistantEntriesEl = null;
  activeAssistantEntry = null;
  assistantMemoryRendered = false;
}

function scheduleSuggestionRefresh() {
  if (!aiSuggestionsOpen) return;
  clearTimeout(aiSuggestionTimer);
  aiSuggestionTimer = setTimeout(() => fetchAiSuggestions(false), 450);
}

async function fetchAiSuggestions(force) {
  if (aiSuggestionsBusy) {
    aiSuggestionsQueued = true;
    return;
  }

  const messages = latestSuggestionMessages();
  if (messages.length === 0) {
    showToast('Waiting for transcript');
    return;
  }

  const fingerprint = suggestionFingerprint(messages);
  if (!force && fingerprint === lastSuggestionFingerprint) return;

  aiSuggestionsBusy = true;
  renderAssistantAnswer('', '', 'loading');
  const basePayload = {
    messages,
    ai_memory: latestAiMemory(),
    my_language: currentSettings.my_language || 'en',
    their_language: currentSettings.their_language || 'en',
    ai_provider: currentSettings.ai_provider || 'codex'
  };
  let quickAnswer = '';
  let quickProvider = '';
  try {
    const quickResp = await fetch('/api/suggestions', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({...basePayload, mode: 'quick'})
    });
    const quickData = await quickResp.json();
    if (!quickResp.ok || quickData.error) {
      throw new Error(quickData.error || 'quick suggestion request failed');
    }
    quickAnswer = quickData.answer || (quickData.suggestions || []).join('\n\n');
    quickProvider = quickData.provider || '';
    const quickDisplay = combineAssistantOptions(quickAnswer, 'Thinking...');
    renderAssistantAnswer(quickDisplay, quickProvider, 'partial');

    const detailResp = await fetch('/api/suggestions', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({...basePayload, mode: 'detail', quick_answer: quickAnswer})
    });
    const detailData = await detailResp.json();
    if (!detailResp.ok || detailData.error) {
      throw new Error(detailData.error || 'detailed suggestion request failed');
    }
    const detailAnswer = detailData.answer || (detailData.suggestions || []).join('\n\n');
    const provider = detailData.provider || quickProvider;
    const answer = combineAssistantOptions(quickAnswer, detailAnswer);
    lastSuggestionFingerprint = fingerprint;
    renderAssistantAnswer(answer, provider, answer ? 'ready' : 'empty');
    if (answer) rememberAssistantAnswer(answer, provider, messages);
  } catch (e) {
    console.warn('AI suggestions failed:', e);
    if (quickAnswer) {
      const answer = combineAssistantOptions(quickAnswer, 'Detailed answer unavailable: ' + (e.message || 'AI assistant unavailable'));
      lastSuggestionFingerprint = fingerprint;
      renderAssistantAnswer(answer, quickProvider, 'ready');
      rememberAssistantAnswer(answer, quickProvider, messages);
    } else {
      renderAssistantAnswer(e.message || 'AI assistant unavailable', '', 'error');
    }
  } finally {
    aiSuggestionsBusy = false;
    if (aiSuggestionsQueued && aiSuggestionsOpen) {
      aiSuggestionsQueued = false;
      setTimeout(() => fetchAiSuggestions(false), 150);
    }
  }
}

// ===== Bookmarks =====
function toggleBookmarkFilter() {
  bookmarkFilterOn = !bookmarkFilterOn;
  document.getElementById('btn-bookmarks').classList.toggle('on', bookmarkFilterOn);
  allMessages.forEach(m => {
    m.el.style.display = (bookmarkFilterOn && !m.bookmarked) ? 'none' : '';
  });
  chat.querySelectorAll('.direction-label, .time-sep').forEach(el => {
    el.style.display = bookmarkFilterOn ? 'none' : '';
  });
  scrollBottom();
}

// ===== Export =====
function exportChat() {
  const lines = [];
  allMessages.forEach(m => {
    const dir = m.direction === 'outgoing' ? 'YOU' : 'THEM';
    const bk = m.bookmarked ? ' *' : '';
    if (m.transcript) lines.push('[' + dir + '] ' + m.transcript);
    lines.push('[' + dir + '] >> ' + m.translation + bk);
    lines.push('');
  });
  const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'transcript-' + new Date().toISOString().slice(0, 16).replace(':', '-') + '.txt';
  a.click();
  showToast('Exported!');
}

// ===== Helpers =====
function latencyClass(ms) { return ms < 400 ? 'fast' : ms < 800 ? 'medium' : 'slow'; }
function avg(arr) {
  if (!arr.length) return '-';
  return Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) + 'ms';
}
function updateStats() {
  document.getElementById('avg-stt').textContent = avg(stats.stt);
  document.getElementById('avg-trl').textContent = avg(stats.trl);
  document.getElementById('avg-tts').textContent = avg(stats.tts);
  document.getElementById('avg-lat').textContent = avg(stats.lat);
  document.getElementById('total').textContent = stats.count;
}
function scrollBottom() { chat.scrollTop = chat.scrollHeight; }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ===== Time separators =====
function maybeAddTimeSep() {
  const now = Date.now();
  if (lastMsgTime && (now - lastMsgTime) > 60000) {
    const gap = Math.round((now - lastMsgTime) / 1000);
    const sep = document.createElement('div');
    sep.className = 'time-sep';
    sep.textContent = gap < 120 ? gap + 's pause' : Math.round(gap / 60) + ' min pause';
    chat.insertBefore(sep, typingEl);
  }
  lastMsgTime = now;
}

// ===== Typing indicator =====
function showTyping() { typingEl.classList.add('visible'); scrollBottom(); }
function hideTyping() { typingEl.classList.remove('visible'); }

// ===== Typewriter =====
function typewrite(el, text) {
  let i = 0;
  el.textContent = '';
  function tick() {
    if (i < text.length) {
      el.textContent += text[i++];
      scrollBottom();
      setTimeout(tick, 18);
    }
  }
  tick();
}

// ===== Chat messages =====
function flushPending() {
  if (!pending.direction || !pending.translation) return;
  if (isDuplicatePending()) {
    pending = { direction: null, transcript: null, translation: null };
    hideTyping();
    return;
  }
  hideTyping();
  maybeAddTimeSep();

  if (pending.direction !== lastRenderedDirection) {
    const label = document.createElement('div');
    label.className = 'direction-label ' + pending.direction;
    const myL = (currentSettings.my_language || 'RU').toUpperCase();
    const theirL = (currentSettings.their_language || 'EN').toUpperCase();
    label.textContent = pending.direction === 'outgoing'
      ? 'You (' + myL + ' \u2192 ' + theirL + ')'
      : 'Them (' + theirL + ' \u2192 ' + myL + ')';
    chat.insertBefore(label, typingEl);
    lastRenderedDirection = pending.direction;
  }

  const msg = document.createElement('div');
  msg.className = 'msg ' + pending.direction;
  const star = document.createElement('span');
  star.className = 'star';
  star.textContent = '\u2606';
  msg.appendChild(star);
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  msg.appendChild(bubble);
  const translationText = pending.translation;
  const transcriptText = pending.transcript;
  bubble.onclick = () => copyBubble(translationText);
  chat.insertBefore(msg, typingEl);
  lastMsgEl = msg;

  const msgData = {
    el: msg, direction: pending.direction,
    transcript: transcriptText, translation: translationText, bookmarked: false, at: Date.now()
  };
  allMessages.push(msgData);
  lastRenderedMessage = {
    direction: pending.direction,
    transcript: normalizeMessageText(transcriptText),
    translation: normalizeMessageText(translationText),
    at: Date.now()
  };
  recentRenderedMessages.push(lastRenderedMessage);
  recentRenderedMessages = recentRenderedMessages
    .filter(item => (Date.now() - item.at) <= 15000)
    .slice(-20);
  star.onclick = (e) => {
    e.stopPropagation();
    msgData.bookmarked = !msgData.bookmarked;
    star.textContent = msgData.bookmarked ? '\u2605' : '\u2606';
    star.classList.toggle('on', msgData.bookmarked);
    msg.classList.toggle('bookmarked', msgData.bookmarked);
  };
  typewrite(bubble, translationText);
  speakTranslationWithExternalTts(translationText, pending.direction);
  stats.count++;
  updateStats();
  scheduleSuggestionRefresh();
  scrollBottom();
  pending = { direction: null, transcript: null, translation: null };
}

function renderStoredMessage(item) {
  const direction = item.direction === 'incoming' ? 'incoming' : 'outgoing';
  const translationText = item.translated || item.translation || '';
  const transcriptText = item.original || item.transcript || '';
  if (!translationText && !transcriptText) return;

  if (direction !== lastRenderedDirection) {
    const label = document.createElement('div');
    label.className = 'direction-label ' + direction;
    const myL = (currentSettings.my_language || 'RU').toUpperCase();
    const theirL = (currentSettings.their_language || 'EN').toUpperCase();
    label.textContent = direction === 'outgoing'
      ? 'You (' + myL + ' \u2192 ' + theirL + ')'
      : 'Them (' + theirL + ' \u2192 ' + myL + ')';
    chat.insertBefore(label, typingEl);
    lastRenderedDirection = direction;
  }

  const msg = document.createElement('div');
  msg.className = 'msg ' + direction;
  const star = document.createElement('span');
  star.className = 'star';
  star.textContent = '\u2606';
  msg.appendChild(star);
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.textContent = translationText || transcriptText;
  bubble.onclick = () => copyBubble(translationText || transcriptText);
  msg.appendChild(bubble);
  chat.insertBefore(msg, typingEl);
  lastMsgEl = msg;

  const at = Date.parse(String(item.ts || '').replace(' ', 'T')) || Date.now();
  const meta = document.createElement('div');
  meta.className = 'meta';
  meta.textContent = item.ts ? String(item.ts).slice(11, 19) : 'history';
  msg.appendChild(meta);

  const msgData = {
    el: msg,
    direction,
    transcript: transcriptText,
    translation: translationText || transcriptText,
    bookmarked: false,
    at
  };
  allMessages.push(msgData);
  star.onclick = (e) => {
    e.stopPropagation();
    msgData.bookmarked = !msgData.bookmarked;
    star.textContent = msgData.bookmarked ? '\u2605' : '\u2606';
    star.classList.toggle('on', msgData.bookmarked);
    msg.classList.toggle('bookmarked', msgData.bookmarked);
  };
  stats.count++;
}

async function loadResumedCallFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const rawId = params.get('resume_call');
  const callId = parseInt(rawId || '', 10);
  if (!Number.isFinite(callId) || callId <= 0) return;
  resumeAutoStart = params.get('autostart') === '1';

  try {
    const resumeResp = await fetch('/api/calls/' + callId + '/resume', { method: 'POST' });
    const resumeData = await resumeResp.json();
    if (!resumeResp.ok || resumeData.error) throw new Error(resumeData.error || 'Failed to resume call');

    const detailResp = await fetch('/api/calls/' + callId);
    const detail = await detailResp.json();
    if (!detailResp.ok || detail.error) throw new Error(detail.error || 'Failed to load call');

    clearAll();
    activeCallId = callId;
    resumedCallId = callId;
    resumedCallLoaded = true;
    const call = detail.call || {};
    if (call.my_language) currentSettings.my_language = call.my_language;
    if (call.their_language) currentSettings.their_language = call.their_language;
    (detail.utterances || []).forEach(renderStoredMessage);
    updateStats();
    resetSuggestions(false);
    hydrateAssistantMemoryFromCall(callId);
    renderStoredAssistantEntries(callId);
    if (aiSuggestionsOpen && allMessages.length) scheduleSuggestionRefresh();
    showToast(resumeAutoStart ? 'History loaded. Starting...' : 'History loaded. Press Start to continue.');
    scrollBottom();
    maybeAutoStartResumedCall();
  } catch (e) {
    console.warn('Failed to resume call:', e);
    showToast(e.message || 'Failed to load history');
  }
}

function maybeAutoStartResumedCall() {
  if (!resumeAutoStart || !resumedCallLoaded || !bootReady || !engineReady) return;
  if (engineRunning || engineToggleBusy) return;
  resumeAutoStart = false;
  setTimeout(() => {
    if (!engineRunning && !engineToggleBusy) toggleEngine();
  }, 350);
}

function normalizeMessageText(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function textsLookAlike(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length < 5 || b.length < 5) return false;

  const shorter = a.length <= b.length ? a : b;
  const longer = a.length > b.length ? a : b;
  return longer.includes(shorter) && shorter.length / longer.length >= 0.65;
}

function messagesLookAlike(a, b) {
  const aTexts = [a.transcript, a.translation].filter(Boolean);
  const bTexts = [b.transcript, b.translation].filter(Boolean);
  return aTexts.some(left => bTexts.some(right => textsLookAlike(left, right)));
}

function isDuplicatePending() {
  if (!lastRenderedMessage) return false;
  const now = Date.now();
  const current = {
    direction: pending.direction,
    transcript: normalizeMessageText(pending.transcript),
    translation: normalizeMessageText(pending.translation),
  };

  for (const recent of recentRenderedMessages) {
    const age = now - recent.at;
    if (age > 15000) continue;

    if (recent.direction === current.direction && messagesLookAlike(recent, current)) {
      return true;
    }

    if (age <= 8000 && recent.direction !== current.direction && messagesLookAlike(recent, current)) {
      return true;
    }
  }

  return false;
}

function processLine(line) {
  let m = line.match(/^✖ Engine error: (.+)$/);
  if (m) {
    showToast(m[1].slice(0, 120));
    void syncEngineState();
    return;
  }
  if (line.startsWith('▶ Engine started') || line.startsWith('■ Engine stopped')) {
    void syncEngineState();
    return;
  }

  m = line.match(/\uD83C\uDFA4 \[(outgoing|incoming)\] (.+)/);
  if (m) { flushPending(); pending.direction = m[1]; pending.transcript = m[2]; showTyping(); return; }
  m = line.match(/\uD83C\uDF10 \[(outgoing|incoming)\] (.+)/);
  if (m) { pending.direction = m[1]; pending.translation = m[2]; flushPending(); return; }
  m = line.match(/\u23F1\s+stt=(\d+)ms\s+trl=(\d+)ms\s+tts=(\d+)ms/);
  if (m) {
    const stt = parseInt(m[1]), trl = parseInt(m[2]), tts = parseInt(m[3]);
    const total = stt + trl + tts;
    stats.stt.push(stt); stats.trl.push(trl); stats.tts.push(tts); stats.lat.push(total);
    updateStats();
    if (lastMsgEl) {
      const meta = lastMsgEl.querySelector('.meta') || document.createElement('div');
      meta.className = 'meta';
      meta.innerHTML = '<span class="' + latencyClass(stt) + '">stt ' + stt + 'ms</span>' +
        '<span class="' + latencyClass(trl) + '">trl ' + trl + 'ms</span>' +
        '<span class="' + latencyClass(tts) + '">tts ' + tts + 'ms</span>' +
        '<span class="' + latencyClass(total) + '">= ' + total + 'ms</span>';
      if (!meta.parentNode) lastMsgEl.appendChild(meta);
      scrollBottom();
    }
  }
}

// ===== Engine commands =====
async function sendCmd(cmd) {
  const resp = await fetch('/cmd', {
    method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({cmd})
  });
  return resp.json();
}

async function checkProviderKey(provider, key) {
  const r = await fetch('/api/test-key', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({ provider, key })
  });
  return r.json();
}

async function preflightStartChecks() {
  const dgEl = document.getElementById('cfg-deepgram');
  const grEl = document.getElementById('cfg-groq');
  const deepgramKey = ((dgEl && dgEl._getRealValue) ? dgEl._getRealValue() : (currentSettings.deepgram_api_key || '')).trim();
  const groqKey = ((grEl && grEl._getRealValue) ? grEl._getRealValue() : (currentSettings.groq_api_key || '')).trim();

  if (!deepgramKey) {
    showToast('Set Deepgram API key first');
    openSettings();
    return false;
  }
  if (!groqKey) {
    showToast('Set Groq API key first');
    openSettings();
    return false;
  }

  try {
    const dg = await checkProviderKey('deepgram', deepgramKey);
    if (!dg.valid) {
      showToast('Deepgram unavailable (network/key)');
      return false;
    }
  } catch (e) {
    showToast('Deepgram check failed');
    return false;
  }

  return true;
}

function normalizeEngineStatus(raw) {
  if (!raw) return 'unknown';
  return raw.startsWith('ok:') ? raw.slice(3) : raw;
}

function applyEngineState(status) {
  const btn = document.getElementById('btn-engine');
  const icon = document.getElementById('engine-icon');
  const text = document.getElementById('engine-toggle-text');
  const normalized = normalizeEngineStatus(status);

  if (normalized === 'running' || normalized === 'starting' || tabCaptureActive) {
    engineRunning = true;
    btn.className = 'btn btn-engine running';
    icon.innerHTML = '&#9724;';
    text.textContent = 'Stop';
    const virtualRunning = tabCaptureActive && normalized !== 'running' && normalized !== 'starting';
    setEnginePill(
      normalized === 'starting' ? 'restarting' : 'running',
      normalized === 'starting' ? 'Starting...' : (virtualRunning ? 'Monitor' : 'Running')
    );
    if (timerPaused) {
      sessionStart = Date.now();
      timerOffset = 0;
      timerPaused = false;
    }
    return virtualRunning ? 'running' : normalized;
  }

  engineRunning = false;
  btn.className = 'btn btn-engine stopped';
  icon.innerHTML = '&#9654;';
  text.textContent = 'Start';

  if (normalized === 'stopping') setEnginePill('restarting', 'Stopping...');
  else if (normalized === 'crashed') setEnginePill('stopped', 'Error');
  else setEnginePill('stopped', 'Stopped');

  if (!timerPaused) {
    timerPaused = true;
    timerPausedAt = Date.now();
  }

  return normalized;
}

async function syncEngineState() {
  try {
    const data = await sendCmd('status');
    return applyEngineState(data.status || '');
  } catch (e) {
    return applyEngineState('crashed');
  }
}

// ===== Monitor =====
let monitorEnabled = false;
let audioCtx = null;
let monitorQueue = [];
let monitorPlaying = false;
let monitorStartedTabCapture = false;

function updateTextOnlyButton() {
  const btn = document.getElementById('btn-text-only');
  if (!btn) return;
  btn.classList.toggle('on', textOnlyMode);
  btn.setAttribute('aria-pressed', textOnlyMode ? 'true' : 'false');
  btn.title = textOnlyMode
    ? 'Sound is disabled; translations stay text-only'
    : 'Disable translated speech output; keep text only';
  const label = document.getElementById('text-only-label');
  if (label) label.textContent = 'Text Only';
}

async function persistTextOnlyMode() {
  const settings = { ...readForm(), text_only_mode: textOnlyMode };
  await fetch('/api/settings', {
    method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(settings)
  });
  currentSettings = settings;
}

async function applyTextOnlyMode(sendToEngine = true, persist = false) {
  updateTextOnlyButton();
  if (sendToEngine) {
    try {
      await sendCmd(textOnlyMode ? 'text_only_on' : 'text_only_off');
      await syncMonitorAudioMode();
    } catch (e) {
      console.warn('Failed to update text-only mode in engine:', e);
    }
  }
  if (textOnlyMode) {
    monitorQueue = [];
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    try {
      await fetch('/api/poll-audio');
    } catch (e) {
      console.warn('Failed to clear queued audio:', e);
    }
  }
  if (persist) {
    try {
      await persistTextOnlyMode();
    } catch (e) {
      console.warn('Failed to save text-only mode:', e);
    }
  }
}

async function toggleTextOnly() {
  textOnlyMode = !textOnlyMode;
  await applyTextOnlyMode(true, true);
  showToast(textOnlyMode ? 'Text only ON' : 'Sound ON');
}

function ensureAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    return audioCtx.resume();
  }
  return Promise.resolve();
}

async function toggleMonitor() {
  monitorEnabled = !monitorEnabled;
  document.getElementById('btn-monitor').classList.toggle('on', monitorEnabled);
  // Unlock AudioContext on user gesture
  if (monitorEnabled) {
    await ensureAudioContext();
    if (shouldMonitorStartTabCapture()) {
      monitorStartedTabCapture = true;
      await startTabCapture(defaultMonitorCaptureDirection());
      if (!tabCaptureActive) monitorStartedTabCapture = false;
    }
  } else if (monitorStartedTabCapture && tabCaptureActive) {
    monitorStartedTabCapture = false;
    stopTabCapture(false);
  }
  await syncMonitorAudioMode();
  showToast(monitorEnabled ? 'Monitor ON' : 'Monitor OFF');
}

function shouldMonitorStartTabCapture() {
  return Boolean(
    !tabCaptureActive &&
    !usesEngineLoopbackCapture() &&
    availableAudioOutputs.length === 0 &&
    currentSettings.deepgram_api_key
  );
}

function usesEngineLoopbackCapture() {
  const micDevice = document.getElementById('cfg-mic')?.value || 'default';
  const callCapture = document.getElementById('cfg-call-output')?.value || 'default';
  const outgoingLoopback =
    !muteState.outgoing &&
    isSystemDefaultDevice(micDevice) &&
    !isUsableInputDevice(micDevice, true) &&
    availableAudioOutputs.length > 0;
  const incomingLoopback =
    !muteState.incoming &&
    isSystemLoopbackDevice(callCapture) &&
    availableAudioOutputs.length > 0;
  return outgoingLoopback || incomingLoopback;
}

async function syncMonitorAudioMode() {
  try {
    const browserPlaybackActive = monitorEnabled && !textOnlyMode && !tabCaptureActive;
    await sendCmd(browserPlaybackActive ? 'monitor_audio_on' : 'monitor_audio_off');
  } catch (e) {
    console.warn('Failed to update monitor audio mode in engine:', e);
  }
}

async function playAudioItem(item, force = false) {
  if (!item) return;
  if (textOnlyMode && !force) return;
  await ensureAudioContext();
  const { sr, b64 } = item;
  const raw = atob(b64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  const pcm16 = new Int16Array(bytes.buffer);
  const floats = new Float32Array(pcm16.length);
  for (let i = 0; i < pcm16.length; i++) {
    floats[i] = pcm16[i] / 32768.0;
  }
  const buf = audioCtx.createBuffer(1, floats.length, sr);
  buf.getChannelData(0).set(floats);
  const src = audioCtx.createBufferSource();
  src.buffer = buf;
  const gain = audioCtx.createGain();
  gain.gain.value = 0.8;
  src.connect(gain).connect(audioCtx.destination);
  src.start();
  await new Promise(r => { src.onended = r; });
}

// Poll for audio and play via AudioContext
async function pollAudio() {
  if (!monitorEnabled || !audioCtx) return;
  if (textOnlyMode || tabCaptureActive) {
    monitorQueue = [];
    try { await fetch('/api/poll-audio'); } catch(e) {}
    return;
  }
  try {
    const r = await fetch('/api/poll-audio');
    const items = await r.json();
    for (const item of items) {
      monitorQueue.push(item);
    }
    if (items.length > 0 && !monitorPlaying) drainMonitorQueue();
  } catch(e) { console.error('[MONITOR] poll error:', e); }
}

async function drainMonitorQueue() {
  monitorPlaying = true;
  while (monitorQueue.length > 0) {
    const item = monitorQueue.shift();
    try {
      await playAudioItem(item);
    } catch(e) {
      console.warn('Monitor playback error:', e);
    }
  }
  monitorPlaying = false;
}

// Poll every 500ms when monitor is on
setInterval(pollAudio, 500);

// ===== Browser Audio Capture =====
let tabCaptureActive = false;
let tabStream = null;
let tabRecorder = null;
let tabDgSocket = null;
let tabFinalText = '';
let tabLiveText = '';
let tabFinalFlushTimer = null;
let tabCaptureDirection = 'incoming';
let tabCaptureStarting = false;

const TAB_UTTERANCE_SILENCE_MS = 2000;

const DG_LANG_MAP = { pt: 'pt-BR', no: 'nb' };
function dgLang(code) { return DG_LANG_MAP[code] || code; }

function deepgramListenUrl(lang) {
  const params = new URLSearchParams({
    model: 'nova-3',
    language: dgLang(lang || 'en'),
    interim_results: 'true',
    endpointing: String(currentSettings.endpointing_ms || 700),
    punctuate: 'true',
    smart_format: 'true'
  });
  return 'wss://api.deepgram.com/v1/listen?' + params.toString();
}

function preferredRecorderMimeType() {
  const choices = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus'
  ];
  return choices.find(type => window.MediaRecorder && MediaRecorder.isTypeSupported(type)) || '';
}

function mergeCapturedText(current, next) {
  const currentTrimmed = (current || '').trim();
  const nextTrimmed = (next || '').trim();
  if (!currentTrimmed) return nextTrimmed;
  if (!nextTrimmed) return currentTrimmed;

  const currentNorm = normalizeMessageText(currentTrimmed);
  const nextNorm = normalizeMessageText(nextTrimmed);
  if (currentNorm === nextNorm) return currentTrimmed;
  if (currentNorm.includes(nextNorm)) return currentTrimmed;
  if (nextNorm.includes(currentNorm)) return nextTrimmed;
  return currentTrimmed + ' ' + nextTrimmed;
}

function resetTabTranscriptBuffer() {
  if (tabFinalFlushTimer) clearTimeout(tabFinalFlushTimer);
  tabFinalFlushTimer = null;
  tabFinalText = '';
  tabLiveText = '';
}

function queueTabTranscript(text) {
  tabFinalText = mergeCapturedText(tabFinalText, text);
  if (tabFinalFlushTimer) clearTimeout(tabFinalFlushTimer);
  tabFinalFlushTimer = setTimeout(() => flushTabTranscript(), TAB_UTTERANCE_SILENCE_MS);
}

async function flushTabTranscript() {
  if (tabFinalFlushTimer) clearTimeout(tabFinalFlushTimer);
  tabFinalFlushTimer = null;

  const text = tabFinalText.trim();
  tabFinalText = '';
  if (!text) return;

  const t0 = performance.now();
  const direction = tabCaptureDirection === 'outgoing' ? 'outgoing' : 'incoming';
  const fromLang = direction === 'outgoing'
    ? (currentSettings.my_language || 'ru')
    : (currentSettings.their_language || 'en');
  const toLang = direction === 'outgoing'
    ? (currentSettings.their_language || 'en')
    : (currentSettings.my_language || 'ru');
  processLine('\uD83C\uDFA4 [' + direction + '] ' + text);
  try {
    const resp = await fetch('/api/translate', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        text,
        from: fromLang,
        to: toLang
      })
    });
    const result = await resp.json();
    const trlMs = Math.round(performance.now() - t0);
    if (result.error) {
      console.warn('[TAB] translate error:', result.error);
      showToast('Incoming translation failed');
      return;
    }
    if (!result.translation) {
      showToast('Incoming translation is empty');
      return;
    }
    processLine('\uD83C\uDF10 [' + direction + '] ' + result.translation);
    processLine('\u23F1  stt=0ms trl=' + trlMs + 'ms tts=0ms');
  } catch(err) {
    console.error('[TAB] translate fetch failed:', err);
    showToast('Incoming translation failed');
  }
}

function defaultMonitorCaptureDirection() {
  return canUseOutgoingMicrophone() ? 'incoming' : 'outgoing';
}

async function startTabCapture(direction = 'incoming') {
  if (tabCaptureActive) return true;
  if (tabCaptureStarting) return false;
  const key = currentSettings.deepgram_api_key;
  if (!key) { showToast('Set Deepgram API key in Settings first'); return false; }
  tabCaptureDirection = direction === 'outgoing' ? 'outgoing' : 'incoming';
  tabCaptureStarting = true;

  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
      showToast('Monitor audio capture is not supported in this browser');
      tabCaptureStarting = false;
      return false;
    }

    showToast('Select the tab, window, or screen that is playing audio');
    const displayOptions = {
      video: true,
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false
      },
      systemAudio: 'include',
      windowAudio: 'system',
      surfaceSwitching: 'include',
      selfBrowserSurface: 'exclude',
      preferCurrentTab: false
    };
    tabStream = await navigator.mediaDevices.getDisplayMedia(displayOptions);
    // Keep the video track alive. On Chrome/Windows stopping it can terminate
    // the whole display-capture stream, including the audio track.
    const audioTracks = tabStream.getAudioTracks();
    if (audioTracks.length === 0) {
      showToast('No shared audio. Reopen Monitor and enable tab/screen audio sharing');
      tabStream.getTracks().forEach(t => t.stop());
      tabStream = null;
      tabCaptureStarting = false;
      return false;
    }
  } catch(e) {
    console.warn('[TAB] system audio capture failed:', e);
    showToast(e && e.name === 'NotAllowedError' ? 'Monitor audio cancelled' : 'Monitor audio capture failed');
    tabCaptureStarting = false;
    return false;
  }

  const sourceLanguage = tabCaptureDirection === 'outgoing'
    ? (currentSettings.my_language || 'ru')
    : (currentSettings.their_language || 'en');
  const url = deepgramListenUrl(sourceLanguage);
  tabDgSocket = new WebSocket(url, ['token', key]);

  return new Promise(resolve => {
    let settled = false;
    const finish = (ok, message) => {
      if (settled) return;
      settled = true;
      clearTimeout(openTimeout);
      tabCaptureStarting = false;
      if (message) showToast(message);
      if (!ok) {
        if (tabRecorder && tabRecorder.state !== 'inactive') tabRecorder.stop();
        if (tabDgSocket && tabDgSocket.readyState < WebSocket.CLOSING) tabDgSocket.close();
        if (tabStream) tabStream.getTracks().forEach(t => t.stop());
        tabRecorder = null;
        tabDgSocket = null;
        tabStream = null;
        resetTabTranscriptBuffer();
        tabCaptureActive = false;
        tabCaptureDirection = 'incoming';
        void syncEngineState();
      }
      resolve(ok);
    };

    const openTimeout = setTimeout(() => {
      finish(false, 'Deepgram monitor connection timed out');
    }, 8000);

    tabDgSocket.onopen = () => {
      try {
        const mimeType = preferredRecorderMimeType();
        tabRecorder = mimeType ? new MediaRecorder(tabStream, { mimeType }) : new MediaRecorder(tabStream);
        tabRecorder.ondataavailable = (e) => {
          if (e.data.size > 0 && tabDgSocket && tabDgSocket.readyState === WebSocket.OPEN) {
            tabDgSocket.send(e.data);
          }
        };
        tabRecorder.onerror = () => finish(false, 'Browser audio recorder failed');
        tabStream.getAudioTracks()[0].onmute = () => showToast('Monitor audio track is muted');
        tabStream.getAudioTracks()[0].onunmute = () => showToast('Monitor audio detected');
        tabRecorder.start(250);
        tabCaptureActive = true;
        void syncMonitorAudioMode();
        void syncEngineState();
        finish(true, tabCaptureDirection === 'outgoing'
          ? 'Monitor capture ON: translating your audio source'
          : 'Monitor capture ON: translating incoming audio');
      } catch (err) {
        console.warn('[TAB] MediaRecorder failed:', err);
        finish(false, 'Browser audio recorder failed');
      }
    };

    tabDgSocket.onmessage = async (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type !== 'Results') return;
        const alt = msg.channel?.alternatives?.[0];
        if (!alt || !alt.transcript) return;
        const text = alt.transcript.trim();
        if (!text) return;
        tabLiveText = mergeCapturedText(tabLiveText, text);

        if (msg.is_final) {
          queueTabTranscript(tabLiveText || text);
          tabLiveText = '';
        }
      } catch(err) { console.warn('Tab STT parse error:', err); }
    };

    tabDgSocket.onerror = () => {
      if (!tabCaptureActive) finish(false, 'Deepgram monitor connection failed');
      else showToast('Deepgram monitor connection error');
    };
    tabDgSocket.onclose = () => {
      if (!settled) finish(false, 'Deepgram monitor connection closed');
      else if (tabCaptureActive) stopTabCapture();
    };

    // Stop if user stops sharing the tab
    tabStream.getAudioTracks()[0].onended = () => stopTabCapture();
  });
}

function stopTabCapture(showMessage = true) {
  flushTabTranscript();
  tabCaptureStarting = false;
  if (tabRecorder && tabRecorder.state !== 'inactive') tabRecorder.stop();
  if (tabDgSocket && tabDgSocket.readyState === WebSocket.OPEN) {
    tabDgSocket.send(new Uint8Array(0)); // close signal
    tabDgSocket.close();
  }
  if (tabStream) tabStream.getTracks().forEach(t => t.stop());
  tabRecorder = null;
  tabDgSocket = null;
  tabStream = null;
  resetTabTranscriptBuffer();
  monitorStartedTabCapture = false;
  tabCaptureActive = false;
  tabCaptureDirection = 'incoming';
  syncMonitorAudioMode();
  void syncEngineState();
  if (showMessage) showToast('Monitor audio capture OFF');
}

// ===== Engine start/stop =====
let engineRunning = false;
let engineToggleBusy = false;
let timerPaused = true;
let timerPausedAt = 0;
let timerOffset = 0;

async function toggleEngine() {
  if (engineToggleBusy) return;
  engineToggleBusy = true;
  const btn = document.getElementById('btn-engine');
  const icon = document.getElementById('engine-icon');
  const text = document.getElementById('engine-toggle-text');

  try {
    const backendState = await syncEngineState();
    if (backendState === 'running' || backendState === 'starting' || tabCaptureActive) {
      if (tabCaptureActive) stopTabCapture(false);
      monitorStartedTabCapture = false;
      monitorEnabled = false;
      document.getElementById('btn-monitor').classList.remove('on');
      await sendCmd('stop');
      await fetch('/api/calls/end', { method: 'POST' });
      await sleep(400);
      await syncEngineState();
      showToast('Engine stopped');
      return;
    }

    const startCmd = getEngineStartCommand();
    if (!startCmd) {
      await syncEngineState();
      if (!tabCaptureActive && shouldOfferSystemAudioCapture()) {
        monitorEnabled = true;
        document.getElementById('btn-monitor').classList.add('on');
        await ensureAudioContext();
        monitorStartedTabCapture = true;
        const started = await startTabCapture();
        if (!started) {
          monitorStartedTabCapture = false;
          monitorEnabled = false;
          document.getElementById('btn-monitor').classList.remove('on');
          await syncMonitorAudioMode();
        }
        if (started && tabCaptureActive) {
          showToast('Monitor capturing browser sound');
          return;
        }
      }
      showToast(tabCaptureActive ? 'Monitor is already capturing browser sound' : getEngineStartBlockedMessage());
      return;
    }

    if (!(await preflightStartChecks())) {
      await syncEngineState();
      return;
    }

    btn.className = 'btn btn-engine stopped';
    text.textContent = 'Starting...';
    icon.innerHTML = '&#8987;';
    setEnginePill('restarting', 'Starting...');

    // New session by default; resumed history keeps its call_id and visible transcript.
    if (resumedCallId) {
      const resp = await fetch('/api/calls/' + resumedCallId + '/resume', { method: 'POST' });
      const data = await resp.json();
      if (!resp.ok || data.error) throw new Error(data.error || 'Failed to resume call');
      pending = { direction: null, transcript: null, translation: null };
      recentRenderedMessages = [];
      lastSuggestionFingerprint = '';
    } else {
      const resp = await fetch('/api/calls/new-session', { method: 'POST' });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data.error) throw new Error(data.error || 'Failed to start new call');
      activeCallId = data.call_id || null;
      resumedCallId = null;
      resumedCallLoaded = false;
      clearAll();
    }
    // Reconnect SSE so it doesn't replay old lines
    if (evtSource) { evtSource.close(); }
    connectSSE();

    await syncMonitorAudioMode();
    const resp = await sendCmd(startCmd);
    if ((resp.status || '').startsWith('error:')) {
      throw new Error(resp.status);
    }
    await sleep(1200);

    const finalState = await syncEngineState();
    if (finalState === 'running' || finalState === 'starting') {
      showToast('Engine started');
      if (startCmd === 'start_outgoing' && !muteState.incoming) {
        setTimeout(() => showToast('Use Monitor for browser sound'), 1100);
      }
    } else {
      showToast('Start request sent');
    }
  } catch (e) {
    await syncEngineState();
    showToast('Engine error');
    console.error('toggleEngine failed:', e);
  } finally {
    engineToggleBusy = false;
  }
}

function getEngineStartCommand() {
  const pipelines = [];
  const micDevice = document.getElementById('cfg-mic')?.value || 'default';
  const callPlayback = document.getElementById('cfg-call-input')?.value || 'default';
  const callCapture = document.getElementById('cfg-call-output')?.value || 'default';

  const canCaptureOutgoing = isUsableInputDevice(micDevice, true);
  const canCaptureOutgoingViaLoopback = !canCaptureOutgoing
    && isSystemDefaultDevice(micDevice)
    && availableAudioOutputs.length > 0;
  const canPlayOutgoing = isUsableOutputDevice(callPlayback, true);
  if (!muteState.outgoing && (canCaptureOutgoing || canCaptureOutgoingViaLoopback) && canPlayOutgoing) {
    pipelines.push('outgoing');
  }

  const canCaptureIncoming = isUsableInputDevice(callCapture, false) || isUsableLoopbackDevice(callCapture);
  const incomingDuplicatesOutgoingLoopback =
    canCaptureOutgoingViaLoopback && isSystemLoopbackDevice(callCapture) && !muteState.outgoing;
  if (!muteState.incoming && !tabCaptureActive && canCaptureIncoming && !incomingDuplicatesOutgoingLoopback) {
    pipelines.push('incoming');
  }

  if (pipelines.length === 2) return 'start';
  if (pipelines[0] === 'outgoing') return 'start_outgoing';
  if (pipelines[0] === 'incoming') return 'start_incoming';
  return '';
}

function isSystemDefaultDevice(name) {
  return String(name || '').trim().toLowerCase() === 'default';
}

function isSystemLoopbackDevice(name) {
  return String(name || '') === SYSTEM_LOOPBACK_DEVICE;
}

function isUsableInputDevice(selection, allowDefault) {
  if (isSystemDefaultDevice(selection)) return Boolean(allowDefault && availableAudioInputs.length > 0);
  return availableAudioInputs.includes(selection);
}

function isUsableOutputDevice(selection, allowDefault) {
  if (isSystemDefaultDevice(selection)) return Boolean(allowDefault && availableAudioOutputs.length > 0);
  return availableAudioOutputs.includes(selection);
}

function isUsableLoopbackDevice(selection) {
  return isSystemLoopbackDevice(selection) && availableAudioOutputs.length > 0;
}

function canUseOutgoingMicrophone() {
  const micDevice = document.getElementById('cfg-mic')?.value || 'default';
  return isUsableInputDevice(micDevice, true);
}

function updateAudioControlAvailability() {
  const outBtn = document.getElementById('btn-mic-out');
  const outLabel = document.getElementById('mic-out-label');
  if (!outBtn || !outLabel) return;

  const hasMic = canUseOutgoingMicrophone();
  outBtn.classList.toggle('unavailable', !hasMic);
  outBtn.classList.toggle('active', hasMic && !muteState.outgoing);
  outBtn.classList.toggle('muted', hasMic && muteState.outgoing);
  outBtn.setAttribute('aria-disabled', hasMic ? 'false' : 'true');
  outLabel.textContent = hasMic ? 'Mic Out' : 'No Mic';
  outBtn.title = hasMic
    ? 'Mute / Unmute your microphone'
    : 'No physical microphone detected. Start will capture system output loopback if available.';

  const inBtn = document.getElementById('btn-mic-in');
  if (inBtn) {
    inBtn.classList.toggle('active', !muteState.incoming);
    inBtn.classList.toggle('muted', muteState.incoming);
  }
}

function getEngineStartBlockedMessage() {
  const micDevice = document.getElementById('cfg-mic')?.value || 'default';
  const callPlayback = document.getElementById('cfg-call-input')?.value || 'default';
  const callCapture = document.getElementById('cfg-call-output')?.value || 'default';

  if (muteState.outgoing && muteState.incoming) {
    return isSystemLoopbackDevice(callCapture)
      ? 'Mic In is muted. Turn it on to capture system output loopback.'
      : 'Mic Out and Mic In are muted. Use Monitor to capture browser sound.';
  }
  if (!muteState.outgoing && !isUsableInputDevice(micDevice, true)) {
    if (tabCaptureActive && availableAudioOutputs.length > 0) {
      return 'Monitor is already capturing browser sound.';
    }
    return availableAudioOutputs.length > 0
      ? 'No microphone input. Start will use system output loopback.'
      : 'No microphone input. Use Monitor or connect a microphone.';
  }
  if (!muteState.outgoing && !isUsableOutputDevice(callPlayback, true)) {
    return 'No playback output device available.';
  }
  if (!muteState.incoming && isSystemLoopbackDevice(callCapture) && !isUsableLoopbackDevice(callCapture)) {
    return 'No output device available for system output loopback.';
  }
  if (!muteState.incoming && isSystemDefaultDevice(callCapture)) {
    return 'Select a real system/call capture device or use Monitor.';
  }
  if (!muteState.incoming && !isUsableInputDevice(callCapture, false)) {
    return 'System/call capture device is unavailable. Use Monitor for browser sound.';
  }
  return 'No usable audio pipeline selected';
}

function shouldOfferSystemAudioCapture() {
  return Boolean(
    currentSettings.deepgram_api_key &&
    !tabCaptureActive &&
    availableAudioOutputs.length === 0 &&
    navigator.mediaDevices &&
    navigator.mediaDevices.getDisplayMedia
  );
}

async function toggleMute(direction) {
  if (direction === 'outgoing' && !canUseOutgoingMicrophone()) {
    updateAudioControlAvailability();
    showToast('No microphone detected. Use Mic In or Monitor for speaker audio.');
    return;
  }

  muteState[direction] = !muteState[direction];
  const muted = muteState[direction];
  await sendCmd(muted ? 'mute_' + direction : 'unmute_' + direction);
  const btn = document.getElementById(direction === 'outgoing' ? 'btn-mic-out' : 'btn-mic-in');
  btn.className = muted ? 'btn muted' : 'btn active';
  updateAudioControlAvailability();
}

function clearAll() {
  chat.innerHTML = '';
  chat.appendChild(typingEl);
  stats = { stt: [], trl: [], tts: [], lat: [], count: 0 };
  lastRenderedDirection = null; lastMsgEl = null; lastMsgTime = 0;
  lastRenderedMessage = null; recentRenderedMessages = [];
  pending = { direction: null, transcript: null, translation: null };
  allMessages = []; bookmarkFilterOn = false;
  document.getElementById('btn-bookmarks').classList.remove('on');
  resetSuggestions(true);
  updateStats();
}

// ===== Settings Panel =====
function openSettings() {
  document.getElementById('sp-backdrop').classList.add('open');
  document.getElementById('sp').classList.add('open');
}
function closeSettings() {
  document.getElementById('sp-backdrop').classList.remove('open');
  document.getElementById('sp').classList.remove('open');
}
function toggleSection(id) {
  document.getElementById(id).classList.toggle('collapsed');
}

// Populate settings form from loaded settings
function populateForm(s) {
  const dg = document.getElementById('cfg-deepgram');
  const gr = document.getElementById('cfg-groq');
  const aiProvider = document.getElementById('cfg-ai-provider');
  const codexEnabled = document.getElementById('cfg-codex-enabled');
  const codexModel = document.getElementById('cfg-codex-model');
  const or = document.getElementById('cfg-openrouter');
  const ttsProvider = document.getElementById('cfg-tts-provider');
  if (dg._setRealValue) dg._setRealValue(s.deepgram_api_key || '');
  else dg.value = s.deepgram_api_key || '';
  if (gr._setRealValue) gr._setRealValue(s.groq_api_key || '');
  else gr.value = s.groq_api_key || '';
  if (aiProvider) aiProvider.value = s.ai_provider || 'codex';
  if (codexEnabled) codexEnabled.checked = s.codex_enabled !== false;
  if (codexModel) codexModel.value = s.codex_model || 'gpt-5.4';
  if (or._setRealValue) or._setRealValue(s.openrouter_api_key || '');
  else or.value = s.openrouter_api_key || '';
  const orModel = document.getElementById('cfg-openrouter-model');
  if (orModel) orModel.value = s.openrouter_model || 'openrouter/auto';
  textOnlyMode = !!s.text_only_mode;
  if (ttsProvider) ttsProvider.value = s.tts_provider || 'piper';
  applyTextOnlyMode(true, false);
  if (!s.deepgram_api_key && s._deepgram_from_env) dg.placeholder = 'Set via .env file';
  if (!s.groq_api_key && s._groq_from_env) gr.placeholder = 'Set via .env file';
  if (!s.openrouter_api_key && s._openrouter_from_env) or.placeholder = 'Set via .env file';
  document.getElementById('cfg-my-lang').value = s.my_language || 'en';
  document.getElementById('cfg-their-lang').value = s.their_language || 'en';
  document.getElementById('cfg-endpointing').value = s.endpointing_ms || 700;
  document.getElementById('endpointing-val').textContent = (s.endpointing_ms || 700) + 'ms';
  document.getElementById('cfg-call-input').value = s.meet_output_device || 'default';
  document.getElementById('cfg-call-output').value = s.meet_input_device || 'default';
  // Device dropdowns populated by loadDevices() using currentSettings
  if (Object.keys(allVoices).length > 0) updateVoiceDropdowns();
}

function readForm() {
  return {
    deepgram_api_key: (document.getElementById('cfg-deepgram')._getRealValue || (() => document.getElementById('cfg-deepgram').value))().trim(),
    groq_api_key: (document.getElementById('cfg-groq')._getRealValue || (() => document.getElementById('cfg-groq').value))().trim(),
    ai_provider: document.getElementById('cfg-ai-provider')?.value || 'codex',
    codex_enabled: document.getElementById('cfg-codex-enabled')?.checked !== false,
    codex_model: (document.getElementById('cfg-codex-model')?.value || 'gpt-5.4').trim(),
    openrouter_api_key: (document.getElementById('cfg-openrouter')._getRealValue || (() => document.getElementById('cfg-openrouter').value))().trim(),
    openrouter_model: (document.getElementById('cfg-openrouter-model')?.value || 'openrouter/auto').trim(),
    tts_provider: document.getElementById('cfg-tts-provider')?.value || 'piper',
    my_language: document.getElementById('cfg-my-lang').value,
    their_language: document.getElementById('cfg-their-lang').value,
    tts_outgoing_voice: document.getElementById('cfg-voice-out').value,
    tts_incoming_voice: document.getElementById('cfg-voice-in').value,
    mic_device: document.getElementById('cfg-mic').value || 'default',
    speaker_device: document.getElementById('cfg-speaker').value || 'default',
    meet_input_device: document.getElementById('cfg-call-output').value || 'default',
    meet_output_device: document.getElementById('cfg-call-input').value || 'default',
    endpointing_ms: parseInt(document.getElementById('cfg-endpointing').value),
    text_only_mode: textOnlyMode,
  };
}

// Download missing voice model with user confirmation
let downloadingLangs = new Set();

const LANGS_NO_TTS = [];

async function showDownloadPrompt(lang, hintId) {
  const hint = document.getElementById(hintId);
  if (LANGS_NO_TTS.includes(lang)) {
    hint.innerHTML = '<span style="color:var(--yellow)">No TTS voice exists for ' + langName(lang) +
      '. Translation will work but without audio output.</span>';
    return;
  }
  hint.innerHTML = '<button class="sp-download-btn" onclick="downloadDefaultVoice(\'' +
    lang + '\', \'' + hintId + '\')">Download ' + langName(lang) +
    ' default voice &amp; restart engine</button>';
  hint.style.color = '';
}

async function downloadDefaultVoice(lang, hintId) {
  if (downloadingLangs.has(lang)) return;
  downloadingLangs.add(lang);
  const hint = document.getElementById(hintId);
  hint.innerHTML = '<div class="sp-progress"><div class="sp-progress-bar" id="pb-' + lang +
    '"></div><div class="sp-progress-text" id="pt-' + lang + '">Connecting...</div></div>';

  try {
    const resp = await fetch('/api/download-voice', {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ lang })
    });
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() || '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = JSON.parse(line.slice(6));
        if (data.progress !== undefined) {
          const bar = document.getElementById('pb-' + lang);
          const txt = document.getElementById('pt-' + lang);
          if (bar) bar.style.width = data.progress + '%';
          if (txt) txt.textContent = data.progress + '% \u2014 ' + data.mb_done + '/' + data.mb_total + ' MB';
        }
        if (data.done) {
          hint.innerHTML = '<span style="color:var(--green)">' + langName(lang) +
            ' voice installed!</span>';
          showToast(langName(lang) + ' voice downloaded');
          await loadVoices();
          await saveAndRestart();
        }
        if (data.error) {
          hint.innerHTML = '<span style="color:var(--red)">' + data.error + '</span>';
        }
      }
    }
  } catch(e) {
    hint.innerHTML = '<span style="color:var(--red)">Download failed: ' + e.message + '</span>';
  }
  downloadingLangs.delete(lang);
}

// Language change → update voice dropdowns
document.getElementById('cfg-my-lang').addEventListener('change', updateVoiceDropdowns);
document.getElementById('cfg-their-lang').addEventListener('change', updateVoiceDropdowns);
document.getElementById('cfg-tts-provider')?.addEventListener('change', () => {
  if (isBrowserTtsProvider()) void loadBrowserVoices().then(updateVoiceDropdowns);
  else updateVoiceDropdowns();
});

// Endpointing slider live update
document.getElementById('cfg-endpointing').addEventListener('input', function() {
  document.getElementById('endpointing-val').textContent = this.value + 'ms';
});

// Test API key
async function testKey(provider, triggerBtn = null) {
  provider = provider || 'codex';
  const inputIds = {
    deepgram: 'cfg-deepgram',
    groq: 'cfg-groq',
    codex: null,
    openrouter: 'cfg-openrouter',
    auto: null,
  };
  const btnIds = {
    deepgram: 'test-deepgram',
    groq: 'test-groq',
    codex: 'test-codex',
    openrouter: 'test-openrouter',
    auto: null,
  };
  const inputId = inputIds[provider];
  const btnId = btnIds[provider];
  const el = inputId ? document.getElementById(inputId) : null;
  const key = el ? (el._getRealValue ? el._getRealValue() : el.value).trim() : '';
  const btn = triggerBtn || (btnId ? document.getElementById(btnId) : null);
  if (!btn) return;

  if (!['codex', 'auto'].includes(provider) && !key) { btn.textContent = 'Empty'; btn.className = 'sp-test-btn fail'; return; }

  const codexModel = (document.getElementById('cfg-codex-model')?.value || 'gpt-5.4').trim();
  const openrouterModel = (document.getElementById('cfg-openrouter-model')?.value || 'openrouter/auto').trim();
  const payload = { provider, key };
  if (provider === 'codex') payload.model = codexModel;
  if (provider === 'openrouter') payload.model = openrouterModel;
  if (provider === 'auto') {
    payload.codex_model = codexModel;
    payload.openrouter_model = openrouterModel;
  }

  btn.textContent = '...';
  btn.className = 'sp-test-btn testing';

  try {
    const r = await fetch('/api/test-key', {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(payload)
    });
    const data = await r.json();
    const okText = ['codex', 'auto'].includes(provider) ? '\u2713 Request ok' : '\u2713 Valid';
    btn.textContent = data.valid ? okText : (data.error && data.error.includes('402') ? 'Billing req.' : '\u2717 Failed');
    btn.className = 'sp-test-btn ' + (data.valid ? 'ok' : 'fail');
    showToast(data.valid ? (data.message || providerLabel(provider) + ' request ok') : (data.error || 'Provider test failed'));
  } catch(e) {
    btn.textContent = 'Error';
    btn.className = 'sp-test-btn fail';
    showToast(e.message || 'Provider test failed');
  }

  setTimeout(() => { btn.textContent = 'Test'; btn.className = 'sp-test-btn'; }, 4000);
}

// Voice preview — synthesize + play through speakers via engine
async function previewVoice(dir) {
  const btn = document.getElementById('preview-' + dir);
  const voiceSelect = document.getElementById('cfg-voice-' + dir);
  const voice = voiceSelect.value;
  if (!voice) { showToast('No voice selected'); return; }
  // Determine language from direction
  const lang = dir === 'out'
    ? document.getElementById('cfg-their-lang').value
    : document.getElementById('cfg-my-lang').value;
  if (isEdgeTtsProvider()) {
    btn.classList.add('loading');
    try {
      await speakWithEdge(edgeVoiceSample(lang), lang, voice, null, true);
    } catch (e) {
      console.warn('Edge voice preview failed:', e);
      showToast(e.message || 'Edge voice preview failed');
    } finally {
      btn.classList.remove('loading');
    }
    return;
  }
  if (isBrowserTtsProvider()) {
    btn.classList.add('loading');
    try {
      await speakWithBrowser(browserVoiceSample(lang), lang, voice, true);
    } catch (e) {
      console.warn('Browser voice preview failed:', e);
      showToast(e.message || 'Browser voice preview failed');
    } finally {
      btn.classList.remove('loading');
    }
    return;
  }
  if (!isVoiceDownloaded(dir)) { showToast('Download the voice first'); return; }
  btn.classList.add('loading');
  try {
    await ensureAudioContext();
    // Drop any stale queued audio so we only play the fresh preview.
    await fetch('/api/poll-audio');

    const r = await fetch('/api/tts-preview', {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ lang, voice })
    });
    const data = await r.json();
    if (data.status && data.status.startsWith('ok')) {
      showToast('Playing preview...');
      let previewItem = null;
      for (let i = 0; i < 80; i++) {
        await sleep(150);
        const poll = await fetch('/api/poll-audio');
        const items = await poll.json();
        previewItem = items.find(item => item.direction === 'preview') || null;
        const rest = items.filter(item => item.direction !== 'preview');
        for (const item of rest) monitorQueue.push(item);
        if (previewItem) break;
      }

      if (!previewItem) {
        showToast('Preview audio not received (check PowerShell log)');
      } else {
        await playAudioItem(previewItem, true);
      }
    } else {
      showToast('Preview failed: ' + (data.status || 'engine not running'));
    }
  } catch(e) {
    showToast('Preview error: engine not running');
  }
  btn.classList.remove('loading');
}

// Load voices into dropdowns
let allVoices = {};
let browserVoicesPromise = null;
let catalogWarningShown = false;
const LANG_NAMES = {
  ar:'Arabic',ca:'Catalan',cs:'Czech',da:'Danish',de:'German',el:'Greek',
  en:'English',es:'Spanish',fa:'Persian',fi:'Finnish',fr:'French',
  hi:'Hindi',hu:'Hungarian',id:'Indonesian',it:'Italian',ja:'Japanese',
  ko:'Korean',lv:'Latvian',nl:'Dutch',no:'Norwegian',pl:'Polish',
  pt:'Portuguese',ro:'Romanian',ru:'Russian',sv:'Swedish',tr:'Turkish',
  uk:'Ukrainian',vi:'Vietnamese',zh:'Chinese'
};
function langName(code) { return LANG_NAMES[code] || code; }

// Re-apply tooltips when my-language changes
document.getElementById('cfg-my-lang')?.addEventListener('change', applyTooltips);

function isBrowserTtsProvider() {
  return (document.getElementById('cfg-tts-provider')?.value || currentSettings.tts_provider || 'piper') === 'browser';
}

function isEdgeTtsProvider() {
  return (document.getElementById('cfg-tts-provider')?.value || currentSettings.tts_provider || 'piper') === 'edge';
}

function isExternalTtsProvider() {
  return isBrowserTtsProvider() || isEdgeTtsProvider();
}

function normalizeBrowserLang(code) {
  const map = { no: 'nb' };
  return (map[code] || code || '').toLowerCase();
}

function browserVoiceMatchesLang(voice, lang) {
  const target = normalizeBrowserLang(lang);
  const actual = String(voice.lang || '').toLowerCase();
  return actual === target || actual.startsWith(target + '-') || target.startsWith(actual + '-');
}

function loadBrowserVoices() {
  if (!('speechSynthesis' in window)) {
    browserVoices = [];
    browserVoicesReady = true;
    return Promise.resolve(browserVoices);
  }
  if (browserVoicesPromise) return browserVoicesPromise;
  browserVoicesPromise = new Promise(resolve => {
    const finish = () => {
      browserVoices = window.speechSynthesis.getVoices() || [];
      browserVoicesReady = true;
      resolve(browserVoices);
    };
    const voices = window.speechSynthesis.getVoices() || [];
    if (voices.length > 0) {
      finish();
      return;
    }
    window.speechSynthesis.onvoiceschanged = () => {
      browserVoicesPromise = null;
      finish();
      if (isBrowserTtsProvider()) updateVoiceDropdowns();
    };
    setTimeout(finish, 1200);
  });
  return browserVoicesPromise;
}

function browserVoiceSample(lang) {
  const code = normalizeBrowserLang(lang);
  if (code === 'ru') return 'Привет. Это тест более живого голоса браузера.';
  if (code === 'en') return 'Hello. This is a test of the browser voice.';
  if (code === 'uk') return 'Привіт. Це тест голосу браузера.';
  return 'Hello. This is a browser voice test.';
}

function edgeVoiceSample(lang) {
  const code = normalizeBrowserLang(lang);
  if (code === 'ru') return 'Привет. Это тест нейронного голоса Microsoft Edge.';
  if (code === 'en') return 'Hello. This is a test of the Microsoft Edge neural voice.';
  if (code === 'uk') return 'Привіт. Це тест нейронного голосу Microsoft Edge.';
  return 'Hello. This is an Edge neural voice test.';
}

function findBrowserVoice(voiceName, lang) {
  if (!browserVoicesReady) browserVoices = window.speechSynthesis?.getVoices?.() || [];
  const voicesForLang = browserVoices.filter(v => browserVoiceMatchesLang(v, lang));
  return (
    browserVoices.find(v => v.name === voiceName) ||
    voicesForLang.find(v => /natural|online|neural/i.test(v.name)) ||
    voicesForLang[0] ||
    browserVoices.find(v => String(v.lang || '').toLowerCase().startsWith(normalizeBrowserLang(lang))) ||
    null
  );
}

async function speakWithBrowser(text, lang, voiceName, force = false) {
  if (!force && (textOnlyMode || !isBrowserTtsProvider())) return;
  if (!('speechSynthesis' in window)) {
    throw new Error('Browser speech synthesis is unavailable');
  }
  await loadBrowserVoices();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang;
  const voice = findBrowserVoice(voiceName, lang);
  if (voice) utterance.voice = voice;
  utterance.rate = 1.0;
  utterance.pitch = 1.0;
  utterance.volume = 1.0;
  browserTtsSpeaking = true;
  return new Promise((resolve, reject) => {
    utterance.onend = () => { browserTtsSpeaking = false; resolve(); };
    utterance.onerror = (e) => {
      browserTtsSpeaking = false;
      reject(new Error(e.error || 'Browser speech failed'));
    };
    window.speechSynthesis.speak(utterance);
  });
}

function speakTranslationWithBrowser(text, direction) {
  if (textOnlyMode || !isBrowserTtsProvider() || !text) return;
  const lang = direction === 'outgoing'
    ? (currentSettings.their_language || document.getElementById('cfg-their-lang').value || 'en')
    : (currentSettings.my_language || document.getElementById('cfg-my-lang').value || 'ru');
  const voiceName = direction === 'outgoing'
    ? document.getElementById('cfg-voice-out')?.value
    : document.getElementById('cfg-voice-in')?.value;
  browserTtsQueue = browserTtsQueue
    .catch(() => {})
    .then(() => withCaptureMuted(direction, () => speakWithBrowser(text, lang, voiceName || '', false)))
    .catch(e => {
      console.warn('Browser TTS failed:', e);
      showToast(e.message || 'Browser TTS failed');
    });
}

async function loadEdgeVoices(lang) {
  const key = normalizeBrowserLang(lang || 'en');
  if (edgeVoicesByLang[key]) return edgeVoicesByLang[key];
  if (edgeVoicesLoading[key]) return edgeVoicesLoading[key];
  edgeVoicesLoading[key] = fetch('/api/edge-voices?lang=' + encodeURIComponent(key))
    .then(async r => {
      const data = await r.json();
      if (!r.ok || data.error) throw new Error(data.error || 'Edge voice list failed');
      edgeVoicesByLang[key] = data;
      return data;
    })
    .finally(() => { delete edgeVoicesLoading[key]; });
  return edgeVoicesLoading[key];
}

function fillEdgeVoiceSelect(selId, lang, currentVal) {
  const sel = document.getElementById(selId);
  const hintId = selId === 'cfg-voice-out' ? 'voice-hint-out' : 'voice-hint-in';
  const hint = document.getElementById(hintId);
  sel.innerHTML = '';
  const loadingOpt = document.createElement('option');
  loadingOpt.value = '';
  loadingOpt.textContent = 'Loading Edge voices...';
  sel.appendChild(loadingOpt);
  hint.textContent = 'Loading Microsoft neural voices...';
  hint.style.color = '';

  loadEdgeVoices(lang).then(data => {
    const voices = data.voices || [];
    sel.innerHTML = '';
    if (voices.length === 0) {
      const opt = document.createElement('option');
      opt.value = data.default || '';
      opt.textContent = data.default || 'No Edge voices for ' + langName(lang);
      sel.appendChild(opt);
      hint.textContent = 'No matching Edge voices found. The default Edge voice will be used if available.';
      return;
    }

    const grp = document.createElement('optgroup');
    grp.label = 'Microsoft Neural voices';
    voices.forEach(v => {
      const opt = document.createElement('option');
      opt.value = v.name;
      opt.textContent = v.label || v.name;
      grp.appendChild(opt);
    });
    sel.appendChild(grp);
    if (currentVal && voices.some(v => v.name === currentVal)) {
      sel.value = currentVal;
    } else if (data.default && voices.some(v => v.name === data.default)) {
      sel.value = data.default;
    }
    hint.textContent = 'Uses Microsoft Edge neural TTS online. Piper is still available if you switch the engine back.';
  }).catch(e => {
    sel.innerHTML = '';
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'Edge voices unavailable';
    sel.appendChild(opt);
    hint.textContent = e.message || 'Edge voices unavailable';
    hint.style.color = 'var(--red)';
  });
}

function base64ToBlobUrl(b64, mime) {
  const raw = atob(b64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  const blob = new Blob([bytes], { type: mime || 'audio/mpeg' });
  return URL.createObjectURL(blob);
}

async function playCompressedAudio(b64, mime) {
  if (textOnlyMode || !b64) return;
  const url = base64ToBlobUrl(b64, mime);
  try {
    const audio = new Audio(url);
    audio.volume = 0.95;
    await audio.play();
    await new Promise(resolve => {
      audio.onended = resolve;
      audio.onerror = resolve;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function withCaptureMuted(direction, fn) {
  // The translated TTS can be picked up by the opposite pipeline too
  // (for example outgoing translation playing through speakers while incoming
  // loopback is active). Temporarily mute both directions and restore only the
  // ones that were not already muted by the user.
  const previous = { ...muteState };
  for (const key of ['outgoing', 'incoming']) {
    if (!previous[key]) {
      try { await sendCmd('mute_' + key); } catch (e) {}
    }
  }
  try {
    return await fn();
  } finally {
    for (const key of ['outgoing', 'incoming']) {
      if (!previous[key]) {
        try { await sendCmd('unmute_' + key); } catch (e) {}
      }
    }
  }
}

async function speakWithEdge(text, lang, voiceName, direction = null, force = false) {
  if (!force && (textOnlyMode || !isEdgeTtsProvider())) return;
  const body = { text, lang, voice: voiceName || '' };
  const run = async () => {
    const r = await fetch('/api/edge-tts', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(body)
    });
    const data = await r.json();
    if (!r.ok || data.error) throw new Error(data.error || 'Edge TTS failed');
    await playCompressedAudio(data.audio_b64, data.mime);
  };
  if (direction && !force) {
    return withCaptureMuted(direction, run);
  }
  return run();
}

function speakTranslationWithEdge(text, direction) {
  if (textOnlyMode || !isEdgeTtsProvider() || !text) return;
  const lang = direction === 'outgoing'
    ? (currentSettings.their_language || document.getElementById('cfg-their-lang').value || 'en')
    : (currentSettings.my_language || document.getElementById('cfg-my-lang').value || 'ru');
  const voiceName = direction === 'outgoing'
    ? document.getElementById('cfg-voice-out')?.value
    : document.getElementById('cfg-voice-in')?.value;
  browserTtsQueue = browserTtsQueue
    .catch(() => {})
    .then(() => speakWithEdge(text, lang, voiceName || '', direction, false))
    .catch(e => {
      console.warn('Edge TTS failed:', e);
      showToast(e.message || 'Edge TTS failed');
    });
}

function speakTranslationWithExternalTts(text, direction) {
  if (isEdgeTtsProvider()) speakTranslationWithEdge(text, direction);
  else if (isBrowserTtsProvider()) speakTranslationWithBrowser(text, direction);
}

async function loadVoices() {
  try {
    const r = await fetch('/api/voices');
    allVoices = await r.json();
    const langs = Object.keys(allVoices);
    const hasCatalogEntries = langs.some(lang =>
      (allVoices[lang] || []).some(v => !v.downloaded || (v.size_mb || 0) > 0 || (v.quality || '') !== '')
    );
    if (!hasCatalogEntries && !catalogWarningShown) {
      catalogWarningShown = true;
      showToast('Voice catalog offline: showing only local voices');
    }
    ensureSavedVoiceVisible('out');
    ensureSavedVoiceVisible('in');
    updateVoiceDropdowns();
  } catch(e) { console.error('Failed to load voices', e); }
}

function ensureSavedVoiceVisible(dir) {
  if (isExternalTtsProvider()) return;
  const lang = dir === 'out'
    ? (currentSettings.their_language || document.getElementById('cfg-their-lang').value || 'en')
    : (currentSettings.my_language || document.getElementById('cfg-my-lang').value || 'ru');
  const voiceName = dir === 'out'
    ? currentSettings.tts_outgoing_voice
    : currentSettings.tts_incoming_voice;

  if (!voiceName) return;
  if (!allVoices[lang]) allVoices[lang] = [];
  if (allVoices[lang].some(v => v.name === voiceName)) return;

  allVoices[lang].unshift({
    name: voiceName,
    downloaded: true,
    size_mb: 0,
    quality: ''
  });
}

function updateVoiceDropdowns() {
  const theirLang = document.getElementById('cfg-their-lang').value;
  const myLang = document.getElementById('cfg-my-lang').value;

  if (isEdgeTtsProvider()) {
    fillEdgeVoiceSelect('cfg-voice-out', theirLang, currentSettings.tts_outgoing_voice);
    fillEdgeVoiceSelect('cfg-voice-in', myLang, currentSettings.tts_incoming_voice);

    document.getElementById('voice-label-in').textContent =
      langName(myLang) + ' Edge Voice (I hear)';
    document.getElementById('voice-label-out').textContent =
      langName(theirLang) + ' Edge Voice (they hear)';

    updateDlButton('in');
    updateDlButton('out');
    return;
  }

  if (isBrowserTtsProvider()) {
    fillBrowserVoiceSelect('cfg-voice-out', theirLang, currentSettings.tts_outgoing_voice);
    fillBrowserVoiceSelect('cfg-voice-in', myLang, currentSettings.tts_incoming_voice);

    document.getElementById('voice-label-in').textContent =
      langName(myLang) + ' Browser Voice (I hear)';
    document.getElementById('voice-label-out').textContent =
      langName(theirLang) + ' Browser Voice (they hear)';

    updateDlButton('in');
    updateDlButton('out');
    const hintOut = document.getElementById('voice-hint-out');
    const hintIn = document.getElementById('voice-hint-in');
    hintOut.textContent = browserVoicesReady
      ? 'Uses your browser/Windows voices. Microsoft Edge often exposes the most natural online voices.'
      : 'Loading browser voices...';
    hintIn.textContent = hintOut.textContent;
    hintOut.style.color = '';
    hintIn.style.color = '';
    return;
  }

  fillVoiceSelect('cfg-voice-out', theirLang, currentSettings.tts_outgoing_voice);
  fillVoiceSelect('cfg-voice-in', myLang, currentSettings.tts_incoming_voice);

  document.getElementById('voice-label-in').textContent =
    langName(myLang) + ' Voice (I hear)';
  document.getElementById('voice-label-out').textContent =
    langName(theirLang) + ' Voice (they hear)';

  updateDlButton('in');
  updateDlButton('out');

  // Show download prompt if no downloaded voices for this language
  const hintOut = document.getElementById('voice-hint-out');
  const hintIn = document.getElementById('voice-hint-in');
  const voicesOut = allVoices[theirLang] || [];
  const voicesIn = allVoices[myLang] || [];
  const hasDownloadedOut = voicesOut.some(v => v.downloaded);
  const hasDownloadedIn = voicesIn.some(v => v.downloaded);

  if (!hasDownloadedOut) showDownloadPrompt(theirLang, 'voice-hint-out');
  else { hintOut.textContent = ''; hintOut.style.color = ''; }
  if (!hasDownloadedIn) showDownloadPrompt(myLang, 'voice-hint-in');
  else { hintIn.textContent = ''; hintIn.style.color = ''; }
}

function fillBrowserVoiceSelect(selId, lang, currentVal) {
  const sel = document.getElementById(selId);
  sel.innerHTML = '';
  const voices = (browserVoices || []).filter(v => browserVoiceMatchesLang(v, lang));
  const source = voices.length ? voices : (browserVoices || []);
  if (source.length === 0) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'No browser voices found';
    sel.appendChild(opt);
    return;
  }

  const grp = document.createElement('optgroup');
  grp.label = voices.length ? 'Browser voices' : 'All browser voices';
  source
    .slice()
    .sort((a, b) => {
      const aNatural = /natural|online|neural/i.test(a.name) ? 0 : 1;
      const bNatural = /natural|online|neural/i.test(b.name) ? 0 : 1;
      return aNatural - bNatural || a.name.localeCompare(b.name);
    })
    .forEach(v => {
      const opt = document.createElement('option');
      opt.value = v.name;
      opt.textContent = v.name + (v.lang ? ' — ' + v.lang : '');
      grp.appendChild(opt);
    });
  sel.appendChild(grp);

  if (currentVal && source.some(v => v.name === currentVal)) {
    sel.value = currentVal;
  } else {
    const preferred = source.find(v => /natural|online|neural/i.test(v.name)) || source[0];
    if (preferred) sel.value = preferred.name;
  }
}

function fillVoiceSelect(selId, lang, currentVal) {
  const sel = document.getElementById(selId);
  sel.innerHTML = '';
  const voices = allVoices[lang] || [];
  if (voices.length === 0) {
    const opt = document.createElement('option');
    opt.value = ''; opt.textContent = 'No voices for ' + langName(lang);
    sel.appendChild(opt);
    return;
  }
  const downloaded = voices.filter(v => v.downloaded);
  const available = voices.filter(v => !v.downloaded);

  if (downloaded.length > 0) {
    const grp = document.createElement('optgroup');
    grp.label = 'Downloaded';
    downloaded.forEach(v => {
      const opt = document.createElement('option');
      opt.value = v.name;
      opt.textContent = v.name.replace(/-/g, ' ');
      grp.appendChild(opt);
    });
    sel.appendChild(grp);
  }
  if (available.length > 0) {
    const grp = document.createElement('optgroup');
    grp.label = 'Available (' + available.length + ')';
    available.forEach(v => {
      const opt = document.createElement('option');
      opt.value = v.name;
      opt.textContent = v.name.replace(/-/g, ' ') + ' \u2014 ' + v.size_mb + ' MB';
      grp.appendChild(opt);
    });
    sel.appendChild(grp);
  }
  if (currentVal && voices.some(v => v.name === currentVal)) sel.value = currentVal;
}

function isVoiceDownloaded(dir) {
  if (isExternalTtsProvider()) return true;
  const sel = document.getElementById('cfg-voice-' + dir);
  const lang = dir === 'out'
    ? document.getElementById('cfg-their-lang').value
    : document.getElementById('cfg-my-lang').value;
  const voices = allVoices[lang] || [];
  const voice = voices.find(v => v.name === sel.value);
  return voice ? voice.downloaded : true;
}

function updateDlButton(dir) {
  const btn = document.getElementById('dl-voice-' + dir);
  const sel = document.getElementById('cfg-voice-' + dir);
  if (isExternalTtsProvider()) {
    btn.classList.add('hidden');
    return;
  }
  if (!sel.value || isVoiceDownloaded(dir)) {
    btn.classList.add('hidden');
  } else {
    btn.classList.remove('hidden');
  }
}

// Update download button when voice selection changes
document.getElementById('cfg-voice-in').addEventListener('change', () => updateDlButton('in'));
document.getElementById('cfg-voice-out').addEventListener('change', () => updateDlButton('out'));

async function downloadSelectedVoice(dir) {
  const sel = document.getElementById('cfg-voice-' + dir);
  const btn = document.getElementById('dl-voice-' + dir);
  const hint = document.getElementById('voice-hint-' + dir);
  const voice = sel.value;
  const lang = dir === 'out'
    ? document.getElementById('cfg-their-lang').value
    : document.getElementById('cfg-my-lang').value;

  if (!voice) return;
  btn.classList.add('loading');
  hint.innerHTML = '<div class="sp-progress"><div class="sp-progress-bar" id="pb-dl-' + dir +
    '"></div><div class="sp-progress-text" id="pt-dl-' + dir + '">Connecting...</div></div>';

  try {
    const resp = await fetch('/api/download-voice', {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ lang, voice })
    });
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() || '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = JSON.parse(line.slice(6));
        if (data.progress !== undefined) {
          const bar = document.getElementById('pb-dl-' + dir);
          const txt = document.getElementById('pt-dl-' + dir);
          if (bar) bar.style.width = data.progress + '%';
          if (txt) txt.textContent = data.progress + '% \u2014 ' + data.mb_done + '/' + data.mb_total + ' MB';
        }
        if (data.done) {
          hint.innerHTML = '<span style="color:var(--green)">Downloaded!</span>';
          setTimeout(() => { hint.textContent = ''; }, 3000);
          await loadVoices();
          sel.value = voice;
          updateDlButton(dir);
        }
        if (data.error) {
          hint.innerHTML = '<span style="color:var(--red)">' + data.error + '</span>';
        }
      }
    }
  } catch(e) {
    hint.innerHTML = '<span style="color:var(--red)">Download failed: ' + e.message + '</span>';
  }
  btn.classList.remove('loading');
}

const PREFERRED_CALL_CAPTURE_DEVICES = [
  'CABLE-A Output (VB-Audio Cable A)',
  'CABLE Output (VB-Audio Virtual Cable)'
];
const PREFERRED_CALL_PLAYBACK_DEVICES = [
  'CABLE-B Input (VB-Audio Cable B)',
  'CABLE Input (VB-Audio Virtual Cable)'
];

function normalizeDeviceName(name) {
  return String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function pickPreferredDevice(devices, current, preferred) {
  if (current && current !== 'default' && devices.includes(current)) return current;

  const normalizedDevices = devices.map(device => ({
    raw: device,
    normalized: normalizeDeviceName(device)
  }));

  for (const wanted of preferred) {
    const normalizedWanted = normalizeDeviceName(wanted);
    const exact = normalizedDevices.find(device => device.normalized === normalizedWanted);
    if (exact) return exact.raw;
  }

  for (const wanted of preferred) {
    const normalizedWanted = normalizeDeviceName(wanted);
    const partial = normalizedDevices.find(device =>
      device.normalized.includes(normalizedWanted) || normalizedWanted.includes(device.normalized)
    );
    if (partial) return partial.raw;
  }

  return current && current === 'default' ? current : 'default';
}

function pickCallCaptureDevice(inputDevices, outputDevices, current) {
  if (isSystemLoopbackDevice(current) && outputDevices.length > 0) return SYSTEM_LOOPBACK_DEVICE;
  if (current && current !== 'default' && inputDevices.includes(current)) return current;

  const preferred = pickPreferredDevice(inputDevices, current, PREFERRED_CALL_CAPTURE_DEVICES);
  if (preferred !== 'default') return preferred;

  if (outputDevices.length > 0) return SYSTEM_LOOPBACK_DEVICE;
  return 'default';
}

// Load audio devices into select dropdowns
async function loadDevices() {
  try {
    const r = await fetch('/api/devices');
    const data = await r.json();
    const inputDevs = (data.input || []).filter(d => !isSystemDefaultDevice(d));
    const outputDevs = (data.output || []).filter(d => !isSystemDefaultDevice(d));
    availableAudioInputs = inputDevs;
    availableAudioOutputs = outputDevs;

    function fillSelect(id, devices, current, options = {}) {
      const sel = document.getElementById(id);
      sel.innerHTML = '';
      // The UI owns the single system-default option; backend lists only real devices.
      const def = document.createElement('option');
      def.value = 'default'; def.textContent = 'System default';
      sel.appendChild(def);
      if (options.includeLoopback) {
        const loopback = document.createElement('option');
        loopback.value = SYSTEM_LOOPBACK_DEVICE;
        loopback.textContent = SYSTEM_LOOPBACK_LABEL;
        sel.appendChild(loopback);
      }
      devices.forEach(d => {
        const opt = document.createElement('option');
        opt.value = d; opt.textContent = d;
        sel.appendChild(opt);
      });
      if (current && current !== 'default') {
        // Add current value if not in list (e.g. device unplugged)
        const knownSpecial = options.includeLoopback && isSystemLoopbackDevice(current);
        if (!devices.includes(current) && !knownSpecial) {
          const opt = document.createElement('option');
          opt.value = current; opt.textContent = current + ' (saved)';
          sel.appendChild(opt);
        }
        sel.value = current;
      }
    }

    const callCaptureDevice = pickCallCaptureDevice(
      inputDevs,
      outputDevs,
      currentSettings.meet_input_device
    );
    const callPlaybackDevice = pickPreferredDevice(
      outputDevs,
      currentSettings.meet_output_device,
      PREFERRED_CALL_PLAYBACK_DEVICES
    );
    currentSettings.meet_input_device = callCaptureDevice;
    currentSettings.meet_output_device = callPlaybackDevice;

    fillSelect('cfg-mic', inputDevs, currentSettings.mic_device);
    fillSelect('cfg-speaker', outputDevs, currentSettings.speaker_device);
    fillSelect('cfg-call-input', outputDevs, callPlaybackDevice);
    fillSelect('cfg-call-output', inputDevs, callCaptureDevice, { includeLoopback: outputDevs.length > 0 });
    updateAudioControlAvailability();
  } catch(e) { console.error('Failed to load devices', e); }
}

// Load settings from server
async function loadSettings() {
  try {
    const r = await fetch('/api/settings');
    currentSettings = await r.json();
    populateForm(currentSettings);
    ensureSavedVoiceVisible('out');
    ensureSavedVoiceVisible('in');
    if (Object.keys(allVoices).length > 0) updateVoiceDropdowns();
  } catch(e) { console.error('Failed to load settings', e); }
}

// Save settings to server
async function saveSettings() {
  const settings = readForm();
  await fetch('/api/settings', {
    method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(settings)
  });
  currentSettings = settings;
}

// ===== Engine Restart =====
function setEnginePill(state, text) {
  const pill = document.getElementById('engine-pill');
  pill.className = 'engine-pill' + (state === 'running' ? '' : ' ' + state);
  document.getElementById('engine-label').textContent = text;
}

async function saveAndRestart() {
  const btn = document.getElementById('restart-btn');
  const txt = document.getElementById('restart-text');
  const bar = document.getElementById('restart-progress');

  btn.classList.add('restarting');
  btn.classList.remove('success', 'error');

  try {
    // Stage 1: Save
    txt.textContent = 'Saving settings...';
    bar.style.width = '15%';
    setEnginePill('restarting', 'Saving...');
    await saveSettings();
    await sleep(300);

    // Stage 2: Restart
    txt.textContent = 'Restarting engine...';
    bar.style.width = '35%';
    setEnginePill('restarting', 'Restarting...');
    await fetch('/api/engine/restart', { method: 'POST' });
    await sleep(500);

    // Stage 3: Wait for models to load
    txt.textContent = 'Loading models...';
    bar.style.width = '60%';
    setEnginePill('restarting', 'Loading...');

    // Poll health
    let attempts = 0;
    while (attempts < 60) {
      await sleep(1000);
      attempts++;
      bar.style.width = Math.min(60 + attempts, 95) + '%';
      try {
        const r = await fetch('/health');
        if (r.ok) break;
      } catch(e) {}
    }

    // Stage 4: Starting pipelines
    txt.textContent = 'Starting pipelines...';
    bar.style.width = '95%';
    await sleep(1000);

    // Done!
    bar.style.width = '100%';
    btn.classList.remove('restarting');
    btn.classList.add('success');
    txt.innerHTML = '&#10003; Ready!';
    await syncEngineState();
    showToast('Engine restarted');

    await sleep(2500);
    btn.classList.remove('success');
    txt.textContent = 'Save & Restart Engine';
    bar.style.width = '0%';

  } catch(e) {
    btn.classList.remove('restarting');
    btn.classList.add('error');
    txt.textContent = 'Error: ' + (e.message || 'restart failed');
    setEnginePill('stopped', 'Error');

    await sleep(3000);
    btn.classList.remove('error');
    txt.textContent = 'Save & Restart Engine';
    bar.style.width = '0%';
  }
}

// ===== Init =====
async function waitForEngine() {
  const overlay = document.getElementById('overlay');
  const text = document.getElementById('overlay-text');
  const spinner = document.getElementById('spinner');
  while (true) {
    try {
      const r = await fetch('/health');
      if (r.ok) {
        text.className = 'ready';
        text.textContent = 'Engine ready';
        spinner.style.display = 'none';
        sessionStart = Date.now();
        await syncEngineState();
        await sleep(600);
        overlay.className = 'hidden';
        engineReady = true;
        maybeAutoStartResumedCall();
        return;
      }
    } catch(e) {}
    await sleep(500);
  }
}

// Boot sequence
(async function boot() {
  // Load settings + voices + devices in parallel
  await Promise.all([loadSettings(), loadVoices(), loadDevices()]);
  await loadDevices();
  updateVoiceDropdowns();
  applyTooltips();
  ['cfg-mic', 'cfg-call-output', 'cfg-call-input'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', updateAudioControlAvailability);
  });
  updateAudioControlAvailability();
  await loadResumedCallFromUrl();

  // Auto-open settings if no API keys configured
  if (!currentSettings.deepgram_api_key && !currentSettings.groq_api_key) {
    openSettings();
  }
  aiSuggestionsOpen = true;
  document.getElementById('btn-suggestions').classList.add('on');
  bootReady = true;
  maybeAutoStartResumedCall();
})();

waitForEngine();

let evtSource = null;
function connectSSE(replay) {
  if (evtSource) evtSource.close();
  const url = replay ? '/stream?replay=1' : '/stream';
  evtSource = new EventSource(url);
  evtSource.onmessage = (e) => processLine(e.data);
  evtSource.onerror = () => { statusEl.textContent = 'Disconnected'; statusEl.className = 'disconnected'; };
  evtSource.onopen = () => { statusEl.textContent = 'Connected'; statusEl.className = ''; };
}
connectSSE();
