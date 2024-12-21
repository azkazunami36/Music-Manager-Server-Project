import { randomUUID } from "crypto";
import * as MongoDB from "mongodb";
import express from "express";

// interface
import { Session } from "../../interface/Session.js";
import { ClientSession } from "../../interface/ClientSession.js";
import { PlayHistory } from "../../interface/PlayHistory.js";

export class SessionManager {
    sessionData: Session[] = [];
    historyCollection: MongoDB.Collection<MongoDB.BSON.Document>;
    constructor(historyCollection: MongoDB.Collection<MongoDB.BSON.Document>) {
        this.historyCollection = historyCollection;
        setInterval(async () => {
            for (const session of this.sessionData) {
                if (Date.now() - session.lastconnecttime > 15000) {
                    const readIndex = this.sessionData.findIndex(s => s.sessionid === session.sessionid);
                    if (readIndex !== -1) this.sessionData.splice(readIndex, 1);
                    for await (const result of historyCollection.find()) {
                        console.log(result);
                    }
                }
            }
        }, 1000);
    };
    sessionPing(clientSession: ClientSession, req: express.Request) {
        const nowTime = Number(clientSession.nowtime);
        const sessionId = clientSession.sessionid || nowTime + randomUUID();
        req.cookies.sessionid = sessionId;
        const session: Session = this.sessionData.find(session => session.sessionid === sessionId) || {
            sessionid: sessionId,
            playtime: 0,
            lastconnecttime: nowTime
        };
        const historyCollection = this.historyCollection;
        function addHistory() {
            const playHistory: PlayHistory = {};
            playHistory.sessionid = sessionId;
            const date = new Date(nowTime);
            playHistory.year = date.getFullYear();
            playHistory.month = date.getMonth();
            playHistory.day = (date.getDate() + 1);
            playHistory.hour = date.getHours();
            playHistory.miniute = date.getMinutes();
            playHistory.seconds = date.getSeconds();
            playHistory.albumuuid = session.albumuuid;
            playHistory.artistuuid = session.artistuuid;
            playHistory.musicuuid = session.musicuuid;
            playHistory.playlistuuid = session.playlistuuid;
            playHistory.playtime = session.playtime;
            playHistory.playlength = Number(clientSession.oldplaytime || clientSession.playtime) - session.playtime;
            historyCollection.insertOne(playHistory).then(() => { }).catch(e => { console.log(e); });
        }
        function resetSession() {
            session.playtime = Number(clientSession.playtime);
            session.albumuuid = clientSession.albumuuid;
            session.artistuuid = clientSession.artistuuid;
            session.musicuuid = clientSession.musicuuid;
            session.playlistuuid = clientSession.playlistuuid;
        }
        let historyAddIs = false;

        if (
            session.albumuuid !== clientSession.albumuuid // アルバムが違っている
            || session.artistuuid !== clientSession.artistuuid // アーティストが違っている
            || session.musicuuid !== clientSession.musicuuid // 曲が違っている
            || session.playlistuuid !== clientSession.playlistuuid // プレイリストが違っている
            || session.playtime + nowTime - session.lastconnecttime - 5000 < Number(clientSession.playtime) // 今の再生時間がサーバー記録より５秒以上早い
            || session.playtime + nowTime - session.lastconnecttime + 5000 > Number(clientSession.playtime) // 今の再生時間がサーバー記録より５秒以上遅い
        ) historyAddIs = true;

        switch (clientSession.operating) { // セッションPingのステータスチェック
            case "seek":
            case "pause":
            case "repeat":
            case "change": {
                historyAddIs = true;
                break;
            }
        }
        if (historyAddIs) { // 再生履歴に追加する条件に一致した場合
            if (session.musicuuid !== undefined) addHistory(); // 再生中であれば追加
            resetSession(); // セッションを上書きする
        }
        session.lastconnecttime = nowTime;
        const readIndex = this.sessionData.findIndex(session => session.sessionid === sessionId);
        if (readIndex === -1) this.sessionData.push(session);
        else this.sessionData[readIndex] = session;
    }
}
