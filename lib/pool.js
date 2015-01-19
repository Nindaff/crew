/*!
 * Module Dependencies
 */
var childProcess = require('child_process')
  , os           = require('os')
  , EventEmitter = require('events').EventEmitter
  , Task         = require('./task');

/*!
 * Constants
 */
var MAX_PROCS = os.cpus().length;

/*!
 * Helper
 */
function getMaxProcs (maxProcsArg) {
	if (maxProcsArg && typeof maxProcsArg === 'number') {
		return (maxProcsArgs > MAX_PROCS) 
			? MAX_PROCS
			: maxProcsArg;
	}
	return MAX_PROCS;
}

/*!
 * Expose
 */
var Pool = module.exports = function Pool (options) {
	var options = (options || {});
	this._queue = [];
	this._completed = [];
	this._pool = [];
	this._drainActivated = false;
	EventEmitter.call(this);
	
	/*!
	 * Private
	 */
	var _maxProcs = getMaxProcs(options.maxProcs);
	// getter
	this.maxProcs = function () {
		return _maxProcs;
	};

	// init
	this.init();
};

/*!
 * Inherit EventEmitter
 */
Pool.prototype.__proto__ = EventEmitter.prototype;

/*!
 * Set up event handlers and initial pooling
 * @events:
 *  - [task_error]    : emitted when a task's child emit's `error`
 *  - [task_complete] : emitted when a task's child emit's `exit` 
 *  - [empty]         : emitted when a `_queue` is empty
 *  - [pool_vacancy]  : emitted when the pool can accept more process's
 *  - [queued]        : emitted when a task is pushed to the queue
 *  - [pool_empty]    : emitted when no tasks are in the pool
 */
Pool.prototype.init = function () {
	var self = this;

	// task error event handler
	// kill the child process
	// and remove it from the pool
	self.on('task_error', function taskErrorFn (data) {
		var task  = data.task
		  , child = data.child 
		  , err   = data.error;

		if (task.verifyChild(child)) {
			child.kill('SIGHUP');
			self._pushTaskToCompleted(task);
		}
	});

	// task complete event handler
	// verify that child is from the task
	self.on('task_complete', function onTaskComplete (data) {
		var child = data.child
		  , task  = data.task
		  , code  = data.code;

		if (task.verifyChild(child)) {
			self._pushTaskToCompleted(task);
		}
	});

	// handle vacancy in pool or task pushed to the queue
	// check that `drain` is not actiavted
	// if pool is empty and `drain` is activate
	// deactivate `drain` and call `_runTask`
	self.on('attempt_run', function onAttemptRun () {
		if (!self._drainActivated) {
			self._fillPool();
		}

		if (self.poolEmpty() && self._drainActivated) {
			self._drainActivated = false;
			self._fillPool();
		}
	});

};

/*!
 * Add a task to the queue
 * 
 * @param options {Object}
 * @param options.path {String} : path to js module
 * @param options.args {Array}  : string arguments for module
 * @param options.data {Object} : data to send to the process
 * @param options.error {Function} : do something with error
 * @param options.success {Function} : do something when successfully completed
 * @param options.options {Object} : any options for the child_process.fork `options` arguments, @see the nodejs.org docs
 * @api public
 */
Pool.prototype.queue = function (options) {
	var task = new Task(this, options);
	this._queue.push(task);
	this.emit('attempt_run');
};

/*!
 * Blocks any task from being run until `_pool` is empty
 * @api public
 */
Pool.prototype.drain = function () {
	this._drainActivated = true;
};


/*!
 * moves first task in `_queue` to `_pool` array
 * calls the _run method on task if queue is not empty
 * @api private
 */
Pool.prototype._runTask = function () {
	if (!this.queueEmpty()) {
		var task = this._queue.shift();
		if (task instanceof Task) {
			this._pool.push(task);
			task.createChildProc();
		}
	}
};

/*!
 * Move task to complete array,
 * after successful or failed completion of child process
 * @param task {Task} : task to be verified for completion
 * @api private
 */
Pool.prototype._pushTaskToCompleted = function (task) {
	var index = this._pool.indexOf(task);
	if (~index !== 0) {
		this._completed.push(this._pool.splice(index, 1));
		return this.emit('attempt_run');
	} 
};

/*!
 * Fill the pool while pool isnt at max procs
 * and queue is not empty
 * @api private
 */
Pool.prototype._fillPool = function () {
	while (!this.poolFull() && !this.queueEmpty()) {
		this._runTask();
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
 * Check how many active tasks are running
 * @return {Number}
 * @api public
 */
Pool.prototype.active = function () {
	return this._pool.length;
};