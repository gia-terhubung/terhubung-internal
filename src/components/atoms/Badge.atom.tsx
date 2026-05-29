import React from 'react';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'outline' | 'success' | 'warning' | 'danger';
}

export function Badge({ children, variant = 'primary' }: BadgeProps) {
  const variants = {
    primary: 'bg-brand text-brand-content font-bold',
    secondary: 'bg-bg-hover text-text-primary',
    outline: 'border border-border-strong text-text-secondary',
    success: 'bg-green-500/10 text-green-600 border border-green-500/20 font-medium',
    warning: 'bg-amber-500/10 text-amber-600 border border-amber-500/20 font-medium',
    danger: 'bg-red-500/10 text-red-600 border border-red-500/20 font-medium',
  };

  return (
    <span className={`px-2 py-0.5 rounded-full text-[11px] ${variants[variant]}`}>{children}</span>
  );
}
