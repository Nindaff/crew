/**
 * Module Dependencies
 */

var EventEmitter = require('events').EventEmitter
  , Worker       = require('./worker')
  , extend       = require('util')._extend
  , utils        = require('./utils');

/**
 * Constants
 */

var MAX_PROCS = require('os').cpus().length;

/**
 * Pool, manage Workers on a queue. 
 *
 * @param options {Object}
 * @param {Number} [options.maxProcs = CPUS] Set the max amount of concurrent processes
 * @param {Boolean} [options.dieOnError = false] Kill main process on the event of a worker error
 * @param {Boolean} [options.dieOnEmpty = true] Kill main process when 
 */

var Pool = module.exports = function Pool (options) {
	EventEmitter.call(this);

	this._queue     = [];
	this._completed = [];
	this._pool      = [];
	this._errors    = [];
	this._drain = false;
	this._die   = false;

	this._settings = extend({
		maxProcs   : MAX_PROCS,
		dieOnError : true,
		dieOnEmpty : true,
		cache      : true
	}, (options || {}));

	// quick getters for maxProcs, and cache settings
	this.maxProcs = function(){return this._settings.maxProcs;};
	this.caching = function(){return this._settings.cache;};
	// init
	this.init();
};

/**
 * Inherit from EventEmitter
 */

Pool.prototype = Object.create(EventEmitter.prototype);
Pool.prototype.constructor = Pool;


/**
 * Initialize Pool instance
 * 
 * @event `worker:error`   
 * @event `worker:complete` 
 * @event `empty`
 * @api private          
 */

Pool.prototype.init = function () {
	var self = this;

	// Worker Error Handler
	self.on('worker:error', function onWorerError (data) {
		console.log('worker error');
		if (data && data.worker instanceof Worker) {
			// this should be avoided is most scenarios but in the case where 
			// other workers failing because the main process 
			// was terminated do to an uncaughtException is a more serious issue
			// than not, this shim should only catch Worker Errors and not mask other errors
			// in the main process
			if (!self._settings.dieOnError) {
				process.once('uncaughtException', function (err) {
					utils.warn(
						'Warning: Crew has been configured to not crash '
					+ 'on Worker Errors. This may yield unwanted results.'
					);
					utils.important((err.stack || err));
				});
			}

			data.worker
				.kill()
				.on('terminate', function () {
					self._workerError(data.worker, data.error);
				});
			
			self._checkEmpty();
		}
	});

	// Worker Complete Handler
	self.on('worker:complete', function onWorkerComplete (data) {
		if (data && data.worker instanceof Worker) {
			self._workerCompleted(data.worker, data.code);
			self._checkEmpty();
		}
	});

	// Empty Handler
	self.on('empty', function onEmpty () {
		// emit done to allow users to run any tasks before
		// killing the main process
		self.emit('done');
		if (self._settings.dieOnEmpty || self._die) {
			process.exit(0);
		}
	});

};

/**
 * Starts a worker's child process and moves Worker instanse
 * from the queue to the pool
 *
 * @see Worker#createChildProc
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

/**
 * Remove a worker from the pool if it exists
 * 
 * @return {Worker|Boolean} : if exists Worker instance, else false
 * @api private
 */

Pool.prototype._removeWorker = function (worker) {
	var index = this._pool.indexOf(worker);
	if (!!~index) {
		return this._pool.splice(index, 1)[0];
	}
	return false;
};

/**
 * Cache worker and exit code to complete array or destroy instance
 * after successful or failed completion of child process
 *
 * @param _worker {Worker} : worker instance that emitted `exit`
 * @param code {Number} : exit code for worker
 * @api private
 */

Pool.prototype._workerCompleted = function (_worker, code) {
	var worker = this._removeWorker(_worker)
	  , cacheObj;

	if (worker) {
		if (this.caching()) {
			cacheObj = this._createCacheObject(worker);
			cacheObj.code = code;
			this._completed.push(cacheObj);
		} else {
			worker = null;
		}
		return this._run();
	}

	return this._workerLost(_worker);
};

/**
 * Cache a worker into `_error` Array, or destroy instance or worker
 * when worker emits and error 
 *
 * @param _worker {Worker} 
 * @param err {Error}
 * @api private
 */

Pool.prototype._workerError = function (_worker, err) {
	var worker = this._removeWorker(_worker)
	  , cacheObj;

	if (worker) {
		if (this.caching()) {
			cacheObj = this._createCacheObject(worker);
			cacheObj.error = err;
			this._errors.push(cacheObj);
		} else {
			worker = null;
		}

		if (this._settings.dieOnError) {
			return this._die(err);
		}
		return this._run();
	}

	return this._workerLost(_worker);
};

/** 
 * Handle a lost worker, this would happend when a worker emits `worker:complete` or `worker:error`
 * to the Pool instance but the worker is no longer in the `_pool` array
 *
 * @param worker {Worker}
 * @api private
 */

Pool.prototype._workerLost = function (worker) {
	this.drain();
	if (worker instanceof Worker 
			&& (!worker.isKilled() || !worker.isExited())) {
		// nullify the worker after it emits the `terminated` event
		worker
			.kill()
			.on('terminated', function () {
				worker = null;
			});
	} else {
		worker = null;
	}

};

/**
 * Fill the pool intil maxed or no more workers in queue
 *
 * @api private
 */

Pool.prototype._fillPool = function () {
	while (!this.poolFull() && !this.queueEmpty()) {
		this._runWorker();
	}
};

/**
 * Check if the pool work load is done and the queue is empty
 *
 * emits `empty` 
 * @api private
 */

Pool.prototype._checkEmpty = function () {
	if (this.poolEmpty() && this.queueEmpty()) {
		this.emit('empty');
	}
};

/** 
 * Run, determines wether to fill the pool
 *
 * @emits `run`
 * @api private
 */

Pool.prototype._run = function () {
	var self = this;
	// check if instance is in die mode
	if (!this._die) {
		if (!this._drain) {
			this._fillPool();
		}
		// if the pool is empty and instance is in drain mode
		// its likely the end of the drain
		if (this.poolEmpty() && this._drain) {
			this._drain = false;
			this._fillPool();
		}

		return this.emit('run');
	}
};

/**
 * Create Cache object, just the pid, uid, and path, nullify worker instance
 *
 * @param worker {Worker}
 * @api private
 */

Pool.prototype._createCacheObject = function (worker) {
	var ret = {
		pid: worker._pid,
		uid: worker.uid(),
		path: worker._settings.path
	};
	worker = null;
	return ret;
};

/** 
 * Die, this will set the `_die` property for the instance to true so that
 * once the drain ends the process will exit
 *
 * @param err {Error}
 * @api private
 */

Pool.prototype._die = function (err) {
	if (!this._die) {
		this._die = true;
		this.drain();
		if (err && err.stack) {
			console.log(err.stack);
		}
	}
};

/**
 * Create and/or add a worker to the queue, this method can take a Worker instance as an argument
 *
 * @param options {Worker|Object} : either an instance of Worker, or options for Worker constructor
 * @see Worker (Constructor)
 * @return {Worker}
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
	this._run();
	return worker;
};

/**
 * Check if pool is empty
 *
 * @return {Boolean}
 * @api public
 */

Pool.prototype.poolEmpty = function () {
	return !this._pool.length;
};

/**
 * Check if the pool is full
 *
 * @return {Boolean}
 * @api public
 */

Pool.prototype.poolFull = function () {
	return this._pool.length >= this.maxProcs();
};

/**
 * Check if queue is empty
 *
 * @return {Boolean}
 * @api public
 */

Pool.prototype.queueEmpty = function () {
	return !this._queue.length;
};

/**
 * Check how many active workers are running
 *
 * @return {Number}
 * @api public
 */

Pool.prototype.active = function () {
	return this._pool.length;
};

/**
 * Block workers from being run until pool is empty
 *
 * @api public
 */

Pool.prototype.drain = function () {
	if (!this._drain) {
		this._drain = true;
	}
};

/**
 * Dump the Cache in object format
 *
 * @return {Object} 
 * @return.completed {Array} : uid, pid, path
 * @return.error {Array} : uid, pid, path
 * @api public
 */

Pool.prototype.getCache = function () {
	return {
		completed: this._completed,
		error: this._errors
	};
};