import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

import { rollDaily, type SystemEvent } from '../engine/player';
import type { Player } from '../engine/types';
import type { Quest } from '../lib/system';

// Progress lives on the phone only (no account). Keys are versioned so the format can migrate.
const PLAYER_KEY = 'shura.player.v1';
const QUEST_KEY = 'shura.activeQuest.v1';

export interface ActiveQuest {
  quest: Quest;
  hintLevel: number;
  hints: string[];
  draft: string;
  choices: (number | null)[];
  penalty: boolean;
}

interface Ctx {
  ready: boolean;
  player: Player | null;
  activeQuest: ActiveQuest | null;
  update: (fn: (p: Player) => Player | { player: Player; events?: SystemEvent[] }) => SystemEvent[];
  setPlayer: (p: Player) => void;
  setActiveQuest: (q: ActiveQuest | null) => void;
  reset: () => Promise<void>;
}

const PlayerCtx = createContext<Ctx | null>(null);

export function PlayerProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [player, setPlayerState] = useState<Player | null>(null);
  const [activeQuest, setActiveQuestState] = useState<ActiveQuest | null>(null);
  const playerRef = useRef<Player | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [p, q] = await Promise.all([AsyncStorage.getItem(PLAYER_KEY), AsyncStorage.getItem(QUEST_KEY)]);
        if (p) {
          const loaded = rollDaily(JSON.parse(p) as Player, Date.now()).player;
          playerRef.current = loaded;
          setPlayerState(loaded);
        }
        if (q) setActiveQuestState(JSON.parse(q) as ActiveQuest);
      } catch {
        // A corrupt save starts a new game rather than crashing; the raw value stays until overwritten.
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const setPlayer = useCallback((p: Player) => {
    playerRef.current = p;
    setPlayerState(p);
    AsyncStorage.setItem(PLAYER_KEY, JSON.stringify(p)).catch(() => {});
  }, []);

  const update = useCallback<Ctx['update']>(
    (fn) => {
      const current = playerRef.current;
      if (!current) return [];
      const out = fn(current);
      if ('version' in out) {
        setPlayer(out);
        return [];
      }
      setPlayer(out.player);
      return out.events ?? [];
    },
    [setPlayer],
  );

  const setActiveQuest = useCallback((q: ActiveQuest | null) => {
    setActiveQuestState(q);
    if (q) AsyncStorage.setItem(QUEST_KEY, JSON.stringify(q)).catch(() => {});
    else AsyncStorage.removeItem(QUEST_KEY).catch(() => {});
  }, []);

  const reset = useCallback(async () => {
    await AsyncStorage.multiRemove([PLAYER_KEY, QUEST_KEY]);
    playerRef.current = null;
    setPlayerState(null);
    setActiveQuestState(null);
  }, []);

  return (
    <PlayerCtx.Provider value={{ ready, player, activeQuest, update, setPlayer, setActiveQuest, reset }}>
      {children}
    </PlayerCtx.Provider>
  );
}

export function usePlayer(): Ctx {
  const ctx = useContext(PlayerCtx);
  if (!ctx) throw new Error('usePlayer outside PlayerProvider');
  return ctx;
}
