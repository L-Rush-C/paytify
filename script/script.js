// ═══ STATE ═══
const PIN = '1597';
let pinValue = '';
let currentYear = new Date().getFullYear();
const TODAY = new Date();
const CURRENT_MONTH = TODAY.getMonth(); // 0-indexed
const CURRENT_YEAR = TODAY.getFullYear();

const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

function loadState() {
  return JSON.parse(localStorage.getItem('pagos_state') || 'null') || {
    people: [
      { id: 1, name: 'Persona 1', photo: null },
      { id: 2, name: 'Persona 2', photo: null },
    ],
    amount: 5000,
    payments: {} // key: "YYYY-MM" -> { personId: { paid: bool, amount: num, skipped: bool } }
  };
}

function saveState() {
  localStorage.setItem('pagos_state', JSON.stringify(state));
}

let state = loadState();

// ═══ LOGIN ═══
function pinPress(n) {
  if (pinValue.length >= 4) return;
  pinValue += n;
  updateDots();
  if (pinValue.length === 4) {
    setTimeout(() => {
      if (pinValue === PIN) {
        document.getElementById('login-screen').style.display = 'none';
        document.getElementById('app').style.display = 'block';
        renderApp();
      } else {
        document.getElementById('login-error').textContent = 'Clave incorrecta';
        pinValue = '';
        updateDots();
        const err = document.getElementById('login-error');
        err.style.animation = 'none';
        requestAnimationFrame(() => err.style.animation = 'shake 0.3s ease');
      }
    }, 200);
  }
}

function pinDel() {
  pinValue = pinValue.slice(0, -1);
  updateDots();
  document.getElementById('login-error').textContent = '';
}

function updateDots() {
  const dots = document.querySelectorAll('.pin-dot');
  dots.forEach((d, i) => d.classList.toggle('filled', i < pinValue.length));
}

// ═══ PANELS ═══
function showPanel(name) {
  document.getElementById('home-panel').style.display = name === 'home' ? 'block' : 'none';
  document.getElementById('settings-panel').style.display = name === 'settings' ? 'block' : 'none';
  document.getElementById('nav-home').classList.toggle('active', name === 'home');
  document.getElementById('nav-settings').classList.toggle('active', name === 'settings');
  if (name === 'settings') renderSettings();
  if (name === 'home') renderMonths();
}

// ═══ YEAR ═══
function changeYear(d) {
  currentYear += d;
  document.getElementById('year-display').textContent = currentYear;
  renderMonths();
}

// ═══ PAYMENT DATA HELPERS ═══
function monthKey(year, month) { return `${year}-${String(month).padStart(2,'0')}`; }

function getMonthData(year, month) {
  const k = monthKey(year, month);
  if (!state.payments[k]) {
    state.payments[k] = {};
    state.people.forEach(p => {
      state.payments[k][p.id] = { paid: false, amount: 0, skipped: false, debt: 0 };
    });
  }
  // Ensure all current people exist
  state.people.forEach(p => {
    if (!state.payments[k][p.id]) {
      state.payments[k][p.id] = { paid: false, amount: 0, skipped: false, debt: 0 };
    }
  });
  return state.payments[k];
}

function getDebt(personId, year, month) {
  // Check if person skipped previous month
  let prevMonth = month - 1;
  let prevYear = year;
  if (prevMonth < 0) { prevMonth = 11; prevYear--; }
  const k = monthKey(prevYear, prevMonth);
  if (!state.payments[k] || !state.payments[k][personId]) return 0;
  const prev = state.payments[k][personId];
  if (prev.skipped && !prev.paid) return state.amount;
  return 0;
}

// ═══ MONTH STATUS ═══
function getMonthStatus(year, month) {
  const data = getMonthData(year, month);
  const people = state.people;
  if (!people.length) return 'empty';

  const totalActive = people.filter(p => !data[p.id]?.skipped).length;
  const paid = people.filter(p => data[p.id]?.paid).length;
  const skipped = people.filter(p => data[p.id]?.skipped && !data[p.id]?.paid).length;

  if (paid + skipped === people.length && people.length > 0) return 'green';
  if (paid === 0) return 'red';
  return 'yellow';
}

function isMonthlySolved(year, month) {
  const data = getMonthData(year, month);
  return state.people.every(p => data[p.id]?.paid || data[p.id]?.skipped);
}

// ═══ RENDER APP ═══
function renderApp() {
  document.getElementById('year-display').textContent = currentYear;
  renderMonths();
}

function renderMonths() {
  const grid = document.getElementById('months-grid');
  grid.innerHTML = '';

  let solvedCount = 0;

  for (let m = 0; m < 12; m++) {
    const isPast = (currentYear < CURRENT_YEAR) || (currentYear === CURRENT_YEAR && m < CURRENT_MONTH);
    const isCurrent = currentYear === CURRENT_YEAR && m === CURRENT_MONTH;
    const isFuture = (currentYear > CURRENT_YEAR) || (currentYear === CURRENT_YEAR && m > CURRENT_MONTH);

    const data = getMonthData(currentYear, m);
    const status = (isPast || isCurrent) ? getMonthStatus(currentYear, m) : null;

    if (isMonthlySolved(currentYear, m) && (isPast || isCurrent)) solvedCount++;

    const card = document.createElement('div');
    card.className = 'month-card';

    if (isFuture) {
      card.classList.add('future');
    } else if (isPast) {
      card.classList.add('past');
      if (status === 'yellow') card.classList.add('status-yellow');
      if (status === 'red') card.classList.add('status-red');
    } else {
      // current
      card.classList.add('current');
      if (status === 'yellow') card.classList.add('status-yellow');
      if (status === 'red') card.classList.add('status-red');
      if (status === 'green') card.classList.add('status-green');
    }

    const icon = status === 'green' ? '✓' : status === 'yellow' ? '●' : status === 'red' ? '●' : '';
    const iconColor = status === 'green' ? 'var(--green)' : status === 'yellow' ? 'var(--yellow)' : 'var(--red)';

    // People
    let peopleHTML = '';
    if (!isFuture) {
      state.people.forEach(p => {
        const pd = data[p.id] || {};
        let cls = '';
        let overlay = '';
        let debtBadge = '';
        if (pd.paid) { cls = 'paid'; overlay = '<div class="paid-check">✓</div>'; }
        else if (pd.skipped) { cls = 'skip'; }
        const debt = getDebt(p.id, currentYear, m);
        if (debt > 0 && isCurrent) { debtBadge = '<div class="debt-badge">$</div>'; cls = 'debt'; }

        const imgOrLetter = p.photo
          ? `<img src="${p.photo}" alt="${p.name}">`
          : `<span>${p.name.charAt(0).toUpperCase()}</span>`;

        peopleHTML += `<div class="person-avatar ${cls}" onclick="openPersonModal(${p.id},${m})" title="${p.name}">
          ${imgOrLetter}${overlay}${debtBadge}
        </div>`;
      });
    }

    // Stats
    const paidCount = state.people.filter(p => data[p.id]?.paid).length;
    const skipCount = state.people.filter(p => data[p.id]?.skipped && !data[p.id]?.paid).length;
    const total = state.people.length;

    // Skip button (current month, not fully solved)
    let skipBtnHTML = '';
    if (isCurrent && !isMonthlySolved(currentYear, m)) {
      skipBtnHTML = `<button class="skip-btn" onclick="event.stopPropagation();openSkipModal(${m})">↷ Saltar vez</button>`;
    }

    card.innerHTML = `
      <div class="month-label">${MONTHS[m]}</div>
      ${icon ? `<div class="month-status-icon" style="color:${iconColor}">${icon}</div>` : ''}
      <div class="month-people">${peopleHTML}</div>
      ${!isFuture ? `<div class="month-summary">${paidCount + skipCount}/${total} resuelto${skipCount ? ` (${skipCount} saltaron)` : ''}</div>` : ''}
      ${skipBtnHTML}
    `;

    grid.appendChild(card);
  }

  // Progress
  const pct = Math.round((solvedCount / 12) * 100);
  document.getElementById('progress-bar').style.width = pct + '%';
  document.getElementById('progress-count').innerHTML = `${solvedCount} <span>/ 12</span>`;
}

// ═══ PERSON MODAL ═══
let modalPersonId = null;
let modalMonth = null;

function openPersonModal(personId, month) {
  const yr = currentYear;
  const m = month;
  const isPast = (yr < CURRENT_YEAR) || (yr === CURRENT_YEAR && m < CURRENT_MONTH);
  const isCurrent = yr === CURRENT_YEAR && m === CURRENT_MONTH;
  if (!isPast && !isCurrent) return;

  const person = state.people.find(p => p.id === personId);
  if (!person) return;

  const data = getMonthData(yr, m);
  const pd = data[personId] || {};

  modalPersonId = personId;
  modalMonth = month;

  // Avatar
  const av = document.getElementById('modal-avatar');
  av.innerHTML = person.photo ? `<img src="${person.photo}">` : person.name.charAt(0).toUpperCase();

  document.getElementById('modal-name').textContent = person.name;
  document.getElementById('modal-month-label').textContent = `${MONTHS[m]} ${yr}`;

  const debt = getDebt(personId, yr, m);
  const debtAlert = document.getElementById('debt-alert');
  if (debt > 0) {
    debtAlert.className = 'debt-alert show';
    debtAlert.textContent = `⚠ Tiene deuda de ${formatAmount(debt)} del mes anterior`;
  } else {
    debtAlert.className = 'debt-alert';
  }

  document.getElementById('custom-amount').value = '';
  document.getElementById('action-modal').querySelector('.action-btn.green').textContent =
    pd.paid ? '✓ Ya marcado como pagado (desmarcar)' : `✓ Ya pagó (${formatAmount(state.amount)})`;

  document.getElementById('modal-backdrop').classList.add('open');
}

function closeModal(e) {
  if (!e || e.target === document.getElementById('modal-backdrop')) {
    document.getElementById('modal-backdrop').classList.remove('open');
  }
}

function markPaid() {
  const yr = currentYear;
  const m = modalMonth;
  const data = getMonthData(yr, m);
  const pd = data[modalPersonId];

  if (pd.paid) {
    // Unmark
    pd.paid = false; pd.amount = 0;
  } else {
    pd.paid = true;
    pd.amount = state.amount + getDebt(modalPersonId, yr, m);
    pd.skipped = false;
  }

  saveState();
  closeModal();
  renderMonths();
  showToast(pd.paid ? '✓ Pago registrado' : 'Pago removido', pd.paid ? 'green' : '');
}

function markPaidCustom() {
  const val = parseFloat(document.getElementById('custom-amount').value);
  if (!val || val <= 0) { showToast('Ingresa un monto válido'); return; }

  const yr = currentYear;
  const m = modalMonth;
  const data = getMonthData(yr, m);
  data[modalPersonId].paid = true;
  data[modalPersonId].amount = val;
  data[modalPersonId].skipped = false;

  saveState();
  closeModal();
  renderMonths();
  showToast(`✓ Pago de ${formatAmount(val)} registrado`, 'green');
}

// ═══ SKIP MODAL ═══
let skipMonth = null;
let selectedSkipPeople = new Set();

function openSkipModal(month) {
  skipMonth = month;
  selectedSkipPeople = new Set();
  const yr = currentYear;
  const data = getMonthData(yr, month);

  const list = document.getElementById('skip-person-list');
  list.innerHTML = '';

  state.people.forEach(p => {
    const pd = data[p.id] || {};
    if (pd.paid) return; // Already paid, can't skip

    const item = document.createElement('div');
    item.className = 'skip-person-item';
    item.id = `skip-item-${p.id}`;

    const imgOrLetter = p.photo
      ? `<img src="${p.photo}" style="width:30px;height:30px;border-radius:50%;object-fit:cover">`
      : `<div style="width:30px;height:30px;border-radius:50%;background:var(--surface3);display:flex;align-items:center;justify-content:center;font-weight:600;font-size:13px">${p.name.charAt(0).toUpperCase()}</div>`;

    item.innerHTML = `${imgOrLetter}
      <span class="skip-person-item-name">${p.name}</span>
      <span class="skip-person-item-status">${pd.skipped ? 'Ya saltó' : ''}</span>`;

    item.onclick = () => {
      if (selectedSkipPeople.has(p.id)) {
        selectedSkipPeople.delete(p.id);
        item.classList.remove('selected');
      } else {
        selectedSkipPeople.add(p.id);
        item.classList.add('selected');
      }
    };
    list.appendChild(item);
  });

  document.getElementById('skip-backdrop').classList.add('open');
}

function closeSkipModal(e) {
  if (!e || e.target === document.getElementById('skip-backdrop')) {
    document.getElementById('skip-backdrop').classList.remove('open');
  }
}

function confirmSkip() {
  if (!selectedSkipPeople.size) { showToast('Selecciona al menos una persona'); return; }
  const yr = currentYear;
  const data = getMonthData(yr, skipMonth);
  selectedSkipPeople.forEach(id => {
    data[id].skipped = true;
    data[id].paid = false;
  });
  saveState();
  closeSkipModal();
  renderMonths();
  showToast(`↷ ${selectedSkipPeople.size} persona(s) saltaron el mes`, 'green');
}

// ═══ SETTINGS ═══
function renderSettings() {
  const list = document.getElementById('people-list');
  list.innerHTML = '';
  state.people.forEach(p => {
    const row = document.createElement('div');
    row.className = 'person-row';
    const imgOrLetter = p.photo
      ? `<img src="${p.photo}">`
      : `<span>${p.name.charAt(0).toUpperCase()}</span>`;

    row.innerHTML = `
      <div class="person-row-avatar" onclick="uploadPhoto(${p.id})" title="Cambiar foto">
        ${imgOrLetter}
        <div class="cam-overlay">📷</div>
      </div>
      <input class="person-row-name" type="text" value="${p.name}" data-id="${p.id}" placeholder="Nombre">
      <button class="remove-person-btn" onclick="removePerson(${p.id})">✕</button>`;
    list.appendChild(row);
  });

  document.getElementById('amount-input').value = state.amount;
  document.getElementById('add-person-btn') && null;
}

let uploadingPersonId = null;
function uploadPhoto(personId) {
  uploadingPersonId = personId;
  document.getElementById('photo-input').click();
}

document.getElementById('photo-input').addEventListener('change', function() {
  const file = this.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const p = state.people.find(x => x.id === uploadingPersonId);
    if (p) { p.photo = e.target.result; saveState(); renderSettings(); }
  };
  reader.readAsDataURL(file);
  this.value = '';
});

function addPerson() {
  if (state.people.length >= 5) { showToast('Máximo 5 personas'); return; }
  const newId = Date.now();
  state.people.push({ id: newId, name: `Persona ${state.people.length + 1}`, photo: null });
  saveState();
  renderSettings();
}

function removePerson(id) {
  if (state.people.length <= 1) { showToast('Debe haber al menos 1 persona'); return; }
  state.people = state.people.filter(p => p.id !== id);
  saveState();
  renderSettings();
}

function savePeople() {
  const inputs = document.querySelectorAll('.person-row-name');
  inputs.forEach(inp => {
    const id = parseInt(inp.dataset.id);
    const p = state.people.find(x => x.id === id);
    if (p) p.name = inp.value.trim() || p.name;
  });
  saveState();
  renderSettings();
  showToast('✓ Personas guardadas', 'green');
}

function saveAmount() {
  const val = parseFloat(document.getElementById('amount-input').value);
  if (!val || val <= 0) { showToast('Monto inválido'); return; }
  state.amount = val;
  saveState();
  showToast(`✓ Monto actualizado a ${formatAmount(val)}`, 'green');
}

// ═══ UTILS ═══
function formatAmount(n) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(n);
}

function showToast(msg, type) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast' + (type ? ' ' + type : '');
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2800);
}
