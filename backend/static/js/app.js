/**
 * app.js — Engineering Workspace SPA.
 * Project-centric workspace with file management.
 */

let currentUser = null;
let buildingTypesCache = null;

// -- Helpers --

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
  const labels = { active: 'Active', completed: 'Completed', archived: 'Archived' };
  return `<span class="badge badge-${status}">${labels[status] || status}</span>`;
}

function fmtDate(iso) {
  if (!iso) return '\u2014';
  return new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function fmtSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function escHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

async function getBuildingTypes() {
  if (buildingTypesCache) return buildingTypesCache;
  buildingTypesCache = await api.get('/building-types');
  return buildingTypesCache;
}

function getTypeIcon(type) {
  const icons = {
    'Apartments': '\uD83C\uDFE2', 'Serviced Apartments': '\uD83C\uDFE8',
    'Hotel': '\u2B50', 'Resort': '\uD83C\uDFD6\uFE0F', 'Retail': '\uD83D\uDED2',
    'Industrial': '\uD83C\uDFED', 'Office': '\uD83C\uDFE2', 'Healthcare': '\uD83C\uDFE5',
    'Education': '\uD83C\uDF93', 'Mixed-use': '\uD83D\uDD00',
  };
  return icons[type] || '\uD83C\uDFE0';
}

function fileIcon(fileType) {
  if (fileType === 'image') return '\uD83D\uDDBC\uFE0F';
  if (fileType === 'document') return '\uD83D\uDCC4';
  return '\uD83D\uDCCE';
}

// -- Init --

document.addEventListener('DOMContentLoaded', async () => {
  if (!api.isLoggedIn()) return showLogin();
  try {
    currentUser = await api.me();
    showApp();
  } catch {
    api.logout();
  }
});

// -- Login --

function showLogin() {
  $('#app').innerHTML = `
    <div class="login-wrapper">
      <div class="login-box">
        <h2>Engineering Workspace</h2>
        <p class="login-subtitle">Sign in to continue</p>
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

// -- App Shell --

function showApp() {
  const isAdmin = currentUser.role === 'admin';

  let tabs = `<button class="tab-btn active" data-tab="projects">Projects</button>`;
  if (isAdmin) {
    tabs += `<button class="tab-btn" data-tab="users">Users</button>`;
  }

  const roleLabel = { engineer: 'Engineer', admin: 'Admin', other: 'Other' };

  $('#app').innerHTML = `
    <header class="app-header">
      <h1>Engineering Workspace</h1>
      <div class="user-info">
        <span>${escHtml(currentUser.full_name)} (${roleLabel[currentUser.role] || currentUser.role})</span>
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

  loadTab('projects');
}

function loadTab(tab) {
  const c = $('#tab-content');
  switch (tab) {
    case 'projects': return loadProjects(c);
    case 'users': return loadUsers(c);
  }
}

// -- Projects List --

async function loadProjects(container) {
  container.innerHTML = '<p>Loading...</p>';
  try {
    const projects = await api.get('/projects');

    container.innerHTML = `
      <div class="projects-toolbar">
        <div class="search-box">
          <input id="project-search" type="text" placeholder="Search by code or name..." value="">
        </div>
        <button class="btn btn-primary" id="new-project-btn">+ New Project</button>
      </div>
      <div id="projects-list">
        ${renderProjectsList(projects)}
      </div>`;

    let searchTimeout;
    $('#project-search').oninput = (e) => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(async () => {
        const q = e.target.value.trim();
        const results = await api.get('/projects' + (q ? `?search=${encodeURIComponent(q)}` : ''));
        $('#projects-list').innerHTML = renderProjectsList(results);
      }, 300);
    };

    $('#new-project-btn').onclick = () => showNewProjectForm(container);
  } catch (e) { toast(e.message, true); }
}

function renderProjectsList(projects) {
  if (!projects.length) return '<p class="empty-state">No projects found.</p>';
  return `<div class="project-cards">
    ${projects.map(p => `
      <div class="project-card" onclick="openProject(${p.id})">
        <div class="project-card-header">
          <span class="project-code">${escHtml(p.code)}</span>
          ${badge(p.status)}
        </div>
        <div class="project-card-name">${escHtml(p.name)}</div>
        ${p.building_type ? `<div class="project-card-type">${getTypeIcon(p.building_type)} ${escHtml(p.building_type)}${p.building_subtype ? ' / ' + escHtml(p.building_subtype) : ''}</div>` : ''}
        <div class="project-card-date">${fmtDate(p.updated_at)}</div>
      </div>
    `).join('')}
  </div>`;
}

// -- New Project Form --

async function showNewProjectForm(container) {
  const buildingTypes = await getBuildingTypes();

  container.innerHTML = `
    <div class="card">
      <h3>New Project</h3>
      <div class="form-grid">
        <div class="form-group"><label>Project Code *</label><input id="p-code" placeholder="EA-SUR-1020"></div>
        <div class="form-group"><label>Project Name *</label><input id="p-name" placeholder="Project name"></div>
        <div class="form-group full"><label>Description</label><textarea id="p-desc" rows="2"></textarea></div>
      </div>

      <div class="building-type-section" style="margin-top:1rem">
        <h4 class="section-title">Building Classification</h4>
        <div class="type-selector">
          <label>Building Type</label>
          <div class="type-cards" id="type-cards">
            ${Object.keys(buildingTypes).map(t => `
              <button type="button" class="type-card" data-type="${t}">
                <span class="type-icon">${getTypeIcon(t)}</span>
                <span class="type-label">${t}</span>
              </button>
            `).join('')}
          </div>
        </div>
        <div class="subtype-selector" style="margin-top:0.75rem">
          <label>Subtype</label>
          <div class="subtype-cards" id="subtype-cards">
            <p class="hint">Select a building type first</p>
          </div>
        </div>
        <input type="hidden" id="p-building-type" value="">
        <input type="hidden" id="p-building-subtype" value="">
      </div>

      <div class="actions" style="margin-top:1rem">
        <button class="btn btn-primary" id="p-save">Create Project</button>
        <button class="btn" id="p-cancel">Cancel</button>
      </div>
    </div>`;

  // Building type selection
  $$('#type-cards .type-card').forEach(card => {
    card.onclick = () => {
      $$('#type-cards .type-card').forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      const type = card.dataset.type;
      $('#p-building-type').value = type;
      $('#p-building-subtype').value = '';
      const subtypes = buildingTypes[type] || [];
      $('#subtype-cards').innerHTML = renderSubtypeCards(subtypes, null);
      attachSubtypeHandlers('p-building-subtype');
      if (subtypes.length === 1) {
        const single = $('#subtype-cards .subtype-card');
        if (single) single.click();
      }
    };
  });

  $('#p-save').onclick = async () => {
    const code = $('#p-code').value.trim();
    const name = $('#p-name').value.trim();
    if (!code || !name) { toast('Code and name are required', true); return; }
    try {
      await api.post('/projects', {
        code,
        name,
        description: $('#p-desc').value.trim() || null,
        building_type: $('#p-building-type').value || null,
        building_subtype: $('#p-building-subtype').value || null,
      });
      toast('Project created');
      loadProjects(container);
    } catch (e) { toast(e.message, true); }
  };

  $('#p-cancel').onclick = () => loadProjects(container);
}

function renderSubtypeCards(subtypes, selected) {
  if (!subtypes || !subtypes.length) return '<p class="hint">Select a building type first</p>';
  return subtypes.map(s => `
    <button type="button" class="subtype-card ${selected === s ? 'active' : ''}" data-subtype="${s}">${s}</button>
  `).join('');
}

function attachSubtypeHandlers(hiddenId) {
  $$('#subtype-cards .subtype-card').forEach(card => {
    card.onclick = () => {
      $$('#subtype-cards .subtype-card').forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      $(`#${hiddenId}`).value = card.dataset.subtype;
    };
  });
}

// -- Project Detail --

async function openProject(projectId) {
  const c = $('#tab-content');
  c.innerHTML = '<p>Loading...</p>';

  try {
    const [project, files] = await Promise.all([
      api.get(`/projects/${projectId}`),
      api.get(`/projects/${projectId}/files`),
    ]);

    const images = files.filter(f => f.file_type === 'image');
    const docs = files.filter(f => f.file_type === 'document');
    const others = files.filter(f => f.file_type === 'other');

    c.innerHTML = `
      <div class="project-detail-header">
        <button class="btn" id="back-to-list">\u2190 Back</button>
        <div class="project-detail-title">
          <span class="project-code">${escHtml(project.code)}</span>
          <h2>${escHtml(project.name)}</h2>
          ${badge(project.status)}
        </div>
        <div class="project-detail-actions">
          ${currentUser.role === 'admin' ? `
            <select id="project-status" class="status-select">
              <option value="active" ${project.status === 'active' ? 'selected' : ''}>Active</option>
              <option value="completed" ${project.status === 'completed' ? 'selected' : ''}>Completed</option>
              <option value="archived" ${project.status === 'archived' ? 'selected' : ''}>Archived</option>
            </select>
          ` : ''}
        </div>
      </div>

      ${project.description ? `<div class="card"><p>${escHtml(project.description)}</p></div>` : ''}

      ${project.building_type ? `
        <div class="card project-meta">
          <span>${getTypeIcon(project.building_type)} <strong>${escHtml(project.building_type)}</strong>${project.building_subtype ? ' / ' + escHtml(project.building_subtype) : ''}</span>
          <span>Created: ${fmtDate(project.created_at)}</span>
          ${project.creator ? `<span>By: ${escHtml(project.creator.full_name)}</span>` : ''}
        </div>
      ` : ''}

      <!-- File Upload -->
      <div class="card">
        <h3>Upload Files</h3>
        <div class="drop-zone" id="drop-zone">
          <p>Drag & drop files here or <label class="upload-label">browse<input type="file" id="file-input" multiple hidden></label></p>
        </div>
        <div id="upload-progress" style="display:none">
          <p>Uploading...</p>
        </div>
      </div>

      <!-- Images -->
      ${images.length ? `
        <div class="card">
          <h3>Images (${images.length})</h3>
          <div class="image-grid">
            ${images.map(f => `
              <div class="image-thumb" onclick="previewImage(${f.id}, '${escHtml(f.file_name)}')">
                <img src="${api.previewFileUrl(f.id)}" alt="${escHtml(f.file_name)}" loading="lazy">
                <div class="image-info">
                  <span class="file-name-sm">${escHtml(f.file_name)}</span>
                  <span class="file-size-sm">${fmtSize(f.file_size)}</span>
                </div>
                <button class="file-delete-btn" onclick="event.stopPropagation(); deleteFile(${f.id}, ${projectId})" title="Delete">\u2715</button>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}

      <!-- Documents -->
      ${docs.length ? `
        <div class="card">
          <h3>Documents (${docs.length})</h3>
          <div class="file-list">
            ${docs.map(f => renderFileRow(f, projectId)).join('')}
          </div>
        </div>
      ` : ''}

      <!-- Other Files -->
      ${others.length ? `
        <div class="card">
          <h3>Other Files (${others.length})</h3>
          <div class="file-list">
            ${others.map(f => renderFileRow(f, projectId)).join('')}
          </div>
        </div>
      ` : ''}

      ${!files.length ? '<div class="card"><p class="empty-state">No files uploaded yet.</p></div>' : ''}
    `;

    // Back button
    $('#back-to-list').onclick = () => loadTab('projects');

    // Status change
    if ($('#project-status')) {
      $('#project-status').onchange = async (e) => {
        try {
          await api.patch(`/projects/${projectId}`, { status: e.target.value });
          toast('Status updated');
          openProject(projectId);
        } catch (err) { toast(err.message, true); }
      };
    }

    // File upload via input
    $('#file-input').onchange = (e) => handleUpload(e.target.files, projectId);

    // Drag & drop
    const dropZone = $('#drop-zone');
    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('drag-over');
      handleUpload(e.dataTransfer.files, projectId);
    });

  } catch (e) { toast(e.message, true); }
}

function renderFileRow(f, projectId) {
  return `
    <div class="file-row">
      <span class="file-icon">${fileIcon(f.file_type)}</span>
      <div class="file-info">
        <a href="${api.downloadFileUrl(f.id)}" class="file-name" target="_blank">${escHtml(f.file_name)}</a>
        <span class="file-meta">${fmtSize(f.file_size)} \u2022 ${fmtDate(f.created_at)}${f.uploader ? ' \u2022 ' + escHtml(f.uploader.full_name) : ''}</span>
      </div>
      <button class="btn btn-sm btn-danger" onclick="deleteFile(${f.id}, ${projectId})">Delete</button>
    </div>`;
}

async function handleUpload(fileList, projectId) {
  if (!fileList || !fileList.length) return;
  const prog = $('#upload-progress');
  if (prog) prog.style.display = 'block';
  try {
    await api.uploadFiles(projectId, fileList);
    toast(`${fileList.length} file(s) uploaded`);
    openProject(projectId);
  } catch (e) {
    toast(e.message, true);
    if (prog) prog.style.display = 'none';
  }
}

async function deleteFile(fileId, projectId) {
  if (!confirm('Delete this file?')) return;
  try {
    await api.delete(`/files/${fileId}`);
    toast('File deleted');
    openProject(projectId);
  } catch (e) { toast(e.message, true); }
}

function previewImage(fileId, fileName) {
  const overlay = document.createElement('div');
  overlay.className = 'image-overlay';
  overlay.innerHTML = `
    <div class="image-overlay-content">
      <div class="image-overlay-header">
        <span>${escHtml(fileName)}</span>
        <button class="btn btn-sm" id="close-preview">\u2715 Close</button>
      </div>
      <img src="${api.previewFileUrl(fileId)}" alt="${escHtml(fileName)}">
    </div>`;
  document.body.appendChild(overlay);
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
  overlay.querySelector('#close-preview').onclick = () => overlay.remove();
}

// -- Users (Admin) --

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
              <option value="other">Other</option>
            </select>
          </div>
        </div>
        <div class="actions"><button class="btn btn-primary" id="u-save">Create</button></div>
      </div>
      <table class="data-table">
        <thead><tr><th>ID</th><th>Login</th><th>Full Name</th><th>Role</th><th>Active</th></tr></thead>
        <tbody>${users.map(u => `<tr><td>${u.id}</td><td>${escHtml(u.username)}</td><td>${escHtml(u.full_name)}</td><td>${u.role}</td><td>${u.is_active ? 'Yes' : 'No'}</td></tr>`).join('')}</tbody>
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
