import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "crypto";

// In-memory SSE subscriber set (fine for single-instance — use Redis pub/sub for multi-instance)
const subscribers = new Set<ReadableStreamDefaultController>();

// POST /api/notify — Alchemy Notify webhook endpoint
export async function POST(req: NextRequest) {
  const secret = process.env.ALCHEMY_NOTIFY_SECRET;
  if (!secret) return NextResponse.json({ error: "not configured" }, { status: 503 });

  const body = await req.text();
  const sig = req.headers.get("x-alchemy-signature") ?? "";
  const expected = createHmac("sha256", secret).update(body).digest("hex");
  if (sig !== expected) return NextResponse.json({ error: "invalid signature" }, { status: 401 });

  const payload = JSON.parse(body);
  const isSignalEvent = payload?.event?.activity?.some(
    (a: { toAddress: string }) =>
      a.toAddress?.toLowerCase() === process.env.NEXT_PUBLIC_SIGNAL_REGISTRY_ADDRESS?.toLowerCase()
  );

  if (isSignalEvent) {
    const message = `data: signal\n\n`;
    const encoder = new TextEncoder();
    subscribers.forEach((ctrl) => {
      try { ctrl.enqueue(encoder.encode(message)); } catch { subscribers.delete(ctrl); }
    });
  }

  return NextResponse.json({ ok: true });
}

// GET /api/notify/stream — SSE endpoint for frontend
export async function GET() {
  const stream = new ReadableStream({
    start(controller) {
      subscribers.add(controller);
    },
    cancel(controller) {
      subscribers.delete(controller);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
