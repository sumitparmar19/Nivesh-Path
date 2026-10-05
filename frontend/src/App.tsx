// App shell: TanStack Query, the router (lazy-loaded pages), the auth guard and toasts.
import { lazy, Suspense, type ReactNode } from "react";
import { createBrowserRouter, Navigate, Outlet, RouterProvider, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppLayout, PublicLayout } from "./components/Layout";
import Toasts from "./components/Toasts";
import { Spinner } from "./components/ui";
import { useStore } from "./store/useStore";

const Login = lazy(() => import("./pages/Login"));
const Register = lazy(() => import("./pages/Register"));
const Portfolio = lazy(() => import("./pages/Portfolio"));
const Transactions = lazy(() => import("./pages/Transactions"));
const Advisor = lazy(() => import("./pages/Advisor"));
const StockDetail = lazy(() => import("./pages/StockDetail"));
const Markets = lazy(() => import("./pages/Markets"));
const Watchlist = lazy(() => import("./pages/Watchlist"));
const Account = lazy(() => import("./pages/Account"));
const WhatsNew = lazy(() => import("./pages/WhatsNew"));
const Landing = lazy(() => import("./pages/Landing"));
const About = lazy(() => import("./pages/About"));
const Contact = lazy(() => import("./pages/Contact"));
const NotFound = lazy(() => import("./pages/NotFound"));

export const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 60_000, retry: 1, refetchOnWindowFocus: false } },
});

const page = (node: ReactNode) => <Suspense fallback={<Spinner />}>{node}</Suspense>;

/** Signed-in pages: unauthenticated visitors go to /login and come back afterwards. */
export function RequireAuth() {
  const isAuthenticated = useStore((s) => s.isAuthenticated);
  const location = useLocation();
  if (!isAuthenticated) {
    return <Navigate to={`/login?redirect=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  }
  return <Outlet />;
}

export const routes = [
  { path: "/login", element: page(<Login />) },
  { path: "/register", element: page(<Register />) },
  {
    element: <PublicLayout />,
    children: [
      { path: "/", element: page(<Landing />) },
      { path: "/about", element: page(<About />) },
      { path: "/contact", element: page(<Contact />) },
    ],
  },
  {
    element: <AppLayout />,
    children: [
      // Public inside the app frame: anyone can browse stocks and release notes.
      { path: "/markets", element: page(<Markets />) },
      { path: "/stock/:symbol", element: page(<StockDetail />) },
      { path: "/whats-new", element: page(<WhatsNew />) },
      {
        element: <RequireAuth />,
        children: [
          { path: "/portfolio", element: page(<Portfolio />) },
          { path: "/transactions", element: page(<Transactions />) },
          { path: "/advisor", element: page(<Advisor />) },
          { path: "/watchlist", element: page(<Watchlist />) },
          { path: "/account", element: page(<Account />) },
        ],
      },
    ],
  },
  { path: "*", element: page(<PublicLayout><NotFound /></PublicLayout>) },
];

const router = createBrowserRouter(routes, { future: { v7_relativeSplatPath: true, v7_fetcherPersist: true, v7_normalizeFormMethod: true, v7_partialHydration: true, v7_skipActionErrorRevalidation: true } });

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} future={{ v7_startTransition: true }} />
      <Toasts />
    </QueryClientProvider>
  );
}
