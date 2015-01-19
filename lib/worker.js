/*!
 * Module Dependencies
 */
var childProcess = require('child_process')
  , utils        = require('./utils');

/*!
 * Worker
 * @param options {Object}
 * - path {String} path to worker file
 * - data {Any} data to send to the worker
 * - success {Function} invoked when worker executed successfully
 * - error {Function} invoked when worker has an error
 * - message {Function} invoked when worker sends data to master process
 * - args {Array<String>} arguments to pass to the worker
 * - options {Object} any valid options for `child_process.fork` 
 */
var Worker = module.exports = function Worker (options) {
	var self = this;
	if (typeof options.path !== 'string') {
		throw new TypeError('Path must be of String type');
	}
	if (options.args && !Array.isArray(options.args)) {
		throw new TypeError('Args must be of Array<String> type.');
	}

	var _opt;
	['success', 'error', 'message'].forEach(function (opt) {
		_opt = options[opt];
		if (_opt) {
			if (typeof _opt !== 'function') {
				throw new TypeError(opt + ' must be of Function type');
			}
			self[opt] = _opt;
		}
	});

	// fork settings
	self._settings = {
		path: options.path,
		data: (options.data || null),
		args: (options.args || []),
		options: (options.options || {})
	};

	/*!
	 * Private
	 */
	var _uid = utils.createUid();
	self.uid = function(){return _uid;};

	return self;
};

Worker.prototype.constructor = Worker;

/*! 
 * Add success handler
 * @param fn {Function} (worker, child)
 * @api public
 */
Worker.prototype.onSuccess = function (fn) {
	if (typeof fn !== 'function') {
		throw new TypeError('Success handler must be of Function type');
	}
	this.success = fn;
	return this;
};

/*!
 * Add error handler
 * @param fn {Function} (error, worker, child)
 * @api public
 */
Worker.prototype.onError = function (fn) {
	if (typeof fn !== 'function') {
		throw new TypeError('Error handler must be of Function type');
	}
	this.error = fn;
	return this;
};

/*!
 * Add message handler
 * @param fn {Function} (data, worker, child)
 * @api public
 */
Worker.prototype.onMessage = function (fn) {
	if (typeof fn !== 'function') {
		throw new TypeError('Message handler must be of function type');
	}
	this.message = fn;
	return this;
};

/*!
 * Set the pool for the worker
 * @api public
 */
Worker.prototype.setPool = function (pool) {
	this.pool = pool;
};

/*!
 * Start the child process 
 * will throw an error if no pool has been set 
 */
Worker.prototype.createChildProc = function () {
		var self = this
	  , child;

	if (typeof self.pool === 'undefined') {
		throw new Error('Child process cannot be initiated without a pool!');
	}

	// create fork
	child = self._child = childProcess.fork(
		self._settings.path,
		self._settings.args,
		self._settings.options
	);
	if (self._settings.data) {
		child.send(self._settings.data);
	}

	// linking
	child._uid = self.uid();
	self._pid  = child.pid;

	/*!
	 * Event Handlers
	 */
	child.on('error', function onError (err) {
		child._errorEvent = true;
		if (self.error) {
			self.error(err, self, child);
		}

		// emit to pool
		self.pool.emit('worker_error', {
			worker: self,
			error: err
		});
	});

	child.on('exit', function onExit (code, signal) {
		if (code === 0 && self.success) {
			self.success(self, child);
		}

		// emit to pool
		self.pool.emit('worker_complete', {
			worker: self,
			code: code,
			signal: signal
		});
	});

	child.on('message', function onMessage (message) {
		if (self.message) {
			self.message(message, self, child);
		}
	});

};

/*!
 * Verify the child process
 * @param child {ChildProcess}
 * @api public
 */
Worker.prototype.verifyChild = function (child) {
	return (child 
			&& child._uid === this.uid()
			&& child.pid === this._pid);
};

/*!
 * Kill a process
 * @param signal {String} kill signal (optional)
 * @api public
 */
Worker.prototype.destroy =
Worker.prototype.kill = function (signal) {
	signal = (signal || 'SIGTERM');
	var child = this._child;
	if (child.connected) {
		child.once('disconnect', function () {
			child.kill(signal);
		});
		child.disconnect();
		return;
	}
	
	child.kill(signal);
};

/*!
 * determine if a workers child process has been killed
 * @return {Boolean}
 * @api public
 */
Worker.prototype.isKilled = function () {
	return (this._child && this._child.killed);
};