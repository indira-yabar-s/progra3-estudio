import { Bone } from '@/components/ui/Skeleton';
import { translate } from '@/i18n';
import { useSettings } from '@/stores/settings';

/** Skeleton del verificador: misma geometría que la página real (no hay saltos de layout). */
export default function VerifierSkeleton() {
  const locale = useSettings((s) => s.locale);
  return (
    <div
      className="mx-auto grid max-w-[1600px] grid-cols-[minmax(0,1fr)] gap-4 px-3 pt-4 pb-10 sm:px-5 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]"
      role="status"
      aria-busy="true"
    >
      <span className="sr-only">{translate(locale, 'loading.page')}</span>
      <div className="glass flex flex-col overflow-hidden">
        <div className="border-line flex gap-2 border-b p-3">
          <Bone className="h-10 flex-1" />
          <Bone className="size-10" />
        </div>
        <div className="grid h-[46vh] min-h-[340px] content-start gap-2.5 p-4 xl:h-[calc(100dvh-300px)]">
          {[62, 38, 30, 0, 44, 70, 56, 18, 0, 44, 66, 52, 18].map((w, i) => (
            <Bone key={i} className="h-3.5" style={{ width: `${w}%`, opacity: w ? 1 : 0 }} />
          ))}
        </div>
        <div className="border-line flex justify-end border-t p-3">
          <Bone className="h-10 w-32" />
        </div>
      </div>
      <div className="grid content-start gap-4">
        <div className="glass p-6">
          <Bone className="h-6 w-2/3" />
          <Bone className="mt-3 h-4 w-1/2" />
          <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Bone key={i} className="h-16" />
            ))}
          </div>
        </div>
        <Bone className="h-11 w-full" />
        <div className="glass h-56 p-4">
          <Bone className="h-4 w-40" />
        </div>
      </div>
    </div>
  );
}
