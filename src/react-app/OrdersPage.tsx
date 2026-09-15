import { useCallback, useEffect, useMemo, useState } from "react";
import type { CollectionState, Order, Role } from "../shared/types";
import { compareByLocker } from "../shared/sorting";
import { api } from "./api";
import { formatDateOnly, formatDateTime, formatMoney } from "./format";
import { ProductImage } from "./ProductImage";

type Filter = "pending" | "collected" | "all";

export function OrdersPage({ role }: { role: Role }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [filter, setFilter] = useState<Filter>("pending");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyOrder, setBusyOrder] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await api<{ orders: Order[] }>("/api/orders");
      setOrders(result.orders);
      setError(null);
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visibleOrders = useMemo(
    () =>
      orders.filter(
        (order) => filter === "all" || order.collectionState === filter,
      ),
    [filter, orders],
  );

  async function transition(order: Order, target: CollectionState) {
    const verb =
      target === "collected"
        ? "mark this order collected"
        : "reopen this order";
    if (!window.confirm(`Are you sure you want to ${verb}?`)) return;
    setBusyOrder(order.id);
    try {
      await api(
        `/api/orders/${encodeURIComponent(order.id)}/${target === "collected" ? "collect" : "reopen"}`,
        {
          method: "POST",
          body: JSON.stringify({ version: order.version }),
        },
      );
      await load();
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusyOrder(null);
    }
  }

  const canUpdate = role === "staff" || role === "admin";

  return (
    <main className="page-shell">
      <section className="page-heading">
        <h1>Pickup orders</h1>
        <div className="count-badge count-badge--dark">
          <strong>
            {
              orders.filter((order) => order.collectionState === "pending")
                .length
            }
          </strong>
          <span>pending</span>
        </div>
      </section>

      <div className="notice notice--wip">
        <strong>Work in progress</strong>
        <span>Not implemented yet (ignore this page for now).</span>
      </div>

      <div
        className="segmented-control"
        role="group"
        aria-label="Filter orders"
      >
        {(["pending", "collected", "all"] as const).map((value) => (
          <button
            key={value}
            className={filter === value ? "active" : ""}
            onClick={() => setFilter(value)}
          >
            {value[0].toUpperCase() + value.slice(1)}
          </button>
        ))}
      </div>

      {loading && <div className="notice">Loading pickup orders…</div>}
      {error && <div className="notice notice--error">{error}</div>}
      {!loading && !error && visibleOrders.length === 0 && (
        <div className="empty-state">
          <strong>No {filter === "all" ? "" : filter} orders</strong>
          <span>You’re all caught up.</span>
        </div>
      )}

      <section className="orders-list">
        {visibleOrders.map((order) => {
          const sortedItems = [...order.items].sort((a, b) =>
            compareByLocker(
              a.product?.location,
              b.product?.location,
              a.product?.name ?? a.rawName,
              b.product?.name ?? b.rawName,
            ),
          );

          return (
            <article
              className={`order-card order-card--${order.collectionState}`}
              key={order.id}
            >
              <header className="order-card__header">
                <div>
                  <p className="eyebrow">Order</p>
                  <h2>#{order.id}</h2>
                </div>
                <div className="order-meta">
                  <span>{formatDateOnly(order.dateAdded)}</span>
                  <span
                    className={`state-pill state-pill--${order.collectionState}`}
                  >
                    {order.collectionState}
                  </span>
                </div>
              </header>

              {order.comments && (
                <aside className="order-comment">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M5 18.5 3.5 22v-5A9 9 0 1 1 8 20.5" />
                  </svg>
                  <div>
                    <strong>Order comment</strong>
                    <p>{order.comments}</p>
                  </div>
                </aside>
              )}

              <div className="order-items">
                {sortedItems.map((item) => (
                  <div className="order-item" key={item.id}>
                    <ProductImage product={item.product} compact />
                    <div className="order-item__name">
                      <strong>
                        <span className="quantity">{item.quantity}×</span>{" "}
                        {item.product?.name ?? item.rawName}
                      </strong>
                      {item.matchStatus === "unmatched" ||
                      item.matchStatus === "ambiguous" ? (
                        <span className="match-warning">
                          {item.matchStatus} product
                        </span>
                      ) : item.rawName !== item.product?.name ? (
                        <small>Email: {item.rawName}</small>
                      ) : null}
                    </div>
                    <div className="order-item__fact">
                      <span>Locker</span>
                      <strong className="location">
                        {item.product?.location ?? "N/A"}
                      </strong>
                    </div>
                    <div className="order-item__fact">
                      <span>Line total</span>
                      <strong>{formatMoney(item.lineTotalCents)}</strong>
                    </div>
                  </div>
                ))}
              </div>

              <footer className="order-card__footer">
                <div>
                  {order.collectionState === "collected" &&
                  order.collectedAt ? (
                    <span>
                      Collected by <strong>{order.collectedBy}</strong> ·{" "}
                      {formatDateTime(order.collectedAt)}
                    </span>
                  ) : (
                    <span>
                      {order.items.length} component{" "}
                      {order.items.length === 1 ? "line" : "lines"}
                    </span>
                  )}
                </div>
                {canUpdate && (
                  <button
                    className={
                      order.collectionState === "pending"
                        ? "primary-button"
                        : "secondary-button"
                    }
                    disabled={busyOrder === order.id}
                    onClick={() =>
                      void transition(
                        order,
                        order.collectionState === "pending"
                          ? "collected"
                          : "pending",
                      )
                    }
                  >
                    {busyOrder === order.id
                      ? "Saving…"
                      : order.collectionState === "pending"
                        ? "Mark collected"
                        : "Reopen order"}
                  </button>
                )}
              </footer>

              {order.events.length > 0 && (
                <details className="audit-log">
                  <summary>Audit history ({order.events.length})</summary>
                  <ul>
                    {order.events.map((event) => (
                      <li key={event.id}>
                        <strong>{event.action}</strong> by {event.actorEmail} ·{" "}
                        {formatDateTime(event.createdAt)}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </article>
          );
        })}
      </section>
    </main>
  );
}
