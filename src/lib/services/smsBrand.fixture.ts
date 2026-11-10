import { ALL_TEMPLATE_SEEDS } from '@/lib/emailTemplateSeeds';
import { SMS_TEMPLATE_SEEDS } from '@/lib/smsTemplateSeeds';

export const EMAIL_TEMPLATE_SEEDS_FOR_TEST: string[] = [
  ...ALL_TEMPLATE_SEEDS.flatMap((t) => [t.name, t.subject, t.body]),
  ...Object.values(SMS_TEMPLATE_SEEDS as unknown as Record<string, { body?: string }> | Array<{ body?: string }>).map((t) => t.body ?? ''),
];
