import Image from 'next/image';

interface AvatarProps {
  src?: string | null;
  initials?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function Avatar({ src, initials, size = 'md' }: AvatarProps) {
  const sizeClasses = {
    sm: 'w-8 h-8 text-xs',
    md: 'w-10 h-10 text-sm',
    lg: 'w-12 h-12 text-base',
  };

  return (
    <div
      className={`rounded-full bg-bg-secondary border border-border-strong flex items-center justify-center overflow-hidden shrink-0 relative ${sizeClasses[size]}`}
    >
      {src ? (
        <Image src={src} alt="Avatar" fill className="object-cover" sizes="48px" unoptimized />
      ) : (
        <span className="text-text-primary font-medium uppercase">
          {initials?.substring(0, 2) || '?'}
        </span>
      )}
    </div>
  );
}
