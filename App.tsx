
import React, { useState, useEffect, useCallback } from 'react';
import Layout from './components/Layout.tsx';
import AgentDashboard from './components/AgentDashboard.tsx';
import UserRequestView from './components/UserRequestView.tsx';
import { SupportRequest, QueueStats, AppRole } from './types.ts';
import { Loader2 } from 'lucide-react';

const INITIAL_REQUESTS: SupportRequest[] = [
  {
    id: 'T-8821',
    userId: 'u1',
    userName: 'Carlos Rodriguez',
    subject: 'Problema con VPN',
    description: 'No puedo conectar a la red interna desde mi casa.',
    status: 'waiting',
    createdAt: Date.now() - 12 * 60000,
    priority: 'high',
    aiSummary: 'Fallo conexión VPN remota'
  },
  {
    id: 'T-9902',
    userId: 'u2',
    userName: 'Ana Belén',
    subject: 'Solicitud de monitor',
    description: 'Mi monitor secundario parpadea constantemente.',
    status: 'waiting',
    createdAt: Date.now() - 4 * 60000,
    priority: 'medium',
    aiSummary: 'Fallo hardware monitor'
  }
];

const App: React.FC = () => {
  const [role, setRole] = useState<AppRole>('user');
  const [requests, setRequests] = useState<SupportRequest[]>(INITIAL_REQUESTS);
  const [currentUserId, setCurrentUserId] = useState('user-guest');
  const [currentUserName, setCurrentUserName] = useState('Usuario Invitado');
  const [isTeamsReady, setIsTeamsReady] = useState(false);
  const [stats, setStats] = useState<QueueStats>({
    averageWaitTime: 8,
    activeRequests: 0,
    completedToday: 24
  });

  useEffect(() => {
    const initializeTeams = async () => {
      try {
        if ((window as any).microsoftTeams) {
          const teams = (window as any).microsoftTeams;
          await teams.app.initialize();
          const context = await teams.app.getContext();
          if (context.user?.userPrincipalName) {
            setCurrentUserId(context.user.userPrincipalName);
            setCurrentUserName(context.user.displayName || context.user.userPrincipalName);
          }
        }
      } catch (e) {
        console.warn("Teams SDK no disponible, usando modo local");
      } finally {
        setIsTeamsReady(true);
      }
    };
    initializeTeams();
  }, []);

  const myRequest = requests.find(r => r.userId === currentUserId && (r.status === 'waiting' || r.status === 'in-progress')) || null;
  
  const myQueuePosition = myRequest && myRequest.status === 'waiting' 
    ? requests.filter(r => r.status === 'waiting' && r.createdAt <= myRequest.createdAt).length 
    : 0;

  const handleCreateRequest = useCallback((data: Partial<SupportRequest>) => {
    const newRequest: SupportRequest = {
      id: `T-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`,
      userId: currentUserId,
      userName: currentUserName,
      subject: data.subject || '',
      description: data.description || '',
      status: 'waiting',
      createdAt: Date.now(),
      priority: data.priority || 'medium',
      aiSummary: data.aiSummary
    };
    setRequests(prev => [...prev, newRequest]);
  }, [currentUserId, currentUserName]);

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

  const handleCancelRequest = useCallback((id: string) => {
    setRequests(prev => prev.filter(r => r.id !== id));
  }, []);

  if (!isTeamsReady) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-[#f5f5f5]">
        <div className="bg-white p-8 rounded-2xl shadow-xl flex flex-col items-center">
          <Loader2 className="animate-spin text-[#5b5fc7] mb-4" size={48} />
          <p className="font-bold text-gray-700 animate-pulse">Sincronizando con Teams...</p>
        </div>
      </div>
    );
  }

  return (
    <Layout role={role} onSwitchRole={() => setRole(role === 'user' ? 'agent' : 'user')}>
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
          onCancel={handleCancelRequest}
        />
      )}
    </Layout>
  );
};

export default App;
