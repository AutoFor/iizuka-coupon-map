// ── Logger ────────────────────────────────────────────────────────────────────
const log = {
  info:  (...a) => console.log  ('%c[INFO]',  'color:#1a73e8;font-weight:bold', ...a),
  ok:    (...a) => console.log  ('%c[OK]',    'color:#16a34a;font-weight:bold', ...a),
  warn:  (...a) => console.warn ('%c[WARN]',  'color:#b45309;font-weight:bold', ...a),
  error: (...a) => console.error('%c[ERROR]', 'color:#c0392b;font-weight:bold', ...a),
  event: (...a) => console.log  ('%c[EVENT]', 'color:#8e44ad;font-weight:bold', ...a),
};

// ── State ────────────────────────────────────────────────────────────────────
log.info('app.js 読み込み開始');

let allStores = [];
let activeCoupon  = 'all';
let activeGroups  = new Set();
let searchQuery   = '';
let filteredStores = [];
let markerMap = new Map();
const SIDEBAR_PAGE_SIZE = 100;
let visibleStoreCount = SIDEBAR_PAGE_SIZE;
let selectedStoreId = null;
const CONTACT_API_URL = window.APP_CONFIG?.contactApiUrl || '/api/contact';

// ── Map ──────────────────────────────────────────────────────────────────────
log.info('Leaflet マップ初期化中...');
const map = L.map('map').setView([33.640, 130.695], 13);
L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
  attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> © <a href="https://carto.com/">CARTO</a>',
  subdomains: 'abcd',
  maxZoom: 19,
}).addTo(map);
log.ok('マップ初期化完了');

const clusterGroup = L.layerGroup();
map.addLayer(clusterGroup);
log.info('layerGroup 追加済み');

// ── Icons ────────────────────────────────────────────────────────────────────
const CATEGORY_STYLES = {
  'グルメ・飲食':     { color: '#f97316', symbol: '<path fill="white" d="M11 9H9V2H7v7H5V2H3v7c0 2.12 1.66 3.84 3.75 3.97V22h2.5v-9.03C11.34 12.84 13 11.12 13 9V2h-2v7zm5-3v8h2.5v8H21V2c-2.76 0-5 2.24-5 4z"/>' },
  'ショッピング':      { color: '#8b5cf6', symbol: '<path fill="white" d="M18 6h-2c0-2.21-1.79-4-4-4S8 3.79 8 6H6c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-6-2c1.1 0 2 .9 2 2h-4c0-1.1.9-2 2-2zm6 16H6V8h2v2c0 .55.45 1 1 1s1-.45 1-1V8h4v2c0 .55.45 1 1 1s1-.45 1-1V8h2v12z"/>' },
  '美容・健康':       { color: '#ec4899', symbol: '<path fill="white" d="M9 11.75c-.69 0-1.25.56-1.25 1.25s.56 1.25 1.25 1.25 1.25-.56 1.25-1.25-.56-1.25-1.25-1.25zm6 0c-.69 0-1.25.56-1.25 1.25s.56 1.25 1.25 1.25 1.25-.56 1.25-1.25-.56-1.25-1.25-1.25zM12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8 0-.29.02-.58.05-.86 2.36-1.05 4.23-2.98 5.21-5.37C10.71 8.43 13.14 10 16 10c1.06 0 2.08-.25 2.99-.68C19.6 10.44 20 11.17 20 12c0 4.41-3.59 8-8 8z"/>' },
  '住まい・暮らし':   { color: '#16a34a', symbol: '<path fill="white" d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/>' },
  'コンビニ・スーパー': { color: '#2563eb', symbol: '<path fill="white" d="M7 18c-1.1 0-1.99.9-1.99 2S5.9 22 7 22s2-.9 2-2-.9-2-2-2zM1 2v2h2l3.6 7.59-1.35 2.45c-.16.28-.25.61-.25.96C5 16.1 6.1 17 7 17h11v-2H7.42c-.14 0-.25-.11-.25-.25l.03-.12.9-1.63H17c.75 0 1.41-.41 1.75-1.03l3.58-6.49A1 1 0 0 0 21.46 4H5.21l-.94-2H1zm16 16c-1.1 0-1.99.9-1.99 2s.89 2 1.99 2 2-.9 2-2-.9-2-2-2z"/>' },
  'クルマ':           { color: '#64748b', symbol: '<path fill="white" d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z"/>' },
  'エンタメ・レジャー': { color: '#d97706', symbol: '<path fill="white" d="M18 3v2h-2V3H8v2H6V3H4v18h2v-2h2v2h8v-2h2v2h2V3h-2zM8 17H6v-2h2v2zm0-4H6v-2h2v2zm0-4H6V7h2v2zm10 8h-2v-2h2v2zm0-4h-2v-2h2v2zm0-4h-2V7h2v2z"/>' },
  'サービス':         { color: '#0891b2', symbol: '<path fill="white" d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>' },
  '教育・習い事':     { color: '#4f46e5', symbol: '<path fill="white" d="M5 13.18v4L12 21l7-3.82v-4L12 17l-7-3.82zM12 3L1 9l11 6 9-4.91V17h2V9L12 3z"/>' },
  '交通':             { color: '#0f8472', symbol: '<path fill="white" d="M12 2c-4.42 0-8 .5-8 4v9.5C4 17.43 5.57 19 7.5 19L6 20.5v.5h12v-.5L16.5 19c1.93 0 3.5-1.57 3.5-3.5V6c0-3.5-3.58-4-8-4zM7.5 17c-.83 0-1.5-.67-1.5-1.5S6.67 14 7.5 14s1.5.67 1.5 1.5S8.33 17 7.5 17zm9 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm1.5-6H6V6h12v5z"/>' },
  '宿泊':             { color: '#dc2626', symbol: '<path fill="white" d="M7 13c1.66 0 3-1.34 3-3S8.66 7 7 7s-3 1.34-3 3 1.34 3 3 3zm12-6h-8v7H3V5H1v15h2v-3h18v3h2v-9c0-2.21-1.79-4-4-4z"/>' },
  'その他':           { color: '#9ca3af', symbol: '<circle fill="white" cx="12" cy="12" r="5"/><circle fill="white" cx="5" cy="12" r="2"/><circle fill="white" cx="19" cy="12" r="2"/>' },
};

function makeCategoryIcon(pinColor, symbolPath) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="40" viewBox="0 0 32 40">
    <path d="M16 0C7.16 0 0 7.16 0 16c0 11.14 16 24 16 24S32 27.14 32 16C32 7.16 24.84 0 16 0z" fill="${pinColor}" stroke="rgba(0,0,0,0.2)" stroke-width="0.5"/>
    <svg x="4" y="4" width="24" height="24" viewBox="0 0 24 24">${symbolPath}</svg>
  </svg>`;
  return L.divIcon({ html: svg, className: '', iconSize: [32,40], iconAnchor: [16,40], popupAnchor: [0,-40] });
}

const categoryIcons = {};
Object.entries(CATEGORY_STYLES).forEach(([cat, { color, symbol }]) => {
  categoryIcons[cat] = makeCategoryIcon(color, symbol);
});
// 券種フォールバック用
const couponIcons = {
  digital: makeCategoryIcon('#0f8472', '<path fill="white" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/>'),
  paper:   makeCategoryIcon('#b45309', '<path fill="white" d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/>'),
  both:    makeCategoryIcon('#16a34a', '<path fill="white" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/>'),
};
log.info('カテゴリアイコン生成完了', Object.keys(categoryIcons));

// ── Filter & render ───────────────────────────────────────────────────────────
function applyFilters() {
  log.info('applyFilters 開始', { activeCoupon, activeGroups: [...activeGroups], searchQuery });

  clusterGroup.clearLayers();
  markerMap.clear();
  const bounds = map.getBounds();

  const before = allStores.length;
  filteredStores = allStores.filter(s => {
    if (activeCoupon !== 'all' && s.券種 !== activeCoupon) return false;
    if (activeGroups.size > 0 && !activeGroups.has(s.display_category)) return false;
    if (searchQuery && !s.店舗名称.includes(searchQuery)) return false;
    if (!bounds.contains([s.lat, s.lng])) return false;
    return true;
  });
  if (selectedStoreId && !filteredStores.some(s => s._id === selectedStoreId)) {
    selectedStoreId = null;
  }
  log.info(`フィルター結果: ${before}件 → ${filteredStores.length}件`);

  let markerErrors = 0;
  filteredStores.forEach((s, i) => {
    if (!s.lat || !s.lng) {
      log.warn(`座標なし: [${i}] ${s.店舗名称}`);
      markerErrors++;
      return;
    }
    const icon = categoryIcons[s.display_category] || couponIcons[s.券種] || couponIcons.digital;
    if (!categoryIcons[s.display_category]) {
      log.warn(`未知カテゴリ "${s.display_category}": [${i}] ${s.店舗名称} → 券種アイコンで代替`);
    }
    const marker = L.marker([s.lat, s.lng], { icon });
    const couponTags = s.券種 === 'both'
      ? `<span class="popup-tag digital">デジタル</span><span class="popup-tag paper">紙</span>`
      : `<span class="popup-tag ${s.券種}">${s.券種 === 'digital' ? 'デジタル' : '紙'}</span>`;
    const linkItems = [
      s.official_url    && `<a href="${s.official_url}" target="_blank" rel="noopener">公式サイト</a>`,
      s.google_maps_url && `<a href="${s.google_maps_url}" target="_blank" rel="noopener">Google Maps</a>`,
      s.instagram_url   && `<a href="${s.instagram_url}" target="_blank" rel="noopener">Instagram</a>`,
      s.tabelog_url     && `<a href="${s.tabelog_url}" target="_blank" rel="noopener">食べログ</a>`,
      s.hotpepper_url   && `<a href="${s.hotpepper_url}" target="_blank" rel="noopener">ホットペッパー</a>`,
      s.jalan_url       && `<a href="${s.jalan_url}" target="_blank" rel="noopener">じゃらん</a>`,
    ].filter(Boolean);
    marker.bindPopup(`
      <div class="popup-title">${s.店舗名称}</div>
      <div class="popup-address">${s.formatted_address || ''}</div>
      ${s.description ? `<div class="popup-desc">${s.description}</div>` : ''}
      ${s.phone ? `<div class="popup-phone"><a href="tel:${s.phone}">${s.phone}</a></div>` : ''}
      <div class="popup-tags">
        ${couponTags}
        ${s.display_category ? `<span class="popup-tag cat" style="background:${CATEGORY_STYLES[s.display_category]?.color || 'var(--dark)'}">${s.display_category}</span>` : ''}
        ${s.エリア ? `<span class="popup-tag area">${s.エリア}</span>` : ''}
      </div>
      ${linkItems.length ? `<div class="popup-links">${linkItems.join('')}</div>` : ''}`);
    marker.on('click', () => {
      selectedStoreId = s._id;
      log.event(`地図上で店舗選択: ${s.店舗名称}`);
      renderSidebar();
    });
    clusterGroup.addLayer(marker);
    markerMap.set(s._id, marker);
  });

  if (markerErrors > 0) log.warn(`座標エラー ${markerErrors}件スキップ`);
  log.ok(`マーカー配置完了: ${markerMap.size}件`);

  document.getElementById('count-badge').textContent = `${filteredStores.length} 件`;
  visibleStoreCount = SIDEBAR_PAGE_SIZE;
  renderSidebar();
}

// ── Sidebar ───────────────────────────────────────────────────────────────────
function renderSidebar() {
  log.info(`renderSidebar: ${filteredStores.length}件 描画`);
  const list = document.getElementById('store-list');
  const loadMoreButton = document.getElementById('load-more-button');
  const orderedStores = selectedStoreId
    ? [
        ...filteredStores.filter(s => s._id === selectedStoreId),
        ...filteredStores.filter(s => s._id !== selectedStoreId),
      ]
    : filteredStores;
  list.innerHTML = '';
  document.getElementById('sidebar-count').textContent = `${filteredStores.length}件`;
  orderedStores.slice(0, visibleStoreCount).forEach((s, i) => {
    const couponTags = s.券種 === 'both'
      ? `<span class="store-tag digital">デジタル</span><span class="store-tag paper">紙</span>`
      : `<span class="store-tag ${s.券種}">${s.券種 === 'digital' ? 'デジタル' : '紙'}</span>`;
    const div = document.createElement('div');
    div.className = `store-item${s._id === selectedStoreId ? ' active' : ''}`;
    div.innerHTML = `
      <div class="store-item-name">${s.店舗名称}</div>
      <div class="store-item-sub">${s.formatted_address || s.エリア || ''}</div>
      ${s.description ? `<div class="store-item-desc">${s.description}</div>` : ''}
      <div class="store-item-tags">
        ${couponTags}
        ${s.display_category ? `<span class="store-tag cat" style="background:${CATEGORY_STYLES[s.display_category]?.color || 'var(--dark)'}">${s.display_category}</span>` : ''}
      </div>`;
    const onStoreClick = (e) => {
      e.preventDefault();
      selectedStoreId = s._id;
      log.event(`店舗クリック: [${i}] ${s.店舗名称} (lat:${s.lat}, lng:${s.lng})`);
      if (isMobile()) {
        log.info('モバイル: サイドバーを閉じる');
        closeSidebar();
      }
      setTimeout(() => {
        map.setView([s.lat, s.lng], 17);
        const marker = markerMap.get(s._id);
        if (marker) {
          marker.openPopup();
          log.info(`ポップアップ表示: ${s.店舗名称}`);
        } else {
          log.warn(`マーカーが見つからない: index=${i}`);
        }
      }, isMobile() ? 350 : 0);
    };
    div.addEventListener('click', onStoreClick);
    div.addEventListener('touchend', onStoreClick);
    list.appendChild(div);
  });
  if (loadMoreButton) {
    const hasMore = visibleStoreCount < orderedStores.length;
    loadMoreButton.hidden = !hasMore;
    if (hasMore) {
      loadMoreButton.textContent = `さらに表示 (${Math.min(SIDEBAR_PAGE_SIZE, orderedStores.length - visibleStoreCount)}件)`;
    }
  }
  log.ok('renderSidebar 完了');
}

// ── Sidebar open/close ────────────────────────────────────────────────────────
function isMobile() { return window.innerWidth <= 768; }

function openSidebar() {
  log.event('openSidebar');
  document.getElementById('side-panel').classList.remove('closed');
  document.getElementById('sidebar-overlay').classList.add('visible');
  setTimeout(() => map.invalidateSize(), 310);
}
function closeSidebar() {
  log.event('closeSidebar');
  document.getElementById('side-panel').classList.add('closed');
  document.getElementById('sidebar-overlay').classList.remove('visible');
  setTimeout(() => map.invalidateSize(), 310);
}

function openContactModal() {
  document.getElementById('contact-modal').hidden = false;
  document.getElementById('contact-modal-backdrop').hidden = false;
  document.body.style.overflow = 'hidden';
  log.event('お問い合わせモーダルを開く');
}

function closeContactModal() {
  document.getElementById('contact-modal').hidden = true;
  document.getElementById('contact-modal-backdrop').hidden = true;
  document.body.style.overflow = '';
  log.event('お問い合わせモーダルを閉じる');
}

// ── Event listeners ───────────────────────────────────────────────────────────
log.info('イベントリスナー登録中...');

document.getElementById('search-input').addEventListener('input', e => {
  searchQuery = e.target.value.trim();
  log.event(`検索入力: "${searchQuery}"`);
  applyFilters();
});

document.getElementById('sidebar-header').addEventListener('click', () => {
  if (!isMobile()) return;
  const expanded = document.getElementById('store-panel').classList.toggle('expanded');
  document.getElementById('sidebar-header').classList.toggle('expanded-arrow', expanded);
  log.event(`sidebar-header タップ → store-panel ${expanded ? '展開' : '折りたたみ'}`);
  setTimeout(() => map.invalidateSize(), 320);
});

document.getElementById('sidebar-overlay').addEventListener('click', () => {
  log.event('overlay クリック → closeSidebar');
  closeSidebar();
});

map.on('moveend zoomend', () => {
  if (allStores.length === 0) return;
  log.event('地図範囲変更 → applyFilters');
  applyFilters();
});

document.getElementById('load-more-button')?.addEventListener('click', () => {
  visibleStoreCount = Math.min(visibleStoreCount + SIDEBAR_PAGE_SIZE, filteredStores.length);
  log.event(`さらに表示: ${visibleStoreCount}件まで描画`);
  renderSidebar();
});

document.getElementById('contact-modal-open')?.addEventListener('click', openContactModal);
document.getElementById('contact-modal-close')?.addEventListener('click', closeContactModal);
document.getElementById('contact-modal-backdrop')?.addEventListener('click', closeContactModal);

function updateContactApplicantFields() {
  const applicantType = document.getElementById('contact-applicant-type')?.value || '';
  const category = document.getElementById('contact-category')?.value || '';
  const isCorporate = applicantType === 'corporate';
  const needsFixFields = category === '掲載情報の修正';
  const needsDeleteFields = category === '掲載削除';
  const needsNewStoreFields = category === '新規掲載';
  const companyField = document.getElementById('contact-company-field');
  const replyEmailField = document.getElementById('contact-reply-email-field');
  const companyInput = document.getElementById('contact-company');
  const replyEmailInput = document.getElementById('contact-reply-email');
  const storeNameField = document.getElementById('contact-store-name-field');
  const fixDetailField = document.getElementById('contact-fix-detail-field');
  const deleteReasonField = document.getElementById('contact-delete-reason-field');
  const newStoreNameField = document.getElementById('contact-new-store-name-field');
  const storeUrlField = document.getElementById('contact-store-url-field');
  const storeSummaryField = document.getElementById('contact-store-summary-field');
  const storeNameInput = document.getElementById('contact-store-name');
  const fixDetailInput = document.getElementById('contact-fix-detail');
  const deleteReasonInput = document.getElementById('contact-delete-reason');
  const newStoreNameInput = document.getElementById('contact-new-store-name');
  const storeUrlInput = document.getElementById('contact-store-url');
  const storeSummaryInput = document.getElementById('contact-store-summary');

  companyField.hidden = !isCorporate;
  replyEmailField.hidden = !isCorporate;
  storeNameField.hidden = !(needsFixFields || needsDeleteFields);
  fixDetailField.hidden = !needsFixFields;
  deleteReasonField.hidden = !needsDeleteFields;
  newStoreNameField.hidden = !needsNewStoreFields;
  storeUrlField.hidden = !needsNewStoreFields;
  storeSummaryField.hidden = !needsNewStoreFields;

  if (!isCorporate) {
    companyInput.value = '';
    replyEmailInput.value = '';
  }

  if (!(needsFixFields || needsDeleteFields)) {
    storeNameInput.value = '';
  }

  if (!needsFixFields) {
    fixDetailInput.value = '';
  }

  if (!needsDeleteFields) {
    deleteReasonInput.value = '';
  }

  if (!needsNewStoreFields) {
    newStoreNameInput.value = '';
    storeUrlInput.value = '';
    storeSummaryInput.value = '';
  }
}

document.getElementById('contact-applicant-type')?.addEventListener('change', updateContactApplicantFields);
document.getElementById('contact-category')?.addEventListener('change', updateContactApplicantFields);
updateContactApplicantFields();

document.getElementById('contact-form')?.addEventListener('submit', e => {
  e.preventDefault();

  const submitButton = e.currentTarget.querySelector('button[type="submit"]');
  const applicantType = document.getElementById('contact-applicant-type')?.value.trim() || '';
  const category = document.getElementById('contact-category')?.value.trim() || '';
  const company = applicantType === 'corporate'
    ? (document.getElementById('contact-company')?.value.trim() || '')
    : '';
  const replyEmail = applicantType === 'corporate'
    ? (document.getElementById('contact-reply-email')?.value.trim() || '')
    : '';
  const storeName = document.getElementById('contact-store-name')?.value.trim() || '';
  const fixDetail = document.getElementById('contact-fix-detail')?.value.trim() || '';
  const deleteReason = document.getElementById('contact-delete-reason')?.value.trim() || '';
  const newStoreName = document.getElementById('contact-new-store-name')?.value.trim() || '';
  const storeUrl = document.getElementById('contact-store-url')?.value.trim() || '';
  const storeSummary = document.getElementById('contact-store-summary')?.value.trim() || '';
  const name = document.getElementById('contact-name')?.value.trim() || '';
  const email = document.getElementById('contact-email')?.value.trim() || '';
  const message = document.getElementById('contact-message')?.value.trim() || '';
  const note = document.getElementById('contact-note');

  if (!applicantType) {
    note.textContent = 'お問い合わせ種別を選択してください。';
    return;
  }

  if (!category) {
    note.textContent = 'お問い合わせカテゴリを選択してください。';
    return;
  }

  if (applicantType === 'corporate' && !company) {
    note.textContent = '御社名を入力してください。';
    return;
  }

  if ((category === '掲載情報の修正' || category === '掲載削除') && !storeName) {
    note.textContent = '対象の店舗名を入力してください。';
    return;
  }

  if (category === '掲載情報の修正' && !fixDetail) {
    note.textContent = 'どこを直したいかを入力してください。';
    return;
  }

  if (category === '掲載削除' && !deleteReason) {
    note.textContent = '削除理由を入力してください。';
    return;
  }

  if (category === '新規掲載' && !newStoreName) {
    note.textContent = '新規店舗名を入力してください。';
    return;
  }

  if (!name) {
    note.textContent = 'お名前を入力してください。';
    return;
  }

  if (!email) {
    note.textContent = 'メールアドレスを入力してください。';
    return;
  }

  if (!message) {
    note.textContent = 'お問い合わせ内容を入力してください。';
    return;
  }

  note.textContent = '送信中です。しばらくお待ちください。';
  submitButton.disabled = true;

  fetch(CONTACT_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      applicantType,
      category,
      company,
      replyEmail,
      storeName,
      fixDetail,
      deleteReason,
      newStoreName,
      storeUrl,
      storeSummary,
      name,
      email,
      message,
    }),
  })
    .then(async response => {
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || '送信に失敗しました。');
      }
      document.getElementById('contact-form').reset();
      note.textContent = 'お問い合わせを送信しました。通常は 2 営業日以内に確認します。';
    })
    .catch(error => {
      log.error('お問い合わせ送信失敗', error);
      note.textContent = error.message || '送信に失敗しました。時間をおいて再度お試しください。';
    })
    .finally(() => {
      submitButton.disabled = false;
    });
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !document.getElementById('contact-modal').hidden) {
    closeContactModal();
  }
});

// ── Filter accordion ──────────────────────────────────────────────────────────
function toggleExpand(triggerId, expandId) {
  const trigger  = document.getElementById(triggerId);
  const expand   = document.getElementById(expandId);
  const willOpen = !expand.classList.contains('open');

  // 他方を閉じる
  ['coupon', 'cat', 'site'].forEach(key => {
    if (triggerId !== `${key}-trigger-row`) {
      document.getElementById(`${key}-trigger-row`).classList.remove('open');
      document.getElementById(`${key}-expand`).classList.remove('open');
    }
  });

  trigger.classList.toggle('open', willOpen);
  expand.classList.toggle('open', willOpen);
  log.event(`${triggerId} トグル → ${willOpen ? '展開' : '折りたたみ'}`);
}

document.getElementById('coupon-trigger-row').addEventListener('click', () => {
  toggleExpand('coupon-trigger-row', 'coupon-expand');
});
document.getElementById('cat-trigger-row').addEventListener('click', () => {
  toggleExpand('cat-trigger-row', 'cat-expand');
});
document.getElementById('site-trigger-row').addEventListener('click', () => {
  toggleExpand('site-trigger-row', 'site-expand');
});

// ── Coupon chip click ─────────────────────────────────────────────────────────
function handleCouponChipClick(btn) {
  activeCoupon = btn.dataset.coupon;
  document.getElementById('coupon-sheet-chips').querySelectorAll('.chip').forEach(el => el.classList.remove('active'));
  btn.classList.add('active');
  updateCouponTriggerLabel();
  log.event(`券種フィルター変更: "${activeCoupon}"`);
  applyFilters();
}

document.getElementById('coupon-sheet-chips').addEventListener('click', e => {
  const btn = e.target.closest('.chip');
  if (btn) handleCouponChipClick(btn);
});

// ── Category chip click ───────────────────────────────────────────────────────
function handleCatChipClick(btn) {
  const cat = btn.dataset.cat;
  if (cat === 'all') {
    activeGroups.clear();
    log.event('カテゴリフィルター: すべてクリア');
  } else {
    if (activeGroups.has(cat)) { activeGroups.delete(cat); log.event(`カテゴリ解除: "${cat}"`); }
    else                       { activeGroups.add(cat);    log.event(`カテゴリ追加: "${cat}"`); }
  }
  const container = document.getElementById('cat-sheet-chips');
  container.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
  if (activeGroups.size === 0) {
    container.querySelector('.chip[data-cat="all"]').classList.add('active');
  } else {
    activeGroups.forEach(g => {
      const c = container.querySelector(`.chip[data-cat="${g}"]`);
      if (c) c.classList.add('active');
    });
  }
  updateCatTriggerLabel();
  log.info('現在のactiveGroups:', [...activeGroups]);
  applyFilters();
}

document.getElementById('cat-sheet-chips').addEventListener('click', e => {
  const btn = e.target.closest('.chip');
  if (btn) handleCatChipClick(btn);
});

log.ok('イベントリスナー登録完了');

const COUPON_LABELS = { all: 'すべて表示', both: '両方OK', digital: 'デジタルのみ', paper: '紙のみ' };

function updateCouponTriggerLabel() {
  document.getElementById('coupon-trigger-label').textContent = COUPON_LABELS[activeCoupon] || 'すべて表示';
}
function updateCatTriggerLabel() {
  const label = activeGroups.size === 0
    ? 'すべて'
    : [...activeGroups].join('・');
  document.getElementById('cat-trigger-label').textContent = label;
}

// ── Build category chips ──────────────────────────────────────────────────────
function buildCatChips(stores) {
  log.info('buildCatChips 開始');
  const counts = {};
  stores.forEach(s => {
    if (s.display_category) counts[s.display_category] = (counts[s.display_category] || 0) + 1;
    else log.warn(`display_category なし: ${s.店舗名称}`);
  });
  log.info('カテゴリ集計:', counts);

  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);

  function addChips(container) {
    sorted.forEach(([cat, count]) => {
      const btn = document.createElement('button');
      btn.className = 'chip';
      btn.dataset.cat = cat;
      btn.textContent = `${cat} (${count})`;
      container.appendChild(btn);
    });
  }

  addChips(document.getElementById('cat-sheet-chips'));
  log.ok(`カテゴリチップ生成: ${sorted.length}種`);
}

// ── Load CSV ──────────────────────────────────────────────────────────────────
log.info('CSV 読み込み開始: csv/stores_merged.csv');
Papa.parse('csv/stores_merged.csv', {
  download: true,
  header: true,
  skipEmptyLines: true,
  complete(results) {
    log.info(`CSV パース完了: ${results.data.length}行 (エラー: ${results.errors.length}件)`);
    if (results.errors.length > 0) {
      log.warn('CSV パースエラー:', results.errors);
    }

    const raw = results.data;
    const noCoord = raw.filter(r => !r.lat || !r.lng || isNaN(parseFloat(r.lat)));
    if (noCoord.length > 0) {
      log.warn(`座標なし/不正でスキップ: ${noCoord.length}件`, noCoord.map(r => r.店舗名称));
    }

    allStores = raw
      .filter(r => r.lat && r.lng && !isNaN(parseFloat(r.lat)))
      .map((r, index) => ({ ...r, _id: index, lat: parseFloat(r.lat), lng: parseFloat(r.lng) }));

    log.ok(`有効店舗数: ${allStores.length}件`);
    log.info('カラム一覧:', Object.keys(allStores[0] || {}));

    buildCatChips(allStores);
    applyFilters();
    document.getElementById('loading').classList.add('hidden');

    log.ok('初期化完了 🎉');
  },
  error(err) {
    log.error('CSV 読み込み失敗:', err.message);
    document.getElementById('loading').textContent = 'データ読み込み失敗: ' + err.message;
  }
});
