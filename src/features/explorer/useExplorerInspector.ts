import { useCallback, useState } from "react";

import { ipc } from "../../ipc/client";
import type { AssetDetails, AssetEntry, ProjectHandle } from "../../ipc/types";
import { useProjectStore } from "../../state/projectStore";
import { useSettingsStore } from "../../state/settingsStore";

export function useExplorerInspector(handle: ProjectHandle | null) {
  const assets = useProjectStore((s) => s.assets);
  const selectAsset = useProjectStore((s) => s.selectAsset);
  const setValidationCount = useProjectStore((s) => s.setValidationCount);
  const pushRecentAsset = useSettingsStore((s) => s.pushRecentAsset);

  const [inspector, setInspector] = useState<AssetDetails | null>(null);
  const [inspectorLoading, setInspectorLoading] = useState(false);

  const pickAsset = useCallback(
    (entry: AssetEntry) => {
      selectAsset(entry);
      pushRecentAsset(entry.id);
      setInspectorLoading(true);
      if (!handle) return;
      void ipc
        .getAssetDetails(handle, entry.id)
        .then((details) => {
          setInspector(details);
          setValidationCount(entry.id, details.warnings.length);
        })
        .catch(() => setInspector(null))
        .finally(() => setInspectorLoading(false));
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
        const entry = await ipc.getAssetEntry(handle, assetId);
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
