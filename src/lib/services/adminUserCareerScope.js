export function positiveCareerId(value) {
	if (value === null || value === undefined || String(value).trim() === '') return null;
	const text = String(value).trim();
	if (!/^\d+$/u.test(text)) return null;
	const parsed = Number(text);
	return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export function getAdminCareerScope(currentUser) {
	const isAdmin = String(currentUser?.role || '').toLowerCase() === 'admin';
	const careerId = positiveCareerId(currentUser?.career_id ?? currentUser?.career?.id);
	return {
		careerId,
		isAdmin,
		isGlobalAdmin: isAdmin && careerId === 1,
		isScopedAdmin: isAdmin && careerId !== null && careerId > 1,
		hasCareerAdminAccess: isAdmin && careerId !== null
	};
}

export function normalizeAdminStudentId(value) {
	return String(value || '').slice(0, 10);
}

export function isManualHoursEligibleUser(user) {
	return /^\d{8,10}$/u.test(String(user?.student_id || '').trim());
}

export function buildManualHoursAdjustmentPayload({ hours, category, motive, requestId }) {
	return {
		hours: String(hours ?? '').trim(),
		category: String(category || '').trim(),
		motive: String(motive || '').trim(),
		requestId: String(requestId || '').trim()
	};
}

export function buildAdminUserCreatePayload(form, { isGlobalAdmin, currentCareerId }) {
	const scopedCareerId = positiveCareerId(currentCareerId);
	const selectedCareerId = positiveCareerId(form?.careerId);
	return {
		email: String(form?.email || '').trim(),
		password: form?.password || '',
		firstName: String(form?.firstName || '').trim(),
		lastName: String(form?.lastName || '').trim(),
		studentId: normalizeAdminStudentId(form?.studentId).trim() || undefined,
		career_id: isGlobalAdmin ? (selectedCareerId ?? undefined) : (scopedCareerId ?? undefined),
		status: form?.status,
		role: form?.role
	};
}

function selectedCareerId(user) {
	const value = user?.career_id ?? user?.career?.id;
	return value === null || value === undefined || value === '' ? '' : String(value);
}

export function buildAdminUserEditPayload({ form, selectedUser, isGlobalAdmin }) {
	const payload = {};
	if (!selectedUser) return payload;

	const email = String(form?.email || '').trim();
	const firstName = String(form?.firstName || '').trim();
	const lastName = String(form?.lastName || '').trim();
	const studentId = normalizeAdminStudentId(form?.studentId).trim();
	if (email !== (selectedUser.email || '')) payload.email = email;
	if (firstName !== (selectedUser.first_name || '')) payload.firstName = firstName;
	if (lastName !== (selectedUser.last_name || '')) payload.lastName = lastName;
	if (studentId !== normalizeAdminStudentId(selectedUser.student_id).trim()) payload.studentId = studentId;

	if (isGlobalAdmin && String(form?.careerId ?? '') !== selectedCareerId(selectedUser)) {
		payload.career_id = form?.careerId ? Number(form.careerId) : null;
	}
	if (form?.status !== (selectedUser.status || 'active')) payload.status = form.status;
	if (form?.role !== (selectedUser.role || 'student')) payload.role = form.role;

	return payload;
}
