"use client"
import React, { useEffect } from 'react';
import { AuthProviderCode, useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { ArrowRightOnRectangleIcon, ShieldCheckIcon } from '@heroicons/react/24/outline';

// Inner layout component that can safely call useAuth (it's inside AuthProviderCode)
function AdminLayoutInner({ children }: { children: React.ReactNode }) {
    const { token, isAdmin, logout, username } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (!token || !isAdmin) {
            router.replace('/login');
        }
    }, [token, isAdmin, router]);

    if (!token || !isAdmin) return null;

    return (
        <div className="min-h-screen bg-gray-950 text-gray-100">
            {/* Admin Header */}
            <header className="bg-gray-900 border-b border-gray-800 px-6 py-4 flex items-center justify-between sticky top-0 z-30">
                <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-500/20 ring-1 ring-red-500/40">
                        <ShieldCheckIcon className="h-5 w-5 text-red-400" />
                    </div>
                    <div>
                        <span className="font-bold text-white tracking-tight">FinAI Admin Console</span>
                        <span className="ml-2 text-xs bg-red-500/20 text-red-400 border border-red-500/30 px-2 py-0.5 rounded-full font-semibold">ADMIN</span>
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    <span className="text-sm text-gray-400">Logged in as <span className="text-white font-medium">{username}</span></span>
                    <button
                        onClick={logout}
                        className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-red-400 transition-colors"
                    >
                        <ArrowRightOnRectangleIcon className="h-4 w-4" />
                        Logout
                    </button>
                </div>
            </header>

            {/* Content */}
            <main className="p-6 max-w-7xl mx-auto">
                {children}
            </main>
        </div>
    );
}

// Outer layout wraps inner with AuthProviderCode so useAuth() is always inside a provider
export default function AdminPortalLayout({ children }: { children: React.ReactNode }) {
    return (
        <AuthProviderCode>
            <AdminLayoutInner>
                {children}
            </AdminLayoutInner>
        </AuthProviderCode>
    );
}
