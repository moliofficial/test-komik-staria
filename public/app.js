(function () {
  'use strict';

  const API_BASE = '/api';
  let cache = {};
  let currentKomik = null;
  let homeData = null;
  let pendingReaderEpIdx = null;
  let favorites = JSON.parse(localStorage.getItem('satriad_favorites') || '[]');
  let readingHistory = JSON.parse(localStorage.getItem('satriad_history') || 'null');

  // ── Helpers ──────────────────────────────────────────────────────────────────

  async function fetchAPI(endpoint) {
    if (cache[endpoint]) return cache[endpoint];
    try {
      const res = await fetch(`${API_BASE}${endpoint}`);
      if (!res.ok) throw new Error('API Error ' + res.status);
      const data = await res.json();
      cache[endpoint] = data;
      return data;
    } catch (e) {
      console.error('Fetch error:', e);
      return null;
    }
  }

  function generateColorHash(str) {
    let hash = 0;
    for (let i = 0; i < (str || '').length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash = hash & hash;
    }
    const colors = ['#2c4a3a','#3a2a4a','#5a3a2a','#2a4a5a','#3a5a3a','#4a3a5a','#5a4a3a','#8b1a1a','#4a2e4a'];
    return colors[Math.abs(hash) % colors.length];
  }

  function svgPlaceholder(text, color) {
    const safe = (text || '').substring(0, 20).replace(/[<>"'&]/g, '');
    return `<svg preserveAspectRatio="xMidYMid slice" width="100%" height="100%" viewBox="0 0 200 300"><rect width="100%" height="100%" fill="${color}"/><text x="10" y="150" fill="#fff" font-size="14" font-weight="bold">${safe}</text></svg>`;
  }

  function showToast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2500);
  }

  function switchPage(pageId) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const target = document.getElementById(pageId + 'Page');
    if (target) target.classList.add('active');
    document.querySelectorAll('.lnb .item').forEach(item => {
      item.classList.toggle('active', item.dataset.page === pageId);
    });
    window.scrollTo(0, 0);

    if (pageId === 'home') loadHomeData();
    else if (pageId === 'popular') loadPopular();
    else if (pageId === 'favoritku') renderFavoriteList();
  }

  function bindDetailLinks() {
    document.querySelectorAll('[data-link]').forEach(el => {
      el.removeEventListener('click', handleDetailClick);
      el.addEventListener('click', handleDetailClick);
    });
  }

  function handleDetailClick(e) {
    e.preventDefault();
    e.stopPropagation();
    const link = this.getAttribute('data-link');
    if (link && link !== '#') showDetail(link);
  }

  // ── Render helpers ────────────────────────────────────────────────────────────

  function renderGrid(containerId, data) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = data.map(item => {
      const url = item.url || item.link || '#';
      const color = generateColorHash(url);
      return `
        <div class="grid-item" data-link="${url}">
          <div class="image_wrap">
            <img src="${item.thumb || item.thumbnail || ''}" alt="${item.title || ''}"
                 style="width:100%;height:100%;object-fit:cover;"
                 onerror="this.style.display='none';this.parentElement.innerHTML=\`${svgPlaceholder(item.title, color)}\`">
          </div>
          <div class="title">${item.title || ''}</div>
          <div class="genre">${item.lastChapter || item.rating || ''}</div>
        </div>`;
    }).join('');
    bindDetailLinks();
  }

  function renderRankingList(containerId, items) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = items.slice(0, 15).map((item, index) => {
      const url = item.url || '#';
      const color = generateColorHash(url);
      return `
        <li class="item">
          <a class="link" data-link="${url}">
            <div class="ranking_number">
              <div class="ranking_num">${index + 1}</div>
            </div>
            <div class="image_wrap">
              <img src="${item.thumb || item.thumbnail || ''}" alt="${item.title || ''}" loading="lazy"
                   onerror="this.style.display='none';this.parentElement.innerHTML=\`${svgPlaceholder(item.title, color)}\`">
            </div>
            <div class="info_text">
              <strong class="title">${item.title || ''}</strong>
              <div class="genre">${(item.genres || []).slice(0,2).join(' · ') || item.rating || ''}</div>
            </div>
          </a>
        </li>`;
    }).join('');
    bindDetailLinks();
  }

  // ── Home ──────────────────────────────────────────────────────────────────────

  async function loadHomeData() {
    if (homeData) {
      renderHomeContent(homeData);
      return;
    }
    const data = await fetchAPI('/home');
    if (!data || !data.status) return;
    homeData = data.data;
    renderHomeContent(homeData);
  }

  function renderHomeContent(d) {
    // Trending hari ini
    renderRankingList('trendingList', d.popularToday || []);
    // Update terbaru
    renderGrid('latestGrid', d.latest || []);
    updateContinueReading();
  }

  // ── Popular ───────────────────────────────────────────────────────────────────

  let popularData = null;
  let activePopularTab = 'weekly';

  async function loadPopular() {
    const loading = document.getElementById('popularLoading');
    if (popularData) {
      renderPopularTab(activePopularTab);
      return;
    }
    if (loading) loading.style.display = 'flex';
    const data = await fetchAPI('/home');
    if (loading) loading.style.display = 'none';
    if (!data || !data.status) return;
    popularData = data.data.popularSerial || { weekly: [], monthly: [], alltime: [] };
    renderPopularTab(activePopularTab);
  }

  function renderPopularTab(tab) {
    activePopularTab = tab;
    document.querySelectorAll('#popularTab .button').forEach(b => {
      b.classList.toggle('active', b.dataset.tab === tab);
    });
    renderRankingList('popularList', (popularData || {})[tab] || []);
  }

  // ── Detail ────────────────────────────────────────────────────────────────────

  function showDetail(comicUrl) {
    document.getElementById('detailTitleHeader').textContent = 'Loading...';
    document.getElementById('detailGenre').textContent = '';
    document.getElementById('detailDesc').textContent = 'Mengambil detail komik...';
    document.getElementById('episodeList').innerHTML = '<div class="loading-spinner"></div>';
    switchPage('detail');

    fetchAPI(`/detail?url=${encodeURIComponent(comicUrl)}`).then(res => {
      if (!res || !res.status) { showToast('Gagal mengambil detail'); switchPage('home'); return; }

      const data = res.data;
      currentKomik = { ...data, url: comicUrl };

      document.getElementById('detailTitleHeader').textContent = data.title;
      document.getElementById('detailGenre').textContent =
        `${(data.genres || []).slice(0, 3).join(' · ')}${data.info?.pengarang ? ' · ' + data.info.pengarang : ''}`;
      document.getElementById('detailDesc').textContent = data.synopsis || '';
      document.getElementById('detailRating').textContent = data.rating ? '★ ' + data.rating : '';
      document.getElementById('detailViews').textContent = data.followedBy || '';
      document.getElementById('episodeCount').textContent = `${(data.chapters || []).length} Chapter`;

      const color = generateColorHash(comicUrl);
      document.getElementById('detailPoster').innerHTML =
        `<img src="${data.thumb || ''}" alt="${data.title}"
           style="width:100%;height:100%;object-fit:cover;"
           onerror="this.style.display='none';this.parentElement.innerHTML=\`${svgPlaceholder(data.title, color)}\`">`;

      let epsHtml = '';
      if (data.chapters && data.chapters.length > 0) {
        data.chapters.forEach((ch, idx) => {
          epsHtml += `
            <div class="episode-item" data-ep="${idx}" data-url="${ch.url}">
              <div class="episode-thumb">
                <svg preserveAspectRatio="xMidYMid slice" width="100%" height="100%">
                  <rect width="100%" height="100%" fill="${color}"/>
                  <text x="8" y="35" fill="#fff" font-size="11" font-weight="bold">Ch.${idx + 1}</text>
                </svg>
              </div>
              <div class="episode-info">
                <div class="episode-num">${ch.name}</div>
                <div class="episode-date">${ch.date || ''}</div>
              </div>
            </div>`;
        });
      } else {
        epsHtml = '<p style="color:#888;padding:20px;text-align:center;">Belum ada chapter tersedia.</p>';
      }
      document.getElementById('episodeList').innerHTML = epsHtml;

      const isFav = favorites.some(f => f.url === comicUrl);
      const favBtn = document.getElementById('detailFavoriteBtn');
      document.getElementById('favoriteBtnText').textContent = isFav ? 'Hapus dari Favorit' : 'Tambah ke Favorit';
      isFav ? favBtn.classList.add('active') : favBtn.classList.remove('active');
    });
  }

  // ── Reader ────────────────────────────────────────────────────────────────────

  function isAdultContent() {
    if (!currentKomik) return false;
    const rating = (currentKomik.info?.rating || currentKomik.info?.age_rating || '').toLowerCase();
    return rating.includes('18') || rating.includes('dewasa') || rating.includes('mature');
  }

  function showAgeModal(epIdx) {
    pendingReaderEpIdx = epIdx;
    document.getElementById('ageModalOverlay').style.display = 'block';
    document.getElementById('ageModal').style.display = 'block';
  }

  function hideAgeModal() {
    document.getElementById('ageModalOverlay').style.display = 'none';
    document.getElementById('ageModal').style.display = 'none';
    pendingReaderEpIdx = null;
  }

  function requestOpenReader(epIdx) {
    if (!currentKomik) return;
    isAdultContent() ? showAgeModal(epIdx) : proceedToReader(epIdx);
  }

  async function proceedToReader(epIdx) {
    if (!currentKomik?.chapters) return;
    const ch = currentKomik.chapters[epIdx];
    if (!ch) return;

    const color = generateColorHash(currentKomik.url);
    document.getElementById('readerTitle').textContent = `${currentKomik.title} - ${ch.name}`;
    document.getElementById('readerContent').innerHTML = '<div class="loading-spinner" style="height:200px;"></div>';
    document.getElementById('readerMode').classList.add('active');
    document.body.style.overflow = 'hidden';

    // Thumbnails
    const thumbsHtml = currentKomik.chapters.map((c, i) => `
      <div class="reader-thumb-item ${i === epIdx ? 'active' : ''}" data-reader-ep="${i}">
        <div class="reader-thumb-img">
          <svg preserveAspectRatio="xMidYMid slice" width="100%" height="100%">
            <rect width="100%" height="100%" fill="${color}"/>
            <text x="8" y="35" fill="#fff" font-size="10">Ch.${i + 1}</text>
          </svg>
        </div>
        <div class="reader-thumb-ep">${c.name}</div>
      </div>`).join('');
    document.getElementById('readerThumbnails').innerHTML = thumbsHtml;
    document.querySelector('.reader-thumb-item.active')?.scrollIntoView({ inline: 'center', behavior: 'smooth' });
    document.querySelectorAll('.reader-thumb-item').forEach(item => {
      item.addEventListener('click', function () { requestOpenReader(parseInt(this.dataset.readerEp)); });
    });

    const result = await fetchAPI(`/chapter?url=${encodeURIComponent(ch.url)}`);
    if (!result?.status || !result.data?.images?.length) {
      document.getElementById('readerContent').innerHTML =
        '<p style="color:#aaa;text-align:center;padding:40px;">Gagal memuat chapter.</p>';
      return;
    }

    document.getElementById('readerContent').innerHTML = result.data.images.map((src, i) =>
      `<div class="reader-page"><img src="${src}" alt="Halaman ${i + 1}" style="width:100%;display:block;" loading="${i < 3 ? 'eager' : 'lazy'}" onerror="this.style.display='none'"></div>`
    ).join('');

    readingHistory = { url: currentKomik.url, title: currentKomik.title, episode: ch.name, epIdx, color };
    localStorage.setItem('satriad_history', JSON.stringify(readingHistory));
    updateContinueReading();
  }

  // ── Continue Reading ──────────────────────────────────────────────────────────

  function updateContinueReading() {
    const section = document.getElementById('continueReadingSection');
    if (readingHistory?.url) {
      section.style.display = 'block';
      document.getElementById('continueTitle').textContent = readingHistory.title;
      document.getElementById('continueEpisode').textContent = `${readingHistory.episode} · Lanjutkan`;
      document.getElementById('continueThumb').innerHTML = `
        <svg preserveAspectRatio="xMidYMid slice" width="100%" height="100%">
          <rect width="100%" height="100%" fill="${readingHistory.color || '#2c4a3a'}"/>
          <text x="8" y="35" fill="#fff" font-size="11">Baca</text>
        </svg>`;
    } else {
      section.style.display = 'none';
    }
  }

  // ── Favorites ─────────────────────────────────────────────────────────────────

  function renderFavoriteList() {
    const container = document.getElementById('favoriteList');
    const empty = document.getElementById('favoriteEmptyState');
    if (!favorites.length) {
      container.style.display = 'none';
      empty.style.display = 'block';
    } else {
      empty.style.display = 'none';
      container.style.display = 'block';
      container.innerHTML = favorites.map(item => {
        const color = generateColorHash(item.url);
        return `
          <li class="item">
            <a class="link" data-link="${item.url}">
              <div class="image_wrap">
                <img src="${item.thumb || ''}" alt="${item.title}"
                     style="width:100%;height:100%;object-fit:cover;"
                     onerror="this.style.display='none'"/>
              </div>
              <div class="info_text" style="margin-left:8px;">
                <strong class="title">${item.title}</strong>
                <div class="genre">${(item.genres || []).join(', ') || 'Komik'}</div>
              </div>
            </a>
          </li>`;
      }).join('');
      bindDetailLinks();
    }
  }

  // ── Genre Page ────────────────────────────────────────────────────────────────

  async function showGenrePage(slug, name) {
    document.getElementById('genrePageTitle').textContent = name || 'Genre';
    document.getElementById('genreGrid').innerHTML = '';
    const loading = document.getElementById('genreLoading');
    loading.style.display = 'flex';
    switchPage('genre');

    const result = await fetchAPI(`/genre?slug=${encodeURIComponent(slug)}`);
    loading.style.display = 'none';
    if (result?.status) renderGrid('genreGrid', result.data || []);
    else showToast('Gagal memuat genre');
  }

  async function loadGenreList() {
    const container = document.getElementById('genreList');
    const result = await fetchAPI('/genre');
    if (!result?.status) return;
    container.innerHTML = (result.data || []).map(g =>
      `<div class="category-box" data-slug="${g.slug}" data-name="${g.name}">${g.name}</div>`
    ).join('');
    container.querySelectorAll('.category-box').forEach(box => {
      box.addEventListener('click', function () {
        document.getElementById('drawer').classList.remove('active');
        document.getElementById('drawerOverlay').classList.remove('active');
        showGenrePage(this.dataset.slug, this.dataset.name);
      });
    });
  }

  // ── Search ────────────────────────────────────────────────────────────────────

  async function performSearch(keyword) {
    const resultsContainer = document.getElementById('searchResults');
    resultsContainer.innerHTML = '<div class="loading-spinner"></div>';
    const cacheKey = `/search?q=${encodeURIComponent(keyword)}`;
    delete cache[cacheKey];
    const data = await fetchAPI(cacheKey);
    if (!data?.data?.length) {
      resultsContainer.innerHTML = '<p style="color:#888;text-align:center;padding:20px;">Tidak ditemukan</p>';
      return;
    }
    resultsContainer.innerHTML = data.data.slice(0, 20).map(c => {
      const color = generateColorHash(c.url || c.title);
      return `
        <div class="search-result-item" data-link="${c.url}">
          <div style="position:relative;width:50px;height:65px;border-radius:6px;background:${color};overflow:hidden;flex-shrink:0;">
            <img src="${c.thumb || ''}" alt="${c.title}" style="width:100%;height:100%;object-fit:cover;" onerror="this.style.display='none'"/>
          </div>
          <div>
            <strong>${c.title}</strong>
            <div style="font-size:12px;color:#888;">${c.rating || ''}</div>
          </div>
        </div>`;
    }).join('');
    bindDetailLinks();
  }

  // ── Event Listeners ───────────────────────────────────────────────────────────

  function initEventListeners() {
    // Search
    const searchBtn = document.getElementById('searchBtn');
    const searchContainer = document.getElementById('searchContainer');
    const searchInput = document.getElementById('searchInput');
    const searchClear = document.getElementById('searchClear');
    const searchBackBtn = document.getElementById('searchBackBtn');
    let searchTimer;

    searchBtn.addEventListener('click', () => {
      searchContainer.classList.toggle('active');
      if (searchContainer.classList.contains('active')) {
        searchInput.focus();
        searchBackBtn.classList.add('show');
        document.getElementById('navWrapper').style.display = 'none';
      }
    });
    searchInput.addEventListener('input', function () {
      searchClear.style.display = this.value ? 'block' : 'none';
      clearTimeout(searchTimer);
      if (this.value.length > 2) searchTimer = setTimeout(() => performSearch(this.value), 400);
    });
    searchClear.addEventListener('click', () => {
      searchInput.value = '';
      searchClear.style.display = 'none';
      document.getElementById('searchResults').innerHTML = '';
    });
    searchBackBtn.addEventListener('click', () => {
      searchContainer.classList.remove('active');
      document.getElementById('navWrapper').style.display = 'block';
      searchInput.value = '';
      searchClear.style.display = 'none';
      document.getElementById('searchResults').innerHTML = '';
      searchBackBtn.classList.remove('show');
    });

    // Drawer
    const drawer = document.getElementById('drawer');
    const drawerOverlay = document.getElementById('drawerOverlay');
    document.getElementById('menuBtn').addEventListener('click', () => { drawer.classList.add('active'); drawerOverlay.classList.add('active'); });
    document.getElementById('drawerClose').addEventListener('click', () => { drawer.classList.remove('active'); drawerOverlay.classList.remove('active'); });
    drawerOverlay.addEventListener('click', () => { drawer.classList.remove('active'); drawerOverlay.classList.remove('active'); });
    document.getElementById('menuFavorite').addEventListener('click', () => { drawer.classList.remove('active'); drawerOverlay.classList.remove('active'); switchPage('favoritku'); });
    document.getElementById('menuGenre').addEventListener('click', () => {
      document.getElementById('genreSubmenu').classList.toggle('active');
      loadGenreList();
    });

    // Nav
    document.querySelectorAll('.lnb .item').forEach(item => {
      item.addEventListener('click', e => { e.preventDefault(); switchPage(item.dataset.page); });
    });
    document.getElementById('logoHome').addEventListener('click', e => { e.preventDefault(); switchPage('home'); });

    // Popular tabs
    document.querySelectorAll('#popularTab .button').forEach(btn => {
      btn.addEventListener('click', function () { renderPopularTab(this.dataset.tab); });
    });

    // Detail back
    document.getElementById('detailBack').addEventListener('click', () => history.back() || switchPage('home'));
    document.getElementById('genreBack').addEventListener('click', () => switchPage('home'));
    document.getElementById('searchResultsBack').addEventListener('click', () => switchPage('home'));

    // Favorite button
    document.getElementById('detailFavoriteBtn').addEventListener('click', function () {
      if (!currentKomik) return;
      const idx = favorites.findIndex(f => f.url === currentKomik.url);
      if (idx > -1) {
        favorites.splice(idx, 1);
        this.classList.remove('active');
        document.getElementById('favoriteBtnText').textContent = 'Tambah ke Favorit';
        showToast('Dihapus dari Favorit');
      } else {
        favorites.push({ url: currentKomik.url, title: currentKomik.title, genres: currentKomik.genres || [], thumb: currentKomik.thumb });
        this.classList.add('active');
        document.getElementById('favoriteBtnText').textContent = 'Hapus dari Favorit';
        showToast('Ditambahkan ke Favorit');
      }
      localStorage.setItem('satriad_favorites', JSON.stringify(favorites));
    });

    // Episode click
    document.addEventListener('click', function (e) {
      const epItem = e.target.closest('.episode-item');
      if (epItem) requestOpenReader(parseInt(epItem.dataset.ep));
    });

    // Reader
    document.getElementById('readerClose').addEventListener('click', () => {
      document.getElementById('readerMode').classList.remove('active');
      document.body.style.overflow = '';
    });

    // Continue reading
    document.getElementById('continueReadingItem').addEventListener('click', () => {
      if (!readingHistory) return;
      if (currentKomik?.url === readingHistory.url) requestOpenReader(readingHistory.epIdx || 0);
      else { showDetail(readingHistory.url); showToast('Klik chapter untuk lanjut membaca'); }
    });

    // Age modal
    document.getElementById('ageConfirmBtn').addEventListener('click', () => { hideAgeModal(); if (pendingReaderEpIdx !== null) proceedToReader(pendingReaderEpIdx); });
    document.getElementById('ageUnderBtn').addEventListener('click', () => { hideAgeModal(); showToast('Anda harus berusia 18+ untuk membaca konten ini.'); });
    document.getElementById('ageModalOverlay').addEventListener('click', hideAgeModal);
  }

  // ── Init ──────────────────────────────────────────────────────────────────────

  function init() {
    initEventListeners();
    updateContinueReading();
    switchPage('home');
  }

  init();
})();
