import test from 'node:test';
import assert from 'node:assert/strict';

import { extractConstanciaCode } from '../src/lib/services/constanciaCode.js';

test('extractConstanciaCode reads the folio from plain or embedded QR text', () => {
	assert.equal(extractConstanciaCode('AFC-H049-E41G-4YVC'), 'AFC-H049-E41G-4YVC');
	assert.equal(extractConstanciaCode('  afc-h049-e41g-4yvc '), 'AFC-H049-E41G-4YVC');
	assert.equal(
		extractConstanciaCode('https://afc.ecosistemadigital.aragon.unam.mx/verificar/AFC-H049-E41G-4YVC'),
		'AFC-H049-E41G-4YVC'
	);
});

test('extractConstanciaCode ignores event tickets and malformed folios', () => {
	assert.equal(extractConstanciaCode('TCK-8F2A91'), null);
	assert.equal(extractConstanciaCode('AFC-H049-E41G'), null);
	assert.equal(extractConstanciaCode('AFC-IIII-LLLL-OOOO'), null);
	assert.equal(extractConstanciaCode(null), null);
});
