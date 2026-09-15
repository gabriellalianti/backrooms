import { useEffect, useState } from "react";
import type { User } from "../shared/types";
import { AdminPage } from "./AdminPage";
import { api, ApiError } from "./api";
import { CataloguePage } from "./CataloguePage";
import { formatRole } from "./format";
import { OrdersPage } from "./OrdersPage";

type Page = "catalogue" | "orders" | "admin";

export function App() {
  const [page, setPage] = useState<Page>("catalogue");
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fixtureMode, setFixtureMode] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const authError = new URLSearchParams(window.location.search).get("auth_error");
    const authMessages: Record<string, string> = {
      cancelled: "Google sign-in was cancelled.",
      invalid_callback: "That sign-in attempt expired. Please try again.",
      not_whitelisted: "This Google account is not on the Backrooms allowlist.",
      failed: "Google sign-in could not be completed. Please try again.",
    };
    if (authError) {
      setError(authMessages[authError] ?? "Google sign-in could not be completed.");
      window.history.replaceState({}, "", window.location.pathname);
    }
    api<{ user: User; fixtureMode: boolean }>("/api/session")
      .then((result) => {
        setUser(result.user);
        setFixtureMode(result.fixtureMode);
        setError(null);
      })
      .catch((reason: Error) => {
        if (!(reason instanceof ApiError) || reason.status !== 401) setError(reason.message);
      })
      .finally(() => setLoading(false));
  }, []);

  async function logout() {
    try {
      await api("/api/logout", { method: "POST" });
    } finally {
      window.location.assign("/");
    }
  }

  if (loading) return <div className="auth-screen"><h1>Backrooms</h1><p>Checking your access…</p></div>;
  if (!user) return (
    <div className="auth-screen">
      <h1>Backrooms</h1>
      <p>{error ?? "Sign in with a whitelisted Google account."}</p>
      <a className="primary-button auth-button" href="/auth/google">Sign in with Google</a>
    </div>
  );

  const pages: Array<{ id: Page; label: string; wip?: boolean }> = [
    { id: "catalogue", label: "Catalogue" },
    { id: "orders", label: "Pickup orders", wip: true },
    ...(user.role === "admin" ? [{ id: "admin" as const, label: "Admin" }] : []),
  ];

  return (
    <div className="app">
      <header className="site-header">
        <button className="wordmark" onClick={() => setPage("catalogue")}><span><strong>Backrooms</strong><small>CREATE sales</small></span></button>
        <nav aria-label="Main navigation">
          {pages.map((item) => (
            <button key={item.id} className={page === item.id ? "active" : ""} onClick={() => setPage(item.id)}>
              {item.label}{item.wip && <span className="nav-wip">WIP</span>}
            </button>
          ))}
        </nav>
        <div className="signed-in">
          <div className="signed-in__identity"><span>{user.displayName}</span><small>{formatRole(user.role)}</small></div>
          {!fixtureMode && <button className="sign-out-button" onClick={() => void logout()}>Sign out</button>}
        </div>
      </header>
      {page === "catalogue" && <CataloguePage />}
      {page === "orders" && <OrdersPage role={user.role} />}
      {page === "admin" && user.role === "admin" && <AdminPage currentUser={user} />}
    </div>
  );
}
