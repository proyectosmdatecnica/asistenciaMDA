
import React, { useState, useEffect, useCallback } from 'react';
import Layout from './components/Layout';
import AgentDashboard from './components/AgentDashboard';
import UserRequestView from './components/UserRequestView';
import { SupportRequest, QueueStats, AppRole } from './types';
import { Loader2 } from 'lucide-react';

// === CONFIGURACIÓN DE AGENTES ===
// Añade aquí los correos de las personas que atenderán los pedidos
const AUTHORIZED_AGENTS = [
  'soporte@tuempresa.com',
  'admin@tuempresa.com',
  'tu-correo@ejemplo.com' // Reemplaza con tu correo de Teams para probar
];

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
  }
];

const App: React.FC = () => {
  const [role, setRole] = useState<AppRole>('user');
  const [requests, setRequests] = useState<SupportRequest[]>(INITIAL_REQUESTS);
  const [currentUserId, setCurrentUserId] = useState('user-guest');
  const [currentUserName, setCurrentUserName] = useState('Usuario Invitado');
  const [isTeamsReady, setIsTeamsReady] = useState(false);
  const [stats, setStats] = useState<QueueStats>({
    averageWaitTime: 5,
    activeRequests: 0,
    completedToday: 0
  });

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

            // DETECCIÓN AUTOMÁTICA DE ROL
            if (AUTHORIZED_AGENTS.map(a => a.toLowerCase()).includes(upn)) {
              setRole('agent');
              console.log("Rol detectado: Agente de Soporte");
            } else {
              setRole('user');
              console.log("Rol detectado: Usuario Final");
            }
          }
        }
      } catch (e) {
        console.warn("Ejecutando fuera de Teams o error de SDK. Usando modo invitado.");
      } finally {
        setIsTeamsReady(true);
      }
    };
    initializeTeams();
  }, []);

  // Recalcular estadísticas cuando cambian los pedidos
  useEffect(() => {
    const completed = requests.filter(r => r.status === 'completed');
    if (completed.length > 0) {
      const totalWait = completed.reduce((acc, curr) => {
        const wait = (curr.startedAt || curr.createdAt) - curr.createdAt;
        return acc + wait;
      }, 0);
      const avgMins = Math.round((totalWait / completed.length) / 60000) || 1;
      setStats(prev => ({
        ...prev,
        averageWaitTime: avgMins,
        completedToday: completed.length,
        activeRequests: requests.filter(r => r.status === 'waiting' || r.status === 'in-progress').length
      }));
    }
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
        <div className="bg-white p-10 rounded-[40px] shadow-2xl flex flex-col items-center border border-gray-100">
          <Loader2 className="animate-spin text-[#5b5fc7] mb-6" size={60} />
          <h2 className="text-xl font-black text-gray-800">Conectando con Teams</h2>
          <p className="text-gray-400 mt-2 font-medium">Validando identidad del usuario...</p>
        </div>
      </div>
    );
  }

  return (
    <Layout role={role} onSwitchRole={() => {
      // Dejamos el switch solo para que tú puedas probar ambas vistas fácilmente
      setRole(role === 'user' ? 'agent' : 'user');
    }}>
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
