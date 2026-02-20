import { useCallback, useEffect, useState } from 'react';

type AuthStatus = 'checking' | 'authenticated' | 'unauthenticated';

const STORAGE_KEY = 'rein_session_token';

export function usePinAuth(options: { bypass?: boolean } = {}) {
    const { bypass = false } = options;
    const [status, setStatus] = useState<AuthStatus>(bypass ? 'authenticated' : 'checking');
    const [token, setToken] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        if (bypass) {
            setStatus('authenticated');
            return;
        }

        const stored = localStorage.getItem(STORAGE_KEY);
        if (!stored) {
            setStatus('unauthenticated');
            return;
        }

        const verify = async () => {
            try {
                const res = await fetch('/api/auth/verify', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token: stored }),
                });
                if (!res.ok) throw new Error('Verification failed');
                const data = await res.json();
                if (data?.valid) {
                    setToken(stored);
                    setStatus('authenticated');
                } else {
                    localStorage.removeItem(STORAGE_KEY);
                    setStatus('unauthenticated');
                }
            } catch {
                setStatus('unauthenticated');
            }
        };

        verify();
    }, [bypass]);

    const submitPin = useCallback(async (pin: string) => {
        setIsSubmitting(true);
        setError(null);
        try {
            const res = await fetch('/api/auth/pin', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pin }),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data?.error || 'Invalid PIN');
            }
            const data = await res.json();
            if (!data?.token) throw new Error('Invalid response');
            localStorage.setItem(STORAGE_KEY, data.token);
            setToken(data.token);
            setStatus('authenticated');
            return true;
        } catch (err: any) {
            setError(err?.message || 'Invalid PIN');
            setStatus('unauthenticated');
            return false;
        } finally {
            setIsSubmitting(false);
        }
    }, []);

    return { status, token, error, isSubmitting, submitPin };
}
