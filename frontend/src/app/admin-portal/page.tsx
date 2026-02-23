"use client"
import React, { useEffect, useState } from 'react';
import api from '@/lib/api';
import {
    UsersIcon, BanknotesIcon, ClipboardDocumentListIcon,
    ChevronDownIcon, ChevronUpIcon, PlusIcon,
    TrashIcon, KeyIcon, CircleStackIcon,
    CheckBadgeIcon, XCircleIcon, XMarkIcon
} from '@heroicons/react/24/outline';

interface UserSummary {
    id: number; username: string; created_at: string;
    total_income: number; total_expenses: number; available_balance: number;
    transaction_count: number; envelope_count: number; reminder_count: number;
}
interface TxRow { id: number; type: string; category: string | null; amount: number; source: string; description: string | null; date: string; }
interface UserDetail {
    id: number; username: string; created_at: string;
    total_income: number; total_expenses: number; available_balance: number;
    transactions: TxRow[];
    envelopes: { id: number; category: string; allocated: number; spent: number; remaining: number; }[];
    reminders: { id: number; title: string; amount: number; type: string; due_date: string | null; is_paid: boolean; }[];
}

const TYPE_COLORS: Record<string, string> = {
    INCOME: 'bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/30',
    SALARY: 'bg-blue-500/20 text-blue-400 ring-1 ring-blue-500/30',
    EXPENSE: 'bg-red-500/20 text-red-400 ring-1 ring-red-500/30',
    ALLOCATE_BUDGET: 'bg-purple-500/20 text-purple-400 ring-1 ring-purple-500/30',
};

export default function AdminPortalPage() {
    const [users, setUsers] = useState<UserSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [expanded, setExpanded] = useState<number | null>(null);
    const [detail, setDetail] = useState<UserDetail | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [activeTab, setActiveTab] = useState<'transactions' | 'envelopes' | 'reminders'>('transactions');

    // Create user form
    const [showCreate, setShowCreate] = useState(false);
    const [newUsername, setNewUsername] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [creating, setCreating] = useState(false);

    // Reset password modal
    const [resetTarget, setResetTarget] = useState<UserSummary | null>(null);
    const [resetPwd, setResetPwd] = useState('');
    const [resetting, setResetting] = useState(false);

    // Delete confirm
    const [deleteTarget, setDeleteTarget] = useState<UserSummary | null>(null);
    const [deleting, setDeleting] = useState(false);

    const [toast, setToast] = useState('');

    const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

    const fetchUsers = () =>
        api.get('/admin/users')
            .then(r => setUsers(r.data))
            .catch(e => setError(e.response?.data?.detail || 'Access denied.'))
            .finally(() => setLoading(false));

    useEffect(() => { fetchUsers(); }, []);

    const toggleUser = async (id: number) => {
        if (expanded === id) { setExpanded(null); setDetail(null); return; }
        setExpanded(id); setDetailLoading(true); setActiveTab('transactions');
        try { const r = await api.get(`/admin/users/${id}`); setDetail(r.data); }
        finally { setDetailLoading(false); }
    };

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault(); setCreating(true);
        try {
            await api.post('/admin/users/create', { username: newUsername, password: newPassword });
            setNewUsername(''); setNewPassword(''); setShowCreate(false);
            showToast(`✅ User '${newUsername}' created`);
            fetchUsers();
        } catch (e: any) { showToast(`❌ ${e.response?.data?.detail || 'Error'}`) }
        finally { setCreating(false); }
    };

    const handleResetPassword = async (e: React.FormEvent) => {
        e.preventDefault(); if (!resetTarget) return; setResetting(true);
        try {
            await api.put(`/admin/users/${resetTarget.id}/reset-password`, { new_password: resetPwd });
            showToast(`✅ Password reset for '${resetTarget.username}'`);
            setResetTarget(null); setResetPwd('');
        } catch (e: any) { showToast(`❌ ${e.response?.data?.detail || 'Error'}`) }
        finally { setResetting(false); }
    };

    const handleDelete = async () => {
        if (!deleteTarget) return; setDeleting(true);
        try {
            await api.delete(`/admin/users/${deleteTarget.id}`);
            showToast(`✅ User '${deleteTarget.username}' deleted`);
            setDeleteTarget(null); setExpanded(null); setDetail(null);
            fetchUsers();
        } catch (e: any) { showToast(`❌ ${e.response?.data?.detail || 'Error'}`) }
        finally { setDeleting(false); }
    };

    const totalIncome = users.reduce((s, u) => s + u.total_income, 0);
    const totalExpenses = users.reduce((s, u) => s + u.total_expenses, 0);
    const totalTx = users.reduce((s, u) => s + u.transaction_count, 0);

    return (
        <div className="space-y-8 relative">
            {/* Toast */}
            {toast && (
                <div className="fixed top-4 right-4 z-50 bg-gray-800 border border-gray-700 text-white px-5 py-3 rounded-xl shadow-lg text-sm">
                    {toast}
                </div>
            )}

            {/* Reset Password Modal */}
            {resetTarget && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-sm shadow-2xl space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="font-semibold text-white">Reset Password — <span className="text-blue-400">{resetTarget.username}</span></h3>
                            <button onClick={() => setResetTarget(null)} className="text-gray-500 hover:text-white"><XMarkIcon className="h-5 w-5" /></button>
                        </div>
                        <form onSubmit={handleResetPassword} className="space-y-3">
                            <input
                                type="password" placeholder="New password" required minLength={4}
                                value={resetPwd} onChange={e => setResetPwd(e.target.value)}
                                className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                            <div className="flex gap-2">
                                <button type="submit" disabled={resetting}
                                    className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
                                    {resetting ? 'Saving...' : 'Save Password'}
                                </button>
                                <button type="button" onClick={() => setResetTarget(null)}
                                    className="flex-1 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm font-medium transition-colors">
                                    Cancel
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Delete Confirm Modal */}
            {deleteTarget && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="bg-gray-900 border border-red-500/30 rounded-2xl p-6 w-full max-w-sm shadow-2xl space-y-4">
                        <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-full bg-red-500/20 flex items-center justify-center flex-shrink-0">
                                <TrashIcon className="h-5 w-5 text-red-400" />
                            </div>
                            <div>
                                <h3 className="font-semibold text-white">Delete User</h3>
                                <p className="text-sm text-gray-400">This will permanently delete <span className="text-red-400 font-medium">{deleteTarget.username}</span> and ALL their data.</p>
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <button onClick={handleDelete} disabled={deleting}
                                className="flex-1 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50">
                                {deleting ? 'Deleting...' : 'Yes, Delete'}
                            </button>
                            <button onClick={() => setDeleteTarget(null)}
                                className="flex-1 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm font-medium transition-colors">
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Page Title */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <CircleStackIcon className="h-8 w-8 text-red-400" />
                    <div>
                        <h1 className="text-2xl font-bold text-white">Database Overview</h1>
                        <p className="text-gray-400 text-sm">Manage all registered accounts</p>
                    </div>
                </div>
                <button onClick={() => setShowCreate(v => !v)}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-xl transition-colors">
                    <PlusIcon className="h-4 w-4" /> Add User
                </button>
            </div>

            {/* Create User Panel */}
            {showCreate && (
                <div className="bg-gray-900 border border-blue-500/30 rounded-2xl p-5">
                    <h3 className="text-sm font-semibold text-blue-400 mb-3">Create New User Account</h3>
                    <form onSubmit={handleCreate} className="flex gap-3 flex-wrap">
                        <input type="text" placeholder="Username" required value={newUsername} onChange={e => setNewUsername(e.target.value)}
                            className="flex-1 min-w-[180px] bg-gray-800 border border-gray-700 text-white rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                        <input type="password" placeholder="Password" required minLength={4} value={newPassword} onChange={e => setNewPassword(e.target.value)}
                            className="flex-1 min-w-[180px] bg-gray-800 border border-gray-700 text-white rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                        <button type="submit" disabled={creating}
                            className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50">
                            {creating ? 'Creating...' : 'Create'}
                        </button>
                        <button type="button" onClick={() => setShowCreate(false)}
                            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-400 rounded-lg text-sm transition-colors">
                            Cancel
                        </button>
                    </form>
                </div>
            )}

            {error && <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm">⚠ {error}</div>}

            {loading ? (
                <div className="flex justify-center py-20">
                    <div className="h-10 w-10 rounded-full border-4 border-red-500 border-t-transparent animate-spin" />
                </div>
            ) : (
                <>
                    {/* Stat Cards */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {[
                            { label: 'Total Accounts', value: users.length, icon: UsersIcon, color: 'text-blue-400' },
                            { label: 'Transactions', value: totalTx, icon: ClipboardDocumentListIcon, color: 'text-purple-400' },
                            { label: 'Total Income', value: `₹${totalIncome.toLocaleString('en-IN')}`, icon: BanknotesIcon, color: 'text-emerald-400' },
                            { label: 'Total Expenses', value: `₹${totalExpenses.toLocaleString('en-IN')}`, icon: BanknotesIcon, color: 'text-red-400' },
                        ].map(({ label, value, icon: Icon, color }) => (
                            <div key={label} className="bg-gray-900 rounded-xl p-5 border border-gray-800 flex items-center gap-4">
                                <div className="p-2 rounded-lg bg-gray-800"><Icon className={`h-5 w-5 ${color}`} /></div>
                                <div>
                                    <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
                                    <p className={`text-2xl font-bold ${color}`}>{value}</p>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Users Table */}
                    <div className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
                        <div className="px-6 py-4 border-b border-gray-800">
                            <h2 className="font-semibold text-white flex items-center gap-2">
                                <UsersIcon className="h-5 w-5 text-gray-400" />
                                Registered Accounts
                                <span className="ml-1 text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full">{users.length}</span>
                            </h2>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="text-xs text-gray-500 uppercase border-b border-gray-800 bg-gray-950/50">
                                    <tr>
                                        <th className="px-4 py-3 text-left">ID</th>
                                        <th className="px-4 py-3 text-left">Username</th>
                                        <th className="px-4 py-3 text-left">Registered</th>
                                        <th className="px-4 py-3 text-right">Income</th>
                                        <th className="px-4 py-3 text-right">Expenses</th>
                                        <th className="px-4 py-3 text-right">Balance</th>
                                        <th className="px-4 py-3 text-center">Tx</th>
                                        <th className="px-4 py-3 text-center">Actions</th>
                                        <th className="px-4 py-3" />
                                    </tr>
                                </thead>
                                <tbody>
                                    {users.length === 0 && (
                                        <tr><td colSpan={9} className="px-6 py-10 text-center text-gray-500">No user accounts yet.</td></tr>
                                    )}
                                    {users.map(u => (
                                        <React.Fragment key={u.id}>
                                            <tr className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                                                <td className="px-4 py-3 text-gray-600 font-mono text-xs">#{u.id}</td>
                                                <td className="px-4 py-3 font-semibold text-white cursor-pointer" onClick={() => toggleUser(u.id)}>{u.username}</td>
                                                <td className="px-4 py-3 text-gray-400 text-xs">{u.created_at}</td>
                                                <td className="px-4 py-3 text-right text-emerald-400 font-medium">₹{u.total_income.toLocaleString('en-IN')}</td>
                                                <td className="px-4 py-3 text-right text-red-400 font-medium">₹{u.total_expenses.toLocaleString('en-IN')}</td>
                                                <td className={`px-4 py-3 text-right font-bold ${u.available_balance >= 0 ? 'text-blue-400' : 'text-orange-400'}`}>
                                                    ₹{u.available_balance.toLocaleString('en-IN')}
                                                </td>
                                                <td className="px-4 py-3 text-center text-gray-300">{u.transaction_count}</td>
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center justify-center gap-2">
                                                        <button
                                                            onClick={() => { setResetTarget(u); setResetPwd(''); }}
                                                            title="Reset password"
                                                            className="p-1.5 rounded-lg text-gray-400 hover:text-blue-400 hover:bg-blue-500/10 transition-colors">
                                                            <KeyIcon className="h-4 w-4" />
                                                        </button>
                                                        <button
                                                            onClick={() => setDeleteTarget(u)}
                                                            title="Delete user"
                                                            className="p-1.5 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-colors">
                                                            <TrashIcon className="h-4 w-4" />
                                                        </button>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 text-right text-gray-600 cursor-pointer" onClick={() => toggleUser(u.id)}>
                                                    {expanded === u.id ? <ChevronUpIcon className="h-4 w-4 inline" /> : <ChevronDownIcon className="h-4 w-4 inline" />}
                                                </td>
                                            </tr>

                                            {/* Expanded Detail */}
                                            {expanded === u.id && (
                                                <tr>
                                                    <td colSpan={9} className="bg-gray-950/60 px-6 py-5 border-b border-gray-800">
                                                        {detailLoading ? (
                                                            <div className="flex justify-center py-8">
                                                                <div className="h-8 w-8 rounded-full border-4 border-blue-500 border-t-transparent animate-spin" />
                                                            </div>
                                                        ) : detail?.id === u.id ? (
                                                            <div className="space-y-4">
                                                                <div className="flex gap-2">
                                                                    {(['transactions', 'envelopes', 'reminders'] as const).map(tab => (
                                                                        <button key={tab} onClick={() => setActiveTab(tab)}
                                                                            className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-all ${activeTab === tab
                                                                                ? 'bg-red-500/20 text-red-400 ring-1 ring-red-500/40'
                                                                                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'}`}>
                                                                            {tab.charAt(0).toUpperCase() + tab.slice(1)}
                                                                            <span className="ml-1.5 text-[11px] opacity-60">
                                                                                ({tab === 'transactions' ? detail.transactions.length : tab === 'envelopes' ? detail.envelopes.length : detail.reminders.length})
                                                                            </span>
                                                                        </button>
                                                                    ))}
                                                                </div>

                                                                {activeTab === 'transactions' && (
                                                                    <div className="rounded-xl border border-gray-800 overflow-hidden">
                                                                        <div className="max-h-72 overflow-y-auto">
                                                                            <table className="w-full text-xs">
                                                                                <thead className="bg-gray-900 sticky top-0">
                                                                                    <tr>{['Date', 'Type', 'Category', 'Source', 'Amount', 'Description'].map(h => <th key={h} className="px-4 py-2 text-left text-gray-500 font-medium">{h}</th>)}</tr>
                                                                                </thead>
                                                                                <tbody className="divide-y divide-gray-800/50">
                                                                                    {detail.transactions.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-600">No transactions</td></tr>}
                                                                                    {detail.transactions.map(t => (
                                                                                        <tr key={t.id} className="hover:bg-gray-800/30">
                                                                                            <td className="px-4 py-2 text-gray-500 whitespace-nowrap">{t.date}</td>
                                                                                            <td className="px-4 py-2"><span className={`px-1.5 py-0.5 rounded text-xs font-semibold ${TYPE_COLORS[t.type] || 'bg-gray-700 text-gray-300'}`}>{t.type}</span></td>
                                                                                            <td className="px-4 py-2 capitalize text-gray-300">{t.category || '—'}</td>
                                                                                            <td className="px-4 py-2 text-gray-500">{t.source}</td>
                                                                                            <td className={`px-4 py-2 text-right font-semibold ${t.type === 'EXPENSE' ? 'text-red-400' : 'text-emerald-400'}`}>{t.type !== 'EXPENSE' ? '+' : ''}₹{t.amount.toLocaleString('en-IN')}</td>
                                                                                            <td className="px-4 py-2 text-gray-600 max-w-[180px] truncate">{t.description || '—'}</td>
                                                                                        </tr>
                                                                                    ))}
                                                                                </tbody>
                                                                            </table>
                                                                        </div>
                                                                    </div>
                                                                )}

                                                                {activeTab === 'envelopes' && (
                                                                    <div className="rounded-xl border border-gray-800 overflow-hidden">
                                                                        <table className="w-full text-xs">
                                                                            <thead className="bg-gray-900"><tr>{['Category', 'Allocated', 'Spent', 'Remaining', 'Progress'].map(h => <th key={h} className="px-4 py-2 text-left text-gray-500 font-medium">{h}</th>)}</tr></thead>
                                                                            <tbody className="divide-y divide-gray-800/50">
                                                                                {detail.envelopes.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-600">No envelopes</td></tr>}
                                                                                {detail.envelopes.map(e => {
                                                                                    const pct = e.allocated > 0 ? Math.min(100, (e.spent / e.allocated) * 100) : 0;
                                                                                    return (<tr key={e.id} className="hover:bg-gray-800/30">
                                                                                        <td className="px-4 py-2 capitalize font-medium text-gray-200">{e.category}</td>
                                                                                        <td className="px-4 py-2 text-gray-300">₹{e.allocated.toLocaleString('en-IN')}</td>
                                                                                        <td className="px-4 py-2 text-red-400">₹{e.spent.toLocaleString('en-IN')}</td>
                                                                                        <td className={`px-4 py-2 font-semibold ${e.remaining <= 0 ? 'text-red-400' : 'text-emerald-400'}`}>₹{e.remaining.toLocaleString('en-IN')}</td>
                                                                                        <td className="px-4 py-2 w-28"><div className="h-1.5 bg-gray-700 rounded-full w-24 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: pct >= 100 ? '#ef4444' : pct >= 80 ? '#f59e0b' : '#10b981' }} /></div></td>
                                                                                    </tr>);
                                                                                })}
                                                                            </tbody>
                                                                        </table>
                                                                    </div>
                                                                )}

                                                                {activeTab === 'reminders' && (
                                                                    <div className="rounded-xl border border-gray-800 overflow-hidden">
                                                                        <table className="w-full text-xs">
                                                                            <thead className="bg-gray-900"><tr>{['Title', 'Type', 'Amount', 'Due', 'Status'].map(h => <th key={h} className="px-4 py-2 text-left text-gray-500 font-medium">{h}</th>)}</tr></thead>
                                                                            <tbody className="divide-y divide-gray-800/50">
                                                                                {detail.reminders.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-600">No reminders</td></tr>}
                                                                                {detail.reminders.map(r => (
                                                                                    <tr key={r.id} className="hover:bg-gray-800/30">
                                                                                        <td className="px-4 py-2 font-medium text-gray-200">{r.title}</td>
                                                                                        <td className="px-4 py-2 text-gray-500">{r.type}</td>
                                                                                        <td className="px-4 py-2 font-semibold text-gray-200">₹{r.amount.toLocaleString('en-IN')}</td>
                                                                                        <td className="px-4 py-2 text-gray-500">{r.due_date || '—'}</td>
                                                                                        <td className="px-4 py-2">
                                                                                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${r.is_paid ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`}>
                                                                                                {r.is_paid ? <><CheckBadgeIcon className="h-3 w-3" />Paid</> : <><XCircleIcon className="h-3 w-3" />Pending</>}
                                                                                            </span>
                                                                                        </td>
                                                                                    </tr>
                                                                                ))}
                                                                            </tbody>
                                                                        </table>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        ) : null}
                                                    </td>
                                                </tr>
                                            )}
                                        </React.Fragment>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
