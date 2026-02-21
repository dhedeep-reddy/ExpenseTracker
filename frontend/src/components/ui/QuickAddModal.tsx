"use client"
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, Button } from '@/components/ui';
import api from '@/lib/api';
import { SparklesIcon, XMarkIcon } from '@heroicons/react/24/outline';

interface QuickAddModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

// Today's date in YYYY-MM-DD format for default
function todayStr() {
    return new Date().toISOString().slice(0, 10);
}

const EXPENSE_CATEGORIES = [
    'Food', 'Groceries', 'Transport', 'Entertainment', 'Rent',
    'Utilities', 'Healthcare', 'Shopping', 'Education', 'Other',
];

export const QuickAddModal: React.FC<QuickAddModalProps> = ({ isOpen, onClose, onSuccess }) => {
    const [mode, setMode] = useState<'ai' | 'manual'>('ai');
    const [nlpText, setNlpText] = useState('');
    const [loading, setLoading] = useState(false);
    const [chatResponse, setChatResponse] = useState('');
    const [error, setError] = useState('');

    // Manual Form
    const [type, setType] = useState('EXPENSE');
    const [amount, setAmount] = useState('');
    const [category, setCategory] = useState('');
    const [customCategory, setCustomCategory] = useState('');
    const [description, setDescription] = useState('');
    const [date, setDate] = useState(todayStr());
    const [source, setSource] = useState('MAIN_BALANCE');

    if (!isOpen) return null;

    const resetForm = () => {
        setAmount(''); setCategory(''); setCustomCategory('');
        setDescription(''); setDate(todayStr()); setSource('MAIN_BALANCE');
        setError(''); setChatResponse('');
    };

    const handleClose = () => { resetForm(); onClose(); };

    const handleAISubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!nlpText.trim()) return;
        setLoading(true); setError('');
        try {
            const res = await api.post('/chat/', { message: nlpText });
            setChatResponse(res.data.response);
            setNlpText('');
            setTimeout(() => { onSuccess(); handleClose(); }, 2500);
        } catch (err: any) {
            setError(err.response?.data?.detail || 'Something went wrong.');
        } finally {
            setLoading(false);
        }
    };

    const handleManualSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!amount || parseFloat(amount) <= 0) { setError('Please enter a valid amount.'); return; }
        setLoading(true); setError('');
        const finalCategory = category === '__custom__' ? customCategory : category;
        // Build ISO datetime from date input
        const dateISO = date ? new Date(date + 'T12:00:00').toISOString() : new Date().toISOString();
        try {
            await api.post('/transactions/', {
                type,
                amount: parseFloat(amount),
                category: type === 'EXPENSE' ? (finalCategory || null) : null,
                description: (type === 'INCOME' ? description : undefined) || undefined,
                source: type === 'EXPENSE' ? source : 'MAIN_BALANCE',
                date: dateISO,
            });
            onSuccess();
            handleClose();
        } catch (err: any) {
            setError(err.response?.data?.detail || 'Failed to save transaction.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
            <Card className="w-full max-w-lg shadow-2xl relative animate-in fade-in zoom-in-95 duration-200">
                <button
                    onClick={handleClose}
                    className="absolute right-4 top-4 p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-900 rounded-full transition-colors"
                >
                    <XMarkIcon className="h-5 w-5" />
                </button>

                <CardHeader>
                    <CardTitle>Log Transaction</CardTitle>
                    <div className="flex bg-slate-100 p-1 mt-4 rounded-lg">
                        <button
                            onClick={() => { setMode('ai'); resetForm(); }}
                            className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-all ${mode === 'ai' ? 'bg-white shadow-sm text-brand' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            <SparklesIcon className="h-4 w-4 inline mr-1" /> AI Assistant
                        </button>
                        <button
                            onClick={() => { setMode('manual'); resetForm(); }}
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
                                Just type what happened — the AI will categorize and log it.
                                <span className="text-brand/70 block mt-1 italic">"Spent 500 on dinner yesterday"</span>
                            </div>
                            <textarea
                                className="input-field min-h-[100px] resize-none text-lg"
                                placeholder="What happened with your money?"
                                value={nlpText}
                                onChange={e => setNlpText(e.target.value)}
                                autoFocus
                            />
                            {chatResponse && (
                                <div className="p-3 bg-emerald-50 text-emerald-700 rounded-lg text-sm font-medium">
                                    {chatResponse}
                                </div>
                            )}
                            {error && <p className="text-red-500 text-sm">{error}</p>}
                            <Button type="submit" disabled={loading} className="w-full text-lg h-12">
                                {loading ? 'Processing...' : 'Log via AI ✨'}
                            </Button>
                        </form>
                    ) : (
                        <form onSubmit={handleManualSubmit} className="space-y-4 pt-2">

                            {/* TYPE */}
                            <div className="space-y-1.5">
                                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Type</label>
                                <div className="grid grid-cols-3 gap-2">
                                    {['EXPENSE', 'INCOME', 'SALARY'].map(t => (
                                        <button
                                            key={t}
                                            type="button"
                                            onClick={() => { setType(t); setCategory(''); setCustomCategory(''); }}
                                            className={`py-2 rounded-lg text-sm font-semibold border transition-all ${type === t
                                                ? t === 'EXPENSE' ? 'bg-red-50 border-red-400 text-red-600'
                                                    : t === 'INCOME' ? 'bg-emerald-50 border-emerald-400 text-emerald-700'
                                                        : 'bg-blue-50 border-blue-400 text-blue-700'
                                                : 'border-slate-200 text-slate-500 hover:bg-slate-50'
                                                }`}
                                        >
                                            {t === 'EXPENSE' ? '💸 Expense' : t === 'INCOME' ? '💰 Income' : '🏦 Salary'}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* AMOUNT + DATE (always shown) */}
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Amount (₹)</label>
                                    <input
                                        type="number" required min="0" step="0.01"
                                        className="input-field"
                                        placeholder="0.00"
                                        value={amount}
                                        onChange={e => setAmount(e.target.value)}
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Date</label>
                                    <input
                                        type="date"
                                        required
                                        className="input-field"
                                        value={date}
                                        max={todayStr()}
                                        onChange={e => setDate(e.target.value)}
                                    />
                                </div>
                            </div>

                            {/* EXPENSE-ONLY: Category + Source */}
                            {type === 'EXPENSE' && (
                                <>
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Category</label>
                                        <select
                                            className="input-field"
                                            value={category}
                                            onChange={e => setCategory(e.target.value)}
                                        >
                                            <option value="">— Select category —</option>
                                            {EXPENSE_CATEGORIES.map(c => <option key={c} value={c.toLowerCase()}>{c}</option>)}
                                            <option value="__custom__">+ Custom category</option>
                                        </select>
                                        {category === '__custom__' && (
                                            <input
                                                type="text"
                                                className="input-field mt-2"
                                                placeholder="Type your category name"
                                                value={customCategory}
                                                onChange={e => setCustomCategory(e.target.value)}
                                            />
                                        )}
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Payment Source</label>
                                        <select className="input-field" value={source} onChange={e => setSource(e.target.value)}>
                                            <option value="MAIN_BALANCE">Main Balance (Cash / Bank)</option>
                                            <option value="CREDIT_CARD">Credit Card</option>
                                            <option value="BORROWED">Borrowed</option>
                                            <option value="SAVINGS">Savings Account</option>
                                        </select>
                                    </div>
                                </>
                            )}

                            {/* INCOME-ONLY: Description */}
                            {type === 'INCOME' && (
                                <div className="space-y-1.5">
                                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                                        Description <span className="text-slate-400 normal-case font-normal">(optional)</span>
                                    </label>
                                    <input
                                        type="text"
                                        className="input-field"
                                        placeholder="e.g. Freelance payment, Gift..."
                                        value={description}
                                        onChange={e => setDescription(e.target.value)}
                                    />
                                </div>
                            )}

                            {error && <p className="text-red-500 text-sm">{error}</p>}

                            <Button type="submit" disabled={loading} className="w-full mt-2">
                                {loading ? 'Saving...' : `Save ${type === 'EXPENSE' ? 'Expense' : type === 'INCOME' ? 'Income' : 'Salary'}`}
                            </Button>
                        </form>
                    )}
                </CardContent>
            </Card>
        </div>
    );
};
