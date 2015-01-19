/*!
 * Module Dependencies
 */
var childProcess = require('child_process')
  , extend       = require('util')._extend
  , utils        = require('./utils');


/*!
 * Expose
 */
var Task = module.exports = function Task (pool, options) {
	// type Checking
	if (typeof options.path !== 'string') {
		utils.typeErr('Path argument must be of String type');
	}
	if (options.args && !Array.isArray(options.args)) {
		utils.typeErr('Args must be of Array<String> type');
	}

	// sucess, message, and error must all be of function type
	['success', 'message', 'error'].forEach(function (opt) {
		if (options[opt] && typeof options[opt] !== 'function') {
			return utils.typeErr(opt + ' must be of Function type');
		}
	});

	this._pool = pool;
	this._childSettings = extend({
		args: [],
		options: {}
	}, options);

	/*!
	 * Private
	 */
	var _uid = utils.createUid();
	// getter
	this.uid = function (){return _uid;};

};


/*!
 * creates the child process and sets up event handlers
 * to be emitted to the pool on `error` and `exit`
 * @api private
 */
Task.prototype.createChildProc = function () {
	var self      = this
		, data      = self._childSettings.data
	  , child;

	// create the child process
	child = self._childProc = childProcess.fork(
		self._childSettings.path,
		self._childSettings.args,
		self._childSettings.options
	);

	// link for verification
	child._uid = self.uid();
	self._pid  = child.pid;

	if (data) {
		child.send(data);
	}

	// event handlers
	// emit child errors and exit events
	// on the pool
	child.on('error', function onError (err) {
		if (self._childSettings.error) {
			self._childSettings.error(err, child, self);
		}
		// emit to pool
		self._pool.emit('task_complete', {
			task: self,
			child: child,
			error: err
		});
	});

	child.on('exit', function onExit (code, signal) {
		if (code === 0 && self._childSettings.success) {
			self._childSettings.success(child, self);
		}
		// emit to pool
		self._pool.emit('task_complete', {
			task: self,
			child: child,
			code: code,
			signal: signal
		});
	});

	// message event handler
	child.on('message', function onMessage (message) {
		if (self._childSettings.message) {
			self._childSettings.message(message, child, self);
		}
	});

};

/*!
 * Verify that the child is the same on that was linked
 * to this task instance, the process id could have be
 * linked to another process, so check uid and pid
 * @return {Boolean}
 * @api private
 */
Task.prototype.verifyChild = function (child) {
	if (!child) return false;
	return (child.pid && child.pid === this._pid &&
			child._uid && child._uid === this.uid());
};