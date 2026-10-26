/**
 * Carpeta del instalador de Windows (tools/stage-windows.mjs): lo que se puede comprobar sin Windows.
 * El .exe lo compila Inno Setup en GitHub Actions (.github/workflows/windows-installer.yml); eso no se prueba aquí.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { gameFiles, install } from '../../tools/update.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

test('instalador: juego sin pruebas + dependencias ya marcadas como instaladas + Node.js portátil; el lanzador no reinstala y las actualizaciones no tocan runtime ni data', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'ma-stage-')), src = join(tmp, 'src'), nodeDir = join(tmp, 'node-win'), out = join(tmp, 'app');
  // Copia del proyecto (lo mismo que hay en el repositorio) con un node_modules mínimo de mentira
  for (const rel of gameFiles(ROOT)) { const d = join(src, rel); mkdirSync(dirname(d), { recursive: true }); cpSync(join(ROOT, rel), d); }
  for (const p of ['@colyseus/core', '@colyseus/sdk', 'esbuild']) { mkdirSync(join(src, 'node_modules', p), { recursive: true }); writeFileSync(join(src, 'node_modules', p, 'package.json'), '{}'); }
  mkdirSync(nodeDir, { recursive: true }); writeFileSync(join(nodeDir, 'node.exe'), 'MZ'); writeFileSync(join(nodeDir, 'npm.cmd'), '@echo off');
  const r = spawnSync(process.execPath, [join(src, 'tools/stage-windows.mjs'), '--node', nodeDir, '--out', out], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr + r.stdout);
  // Contenido
  for (const f of ['Jugar.bat', 'version.json', 'update.json', 'tools/launch.mjs', 'tools/update.mjs', 'server/src/index.js', 'prototype/mystery-action.html', 'installer/icon.ico', 'runtime/node.exe', 'runtime/npm.cmd', 'node_modules/@colyseus/core/package.json'])
    assert.ok(existsSync(join(out, f)), 'falta ' + f);
  for (const f of ['tests', '.github', 'data', 'build']) assert.ok(!existsSync(join(out, f)), 'no debería estar ' + f);
  const listed = JSON.parse(readFileSync(join(out, '.update/installed.json'), 'utf8'));
  assert.ok(listed.includes('version.json') && !listed.some(x => x.startsWith('runtime') || x.startsWith('node_modules') || x === 'update.json'));
  // Jugar.bat usa el Node.js portátil si existe
  assert.match(readFileSync(join(out, 'Jugar.bat'), 'utf8'), /if exist "%~dp0runtime\\node\.exe" set "PATH=%~dp0runtime;%PATH%"/);
  // El lanzador ve las dependencias como instaladas (no llama a npm: si lo hiciera, este npm falso fallaría)
  const fakeNpm = join(tmp, 'npm-que-falla.sh'); writeFileSync(fakeNpm, '#!/bin/sh\nexit 3\n', { mode: 0o755 });
  const l = spawnSync(process.execPath, [join(out, 'tools/launch.mjs'), '--install-only', '--no-update'], { cwd: out, encoding: 'utf8', env: Object.assign({}, process.env, { MA_NPM: fakeNpm }) });
  assert.equal(l.status, 0, l.stdout + l.stderr); assert.match(l.stdout, /Dependencias ya instaladas/);
  // Una actualización automática (otra versión del juego) no toca runtime/ ni data/
  mkdirSync(join(out, 'data'), { recursive: true }); writeFileSync(join(out, 'data', '.dev-secret'), 'secreto');
  const v = JSON.parse(readFileSync(join(out, 'version.json'), 'utf8'));
  const entries = listed.map(rel => ({ rel: rel.split('/').join(sep), data: rel === 'version.json' ? Buffer.from(JSON.stringify(Object.assign({}, v, { build: v.build + 1 }))) : readFileSync(join(out, rel)) }));
  install(out, entries);
  assert.ok(existsSync(join(out, 'runtime/node.exe')) && existsSync(join(out, 'node_modules/@colyseus/core')), 'runtime y node_modules intactos');
  assert.equal(readFileSync(join(out, 'data/.dev-secret'), 'utf8'), 'secreto', 'data intacta');
  assert.equal(JSON.parse(readFileSync(join(out, 'version.json'), 'utf8')).build, v.build + 1);
});

test('instalador: el script de Inno Setup y el flujo de GitHub Actions apuntan a lo que existe', () => {
  const iss = readFileSync(join(ROOT, 'installer/MysteryAction.iss'), 'utf8');
  assert.ok(iss.charCodeAt(0) === 0xfeff, 'UTF-8 con BOM (Inno Setup lee bien «Pokémon»)');
  assert.match(iss, /PrivilegesRequired=lowest/); assert.match(iss, /DefaultDirName=\{localappdata\}/);
  assert.match(iss, /Source: "\.\.\\build\\win\\app\\\*"/); assert.match(iss, /SetupIconFile=icon\.ico/);
  assert.match(iss, /Filename: "\{app\}\\Jugar\.bat"/); assert.match(iss, /DelTree\(ExpandConstant\('\{app\}\\data'\)/);
  assert.ok(!/Name: "\{app\}\\data"/.test(iss), 'data no se borra sin preguntar');
  assert.ok(existsSync(join(ROOT, 'installer/icon.ico')));
  const wf = readFileSync(join(ROOT, '.github/workflows/windows-installer.yml'), 'utf8');
  for (const s of ['tools/stage-windows.mjs', 'installer\\MysteryAction.iss', 'tools/release-notes.mjs', 'MysteryAction-Setup.exe', 'contents: write', "paths: ['version.json'"]) assert.ok(wf.includes(s), s);
});
