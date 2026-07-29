// ============================================================
// server/index.js — 常駐サーバーの起動口
//
//   node server/index.js            → :8787 で待ち受け
//   PORT=3000 node server/index.js  → ポート指定
//
// 依存パッケージは無い。git clone してそのまま起動できる。
//
// クライアント側の使い方:
//   index.html で <meta name="coop-relay" content="wss://あなたのサーバー">
//   を書けば、直結に失敗したときここへ落ちてくる。何も書かなければ
//   これまで通り P2P だけで動く(サーバーは完全に任意)。
// ============================================================

import { createServer } from './ws.js';
import { Relay } from './relay.js';

const PORT = Number(process.env.PORT || 8787);
const relay = new Relay();

const app = createServer({
  onHttp(req, res) {
    // 中身の見える状態表示。何部屋・何人いるかだけで、誰が何をしたかは持たない。
    if (req.url === '/stats') {
      res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
      res.end(JSON.stringify(relay.snapshot()));
      return true;
    }
    return false;
  },
  onConnection(conn, url) { relay.accept(conn, url); },
});

const sweeper = setInterval(() => relay.sweep(), 60000);
sweeper.unref();

app.listen(PORT, () => {
  process.stdout.write(`emoji-drop relay listening on :${PORT}\n`);
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => { app.close(); process.exit(0); });
}

export { app, relay };
