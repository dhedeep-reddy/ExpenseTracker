"use client"
import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import api from '@/lib/api';
import { CalendarDaysIcon, ChevronDownIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend,
    PieChart, Pie, Cell, LineChart, Line
} from 'recharts';
import { format } from 'date-fns';

interface MonthlyRecord {
    month: string;
    label: string;
    total_income: number;
    total_expenses: number;
    net: number;
    transaction_count: number;
}

interface Transaction {
    id: number;
    date: string;
    type: string;
    category: string | null;
    amount: number;
    description: string | null;
    source: string;
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#f97316', '#14b8a6'];

const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload?.length) {
        return (
            <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-lg text-xs space-y-1">
                <p className="font-semibold text-slate-800 text-sm mb-1">{label}</p>
                {payload.map((p: any) => (
                    <div key={p.name} className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.fill }} />
                        <span className="text-slate-600 capitalize">{p.name}:</span>
                        <span className="font-semibold text-slate-800">₹{Number(p.value).toLocaleString('en-IN')}</span>
                    </div>
                ))}
            </div>
        );
    }
    return null;
};

export default function HistoryPage() {
    const [data, setData] = useState<MonthlyRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [expanded, setExpanded] = useState<string | null>(null);
    const [monthTxs, setMonthTxs] = useState<Record<string, Transaction[]>>({});
    const [loadingMonth, setLoadingMonth] = useState<string | null>(null);

    useEffect(() => {
        api.get('/analytics/monthly-history')
            .then(res => setData(res.data))
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    const toggleMonth = async (month: string) => {
        if (expanded === month) {
            setExpanded(null);
            return;
        }
        setExpanded(month);
        if (monthTxs[month]) return;

        setLoadingMonth(month);
        try {
            // Fetch all transactions and filter client-side by month
            const res = await api.get('/transactions/all');
            const allTxs: Transaction[] = res.data;
            const byMonth: Record<string, Transaction[]> = {};
            allTxs.forEach(tx => {
                const key = new Date(tx.date).toISOString().substring(0, 7);
                if (!byMonth[key]) byMonth[key] = [];
                byMonth[key].push(tx);
            });
            setMonthTxs(prev => ({ ...prev, ...byMonth }));
        } catch {
            // If the /all endpoint doesn't exist yet, just skip
        } finally {
            setLoadingMonth(null);
        }
    };

    const chartData = [...data].reverse().slice(-12); // last 12 months for chart

    const totalIncome = data.reduce((s, r) => s + r.total_income, 0);
    const totalExpenses = data.reduce((s, r) => s + r.total_expenses, 0);
    const totalNet = totalIncome - totalExpenses;

    if (loading) return <div className="p-8 text-center text-slate-500 animate-pulse">Loading history...</div>;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h2 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
                    <CalendarDaysIcon className="h-7 w-7 text-brand" />
                    Monthly History
                </h2>
                <p className="text-sm text-slate-500 mt-1">Income and expenses grouped by calendar month across all your cycles.</p>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5">
                    <p className="text-xs text-emerald-600 font-medium uppercase tracking-wide mb-1">All-time Income</p>
                    <p className="text-2xl font-bold text-emerald-700">₹{totalIncome.toLocaleString('en-IN')}</p>
                </div>
                <div className="bg-red-50 border border-red-200 rounded-xl p-5">
                    <p className="text-xs text-red-600 font-medium uppercase tracking-wide mb-1">All-time Expenses</p>
                    <p className="text-2xl font-bold text-red-700">₹{totalExpenses.toLocaleString('en-IN')}</p>
                </div>
                <div className={`border rounded-xl p-5 ${totalNet >= 0 ? 'bg-blue-50 border-blue-200' : 'bg-orange-50 border-orange-200'}`}>
                    <p className={`text-xs font-medium uppercase tracking-wide mb-1 ${totalNet >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>Net Savings</p>
                    <p className={`text-2xl font-bold ${totalNet >= 0 ? 'text-blue-700' : 'text-orange-700'}`}>
                        {totalNet >= 0 ? '+' : ''}₹{totalNet.toLocaleString('en-IN')}
                    </p>
                </div>
            </div>

            {/* Bar Chart */}
            {chartData.length > 0 && (
                <Card>
                    <CardHeader><CardTitle>Income vs Expenses — Last 12 Months</CardTitle></CardHeader>
                    <CardContent>
                        <ResponsiveContainer width="100%" height={280}>
                            <BarChart data={chartData} barCategoryGap="30%">
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }} dy={6} />
                                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }} tickFormatter={v => `₹${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`} />
                                <RechartsTooltip content={<CustomTooltip />} />
                                <Legend
                                    iconType="circle" iconSize={8}
                                    formatter={(value) => <span className="text-xs text-slate-600 capitalize">{value}</span>}
                                />
                                <Bar dataKey="total_income" name="income" fill="#10b981" radius={[4, 4, 0, 0]} />
                                <Bar dataKey="total_expenses" name="expenses" fill="#ef4444" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>
            )}

            {/* Monthly Table */}
            <Card className="overflow-hidden">
                <CardHeader><CardTitle className="text-base">Month-by-Month Breakdown</CardTitle></CardHeader>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50 border-b border-slate-200">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase w-8" />
                                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Month</th>
                                <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">Income</th>
                                <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">Expenses</th>
                                <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">Net</th>
                                <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">Txns</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="px-4 py-10 text-center text-slate-400">
                                        No history yet. Start logging transactions!
                                    </td>
                                </tr>
                            )}
                            {data.map(row => (
                                <React.Fragment key={row.month}>
                                    <tr
                                        className="border-b border-slate-100 hover:bg-slate-50/60 cursor-pointer transition-colors"
                                        onClick={() => toggleMonth(row.month)}>
                                        <td className="px-4 py-3.5 text-slate-400">
                                            {expanded === row.month
                                                ? <ChevronDownIcon className="h-4 w-4" />
                                                : <ChevronRightIcon className="h-4 w-4" />}
                                        </td>
                                        <td className="px-4 py-3.5 font-semibold text-slate-800">{row.label}</td>
                                        <td className="px-4 py-3.5 text-right font-medium text-emerald-600">
                                            +₹{row.total_income.toLocaleString('en-IN')}
                                        </td>
                                        <td className="px-4 py-3.5 text-right font-medium text-red-600">
                                            −₹{row.total_expenses.toLocaleString('en-IN')}
                                        </td>
                                        <td className={`px-4 py-3.5 text-right font-bold ${row.net >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>
                                            {row.net >= 0 ? '+' : ''}₹{row.net.toLocaleString('en-IN')}
                                        </td>
                                        <td className="px-4 py-3.5 text-right text-slate-500">{row.transaction_count}</td>
                                    </tr>
                                    {expanded === row.month && (
                                        <tr>
                                            <td colSpan={6} className="px-0 py-0 bg-slate-50/80">
                                                {loadingMonth === row.month ? (
                                                    <div className="p-6 text-center text-slate-400 text-sm animate-pulse">Loading transactions…</div>
                                                ) : monthTxs[row.month]?.length > 0 ? (
                                                    <div className="p-4 md:p-6 space-y-6 border-t border-slate-200">
                                                        {/* Dynamic Graphs for this month */}
                                                        {(() => {
                                                            const monthExpenses = monthTxs[row.month].filter(t => t.type === 'EXPENSE');
                                                            if (monthExpenses.length === 0) return null;

                                                            // 1. Spending by Category data
                                                            const catMap: Record<string, number> = {};
                                                            monthExpenses.forEach(t => {
                                                                const cat = t.category
                                                                    ? t.category.charAt(0).toUpperCase() + t.category.slice(1)
                                                                    : 'Other';
                                                                catMap[cat] = (catMap[cat] || 0) + t.amount;
                                                            });
                                                            const mCategoryData = Object.keys(catMap).map(k => ({ name: k, value: catMap[k] }));

                                                            // 2. Spending Trend data
                                                            const trendMap: Record<string, number> = {};
                                                            const sortedExpenses = [...monthExpenses].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
                                                            sortedExpenses.forEach(t => {
                                                                const d = new Date(t.date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
                                                                trendMap[d] = (trendMap[d] || 0) + t.amount;
                                                            });
                                                            const mTrendData = Object.keys(trendMap).map(k => ({ date: k, amount: trendMap[k] }));

                                                            return (
                                                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                                                    {/* Spending by Category Card */}
                                                                    <Card className="flex flex-col border border-slate-200/80 shadow-sm bg-white">
                                                                        <CardHeader className="pb-2">
                                                                            <CardTitle className="text-sm font-bold text-slate-700">Spending by Category ({row.label})</CardTitle>
                                                                        </CardHeader>
                                                                        <CardContent className="flex-1 pb-4">
                                                                            <div className="flex flex-col sm:flex-row items-center gap-4">
                                                                                <div className="w-full sm:w-1/2">
                                                                                    <ResponsiveContainer width="100%" height={160}>
                                                                                        <PieChart>
                                                                                            <Pie
                                                                                                data={mCategoryData}
                                                                                                cx="50%" cy="50%"
                                                                                                innerRadius={45} outerRadius={70}
                                                                                                paddingAngle={4} dataKey="value" stroke="none"
                                                                                            >
                                                                                                {mCategoryData.map((_, index) => (
                                                                                                    <Cell key={index} fill={COLORS[index % COLORS.length]} />
                                                                                                ))}
                                                                                            </Pie>
                                                                                            <RechartsTooltip
                                                                                                formatter={(value: any, name: any) => [`₹${Number(value).toLocaleString('en-IN')}`, name]}
                                                                                                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                                                                            />
                                                                                        </PieChart>
                                                                                    </ResponsiveContainer>
                                                                                </div>
                                                                                
                                                                                {/* Category Legend */}
                                                                                <div className="w-full sm:w-1/2 grid grid-cols-1 gap-1.5 pt-1 max-h-[160px] overflow-y-auto pr-1">
                                                                                    {mCategoryData.map((item, index) => {
                                                                                        const total = mCategoryData.reduce((s, d) => s + d.value, 0);
                                                                                        const pct = total > 0 ? ((item.value / total) * 100).toFixed(1) : '0';
                                                                                        return (
                                                                                            <div key={index} className="flex items-center gap-2 text-xs min-w-0">
                                                                                                <span
                                                                                                    className="w-2 h-2 rounded-full flex-shrink-0"
                                                                                                    style={{ backgroundColor: COLORS[index % COLORS.length] }}
                                                                                                />
                                                                                                <span className="text-slate-700 truncate flex-1 font-medium">{item.name}</span>
                                                                                                <span className="text-slate-400 font-medium flex-shrink-0">{pct}%</span>
                                                                                            </div>
                                                                                        );
                                                                                    })}
                                                                                </div>
                                                                            </div>
                                                                        </CardContent>
                                                                    </Card>

                                                                    {/* Spending Trend Card */}
                                                                    <Card className="flex flex-col border border-slate-200/80 shadow-sm bg-white min-h-[220px]">
                                                                        <CardHeader className="pb-2">
                                                                            <CardTitle className="text-sm font-bold text-slate-700">Spending Trend ({row.label})</CardTitle>
                                                                        </CardHeader>
                                                                        <CardContent className="flex-1 min-h-[160px] pb-4">
                                                                            <ResponsiveContainer width="100%" height="100%">
                                                                                <LineChart data={mTrendData}>
                                                                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                                                                    <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 10 }} dy={6} />
                                                                                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 10 }} tickFormatter={v => `₹${v}`} />
                                                                                    <RechartsTooltip
                                                                                        formatter={(value: any) => [`₹${Number(value).toLocaleString('en-IN')}`, 'Spent']}
                                                                                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                                                                    />
                                                                                    <Line type="monotone" dataKey="amount" stroke="#3b82f6" strokeWidth={2.5}
                                                                                        dot={{ r: 3.5, strokeWidth: 1.5, fill: '#fff' }}
                                                                                        activeDot={{ r: 5, fill: '#3b82f6' }} />
                                                                                </LineChart>
                                                                            </ResponsiveContainer>
                                                                        </CardContent>
                                                                    </Card>
                                                                </div>
                                                            );
                                                        })()}

                                                        {/* Sub-table with transactions */}
                                                        <div className="space-y-2">
                                                            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Transactions for {row.label}</h4>
                                                            <div className="border border-slate-200/80 rounded-xl overflow-hidden bg-white shadow-sm">
                                                                <table className="w-full text-xs">
                                                                    <thead>
                                                                        <tr className="bg-slate-50 border-b border-slate-200">
                                                                            <th className="px-6 py-2.5 text-left text-slate-500 font-semibold uppercase tracking-wider">Date</th>
                                                                            <th className="px-6 py-2.5 text-left text-slate-500 font-semibold uppercase tracking-wider">Category</th>
                                                                            <th className="px-6 py-2.5 text-left text-slate-500 font-semibold uppercase tracking-wider">Type</th>
                                                                            <th className="px-6 py-2.5 text-right text-slate-500 font-semibold uppercase tracking-wider">Amount</th>
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody className="divide-y divide-slate-100">
                                                                        {monthTxs[row.month].map(tx => (
                                                                            <tr key={tx.id} className="hover:bg-slate-50/50 transition-colors">
                                                                                <td className="px-6 py-2.5 text-slate-500">
                                                                                    {format(new Date(tx.date), 'dd MMM')}
                                                                                </td>
                                                                                <td className="px-6 py-2.5 text-slate-700 capitalize font-medium">{tx.category || '—'}</td>
                                                                                <td className="px-6 py-2.5">
                                                                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide ${tx.type === 'EXPENSE' ? 'bg-red-50 text-red-700 border border-red-100' : 'bg-emerald-50 text-emerald-700 border border-emerald-100'}`}>
                                                                                        {tx.type}
                                                                                    </span>
                                                                                </td>
                                                                                <td className={`px-6 py-2.5 text-right font-bold ${tx.type === 'EXPENSE' ? 'text-slate-900' : 'text-emerald-600'}`}>
                                                                                    {tx.type === 'EXPENSE' ? '−' : '+'}₹{tx.amount.toLocaleString('en-IN')}
                                                                                </td>
                                                                            </tr>
                                                                        ))}
                                                                    </tbody>
                                                                </table>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="p-6 text-center text-slate-400 text-sm">Transaction detail coming soon — click a month to see more.</div>
                                                )}
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            ))}
                        </tbody>
                        {data.length > 0 && (
                            <tfoot className="bg-slate-100 border-t-2 border-slate-300">
                                <tr>
                                    <td />
                                    <td className="px-4 py-3 font-bold text-slate-800">Total</td>
                                    <td className="px-4 py-3 text-right font-bold text-emerald-700">+₹{totalIncome.toLocaleString('en-IN')}</td>
                                    <td className="px-4 py-3 text-right font-bold text-red-700">−₹{totalExpenses.toLocaleString('en-IN')}</td>
                                    <td className={`px-4 py-3 text-right font-bold ${totalNet >= 0 ? 'text-blue-700' : 'text-orange-700'}`}>
                                        {totalNet >= 0 ? '+' : ''}₹{totalNet.toLocaleString('en-IN')}
                                    </td>
                                    <td className="px-4 py-3 text-right text-slate-700 font-semibold">
                                        {data.reduce((s, r) => s + r.transaction_count, 0)}
                                    </td>
                                </tr>
                            </tfoot>
                        )}
                    </table>
                </div>
            </Card>
        </div>
    );
}
