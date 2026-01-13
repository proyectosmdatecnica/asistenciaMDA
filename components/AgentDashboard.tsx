
import React, { useState, useEffect, useMemo } from 'react';
import { SupportRequest, QueueStats } from '../types';
import { 
  Clock, 
  CheckCircle, 
  Search, 
  History, 
  ListFilter,
  Monitor,
  Cpu,
  Globe,
  Key,
  Download,
  ExternalLink,
  ShieldAlert,
  Zap
} from 'lucide-react';

interface AgentDashboardProps {
  requests: SupportRequest[];
  stats: QueueStats;
  onUpdateStatus: (id: string, newStatus: SupportRequest['status']) => void;
}

const AgentDashboard: React.FC<AgentDashboardProps> = ({ requests, stats, onUpdateStatus }) => {
  const [now, setNow] = useState(Date.now());
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'queue' | 'history'>('queue');

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const getCategoryIcon = (cat?: string) => {
    switch(cat) {
      case 'Software': return <Monitor size={14} />;
      case 'Hardware': return <Cpu size={14} />;
      case 'Redes': return <Globe size={14} />;
      case 'Accesos': return <Key size={14} />;
      default: return <ListFilter size={14} />;
    }
  };

  const filteredRequests = useMemo(() => {
    return requests.filter(r => 
      r.userName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.subject.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.id.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [requests, searchTerm]);

  const waiting = filteredRequests.filter(r => r.status === 'waiting').sort((a, b) => {
    const priorityMap = { high: 3, medium: 2, low: 1 };
    if (priorityMap[a.priority] !== priorityMap[b.priority]) return priorityMap[b.priority] - priorityMap[a.priority];
    return a.createdAt - b.createdAt;
  });

  const inProgress = filteredRequests.filter(r => r.status === 'in-progress');
  const completed = filteredRequests.filter(r => r.status === 'completed' || r.status === 'cancelled');

  const getElapsedTime = (createdAt: number) => {
    const seconds = Math.floor((now - createdAt) / 1000);
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const exportToCSV = () => {
    const headers = ["Ticket ID", "Usuario", "Asunto", "Estado", "Categoria", "Prioridad", "F. Creacion", "F. Cierre"];
    const rows = completed.map(r => [
      r.id,
      r.userName,
      `"${r.subject.replace(/"/g, '""')}"`,
      r.status,
      r.category || 'General',
      r.priority,
      new Date(r.createdAt).toLocaleString(),
      r.completedAt ? new Date(r.completedAt).toLocaleString() : '-'
    ]);

    const csvContent = "\uFEFF" + [headers, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Reporte_IT_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-12 animate-in fade-in duration-500">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
        <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm relative overflow-hidden group">
          <div className={`absolute top-0 right-0 w-24 h-24 -mr-8 -mt-8 rounded-full opacity-5 transition-transform group-hover:scale-110 ${stats.averageWaitTime > 15 ? 'bg-red-500' : 'bg-emerald-500'}`} />
          <div className="flex justify-between items-start mb-4">
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Salud del Servicio</span>
            <div className={`flex items-center space-x-1.5 px-2 py-1 rounded-full text-[9px] font-black ${
              stats.averageWaitTime > 15 ? 'bg-red-50 text-red-600' : stats.averageWaitTime > 5 ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'
            }`}>
              <Zap size={10} />
              <span>{stats.averageWaitTime > 15 ? 'CRÍTICO' : 'ÓPTIMO'}</span>
            </div>
          </div>
          <p className="text-3xl font-black text-gray-900">{stats.averageWaitTime}<span className="text-sm font-bold text-gray-400 ml-1">min</span></p>
          <p className="text-[10px] text-gray-400 font-bold mt-1">Tiempo de espera promedio</p>
        </div>
        
        <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
          <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] block mb-4">En Espera</span>
          <p className="text-3xl font-black text-gray-900">{waiting.length}</p>
          <div className="flex items-center space-x-1 mt-1">
            <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            <p className="text-[10px] text-gray-400 font-bold">Tickets sin asignar</p>
          </div>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
          <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] block mb-4">En Proceso</span>
          <p className="text-3xl font-black text-indigo-600">{inProgress.length}</p>
          <div className="flex items-center space-x-1 mt-1">
            <div className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
            <p className="text-[10px] text-gray-400 font-bold">Atendiendo actualmente</p>
          </div>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
          <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] block mb-4">Resueltos Hoy</span>
          <p className="text-3xl font-black text-gray-900">{stats.completedToday}</p>
          <div className="flex items-center space-x-1 mt-1">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <p className="text-[10px] text-gray-400 font-bold">Casos finalizados</p>
          </div>
        </div>
      </div>

      {/* Control Bar */}
      <div className="bg-white p-2.5 rounded-3xl border border-gray-200 flex flex-wrap items-center justify-between gap-4 shadow-sm">
        <div className="flex bg-gray-50 p-1 rounded-2xl">
          <button 
            onClick={() => setActiveTab('queue')}
            className={`px-8 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all flex items-center space-x-3 ${activeTab === 'queue' ? 'bg-white text-[#5b5fc7] shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
          >
            <ListFilter size={16} />
            <span>Cola Activa</span>
          </button>
          <button 
            onClick={() => setActiveTab('history')}
            className={`px-8 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all flex items-center space-x-3 ${activeTab === 'history' ? 'bg-white text-[#5b5fc7] shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
          >
            <History size={16} />
            <span>Historial</span>
          </button>
        </div>
        
        <div className="flex items-center space-x-3 flex-1 max-w-md">
          <div className="flex items-center bg-gray-50 rounded-2xl px-5 py-2.5 w-full border border-gray-100 focus-within:bg-white focus-within:border-indigo-300 transition-all focus-within:ring-4 focus-within:ring-indigo-50">
            <Search size={16} className="text-gray-400 mr-3" />
            <input 
              type="text" 
              placeholder="Filtrar por nombre, asunto o ID..." 
              className="bg-transparent border-none outline-none text-xs w-full font-bold text-gray-700"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          {activeTab === 'history' && (
            <button 
              onClick={exportToCSV}
              className="p-3 bg-indigo-50 text-indigo-600 hover:bg-indigo-600 hover:text-white rounded-2xl transition-all shadow-indigo-50 shadow-lg active:scale-95"
              title="Descargar Reporte CSV"
            >
              <Download size={20} />
            </button>
          )}
        </div>
      </div>

      {activeTab === 'queue' ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
          {/* Active Work Column */}
          <div className="space-y-5">
            <div className="flex items-center justify-between px-2">
              <h3 className="text-[11px] font-black text-gray-400 uppercase tracking-[0.25em] flex items-center space-x-2">
                <Zap size={12} className="text-indigo-500" />
                <span>Casos en Atención ({inProgress.length})</span>
              </h3>
            </div>
            {inProgress.map(req => (
              <div key={req.id} className="bg-white border-2 border-indigo-100 rounded-[2rem] p-6 shadow-xl shadow-indigo-50/20 transition-all hover:shadow-indigo-100/40 animate-in slide-in-from-left-4">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center space-x-4">
                    <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white text-lg font-black shadow-lg shadow-indigo-100">
                      {req.userName.charAt(0)}
                    </div>
                    <div>
                      <h4 className="text-sm font-black text-gray-900">{req.userName}</h4>
                      <p className="text-[10px] text-indigo-500 font-black tracking-widest uppercase mt-0.5">Ticket {req.id}</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => onUpdateStatus(req.id, 'completed')}
                    className="group flex items-center space-x-2 bg-emerald-50 text-emerald-600 px-5 py-2.5 rounded-2xl hover:bg-emerald-600 hover:text-white transition-all font-black text-[10px] active:scale-95"
                  >
                    <CheckCircle size={14} className="group-hover:animate-bounce" />
                    <span>SOLUCIONADO</span>
                  </button>
                </div>
                <div className="bg-gray-50/80 p-4 rounded-2xl mb-4 border border-gray-100">
                  <p className="text-xs font-black text-gray-800 leading-tight">{req.subject}</p>
                  {req.category && (
                    <span className="inline-flex items-center space-x-1 mt-2 text-[9px] font-black bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-lg">
                      {getCategoryIcon(req.category)}
                      <span>{req.category.toUpperCase()}</span>
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-gray-50">
                  <div className="flex items-center space-x-4">
                    <span className="text-[10px] font-black text-indigo-400 flex items-center space-x-1.5 bg-indigo-50/50 px-3 py-1.5 rounded-xl">
                      <Clock size={12} />
                      <span>{getElapsedTime(req.startedAt || req.createdAt)}</span>
                    </span>
                  </div>
                  <button className="flex items-center space-x-2 text-[10px] font-black text-gray-400 hover:text-indigo-600 uppercase tracking-[0.15em] transition-colors">
                    <span>Contactar</span>
                    <ExternalLink size={14} />
                  </button>
                </div>
              </div>
            ))}
            {inProgress.length === 0 && (
              <div className="bg-gray-100/50 border-4 border-dotted border-gray-200 rounded-[2.5rem] py-20 text-center">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-300">
                  <ShieldAlert size={32} />
                </div>
                <p className="text-gray-400 text-xs font-black uppercase tracking-widest">Sin actividad inmediata</p>
              </div>
            )}
          </div>

          {/* Queue Column */}
          <div className="space-y-5">
             <div className="flex items-center justify-between px-2">
              <h3 className="text-[11px] font-black text-gray-400 uppercase tracking-[0.25em] flex items-center space-x-2">
                <ListFilter size={12} className="text-amber-500" />
                <span>Lista de Espera ({waiting.length})</span>
              </h3>
            </div>
            {waiting.map((req, idx) => (
              <div key={req.id} className={`bg-white rounded-[2rem] p-6 border-2 transition-all hover:scale-[1.01] animate-in slide-in-from-right-4 ${
                req.priority === 'high' ? 'border-red-100 shadow-red-50 shadow-xl' : 'border-gray-50 shadow-lg shadow-gray-100/40'
              }`}>
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center space-x-4">
                    <span className="text-3xl font-black text-gray-100 select-none">#{idx + 1}</span>
                    <div>
                      <h4 className="text-sm font-black text-gray-900 leading-none mb-1">{req.userName}</h4>
                      <div className="flex items-center space-x-2">
                        <span className={`text-[8px] px-2 py-0.5 rounded-md font-black uppercase tracking-widest ${
                          req.priority === 'high' ? 'bg-red-500 text-white shadow-lg shadow-red-100' : 'bg-gray-100 text-gray-500'
                        }`}>
                          {req.priority}
                        </span>
                        <span className="flex items-center space-x-1 text-[9px] bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-md font-black">
                          {getCategoryIcon(req.category)}
                          <span>{req.category || 'GENERAL'}</span>
                        </span>
                      </div>
                    </div>
                  </div>
                  <button 
                    onClick={() => onUpdateStatus(req.id, 'in-progress')}
                    className="bg-[#5b5fc7] text-white text-[10px] font-black px-6 py-3 rounded-2xl hover:shadow-2xl hover:shadow-indigo-200 transition-all active:scale-95 tracking-[0.1em]"
                  >
                    TOMAR CASO
                  </button>
                </div>
                {req.aiSummary && (
                  <div className="bg-amber-50/50 p-4 rounded-2xl border border-amber-50">
                    <p className="text-[11px] text-amber-900 leading-snug font-bold">
                      <span className="text-amber-600 font-black uppercase tracking-tighter mr-2">Resumen:</span>
                      {req.aiSummary}
                    </p>
                  </div>
                )}
                <div className="mt-4 pt-4 border-t border-gray-50 flex items-center justify-between">
                   <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Recibido {new Date(req.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                   <button className="text-[9px] font-black text-indigo-400 hover:text-indigo-600 transition-colors uppercase tracking-widest">Ver Detalles</button>
                </div>
              </div>
            ))}
            {waiting.length === 0 && (
              <div className="bg-emerald-50/50 border-4 border-dotted border-emerald-100 rounded-[2.5rem] py-20 text-center">
                <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4 text-emerald-500">
                  <CheckCircle size={32} />
                </div>
                <p className="text-emerald-600 text-xs font-black uppercase tracking-widest">¡Todo al día!</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-[2rem] border border-gray-100 overflow-hidden shadow-2xl shadow-gray-200/40">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-gray-50/80 border-b border-gray-100">
                  <th className="p-6 font-black text-gray-400 uppercase tracking-[0.15em] text-[10px]">Ticket & Usuario</th>
                  <th className="p-6 font-black text-gray-400 uppercase tracking-[0.15em] text-[10px]">Asunto</th>
                  <th className="p-6 font-black text-gray-400 uppercase tracking-[0.15em] text-[10px]">Estado / Categoría</th>
                  <th className="p-6 font-black text-gray-400 uppercase tracking-[0.15em] text-[10px]">Cierre</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {completed.map(req => (
                  <tr key={req.id} className="hover:bg-indigo-50/20 transition-colors">
                    <td className="p-6">
                      <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center text-gray-500 font-black">
                          {req.userName.charAt(0)}
                        </div>
                        <div>
                          <p className="font-black text-gray-900">{req.userName}</p>
                          <p className="text-[10px] text-gray-400 font-mono">ID: {req.id}</p>
                        </div>
                      </div>
                    </td>
                    <td className="p-6 font-bold text-gray-600 max-w-xs truncate">{req.subject}</td>
                    <td className="p-6">
                      <div className="flex flex-col space-y-1.5">
                        <span className={`w-fit px-2.5 py-1 rounded-md text-[9px] font-black uppercase tracking-widest ${
                          req.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                        }`}>
                          {req.status === 'completed' ? 'RESUELTO' : 'CANCELADO'}
                        </span>
                        <span className="text-[9px] font-black text-gray-400 uppercase tracking-tighter">{req.category || 'GENERAL'}</span>
                      </div>
                    </td>
                    <td className="p-6">
                      <p className="text-gray-900 font-black">{req.completedAt ? new Date(req.completedAt).toLocaleTimeString() : '-'}</p>
                      <p className="text-[10px] text-gray-400 font-bold">{req.completedAt ? new Date(req.completedAt).toLocaleDateString() : ''}</p>
                    </td>
                  </tr>
                ))}
                {completed.length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-20 text-center">
                      <p className="text-gray-300 text-xs font-black uppercase tracking-widest">Sin registros históricos</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default AgentDashboard;
