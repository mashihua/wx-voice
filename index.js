/*
    [wx-voice]
    Convert audio files between Tencent apps (Weixin / Wechat, QQ) and Silk codec with other general format such as MP3 and M4A
    
    Github: https://github.com/Ang-YC/wx-voice
    Author: AngYC <me@angyc.com>
*/

'use strict';

const EventEmitter = require('events');
const { spawn } = require('child_process');
const Ffmpeg = require('fluent-ffmpeg');
const FfmpegStatic = require('ffmpeg-static');

const os = require('os');
const fs = require('fs');
const path = require('path');
const which = require('which');
const dataUri = require('strong-data-uri');
const readChunk = require('read-chunk');
const randomatic = require('randomatic');

class WxVoice extends EventEmitter {

    constructor(tempDir = os.tmpdir(), ffmpegPath = FfmpegStatic) {
        super();

        this._tempDir    = path.resolve(tempDir);
        this._ffmpegPath = ffmpegPath;

        // Check if dependencies are available
        this._checkDependencies();
    }


    decode(input, output, options, callback) {
        var ext, buffer,
            fileFormat;

        // Make it into absolute path
        input  = path.resolve(input);
        output = path.resolve(output);

        // Set options default to {}
        if (options === undefined) {
            options = {};
        }

        // Set format as extension if undefined
        if (options.format === undefined) {
            ext = path.extname(output);

            if (ext[0] == ".")
                ext = ext.substr(1);

            options.format = ext;
        }

        // Callback after decode is done
        callback = validateFunction(callback);

        // Check if file exists and get file format
        try {
            buffer     = readChunk.sync(input, 0, 4100);
            fileFormat = fileType(buffer);
        } catch (e) {
            this.emit("error", e);
            return callback();
        }


        // Check if file is silk, webm or others
        if (fileFormat && fileFormat.mime == "audio/silk") {

            // Default frequency
            var outputPCM     = (options.format == "pcm"),
                silkFrequency = (outputPCM && options.frequency) ? options.frequency : 24000;

            // Use Silk if it can be decoded
            this._decodeSilk(input, silkFrequency, (tempFile) => {
                input = tempFile || input;
                
                // Output raw PCM directly
                if (outputPCM && tempFile) {
                    copy(tempFile, output, (err) => {
                        this._deleteTempFile(tempFile);
                        callback(err ? undefined : output);
                    });
                
                // Else Continue for other formats
                } else {
                    this._convert(tempFile != undefined, false, input, output, options, (res) => {
                        this._deleteTempFile(tempFile);
                        callback(res);
                    });
                }
            });

        } else {

            // Use WebM output if it is WebM
            this._tryWebM(input, (tempFile) => {
                input = tempFile || input;
                this._convert(false, false, input, output, options, (res) => {
                    this._deleteTempFile(tempFile);
                    callback(res);
                });
            });

        }
    }


    encode(input, output, options, callback) {
        var ext, tempFile;

        // Make it into absolute path
        input  = path.resolve(input);
        output = path.resolve(output);

        // Set options default to {}
        if (options === undefined) {
            options = {};
        }

        // Set format as extension if undefined
        if (options.format === undefined) {
            ext = path.extname(output);

            if (ext[0] == ".")
                ext = ext.substr(1);

            options.format = ext;
        }

        // Callback after encode is done
        callback = validateFunction(callback);

        // Check if file exists
        if (!fs.existsSync(input)) {
            this.emit("error", "Error: ENOENT: no such file or directory, open '" + input + "'");
            return callback();
        }


        if (options.format == "silk" || options.format == "silk_amr") {

            tempFile = this._getTempFile(input + ".pcm");
            this._convert(false, true, input, tempFile, options, (tempOutput) => {
                if (tempOutput) {
                    this._encodeSilk(tempOutput, output, options.format, options.rate || '12000', (res) => {
                        this._deleteTempFile(tempOutput);
                        callback(res);
                    });
                } else {
                    callback();
                }
            });

        } else if (options.format == "webm") {

            tempFile = this._getTempFile(input + ".temp.webm");

            this._convert(false, true, input, tempFile, options, (tempOutput) => {
                if (tempOutput) {
                    this._encodeWebM(tempOutput, output, (res) => {
                        this._deleteTempFile(tempOutput);
                        callback(res);
                    });
                } else {
                    callback();
                }
            });

        } else {
            this.emit("error", new Error(options.format + " is not a valid encode format, only silk, silk_amr and webm allowed"));
            return callback();
        }
    }


    duration(filePath, callback) {
        Ffmpeg.ffprobe(filePath, (err, metadata) => {
            if (err) return callback(0);

            if (metadata && metadata.format) {
                var duration = parseFloat(metadata.format.duration);
                duration = (isNaN(duration)) ? 0 : duration;
            }

            callback(duration);
        });
    }


    _convert(rawInput, rawOutput, input, output, options, callback) {

        var started   = false,
            format    = options.format,
            bitrate   = options.bitrate,
            frequency = options.frequency,
            channels  = options.channels,
            ffmpeg = Ffmpeg(input)
                .on("start", onStart)
                .on("error", onError)
                .on("end", onEnd);

        // Additional parameters for raw
        if (rawInput) {
            ffmpeg = ffmpeg.inputFormat("s16le").inputOptions(["-ar 24000", "-ac 1"]);
        } else if (rawOutput) {
            if (format == "silk" || format == "silk_amr") {
                format = "s16le";
                ffmpeg = ffmpeg.outputOptions(["-ar 24000", "-ac 1"]);
            } else if (format == "webm") {
                ffmpeg = ffmpeg.outputOptions(["-ar 48000", "-ac 1"]).audioCodec("opus");
            }
        }

        // Other settings
        if (bitrate)   { ffmpeg = ffmpeg.audioBitrate(bitrate); }
        if (frequency) { ffmpeg = ffmpeg.audioFrequency(frequency); }
        if (channels)  { ffmpeg = ffmpeg.audioChannels(channels); }

        // Format dependent
        if (format == "m4a") {
            ffmpeg = ffmpeg.audioCodec("aac");
        } else if (format == "pcm") {
            ffmpeg = ffmpeg.format("s16le");
        } else {
            ffmpeg = ffmpeg.format(format);
        }

        // Output
        ffmpeg.noVideo().save(output);

        function onStart(commandLine) {
            started = true;
        }

        function onError(err, stdout, stderr) {
            started = false;
            callback();
        }

        function onEnd(stdout, stderr) {
            if (started) {
                started = false;
                callback(output);
            }
        }
    }


    _decodeSilk(input, frequency, callback) {
        var output  = this._getTempFile(input + ".pcm"),
            decoder = spawn(this._getSilkSDK("decoder"), [input, output, "-Fs_API", frequency]);

        // Allow it to output
        decoder.stdout.on('data', (data) => { });
        decoder.stderr.on('data', (data) => { });

        decoder.on('close', (code) => {
            if (code == 1) { // Error occured
                callback();
            } else {         // Success
                callback(output);
            }
        });
    }


    _encodeSilk(input, output, type, rate, callback) {
        var flag    = (type == "silk_amr" ? "-tencent_amr" : "-tencent"),
            encoder = spawn(this._getSilkSDK("encoder"), [input, output, flag, '-rate, rate]);

        // Allow it to output
        encoder.stdout.on('data', (data) => { });
        encoder.stderr.on('data', (data) => { });

        encoder.on('close', (code) => {
            if (code == 1) { // Error occured
                callback();
            } else {         // Success
                callback(output);
            }
        });
    }


    _tryWebM(input, callback) {
        var output = this._getTempFile(input + ".webm"),
            base64 = "";

        fs.readFile(input, (err, data) => {
            if (err) return callback();

            // Convert to string and check if Data URI is WebM
            base64 = data.toString();
            if (base64.startsWith("data:audio/webm;base64,")) {
                this._parseWebM(base64, output, callback);
            } else {
                callback();
            }
        });
    }


    _parseWebM(base64, output, callback) {
        var buffer;

        // Convert to buffer
        try {
            buffer = dataUri.decode(base64);
        } catch (e) {
            return callback();
        }

        // Write to file
        fs.writeFile(output, buffer, (err) => {
            if (err) return callback();
            callback(output);
        });
    }


    _encodeWebM(input, output, callback) {
        var uri = "";

        fs.readFile(input, (err, data) => {
            if (err) return callback();
            uri = dataUri.encode(data, "audio/webm");

            // Write to file
            fs.writeFile(output, uri, (err) => {
                if (err) return callback();
                callback(output);
            }); 
        });
    }


    _checkDependencies() {
        var silkDecoder  = this._getSilkSDK("decoder"),
            silkEncoder  = this._getSilkSDK("encoder"),
            ffmpegPath   = this._ffmpegPath;

        // Check if Silk SDK is available
        if (!fs.existsSync(silkDecoder) || !fs.existsSync(silkEncoder)) {
            throw new Error("Silk SDK not found, make sure you compiled using command: wx-voice compile");
        }

        if (ffmpegPath && fs.existsSync(ffmpegPath)) {
            this._ffmpegPath = path.resolve(ffmpegPath);
            Ffmpeg.setFfmpegPath(this._ffmpegPath);

        } else if (ffmpegPath = this._getFfmpegPath()) {
            this._ffmpegPath = path.resolve(ffmpegPath);

        } else {
            throw new Error("FFMPEG not found");
        }
    }


    _getSilkSDK(type) {
        return path.resolve(__dirname, "silk", type);
    }


    _getFfmpegPath() {
        // Get FFMPEG Path (Sync version of _getFfmpegPath in fluent-ffmpeg)
        var path;

        // Search in FFMPEG_PATH
        if (process.env.FFMPEG_PATH && fs.existsSync(process.env.FFMPEG_PATH)) {
            path = process.env.FFMPEG_PATH;
        // Search in PATH, return null if not found
        } else {
            path = which.sync("ffmpeg", { nothrow: true });
        }

        // Return undefined
        if (path === null || path === "") path = undefined;
        return path;
    }


    _getTempFile(fileName, noPrefix) {
        var file = path.basename(fileName);

        if (!noPrefix)
            file = randomatic("a0", 16) + "_" + file;

        return path.resolve(this._tempDir, file);
    }


    _deleteTempFile(fileName) {
        if (fileName) {
            fileName = this._getTempFile(fileName, true);
            fs.unlink(fileName, () => {});
        }
    }
}



// Utililities

function fileType(input) {
    const buf = new Uint8Array(input);

    if (!(buf && buf.length > 1)) {
        return null;
    }

    const check = (header) => {
        for (let i = 0; i < header.length; i++) {
            if (header[i] !== buf[i]) {
                return false;
            }
        }

        return true;
    };

    if (check([0x23, 0x21, 0x53, 0x49, 0x4C, 0x4B, 0x0A]) ||                   // Skype V1: #!SILK\n  (https://tools.ietf.org/html/draft-spittka-silk-payload-format-00)
        check([0x23, 0x21, 0x53, 0x49, 0x4C, 0x4B, 0x5F, 0x56, 0x33]) ||       // Skype V3: #!SILK_V3
        check([0x02, 0x23, 0x21, 0x53, 0x49, 0x4C, 0x4B, 0x5F, 0x56, 0x33]) || // Tencent variation: .#!SILK_V3
        check([0x23, 0x21, 0x41, 0x4D, 0x52, 0x0A, 0x02, 0x23, 0x21, 0x53, 0x49, 0x4C, 0x4B, 0x5F, 0x56, 0x33])) { // Tencent AMR variation: #!AMR\n.#!SILK_V3

        return {
            ext: 'sil',
            mime: 'audio/silk'
        };
    }

    return null;
}

function isFunction(f) {
    return (f && typeof f === 'function');
}

function validateFunction(f) {
    return (isFunction(f) ? f : function() { });
}

function copy(source, target, callback) {
    var completed = false;

    var rd = fs.createReadStream(source);
    var wr = fs.createWriteStream(target);

    rd.on("error", done);
    wr.on("error", done);
    wr.on("close", (ex) => { done(); });
    rd.pipe(wr);

    function done(err) {
        if (!completed) {
            completed = true;
            callback(err);
        }
    }
}



module.exports = WxVoice;
