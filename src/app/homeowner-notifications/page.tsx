import AppLayout from '@/components/AppLayout';

import HomeownerNotificationsClient from './components/HomeownerNotificationsClient';
import { getHomeownerNotificationsPageData } from './data';

export const dynamic = 'force-dynamic';

export default async function HomeownerNotificationsPage() {
  const data = await getHomeownerNotificationsPageData();

  return (
    <AppLayout>
      <HomeownerNotificationsClient initialData={data} />
    </AppLayout>
  );
}
