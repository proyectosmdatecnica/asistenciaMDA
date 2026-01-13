import { SupportRequest } from '../types';

const API_ENDPOINT = '/api/requests';

export const storageService = {
  async fetchAllRequests(): Promise<SupportRequest[]> {
    try {
      const response = await fetch(API_ENDPOINT);
      if (!response.ok) throw new Error(`Server Error: ${response.status}`);
      const data = await response.json();
      const requests = Array.isArray(data) ? data : [];
      localStorage.setItem('teams_support_cache', JSON.stringify(requests));
      return requests;
    } catch (error) {
      console.warn("Fetch Error:", error);
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