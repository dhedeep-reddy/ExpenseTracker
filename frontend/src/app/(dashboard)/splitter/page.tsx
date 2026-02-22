"use client"
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import api from '@/lib/api';
import { UserGroupIcon, ArrowRightIcon, SparklesIcon, XMarkIcon, CheckCircleIcon } from '@heroicons/react/24/outline';

interface ExpenseItem {
    description: string;
    amount: number;
    paid_by: string;
    split_among: string[];
    split_amounts: Record<string, number>;
}

interface MemberBalance {
    name: string;
    total_paid: number;
    fair_share: number;
    net_balance: number;
}

interface Settlement {
    from_member: string;
    to_member: string;
    amount: number;
}

interface SplitResult {
    members: string[];
    expenses: ExpenseItem[];
    member_balances: MemberBalance[];
    settlements: Settlement[];
    summary: string;
}

const MEMBER_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#f97316', '#14b8a6'];

const EXAMPLE_PROMPTS = [
    "Me, Alice and Bob went on a Goa trip. I paid ₹3000 for hotel, Alice paid ₹1500 for dinner, Bob paid ₹900 for taxi and ₹600 for snacks. Split everything equally.",
    "Our team lunch — Raj paid ₹2400 for food, Priya paid ₹600 for drinks, Sam didn't pay anything. Split equally among all 3.",
    "5-day trek: Ananya paid ₹8000 for accommodation, Vikram paid ₹3500 for meals, Rohan paid ₹2000 for gear rental. Split 50-30-20 respectively.",
];

export default function SplitterPage() {
    const [description, setDescription] = useState('');
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<SplitResult | null>(null);
    const [error, setError] = useState('');
    const [myMember, setMyMember] = useState<MemberBalance | null>(null);
    const [loggedMyShare, setLoggedMyShare] = useState(false);
    const [loggingShare, setLoggingShare] = useState(false);

    // Detect if the user referred to themselves (I/me/myself)
    const detectOwner = (desc: string, balances: MemberBalance[]): MemberBalance | null => {
        const lower = desc.toLowerCase();
        const selfKeywords = ['\\bi paid\\b', '\\bi\\b', '\\bme\\b', '\\bmyself\\b', '\\bmy\\b'];
        const hasSelf = selfKeywords.some(k => new RegExp(k).test(lower));
        if (!hasSelf) return null;
        // Look for member named "Me", "I", "Myself", or the first person (index 0 by convention)
        const meNames = ['me', 'i', 'myself', 'owner', 'self'];
        const match = balances.find(m => meNames.includes(m.name.toLowerCase()));
        return match || balances[0] || null; // fallback to first member
    };

    const handleAnalyze = async () => {
        if (!description.trim()) return;
        setLoading(true);
        setError('');
        setResult(null);
        setMyMember(null);
        setLoggedMyShare(false);
        try {
            const res = await api.post('/splitter/analyze', { description });
            const data: SplitResult = res.data;
            setResult(data);
            // Detect owner in description
            const owner = detectOwner(description, data.member_balances);
            setMyMember(owner);
        } catch (e: any) {
            setError(e.response?.data?.detail || 'Something went wrong. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleLogMyShare = async () => {
        if (!myMember) return;
        setLoggingShare(true);
        try {
            // Log the owner's fair_share as an expense. 
            // If they paid more than their share, also log what others owe them as income.
            const totalPaid = myMember.total_paid;
            const fairShare = myMember.fair_share;
            // Log what they personally spent (fair share portion)
            if (fairShare > 0) {
                await api.post('/transactions/', {
                    type: 'EXPENSE',
                    amount: Math.round(fairShare * 100) / 100,
                    category: 'entertainment',
                    description: `Trip split share — ${result?.expenses.map(e => e.description).join(', ') || 'Group trip'}`,
                    source: 'MAIN_BALANCE',
                    date: new Date().toISOString(),
                });
            }
            // If they paid on behalf of others, log the extra as income (to be received)
            const toReceive = myMember.net_balance > 0 ? myMember.net_balance : 0;
            if (toReceive > 0) {
                await api.post('/transactions/', {
                    type: 'INCOME',
                    amount: Math.round(toReceive * 100) / 100,
                    description: `Trip split: amount to receive from others (${result?.members.filter(m => m.toLowerCase() !== myMember.name.toLowerCase()).join(', ')})`,
                    source: 'MAIN_BALANCE',
                    date: new Date().toISOString(),
                });
            }
            setLoggedMyShare(true);
        } catch (e: any) {
            setError('Failed to log transaction: ' + (e.response?.data?.detail || e.message));
        } finally {
            setLoggingShare(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleAnalyze();
    };

    const handleClear = () => {
        setResult(null);
        setDescription('');
        setError('');
        setMyMember(null);
        setLoggedMyShare(false);
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h2 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
                    <UserGroupIcon className="h-7 w-7 text-brand" />
                    Trip Money Splitter
                </h2>
                <p className="text-sm text-slate-500 mt-1">
                    Describe your group expense in plain English — AI will compute who owes whom.
                </p>
            </div>

            {/* Input Card */}
            <Card className={`border-brand/20 ${result ? 'bg-slate-50' : 'bg-gradient-to-br from-brand/5 to-transparent'}`}>
                <CardContent className="pt-6">
                    <div className="space-y-3">
                        <div className="flex items-center gap-2 text-xs text-slate-500 font-medium uppercase tracking-wide">
                            <SparklesIcon className="h-4 w-4 text-brand" />
                            Describe your trip or group expense
                        </div>
                        <textarea
                            value={description}
                            onChange={e => setDescription(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="e.g. Me, Alice and Bob went on a trip. I paid ₹3000 for hotel, Alice paid ₹1500 for food, Bob paid ₹900 for taxi. Split equally."
                            rows={4}
                            className="w-full border border-slate-200 bg-white rounded-xl px-4 py-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand/30 resize-none shadow-sm placeholder:text-slate-400"
                        />

                        {/* Example prompts */}
                        {!result && (
                            <div className="space-y-1.5">
                                <p className="text-xs text-slate-400 font-medium">Try an example:</p>
                                <div className="flex flex-wrap gap-2">
                                    {EXAMPLE_PROMPTS.map((p, i) => (
                                        <button
                                            key={i}
                                            onClick={() => setDescription(p)}
                                            className="text-xs bg-white border border-slate-200 hover:border-brand/40 hover:bg-brand/5 text-slate-600 px-3 py-1.5 rounded-lg transition-colors text-left">
                                            {p.substring(0, 50)}…
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="flex gap-2 justify-end">
                            {result && (
                                <button onClick={handleClear}
                                    className="flex items-center gap-1.5 px-4 py-2 text-sm border border-slate-300 text-slate-600 rounded-xl hover:bg-slate-100 transition-colors">
                                    <XMarkIcon className="h-4 w-4" /> Reset
                                </button>
                            )}
                            <button
                                onClick={handleAnalyze}
                                disabled={loading || !description.trim()}
                                className="flex items-center gap-2 bg-brand text-white px-5 py-2 rounded-xl text-sm font-semibold shadow-md shadow-brand/20 hover:bg-brand-dark transition-colors disabled:opacity-50">
                                {loading ? (
                                    <>
                                        <div className="h-4 w-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                                        Analyzing…
                                    </>
                                ) : (
                                    <>
                                        <SparklesIcon className="h-4 w-4" />
                                        Split It
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Error */}
            {error && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
                    {error}
                </div>
            )}

            {/* Loading Skeleton */}
            {loading && (
                <div className="space-y-4 animate-pulse">
                    <div className="h-32 bg-slate-200 rounded-xl" />
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {[1, 2, 3, 4].map(i => <div key={i} className="h-24 bg-slate-200 rounded-xl" />)}
                    </div>
                    <div className="h-40 bg-slate-200 rounded-xl" />
                </div>
            )}

            {/* Results */}
            {result && !loading && (
                <div className="space-y-5">
                    {/* Summary Banner */}
                    <div className="bg-gradient-to-r from-brand to-blue-600 text-white rounded-2xl p-5 shadow-lg">
                        <div className="flex items-center gap-2 mb-1 text-white/80 text-sm font-medium">
                            <SparklesIcon className="h-4 w-4" /> AI Summary
                        </div>
                        <p className="text-base font-medium leading-snug">{result.summary}</p>
                    </div>

                    {/* Member Balances Grid */}
                    <div>
                        <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-3">Member Balances</h3>
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                            {result.member_balances.map((m, i) => (
                                <div key={m.name}
                                    className={`rounded-xl p-4 border ${m.net_balance > 0 ? 'bg-emerald-50 border-emerald-200' : m.net_balance < 0 ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-200'}`}>
                                    <div className="flex items-center gap-2 mb-2">
                                        <div className="h-7 w-7 rounded-full flex items-center justify-center text-white text-xs font-bold"
                                            style={{ backgroundColor: MEMBER_COLORS[i % MEMBER_COLORS.length] }}>
                                            {m.name.charAt(0).toUpperCase()}
                                        </div>
                                        <span className="font-semibold text-slate-800 text-sm">{m.name}</span>
                                    </div>
                                    <div className="space-y-1 text-xs">
                                        <div className="flex justify-between text-slate-500">
                                            <span>Paid</span>
                                            <span className="font-medium text-slate-700">₹{m.total_paid.toLocaleString('en-IN')}</span>
                                        </div>
                                        <div className="flex justify-between text-slate-500">
                                            <span>Fair Share</span>
                                            <span className="font-medium text-slate-700">₹{m.fair_share.toLocaleString('en-IN')}</span>
                                        </div>
                                        <div className={`flex justify-between font-bold text-sm pt-1 border-t border-slate-200 mt-1 ${m.net_balance > 0 ? 'text-emerald-700' : m.net_balance < 0 ? 'text-red-600' : 'text-slate-500'}`}>
                                            <span>{m.net_balance > 0 ? 'Gets back' : m.net_balance < 0 ? 'Owes' : 'Settled'}</span>
                                            <span>₹{Math.abs(m.net_balance).toLocaleString('en-IN')}</span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Settlements */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">💸 Who Pays Whom</CardTitle>
                        </CardHeader>
                        <CardContent>
                            {result.settlements.length === 0 ? (
                                <p className="text-sm text-slate-400 text-center py-4">Everyone is already settled up! 🎉</p>
                            ) : (
                                <div className="space-y-3">
                                    {result.settlements.map((s, i) => (
                                        <div key={i} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
                                            <div className="h-8 w-8 rounded-full bg-red-100 flex items-center justify-center text-xs font-bold text-red-700">
                                                {s.from_member.charAt(0)}
                                            </div>
                                            <div className="font-semibold text-slate-800 text-sm">{s.from_member}</div>
                                            <ArrowRightIcon className="h-4 w-4 text-slate-400 flex-shrink-0" />
                                            <div className="flex-1">
                                                <span className="font-bold text-base text-brand">₹{s.amount.toLocaleString('en-IN')}</span>
                                            </div>
                                            <ArrowRightIcon className="h-4 w-4 text-slate-400 flex-shrink-0" />
                                            <div className="font-semibold text-slate-800 text-sm">{s.to_member}</div>
                                            <div className="h-8 w-8 rounded-full bg-emerald-100 flex items-center justify-center text-xs font-bold text-emerald-700">
                                                {s.to_member.charAt(0)}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Expense Breakdown Table */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">📋 Expense Breakdown</CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="bg-slate-50 border-b border-slate-200">
                                        <tr>
                                            <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Item</th>
                                            <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">Amount</th>
                                            <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Paid by</th>
                                            <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Split among</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {result.expenses.map((e, i) => (
                                            <tr key={i} className="hover:bg-slate-50/50">
                                                <td className="px-4 py-3 font-medium text-slate-800">{e.description}</td>
                                                <td className="px-4 py-3 text-right font-semibold text-slate-900">₹{e.amount.toLocaleString('en-IN')}</td>
                                                <td className="px-4 py-3">
                                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-brand/10 text-brand">{e.paid_by}</span>
                                                </td>
                                                <td className="px-4 py-3 text-slate-500 text-xs">
                                                    {e.split_amounts && Object.keys(e.split_amounts).length > 0
                                                        ? Object.entries(e.split_amounts).map(([name, amt]) => `${name}: ₹${amt}`).join(', ')
                                                        : e.split_among.length === 0 ? 'All equally' : e.split_among.join(', ')}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    <tfoot className="bg-slate-50 border-t-2 border-slate-300">
                                        <tr>
                                            <td className="px-4 py-3 font-bold text-slate-800">Total</td>
                                            <td className="px-4 py-3 text-right font-bold text-slate-900">
                                                ₹{result.expenses.reduce((s, e) => s + e.amount, 0).toLocaleString('en-IN')}
                                            </td>
                                            <td colSpan={2} />
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        </CardContent>
                    </Card>

                    {/* ── Log My Share Banner ──────────────────────── */}
                    {myMember && (
                        <Card className={`border-2 ${loggedMyShare ? 'border-emerald-300 bg-emerald-50' : 'border-brand/40 bg-brand/5'}`}>
                            <CardContent className="pt-5">
                                {loggedMyShare ? (
                                    <div className="flex items-center gap-3 text-emerald-700">
                                        <CheckCircleIcon className="h-6 w-6 flex-shrink-0" />
                                        <div>
                                            <p className="font-semibold">Logged to your expenses! ✅</p>
                                            <p className="text-sm text-emerald-600 mt-0.5">
                                                ₹{myMember.fair_share.toLocaleString('en-IN')} added as expense
                                                {myMember.net_balance > 0 && ` · ₹${myMember.net_balance.toLocaleString('en-IN')} logged as income (to receive)`}
                                            </p>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                                        <div className="flex-1">
                                            <p className="font-semibold text-slate-900 text-sm flex items-center gap-1.5">
                                                💡 Log your share as an expense?
                                            </p>
                                            <p className="text-xs text-slate-500 mt-1">
                                                Detected you ({myMember.name}) in this trip. Your fair share is
                                                {' '}<span className="font-bold text-slate-800">₹{myMember.fair_share.toLocaleString('en-IN')}</span>.
                                                {myMember.net_balance > 0 && ` You're owed ₹${myMember.net_balance.toLocaleString('en-IN')} back.`}
                                                {myMember.net_balance < 0 && ` You owe ₹${Math.abs(myMember.net_balance).toLocaleString('en-IN')}.`}
                                            </p>
                                        </div>
                                        <button
                                            onClick={handleLogMyShare}
                                            disabled={loggingShare}
                                            className="flex items-center gap-2 bg-brand text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-60 flex-shrink-0"
                                        >
                                            {loggingShare ? (
                                                <><div className="h-4 w-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Logging…</>
                                            ) : (
                                                <><CheckCircleIcon className="h-4 w-4" /> Log My Share</>
                                            )}
                                        </button>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    )}
                </div>
            )}
        </div>
    );
}
