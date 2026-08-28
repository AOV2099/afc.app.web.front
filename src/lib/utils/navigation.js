function normalizeNavigationPath(path) {
	const normalizedPath = path.replace(/\/+$/, '');
	return normalizedPath || '/';
}

export function isNavigationPathExact(currentPath, itemPath) {
	if (typeof currentPath !== 'string' || typeof itemPath !== 'string') return false;

	return normalizeNavigationPath(currentPath) === normalizeNavigationPath(itemPath);
}

export function isNavigationPathActive(currentPath, itemPath) {
	if (isNavigationPathExact(currentPath, itemPath)) return true;
	if (typeof currentPath !== 'string' || typeof itemPath !== 'string') return false;

	const normalizedCurrentPath = normalizeNavigationPath(currentPath);
	const normalizedItemPath = normalizeNavigationPath(itemPath);

	return normalizedItemPath !== '/' && normalizedCurrentPath.startsWith(`${normalizedItemPath}/`);
}