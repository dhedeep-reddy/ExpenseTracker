import React from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
    size?: 'sm' | 'md' | 'lg';
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant = 'primary', size = 'md', ...props }, ref) => {
        return (
            <button
                ref={ref}
                className={cn(
                    "inline-flex items-center justify-center rounded-lg font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
                    {
                        "bg-brand text-white hover:bg-brand-dark": variant === 'primary',
                        "bg-slate-100 text-slate-800 hover:bg-slate-200": variant === 'secondary',
                        "bg-danger text-white hover:bg-red-600": variant === 'danger',
                        "bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900": variant === 'ghost',
                        "h-8 px-3 text-xs": size === 'sm',
                        "h-10 px-4 py-2": size === 'md',
                        "h-12 px-6 text-lg": size === 'lg',
                    },
                    className
                )}
                {...props}
            />
        );
    }
);
Button.displayName = "Button";
