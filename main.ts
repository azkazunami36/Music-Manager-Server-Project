// node_modules
import express from "express";
import MongoDB, { MongoClient } from "mongodb";
import { pipeline } from "stream/promises";
import path from "path";
import FFmpeg from "fluent-ffmpeg";
import dotenv from "dotenv";
import fs from "fs";
import { exec } from "child_process";
import { randomUUID } from "crypto";

// module
import cerfSetAndListen from "./modules/cerfSetAndListen.js";
import { getUrlQueries } from "./modules/getUrlQueriesModule.js";

// interface
import { POSTData } from "./interface/POSTData.js";
import { ClientSession } from "./interface/ClientSession.js";
import { FileInfo } from "./interface/FileInfo.js";
import { FileInfoStream } from "./interface/FileInfoStream.js";
import { MusicInfo } from "./interface/MusicInfo.js";

// class
import { SessionManager } from "./class/SessionManager/SessionManagerMain.js";

// function
import { gridFsHTTPGetFileFunc } from "./function/gridFsHTTPGetFileFunc.js";

// .envファイルの読み込み
dotenv.config();

// サーバーの設定
const app = express();

// データベース接続設定
const databaseName = "musicManager";
const username = encodeURIComponent("admin");
const password = encodeURIComponent(process.env.MongoDBPassword || "");
const clusterUrl = "localhost:27017";
const authMechanism = "DEFAULT";
const uri = "mongodb://" + username + ":" + password + "@" + clusterUrl + "/?authMechanism=" + authMechanism;

// データベース接続
const client = new MongoClient(uri);
const db = client.db(databaseName);

// コレクションの取得
const musicCollection = db.collection("music");
const fileCollection = db.collection("file");
const artistCollection = db.collection("artist");
const albumCollection = db.collection("album");
const playlistCollection = db.collection("playlist");
const historyCollection = db.collection("history");

// GridFSの設定
const gridfsBucket = new MongoDB.GridFSBucket(db);

// サーバーの設定
cerfSetAndListen(app, "/etc/nginx/keyData");

// セッション管理の設定
const sessionManager = new SessionManager(historyCollection);

// GridFSからファイルを取得する関数の設定
gridFsHTTPGetFileFunc(app, gridfsBucket);

// ルーティング
app.post("*", async (req, res) => {
    const query = getUrlQueries(decodeURIComponent(req.url)) as POSTData;
    console.log(query);
    let stoped = false;
    function stop404() {
        if (stoped) return;
        res.status(404);
        res.end();
        stoped = true;
    };

    /**
     * ファイル名の重複を避けるための関数
     * 既存のファイル名がある場合、数字を付加して新しいファイル名を生成する
     * @param fileName 元のファイル名
     * @returns 重複を避けた新しいファイル名
     */
    async function AutomaticDuplicateAvoidance(fileName: string) {
        let counter = 2;
        let uniquePath = fileName;
        const ext = path.extname(fileName);
        const baseName = path.basename(fileName, ext);

        async function exist(fileName: string) {
            const filter: MongoDB.Filter<MongoDB.GridFSFile> = {};
            filter.filename = fileName;
            const result = gridfsBucket.find(filter).limit(1);
            const file = (await result.toArray())[0];
            return file === undefined ? false : true;
        }
        while (await exist(uniquePath)) {
            uniquePath = baseName + "-" + counter + ext;
            counter++;
        }
        return uniquePath;
    }

    /**
     * GridFSから指定されたファイル名のファイルを削除する
     * @param filename 削除するファイル名
     */
    async function DuplicateRemoval(filename: string) {
        const filter: MongoDB.Filter<MongoDB.GridFSFile> = {};
        filter.filename = filename;
        const result = gridfsBucket.find(filter);
        const files = (await result.toArray());
        for (const file of files) await gridfsBucket.delete(file._id);
    }
    switch (query.type) {
        case "albumDelete": {
            if (undefined === query.albumuuid) { stop404(); break; };
            await albumCollection.deleteOne({ albumuuid: query.albumuuid });
            res.status(200);
            res.end();
            break;
        };
        case "albumInfo": {
            if (undefined === query.albumuuid) { stop404(); break; };
            break;
        };
        case "albumInfoEdit": {
            if (undefined === query.albumuuid) { stop404(); break; };
            if (undefined === query.editdata) { stop404(); break; };
            break;
        };
        case "albumList": {
            break;
        };
        case "albumSearch": {
            if (undefined === query.albumname) { stop404(); break; };
            break;
        };
        case "artistDelete": {
            if (undefined === query.albumuuid) { stop404(); break; };
            break;
        };
        case "artistInfo": {
            if (undefined === query.artistuuid) { stop404(); break; };
            break;
        };
        case "artistInfoEdit": {
            if (undefined === query.albumuuid) { stop404(); break; };
            if (undefined === query.editdata) { stop404(); break; };
            break;
        };
        case "artistList": {
            break;
        };
        case "artistSearch": {
            if (undefined === query.artistname) { stop404(); break; };
            break;
        };
        case "fileDelete": {
            if (undefined === query.fileName) { stop404(); break; };
            const filename = encodeURIComponent(query.fileName);
            const fileInfo: FileInfo = {};
            fileInfo.filename = filename;
            const result = fileCollection.find(fileInfo) as MongoDB.FindCursor<MongoDB.WithId<FileInfo>>;
            for await (const fileData of result) {
                if (fileData.originalfilename) await DuplicateRemoval(fileData.originalfilename);
                if (fileData.streams) for (const stream of fileData.streams) {
                    if (stream.originalfilename) await DuplicateRemoval(stream.originalfilename);
                    if (stream.aacfilename) await DuplicateRemoval(stream.aacfilename);
                    if (stream.flacfilename) await DuplicateRemoval(stream.flacfilename);
                }
                fileCollection.deleteOne(fileData);
            };
            res.status(200);
            res.end();
            break;
        };
        case "fileList": {
            const documents = await fileCollection.find({}, { projection: { _id: 0, filename: 1 } }).toArray();
            const filenameArray = documents.map(doc => { return decodeURIComponent(doc.filename) });
            res.status(200);
            res.contentType("text/plain");
            res.write(JSON.stringify(filenameArray));
            res.end();
            break;
        };
        case "filePracticalInfo": {
            if (undefined === query.fileName) { stop404(); break; };
            const filter: MongoDB.Filter<MongoDB.GridFSFile> = {};
            const filename = encodeURIComponent(query.fileName);
            filter.filename = filename;
            const result = gridfsBucket.find(filter).limit(1);
            const file = (await result.toArray())[0];
            if (file) {
                res.status(200);
                res.end(JSON.stringify(file));
            } else { stop404(); break; };
            break;
        }
        case "fileUpload": {
            if (undefined === query.fileName) { stop404(); break; };
            const filename = encodeURIComponent(query.fileName);
            const fileInfo: FileInfo = {};
            fileInfo.filename = filename;

            const originalFileName = Date.now() + randomUUID();
            await DuplicateRemoval(filename);

            /**
             * アップロードされたファイルのエラー時のクリーンアップ処理
             * @param deleteFileNames 削除対象のファイル名の配列
             */
            function errorHandling(deleteFileNames: (string | undefined)[]) {
                res.status(500);
                res.end();
                for (const fn of deleteFileNames) {
                    if (!fn) continue;
                    try {
                        if (fs.existsSync("./temp/" + fn)) fs.rmSync("./temp/" + fn);
                    } catch (e) { }
                }
            }
            try { await pipeline(req, fs.createWriteStream("./temp/" + originalFileName)); }
            catch (e) {
                console.log("Original File Get Error.");
                console.log(e);
                errorHandling([originalFileName]);
                break;
            }
            fileInfo.originalfilename = await AutomaticDuplicateAvoidance(filename);
            try { await pipeline(fs.createReadStream("./temp/" + originalFileName), gridfsBucket.openUploadStream(fileInfo.originalfilename)); }
            catch (e) {
                console.log("Save Stream Error.");
                console.log(e);
                errorHandling([originalFileName]);
                break;
            }
            res.status(200);

            // FFmpegを使用してメディアファイルの情報を取得
            let ffmpegInfos: FFmpeg.FfprobeStream[] | undefined;
            try {
                const ffmpeg = FFmpeg();
                ffmpeg.addInput("./temp/" + originalFileName);
                const ffprobeData = await new Promise<FFmpeg.FfprobeData>((resolve, reject) => { ffmpeg.ffprobe((err, data) => { if (err) reject(err); else resolve(data); }); });
                ffmpegInfos = ffprobeData.streams;
            } catch (e) {
                console.log("FFprode Error.", e);
            }
            if (ffmpegInfos) {
                fileInfo.streams = [];
                fileInfo.ffmpeginfo = ffmpegInfos;
                fileInfo.ffmpegdetection = "yes";
                await new Promise<void>(async (resolve, reject) => {
                    exec("ffmpeg -hide_banner -i ./temp/" + originalFileName + " -f ffmetadata  ./temp/" + originalFileName + ".txt", (err, stdout, stderr) => {
                        if (err) reject(err);
                        resolve();
                    });
                });
                // FFmpegのメタデータ解析処理
                // メタデータをグローバルとセクション別に分類
                const ffmpegMetadataText = String(fs.readFileSync("./temp/" + originalFileName + ".txt")).split("\n");
                fs.rmSync("./temp/" + originalFileName + ".txt");
                for (let i = ffmpegMetadataText.length - 1; i >= 0; i--) {
                    const text = ffmpegMetadataText[i];
                    if (text[0] === ";" || text[0] === "#") ffmpegMetadataText.splice(i, 1);
                }
                const global: { [name: string]: string } = {};
                const sections: { [name: string]: string }[] = [];
                for (const text of ffmpegMetadataText) {
                    if (text.includes("[") && text[text.length - 1].includes("]")) {
                        sections.push({});
                    } else if (text.includes("=")) {
                        const splited = text.split("=");
                        let correction: string[] = [];
                        let slashIs = false;
                        for (const splitstr of splited) {
                            if (slashIs) {
                                correction[correction.length - 1] += splitstr;
                                slashIs = false;
                            }
                            else {
                                if (splitstr[splitstr.length - 1] === "\\") slashIs = true;
                                correction.push(splitstr);
                            }
                        }
                        if (sections.length === 0) global[correction[0]] = correction[1].replaceAll("\\\\", "\\").replaceAll("\\=", "=").replaceAll("\\;", ";").replaceAll("\\#", "#");
                        else sections[sections.length - 1][correction[0]] = correction[1].replaceAll("\\\\", "\\").replaceAll("\\=", "=").replaceAll("\\;", ";").replaceAll("\\#", "#");
                    }
                }
                fileInfo.ffmpegmetadata = global;
                if (sections.length !== 0) fileInfo.ffmpegsectionmetadata = sections;

                // 各ストリームの処理
                // 音声ストリームの場合はFLACとAACに変換
                for (let i = 0; i < ffmpegInfos.length; i++) {
                    const fileinfostream: FileInfoStream = {};
                    const streamFileName = originalFileName + i + ".mkv";
                    await new Promise<void>(async (resolve, reject) => {
                        exec("ffmpeg -i ./temp/" + originalFileName + " -map 0:" + i + " -c copy ./temp/" + streamFileName, (err, stdout, stderr) => {
                            if (err) reject(err);
                            resolve();
                        });
                    });
                    let localFlacFilename, localAacFilename;
                    // 音声ストリームの変換処理
                    if (ffmpegInfos[i].codec_type === "audio") {
                        // FLACまたはAACに変換する関数
                        async function convert(codec: "flac" | "aac", extension: string) {
                            const convertFileName = streamFileName + codec + "." + extension;
                            await new Promise<void>(async (resolve, reject) => {
                                exec("ffmpeg -i ./temp/" + streamFileName + " -c:a " + (codec === "flac" ? "flac" : "aac -ar 44100 -b:a 128k") + " ./temp/" + convertFileName, (err, stdout, stderr) => {
                                    if (err) reject(err);
                                    resolve();
                                });
                            });
                            await new Promise<void>(async (resolve, reject) => {
                                const filter: MongoDB.Filter<MongoDB.GridFSFile> = {};
                                filter.filename = filename + "-" + codec + "." + extension;
                                await DuplicateRemoval(filter.filename);
                                try { await pipeline(fs.createReadStream("./temp/" + convertFileName), gridfsBucket.openUploadStream(filter.filename)); resolve(); }
                                catch (e) { reject(e); }
                            });
                            return convertFileName;
                        };
                        localFlacFilename = await convert("flac", "flac");
                        localAacFilename = await convert("aac", "m4a");
                    }
                    fileinfostream.originalfilename = await AutomaticDuplicateAvoidance(filename);
                    try { await pipeline(fs.createReadStream("./temp/" + streamFileName), gridfsBucket.openUploadStream(fileinfostream.originalfilename)); }
                    catch (e) {
                        console.log("Save Stream Error.");
                        console.log(e);
                        errorHandling([originalFileName, streamFileName, localFlacFilename, localAacFilename]);
                        break;
                    }
                    if (fs.existsSync("./temp/" + streamFileName)) fs.rmSync("./temp/" + streamFileName);
                    if (localFlacFilename) {
                        fileinfostream.flacfilename = await AutomaticDuplicateAvoidance(filename + "flac.flac");
                        try { await pipeline(fs.createReadStream("./temp/" + localFlacFilename), gridfsBucket.openUploadStream(fileinfostream.flacfilename)); } catch (e) {
                            console.log("Save Stream Error.");
                            console.log(e);
                            errorHandling([originalFileName, streamFileName, localFlacFilename, localAacFilename]);
                            break;
                        }
                        if (fs.existsSync("./temp/" + localFlacFilename)) fs.rmSync("./temp/" + localFlacFilename);
                    }
                    if (localAacFilename) {
                        fileinfostream.aacfilename = await AutomaticDuplicateAvoidance(filename + "aac.m4a");
                        try { await pipeline(fs.createReadStream("./temp/" + localAacFilename), gridfsBucket.openUploadStream(fileinfostream.aacfilename)); }
                        catch (e) {
                            console.log("Save Stream Error.");
                            console.log(e);
                            errorHandling([originalFileName, streamFileName, localFlacFilename, localAacFilename]);
                            break;
                        }
                        if (fs.existsSync("./temp/" + localAacFilename)) fs.rmSync("./temp/" + localAacFilename);
                    }
                    fileInfo.streams.push(fileinfostream);
                }
                if (fs.existsSync("./temp/" + originalFileName)) fs.rmSync("./temp/" + originalFileName);
                for await (const file of fileCollection.find({ filename: filename })) { fileCollection.deleteOne({ _id: file._id }); };
                await fileCollection.insertOne(fileInfo);
            } else {
                const fileInfo: FileInfo = {};
                fileInfo.filename = filename;
                fileInfo.ffmpegdetection = "no";
                try { await pipeline(fs.createReadStream("./temp/" + originalFileName), gridfsBucket.openUploadStream(filename)); }
                catch (e) { console.log("Save Stream Error."); throw e; }

                fs.rmSync("./temp/" + originalFileName);

                for await (const file of fileCollection.find({ filename: filename })) { fileCollection.deleteOne({ _id: file._id }); };
                await fileCollection.insertOne(fileInfo);
            }

            res.end();
            break;
        };
        case "fileInfo": {
            if (undefined === query.fileName) { stop404(); break; };
            const fileInfo: FileInfo = {};
            const filename = encodeURIComponent(query.fileName)
            fileInfo.filename = filename;
            const result = fileCollection.find(fileInfo).limit(1);
            const file = (await result.toArray())[0] as FileInfo | undefined;
            if (file) {
                res.status(200);
                res.end(JSON.stringify(file));
            } else { stop404(); break; };
        };
        case "musicDelete": {
            if (undefined === query.musicuuid) { stop404(); break; };
            const musicInfo: MusicInfo = {};
            musicInfo.musicuuid = query.musicuuid;
            await musicCollection.deleteOne(musicInfo);
            res.status(200);
            res.end();
            break;
        };
        case "musicInfo": {
            if (undefined === query.musicuuid) { stop404(); break; };
            const musicInfo: MusicInfo = {};
            musicInfo.musicuuid = query.musicuuid;
            const result = musicCollection.find(musicInfo).limit(1);
            const info = (await result.toArray())[0] as MusicInfo | undefined;
            console.log(info)
            if (info) {
                res.status(200);
                res.end(JSON.stringify(info));
            } else { stop404(); break; };
            break;
        };
        case "musicInfoCreate": {
            if (undefined === query.editdata) { stop404(); break; };
            const json = JSON.parse(query.editdata) as MusicInfo;
            json.musicuuid = Date.now() + randomUUID();
            await musicCollection.insertOne(json);
            res.status(200);
            res.end();
            break;
        }
        case "musicInfoEdit": {
            if (undefined === query.musicuuid) { stop404(); break; };
            if (undefined === query.editdata) { stop404(); break; };
            const musicInfo: MusicInfo = {};
            musicInfo.musicuuid = query.musicuuid;
            const json = JSON.parse(query.editdata) as MusicInfo;
            if (musicInfo.musicuuid !== query.musicuuid) { stop404(); break; };
            await musicCollection.updateOne(musicInfo, json);
            break;
        };
        case "musicList": {
            const documents = await musicCollection.find({}, { projection: { _id: 0, musicuuid: 1 } }).toArray();
            const musicuuidArray = documents.map(doc => { return decodeURIComponent(doc.musicuuid) });
            res.status(200);
            res.contentType("text/plain");
            res.write(JSON.stringify(musicuuidArray));
            res.end();
            break;
        };
        case "musicSearch": {
            if (undefined === query.musicname) { stop404(); break; };
            const searchResults = await musicCollection.find({
                name: { $regex: query.musicname, $options: 'i' }
            }).toArray();
            res.status(200);
            res.contentType("application/json");
            res.write(JSON.stringify(searchResults));
            res.end();
            break;
        };
        case "playHistory": {
            if (undefined === query.year) { };
            if (undefined === query.month) { };
            if (undefined === query.day) { };
            if (undefined === query.hour) { };
            if (undefined === query.miniute) { };
            if (undefined === query.seconds) { };
            break;
        };
        case "playList": {
            break;
        };
        case "playlistDelete": {
            if (undefined === query.playlistuuid) { stop404(); break; };
            break;
        };
        case "playlistInfo": {
            if (undefined === query.playlistuuid) { stop404(); break; };
            break;
        };
        case "playlistInfoEdit": {
            if (undefined === query.playlistuuid) { stop404(); break; };
            break;
        };
        case "playlistSearch": {
            if (undefined === query.playlistuuid) { stop404(); break; };
            break;
        };
        case "sessionPing": {
            if (undefined === query.nowtime) { stop404(); break; };
            if (undefined === query.playstatus) { stop404(); break; };
            if (undefined === query.playtime) { stop404(); break; };
            if (undefined === query.operating) { stop404(); break; };
            // セッション情報の更新と再生状態の追跡
            const clientSession: ClientSession = {
                sessionid: req.cookies.sessionid,
                albumuuid: query.albumuuid,
                artistuuid: query.artistuuid,
                musicuuid: query.musicuuid,
                playlistuuid: query.playlistuuid,
                nowtime: query.nowtime,
                operating: query.operating,
                playstatus: query.playstatus,
                playtime: query.playtime,
                oldplaytime: query.oldplaytime
            };
            sessionManager.sessionPing(clientSession, req);
            res.status(200);
            res.end();
            break;
        };
        default: {
            res.status(404);
            res.end();
            break;
        };
    };
});
