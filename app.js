
let createClient = null;
let libraryFailed = false;

try {
  ({ createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'));
} catch (error) {
  console.error('Supabase kütüphanesi yüklenemedi:', error);
  libraryFailed = true;
}

const SUPABASE_URL = 'https://supsixtnyprkyfaemabk.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_Mb7kpEFCsWCGKkq-rWAsXQ_VElbSil0';
const PHOTO_BUCKET = 'team-photos';

const configured =
  SUPABASE_URL.startsWith('https://') &&
  !SUPABASE_URL.includes('PASTE_') &&
  !SUPABASE_ANON_KEY.includes('PASTE_');

const supabase = configured && createClient
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

let drivers = [];
let races = [];
let lapTimes = [];
let schedule = [];
let applications = [];
let teamPhotos = [];
let currentPhotoIndex = 0;
let currentUser = null;
let isAdmin = false;
let toastTimer;
let touchStartX = 0;
let touchStartY = 0;
let dataLoaded = false;
let adminLoadedFor = null;
const tableErrors = { drivers: false, races: false, laps: false, schedule: false };

const $ = id => document.getElementById(id);

const safe = value =>
  String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[ch]));

const dateLabel = value =>
  value
    ? new Date(`${value}T12:00:00`).toLocaleDateString('tr-TR', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      })
    : 'Tarih yok';

const driverName = id =>
  drivers.find(d => String(d.id) === String(id))?.name || 'Bilinmeyen pilot';

const positionText = race =>
  race.status === 'dnf'
    ? 'DNF'
    : race.status === 'dns'
      ? 'DNS'
      : race.position
        ? `P${race.position}`
        : '—';

/* Sadece http/https bağlantılarına izin ver (javascript: gibi tehlikeli bağlantıları engeller) */
const safeUrl = value => {
  try {
    const url = new URL(String(value ?? '').trim());
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
};

/* ===== KLASMAN (SINIF) SİSTEMİ ===== */

/* Hazır klasmanlar. Yeni klasmanlar yazılınca listeye otomatik eklenir. */
const PRESET_CLASSES = ['Hypercar', 'LMP2', 'LMP3', 'GT3', 'Formula 1', 'Other'];
const CUSTOM_CLASS_VALUE = '__custom__';

const cleanClass = value => String(value ?? '').trim().replace(/\s+/g, ' ');
const classKey = value => cleanClass(value).toLowerCase();

/* Hazır + veritabanında kullanılan tüm klasmanlar (büyük/küçük harf farkı tek sayılır) */
function knownClasses() {
  const seen = new Map();

  PRESET_CLASSES.forEach(name => seen.set(classKey(name), name));

  const extras = new Map();
  [...races, ...lapTimes, ...schedule].forEach(item => {
    const name = cleanClass(item.race_class);
    const key = classKey(name);
    if (name && !seen.has(key) && !extras.has(key)) extras.set(key, name);
  });

  const sortedExtras = [...extras.values()].sort((a, b) => a.localeCompare(b, 'tr'));
  return [...seen.values(), ...sortedExtras];
}

/* Yazılan adı, zaten var olan klasmanla aynıysa onun yazımına çevirir ("gt3  cup" → "GT3 Cup") */
function canonicalClass(value) {
  const cleaned = cleanClass(value);
  if (!cleaned) return '';
  const match = knownClasses().find(name => classKey(name) === classKey(cleaned));
  return match || cleaned;
}

function syncClassCustom(id) {
  const isCustom = $(id).value === CUSTOM_CLASS_VALUE;
  const input = $(id + 'Custom');

  input.hidden = !isCustom;
  input.required = isCustom;
  if (!isCustom) input.value = '';
}

function getClassValue(id) {
  const select = $(id);

  if (select.value === CUSTOM_CLASS_VALUE) {
    return canonicalClass($(id + 'Custom').value);
  }

  return select.value ? canonicalClass(select.value) : '';
}

function setClassValue(id, value) {
  const select = $(id);
  const input = $(id + 'Custom');
  const cleaned = cleanClass(value);

  if (!cleaned) {
    const emptyOption = [...select.options].find(option => option.value === '');
    select.value = emptyOption ? '' : (select.options[0]?.value ?? '');
    input.value = '';
    syncClassCustom(id);
    return;
  }

  const match = [...select.options].find(option =>
    option.value !== CUSTOM_CLASS_VALUE && classKey(option.value) === classKey(cleaned)
  );

  if (match) {
    select.value = match.value;
    input.value = '';
  } else {
    select.value = CUSTOM_CLASS_VALUE;
    input.value = cleaned;
  }

  syncClassCustom(id);
}

function fillClassSelects() {
  const classes = knownClasses();
  const options = classes.map(name =>
    `<option value="${safe(name)}">${safe(name)}</option>`
  ).join('');

  [['raceClass', false], ['lapClass', false], ['scheduleClass', true]].forEach(([id, optional]) => {
    const select = $(id);
    if (!select) return;

    const oldValue = select.value;

    select.innerHTML =
      (optional ? '<option value="">Belirtilmedi</option>' : '') +
      options +
      `<option value="${CUSTOM_CLASS_VALUE}">＋ Özel klasman yaz…</option>`;

    const stillThere = [...select.options].some(option => option.value === oldValue);
    select.value = stillThere ? oldValue : select.options[0].value;

    syncClassCustom(id);
  });

  const filter = $('classFilter');

  if (filter) {
    const selected = filter.value;
    filter.innerHTML = '<option value="all">Tüm sınıflar</option>' + options;
    filter.value = [...filter.options].some(option => option.value === selected) ? selected : 'all';
  }
}

/* ===== FOTOĞRAFLAR ===== */

/* GitHub "blob" bağlantılarını doğrudan resim adresine çevirir (daha güvenilir yüklenir) */
function photoSrc(value) {
  const url = safeUrl(value);
  if (!url) return '';

  const match = url.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+?)(?:\?raw=true)?$/);

  return match
    ? `https://raw.githubusercontent.com/${match[1]}/${match[2]}/${match[3]}/${match[4]}`
    : url;
}

/* Kartın içinde doğrudan görünen fotoğraf (tıklayınca büyür) */
function photoBlock(value, caption) {
  const src = photoSrc(value);
  if (!src) return '';

  return `<button type="button" class="record-photo"
      data-photo-url="${safe(src)}"
      data-photo-original="${safe(safeUrl(value))}"
      data-photo-caption="${safe(caption)}"
      aria-label="Fotoğrafı büyüt: ${safe(caption)}">
      <img src="${safe(src)}" alt="${safe(caption)}" loading="lazy" decoding="async">
    </button>`;
}

const todayISO = () => {
  const d = new Date();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
};

/* Tur zamanı biçimi: 1:35.726 veya 59.800 */
const LAP_PATTERN = /^(\d{1,2}:)?\d{1,2}\.\d{1,3}$/;
const LAP_FORMAT_MESSAGE = 'Tur zamanı 1:35.726 biçiminde yazılmalı (dakika:saniye.milisaniye).';

/* Supabase hatalarını anlaşılır Türkçe mesaja çevirir */
function friendlyError(error, what = 'İşlem') {
  const code = String(error?.code || '');
  const text = String(error?.message || '');

  if (code === '23505') return 'Bu isimde bir kayıt zaten var. Farklı bir ad dene.';
  if (code === '23514') return 'Girilen değerlerden biri veritabanı kurallarına uymuyor. Klasman adını kontrol et. Yeni klasman adları için veritabanı güncellemesi (SQL 01) yapılmış olmalı.';
  if (code === '23503') return 'Seçilen pilot bulunamadı. Sayfayı yenileyip tekrar dene.';
  if (code === '23502') return 'Zorunlu bir alan boş bırakılmış.';
  if (code === '42501' || /row-level security|permission denied|jwt/i.test(text)) {
    return 'Bu işlem için yetkin yok ya da oturumun kapanmış. Çıkış yapıp tekrar giriş yapmayı dene.';
  }
  if (/failed to fetch|network|load failed/i.test(text)) {
    return 'İnternet bağlantısı kurulamadı. Bağlantını kontrol edip tekrar dene.';
  }
  return `${what} tamamlanamadı. Alanları kontrol et. (Teknik ayrıntı tarayıcı konsolunda.)`;
}

/* Kaydetme sırasında butonu kilitler, "Kaydediliyor…" gösterir */
async function runSave(form, messageId, task) {
  const button = form.querySelector('button[type="submit"]');
  if (button) {
    button.disabled = true;
    button.classList.add('is-saving');
  }
  $(messageId).textContent = 'Kaydediliyor…';

  try {
    await task();
  } finally {
    if (button) {
      button.disabled = false;
      button.classList.remove('is-saving');
    }
  }
}

function notify(message) {
  const toast = $('toast');
  if (!toast) return;

  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2800);
}

function empty(message, sub = '') {
  return `<div class="empty-state">
    <span class="empty-icon">↗</span>
    <h3>${safe(message)}</h3>
    <p>${safe(sub)}</p>
  </div>`;
}

function loadingState() {
  return `<div class="empty-state loading-state">
    <h3>YÜKLENİYOR…</h3>
    <p>Veriler getiriliyor, lütfen bekle.</p>
  </div>`;
}

function errorState() {
  return `<div class="empty-state">
    <span class="empty-icon">!</span>
    <h3>VERİLER YÜKLENEMEDİ</h3>
    <p>Bağlantı sorunu olabilir. Biraz sonra tekrar dene.</p>
    <p><button type="button" class="outline-button" data-retry>TEKRAR DENE</button></p>
  </div>`;
}

/* Veri henüz gelmediyse "yükleniyor", hata varsa "yüklenemedi", yoksa verilen boş durum */
function stateBox(key, hasData, emptyHtml) {
  if (!dataLoaded) return loadingState();
  if (tableErrors[key] && !hasData) return errorState();
  return emptyHtml;
}

/* PILOT SEÇENEKLERİ */

function fillDriverSelects() {
  const makeOptions = () => drivers.map(d =>
    `<option value="${safe(d.id)}">${safe(d.name)}${
      d.number !== null && d.number !== undefined && d.number !== ''
        ? ` · #${safe(d.number)}`
        : ''
    }</option>`
  ).join('');

  ['raceDriver', 'lapDriver'].forEach(id => {
    const element = $(id);
    if (!element) return;

    const oldValue = element.value;
    element.innerHTML = makeOptions() || '<option value="">Önce pilot ekle</option>';

    if ([...element.options].some(option => option.value === oldValue)) {
      element.value = oldValue;
    }
  });

  const filter = $('driverFilter');

  if (filter) {
    const selected = filter.value;

    filter.innerHTML =
      '<option value="all">Tüm pilotlar</option>' +
      drivers.map(d =>
        `<option value="${safe(d.id)}">${safe(d.name)}</option>`
      ).join('');

    if ([...filter.options].some(option => option.value === selected)) {
      filter.value = selected;
    }
  }

  renderDrivers();
}

/* İSTATİSTİKLER */

function renderStats() {
  const totalWins = drivers.reduce(
    (sum, driver) => sum + (Number(driver.total_wins) || 0), 0
  );

  const totalStarts = drivers.reduce(
    (sum, driver) => sum + (Number(driver.total_starts) || 0), 0
  );

  const totalPodiums = drivers.reduce(
    (sum, driver) => sum + (Number(driver.total_podiums) || 0), 0
  );

  const totalPoles = drivers.reduce(
    (sum, driver) => sum + (Number(driver.total_poles) || 0), 0
  );

  if ($('statWins')) $('statWins').textContent = totalWins;
  if ($('statStarts')) $('statStarts').textContent = totalStarts;
  if ($('statPodiums')) $('statPodiums').textContent = totalPodiums;
  if ($('statPoles')) $('statPoles').textContent = totalPoles;

  const dnfElement = $('statDnfs');

  if (dnfElement) {
    const card = dnfElement.closest('.stat-card, .stat-item, .stat');
    if (card) card.remove();
    else dnfElement.remove();
  }
}

/* PİLOTLAR */

function renderDrivers() {
  $('driverCards').innerHTML = drivers.length
    ? drivers.map(driver => {
        const carImage = safeUrl(driver.car_image_url);
        const lfmLink = safeUrl(driver.lfm_profile_url);
        const starts = Number(driver.total_starts) || 0;
        const wins = Number(driver.total_wins) || 0;
        const podiums = Number(driver.total_podiums) || 0;
        const poles = Number(driver.total_poles) || 0;

        return `<article class="driver-card" data-driver-id="${safe(driver.id)}" tabindex="0" role="button" aria-label="${safe(driver.name)} profili" data-number="${safe(driver.number ?? '—')}">
          ${carImage
            ? `<img class="driver-car-image"
                src="${safe(carImage)}"
                alt="${safe(driver.name)} — ${safe(driver.main_car || 'araç')}"
                loading="lazy"
                onerror="this.hidden=true">`
            : ''}
          <div class="driver-number">${
            driver.number !== null &&
            driver.number !== undefined &&
            driver.number !== ''
              ? `#${safe(driver.number)}`
              : '—'
          }</div>
          <div class="driver-name">${safe(driver.name)}</div>
          <div class="driver-tag">${safe(driver.tag || 'Driver')}</div>
          ${driver.main_car
            ? `<div class="driver-main-car">${safe(driver.main_car)}</div>`
            : ''}
          <div class="driver-record">
            ${starts} starts · ${wins} wins<br>
            ${podiums} podiums · ${poles} poles
          </div>
          ${lfmLink
            ? `<a class="text-link"
                href="${safe(lfmLink)}"
                target="_blank"
                rel="noopener noreferrer">LFM PROFİLİ ↗</a>`
            : ''}
          <div class="driver-more">PROFİLİ GÖR →</div>
        </article>`;
      }).join('')
    : stateBox('drivers', false, empty('PİLOTLAR EKLENMEDİ', 'Pilotlar admin panelinden eklenir.'));
}

/* YARIŞLAR */

function renderRaces() {
  const driverFilter = $('driverFilter');
  const classFilter = $('classFilter');
  const searchFilter = $('searchFilter');

  const driver = driverFilter?.value || 'all';
  const raceClass = classFilter?.value || 'all';
  const term = (searchFilter?.value || '').trim().toLowerCase();

  const filtered = [...races]
    .sort((a, b) =>
      String(b.race_date || '').localeCompare(String(a.race_date || ''))
    )
    .filter(race =>
      (driver === 'all' || String(race.driver_id) === driver) &&
      (raceClass === 'all' || classKey(race.race_class) === classKey(raceClass)) &&
      (!term || [
        race.game,
        race.car,
        race.track,
        driverName(race.driver_id),
        race.race_class
      ].some(value => String(value || '').toLowerCase().includes(term)))
    );

  $('raceCount').textContent = dataLoaded ? `${filtered.length} KAYIT` : 'YÜKLENİYOR';

  if (!filtered.length) {
    $('raceList').innerHTML = races.length
      ? empty('SONUÇ BULUNAMADI', 'Filtreleri değiştirip tekrar dene.')
      : stateBox('races', false, empty(
          'İLK KAYITLAR BEKLENİYOR',
          'Yarış sonuçları admin panelinden elle eklenecek.'
        ));
    return;
  }

  $('raceList').innerHTML = filtered.map(race => `
    <article class="race-card"
      data-race-id="${safe(race.id)}"
      tabindex="0"
      role="button"
      aria-label="${safe(driverName(race.driver_id))} yarış ayrıntısı">
      <div class="race-position">${safe(positionText(race))}<small>RESULT</small></div>
      <div class="race-main">
        <div class="race-topline">
          <span class="race-driver">${safe(driverName(race.driver_id))}</span>
          <span class="race-tag">${safe(race.race_class || 'Other')}</span>
        </div>
        <div class="race-subline">
          <span>${safe(race.car || 'Araç yok')}</span>
          <span>${safe(race.track || 'Pist yok')}</span>
          <span>${safe(race.game || 'Oyun yok')}</span>
          ${race.best_lap ? `<span>Best ${safe(race.best_lap)}</span>` : ''}
        </div>
      </div>
      <div class="race-date">
        ${safe(dateLabel(race.race_date))}
        <strong>${
          race.status === 'dnf'
            ? 'DID NOT FINISH'
            : race.status === 'dns'
              ? 'DID NOT START'
              : race.position
                ? `FINISHED P${safe(race.position)}`
                : 'FINISHED'
        }</strong>
      </div>
    </article>
  `).join('');

  $('raceList').querySelectorAll('[data-race-id]').forEach(element => {
    const open = () =>
      showRaceDetail(races.find(race => String(race.id) === element.dataset.raceId));

    element.addEventListener('click', open);

    element.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        open();
      }
    });
  });
}

function showRaceDetail(race) {
  if (!race) return;

  $('raceDetailContent').innerHTML = `
    <div class="detail-hero">
      <p class="eyebrow">RACE REPORT · ${safe(dateLabel(race.race_date))}</p>
      <h2 id="raceDetailTitle">${safe(driverName(race.driver_id))}</h2>
      <div class="detail-pos">${safe(positionText(race))}</div>
      <span class="race-tag">${safe(race.race_class || 'Other')}</span>
    </div>
    <div class="detail-meta">
      <div><small>CAR</small><strong>${safe(race.car || '—')}</strong></div>
      <div><small>TRACK</small><strong>${safe(race.track || '—')}</strong></div>
      <div><small>GAME</small><strong>${safe(race.game || '—')}</strong></div>
      <div><small>BEST LAP</small><strong>${safe(race.best_lap || '—')}</strong></div>
    </div>
    ${race.notes ? `<p class="detail-notes">${safe(race.notes)}</p>` : ''}
    ${photoBlock(race.image_url, `${driverName(race.driver_id)} · ${race.track || ''} · ${dateLabel(race.race_date)}`)}
    ${safeUrl(race.lfm_url)
      ? `<a class="detail-link" href="${safe(safeUrl(race.lfm_url))}" target="_blank" rel="noopener noreferrer">SONUÇ / LFM LİNKİ ↗</a>`
      : ''}
  `;

  $('raceModal').hidden = false;
  document.body.classList.add('modal-open');
}

/* ADMIN KAYIT SATIRI */

function recordRow(title, sub, actions) {
  return `<div class="admin-record">
    <div><strong>${safe(title)}</strong><small>${safe(sub)}</small></div>
    <div class="record-actions">${actions}</div>
  </div>`;
}

/* ADMIN PİLOTLAR */

function renderAdminDrivers() {
  $('adminDriverList').innerHTML = drivers.length
    ? drivers.map(driver => recordRow(
        `${driver.name}${
          driver.number !== null &&
          driver.number !== undefined &&
          driver.number !== ''
            ? ` · #${driver.number}`
            : ''
        }`,
        `${driver.tag || 'Driver'}${
          driver.main_car ? ' · ' + driver.main_car : ''
        }${
          driver.car_image_url ? ' · araç fotoğrafı var' : ''
        } · ${Number(driver.total_starts) || 0} starts · ${
          Number(driver.total_wins) || 0
        } wins · ${Number(driver.total_podiums) || 0} podiums · ${
          Number(driver.total_poles) || 0
        } poles${driver.lfm_profile_url ? ' · LFM profili ekli' : ''}`,
        `<button type="button" data-edit-driver="${safe(driver.id)}">DÜZENLE</button>
         <button type="button" data-delete-driver="${safe(driver.id)}">SİL</button>`
      )).join('')
    : empty('HENÜZ PİLOT YOK', 'Yeni pilotu yukarıdaki formdan ekle.');

  $('adminDriverList').querySelectorAll('[data-edit-driver]').forEach(button => {
    button.addEventListener('click', () =>
      editDriver(drivers.find(driver => String(driver.id) === button.dataset.editDriver))
    );
  });

  $('adminDriverList').querySelectorAll('[data-delete-driver]').forEach(button => {
    button.addEventListener('click', () => deleteDriver(button.dataset.deleteDriver));
  });
}

/* ADMIN YARIŞLAR */

function renderAdminRaces() {
  $('adminRaceList').innerHTML = races.length
    ? [...races]
        .sort((a, b) =>
          String(b.race_date || '').localeCompare(String(a.race_date || ''))
        )
        .map(race => recordRow(
          `${driverName(race.driver_id)} · ${positionText(race)}`,
          `${dateLabel(race.race_date)} · ${race.car || ''} · ${race.track || ''}`,
          `<button type="button" data-edit-race="${safe(race.id)}">DÜZENLE</button>
           <button type="button" data-delete-race="${safe(race.id)}">SİL</button>`
        )).join('')
    : empty('YARIŞ KAYDI YOK', 'Yarışları kendin ekle.');

  $('adminRaceList').querySelectorAll('[data-edit-race]').forEach(button => {
    button.addEventListener('click', () =>
      editRace(races.find(race => String(race.id) === button.dataset.editRace))
    );
  });

  $('adminRaceList').querySelectorAll('[data-delete-race]').forEach(button => {
    button.addEventListener('click', () => deleteRace(button.dataset.deleteRace));
  });
}

/* TUR ZAMANLARI */

function renderLapTimes() {
  const sorted = [...lapTimes].sort((a, b) =>
    String(b.lap_date || '').localeCompare(String(a.lap_date || ''))
  );

  $('lapTimeList').innerHTML = sorted.length
    ? sorted.map(lap => {
        const parts = `
        <div class="race-position">${safe(lap.lap_time)}<small>LAP TIME</small></div>
        <div class="race-main">
          <div class="race-topline">
            <span class="race-driver">${safe(driverName(lap.driver_id))}</span>
            <span class="race-tag">${safe(lap.race_class || 'Other')}</span>
          </div>
          <div class="race-subline">
            <span>${safe(lap.car)}</span>
            <span>${safe(lap.track)}</span>
            <span>${safe(lap.game)}</span>
          </div>
        </div>
        <div class="race-date">${safe(dateLabel(lap.lap_date))}</div>`;

        const photo = photoBlock(
          lap.image_url,
          `${driverName(lap.driver_id)} · ${lap.car} · ${lap.track} · ${lap.lap_time}`
        );

        return photo
          ? `<article class="race-card lap-card lap-with-photo"><div class="lap-info">${parts}</div>${photo}</article>`
          : `<article class="race-card lap-card">${parts}</article>`;
      }).join('')
    : stateBox('laps', false, empty('TUR ZAMANI KAYDI YOK', 'Tur zamanları admin panelinden eklenir.'));

  $('adminLapList').innerHTML = sorted.length
    ? sorted.map(lap => recordRow(
        `${driverName(lap.driver_id)} · ${lap.lap_time}`,
        `${dateLabel(lap.lap_date)} · ${lap.car} · ${lap.track} · ${lap.game}`,
        `<button type="button" data-edit-lap="${safe(lap.id)}">DÜZENLE</button>
         <button type="button" data-delete-lap="${safe(lap.id)}">SİL</button>`
      )).join('')
    : empty('TUR ZAMANI YOK', 'İlk zamanı ekle.');

  $('adminLapList').querySelectorAll('[data-edit-lap]').forEach(button => {
    button.addEventListener('click', () =>
      editLap(lapTimes.find(lap => String(lap.id) === button.dataset.editLap))
    );
  });

  $('adminLapList').querySelectorAll('[data-delete-lap]').forEach(button => {
    button.addEventListener('click', () =>
      deleteRecord('driver_lap_times', button.dataset.deleteLap, 'Tur zamanı silindi.')
    );
  });
}

/* TAKVİM */

function scheduleCard(event) {
  return `
      <article class="race-card">
        <div class="race-position">
          ${safe(String(event.event_date || '').slice(8, 10) || '—')}
          <small>${safe(String(event.event_date || '').slice(0, 7))}</small>
        </div>
        <div class="race-main">
          <div class="race-topline">
            <span class="race-driver">${safe(event.event_name)}</span>
            ${event.race_class ? `<span class="race-tag">${safe(event.race_class)}</span>` : ''}
          </div>
          <div class="race-subline">
            ${[event.game, event.track, event.drivers, event.car]
              .filter(Boolean)
              .map(value => `<span>${safe(value)}</span>`).join('')}
          </div>
          ${event.notes ? `<p class="detail-notes">${safe(event.notes)}</p>` : ''}
          ${safeUrl(event.event_url)
            ? `<a class="detail-link" href="${safe(safeUrl(event.event_url))}" target="_blank" rel="noopener noreferrer">ETKİNLİK BİLGİSİ ↗</a>`
            : ''}
        </div>
        <div class="race-date">
          ${safe(dateLabel(event.event_date))}
          <strong>${safe(event.event_time ? String(event.event_time).slice(0, 5) : 'SAAT BELİRTİLMEDİ')}</strong>
        </div>
      </article>
    `;
}

function renderSchedule() {
  const byDateAsc = (a, b) =>
    String(a.event_date || '').localeCompare(String(b.event_date || ''));

  const sorted = [...schedule].sort(byDateAsc);
  const today = todayISO();

  const upcoming = sorted.filter(event => String(event.event_date || '') >= today);
  const past = sorted
    .filter(event => String(event.event_date || '') < today)
    .reverse();

  if (!sorted.length) {
    $('scheduleList').innerHTML = stateBox(
      'schedule',
      false,
      empty('TAKVİM BOŞ', 'Yarış tarihlerini admin panelinden ekleyebilirsin.')
    );
  } else {
    $('scheduleList').innerHTML =
      (upcoming.length
        ? upcoming.map(scheduleCard).join('')
        : empty('YAKLAŞAN ETKİNLİK YOK', 'Yeni etkinlikler eklenince burada görünecek.')) +
      (past.length
        ? `<details class="past-events">
            <summary>GEÇMİŞ ETKİNLİKLER (${past.length})</summary>
            ${past.map(scheduleCard).join('')}
          </details>`
        : '');
  }

  $('adminScheduleList').innerHTML = sorted.length
    ? sorted.map(event => recordRow(
        `${event.event_name} · ${dateLabel(event.event_date)}`,
        `${event.event_time ? String(event.event_time).slice(0, 5) + ' · ' : ''}${event.track || ''} · ${event.game || ''}`,
        `<button type="button" data-edit-schedule="${safe(event.id)}">DÜZENLE</button>
         <button type="button" data-delete-schedule="${safe(event.id)}">SİL</button>`
      )).join('')
    : empty('TAKVİM BOŞ', 'Yeni etkinlik ekle.');

  $('adminScheduleList').querySelectorAll('[data-edit-schedule]').forEach(button => {
    button.addEventListener('click', () =>
      editSchedule(schedule.find(event => String(event.id) === button.dataset.editSchedule))
    );
  });

  $('adminScheduleList').querySelectorAll('[data-delete-schedule]').forEach(button => {
    button.addEventListener('click', () =>
      deleteRecord('race_schedule', button.dataset.deleteSchedule, 'Takvim kaydı silindi.')
    );
  });
}

/* TAKIM FOTOĞRAF GALERİSİ */

function fileIsImage(file) {
  if (file?.metadata?.mimetype?.startsWith('image/')) return true;

  return /\.(jpe?g|png|webp|gif|avif)$/i.test(file?.name || '');
}

function photoCaptionFromFilename(filename) {
  return String(filename || '')
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || 'Crescent Motorsport · Team Gallery';
}

function currentPhoto() {
  return teamPhotos[currentPhotoIndex] || null;
}

function renderGallery() {
  const image = $('galleryImage');
  const loading = $('galleryLoading');
  const emptyBox = $('galleryEmpty');
  const counter = $('galleryCounter');
  const caption = $('galleryCaption');
  const openButton = $('galleryOpenImage');
  const fullscreenButton = $('galleryFullscreen');

  if (!image || !loading || !emptyBox) return;

  if (!teamPhotos.length) {
    image.hidden = true;
    loading.hidden = true;
    emptyBox.hidden = false;
    if (counter) counter.textContent = '0 / 0';
    if (caption) caption.textContent = 'Crescent Motorsport · Team Gallery';
    if (openButton) openButton.hidden = true;
    if (fullscreenButton) fullscreenButton.disabled = true;
    $('galleryPrev').disabled = true;
    $('galleryNext').disabled = true;
    renderAdminPhotos();
    return;
  }

  const photo = currentPhoto();
  if (!photo) return;

  image.hidden = false;
  loading.hidden = true;
  emptyBox.hidden = true;

  image.src = photo.url;
  image.alt = photo.caption || 'Crescent Motorsport takım fotoğrafı';

  if (counter) counter.textContent = `${currentPhotoIndex + 1} / ${teamPhotos.length}`;
  if (caption) caption.textContent = photo.caption || 'Crescent Motorsport · Team Gallery';
  if (openButton) openButton.hidden = false;
  if (fullscreenButton) fullscreenButton.disabled = false;

  $('galleryPrev').disabled = teamPhotos.length < 2;
  $('galleryNext').disabled = teamPhotos.length < 2;

  if (!$('galleryModal').hidden) {
    $('galleryModalImage').src = photo.url;
    $('galleryModalImage').alt = photo.caption || 'Crescent Motorsport takım fotoğrafı';
    $('galleryModalCaption').textContent =
      `${currentPhotoIndex + 1} / ${teamPhotos.length} · ${photo.caption || 'Crescent Motorsport'}`;
  }

  renderAdminPhotos();
}

async function loadTeamPhotos() {
  const image = $('galleryImage');
  const loading = $('galleryLoading');
  const emptyBox = $('galleryEmpty');

  if (!image || !loading || !emptyBox) return;

  if (!supabase) {
    loading.hidden = true;
    emptyBox.hidden = false;
    emptyBox.innerHTML = libraryFailed
      ? '<strong>FOTOĞRAFLAR YÜKLENEMEDİ</strong><span>Bağlantı sorunu olabilir. Sayfayı yenilemeyi dene.</span>'
      : '<strong>SUPABASE YAPILANDIRILMAMIŞ</strong><span>Supabase ayarlarını kontrol et.</span>';
    return;
  }

  loading.hidden = false;
  emptyBox.hidden = true;
  image.hidden = true;

  try {
    const { data, error } = await supabase.storage
      .from(PHOTO_BUCKET)
      .list('', {
        limit: 100,
        sortBy: { column: 'created_at', order: 'asc' }
      });

    if (error) throw error;

    const files = (data || []).filter(file =>
      file.name &&
      file.name !== '.emptyFolderPlaceholder' &&
      fileIsImage(file)
    );

    /*
      Storage'daki mevcut fotoğrafları doğrudan listeliyoruz.
      team_photos tablosuna daha önce kayıt girilmemiş olsa da
      yüklenmiş görseller galeride görünür.
    */
    let captions = [];

    const { data: captionRows, error: captionError } = await supabase
      .from('team_photos')
      .select('storage_path, caption');

    if (!captionError && captionRows) captions = captionRows;

    teamPhotos = files.map(file => {
      const path = file.name;
      const { data: publicData } = supabase.storage
        .from(PHOTO_BUCKET)
        .getPublicUrl(path);

      const metadata = captions.find(row => row.storage_path === path);

      return {
        name: path,
        path,
        url: publicData.publicUrl,
        caption: metadata?.caption || photoCaptionFromFilename(path),
        createdAt: file.created_at || file.updated_at || ''
      };
    });

    teamPhotos.sort((a, b) =>
      String(a.createdAt).localeCompare(String(b.createdAt))
    );

    currentPhotoIndex = Math.min(
      currentPhotoIndex,
      Math.max(0, teamPhotos.length - 1)
    );

    renderGallery();
  } catch (error) {
    console.error('Takım fotoğrafları yüklenemedi:', error);
    loading.hidden = true;
    emptyBox.hidden = false;
    emptyBox.innerHTML = '<strong>FOTOĞRAFLAR YÜKLENEMEDİ</strong><span>Supabase Storage bucket ve erişim ayarlarını kontrol et.</span>';
    notify('Fotoğraf galerisi yüklenemedi.');
  }
}

function moveGallery(direction) {
  if (teamPhotos.length < 2) return;

  currentPhotoIndex =
    (currentPhotoIndex + direction + teamPhotos.length) % teamPhotos.length;

  renderGallery();
}

function openGalleryModal() {
  const photo = currentPhoto();
  if (!photo) {
    notify('Henüz gösterilecek fotoğraf yok.');
    return;
  }

  const modal = $('galleryModal');
  modal.hidden = false;
  document.body.classList.add('modal-open');

  $('galleryModalImage').src = photo.url;
  $('galleryModalImage').alt = photo.caption || 'Crescent Motorsport takım fotoğrafı';
  $('galleryModalCaption').textContent =
    `${currentPhotoIndex + 1} / ${teamPhotos.length} · ${photo.caption || 'Crescent Motorsport'}`;
}

/* Tek fotoğraf büyütme penceresi (tur zamanı / yarış fotoğrafları) */

function openPhotoModal(url, caption) {
  const image = $('photoModalImage');

  image.src = url;
  image.alt = caption || '';
  $('photoModalCaption').textContent = caption || '';
  $('photoModal').hidden = false;
  document.body.classList.add('modal-open');
  $('photoModalClose').focus();
}

function closePhotoModal() {
  const modal = $('photoModal');
  if (modal.hidden) return;

  modal.hidden = true;
  $('photoModalImage').removeAttribute('src');

  if (!document.querySelector('.modal:not([hidden])') && $('galleryModal').hidden) {
    document.body.classList.remove('modal-open');
  }
}

function closeGalleryModal() {
  const modal = $('galleryModal');
  if (modal.hidden) return;

  modal.hidden = true;
  document.body.classList.remove('modal-open');

  if (document.fullscreenElement && document.exitFullscreen) {
    document.exitFullscreen().catch(() => {});
  }
}

async function openGalleryFullscreen() {
  if (!currentPhoto()) {
    notify('Henüz gösterilecek fotoğraf yok.');
    return;
  }

  openGalleryModal();

  const content = document.querySelector('.gallery-modal-content');

  if (content?.requestFullscreen) {
    try {
      await content.requestFullscreen();
    } catch (error) {
      // Tam ekran desteklenmiyorsa normal büyütülmüş görünüm açık kalır.
      console.warn('Tam ekran açılamadı:', error);
    }
  }
}

function renderAdminPhotos() {
  const list = $('adminPhotoList');
  if (!list) return;

  if (!isAdmin) {
    list.innerHTML = empty('ADMIN GİRİŞİ GEREKLİ', 'Fotoğrafları yönetmek için admin olarak giriş yap.');
    return;
  }

  if (!teamPhotos.length) {
    list.innerHTML = empty('FOTOĞRAF BULUNAMADI', 'team-photos klasörüne fotoğraf yükleyebilirsin.');
    return;
  }

  list.innerHTML = teamPhotos.map(photo => `
    <div class="admin-photo-record">
      <img src="${safe(photo.url)}" alt="" loading="lazy">
      <div>
        <strong>${safe(photo.caption)}</strong>
        <small>${safe(photo.name)}</small>
      </div>
      <div class="record-actions">
        <button type="button" data-delete-photo="${safe(photo.path)}">FOTOĞRAFI SİL</button>
      </div>
    </div>
  `).join('');

  list.querySelectorAll('[data-delete-photo]').forEach(button => {
    button.addEventListener('click', () => deleteTeamPhoto(button.dataset.deletePhoto));
  });
}

async function uploadTeamPhoto(event) {
  event.preventDefault();

  if (!isAdmin || !supabase) {
    notify('Fotoğraf yüklemek için admin girişi gerekli.');
    return;
  }

  const fileInput = $('teamPhotoFile');
  const file = fileInput.files?.[0];
  const message = $('teamPhotoMessage');
  const button = $('teamPhotoUploadButton');

  if (!file) {
    message.textContent = 'Önce bir fotoğraf seç.';
    return;
  }

  if (!fileIsImage(file)) {
    message.textContent = 'JPG, PNG, WEBP veya GIF formatında bir fotoğraf seç.';
    return;
  }

  if (file.size > 50 * 1024 * 1024) {
    message.textContent = 'Dosya 50 MB sınırını aşıyor.';
    return;
  }

  button.disabled = true;
  message.textContent = 'Fotoğraf yükleniyor…';

  const cleanName = file.name
    .normalize('NFKD')
    .replace(/[^\w.-]+/g, '-')
    .replace(/-+/g, '-')
    .slice(-100) || 'team-photo';

  const path = `${Date.now()}-${cleanName}`;

  try {
    const { error: uploadError } = await supabase.storage
      .from(PHOTO_BUCKET)
      .upload(path, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type || undefined
      });

    if (uploadError) throw uploadError;

    const caption = $('teamPhotoCaption').value.trim();

    /*
      Storage yüklemesi asıl işlemdir.
      Tabloya açıklama eklenemese bile fotoğraf galeride görünür;
      açıklama yerine dosya adı gösterilir.
    */
    const { error: metadataError } = await supabase
      .from('team_photos')
      .insert({
        storage_path: path,
        image_url: supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl,
        caption
      });

    if (metadataError) {
      console.warn('Fotoğraf yüklendi, ancak açıklama kaydı yazılamadı:', metadataError);
      message.textContent = 'Fotoğraf yüklendi. Açıklama kaydı eklenemedi; dosya adı gösterilecek.';
    } else {
      message.textContent = 'Fotoğraf başarıyla yüklendi.';
    }

    $('teamPhotoForm').reset();
    await loadTeamPhotos();
    notify('Takım fotoğrafı yüklendi.');
  } catch (error) {
    console.error('Fotoğraf yükleme hatası:', error);
    message.textContent = 'Yükleme başarısız. Storage yükleme politikasını ve dosya boyutunu kontrol et.';
  } finally {
    button.disabled = false;
  }
}

async function deleteTeamPhoto(path) {
  if (!isAdmin || !supabase) {
    notify('Bu işlem için admin girişi gerekli.');
    return;
  }

  if (!confirm('Bu fotoğrafı Storage klasöründen kalıcı olarak silmek istiyor musun?')) {
    return;
  }

  const { data: removed, error } = await supabase.storage
    .from(PHOTO_BUCKET)
    .remove([path]);

  if (error) {
    console.error('Fotoğraf silinemedi:', error);
    notify('Fotoğraf silinemedi. Storage silme politikasını kontrol et.');
    return;
  }

  /* Yetki yoksa Supabase hata vermeden boş liste döndürebilir; bunu başarı sanma */
  if (!removed || removed.length === 0) {
    notify('Fotoğraf silinemedi (yetki yok ya da dosya zaten silinmiş). Liste yenileniyor.');
    await loadTeamPhotos();
    return;
  }

  const { error: metadataError } = await supabase
    .from('team_photos')
    .delete()
    .eq('storage_path', path);

  if (metadataError) {
    console.warn('Fotoğraf silindi, ancak açıklama kaydı silinemedi:', metadataError);
  }

  if (currentPhoto()?.path === path) {
    currentPhotoIndex = Math.max(0, currentPhotoIndex - 1);
  }

  await loadTeamPhotos();
  notify('Fotoğraf silindi.');
}

/* VERİLERİ YENİLE */

function rerender() {
  fillDriverSelects();
  fillClassSelects();
  renderStats();
  renderRaces();
  renderAdminDrivers();
  renderAdminRaces();
  renderLapTimes();
  renderSchedule();
  renderAdminPhotos();
  renderAdminApps();
  openPilotFromHash();
}

/* ADMIN GİRİŞİ */

function openLogin() {
  $('loginMessage').textContent = configured
    ? ''
    : 'Önce Supabase yapılandırmasını tamamla.';

  $('loginModal').hidden = false;
  document.body.classList.add('modal-open');
}

async function checkAdmin(user) {
  if (!supabase || !user) return false;

  const { data, error } = await supabase
    .from('admin_users')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) {
    console.error('Admin kontrolü başarısız:', error);
    return false;
  }

  return !!data;
}

async function refreshData() {
  if (!configured || !supabase) {
    drivers = [];
    races = [];
    lapTimes = [];
    schedule = [];

    if (libraryFailed) {
      Object.keys(tableErrors).forEach(key => { tableErrors[key] = true; });
    }

    dataLoaded = true;
    rerender();
    return;
  }

  let results;

  try {
    results = await Promise.all([
      supabase.from('drivers').select('*').order('name'),
      supabase.from('race_results').select('*').order('race_date', { ascending: false }),
      supabase.from('driver_lap_times').select('*').order('lap_date', { ascending: false }),
      supabase.from('race_schedule').select('*').order('event_date', { ascending: true })
    ]);
  } catch (error) {
    console.error('Supabase veri yükleme hatası:', error);
    Object.keys(tableErrors).forEach(key => { tableErrors[key] = true; });
    const hadData = dataLoaded;
    dataLoaded = true;
    rerender();
    if (hadData) notify('Veriler yenilenemedi.');
    return;
  }

  const [driverResult, raceResult, lapResult, scheduleResult] = results;

  tableErrors.drivers = !!driverResult.error;
  tableErrors.races = !!raceResult.error;
  tableErrors.laps = !!lapResult.error;
  tableErrors.schedule = !!scheduleResult.error;

  if (!driverResult.error) drivers = driverResult.data || [];
  if (!raceResult.error) races = raceResult.data || [];
  if (!lapResult.error) lapTimes = lapResult.data || [];
  if (!scheduleResult.error) schedule = scheduleResult.data || [];

  for (const result of results) {
    if (result.error) console.error('Supabase veri yükleme hatası:', result.error);
  }

  const hadData = dataLoaded;
  const anyError = results.some(result => result.error);

  dataLoaded = true;
  rerender();

  if (hadData && anyError) notify('Bazı veriler yenilenemedi.');
}

/* Admin verilerini bir kez yükle (giriş + oturum olayı çift yüklemesin) */
async function loadAdminData(user) {
  if (!user || adminLoadedFor === user.id) return;

  adminLoadedFor = user.id;
  await refreshData();
  await loadTeamPhotos();
  await loadApplications();
}

async function handleLogin(event) {
  event.preventDefault();

  if (!supabase) {
    $('loginMessage').textContent = 'Supabase henüz yapılandırılmamış.';
    return;
  }

  const button = $('loginForm').querySelector('button[type="submit"]');
  button.disabled = true;
  $('loginMessage').textContent = 'Giriş kontrol ediliyor…';

  const { data, error } = await supabase.auth.signInWithPassword({
    email: $('loginEmail').value.trim(),
    password: $('loginPassword').value
  });

  button.disabled = false;

  if (error) {
    $('loginMessage').textContent = 'Giriş başarısız. Bilgileri kontrol et.';
    console.error(error);
    return;
  }

  currentUser = data.user;
  isAdmin = await checkAdmin(currentUser);

  if (!isAdmin) {
    await supabase.auth.signOut();
    currentUser = null;
    $('loginMessage').textContent = 'Bu hesapta admin yetkisi yok.';
    return;
  }

  $('loginModal').hidden = true;
  $('adminPanel').hidden = false;
  document.body.classList.remove('modal-open');

  await loadAdminData(currentUser);

  $('adminPanel').scrollIntoView({ behavior: 'smooth' });
  notify('Admin girişi başarılı.');
}

async function handleLogout() {
  if (supabase) await supabase.auth.signOut();

  currentUser = null;
  isAdmin = false;
  adminLoadedFor = null;
  $('adminPanel').hidden = true;
  renderAdminPhotos();
  notify('Çıkış yapıldı.');
}

/* FORM YARDIMCILARI */

function resetForm(formId, hiddenId, buttonId, messageId) {
  $(formId).reset();

  if (hiddenId) $(hiddenId).value = '';
  if (buttonId) $(buttonId).hidden = true;
  if (messageId) $(messageId).textContent = '';

  if (formId === 'raceForm') syncPositionField();

  const classId = { raceForm: 'raceClass', lapForm: 'lapClass', scheduleForm: 'scheduleClass' }[formId];
  if (classId) {
    $(classId + 'Custom').value = '';
    syncClassCustom(classId);
  }
}

/* Pozisyon kutusu yalnızca "Tamamladı" durumunda açık olmalı */
function syncPositionField() {
  const finished = $('raceStatus').value === 'finished';

  $('racePosition').disabled = !finished;
  if (!finished) $('racePosition').value = '';
}

/* PİLOT KAYDET / DÜZENLE */

function editDriver(driver) {
  if (!driver) return;

  $('driverId').value = driver.id;
  $('driverName').value = driver.name || '';
  $('driverNumber').value = driver.number ?? '';
  $('driverTag').value = driver.tag || 'Driver';
  $('driverCar').value = driver.main_car || '';
  $('driverCarImage').value = driver.car_image_url || '';
  $('driverLfmUrl').value = driver.lfm_profile_url || '';
  $('driverStarts').value = driver.total_starts ?? 0;
  $('driverWins').value = driver.total_wins ?? 0;
  $('driverPodiums').value = driver.total_podiums ?? 0;
  $('driverPoles').value = driver.total_poles ?? 0;

  $('cancelDriverEdit').hidden = false;
  $('driverSaveButton').innerHTML = 'DEĞİŞİKLİKLERİ KAYDET';
  $('driverForm').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function saveDriver(event) {
  event.preventDefault();
  if (!isAdmin || !supabase) return;

  await runSave($('driverForm'), 'driverMessage', async () => {
    const id = $('driverId').value;

    const payload = {
      name: $('driverName').value.trim(),
      number: $('driverNumber').value === '' ? null : Number($('driverNumber').value),
      tag: $('driverTag').value.trim() || 'Driver',
      main_car: $('driverCar').value.trim() || null,
      car_image_url: $('driverCarImage').value.trim() || null,
      lfm_profile_url: $('driverLfmUrl').value.trim() || null,
      total_starts: Math.max(0, Math.floor(Number($('driverStarts').value) || 0)),
      total_wins: Math.max(0, Math.floor(Number($('driverWins').value) || 0)),
      total_podiums: Math.max(0, Math.floor(Number($('driverPodiums').value) || 0)),
      total_poles: Math.max(0, Math.floor(Number($('driverPoles').value) || 0))
    };

    if (!payload.name) {
      $('driverMessage').textContent = 'Pilot adı boş bırakılamaz.';
      return;
    }

    const result = id
      ? await supabase.from('drivers').update(payload).eq('id', id)
      : await supabase.from('drivers').insert(payload);

    if (result.error) {
      $('driverMessage').textContent = friendlyError(result.error, 'Pilot kaydı');
      console.error(result.error);
      return;
    }

    resetForm('driverForm', 'driverId', 'cancelDriverEdit', 'driverMessage');
    $('driverSaveButton').innerHTML = 'PİLOTU KAYDET <span>↗</span>';
    $('cancelDriverEdit').hidden = true;
    $('driverMessage').textContent = id ? 'Pilot güncellendi.' : 'Pilot eklendi.';

    await refreshData();
    notify(id ? 'Pilot güncellendi.' : 'Pilot eklendi.');
  });
}

async function deleteDriver(id) {
  const driver = drivers.find(item => String(item.id) === String(id));
  const raceCount = races.filter(race => String(race.driver_id) === String(id)).length;
  const lapCount = lapTimes.filter(lap => String(lap.driver_id) === String(id)).length;

  const related = raceCount || lapCount
    ? `Bu pilota ait ${raceCount} yarış kaydı ve ${lapCount} tur zamanı da kalıcı olarak silinecek.`
    : 'Bu pilota ait yarış veya tur zamanı kaydı yok.';

  await deleteRecord(
    'drivers',
    id,
    'Pilot silindi.',
    `"${driver?.name || 'Bu pilot'}" silinecek.\n\n${related}\n\nBu işlem geri alınamaz. Devam edilsin mi?`
  );
}

/* YARIŞ KAYDET / DÜZENLE */

function raceFormData() {
  const status = $('raceStatus').value;

  return {
    driver_id: $('raceDriver').value,
    race_date: $('raceDate').value,
    game: $('raceGame').value.trim(),
    race_class: getClassValue('raceClass'),
    car: $('raceCar').value.trim(),
    track: $('raceTrack').value.trim(),
    status,
    position: status === 'finished' && $('racePosition').value
      ? Number($('racePosition').value)
      : null,
    best_lap: $('raceLap').value.trim() || null,
    lfm_url: $('raceUrl').value.trim() || null,
    image_url: $('raceImage').value.trim() || null,
    notes: $('raceNotes').value.trim() || null
  };
}

async function saveRace(event) {
  event.preventDefault();
  if (!isAdmin || !supabase) return;

  if (!drivers.length) {
    $('raceMessage').textContent = 'Önce Pilotlar sekmesinden bir pilot ekle.';
    return;
  }

  await runSave($('raceForm'), 'raceMessage', async () => {
    const id = $('raceId').value;
    const payload = raceFormData();

    if (!payload.race_class) {
      $('raceMessage').textContent = 'Bir klasman seç ya da "Özel klasman yaz" ile adını gir.';
      return;
    }

    if (!payload.game || !payload.car || !payload.track) {
      $('raceMessage').textContent = 'Oyun, araç ve pist alanları boş bırakılamaz.';
      return;
    }

    if (payload.best_lap && !LAP_PATTERN.test(payload.best_lap)) {
      $('raceMessage').textContent = 'En iyi tur için ' + LAP_FORMAT_MESSAGE;
      return;
    }

    const { error } = id
      ? await supabase.from('race_results').update(payload).eq('id', id)
      : await supabase.from('race_results').insert(payload);

    if (error) {
      $('raceMessage').textContent = friendlyError(error, 'Yarış kaydı');
      console.error(error);
      return;
    }

    resetForm('raceForm', 'raceId', 'cancelEdit', 'raceMessage');
    $('cancelEdit').hidden = true;
    $('raceMessage').textContent = id ? 'Yarış güncellendi.' : 'Yarış eklendi.';

    await refreshData();
    notify(id ? 'Yarış güncellendi.' : 'Yarış eklendi.');
  });
}

function editRace(race) {
  if (!race) return;

  $('raceId').value = race.id;
  $('raceDriver').value = race.driver_id;
  $('raceDate').value = race.race_date || '';
  $('raceGame').value = race.game || '';
  setClassValue('raceClass', race.race_class || 'Other');
  $('raceCar').value = race.car || '';
  $('raceTrack').value = race.track || '';
  $('raceStatus').value = race.status || 'finished';
  $('racePosition').value = race.position || '';
  syncPositionField();
  $('raceLap').value = race.best_lap || '';
  $('raceUrl').value = race.lfm_url || '';
  $('raceImage').value = race.image_url || '';
  $('raceNotes').value = race.notes || '';

  $('cancelEdit').hidden = false;
  $('raceForm').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function deleteRace(id) {
  await deleteRecord('race_results', id, 'Yarış kaydı silindi.');
}

/* TUR ZAMANI KAYDET / DÜZENLE */

function lapFormData() {
  return {
    driver_id: $('lapDriver').value,
    lap_date: $('lapDate').value || null,
    game: $('lapGame').value.trim(),
    race_class: getClassValue('lapClass'),
    car: $('lapCar').value.trim(),
    track: $('lapTrack').value.trim(),
    lap_time: $('lapTime').value.trim(),
    image_url: $('lapImage').value.trim() || null,
    notes: $('lapNotes').value.trim() || null
  };
}

async function saveLap(event) {
  event.preventDefault();
  if (!isAdmin || !supabase) return;

  if (!drivers.length) {
    $('lapMessage').textContent = 'Önce pilot ekle.';
    return;
  }

  await runSave($('lapForm'), 'lapMessage', async () => {
    const id = $('lapId').value;
    const payload = lapFormData();

    if (!payload.race_class) {
      $('lapMessage').textContent = 'Bir klasman seç ya da "Özel klasman yaz" ile adını gir.';
      return;
    }

    if (!payload.game || !payload.car || !payload.track) {
      $('lapMessage').textContent = 'Oyun, araç ve pist alanları boş bırakılamaz.';
      return;
    }

    if (!LAP_PATTERN.test(payload.lap_time)) {
      $('lapMessage').textContent = LAP_FORMAT_MESSAGE;
      return;
    }

    const result = id
      ? await supabase.from('driver_lap_times').update(payload).eq('id', id)
      : await supabase.from('driver_lap_times').insert(payload);

    if (result.error) {
      $('lapMessage').textContent = friendlyError(result.error, 'Tur zamanı kaydı');
      console.error(result.error);
      return;
    }

    resetForm('lapForm', 'lapId', 'cancelLapEdit', 'lapMessage');
    $('cancelLapEdit').hidden = true;
    $('lapMessage').textContent = id ? 'Tur zamanı güncellendi.' : 'Tur zamanı eklendi.';

    await refreshData();
    notify(id ? 'Tur zamanı güncellendi.' : 'Tur zamanı eklendi.');
  });
}

function editLap(lap) {
  if (!lap) return;

  $('lapId').value = lap.id;
  $('lapDriver').value = lap.driver_id;
  $('lapDate').value = lap.lap_date || '';
  $('lapGame').value = lap.game || '';
  setClassValue('lapClass', lap.race_class || 'Other');
  $('lapCar').value = lap.car || '';
  $('lapTrack').value = lap.track || '';
  $('lapTime').value = lap.lap_time || '';
  $('lapImage').value = lap.image_url || '';
  $('lapNotes').value = lap.notes || '';

  $('cancelLapEdit').hidden = false;
  $('lapForm').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

/* TAKVİM KAYDET / DÜZENLE */

function scheduleFormData() {
  return {
    event_name: $('scheduleName').value.trim(),
    event_date: $('scheduleDate').value,
    event_time: $('scheduleTime').value || null,
    game: $('scheduleGame').value.trim() || null,
    race_class: getClassValue('scheduleClass') || null,
    track: $('scheduleTrack').value.trim() || null,
    drivers: $('scheduleDrivers').value.trim() || null,
    car: $('scheduleCar').value.trim() || null,
    event_url: $('scheduleUrl').value.trim() || null,
    notes: $('scheduleNotes').value.trim() || null
  };
}

async function saveSchedule(event) {
  event.preventDefault();
  if (!isAdmin || !supabase) return;

  await runSave($('scheduleForm'), 'scheduleMessage', async () => {
    const id = $('scheduleId').value;
    const payload = scheduleFormData();

    if (!payload.event_name) {
      $('scheduleMessage').textContent = 'Etkinlik adı boş bırakılamaz.';
      return;
    }

    if ($('scheduleClass').value === CUSTOM_CLASS_VALUE && !payload.race_class) {
      $('scheduleMessage').textContent = 'Özel klasman adını yaz ya da "Belirtilmedi" seç.';
      return;
    }

    const result = id
      ? await supabase.from('race_schedule').update(payload).eq('id', id)
      : await supabase.from('race_schedule').insert(payload);

    if (result.error) {
      $('scheduleMessage').textContent = friendlyError(result.error, 'Takvim kaydı');
      console.error(result.error);
      return;
    }

    resetForm('scheduleForm', 'scheduleId', 'cancelScheduleEdit', 'scheduleMessage');
    $('cancelScheduleEdit').hidden = true;
    $('scheduleMessage').textContent = id ? 'Takvim kaydı güncellendi.' : 'Takvime eklendi.';

    await refreshData();
    notify(id ? 'Takvim kaydı güncellendi.' : 'Takvime eklendi.');
  });
}

function editSchedule(event) {
  if (!event) return;

  $('scheduleId').value = event.id;
  $('scheduleName').value = event.event_name || '';
  $('scheduleDate').value = event.event_date || '';
  $('scheduleTime').value = event.event_time ? String(event.event_time).slice(0, 5) : '';
  $('scheduleGame').value = event.game || '';
  setClassValue('scheduleClass', event.race_class || '');
  $('scheduleTrack').value = event.track || '';
  $('scheduleDrivers').value = event.drivers || '';
  $('scheduleCar').value = event.car || '';
  $('scheduleUrl').value = event.event_url || '';
  $('scheduleNotes').value = event.notes || '';

  $('cancelScheduleEdit').hidden = false;
  $('scheduleForm').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

/* KAYIT SİLME */

async function deleteRecord(table, id, message, confirmText) {
  if (!isAdmin || !supabase) return;
  if (!confirm(confirmText || 'Bu kaydı silmek istediğine emin misin?')) return;

  const { error } = await supabase.from(table).delete().eq('id', id);

  if (error) {
    notify(friendlyError(error, 'Silme işlemi'));
    console.error(error);
    return;
  }

  await refreshData();
  notify(message);
}

/* ADMIN SEKME DEĞİŞTİRME */

function switchAdminTab(tab) {
  document.querySelectorAll('.admin-tab').forEach(button => {
    button.classList.toggle('active', button.dataset.adminTab === tab);
  });

  $('adminDriverView').hidden = tab !== 'driver';
  $('adminRaceView').hidden = tab !== 'race';
  $('adminLapView').hidden = tab !== 'lap';
  $('adminScheduleView').hidden = tab !== 'schedule';
  $('adminPhotosView').hidden = tab !== 'photos';
  $('adminAppsView').hidden = tab !== 'apps';

  if (tab === 'photos') {
    loadTeamPhotos();
  }
}

/* GALERİ OLAYLARI */

$('galleryPrev').addEventListener('click', event => {
  event.stopPropagation();
  moveGallery(-1);
});

$('galleryNext').addEventListener('click', event => {
  event.stopPropagation();
  moveGallery(1);
});

$('galleryOpenImage').addEventListener('click', event => {
  event.stopPropagation();
  openGalleryModal();
});

$('galleryFullscreen').addEventListener('click', event => {
  event.stopPropagation();
  openGalleryFullscreen();
});

$('teamGallery').addEventListener('click', event => {
  if (event.target.closest('button')) return;
  openGalleryModal();
});

$('teamGallery').addEventListener('keydown', event => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    openGalleryModal();
  } else if (event.key === 'ArrowLeft') {
    event.preventDefault();
    moveGallery(-1);
  } else if (event.key === 'ArrowRight') {
    event.preventDefault();
    moveGallery(1);
  }
});

$('galleryModalClose').addEventListener('click', closeGalleryModal);

document.querySelectorAll('[data-close-gallery]').forEach(element => {
  element.addEventListener('click', closeGalleryModal);
});

$('galleryModalPrev').addEventListener('click', () => moveGallery(-1));
$('galleryModalNext').addEventListener('click', () => moveGallery(1));

/* Telefonda sağa-sola kaydırarak fotoğraf değiştirme */
function registerSwipe(element) {
  element.addEventListener('touchstart', event => {
    const touch = event.changedTouches[0];
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
  }, { passive: true });

  element.addEventListener('touchend', event => {
    const touch = event.changedTouches[0];
    const deltaX = touch.clientX - touchStartX;
    const deltaY = touch.clientY - touchStartY;

    if (Math.abs(deltaX) > 45 && Math.abs(deltaX) > Math.abs(deltaY) * 1.2) {
      moveGallery(deltaX < 0 ? 1 : -1);
    }
  }, { passive: true });
}

registerSwipe($('teamGallery'));
registerSwipe(document.querySelector('.gallery-modal-content'));

document.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    $('loginModal').hidden = true;
    $('raceModal').hidden = true;
    closeDriverProfile();
    closePhotoModal();
    closeGalleryModal();
    document.body.classList.remove('modal-open');
  }

  const galleryOpen = !$('galleryModal').hidden;

  if (galleryOpen && event.key === 'ArrowLeft') {
    event.preventDefault();
    moveGallery(-1);
  } else if (galleryOpen && event.key === 'ArrowRight') {
    event.preventDefault();
    moveGallery(1);
  }
});


/* ===== PİLOT PROFİLİ ===== */

const lapToMs = text => {
  const m = String(text || '').match(/^(?:(\d{1,2}):)?(\d{1,2})\.(\d{1,3})$/);
  if (!m) return Infinity;
  return (Number(m[1] || 0) * 60 + Number(m[2])) * 1000 + Number(m[3].padEnd(3, '0'));
};

let openedPilotId = null;

function profileUrl(id) {
  return `${location.href.split('#')[0]}#pilot=${encodeURIComponent(id)}`;
}

function openDriverProfile(id, { updateHash = true } = {}) {
  const driver = drivers.find(d => String(d.id) === String(id));
  if (!driver) return;
  openedPilotId = driver.id;

  const carImage = safeUrl(driver.car_image_url);
  const lfm = safeUrl(driver.lfm_profile_url);
  const hasNumber = driver.number !== null && driver.number !== undefined && driver.number !== '';

  /* Her pist + araç için en iyi tur */
  const bestMap = new Map();
  lapTimes
    .filter(l => String(l.driver_id) === String(driver.id))
    .forEach(l => {
      const key = `${l.track}|${l.car}|${l.game}`;
      const prev = bestMap.get(key);
      if (!prev || lapToMs(l.lap_time) < lapToMs(prev.lap_time)) bestMap.set(key, l);
    });
  const bestLaps = [...bestMap.values()]
    .sort((a, b) => String(b.lap_date || '').localeCompare(String(a.lap_date || '')))
    .slice(0, 8);

  const driverRaces = races
    .filter(r => String(r.driver_id) === String(driver.id))
    .sort((a, b) => String(b.race_date || '').localeCompare(String(a.race_date || '')))
    .slice(0, 8);

  $('driverProfileContent').innerHTML = `
    <div class="dp-head">
      <div class="dp-num">${hasNumber ? safe(driver.number) : '—'}</div>
      <div>
        <h2 id="driverProfileTitle">${safe(driver.name)}</h2>
        <div class="dp-sub">${safe(driver.tag || 'Driver')}${driver.main_car ? ' · ' + safe(driver.main_car) : ''}</div>
      </div>
    </div>
    ${carImage ? `<img class="dp-img" src="${safe(carImage)}" alt="${safe(driver.name)} — ${safe(driver.main_car || 'araç')}" loading="lazy" onerror="this.hidden=true">` : ''}
    <div class="dp-stats">
      <div><strong>${Number(driver.total_starts) || 0}</strong><small>STARTS</small></div>
      <div><strong>${Number(driver.total_wins) || 0}</strong><small>WINS</small></div>
      <div><strong>${Number(driver.total_podiums) || 0}</strong><small>PODIUMS</small></div>
      <div><strong>${Number(driver.total_poles) || 0}</strong><small>POLES</small></div>
    </div>
    <h3 class="dp-h">EN İYİ TURLAR</h3>
    ${bestLaps.length
      ? bestLaps.map(l => `<div class="dp-row"><b>${safe(l.lap_time)}</b><span>${safe(l.track)} · ${safe(l.car)}</span></div>`).join('')
      : '<p class="form-message">Henüz tur zamanı eklenmedi.</p>'}
    <h3 class="dp-h">SON YARIŞLAR</h3>
    ${driverRaces.length
      ? driverRaces.map(r => `<button type="button" class="dp-row" data-profile-race="${safe(r.id)}"><b>${safe(positionText(r))} · ${safe(r.track || '—')}</b><span>${safe(r.car || '')} · ${safe(dateLabel(r.race_date))}</span></button>`).join('')
      : '<p class="form-message">Henüz yarış kaydı yok.</p>'}
    <div class="dp-actions">
      <button type="button" class="primary-button" data-share-pilot>LİNKİ KOPYALA ↗</button>
      ${lfm ? `<a class="outline-button" href="${safe(lfm)}" target="_blank" rel="noopener noreferrer">LFM PROFİLİ ↗</a>` : ''}
    </div>
  `;

  $('driverModal').hidden = false;
  document.body.classList.add('modal-open');
  if (updateHash && location.hash !== `#pilot=${encodeURIComponent(driver.id)}`) {
    history.replaceState(null, '', profileUrl(driver.id));
  }
}

function closeDriverProfile() {
  if (!$('driverModal') || $('driverModal').hidden) return;
  $('driverModal').hidden = true;
  openedPilotId = null;
  document.body.classList.remove('modal-open');
  if (location.hash.startsWith('#pilot=')) {
    history.replaceState(null, '', location.href.split('#')[0]);
  }
}

function openPilotFromHash() {
  const match = location.hash.match(/^#pilot=(.+)$/);
  if (!match || !dataLoaded) return;
  const id = decodeURIComponent(match[1]);
  if (String(openedPilotId) === id) return;
  if (drivers.some(d => String(d.id) === id)) openDriverProfile(id, { updateHash: false });
}

$('driverCards').addEventListener('click', event => {
  if (event.target.closest('a')) return;
  const card = event.target.closest('[data-driver-id]');
  if (card) openDriverProfile(card.dataset.driverId);
});

$('driverCards').addEventListener('keydown', event => {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  const card = event.target.closest('[data-driver-id]');
  if (!card || event.target.closest('a')) return;
  event.preventDefault();
  openDriverProfile(card.dataset.driverId);
});

$('driverProfileContent').addEventListener('click', async event => {
  const raceBtn = event.target.closest('[data-profile-race]');
  if (raceBtn) {
    const race = races.find(r => String(r.id) === raceBtn.dataset.profileRace);
    closeDriverProfile();
    showRaceDetail(race);
    return;
  }
  if (event.target.closest('[data-share-pilot]')) {
    const url = profileUrl(openedPilotId);
    try {
      await navigator.clipboard.writeText(url);
      notify('Profil linki kopyalandı.');
    } catch {
      window.prompt('Linki kopyala:', url);
    }
  }
});

document.querySelectorAll('[data-close-driver]').forEach(element => {
  element.addEventListener('click', closeDriverProfile);
});

addEventListener('hashchange', () => {
  if (location.hash.startsWith('#pilot=')) openPilotFromHash();
  else if (openedPilotId) closeDriverProfile();
});

/* ===== TAKIMA KATILMA FORMU ===== */

const JOIN_COOLDOWN_KEY = 'crescentJoinLast';

$('joinForm').addEventListener('submit', async event => {
  event.preventDefault();
  const out = $('joinMessageOut');
  const name = $('joinName').value.trim();
  const contact = $('joinContact').value.trim();

  if ($('joinWebsite').value) { out.textContent = 'Başvurun alındı, teşekkürler!'; return; } /* bot tuzağı */
  if (name.length < 2) { out.textContent = 'Lütfen adını yaz.'; return; }
  if (contact.length < 3) { out.textContent = 'Lütfen Discord adını ya da e-postanı yaz.'; return; }
  if (!$('joinConsent').checked) { out.textContent = 'Devam etmek için onay kutusunu işaretle.'; return; }
  if (!supabase) { out.textContent = 'Şu an başvuru alınamıyor. Daha sonra tekrar dene.'; return; }

  try {
    const last = Number(localStorage.getItem(JOIN_COOLDOWN_KEY) || 0);
    if (Date.now() - last < 60000) { out.textContent = 'Birkaç saniye bekleyip tekrar dene.'; return; }
  } catch { /* depolama kapalıysa devam et */ }

  const button = event.currentTarget.querySelector('button[type="submit"]');
  button.disabled = true;
  out.textContent = 'Gönderiliyor…';

  const { error } = await supabase.from('applications').insert({
    name,
    contact,
    sims: $('joinSims').value.trim() || null,
    experience: $('joinExp').value,
    message: $('joinMessage').value.trim() || null
  });

  button.disabled = false;

  if (error) {
    console.error(error);
    out.textContent = error.code === '42P01'
      ? 'Başvuru sistemi henüz kurulmamış. Yönetime haber ver.'
      : 'Başvuru gönderilemedi. Alanları kontrol edip tekrar dene.';
    return;
  }

  try { localStorage.setItem(JOIN_COOLDOWN_KEY, String(Date.now())); } catch { /* yoksay */ }
  $('joinForm').reset();
  out.textContent = 'Başvurun alındı, teşekkürler! Seninle iletişime geçeceğiz.';
});

/* ===== ADMİN: BAŞVURULAR ===== */

const EXP_LABELS = { beginner: 'Yeni başlıyor', intermediate: 'Orta seviye', experienced: 'Deneyimli' };

async function loadApplications() {
  if (!isAdmin || !supabase) return;
  const { data, error } = await supabase
    .from('applications')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Başvurular yüklenemedi:', error);
    $('adminAppsList').innerHTML = empty(
      'BAŞVURULAR YÜKLENEMEDİ',
      error.code === '42P01' ? 'applications tablosu yok. yeni_ozellikler.sql dosyasını Supabase SQL Editor\'da çalıştır.' : 'Bağlantıyı kontrol et.'
    );
    return;
  }
  applications = data || [];
  renderAdminApps();
}

function renderAdminApps() {
  if (!$('adminAppsList')) return;
  const unread = applications.filter(a => a.status === 'new').length;
  $('appsBadge').textContent = unread ? String(unread) : '';

  if (!applications.length) {
    if (isAdmin) $('adminAppsList').innerHTML = empty('HENÜZ BAŞVURU YOK', 'Gelen başvurular burada görünecek.');
    return;
  }

  $('adminAppsList').innerHTML = applications.map(a => `
    <div class="admin-record">
      <div>
        <strong>${a.status === 'new' ? '<span class="app-new">● YENİ</span> ' : ''}${safe(a.name)} · ${safe(a.contact)}</strong>
        <small>${safe(EXP_LABELS[a.experience] || '—')}${a.sims ? ' · ' + safe(a.sims) : ''} · ${safe(new Date(a.created_at).toLocaleString('tr-TR'))}</small>
        ${a.message ? `<p class="app-msg">${safe(a.message)}</p>` : ''}
      </div>
      <div class="record-actions">
        ${a.status === 'new' ? `<button type="button" data-app-read="${safe(a.id)}">OKUNDU</button>` : ''}
        <button type="button" data-app-del="${safe(a.id)}">SİL</button>
      </div>
    </div>`).join('');
}

$('adminAppsList').addEventListener('click', async event => {
  const read = event.target.closest('[data-app-read]');
  const del = event.target.closest('[data-app-del]');
  if (!isAdmin || !supabase) return;

  if (read) {
    const { error } = await supabase.from('applications').update({ status: 'read' }).eq('id', read.dataset.appRead);
    if (error) { notify(friendlyError(error, 'Güncelleme')); return; }
    await loadApplications();
  }
  if (del) {
    if (!confirm('Bu başvuru silinsin mi?')) return;
    const { error } = await supabase.from('applications').delete().eq('id', del.dataset.appDel);
    if (error) { notify(friendlyError(error, 'Silme işlemi')); return; }
    await loadApplications();
    notify('Başvuru silindi.');
  }
});

/* GENEL OLAYLAR */

$('loginOpen').addEventListener('click', openLogin);

document.querySelectorAll('[data-close-modal]').forEach(element => {
  element.addEventListener('click', () => {
    $('loginModal').hidden = true;
    document.body.classList.remove('modal-open');
  });
});

document.querySelectorAll('[data-close-race]').forEach(element => {
  element.addEventListener('click', () => {
    $('raceModal').hidden = true;
    document.body.classList.remove('modal-open');
  });
});

$('loginForm').addEventListener('submit', handleLogin);
$('logoutButton').addEventListener('click', handleLogout);

$('driverForm').addEventListener('submit', saveDriver);
$('raceForm').addEventListener('submit', saveRace);
$('lapForm').addEventListener('submit', saveLap);
$('scheduleForm').addEventListener('submit', saveSchedule);
$('teamPhotoForm').addEventListener('submit', uploadTeamPhoto);

$('cancelDriverEdit').addEventListener('click', () => {
  resetForm('driverForm', 'driverId', 'cancelDriverEdit', 'driverMessage');
  $('driverSaveButton').innerHTML = 'PİLOTU KAYDET <span>↗</span>';
});

$('cancelEdit').addEventListener('click', () =>
  resetForm('raceForm', 'raceId', 'cancelEdit', 'raceMessage')
);

$('cancelLapEdit').addEventListener('click', () =>
  resetForm('lapForm', 'lapId', 'cancelLapEdit', 'lapMessage')
);

$('cancelScheduleEdit').addEventListener('click', () =>
  resetForm('scheduleForm', 'scheduleId', 'cancelScheduleEdit', 'scheduleMessage')
);

$('driverFilter').addEventListener('change', renderRaces);
$('classFilter').addEventListener('change', renderRaces);
$('searchFilter').addEventListener('input', renderRaces);

document.querySelectorAll('[data-admin-tab]').forEach(button => {
  button.addEventListener('click', () => switchAdminTab(button.dataset.adminTab));
});

$('raceStatus').addEventListener('change', syncPositionField);
syncPositionField();

/* Klasman seçimi: "Özel klasman yaz" seçilince yazı kutusu açılır */
['raceClass', 'lapClass', 'scheduleClass'].forEach(id => {
  $(id).addEventListener('change', () => {
    syncClassCustom(id);
    if ($(id).value === CUSTOM_CLASS_VALUE) $(id + 'Custom').focus();
  });
});
fillClassSelects();

/* Fotoğraflar: tıklayınca büyüt, yüklenemezse bağlantıya dönüş göster */
document.addEventListener('click', event => {
  const photo = event.target.closest('.record-photo[data-photo-url]');
  if (photo) {
    openPhotoModal(photo.dataset.photoUrl, photo.dataset.photoCaption);
    return;
  }

  if (event.target.closest('[data-close-photo]')) closePhotoModal();
});

document.addEventListener('load', event => {
  const image = event.target;
  if (!(image instanceof HTMLImageElement)) return;

  image.closest('.record-photo')?.classList.add('is-loaded');
}, true);

document.addEventListener('error', event => {
  const image = event.target;
  if (!(image instanceof HTMLImageElement)) return;

  const photo = image.closest('.record-photo');
  if (!photo) return;

  const original = photo.dataset.photoOriginal;
  const fallback = document.createElement(original ? 'a' : 'span');

  fallback.className = 'record-photo photo-failed';
  fallback.textContent = original
    ? 'FOTOĞRAF YÜKLENEMEDİ · BAĞLANTIYI AÇ ↗'
    : 'FOTOĞRAF YÜKLENEMEDİ';

  if (original) {
    fallback.href = original;
    fallback.target = '_blank';
    fallback.rel = 'noopener noreferrer';
  }

  photo.replaceWith(fallback);
}, true);

document.addEventListener('click', event => {
  if (!event.target.closest('[data-retry]')) return;

  if (libraryFailed) {
    location.reload();
    return;
  }

  refreshData();
  loadTeamPhotos();
});

$('year').textContent = new Date().getFullYear();

/* OTURUM DURUMU */

if (configured && supabase) {
  supabase.auth.onAuthStateChange((_event, session) => {
    setTimeout(async () => {
      currentUser = session?.user || null;
      isAdmin = currentUser ? await checkAdmin(currentUser) : false;

      if (isAdmin) {
        $('adminPanel').hidden = false;
        await loadAdminData(currentUser);
      } else {
        adminLoadedFor = null;
        $('adminPanel').hidden = true;
        renderAdminPhotos();
      }
    }, 0);
  });
}

/* SAYFA AÇILINCA */

refreshData();
loadTeamPhotos();
