import type { CSSProperties, MouseEventHandler } from 'react';
import type { LucideIcon } from 'lucide-react';

interface SidebarItemProps {
  href: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
  collapsed: boolean;
  badgeCount?: number;
  showPulse?: boolean;
  onNavigate?: MouseEventHandler<HTMLAnchorElement>;
}

const baseItemStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  width: '100%',
  minHeight: '46px',
  borderRadius: '10px',
  padding: '0 12px',
  color: '#20262e',
  textDecoration: 'none',
  position: 'relative',
  zIndex: 1,
  transition: 'background-color 160ms ease, color 160ms ease, box-shadow 160ms ease',
};

const activeItemStyle: CSSProperties = {
  color: '#15181d',
  background: 'transparent',
  borderLeft: '3px solid transparent',
  boxShadow: 'none',
};

const inactiveItemStyle: CSSProperties = {
  borderLeft: '3px solid transparent',
};

export function SidebarItem({
  href,
  label,
  icon: Icon,
  active,
  collapsed,
  badgeCount,
  showPulse,
  onNavigate,
}: SidebarItemProps) {
  const normalizedHref = href.startsWith('#') ? href : `#${href}`;
  const hasBadge = typeof badgeCount === 'number' && badgeCount > 0;

  return (
    <a
      href={normalizedHref}
      onClick={onNavigate}
      title={collapsed ? label : undefined}
      className={active ? 'driver-sidebar-item active' : 'driver-sidebar-item'}
      data-active={active ? 'true' : 'false'}
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
            aria-label={`${badgeCount} pending pickups`}
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
          }}
        >
          {label}
        </span>
      ) : null}
    </a>
  );
}
