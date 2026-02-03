
import React, { useState, useEffect } from 'react';
import { SupportRequest } from '../types';
import { Send, Loader2, Timer, Plus, MessageCircle, User, Edit3, Save, X, Activity } from 'lucide-react';

interface UserRequestViewProps {
  activeRequests: SupportRequest[];
  isLoading: boolean;
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

const UserRequestView: React.FC<UserRequestViewProps> = ({ activeRequests, isLoading, queuePosition, averageWaitTime, onSubmit, onCancel }) => {
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [currentTip, setCurrentTip] = useState(0);

  // AUTO-HIDE FORM IF THERE ARE TICKETS LOADED
  useEffect(() => {
    if (!isLoading) {
      if (activeRequests.length > 0 && !editingId) {
        setShowForm(false);
      } else if (activeRequests.length === 0) {
        setShowForm(true);
      }
    }
  }, [activeRequests.length, editingId, isLoading]);

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
    setShowForm(false);
  };

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto pt-20 flex flex-col items-center justify-center space-y-4">
        <Loader2 className="animate-spin text-indigo-600" size={40} />
        <p className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] animate-pulse">Sincronizando con IT...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto pt-6 px-4">
      <div className="mb-10 flex justify-between items-center">
        <div className="flex items-center space-x-3">
          <Activity className="text-indigo-600" size={28} />
          <h1 className="text-3xl font-black text-gray-900 leading-none">Mis Solicitudes</h1>
        </div>
        {!showForm && (
          <button onClick={() => { setEditingId(null); setSubject(''); setDescription(''); setShowForm(true); }} className="bg-indigo-600 text-white px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center space-x-3 shadow-xl shadow-indigo-100">
            <Plus size={18} /><span>Nuevo Ticket</span>
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
        <div className="md:col-span-8">
          {showForm ? (
            <form onSubmit={handleSubmit} className="bg-white rounded-[2.5rem] shadow-2xl p-8 border border-gray-100 animate-in slide-in-from-bottom-4">
              <div className="flex justify-between items-center mb-8">
                <h3 className="text-lg font-black text-gray-800">{editingId ? 'Editar Solicitud' : 'Describir Problema'}</h3>
                {activeRequests.length > 0 && <button type="button" onClick={() => setShowForm(false)} className="p-2 hover:bg-gray-100 rounded-xl transition-colors"><X size={20} className="text-gray-400"/></button>}
              </div>
              <div className="space-y-6">
                <input type="text" value={subject} onChange={e => setSubject(e.target.value)} className="w-full px-6 py-4 bg-gray-50 border-2 border-transparent focus:border-indigo-600 focus:bg-white rounded-2xl font-bold outline-none" placeholder="¿Qué está fallando?" required />
                <textarea rows={3} value={description} onChange={e => setDescription(e.target.value)} className="w-full px-6 py-4 bg-gray-50 border-2 border-transparent focus:border-indigo-600 focus:bg-white rounded-2xl font-medium outline-none resize-none" placeholder="Describe brevemente lo que sucede..." />
                <button type="submit" disabled={isSubmitting} className="w-full bg-indigo-600 text-white font-black py-5 rounded-[1.5rem] text-lg flex items-center justify-center space-x-3 hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-200">
                  {isSubmitting ? <Loader2 className="animate-spin" /> : editingId ? <Save size={20}/> : <Send size={20}/>}
                  <span>{editingId ? 'GUARDAR CAMBIOS' : 'ENVIAR SOLICITUD'}</span>
                </button>
              </div>
            </form>
          ) : (
            <div className="space-y-5">
              {activeRequests.map(req => {
                const pos = queuePosition(req.id);
                return (
                  <div key={req.id} className="bg-white rounded-[2rem] p-8 border border-gray-100 shadow-xl shadow-gray-200/20 relative group">
                    <div className="flex justify-between items-start mb-6">
                      <div className="flex items-center space-x-4">
                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-inner ${req.status === 'waiting' ? 'bg-amber-50 text-amber-600' : 'bg-indigo-50 text-indigo-600'}`}>
                          {req.status === 'waiting' ? <Timer size={24}/> : <User size={24}/>}
                        </div>
                        <div>
                          <h4 className="text-base font-black text-gray-900 leading-tight">{req.subject}</h4>
                          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">Ticket {req.id}</p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-3">
                        {req.status === 'waiting' && <button onClick={() => handleStartEdit(req)} className="p-2 text-indigo-400 hover:bg-indigo-50 rounded-xl transition-all" title="Editar"><Edit3 size={18}/></button>}
                        <span className={`text-[10px] font-black px-3 py-1 rounded-lg uppercase tracking-widest bg-gray-50 text-gray-500`}>{req.priority}</span>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4 mb-6">
                      <div className="bg-gray-50/80 p-5 rounded-2xl border border-gray-100">
                        <p className="text-[9px] font-black text-gray-400 uppercase mb-2">Estado</p>
                        <p className="text-sm font-black text-gray-800">{req.status === 'waiting' ? `En Cola (#${pos})` : 'Agente Asignado'}</p>
                      </div>
                      <div className="bg-indigo-50/40 p-5 rounded-2xl border border-indigo-50">
                        <p className="text-[9px] font-black text-indigo-300 uppercase mb-2">Estimado</p>
                        <p className="text-sm font-black text-indigo-600">~{pos * averageWaitTime} min</p>
                      </div>
                    </div>
                    <div className="flex justify-between items-center pt-5 border-t border-gray-50">
                      <span className="text-[10px] font-bold text-gray-400">Recibido {new Date(Number(req.createdAt)).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
                      {req.status === 'waiting' && <button onClick={() => onCancel(req.id)} className="text-[10px] font-black text-red-400 hover:text-red-600 transition-colors uppercase tracking-widest">Cancelar</button>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className="md:col-span-4 space-y-6">
          <div className="bg-white p-8 rounded-[2rem] border border-gray-100 shadow-sm flex flex-col items-center text-center">
            <Timer size={40} className="text-emerald-500 mb-4 animate-bounce-short"/>
            <p className="text-4xl font-black text-gray-900">{averageWaitTime}<span className="text-sm font-bold text-gray-400 ml-1">min</span></p>
            <p className="text-[11px] text-gray-400 font-black uppercase tracking-widest mt-1">Espera promedio</p>
          </div>
          <div className="bg-indigo-600 p-8 rounded-[2rem] text-white shadow-xl shadow-indigo-100">
            <p className="text-[10px] font-black text-indigo-200 uppercase tracking-widest mb-4">Consejo IT</p>
            <p className="text-sm font-bold italic leading-relaxed">"{IT_TIPS[currentTip]}"</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UserRequestView;
