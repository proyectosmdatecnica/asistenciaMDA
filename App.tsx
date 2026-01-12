
import React, { useState, useEffect, useCallback } from 'react';
import Layout from './components/Layout';
import AgentDashboard from './components/AgentDashboard';
import UserRequestView from './components/UserRequestView';
import { SupportRequest, QueueStats, AppRole } from './types';

const INITIAL_REQUESTS: SupportRequest[] = [
  {
    id: '1',
    userId: 'u1',
    userName: 'Juan Perez',
    subject: 'Error al iniciar Teams',
    description: 'La aplicación se queda cargando eternamente y luego da error de conexión.',
    status: 'waiting',
    createdAt: Date.now() - 15 * 60000,
    priority: 'high',
    aiSummary: 'Fallo de inicio sesión Teams'
  },
  {
    id: '2',
    userId: 'u2',
    userName: 'Maria Garcia',
    subject: 'Instalación de Software',
    description: 'Necesito que me instalen VS Code para el proyecto nuevo.',
    status: 'waiting',
    createdAt: Date.now() - 5 * 60000,
    priority: 'medium',
    aiSummary: 'Pedido instalación VS Code'
  }
];

const App: React.FC = () => {
  const [role, setRole] = useState<AppRole>('user');
  const [requests, setRequests] = useState<SupportRequest[]>(INITIAL_REQUESTS);
  const [currentUserId] = useState('user-99'); // Mock logged in user
  const [stats, setStats] = useState<QueueStats>({
    averageWaitTime: 8,
    activeRequests: 0,
    completedToday: 12
  });

  // Calculate current user's active request
  const myRequest = requests.find(r => r.userId === currentUserId && (r.status === 'waiting' || r.status === 'in-progress')) || null;
  
  // Calculate position in queue
  const myQueuePosition = myRequest && myRequest.status === 'waiting' 
    ? requests.filter(r => r.status === 'waiting' && r.createdAt <= myRequest.createdAt).length 
    : 0;

  const handleCreateRequest = useCallback((data: Partial<SupportRequest>) => {
    const newRequest: SupportRequest = {
      id: Math.random().toString(36).substr(2, 9),
      userId: currentUserId,
      userName: 'Tú (Usuario Interno)',
      subject: data.subject || '',
      description: data.description || '',
      status: 'waiting',
      createdAt: Date.now(),
      priority: data.priority || 'medium',
      aiSummary: data.aiSummary
    };
    setRequests(prev => [...prev, newRequest]);
  }, [currentUserId]);

  const handleUpdateStatus = useCallback((id: string, newStatus: SupportRequest['status']) => {
    setRequests(prev => prev.map(req => {
      if (req.id === id) {
        const updated = { ...req, status: newStatus };
        if (newStatus === 'in-progress') updated.startedAt = Date.now();
        if (newStatus === 'completed') updated.completedAt = Date.now();
        return updated;
      }
      return req;
    }));

    if (newStatus === 'completed') {
      setStats(prev => ({ ...prev, completedToday: prev.completedToday + 1 }));
    }
  }, []);

  const toggleRole = () => setRole(prev => prev === 'user' ? 'agent' : 'user');

  return (
    <Layout role={role} onSwitchRole={toggleRole}>
      {role === 'agent' ? (
        <AgentDashboard 
          requests={requests} 
          stats={stats} 
          onUpdateStatus={handleUpdateStatus} 
        />
      ) : (
        <UserRequestView 
          activeRequest={myRequest}
          queuePosition={myQueuePosition}
          averageWaitTime={stats.averageWaitTime}
          onSubmit={handleCreateRequest}
        />
      )}
    </Layout>
  );
};

export default App;
