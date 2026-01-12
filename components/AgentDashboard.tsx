
import React, { useState, useEffect } from 'react';
import { SupportRequest, QueueStats } from '../types';
import { Clock, CheckCircle, Play, XCircle, AlertTriangle, User, MessageSquare } from 'lucide-react';

interface AgentDashboardProps {
  requests: SupportRequest[];
  stats: QueueStats;
  onUpdateStatus: (id: string, newStatus: SupportRequest['status']) => void;
}

const AgentDashboard: React.FC<AgentDashboardProps> = ({ requests, stats, onUpdateStatus }) => {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const waiting = requests.filter(r => r.status === 'waiting').sort((a, b) => {
    // Ordenar por prioridad primero, luego por tiempo
    const priorityMap = { high: 3, medium: 2, low: 1 };
    if (priorityMap[a.priority] !== priorityMap[b.priority]) {
      return priorityMap[b.priority] - priorityMap[a.priority];
    }
    return a.createdAt - b.createdAt;
  });

  const inProgress = requests.filter(r => r.status === 'in-progress');

  const getElapsedTime = (createdAt: number) => {
    const seconds = Math.floor((now - createdAt) / 1000);
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      {/* Header de Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <Clock className="text-indigo-500" size={20} />
            <span className="text-[10px] font-black text-gray-400 uppercase">Espera Media</span>
          </div>
          <p className="text-3xl font-black text-gray-900">{stats.averageWaitTime} min</p>
        </div>
        <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <AlertTriangle className="text-amber-500" size={20} />
            <span className="text-[10px] font-black text-gray-400 uppercase">En Cola</span>
          </div>
          <p className="text-3xl font-black text-gray-900">{waiting.length}</p>
        </div>
        <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <Play className="text-emerald-500" size={20} />
            <span className="text-[10px] font-black text-gray-400 uppercase">Atendiendo</span>
          </div>
          <p className="text-3xl font-black text-gray-900">{inProgress.length}</p>
        </div>
        <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <CheckCircle className="text-blue-500" size={20} />
            <span className="text-[10px] font-black text-gray-400 uppercase">Completados</span>
          </div>
          <p className="text-3xl font-black text-gray-900">{stats.completedToday}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Panel de Usuarios Siendo Atendidos */}
        <section className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-black text-gray-800 flex items-center space-x-2">
              <MessageSquare className="text-indigo-600" size={22} />
              <span>Sesiones Activas</span>
            </h2>
            <span className="bg-indigo-100 text-indigo-700 text-xs font-bold px-3 py-1 rounded-full">
              {inProgress.length} Activas
            </span>
          </div>
          
          <div className="space-y-4">
            {inProgress.length === 0 ? (
              <div className="bg-gray-50 border-2 border-dashed border-gray-200 rounded-[32px] p-12 text-center">
                <p className="text-gray-400 font-medium">No tienes chats activos en este momento.</p>
              </div>
            ) : (
              inProgress.map(req => (
                <div key={req.id} className="bg-white border-2 border-indigo-100 rounded-[32px] p-6 shadow-md relative group transition-all">
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center space-x-3">
                      <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center text-white font-black text-lg">
                        {req.userName.charAt(0)}
                      </div>
                      <div>
                        <h3 className="font-bold text-gray-900">{req.userName}</h3>
                        <p className="text-xs text-gray-500">Ticket: {req.id}</p>
                      </div>
                    </div>
                    <div className="flex space-x-2">
                      <button 
                        onClick={() => onUpdateStatus(req.id, 'completed')}
                        className="p-3 bg-emerald-50 text-emerald-600 hover:bg-emerald-500 hover:text-white rounded-2xl transition-all"
                        title="Finalizar Caso"
                      >
                        <CheckCircle size={20} />
                      </button>
                      <button 
                        onClick={() => onUpdateStatus(req.id, 'cancelled')}
                        className="p-3 bg-red-50 text-red-600 hover:bg-red-500 hover:text-white rounded-2xl transition-all"
                        title="Anular"
                      >
                        <XCircle size={20} />
                      </button>
                    </div>
                  </div>
                  <div className="bg-gray-50 p-4 rounded-2xl mb-4 border border-gray-100">
                    <p className="font-bold text-sm text-gray-800 mb-1">{req.subject}</p>
                    <p className="text-xs text-gray-600 line-clamp-2">{req.description}</p>
                  </div>
                  <div className="flex items-center justify-between text-[10px] font-black uppercase">
                    <span className="flex items-center space-x-1 text-indigo-600">
                      <Clock size={12} />
                      <span>En curso: {getElapsedTime(req.startedAt || req.createdAt)}</span>
                    </span>
                    <span className="text-gray-400">Atención Directa</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Panel de Cola de Espera */}
        <section className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-black text-gray-800 flex items-center space-x-2">
              <Clock className="text-amber-600" size={22} />
              <span>Cola de Espera</span>
            </h2>
            <span className="bg-amber-100 text-amber-700 text-xs font-bold px-3 py-1 rounded-full">
              {waiting.length} Pendientes
            </span>
          </div>

          <div className="space-y-4">
            {waiting.length === 0 ? (
              <div className="bg-gray-50 border-2 border-dashed border-gray-200 rounded-[32px] p-12 text-center">
                <p className="text-gray-400 font-medium">¡Excelente! La cola está vacía.</p>
              </div>
            ) : (
              waiting.map((req, index) => (
                <div 
                  key={req.id} 
                  className={`bg-white border-2 rounded-[32px] p-6 shadow-sm hover:shadow-lg transition-all cursor-pointer ${
                    req.priority === 'high' ? 'border-red-100' : 'border-gray-100'
                  }`}
                >
                  <div className="flex justify-between items-center mb-4">
                    <div className="flex items-center space-x-4">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center font-black text-sm ${
                        req.priority === 'high' ? 'bg-red-50 text-red-600' : 'bg-gray-50 text-gray-400'
                      }`}>
                        #{index + 1}
                      </div>
                      <div>
                        <h3 className="font-bold text-gray-900">{req.userName}</h3>
                        <div className="flex items-center space-x-2">
                           <span className={`text-[9px] px-2 py-0.5 rounded-full font-black uppercase ${
                            req.priority === 'high' ? 'bg-red-100 text-red-700 animate-pulse' : 
                            req.priority === 'medium' ? 'bg-amber-100 text-amber-700' : 
                            'bg-blue-100 text-blue-700'
                          }`}>
                            {req.priority}
                          </span>
                          <span className="text-[10px] font-bold text-gray-400">{getElapsedTime(req.createdAt)} en espera</span>
                        </div>
                      </div>
                    </div>
                    <button 
                      onClick={() => onUpdateStatus(req.id, 'in-progress')}
                      className="bg-[#5b5fc7] text-white text-xs font-black px-6 py-3 rounded-2xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"
                    >
                      ATENDER
                    </button>
                  </div>
                  <div className="mt-2 pl-14">
                    <p className="text-sm font-bold text-gray-800 line-clamp-1">{req.subject}</p>
                    {req.aiSummary && (
                      <div className="mt-2 flex items-start space-x-2 bg-indigo-50/50 p-3 rounded-xl border border-indigo-50">
                        <span className="text-[10px] font-black text-indigo-600 uppercase mt-0.5">IA:</span>
                        <p className="text-[11px] text-indigo-700 font-medium leading-tight">{req.aiSummary}</p>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
};

export default AgentDashboard;
