/*!
 * Module Dependencies
 */
var EventEmitter = require('events').EventEmitter
  , Worker       = require('./worker')
  , extend       = require('util')._extend;

/*!
 * Constants
 */
var MAX_PROCS = require('os').cpus().length;


/*!
 * Pool
 * Manage workers in a queue
 * @param options {Object}
 * - maxProcs {Number} max process's to be run at a time (number or processing cores)
 * - dieOnError {Boolean} (False)
 * - cache {Boolean} (true) // cache workers that have completed successfully or not 
 */
var Pool = module.exports = function Pool (options) {
	EventEmitter.call(this);

	this._queue = [];
	this._completed = [];
	this._pool = [];
	this._errors = [];
	this._drainActivated = false;
	this._die = false;
	this._settings = extend({
		maxProcs: MAX_PROCS,
		dieOnError: false,
		cache: true
	}, (options || {}));
	
	// quick getters for maxProcs, and cache settings
	this.maxProcs = function(){return this._settings.maxProcs;};
	this.caching = function(){return this._settings.cache;};
	// init
	this.init();
};

/*!
 * Inherit from EventEmitter
 */
Pool.prototype.__proto__ = EventEmitter.prototype;
Pool.prototype.constructor = Pool;

/*!
 * Set up event handlers and initial pooling
 * @events:
 * - `worker_error` : emitted when workers child has an error
 * - `worker_complete` : emitted when workers child is completed
 * - `attempt_run` : emitted when worker is pushed to the queue, or worker is pushed to complete stage
 * - `die` : emitted when the die on error setting is true, and worker emits an error
 * - `worker_lost` : emitted when a worker can't be found in the pool
 */
Pool.prototype.init = function () {
	var self = this;

	// task error event handler
	// kill the child process
	// and remove it from the pool
	self.on('worker_error', function onWorerError (data) {
		var worker = data.worker 
		  , err    = data.error;

		worker.kill(err);
		self._workerError(worker);
	});

	// task complete event handler
	self.on('worker_complete', function onWorkerComplete (data) {
		var worker = data.worker 
		  , code   = data.code;

		self._workerCompleted(worker, code);
	});

	// handle vacancy in pool or task pushed to the queue
	// check that `drain` is not actiavted
	// if pool is empty and `drain` is activate
	// deactivate `drain` and call `_runTask`
	self.on('attempt_run', function onAttemptRun () {
		// check if in die mode
		if (!self._die) {
			if (!self._drainActivated) {
				self._fillPool();
			}

			if (self.poolEmpty() && self._drainActivated) {
				self._drainActivated = false;
				self._fillPool();
			}
		}
	});

	// for now activate drain, and kill lost worker
	self.on('worker_lost', function onWorkerLost (worker) {
		self.drain();
		if (worker instanceof Worker && !worker.isKilled()) {
			worker.kill();
		}
	});

	self.on('die', function onDie () {
		process.exit(1);
	});

};

/*!
 * Add a worker to the queue
 * @param options {Worker/Object} : either an instance of Worker, or options for Worker constructor
 * @see ./worker.js
 * @api public
 */
Pool.prototype.addWorker = function (options) {
	var worker;
	if (options instanceof Worker) {
		worker = options;
	} else {
		worker = new Worker(options);
	}
	worker.setPool(this);
	this._queue.push(worker);
	this.emit('attempt_run');
};

/*!
 * Block workers from being run until pool is empty
 * @api public
 */
Pool.prototype.drain = function () {
	this._drainActivated = true;
};


/*!
 * Start a worker
 * Moves worker from `_queue` to `_pool` and calls `createChildProc` on worker instance
 * @see ./worker.js
 * @api private
 */
Pool.prototype._runWorker = function () {
	if (!this.queueEmpty()) {
		var worker = this._queue.shift();
		if (worker instanceof Worker) {
			this._pool.push(worker);
			worker.createChildProc();
		}
	}
};

/*!
 * Remove a worker from the pool
 * @api private
 */
Pool.prototype._removeWorker = function (worker) {
	var index = this._pool.indexOf(worker);
	if (!!~index) {
		return this._pool.splice(index, 1);
	}
	return false;
};

/*!
 * Cache worker and exit code to complete array or destroy instance
 * after successful or failed completion of child process
 * @param _worker {Worker} : worker instance that emitted `exit`
 * @param code {Number} : exit code for worker
 * @api private
 */
Pool.prototype._workerCompleted = function (_worker, code) {
	var worker = this._removeWorker(_worker);
	if (worker) {
		if (this.caching()) {
			this._completed.push({
				worker: worker,
				code: code
			});
		} else {
			worker = null;
		}
		return this.emit('attempt_run');
	}
	this.emit('worker_lost', _worker);
};

/*!
 * Cache a worker and error to error array or destroy instance
 * after worker emits error
 * @param _worker {Worker} 
 * @param err {Error}
 * @api private
 */
Pool.prototype._workerError = function (_worker, err) {
	var worker = this._removeWorker(_worker);
	if (worker) {
		if (!this._caching()) {
			this._errors.push({
				worker: worker,
				error: err
			});
		} else {
			worker = null;
		}

		if (this._settings.dieOnEror) {
			return this._killAll();
		}
		return this.emit('attempt_run');
	}
	this.emit('worker_lost', _worker);
};

/*!
 * kill all workers in the pool
 * @api private
 */
Pool.prototype._killAll = function () {
	// set die to true so that no new workers get started
	this._die = true;
	this._pool.forEach(function (worker) {
		worker.kill();
	});
	this.emit('die');
};

/*!
 * Fill the pool intil maxed or no more workers in queue
 * @api private
 */
Pool.prototype._fillPool = function () {
	while (!this.poolFull() && !this.queueEmpty()) {
		this._runWorker();
	}
};

/*!
 * Check if pool is empty
 * @return {Boolean}
 * @api public
 */
Pool.prototype.poolEmpty = function () {
	return !this._pool.length;
};

/*!
 * Check if the pool is full
 * @return {Boolean}
 * @api public
 */
Pool.prototype.poolFull = function () {
	return this._pool.length >= this.maxProcs();
};

/*!
 * Check if queue is empty
 * @return {Boolean}
 * @api public
 */
Pool.prototype.queueEmpty = function () {
	return !this._queue.length;
};

/*!
 * Check how many active workers are running
 * @return {Number}
 * @api public
 */
Pool.prototype.active = function () {
	return this._pool.length;
};