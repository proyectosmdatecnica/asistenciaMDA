
import { AuthorizedAgent, SupportRequest } from '../types';

const isLocal = typeof window !== 'undefined' && window.location && window.location.hostname === 'localhost';
const API_ENDPOINT = isLocal ? `${window.location.protocol}//${window.location.hostname}:7071/api/requests` : '/api/requests';
const AGENTS_ENDPOINT = isLocal ? `${window.location.protocol}//${window.location.hostname}:7071/api/agents` : '/api/agents';
const TESTING_USERS_ENDPOINT = isLocal ? `${window.location.protocol}//${window.location.hostname}:7071/api/testing-users` : '/api/testing-users';
const ENVIRONMENT_MODE_ENDPOINT = isLocal ? `${window.location.protocol}//${window.location.hostname}:7071/api/environment/mode` : '/api/environment/mode';

function getAppModeOverride(): 'prod' | 'qa' | undefined {
  try {
    const raw = (localStorage.getItem('appModeOverride') || '').toLowerCase();
    if (raw === 'qa') return 'qa';
    if (raw === 'prod') return 'prod';
    return undefined;
  } catch (e) {
    return undefined;
  }
}

function getCurrentUserEmail(): string | undefined {
  try {
    const raw = (localStorage.getItem('currentUserId') || '').trim().toLowerCase();
    return raw && raw.includes('@') ? raw : undefined;
  } catch (e) {
    return undefined;
  }
}

function withModeHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = { ...extra };
  const mode = getAppModeOverride();
  const email = getCurrentUserEmail();
  if (mode) headers['x-app-mode'] = mode;
  if (email) headers['x-user-email'] = email;
  return headers;
}

export const storageService = {
  async fetchAllRequests(): Promise<SupportRequest[]> {
    const response = await fetch(API_ENDPOINT, { headers: withModeHeaders() });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Error ${response.status} cargando tickets: ${errorText || response.statusText}`);
    }
    const data = await response.json();
    return Array.isArray(data) ? data : [];
  },

  async saveRequest(request: Partial<SupportRequest>): Promise<boolean> {
    const response = await fetch(API_ENDPOINT, {
      method: 'POST',
      headers: withModeHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(request)
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Error ${response.status} guardando ticket: ${errorText || response.statusText}`);
    }
    return response.ok;
  },

  async updateRequestStatus(id: string, status: SupportRequest['status'], extraData: Partial<SupportRequest> = {}): Promise<boolean> {
    const response = await fetch(`${API_ENDPOINT}/${id}`, {
      method: 'PATCH',
      headers: withModeHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ status, ...extraData })
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Error ${response.status} actualizando estado: ${errorText || response.statusText}`);
    }
    return response.ok;
  },

  async fetchAgents(): Promise<string[]> {
    const response = await fetch(AGENTS_ENDPOINT, { headers: withModeHeaders() });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Error ${response.status} consultando agentes: ${errorText || response.statusText}`);
    }
    const data = await response.json();
    return Array.isArray(data) ? data : [];
  },

  async fetchAgentDetails(): Promise<AuthorizedAgent[]> {
    const response = await fetch(`${AGENTS_ENDPOINT}?details=1`, { headers: withModeHeaders() });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Error ${response.status} consultando detalle de agentes: ${errorText || response.statusText}`);
    }
    const data = await response.json();
    if (!Array.isArray(data)) return [];
    return data
      .filter((a) => a && typeof a.email === 'string')
      .map((a) => ({
        email: String(a.email).toLowerCase(),
        showOnUserDashboard: !!a.showOnUserDashboard
      }));
  },

  async fetchPendingAgents(): Promise<string[]> {
    const url = `${AGENTS_ENDPOINT}?pending=1`;
    const response = await fetch(url, { headers: withModeHeaders() });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Error ${response.status} consultando solicitudes pendientes: ${errorText || response.statusText}`);
    }
    const data = await response.json();
    return Array.isArray(data) ? data : [];
  },

  async addAgent(email: string, active: boolean = false): Promise<{ ok: boolean; status: number; body: any }> {
    console.log("Iniciando registro de agente para:", email, 'active=', active);
    const response = await fetch(AGENTS_ENDPOINT, {
      method: 'POST',
      headers: withModeHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ email, active })
    });
    const status = response.status;
    let body: any = null;
    try { body = await response.json(); } catch (e) { body = null; }
    if (!response.ok && status !== 202) {
      const errorText = await response.text();
      console.error("Error en addAgent:", response.status, errorText);
      throw new Error(`Error ${response.status}: ${errorText || "No se pudo registrar el agente en la base de datos."}`);
    }
    return { ok: response.ok, status, body };
  },

  async approveAgent(email: string): Promise<boolean> {
    const url = `${AGENTS_ENDPOINT}/approve`;
    const response = await fetch(url, {
      method: 'POST',
      headers: withModeHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ email })
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Error ${response.status} aprobando agente: ${errorText || response.statusText}`);
    }
    return response.ok;
  },

  async rejectAgent(email: string): Promise<boolean> {
    const url = `${AGENTS_ENDPOINT}/reject`;
    const response = await fetch(url, {
      method: 'POST',
      headers: withModeHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ email })
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Error ${response.status} rechazando agente: ${errorText || response.statusText}`);
    }
    return response.ok;
  },

  async setAgentDashboardVisibility(email: string, showOnUserDashboard: boolean): Promise<boolean> {
    const url = `${AGENTS_ENDPOINT}/visibility`;
    const response = await fetch(url, {
      method: 'POST',
      headers: withModeHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ email, showOnUserDashboard })
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Error ${response.status} actualizando visibilidad: ${errorText || response.statusText}`);
    }
    return response.ok;
  },

  async fetchAgentSettings(email: string): Promise<{ notifyReminders: boolean } | null> {
    try {
      const url = `${AGENTS_ENDPOINT}/settings?email=${encodeURIComponent(email)}`;
      const resp = await fetch(url, { headers: withModeHeaders() });
      if (!resp.ok) return null;
      const data = await resp.json();
      return { notifyReminders: !!data.notifyReminders };
    } catch (e) {
      return null;
    }
  },

  async saveAgentSettings(email: string, notifyReminders: boolean): Promise<boolean> {
    const url = `${AGENTS_ENDPOINT}/settings`;
    const response = await fetch(url, {
      method: 'POST',
      headers: withModeHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ email, notifyReminders })
    });
    return response.ok;
  },

  async removeAgent(email: string): Promise<boolean> {
    const response = await fetch(`${AGENTS_ENDPOINT}?email=${encodeURIComponent(email)}`, {
      method: 'DELETE',
      headers: withModeHeaders()
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Error ${response.status} eliminando agente: ${errorText || response.statusText}`);
    }
    return response.ok;
  },

  async fetchTestingUsers(): Promise<string[]> {
    const response = await fetch(TESTING_USERS_ENDPOINT, {
      headers: {
        'x-app-mode': 'prod'
      }
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Error ${response.status} consultando usuarios testing: ${errorText || response.statusText}`);
    }
    const data = await response.json();
    return Array.isArray(data) ? data : [];
  },

  async addTestingUser(email: string): Promise<boolean> {
    const response = await fetch(TESTING_USERS_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-app-mode': 'prod'
      },
      body: JSON.stringify({ email })
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Error ${response.status} agregando usuario testing: ${errorText || response.statusText}`);
    }
    return response.ok;
  },

  async removeTestingUser(email: string): Promise<boolean> {
    const response = await fetch(`${TESTING_USERS_ENDPOINT}?email=${encodeURIComponent(email)}`, {
      method: 'DELETE',
      headers: {
        'x-app-mode': 'prod'
      }
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Error ${response.status} eliminando usuario testing: ${errorText || response.statusText}`);
    }
    return response.ok;
  },

  async fetchEffectiveMode(): Promise<'prod' | 'qa'> {
    const response = await fetch(ENVIRONMENT_MODE_ENDPOINT, { headers: withModeHeaders() });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Error ${response.status} consultando modo de entorno: ${errorText || response.statusText}`);
    }
    const data = await response.json();
    return data?.mode === 'qa' ? 'qa' : 'prod';
  }
};
