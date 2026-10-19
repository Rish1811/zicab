import React from 'react';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { formatDuration } from './zibusFormat';
import './zibus.css';

// Building blocks shared by every ZI Bus passenger screen. Colours come from
// zibus.css (zb-* classes), so these stay correct in the app's dark and
// light themes.

export const BusScreen = ({ children, className = '' }) => (
  <div className="zb">
    <div className={`zb-screen ${className}`}>{children}</div>
  </div>
);

export const BusTopBar = ({ title, subtitle, onBack, right, step }) => (
  <header className="zb-topbar">
    <div className="flex items-center gap-3">
      {onBack ? (
        <button type="button" onClick={onBack} className="zb-icon-btn" aria-label="Back">
          <ArrowLeft size={18} />
        </button>
      ) : null}
      <div className="min-w-0 flex-1">
        <h1 className="zb-h2 truncate">{title}</h1>
        {subtitle ? <p className="zb-muted mt-0.5 truncate text-xs font-semibold">{subtitle}</p> : null}
      </div>
      {right}
    </div>
    {step ? <StepBar current={step} /> : null}
  </header>
);

const STEP_NAMES = ['Seats', 'Details', 'Payment'];

/// Booking progress: 1 seats, 2 boarding/food/passenger, 3 payment.
export const StepBar = ({ current = 1 }) => (
  <div>
    <div className="zb-steps">
      {STEP_NAMES.map((name, index) => (
        <span key={name} className={`zb-step ${index < current ? 'is-done' : ''}`} />
      ))}
    </div>
    <div className="mt-1.5 flex justify-between">
      {STEP_NAMES.map((name, index) => (
        <span key={name} className={`text-[10px] font-bold ${index < current ? 'zb-accent-text' : 'zb-muted'}`}>
          {index + 1}. {name}
        </span>
      ))}
    </div>
  </div>
);

export const SectionTitle = ({ icon: Icon, title, hint, action }) => (
  <div className="flex items-end justify-between gap-3">
    <div className="min-w-0">
      <h2 className="zb-h2 flex items-center gap-2">
        {Icon ? <Icon size={17} className="zb-accent-text" /> : null}
        {title}
      </h2>
      {hint ? <p className="zb-muted mt-0.5 text-xs font-semibold">{hint}</p> : null}
    </div>
    {action}
  </div>
);

/// Departure -> arrival with the cities underneath and the duration between.
export const TripLine = ({ departure, arrival, fromLabel, toLabel, duration, compact = false }) => (
  <div className="flex items-center gap-3">
    <div className="min-w-0">
      <p className={`${compact ? 'text-base' : 'text-xl'} zb-text font-extrabold leading-none`}>{departure || '--:--'}</p>
      <p className="zb-muted mt-1 truncate text-[11px] font-semibold">{fromLabel}</p>
    </div>
    <div className="flex min-w-[4.5rem] flex-1 flex-col items-center gap-1">
      <div className="flex w-full items-center gap-1.5">
        <span className="zb-dot is-start" />
        <span className="zb-dash" />
        <span className="zb-dot is-end" />
      </div>
      {duration ? <span className="zb-muted text-[10px] font-bold">{formatDuration(duration)}</span> : null}
    </div>
    <div className="min-w-0 text-right">
      <p className={`${compact ? 'text-base' : 'text-xl'} zb-text font-extrabold leading-none`}>{arrival || '--:--'}</p>
      <p className="zb-muted mt-1 truncate text-[11px] font-semibold">{toLabel}</p>
    </div>
  </div>
);

/// Sticky bottom bar: a price or summary on the left, the main action right.
export const FooterBar = ({ label, value, note, actionLabel, onAction, disabled, loading, children }) => (
  <div className="zb-footer">
    {children}
    <div className="flex items-center gap-4">
      {label !== undefined ? (
        <div className="min-w-0 flex-1">
          <p className="zb-label">{label}</p>
          <p className="zb-text truncate text-xl font-extrabold">{value}</p>
          {note ? <p className="zb-muted truncate text-[11px] font-semibold">{note}</p> : null}
        </div>
      ) : null}
      <button
        type="button"
        onClick={onAction}
        disabled={disabled || loading}
        className={`zb-btn zb-btn-primary ${label !== undefined ? 'min-w-[9.5rem]' : 'w-full'}`}
      >
        {loading ? <Loader2 size={18} className="animate-spin" /> : null}
        {actionLabel}
      </button>
    </div>
  </div>
);

export const EmptyState = ({ icon: Icon, title, text, action }) => (
  <div className="zb-card flex flex-col items-center px-6 py-10 text-center">
    {Icon ? (
      <div className="zb-soft mb-3 flex h-14 w-14 items-center justify-center">
        <Icon size={24} className="zb-muted" />
      </div>
    ) : null}
    <p className="zb-text text-base font-extrabold">{title}</p>
    {text ? <p className="zb-muted mt-1 max-w-xs text-sm font-medium">{text}</p> : null}
    {action ? <div className="mt-4">{action}</div> : null}
  </div>
);

export const Skeleton = ({ height = 120, className = '' }) => (
  <div className={`zb-skeleton ${className}`} style={{ height }} />
);
