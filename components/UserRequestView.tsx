
import React, { useState, useEffect } from 'react';
import { SupportRequest } from '../types';
import { Send, Loader2, Clock, Info, UserCheck, AlertCircle, Timer } from 'lucide-react';
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
      aiSummary: analysis.summary
    });
    setIsSubmitting(false);
  };

  if (activeRequest) {
    const isWaiting = activeRequest.status === 'waiting';
    const estWait = isWaiting ? Math.max(1, queuePosition * averageWaitTime) : 0;

    return (
      <div className="max-w-2xl mx-auto py-10">
        <div className="bg-white rounded-3xl shadow-2xl border border-gray-100 overflow-hidden">
          <div className={`h-2 w-full ${isWaiting ? 'bg-amber-400' : 'bg-[#5b5fc7]'} transition-colors duration-500`} />
          
          <div className="p-10">
            <div className="flex justify-between items-center mb-10">
              <div>
                <h2 className="text-3xl font-black text-gray-900 tracking-tight">
                  {isWaiting ? 'Tu turno en la cola' : '¡Ya estamos contigo!'}
                </h2>
                <p className="text-gray-400 font-mono text-xs mt-1">ID TICKET: {activeRequest.id}</p>
              </div>
              <div className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest ${
                isWaiting ? 'bg-amber-100 text-amber-700' : 'bg-indigo-100 text-indigo-700'
              }`}>
                {isWaiting ? 'En Espera' : 'Atendiendo'}
              </div>
            </div>

            <div className="grid gap-8">
              <div className={`p-8 rounded-3xl border-2 flex items-center ${isWaiting ? 'bg-amber-50 border-amber-100' : 'bg-indigo-50 border-indigo-100'}`}>
                <div className={`p-5 rounded-2xl mr-6 ${isWaiting ? 'bg-white text-amber-500 shadow-sm' : 'bg-white text-indigo-500 shadow-sm'}`}>
                  {isWaiting ? <Timer size={36} className="animate-pulse" /> : <UserCheck size={36} className="animate-bounce" />}
                </div>
                <div className="flex-1">
                  <div className="flex justify-between items-end">
                    <div>
                      <h3 className="text-2xl font-black text-gray-800">
                        {isWaiting ? `Posición #${queuePosition}` : 'Soporte en línea'}
                      </h3>
                      <p className="text-gray-500 font-medium">
                        {isWaiting ? `Demora estimada: ~${estWait} min` : 'Un agente está revisando tu caso'}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-bold text-gray-400 uppercase">Tiempo Transcurrido</p>
                      <p className={`text-xl font-mono font-bold ${isWaiting ? 'text-amber-600' : 'text-indigo-600'}`}>
                        {formatTime(elapsed)}
                      </p>
                    </div>
                  </div>
                  {isWaiting && (
                    <div className="mt-4 w-full bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-amber-400 h-2 rounded-full transition-all duration-1000" 
                        style={{ width: `${Math.max(5, 100 - (queuePosition * 15))}%` }}
                      />
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-gray-50 rounded-2xl p-6 border border-gray-100">
                <div className="flex justify-between items-center mb-4">
                  <span className="text-[10px] font-black text-gray-400 uppercase">Tu consulta</span>
                  <span className="text-[10px] bg-white border border-gray-200 px-3 py-1 rounded-full font-bold text-gray-600">
                    Prioridad {activeRequest.priority.toUpperCase()}
                  </span>
                </div>
                <h4 className="font-bold text-gray-800 text-lg mb-2">{activeRequest.subject}</h4>
                <p className="text-gray-600 text-sm leading-relaxed">{activeRequest.description}</p>
              </div>

              {isWaiting && (
                <button 
                  onClick={() => onCancel(activeRequest.id)}
                  className="flex items-center justify-center space-x-2 text-red-500 text-xs font-bold hover:bg-red-50 py-3 rounded-xl transition-colors"
                >
                  <AlertCircle size={14} />
                  <span>Cancelar mi pedido de asistencia</span>
                </button>
              )}

              <div className="flex items-start space-x-4 bg-blue-50 p-6 rounded-2xl border border-blue-100">
                <Info className="text-blue-500 shrink-0" size={20} />
                <p className="text-blue-800 text-xs leading-relaxed font-medium">
                  Hemos notificado al equipo técnico. Puedes cerrar esta ventana si lo deseas, recibirás un chat de Teams cuando un agente tome tu caso.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto pt-12">
      <div className="text-center mb-12">
        <h1 className="text-5xl font-black text-gray-900 mb-4">Mesa de Ayuda</h1>
        <p className="text-xl text-gray-500">Estamos aquí para ayudarte. Entra en la cola y te atenderemos pronto.</p>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-[40px] shadow-2xl p-12 border border-gray-50">
        <div className="space-y-8">
          <div className="space-y-3">
            <label className="text-sm font-black text-gray-700 uppercase ml-1">¿Qué problema tienes?</label>
            <input 
              type="text" 
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Ej: No puedo abrir Outlook"
              className="w-full px-6 py-5 bg-gray-50 border-2 border-transparent focus:border-[#5b5fc7] focus:bg-white rounded-2xl outline-none transition-all text-lg shadow-inner"
              required
            />
          </div>

          <div className="space-y-3">
            <label className="text-sm font-black text-gray-700 uppercase ml-1">Explícanos un poco más</label>
            <textarea 
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Danos detalles para ayudarte más rápido..."
              className="w-full px-6 py-5 bg-gray-50 border-2 border-transparent focus:border-[#5b5fc7] focus:bg-white rounded-2xl outline-none transition-all text-lg resize-none shadow-inner"
            />
          </div>

          <button 
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-[#5b5fc7] hover:bg-[#4b4fa7] disabled:bg-gray-300 text-white font-black py-6 rounded-3xl text-xl shadow-xl shadow-indigo-100 flex items-center justify-center space-x-4 transition-all transform active:scale-95"
          >
            {isSubmitting ? (
              <Loader2 className="animate-spin" size={28} />
            ) : (
              <>
                <Send size={28} />
                <span>Solicitar Asistencia</span>
              </>
            )}
          </button>
        </div>

        <div className="mt-10 pt-10 border-t border-gray-100 grid grid-cols-2 gap-4">
          <div className="flex items-center space-x-3 bg-gray-50 p-4 rounded-2xl">
            <Clock className="text-amber-500" size={24} />
            <div>
              <p className="text-[10px] font-black text-gray-400 uppercase">Espera Promedio</p>
              <p className="text-lg font-bold text-gray-700">{averageWaitTime} min</p>
            </div>
          </div>
          <div className="flex items-center space-x-3 bg-gray-50 p-4 rounded-2xl">
            <UserCheck className="text-emerald-500" size={24} />
            <div>
              <p className="text-[10px] font-black text-gray-400 uppercase">Estado</p>
              <p className="text-lg font-bold text-gray-700">Online</p>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
};

export default UserRequestView;
