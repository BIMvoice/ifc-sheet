/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The "Install" entry of the Info dialog's About tab (#456). The "?" help menu
 * of #455 does not exist yet; this dialog is what the "?" key opens today, so
 * the entry lives here until that menu lands. Shown only when the browser has
 * offered the install prompt, or when the app is already installed.
 */

import { useSyncExternalStore } from 'react';
import { Download } from 'lucide-react';
import { useTranslation } from '@/i18n';
import { Button } from '@/components/ui/button';
import { getInstallState, promptInstall, subscribeInstallState } from './install-prompt';

export function InstallAppEntry() {
  const { t } = useTranslation();
  const { canInstall, installed } = useSyncExternalStore(subscribeInstallState, getInstallState, getInstallState);
  if (installed) return <p className="text-xs text-center text-muted-foreground" data-testid="install-app-installed">{t('offline.installed')}</p>;
  if (!canInstall) return null;
  return (
    <div className="flex flex-col items-center gap-1 pb-2 border-b">
      <Button type="button" size="sm" variant="outline" data-testid="install-app" onClick={() => { void promptInstall(); }}>
        <Download className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
        {t('offline.install')}
      </Button>
      <p className="text-xs text-muted-foreground">{t('offline.installHint')}</p>
    </div>
  );
}
