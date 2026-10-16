import AppLayout from '@/components/AppLayout';

import CityRegulationsClient from './components/CityRegulationsClient';
import { getCityRegulationsPageData } from './data';

export const dynamic = 'force-dynamic';

export default async function CityRegulationsPage() {
  const data = await getCityRegulationsPageData();

  return (
    <AppLayout>
      <CityRegulationsClient initialData={data} />
    </AppLayout>
  );
}
