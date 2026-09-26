import { useCallback, useEffect, useState } from 'react';

import { getPack, type DataSource } from './api';
import type { Pack } from './types';

// Packs are immutable per version, so a session-long cache is safe and lets the rank map and
// competency screens share one fetch.
const cache = new Map<string, { pack: Pack; source: DataSource }>();

export function usePack(id: string | undefined) {
  const cached = id ? cache.get(id) : undefined;
  const [pack, setPack] = useState<Pack | null>(cached?.pack ?? null);
  const [source, setSource] = useState<DataSource | null>(cached?.source ?? null);
  const [loading, setLoading] = useState(!cached);
  const [missing, setMissing] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    const hit = cache.get(id);
    if (hit) {
      setPack(hit.pack);
      setSource(hit.source);
      setLoading(false);
      return;
    }
    setLoading(true);
    setMissing(false);
    const { data, source: src } = await getPack(id);
    if (data) {
      cache.set(id, { pack: data, source: src });
      setPack(data);
      setSource(src);
    } else {
      setMissing(true);
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  return { pack, source, loading, missing, reload: load };
}
