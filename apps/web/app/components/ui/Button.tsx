import type { ButtonHTMLAttributes, ReactNode } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'quiet';
type ButtonSize = 'sm' | 'md' | 'lg';
type ButtonState = 'loading' | 'error' | 'success';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  state?: ButtonState;
}

export function Button({
  children,
  className = '',
  disabled = false,
  loading = false,
  size = 'md',
  state,
  type = 'button',
  variant = 'primary',
  ...props
}: ButtonProps) {
  const buttonState = state ?? (loading ? 'loading' : undefined);
  const isDisabled = disabled || buttonState === 'loading';

  return (
    <button
      {...props}
      aria-busy={buttonState === 'loading'}
      className={`ds-button ds-button--${variant} ds-button--${size} ${className}`}
      data-state={buttonState}
      disabled={isDisabled}
      type={type}
    >
      {buttonState === 'loading' && <span className="ds-button__spinner" aria-hidden="true" />}
      <span>{children}</span>
    </button>
  );
}
