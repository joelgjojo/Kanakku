// The WhatsApp brain. Used by the Twilio webhook and the in-app simulator.
import { askShop, auditShelf, parseMessage, readNotebook, readPurchaseBill } from "./ai";
import type { Media } from "./ai/gemini";
import { balances, createBill, customerDue, importPurchase, recordPayment, restock, toBillItems } from "./kanakku";
import { customerLink } from "./links";
import { dashboard, forecast, shopFacts } from "./analytics";
import { getStore } from "./store";
import { istDate, qtyLabel, rupees } from "./format";
import { digest } from "./digest";
import type { Bill, BillItem, Lang, ParsedMessage, Source } from "./types";

export interface BotReply {
  reply: string;
  kind: "bill" | "payment" | "restock" | "notebook" | "shelf" | "info" | "error";
  bill?: Bill;
  parsed?: ParsedMessage;
}

const HELP = `നമസ്കാരം! I'm Kanakku 🧾
Send me:
🎤 a voice note: "രാജന് 2 കിലോ പഞ്ചസാര പറ്റ്"
✍️ text: "2 kg ari, 1 soap"
💰 "Suma 300 thannu" to record a payment
🚚 "50 kilo ari vannu" when stock arrives
📒 a photo of your notebook page to import it
🧾 a supplier bill photo with caption "bill" to add stock and track profit
❓ any question: "ee aazhcha laabham etra?"
🗄️ a shelf photo with caption "shelf" to check stock
Ask: "stock", "pattu", "innathe kanakku"
Helpers can talk in Hindi too: send "namaste"`;

const HELP_HI = `नमस्ते! मैं Kanakku हूँ 🧾
भेजें:
🎤 वॉइस नोट: "Rajan ko 2 kilo cheeni udhaar"
✍️ लिखकर: "2 kilo chawal, 1 sabun"
💰 "Suma ne 300 diya" जब उधार वापस मिले
🚚 "50 kilo chawal aaya" जब माल आए
पूछें: "stock", "udhaar", "aaj ka hisaab"`;

// Hindi names for the shop's items, for helpers from other states.
const HI_NAMES: Record<string, string> = {
  "p-matta-rice": "मट्टा चावल", "p-ponni-rice": "पोन्नी चावल", "p-sugar": "चीनी", "p-coconut-oil": "नारियल तेल",
  "p-tea": "चाय पत्ती", "p-milk": "दूध", "p-egg": "अंडा", "p-soap": "साबुन", "p-salt": "नमक", "p-chilli": "मिर्च पाउडर",
  "p-turmeric": "हल्दी", "p-atta": "आटा", "p-rava": "सूजी", "p-dal": "अरहर दाल", "p-green-gram": "मूंग", "p-onion": "प्याज",
  "p-small-onion": "छोटा प्याज", "p-biscuit": "बिस्किट", "p-detergent": "सर्फ", "p-matchbox": "माचिस",
};

type ItemLike = Pick<BillItem, "productId" | "name" | "nameMl">;
const nameFor = (i: ItemLike, hi: boolean) => (hi ? (i.productId && HI_NAMES[i.productId]) || i.name : i.nameMl ?? i.name);
const prodName = (p: { id: string; name: string; nameMl: string }, hi: boolean) => nameFor({ productId: p.id, name: p.name, nameMl: p.nameMl }, hi);

export function formatBill(bill: Bill, due?: number, lang?: Lang) {
  const hi = lang === "hi";
  const lines = bill.items.map((i) => `• ${nameFor(i, hi)} ${qtyLabel(i.qty, i.unit)} = ${rupees(i.total)}`);
  const head = `🧾 ${hi ? "बिल" : "Bill"} #${bill.number}${bill.customerName ? ` · ${bill.customerName}` : ""}`;
  const mode = hi
    ? bill.paymentMode === "credit" ? "उधार" : bill.paymentMode === "upi" ? "UPI" : "नकद"
    : bill.paymentMode === "credit" ? "പറ്റ് / credit" : bill.paymentMode === "upi" ? "UPI" : "Cash";
  let out = `${head}\n${lines.join("\n")}\n━━━━━━━━\n${hi ? "कुल" : "ആകെ / Total"}: *${rupees(bill.total)}* (${mode})`;
  if (bill.paymentMode === "credit" && due !== undefined) out += hi ? `\n${bill.customerName} का उधार अब: ${rupees(due)}` : `\n${bill.customerName}'s pattu now: ${rupees(due)}`;
  return out;
}

export async function handleMessage(input: { text?: string; media?: Media; source?: Source }): Promise<BotReply> {
  const source = input.source ?? "whatsapp";
  const store = getStore();
  const text = input.text?.trim() ?? "";
  const lower = text.toLowerCase();

  if (!input.media && /^(namaste|namaskar|नमस्ते|नमस्कार|hindi|हिंदी)$/i.test(text)) {
    return { kind: "info", reply: HELP_HI };
  }
  if (!input.media && (!text || /^(hi|hello|help|start|menu|നമസ്കാരം)$/i.test(text))) {
    return { kind: "info", reply: HELP };
  }
  // The daily messages the bridge sends by itself, on demand.
  if (!input.media && /^(good )?morning$|^(today'?s )?plan$|^suprabhatham$|^സുപ്രഭാതം$/i.test(text)) {
    return { kind: "info", reply: await digest("morning") };
  }
  if (!input.media && /^(good )?(evening|night)$|^(day )?close$|^raathri( kanakku)?$|^രാത്രി$/i.test(text)) {
    return { kind: "info", reply: await digest("evening") };
  }

  try {
    const [products, customers] = await Promise.all([store.listProducts(), store.listCustomers()]);

    // Photos: notebook page by default, shelf audit if the caption says so.
    if (input.media?.mimeType.startsWith("image/")) {
      if (/\b(bill|invoice|supplier|purchase|wholesale)\b|ബിൽ|ഇൻവോയ്സ്|വാങ്ങി/i.test(lower)) {
        const res = await readPurchaseBill(input.media, products);
        const done = await importPurchase(res.items, "whatsapp");
        if (!done.length) return { kind: "error", reply: "Couldn't read items on that bill. Try a clearer, straight photo." };
        const lines = done.map((d) => `• ${d.product.nameMl || d.product.name} +${qtyLabel(d.qty, d.product.unit)} @ ${rupees(d.unitCost)}${d.isNew ? " 🆕" : ""} → margin ${d.marginPct}%${d.marginPct < 5 ? " ⚠️" : ""}`);
        const low = done.filter((d) => d.marginPct < 5);
        return {
          kind: "restock",
          reply: `🧾 Supplier bill${res.supplier ? ` from ${res.supplier}` : ""} added\n${lines.join("\n")}${res.invoiceTotal ? `\nBill total: ${rupees(res.invoiceTotal)}` : ""}${low.length ? `\n\n⚠️ Very low margin on ${low.map((d) => d.product.name).join(", ")}. Check your selling price.` : ""}`,
        };
      }
      if (/shelf|ഷെൽഫ്|rack|audit/i.test(lower)) {
        const res = await auditShelf(input.media, products);
        const rows = res.items.map((c) => {
          const p = products.find((x) => x.id === c.productId);
          if (!p) return `• ${c.name}: ${c.counted} ${c.unit}`;
          const diff = Math.round((c.counted - p.stock) * 10) / 10;
          const flag = Math.abs(diff) < Math.max(1, p.stock * 0.15) ? "✅" : "⚠️";
          return `${flag} ${p.nameMl}: shelf ${c.counted}, records ${p.stock} ${p.unit}`;
        });
        return { kind: "shelf", reply: `🗄️ Shelf check\n${rows.join("\n")}\n\n${res.notes}\nOpen the Kanakku app to fix stock.` };
      }
      const res = await readNotebook(input.media, products, customers);
      let sales = 0, pays = 0, total = 0;
      for (const e of res.entries) {
        if (e.kind === "payment" && e.customerName) {
          await recordPayment(e.customerName, e.amount, "notebook");
          pays++;
        } else if (e.kind === "sale") {
          const items = toBillItems(e.items, products);
          if (!items.length && e.amount > 0) items.push({ productId: null, name: e.lineText.slice(0, 40), qty: 1, unit: "pc", price: e.amount, total: e.amount });
          if (!items.length) continue;
          const isOld = e.date && e.date < istDate();
          await createBill({
            items,
            customerName: e.customerName,
            paymentMode: e.isCredit && e.customerName ? "credit" : "cash",
            source: "notebook",
            rawInput: e.lineText,
            createdAt: e.date ? new Date(`${e.date}T12:00:00+05:30`).toISOString() : undefined,
            affectStock: !isOld,
          });
          sales++;
          total += e.amount;
        }
      }
      return {
        kind: "notebook",
        reply: `📒 Notebook page read!\n${sales} sales (${rupees(total)}) and ${pays} payments added to Kanakku.\nCheck them in the app under Notebook.`,
      };
    }

    const parsed = await parseMessage(
      input.media ? { audio: input.media, text } : { text },
      products,
      customers,
    );

    const hi = parsed.lang === "hi";
    switch (parsed.intent) {
      case "sale": {
        const items = toBillItems(parsed.items, products);
        if (!items.length) {
          return { kind: "error", parsed, reply: hi ? `"${parsed.transcript}" सुना, पर सामान समझ नहीं आया। ऐसे भेजें: "2 kilo chawal, 1 sabun"` : `I heard "${parsed.transcript}" but couldn't find items. Try: "2 kg ari, 1 soap".` };
        }
        if (parsed.paymentMode === "credit" && !parsed.customerName) {
          return { kind: "error", parsed, reply: hi ? `किसका उधार? नाम भी बोलें, जैसे "Rajan udhaar"।` : `Whose pattu? Say the name too, like "Rajan pattu".` };
        }
        const bill = await createBill({ items, customerName: parsed.customerName, paymentMode: parsed.paymentMode, source, rawInput: parsed.transcript });
        const bal = bill.customerId && bill.paymentMode === "credit" ? (await balances()).find((b) => b.customer.id === bill.customerId) : undefined;
        const due = bal?.due;
        const low = forecast(await store.listProducts(), await store.listBills(14))
          .filter((f) => bill.items.some((i) => i.productId === f.product.id) && (f.status === "critical" || f.status === "out"));
        let reply = `🎤 "${parsed.transcript}"\n\n${formatBill(bill, due, parsed.lang)}`;
        if (bal && bal.due > bal.trust.limit) {
          reply += hi
            ? `\n\n🛑 ${bal.customer.name} उधार की सीमा (${rupees(bal.trust.limit)}) से ऊपर हैं। और उधार देने से पहले मालिक से पूछें।`
            : `\n\n🛑 ${bal.customer.name} is over the pattu limit (${rupees(bal.trust.limit)}). ${bal.trust.reason}`;
        }
        if (bal) reply += hi ? `\n${bal.customer.name} को उनका उधार पेज भेजें: ${customerLink(bal.customer.id)}` : `\nSend ${bal.customer.name} their pattu page: ${customerLink(bal.customer.id)}`;
        if (low.length) {
          const list = low.map((f) => `${prodName(f.product, hi)} (${f.product.stock} ${f.product.unit} ${hi ? "बचा" : "left"})`).join(", ");
          reply += hi ? `\n\n⚠️ कम बचा है: ${list}` : `\n\n⚠️ Running low: ${list}`;
        }
        return { kind: "bill", bill, parsed, reply };
      }
      case "payment": {
        if (!parsed.amount) return { kind: "error", parsed, reply: hi ? `कितने पैसे दिए? ऐसे भेजें: "Suma ne 300 diya"` : "How much was paid? Try: \"Suma 300 thannu\"." };
        const { customer } = await recordPayment(parsed.customerName, parsed.amount, source);
        const due = await customerDue(customer.id);
        const link = due > 0 ? `\n${hi ? "उनका पेज" : "Their page"}: ${customerLink(customer.id)}` : " ✅";
        const balance = due < 0
          ? hi ? `एडवांस जमा: *${rupees(-due)}*` : `Advance with you: *${rupees(-due)}*`
          : hi ? `बाकी उधार: *${rupees(due)}*` : `ബാക്കി / Balance pattu: *${rupees(due)}*`;
        return {
          kind: "payment",
          parsed,
          reply: hi
            ? `💰 ${customer.name} ने ${rupees(parsed.amount)} दिए।\n${balance}${link}`
            : `💰 ${customer.name} paid ${rupees(parsed.amount)}.\n${balance}${link}`,
        };
      }
      case "restock": {
        const done = await restock(parsed.items, source);
        if (!done.length) return { kind: "error", parsed, reply: hi ? `कौन सा माल आया? ऐसे भेजें: "50 kilo chawal aaya"` : "Which items arrived? Try: \"50 kilo ari vannu\"." };
        return {
          kind: "restock", parsed,
          reply: `🚚 ${hi ? "माल जुड़ गया" : "Stock added"}\n${done.map((d) => `• ${prodName(d.product, hi)} +${qtyLabel(d.qty, d.product.unit)} → ${Math.round(d.product.stock * 100) / 100} ${d.product.unit}`).join("\n")}`,
        };
      }
      case "stock_query": {
        const d = await dashboard();
        if (!d.restock.length) return { kind: "info", parsed, reply: hi ? "✅ अगले कुछ दिन माल ठीक है।" : "✅ Stock is fine for the next few days." };
        return {
          kind: "info", parsed,
          reply: `📦 ${hi ? "मंगवाना है" : "Needs restock"}\n${d.restock.slice(0, 8).map((f) => hi
            ? `• ${prodName(f.product, true)}: ${f.product.stock} ${f.product.unit} बचा${f.daysLeft !== null ? `, ~${f.daysLeft} दिन` : ""}। मंगवाएं ${f.reorderQty} ${f.product.unit}`
            : `• ${f.product.nameMl}: ${f.product.stock} ${f.product.unit} left${f.daysLeft !== null ? `, ~${f.daysLeft} days` : ""}. Order ${f.reorderQty} ${f.product.unit}`).join("\n")}`,
        };
      }
      case "credit_query": {
        const b = (await balances()).filter((x) => x.due > 0);
        const total = rupees(b.reduce((s, x) => s + x.due, 0));
        return {
          kind: "info", parsed,
          reply: `📒 ${hi ? `उधार खाता: ${total} बाकी` : `Pattu book: ${total} pending`}\n${b.slice(0, 8).map((x) => `• ${hi ? x.customer.name : x.customer.nameMl ?? x.customer.name}: ${rupees(x.due)}${x.oldestUnpaidDays > 7 ? ` (${x.oldestUnpaidDays} ${hi ? "दिन" : "days"})` : ""}`).join("\n")}`,
        };
      }
      case "summary": {
        const d = await dashboard();
        const top = d.top[0];
        return {
          kind: "info", parsed,
          reply: hi
            ? `📊 आज का हिसाब\nबिक्री: *${rupees(d.today.sales)}*, ${d.today.bills} बिल\nउधार दिया: ${rupees(d.today.creditGiven)}\nउधार वापस: ${rupees(d.today.collected)}\nइस हफ्ते सबसे ज़्यादा बिका: ${top?.name ?? "-"}`
            : `📊 ഇന്നത്തെ കണക്ക് / Today\nSales: *${rupees(d.today.sales)}* from ${d.today.bills} bill${d.today.bills === 1 ? "" : "s"}\nPattu given: ${rupees(d.today.creditGiven)}\nPattu collected: ${rupees(d.today.collected)}\nTop seller this week: ${top?.nameMl ?? top?.name ?? "-"}`,
        };
      }
      case "question": {
        const a = await askShop({ text: parsed.transcript || text }, await shopFacts());
        return { kind: "info", parsed, reply: `🤔 ${a.answer}` };
      }
      default:
        return {
          kind: "error", parsed,
          reply: hi
            ? `माफ़ कीजिए, समझ नहीं आया${parsed.transcript ? `: "${parsed.transcript}"` : ""}।\n\n${HELP_HI}`
            : `Sorry, I didn't get that${parsed.transcript ? `: "${parsed.transcript}"` : ""}.\n\n${HELP}`,
        };
    }
  } catch (e) {
    return { kind: "error", reply: `⚠️ ${(e as Error).message}` };
  }
}
