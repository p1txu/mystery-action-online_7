/** Notas de la versión para la página de Releases de GitHub (las usa .github/workflows/windows-installer.yml). */
import { readFileSync, writeFileSync } from 'node:fs';
const v = JSON.parse(readFileSync(new URL('../version.json', import.meta.url), 'utf8'));
const out = process.argv[2] || 'notes.md';
writeFileSync(out, `## Novedades de la versión ${v.version}\n\n${(v.notes || []).map(n => '- ' + n).join('\n')}\n
## Instalar en Windows
1. Descarga **MysteryAction-Setup.exe** (aquí abajo, en «Assets») y ábrelo.
2. Si Windows avisa («Windows protegió su PC»), pulsa **Más información → Ejecutar de todas formas** (el instalador no va firmado).
3. Siguiente → Instalar. Abre el juego con el acceso directo «Pokémon Mystery Action».

Si ya lo tienes instalado no hace falta: el juego se actualiza solo al abrirse. Tus cuentas y partidas (carpeta data) no se tocan.
`);
console.log('[OK] ' + out);
