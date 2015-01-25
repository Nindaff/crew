process.on('message', function (m) {
	process.send(m);
	process.disconnect();
	process.exit(0);
});
