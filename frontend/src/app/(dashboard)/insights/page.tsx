"use client"
import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, Button } from '@/components/ui';
import api from '@/lib/api';
import { SparklesIcon, ExclamationTriangleIcon, CheckBadgeIcon } from '@heroicons/react/24/solid';

export default function InsightsPage() {
    const [metrics, setMetrics] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    // Default Mocked Insights for now
    const [insights, setInsights] = useState([
        { id: 1, text: "You spent 18% more on Food this cycle compared to your average.", type: 'warning' },
        { id: 2, text: "Your balance will last 14 days at the current burn rate.", type: 'neutral' },
        { id: 3, text: "Savings improved by ₹2,000 compared to last cycle!", type: 'success' }
    ]);

    useEffect(() => {
        const fetchDashboard = async () => {
            try {
                const res = await api.get('/analytics/dashboard');
                setMetrics(res.data);
            } catch (err) {
                console.error("Failed to load metrics", err);
            } finally {
                setLoading(false);
            }
        };

        fetchDashboard();
    }, []);

    if (loading) return <div className="p-8">Analyzing financial vectors...</div>;

    // Simple Score Calculation (0-100)
    let healthScore = 50;
    if (metrics) {
        const burnRatio = metrics.daily_average_spending / (metrics.available_balance + 1);
        if (burnRatio < 0.05) healthScore += 30; // very safe
        else if (burnRatio < 0.1) healthScore += 10;
        else healthScore -= 20;

        if (metrics.net_flow > 0) healthScore += 20;
    }

    // Bound score
    healthScore = Math.min(100, Math.max(0, healthScore));

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
                        <SparklesIcon className="h-6 w-6 text-brand" />
                        AI Intelligence Layer
                    </h2>
                    <p className="text-sm text-slate-500 mt-1">Smart analytics and personalized financial health.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Health Score Gauge */}
                <Card className="md:col-span-1 flex flex-col items-center justify-center p-8 text-center bg-gradient-to-b from-white to-slate-50">
                    <CardTitle className="text-slate-500 mb-6">Financial Health</CardTitle>

                    <div className="relative w-48 h-48 flex items-center justify-center">
                        <svg className="absolute inset-0 w-full h-full transform -rotate-90">
                            <circle cx="96" cy="96" r="80" stroke="#f1f5f9" strokeWidth="12" fill="none" />
                            <circle
                                cx="96" cy="96" r="80"
                                stroke={healthScore > 70 ? '#10b981' : healthScore > 40 ? '#f59e0b' : '#ef4444'}
                                strokeWidth="12"
                                fill="none"
                                strokeDasharray="502"
                                strokeDashoffset={502 - (502 * healthScore) / 100}
                                className="transition-all duration-1000 ease-out"
                                strokeLinecap="round"
                            />
                        </svg>
                        <div className="flex flex-col items-center">
                            <span className="text-5xl font-black text-slate-800">{healthScore}</span>
                            <span className="text-sm font-medium text-slate-500 uppercase tracking-wider mt-1">
                                {healthScore > 70 ? 'Strong' : healthScore > 40 ? 'Stable' : 'Poor'}
                            </span>
                        </div>
                    </div>

                    <p className="mt-8 text-sm text-slate-600">
                        Score based on burn rate, net cash flow, and historical spending patterns.
                    </p>
                </Card>

                {/* Smart Insights List */}
                <Card className="md:col-span-2">
                    <CardHeader>
                        <CardTitle>Actionable Insights</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {insights.map(insight => (
                            <div key={insight.id} className={`p-4 rounded-xl border flex gap-4 ${insight.type === 'warning' ? 'bg-orange-50 border-orange-100 text-orange-900' :
                                    insight.type === 'success' ? 'bg-emerald-50 border-emerald-100 text-emerald-900' :
                                        'bg-slate-50 border-slate-200 text-slate-800'
                                }`}>
                                <div className="mt-0.5">
                                    {insight.type === 'warning' ? <ExclamationTriangleIcon className="h-5 w-5 text-orange-500" /> :
                                        insight.type === 'success' ? <CheckBadgeIcon className="h-5 w-5 text-emerald-500" /> :
                                            <SparklesIcon className="h-5 w-5 text-brand" />}
                                </div>
                                <div>
                                    <p className="font-medium text-sm md:text-base">{insight.text}</p>
                                </div>
                            </div>
                        ))}

                        <div className="pt-4 flex justify-center">
                            <Button variant="secondary" className="gap-2">
                                <SparklesIcon className="h-4 w-4 text-brand" /> Regenerate Insights
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
