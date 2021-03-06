'use strict';

var assign = require('lodash.assign');
var browserify = require('browserify');
var buffer = require('vinyl-buffer');
var gulp = require('gulp');
var gutil = require('gutil');
var jest = require('jest-cli');
var notify = require('gulp-notify');
var open = require('open');
var source = require('vinyl-source-stream');
var watchify = require('watchify');
var webserver = require('gulp-webserver');

require('harmonize')();

var config = {
    dest: 'public',
    browserify: {
        entries: 'js/index.js',
        debug: true,
        transform: 'babelify',
    },
    script: {
        path: 'js',
        main: 'js/script.js',
    },
    test: {
        path: '__tests__',
    },
};

var _bundle = function(b) {
    return b.bundle()
        .on('error', notify.onError('[SCRIPT] <%= error.message %>'))
        .pipe(source('js/script.js'))
        .pipe(buffer())
        .pipe(gulp.dest(config.dest))
        .pipe(notify('[SCRIPT] Generated script: <%= file.relative %> '))
        ;
};
gulp.task('script', function() {
    var b = browserify(config.browserify);
    return _bundle(b);
});

gulp.task('test', function(callback) {
    var _write = process.stdout.write;
    var output = '';
    process.stdout.write = function(str) {
        if (str && str.match(/^{.*}$/)) {
            output += str;
        } else {
            _write.apply(this, arguments);
        }
    };

    jest.runCLI({ json: true, }, __dirname, function(success) {
        process.stdout.write = _write;

        var data;
        try {
            data = JSON.parse(output);
        } catch (e) {
            notify.onError('<%= error.message %>').call(new Buffer(''), e);
            return callback();
        }

        var endTime = data.testResults
            .map(r => r.endTime)
            .reduce(Math.max.bind(Math));
        var time = (endTime - data.startTime) / 1000;

        var result = `${data.numPassedTests} test passed (${data.numTotalTests} total in ${data.numTotalTestSuites}, run time ${time}s)`;
        if (data.numFailedTests) result = `${data.numFailedTests} test failed, ${result}`;
        result = `[TEST] ${result}`;

        var logLevel = notify.logLevel();
        notify.logLevel(0);
        if (success) {
            notify('<%= file.message %>', { onLast: false})
                ._transform({ message: result }, null, () => callback);
        } else {
            data.testResults
                .filter(r => !r.success)
                .map(r => r.message)
                .forEach(function (message) {
                    var _message = message.replace(/\u001b\[[0-9]*m/g, '').substr(0, 1000);
                    notify.onError('<%= error.message %>', function() {}).call(new Buffer(''), new Error(_message));
                });

            notify.onError('<%= error.message %>', function() {}).call(new Buffer(''), new Error(result));
        }
        notify.logLevel(logLevel);

        return callback();
    });
});

var options = assign({}, watchify.args, config.browserify);
var b = watchify(browserify(options));
var bundle = function() {
    return _bundle(b);
};
b.on('update', bundle);
b.on('log', gutil.log);
gulp.task('watch:script', bundle);

gulp.task('watch:test', ['test'], function() {
    return gulp.watch('js/**/*', ['test']);
});
gulp.task('watch', ['watch:script', 'watch:test']);

gulp.task('server', function() {
    gulp.src(config.dest)
        .pipe(webserver({
            livereload: true,
            open: false,
        }));
});
gulp.task('open', function() {
    open('http://localhost:8000/');
});

gulp.task('tdd', ['server', 'watch']);
gulp.task('tdd-open', ['tdd', 'open']);

gulp.task('default', ['script', 'test']);
