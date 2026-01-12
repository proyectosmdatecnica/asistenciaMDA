
export type RequestStatus = 'waiting' | 'in-progress' | 'completed' | 'cancelled';

export interface SupportRequest {
  id: string;
  userId: string;
  userName: string;
  subject: string;
  description: string;
  status: RequestStatus;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  priority: 'low' | 'medium' | 'high';
  aiSummary?: string;
}

export interface QueueStats {
  averageWaitTime: number; // in minutes
  activeRequests: number;
  completedToday: number;
}

export type AppRole = 'user' | 'agent';
