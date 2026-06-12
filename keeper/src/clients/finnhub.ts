import WebSocket from "ws";
import { EventEmitter } from "events";

export interface TradeData {
  symbol: string;
  price: number;
  timestamp: number; // milliseconds from Finnhub
  volume: number;
}

// Full Finnhub REST quote — grounds Claude's analysis in real session data
export interface FullQuote {
  current: number;    // c
  open: number;       // o
  high: number;       // h
  low: number;        // l
  prevClose: number;  // pc
  dayChange: number;  // d
  dayChangePct: number; // dp
}

interface FinnhubTradeMessage {
  data: Array<{ p: number; s: string; t: number; v: number }>;
  type: "trade";
}

const HEARTBEAT_INTERVAL_MS = 30_000;
const PONG_TIMEOUT_MS = 10_000;

export class FinnhubClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private reconnectDelay = 1000;
  private readonly maxReconnectDelay = 30000;
  private readonly symbols: string[];
  private readonly apiKey: string;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private heartbeat: NodeJS.Timeout | null = null;
  private isConnecting = false;

  constructor(apiKey: string, symbols: string[]) {
    super();
    this.apiKey = apiKey;
    this.symbols = symbols;
  }

  connect(): void {
    if (this.isConnecting) return;
    this.isConnecting = true;

    const url = `wss://ws.finnhub.io?token=${this.apiKey}`;
    this.ws = new WebSocket(url);

    this.ws.on("open", () => {
      console.log("[Finnhub] Connected");
      this.reconnectDelay = 1000;
      this.isConnecting = false;
      this.subscribe();
      this.startHeartbeat();
    });

    this.ws.on("message", (data: Buffer) => {
      this.handleMessage(data.toString());
    });

    this.ws.on("error", (err: Error) => {
      console.error("[Finnhub] Error:", err.message);
      this.isConnecting = false;
    });

    this.ws.on("close", () => {
      console.warn(`[Finnhub] Closed. Reconnecting in ${this.reconnectDelay}ms`);
      this.stopHeartbeat();
      this.isConnecting = false;
      this.scheduleReconnect();
    });
  }

  // Ping/pong liveness: a half-open TCP connection (NAT timeout, server drop
  // without FIN) leaves the socket OPEN but deaf — 'close' never fires and the
  // reconnect logic never runs. Terminating on missed pong forces the 'close'
  // path and gets us a fresh connection.
  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeat = setInterval(() => {
      if (this.ws?.readyState !== WebSocket.OPEN) return;
      let alive = false;
      this.ws.once("pong", () => { alive = true; });
      this.ws.ping();
      setTimeout(() => {
        if (!alive && this.ws) {
          console.warn("[Finnhub] Pong timeout — terminating half-open connection");
          this.ws.terminate(); // emits 'close' → reconnect
        }
      }, PONG_TIMEOUT_MS);
    }, HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeat) {
      clearInterval(this.heartbeat);
      this.heartbeat = null;
    }
  }

  // One-shot REST quote — used by the resolver to fetch the closing price after signal lock-in
  async getQuote(symbol: string): Promise<number> {
    const quote = await this.getFullQuote(symbol);
    return quote.current;
  }

  // Full session quote — injected into the analysis prompt so Claude reasons
  // over real data instead of fabricating volume figures and price levels
  async getFullQuote(symbol: string): Promise<FullQuote> {
    const url = `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${this.apiKey}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`Finnhub quote failed for ${symbol}: ${res.status}`);
    const data = (await res.json()) as {
      c: number; o: number; h: number; l: number; pc: number; d: number; dp: number;
    };
    if (!data.c) throw new Error(`Finnhub quote returned zero price for ${symbol}`);
    return {
      current: data.c,
      open: data.o,
      high: data.h,
      low: data.l,
      prevClose: data.pc,
      dayChange: data.d,
      dayChangePct: data.dp,
    };
  }

  private subscribe(): void {
    for (const symbol of this.symbols) {
      this.ws?.send(JSON.stringify({ type: "subscribe", symbol }));
      console.log(`[Finnhub] Subscribed to ${symbol}`);
    }
  }

  private handleMessage(raw: string): void {
    try {
      const msg = JSON.parse(raw);
      if (msg.type !== "trade" || !Array.isArray(msg.data)) return;

      const message = msg as FinnhubTradeMessage;
      for (const trade of message.data) {
        this.emit("trade", {
          symbol: trade.s,
          price: trade.p,
          timestamp: trade.t,
          volume: trade.v,
        } as TradeData);
      }
    } catch {
      // ignore parse errors
    }
  }

  private scheduleReconnect(): void {
    this.reconnectTimer = setTimeout(() => {
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
      this.connect();
    }, this.reconnectDelay);
  }

  disconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.stopHeartbeat();
    this.ws?.close();
    this.ws = null;
  }
}
