import { useEffect, useRef } from 'react';

type Options = {
  pollIntervalMs?: number;
  apiUrl?: string;
  notifySoundUrl?: string;
  reminderIntervalMs?: number;
  currentUserId?: string;
};

export default function usePendingNotifications(opts: Options = {}) {
  const { pollIntervalMs = 30000, apiUrl = '/api/requests', notifySoundUrl, reminderIntervalMs = 5 * 60 * 1000, currentUserId } = opts;
  const prefKey = currentUserId ? `notifyReminders:${currentUserId}` : 'notifyReminders';
  const lastCountKey = currentUserId ? `lastPendingCount:${currentUserId}` : 'lastPendingCount';
  const lastReminderKey = currentUserId ? `lastReminder:${currentUserId}` : 'lastReminder';
  const lastCountRef = useRef<number>(Number(localStorage.getItem(lastCountKey) || '0'));
  const lastReminderRef = useRef<number>(Number(localStorage.getItem(lastReminderKey) || '0'));
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (notifySoundUrl) audioRef.current = new Audio(notifySoundUrl);

    try {
      if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
        Notification.requestPermission().then(p => console.debug('[notify] permission:', p)).catch(() => {});
      }
    } catch (e) {
      // ignore
    }

    let mounted = true;

    async function check() {
      console.debug('[notify] checking pending tickets...');
      try {
        const resp = await fetch(apiUrl, { cache: 'no-store' });
        if (!resp.ok) {
          console.debug('[notify] fetch failed', resp.status, resp.statusText);
          return;
        }
        const data = await resp.json();

        const pending = Array.isArray(data)
          ? data.filter((r: any) => r.status === 'waiting').length
          : (data.count ?? 0);

        const prev = lastCountRef.current || 0;
        const now = Date.now();
        console.debug('[notify] pending:', pending, 'prev:', prev, 'lastReminder:', lastReminderRef.current);
        const pref = localStorage.getItem(prefKey);
        const enabled = pref === null ? true : pref === 'true';

        const shouldNotifyNew = pending > prev;
        const shouldNotifyReminder = pending > 0 && enabled && (now - (lastReminderRef.current || 0) >= reminderIntervalMs);

        if ((shouldNotifyNew || shouldNotifyReminder) && enabled) {
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
          // update last reminder time
          lastReminderRef.current = now;
          try { localStorage.setItem(lastReminderKey, String(now)); } catch (e) {}
        } else {
          if (pending === 0) document.title = 'Asistencia - MDA Tecnica';
        }

        lastCountRef.current = pending;
        try { localStorage.setItem(lastCountKey, String(pending)); } catch (e) {}
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
