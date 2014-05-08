var fs = require('fs');
var path = require('path');

var SWITCH_SOURCEDIR = "--sourceDir", SWITCH_DESTINATIONDIR = "--destinationDir", SWITCH_OVERWRITE = "-overwrite";
var EXTENSION_MARKDOWN = /\.md$/;
var WRITE_PERMISSIONS = 0644;

var sourceDir, destinationDir, overwrite;

process.argv.forEach(function(arg) {
	if (arg.indexOf(SWITCH_SOURCEDIR) === 0 && arg.indexOf("=") !== -1) {
		sourceDir = arg.substring(arg.indexOf("=") + 1);
	} else if (arg.indexOf(SWITCH_DESTINATIONDIR) === 0 && arg.indexOf("=") !== -1) {
		destinationDir = arg.substring(arg.indexOf("=") + 1);
	} else if (arg.indexOf(SWITCH_OVERWRITE) === 0) {
		overwrite = true;
	}
});

if (!sourceDir || !destinationDir) {
	console.log("Usage: node markdownProcessor " + SWITCH_SOURCEDIR + "=<sourceDirectory> " + SWITCH_DESTINATIONDIR + "=<destinationDirectory> [" + SWITCH_OVERWRITE + "]");
	process.exit();
}

if (!fs.existsSync(sourceDir)) {
	console.log("Source directory does not exist: " + sourceDir);
	process.exit();	
}

if (!fs.existsSync(destinationDir)) {
	console.log("Destination directory does not exist: " + destinationDir);
	process.exit();	
}

var writeStat = fs.statSync(destinationDir);
var writeBlockSize = writeStat.blksize;
				
var filenames = fs.readdirSync(sourceDir);
filenames.forEach(function(current) {
	if (EXTENSION_MARKDOWN.test(current)) {
		var sourcePath = path.join(sourceDir, current);
		fs.open(sourcePath, "r", null, function(err, readFd) {
			if (readFd) {
				var readStat = fs.fstatSync(readFd);
				var readBlockSize = readStat.blksize;
				var fileSize = readStat.size;
				var buffer = new Buffer(fileSize);
				var totalReadCount = 0;
				do {
					var length = Math.min(readBlockSize, fileSize - totalReadCount);
					var readCount = fs.readSync(readFd, buffer, totalReadCount, length, null);
					if (!readCount) {
						break;
					}
					totalReadCount += readCount;
				} while (totalReadCount < fileSize);
				if (totalReadCount !== fileSize) {
					console.log("Failed to read the full content of file " + sourcePath);
				} else {
					var fileText = buffer.toString("utf8", 0, buffer.length); // TODO use marked to generate HTML

					var destinationPath = path.join(destinationDir, current);
					var writeFlags = overwrite ? "w" : "wx";
					fs.open(destinationPath, writeFlags, WRITE_PERMISSIONS, function(writeErr, writeFd) {
						if (writeFd) {
							var totalWriteCount = 0;
							do {
								length = Math.min(writeBlockSize, buffer.length - totalWriteCount);
								var writeCount = fs.writeSync(writeFd, buffer, totalWriteCount, length, null);
								if (!writeCount) {
									console.log("0-length write, running away" + destinationPath);
									break;
								}
								totalWriteCount += writeCount;
							} while (totalWriteCount < buffer.length);
							if (totalWriteCount !== buffer.length) {
								console.log("Failed to write the full content of file " + destinationPath);
							}
						}
						fs.close(writeFd);
					});
				}
			}
			fs.close(readFd);
		});
	}
});
