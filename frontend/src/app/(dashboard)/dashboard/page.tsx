"use client"
import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import api from '@/lib/api';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, LineChart, Line, XAxis, YAxis, CartesianGrid } from 'recharts';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#f97316'];

export default function DashboardPage() {
    const { isAuthenticated } = useAuth();
    const router = useRouter();

    const [metrics, setMetrics] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    // Default empty chart data for now until we build the chart endpoint
    const [categoryData, setCategoryData] = useState([{ name: 'No Data', value: 100 }]);
    const [trendData, setTrendData] = useState([]);

    useEffect(() => {
        if (!isAuthenticated) return;

        const fetchDashboard = async () => {
            try {
                const res = await api.get('/analytics/dashboard');
                setMetrics(res.data);

                // Fetch transactions for basic chart processing
                const txRes = await api.get('/transactions');
                const txs = txRes.data;

                if (txs.length > 0) {
                    const expenses = txs.filter((t: any) => t.type === 'EXPENSE');

                    if (expenses.length > 0) {
                        // Rollup for Category Pie Chart
                        const catMap: any = {};
                        expenses.forEach((t: any) => {
                            const cat = t.category || 'Other';
                            catMap[cat] = (catMap[cat] || 0) + t.amount;
                        });
                        setCategoryData(Object.keys(catMap).map(k => ({ name: k, value: catMap[k] })));

                        // Rollup for Trend Line Chart
                        const trendMap: any = {};
                        expenses.reverse().forEach((t: any) => { // Reverse for chronological
                            const d = new Date(t.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                            trendMap[d] = (trendMap[d] || 0) + t.amount;
                        });
                        setTrendData(Object.keys(trendMap).map(k => ({ date: k, amount: trendMap[k] })) as any);
                    }
                }

            } catch (err: any) {
                if (err.response?.status === 401) {
                    router.push('/login');
                }
                console.error("Failed to load dashboard metrics", err);
            } finally {
                setLoading(false);
            }
        };

        fetchDashboard();
    }, [isAuthenticated, router]);

    if (loading) {
        return <div className="p-8 text-center text-slate-500 animate-pulse">Loading dashboard elements...</div>;
    }

    if (!metrics) {
        return <div className="p-8 text-center text-red-500">Failed to load data. Ensure backend is running.</div>;
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold tracking-tight text-slate-900">Financial Overview</h2>
            </div>

            {/* Main Available Balance Hero Card */}
            <div className="bg-gradient-to-br from-slate-900 justify-between items-center to-slate-800 rounded-2xl p-8 text-white shadow-xl relative overflow-hidden">
                <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 rounded-full bg-brand/20 blur-3xl mix-blend-screen"></div>
                <div className="relative z-10 flex flex-col md:flex-row md:items-end md:justify-between gap-6">
                    <div>
                        <p className="text-slate-400 font-medium mb-1 uppercase tracking-wider text-sm">Available Balance</p>
                        <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight">₹{metrics.available_balance.toLocaleString('en-IN')}</h1>
                        <div className="mt-4 inline-flex items-center gap-2 text-sm bg-white/10 px-3 py-1.5 rounded-full border border-white/10 backdrop-blur-md">
                            <span className={`w-2 h-2 rounded-full ${metrics.burn_rate_status === 'STABLE' ? 'bg-emerald-400' : 'bg-red-400'}`}></span>
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

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="hover:border-brand/50 transition-colors">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-slate-500">Net Flow</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className={`text-2xl font-bold ${metrics.net_flow >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                            {metrics.net_flow >= 0 ? '+' : ''}₹{metrics.net_flow.toLocaleString('en-IN')}
                        </div>
                    </CardContent>
                </Card>

                <Card className="hover:border-brand/50 transition-colors">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-slate-500">Daily Average</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-slate-900">
                            ₹{metrics.daily_average_spending.toFixed(0).toLocaleString()}
                        </div>
                    </CardContent>
                </Card>

                <Card className="hover:border-brand/50 transition-colors">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-slate-500">Days Remaining</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-slate-900">
                            {metrics.remaining_days} <span className="text-sm font-normal text-slate-500">days</span>
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-brand/5 border-brand/20">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-brand">Smart Goal</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-sm text-slate-700 leading-snug">
                            Keep daily spend under <strong className="text-slate-900">₹{(metrics.available_balance / Math.max(1, metrics.remaining_days)).toFixed(0).toLocaleString()}</strong> to make balance last.
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Charts Section */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card className="flex flex-col">
                    <CardHeader>
                        <CardTitle>Spending by Category</CardTitle>
                    </CardHeader>
                    <CardContent className="flex-1 min-h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={categoryData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={80}
                                    outerRadius={110}
                                    paddingAngle={5}
                                    dataKey="value"
                                    stroke="none"
                                >
                                    {categoryData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <RechartsTooltip
                                    formatter={(value: any) => [`₹${value.toLocaleString()}`, 'Amount']}
                                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>

                <Card className="flex flex-col">
                    <CardHeader>
                        <CardTitle>Spending Trend</CardTitle>
                    </CardHeader>
                    <CardContent className="flex-1 min-h-[300px]">
                        {trendData.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={trendData}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                    <XAxis
                                        dataKey="date"
                                        axisLine={false}
                                        tickLine={false}
                                        tick={{ fill: '#64748b', fontSize: 12 }}
                                        dy={10}
                                    />
                                    <YAxis
                                        axisLine={false}
                                        tickLine={false}
                                        tick={{ fill: '#64748b', fontSize: 12 }}
                                        tickFormatter={(val) => `₹${val}`}
                                    />
                                    <RechartsTooltip
                                        formatter={(value: any) => [`₹${value.toLocaleString()}`, 'Spent']}
                                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                    />
                                    <Line
                                        type="monotone"
                                        dataKey="amount"
                                        stroke="#3b82f6"
                                        strokeWidth={3}
                                        dot={{ r: 4, strokeWidth: 2, fill: '#fff' }}
                                        activeDot={{ r: 6, fill: '#3b82f6' }}
                                    />
                                </LineChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="h-full flex items-center justify-center text-slate-400">
                                Not enough data for trend line
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
