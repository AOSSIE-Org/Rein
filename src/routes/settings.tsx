import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect, useRef } from 'react'
import QRCode from 'qrcode';
import { CONFIG, APP_CONFIG, THEMES } from '../config';

export const Route = createFileRoute('/settings')({
    component: SettingsPage,
})

// Client-only settings: stored in localStorage, never sent to server-config.json
const CLIENT_KEYS = {
    SENSITIVITY: 'rein_mouse_sensitivity',
    INVERT: 'rein_mouse_invert',
    THEME: APP_CONFIG.THEME_STORAGE_KEY,
} as const
const DEFAULT_SENSITIVITY = 1.0
const DEFAULT_INVERT = false

function SettingsPage() {
    const [ip, setIp] = useState('')
    const [frontendPort, setFrontendPort] = useState(String(CONFIG.FRONTEND_PORT))
    const [invertScroll, setInvertScroll] = useState(DEFAULT_INVERT)
    const [sensitivity, setSensitivity] = useState(DEFAULT_SENSITIVITY)
    const [theme, setTheme] = useState(THEMES.DEFAULT)
    const [qrData, setQrData] = useState('')
    const hasLoadedFromStorage = useRef(false)
    const isFirstSensitivity = useRef(true)
    const isFirstInvert = useRef(true)
    const isFirstTheme = useRef(true)

    // Load client settings from localStorage only on client, so they persist when navigating back
    useEffect(() => {
        if (typeof window === 'undefined') return
        const storedIp = localStorage.getItem('rein_ip')
        const defaultIp = window.location.hostname || 'localhost'
        setIp(storedIp || defaultIp)

        setFrontendPort(String(CONFIG.FRONTEND_PORT))

        const s = localStorage.getItem(CLIENT_KEYS.SENSITIVITY)
        if (s !== null) {
            const n = Number(s)
            if (!Number.isNaN(n)) setSensitivity(n)
        }
        const inv = localStorage.getItem(CLIENT_KEYS.INVERT)
        if (inv === 'true') setInvertScroll(true)
        if (inv === 'false') setInvertScroll(false)

        const t = localStorage.getItem(CLIENT_KEYS.THEME)
        if (t === THEMES.LIGHT || t === THEMES.DARK) {
            setTheme(t)
            document.documentElement.setAttribute('data-theme', t)
        }

        hasLoadedFromStorage.current = true
    }, [])

    // Persist client settings to localStorage after user changes (skip first run to avoid overwriting loaded values)
    useEffect(() => {
        if (typeof window === 'undefined' || !hasLoadedFromStorage.current) return
        if (isFirstSensitivity.current) { isFirstSensitivity.current = false; return }
        localStorage.setItem(CLIENT_KEYS.SENSITIVITY, String(sensitivity))
    }, [sensitivity])
    useEffect(() => {
        if (typeof window === 'undefined' || !hasLoadedFromStorage.current) return
        if (isFirstInvert.current) { isFirstInvert.current = false; return }
        localStorage.setItem(CLIENT_KEYS.INVERT, String(invertScroll))
    }, [invertScroll])
    useEffect(() => {
        if (typeof window === 'undefined' || !hasLoadedFromStorage.current) return
        if (isFirstTheme.current) { isFirstTheme.current = false; return }
        localStorage.setItem(CLIENT_KEYS.THEME, theme)
        document.documentElement.setAttribute('data-theme', theme)
    }, [theme])

    // Update LocalStorage for IP and generate QR
    useEffect(() => {
        if (!ip) return
        localStorage.setItem('rein_ip', ip)
        if (typeof window !== 'undefined') {
            const appPort = String(CONFIG.FRONTEND_PORT)
            const protocol = window.location.protocol
            const shareUrl = `${protocol}//${ip}:${appPort}/trackpad`
            QRCode.toDataURL(shareUrl)
                .then(setQrData)
                .catch((e) => console.error('QR Error:', e))
        }
    }, [ip])

    // Effect: Auto-detect LAN IP from Server (only if on localhost)
    useEffect(() => {
        if (typeof window === 'undefined') return;
        if (window.location.hostname !== 'localhost') return;

        console.log('Attempting to auto-detect IP...');
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws`;
        const socket = new WebSocket(wsUrl);

        socket.onopen = () => {
            console.log('Connected to local server for IP detection');
            socket.send(JSON.stringify({ type: 'get-ip' }));
        };

        socket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.type === 'server-ip' && data.ip) {
                    console.log('Auto-detected IP:', data.ip);
                    setIp(data.ip);
                    socket.close();
                }
            } catch (e) {
                console.error(e);
            }
        };

        return () => {
            if (socket.readyState === WebSocket.OPEN) socket.close();
        }
    }, []); // Run once

    // Helper for display URL
    const displayUrl = typeof window !== 'undefined'
        ? `${window.location.protocol}//${ip}:${CONFIG.FRONTEND_PORT}/trackpad`
        : `http://${ip}:${CONFIG.FRONTEND_PORT}/trackpad`;

    return (
        <div className="h-full overflow-y-auto w-full">
            <div className="p-6 pb-safe max-w-md mx-auto space-y-8 min-h-full">
                <h1 className="text-3xl font-bold pt-4">Settings</h1>

                <div className="form-control w-full">
                    <label className="label">
                        <span className="label-text">Server IP (for Remote)</span>
                    </label>
                    <input
                        type="text"
                        placeholder="192.168.1.X"
                        className="input input-bordered w-full"
                        value={ip}
                        onChange={(e) => setIp(e.target.value)}
                    />
                    <label className="label">
                        <span className="label-text-alt opacity-50">This Computer's LAN IP</span>
                    </label>
                </div>

                {/* SENSITIVITY SLIDER SECTION */} 
                <div className="form-control w-full max-w-2xl mx-auto">
                    <label className="label" htmlFor="sensitivity-slider">
                        <span className="label-text">Mouse Sensitivity</span>
                        <span className="label-text-alt font-mono">
                        {sensitivity.toFixed(1)}x
                        </span>
                    </label>

                    <input
                        type="range"
                        id="sensitivity-slider"
                        min="0.1"
                        max="3.0"
                        step="0.1"
                        value={sensitivity}
                        onChange={(e) => setSensitivity(parseFloat(e.target.value))}
                        className="range range-primary range-sm w-full"
                    />

                    <div className="mt-2 flex w-full justify-between px-2 text-xs opacity-50">
                        <span>Slow</span>
                        <span>Default</span>
                        <span>Fast</span>
                    </div>
                </div>


                <div className="form-control w-full">
                    <label className="label cursor-pointer">
                        <span className="label-text font-medium">Invert Scroll</span>
                        <input
                            type="checkbox"
                            className="toggle toggle-primary"
                            checked={invertScroll}
                            onChange={(e) => setInvertScroll(e.target.checked)}
                        />
                    </label>
                    <br />
                    <label className="label">
                        <span className="label-text-alt opacity-50">
                            {invertScroll ? 'Traditional scrolling enabled' : 'Natural scrolling'}
                        </span>
                    </label>
                </div>

                <div className="form-control w-full">
                    <label className="label">
                        <span className="label-text">Theme</span>
                    </label>
                    <select
                        className="select select-bordered w-full"
                        value={theme}
                        onChange={(e) => setTheme(e.target.value as typeof THEMES.LIGHT | typeof THEMES.DARK)}
                    >
                        <option value={THEMES.DARK}>Dark (dracula)</option>
                        <option value={THEMES.LIGHT}>Light (cupcake)</option>
                    </select>
                </div>

                <div className="form-control w-full">
                    <label className="label">
                        <span className="label-text">Port</span>
                    </label>
                    <input
                        type="text"
                        placeholder={String(CONFIG.FRONTEND_PORT)}
                        className="input input-bordered w-full"
                        value={frontendPort}
                        onChange={(e) => setFrontendPort(e.target.value)}
                    />
                </div>

                <div className="alert alert-warning text-xs shadow-lg">
                    <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-4 w-4" fill="none" viewBox="0 0 24 24">
                        <title>Warning</title>
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <span>Important: Ensure port {frontendPort} is allowed in your computer's firewall!</span>
                </div>

                <button
                    className="btn btn-neutral w-full"
                    onClick={() => {
                        const portNum = parseInt(frontendPort, 10)
                        if (Number.isNaN(portNum) || portNum < 1 || portNum > 65535) {
                            alert('Please enter a valid port (1–65535).')
                            return
                        }
                        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
                        const host = window.location.host
                        const wsUrl = `${protocol}//${host}/ws`
                        const socket = new WebSocket(wsUrl)

                        socket.onerror = () => {
                            alert('Could not connect to server. Is the app running?')
                        }
                        socket.onopen = () => {
                            socket.send(JSON.stringify({
                                type: 'update-config',
                                config: { frontendPort: portNum },
                            }))
                        }
                        socket.onmessage = (event) => {
                            try {
                                const data = JSON.parse(event.data)
                                if (data.type === 'config-updated' && data.success) {
                                    socket.close()
                                    const newProtocol = window.location.protocol
                                    const newHostname = window.location.hostname
                                    const newUrl = `${newProtocol}//${newHostname}:${portNum}/settings`
                                    setTimeout(() => { window.location.href = newUrl }, 800)
                                } else if (data.type === 'config-updated' && !data.success) {
                                    alert('Failed to save config: ' + (data.error || 'Unknown error'))
                                }
                            } catch (_e) {
                                // ignore non-JSON messages
                            }
                        }
                    }}
                >
                    Save Config
                </button>

                <div className="card bg-base-200 shadow-xl">
                    <div className="card-body items-center text-center">
                        <h2 className="card-title">Connect Mobile</h2>
                        <p className="text-sm opacity-70">Scan to open remote</p>

                        {qrData && (
                            <div className="bg-white p-4 rounded-xl shadow-inner my-4">
                                <img src={qrData} alt="Connection QR" className="w-48 h-48 mix-blend-multiply" />
                            </div>
                        )}

                        <a
                            className="link link-primary mt-2 break-all text-lg font-mono bg-base-100 px-4 py-2 rounded-lg inline-block max-w-full overflow-hidden text-ellipsis"
                            href={displayUrl}
                        >
                            {ip}:{CONFIG.FRONTEND_PORT}/trackpad
                        </a>
                    </div>
                </div>

                <div className="text-xs text-center opacity-50 pt-8 pb-8">
                    Rein Remote v1.0.0
                </div>
            </div>
        </div>
    )
}
