import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  IndianRupee,
  LayoutDashboard,
  LogOut,
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
  onLogout: () => void;
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
const DESKTOP_TOP_OFFSET_PX = 66;

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
  background: 'rgba(255, 255, 255, 0.64)',
  color: '#20262e',
  borderRight: '1px solid rgba(196, 205, 216, 0.9)',
  flexShrink: 0,
  position: 'relative',
  transition: 'width 300ms ease, transform 300ms ease',
  overflow: 'visible',
  backdropFilter: 'blur(14px) saturate(1.25)',
  WebkitBackdropFilter: 'blur(14px) saturate(1.25)',
};

export function Sidebar({ missionActive, pickupCount: _pickupCount, onLogout }: SidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth <= MOBILE_BREAKPOINT_PX : false,
  );
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [currentPath, setCurrentPath] = useState(getCurrentHashPath);
  const navRef = useRef<HTMLElement | null>(null);
  const [indicatorStyle, setIndicatorStyle] = useState({ top: 0, height: 0, visible: false });

  const syncIndicator = useCallback(() => {
    const navElement = navRef.current;
    if (!navElement) {
      return;
    }

    const activeItem = navElement.querySelector<HTMLElement>('.driver-sidebar-item.active');
    if (!activeItem) {
      setIndicatorStyle((current) => ({ ...current, visible: false }));
      return;
    }

    setIndicatorStyle({
      top: activeItem.offsetTop,
      height: activeItem.offsetHeight,
      visible: true,
    });
  }, []);

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
    const frameId = window.requestAnimationFrame(syncIndicator);
    const onResize = () => syncIndicator();

    window.addEventListener('resize', onResize);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener('resize', onResize);
    };
  }, [syncIndicator]);

  useEffect(() => {
    const frameId = window.requestAnimationFrame(syncIndicator);
    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [currentPath, isCollapsed, isMobile, syncIndicator]);

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
        position: 'fixed',
        top: `${DESKTOP_TOP_OFFSET_PX}px`,
        left: 0,
        bottom: 0,
        zIndex: 40,
        width: `${resolvedCollapsed ? collapsedDesktopWidth : expandedDesktopWidth}px`,
        minHeight: `calc(100vh - ${DESKTOP_TOP_OFFSET_PX}px)`,
      };

  const railStyle: CSSProperties = isMobile
    ? {
        width: 0,
        flexShrink: 0,
      }
    : {
        width: `${resolvedCollapsed ? collapsedDesktopWidth : expandedDesktopWidth}px`,
        flexShrink: 0,
      };

  const onItemNavigate = isMobile ? () => setDrawerOpen(false) : undefined;

  const handleLogout = () => {
    if (isMobile) {
      setDrawerOpen(false);
    }
    onLogout();
  };

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

      <div style={railStyle} aria-hidden="true" />

      <aside aria-label="Driver sidebar navigation" style={asideStyle}>
        <div
          style={{
            padding: resolvedCollapsed ? '16px 0' : '16px 12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            height: '100%',
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

          <nav
            ref={navRef}
            style={{
              display: 'grid',
              gap: '4px',
              position: 'relative',
            }}
          >
            <span
              aria-hidden="true"
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                borderRadius: '10px',
                border: '1px solid rgba(226, 116, 116, 0.84)',
                background: 'linear-gradient(145deg, rgba(253, 210, 210, 0.86) 0%, rgba(242, 142, 142, 0.64) 100%)',
                boxShadow: '0 8px 20px rgba(136, 24, 24, 0.2), inset 0 1px 1px rgba(255, 255, 255, 0.82)',
                top: 0,
                height: `${indicatorStyle.height}px`,
                transform: `translateY(${indicatorStyle.top}px)`,
                opacity: indicatorStyle.visible ? 1 : 0,
                transition:
                  'transform 460ms cubic-bezier(0.2, 0.9, 0.2, 1), height 460ms cubic-bezier(0.2, 0.9, 0.2, 1), opacity 240ms ease',
                pointerEvents: 'none',
                zIndex: 0,
              }}
            />
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

          <button
            type="button"
            onClick={handleLogout}
            title={resolvedCollapsed ? 'Logout' : undefined}
            style={{
              marginTop: 'auto',
              minHeight: '44px',
              borderRadius: '10px',
              border: '1px solid #d9a0a0',
              background: 'rgba(255, 236, 236, 0.72)',
              color: '#8f1f1f',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: resolvedCollapsed ? 'center' : 'flex-start',
              gap: '8px',
              padding: resolvedCollapsed ? '0' : '0 12px',
              fontSize: '0.82rem',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            <LogOut size={16} />
            {!resolvedCollapsed ? 'Logout' : null}
          </button>
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