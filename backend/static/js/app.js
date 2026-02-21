/**
 * app.js — main application logic.
 * Handles routing between login / operator / engineer views,
 * tab switching, and all CRUD operations.
 */

let currentUser = null;

// ── Helpers ───────────────────────────────────────────────────────────

function $(sel, ctx = document) { return ctx.querySelector(sel); }
function $$(sel, ctx = document) { return [...ctx.querySelectorAll(sel)]; }

function toast(msg, isError = false) {
  const el = document.createElement('div');
  el.className = `toast ${isError ? 'error' : ''} show`;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, 3000);
}

function badge(status) {
  const labels = {
    new: 'Новая', in_progress: 'В работе', inspection_done: 'Обследование завершено',
    report_generated: 'Отчёт создан', closed: 'Закрыта',
    draft: 'Черновик', submitted: 'Отправлено',
  };
  return `<span class="badge badge-${status}">${labels[status] || status}</span>`;
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ── Init ──────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  if (!api.isLoggedIn()) return showLogin();
  try {
    currentUser = await api.me();
    showApp();
  } catch {
    api.logout();
  }
});

// ── Login ─────────────────────────────────────────────────────────────

function showLogin() {
  $('#app').innerHTML = `
    <div class="login-wrapper">
      <div class="login-box">
        <h2>Энергоаудит</h2>
        <div class="form-group" style="margin-bottom:0.75rem">
          <label>Логин</label>
          <input id="login-user" type="text" autocomplete="username">
        </div>
        <div class="form-group" style="margin-bottom:0.75rem">
          <label>Пароль</label>
          <input id="login-pass" type="password" autocomplete="current-password">
        </div>
        <button class="btn btn-primary" style="width:100%" id="login-btn">Войти</button>
      </div>
    </div>`;
  $('#login-btn').onclick = async () => {
    try {
      await api.login($('#login-user').value, $('#login-pass').value);
      currentUser = await api.me();
      showApp();
    } catch (e) { toast(e.message, true); }
  };
  // Enter key support
  $('#login-pass').addEventListener('keydown', e => { if (e.key === 'Enter') $('#login-btn').click(); });
}

// ── Main App Shell ────────────────────────────────────────────────────

function showApp() {
  const isEngineer = currentUser.role === 'engineer';
  const isOperator = currentUser.role === 'operator';
  const isAdmin = currentUser.role === 'admin';

  let tabs = '';
  if (isOperator || isAdmin) {
    tabs = `
      <button class="tab-btn active" data-tab="applications">Заявки</button>
      <button class="tab-btn" data-tab="clients">Клиенты</button>
      <button class="tab-btn" data-tab="new-app">Новая заявка</button>`;
  }
  if (isEngineer) {
    tabs = `
      <button class="tab-btn active" data-tab="available">Доступные заявки</button>
      <button class="tab-btn" data-tab="my-inspections">Мои обследования</button>`;
  }
  if (isAdmin) {
    tabs += `<button class="tab-btn" data-tab="users">Пользователи</button>`;
  }

  $('#app').innerHTML = `
    <header class="app-header">
      <h1>Энергоаудит</h1>
      <div class="user-info">
        <span>${currentUser.full_name} (${currentUser.role})</span>
        <button id="logout-btn">Выйти</button>
      </div>
    </header>
    <div class="container">
      <div class="tabs">${tabs}</div>
      <div id="tab-content"></div>
    </div>`;

  $('#logout-btn').onclick = () => api.logout();

  // Tab switching
  $$('.tab-btn').forEach(btn => {
    btn.onclick = () => {
      $$('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      loadTab(btn.dataset.tab);
    };
  });

  // Load first tab
  const firstTab = $('.tab-btn.active');
  if (firstTab) loadTab(firstTab.dataset.tab);
}

// ── Tab Router ────────────────────────────────────────────────────────

function loadTab(tab) {
  const c = $('#tab-content');
  switch (tab) {
    case 'applications': return loadApplications(c);
    case 'clients': return loadClients(c);
    case 'new-app': return loadNewApplication(c);
    case 'available': return loadAvailableApplications(c);
    case 'my-inspections': return loadMyInspections(c);
    case 'users': return loadUsers(c);
  }
}

// ── Operator: Applications List ───────────────────────────────────────

async function loadApplications(container) {
  container.innerHTML = '<p>Загрузка...</p>';
  try {
    const apps = await api.get('/applications');
    if (!apps.length) { container.innerHTML = '<p>Заявок пока нет.</p>'; return; }
    container.innerHTML = `
      <table class="data-table">
        <thead><tr>
          <th>ID</th><th>Статус</th><th>Тип услуги</th><th>Объект</th><th>Дата</th><th>Отчёт</th><th></th>
        </tr></thead>
        <tbody>${apps.map(a => `
          <tr>
            <td>${a.id}</td>
            <td>${badge(a.status)}</td>
            <td>${a.service_type}</td>
            <td>${a.audit_object_id}</td>
            <td>${fmtDate(a.created_at)}</td>
            <td>${a.report_generated ? 'Да' : 'Нет'}</td>
            <td>
              <button class="btn btn-sm btn-primary" onclick="viewApplication(${a.id})">Подробнее</button>
              <button class="btn btn-sm btn-success" onclick="downloadReport(${a.id})">Отчёт .docx</button>
            </td>
          </tr>`).join('')}
        </tbody>
      </table>`;
  } catch (e) { toast(e.message, true); }
}

// ── Operator: View Application Detail ─────────────────────────────────

async function viewApplication(appId) {
  try {
    const [app, inspections] = await Promise.all([
      api.get(`/applications/${appId}`),
      api.get(`/inspections/by-application/${appId}`),
    ]);
    const obj = app.audit_object;
    const c = $('#tab-content');
    c.innerHTML = `
      <div class="card">
        <h3>Заявка #${app.id} ${badge(app.status)}</h3>
        <p><strong>Тип услуги:</strong> ${app.service_type}</p>
        <p><strong>Оператор:</strong> ${app.operator?.full_name || '—'}</p>
        <p><strong>Создана:</strong> ${fmtDate(app.created_at)}</p>
        ${app.notes ? `<p><strong>Заметки:</strong> ${app.notes}</p>` : ''}
      </div>
      ${obj ? `<div class="card">
        <h3>Объект</h3>
        <p><strong>Адрес:</strong> ${obj.address}</p>
        <p><strong>Тип:</strong> ${obj.object_type}</p>
        ${obj.total_area ? `<p><strong>Площадь:</strong> ${obj.total_area} м²</p>` : ''}
        ${obj.floors ? `<p><strong>Этажей:</strong> ${obj.floors}</p>` : ''}
        ${obj.year_built ? `<p><strong>Год постройки:</strong> ${obj.year_built}</p>` : ''}
      </div>` : ''}
      <div class="card">
        <h3>Обследования (${inspections.length})</h3>
        ${inspections.length ? inspections.map(renderInspectionRow).join('') : '<p>Пока нет обследований.</p>'}
      </div>
      <div class="actions">
        <button class="btn btn-primary" onclick="loadTab('applications')">Назад к списку</button>
        <button class="btn btn-success" onclick="downloadReport(${app.id})">Скачать отчёт .docx</button>
      </div>`;
  } catch (e) { toast(e.message, true); }
}

function renderInspectionRow(insp) {
  const metrics = [
    ['Тепло', insp.heating_consumption, 'Гкал'],
    ['Электричество', insp.electricity_consumption, 'кВт·ч'],
    ['Вода', insp.water_consumption, 'м³'],
    ['Газ', insp.gas_consumption, 'м³'],
    ['Стены', insp.wall_thickness_mm, 'мм'],
    ['Окна', insp.window_type, ''],
    ['Утепление', insp.insulation_type, ''],
    ['Терм. сопр.', insp.thermal_resistance, 'м²·°C/Вт'],
    ['Воздухопр.', insp.air_tightness, ''],
    ['T внутри', insp.indoor_temperature, '°C'],
    ['T снаружи', insp.outdoor_temperature, '°C'],
  ].filter(m => m[1] != null);

  // Add extra_metrics from JSONB
  const extraMetrics = insp.extra_metrics ? Object.entries(insp.extra_metrics).map(([k, v]) => [k, v, '']) : [];

  const allMetrics = [...metrics, ...extraMetrics];

  return `
    <div style="border-left:3px solid var(--primary);padding-left:0.75rem;margin-bottom:0.75rem">
      <p><strong>Инженер:</strong> ${insp.engineer?.full_name || `ID ${insp.engineer_id}`}
         ${badge(insp.status)}
         ${insp.submitted_at ? ` — отправлено ${fmtDate(insp.submitted_at)}` : ''}</p>
      ${allMetrics.length ? `<table class="data-table" style="margin-top:0.5rem">
        <thead><tr><th>Метрика</th><th>Значение</th><th>Ед.</th></tr></thead>
        <tbody>${allMetrics.map(m => `<tr><td>${m[0]}</td><td>${m[1]}</td><td>${m[2]}</td></tr>`).join('')}</tbody>
      </table>` : '<p>Метрики не заполнены</p>'}
      ${insp.notes ? `<p style="margin-top:0.3rem"><em>${insp.notes}</em></p>` : ''}
    </div>`;
}

// ── Operator: Clients ─────────────────────────────────────────────────

async function loadClients(container) {
  container.innerHTML = '<p>Загрузка...</p>';
  try {
    const clients = await api.get('/clients');
    container.innerHTML = `
      <div class="card">
        <h3>Новый клиент</h3>
        <div class="form-grid">
          <div class="form-group"><label>Название / ФИО *</label><input id="cl-name"></div>
          <div class="form-group"><label>Контактное лицо</label><input id="cl-contact"></div>
          <div class="form-group"><label>Телефон</label><input id="cl-phone"></div>
          <div class="form-group"><label>Email</label><input id="cl-email"></div>
          <div class="form-group full"><label>Адрес</label><input id="cl-address"></div>
        </div>
        <div class="actions"><button class="btn btn-primary" id="cl-save">Сохранить клиента</button></div>
      </div>
      <table class="data-table">
        <thead><tr><th>ID</th><th>Название</th><th>Контакт</th><th>Телефон</th><th>Email</th></tr></thead>
        <tbody>${clients.map(c => `<tr><td>${c.id}</td><td>${c.name}</td><td>${c.contact_person||'—'}</td><td>${c.phone||'—'}</td><td>${c.email||'—'}</td></tr>`).join('')}</tbody>
      </table>`;
    $('#cl-save').onclick = async () => {
      try {
        await api.post('/clients', {
          name: $('#cl-name').value,
          contact_person: $('#cl-contact').value || null,
          phone: $('#cl-phone').value || null,
          email: $('#cl-email').value || null,
          address: $('#cl-address').value || null,
        });
        toast('Клиент создан');
        loadClients(container);
      } catch (e) { toast(e.message, true); }
    };
  } catch (e) { toast(e.message, true); }
}

// ── Operator: Create Application ──────────────────────────────────────

async function loadNewApplication(container) {
  let clients = [];
  try { clients = await api.get('/clients'); } catch {}

  container.innerHTML = `
    <div class="card">
      <h3>Шаг 1: Выберите клиента</h3>
      <div class="form-group">
        <label>Клиент *</label>
        <select id="na-client">
          <option value="">— выберите —</option>
          ${clients.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="card">
      <h3>Шаг 2: Объект обследования</h3>
      <div class="form-grid">
        <div class="form-group full"><label>Адрес *</label><input id="na-addr"></div>
        <div class="form-group">
          <label>Тип объекта *</label>
          <select id="na-type">
            <option value="residential">Жилой</option>
            <option value="commercial">Коммерческий</option>
            <option value="industrial">Промышленный</option>
            <option value="public_building">Общественное здание</option>
            <option value="other">Другое</option>
          </select>
        </div>
        <div class="form-group"><label>Площадь (м²)</label><input id="na-area" type="number"></div>
        <div class="form-group"><label>Этажей</label><input id="na-floors" type="number"></div>
        <div class="form-group"><label>Год постройки</label><input id="na-year" type="number"></div>
        <div class="form-group full"><label>Описание</label><textarea id="na-desc"></textarea></div>
      </div>
    </div>
    <div class="card">
      <h3>Шаг 3: Заявка</h3>
      <div class="form-grid">
        <div class="form-group">
          <label>Тип услуги</label>
          <select id="na-service">
            <option value="energy_audit">Энергоаудит</option>
          </select>
        </div>
        <div class="form-group full"><label>Примечания</label><textarea id="na-notes"></textarea></div>
      </div>
      <div class="actions"><button class="btn btn-primary" id="na-submit">Создать заявку</button></div>
    </div>`;

  $('#na-submit').onclick = async () => {
    try {
      const clientId = parseInt($('#na-client').value);
      if (!clientId) throw new Error('Выберите клиента');
      const addr = $('#na-addr').value;
      if (!addr) throw new Error('Укажите адрес объекта');

      // Create audit object
      const obj = await api.post('/objects', {
        client_id: clientId,
        address: addr,
        object_type: $('#na-type').value,
        total_area: parseFloat($('#na-area').value) || null,
        floors: parseInt($('#na-floors').value) || null,
        year_built: parseInt($('#na-year').value) || null,
        description: $('#na-desc').value || null,
      });

      // Create application
      await api.post('/applications', {
        audit_object_id: obj.id,
        service_type: $('#na-service').value,
        notes: $('#na-notes').value || null,
      });

      toast('Заявка создана');
      // Switch to applications tab
      $$('.tab-btn').forEach(b => b.classList.remove('active'));
      const appsTab = $$('.tab-btn').find(b => b.dataset.tab === 'applications');
      if (appsTab) { appsTab.classList.add('active'); loadTab('applications'); }
    } catch (e) { toast(e.message, true); }
  };
}

// ── Engineer: Available Applications ──────────────────────────────────

async function loadAvailableApplications(container) {
  container.innerHTML = '<p>Загрузка...</p>';
  try {
    const apps = await api.get('/applications');
    const available = apps.filter(a => a.status !== 'closed');
    if (!available.length) { container.innerHTML = '<p>Нет доступных заявок.</p>'; return; }
    container.innerHTML = `
      <table class="data-table">
        <thead><tr><th>ID</th><th>Статус</th><th>Тип</th><th>Объект</th><th>Дата</th><th></th></tr></thead>
        <tbody>${available.map(a => `
          <tr>
            <td>${a.id}</td>
            <td>${badge(a.status)}</td>
            <td>${a.service_type}</td>
            <td>${a.audit_object_id}</td>
            <td>${fmtDate(a.created_at)}</td>
            <td><button class="btn btn-sm btn-primary" onclick="openInspection(${a.id})">Работать</button></td>
          </tr>`).join('')}
        </tbody>
      </table>`;
  } catch (e) { toast(e.message, true); }
}

// ── Engineer: Open Inspection Form ────────────────────────────────────

async function openInspection(appId) {
  const c = $('#tab-content');
  c.innerHTML = '<p>Загрузка...</p>';

  try {
    const [appDetail, myInspections] = await Promise.all([
      api.get(`/applications/${appId}`),
      api.get('/inspections/my'),
    ]);

    const existing = myInspections.find(i => i.application_id === appId);
    const obj = appDetail.audit_object;

    c.innerHTML = `
      <div class="card">
        <h3>Заявка #${appId} ${badge(appDetail.status)}</h3>
        ${obj ? `<p><strong>Объект:</strong> ${obj.address} (${obj.object_type})</p>` : ''}
      </div>
      <div class="card">
        <h3>${existing ? 'Редактировать обследование' : 'Новое обследование'}</h3>
        ${existing?.status === 'submitted' ? '<p><strong>Данные отправлены и заблокированы.</strong></p>' : `
        <div class="form-grid">
          <div class="form-group"><label>Тепло (Гкал)</label><input id="m-heat" type="number" step="0.01" value="${existing?.heating_consumption ?? ''}"></div>
          <div class="form-group"><label>Электричество (кВт·ч)</label><input id="m-elec" type="number" step="0.01" value="${existing?.electricity_consumption ?? ''}"></div>
          <div class="form-group"><label>Вода (м³)</label><input id="m-water" type="number" step="0.01" value="${existing?.water_consumption ?? ''}"></div>
          <div class="form-group"><label>Газ (м³)</label><input id="m-gas" type="number" step="0.01" value="${existing?.gas_consumption ?? ''}"></div>
          <div class="form-group"><label>Толщина стен (мм)</label><input id="m-wall" type="number" step="0.01" value="${existing?.wall_thickness_mm ?? ''}"></div>
          <div class="form-group">
            <label>Тип окон</label>
            <input id="m-window" value="${existing?.window_type ?? ''}">
          </div>
          <div class="form-group">
            <label>Тип утепления</label>
            <input id="m-insulation" value="${existing?.insulation_type ?? ''}">
          </div>
          <div class="form-group"><label>Терм. сопротивление</label><input id="m-thermal" type="number" step="0.0001" value="${existing?.thermal_resistance ?? ''}"></div>
          <div class="form-group"><label>Воздухопроницаемость</label><input id="m-air" type="number" step="0.0001" value="${existing?.air_tightness ?? ''}"></div>
          <div class="form-group"><label>T внутри (°C)</label><input id="m-tin" type="number" step="0.1" value="${existing?.indoor_temperature ?? ''}"></div>
          <div class="form-group"><label>T снаружи (°C)</label><input id="m-tout" type="number" step="0.1" value="${existing?.outdoor_temperature ?? ''}"></div>
          <div class="form-group full"><label>Примечания</label><textarea id="m-notes">${existing?.notes ?? ''}</textarea></div>
        </div>
        <div class="card" style="margin-top:1rem">
          <h4>Дополнительные метрики</h4>
          <div id="extra-metrics-list"></div>
          <button class="btn btn-sm" id="add-extra-metric" type="button">+ Добавить поле</button>
        </div>
        <div class="actions" style="margin-top:1rem">
          <button class="btn btn-primary" id="m-save">Сохранить черновик</button>
          <button class="btn btn-success" id="m-submit">Отправить (заблокировать)</button>
          ${existing ? `<button class="btn btn-danger" id="m-delete">Удалить</button>` : ''}
          <button class="btn" onclick="loadTab('available')">Назад</button>
        </div>`}
      </div>`;

    if (existing?.status === 'submitted') return;

    // ── Extra metrics dynamic fields ──
    const extraList = $('#extra-metrics-list');
    let extraCounter = 0;

    function addExtraMetricRow(name = '', value = '') {
      const id = extraCounter++;
      const row = document.createElement('div');
      row.className = 'form-grid';
      row.style.marginBottom = '0.5rem';
      row.dataset.extraId = id;
      row.innerHTML = `
        <div class="form-group"><label>Название</label><input class="extra-name" value="${name}"></div>
        <div class="form-group"><label>Значение</label><input class="extra-value" type="number" step="any" value="${value}"></div>
        <div class="form-group" style="align-self:end"><button class="btn btn-sm btn-danger extra-remove" type="button">✕</button></div>`;
      row.querySelector('.extra-remove').onclick = () => row.remove();
      extraList.appendChild(row);
    }

    // Pre-fill existing extra_metrics
    if (existing?.extra_metrics) {
      for (const [k, v] of Object.entries(existing.extra_metrics)) {
        addExtraMetricRow(k, v);
      }
    }

    $('#add-extra-metric').onclick = () => addExtraMetricRow();

    function collectExtraMetrics() {
      const result = {};
      $$('#extra-metrics-list .form-grid').forEach(row => {
        const name = row.querySelector('.extra-name').value.trim();
        const val = row.querySelector('.extra-value').value;
        if (name && val !== '') result[name] = parseFloat(val);
      });
      return Object.keys(result).length ? result : null;
    }

    function collectMetrics() {
      const num = (id) => { const v = $(id).value; return v !== '' ? parseFloat(v) : null; };
      const str = (id) => $(id).value || null;
      return {
        heating_consumption: num('#m-heat'),
        electricity_consumption: num('#m-elec'),
        water_consumption: num('#m-water'),
        gas_consumption: num('#m-gas'),
        wall_thickness_mm: num('#m-wall'),
        window_type: str('#m-window'),
        insulation_type: str('#m-insulation'),
        thermal_resistance: num('#m-thermal'),
        air_tightness: num('#m-air'),
        indoor_temperature: num('#m-tin'),
        outdoor_temperature: num('#m-tout'),
        notes: str('#m-notes'),
        extra_metrics: collectExtraMetrics(),
      };
    }

    // Save draft
    $('#m-save').onclick = async () => {
      try {
        const metrics = collectMetrics();
        if (existing) {
          await api.put(`/inspections/${existing.id}`, metrics);
        } else {
          await api.post('/inspections', { application_id: appId, ...metrics });
        }
        toast('Сохранено');
        openInspection(appId); // refresh
      } catch (e) { toast(e.message, true); }
    };

    // Submit (lock)
    $('#m-submit').onclick = async () => {
      if (!confirm('После отправки данные будут заблокированы. Продолжить?')) return;
      try {
        const metrics = collectMetrics();
        let insp = existing;
        if (existing) {
          await api.put(`/inspections/${existing.id}`, metrics);
        } else {
          insp = await api.post('/inspections', { application_id: appId, ...metrics });
        }
        await api.post(`/inspections/${insp?.id || existing?.id}/submit`);
        toast('Обследование отправлено');
        openInspection(appId);
      } catch (e) { toast(e.message, true); }
    };

    // Delete
    if (existing && $('#m-delete')) {
      $('#m-delete').onclick = async () => {
        if (!confirm('Удалить обследование?')) return;
        try {
          await api.delete(`/inspections/${existing.id}`);
          toast('Удалено');
          loadTab('available');
        } catch (e) { toast(e.message, true); }
      };
    }
  } catch (e) { toast(e.message, true); }
}

// ── Engineer: My Inspections ──────────────────────────────────────────

async function loadMyInspections(container) {
  container.innerHTML = '<p>Загрузка...</p>';
  try {
    const inspections = await api.get('/inspections/my');
    if (!inspections.length) { container.innerHTML = '<p>У вас пока нет обследований.</p>'; return; }
    container.innerHTML = `
      <table class="data-table">
        <thead><tr><th>ID</th><th>Заявка</th><th>Статус</th><th>Обновлено</th><th></th></tr></thead>
        <tbody>${inspections.map(i => `
          <tr>
            <td>${i.id}</td>
            <td>${i.application_id}</td>
            <td>${badge(i.status)}</td>
            <td>${fmtDate(i.updated_at)}</td>
            <td>
              <button class="btn btn-sm btn-primary" onclick="openInspection(${i.application_id})">Открыть</button>
              <button class="btn btn-sm btn-success" onclick="downloadReport(${i.application_id})">Отчёт</button>
            </td>
          </tr>`).join('')}
        </tbody>
      </table>`;
  } catch (e) { toast(e.message, true); }
}

// ── Admin: Users ──────────────────────────────────────────────────────

async function loadUsers(container) {
  container.innerHTML = '<p>Загрузка...</p>';
  try {
    const users = await api.get('/auth/users');
    container.innerHTML = `
      <div class="card">
        <h3>Новый пользователь</h3>
        <div class="form-grid">
          <div class="form-group"><label>Логин</label><input id="u-login"></div>
          <div class="form-group"><label>Пароль</label><input id="u-pass" type="password"></div>
          <div class="form-group"><label>ФИО</label><input id="u-name"></div>
          <div class="form-group">
            <label>Роль</label>
            <select id="u-role">
              <option value="operator">Оператор</option>
              <option value="engineer">Инженер</option>
              <option value="admin">Админ</option>
            </select>
          </div>
        </div>
        <div class="actions"><button class="btn btn-primary" id="u-save">Создать</button></div>
      </div>
      <table class="data-table">
        <thead><tr><th>ID</th><th>Логин</th><th>ФИО</th><th>Роль</th><th>Активен</th></tr></thead>
        <tbody>${users.map(u => `<tr><td>${u.id}</td><td>${u.username}</td><td>${u.full_name}</td><td>${u.role}</td><td>${u.is_active ? 'Да' : 'Нет'}</td></tr>`).join('')}</tbody>
      </table>`;
    $('#u-save').onclick = async () => {
      try {
        await api.post('/auth/users', {
          username: $('#u-login').value,
          password: $('#u-pass').value,
          full_name: $('#u-name').value,
          role: $('#u-role').value,
        });
        toast('Пользователь создан');
        loadUsers(container);
      } catch (e) { toast(e.message, true); }
    };
  } catch (e) { toast(e.message, true); }
}

// ── Report Download (global) ──────────────────────────────────────────

async function downloadReport(appId) {
  try {
    await api.downloadReport(appId);
    toast('Отчёт скачан');
  } catch (e) { toast(e.message, true); }
}
