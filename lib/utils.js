/*!
 * Generate unique ids
 */
exports.createUid = (function () {
	var uid = 0;
	return function createUid () {
		return ++uid;
	}
}());
