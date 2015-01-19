var Pool = require('../lib/pool');
var os   = require('os');
var assert = require('assert');

var cpus = os.cpus().length;
var pool = new Pool()
  , i = 50;

// set up some test vars
var communication_test = true;
var delegation_test = true;
var execution_test = true;

console.log('\n\n\n')
console.log('Starting test on Pool.js');
console.log('- Delegation Test       - pool should not delegate more workers than cpus');
console.log('- Communication Test    - workers should pass/recieve data to/from task queue\'s');
console.log('- Worker Execution Test - workers should execute without errors');
console.log('\n');
console.log('Testing for 50 workers');
console.log('\n');

while (i--) {
	var send = i;
	pool.queue({
		path: './child',
		data: send,
		message: function (msg, child, task) {
			if (msg !== task._childSettings.data) {
				communication_test = false;
				console.log('Worker: ' + msg + ' failed to communcate');
			}

			// if msg is 1, then this is the last worker
			// conclude all tests
			if (msg === 1) {
				if (communication_test) {
					console.log('- Communication Test - passing');
				} else {
					console.log('- Communication Test - failing');
				}

				if (delegation_test) {
					console.log('- Delegation Test    - passing');
				} else {
					console.log('- Delegation Test    - failing');
				}

				if (execution_test) {
					console.log('- Execution Test     - passing');
				} else {
					console.log('- Execution Test     - failing');
				}

				if (communication_test && delegation_test && execution_test) {
					console.log('** All tests passing **');
				} else {
					console.log('** One or more tests failed **');
				}
				console.log('\n');
				process.exit(0);
			}
		},
		error: function (err, child, task) {
			execution_test = false;
		}
	});
}

pool.on('attempt_run', function () {
	if (pool.active() > cpus) {
		workers_equal_cpus = false;
	}
});