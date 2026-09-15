import { FormEvent, useCallback, useEffect, useState } from "react";
import type { Role, User } from "../shared/types";
import { api } from "./api";
import { formatDateTime } from "./format";

interface SyncRun {
  kind: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  records_seen: number;
  records_changed: number;
  error_summary: string | null;
}

interface Integrations {
  catalogueBridgeConfigured: boolean;
  storefrontRefreshAvailable: boolean;
}

interface CatalogueSyncResult {
  recordsSeen: number;
  recordsChanged: number;
}

interface StorefrontSyncResult {
  recordsSeen: number;
  recordsChanged: number;
  refreshed: number;
  unavailable: number;
  nextCursor: string | null;
  done: boolean;
}

export function AdminPage({ currentUser }: { currentUser: User }) {
  const [users, setUsers] = useState<User[]>([]);
  const [runs, setRuns] = useState<SyncRun[]>([]);
  const [fixtureMode, setFixtureMode] = useState(false);
  const [integrations, setIntegrations] = useState<Integrations>({
    catalogueBridgeConfigured: false,
    storefrontRefreshAvailable: true,
  });
  const [error, setError] = useState<string | null>(null);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [syncing, setSyncing] = useState<"catalogue" | "storefront" | null>(null);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<Role>("viewer");

  const load = useCallback(async () => {
    try {
      const [userResult, syncResult] = await Promise.all([
        api<{ users: User[] }>("/api/admin/users"),
        api<{ runs: SyncRun[]; fixtureMode: boolean; integrations: Integrations }>("/api/admin/sync-status"),
      ]);
      setUsers(userResult.users);
      setRuns(syncResult.runs);
      setFixtureMode(syncResult.fixtureMode);
      setIntegrations(syncResult.integrations);
      setError(null);
    } catch (reason) {
      setError((reason as Error).message);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function syncCatalogue() {
    setSyncing("catalogue");
    setSyncMessage("Reading columns A and B from the configured Sheet tab…");
    setError(null);
    try {
      const result = await api<CatalogueSyncResult>("/api/admin/sync/catalogue", { method: "POST" });
      setSyncMessage(`Sheet sync complete: ${result.recordsSeen} products read, ${result.recordsChanged} changed.`);
      await load();
    } catch (reason) {
      setError((reason as Error).message);
      setSyncMessage(null);
    } finally {
      setSyncing(null);
    }
  }

  async function refreshStorefront() {
    setSyncing("storefront");
    setError(null);
    let after = "";
    let seen = 0;
    let changed = 0;
    let refreshed = 0;
    let unavailable = 0;
    try {
      for (;;) {
        setSyncMessage(`Refreshing storefront listings… ${seen} checked`);
        const result = await api<StorefrontSyncResult>("/api/admin/sync/storefront", {
          method: "POST",
          body: JSON.stringify({ after, limit: 8 }),
        });
        seen += result.recordsSeen;
        changed += result.recordsChanged;
        refreshed += result.refreshed;
        unavailable += result.unavailable;
        if (result.done) break;
        if (!result.nextCursor || result.nextCursor === after) throw new Error("Storefront refresh did not advance.");
        after = result.nextCursor;
      }
      setSyncMessage(
        `Storefront refresh complete: ${refreshed}/${seen} listings found, ${unavailable} unavailable, ${changed} changed.`,
      );
      await load();
    } catch (reason) {
      setError((reason as Error).message);
      setSyncMessage(null);
    } finally {
      setSyncing(null);
    }
  }

  async function addUser(event: FormEvent) {
    event.preventDefault();
    try {
      await api("/api/admin/users", {
        method: "POST",
        body: JSON.stringify({ email, displayName, role }),
      });
      setEmail("");
      setDisplayName("");
      setRole("viewer");
      await load();
    } catch (reason) {
      setError((reason as Error).message);
    }
  }

  async function updateUser(user: User, update: Partial<Pick<User, "role" | "active">>) {
    try {
      await api(`/api/admin/users/${encodeURIComponent(user.email)}`, {
        method: "PATCH",
        body: JSON.stringify({ role: update.role ?? user.role, active: update.active ?? user.active }),
      });
      await load();
    } catch (reason) {
      setError((reason as Error).message);
    }
  }

  return (
    <main className="page-shell">
      <section className="page-heading">
        <h1>Admin</h1>
      </section>

      {fixtureMode && <div className="notice notice--fixture"><strong>Local mode</strong> Login remains a fixture. Real Sheet and storefront data can be synced into the local database without deploying Backrooms.</div>}
      {error && <div className="notice notice--error">{error}</div>}
      {syncMessage && <div className="notice notice--success">{syncMessage}</div>}

      <section className="admin-section">
        <div className="section-title"><div><p className="eyebrow">Sources</p><h2>Sync status</h2></div><span className="status-chip">{integrations.catalogueBridgeConfigured ? "Sheet configured" : "Sheet setup needed"}</span></div>
        <div className="sync-actions">
          <button
            className="primary-button"
            type="button"
            disabled={!integrations.catalogueBridgeConfigured || syncing !== null}
            onClick={() => void syncCatalogue()}
          >{syncing === "catalogue" ? "Syncing Sheet…" : "Sync Sheet"}</button>
          <button
            className="secondary-button"
            type="button"
            disabled={!integrations.storefrontRefreshAvailable || syncing !== null}
            onClick={() => void refreshStorefront()}
          >{syncing === "storefront" ? "Refreshing listings…" : "Refresh storefront listings"}</button>
          {!integrations.catalogueBridgeConfigured && <small>Add the bridge URL and request secret to <code>.dev.vars</code>, then restart the local server.</small>}
        </div>
        <div className="sync-grid">
          {runs.map((run) => (
            <article className="sync-card" key={run.kind}>
              <span className={`metadata-dot metadata-dot--${run.status === "succeeded" ? "current" : "unavailable"}`} />
              <h3>{run.kind}</h3>
              <strong>{run.status}</strong>
              <p>{run.finished_at ? formatDateTime(run.finished_at) : "Still running"}</p>
              <small>{run.records_changed} changed · {run.records_seen} seen</small>
            </article>
          ))}
        </div>
      </section>

      <section className="admin-section">
        <div className="section-title"><div><p className="eyebrow">Access</p><h2>Whitelisted users</h2></div><span className="status-chip">{users.filter((user) => user.active).length} active</span></div>
        <form className="add-user-form" onSubmit={(event) => void addUser(event)}>
          <label><span>Name</span><input required value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Alex Smith" /></label>
          <label><span>Google email</span><input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="alex@example.com" /></label>
          <label><span>Role</span><select value={role} onChange={(event) => setRole(event.target.value as Role)}><option value="viewer">Viewer</option><option value="staff">Staff</option><option value="admin">Admin</option></select></label>
          <button className="primary-button" type="submit">Add user</button>
        </form>

        <div className="user-list">
          {users.map((user) => (
            <div className={`user-row ${user.active ? "" : "user-row--inactive"}`} key={user.email}>
              <div className="avatar" aria-hidden="true">{user.displayName.slice(0, 2).toUpperCase()}</div>
              <div className="user-identity"><strong>{user.displayName}</strong><span>{user.email}</span></div>
              <select aria-label={`Role for ${user.displayName}`} value={user.role} disabled={user.email === currentUser.email} onChange={(event) => void updateUser(user, { role: event.target.value as Role })}><option value="viewer">Viewer</option><option value="staff">Staff</option><option value="admin">Admin</option></select>
              <button className="text-button" disabled={user.email === currentUser.email} onClick={() => void updateUser(user, { active: !user.active })}>{user.active ? "Disable" : "Enable"}</button>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
