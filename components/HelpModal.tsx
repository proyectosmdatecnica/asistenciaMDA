import React from 'react';
import { X, Info, CheckCircle, MessageSquare, ShieldCheck, Zap } from 'lucide-react';

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const HelpModal: React.FC<HelpModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-[#33344a]/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
        <div className="p-8 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-[#5b5fc7] rounded-2xl flex items-center justify-center text-white">
              <Info size={24} />
            </div>
            <div>
              <h2 className="text-xl font-black text-gray-900">Guía del Sistema</h2>
              <p className="text-[10px] font-black text-[#5b5fc7] uppercase tracking-widest">Tickets MDA Tecnica Hub</p>
            </div>
          </div>
          <button onClick={onClose} className="p-3 hover:bg-gray-200 rounded-2xl transition-colors">
            <X size={20} className="text-gray-500" />
          </button>
        </div>

        <div className="p-8 max-h-[70vh] overflow-y-auto space-y-8">
          <section className="space-y-4">
            <h3 className="text-sm font-black text-gray-800 flex items-center space-x-2">
              <Zap size={16} className="text-amber-500" />
              <span>Para Usuarios</span>
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                <p className="text-[11px] font-black text-gray-400 uppercase mb-2">Paso 1: Solicitud</p>
                <p className="text-xs font-medium text-gray-600">Completa el asunto y descripción. Nuestra IA clasificará tu problema automáticamente.</p>
              </div>
              <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                <p className="text-[11px] font-black text-gray-400 uppercase mb-2">Paso 2: Espera</p>
                <p className="text-xs font-medium text-gray-600">Verás tu posición en tiempo real. Un agente de IT será asignado a la brevedad.</p>
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <h3 className="text-sm font-black text-gray-800 flex items-center space-x-2">
              <ShieldCheck size={16} className="text-emerald-500" />
              <span>Para Agentes</span>
            </h3>
            <div className="space-y-3">
              <div className="flex items-start space-x-3 p-4 bg-indigo-50/50 rounded-2xl border border-indigo-100">
                <CheckCircle size={18} className="text-indigo-600 mt-0.5 shrink-0" />
                <p className="text-xs font-medium text-indigo-900">
                  <span className="font-black block mb-1">Tomar Casos</span>
                  Usa el botón "Tomar Caso" para mover un ticket de la lista de espera a tu panel de atención.
                </p>
              </div>
              <div className="flex items-start space-x-3 p-4 bg-emerald-50/50 rounded-2xl border border-emerald-100">
                <MessageSquare size={18} className="text-emerald-600 mt-0.5 shrink-0" />
                <p className="text-xs font-medium text-emerald-900">
                  <span className="font-black block mb-1">Comunicación Automática</span>
                  El botón "Contactar" abre Microsoft Teams con un mensaje pre-configurado incluyendo el número de ticket.
                </p>
              </div>
            </div>
          </section>

          <div className="p-6 bg-[#33344a] rounded-3xl text-center text-white">
            <p className="text-xs font-bold opacity-80 mb-2">¿Necesitas ayuda adicional?</p>
            <p className="text-[10px] font-black uppercase tracking-widest">Contacta al administrador de infraestructura</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HelpModal;