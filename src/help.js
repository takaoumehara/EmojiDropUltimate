// ============================================================
// help.js — 「あそびかた」の中身
//
// なぜ別ファイルなのか、そしてなぜ**説明書を作ることに慎重だったのか**:
//
//   説明で埋められる穴は、たいてい設計で埋められる穴でもある。だから
//   「分からない」への最初の答えが説明文になっているゲームは、たぶん
//   どこか間違っている。ここはその逃げ道にはしない。
//
//   ここが引き受けるのは別の役目 —— **疑問が湧いたときに開く場所**。
//   遊ぶ前に読ませない。読まなくても始められる。それでも
//   「3人でやると何が変わるの?」は遊びながらでは分からないので、
//   その一点のためだけに常設の置き場を作る。
//
// 数値は**エンジンから引く**。手で書き写した瞬間に、この画面は嘘をつき始める。
//   残機を調整したら説明書も直す、という運用は必ず破綻する。
//   説明書がコードから離れるくらいなら、説明書は無いほうがまだ良い。
// ============================================================

import { coopScaling } from './engine.js';
import { shieldCount } from './guard.js';
import { RANKS } from './bellrelay.js';
import { diffMods } from './engine.js';

/** 何ページあるか。順番はそのまま表示順。 */
export const HELP_PAGES = ['goal', 'controls', 'chars', 'party', 'connect'];

/**
 * 人数ごとの違いの表。**この画面の目玉。**
 *
 * 遊んでいるだけでは絶対に分からない情報がここに集まっている ——
 * ひとりで遊んでいる人は「4人だと盾持ちが出る」ことを知りようがないし、
 * 4人で遊んでいる人は「ソロなら敵がこの1/4しか来ない」ことを知らない。
 *
 * 縦が項目、横が人数。数値は全部エンジンから取る。
 * @param ja 日本語かどうか
 */
export function partyTable(ja) {
  const s = n => coopScaling(n);
  const solo = diffMods();
  const rank = n => RANKS[Math.min(n, RANKS.length) - 1];
  // 湧きの倍率は「ソロを1としたときの比」。coopSpawnMul がそのまま比になっている。
  const spawn = n => '×' + s(n).spawn.toFixed(1);
  return {
    cols: ja ? ['ひとり', '2人', '3人', '4人'] : ['SOLO', '2P', '3P', '4P'],
    rows: [
      {
        icon: '❤️',
        name: ja ? 'のこき' : 'LIVES',
        // ソロの残機は難易度設定で変わる。いま設定されている値を出す。
        //   「3機」と決め打つと、やさしいにしている人には嘘になる。
        cells: [String(solo.lives), String(s(2).lives), String(s(3).lives), String(s(4).lives)],
        note: ja ? 'みんなで遊ぶときは、全員で1つの残機を分け合う'
                 : 'In co-op the whole party shares one pool of lives',
      },
      {
        icon: '👾',
        name: ja ? 'てきの量' : 'ENEMIES',
        cells: ['×1.0', spawn(2), spawn(3), spawn(4)],
        note: ja ? '人数ぶん増える。ひとり増えても楽にはならない'
                 : 'Scales with the party. More players never means an easier run',
      },
      {
        icon: '🛡',
        name: ja ? 'たてもち' : 'SHIELDS',
        cells: [
          ja ? '出ない' : 'never',
          ja ? `盾${shieldCount(2)}枚` : `${shieldCount(2)} shield`,
          ja ? `盾${shieldCount(3)}枚` : `${shieldCount(3)} shields`,
          ja ? `盾${shieldCount(4)}枚` : `${shieldCount(4)} shields`,
        ],
        note: ja ? 'ひとりでは倒せない敵なので、ソロには出てこない'
                 : 'Unkillable alone, so it never spawns in solo',
      },
      {
        icon: '🔔',
        name: ja ? 'ベルの位' : 'BELL RANK',
        cells: [
          ja ? '1どまり' : 'stuck at 1',
          ja ? `${rank(2).ja}(×${rank(2).mul})` : `${rank(2).name} ×${rank(2).mul}`,
          ja ? `${rank(3).ja}(×${rank(3).mul})` : `${rank(3).name} ×${rank(3).mul}`,
          ja ? `${rank(4).ja}(×${rank(4).mul})` : `${rank(4).name} ×${rank(4).mul}`,
        ],
        note: ja ? '人数が、そのまま取れる強さの上限になる'
                 : 'Your party size is the cap on how strong a bell can get',
      },
    ],
  };
}

/**
 * 1ページぶんの中身。
 *
 * **1ページに新しいことを4つ以上入れない。** 5つ目を入れたくなったら
 * それはページを割る合図であって、説明を丁寧にする合図ではない ——
 * 一度に受け取れる新しい概念は4つが上限なので、5つ書くと
 * 「全部読んだのに何も残らない」ページになる。
 */
export function helpPage(key, ja) {
  switch (key) {
    case 'goal': return {
      icon: '🎯',
      title: ja ? 'なにをするゲーム?' : 'WHAT IS THIS?',
      lead: ja ? '降ってくる敵を撃ち落として、ボスを倒す。それだけ。'
               : 'Shoot what falls at you. Beat the boss. That is the whole game.',
      rows: [
        { icon: '👾', head: ja ? '撃つ' : 'SHOOT',
          body: ja ? '弾は自動で出る。狙いをつける操作は無い ―― 動くことが狙うこと。'
                   : 'You fire automatically. There is no aim button — moving IS aiming.' },
        { icon: '🔔', head: ja ? 'ベルを育てる' : 'RIPEN A BELL',
          body: ja ? '撃つたびに色が変わる。欲しい色にしてから拾う。近づくと色が固まる。'
                   : 'Each hit changes its colour. Pick the colour you want, THEN grab it. It locks in when you get close.' },
        { icon: '👑', head: ja ? 'ボスを倒す' : 'BEAT THE BOSS',
          body: ja ? '面のおわりにボスが出る。倒せば次の面へ。ぶつかると1機減る。'
                   : 'A boss ends every stage. Beat it to move on. A collision costs one life.' },
      ],
      foot: ja ? '読まなくても遊べるように作ってある。困ったときだけ、ここに戻ってくればいい。'
               : 'You should never need this page to start. It is here for when you get curious.',
    };

    case 'controls': return {
      icon: '👆',
      title: ja ? 'そうさ' : 'CONTROLS',
      lead: ja ? '指1本。ボタンは無い。' : 'One finger. No buttons.',
      rows: [
        { icon: '🫳', head: ja ? 'なぞって動く' : 'DRAG TO MOVE',
          body: ja ? '画面のどこを触ってもいい。指の動きにそのままついてくる。'
                   : 'Touch anywhere. The ship follows your finger one-to-one.' },
        { icon: '💥', head: ja ? 'トントンでボム' : 'DOUBLE-TAP TO BOMB',
          body: ja ? '素早く2回叩く。必殺技がたまっていれば、そちらが優先で出る。'
                   : 'Two quick taps. If your super is charged, that fires instead.' },
        { icon: '⏸', head: ja ? '一時停止' : 'PAUSE',
          body: ja ? 'キーボードなら P か Esc。止めているあいだにこのページも開ける。'
                   : 'Press P or Esc on a keyboard. You can open this page while paused.' },
      ],
      foot: ja ? 'キーボードでも遊べる: 矢印キーで移動、スペースでボム。'
               : 'Keyboard works too: arrow keys to move, space to bomb.',
    };

    case 'chars': return {
      icon: '🧑‍🚀',
      title: ja ? 'キャラは、いつでも変えられる' : 'SWAP FIGHTERS ANY TIME',
      lead: ja ? '16人いる。選び直せるので、最初の選択で悩まなくていい。'
               : '16 of them. You are never locked in, so do not agonise over the first pick.',
      rows: [
        { icon: '🔀', head: ja ? '弾の飛び方がぜんぶ違う' : 'EVERY SHOT FLIES DIFFERENTLY',
          body: ja ? 'まっすぐ、追尾、貫通、近距離で重い弾など。強い癖には必ず埋め合わせが付いている。'
                   : 'Straight, homing, piercing, heavy-but-short-range. Every strong quirk carries a cost.' },
        { icon: '🤏', head: ja ? '身のこなし = 当たり判定の大きさ' : 'AGILITY = HITBOX SIZE',
          body: ja ? '素早いキャラほど当たり判定が小さい。指で動かす限り、移動の速さは変わらない。'
                   : 'Nimbler fighters have a smaller hitbox. Drag speed itself is identical for everyone.' },
        { icon: '🔄', head: ja ? 'ステージクリアのたびに変えられる' : 'SWAP AFTER EVERY STAGE',
          body: ja ? 'クリア画面の「キャラを変える」から。面の相性が悪いと思ったら、次の面で変えればいい。'
                   : 'Use “Change fighter” on the clear screen. Bad matchup? Switch before the next stage.' },
      ],
      foot: ja ? 'タイトルの「キャラ」からは、カードを横にめくって全員を見られる。'
               : 'From the title screen, “FIGHTERS” lets you swipe through all of them.',
    };

    case 'party': return {
      icon: '👥',
      title: ja ? 'ひとりと、みんな' : 'SOLO vs PARTY',
      lead: ja ? '人数が増えると、簡単にはならない。難しくなる代わりに、ひとりでは取れない強さが取れる。'
               : 'More players is not easier. It is harder — and it unlocks power solo can never reach.',
      table: true,
      rows: [
        { icon: '🛡', head: ja ? '盾持ちは「一番近い人」に盾を向ける' : 'THE SHIELD FACES WHOEVER IS CLOSEST',
          body: ja ? '前に出た人は撃てない。かわりに盾を引きつける。撃てるのは一番遠いひとりだけ。'
                   : 'Whoever leads cannot damage it — they are drawing the shield. Only the FURTHEST player can.' },
        { icon: '🔔', head: ja ? 'ベルは「違う人」が鳴らすと熟す' : 'A BELL RIPENS WHEN SOMEONE ELSE RINGS IT',
          body: ja ? 'ひとりで何発撃っても位は上がらない。代わるがわる鳴らすと、効き目が人数ぶん強くなる。'
                   : 'Your own shots never raise its rank. Take turns and the payoff scales with the party.' },
      ],
      foot: ja ? '🗡が出ている敵は、あなたが撃てる番。🛡が自分を向いていたら、下がるか、誰かに任せる。'
               : 'A 🗡 means it is your shot. A 🛡 pointed at you means back off, or let someone else take it.',
    };

    case 'connect': return {
      icon: '🔗',
      title: ja ? 'つなげ方' : 'HOW TO CONNECT',
      lead: ja ? '4人まで。専用のサーバーは要らないので、待ち時間も費用もない。'
               : 'Up to four. No game server involved, so there is nothing to wait for and nothing to pay.',
      rows: [
        { icon: '1️⃣', head: ja ? 'タイトルで「みんなで」' : 'TAP “PLAY TOGETHER”',
          body: ja ? 'あいことば6文字が出る。これが部屋の名前になる。'
                   : 'You get a six-character code. That is your room.' },
        { icon: '2️⃣', head: ja ? '相手を呼ぶ' : 'BRING THEM IN',
          body: ja ? 'QRを見せる・招待リンクを送る・あいことばを口で伝える。どれでもいい。'
                   : 'Show the QR, send the invite link, or just say the code out loud. Any of the three.' },
        { icon: '3️⃣', head: ja ? '揃ったら誰かが START' : 'ANYONE CAN START',
          body: ja ? '全員が押す必要はない。ひとりが押せば始まる。あとから増えることはできない。'
                   : 'You do not all have to press it — one is enough. Nobody can join after the start.' },
      ],
      foot: ja ? '⚡=直接つながっている、🛰=中継ごし。ホストが抜けても、残った誰かが自動で引き継ぐ。'
               : '⚡ = direct link, 🛰 = via relay. If the host drops, someone left in the room takes over automatically.',
    };

    default: return null;
  }
}
