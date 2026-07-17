'use client';

import React, { useState, useEffect, useRef } from 'react';

interface SearchInputProps {
  placeholder?: string;
  onSearch: (value: string) => void;
  debounceMs?: number;
  containerClassName?: string;
  // Seed the input (e.g. from a ?q= URL param) without firing onSearch on mount.
  defaultValue?: string;
  autoFocus?: boolean;
}

export const SearchInput: React.FC<SearchInputProps> = ({
  placeholder = 'Cari...',
  onSearch,
  debounceMs = 300,
  containerClassName,
  defaultValue,
  autoFocus,
}) => {
  const [searchTerm, setSearchTerm] = useState(defaultValue ?? '');
  const isMounted = useRef(false);

  useEffect(() => {
    if (!isMounted.current) {
      isMounted.current = true;
      return;
    }
    const handler = setTimeout(() => onSearch(searchTerm), debounceMs);
    return () => clearTimeout(handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm, debounceMs]);

  return (
    <div className={`relative ${containerClassName ?? 'w-full max-w-sm'}`}>
      <svg
        className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
      <input
        type="text"
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className="w-full bg-bg-primary border border-border-color text-text-primary rounded-lg pl-9 pr-4 py-2 text-sm focus:outline-none focus:border-brand transition-colors"
      />
    </div>
  );
};
