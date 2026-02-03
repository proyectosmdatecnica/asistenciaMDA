
import React, { useState, useEffect, useMemo } from 'react';
import { SupportRequest, QueueStats } from '../types';
import { 
  Clock, CheckCircle, Search, History, ListFilter, Monitor, Cpu, Globe, Key, 
  Download, Zap, XCircle, RefreshCcw, ChevronDown, ChevronUp, MessageCircle, 
  User, LayoutGrid, List, Settings, Plus, Trash2, Activity, Users
} from 'lucide-react';

interface AgentDashboardProps {
  requests: SupportRequest[];
  stats: QueueStats;
  onUpdateStatus: (id: string, newStatus: SupportRequest['status']) => void;
  agents: string[];
  onManageAgent: (action: 'add' | 'remove', email: string) => void;
}

const AgentDashboard: React.FC<AgentDashboardProps> = ({ requests, stats, onUpdateStatus, agents, onManageAgent }) => {
  const [now, setNow] = useState(Date.now());
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'queue' | 'history' | 'settings'>('queue');
  const [viewMode, setViewMode] = useState<'standard' | 'compact'>('standard');
  const [expandedTickets, setExpandedTickets] = useState<Record<string, boolean>>({});
  const [newAgentEmail, setNewAgentEmail] = useState('');

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const openTeamsChat = (userId: string, ticketId: string) => {
    const message = encodeURIComponent(`Hola! Te contacto por el Ticket número ${ticketId}`);
    window.open(`https://teams.microsoft.com/l/chat/0/0?users=${userId}&message=${message}`, '_blank');
  };

  const filteredRequests = useMemo(() => requests.filter(r => 
    r.userName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.subject.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.id.toLowerCase().includes(searchTerm.toLowerCase())
  ), [requests, searchTerm]);

  const waiting = filteredRequests.filter(r => r.status === 'waiting').sort((a, b) => {
    const p = { high: 3, medium: 2, low: 1 };
    return p[b.priority] - p[a.priority] || a.createdAt - b.createdAt;
  });

  const inProgress = filteredRequests.filter(r => r.status === 'in-progress');
  const completed = filteredRequests.filter(r => r.status === 'completed' || r.status === 'cancelled');

  const getElapsedTime = (t: number) => {
    const s = Math.floor((now - t) / 1000);
    const m = Math.floor(s / 60);
    const remS = s % 60;
    return `${m}:${remS.toString().padStart(2, '0')}`;
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-12 animate-in fade-in">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
        {[
          { label: 'Espera promedio', val: `${stats.averageWaitTime}min`, icon: <Zap size={14}/>, color: 'text-emerald-600' },
          { label: 'En Espera', val: waiting.length, icon: <Clock size={14}/>, color: 'text-amber-600' },
          { label: 'En Proceso', val: inProgress.length, icon: <Activity size={14}/>, color: 'text-indigo-600' },
          { label: 'Resueltos Hoy', val: stats.completedToday, icon: <CheckCircle size={14}/>, color: 'text-emerald-600' }
        ].map((s, i) => (
          <div key={i} className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm flex flex-col justify-between">
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.15em] block mb-4">{s.label}</span>
            <div className="flex items-end justify-between">
              <p className="text-3xl font-black text-gray-900">{s.val}</p>
              <div className={`${s.color} opacity-30`}>{s.icon}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="bg-white p-2.5 rounded-[2rem] border border-gray-200 flex flex-wrap items-center justify-between gap-4 shadow-sm">
        <div className="flex bg-gray-50 p-1 rounded-2xl">
          <button onClick={() => setActiveTab('queue')} className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center space-x-2 ${activeTab === 'queue' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-400'}`}>
            <ListFilter size={14}/><span>Cola Activa</span>
          </button>
          <button onClick={() => setActiveTab('history')} className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center space-x-2 ${activeTab === 'history' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-400'}`}>
            <History size={14}/><span>Historial</span>
          </button>
          <button onClick={() => setActiveTab('settings')} className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center space-x-2 ${activeTab === 'settings' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-400'}`}>
            <Settings size={14}/><span>Configuración</span>
          </button>
        </div>
        
        <div className="flex items-center space-x-3 flex-1 max-w-md">
          <div className="flex items-center bg-gray-50 rounded-2xl px-5 py-2.5 w-full border border-gray-100 focus-within:bg-white focus-within:border-indigo-200 transition-all">
            <Search size={14} className="text-gray-400 mr-3" />
            <input type="text" placeholder="Buscar ticket o usuario..." className="bg-transparent border-none outline-none text-xs font-bold w-full text-gray-700" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
          </div>
          {activeTab === 'queue' && (
            <div className="flex bg-gray-100 p-1 rounded-xl shrink-0">
              <button onClick={() => setViewMode('standard')} className={`p-2 rounded-lg transition-all ${viewMode === 'standard' ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-400'}`} title="Vista Estándar"><List size={16}/></button>
              <button onClick={() => setViewMode('compact')} className={`p-2 rounded-lg transition-all ${viewMode === 'compact' ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-400'}`} title="Vista Grilla"><LayoutGrid size={16}/></button>
            </div>
          )}
        </div>
      </div>

      {activeTab === 'queue' ? (
        <div className={viewMode === 'compact' ? "grid grid-cols-1 md:grid-cols-3 gap-6 items-start" : "grid grid-cols-1 lg:grid-cols-2 gap-10 items-start"}>
          
          {/* En Atención */}
          <div className="space-y-4">
            <h3 className="text-[11px] font-black text-indigo-500 uppercase tracking-widest px-2">En Atención ({inProgress.length})</h3>
            {inProgress.map(req => (
              <div key={req.id} className="bg-white border-2 border-indigo-100 rounded-[2rem] p-5 shadow-lg animate-in slide-in-from-left-4">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white font-black">{req.userName.charAt(0)}</div>
                    <div>
                      <h4 className="text-xs font-black text-gray-900 leading-tight">{req.userName}</h4>
                      <p className="text-[9px] text-indigo-400 font-bold uppercase mt-1">Ticket {req.id}</p>
                    </div>
                  </div>
                  <button onClick={() => onUpdateStatus(req.id, 'completed')} className="bg-emerald-50 text-emerald-600 p-2 rounded-xl hover:bg-emerald-600 hover:text-white transition-all"><CheckCircle size={18}/></button>
                </div>
                <p className="text-[11px] font-black text-gray-700 line-clamp-2 mb-4 px-1">{req.subject}</p>
                <div className="flex items-center justify-between pt-4 border-t border-gray-50">
                  <span className="text-[10px] font-black text-indigo-500 bg-indigo-50 px-3 py-1 rounded-lg">{getElapsedTime(req.startedAt || req.createdAt)}</span>
                  <button onClick={() => openTeamsChat(req.userId, req.id)} className="text-[10px] font-black text-indigo-600 hover:bg-indigo-50 px-3 py-1 rounded-lg uppercase">Contactar</button>
                </div>
              </div>
            ))}
          </div>

          {/* En Espera */}
          <div className={viewMode === 'compact' ? "md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4" : "space-y-5"}>
            <h3 className="text-[11px] font-black text-amber-500 uppercase tracking-widest px-2 col-span-full">Lista de Espera ({waiting.length})</h3>
            {waiting.map(req => (
              <div key={req.id} className={`bg-white rounded-[2rem] p-5 border-2 animate-in slide-in-from-right-4 ${req.priority === 'high' ? 'border-red-100' : 'border-gray-50 shadow-sm'}`}>
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h4 className="text-xs font-black text-gray-900 mb-1">{req.userName}</h4>
                    <span className={`text-[8px] px-2 py-0.5 rounded font-black uppercase ${req.priority === 'high' ? 'bg-red-500 text-white' : 'bg-amber-100 text-amber-700'}`}>{req.priority}</span>
                  </div>
                  <button onClick={() => onUpdateStatus(req.id, 'in-progress')} className="bg-indigo-600 text-white text-[9px] font-black px-4 py-2 rounded-xl shadow-lg">TOMAR</button>
                </div>
                {req.aiSummary && (
                  <div className="bg-amber-50/50 p-3 rounded-xl mb-3">
                    <p className="text-[10px] text-amber-900 font-bold leading-snug">
                      <span className="text-amber-600 font-black uppercase mr-1">Resumen caso:</span>{req.aiSummary}
                    </p>
                  </div>
                )}
                {viewMode === 'standard' && <p className="text-[10px] text-gray-500 italic line-clamp-3">{req.description || "Sin detalles."}</p>}
              </div>
            ))}
          </div>
        </div>
      ) : activeTab === 'settings' ? (
        <div className="max-w-3xl mx-auto space-y-8 animate-in zoom-in-95">
          <div className="bg-white p-8 md:p-12 rounded-[3rem] border border-gray-100 shadow-2xl">
            <h3 className="text-xl font-black text-gray-900 mb-8 flex items-center space-x-3">
              <Settings className="text-indigo-600" /><span>Gestión de Agentes de TI</span>
            </h3>
            <div className="flex flex-col sm:flex-row gap-3 mb-10">
              <input type="email" placeholder="correo@empresa.com" className="flex-1 bg-gray-50 border-2 border-transparent focus:border-indigo-500 rounded-2xl px-6 py-4 outline-none font-bold text-sm" value={newAgentEmail} onChange={e => setNewAgentEmail(e.target.value)} />
              <button onClick={() => { if(newAgentEmail) { onManageAgent('add', newAgentEmail); setNewAgentEmail(''); }}} className="bg-indigo-600 text-white px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center space-x-2">
                <Plus size={16}/><span>Autorizar</span>
              </button>
            </div>
            <div className="space-y-3">
              {agents.map(email => (
                <div key={email} className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl border border-gray-100 group">
                  <span className="text-sm font-bold text-gray-700">{email}</span>
                  <button onClick={() => onManageAgent('remove', email)} className="text-red-400 hover:text-red-600 p-2 opacity-0 group-hover:opacity-100 transition-all"><Trash2 size={18}/></button>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        /* History Table */
        <div className="bg-white rounded-[2.5rem] border border-gray-100 overflow-hidden shadow-sm">
           <table className="w-full text-left text-xs border-collapse">
              <thead><tr className="bg-gray-50 border-b border-gray-100"><th className="p-6 font-black text-gray-400 uppercase text-[9px]">Usuario / Ticket</th><th className="p-6 font-black text-gray-400 uppercase text-[9px]">Asunto</th><th className="p-6 font-black text-gray-400 uppercase text-[9px]">Atendido por</th><th className="p-6 font-black text-gray-400 uppercase text-[9px]">Cierre</th></tr></thead>
              <tbody className="divide-y divide-gray-50">
                {completed.map(req => (
                  <tr key={req.id} className="hover:bg-indigo-50/10 transition-colors">
                    <td className="p-6"><p className="font-black text-gray-900">{req.userName}</p><p className="text-[10px] text-gray-400 font-mono">{req.id}</p></td>
                    <td className="p-6 font-bold text-gray-600 max-w-xs truncate">{req.subject}</td>
                    <td className="p-6 font-black text-gray-700">{req.agentName || 'N/A'}</td>
                    <td className="p-6 text-gray-400">{req.completedAt ? new Date(Number(req.completedAt)).toLocaleDateString() : '-'}</td>
                  </tr>
                ))}
              </tbody>
           </table>
        </div>
      )}
    </div>
  );
};

export default AgentDashboard;
