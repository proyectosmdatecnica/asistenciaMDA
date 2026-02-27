
export type RequestStatus = 'waiting' | 'in-progress' | 'paused' | 'completed' | 'cancelled';

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
  pausedAt?: number | null;
  pausedAccum?: number | null; // accumulated paused milliseconds
  priority: 'low' | 'medium' | 'high' | 'urgent';
  category?: string;
  aiSummary?: string;
  agentId?: string;
  agentName?: string;
}

export interface QueueStats {
  averageWaitTime: number; // in minutes
  activeRequests: number;
  completedToday: number;
}

export type AppRole = 'user' | 'agent';