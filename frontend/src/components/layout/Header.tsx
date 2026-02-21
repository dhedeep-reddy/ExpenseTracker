"use client"
import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Bars3Icon, UserCircleIcon, ArrowRightOnRectangleIcon } from '@heroicons/react/24/outline';
import { Button } from '../ui/Button';

interface HeaderProps {
    onMenuClick: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onMenuClick }) => {
    const { username, logout } = useAuth();

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

            <div className="flex items-center gap-4">
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
