
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Layout from './components/Layout';
import AgentDashboard from './components/AgentDashboard';
import UserRequestView from './components/UserRequestView';
import HelpModal from './components/HelpModal';
import { SupportRequest, QueueStats, AppRole } from './types';
import { storageService } from './services/dataService';
import { Loader2, RefreshCw, Wifi, WifiOff, Activity } from 'lucide-react';

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
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncStatus, setLastSyncStatus] = useState<'online' | 'offline'>('online');
  const [countdown, setCountdown] = useState(15);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  
  const prevWaitingCount = useRef(0);

  const refreshData = useCallback(async (silent = false) => {
    if (!silent) setIsSyncing(true);
    try {
      const data = await storageService.fetchAllRequests();
      
      if (role === 'agent') {
        const currentWaiting = data.filter(r => r.status === 'waiting').length;
        if (currentWaiting > prevWaitingCount.current) {
          try {
            const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2358/2358-preview.mp3');
            audio.volume = 0.4;
            audio.play().catch(() => {});
          } catch (e) {}
        }
        prevWaitingCount.current = currentWaiting;
      }

      setRequests(data);
      setLastSyncStatus('online');
      setCountdown(15);
    } catch (e) {
      setLastSyncStatus('offline');
    } finally {
      if (!silent) setIsSyncing(false);
    }
  }, [role]);

  // Efecto para inicializar Teams y cargar datos iniciales una vez resuelto el ID
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
            
            if (AUTHORIZED_AGENTS.some(a => a.toLowerCase() === upn)) {
              setRole('agent');
            }
          }
        }
      } catch (e) {
        console.error("Teams Init Error", e);
      } finally {
        setIsTeamsReady(true);
        // Disparar carga de datos inmediata tras resolver identidad
        refreshData();
      }
    };
    init();
  }, []); // Solo al montar una vez

  // Refrescar datos cuando cambie el ID de usuario (caso de persistencia)
  useEffect(() => {
    if (currentUserId !== 'user-guest') {
      refreshData(true);
    }
  }, [currentUserId, refreshData]);

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
      const totalWait = completed.reduce((acc, curr) => {
        const end = curr.startedAt || curr.completedAt || Date.now();
        return acc + (Number(end) - Number(curr.createdAt));
      }, 0);
      avgMins = Math.max(2, Math.round((totalWait / completed.length) / 60000));
    }

    return {
      averageWaitTime: avgMins,
      completedToday: completed.length,
      activeRequests: active.length
    };
  }, [requests]);

  const handleCreateOrUpdate = useCallback(async (data: Partial<SupportRequest>, id?: string) => {
    setIsSyncing(true);
    let success = false;

    // IMPORTANTE: Si hay ID, es una actualización (PATCH), si no, es creación (POST)
    if (id) {
      success = await storageService.updateRequestStatus(id, 'waiting', {
        subject: data.subject,
        description: data.description,
        priority: data.priority
      });
    } else {
      const newRequest: any = {
        userId: currentUserId,
        userName: currentUserName,
        subject: data.subject,
        description: data.description,
        priority: data.priority,
        aiSummary: data.aiSummary,
        category: data.category
      };
      success = await storageService.saveRequest(newRequest);
    }
    
    if (success) {
      // Esperar un breve instante para que la DB asiente antes de refrescar
      setTimeout(() => refreshData(true), 500);
    }
    setIsSyncing(false);
  }, [currentUserId, currentUserName, refreshData]);

  const handleUpdateStatus = useCallback(async (id: string, newStatus: SupportRequest['status']) => {
    setIsSyncing(true);
    const agentData = newStatus === 'in-progress' ? { 
      agentId: currentUserId, 
      agentName: currentUserName 
    } : {};

    const success = await storageService.updateRequestStatus(id, newStatus, agentData);
    if (success) refreshData(true);
    setIsSyncing(false);
  }, [currentUserId, currentUserName, refreshData]);

  const activeRequestsForUser = useMemo(() => 
    requests.filter(r => r.userId === currentUserId && (r.status === 'waiting' || r.status === 'in-progress'))
  , [requests, currentUserId]);

  const getQueuePosition = useCallback((id: string) => {
    const waitingList = requests
      .filter(r => r.status === 'waiting')
      .sort((a, b) => Number(a.createdAt) - Number(b.createdAt));
    return waitingList.findIndex(r => r.id === id) + 1;
  }, [requests]);

  if (!isTeamsReady) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-gray-50">
        <Loader2 className="animate-spin text-[#5b5fc7]" size={40} />
      </div>
    );
  }

  return (
    <Layout 
      role={role} 
      onSwitchRole={() => setRole(role === 'user' ? 'agent' : 'user')}
      onOpenHelp={() => setIsHelpOpen(true)}
    >
      <div className="relative min-h-full pb-20">
        <div className="fixed bottom-6 right-6 z-50 flex items-center space-x-3 bg-white px-5 py-3 rounded-full shadow-2xl border border-gray-100 text-[11px] font-black group transition-all">
          <div className="relative">
            {lastSyncStatus === 'online' ? <Wifi size={14} className="text-emerald-500" /> : <WifiOff size={14} className="text-red-500" />}
            {isSyncing && <Activity size={10} className="absolute -top-1 -right-1 text-indigo-500 animate-pulse" />}
          </div>
          <span className="text-gray-400 uppercase tracking-widest">
            {isSyncing ? 'Sincronizando' : `Refresco en ${countdown}s`}
          </span>
          <button onClick={() => refreshData()} className="p-1.5 hover:bg-gray-100 rounded-full">
            <RefreshCw size={12} className="text-indigo-400" />
          </button>
        </div>

        {role === 'agent' ? (
          <AgentDashboard 
            requests={requests} 
            stats={stats} 
            onUpdateStatus={handleUpdateStatus} 
          />
        ) : (
          <UserRequestView 
            activeRequests={activeRequestsForUser}
            queuePosition={getQueuePosition}
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
