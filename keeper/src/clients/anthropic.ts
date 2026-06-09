import Anthropic from "@anthropic-ai/sdk";

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
and structured. Never use em dashes. Always complete all required sections.`;

function buildAnalysisPrompt(
  ticker: string,
  price: number,
  changePct: number,
  timestamp: number
): string {
  const direction = changePct > 0 ? "UP" : changePct < 0 ? "DOWN" : "FLAT";
  const dateStr = new Date(timestamp).toISOString();
  const sector = ticker === "TSLA"
    ? "EV, clean energy, and autonomous vehicles"
    : "e-commerce, cloud computing, and logistics";

  return `Analyze this ${ticker} price movement observed at ${dateStr}:
Current Price: $${price.toFixed(2)}
Price Change: ${changePct > 0 ? "+" : ""}${changePct.toFixed(2)}% (${direction})

Provide a comprehensive multi-factor analysis with all six required sections:

## PRICE_TREND
Analyze the current price movement pattern, momentum indicators, technical significance of this ${changePct.toFixed(2)}% move, key support and resistance levels.

## VOLUME_ANALYSIS
Evaluate trading volume implications, whether volume confirms this price action, and what this signals about market conviction and institutional participation.

## SECTOR_CONTEXT
Contextualize this move within the broader ${sector} sector, current macro environment, peer performance, and relevant market dynamics.

## CONFIDENCE_ASSESSMENT
Rate your directional confidence as HIGH, MEDIUM, or LOW. Explain the specific factors driving this confidence level, including signal quality and market conditions.

## INVESTMENT_THESIS
Present the bull case and bear case for ${ticker} based on this signal. Include specific price targets or risk levels that would confirm or invalidate the thesis.

## RISK_FACTORS
Identify the top 3 to 4 specific risks that could invalidate this signal, including near-term catalysts to monitor and macro factors.

## SIGNAL_DIRECTION
State exactly one of: BULLISH, BEARISH, or NEUTRAL based on your overall analysis.`;
}

function extractSection(content: string, section: string): string {
  const regex = new RegExp(`## ${section}\\s*\\n([\\s\\S]*?)(?=\\n## |$)`, "i");
  const match = content.match(regex);
  return match ? match[1].trim() : "";
}

function parseDirection(content: string): "BULLISH" | "BEARISH" | "NEUTRAL" {
  const text = extractSection(content, "SIGNAL_DIRECTION").toUpperCase();
  if (text.includes("BULLISH")) return "BULLISH";
  if (text.includes("BEARISH")) return "BEARISH";
  return "NEUTRAL";
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
    timestamp: number
  ): Promise<SignalAnalysis> {
    const prompt = buildAnalysisPrompt(ticker, price, changePct, timestamp);

    const response = await this.client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2048,
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
