import React from 'react';
import { cn } from '@/lib/utils';

interface RainbowButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
}

export const RainbowButton = ({ children, className, ...props }: RainbowButtonProps) => {
  return (
    <button 
      className={cn(
        "rainbow-border relative flex items-center justify-center gap-2.5 px-6 h-10 bg-black rounded-xl border-none text-white cursor-pointer font-black transition-all duration-200 hover:scale-105 active:scale-95 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed disabled:hover:scale-100",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
};
