import { lazy, Suspense, useEffect, useState, type ComponentType, type ReactNode } from 'react';

type Loader<TProps> = () => Promise<{ default: ComponentType<TProps> } | ComponentType<TProps>>;

interface DynamicOptions {
  loading?: () => ReactNode;
  ssr?: boolean;
}

export default function dynamic<TProps extends object>(loader: Loader<TProps>, options: DynamicOptions = {}) {
  const LazyComponent = lazy(async () => {
    const loaded = await loader();
    return typeof loaded === 'function' ? { default: loaded } : loaded;
  });

  function DynamicComponent(props: TProps) {
    const fallback = options.loading ? options.loading() : null;
    const [isMounted, setIsMounted] = useState(false);

    useEffect(() => {
      setIsMounted(true);
    }, []);

    if (options.ssr === false && !isMounted) {
      return <>{fallback}</>;
    }

    return (
      <Suspense fallback={fallback}>
        <LazyComponent {...props} />
      </Suspense>
    );
  }

  DynamicComponent.displayName = 'AstroDynamicComponent';
  return DynamicComponent;
}