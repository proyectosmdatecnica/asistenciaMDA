
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Layout from './components/Layout';
import AgentDashboard from './components/AgentDashboard';
import UserRequestView from './components/UserRequestView';
import { SupportRequest, QueueStats, AppRole } from './types';
import { storageService } from './services/dataService';
import { Loader2, Database, Server, Wifi } from 'lucide-react';

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

  const refreshData = useCallback(async (silent = false) => {
    if (!silent) setIsSyncing(true);
    try {
      const data = await storageService.fetchAllRequests();
      setRequests(data);
      setLastSyncStatus('online');
    } catch (e) {
      console.error("Error de sincronización:", e);
      setLastSyncStatus('offline');
    } finally {
      if (!silent) setIsSyncing(false);
    }
  }, []);

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
        console.warn("Contexto de Teams no disponible, modo navegador activado.");
      } finally {
        setIsTeamsReady(true);
        refreshData();
      }
    };
    init();
  }, [refreshData]);

  useEffect(() => {
    // Intervalo de refresco más corto para sensación de tiempo real (10s)
    const interval = setInterval(() => refreshData(true), 10000); 
    return () => clearInterval(interval);
  }, [refreshData]);

  const stats = useMemo<QueueStats>(() => {
    const completed = requests.filter(r => r.status === 'completed');
    const active = requests.filter(r => r.status === 'waiting' || r.status === 'in-progress');
    
    let avgMins = 5; // Valor base
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
      aiSummary: data.aiSummary
    };
    
    setIsSyncing(true);
    // Optimistic update
    setRequests(prev => [newRequest, ...prev]);
    
    const success = await storageService.saveRequest(newRequest);
    if (!success) {
      alert("No se pudo guardar el ticket. Por favor, intenta de nuevo.");
      refreshData();
    }
    setIsSyncing(false);
  }, [currentUserId, currentUserName, refreshData]);

  const handleUpdateStatus = useCallback(async (id: string, newStatus: SupportRequest['status']) => {
    setIsSyncing(true);
    // Optimistic update
    setRequests(prev => prev.map(r => r.id === id ? { ...r, status: newStatus } : r));
    
    const success = await storageService.updateRequestStatus(id, newStatus);
    if (!success) {
      console.error("Error al actualizar estado en servidor");
      refreshData();
    }
    setIsSyncing(false);
  }, [refreshData]);

  if (!isTeamsReady) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-slate-50">
        <Loader2 className="animate-spin text-[#5b5fc7] mb-4" size={48} />
        <p className="text-slate-500 font-bold animate-pulse">Iniciando Microsoft Teams...</p>
      </div>
    );
  }

  return (
    <Layout role={role} onSwitchRole={() => setRole(role === 'user' ? 'agent' : 'user')}>
      {/* Indicador de Conectividad Estilo Teams */}
      <div className="fixed bottom-6 left-24 z-50">
        <div className={`flex items-center space-x-2 px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-wider shadow-lg border bg-white/80 backdrop-blur-sm transition-all ${
          lastSyncStatus === 'online' ? 'text-emerald-600 border-emerald-100' : 'text-rose-500 border-rose-100'
        }`}>
          <div className={`w-1.5 h-1.5 rounded-full ${lastSyncStatus === 'online' ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
          <span>{lastSyncStatus === 'online' ? 'Conexión Directa' : 'Sin Conexión'}</span>
          {isSyncing && <Loader2 size={10} className="animate-spin ml-1 opacity-50" />}
        </div>
      </div>

      {role === 'agent' ? (
        <AgentDashboard requests={requests} stats={stats} onUpdateStatus={handleUpdateStatus} />
      ) : (
        <UserRequestView 
          activeRequest={requests.find(r => r.userId === currentUserId && (r.status === 'waiting' || r.status === 'in-progress')) || null}
          queuePosition={requests.filter(r => r.status === 'waiting' && r.createdAt <= (requests.find(u => u.userId === currentUserId)?.createdAt || Date.now())).length}
          averageWaitTime={stats.averageWaitTime}
          onSubmit={handleCreateRequest}
          onCancel={(id) => handleUpdateStatus(id, 'cancelled')}
        />
      )}
    </Layout>
  );
};

export default App;
