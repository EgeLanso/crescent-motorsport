
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://supsixtnyprkyfaemabk.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_Mb7kpEFCsWCGKkq-rWAsXQ_VElbSil0';

const configured = SUPABASE_URL.startsWith('https://') && !SUPABASE_URL.includes('PASTE_') && !SUPABASE_ANON_KEY.includes('PASTE_');
const supabase = configured ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

let drivers = [], races = [], lapTimes = [], schedule = [], currentUser = null, isAdmin = false, toastTimer;

const $ = id => document.getElementById(id);
const safe = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const dateLabel = value => value ? new Date(`${value}T12:00:00`).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Tarih yok';
const driverName = id => drivers.find(d => String(d.id) === String(id))?.name || 'Bilinmeyen pilot';
const positionText = race => race.status === 'dnf' ? 'DNF' : race.status === 'dns' ? 'DNS' : (race.position ? `P${race.position}` : '—');

function notify(message) {
  const t = $('toast');
  if (!t) return;
  t.textContent = message;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2800);
}

function empty(message, sub = '') {
  return `<div class="empty-state"><span class="empty-icon">↗</span><h3>${safe(message)}</h3><p>${safe(sub)}</p></div>`;
}

function fillDriverSelects() {
  const makeOptions = () => drivers.map(d =>
    `<option value="${safe(d.id)}">${safe(d.name)}${d.number !== null && d.number !== undefined && d.number !== '' ? ` · #${safe(d.number)}` : ''}</option>`
  ).join('');

  ['raceDriver', 'lapDriver'].forEach(id => {
    const el = $(id);
    if (!el) return;
    const old = el.value;
    el.innerHTML = makeOptions() || '<option value="">Önce pilot ekle</option>';
    if ([...el.options].some(o => o.value === old)) el.value = old;
  });

  const filter = $('driverFilter');
  if (filter) {
    const selected = filter.value;
    filter.innerHTML = '<option value="all">Tüm pilotlar</option>' +
      drivers.map(d => `<option value="${safe(d.id)}">${safe(d.name)}</option>`).join('');
    if ([...filter.options].some(o => o.value === selected)) filter.value = selected;
  }

  renderDrivers();
}




function renderStats() {
  const totalWins = drivers.reduce(
    (sum, d) => sum + (Number(d.total_wins) || 0), 0
  );

  const totalStarts = drivers.reduce(
    (sum, d) => sum + (Number(d.total_starts) || 0), 0
  );

  const totalPodiums = drivers.reduce(
    (sum, d) => sum + (Number(d.total_podiums) || 0), 0
  );

  const totalPoles = drivers.reduce(
    (sum, d) => sum + (Number(d.total_poles) || 0), 0
  );

  if ($('statWins')) $('statWins').textContent = totalWins;
  if ($('statStarts')) $('statStarts').textContent = totalStarts;
  if ($('statPodiums')) $('statPodiums').textContent = totalPodiums;
  if ($('statPoles')) $('statPoles').textContent = totalPoles;

  const dnfEl = $('statDnfs');
  if (dnfEl) {
    const card = dnfEl.closest('.stat-card, .stat-item, .stat');
    if (card) card.remove();
    else dnfEl.remove();
  }
}

function renderDrivers() {
  $('driverCards').innerHTML = drivers.length
    ? drivers.map(d => {
        const starts = Number(d.total_starts) || 0;
        const wins = Number(d.total_wins) || 0;
        const podiums = Number(d.total_podiums) || 0;
        const poles = Number(d.total_poles) || 0;

        return `<article class="driver-card" data-number="${safe(d.number ?? '—')}">
          ${d.car_image_url ? `<img class="driver-car-image" src="${safe(d.car_image_url)}" alt="${safe(d.name)} — ${safe(d.main_car || 'araç')}" loading="lazy" onerror="this.hidden=true">` : ''}
          <div class="driver-number">${d.number !== null && d.number !== undefined && d.number !== '' ? `#${safe(d.number)}` : '—'}</div>
          <div class="driver-name">${safe(d.name)}</div>
          <div class="driver-tag">${safe(d.tag || 'Driver')}</div>
          ${d.main_car ? `<div class="driver-main-car">${safe(d.main_car)}</div>` : ''}
          <div class="driver-record">
            ${starts} starts · ${wins} wins<br>
            ${podiums} podiums · ${poles} poles
          </div>
          ${d.lfm_profile_url ? `<a class="text-link" href="${safe(d.lfm_profile_url)}" target="_blank" rel="noopener noreferrer">LFM PROFİLİ ↗</a>` : ''}
        </article>`;
      }).join('')
    : empty('PİLOTLAR EKLENMEDİ', 'Pilotlar admin panelinden eklenir.');
}

function renderRaces() {
  const driver = $('driverFilter').value;
  const cls = $('classFilter').value;
  const term = $('searchFilter').value.trim().toLowerCase();

  const filtered = [...races]
    .sort((a, b) => String(b.race_date || '').localeCompare(String(a.race_date || '')))
    .filter(r =>
      (driver === 'all' || String(r.driver_id) === driver) &&
      (cls === 'all' || r.race_class === cls) &&
      (!term || [r.game, r.car, r.track, driverName(r.driver_id), r.race_class]
        .some(v => String(v || '').toLowerCase().includes(term)))
    );

  $('raceCount').textContent = `${filtered.length} KAYIT`;

  if (!filtered.length) {
    $('raceList').innerHTML = empty(
      races.length ? 'SONUÇ BULUNAMADI' : 'İLK KAYITLAR BEKLENİYOR',
      races.length ? 'Filtreleri değiştirip tekrar dene.' : 'Yarış sonuçları admin panelinden elle eklenecek.'
    );
    return;
  }

  $('raceList').innerHTML = filtered.map(r => `
    <article class="race-card" data-race-id="${safe(r.id)}" tabindex="0" role="button" aria-label="${safe(driverName(r.driver_id))} yarış ayrıntısı">
      <div class="race-position">${safe(positionText(r))}<small>RESULT</small></div>
      <div class="race-main">
        <div class="race-topline">
          <span class="race-driver">${safe(driverName(r.driver_id))}</span>
          <span class="race-tag">${safe(r.race_class || 'Other')}</span>
        </div>
        <div class="race-subline">
          <span>${safe(r.car || 'Araç yok')}</span>
          <span>${safe(r.track || 'Pist yok')}</span>
          <span>${safe(r.game || 'Oyun yok')}</span>
          ${r.best_lap ? `<span>Best ${safe(r.best_lap)}</span>` : ''}
        </div>
      </div>
      <div class="race-date">${safe(dateLabel(r.race_date))}
        <strong>${r.status === 'dnf' ? 'DID NOT FINISH' : r.status === 'dns' ? 'DID NOT START' : (r.position ? `FINISHED P${safe(r.position)}` : 'FINISHED')}</strong>
      </div>
    </article>`).join('');

  $('raceList').querySelectorAll('[data-race-id]').forEach(el => {
    const open = () => showRaceDetail(races.find(r => String(r.id) === el.dataset.raceId));
    el.addEventListener('click', open);
    el.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        open();
      }
    });
  });
}

function showRaceDetail(r) {
  if (!r) return;

  $('raceDetailContent').innerHTML = `
    <div class="detail-hero">
      <p class="eyebrow">RACE REPORT · ${safe(dateLabel(r.race_date))}</p>
      <h2 id="raceDetailTitle">${safe(driverName(r.driver_id))}</h2>
      <div class="detail-pos">${safe(positionText(r))}</div>
      <span class="race-tag">${safe(r.race_class || 'Other')}</span>
    </div>
    <div class="detail-meta">
      <div><small>CAR</small><strong>${safe(r.car || '—')}</strong></div>
      <div><small>TRACK</small><strong>${safe(r.track || '—')}</strong></div>
      <div><small>GAME</small><strong>${safe(r.game || '—')}</strong></div>
      <div><small>BEST LAP</small><strong>${safe(r.best_lap || '—')}</strong></div>
    </div>
    ${r.notes ? `<p class="detail-notes">${safe(r.notes)}</p>` : ''}
    ${r.image_url ? `<p><a class="detail-link" href="${safe(r.image_url)}" target="_blank" rel="noopener">FOTOĞRAFI AÇ ↗</a></p>` : ''}
    ${r.lfm_url ? `<a class="detail-link" href="${safe(r.lfm_url)}" target="_blank" rel="noopener">SONUÇ / LFM LİNKİ ↗</a>` : ''}`;

  $('raceModal').hidden = false;
}

function recordRow(title, sub, actions) {
  return `<div class="admin-record">
    <div><strong>${safe(title)}</strong><small>${safe(sub)}</small></div>
    <div class="record-actions">${actions}</div>
  </div>`;
}

/* PILOTLAR — düzeltilmiş bölüm */
function renderAdminDrivers() {
  $('adminDriverList').innerHTML = drivers.length
    ? drivers.map(d => recordRow(
        `${d.name}${d.number !== null && d.number !== undefined && d.number !== '' ? ` · #${d.number}` : ''}`,
        `${d.tag || 'Driver'}${d.main_car ? ' · ' + d.main_car : ''}${d.car_image_url ? ' · araç fotoğrafı var' : ''} · ${Number(d.total_starts) || 0} starts · ${Number(d.total_wins) || 0} wins · ${Number(d.total_podiums) || 0} podiums · ${Number(d.total_poles) || 0} poles${d.lfm_profile_url ? ' · LFM profili ekli' : ''}`,
        `<button type="button" data-edit-driver="${safe(d.id)}">DÜZENLE</button><button type="button" data-delete-driver="${safe(d.id)}">SİL</button>`
      )).join('')
    : empty('HENÜZ PİLOT YOK', 'Yeni pilotu yukarıdaki formdan ekle.');

  $('adminDriverList').querySelectorAll('[data-edit-driver]').forEach(b => {
    b.addEventListener('click', () =>
      editDriver(drivers.find(d => String(d.id) === b.dataset.editDriver))
    );
  });

  $('adminDriverList').querySelectorAll('[data-delete-driver]').forEach(b => {
    b.addEventListener('click', () => deleteDriver(b.dataset.deleteDriver));
  });
}

function renderAdminRaces() {
  $('adminRaceList').innerHTML = races.length
    ? [...races]
        .sort((a, b) => String(b.race_date || '').localeCompare(String(a.race_date || '')))
        .map(r => recordRow(
          `${driverName(r.driver_id)} · ${positionText(r)}`,
          `${dateLabel(r.race_date)} · ${r.car || ''} · ${r.track || ''}`,
          `<button type="button" data-edit-race="${safe(r.id)}">DÜZENLE</button><button type="button" data-delete-race="${safe(r.id)}">SİL</button>`
        )).join('')
    : empty('YARIŞ KAYDI YOK', 'Yarışları kendin ekle.');

  $('adminRaceList').querySelectorAll('[data-edit-race]').forEach(b => {
    b.addEventListener('click', () =>
      editRace(races.find(r => String(r.id) === b.dataset.editRace))
    );
  });

  $('adminRaceList').querySelectorAll('[data-delete-race]').forEach(b => {
    b.addEventListener('click', () => deleteRace(b.dataset.deleteRace));
  });
}

function renderLapTimes() {
  const sorted = [...lapTimes].sort((a, b) =>
    String(b.lap_date || '').localeCompare(String(a.lap_date || ''))
  );

  $('lapTimeList').innerHTML = sorted.length
    ? sorted.map(l => `
      <article class="race-card lap-card">
        <div class="race-position">${safe(l.lap_time)}<small>LAP TIME</small></div>
        <div class="race-main">
          <div class="race-topline">
            <span class="race-driver">${safe(driverName(l.driver_id))}</span>
            <span class="race-tag">${safe(l.race_class)}</span>
          </div>
          <div class="race-subline">
            <span>${safe(l.car)}</span><span>${safe(l.track)}</span><span>${safe(l.game)}</span>
          </div>
          ${l.image_url ? `<a class="detail-link" href="${safe(l.image_url)}" target="_blank" rel="noopener">FOTOĞRAFI AÇ ↗</a>` : ''}
        </div>
        <div class="race-date">${safe(dateLabel(l.lap_date))}</div>
      </article>`).join('')
    : empty('TUR ZAMANI KAYDI YOK', 'Tur zamanları admin panelinden eklenir.');

  $('adminLapList').innerHTML = sorted.length
    ? sorted.map(l => recordRow(
        `${driverName(l.driver_id)} · ${l.lap_time}`,
        `${dateLabel(l.lap_date)} · ${l.car} · ${l.track} · ${l.game}`,
        `<button type="button" data-edit-lap="${safe(l.id)}">DÜZENLE</button><button type="button" data-delete-lap="${safe(l.id)}">SİL</button>`
      )).join('')
    : empty('TUR ZAMANI YOK', 'İlk zamanı ekle.');

  $('adminLapList').querySelectorAll('[data-edit-lap]').forEach(b => {
    b.addEventListener('click', () =>
      editLap(lapTimes.find(l => String(l.id) === b.dataset.editLap))
    );
  });

  $('adminLapList').querySelectorAll('[data-delete-lap]').forEach(b => {
    b.addEventListener('click', () =>
      deleteRecord('driver_lap_times', b.dataset.deleteLap, 'Tur zamanı silindi.')
    );
  });
}

function renderSchedule() {
  const sorted = [...schedule].sort((a, b) =>
    String(a.event_date || '').localeCompare(String(b.event_date || ''))
  );

  $('scheduleList').innerHTML = sorted.length
    ? sorted.map(s => `
      <article class="race-card">
        <div class="race-position">${safe(String(s.event_date || '').slice(8, 10) || '—')}<small>${safe(String(s.event_date || '').slice(0, 7))}</small></div>
        <div class="race-main">
          <div class="race-topline">
            <span class="race-driver">${safe(s.event_name)}</span>
            ${s.race_class ? `<span class="race-tag">${safe(s.race_class)}</span>` : ''}
          </div>
          <div class="race-subline">${[s.game, s.track, s.drivers, s.car].filter(Boolean).map(v => `<span>${safe(v)}</span>`).join('')}</div>
          ${s.notes ? `<p class="detail-notes">${safe(s.notes)}</p>` : ''}
          ${s.event_url ? `<a class="detail-link" href="${safe(s.event_url)}" target="_blank" rel="noopener">ETKİNLİK BİLGİSİ ↗</a>` : ''}
        </div>
        <div class="race-date">${safe(dateLabel(s.event_date))}<strong>${safe(s.event_time ? String(s.event_time).slice(0, 5) : 'SAAT BELİRTİLMEDİ')}</strong></div>
      </article>`).join('')
    : empty('TAKVİM BOŞ', 'Yarış tarihlerini admin panelinden ekleyebilirsin.');

  $('adminScheduleList').innerHTML = sorted.length
    ? sorted.map(s => recordRow(
        `${s.event_name} · ${dateLabel(s.event_date)}`,
        `${s.event_time ? String(s.event_time).slice(0, 5) + ' · ' : ''}${s.track || ''} · ${s.game || ''}`,
        `<button type="button" data-edit-schedule="${safe(s.id)}">DÜZENLE</button><button type="button" data-delete-schedule="${safe(s.id)}">SİL</button>`
      )).join('')
    : empty('TAKVİM BOŞ', 'Yeni etkinlik ekle.');

  $('adminScheduleList').querySelectorAll('[data-edit-schedule]').forEach(b => {
    b.addEventListener('click', () =>
      editSchedule(schedule.find(s => String(s.id) === b.dataset.editSchedule))
    );
  });

  $('adminScheduleList').querySelectorAll('[data-delete-schedule]').forEach(b => {
    b.addEventListener('click', () =>
      deleteRecord('race_schedule', b.dataset.deleteSchedule, 'Takvim kaydı silindi.')
    );
  });
}

function rerender() {
  fillDriverSelects();
  renderStats();
  renderRaces();
  renderAdminDrivers();
  renderAdminRaces();
  renderLapTimes();
  renderSchedule();
}

function openLogin() {
  $('loginMessage').textContent = configured ? '' : 'Önce README.md içindeki Supabase kurulumunu tamamla.';
  $('loginModal').hidden = false;
}

async function checkAdmin(user) {
  if (!supabase || !user) return false;
  const { data, error } = await supabase.from('admin_users').select('user_id').eq('user_id', user.id).maybeSingle();
  if (error) {
    console.error(error);
    return false;
  }
  return !!data;
}

async function refreshData() {
  if (!configured) {
    drivers = [];
    races = [];
    lapTimes = [];
    schedule = [];
    rerender();
    return;
  }

  const results = await Promise.all([
    supabase.from('drivers').select('*').order('name'),
    supabase.from('race_results').select('*').order('race_date', { ascending: false }),
    supabase.from('driver_lap_times').select('*').order('lap_date', { ascending: false }),
    supabase.from('race_schedule').select('*').order('event_date', { ascending: true })
  ]);

  const [d, r, l, s] = results;
  if (!d.error) drivers = d.data || [];
  if (!r.error) races = r.data || [];
  if (!l.error) lapTimes = l.data || [];
  if (!s.error) schedule = s.data || [];

  for (const x of results) {
    if (x.error) console.error('Supabase load error', x.error);
  }

  rerender();
}

async function handleLogin(e) {
  e.preventDefault();
  if (!supabase) {
    $('loginMessage').textContent = 'Supabase henüz yapılandırılmamış. README.md dosyasını izle.';
    return;
  }

  const button = $('loginForm').querySelector('button[type=submit]');
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
  await refreshData();
  $('adminPanel').scrollIntoView({ behavior: 'smooth' });
  notify('Admin girişi başarılı.');
}

async function handleLogout() {
  if (supabase) await supabase.auth.signOut();
  currentUser = null;
  isAdmin = false;
  $('adminPanel').hidden = true;
  notify('Çıkış yapıldı.');
}

function resetForm(formId, hiddenId, buttonId, msgId) {
  $(formId).reset();
  if (hiddenId) $(hiddenId).value = '';
  if (buttonId) $(buttonId).hidden = true;
  if (msgId) $(msgId).textContent = '';
}

function editDriver(d) {
  if (!d) return;

  $('driverId').value = d.id;
  $('driverName').value = d.name || '';
  $('driverNumber').value = d.number ?? '';
  $('driverTag').value = d.tag || 'Driver';
  $('driverCar').value = d.main_car || '';
  $('driverCarImage').value = d.car_image_url || '';
  $('driverLfmUrl').value = d.lfm_profile_url || '';
  $('driverStarts').value = d.total_starts ?? 0;
  $('driverWins').value = d.total_wins ?? 0;
  $('driverPodiums').value = d.total_podiums ?? 0;
  $('driverPoles').value = d.total_poles ?? 0;

  $('cancelDriverEdit').hidden = false;
  $('driverSaveButton').innerHTML = 'DEĞİŞİKLİKLERİ KAYDET';
  $('driverForm').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function saveDriver(e) {
  e.preventDefault();
  if (!isAdmin || !supabase) return;

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

  const result = id
    ? await supabase.from('drivers').update(payload).eq('id', id)
    : await supabase.from('drivers').insert(payload);

  if (result.error) {
    $('driverMessage').textContent = 'Pilot kaydedilemedi. Alanları ve veritabanı sütunlarını kontrol et.';
    console.error(result.error);
    return;
  }

  resetForm('driverForm', 'driverId', 'cancelDriverEdit', 'driverMessage');
  $('driverSaveButton').innerHTML = 'PİLOTU KAYDET <span>↗</span>';
  $('cancelDriverEdit').hidden = true;

  await refreshData();
  notify(id ? 'Pilot güncellendi.' : 'Pilot eklendi.');
}

function raceFormData() {
  const status = $('raceStatus').value;
  return {
    driver_id: $('raceDriver').value,
    race_date: $('raceDate').value,
    game: $('raceGame').value.trim(),
    race_class: $('raceClass').value,
    car: $('raceCar').value.trim(),
    track: $('raceTrack').value.trim(),
    status,
    position: status === 'finished' && $('racePosition').value ? Number($('racePosition').value) : null,
    best_lap: $('raceLap').value.trim() || null,
    lfm_url: $('raceUrl').value.trim() || null,
    image_url: $('raceImage').value.trim() || null,
    notes: $('raceNotes').value.trim() || null
  };
}

async function saveRace(e) {
  e.preventDefault();
  if (!isAdmin || !supabase) return;

  if (!drivers.length) {
    $('raceMessage').textContent = 'Önce Pilotlar sekmesinden bir pilot ekle.';
    return;
  }

  const id = $('raceId').value;
  const payload = raceFormData();
  const { error } = id
    ? await supabase.from('race_results').update(payload).eq('id', id)
    : await supabase.from('race_results').insert(payload);

  if (error) {
    $('raceMessage').textContent = 'Kayıt yapılamadı. Alanları ve Supabase kurulumunu kontrol et.';
    console.error(error);
    return;
  }

  resetForm('raceForm', 'raceId', 'cancelEdit', 'raceMessage');
  $('cancelEdit').hidden = true;
  await refreshData();
  notify(id ? 'Yarış güncellendi.' : 'Yarış eklendi.');
}

function editRace(r) {
  if (!r) return;
  $('raceId').value = r.id;
  $('raceDriver').value = r.driver_id;
  $('raceDate').value = r.race_date || '';
  $('raceGame').value = r.game || '';
  $('raceClass').value = r.race_class || 'Other';
  $('raceCar').value = r.car || '';
  $('raceTrack').value = r.track || '';
  $('raceStatus').value = r.status || 'finished';
  $('racePosition').value = r.position || '';
  $('raceLap').value = r.best_lap || '';
  $('raceUrl').value = r.lfm_url || '';
  $('raceImage').value = r.image_url || '';
  $('raceNotes').value = r.notes || '';
  $('cancelEdit').hidden = false;
  $('raceForm').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function deleteRace(id) {
  await deleteRecord('race_results', id, 'Yarış kaydı silindi.');
}

function lapFormData() {
  return {
    driver_id: $('lapDriver').value,
    lap_date: $('lapDate').value || null,
    game: $('lapGame').value.trim(),
    race_class: $('lapClass').value,
    car: $('lapCar').value.trim(),
    track: $('lapTrack').value.trim(),
    lap_time: $('lapTime').value.trim(),
    image_url: $('lapImage').value.trim() || null,
    notes: $('lapNotes').value.trim() || null
  };
}

async function saveLap(e) {
  e.preventDefault();
  if (!isAdmin || !supabase) return;

  if (!drivers.length) {
    $('lapMessage').textContent = 'Önce pilot ekle.';
    return;
  }

  const id = $('lapId').value;
  const p = lapFormData();
  const q = id
    ? await supabase.from('driver_lap_times').update(p).eq('id', id)
    : await supabase.from('driver_lap_times').insert(p);

  if (q.error) {
    $('lapMessage').textContent = 'Tur zamanı kaydedilemedi. Kurulumu kontrol et.';
    console.error(q.error);
    return;
  }

  resetForm('lapForm', 'lapId', 'cancelLapEdit', 'lapMessage');
  $('cancelLapEdit').hidden = true;
  await refreshData();
  notify(id ? 'Tur zamanı güncellendi.' : 'Tur zamanı eklendi.');
}

function editLap(l) {
  if (!l) return;
  $('lapId').value = l.id;
  $('lapDriver').value = l.driver_id;
  $('lapDate').value = l.lap_date || '';
  $('lapGame').value = l.game || '';
  $('lapClass').value = l.race_class || 'Other';
  $('lapCar').value = l.car || '';
  $('lapTrack').value = l.track || '';
  $('lapTime').value = l.lap_time || '';
  $('lapImage').value = l.image_url || '';
  $('lapNotes').value = l.notes || '';
  $('cancelLapEdit').hidden = false;
  $('lapForm').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function scheduleFormData() {
  return {
    event_name: $('scheduleName').value.trim(),
    event_date: $('scheduleDate').value,
    event_time: $('scheduleTime').value || null,
    game: $('scheduleGame').value.trim() || null,
    race_class: $('scheduleClass').value || null,
    track: $('scheduleTrack').value.trim() || null,
    drivers: $('scheduleDrivers').value.trim() || null,
    car: $('scheduleCar').value.trim() || null,
    event_url: $('scheduleUrl').value.trim() || null,
    notes: $('scheduleNotes').value.trim() || null
  };
}

async function saveSchedule(e) {
  e.preventDefault();
  if (!isAdmin || !supabase) return;

  const id = $('scheduleId').value;
  const p = scheduleFormData();
  const q = id
    ? await supabase.from('race_schedule').update(p).eq('id', id)
    : await supabase.from('race_schedule').insert(p);

  if (q.error) {
    $('scheduleMessage').textContent = 'Takvim kaydı kaydedilemedi. Kurulumu kontrol et.';
    console.error(q.error);
    return;
  }

  resetForm('scheduleForm', 'scheduleId', 'cancelScheduleEdit', 'scheduleMessage');
  $('cancelScheduleEdit').hidden = true;
  await refreshData();
  notify(id ? 'Takvim kaydı güncellendi.' : 'Takvime eklendi.');
}

function editSchedule(s) {
  if (!s) return;
  $('scheduleId').value = s.id;
  $('scheduleName').value = s.event_name || '';
  $('scheduleDate').value = s.event_date || '';
  $('scheduleTime').value = s.event_time ? String(s.event_time).slice(0, 5) : '';
  $('scheduleGame').value = s.game || '';
  $('scheduleClass').value = s.race_class || 'Other';
  $('scheduleTrack').value = s.track || '';
  $('scheduleDrivers').value = s.drivers || '';
  $('scheduleCar').value = s.car || '';
  $('scheduleUrl').value = s.event_url || '';
  $('scheduleNotes').value = s.notes || '';
  $('cancelScheduleEdit').hidden = false;
  $('scheduleForm').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function deleteRecord(table, id, message) {
  if (!isAdmin || !supabase || !confirm('Bu kaydı silmek istediğine emin misin?')) return;

  const { error } = await supabase.from(table).delete().eq('id', id);
  if (error) {
    notify('Silinemedi. Veritabanı yetkilerini kontrol et.');
    console.error(error);
    return;
  }

  await refreshData();
  notify(message);
}

function switchAdminTab(tab) {
  document.querySelectorAll('.admin-tab').forEach(b =>
    b.classList.toggle('active', b.dataset.adminTab === tab)
  );
  $('adminDriverView').hidden = tab !== 'driver';
  $('adminRaceView').hidden = tab !== 'race';
  $('adminLapView').hidden = tab !== 'lap';
  $('adminScheduleView').hidden = tab !== 'schedule';
}

/* EVENT LISTENERS */
$('loginOpen').addEventListener('click', openLogin);

document.querySelectorAll('[data-close-modal]').forEach(el =>
  el.addEventListener('click', () => $('loginModal').hidden = true)
);

document.querySelectorAll('[data-close-race]').forEach(el =>
  el.addEventListener('click', () => $('raceModal').hidden = true)
);

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    $('loginModal').hidden = true;
    $('raceModal').hidden = true;
  }
});

$('loginForm').addEventListener('submit', handleLogin);
$('logoutButton').addEventListener('click', handleLogout);
$('driverForm').addEventListener('submit', saveDriver);
$('raceForm').addEventListener('submit', saveRace);
$('lapForm').addEventListener('submit', saveLap);
$('scheduleForm').addEventListener('submit', saveSchedule);

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

document.querySelectorAll('[data-admin-tab]').forEach(b =>
  b.addEventListener('click', () => switchAdminTab(b.dataset.adminTab))
);

$('raceStatus').addEventListener('change', () => {
  $('racePosition').disabled = $('raceStatus').value !== 'finished';
  if ($('raceStatus').value !== 'finished') $('racePosition').value = '';
});

$('year').textContent = new Date().getFullYear();

if (configured) {
  supabase.auth.onAuthStateChange((_event, session) => {
    setTimeout(async () => {
      currentUser = session?.user || null;
      isAdmin = currentUser ? await checkAdmin(currentUser) : false;

      if (isAdmin) {
        $('adminPanel').hidden = false;
        await refreshData();
      } else {
        $('adminPanel').hidden = true;
      }
    }, 0);
  });
}

refreshData();
