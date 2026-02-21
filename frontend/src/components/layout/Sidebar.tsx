"use client"
import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
    HomeIcon,
    ListBulletIcon,
    SparklesIcon,
    XMarkIcon,
    ChatBubbleLeftRightIcon,
} from '@heroicons/react/24/outline';
import { cn } from '../ui/Button';

interface SidebarProps {
    isOpen: boolean;
    onClose: () => void;
}

const navItems = [
    { name: 'Dashboard', href: '/dashboard', icon: HomeIcon },
    { name: 'AI Chat', href: '/chat', icon: ChatBubbleLeftRightIcon },
    { name: 'Transactions', href: '/transactions', icon: ListBulletIcon },
    { name: 'AI Insights', href: '/insights', icon: SparklesIcon },
];

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose }) => {
    const pathname = usePathname();

    return (
        <>
            {/* Mobile Backdrop */}
            {isOpen && (
                <div
                    className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-sm md:hidden"
                    onClick={onClose}
                />
            )}

            {/* Sidebar sidebar */}
            <aside
                className={cn(
                    "fixed inset-y-0 left-0 z-50 w-64 -translate-x-full transform bg-white border-r border-slate-200 transition-transform duration-300 ease-in-out md:translate-x-0 md:static md:block",
                    isOpen && "translate-x-0"
                )}
            >
                <div className="flex h-16 items-center justify-between px-6 border-b border-slate-200">
                    <Link href="/dashboard" className="flex items-center gap-2 font-bold text-xl tracking-tight text-brand">
                        <span className="text-2xl">⚡</span>
                        <span>FinAI</span>
                    </Link>
                    <button onClick={onClose} className="md:hidden text-slate-500 hover:text-slate-900">
                        <XMarkIcon className="h-6 w-6" />
                    </button>
                </div>

                <nav className="flex flex-col gap-2 p-4">
                    {navItems.map((item) => {
                        const isActive = pathname === item.href;
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={cn(
                                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                                    isActive
                                        ? "bg-brand/10 text-brand"
                                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                                )}
                                onClick={() => {
                                    if (window.innerWidth < 768) onClose();
                                }}
                            >
                                <item.icon className={cn("h-5 w-5", isActive ? "text-brand" : "text-slate-400")} />
                                {item.name}
                            </Link>
                        )
                    })}
                </nav>

                <div className="absolute bottom-0 w-full p-4 border-t border-slate-200">
                    <div className="rounded-xl bg-slate-50 p-4 border border-slate-200">
                        <h4 className="text-sm font-semibold text-slate-900 flex items-center gap-1">
                            <SparklesIcon className="h-4 w-4 text-brand" /> AI Engine Active
                        </h4>
                        <p className="mt-1 text-xs text-slate-500">Your smart financial assistant is analyzing trends.</p>
                    </div>
                </div>
            </aside>
        </>
    );
};
