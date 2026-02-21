import { AppLayout } from '@/components/layout/AppLayout';
import { AuthProviderCode } from '@/contexts/AuthContext';
import React from 'react';

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <AuthProviderCode>
            <AppLayout>
                {children}
            </AppLayout>
        </AuthProviderCode>
    );
}
