import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import App from './App';

const DemoApp = lazy(() => import('./demo/DemoApp'));

/** `npm run build:demo` bakes a demo-only bundle for static hosting (no bridge, no live HUD). */
const STATIC_DEMO = import.meta.env.VITE_STATIC_DEMO === '1';

const isDemoUrl = () => {
  if (STATIC_DEMO) return true;
  const v = new URLSearchParams(window.location.search).get('demo');
  return v !== null && v !== '0' && v !== 'false';
};

/** Live HUD or the self-running Mission Replay (?demo=1). The replay never mounts the uplink hooks. */
export default function Root() {
  const [demo, setDemo] = useState(isDemoUrl);
  useEffect(() => {
    const onPop = () => setDemo(isDemoUrl());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const go = useCallback((on: boolean) => {
    const url = new URL(window.location.href);
    if (on) url.searchParams.set('demo', '1');
    else url.searchParams.delete('demo');
    window.history.pushState({}, '', url);
    setDemo(on);
  }, []);
  if (demo)
    return (
      <Suspense fallback={<div className="boot-splash">LOADING MISSION REPLAY…</div>}>
        <DemoApp onExit={STATIC_DEMO ? undefined : () => go(false)} />
      </Suspense>
    );
  return <App onDemo={() => go(true)} />;
}
