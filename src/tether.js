// ============================================================
// tether.js — きずな
//
// 子供が「2人でも1人と変わらない」と言った。技を配って、合体を足して、
// 人数でボスを硬くした。それでも遊び自体は「同じことをする人が2人いる」
// ままだった。人数で難易度を足すのは、やることを増やさない。
//
// **やることそのものを、相方の位置で決まるようにする。**
//
//   ふたりの機体のあいだに線が張る。線に触れた敵は切れる。
//   短く保てば鋭く、離れれば広く薄く、離れすぎれば切れる。
//   ボスには効かないが、線がかかっているあいだは弾がよく通る。
//
// これは1人では絶対に成立しない —— 線の相手が居ないので線が無い。
// そして毎秒「相方はいまどこか」を考えることになる。
//
// 3人以上は総当たりで線を張らない(4人で6本は読めない)。参加順に
// 数珠つなぎにして、人数ぶんより1本少なくする。
// ============================================================

export const TETHER = {
  TIGHT: 100,      // これより近いと「張っている」。鋭いが届かない
  LOOSE: 400,      // これを超えると軋みはじめる
  BREAK: 1.1,      // 軋んだまま何秒で切れるか
  COOL: 3.6,       // 切れてから戻るまで(秒)
  // 線で倒す量。**弱いと「あると気づかない飾り」になる。**
  //   15 で測ったら、55秒のうち線で倒せたのは全体の6%だった。
  //   それでは「2人だから面白い」にはならない。群れを薙いだら群れが消える
  //   —— そのぶん共闘の湧きを増やして釣り合わせる(engine の coopSpawnMul)。
  DPS: 34,
  TIGHT_MUL: 2.1,  // 短いときの倍率
  BRAND: 0.45,     // ボスに線がかかっているあいだ、弾が通りやすくなる割合
  HITW: 13,        // 線の太さ(当たり判定)
};

/**
 * ボスに入るダメージの倍率。線そのものはボスを削らないので、
 * 「ふたりで挟んでいるあいだだけ弾がよく通る」をここで表す。
 */
export function bossDamageMul(st) { return st && st.branded ? 1 + TETHER.BRAND : 1; }

/** 線分 (ax,ay)-(bx,by) と点 (px,py) の距離。 */
export function segDist(ax, ay, bx, by, px, py) {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-6) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

export function newTetherState() {
  return {
    links: [],      // 描画用: {ax,ay,bx,by,len,strain,mul}
    strainT: 0,     // 軋んでいる時間(秒)
    coolT: 0,       // 切れて休んでいる時間(秒)
    branded: false, // いまボスに線がかかっているか
    cuts: 0,        // 線で倒した数(演出とゲージに使う)
    flash: 0,       // 切れた瞬間の演出
  };
}

/**
 * 線の張り具合。倍率は「短いほど強い」。
 * 長さに応じて薄くするのは、離れて広く覆うのが只で強くならないようにするため。
 */
export function strengthFor(len) {
  if (len <= TETHER.TIGHT) return TETHER.TIGHT_MUL;
  if (len >= TETHER.LOOSE) return 0.55;
  const k = (len - TETHER.TIGHT) / (TETHER.LOOSE - TETHER.TIGHT);
  return TETHER.TIGHT_MUL + (0.7 - TETHER.TIGHT_MUL) * k;
}

/**
 * きずなを1フレーム進める。
 *
 * @param dt    秒
 * @param pts   機体の位置 [{x,y}]。自分が先頭、あとは参加順
 * @param st    newTetherState() の状態
 * @param api   { host, enemies, boss, hurt(e, dmg), onBreak(), onCut(e) }
 *
 * ダメージを入れるのはホストだけ。ゲストは線を描くだけで、世界の状態は
 * ホストのスナップショットで上書きされる —— 両方が削ると二重に削れる。
 */
export function updateTether(dt, pts, st, api) {
  st.links.length = 0;
  st.branded = false;
  if (st.flash > 0) st.flash = Math.max(0, st.flash - dt * 3);

  // 休んでいるあいだは線が無い。切れた代償が見えないと、離れる怖さが出ない。
  if (st.coolT > 0) {
    st.coolT -= dt;
    st.strainT = 0;
    return st;
  }
  if (!pts || pts.length < 2) { st.strainT = 0; return st; }

  let anyStrain = false;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i], b = pts[i + 1];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const strain = len > TETHER.LOOSE;
    if (strain) anyStrain = true;
    const mul = strengthFor(len);
    st.links.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y, len, strain, mul });
  }

  // 軋み → 切れる。ひとつでも伸びきっていれば全部が切れる(組の話なので)
  if (anyStrain) {
    st.strainT += dt;
    if (st.strainT >= TETHER.BREAK) {
      st.strainT = 0; st.coolT = TETHER.COOL; st.flash = 1;
      st.links.length = 0;
      if (api && api.onBreak) api.onBreak();
      return st;
    }
  } else st.strainT = Math.max(0, st.strainT - dt * 1.6);

  // ボスの烙印は描画側でも要るので、ホストでなくても判定する
  const boss = api && api.boss;
  if (boss && !boss.entering) {
    const r = 42 * (boss.scale || 1);
    for (const L of st.links) {
      if (segDist(L.ax, L.ay, L.bx, L.by, boss.x, boss.y) < r + TETHER.HITW) { st.branded = true; break; }
    }
  }

  if (!api || !api.host) return st;

  for (const e of api.enemies || []) {
    if (e.delay > 0) continue;
    for (const L of st.links) {
      if (segDist(L.ax, L.ay, L.bx, L.by, e.x, e.y) < (e.size || 16) * 0.7 + TETHER.HITW) {
        const before = e.hp;
        api.hurt(e, TETHER.DPS * L.mul * dt);
        if (before > 0 && e.hp <= 0) { st.cuts++; if (api.onCut) api.onCut(e); }
        break;   // 1体につき1本ぶん。線が重なった場所で二重取りしない
      }
    }
  }
  return st;
}
