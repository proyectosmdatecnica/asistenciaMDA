
import { SupportRequest } from '../types';

const API_ENDPOINT = '/api/requests';

export const storageService = {
  async fetchAllRequests(): Promise<SupportRequest[]> {
    try {
      const response = await fetch(API_ENDPOINT);
      if (!response.ok) return [];
      const data = await response.json();
      return Array.isArray(data) ? data : [];
    } catch (error) {
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
      return response.ok;
    } catch (error) {
      return false;
    }
  },

  async updateRequestStatus(id: string, status: SupportRequest['status'], extraData: Partial<SupportRequest> = {}): Promise<boolean> {
    try {
      const response = await fetch(`${API_ENDPOINT}/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, ...extraData })
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error("Error al actualizar estado:", response.status, errorText);
        alert("Error del servidor: Revisa si la base de datos tiene las columnas agentId y agentName.");
        return false;
      }
      return true;
    } catch (error) {
      console.error("Excepción en updateStatus:", error);
      return false;
    }
  }
};
