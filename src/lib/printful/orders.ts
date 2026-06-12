import { getCountryCode, getStateCode } from "@/lib/printful/geo";
import { printfulFetch } from "@/lib/printful/client";

export type ShippingInfo = {
  firstName: string;
  lastName: string;
  email: string;
  country: string;
  phone?: string;
  address1: string;
  address2?: string;
  city: string;
  state: string;
  postalCode: string;
};

export type CartItem = {
  name: string;
  quantity: number;
  price: number;
  sync_variant_id?: number;
  variant_id?: number;
};

export async function createPrintfulOrder(shippingInfo: ShippingInfo, cart: CartItem[]) {
  const mappedCountry = getCountryCode(shippingInfo.country);

  const recipient = {
    name: `${shippingInfo.firstName} ${shippingInfo.lastName}`,
    address1: shippingInfo.address1,
    address2: shippingInfo.address2 || null,
    city: shippingInfo.city,
    state_code: mappedCountry === "US" ? getStateCode(shippingInfo.state) : shippingInfo.state,
    country_code: mappedCountry,
    zip: shippingInfo.postalCode,
    phone: shippingInfo.phone || null,
    email: shippingInfo.email,
  };

  const items = cart.map((item) => {
    const orderItem: Record<string, string | number> = {
      quantity: item.quantity,
      retail_price: item.price.toString(),
    };

    if (item.sync_variant_id) {
      orderItem.sync_variant_id = item.sync_variant_id;
    } else if (item.variant_id) {
      orderItem.variant_id = item.variant_id;
    } else {
      throw new Error(`No variant ID found for item: ${item.name}`);
    }

    return orderItem;
  });

  return printfulFetch<{ id: number }>("/orders", {
    method: "POST",
    body: JSON.stringify({
      recipient,
      items,
      shipping: "STANDARD",
      notes: "BUXDAO Merch Order - Paid with SOL",
    }),
  });
}
