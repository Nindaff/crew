process.on('message', function (message) {
	setTimeout(function () {
		process.send(message);
		process.disconnect();
		process.exit(0);
	}, 1000);

});