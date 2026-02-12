import { Outlet, createRootRoute, Link, Scripts, HeadContent } from '@tanstack/react-router'
// import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'
import { useEffect } from 'react'
import { APP_CONFIG, THEMES } from '../config'
import '../styles.css'

export const Route = createRootRoute({
  component: RootComponent,
  errorComponent: (props) => {
    return (
      <RootDocument>
        <div>Error: {props.error.message}</div>
      </RootDocument>
    )
  },
  notFoundComponent: () => <div>Not Found</div>,
})

function RootComponent() {
  return (
    <RootDocument>
      <Outlet />
      {/* <TanStackRouterDevtools position="bottom-right" /> */}
    </RootDocument>
  )
}

function ThemeInit() {
  useEffect(() => {
    if (typeof localStorage === 'undefined') return;
    const saved = localStorage.getItem(APP_CONFIG.THEME_STORAGE_KEY);
    const theme = saved === THEMES.LIGHT || saved === THEMES.DARK ? saved : THEMES.DEFAULT;
    document.documentElement.setAttribute('data-theme', theme);
  }, []);
  return null;
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <head>
        <HeadContent />
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=0, interactive-widget=resizes-content" />
        <title>Rein Remote</title>
        <link rel="manifest" href="/manifest.json" />
      </head>
      <body className="bg-base-200 text-base-content overflow-hidden overscroll-none">
        <ThemeInit />
        <div className="flex flex-col h-[100dvh]">
          <Navbar />
          <main className="flex-1 overflow-hidden relative">
            {children}
          </main>
        </div>
        <Scripts />
      </body>
    </html>
  )
}

function Navbar() {
  return (
    <div className="navbar bg-base-100 border-b border-base-300 min-h-12 h-12 z-50 px-4">
      <div className="flex-1">
        <Link to="/trackpad" className="btn btn-ghost text-xl normal-case">Rein</Link>
      </div>
      <div className="flex-none flex gap-2">
        <Link
          to="/trackpad"
          className="btn btn-ghost btn-sm"
          activeProps={{ className: 'btn-active bg-base-200' }}
        >
          Trackpad
        </Link>
        <Link
          to="/settings"
          className="btn btn-ghost btn-sm"
          activeProps={{ className: 'btn-active bg-base-200' }}
        >
          Settings
        </Link>
      </div>
    </div>
  );
}
