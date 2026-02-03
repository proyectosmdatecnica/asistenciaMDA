
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Layout from './components/Layout';
import AgentDashboard from './components/AgentDashboard';
import UserRequestView from './components/UserRequestView';
import HelpModal from './components/HelpModal';
import { SupportRequest, QueueStats, AppRole } from './types';
import { storageService } from './services/dataService';
import { Loader2, RefreshCw, Wifi, WifiOff, Activity, ShieldAlert, CheckCircle2, AlertCircle } from 'lucide-react';

const App: React.FC = () => {
  const [role, setRole] = useState<AppRole>('user');
  const [requests, setRequests] = useState<SupportRequest[]>([]);
  const [authorizedAgents, setAuthorizedAgents] = useState<string[]>([]);
  const [currentUserId, setCurrentUserId] = useState('user-guest');
  const [currentUserName, setCurrentUserName] = useState('Usuario Invitado');
  const [isTeamsReady, setIsTeamsReady] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [lastSyncStatus, setLastSyncStatus] = useState<'online' | 'offline'>('online');
  const [countdown, setCountdown] = useState(15);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  
  const prevWaitingCount = useRef(0);

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

      if (agents.some(a => a.toLowerCase() === currentUserId.toLowerCase())) {
        setRole('agent');
      }
    } catch (e: any) {
      console.error("Sync Error:", e);
      setLastSyncStatus('offline');
    } finally {
      if (!silent) setIsSyncing(false);
      setIsInitialLoading(false);
    }
  }, [currentUserId]);

  useEffect(() => {
    const initTeams = async () => {
      const sdkTimeout = setTimeout(() => {
        if (!isTeamsReady) {
          console.warn("Teams SDK Init Timeout - Proceeding as guest");
          setIsTeamsReady(true);
        }
      }, 3000);

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
        }
      } catch (e) {
        console.error("Teams Init Error:", e);
      } finally {
        clearTimeout(sdkTimeout);
        setIsTeamsReady(true);
      }
    };
    initTeams();
  }, []);

  useEffect(() => {
    if (isTeamsReady) {
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

  const handleCreateOrUpdate = useCallback(async (data: Partial<SupportRequest>, id?: string) => {
    setIsSyncing(true);
    try {
      if (id) {
        await storageService.updateRequestStatus(id, 'waiting', {
          subject: data.subject,
          description: data.description,
          priority: data.priority
        });
      } else {
        await storageService.saveRequest({ ...data, userId: currentUserId, userName: currentUserName });
      }
      refreshData(true);
    } catch (e: any) {
      window.alert("No se pudo guardar la solicitud.");
    } finally {
      setIsSyncing(false);
    }
  }, [currentUserId, currentUserName, refreshData]);

  const handleUpdateStatus = useCallback(async (id: string, newStatus: SupportRequest['status']) => {
    setIsSyncing(true);
    try {
      const agentData = newStatus === 'in-progress' ? { agentId: currentUserId, agentName: currentUserName } : {};
      await storageService.updateRequestStatus(id, newStatus, agentData);
      refreshData(true);
    } catch (e: any) {
      window.alert("Error al actualizar el ticket.");
    } finally {
      setIsSyncing(false);
    }
  }, [currentUserId, currentUserName, refreshData]);

  const handleAgentManagement = async (action: 'add' | 'remove', email: string) => {
    const targetEmail = email || currentUserId;
    if (action === 'add') {
      setIsRegistering(true);
      try {
        const success = await storageService.addAgent(targetEmail);
        if (success) {
          setRole('agent');
          await refreshData();
          window.alert("¡Registro exitoso! Ahora eres agente de TI.");
        }
      } catch (err: any) {
        window.alert("No se pudo registrar el agente.");
      } finally {
        setIsRegistering(false);
      }
    } else {
      setIsSyncing(true);
      try {
        await storageService.removeAgent(targetEmail);
        await refreshData();
      } catch (e: any) {
        window.alert("Error al eliminar agente.");
      } finally {
        setIsSyncing(false);
      }
    }
  };

  const activeRequestsForUser = useMemo(() => 
    requests.filter(r => r.userId === currentUserId && (r.status === 'waiting' || r.status === 'in-progress'))
  , [requests, currentUserId]);

  if (!isTeamsReady) return (
    <div className="h-screen w-full flex flex-col items-center justify-center bg-[#f5f5f5] space-y-4">
      <Loader2 className="animate-spin text-[#5b5fc7]" size={40} />
      <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Iniciando aplicación IT...</p>
    </div>
  );

  return (
    <Layout role={role} onSwitchRole={() => setRole(role === 'user' ? 'agent' : 'user')} onOpenHelp={() => setIsHelpOpen(true)}>
      <div className="relative min-h-full pb-20">
        
        {/* Banner de error simplificado */}
        {lastSyncStatus === 'offline' && (
          <div className="max-w-4xl mx-auto mb-8 animate-in slide-in-from-top-4">
            <div className="bg-red-600 text-white px-6 py-4 rounded-[1.5rem] shadow-2xl flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <AlertCircle size={20} />
                <span className="text-xs font-black uppercase tracking-widest">Error de sincronización con el servidor</span>
              </div>
              <button onClick={() => refreshData()} className="text-[10px] font-black uppercase bg-white/20 px-4 py-2 rounded-xl hover:bg-white/30 transition-all">Reintentar</button>
            </div>
          </div>
        )}

        {/* Banner de configuración inicial si no hay agentes */}
        {authorizedAgents.length === 0 && !isInitialLoading && role === 'user' && lastSyncStatus === 'online' && (
          <div className="max-w-4xl mx-auto mb-8 animate-in slide-in-from-top-4">
            <div className="bg-amber-600 text-white p-6 rounded-[2rem] shadow-xl flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="bg-white/20 p-3 rounded-2xl">
                  {isRegistering ? <Loader2 size={24} className="animate-spin" /> : <ShieldAlert size={24} />}
                </div>
                <div>
                  <h4 className="font-black text-sm uppercase tracking-widest">Configuración Requerida</h4>
                  <p className="text-xs font-bold opacity-80">
                    {isRegistering ? 'Procesando registro...' : 'No hay agentes de TI registrados en el sistema.'}
                  </p>
                </div>
              </div>
              <button 
                disabled={isRegistering}
                onClick={() => handleAgentManagement('add', currentUserId)}
                className={`bg-white text-amber-700 px-6 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all shadow-lg flex items-center space-x-2 ${isRegistering ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-100 active:scale-95'}`}
              >
                {isRegistering ? <Loader2 size={12} className="animate-spin" /> : <ShieldAlert size={12} />}
                <span>{isRegistering ? 'Registrarme como Agente' : 'Registrarme como Agente'}</span>
              </button>
            </div>
          </div>
        )}

        <div className="fixed bottom-6 right-6 z-50 flex items-center space-x-3 bg-white px-5 py-3 rounded-full shadow-2xl border border-gray-100 text-[11px] font-black">
          <div className="relative">
            {lastSyncStatus === 'online' ? <Wifi size={14} className="text-emerald-500" /> : <WifiOff size={14} className="text-red-500" />}
            {(isSyncing || isRegistering) && <Activity size={10} className="absolute -top-1 -right-1 text-indigo-500 animate-pulse" />}
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
            isLoading={isInitialLoading}
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
