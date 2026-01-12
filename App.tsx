
import React, { useState, useEffect, useCallback } from 'react';
import Layout from './components/Layout';
import AgentDashboard from './components/AgentDashboard';
import UserRequestView from './components/UserRequestView';
import { SupportRequest, QueueStats, AppRole } from './types';
import { storageService } from './services/dataService';
import { Loader2, CloudCheck, Database, Server } from 'lucide-react';

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
  const [stats, setStats] = useState<QueueStats>({
    averageWaitTime: 5,
    activeRequests: 0,
    completedToday: 0
  });

  const refreshData = useCallback(async (silent = false) => {
    if (!silent) setIsSyncing(true);
    try {
      const data = await storageService.fetchAllRequests();
      setRequests(data);
      setLastSyncStatus('online');
      localStorage.setItem('teams_support_cache', JSON.stringify(data));
    } catch (e) {
      setLastSyncStatus('offline');
    } finally {
      if (!silent) setIsSyncing(false);
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      await refreshData();
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
            }
          }
        }
      } catch (e) {
        console.warn("Teams SDK no detectado.");
      } finally {
        setIsTeamsReady(true);
      }
    };
    init();
  }, [refreshData]);

  useEffect(() => {
    const interval = setInterval(() => refreshData(true), 10000); 
    return () => clearInterval(interval);
  }, [refreshData]);

  useEffect(() => {
    const completed = requests.filter(r => r.status === 'completed');
    const active = requests.filter(r => r.status === 'waiting' || r.status === 'in-progress');
    
    let avgMins = 5;
    if (completed.length > 0) {
      const totalWait = completed.reduce((acc, curr) => {
        const start = curr.startedAt || curr.createdAt;
        return acc + (start - curr.createdAt);
      }, 0);
      avgMins = Math.max(1, Math.round((totalWait / completed.length) / 60000));
    }

    setStats({
      averageWaitTime: avgMins,
      completedToday: completed.length,
      activeRequests: active.length
    });
  }, [requests]);

  const handleCreateRequest = useCallback(async (data: Partial<SupportRequest>) => {
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
    
    setIsSyncing(true);
    const success = await storageService.saveRequest(newRequest);
    if (success) {
      await refreshData(true);
    } else {
      const updated = [...requests, newRequest];
      setRequests(updated);
      localStorage.setItem('teams_support_cache', JSON.stringify(updated));
    }
    setIsSyncing(false);
  }, [currentUserId, currentUserName, requests, refreshData]);

  const handleUpdateStatus = useCallback(async (id: string, newStatus: SupportRequest['status']) => {
    setIsSyncing(true);
    const success = await storageService.updateRequestStatus(id, newStatus);
    if (success) {
      await refreshData(true);
    } else {
      const updated = requests.map(r => r.id === id ? { ...r, status: newStatus } : r);
      setRequests(updated);
    }
    setIsSyncing(false);
  }, [requests, refreshData]);

  if (!isTeamsReady) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-[#f5f5f5]">
        <Loader2 className="animate-spin text-[#5b5fc7] mb-4" size={48} />
        <p className="text-gray-500 font-bold tracking-tight">Cargando Sistema de Soporte...</p>
      </div>
    );
  }

  return (
    <Layout role={role} onSwitchRole={() => setRole(role === 'user' ? 'agent' : 'user')}>
      {/* Estado de Sincronización Serverless */}
      <div className="fixed bottom-6 right-6 z-50">
        <div className={`flex items-center space-x-2 px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-2xl transition-all border bg-white ${
          lastSyncStatus === 'online' ? 'text-emerald-600 border-emerald-100' : 'text-gray-400 border-gray-100'
        }`}>
          {lastSyncStatus === 'online' ? <Server size={14} /> : <Database size={14} />}
          <span>{lastSyncStatus === 'online' ? 'API Azure: Conectada' : 'Modo Local'}</span>
          {isSyncing && <Loader2 size={12} className="animate-spin ml-2" />}
        </div>
      </div>

      {role === 'agent' ? (
        <AgentDashboard requests={requests} stats={stats} onUpdateStatus={handleUpdateStatus} />
      ) : (
        <UserRequestView 
          activeRequest={requests.find(r => r.userId === currentUserId && (r.status === 'waiting' || r.status === 'in-progress')) || null}
          queuePosition={requests.filter(r => r.status === 'waiting' && r.createdAt <= (requests.find(u => u.userId === currentUserId)?.createdAt || 0)).length}
          averageWaitTime={stats.averageWaitTime}
          onSubmit={handleCreateRequest}
          onCancel={(id) => handleUpdateStatus(id, 'cancelled')}
        />
      )}
    </Layout>
  );
};

export default App;
