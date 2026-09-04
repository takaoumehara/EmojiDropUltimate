#!/usr/bin/env node
// ============================================================
// tools/verify.mjs — 検証をひととおり回す入口
//
//   このリポジトリの検証は3層ある。速い順に:
//
//     1. node --test        … 壊れていないか（2.8秒・依存ゼロ）
//     2. tools/sim          … 遊びとして成立しているか（約50秒・依存ゼロ）
//     3. tools/probe        … 実ブラウザでどう動くか（約4分・Playwright が要る）
//
//   3 だけ npm が要るので、既定では走らせない。--full で入る。
//   src/ と出荷物は依存ゼロのまま —— npm は tools/probe の中だけにある。
//
// 使い方:
//   node tools/verify.mjs          # 1 と 2（約1分）
//   node tools/verify.mjs --full   # 3 も（約5分）
//   node tools/verify.mjs --quick  # 1 だけ
// ============================================================
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const full = argv.includes('--full');
const quick = argv.includes('--quick');

const steps = [];
const run = (label, cmd, args, opt = {}) => {
  process.stdout.write(`\n── ${label}\n`);
  const t0 = Date.now();
  const r = spawnSync(cmd, args, { cwd: opt.cwd || ROOT, stdio: 'inherit', shell: false });
  const ms = Date.now() - t0;
  const ok = r.status === 0;
  steps.push({ label, ok, ms });
  if (!ok && !opt.soft) process.stdout.write(`   ✗ ${label} が失敗した\n`);
  return ok;
};

run('テスト（壊れていないか）', process.execPath, ['--test', ...fs.readdirSync(path.join(ROOT, 'test'))
  .filter(f => f.endsWith('.test.js')).map(f => `test/${f}`)]);

if (!quick) {
  run('自動プレイ（遊びとして成立しているか）', process.execPath,
    ['tools/sim/run.mjs', '--chars', 'all', '--diffs', 'all', '--seeds', '1,2,3',
     '--bots', 'hunter,dodge,sweep,idle', '--report']);
  run('ネイティブ台帳の再生成', process.execPath, ['tools/native-audit.mjs']);
}

if (full) {
  const probe = path.join(ROOT, 'tools/probe');
  if (!fs.existsSync(path.join(probe, 'node_modules'))) {
    run('probe の依存を入れる', 'npm', ['install', '--no-audit', '--no-fund'], { cwd: probe });
  }
  run('実ブラウザ（性能・オフライン・レイアウト）', 'npx', ['playwright', 'test'], { cwd: probe });
  run('probe レポートの再生成', process.execPath, ['write-report.mjs'], { cwd: probe });
}

// --- まとめ -------------------------------------------------
console.log('\n' + '─'.repeat(52));
for (const s of steps) console.log(`${s.ok ? '  ok  ' : ' FAIL '} ${s.label.padEnd(34)} ${(s.ms / 1000).toFixed(1)}s`);
const bad = steps.filter(s => !s.ok);
console.log('─'.repeat(52));
if (bad.length) { console.log(`${bad.length} 件が失敗した。`); process.exit(1); }
console.log('すべて通った。');
if (!full) console.log('（実ブラウザの検証は --full で走る）');
