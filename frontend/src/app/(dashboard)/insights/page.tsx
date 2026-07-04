"use client"
import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import api from '@/lib/api';
import {
    SparklesIcon, ArrowDownTrayIcon, ArrowPathIcon, ArrowTrendingUpIcon,
} from '@heroicons/react/24/solid';
import {
    PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip,
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend,
} from 'recharts';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#f97316', '#14b8a6'];

interface Analysis {
    generated_at: string;
    date_range: { from: string; to: string } | null;
    totals: {
        total_income: number; total_expenses: number; net: number;
        months_count: number; txn_count: number; avg_monthly_expense: number;
        recurring_monthly_estimate: number;
    };
    by_month: { month: string; label: string; income: number; expenses: number; net: number; count: number }[];
    by_category: { category: string; total: number; count: number; pct: number }[];
    recurring: {
        label: string; category: string; description: string; occurrences: number; months_seen: number;
        avg_amount: number; total_amount: number; cadence: string; last_date: string; last_amount: number;
    }[];
    summary: { headline: string; paragraphs: string[]; bullets: string[] };
}

const inr = (v: number) => `₹${Math.round(v).toLocaleString('en-IN')}`;

export default function InsightsPage() {
    const [analysis, setAnalysis] = useState<Analysis | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const [downloading, setDownloading] = useState(false);

    const fetchAnalysis = async () => {
        setLoading(true); setError(false);
        try {
            const res = await api.get('/reports/analysis');
            setAnalysis(res.data);
        } catch (err) {
            console.error('Failed to load analysis', err);
            setError(true);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchAnalysis(); }, []);

    const downloadPdf = async () => {
        setDownloading(true);
        try {
            const res = await api.get('/reports/pdf', { responseType: 'blob' });
            const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
            const a = document.createElement('a');
            a.href = url;
            a.download = `FinAI-Report-${new Date().toISOString().slice(0, 10)}.pdf`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
        } catch (err) {
            console.error('PDF download failed', err);
            alert('Could not generate the PDF. Please try again.');
        } finally {
            setDownloading(false);
        }
    };

    if (loading) return <div className="p-8 text-center text-slate-500 animate-pulse">Analyzing your entire financial history…</div>;

    if (error || !analysis) return (
        <div className="p-8 text-center">
            <p className="text-red-500 mb-4">Couldn't build your report. The backend may be warming up.</p>
            <button onClick={fetchAnalysis} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Retry</button>
        </div>
    );

    const t = analysis.totals;
    const hasData = t.txn_count > 0;

    // Financial health score (0-100), mostly driven by savings rate.
    const savingsRate = t.total_income > 0 ? t.net / t.total_income : 0;
    const healthScore = Math.min(100, Math.max(0, Math.round(40 + savingsRate * 200)));
    const scoreLabel = healthScore > 70 ? 'Strong' : healthScore > 40 ? 'Stable' : 'Needs work';
    const scoreColor = healthScore > 70 ? '#10b981' : healthScore > 40 ? '#f59e0b' : '#ef4444';

    const categoryData = analysis.by_category.slice(0, 8).map(c => ({
        name: c.category.charAt(0).toUpperCase() + c.category.slice(1), value: c.total,
    }));
    const monthData = analysis.by_month.slice(-12);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
                        <SparklesIcon className="h-6 w-6 text-brand" />
                        Reports &amp; Insights
                    </h2>
                    <p className="text-sm text-slate-500 mt-1">
                        AI analysis across {t.months_count} month{t.months_count === 1 ? '' : 's'}
                        {analysis.date_range && ` · ${analysis.date_range.from} → ${analysis.date_range.to}`}
                    </p>
                </div>
                <div className="flex gap-2">
                    <button onClick={fetchAnalysis}
                        className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
                        <ArrowPathIcon className="h-4 w-4" /> Refresh
                    </button>
                    <button onClick={downloadPdf} disabled={downloading || !hasData}
                        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-brand rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors">
                        <ArrowDownTrayIcon className="h-4 w-4" />
                        {downloading ? 'Generating…' : 'Download PDF'}
                    </button>
                </div>
            </div>

            {!hasData ? (
                <Card><CardContent className="py-16 text-center text-slate-400">
                    No transactions yet. Start logging expenses and your report will appear here.
                </CardContent></Card>
            ) : (
                <>
                    {/* Health score + AI summary */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <Card className="md:col-span-1 flex flex-col items-center justify-center p-8 text-center bg-gradient-to-b from-white to-slate-50">
                            <CardTitle className="text-slate-500 mb-6">Financial Health</CardTitle>
                            <div className="relative w-44 h-44 flex items-center justify-center">
                                <svg className="absolute inset-0 w-full h-full transform -rotate-90">
                                    <circle cx="88" cy="88" r="76" stroke="#f1f5f9" strokeWidth="12" fill="none" />
                                    <circle cx="88" cy="88" r="76" stroke={scoreColor} strokeWidth="12" fill="none"
                                        strokeDasharray="477" strokeDashoffset={477 - (477 * healthScore) / 100}
                                        className="transition-all duration-1000 ease-out" strokeLinecap="round" />
                                </svg>
                                <div className="flex flex-col items-center">
                                    <span className="text-5xl font-black text-slate-800">{healthScore}</span>
                                    <span className="text-sm font-medium text-slate-500 uppercase tracking-wider mt-1">{scoreLabel}</span>
                                </div>
                            </div>
                            <p className="mt-6 text-xs text-slate-500">
                                Savings rate {(savingsRate * 100).toFixed(0)}% · Net {inr(t.net)}
                            </p>
                        </Card>

                        <Card className="md:col-span-2">
                            <CardHeader><CardTitle className="flex items-center gap-2"><SparklesIcon className="h-5 w-5 text-brand" /> AI Summary</CardTitle></CardHeader>
                            <CardContent className="space-y-3">
                                {analysis.summary?.headline && (
                                    <p className="text-lg font-bold text-slate-900 leading-snug">{analysis.summary.headline}</p>
                                )}
                                {analysis.summary?.paragraphs?.map((p, i) => (
                                    <p key={i} className="text-sm text-slate-600 leading-relaxed">{p}</p>
                                ))}
                                {analysis.summary?.bullets?.length > 0 && (
                                    <ul className="space-y-2 pt-1">
                                        {analysis.summary.bullets.map((b, i) => (
                                            <li key={i} className="flex gap-2 text-sm text-slate-700">
                                                <span className="text-brand mt-0.5">▹</span><span>{b}</span>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </CardContent>
                        </Card>
                    </div>

                    {/* KPI strip */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        {[
                            { label: 'Total Income', value: inr(t.total_income), color: 'text-emerald-600' },
                            { label: 'Total Spent', value: inr(t.total_expenses), color: 'text-red-600' },
                            { label: 'Net Savings', value: `${t.net >= 0 ? '+' : ''}${inr(t.net)}`, color: t.net >= 0 ? 'text-blue-600' : 'text-orange-600' },
                            { label: 'Avg / Month', value: inr(t.avg_monthly_expense), color: 'text-slate-900' },
                        ].map(k => (
                            <Card key={k.label}>
                                <CardContent className="pt-5">
                                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{k.label}</p>
                                    <p className={`text-2xl font-bold mt-1 ${k.color}`}>{k.value}</p>
                                </CardContent>
                            </Card>
                        ))}
                    </div>

                    {/* Charts */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <Card className="flex flex-col">
                            <CardHeader><CardTitle>Spending by Category (all-time)</CardTitle></CardHeader>
                            <CardContent className="flex-1">
                                <ResponsiveContainer width="100%" height={230}>
                                    <PieChart>
                                        <Pie data={categoryData} cx="50%" cy="50%" innerRadius={55} outerRadius={85}
                                            paddingAngle={4} dataKey="value" stroke="none">
                                            {categoryData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                                        </Pie>
                                        <RechartsTooltip formatter={(v: any, n: any) => [inr(Number(v)), n]}
                                            contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                                    </PieChart>
                                </ResponsiveContainer>
                                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 pt-2">
                                    {categoryData.map((item, i) => (
                                        <div key={i} className="flex items-center gap-2 text-sm min-w-0">
                                            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                                            <span className="text-slate-700 truncate flex-1">{item.name}</span>
                                            <span className="text-slate-400 font-medium">{inr(item.value)}</span>
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="flex flex-col">
                            <CardHeader><CardTitle>Income vs Expenses</CardTitle></CardHeader>
                            <CardContent className="flex-1 min-h-[300px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={monthData} barCategoryGap="30%">
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                        <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }} dy={6}
                                            tickFormatter={(v: string) => v.split(' ')[0]} />
                                        <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }}
                                            tickFormatter={v => `₹${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`} />
                                        <RechartsTooltip formatter={(v: any, n: any) => [inr(Number(v)), n]}
                                            contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                                        <Legend iconType="circle" iconSize={8} formatter={(v) => <span className="text-xs text-slate-600 capitalize">{v}</span>} />
                                        <Bar dataKey="income" name="income" fill="#10b981" radius={[4, 4, 0, 0]} />
                                        <Bar dataKey="expenses" name="expenses" fill="#ef4444" radius={[4, 4, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Recurring transactions */}
                    <Card className="overflow-hidden">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-base">
                                <ArrowTrendingUpIcon className="h-5 w-5 text-brand" />
                                Recurring &amp; Repeated Spending
                            </CardTitle>
                            <p className="text-xs text-slate-500 mt-1">
                                Items that appear across two or more months — subscriptions, rent, EMIs, and regular buys.
                                {t.recurring_monthly_estimate > 0 && <> Estimated fixed monthly commitment: <strong className="text-slate-700">{inr(t.recurring_monthly_estimate)}</strong>.</>}
                            </p>
                        </CardHeader>
                        <div className="overflow-x-auto">
                            {analysis.recurring.length === 0 ? (
                                <p className="px-6 py-8 text-center text-slate-400 text-sm">No recurring patterns detected yet — they show up once an item repeats across months.</p>
                            ) : (
                                <table className="w-full text-sm">
                                    <thead className="bg-slate-50 border-y border-slate-200">
                                        <tr>
                                            <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Item</th>
                                            <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Category</th>
                                            <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Cadence</th>
                                            <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">Times</th>
                                            <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">Avg</th>
                                            <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">Total</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {analysis.recurring.map((r, i) => (
                                            <tr key={i} className="border-b border-slate-100 hover:bg-slate-50/60 transition-colors">
                                                <td className="px-4 py-3 font-medium text-slate-800 capitalize">{r.label}</td>
                                                <td className="px-4 py-3 text-slate-600 capitalize">{r.category}</td>
                                                <td className="px-4 py-3">
                                                    <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-100">{r.cadence}</span>
                                                </td>
                                                <td className="px-4 py-3 text-right text-slate-500">{r.occurrences}× · {r.months_seen}mo</td>
                                                <td className="px-4 py-3 text-right text-slate-700">{inr(r.avg_amount)}</td>
                                                <td className="px-4 py-3 text-right font-bold text-slate-900">{inr(r.total_amount)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </Card>
                </>
            )}
        </div>
    );
}
