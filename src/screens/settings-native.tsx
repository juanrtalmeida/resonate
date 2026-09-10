/**
 * Ajustes com os componentes do sistema. A outra versão é `settings-drawn.tsx`.
 *
 * Isto não é um tema: é **SwiftUI no iOS e Jetpack Compose no Android**, pelo `@expo/ui`.
 * O que se vê aqui é um `Form` de verdade — com o Liquid Glass do iOS 26 nos controles e
 * nos menus — ou uma lista Material 3 de verdade, com o toque, a ondulação e os menus que
 * o aparelho já sabe fazer. Nenhuma linha deste arquivo desenha uma caixa.
 *
 * Quatro decisões que explicam o resto:
 *
 * 1. **`Host` é a fronteira.** Tudo abaixo dele é árvore nativa; nada de `View` ou
 *    `Pressable` ali dentro. `seedColor={accent}` leva a cor escolhida pelo usuário para
 *    dentro do sistema: no iOS ela vira o tint dos controles, no Android ela semeia a
 *    paleta Material 3 inteira (`SchemeTonalSpot`, o algoritmo do Material You).
 *    `colorScheme="dark"` é cravado porque o app é escuro em qualquer aparelho.
 *
 * 2. **A tela é um componente só**, com todo o estado no alto, e isso é obrigatório e não
 *    estilo: o `FieldGroup` decide o agrupamento olhando o *tipo* de cada filho direto, e
 *    só reconhece como seção o que for literalmente um `FieldGroup.Section`. Uma seção
 *    devolvida por um componente nosso viraria uma seção dentro de outra — cartão dentro
 *    de cartão no Android. É por isso que o backup e o streaming moram aqui dentro em vez
 *    de em duas funções, como na versão desenhada.
 *
 * 3. **Duas peças continuam sendo nossas**, hospedadas por `RNHostView`: o seletor de
 *    acento e o botão de apagar a biblioteca. Não é preguiça — não existe seletor de cor
 *    de duas faixas nem no SwiftUI nem no Material, e o vermelho de ação destrutiva não é
 *    um estilo de botão que o sistema ofereça. Ver `components/accent-picker.tsx` e
 *    `components/wipe.tsx`.
 *
 * 4. **Nenhum texto vem sem cor.** O `Text` do `@expo/ui` não herda a nossa tinta, e o
 *    padrão dele é escuro — num formulário escuro, texto sem cor é texto invisível.
 *
 * O que esta versão não tem: o "voltar ao topo" ao tocar de novo em Ajustes na barra. O
 * `FieldGroup` é quem rola, e ele não expõe rolagem programável — ver `useTabTop` na
 * versão desenhada.
 */

import {
  Button,
  Column,
  FieldGroup,
  Host,
  Picker,
  RNHostView,
  Row,
  Spacer,
  Switch,
  Text,
  TextInput,
  useNativeState,
} from '@expo/ui';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View, useWindowDimensions } from 'react-native';

import { AccentPicker } from '@/components/accent-picker';
import { Wipe } from '@/components/wipe';
import { C, CHROME_HEIGHT, T } from '@/constants/theme';
import { useBackup } from '@/lib/backup-io';
import { LEVELINGS, type Leveling } from '@/lib/gain';
import { LANGS, localeOf, type Key, type Lang } from '@/lib/i18n';
import { useLibrary } from '@/lib/library';
import { usePrefs, useLang, useT, type Treatment } from '@/lib/prefs';
import { TREATMENTS, hostOf, messageOf } from '@/lib/settings';
import { connect, ping, type SyncProgress } from '@/lib/subsonic';

/**
 * O que sobra de largura para uma ilha de React Native dentro de uma linha do formulário.
 *
 * As duas ilhas precisam de largura explícita: `RNHostView matchContents` mede o filho, e
 * um filho de largura flexível não tem nada para medir — ele nasceria com zero. O recuo é
 * a soma do que o `Form` do iOS e a lista do Material põem de margem na linha, arredondada
 * para cima: sobrar dois pontos de cada lado é invisível, faltar corta o conteúdo.
 */
const ISLAND_INSET = 72;

/** Uma linha de texto secundário — rodapé de seção, explicação, estado. */
const HINT = { fontSize: 12.5, color: T.t5 } as const;

/** Texto comum dentro de uma linha. */
const INK = { fontSize: 15, color: T.full } as const;

export default function NativeSettings() {
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
    server,
    setServer,
  } = usePrefs();
  const { library, reset, syncServer, forgetRemote } = useLibrary();
  const { exportBackup, importBackup } = useBackup();
  const { width } = useWindowDimensions();
  const t = useT();
  const lang = useLang();

  const current = TREATMENTS.find((mode) => mode.key === treatment) ?? TREATMENTS[0];
  const island = width - ISLAND_INSET;

  /*
    Cada campo do servidor mora em dois lugares, e é de propósito.

    O `TextInput` do `@expo/ui` guarda o texto do lado nativo: para nascer preenchido com a
    credencial salva ele precisa de um `useNativeState`, que é um valor observável que o
    SwiftUI e o Compose leem direto, sem passar pelo React. Mas quem decide se o botão
    "Conectar" está disponível é o React — e isso precisa de um render. Então o estado
    nativo desenha o campo, e o do React acompanha por `onChangeText`.
  */
  const urlField = useNativeState(server?.url ?? '');
  const userField = useNativeState(server?.user ?? '');
  const passwordField = useNativeState(server?.password ?? '');
  const [url, setUrl] = useState(server?.url ?? '');
  const [user, setUser] = useState(server?.user ?? '');
  const [password, setPassword] = useState(server?.password ?? '');

  /** O que a tela está fazendo agora. Um estado só: os quatro são exclusivos. */
  const [busy, setBusy] = useState<'exporting' | 'importing' | 'testing' | 'syncing' | null>(
    null
  );
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [progress, setProgress] = useState<SyncProgress | null>(null);

  const filled = url.trim().length > 0 && user.trim().length > 0;

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

  /**
   * Guarda a credencial e confirma que o servidor responde.
   *
   * `setServer` abre a sessão de imediato — é síncrono, ver `lib/prefs.tsx` —, então o
   * `ping` já vai autenticado. Falhando, a credencial **fica guardada**: quem errou a
   * senha quer corrigir um campo, não digitar os três de novo.
   */
  const test = async () => {
    setBusy('testing');
    setStatus(null);
    const next = { url: url.trim(), user: user.trim(), password };
    setServer(next);
    try {
      await ping(connect(next));
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
   * Desconectar tira o acervo remoto do índice — deixá-lo ali seria pior que apagá-lo:
   * sem sessão, cada faixa remota vira uma linha que não toca. Curtidas e progresso
   * sobrevivem porque são chaveados pelo id `sub://…`, que é estável.
   *
   * A senha sai dos dois lados: do React e do campo nativo, que não escuta o React.
   */
  const forget = () => {
    forgetRemote();
    setServer(null);
    setPassword('');
    /*
      `useNativeState` existe para ser escrito: é um observável que o lado nativo
      acompanha, não estado do React — e é a única forma de esvaziar um campo que o SwiftUI
      e o Compose desenham sozinhos. A regra de imutabilidade do React Compiler não modela
      esse contrato, como não modela o dos shared values do Reanimated em `sheet.tsx`.
    */
    // eslint-disable-next-line react-hooks/immutability
    passwordField.value = '';
    setStatus(null);
  };

  return (
    <Host style={{ flex: 1 }} colorScheme="dark" seedColor={accent} useViewportSizeMeasurement>
      <FieldGroup>
        {/*
          O título da tela é o cabeçalho da primeira seção, e não uma faixa fixa acima do
          formulário: assim ele rola com o conteúdo, como o título grande do iOS, e o
          formulário fica sendo o único dono da altura da tela.
        */}
        <FieldGroup.Section>
          <FieldGroup.SectionHeader>
            <Text textStyle={{ fontSize: 28, fontWeight: '700', color: T.full }}>
              {t('settings.title')}
            </Text>
          </FieldGroup.SectionHeader>

          {/* A chave que trouxe o usuário até aqui, e a que o leva de volta. */}
          <Switch label={t('settings.nativeUI')} value={nativeUI} onValueChange={setNativeUI} />

          <FieldGroup.SectionFooter>
            <Text textStyle={HINT}>{t('settings.nativeUIBlurb')}</Text>
          </FieldGroup.SectionFooter>
        </FieldGroup.Section>

        <FieldGroup.Section title={t('settings.nowPlaying')}>
          <Row alignment="center">
            <Text textStyle={INK}>{t('settings.treatment')}</Text>
            <Spacer flexible />
            <Picker
              selectedValue={treatment}
              onValueChange={(value) => setTreatment(value as Treatment)}>
              {TREATMENTS.map((mode) => (
                <Picker.Item key={mode.key} label={t(mode.title)} value={mode.key} />
              ))}
            </Picker>
          </Row>
          <FieldGroup.SectionFooter>
            <Text textStyle={HINT}>{t(current.blurb)}</Text>
          </FieldGroup.SectionFooter>
        </FieldGroup.Section>

        {/*
          O seletor de acento, hospedado.

          Um aviso para quem vier depois: as duas faixas usam Pan, e um Pan dentro de uma
          ilha de RN dentro de um formulário que rola é uma disputa de gesto com o próprio
          formulário. Os quatro atalhos são toque seco e não dependem disso — se a faixa
          engasgar em algum aparelho, é aqui que se olha.
        */}
        <FieldGroup.Section title={t('settings.accent')}>
          <RNHostView matchContents>
            <View style={{ width: island }}>
              <AccentPicker accent={accent} onPick={setAccent} />
            </View>
          </RNHostView>
        </FieldGroup.Section>

        <FieldGroup.Section title={t('settings.language')}>
          <Row alignment="center">
            <Text textStyle={INK}>{t('settings.language')}</Text>
            <Spacer flexible />
            <Picker
              selectedValue={language}
              onValueChange={(value) => setLanguage(value as Lang | 'auto')}>
              <Picker.Item label={t('settings.languageAuto')} value="auto" />
              {LANGS.map((item) => (
                // O nome de cada idioma no próprio idioma: ninguém procura "Japonês" numa
                // tela que já está em japonês.
                <Picker.Item key={item.key} label={item.label} value={item.key} />
              ))}
            </Picker>
          </Row>
        </FieldGroup.Section>

        <FieldGroup.Section title={t('settings.leveling')}>
          <Row alignment="center">
            <Text textStyle={INK}>{t('settings.leveling')}</Text>
            <Spacer flexible />
            <Picker
              selectedValue={leveling}
              onValueChange={(value) => setLeveling(value as Leveling)}>
              {LEVELINGS.map((mode) => (
                <Picker.Item key={mode} label={t(`leveling.${mode}` as Key)} value={mode} />
              ))}
            </Picker>
          </Row>
          <FieldGroup.SectionFooter>
            <Text textStyle={HINT}>{t('settings.levelingBlurb')}</Text>
          </FieldGroup.SectionFooter>
        </FieldGroup.Section>

        <FieldGroup.Section title={t('settings.library')}>
          <Button
            variant="text"
            label={t('settings.rescan')}
            onPress={() => router.push('/onboarding')}
          />
          <Text textStyle={HINT}>
            {library
              ? t('settings.scanned', {
                  tracks: library.tracks.length,
                  // A data no formato de quem lê: o idioma escolhido manda no locale.
                  date: new Date(library.scannedAt).toLocaleDateString(localeOf(lang)),
                })
              : t('settings.neverScanned')}
          </Text>
        </FieldGroup.Section>

        <FieldGroup.Section title={t('backup.title')}>
          <Button
            variant="text"
            label={t('backup.export')}
            disabled={busy !== null}
            onPress={() => void doExport()}
          />
          <Button
            variant="text"
            label={t('backup.import')}
            disabled={busy !== null}
            onPress={() => void doImport()}
          />
          <FieldGroup.SectionFooter>
            <Text textStyle={HINT}>{t('backup.blurb')}</Text>
          </FieldGroup.SectionFooter>
        </FieldGroup.Section>

        <FieldGroup.Section title={t('settings.streaming')}>
          <TextInput
            value={urlField}
            onChangeText={setUrl}
            placeholder={t('streaming.url')}
            keyboardType="url"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TextInput
            value={userField}
            onChangeText={setUser}
            placeholder={t('streaming.user')}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TextInput
            value={passwordField}
            onChangeText={setPassword}
            placeholder={t('streaming.password')}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Button
            variant="text"
            label={t(busy === 'testing' ? 'streaming.testing' : 'streaming.connect')}
            disabled={!filled || busy !== null}
            onPress={() => void test()}
          />

          {/* Sincronizar só depois de a credencial estar guardada: sem sessão não há o que
              sincronizar, e um botão que falha sempre não deveria estar disponível. */}
          {server && (
            <Button
              variant="text"
              label={t(busy === 'syncing' ? 'streaming.syncing' : 'streaming.sync')}
              disabled={busy !== null}
              onPress={() => void sync()}
            />
          )}

          {/* O andamento em números, e não um indicador girando: a sincronia é uma
              requisição por álbum, e sem a contagem "trabalhando" e "travado" são a mesma
              tela. */}
          {progress && (
            <Text textStyle={HINT}>
              {progress.total > 0 && progress.albums > 0
                ? t('streaming.progress', {
                    at: progress.albums,
                    total: progress.total,
                    tracks: progress.tracks,
                  })
                : t('streaming.listing', { total: progress.total })}
            </Text>
          )}

          {server && (
            <Button
              variant="text"
              label={t('streaming.disconnect')}
              disabled={busy !== null}
              onPress={forget}
            />
          )}

          <FieldGroup.SectionFooter>
            <Text textStyle={HINT}>{t('streaming.blurb')}</Text>
          </FieldGroup.SectionFooter>
        </FieldGroup.Section>

        {/*
          O aviso do backup e o do servidor caem os dois aqui, na última seção antes do
          apagar: é um estado por vez — `busy` é único — e uma linha que aparece sempre no
          mesmo lugar é mais fácil de achar do que duas que aparecem em lugares diferentes.
        */}
        {status && (
          <FieldGroup.Section>
            <Text textStyle={{ fontSize: 12.5, color: status.ok ? C.ok : C.danger }}>
              {status.message}
            </Text>
          </FieldGroup.Section>
        )}

        <FieldGroup.Section>
          <RNHostView matchContents>
            <View style={{ width: island }}>
              <Wipe
                onConfirm={() => {
                  reset();
                  router.replace('/onboarding');
                }}
              />
            </View>
          </RNHostView>
        </FieldGroup.Section>

        {/*
          O rodapé faz dois papéis: a assinatura da versão e o ar que a barra inferior
          ocupa. A barra é um overlay do layout raiz e não entra na conta de rolagem de
          ninguém, então a última linha do formulário nasceria embaixo dela.
        */}
        <FieldGroup.Section>
          <FieldGroup.SectionFooter>
            <Column alignment="center" spacing={8}>
              <Text textStyle={{ fontSize: 11, color: T.t24 }}>
                {t('settings.version', { version: Constants.expoConfig?.version ?? '—' })}
              </Text>
              <Spacer size={CHROME_HEIGHT} />
            </Column>
          </FieldGroup.SectionFooter>
        </FieldGroup.Section>
      </FieldGroup>
    </Host>
  );
}
