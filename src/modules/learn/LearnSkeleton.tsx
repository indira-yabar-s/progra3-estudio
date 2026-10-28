import { PageSkeleton } from '@/components/ui/Skeleton';
import { translate } from '@/i18n';
import { useSettings } from '@/stores/settings';

export default function LearnSkeleton() {
  const locale = useSettings((s) => s.locale);
  return <PageSkeleton label={translate(locale, 'loading.page')} />;
}
