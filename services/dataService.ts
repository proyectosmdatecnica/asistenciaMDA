import { SupportRequest } from '../types';

const API_ENDPOINT = '/api/requests';

export const storageService = {
  async fetchAllRequests(): Promise<SupportRequest[]> {
    try {
      const response = await fetch(API_ENDPOINT);
      if (!response.ok) {
          const errData = await response.json().catch(() => ({ error: 'Error de red o servidor 503/500' }));
          console.error("API Fetch Error:", response.status, errData);
          return [];
      }
      const data = await response.json();
      return Array.isArray(data) ? data : [];
    } catch (error) {
      console.error("Network Exception:", error);
      return [];
    }
  },

  async saveRequest(request: SupportRequest): Promise<boolean> {
    try {
      const response = await fetch(API_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request)
      });
      
      if (!response.ok) {
          const errData = await response.json().catch(() => ({ error: 'Servicio no disponible (503)' }));
          console.error("API POST Error:", response.status, errData);
          alert(`Error al enviar: ${errData.detail || errData.error || 'El servidor de base de datos no responde'}`);
          return false;
      }
      return true;
    } catch (error) {
      console.error("Network Error:", error);
      alert("No se pudo conectar con el servidor. Verifica tu conexión a internet.");
      return false;
    }
  },

  async updateRequestStatus(id: string, status: SupportRequest['status']): Promise<boolean> {
    try {
      const response = await fetch(`${API_ENDPOINT}/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      return response.ok;
    } catch (error) {
      console.error("Update Status Error:", error);
      return false;
    }
  }
};