import React, { useState, useEffect, useMemo } from 'react';
import { SupportRequest, QueueStats } from '../types';
import { 
  Clock, CheckCircle, Search, History, ListFilter, Monitor, Cpu, Globe, Key, 
  Download, Zap, XCircle, RefreshCcw, ChevronDown, ChevronUp, MessageCircle, 
  User, LayoutGrid, List, Settings, Plus, Trash2, Activity, AlertCircle
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
  const [newAgentEmail, setNewAgentEmail] = useState('');

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const openTeamsChat = (userId: string, ticketId: string) => {
    const message = encodeURIComponent(`Hola! Te contacto por el Ticket numero ${ticketId}`);
    window.open(`https://teams.microsoft.com/l/chat/0/0?users=${userId}&message=${message}`, '_blank');
  };

  const filteredRequests = useMemo(() => requests.filter(r => 
    r.userName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.subject.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.id.toLowerCase().includes(searchTerm.toLowerCase())
  ), [requests, searchTerm]);

  const waiting = filteredRequests.filter(r => r.status === 'waiting').sort((a, b) => {
    const p = { urgent: 4, high: 3, medium: 2, low: 1 };
    return p[b.priority] - p[a.priority] || a.createdAt - b.createdAt;
  });

  const inProgress = filteredRequests.filter(r => r.status === 'in-progress');
  const completed = filteredRequests.filter(r => r.status === 'completed' || r.status === 'cancelled');

  const getElapsedTime = (t: number) => {
    const s = Math.floor((now - t) / 1000);
    return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-12 animate-in fade-in">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
        {[
          { label: 'Espera promedio', val: `${stats.averageWaitTime}min`, icon: <Zap size={14}/>, color: 'emerald' },
          { label: 'En Espera', val: waiting.length, icon: <Clock size={14}/>, color: 'amber' },
          { label: 'En Proceso', val: inProgress.length, icon: <Activity size={14}/>, color: 'indigo' },
          { label: 'Resueltos Hoy', val: stats.completedToday, icon: <CheckCircle size={14}/>, color: 'emerald' }
        ].map((s, i) => (
          <div key={i} className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">{s.label}</span>
            <p className="text-3xl font-black text-gray-900">{s.val}</p>
          </div>
        ))}
      </div>

      <div className="bg-white p-2.5 rounded-3xl border border-gray-200 flex flex-wrap items-center justify-between gap-4">
        <div className="flex bg-gray-50 p-1 rounded-2xl">
          <button onClick={() => setActiveTab('queue')} className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'queue' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-400'}`}>COLA</button>
          <button onClick={() => setActiveTab('history')} className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'history' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-400'}`}>HISTORIAL</button>
          <button onClick={() => setActiveTab('settings')} className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'settings' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-400'}`}>CONFIG</button>
        </div>
        
        <div className="flex items-center space-x-3 flex-1 max-w-md">
          <div className="flex items-center bg-gray-50 rounded-2xl px-4 py-2 w-full border border-gray-100">
            <Search size={14} className="text-gray-400 mr-2" />
            <input type="text" placeholder="Filtrar por nombre, asunto o ID..." className="bg-transparent border-none outline-none text-xs font-bold w-full" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
          </div>
        </div>
      </div>

      {activeTab === 'queue' ? (
        <div className={viewMode === 'compact' ? "grid grid-cols-1 md:grid-cols-3 gap-6" : "grid grid-cols-1 lg:grid-cols-2 gap-8"}>
          <div className="space-y-5">
            <h3 className="text-[10px] font-black text-indigo-400 uppercase tracking-widest px-2">En Atención ({inProgress.length})</h3>
            {inProgress.map(req => (
              <div key={req.id} className={`bg-white border-2 rounded-[2rem] p-5 shadow-lg animate-in slide-in-from-left-4 ${req.priority === 'urgent' ? 'border-red-400 shadow-red-50' : 'border-indigo-100'}`}>
                <div className="flex justify-between items-start mb-3">
                  <div className="flex items-center space-x-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white font-black ${req.priority === 'urgent' ? 'bg-red-600' : 'bg-indigo-600'}`}>{req.userName.charAt(0)}</div>
                    <div>
                      <p className="text-xs font-black text-gray-900 leading-none">{req.userName}</p>
                      <p className={`text-[9px] font-bold mt-1 uppercase ${req.priority === 'urgent' ? 'text-red-500' : 'text-indigo-400'}`}>
                        Ticket {req.id} {req.priority === 'urgent' && '• URGENTE'}
                      </p>
                    </div>
                  </div>
                  <button onClick={() => onUpdateStatus(req.id, 'completed')} className="bg-emerald-50 text-emerald-600 p-2 rounded-xl hover:bg-emerald-600 hover:text-white transition-all"><CheckCircle size={16}/></button>
                </div>
                <p className="text-[11px] font-black text-gray-700 mb-3">{req.subject}</p>
                <div className="flex items-center justify-between pt-3 border-t border-gray-50">
                  <span className="text-[10px] font-black text-indigo-500 bg-indigo-50 px-3 py-1 rounded-lg">{getElapsedTime(req.startedAt || req.createdAt)}</span>
                  <button onClick={() => openTeamsChat(req.userId, req.id)} className="text-[10px] font-black text-indigo-600 hover:bg-indigo-50 px-3 py-1 rounded-lg uppercase">Contactar</button>
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-5">
            <h3 className="text-[10px] font-black text-amber-400 uppercase tracking-widest px-2">Lista de Espera ({waiting.length})</h3>
            {waiting.map(req => (
              <div key={req.id} className={`bg-white rounded-[2rem] p-5 border-2 animate-in slide-in-from-right-4 transition-all ${
                req.priority === 'urgent' ? 'border-red-500 shadow-red-100 ring-2 ring-red-50 ring-offset-2' : 
                req.priority === 'high' ? 'border-red-100 shadow-sm' : 'border-gray-50 shadow-sm'
              }`}>
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h4 className="text-xs font-black text-gray-900 mb-1 flex items-center">
                      {req.userName}
                      {req.priority === 'urgent' && <AlertCircle size={12} className="ml-2 text-red-600 animate-bounce" />}
                    </h4>
                    <span className={`text-[8px] px-2 py-0.5 rounded font-black uppercase ${
                      req.priority === 'urgent' ? 'bg-red-600 text-white' : 
                      req.priority === 'high' ? 'bg-red-100 text-red-700' : 
                      req.priority === 'medium' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'
                    }`}>
                      {req.priority === 'urgent' ? 'Urgente' : req.priority === 'high' ? 'Alta' : req.priority === 'medium' ? 'Media' : 'Baja'}
                    </span>
                  </div>
                  <button onClick={() => onUpdateStatus(req.id, 'in-progress')} className={`text-[9px] font-black px-4 py-2 rounded-xl shadow-lg transition-colors ${
                    req.priority === 'urgent' ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-indigo-600 text-white hover:bg-indigo-700'
                  }`}>TOMAR</button>
                </div>
                {req.aiSummary && (
                  <div className={`p-3 rounded-xl mb-2 ${req.priority === 'urgent' ? 'bg-red-50' : 'bg-amber-50/50'}`}>
                    <p className={`text-[10px] leading-snug font-bold ${req.priority === 'urgent' ? 'text-red-900' : 'text-amber-900'}`}>
                      <span className={`font-black uppercase mr-1 ${req.priority === 'urgent' ? 'text-red-600' : 'text-amber-600'}`}>Resumen IA:</span>
                      {req.aiSummary}
                    </p>
                  </div>
                )}
                <p className="text-[10px] text-gray-500 italic px-1">{req.description || "Sin descripción."}</p>
              </div>
            ))}
          </div>
        </div>
      ) : activeTab === 'settings' ? (
        <div className="max-w-3xl mx-auto space-y-8">
          <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-xl">
            <h3 className="text-lg font-black text-gray-900 mb-6 flex items-center space-x-2">
              <Settings className="text-indigo-600" />
              <span>Gestión de Agentes de TI</span>
            </h3>
            
            <div className="flex space-x-3 mb-8">
              <input 
                type="email" 
                placeholder="correo@empresa.com" 
                className="flex-1 bg-gray-50 border-2 border-transparent focus:border-indigo-500 rounded-2xl px-6 outline-none font-bold text-sm"
                value={newAgentEmail}
                onChange={e => setNewAgentEmail(e.target.value)}
              />
              <button 
                onClick={() => { if(newAgentEmail) { onManageAgent('add', newAgentEmail); setNewAgentEmail(''); }}}
                className="bg-indigo-600 text-white px-6 py-4 rounded-2xl font-black text-xs uppercase tracking-widest"
              >
                Agregar
              </button>
            </div>

            <div className="space-y-3">
              {agents.map(email => (
                <div key={email} className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl border border-gray-100">
                  <span className="text-sm font-bold text-gray-700">{email}</span>
                  <button onClick={() => onManageAgent('remove', email)} className="text-red-400 hover:text-red-600 p-2"><Trash2 size={16}/></button>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-[2rem] border border-gray-100 overflow-hidden shadow-sm">
           <table className="w-full text-left text-xs border-collapse">
              <thead><tr className="bg-gray-50 border-b border-gray-100"><th className="p-6 font-black text-gray-400 uppercase text-[9px]">Usuario</th><th className="p-6 font-black text-gray-400 uppercase text-[9px]">Asunto</th><th className="p-6 font-black text-gray-400 uppercase text-[9px]">Prioridad</th><th className="p-6 font-black text-gray-400 uppercase text-[9px]">Agente</th></tr></thead>
              <tbody className="divide-y divide-gray-50">
                {completed.map(req => (
                  <tr key={req.id} className="hover:bg-gray-50">
                    <td className="p-6 font-black text-gray-900">{req.userName}</td>
                    <td className="p-6 font-bold text-gray-600">{req.subject}</td>
                    <td className="p-6 font-black uppercase text-[10px]">{req.priority}</td>
                    <td className="p-6 font-black text-indigo-600">{req.agentName || '-'}</td>
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