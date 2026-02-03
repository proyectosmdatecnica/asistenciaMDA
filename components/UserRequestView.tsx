
import React, { useState, useEffect } from 'react';
import { SupportRequest } from '../types';
import { Send, Loader2, Timer, Plus, MessageCircle, User, Edit3, Save, X } from 'lucide-react';

interface UserRequestViewProps {
  activeRequests: SupportRequest[];
  queuePosition: (id: string) => number;
  averageWaitTime: number;
  onSubmit: (request: Partial<SupportRequest>, id?: string) => void;
  onCancel: (id: string) => void;
}

const IT_TIPS = [
  "¿Has intentado reiniciar tu equipo? Soluciona el 80% de los incidentes básicos.",
  "Nunca compartas tu contraseña, ni siquiera con el personal de IT.",
  "Mantén tus aplicaciones actualizadas para asegurar el mejor rendimiento.",
  "Si algo no carga, prueba borrar el caché de tu navegador.",
  "Recuerda que Teams tiene atajos de teclado geniales, presiona Ctrl+. para verlos."
];

const UserRequestView: React.FC<UserRequestViewProps> = ({ activeRequests, queuePosition, averageWaitTime, onSubmit, onCancel }) => {
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(activeRequests.length === 0);
  const [currentTip, setCurrentTip] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    const tipInterval = setInterval(() => {
      setCurrentTip(prev => (prev + 1) % IT_TIPS.length);
    }, 10000);
    return () => clearInterval(tipInterval);
  }, []);

  const handleStartEdit = (req: SupportRequest) => {
    setEditingId(req.id);
    setSubject(req.subject);
    setDescription(req.description);
    setPriority(req.priority);
    setShowForm(true);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setSubject('');
    setDescription('');
    setPriority('medium');
    if (activeRequests.length > 0) setShowForm(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim()) return;
    setIsSubmitting(true);
    
    await onSubmit({
      subject,
      description,
      priority: priority
    }, editingId || undefined);
    
    setIsSubmitting(false);
    setEditingId(null);
    setSubject('');
    setDescription('');
    setShowForm(false);
  };

  const TicketCard = ({ req }: { req: SupportRequest }) => {
    const isWaiting = req.status === 'waiting';
    const pos = queuePosition(req.id);
    const estWait = isWaiting ? Math.max(1, pos * averageWaitTime) : 0;

    return (
      <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden mb-4 animate-in slide-in-from-bottom-4">
        <div className="p-5">
          <div className="flex justify-between items-start mb-4">
            <div className="flex items-center space-x-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                isWaiting ? 'bg-amber-100 text-amber-600' : 'bg-indigo-100 text-indigo-600'
              }`}>
                {isWaiting ? <Timer size={20} className="animate-pulse" /> : <User size={20} />}
              </div>
              <div>
                <h4 className="text-sm font-black text-gray-900 truncate max-w-[180px] md:max-w-[300px]">{req.subject}</h4>
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">ID: {req.id}</p>
              </div>
            </div>
            <div className="flex flex-col items-end gap-1">
              <span className={`text-[9px] font-black px-2 py-1 rounded-lg uppercase tracking-widest ${
                req.priority === 'high' ? 'bg-red-50 text-red-600' : req.priority === 'medium' ? 'bg-amber-50 text-amber-600' : 'bg-blue-50 text-blue-600'
              }`}>
                {req.priority === 'high' ? 'Alta' : req.priority === 'medium' ? 'Media' : 'Baja'}
              </span>
              {isWaiting && (
                <button 
                  onClick={() => handleStartEdit(req)}
                  className="flex items-center space-x-1 text-[9px] font-black text-indigo-500 hover:text-indigo-700 uppercase"
                >
                  <Edit3 size={10} />
                  <span>Editar</span>
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-gray-50 p-3 rounded-xl">
              <p className="text-[9px] font-black text-gray-400 uppercase mb-0.5">Estado</p>
              <p className="text-xs font-black text-gray-800">
                {isWaiting ? `En cola (#${pos})` : 'Atendiendo'}
              </p>
            </div>
            <div className="bg-gray-50 p-3 rounded-xl">
              <p className="text-[9px] font-black text-gray-400 uppercase mb-0.5">Espera Est.</p>
              <p className="text-xs font-black text-indigo-600">{isWaiting ? `~${estWait} min` : '¡Ahora!'}</p>
            </div>
          </div>

          {!isWaiting && req.agentName && (
            <div className="flex items-center space-x-3 p-3 bg-indigo-600 text-white rounded-xl mb-4">
              <User size={16} />
              <div>
                <p className="text-[9px] font-black uppercase opacity-80 leading-none mb-1">Agente Asignado</p>
                <p className="text-xs font-bold leading-none">{req.agentName}</p>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between pt-3 border-t border-gray-50">
            <span className="text-[9px] font-bold text-gray-400 uppercase">
              {new Date(Number(req.createdAt)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
            {isWaiting && (
              <button 
                onClick={() => onCancel(req.id)}
                className="text-[9px] font-black text-red-400 hover:text-red-600 uppercase tracking-widest"
              >
                Cancelar
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-2xl mx-auto pt-6">
      <div className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight">Mis Solicitudes</h1>
          <p className="text-gray-500 font-medium text-sm">Gestiona tus tickets de soporte.</p>
        </div>
        {!showForm && (
          <button 
            onClick={() => setShowForm(true)}
            className="bg-[#5b5fc7] text-white px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center space-x-2 shadow-xl hover:scale-105 transition-all"
          >
            <Plus size={16} />
            <span>Nuevo Ticket</span>
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
        <div className="md:col-span-8">
          {showForm ? (
            <form onSubmit={handleSubmit} className="bg-white rounded-[2.5rem] shadow-2xl p-8 border border-gray-100 animate-in fade-in slide-in-from-top-4">
              <div className="flex items-center justify-between mb-8">
                <h3 className="text-lg font-black text-gray-800">{editingId ? 'Editar Solicitud' : 'Nueva Solicitud'}</h3>
                <button type="button" onClick={handleCancelEdit} className="text-xs font-black text-gray-400 hover:text-gray-600 uppercase">
                  <X size={16} />
                </button>
              </div>
              
              <div className="space-y-6">
                <div className="group">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] ml-1 mb-2 block">Asunto</label>
                  <input 
                    type="text" 
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className="w-full px-6 py-4 bg-gray-50 border-2 border-transparent focus:border-[#5b5fc7] focus:bg-white rounded-2xl outline-none transition-all font-bold"
                    required
                    placeholder="Ej: No funciona mi VPN"
                  />
                </div>

                <div className="group">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] ml-1 mb-2 block">Urgencia</label>
                  <div className="grid grid-cols-3 gap-3">
                    {['low', 'medium', 'high'].map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setPriority(p as any)}
                        className={`py-3 rounded-xl text-[10px] font-black uppercase tracking-widest border-2 transition-all ${
                          priority === p 
                            ? (p === 'high' ? 'bg-red-50 border-red-500 text-red-600' : p === 'medium' ? 'bg-amber-50 border-amber-500 text-amber-600' : 'bg-blue-50 border-blue-500 text-blue-600')
                            : 'bg-white border-gray-100 text-gray-400'
                        }`}
                      >
                        {p === 'low' ? 'Baja' : p === 'medium' ? 'Media' : 'Alta'}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="group">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] ml-1 mb-2 block">Detalles</label>
                  <textarea 
                    rows={2}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full px-6 py-4 bg-gray-50 border-2 border-transparent focus:border-[#5b5fc7] focus:bg-white rounded-2xl outline-none transition-all font-medium resize-none shadow-inner"
                    placeholder="Describe el problema aquí..."
                  />
                </div>

                <button 
                  type="submit"
                  disabled={isSubmitting || !subject.trim()}
                  className="w-full bg-[#5b5fc7] hover:bg-[#4b4fa7] disabled:bg-gray-200 text-white font-black py-5 rounded-2xl text-lg shadow-xl flex items-center justify-center space-x-3 transition-all"
                >
                  {isSubmitting ? <Loader2 className="animate-spin" /> : (editingId ? <Save size={20}/> : <Send size={20}/>)}
                  <span>{isSubmitting ? 'Guardando...' : (editingId ? 'GUARDAR CAMBIOS' : 'ENVIAR SOLICITUD')}</span>
                </button>
              </div>
            </form>
          ) : (
            <div className="space-y-4">
              {activeRequests.length === 0 ? (
                <div className="bg-white rounded-[2.5rem] p-20 text-center border-2 border-dashed border-gray-200">
                  <MessageCircle size={48} className="mx-auto text-gray-200 mb-4" />
                  <p className="text-gray-400 font-black uppercase text-sm">No hay tickets activos</p>
                </div>
              ) : (
                activeRequests.map(req => <TicketCard key={req.id} req={req} />)
              )}
            </div>
          )}
        </div>

        <div className="md:col-span-4 space-y-6">
          <div className="bg-indigo-50 p-6 rounded-3xl border border-indigo-100">
            <p className="text-[9px] font-black text-indigo-400 uppercase mb-4 tracking-widest">IT Tip</p>
            <p className="text-xs text-indigo-900 font-medium leading-relaxed italic">"{IT_TIPS[currentTip]}"</p>
          </div>

          <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm text-center">
             <p className="text-3xl font-black text-gray-900">{averageWaitTime}<span className="text-xs font-bold text-gray-400 ml-1">min</span></p>
             <p className="text-[10px] text-gray-400 font-black uppercase mt-1">Espera promedio</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UserRequestView;
