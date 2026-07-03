import { getAppVersionConfigs } from '@/services/appConfig.service';
import { AppConfigClient } from './client';

export default async function AppConfigPage() {
  const configs = await getAppVersionConfigs();
  return <AppConfigClient configs={configs} />;
}
