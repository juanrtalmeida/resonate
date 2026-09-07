/** Os ícones do design, com os paths copiados do .dc.html. */

import Svg, { Circle, Path, Rect } from 'react-native-svg';

type IconProps = { size?: number; color?: string };

export function Play({ size = 16, color = '#F6F1EA' }: IconProps) {
  return (
    <Svg width={size} height={size * (16 / 14)} viewBox="0 0 14 16">
      <Path
        d="M1 1.6c0-.9 1-1.4 1.7-.9l9.6 6.4c.7.5.7 1.5 0 1.9l-9.6 6.4c-.8.5-1.7-.1-1.7-.9V1.6z"
        fill={color}
      />
    </Svg>
  );
}

export function Pause({ size = 14, color = '#F6F1EA' }: IconProps) {
  return (
    <Svg width={size * (12 / 14)} height={size} viewBox="0 0 12 14">
      <Rect x={1} y={1} width={3.4} height={12} rx={1.2} fill={color} />
      <Rect x={7.6} y={1} width={3.4} height={12} rx={1.2} fill={color} />
    </Svg>
  );
}

export function Next({ size = 22, color = '#F6F1EA' }: IconProps) {
  return (
    <Svg width={size} height={size * (18 / 22)} viewBox="0 0 22 18">
      <Path
        d="M1.6 2.1c0-.9 1-1.4 1.7-.9L13 8c.6.5.6 1.4 0 1.8l-9.7 6.9c-.7.5-1.7 0-1.7-.9V2.1z"
        fill={color}
      />
      <Rect x={17} y={1} width={3} height={16} rx={1.4} fill={color} />
    </Svg>
  );
}

export function Previous({ size = 22, color = '#F6F1EA' }: IconProps) {
  return (
    <Svg width={size} height={size * (18 / 22)} viewBox="0 0 22 18">
      <Path
        d="M20.4 2.1c0-.9-1-1.4-1.7-.9L9 8c-.6.5-.6 1.4 0 1.8l9.7 6.9c.7.5 1.7 0 1.7-.9V2.1z"
        fill={color}
      />
      <Rect x={2} y={1} width={3} height={16} rx={1.4} fill={color} />
    </Svg>
  );
}

export function Heart({ size = 18, color = '#F2653A', filled = false }: IconProps & { filled?: boolean }) {
  return (
    <Svg width={size} height={size * (17 / 18)} viewBox="0 0 18 17">
      <Path
        d="M9 15.2S1.6 10.9 1.6 6.1A3.9 3.9 0 019 4.3a3.9 3.9 0 017.4 1.8c0 4.8-7.4 9.1-7.4 9.1z"
        fill={filled ? color : 'none'}
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function Shuffle({ size = 18, color = '#F6F1EA' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 18 18" fill="none">
      <Path
        d="M2 4h3.2l7.6 10H16M2 14h3.2l2.4-3.2M12 4h4M13.6 2.2L16 4l-2.4 1.8M13.6 12.2L16 14l-2.4 1.8"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function ChevronLeft({ size = 16, color = '#F6F1EA' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <Path
        d="M10 3L5 8l5 5"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function ChevronRight({ size = 16, color = 'rgba(246,241,234,.4)' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <Path
        d="M6 3l5 5-5 5"
        stroke={color}
        strokeWidth={1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function ChevronDown({ size = 16, color = '#F6F1EA' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <Path
        d="M3 6l5 5 5-5"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function Folder({ size = 18, color = 'rgba(246,241,234,.6)' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 18 18" fill="none">
      <Path
        d="M1.6 4.4c0-.9.7-1.6 1.6-1.6h3.3l1.6 1.9h6.7c.9 0 1.6.7 1.6 1.6v7c0 .9-.7 1.6-1.6 1.6H3.2c-.9 0-1.6-.7-1.6-1.6V4.4z"
        stroke={color}
        strokeWidth={1.4}
      />
    </Svg>
  );
}

export function FolderPlus({ size = 17, color = 'rgba(246,241,234,.6)' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 18 18" fill="none">
      <Path
        d="M1.6 4.4c0-.9.7-1.6 1.6-1.6h3.3l1.6 1.9h6.7c.9 0 1.6.7 1.6 1.6v7c0 .9-.7 1.6-1.6 1.6H3.2c-.9 0-1.6-.7-1.6-1.6V4.4z"
        stroke={color}
        strokeWidth={1.4}
      />
      <Path d="M9 8.4v4.2M6.9 10.5h4.2" stroke={color} strokeWidth={1.4} strokeLinecap="round" />
    </Svg>
  );
}

export function Search({ size = 17, color = 'rgba(246,241,234,.65)' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 17 17" fill="none">
      <Circle cx={7.2} cy={7.2} r={5.4} stroke={color} strokeWidth={1.5} />
      <Path d="M11.3 11.3l3.6 3.6" stroke={color} strokeWidth={1.5} strokeLinecap="round" />
    </Svg>
  );
}

export function LibraryIcon({ size = 21, color = 'currentColor' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 22 22" fill="none">
      <Rect x={3} y={5.5} width={7} height={11} rx={1.6} stroke={color} strokeWidth={1.7} />
      <Rect x={12} y={5.5} width={7} height={11} rx={1.6} stroke={color} strokeWidth={1.7} />
    </Svg>
  );
}

export function FolderNav({ size = 21, color = 'currentColor' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 22 22" fill="none">
      <Path
        d="M2.6 6c0-1 .8-1.8 1.8-1.8h3.4L9.6 6h7.8c1 0 1.8.8 1.8 1.8v8c0 1-.8 1.8-1.8 1.8H4.4c-1 0-1.8-.8-1.8-1.8V6z"
        stroke={color}
        strokeWidth={1.7}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function SearchNav({ size = 21, color = 'currentColor' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 22 22" fill="none">
      <Circle cx={10} cy={9.5} r={6} stroke={color} strokeWidth={1.7} />
      <Path d="M14.6 14.6l4 4" stroke={color} strokeWidth={1.7} strokeLinecap="round" />
    </Svg>
  );
}

export function SettingsNav({ size = 21, color = 'currentColor' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 22 22" fill="none">
      <Circle cx={11} cy={11} r={2.4} stroke={color} strokeWidth={1.7} />
      <Path
        d="M11 3.4v2.4M11 16.2V18.6M3.4 11h2.4M16.2 11h2.4M5.6 5.6l1.7 1.7M14.7 14.7l1.7 1.7M16.4 5.6l-1.7 1.7M7.3 14.7l-1.7 1.7"
        stroke={color}
        strokeWidth={1.7}
        strokeLinecap="round"
      />
    </Svg>
  );
}

export function Queue({ size = 19, color = 'rgba(246,241,234,.7)' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <Path d="M3 5h14M3 10h9M3 15h9" stroke={color} strokeWidth={1.7} strokeLinecap="round" />
      <Path d="M15.5 10.2v4.6l3.5-2.3z" fill={color} />
    </Svg>
  );
}

export function Plus({ size = 18, color = 'rgba(246,241,234,.6)' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 18 18" fill="none">
      <Path d="M9 3.6v10.8M3.6 9h10.8" stroke={color} strokeWidth={1.7} strokeLinecap="round" />
    </Svg>
  );
}

export function Check({ size = 18, color = '#F6F1EA' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 18 18" fill="none">
      <Path
        d="M3.6 9.6l3.4 3.4L14.4 5"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function Grid({ size = 16, color = '#F6F1EA' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <Rect x={1.4} y={1.4} width={5.6} height={5.6} rx={1.6} fill={color} />
      <Rect x={9} y={1.4} width={5.6} height={5.6} rx={1.6} fill={color} />
      <Rect x={1.4} y={9} width={5.6} height={5.6} rx={1.6} fill={color} />
      <Rect x={9} y={9} width={5.6} height={5.6} rx={1.6} fill={color} />
    </Svg>
  );
}

export function Carousel({ size = 16, color = '#F6F1EA' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      {/* Uma capa grande no meio e as vizinhas espiando dos lados. */}
      <Rect x={5} y={2.4} width={6} height={11.2} rx={1.8} fill={color} />
      <Rect x={0.8} y={4.6} width={2.8} height={6.8} rx={1.2} fill={color} opacity={0.42} />
      <Rect x={12.4} y={4.6} width={2.8} height={6.8} rx={1.2} fill={color} opacity={0.42} />
    </Svg>
  );
}

export function Output({ size = 18, color = '#F6F1EA' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      {/* Alto-falante e duas ondas: o mesmo desenho do painel de saída do sistema. */}
      <Path d="M3.4 8h2.4L9.2 5.2v9.6L5.8 12H3.4z" fill={color} />
      <Path
        d="M12.4 7.6a3.6 3.6 0 010 4.8M15 5.2a7.2 7.2 0 010 9.6"
        stroke={color}
        strokeWidth={1.7}
        strokeLinecap="round"
      />
    </Svg>
  );
}

export function Repeat({ size = 19, color = '#F6F1EA', one = false }: IconProps & { one?: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <Path
        d="M5.5 6.5h9a2.5 2.5 0 012.5 2.5v1M14.5 13.5h-9A2.5 2.5 0 013 11v-1"
        stroke={color}
        strokeWidth={1.6}
        strokeLinecap="round"
      />
      <Path d="M12.6 4.4L14.8 6.5l-2.2 2.1" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M7.4 15.6L5.2 13.5l2.2-2.1" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
      {one ? <Path d="M10 8.2v3.6M10 8.2l-1 .8" stroke={color} strokeWidth={1.5} strokeLinecap="round" /> : null}
    </Svg>
  );
}

export function DragHandle({ size = 18, color = 'rgba(246,241,234,.42)' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 18 18" fill="none">
      <Path d="M4 6.2h10M4 9h10M4 11.8h10" stroke={color} strokeWidth={1.6} strokeLinecap="round" />
    </Svg>
  );
}

export function Lock({ size = 19, color = 'rgba(246,241,234,.7)' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 19 19" fill="none">
      <Rect x={3.4} y={8} width={12.2} height={9.2} rx={2.4} stroke={color} strokeWidth={1.5} />
      <Path d="M6.4 8V5.8a3.1 3.1 0 016.2 0V8" stroke={color} strokeWidth={1.5} />
    </Svg>
  );
}

export function Disc({ size = 16, color = '#F6F1EA' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 18 18" fill="none">
      <Circle cx={9} cy={9} r={6.6} stroke={color} strokeWidth={1.6} />
      <Circle cx={9} cy={9} r={1.6} stroke={color} strokeWidth={1.6} />
    </Svg>
  );
}

export function Lyrics({ size = 16, color = '#F6F1EA' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 18 18" fill="none">
      <Path
        d="M3 4.6h12M3 9h8.5M3 13.4h6"
        stroke={color}
        strokeWidth={1.7}
        strokeLinecap="round"
      />
    </Svg>
  );
}

export function ArrowRight({ size = 14, color = '#12100E' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <Path
        d="M3 8h9M8.4 4l4 4-4 4"
        stroke={color}
        strokeWidth={1.9}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** Anel de progresso da tela de varredura (r=98, circunferência 615.75). */
export function ScanRing({ size = 236, progress, color }: { size?: number; progress: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 236 236" style={{ transform: [{ rotate: '-90deg' }] }}>
      <Circle cx={118} cy={118} r={98} fill="none" stroke="rgba(246,241,234,.09)" strokeWidth={7} />
      <Circle
        cx={118}
        cy={118}
        r={98}
        fill="none"
        stroke={color}
        strokeWidth={7}
        strokeLinecap="round"
        strokeDasharray={615.75}
        strokeDashoffset={615.75 * (1 - progress)}
      />
    </Svg>
  );
}
