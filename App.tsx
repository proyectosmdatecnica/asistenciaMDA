
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Layout from './components/Layout';
import AgentDashboard from './components/AgentDashboard';
import UserRequestView from './components/UserRequestView';
import { SupportRequest, QueueStats, AppRole } from './types';
import { storageService } from './services/dataService';
import { Loader2, RefreshCw, Wifi, WifiOff } from 'lucide-react';

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
  
  const prevWaitingCount = useRef(0);

  const refreshData = useCallback(async (silent = false) => {
    if (!silent) setIsSyncing(true);
    try {
      const data = await storageService.fetchAllRequests();
      
      // Notificación sonora si entra alguien nuevo a la cola (solo para agentes)
      if (role === 'agent') {
        const currentWaiting = data.filter(r => r.status === 'waiting').length;
        if (currentWaiting > prevWaitingCount.current) {
          // Sonido sutil de notificación
          const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2358/2358-preview.mp3');
          audio.play().catch(() => console.log("Reproducción bloqueada por navegador"));
        }
        prevWaitingCount.current = currentWaiting;
      }

      setRequests(data);
      setLastSyncStatus('online');
      setCountdown(15);
    } catch (e) {
      console.error("Error de sincronización:", e);
      setLastSyncStatus('offline');
    } finally {
      if (!silent) setIsSyncing(false);
    }
  }, [role]);

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
        console.warn("Contexto de Teams no disponible.");
      } finally {
        setIsTeamsReady(true);
        refreshData();
      }
    };
    init();
  }, [refreshData]);

  // Auto-refresh cada 15 segundos
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
        return acc + (end - curr.createdAt);
      }, 0);
      avgMins = Math.max(2, Math.round((totalWait / completed.length) / 60000));
    }

    return {
      averageWaitTime: avgMins,
      completedToday: completed.length,
      activeRequests: active.length
    };
  }, [requests]);

  const handleCreateRequest = useCallback(async (data: Partial<SupportRequest>) => {
    const newRequest: SupportRequest = {
      id: `T-${Math.floor(1000 + Math.random() * 9000)}`,
      userId: currentUserId,
      userName: currentUserName,
      subject: data.subject || '',
      description: data.description || '',
      status: 'waiting',
      createdAt: Date.now(),
      priority: data.priority || 'medium',
      aiSummary: data.aiSummary,
      category: data.category
    };
    
    setIsSyncing(true);
    const success = await storageService.saveRequest(newRequest);
    if (success) {
      await refreshData(true);
    }
    setIsSyncing(false);
  }, [currentUserId, currentUserName, refreshData]);

  const handleUpdateStatus = useCallback(async (id: string, newStatus: SupportRequest['status']) => {
    setIsSyncing(true);
    const success = await storageService.updateRequestStatus(id, newStatus);
    if (success) {
      await refreshData(true);
    }
    setIsSyncing(false);
  }, [refreshData]);

  const activeRequestForUser = useMemo(() => 
    requests.find(r => r.userId === currentUserId && (r.status === 'waiting' || r.status === 'in-progress')) || null
  , [requests, currentUserId]);

  const queuePosition = useMemo(() => {
    if (!activeRequestForUser || activeRequestForUser.status !== 'waiting') return 0;
    const waitingList = requests
      .filter(r => r.status === 'waiting')
      .sort((a, b) => a.createdAt - b.createdAt);
    return waitingList.findIndex(r => r.id === activeRequestForUser.id) + 1;
  }, [requests, activeRequestForUser]);

  if (!isTeamsReady) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="animate-spin text-[#5b5fc7] mx-auto mb-4" size={40} />
          <p className="text-gray-500 font-bold">Iniciando Hub de Soporte...</p>
        </div>
      </div>
    );
  }

  return (
    <Layout role={role} onSwitchRole={() => setRole(role === 'user' ? 'agent' : 'user')}>
      <div className="relative">
        {/* Indicador de Sincronización Flotante */}
        <div className="fixed bottom-6 right-6 z-50 flex items-center space-x-2 bg-white px-4 py-2 rounded-full shadow-lg border border-gray-100 text-[10px] font-bold">
          {lastSyncStatus === 'online' ? (
            <Wifi size={12} className="text-emerald-500" />
          ) : (
            <WifiOff size={12} className="text-red-500" />
          )}
          <span className="text-gray-400 uppercase tracking-widest">
            {isSyncing ? 'Sincronizando...' : `Actualiza en ${countdown}s`}
          </span>
          {!isSyncing && (
            <button onClick={() => refreshData()} className="p-1 hover:bg-gray-100 rounded-full transition-colors">
              <RefreshCw size={10} className="text-gray-400" />
            </button>
          )}
        </div>

        {role === 'agent' ? (
          <AgentDashboard 
            requests={requests} 
            stats={stats} 
            onUpdateStatus={handleUpdateStatus} 
          />
        ) : (
          <UserRequestView 
            activeRequest={activeRequestForUser}
            queuePosition={queuePosition}
            averageWaitTime={stats.averageWaitTime}
            onSubmit={handleCreateRequest}
            onCancel={(id) => handleUpdateStatus(id, 'cancelled')}
          />
        )}
      </div>
    </Layout>
  );
};

export default App;
