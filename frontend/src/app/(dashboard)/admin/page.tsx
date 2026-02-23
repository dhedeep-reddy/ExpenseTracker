"use client"
import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import api from '@/lib/api';
import { UsersIcon, ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/outline';
import { format } from 'date-fns';

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

const TYPE_COLOR: Record<string, string> = {
    INCOME: 'bg-emerald-100 text-emerald-700',
    SALARY: 'bg-blue-100 text-blue-700',
    EXPENSE: 'bg-red-100 text-red-700',
    ALLOCATE_BUDGET: 'bg-purple-100 text-purple-700',
};

export default function AdminPage() {
    const [users, setUsers] = useState<UserSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [expanded, setExpanded] = useState<number | null>(null);
    const [detail, setDetail] = useState<UserDetail | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [activeTab, setActiveTab] = useState<'transactions' | 'envelopes' | 'reminders'>('transactions');

    useEffect(() => {
        api.get('/admin/users')
            .then(r => setUsers(r.data))
            .catch(e => setError(e.response?.data?.detail || 'Access denied or backend error.'))
            .finally(() => setLoading(false));
    }, []);

    const toggleUser = async (id: number) => {
        if (expanded === id) { setExpanded(null); setDetail(null); return; }
        setExpanded(id);
        setDetailLoading(true);
        setActiveTab('transactions');
        try {
            const r = await api.get(`/admin/users/${id}`);
            setDetail(r.data);
        } catch (e: any) {
            setError(e.response?.data?.detail || 'Failed to load user detail');
        } finally {
            setDetailLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
                    <UsersIcon className="h-7 w-7 text-blue-600" /> Database Admin
                </h2>
                <p className="text-sm text-slate-500 mt-1">
                    View all registered accounts and their financial data. Only accessible to the first registered user.
                </p>
            </div>

            {loading && (
                <div className="flex justify-center py-16">
                    <div className="h-8 w-8 border-4 border-blue-400 border-t-transparent rounded-full animate-spin" />
                </div>
            )}

            {error && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
                    ⚠️ {error}
                </div>
            )}

            {!loading && !error && (
                <>
                    {/* Summary row */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <Card>
                            <CardContent className="pt-4">
                                <p className="text-xs text-slate-500 uppercase tracking-wide">Total Accounts</p>
                                <p className="text-3xl font-bold text-slate-900 mt-1">{users.length}</p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardContent className="pt-4">
                                <p className="text-xs text-slate-500 uppercase tracking-wide">Total Transactions</p>
                                <p className="text-3xl font-bold text-slate-900 mt-1">{users.reduce((s, u) => s + u.transaction_count, 0)}</p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardContent className="pt-4">
                                <p className="text-xs text-slate-500 uppercase tracking-wide">Total Income (all)</p>
                                <p className="text-3xl font-bold text-emerald-600 mt-1">₹{users.reduce((s, u) => s + u.total_income, 0).toLocaleString('en-IN')}</p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardContent className="pt-4">
                                <p className="text-xs text-slate-500 uppercase tracking-wide">Total Expenses (all)</p>
                                <p className="text-3xl font-bold text-red-500 mt-1">₹{users.reduce((s, u) => s + u.total_expenses, 0).toLocaleString('en-IN')}</p>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Users Table */}
                    <Card className="overflow-hidden p-0 border-0 shadow-sm ring-1 ring-slate-200">
                        <CardHeader className="px-6 pt-5 pb-3">
                            <CardTitle className="text-base">Registered Accounts</CardTitle>
                        </CardHeader>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-slate-50 border-b border-slate-200 text-xs uppercase text-slate-500">
                                    <tr>
                                        <th className="px-6 py-3 text-left font-medium">ID</th>
                                        <th className="px-6 py-3 text-left font-medium">Username</th>
                                        <th className="px-6 py-3 text-left font-medium">Registered</th>
                                        <th className="px-6 py-3 text-right font-medium">Income</th>
                                        <th className="px-6 py-3 text-right font-medium">Expenses</th>
                                        <th className="px-6 py-3 text-right font-medium">Balance</th>
                                        <th className="px-6 py-3 text-center font-medium">Tx</th>
                                        <th className="px-6 py-3 text-center font-medium">Envelopes</th>
                                        <th className="px-6 py-3 text-center font-medium">Reminders</th>
                                        <th className="px-6 py-3" />
                                    </tr>
                                </thead>
                                <tbody>
                                    {users.map(u => (
                                        <React.Fragment key={u.id}>
                                            <tr
                                                className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer transition-colors"
                                                onClick={() => toggleUser(u.id)}
                                            >
                                                <td className="px-6 py-3 text-slate-400 font-mono">#{u.id}</td>
                                                <td className="px-6 py-3 font-semibold text-slate-900">{u.username}</td>
                                                <td className="px-6 py-3 text-slate-500">{u.created_at}</td>
                                                <td className="px-6 py-3 text-right text-emerald-600 font-medium">₹{u.total_income.toLocaleString('en-IN')}</td>
                                                <td className="px-6 py-3 text-right text-red-500 font-medium">₹{u.total_expenses.toLocaleString('en-IN')}</td>
                                                <td className={`px-6 py-3 text-right font-bold ${u.available_balance >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>
                                                    ₹{u.available_balance.toLocaleString('en-IN')}
                                                </td>
                                                <td className="px-6 py-3 text-center text-slate-600">{u.transaction_count}</td>
                                                <td className="px-6 py-3 text-center text-slate-600">{u.envelope_count}</td>
                                                <td className="px-6 py-3 text-center text-slate-600">{u.reminder_count}</td>
                                                <td className="px-6 py-3 text-slate-400">
                                                    {expanded === u.id
                                                        ? <ChevronUpIcon className="h-4 w-4 ml-auto" />
                                                        : <ChevronDownIcon className="h-4 w-4 ml-auto" />}
                                                </td>
                                            </tr>

                                            {/* Expanded Detail */}
                                            {expanded === u.id && (
                                                <tr>
                                                    <td colSpan={10} className="bg-slate-50 px-6 py-5 border-b border-slate-200">
                                                        {detailLoading ? (
                                                            <div className="flex justify-center py-6">
                                                                <div className="h-6 w-6 border-4 border-blue-400 border-t-transparent rounded-full animate-spin" />
                                                            </div>
                                                        ) : detail && detail.id === u.id ? (
                                                            <div className="space-y-4">
                                                                {/* Tabs */}
                                                                <div className="flex gap-2">
                                                                    {(['transactions', 'envelopes', 'reminders'] as const).map(tab => (
                                                                        <button key={tab} onClick={e => { e.stopPropagation(); setActiveTab(tab); }}
                                                                            className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-colors ${activeTab === tab ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'}`}>
                                                                            {tab.charAt(0).toUpperCase() + tab.slice(1)}
                                                                            <span className="ml-1.5 text-xs opacity-70">
                                                                                ({tab === 'transactions' ? detail.transactions.length : tab === 'envelopes' ? detail.envelopes.length : detail.reminders.length})
                                                                            </span>
                                                                        </button>
                                                                    ))}
                                                                </div>

                                                                {/* Transactions Tab */}
                                                                {activeTab === 'transactions' && (
                                                                    <div className="rounded-xl overflow-hidden border border-slate-200 bg-white">
                                                                        <div className="max-h-80 overflow-y-auto">
                                                                            <table className="w-full text-xs">
                                                                                <thead className="bg-slate-100 sticky top-0">
                                                                                    <tr>
                                                                                        <th className="px-4 py-2 text-left text-slate-500 font-medium">Date</th>
                                                                                        <th className="px-4 py-2 text-left text-slate-500 font-medium">Type</th>
                                                                                        <th className="px-4 py-2 text-left text-slate-500 font-medium">Category</th>
                                                                                        <th className="px-4 py-2 text-left text-slate-500 font-medium">Source</th>
                                                                                        <th className="px-4 py-2 text-right text-slate-500 font-medium">Amount</th>
                                                                                        <th className="px-4 py-2 text-left text-slate-500 font-medium">Description</th>
                                                                                    </tr>
                                                                                </thead>
                                                                                <tbody className="divide-y divide-slate-100">
                                                                                    {detail.transactions.length === 0 && (
                                                                                        <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-400">No transactions</td></tr>
                                                                                    )}
                                                                                    {detail.transactions.map(t => (
                                                                                        <tr key={t.id} className="hover:bg-slate-50">
                                                                                            <td className="px-4 py-2 text-slate-500 whitespace-nowrap">{t.date}</td>
                                                                                            <td className="px-4 py-2">
                                                                                                <span className={`px-1.5 py-0.5 rounded text-xs font-semibold ${TYPE_COLOR[t.type] || 'bg-slate-100 text-slate-600'}`}>{t.type}</span>
                                                                                            </td>
                                                                                            <td className="px-4 py-2 capitalize text-slate-700">{t.category || '—'}</td>
                                                                                            <td className="px-4 py-2 text-slate-500">{t.source}</td>
                                                                                            <td className={`px-4 py-2 text-right font-semibold ${t.type === 'EXPENSE' ? 'text-red-600' : 'text-emerald-600'}`}>
                                                                                                {t.type !== 'EXPENSE' ? '+' : ''}₹{t.amount.toLocaleString('en-IN')}
                                                                                            </td>
                                                                                            <td className="px-4 py-2 text-slate-400 max-w-[180px] truncate">{t.description || '—'}</td>
                                                                                        </tr>
                                                                                    ))}
                                                                                </tbody>
                                                                            </table>
                                                                        </div>
                                                                    </div>
                                                                )}

                                                                {/* Envelopes Tab */}
                                                                {activeTab === 'envelopes' && (
                                                                    <div className="rounded-xl overflow-hidden border border-slate-200 bg-white">
                                                                        <table className="w-full text-xs">
                                                                            <thead className="bg-slate-100">
                                                                                <tr>
                                                                                    <th className="px-4 py-2 text-left text-slate-500 font-medium">Category</th>
                                                                                    <th className="px-4 py-2 text-right text-slate-500 font-medium">Allocated</th>
                                                                                    <th className="px-4 py-2 text-right text-slate-500 font-medium">Spent</th>
                                                                                    <th className="px-4 py-2 text-right text-slate-500 font-medium">Remaining</th>
                                                                                    <th className="px-4 py-2 text-left text-slate-500 font-medium">Progress</th>
                                                                                </tr>
                                                                            </thead>
                                                                            <tbody className="divide-y divide-slate-100">
                                                                                {detail.envelopes.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400">No envelopes</td></tr>}
                                                                                {detail.envelopes.map(e => {
                                                                                    const pct = e.allocated > 0 ? Math.min(100, (e.spent / e.allocated) * 100) : 0;
                                                                                    return (
                                                                                        <tr key={e.id} className="hover:bg-slate-50">
                                                                                            <td className="px-4 py-2 capitalize font-medium text-slate-800">{e.category}</td>
                                                                                            <td className="px-4 py-2 text-right text-slate-700">₹{e.allocated.toLocaleString('en-IN')}</td>
                                                                                            <td className="px-4 py-2 text-right text-red-500">₹{e.spent.toLocaleString('en-IN')}</td>
                                                                                            <td className={`px-4 py-2 text-right font-semibold ${e.remaining <= 0 ? 'text-red-600' : 'text-emerald-600'}`}>₹{e.remaining.toLocaleString('en-IN')}</td>
                                                                                            <td className="px-4 py-2 w-32">
                                                                                                <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden w-24">
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

                                                                {/* Reminders Tab */}
                                                                {activeTab === 'reminders' && (
                                                                    <div className="rounded-xl overflow-hidden border border-slate-200 bg-white">
                                                                        <table className="w-full text-xs">
                                                                            <thead className="bg-slate-100">
                                                                                <tr>
                                                                                    <th className="px-4 py-2 text-left text-slate-500 font-medium">Title</th>
                                                                                    <th className="px-4 py-2 text-left text-slate-500 font-medium">Type</th>
                                                                                    <th className="px-4 py-2 text-right text-slate-500 font-medium">Amount</th>
                                                                                    <th className="px-4 py-2 text-left text-slate-500 font-medium">Due</th>
                                                                                    <th className="px-4 py-2 text-center text-slate-500 font-medium">Status</th>
                                                                                </tr>
                                                                            </thead>
                                                                            <tbody className="divide-y divide-slate-100">
                                                                                {detail.reminders.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400">No reminders</td></tr>}
                                                                                {detail.reminders.map(r => (
                                                                                    <tr key={r.id} className="hover:bg-slate-50">
                                                                                        <td className="px-4 py-2 font-medium text-slate-800">{r.title}</td>
                                                                                        <td className="px-4 py-2 text-slate-500">{r.type}</td>
                                                                                        <td className="px-4 py-2 text-right font-semibold text-slate-700">₹{r.amount.toLocaleString('en-IN')}</td>
                                                                                        <td className="px-4 py-2 text-slate-500">{r.due_date || '—'}</td>
                                                                                        <td className="px-4 py-2 text-center">
                                                                                            <span className={`px-2 py-0.5 rounded text-xs font-semibold ${r.is_paid ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                                                                                {r.is_paid ? 'Paid' : 'Pending'}
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
                    </Card>
                </>
            )}
        </div>
    );
}
