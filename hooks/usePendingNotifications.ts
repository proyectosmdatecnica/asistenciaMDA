import { useEffect, useRef } from 'react';

type Options = {
  pollIntervalMs?: number;
  apiUrl?: string;
  notifySoundUrl?: string;
};

export default function usePendingNotifications(opts: Options = {}) {
  const { pollIntervalMs = 30000, apiUrl = '/api/requests', notifySoundUrl } = opts;
  const lastCountRef = useRef<number>(Number(localStorage.getItem('lastPendingCount') || '0'));
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (notifySoundUrl) audioRef.current = new Audio(notifySoundUrl);

    let mounted = true;

    async function check() {
      try {
        const resp = await fetch(apiUrl, { cache: 'no-store' });
        if (!resp.ok) return;
        const data = await resp.json();

        const pending = Array.isArray(data)
          ? data.filter((r: any) => r.status === 'waiting').length
          : (data.count ?? 0);

        const prev = lastCountRef.current || 0;
        if (pending > prev) {
          if (typeof Notification !== 'undefined') {
            if (Notification.permission === 'granted') {
              const n = new Notification('Nuevo(s) ticket(s) en espera', {
                body: `${pending} ticket(s) pendientes de atención.`,
                silent: false,
              });
              n.onclick = () => {
                window.focus();
              };
            } else if (Notification.permission !== 'denied') {
              Notification.requestPermission().then((p) => {
                if (p === 'granted') {
                  new Notification('Nuevo(s) ticket(s) en espera', { body: `${pending} ticket(s) pendientes de atención.` });
                }
              });
            }
          }

          if (audioRef.current) {
            audioRef.current.play().catch(() => {});
          }

          document.title = `(${pending}) Asistencia - MDA Tecnica`;
        } else {
          if (pending === 0) document.title = 'Asistencia - MDA Tecnica';
        }

        lastCountRef.current = pending;
        localStorage.setItem('lastPendingCount', String(pending));
      } catch (e) {
        // ignore transient errors
      }
    }

    check();
    const timer = setInterval(() => {
      if (mounted) check();
    }, pollIntervalMs);

    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, [pollIntervalMs, apiUrl, notifySoundUrl]);
}
