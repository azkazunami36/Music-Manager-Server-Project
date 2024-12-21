import { Express } from "express";
import * as MongoDB from "mongodb";
import * as http from "http";
import mime from "mime";
import path from "path";
import os from "os";

import { getUrlQueries } from "../modules/getUrlQueriesModule.js";

interface CacheData {
    data: Buffer;
    timestamp: number;
    length: number;
    ranges: { start: number, end: number }[];
}

class CacheManager {
    private cache: { [key: string]: CacheData } = {};
    private currentCacheSize = 0;

    constructor() {
        setInterval(this.checkMemoryUsage.bind(this), 60000); // 1分ごとにメモリ状況を確認
    }

    addToCache(filename: string, data: Buffer, length: number, start: number, end: number) {
        this.checkMemoryUsage();
        this.cache[filename] = {
            data,
            timestamp: Date.now(),
            length,
            ranges: [{ start, end }]
        };
        this.currentCacheSize += data.length;
        this.checkMemoryUsage();
    }

    updateCache(filename: string, data: Buffer, start: number, end: number) {
        this.checkMemoryUsage();
        const cachedData = this.cache[filename];
        const newData = Buffer.concat([cachedData.data.slice(0, start), data, cachedData.data.slice(end)]);
        const newRanges = this.mergeRanges(cachedData.ranges, { start, end });
        this.cache[filename] = { data: newData, timestamp: Date.now(), length: cachedData.length, ranges: newRanges };
        this.currentCacheSize += data.length;
        this.checkMemoryUsage();
    }

    getCache(filename: string) {
        return this.cache[filename];
    }

    private mergeRanges(ranges: { start: number, end: number }[], newRange: { start: number, end: number }) {
        const merged = [...ranges, newRange].sort((a, b) => a.start - b.start);
        const result = [];
        let current = merged[0];
        for (let i = 1; i < merged.length; i++) {
            if (current.end >= merged[i].start) {
                current.end = Math.max(current.end, merged[i].end);
            } else {
                result.push(current);
                current = merged[i];
            }
        }
        result.push(current);
        return result;
    }

    private clearCache(amountToClear: number) {
        const sortedCacheKeys = Object.keys(this.cache).sort((a, b) => this.cache[a].timestamp - this.cache[b].timestamp);
        let clearedAmount = 0;
        for (const key of sortedCacheKeys) {
            clearedAmount += this.cache[key].data.length;
            this.currentCacheSize -= this.cache[key].data.length;
            delete this.cache[key];
            if (clearedAmount >= amountToClear) break;
        }
    }

    private checkMemoryUsage() {
        const totalMemory = os.totalmem();
        const freeMemory = os.freemem();
        const usedMemory = totalMemory - freeMemory;
        const usedMemoryPercentage = (usedMemory / totalMemory) * 100;
        console.log("Memory usage: " + usedMemoryPercentage.toFixed(2) + "%",
            "Cache size: " + this.currentCacheSize,
            "freeMemory: " + freeMemory,
            "totalMemory: " + totalMemory,
            "usedMemory: " + usedMemory      
        );

        if (usedMemoryPercentage > 98) {
            this.clearCache(1 * 1024 * 1024 * 1024); // 1GB開放
        }
    }
}

const cacheManager = new CacheManager();

function fileInfoCreate(fileName: string, length: number, req: http.IncomingMessage, res: http.ServerResponse) {
    const headers: http.OutgoingHttpHeaders | http.OutgoingHttpHeader[] = { "Accept-Ranges": "bytes" };

    const contentType = mime.getType(path.extname(fileName).replace(".", ""));
    if (contentType) headers["Content-Type"] = contentType;
    const rawRange = String(req.headers.range).split("-");
    /** 読み込む範囲。使用するもの。 */
    const range = {
        start: Number(rawRange[0]?.replace(/\D/g, "")),
        end: Number(rawRange[1]?.replace(/\D/g, "")) || length
    }
    if (!req.headers.range) range.end = length;
    headers["Content-Length"] = String(length);
    if (req.headers.range) headers["Content-Length"] = String(range.end - range.start);
    if (req.headers.range) headers["Content-Range"] = "bytes " + range.start + "-" + (range.end === 0 ? 0 : range.end - 1) + "/" + length;
    return { headers, range };
}

export function gridFsHTTPGetFileFunc(app: Express, gridfsBucket: MongoDB.GridFSBucket) {
    app.get("*", async (req, res) => {
        const query = getUrlQueries(decodeURIComponent(req.url)) as {
            fileName?: string;
        };
        if (undefined === query.fileName) {
            res.status(404);
            res.end();
            return;
        }
        const filename = encodeURIComponent(query.fileName);

        const cachedData = cacheManager.getCache(filename);
        if (cachedData) {
            const { data, length, ranges } = cachedData;
            const { headers, range } = fileInfoCreate(filename, length, req, res);
            const cachedRange = ranges.find(r => r.start <= range.start && r.end >= range.end);
            if (cachedRange) {
                res.writeHead(req.headers.range ? 206 : 200, headers);
                res.end(data.slice(range.start, range.end));
                return;
            }
        }

        const filter: MongoDB.Filter<MongoDB.GridFSFile> = {};
        filter.filename = filename;
        const result = gridfsBucket.find(filter).limit(1);
        const file = (await result.toArray())[0];
        if (file) {
            const length = file.length;

            const { headers, range } = fileInfoCreate(filename, length, req, res);

            /** ヘッダーに書き込み。 */
            res.writeHead(req.headers.range ? 206 : 200, headers);

            const chunks: Buffer[] = [];
            const readStream = gridfsBucket.openDownloadStream(file._id);
            readStream.start(range.start);
            readStream.end(range.end);
            readStream.on("data", chunk => { chunks.push(chunk); });
            readStream.on("end", () => {
                const data = Buffer.concat(chunks);
                if (cachedData) {
                    cacheManager.updateCache(filename, data, range.start, range.end);
                } else {
                    cacheManager.addToCache(filename, data, length, range.start, range.end);
                }
                res.end(data);
            });
            readStream.on("error", err => { res.status(500).end(); });
        } else {
            res.status(404);
            res.end();
        }
    });
}
