import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Layout from './components/Layout';
import AgentDashboard from './components/AgentDashboard';
import UserRequestView from './components/UserRequestView';
import HelpModal from './components/HelpModal';
import { SupportRequest, QueueStats, AppRole, AuthorizedAgent } from './types';
import { storageService } from './services/dataService';
import { Loader2, RefreshCw, Wifi, WifiOff, Activity } from 'lucide-react';

const App: React.FC = () => {
  const [role, setRole] = useState<AppRole>('user');
  const [requests, setRequests] = useState<SupportRequest[]>([]);
  const [authorizedAgents, setAuthorizedAgents] = useState<string[]>([]);
  const [authorizedAgentDetails, setAuthorizedAgentDetails] = useState<AuthorizedAgent[]>([]);
  const [currentUserId, setCurrentUserId] = useState('user-guest');
  const [currentUserName, setCurrentUserName] = useState('Usuario Invitado');
  const [isTeamsReady, setIsTeamsReady] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncStatus, setLastSyncStatus] = useState<'online' | 'offline'>('online');
  const [countdown, setCountdown] = useState(15);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [manualEmailRequired, setManualEmailRequired] = useState(false);
  const [manualEmail, setManualEmail] = useState('');
  const [manualEmailError, setManualEmailError] = useState('');
  
  const prevWaitingCount = useRef(0);

  const refreshData = useCallback(async (silent = false) => {
    if (!silent) setIsSyncing(true);
    try {
      const [data, agents] = await Promise.all([
        storageService.fetchAllRequests(),
        storageService.fetchAgents()
      ]);
      let agentDetails: AuthorizedAgent[] = [];
      try {
        agentDetails = await storageService.fetchAgentDetails();
      } catch (e) {
        agentDetails = [];
      }
      
      // include any local fallback agent stored in localStorage
      const localAgent = (localStorage.getItem('localAgentEmail') || '').toLowerCase();
      const mergedAgents = Array.isArray(agents) ? [...agents.map((a:any) => String(a).toLowerCase())] : [];
      if (localAgent && !mergedAgents.includes(localAgent)) mergedAgents.push(localAgent);
      setAuthorizedAgents(mergedAgents);
      setAuthorizedAgentDetails(agentDetails);
      console.debug('[app] fetched authorizedAgents:', agents);
      console.debug('[app] currentUserId in refreshData:', currentUserId);
      setRequests(data);
      setLastSyncStatus('online');
      setCountdown(15);

      if (mergedAgents.some((a:string) => a.toLowerCase() === currentUserId.toLowerCase())) {
        setRole('agent');
      } else if (role === 'agent') {
        // stay as agent if already agent and no data yet
      } else {
        setRole('user');
      }

      if (role === 'agent') {
        const currentWaiting = data.filter(r => r.status === 'waiting').length;
        if (currentWaiting > prevWaitingCount.current) {
          const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2358/2358-preview.mp3');
          audio.volume = 0.4;
          audio.play().catch(() => {});
        }
        prevWaitingCount.current = currentWaiting;
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
        console.debug('[app] microsoftTeams available?', !!teams);
        if (teams) {
          try {
            await teams.app.initialize();
            const context = await teams.app.getContext();
            console.debug('[app] teams context:', context);
            console.debug('[app] host:', context?.app?.host); // Log if it's web or desktop

            // Try multiple fallbacks for identifying the user in different hosts (desktop/web)
            const fallbackEmail = context?.user?.userPrincipalName || context?.user?.loginHint || context?.user?.email || context?.user?.upn;
            const fallbackId = context?.user?.id || context?.user?.userObjectId || context?.user?.userId;
            let candidate = String(fallbackEmail || fallbackId || '').toLowerCase();

            // Force Graph lookup if we have Teams auth available (especially for web guest mismatch)
            let token;
            try {
              token = await teams.authentication.getAuthToken({ silent: true, resources: ['https://graph.microsoft.com'] });
            } catch (silentErr) {
              console.debug('[app] silent auth failed, trying interactive', silentErr);
              try {
                token = await teams.authentication.getAuthToken({ silent: false, resources: ['https://graph.microsoft.com'] });
              } catch (interactiveErr) {
                console.debug('[app] interactive auth also failed', interactiveErr);
                token = null;
              }
            }
            if (token) {
              const graphRes = await fetch('https://graph.microsoft.com/v1.0/me', {
                headers: { Authorization: `Bearer ${token}` }
              });
              if (graphRes.ok) {
                const me = await graphRes.json();
                if (me && me.userPrincipalName) {
                  candidate = String(me.userPrincipalName).toLowerCase();
                  setCurrentUserName(me.displayName || candidate);
                  console.debug('[app] got user from Graph /me:', candidate);
                }
              } else {
                const errText = await graphRes.text();
                console.debug('[app] Graph /me failed', graphRes.status, errText);
              }
            }

            if (candidate && candidate !== 'undefined' && candidate !== 'null' && candidate !== 'user-guest') {
              setCurrentUserId(candidate);
              if (!currentUserName || currentUserName === 'Usuario Invitado') {
                setCurrentUserName(context?.user?.displayName || candidate);
              }
              setManualEmailRequired(false);
              console.debug('[app] set currentUserId:', candidate);
            } else {
              console.debug('[app] no usable user identity in context, requiring manual email');
              setManualEmailRequired(true);
            }
          } catch (e) {
            console.debug('[app] teams init/getContext failed', e);
            setManualEmailRequired(true);
          }
        }
      } catch (e) {
        console.error("Teams Init Error", e);
      } finally {
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

  // Ensure role is recalculated whenever current user or authorized agents list changes
  useEffect(() => {
    const normalized = currentUserId.toLowerCase();
    const localAgentEmail = (localStorage.getItem('localAgentEmail') || '').toLowerCase();
    const isAgent = authorizedAgents.some((a)=> a.toLowerCase() === normalized || a.toLowerCase() === localAgentEmail);
    setRole(isAgent ? 'agent' : 'user');
  }, [authorizedAgents, currentUserId]);

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
    // Calculamos el timestamp del inicio del día de hoy (medianoche)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startOfToday = today.getTime();

    const completed = requests.filter(r => r.status === 'completed');
    
    // Filtrar solo los completados que ocurrieron hoy (reinicio diario)
    const completedToday = completed.filter(r => r.completedAt && Number(r.completedAt) >= startOfToday);
    const completedTodayCount = completedToday.length;

    const active = requests.filter(r => r.status === 'waiting' || r.status === 'in-progress' || r.status === 'paused');
    
    let avgMins = 5;
    if (completedTodayCount > 0) {
      const totalWait = completedToday.reduce((acc, curr) => acc + (Number(curr.startedAt || curr.completedAt || Date.now()) - Number(curr.createdAt)), 0);
      avgMins = Math.max(2, Math.round((totalWait / completedTodayCount) / 60000));
    }
    
    return { 
      averageWaitTime: avgMins, 
      completedToday: completedTodayCount, 
      activeRequests: active.length 
    };
  }, [requests]);

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

  const handleUpdateStatus = useCallback(async (id: string, newStatus: SupportRequest['status']) => {
    setIsSyncing(true);
    const agentData = (newStatus === 'in-progress' || newStatus === 'paused') ? { agentId: currentUserId, agentName: currentUserName } : {};
    if (await storageService.updateRequestStatus(id, newStatus, agentData)) refreshData(true);
    setIsSyncing(false);
  }, [currentUserId, currentUserName, refreshData]);

  const handleAgentManagement = async (action: 'add' | 'remove', email: string) => {
    setIsSyncing(true);
    if (action === 'add') await storageService.addAgent(email, true);
    else await storageService.removeAgent(email);
    await refreshData();
    setIsSyncing(false);
  };

  const handleToggleAgentVisibility = async (email: string, showOnUserDashboard: boolean) => {
    setIsSyncing(true);
    await storageService.setAgentDashboardVisibility(email, showOnUserDashboard);
    await refreshData(true);
    setIsSyncing(false);
  };

  const handleAgentRegistered = async (email: string) => {
    // Add agent on server and switch UI role locally
    setIsSyncing(true);
    try {
      const res = await storageService.addAgent(email);
      if (res && res.status === 201) {
        // created active
        setRole('agent');
      } else if (res && res.status === 200) {
        setRole('agent');
      } else {
        // pending (202) or similar
        // don't switch role yet; inform user
        console.debug('Registro en estado pendiente', res);
        alert('Solicitud enviada. Un agente autorizado deberá aprobar su acceso.');
      }
      await refreshData();
    } catch (e) {
      console.error('Error registering agent locally', e);
    } finally {
      setIsSyncing(false);
    }
  };

  // Show any request belonging to the user except completed/cancelled
  const activeRequestsForUser = useMemo(() => 
    requests.filter(r => r.userId === currentUserId && r.status !== 'completed' && r.status !== 'cancelled')
  , [requests, currentUserId]);

  const agentNameByEmail = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of requests) {
      if (r.agentId && r.agentName) {
        map.set(String(r.agentId).toLowerCase(), r.agentName);
      }
    }
    return map;
  }, [requests]);

  const visibleAgentsForUser = useMemo(() => {
    const toName = (email: string) => {
      const found = agentNameByEmail.get(email.toLowerCase());
      if (found) return found;
      const localPart = email.split('@')[0] || email;
      return localPart
        .split(/[._-]+/)
        .filter(Boolean)
        .map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
        .join(' ');
    };

    return authorizedAgentDetails
      .filter(a => a.showOnUserDashboard)
      .map(a => ({ name: toName(a.email), email: a.email }));
  }, [authorizedAgentDetails, agentNameByEmail]);

  if (!isTeamsReady) return <div className="h-screen w-full flex items-center justify-center bg-gray-50"><Loader2 className="animate-spin text-[#5b5fc7]" size={40} /></div>;

  return (
    <Layout role={role} onSwitchRole={() => setRole(role === 'user' ? 'agent' : 'user')} onOpenHelp={() => setIsHelpOpen(true)} onAgentRegister={handleAgentRegistered}>
      <div className="relative min-h-full pb-20">
        <div className="fixed bottom-6 right-6 z-50 flex items-center space-x-3 bg-white px-5 py-3 rounded-full shadow-2xl border border-gray-100 text-[11px] font-black group transition-all">
          <div className="relative">
            {lastSyncStatus === 'online' ? <Wifi size={14} className="text-emerald-500" /> : <WifiOff size={14} className="text-red-500" />}
            {isSyncing && <Activity size={10} className="absolute -top-1 -right-1 text-indigo-500 animate-pulse" />}
          </div>
          <span className="text-gray-400 uppercase tracking-widest">{isSyncing ? 'Sincronizando' : `Refresco en ${countdown}s`}</span>
          <button onClick={() => refreshData()} className="p-1.5 hover:bg-gray-100 rounded-full"><RefreshCw size={12} className="text-indigo-400" /></button>
        </div>

        {manualEmailRequired ? (
          <div className="max-w-lg mx-auto p-6 mt-16 bg-white rounded-xl shadow-md border border-gray-200">
            <h2 className="text-lg font-bold mb-3">Complete su correo electrónico</h2>
            <p className="text-sm text-gray-600 mb-4">No se pudo determinar automáticamente quién está usando Teams Web. Ingrese su e-mail para continuar.</p>
            <input
              type="email"
              value={manualEmail}
              onChange={(e) => { setManualEmail(e.target.value); setManualEmailError(''); }}
              className="w-full border rounded px-3 py-2 mb-2"
              placeholder="usuario@dominio.com"
            />
            {manualEmailError && <p className="text-sm text-red-600 mb-2">{manualEmailError}</p>}
            <button
              onClick={async () => {
                const email = manualEmail.trim().toLowerCase();
                if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                  setManualEmailError('Por favor ingrese un e-mail válido');
                  return;
                }
                setCurrentUserId(email);
                setCurrentUserName(email);
                setManualEmailRequired(false);
                await refreshData(true);
              }}
              className="w-full bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700"
            >Usar este correo</button>
          </div>
        ) : role === 'agent' ? (
          <AgentDashboard 
            requests={requests} 
            stats={stats} 
            onUpdateStatus={handleUpdateStatus}
            agents={authorizedAgents}
            agentDetails={authorizedAgentDetails}
            onManageAgent={handleAgentManagement}
            onToggleAgentVisibility={handleToggleAgentVisibility}
            onRefreshAgents={refreshData}
            currentUserId={currentUserId}
            onCreateTicket={handleCreateOrUpdate}
          />
        ) : (
          <UserRequestView 
            activeRequests={activeRequestsForUser}
            queuePosition={(id) => requests.filter(r => r.status === 'waiting').sort((a,b) => Number(a.createdAt)-Number(b.createdAt)).findIndex(r => r.id === id) + 1}
            averageWaitTime={stats.averageWaitTime}
            visibleAgents={visibleAgentsForUser}
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