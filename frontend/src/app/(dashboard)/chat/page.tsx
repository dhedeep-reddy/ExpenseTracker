"use client"
import React, { useState, useRef, useEffect, useCallback } from 'react';
import api from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import {
    PaperAirplaneIcon,
    SparklesIcon,
    UserCircleIcon,
    ArrowPathIcon,
} from '@heroicons/react/24/solid';
import { ChatBubbleLeftRightIcon } from '@heroicons/react/24/outline';

// ─── Types ──────────────────────────────────────────────────────────────────
interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function formatTime(date: Date): string {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/** Minimal markdown-to-React renderer (bold, lists, line breaks) */
function renderMarkdown(text: string): React.ReactNode {
    const lines = text.split('\n');
    return lines.map((line, i) => {
        // Bold: **text**
        const parts = line.split(/(\*\*[^*]+\*\*)/g).map((part, j) => {
            if (part.startsWith('**') && part.endsWith('**')) {
                return <strong key={j}>{part.slice(2, -2)}</strong>;
            }
            return part;
        });

        // List item
        if (line.startsWith('- ') || line.startsWith('• ')) {
            return (
                <div key={i} className="flex gap-2 items-start">
                    <span className="mt-1 w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0 mt-2" />
                    <span>{parts}</span>
                </div>
            );
        }
        // Empty line → spacer
        if (line.trim() === '') return <div key={i} className="h-2" />;
        return <div key={i}>{parts}</div>;
    });
}

// ─── Suggested Prompts ───────────────────────────────────────────────────────
const SUGGESTED = [
    { emoji: '💰', text: 'I got my salary of 75000 today' },
    { emoji: '🛒', text: 'Spent 800 on groceries today' },
    { emoji: '📊', text: 'How much have I spent so far this month?' },
    { emoji: '💼', text: 'Allocate 10000 to food and 5000 to transport' },
    { emoji: '📝', text: 'Show me my current balance breakdown' },
    { emoji: '🔄', text: 'Actually the grocery expense was 950 not 800' },
];

// ─── Component ───────────────────────────────────────────────────────────────
export default function ChatPage() {
    const { isAuthenticated, username } = useAuth();
    const router = useRouter();

    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const bottomRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        if (!isAuthenticated) router.push('/login');
    }, [isAuthenticated, router]);

    // Auto-scroll to bottom on new messages
    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, isLoading]);

    // Auto-resize textarea
    useEffect(() => {
        const ta = textareaRef.current;
        if (!ta) return;
        ta.style.height = 'auto';
        ta.style.height = Math.min(ta.scrollHeight, 160) + 'px';
    }, [input]);

    // Build structured chat history for OpenAI conversation context
    const buildHistory = useCallback((msgs: Message[]): { role: string; content: string }[] => {
        return msgs
            .slice(-20)
            .map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content }));
    }, []);

    const sendMessage = useCallback(async (text: string) => {
        const trimmed = text.trim();
        if (!trimmed || isLoading) return;

        const userMsg: Message = {
            id: Date.now().toString(),
            role: 'user',
            content: trimmed,
            timestamp: new Date(),
        };

        const updatedMessages = [...messages, userMsg];
        setMessages(updatedMessages);
        setInput('');
        setIsLoading(true);

        try {
            const res = await api.post('/chat/', {
                message: trimmed,
                chat_history: buildHistory(messages), // array of {role, content}
            });

            const aiMsg: Message = {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: res.data.response,
                timestamp: new Date(),
            };
            setMessages(prev => [...prev, aiMsg]);
        } catch (err: any) {
            const errMsg: Message = {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: err.response?.status === 401
                    ? 'Session expired — please log in again.'
                    : 'Sorry, I ran into an error. Please try again.',
                timestamp: new Date(),
            };
            setMessages(prev => [...prev, errMsg]);
        } finally {
            setIsLoading(false);
            setTimeout(() => textareaRef.current?.focus(), 50);
        }
    }, [messages, isLoading, buildHistory]);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage(input);
        }
    };

    const clearChat = () => setMessages([]);

    // ─── Render ─────────────────────────────────────────────────────────────
    return (
        <div className="flex flex-col h-full -m-4 md:-m-6 lg:-m-8">

            {/* ── Top Bar ──────────────────────────────────────────────── */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-white shrink-0">
                <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-violet-600 shadow-md shadow-blue-200">
                        <SparklesIcon className="h-5 w-5 text-white" />
                    </div>
                    <div>
                        <h1 className="text-base font-bold text-slate-900 leading-none">FinAI Assistant</h1>
                        <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
                            Full financial access · GPT-4o
                        </p>
                    </div>
                </div>
                {messages.length > 0 && (
                    <button
                        onClick={clearChat}
                        className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-900 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition-colors"
                    >
                        <ArrowPathIcon className="h-3.5 w-3.5" />
                        New Chat
                    </button>
                )}
            </div>

            {/* ── Messages ─────────────────────────────────────────────── */}
            <div className="flex-1 overflow-y-auto bg-slate-50">

                {messages.length === 0 ? (
                    /* ── Empty State ── */
                    <div className="flex flex-col items-center justify-center h-full gap-8 px-4 py-12">
                        <div className="text-center">
                            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-violet-600 shadow-xl shadow-blue-200">
                                <ChatBubbleLeftRightIcon className="h-8 w-8 text-white" />
                            </div>
                            <h2 className="text-xl font-bold text-slate-900">What can I help you with?</h2>
                            <p className="mt-1 text-sm text-slate-500 max-w-sm">
                                I have access to all your transactions, budgets, and spending history.
                                Ask me anything about your finances.
                            </p>
                        </div>

                        {/* Suggested prompts grid */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-2xl">
                            {SUGGESTED.map((s, i) => (
                                <button
                                    key={i}
                                    onClick={() => sendMessage(s.text)}
                                    className="group text-left px-4 py-3 rounded-xl border border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50/50 hover:shadow-sm transition-all duration-150"
                                >
                                    <span className="text-lg">{s.emoji}</span>
                                    <p className="mt-1 text-sm text-slate-700 group-hover:text-slate-900 leading-snug">{s.text}</p>
                                </button>
                            ))}
                        </div>
                    </div>
                ) : (
                    /* ── Message Thread ── */
                    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
                        {messages.map((msg) => (
                            <div
                                key={msg.id}
                                className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
                            >
                                {/* Avatar */}
                                {msg.role === 'assistant' ? (
                                    <div className="shrink-0 flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-violet-600 shadow-sm mt-0.5">
                                        <SparklesIcon className="h-4 w-4 text-white" />
                                    </div>
                                ) : (
                                    <div className="shrink-0 flex h-8 w-8 items-center justify-center rounded-full bg-slate-700 mt-0.5">
                                        <UserCircleIcon className="h-5 w-5 text-white" />
                                    </div>
                                )}

                                {/* Bubble */}
                                <div className={`flex flex-col gap-1 max-w-[80%] ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                                    <div
                                        className={`px-4 py-3 rounded-2xl text-sm leading-relaxed ${msg.role === 'user'
                                            ? 'bg-blue-600 text-white rounded-tr-sm shadow-md shadow-blue-200'
                                            : 'bg-white text-slate-800 border border-slate-200 rounded-tl-sm shadow-sm'
                                            }`}
                                    >
                                        {msg.role === 'assistant'
                                            ? renderMarkdown(msg.content)
                                            : msg.content}
                                    </div>
                                    <span className="text-[11px] text-slate-400 px-1">
                                        {formatTime(msg.timestamp)}
                                    </span>
                                </div>
                            </div>
                        ))}

                        {/* Typing indicator */}
                        {isLoading && (
                            <div className="flex gap-3">
                                <div className="shrink-0 flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-violet-600 shadow-sm mt-0.5">
                                    <SparklesIcon className="h-4 w-4 text-white" />
                                </div>
                                <div className="px-4 py-3.5 rounded-2xl rounded-tl-sm bg-white border border-slate-200 shadow-sm flex items-center gap-1.5">
                                    <span className="w-2 h-2 rounded-full bg-slate-400 animate-bounce [animation-delay:0ms]" />
                                    <span className="w-2 h-2 rounded-full bg-slate-400 animate-bounce [animation-delay:150ms]" />
                                    <span className="w-2 h-2 rounded-full bg-slate-400 animate-bounce [animation-delay:300ms]" />
                                </div>
                            </div>
                        )}

                        <div ref={bottomRef} />
                    </div>
                )}
            </div>

            {/* ── Input Bar ────────────────────────────────────────────── */}
            <div className="shrink-0 border-t border-slate-200 bg-white px-4 py-4">
                <div className="max-w-3xl mx-auto">
                    <div className="flex items-end gap-3 rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3 focus-within:border-blue-400 focus-within:bg-white focus-within:ring-4 focus-within:ring-blue-50 transition-all">
                        <textarea
                            ref={textareaRef}
                            id="chat-input"
                            rows={1}
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="Ask anything about your finances… (Enter to send)"
                            className="flex-1 resize-none bg-transparent text-sm text-slate-900 placeholder-slate-400 outline-none max-h-40"
                        />
                        <button
                            id="chat-send-btn"
                            onClick={() => sendMessage(input)}
                            disabled={!input.trim() || isLoading}
                            className="shrink-0 flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-white shadow-md shadow-blue-200 hover:bg-blue-700 disabled:bg-slate-300 disabled:shadow-none transition-all duration-150"
                        >
                            <PaperAirplaneIcon className="h-4 w-4" />
                        </button>
                    </div>
                    <p className="mt-2 text-center text-[11px] text-slate-400">
                        FinAI has full access to your transactions, budgets & cycles · Enter ↵ to send
                    </p>
                </div>
            </div>
        </div>
    );
}
