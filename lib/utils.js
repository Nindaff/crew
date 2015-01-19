/*!
 * Utils
 */

/*!
 * Generate unique ids
 */
exports.createUid = (function () {
	var uid = 0;
	return function createUid () {
		return ++uid;
	}
}());

/*!
 * Type error
 */
exports.typeErr = function (msg) {
	throw new TypeErr(msg);
};