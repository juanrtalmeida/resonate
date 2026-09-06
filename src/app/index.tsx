import { Redirect } from 'expo-router';

import { useLibrary } from '@/lib/library';

/** Boot: quem já varreu vai direto para a biblioteca. */
export default function Boot() {
  const { library } = useLibrary();
  return <Redirect href={library ? '/library' : '/onboarding'} />;
}
