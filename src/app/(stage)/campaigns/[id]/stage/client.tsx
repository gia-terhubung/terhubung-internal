'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/libs/supabase/client';
import { getPoolSampleAction, getStageStateAction } from '@/services/campaignDraw.actions';
import { buildReel, formatCount, formatCountdown, reelDelays, takeNewWinners } from '@/libs/campaignDraw';
import type { ReelName, StageState, StageWinner } from '@/types/campaignDraw.types';
import styles from './stage.module.css';

type Phase = 'idle' | 'top' | 'prize' | 'reel' | 'landed';

const PRIZE_INTRO_MS = 1200;
const TOP_STEP_MS = 700; // "10 besar" reveal: one name every 0.7 s
const LANDED_HOLD_MS = 3000;
const POLL_MS = 5000;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function Star({ bright }: { bright: boolean }) {
  return (
    <div className={`${styles.star} ${bright ? styles.starBright : ''}`} aria-hidden>
      <div className={styles.starGlow} />
      <svg viewBox="0 0 100 100">
        <path d="M50 0 C53 35 65 47 100 50 C65 53 53 65 50 100 C47 65 35 53 0 50 C35 47 47 35 50 0 Z" />
      </svg>
    </div>
  );
}

export function StageClient({ initial }: { initial: StageState }) {
  const campaignId = initial.campaignId;
  const [state, setState] = useState<StageState>(initial);
  const [phase, setPhase] = useState<Phase>(initial.winners.length > 0 ? 'landed' : 'idle');
  const [current, setCurrent] = useState<StageWinner | null>(initial.winners.at(-1) ?? null);
  const [reelName, setReelName] = useState<ReelName | null>(null);
  const [revealed, setRevealed] = useState<StageWinner[]>(initial.winners);
  const [now, setNow] = useState(() => Date.now());
  const [offline, setOffline] = useState(false);

  // Seeded with winners already drawn, so a reload mid-show replays nothing.
  const knownRef = useRef(new Set(initial.winners.map((w) => w.id)));
  const queueRef = useRef<StageWinner[]>([]);
  const runningRef = useRef(false);
  const refreshingRef = useRef(false);
  const failuresRef = useRef(0);
  const reducedRef = useRef(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    reducedRef.current = mq.matches;
    const onChange = (e: MediaQueryListEvent) => {
      reducedRef.current = e.matches;
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const reveal = useCallback(
    async (w: StageWinner) => {
      setCurrent(w);
      if (reducedRef.current) {
        setPhase('landed');
        setRevealed((r) => [...r, w]);
        await sleep(LANDED_HOLD_MS);
        return;
      }
      setPhase('prize');
      const [sample] = await Promise.all([
        getPoolSampleAction(campaignId, w.prize_type).catch(() => [] as ReelName[]),
        sleep(PRIZE_INTRO_MS),
      ]);
      const delays = reelDelays();
      const reel = buildReel(sample, w, delays.length);
      setPhase('reel');
      for (let i = 0; i < reel.length; i++) {
        setReelName(reel[i]);
        await sleep(delays[i]);
      }
      setPhase('landed');
      setRevealed((r) => [...r, w]);
      await sleep(LANDED_HOLD_MS);
    },
    [campaignId]
  );

  // One reveal at a time; winners drawn in quick succession wait their turn.
  const runQueue = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    try {
      while (queueRef.current.length > 0) {
        const next = queueRef.current.shift()!;
        await reveal(next);
      }
    } finally {
      runningRef.current = false;
    }
  }, [reveal]);

  const refresh = useCallback(async () => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    try {
      const next = await getStageStateAction(campaignId);
      failuresRef.current = 0;
      setOffline(false);
      if (!next) return;
      setState(next);
      const fresh = takeNewWinners(knownRef.current, next.winners);
      if (fresh.length === 0) return;
      fresh.forEach((w) => knownRef.current.add(w.id));
      queueRef.current.push(...fresh);
      void runQueue();
    } catch {
      // Keep showing the last good state; the next poll retries.
      failuresRef.current += 1;
      if (failuresRef.current >= 2) setOffline(true);
    } finally {
      refreshingRef.current = false;
    }
  }, [campaignId, runQueue]);

  const refreshRef = useRef(refresh);
  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`campaign:${campaignId}`)
      // Public broadcast channel: any anon-key client could send here, so the
      // payload is never read or rendered — it only triggers a server refetch.
      .on('broadcast', { event: 'winner' }, () => {
        void refreshRef.current();
      })
      .subscribe((status) => {
        // Initial join and every reconnect: catch up on anything missed.
        if (status === 'SUBSCRIBED') void refreshRef.current();
      });
    // Fallback when realtime is down or public channels are disabled.
    const poll = setInterval(() => {
      void refreshRef.current();
    }, POLL_MS);
    return () => {
      clearInterval(poll);
      void supabase.removeChannel(channel);
    };
  }, [campaignId]);

  function toggleFullscreen() {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen();
  }

  // Optional "10 besar" reveal, stage-local (no broadcast: public channels are spoofable).
  // Ignored while a winner reveal runs; a new winner reveal replaces it automatically.
  const toggleTop = useCallback(() => {
    if (runningRef.current) return;
    setPhase((p) => (p === 'top' ? (current ? 'landed' : 'idle') : state.top.length > 0 ? 'top' : p));
  }, [current, state.top.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 't' || e.key === 'T') toggleTop();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggleTop]);

  const { theme } = state;
  const cssVars = {
    '--stage-bg': theme.colors.background,
    '--stage-gold': theme.colors.primary,
    '--stage-olive': theme.colors.accent,
  } as React.CSSProperties;
  const msLeft = Date.parse(state.draw_at) - now;
  const isGrand = current?.prize_type === 'grand';
  const bright = isGrand && (phase === 'reel' || phase === 'landed');
  const kindLabel = isGrand ? 'Hadiah utama' : 'Hadiah';

  return (
    <div className={styles.stage} style={cssVars}>
      <Star bright={bright} />
      <div className={styles.controls}>
        <button type="button" className={styles.fullscreenBtn} onClick={toggleTop} disabled={state.top.length === 0}
          title={state.top.length === 0 ? 'Muncul setelah peserta dibekukan' : 'Tombol T'}>
          {state.top.length || state.topN} besar
        </button>
        <button type="button" className={styles.fullscreenBtn} onClick={toggleFullscreen}>
          Layar penuh
        </button>
      </div>

      <main className={styles.center}>
        {phase === 'idle' && (
          <>
            <h1 className={`${styles.display} ${styles.title}`}>{theme.title}</h1>
            {theme.subtitle && <p className={styles.verse}>{theme.subtitle}</p>}
            {theme.verse && <p className={styles.verse}>{theme.verse}</p>}
            <p className={styles.label}>{msLeft > 0 ? 'Pengundian dimulai dalam' : 'Pengundian segera dimulai'}</p>
            {/* Date.now() differs between the server render and hydration; the next tick corrects it. */}
            {msLeft > 0 && (
              <div suppressHydrationWarning className={`${styles.display} ${styles.countdown}`}>
                {formatCountdown(msLeft)}
              </div>
            )}
            <p className={styles.participants}>{formatCount(state.participants)} jemaat ikut</p>
          </>
        )}

        {phase === 'top' && (
          <>
            <p className={styles.label}>Hadiah tetap · peringkat teratas semua gereja</p>
            <h1 className={`${styles.display} ${styles.prizeName}`}>{state.top.length} besar</h1>
            <ol className={styles.topList} style={{ gridTemplateRows: `repeat(${Math.ceil(state.top.length / 2)}, auto)` }}>
              {state.top.map((t, i) => (
                <li key={t.rank} className={styles.topItem} style={{ animationDelay: `${(i + 1) * TOP_STEP_MS}ms` }}>
                  <span className={`${styles.display} ${styles.topRank}`}>{t.rank}</span>
                  <span>
                    <span className={`${styles.display} ${styles.topName}`}>{t.display_name}</span>{' '}
                    <span className={styles.topChurch}>{t.church_name}</span>
                  </span>
                </li>
              ))}
            </ol>
          </>
        )}

        {phase === 'prize' && current && (
          <>
            <p className={styles.label}>{kindLabel}</p>
            {current.prize_image_url && (
              // eslint-disable-next-line @next/next/no-img-element -- admin-uploaded prize photo, plain img like prizes/client.tsx
              <img key={`${current.id}-img`} src={current.prize_image_url} alt="" className={styles.prizeImage} />
            )}
            <h1 key={`${current.id}-prize`} className={`${styles.display} ${styles.prizeName}`}>
              {current.prize_name}
            </h1>
          </>
        )}

        {phase === 'reel' && current && reelName && (
          <>
            <p className={styles.label}>
              {kindLabel}: {current.prize_name}
            </p>
            <div className={`${styles.display} ${styles.reelName}`}>{reelName.display_name}</div>
            <p className={styles.reelChurch}>{reelName.church_name}</p>
          </>
        )}

        {phase === 'landed' && current && (
          <div aria-live="polite" style={{ display: 'contents' }}>
            <div key={`${current.id}-flare`} className={styles.flare} aria-hidden />
            <div key={`${current.id}-ring`} className={styles.flareRing} aria-hidden />
            <p className={styles.label}>
              Pemenang {kindLabel.toLowerCase()}: {current.prize_name}
            </p>
            <h1 key={`${current.id}-name`} className={`${styles.display} ${styles.winnerName}`}>
              {current.display_name}
            </h1>
            <p className={styles.winnerChurch}>{current.church_name}</p>
          </div>
        )}
      </main>

      {revealed.length > 0 && (
        <footer className={styles.strip}>
          {[...revealed]
            .reverse()
            .slice(0, 6)
            .map((w) => (
              <div key={w.id} className={styles.stripItem}>
                <span className={styles.stripName}>{w.display_name}</span>
                <span>{w.prize_name}</span>
              </div>
            ))}
        </footer>
      )}

      {offline && <span className={styles.offline} title="Koneksi terputus, mencoba lagi" />}
    </div>
  );
}
