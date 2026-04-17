import './AlertBanner.css';

interface AlertBannerProps {
  title: string;
  message?: string;
  tone?: 'info' | 'warning' | 'danger' | 'success';
  actionLabel?: string;
  onAction?: () => void;
}

export function AlertBanner({
  title,
  message,
  tone = 'info',
  actionLabel,
  onAction,
}: AlertBannerProps) {
  return (
    <div className={`alert-banner alert-banner-${tone}`} role="status" aria-live="polite">
      <div className="alert-banner-copy">
        <strong>{title}</strong>
        {message ? <p>{message}</p> : null}
      </div>

      {actionLabel && onAction ? (
        <button type="button" className="alert-banner-action" onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}
