import React from 'react';
import { 
  Users, 
  MessageSquare, 
  HelpCircle,
  Bell
} from 'lucide-react';

interface LayoutProps {
  children: React.ReactNode;
  role: 'user' | 'agent';
  onOpenHelp: () => void;
  pendingCount?: number;
}

const Layout: React.FC<LayoutProps> = ({ children, role, onOpenHelp, pendingCount = 0 }) => {
  return (
    <div className="flex h-screen w-full bg-[#f5f5f5] font-sans">
      {/* Barra lateral estilo Teams */}
      <div className="w-[68px] bg-[#33344a] flex flex-col items-center py-4 space-y-6 text-gray-300 shrink-0">
        <div className={`p-2 rounded transition-all ${role === 'user' ? 'bg-[#5b5fc7] text-white' : 'hover:bg-[#44455e]'}`}>
          <MessageSquare size={24} />
          <span className="text-[10px] block text-center mt-1">Soporte</span>
        </div>
        {role === 'agent' && (
          <div className="p-2 bg-[#5b5fc7] text-white rounded relative">
            <Users size={24} />
            <span className="text-[10px] block text-center mt-1">Cola</span>
            {pendingCount > 0 && (
              <div className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center text-[10px] font-black border-2 border-[#33344a] animate-bounce-short">
                {pendingCount}
              </div>
            )}
          </div>
        )}
        
        <div 
          className="mt-auto p-2 hover:bg-[#44455e] rounded cursor-pointer transition-colors text-amber-400"
          onClick={onOpenHelp}
        >
          <HelpCircle size={24} />
          <span className="text-[10px] block text-center mt-1 text-gray-300">Ayuda</span>
        </div>
      </div>

      {/* Área Principal */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Cabecera superior */}
        <header className="h-[48px] bg-white border-b border-gray-200 flex items-center justify-between px-6 shrink-0">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <div className="w-6 h-6 bg-[#5b5fc7] rounded-md flex items-center justify-center">
                <MessageSquare size={14} className="text-white" />
              </div>
              <h1 className="font-bold text-gray-800 text-sm tracking-tight">Asistencia Técnica Hub</h1>
            </div>
            <div className="h-4 w-[1px] bg-gray-300" />
            <div className="flex items-center space-x-2">
               <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded ${
                 role === 'agent' ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-600'
               }`}>
                {role === 'agent' ? 'Panel de Agente' : 'Solicitud de Usuario'}
              </span>
            </div>
          </div>
          
          <div className="flex items-center space-x-4">
            {role === 'agent' && pendingCount > 0 && (
              <div className="flex items-center bg-red-50 px-3 py-1 rounded-full text-red-600 space-x-2 animate-pulse">
                <Bell size={12} className="fill-red-600" />
                <span className="text-[10px] font-black uppercase tracking-tight">{pendingCount} Pendientes</span>
              </div>
            )}
            <div className="flex items-center space-x-3">
              <div className="text-right hidden sm:block">
                <p className="text-[10px] font-black text-gray-400 uppercase leading-none">Conectado como</p>
                <p className="text-xs font-bold text-gray-700">{role === 'agent' ? 'Agente de IT' : 'Usuario'}</p>
              </div>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-black shadow-inner ${
                role === 'agent' ? 'bg-indigo-600' : 'bg-purple-600'
              }`}>
                {role === 'agent' ? 'IT' : 'U'}
              </div>
            </div>
          </div>
        </header>

        {/* Contenedor de Contenido */}
        <main className="flex-1 overflow-auto bg-[#f5f5f5]">
          <div className="p-6 min-h-full">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};

export default Layout;