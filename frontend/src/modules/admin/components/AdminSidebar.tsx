import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  LayoutDashboard,
  Menu,
  MessageSquareWarning,
  Radio,
  ShieldCheck,
  X,
  type LucideIcon,
} from 'lucide-react';

type AdminSectionKey = 'overview' | 'verification' | 'reviews' | 'compliance' | 'ops';

interface AdminSidebarProps {
  activeSection: AdminSectionKey;
  onSelectSection: (section: AdminSectionKey) => void;
  counts: {
    verification: number;
    reviews: number;
    compliance: number;
  };
  adminEmail: string;
  lastLoginLabel: string;
}

type SidebarItemConfig = {
  section: AdminSectionKey;
  label: string;
  icon: LucideIcon;
  badgeCount?: number;
  showPulse?: boolean;
};

interface SidebarButtonProps {
  label: string;
  icon: LucideIcon;
  active: boolean;
  collapsed: boolean;
  badgeCount?: number;
  showPulse?: boolean;
  onClick: () => void;
}

const MOBILE_BREAKPOINT_PX = 920;
const DESKTOP_TOP_OFFSET_PX = 66;

const sidebarBaseStyle: CSSProperties = {
  background: '#ffffff',
  color: '#20262e',
  borderRight: '1px solid #c4cdd8',
  flexShrink: 0,
  position: 'relative',
  transition: 'width 300ms ease, transform 300ms ease',
  overflow: 'visible',
};

const baseItemStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  minHeight: '46px',
  borderRadius: '10px',
  padding: '0 12px',
  color: '#20262e',
  background: 'transparent',
  border: 'none',
  width: '100%',
  position: 'relative',
  cursor: 'pointer',
  transition: 'background-color 160ms ease, color 160ms ease, box-shadow 160ms ease',
};

const activeItemStyle: CSSProperties = {
  color: '#15181d',
  background: 'rgba(215, 43, 43, 0.12)',
  borderLeft: '3px solid #d72b2b',
  boxShadow: 'inset 0 0 16px rgba(215, 43, 43, 0.1)',
};

const inactiveItemStyle: CSSProperties = {
  borderLeft: '3px solid transparent',
};

function SidebarButton({
  label,
  icon: Icon,
  active,
  collapsed,
  badgeCount,
  showPulse,
  onClick,
}: SidebarButtonProps) {
  const hasBadge = typeof badgeCount === 'number' && badgeCount > 0;

  return (
    <button
      type="button"
      title={collapsed ? label : undefined}
      onClick={onClick}
      style={{
        ...baseItemStyle,
        ...(active ? activeItemStyle : inactiveItemStyle),
        justifyContent: collapsed ? 'center' : 'flex-start',
        padding: collapsed ? '0' : '0 12px',
      }}
    >
      <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={18} strokeWidth={2.1} />

        {showPulse ? (
          <span
            aria-hidden="true"
            style={{
              position: 'absolute',
              right: '-5px',
              top: '-5px',
              width: '8px',
              height: '8px',
              borderRadius: '999px',
              background: '#d72b2b',
              boxShadow: '0 0 0 0 rgba(215, 43, 43, 0.65)',
              animation: 'codered-sidebar-pulse 1.3s infinite',
            }}
          />
        ) : null}

        {hasBadge ? (
          <span
            aria-label={`${badgeCount} pending admin items`}
            style={{
              position: 'absolute',
              right: collapsed ? '-9px' : '-12px',
              top: '-9px',
              minWidth: collapsed ? '15px' : '18px',
              height: collapsed ? '15px' : '18px',
              borderRadius: '999px',
              padding: collapsed ? '0 4px' : '0 5px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: collapsed ? '0.57rem' : '0.62rem',
              fontWeight: 800,
              color: '#15181d',
              background: '#f4c87f',
              border: '1px solid rgba(141, 90, 10, 0.35)',
            }}
          >
            {collapsed ? (badgeCount > 9 ? '9+' : badgeCount) : badgeCount}
          </span>
        ) : null}
      </span>

      {!collapsed ? (
        <span
          style={{
            flex: 1,
            fontSize: '0.92rem',
            fontWeight: active ? 700 : 600,
            lineHeight: 1.1,
            whiteSpace: 'nowrap',
            textAlign: 'left',
          }}
        >
          {label}
        </span>
      ) : null}
    </button>
  );
}

export function AdminSidebar({
  activeSection,
  onSelectSection,
  counts,
  adminEmail,
  lastLoginLabel,
}: AdminSidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth <= MOBILE_BREAKPOINT_PX : false,
  );
  const [drawerOpen, setDrawerOpen] = useState(false);

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

  const sidebarItems = useMemo<SidebarItemConfig[]>(
    () => [
      {
        section: 'overview',
        label: 'Dashboard',
        icon: LayoutDashboard,
      },
      {
        section: 'verification',
        label: 'Verification',
        icon: ShieldCheck,
        badgeCount: counts.verification,
      },
      {
        section: 'reviews',
        label: 'Reviews',
        icon: MessageSquareWarning,
        badgeCount: counts.reviews,
      },
      {
        section: 'compliance',
        label: 'Compliance',
        icon: ClipboardCheck,
        badgeCount: counts.compliance,
      },
      {
        section: 'ops',
        label: 'Live Ops Feed',
        icon: Radio,
        showPulse: true,
      },
    ],
    [counts.compliance, counts.reviews, counts.verification],
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

  const handleSelect = (section: AdminSectionKey) => {
    onSelectSection(section);
    if (isMobile) {
      setDrawerOpen(false);
    }
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

      <aside aria-label="Admin sidebar navigation" style={asideStyle}>
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
                <span style={{ fontSize: '0.88rem', fontWeight: 700, color: '#15181d' }}>Admin Panel</span>
                <span style={{ fontSize: '0.7rem', color: '#20262e' }}>CodeRed Navigation</span>
              </div>
            ) : null}
          </div>

          <nav style={{ display: 'grid', gap: '4px' }}>
            {sidebarItems.map((item) => (
              <SidebarButton
                key={item.section}
                label={item.label}
                icon={item.icon}
                active={activeSection === item.section}
                collapsed={resolvedCollapsed}
                badgeCount={item.badgeCount}
                showPulse={item.showPulse}
                onClick={() => handleSelect(item.section)}
              />
            ))}
          </nav>

          {!resolvedCollapsed ? (
            <div
              style={{
                marginTop: '8px',
                paddingTop: '10px',
                borderTop: '1px solid #d9e1ec',
                display: 'grid',
                gap: '4px',
                paddingLeft: '8px',
                paddingRight: '8px',
              }}
            >
              <p
                style={{
                  margin: 0,
                  fontSize: '0.7rem',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: '#6f7a88',
                  fontWeight: 700,
                }}
              >
                Signed in as
              </p>
              <strong
                style={{
                  fontSize: '0.84rem',
                  color: '#112036',
                  lineHeight: 1.25,
                  wordBreak: 'break-word',
                }}
              >
                {adminEmail}
              </strong>
              <span style={{ fontSize: '0.74rem', color: '#5f6f85' }}>Last login: {lastLoginLabel}</span>
            </div>
          ) : null}
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
            {resolvedCollapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
          </button>
        ) : null}
      </aside>
    </>
  );
}
