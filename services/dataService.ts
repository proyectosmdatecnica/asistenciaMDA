
import { SupportRequest } from '../types';

const isLocal = typeof window !== 'undefined' && window.location && window.location.hostname === 'localhost';
const API_ENDPOINT = isLocal ? `${window.location.protocol}//${window.location.hostname}:7071/api/requests` : '/api/requests';
const AGENTS_ENDPOINT = isLocal ? `${window.location.protocol}//${window.location.hostname}:7071/api/agents` : '/api/agents';

export const storageService = {
  async fetchAllRequests(): Promise<SupportRequest[]> {
    const response = await fetch(API_ENDPOINT);
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
      headers: { 'Content-Type': 'application/json' },
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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, ...extraData })
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Error ${response.status} actualizando estado: ${errorText || response.statusText}`);
    }
    return response.ok;
  },

  async fetchAgents(): Promise<string[]> {
    const response = await fetch(AGENTS_ENDPOINT);
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Error ${response.status} consultando agentes: ${errorText || response.statusText}`);
    }
    const data = await response.json();
    return Array.isArray(data) ? data : [];
  },

  async fetchPendingAgents(): Promise<string[]> {
    const url = `${AGENTS_ENDPOINT}?pending=1`;
    const response = await fetch(url);
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
      headers: { 'Content-Type': 'application/json' },
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
      headers: { 'Content-Type': 'application/json' },
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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Error ${response.status} rechazando agente: ${errorText || response.statusText}`);
    }
    return response.ok;
  },

  async fetchAgentSettings(email: string): Promise<{ notifyReminders: boolean } | null> {
    try {
      const url = `${AGENTS_ENDPOINT}/settings?email=${encodeURIComponent(email)}`;
      const resp = await fetch(url);
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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, notifyReminders })
    });
    return response.ok;
  },

  async removeAgent(email: string): Promise<boolean> {
    const response = await fetch(`${AGENTS_ENDPOINT}?email=${encodeURIComponent(email)}`, {
      method: 'DELETE'
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Error ${response.status} eliminando agente: ${errorText || response.statusText}`);
    }
    return response.ok;
  }
};
