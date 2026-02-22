"use client"
import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import api from '@/lib/api';
import {
    PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip,
    LineChart, Line, XAxis, YAxis, CartesianGrid
} from 'recharts';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { BellAlertIcon, ExclamationCircleIcon, ClockIcon, PlusIcon, PencilIcon, TrashIcon, CheckIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { isPast } from 'date-fns';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#f97316', '#14b8a6'];

export default function DashboardPage() {
    const { isAuthenticated } = useAuth();
    const router = useRouter();

    const [metrics, setMetrics] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [categoryData, setCategoryData] = useState<{ name: string; value: number }[]>([]);
    const [trendData, setTrendData] = useState<any[]>([]);
    const [envelopes, setEnvelopes] = useState<any[]>([]);
    const [reminders, setReminders] = useState<any[]>([]);

    // Envelope form state
    const [showAddEnv, setShowAddEnv] = useState(false);
    const [newEnvCategory, setNewEnvCategory] = useState('');
    const [newEnvAmount, setNewEnvAmount] = useState('');
    const [envSaving, setEnvSaving] = useState(false);
    const [editingEnvId, setEditingEnvId] = useState<number | null>(null);
    const [editingEnvAmount, setEditingEnvAmount] = useState('');

    useEffect(() => {
        if (!isAuthenticated) return;

        const fetchDashboard = async () => {
            try {
                const [metricsRes, txRes, envRes, remRes] = await Promise.all([
                    api.get('/analytics/dashboard'),
                    api.get('/transactions'),
                    api.get('/analytics/envelopes'),
                    api.get('/reminders/'),
                ]);

                setMetrics(metricsRes.data);
                setEnvelopes(envRes.data);
                // Show only upcoming/overdue (not paid), sorted by due_date
                const activeRem = (remRes.data as any[]).filter((r: any) => !r.is_paid);
                activeRem.sort((a: any, b: any) => {
                    if (!a.due_date) return 1;
                    if (!b.due_date) return -1;
                    return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
                });
                setReminders(activeRem.slice(0, 4));

                const txs: any[] = txRes.data;
                const expenses = txs.filter(t => t.type === 'EXPENSE');
                if (expenses.length > 0) {
                    // Category Pie
                    const catMap: Record<string, number> = {};
                    expenses.forEach(t => {
                        const cat = t.category
                            ? t.category.charAt(0).toUpperCase() + t.category.slice(1)
                            : 'Other';
                        catMap[cat] = (catMap[cat] || 0) + t.amount;
                    });
                    setCategoryData(Object.keys(catMap).map(k => ({ name: k, value: catMap[k] })));

                    // Trend line
                    const trendMap: Record<string, number> = {};
                    [...expenses].reverse().forEach(t => {
                        const d = new Date(t.date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
                        trendMap[d] = (trendMap[d] || 0) + t.amount;
                    });
                    setTrendData(Object.keys(trendMap).map(k => ({ date: k, amount: trendMap[k] })));
                }
            } catch (err: any) {
                if (err.response?.status === 401) router.push('/login');
                console.error('Dashboard fetch failed', err);
            } finally {
                setLoading(false);
            }
        };

        fetchDashboard();
    }, [isAuthenticated, router]);

    const fetchEnvelopes = async () => {
        const res = await api.get('/analytics/envelopes');
        setEnvelopes(res.data);
    };

    const handleAddEnvelope = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newEnvCategory.trim() || !newEnvAmount) return;
        setEnvSaving(true);
        try {
            await api.post('/analytics/envelopes', {
                category_name: newEnvCategory.trim().toLowerCase(),
                allocated_amount: parseFloat(newEnvAmount),
            });
            setNewEnvCategory(''); setNewEnvAmount(''); setShowAddEnv(false);
            await fetchEnvelopes();
        } finally { setEnvSaving(false); }
    };

    const handleUpdateEnvelope = async (id: number) => {
        if (!editingEnvAmount) return;
        setEnvSaving(true);
        try {
            await api.put(`/analytics/envelopes/${id}`, { allocated_amount: parseFloat(editingEnvAmount) });
            setEditingEnvId(null); setEditingEnvAmount('');
            await fetchEnvelopes();
        } finally { setEnvSaving(false); }
    };

    const handleDeleteEnvelope = async (id: number, name: string) => {
        if (!confirm(`Delete the '${name}' envelope?`)) return;
        await api.delete(`/analytics/envelopes/${id}`);
        await fetchEnvelopes();
    };

    if (loading) return <div className="p-8 text-center text-slate-500 animate-pulse">Loading dashboard...</div>;
    if (!metrics) return <div className="p-8 text-center text-red-500">Failed to load. Ensure backend is running.</div>;

    return (
        <div className="space-y-6">
            <h2 className="text-2xl font-bold tracking-tight text-slate-900">Financial Overview</h2>

            {/* ── Hero Balance Card ─────────────────────────────────── */}
            <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl p-8 text-white shadow-xl relative overflow-hidden">
                <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 rounded-full bg-brand/20 blur-3xl" />
                <div className="relative z-10 flex flex-col md:flex-row md:items-end md:justify-between gap-6">
                    <div>
                        <p className="text-slate-400 font-medium mb-1 uppercase tracking-wider text-sm">Available Balance</p>
                        <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight">
                            ₹{metrics.available_balance.toLocaleString('en-IN')}
                        </h1>
                        <div className="mt-4 inline-flex items-center gap-2 text-sm bg-white/10 px-3 py-1.5 rounded-full border border-white/10">
                            <span className={`w-2 h-2 rounded-full ${metrics.burn_rate_status === 'STABLE' ? 'bg-emerald-400' : metrics.burn_rate_status === 'WARNING' ? 'bg-yellow-400' : 'bg-red-400'}`} />
                            Burn Rate: {metrics.burn_rate_status}
                        </div>
                    </div>
                    <div className="flex gap-8 border-t border-white/10 pt-6 md:border-t-0 md:pt-0">
                        <div>
                            <p className="text-slate-400 text-sm mb-1">Total Income</p>
                            <p className="text-2xl font-bold text-emerald-400">₹{metrics.total_income.toLocaleString('en-IN')}</p>
                        </div>
                        <div>
                            <p className="text-slate-400 text-sm mb-1">Total Spent</p>
                            <p className="text-2xl font-bold text-red-400">₹{metrics.total_expenses.toLocaleString('en-IN')}</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* ── KPI Cards ─────────────────────────────────────────── */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="hover:border-brand/50 transition-colors">
                    <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-slate-500">Net Flow</CardTitle></CardHeader>
                    <CardContent>
                        <div className={`text-2xl font-bold ${metrics.net_flow >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                            {metrics.net_flow >= 0 ? '+' : ''}₹{metrics.net_flow.toLocaleString('en-IN')}
                        </div>
                    </CardContent>
                </Card>
                <Card className="hover:border-brand/50 transition-colors">
                    <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-slate-500">Daily Average</CardTitle></CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-slate-900">
                            ₹{Math.round(metrics.daily_average_spending).toLocaleString('en-IN')}
                        </div>
                    </CardContent>
                </Card>
                <Card className="hover:border-brand/50 transition-colors">
                    <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-slate-500">Days Remaining</CardTitle></CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-slate-900">
                            {metrics.remaining_days} <span className="text-sm font-normal text-slate-500">days</span>
                        </div>
                    </CardContent>
                </Card>
                <Card className="bg-brand/5 border-brand/20">
                    <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-brand">Smart Goal</CardTitle></CardHeader>
                    <CardContent>
                        <div className="text-sm text-slate-700 leading-snug">
                            Keep daily spend under{' '}
                            <strong className="text-slate-900">
                                ₹{Math.round(metrics.available_balance / Math.max(1, metrics.remaining_days)).toLocaleString('en-IN')}
                            </strong>{' '}
                            to make balance last.
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* ── Reminders Widget ─────────────────────────────────────── */}
            <Card className={reminders.some((r: any) => r.due_date && isPast(new Date(r.due_date))) ? 'border-red-200' : ''}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="flex items-center gap-2 text-base">
                        <BellAlertIcon className="h-5 w-5 text-brand" />
                        Upcoming Payments &amp; Loans
                    </CardTitle>
                    <Link href="/reminders" className="text-xs text-brand hover:underline font-medium">View all →</Link>
                </CardHeader>
                <CardContent>
                    {reminders.length === 0 ? (
                        <p className="text-sm text-slate-400 text-center py-3">
                            No upcoming reminders.{' '}
                            <Link href="/reminders" className="text-brand hover:underline">Add one →</Link>
                        </p>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {reminders.map((r: any) => {
                                const overdue = r.due_date && isPast(new Date(r.due_date));
                                return (
                                    <div key={r.id} className={`flex items-center justify-between p-3 rounded-lg border ${overdue ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-200'
                                        }`}>
                                        <div className="flex items-center gap-2 min-w-0">
                                            {overdue
                                                ? <ExclamationCircleIcon className="h-4 w-4 text-red-500 flex-shrink-0" />
                                                : <ClockIcon className="h-4 w-4 text-amber-500 flex-shrink-0" />}
                                            <div className="min-w-0">
                                                <p className={`text-sm font-medium truncate ${overdue ? 'text-red-700' : 'text-slate-800'}`}>{r.title}</p>
                                                {r.due_date && (
                                                    <p className={`text-xs ${overdue ? 'text-red-500 font-medium' : 'text-slate-400'}`}>
                                                        {overdue ? '⚠ Overdue' : `Due ${new Date(r.due_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                        <span className={`ml-3 font-bold text-sm flex-shrink-0 ${overdue ? 'text-red-700' : 'text-slate-900'}`}>
                                            ₹{r.amount.toLocaleString('en-IN')}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* ── Budget Envelopes ──────────────────────────────────── */}
            <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                        📋 Budget Envelopes
                    </CardTitle>
                    <button
                        onClick={() => setShowAddEnv(v => !v)}
                        className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors"
                    >
                        <PlusIcon className="h-3.5 w-3.5" /> Add Envelope
                    </button>
                </CardHeader>
                <CardContent className="space-y-4">
                    {/* Add form */}
                    {showAddEnv && (
                        <form onSubmit={handleAddEnvelope} className="flex gap-2 p-3 bg-blue-50 rounded-xl border border-blue-200 mb-2">
                            <input
                                required
                                className="flex-1 px-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
                                placeholder="Category (e.g. food, rent)"
                                value={newEnvCategory}
                                onChange={e => setNewEnvCategory(e.target.value)}
                            />
                            <input
                                required
                                type="number" min="1" step="0.01"
                                className="w-32 px-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
                                placeholder="₹ Amount"
                                value={newEnvAmount}
                                onChange={e => setNewEnvAmount(e.target.value)}
                            />
                            <button type="submit" disabled={envSaving}
                                className="flex items-center gap-1 bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-60">
                                <CheckIcon className="h-4 w-4" /> {envSaving ? '...' : 'Add'}
                            </button>
                            <button type="button" onClick={() => setShowAddEnv(false)}
                                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100">
                                <XMarkIcon className="h-4 w-4" />
                            </button>
                        </form>
                    )}

                    {envelopes.length === 0 && !showAddEnv && (
                        <div className="text-center py-6 text-slate-400 text-sm">
                            No budget envelopes yet.{' '}
                            <button onClick={() => setShowAddEnv(true)} className="text-blue-600 hover:underline font-medium">Create one →</button>
                            <p className="mt-1 text-xs text-slate-400">Or say <span className="italic">"Allocate 10000 to food"</span> in AI Chat.</p>
                        </div>
                    )}

                    {envelopes.map((env: any, i: number) => {
                        const pct = env.allocated_amount > 0
                            ? Math.min(100, (env.spent_amount / env.allocated_amount) * 100)
                            : 0;
                        const isOver = env.spent_amount > env.allocated_amount;
                        const color = COLORS[i % COLORS.length];
                        const isEditing = editingEnvId === env.id;
                        return (
                            <div key={env.id}>
                                <div className="flex items-center justify-between mb-1.5 gap-2">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                                        <span className="font-medium text-slate-800 capitalize truncate">{env.category_name}</span>
                                    </div>
                                    <div className="flex items-center gap-2 flex-shrink-0">
                                        {isEditing ? (
                                            <>
                                                <input
                                                    autoFocus
                                                    type="number" min="0" step="0.01"
                                                    value={editingEnvAmount}
                                                    onChange={e => setEditingEnvAmount(e.target.value)}
                                                    className="w-28 px-2 py-1 text-sm border border-blue-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
                                                />
                                                <button onClick={() => handleUpdateEnvelope(env.id)} disabled={envSaving}
                                                    className="p-1 text-emerald-600 hover:bg-emerald-50 rounded transition-colors" title="Save">
                                                    <CheckIcon className="h-4 w-4" />
                                                </button>
                                                <button onClick={() => setEditingEnvId(null)}
                                                    className="p-1 text-slate-400 hover:bg-slate-100 rounded transition-colors" title="Cancel">
                                                    <XMarkIcon className="h-4 w-4" />
                                                </button>
                                            </>
                                        ) : (
                                            <>
                                                <div className="text-sm text-right">
                                                    <span className={isOver ? 'text-red-600 font-semibold' : 'text-slate-700'}>
                                                        ₹{env.spent_amount.toLocaleString('en-IN')}
                                                    </span>
                                                    <span className="text-slate-400"> / ₹{env.allocated_amount.toLocaleString('en-IN')}</span>
                                                    <span className={`ml-2 font-semibold text-xs ${isOver ? 'text-red-600' : 'text-emerald-600'}`}>
                                                        {isOver
                                                            ? `−₹${(env.spent_amount - env.allocated_amount).toLocaleString('en-IN')} over`
                                                            : `₹${env.remaining_amount.toLocaleString('en-IN')} left`}
                                                    </span>
                                                </div>
                                                <button
                                                    onClick={() => { setEditingEnvId(env.id); setEditingEnvAmount(String(env.allocated_amount)); }}
                                                    className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors" title="Edit budget">
                                                    <PencilIcon className="h-3.5 w-3.5" />
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteEnvelope(env.id, env.category_name)}
                                                    className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors" title="Delete">
                                                    <TrashIcon className="h-3.5 w-3.5" />
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </div>
                                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                                    <div
                                        className="h-full rounded-full transition-all duration-700"
                                        style={{
                                            width: `${pct}%`,
                                            backgroundColor: isOver ? '#ef4444' : pct > 80 ? '#f59e0b' : color,
                                        }}
                                    />
                                </div>
                            </div>
                        );
                    })}
                </CardContent>
            </Card>

            {/* ── Charts ───────────────────────────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                {/* Pie Chart + Legend */}
                <Card className="flex flex-col">
                    <CardHeader><CardTitle>Spending by Category</CardTitle></CardHeader>
                    <CardContent className="flex-1">
                        {categoryData.length > 0 ? (
                            <div className="flex flex-col gap-4">
                                <ResponsiveContainer width="100%" height={200}>
                                    <PieChart>
                                        <Pie
                                            data={categoryData}
                                            cx="50%" cy="50%"
                                            innerRadius={55} outerRadius={85}
                                            paddingAngle={4} dataKey="value" stroke="none"
                                        >
                                            {categoryData.map((_, index) => (
                                                <Cell key={index} fill={COLORS[index % COLORS.length]} />
                                            ))}
                                        </Pie>
                                        <RechartsTooltip
                                            formatter={(value: any, name: any) => [`₹${Number(value).toLocaleString('en-IN')}`, name]}
                                            contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                        />
                                    </PieChart>
                                </ResponsiveContainer>

                                {/* Category Legend */}
                                <div className="grid grid-cols-2 gap-x-4 gap-y-2 pt-1">
                                    {categoryData.map((item, index) => {
                                        const total = categoryData.reduce((s, d) => s + d.value, 0);
                                        const pct = total > 0 ? ((item.value / total) * 100).toFixed(1) : '0';
                                        return (
                                            <div key={index} className="flex items-center gap-2 text-sm min-w-0">
                                                <span
                                                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                                                    style={{ backgroundColor: COLORS[index % COLORS.length] }}
                                                />
                                                <span className="text-slate-700 truncate flex-1">{item.name}</span>
                                                <span className="text-slate-400 font-medium flex-shrink-0">{pct}%</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ) : (
                            <div className="h-[200px] flex items-center justify-center text-slate-400 text-sm">
                                No expense data yet
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Spending Trend */}
                <Card className="flex flex-col">
                    <CardHeader><CardTitle>Spending Trend</CardTitle></CardHeader>
                    <CardContent className="flex-1 min-h-[300px]">
                        {trendData.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={trendData}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                    <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} dy={10} />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} tickFormatter={v => `₹${v}`} />
                                    <RechartsTooltip
                                        formatter={(value: any) => [`₹${Number(value).toLocaleString('en-IN')}`, 'Spent']}
                                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                    />
                                    <Line type="monotone" dataKey="amount" stroke="#3b82f6" strokeWidth={3}
                                        dot={{ r: 4, strokeWidth: 2, fill: '#fff' }}
                                        activeDot={{ r: 6, fill: '#3b82f6' }} />
                                </LineChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="h-full flex items-center justify-center text-slate-400 text-sm">
                                Not enough data for a trend line
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
