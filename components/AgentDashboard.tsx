import React, { useState, useEffect, useMemo } from 'react';
import { SupportRequest, QueueStats } from '../types';
import { 
  Clock, CheckCircle, Search, Activity, AlertCircle, 
  LayoutGrid, List, Settings, Trash2, PlayCircle,
  MessageCircle, RotateCcw, XCircle
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
  // Aseguramos que la vista por defecto sea siempre la Grilla (Grid)
  const [viewMode, setViewMode] = useState<'cards' | 'grid'>('grid');
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
    const m = Math.floor(s / 60);
    return m > 60 ? `${Math.floor(m/60)}h ${m%60}m` : `${m}m ${s % 60}s`;
  };

  const PriorityBadge = ({ priority }: { priority: SupportRequest['priority'] }) => {
    const styles = {
      low: 'bg-emerald-50 text-emerald-600 border-emerald-100',
      medium: 'bg-blue-50 text-blue-600 border-blue-100',
      high: 'bg-amber-50 text-amber-600 border-amber-100',
      urgent: 'bg-red-600 text-white border-transparent animate-pulse'
    };
    const labels = { low: 'Baja', medium: 'Media', high: 'Alta', urgent: 'Urgente' };
    return (
      <span className={`text-[9px] font-black px-2 py-0.5 rounded-lg uppercase border ${styles[priority]}`}>
        {priority === 'urgent' && '⚠️ '}{labels[priority]}
      </span>
    );
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-12 animate-in fade-in">
      {/* Stats Section */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
        {[
          { label: 'Espera promedio', val: `${stats.averageWaitTime}min`, color: 'indigo' },
          { label: 'En Espera', val: waiting.length, color: 'amber' },
          { label: 'En Proceso', val: inProgress.length, color: 'indigo' },
          { label: 'Resueltos Hoy', val: stats.completedToday, color: 'emerald' }
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
        
        <div className="flex items-center space-x-4 flex-1 max-w-2xl">
          <div className="flex items-center bg-gray-50 rounded-2xl px-4 py-2 w-full border border-gray-100">
            <Search size={14} className="text-gray-400 mr-2" />
            <input type="text" placeholder="Buscar ticket..." className="bg-transparent border-none outline-none text-xs font-bold w-full" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
          </div>

          {activeTab === 'queue' && (
            <div className="flex bg-gray-50 p-1 rounded-xl shrink-0">
              <button onClick={() => setViewMode('cards')} className={`p-2 rounded-lg transition-all ${viewMode === 'cards' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-400'}`}>
                <LayoutGrid size={18} />
              </button>
              <button onClick={() => setViewMode('grid')} className={`p-2 rounded-lg transition-all ${viewMode === 'grid' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-400'}`}>
                <List size={18} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main Content Areas */}
      {activeTab === 'queue' ? (
        viewMode === 'cards' ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="space-y-5">
              <h3 className="text-[10px] font-black text-indigo-400 uppercase tracking-widest px-2 flex items-center"><Activity size={12} className="mr-2"/> En Atención ({inProgress.length})</h3>
              {inProgress.map(req => (
                <div key={req.id} className={`bg-white border-2 rounded-[2rem] p-5 shadow-lg animate-in slide-in-from-left-4 ${req.priority === 'urgent' ? 'border-red-400' : 'border-indigo-100'}`}>
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex items-center space-x-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white font-black ${req.priority === 'urgent' ? 'bg-red-600' : 'bg-indigo-600'}`}>{req.userName.charAt(0)}</div>
                      <div>
                        <p className="text-xs font-black text-gray-900 leading-none">{req.userName}</p>
                        <p className="text-[9px] font-bold mt-1 text-gray-400 uppercase">Ticket {req.id}</p>
                      </div>
                    </div>
                    <div className="flex space-x-1.5">
                      <button onClick={() => onUpdateStatus(req.id, 'waiting')} className="bg-gray-100 text-gray-500 p-2 rounded-xl hover:bg-gray-200 transition-all" title="Volver a la cola"><RotateCcw size={16}/></button>
                      <button onClick={() => onUpdateStatus(req.id, 'cancelled')} className="bg-red-50 text-red-500 p-2 rounded-xl hover:bg-red-500 hover:text-white transition-all" title="No Solucionado"><XCircle size={16}/></button>
                      <button onClick={() => onUpdateStatus(req.id, 'completed')} className="bg-emerald-50 text-emerald-600 p-2 rounded-xl hover:bg-emerald-600 hover:text-white transition-all" title="Solucionado"><CheckCircle size={16}/></button>
                    </div>
                  </div>
                  <p className="text-[11px] font-black text-gray-700 mb-2">{req.subject}</p>
                  <PriorityBadge priority={req.priority} />
                  <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-50">
                    <span className="text-[10px] font-black text-indigo-500 bg-indigo-50 px-3 py-1 rounded-lg flex items-center"><Clock size={10} className="mr-1.5"/> {getElapsedTime(req.startedAt || req.createdAt)}</span>
                    <button onClick={() => openTeamsChat(req.userId, req.id)} className="text-[10px] font-black text-indigo-600 hover:bg-indigo-50 px-3 py-1 rounded-lg uppercase">Contactar</button>
                  </div>
                </div>
              ))}
              {inProgress.length === 0 && <div className="p-10 text-center border-2 border-dashed border-gray-100 rounded-[2rem] text-gray-300 font-bold text-xs">No hay tickets en proceso</div>}
            </div>

            <div className="space-y-5">
              <h3 className="text-[10px] font-black text-amber-400 uppercase tracking-widest px-2 flex items-center"><Clock size={12} className="mr-2"/> Lista de Espera ({waiting.length})</h3>
              {waiting.map(req => (
                <div key={req.id} className={`bg-white rounded-[2rem] p-5 border-2 animate-in slide-in-from-right-4 transition-all ${req.priority === 'urgent' ? 'border-red-500 shadow-red-50' : 'border-gray-50 shadow-sm'}`}>
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex items-center space-x-2">
                       <h4 className="text-xs font-black text-gray-900">{req.userName}</h4>
                       {req.priority === 'urgent' && <AlertCircle size={12} className="text-red-600 animate-bounce" />}
                    </div>
                    <button onClick={() => onUpdateStatus(req.id, 'in-progress')} className={`text-[9px] font-black px-4 py-2 rounded-xl transition-all ${req.priority === 'urgent' ? 'bg-red-600 text-white' : 'bg-indigo-600 text-white'}`}>TOMAR</button>
                  </div>
                  <PriorityBadge priority={req.priority} />
                  {req.aiSummary && (
                    <div className="p-3 bg-gray-50 rounded-xl mt-3">
                      <p className="text-[10px] font-bold text-gray-600 leading-snug"><span className="font-black text-indigo-600 uppercase mr-1">Resumen:</span>{req.aiSummary}</p>
                    </div>
                  )}
                </div>
              ))}
              {waiting.length === 0 && <div className="p-10 text-center border-2 border-dashed border-gray-100 rounded-[2rem] text-gray-300 font-bold text-xs">Cola vacía</div>}
            </div>
          </div>
        ) : (
          /* GRID VIEW (TABLE) */
          <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-xl overflow-hidden animate-in fade-in slide-in-from-bottom-4">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="p-5 font-black text-gray-400 uppercase text-[9px] tracking-widest">Ticket</th>
                    <th className="p-5 font-black text-gray-400 uppercase text-[9px] tracking-widest">Usuario</th>
                    <th className="p-5 font-black text-gray-400 uppercase text-[9px] tracking-widest">Asunto / Resumen IA</th>
                    <th className="p-5 font-black text-gray-400 uppercase text-[9px] tracking-widest">Prioridad</th>
                    <th className="p-5 font-black text-gray-400 uppercase text-[9px] tracking-widest">Estado</th>
                    <th className="p-5 font-black text-gray-400 uppercase text-[9px] tracking-widest">Tiempo</th>
                    <th className="p-5 font-black text-gray-400 uppercase text-[9px] tracking-widest text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {[...inProgress, ...waiting].map(req => {
                    const isInProgress = req.status === 'in-progress';
                    return (
                      <tr key={req.id} className={`group hover:bg-gray-50 transition-colors ${req.priority === 'urgent' ? 'bg-red-50/30' : ''}`}>
                        <td className="p-5">
                          <span className="text-[10px] font-black text-gray-400">{req.id}</span>
                        </td>
                        <td className="p-5">
                          <div className="flex items-center space-x-3">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-black text-white ${isInProgress ? 'bg-indigo-600' : 'bg-gray-300'}`}>{req.userName.charAt(0)}</div>
                            <span className="text-xs font-black text-gray-900">{req.userName}</span>
                          </div>
                        </td>
                        <td className="p-5 max-w-xs">
                          <p className="text-xs font-bold text-gray-800 truncate">{req.subject}</p>
                          {req.aiSummary && <p className="text-[10px] text-indigo-500 font-bold truncate opacity-80 mt-0.5">{req.aiSummary}</p>}
                        </td>
                        <td className="p-5">
                          <PriorityBadge priority={req.priority} />
                        </td>
                        <td className="p-5">
                          <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-md ${isInProgress ? 'bg-indigo-50 text-indigo-600' : 'bg-amber-50 text-amber-600'}`}>
                            {isInProgress ? 'Atendiendo' : 'En Cola'}
                          </span>
                        </td>
                        <td className="p-5 text-[10px] font-black text-gray-400">
                          {getElapsedTime(req.startedAt || req.createdAt)}
                        </td>
                        <td className="p-5 text-center">
                          <div className="flex items-center justify-center space-x-1.5">
                            {isInProgress ? (
                              <>
                                <button onClick={() => onUpdateStatus(req.id, 'waiting')} className="p-2 bg-gray-100 text-gray-500 rounded-lg hover:bg-gray-200 transition-all shadow-sm" title="Volver a la cola"><RotateCcw size={14}/></button>
                                <button onClick={() => onUpdateStatus(req.id, 'cancelled')} className="p-2 bg-red-50 text-red-500 rounded-lg hover:bg-red-500 hover:text-white transition-all shadow-sm" title="No Solucionado"><XCircle size={14}/></button>
                                <button onClick={() => onUpdateStatus(req.id, 'completed')} className="p-2 bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-600 hover:text-white transition-all shadow-sm" title="Completar"><CheckCircle size={14}/></button>
                                <button onClick={() => openTeamsChat(req.userId, req.id)} className="p-2 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-600 hover:text-white transition-all shadow-sm" title="Contactar"><MessageCircle size={14}/></button>
                              </>
                            ) : (
                              <button onClick={() => onUpdateStatus(req.id, 'in-progress')} className={`p-2 flex items-center space-x-2 rounded-lg font-black text-[10px] uppercase tracking-tighter shadow-sm transition-all ${req.priority === 'urgent' ? 'bg-red-600 text-white' : 'bg-indigo-600 text-white'}`}>
                                <PlayCircle size={14}/> <span>TOMAR</span>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {[...inProgress, ...waiting].length === 0 && (
                    <tr><td colSpan={7} className="p-20 text-center text-gray-300 font-bold text-sm">No hay actividad en la cola</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )
      ) : activeTab === 'settings' ? (
        <div className="max-w-3xl mx-auto space-y-8 animate-in slide-in-from-bottom-4">
          <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-xl">
            <h3 className="text-lg font-black text-gray-900 mb-6 flex items-center space-x-2">
              <Settings className="text-indigo-600" />
              <span>Gestión de Agentes de TI</span>
            </h3>
            
            <div className="flex space-x-3 mb-8">
              <input 
                type="email" 
                placeholder="correo@empresa.com" 
                className="flex-1 bg-gray-50 border-2 border-transparent focus:border-indigo-500 rounded-2xl px-6 outline-none font-bold text-sm h-14"
                value={newAgentEmail}
                onChange={e => setNewAgentEmail(e.target.value)}
              />
              <button 
                onClick={() => { if(newAgentEmail) { onManageAgent('add', newAgentEmail); setNewAgentEmail(''); }}}
                className="bg-indigo-600 text-white px-8 h-14 rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-indigo-100 hover:scale-[1.02] transition-transform"
              >
                Agregar
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3">
              {agents.map(email => (
                <div key={email} className="flex items-center justify-between p-5 bg-gray-50 rounded-2xl border border-gray-100 group">
                  <span className="text-sm font-black text-gray-700">{email}</span>
                  <button onClick={() => onManageAgent('remove', email)} className="text-gray-300 group-hover:text-red-400 p-2 transition-colors"><Trash2 size={16}/></button>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        /* HISTORY TAB */
        <div className="bg-white rounded-[2.5rem] border border-gray-100 overflow-hidden shadow-xl animate-in slide-in-from-bottom-4">
           <table className="w-full text-left text-xs border-collapse">
              <thead><tr className="bg-gray-50 border-b border-gray-100"><th className="p-6 font-black text-gray-400 uppercase text-[9px] tracking-widest">Usuario</th><th className="p-6 font-black text-gray-400 uppercase text-[9px] tracking-widest">Asunto</th><th className="p-6 font-black text-gray-400 uppercase text-[9px] tracking-widest">Prioridad</th><th className="p-6 font-black text-gray-400 uppercase text-[9px] tracking-widest">Agente</th><th className="p-6 font-black text-gray-400 uppercase text-[9px] tracking-widest">Finalizado</th><th className="p-6 font-black text-gray-400 uppercase text-[9px] tracking-widest">Estado</th></tr></thead>
              <tbody className="divide-y divide-gray-50">
                {completed.map(req => (
                  <tr key={req.id} className="hover:bg-gray-50 transition-colors">
                    <td className="p-6 font-black text-gray-900">{req.userName}</td>
                    <td className="p-6 font-bold text-gray-600">{req.subject}</td>
                    <td className="p-6"><PriorityBadge priority={req.priority} /></td>
                    <td className="p-6 font-black text-indigo-600">{req.agentName || '-'}</td>
                    <td className="p-6 font-bold text-gray-400">{req.completedAt ? new Date(Number(req.completedAt)).toLocaleTimeString() : '-'}</td>
                    <td className="p-6">
                      <span className={`text-[8px] font-black uppercase px-2 py-1 rounded ${req.status === 'completed' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
                        {req.status === 'completed' ? 'Solucionado' : 'No Solucionado'}
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