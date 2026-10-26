import { createEngineCore } from '../shared/engine-core.generated.js';
export const E = createEngineCore();
/** Partida inicial válida (lo mismo que crea «Nueva partida» en el prototipo). */
export const freshSave = (sp = 'voltrino', patch = {}) => Object.assign(E.Save.sanitize(E.Save.fresh(sp)).data, patch);
/** Generador pseudoaleatorio fijo para que las pruebas sean repetibles. */
export const seeded = (s = 7) => E.U.rng(s);
export const STEP = 1 / 120;
