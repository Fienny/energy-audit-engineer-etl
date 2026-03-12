/**
 * app.js — main application logic.
 * Engineer-focused energy audit system.
 * Handles login, inspection workflow with building type/subtype selection.
 */

let currentUser = null;
let buildingTypesCache = null;

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
    new: 'New', in_progress: 'In Progress', inspection_done: 'Inspection Done',
    report_generated: 'Report Generated', closed: 'Closed',
    draft: 'Draft', submitted: 'Submitted',
  };
  return `<span class="badge badge-${status}">${labels[status] || status}</span>`;
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** Fetch and cache building types from API */
async function getBuildingTypes() {
  if (buildingTypesCache) return buildingTypesCache;
  buildingTypesCache = await api.get('/building-types');
  return buildingTypesCache;
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
        <h2>Energy Audit</h2>
        <p class="login-subtitle">Engineer Portal</p>
        <div class="form-group" style="margin-bottom:0.75rem">
          <label>Login</label>
          <input id="login-user" type="text" autocomplete="username">
        </div>
        <div class="form-group" style="margin-bottom:0.75rem">
          <label>Password</label>
          <input id="login-pass" type="password" autocomplete="current-password">
        </div>
        <button class="btn btn-primary" style="width:100%" id="login-btn">Sign In</button>
      </div>
    </div>`;
  $('#login-btn').onclick = async () => {
    try {
      await api.login($('#login-user').value, $('#login-pass').value);
      currentUser = await api.me();
      showApp();
    } catch (e) { toast(e.message, true); }
  };
  $('#login-pass').addEventListener('keydown', e => { if (e.key === 'Enter') $('#login-btn').click(); });
}

// ── Main App Shell ────────────────────────────────────────────────────

function showApp() {
  const isEngineer = currentUser.role === 'engineer';
  const isAdmin = currentUser.role === 'admin';

  let tabs = '';
  if (isEngineer) {
    tabs = `
      <button class="tab-btn active" data-tab="available">Available Applications</button>
      <button class="tab-btn" data-tab="my-inspections">My Inspections</button>`;
  }
  if (isAdmin) {
    tabs = `
      <button class="tab-btn active" data-tab="applications">Applications</button>
      <button class="tab-btn" data-tab="users">Users</button>`;
  }

  const roleLabel = { engineer: 'Engineer', admin: 'Admin', operator: 'Operator' };

  $('#app').innerHTML = `
    <header class="app-header">
      <h1>Energy Audit System</h1>
      <div class="user-info">
        <span>${currentUser.full_name} (${roleLabel[currentUser.role] || currentUser.role})</span>
        <button id="logout-btn">Sign Out</button>
      </div>
    </header>
    <div class="container">
      <div class="tabs">${tabs}</div>
      <div id="tab-content"></div>
    </div>`;

  $('#logout-btn').onclick = () => api.logout();

  $$('.tab-btn').forEach(btn => {
    btn.onclick = () => {
      $$('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      loadTab(btn.dataset.tab);
    };
  });

  const firstTab = $('.tab-btn.active');
  if (firstTab) loadTab(firstTab.dataset.tab);
}

// ── Tab Router ────────────────────────────────────────────────────────

function loadTab(tab) {
  const c = $('#tab-content');
  switch (tab) {
    case 'applications': return loadApplications(c);
    case 'available': return loadAvailableApplications(c);
    case 'my-inspections': return loadMyInspections(c);
    case 'users': return loadUsers(c);
  }
}

// ── Admin: Applications List ──────────────────────────────────────────

async function loadApplications(container) {
  container.innerHTML = '<p>Loading...</p>';
  try {
    const apps = await api.get('/applications');
    if (!apps.length) { container.innerHTML = '<p>No applications yet.</p>'; return; }
    container.innerHTML = `
      <table class="data-table">
        <thead><tr>
          <th>ID</th><th>Status</th><th>Service</th><th>Object</th><th>Date</th><th>Report</th><th></th>
        </tr></thead>
        <tbody>${apps.map(a => `
          <tr>
            <td>${a.id}</td>
            <td>${badge(a.status)}</td>
            <td>${a.service_type}</td>
            <td>${a.audit_object_id}</td>
            <td>${fmtDate(a.created_at)}</td>
            <td>${a.report_generated ? 'Yes' : 'No'}</td>
            <td>
              <button class="btn btn-sm btn-primary" onclick="viewApplication(${a.id})">Details</button>
              <button class="btn btn-sm btn-success" onclick="downloadReport(${a.id})">Report .docx</button>
            </td>
          </tr>`).join('')}
        </tbody>
      </table>`;
  } catch (e) { toast(e.message, true); }
}

// ── Admin: View Application Detail ────────────────────────────────────

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
        <h3>Application #${app.id} ${badge(app.status)}</h3>
        <p><strong>Service:</strong> ${app.service_type}</p>
        <p><strong>Created:</strong> ${fmtDate(app.created_at)}</p>
        ${app.notes ? `<p><strong>Notes:</strong> ${app.notes}</p>` : ''}
      </div>
      ${obj ? `<div class="card">
        <h3>Object</h3>
        <p><strong>Address:</strong> ${obj.address}</p>
        <p><strong>Type:</strong> ${obj.object_type}</p>
        ${obj.total_area ? `<p><strong>Area:</strong> ${obj.total_area} m&sup2;</p>` : ''}
        ${obj.floors ? `<p><strong>Floors:</strong> ${obj.floors}</p>` : ''}
        ${obj.year_built ? `<p><strong>Year built:</strong> ${obj.year_built}</p>` : ''}
      </div>` : ''}
      <div class="card">
        <h3>Inspections (${inspections.length})</h3>
        ${inspections.length ? inspections.map(renderInspectionRow).join('') : '<p>No inspections yet.</p>'}
      </div>
      <div class="actions">
        <button class="btn btn-primary" onclick="loadTab('applications')">Back to list</button>
        <button class="btn btn-success" onclick="downloadReport(${app.id})">Download report .docx</button>
      </div>`;
  } catch (e) { toast(e.message, true); }
}

function renderInspectionRow(insp) {
  const metrics = [
    ['Heating', insp.heating_consumption, 'Gcal'],
    ['Electricity', insp.electricity_consumption, 'kWh'],
    ['Water', insp.water_consumption, 'm\u00B3'],
    ['Gas', insp.gas_consumption, 'm\u00B3'],
    ['Wall thickness', insp.wall_thickness_mm, 'mm'],
    ['Windows', insp.window_type, ''],
    ['Insulation', insp.insulation_type, ''],
    ['Thermal resistance', insp.thermal_resistance, 'm\u00B2\u00B7\u00B0C/W'],
    ['Air tightness', insp.air_tightness, ''],
    ['T indoor', insp.indoor_temperature, '\u00B0C'],
    ['T outdoor', insp.outdoor_temperature, '\u00B0C'],
  ].filter(m => m[1] != null);

  const extraMetrics = insp.extra_metrics ? Object.entries(insp.extra_metrics).map(([k, v]) => [k, v, '']) : [];
  const allMetrics = [...metrics, ...extraMetrics];

  return `
    <div style="border-left:3px solid var(--primary);padding-left:0.75rem;margin-bottom:0.75rem">
      <p><strong>Engineer:</strong> ${insp.engineer?.full_name || `ID ${insp.engineer_id}`}
         ${badge(insp.status)}
         ${insp.submitted_at ? ` \u2014 submitted ${fmtDate(insp.submitted_at)}` : ''}</p>
      ${insp.building_type ? `<p><strong>Building:</strong> ${insp.building_type} \u2014 ${insp.building_subtype || '—'}</p>` : ''}
      ${allMetrics.length ? `<table class="data-table" style="margin-top:0.5rem">
        <thead><tr><th>Metric</th><th>Value</th><th>Unit</th></tr></thead>
        <tbody>${allMetrics.map(m => `<tr><td>${m[0]}</td><td>${m[1]}</td><td>${m[2]}</td></tr>`).join('')}</tbody>
      </table>` : '<p>No metrics filled</p>'}
      ${insp.notes ? `<p style="margin-top:0.3rem"><em>${insp.notes}</em></p>` : ''}
    </div>`;
}

// ── Engineer: Available Applications ──────────────────────────────────

async function loadAvailableApplications(container) {
  container.innerHTML = '<p>Loading...</p>';
  try {
    const apps = await api.get('/applications');
    const available = apps.filter(a => a.status !== 'closed');
    if (!available.length) { container.innerHTML = '<p>No available applications.</p>'; return; }
    container.innerHTML = `
      <table class="data-table">
        <thead><tr><th>ID</th><th>Status</th><th>Service</th><th>Object</th><th>Date</th><th></th></tr></thead>
        <tbody>${available.map(a => `
          <tr>
            <td>${a.id}</td>
            <td>${badge(a.status)}</td>
            <td>${a.service_type}</td>
            <td>${a.audit_object_id}</td>
            <td>${fmtDate(a.created_at)}</td>
            <td><button class="btn btn-sm btn-primary" onclick="openInspection(${a.id})">Work</button></td>
          </tr>`).join('')}
        </tbody>
      </table>`;
  } catch (e) { toast(e.message, true); }
}

// ── Engineer: Open Inspection Form ────────────────────────────────────

async function openInspection(appId) {
  const c = $('#tab-content');
  c.innerHTML = '<p>Loading...</p>';

  try {
    const [appDetail, myInspections, buildingTypes] = await Promise.all([
      api.get(`/applications/${appId}`),
      api.get('/inspections/my'),
      getBuildingTypes(),
    ]);

    const existing = myInspections.find(i => i.application_id === appId);
    const obj = appDetail.audit_object;

    // Build building type options
    const typeOptions = Object.keys(buildingTypes).map(t =>
      `<option value="${t}" ${existing?.building_type === t ? 'selected' : ''}>${t}</option>`
    ).join('');

    // Build subtype options for current type
    const currentType = existing?.building_type || '';
    const subtypes = currentType ? (buildingTypes[currentType] || []) : [];
    const subtypeOptions = subtypes.map(s =>
      `<option value="${s}" ${existing?.building_subtype === s ? 'selected' : ''}>${s}</option>`
    ).join('');

    c.innerHTML = `
      <div class="card">
        <h3>Application #${appId} ${badge(appDetail.status)}</h3>
        ${obj ? `<p><strong>Object:</strong> ${obj.address} (${obj.object_type})</p>` : ''}
      </div>
      <div class="card">
        <h3>${existing ? 'Edit Inspection' : 'New Inspection'}</h3>
        ${existing?.status === 'submitted' ? '<p class="submitted-notice"><strong>Data submitted and locked.</strong></p>' : `

        <!-- ══ Building Type / Subtype Selection ══ -->
        <div class="building-type-section">
          <h4 class="section-title">Building Classification</h4>
          <div class="building-type-grid">
            <div class="type-selector">
              <label>Building Type</label>
              <div class="type-cards" id="type-cards">
                ${Object.keys(buildingTypes).map(t => `
                  <button type="button" class="type-card ${existing?.building_type === t ? 'active' : ''}" data-type="${t}">
                    <span class="type-icon">${getTypeIcon(t)}</span>
                    <span class="type-label">${t}</span>
                  </button>
                `).join('')}
              </div>
            </div>
            <div class="subtype-selector">
              <label>Subtype</label>
              <div class="subtype-cards" id="subtype-cards">
                ${currentType ? renderSubtypeCards(buildingTypes[currentType], existing?.building_subtype) : '<p class="hint">Select a building type first</p>'}
              </div>
            </div>
          </div>
          <input type="hidden" id="m-building-type" value="${existing?.building_type ?? ''}">
          <input type="hidden" id="m-building-subtype" value="${existing?.building_subtype ?? ''}">
        </div>

        <!-- ══ Metrics ══ -->
        <div class="metrics-section">
          <h4 class="section-title">Energy Metrics</h4>
          <div class="form-grid">
            <div class="form-group"><label>Heating (Gcal)</label><input id="m-heat" type="number" step="0.01" value="${existing?.heating_consumption ?? ''}"></div>
            <div class="form-group"><label>Electricity (kWh)</label><input id="m-elec" type="number" step="0.01" value="${existing?.electricity_consumption ?? ''}"></div>
            <div class="form-group"><label>Water (m\u00B3)</label><input id="m-water" type="number" step="0.01" value="${existing?.water_consumption ?? ''}"></div>
            <div class="form-group"><label>Gas (m\u00B3)</label><input id="m-gas" type="number" step="0.01" value="${existing?.gas_consumption ?? ''}"></div>
          </div>
        </div>

        <div class="metrics-section">
          <h4 class="section-title">Building Envelope</h4>
          <div class="form-grid">
            <div class="form-group"><label>Wall thickness (mm)</label><input id="m-wall" type="number" step="0.01" value="${existing?.wall_thickness_mm ?? ''}"></div>
            <div class="form-group"><label>Window type</label><input id="m-window" value="${existing?.window_type ?? ''}"></div>
            <div class="form-group"><label>Insulation type</label><input id="m-insulation" value="${existing?.insulation_type ?? ''}"></div>
            <div class="form-group"><label>Thermal resistance</label><input id="m-thermal" type="number" step="0.0001" value="${existing?.thermal_resistance ?? ''}"></div>
            <div class="form-group"><label>Air tightness</label><input id="m-air" type="number" step="0.0001" value="${existing?.air_tightness ?? ''}"></div>
          </div>
        </div>

        <div class="metrics-section">
          <h4 class="section-title">Temperature</h4>
          <div class="form-grid">
            <div class="form-group"><label>T indoor (\u00B0C)</label><input id="m-tin" type="number" step="0.1" value="${existing?.indoor_temperature ?? ''}"></div>
            <div class="form-group"><label>T outdoor (\u00B0C)</label><input id="m-tout" type="number" step="0.1" value="${existing?.outdoor_temperature ?? ''}"></div>
          </div>
        </div>

        <div class="form-group full" style="margin-top:0.75rem"><label>Notes</label><textarea id="m-notes">${existing?.notes ?? ''}</textarea></div>

        <div class="card" style="margin-top:1rem">
          <h4>Extra Metrics</h4>
          <div id="extra-metrics-list"></div>
          <button class="btn btn-sm" id="add-extra-metric" type="button">+ Add field</button>
        </div>
        <div class="actions" style="margin-top:1rem">
          <button class="btn btn-primary" id="m-save">Save Draft</button>
          <button class="btn btn-success" id="m-submit">Submit (lock)</button>
          ${existing ? `<button class="btn btn-danger" id="m-delete">Delete</button>` : ''}
          <button class="btn" onclick="loadTab('available')">Back</button>
        </div>`}
      </div>`;

    if (existing?.status === 'submitted') return;

    // ── Building type card click handling ──
    $$('#type-cards .type-card').forEach(card => {
      card.onclick = () => {
        $$('#type-cards .type-card').forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        const type = card.dataset.type;
        $('#m-building-type').value = type;
        $('#m-building-subtype').value = '';
        const subtypes = buildingTypes[type] || [];
        $('#subtype-cards').innerHTML = renderSubtypeCards(subtypes, null);
        // Attach subtype click handlers
        attachSubtypeHandlers();
        // Auto-select if only one subtype
        if (subtypes.length === 1) {
          const singleCard = $('#subtype-cards .subtype-card');
          if (singleCard) { singleCard.click(); }
        }
      };
    });

    function attachSubtypeHandlers() {
      $$('#subtype-cards .subtype-card').forEach(card => {
        card.onclick = () => {
          $$('#subtype-cards .subtype-card').forEach(c => c.classList.remove('active'));
          card.classList.add('active');
          $('#m-building-subtype').value = card.dataset.subtype;
        };
      });
    }

    // Attach handlers for initially rendered subtypes
    attachSubtypeHandlers();

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
        <div class="form-group"><label>Name</label><input class="extra-name" value="${name}"></div>
        <div class="form-group"><label>Value</label><input class="extra-value" type="number" step="any" value="${value}"></div>
        <div class="form-group" style="align-self:end"><button class="btn btn-sm btn-danger extra-remove" type="button">\u2715</button></div>`;
      row.querySelector('.extra-remove').onclick = () => row.remove();
      extraList.appendChild(row);
    }

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
        building_type: str('#m-building-type'),
        building_subtype: str('#m-building-subtype'),
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
        toast('Saved');
        openInspection(appId);
      } catch (e) { toast(e.message, true); }
    };

    // Submit (lock)
    $('#m-submit').onclick = async () => {
      if (!confirm('After submitting, data will be locked. Continue?')) return;
      try {
        const metrics = collectMetrics();
        let insp = existing;
        if (existing) {
          await api.put(`/inspections/${existing.id}`, metrics);
        } else {
          insp = await api.post('/inspections', { application_id: appId, ...metrics });
        }
        await api.post(`/inspections/${insp?.id || existing?.id}/submit`);
        toast('Inspection submitted');
        openInspection(appId);
      } catch (e) { toast(e.message, true); }
    };

    // Delete
    if (existing && $('#m-delete')) {
      $('#m-delete').onclick = async () => {
        if (!confirm('Delete inspection?')) return;
        try {
          await api.delete(`/inspections/${existing.id}`);
          toast('Deleted');
          loadTab('available');
        } catch (e) { toast(e.message, true); }
      };
    }
  } catch (e) { toast(e.message, true); }
}

// ── Building Type Icons ───────────────────────────────────────────────

function getTypeIcon(type) {
  const icons = {
    'Apartments': '\uD83C\uDFE2',
    'Serviced Apartments': '\uD83C\uDFE8',
    'Hotel': '\u2B50',
    'Resort': '\uD83C\uDFD6\uFE0F',
    'Retail': '\uD83D\uDED2',
    'Industrial': '\uD83C\uDFED',
    'Office': '\uD83C\uDFE2',
    'Healthcare': '\uD83C\uDFE5',
    'Education': '\uD83C\uDF93',
    'Mixed-use': '\uD83D\uDD00',
  };
  return icons[type] || '\uD83C\uDFE0';
}

function renderSubtypeCards(subtypes, selectedSubtype) {
  if (!subtypes || !subtypes.length) return '<p class="hint">Select a building type first</p>';
  return subtypes.map(s => `
    <button type="button" class="subtype-card ${selectedSubtype === s ? 'active' : ''}" data-subtype="${s}">
      ${s}
    </button>
  `).join('');
}

// ── Engineer: My Inspections ──────────────────────────────────────────

async function loadMyInspections(container) {
  container.innerHTML = '<p>Loading...</p>';
  try {
    const inspections = await api.get('/inspections/my');
    if (!inspections.length) { container.innerHTML = '<p>You have no inspections yet.</p>'; return; }
    container.innerHTML = `
      <table class="data-table">
        <thead><tr><th>ID</th><th>Application</th><th>Building</th><th>Status</th><th>Updated</th><th></th></tr></thead>
        <tbody>${inspections.map(i => `
          <tr>
            <td>${i.id}</td>
            <td>${i.application_id}</td>
            <td>${i.building_type ? `${i.building_type} / ${i.building_subtype || '—'}` : '—'}</td>
            <td>${badge(i.status)}</td>
            <td>${fmtDate(i.updated_at)}</td>
            <td>
              <button class="btn btn-sm btn-primary" onclick="openInspection(${i.application_id})">Open</button>
              <button class="btn btn-sm btn-success" onclick="downloadReport(${i.application_id})">Report</button>
            </td>
          </tr>`).join('')}
        </tbody>
      </table>`;
  } catch (e) { toast(e.message, true); }
}

// ── Admin: Users ──────────────────────────────────────────────────────

async function loadUsers(container) {
  container.innerHTML = '<p>Loading...</p>';
  try {
    const users = await api.get('/auth/users');
    container.innerHTML = `
      <div class="card">
        <h3>New User</h3>
        <div class="form-grid">
          <div class="form-group"><label>Login</label><input id="u-login"></div>
          <div class="form-group"><label>Password</label><input id="u-pass" type="password"></div>
          <div class="form-group"><label>Full Name</label><input id="u-name"></div>
          <div class="form-group">
            <label>Role</label>
            <select id="u-role">
              <option value="engineer">Engineer</option>
              <option value="admin">Admin</option>
            </select>
          </div>
        </div>
        <div class="actions"><button class="btn btn-primary" id="u-save">Create</button></div>
      </div>
      <table class="data-table">
        <thead><tr><th>ID</th><th>Login</th><th>Full Name</th><th>Role</th><th>Active</th></tr></thead>
        <tbody>${users.map(u => `<tr><td>${u.id}</td><td>${u.username}</td><td>${u.full_name}</td><td>${u.role}</td><td>${u.is_active ? 'Yes' : 'No'}</td></tr>`).join('')}</tbody>
      </table>`;
    $('#u-save').onclick = async () => {
      try {
        await api.post('/auth/users', {
          username: $('#u-login').value,
          password: $('#u-pass').value,
          full_name: $('#u-name').value,
          role: $('#u-role').value,
        });
        toast('User created');
        loadUsers(container);
      } catch (e) { toast(e.message, true); }
    };
  } catch (e) { toast(e.message, true); }
}

// ── Report Download (global) ──────────────────────────────────────────

async function downloadReport(appId) {
  try {
    await api.downloadReport(appId);
    toast('Report downloaded');
  } catch (e) { toast(e.message, true); }
}
