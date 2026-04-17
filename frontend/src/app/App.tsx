import './App.css';
import { useEffect, useState } from 'react';

import { AppNavbar } from "@shared/components/AppNavbar";
import { routes } from './router';

function getHashPath(): string {
  const rawPath = window.location.hash.replace(/^#/, '').replace(/\/+$/, '') || '/';
  return rawPath.startsWith('/') ? rawPath : `/${rawPath}`;
}

export function App() {
  const [currentPath, setCurrentPath] = useState<string>(getHashPath);

  useEffect(() => {
    const syncPath = () => {
      setCurrentPath(getHashPath());
    };

    window.addEventListener('hashchange', syncPath);
    window.addEventListener('popstate', syncPath);

    // Ensure initial path is normalized, including first load on GitHub Pages.
    syncPath();

    return () => {
      window.removeEventListener('hashchange', syncPath);
      window.removeEventListener('popstate', syncPath);
    };
  }, []);

  const activeRoute = routes.find((route) => route.path === currentPath) ?? routes[0];
  const ActivePage = activeRoute.element;

  return (
    <div className="app-shell">
      <AppNavbar currentPath={activeRoute.path} />
      <ActivePage />
    </div>
  );
}
