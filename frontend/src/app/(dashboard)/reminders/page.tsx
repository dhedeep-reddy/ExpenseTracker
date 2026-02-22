"use client"
import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import api from '@/lib/api';
import { BellAlertIcon, PlusIcon, TrashIcon, CheckCircleIcon, ClockIcon, ExclamationCircleIcon } from '@heroicons/react/24/outline';
import { format, isPast, isWithinInterval, addDays } from 'date-fns';

type ReminderType = 'LOAN' | 'BILL' | 'SUBSCRIPTION' | 'CUSTOM';

interface Reminder {
    id: number;
    title: string;
    amount: number;
    due_date: string | null;
    type: ReminderType;
    is_paid: boolean;
    notes: string | null;
    created_at: string;
}

const TYPE_COLORS: Record<ReminderType, string> = {
    LOAN: 'bg-purple-100 text-purple-700 ring-1 ring-purple-200',
    BILL: 'bg-blue-100 text-blue-700 ring-1 ring-blue-200',
    SUBSCRIPTION: 'bg-amber-100 text-amber-700 ring-1 ring-amber-200',
    CUSTOM: 'bg-slate-100 text-slate-700 ring-1 ring-slate-200',
};

const emptyForm = { title: '', amount: '', due_date: '', type: 'CUSTOM' as ReminderType, notes: '' };

export default function RemindersPage() {
    const [reminders, setReminders] = useState<Reminder[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState(emptyForm);
    const [submitting, setSubmitting] = useState(false);

    const fetchReminders = async () => {
        try {
            const res = await api.get('/reminders/');
            setReminders(res.data);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchReminders(); }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            await api.post('/reminders/', {
                title: form.title,
                amount: parseFloat(form.amount) || 0,
                due_date: form.due_date ? new Date(form.due_date).toISOString() : null,
                type: form.type,
                notes: form.notes || null,
            });
            setForm(emptyForm);
            setShowForm(false);
            fetchReminders();
        } catch (e) {
            console.error(e);
        } finally {
            setSubmitting(false);
        }
    };

    const handleMarkPaid = async (id: number, is_paid: boolean) => {
        try {
            await api.patch(`/reminders/${id}`, { is_paid: !is_paid });
            fetchReminders();
        } catch (e) { console.error(e); }
    };

    const handleDelete = async (id: number) => {
        if (!confirm('Delete this reminder?')) return;
        try {
            await api.delete(`/reminders/${id}`);
            fetchReminders();
        } catch (e) { console.error(e); }
    };

    const now = new Date();
    const overdue = reminders.filter(r => !r.is_paid && r.due_date && isPast(new Date(r.due_date)));
    const upcoming = reminders.filter(r => !r.is_paid && (!r.due_date || !isPast(new Date(r.due_date))));
    const paid = reminders.filter(r => r.is_paid);

    const ReminderCard = ({ r }: { r: Reminder }) => {
        const overdueBool = r.due_date && isPast(new Date(r.due_date)) && !r.is_paid;
        const soonBool = r.due_date && !overdueBool && !r.is_paid && isWithinInterval(new Date(r.due_date), { start: now, end: addDays(now, 7) });

        return (
            <div className={`flex items-start gap-4 p-4 rounded-xl border transition-all ${r.is_paid ? 'bg-slate-50 border-slate-200 opacity-70' :
                    overdueBool ? 'bg-red-50 border-red-200' :
                        soonBool ? 'bg-amber-50 border-amber-200' :
                            'bg-white border-slate-200 hover:border-brand/30'
                }`}>
                <div className={`mt-0.5 flex-shrink-0 h-9 w-9 rounded-full flex items-center justify-center ${r.is_paid ? 'bg-emerald-100' : overdueBool ? 'bg-red-100' : soonBool ? 'bg-amber-100' : 'bg-slate-100'
                    }`}>
                    {r.is_paid ? <CheckCircleIcon className="h-5 w-5 text-emerald-600" /> :
                        overdueBool ? <ExclamationCircleIcon className="h-5 w-5 text-red-600" /> :
                            <ClockIcon className="h-5 w-5 text-slate-500" />}
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className={`font-semibold text-slate-900 ${r.is_paid ? 'line-through text-slate-400' : ''}`}>{r.title}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TYPE_COLORS[r.type]}`}>{r.type}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-sm">
                        <span className={`font-bold text-lg ${r.is_paid ? 'text-slate-400' : overdueBool ? 'text-red-600' : 'text-slate-900'}`}>
                            ₹{r.amount.toLocaleString('en-IN')}
                        </span>
                        {r.due_date && (
                            <span className={`text-xs ${overdueBool ? 'text-red-600 font-medium' : 'text-slate-500'}`}>
                                {overdueBool ? '⚠ Overdue · ' : 'Due: '}
                                {format(new Date(r.due_date), 'dd MMM yyyy')}
                            </span>
                        )}
                    </div>
                    {r.notes && <p className="text-xs text-slate-400 mt-1 truncate">{r.notes}</p>}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                        onClick={() => handleMarkPaid(r.id, r.is_paid)}
                        title={r.is_paid ? 'Mark unpaid' : 'Mark paid'}
                        className={`p-1.5 rounded-lg transition-colors ${r.is_paid ? 'text-slate-400 hover:text-amber-600 hover:bg-amber-50' : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50'}`}>
                        <CheckCircleIcon className="h-5 w-5" />
                    </button>
                    <button
                        onClick={() => handleDelete(r.id)}
                        className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                        <TrashIcon className="h-4 w-4" />
                    </button>
                </div>
            </div>
        );
    };

    if (loading) return <div className="p-8 text-center text-slate-500 animate-pulse">Loading reminders...</div>;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
                        <BellAlertIcon className="h-7 w-7 text-brand" />
                        Reminders & Loans
                    </h2>
                    <p className="text-sm text-slate-500 mt-1">Track future payments, loans, and bills</p>
                </div>
                <button
                    onClick={() => setShowForm(v => !v)}
                    className="flex items-center gap-2 bg-brand text-white px-4 py-2.5 rounded-xl text-sm font-semibold shadow-md shadow-brand/20 hover:bg-brand-dark transition-colors">
                    <PlusIcon className="h-4 w-4" />
                    Add Reminder
                </button>
            </div>

            {/* Add Form */}
            {showForm && (
                <Card className="border-brand/20 bg-brand/5">
                    <CardHeader><CardTitle className="text-base">New Reminder</CardTitle></CardHeader>
                    <CardContent>
                        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="md:col-span-2">
                                <label className="block text-xs font-medium text-slate-600 mb-1">Title *</label>
                                <input required value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                                    placeholder="e.g. EMI Payment, Electricity Bill"
                                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 bg-white" />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-600 mb-1">Amount (₹)</label>
                                <input type="number" min="0" step="0.01" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                                    placeholder="0"
                                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 bg-white" />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-600 mb-1">Due Date</label>
                                <input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))}
                                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 bg-white" />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-600 mb-1">Type</label>
                                <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as ReminderType }))}
                                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 bg-white">
                                    <option value="LOAN">Loan / EMI</option>
                                    <option value="BILL">Bill</option>
                                    <option value="SUBSCRIPTION">Subscription</option>
                                    <option value="CUSTOM">Custom</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-600 mb-1">Notes (optional)</label>
                                <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                                    placeholder="Any extra details"
                                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 bg-white" />
                            </div>
                            <div className="md:col-span-2 flex gap-2 justify-end">
                                <button type="button" onClick={() => setShowForm(false)}
                                    className="px-4 py-2 text-sm rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-100 transition-colors">
                                    Cancel
                                </button>
                                <button type="submit" disabled={submitting}
                                    className="px-4 py-2 text-sm rounded-lg bg-brand text-white font-semibold hover:bg-brand-dark transition-colors disabled:opacity-60">
                                    {submitting ? 'Saving...' : 'Save Reminder'}
                                </button>
                            </div>
                        </form>
                    </CardContent>
                </Card>
            )}

            {/* Stats Row */}
            <div className="grid grid-cols-3 gap-4">
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
                    <div className="text-2xl font-bold text-red-600">{overdue.length}</div>
                    <div className="text-xs text-red-500 font-medium mt-0.5">Overdue</div>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center">
                    <div className="text-2xl font-bold text-amber-600">{upcoming.length}</div>
                    <div className="text-xs text-amber-500 font-medium mt-0.5">Upcoming</div>
                </div>
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
                    <div className="text-2xl font-bold text-emerald-600">{paid.length}</div>
                    <div className="text-xs text-emerald-500 font-medium mt-0.5">Paid</div>
                </div>
            </div>

            {/* Overdue Section */}
            {overdue.length > 0 && (
                <Card className="border-red-200">
                    <CardHeader><CardTitle className="text-red-700 text-base flex items-center gap-2">
                        <ExclamationCircleIcon className="h-5 w-5" /> Overdue ({overdue.length})
                    </CardTitle></CardHeader>
                    <CardContent className="space-y-3">
                        {overdue.map(r => <ReminderCard key={r.id} r={r} />)}
                    </CardContent>
                </Card>
            )}

            {/* Upcoming Section */}
            <Card>
                <CardHeader><CardTitle className="text-base flex items-center gap-2">
                    <ClockIcon className="h-5 w-5 text-amber-500" /> Upcoming ({upcoming.length})
                </CardTitle></CardHeader>
                <CardContent className="space-y-3">
                    {upcoming.length === 0 ? (
                        <p className="text-sm text-slate-400 text-center py-4">No upcoming reminders. Add one above!</p>
                    ) : upcoming.map(r => <ReminderCard key={r.id} r={r} />)}
                </CardContent>
            </Card>

            {/* Paid Section */}
            {paid.length > 0 && (
                <Card className="border-slate-200">
                    <CardHeader><CardTitle className="text-slate-500 text-base flex items-center gap-2">
                        <CheckCircleIcon className="h-5 w-5 text-emerald-500" /> Paid / Cleared ({paid.length})
                    </CardTitle></CardHeader>
                    <CardContent className="space-y-3">
                        {paid.map(r => <ReminderCard key={r.id} r={r} />)}
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
