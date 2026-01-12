
import React from 'react';
import { 
  Users, 
  MessageSquare, 
  Settings, 
  HelpCircle,
  Bell,
  Search,
  MoreHorizontal
} from 'lucide-react';

interface LayoutProps {
  children: React.ReactNode;
  role: 'user' | 'agent';
  onSwitchRole: () => void;
}

const Layout: React.FC<LayoutProps> = ({ children, role, onSwitchRole }) => {
  return (
    <div className="flex h-screen w-full bg-[#f5f5f5]">
      {/* Teams Left Bar (Icons) */}
      <div className="w-[68px] bg-[#33344a] flex flex-col items-center py-4 space-y-6 text-gray-300">
        <div className="p-2 hover:bg-[#44455e] rounded cursor-pointer transition-colors">
          <Bell size={24} />
          <span className="text-[10px] block text-center mt-1">Actividad</span>
        </div>
        <div className="p-2 bg-[#5b5fc7] rounded cursor-pointer text-white">
          <MessageSquare size={24} />
          <span className="text-[10px] block text-center mt-1">Chat</span>
        </div>
        <div className="p-2 hover:bg-[#44455e] rounded cursor-pointer transition-colors">
          <Users size={24} />
          <span className="text-[10px] block text-center mt-1">Equipos</span>
        </div>
        <div className="mt-auto p-2 hover:bg-[#44455e] rounded cursor-pointer transition-colors" onClick={onSwitchRole}>
          <Settings size={24} />
          <span className="text-[10px] block text-center mt-1">{role === 'agent' ? 'Modo Usuario' : 'Modo Agente'}</span>
        </div>
        <div className="p-2 hover:bg-[#44455e] rounded cursor-pointer transition-colors">
          <HelpCircle size={24} />
          <span className="text-[10px] block text-center mt-1">Ayuda</span>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="h-[48px] bg-white border-b border-gray-200 flex items-center justify-between px-6">
          <div className="flex items-center space-x-4">
            <h1 className="font-semibold text-gray-800 text-sm">Asistencia Técnica Interna</h1>
            <div className="h-4 w-[1px] bg-gray-300" />
            <span className="text-xs text-gray-500 uppercase font-bold tracking-wider">
              {role === 'agent' ? 'Dashboard de Agente' : 'Solicitar Ayuda'}
            </span>
          </div>
          <div className="flex items-center space-x-4">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
              <input 
                type="text" 
                placeholder="Buscar..." 
                className="pl-8 pr-4 py-1 bg-gray-100 rounded-md text-xs border-transparent focus:bg-white focus:border-indigo-500 outline-none w-48 transition-all"
              />
            </div>
            <MoreHorizontal size={18} className="text-gray-500 cursor-pointer" />
            <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center text-white text-xs font-bold">
              {role === 'agent' ? 'AG' : 'US'}
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
};

export default Layout;
