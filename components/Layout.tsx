import React, { useState, useEffect } from 'react';
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
  onSwitchRole?: () => void;
  onAgentRegister?: (email: string) => void;
  pendingCount?: number;
}

const Layout: React.FC<LayoutProps> = ({ children, role, onOpenHelp, onAgentRegister, pendingCount = 0 }) => {
  const [isDebugVisible, setIsDebugVisible] = useState(false);

  // Modal state for join-code flow
  const [joinModalOpen, setJoinModalOpen] = React.useState(false);
  const [joinCode, setJoinCode] = React.useState('');
  const [joinEmail, setJoinEmail] = React.useState('');
  const [joinLoading, setJoinLoading] = React.useState(false);
  const [joinError, setJoinError] = React.useState<string | null>(null);

  const openJoinModal = async () => {
    // open modal immediately so UI responds to click
    setJoinEmail('');
    setJoinCode('');
    setJoinError(null);
    setJoinModalOpen(true);

    // attempt to detect email from Teams context and fill later
    try {
      const teams = (window as any).microsoftTeams;
      let context: any = null;
      if (teams && teams.app && teams.app.getContext) {
        try { context = await teams.app.getContext(); } catch (e) { context = null; }
      }
      const detectedEmail = context?.user?.userPrincipalName || context?.userPrincipalName || context?.loginHint || '';
      if (detectedEmail) setJoinEmail(String(detectedEmail).toLowerCase());
    } catch (e) {
      // ignore detection errors
    }
  };

  const submitJoinAgent = async () => {
    setJoinError(null);
    if (!joinCode) return setJoinError('Código requerido');
    if (!joinEmail || !joinEmail.includes('@')) return setJoinError('Email inválido');
    setJoinLoading(true);
    try {
      const cfgRes = await fetch('/app-config.json');
      if (!cfgRes.ok) return setJoinError('No se pudo validar el código (app-config.json no disponible)');
      let cfg: any = null;
      const contentType = (cfgRes.headers.get('content-type') || '').toLowerCase();
      if (contentType.includes('application/json')) cfg = await cfgRes.json();
      else {
        const txt = await cfgRes.text();
        try { cfg = JSON.parse(txt); } catch (e) { return setJoinError('app-config.json no es JSON'); }
      }
      if (!cfg?.agentJoinCode) return setJoinError('Código no configurado');
      if (String(joinCode).trim() !== String(cfg.agentJoinCode).trim()) return setJoinError('Código incorrecto');

      // try register
      try {
        const r = await fetch('/api/agents', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: joinEmail }) });
        if (r.status === 201 || r.status === 200) {
          setJoinModalOpen(false);
          if (typeof onAgentRegister === 'function') onAgentRegister(joinEmail);
          return;
        }
        // else fallthrough
      } catch (e) {
        console.warn('POST /api/agents failed', e);
      }

      // fallback: local
      localStorage.setItem('localAgentEmail', joinEmail);
      setJoinModalOpen(false);
      if (typeof onAgentRegister === 'function') onAgentRegister(joinEmail);
    } catch (e: any) {
      setJoinError(String(e?.message || e));
    } finally {
      setJoinLoading(false);
    }
  };
  return (
    <div className="flex h-screen w-full bg-[#f5f5f5] font-sans">
      {/* Barra lateral estilo Teams */}
      <div className="w-[68px] bg-[#33344a] flex flex-col items-center py-4 space-y-6 text-gray-300 shrink-0">
        <div className={`p-2 rounded transition-all ${role === 'user' ? 'bg-[#5b5fc7] text-white' : 'hover:bg-[#44455e]'}`}>
          <MessageSquare size={24} />
              <span className="text-[10px] block text-center mt-1">Asistencia - MDA Tecnica</span>
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
              <h1 className="font-bold text-gray-800 text-sm tracking-tight">Asistencia - MDA Tecnica Hub</h1>
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
            {isDebugVisible && (
              <button onClick={handleDebugClick} className="mr-4 px-3 py-1 rounded-lg bg-gray-100 text-xs font-bold">DEBUG</button>
            )}
            {role === 'user' && (
                <button onClick={openJoinModal} className="mr-2 px-3 py-1 rounded-lg bg-indigo-50 text-indigo-700 text-xs font-bold">Soy Agente de TI</button>
            )}
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
      {joinModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-lg bg-white rounded-lg p-6 shadow-xl">
            <h2 className="text-lg font-bold mb-2">Registrarse como Agente de TI</h2>
            <p className="text-sm text-gray-500 mb-4">Ingresá el código y tu email para registrarte como agente.</p>

            <label className="block text-xs font-semibold text-gray-600">Código</label>
            <input value={joinCode} onChange={(e) => setJoinCode(e.target.value)} className="w-full mb-3 p-2 border rounded" />

            <label className="block text-xs font-semibold text-gray-600">Email</label>
            <input value={joinEmail} onChange={(e) => setJoinEmail(e.target.value)} className="w-full mb-3 p-2 border rounded" />

            {joinError && <div className="text-red-600 text-sm mb-2">{joinError}</div>}

            <div className="flex justify-end space-x-2">
              <button onClick={() => setJoinModalOpen(false)} className="px-4 py-2 rounded bg-gray-100">Cancelar</button>
              <button onClick={submitJoinAgent} disabled={joinLoading} className="px-4 py-2 rounded bg-indigo-600 text-white">{joinLoading ? 'Registrando...' : 'Registrar'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Layout;