import { useRegisterSW } from 'virtual:pwa-register/react';
import { WifiOff, X } from 'lucide-react';
import { useT } from '@/i18n';

/** Avisa cuando la app quedó lista para usarse offline o cuando hay una versión nueva. */
export function PwaToast() {
  const { t } = useT();
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  if (!offlineReady && !needRefresh) return null;
  const close = () => {
    setOfflineReady(false);
    setNeedRefresh(false);
  };

  return (
    <div role="status" className="no-print fixed right-4 bottom-4 z-50 max-w-sm animate-fade-up">
      <div className="glass glass-strong glass-blur flex items-center gap-3 p-3 pr-2">
        <WifiOff size={18} className="text-accent shrink-0" aria-hidden="true" />
        <p className="text-sm">{needRefresh ? t('offline.update') : t('offline.ready')}</p>
        {needRefresh && (
          <button
            type="button"
            className="btn btn-primary px-3 py-1"
            onClick={() => updateServiceWorker(true)}
          >
            {t('offline.reload')}
          </button>
        )}
        <button
          type="button"
          className="btn btn-icon text-muted"
          onClick={close}
          aria-label={t('common.close')}
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
