/**
 * Mocha Test
 */
var crew = require('../')
  , assert = require('assert');

var pool = new crew.Pool()
  , workerCount = 50
  , CPUS = require('os').cpus().length;
console.log('CPUS: ', CPUS);
/**
 * Crew
 */
describe('Crew', function () {

	/**
	 * Delegation Test
	 */
	it('should not delegate more workers than CPUS unless configured to', function (done) {
		pool.once('run', function () {
			console.log('On run: ', pool.active());
			assert(pool.active() <= CPUS);
			done();
		});
	});

	/**
	 * Delegation Test 2
	 */
	it('should have active workers unless draining', function (done) {
		pool.once('worker:complete', function () {
			assert(pool.active() >= 0);
			done();
		});
	});


	/**
	 * 50 Workers
	 */
	while (workerCount--) {
		var worker = new crew.Worker({
			path: __dirname + '/child',
			data: workerCount
		});
		pool.addWorker(worker);

		/**
		 * Message Test
		 */
		it('should pass data from worker to child', function (done) {
			worker.on('message', function (message, worker, child) {
				assert.equal(message, worker.data());
				done();
			});
		});
	}

});