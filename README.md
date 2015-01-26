# Crew 
Manage workers on a queue.
* <h3>crew.Pool([options])</h3>
	* maxProcs Number Max concurrent workers
	* dieOnError Boolean (true) Exit main process when a worker has an error
	* dieOnEmpty Boolean (true) Exit main process when there on no workers in the queue or active
	* cache Boolean (true) Save the process id, unique id, path, and error or exit signal for each worker
* <h3>crew.Worker([options])</h3>
	* path String Path to the child script
	* data Object|Array|String|Number|Boolean Data to send to the process
	* exit Function (instance, child, code, signal) "exit" Event handler, invoked when the worker process is exited
	* error Function (error, worker, child) "error" Event handler, invoked when the worker process has an error
	* message Function (message, worker, child) "message" Event Handler, invoked when worker process sends data to the main process
	* args Array<String> Passed straight to node's ChildProcess <a href="http://nodejs.org/api/child_process.html#child_process_child_process_fork_modulepath_args_options">node docs</a>
	* options Object Passed to node's ChildProcess <a href="http://nodejs.org/api/child_process.html#child_process_child_process_fork_modulepath_args_options">node docs</a>

## Pool
```js
	var pool = new crew.Pool();
```
* <h3>Pool#addWorker([options])</h3>
	Options can be any valid arguments for the Worker constructor or a Worker instance. Worker is added to the queue. Returns the Worker instance.
* <h3>Pool#drain()</h3>
	Block workers from being started until the pool is empty
* <h3>Pool#getCache()</h3>
	Returns cache for all completed workers.

## Worker
* <h3>Worker#setPool(pool)</h3>
	Attach the worker to a Pool instance. Pool#addWorker will do the same thing.
* <h3>Worker#kill</h3>
	Kill a workers child process, the worker instance will emit "terminated" when the child process is killed.
	```js
		worker.kill()
		  .on('terminated', function () {
		  	// child process is exited
	 	  })
	```
* <h3>Worker#data(data)</h3>
	* data Object|Array|String|Number|Boolean Set the data that should be initially sent to the workers child process.
* <h3>Worker#send(data)</h3>
	* data Object|Array|String|Number|Boolean Send data to the workers child process.
	If the workers child process is started the data will be sent, otherwise the data will be sent when the child process starts.
	```js
		var worker = new crew.Worker({
			path: './child',
			data: { name: 'Nick' }
		});

		// events
		worker.on('exit', function (worker, process, code, signal) {
			// exit handler
		})
		.on('error', function (err, worker, process) {
			// error handler
		})
		.on('message', function (message, worker, instance) {
			// message handler
		});

		pool.addWorker(worker);
	```
