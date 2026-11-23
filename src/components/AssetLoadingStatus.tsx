import React, { useSyncExternalStore } from 'react';
import { assetLoader } from '../gfx/assetLoader';

/** Loading is a preview, not final art readiness. It never gates gameplay. */
export const AssetLoadingStatus: React.FC = () => {
  useSyncExternalStore(assetLoader.subscribe, assetLoader.getVersion, assetLoader.getVersion);
  const records = assetLoader.diagnostics();
  const processing = assetLoader.getProcessing();
  const failed = records.filter(asset => asset.state === 'failed');
  const pending = records.filter(asset => asset.state === 'idle' || asset.state === 'queued' || asset.state === 'loading');
  const ready = records.filter(asset => asset.state === 'ready').length;
  const failures = failed.length + processing.failed;
  const state = failures ? 'failed' : pending.length || processing.pending || !records.length ? 'loading' : 'ready';
  return <div data-testid="asset-loading-status" data-asset-state={state}
    className="absolute bottom-8 left-2 z-20 max-w-[96px] sm:max-w-[150px] border border-[#6b4931] bg-[#1a110e]/95 p-1 font-pixel text-[10px] text-[#e8d0a8]">
    <div role="status" aria-live="polite">{state === 'ready' ? `Art ready (${ready})` : state === 'failed' ? `Art failed (${failures}) · Preview` : `Art loading ${ready}/${records.length}${processing.pending ? ` · processing ${processing.pending}` : ''} · Preview`}</div>
    {failures > 0 && <details><summary className="cursor-pointer">Asset details / retry</summary>
      <div className="absolute bottom-full left-0 w-64 border border-[#6b4931] bg-[#1a110e] p-2">{processing.failed > 0 && <div>Sprite processing failed. Retry to try again.</div>}<ul className="max-h-20 overflow-auto break-all">{failed.map(asset => <li key={asset.key}>{asset.key}: {asset.error}</li>)}</ul>
      <button type="button" className="min-h-11 border border-[#6b4931] px-2" onClick={() => assetLoader.retryFailed()}>Retry failed art</button></div>
    </details>}
  </div>;
};
