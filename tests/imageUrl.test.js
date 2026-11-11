import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeWebImageUrl } from '../src/lib/utils/imageUrl.js';

const driveFileId = '1x1BWGXvjpA9ZPnTSIdxXfm8RbL5SNOyr';
const directDriveImageUrl = `https://drive.google.com/uc?export=view&id=${driveFileId}`;

test('converts Google Drive share links to a direct image URL', () => {
	assert.equal(
		normalizeWebImageUrl(`https://drive.google.com/file/d/${driveFileId}/view?usp=sharing`),
		directDriveImageUrl
	);
	assert.equal(
		normalizeWebImageUrl(`https://drive.google.com/open?id=${driveFileId}`),
		directDriveImageUrl
	);
	assert.equal(
		normalizeWebImageUrl(`https://drive.google.com/uc?export=download&id=${driveFileId}`),
		directDriveImageUrl
	);
});

test('keeps ordinary image URLs and rejects non-web protocols', () => {
	assert.equal(normalizeWebImageUrl('https://example.com/image.jpg'), 'https://example.com/image.jpg');
	assert.equal(normalizeWebImageUrl('javascript:alert(1)'), '');
});
