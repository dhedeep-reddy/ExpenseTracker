"use client"
import React, { createContext, useContext, useState, useEffect } from 'react';
import Cookies from 'js-cookie';
import { useRouter } from 'next/navigation';

interface AuthContextType {
    token: string | null;
    username: string | null;
    login: (token: string, username: string) => void;
    logout: () => void;
    isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProviderCode = ({ children }: { children: React.ReactNode }) => {
    const [token, setToken] = useState<string | null>(null);
    const [username, setUsername] = useState<string | null>(null);
    const router = useRouter();

    useEffect(() => {
        const storedToken = Cookies.get('token');
        const storedUsername = Cookies.get('username');
        if (storedToken && storedUsername) {
            setToken(storedToken);
            setUsername(storedUsername);
        }
    }, []);

    const login = (newToken: string, newUsername: string) => {
        Cookies.set('token', newToken, { expires: 7 });
        Cookies.set('username', newUsername, { expires: 7 });
        setToken(newToken);
        setUsername(newUsername);
        router.push('/dashboard');
    };

    const logout = () => {
        Cookies.remove('token');
        Cookies.remove('username');
        setToken(null);
        setUsername(null);
        router.push('/');
    };

    return (
        <AuthContext.Provider value={{ token, username, login, logout, isAuthenticated: !!token }}>
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
