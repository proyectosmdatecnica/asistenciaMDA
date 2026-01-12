
import { SupportRequest } from '../types';

/**
 * SERVICIO DE DATOS PARA AZURE FUNCTIONS (API GRATUITA)
 */
const API_ENDPOINT = '/api/requests';

export const storageService = {
  async fetchAllRequests(): Promise<SupportRequest[]> {
    try {
      const response = await fetch(API_ENDPOINT);
      if (!response.ok) throw new Error('API Offline');
      const data = await response.json();
      return Array.isArray(data) ? data : [];
    } catch (error) {
      const cached = localStorage.getItem('teams_support_cache');
      return cached ? JSON.parse(cached) : [];
    }
  },

  async saveRequest(request: SupportRequest): Promise<boolean> {
    try {
      const response = await fetch(API_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request)
      });
      return response.ok;
    } catch (error) {
      return false;
    }
  },

  async updateRequestStatus(id: string, status: SupportRequest['status']): Promise<boolean> {
    try {
      // Enviamos el ID en el cuerpo o como query param según prefieras
      // Aquí lo enviamos al endpoint base y la función lo maneja
      const response = await fetch(`${API_ENDPOINT}?id=${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          status,
          startedAt: status === 'in-progress' ? Date.now() : undefined,
          completedAt: status === 'completed' ? Date.now() : undefined
        })
      });
      return response.ok;
    } catch (error) {
      return false;
    }
  }
};
