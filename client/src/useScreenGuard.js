import { useEffect, useState } from 'react';

// Best-effort capture deterrent for browsers. Real blocking (FLAG_SECURE)
// is done natively in the Android app.
export function useScreenGuard() {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const hide = () => setHidden(true);
    const show = () => setHidden(false);
    const vis = () => (document.hidden ? hide() : show());
    const key = (e) => {
      if (e.key === 'PrintScreen' || (e.metaKey && e.shiftKey) || (e.ctrlKey && e.key.toLowerCase() === 'p')) {
        hide();
        try { navigator.clipboard?.writeText(''); } catch { /* ignore */ }
        setTimeout(show, 1500);
      }
    };
    const noMenu = (e) => e.preventDefault();
    window.addEventListener('blur', hide);
    window.addEventListener('focus', show);
    document.addEventListener('visibilitychange', vis);
    window.addEventListener('keyup', key);
    window.addEventListener('keydown', key);
    window.addEventListener('contextmenu', noMenu);
    return () => {
      window.removeEventListener('blur', hide);
      window.removeEventListener('focus', show);
      document.removeEventListener('visibilitychange', vis);
      window.removeEventListener('keyup', key);
      window.removeEventListener('keydown', key);
      window.removeEventListener('contextmenu', noMenu);
    };
  }, []);
  return hidden;
}
