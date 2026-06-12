"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { X } from "lucide-react";
import { useWallet } from "@solana/wallet-adapter-react";
import { ShippingForm } from "@/components/merch/shipping-form";
import type { CartItem, MerchOrder, ShippingFormState } from "@/lib/merch/types";

type CartSidebarProps = {
  isOpen: boolean;
  onClose: () => void;
  items: CartItem[];
  onUpdateQuantity: (item: CartItem, quantity: number) => void;
  onRemoveItem: (item: CartItem) => void;
  onCheckout: (items: CartItem[], total: number, shippingInfo: ShippingFormState) => void;
  shippingForm: ShippingFormState;
  setShippingForm: React.Dispatch<React.SetStateAction<ShippingFormState>>;
  shippingFormIsValid: boolean;
  setShippingFormIsValid: (valid: boolean) => void;
  activeTab: "cart" | "orders";
  setActiveTab: (tab: "cart" | "orders") => void;
};

function parseCart(order: MerchOrder): CartItem[] {
  if (Array.isArray(order.cart)) return order.cart;
  if (typeof order.cart === "string") {
    try {
      return JSON.parse(order.cart) as CartItem[];
    } catch {
      return [];
    }
  }
  return [];
}

export function CartSidebar({
  isOpen,
  onClose,
  items,
  onUpdateQuantity,
  onRemoveItem,
  onCheckout,
  shippingForm,
  setShippingForm,
  shippingFormIsValid,
  setShippingFormIsValid,
  activeTab,
  setActiveTab,
}: CartSidebarProps) {
  const { publicKey } = useWallet();
  const [orders, setOrders] = useState<MerchOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersError, setOrdersError] = useState<string | null>(null);

  const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  useEffect(() => {
    const fetchOrders = async () => {
      if (activeTab !== "orders" || !publicKey) return;
      setOrdersLoading(true);
      setOrdersError(null);
      try {
        const response = await fetch(`/api/printful/order/${publicKey.toString()}`);
        if (!response.ok) throw new Error("Failed to fetch orders");
        const data = (await response.json()) as { orders?: MerchOrder[] };
        setOrders(data.orders ?? []);
      } catch (error) {
        setOrdersError(error instanceof Error ? error.message : "Failed to fetch orders");
      } finally {
        setOrdersLoading(false);
      }
    };

    fetchOrders();
  }, [activeTab, publicKey]);

  return (
    <div
      className={`fixed inset-y-0 right-0 z-[90] w-full transform border-l border-border bg-bg-elevated shadow-2xl transition-transform duration-300 sm:w-96 ${
        isOpen ? "translate-x-0" : "translate-x-full"
      }`}
    >
      <div className="flex h-full flex-col">
        <div className="border-b border-border p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex rounded-lg border border-border p-1 text-xs">
              <button
                type="button"
                className={`rounded-md px-3 py-1.5 ${activeTab === "cart" ? "bg-accent-purple/20 text-foreground" : "text-muted"}`}
                onClick={() => setActiveTab("cart")}
              >
                Cart
              </button>
              <button
                type="button"
                className={`rounded-md px-3 py-1.5 ${activeTab === "orders" ? "bg-accent-purple/20 text-foreground" : "text-muted"}`}
                onClick={() => setActiveTab("orders")}
                disabled={!publicKey}
              >
                My Orders
              </button>
            </div>
            <button type="button" onClick={onClose} className="text-muted hover:text-foreground">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {activeTab === "cart" ? (
            items.length === 0 ? (
              <p className="py-12 text-center text-muted">Your cart is empty</p>
            ) : (
              <div className="space-y-6">
                <div className="space-y-4">
                  {items.map((item) => (
                    <div key={`${item.id}-${item.size}`} className="flex gap-3">
                      <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-bg-deep">
                        <Image src={item.thumbnail_url} alt={item.name} fill className="object-cover" sizes="80px" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="font-medium">{item.name}</h3>
                        <p className="text-xs text-muted">
                          {item.color} · Size {item.size}
                        </p>
                        <div className="mt-2 flex items-center gap-2 text-sm">
                          <button type="button" onClick={() => onUpdateQuantity(item, Math.max(1, item.quantity - 1))}>
                            -
                          </button>
                          <span>{item.quantity}</span>
                          <button type="button" onClick={() => onUpdateQuantity(item, item.quantity + 1)}>
                            +
                          </button>
                          <button
                            type="button"
                            className="ml-2 text-red-400"
                            onClick={() => onRemoveItem(item)}
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <ShippingForm
                  form={shippingForm}
                  setForm={setShippingForm}
                  isValid={shippingFormIsValid}
                  setIsValid={setShippingFormIsValid}
                />
              </div>
            )
          ) : !publicKey ? (
            <p className="py-12 text-center text-muted">Connect your wallet to view orders.</p>
          ) : ordersLoading ? (
            <p className="py-12 text-center text-muted">Loading orders...</p>
          ) : ordersError ? (
            <p className="py-12 text-center text-red-400">{ordersError}</p>
          ) : orders.length === 0 ? (
            <p className="py-12 text-center text-muted">No orders found.</p>
          ) : (
            <div className="space-y-4">
              {orders.map((order) => (
                <div key={order.id} className="rounded-xl border border-border bg-bg-surface p-4">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="font-semibold">Order #{order.id}</span>
                    <span className="text-xs text-muted">
                      {new Date(order.created_at).toLocaleString()}
                    </span>
                  </div>
                  <p className="mb-2 text-sm text-muted">
                    Status: <span className="text-foreground">{order.status}</span>
                  </p>
                  <div className="space-y-1 text-xs text-muted">
                    {parseCart(order).map((item, index) => (
                      <div key={`${order.id}-${index}`}>
                        {item.name} ({item.size}) x{item.quantity} - ${item.price}
                      </div>
                    ))}
                  </div>
                  {order.tx_signature ? (
                    <a
                      href={`https://solscan.io/tx/${order.tx_signature}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-block text-xs text-accent-cyan hover:underline"
                    >
                      View transaction
                    </a>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>

        {activeTab === "cart" && items.length > 0 ? (
          <div className="border-t border-border p-4">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-muted">Subtotal</span>
              <span className="font-mono">${total.toFixed(2)}</span>
            </div>
            <button
              type="button"
              onClick={() => onCheckout(items, total, shippingForm)}
              disabled={!shippingFormIsValid}
              className="w-full rounded-xl bg-accent-purple py-3 font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              Checkout with SOL
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
