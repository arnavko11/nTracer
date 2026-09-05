/**
 * Full-width notice strip under the toolbar.
 *
 * Used for scan failures and for the "you're not root" warning, which is the
 * single most common reason a scan comes back nearly empty.
 */

export default function StatusBanner({ tone = 'info', children, onDismiss }) {
  if (!children) return null;

  return (
    <div className={`banner banner-${tone}`}>
      <span className="banner-text">{children}</span>
      {onDismiss && (
        <button type="button" className="banner-close" onClick={onDismiss} aria-label="Dismiss">
          ×
        </button>
      )}
    </div>
  );
}
