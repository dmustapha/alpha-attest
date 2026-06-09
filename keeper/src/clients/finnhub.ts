import WebSocket from "ws";
import { EventEmitter } from "events";

export interface TradeData {
  symbol: string;
  price: number;
  timestamp: number; // milliseconds from Finnhub
  volume: number;
}

interface FinnhubTradeMessage {
  data: Array<{ p: number; s: string; t: number; v: number }>;
  type: "trade";
}

export class FinnhubClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private reconnectDelay = 1000;
  private readonly maxReconnectDelay = 30000;
  private readonly symbols: string[];
  private readonly apiKey: string;
  private reconnectTimer: NodeJS.Timeout | null = null;
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
      this.isConnecting = false;
      this.scheduleReconnect();
    });
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
    this.ws?.close();
    this.ws = null;
  }
}
