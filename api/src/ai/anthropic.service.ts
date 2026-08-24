import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { PrismaService } from '../prisma/prisma.service';

/// Model for every call in this app. Explanations and tutor answers are the
/// product — a learner acting on a wrong explanation is the failure mode that
/// matters, so this is not a place to economise on capability. Cost is
/// controlled by the explanation cache instead (see explain.service.ts).
export const MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-5';

/// Which product surface a call came from, for the AiUsage ledger.
export type AiFeature = 'explain' | 'tutor';

export interface UsageMeta {
  feature: AiFeature;
  userId?: string;
}

@Injectable()
export class AnthropicService {
  private readonly logger = new Logger('AnthropicService');
  private readonly client: Anthropic | null;

  constructor(private readonly prisma: PrismaService) {
    const key = process.env.ANTHROPIC_API_KEY?.trim();
    // No key means mock mode, deliberately, following the same rule as the
    // Eskiz client: the whole app must be runnable offline and in CI without
    // credentials, and every AI surface must degrade to something harmless
    // rather than throwing.
    this.client = key ? new Anthropic({ apiKey: key }) : null;
  }

  get isMock(): boolean {
    return this.client === null;
  }

  /// One non-streaming call returning plain text.
  async text(params: {
    system: Anthropic.TextBlockParam[];
    messages: Anthropic.MessageParam[];
    maxTokens?: number;
    meta: UsageMeta;
  }): Promise<string> {
    if (!this.client) {
      await this.record(params.meta, { input: 0, output: 0, cached: 0, mock: true });
      return '';
    }

    try {
      const res = await this.client.messages.create({
        model: MODEL,
        max_tokens: params.maxTokens ?? 2048,
        thinking: { type: 'adaptive' },
        system: params.system,
        messages: params.messages,
      });

      await this.record(params.meta, {
        input: res.usage.input_tokens,
        output: res.usage.output_tokens,
        cached: res.usage.cache_read_input_tokens ?? 0,
        mock: false,
      });

      // A safety refusal arrives as HTTP 200 with stop_reason "refusal" and no
      // usable content, so it has to be checked before reading blocks.
      if (res.stop_reason === 'refusal') {
        this.logger.warn(`Refusal on ${params.meta.feature}: ${res.stop_details?.explanation ?? ''}`);
        throw new ServiceUnavailableException('AI javob berishdan bosh tortdi');
      }

      return res.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('\n')
        .trim();
    } catch (e: any) {
      if (e instanceof ServiceUnavailableException) throw e;
      this.logger.error(`Anthropic ${params.meta.feature} failed: ${e?.message ?? e}`);
      throw new ServiceUnavailableException('AI xizmati hozir mavjud emas');
    }
  }

  /// One non-streaming call whose response is validated against a schema.
  /// `format` comes from zodOutputFormat(); `fallback` is what mock mode
  /// returns so callers never have to branch on isMock.
  async structured<T>(params: {
    system: Anthropic.TextBlockParam[];
    messages: Anthropic.MessageParam[];
    format: any;
    fallback: T;
    maxTokens?: number;
    meta: UsageMeta;
  }): Promise<T> {
    if (!this.client) {
      await this.record(params.meta, { input: 0, output: 0, cached: 0, mock: true });
      return params.fallback;
    }

    try {
      const res = await this.client.messages.parse({
        model: MODEL,
        max_tokens: params.maxTokens ?? 2048,
        thinking: { type: 'adaptive' },
        system: params.system,
        messages: params.messages,
        output_config: { format: params.format },
      });

      await this.record(params.meta, {
        input: res.usage.input_tokens,
        output: res.usage.output_tokens,
        cached: res.usage.cache_read_input_tokens ?? 0,
        mock: false,
      });

      if (res.stop_reason === 'refusal') {
        this.logger.warn(`Refusal on ${params.meta.feature}: ${res.stop_details?.explanation ?? ''}`);
        throw new ServiceUnavailableException('AI javob berishdan bosh tortdi');
      }

      // parsed_output is null when the model's output did not satisfy the
      // schema. Treated as a failure rather than silently returning the
      // fallback, which would look like a working feature producing bland text.
      if (!res.parsed_output) {
        throw new ServiceUnavailableException('AI javobi kutilgan formatda emas');
      }
      return res.parsed_output as T;
    } catch (e: any) {
      if (e instanceof ServiceUnavailableException) throw e;
      this.logger.error(`Anthropic ${params.meta.feature} failed: ${e?.message ?? e}`);
      throw new ServiceUnavailableException('AI xizmati hozir mavjud emas');
    }
  }

  /// Streaming text, yielded as it arrives. Used by the tutor chat so a long
  /// answer starts appearing immediately instead of after a blank ten seconds.
  async *stream(params: {
    system: Anthropic.TextBlockParam[];
    messages: Anthropic.MessageParam[];
    maxTokens?: number;
    meta: UsageMeta;
  }): AsyncGenerator<string, void, void> {
    if (!this.client) {
      await this.record(params.meta, { input: 0, output: 0, cached: 0, mock: true });
      return;
    }

    const stream = this.client.messages.stream({
      model: MODEL,
      max_tokens: params.maxTokens ?? 2048,
      thinking: { type: 'adaptive' },
      system: params.system,
      messages: params.messages,
    });

    try {
      for await (const event of stream) {
        if (
          event.type === 'content_block_delta' &&
          event.delta.type === 'text_delta' &&
          event.delta.text
        ) {
          yield event.delta.text;
        }
      }

      const final = await stream.finalMessage();
      await this.record(params.meta, {
        input: final.usage.input_tokens,
        output: final.usage.output_tokens,
        cached: final.usage.cache_read_input_tokens ?? 0,
        mock: false,
      });
    } catch (e: any) {
      this.logger.error(`Anthropic stream ${params.meta.feature} failed: ${e?.message ?? e}`);
      throw new ServiceUnavailableException('AI xizmati hozir mavjud emas');
    }
  }

  /// Ledger write. Failures here are logged and swallowed: losing a usage row
  /// must never fail the learner's request.
  private async record(
    meta: UsageMeta,
    u: { input: number; output: number; cached: number; mock: boolean },
  ) {
    try {
      await this.prisma.aiUsage.create({
        data: {
          userId: meta.userId ?? null,
          feature: meta.feature,
          model: u.mock ? 'mock' : MODEL,
          inputTokens: u.input,
          outputTokens: u.output,
          cacheReadTokens: u.cached,
          mock: u.mock,
        },
      });
    } catch (e: any) {
      this.logger.warn(`AiUsage write failed: ${e?.message ?? e}`);
    }
  }
}
