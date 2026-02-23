"use client"
import React, { useEffect, useState } from 'react';
import api from '@/lib/api';
import {
    UsersIcon, BanknotesIcon, ClipboardDocumentListIcon,
    TrashIcon, ChevronDownIcon, ChevronUpIcon,
    CircleStackIcon, CheckBadgeIcon, XCircleIcon
} from '@heroicons/react/24/outline';

interface UserSummary {
    id: number;
    username: string;
    created_at: string;
    total_income: number;
    total_expenses: number;
    available_balance: number;
    transaction_count: number;
    envelope_count: number;
    reminder_count: number;
}

interface TransactionRow {
    id: number;
    type: string;
    category: string | null;
    amount: number;
    source: string;
    description: string | null;
    date: string;
}

interface UserDetail {
    id: number;
    username: string;
    created_at: string;
    total_income: number;
    total_expenses: number;
    available_balance: number;
    transactions: TransactionRow[];
    envelopes: { id: number; category: string; allocated: number; spent: number; remaining: number }[];
    reminders: { id: number; title: string; amount: number; type: string; due_date: string | null; is_paid: boolean }[];
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

    const fetchUsers = () => {
        api.get('/admin/users')
            .then(r => setUsers(r.data))
            .catch(e => setError(e.response?.data?.detail || 'Access denied.'))
            .finally(() => setLoading(false));
    };

    useEffect(() => { fetchUsers(); }, []);

    const toggleUser = async (id: number) => {
        if (expanded === id) { setExpanded(null); setDetail(null); return; }
        setExpanded(id); setDetailLoading(true); setActiveTab('transactions');
        try {
            const r = await api.get(`/admin/users/${id}`);
            setDetail(r.data);
        } finally { setDetailLoading(false); }
    };

    const totalIncome = users.reduce((s, u) => s + u.total_income, 0);
    const totalExpenses = users.reduce((s, u) => s + u.total_expenses, 0);
    const totalTx = users.reduce((s, u) => s + u.transaction_count, 0);

    return (
        <div className="space-y-8">
            {/* Page Title */}
            <div className="flex items-center gap-3">
                <CircleStackIcon className="h-8 w-8 text-red-400" />
                <div>
                    <h1 className="text-2xl font-bold text-white">Database Overview</h1>
                    <p className="text-gray-400 text-sm">All registered accounts and their financial data</p>
                </div>
            </div>

            {error && (
                <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm">⚠ {error}</div>
            )}

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
                                <div className={`p-2 rounded-lg bg-gray-800`}>
                                    <Icon className={`h-5 w-5 ${color}`} />
                                </div>
                                <div>
                                    <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
                                    <p className={`text-2xl font-bold ${color}`}>{value}</p>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Users Table */}
                    <div className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
                        <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
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
                                        <th className="px-6 py-3 text-left">ID</th>
                                        <th className="px-6 py-3 text-left">Username</th>
                                        <th className="px-6 py-3 text-left">Registered</th>
                                        <th className="px-6 py-3 text-right">Income</th>
                                        <th className="px-6 py-3 text-right">Expenses</th>
                                        <th className="px-6 py-3 text-right">Balance</th>
                                        <th className="px-6 py-3 text-center">Tx</th>
                                        <th className="px-6 py-3 text-center">Envelopes</th>
                                        <th className="px-6 py-3 text-center">Reminders</th>
                                        <th className="px-6 py-3" />
                                    </tr>
                                </thead>
                                <tbody>
                                    {users.length === 0 && (
                                        <tr><td colSpan={10} className="px-6 py-10 text-center text-gray-500">No user accounts found.</td></tr>
                                    )}
                                    {users.map(u => (
                                        <React.Fragment key={u.id}>
                                            <tr
                                                onClick={() => toggleUser(u.id)}
                                                className="border-b border-gray-800/50 hover:bg-gray-800/40 cursor-pointer transition-colors"
                                            >
                                                <td className="px-6 py-4 text-gray-600 font-mono text-xs">#{u.id}</td>
                                                <td className="px-6 py-4 font-semibold text-white">{u.username}</td>
                                                <td className="px-6 py-4 text-gray-400 text-xs">{u.created_at}</td>
                                                <td className="px-6 py-4 text-right text-emerald-400 font-medium">₹{u.total_income.toLocaleString('en-IN')}</td>
                                                <td className="px-6 py-4 text-right text-red-400 font-medium">₹{u.total_expenses.toLocaleString('en-IN')}</td>
                                                <td className={`px-6 py-4 text-right font-bold ${u.available_balance >= 0 ? 'text-blue-400' : 'text-orange-400'}`}>
                                                    ₹{u.available_balance.toLocaleString('en-IN')}
                                                </td>
                                                <td className="px-6 py-4 text-center text-gray-300">{u.transaction_count}</td>
                                                <td className="px-6 py-4 text-center text-gray-300">{u.envelope_count}</td>
                                                <td className="px-6 py-4 text-center text-gray-300">{u.reminder_count}</td>
                                                <td className="px-6 py-4 text-right text-gray-600">
                                                    {expanded === u.id ? <ChevronUpIcon className="h-4 w-4 inline" /> : <ChevronDownIcon className="h-4 w-4 inline" />}
                                                </td>
                                            </tr>

                                            {expanded === u.id && (
                                                <tr>
                                                    <td colSpan={10} className="bg-gray-950/60 px-6 py-5 border-b border-gray-800">
                                                        {detailLoading ? (
                                                            <div className="flex justify-center py-8">
                                                                <div className="h-8 w-8 rounded-full border-4 border-blue-500 border-t-transparent animate-spin" />
                                                            </div>
                                                        ) : detail?.id === u.id ? (
                                                            <div className="space-y-4">
                                                                {/* Tabs */}
                                                                <div className="flex gap-2">
                                                                    {(['transactions', 'envelopes', 'reminders'] as const).map(tab => (
                                                                        <button key={tab}
                                                                            onClick={e => { e.stopPropagation(); setActiveTab(tab); }}
                                                                            className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-all ${activeTab === tab
                                                                                ? 'bg-red-500/20 text-red-400 ring-1 ring-red-500/40'
                                                                                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'}`}>
                                                                            {tab.charAt(0).toUpperCase() + tab.slice(1)}
                                                                            <span className="ml-1.5 text-xs opacity-60">
                                                                                ({tab === 'transactions' ? detail.transactions.length : tab === 'envelopes' ? detail.envelopes.length : detail.reminders.length})
                                                                            </span>
                                                                        </button>
                                                                    ))}
                                                                </div>

                                                                {/* Transactions */}
                                                                {activeTab === 'transactions' && (
                                                                    <div className="rounded-xl border border-gray-800 overflow-hidden">
                                                                        <div className="max-h-72 overflow-y-auto">
                                                                            <table className="w-full text-xs">
                                                                                <thead className="bg-gray-900 sticky top-0">
                                                                                    <tr>
                                                                                        {['Date', 'Type', 'Category', 'Source', 'Amount', 'Description'].map(h => (
                                                                                            <th key={h} className="px-4 py-2 text-left text-gray-500 font-medium">{h}</th>
                                                                                        ))}
                                                                                    </tr>
                                                                                </thead>
                                                                                <tbody className="divide-y divide-gray-800/50">
                                                                                    {detail.transactions.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-600">No transactions</td></tr>}
                                                                                    {detail.transactions.map(t => (
                                                                                        <tr key={t.id} className="hover:bg-gray-800/30">
                                                                                            <td className="px-4 py-2 text-gray-500 whitespace-nowrap">{t.date}</td>
                                                                                            <td className="px-4 py-2">
                                                                                                <span className={`px-1.5 py-0.5 rounded text-xs font-semibold ${TYPE_COLORS[t.type] || 'bg-gray-700 text-gray-300'}`}>{t.type}</span>
                                                                                            </td>
                                                                                            <td className="px-4 py-2 capitalize text-gray-300">{t.category || '—'}</td>
                                                                                            <td className="px-4 py-2 text-gray-500">{t.source}</td>
                                                                                            <td className={`px-4 py-2 text-right font-semibold ${t.type === 'EXPENSE' ? 'text-red-400' : 'text-emerald-400'}`}>
                                                                                                {t.type !== 'EXPENSE' ? '+' : ''}₹{t.amount.toLocaleString('en-IN')}
                                                                                            </td>
                                                                                            <td className="px-4 py-2 text-gray-600 max-w-[180px] truncate">{t.description || '—'}</td>
                                                                                        </tr>
                                                                                    ))}
                                                                                </tbody>
                                                                            </table>
                                                                        </div>
                                                                    </div>
                                                                )}

                                                                {/* Envelopes */}
                                                                {activeTab === 'envelopes' && (
                                                                    <div className="rounded-xl border border-gray-800 overflow-hidden">
                                                                        <table className="w-full text-xs">
                                                                            <thead className="bg-gray-900">
                                                                                <tr>
                                                                                    {['Category', 'Allocated', 'Spent', 'Remaining', 'Progress'].map(h => (
                                                                                        <th key={h} className="px-4 py-2 text-left text-gray-500 font-medium">{h}</th>
                                                                                    ))}
                                                                                </tr>
                                                                            </thead>
                                                                            <tbody className="divide-y divide-gray-800/50">
                                                                                {detail.envelopes.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-600">No envelopes</td></tr>}
                                                                                {detail.envelopes.map(e => {
                                                                                    const pct = e.allocated > 0 ? Math.min(100, (e.spent / e.allocated) * 100) : 0;
                                                                                    return (
                                                                                        <tr key={e.id} className="hover:bg-gray-800/30">
                                                                                            <td className="px-4 py-2 capitalize font-medium text-gray-200">{e.category}</td>
                                                                                            <td className="px-4 py-2 text-gray-300">₹{e.allocated.toLocaleString('en-IN')}</td>
                                                                                            <td className="px-4 py-2 text-red-400">₹{e.spent.toLocaleString('en-IN')}</td>
                                                                                            <td className={`px-4 py-2 font-semibold ${e.remaining <= 0 ? 'text-red-400' : 'text-emerald-400'}`}>₹{e.remaining.toLocaleString('en-IN')}</td>
                                                                                            <td className="px-4 py-2 w-28">
                                                                                                <div className="h-1.5 bg-gray-700 rounded-full w-24 overflow-hidden">
                                                                                                    <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: pct >= 100 ? '#ef4444' : pct >= 80 ? '#f59e0b' : '#10b981' }} />
                                                                                                </div>
                                                                                            </td>
                                                                                        </tr>
                                                                                    );
                                                                                })}
                                                                            </tbody>
                                                                        </table>
                                                                    </div>
                                                                )}

                                                                {/* Reminders */}
                                                                {activeTab === 'reminders' && (
                                                                    <div className="rounded-xl border border-gray-800 overflow-hidden">
                                                                        <table className="w-full text-xs">
                                                                            <thead className="bg-gray-900">
                                                                                <tr>
                                                                                    {['Title', 'Type', 'Amount', 'Due', 'Status'].map(h => (
                                                                                        <th key={h} className="px-4 py-2 text-left text-gray-500 font-medium">{h}</th>
                                                                                    ))}
                                                                                </tr>
                                                                            </thead>
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
