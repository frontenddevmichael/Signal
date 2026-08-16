import { BrowserRouter, Route, Routes } from "react-router-dom";
import { useConvexAuth } from "@convex-dev/auth/react";
import { Loader } from "./components/Loader";
import { Shell } from "./components/Shell";
import { SignIn } from "./components/SignIn";
import { Toasts } from "./components/ui/Toasts";
import { ClientsList } from "./components/clients/ClientsList";
import { ClientDetail } from "./components/clients/ClientDetail";
import { SettingsPage } from "./components/settings/SettingsPage";
import { InvoicesList } from "./components/invoices/InvoicesList";
import { InvoiceDetail } from "./components/invoices/InvoiceDetail";
import { FollowUps } from "./components/FollowUps";
import { Inbox } from "./components/Inbox";
import { Portal } from "./components/Portal";
import { Calendar } from "./components/Calendar";
import { NotFound } from "./components/NotFound";

/**
 * Auth gate: full-page loader (tier-3, §22.13) while Convex Auth resolves,
 * then the routed, authenticated Shell or the SignIn screen.
 */
export default function App() {
  const { isAuthenticated, isLoading } = useConvexAuth();

  if (isLoading) return <Loader />;

  if (!isAuthenticated) {
    return (
      <Toasts>
        <BrowserRouter>
          <Routes>
            <Route path="/portal" element={<Portal />} />
            <Route path="*" element={<SignIn />} />
          </Routes>
        </BrowserRouter>
      </Toasts>
    );
  }

  return (
    <Toasts>
      <BrowserRouter>
        <Routes>
          <Route element={<Shell />}>
            <Route index element={<ClientsList />} />
            <Route path="clients/:contactId" element={<ClientDetail />} />
            <Route path="invoices" element={<InvoicesList />} />
            <Route path="invoices/:invoiceId" element={<InvoiceDetail />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="inbox" element={<Inbox />} />
            <Route path="followups" element={<FollowUps />} />
            {/* §22.7 — month view: project deadlines, follow-up and invoice due dates. */}
            <Route path="calendar" element={<Calendar />} />
            {/* §20.7 — signed-in /portal is the freelancer preview: mint a fresh
                link and see exactly what the client sees. Token-carrying links
                render the portal view regardless of auth. */}
            <Route path="portal" element={<Portal />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </Toasts>
  );
}
