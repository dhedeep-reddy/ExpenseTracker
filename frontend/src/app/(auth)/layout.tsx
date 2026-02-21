import { AuthProviderCode } from '@/contexts/AuthContext';
import React from 'react';

export default function AuthLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <AuthProviderCode>
            {children}
        </AuthProviderCode>
    );
}
