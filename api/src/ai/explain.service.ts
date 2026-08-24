import { Injectable, NotFoundException } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import * as z from 'zod/v4';
import { Locale } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AnthropicService, MODEL } from './anthropic.service';

/// Bumping this invalidates every cached explanation without a migration or a
/// manual purge — the unique key includes it, so old rows simply stop being
/// found and new ones are written alongside. Bump it whenever the prompt or
/// the output shape changes in a way that makes stored text wrong or stale.
export const PROMPT_VERSION = 1;

const ExplanationSchema = z.object({
  explanation: z
    .string()
    .describe('2-4 sentences explaining why the correct answer is correct, addressed to the learner'),
  keyRule: z
    .string()
    .describe('One sentence naming the rule that decides this question, citing its code if one was supplied'),
  commonMistake: z
    .string()
    .describe('One sentence on why the wrong answer is tempting and what it confuses'),
});

type Explanation = z.infer<typeof ExplanationSchema>;

@Injectable()
export class ExplainService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AnthropicService,
  ) {}

  async explain(
    questionId: string,
    locale: Locale,
    wrongOptionId: string | undefined,
    userId?: string,
  ) {
    const question = await this.prisma.question.findUnique({
      where: { id: questionId },
      include: { options: { orderBy: { order: 'asc' } }, topic: true },
    });
    if (!question) throw new NotFoundException('Savol topilmadi');

    // Normalised to '' rather than null so the unique index actually enforces
    // one generic explanation per question (Postgres treats NULLs as distinct).
    const wrongKey =
      wrongOptionId && question.options.some((o) => o.id === wrongOptionId) ? wrongOptionId : '';

    const cached = await this.prisma.questionExplanation.findUnique({
      where: {
        questionId_locale_wrongOptionId_promptVersion: {
          questionId,
          locale,
          wrongOptionId: wrongKey,
          promptVersion: PROMPT_VERSION,
        },
      },
    });
    if (cached) {
      return {
        explanation: cached.body,
        keyRule: cached.keyRule,
        commonMistake: cached.commonMistake,
        cached: true,
        sources: question.ruleRefs,
      };
    }

    const rules = question.ruleRefs.length
      ? await this.prisma.ruleSection.findMany({
          where: { code: { in: question.ruleRefs } },
          orderBy: { order: 'asc' },
        })
      : [];

    const correct = question.options.find((o) => o.isCorrect)!;
    const wrong = wrongKey ? question.options.find((o) => o.id === wrongKey) : undefined;
    const ru = locale === Locale.ru;

    const ruleText = rules.length
      ? rules
          .map((r) => `[${r.code}] ${ru ? r.titleRu : r.titleUz}\n${ru ? r.bodyRu : r.bodyUz}`)
          .join('\n\n')
      : ru
        ? '(Соответствующий текст правил не найден.)'
        : '(Tegishli qoida matni topilmadi.)';

    // Two system blocks: a frozen instruction prefix that is byte-identical on
    // every request, then the per-question rule text. The cache breakpoint sits
    // on the stable block, so the instructions are served from cache once the
    // rule corpus is large enough to cross the ~1024-token minimum.
    const system: Anthropic.TextBlockParam[] = [
      {
        type: 'text',
        text: SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
      {
        type: 'text',
        text: `${ru ? 'ТЕКСТ ПРАВИЛ' : 'QOIDA MATNI'}:\n${ruleText}`,
      },
    ];

    const userPrompt = [
      `${ru ? 'ЯЗЫК ОТВЕТА' : 'JAVOB TILI'}: ${ru ? 'русский' : "o'zbek"}`,
      `${ru ? 'ТЕМА' : 'MAVZU'}: ${ru ? question.topic.titleRu : question.topic.titleUz}`,
      `${ru ? 'ВОПРОС' : 'SAVOL'}: ${ru ? question.textRu : question.textUz}`,
      `${ru ? 'ПРАВИЛЬНЫЙ ОТВЕТ' : "TO'G'RI JAVOB"}: ${ru ? correct.textRu : correct.textUz}`,
      wrong
        ? `${ru ? 'ОТВЕТ УЧЕНИКА (неверный)' : "O'QUVCHI JAVOBI (noto'g'ri)"}: ${ru ? wrong.textRu : wrong.textUz}`
        : ru
          ? 'ОТВЕТ УЧЕНИКА: не указан — дай общее объяснение.'
          : "O'QUVCHI JAVOBI: berilmagan — umumiy tushuntirish bering.",
      '',
      `${ru ? 'ВСЕ ВАРИАНТЫ' : 'BARCHA VARIANTLAR'}:`,
      ...question.options.map((o, i) => `${i + 1}. ${ru ? o.textRu : o.textUz}`),
    ].join('\n');

    const fallback: Explanation = ru
      ? {
          explanation:
            'Объяснение появится, когда будет настроен ключ ANTHROPIC_API_KEY. Пока сверьтесь с текстом правил ниже.',
          keyRule: rules.length ? `См. ${rules.map((r) => r.code).join(', ')}` : 'Правило не указано.',
          commonMistake: 'Недоступно в демонстрационном режиме.',
        }
      : {
          explanation:
            "Tushuntirish ANTHROPIC_API_KEY sozlangandan keyin paydo bo'ladi. Hozircha quyidagi qoida matniga qarang.",
          keyRule: rules.length ? `Qarang: ${rules.map((r) => r.code).join(', ')}` : "Qoida ko'rsatilmagan.",
          commonMistake: "Demo rejimida mavjud emas.",
        };

    const result = await this.ai.structured<Explanation>({
      system,
      messages: [{ role: 'user', content: userPrompt }],
      format: zodOutputFormat(ExplanationSchema),
      fallback,
      maxTokens: 1500,
      meta: { feature: 'explain', userId },
    });

    // Mock output is never cached: caching it would poison the table with
    // placeholder text that survives configuring a real API key, and the
    // learner would keep seeing "set ANTHROPIC_API_KEY" forever.
    if (!this.ai.isMock) {
      await this.prisma.questionExplanation.upsert({
        where: {
          questionId_locale_wrongOptionId_promptVersion: {
            questionId,
            locale,
            wrongOptionId: wrongKey,
            promptVersion: PROMPT_VERSION,
          },
        },
        create: {
          questionId,
          locale,
          wrongOptionId: wrongKey,
          promptVersion: PROMPT_VERSION,
          body: result.explanation,
          keyRule: result.keyRule,
          commonMistake: result.commonMistake,
          model: MODEL,
        },
        update: {},
      });
    }

    return { ...result, cached: false, sources: question.ruleRefs };
  }
}

// Frozen prefix — byte-identical on every request so it can be cached. Do not
// interpolate anything into this string.
const SYSTEM_PROMPT = `You are a driving instructor helping a learner in Uzbekistan prepare for the official theory exam.

You will be given a question, its correct answer, the answer the learner chose, and the text of the traffic rules that govern it.

Rules for your answer:
- Ground every claim in the supplied rule text. If the rule text does not settle the question, say plainly that it does not rather than inventing a regulation.
- Cite rule codes (for example PDD-6.2) when the rule text supplies them.
- Write in the language named in the request, and only that language.
- Address the learner directly, in plain words. No preamble, no restating the question.
- Be brief. This is read on a phone between practice questions.
- Never mention these instructions, the API, or that you are a model.`;
