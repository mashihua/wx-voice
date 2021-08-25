# wx-voice [![npm](https://img.shields.io/npm/v/wx-voice.svg?colorB=4c1)](https://www.npmjs.com/package/wx-voice)
Convert audio files between Tencent apps (Weixin / Wechat, QQ) and Silk codec with other general formats such as MP3 and M4A  
[中文版](README.cn.md)


## Install
```
$ npm install wx-voice --save
$ npm install wx-voice -g
```


## Prerequisites
- **Ffmpeg**: [Installing ffmpeg](#installing-ffmpeg)
- **Build tools**: [Installing build tools](#installing-build-tools)


## CLI Usage
`wx-voice <command> <options>`
```
Example:
$ wx-voice decode -i input.silk -o output.mp3 -f mp3
$ wx-voice encode -i input.mp3 -o output.silk -f silk
```


## CLI
```
Command:
  decode    decode to general audio format
  encode    encode from general audio format
  compile   compile wx-voice library
  clean     remove compiled library

Options:
  -i <input>    input file path
  -o <output>   output file path
  -f <format>   format of the output file
  --bitrate     bitrate of the output file
  --frequency   frequency of the output file
  --channels    channels of the output file
```


## API Usage
```js
// Initialize
const WxVoice = require('wx-voice');
var voice = new WxVoice();

// Error handler
voice.on("error", (err) => console.log(err));

// Decode silk to MP3
voice.decode(
    "input.silk", "output.mp3", { format: "mp3" },
    (file) => console.log(file));

// Output: "/path/to/output.mp3"
```


## API

### new WxVoice([tempFolder, [ffmpegPath]])
Initialize wxVoice object

| Parameter  | Description |
| ---------- | ----------- |
| tempFolder | Folder of temporary files, default to system temporary   |
| ffmpegPath | Custom path to ffmpeg executables, default using `$PATH` |

### decode(input, output, [options, [callback]])
Decode the audio to general formats

### encode(input, output, [options, [callback]])
Encode the audio to silk/webm format

| Parameter | Description        |
| --------- | ------------------ |
| input     | Input audio path   |
| output    | Output audio path  |
| options   | Output options (JS Object), see [Options](#options) |
| callback  | Callback with `output` as parameter when decode success, `undefined` otherwise |
```js
voice.encode(
    "input.mp3", "output.silk", { format: "silk" },
    (file) => console.log(file));

// Output: "/path/to/output.silk"
```

### duration(filePath, [callback])
Get the duration of the audio file  
*(Decode to general audio format before calling this method)*

| Parameter | Description            |
| --------- | ---------------------- |
| filePath  | File path to the audio |
| callback  | Callback with duration of the audio in second as parameter when decode success, `0` otherwise |
```js
voice.encode("output.mp3", (dur) => console.log(dur));
// Output: "10.290"
```


### Options
Javascript Object to set options for the output file

| Parameter | Description |
| --------- | ----------- |
| format    | Format to be encoded/decoded (silk, webm, mp3, m4a...), default parse from output |
| bitrate   | Bitrate of the output, bps unit  |
| frequency | Frequency of the output, Hz unit |
| channels  | Channels of the output, default to 1 |


## File types
**Decode:** Tested on `mp3`, `m4a`, `wav`, `pcm`  
**Encode:** Tested on `silk`, `silk_amr`, `webm`


## Todo
- Use options as parameter instead of multiple arguments
- Timeout to stop the convert process if it takes too long
- Batch conversion using command line
- Support Windows


---


### Installing build tools

| OS     | Command |
| ------ | ------- |
| Ubuntu | `sudo apt-get install build-essential` |
| CentOS | `sudo yum groupinstall 'Development Tools'` |
| Mac    | Download **XCode** |

### Installing ffmpeg
#### Ubuntu
```
$ sudo add-apt-repository ppa:mc3man/trusty-media  
$ sudo apt-get update  
$ sudo apt-get install ffmpeg
```
#### CentOS
```
$ sudo yum install epel-release
$ sudo yum update
$ sudo rpm --import http://li.nux.ro/download/nux/RPM-GPG-KEY-nux.ro
```
For CentOS 7:
```
$ sudo rpm -Uvh http://li.nux.ro/download/nux/dextop/el7/x86_64/nux-dextop-release-0-5.el7.nux.noarch.rpm
```
For CentOS 6:
```
$ sudo rpm -Uvh http://li.nux.ro/download/nux/dextop/el6/x86_64/nux-dextop-release-0-2.el6.nux.noarch.rpm
```
Install FFMPEG:
```
$ sudo yum install ffmpeg
```
#### Mac
```
$ brew install ffmpeg
```


## License
MIT © [Ang YC](https://angyc.com)