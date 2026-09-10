/**
 * Ajustes, desenhados por nós. A versão de sempre — a outra é `settings-native.tsx`.
 *
 * Blocos e nada mais: com qual interface o app se desenha, como o Now Playing se
 * apresenta, a cor de acento, o idioma, o volume, e o que fazer com a biblioteca.
 * Continuação da fila, embaralhar e repetir moram no player, ao lado da fila que eles
 * governam — trazê-los para cá seria pedir ao usuário que saísse da música para mexer na
 * música.
 *
 * Este arquivo morava em `app/settings.tsx`. A rota ficou lá, com três linhas que escolhem
 * entre esta tela e a nativa; o desvio é explicado lá.
 */

import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import Animated, {
  FadeIn,
  ReduceMotion,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AccentPicker } from '@/components/accent-picker';
import { Chip, ChipRow } from '@/components/chip';
import { Wordmark } from '@/components/logo';
import { Press } from '@/components/press';
import { SectionLabel } from '@/components/section-label';
import { Body, Display, Mono } from '@/components/text';
import { Wipe } from '@/components/wipe';
import { C, CHROME_HEIGHT, PADDING, R, T, alpha } from '@/constants/theme';
import { useBackup } from '@/lib/backup-io';
import { useChromeScroll } from '@/lib/chrome-scroll';
import { LEVELINGS } from '@/lib/gain';
import { LANGS, localeOf, type Key } from '@/lib/i18n';
import { useLibrary } from '@/lib/library';
import { NATIVE_UI_AVAILABLE } from '@/lib/native-ui';
import { usePrefs, useLang, useT, type Treatment } from '@/lib/prefs';
import { TREATMENTS, hostOf, messageOf } from '@/lib/settings';
import { connect, ping, type SyncProgress } from '@/lib/subsonic';
import { useTabTop } from '@/lib/tab-top';

export default function DrawnSettings() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const {
    accent,
    treatment,
    setAccent,
    setTreatment,
    language,
    setLanguage,
    leveling,
    setLeveling,
    nativeUI,
    setNativeUI,
  } = usePrefs();
  const { library, reset } = useLibrary();
  const t = useT();
  const lang = useLang();

  // Tocar em Ajustes já estando nela volta ao topo.
  const list = useRef<ScrollView>(null);
  useTabTop(
    'Settings',
    useCallback(() => list.current?.scrollTo({ y: 0, animated: true }), [])
  );

  const current = TREATMENTS.find((t) => t.key === treatment) ?? TREATMENTS[0];

  const scroll = useChromeScroll();

  return (
    <Animated.ScrollView
      ref={list}
      {...scroll}
      contentContainerStyle={{
        paddingTop: insets.top + 24,
        paddingHorizontal: PADDING,
        paddingBottom: CHROME_HEIGHT + insets.bottom,
      }}>
      <Display size={33} tracking={-0.035}>
        {t('settings.title')}
      </Display>

      {/*
        A interface primeiro: é o ajuste que decide como todos os outros vão aparecer.

        Ligado, a barra inferior passa a ser vidro no iOS e superfície Material no Android,
        e esta tela é substituída pela versão nativa — que traz a mesma chave no alto, para
        a volta ser tão fácil quanto a ida.
      */}
      <SectionLabel title={t('settings.interface')} />
      <Pressable
        onPress={() => setNativeUI(!nativeUI)}
        disabled={!NATIVE_UI_AVAILABLE}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 14,
          padding: 16,
          borderRadius: 16,
          backgroundColor: C.raised,
          borderWidth: 1,
          borderColor: T.t07,
          opacity: NATIVE_UI_AVAILABLE ? 1 : 0.5,
        }}>
        <View style={{ flex: 1 }}>
          <Body size={14.5} weight={600}>
            {t('settings.nativeUI')}
          </Body>
          <Body size={12} color={T.t5} style={{ marginTop: 3, lineHeight: 17 }}>
            {t(NATIVE_UI_AVAILABLE ? 'settings.nativeUIBlurb' : 'settings.nativeUIUnavailable')}
          </Body>
        </View>
        <Toggle on={nativeUI} accent={accent} />
      </Pressable>

      {/*
        Os três modos numa fileira, e não em cartões empilhados.

        Cada cartão tinha 72 de altura e uma capa de exemplo do lado — a *mesma* capa
        procedural nos três, semeada por "Resonate / Ajustes". Não dizia nada sobre o modo
        e ocupava metade da tela. Aqui cada tile desenha o próprio modo, e a explicação do
        escolhido fica numa linha abaixo da fileira.
      */}
      <SectionLabel title={t('settings.nowPlaying')} />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {TREATMENTS.map((mode) => (
          <Mode
            key={mode.key}
            kind={mode.key}
            title={t(mode.title)}
            on={mode.key === treatment}
            accent={accent}
            onPress={() => setTreatment(mode.key)}
          />
        ))}
      </View>
      {/* A `key` faz a linha reentrar quando o modo muda: sem ela o texto troca seco. */}
      <Animated.View key={current.key} entering={FadeIn.duration(200)}>
        <Body size={12.5} color={T.t5} style={{ marginTop: 12, lineHeight: 18 }}>
          {t(current.blurb)}
        </Body>
      </Animated.View>

      <SectionLabel title={t('settings.accent')} />
      <AccentPicker accent={accent} onPick={setAccent} />

      {/*
        O idioma, entre a cor e a biblioteca: as duas primeiras seções são aparência, e
        idioma é a terceira coisa que se procura aqui. "Automático" segue o aparelho.
      */}
      <SectionLabel title={t('settings.language')} />
      <ChipRow>
        <Chip
          label={t('settings.languageAuto')}
          on={language === 'auto'}
          accent={accent}
          onPress={() => setLanguage('auto')}
        />
        {LANGS.map((item) => (
          <Chip
            key={item.key}
            // O nome de cada idioma no próprio idioma: ninguém procura "Japonês" numa
            // tela que já está em japonês.
            label={item.label}
            on={language === item.key}
            accent={accent}
            onPress={() => setLanguage(item.key)}
          />
        ))}
      </ChipRow>

      {/*
        O nivelamento entre aparência e biblioteca: é ajuste de reprodução, e o único que
        vive aqui em vez de no player — ao contrário de embaralhar e repetir, ele não é
        uma decisão que se toma ouvindo, é uma que se toma uma vez e esquece.
      */}
      <SectionLabel title={t('settings.leveling')} />
      <ChipRow>
        {LEVELINGS.map((mode) => (
          <Chip
            key={mode}
            label={t(`leveling.${mode}` as Key)}
            on={leveling === mode}
            accent={accent}
            onPress={() => setLeveling(mode)}
          />
        ))}
      </ChipRow>
      <Body size={12.5} color={T.t5} style={{ marginTop: 12, lineHeight: 18 }}>
        {t('settings.levelingBlurb')}
      </Body>

      <SectionLabel title={t('settings.library')} />
      <Pressable
        onPress={() => router.push('/onboarding')}
        style={{
          padding: 16,
          borderRadius: 16,
          backgroundColor: C.raised,
          borderWidth: 1,
          borderColor: T.t07,
        }}>
        <Body size={14.5} weight={600}>
          {t('settings.rescan')}
        </Body>
        <Body size={12} color={T.t5} style={{ marginTop: 3 }}>
          {library
            ? t('settings.scanned', {
                tracks: library.tracks.length,
                // A data no formato de quem lê: o idioma escolhido manda no locale.
                date: new Date(library.scannedAt).toLocaleDateString(localeOf(lang)),
              })
            : t('settings.neverScanned')}
        </Body>
      </Pressable>

      <SectionLabel title={t('backup.title')} />
      <BackupSection />

      <SectionLabel title={t('settings.streaming')} />
      <StreamingSection />

      <Wipe
        onConfirm={() => {
          reset();
          router.replace('/onboarding');
        }}
      />

      {/* Assinatura no pé, onde ela cabe: é a tela em que se procura de quem é o app. */}
      <View style={{ alignItems: 'center', marginTop: 40, gap: 8 }}>
        <Wordmark size={17} />
        <Mono size={9.5} weight={500} tracking={0.16} caps color={T.t24}>
          {t('settings.version', { version: Constants.expoConfig?.version ?? '—' })}
        </Mono>
      </View>
    </Animated.ScrollView>
  );
}

/**
 * A chave de liga-desliga, desenhada.
 *
 * O app não tinha nenhuma até agora — tudo aqui era escolha entre opções, e escolha entre
 * opções é chip. A interface nativa é a primeira coisa que só tem dois estados, e um par
 * de chips "Ligado/Desligado" diria menos que a chave que todo mundo já conhece.
 *
 * A alça anda com mola e a trilha vai da linha cinza ao acento. Nada de layout no meio:
 * `translateX` e cor, como manda o design system.
 */
function Toggle({ on, accent }: { on: boolean; accent: string }) {
  const at = useSharedValue(on ? 1 : 0);

  useEffect(() => {
    at.value = withSpring(on ? 1 : 0, {
      damping: 22,
      mass: 1,
      stiffness: 260,
      reduceMotion: ReduceMotion.System,
    });
  }, [on, at]);

  const track = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(at.value, [0, 1], [T.t12, accent]),
  }));
  const knob = useAnimatedStyle(() => ({ transform: [{ translateX: at.value * 20 }] }));

  return (
    <Animated.View
      style={[{ width: 48, height: 28, borderRadius: 14, padding: 3 }, track]}>
      <Animated.View
        style={[{ width: 22, height: 22, borderRadius: 11, backgroundColor: T.full }, knob]}
      />
    </Animated.View>
  );
}

/**
 * Exportar e importar a própria escuta.
 *
 * Fica na tela de Ajustes, entre a biblioteca e o servidor: é a mesma família de coisas —
 * o que o app guarda e de onde ele tira o que toca. Ver `lib/backup.ts`.
 */
function BackupSection() {
  const t = useT();
  const { exportBackup, importBackup } = useBackup();
  const [busy, setBusy] = useState<'exporting' | 'importing' | null>(null);
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);

  const doExport = async () => {
    setBusy('exporting');
    setStatus(null);
    const ok = await exportBackup();
    // Cancelar a folha de compartilhar não é erro, e é indistinguível de sucesso pelo
    // retorno — então só a falha fala.
    if (!ok) setStatus({ ok: false, message: t('backup.exportFailed') });
    setBusy(null);
  };

  const doImport = async () => {
    setBusy('importing');
    setStatus(null);
    const result = await importBackup();
    setStatus(
      result
        ? {
            ok: true,
            message: t('backup.imported', {
              playlists: result.playlists,
              plays: result.plays,
            }),
          }
        : { ok: false, message: t('backup.importFailed') }
    );
    setBusy(null);
  };

  return (
    <View style={{ gap: 10 }}>
      <Body size={12} color={T.t5} style={{ lineHeight: 18 }}>
        {t('backup.blurb')}
      </Body>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Press
          onPress={() => void doExport()}
          disabled={busy !== null}
          style={{
            flex: 1,
            height: 46,
            borderRadius: R.r15,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: C.raised,
            borderWidth: 1,
            borderColor: T.t12,
          }}>
          <Body size={13.5} weight={600} color={T.full}>
            {t('backup.export')}
          </Body>
        </Press>
        <Press
          onPress={() => void doImport()}
          disabled={busy !== null}
          style={{
            flex: 1,
            height: 46,
            borderRadius: R.r15,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: C.raised,
            borderWidth: 1,
            borderColor: T.t12,
          }}>
          <Body size={13.5} weight={600} color={T.full}>
            {t('backup.import')}
          </Body>
        </Press>
      </View>
      {status && (
        <Body size={12} weight={500} color={status.ok ? C.ok : C.danger}>
          {status.message}
        </Body>
      )}
    </View>
  );
}

/**
 * Conectar o servidor de streaming do próprio usuário — OpenSubsonic.
 *
 * O app nasceu só com arquivos locais, e os dois caminhos passam a valer juntos: o que vem
 * do servidor entra no **mesmo índice** da biblioteca, então grade de álbuns, Artistas,
 * Faixas, Busca, Escuta, playlists e o menu do toque longo funcionam sobre os dois acervos
 * sem código novo em nenhuma dessas telas. Ver `lib/subsonic.ts` e `lib/merge.ts`.
 *
 * Conectar e sincronizar são **dois passos**, de propósito. Conectar é instantâneo e só
 * confirma que a credencial serve; sincronizar leva minutos num acervo grande, porque o
 * Subsonic exige uma requisição por álbum (ver `fetchLibrary`). Juntar os dois num botão
 * faria "salvar a senha" parecer travado.
 */
function StreamingSection() {
  const t = useT();
  const { server, setServer, accent } = usePrefs();
  const { syncServer, forgetRemote } = useLibrary();

  const [url, setUrl] = useState(server?.url ?? '');
  const [user, setUser] = useState(server?.user ?? '');
  const [password, setPassword] = useState(server?.password ?? '');

  /** O que a seção está fazendo agora. Um estado só, porque os três são exclusivos. */
  const [busy, setBusy] = useState<'testing' | 'syncing' | null>(null);
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [progress, setProgress] = useState<SyncProgress | null>(null);

  const filled = url.trim().length > 0 && user.trim().length > 0;

  /**
   * Guarda a credencial e confirma que o servidor responde.
   *
   * `setServer` abre a sessão de imediato (é síncrono — ver `lib/prefs.tsx`), então o
   * `ping` já vai autenticado. Falhando, a credencial **fica guardada**: quem errou a
   * senha quer corrigir um campo, não digitar os três de novo.
   */
  const test = async () => {
    setBusy('testing');
    setStatus(null);
    const next = { url: url.trim(), user: user.trim(), password };
    setServer(next);
    try {
      const session = connect(next);
      await ping(session);
      setStatus({ ok: true, message: t('streaming.connected') });
    } catch (error) {
      setStatus({ ok: false, message: messageOf(error, t) });
    } finally {
      setBusy(null);
    }
  };

  const sync = async () => {
    setBusy('syncing');
    setStatus(null);
    setProgress(null);
    try {
      // O rótulo vai para o campo `folder` das faixas remotas, que é o agrupamento por
      // pasta — para um acervo remoto, a "pasta" que diz algo é de qual servidor ele veio.
      const host = hostOf(url) ?? t('streaming.server');
      const count = await syncServer(host, setProgress);
      setStatus({ ok: true, message: t('streaming.synced', { tracks: count }) });
    } catch (error) {
      setStatus({ ok: false, message: messageOf(error, t) });
    } finally {
      setBusy(null);
      setProgress(null);
    }
  };

  /**
   * Desconectar tira o acervo remoto do índice.
   *
   * Deixá-lo ali seria pior que apagá-lo: sem sessão, `absolute()` devolve string vazia e
   * cada faixa remota vira uma linha que não toca. Curtidas, progresso e listas sobrevivem
   * porque são chaveados pelo id (`sub://…`), que é estável — reconectar o mesmo servidor
   * e sincronizar devolve tudo apontando para o lugar certo.
   */
  const forget = () => {
    forgetRemote();
    setServer(null);
    setPassword('');
    setStatus(null);
  };

  return (
    <View style={{ gap: 10 }}>
      <Body size={12} color={T.t5} style={{ lineHeight: 18 }}>
        {t('streaming.blurb')}
      </Body>

      <Field
        label={t('streaming.url')}
        value={url}
        onChange={setUrl}
        placeholder="https://musica.example.com"
        autoCapitalize="none"
        keyboardType="url"
      />
      <Field
        label={t('streaming.user')}
        value={user}
        onChange={setUser}
        autoCapitalize="none"
      />
      <Field
        label={t('streaming.password')}
        value={password}
        onChange={setPassword}
        autoCapitalize="none"
        secure
      />

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Press
          onPress={() => void test()}
          disabled={!filled || busy !== null}
          style={{
            flex: 1,
            height: 46,
            borderRadius: R.r15,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: C.raised,
            borderWidth: 1,
            borderColor: T.t12,
          }}>
          <Body size={13.5} weight={600} color={T.full}>
            {t(busy === 'testing' ? 'streaming.testing' : 'streaming.connect')}
          </Body>
        </Press>
        {/* Sincronizar só depois de a credencial estar guardada: sem sessão não há o que
            sincronizar, e um botão que falha sempre não deveria estar disponível. */}
        {server && (
          <Press
            onPress={() => void sync()}
            disabled={busy !== null}
            style={{
              flex: 1,
              height: 46,
              borderRadius: R.r15,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: accent,
            }}>
            <Body size={13.5} weight={600} color={C.onAccent}>
              {t(busy === 'syncing' ? 'streaming.syncing' : 'streaming.sync')}
            </Body>
          </Press>
        )}
      </View>

      {/*
        O andamento em números, e não um spinner.

        A sincronia é uma requisição por álbum e leva minutos num acervo grande — ver
        `fetchLibrary`. Sem a contagem, a diferença entre "trabalhando" e "travado" não
        existe para quem olha.
      */}
      {progress && (
        <Body size={12} color={T.t62}>
          {progress.total > 0 && progress.albums > 0
            ? t('streaming.progress', {
                at: progress.albums,
                total: progress.total,
                tracks: progress.tracks,
              })
            : t('streaming.listing', { total: progress.total })}
        </Body>
      )}

      {status && (
        <Body size={12} weight={500} color={status.ok ? C.ok : C.danger}>
          {status.message}
        </Body>
      )}

      {server && (
        <Pressable onPress={forget} disabled={busy !== null} style={{ paddingVertical: 10 }}>
          <Body size={13} weight={500} color={T.t5}>
            {t('streaming.disconnect')}
          </Body>
        </Pressable>
      )}
    </View>
  );
}

/** Um campo de texto rotulado, no desenho das caixas desta tela. */
function Field({
  label,
  value,
  onChange,
  placeholder,
  autoCapitalize,
  keyboardType,
  secure,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  autoCapitalize?: 'none' | 'sentences';
  keyboardType?: 'url' | 'default';
  secure?: boolean;
}) {
  return (
    <View
      style={{
        paddingHorizontal: 14,
        paddingTop: 9,
        paddingBottom: 4,
        borderRadius: 14,
        backgroundColor: C.raised,
        borderWidth: 1,
        borderColor: T.t07,
      }}>
      <Mono size={9} weight={500} tracking={0.14} caps color={T.t42}>
        {label}
      </Mono>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={T.t24}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        keyboardType={keyboardType}
        secureTextEntry={secure}
        style={{
          color: T.full,
          fontFamily: 'FamiljenGrotesk_400Regular',
          fontSize: 14.5,
          paddingVertical: 6,
        }}
      />
    </View>
  );
}

/**
 * Um modo, desenhando a si mesmo.
 *
 * As miniaturas são compostas de primitivas em vez de imagem: a brasa é um quadrado com o
 * brilho, o vinil é um disco com sulcos, a onda são barras. Um `AlbumArt` de exemplo — o
 * que havia antes — mostra uma capa, e capa é o que os três têm em comum; o que muda é
 * justamente o tratamento.
 */
function Mode({
  kind,
  title,
  on,
  accent,
  onPress,
}: {
  kind: Treatment;
  title: string;
  on: boolean;
  accent: string;
  onPress: () => void;
}) {
  const ink = on ? accent : T.t3;

  return (
    <Pressable
      onPress={onPress}
      style={{
        flex: 1,
        alignItems: 'center',
        gap: 10,
        paddingVertical: 14,
        borderRadius: 16,
        backgroundColor: on ? alpha(accent, 0.09) : C.raised,
        borderWidth: 1,
        borderColor: on ? alpha(accent, 0.5) : T.t07,
      }}>
      <View style={{ width: 46, height: 46, alignItems: 'center', justifyContent: 'center' }}>
        {kind === 'ember' && (
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              borderWidth: 1.5,
              borderColor: ink,
              experimental_backgroundImage: on
                ? `radial-gradient(circle at 50% 50%, ${alpha(accent, 0.5)} 0%, transparent 70%)`
                : undefined,
            }}
          />
        )}

        {kind === 'vinyl' && (
          <View
            style={{
              width: 42,
              height: 42,
              borderRadius: 21,
              borderWidth: 1.5,
              borderColor: ink,
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            {/* Dois sulcos e o furo: é o que faz um círculo ler como disco. */}
            <View
              style={{
                position: 'absolute',
                width: 28,
                height: 28,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: on ? alpha(accent, 0.45) : T.t18,
              }}
            />
            <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: ink }} />
          </View>
        )}

        {kind === 'wave' && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, height: 42 }}>
            {[0.45, 0.85, 0.6, 1, 0.35].map((h, i) => (
              <View
                key={i}
                style={{
                  width: 3.5,
                  height: 42 * h,
                  borderRadius: 2,
                  backgroundColor: ink,
                }}
              />
            ))}
          </View>
        )}
      </View>

      <Body size={12.5} weight={600} tracking={-0.01} color={on ? T.full : T.t5}>
        {title}
      </Body>
    </Pressable>
  );
}
