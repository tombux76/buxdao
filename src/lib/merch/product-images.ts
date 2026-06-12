import type { MerchCategory } from "@/lib/merch/types";
import type { PrintfulProduct } from "@/lib/merch/types";

export function hasBackDesign(productName: string): boolean {
  const name = productName.toLowerCase();
  return (
    (name.includes("fcked catz") || name.includes("bitbots") || name.includes("monsters")) &&
    (name.includes("t-shirt") || name.includes("hoodie"))
  );
}

export function getProductImages(
  product: Pick<PrintfulProduct, "name" | "thumbnail_url">,
  selectedColor?: string | null,
) {
  const productName = product.name.toLowerCase();
  const color = selectedColor?.toLowerCase().replace(/ /g, "-") || "black";

  if (hasBackDesign(productName)) {
    let collection = "";
    if (productName.includes("fcked catz")) collection = "catz";
    else if (productName.includes("bitbots")) collection = "bitbots";
    else if (productName.includes("monsters")) collection = "monsters";

    const type = productName.includes("t-shirt") ? "tees" : "hoodies";
    return {
      frontImage: `/merch/${collection}/${type}/${color}-front.jpg`,
      backImage: `/merch/${collection}/${type}/${color}-back.jpg`,
    };
  }

  if (productName.includes("bux")) {
    if (productName.includes("t-shirt") || productName.includes("tee")) {
      return { frontImage: `/merch/bux/tees/${color}.jpg`, backImage: null };
    }
    if (productName.includes("hoodie")) {
      return { frontImage: `/merch/bux/hoodies/${color}.jpg`, backImage: null };
    }
    if (productName.includes("dad hat")) {
      return { frontImage: `/merch/bux/dad hat/${color}.jpg`, backImage: null };
    }
    if (productName.includes("beanie")) {
      return { frontImage: `/merch/bux/beanie/${color}.jpg`, backImage: null };
    }
    if (productName.includes("flat") || productName.includes("bill")) {
      return { frontImage: `/merch/bux/flat bill/${color}.jpg`, backImage: null };
    }
  }

  return {
    frontImage: product.thumbnail_url || "/brand/buxdao-logo-wordmark.png",
    backImage: null,
  };
}

export function categorizeProduct(product: Pick<PrintfulProduct, "name">): MerchCategory | "other" {
  const name = product.name.toLowerCase();
  if (name.includes("hat") || name.includes("cap") || name.includes("beanie")) return "hats";
  if (name.includes("hoodie")) return "hoodies";
  if (name.includes("t-shirt")) return "tshirts";
  return "other";
}
