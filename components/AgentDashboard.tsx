
import React, { useState, useEffect, useMemo } from 'react';
import { SupportRequest, QueueStats } from '../types';
import { 
  Clock, 
  CheckCircle, 
  Play, 
  AlertTriangle, 
  MessageSquare, 
  Search, 
  History, 
  ListFilter,
  Monitor,
  Cpu,
  Globe,
  Key,
  Download,
  ExternalLink
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
    const headers = ["ID", "Usuario", "Asunto", "Estado", "Categoría", "Prioridad", "Creado", "Finalizado"];
    const rows = completed.map(r => [
      r.id,
      r.userName,
      r.subject,
      r.status,
      r.category || 'General',
      r.priority,
      new Date(r.createdAt).toLocaleString(),
      r.completedAt ? new Date(r.completedAt).toLocaleString() : '-'
    ]);

    const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `historial_soporte_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Indicadores de Estado */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <div className="flex justify-between items-start mb-2">
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Salud de Cola</span>
            <div className={`w-3 h-3 rounded-full ${stats.averageWaitTime > 15 ? 'bg-red-500 animate-ping' : stats.averageWaitTime > 5 ? 'bg-amber-500' : 'bg-emerald-500'}`} />
          </div>
          <p className="text-2xl font-black text-gray-900">{stats.averageWaitTime} <span className="text-sm font-bold text-gray-400">min espera</span></p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Pendientes</span>
          <p className="text-2xl font-black text-gray-900">{waiting.length}</p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider">En proceso</span>
          <p className="text-2xl font-black text-gray-900">{inProgress.length}</p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Cerrados hoy</span>
          <p className="text-2xl font-black text-gray-900">{stats.completedToday}</p>
        </div>
      </div>

      {/* Barra de Control con Filtros y Exportación */}
      <div className="bg-white p-2 rounded-2xl border border-gray-200 flex flex-wrap items-center justify-between gap-4">
        <div className="flex space-x-1">
          <button 
            onClick={() => setActiveTab('queue')}
            className={`px-6 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-2 ${activeTab === 'queue' ? 'bg-[#5b5fc7] text-white' : 'hover:bg-gray-100 text-gray-500'}`}
          >
            <ListFilter size={14} />
            <span>Cola Activa</span>
          </button>
          <button 
            onClick={() => setActiveTab('history')}
            className={`px-6 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-2 ${activeTab === 'history' ? 'bg-[#5b5fc7] text-white' : 'hover:bg-gray-100 text-gray-500'}`}
          >
            <History size={14} />
            <span>Historial</span>
          </button>
        </div>
        
        <div className="flex items-center space-x-4">
          <div className="flex items-center bg-gray-50 rounded-xl px-4 py-2 w-64 border border-gray-100 focus-within:bg-white focus-within:border-indigo-200 transition-all">
            <Search size={14} className="text-gray-400 mr-2" />
            <input 
              type="text" 
              placeholder="Buscar por nombre o ticket..." 
              className="bg-transparent border-none outline-none text-xs w-full font-medium"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          {activeTab === 'history' && (
            <button 
              onClick={exportToCSV}
              className="p-2 bg-gray-100 text-gray-600 hover:bg-gray-200 rounded-xl transition-all"
              title="Exportar a CSV"
            >
              <Download size={18} />
            </button>
          )}
        </div>
      </div>

      {activeTab === 'queue' ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* En atención */}
          <div className="space-y-4">
            <h3 className="text-[10px] font-black text-gray-400 uppercase px-1 tracking-widest">En atención inmediata ({inProgress.length})</h3>
            {inProgress.map(req => (
              <div key={req.id} className="bg-white border-l-4 border-l-indigo-600 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all group">
                <div className="flex justify-between items-start mb-3">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-700 font-bold">
                      {req.userName.charAt(0)}
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-gray-900">{req.userName}</h4>
                      <p className="text-[10px] text-gray-500 font-mono">Ticket {req.id}</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => onUpdateStatus(req.id, 'completed')}
                    className="p-2 bg-emerald-50 text-emerald-600 hover:bg-emerald-600 hover:text-white rounded-lg transition-colors flex items-center space-x-2 text-[10px] font-black"
                  >
                    <CheckCircle size={16} />
                    <span>FINALIZAR</span>
                  </button>
                </div>
                <div className="bg-gray-50 p-3 rounded-xl mb-3 group-hover:bg-indigo-50/30 transition-colors">
                  <p className="text-xs font-bold text-gray-800">{req.subject}</p>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-indigo-600 flex items-center space-x-1">
                    <Clock size={12} />
                    <span>Lleva {getElapsedTime(req.startedAt || req.createdAt)}</span>
                  </span>
                  <button className="flex items-center space-x-1 text-[10px] font-black text-gray-400 hover:text-indigo-600 uppercase tracking-widest">
                    <span>Ir al Chat</span>
                    <ExternalLink size={12} />
                  </button>
                </div>
              </div>
            ))}
            {inProgress.length === 0 && (
              <div className="bg-gray-100/50 border-2 border-dashed border-gray-200 rounded-2xl py-12 text-center">
                <p className="text-gray-400 text-xs italic">No hay casos activos en este momento</p>
              </div>
            )}
          </div>

          {/* En espera */}
          <div className="space-y-4">
            <h3 className="text-[10px] font-black text-gray-400 uppercase px-1 tracking-widest">Lista de Espera ({waiting.length})</h3>
            {waiting.map((req, idx) => (
              <div key={req.id} className={`bg-white rounded-2xl p-5 border shadow-sm transition-all hover:border-indigo-300 group ${req.priority === 'high' ? 'border-red-100' : 'border-gray-100'}`}>
                <div className="flex justify-between items-start mb-3">
                  <div className="flex items-center space-x-3">
                    <span className="text-lg font-black text-gray-200 group-hover:text-indigo-200 transition-colors">#{idx + 1}</span>
                    <div>
                      <h4 className="text-sm font-bold text-gray-900">{req.userName}</h4>
                      <div className="flex items-center space-x-2 mt-0.5">
                        <span className={`text-[8px] px-1.5 py-0.5 rounded font-black uppercase ${
                          req.priority === 'high' ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-500'
                        }`}>
                          {req.priority}
                        </span>
                        <span className="flex items-center space-x-1 text-[9px] bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded font-bold">
                          {getCategoryIcon(req.category)}
                          <span>{req.category || 'General'}</span>
                        </span>
                      </div>
                    </div>
                  </div>
                  <button 
                    onClick={() => onUpdateStatus(req.id, 'in-progress')}
                    className="bg-[#5b5fc7] text-white text-[10px] font-black px-4 py-2 rounded-lg hover:shadow-lg shadow-indigo-100 transition-all active:scale-95"
                  >
                    ATENDER
                  </button>
                </div>
                {req.aiSummary && (
                  <p className="text-[11px] text-gray-600 bg-amber-50/30 p-2 rounded-lg border border-amber-50 leading-tight">
                    <span className="font-black text-amber-700">Resumen IA: </span>{req.aiSummary}
                  </p>
                )}
              </div>
            ))}
            {waiting.length === 0 && (
              <div className="bg-emerald-50 border-2 border-dashed border-emerald-100 rounded-2xl py-12 text-center">
                <p className="text-emerald-600 text-xs font-bold">¡Todo al día! La cola está vacía</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="p-4 font-black text-gray-400 uppercase tracking-wider">Usuario</th>
                <th className="p-4 font-black text-gray-400 uppercase tracking-wider">Asunto</th>
                <th className="p-4 font-black text-gray-400 uppercase tracking-wider">Categoría</th>
                <th className="p-4 font-black text-gray-400 uppercase tracking-wider">Estado</th>
                <th className="p-4 font-black text-gray-400 uppercase tracking-wider">Finalizado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {completed.map(req => (
                <tr key={req.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="p-4">
                    <p className="font-bold text-gray-800">{req.userName}</p>
                    <p className="text-[10px] text-gray-400">{req.userId}</p>
                  </td>
                  <td className="p-4 font-medium text-gray-700">{req.subject}</td>
                  <td className="p-4">
                    <span className="text-[9px] bg-gray-100 px-2 py-1 rounded-md font-bold text-gray-500">{req.category || 'General'}</span>
                  </td>
                  <td className="p-4">
                    <span className={`px-2 py-1 rounded-full text-[9px] font-black uppercase ${
                      req.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                    }`}>
                      {req.status === 'completed' ? 'Completado' : 'Cancelado'}
                    </span>
                  </td>
                  <td className="p-4 text-gray-400">
                    {req.completedAt ? new Date(req.completedAt).toLocaleString() : '-'}
                  </td>
                </tr>
              ))}
              {completed.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-16 text-center text-gray-400 italic">No hay historial para mostrar hoy</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default AgentDashboard;
