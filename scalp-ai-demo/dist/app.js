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
  { id: 'sebum', name: '피지 유무', icon: 'drop', color: '#567d79', description: '사진에서 피지 관련 특징이 있는지 살펴봐요.' },
  { id: 'hair_loss', name: '탈모 여부', icon: 'hair', color: '#7772a2', description: '탈모 관련 특징을 살펴봐요.' },
  { id: 'erythema', name: '모낭사이홍반', icon: 'redness', color: '#b16c78', description: '모낭 사이 두피의 붉은 기를 살펴봐요.' }
];
const SEVERITY_LABELS = ['정상', '경증', '중증'];
const FLAKES_GRADE_LABELS = ['정상', '경중등도', '중증'];
const FLAKES_PREPROCESSING_VERSION = 'flakes-384-square-v1';
const SEBUM_PREPROCESSING_VERSION = 'sebum-384-attention-v1';
const SEBUM_GRADE_LABELS = ['무', '유'];
const CLASS_GRADE_MAP = {
  flakes: [0, 1, 1, 2],
  sebum: [0, 1, 2],
  hair_loss: [0, 1, 2],
  erythema: [0, 1, 2]
};
const STORAGE_KEY = 'scalp-ai-model-records-v2';
const CAN_FETCH = ['http:', 'https:'].includes(location.protocol);
function today() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
const initialDate = today();
const state = {
  step: 1, maxStep: 2, photos: [null, null, null], fileToken: [0, 0, 0], reading: new Map(), working: false,
  result: null, resultPhotos: [], savedId: null, error: '', uploadNote: '', checks: new Set(),
  range: 'month', year: Number(initialDate.slice(0, 4)), month: Number(initialDate.slice(5, 7)) - 1,
  selectedDate: initialDate, startedAt: null, historyInitialized: false,
  user: null, authLoading: CAN_FETCH, authUnavailable: false, authBusy: false, authError: '', accountEpoch: 0,
  accountRecords: [], recordsLoading: false, recordsError: '', saving: false, deleting: false, saveToken: null,
  careChecks: new Set(), careDate: '', careLoading: false, careSaving: false, careError: '',
  careMonth: '', careDays: {}, careMonthLoading: false, careMonthError: '', careLoadToken: 0, careMonthToken: 0, pdfBusy: false,
  health: { status: 'loading', message: '', models: [] }
};
function escapeHTML(value) { return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])); }
function validProbabilities(values, length) {
  return Array.isArray(values) && values.length === length
    && values.every(value => Number.isFinite(value) && value >= 0 && value <= 1)
    && Math.abs(values.reduce((sum, value) => sum + value, 0) - 1) < 0.01;
}
function isBinarySebum(metric) {
  return metric?.id === 'sebum' && metric.preprocessing_version === SEBUM_PREPROCESSING_VERSION;
}
function metricName(metric) {
  if (metric?.id === 'sebum') return isBinarySebum(metric) ? '피지 유무' : '피지과다';
  return METRICS.find(definition => definition.id === metric?.id)?.name || '분석 항목';
}
function gradeMapping(metric) { return isBinarySebum(metric) ? [0, 1, 1] : CLASS_GRADE_MAP[metric?.id]; }
function gradeLabels(metric) {
  return isBinarySebum(metric) ? SEBUM_GRADE_LABELS : metric?.id === 'flakes' ? FLAKES_GRADE_LABELS : SEVERITY_LABELS;
}
function gradeProbabilities(metric) {
  const mapping = gradeMapping(metric);
  if (!mapping || !validProbabilities(metric.probabilities, mapping.length)) return null;
  const probabilities = gradeLabels(metric).map(() => 0);
  metric.probabilities.forEach((value, index) => { probabilities[mapping[index]] += value; });
  return probabilities;
}
function metricGrade(metric) {
  // Merge before choosing the grade, including when reading older stored outputs.
  const probabilities = gradeProbabilities(metric);
  if (!probabilities) return null;
  return probabilities.reduce((best, value, index) => value > probabilities[best] ? index : best, 0);
}
function metricLabel(metric) { const grade = metricGrade(metric); return grade === null ? '확인 필요' : gradeLabels(metric)[grade]; }
function validGradeMetadata(metric) {
  const fields = ['grade_probabilities', 'grade_labels', 'grade_confidence', 'grading_method', 'grade_indices', 'preprocessing_version'];
  if (!fields.some(field => field in metric)) return true; // Original records retain their raw values.
  const binary = isBinarySebum(metric);
  if (metric.id === 'sebum' && metric.preprocessing_version != null && !binary) return false;
  const probabilities = gradeProbabilities(metric), labels = gradeLabels(metric), mapping = gradeMapping(metric), grade = metricGrade(metric);
  if (!probabilities || !validProbabilities(metric.grade_probabilities, labels.length)
    || !Array.isArray(metric.grade_labels) || metric.grade_labels.length !== labels.length
    || !metric.grade_labels.every((label, index) => label === labels[index])
    || !metric.grade_probabilities.every((value, index) => Math.abs(value - probabilities[index]) < 0.00001)
    || metric.grade_index !== grade || metric.label !== labels[grade]
    || !Number.isFinite(metric.grade_confidence) || Math.abs(metric.grade_confidence - probabilities[grade]) >= 0.00001
    || metric.grading_method !== (metric.id === 'flakes' || binary ? 'probability_merge' : 'argmax')) return false;
  if ('grade_indices' in metric && (!Array.isArray(metric.grade_indices)
    || metric.grade_indices.length !== mapping.length
    || !metric.grade_indices.every((value, index) => value === mapping[index]))) return false;
  if (binary && (!Array.isArray(metric.grade_indices) || metric.labels_confirmed !== true
    || metric.settings_verified !== true || !Array.isArray(metric.excluded_classes) || metric.excluded_classes.length)) return false;
  return metric.id !== 'flakes' || (metric.preprocessing_version === FLAKES_PREPROCESSING_VERSION
    && Array.isArray(metric.excluded_classes) && metric.excluded_classes.length === 0);
}
function validMetric(metric, index) {
  return metric && metric.id === METRICS[index].id && typeof metric.label === 'string' && metric.label.length <= 200
    && typeof metric.settings_verified === 'boolean' && Number.isInteger(metric.class_index)
    && Array.isArray(metric.probabilities) && metric.probabilities.length === (index === 0 ? 4 : 3)
    && metric.class_index >= 0 && metric.class_index < metric.probabilities.length
    && metric.probabilities.every(p => Number.isFinite(p) && p >= 0 && p <= 1)
    && Math.abs(metric.probabilities.reduce((sum, p) => sum + p, 0) - 1) < 0.01
    && Number.isFinite(metric.confidence) && metric.confidence >= 0 && metric.confidence <= 1
    && Math.abs(metric.confidence - metric.probabilities[metric.class_index]) < 0.001
    && (!('excluded_classes' in metric) || (Array.isArray(metric.excluded_classes)
      && metric.excluded_classes.every(value => Number.isInteger(value) && value >= 0 && value < metric.probabilities.length)
      && !metric.excluded_classes.includes(metric.class_index)))
    && metric.confidence >= Math.max(...metric.probabilities.filter((_, classIndex) => !metric.excluded_classes?.includes(classIndex))) - 0.001
    && Array.isArray(metric.class_labels) && metric.class_labels.length === metric.probabilities.length
    && metric.class_labels.every(label => typeof label === 'string' && label.length <= 200)
    && validGradeMetadata(metric);
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
  if (state.authLoading || state.authUnavailable) return [];
  if (state.user) return [...state.accountRecords].sort((a, b) => a.date.localeCompare(b.date));
  try {
    const records = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(records) ? records.filter(validRecord).sort((a, b) => a.date.localeCompare(b.date)) : [];
  } catch { return []; }
}
function storedMetric(metric) {
  return { id: metric.id, label: metric.label, class_index: metric.class_index, confidence: metric.confidence,
    probabilities: [...metric.probabilities], class_labels: [...metric.class_labels], settings_verified: metric.settings_verified,
    ...(Array.isArray(metric.excluded_classes) ? { excluded_classes: [...metric.excluded_classes] } : {}),
    ...(Number.isInteger(metric.grade_index) ? { grade_index: metric.grade_index } : {}),
    ...(typeof metric.labels_confirmed === 'boolean' ? { labels_confirmed: metric.labels_confirmed } : {}),
    ...(Array.isArray(metric.grade_probabilities) ? { grade_probabilities: [...metric.grade_probabilities] } : {}),
    ...(Array.isArray(metric.grade_labels) ? { grade_labels: [...metric.grade_labels] } : {}),
    ...(Array.isArray(metric.grade_indices) ? { grade_indices: [...metric.grade_indices] } : {}),
    ...(Number.isFinite(metric.grade_confidence) ? { grade_confidence: metric.grade_confidence } : {}),
    ...(typeof metric.grading_method === 'string' ? { grading_method: metric.grading_method } : {}),
    ...(typeof metric.preprocessing_version === 'string' ? { preprocessing_version: metric.preprocessing_version } : {}) };
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
  if (state.authUnavailable) return accountDataError('account');
  if (!CAN_FETCH) return `<div class="status-panel error server-notice"><strong>서비스 주소에서 접속해 주세요</strong><p>사진 분석은 서비스 웹주소에서 이용할 수 있어요. 이용하던 링크를 브라우저에서 다시 열어 주세요.</p></div>`;
  if (state.health.status === 'ready') return '';
  return `<div class="status-panel ${state.health.status}" role="status"><span class="status-indicator" aria-hidden="true"></span><div><strong>${state.health.status === 'loading' ? '분석할 준비를 하고 있어요' : '분석 서비스에 연결하지 못했어요'}</strong><p>${state.health.status === 'loading' ? '사진은 먼저 골라 두셔도 좋아요. 준비가 끝나면 분석 버튼이 활성화돼요.' : '선택한 사진은 그대로 유지돼요. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.'}</p>${state.health.status === 'error' ? button('다시 연결하기', 'health', true, 'arrow') : ''}</div></div>`;
}
function expectationNote() {
  return `<div class="guide-callout"><strong>결과는 이렇게 확인해 주세요</strong><p>각질은 정상·경중등도·중증으로 표시해요. 경중등도는 경증과 중등도를 함께 나타내는 등급이에요. 피지는 무·유로, 탈모 여부와 모낭사이홍반은 정상·경증·중증으로 확인할 수 있어요.</p><p class="metric-note">사진의 밝기와 초점, 촬영 부위에 따라 결과가 달라질 수 있어요. 분석 결과는 두피를 살펴보는 참고 정보이며 의료 진단을 대신하지 않아요.</p></div>`;
}
function helper() {
  return `<aside class="helper-card"><p class="section-kicker">한 장으로 시작해도 괜찮아요</p><h2 class="helper-title">어떤 부분을 살펴보나요?</h2><p>사진 한 장에서 네 가지 항목을 각각 살펴봐요.</p><div class="metric-preview">${METRICS.map(m => `<div class="metric-preview-item"><span class="metric-preview-icon">${icon(m.icon)}</span><div><strong>${m.name}</strong><p>${m.description}</p></div></div>`).join('')}</div><div class="helper-list"><p>${icon('check')} 사진 1장부터, 최대 3장까지</p><p>${icon('lock')} 사진은 분석에만 사용해요</p></div><a class="text-button" href="#guide">촬영 방법 자세히 보기 ${icon('arrow')}</a></aside>`;
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
  return `<section class="surface" id="photo-upload"><div class="surface-heading"><span class="section-number">02</span><div><p class="section-kicker">사진 고르기</p><h2 data-step-title tabindex="-1">분석할 사진을 골라 주세요</h2><p>한 장만 골라도 좋아요. 같은 부위 사진을 최대 세 장까지 추가할 수 있어요.</p></div></div><div class="drop-zone" data-drop><span class="drop-icon">${icon('upload')}</span><strong>여기에 사진을 놓아 주세요</strong><p>또는 버튼을 눌러 내 기기에서 골라 주세요.</p><button class="button secondary upload-link" data-action="select-photos">사진 고르기${icon('photo')}</button><input class="sr-only" type="file" id="photos-bulk" data-bulk multiple accept="image/jpeg,image/png,image/webp" aria-label="두피 사진 여러 장 선택" aria-describedby="upload-formats"><p class="upload-formats" id="upload-formats">JPG · PNG · WEBP / 한 장에 10MB, 2,000만 화소 이하</p></div><div class="upload-grid">${photoSlots()}</div>${uploadFeedback()}${window.ScalpCamera ? ScalpCamera.markup() : ''}<p class="privacy-note">${icon('lock')} 아직 사진을 전송하지 않았어요. 다음 단계에서 확인한 뒤 분석해요.</p><div class="flow-actions">${button('촬영 안내 다시 보기', 'back', true, 'back')}${button('선택한 사진 확인하기', 'next', false, 'arrow', !photoCount() || !!state.reading.size)}</div></section>`;
}
function review() {
  const photos = state.photos.filter(Boolean);
  return `<section class="surface"><div class="surface-heading"><span class="section-number">03</span><div><p class="section-kicker">마지막으로 확인하기</p><h2 data-step-title tabindex="-1">이 사진으로 분석할까요?</h2><p>두피가 선명하게 보이는지 한 번 더 살펴봐 주세요.</p></div></div><div class="review-grid">${photos.map((photo, i) => `<figure class="review-item"><img src="${photo.url}" alt="분석할 사진 ${i + 1}"><figcaption>사진 ${i + 1}</figcaption></figure>`).join('')}</div><div class="photo-checklist"><strong>이렇게 보이면 준비 완료예요</strong><p>${icon('check')} 가르마 사이의 두피가 잘 보여요.</p><p>${icon('check')} 흔들림과 빛 반사가 적어요.</p>${photos.length > 1 ? `<p>${icon('check')} ${photos.length}장 모두 같은 두피 부위를 촬영했어요.</p>` : ''}</div>${expectationNote()}<p class="privacy-note">${icon('lock')} 분석 버튼을 누르면 사진을 분석 서비스로 보내요. 사진은 저장하지 않으며 결과만 내 기록에 남길 수 있어요.</p>${uploadFeedback()}${serviceStatus()}<div class="flow-actions">${button('사진 다시 고르기', 'back', true, 'back')}${button(state.error ? '같은 사진으로 다시 분석하기' : `사진 ${photos.length}장 분석하기`, 'analyze', false, 'spark', !photos.length || !!state.reading.size || state.health.status !== 'ready' || state.authLoading || state.authUnavailable || !CAN_FETCH)}</div></section>`;
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
    const grade = metricGrade(metric), binary = isBinarySebum(metric), name = metricName(metric);
    return `<article class="metric ${binary ? 'binary-metric ' : ''}${grade === null ? 'grade-unknown' : `grade-${grade}`}" data-metric="${definition.id}"><div class="metric-header"><span class="metric-icon">${icon(definition.icon)}</span><h2>${name}</h2></div><div class="metric-value">${escapeHTML(metricLabel(metric))}</div><div class="grade-scale ${binary ? 'binary-scale' : ''}" aria-label="${name} ${escapeHTML(metricLabel(metric))}">${gradeLabels(metric).map((label, i) => `<span class="${grade === i ? 'is-active' : ''}" ${grade === i ? 'aria-current="true"' : ''}><i aria-hidden="true"></i>${label}</span>`).join('')}</div><p class="metric-description">${binary ? '유는 피지 관련 특징이 있다는 판정이며, 심한 정도를 나타내는 등급은 아니에요.' : definition.id === 'sebum' ? '분석 당시의 정상·경증·중증 결과예요.' : definition.description}</p></article>`;
  }).join('');
}
function resultExplanation(result) {
  const binary = isBinarySebum(result.metrics.find(metric => metric.id === 'sebum'));
  return `<section class="result-explanation"><div>${icon('leaf')}</div><div><h2>항목에 맞는 기준으로 결과를 확인해요</h2><p>각질의 중간 등급인 경중등도는 경증과 중등도를 함께 나타내요. ${binary ? '피지는 무·유로 확인하며, 유는 심각도를 뜻하지 않아요. 탈모 여부와 모낭사이홍반은 정상·경증·중증으로 표시해요.' : '피지과다·탈모 여부·모낭사이홍반은 분석 당시의 정상·경증·중증 결과로 표시해요.'} 결과는 관찰 참고용이며 의료 진단을 대신하지 않아요.</p><p class="metric-note">사진의 밝기와 초점, 촬영 부위에 따라 결과가 달라질 수 있어요. 다음 기록과 비교할 때는 같은 부위를 비슷한 조명에서 촬영해 주세요.</p></div></section>`;
}
function usesLegacyFlakesPreprocessing(result) {
  const flakes = result?.metrics?.find(metric => metric.id === 'flakes');
  return Boolean(flakes && flakes.preprocessing_version !== FLAKES_PREPROCESSING_VERSION);
}
function usesLegacySebumModel(result) {
  const sebum = result?.metrics?.find(metric => metric.id === 'sebum');
  return Boolean(sebum && !isBinarySebum(sebum));
}
function legacyAnalysisNotice(result, compact = false) {
  const flakes = usesLegacyFlakesPreprocessing(result)
    ? `<div class="inline-notice warning legacy-analysis-note" data-legacy-analysis><strong>이전 분석 기록</strong><p>${compact ? '저장된 각질 결과를 현재 등급 표현에 맞춰 보여드려요. 최신 기준으로 확인하려면 원본 사진으로 다시 분석해 주세요.' : '저장된 각질 결과를 현재 등급 표현에 맞춰 정리했어요. 사진을 다시 분석한 결과는 아니므로, 최신 기준으로 확인하려면 원본 사진으로 다시 분석해 주세요.'}</p></div>` : '';
  const sebum = usesLegacySebumModel(result)
    ? '<div class="inline-notice warning legacy-analysis-note" data-legacy-sebum><strong>이전 피지 분석 결과</strong><p>분석 당시의 정상·경증·중증 결과를 보관하고 있어요. 현재의 유·무 결과를 확인하려면 원본 사진으로 다시 분석해 주세요.</p></div>' : '';
  return flakes + sebum;
}
function analysisDetails(result) {
  return `<details class="details-panel" data-details="analysis"><summary><span>사진별 등급 자세히 보기</span><span>사진마다 어떤 결과가 나왔는지 확인해요</span></summary><div class="details-content"><section class="photo-results"><h3>사진별 분석 등급</h3><div class="table-scroll" tabindex="0" role="region" aria-label="사진별 분석 등급 표"><table><thead><tr><th scope="col">사진</th>${result.metrics.map(m => `<th scope="col">${metricName(m)}</th>`).join('')}</tr></thead><tbody>${result.per_photo.map((photo, index) => `<tr><th scope="row">${state.resultPhotos[index] ? `<img class="result-thumbnail" src="${state.resultPhotos[index]}" alt="분석한 사진 ${index + 1}">` : ''}<span>사진 ${index + 1}</span></th>${photo.metrics.map(m => `<td><strong class="grade-text grade-${metricGrade(m) ?? 'unknown'}">${escapeHTML(metricLabel(m))}</strong></td>`).join('')}</tr>`).join('')}</tbody></table></div><p class="metric-note">각질의 경중등도는 경증과 중등도를 함께 나타내요. ${isBinarySebum(result.metrics[1]) ? ' 피지는 관련 특징의 유무를 확인해요.' : ''} 여러 장을 분석하면 각 사진을 종합한 결과를 보여드려요.</p></section></div></details>`;
}
function report() {
  const result = state.result;
  if (!result) return `${intro('분석 결과', '아직 분석한 사진이 없어요.', '사진 한 장을 준비하면 네 가지 항목을 살펴볼 수 있어요.')}${emptyState('첫 기록을 시작해 볼까요?', '사진 준비부터 하나씩 안내해 드릴게요. 이전 결과는 내 기록에서 다시 볼 수 있어요.')}`;
  return `${intro(state.savedId ? '저장한 두피 기록' : '사진 분석 완료', state.savedId ? '저장한 분석 결과를 살펴보세요.' : '두피 분석 결과가 준비됐어요.', state.savedId ? '분석한 날짜와 네 가지 항목의 결과를 확인해 보세요.' : '네 가지 항목을 살펴보고, 결과를 저장해 다음 기록과 함께 보세요.')}<section class="report-overview"><div class="result-meta">${icon('calendar')} ${shortDate(result.date)}<span>사진 ${result.photo_count}장 분석</span></div><span class="result-tag">${state.savedId ? '저장된 기록' : '새로운 기록'}</span></section>${resultExplanation(result)}${legacyAnalysisNotice(result)}<section class="metrics" aria-label="네 가지 분석 결과">${metricCards(result)}</section><section class="surface next-step"><div><span class="section-kicker">이 결과를 다음에도 보고 싶다면</span><h2>${state.savedId ? '내 기록에 잘 보관했어요' : '오늘의 결과를 기록해 두세요'}</h2><p>${state.savedId ? state.user ? '이 계정의 내 기록에서 언제든 다시 볼 수 있어요.' : '같은 브라우저의 내 기록에서 언제든 다시 볼 수 있어요.' : recordStorageCopy()}</p></div>${state.savedId ? '<a class="button" href="#history">내 기록 보러 가기' + icon('arrow') + '</a>' : button(state.saving ? '기록을 저장하고 있어요' : '오늘의 결과 저장하기', 'save', false, 'save', state.saving || state.authLoading || state.authUnavailable)}</section>${analysisDetails(result)}<section class="surface care-invite"><div><span class="section-kicker">오늘의 결과로 시작하는 관리</span><h2>내 두피에 맞는 습관을 살펴볼까요?</h2><p>분석한 항목에 맞춰 오늘 실천할 관리 방법을 모았어요.</p></div><a class="button secondary" href="#care">맞춤 관리 보기${icon('leaf')}</a></section><div class="bottom-actions">${button(state.pdfBusy ? 'PDF를 준비하고 있어요' : 'PDF로 저장하기', 'download-pdf', true, 'report', state.pdfBusy)}${button('다른 사진 분석하기', 'new', true, 'photo')}</div>`;
}
function graphRecords(range) {
  const records = readRecords();
  const configuration = state.result?.configuration_id || records.at(-1)?.configuration_id;
  const month = `${state.year}-${String(state.month + 1).padStart(2, '0')}`;
  const anchor = new Date(`${today()}T12:00:00Z`); anchor.setUTCDate(anchor.getUTCDate() - 6);
  const from = anchor.toISOString().slice(0, 10);
  return records.filter(r => r.configuration_id === configuration && (range === 'week' ? r.date >= from && r.date <= today() : r.date.startsWith(month)));
}
function calendar() {
  const first = new Date(state.year, state.month, 1).getDay(), days = new Date(state.year, state.month + 1, 0).getDate();
  const dates = new Set(readRecords().map(record => record.date)), month = careMonthKey();
  return `<div class="calendar-header"><h2>${state.year}년 ${state.month + 1}월</h2><div><button data-action="prev-month" aria-label="이전 달" ${state.careSaving ? 'disabled' : ''}>${icon('back')}</button><button data-action="next-month" aria-label="다음 달" ${state.careSaving || month >= today().slice(0,7) ? 'disabled' : ''}>${icon('arrow')}</button></div></div><div class="calendar">${['일', '월', '화', '수', '목', '금', '토'].map(day => `<span class="day-label">${day}</span>`).join('')}${'<span class="blank"></span>'.repeat(first)}${Array.from({length:days}, (_,index) => {
    const date = `${month}-${String(index+1).padStart(2,'0')}`, record = dates.has(date), careDay = state.careMonth === month && (state.careDays[date]?.length || 0) > 0;
    return `<button data-date="${date}" ${date > today() || state.careSaving ? 'disabled' : ''} class="${record ? 'record' : ''} ${careDay ? 'care-day' : ''} ${date === state.selectedDate ? 'chosen' : ''}" aria-label="${shortDate(date)}${record ? ' · 분석 기록' : ''}${careDay ? ' · 관리 실천 기록' : ''}" aria-pressed="${date === state.selectedDate}">${index+1}${careDay ? '<span class="care-day-mark" aria-hidden="true">✓</span>' : ''}</button>`;
  }).join('')}</div><p class="calendar-note">● 분석 기록 · ✓ 관리 실천 기록<br>날짜를 선택해 실천을 체크하거나 지난 기록을 확인해요.</p>${state.careMonthLoading ? '<p class="form-hint" role="status">달력의 관리 기록을 불러오고 있어요.</p>' : ''}${state.careMonthError ? `<p class="inline-notice error" role="alert">${escapeHTML(state.careMonthError)}</p>${button('달력 다시 불러오기','reload-care',true)}` : ''}<button class="text-button" data-action="care-today" ${state.careSaving ? 'disabled' : ''}>오늘로 돌아가기</button>`;
}
function history() {
  const records = readRecords(), selected = records.filter(record => record.date === state.selectedDate);
  const header = intro('차곡차곡 쌓이는 나의 기록', '분석 결과와 관리한 날을 모아요.', '달력에서 날짜를 선택해 분석 결과와 실천한 관리를 함께 확인해요.');
  if (state.authLoading || state.recordsLoading) return `${header}<section class="surface empty-state" role="status"><h2>내 기록을 불러오고 있어요</h2></section>`;
  if (state.authUnavailable) return `${header}${accountDataError('account')}`;
  if (state.user && state.recordsError) return `${header}${accountDataError('records')}`;
  return `${header}${accountContext()}<div class="history-stats"><div class="stat-item"><span>저장한 분석</span><strong>${records.length}<small>회</small></strong></div><div class="stat-item"><span>살펴본 사진</span><strong>${records.reduce((sum,record)=>sum+record.photo_count,0)}<small>장</small></strong></div><div class="stat-item"><span>선택한 달의 관리 실천</span><strong>${state.careMonth === careMonthKey() ? Object.values(state.careDays).filter(checks=>checks.length>0).length : 0}<small>일</small></strong></div></div><div class="history-layout"><section class="surface">${calendar()}</section><section class="surface history-list"><div class="surface-heading"><div><p class="section-kicker">선택한 날짜</p><h2>${shortDate(state.selectedDate)}</h2></div></div>${selected.map(record => `<article class="history-record"><div class="record-date"><strong>두피 사진 분석</strong><span>사진 ${record.photo_count}장</span></div>${legacyAnalysisNotice(record,true)}<div class="record-metrics">${record.metrics.map(metric=>`<span>${metricName(metric)}<strong>${escapeHTML(metricLabel(metric))}</strong></span>`).join('')}</div><div class="record-actions"><button class="button secondary" data-record="${escapeHTML(record.id)}">결과 다시 보기${icon('arrow')}</button></div></article>`).join('') || `<div class="history-empty"><h3>이날 저장한 분석 결과가 없어요</h3><p>아래 체크리스트에는 분석 여부와 관계없이 실천한 관리를 남길 수 있어요.</p>${button('사진 분석하러 가기','start',true)}</div>`}</section></div>${historyCareSection()}${historyTrendPicker()}<div class="bottom-actions"><p class="save-note">${recordStorageCopy()} 관리 실천 기록은 분석 결과를 삭제해도 유지돼요.</p>${records.length ? `<button class="text-button" data-action="clear-records" ${state.deleting?'disabled':''}>${state.deleting?'기록을 삭제하고 있어요':'저장한 분석 기록 모두 삭제'}</button>` : ''}</div>`;
}
function guide() {
  const tips = [
    ['두피가 보이도록', '가르마를 살짝 나눠 주세요', '머리카락만 가득한 사진보다 모발 사이 두피가 잘 드러나는 사진을 준비해요.', 'hair'],
    ['선명하게 보이도록', '밝기와 초점을 확인해요', '조명이 너무 어둡거나 빛이 반사되지 않는지 살펴봐 주세요. 흔들렸다면 다시 촬영해요.', 'scan'],
    ['다음 기록과 비교하도록', '같은 부위를 촬영해요', '같은 부위와 비슷한 조명에서 촬영하면 지난 사진과 함께 돌아보기 좋아요. 추가 사진은 최대 두 장까지예요.', 'calendar']
  ];
  return `${intro('사진 한 장을 위한 작은 도움', '이렇게 찍으면 준비 끝이에요.', '어렵게 생각하지 마세요. 두피가 선명하게 보이는 사진이면 좋아요.')}<div class="guide-cards">${tips.map((t, i) => `<article class="surface guide-card"><div class="guide-example">${icon(t[3])}<span class="guide-number">0${i + 1}</span></div><p class="section-kicker">${t[0]}</p><h2>${t[1]}</h2><p>${t[2]}</p></article>`).join('')}</div><section class="surface care-checklist"><div class="surface-heading"><div><p class="section-kicker">촬영 전 마지막 확인</p><h2>하나씩 확인해 볼까요?</h2></div><span class="check-count">${state.checks.size} / 3 확인</span></div>${['두피가 잘 보이도록 모발을 나눴어요.', '흔들림과 빛 반사 없이 선명하게 보여요.', '여러 장이면 같은 부위를 촬영했어요.'].map((text, i) => `<label class="task"><input type="checkbox" data-check="${i}" ${state.checks.has(i) ? 'checked' : ''}><span>${text}</span></label>`).join('')}<div class="flow-actions"><p class="save-note">확인 표시는 이 페이지를 사용하는 동안 유지돼요.</p>${button('준비한 사진 고르기', 'start')}</div></section>`;
}
function about() {
  return `${intro('서비스 소개', '사진에서 시작하는 두피 기록.', '딥러닝 기반 AI 두피 관리 서비스')}<section class="surface about-hero"><h2>내 두피를 살펴보는 시간을<br>조금 더 쉽게 만들고 싶었어요.</h2><p>사진 한 장으로 각질, 피지 유무, 탈모 여부, 모낭사이홍반의 네 가지 항목을 살펴보고 결과를 기록하는 서비스예요.</p><p>각질은 정상·경중등도·중증으로 정리해요. 경중등도는 경증과 중등도를 합친 등급이에요. 피지는 유·무 여부로 표시하며 경증 이상 분석값을 합쳐 유무를 판정해요. 탈모 여부와 모낭사이홍반은 정상·경증·중증으로 표시해요. 결과는 관찰 참고용으로 제공해요.</p><div class="about-credits"><div><span>만든 곳</span><strong>대림대학교 · 지공모</strong></div><div><span>팀원</span><strong>연일 · 이승철 · 김진형</strong></div><div><span>지도교수</span><strong>김영실 · 박상윤</strong></div></div></section>`;
}

function recordStorageCopy() {
  return state.user ? '결과는 로그인한 계정에 저장해요. 사진은 저장하지 않아요.' : '비회원 기록은 현재 브라우저에 보관돼요. 사진은 저장하지 않아요.';
}
function accountContext() {
  return `<div class="account-context">${icon(state.user ? 'lock' : 'photo')}<div><strong>${state.user ? `${escapeHTML(state.user.nickname)}님의 개인 기록` : '로그인 없이 이용하고 있어요'}</strong><p>${recordStorageCopy()}${state.user ? '' : ' 로그인하면 계정별로 결과와 오늘의 관리 실천을 보관할 수 있어요.'}</p></div>${state.user ? '' : '<a class="text-button" href="#login">로그인하기</a>'}</div>`;
}
function accountDataError(scope) {
  const message = scope === 'records' ? state.recordsError : scope === 'care' ? state.careError : '로그인 상태를 확인하지 못했어요. 다시 연결해 주세요.';
  const action = scope === 'records' ? 'reload-records' : scope === 'care' ? 'reload-care' : 'retry-account';
  return `<section class="surface account-error" role="alert"><h2>잠시 연결을 확인해 주세요</h2><p>${escapeHTML(message)}</p>${button('다시 불러오기', action, true)}</section>`;
}
function renderAccountMenu() {
  const menu = $('#account-menu');
  if (!menu) return;
  if (state.authLoading) { menu.innerHTML = '<span class="account-status" role="status">로그인 확인 중</span>'; return; }
  if (state.authUnavailable) { menu.innerHTML = '<button class="text-button" data-action="retry-account">로그인 상태 다시 확인</button>'; return; }
  const busy = state.authBusy || state.working || state.saving || state.deleting || state.careSaving || memberState.busy || state.pdfBusy || !!state.reading.size || adminState.mutating || adminState.loading;
  menu.innerHTML = state.user
    ? `<span class="account-user">${icon('lock')}<strong data-account-name>${escapeHTML(state.user.nickname)}</strong><span>님</span></span>${isAdmin() ? `<a class="account-link admin-link" data-admin-link href="#admin" ${currentPage() === 'admin' ? 'aria-current="page"' : ''}>관리자 페이지</a>` : ''}${!isAdmin() ? '<a class="account-link" href="#profile">내 계정</a>' : ''}<button class="account-link" data-action="logout" ${busy ? 'disabled' : ''}>${state.authBusy ? '로그아웃 중' : '로그아웃'}</button>`
    : '<a class="account-link" href="#login">로그인</a><a class="account-link join-link" href="#register">회원가입</a>';
}
function authPage(mode) {
  if (state.user) return `${intro('나의 계정', `${escapeHTML(state.user.nickname)}님, 반가워요.`, '분석 결과와 오늘의 관리를 계정에 모아 보세요.')}<section class="surface auth-already"><a class="button" href="#history">내 기록 보기${icon('arrow')}</a><a class="button secondary" href="#profile">내 계정 관리${icon('lock')}</a></section>`;
  const signup = mode === 'register', busy = state.authLoading || state.authBusy || state.working || !!state.reading.size || state.saving || state.deleting || state.careSaving || memberState.busy || adminState.mutating || adminState.loading;
  return `${intro(signup?'회원가입':'로그인',signup?'나만의 두피 기록을 시작해요.':'다시 만나 반가워요.',signup?'아이디와 비밀번호로 나만의 기록을 남겨 보세요.':'가입한 아이디와 비밀번호를 입력해 주세요.')}<div class="auth-layout"><section class="surface auth-card"><div class="auth-tabs"><a href="#login" ${!signup?'aria-current="page"':''}>로그인</a><a href="#register" ${signup?'aria-current="page"':''}>회원가입</a></div><form data-auth-form="${mode}" aria-busy="${busy}"><label class="form-field" for="auth-nickname"><span>아이디 (닉네임)</span><input id="auth-nickname" name="nickname" type="text" maxlength="40" autocomplete="username" required ${busy?'disabled':''} placeholder="예: 두피관찰자"></label>${signup?nicknameCheckMarkup('auth'):''}<label class="form-field" for="auth-password"><span>비밀번호</span><input id="auth-password" name="password" type="password" maxlength="128" autocomplete="${signup?'new-password':'current-password'}" required aria-describedby="password-help" ${busy?'disabled':''} placeholder="비밀번호를 입력해 주세요"></label><p class="form-hint" id="password-help">${signup?'다른 서비스에서 사용하지 않는 새로운 비밀번호를 사용해 주세요.':'가입할 때 사용한 비밀번호를 입력해 주세요.'}</p>${signup?genderFields('auth',null,busy):''}<p class="inline-notice error" id="auth-error" role="alert" ${state.authError?'':'hidden'}>${escapeHTML(state.authError)}</p>${state.working?'<p class="form-hint">사진 분석이 끝나면 계정을 변경할 수 있어요.</p>':''}<button class="button" data-auth-submit type="submit" ${busy||state.authUnavailable||!CAN_FETCH?'disabled':''}>${state.authBusy?'잠시만 기다려 주세요':signup?'회원가입':'로그인하기'}${icon('arrow')}</button></form>${state.authUnavailable?accountDataError('account'):''}<a class="text-button guest-link" href="#analysis">로그인 없이 사진 분석하기 ${icon('arrow')}</a></section><aside class="auth-benefits"><span class="section-kicker">나를 위한 작은 기록장</span><h2>사진 한 장에서<br> 매일의 관리까지</h2><p>${icon('calendar')} 내 계정에 분석 결과를 모아요.</p><p>${icon('leaf')} 결과에 맞는 관리 습관을 살펴봐요.</p><p>${icon('check')} 날짜별로 실천한 관리를 기록해요.</p><div class="guide-callout"><strong>정보 제공은 내가 선택해요</strong><p>성별 정보를 제공하고 동의하면 성별에 따른 보조 관리 안내를 받아요. 원하지 않으면 성별을 반영하지 않은 포괄적인 관리 방법을 제공해요.</p></div></aside></div>`;
}
function validUser(user) { return user && Number.isInteger(user.id) && user.id > 0 && typeof user.nickname === 'string' && user.nickname.length > 0 && user.nickname.length <= 40 && ['user', 'admin'].includes(user.role) && Number.isInteger(user.result_epoch) && user.result_epoch >= 0; }
function isAdmin() { return state.user?.role === 'admin'; }
function accountHeaders() { return { 'X-Scalp-Account': state.user ? String(state.user.id) : 'guest', ...(state.user ? { 'X-Scalp-Result-Epoch': String(state.user.result_epoch), 'X-Scalp-Profile-Version': String(state.user.profile_version || 0) } : {}) }; }
async function jsonRequest(url, options = {}) {
  const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 12000);
  const { body, ...rest } = options;
  try {
    const response = await fetch(url, { ...rest, signal: controller.signal, credentials: 'same-origin', cache: 'no-store',
      headers: { ...(rest.headers || {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    let data; try { data = await response.json(); } catch { throw new Error('응답을 확인하지 못했어요. 잠시 후 다시 시도해 주세요.'); }
    if (!response.ok) { const error = new Error(typeof data.error === 'string' ? data.error : '요청을 마치지 못했어요. 다시 시도해 주세요.'); error.status = response.status; error.code = data.code; throw error; }
    return data;
  } catch (error) {
    if (error.name === 'AbortError' || error.name === 'TypeError') throw new Error('연결을 확인하지 못했어요. 잠시 후 다시 시도해 주세요.');
    throw error;
  } finally { clearTimeout(timeout); }
}
function resetAccountScope() {
  state.accountEpoch++;
  window.ScalpCamera?.stop();
  memberState.error = ''; memberState.saved = false; memberState.discardDraft = true;
  state.careLoadToken++; state.careMonthToken++; state.careMonth = ''; state.careDays = {}; state.careMonthLoading = false; state.careMonthError = '';
  resetAdminScope();
  state.photos.forEach((_, index) => releasePhoto(index)); state.reading.clear(); invalidateResult();
  state.accountRecords = []; state.recordsLoading = false; state.recordsError = ''; state.historyInitialized = false;
  state.careChecks = new Set(); state.careDate = ''; state.careLoading = false; state.careSaving = false; state.careError = '';
  state.checks = new Set(); state.step = 1; state.maxStep = 2; state.error = ''; state.uploadNote = '';
  state.saving = false; state.deleting = false;
  state.selectedDate = today(); state.year = Number(state.selectedDate.slice(0, 4)); state.month = Number(state.selectedDate.slice(5, 7)) - 1;
}
function expireSession() {
  resetAccountScope(); state.user = null; state.authLoading = false; state.authUnavailable = false; state.authBusy = false;
  state.authError = '로그인이 만료됐어요. 다시 로그인해 주세요.'; go('login'); toast(state.authError);
}
async function refreshAccountContext(message) {
  resetAccountScope(); state.user = null; state.working = false; state.authBusy = false; state.authLoading = true;
  go('analysis'); await bootstrapAccount(); toast(message);
}
async function refreshChangedAccount() { return refreshAccountContext('사용 중인 계정이 바뀌었어요. 현재 계정으로 다시 확인해 주세요.'); }
async function refreshChangedData() { return refreshAccountContext('계정 정보 또는 기록 상태가 변경됐어요. 현재 계정의 정보를 다시 불러왔어요.'); }
async function accountRequest(url, options = {}) {
  try { return await jsonRequest(url, { ...options, headers: { ...(options.headers || {}), ...accountHeaders() } }); }
  catch (error) {
    if (error.status === 409 && error.code === 'account_changed') await refreshChangedAccount();
    else if (error.status === 409 && ['data_changed', 'profile_changed'].includes(error.code)) await refreshChangedData();
    else if (error.status === 403 && error.code === 'admin_required') await refreshAccountContext('관리자 권한을 다시 확인했어요. 현재 계정에서 이용할 수 있는 화면으로 이동했어요.');
    else if (error.status === 401 && state.user) expireSession();
    throw error;
  }
}
async function bootstrapAccount() {
  if (!CAN_FETCH) { state.authLoading = false; state.authUnavailable = false; render(); return; }
  if (state.authBusy || state.working || state.saving || state.deleting || state.careSaving || adminState.mutating) return;
  const epoch = state.accountEpoch; state.authLoading = true; state.authUnavailable = false; render();
  try {
    const data = await jsonRequest('/api/auth/me');
    if (epoch !== state.accountEpoch) return;
    if (data.user !== null && !validUser(data.user)) throw new Error('계정 정보를 확인하지 못했어요.');
    if (data.user?.id !== state.user?.id || data.user?.role !== state.user?.role || data.user?.result_epoch !== state.user?.result_epoch) resetAccountScope();
    state.user = data.user; state.authLoading = false; state.authUnavailable = false;
    if (state.user) await Promise.all([loadAccountRecords(), loadCareChecks()]);
  } catch (error) { if (epoch === state.accountEpoch) { state.authLoading = false; state.authUnavailable = true; state.authError = error.message; } }
  finally { render(); }
}
async function submitAuth(form) {
  if (state.authBusy || state.authLoading || state.authUnavailable || state.working || state.saving || state.deleting || state.careSaving || state.reading.size || adminState.mutating || adminState.loading) return;
  const nickname = form.elements.nickname.value.trim(), password = form.elements.password.value, mode = form.dataset.authForm;
  if (!nickname || !password) { state.authError = '닉네임과 비밀번호를 입력해 주세요.'; render(); return; }
  const body = { nickname, password, ...(mode === 'register' ? { gender_consent: form.elements.gender_consent.checked, gender: form.elements.gender_consent.checked ? form.elements.gender.value : null } : {}) };
  state.authBusy = true; state.authError = ''; render();
  try {
    const data = await jsonRequest(`/api/auth/${mode}`, { method: 'POST', body });
    if (!validUser(data.user)) throw new Error('계정 정보를 확인하지 못했어요. 다시 로그인해 주세요.');
    resetAccountScope(); state.user = data.user; state.authBusy = false;
    go('analysis'); toast(`${data.user.nickname}님, ${mode === 'register' ? '회원가입을 마쳤어요.' : '로그인했어요.'}`);
    await Promise.all([loadAccountRecords(), loadCareChecks()]);
  } catch (error) { state.authError = error.message; }
  finally { state.authBusy = false; render(); }
}
async function logout() {
  if (!state.user || state.authBusy || state.working || state.saving || state.deleting || state.careSaving || state.reading.size || adminState.mutating || adminState.loading) return;
  state.authBusy = true; render();
  try {
    await jsonRequest('/api/auth/logout', { method: 'POST', body: {} });
    resetAccountScope(); state.user = null; state.authBusy = false; state.authError = ''; go('analysis'); toast('로그아웃했어요.');
  } catch (error) { toast(error.message); }
  finally { state.authBusy = false; render(); }
}
async function loadAccountRecords() {
  if (!state.user || state.recordsLoading) return;
  const epoch = state.accountEpoch; state.recordsLoading = true; state.recordsError = ''; render();
  try {
    const data = await accountRequest('/api/records');
    if (epoch !== state.accountEpoch) return;
    if (!Array.isArray(data.records) || !data.records.every(validRecord)) throw new Error('저장한 기록을 확인하지 못했어요. 다시 불러와 주세요.');
    state.accountRecords = data.records.map(storedRecord); state.historyInitialized = false;
  } catch (error) { if (epoch === state.accountEpoch) state.recordsError = error.message; }
  finally { if (epoch === state.accountEpoch) { state.recordsLoading = false; render(); } }
}
async function clearRecords() {
  if (state.deleting || state.saving || state.authLoading || state.authUnavailable) return;
  if (!confirm(state.user ? '이 계정에 저장한 분석 결과를 모두 지울까요? 지운 기록은 되돌릴 수 없어요.' : '이 브라우저에 저장한 결과를 모두 지울까요? 지운 기록은 되돌릴 수 없어요.')) return;
  const epoch = state.accountEpoch; state.deleting = true; render();
  try {
    if (state.user) { await accountRequest('/api/records', { method: 'DELETE' }); if (epoch !== state.accountEpoch) return; state.accountRecords = []; }
    else localStorage.removeItem(STORAGE_KEY);
    state.savedId = null; state.historyInitialized = false; toast('저장한 기록을 모두 지웠어요.');
  } catch (error) { if (epoch === state.accountEpoch) toast(error.message || '기록을 지우지 못했어요. 다시 시도해 주세요.'); }
  finally { if (epoch === state.accountEpoch) { state.deleting = false; render(true); } }
}

document.addEventListener('submit', event => {
  if (event.target.matches('[data-auth-form]')) { event.preventDefault(); submitAuth(event.target); }
});

function currentPage() { const route = location.hash.slice(1) || 'analysis'; if (METRICS.some(metric => route === `trend/${metric.id}`)) return 'trend'; return ['analysis', 'report', 'history', 'care', 'guide', 'about', 'login', 'register', 'admin', 'profile'].includes(route) ? route : 'analysis'; }
function focusContent(selector = 'h1') { requestAnimationFrame(() => $('#main').querySelector(selector)?.focus({ preventScroll: true })); }
function render(focus = false) {
  const page = currentPage();
  if (page !== 'admin') adminState.credentials = null;
  const authDraft = memberDraft(page);
  const oldCamera = $('[data-scalp-camera]');
  const keepCamera = page === 'analysis' && state.step === 2 && !state.working && oldCamera?.dataset.scope === String(state.accountEpoch);
  if (!keepCamera) window.ScalpCamera?.stop();
  // Keep expanded details and keyboard focus when only asynchronous status changes.
  const opened = $$('details[open][data-details]').map(el => el.dataset.details);
  const focused = document.activeElement;
  const focusId = focused?.id;
  const focusAction = focused?.dataset?.action;
  const focusData = ['date', 'range', 'record'].map(key => [key, focused?.dataset?.[key]]).find(([, value]) => value !== undefined);
  const scrollY = window.scrollY;
  $$('[data-nav]').forEach(link => { const active = link.dataset.nav === page || (page === 'report' && link.dataset.nav === 'analysis') || (page === 'trend' && link.dataset.nav === 'history'); link.classList.toggle('active', active); if (active) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current'); });
  renderAccountMenu();
  $('#main').innerHTML = ({ analysis, report, history, trend: trendsPage, care, guide, about, profile: profilePage, admin: adminPage, login: () => authPage('login'), register: () => authPage('register') })[page]();
  $('#main').dataset.page = page;
  restoreMemberDraft(authDraft);
  const camera = $('[data-scalp-camera]');
  if (camera && keepCamera) camera.replaceWith(oldCamera);
  else if (camera && window.ScalpCamera) { camera.dataset.scope = String(state.accountEpoch); ScalpCamera.mount({ onCapture: acceptCameraPhoto, onMessage: toast }); }
  if (page === 'history') ensureCareLoaded();
  if (page === 'admin') ensureAdminLoaded();
  opened.forEach(key => { const details = $$('details[data-details]').find(el => el.dataset.details === key); if (details) details.open = true; });
  document.title = `${page === 'trend' ? `${selectedTrendMetric().name}의 변화` : { analysis: '사진 분석', report: '분석 결과', history: '내 기록', care: '맞춤 관리', guide: '촬영 가이드', login: '로그인', register: '회원가입', about: '서비스 소개', admin: '관리자 페이지', profile: '내 계정' }[page]} | 딥러닝 기반 AI 두피 관리 서비스`;
  $('#server-status').textContent = !CAN_FETCH ? '서비스 주소에서 접속 필요' : state.health.status === 'ready' ? '분석 준비 완료' : state.health.status === 'loading' ? '분석 준비 중' : '연결 확인 필요';
  $('#server-status').dataset.status = state.health.status;
  $('#server-dot').dataset.status = state.health.status;
  if (focus) focusContent(page === 'analysis' ? '[data-step-title]' : 'h1');
  else {
    const target = (focusId && document.getElementById(focusId))
      || (focusAction && $$('[data-action]').find(el => el.dataset.action === focusAction))
      || (focusData && $$(`[data-${focusData[0]}]`).find(el => el.dataset[focusData[0]] === focusData[1]));
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
function invalidateResult() { state.result = null; state.resultPhotos = []; state.savedId = null; state.saveToken = null; }
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
async function acceptCameraPhoto(file) {
  if (state.working || state.reading.size) { toast('사진 확인이 끝난 뒤 다시 촬영해 주세요.'); return false; }
  if (photoCount() >= 3) { toast('사진은 최대 3장이에요. 바꾸고 싶은 사진을 먼저 지워 주세요.'); return false; }
  await addPhotos([file]);
  return state.photos.some(photo => photo?.file === file);
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
  if (state.authLoading || state.authUnavailable || !photos.length || state.step !== 3 || state.working || state.reading.size || state.health.status !== 'ready' || !CAN_FETCH) return;
  const epoch = state.accountEpoch;
  state.working = true; state.error = ''; state.startedAt = Date.now(); invalidateResult(); render(true);
  elapsedTimer = setInterval(updateElapsed, 1000);
  const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 180000);
  try {
    const body = new FormData(); photos.forEach(photo => body.append('photos', photo.file));
    const response = await fetch('/api/analyze', { method: 'POST', body, signal: controller.signal, headers: accountHeaders() });
    let data; try { data = await response.json(); } catch { throw new Error('결과를 불러오지 못했어요. 선택한 사진은 그대로 있으니 다시 분석해 주세요.'); }
    if (!response.ok) {
      if (response.status === 409 && data.code === 'account_changed') { await refreshChangedAccount(); return; }
      if (response.status === 409 && ['data_changed', 'profile_changed'].includes(data.code)) { await refreshChangedData(); return; }
      const messages = { 400: '사진을 확인하지 못했어요. 사진의 형식과 크기를 살펴본 뒤 다시 골라 주세요.', 413: '사진 용량이 너무 커요. 한 장에 10MB 이하인 사진을 최대 3장 골라 주세요.', 429: '다른 분석이 진행 중이에요. 잠시 기다린 뒤 다시 눌러 주세요.', 503: '분석할 준비가 아직 끝나지 않았어요. 잠시 후 다시 눌러 주세요.' };
      throw new Error(messages[response.status] || '분석을 마치지 못했어요. 사진은 그대로 남아 있으니 잠시 후 다시 시도해 주세요.');
    }
    if (!validRecord(data) || data.photo_count !== photos.length) throw new Error('결과를 확인하지 못했어요. 잠시 후 같은 사진으로 다시 분석해 주세요.');
    if (epoch !== state.accountEpoch) return;
    state.result = storedRecord(data); state.saveToken = typeof data.save_token === 'string' ? data.save_token : null; state.resultPhotos = photos.map(photo => photo.url);
    state.selectedDate = data.date; state.year = Number(data.date.slice(0, 4)); state.month = Number(data.date.slice(5, 7)) - 1;
    state.working = false; go('report'); toast('분석이 끝났어요. 네 가지 결과를 살펴보세요.');
  } catch (error) {
    if (epoch !== state.accountEpoch) return;
    state.error = error.name === 'AbortError' ? '분석이 예상보다 오래 걸려 중단했어요. 사진은 그대로 남아 있으니 잠시 후 다시 시도해 주세요.' : error.name === 'TypeError' ? '연결이 끊어졌어요. 선택한 사진은 그대로 남아 있으니 연결을 확인한 뒤 다시 시도해 주세요.' : error.message;
    state.working = false; go('analysis');
  } finally { clearTimeout(timeout); clearInterval(elapsedTimer); state.working = false; state.startedAt = null; render(true); }
}
async function saveResult() {
  if (!state.result || state.savedId || state.saving || state.authLoading || state.authUnavailable) return;
  const epoch = state.accountEpoch, result = storedRecord(state.result);
  state.saving = true; render();
  try {
    if (state.user) {
      if (!state.saveToken) throw new Error('이 결과를 계정에 저장하려면 사진을 다시 분석해 주세요.');
      const data = await accountRequest('/api/records', { method: 'POST', body: { record: result, save_token: state.saveToken } });
      if (epoch !== state.accountEpoch) return;
      if (!validRecord(data.record)) throw new Error('저장한 기록을 확인하지 못했어요. 다시 시도해 주세요.');
      state.accountRecords = [...state.accountRecords.filter(record => record.id !== data.record.id), storedRecord(data.record)];
      state.recordsError = '';
    } else {
      const records = readRecords();
      if (!records.some(record => record.id === result.id)) localStorage.setItem(STORAGE_KEY, JSON.stringify([...records, result]));
    }
    if (epoch !== state.accountEpoch) return;
    state.savedId = result.id; state.selectedDate = result.date;
    toast('오늘의 결과를 저장했어요. 내 기록에서 다시 볼 수 있어요.');
  } catch (error) { if (epoch === state.accountEpoch) toast(error.message || '기록을 저장하지 못했어요. 다시 시도해 주세요.'); }
  finally { if (epoch === state.accountEpoch) { state.saving = false; render(true); } }
}
function startNew(skipGuide = false) {
  if (state.working) return;
  state.photos.forEach((_, i) => releasePhoto(i)); state.reading.clear(); invalidateResult(); state.error = ''; state.uploadNote = ''; state.step = skipGuide ? 2 : 1; state.maxStep = 2; go('analysis');
}
function changeMonth(delta) {
  if (state.careSaving) return;
  const target = new Date(state.year, state.month + delta, 1);
  state.year = target.getFullYear(); state.month = target.getMonth();
  const prefix = `${state.year}-${String(state.month + 1).padStart(2, '0')}`;
  state.selectedDate = readRecords().filter(r => r.date.startsWith(prefix)).at(-1)?.date || `${prefix}-01`;
  render();
}
document.addEventListener('change', event => {
  if (event.target.matches('[data-trend-month]')) {
    const value = event.target.value;
    if (/^\d{4}-(0[1-9]|1[0-2])$/.test(value) && value <= today().slice(0,7) && Number(value.slice(0,4)) >= 1900) { state.range = 'month'; changeMonth((Number(value.slice(0,4))-state.year)*12+Number(value.slice(5,7))-1-state.month); }
    else render();
    return;
  }
  if (event.target.matches('[data-file]')) { state.error = ''; state.uploadNote = ''; readPhoto(event.target.files[0], Number(event.target.dataset.file)); }
  if (event.target.matches('[data-bulk]')) addPhotos(event.target.files);
  if (event.target.matches('[data-care-check]')) toggleCareCheck(event.target);
  if (event.target.matches('[data-check]')) { const i = Number(event.target.dataset.check); if (event.target.checked) state.checks.add(i); else state.checks.delete(i); $('.check-count').textContent = `${state.checks.size} / 3 확인`; }
});
document.addEventListener('click', event => {
  if (event.target.closest('.skip-link')) {
    event.preventDefault();
    $('#main').focus({ preventScroll: true });
    $('#main').scrollIntoView({ block: 'start', behavior: 'instant' });
    return;
  }
  const remove = event.target.closest('[data-remove]');
  if (remove && !state.working && !state.reading.size) { const index = Number(remove.dataset.remove); releasePhoto(index); invalidateResult(); state.error = ''; state.uploadNote = ''; render(); requestAnimationFrame(() => $(`#photo-${index}`)?.focus({ preventScroll: true })); return; }
  const step = event.target.closest('[data-step]'); if (step && !step.disabled) { setStep(Number(step.dataset.step)); return; }
  const range = event.target.closest('[data-range]'); if (range) { state.range = range.dataset.range; render(); return; }
  const date = event.target.closest('[data-date]'); if (date && !date.disabled && !state.careSaving) { state.selectedDate = date.dataset.date; render(); return; }
  const stored = event.target.closest('[data-record]');
  if (stored && !state.working) { const result = readRecords().find(r => r.id === stored.dataset.record); if (result) { state.result = result; state.resultPhotos = []; state.savedId = result.id; go('report'); } return; }
  const element = event.target.closest('[data-action]'); if (!element || element.disabled) return;
  switch (element.dataset.action) {
    case 'next': setStep(state.step + 1); break;
    case 'back': setStep(state.step - 1); break;
    case 'analyze': analyzePhotos(); break;
    case 'select-photos': if (!state.working) $('#photos-bulk')?.click(); break;
    case 'health': state.health.status = 'loading'; render(); refreshHealth(); break;
    case 'start': if (currentPage() === 'guide' && photoCount()) { state.step = 2; go('analysis'); } else startNew(currentPage() === 'guide'); break;
    case 'new': startNew(true); break;
    case 'download-pdf': downloadPDF(); break;
    case 'save': saveResult(); break;
    case 'prev-month': changeMonth(-1); break;
    case 'next-month': changeMonth(1); break;
    case 'clear-records': clearRecords(); break;
    case 'logout': logout(); break;
    case 'reload-records': loadAccountRecords(); break;
    case 'reload-care': loadCareChecks(); loadCareMonth(); break;
    case 'care-today': state.selectedDate = today(); state.year = Number(today().slice(0,4)); state.month = Number(today().slice(5,7))-1; render(); break;
    case 'retry-account': bootstrapAccount(); break;

  }
});
document.addEventListener('dragover', event => { const zone = event.target.closest('[data-drop]'); if (zone) { event.preventDefault(); if (!state.working) zone.classList.add('is-dragging'); } });
document.addEventListener('dragleave', event => { const zone = event.target.closest('[data-drop]'); if (zone && !zone.contains(event.relatedTarget)) zone.classList.remove('is-dragging'); });
document.addEventListener('drop', event => { const zone = event.target.closest('[data-drop]'); if (zone) { event.preventDefault(); zone.classList.remove('is-dragging'); if (!state.working) addPhotos(event.dataTransfer.files); } });
window.addEventListener('hashchange', () => { render(true); window.scrollTo({ top: 0, behavior: 'instant' }); });
let checkingFocusedAccount = false;
function accountInteractionBusy() {
  return state.authLoading || state.authBusy || state.working || state.saving || state.deleting || state.careSaving || memberState.busy || state.pdfBusy || !!state.reading.size || adminState.mutating || adminState.loading;
}
async function checkAccountOnFocus() {
  if (!CAN_FETCH || document.hidden || state.authUnavailable || checkingFocusedAccount || accountInteractionBusy()) return;
  const epoch = state.accountEpoch;
  checkingFocusedAccount = true;
  try {
    // Returning from a native file picker also focuses the window. Keep the live
    // file input attached so its subsequent change event reaches the document.
    const data = await jsonRequest('/api/auth/me');
    if (epoch !== state.accountEpoch || accountInteractionBusy()) return;
    if (data.user !== null && !validUser(data.user)) return;
    if (data.user?.id !== state.user?.id) await refreshChangedAccount();
    else if (data.user?.role !== state.user?.role) await refreshAccountContext('계정 권한이 변경되어 현재 이용할 수 있는 화면으로 이동했어요.');
    else if (data.user?.result_epoch !== state.user?.result_epoch || data.user?.profile_version !== state.user?.profile_version) await refreshChangedData();
  } catch {
    // Keep the current selection on a transient connection failure. Every
    // account operation still checks the session and account identity server-side.
  } finally { checkingFocusedAccount = false; }
}
window.addEventListener('focus', checkAccountOnFocus);
window.addEventListener('pagehide', () => window.ScalpCamera?.stop());
render();
refreshHealth();
bootstrapAccount();
