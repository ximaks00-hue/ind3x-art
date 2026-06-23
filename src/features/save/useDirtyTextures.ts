import { useEffect, useState } from "react";

import {
  getDirtyTexturePaths,
  subscribeTextureDocuments,
} from "../editor/textureDocument";

export function useDirtyTextureCount(): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const update = () => setCount(getDirtyTexturePaths().length);
    update();
    return subscribeTextureDocuments(update);
  }, []);

  return count;
}
