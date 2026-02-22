"use client"
import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import api from '@/lib/api';
import { CalendarDaysIcon, ChevronDownIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend
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
                                                    <table className="w-full text-xs border-t border-slate-200">
                                                        <thead>
                                                            <tr className="bg-slate-100">
                                                                <th className="px-6 py-2 text-left text-slate-500 font-medium">Date</th>
                                                                <th className="px-6 py-2 text-left text-slate-500 font-medium">Category</th>
                                                                <th className="px-6 py-2 text-left text-slate-500 font-medium">Type</th>
                                                                <th className="px-6 py-2 text-right text-slate-500 font-medium">Amount</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-slate-200">
                                                            {monthTxs[row.month].map(tx => (
                                                                <tr key={tx.id} className="hover:bg-slate-100/60">
                                                                    <td className="px-6 py-2 text-slate-500">
                                                                        {format(new Date(tx.date), 'dd MMM')}
                                                                    </td>
                                                                    <td className="px-6 py-2 text-slate-700 capitalize font-medium">{tx.category || '—'}</td>
                                                                    <td className="px-6 py-2">
                                                                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${tx.type === 'EXPENSE' ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                                                            {tx.type}
                                                                        </span>
                                                                    </td>
                                                                    <td className={`px-6 py-2 text-right font-semibold ${tx.type === 'EXPENSE' ? 'text-red-600' : 'text-emerald-600'}`}>
                                                                        ₹{tx.amount.toLocaleString('en-IN')}
                                                                    </td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
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
