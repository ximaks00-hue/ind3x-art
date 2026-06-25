import { invalidateCatalogIconCacheForHandle, resetCatalogIconCache } from "../features/catalog/catalogIconCache";
import { resetCatalogIconPipeline } from "../features/catalog/catalogIconPipeline";
import { useCatalogStore } from "../features/catalog/catalogStore";
import {
  clearStudioResolveCache,
  clearStudioResolveCacheForHandle,
} from "../features/catalog/studioResolveCache";
import { resetThumbnailCache } from "../features/explorer/thumbnailCache";
import { useProjectStore } from "../state/projectStore";

export type ProjectCacheScope = "explorer" | "catalog" | "icons" | "studio" | "thumbnails";

export type InvalidateProjectCachesOptions = Partial<Record<ProjectCacheScope, boolean>>;

function hasExplicitScope(options: InvalidateProjectCachesOptions): boolean {
  return Object.values(options).some(Boolean);
}

/** Invalidate explorer, catalog, icon, studio, and thumbnail caches in one place. */
export function invalidateProjectCaches(
  options: InvalidateProjectCachesOptions = {},
): void {
  const all = !hasExplicitScope(options);
  const scopes = {
    explorer: all || Boolean(options.explorer),
    catalog: all || Boolean(options.catalog),
    icons: all || Boolean(options.icons),
    studio: all || Boolean(options.studio),
    thumbnails: all || Boolean(options.thumbnails),
  };

  const handle = useProjectStore.getState().handle;

  if (scopes.thumbnails) {
    resetThumbnailCache();
  }

  if (scopes.icons) {
    if (handle) {
      invalidateCatalogIconCacheForHandle(handle.id);
    } else {
      resetCatalogIconCache();
    }
    resetCatalogIconPipeline();
    console.debug("[project] invalidated icon caches", { handleId: handle?.id ?? null });
  }

  if (scopes.studio) {
    if (handle) {
      clearStudioResolveCacheForHandle(handle.id);
    } else {
      clearStudioResolveCache();
    }
  }

  if (scopes.explorer) {
    useProjectStore.getState().bumpQueryRevision();
  }

  if (scopes.catalog) {
    if (handle) {
      // APP-009: icons/studio scopes may have already cleared these in the same call.
      if (!scopes.icons) {
        invalidateCatalogIconCacheForHandle(handle.id);
      }
      if (!scopes.studio) {
        clearStudioResolveCacheForHandle(handle.id);
      }
    }
    useCatalogStore.setState((s) => ({ queryRevision: s.queryRevision + 1 }));
    console.debug("[project] bumped catalog query revision", {
      handleId: handle?.id ?? null,
      skippedIconInvalidation: scopes.icons,
      skippedStudioInvalidation: scopes.studio,
    });
  }
}

/** Bump explorer + catalog query revisions (includes catalog icon/studio derived caches). */
export function bumpProjectDataRevision(): void {
  invalidateProjectCaches({ explorer: true, catalog: true });
}

/** Refresh catalog queries and derived studio/icon caches without touching explorer assets. */
export function refreshCatalogCaches(): void {
  invalidateProjectCaches({ catalog: true });
}
