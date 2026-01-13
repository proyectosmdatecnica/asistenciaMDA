
import React, { useState, useEffect, useMemo } from 'react';
import { SupportRequest } from '../types';
import { Send, Loader2, Clock, Info, UserCheck, AlertCircle, Timer, Lightbulb } from 'lucide-react';
import { triageRequest } from '../services/geminiService';

interface UserRequestViewProps {
  activeRequest: SupportRequest | null;
  queuePosition: number;
  averageWaitTime: number;
  onSubmit: (request: Partial<SupportRequest>) => void;
  onCancel: (id: string) => void;
}

const IT_TIPS = [
  "¿Has intentado reiniciar tu equipo? Soluciona el 80% de los incidentes básicos.",
  "Nunca compartas tu contraseña, ni siquiera con el personal de IT.",
  "Mantén tus aplicaciones actualizadas para asegurar el mejor rendimiento.",
  "Si algo no carga, prueba borrar el caché de tu navegador.",
  "Recuerda que Teams tiene atajos de teclado geniales, presiona Ctrl+. para verlos."
];

const UserRequestView: React.FC<UserRequestViewProps> = ({ activeRequest, queuePosition, averageWaitTime, onSubmit, onCancel }) => {
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [currentTip, setCurrentTip] = useState(0);

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

  useEffect(() => {
    if (activeRequest?.status === 'waiting') {
      const tipInterval = setInterval(() => {
        setCurrentTip(prev => (prev + 1) % IT_TIPS.length);
      }, 8000);
      return () => clearInterval(tipInterval);
    }
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
        <div className="bg-white rounded-[32px] shadow-2xl border border-gray-100 overflow-hidden animate-in zoom-in-95 duration-500">
          <div className="p-8">
            <div className="flex flex-col items-center text-center mb-8">
              <div className={`w-20 h-20 rounded-3xl flex items-center justify-center mb-4 transition-colors ${isWaiting ? 'bg-amber-100 text-amber-600 shadow-lg shadow-amber-50' : 'bg-emerald-100 text-emerald-600 shadow-lg shadow-emerald-50'}`}>
                {isWaiting ? <Timer size={40} className="animate-pulse" /> : <UserCheck size={40} />}
              </div>
              <h2 className="text-2xl font-black text-gray-900 tracking-tight">
                {isWaiting ? `Posición en cola: #${queuePosition}` : '¡Tu agente está listo!'}
              </h2>
              <div className="flex items-center space-x-2 mt-1">
                 <span className="text-gray-400 text-[10px] font-bold uppercase tracking-widest">Ticket {activeRequest.id}</span>
                 <span className="w-1 h-1 bg-gray-200 rounded-full" />
                 <span className="text-indigo-600 text-[10px] font-black uppercase tracking-widest">{activeRequest.category || 'General'}</span>
              </div>
            </div>

            {/* Timeline Lineal */}
            <div className="relative flex items-center justify-between px-6 mb-10">
              <div className="absolute top-1/2 left-0 w-full h-0.5 bg-gray-100 -translate-y-1/2 z-0" />
              <div className={`absolute top-1/2 left-0 h-0.5 bg-indigo-500 -translate-y-1/2 z-0 transition-all duration-1000 ${
                activeRequest.status === 'in-progress' ? 'w-full' : 'w-1/2'
              }`} />
              
              <div className="relative z-10 flex flex-col items-center">
                <div className="w-4 h-4 rounded-full bg-indigo-500 border-4 border-white shadow-sm" />
                <span className="text-[8px] font-black uppercase text-gray-400 mt-2">Enviado</span>
              </div>
              <div className="relative z-10 flex flex-col items-center">
                <div className={`w-4 h-4 rounded-full border-4 border-white shadow-sm ${isWaiting ? 'bg-amber-500 animate-pulse' : 'bg-indigo-500'}`} />
                <span className="text-[8px] font-black uppercase text-gray-400 mt-2">En Cola</span>
              </div>
              <div className="relative z-10 flex flex-col items-center">
                <div className={`w-4 h-4 rounded-full border-4 border-white shadow-sm ${activeRequest.status === 'in-progress' ? 'bg-indigo-500' : 'bg-gray-200'}`} />
                <span className="text-[8px] font-black uppercase text-gray-400 mt-2">Atendiendo</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-8">
              <div className="bg-gray-50/80 p-5 rounded-2xl border border-gray-100 backdrop-blur-sm">
                <p className="text-[10px] font-black text-gray-400 uppercase mb-1 tracking-tighter">Tiempo Estimado</p>
                <p className="text-xl font-black text-gray-800">{isWaiting ? `~${estWait} min` : '¡Ahora!'}</p>
              </div>
              <div className="bg-gray-50/80 p-5 rounded-2xl border border-gray-100 backdrop-blur-sm">
                <p className="text-[10px] font-black text-gray-400 uppercase mb-1 tracking-tighter">Tu tiempo total</p>
                <p className="text-xl font-black text-indigo-600 font-mono">{formatTime(elapsed)}</p>
              </div>
            </div>

            {isWaiting && (
              <div className="bg-amber-50/40 p-5 rounded-2xl border border-amber-100 mb-6 animate-in slide-in-from-right-4">
                <div className="flex items-center space-x-2 mb-2">
                  <Lightbulb size={14} className="text-amber-600" />
                  <span className="text-[10px] font-black text-amber-600 uppercase tracking-widest">Tip de Soporte</span>
                </div>
                <p className="text-xs text-amber-900 leading-relaxed font-medium italic">
                  "{IT_TIPS[currentTip]}"
                </p>
              </div>
            )}

            <div className="bg-[#5b5fc7]/5 p-6 rounded-2xl border border-[#5b5fc7]/10 mb-6">
              <div className="flex items-center space-x-2 mb-2">
                <Info size={14} className="text-[#5b5fc7]" />
                <span className="text-[10px] font-black text-[#5b5fc7] uppercase tracking-widest">¿Qué sucede ahora?</span>
              </div>
              <p className="text-[11px] text-[#5b5fc7] leading-relaxed font-bold">
                {isWaiting 
                  ? "Nuestra IA ha priorizado tu caso. En cuanto el agente esté disponible, iniciará la comunicación directamente contigo en Teams."
                  : "El equipo de soporte está revisando los detalles que proporcionaste. Te contactarán por chat en breves instantes."
                }
              </p>
            </div>

            {isWaiting && (
              <button 
                onClick={() => onCancel(activeRequest.id)}
                className="w-full py-4 text-[10px] font-black text-gray-400 hover:text-red-500 uppercase tracking-[0.2em] transition-colors"
              >
                Retirar solicitud
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto pt-8">
      <div className="text-center mb-12 animate-in fade-in slide-in-from-top-4 duration-700">
        <h1 className="text-4xl font-black text-gray-900 mb-3 tracking-tight">Hub de Soporte IT</h1>
        <p className="text-gray-500 font-medium">Estamos aquí para ayudarte. Tiempo de espera actual: <span className="text-indigo-600 font-black">{averageWaitTime} min</span></p>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-[40px] shadow-2xl p-10 border border-gray-50 animate-in slide-in-from-bottom-8 duration-700">
        <div className="space-y-8">
          <div className="group">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] ml-1 mb-3 block group-focus-within:text-indigo-600 transition-colors">¿En qué podemos ayudarte?</label>
            <input 
              type="text" 
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Ej: No funciona mi acceso a VPN"
              className="w-full px-8 py-5 bg-gray-50 border-2 border-transparent focus:border-[#5b5fc7] focus:bg-white rounded-3xl outline-none transition-all text-gray-800 font-bold text-lg shadow-inner"
              required
            />
          </div>

          <div className="group">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] ml-1 mb-3 block group-focus-within:text-indigo-600 transition-colors">Detalles adicionales (Opcional)</label>
            <textarea 
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Cuéntanos un poco más para que podamos traerte la solución más rápido..."
              className="w-full px-8 py-5 bg-gray-50 border-2 border-transparent focus:border-[#5b5fc7] focus:bg-white rounded-3xl outline-none transition-all text-gray-800 font-medium resize-none shadow-inner"
            />
          </div>

          <button 
            type="submit"
            disabled={isSubmitting || !subject.trim()}
            className="w-full bg-[#5b5fc7] hover:bg-[#4b4fa7] disabled:bg-gray-200 text-white font-black py-6 rounded-[2rem] text-xl shadow-2xl shadow-indigo-200 flex items-center justify-center space-x-4 transition-all transform hover:-translate-y-1 active:scale-95"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="animate-spin" size={24} />
                <span>Analizando con IA...</span>
              </>
            ) : (
              <>
                <Send size={24} />
                <span>PEDIR ASISTENCIA</span>
              </>
            )}
          </button>
          <p className="text-[9px] text-center text-gray-400 uppercase font-bold tracking-widest">Tu solicitud será triada automáticamente por Inteligencia Artificial</p>
        </div>
      </form>
    </div>
  );
};

export default UserRequestView;
