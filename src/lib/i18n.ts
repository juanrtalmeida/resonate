/**
 * Os textos do app, em cinco idiomas.
 *
 * Uma entrada por chave, com as cinco traduções lado a lado — e não cinco arquivos, um
 * por idioma. O que se quer garantir aqui é que nenhuma chave fique sem tradução, e com os
 * idiomas na mesma linha isso é visível ao ler e verificado pelo `satisfies` abaixo:
 * faltando um, o TypeScript recusa o arquivo. Em cinco arquivos paralelos a falta só
 * apareceria na tela do usuário, em português no meio do japonês.
 *
 * Sem biblioteca de i18n: o app precisa de procurar texto, interpolar `{nome}` e escolher
 * singular ou plural. São doze linhas de código, e o pacote traria um formatador ICU
 * inteiro para isso.
 *
 * O idioma mora nas preferências (`language`), com `auto` de padrão — quem já usava o app
 * em português continua em português sem escolher nada.
 *
 * Este arquivo é puro de propósito: nada de React e nada de preferências. É o que deixa o
 * dicionário rodar em `node --test`, onde ele é conferido chave por chave. Os hooks
 * `useT` e `useLang` moram em `prefs.tsx`, ao lado da escolha do idioma.
 */

export type Lang = 'pt' | 'en' | 'es' | 'ja' | 'zh';

/** Cada idioma no próprio idioma: ninguém procura "Japonês" numa tela em japonês. */
export const LANGS: { key: Lang; label: string }[] = [
  { key: 'pt', label: 'Português' },
  { key: 'en', label: 'English' },
  { key: 'es', label: 'Español' },
  { key: 'ja', label: '日本語' },
  { key: 'zh', label: '中文' },
];

/**
 * O dicionário.
 *
 * `_one` é a forma de singular, escolhida quando `n` vale 1. Japonês e chinês não contam
 * plural, então lá as duas formas são a mesma — está escrito assim de propósito, para a
 * chave existir e não cair no português.
 */
const DICT = {
  // barra inferior
  'nav.library': { pt: 'Biblioteca', en: 'Library', es: 'Biblioteca', ja: 'ライブラリ', zh: '音乐库' },
  'nav.search': { pt: 'Busca', en: 'Search', es: 'Buscar', ja: '検索', zh: '搜索' },
  'nav.stats': { pt: 'Escuta', en: 'Listening', es: 'Escucha', ja: '再生', zh: '收听' },
  'nav.settings': { pt: 'Ajustes', en: 'Settings', es: 'Ajustes', ja: '設定', zh: '设置' },

  // abas da biblioteca
  'tab.albums': { pt: 'Álbuns', en: 'Albums', es: 'Álbumes', ja: 'アルバム', zh: '专辑' },
  'tab.artists': { pt: 'Artistas', en: 'Artists', es: 'Artistas', ja: 'アーティスト', zh: '艺人' },
  'tab.tracks': { pt: 'Faixas', en: 'Tracks', es: 'Pistas', ja: '曲', zh: '歌曲' },
  'tab.playlists': { pt: 'Listas', en: 'Playlists', es: 'Listas', ja: 'プレイリスト', zh: '播放列表' },
  'tab.liked': { pt: 'Favoritos', en: 'Favorites', es: 'Favoritos', ja: 'お気に入り', zh: '收藏' },
  'tab.podcasts': { pt: 'Podcasts', en: 'Podcasts', es: 'Podcasts', ja: 'ポッドキャスト', zh: '播客' },
  'tab.audiobooks': { pt: 'Audiolivros', en: 'Audiobooks', es: 'Audiolibros', ja: 'オーディオブック', zh: '有声书' },

  // biblioteca
  'lib.title': { pt: 'Sua biblioteca', en: 'Your library', es: 'Tu biblioteca', ja: 'ライブラリ', zh: '你的音乐库' },
  'lib.stats': {
    pt: '{tracks} faixas · {albums} álbuns · {hours} h',
    en: '{tracks} tracks · {albums} albums · {hours} h',
    es: '{tracks} pistas · {albums} álbumes · {hours} h',
    ja: '{tracks}曲 · {albums}枚 · {hours}時間',
    zh: '{tracks} 首 · {albums} 张 · {hours} 小时',
  },
  'lib.recent': { pt: 'Recém-encontrados', en: 'Just found', es: 'Recién encontrados', ja: '最近見つかった', zh: '最近发现' },
  /** A etiqueta na capa dos recém-encontrados. Caixa alta, uma palavra só. */
  'lib.newBadge': { pt: 'NOVO', en: 'NEW', es: 'NUEVO', ja: 'NEW', zh: '新' },
  'lib.allAlbums': { pt: 'Todos os álbuns', en: 'All albums', es: 'Todos los álbumes', ja: 'すべてのアルバム', zh: '全部专辑' },
  'lib.likedAlbums': { pt: 'Álbuns curtidos', en: 'Liked albums', es: 'Álbumes favoritos', ja: 'お気に入りのアルバム', zh: '收藏的专辑' },
  'lib.likedTracks': { pt: 'Faixas curtidas', en: 'Liked tracks', es: 'Pistas favoritas', ja: 'お気に入りの曲', zh: '收藏的歌曲' },
  'lib.shows': { pt: 'Programas', en: 'Shows', es: 'Programas', ja: '番組', zh: '节目' },
  'lib.books': { pt: 'Livros', en: 'Books', es: 'Libros', ja: '書籍', zh: '书籍' },
  'lib.newPlaylist': { pt: 'Nova lista', en: 'New playlist', es: 'Nueva lista', ja: '新規プレイリスト', zh: '新建播放列表' },
  'lib.playlistName': { pt: 'Nome da lista', en: 'Playlist name', es: 'Nombre de la lista', ja: 'プレイリスト名', zh: '播放列表名称' },
  'lib.allGenres': { pt: 'Todos', en: 'All', es: 'Todos', ja: 'すべて', zh: '全部' },

  // estados vazios da biblioteca
  'empty.albums': { pt: 'Biblioteca vazia', en: 'Empty library', es: 'Biblioteca vacía', ja: 'ライブラリは空です', zh: '音乐库为空' },
  'empty.albums.body': {
    pt: 'Nenhum álbum por aqui ainda. Varra o aparelho de novo em Ajustes.',
    en: 'No albums yet. Scan the device again from Settings.',
    es: 'Aún no hay álbumes. Vuelve a escanear el dispositivo en Ajustes.',
    ja: 'アルバムがまだありません。設定から端末を再スキャンしてください。',
    zh: '还没有专辑。请到设置里重新扫描设备。',
  },
  'empty.artists': { pt: 'Nenhum artista', en: 'No artists', es: 'Ningún artista', ja: 'アーティストなし', zh: '没有艺人' },
  'empty.artists.body': {
    pt: 'A varredura não encontrou nada com metadados de artista.',
    en: 'The scan found nothing with artist metadata.',
    es: 'El escaneo no encontró nada con metadatos de artista.',
    ja: 'アーティスト情報を持つファイルが見つかりませんでした。',
    zh: '扫描没有找到带有艺人信息的文件。',
  },
  'empty.playlists': { pt: 'Nenhuma lista ainda', en: 'No playlists yet', es: 'Ninguna lista aún', ja: 'プレイリストがありません', zh: '还没有播放列表' },
  'empty.playlists.body': {
    pt: 'Segure uma faixa em qualquer tela para criar a primeira.',
    en: 'Hold a track on any screen to create your first one.',
    es: 'Mantén pulsada una pista en cualquier pantalla para crear la primera.',
    ja: 'どの画面でも曲を長押しすると最初のプレイリストを作れます。',
    zh: '在任意界面长按一首歌曲即可创建第一个列表。',
  },
  'empty.liked': { pt: 'Nada curtido ainda', en: 'Nothing liked yet', es: 'Nada en favoritos', ja: 'お気に入りはまだありません', zh: '还没有收藏' },
  'empty.liked.body': {
    pt: 'Toque no coração de uma faixa no Now Playing, ou no de um álbum, para guardá-la aqui.',
    en: 'Tap the heart on a track in Now Playing, or on an album, to keep it here.',
    es: 'Toca el corazón de una pista en Now Playing, o de un álbum, para guardarla aquí.',
    ja: '再生画面の曲やアルバムのハートを押すと、ここに残ります。',
    zh: '在播放页点击歌曲或专辑的心形图标，就会保存在这里。',
  },
  'empty.tracks': { pt: 'Nenhuma faixa', en: 'No tracks', es: 'Ninguna pista', ja: '曲がありません', zh: '没有歌曲' },
  'empty.tracks.body': {
    pt: 'Varra o aparelho de novo em Ajustes para procurar música.',
    en: 'Scan the device again from Settings to look for music.',
    es: 'Vuelve a escanear el dispositivo en Ajustes para buscar música.',
    ja: '設定から端末を再スキャンして音楽を探してください。',
    zh: '到设置里重新扫描设备来查找音乐。',
  },
  'empty.podcasts': { pt: 'Nenhum podcast', en: 'No podcasts', es: 'Ningún podcast', ja: 'ポッドキャストなし', zh: '没有播客' },
  'empty.podcasts.body': {
    pt: 'Entram aqui os arquivos com gênero de podcast, os mais longos que 25 minutos, e o que você marcar como podcast segurando um álbum.',
    en: 'Files tagged with a podcast genre land here, along with anything longer than 25 minutes and whatever you mark as a podcast by holding an album.',
    es: 'Aquí llegan los archivos con género de podcast, los que pasan de 25 minutos y lo que marques como podcast manteniendo pulsado un álbum.',
    ja: 'ジャンルがポッドキャストのファイル、25分を超えるファイル、アルバムを長押ししてポッドキャストに指定したものがここに入ります。',
    zh: '流派标记为播客的文件、超过 25 分钟的文件，以及你长按专辑标记为播客的内容都会出现在这里。',
  },
  'empty.audiobooks': { pt: 'Nenhum audiolivro', en: 'No audiobooks', es: 'Ningún audiolibro', ja: 'オーディオブックなし', zh: '没有有声书' },
  'empty.audiobooks.body': {
    pt: 'Entram aqui os arquivos com gênero de audiolivro, e o que você marcar como audiolivro segurando um álbum.',
    en: 'Files tagged with an audiobook genre land here, along with whatever you mark as an audiobook by holding an album.',
    es: 'Aquí llegan los archivos con género de audiolibro y lo que marques como audiolibro manteniendo pulsado un álbum.',
    ja: 'ジャンルがオーディオブックのファイルと、アルバムを長押しして指定したものがここに入ります。',
    zh: '流派标记为有声书的文件，以及你长按专辑标记为有声书的内容都会出现在这里。',
  },

  // contagens
  'count.tracks': { pt: '{n} faixas', en: '{n} tracks', es: '{n} pistas', ja: '{n}曲', zh: '{n} 首' },
  'count.tracks_one': { pt: '1 faixa', en: '1 track', es: '1 pista', ja: '1曲', zh: '1 首' },
  'count.albums': { pt: '{n} álbuns', en: '{n} albums', es: '{n} álbumes', ja: '{n}枚', zh: '{n} 张专辑' },
  'count.albums_one': { pt: '1 álbum', en: '1 album', es: '1 álbum', ja: '1枚', zh: '1 张专辑' },
  'count.episodes': { pt: '{n} episódios', en: '{n} episodes', es: '{n} episodios', ja: '{n}エピソード', zh: '{n} 集' },
  'count.episodes_one': { pt: '1 episódio', en: '1 episode', es: '1 episodio', ja: '1エピソード', zh: '1 集' },
  'count.chapters': { pt: '{n} capítulos', en: '{n} chapters', es: '{n} capítulos', ja: '{n}章', zh: '{n} 章' },
  'count.chapters_one': { pt: '1 capítulo', en: '1 chapter', es: '1 capítulo', ja: '1章', zh: '1 章' },
  'count.folders': { pt: '{n} pastas', en: '{n} folders', es: '{n} carpetas', ja: '{n}フォルダ', zh: '{n} 个文件夹' },
  'count.folders_one': { pt: '1 pasta', en: '1 folder', es: '1 carpeta', ja: '1フォルダ', zh: '1 个文件夹' },
  'count.files': { pt: '{n} arquivos', en: '{n} files', es: '{n} archivos', ja: '{n}ファイル', zh: '{n} 个文件' },
  /** Só o substantivo, em caixa alta, sob o percentual da varredura. */
  'count.filesUnit': { pt: 'ARQUIVOS', en: 'FILES', es: 'ARCHIVOS', ja: 'ファイル', zh: '个文件' },

  // unidades em caixa alta, no cabeçalho do álbum
  'unit.tracks': { pt: 'FAIXAS', en: 'TRACKS', es: 'PISTAS', ja: '曲', zh: '首' },
  'unit.episodes': { pt: 'EPISÓDIOS', en: 'EPISODES', es: 'EPISODIOS', ja: 'エピソード', zh: '集' },
  'unit.chapters': { pt: 'CAPÍTULOS', en: 'CHAPTERS', es: 'CAPÍTULOS', ja: '章', zh: '章' },

  // álbum
  'album.notFound': { pt: 'Álbum não encontrado.', en: 'Album not found.', es: 'Álbum no encontrado.', ja: 'アルバムが見つかりません。', zh: '找不到专辑。' },
  'album.playAll': { pt: 'Tocar álbum', en: 'Play album', es: 'Reproducir álbum', ja: 'アルバムを再生', zh: '播放专辑' },
  'album.play': { pt: 'Tocar', en: 'Play', es: 'Reproducir', ja: '再生', zh: '播放' },
  'album.heard': { pt: 'Ouvido', en: 'Played', es: 'Escuchado', ja: '再生済み', zh: '已听完' },
  'album.resumeAt': { pt: 'Continuar · {time}', en: 'Resume · {time}', es: 'Continuar · {time}', ja: '再開 · {time}', zh: '继续 · {time}' },

  // sessões de leitura
  'session.label': { pt: 'Sessões de leitura', en: 'Listening sessions', es: 'Sesiones de lectura', ja: 'リスニングセッション', zh: '收听时段' },
  'session.at': { pt: 'Sessão {at} de {total}', en: 'Session {at} of {total}', es: 'Sesión {at} de {total}', ja: 'セッション {at}/{total}', zh: '第 {at}/{total} 段' },
  'session.left': { pt: '{min} min restantes', en: '{min} min left', es: '{min} min restantes', ja: '残り{min}分', zh: '剩余 {min} 分钟' },
  'session.resume': { pt: 'Retomar sessão {at}', en: 'Resume session {at}', es: 'Retomar sesión {at}', ja: 'セッション{at}を再開', zh: '继续第 {at} 段' },
  'session.size': { pt: '{n} min', en: '{n} min', es: '{n} min', ja: '{n}分', zh: '{n} 分钟' },
  'session.off': { pt: 'Desligar', en: 'Turn off', es: 'Desactivar', ja: 'オフ', zh: '关闭' },

  // temporizador de desligar
  'sleep.label': { pt: 'Temporizador', en: 'Sleep timer', es: 'Temporizador', ja: 'スリープタイマー', zh: '睡眠定时' },
  'sleep.off': { pt: 'Desligado', en: 'Off', es: 'Apagado', ja: 'オフ', zh: '关闭' },
  'sleep.min': { pt: '{n} min', en: '{n} min', es: '{n} min', ja: '{n}分', zh: '{n} 分钟' },
  'sleep.track': {
    pt: 'Fim da faixa',
    en: 'End of track',
    es: 'Fin de la pista',
    ja: '曲の終わりまで',
    zh: '本曲结束',
  },
  'sleep.left': {
    pt: 'Pausa em {min} min',
    en: 'Pauses in {min} min',
    es: 'Pausa en {min} min',
    ja: 'あと{min}分で一時停止',
    zh: '{min} 分钟后暂停',
  },
  'sleep.leftSeconds': {
    pt: 'Pausa em {s} s',
    en: 'Pauses in {s} s',
    es: 'Pausa en {s} s',
    ja: 'あと{s}秒で一時停止',
    zh: '{s} 秒后暂停',
  },
  'sleep.atEnd': {
    pt: 'Pausa quando esta faixa acabar',
    en: 'Pauses when this track ends',
    es: 'Pausa cuando termine esta pista',
    ja: 'この曲が終わったら一時停止',
    zh: '本曲结束后暂停',
  },

  // estatísticas de escuta
  'stats.title': { pt: 'Sua escuta', en: 'Your listening', es: 'Tu escucha', ja: 'あなたの再生', zh: '你的收听' },
  'stats.open': { pt: 'Estatísticas', en: 'Listening stats', es: 'Estadísticas', ja: '再生の統計', zh: '收听统计' },
  'stats.openBlurb': {
    pt: 'Contado no aparelho, do que você ouviu. Nada sai daqui.',
    en: 'Counted on the device, from what you played. Nothing leaves it.',
    es: 'Calculado en el dispositivo, con lo que escuchaste. Nada sale de aquí.',
    ja: '再生した内容から端末内で集計します。外には出ません。',
    zh: '完全在设备上根据你的播放记录统计，不会外传。',
  },
  'stats.span.week': { pt: '7 dias', en: '7 days', es: '7 días', ja: '7日', zh: '7 天' },
  'stats.span.month': { pt: '30 dias', en: '30 days', es: '30 días', ja: '30日', zh: '30 天' },
  'stats.span.year': { pt: '1 ano', en: '1 year', es: '1 año', ja: '1年', zh: '1 年' },
  'stats.span.all': { pt: 'Tudo', en: 'All time', es: 'Todo', ja: 'すべて', zh: '全部' },
  'stats.pick': { pt: 'Escolher…', en: 'Pick…', es: 'Elegir…', ja: '選ぶ…', zh: '选择…' },
  'stats.pickHint': {
    pt: 'Toque num mês. Toque em outro para pegar o intervalo entre os dois.',
    en: 'Tap a month. Tap another to take the range between the two.',
    es: 'Toca un mes. Toca otro para tomar el intervalo entre ambos.',
    ja: '月をタップ。もう一つタップすると、その間の期間になります。',
    zh: '点一个月份。再点一个可以选中两者之间的区间。',
  },
  'stats.range': { pt: '{from} até {to}', en: '{from} to {to}', es: '{from} a {to}', ja: '{from}〜{to}', zh: '{from} 至 {to}' },
  'stats.hours': { pt: 'horas', en: 'hours', es: 'horas', ja: '時間', zh: '小时' },
  'stats.minutes': { pt: 'minutos', en: 'minutes', es: 'minutos', ja: '分', zh: '分钟' },
  'stats.tracksCounted': { pt: 'faixas', en: 'tracks', es: 'pistas', ja: '曲', zh: '首' },
  'stats.artistsCounted': { pt: 'artistas', en: 'artists', es: 'artistas', ja: 'アーティスト', zh: '艺人' },
  'stats.when': { pt: 'Quando você ouve', en: 'When you listen', es: 'Cuándo escuchas', ja: '聴く時間帯', zh: '你什么时候听' },
  'stats.peak': {
    pt: 'Mais entre {hour}h e {next}h',
    en: 'Mostly between {hour}:00 and {next}:00',
    es: 'Sobre todo entre las {hour} y las {next}',
    ja: '{hour}時から{next}時に集中',
    zh: '主要在 {hour} 点到 {next} 点',
  },
  'stats.topArtists': { pt: 'Mais ouvidos', en: 'Most played artists', es: 'Más escuchados', ja: 'よく聴くアーティスト', zh: '最常听的艺人' },
  'stats.topAlbums': { pt: 'Álbuns mais ouvidos', en: 'Most played albums', es: 'Álbumes más escuchados', ja: 'よく聴くアルバム', zh: '最常听的专辑' },
  'stats.topTracks': { pt: 'Faixas mais ouvidas', en: 'Most played tracks', es: 'Pistas más escuchadas', ja: 'よく聴く曲', zh: '最常听的歌曲' },
  'stats.plays': { pt: '{n} escutas · {min} min', en: '{n} plays · {min} min', es: '{n} escuchas · {min} min', ja: '{n}回 · {min}分', zh: '{n} 次 · {min} 分钟' },
  'stats.plays_one': { pt: '1 escuta · {min} min', en: '1 play · {min} min', es: '1 escucha · {min} min', ja: '1回 · {min}分', zh: '1 次 · {min} 分钟' },
  'stats.empty': { pt: 'Nada contado ainda', en: 'Nothing counted yet', es: 'Nada contado aún', ja: 'まだ記録がありません', zh: '还没有记录' },
  'stats.emptyBody': {
    pt: 'Uma faixa entra na conta depois de meio minuto tocando. Ouça alguma coisa e volte aqui.',
    en: 'A track counts after half a minute of playing. Listen to something and come back.',
    es: 'Una pista cuenta tras medio minuto sonando. Escucha algo y vuelve.',
    ja: '30秒以上再生すると記録されます。何か聴いてから戻ってきてください。',
    zh: '播放满半分钟才会计入。听点什么再回来看看。',
  },
  'stats.forget': { pt: 'Apagar o histórico', en: 'Erase the history', es: 'Borrar el historial', ja: '履歴を消去', zh: '清除记录' },
  'stats.forgetDone': { pt: 'Apagado.', en: 'Erased.', es: 'Borrado.', ja: '消去しました。', zh: '已清除。' },

  // artista
  'artist.notFound': { pt: 'Artista não encontrado', en: 'Artist not found', es: 'Artista no encontrado', ja: 'アーティストが見つかりません', zh: '找不到艺人' },
  'artist.notFound.body': {
    pt: 'Nada na biblioteca com esse nome.',
    en: 'Nothing in the library under that name.',
    es: 'No hay nada en la biblioteca con ese nombre.',
    ja: 'その名前のものはライブラリにありません。',
    zh: '音乐库里没有这个名字。',
  },
  'artist.top': { pt: 'Mais tocadas', en: 'Most played', es: 'Más escuchadas', ja: 'よく再生される曲', zh: '最常播放' },
  'artist.allTracks': { pt: 'Todas as faixas', en: 'All tracks', es: 'Todas las pistas', ja: 'すべての曲', zh: '全部歌曲' },
  'artist.summary': {
    pt: '{albums} · {tracks} faixas · {time}',
    en: '{albums} · {tracks} tracks · {time}',
    es: '{albums} · {tracks} pistas · {time}',
    ja: '{albums} · {tracks}曲 · {time}',
    zh: '{albums} · {tracks} 首 · {time}',
  },

  // player
  'player.nothing': { pt: 'Nada tocando.', en: 'Nothing playing.', es: 'Nada suena.', ja: '再生中の曲はありません。', zh: '当前没有播放。' },
  'player.playingFrom': { pt: 'Tocando de', en: 'Playing from', es: 'Suena de', ja: '再生元', zh: '正在播放' },
  'player.paused': { pt: 'pausado', en: 'paused', es: 'en pausa', ja: '一時停止', zh: '已暂停' },
  'player.wholeTrack': { pt: 'Faixa inteira', en: 'Whole track', es: 'Pista completa', ja: '曲全体', zh: '整首' },
  'player.sideA': { pt: 'lado a · 33⅓ rpm', en: 'side a · 33⅓ rpm', es: 'lado a · 33⅓ rpm', ja: 'A面 · 33⅓ rpm', zh: 'A 面 · 33⅓ rpm' },
  'player.needleUp': { pt: 'agulha erguida', en: 'needle up', es: 'aguja levantada', ja: '針を上げた', zh: '唱针已抬起' },
  'player.queueEmpty': { pt: 'Nada na fila depois desta faixa.', en: 'Nothing queued after this track.', es: 'Nada en la cola después de esta pista.', ja: 'この曲の後に予約はありません。', zh: '这首之后队列为空。' },
  'player.queueEnds': { pt: 'A fila termina aqui e o áudio para.', en: 'The queue ends here and audio stops.', es: 'La cola termina aquí y el audio se detiene.', ja: 'キューはここで終わり、再生も止まります。', zh: '队列到此结束，播放会停止。' },
  'player.noMatch': { pt: 'Nada na biblioteca se encaixa nesta escolha.', en: 'Nothing in the library fits this choice.', es: 'Nada en la biblioteca encaja con esta opción.', ja: 'この設定に合うものがライブラリにありません。', zh: '音乐库里没有符合这个选择的内容。' },

  'player.after': { pt: 'Depois', en: 'Next up', es: 'Después', ja: 'この後', zh: '接下来' },

  // continuação da fila
  'cont.off': { pt: 'Parar no fim', en: 'Stop at the end', es: 'Parar al final', ja: '最後で停止', zh: '播完就停' },
  'cont.off.short': { pt: 'Parar', en: 'Stop', es: 'Parar', ja: '停止', zh: '停止' },
  'cont.off.blurb': { pt: 'a fila termina e o áudio para', en: 'the queue ends and audio stops', es: 'la cola termina y el audio se detiene', ja: 'キューが終わり再生も止まる', zh: '队列结束，播放停止' },
  'cont.album': { pt: 'Seguir pelo álbum', en: 'Keep going by album', es: 'Seguir por el álbum', ja: 'アルバムで続ける', zh: '按专辑继续' },
  'cont.album.short': { pt: 'Álbum', en: 'Album', es: 'Álbum', ja: 'アルバム', zh: '专辑' },
  'cont.album.blurb': { pt: 'o resto do álbum', en: 'the rest of the album', es: 'el resto del álbum', ja: 'アルバムの残り', zh: '专辑的其余部分' },
  'cont.artist': { pt: 'Seguir pelo artista', en: 'Keep going by artist', es: 'Seguir por el artista', ja: 'アーティストで続ける', zh: '按艺人继续' },
  'cont.artist.short': { pt: 'Artista', en: 'Artist', es: 'Artista', ja: 'アーティスト', zh: '艺人' },
  'cont.artist.blurb': { pt: 'mais do mesmo artista', en: 'more from the same artist', es: 'más del mismo artista', ja: '同じアーティストの曲', zh: '同一位艺人的更多歌曲' },
  'cont.genre': { pt: 'Parecidas', en: 'Similar', es: 'Parecidas', ja: '似た曲', zh: '相似歌曲' },
  'cont.genre.short': { pt: 'Parecidas', en: 'Similar', es: 'Parecidas', ja: '似た曲', zh: '相似' },
  'cont.genre.blurb': { pt: 'outros artistas do mesmo gênero', en: 'other artists in the same genre', es: 'otros artistas del mismo género', ja: '同じジャンルの他のアーティスト', zh: '同类流派的其他艺人' },

  // busca
  'search.title': { pt: 'Busca', en: 'Search', es: 'Buscar', ja: '検索', zh: '搜索' },
  'search.placeholder': { pt: 'Faixa, álbum ou artista', en: 'Track, album or artist', es: 'Pista, álbum o artista', ja: '曲・アルバム・アーティスト', zh: '歌曲、专辑或艺人' },
  'search.clear': { pt: 'limpar', en: 'clear', es: 'limpiar', ja: 'クリア', zh: '清除' },
  'search.prompt': { pt: 'O que você procura?', en: 'What are you after?', es: '¿Qué buscas?', ja: '何をお探しですか？', zh: '你在找什么？' },
  'search.prompt.body': {
    pt: 'Busque por uma faixa, um álbum ou um artista da sua biblioteca.',
    en: 'Search for a track, an album or an artist in your library.',
    es: 'Busca una pista, un álbum o un artista de tu biblioteca.',
    ja: 'ライブラリの曲、アルバム、アーティストを検索できます。',
    zh: '搜索音乐库里的歌曲、专辑或艺人。',
  },
  'search.none': { pt: 'Nada encontrado', en: 'Nothing found', es: 'Nada encontrado', ja: '見つかりません', zh: '没有结果' },
  'search.none.body': { pt: 'Nenhum resultado para “{query}”.', en: 'No results for “{query}”.', es: 'Ningún resultado para “{query}”.', ja: '「{query}」の結果はありません。', zh: '没有“{query}”的结果。' },

  // ajustes
  'settings.title': { pt: 'Ajustes', en: 'Settings', es: 'Ajustes', ja: '設定', zh: '设置' },
  'settings.nowPlaying': { pt: 'Now Playing', en: 'Now Playing', es: 'Now Playing', ja: '再生画面', zh: '播放页' },
  'settings.accent': { pt: 'Cor de acento', en: 'Accent color', es: 'Color de acento', ja: 'アクセントカラー', zh: '强调色' },
  'settings.language': { pt: 'Idioma', en: 'Language', es: 'Idioma', ja: '言語', zh: '语言' },
  'settings.languageAuto': { pt: 'Automático', en: 'Automatic', es: 'Automático', ja: '自動', zh: '自动' },
  'settings.library': { pt: 'Biblioteca', en: 'Library', es: 'Biblioteca', ja: 'ライブラリ', zh: '音乐库' },

  'settings.rescan': { pt: 'Varrer de novo', en: 'Scan again', es: 'Escanear otra vez', ja: '再スキャン', zh: '重新扫描' },
  'settings.scanned': {
    pt: '{tracks} faixas · última varredura em {date}',
    en: '{tracks} tracks · last scanned {date}',
    es: '{tracks} pistas · último escaneo {date}',
    ja: '{tracks}曲 · 最後のスキャン {date}',
    zh: '{tracks} 首 · 上次扫描 {date}',
  },
  'settings.neverScanned': { pt: 'Nenhuma varredura ainda', en: 'Never scanned', es: 'Sin escanear todavía', ja: 'まだスキャンしていません', zh: '还没有扫描过' },
  'settings.wipe': { pt: 'Apagar a biblioteca', en: 'Erase the library', es: 'Borrar la biblioteca', ja: 'ライブラリを消去', zh: '清除音乐库' },
  'settings.wipe.confirm': { pt: 'Apagar a biblioteca?', en: 'Erase the library?', es: '¿Borrar la biblioteca?', ja: 'ライブラリを消去しますか？', zh: '要清除音乐库吗？' },
  'settings.wipe.warning': {
    pt: 'As listas e as curtidas vão junto. Nenhum arquivo de música é apagado do aparelho — você pode varrer de novo depois.',
    en: 'Playlists and likes go with it. No music file is deleted from the device — you can scan again later.',
    es: 'Las listas y los favoritos se van con ella. No se borra ningún archivo de música del dispositivo: puedes escanear otra vez después.',
    ja: 'プレイリストとお気に入りも消えます。端末の音楽ファイルは削除されないので、後で再スキャンできます。',
    zh: '播放列表和收藏会一起清除。设备上的音乐文件不会被删除，之后可以重新扫描。',
  },
  'settings.wipe.body': {
    pt: 'As listas e as curtidas vão junto. Nenhum arquivo de música é apagado do aparelho — você pode varrer de novo depois.',
    en: 'Playlists and likes go with it. No music file is deleted from the device — you can scan again later.',
    es: 'Las listas y los favoritos se van con ella. No se borra ningún archivo de música del dispositivo: puedes volver a escanear después.',
    ja: 'プレイリストとお気に入りも消えます。端末の音楽ファイルは削除されません — 後で再スキャンできます。',
    zh: '播放列表和收藏会一起清除。设备上的音乐文件不会被删除，之后可以重新扫描。',
  },
  'settings.version': { pt: 'Versão {version}', en: 'Version {version}', es: 'Versión {version}', ja: 'バージョン {version}', zh: '版本 {version}' },
  'settings.hue': { pt: 'Matiz', en: 'Hue', es: 'Tono', ja: '色相', zh: '色相' },
  'settings.saturation': { pt: 'Saturação', en: 'Saturation', es: 'Saturación', ja: '彩度', zh: '饱和度' },

  // tratamentos do Now Playing
  'treatment.ember': { pt: 'Brasa', en: 'Ember', es: 'Brasa', ja: 'エンバー', zh: '余烬' },
  'treatment.ember.blurb': {
    pt: 'Capa grande, com o brilho pulsando atrás dela.',
    en: 'Big cover, with the glow pulsing behind it.',
    es: 'Portada grande, con el brillo latiendo detrás.',
    ja: '大きなジャケットの後ろで光が脈打ちます。',
    zh: '大幅封面，背后的光晕缓缓起伏。',
  },
  'treatment.vinyl': { pt: 'Vinil', en: 'Vinyl', es: 'Vinilo', ja: 'レコード', zh: '黑胶' },
  'treatment.vinyl.blurb': {
    pt: 'A capa vira um disco, e ele gira enquanto toca.',
    en: 'The cover becomes a record, and it spins while it plays.',
    es: 'La portada se vuelve un disco y gira mientras suena.',
    ja: 'ジャケットがレコードになり、再生中は回り続けます。',
    zh: '封面变成唱片，播放时会转动。',
  },
  'treatment.wave': { pt: 'Onda', en: 'Wave', es: 'Onda', ja: '波形', zh: '波形' },
  'treatment.wave.blurb': {
    pt: 'A forma de onda da faixa inteira. Toque ou arraste nela para buscar.',
    en: 'The waveform of the whole track. Tap or drag it to seek.',
    es: 'La forma de onda de toda la pista. Tócala o arrástrala para buscar.',
    ja: '曲全体の波形です。タップまたはドラッグで移動できます。',
    zh: '整首歌的波形。点击或拖动即可跳转。',
  },

  // menu de toque longo
  'menu.play': { pt: 'Tocar', en: 'Play', es: 'Reproducir', ja: '再生', zh: '播放' },
  'menu.playAll': { pt: 'Tocar tudo', en: 'Play all', es: 'Reproducir todo', ja: 'すべて再生', zh: '全部播放' },
  'menu.shuffle': { pt: 'Embaralhar', en: 'Shuffle', es: 'Aleatorio', ja: 'シャッフル', zh: '随机播放' },
  'menu.playNext': { pt: 'Tocar em seguida', en: 'Play next', es: 'Reproducir a continuación', ja: '次に再生', zh: '下一首播放' },
  'menu.playLast': { pt: 'No fim da fila', en: 'Add to the end', es: 'Al final de la cola', ja: 'キューの最後に追加', zh: '加到队列末尾' },
  'menu.like': { pt: 'Curtir', en: 'Like', es: 'Me gusta', ja: 'お気に入りに追加', zh: '收藏' },
  'menu.unlike': { pt: 'Descurtir', en: 'Unlike', es: 'Quitar de favoritos', ja: 'お気に入りから外す', zh: '取消收藏' },
  'menu.edit': { pt: 'Editar informações', en: 'Edit info', es: 'Editar información', ja: '情報を編集', zh: '编辑信息' },
  'menu.asPodcast': { pt: 'Tratar como podcast', en: 'Treat as a podcast', es: 'Tratar como podcast', ja: 'ポッドキャストとして扱う', zh: '视为播客' },
  'menu.asAudiobook': { pt: 'Tratar como audiolivro', en: 'Treat as an audiobook', es: 'Tratar como audiolibro', ja: 'オーディオブックとして扱う', zh: '视为有声书' },
  'menu.asMusic': { pt: 'Tratar como música', en: 'Treat as music', es: 'Tratar como música', ja: '音楽として扱う', zh: '视为音乐' },
  'menu.addToPlaylist': { pt: 'Adicionar a uma lista', en: 'Add to a playlist', es: 'Añadir a una lista', ja: 'プレイリストに追加', zh: '添加到播放列表' },
  'menu.share': { pt: 'Compartilhar', en: 'Share', es: 'Compartir', ja: '共有', zh: '分享' },
  'menu.stories': { pt: 'Stories', en: 'Stories', es: 'Stories', ja: 'ストーリーズ', zh: '快拍' },
  'menu.deletePlaylist': { pt: 'Apagar esta lista', en: 'Delete this playlist', es: 'Borrar esta lista', ja: 'このプレイリストを削除', zh: '删除此播放列表' },
  'menu.deletePlaylist.confirm': { pt: 'Apagar “{name}”?', en: 'Delete “{name}”?', es: '¿Borrar “{name}”?', ja: '「{name}」を削除しますか？', zh: '要删除“{name}”吗？' },
  'menu.deletePlaylist.warning': {
    pt: 'A lista sai do app. As faixas continuam no aparelho.',
    en: 'The playlist leaves the app. The files stay on the device.',
    es: 'La lista sale de la app. Los archivos siguen en el dispositivo.',
    ja: 'プレイリストはアプリから消えますが、ファイルは端末に残ります。',
    zh: '播放列表会从应用里消失，文件仍留在设备上。',
  },
  'menu.removeFile': { pt: 'Remover do dispositivo', en: 'Remove from device', es: 'Quitar del dispositivo', ja: '端末から削除', zh: '从设备中删除' },
  'menu.removeFiles': { pt: 'Remover {n} arquivos do dispositivo', en: 'Remove {n} files from device', es: 'Quitar {n} archivos del dispositivo', ja: '{n}件のファイルを端末から削除', zh: '从设备中删除 {n} 个文件' },
  'menu.removeFile.confirm': { pt: 'Apagar “{title}” do aparelho?', en: 'Delete “{title}” from the device?', es: '¿Borrar “{title}” del dispositivo?', ja: '「{title}」を端末から削除しますか？', zh: '要从设备中删除“{title}”吗？' },
  'menu.removeFiles.confirm': { pt: 'Apagar {n} arquivos do aparelho?', en: 'Delete {n} files from the device?', es: '¿Borrar {n} archivos del dispositivo?', ja: '{n}件のファイルを端末から削除しますか？', zh: '要从设备中删除 {n} 个文件吗？' },
  'menu.removeFile.warning': {
    pt: 'Isto apaga o arquivo do aparelho e não tem volta.',
    en: 'This deletes the file from the device and cannot be undone.',
    es: 'Esto borra el archivo del dispositivo y no se puede deshacer.',
    ja: '端末からファイルを削除します。取り消せません。',
    zh: '这会从设备中删除文件，且无法撤销。',
  },
  'menu.removeFiles.warning': {
    pt: 'Isto apaga os arquivos do aparelho e não tem volta.',
    en: 'This deletes the files from the device and cannot be undone.',
    es: 'Esto borra los archivos del dispositivo y no se puede deshacer.',
    ja: '端末からファイルを削除します。取り消せません。',
    zh: '这会从设备中删除这些文件，且无法撤销。',
  },

  // folha de edição
  'edit.track': { pt: 'Editar faixa', en: 'Edit track', es: 'Editar pista', ja: '曲を編集', zh: '编辑歌曲' },
  'edit.album': { pt: 'Editar álbum', en: 'Edit album', es: 'Editar álbum', ja: 'アルバムを編集', zh: '编辑专辑' },
  'edit.artist': { pt: 'Editar artista', en: 'Edit artist', es: 'Editar artista', ja: 'アーティストを編集', zh: '编辑艺人' },
  'edit.reach': { pt: 'A correção vale para {tracks}', en: 'The fix applies to {tracks}', es: 'La corrección vale para {tracks}', ja: '{tracks}に適用されます', zh: '修改将应用于{tracks}' },
  'edit.field.title': { pt: 'Título', en: 'Title', es: 'Título', ja: 'タイトル', zh: '标题' },
  'edit.field.artist': { pt: 'Artista', en: 'Artist', es: 'Artista', ja: 'アーティスト', zh: '艺人' },
  'edit.field.artistName': { pt: 'Nome do artista', en: 'Artist name', es: 'Nombre del artista', ja: 'アーティスト名', zh: '艺人名称' },
  'edit.field.album': { pt: 'Álbum', en: 'Album', es: 'Álbum', ja: 'アルバム', zh: '专辑' },
  'edit.field.number': { pt: 'Número', en: 'Number', es: 'Número', ja: 'トラック番号', zh: '曲目号' },
  'edit.field.genre': { pt: 'Gênero', en: 'Genre', es: 'Género', ja: 'ジャンル', zh: '流派' },
  'edit.useTag': { pt: 'Usar a tag', en: 'Use the tag', es: 'Usar la etiqueta', ja: 'タグの値に戻す', zh: '使用标签值' },

  // folha de listas
  'sheet.addTracks': { pt: 'Adicionar {tracks}', en: 'Add {tracks}', es: 'Añadir {tracks}', ja: '{tracks}を追加', zh: '添加{tracks}' },
  'sheet.newPlaylistName': { pt: 'Nome de uma lista nova', en: 'Name for a new playlist', es: 'Nombre de una lista nueva', ja: '新しいプレイリストの名前', zh: '新播放列表的名称' },
  'sheet.add': { pt: 'Adicionar', en: 'Add', es: 'Añadir', ja: '追加', zh: '添加' },

  // listas
  'playlist.notFound': { pt: 'Lista não encontrada.', en: 'Playlist not found.', es: 'Lista no encontrada.', ja: 'プレイリストが見つかりません。', zh: '找不到播放列表。' },
  'playlist.empty': { pt: 'Lista vazia', en: 'Empty playlist', es: 'Lista vacía', ja: 'プレイリストは空です', zh: '播放列表为空' },
  'playlist.empty.body': {
    pt: 'Segure uma faixa em qualquer tela do app para jogá-la aqui.',
    en: 'Hold a track anywhere in the app to drop it in here.',
    es: 'Mantén pulsada una pista en cualquier pantalla para traerla aquí.',
    ja: 'アプリのどこかで曲を長押しすると、ここに追加できます。',
    zh: '在应用任意界面长按歌曲即可加到这里。',
  },
  'playlist.done': { pt: 'Pronto', en: 'Done', es: 'Listo', ja: '完了', zh: '完成' },
  'playlist.edit': { pt: 'Editar', en: 'Edit', es: 'Editar', ja: '編集', zh: '编辑' },
  'playlist.pickCover': { pt: 'Escolher capa', en: 'Pick a cover', es: 'Elegir portada', ja: 'カバーを選ぶ', zh: '选择封面' },
  'playlist.changeCover': { pt: 'Trocar capa', en: 'Change cover', es: 'Cambiar portada', ja: 'カバーを変更', zh: '更换封面' },
  'playlist.removeCover': { pt: 'Remover a capa', en: 'Remove the cover', es: 'Quitar la portada', ja: 'カバーを削除', zh: '移除封面' },

  // letra
  'lyrics.none': { pt: 'Sem letra', en: 'No lyrics', es: 'Sin letra', ja: '歌詞なし', zh: '没有歌词' },
  'lyrics.none.body': {
    pt: 'O Resonate procura a letra dentro do arquivo e num .lrc ao lado dele. Esta faixa não tem nenhum dos dois.',
    en: 'Resonate looks for lyrics inside the file and in a .lrc next to it. This track has neither.',
    es: 'Resonate busca la letra dentro del archivo y en un .lrc junto a él. Esta pista no tiene ninguno.',
    ja: 'Resonate はファイル内と隣の .lrc から歌詞を探します。この曲にはどちらもありません。',
    zh: 'Resonate 会在文件内部和同目录的 .lrc 里找歌词。这首歌两者都没有。',
  },
  'lyrics.pick': { pt: 'Escolher um .lrc', en: 'Pick a .lrc', es: 'Elegir un .lrc', ja: '.lrc を選ぶ', zh: '选择 .lrc 文件' },

  // varredura e primeira execução
  'scan.title': { pt: 'Varredura', en: 'Scan', es: 'Escaneo', ja: 'スキャン', zh: '扫描' },
  'scan.reading': { pt: 'Lendo seu armazenamento…', en: 'Reading your storage…', es: 'Leyendo tu almacenamiento…', ja: 'ストレージを読み込み中…', zh: '正在读取存储…' },
  'scan.done': { pt: 'Tudo seu.', en: 'All yours.', es: 'Todo tuyo.', ja: '準備できました。', zh: '好了。' },
  'scan.failed': { pt: 'Não deu certo.', en: 'That did not work.', es: 'No funcionó.', ja: 'うまくいきませんでした。', zh: '没有成功。' },
  'scan.albums': { pt: 'álbuns', en: 'albums', es: 'álbumes', ja: 'アルバム', zh: '专辑' },
  'scan.artists': { pt: 'artistas', en: 'artists', es: 'artistas', ja: 'アーティスト', zh: '艺人' },
  'scan.hours': { pt: 'horas', en: 'hours', es: 'horas', ja: '時間', zh: '小时' },
  'scan.back': { pt: 'Voltar e escolher as pastas de novo', en: 'Go back and pick folders again', es: 'Volver y elegir las carpetas otra vez', ja: '戻ってフォルダを選び直す', zh: '返回重新选择文件夹' },
  'onboarding.first': { pt: 'Primeira execução', en: 'First run', es: 'Primera vez', ja: '初回起動', zh: '首次运行' },
  'onboarding.lead': { pt: 'Vamos achar o que já está aqui.', en: 'Let us find what is already here.', es: 'Vamos a encontrar lo que ya está aquí.', ja: 'すでにある音楽を探しましょう。', zh: '先找出设备里已有的音乐。' },
  'onboarding.looking': { pt: 'Vendo o que tem no aparelho…', en: 'Seeing what is on the device…', es: 'Viendo qué hay en el dispositivo…', ja: '端末の中を確認中…', zh: '正在查看设备内容…' },
  'onboarding.pitch': {
    pt: 'Sem login, sem streaming. O Resonate lê os arquivos que já estão no seu aparelho e deixa cada um deles exatamente onde está.',
    en: 'No login, no streaming. Resonate reads the files already on your device and leaves every one of them exactly where it is.',
    es: 'Sin cuenta, sin streaming. Resonate lee los archivos que ya están en tu dispositivo y deja cada uno exactamente donde está.',
    ja: 'ログインもストリーミングもありません。Resonate は端末にすでにあるファイルを読み、どれも元の場所のままにします。',
    zh: '无需登录，也不做流媒体。Resonate 读取设备上已有的文件，并让每个文件留在原处。',
  },
  'onboarding.privacy': {
    pt: 'Nada é enviado. Os arquivos ficam exatamente onde estão.',
    en: 'Nothing is uploaded. The files stay exactly where they are.',
    es: 'Nada se envía. Los archivos se quedan donde están.',
    ja: '何も送信しません。ファイルはそのままの場所に残ります。',
    zh: '不会上传任何内容。文件都留在原处。',
  },
  'onboarding.where': { pt: 'Onde eu procuro?', en: 'Where should I look?', es: '¿Dónde busco?', ja: 'どこを探しますか？', zh: '要在哪里查找？' },
  'onboarding.imported': { pt: 'O que já foi importado', en: 'What has been imported', es: 'Lo que ya se importó', ja: 'インポート済みのもの', zh: '已导入的内容' },
  'onboarding.nothing': { pt: 'Nenhum arquivo de áudio encontrado neste aparelho.', en: 'No audio files found on this device.', es: 'No se encontraron archivos de audio en este dispositivo.', ja: 'この端末に音声ファイルが見つかりません。', zh: '在这台设备上没有找到音频文件。' },
  'onboarding.nothingIos': {
    pt: 'Nenhuma música aqui ainda. Importe arquivos ou arraste-os para a pasta do Resonate no app Arquivos.',
    en: 'No music here yet. Import files, or drop them into the Resonate folder in the Files app.',
    es: 'Aún no hay música. Importa archivos o arrástralos a la carpeta de Resonate en Archivos.',
    ja: 'まだ音楽がありません。ファイルをインポートするか、ファイルアプリの Resonate フォルダに入れてください。',
    zh: '这里还没有音乐。请导入文件，或把它们放进「文件」应用里的 Resonate 文件夹。',
  },
  'onboarding.browse': { pt: 'Procurar no armazenamento…', en: 'Browse storage…', es: 'Explorar el almacenamiento…', ja: 'ストレージを参照…', zh: '浏览存储…' },
  'onboarding.import': { pt: 'Importar arquivos…', en: 'Import files…', es: 'Importar archivos…', ja: 'ファイルをインポート…', zh: '导入文件…' },
  'onboarding.importing': { pt: 'Importando…', en: 'Importing…', es: 'Importando…', ja: 'インポート中…', zh: '正在导入…' },
  'onboarding.start': { pt: 'Começar a varredura', en: 'Start the scan', es: 'Empezar el escaneo', ja: 'スキャンを開始', zh: '开始扫描' },
  'onboarding.pickFolder': { pt: 'Escolha uma pasta', en: 'Pick a folder', es: 'Elige una carpeta', ja: 'フォルダを選択', zh: '选择文件夹' },
  'onboarding.turnOn': { pt: 'Ligue uma das pastas acima', en: 'Turn on one of the folders above', es: 'Activa una de las carpetas de arriba', ja: '上のフォルダをどれか有効にしてください', zh: '请启用上面任意一个文件夹' },
  'onboarding.selected': { pt: '{on} de {total} selecionadas', en: '{on} of {total} selected', es: '{on} de {total} seleccionadas', ja: '{total}件中{on}件を選択', zh: '已选 {on}/{total}' },
  'onboarding.found': { pt: '{files} · {folders}', en: '{files} · {folders}', es: '{files} · {folders}', ja: '{files} · {folders}', zh: '{files} · {folders}' },
  'onboarding.denied': { pt: 'Sem acesso aos arquivos de áudio', en: 'No access to audio files', es: 'Sin acceso a los archivos de audio', ja: '音声ファイルへのアクセスがありません', zh: '没有访问音频文件的权限' },
  'onboarding.unavailable': { pt: 'Este app precisa de um development build', en: 'This app needs a development build', es: 'Esta app necesita un development build', ja: 'このアプリには development build が必要です', zh: '此应用需要 development build' },
  'onboarding.deniedHow': {
    pt: 'Libere o acesso a música nas configurações do sistema e toque aqui para tentar de novo.',
    en: 'Allow access to music in the system settings, then tap here to try again.',
    es: 'Permite el acceso a la música en los ajustes del sistema y toca aquí para reintentar.',
    ja: 'システム設定で音楽へのアクセスを許可してから、ここをタップしてやり直してください。',
    zh: '请在系统设置中允许访问音乐，然后点这里重试。',
  },
  'onboarding.unavailableHow': {
    pt: 'A leitura da biblioteca de mídia usa um módulo nativo que o Expo Go não tem. Feche e rode `npx expo run:android`. As pastas escolhidas à mão continuam funcionando.',
    en: 'Reading the media library uses a native module that Expo Go does not ship. Close it and run `npx expo run:android`. Folders picked by hand keep working.',
    es: 'Leer la biblioteca de medios usa un módulo nativo que Expo Go no trae. Ciérralo y ejecuta `npx expo run:android`. Las carpetas elegidas a mano siguen funcionando.',
    ja: 'メディアライブラリの読み込みには Expo Go に含まれないネイティブモジュールが必要です。終了して `npx expo run:android` を実行してください。手動で選んだフォルダはそのまま使えます。',
    zh: '读取媒体库需要 Expo Go 不包含的原生模块。请关闭它并运行 `npx expo run:android`。手动选择的文件夹仍然可用。',
  },

  // botões comuns
  'common.cancel': { pt: 'Cancelar', en: 'Cancel', es: 'Cancelar', ja: 'キャンセル', zh: '取消' },
  'common.create': { pt: 'Criar', en: 'Create', es: 'Crear', ja: '作成', zh: '创建' },
  'common.save': { pt: 'Salvar', en: 'Save', es: 'Guardar', ja: '保存', zh: '保存' },
  'common.delete': { pt: 'Apagar', en: 'Delete', es: 'Borrar', ja: '削除', zh: '删除' },
} satisfies Record<string, Record<Lang, string>>;

export type Key = keyof typeof DICT;

/**
 * A função de tradução, para quem a recebe em vez de chamar `useT`.
 *
 * Função pura chamada de dentro de um render — o cabeçalho do menu de contexto, por
 * exemplo — não pode chamar hook, então recebe isto por parâmetro.
 */
export type Translate = (key: Key, vars?: Record<string, string | number>) => string;

/** O que a chave diz naquele idioma, com `{nome}` trocado e o plural escolhido. */
export function translate(
  lang: Lang,
  key: Key,
  vars?: Record<string, string | number>
): string {
  const entry =
    vars?.n === 1 && `${key}_one` in DICT
      ? DICT[`${key}_one` as Key]
      : DICT[key];
  let text = entry[lang] ?? entry.pt;
  if (vars) {
    for (const [name, value] of Object.entries(vars)) {
      text = text.replaceAll(`{${name}}`, String(value));
    }
  }
  return text;
}

/**
 * O idioma do aparelho, quando a escolha é `auto`.
 *
 * Pelo `Intl`, que o Hermes traz — em vez de somar `expo-localization` ao projeto para ler
 * uma etiqueta de idioma. Idioma que não está na lista cai em inglês, e não em português:
 * quem está fora dos cinco tem mais chance de ler inglês do que português.
 */
export function deviceLang(): Lang {
  try {
    const tag = Intl.DateTimeFormat().resolvedOptions().locale.toLowerCase();
    const base = tag.split(/[-_]/)[0];
    if (base === 'pt' || base === 'es' || base === 'ja' || base === 'zh') return base;
    return 'en';
  } catch {
    return 'en';
  }
}

export const resolveLang = (choice: Lang | 'auto'): Lang =>
  choice === 'auto' ? deviceLang() : choice;

/** Etiqueta BCP 47 do idioma em vigor, para as APIs de formatação do sistema. */
export const localeOf = (lang: Lang): string =>
  lang === 'pt' ? 'pt-BR' : lang === 'zh' ? 'zh-CN' : lang === 'ja' ? 'ja-JP' : lang === 'es' ? 'es-ES' : 'en-US';
