
import React, { useState, useEffect } from 'react';
import { SupportRequest } from '../types';
import { Send, Loader2, Clock, Info, UserCheck, AlertCircle, Timer, ChevronRight } from 'lucide-react';
import { triageRequest } from '../services/geminiService';

interface UserRequestViewProps {
  activeRequest: SupportRequest | null;
  queuePosition: number;
  averageWaitTime: number;
  onSubmit: (request: Partial<SupportRequest>) => void;
  onCancel: (id: string) => void;
}

const UserRequestView: React.FC<UserRequestViewProps> = ({ activeRequest, queuePosition, averageWaitTime, onSubmit, onCancel }) => {
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    let timer: number;
    if (activeRequest) {
      const startTime = activeRequest.status === 'in-progress' && activeRequest.startedAt 
        ? activeRequest.startedAt 
        : activeRequest.createdAt;
      
      timer = window.setInterval(() => {
        setElapsed(Math.floor((Date.now() - startTime) / 1000));
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [activeRequest]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim()) return;
    setIsSubmitting(true);
    const analysis = await triageRequest(subject, description);
    onSubmit({
      subject,
      description,
      priority: analysis.priority as any,
      aiSummary: analysis.summary,
      category: analysis.category
    });
    setIsSubmitting(false);
  };

  if (activeRequest) {
    const isWaiting = activeRequest.status === 'waiting';
    const estWait = isWaiting ? Math.max(1, queuePosition * averageWaitTime) : 0;

    return (
      <div className="max-w-xl mx-auto py-8">
        <div className="bg-white rounded-[32px] shadow-xl border border-gray-100 overflow-hidden">
          <div className="p-8">
            <div className="flex flex-col items-center text-center mb-8">
              <div className={`w-20 h-20 rounded-3xl flex items-center justify-center mb-4 ${isWaiting ? 'bg-amber-100 text-amber-600' : 'bg-emerald-100 text-emerald-600'}`}>
                {isWaiting ? <Timer size={40} className="animate-pulse" /> : <UserCheck size={40} />}
              </div>
              <h2 className="text-2xl font-black text-gray-900 tracking-tight">
                {isWaiting ? `Estás en la posición #${queuePosition}` : '¡Te estamos atendiendo!'}
              </h2>
              <p className="text-gray-400 text-xs font-medium mt-1">Ticket {activeRequest.id} • {activeRequest.category || 'General'}</p>
            </div>

            {/* Timeline simple */}
            <div className="flex items-center justify-between px-4 mb-8">
              <div className="flex flex-col items-center">
                <div className="w-4 h-4 rounded-full bg-emerald-500 mb-1" />
                <span className="text-[8px] font-black uppercase text-gray-400">Recibido</span>
              </div>
              <div className={`flex-1 h-0.5 mx-2 ${isWaiting ? 'bg-gray-100' : 'bg-emerald-500'}`} />
              <div className="flex flex-col items-center">
                <div className={`w-4 h-4 rounded-full mb-1 ${isWaiting ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                <span className="text-[8px] font-black uppercase text-gray-400">En Cola</span>
              </div>
              <div className={`flex-1 h-0.5 mx-2 ${activeRequest.status === 'in-progress' ? 'bg-emerald-500' : 'bg-gray-100'}`} />
              <div className="flex flex-col items-center">
                <div className={`w-4 h-4 rounded-full mb-1 ${activeRequest.status === 'in-progress' ? 'bg-emerald-500' : 'bg-gray-100'}`} />
                <span className="text-[8px] font-black uppercase text-gray-400">Asignado</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-8">
              <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                <p className="text-[10px] font-black text-gray-400 uppercase mb-1">Espera Estimada</p>
                <p className="text-xl font-black text-gray-800">{isWaiting ? `~${estWait} min` : '¡Ya!'}</p>
              </div>
              <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                <p className="text-[10px] font-black text-gray-400 uppercase mb-1">Llevas esperando</p>
                <p className="text-xl font-black text-indigo-600 font-mono">{formatTime(elapsed)}</p>
              </div>
            </div>

            <div className="bg-indigo-50/50 p-5 rounded-2xl border border-indigo-50 mb-6">
              <div className="flex items-center space-x-2 mb-2">
                <Info size={14} className="text-indigo-600" />
                <span className="text-[10px] font-black text-indigo-600 uppercase">¿Qué sigue?</span>
              </div>
              <p className="text-xs text-indigo-800 leading-relaxed font-medium">
                {isWaiting 
                  ? "Tu ticket ya fue priorizado por nuestra IA. En cuanto un agente se libere, abrirá un chat directo contigo en Microsoft Teams."
                  : "Un agente de IT está revisando tu caso en este momento. Te contactará por el chat oficial en unos instantes."
                }
              </p>
            </div>

            {isWaiting && (
              <button 
                onClick={() => onCancel(activeRequest.id)}
                className="w-full py-4 text-xs font-bold text-gray-400 hover:text-red-500 transition-colors"
              >
                Cancelar mi pedido de ayuda
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto pt-8">
      <div className="text-center mb-10">
        <h1 className="text-4xl font-black text-gray-900 mb-3 tracking-tight">Centro de Ayuda</h1>
        <p className="text-gray-500 font-medium">Promedio de espera actual: <span className="text-indigo-600 font-bold">{averageWaitTime} min</span></p>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-[40px] shadow-2xl p-10 border border-gray-100">
        <div className="space-y-6">
          <div>
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1 mb-2 block">Asunto del Problema</label>
            <input 
              type="text" 
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Ej: Problema con contraseña de SAP"
              className="w-full px-6 py-4 bg-gray-50 border-2 border-transparent focus:border-[#5b5fc7] focus:bg-white rounded-2xl outline-none transition-all text-gray-800 font-bold"
              required
            />
          </div>

          <div>
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1 mb-2 block">Describe qué sucede</label>
            <textarea 
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Danos un poco más de contexto..."
              className="w-full px-6 py-4 bg-gray-50 border-2 border-transparent focus:border-[#5b5fc7] focus:bg-white rounded-2xl outline-none transition-all text-gray-800 font-medium resize-none"
            />
          </div>

          <button 
            type="submit"
            disabled={isSubmitting || !subject.trim()}
            className="w-full bg-[#5b5fc7] hover:bg-[#4b4fa7] disabled:bg-gray-200 text-white font-black py-5 rounded-2xl text-lg shadow-xl shadow-indigo-100 flex items-center justify-center space-x-3 transition-all transform active:scale-[0.98]"
          >
            {isSubmitting ? (
              <Loader2 className="animate-spin" size={24} />
            ) : (
              <>
                <Send size={20} />
                <span>Enviar Solicitud</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};

export default UserRequestView;
