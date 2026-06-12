import Anthropic from "@anthropic-ai/sdk";
import type { FullQuote } from "./finnhub.js";

export interface SignalAnalysis {
  ticker: string;
  price: number;
  timestamp: number;
  direction: "BULLISH" | "BEARISH" | "NEUTRAL";
  analysis: string;
  wordCount: number;
  dimensions: {
    priceTrend: string;
    volume: string;
    sectorContext: string;
    confidence: string;
    investmentThesis: string;
    riskFactors: string;
  };
}

const SYSTEM_PROMPT = `You are an expert financial analyst specializing in US equity markets, \
providing institutional-grade analysis of price movements. Your analysis is precise, data-driven, \
and structured. Never use em dashes. Always complete all required sections. \
Only reference figures present in the MARKET DATA block of the request. If a data point is \
unavailable, state that explicitly rather than estimating or inventing it.`;

function buildAnalysisPrompt(
  ticker: string,
  price: number,
  changePct: number,
  timestamp: number,
  tradeVolume: number,
  quote: FullQuote
): string {
  const direction = changePct > 0 ? "UP" : changePct < 0 ? "DOWN" : "FLAT";
  const dateStr = new Date(timestamp).toISOString();
  const sector = ticker === "TSLA"
    ? "EV, clean energy, and autonomous vehicles"
    : "e-commerce, cloud computing, and logistics";

  return `Analyze this ${ticker} price movement observed at ${dateStr}.

MARKET DATA (real-time, Finnhub):
- Trigger trade: $${price.toFixed(2)} at ${dateStr}, size ${tradeVolume} shares
- Monitored move vs keeper baseline: ${changePct > 0 ? "+" : ""}${changePct.toFixed(2)}% (${direction})
- Session: open $${quote.open.toFixed(2)}, high $${quote.high.toFixed(2)}, low $${quote.low.toFixed(2)}, prev close $${quote.prevClose.toFixed(2)}
- Day change: ${quote.dayChange > 0 ? "+" : ""}${quote.dayChange.toFixed(2)} (${quote.dayChangePct > 0 ? "+" : ""}${quote.dayChangePct.toFixed(2)}%)

Your response MUST begin with a single line, before anything else:
DIRECTION: BULLISH|BEARISH|NEUTRAL

Then provide a comprehensive multi-factor analysis with all six required sections:

## PRICE_TREND
Using the session range and prev close above, analyze the price movement pattern, where the trigger price sits within today's range, and the technical significance of this ${changePct.toFixed(2)}% move relative to the session high, low, and open.

## VOLUME_ANALYSIS
The trigger trade size was ${tradeVolume} shares. Characterize what conviction this print size suggests in context. Do not invent aggregate volume figures; reason only from the trade size and price action provided.

## SECTOR_CONTEXT
Contextualize this move within the broader ${sector} sector, current macro environment, and relevant market dynamics. Do not cite specific peer prices you have not been given.

## CONFIDENCE_ASSESSMENT
Rate your directional confidence as HIGH, MEDIUM, or LOW. Explain the specific factors driving this confidence level, including signal quality and market conditions.

## INVESTMENT_THESIS
Present the bull case and bear case for ${ticker} based on this signal. Anchor any price targets or risk levels to the session range and prev close in MARKET DATA.

## RISK_FACTORS
Identify the top 3 to 4 specific risks that could invalidate this signal, including near-term catalysts to monitor and macro factors.`;
}

function extractSection(content: string, section: string): string {
  const regex = new RegExp(`## ${section}\\s*\\n([\\s\\S]*?)(?=\\n## |$)`, "i");
  const match = content.match(regex);
  return match ? match[1].trim() : "";
}

// Strict: a missing DIRECTION line is an error, never a silent NEUTRAL.
// The line is required at the FRONT of the response so truncation can't eat it.
function parseDirection(content: string): "BULLISH" | "BEARISH" | "NEUTRAL" {
  const m = content.match(/^DIRECTION:\s*(BULLISH|BEARISH|NEUTRAL)/m);
  if (!m) throw new Error("Analysis missing DIRECTION line — refusing to default");
  return m[1] as "BULLISH" | "BEARISH" | "NEUTRAL";
}

export class AnthropicClient {
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async generateAnalysis(
    ticker: string,
    price: number,
    changePct: number,
    timestamp: number,
    tradeVolume: number,
    quote: FullQuote
  ): Promise<SignalAnalysis> {
    const prompt = buildAnalysisPrompt(ticker, price, changePct, timestamp, tradeVolume, quote);

    try {
      return await this.attempt(ticker, price, timestamp, prompt);
    } catch (err) {
      // One retry with the failure reason appended; after that the signal is skipped
      const reason = err instanceof Error ? err.message : String(err);
      console.warn(`[Anthropic] ${ticker} attempt failed (${reason}) — retrying once`);
      const retryPrompt = `${prompt}\n\nIMPORTANT: A previous attempt failed validation: "${reason}". ` +
        `Ensure the very first line of your response is the DIRECTION line and all six sections are complete.`;
      return await this.attempt(ticker, price, timestamp, retryPrompt);
    }
  }

  private async attempt(
    ticker: string,
    price: number,
    timestamp: number,
    prompt: string
  ): Promise<SignalAnalysis> {
    const response = await this.client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: prompt }],
    });

    const block = response.content[0];
    if (block.type !== "text") {
      throw new Error("Unexpected non-text response from Claude");
    }

    const text = block.text;
    const wordCount = text.split(/\s+/).filter(Boolean).length;

    if (wordCount < 400) {
      throw new Error(
        `Analysis below minimum length: ${wordCount} words (required: 400). Ticker: ${ticker}`
      );
    }

    return {
      ticker,
      price,
      timestamp,
      direction: parseDirection(text),
      analysis: text,
      wordCount,
      dimensions: {
        priceTrend: extractSection(text, "PRICE_TREND"),
        volume: extractSection(text, "VOLUME_ANALYSIS"),
        sectorContext: extractSection(text, "SECTOR_CONTEXT"),
        confidence: extractSection(text, "CONFIDENCE_ASSESSMENT"),
        investmentThesis: extractSection(text, "INVESTMENT_THESIS"),
        riskFactors: extractSection(text, "RISK_FACTORS"),
      },
    };
  }
}
