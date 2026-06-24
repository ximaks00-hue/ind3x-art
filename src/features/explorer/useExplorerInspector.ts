import { useCallback, useRef, useState } from "react";

import type { AssetDetails, AssetEntry, ProjectHandle } from "../../ipc/types";
import { getAssetDetails, getAssetEntry } from "../../app/services/explorerService";
import { useProjectStore } from "../../state/projectStore";
import { useSettingsStore } from "../../state/settingsStore";

export function useExplorerInspector(handle: ProjectHandle | null) {
  const assets = useProjectStore((s) => s.assets);
  const selectAsset = useProjectStore((s) => s.selectAsset);
  const setValidationCount = useProjectStore((s) => s.setValidationCount);
  const pushRecentAsset = useSettingsStore((s) => s.pushRecentAsset);

  const [inspector, setInspector] = useState<AssetDetails | null>(null);
  const [inspectorLoading, setInspectorLoading] = useState(false);
  const requestId = useRef(0);

  const pickAsset = useCallback(
    (entry: AssetEntry) => {
      const currentHandle = handle;
      selectAsset(entry);
      pushRecentAsset(entry.id);
      if (!currentHandle) {
        setInspectorLoading(false);
        return;
      }
      const id = ++requestId.current;
      setInspectorLoading(true);
      void getAssetDetails(currentHandle, entry.id)
        .then((details) => {
          if (id !== requestId.current) return;
          const active = useProjectStore.getState().selectedAsset;
          if (!active || active.id !== entry.id) return;
          setInspector(details);
          setValidationCount(entry.id, details.warnings.length);
        })
        .catch(() => {
          if (id === requestId.current) {
            setInspector(null);
          }
        })
        .finally(() => {
          if (id === requestId.current) {
            setInspectorLoading(false);
          }
        });
    },
    [handle, selectAsset, pushRecentAsset, setValidationCount],
  );

  const pickAssetById = useCallback(
    async (assetId: string) => {
      if (!handle) return;
      const cached = assets.find((a) => a.id === assetId);
      if (cached) {
        pickAsset(cached);
        return;
      }
      try {
        const entry = await getAssetEntry(handle, assetId);
        pickAsset(entry);
      } catch {
        // ignore
      }
    },
    [handle, assets, pickAsset],
  );

  return {
    inspector,
    inspectorLoading,
    pickAsset,
    pickAssetById,
  };
}
