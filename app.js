// ═══════════════════════════════════════
//  PAGOS — Script principal
// ═══════════════════════════════════════

// ═══ SUPABASE ═══
const { createClient } = supabase;
const _supabase = createClient(
  'https://adufcsfobkvgfisyiqxc.supabase.co',
  'sb_publishable_QHjbkF5McVLksTLJZYESjQ_nmqVrvgJ'
);

// ═══ CONSTANTES ═══
const PIN          = '1597';
const TODAY        = new Date();
const CURRENT_MONTH = TODAY.getMonth();   // 0-indexed
const CURRENT_YEAR  = TODAY.getFullYear();
const MONTHS = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'
];

// ═══ STATE ═══
let pinValue    = '';
let currentYear = CURRENT_YEAR;

let state = {
  people:   [],     // filas de `perfiles`
  amount:   5000,   // monto_sugerido del primer perfil (o default)
  payments: {}      // cache: "YYYY-MM" -> { perfiles_id: { paid, amount, db_id } }
};

// ─────────────────────────────────────────
//  SUPABASE — Lectura
// ─────────────────────────────────────────

async function loadFromSupabase() {
  // 1. Perfiles
  const { data: perfiles, error: e1 } = await _supabase
    .from('perfiles')
    .select('*')
    .order('perfiles_id');

  if (e1) {
    console.error('Error cargando perfiles:', e1);
  } else {
    state.people = perfiles.map(p => ({
      id:              p.perfiles_id,
      name:            p.nombre,
      photo:           p.foto_url || null,
      monto_sugerido:  p.monto_sugerido || 5000
    }));
    if (state.people.length > 0) {
      state.amount = state.people[0].monto_sugerido || 5000;
    }
  }

  // 2. Pagos del año actual
  await loadPagosForYear(currentYear);
}

async function loadPagosForYear(year) {
  const { data: pagos, error } = await _supabase
    .from('pagos')
    .select('*')
    .eq('año', year);

  if (error) { console.error('Error cargando pagos:', error); return; }

  pagos.forEach(row => {
    const mesIdx = MONTHS.indexOf(row.mes);
    if (mesIdx === -1) return;
    const k = monthKey(year, mesIdx);
    if (!state.payments[k]) state.payments[k] = {};
    state.payments[k][row.perfiles_id] = {
      paid:   row.estado_pago,
      amount: row.monto_pagado || 0,
      db_id:  row.id
    };
  });
}

// ─────────────────────────────────────────
//  SUPABASE — Escritura
// ─────────────────────────────────────────

async function upsertPago(perfilesId, mesIdx, year, paid, amount) {
  const mesStr   = MONTHS[mesIdx];
  const k        = monthKey(year, mesIdx);
  const existing = state.payments[k]?.[perfilesId];

  if (existing?.db_id) {
    const { error } = await _supabase
      .from('pagos')
      .update({ estado_pago: paid, monto_pagado: amount })
      .eq('id', existing.db_id);
    if (error) { showToast('Error guardando en BD'); console.error(error); }
  } else {
    const { data, error } = await _supabase
      .from('pagos')
      .insert({ perfiles_id: perfilesId, mes: mesStr, año: year, estado_pago: paid, monto_pagado: amount })
      .select()
      .single();
    if (error) { showToast('Error guardando en BD'); console.error(error); }
    else {
      if (!state.payments[k])              state.payments[k]              = {};
      if (!state.payments[k][perfilesId])  state.payments[k][perfilesId]  = {};
      state.payments[k][perfilesId].db_id = data.id;
    }
  }
}

async function upsertPerfil(person) {
  const { error } = await _supabase
    .from('perfiles')
    .update({ nombre: person.name, foto_url: person.photo, monto_sugerido: state.amount })
    .eq('perfiles_id', person.id);
  if (error) { showToast('Error guardando perfil'); console.error(error); }
}

async function insertPerfil(name) {
  const { data, error } = await _supabase
    .from('perfiles')
    .insert({ nombre: name, foto_url: null, monto_sugerido: state.amount })
    .select()
    .single();
  if (error) { showToast('Error creando perfil'); console.error(error); return null; }
  return data;
}

async function deletePerfil(id) {
  const { error } = await _supabase
    .from('perfiles')
    .delete()
    .eq('perfiles_id', id);
  if (error) { showToast('Error eliminando perfil'); console.error(error); }
}

// Respaldo local
function saveState() {
  localStorage.setItem('pagos_backup', JSON.stringify(state));
}

// ─────────────────────────────────────────
//  HELPERS — Datos de pago
// ─────────────────────────────────────────

function monthKey(year, month) {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function getMonthData(year, month) {
  const k = monthKey(year, month);
  if (!state.payments[k]) state.payments[k] = {};
  state.people.forEach(p => {
    if (!state.payments[k][p.id]) {
      state.payments[k][p.id] = { paid: false, amount: 0 };
    }
  });
  return state.payments[k];
}

function getDebt(personId, year, month) {
  // Si no pagó el mes anterior, debe ese monto
  let prevMonth = month - 1;
  let prevYear  = year;
  if (prevMonth < 0) { prevMonth = 11; prevYear--; }

  // Solo aplica si el mes anterior ya pasó
  const prevDate = new Date(prevYear, prevMonth, 1);
  const today    = new Date(CURRENT_YEAR, CURRENT_MONTH, 1);
  if (prevDate >= today) return 0;

  const k = monthKey(prevYear, prevMonth);
  // Sin registro = no pagó
  if (!state.payments[k] || !state.payments[k][personId]) return state.amount;
  return state.payments[k][personId].paid ? 0 : state.amount;
}

function getMonthStatus(year, month) {
  const data   = getMonthData(year, month);
  const people = state.people;
  if (!people.length) return 'empty';
  const paid = people.filter(p => data[p.id]?.paid).length;
  if (paid === people.length) return 'green';
  if (paid === 0)             return 'red';
  return 'yellow';
}

function isMonthlySolved(year, month) {
  const data = getMonthData(year, month);
  return state.people.every(p => data[p.id]?.paid);
}

// ─────────────────────────────────────────
//  LOGIN
// ─────────────────────────────────────────

function pinPress(n) {
  if (pinValue.length >= 4) return;
  pinValue += n;
  updateDots();
  if (pinValue.length === 4) {
    setTimeout(() => {
      if (pinValue === PIN) {
        document.getElementById('login-screen').style.display = 'none';
        document.getElementById('app').style.display = 'block';
        showToast('⏳ Cargando datos...', '');
        loadFromSupabase().then(() => renderApp());
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
  document.querySelectorAll('.pin-dot')
    .forEach((d, i) => d.classList.toggle('filled', i < pinValue.length));
}

// ─────────────────────────────────────────
//  NAVEGACIÓN
// ─────────────────────────────────────────

function showPanel(name) {
  document.getElementById('home-panel').style.display     = name === 'home'     ? 'block' : 'none';
  document.getElementById('settings-panel').style.display = name === 'settings' ? 'block' : 'none';
  document.getElementById('nav-home').classList.toggle('active',     name === 'home');
  document.getElementById('nav-settings').classList.toggle('active', name === 'settings');
  if (name === 'settings') renderSettings();
  if (name === 'home')     renderMonths();
}

// ─────────────────────────────────────────
//  AÑO
// ─────────────────────────────────────────

async function changeYear(d) {
  currentYear += d;
  document.getElementById('year-display').textContent = currentYear;
  await loadPagosForYear(currentYear);
  renderMonths();
}

// ─────────────────────────────────────────
//  RENDER APP
// ─────────────────────────────────────────

function renderApp() {
  document.getElementById('year-display').textContent = currentYear;
  renderMonths();
}

function renderMonths() {
  const grid = document.getElementById('months-grid');
  grid.innerHTML = '';
  let solvedCount = 0;

  for (let m = 0; m < 12; m++) {
    const isPast    = (currentYear < CURRENT_YEAR) || (currentYear === CURRENT_YEAR && m < CURRENT_MONTH);
    const isCurrent =  currentYear === CURRENT_YEAR && m === CURRENT_MONTH;
    const isFuture  = (currentYear > CURRENT_YEAR) || (currentYear === CURRENT_YEAR && m > CURRENT_MONTH);

    const data   = getMonthData(currentYear, m);
    const status = (isPast || isCurrent) ? getMonthStatus(currentYear, m) : null;

    if (isMonthlySolved(currentYear, m) && (isPast || isCurrent)) solvedCount++;

    const card = document.createElement('div');
    card.className = 'month-card';

    if (isFuture) {
      card.classList.add('future');
    } else if (isPast) {
      card.classList.add('past');
      if (status === 'yellow') card.classList.add('status-yellow');
      if (status === 'red')    card.classList.add('status-red');
    } else {
      card.classList.add('current');
      if (status === 'yellow') card.classList.add('status-yellow');
      if (status === 'red')    card.classList.add('status-red');
      if (status === 'green')  card.classList.add('status-green');
    }

    const icon      = status === 'green' ? '✓' : (status === 'yellow' || status === 'red') ? '●' : '';
    const iconColor = status === 'green' ? 'var(--green)' : status === 'yellow' ? 'var(--yellow)' : 'var(--red)';

    // Avatares
    let peopleHTML = '';
    if (!isFuture) {
      state.people.forEach(p => {
        const pd = data[p.id] || {};
        let cls     = '';
        let overlay = '';
        let debtBadge = '';

        if (pd.paid) { cls = 'paid'; overlay = '<div class="paid-check">✓</div>'; }

        const debt = getDebt(p.id, currentYear, m);
        if (debt > 0 && isCurrent) {
          debtBadge = '<div class="debt-badge">$</div>';
          cls = 'debt';
        }

        const imgOrLetter = p.photo
          ? `<img src="${p.photo}" alt="${p.name}">`
          : `<span>${p.name.charAt(0).toUpperCase()}</span>`;

        peopleHTML += `
          <div class="person-avatar ${cls}"
               onclick="openPersonModal(${p.id}, ${m})"
               title="${p.name}">
            ${imgOrLetter}${overlay}${debtBadge}
          </div>`;
      });
    }

    const paidCount = state.people.filter(p => data[p.id]?.paid).length;
    const total     = state.people.length;

    card.innerHTML = `
      <div class="month-label">${MONTHS[m]}</div>
      ${icon ? `<div class="month-status-icon" style="color:${iconColor}">${icon}</div>` : ''}
      <div class="month-people">${peopleHTML}</div>
      ${!isFuture ? `<div class="month-summary">${paidCount}/${total} pagaron</div>` : ''}
    `;

    grid.appendChild(card);
  }

  // Barra de progreso
  const pct = Math.round((solvedCount / 12) * 100);
  document.getElementById('progress-bar').style.width = pct + '%';
  document.getElementById('progress-count').innerHTML = `${solvedCount} <span>/ 12</span>`;
}

// ─────────────────────────────────────────
//  MODAL — Acción de persona
// ─────────────────────────────────────────

let modalPersonId = null;
let modalMonth    = null;

function openPersonModal(personId, month) {
  const yr        = currentYear;
  const m         = month;
  const isPast    = (yr < CURRENT_YEAR) || (yr === CURRENT_YEAR && m < CURRENT_MONTH);
  const isCurrent =  yr === CURRENT_YEAR && m === CURRENT_MONTH;
  if (!isPast && !isCurrent) return;

  const person = state.people.find(p => p.id === personId);
  if (!person) return;

  const data = getMonthData(yr, m);
  const pd   = data[personId] || {};

  modalPersonId = personId;
  modalMonth    = month;

  // Avatar en modal
  const av = document.getElementById('modal-avatar');
  av.innerHTML = person.photo
    ? `<img src="${person.photo}">`
    : person.name.charAt(0).toUpperCase();

  document.getElementById('modal-name').textContent        = person.name;
  document.getElementById('modal-month-label').textContent = `${MONTHS[m]} ${yr}`;

  // Alerta de deuda
  const debt      = getDebt(personId, yr, m);
  const debtAlert = document.getElementById('debt-alert');
  if (debt > 0) {
    debtAlert.className   = 'debt-alert show';
    debtAlert.textContent = `⚠ Tiene deuda de ${formatAmount(debt)} del mes anterior`;
  } else {
    debtAlert.className = 'debt-alert';
  }

  document.getElementById('custom-amount').value = '';
  document.getElementById('action-modal').querySelector('.action-btn.green').textContent =
    pd.paid
      ? '✓ Ya marcado como pagado (desmarcar)'
      : `✓ Ya pagó (${formatAmount(state.amount)})`;

  document.getElementById('modal-backdrop').classList.add('open');
}

function closeModal(e) {
  if (!e || e.target === document.getElementById('modal-backdrop')) {
    document.getElementById('modal-backdrop').classList.remove('open');
  }
}

async function markPaid() {
  const yr  = currentYear;
  const m   = modalMonth;
  const data = getMonthData(yr, m);
  const pd   = data[modalPersonId];

  const newPaid   = !pd.paid;
  const newAmount = newPaid ? state.amount + getDebt(modalPersonId, yr, m) : 0;

  pd.paid   = newPaid;
  pd.amount = newAmount;

  await upsertPago(modalPersonId, m, yr, newPaid, newAmount);
  saveState();
  closeModal();
  renderMonths();
  showToast(newPaid ? '✓ Pago registrado' : 'Pago removido', newPaid ? 'green' : '');
}

async function markPaidCustom() {
  const val = parseFloat(document.getElementById('custom-amount').value);
  if (!val || val <= 0) { showToast('Ingresa un monto válido'); return; }

  const yr  = currentYear;
  const m   = modalMonth;
  const data = getMonthData(yr, m);

  data[modalPersonId].paid   = true;
  data[modalPersonId].amount = val;

  await upsertPago(modalPersonId, m, yr, true, val);
  saveState();
  closeModal();
  renderMonths();
  showToast(`✓ Pago de ${formatAmount(val)} registrado`, 'green');
}

// ─────────────────────────────────────────
//  CONFIGURACIÓN
// ─────────────────────────────────────────

function renderSettings() {
  const list = document.getElementById('people-list');
  list.innerHTML = '';

  state.people.forEach(p => {
    const row = document.createElement('div');
    row.className = 'person-row';

    const imgOrLetter = p.photo
      ? `<img src="${p.photo}" onerror="this.style.display='none'">`
      : `<span>${p.name.charAt(0).toUpperCase()}</span>`;

    row.innerHTML = `
      <div class="person-row-avatar" title="Vista previa">
        ${imgOrLetter}
      </div>
      <div style="flex:1;display:flex;flex-direction:column;gap:5px">
        <input class="person-row-name" type="text"
               value="${p.name}" data-id="${p.id}" placeholder="Nombre">
        <input class="person-row-photo" type="url"
               value="${p.photo || ''}" data-id="${p.id}"
               placeholder="URL foto (Instagram, etc)"
               style="font-size:11px;padding:5px 8px;background:var(--surface3);
                      border:1px solid var(--border);border-radius:6px;
                      color:var(--text-sub);outline:none;font-family:inherit">
      </div>
      <button class="remove-person-btn" onclick="removePerson(${p.id})">✕</button>`;

    list.appendChild(row);
  });

  document.getElementById('amount-input').value = state.amount;
}

async function addPerson() {
  if (state.people.length >= 5) { showToast('Máximo 5 personas'); return; }
  const nombre = `Persona ${state.people.length + 1}`;
  const data   = await insertPerfil(nombre);
  if (!data) return;
  state.people.push({ id: data.perfiles_id, name: data.nombre, photo: null, monto_sugerido: state.amount });
  saveState();
  renderSettings();
}

async function removePerson(id) {
  if (state.people.length <= 1) { showToast('Debe haber al menos 1 persona'); return; }
  await deletePerfil(id);
  state.people = state.people.filter(p => p.id !== id);
  saveState();
  renderSettings();
}

async function savePeople() {
  const nameInputs  = document.querySelectorAll('.person-row-name');
  const photoInputs = document.querySelectorAll('.person-row-photo');

  for (let i = 0; i < nameInputs.length; i++) {
    const id = parseInt(nameInputs[i].dataset.id);
    const p  = state.people.find(x => x.id === id);
    if (p) {
      p.name  = nameInputs[i].value.trim()  || p.name;
      p.photo = photoInputs[i].value.trim() || null;
      await upsertPerfil(p);
    }
  }
  saveState();
  renderSettings();
  showToast('✓ Personas guardadas', 'green');
}

async function saveAmount() {
  const val = parseFloat(document.getElementById('amount-input').value);
  if (!val || val <= 0) { showToast('Monto inválido'); return; }
  state.amount = val;
  for (const p of state.people) {
    await _supabase
      .from('perfiles')
      .update({ monto_sugerido: val })
      .eq('perfiles_id', p.id);
  }
  saveState();
  showToast(`✓ Monto actualizado a ${formatAmount(val)}`, 'green');
}

// ─────────────────────────────────────────
//  UTILS
// ─────────────────────────────────────────

function formatAmount(n) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: 'COP', minimumFractionDigits: 0
  }).format(n);
}

function showToast(msg, type) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className   = 'toast' + (type ? ' ' + type : '');
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2800);
}
