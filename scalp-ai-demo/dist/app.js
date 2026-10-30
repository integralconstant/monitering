const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const paths = {
  scan: '<path d="M8 3H4a1 1 0 0 0-1 1v4m13-5h4a1 1 0 0 1 1 1v4M3 16v4a1 1 0 0 0 1 1h4m8 0h4a1 1 0 0 0 1-1v-4M7 12h10M12 7v10"/>',
  report: '<path d="M7 3h7l4 4v14H6V3zM14 3v5h5M9 12h6m-6 4h6"/>',
  chart: '<path d="M4 3v17h17M7 14l4-5 4 3 5-7"/>',
  leaf: '<path d="M20 3C8 2 1 9 6 17c6 5 14-1 14-14zM5 21l10-12"/>',
  spark: '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z"/>',
  arrow: '<path d="M4 12h15m-6-6 6 6-6 6"/>',
  back: '<path d="M20 12H5m6-6-6 6 6 6"/>',
  upload: '<path d="M12 16V3m-5 5 5-5 5 5M4 15v6h16v-6"/>',
  photo: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.5"/><path d="m3 17 6-6 4 4 3-3 5 5"/>',
  camera: '<path d="m8 5 2-2h4l2 2h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"/><circle cx="12" cy="13" r="4"/>',
  drop: '<path d="M12 3C10 7 5 12 5 16a7 7 0 0 0 14 0c0-4-5-9-7-13z"/>',
  flakes: '<path d="m5 6 3-2 2 3-3 2zM14 7l3-3 3 3-3 3zM8 17l4-4 3 4-4 3z"/>',
  hair: '<path d="M6 21C12 12 2 9 9 3m3 18C18 13 8 9 15 3m3 18c5-6-1-10 3-14"/>',
  redness: '<circle cx="12" cy="12" r="8"/><path d="M8 10h.01M15 9h.01M11 15h.01M16 15h.01M7 14h.01"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v6l4 2"/>',
  save: '<path d="M5 3h14v18l-7-4-7 4z"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 4v3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 10h18m-13 5h1m6 0h1"/>'
};
function icon(name) { return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.leaf}</svg>`; }
$$('[data-icon]').forEach(el => { el.outerHTML = icon(el.dataset.icon); });
const METRICS = [
  { id: 'flakes', name: '각질', icon: 'flakes', color: '#be7952', description: '두피 표면의 각질을 살펴봐요.' },
  { id: 'sebum', name: '피지과다', icon: 'drop', color: '#567d79', description: '두피의 피지와 번들거림을 살펴봐요.' },
  { id: 'hair_loss', name: '탈모 여부', icon: 'hair', color: '#7772a2', description: '탈모 관련 특징을 살펴봐요.' },
  { id: 'erythema', name: '모낭사이홍반', icon: 'redness', color: '#b16c78', description: '모낭 사이 두피의 붉은 기를 살펴봐요.' }
];
const STORAGE_KEY = 'scalp-ai-model-records-v2';
const CAN_FETCH = ['http:', 'https:'].includes(location.protocol);
function today() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
const initialDate = today();
const state = {
  step: 1, maxStep: 2, photos: [null, null, null], fileToken: [0, 0, 0], reading: new Map(), working: false,
  result: null, resultPhotos: [], savedId: null, error: '', uploadNote: '', checks: new Set(),
  range: 'month', year: Number(initialDate.slice(0, 4)), month: Number(initialDate.slice(5, 7)) - 1,
  selectedDate: initialDate, startedAt: null, historyInitialized: false,
  health: { status: 'loading', message: '', models: [] }
};
function escapeHTML(value) { return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])); }
function percent(value) { return `${(value * 100).toFixed(1)}%`; }
function metricLabel(metric) { return metric.settings_verified === true ? metric.label : `참고번호 ${metric.class_index}`; }
function validMetric(metric, index) {
  return metric && metric.id === METRICS[index].id && typeof metric.label === 'string' && metric.label.length <= 200
    && typeof metric.settings_verified === 'boolean' && Number.isInteger(metric.class_index)
    && Array.isArray(metric.probabilities) && metric.probabilities.length === (index === 0 ? 4 : 3)
    && metric.class_index >= 0 && metric.class_index < metric.probabilities.length
    && metric.probabilities.every(p => Number.isFinite(p) && p >= 0 && p <= 1)
    && Math.abs(metric.probabilities.reduce((sum, p) => sum + p, 0) - 1) < 0.01
    && Number.isFinite(metric.confidence) && metric.confidence >= 0 && metric.confidence <= 1
    && Math.abs(metric.confidence - metric.probabilities[metric.class_index]) < 0.001
    && metric.confidence >= Math.max(...metric.probabilities) - 0.001
    && Array.isArray(metric.class_labels) && metric.class_labels.length === metric.probabilities.length
    && metric.class_labels.every(label => typeof label === 'string' && label.length <= 200);
}
function validMetrics(metrics) { return Array.isArray(metrics) && metrics.length === 4 && metrics.every(validMetric); }
function validDate(date) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}
function validRecord(record) {
  return record && typeof record.id === 'string' && record.id.length <= 200 && record.source === 'model'
    && validDate(record.date) && Number.isInteger(record.photo_count) && record.photo_count >= 1 && record.photo_count <= 3
    && record.aggregation === 'mean_probabilities' && typeof record.settings_verified === 'boolean'
    && typeof record.configuration_id === 'string' && record.configuration_id.length <= 300
    && Number.isFinite(record.elapsed_ms) && record.elapsed_ms >= 0
    && Array.isArray(record.warnings) && record.warnings.every(w => typeof w === 'string' && w.length <= 2000)
    && validMetrics(record.metrics) && Array.isArray(record.per_photo) && record.per_photo.length === record.photo_count
    && record.per_photo.every((photo, index) => photo && photo.index === index && validMetrics(photo.metrics));
}
function readRecords() {
  try {
    const records = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(records) ? records.filter(validRecord).sort((a, b) => a.date.localeCompare(b.date)) : [];
  } catch { return []; }
}
function storedMetric(metric) {
  return { id: metric.id, label: metric.label, class_index: metric.class_index, confidence: metric.confidence,
    probabilities: [...metric.probabilities], class_labels: [...metric.class_labels], settings_verified: metric.settings_verified };
}
function storedRecord(result) {
  return { id: result.id, date: result.date, source: 'model', photo_count: result.photo_count,
    aggregation: result.aggregation, settings_verified: result.settings_verified, warnings: [...result.warnings],
    metrics: result.metrics.map(storedMetric), per_photo: result.per_photo.map(photo => ({ index: photo.index, metrics: photo.metrics.map(storedMetric) })),
    elapsed_ms: result.elapsed_ms, configuration_id: result.configuration_id };
}
function toast(message) { const el = $('#toast'); el.textContent = message; el.classList.add('visible'); clearTimeout(toast.timeout); toast.timeout = setTimeout(() => el.classList.remove('visible'), 4500); }
function button(text, action, secondary = false, name = 'arrow', disabled = false) { return `<button class="button ${secondary ? 'secondary' : ''}" data-action="${action}" ${disabled ? 'disabled' : ''}>${text}${icon(name)}</button>`; }
function intro(kicker, title, description) { return `<header class="page-intro"><span class="kicker">${kicker}</span><h1 tabindex="-1">${title}</h1><p>${description}</p></header>`; }
function emptyState(title, text) { return `<section class="surface empty-state">${icon('photo')}<h2>${title}</h2><p>${text}</p>${button('첫 사진 분석하러 가기', 'start')}</section>`; }
function shortDate(date) { const [y, m, d] = date.split('-').map(Number); return `${y}년 ${m}월 ${d}일`; }
function photoCount() { return state.photos.filter(Boolean).length; }
function guideDrawing() {
  return `<svg viewBox="0 0 340 236" role="img" aria-label="가르마를 나눠 두피가 보이게 촬영하는 방법을 표현한 그림"><rect x="14" y="8" width="312" height="220" rx="26" fill="#f3ede5"/><circle cx="170" cy="120" r="85" fill="#d8b79a"/><path d="M87 148C68 70 118 30 166 34c-23 33-50 62-79 114Z" fill="#39474b"/><path d="M173 34c61-3 102 54 78 119-35-24-58-70-78-119Z" fill="#39474b"/><path d="M169 48c-7 38-9 77-3 123" stroke="#f9e3cf" stroke-width="12" fill="none" stroke-linecap="round"/><path d="M150 53c-18 27-30 55-40 84M139 48c-20 20-37 48-43 64M189 54c21 26 34 54 43 82M202 51c17 18 32 41 39 61" stroke="#657174" stroke-width="3" fill="none" stroke-linecap="round"/><rect x="121" y="76" width="98" height="99" rx="19" fill="none" stroke="#dc7555" stroke-width="2" stroke-dasharray="5 5"/><path d="M42 65V41h25m207 0h25v24M42 171v24h25m207 0h25v-24" stroke="#c2b5a4" stroke-width="3" fill="none" stroke-linecap="round"/><circle cx="170" cy="124" r="12" fill="none" stroke="#dc7555" stroke-width="2"/><path d="M170 106v8m0 20v8m-18-18h8m20 0h8" stroke="#dc7555" stroke-width="2"/></svg>`;
}
function journey() {
  const names = ['사진 준비', '사진 선택', '확인 후 분석'];
  return `<nav class="journey" aria-label="분석 진행 단계"><ol>${names.map((name, i) => `<li class="${state.step === i + 1 ? 'is-current' : state.step > i + 1 ? 'is-complete' : ''}" ${state.step === i + 1 ? 'aria-current="step"' : ''}><button data-step="${i + 1}" ${state.working || i + 1 > state.maxStep || (i === 2 && !photoCount()) ? 'disabled' : ''}><span class="step-number">${state.step > i + 1 ? icon('check') : i + 1}</span><span>${name}</span></button></li>`).join('')}</ol></nav>`;
}
function serviceStatus() {
  if (!CAN_FETCH) return `<div class="status-panel error server-notice"><strong>분석 페이지로 이동해 주세요.</strong><p>아래 주소에서 열면 사진을 분석할 수 있어요.</p><a class="button secondary" href="http://127.0.0.1:8000">분석 페이지 열기${icon('arrow')}</a><details class="help-details"><summary>페이지가 열리지 않나요?</summary><p>프로젝트 폴더의 <code>start.cmd</code>를 실행한 다음 다시 열어 주세요.</p></details></div>`;
  if (state.health.status === 'ready') return '';
  return `<div class="status-panel ${state.health.status}" role="status"><span class="status-indicator" aria-hidden="true"></span><div><strong>${state.health.status === 'loading' ? '분석할 준비를 하고 있어요' : '분석 서비스에 연결하지 못했어요'}</strong><p>${state.health.status === 'loading' ? '사진은 먼저 골라 두셔도 좋아요. 준비가 끝나면 분석 버튼이 활성화돼요.' : '선택한 사진은 그대로 유지돼요. 잠시 후 다시 연결해 주세요.'}</p>${state.health.status === 'error' ? button('다시 연결하기', 'health', true, 'arrow') : ''}${state.health.status === 'error' ? '<details class="help-details"><summary>계속 연결되지 않나요?</summary><p>실행 중인 분석 창을 확인해 주세요. 이 PC에서는 프로젝트 폴더의 start.cmd로 다시 실행할 수 있어요.</p></details>' : ''}</div></div>`;
}
function expectationNote() {
  const verified = state.health.settings_verified === true;
  return verified ? '' : '<div class="guide-callout"><strong>시작하기 전에 알아두세요</strong><p>지금은 사진을 분류한 참고번호를 제공해요. 정상·중증이나 탈모 유무 판정은 아직 제공하지 않아요.</p></div>';
}
function helper() {
  return `<aside class="helper-card"><p class="section-kicker">한 장으로 시작해도 괜찮아요</p><h2 class="helper-title">어떤 부분을 살펴보나요?</h2><p>사진 한 장에서 네 가지 항목을 각각 살펴봐요.</p><div class="metric-preview">${METRICS.map(m => `<div class="metric-preview-item"><span class="metric-preview-icon">${icon(m.icon)}</span><div><strong>${m.name}</strong><p>${m.description}</p></div></div>`).join('')}</div><div class="helper-list"><p>${icon('check')} 사진 1장부터, 최대 3장까지</p><p>${icon('lock')} 사진은 분석에만 사용해요</p></div><a class="text-button" href="#care">촬영 방법 자세히 보기 ${icon('arrow')}</a></aside>`;
}
function preparation() {
  return `<section class="surface"><div class="surface-heading"><span class="section-number">01</span><div><p class="section-kicker">사진 준비하기</p><h2 data-step-title tabindex="-1">두피가 잘 보이는 사진이 있나요?</h2><p>처음이라도 괜찮아요. 아래 세 가지만 확인해 주세요.</p></div></div><div class="guide-preview"><div class="guide-visual">${guideDrawing()}<span>가르마 사이 두피가 보이도록 촬영해 주세요.</span></div><div class="photo-tips"><ol><li><span class="tip-number">1</span><div><strong>모발을 살짝 나눠 주세요</strong><p>머리카락보다 두피가 잘 보이게 준비해요.</p></div></li><li><span class="tip-number">2</span><div><strong>밝은 곳에서 초점을 맞춰요</strong><p>반사나 흔들림이 적은 사진을 골라 주세요.</p></div></li><li><span class="tip-number">3</span><div><strong>여러 장이면 같은 부위로</strong><p>추가 사진은 선택사항이에요. 한 장이면 시작할 수 있어요.</p></div></li></ol></div></div>${expectationNote()}<div class="flow-actions"><span class="privacy-note">${icon('photo')} 준비된 사진 1장만 있으면 돼요.</span>${button('사진 고르러 가기', 'next')}</div></section>`;
}
function photoSlots() {
  return state.photos.map((photo, i) => `<div class="upload-slot ${photo ? 'filled' : 'empty'}" data-slot="${i}"><label for="photo-${i}">${photo ? `<img src="${photo.url}" alt="선택한 두피 사진 ${i + 1}"><span class="slot-caption">사진 ${i + 1}</span>` : `${icon('plus')}<strong>${photoCount() ? '사진 추가' : '사진 선택'}</strong><span>${i ? '선택사항' : '한 장으로 시작해요'}</span>`}</label><input type="file" id="photo-${i}" data-file="${i}" accept="image/jpeg,image/png,image/webp" aria-label="두피 사진 ${i + 1} 선택" aria-describedby="upload-formats" ${state.working ? 'disabled' : ''}>${photo ? `<button class="slot-remove" data-remove="${i}" aria-label="사진 ${i + 1} 제거">×</button>` : ''}</div>`).join('');
}
function uploadFeedback() {
  return `<p class="inline-notice error" id="upload-error" role="alert" ${state.error ? '' : 'hidden'}>${escapeHTML(state.error)}</p><p class="upload-summary" role="status">${state.reading.size ? '사진을 확인하고 있어요. 잠시만 기다려 주세요.' : state.uploadNote ? escapeHTML(state.uploadNote) : photoCount() ? state.step === 3 ? `선택한 사진 ${photoCount()}장으로 분석해요.` : `사진 ${photoCount()}장을 골랐어요. 준비됐다면 다음으로 넘어가 주세요.` : '사진을 고르면 이곳에 미리보기가 나타나요.'}</p>`;
}
function selection() {
  return `<section class="surface" id="photo-upload"><div class="surface-heading"><span class="section-number">02</span><div><p class="section-kicker">사진 고르기</p><h2 data-step-title tabindex="-1">분석할 사진을 골라 주세요</h2><p>한 장만 골라도 좋아요. 같은 부위 사진을 최대 세 장까지 추가할 수 있어요.</p></div></div><div class="drop-zone" data-drop><span class="drop-icon">${icon('upload')}</span><strong>여기에 사진을 놓아 주세요</strong><p>또는 버튼을 눌러 내 기기에서 골라 주세요.</p><button class="button secondary upload-link" data-action="select-photos">사진 고르기${icon('photo')}</button><input class="sr-only" type="file" id="photos-bulk" data-bulk multiple accept="image/jpeg,image/png,image/webp" aria-label="두피 사진 여러 장 선택" aria-describedby="upload-formats"><p class="upload-formats" id="upload-formats">JPG · PNG · WEBP / 한 장에 10MB, 2,000만 화소 이하</p></div><div class="upload-grid">${photoSlots()}</div>${uploadFeedback()}<p class="privacy-note">${icon('lock')} 아직 사진을 전송하지 않았어요. 다음 단계에서 확인한 뒤 분석해요.</p><div class="flow-actions">${button('촬영 안내 다시 보기', 'back', true, 'back')}${button('선택한 사진 확인하기', 'next', false, 'arrow', !photoCount() || !!state.reading.size)}</div></section>`;
}
function review() {
  const photos = state.photos.filter(Boolean);
  return `<section class="surface"><div class="surface-heading"><span class="section-number">03</span><div><p class="section-kicker">마지막으로 확인하기</p><h2 data-step-title tabindex="-1">이 사진으로 분석할까요?</h2><p>두피가 선명하게 보이는지 한 번 더 살펴봐 주세요.</p></div></div><div class="review-grid">${photos.map((photo, i) => `<figure class="review-item"><img src="${photo.url}" alt="분석할 사진 ${i + 1}"><figcaption>사진 ${i + 1}</figcaption></figure>`).join('')}</div><div class="photo-checklist"><strong>이렇게 보이면 준비 완료예요</strong><p>${icon('check')} 가르마 사이의 두피가 잘 보여요.</p><p>${icon('check')} 흔들림과 빛 반사가 적어요.</p>${photos.length > 1 ? `<p>${icon('check')} ${photos.length}장 모두 같은 두피 부위를 촬영했어요.</p>` : ''}</div>${expectationNote()}<p class="privacy-note">${icon('lock')} 분석 버튼을 누르면 사진을 분석 서비스로 보내요. 사진은 저장하지 않으며 결과만 내 기록에 남길 수 있어요.</p>${uploadFeedback()}${serviceStatus()}<div class="flow-actions">${button('사진 다시 고르기', 'back', true, 'back')}${button(state.error ? '같은 사진으로 다시 분석하기' : `사진 ${photos.length}장 분석하기`, 'analyze', false, 'spark', !photos.length || !!state.reading.size || state.health.status !== 'ready' || !CAN_FETCH)}</div></section>`;
}
function loading() {
  return `<section class="surface loading-panel" aria-busy="true"><div class="loading-orbit" aria-hidden="true">${icon('spark')}</div><span class="section-kicker">조금만 기다려 주세요</span><h2 data-step-title tabindex="-1">사진을 꼼꼼히 살펴보고 있어요</h2><p role="status">사진을 전송하고 네 가지 항목을 분석하고 있어요.<br>분석이 끝나면 결과 화면으로 자동으로 이동해요.</p><div class="analysis-live"><span class="status-indicator" aria-hidden="true"></span>분석 진행 중 <span class="elapsed-label" data-elapsed></span></div><p class="privacy-note">사진 수와 기기 환경에 따라 시간이 조금 더 걸릴 수 있어요.<br>이 페이지를 열어 둔 채 잠시만 기다려 주세요.</p></section>`;
}
function analysis() {
  return `${intro('나를 알아가는 작은 시작', '두피 사진, 차근차근 시작해요.', '사진 준비부터 결과 확인까지 하나씩 안내해 드릴게요.')}${journey()}<div class="analysis-layout"><div>${state.working ? loading() : [preparation, selection, review][state.step - 1]()}${state.step !== 3 && !state.working ? serviceStatus() : ''}</div>${helper()}</div>`;
}
function metricCards(result) {
  return METRICS.map((definition, index) => {
    const metric = result.metrics[index];
    return `<article class="metric"><div class="metric-header"><span class="metric-icon">${icon(definition.icon)}</span><h2>${definition.name}</h2></div><div class="metric-value">${escapeHTML(metricLabel(metric))}</div><p class="metric-description">${definition.description}</p></article>`;
  }).join('');
}
function resultExplanation(result) {
  return `<section class="result-explanation ${result.settings_verified ? '' : 'inline-notice warning'}"><div>${icon(result.settings_verified ? 'report' : 'leaf')}</div><div><h2>${result.settings_verified ? '이렇게 읽어 주세요' : '참고번호, 어떻게 읽으면 되나요?'}</h2><p>${result.settings_verified ? '사진에 나타난 특징을 분석한 결과예요. 의료 진단을 대신하지는 않아요.' : 'AI가 사진을 분류한 번호예요. 숫자가 높다고 증상이 심한 것은 아니에요. 아직 분류별 의미를 확인하는 중이라 정상·중증이나 탈모 유무를 판단할 수는 없어요.'}</p></div></section>`;
}
function analysisDetails(result) {
  return `<details class="details-panel" data-details="analysis"><summary><span>분석 수치 자세히 보기</span><span>항목별 점수와 사진별 결과</span></summary><div class="details-content"><p class="metric-note">점수는 AI가 각 분류에 부여한 값이에요. 실제 질환 확률이나 분석 정확도를 뜻하지 않아요.</p><div class="detail-metrics">${METRICS.map((definition, i) => { const m = result.metrics[i]; return `<section><h3>${definition.name}</h3><div class="model-score">선택된 분류의 모델 점수 <b>${percent(m.confidence)}</b></div><div class="probability-list">${m.probabilities.map((p, j) => `<div class="probability-row"><span>${escapeHTML(m.settings_verified ? m.class_labels[j] : `참고번호 ${j}`)}</span><div class="probability-track"><i style="width:${p * 100}%"></i></div><span>${percent(p)}</span></div>`).join('')}</div></section>`; }).join('')}</div><section class="photo-results"><h3>사진별 결과</h3><div class="table-scroll" tabindex="0" role="region" aria-label="사진별 분석 결과 표"><table><thead><tr><th scope="col">사진</th>${METRICS.map(m => `<th scope="col">${m.name}</th>`).join('')}</tr></thead><tbody>${result.per_photo.map((photo, index) => `<tr><th scope="row">${state.resultPhotos[index] ? `<img class="result-thumbnail" src="${state.resultPhotos[index]}" alt="분석한 사진 ${index + 1}">` : ''}<span>사진 ${index + 1}</span></th>${photo.metrics.map(m => `<td><strong>${escapeHTML(metricLabel(m))}</strong><small>${percent(m.confidence)}</small></td>`).join('')}</tr>`).join('')}</tbody></table></div><p class="metric-note">여러 장을 분석했다면 각 분류의 점수를 평균한 뒤 가장 높은 분류를 선택해요.</p></section>${result.warnings.length ? `<details class="help-details"><summary>현재 분석 설정 안내</summary>${result.warnings.map(w => `<p>${escapeHTML(w)}</p>`).join('')}</details>` : ''}</div></details>`;
}
function report() {
  const result = state.result;
  if (!result) return `${intro('분석 결과', '아직 분석한 사진이 없어요.', '사진 한 장을 준비하면 네 가지 항목을 살펴볼 수 있어요.')}${emptyState('첫 기록을 시작해 볼까요?', '사진 준비부터 하나씩 안내해 드릴게요. 이전 결과는 내 기록에서 다시 볼 수 있어요.')}`;
  return `${intro(state.savedId ? '저장한 두피 기록' : '사진 분석 완료', '오늘의 두피 기록이 준비됐어요.', '네 가지 항목을 살펴보고, 결과를 저장해 다음 기록과 함께 보세요.')}<section class="report-overview"><div class="result-meta">${icon('calendar')} ${shortDate(result.date)}<span>사진 ${result.photo_count}장 분석</span></div><span class="result-tag">${state.savedId ? '저장된 기록' : '새로운 기록'}</span></section>${resultExplanation(result)}<section class="metrics" aria-label="네 가지 분석 결과">${metricCards(result)}</section><section class="surface next-step"><div><span class="section-kicker">이 결과를 다음에도 보고 싶다면</span><h2>${state.savedId ? '내 기록에 잘 보관했어요' : '오늘의 결과를 기록해 두세요'}</h2><p>${state.savedId ? '같은 브라우저의 내 기록에서 언제든 다시 볼 수 있어요.' : '이 브라우저에 결과만 저장해요. 사진은 저장하지 않아요.'}</p></div>${state.savedId ? '<a class="button" href="#history">내 기록 보러 가기' + icon('arrow') + '</a>' : button('오늘의 결과 저장하기', 'save', false, 'save')}</section>${analysisDetails(result)}<div class="bottom-actions">${button('결과 인쇄하기', 'print', true, 'report')}${button('다른 사진 분석하기', 'new', true, 'photo')}</div>`;
}
function graphRecords(range) {
  const records = readRecords();
  const configuration = state.result?.configuration_id || records.at(-1)?.configuration_id;
  const month = `${state.year}-${String(state.month + 1).padStart(2, '0')}`;
  const anchor = new Date(`${today()}T12:00:00Z`); anchor.setUTCDate(anchor.getUTCDate() - 6);
  const from = anchor.toISOString().slice(0, 10);
  return records.filter(r => r.configuration_id === configuration && (range === 'week' ? r.date >= from && r.date <= today() : r.date.startsWith(month)));
}
function legend() { return `<div class="chart-legend">${METRICS.map(m => `<span><i style="background:${m.color}"></i>${m.name}</span>`).join('')}</div>`; }
function lineChart(range) {
  const records = graphRecords(range);
  if (!records.length) return '<p class="chart-empty">선택한 기간에 비교할 수 있는 기록이 없어요. 다른 달이나 최근 1주를 선택해 보세요.</p>';
  const days = [...new Set(records.map(r => r.date))];
  const start = Date.parse(`${days[0]}T00:00:00Z`), span = Date.parse(`${days.at(-1)}T00:00:00Z`) - start;
  const xFor = date => span ? 65 + (Date.parse(`${date}T00:00:00Z`) - start) / span * 415 : 270;
  const points = records.map(record => ({ x: xFor(record.date), record }));
  const lines = METRICS.map((m, i) => `<polyline points="${points.map(p => `${p.x},${140 - p.record.metrics[i].confidence * 110}`).join(' ')}" stroke="${m.color}" stroke-width="2" fill="none"/>${points.map(p => `<circle cx="${p.x}" cy="${140 - p.record.metrics[i].confidence * 110}" r="4" fill="white" stroke="${m.color}" stroke-width="2"><title>${p.record.date} ${m.name} ${escapeHTML(metricLabel(p.record.metrics[i]))} ${percent(p.record.metrics[i].confidence)}</title></circle>`).join('')}`).join('');
  const labels = days.filter((_, i) => !i || i === days.length - 1 || i % Math.ceil(days.length / 5) === 0);
  return `<svg class="chart" viewBox="0 0 520 180" role="img" aria-label="기록별 모델 점수 그래프. 점수는 증상의 정도를 뜻하지 않습니다."><path d="M56 30H495M56 85H495M56 140H495" stroke="#dddeda" stroke-dasharray="3 4" fill="none"/><text x="8" y="34">100%</text><text x="17" y="89">50%</text><text x="23" y="144">0%</text>${lines}${labels.map(d => `<text x="${xFor(d)}" y="169" text-anchor="middle">${d.slice(5).replace('-', '.')}</text>`).join('')}</svg>`;
}
function calendar() {
  const first = new Date(state.year, state.month, 1).getDay(), days = new Date(state.year, state.month + 1, 0).getDate();
  const dates = new Set(readRecords().map(r => r.date));
  return `<div class="calendar-header"><h2>${state.year}년 ${state.month + 1}월</h2><div><button data-action="prev-month" aria-label="이전 달">${icon('back')}</button><button data-action="next-month" aria-label="다음 달">${icon('arrow')}</button></div></div><div class="calendar">${['일', '월', '화', '수', '목', '금', '토'].map(d => `<span class="day-label">${d}</span>`).join('')}${'<span></span>'.repeat(first)}${Array.from({ length: days }, (_, i) => { const date = `${state.year}-${String(state.month + 1).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`; return `<button ${dates.has(date) ? `data-date="${date}"` : 'disabled'} class="${dates.has(date) ? 'record' : ''} ${date === state.selectedDate ? 'chosen' : ''}" aria-label="${shortDate(date)} ${dates.has(date) ? '기록 보기' : '기록 없음'}" aria-pressed="${date === state.selectedDate}">${i + 1}</button>`; }).join('')}</div><p class="calendar-note">점이 표시된 날짜에 저장한 기록이 있어요.</p>`;
}
function history() {
  const records = readRecords();
  if (records.length && !state.historyInitialized) {
    state.selectedDate = records.at(-1).date; state.year = Number(state.selectedDate.slice(0, 4)); state.month = Number(state.selectedDate.slice(5, 7)) - 1; state.historyInitialized = true;
  }
  const selected = records.filter(r => r.date === state.selectedDate);
  const header = intro('차곡차곡 쌓이는 나의 기록', '다시 보고 싶은 순간을 모았어요.', '날짜를 선택하면 그날 저장한 결과를 다시 볼 수 있어요.');
  if (!records.length) return `${header}${emptyState('아직 저장한 기록이 없어요', '사진 분석을 마친 뒤 ‘오늘의 결과 저장하기’를 눌러 주세요. 이 브라우저에서 다시 볼 수 있어요.')}`;
  return `${header}<div class="history-stats"><div class="stat-item"><span>저장한 기록</span><strong>${records.length}<small>회</small></strong></div><div class="stat-item"><span>살펴본 사진</span><strong>${records.reduce((sum, r) => sum + r.photo_count, 0)}<small>장</small></strong></div><div class="stat-item"><span>가장 최근 기록</span><strong>${records.at(-1).date.slice(5).replace('-', '.')}</strong></div></div><div class="history-layout"><section class="surface">${calendar()}</section><section class="surface history-list"><div class="surface-heading"><div><p class="section-kicker">선택한 날짜</p><h2>${shortDate(state.selectedDate)}</h2></div></div>${selected.map(r => `<article class="history-record"><div class="record-date"><strong>두피 사진 분석</strong><span>사진 ${r.photo_count}장</span></div><div class="record-metrics">${r.metrics.map((m, i) => `<span>${METRICS[i].name}<strong>${escapeHTML(metricLabel(m))}</strong></span>`).join('')}</div><div class="record-actions"><button class="button secondary" data-record="${escapeHTML(r.id)}">결과 다시 보기${icon('arrow')}</button></div></article>`).join('') || '<div class="empty-state"><h3>이날은 저장한 기록이 없어요</h3><p>달력에서 점이 표시된 날짜를 선택해 주세요.</p></div>'}</section></div><details class="details-panel" data-details="history-chart"><summary><span>분석 수치의 변화 살펴보기</span><span>저장한 결과의 모델 점수</span></summary><div class="details-content"><p class="chart-footnote">같은 분석 설정으로 저장한 기록만 비교해요. 이 점수의 변화는 두피 상태의 호전·악화를 뜻하지 않아요.</p><div class="tabs" aria-label="그래프 기간"><button data-range="week" class="${state.range === 'week' ? 'selected' : ''}" aria-pressed="${state.range === 'week'}">최근 1주</button><button data-range="month" class="${state.range === 'month' ? 'selected' : ''}" aria-pressed="${state.range === 'month'}">선택한 달</button></div>${legend()}${lineChart(state.range)}</div></details><div class="bottom-actions"><p class="save-note">이 브라우저에 결과만 보관해요. 사진은 저장하지 않아요.</p><button class="text-button" data-action="clear-records">저장한 기록 모두 삭제</button></div>`;
}
function care() {
  const tips = [
    ['두피가 보이도록', '가르마를 살짝 나눠 주세요', '머리카락만 가득한 사진보다 모발 사이 두피가 잘 드러나는 사진을 준비해요.', 'hair'],
    ['선명하게 보이도록', '밝기와 초점을 확인해요', '조명이 너무 어둡거나 빛이 반사되지 않는지 살펴봐 주세요. 흔들렸다면 다시 촬영해요.', 'scan'],
    ['다음 기록과 비교하도록', '같은 부위를 촬영해요', '같은 부위와 비슷한 조명에서 촬영하면 지난 사진과 함께 돌아보기 좋아요. 추가 사진은 최대 두 장까지예요.', 'calendar']
  ];
  return `${intro('사진 한 장을 위한 작은 도움', '이렇게 찍으면 준비 끝이에요.', '어렵게 생각하지 마세요. 두피가 선명하게 보이는 사진이면 좋아요.')}<div class="guide-cards">${tips.map((t, i) => `<article class="surface guide-card"><div class="guide-example">${icon(t[3])}<span class="guide-number">0${i + 1}</span></div><p class="section-kicker">${t[0]}</p><h2>${t[1]}</h2><p>${t[2]}</p></article>`).join('')}</div><section class="surface care-checklist"><div class="surface-heading"><div><p class="section-kicker">촬영 전 마지막 확인</p><h2>하나씩 확인해 볼까요?</h2></div><span class="check-count">${state.checks.size} / 3 확인</span></div>${['두피가 잘 보이도록 모발을 나눴어요.', '흔들림과 빛 반사 없이 선명하게 보여요.', '여러 장이면 같은 부위를 촬영했어요.'].map((text, i) => `<label class="task"><input type="checkbox" data-check="${i}" ${state.checks.has(i) ? 'checked' : ''}><span>${text}</span></label>`).join('')}<div class="flow-actions"><p class="save-note">확인 표시는 이 페이지를 사용하는 동안 유지돼요.</p>${button('준비한 사진 고르기', 'start')}</div></section>`;
}
function about() {
  return `${intro('서비스 소개', '사진에서 시작하는 두피 기록.', '딥러닝 기반 ai 두피 관리 서비스')}<section class="surface about-hero"><h2>내 두피를 살펴보는 시간을<br>조금 더 쉽게 만들고 싶었어요.</h2><p>사진 한 장으로 각질, 피지과다, 탈모 여부, 모낭사이홍반의 네 가지 항목을 살펴보고 결과를 기록하는 서비스예요.</p><p>현재는 사진의 특징을 분류한 참고번호를 제공해요. 분류별 의미를 확인한 뒤 더 이해하기 쉬운 결과를 제공할 예정이에요.</p><div class="about-credits"><div><span>만든 곳</span><strong>대림대학교 · 지공모</strong></div><div><span>팀원</span><strong>연일 · 이승철 · 김진형</strong></div><div><span>지도교수</span><strong>김영실 · 박상윤</strong></div></div></section>`;
}
function currentPage() { const route = location.hash.slice(1) || 'analysis'; return ['analysis', 'report', 'history', 'care', 'about'].includes(route) ? route : 'analysis'; }
function focusContent(selector = 'h1') { requestAnimationFrame(() => $('#main').querySelector(selector)?.focus({ preventScroll: true })); }
function render(focus = false) {
  const page = currentPage();
  // Keep expanded details and keyboard focus when only asynchronous status changes.
  const opened = $$('details[open][data-details]').map(el => el.dataset.details);
  const focused = document.activeElement;
  const focusId = focused?.id;
  const focusAction = focused?.dataset?.action;
  const scrollY = window.scrollY;
  $$('[data-nav]').forEach(link => { const active = link.dataset.nav === page || (page === 'report' && link.dataset.nav === 'analysis'); link.classList.toggle('active', active); if (active) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current'); });
  $('#main').innerHTML = ({ analysis, report, history, care, about })[page]();
  opened.forEach(key => { const details = $$('details[data-details]').find(el => el.dataset.details === key); if (details) details.open = true; });
  document.title = `${{ analysis: '사진 분석', report: '분석 결과', history: '내 기록', care: '촬영 가이드', about: '서비스 소개' }[page]} | 딥러닝 기반 ai 두피 관리 서비스`;
  $('#server-status').textContent = !CAN_FETCH ? 'AI 서버에서 열기' : state.health.status === 'ready' ? 'AI 모델 연결됨' : state.health.status === 'loading' ? 'AI 모델 준비 중' : 'AI 서버 연결 필요';
  $('#server-dot').dataset.status = state.health.status;
  if (focus) focusContent(page === 'analysis' ? '[data-step-title]' : 'h1');
  else {
    const target = (focusId && document.getElementById(focusId)) || (focusAction && $$('[data-action]').find(el => el.dataset.action === focusAction));
    if (target && !target.disabled) target.focus({ preventScroll: true });
    window.scrollTo({ top: scrollY, behavior: 'instant' });
  }
  updateElapsed();
}
function go(page) { if (location.hash === `#${page}`) { render(true); window.scrollTo({ top: 0, behavior: 'instant' }); } else location.hash = page; }
function setStep(step) {
  if (state.working || state.reading.size || step < 1 || step > 3 || (step === 3 && !photoCount())) return;
  state.step = step; state.maxStep = Math.max(state.maxStep, step); state.uploadNote = ''; render(true);
  window.scrollTo({ top: 0, behavior: 'instant' });
}
function invalidateResult() { state.result = null; state.resultPhotos = []; state.savedId = null; }
function releasePhoto(index) { if (state.photos[index]?.url) URL.revokeObjectURL(state.photos[index].url); state.photos[index] = null; state.fileToken[index]++; }
async function readPhoto(file, index) {
  if (!file || state.working) return false;
  const fail = message => { state.error = message; render(); return false; };
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return fail('이 형식의 사진은 열 수 없어요. JPG, PNG 또는 WEBP 사진으로 다시 골라 주세요.');
  if (!file.size || file.size > 10 * 1024 * 1024) return fail('사진 한 장은 10MB 이하여야 해요. 파일 크기를 줄이거나 다른 사진을 골라 주세요.');
  const token = ++state.fileToken[index], url = URL.createObjectURL(file), image = new Image();
  state.reading.set(index, token); render();
  let accepted = false;
  try {
    await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = url; });
    if (state.fileToken[index] !== token) { URL.revokeObjectURL(url); return false; }
    if (image.width * image.height > 20_000_000) { URL.revokeObjectURL(url); return fail('사진 해상도가 너무 커요. 2,000만 화소 이하로 줄이거나 다른 사진을 골라 주세요.'); }
    releasePhoto(index); state.photos[index] = { url, file }; state.maxStep = 3; invalidateResult(); accepted = true;
  } catch { URL.revokeObjectURL(url); state.error = '사진을 읽지 못했어요. 파일이 손상되지 않았는지 확인하거나 다른 사진을 골라 주세요.'; }
  finally { if (state.reading.get(index) === token) state.reading.delete(index); render(); }
  return accepted;
}
async function addPhotos(files) {
  if (state.working || state.reading.size) return;
  const incoming = [...files];
  const empty = state.photos.flatMap((photo, index) => photo ? [] : [index]);
  state.error = ''; state.uploadNote = '';
  if (incoming.length > empty.length) state.uploadNote = empty.length ? `사진은 최대 3장까지 골라요. 처음 ${empty.length}개 파일만 확인했어요.` : '사진은 최대 3장까지 골라요. 바꾸고 싶은 사진을 먼저 지워 주세요.';
  for (let i = 0; i < Math.min(incoming.length, empty.length); i++) await readPhoto(incoming[i], empty[i]);
  render();
}
let healthTimer;
async function refreshHealth() {
  clearTimeout(healthTimer);
  if (!CAN_FETCH) { state.health = { status: 'error', models: [] }; render(); return; }
  const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch('/api/health', { signal: controller.signal, cache: 'no-store' });
    const data = await response.json();
    if (!response.ok || !['ready', 'loading', 'error'].includes(data.status)) throw new Error('Invalid service status');
    state.health = data;
  } catch { state.health = { status: 'error', models: [] }; }
  finally { clearTimeout(timeout); render(); if (state.health.status === 'loading') healthTimer = setTimeout(refreshHealth, 2500); }
}
let elapsedTimer;
function updateElapsed() { const el = $('[data-elapsed]'); if (el && state.startedAt) el.textContent = `· ${Math.floor((Date.now() - state.startedAt) / 1000)}초 경과`; }
async function analyzePhotos() {
  const photos = state.photos.filter(Boolean);
  if (!photos.length || state.step !== 3 || state.working || state.reading.size || state.health.status !== 'ready' || !CAN_FETCH) return;
  state.working = true; state.error = ''; state.startedAt = Date.now(); invalidateResult(); render(true);
  elapsedTimer = setInterval(updateElapsed, 1000);
  const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 180000);
  try {
    const body = new FormData(); photos.forEach(photo => body.append('photos', photo.file));
    const response = await fetch('/api/analyze', { method: 'POST', body, signal: controller.signal });
    let data; try { data = await response.json(); } catch { throw new Error('결과를 불러오지 못했어요. 선택한 사진은 그대로 있으니 다시 분석해 주세요.'); }
    if (!response.ok) {
      const messages = { 400: '사진을 확인하지 못했어요. 사진의 형식과 크기를 살펴본 뒤 다시 골라 주세요.', 413: '사진 용량이 너무 커요. 한 장에 10MB 이하인 사진을 최대 3장 골라 주세요.', 429: '다른 분석이 진행 중이에요. 잠시 기다린 뒤 다시 눌러 주세요.', 503: '분석할 준비가 아직 끝나지 않았어요. 잠시 후 다시 눌러 주세요.' };
      throw new Error(messages[response.status] || '분석을 마치지 못했어요. 사진은 그대로 남아 있으니 잠시 후 다시 시도해 주세요.');
    }
    if (!validRecord(data) || data.photo_count !== photos.length) throw new Error('결과를 확인하지 못했어요. 잠시 후 같은 사진으로 다시 분석해 주세요.');
    state.result = storedRecord(data); state.resultPhotos = photos.map(photo => photo.url);
    state.selectedDate = data.date; state.year = Number(data.date.slice(0, 4)); state.month = Number(data.date.slice(5, 7)) - 1;
    state.working = false; go('report'); toast('분석이 끝났어요. 네 가지 결과를 살펴보세요.');
  } catch (error) {
    state.error = error.name === 'AbortError' ? '분석이 예상보다 오래 걸려 중단했어요. 사진은 그대로 남아 있으니 잠시 후 다시 시도해 주세요.' : error.name === 'TypeError' ? '연결이 끊어졌어요. 선택한 사진은 그대로 남아 있으니 연결을 확인한 뒤 다시 시도해 주세요.' : error.message;
    state.working = false; go('analysis');
  } finally { clearTimeout(timeout); clearInterval(elapsedTimer); state.working = false; state.startedAt = null; render(true); }
}
function saveResult() {
  if (!state.result || state.savedId) return;
  try {
    const records = readRecords();
    if (!records.some(r => r.id === state.result.id)) localStorage.setItem(STORAGE_KEY, JSON.stringify([...records, storedRecord(state.result)]));
    state.savedId = state.result.id; state.selectedDate = state.result.date; render(true); toast('오늘의 결과를 저장했어요. 내 기록에서 다시 볼 수 있어요.');
  } catch { toast('기록을 저장할 공간이 부족하거나 저장이 제한돼 있어요. 결과 인쇄하기로 남길 수도 있어요.'); }
}
function startNew(skipGuide = false) {
  if (state.working) return;
  state.photos.forEach((_, i) => releasePhoto(i)); state.reading.clear(); invalidateResult(); state.error = ''; state.uploadNote = ''; state.step = skipGuide ? 2 : 1; state.maxStep = 2; go('analysis');
}
function changeMonth(delta) {
  const target = new Date(state.year, state.month + delta, 1);
  state.year = target.getFullYear(); state.month = target.getMonth();
  const prefix = `${state.year}-${String(state.month + 1).padStart(2, '0')}`;
  state.selectedDate = readRecords().filter(r => r.date.startsWith(prefix)).at(-1)?.date || `${prefix}-01`;
  render();
}
document.addEventListener('change', event => {
  if (event.target.matches('[data-file]')) { state.error = ''; state.uploadNote = ''; readPhoto(event.target.files[0], Number(event.target.dataset.file)); }
  if (event.target.matches('[data-bulk]')) addPhotos(event.target.files);
  if (event.target.matches('[data-check]')) { const i = Number(event.target.dataset.check); if (event.target.checked) state.checks.add(i); else state.checks.delete(i); $('.check-count').textContent = `${state.checks.size} / 3 확인`; }
});
document.addEventListener('click', event => {
  const remove = event.target.closest('[data-remove]');
  if (remove && !state.working && !state.reading.size) { const index = Number(remove.dataset.remove); releasePhoto(index); invalidateResult(); state.error = ''; state.uploadNote = ''; render(); requestAnimationFrame(() => $(`#photo-${index}`)?.focus({ preventScroll: true })); return; }
  const step = event.target.closest('[data-step]'); if (step && !step.disabled) { setStep(Number(step.dataset.step)); return; }
  const range = event.target.closest('[data-range]'); if (range) { state.range = range.dataset.range; render(); return; }
  const date = event.target.closest('[data-date]'); if (date) { state.selectedDate = date.dataset.date; render(); return; }
  const stored = event.target.closest('[data-record]');
  if (stored && !state.working) { const result = readRecords().find(r => r.id === stored.dataset.record); if (result) { state.result = result; state.resultPhotos = []; state.savedId = result.id; go('report'); } return; }
  const element = event.target.closest('[data-action]'); if (!element || element.disabled) return;
  switch (element.dataset.action) {
    case 'next': setStep(state.step + 1); break;
    case 'back': setStep(state.step - 1); break;
    case 'analyze': analyzePhotos(); break;
    case 'select-photos': if (!state.working) $('#photos-bulk')?.click(); break;
    case 'health': state.health.status = 'loading'; render(); refreshHealth(); break;
    case 'start': if (currentPage() === 'care' && photoCount()) { state.step = 2; go('analysis'); } else startNew(currentPage() === 'care'); break;
    case 'new': startNew(true); break;
    case 'print': window.print(); break;
    case 'save': saveResult(); break;
    case 'prev-month': changeMonth(-1); break;
    case 'next-month': changeMonth(1); break;
    case 'clear-records': if (confirm('이 브라우저에 저장한 결과를 모두 지울까요? 지운 기록은 되돌릴 수 없어요.')) { try { localStorage.removeItem(STORAGE_KEY); state.savedId = null; render(true); toast('저장한 기록을 모두 지웠어요.'); } catch { toast('기록을 지우지 못했어요. 브라우저 저장 설정을 확인해 주세요.'); } } break;
  }
});
document.addEventListener('dragover', event => { const zone = event.target.closest('[data-drop]'); if (zone) { event.preventDefault(); if (!state.working) zone.classList.add('is-dragging'); } });
document.addEventListener('dragleave', event => { const zone = event.target.closest('[data-drop]'); if (zone && !zone.contains(event.relatedTarget)) zone.classList.remove('is-dragging'); });
document.addEventListener('drop', event => { const zone = event.target.closest('[data-drop]'); if (zone) { event.preventDefault(); zone.classList.remove('is-dragging'); if (!state.working) addPhotos(event.dataTransfer.files); } });
window.addEventListener('hashchange', () => { render(true); window.scrollTo({ top: 0, behavior: 'instant' }); });
render();
refreshHealth();
