var ret;
process.on('message', function (message) {
	ret = message;
	setTimeout(function () {
		process.send(ret);
		process.disconnect();
		process.exit(0);
	}, 1000);
});