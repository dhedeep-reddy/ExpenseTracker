"use client"
import React, { createContext, useContext, useState, useEffect } from 'react';
import Cookies from 'js-cookie';
import { useRouter } from 'next/navigation';

interface AuthContextType {
    token: string | null;
    username: string | null;
    isAdmin: boolean;
    login: (token: string, username: string, isAdmin: boolean) => void;
    logout: () => void;
    isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProviderCode = ({ children }: { children: React.ReactNode }) => {
    const [token, setToken] = useState<string | null>(null);
    const [username, setUsername] = useState<string | null>(null);
    const [isAdmin, setIsAdmin] = useState(false);
    const router = useRouter();

    useEffect(() => {
        const storedToken = Cookies.get('token');
        const storedUsername = Cookies.get('username');
        const storedIsAdmin = Cookies.get('isAdmin') === 'true';
        if (storedToken && storedUsername) {
            setToken(storedToken);
            setUsername(storedUsername);
            setIsAdmin(storedIsAdmin);
        }
    }, []);

    const login = (newToken: string, newUsername: string, adminFlag: boolean) => {
        Cookies.set('token', newToken, { expires: 7 });
        Cookies.set('username', newUsername, { expires: 7 });
        Cookies.set('isAdmin', String(adminFlag), { expires: 7 });
        setToken(newToken);
        setUsername(newUsername);
        setIsAdmin(adminFlag);
        if (adminFlag) {
            router.push('/admin-portal');
        } else {
            router.push('/dashboard');
        }
    };

    const logout = () => {
        Cookies.remove('token');
        Cookies.remove('username');
        Cookies.remove('isAdmin');
        setToken(null);
        setUsername(null);
        setIsAdmin(false);
        router.push('/');
    };

    return (
        <AuthContext.Provider value={{ token, username, isAdmin, login, logout, isAuthenticated: !!token }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
