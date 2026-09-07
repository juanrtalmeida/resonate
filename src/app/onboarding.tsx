import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EqBars } from '@/components/eq-bars';
import { ArrowRight, ChevronRight, Folder, FolderPlus } from '@/components/icons';
import { Body, Display, Mono } from '@/components/text';
import { C, R, T, alpha } from '@/constants/theme';
import { usePrefs } from '@/lib/prefs';
import {
  canBrowseFolders,
  displayPath,
  ensureAccess,
  foldersOf,
  importFiles,
  listAudioFiles,
  pickFolder,
  type Folder as Src,
} from '@/lib/sources';

type State =
  | { kind: 'loading' }
  | { kind: 'denied' }
  | { kind: 'unavailable' }
  | { kind: 'ready'; folders: Src[]; on: Record<string, boolean> };

/** Pede acesso e lista as pastas. Fora do componente: não toca em estado do React. */
async function look(granted: string[]): Promise<State> {
  const access = await ensureAccess();
  if (access === 'denied') return { kind: 'denied' };
  if (access === 'unavailable') return { kind: 'unavailable' };
  // refresh: o onboarding é o ponto em que a lista deve ser relida do aparelho.
  const folders = foldersOf(await listAudioFiles(true, granted));
  return {
    kind: 'ready',
    folders,
    on: Object.fromEntries(folders.map((f) => [f.path, true])),
  };
}

export default function Onboarding() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { accent, granted, setSources, grantFolder } = usePrefs();
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [importing, setImporting] = useState(false);

  const refresh = useCallback(async () => {
    setState({ kind: 'loading' });
    setState(await look(granted));
  }, [granted]);

  useEffect(() => {
    let alive = true;
    look(granted).then((next) => {
      if (alive) setState(next);
    });
    return () => {
      alive = false;
    };
    // Só na montagem: reler a cada mudança de `granted` recomeçaria a busca no meio dela.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selected =
    state.kind === 'ready' ? state.folders.filter((f) => state.on[f.path]) : [];
  const total = selected.reduce((n, f) => n + f.count, 0);

  const start = () => {
    if (!total) return;
    setSources(selected.map((f) => f.path));
    router.replace('/scan');
  };

  const onImport = async () => {
    setImporting(true);
    try {
      if (await importFiles()) await refresh();
    } finally {
      setImporting(false);
    }
  };

  /** Android: o seletor do sistema é o único caminho para pastas fora da mídia indexada. */
  const onBrowse = async () => {
    const uri = await pickFolder();
    if (!uri) return;
    grantFolder(uri);
    setState({ kind: 'loading' });
    setState(await look([...granted, uri]));
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.surface }}>
      <Glow accent={accent} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: insets.top + 34,
          paddingHorizontal: 26,
          paddingBottom: Math.max(insets.bottom, 20) + 20,
          flexGrow: 1,
        }}>
        <Mono size={10} weight={500} tracking={0.2} caps color={accent}>
          Primeira execução
        </Mono>
        <Display size={38} tracking={-0.035} style={{ marginTop: 14 }}>
          Vamos achar o que já está aqui.
        </Display>
        <Body size={14.5} color="rgba(246,241,234,.58)" style={{ marginTop: 14, lineHeight: 21.75 }}>
          Sem login, sem streaming. O Resonate lê os arquivos que já estão no seu aparelho e
          deixa cada um deles exatamente onde está.
        </Body>

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: 30,
            marginBottom: 12,
          }}>
          <Mono size={10} weight={500} tracking={0.16} caps color={T.t4}>
            {canBrowseFolders ? 'Onde eu procuro?' : 'O que já foi importado'}
          </Mono>
          {state.kind === 'ready' && (
            <Body size={12} color={T.t4}>
              {selected.length} de {state.folders.length} selecionadas
            </Body>
          )}
        </View>

        {state.kind === 'loading' && (
          <View style={{ alignItems: 'center', gap: 12, marginTop: 24 }}>
            <ActivityIndicator color={accent} />
            <Body size={12.5} color={T.t42}>
              Vendo o que tem no aparelho…
            </Body>
          </View>
        )}

        {state.kind === 'denied' && (
          <Notice accent={accent} onRetry={refresh} title="Sem acesso aos arquivos de áudio">
            Libere o acesso a música nas configurações do sistema e toque aqui para tentar de
            novo.
          </Notice>
        )}

        {state.kind === 'unavailable' && (
          <Notice accent={accent} title="Este app precisa de um development build">
            A leitura da biblioteca de mídia usa um módulo nativo que o Expo Go não tem. Feche
            e rode `npx expo run:android`. As pastas escolhidas à mão continuam funcionando.
          </Notice>
        )}

        {state.kind === 'ready' && state.folders.length === 0 && (
          <Body size={13.5} color={T.t55}>
            {canBrowseFolders
              ? 'Nenhum arquivo de áudio encontrado neste aparelho.'
              : 'Nenhuma música aqui ainda. Importe arquivos ou arraste-os para a pasta do Resonate no app Arquivos.'}
          </Body>
        )}

        <View style={{ gap: 9 }}>
          {state.kind === 'ready' &&
            state.folders.map((folder, i) => (
              <FolderRow
                key={folder.path}
                folder={folder}
                on={state.on[folder.path]}
                accent={accent}
                delay={120 + i * 70}
                onToggle={() =>
                  setState((prev) =>
                    prev.kind === 'ready'
                      ? { ...prev, on: { ...prev.on, [folder.path]: !prev.on[folder.path] } }
                      : prev
                  )
                }
              />
            ))}
        </View>

        <View style={{ flex: 1, minHeight: 20 }} />

        <Pressable
          onPress={canBrowseFolders ? onBrowse : onImport}
          disabled={importing}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            paddingVertical: 13,
            paddingHorizontal: 15,
            borderRadius: R.r15,
            borderWidth: 1,
            borderStyle: 'dashed',
            borderColor: T.t18,
            marginBottom: 11,
            opacity: importing ? 0.5 : 1,
          }}>
          <FolderPlus />
          <Body size={13.5} weight={500} color={T.t72} style={{ flex: 1 }}>
            {importing
              ? 'Importando…'
              : canBrowseFolders
                ? 'Procurar no armazenamento…'
                : 'Importar arquivos…'}
          </Body>
          <ChevronRight />
        </Pressable>

        <ScanCta accent={accent} total={total} folders={selected.length} onPress={start} />

        <Body size={11.5} color="rgba(246,241,234,.33)" align="center" style={{ marginTop: 13 }}>
          Nada é enviado. Os arquivos ficam exatamente onde estão.
        </Body>
      </ScrollView>
    </View>
  );
}

/**
 * O blob do design é um conic-gradient desfocado; o React Native não parseia conic nem
 * aplica blur em View, então dois radial-gradients bem difusos fazem o mesmo trabalho.
 */
function Glow({ accent }: { accent: string }) {
  const spin = useSharedValue(0);
  useEffect(() => {
    spin.value = withRepeat(withTiming(360, { duration: 26000 }), -1, false);
  }, [spin]);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value}deg` }] }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          top: -160,
          left: -120,
          width: 520,
          height: 520,
          borderRadius: 260,
          opacity: 0.32,
          experimental_backgroundImage:
            `radial-gradient(70% 70% at 30% 25%, ${accent} 0%, transparent 70%),` +
            `radial-gradient(70% 70% at 75% 70%, #E8B44A 0%, transparent 70%)`,
        },
        style,
      ]}
    />
  );
}

/** Aviso de bloco: usado quando o acesso é negado e quando falta o módulo nativo. */
function Notice({
  accent,
  title,
  children,
  onRetry,
}: {
  accent: string;
  title: string;
  children: string;
  onRetry?: () => void;
}) {
  return (
    <Pressable
      onPress={onRetry}
      disabled={!onRetry}
      style={{
        padding: 16,
        borderRadius: R.r15,
        borderWidth: 1,
        borderColor: alpha(accent, 0.4),
        backgroundColor: alpha(accent, 0.08),
      }}>
      <Body size={14} weight={600}>
        {title}
      </Body>
      <Body size={12.5} color={T.t55} style={{ marginTop: 4, lineHeight: 18 }}>
        {children}
      </Body>
    </Pressable>
  );
}

function FolderRow({
  folder,
  on,
  accent,
  delay,
  onToggle,
}: {
  folder: Src;
  on: boolean;
  accent: string;
  delay: number;
  onToggle: () => void;
}) {
  const enter = useSharedValue(0);
  useEffect(() => {
    // As linhas do design entram escalonadas pelo índice.
    enter.value = withDelay(delay, withTiming(1, { duration: 550 }));
  }, [delay, enter]);
  const entering = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [{ translateY: (1 - enter.value) * 22 }],
  }));

  const knob = useSharedValue(on ? 17 : 0);
  useEffect(() => {
    knob.value = withSpring(on ? 17 : 0, { damping: 15, stiffness: 220 });
  }, [on, knob]);
  const knobStyle = useAnimatedStyle(() => ({ transform: [{ translateX: knob.value }] }));

  return (
    <Animated.View style={entering}>
      <Pressable
        onPress={onToggle}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 13,
          padding: 14,
          borderRadius: 16,
          backgroundColor: C.raised,
          borderWidth: 1,
          borderColor: T.t07,
        }}>
        <View
          style={{
            width: 38,
            height: 38,
            borderRadius: 11,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: on ? alpha(accent, 0.16) : T.t06,
          }}>
          <Folder size={18} color={on ? accent : 'rgba(246,241,234,.45)'} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Body size={14.5} weight={600} tracking={-0.01} numberOfLines={1}>
            {folder.name}
          </Body>
          <Mono size={10.5} color="rgba(246,241,234,.38)" numberOfLines={1} style={{ marginTop: 2 }}>
            {displayPath(folder.path)}
          </Mono>
        </View>
        <Body size={11.5} color={T.t42}>
          {folder.count}
        </Body>
        <View
          style={{
            width: 44,
            height: 27,
            borderRadius: 14,
            padding: 3,
            backgroundColor: on ? accent : 'rgba(246,241,234,.13)',
          }}>
          <Animated.View
            style={[{ width: 21, height: 21, borderRadius: 11, backgroundColor: '#fff' }, knobStyle]}
          />
        </View>
      </Pressable>
    </Animated.View>
  );
}

function ScanCta({
  accent,
  total,
  folders,
  onPress,
}: {
  accent: string;
  total: number;
  folders: number;
  onPress: () => void;
}) {
  const spin = useSharedValue(0);
  useEffect(() => {
    spin.value = withRepeat(withTiming(360, { duration: 2400 }), -1, false);
  }, [spin]);
  const arc = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value}deg` }] }));

  return (
    <Pressable
      onPress={onPress}
      disabled={!total}
      style={{
        borderRadius: R.r21,
        overflow: 'hidden',
        padding: 13,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        backgroundColor: '#191512',
        borderWidth: 1,
        borderColor: total ? alpha(accent, 0.55) : 'rgba(246,241,234,.11)',
        opacity: total ? 1 : 0.55,
      }}>
      <View
        style={{
          position: 'absolute',
          inset: 0,
          opacity: 0.22,
          experimental_backgroundImage: `radial-gradient(66% 170% at 5% 50%, ${accent} 0%, transparent 60%)`,
        }}
      />
      <View
        style={{
          width: 54,
          height: 54,
          borderRadius: 27,
          overflow: 'hidden',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: C.surface,
        }}>
        {/* No lugar do conic-gradient do design: um anel com só um lado colorido, girando. */}
        <Animated.View
          style={[
            {
              position: 'absolute',
              inset: 0,
              borderRadius: 27,
              borderWidth: 3,
              borderColor: 'transparent',
              borderTopColor: accent,
              borderRightColor: alpha(accent, 0.4),
            },
            arc,
          ]}
        />
        <View style={{ position: 'absolute', inset: 4, borderRadius: 23, backgroundColor: '#12100E' }} />
        <EqBars color={accent} playing height={19} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Display size={18} tracking={-0.025}>
          {total ? 'Começar a varredura' : 'Escolha uma pasta'}
        </Display>
        <Body size={12} color={T.t5} numberOfLines={1} style={{ marginTop: 3 }}>
          {total
            ? `${total} arquivos · ${folders} ${folders === 1 ? 'pasta' : 'pastas'}`
            : 'Ligue uma das pastas acima'}
        </Body>
      </View>
      <View
        style={{
          width: 34,
          height: 34,
          borderRadius: 17,
          backgroundColor: accent,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        <ArrowRight />
      </View>
    </Pressable>
  );
}
