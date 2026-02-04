import React, { useState, useEffect } from 'react';
import { SupportRequest } from '../types';
import { Send, Loader2, Timer, Plus, MessageCircle, User, Edit3, Save, X, AlertTriangle } from 'lucide-react';

interface UserRequestViewProps {
  activeRequests: SupportRequest[];
  queuePosition: (id: string) => number;
  averageWaitTime: number;
  onSubmit: (request: Partial<SupportRequest>, id?: string) => void;
  onCancel: (id: string) => void;
}

const IT_TIPS = [
  "¿Has intentado reiniciar tu equipo?",
  "Nunca compartas tu contraseña.",
  "Mantén tus aplicaciones actualizadas.",
  "Si algo no carga, prueba borrar el caché."
];

const UserRequestView: React.FC<UserRequestViewProps> = ({ activeRequests, queuePosition, averageWaitTime, onSubmit, onCancel }) => {
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<SupportRequest['priority']>('medium');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(false); 
  const [editingId, setEditingId] = useState<string | null>(null);
  const [currentTip, setCurrentTip] = useState(0);

  useEffect(() => {
    if (activeRequests.length > 0 && !editingId) {
      setShowForm(false);
    } else if (activeRequests.length === 0) {
      setShowForm(true);
    }
  }, [activeRequests.length, editingId]);

  useEffect(() => {
    const tipInterval = setInterval(() => setCurrentTip(prev => (prev + 1) % IT_TIPS.length), 10000);
    return () => clearInterval(tipInterval);
  }, []);

  const handleStartEdit = (req: SupportRequest) => {
    setEditingId(req.id);
    setSubject(req.subject);
    setDescription(req.description);
    setPriority(req.priority);
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim()) return;
    setIsSubmitting(true);
    await onSubmit({ subject, description, priority }, editingId || undefined);
    setIsSubmitting(false);
    setEditingId(null);
    setSubject('');
    setDescription('');
    setPriority('medium');
    setShowForm(false);
  };

  const priorityOptions: { value: SupportRequest['priority']; label: string; color: string }[] = [
    { value: 'low', label: 'Baja', color: 'bg-emerald-50 text-emerald-600 border-emerald-100' },
    { value: 'medium', label: 'Media', color: 'bg-blue-50 text-blue-600 border-blue-100' },
    { value: 'high', label: 'Alta', color: 'bg-amber-50 text-amber-600 border-amber-100' },
    { value: 'urgent', label: 'Urgente', color: 'bg-red-50 text-red-600 border-red-200 shadow-sm' }
  ];

  return (
    <div className="max-w-2xl mx-auto pt-6">
      <div className="mb-8 flex justify-between items-center">
        <h1 className="text-3xl font-black text-gray-900">Mis Solicitudes</h1>
        {!showForm && (
          <button onClick={() => setShowForm(true)} className="bg-indigo-600 text-white px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center space-x-2">
            <Plus size={16} /><span>Nuevo Ticket</span>
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
        <div className="md:col-span-8">
          {showForm ? (
            <form onSubmit={handleSubmit} className="bg-white rounded-[2.5rem] shadow-2xl p-8 border border-gray-100 animate-in fade-in">
              <div className="flex justify-between items-center mb-8">
                <h3 className="text-lg font-black text-gray-800">{editingId ? 'Editar Solicitud' : 'Nueva Solicitud'}</h3>
                {activeRequests.length > 0 && <button type="button" onClick={() => setShowForm(false)} className="text-gray-400"><X size={16}/></button>}
              </div>
              <div className="space-y-6">
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 block ml-2">Asunto del Problema</label>
                  <input type="text" value={subject} onChange={e => setSubject(e.target.value)} className="w-full px-6 py-4 bg-gray-50 border-2 border-transparent focus:border-indigo-600 rounded-2xl font-bold" placeholder="Ej: No conecta Plataforma" required />
                </div>

                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 block ml-2">Nivel de Prioridad</label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {priorityOptions.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setPriority(opt.value)}
                        className={`py-3 px-2 rounded-xl text-[10px] font-black uppercase border-2 transition-all ${
                          priority === opt.value 
                            ? `${opt.color.replace('bg-', 'bg-opacity-100 bg-').replace('text-', 'text-white text-')} border-transparent scale-105 shadow-md` 
                            : 'bg-white text-gray-400 border-gray-100 hover:border-indigo-200'
                        }`}
                      >
                        {priority === opt.value && opt.value === 'urgent' && <AlertTriangle size={10} className="inline mr-1 mb-0.5" />}
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 block ml-2">Descripción (Opcional)</label>
                  <textarea rows={2} value={description} onChange={e => setDescription(e.target.value)} className="w-full px-6 py-4 bg-gray-50 border-2 border-transparent focus:border-indigo-600 rounded-2xl font-medium" placeholder="Brinda más detalles si es necesario..." />
                </div>

                <button type="submit" disabled={isSubmitting} className="w-full bg-indigo-600 text-white font-black py-5 rounded-2xl text-lg flex items-center justify-center space-x-3 hover:bg-indigo-700 transition-colors shadow-xl">
                  {isSubmitting ? <Loader2 className="animate-spin" /> : editingId ? <Save size={20}/> : <Send size={20}/>}
                  <span>{editingId ? 'GUARDAR CAMBIOS' : 'ENVIAR SOLICITUD'}</span>
                </button>
              </div>
            </form>
          ) : (
            <div className="space-y-4">
              {activeRequests.map(req => {
                const pos = queuePosition(req.id);
                const isWaiting = req.status === 'waiting';
                const agentInfo = req.agentId ? ` (${req.agentId})` : '';
                
                const priorityStyles = {
                  low: 'bg-emerald-50 text-emerald-600',
                  medium: 'bg-blue-50 text-blue-600',
                  high: 'bg-amber-50 text-amber-600',
                  urgent: 'bg-red-600 text-white shadow-sm animate-pulse'
                };

                return (
                  <div key={req.id} className={`bg-white rounded-3xl p-6 border shadow-sm transition-all ${req.priority === 'urgent' ? 'border-red-200' : 'border-gray-100'}`}>
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex items-center space-x-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${req.priority === 'urgent' ? 'bg-red-50 text-red-600' : 'bg-indigo-50 text-indigo-600'}`}>
                          {isWaiting ? <Timer size={20}/> : <User size={20}/>}
                        </div>
                        <div>
                          <h4 className="text-sm font-black text-gray-900">{req.subject}</h4>
                          <p className="text-[10px] text-gray-400 font-bold uppercase">ID: {req.id}</p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-3">
                        {isWaiting && <button onClick={() => handleStartEdit(req)} className="text-indigo-500 hover:text-indigo-700 transition-colors"><Edit3 size={16}/></button>}
                        <span className={`text-[9px] font-black px-2 py-1 rounded-lg uppercase ${priorityStyles[req.priority]}`}>
                          {req.priority === 'urgent' && '⚠️ '}
                          {req.priority === 'low' ? 'Baja' : req.priority === 'medium' ? 'Media' : req.priority === 'high' ? 'Alta' : 'Urgente'}
                        </span>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 mb-4">
                      <div className="bg-gray-50 p-3 rounded-xl">
                        <p className="text-[9px] font-black text-gray-400 uppercase mb-1">Estado</p>
                        <p className="text-xs font-black">
                          {isWaiting 
                            ? `En cola (#${pos})` 
                            : `Agente Asignado: ${req.agentName || 'Técnico IT'}${agentInfo}`
                          }
                        </p>
                      </div>
                      <div className="bg-gray-50 p-3 rounded-xl">
                        <p className="text-[9px] font-black text-gray-400 uppercase mb-1">Espera Est.</p>
                        <p className="text-xs font-black text-indigo-600">
                          {isWaiting ? `~${pos * averageWaitTime} min` : '~0 min'}
                        </p>
                      </div>
                    </div>
                    <div className="flex justify-between items-center pt-3 border-t border-gray-50">
                      <span className="text-[9px] font-bold text-gray-400">{new Date(Number(req.createdAt)).toLocaleTimeString()}</span>
                      {isWaiting && <button onClick={() => onCancel(req.id)} className="text-[9px] font-black text-red-400 uppercase">Cancelar</button>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className="md:col-span-4 space-y-6">
          <div className="bg-indigo-50 p-6 rounded-3xl border border-indigo-100"><p className="text-[9px] font-black text-indigo-400 uppercase mb-2">IT Tip</p><p className="text-xs text-indigo-900 italic">"{IT_TIPS[currentTip]}"</p></div>
          <div className="bg-white p-6 rounded-3xl border border-gray-100 text-center"><p className="text-3xl font-black text-gray-900">{averageWaitTime}<span className="text-xs font-bold text-gray-400 ml-1">min</span></p><p className="text-[10px] text-gray-400 font-black uppercase mt-1">Espera promedio</p></div>
        </div>
      </div>
    </div>
  );
};

export default UserRequestView;