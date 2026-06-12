const PRINTFUL_API_URL = "https://api.printful.com";

function getPrintfulApiKey(): string {
  const apiKey = process.env.PRINTFUL_API_KEY;
  if (!apiKey) {
    throw new Error("Printful API key is not configured");
  }
  return apiKey;
}

export async function printfulFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${PRINTFUL_API_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${getPrintfulApiKey()}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Printful request failed: ${response.status}`);
  }

  const data = (await response.json()) as { result: T };
  return data.result;
}

export async function listPrintfulProducts() {
  return printfulFetch<unknown[]>("/store/products");
}

export async function getPrintfulProduct(id: string) {
  return printfulFetch<unknown>(`/store/products/${id}`);
}

export async function getPrintfulOrder(id: string) {
  return printfulFetch<unknown>(`/orders/${id}`);
}
