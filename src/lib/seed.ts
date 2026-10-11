import type { Bill, BillItem, Customer, Payment, Product, StockMove } from "./types";

export interface DB {
  products: Product[];
  customers: Customer[];
  bills: Bill[];
  payments: Payment[];
  stockMoves: StockMove[];
}

// A typical Kollam neighbourhood kada. Prices are rough 2026 retail prices.
export const SEED_PRODUCTS: Product[] = [
  { id: "p-matta-rice", name: "Matta rice", nameMl: "മട്ട അരി", aliases: ["rice", "ari", "matta", "kuthari", "കുത്തരി", "അരി"], unit: "kg", price: 56, stock: 14, lowStockAt: 20, category: "Grains" },
  { id: "p-ponni-rice", name: "Ponni rice", nameMl: "പൊന്നി അരി", aliases: ["ponni", "white rice", "വെള്ള അരി"], unit: "kg", price: 52, stock: 38, lowStockAt: 15, category: "Grains" },
  { id: "p-sugar", name: "Sugar", nameMl: "പഞ്ചസാര", aliases: ["panchasara", "panjasara", "sugar"], unit: "kg", price: 48, stock: 9, lowStockAt: 10, category: "Grocery" },
  { id: "p-coconut-oil", name: "Coconut oil", nameMl: "വെളിച്ചെണ്ണ", aliases: ["velichenna", "oil", "enna", "എണ്ണ"], unit: "l", price: 290, stock: 11, lowStockAt: 5, category: "Oil" },
  { id: "p-tea", name: "Tea powder", nameMl: "ചായപ്പൊടി", aliases: ["chaya podi", "chayapodi", "tea", "ചായപൊടി"], unit: "pkt", price: 65, stock: 22, lowStockAt: 8, category: "Beverages" },
  { id: "p-milk", name: "Milk", nameMl: "പാൽ", aliases: ["paal", "pal", "milma", "മിൽമ"], unit: "pkt", price: 30, stock: 18, lowStockAt: 20, category: "Dairy" },
  { id: "p-egg", name: "Egg", nameMl: "മുട്ട", aliases: ["mutta", "eggs"], unit: "pc", price: 7, stock: 96, lowStockAt: 30, category: "Dairy" },
  { id: "p-soap", name: "Bath soap", nameMl: "സോപ്പ്", aliases: ["soap", "sopp", "lux", "medimix"], unit: "pc", price: 38, stock: 30, lowStockAt: 10, category: "Personal care" },
  { id: "p-salt", name: "Salt", nameMl: "ഉപ്പ്", aliases: ["uppu", "salt"], unit: "pkt", price: 24, stock: 25, lowStockAt: 8, category: "Grocery" },
  { id: "p-chilli", name: "Chilli powder", nameMl: "മുളകുപൊടി", aliases: ["mulaku podi", "mulakupodi", "chilli"], unit: "pkt", price: 42, stock: 16, lowStockAt: 6, category: "Spices" },
  { id: "p-turmeric", name: "Turmeric powder", nameMl: "മഞ്ഞൾപ്പൊടി", aliases: ["manjal podi", "manjal", "turmeric"], unit: "pkt", price: 28, stock: 4, lowStockAt: 5, category: "Spices" },
  { id: "p-atta", name: "Wheat flour", nameMl: "ആട്ട", aliases: ["atta", "gothambu podi", "ഗോതമ്പ് പൊടി", "wheat"], unit: "kg", price: 46, stock: 20, lowStockAt: 8, category: "Grains" },
  { id: "p-rava", name: "Rava", nameMl: "റവ", aliases: ["rava", "sooji", "semolina"], unit: "kg", price: 50, stock: 12, lowStockAt: 5, category: "Grains" },
  { id: "p-dal", name: "Toor dal", nameMl: "പരിപ്പ്", aliases: ["parippu", "dal", "thuvara"], unit: "kg", price: 150, stock: 7, lowStockAt: 5, category: "Pulses" },
  { id: "p-green-gram", name: "Green gram", nameMl: "ചെറുപയർ", aliases: ["cherupayar", "moong", "payar"], unit: "kg", price: 120, stock: 9, lowStockAt: 4, category: "Pulses" },
  { id: "p-onion", name: "Onion", nameMl: "സവാള", aliases: ["savala", "onion", "ഉള്ളി", "ulli"], unit: "kg", price: 40, stock: 18, lowStockAt: 10, category: "Vegetables" },
  { id: "p-small-onion", name: "Shallots", nameMl: "ചെറിയ ഉള്ളി", aliases: ["cheriya ulli", "small onion", "shallot"], unit: "kg", price: 80, stock: 6, lowStockAt: 4, category: "Vegetables" },
  { id: "p-biscuit", name: "Biscuit packet", nameMl: "ബിസ്കറ്റ്", aliases: ["biscuit", "parle", "good day"], unit: "pkt", price: 10, stock: 60, lowStockAt: 20, category: "Snacks" },
  { id: "p-detergent", name: "Detergent", nameMl: "സോപ്പുപൊടി", aliases: ["soap podi", "soppu podi", "surf", "detergent", "washing powder"], unit: "pkt", price: 120, stock: 3, lowStockAt: 5, category: "Household" },
  { id: "p-matchbox", name: "Matchbox", nameMl: "തീപ്പെട്ടി", aliases: ["theepetti", "match", "matchbox"], unit: "pc", price: 2, stock: 140, lowStockAt: 30, category: "Household" },
];

const SEED_CUSTOMERS: Omit<Customer, "createdAt">[] = [
  { id: "c-rajan", name: "Rajan", nameMl: "രാജൻ", aliases: ["rajan chettan", "രാജന്", "രാജേട്ടൻ"], phone: "919400000001" },
  { id: "c-suma", name: "Suma", nameMl: "സുമ", aliases: ["suma chechi", "സുമ ചേച്ചി", "സുമയ്ക്ക്"], phone: "919400000002" },
  { id: "c-babu", name: "Babu", nameMl: "ബാബു", aliases: ["babu chettan", "ബാബുവിന്", "ബാബുന്"], phone: "919400000003" },
  { id: "c-ammu", name: "Ammu", nameMl: "അമ്മു", aliases: ["അമ്മുവിന്"], phone: "919400000004" },
  { id: "c-shaji", name: "Shaji", nameMl: "ഷാജി", aliases: ["shaji chettan", "ഷാജിക്ക്"], phone: "919400000005" },
  { id: "c-leela", name: "Leela teacher", nameMl: "ലീല ടീച്ചർ", aliases: ["leela", "ലീല", "teacher", "ടീച്ചർ"], phone: "919400000006" },
];

// Small deterministic PRNG so every reset gives the same believable history.
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function buildSeed(now = new Date()): DB {
  const rand = mulberry32(42);
  // Typical kirana margins by category, so profit numbers look like a real shop.
  const MARGIN: Record<string, number> = { Grains: 0.12, Grocery: 0.1, Oil: 0.09, Beverages: 0.16, Dairy: 0.07, "Personal care": 0.2, Spices: 0.22, Pulses: 0.13, Vegetables: 0.18, Snacks: 0.2, Household: 0.18 };
  const products = SEED_PRODUCTS.map((p) => ({
    ...p,
    aliases: [...p.aliases],
    costPrice: Math.round(p.price * (1 - (MARGIN[p.category] ?? 0.12)) * 100) / 100,
  }));
  const created = new Date(now.getTime() - 40 * 86400000).toISOString();
  const customers: Customer[] = SEED_CUSTOMERS.map((c) => ({ ...c, createdAt: created }));

  // Typical basket sizes per product (qty per line).
  const basket: Record<string, number[]> = {
    "p-matta-rice": [1, 2, 2, 5, 3],
    "p-ponni-rice": [1, 2, 5],
    "p-sugar": [0.5, 1, 1, 2],
    "p-coconut-oil": [0.5, 1, 1],
    "p-tea": [1, 1, 2],
    "p-milk": [1, 2, 2, 3],
    "p-egg": [6, 10, 12, 4],
    "p-soap": [1, 1, 2, 3],
    "p-salt": [1],
    "p-chilli": [1],
    "p-turmeric": [1],
    "p-atta": [1, 2],
    "p-rava": [0.5, 1],
    "p-dal": [0.5, 1],
    "p-green-gram": [0.5, 1],
    "p-onion": [1, 1, 2],
    "p-small-onion": [0.25, 0.5],
    "p-biscuit": [1, 2, 3, 5],
    "p-detergent": [1],
    "p-matchbox": [1, 2, 5],
  };
  // How popular each product is (relative weight).
  const weight: Record<string, number> = {
    "p-matta-rice": 9, "p-ponni-rice": 3, "p-sugar": 8, "p-coconut-oil": 4, "p-tea": 4,
    "p-milk": 9, "p-egg": 6, "p-soap": 4, "p-salt": 2, "p-chilli": 2, "p-turmeric": 2,
    "p-atta": 3, "p-rava": 2, "p-dal": 3, "p-green-gram": 1, "p-onion": 5, "p-small-onion": 2,
    "p-biscuit": 6, "p-detergent": 2, "p-matchbox": 2,
  };
  const pool = Object.entries(weight).flatMap(([id, w]) => Array(w).fill(id) as string[]);
  const byId = new Map(products.map((p) => [p.id, p]));

  const bills: Bill[] = [];
  const payments: Payment[] = [];
  let number = 1;

  // Customers' payment habits, so the pattu book has reliable and risky people.
  const habits: Record<string, { every: number; share: number }> = {
    "c-babu": { every: 2, share: 1 },
    "c-suma": { every: 4, share: 1 },
    "c-rajan": { every: 7, share: 0.8 },
    "c-shaji": { every: 10, share: 0.5 },
    "c-ammu": { every: 15, share: 0.3 },
    "c-leela": { every: 999, share: 0 },
  };
  const owed = new Map<string, number>();
  // Who takes pattu most often.
  const creditPool = ["c-rajan", "c-rajan", "c-leela", "c-leela", "c-leela", "c-suma", "c-babu", "c-babu", "c-shaji", "c-ammu", "c-ammu"];

  for (let d = 27; d >= 0; d--) {
    const day = new Date(now);
    day.setDate(day.getDate() - d);
    // Today: a morning's worth of bills, all before "now" so the demo never looks empty.
    const isToday = d === 0;
    const billsToday = Math.floor((isToday ? 0.45 : 1) * (22 + rand() * 14));
    const dayStart = new Date(day);
    dayStart.setHours(0, 0, 0, 0);
    const todayFrom = Math.max(dayStart.getTime(), now.getTime() - 8 * 3600000);
    for (let b = 0; b < billsToday; b++) {
      const at = new Date(day);
      if (isToday) at.setTime(todayFrom + rand() * (now.getTime() - 60000 - todayFrom));
      else at.setHours(7 + Math.floor(rand() * 15), Math.floor(rand() * 60), Math.floor(rand() * 60), 0);

      const lines = 1 + Math.floor(rand() * 3);
      const used = new Set<string>();
      const items: BillItem[] = [];
      for (let l = 0; l < lines; l++) {
        const id = pool[Math.floor(rand() * pool.length)];
        if (used.has(id)) continue;
        used.add(id);
        const p = byId.get(id)!;
        const qtys = basket[id];
        const qty = qtys[Math.floor(rand() * qtys.length)];
        items.push({ productId: id, name: p.name, nameMl: p.nameMl, qty, unit: p.unit, price: p.price, total: round2(qty * p.price) });
      }
      const onCredit = rand() < 0.22;
      const customer = onCredit ? customers.find((c) => c.id === creditPool[Math.floor(rand() * creditPool.length)])! : null;
      const sourceRoll = rand();
      bills.push({
        id: `b-seed-${number}`,
        number,
        createdAt: at.toISOString(),
        customerId: customer?.id ?? null,
        customerName: customer?.name ?? null,
        items,
        total: round2(items.reduce((s, i) => s + i.total, 0)),
        paymentMode: onCredit ? "credit" : rand() < 0.4 ? "upi" : "cash",
        source: d > 8 ? "notebook" : sourceRoll < 0.45 ? "voice" : sourceRoll < 0.8 ? "whatsapp" : "manual",
      });
      if (customer) owed.set(customer.id, (owed.get(customer.id) ?? 0) + items.reduce((s, i) => s + i.total, 0));
      number++;
    }

    // Evening: customers pay back pattu according to their habits.
    if (d > 0) {
      for (const [cid, h] of Object.entries(habits)) {
        const due = owed.get(cid) ?? 0;
        if (!h.share || due < 50 || (d + cid.length) % h.every !== 0) continue;
        const amount = Math.max(50, Math.round((due * h.share) / 10) * 10);
        const at = new Date(day);
        at.setHours(18, 15 + Math.floor(rand() * 40), 0, 0);
        payments.push({ id: `pay-seed-${d}-${cid}`, createdAt: at.toISOString(), customerId: cid, amount, note: "Paid", source: rand() < 0.5 ? "manual" : "whatsapp" });
        owed.set(cid, due - amount);
      }
    }
  }

  bills.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  bills.forEach((b, i) => (b.number = i + 1));

  return { products, customers, bills, payments, stockMoves: [] };
}
