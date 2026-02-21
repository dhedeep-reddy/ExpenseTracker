"use client"
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, Button } from '@/components/ui';
import api from '@/lib/api';
import { SparklesIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { useRouter } from 'next/navigation';

interface QuickAddModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

export const QuickAddModal: React.FC<QuickAddModalProps> = ({ isOpen, onClose, onSuccess }) => {
    const [mode, setMode] = useState<'ai' | 'manual'>('ai');
    const [nlpText, setNlpText] = useState('');
    const [loading, setLoading] = useState(false);
    const [chatResponse, setChatResponse] = useState('');

    // Manual Form States
    const [type, setType] = useState('EXPENSE');
    const [amount, setAmount] = useState('');
    const [category, setCategory] = useState('');
    const [source, setSource] = useState('MAIN_BALANCE');

    if (!isOpen) return null;

    const handleAISubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!nlpText.trim()) return;

        setLoading(true);
        try {
            const res = await api.post('/chat/', { message: nlpText });
            setChatResponse(res.data.response);
            setNlpText('');
            setTimeout(() => {
                onSuccess();
                onClose();
                setChatResponse('');
            }, 2500); // give them time to read the AI output
        } catch (err: any) {
            setChatResponse('Error: ' + (err.response?.data?.detail || err.message));
        } finally {
            setLoading(false);
        }
    };

    const handleManualSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            await api.post('/transactions/', {
                type,
                amount: parseFloat(amount),
                category: category || null,
                source
            });
            onSuccess();
            onClose();
        } catch (err) {
            alert("Failed to save transaction.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
            <Card className="w-full max-w-lg shadow-2xl relative animate-in fade-in zoom-in-95 duration-200">
                <button
                    onClick={onClose}
                    className="absolute right-4 top-4 p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-900 rounded-full transition-colors"
                >
                    <XMarkIcon className="h-5 w-5" />
                </button>

                <CardHeader>
                    <CardTitle>Log Transaction</CardTitle>
                    <div className="flex bg-slate-100 p-1 mt-4 rounded-lg">
                        <button
                            onClick={() => setMode('ai')}
                            className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-all ${mode === 'ai' ? 'bg-white shadow-sm text-brand' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            <SparklesIcon className="h-4 w-4 inline mr-1" /> AI Assistant
                        </button>
                        <button
                            onClick={() => setMode('manual')}
                            className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-all ${mode === 'manual' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            Manual Entry
                        </button>
                    </div>
                </CardHeader>

                <CardContent>
                    {mode === 'ai' ? (
                        <form onSubmit={handleAISubmit} className="space-y-4 pt-2">
                            <div className="bg-brand/5 border border-brand/10 p-4 rounded-xl text-brand text-sm">
                                Just type what happened. The AI will categorize and log it for you.
                                <br />
                                <span className="text-brand/70 block mt-2 italic">"Spent 500 on dinner paying with credit card"</span>
                            </div>

                            <textarea
                                className="input-field min-h-[100px] resize-none text-lg"
                                placeholder="What did you spend?"
                                value={nlpText}
                                onChange={e => setNlpText(e.target.value)}
                                autoFocus
                            />

                            {chatResponse && (
                                <div className="p-3 bg-emerald-50 text-emerald-700 rounded-lg text-sm font-medium animate-in fade-in slide-in-from-bottom-2">
                                    {chatResponse}
                                </div>
                            )}

                            <Button type="submit" disabled={loading} className="w-full text-lg h-12">
                                {loading ? 'Processing...' : 'Log via AI Spark'}
                            </Button>
                        </form>
                    ) : (
                        <form onSubmit={handleManualSubmit} className="space-y-4 pt-2">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-xs font-semibold text-slate-500 uppercase">Type</label>
                                    <select
                                        className="input-field"
                                        value={type}
                                        onChange={e => setType(e.target.value)}
                                    >
                                        <option value="EXPENSE">Expense</option>
                                        <option value="INCOME">Income</option>
                                        <option value="SALARY">Salary</option>
                                    </select>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-xs font-semibold text-slate-500 uppercase">Amount (₹)</label>
                                    <input
                                        type="number"
                                        required
                                        min="0"
                                        step="0.01"
                                        className="input-field"
                                        value={amount}
                                        onChange={e => setAmount(e.target.value)}
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-xs font-semibold text-slate-500 uppercase">Category</label>
                                <input
                                    type="text"
                                    className="input-field"
                                    placeholder="e.g. Groceries, Rent..."
                                    value={category}
                                    onChange={e => setCategory(e.target.value)}
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-xs font-semibold text-slate-500 uppercase">Source / Payment</label>
                                <select
                                    className="input-field"
                                    value={source}
                                    onChange={e => setSource(e.target.value)}
                                >
                                    <option value="MAIN_BALANCE">Main Balance (Cash/Bank)</option>
                                    <option value="CREDIT_CARD">Credit Card</option>
                                    <option value="BORROWED">Borrowed Amount</option>
                                    <option value="SAVINGS">Savings Account</option>
                                </select>
                            </div>

                            <Button type="submit" disabled={loading} className="w-full mt-4">
                                {loading ? 'Saving...' : 'Save Transaction'}
                            </Button>
                        </form>
                    )}
                </CardContent>
            </Card>
        </div>
    );
};
