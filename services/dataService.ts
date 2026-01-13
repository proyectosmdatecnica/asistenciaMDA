import { SupportRequest } from '../types';

const API_ENDPOINT = '/api/requests';

export const storageService = {
  async fetchAllRequests(): Promise<SupportRequest[]> {
    try {
      const response = await fetch(API_ENDPOINT);
      if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.error || `Server Error: ${response.status}`);
      }
      const data = await response.json();
      return Array.isArray(data) ? data : [];
    } catch (error) {
      console.error("Fetch Error Detail:", error);
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
          const errData = await response.json().catch(() => ({}));
          console.error("API POST Error detail:", errData);
          alert(`Error del servidor: ${errData.error || 'Desconocido'}`);
          return false;
      }
      return true;
    } catch (error) {
      console.error("Network Error:", error);
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
      return false;
    }
  }
};