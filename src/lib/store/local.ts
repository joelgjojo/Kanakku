import { promises as fs } from "fs";
import path from "path";
import { buildSeed, type DB } from "../seed";
import type { Bill, Customer, Payment, Product, StockMove } from "../types";
import type { Store } from "./index";

// Zero-setup store: a JSON file on disk. Perfect for the demo laptop.
// On Vercel the project folder is read-only, so it falls back to /tmp.
const FILE = process.env.VERCEL
  ? "/tmp/kanakku.json"
  : path.join(process.cwd(), ".data", "kanakku.json");

export class LocalStore implements Store {
  kind = "local" as const;
  private db: DB | null = null;
  private queue: Promise<unknown> = Promise.resolve();

  private async load(): Promise<DB> {
    if (this.db) return this.db;
    try {
      this.db = JSON.parse(await fs.readFile(FILE, "utf8")) as DB;
      this.db.stockMoves ??= [];
    } catch {
      this.db = buildSeed();
      await this.save();
    }
    return this.db;
  }

  private async save() {
    await fs.mkdir(path.dirname(FILE), { recursive: true });
    await fs.writeFile(FILE, JSON.stringify(this.db, null, 1));
  }

  // Serialise writes so two requests never clobber each other.
  private write<T>(fn: (db: DB) => T): Promise<T> {
    const run = this.queue.then(async () => {
      const db = await this.load();
      const out = fn(db);
      await this.save();
      return out;
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  async listProducts() {
    return [...(await this.load()).products];
  }
  upsertProduct(p: Product) {
    return this.write((db) => {
      const i = db.products.findIndex((x) => x.id === p.id);
      if (i >= 0) db.products[i] = p;
      else db.products.push(p);
      return p;
    });
  }
  adjustStock(productId: string, delta: number) {
    return this.write((db) => {
      const p = db.products.find((x) => x.id === productId);
      if (p) p.stock = Math.round((p.stock + delta) * 1000) / 1000;
    });
  }

  async listCustomers() {
    return [...(await this.load()).customers];
  }
  upsertCustomer(c: Customer) {
    return this.write((db) => {
      const i = db.customers.findIndex((x) => x.id === c.id);
      if (i >= 0) db.customers[i] = c;
      else db.customers.push(c);
      return c;
    });
  }

  async listBills(sinceDays?: number) {
    const bills = (await this.load()).bills;
    if (!sinceDays) return [...bills];
    const since = Date.now() - sinceDays * 86400000;
    return bills.filter((b) => new Date(b.createdAt).getTime() >= since);
  }
  async getBill(id: string) {
    return (await this.load()).bills.find((b) => b.id === id) ?? null;
  }
  insertBill(b: Omit<Bill, "number">) {
    return this.write((db) => {
      if (db.bills.some((x) => x.id === b.id)) throw new Error("duplicate bill id");
      const number = db.bills.reduce((m, x) => Math.max(m, x.number), 0) + 1;
      const bill = { ...b, number };
      db.bills.push(bill);
      db.bills.sort((x, y) => x.createdAt.localeCompare(y.createdAt));
      return bill;
    });
  }

  async listPayments() {
    return [...(await this.load()).payments];
  }
  insertPayment(p: Payment) {
    return this.write((db) => {
      db.payments.push(p);
      return p;
    });
  }

  async listStockMoves() {
    return [...(await this.load()).stockMoves];
  }
  insertStockMove(m: StockMove) {
    return this.write((db) => {
      db.stockMoves.push(m);
      return m;
    });
  }

  reset() {
    return this.write((db) => {
      Object.assign(db, buildSeed());
    });
  }
}
