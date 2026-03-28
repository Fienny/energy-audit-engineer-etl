/**
 * api.js — fetch wrapper for Engineering Workspace API.
 */

const API_BASE = '/api/v1';

const api = {
  _token: localStorage.getItem('token'),

  setToken(token) {
    this._token = token;
    if (token) localStorage.setItem('token', token);
    else localStorage.removeItem('token');
  },

  getToken() { return this._token; },
  isLoggedIn() { return !!this._token; },

  async _request(method, path, body = null, extraHeaders = {}) {
    const headers = { ...extraHeaders };
    if (this._token) headers['Authorization'] = `Bearer ${this._token}`;
    if (body && !(body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }

    const opts = { method, headers };
    if (body) {
      opts.body = body instanceof FormData ? body : JSON.stringify(body);
    }

    const resp = await fetch(`${API_BASE}${path}`, opts);

    if (resp.status === 401) {
      this.setToken(null);
      location.reload();
      return;
    }

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ detail: resp.statusText }));
      throw new Error(err.detail || 'Request failed');
    }

    if (resp.status === 204) return null;
    if (resp.headers.get('content-type')?.includes('json')) return resp.json();
    return resp;
  },

  get(path) { return this._request('GET', path); },
  post(path, body) { return this._request('POST', path, body); },
  put(path, body, headers) { return this._request('PUT', path, body, headers); },
  patch(path, body) { return this._request('PATCH', path, body); },
  delete(path) { return this._request('DELETE', path); },

  async login(username, password) {
    const form = new FormData();
    form.append('username', username);
    form.append('password', password);
    const data = await this._request('POST', '/auth/login', form);
    this.setToken(data.access_token);
    return data;
  },

  logout() {
    this.setToken(null);
    location.reload();
  },

  me() { return this.get('/auth/me'); },

  async uploadFiles(projectId, fileList) {
    const form = new FormData();
    for (const f of fileList) form.append('files', f);
    return this._request('POST', `/projects/${projectId}/files`, form);
  },

  downloadFileUrl(fileId) {
    return `${API_BASE}/files/${fileId}/download?token=${encodeURIComponent(this._token)}`;
  },

  previewFileUrl(fileId) {
    return `${API_BASE}/files/${fileId}/preview?token=${encodeURIComponent(this._token)}`;
  },
};
