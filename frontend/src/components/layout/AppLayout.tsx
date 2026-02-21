"use client"
import React, { useState } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { PlusIcon } from '@heroicons/react/24/solid';
import { QuickAddModal } from '../ui/QuickAddModal';
import { useRouter } from 'next/navigation';

export const AppLayout = ({ children }: { children: React.ReactNode }) => {
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const router = useRouter();

    return (
        <div className="flex bg-slate-50 min-h-screen relative">
            <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

            <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
                <Header onMenuClick={() => setIsSidebarOpen(true)} />

                <main className="flex-1 overflow-auto p-4 md:p-6 lg:p-8 relative">
                    <div className="max-w-7xl mx-auto pb-24">
                        {children}
                    </div>
                </main>
            </div>

            {/* Floating Action Button */}
            <button
                onClick={() => setIsModalOpen(true)}
                className="fixed bottom-6 right-6 md:bottom-10 md:right-10 z-50 flex h-16 w-16 items-center justify-center rounded-full bg-brand text-white shadow-xl shadow-brand/30 hover:bg-brand-dark hover:scale-105 transition-all duration-200"
            >
                <PlusIcon className="h-8 w-8" />
            </button>

            {/* Global Quick Add Modal */}
            <QuickAddModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSuccess={() => {
                    // Force a small delay to let DB catch up, then refresh page data
                    setTimeout(() => {
                        window.location.reload();
                    }, 300);
                }}
            />
        </div>
    );
};
