/**
 * Apagar a biblioteca — em vermelho, e com confirmação no lugar.
 *
 * Antes era um texto cinza de 13,5 que chamava `reset()` e mandava para o onboarding **no
 * primeiro toque**, sem perguntar nada. É a ação mais destrutiva do app e a que menos
 * parecia um botão.
 *
 * A confirmação troca o botão em vez de abrir um diálogo, como no menu do toque longo:
 * a decisão fica onde o dedo já está.
 *
 * Vive aqui, e não em `app/settings.tsx`, pela mesma razão do seletor de acento: as duas
 * versões da tela de Ajustes usam este botão, e o vermelho de perigo não é tema nem no
 * SwiftUI nem no Material — um `Button` nativo com rótulo vermelho não carrega o peso que
 * esta ação precisa carregar. Ver `screens/settings-native.tsx`.
 */

import { useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Trash } from '@/components/icons';
import { Body } from '@/components/text';
import { C, R, T, alpha } from '@/constants/theme';
import { useT } from '@/lib/prefs';

export function Wipe({ onConfirm }: { onConfirm: () => void }) {
  const t = useT();
  const [asking, setAsking] = useState(false);

  if (!asking) {
    return (
      <Pressable
        onPress={() => setAsking(true)}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 9,
          marginTop: 10,
          height: 52,
          borderRadius: 16,
          backgroundColor: alpha(C.danger, 0.12),
          borderWidth: 1,
          borderColor: alpha(C.danger, 0.4),
        }}>
        <Trash size={16} color={C.danger} />
        <Body size={13.5} weight={600} color={C.danger}>
          {t('settings.wipe')}
        </Body>
      </Pressable>
    );
  }

  return (
    <Animated.View
      entering={FadeIn.duration(180)}
      style={{
        marginTop: 10,
        padding: 16,
        borderRadius: 16,
        backgroundColor: alpha(C.danger, 0.08),
        borderWidth: 1,
        borderColor: alpha(C.danger, 0.4),
      }}>
      <Body size={14} weight={600} align="center">
        {t('settings.wipe.confirm')}
      </Body>
      <Body size={12} color={T.t5} align="center" style={{ marginTop: 6, lineHeight: 17 }}>
        {t('settings.wipe.warning')}
      </Body>
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
        <Pressable
          onPress={() => setAsking(false)}
          style={{
            flex: 1,
            height: 46,
            borderRadius: R.r15,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 1,
            borderColor: T.t12,
          }}>
          <Body size={13.5} weight={600} color={T.t72}>
            {t('common.cancel')}
          </Body>
        </Pressable>
        <Pressable
          onPress={onConfirm}
          style={{
            flex: 1,
            height: 46,
            borderRadius: R.r15,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: C.danger,
          }}>
          <Body size={13.5} weight={600} color={T.full}>
            {t('common.delete')}
          </Body>
        </Pressable>
      </View>
    </Animated.View>
  );
}
