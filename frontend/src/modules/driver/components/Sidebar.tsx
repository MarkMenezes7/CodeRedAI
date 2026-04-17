import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  IndianRupee,
  LayoutDashboard,
  Menu,
  Radio,
  Settings,
  Truck,
  X,
  type LucideIcon,
} from 'lucide-react';

import { SidebarItem } from './SidebarItem';

interface SidebarProps {
  missionActive: boolean;
  pickupCount: number;
}

type SidebarRouteItem = {
  label: string;
  path: string;
  icon: LucideIcon;
  aliases?: string[];
  showPulse?: boolean;
  badgeCount?: number;
};

const MOBILE_BREAKPOINT_PX = 920;

function getCurrentHashPath() {
  if (typeof window === 'undefined') {
    return '/';
  }

  const rawPath = window.location.hash.replace(/^#/, '').replace(/\/+$/, '') || '/';
  return rawPath.startsWith('/') ? rawPath : `/${rawPath}`;
}

function matchesPath(path: string, aliases: string[] | undefined, currentPath: string) {
  if (currentPath === path) {
    return true;
  }

  if (!aliases || aliases.length === 0) {
    return false;
  }

  return aliases.includes(currentPath);
}

const sidebarBaseStyle: CSSProperties = {
  background: '#ffffff',
  color: '#20262e',
  borderRight: '1px solid #c4cdd8',
  flexShrink: 0,
  position: 'relative',
  transition: 'width 300ms ease, transform 300ms ease',
  overflow: 'visible',
};

export function Sidebar({ missionActive, pickupCount: _pickupCount }: SidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth <= MOBILE_BREAKPOINT_PX : false,
  );
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [currentPath, setCurrentPath] = useState(getCurrentHashPath);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const onResize = () => {
      const nowMobile = window.innerWidth <= MOBILE_BREAKPOINT_PX;
      setIsMobile(nowMobile);
      if (!nowMobile) {
        setDrawerOpen(false);
      }
    };

    onResize();
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const syncHash = () => {
      setCurrentPath(getCurrentHashPath());
    };

    syncHash();
    window.addEventListener('hashchange', syncHash);
    window.addEventListener('popstate', syncHash);

    return () => {
      window.removeEventListener('hashchange', syncHash);
      window.removeEventListener('popstate', syncHash);
    };
  }, []);

  const routeItems = useMemo<SidebarRouteItem[]>(
    () => [
      {
        label: 'Dashboard',
        icon: LayoutDashboard,
        path: '/driver/dashboard',
        aliases: ['/driver', '/driver-dashboard'],
      },
      {
        label: 'Live Mission',
        icon: Radio,
        path: '/driver/mission',
        showPulse: missionActive,
      },
      {
        label: 'My Missions',
        icon: Truck,
        path: '/driver/deliveries',
      },
      {
        label: 'Earnings',
        icon: IndianRupee,
        path: '/driver/earnings',
      },
      {
        label: 'Settings',
        icon: Settings,
        path: '/driver/settings',
      },
    ],
    [missionActive],
  );

  const expandedDesktopWidth = 240;
  const collapsedDesktopWidth = 64;
  const resolvedCollapsed = isMobile ? false : isCollapsed;
  const drawerWidth = expandedDesktopWidth;

  const asideStyle: CSSProperties = isMobile
    ? {
        ...sidebarBaseStyle,
        width: `${drawerWidth}px`,
        position: 'fixed',
        top: 0,
        left: 0,
        bottom: 0,
        zIndex: 60,
        transform: drawerOpen ? 'translateX(0)' : 'translateX(-100%)',
        boxShadow: drawerOpen ? '12px 0 28px rgba(2, 6, 23, 0.5)' : 'none',
      }
    : {
        ...sidebarBaseStyle,
        width: `${resolvedCollapsed ? collapsedDesktopWidth : expandedDesktopWidth}px`,
        minHeight: '100%',
      };

  const onItemNavigate = isMobile ? () => setDrawerOpen(false) : undefined;

  return (
    <>
      <style>{`@keyframes codered-sidebar-pulse { 0% { box-shadow: 0 0 0 0 rgba(215, 43, 43, 0.68); } 70% { box-shadow: 0 0 0 9px rgba(215, 43, 43, 0); } 100% { box-shadow: 0 0 0 0 rgba(215, 43, 43, 0); } }`}</style>

      {isMobile ? (
        <button
          type="button"
          aria-label={drawerOpen ? 'Close sidebar menu' : 'Open sidebar menu'}
          onClick={() => setDrawerOpen((prev) => !prev)}
          style={{
            position: 'fixed',
            top: '78px',
            left: '12px',
            zIndex: 61,
            width: '38px',
            height: '38px',
            borderRadius: '999px',
            border: '1px solid #c4cdd8',
            background: '#ffffff',
            color: '#15181d',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
          }}
        >
          {drawerOpen ? <X size={18} /> : <Menu size={18} />}
        </button>
      ) : null}

      {isMobile && drawerOpen ? (
        <button
          type="button"
          aria-label="Close sidebar drawer"
          onClick={() => setDrawerOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            border: 'none',
            background: 'rgba(17, 24, 39, 0.32)',
            zIndex: 58,
            cursor: 'pointer',
          }}
        />
      ) : null}

      <aside aria-label="Driver sidebar navigation" style={asideStyle}>
        <div
          style={{
            padding: resolvedCollapsed ? '16px 0' : '16px 12px',
            display: 'grid',
            gap: '10px',
            height: '100%',
            alignContent: 'start',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              justifyContent: resolvedCollapsed ? 'center' : 'flex-start',
              padding: resolvedCollapsed ? '0' : '0 8px',
              marginBottom: '4px',
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: '30px',
                height: '30px',
                borderRadius: '8px',
                background: 'linear-gradient(135deg, #ea4f4f 0%, #d72b2b 100%)',
                color: '#ffffff',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 800,
                fontSize: '0.75rem',
                letterSpacing: '0.08em',
              }}
            >
              CR
            </span>

            {!resolvedCollapsed ? (
              <div style={{ display: 'grid', lineHeight: 1.1 }}>
                <span style={{ fontSize: '0.88rem', fontWeight: 700, color: '#15181d' }}>Driver Panel</span>
                <span style={{ fontSize: '0.7rem', color: '#20262e' }}>CodeRed Navigation</span>
              </div>
            ) : null}
          </div>

          <nav style={{ display: 'grid', gap: '4px' }}>
            {routeItems.map((item) => (
              <SidebarItem
                key={item.path}
                href={item.path}
                label={item.label}
                icon={item.icon}
                active={matchesPath(item.path, item.aliases, currentPath)}
                collapsed={resolvedCollapsed}
                badgeCount={item.badgeCount}
                showPulse={item.showPulse}
                onNavigate={onItemNavigate}
              />
            ))}
          </nav>
        </div>

        {!isMobile ? (
          <button
            type="button"
            aria-label={resolvedCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            onClick={() => setIsCollapsed((prev) => !prev)}
            style={{
              position: 'absolute',
              top: '22px',
              right: '-14px',
              width: '28px',
              height: '28px',
              borderRadius: '999px',
              border: '1px solid #c4cdd8',
              background: '#ffffff',
              color: '#15181d',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              boxShadow: '0 6px 14px rgba(17, 24, 39, 0.15)',
            }}
          >
            {resolvedCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        ) : null}
      </aside>
    </>
  );
}