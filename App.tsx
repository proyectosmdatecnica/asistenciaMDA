import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Layout from './components/Layout';
import AgentDashboard from './components/AgentDashboard';
import UserRequestView from './components/UserRequestView';
import HelpModal from './components/HelpModal';
import { SupportRequest, QueueStats, AppRole } from './types';
import { storageService } from './services/dataService';
import { Loader2, RefreshCw, Wifi, WifiOff, Activity } from 'lucide-react';

const App: React.FC = () => {
  const [role, setRole] = useState<AppRole>('user');
  const [requests, setRequests] = useState<SupportRequest[]>([]);
  const [authorizedAgents, setAuthorizedAgents] = useState<string[]>([]);
  const [currentUserId, setCurrentUserId] = useState('user-guest');
  const [currentUserName, setCurrentUserName] = useState('Usuario Invitado');
  const [isTeamsReady, setIsTeamsReady] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncStatus, setLastSyncStatus] = useState<'online' | 'offline'>('online');
  const [countdown, setCountdown] = useState(15);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  
  const prevWaitingCount = useRef(0);

  // Lógica de Sincronización del Badge de Teams (Círculo rojo en el icono)
  useEffect(() => {
    const updateTeamsBadge = () => {
      const teams = (window as any).microsoftTeams;
      if (isTeamsReady && teams?.app?.setBadgeCount) {
        // Solo mostramos el badge si el usuario está en modo Agente
        if (role === 'agent') {
          const waitingCount = requests.filter(r => r.status === 'waiting').length;
          try {
            // Intentamos establecer el conteo. Si es 0, Teams quita el badge.
            teams.app.setBadgeCount(waitingCount).catch((err: any) => {
              console.debug("Error setting badge:", err);
            });
          } catch (e) {
            console.debug("Badge API not available in this Teams environment");
          }
        } else {
          // Si es usuario normal, limpiamos el badge
          try { teams.app.setBadgeCount(0); } catch (e) {}
        }
      }
    };

    updateTeamsBadge();
  }, [requests, isTeamsReady, role]);

  const refreshData = useCallback(async (silent = false) => {
    if (!silent) setIsSyncing(true);
    try {
      const [data, agents] = await Promise.all([
        storageService.fetchAllRequests(),
        storageService.fetchAgents()
      ]);
      
      setAuthorizedAgents(agents);
      setRequests(data);
      setLastSyncStatus('online');
      setCountdown(15);

      const waitingCount = data.filter(r => r.status === 'waiting').length;

      // Auto-cambio a rol de agente si el correo está autorizado
      if (agents.some(a => a.toLowerCase() === currentUserId.toLowerCase()) && role !== 'agent') {
        setRole('agent');
      }

      // Sonido de alerta para nuevos tickets si el usuario es agente
      if (role === 'agent') {
        if (waitingCount > prevWaitingCount.current) {
          const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2358/2358-preview.mp3');
          audio.volume = 0.4;
          audio.play().catch(() => {});
        }
        prevWaitingCount.current = waitingCount;
      }
    } catch (e) {
      setLastSyncStatus('offline');
    } finally {
      if (!silent) setIsSyncing(false);
    }
  }, [role, currentUserId]);

  useEffect(() => {
    const init = async () => {
      try {
        const teams = (window as any).microsoftTeams;
        if (teams) {
          await teams.app.initialize();
          const context = await teams.app.getContext();
          if (context.user?.userPrincipalName) {
            const upn = context.user.userPrincipalName.toLowerCase();
            setCurrentUserId(upn);
            setCurrentUserName(context.user.displayName || upn);
          }
          setIsTeamsReady(true);
        } else {
          setIsTeamsReady(true); // Fallback para navegador
        }
      } catch (e) {
        console.error("Teams Init Error", e);
        setIsTeamsReady(true);
      }
    };
    init();
  }, []);

  useEffect(() => {
    if (isTeamsReady && currentUserId !== 'user-guest') {
      refreshData();
    }
  }, [isTeamsReady, currentUserId, refreshData]);

  useEffect(() => {
    const interval = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          refreshData(true);
          return 15;
        }
        return prev - 1;
      });
    }, 1000); 
    return () => clearInterval(interval);
  }, [refreshData]);

  const stats = useMemo<QueueStats>(() => {
    const completed = requests.filter(r => r.status === 'completed');
    const active = requests.filter(r => r.status === 'waiting' || r.status === 'in-progress');
    let avgMins = 5;
    if (completed.length > 0) {
      const totalWait = completed.reduce((acc, curr) => acc + (Number(curr.startedAt || curr.completedAt || Date.now()) - Number(curr.createdAt)), 0);
      avgMins = Math.max(2, Math.round((totalWait / completed.length) / 60000));
    }
    return { averageWaitTime: avgMins, completedToday: completed.length, activeRequests: active.length };
  }, [requests]);

  const handleUpdateStatus = useCallback(async (id: string, newStatus: SupportRequest['status']) => {
    setIsSyncing(true);
    const agentData = newStatus === 'in-progress' 
      ? { agentId: currentUserId, agentName: currentUserName } 
      : (newStatus === 'waiting' ? { agentId: '', agentName: '' } : {});
      
    if (await storageService.updateRequestStatus(id, newStatus, agentData)) refreshData(true);
    setIsSyncing(false);
  }, [currentUserId, currentUserName, refreshData]);

  const handleCreateOrUpdate = useCallback(async (data: Partial<SupportRequest>, id?: string) => {
    setIsSyncing(true);
    let success = false;
    if (id) {
      success = await storageService.updateRequestStatus(id, 'waiting', data);
    } else {
      success = await storageService.saveRequest({ ...data, userId: currentUserId, userName: currentUserName });
    }
    if (success) refreshData(true);
    setIsSyncing(false);
  }, [currentUserId, currentUserName, refreshData]);

  const handleAgentManagement = async (action: 'add' | 'remove', email: string) => {
    setIsSyncing(true);
    if (action === 'add') await storageService.addAgent(email);
    else await storageService.removeAgent(email);
    await refreshData();
    setIsSyncing(false);
  };

  const activeRequestsForUser = useMemo(() => 
    requests.filter(r => r.userId === currentUserId && (r.status === 'waiting' || r.status === 'in-progress'))
  , [requests, currentUserId]);

  if (!isTeamsReady) return <div className="h-screen w-full flex items-center justify-center bg-gray-50"><Loader2 className="animate-spin text-[#5b5fc7]" size={40} /></div>;

  return (
    <Layout role={role} onSwitchRole={() => setRole(role === 'user' ? 'agent' : 'user')} onOpenHelp={() => setIsHelpOpen(true)}>
      <div className="relative min-h-full pb-20">
        <div className="fixed bottom-6 right-6 z-50 flex items-center space-x-3 bg-white px-5 py-3 rounded-full shadow-2xl border border-gray-100 text-[11px] font-black group transition-all">
          <div className="relative">
            {lastSyncStatus === 'online' ? <Wifi size={14} className="text-emerald-500" /> : <WifiOff size={14} className="text-red-500" />}
            {isSyncing && <Activity size={10} className="absolute -top-1 -right-1 text-indigo-500 animate-pulse" />}
          </div>
          <span className="text-gray-400 uppercase tracking-widest">{isSyncing ? 'Sincronizando' : `Refresco en ${countdown}s`}</span>
          <button onClick={() => refreshData()} className="p-1.5 hover:bg-gray-100 rounded-full"><RefreshCw size={12} className="text-indigo-400" /></button>
        </div>

        {role === 'agent' ? (
          <AgentDashboard 
            requests={requests} 
            stats={stats} 
            onUpdateStatus={handleUpdateStatus}
            agents={authorizedAgents}
            onManageAgent={handleAgentManagement}
          />
        ) : (
          <UserRequestView 
            activeRequests={activeRequestsForUser}
            queuePosition={(id) => requests.filter(r => r.status === 'waiting').sort((a,b) => Number(a.createdAt)-Number(b.createdAt)).findIndex(r => r.id === id) + 1}
            averageWaitTime={stats.averageWaitTime}
            onSubmit={handleCreateOrUpdate}
            onCancel={(id) => handleUpdateStatus(id, 'cancelled')}
          />
        )}
        <HelpModal isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
      </div>
    </Layout>
  );
};

export default App;