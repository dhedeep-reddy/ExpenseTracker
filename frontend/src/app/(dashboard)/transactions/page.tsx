"use client"
import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, Button } from '@/components/ui';
import api from '@/lib/api';
import { format } from 'date-fns';
import { PlusIcon, TrashIcon, PencilIcon } from '@heroicons/react/24/outline';

export default function TransactionsPage() {
    const [transactions, setTransactions] = useState([]);
    const [loading, setLoading] = useState(true);

    const fetchTransactions = async () => {
        try {
            const res = await api.get('/transactions');
            setTransactions(res.data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchTransactions();
    }, []);

    const handleDelete = async (id: number) => {
        if (!confirm("Are you sure you want to delete this transaction?")) return;
        try {
            await api.delete(`/transactions/${id}`);
            fetchTransactions();
        } catch (err) {
            alert("Failed to delete");
        }
    };

    if (loading) return <div className="p-8">Loading history...</div>;

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight text-slate-900">Transactions</h2>
                    <p className="text-sm text-slate-500 mt-1">Manage and review your financial history.</p>
                </div>

                {/* We will build the Modal Quick Add next */}
                <Button className="gap-2 shadow-md shadow-brand/20">
                    <PlusIcon className="h-5 w-5" />
                    Add Expense
                </Button>
            </div>

            <Card className="overflow-hidden p-0 border-0 shadow-sm ring-1 ring-slate-200">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 text-slate-500 uppercase text-xs border-b border-slate-200">
                            <tr>
                                <th className="px-6 py-4 font-medium">Date</th>
                                <th className="px-6 py-4 font-medium">Type</th>
                                <th className="px-6 py-4 font-medium">Category</th>
                                <th className="px-6 py-4 font-medium text-right">Amount</th>
                                <th className="px-6 py-4 font-medium text-center">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {transactions.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="px-6 py-8 text-center text-slate-400">
                                        No transactions found in this cycle.
                                    </td>
                                </tr>
                            )}
                            {transactions.map((t: any) => (
                                <tr key={t.id} className="hover:bg-slate-50/50 transition-colors">
                                    <td className="px-6 py-4 text-slate-600">
                                        {format(new Date(t.date), 'MMM d, yyyy HH:mm')}
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium ${t.type === 'INCOME' || t.type === 'SALARY' ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' :
                                                t.type === 'EXPENSE' ? 'bg-red-50 text-red-700 ring-1 ring-red-200' :
                                                    'bg-slate-100 text-slate-700 ring-1 ring-slate-200'
                                            }`}>
                                            {t.type}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-slate-900 capitalize font-medium">
                                        {t.category || '-'}
                                    </td>
                                    <td className={`px-6 py-4 text-right font-semibold ${t.type === 'INCOME' || t.type === 'SALARY' ? 'text-emerald-600' : 'text-slate-900'
                                        }`}>
                                        {t.type === 'INCOME' || t.type === 'SALARY' ? '+' : ''}₹{t.amount.toLocaleString('en-IN')}
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        <div className="flex items-center justify-center gap-2">
                                            <button className="p-1.5 text-slate-400 hover:text-brand hover:bg-brand/5 rounded transition-colors">
                                                <PencilIcon className="h-4 w-4" />
                                            </button>
                                            <button
                                                onClick={() => handleDelete(t.id)}
                                                className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors">
                                                <TrashIcon className="h-4 w-4" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Card>
        </div>
    );
}
