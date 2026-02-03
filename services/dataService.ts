
import { SupportRequest } from '../types';

const API_ENDPOINT = '/api/requests';
const AGENTS_ENDPOINT = '/api/agents';

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

  async addAgent(email: string): Promise<boolean> {
    console.log("Iniciando registro de agente para:", email);
    const response = await fetch(AGENTS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error("Error en addAgent:", response.status, errorText);
      throw new Error(`Error ${response.status}: ${errorText || "No se pudo registrar el agente en la base de datos."}`);
    }
    
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
