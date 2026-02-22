"use client"
import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Bars3Icon, UserCircleIcon, ArrowRightOnRectangleIcon, SunIcon, MoonIcon } from '@heroicons/react/24/outline';
import { Button } from '../ui/Button';

interface HeaderProps {
    onMenuClick: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onMenuClick }) => {
    const { username, logout } = useAuth();
    const [isDark, setIsDark] = useState(false);

    // Initialize from localStorage / system preference
    useEffect(() => {
        const saved = localStorage.getItem('finai-theme');
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        const shouldBeDark = saved === 'dark' || (!saved && prefersDark);
        setIsDark(shouldBeDark);
    }, []);

    const toggleTheme = () => {
        const next = !isDark;
        setIsDark(next);
        if (next) {
            document.documentElement.classList.add('dark');
            localStorage.setItem('finai-theme', 'dark');
        } else {
            document.documentElement.classList.remove('dark');
            localStorage.setItem('finai-theme', 'light');
        }
    };

    return (
        <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-slate-200 bg-white px-4 shadow-sm md:px-6">
            <div className="flex items-center gap-4">
                <button
                    onClick={onMenuClick}
                    className="rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900 md:hidden"
                >
                    <Bars3Icon className="h-6 w-6" />
                </button>
                <div className="hidden md:flex flex-col">
                    <h1 className="text-xl font-bold tracking-tight text-slate-900">Financial Intelligence</h1>
                    <p className="text-xs text-slate-500">Welcome back, {username}</p>
                </div>
            </div>

            <div className="flex items-center gap-3">
                {/* ─── Dark / Light Toggle ─── */}
                <button
                    onClick={toggleTheme}
                    title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                    className="relative flex h-9 w-16 items-center rounded-full border border-slate-200 bg-slate-100 p-1 transition-all duration-300 hover:border-brand/40"
                >
                    {/* Track */}
                    <span
                        className={`absolute left-1 flex h-7 w-7 items-center justify-center rounded-full shadow-sm transition-all duration-300 ${isDark
                                ? 'translate-x-7 bg-slate-800'
                                : 'translate-x-0 bg-white'
                            }`}
                    >
                        {isDark
                            ? <MoonIcon className="h-4 w-4 text-blue-400" />
                            : <SunIcon className="h-4 w-4 text-amber-500" />
                        }
                    </span>
                    {/* Icons on track */}
                    <SunIcon className="ml-0.5 h-3.5 w-3.5 text-amber-400 opacity-60" />
                    <MoonIcon className="ml-auto mr-0.5 h-3.5 w-3.5 text-slate-400 opacity-60" />
                </button>

                <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                    <UserCircleIcon className="h-8 w-8 text-slate-400" />
                    <span className="hidden sm:inline-block">{username}</span>
                </div>
                <Button variant="ghost" size="sm" onClick={logout} className="text-slate-500 hover:text-danger">
                    <ArrowRightOnRectangleIcon className="h-5 w-5 mr-1" />
                    <span className="hidden sm:inline-block">Logout</span>
                </Button>
            </div>
        </header>
    );
};
