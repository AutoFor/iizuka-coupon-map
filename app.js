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
function makeIcon(color) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="36" viewBox="0 0 28 36">
    <path d="M14 0C6.27 0 0 6.27 0 14c0 9.75 14 22 14 22S28 23.75 28 14C28 6.27 21.73 0 14 0z" fill="${color}"/>
    <circle cx="14" cy="14" r="6" fill="white"/>
  </svg>`;
  return L.divIcon({ html: svg, className: '', iconSize: [28,36], iconAnchor: [14,36], popupAnchor: [0,-36] });
}
const icons = { digital: makeIcon('#1a73e8'), paper: makeIcon('#b45309'), both: makeIcon('#16a34a') };
log.info('アイコン生成完了', Object.keys(icons));

// ── Filter & render ───────────────────────────────────────────────────────────
function applyFilters() {
  log.info('applyFilters 開始', { activeCoupon, activeGroups: [...activeGroups], searchQuery });

  clusterGroup.clearLayers();
  markerMap.clear();

  const before = allStores.length;
  filteredStores = allStores.filter(s => {
    if (activeCoupon !== 'all' && s.券種 !== activeCoupon) return false;
    if (activeGroups.size > 0 && !activeGroups.has(s.display_category)) return false;
    if (searchQuery && !s.店舗名称.includes(searchQuery)) return false;
    return true;
  });
  log.info(`フィルター結果: ${before}件 → ${filteredStores.length}件`);

  let markerErrors = 0;
  filteredStores.forEach((s, i) => {
    if (!s.lat || !s.lng) {
      log.warn(`座標なし: [${i}] ${s.店舗名称}`);
      markerErrors++;
      return;
    }
    const marker = L.marker([s.lat, s.lng], { icon: icons[s.券種] || icons.digital });
    if (!icons[s.券種]) {
      log.warn(`未知の券種 "${s.券種}": [${i}] ${s.店舗名称} → digital アイコンで代替`);
    }
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
        ${s.display_category ? `<span class="popup-tag cat">${s.display_category}</span>` : ''}
        ${s.エリア ? `<span class="popup-tag area">${s.エリア}</span>` : ''}
      </div>
      ${linkItems.length ? `<div class="popup-links">${linkItems.join('')}</div>` : ''}`);
    clusterGroup.addLayer(marker);
    markerMap.set(i, marker);
  });

  if (markerErrors > 0) log.warn(`座標エラー ${markerErrors}件スキップ`);
  log.ok(`マーカー配置完了: ${markerMap.size}件`);

  document.getElementById('count-badge').textContent = `${filteredStores.length} 件`;
  renderSidebar();
}

// ── Sidebar ───────────────────────────────────────────────────────────────────
function renderSidebar() {
  log.info(`renderSidebar: ${filteredStores.length}件 描画`);
  const list = document.getElementById('store-list');
  list.innerHTML = '';
  document.getElementById('sidebar-count').textContent = `${filteredStores.length}件`;
  filteredStores.forEach((s, i) => {
    const couponTags = s.券種 === 'both'
      ? `<span class="store-tag digital">デジタル</span><span class="store-tag paper">紙</span>`
      : `<span class="store-tag ${s.券種}">${s.券種 === 'digital' ? 'デジタル' : '紙'}</span>`;
    const div = document.createElement('div');
    div.className = 'store-item';
    div.innerHTML = `
      <div class="store-item-name">${s.店舗名称}</div>
      <div class="store-item-sub">${s.formatted_address || s.エリア || ''}</div>
      ${s.description ? `<div class="store-item-desc">${s.description}</div>` : ''}
      <div class="store-item-tags">
        ${couponTags}
        ${s.display_category ? `<span class="store-tag cat">${s.display_category}</span>` : ''}
      </div>`;
    const onStoreClick = (e) => {
      e.preventDefault();
      log.event(`店舗クリック: [${i}] ${s.店舗名称} (lat:${s.lat}, lng:${s.lng})`);
      if (isMobile()) {
        log.info('モバイル: サイドバーを閉じる');
        closeSidebar();
      }
      setTimeout(() => {
        map.setView([s.lat, s.lng], 17);
        const marker = markerMap.get(i);
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

// ── Event listeners ───────────────────────────────────────────────────────────
log.info('イベントリスナー登録中...');

document.getElementById('search-input').addEventListener('input', e => {
  searchQuery = e.target.value.trim();
  log.event(`検索入力: "${searchQuery}"`);
  applyFilters();
});

document.getElementById('sidebar-toggle').addEventListener('click', () => {
  const closed = document.getElementById('side-panel').classList.contains('closed');
  log.event(`sidebar-toggle クリック (現在: ${closed ? 'closed' : 'open'})`);
  closed ? openSidebar() : closeSidebar();
});

document.getElementById('sidebar-header').addEventListener('click', () => {
  if (!isMobile()) return;
  const expanded = document.getElementById('store-panel').classList.toggle('expanded');
  document.getElementById('sidebar-header').classList.toggle('expanded-arrow', expanded);
  log.event(`sidebar-header タップ → store-panel ${expanded ? '展開' : '折りたたみ'}`);
  setTimeout(() => map.invalidateSize(), 320);
});

document.getElementById('list-fab')?.addEventListener('click', () => {
  log.event('list-fab クリック');
  openSidebar();
});

document.getElementById('sidebar-overlay').addEventListener('click', () => {
  log.event('overlay クリック → closeSidebar');
  closeSidebar();
});

// ── Filter accordion ──────────────────────────────────────────────────────────
function toggleExpand(triggerId, expandId) {
  const trigger  = document.getElementById(triggerId);
  const expand   = document.getElementById(expandId);
  const willOpen = !expand.classList.contains('open');

  // 他方を閉じる
  ['coupon', 'cat'].forEach(key => {
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
      .map(r => ({ ...r, lat: parseFloat(r.lat), lng: parseFloat(r.lng) }));

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
