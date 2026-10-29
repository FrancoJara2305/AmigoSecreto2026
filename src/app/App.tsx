import { lazy, Suspense, useEffect } from 'react';
import { createBrowserRouter, Link, Outlet, RouterProvider, useLocation } from 'react-router';
import { CataloguePage } from '../pages/CataloguePage';
import { AppLayout } from '../components/layout/AppLayout';
import { LoadingState } from '../components/ui/Feedback';

const DesignPreview = lazy(() => import('../pages/DesignPreview').then((module) => ({ default: module.DesignPreview })));
const ParticipantProfilePage = lazy(() => import('../pages/ParticipantProfilePage').then((module) => ({ default: module.ParticipantProfilePage })));
const PrivateAccessPage = lazy(() => import('../pages/PrivateAccessPage').then((module) => ({ default: module.PrivateAccessPage })));
const PrivateDestinationPage = lazy(() => import('../pages/PrivateDestinationPage').then((module) => ({ default: module.PrivateDestinationPage })));
const GiftEditorPage = lazy(() => import('../pages/GiftEditorPage').then((module) => ({ default: module.GiftEditorPage })));
function AnchorNavigation() {
  const { pathname, hash, key } = useLocation();
  useEffect(() => {
    if (!hash) return;
    const target = document.getElementById(hash.slice(1));
    if (target) { target.scrollIntoView(); if (hash === '#participantes') document.getElementById('participants-title')?.focus({ preventScroll: true }); }
  }, [pathname, hash, key]);
  return null;
}
function RootRoute() {
  return <><AnchorNavigation /><Suspense fallback={<LoadingState />}><Outlet /></Suspense></>;
}
let router: ReturnType<typeof createBrowserRouter> | undefined;
export function App() {
  // Lazy initialization is after initializePrivateAccess(), so router state never captures the token.
  router ??= createBrowserRouter([{ element: <RootRoute />, children: [
    { path: '/', element: <CataloguePage /> },
    { path: '/participante/:slug', element: <ParticipantProfilePage /> },
    { path: '/acceso', element: <PrivateAccessPage type="participant" /> },
    { path: '/organizador/acceso', element: <PrivateAccessPage type="organizer" /> },
    { path: '/organizador', element: <PrivateDestinationPage mode="organizer" /> },
    { path: '/participante/:slug/editar', element: <PrivateDestinationPage mode="profile" /> },
    { path: '/participante/:slug/regalo/:position/editar', element: <GiftEditorPage /> },
    { path: '/diseno', element: <DesignPreview /> },
    { path: '*', element: <AppLayout><section className="profile-pending page-width"><h1>No encontramos esta página.</h1><Link className="text-link" to="/">Volver a participantes</Link></section></AppLayout> },
  ] }]);
  return <RouterProvider router={router} />;
}
