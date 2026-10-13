import { notFound } from 'next/navigation';
import { publicPageEnabled } from '@/lib/services/futureStr';
import FutureStrForm from './FutureStrForm';

export const dynamic = 'force-dynamic';

/** Public research invitation. Hidden (404) until FUTURE_STR_ENABLED=true. */
export default async function FutureOfStrPage({ searchParams }: { searchParams: Promise<{ a?: string; src?: string }> }) {
  if (!publicPageEnabled()) notFound();
  const { a, src } = await searchParams;
  return <FutureStrForm initialAudience={a === 'operator' ? 'operator' : 'homeowner'} source={(src ?? '').slice(0, 40)} />;
}
