import { useCallback, useEffect, useRef, useState } from 'react';

type VoiceState = 'idle' | 'listening' | 'error';

interface UseVoiceInputOptions {
    /** Called with the final transcript when speech ends */
    onTranscript: (text: string) => void;
    /** If true, the interim (partial) transcript is also surfaced via onInterim */
    showInterim?: boolean;
    onInterim?: (text: string) => void;
    lang?: string;
}

interface UseVoiceInputReturn {
    state: VoiceState;
    isListening: boolean;
    errorMsg: string;
    startListening: () => void;
    stopListening: () => void;
    toggle: () => void;
    supported: boolean;
}

export function useVoiceInput({
    onTranscript,
    showInterim = true,
    onInterim,
    lang = 'en-US',
}: UseVoiceInputOptions): UseVoiceInputReturn {
    const [state, setState] = useState<VoiceState>('idle');
    const [errorMsg, setErrorMsg] = useState('');
    const recognitionRef = useRef<any | null>(null);
    const supported = typeof window !== 'undefined' &&
        ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

    const stopListening = useCallback(() => {
        recognitionRef.current?.stop();
        setState('idle');
    }, []);

    const startListening = useCallback(() => {
        if (!supported) {
            setErrorMsg('Voice input is not supported in this browser. Please use Chrome or Edge.');
            setState('error');
            return;
        }
        const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        const recognition: any = new SR();
        recognition.lang = lang;
        recognition.continuous = false;
        recognition.interimResults = showInterim;
        recognition.maxAlternatives = 1;

        recognition.onstart = () => { setState('listening'); setErrorMsg(''); };
        recognition.onend = () => { setState('idle'); };
        recognition.onerror = (e: any) => {
            const msg = e.error === 'no-speech' ? 'No speech detected. Try again.'
                : e.error === 'not-allowed' ? 'Microphone access denied.'
                    : `Voice error: ${e.error}`;
            setErrorMsg(msg);
            setState('error');
            setTimeout(() => setState('idle'), 3000);
        };
        recognition.onresult = (event: any) => {
            let interim = '';
            let final = '';
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const t = event.results[i][0].transcript;
                if (event.results[i].isFinal) final += t;
                else interim += t;
            }
            if (showInterim && interim && onInterim) onInterim(interim);
            if (final) onTranscript(final.trim());
        };

        recognitionRef.current = recognition;
        recognition.start();
    }, [supported, lang, showInterim, onTranscript, onInterim]);

    const toggle = useCallback(() => {
        if (state === 'listening') stopListening();
        else startListening();
    }, [state, startListening, stopListening]);

    // Cleanup on unmount
    useEffect(() => () => { recognitionRef.current?.stop(); }, []);

    return { state, isListening: state === 'listening', errorMsg, startListening, stopListening, toggle, supported };
}
