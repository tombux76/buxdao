"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { Loader2, ShoppingBag } from "lucide-react";
import { PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { CartSidebar } from "@/components/merch/cart-sidebar";
import { ProductModal } from "@/components/merch/product-modal";
import { WalletConnectButton } from "@/components/wallet/WalletConnectButton";
import { categorizeProduct, getProductImages } from "@/lib/merch/product-images";
import { MERCH_CATEGORIES } from "@/lib/merch/types";
import type {
  CartItem,
  MerchCategory,
  PrintfulProduct,
  ShippingFormState,
} from "@/lib/merch/types";

const PROJECT_WALLET = new PublicKey(
  process.env.NEXT_PUBLIC_PROJECT_WALLET || "FYfLzXckAf2JZoMYBz2W4fpF9vejqpA6UFV17d1A7C75",
);

const emptyShippingForm: ShippingFormState = {
  firstName: "",
  lastName: "",
  email: "",
  country: "",
  dialCode: "",
  phone: "",
  address1: "",
  address2: "",
  city: "",
  state: "",
  postalCode: "",
};

type PendingCheckout = {
  items: CartItem[];
  total: number;
  shippingInfo: ShippingFormState;
  solAmount: number;
  solPrice: number;
};

export function MerchStore() {
  const { publicKey, connected, sendTransaction } = useWallet();
  const { connection } = useConnection();

  const [products, setProducts] = useState<PrintfulProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<MerchCategory>("all");
  const [selectedProduct, setSelectedProduct] = useState<PrintfulProduct | null>(null);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [cartSidebarTab, setCartSidebarTab] = useState<"cart" | "orders">("cart");
  const [shippingForm, setShippingForm] = useState<ShippingFormState>(emptyShippingForm);
  const [shippingFormIsValid, setShippingFormIsValid] = useState(false);
  const [showingBackMap, setShowingBackMap] = useState<Record<number, boolean>>({});
  const [showTxSummary, setShowTxSummary] = useState(false);
  const [pendingCheckout, setPendingCheckout] = useState<PendingCheckout | null>(null);
  const [pendingPrintfulOrderId, setPendingPrintfulOrderId] = useState<number | null>(null);
  const [transactionStatus, setTransactionStatus] = useState<"pending" | "confirmed" | "failed" | null>(
    null,
  );
  const [thankYou, setThankYou] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const fetchProducts = async () => {
      try {
        const response = await fetch("/api/printful/products");
        if (!response.ok) throw new Error("Failed to fetch products");
        const data = (await response.json()) as PrintfulProduct[];
        const productsWithVariants: PrintfulProduct[] = [];

        for (let index = 0; index < data.length; index++) {
          const product = data[index];
          setLoadingProgress(Math.round(((index + 1) / data.length) * 100));
          await new Promise((resolve) => setTimeout(resolve, 50));

          try {
            const variantResponse = await fetch(`/api/printful/products/${product.id}`);
            if (!variantResponse.ok) {
              productsWithVariants.push({ ...product, sync_variants: [] });
              continue;
            }
            const variantData = (await variantResponse.json()) as PrintfulProduct;
            productsWithVariants.push({
              ...product,
              sync_variants: variantData.sync_variants ?? [],
            });
          } catch {
            productsWithVariants.push({ ...product, sync_variants: [] });
          }
        }

        if (isMounted) {
          setProducts(productsWithVariants);
          setLoading(false);
        }
      } catch (fetchError) {
        if (isMounted) {
          setError(fetchError instanceof Error ? fetchError.message : "Failed to load products");
          setLoading(false);
        }
      }
    };

    fetchProducts();
    return () => {
      isMounted = false;
    };
  }, []);

  const filteredProducts = useMemo(() => {
    if (activeCategory === "all") return products;
    return products.filter((product) => categorizeProduct(product) === activeCategory);
  }, [activeCategory, products]);

  const cartCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);

  const handleAddToCart = (product: CartItem) => {
    setCartItems((current) => {
      const existing = current.find((item) => item.id === product.id && item.size === product.size);
      if (existing) {
        return current.map((item) =>
          item.id === product.id && item.size === product.size
            ? { ...item, quantity: item.quantity + product.quantity }
            : item,
        );
      }
      return [...current, product];
    });
    setIsCartOpen(true);
  };

  const handleCheckout = async (items: CartItem[], total: number, shippingInfo: ShippingFormState) => {
    if (!publicKey) {
      alert("Connect your wallet before checkout.");
      return;
    }

    try {
      const printfulOrderResponse = await fetch("/api/printful/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shippingInfo,
          cart: items,
          email: shippingInfo.email,
          wallet_address: publicKey.toString(),
          skipPayment: true,
        }),
      });

      if (!printfulOrderResponse.ok) {
        const errorData = (await printfulOrderResponse.json()) as { error?: string };
        throw new Error(errorData.error || "Failed to place Printful order");
      }

      const printfulOrderData = (await printfulOrderResponse.json()) as { printful_order_id: number };
      setPendingPrintfulOrderId(printfulOrderData.printful_order_id);

      const solPriceResponse = await fetch("/api/sol-price");
      if (!solPriceResponse.ok) throw new Error("Failed to fetch SOL price");
      const { solPrice } = (await solPriceResponse.json()) as { solPrice: number };
      if (!solPrice || Number.isNaN(solPrice)) throw new Error("Invalid SOL price received");

      setPendingCheckout({
        items,
        total,
        shippingInfo,
        solAmount: total / solPrice,
        solPrice,
      });
      setShowTxSummary(true);
    } catch (checkoutError) {
      alert(checkoutError instanceof Error ? checkoutError.message : "Checkout failed");
    }
  };

  const handleConfirmPayment = async () => {
    if (!pendingCheckout || !pendingPrintfulOrderId || !publicKey || !connected) return;

    setShowTxSummary(false);
    setTransactionStatus("pending");

    try {
      const lamports = Math.round(pendingCheckout.solAmount * 1e9);
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: publicKey,
          toPubkey: PROJECT_WALLET,
          lamports,
        }),
      );

      const signature = await sendTransaction(transaction, connection);
      await connection.confirmTransaction(signature, "confirmed");

      const finalizeResponse = await fetch("/api/printful/order/pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          printful_order_id: pendingPrintfulOrderId,
          txSignature: signature,
          wallet_address: publicKey.toString(),
          cart: pendingCheckout.items,
          shippingInfo: pendingCheckout.shippingInfo,
        }),
      });

      if (!finalizeResponse.ok) {
        const errorData = (await finalizeResponse.json()) as { error?: string };
        throw new Error(errorData.error || "Order finalization failed");
      }

      setCartItems([]);
      setTransactionStatus("confirmed");
      setThankYou(true);
    } catch (paymentError) {
      setTransactionStatus("failed");
      alert(paymentError instanceof Error ? paymentError.message : "Payment failed");
    }
  };

  if (thankYou) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="glass-panel max-w-md rounded-2xl p-8 text-center">
          <h2 className="text-2xl font-bold">Thank you for your order!</h2>
          <p className="mt-3 text-muted">
            We received your SOL payment and will process your Printful order soon.
          </p>
          <button
            type="button"
            className="mt-6 w-full rounded-xl bg-accent-purple py-3 font-medium text-white"
            onClick={() => {
              setThankYou(false);
              setIsCartOpen(true);
              setCartSidebarTab("orders");
            }}
          >
            View My Orders
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 text-muted">
        <Loader2 className="h-8 w-8 animate-spin text-accent-purple" />
        <p>Loading merch catalog… {loadingProgress}%</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-6 text-red-300">
        Failed to load merch store: {error}
      </div>
    );
  }

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {MERCH_CATEGORIES.map((category) => (
            <button
              key={category.key}
              type="button"
              onClick={() => setActiveCategory(category.key)}
              className={`rounded-lg border px-3 py-1.5 text-xs transition ${
                activeCategory === category.key
                  ? "border-accent-gold bg-accent-gold/10 text-accent-gold"
                  : "border-border bg-bg-surface text-muted hover:text-foreground"
              }`}
            >
              {category.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <WalletConnectButton className="rounded-xl border border-border bg-bg-surface px-3 py-2 text-sm" />
          <button
            type="button"
            onClick={() => setIsCartOpen(true)}
            className="relative rounded-xl border border-border bg-bg-surface px-3 py-2 text-sm"
          >
            <ShoppingBag className="h-4 w-4" />
            {cartCount > 0 ? (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent-purple px-1 text-[10px] text-white">
                {cartCount}
              </span>
            ) : null}
          </button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filteredProducts.map((product) => {
          const defaultColor = product.sync_variants?.[0]?.color ?? "black";
          const { frontImage, backImage } = getProductImages(product, defaultColor);
          const showingBack = showingBackMap[product.id];
          const minPrice = product.sync_variants?.length
            ? Math.min(...product.sync_variants.map((variant) => Number(variant.retail_price)))
            : null;

          return (
            <button
              key={product.id}
              type="button"
              onClick={() => setSelectedProduct(product)}
              className="tile-border overflow-hidden rounded-2xl bg-bg-surface text-left transition hover:ring-1 hover:ring-accent-gold/30"
            >
              <div className="relative aspect-square bg-bg-deep">
                <Image
                  src={showingBack && backImage ? backImage : frontImage}
                  alt={product.name}
                  fill
                  className="object-cover"
                  sizes="(max-width: 768px) 100vw, 33vw"
                />
                {backImage ? (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      setShowingBackMap((current) => ({
                        ...current,
                        [product.id]: !current[product.id],
                      }));
                    }}
                    className="absolute bottom-3 right-3 rounded-md border border-accent-gold/50 bg-black/60 px-2 py-1 text-[10px] uppercase tracking-wider text-accent-gold"
                  >
                    {showingBack ? "Front" : "Back"}
                  </button>
                ) : null}
              </div>
              <div className="p-4">
                <h3 className="font-semibold">{product.name}</h3>
                <p className="mt-1 font-mono text-sm text-accent-gold">
                  {minPrice ? `From $${minPrice.toFixed(2)}` : "View options"}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {selectedProduct ? (
        <ProductModal
          product={selectedProduct}
          onClose={() => setSelectedProduct(null)}
          onAddToCart={handleAddToCart}
        />
      ) : null}

      <CartSidebar
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        items={cartItems}
        onUpdateQuantity={(item, quantity) =>
          setCartItems((current) =>
            current.map((entry) =>
              entry.id === item.id && entry.size === item.size ? { ...entry, quantity } : entry,
            ),
          )
        }
        onRemoveItem={(item) =>
          setCartItems((current) =>
            current.filter((entry) => !(entry.id === item.id && entry.size === item.size)),
          )
        }
        onCheckout={handleCheckout}
        shippingForm={shippingForm}
        setShippingForm={setShippingForm}
        shippingFormIsValid={shippingFormIsValid}
        setShippingFormIsValid={setShippingFormIsValid}
        activeTab={cartSidebarTab}
        setActiveTab={setCartSidebarTab}
      />

      {showTxSummary && pendingCheckout ? (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 p-4">
          <div className="glass-panel max-w-md rounded-2xl p-6">
            <h3 className="text-xl font-bold">Confirm SOL Payment</h3>
            <div className="mt-4 space-y-2 text-sm text-muted">
              <p>Total: ${pendingCheckout.total.toFixed(2)} USD</p>
              <p>SOL price: ${pendingCheckout.solPrice.toFixed(2)}</p>
              <p className="font-mono text-accent-gold">
                Amount: {pendingCheckout.solAmount.toFixed(4)} SOL
              </p>
              <p className="break-all text-xs">Send to: {PROJECT_WALLET.toString()}</p>
            </div>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                className="flex-1 rounded-xl border border-border py-3"
                onClick={() => setShowTxSummary(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="flex-1 rounded-xl bg-accent-purple py-3 font-medium text-white"
                onClick={handleConfirmPayment}
                disabled={transactionStatus === "pending"}
              >
                {transactionStatus === "pending" ? "Processing…" : "Confirm & Pay"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
