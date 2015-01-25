# WorkForce
	WorkForce provides a means to manage child processes on a queue. Create processes, send messages, handle process errors and completion. WorkForce is good for handling
	lots of workers that are meant to complete a task and die, even makes sure that any workers that have errors are disconnected and killed. This is not a good tool for creating a server cluster. WorkForce

# Class: Pool
 	Pool is the blah blah blah
 	```js
 	var pool = new workforce.Pool();
 	```
 	* maxProcs {Number} Max number of concurrent workers at a time (Default: number of cpus)
 	* dieOnError {Boolean} kill the main process if a worker has an error (Default: false)
 	* dieOnEmpty {Boolean} kill the main process when queue and active pool are both empty (Default: true)
 	* cache {Boolean} cache a given Workers process id, unique id (number to each worker), and exit signal or error depending on successfully completion (Default: true)

* ## Pool#addWorker(options)
	See 
