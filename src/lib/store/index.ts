import type { Bill, Customer, Payment, Product, StockMove } from "../types";
import { LocalStore } from "./local";
import { SupabaseStore } from "./supabase";

export interface Store {
  kind: "local" | "supabase";
  listProducts(): Promise<Product[]>;
  upsertProduct(p: Product): Promise<Product>;
  adjustStock(productId: string, delta: number): Promise<void>;

  listCustomers(): Promise<Customer[]>;
  upsertCustomer(c: Customer): Promise<Customer>;

  listBills(sinceDays?: number): Promise<Bill[]>;
  insertBill(b: Omit<Bill, "number">): Promise<Bill>;
  getBill(id: string): Promise<Bill | null>;

  listPayments(): Promise<Payment[]>;
  insertPayment(p: Payment): Promise<Payment>;

  listStockMoves(): Promise<StockMove[]>;
  insertStockMove(m: StockMove): Promise<StockMove>;

  reset(): Promise<void>;
}

let store: Store | null = null;

export function getStore(): Store {
  if (store) return store;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  store = url && key ? new SupabaseStore(url, key) : new LocalStore();
  return store;
}
