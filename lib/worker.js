/**
 * Module Dependencies
 */

var childProcess = require('child_process')
  , EventEmitter = require('events').EventEmitter
  , utils        = require('./utils');

/** 
 * Worker Constructor
 *
 * @param {Object} options
 * @param {String} options.path Path worker script
 * @param {Object|Array|String|Number|Boolean} [options.data]
 * @param {Function} [options.exit] Invoked when worker is completed
 * @param {Function} [options.error] Invoked when worker has an error
 * @param {Function} [options.message] Invoked when worker sends message to main process
 * @param {Array<String>} [options.arguments] Arugments to pass to the worker
 * @param {Object} [options.options] any valid options for `child_process.fork`
 */

var Worker = module.exports = function Worker (options) {
	EventEmitter.call(this);

	var self = this;
	if (typeof options.path !== 'string') {
		throw new TypeError('Path must be of String type');
	}
	if (options.args && !Array.isArray(options.args)) {
		throw new TypeError('Args must be of Array<String> type.');
	}

	var _opt;
	['exit', 'error', 'message'].forEach(function (opt) {
		_opt = options[opt];
		if (_opt) {
			if (typeof _opt !== 'function') {
				throw new TypeError(opt + ' must be of Function type');
			}
			// listen
			self.on(opt, _opt);
		}
	});

	// fork settings
	self._settings = {
		path: options.path,
		data: (options.data),
		args: (options.args || []),
		options: (options.options || {})
	};

	/**
	 * Private
	 */
	var _uid = utils.createUid();
	self.uid = function(){return _uid;};

	return self;
};

/**
 * Inherit from EventEmitter.prototype
 */

Worker.prototype = Object.create(EventEmitter.prototype);
Worker.prototype.constructor = Worker;

/**
 * Set the pool for the worker
 *
 * @return {Worker} this
 * @api public
 */

Worker.prototype.setPool = function (pool) {
	this.pool = pool;
	return this;
};

/**
 * Start the child process, and set up event handlers
 * This will throw an error if no pool has been set
 * 
 * @api public
 * @return {Worker} this
 */

Worker.prototype.createChildProc = function () {
		var self = this
		  , data = self._settings.data
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
	
	// check data
	if (typeof data !== 'undefined') {
		child.send(data);
	}

	// linking
	child._uid = self.uid();
	self._pid  = child.pid;

	/**
	 * Error Event
	 */
	child.on('error', function onError (err) {
		// Need to gaurd against re-emitting an event to the pool,
		// this event will only get emitted on failed message, failed spawn, or failed kill
		console.log('error from child');
		child.__error__ = true;

		self.pool.emit('worker:error', {
			worker: self,
			error: err
		});

		// emit internal after pool
		self.emit('error', err, self, child);
	});

	/**
	 * Exit Event
	 */
	child.on('exit', function onExit (code, signal) {
		var error;

		if (!child.__error__) {
			// for further verification incase
			// Worker gets losts
			child.__exit__ = true;
			if (code === 0) {
				self.pool.emit('worker:complete', {
					worker: self,
					code: code,
					signal: signal
				});
			} else {
				error = self._workerError(code, signal);
				self.pool.emit('worker:error', {
					worker: self,
					error: error 
				});
				self.emit('error', error, self, child);
			}
			// emit internal exit event after emitting to pool 
			self.emit('exit', self, child, code, signal);
		}
	});

	/**
	 * Message Event
	 */
	child.on('message', function onMessage (message) {
		self.emit('message', message, self, child);
	});

	return self;
};

/**
 * Verify the child process
 *
 * @return {Boolean}
 * @api public
 */

Worker.prototype.verifyChild = function () {
	return (this._child 
		&& this._child.pid === this._pid
		&& this.child_uid === this.uid());
};

/**
 * Kill a process. The `teminated` event is emitted after the child process is killed.
 *
 * @param {String} [signal = 'SIGTERM'] kill signal
 * @return {Worker} this
 * @api public
 */

Worker.prototype.destroy =
Worker.prototype.kill = function (signal, next) {
	signal = (signal || 'SIGTERM');
	var child = this._child
	  , self  = this
	  , killProc = function () {
	  	child.kill(signal);
	  	self.emit('terminated');
	  };

	if (self.verifyChild && (!self.isKilled() || !self.isExited())) {

		if (child.connected) {
			child.once('disconnect', function () {
				killProc();
			});
			child.disconnect();
		} else {
			killProc();
		}

	}

	return this;
};

/**
 * Determine if a workers child process has been killed
 *
 * @return {Boolean}
 * @api public
 */

Worker.prototype.isKilled = function () {
	return (this._child && this._child.killed);
};

/**
 * Detirmine if a workers child process has exited
 *
 * @return {Boolean}
 * @api public
 */

Worker.prototype.isExited = function () {
	return (this._child && this._child.__exit__);
};

/**
 * Get or set the data initialy sent to worker's process 
 *
 * @param {Object|Array|Number|String|Boolean} [data] Data if setting
 * @return {Worker | Object|Array|Number|String|Boolean}
 * @api public
 */

Worker.prototype.data = function (data) {
	if (typeof data === 'undefined')	 {
		return this._settings.data;
	}
	this._settings.data = data;
	return this;
};

/**
 * Send additional data after worker is intiated
 *
 * @param data {Object|Array|String|Number|Boolean}
 * @return {Worker} this 
 * @api public
 */

Worker.prototype.send = function (data) {
	if (this.verifyChild() && !this.isKilled()) {
		this._child.send(data);
	} else if (typeof this._settings.data !== 'undefined') {
		this._settings.data = data;
	}
	return this;
};

/**
 * Create An ExitCode Error 
 *
 * @return {Error}
 * @api private 
 */

Worker.prototype._workerError = function (code, signal) {
	// exit codes from (https://github.com/joyent/node/blob/master/doc/api/process.markdown#exit-codes)
	var err = new Error(({
		1: 'Uncaught Fatal Exception',
		3: 'Parse Error',
		4: 'Evaluation Failure',
		5: 'Fatal Error',
		6: 'Non-function Internal Exception Handler',
		7: 'Exception Handler Run-Time Failure',
		8: 'Uncaught Exception',
		9: 'Invalid Argument',
		10: 'Run-Time failure',
		12: 'Invalid Debug Argument',
		128: 'Fatal Signal'
	}[code] || 'Unknown Error') + ' File: ' + this._settings.path);
	
	err.name = 'Worker Error';
	err.fileName = this._settings.path;
	return err;
};