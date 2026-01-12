import React, { useState, useEffect, useCallback } from 'react';
import Layout from './components/Layout';
import AgentDashboard from './components/AgentDashboard';
import UserRequestView from './components/UserRequestView';
import { SupportRequest, QueueStats, AppRole } from './types';
import { Loader2 } from 'lucide-react';

// === CONFIGURACIÓN DE AGENTES ===
const AUTHORIZED_AGENTS = [
  'mbozzone@intecsoft.com.ar',
  'ftokashiki@intecsoft.com.ar'
];

const App: React.FC = () => {
  const [role, setRole] = useState<AppRole>('user');
  const [requests, setRequests] = useState<SupportRequest[]>([]);
  const [currentUserId, setCurrentUserId] = useState('user-guest');
  const [currentUserName, setCurrentUserName] = useState('Usuario Invitado');
  const [isTeamsReady, setIsTeamsReady] = useState(false);
  const [stats, setStats] = useState<QueueStats>({
    averageWaitTime: 5,
    activeRequests: 0,
    completedToday: 0
  });

  // 1. CARGAR DATOS PERSISTIDOS AL INICIO
  useEffect(() => {
    const savedRequests = localStorage.getItem('teams_support_queue');
    if (savedRequests) {
      try {
        setRequests(JSON.parse(savedRequests));
      } catch (e) {
        console.error("Error cargando caché de pedidos", e);
      }
    }
  }, []);

  // 2. GUARDAR DATOS CUANDO CAMBIAN
  useEffect(() => {
    if (requests.length > 0) {
      localStorage.setItem('teams_support_queue', JSON.stringify(requests));
    }
  }, [requests]);

  // 3. INICIALIZAR TEAMS Y DETECTAR ROL
  useEffect(() => {
    const initializeTeams = async () => {
      try {
        if ((window as any).microsoftTeams) {
          const teams = (window as any).microsoftTeams;
          await teams.app.initialize();
          const context = await teams.app.getContext();
          
          if (context.user?.userPrincipalName) {
            const upn = context.user.userPrincipalName.toLowerCase();
            setCurrentUserId(upn);
            setCurrentUserName(context.user.displayName || upn);

            if (AUTHORIZED_AGENTS.map(a => a.toLowerCase()).includes(upn)) {
              setRole('agent');
            } else {
              setRole('user');
            }
          }
        }
      } catch (e) {
        console.warn("Modo local: Teams no detectado.");
      } finally {
        setIsTeamsReady(true);
      }
    };
    initializeTeams();
  }, []);

  // 4. ACTUALIZAR ESTADÍSTICAS EN TIEMPO REAL
  useEffect(() => {
    const completed = requests.filter(r => r.status === 'completed');
    const active = requests.filter(r => r.status === 'waiting' || r.status === 'in-progress');
    
    let avgMins = 5;
    if (completed.length > 0) {
      const totalWait = completed.reduce((acc, curr) => {
        const wait = (curr.startedAt || curr.createdAt) - curr.createdAt;
        return acc + wait;
      }, 0);
      avgMins = Math.max(1, Math.round((totalWait / completed.length) / 60000));
    }

    setStats({
      averageWaitTime: avgMins,
      completedToday: completed.length,
      activeRequests: active.length
    });
  }, [requests]);

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
  }, []);

  const handleCancelRequest = useCallback((id: string) => {
    setRequests(prev => prev.filter(r => r.id !== id));
  }, []);

  if (!isTeamsReady) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-[#f5f5f5]">
        <div className="bg-white p-12 rounded-[48px] shadow-2xl flex flex-col items-center border border-white">
          <Loader2 className="animate-spin text-[#5b5fc7] mb-6" size={54} />
          <h2 className="text-xl font-bold text-gray-800">Cargando Soporte IT</h2>
          <p className="text-gray-400 mt-2 text-sm">Sincronizando con Microsoft Teams...</p>
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
