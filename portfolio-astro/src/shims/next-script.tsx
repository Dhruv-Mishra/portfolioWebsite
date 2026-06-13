import { useEffect, type ReactNode } from 'react';

interface ScriptProps {
  id?: string;
  src?: string;
  strategy?: 'afterInteractive' | 'beforeInteractive' | 'lazyOnload' | 'worker';
  children?: ReactNode;
}

export default function Script({ id, src, children, strategy = 'afterInteractive' }: ScriptProps) {
  useEffect(() => {
    if (id && document.getElementById(id)) return undefined;
    if (src && document.querySelector(`script[src="${src}"]`)) return undefined;

    const append = () => {
      const script = document.createElement('script');
      if (id) script.id = id;
      if (src) {
        script.src = src;
        script.async = true;
      }
      if (typeof children === 'string') script.text = children;
      document.body.appendChild(script);
    };

    if (strategy === 'lazyOnload') {
      window.addEventListener('load', append, { once: true });
      return () => window.removeEventListener('load', append);
    }

    append();
    return undefined;
  }, [children, id, src, strategy]);

  return null;
}