"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { X } from "lucide-react";
import { getProductImages, hasBackDesign } from "@/lib/merch/product-images";
import type { CartItem, PrintfulProduct, PrintfulVariant } from "@/lib/merch/types";

type ProductModalProps = {
  product: PrintfulProduct;
  onClose: () => void;
  onAddToCart: (item: CartItem) => void;
};

function formatColorName(color: string): string {
  if (color.toLowerCase() === "cranberry") return "Cran-\nberry";
  return color;
}

export function ProductModal({ product: initialProduct, onClose, onAddToCart }: ProductModalProps) {
  const [selectedSize, setSelectedSize] = useState("");
  const [selectedColor, setSelectedColor] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(true);
  const [variants, setVariants] = useState<PrintfulVariant[]>([]);
  const [selectedVariant, setSelectedVariant] = useState<PrintfulVariant | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showingBack, setShowingBack] = useState(false);
  const [product, setProduct] = useState(initialProduct);

  useEffect(() => {
    if (product.sync_variants?.length) {
      setVariants(product.sync_variants);
      const defaultVariant = product.sync_variants[0];
      setSelectedColor(defaultVariant.color);
      setSelectedVariant(defaultVariant);
      setLoading(false);
      return;
    }

    const fetchVariants = async () => {
      try {
        const response = await fetch(`/api/printful/products/${product.id}`);
        if (!response.ok) throw new Error("Failed to fetch variants");
        const data = (await response.json()) as PrintfulProduct;
        setVariants(data.sync_variants ?? []);
        setProduct((current) => ({
          ...current,
          description: data.description ?? current.description,
        }));
        if (data.sync_variants?.length) {
          setSelectedColor(data.sync_variants[0].color);
          setSelectedVariant(data.sync_variants[0]);
        }
      } catch (fetchError) {
        setError(fetchError instanceof Error ? fetchError.message : "Failed to load variants");
      } finally {
        setLoading(false);
      }
    };

    fetchVariants();
  }, [product.id, product.sync_variants]);

  useEffect(() => {
    if (!selectedColor || !variants.length) return;
    const colorVariants = variants.filter((variant) => variant.color === selectedColor);
    if (colorVariants.length === 1) {
      setSelectedSize(colorVariants[0].size);
    } else {
      setSelectedSize("");
    }
    setSelectedVariant(colorVariants[0] ?? null);
  }, [selectedColor, variants]);

  const colors = Array.from(new Set(variants.map((variant) => variant.color)));
  const { frontImage, backImage } = getProductImages(product, selectedColor);
  const currentPrice = selectedVariant?.retail_price ? Number(selectedVariant.retail_price) : null;

  const handleAddToCart = () => {
    if (!selectedSize || !selectedColor) return;
    const specificVariant = variants.find(
      (variant) => variant.color === selectedColor && variant.size === selectedSize,
    );
    if (!specificVariant) return;

    onAddToCart({
      id: product.id,
      name: product.name,
      size: selectedSize,
      color: selectedColor,
      quantity,
      price: Number(specificVariant.retail_price),
      thumbnail_url: frontImage,
      sync_variant_id: specificVariant.id,
      variant_id: specificVariant.variant_id,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4">
      <div className="glass-panel max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl">
        <div className="p-6">
          <div className="mb-6 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold">{product.name}</h2>
              <p className="mt-1 font-mono text-accent-gold">
                {currentPrice ? `$${currentPrice.toFixed(2)}` : "Select options for price"}
              </p>
            </div>
            <button type="button" onClick={onClose} className="text-muted hover:text-foreground">
              <X className="h-6 w-6" />
            </button>
          </div>

          <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
            <div className="relative aspect-square overflow-hidden rounded-xl bg-bg-deep">
              <Image
                src={showingBack && backImage ? backImage : frontImage}
                alt={product.name}
                fill
                className="object-cover"
                sizes="(max-width: 768px) 100vw, 400px"
              />
              {hasBackDesign(product.name) && backImage ? (
                <button
                  type="button"
                  onClick={() => setShowingBack((current) => !current)}
                  className="absolute bottom-4 right-4 h-20 w-20 overflow-hidden rounded-lg border-2 border-accent-gold"
                >
                  <Image
                    src={showingBack ? frontImage : backImage}
                    alt={`${product.name} alternate view`}
                    fill
                    className="object-cover"
                    sizes="80px"
                  />
                </button>
              ) : null}
              {product.description ? (
                <p className="mt-4 text-sm text-muted">{product.description}</p>
              ) : null}
            </div>

            <div className="space-y-6">
              {loading ? (
                <p className="text-muted">Loading variants...</p>
              ) : error ? (
                <p className="text-red-400">{error}</p>
              ) : (
                <>
                  <div>
                    <h3 className="mb-2 text-xs uppercase tracking-wider text-muted">Color</h3>
                    <div className="grid grid-cols-3 gap-2">
                      {colors.map((color) => (
                        <button
                          key={color}
                          type="button"
                          className={`min-h-[52px] rounded-lg border px-3 py-2 text-sm ${
                            selectedColor === color
                              ? "border-accent-gold bg-accent-gold/10 text-accent-gold"
                              : "border-border bg-bg-deep text-muted hover:text-foreground"
                          }`}
                          onClick={() => setSelectedColor(color)}
                        >
                          <span className="whitespace-pre-line">{formatColorName(color)}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h3 className="mb-2 text-xs uppercase tracking-wider text-muted">Size</h3>
                    <div className="grid grid-cols-4 gap-2">
                      {Array.from(
                        new Set(
                          variants.filter((variant) => variant.color === selectedColor).map((variant) => variant.size),
                        ),
                      ).map((size) => (
                        <button
                          key={size}
                          type="button"
                          className={`min-h-[52px] rounded-lg border px-3 py-2 text-sm ${
                            selectedSize === size
                              ? "border-accent-gold bg-accent-gold/10 text-accent-gold"
                              : "border-border bg-bg-deep text-muted hover:text-foreground"
                          }`}
                          onClick={() => setSelectedSize(size)}
                        >
                          {size}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h3 className="mb-2 text-xs uppercase tracking-wider text-muted">Quantity</h3>
                    <div className="flex items-center gap-4">
                      <button
                        type="button"
                        className="rounded-lg border border-border px-3 py-2"
                        onClick={() => setQuantity((current) => Math.max(1, current - 1))}
                      >
                        -
                      </button>
                      <span>{quantity}</span>
                      <button
                        type="button"
                        className="rounded-lg border border-border px-3 py-2"
                        onClick={() => setQuantity((current) => current + 1)}
                      >
                        +
                      </button>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleAddToCart}
                    className="w-full rounded-xl bg-accent-purple py-3 font-medium text-white hover:bg-accent-purple/90"
                  >
                    Add to Cart
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
