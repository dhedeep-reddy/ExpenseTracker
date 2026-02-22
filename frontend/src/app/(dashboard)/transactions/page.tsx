"use client"
import React, { useEffect, useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui';
import api from '@/lib/api';
import { format } from 'date-fns';
import { PlusIcon, TrashIcon, CalendarDaysIcon } from '@heroicons/react/24/outline';
import { QuickAddModal } from '@/components/ui/QuickAddModal';

interface Transaction {
    id: number;
    type: string;
    category: string | null;
    amount: number;
    date: string;
    source: string;
    description: string | null;
    cycle_id: number;
}

export default function TransactionsPage() {
    const [allTransactions, setAllTransactions] = useState<Transaction[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedMonth, setSelectedMonth] = useState<string>(''); // 'YYYY-MM'
    const [isModalOpen, setIsModalOpen] = useState(false);

    const fetchTransactions = async () => {
        try {
            const res = await api.get('/transactions/all');
            const txs: Transaction[] = res.data;
            // Sort newest first
            txs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
            setAllTransactions(txs);
            // Default: select current month
            const now = new Date();
            const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
            setSelectedMonth(thisMonth);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchTransactions();
    }, []);

    // Available months (from transaction data) — sorted newest first
    const availableMonths = useMemo(() => {
        const monthSet = new Set<string>();
        allTransactions.forEach(tx => {
            const d = new Date(tx.date);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            monthSet.add(key);
        });
        // Always include current month
        const now = new Date();
        monthSet.add(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
        return Array.from(monthSet).sort((a, b) => b.localeCompare(a));
    }, [allTransactions]);

    // Filter transactions by selected month
    const filtered = useMemo(() => {
        if (!selectedMonth) return allTransactions;
        return allTransactions.filter(tx => {
            const d = new Date(tx.date);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            return key === selectedMonth;
        });
    }, [allTransactions, selectedMonth]);

    // Monthly summary
    const summary = useMemo(() => {
        const income = filtered.filter(t => t.type === 'INCOME' || t.type === 'SALARY').reduce((s, t) => s + t.amount, 0);
        const expenses = filtered.filter(t => t.type === 'EXPENSE').reduce((s, t) => s + t.amount, 0);
        return { income, expenses, net: income - expenses };
    }, [filtered]);

    const handleDelete = async (id: number) => {
        if (!confirm("Delete this transaction?")) return;
        try {
            await api.delete(`/transactions/${id}`);
            fetchTransactions();
        } catch {
            alert("Failed to delete");
        }
    };

    const formatMonthLabel = (key: string) => {
        const [year, month] = key.split('-');
        const d = new Date(parseInt(year), parseInt(month) - 1, 1);
        return format(d, 'MMM yyyy');
    };

    if (loading) return (
        <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 border-4 border-blue-400 border-t-transparent rounded-full animate-spin" />
        </div>
    );

    return (
        <div className="space-y-5">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight text-slate-900">Transactions</h2>
                    <p className="text-sm text-slate-500 mt-0.5">Your complete financial history, organized by month.</p>
                </div>
                <button
                    onClick={() => setIsModalOpen(true)}
                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold px-4 py-2.5 rounded-xl shadow-md shadow-blue-200 transition-colors"
                >
                    <PlusIcon className="h-5 w-5" />
                    Add Transaction
                </button>
            </div>

            {/* Month Selector */}
            <div className="flex items-center gap-2 flex-wrap">
                <CalendarDaysIcon className="h-4 w-4 text-slate-400 flex-shrink-0" />
                <span className="text-xs text-slate-500 font-medium uppercase tracking-wide mr-1">Month:</span>
                {availableMonths.map(m => (
                    <button
                        key={m}
                        onClick={() => setSelectedMonth(m)}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${selectedMonth === m
                            ? 'bg-blue-600 text-white shadow-sm'
                            : 'bg-white border border-slate-200 text-slate-600 hover:border-blue-300 hover:text-blue-700'
                            }`}
                    >
                        {formatMonthLabel(m)}
                    </button>
                ))}
            </div>

            {/* Monthly Summary Cards */}
            {selectedMonth && (
                <div className="grid grid-cols-3 gap-3">
                    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                        <p className="text-xs text-emerald-600 font-medium uppercase tracking-wide">Income</p>
                        <p className="text-xl font-bold text-emerald-700 mt-1">₹{summary.income.toLocaleString('en-IN')}</p>
                    </div>
                    <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                        <p className="text-xs text-red-600 font-medium uppercase tracking-wide">Expenses</p>
                        <p className="text-xl font-bold text-red-700 mt-1">₹{summary.expenses.toLocaleString('en-IN')}</p>
                    </div>
                    <div className={`rounded-xl p-4 border ${summary.net >= 0 ? 'bg-blue-50 border-blue-200' : 'bg-orange-50 border-orange-200'}`}>
                        <p className={`text-xs font-medium uppercase tracking-wide ${summary.net >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>Net</p>
                        <p className={`text-xl font-bold mt-1 ${summary.net >= 0 ? 'text-blue-700' : 'text-orange-700'}`}>
                            {summary.net >= 0 ? '+' : ''}₹{summary.net.toLocaleString('en-IN')}
                        </p>
                    </div>
                </div>
            )}

            {/* Table */}
            <Card className="overflow-hidden p-0 border-0 shadow-sm ring-1 ring-slate-200">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 text-slate-500 uppercase text-xs border-b border-slate-200">
                            <tr>
                                <th className="px-6 py-4 font-medium">Date</th>
                                <th className="px-6 py-4 font-medium">Type</th>
                                <th className="px-6 py-4 font-medium">Category</th>
                                <th className="px-6 py-4 font-medium">Description</th>
                                <th className="px-6 py-4 font-medium text-right">Amount</th>
                                <th className="px-6 py-4 font-medium text-center">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {filtered.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="px-6 py-12 text-center text-slate-400">
                                        No transactions for {formatMonthLabel(selectedMonth)}.{' '}
                                        <button onClick={() => setIsModalOpen(true)} className="text-blue-600 hover:underline">Add one →</button>
                                    </td>
                                </tr>
                            )}
                            {filtered.map((t) => (
                                <tr key={t.id} className="hover:bg-slate-50/60 transition-colors">
                                    <td className="px-6 py-4 text-slate-500 whitespace-nowrap">
                                        {format(new Date(t.date), 'dd MMM, HH:mm')}
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold ${t.type === 'INCOME' || t.type === 'SALARY'
                                                ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                                                : t.type === 'EXPENSE'
                                                    ? 'bg-red-50 text-red-700 ring-1 ring-red-200'
                                                    : 'bg-slate-100 text-slate-700 ring-1 ring-slate-200'
                                            }`}>
                                            {t.type}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-slate-800 capitalize font-medium">
                                        {t.category || '—'}
                                    </td>
                                    <td className="px-6 py-4 text-slate-500 max-w-[200px] truncate">
                                        {t.description || '—'}
                                    </td>
                                    <td className={`px-6 py-4 text-right font-semibold whitespace-nowrap ${t.type === 'INCOME' || t.type === 'SALARY' ? 'text-emerald-600' : 'text-slate-900'
                                        }`}>
                                        {t.type === 'INCOME' || t.type === 'SALARY' ? '+' : ''}₹{t.amount.toLocaleString('en-IN')}
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        <button
                                            onClick={() => handleDelete(t.id)}
                                            className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                                            title="Delete"
                                        >
                                            <TrashIcon className="h-4 w-4" />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                        {filtered.length > 0 && (
                            <tfoot className="bg-slate-50 border-t-2 border-slate-200">
                                <tr>
                                    <td colSpan={4} className="px-6 py-3 text-xs font-semibold text-slate-500 uppercase">{filtered.length} transactions</td>
                                    <td className="px-6 py-3 text-right font-bold text-slate-900">
                                        Net: {summary.net >= 0 ? '+' : ''}₹{summary.net.toLocaleString('en-IN')}
                                    </td>
                                    <td />
                                </tr>
                            </tfoot>
                        )}
                    </table>
                </div>
            </Card>

            {/* Inline Quick Add Modal */}
            <QuickAddModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSuccess={() => {
                    setIsModalOpen(false);
                    fetchTransactions();
                }}
            />
        </div>
    );
}
