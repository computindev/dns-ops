/**
 * Shared State Display Components - dns-ops-1j4.16.3
 *
 * Consistent loading, error, and empty states across the application.
 * All panels should use these components for uniform UX.
 */

import type React from 'react';
import { Button } from './Button.js';

// =============================================================================
// LOADING STATE
// =============================================================================

interface LoadingStateProps {
  /** Loading message to display */
  message?: string;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Additional classes */
  className?: string;
}

/**
 * Consistent loading state with accessible announcements.
 * Use inside panels, tabs, or page sections.
 */
export function LoadingState({
  message = 'Loading...',
  size = 'md',
  className = '',
}: LoadingStateProps) {
  const sizeClasses = {
    sm: 'py-4',
    md: 'py-8',
    lg: 'py-12',
  };

  const spinnerSizes = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8',
  };

  const textSizes = {
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-lg',
  };

  return (
    <output
      className={`flex flex-col items-center justify-center ${sizeClasses[size]} ${className}`}
      aria-live="polite"
      aria-busy="true"
    >
      <svg
        aria-hidden="true"
        className={`${spinnerSizes[size]} text-brand motion-safe:animate-spin`}
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
      >
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
        />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        />
      </svg>
      <p className={`mt-3 text-muted motion-safe:animate-pulse ${textSizes[size]}`}>{message}</p>
    </output>
  );
}

// =============================================================================
// ERROR STATE
// =============================================================================

interface ErrorStateProps {
  /** Error title */
  title?: string;
  /** Error message or description */
  message: string;
  /** Retry handler - if provided, shows retry button */
  onRetry?: () => void;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Additional classes */
  className?: string;
}

/**
 * Consistent error state with optional retry.
 * Use for API failures, validation errors, or unexpected states.
 */
export function ErrorState({
  title = 'Something went wrong',
  message,
  onRetry,
  size = 'md',
  className = '',
}: ErrorStateProps) {
  const sizeClasses = {
    sm: 'py-4',
    md: 'py-8',
    lg: 'py-12',
  };

  const iconSizes = {
    sm: 'w-8 h-8',
    md: 'w-12 h-12',
    lg: 'w-16 h-16',
  };

  return (
    <div
      className={`flex flex-col items-center justify-center text-center ${sizeClasses[size]} ${className}`}
      role="alert"
    >
      <div className={`${iconSizes[size]} text-danger mb-3`}>
        <svg
          aria-hidden="true"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
          />
        </svg>
      </div>
      <h4 className="text-lg font-medium text-ink">{title}</h4>
      <p className="mt-1 max-w-md text-sm text-muted">{message}</p>
      {onRetry && (
        <Button className="mt-4" onClick={onRetry} variant="primary">
          Try again
        </Button>
      )}
    </div>
  );
}

// =============================================================================
// EMPTY STATE
// =============================================================================

type EmptyStateIcon = 'document' | 'folder' | 'search' | 'inbox' | 'chart' | 'globe' | 'shield';

interface EmptyStateProps {
  /** Icon to display */
  icon?: EmptyStateIcon;
  /** Custom icon element (overrides icon prop) */
  customIcon?: React.ReactNode;
  /** Empty state title */
  title: string;
  /** Description text */
  description?: string;
  /** Action button config */
  action?: {
    label: string;
    onClick: () => void;
  };
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Additional classes */
  className?: string;
}

const ICONS: Record<EmptyStateIcon, React.ReactNode> = {
  document: (
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
    />
  ),
  folder: (
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z"
    />
  ),
  search: (
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
    />
  ),
  inbox: (
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M2.25 13.5h3.86a2.25 2.25 0 012.012 1.244l.256.512a2.25 2.25 0 002.013 1.244h3.218a2.25 2.25 0 002.013-1.244l.256-.512a2.25 2.25 0 012.013-1.244h3.859m-19.5.338V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18v-4.162c0-.224-.034-.447-.1-.661L19.24 5.338a2.25 2.25 0 00-2.15-1.588H6.911a2.25 2.25 0 00-2.15 1.588L2.35 13.177a2.25 2.25 0 00-.1.661z"
    />
  ),
  chart: (
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"
    />
  ),
  globe: (
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418"
    />
  ),
  shield: (
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"
    />
  ),
};

/**
 * Consistent empty state with icon and optional action.
 * Use when no data is available or after a search returns no results.
 */
export function EmptyState({
  icon = 'document',
  customIcon,
  title,
  description,
  action,
  size = 'md',
  className = '',
}: EmptyStateProps) {
  const sizeClasses = {
    sm: 'py-6',
    md: 'py-8',
    lg: 'py-12',
  };

  const iconSizes = {
    sm: 'w-10 h-10',
    md: 'w-12 h-12',
    lg: 'w-16 h-16',
  };

  return (
    <div
      className={`flex flex-col items-center justify-center text-center ${sizeClasses[size]} ${className}`}
    >
      <div className={`${iconSizes[size]} text-faint mb-4`}>
        {customIcon || (
          <svg
            aria-hidden="true"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            {ICONS[icon]}
          </svg>
        )}
      </div>
      <h4 className="text-lg font-medium text-ink">{title}</h4>
      {description && <p className="mt-1 max-w-md text-sm text-muted">{description}</p>}
      {action && (
        <Button className="mt-4" onClick={action.onClick} variant="quiet">
          {action.label}
        </Button>
      )}
    </div>
  );
}

// =============================================================================
// PANEL WRAPPER - Optional wrapper for consistent panel styling
// =============================================================================

interface PanelStateWrapperProps {
  loading: boolean;
  error: string | null;
  empty: boolean;
  loadingMessage?: string;
  errorTitle?: string;
  onRetry?: () => void;
  emptyIcon?: EmptyStateIcon;
  emptyTitle: string;
  emptyDescription?: string;
  emptyAction?: { label: string; onClick: () => void };
  children: React.ReactNode;
  className?: string;
}

/**
 * Convenience wrapper that handles loading/error/empty states automatically.
 * Renders children only when data is available.
 */
export function PanelStateWrapper({
  loading,
  error,
  empty,
  loadingMessage,
  errorTitle,
  onRetry,
  emptyIcon,
  emptyTitle,
  emptyDescription,
  emptyAction,
  children,
  className = '',
}: PanelStateWrapperProps) {
  if (loading) {
    return <LoadingState message={loadingMessage} className={className} />;
  }

  if (error) {
    return (
      <ErrorState title={errorTitle} message={error} onRetry={onRetry} className={className} />
    );
  }

  if (empty) {
    return (
      <EmptyState
        icon={emptyIcon}
        title={emptyTitle}
        description={emptyDescription}
        action={emptyAction}
        className={className}
      />
    );
  }

  return <>{children}</>;
}
