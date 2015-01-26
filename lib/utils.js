/**
 * Generate unique ids
 */
exports.createUid = (function () {
	var uid = 0;
	return function createUid () {
		return ++uid;
	}
}());

/**
 * Write a red string to the terminal
 */
exports.warn = function (str) {
	return console.log('\x1b[31;1m' + str + '\x1b[0m');
};

/**
 * Write a yellow string to the terminal
 */
exports.important = function (str) {
	return console.log('\x1b[38;1m' + str + '\x1b[0m');
};
