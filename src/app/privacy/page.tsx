import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy policy · Kanakku" };

const SHOP = process.env.NEXT_PUBLIC_SHOP_NAME ?? "Ammu Stores";

export default function Privacy() {
  return (
    <article className="px-4 lg:px-8 py-8 max-w-2xl space-y-4 text-[0.98rem] leading-relaxed">
      <h1 className="sign text-[2.2rem]">Privacy policy</h1>
      <p className="text-muted">Last updated 11 October 2026</p>
      <p>
        Kanakku is a bookkeeping tool built by a student team for a college hackathon. It helps a small shop ({SHOP}) record
        sales, stock and customer credit from voice notes, typed messages, WhatsApp messages and photos of its notebook.
      </p>
      <h2 className="text-lg font-semibold pt-2">What we collect</h2>
      <p>
        When you message the shop&apos;s Kanakku WhatsApp number, we receive your phone number and the message, voice note or photo
        you send. We use it only to create the bill, payment or stock entry you asked for and to send you the reply.
      </p>
      <h2 className="text-lg font-semibold pt-2">How it is processed</h2>
      <p>
        Voice notes and photos are sent to Google&apos;s Gemini API to be transcribed and read. Records are stored in a private
        Supabase database that only the shop can access. WhatsApp messages travel through Meta&apos;s WhatsApp Business Platform.
      </p>
      <h2 className="text-lg font-semibold pt-2">What we don&apos;t do</h2>
      <p>We don&apos;t sell or share your data, show ads, or use it for anything other than the shop&apos;s accounts.</p>
      <h2 className="text-lg font-semibold pt-2">Deleting your data</h2>
      <p>
        Ask the shop owner, or email <a className="text-pen underline" href="mailto:joelgjojo008@gmail.com">joelgjojo008@gmail.com</a>, and we
        will delete your messages and records within 7 days.
      </p>
    </article>
  );
}
