export type PrintfulVariant = {
  id: number;
  variant_id?: number;
  color: string;
  size: string;
  retail_price: string;
};

export type PrintfulProduct = {
  id: number;
  name: string;
  thumbnail_url?: string;
  description?: string;
  sync_variants?: PrintfulVariant[];
};

export type CartItem = {
  id: number;
  name: string;
  size: string;
  color: string;
  quantity: number;
  price: number;
  thumbnail_url: string;
  sync_variant_id: number;
  variant_id?: number;
};

export type ShippingFormState = {
  firstName: string;
  lastName: string;
  email: string;
  country: string;
  dialCode: string;
  phone: string;
  address1: string;
  address2: string;
  city: string;
  state: string;
  postalCode: string;
};

export type MerchOrder = {
  id: number;
  wallet_address: string;
  tx_signature?: string;
  cart: CartItem[] | string;
  shipping_info: ShippingFormState | string;
  status: string;
  printful_order_id?: number;
  created_at: string;
};

export type MerchCategory = "all" | "hats" | "hoodies" | "tshirts";

export const MERCH_CATEGORIES: { key: MerchCategory; label: string }[] = [
  { key: "all", label: "All Products" },
  { key: "hats", label: "Hats & Caps" },
  { key: "hoodies", label: "Hoodies" },
  { key: "tshirts", label: "T-Shirts" },
];
