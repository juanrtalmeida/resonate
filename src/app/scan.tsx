import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EqBars } from '@/components/eq-bars';
import { ScanRing } from '@/components/icons';
import { Body, Display, Mono } from '@/components/text';
import { C, R, T, alpha } from '@/constants/theme';
import { useLibrary } from '@/lib/library';
import { usePrefs, useT } from '@/lib/prefs';
import { scan, type ScanProgress } from '@/lib/scan';

const START: ScanProgress = { done: 0, total: 0, file: '', albums: 0, artists: 0, hours: 0 };

export default function Scan() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { accent, sources, granted } = usePrefs();
  const t = useT();
  const { replace } = useLibrary();

  const [progress, setProgress] = useState<ScanProgress>(START);
  const [failed, setFailed] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    scan(sources, granted, setProgress)
      .then((library) => {
        replace(library);
        // Deixa o 100% aparecer antes de trocar de tela, como no protótipo.
        setTimeout(() => router.replace('/library'), 900);
      })
      .catch(() => setFailed(true));
  }, [sources, granted, replace, router]);

  const pct = progress.total ? progress.done / progress.total : 0;
  const done = pct >= 1;

  return (
    <View style={{ flex: 1, backgroundColor: C.surface, alignItems: 'center', paddingHorizontal: 26, paddingTop: insets.top + 38 }}>
      <Glow accent={accent} />

      <Mono size={10} weight={500} tracking={0.2} caps color={accent}>
        {t('scan.title')}
      </Mono>
      <Display size={27} tracking={-0.03} align="center" style={{ marginTop: 11 }}>
        {t(failed ? 'scan.failed' : done ? 'scan.done' : 'scan.reading')}
      </Display>

      <View style={{ width: 236, height: 236, marginTop: 34, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ position: 'absolute' }}>
          <ScanRing progress={pct} color={accent} />
        </View>
        <Display size={56} weight={800} tracking={-0.05} align="center">
          {Math.round(pct * 100)}%
        </Display>
        <Mono size={10.5} weight={500} tracking={0.1} color={T.t42} style={{ marginTop: 6 }}>
          {progress.done} {t('count.filesUnit')}
        </Mono>
      </View>

      <View style={{ marginTop: 26 }}>
        <EqBars count={26} width={4} gap={3} height={34} color={accent} playing={!done && !failed} />
      </View>

      <View
        style={{
          width: '100%',
          marginTop: 22,
          padding: 13,
          borderRadius: 14,
          backgroundColor: C.card,
          borderWidth: 1,
          borderColor: T.t06,
        }}>
        <Mono size={11} color={T.t46} numberOfLines={1}>
          {progress.file || '…'}
        </Mono>
      </View>

      <View style={{ flexDirection: 'row', gap: 9, width: '100%', marginTop: 14 }}>
        <Stat value={progress.albums} label={t('scan.albums')} />
        <Stat value={progress.artists} label={t('scan.artists')} />
        <Stat value={progress.hours} label={t('scan.hours')} />
      </View>

      {failed && (
        <Pressable
          onPress={() => router.replace('/onboarding')}
          style={{
            marginTop: 22,
            paddingVertical: 13,
            paddingHorizontal: 18,
            borderRadius: R.r15,
            borderWidth: 1,
            borderColor: alpha(accent, 0.5),
          }}>
          <Body size={13.5} weight={600}>
            {t('scan.back')}
          </Body>
        </Pressable>
      )}
    </View>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <View style={{ flex: 1, paddingVertical: 12, borderRadius: 14, backgroundColor: C.card, alignItems: 'center' }}>
      <Display size={22} tracking={-0.02}>
        {value}
      </Display>
      <Body size={10.5} color={T.t4} style={{ marginTop: 2 }}>
        {label}
      </Body>
    </View>
  );
}

function Glow({ accent }: { accent: string }) {
  const pulse = useSharedValue(0.35);
  useEffect(() => {
    pulse.value = withRepeat(withTiming(0.8, { duration: 3200 }), -1, true);
  }, [pulse]);
  const style = useAnimatedStyle(() => ({
    opacity: pulse.value,
    transform: [{ scale: 0.92 + pulse.value * 0.2 }],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          top: 110,
          width: 380,
          height: 380,
          borderRadius: 190,
          experimental_backgroundImage: `radial-gradient(circle at 50% 50%, ${accent} 0%, transparent 62%)`,
        },
        style,
      ]}
    />
  );
}
