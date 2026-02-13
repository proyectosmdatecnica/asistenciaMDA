import React, { useState, useEffect, useMemo } from 'react';
import { SupportRequest, QueueStats } from '../types';
import { 
  Clock, CheckCircle, Search, Zap, List, LayoutGrid, Settings, Plus, Trash2, Activity, MessageCircle, RotateCcw, XCircle
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
  const [viewMode, setViewMode] = useState<'grid' | 'standard' | 'compact'>('grid');
  const [newAgentEmail, setNewAgentEmail] = useState('');

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Load persisted viewMode (if any) or default to grid; allow manual changes
  useEffect(() => {
    try {
      const stored = localStorage.getItem('agentViewMode');
      if (stored === 'grid' || stored === 'standard' || stored === 'compact') {
        setViewMode(stored as 'grid' | 'standard' | 'compact');
      } else {
        setViewMode('grid');
        localStorage.setItem('agentViewMode', 'grid');
      }
    } catch (e) {
      setViewMode('grid');
    }
  }, []);

  // persist viewMode when user toggles
  useEffect(() => {
    try {
      localStorage.setItem('agentViewMode', viewMode);
    } catch (e) {
      // ignore storage errors
    }
  }, [viewMode]);

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
    const p = { high: 3, medium: 2, low: 1 };
    return p[b.priority] - p[a.priority] || a.createdAt - b.createdAt;
  });

  const inProgress = filteredRequests.filter(r => r.status === 'in-progress');
  const completed = filteredRequests.filter(r => r.status === 'completed' || r.status === 'cancelled');

  const getElapsedTime = (t: number) => {
    const s = Math.floor((now - t) / 1000);
    return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
  };

  const formatDuration = (start: number, end: number) => {
    const s = Math.max(0, Math.floor((end - start) / 1000));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const renderElapsedFor = (req: SupportRequest) => {
    // Only run live timer while in-progress (taken). For completed/cancelled show total duration between startedAt and completedAt.
    const started = Number(req.startedAt || 0);
    const completed = Number(req.completedAt || 0);
    if (req.status === 'in-progress') {
      if (started) return getElapsedTime(started);
      return '-';
    }
    if (req.status === 'completed' || req.status === 'cancelled') {
      if (started && completed) return formatDuration(started, completed);
      // if completed but no started timestamp, fallback to '-' or show time between created and completed
      if (completed && req.createdAt) return formatDuration(Number(req.createdAt), completed);
      return '-';
    }
    // waiting or other statuses
    return '-';
  };

  const priorityLabel = (p: SupportRequest['priority']) => {
    switch (p) {
      case 'low': return 'Baja';
      case 'medium': return 'Media';
      case 'high': return 'Alta';
      case 'urgent': return 'Urgente';
      default: return p;
    }
  };

  const statusLabel = (s: SupportRequest['status']) => {
    switch (s) {
      case 'waiting': return 'En espera';
      case 'in-progress': return 'En proceso';
      case 'completed': return 'Resuelto';
      case 'cancelled': return 'Cancelado';
      default: return s;
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-12 animate-in fade-in">
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
        {[
          { label: 'Espera promedio', val: `${stats.averageWaitTime}min`, icon: <Zap size={14}/>, color: 'emerald' },
          { label: 'En Espera', val: waiting.length, icon: <Clock size={14}/>, color: 'amber' },
          { label: 'En Proceso', val: inProgress.length, icon: <Activity size={14}/>, color: 'indigo' },
          { label: 'Atendidos Hoy', val: stats.completedToday, icon: <CheckCircle size={14}/>, color: 'emerald' }
        ].map((s, i) => (
          <div key={i} className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">{s.label}</span>
            <p className="text-3xl font-black text-gray-900">{s.val}</p>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="bg-white p-2.5 rounded-3xl border border-gray-200 flex flex-wrap items-center justify-between gap-4">
        <div className="flex bg-gray-50 p-1 rounded-2xl">
          <button onClick={() => setActiveTab('queue')} className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'queue' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-400'}`}>COLA</button>
          <button onClick={() => setActiveTab('history')} className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'history' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-400'}`}>HISTORIAL</button>
          <button onClick={() => setActiveTab('settings')} className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'settings' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-400'}`}>CONFIG</button>
        </div>
        
        <div className="flex items-center space-x-3 flex-1 max-w-md">
          <div className="flex items-center bg-gray-50 rounded-2xl px-4 py-2 w-full border border-gray-100">
            <Search size={14} className="text-gray-400 mr-2" />
            <input type="text" placeholder="Filtrar..." className="bg-transparent border-none outline-none text-xs font-bold w-full" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
          </div>
          <div className="ml-3 flex items-center space-x-2">
            <button onClick={() => setViewMode('grid')} title="Vista en grilla" className={`p-2 rounded-xl ${viewMode === 'grid' ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-400 hover:bg-gray-100'}`}><LayoutGrid size={16} /></button>
            <button onClick={() => setViewMode('standard')} title="Vista en tarjetas" className={`p-2 rounded-xl ${viewMode === 'standard' ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-400 hover:bg-gray-100'}`}><List size={16} /></button>
          </div>
        </div>
      </div>

      {activeTab === 'queue' ? (
        <div>
          {viewMode === 'grid' ? (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="p-3 text-[10px] font-black text-gray-400 uppercase">ID</th>
                    <th className="p-3 text-[10px] font-black text-gray-400 uppercase">Usuario</th>
                    <th className="p-3 text-[10px] font-black text-gray-400 uppercase">Asunto</th>
                    <th className="p-3 text-[10px] font-black text-gray-400 uppercase">Prioridad</th>
                    <th className="p-3 text-[10px] font-black text-gray-400 uppercase">Estado</th>
                    <th className="p-3 text-[10px] font-black text-gray-400 uppercase">Agente</th>
                    <th className="p-3 text-[10px] font-black text-gray-400 uppercase">Creado</th>
                    <th className="p-3 text-[10px] font-black text-gray-400 uppercase">Tiempo</th>
                    <th className="p-3 text-[10px] font-black text-gray-400 uppercase">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredRequests
                    .filter(r => r.status === 'waiting' || r.status === 'in-progress')
                    .map(req => (
                    <tr key={req.id} className="hover:bg-gray-50 transition-colors">
                      <td className="p-3 font-black text-gray-800">{req.id}</td>
                      <td className="p-3 text-sm font-bold text-gray-700">{req.userName}</td>
                      <td className="p-3 text-sm text-gray-600">{req.subject}</td>
                      <td className="p-3 text-sm">
                        <span className={`text-[9px] font-black px-2 py-1 rounded ${req.priority === 'urgent' ? 'bg-red-600 text-white' : req.priority === 'high' ? 'bg-amber-100 text-amber-700' : req.priority === 'medium' ? 'bg-blue-50 text-blue-600' : 'bg-emerald-50 text-emerald-600'}`}>{priorityLabel(req.priority)}</span>
                      </td>
                      <td className="p-3 text-sm font-black">
                        <span className={`text-[9px] px-2 py-1 rounded ${req.status === 'waiting' ? 'bg-amber-50 text-amber-600' : req.status === 'in-progress' ? 'bg-indigo-50 text-indigo-600' : 'bg-emerald-50 text-emerald-600'}`}>{statusLabel(req.status)}</span>
                      </td>
                      <td className="p-3 text-sm text-indigo-600 font-black">{req.agentName || '-'}</td>
                      <td className="p-3 text-sm text-gray-500">{new Date(Number(req.createdAt)).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                      <td className="p-3 text-sm text-gray-500">{renderElapsedFor(req)}</td>
                      <td className="p-3 text-sm">
                        <div className="flex items-center space-x-2">
                          {req.status === 'waiting' && (
                            <button onClick={() => onUpdateStatus(req.id, 'in-progress')} className="bg-indigo-600 text-white text-[9px] font-black px-4 py-2 rounded-xl shadow-lg hover:bg-indigo-700 transition-colors">ATENDER</button>
                          )}

                          {req.status === 'in-progress' && (
                            <div className="flex items-center space-x-2">
                              <button title="Volver a la cola" onClick={() => onUpdateStatus(req.id, 'waiting')} className="bg-gray-100 text-gray-500 p-2 rounded-xl hover:bg-gray-200 transition-all"><RotateCcw size={16}/></button>
                              <button title="Cancelar Ticket" onClick={() => onUpdateStatus(req.id, 'cancelled')} className="bg-red-50 text-red-400 p-2 rounded-xl hover:bg-red-500 hover:text-white transition-all"><XCircle size={16}/></button>
                              <button title="Cerrar como Solucionado" onClick={() => onUpdateStatus(req.id, 'completed')} className="bg-emerald-50 text-emerald-600 p-2 rounded-xl hover:bg-emerald-600 hover:text-white transition-all"><CheckCircle size={16}/></button>
                            </div>
                          )}

                          {(req.status === 'completed' || req.status === 'cancelled') && (
                            <div className="flex items-center space-x-2">
                              <button onClick={() => onUpdateStatus(req.id, 'in-progress')} className="bg-indigo-50 text-indigo-600 text-[9px] font-black px-3 py-2 rounded-xl">REABRIR</button>
                            </div>
                          )}
                        </div>

                        <div className="mt-2">
                          <button onClick={() => openTeamsChat(req.userId, req.id)} className="text-[10px] font-black text-indigo-600 hover:underline flex items-center space-x-1">
                            <MessageCircle size={14} />
                            <span>Contactar</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* En Atención Section */}
              <div className="space-y-5">
                <h3 className="text-[10px] font-black text-indigo-400 uppercase tracking-widest px-2">En Atención ({inProgress.length})</h3>
                {inProgress.map(req => (
                  <div key={req.id} className="bg-white border-2 border-indigo-100 rounded-[2rem] p-5 shadow-lg animate-in slide-in-from-left-4">
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white font-black">{req.userName.charAt(0)}</div>
                        <div>
                          <p className="text-xs font-black text-gray-900 leading-none">{req.userName}</p>
                          <p className="text-[9px] text-indigo-400 font-bold mt-1 uppercase">Ticket {req.id}</p>
                        </div>
                      </div>
                      <div className="flex space-x-2">
                        <button 
                          title="Volver a la cola"
                          onClick={() => onUpdateStatus(req.id, 'waiting')} 
                          className="bg-gray-100 text-gray-500 p-2 rounded-xl hover:bg-gray-200 transition-all"
                        >
                          <RotateCcw size={16}/>
                        </button>
                        <button 
                          title="Cancelar Ticket"
                          onClick={() => onUpdateStatus(req.id, 'cancelled')} 
                          className="bg-red-50 text-red-400 p-2 rounded-xl hover:bg-red-500 hover:text-white transition-all"
                        >
                          <XCircle size={16}/>
                        </button>
                        <button 
                          title="Cerrar como Solucionado"
                          onClick={() => onUpdateStatus(req.id, 'completed')} 
                          className="bg-emerald-50 text-emerald-600 p-2 rounded-xl hover:bg-emerald-600 hover:text-white transition-all"
                        >
                          <CheckCircle size={16}/>
                        </button>
                      </div>
                    </div>
                    <p className="text-[11px] font-black text-gray-700 line-clamp-2 mb-1">{req.subject}</p>
                    <p className="text-[10px] text-gray-500 mb-3 italic line-clamp-1">{req.description}</p>
                    <div className="flex items-center justify-between pt-3 border-t border-gray-50">
                      <span className="text-[10px] font-black text-indigo-500 bg-indigo-50 px-3 py-1 rounded-lg">Tiempo: {getElapsedTime(req.startedAt || req.createdAt)}</span>
                      <button onClick={() => openTeamsChat(req.userId, req.id)} className="text-[10px] font-black text-indigo-600 hover:bg-indigo-50 px-3 py-1 rounded-lg uppercase flex items-center space-x-1">
                        <MessageCircle size={12}/>
                        <span>Contactar</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Lista de Espera Section */}
              <div className="space-y-5">
                <h3 className="text-[10px] font-black text-amber-400 uppercase tracking-widest px-2">Lista de Espera ({waiting.length})</h3>
                {waiting.map(req => (
                  <div 
                    key={req.id} 
                    className={`bg-white rounded-[2rem] p-5 border-2 group transition-all animate-in slide-in-from-right-4 ${req.priority === 'high' ? 'border-red-100 shadow-red-50' : 'border-gray-50 shadow-sm'}`}
                    title={`DETALLE COMPLETO:\n${req.description || 'Sin descripción'}`}
                  >
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <h4 className="text-xs font-black text-gray-900 mb-1">{req.userName}</h4>
                        <span className={`text-[8px] px-2 py-0.5 rounded font-black uppercase ${req.priority === 'high' ? 'bg-red-500 text-white' : 'bg-amber-100 text-amber-700'}`}>{req.priority}</span>
                      </div>
                      <button onClick={() => onUpdateStatus(req.id, 'in-progress')} className="bg-indigo-600 text-white text-[9px] font-black px-4 py-2 rounded-xl shadow-lg hover:bg-indigo-700 transition-colors">TOMAR</button>
                    </div>
                    
                    {/* Información Prioritaria: Lo que escribió el usuario */}
                    <div className="space-y-1 mb-3">
                       <p className="text-[11px] font-black text-gray-800 line-clamp-1">{req.subject}</p>
                       <p className="text-[10px] text-gray-500 line-clamp-2 italic group-hover:line-clamp-none transition-all cursor-help">
                         {req.description || "Sin descripción adicional."}
                       </p>
                    </div>

                    {/* Resumen IA como ayuda secundaria */}
                    {req.aiSummary && (
                      <div className="bg-gray-50 p-2 rounded-xl border border-gray-100">
                        <p className="text-[9px] text-gray-500 leading-snug font-bold">
                          <span className="text-indigo-400 font-black uppercase mr-1">IA:</span>
                          {req.aiSummary}
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : activeTab === 'settings' ? (
        <div className="max-w-3xl mx-auto space-y-8 animate-in zoom-in-95">
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
                className="bg-indigo-600 text-white px-6 py-4 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center space-x-2"
              >
                <Plus size={16}/>
                <span>Agregar</span>
              </button>
            </div>

            <div className="space-y-3">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-2 mb-2">Agentes Autorizados</p>
              {agents.map(email => (
                <div key={email} className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl border border-gray-100 group">
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 bg-indigo-100 text-indigo-600 rounded-lg flex items-center justify-center font-black text-xs">@</div>
                    <span className="text-sm font-bold text-gray-700">{email}</span>
                  </div>
                  <button onClick={() => onManageAgent('remove', email)} className="text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-all p-2">
                    <Trash2 size={16}/>
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        /* Historial Table */
        <div className="bg-white rounded-[2rem] border border-gray-100 overflow-hidden shadow-sm animate-in fade-in">
           <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="p-6 font-black text-gray-400 uppercase text-[9px]">ID</th>
                    <th className="p-6 font-black text-gray-400 uppercase text-[9px]">Usuario</th>
                    <th className="p-6 font-black text-gray-400 uppercase text-[9px]">Asunto</th>
                    <th className="p-6 font-black text-gray-400 uppercase text-[9px]">Agente</th>
                    <th className="p-6 font-black text-gray-400 uppercase text-[9px]">Cierre</th>
                    <th className="p-6 font-black text-gray-400 uppercase text-[9px]">Estado</th>
                  </tr>
                </thead>
              <tbody className="divide-y divide-gray-50">
                {completed.map(req => (
                  <tr key={req.id} className="hover:bg-gray-50 transition-colors">
                    <td className="p-6 font-black text-gray-900">{req.id}</td>
                    <td className="p-6 font-black text-gray-900">{req.userName}</td>
                    <td className="p-6 font-bold text-gray-600">{req.subject}</td>
                    <td className="p-6 font-black text-indigo-600">{req.agentName || '-'}</td>
                    <td className="p-6 text-gray-400">
                      {req.completedAt ? new Date(Number(req.completedAt)).toLocaleString('es-ES', { 
                        day: '2-digit', month: '2-digit', year: 'numeric',
                        hour: '2-digit', minute: '2-digit'
                      }) : '-'}
                    </td>
                    <td className="p-6">
                      <span className={`text-[8px] font-black px-2 py-1 rounded uppercase ${req.status === 'completed' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
                        {statusLabel(req.status).toUpperCase()}
                      </span>
                    </td>
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